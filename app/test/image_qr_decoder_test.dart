import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:scam_shield_mvp/features/scan/image_qr_decoder.dart';
import 'package:zxing2/qrcode.dart';

void main() {
  test(
    'decodeQrContentsFromImageFile extracts QR content from image file',
    () async {
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
    },
  );

  test(
    'decodeQrContentsFromImageFile returns empty list for missing file',
    () async {
      final contents = await decodeQrContentsFromImageFile(
        'test/fixtures/missing.png',
      );

      expect(contents, isEmpty);
    },
  );

  test('finds two different QR URLs in the same image', () async {
    const first = 'https://bank.example/login';
    const second = 'https://other.example/pay';
    final left = _qrImage(first);
    final right = _qrImage(second);
    final height = left.height > right.height ? left.height : right.height;
    final combined = img.Image(
      width: left.width + right.width + 80,
      height: height + 80,
    );
    img.fill(combined, color: img.ColorRgb8(255, 255, 255));
    img.compositeImage(combined, left, dstX: 20, dstY: 20);
    img.compositeImage(combined, right, dstX: left.width + 60, dstY: 20);
    final directory = await Directory.systemTemp.createTemp('aiss_qr_');
    final file = File('${directory.path}/two-codes.png');
    addTearDown(() async {
      if (await file.exists()) {
        await file.delete();
      }
      await directory.delete();
    });
    await file.writeAsBytes(img.encodePng(combined));
    expect(
      await decodeQrContentsFromImageFile(file.path),
      unorderedEquals([first, second]),
    );
  });
}

img.Image _qrImage(String content) {
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

  return image;
}

Future<File> _createQrFixture(String content) async {
  final file = File('test/fixtures/generated-qr-scam-test.png');
  await file.parent.create(recursive: true);
  await file.writeAsBytes(img.encodePng(_qrImage(content)));

  return file;
}
