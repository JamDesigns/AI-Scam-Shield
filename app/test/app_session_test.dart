import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/core/app_session.dart';

const sessionJson = {
  'deviceId': '78124de4-3cae-4772-a18a-d3e3c74d234f',
  'accessToken': 'test-only-token-with-more-than-thirty-two-characters',
  'timeZone': 'Europe/Madrid',
};

class MemorySessionStorage implements SessionStorage {
  @override
  Future<void> delete() async {
    value = null;
  }

  String? value;
  bool failRead = false;
  bool failWrite = false;
  @override
  Future<String?> read() async {
    if (failRead) throw StateError('Storage unavailable');
    return value;
  }

  @override
  Future<void> write(String next) async {
    if (failWrite) throw StateError('Storage unavailable');
    value = next;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('forget removes persisted credentials and enrols a fresh identity', () async {
    final storage = MemorySessionStorage()..value = jsonEncode(sessionJson);
    var enrolments = 0;
    final client = MockClient((_) async {
      enrolments++;
      return http.Response(jsonEncode({...sessionJson,
        'deviceId': '78124de4-3cae-4772-a18a-d3e3c74d234e',
      }), 201);
    });
    final repository = SessionRepository(storage: storage, client: client,
        baseUrl: 'https://example.test', readTimeZone: () async => 'Europe/Madrid');
    expect((await repository.getOrCreate()).deviceId, sessionJson['deviceId']);
    await repository.forget();
    expect(storage.value, isNull);
    expect((await repository.getOrCreate()).deviceId, '78124de4-3cae-4772-a18a-d3e3c74d234e');
    expect(enrolments, 1);
    client.close();
  });

  test('travelling does not change the registered quota calendar zone',
      () async {
    final storage = MemorySessionStorage()..value = jsonEncode(sessionJson);
    var enrolments = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/sessions') enrolments++;
      expect(request.headers['x-time-zone'], 'Europe/Madrid');
      return http.Response('{}', 200);
    });
    final repository = SessionRepository(
        storage: storage,
        client: client,
        baseUrl: 'https://example.test',
        readTimeZone: () async => 'Europe/London');
    final session = await repository.getOrCreate();
    final api = ApiClient(
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        timeZone: session.timeZone,
        localeLanguageCode: 'en-GB',
        client: client,
        baseUrl: 'https://example.test');
    await api.getJson('/usage/week');
    expect(session.timeZone, 'Europe/Madrid');
    expect(enrolments, 0);
    api.close();
  });

  test('concurrent screens enrol once and ignore the legacy preference ID',
      () async {
    SharedPreferences.setMockInitialValues(
        {'device_id': 'untrusted-legacy-id'});
    var posts = 0;
    final storage = MemorySessionStorage();
    final client = MockClient((request) async {
      posts++;
      expect(request.url.path, '/sessions');
      expect(jsonDecode(request.body), {'timeZone': 'Europe/Madrid'});
      expect(request.headers.containsKey('x-device-id'), isFalse);
      expect(request.headers.containsKey('authorization'), isFalse);
      return http.Response(jsonEncode(sessionJson), 201);
    });
    final repository = SessionRepository(
        storage: storage,
        client: client,
        baseUrl: 'https://example.test',
        readTimeZone: () async => 'Europe/Madrid');
    final sessions = await Future.wait([
      repository.getOrCreate(),
      repository.getOrCreate(),
    ]);
    expect(posts, 1);
    expect(sessions[0].deviceId, sessionJson['deviceId']);
    expect(sessions[1].accessToken, sessions[0].accessToken);
    expect(jsonDecode(storage.value!), sessionJson);
    client.close();
  });

  test('401 retains ID and token and never creates a replacement session',
      () async {
    var enrolments = 0;
    final storage = MemorySessionStorage()..value = jsonEncode(sessionJson);
    final httpClient = MockClient((request) async {
      if (request.url.path == '/sessions') enrolments++;
      expect(request.headers['authorization'],
          'Bearer ${sessionJson['accessToken']}');
      expect(request.headers['x-device-id'], sessionJson['deviceId']);
      return http.Response('{"error":"session_invalid"}', 401);
    });
    final repository = SessionRepository(
        storage: storage, client: httpClient, baseUrl: 'https://example.test');
    final session = await repository.getOrCreate();
    final api = ApiClient(
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        timeZone: session.timeZone,
        localeLanguageCode: 'en-GB',
        baseUrl: 'https://example.test',
        client: httpClient);
    await expectLater(
        api.getJson('/usage/week'),
        throwsA(isA<ApiException>()
            .having((e) => e.errorCode, 'code', 'session_invalid')));
    final retained = await repository.getOrCreate();
    expect(retained.deviceId, session.deviceId);
    expect(retained.accessToken, session.accessToken);
    expect(enrolments, 0);
    expect(jsonDecode(storage.value!), sessionJson);
    api.close();
  });

  test('corrupt or inaccessible secure storage fails closed without enrolment',
      () async {
    for (final failRead in [false, true]) {
      final storage = MemorySessionStorage()
        ..value = '{"deviceId":"legacy-without-token"}'
        ..failRead = failRead;
      var posts = 0;
      final client = MockClient((_) async {
        posts++;
        return http.Response(jsonEncode(sessionJson), 201);
      });
      final repository = SessionRepository(
          storage: storage, client: client, baseUrl: 'https://example.test');
      await expectLater(
          repository.getOrCreate(),
          throwsA(isA<SessionException>()
              .having((e) => e.code, 'code', 'session_storage')));
      expect(posts, 0);
      client.close();
    }
  });

  test('a failed secure write retries persistence instead of enrolling again',
      () async {
    var posts = 0;
    final storage = MemorySessionStorage()..failWrite = true;
    final client = MockClient((_) async {
      posts++;
      return http.Response(jsonEncode(sessionJson), 201);
    });
    final repository = SessionRepository(
        storage: storage,
        client: client,
        baseUrl: 'https://example.test',
        readTimeZone: () async => 'Europe/Madrid');
    await expectLater(
        repository.getOrCreate(), throwsA(isA<SessionException>()));
    storage.failWrite = false;
    expect((await repository.getOrCreate()).deviceId, sessionJson['deviceId']);
    expect(posts, 1);
    client.close();
  });
}
