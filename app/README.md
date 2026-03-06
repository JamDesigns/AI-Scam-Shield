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

From the `app/` folder:

```bash
flutter create .
flutter pub get
flutter run
```

> Make sure the backend API is running and accessible from the emulator or device.

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

---

## Future improvements

- polish UI/UX
- improve premium onboarding
- add more languages
- enrich result explanations
- add history or saved scans
