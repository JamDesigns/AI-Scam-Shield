import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/image_jpeg_text.dart';
import 'package:scam_shield_mvp/features/scan/image_container_evidence.dart';

void main() {
  const root = 'test/fixtures/advanced-steganography';
  for (final row
      in jsonDecode(File('$root/jpeg-manifest.json').readAsStringSync())
          as List) {
    test('libjpeg coefficient fixture ${row['id']}', () {
      final bytes = File('$root/${row['file']}').readAsBytesSync();
      final result = recoverJpegCoefficientText(bytes);
      expect(result.status, 'bounded_coefficient_prefix_checked');
      if (row['text'] == null) {
        expect(result.texts, isEmpty);
      } else {
        expect(
            result.texts.any((s) => s.contains(row['text'] as String)), isTrue);
      }
      expect(result.texts.length, lessThanOrEqualTo(3));
      expect(result.texts.every((s) => s.length <= 600), isTrue);
    });
  }
  for (final row
      in jsonDecode(File('$root/container-manifest.json').readAsStringSync())
          as List) {
    test('standard ZIP fixture ${row['id']}', () {
      final result = inspectAppendedContainer(
          File('$root/${row['file']}').readAsBytesSync());
      expect(result.status == 'recognized_appended_zip', row['recognized']);
      expect(result.encryptedEntries, row['encryptedEntries']);
      if (row['text'] == null) {
        expect(result.texts, isEmpty);
      } else {
        expect(
            result.texts.any((s) => s.contains(row['text'] as String)), isTrue);
      }
      expect(result.texts.length, lessThanOrEqualTo(3));
    });
  }
  test(
      'huge declared JPEG dimensions are rejected before coefficient allocation',
      () {
    final bytes = File('$root/J04-clean.jpg').readAsBytesSync();
    var marker = -1;
    for (var i = 0; i + 8 < bytes.length; i++) {
      if (bytes[i] == 255 && bytes[i + 1] == 192) {
        marker = i;
        break;
      }
    }
    expect(marker, greaterThan(0));
    for (var i = marker + 5; i <= marker + 8; i++) {
      bytes[i] = 255;
    }
    expect(
        recoverJpegCoefficientText(bytes).status, 'dimensions_or_format_limit');
  });
  test(
      'truncated headers never produce recognized containers or recovered text',
      () {
    final jpeg = File('$root/C03-jpeg-aes.jpg').readAsBytesSync();
    for (final length in [0, 1, 2, 16, 64, jpeg.length - 1]) {
      final short = Uint8List.sublistView(jpeg, 0, length);
      expect(inspectAppendedContainer(short).encryptedEntries, 0);
      expect(inspectAppendedContainer(short).texts, isEmpty);
    }
  });
}
