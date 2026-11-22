import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/core/api_errors.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

void main() {
  const keys = [
    'account.title', 'account.signInGoogle', 'account.activate',
    'account.confirmTitle', 'account.confirmMessage', 'account.active',
    'account.inactive', 'account.notLinked', 'account.failed', 'account.success',
    'account.cancel', 'account.confirm', 'errors.translationUnavailable',
  ];
  for (final locale in AppLocalizations.supportedLocales) {
    test('${locale.toLanguageTag()} has explicit account and translation-failure copy', () {
      final catalogue = jsonDecode(File('assets/i18n/${locale.languageCode}.json').readAsStringSync()) as Map<String, dynamic>;
      for (final key in keys) {
        expect(catalogue[key], isA<String>(), reason: key);
        expect((catalogue[key] as String).trim(), isNotEmpty, reason: key);
      }
      if (locale.languageCode != 'en') {
        expect(catalogue['account.confirmMessage'], isNot('Activating this phone removes Premium access from the previous phone.'));
      }
    });
  }
  test('translation failure has its own localized error rather than a network error', () {
    expect(apiErrorKey(ApiException(message: 'synthetic', statusCode: 503, body: {'error': 'translation_unavailable'})), 'errors.translationUnavailable');
  });
}
