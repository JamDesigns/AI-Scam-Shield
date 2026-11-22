import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('external deletion resource covers every supported locale and ownership guidance', () => {
  const html = fs.readFileSync(new URL('./delete-account.html', import.meta.url), 'utf8');
  const locales = fs.readdirSync(new URL('../app/assets/i18n/', import.meta.url))
    .filter(n => /^[a-z]{2}\.json$/.test(n)).map(n => n.slice(0, 2));
  for (const locale of locales) assert.ok(html.includes(`data-locale="${locale}"`));
  assert.equal((html.match(/data-locale=/g) || []).length, locales.length);
  assert.ok(html.includes('mailto:'));
  assert.ok(html.includes('verify ownership'));
  assert.ok(html.includes('not automatically cancelled'));
  assert.ok(html.includes('backup copies'));
});

test('language routing selects the phone language and safely falls back', () => {
  const source = fs.readFileSync(new URL('./delete-account.js', import.meta.url), 'utf8');
  for (const [search, language, expected] of [['', 'es-ES', 'es'], ['?lang=mt', 'es', 'mt'], ['?lang=zz', 'es', 'en']]) {
    const picker = { value: '', addEventListener() {} };
    const sections = ['en', 'es', 'mt'].map(locale => ({ dataset: { locale }, hidden: false }));
    const document = { getElementById: () => picker, querySelectorAll: () => sections, documentElement: {} };
    vm.runInNewContext(source, { document, navigator: { language }, location: { search }, URLSearchParams });
    assert.equal(picker.value, expected);
    assert.deepEqual(sections.filter(s => !s.hidden).map(s => s.dataset.locale), [expected]);
  }
});
