# AI Scam Shield App

AI Scam Shield is the **Flutter mobile client** for the AI Scam Shield MVP.

It allows users to:

- scan suspicious messages or links
- receive a scam risk score and category
- see reasons for the detected risk
- access AI-powered analysis with a freemium model
- manage premium status through the app flow

The app connects to the backend API, which performs:

- rule-based scam detection
- AI semantic analysis
- weekly quota enforcement
- subscription status handling

---

## Features

- Flutter mobile app
- i18n-ready structure
- RTL-friendly UI patterns
- weekly scan quota support
- premium / free user flow
- backend-driven scam analysis
- AI explanation support
- share intent support for text and URLs
- automatic scan on app open when content is shared
- smart result reuse for repeated shared inputs to avoid extra quota usage

---

## Share intent (v3)

The app supports Android share intent for text content.

Users can:

- share a URL or message from any app
- open AI Scam Shield directly from the share menu
- trigger automatic scam analysis without copy/paste

Flow:

Share → AI Scam Shield → automatic scan → result

When the same shared input is received again, the app reuses the last successful result instead of consuming another scan.

---

## Tech stack

- Flutter
- Dart
- RevenueCat
- REST API integration
- Local device ID generation

---

## Project structure

```text
lib/
  core/
  features/
  i18n/
```

Main feature modules include:

- `features/scan`
- `features/premium`

---

## Run locally

### Backend API

From the `api/` folder:

```bash
docker compose up --build
```

The API will be exposed on:

```text
http://localhost:3000
```

### Flutter app

From the `app/` folder:

```bash
flutter pub get
flutter run
```

For the Android emulator, the app connects to the backend through:

```text
http://10.0.2.2:3000
```

Make sure the backend API is running before launching the app.

---

## Internationalization

Base language files are stored in:

```text
assets/i18n/
```

Current app setup includes:

- English
- Spanish
- French

The UI uses directional layout utilities such as:

- `EdgeInsetsDirectional`
- `AlignmentDirectional`
- `TextAlign.start/end`

This keeps the app ready for RTL languages in the future.

---

## Notes

- The Flutter app does not call Ollama directly.
- All AI analysis is performed by the backend API.
- Free and premium limits are enforced server-side.
- In development, the app runs against the Dockerized backend API.
- In release builds, the app uses the deployed production backend.

---

## Future improvements

- polish UI/UX
- improve premium onboarding
- add more languages
- enrich result explanations
- add history or saved scans
