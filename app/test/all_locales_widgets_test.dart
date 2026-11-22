import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'package:scam_shield_mvp/i18n/locale_delegates.dart';

Future<void> pumpLocalizedApp(
    WidgetTester tester, Locale locale, Widget app) async {
  final types = <Type>{};
  final delegates = appLocalizationDelegates
      .where((delegate) =>
          delegate.isSupported(locale) && types.add(delegate.type))
      .toList();
  Future<void> loadDelegates() async {
    // Flutter delegates may return SynchronousFuture, which Future.wait cannot
    // safely combine with asynchronous delegate futures.
    for (final delegate in delegates) {
      await delegate.load(locale);
    }
  }

  // Only resource IO runs outside FakeAsync; widget pumping stays inside it.
  await tester.runAsync(loadDelegates);
  await tester.pumpWidget(app);
  await tester.runAsync(loadDelegates);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

void main() {
  test('the target contains the 24 official EU languages plus Catalan', () {
    expect(
        AppLocalizations.supportedLocales.map((l) => l.languageCode).toSet(), {
      'bg',
      'ca',
      'cs',
      'da',
      'de',
      'el',
      'en',
      'es',
      'et',
      'fi',
      'fr',
      'ga',
      'hr',
      'hu',
      'it',
      'lt',
      'lv',
      'mt',
      'nl',
      'pl',
      'pt',
      'ro',
      'sk',
      'sl',
      'sv',
    });
  });

  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        '${locale.toLanguageTag()} loads app, Material and Cupertino controls',
        (tester) async {
      String? cancelLabel;
      await pumpLocalizedApp(
          tester,
          locale,
          MaterialApp(
            locale: locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: appLocalizationDelegates,
            home: Builder(builder: (context) {
              final app = AppLocalizations.of(context);
              final material = MaterialLocalizations.of(context);
              cancelLabel = material.cancelButtonLabel;
              expect(app.locale.languageCode, locale.languageCode);
              expect(WidgetsLocalizations.of(context).textDirection,
                  TextDirection.ltr);
              return Scaffold(
                  body: Column(children: [
                Text(app.t('stats.period.year')),
                const TextField(),
                ElevatedButton(
                  key: const ValueKey('open-calendar'),
                  onPressed: () => showDatePicker(
                      context: context,
                      initialDate: DateTime(2026, 10, 31),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2030)),
                  child: Text(material.datePickerHelpText),
                ),
                SizedBox(
                    height: 200,
                    child: CupertinoDatePicker(
                      mode: CupertinoDatePickerMode.date,
                      initialDateTime: DateTime(2026, 10, 31),
                      minimumYear: 2020,
                      maximumYear: 2030,
                      onDateTimeChanged: (_) {},
                    )),
              ]));
            }),
          ));
      expect(find.byKey(const ValueKey('open-calendar')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('open-calendar')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text(cancelLabel!), findsOneWidget);
      await tester.tap(find.text(cancelLabel!));
      await tester.pumpAndSettle();

      final api = ApiClient(
          deviceId: 'test-session',
          accessToken: 'test-only-token',
          timeZone: 'Europe/Madrid',
          localeLanguageCode: locale.toLanguageTag(),
          baseUrl: 'https://example.test',
          client: MockClient((request) async {
            expect(jsonDecode(request.body)['outputLanguage'],
                locale.toLanguageTag());
            return http.Response('{}', 200);
          }));
      await api.postJson('/scan', {'input': 'original text stays unchanged'});
      api.close();
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
