import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:scam_shield_mvp/features/scan/image_pixel_text.dart';
import 'package:scam_shield_mvp/features/scan/image_metadata_signals.dart';

void main() {
  final fixtures = jsonDecode(
          File('test/fixtures/steganography/manifest.json').readAsStringSync())
      as List<dynamic>;
  for (final row in fixtures) {
    test('independent fixture ${row['id']}', () {
      final bytes =
          File('test/fixtures/steganography/${row['file']}').readAsBytesSync();
      final result = recoverPixelText(bytes, img.decodeImage(bytes));
      if (row['expected'] != 'recovered_candidate') {
        expect(result.texts, isEmpty);
      } else {
        expect(result.texts.any((text) => text.contains(row['text'] as String)),
            isTrue);
      }
      expect(result.pixelsChecked, lessThanOrEqualTo(131072));
      expect(result.texts.length, lessThanOrEqualTo(3));
      expect(result.texts.every((s) => s.length <= 600), isTrue);
    });
  }
  test('JPEG recompression is explicitly unsupported', () {
    final png = File('test/fixtures/steganography/STEG-01-red-phishing.png')
        .readAsBytesSync();
    final image = img.decodeImage(png)!;
    final jpeg = Uint8List.fromList(img.encodeJpg(image));
    final result = recoverPixelText(jpeg, img.decodeImage(jpeg));
    expect(result.status, 'unsupported_format');
    expect(result.texts, isEmpty);
  });
  test('high depth and large images are not silently declared clean', () {
    final header = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(
        recoverPixelText(header,
                img.Image(width: 2, height: 2, format: img.Format.uint16))
            .status,
        'unsupported_pixels_or_size');
    expect(
        recoverPixelText(header, img.Image(width: 2001, height: 2000)).status,
        'unsupported_pixels_or_size');
  });
  test('isolate integration preserves recovered text as untrusted evidence',
      () async {
    const path = 'test/fixtures/steganography/STEG-01-red-phishing.png';
    final metadata = await buildSafeImageMetadataSignals(
        image: XFile(path), imageBytes: File(path).readAsBytesSync());
    final evidence = buildImageAnalysisSignals(metadata, 'Original OCR');
    expect(evidence, contains('Candidate text recovered from low pixel bits'));
    expect(evidence, contains('contraseña'));
    expect(evidence, contains('its presence alone is not fraud'));
    expect(evidence.length, lessThanOrEqualTo(5000));
  });
}
