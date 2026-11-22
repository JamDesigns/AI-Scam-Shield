import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/about/privacy_policy_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'package:scam_shield_mvp/i18n/locale_delegates.dart';

void main() {
  testWidgets('an open privacy policy reloads when the app language changes',
      (tester) async {
    late String english;
    late String spanish;
    Future<void> loadDelegates(Locale locale) async {
      final types = <Type>{};
      for (final delegate in appLocalizationDelegates) {
        if (delegate.isSupported(locale) && types.add(delegate.type)) {
          await delegate.load(locale);
        }
      }
    }

    await tester.runAsync(() async {
      english =
          await rootBundle.loadString('assets/legal/privacy-policy.en.md');
      spanish =
          await rootBundle.loadString('assets/legal/privacy-policy.es.md');
      await rootBundle.loadString('assets/i18n/en.json');
      await rootBundle.loadString('assets/i18n/es.json');
      await loadDelegates(const Locale('en', 'GB'));
    });

    var locale = const Locale('en', 'GB');
    Future<void> settlePolicy() async {
      await tester.runAsync(() => loadDelegates(locale));
      await tester.pump();
      // The policy starts loading only after Localizations builds this frame.
      await tester.runAsync(() => rootBundle.loadString(
            'assets/legal/privacy-policy.${locale.languageCode}.md',
          ));
      await tester.pump();
      await tester.pumpAndSettle();
    }

    late StateSetter changeLanguage;
    await tester.pumpWidget(StatefulBuilder(builder: (context, setState) {
      changeLanguage = setState;
      return MaterialApp(
        locale: locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: appLocalizationDelegates,
        home: const PrivacyPolicyPage(),
      );
    }));
    await settlePolicy();
    final originalState = tester.state(find.byType(PrivacyPolicyPage));
    expect(tester.widget<Markdown>(find.byType(Markdown)).data, english);

    await tester.runAsync(() => loadDelegates(const Locale('es')));
    changeLanguage(() => locale = const Locale('es'));
    await tester.pump();
    await settlePolicy();
    expect(tester.state(find.byType(PrivacyPolicyPage)), same(originalState));
    expect(tester.widget<Markdown>(find.byType(Markdown)).data, spanish);
  });
}
