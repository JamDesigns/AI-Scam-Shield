import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const source = locale => JSON.parse(read(`docs/legal/content/${locale}.json`));
const appLocales = [...new Set([...read('app/lib/i18n/app_localizations.dart').matchAll(/Locale\('([a-z]{2})'/g)].map(match => match[1]))].sort();
const htmlEscape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

test('legal sources and bundled privacy files cover exactly the app languages', () => {
  assert.equal(appLocales.length, 25);
  const fileLocales = (directory, expression) => fs.readdirSync(path.join(root, directory)).flatMap(name => {
    const match = expression.exec(name);
    return match ? [match[1]] : [];
  }).sort();
  assert.deepEqual(fileLocales('docs/legal/content', /^([a-z]{2})\.json$/), appLocales);
  assert.deepEqual(fileLocales('app/assets/legal', /^privacy-policy\.([a-z]{2})\.md$/), appLocales);
  assert.deepEqual(fileLocales('docs/legal', /^privacy-policy\.([a-z]{2})\.html$/), appLocales);
  assert.deepEqual(fileLocales('docs/legal', /^terms-of-service\.([a-z]{2})\.html$/), appLocales);
});

test('every translated paragraph is present in public HTML and in-app privacy', () => {
  const canonical = source('en');
  for (const locale of appLocales) {
    const content = source(locale);
    const markdown = read(`app/assets/legal/privacy-policy.${locale}.md`);
    for (const [kind, name] of [['privacy', 'privacy-policy'], ['terms', 'terms-of-service']]) {
      const document = content[kind];
      const html = read(`docs/legal/${name}.${locale}.html`);
      assert.ok(html.includes(`<html lang="${locale === 'en' ? 'en-GB' : locale}">`), `${locale}: html language`);
      assert.equal(document.sections.length, 8);
      const prose = [document.title, document.intro, ...document.sections.flatMap(section => [section.title, ...section.paragraphs, ...(section.items ?? [])])];
      for (const text of prose) {
        assert.ok(html.includes(htmlEscape(text)), `${locale}/${name}: omitted HTML text`);
        if (kind === 'privacy') assert.ok(markdown.includes(text), `${locale}: omitted in-app text`);
      }
      if (locale !== 'en') {
        assert.notEqual(document.intro, canonical[kind].intro, `${locale}: English fallback`);
        document.sections.forEach((section, index) => section.paragraphs.forEach((paragraph, paragraphIndex) => {
          assert.notEqual(paragraph, canonical[kind].sections[index].paragraphs[paragraphIndex], `${locale}/${section.id}: untranslated paragraph`);
        }));
      }
      const languageLinks = [...html.matchAll(new RegExp(`href="${name}\\.([a-z]{2})\\.html" lang=`, 'g'))].map(match => match[1]).sort();
      assert.deepEqual(languageLinks, appLocales, `${locale}/${name}: incomplete language navigation`);
    }
  }
});

test('public links and local styles/scripts resolve without missing files', () => {
  const files = ['docs/index.html', 'docs/privacy-policy.html', 'docs/terms-of-service.html', ...appLocales.flatMap(locale => [`docs/legal/privacy-policy.${locale}.html`, `docs/legal/terms-of-service.${locale}.html`])];
  for (const file of files) {
    for (const match of read(file).matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1];
      if (/^(?:mailto:|https?:|#)/.test(target)) continue;
      const resolved = path.resolve(root, path.dirname(file), target);
      assert.ok(resolved.startsWith(root + path.sep), `Link escaped repo: ${target}`);
      assert.ok(fs.existsSync(resolved), `Missing link from ${file}: ${target}`);
    }
  }
});

test('browser routing honours explicit app language and regional browser locales', () => {
  const code = read('docs/legal/locale-router.js');
  function redirect(documentName, languages, search = '') {
    let destination = null;
    vm.runInNewContext(code, {
      URLSearchParams,
      document: { currentScript: { getAttribute: () => documentName } },
      navigator: { languages, language: languages?.[0] },
      window: { location: { search, replace: url => { destination = url; } } },
    }, { timeout: 100 });
    return destination;
  }
  for (const documentName of ['privacy-policy', 'terms-of-service']) {
    for (const locale of appLocales) {
      assert.equal(redirect(documentName, [`${locale}-XX`]), `legal/${documentName}.${locale}.html`);
      assert.equal(redirect(documentName, ['es-ES'], `?lang=${locale}`), `legal/${documentName}.${locale}.html`);
    }
    assert.equal(redirect(documentName, ['ja-JP', 'mt-MT']), `legal/${documentName}.mt.html`);
    assert.equal(redirect(documentName, ['ja-JP']), `legal/${documentName}.en.html`);
    assert.equal(redirect(documentName, [], '?lang=ga_IE'), `legal/${documentName}.ga.html`);
    assert.equal(redirect(documentName, ['pl-PL'], '?lang=../../evil'), `legal/${documentName}.pl.html`);
    assert.equal(redirect(documentName, undefined), `legal/${documentName}.en.html`);
  }
  assert.equal(redirect('../../evil', ['es-ES']), null);
});
