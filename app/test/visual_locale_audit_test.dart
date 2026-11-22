import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/features/about/about_page.dart';
import 'package:scam_shield_mvp/features/about/privacy_policy_page.dart';
import 'package:scam_shield_mvp/features/navigation/home_page.dart';
import 'package:scam_shield_mvp/features/scan/scan_service.dart';
import 'package:scam_shield_mvp/features/stats/stats_page.dart';
import 'package:scam_shield_mvp/features/premium/premium_offer_page.dart';
import 'package:scam_shield_mvp/features/premium/subscription_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'luminous_design_test.dart' as design;

ScanService statisticsFixture() => ScanService(ApiClient(
      deviceId: 'layout-fixture',
      accessToken: 'layout-fixture',
      timeZone: 'Europe/Madrid',
      localeLanguageCode: 'en-GB',
      baseUrl: 'https://example.test',
      client: MockClient((request) async => http.Response(
          jsonEncode(request.url.path == '/stats'
              ? {
                  'timeZone': 'Europe/Madrid',
                  'periods': {
                    for (final period in ['today', 'week', 'month', 'year'])
                      period: {
                        'totalScans': 12345,
                        'threatsDetected': 345,
                        'riskBreakdown': {
                          'low_risk': 12000,
                          'medium_risk': 200,
                          'high_risk': 100,
                          'inconclusive': 45
                        }
                      }
                  },
                }
              : {
                  'page': 1,
                  'limit': 20,
                  'hasMore': false,
                  'items': [
                    for (final type in ['image', 'video', 'image_authenticity'])
                      {
                        'id': type,
                        'inputType': type,
                        'createdAt': '2026-11-21T09:30:00Z',
                        'inputPreview': '',
                        'finalCategory': 'inconclusive',
                        'finalRiskScore': null
                      },
                  ]
                }),
          200)),
    ));

void main() {
  final output = Platform.environment['SHIELD_LOCALE_AUDIT_DIR'];
  final fontDir = Platform.environment['SHIELD_PREVIEW_FONTS'];
  final results = <Map<String, Object?>>[];
  setUpAll(() async {
    if (fontDir == null) return;
    for (final entry in {
      'Roboto': 'roboto-regular.ttf',
      'MaterialIcons': 'materialicons-regular.otf'
    }.entries) {
      final loader = FontLoader(entry.key)
        ..addFont(File('$fontDir/${entry.value}')
            .readAsBytes()
            .then(ByteData.sublistView));
      await loader.load();
    }
  });
  tearDownAll(() async {
    if (output != null) {
      await Directory(output).create(recursive: true);
      await File('$output/layout-results.json')
          .writeAsString(const JsonEncoder.withIndent('  ').convert(results));
    }
  });
  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        '${locale.toLanguageTag()} all application screens at normal and enlarged sizes',
        (tester) async {
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      // Home's offline state: no API, provider or payment calls in a layout audit.
      messenger.setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (_) async => throw PlatformException(code: 'layout-offline'));
      messenger.setMockMethodCallHandler(
          const MethodChannel('google_mlkit_text_recognizer'),
          (_) async => null);
      PackageInfo.setMockInitialValues(
          appName: 'Scam Shield',
          packageName: 'com.jamdesigns.scamshield',
          version: '3.3.0',
          buildNumber: '8',
          buildSignature: 'fixture');
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final width in [393.0, 320.0]) {
        tester.view.physicalSize = Size(width, 820);
        final screens = <String, Widget>{
          'scan-home': const HomePage(),
          'text-result': design.resultFixture('text'),
          'image-result': design.resultFixture('image'),
          'video-result': design.resultFixture('video'),
          'inconclusive': design.resultFixture('inconclusive'),
          'statistics': StatsPage(service: statisticsFixture()),
          'premium': const PremiumOfferPage(),
          'subscription': const SubscriptionPage(),
          'about': const AboutPage(),
          'privacy': const PrivacyPolicyPage(),
        };
        for (final entry in screens.entries) {
          final key = GlobalKey();
          await design.show(tester, locale, entry.value,
              scale: width == 320 ? 1.8 : 1, boundary: key);
          if (entry.key == 'privacy') {
            await tester.runAsync(() => rootBundle.loadString(
                'assets/legal/privacy-policy.${locale.languageCode}.md'));
            await tester.pumpAndSettle();
            expect(find.byType(Markdown), findsOneWidget);
          }
          final clipped = <String>{};
          void inspect() {
            for (final element in find.byType(RichText).evaluate()) {
              final render = element.findRenderObject();
              if (render is RenderParagraph && render.didExceedMaxLines) {
                clipped.add(render.text.toPlainText());
              }
            }
          }

          inspect();
          if (output != null && width == 393) {
            await tester.runAsync(() async {
              final render = key.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary;
              final image = await render.toImage(pixelRatio: 1);
              final bytes =
                  await image.toByteData(format: ui.ImageByteFormat.png);
              final file =
                  File('$output/${locale.languageCode}/${entry.key}.png');
              await file.parent.create(recursive: true);
              await file.writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
          final scrollables = find.byType(Scrollable);
          if (scrollables.evaluate().isNotEmpty) {
            for (var step = 0; step < 5; step++) {
              await tester.drag(scrollables.first, const Offset(0, -600));
              await tester.pumpAndSettle();
              inspect();
            }
          }
          results.add({
            'locale': locale.toLanguageTag(),
            'screen': entry.key,
            'width': width,
            'scale': width == 320 ? 1.8 : 1,
            'clipped': clipped.toList()
          });
          expect(clipped, isEmpty,
              reason: 'Localized text must remain fully readable');
          expect(tester.takeException(), isNull,
              reason: '${locale.toLanguageTag()} ${entry.key} $width');
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
        }
      }
    }, skip: output == null);
  }
}
