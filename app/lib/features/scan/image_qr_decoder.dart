import 'dart:io';

import 'package:image/image.dart' as img;
import 'package:zxing2/qrcode.dart';

Future<List<String>> decodeQrContentsFromImageFile(String imagePath) async {
  final file = File(imagePath);

  if (!await file.exists()) {
    return [];
  }

  final bytes = await file.readAsBytes();
  final image = img.decodeImage(bytes);

  if (image == null) {
    return [];
  }

  final source = RGBLuminanceSource(
    image.width,
    image.height,
    image
        .convert(numChannels: 4)
        .getBytes(order: img.ChannelOrder.rgba)
        .buffer
        .asInt32List(),
  );

  final bitmap = BinaryBitmap(HybridBinarizer(source));
  final reader = QRCodeReader();

  try {
    final result = reader.decode(bitmap);
    final text = result.text.trim();

    if (text.isEmpty) {
      return [];
    }

    return [text];
  } catch (_) {
    return [];
  }
}
