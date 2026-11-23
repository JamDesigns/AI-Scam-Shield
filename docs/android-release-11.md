# Android release 11: 16 KB verification

Prepared 23 November 2026. Version `3.3.0+11` was built, signed and verified locally. The subsequent Play Console screenshots confirm that version 11 was uploaded to closed testing and is marked ready to publish, with version 10 excluded. Completion of the rollout has not been confirmed.

## Dependency correction

`shared_preferences_android` is pinned to `2.4.21`, the minimal upstream fix for the DataStore regression in `2.4.20`. Its [official changelog](https://pub.dev/packages/shared_preferences_android/versions/2.4.21/changelog) reverts DataStore from `1.2.0` to `1.1.7`. The existing Flutter 3.41.2/Dart 3.11.0 and Android build configuration are retained. Only one Dart dependency changed in the lockfile; `shared_preferences` remains `2.5.4`.

The actual `releaseRuntimeClasspath` dependency report confirms DataStore `1.1.7`. No Gradle force rules, dependency exclusions, native-library deletion or storage migration were added. `libdatastore_shared_counter.so` remains packaged as expected, with different binary hashes from version 10.

## Distribution artifact

| Field | Verified value |
| --- | --- |
| Local artifact | `local-validation/outputs/AI-Scam-Shield-3.3.0-11-play.aab` |
| Package | `com.jamdesigns.scamshield` |
| Version name / code | `3.3.0` / `11` |
| Size | 129,138,326 bytes |
| SHA-256 | `e36a2f4f8f3ddbd6ee75317bf15087eb2595e4d3f5b78723324b6422653e27ff` |
| Upload certificate SHA-256 | `7F:68:21:D3:C3:05:DB:AC:CD:2B:37:6C:C8:77:3C:32:0F:DE:A5:C6:98:A2:02:E3:7D:51:A1:7B:54:FB:5A:77` |
| Minimum / target SDK | 24 / 36, unchanged from version 10 |
| Native packaging | `PAGE_ALIGNMENT_16K` |

`jarsigner -verify` and Google bundletool 1.18.3 validation succeeded. The upload certificate matches the preserved version 10 AAB. This is the upload certificate; Google Play App Signing uses its separately configured distribution identity.

All 13 packaged 64-bit libraries across `arm64-v8a` and `x86_64` passed ELF LOAD alignment, address/file-offset congruence and RELRO checks. All 87 APK splits generated from this AAB passed Android SDK `zipalign -c -P 16 4`. Those diagnostic APKs use an existing debug keystore solely for local inspection; distribute the signed AAB listed above.

The 32-bit ML Kit OCR binary has 4 KB alignment. It is recorded separately and is outside Android's 16 KB requirement for 64-bit devices. No ABI was removed. The original local version 10 AAB also passed our static ELF checks, so the reported Play warning was not independently reproduced from that local copy. Updating the defective dependency is verified; disappearance of a warning in Play Console must be checked against version code 11 after upload. See [Android's verification guidance](https://developer.android.com/guide/practices/page-sizes).

## Preserved data and configuration

The existing release-signing properties, Firebase configuration, Android app Gradle file, Gradle properties and API configuration file match their recorded hashes from before the correction. The package identifier, API endpoint, public Google web client configuration and RevenueCat configuration are retained. All 53 bundled legal, language, branding and model assets match version 10 byte for byte, including 25 privacy-policy locales.

The app continues to use its existing SharedPreferences API, key names and secure-session storage. No preference clearing, reinstall, database operation or production deployment was performed. Installed-user data has not been touched; an on-device upgrade was not exercised in this session.

## Edge-to-edge warning

The app targets Android 16/API 36 and uses Flutter's default edge-to-edge behavior. There is no opt-out in the app's Android styles. Existing `SafeArea`, app bars and navigation handling were reviewed. Flutter's [migration guidance](https://docs.flutter.dev/release/breaking-changes/default-systemuimode-edge-to-edge) confirms the default behavior for this target.

The installed Flutter embedding still contains calls to deprecated `Window.setStatusBarColor`, `Window.setNavigationBarColor` and `Window.setNavigationBarDividerColor`; bytecode inspection was saved locally. `FlutterActivity` guards its status-bar color call below API 35. These SDK references can explain a static Play advisory even when the app respects system insets. The exact Console advisory was not available in this session, so its call-site list and disappearance are not claimed as verified. No Flutter SDK patch or target-SDK reduction was made.

Flutter analysis passed without issues. All 386 Flutter tests passed; 25 optional visual screenshot cases were skipped. The passing suite includes 150 edge-to-edge/account inset scenarios across 25 locales, portrait/landscape, gestures/three-button navigation, keyboard and enlarged text. These are widget-level checks; native sign-in, picker and purchase surfaces still need a device check on Android 15/16.

No Android device was connected. Runtime testing on a device or emulator reporting `adb shell getconf PAGE_SIZE` as `16384`, and the installed-user upgrade flow from Play, remain pending.

## Repeatable checks and evidence

From the repository root:

```powershell
python -B -m unittest discover -s app/tool -p test_verify_android_16kb.py -v
python app/tool/verify_android_16kb.py local-validation/outputs/AI-Scam-Shield-3.3.0-11-play.aab --json local-validation/outputs/release-11-elf-16kb.json
```

The checker has seven passing binary-fixture tests, including rejection of 4 KB LOAD segments and unsafe RELRO/writable-page overlap. Its scope is packaged ELF layout; bundletool and APK ZIP alignment are separate checks.

Local evidence is under ignored `local-validation/outputs/`: `release-11-audit.json`, `release-11-datastore-dependencies.log`, `release-11-bundle-validation.txt`, `release-11-bundle-config.json`, `release-11-manifest.xml`, `release-11-elf-16kb.json`, `release-11-apk-zipalign.json`, `release-11-flutter-analyze.log`, `release-11-flutter-tests.log` and `release-11-flutter-system-bars-bytecode.txt`. The numbered AAB and its `.sha256` file are preserved there alongside versions 9 and 10.

## Play release notes

> Mejoras de compatibilidad con dispositivos Android que utilizan páginas de memoria de 16 KB. Se mantienen los datos, la configuración y las funciones existentes.

Version code 11 is already uploaded to the closed-testing track. Inspect its own 16 KB and edge-to-edge diagnostics, confirm the testing rollout, then check an upgrade and the native screens before promoting it. The screenshots establish upload and publication readiness, not a completed rollout or on-device acceptance.
