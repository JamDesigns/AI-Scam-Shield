import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final locales = AppLocalizations.supportedLocales
      .map((locale) => locale.languageCode)
      .toSet()
      .toList()
    ..sort();

  test('privacy policy markdown files exist for supported locales', () {
    for (final locale in locales) {
      final file = File('assets/legal/privacy-policy.$locale.md');

      expect(
        file.existsSync(),
        isTrue,
        reason: 'Missing privacy policy markdown for locale: $locale',
      );

      expect(
        file.readAsStringSync().trim(),
        isNotEmpty,
        reason: 'Privacy policy markdown must not be empty for locale: $locale',
      );
    }
  });

  test('privacy policies load from the real bundle in every app language',
      () async {
    for (final locale in locales) {
      final content = await rootBundle.loadString(
        'assets/legal/privacy-policy.$locale.md',
      );
      expect(content, contains('AI Scam Shield'), reason: locale);
      expect(content, contains('2026-11-02'), reason: locale);
      expect(content, contains('Firebase Analytics'), reason: locale);
      expect(content, contains('mailto:joseangel.mosquera@gmail.com'),
          reason: locale);
    }
  });

  test('legacy non-localized privacy policy markdown is not used', () {
    final file = File('assets/legal/privacy-policy.md');

    expect(file.existsSync(), isFalse);
  });

  test('public legal HTML files exist for supported locales', () {
    const documents = [
      'privacy-policy',
      'terms-of-service',
    ];

    for (final document in documents) {
      for (final locale in locales) {
        final file = File('../docs/legal/$document.$locale.html');

        expect(
          file.existsSync(),
          isTrue,
          reason: 'Missing public legal document: $document.$locale.html',
        );

        expect(
          file.readAsStringSync().trim(),
          isNotEmpty,
          reason:
              'Public legal document must not be empty: $document.$locale.html',
        );
      }
    }
  });

  test('public legal entrypoints exist', () {
    const entrypoints = [
      '../docs/privacy-policy.html',
      '../docs/terms-of-service.html',
    ];

    for (final path in entrypoints) {
      final file = File(path);

      expect(
        file.existsSync(),
        isTrue,
        reason: 'Missing public legal entrypoint: $path',
      );

      expect(
        file.readAsStringSync().trim(),
        isNotEmpty,
        reason: 'Public legal entrypoint must not be empty: $path',
      );
    }
  });
}
