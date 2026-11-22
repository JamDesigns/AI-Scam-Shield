import 'api_client.dart';
import 'app_session.dart';

String apiErrorKey(Object error, {String fallback = 'errors.network'}) {
  if (error is SessionException) return error.translationKey;
  if (error is! ApiException) return fallback;
  if (error.statusCode == 401 || error.errorCode == 'session_invalid') {
    return 'errors.sessionInvalid';
  }
  return switch (error.errorCode) {
    'time_zone_mismatch' => 'errors.timeZoneMismatch',
    'enrollment_rate_limited' => 'errors.enrollmentRateLimited',
    'subscription_sync_unavailable' => 'premium.syncUnavailable',
    'subscription_sync_pending' => 'premium.activating',
    'subscription_sync_rate_limited' || 'rate_limited' => 'errors.rateLimited',
    'quota_exceeded' => 'errors.weeklyLimitExceeded',
    'ai_quota_exceeded' => 'errors.mediaAiQuota',
    'scan_in_progress' || 'idempotency_conflict' => 'errors.scanInProgress',
    'timeout' || 'operation_timeout' => 'errors.analysisTimeout',
    'invalid_ai_analysis' ||
    'forensics_pending' =>
      'errors.analysisUnavailable',
    'translation_unavailable' => 'errors.translationUnavailable',
    _ => fallback,
  };
}
