import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const supportedLocales = ['en', 'es', 'fr', 'de', 'it'];

void main() {
  test('i18n files have the same translation keys', () {
    final referenceTranslations = _loadTranslations('en');

    for (final locale in supportedLocales.where((locale) => locale != 'en')) {
      final translations = _loadTranslations(locale);

      expect(
        translations.keys.toSet(),
        referenceTranslations.keys.toSet(),
        reason: '$locale keys must match English keys',
      );
    }
  });

  test('i18n translation values are non-empty strings', () {
    final translationsByLocale = {
      for (final locale in supportedLocales) locale: _loadTranslations(locale),
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
    final referenceTranslations = _loadTranslations('en');

    for (final locale in supportedLocales.where((locale) => locale != 'en')) {
      final translations = _loadTranslations(locale);

      for (final key in referenceTranslations.keys) {
        final referencePlaceholders = _extractPlaceholders(
          referenceTranslations[key]!,
        );

        expect(
          _extractPlaceholders(translations[key]!),
          referencePlaceholders,
          reason: '$locale placeholders mismatch for key: $key',
        );
      }
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
