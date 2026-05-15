import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _apiBaseUrlOverride = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const String _devApiBaseUrl = 'http://10.0.2.2:3000';
  static const String _prodApiBaseUrl = 'https://ai-scam-shield.onrender.com';

  static String get apiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) {
      return _apiBaseUrlOverride;
    }

    return kReleaseMode ? _prodApiBaseUrl : _devApiBaseUrl;
  }

  static const String appName = 'Scam Shield';

  static const String revenueCatAndroidApiKey = String.fromEnvironment(
    'REVENUECAT_ANDROID_API_KEY',
    defaultValue: 'goog_jszKykytPhBoABGqPcRDKXpQztN',
  );
}
