import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_session.dart';

import 'api_client.dart';
import 'revenuecat_service.dart';

/// Codes only: never include provider messages, tokens, email or response bodies.
class AccountStepException implements Exception {
  const AccountStepException(this.stage, this.code);
  final String stage;
  final String code;
}

Future<T> _accountStep<T>(String stage, Future<T> Function() action) async {
  try {
    return await action();
  } catch (error) {
    String code;
    if (error is GoogleSignInException) {
      code = error.code.name;
    } else if (error is FirebaseAuthException) {
      // Native Auth sometimes wraps a useful configuration code as "unknown".
      // Expose only recognized constants, never the raw native message.
      const knownCodes = [
        'CONFIGURATION_NOT_FOUND',
        'API_KEY_INVALID',
        'API_KEY_SERVICE_BLOCKED',
        'API_KEY_ANDROID_APP_BLOCKED',
        'PROJECT_NOT_FOUND',
        'OPERATION_NOT_ALLOWED',
        'INVALID_IDP_RESPONSE',
        'INVALID_OAUTH_CLIENT_ID',
        'NETWORK_REQUEST_FAILED',
        'TOO_MANY_ATTEMPTS_TRY_LATER',
        'APP_NOT_AUTHORIZED',
        'BILLING_NOT_ENABLED',
      ];
      final message = (error.message ?? '').toUpperCase();
      final nativeCode = knownCodes.firstWhere(
        (value) => message.contains(value),
        orElse: () => error.code,
      );
      const nativeReasons = {
        'REQUESTS FROM THIS ANDROID': 'android_client_blocked',
        'API KEY NOT VALID': 'api_key_invalid',
        'API HAS NOT BEEN USED': 'api_not_enabled',
        'API IS DISABLED': 'api_disabled',
        'ACCESS_NOT_CONFIGURED': 'api_not_configured',
        'BLOCKED': 'request_blocked',
        'NETWORK': 'network_failure',
        'CONNECTION': 'connection_failure',
        'AUDIENCE': 'token_audience_mismatch',
        'DEVELOPER_ERROR': 'google_developer_error',
      };
      code = nativeCode;
      if (nativeCode == 'unknown') {
        code = 'firebase_unknown';
        for (final reason in nativeReasons.entries) {
          if (message.contains(reason.key)) {
            code = reason.value;
            break;
          }
        }
      }
    } else if (error is PlatformException) {
      code = error.code;
    } else if (error is ApiException) {
      code = 'http_${error.statusCode}_${error.errorCode ?? "unknown"}';
    } else {
      code = error.runtimeType.toString();
    }
    final safe =
        RegExp(r'^[a-zA-Z0-9_-]{1,100}$').hasMatch(code) ? code : 'unknown';
    throw AccountStepException(stage, safe);
  }
}

class PremiumAccountStatus {
  const PremiumAccountStatus(
      {required this.linked,
      required this.activeOnThisDevice,
      required this.isPremium,
      this.accountId,
      this.deletionAvailable = false,
      this.revenueCatAppUserId});
  final bool linked;
  final bool activeOnThisDevice;
  final bool isPremium;
  final bool deletionAvailable;
  final String? accountId;
  final String? revenueCatAppUserId;
  factory PremiumAccountStatus.fromJson(Map<String, dynamic> value) =>
      PremiumAccountStatus(
          linked: value['linked'] == true,
          activeOnThisDevice: value['activeOnThisDevice'] == true,
          isPremium: value['isPremium'] == true,
          deletionAvailable: value['deletionAvailable'] == true,
          accountId: value['accountId'] as String?,
          revenueCatAppUserId: value['revenueCatAppUserId'] as String?);
}

/// The store SDK is always external, independent of the API's local/production URL.
class PremiumAccountService {
  PremiumAccountService(this.api);
  final ApiClient api;
  static Future<void>? _googleInitialization;

  Future<PremiumAccountStatus> status() async =>
      PremiumAccountStatus.fromJson(await api.getJson('/accounts/status'));

  Future<String> _authenticateGoogle() async {
    const clientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
    await _accountStep(
        'google_init',
        () => _googleInitialization ??= GoogleSignIn.instance
            .initialize(serverClientId: clientId.isEmpty ? null : clientId));
    final googleUser = await _accountStep(
        'google_sign_in', () => GoogleSignIn.instance.authenticate());
    final googleIdToken = googleUser.authentication.idToken;
    if (googleIdToken == null) throw StateError('account_identity_unavailable');
    final credential = await _accountStep(
        'firebase_sign_in',
        () => FirebaseAuth.instance.signInWithCredential(
            GoogleAuthProvider.credential(idToken: googleIdToken)));
    final idToken = await _accountStep(
        'firebase_token', () async => credential.user?.getIdToken(true));
    if (idToken == null) throw StateError('account_identity_unavailable');
    return idToken;
  }

  Future<PremiumAccountStatus> _link(String token) async {
    final value = PremiumAccountStatus.fromJson(await _accountStep(
        'api_link',
        () => api.postJson('/accounts/link', {},
            includeOutputLanguage: false, accountIdentityToken: token)));
    final ownerId = value.revenueCatAppUserId;
    if (ownerId == null || ownerId.isEmpty) {
      throw StateError('account_identity_unavailable');
    }
    await _accountStep(
        'revenuecat', () => RevenueCatService.initialize(appUserId: ownerId));
    return value;
  }

  Future<PremiumAccountStatus> signInGoogle() async =>
      _link(await _authenticateGoogle());

  Future<void> requestDeletion({required bool confirmed}) async {
    if (!confirmed) throw StateError('deletion_confirmation_required');
    final token = await _authenticateGoogle();
    final result = await _accountStep(
        'account_delete',
        () => api.postJson('/accounts/delete', {'confirm': true},
            includeOutputLanguage: false, accountIdentityToken: token));
    if (result['accepted'] != true) throw StateError('deletion_not_accepted');
    // The server owns the durable deletion job; closing the app cannot cancel it.
    await (await SharedPreferences.getInstance()).clear();
    await SessionRepository.instance.forget();
    await FirebaseAuth.instance.signOut();
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
    try {
      await RevenueCatService.clearAccountIdentity();
    } catch (_) {}
  }

  Future<PremiumAccountStatus> restore() async {
    final linked = await signInGoogle();
    if (!linked.linked) throw StateError('account_required');
    await RevenueCatService.restorePurchases();
    await api.postJson('/subscriptions/sync', {}, includeOutputLanguage: false);
    // Ownership is not transferred here. Explicit activation performs server verification.
    return status();
  }

  Future<PremiumAccountStatus> activate({required bool confirmed}) async {
    if (!confirmed) throw StateError('device_activation_confirmation_required');
    // Reauthentication gives the backend a recent auth_time; refreshing an old token does not.
    final token = await _authenticateGoogle();
    await _link(token);
    return PremiumAccountStatus.fromJson(await api.postJson(
        '/accounts/activate', {'confirm': true},
        includeOutputLanguage: false, accountIdentityToken: token));
  }

  Future<void> useLinkedRevenueCatIdentity() async {
    final current = await status();
    final ownerId = current.revenueCatAppUserId;
    if (ownerId != null) await RevenueCatService.initialize(appUserId: ownerId);
  }
}
