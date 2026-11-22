import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

void main() {
  for (final supported in AppLocalizations.supportedLocales) {
    test('${supported.toLanguageTag()} regional phone variant resolves to the same app/API output locale', () {
      expect(AppLocalizations.resolveLocale(Locale(supported.languageCode, 'XX')).toLanguageTag(), supported.toLanguageTag());
    });
  }
  test('English and Portuguese regional phone variants retain the configured app language', () {
    expect(AppLocalizations.resolveLocale(const Locale('en', 'US')).toLanguageTag(), 'en-GB');
    expect(AppLocalizations.resolveLocale(const Locale('pt', 'BR')).toLanguageTag(), 'pt');
  });
  test('German and Italian use their available app catalogues', () {
    expect(AppLocalizations.resolveLocale(const Locale('de', 'AT')).languageCode,
        'de');
    expect(AppLocalizations.resolveLocale(const Locale('it', 'IT')).languageCode,
        'it');
  });

  test('unsupported device language resolves to British English for app and API', () {
    expect(AppLocalizations.resolveLocale(const Locale('xx', 'ZZ')).toLanguageTag(),
        'en-GB');
    expect(AppLocalizations.resolveLocale(null).toLanguageTag(), 'en-GB');
  });
}
