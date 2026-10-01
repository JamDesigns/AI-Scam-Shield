import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android manifest declares shared media intents', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();

    expect(manifest, contains('android.intent.action.SEND'));
    expect(manifest, contains('android.intent.action.SEND_MULTIPLE'));
    expect(manifest, contains('android:mimeType="image/*"'));
    expect(manifest, contains('android:mimeType="video/*"'));
  });

  test('MainActivity exposes shared media channel methods', () {
    final mainActivity =
        File(
          'android/app/src/main/kotlin/com/jamdesigns/scamshield/MainActivity.kt',
        ).readAsStringSync();

    expect(mainActivity, contains('getInitialSharedMedia'));
    expect(mainActivity, contains('clearInitialSharedMedia'));
    expect(mainActivity, contains('onSharedMedia'));
    expect(mainActivity, contains('copySharedMediaFromIntent'));
    expect(mainActivity, contains('"path" to destination.absolutePath'));
    expect(mainActivity, contains('"mimeType" to mimeType'));
    expect(mainActivity, contains('type.startsWith("image/")'));
    expect(mainActivity, contains('type.startsWith("video/")'));
    expect(mainActivity, contains('FileOutputStream'));
  });
}
