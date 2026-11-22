import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:scam_shield_mvp/features/about/about_page.dart';
import 'package:scam_shield_mvp/features/premium/premium_offer_page.dart';
import 'package:scam_shield_mvp/features/premium/subscription_page.dart';
import 'package:scam_shield_mvp/features/stats/stats_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';

import 'luminous_design_test.dart' as design;
import 'visual_locale_audit_test.dart' show statisticsFixture;

void main() {
  const scenarios = <String, (Size, FakeViewPadding, double)>{
    'portrait gestures': (
      Size(390, 820),
      FakeViewPadding(top: 30, bottom: 24),
      0,
    ),
    'portrait three buttons': (
      Size(390, 820),
      FakeViewPadding(top: 30, bottom: 48),
      0,
    ),
    'landscape cutout': (
      Size(820, 390),
      FakeViewPadding(left: 44, top: 24, right: 20, bottom: 24),
      0,
    ),
    'keyboard': (Size(390, 820), FakeViewPadding(top: 30, bottom: 24), 300),
  };

  for (final locale in AppLocalizations.supportedLocales) {
    for (final scenario in scenarios.entries) {
      testWidgets(
        '${locale.toLanguageTag()} ${scenario.key} keeps purchase controls outside system occlusion',
        (tester) async {
          PackageInfo.setMockInitialValues(appName: 'Scam Shield', packageName: 'com.jamdesigns.scamshield', version: '3.3.0', buildNumber: '8', buildSignature: 'fixture');
          final (size, safeInsets, keyboard) = scenario.value;
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = size;
          tester.view.viewPadding = safeInsets;
          tester.view.padding = FakeViewPadding(
            left: safeInsets.left,
            top: safeInsets.top,
            right: safeInsets.right,
            bottom: keyboard > 0 ? 0 : safeInsets.bottom,
          );
          tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetViewPadding);
          addTearDown(tester.view.resetPadding);
          addTearDown(tester.view.resetViewInsets);

          for (final page in <Widget>[
            const PremiumOfferPage(),
            const SubscriptionPage(),
            const AboutPage(),
            StatsPage(service: statisticsFixture()),
          ]) {
            await design.show(tester, locale, page, scale: 1.8);
            final button = page is PremiumOfferPage
                ? find.byType(OutlinedButton)
                : page is StatsPage ? find.byKey(const ValueKey('stats-content'))
                : page is AboutPage ? find.byWidgetPredicate((widget) => widget is FilledButton)
                : find.byType(FilledButton);
            if (page is StatsPage) {
              expect(button, findsOneWidget);
            } else {
              // ListView builds children lazily; scroll before asking for geometry.
              await tester.scrollUntilVisible(button, 120,
                  scrollable: find.byType(Scrollable).first);
            }
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            final rect = tester.getRect(button);
            expect(rect.left, greaterThanOrEqualTo(safeInsets.left));
            expect(
              rect.right,
              lessThanOrEqualTo(size.width - safeInsets.right),
            );
            expect(rect.top, greaterThanOrEqualTo(safeInsets.top));
            expect(
              rect.bottom,
              lessThanOrEqualTo(
                size.height - (keyboard > 0 ? keyboard : safeInsets.bottom),
              ),
            );
            expect(rect.height, greaterThan(0));
            // The actual touch target is hit-testable, not merely present offscreen.
            expect(button.hitTestable(), findsOneWidget);
            await tester.pumpWidget(const SizedBox.shrink());
          }
        },
      );
    }
  }
}
