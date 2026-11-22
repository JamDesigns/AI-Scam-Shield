# Provider configuration and recoverable Premium

Prepared on 22 November 2026. This is a code/configuration delivery, not proof of real provider quality, actual billing, a successful store purchase or release approval. No real environment files, cloud settings, database or store tracks were modified during implementation.

## Independent boundaries

The mobile API URL, semantic AI, transcription, translation, forensic sidecar and RevenueCat are independent settings. Existing Ollama/OpenAI/Hive/Deepgram adapters remain available. Adding another vendor still requires one adapter; configuration cannot make an unsupported model handle images or structured JSON. No automatic paid vendor fallback exists.

Local analysis retains `ANALYSIS_PROFILE=local` and the existing local models. It is rejected with `NODE_ENV=production`. It never sends analysis or translation to Gemini/DeepL as a fallback. RevenueCat and Google authentication remain external even when the API and PostgreSQL run in local Docker. No port or tunnel settings were changed.

## Production trial using one paid AI vendor

Configure secrets only in the server environment, never in Flutter defines, an APK, examples or git. Example selections:

```dotenv
ANALYSIS_PROFILE=production
AI_PROVIDER=gemini
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_MODEL=gemini-3.5-flash-lite
AI_MAX_OUTPUT_TOKENS=4096
AI_SEND_TEMPERATURE=false
# AI_API_KEY must be configured securely.
TRANSCRIPTION_PROVIDER=gemini
TRANSCRIPTION_BASE_URL=https://generativelanguage.googleapis.com/v1beta
TRANSCRIPTION_MODEL=gemini-3.5-flash-lite
TRANSCRIPTION_MAX_OUTPUT_TOKENS=4096
TRANSCRIPTION_SEND_TEMPERATURE=false
# TRANSCRIPTION_API_KEY is independently configured; it can belong to the same Gemini account.
TRANSLATION_PROVIDER=none
FORENSICS_PROVIDER=self-hosted
FORENSICS_BASE_URL=http://127.0.0.1:8081
```

The model and its current availability/terms must be checked in the chosen account before enabling real requests. Gemini semantic analysis and Gemini transcription are separate billable requests, even with one vendor/key. An image currently makes two semantic requests. The adapters enforce output limits and expose optional usage callbacks; persistent billing dashboards are separate work. Do not count an aborted/invalid assessment as a free provider request merely because user quota is not charged.

Gemini transcription receives bounded 16 kHz mono PCM WAV extracted internally from the validated temporary video, not the full original video. Maximum video duration remains 180 seconds. Original-language transcripts and evidence are retained. Empty recognized text is not proof that a clip contains no audio; observe `transcriptionStatus`.

### Forensic service limitations

`self-hosted` explicitly selects the existing experimental image/audio detector sidecar. It must already be running with its reviewed model files and dependencies; selecting it does not deploy or download models. Its raw logits remain uncalibrated, with inconclusive/unavailable video/deepfake findings and null probabilities. It is not equivalent to a specialized commercial deepfake service. The bounded metadata/hidden-content inspector remains in the API.

Only the existing loopback/trusted Docker origins are allowed. A same-host loopback sidecar or `host.docker.internal` topology is supported by that client. Arbitrary Render private-service DNS names are NOT supported by this initial transport. Do not expose the unauthenticated sidecar publicly. A separately hosted service needs an authenticated transport and deployment review. Model memory, CPU and hosting still cost money.

To retain Hive, set `FORENSICS_PROVIDER=hive` and its explicit endpoint/model/key. To retain Deepgram, set its independent transcription configuration. No mobile rebuild is needed for these server-side switches.

## DeepL and app locale

Select `TRANSLATION_PROVIDER=deepl` and configure `DEEPL_AUTH_KEY` and the correct HTTPS API base for the subscribed product. `api.deepl.com` and legacy `api-free.deepl.com` are not interchangeable. With `none`, the semantic model is asked for the app language; there is no independent translation-quality guarantee.

All 25 app locales map centrally, including Irish, Maltese, Catalan, British English and European Portuguese. The phone's supported language resolves to the effective app locale; an unsupported language falls back to British English. Store country distribution is a separate setting. OCR, original transcripts, URLs, QR payloads and hidden-content evidence are not translated or replaced.

Narrative fields are batched, preserving field identity, category, score, confidence and quoted/URL evidence references. When selected DeepL fails, an operation returns `translation_unavailable` before successful completion rather than silently serving another language. Already billed upstream calls cannot be refunded by quota accounting.

After building the API, check actual target-language coverage once in a deliberately configured process:

```text
node dist/translation/preflight.js
```

The command reads process environment only, queries language capabilities without submitting text, and does not print keys. It is not run per scan or automatically during unit tests. Coverage checks do not replace fluent-speaker review and real quality tests.

## Google account and one active phone

The API stores a stable account UUID associated with a verified Firebase issuer/subject, separately from installation credentials. That UUID becomes the RevenueCat App User ID. The server verifies RS256 Firebase ID tokens against the configured project and Google's cached public keys. Google OAuth access tokens and client-provided user IDs are not accepted as identity proof.

Configure:

```dotenv
ACCOUNT_IDENTITY_PROVIDER=firebase
FIREBASE_AUTH_PROJECT_ID=your-existing-firebase-project-id
```

Enable Google in Firebase Authentication for the existing app project. Register the Android package and the correct debug, release/upload and Play app-signing certificate fingerprints as applicable. Use the matching public Android Firebase configuration. If the Google SDK cannot resolve its web OAuth client, pass the PUBLIC web client ID using `--dart-define=GOOGLE_WEB_CLIENT_ID=...`. Never pass an API/service-account secret this way. No private Firebase service-account key is required by the backend verifier.

The app's account action signs in with Google, links the authenticated installation and switches the purchase SDK to the stable account ID before buying/restoring. Activation requires recent Google authentication, fresh server RevenueCat verification and an explicit confirmation dialog. The activation transaction and scan reservations share an account lock. A second phone cannot start Premium scans while another is active. An existing in-flight scan must finish or its bounded reservation expire before transfer; retry activation afterward. This recovery behavior must be checked with a lost-phone scenario before release.

Quota uses the account's fixed week/time zone after linking. Existing free usage is imported without creating a new first-AI allowance, including installations registered in another time zone. Premium remains unlimited with AI. After expiry/refund, inactive phones can use the shared free allowance instead of being permanently locked out. Local `test_admin` Premium remains restricted to its explicit development/SANDBOX guard.

### Existing purchases and release gates

The source migration adds account tables and locks; it does NOT automatically prove ownership of legacy anonymous/device RevenueCat identities. Test restoring an existing purchase to the Google-linked account without buying again. Review the project's RevenueCat restore/transfer policy deliberately: keeping the original identified device ID can block recovery, while transfers require checking revocation and cross-account behavior. No RevenueCat dashboard settings were changed by this delivery.

Apple sign-in is a future iOS identity adapter, not an enabled feature in this Android delivery. Do not publish account functionality until account deletion/recovery flows, privacy disclosures and Google Play Data Safety requirements for the new identity processing have been reviewed and implemented where required. Firebase provider enablement, real key/model access, provider limits and store configuration remain operator tasks, not facts inferred from source code.

## Local acceptance before any upload

1. Preserve the existing Docker PostgreSQL volume and make a backup before applying the new account schema. The migration definition was tested structurally/mocked, not executed against the user's live DB in this delivery.
2. Rebuild the local API deliberately after code review. Keep current ports and the existing API URL mode. Do not deploy to remote servers.
3. Confirm free first-AI plus two classic text analyses, one unit per completed modality, unlimited local test Premium, cancellation/retry and unavailable-provider behavior.
4. Configure Google sign-in and test two installations: link, existing-purchase restore, confirmed activation, old-device denial, refund/expiry and fresh free access. Exercise real separate PostgreSQL connections; unit mutex mocks are not a substitute for the DB test.
5. Check all output languages with synthetic text/images/videos. Compare production-profile provider results and costs with a small authorized sample; local model results do not establish cloud-model quality.
6. Check Android 15/16 gesture/three-button navigation, cutouts, landscape, large text and keyboard. RevenueCat screens, Google sign-in and system file pickers require native-device/emulator checks.
7. Review the obsolete Alpha Play track before deciding whether to pause it. Do not pause the intended 14-day test track, upload a release, commit or push as part of this local verification.
