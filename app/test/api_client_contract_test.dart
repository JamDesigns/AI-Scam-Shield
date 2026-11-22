import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/features/scan/scan_service.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

void main() {
  test('analysis uses effective app language, IANA zone and retry key',
      () async {
    final effective = AppLocalizations.resolveLocale(const Locale('xx', 'ZZ'));
    final client = ApiClient(
      deviceId: 'test-device',
      accessToken: 'test-only-token',
      localeLanguageCode: effective.toLanguageTag(),
      timeZone: 'Europe/Madrid',
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        expect(request.headers['x-device-id'], 'test-device');
        expect(request.headers['authorization'], 'Bearer test-only-token');
        expect(request.headers['x-time-zone'], 'Europe/Madrid');
        expect(request.headers['Idempotency-Key'], 'same-operation-key');
        expect(jsonDecode(request.body)['outputLanguage'], 'en-GB');
        return http.Response('{"riskScore":20}', 200);
      }),
    );
    await ScanService(client)
        .scan('original input', idempotencyKey: 'same-operation-key');
    client.close();
  });

  test('separate QR signals remain complete when OCR reaches its text budget',
      () async {
    const url = 'https://bank.example/this-is-the-complete-qr-url';
    final client = ApiClient(
      deviceId: 'test-device',
      accessToken: 'test-only-token',
      localeLanguageCode: 'es',
      timeZone: 'Europe/Madrid',
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        final payload = jsonDecode(request.body) as Map<String, dynamic>;
        expect(payload['extractedText'], 'a' * 1500);
        expect(payload['qrContents'], [url]);
        expect(payload['contextText'], 'Original caption');
        expect(payload['outputLanguage'], 'es');
        return http.Response('{}', 200);
      }),
    );
    await ScanService(client).analyzeMedia(
      imageBase64: 'original-payload',
      extractedText: 'a' * 1500,
      mediaSignals: '',
      imageForensicsRawLogit: 0,
      imageForensicsThreshold: 1,
      imageForensicsIsAiGenerated: false,
      outputLanguage: 'es',
      idempotencyKey: 'image-key',
      qrContents: const [url],
      contextText: 'Original caption',
    );
    client.close();
  });

  test('multipart video carries the same identity and context contract',
      () async {
    final directory =
        await Directory('build/test-fixtures').create(recursive: true);
    final temporary = await directory.createTemp('video-upload-');
    final file = File('${temporary.path}/clip.mp4');
    await file.writeAsBytes([0, 1, 2, 3]);
    final client = ApiClient(
      deviceId: 'test-device',
      accessToken: 'test-only-token',
      localeLanguageCode: 'de',
      timeZone: 'Europe/Berlin',
      baseUrl: 'https://example.test',
      client: MockClient((request) async {
        expect(request.headers['x-time-zone'], 'Europe/Berlin');
        expect(request.headers['Idempotency-Key'], 'video-key');
        final body = request.body;
        expect(body, contains('Original video caption'));
        expect(body, contains('name="contextText"'));
        expect(body, contains('name="outputLanguage"'));
        expect(body, contains('video/mp4'));
        return http.Response('{"status":"completed"}', 200);
      }),
    );
    try {
      await ScanService(client).analyzeVideo(
          filePath: file.path,
          mimeType: 'video/mp4',
          idempotencyKey: 'video-key',
          contextText: 'Original video caption');
    } finally {
      client.close();
      await temporary.delete(recursive: true);
    }
  });
}
