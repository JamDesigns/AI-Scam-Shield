import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/design/shield_design.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';
import 'package:scam_shield_mvp/features/scan/scan_page.dart';
import 'package:scam_shield_mvp/features/premium/premium_offer_page.dart';
import 'package:scam_shield_mvp/features/premium/subscription_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'package:scam_shield_mvp/i18n/locale_delegates.dart';
import 'all_locales_widgets_test.dart' show pumpLocalizedApp;

Widget resultFixture(String type) {
  final Widget card;
  if (type == 'image') {
    card = MediaAnalysisCard(
        result: MediaAnalysisResult.fromJson({
      'authenticity': 'inconclusive',
      'authenticityConfidence': 'low',
      'fraudAssessment': 'possible_fraud',
      'fraudConfidence': 'medium',
      'authenticityReasons': [
        'The available evidence does not establish how this image was created.'
      ],
      'fraudReasons': ['Payment is requested through an unverified link.'],
      'explanation':
          'Verify the request independently using the official service.',
      'disclaimer': 'An edited image alone does not prove fraud.',
    }));
  } else if (type == 'video') {
    card = VideoAnalysisCard(
        result: VideoAnalysisResult.fromJson({
      'status': 'completed',
      'analysis': {
        'riskScore': 70,
        'category': 'high_risk',
        'threatType': 'investment_scam',
        'reasons': ['A guaranteed return is promised.'],
        'explanation': 'Check the source independently before sending money.'
      },
      'forensics': {
        'aiGeneratedStatus': 'unavailable',
        'deepfakeStatus': 'inconclusive',
        'aiGeneratedAudioStatus': 'unavailable'
      },
    }));
  } else {
    card = ScanResultCard(
        result: ScanResult.fromJson({
      'riskScore': type == 'inconclusive' ? null : 85,
      'category': type == 'inconclusive' ? 'inconclusive' : 'high_risk',
      'threatType': 'bank_phishing',
      'aiUsed': true,
      'reasons': ['URGENCY_LANGUAGE', 'SUSPICIOUS_PATH', 'SENSITIVE_DATA'],
    }));
  }
  return Scaffold(
      body: SingleChildScrollView(
          padding: const EdgeInsets.all(16), child: card));
}

Future<void> show(WidgetTester tester, Locale locale, Widget page,
    {double scale = 1.0, Key? boundary}) async {
  await pumpLocalizedApp(
      tester,
      locale,
      MaterialApp(
        theme: Platform.environment['SHIELD_PREVIEW_FONTS'] == null
            ? ShieldDesign.theme
            : ShieldDesign.theme.copyWith(
                textTheme:
                    ShieldDesign.theme.textTheme.apply(fontFamily: 'Roboto'),
                primaryTextTheme: ShieldDesign.theme.primaryTextTheme
                    .apply(fontFamily: 'Roboto'),
                filledButtonTheme: FilledButtonThemeData(
                    style: ShieldDesign.theme.filledButtonTheme.style?.copyWith(
                        textStyle: const WidgetStatePropertyAll(TextStyle(
                            fontFamily: 'Roboto',
                            fontWeight: FontWeight.w700)))),
              ),
        locale: locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: appLocalizationDelegates,
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!),
        home: RepaintBoundary(key: boundary, child: page),
      ));
}

void main() {
  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        '${locale.toLanguageTag()} narrow layouts retain full results and purchase controls',
        (tester) async {
      tester.view.physicalSize = const Size(320, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final page in [
        resultFixture('text'),
        resultFixture('image'),
        resultFixture('video'),
        resultFixture('inconclusive'),
        const PremiumOfferPage(),
        const SubscriptionPage()
      ]) {
        await show(tester, locale, page, scale: 1.8);
        expect(tester.takeException(), isNull);
        await tester.drag(
            find.byType(Scrollable).first, const Offset(0, -1800));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      }
    });
  }
  testWidgets(
      'premium introduction returns a store action without initiating a purchase',
      (tester) async {
    PremiumOfferAction? selected;
    await show(
        tester,
        const Locale('en', 'GB'),
        Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      selected = await Navigator.push<PremiumOfferAction>(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const PremiumOfferPage()));
                    },
                    child: const Text('open')))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    final plans = find.text('View plans');
    await tester.ensureVisible(plans);
    await tester.tap(plans);
    await tester.pumpAndSettle();
    expect(selected, PremiumOfferAction.plans);
  });
  testWidgets('render actual Flutter design previews when explicitly requested',
      (tester) async {
    final output = Platform.environment['SHIELD_PREVIEW_DIR'];
    if (output == null) return;
    // Font files come from the installed SDK only for opt-in visual inspection.
    // Regular CI uses Flutter's deterministic test font.
    await tester.runAsync(() async {
      final directory = Platform.environment['SHIELD_PREVIEW_FONTS'];
      if (directory == null) {
        throw StateError(
            'Set SHIELD_PREVIEW_FONTS to the SDK material_fonts directory.');
      }
      for (final entry in {
        'Roboto': 'roboto-regular.ttf',
        'MaterialIcons': 'materialicons-regular.otf'
      }.entries) {
        final loader = FontLoader(entry.key);
        loader.addFont(File('$directory/${entry.value}')
            .readAsBytes()
            .then((bytes) => ByteData.sublistView(bytes)));
        await loader.load();
      }
    });
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final pages = <String, Widget>{
      'text-result': resultFixture('text'),
      'image-result': resultFixture('image'),
      'video-result': resultFixture('video'),
      'inconclusive': resultFixture('inconclusive'),
      'premium': const PremiumOfferPage(),
      'subscription': const SubscriptionPage()
    };
    for (final entry in pages.entries) {
      final key = GlobalKey();
      await show(tester, const Locale('es'), entry.value, boundary: key);
      await tester.runAsync(() async {
        final render =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final picture = await render.toImage(pixelRatio: 1);
        final bytes = await picture.toByteData(format: ui.ImageByteFormat.png);
        final file = File('$output/${entry.key}.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(bytes!.buffer.asUint8List());
        picture.dispose();
      });
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });
}
