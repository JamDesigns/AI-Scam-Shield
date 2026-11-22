import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart' as intl;

import 'package:scam_shield_mvp/i18n/maltese_localizations.dart';

Future<void> pumpMalteseApp(WidgetTester tester, Widget app,
    Iterable<LocalizationsDelegate<dynamic>> allDelegates) async {
  // The app resolves Locale('mt', 'MT') against supported Locale('mt').
  const locale = Locale('mt');
  final types = <Type>{};
  final delegates = allDelegates
      .where((delegate) =>
          delegate.isSupported(locale) && types.add(delegate.type))
      .toList();
  Future<void> loadDelegates() async {
    // Flutter delegates may return SynchronousFuture.
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
  const locale = Locale('mt', 'MT');

  test('the three delegates support only Maltese, including regional mt', () {
    for (final delegate in malteseLocalizationsDelegates) {
      expect(delegate.isSupported(const Locale('mt')), isTrue);
      expect(delegate.isSupported(locale), isTrue);
      expect(delegate.isSupported(const Locale('en', 'GB')), isFalse);
      expect(delegate.isSupported(const Locale('ar')), isFalse);
    }
  });

  test('Maltese CLDR loads after global Bulgarian without replacing its data',
      () async {
    const bulgarian = Locale('bg');
    final date = DateTime(2026, 10, 31);
    final bg = await GlobalMaterialLocalizations.delegate.load(bulgarian);
    final bgDateBefore = bg.formatFullDate(date);
    expect(bgDateBefore.toLowerCase(), contains('октомври'));

    final mt = await const MalteseMaterialLocalizationsDelegate().load(locale);
    final mtCupertino =
        await const MalteseCupertinoLocalizationsDelegate().load(locale);

    expect(intl.DateFormat.localeExists('mt'), isTrue);
    expect(mt.formatFullDate(date).toLowerCase(), contains('ottubru'));
    expect(mtCupertino.datePickerMonth(10).toLowerCase(), 'ottubru');
    expect(bg.formatFullDate(date), bgDateBefore);
    expect(intl.DateFormat.yMMMMEEEEd('bg').format(date), bgDateBefore);
  });

  test(
      'cached Maltese CLDR survives Maltese then global Bulgarian then Maltese',
      () async {
    const bulgarian = Locale('bg');
    final date = DateTime(2026, 10, 31);
    final first =
        await const MalteseMaterialLocalizationsDelegate().load(locale);
    final firstDate = first.formatFullDate(date);

    final bg = await GlobalMaterialLocalizations.delegate.load(bulgarian);
    final bgCupertino =
        await GlobalCupertinoLocalizations.delegate.load(bulgarian);
    final bgDate = bg.formatFullDate(date);
    expect(bgDate.toLowerCase(), contains('октомври'));
    expect(bgCupertino.datePickerMonth(10).toLowerCase(), 'октомври');

    final second =
        await const MalteseMaterialLocalizationsDelegate().load(locale);
    final mtCupertino =
        await const MalteseCupertinoLocalizationsDelegate().load(locale);
    expect(second.formatFullDate(date), firstDate);
    expect(second.formatFullDate(date).toLowerCase(), contains('ottubru'));
    expect(mtCupertino.datePickerMonth(10).toLowerCase(), 'ottubru');
    expect(intl.DateFormat.yMMMMEEEEd('mt').format(date), firstDate);
    expect(intl.DateFormat.yMMMMEEEEd('bg').format(date), bgDate);
  });

  test(
    'Material uses Maltese controls and CLDR formatting without English fallback',
    () async {
      final material = await const MalteseMaterialLocalizationsDelegate().load(
        locale,
      );
      expect(material.cancelButtonLabel, 'Ikkanċella');
      expect(material.okButtonLabel, 'Tajjeb');
      expect(material.backButtonTooltip, 'Lura');
      expect(material.copyButtonLabel, 'Ikkopja');
      expect(material.pasteButtonLabel, 'Waħħal');
      expect(material.datePickerHelpText, 'Agħżel data');
      expect(material.aboutListTileTitle('Scam Shield'), 'Dwar Scam Shield');
      final date = DateTime(2026, 10, 31);
      expect(
        material.formatFullDate(date),
        intl.DateFormat.yMMMMEEEEd('mt').format(date),
      );
      expect(material.formatFullDate(date).toLowerCase(), contains('ottubru'));
      expect(
        material.formatShortDate(date),
        intl.DateFormat.yMMMd('mt').format(date),
      );
      expect(
        material.formatCompactDate(date),
        intl.DateFormat.yMd('mt').format(date),
      );
      expect(
        material.formatTimeOfDay(const TimeOfDay(hour: 19, minute: 5)),
        '19:05',
      );
      expect(
        material.formatDecimal(12345),
        intl.NumberFormat.decimalPattern('mt').format(12345),
      );
      expect(material.tabLabel(tabIndex: 2, tabCount: 4), 'Tab 2 minn 4');
      expect(material.pageRowsInfoTitle(1, 10, 50, false), '1–10 minn 50');
    },
  );

  test('Maltese plural categories remain distinct from English', () async {
    final material = await const MalteseMaterialLocalizationsDelegate().load(
      locale,
    );
    expect(material.selectedRowCountTitle(0), 'Ebda oġġett magħżul');
    expect(material.selectedRowCountTitle(1), 'Oġġett wieħed magħżul');
    expect(material.selectedRowCountTitle(2), 'Żewġ oġġetti magħżula');
    expect(material.selectedRowCountTitle(3), '3 oġġetti magħżula');
    expect(material.selectedRowCountTitle(11), '11-il oġġett magħżul');
    expect(material.selectedRowCountTitle(20), '20 oġġett magħżul');
    expect(material.remainingTextFieldCharacterCount(2), 'Fadal żewġ karattri');
    expect(
      material.remainingTextFieldCharacterCount(12),
      'Fadal 12-il karattru',
    );
    expect(material.licensesPackageDetailText(2), 'Żewġ liċenzji');
  });

  test(
    'Cupertino includes editing, accessibility, dates and timer plurals',
    () async {
      final cupertino =
          await const MalteseCupertinoLocalizationsDelegate().load(locale);
      expect(cupertino.cancelButtonLabel, 'Ikkanċella');
      expect(cupertino.backButtonLabel, 'Lura');
      expect(
        cupertino.noSpellCheckReplacementsLabel,
        'Ma nstabux sostituzzjonijiet',
      );
      expect(cupertino.datePickerMonth(10).toLowerCase(), 'ottubru');
      expect(cupertino.datePickerMinuteSemanticsLabel(1), 'Minuta waħda');
      expect(cupertino.datePickerMinuteSemanticsLabel(2), 'Żewġ minuti');
      expect(cupertino.datePickerMinuteSemanticsLabel(11), '11-il minuta');
      expect(cupertino.timerPickerHourLabel(1), 'siegħa');
      expect(cupertino.timerPickerHourLabel(2), 'sigħat');
      expect(cupertino.timerPickerHourLabel(11), 'siegħa');
      expect(
        cupertino.tabSemanticsLabel(tabIndex: 1, tabCount: 3),
        'Tab 1 minn 3',
      );
    },
  );

  test(
    'Widgets uses Maltese editing and search labels with left-to-right text',
    () async {
      final widgets = await const MalteseWidgetsLocalizationsDelegate().load(
        locale,
      );
      expect(widgets.textDirection, TextDirection.ltr);
      expect(widgets.copyButtonLabel, 'Ikkopja');
      expect(widgets.cutButtonLabel, 'Aqta’');
      expect(widgets.pasteButtonLabel, 'Waħħal');
      expect(widgets.selectAllButtonLabel, 'Agħżel kollox');
      expect(widgets.noResultsFound, 'Ma nstabux riżultati');
      expect(widgets.reorderItemToEnd, 'Mexxi fl-aħħar');
    },
  );

  testWidgets('a Maltese Material date picker loads all standard delegates', (
    tester,
  ) async {
    const delegates = [
      ...malteseLocalizationsDelegates,
      ...GlobalMaterialLocalizations.delegates,
    ];
    await pumpMalteseApp(
      tester,
      MaterialApp(
        locale: locale,
        supportedLocales: const [Locale('mt')],
        localizationsDelegates: delegates,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showDatePicker(
                context: context,
                initialDate: DateTime(2026, 10, 31),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
              ),
              child: Text(MaterialLocalizations.of(context).datePickerHelpText),
            ),
          ),
        ),
      ),
      delegates,
    );
    expect(find.text('Agħżel data'), findsOneWidget);
    await tester.tap(find.text('Agħżel data'));
    await tester.pumpAndSettle();
    expect(find.text('Ikkanċella'), findsOneWidget);
    expect(find.text('Tajjeb'), findsOneWidget);
    expect(find.text('Cancel'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Cupertino widgets resolve the Maltese delegate in a real app', (
    tester,
  ) async {
    const delegates = [
      ...malteseLocalizationsDelegates,
      ...GlobalCupertinoLocalizations.delegates,
    ];
    await pumpMalteseApp(
      tester,
      CupertinoApp(
        locale: locale,
        supportedLocales: const [Locale('mt')],
        localizationsDelegates: delegates,
        home: Builder(
          builder: (context) => CupertinoPageScaffold(
            child: Center(
              child: Text(CupertinoLocalizations.of(context).todayLabel),
            ),
          ),
        ),
      ),
      delegates,
    );
    expect(find.text('Illum'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
