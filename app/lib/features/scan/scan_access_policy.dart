import 'scan_models.dart';

/// Mirrors the product contract using the API's current quota snapshot.
/// Remaining text scans never imply access to a second free media analysis.
class ScanAccessPolicy {
  const ScanAccessPolicy({
    required this.isPremium,
    required this.quota,
    this.localPurchasePending = false,
  });

  final bool isPremium;
  final AiQuotaStatus? quota;
  final bool localPurchasePending;

  bool get isSubscriptionPending =>
      !isPremium &&
      (localPurchasePending || (quota?.subscriptionSyncPending ?? false));

  bool get isWeeklyLimitReached {
    if (isPremium) return false;
    final totalRemaining = quota?.totalWeeklyRemaining;
    if (totalRemaining != null) return totalRemaining <= 0;
    return (quota?.weeklyRemaining ?? 1) <= 0 &&
        (quota?.aiWeeklyRemaining ?? 1) <= 0;
  }

  bool get canAnalyzeMedia =>
      !isSubscriptionPending &&
      !isWeeklyLimitReached &&
      (isPremium ||
          (quota?.nextAnalysisUsesAi ?? ((quota?.aiWeeklyRemaining ?? 0) > 0)));
}
