import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scam_shield_mvp/features/scan/analysis_request_keys.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('uncertain retry survives a new request-key manager', () async {
    final first = AnalysisRequestKeys();
    final key = await first.forSignature('same-content-digest');
    final afterRestart = AnalysisRequestKeys();
    expect(await afterRestart.forSignature('same-content-digest'), key);
    expect(await afterRestart.forSignature('different-content'), isNot(key));
    expect(key, matches(RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
  });

  test('a completed analysis gets a fresh key for an intentional new scan', () async {
    final manager = AnalysisRequestKeys();
    final key = await manager.forSignature('content');
    await manager.complete('content');
    expect(await manager.forSignature('content'), isNot(key));
  });

  test('file signature follows original bytes and context rather than cache path', () async {
    final directory = await Directory('build/test-fixtures').create(recursive: true);
    final temporary = await directory.createTemp('shared-input-');
    try {
      final original = File('${temporary.path}/original');
      final sharedCopy = File('${temporary.path}/copy');
      await original.writeAsBytes([1, 2, 3, 4]);
      await sharedCopy.writeAsBytes([1, 2, 3, 4]);
      Future<String> signature(File file, String caption) =>
          AnalysisRequestKeys.fileSignature(path: file.path, modality: 'image',
            contextText: caption, language: 'es');
      expect(await signature(original, 'caption'), await signature(sharedCopy, 'caption'));
      expect(await signature(original, 'caption'),
          isNot(await signature(original, 'different caption')));
      await sharedCopy.writeAsBytes([4, 3, 2, 1]);
      expect(await signature(original, 'caption'),
          isNot(await signature(sharedCopy, 'caption')));
    } finally {
      await temporary.delete(recursive: true);
    }
  });
}
