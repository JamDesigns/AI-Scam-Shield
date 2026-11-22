# Account deletion rollout

Status: implemented locally; not enabled or verified against production providers.

## Configuration

The API defaults to `ACCOUNT_DELETION_ENABLED=false`. Keep this value until the
Firebase Admin credential and RevenueCat deletion permission have been verified.
The existing public mobile Firebase configuration cannot delete server users.

Create a dedicated Firebase service account with only the required Authentication
user deletion permissions. Upload its JSON to the API's Render **Secret Files** as
`firebase-admin.json`; never send it in chat, commit it or package it with Flutter.
Set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json` and retain the
correct `FIREBASE_AUTH_PROJECT_ID`. The existing private RevenueCat V1 key must
authorize deleting customers. Then set `ACCOUNT_DELETION_ENABLED=true` and deploy
the reviewed backend. Status reports `deletionAvailable=false` if configuration is
disabled or unavailable; this does not validate live provider permissions.

## Behavior and recovery

`POST /accounts/delete` requires the linked installation session, explicit
confirmation and a Google Firebase ID token authenticated within five minutes.
An analysis still processing blocks the request. Acceptance creates a durable job
and revokes all linked installation sessions in one database transaction.
Acceptance is not completion and does not cancel Google Play subscriptions.

The worker deletes the account and linked installation RevenueCat identifiers,
then the Firebase Authentication user, then live app records. Missing external
users are treated idempotently. Provider failures retain the job and retry after
five minutes; work resumes after restart. Leases prevent overlapping job claims.
Only sanitized retry codes are persisted and logged.

A free Render API can sleep, delaying background work indefinitely until it wakes.
Use an always-running instance or a separately supervised worker before promising
a completion deadline. Monitor job age and failures through authenticated operator
access; never expose the job table or provider secrets publicly.

## Required acceptance checks before Play publication

1. Review and deploy backend migration and the external request page. Confirm
   `https://jamdesigns.github.io/AI-Scam-Shield/delete-account.html` is available.
   Put that URL in the Play account deletion declaration.
2. Test using a disposable Google account and synthetic history on two phones.
   Confirm cancellation preserves data, stale/foreign identities are rejected,
   both sessions are revoked, providers and live data disappear, and unrelated
   accounts remain intact. Do not use the owner's real Premium account.
3. Interrupt a provider step and restart the API. Confirm the persisted job
   completes on retry. Check the app starts a fresh anonymous installation and
   clears the previous account's local statistics and history.
4. Define and document backup retention, support-request response times, provider
   content retention and any mandatory billing retention. Historical database
   backups are **not** erased by the live-data worker. Maintain a restricted
   deletion ledger and reapply deletions after a restore before serving traffic;
   this operational mechanism remains to be configured.
5. Review the privacy policy for the deployed Google identity and deletion flow.
   The external help page has 25 localized sections; its detailed operational
   scope is currently English. Native-language review is still required.
6. Build a new signed Android bundle with version code 10 or higher, test through
   Google Play with its app-signing certificate registered in Firebase, and
   validate test purchases/restoration separately. Keep version 9 in draft.

Web requests use the published support email and require ownership verification;
the page does not delete an account merely by opening an email link. Record and
handle these requests through the same verified cleanup process.
