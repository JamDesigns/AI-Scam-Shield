import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../core/api_client.dart';

class PremiumStatus {
  PremiumStatus({
    required this.isPremium,
    this.syncAvailable = false,
    this.syncPending = false,
    this.expiresAt,
    this.environment,
  });
  final bool isPremium;
  final bool syncAvailable;
  final bool syncPending;
  final String? expiresAt;
  final String? environment;

  factory PremiumStatus.fromJson(Map<String, dynamic> json) => PremiumStatus(
        isPremium: json['isPremium'] == true,
        syncAvailable: json['syncAvailable'] == true,
        syncPending: json['syncPending'] == true,
        expiresAt: json['expiresAt'] as String?,
        environment: json['environment'] as String?,
      );
}

class PremiumService {
  PremiumService(this._api, {Future<void> Function(Duration)? wait})
      : _wait = wait ?? Future<void>.delayed;

  static const entitlementId = 'scam_shield_pro';
  final ApiClient _api;
  final Future<void> Function(Duration) _wait;

  /// The server verifies RevenueCat state. Local SDK state never grants API access.
  Future<bool> isPremium() async => (await fetchBackendStatus()).isPremium;

  Future<bool> sdkHasEntitlement() async => (await Purchases.getCustomerInfo())
      .entitlements
      .active
      .containsKey(entitlementId);

  Future<bool> presentPaywallIfNeeded() async {
    final result = await RevenueCatUI.presentPaywallIfNeeded(entitlementId);
    return result == PaywallResult.purchased ||
        result == PaywallResult.restored ||
        result == PaywallResult.notPresented;
  }

  Future<PremiumStatus> fetchBackendStatus() async =>
      PremiumStatus.fromJson(await _api.getJson('/subscriptions/status'));

  Future<PremiumStatus> reconcile() async {
    Map<String, dynamic> queued;
    try {
      queued = await _api.postJson('/subscriptions/sync', {},
          includeOutputLanguage: false);
    } on ApiException catch (error) {
      if (error.errorCode == 'subscription_sync_unavailable') {
        return fetchBackendStatus();
      }
      rethrow;
    }
    final seconds = ((queued['retryAfterSeconds'] as num?)?.toInt() ?? 3)
        .clamp(1, 5)
        .toInt();
    for (var attempt = 0; attempt < 4; attempt++) {
      await _wait(Duration(seconds: seconds));
      final status = await fetchBackendStatus();
      if (status.isPremium || !status.syncPending) return status;
    }
    return fetchBackendStatus();
  }
}
