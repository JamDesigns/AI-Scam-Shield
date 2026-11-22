# Translation and Android edge-to-edge readiness

This change prepares configurable translation and Flutter system insets. Mocked and
widget tests do not establish live provider translation quality, Google Play acceptance,
or physical Android screen compatibility.

## Translation integration contract

`api/src/translation/deepl-translation-provider.ts` exports
`createTranslationProvider({profile, provider, deepl})`. `profile` is `local` or
`production`; `provider` is `none` or `deepl`; `deepl` contains `authKey`, `apiBase`,
optional `timeoutMs` and `modelType`. Local profile always returns null without any
external request. None returns null, retaining existing provider-native output and
local MADLAD routing. No automatic paid fallback exists.

Construct `new TranslationService(translationProvider)` and use
`await translationService.analysis(analysis, outputLanguage, operationSignal)` for
text AI, image authenticity, combined image and video analysis results. The service
translates only explanation, prose reasons and disclaimer; risk/category/confidence
values and extra original evidence fields remain untouched. Uppercase reason IDs
remain IDs for the mobile catalogue. Each reason remains a separate field, so
translated newlines cannot merge or split reasons. URLs and double-quoted excerpts
are protected with validated markers; loss of a marker fails the operation. This
is a structural safeguard, not proof that arbitrary translated prose is accurate.

Remove index.ts's four-language target helper and per-field translation functions.
Do not catch and suppress translation errors when DeepL is explicitly enabled:
return a safe `translation_unavailable` failure before completing the scan operation.
Keep original OCR/transcripts/URLs/QR/hidden-content evidence outside translation.
English normalization used for classic scoring is a separate derived value; retain
the original input and only call DeepL when the external translator is enabled.
`DEEPL_TARGET_LANG` must not override the requested output locale.

The existing app path is phone locale -> AppLocalizations.resolveLocale ->
ScanPage._outputLanguage -> API outputLanguage. Regional device tags use the app
locale; unsupported languages retain the existing British-English fallback. All 25
supported locales map centrally, with EN-GB and PT-PT for target variants. Country
distribution in store settings is independent of phone language.

All 25 catalogues include the new account/device activation messages plus an
explicit localized translation-failure message. These are authored translations,
not live DeepL output; fluent-speaker review remains appropriate before release.
`account.cancel` and `account.confirm` are new (global actions.cancel/confirm do not
exist in the baseline). Account UI should inject AppLocalizations values into its
labels instead of hardcoded English. The existing `premium.restore` is reused.

Configure `TRANSLATION_PROVIDER=deepl|none` separately from AI/transcription/forensic
providers. Use the correct DeepL HTTPS base for the subscribed API product; this
module does not guess a base from the key. Never put a key in the app or examples.
The default adapter base is the paid `https://api.deepl.com`; legacy API Free uses
`https://api-free.deepl.com`. A different configured HTTPS origin is an explicit
operator trust decision. Redirects are refused to avoid forwarding authorization.

## Explicit preflight (no billable text translation)

The preflight reads credentials only from the process environment, does not load
`.env`, and does not print secrets. Run in an authorized configured server session:

```text
node dist/translation/preflight.js
```

It calls `/v3/languages?resource=translate_text`, requires `usable_as_target`, reports
missing locales and exits unsuccessfully if coverage/configuration is incomplete.
Do this once during deployment validation, not per scan. It is not automatically
executed on import. Live preflight and 25-language real translation quality remain
pending configured credentials and later user testing. Current docs support all
25 targets; the account response is authoritative for availability.

## Android changes and manual acceptance

Existing PremiumOfferPage, SubscriptionPage, AboutPage and StatsPage bodies gain
SafeArea(top:false). The AppBar already consumes the top inset, and SafeArea removes
the insets it consumes, preventing additional padding in descendants. Home's Material
NavigationBar already owns its system safe area; ScanPage and PrivacyPolicyPage
already use SafeArea. No target SDK reduction, edge-to-edge opt-out, engine binary
patch or broad dependency upgrade is required by this change.

The local debug artifact examined before this task is version 3.3.0+8, target SDK36;
the Play notices refer to older version code7. A Flutter embedding reference to
deprecated Window APIs can remain in guarded compatibility code. It does not by
itself prove a defect in our screens, and these changes do not promise removal of
all Play Console static-analysis warnings.

Widget coverage simulates nonzero status/cutout/navigation/keyboard insets, two
navigation styles, landscape and 1.8x text across all 25 locales. It checks actual
purchase-control rectangles and hit testing after scrolling.

Before release, run on Android15 and Android16 with gestures and three-button
navigation, portrait/landscape, display cutouts, keyboard open/closed, large fonts:

- Scan input, analysis results, statistics, About and privacy; confirm scrolling,
  bottom controls, AppBar/back actions and nav tabs remain visible and reachable.
- Premium introduction, restore and new account/device activation pages.
- Actual RevenueCat purchase/paywall/customer-center screens, purchase cancellation,
  restore success/error; Flutter fixture tests do not validate these native screens.
- System image/video pickers and share-to-app entry with the keyboard already open.
- Signed release artifact, not only a debug APK, and Google Play pre-launch report.

Never change the phone's system language automatically. Test app locales directly
where possible; real system locale changes require the user's explicit test plan.
Review the obsolete Alpha track separately in Play Console: establish whether it
is still used and whether it is the intended 14-day test channel before pausing.
No store track changes are made by this work.

## Official references (checked 22 November 2026)

- https://developers.deepl.com/docs/languages/using-the-languages-api
- https://developers.deepl.com/docs/translate/understanding-model-types
- https://developers.deepl.com/api-reference/translate/request-translation
- https://docs.flutter.dev/release/breaking-changes/default-systemuimode-edge-to-edge
- https://developer.android.com/develop/ui/views/layout/edge-to-edge
- https://github.com/flutter/flutter/issues/169810
- https://support.google.com/googleplay/android-developer/answer/9845334
