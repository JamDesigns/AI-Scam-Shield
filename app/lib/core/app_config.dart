import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _devApiBaseUrl = 'http://10.0.2.2:3000';
  static const String _prodApiBaseUrl = 'https://ai-scam-shield.onrender.com';

  static String get apiBaseUrl {
    return kReleaseMode ? _prodApiBaseUrl : _devApiBaseUrl;
  }

  // RevenueCat public SDK key.
  // Use a test key for debug builds and a production key for release builds.
  static const String revenueCatAndroidApiKey = String.fromEnvironment(
    'REVENUECAT_ANDROID_API_KEY',
    defaultValue: 'goog_jszKykytPhBoABGqPcRDKXpQztN',
  );
}
