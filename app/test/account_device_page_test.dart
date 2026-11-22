import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/core/api_client.dart';
import 'package:scam_shield_mvp/core/premium_account_service.dart';
import 'package:scam_shield_mvp/features/premium/account_device_page.dart';

class FakeAccountService extends PremiumAccountService {
  FakeAccountService()
      : super(ApiClient(
            deviceId: 'synthetic',
            accessToken: 'synthetic',
            localeLanguageCode: 'en-GB'));
  int activations = 0;
  bool fail = false;
  bool linked = true;
  int deletions = 0;
  @override
  Future<void> requestDeletion({required bool confirmed}) async {
    expect(confirmed, isTrue);
    deletions++;
  }

  @override
  Future<PremiumAccountStatus> status() async => PremiumAccountStatus(
      linked: linked,
      activeOnThisDevice: false,
      isPremium: false,
      deletionAvailable: true,
      accountId: 'owner',
      revenueCatAppUserId: 'owner');
  @override
  Future<PremiumAccountStatus> activate({required bool confirmed}) async {
    expect(confirmed, isTrue);
    activations++;
    if (fail) throw StateError('synthetic confidential diagnostic');
    return const PremiumAccountStatus(
        linked: true,
        activeOnThisDevice: true,
        isPremium: true,
        accountId: 'owner',
        revenueCatAppUserId: 'owner');
  }
}

const labels = AccountDeviceLabels(
    title: 'Account',
    signInGoogle: 'Continue with Google',
    restore: 'Restore purchases',
    activate: 'Activate this phone',
    confirmTitle: 'Change active phone?',
    confirmMessage:
        'Activating this phone removes Premium access from the previous phone.',
    cancel: 'Cancel',
    confirm: 'Confirm activation',
    active: 'This phone is active',
    inactive: 'This phone is inactive',
    notLinked: 'Sign in first',
    failed: 'Please try again',
    success: 'Updated');

void main() {
  testWidgets(
      'deletion requires confirmation and cancellation preserves account',
      (tester) async {
    final service = FakeAccountService();
    await tester.pumpWidget(
        MaterialApp(home: AccountDevicePage(service: service, labels: labels)));
    await tester.pumpAndSettle();
    final button = find.byKey(const ValueKey('delete-account'));
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text(labels.deleteMessage), findsOneWidget);
    expect(service.deletions, 0);
    await tester.tap(find.text(labels.cancel));
    await tester.pumpAndSettle();
    expect(service.deletions, 0);
    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, labels.deleteAccount));
    await tester.pumpAndSettle();
    expect(service.deletions, 1);
    expect(find.text(labels.deleteAccepted), findsOneWidget);
  });
  testWidgets('linked accounts hide the Google sign-in action after reopening',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home:
            AccountDevicePage(service: FakeAccountService(), labels: labels)));
    await tester.pumpAndSettle();
    expect(find.text(labels.signInGoogle), findsNothing);
    expect(find.text(labels.inactive), findsOneWidget);
  });
  testWidgets('unlinked accounts retain the Google sign-in action',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: AccountDevicePage(
            service: FakeAccountService()..linked = false, labels: labels)));
    await tester.pumpAndSettle();
    expect(find.text(labels.signInGoogle), findsOneWidget);
  });
  testWidgets(
      'activation requires an explicit confirmation and cancellation has no effect',
      (tester) async {
    final service = FakeAccountService();
    await tester.pumpWidget(
        MaterialApp(home: AccountDevicePage(service: service, labels: labels)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(labels.activate));
    await tester.pumpAndSettle();
    expect(service.activations, 0);
    expect(find.text(labels.confirmMessage), findsOneWidget);
    await tester.tap(find.text(labels.cancel));
    await tester.pumpAndSettle();
    expect(service.activations, 0);
    await tester.tap(find.text(labels.activate));
    await tester.pumpAndSettle();
    await tester.tap(find.text(labels.confirm));
    await tester.pumpAndSettle();
    expect(service.activations, 1);
    expect(find.text(labels.active), findsOneWidget);
    expect(find.text(labels.activate), findsNothing);
  });
  testWidgets(
      'large text and landscape cutouts keep controls outside system occlusion',
      (tester) async {
    tester.view.physicalSize = const Size(740, 420);
    tester.view.devicePixelRatio = 1;
    tester.view.viewPadding =
        const FakeViewPadding(left: 44, right: 20, bottom: 48, top: 24);
    tester.view.padding =
        const FakeViewPadding(left: 44, right: 20, bottom: 48, top: 24);
    addTearDown(tester.view.reset);
    final service = FakeAccountService();
    await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.5)),
            child: child!),
        home: AccountDevicePage(service: service, labels: labels)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(labels.activate));
    await tester.pumpAndSettle();
    final button =
        tester.getRect(find.widgetWithText(FilledButton, labels.activate));
    expect(button.left, greaterThanOrEqualTo(44));
    expect(button.right, lessThanOrEqualTo(720));
    expect(button.bottom, lessThanOrEqualTo(372));
    expect(tester.takeException(), isNull);
  });
  testWidgets('provider failures never expose raw diagnostics', (tester) async {
    final service = FakeAccountService()..fail = true;
    await tester.pumpWidget(
        MaterialApp(home: AccountDevicePage(service: service, labels: labels)));
    await tester.pumpAndSettle();
    await tester.tap(find.text(labels.activate));
    await tester.pumpAndSettle();
    await tester.tap(find.text(labels.confirm));
    await tester.pumpAndSettle();
    expect(find.text(labels.failed), findsOneWidget);
    expect(find.textContaining('confidential'), findsNothing);
  });
}
