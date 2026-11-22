import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Retain keys while a result is uncertain: retrying a timed-out upload must
/// not consume a second unit. Completed analyses get a fresh key.
class AnalysisRequestKeys {
  final _pending = <String, String>{};
  Future<void>? _initialization;
  static const _storageKey = 'pending_analysis_request_keys';

  Future<void> _load() async {
    final preferences = await SharedPreferences.getInstance();
    try {
      final stored = json.decode(preferences.getString(_storageKey) ?? '{}');
      if (stored is Map) {
        for (final entry in stored.entries) {
          if (entry.key is String && entry.value is String) {
            _pending[entry.key as String] = entry.value as String;
          }
        }
      }
    } on FormatException {
      // Corrupt local state must not make the scanner unusable.
    }
  }

  Future<void> _save() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_storageKey, json.encode(_pending));
  }

  Future<String> forSignature(String signature) async {
    await (_initialization ??= _load());
    if (_pending.length >= 32 && !_pending.containsKey(signature)) {
      _pending.remove(_pending.keys.first);
    }
    final key = _pending.putIfAbsent(signature, () => const Uuid().v4());
    await _save();
    return key;
  }

  Future<void> complete(String signature) async {
    await (_initialization ??= _load());
    _pending.remove(signature);
    await _save();
  }

  static String textSignature(String input, String language) =>
      sha256.convert(utf8.encode('text\n$language\n$input')).toString();

  static Future<String> fileSignature({
    required String path,
    required String modality,
    required String contextText,
    required String language,
  }) async {
    final digest = await sha256.bind(File(path).openRead()).first;
    return sha256
        .convert(utf8.encode('$modality\n$language\n$contextText\n$digest'))
        .toString();
  }
}
