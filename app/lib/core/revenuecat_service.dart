import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';

import 'app_config.dart';

class RevenueCatService {
  RevenueCatService._();

  static bool _configured = false;

  static bool _isTestKey(String key) => key.startsWith('test_');

  static Future<void> initialize({required String appUserId}) async {
    if (_configured) return;

    if (Platform.isAndroid) {
      const apiKey = AppConfig.revenueCatAndroidApiKey;

      // IMPORTANT:
      // RevenueCat will crash the app in release if a Test Store key is used.
      // Until Play Store is configured in RevenueCat, we must skip setup in release.
      if (kReleaseMode && _isTestKey(apiKey)) {
        debugPrint(
            'RevenueCat disabled in release because a Test Store API key is configured.');
        return;
      }

      await Purchases.configure(
        PurchasesConfiguration(apiKey)..appUserID = appUserId,
      );
    }

    _configured = true;
  }

  static Future<void> openManageSubscriptions() async {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (e, st) {
      debugPrint('Customer Center error: $e');
      debugPrintStack(stackTrace: st);
    }
  }

  static Future<void> presentPaywall() async {
    try {
      if (Platform.isAndroid) {
        const apiKey = AppConfig.revenueCatAndroidApiKey;
        if (kReleaseMode && _isTestKey(apiKey)) {
          throw StateError(
              'Premium is not available in release until Play Store is configured.');
        }
      }

      await RevenueCatUI.presentPaywall();
    } catch (e, st) {
      debugPrint('Paywall error: $e');
      debugPrintStack(stackTrace: st);
      rethrow;
    }
  }

  static Future<void> restorePurchases() async {
    try {
      if (Platform.isAndroid) {
        const apiKey = AppConfig.revenueCatAndroidApiKey;
        if (kReleaseMode && _isTestKey(apiKey)) {
          throw StateError(
              'Restore is not available in release until Play Store is configured.');
        }
      }

      await Purchases.restorePurchases();
    } catch (e, st) {
      debugPrint('Restore purchases error: $e');
      debugPrintStack(stackTrace: st);
      rethrow;
    }
  }
}
