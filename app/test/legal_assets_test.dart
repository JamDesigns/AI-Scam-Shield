import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('privacy policy markdown files exist for supported locales', () {
    const locales = ['en', 'es', 'fr', 'de', 'it'];

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

  test('legacy non-localized privacy policy markdown is not used', () {
    final file = File('assets/legal/privacy-policy.md');

    expect(file.existsSync(), isFalse);
  });

  test('public legal HTML files exist for supported locales', () {
    const locales = ['en', 'es', 'fr', 'de', 'it'];
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
          reason: 'Public legal document must not be empty: $document.$locale.html',
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
