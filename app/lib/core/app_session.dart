import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'app_platform.dart';

class AppSession {
  const AppSession({
    required this.deviceId,
    required this.accessToken,
    required this.timeZone,
  });

  final String deviceId;
  final String accessToken;
  final String timeZone;

  factory AppSession.fromJson(Map<String, dynamic> value) {
    final id = value['deviceId'];
    final token = value['accessToken'];
    final zone = value['timeZone'];
    if (id is! String ||
        !RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
            .hasMatch(id) ||
        token is! String ||
        token.length < 32 ||
        zone is! String ||
        zone.isEmpty) {
      throw const FormatException('Incomplete secure session');
    }
    return AppSession(deviceId: id, accessToken: token, timeZone: zone);
  }

  Map<String, String> toJson() => {
        'deviceId': deviceId,
        'accessToken': accessToken,
        'timeZone': timeZone,
      };
}

abstract class SessionStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> delete();
}

class SecureSessionStorage implements SessionStorage {
  static const _key = 'anonymous_api_session_v1';
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      resetOnError: false,
    ),
  );

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
  @override
  Future<void> delete() => _storage.delete(key: _key);
}

class SessionException implements Exception {
  const SessionException(this.code);
  final String code;

  String get translationKey => switch (code) {
        'session_storage' => 'errors.sessionStorage',
        'session_invalid' => 'errors.sessionInvalid',
        'enrollment_rate_limited' => 'errors.enrollmentRateLimited',
        _ => 'errors.sessionUnavailable',
      };

  @override
  String toString() => 'SessionException($code)';
}

/// Never reads or claims a legacy device ID from ordinary preferences.
/// A 401 from an authenticated request does not call this enrolment endpoint.
class SessionRepository {
  SessionRepository({
    required SessionStorage storage,
    http.Client? client,
    String? baseUrl,
    Future<String> Function()? readTimeZone,
  })  : _storage = storage,
        _client = client ?? http.Client(),
        _baseUrl = baseUrl,
        _readTimeZone = readTimeZone ?? AppPlatform.timeZone;

  static final instance = SessionRepository(storage: SecureSessionStorage());

  final SessionStorage _storage;
  final http.Client _client;
  final String? _baseUrl;
  final Future<String> Function() _readTimeZone;
  Future<AppSession>? _loading;
  AppSession? _session;
  AppSession? _pendingPersistence;

  Future<void> forget() async {
    if (_loading != null) await _loading;
    _session = null;
    _pendingPersistence = null;
    await _storage.delete();
  }

  Future<AppSession> getOrCreate() async {
    if (_session != null) return _session!;
    if (_loading != null) return _loading!;
    final loading = _loadOrEnroll();
    _loading = loading;
    try {
      return await loading;
    } finally {
      _loading = null;
    }
  }

  Future<AppSession> _loadOrEnroll() async {
    if (_pendingPersistence != null) {
      return _persist(_pendingPersistence!);
    }

    String? stored;
    try {
      stored = await _storage.read();
    } catch (_) {
      throw const SessionException('session_storage');
    }
    if (stored != null) {
      try {
        final value = json.decode(stored);
        if (value is! Map<String, dynamic>) throw const FormatException();
        return _session = AppSession.fromJson(value);
      } catch (_) {
        // Fail closed on corrupt stored data; never silently replace identity.
        throw const SessionException('session_storage');
      }
    }

    final zone = await _readTimeZone();
    http.Response response;
    try {
      response = await _client
          .post(
            Uri.parse('${_baseUrl ?? AppConfig.apiBaseUrl}/sessions'),
            headers: {
              'content-type': 'application/json',
              'accept': 'application/json'
            },
            body: json.encode({'timeZone': zone}),
          )
          .timeout(const Duration(seconds: 20));
    } catch (_) {
      throw const SessionException('session_unavailable');
    }
    if (response.statusCode != 201) {
      if (response.statusCode == 429) {
        throw const SessionException('enrollment_rate_limited');
      }
      throw const SessionException('session_unavailable');
    }

    AppSession session;
    try {
      session = AppSession.fromJson(
          json.decode(response.body) as Map<String, dynamic>);
    } catch (_) {
      throw const SessionException('session_unavailable');
    }
    _pendingPersistence = session;
    return _persist(session);
  }

  Future<AppSession> _persist(AppSession session) async {
    try {
      // One encrypted value keeps ID, token and calendar zone together.
      await _storage.write(json.encode(session.toJson()));
    } catch (_) {
      throw const SessionException('session_storage');
    }
    _pendingPersistence = null;
    return _session = session;
  }
}
