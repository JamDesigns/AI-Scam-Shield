import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';

class PaywallService {
  static const entitlementId = 'scam_shield_pro';

  static Future<bool> isPremium() async {
    final info = await Purchases.getCustomerInfo();
    return info.entitlements.active.containsKey(entitlementId);
  }

  static Future<bool> openPaywall() async {
    final result = await RevenueCatUI.presentPaywallIfNeeded(entitlementId);
    return result == PaywallResult.purchased ||
        result == PaywallResult.restored;
  }
}
