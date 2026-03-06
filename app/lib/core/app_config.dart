class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  // RevenueCat public SDK key.
  // Use a test key for debug builds and a production key for release builds.
  static const String revenueCatAndroidApiKey = String.fromEnvironment(
    'REVENUECAT_ANDROID_API_KEY',
    defaultValue: 'test_QQuSbStvJkATyuhNVQzTYvnMprF',
  );
}
