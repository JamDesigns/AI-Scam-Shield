import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'features/navigation/home_page.dart';
import 'design/shield_design.dart';
import 'i18n/app_localizations.dart';
import 'i18n/locale_delegates.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const ScamShieldApp());
}

class ScamShieldApp extends StatelessWidget {
  const ScamShieldApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      navigatorObservers: [
        FirebaseAnalyticsObserver(analytics: FirebaseAnalytics.instance),
      ],
      onGenerateTitle: (ctx) => AppLocalizations.of(ctx).t('app.title'),
      localizationsDelegates: appLocalizationDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      localeResolutionCallback:
          (Locale? deviceLocale, Iterable<Locale> supported) {
        return AppLocalizations.resolveLocale(deviceLocale);
      },
      theme: ShieldDesign.theme,
      home: HomePage(key: HomePage.globalKey),
    );
  }
}
