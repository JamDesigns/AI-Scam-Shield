import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

class AppLocalizations {
  AppLocalizations(this.locale);

  final Locale locale;
  late Map<String, dynamic> _translations;

  static const List<Locale> supportedLocales = [
    Locale('en'),
    Locale('es'),
    Locale('fr'),
  ];

  static AppLocalizations of(BuildContext context) {
    final AppLocalizations? loc =
        Localizations.of<AppLocalizations>(context, AppLocalizations);
    return loc ?? AppLocalizations(const Locale('en'));
  }

  Future<void> load() async {
    try {
      final String data = await rootBundle
          .loadString('assets/i18n/${locale.languageCode}.json');
      _translations = json.decode(data) as Map<String, dynamic>;
    } catch (_) {
      final String fallbackData =
          await rootBundle.loadString('assets/i18n/en.json');
      _translations = json.decode(fallbackData) as Map<String, dynamic>;
    }
  }

  String t(String key, {Map<String, String>? params}) {
    final dynamic value = _translations[key];
    if (value is! String) return key;

    var text = value;

    if (params != null && params.isNotEmpty) {
      for (final entry in params.entries) {
        text = text.replaceAll('{${entry.key}}', entry.value);
      }
    }

    return text;
  }
}

class AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) {
    return AppLocalizations.supportedLocales
        .any((l) => l.languageCode == locale.languageCode);
  }

  @override
  Future<AppLocalizations> load(Locale locale) async {
    final AppLocalizations loc = AppLocalizations(locale);
    await loc.load();
    return SynchronousFuture<AppLocalizations>(loc);
  }

  @override
  bool shouldReload(covariant LocalizationsDelegate<AppLocalizations> old) =>
      false;
}
