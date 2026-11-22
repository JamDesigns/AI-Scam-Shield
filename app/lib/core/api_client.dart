import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'app_config.dart';

class ApiClient {
  ApiClient({
    required this.deviceId,
    required this.accessToken,
    required this.localeLanguageCode,
    this.timeZone = 'UTC',
    http.Client? client,
    String? baseUrl,
  })  : _client = client ?? http.Client(),
        _baseUrl = baseUrl;

  final String deviceId;
  final String accessToken;
  String localeLanguageCode;
  final String timeZone;
  final http.Client _client;
  final String? _baseUrl;
  static const Duration _timeout = Duration(seconds: 100);

  Uri _u(String path) => Uri.parse('${_baseUrl ?? AppConfig.apiBaseUrl}$path');

  Map<String, String> _headers({String? idempotencyKey}) => {
        'accept': 'application/json',
        'x-device-id': deviceId,
        'authorization': 'Bearer $accessToken',
        'x-time-zone': timeZone,
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      };

  Future<Map<String, dynamic>> getJson(String path) async {
    try {
      final response =
          await _client.get(_u(path), headers: _headers()).timeout(_timeout);
      return _response(response, path);
    } on TimeoutException {
      throw _timeoutException(path);
    }
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> payload, {
    String? idempotencyKey,
    bool includeOutputLanguage = true,
    String? accountIdentityToken,
  }) async {
    try {
      final response = await _client
          .post(
            _u(path),
            headers: {
              ..._headers(idempotencyKey: idempotencyKey),
              'content-type': 'application/json',
              if (accountIdentityToken != null)
                'x-account-authorization': 'Bearer $accountIdentityToken',
            },
            body: json.encode({
              ...payload,
              if (includeOutputLanguage) 'outputLanguage': localeLanguageCode,
            }),
          )
          .timeout(_timeout);
      return _response(response, path);
    } on TimeoutException {
      throw _timeoutException(path);
    }
  }

  Future<Map<String, dynamic>> postMultipartFile({
    required String path,
    required String fieldName,
    required String filePath,
    required String mimeType,
    String? idempotencyKey,
    Map<String, String> fields = const {},
  }) async {
    try {
      final request = http.MultipartRequest('POST', _u(path))
        ..headers.addAll(_headers(idempotencyKey: idempotencyKey))
        ..fields.addAll({...fields, 'outputLanguage': localeLanguageCode})
        ..files.add(await http.MultipartFile.fromPath(
          fieldName,
          filePath,
          contentType: MediaType.parse(mimeType),
        ));
      final streamedResponse = await _client.send(request).timeout(_timeout);
      final response =
          await http.Response.fromStream(streamedResponse).timeout(_timeout);
      return _response(response, path);
    } on TimeoutException {
      throw _timeoutException(path);
    }
  }

  Map<String, dynamic> _response(http.Response response, String path) {
    final body = _tryDecodeMap(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (body == null) {
        throw ApiException(
          message: 'Invalid response from $path',
          statusCode: 502,
          body: const {'error': 'invalid_response'},
        );
      }
      return body;
    }
    throw ApiException(
      message: '$path failed: ${response.statusCode}',
      statusCode: response.statusCode,
      body: body,
    );
  }

  ApiException _timeoutException(String path) => ApiException(
        message: '$path failed: timeout',
        statusCode: 408,
        body: const {'error': 'timeout'},
      );

  Map<String, dynamic>? _tryDecodeMap(String raw) {
    try {
      final decoded = json.decode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  void close() => _client.close();
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
  bool get mayHaveCompleted =>
      errorCode != 'subscription_sync_pending' &&
      (statusCode >= 500 ||
          statusCode == 408 ||
          errorCode == 'scan_in_progress');

  @override
  String toString() => message;
}
