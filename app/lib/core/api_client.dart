import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_config.dart';

class ApiClient {
  ApiClient({
    required this.deviceId,
    required this.localeLanguageCode,
  });

  final String deviceId;
  final String localeLanguageCode;

  static const Duration _timeout = Duration(seconds: 100);

  Uri _u(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  Future<Map<String, dynamic>> getJson(String path) async {
    try {
      final res = await http.get(
        _u(path),
        headers: {
          'accept': 'application/json',
          'x-device-id': deviceId,
        },
      ).timeout(_timeout);

      final body = _tryDecodeMap(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return body ?? <String, dynamic>{};
      }

      throw ApiException(
        message: 'GET $path failed: ${res.statusCode}',
        statusCode: res.statusCode,
        body: body,
      );
    } on TimeoutException {
      throw ApiException(
        message: 'GET $path failed: timeout',
        statusCode: 408,
        body: const {'error': 'timeout'},
      );
    }
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> payload,
  ) async {
    try {
      final enrichedPayload = <String, dynamic>{
        ...payload,
        'outputLanguage': localeLanguageCode,
      };

      final res = await http
          .post(
            _u(path),
            headers: {
              'content-type': 'application/json',
              'accept': 'application/json',
              'x-device-id': deviceId,
            },
            body: json.encode(enrichedPayload),
          )
          .timeout(_timeout);

      final body = _tryDecodeMap(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return body ?? <String, dynamic>{};
      }

      throw ApiException(
        message: 'POST $path failed: ${res.statusCode}',
        statusCode: res.statusCode,
        body: body,
      );
    } on TimeoutException {
      throw ApiException(
        message: 'POST $path failed: timeout',
        statusCode: 408,
        body: const {'error': 'timeout'},
      );
    }
  }

  Map<String, dynamic>? _tryDecodeMap(String raw) {
    try {
      final decoded = json.decode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return null;
    } catch (_) {
      return null;
    }
  }
}

class ApiException implements Exception {
  ApiException({
    required this.message,
    required this.statusCode,
    required this.body,
  });

  final String message;
  final int statusCode;
  final Map<String, dynamic>? body;

  String? get errorCode => body?['error'] as String?;

  @override
  String toString() => message;
}
