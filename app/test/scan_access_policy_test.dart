import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_access_policy.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';

void main() {
  test('local SDK entitlement awaiting server verification cannot spend Free',
      () {
    final access = ScanAccessPolicy(
        isPremium: false,
        localPurchasePending: true,
        quota: AiQuotaStatus.fromJson({
          'totalWeeklyRemaining': 3,
          'nextAnalysisUsesAi': true,
          'subscriptionSyncPending': false
        }));
    expect(access.isSubscriptionPending, isTrue);
    expect(access.canAnalyzeMedia, isFalse);
    expect(access.isWeeklyLimitReached, isFalse);
  });

  test('restore without SDK entitlement or server pending state keeps Free',
      () {
    final access = ScanAccessPolicy(
        isPremium: false,
        localPurchasePending: false,
        quota: AiQuotaStatus.fromJson({
          'totalWeeklyRemaining': 3,
          'nextAnalysisUsesAi': true,
          'subscriptionSyncPending': false
        }));
    expect(access.isSubscriptionPending, isFalse);
    expect(access.canAnalyzeMedia, isTrue);
  });

  ScanAccessPolicy policy(int remaining, bool nextUsesAi) => ScanAccessPolicy(
        isPremium: false,
        quota: AiQuotaStatus.fromJson({
          'totalWeeklyRemaining': remaining,
          'nextAnalysisUsesAi': nextUsesAi,
        }),
      );

  test('the first free scan allows any modality with AI', () {
    expect(policy(3, true).canAnalyzeMedia, isTrue);
    expect(policy(3, true).isWeeklyLimitReached, isFalse);
  });

  test('the next two free scans allow text but no further media analysis', () {
    for (final remaining in [2, 1]) {
      expect(policy(remaining, false).canAnalyzeMedia, isFalse);
      expect(policy(remaining, false).isWeeklyLimitReached, isFalse);
    }
  });

  test('an exhausted total quota blocks a contradictory AI flag', () {
    expect(policy(0, true).isWeeklyLimitReached, isTrue);
    expect(policy(0, true).canAnalyzeMedia, isFalse);
  });

  test('Premium retains unlimited media even after the former free quota', () {
    final access = ScanAccessPolicy(
      isPremium: true,
      quota: AiQuotaStatus.fromJson({'totalWeeklyRemaining': 0}),
    );
    expect(access.canAnalyzeMedia, isTrue);
    expect(access.isWeeklyLimitReached, isFalse);
  });

  test('unknown quota never promises free AI access', () {
    const access = ScanAccessPolicy(isPremium: false, quota: null);
    expect(access.canAnalyzeMedia, isFalse);
  });

  test(
      'pending subscription verification blocks free media without pretending exhaustion',
      () {
    final access = ScanAccessPolicy(
        isPremium: false,
        quota: AiQuotaStatus.fromJson({
          'totalWeeklyRemaining': 3,
          'nextAnalysisUsesAi': true,
          'subscriptionSyncPending': true
        }));
    expect(access.isSubscriptionPending, isTrue);
    expect(access.isWeeklyLimitReached, isFalse);
    expect(access.canAnalyzeMedia, isFalse);
  });
}
