import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'ga', 'hr', 'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'];
const checkOnly = process.argv.includes('--check');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const config = read('docs/legal/config.json');
if (!/^\d{4}-\d{2}-\d{2}$/.test(config.updatedOn) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)) throw new Error('Invalid public legal configuration');
const canonical = read('docs/legal/content/en.json');

function compareShape(reference, candidate, field) {
  if (typeof reference === 'string') {
    if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(`Missing legal translation: ${field}`);
    if (field.endsWith('.id') && candidate !== reference) throw new Error(`Changed section ID: ${field}`);
    return;
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(candidate) || candidate.length !== reference.length) throw new Error(`Incomplete legal translation: ${field}`);
    reference.forEach((value, index) => compareShape(value, candidate[index], `${field}.${index}`));
    return;
  }
  if (!candidate || typeof candidate !== 'object' || Object.keys(reference).sort().join('|') !== Object.keys(candidate).sort().join('|')) throw new Error(`Changed legal schema: ${field}`);
  Object.keys(reference).forEach(key => compareShape(reference[key], candidate[key], `${field}.${key}`));
}

const sourceNames = fs.readdirSync(path.join(root, 'docs/legal/content')).filter(name => name.endsWith('.json')).sort();
if (sourceNames.join('|') !== locales.map(locale => `${locale}.json`).sort().join('|')) throw new Error('Legal translation files do not match the 25 supported locales');
const translations = locales.map(locale => {
  const content = read(`docs/legal/content/${locale}.json`);
  compareShape(canonical, content, locale);
  if (content.locale !== locale || content.htmlLang !== (locale === 'en' ? 'en-GB' : locale)) throw new Error(`Incorrect language metadata: ${locale}`);
  return content;
});
const html = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const kinds = { privacy: 'privacy-policy', terms: 'terms-of-service' };
const outputs = new Map();

function languageLinks(kind, prefix = '') {
  return translations.map(content => `<li><a href="${prefix}${kinds[kind]}.${content.locale}.html" lang="${content.htmlLang}" hreflang="${content.htmlLang}">${html(content.languageName)}</a></li>`).join('\n');
}

function renderDocument(content, kind) {
  const document = content[kind];
  const other = kind === 'privacy' ? 'terms' : 'privacy';
  const alternates = translations.map(language => `  <link rel="alternate" hreflang="${language.htmlLang}" href="${kinds[kind]}.${language.locale}.html">`).join('\n');
  const sections = document.sections.map(section => `    <section aria-labelledby="${section.id}">\n      <h2 id="${section.id}">${html(section.title)}</h2>\n${section.paragraphs.map(paragraph => `      <p>${html(paragraph)}</p>`).join('\n')}${section.items ? `\n      <ul>\n${section.items.map(item => `        <li>${html(item)}</li>`).join('\n')}\n      </ul>` : ''}\n    </section>`).join('\n');
  return `<!DOCTYPE html>
<html lang="${content.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${html(document.title)}</title>
  <link rel="stylesheet" href="legal.css">
${alternates}
  <link rel="alternate" hreflang="x-default" href="../${kinds[kind]}.html">
</head>
<body>
  <header>
    <details>
      <summary>${html(content.languageLabel)}: ${html(content.languageName)}</summary>
      <nav aria-label="${html(content.languageLabel)}"><ul class="languages">
${languageLinks(kind)}
      </ul></nav>
    </details>
    <p><a href="${kinds[other]}.${content.locale}.html">${html(content[other].title)}</a></p>
  </header>
  <main>
    <h1>${html(document.title)}</h1>
    <p class="updated">${html(content.updatedLabel)}: <time datetime="${config.updatedOn}">${config.updatedOn}</time></p>
    <p>${html(document.intro)}</p>
${sections}
    <section aria-labelledby="contact">
      <h2 id="contact">${html(content.contactTitle)}</h2>
      <p>${html(config.contactName)}<br><a href="mailto:${html(config.contactEmail)}">${html(config.contactEmail)}</a></p>
    </section>
  </main>
</body>
</html>
`;
}

function renderMarkdown(content) {
  const document = content.privacy;
  const sections = document.sections.map(section => `## ${section.title}\n\n${section.paragraphs.join('\n\n')}${section.items ? `\n\n${section.items.map(item => `- ${item}`).join('\n')}` : ''}`).join('\n\n');
  return `# ${document.title}\n\n${content.updatedLabel}: ${config.updatedOn}\n\n${document.intro}\n\n${sections}\n\n## ${content.contactTitle}\n\n${config.contactName}  \n[${config.contactEmail}](mailto:${config.contactEmail})\n`;
}

for (const content of translations) {
  for (const kind of Object.keys(kinds)) outputs.set(`docs/legal/${kinds[kind]}.${content.locale}.html`, renderDocument(content, kind));
  outputs.set(`app/assets/legal/privacy-policy.${content.locale}.md`, renderMarkdown(content));
}
outputs.set('privacy-policy.md', renderMarkdown(canonical));

for (const kind of Object.keys(kinds)) {
  outputs.set(`docs/${kinds[kind]}.html`, `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${html(canonical[kind].title)}</title>
  <link rel="stylesheet" href="legal/legal.css">
  <script src="legal/locale-router.js" data-document="${kinds[kind]}" defer></script>
</head>
<body>
  <main>
    <h1>${html(canonical[kind].title)}</h1>
    <p>Choose your language.</p>
    <nav aria-label="Language"><ul class="languages">
${languageLinks(kind, 'legal/')}
    </ul></nav>
  </main>
</body>
</html>
`);
}

outputs.set('docs/legal/locale-router.js', `// Generated by docs/generate-legal.mjs. Do not edit by hand.
(function () {
  'use strict';
  var supported = ${JSON.stringify(locales)};
  var script = document.currentScript;
  var documentName = script && script.getAttribute('data-document');
  if (['privacy-policy', 'terms-of-service'].indexOf(documentName) === -1) return;
  var languages = navigator.languages && navigator.languages.length ? Array.prototype.slice.call(navigator.languages) : [navigator.language || 'en-GB'];
  var preferred = new URLSearchParams(window.location.search).get('lang');
  if (preferred) languages.unshift(preferred);
  var selected = 'en';
  for (var i = 0; i < languages.length; i++) {
    var locale = String(languages[i]).trim().toLowerCase().replace(/_/g, '-').split('-')[0];
    if (supported.indexOf(locale) !== -1) { selected = locale; break; }
  }
  window.location.replace('legal/' + documentName + '.' + selected + '.html');
})();
`);

outputs.set('docs/index.html', `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Scam Shield – Legal documents</title>
  <link rel="stylesheet" href="legal/legal.css">
</head>
<body>
  <main>
    <h1>AI Scam Shield</h1>
    <p>Legal documents</p>
    <div class="table-scroll"><table>
      <thead><tr><th>Language</th><th>Privacy</th><th>Terms</th></tr></thead>
      <tbody>
${translations.map(content => `        <tr lang="${content.htmlLang}"><th scope="row">${html(content.languageName)}</th><td><a href="legal/privacy-policy.${content.locale}.html">${html(content.privacy.title)}</a></td><td><a href="legal/terms-of-service.${content.locale}.html">${html(content.terms.title)}</a></td></tr>`).join('\n')}
      </tbody>
    </table></div>
  </main>
</body>
</html>
`);

let different = 0;
for (const [relative, text] of outputs) {
  const target = path.join(root, relative);
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) continue;
  different++;
  if (checkOnly) console.error(`Stale or missing legal output: ${relative}`);
  else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); }
}
if (checkOnly && different) process.exitCode = 1;
else console.log(`${checkOnly ? 'PASS' : 'Generated'}: ${locales.length} locales, 50 legal HTML pages, 25 in-app privacy documents; ${different} ${checkOnly ? 'differences' : 'files updated'}.`);
