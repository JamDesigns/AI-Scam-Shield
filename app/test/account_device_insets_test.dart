import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/premium/account_device_page.dart';
import 'package:scam_shield_mvp/i18n/app_localizations.dart';
import 'account_device_page_test.dart' show FakeAccountService;
import 'luminous_design_test.dart' as design;

void main() {
  for (final locale in AppLocalizations.supportedLocales) {
    for (final landscape in [false, true]) {
      testWidgets(
          '${locale.toLanguageTag()} account activation avoids system bars and cutouts landscape=$landscape',
          (tester) async {
        final size = landscape ? const Size(820, 390) : const Size(390, 820);
        final inset = landscape
            ? const FakeViewPadding(left: 44, top: 24, right: 20, bottom: 48)
            : const FakeViewPadding(top: 30, bottom: 48);
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        tester.view.padding = inset;
        tester.view.viewPadding = inset;
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetPadding);
        addTearDown(tester.view.resetViewPadding);
        final page = Builder(builder: (context) {
          final t = AppLocalizations.of(context);
          return AccountDevicePage(
              service: FakeAccountService(),
              labels: AccountDeviceLabels(
                title: t.t('account.title'),
                signInGoogle: t.t('account.signInGoogle'),
                restore: t.t('premium.restore'),
                activate: t.t('account.activate'),
                confirmTitle: t.t('account.confirmTitle'),
                confirmMessage: t.t('account.confirmMessage'),
                cancel: t.t('account.cancel'),
                confirm: t.t('account.confirm'),
                active: t.t('account.active'),
                inactive: t.t('account.inactive'),
                notLinked: t.t('account.notLinked'),
                failed: t.t('account.failed'),
                success: t.t('account.success'),
              ));
        });
        await design.show(tester, locale, page, scale: 1.8);
        final target = find.byKey(const ValueKey('activate-account-phone'));
        await tester.scrollUntilVisible(target, 120,
            scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(target.hitTestable(), findsOneWidget);
        final rect = tester.getRect(target);
        expect(rect.left, greaterThanOrEqualTo(inset.left));
        expect(rect.right, lessThanOrEqualTo(size.width - inset.right));
        expect(rect.top, greaterThanOrEqualTo(inset.top));
        expect(rect.bottom, lessThanOrEqualTo(size.height - inset.bottom));
      });
    }
  }
}
