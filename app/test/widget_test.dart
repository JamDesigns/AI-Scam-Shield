import 'package:flutter_test/flutter_test.dart';

import 'package:scam_shield_mvp/main.dart';

void main() {
  testWidgets('App renders', (WidgetTester tester) async {
    await tester.pumpWidget(const ScamShieldApp());
    await tester.pump();
    expect(find.byType(ScamShieldApp), findsOneWidget);
  });
}
