import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:scam_shield_mvp/core/app_platform.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';
import 'package:scam_shield_mvp/features/scan/weekly_reset_hint.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => TestDefaultBinaryMessengerBinding
      .instance.defaultBinaryMessenger
      .setMockMethodCallHandler(AppPlatform.channel, null));

  test('quota preserves the backend reset instant and registered calendar zone',
      () {
    final quota = AiQuotaStatus.fromJson({
      'resetAt': '2026-11-01T23:00:00.000Z',
      'timeZone': 'Europe/Madrid',
    });
    expect(quota.resetAt, '2026-11-01T23:00:00.000Z');
    expect(quota.timeZone, 'Europe/Madrid');
  });

  testWidgets(
      'reset uses the server instant and registered zone, not device abbreviation',
      (tester) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(AppPlatform.channel, (call) async {
      expect(call.method, 'formatZonedDateTime');
      final args = call.arguments as Map;
      expect(args['timeZone'], 'Europe/Madrid');
      expect(args['language'], 'en-GB');
      expect(args['epochMillis'],
          DateTime.parse('2026-11-01T23:00:00Z').millisecondsSinceEpoch);
      return '2 Nov 2026, 00:00';
    });
    await tester.pumpWidget(const MaterialApp(
      locale: Locale('en', 'GB'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: [
        AppLocalizationsDelegate(),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      home: Scaffold(
          body: WeeklyResetHint(
              resetAt: '2026-11-01T23:00:00Z', timeZone: 'Europe/Madrid')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Next weekly reset: 2 Nov 2026, 00:00 (Europe/Madrid).'),
        findsOneWidget);
  });
}
