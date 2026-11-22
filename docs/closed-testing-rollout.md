# Closed-testing rollout readiness

Prepared 22 November 2026. The integration is code-ready for review; remote deployment and Play billing acceptance are not validated by local tests.

## Branches and deployment boundary

Integrate `agents/v3-laragon-integration` into `release/v3`, then open a draft PR from `release/v3` to `main`. Render automatically deploys `main`: merging that PR is the deployment approval boundary.

`main` contains an old broad revert (`af8b445`) that removed API, scan, language and sharing features. The validated release intentionally retains the restored implementation, the current mobile/server split and rewritten README. Reconcile that ancestry on the integration branch without reapplying the obsolete deletion. Do not reset or force-push main.

## Before merging the main PR

- Back up Neon and verify a restore path. API startup executes pending migrations with an advisory lock and a transaction per migration. Migration rollback on failure does not undo earlier successful migrations; rolling back code alone does not undo schema changes. Inventory existing devices and anonymous purchases before enabling account recovery.
- Configure Render runtime/build for Node 22 and ffmpeg. The Dockerfile runtime stage compiles TypeScript and runs as a non-root user. Confirm the existing Render service actually uses the intended build path.
- Configure `NODE_ENV=production`, `ANALYSIS_PROFILE=production`, `ALLOW_TEST_ADMIN=false`, a private `DATABASE_URL`, and a random shared `SESSION_RATE_LIMIT_SECRET` of at least 32 characters. Never copy the local DB URL or test admin overrides to Render.
- Configure `ACCOUNT_IDENTITY_PROVIDER=firebase` and `FIREBASE_AUTH_PROJECT_ID=scam-shield-mvp-e7cd5`.
- Verify real provider credentials, model availability, quotas and a bounded sample of text/image/video requests. Select AI/transcription/translation/forensics independently. The experimental local forensic service is not deployed by selecting its adapter. Local model quality is not proof of production quality.
- Configure RevenueCat server credentials, entitlement, webhook authorization and environment deliberately. A sandbox-only API is appropriate for license-test purchases but must not be mistaken for support for real paid production receipts. Test purchases and production purchases are different environments in the current server policy.
- Verify existing anonymous-purchase restoration/transfer policy, refund/expiry handling, account recovery and account deletion/privacy/Data Safety requirements before distribution.

## Play bundle and Google configuration

Use a signed release AAB, not a local debug APK. Set the public HTTPS API endpoint, matching RevenueCat Google Play SDK key and a versionCode greater than every previously uploaded bundle. Preserve the existing upload signing identity; never commit signing properties, keystores or credentials.

Register Play app-signing SHA-1/SHA-256 in Firebase and the matching package/SHA-1 in Android API-key restrictions. Keep authorized release identities when adding a development certificate. Refresh the ignored Android Firebase config as needed. The locally tested debug certificate alone does not authorize a Play-signed installation.

## Acceptance from Google Play

1. Add testers to the closed track and separately to license testing, using the Google account that installs and purchases through Play. Send the track opt-in link only after the release is available.
2. Install through Play. Confirm the test payment instrument before buying; closed-track membership alone does not prevent real charges.
3. Link Google, buy a test plan, verify the RevenueCat entitlement and activate this phone.
4. Restore on a second installation, explicitly transfer activation and verify the previous phone loses Premium scan access.
5. Verify accelerated renewal, cancellation, expiry, declined payment and return to shared free quota. A DB test_admin grant is not a substitute for these tests.
6. Check Android 15/16 insets/native screens and the supported languages, including large text. Recheck account/deletion disclosures and the Play review declarations.

## Verified locally on 22 November

- API: 537 tests across 46 files; TypeScript build passed. One initial run under parallel Flutter load hit the default test timeout; rerun with four workers passed unchanged.
- Flutter: 384 tests passed, 25 optional screenshot cases skipped.
- Legal generation: 25 locales, 50 HTML documents, 25 bundled privacy documents; four routing/content tests passed.
- S22: Google identity linked after authorizing the debug certificate in the Android API-key restrictions. Local non-expiring test Premium works. The Google sign-in button hides for a linked account.
- Real Play purchase, remote Render/Neon configuration, provider billing and cross-device paid transfer remain unverified.
