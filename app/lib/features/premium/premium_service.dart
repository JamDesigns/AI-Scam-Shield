import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';

import '../../core/api_client.dart';

class PremiumStatus {
  PremiumStatus({required this.isPremium});
  final bool isPremium;

  factory PremiumStatus.fromJson(Map<String, dynamic> json) {
    return PremiumStatus(isPremium: json['isPremium'] as bool? ?? false);
  }
}

class PremiumService {
  PremiumService(this._api);

  static const entitlementId = 'scam_shield_pro';

  final ApiClient _api;

  /// Source of truth: RevenueCat entitlement.
  Future<bool> isPremium() async {
    final info = await Purchases.getCustomerInfo();
    return info.entitlements.active.containsKey(entitlementId);
  }

  /// Presents the RevenueCat paywall if the entitlement is not active yet.
  /// Returns true if the user purchased or restored successfully.
  Future<bool> presentPaywallIfNeeded() async {
    final result = await RevenueCatUI.presentPaywallIfNeeded(entitlementId);

    return result == PaywallResult.purchased ||
        result == PaywallResult.restored;
  }

  /// Optional: backend mirror status (do NOT use as gating source of truth).
  Future<PremiumStatus> fetchBackendStatus() async {
    final json = await _api.getJson('/subscriptions/status');
    return PremiumStatus.fromJson(json);
  }
}
