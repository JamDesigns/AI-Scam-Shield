import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android manifest declares shared image intents', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();

    expect(manifest, contains('android.intent.action.SEND'));
    expect(manifest, contains('android.intent.action.SEND_MULTIPLE'));
    expect(manifest, contains('android:mimeType="image/*"'));
  });

  test('MainActivity exposes shared image channel methods', () {
    final mainActivity =
        File('android/app/src/main/kotlin/com/jamdesigns/scamshield/MainActivity.kt')
            .readAsStringSync();

    expect(mainActivity, contains('getInitialSharedImagePath'));
    expect(mainActivity, contains('clearInitialSharedImagePath'));
    expect(mainActivity, contains('onSharedImage'));
    expect(mainActivity, contains('copySharedImageFromIntent'));
    expect(mainActivity, contains('FileOutputStream'));
  });
}
