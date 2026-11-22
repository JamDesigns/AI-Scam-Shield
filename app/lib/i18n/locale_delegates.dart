import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_localizations.dart';
import 'maltese_localizations.dart';

/// The same delegate registration is used by the app and locale smoke tests.
const appLocalizationDelegates = <LocalizationsDelegate<dynamic>>[
  AppLocalizationsDelegate(),
  ...malteseLocalizationsDelegates,
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];
