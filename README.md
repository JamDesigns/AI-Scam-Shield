# AI Scam Shield (Flutter + Fastify API)

AI Scam Shield is a **mobile MVP** designed to detect phishing and scam messages using a combination of:

- rule-based heuristics  
- AI semantic analysis  
- a freemium subscription model  

The project contains:

```
app/  → Flutter mobile application
api/  → Fastify backend API (Node.js + TypeScript)
```

The backend exposes a `/scan` endpoint used by the mobile app to analyze messages or links.

---

# Architecture

```
Flutter App
     │
     ▼
Fastify API (Docker)
     │
     ├── PostgreSQL (usage limits, subscriptions)
     │
     └── Ollama AI
            ├─ local (development)
            └─ cloud (production)
```

Detection pipeline:

```
Input
  │
  ▼
Rule-based scan (fast)
  │
  ▼
AI semantic analysis (if allowed)
  │
  ▼
Final risk score + explanation
```

Freemium model:

```
Free users
  • 3 scans / week
  • 1 AI scan / week

Premium
  • unlimited scans
  • unlimited AI analysis
```

---

# Prerequisites (Windows 11)

Install:

- Git
- Node.js 20+
- Docker Desktop (WSL2 enabled)
- Flutter SDK (stable)
- Android Studio (SDK + emulator)

Recommended:

- VS Code
- Flutter extension
- Dart extension

---

# 1. Run the backend (API + PostgreSQL)

From the `api` folder:

```bash
cd api
docker compose up --build
```

API will be available at:

```
http://localhost:3000
```

Test endpoints:

```
http://localhost:3000/health
http://localhost:3000/rules
```

---

# 2. AI setup (Ollama)

## Install Ollama

https://ollama.com

Verify installation:

```bash
curl http://localhost:11434/api/version
```

## Download a model

Example:

```bash
ollama pull llama3.1:8b
```

Recommended lightweight model for development:

```bash
ollama pull phi3:mini
```

---

## Configure API `.env`

Example local configuration:

```env
AI_PROVIDER=ollama
AI_MODE=local
AI_BASE_URL=http://host.docker.internal:11434
AI_MODEL=llama3.1:8b
AI_API_KEY=
```

Production will use:

```env
AI_MODE=cloud
AI_BASE_URL=https://ollama.com/api
AI_API_KEY=YOUR_KEY
```

---

# 3. Run the Flutter app

From `app/`:

```bash
cd app
flutter create .
flutter pub get
```

Run on Android emulator:

```bash
flutter run
```

---

# 4. Test the scan flow

1. Launch the app
2. Paste a suspicious message or link
3. Tap **Scan**

Result will include:

- risk score
- category
- reasons
- recommended actions

---

# 5. Test premium access (dev)

The API includes a **development-only endpoint** to toggle premium.

Set your `ADMIN_TOKEN` in `.env`.

Example request:

```bash
curl -X POST http://localhost:3000/admin/subscriptions/set \
-H "content-type: application/json" \
-H "x-admin-token: YOUR_ADMIN_TOKEN" \
-d '{"deviceId":"DEVICE_ID","isPremium":true}'
```

---

# 6. Internationalization (i18n)

The mobile app supports multiple languages.

Base language:

```
assets/i18n/en.json
```

Add new languages:

```
es.json
fr.json
```

The UI uses:

```
EdgeInsetsDirectional
AlignmentDirectional
TextAlign.start/end
```

This ensures full **RTL compatibility**.

---

# Development notes

Important characteristics of the backend:

- stateless API
- device-based usage limits
- automatic fallback if AI fails
- safe defaults for mobile clients

The API never blocks scans if AI fails — it falls back to rule-based analysis.

---

# Future roadmap

Possible improvements after MVP validation:

- RevenueCat webhook verification
- remote rule updates
- threat intelligence feeds
- domain reputation checks
- AI model fine-tuning
- analytics (privacy-first)

---

# License

MIT
