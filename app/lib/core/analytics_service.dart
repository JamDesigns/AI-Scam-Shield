import 'package:firebase_analytics/firebase_analytics.dart';

class AnalyticsService {
  AnalyticsService._();

  static final FirebaseAnalytics _a = FirebaseAnalytics.instance;

  static Future<void> scanSubmitted({required int inputLength}) {
    return _a.logEvent(
      name: 'scan_submitted',
      parameters: {
        'input_length': inputLength,
      },
    );
  }

  static Future<void> scanResult({
    required int riskScore,
    required String category,
    required int reasonsCount,
    required bool isPremium,
  }) {
    return _a.logEvent(
      name: 'scan_result',
      parameters: {
        'risk_score': riskScore,
        'category': category,
        'reasons_count': reasonsCount,
        'is_premium': isPremium ? 1 : 0,
      },
    );
  }

  static Future<void> paywallOpened() {
    return _a.logEvent(name: 'paywall_opened');
  }

  static Future<void> premiumActivated({required String source}) {
    return _a.logEvent(
      name: 'premium_activated',
      parameters: {
        'source': source, // e.g. 'paywall'
      },
    );
  }
}
