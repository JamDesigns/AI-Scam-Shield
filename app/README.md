# AI Scam Shield mobile client

The Flutter app is installed on the phone from Google Play or Apple App Store and communicates over HTTPS with the API deployed on a remote server. The API accesses PostgreSQL on another remote server. The client does not host the API, connect directly to PostgreSQL or require the developer's computer for production use.

## Two independent builds

| Platform | Publication artefact | Channel | Status |
|---|---|---|---|
| Android | `.aab` | Google Play Console → Google Play | Implementation undergoing validation; debug APK available for testing, release publication pending |
| iOS | `.ipa` | App Store Connect/TestFlight → App Store | Native implementation and validation pending |

The platforms share Dart code, but each needs its own native project, identifier, service configuration, signing and testing. A debug APK does not replace the signed AAB for Google Play; it cannot be installed on iOS either. The `ios/` folder does not yet represent an app ready for App Store.

## API selection

`lib/core/app_config.dart` allows `API_BASE_URL` to be defined at build time. Both distribution builds must explicitly point to the same remote HTTPS service:

```sh
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com
```

Once iOS has been implemented and configured, run this on macOS with Xcode:

```sh
flutter build ipa --release --dart-define=API_BASE_URL=https://api.example.com
```

Replace the example domain with the actual API server. Android produces the AAB under `build/app/outputs/bundle/release/`; iOS produces the archive and IPA under `build/ios/archive/` and `build/ios/ipa/`. Signing, the build number and store accounts are configured separately for each platform. These two publication artefacts have not been generated as part of this delivery.

The code retains a historical release URL in `AppConfig` and an Android emulator debug value. Do not assume these values correspond to the final deployment: use the explicit parameter for every build. An API URL is public configuration; PostgreSQL credentials, private AI keys and server secrets must never be passed through `--dart-define` or included in the mobile package.

## Current features and pending iOS work

The client includes text/URL, image and short-video analysis, Free/Premium quotas, statistics, a protected session and 25 languages. On Android, it receives shared text and files and allows images/videos to be selected; the content and its accompanying message form one operation.

For iOS, native share reception and its permissions/capabilities, Firebase configuration, the RevenueCat SDK and purchases for Apple, signing, and plugin/device validation are still pending. The current purchase code configures Android; running `flutter build ipa` alone does not complete the Apple version.

The API determines results, quotas and effective Premium access. Free allows 3 results/week: the first uses AI for any content type, and the other 2 cover text/URLs without AI. Premium always uses AI with no commercial weekly quota. An AI failure is not converted into a conventional result that pretends to be an AI analysis.

## Development checks

From this folder:

```sh
flutter pub get
flutter test
flutter analyze
```

To test against a remote test API, use its HTTPS URL in `flutter run --dart-define=API_BASE_URL=https://api-staging.example.com`.

Only when using the **local** Docker API:

- The Android emulator reaches the computer through `http://10.0.2.2:3000`.
- An Android phone connected by USB can use `adb reverse tcp:3000 tcp:3000` and `flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000`.
- These HTTP values and the USB cable are specific to development; they are not used in store builds.

The existing local API and DB are reused. The legal policies in `assets/legal/` are generated alongside the pages in `docs/`; see [language maintenance](../docs/README.md). See [the overall architecture](../README.md) for remote deployment and the two publication channels.
