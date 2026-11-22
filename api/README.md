# AI Scam Shield API

A Fastify/TypeScript service for the Android and iOS clients. In production, it runs on **remote server A** and connects to PostgreSQL on a separate **remote server B**. Clients installed from Google Play/App Store call the API over HTTPS; they never access the DB directly.

## Responsibilities

- Issue and authenticate sessions with separate identifiers and tokens.
- Analyse text/URLs, images and videos using the configured providers.
- Apply quotas transactionally and idempotently.
- Verify Premium access through RevenueCat and reconcile events/synchronisations.
- Retain history/results and return statistics for the registered time zone.

Free allows 3 results/week: the first uses AI for any content type; the other 2 cover text/URLs without AI. Premium always uses AI with no commercial weekly quota. The reset occurs on Monday at 00:00 in the session's time zone. A valid inconclusive result counts as one unit; a failure without a valid result does not count. There is no silent fallback to heuristics when the analysis requires AI.

## Production deployment: separate API and DB

Build the API image from the repository root:

```sh
docker build --target runtime -t ai-scam-shield-api:release ./api
```

The runtime uses Node 22, compiled JavaScript, ffmpeg and the `node` user, with production dependencies. The image does not contain PostgreSQL or private environment files. It is also possible to compile TypeScript and run `node dist/index.js` in an equivalent environment with ffmpeg/ffprobe available.

| Setting | Location and purpose |
|---|---|
| API HTTPS domain | Public entry point on server A, configured in the mobile builds through `API_BASE_URL` |
| `PORT` | API process port on A; default value 3000 |
| `DATABASE_URL` | On A only: connection to remote PostgreSQL host B, credentials and relevant TLS settings |
| `NODE_ENV=production` | Remote service mode |
| `ALLOW_TEST_ADMIN=false` | Keeps manual granting of test Premium access disabled |
| `SESSION_RATE_LIMIT_SECRET` | Stable, random secret for session registration, at least 32 characters long; shared between API instances |
| Provider variables | On A only: configuration/keys for AI, forensics, transcription and translation |
| `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` | Verification and webhook secrets on A |
| `REVENUECAT_ENVIRONMENT=PRODUCTION` | Published purchase environment; entitlement consistent with the project/stores |

`src/db.ts` passes `DATABASE_URL` to a `pg` pool. A remote DB does not activate a TLS policy by itself: certificates and validation must be configured for the selected PostgreSQL service. See [TLS with node-postgres](https://node-postgres.com/features/ssl).

The DB, its access identity, connectivity from A, TLS, backups and retention are configured on B. The domain and HTTPS termination are configured on A; the Node process listens on `0.0.0.0:PORT`. The Dockerfile does not configure HTTPS or control of the incoming proxy. Network exposure and per-IP limits must be validated in the actual deployment; indiscriminate trust in proxy headers has not been enabled.

Startup applies pending migrations to the specified DB **before listening for HTTP requests**. Coordinate permissions and backups on server B before activation. These are deployment procedures; no remote servers have been provisioned as part of this delivery.

## Private configuration

`api/.env.example` documents variables with development values and no private keys. It is not production configuration and must not replace an environment that already contains valid keys. Inject the actual values through the server's private configuration. `.env`, `.env.production`, tokens, credentials and private keys are not added to Git or the mobile app.

Providers are selected in the backend. Local Ollama is an option for the development environment; a client installed from the stores does not need Ollama on the phone or access to the development computer. The AI/forensics/audio/translation dependencies must be accessible from A according to the contracted/configured service.

## Client contract

`POST /sessions` registers an IANA time zone and returns the identity and its token. User routes require `Authorization: Bearer …` and `x-device-id`; if `x-time-zone` is sent, it must match the registered time zone. The client retains its identity after a 401 and does not automatically create another one.

Analyses use `Idempotency-Key` for retries where the outcome is uncertain. The backend retains the response from a completed operation and prevents a second quota debit for the same identifier and content. Quotas and effective Premium access are determined on the server.

Public status routes: `GET /health` and `GET /rules`. Usage, history, statistics and subscription status require a session. A response from `/health` does not by itself verify providers or establish that a real purchase or analysis has occurred.

## Local development, separate from production

`docker-compose.yml` groups the API and PostgreSQL **only for local development and testing**: the API is on `localhost:3000`, and the DB is exposed on `localhost:5433`. It does not describe the two remote production servers.

These services and their volume already exist in the current environment. They are reused; no parallel DB is created and no volumes are deleted. To update the local API, use the procedure prepared for this project, preserving its private configuration.

For API code development, from this folder with dependencies installed:

```sh
npm test
npm run typecheck
npm run build
```

Do not use a test administration endpoint as a substitute for a real purchase/validation. If explicitly enabled for testing, the administrator requires an allowed environment and private configuration; no command is published for granting Premium in production.

See [architecture and mobile builds](../README.md), [Flutter client](../app/README.md) and [legal documentation](../docs/README.md).

## Analysis profiles

See [local and production analysis](../docs/analysis-profiles.md) for explicit provider routing, local model setup and validation limits.
