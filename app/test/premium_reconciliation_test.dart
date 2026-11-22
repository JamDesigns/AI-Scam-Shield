import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/features/premium/premium_service.dart';

void main() {
  test(
      'purchase sync uses strict empty body and waits for verified server access',
      () async {
    var statuses = 0;
    var waits = 0;
    final api = ApiClient(
        deviceId: 'session-id',
        accessToken: 'test-only-token',
        timeZone: 'Europe/Madrid',
        localeLanguageCode: 'es',
        baseUrl: 'https://example.test',
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer test-only-token');
          if (request.url.path == '/subscriptions/sync') {
            expect(request.method, 'POST');
            expect(jsonDecode(request.body), isEmpty);
            return http.Response(
                '{"status":"queued","retryAfterSeconds":3}', 202);
          }
          statuses++;
          return http.Response(
              jsonEncode({
                'isPremium': statuses > 1,
                'syncAvailable': true,
                'syncPending': statuses == 1,
              }),
              200);
        }));
    final result = await PremiumService(api, wait: (_) async {
      waits++;
    }).reconcile();
    expect(result.isPremium, isTrue);
    expect(statuses, 2);
    expect(waits, 2);
    api.close();
  });

  test('missing server sync configuration never invents Premium', () async {
    final api = ApiClient(
        deviceId: 'session-id',
        accessToken: 'test-only-token',
        timeZone: 'Europe/Madrid',
        localeLanguageCode: 'es',
        baseUrl: 'https://example.test',
        client: MockClient((request) async {
          if (request.method == 'POST') {
            return http.Response(
                '{"error":"subscription_sync_unavailable"}', 503);
          }
          return http.Response(
              '{"isPremium":false,"syncAvailable":false,"syncPending":false}',
              200);
        }));
    final result = await PremiumService(api, wait: (_) async {}).reconcile();
    expect(result.isPremium, isFalse);
    expect(result.syncAvailable, isFalse);
    api.close();
  });
}
