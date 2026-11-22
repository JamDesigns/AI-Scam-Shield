# Localised legal documentation

This directory contains the Privacy Policy and Terms of Service in the **24 official EU languages plus Catalan**. English uses the British variant (`en-GB`), while filenames retain `en` to match the app.

English is the project's working language for developer documentation and source comments. Localised app content and legal documents remain in their respective languages.

Open `index.html` to review all 25 languages. The stable `privacy-policy.html` and `terms-of-service.html` entry points detect the browser language; a query such as `?lang=ca` selects a language explicitly. Each document provides static links to all languages, including when JavaScript is disabled.

## Shared sources and generation

Translation sources are stored in `legal/content/<locale>.json`. The date and public contact details are in `legal/config.json`. From the repository root:

```sh
node docs/generate-legal.mjs
node docs/generate-legal.mjs --check
node --test docs/legal-documents.test.mjs
```

The generator produces 50 HTML documents, 25 Markdown policies in `app/assets/legal/`, the language entry points, the index and the root Markdown privacy policy. Edit the sources and regenerate rather than editing individual outputs. Checks compare coverage against `AppLocalizations.supportedLocales` and verify every paragraph, navigation, links and regional language selection. CI runs the generation and documentation checks.

## Scope of this local review

Technical update dated 2 November 2026: media/audio processing, OCR in the original language, results in the app language, providers, Firebase Analytics, sessions, history and stored analysis results. The terms reflect Free's 3 weekly analyses — first with AI, other 2 text/URL without AI — Premium's always-AI analysis without a weekly commercial quota, and videos up to 180 seconds/100 MiB. Prices, Google Play commercial terms and provider configuration have not been changed.

Translations are complete and structurally checked; **legal review and native-speaker review have not been completed**. This directory is a local review deliverable, not a publication or certification of legal compliance. Before publication, decisions remain on each processing purpose's legal basis, retention/deletion and backup periods or criteria, actual providers and processing regions/transfers, and Analytics consent/configuration where applicable. These details have not been invented, and automatic deletion has not been implemented. The controller's full legal identity and request-handling arrangements also need confirmation; the existing JamDesigns contact is retained.

Official references for that review: [information to provide about processing](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en), [data subject rights](https://www.edpb.europa.eu/topics/key-gdpr-concepts/data-subject-rights_en) and [retention criteria](https://www.dataprotection.ie/en/faqs/responsibilities-data-controllers/how-long-should-personal-data-be-held-meet-obligations-imposed-gdpr).
