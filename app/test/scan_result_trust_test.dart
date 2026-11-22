import 'package:flutter/material.dart';
import 'package:scam_shield_mvp/design/shield_design.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';
import 'package:scam_shield_mvp/features/scan/scan_page.dart';
import 'package:scam_shield_mvp/features/scan/scan_action_advice.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'package:scam_shield_mvp/i18n/locale_delegates.dart';

ScanResult response({
  int? score,
  String category = 'inconclusive',
  bool aiUsed = false,
  bool unavailable = true,
}) =>
    ScanResult.fromJson({
      'riskScore': score, 'category': category,
      'aiUsed': aiUsed, 'languageNormalizationUnavailable': unavailable,
      // Raw heuristic evidence must not override the final inconclusive result.
      'classicRiskScore': 0, 'classicCategory': 'low_risk',
    });

Future<void> showResult(WidgetTester tester, ScanResult result) async {
  const locale = Locale('en', 'GB');
  final types = <Type>{};
  final delegates = appLocalizationDelegates
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
  await tester.pumpWidget(MaterialApp(
    locale: locale,
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: appLocalizationDelegates,
    home: Scaffold(
        body: SingleChildScrollView(child: ScanResultCard(result: result))),
  ));
  await tester.runAsync(loadDelegates);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  expect(find.byType(ScanResultCard), findsOneWidget);
}

void main() {
  test('a missing final score remains inconclusive, never zero or low risk',
      () {
    final result = response(category: 'low_risk');
    expect(result.riskScore, isNull);
    expect(result.category, 'inconclusive');
    expect(result.isInconclusive, isTrue);
    expect(result.hasLimitedLanguageCoverage, isTrue);
    final shared = buildScanActionAdviceContent(
        result: result,
        translate: (key) => key,
        formatReason: (reason) => reason);
    expect(shared.safetyAdvice, isNot(contains('0/100')));
    expect(shared.safetyAdvice, isNot(contains('null/100')));
    expect(shared.safetyAdvice, contains('result.limitedLanguageCoverage'));
    expect(
        shared.actions, isNot(contains('result.action.low.noImmediateAction')));
    expect(shared.actions, isNot(contains('result.action.block')));
  });

  testWidgets(
      'classic inconclusive renders no green score and shows the coverage warning',
      (tester) async {
    await showResult(tester, response());
    expect(find.text('0/100'), findsNothing);
    expect(find.text('null/100'), findsNothing);
    final labels = tester.widgetList<Text>(find.text('Inconclusive'));
    expect(labels, hasLength(2));
    expect(
        labels.every((text) => text.style?.color == ShieldDesign.sky), isTrue);
    final warning = find.byKey(const ValueKey('limited-language-coverage'));
    expect(warning, findsOneWidget);
    expect(tester.widget<Text>(warning).data,
        isNot('result.limitedLanguageCoverage'));
  });

  testWidgets(
      'medium classic risk keeps its score and still warns about language coverage',
      (tester) async {
    await showResult(tester, response(score: 60, category: 'medium_risk'));
    expect(find.text('60/100'), findsOneWidget);
    expect(find.byKey(const ValueKey('limited-language-coverage')),
        findsOneWidget);
  });

  testWidgets(
      'valid AI and URL-only classic results do not inherit the classic-language warning',
      (tester) async {
    await showResult(
        tester,
        response(
            score: 5, category: 'low_risk', aiUsed: true, unavailable: true));
    expect(find.text('5/100'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('limited-language-coverage')), findsNothing);
    await showResult(
        tester,
        response(
            score: 5, category: 'low_risk', aiUsed: false, unavailable: false));
    expect(find.text('5/100'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('limited-language-coverage')), findsNothing);
  });
}
