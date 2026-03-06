class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://ai-scam-shield.onrender.com',
  );

  // RevenueCat public SDK key.
  // Use a test key for debug builds and a production key for release builds.
  static const String revenueCatAndroidApiKey = String.fromEnvironment(
    'REVENUECAT_ANDROID_API_KEY',
    defaultValue: 'goog_jszKykytPhBoABGqPcRDKXpQztN',
  );
}
