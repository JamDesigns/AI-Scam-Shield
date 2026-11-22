import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'docs/legal/config.json'),'utf8'));
const locales=fs.readdirSync(path.join(root,'app/assets/i18n')).filter(n=>/^[a-z]{2}\.json$/.test(n)).map(n=>n.slice(0,-5)).sort();
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pages=locales.map(locale=>{
 const t=JSON.parse(fs.readFileSync(path.join(root,'app/assets/i18n',locale+'.json'),'utf8'));
 const legal=JSON.parse(fs.readFileSync(path.join(root,'docs/legal/content',locale+'.json'),'utf8'));
 const rights=legal.privacy.sections.find(s=>s.id==='rights');
 const storage=legal.privacy.sections.find(s=>s.id==='storage');
 const mail='mailto:'+config.contactEmail+'?subject='+encodeURIComponent('AI Scam Shield account deletion request')+'&body='+encodeURIComponent('Please delete my AI Scam Shield account and associated data. My Google sign-in email is: \n\nPlease verify my identity before deleting. I understand that Google Play subscriptions must be managed separately.');
 return `<section data-locale="${locale}" ${locale==='en'?'':'hidden'} lang="${legal.htmlLang}"><h2>${escape(t['account.deletionHelp'])}</h2><p>${escape(t['account.deleteMessage'])}</p><p>${escape(rights?.paragraphs?.join(' ')??'')}</p><p><a href="${escape(mail)}">${escape(legal.contactTitle)}: ${escape(config.contactEmail)}</a></p><p><a href="https://play.google.com/store/account/subscriptions?package=com.jamdesigns.scamshield">${escape(t['account.manageSubscriptions'])}</a></p><p><a href="legal/privacy-policy.${locale}.html">${escape(legal.privacy.title)}</a></p></section>`;
});
const html=`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Delete your AI Scam Shield account — JamDesigns</title><link rel="stylesheet" href="legal/legal.css"></head>
<body><main><h1>AI Scam Shield — Account deletion</h1><label for="language">Language</label><select id="language">${locales.map(l=>`<option value="${l}" ${l==='en'?'selected':''}>${escape(JSON.parse(fs.readFileSync(path.join(root,'docs/legal/content',l+'.json'),'utf8')).languageName)}</option>`).join('')}</select>
<p>You can request automatic deletion from Account and active phone in the app, after confirming and verifying Google. You can also request deletion here without reinstalling the app: email the contact below from your Google sign-in address. The web request is reviewed by JamDesigns to verify ownership before processing. Do not send passwords, login codes, payment details or access tokens.</p>
<p>Scope: the AI Scam Shield account, linked installation sessions, analysis history/results, statistics and quota counters are removed from the live service; Firebase Authentication and RevenueCat customer records are removed too. Your Google account is not deleted. Google Play subscriptions are not automatically cancelled, and Google Play retains its own transaction records. Submitted-content retention at AI providers follows their respective terms.</p>
<p>Automatic requests revoke linked sessions when accepted. External cleanup is retried if a provider is unavailable; acceptance does not mean cleanup has already finished. Existing database backup copies are handled separately from the live database: contact JamDesigns for the applicable retention and deletion arrangements. Contact us if a request remains pending or you no longer have access to the original sign-in account.</p>
${pages.join('\n')}
<p>JamDesigns · ${escape(config.contactEmail)}</p></main><script src="delete-account.js"></script></body></html>\n`;
const target=path.join(root,'docs/delete-account.html');
if(process.argv.includes('--check')) {if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==html)throw Error('Deletion page is stale');console.log('PASS: deletion request resource covers 25 locale sections.');}
else {fs.writeFileSync(target,html);console.log('Generated deletion request page.');}
