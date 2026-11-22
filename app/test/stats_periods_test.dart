import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';
import 'package:scam_shield_mvp/features/scan/scan_service.dart';
import 'package:scam_shield_mvp/features/stats/stats_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

Map<String, dynamic> period(
        int total, int low, int medium, int high, int uncertain) =>
    {
      'totalScans': total,
      'threatsDetected': medium + high,
      'riskBreakdown': {
        'low_risk': low,
        'medium_risk': medium,
        'high_risk': high,
        'inconclusive': uncertain
      },
    };

Map<String, dynamic> activity(String id, String preview,
        {bool inconclusive = false}) =>
    {
      'id': id,
      'inputPreview': preview,
      'createdAt': '2026-10-30T09:15:00Z',
      'finalCategory': inconclusive ? 'inconclusive' : 'medium_risk',
      'finalRiskScore': inconclusive ? null : 50,
    };

Map<String, dynamic> get fixture => {
      'timeZone': 'Europe/Madrid',
      'periods': {
        'today': period(1, 0, 0, 0, 1),
        'week': period(4, 1, 1, 1, 1),
        'month': period(8, 4, 2, 1, 1),
        'year': period(42, 39, 1, 1, 1),
      },
    };

void main() {
  test('media history labels use type and preserve literal user text', () {
    final text = ScanActivityItem.fromJson(activity('text', '[image]'));
    final image = ScanActivityItem.fromJson(
        {...activity('image', '[image]'), 'inputType': 'image'});
    final video = ScanActivityItem.fromJson(
        {...activity('video', '[video]'), 'inputType': 'video'});
    final authenticity = ScanActivityItem.fromJson({
      ...activity('auth', '[image authenticity]'),
      'inputType': 'image_authenticity'
    });
    expect(text.localizedMediaLabelKey, isNull);
    expect(text.inputPreview, '[image]');
    expect(image.localizedMediaLabelKey, 'scan.media.image');
    expect(video.localizedMediaLabelKey, 'scan.media.video');
    expect(authenticity.localizedMediaLabelKey, 'imageAuthenticity.title');
  });

  test('calendar periods preserve inconclusive results outside the safe bucket',
      () {
    final stats = ScanStats.fromJson(fixture);
    expect(stats.periods.keys, containsAll(['today', 'week', 'month', 'year']));
    final week = stats.periods['week']!;
    expect(week.totalScans, 4);
    expect(week.riskBreakdown['inconclusive'], 1);
    expect(week.riskBreakdown['low_risk'], 1);
    expect(week.flaggedShare, 0.5);
    expect(stats.periods['year']!.totalScans, 42);
  });

  testWidgets('user can inspect year and 30-day periods and load more history',
      (tester) async {
    var pageTwoRequests = 0;
    final api = ApiClient(
        deviceId: 'test-session',
        accessToken: 'test-token',
        timeZone: 'Europe/Madrid',
        localeLanguageCode: 'en-GB',
        baseUrl: 'https://example.test',
        client: MockClient((request) async {
          if (request.url.path == '/stats') {
            expect(request.url.queryParameters['period'], 'week');
            return http.Response(jsonEncode(fixture), 200);
          }
          final page = int.parse(request.url.queryParameters['page']!);
          if (page == 1) {
            return http.Response(
                jsonEncode({
                  'page': 1,
                  'limit': 2,
                  'hasMore': true,
                  'items': [
                    activity('one', 'First analysis'),
                    activity('two', 'Uncertain image', inconclusive: true)
                  ],
                }),
                200);
          }
          pageTwoRequests++;
          return http.Response(
              jsonEncode({
                'page': 2,
                'limit': 2,
                'hasMore': false,
                'items': [
                  activity('two', 'Uncertain image', inconclusive: true),
                  activity('three', 'Older analysis')
                ],
              }),
              200);
        }));
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en', 'GB'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizationsDelegate(),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      home: StatsPage(service: ScanService(api)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Calendar zone: Europe/Madrid'), findsOneWidget);
    await tester.tap(find.text('Year to date'));
    await tester.pumpAndSettle();
    expect(
        find.descendant(
            of: find.byKey(const ValueKey('stat-Analyses')),
            matching: find.text('42')),
        findsOneWidget);
    await tester.tap(find.text('Last 30 days'));
    await tester.pumpAndSettle();
    expect(
        find.descendant(
            of: find.byKey(const ValueKey('stat-Analyses')),
            matching: find.text('8')),
        findsOneWidget);

    final loadMore = find.byKey(const ValueKey('activity-load-more'));
    await tester.scrollUntilVisible(loadMore, 300);
    await tester.tap(loadMore);
    await tester.pumpAndSettle();
    expect(pageTwoRequests, 1);
    await tester.scrollUntilVisible(find.text('Older analysis'), 200);
    expect(find.text('Older analysis'), findsOneWidget);
    expect(find.byKey(const ValueKey('activity-load-more')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    api.close();
  });
}
