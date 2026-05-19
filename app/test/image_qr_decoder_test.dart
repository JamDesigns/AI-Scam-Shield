import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:scam_shield_mvp/features/scan/image_qr_decoder.dart';
import 'package:zxing2/qrcode.dart';

void main() {
  test('decodeQrContentsFromImageFile extracts QR content from image file', () async {
    const url = 'https://secure-login-paypaI.com';
    final file = await _createQrFixture(url);

    final contents = await decodeQrContentsFromImageFile(file.path);

    expect(contents, [url]);

    await file.delete();

    final fixturesDirectory = file.parent;
    if (await fixturesDirectory.exists() &&
        fixturesDirectory.listSync().isEmpty) {
      await fixturesDirectory.delete();
    }
  });

  test('decodeQrContentsFromImageFile returns empty list for missing file', () async {
    final contents = await decodeQrContentsFromImageFile(
      'test/fixtures/missing.png',
    );

    expect(contents, isEmpty);
  });
}

Future<File> _createQrFixture(String content) async {
  final qrCode = Encoder.encode(content, ErrorCorrectionLevel.m);
  final matrix = qrCode.matrix!;

  const scale = 12;
  const quietZone = 4;
  final size = (matrix.width + quietZone * 2) * scale;

  final image = img.Image(width: size, height: size);
  img.fill(image, color: img.ColorRgb8(255, 255, 255));

  for (var y = 0; y < matrix.height; y++) {
    for (var x = 0; x < matrix.width; x++) {
      if (matrix.get(x, y) != 1) {
        continue;
      }

      img.fillRect(
        image,
        x1: (x + quietZone) * scale,
        y1: (y + quietZone) * scale,
        x2: (x + quietZone + 1) * scale - 1,
        y2: (y + quietZone + 1) * scale - 1,
        color: img.ColorRgb8(0, 0, 0),
      );
    }
  }

  final file = File('test/fixtures/generated-qr-scam-test.png');
  await file.parent.create(recursive: true);
  await file.writeAsBytes(img.encodePng(image));

  return file;
}
