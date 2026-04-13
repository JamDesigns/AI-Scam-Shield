# AI Scam Shield API

AI Scam Shield API is the **backend service** that powers scam detection for the mobile app.

It provides:

- rule-based scam detection
- AI-powered semantic analysis (Ollama)
- weekly quota enforcement (free vs premium)
- device-based tracking
- subscription handling

---

## Features

- Fastify-based API
- PostgreSQL persistence
- Dockerized environment
- weekly usage tracking per device
- AI + heuristic hybrid analysis
- freemium model support
- RevenueCat webhook integration

---

## Tech stack

- Node.js
- Fastify
- PostgreSQL
- Docker
- Zod (validation)
- Ollama (AI provider)

---

## Architecture

The API follows a **simple modular architecture** focused on clarity and scalability.

Core responsibilities are separated into:

- **HTTP layer (Fastify)**  
  Handles routing, validation and request lifecycle.

- **Domain logic**  
  - `rules.ts` → heuristic scam detection  
  - `ai.ts` → AI semantic analysis  
  - `translate.ts` → optional input normalization  

- **Persistence layer**  
  - `db.ts` → PostgreSQL access and quota tracking  

- **Configuration layer**  
  - environment-driven setup using Zod validation  

The system is designed with a **hybrid detection approach**:

1. Fast heuristic scoring (cheap, instant)
2. AI analysis (expensive, controlled by quota)
3. Unified final result

This keeps the API:

- fast
- cost-efficient
- scalable

---

## Request flow

### Scan pipeline

```
Client → POST /scan
        ↓
Validate input (Zod)
        ↓
Ensure device exists (DB)
        ↓
Check weekly quota
        ↓
Heuristic analysis (rules.ts)
        ↓
AI eligibility check
        ↓
(Optional) AI analysis (ai.ts)
        ↓
Merge results
        ↓
Update usage counters
        ↓
Return response
```

---

### Key behaviors

- **Quota enforcement happens before AI execution**
- **AI is optional and can fail gracefully**
- **Heuristic analysis always runs**
- **Final result prioritizes AI when available**

---

### Performance considerations

- Heuristic scoring is always O(1) and fast
- AI calls are:
  - limited by quota
  - protected with timeout
- Database writes are minimal and batched per request

---

### Design goals

- predictable cost (AI usage controlled)
- fast response times
- simple debugging and observability
- easy extension for future features (history, caching, fraud signals)

---

## Project structure

```text
src/
  index.ts        # API entry point
  db.ts           # database access
  rules.ts        # heuristic rules
  ai.ts           # AI integration (Ollama)
  translate.ts    # optional translation (DeepL)
```

---

## Run locally (Docker)

From the `api/` folder:

```bash
docker compose up --build
```

Services:

- API → http://localhost:3000
- PostgreSQL → localhost:5433

---

## Environment variables

### `.env`

```env
PORT=3000

DATABASE_URL=postgresql://scam:scam@postgres:5432/scam_shield?schema=public

ADMIN_TOKEN=your_admin_token_here
REVENUECAT_WEBHOOK_AUTH=your_webhook_token_here

FREE_WEEKLY_LIMIT=3
FREE_WEEKLY_AI_LIMIT=1

AI_PROVIDER=ollama
AI_MODE=local
AI_BASE_URL=http://host.docker.internal:11434
AI_MODEL=llama3.1:8b
```

---

## API endpoints

### Health check

```http
GET /health
```

Response:

```json
{
  "ok": true
}
```

---

### Scan input

```http
POST /scan
```

Headers:

```text
x-device-id: <device_id>
```

Body:

```json
{
  "input": "text or url",
  "outputLanguage": "en"
}
```

Response:

```json
{
  "riskScore": 20,
  "category": "low_risk",
  "reasons": [],
  "weeklyRemaining": 2,
  "aiAllowed": true,
  "aiUsed": true
}
```

---

### Weekly usage

```http
GET /usage/week
```

Returns current quota status:

- scans used
- remaining scans
- AI usage

---

### Subscription status

```http
GET /subscriptions/status
```

---

### Admin (manual premium toggle)

```http
POST /admin/subscriptions/set
```

Headers:

```text
x-admin-token: <ADMIN_TOKEN>
```

---

### RevenueCat webhook

```http
POST /webhooks/revenuecat
```

Used to sync premium status automatically.

---

## Quota system

Free users:

- limited weekly scans
- limited AI scans

Premium users:

- unlimited scans
- unlimited AI analysis

Quota is tracked per:

- device ID
- ISO week (e.g. 2026-W10)

---

## AI integration

The API uses **Ollama** for AI analysis.

Modes:

### Local (development)

```env
AI_MODE=local
AI_BASE_URL=http://host.docker.internal:11434
```

Requires Ollama running on host machine.

---

### Cloud (production-ready)

```env
AI_MODE=cloud
AI_API_KEY=<your_api_key>
```

---

## Database

Main tables:

- `devices`
- `subscriptions`
- `device_weekly_usage`

Usage tracking includes:

- total scans
- AI scans

---

## Notes

- The API is the single source of truth for quotas.
- The mobile app must always include `x-device-id`.
- AI failures fallback to heuristic analysis.
- Docker is the recommended way to run the API locally.

---

## Future improvements

- caching results to avoid duplicate scans
- rate limiting improvements
- better AI explanations
- multi-language AI responses
- observability (logs, metrics)
