import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('i18n files have the same translation keys', () {
    final en = _loadTranslations('en');
    final es = _loadTranslations('es');
    final fr = _loadTranslations('fr');

    expect(es.keys.toSet(), en.keys.toSet());
    expect(fr.keys.toSet(), en.keys.toSet());
  });

  test('i18n translation values are non-empty strings', () {
    final translationsByLocale = {
      'en': _loadTranslations('en'),
      'es': _loadTranslations('es'),
      'fr': _loadTranslations('fr'),
    };

    for (final entry in translationsByLocale.entries) {
      for (final translation in entry.value.entries) {
        expect(
          translation.value.trim(),
          isNotEmpty,
          reason: '${entry.key}.${translation.key} must not be empty',
        );
      }
    }
  });

  test('i18n placeholders are consistent across locales', () {
    final en = _loadTranslations('en');
    final es = _loadTranslations('es');
    final fr = _loadTranslations('fr');

    for (final key in en.keys) {
      final enPlaceholders = _extractPlaceholders(en[key]!);

      expect(
        _extractPlaceholders(es[key]!),
        enPlaceholders,
        reason: 'Spanish placeholders mismatch for key: $key',
      );

      expect(
        _extractPlaceholders(fr[key]!),
        enPlaceholders,
        reason: 'French placeholders mismatch for key: $key',
      );
    }
  });
}

Map<String, String> _loadTranslations(String locale) {
  final file = File('assets/i18n/$locale.json');
  final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

  return json.map((key, value) {
    expect(value, isA<String>(), reason: '$locale.$key must be a string');

    return MapEntry(key, value as String);
  });
}

Set<String> _extractPlaceholders(String value) {
  return RegExp(r'\{([a-zA-Z0-9_]+)\}')
      .allMatches(value)
      .map((match) => match.group(1)!)
      .toSet();
}
