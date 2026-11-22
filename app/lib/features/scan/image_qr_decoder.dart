import 'dart:collection';
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

  final contents = <String>{};
  final queue = Queue<({int x, int y, int width, int height, int depth})>()
    ..add((x: 0, y: 0, width: image.width, height: image.height, depth: 0));
  final visited = <String>{};
  var attempts = 0;
  var processedPixels = 0;
  final pixelBudget = image.width * image.height * 8;
  // Bounded multi-code search. Seventeen results let the caller reject its
  // sixteen-code request limit instead of silently discarding a detected code.
  while (queue.isNotEmpty && attempts < 48 && contents.length < 17) {
    final region = queue.removeFirst();
    final key = '${region.x},${region.y},${region.width},${region.height}';
    if (!visited.add(key) || region.width < 32 || region.height < 32) {
      continue;
    }
    final pixels = region.width * region.height;
    if (processedPixels + pixels > pixelBudget) {
      continue;
    }
    processedPixels += pixels;
    attempts++;
    final crop = img.copyCrop(
      image,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    );
    final source = RGBLuminanceSource(
      crop.width,
      crop.height,
      crop
          .convert(numChannels: 4)
          .getBytes(order: img.ChannelOrder.rgba)
          .buffer
          .asInt32List(),
    );
    try {
      final result = QRCodeReader().decode(
        BinaryBitmap(HybridBinarizer(source)),
      );
      final text = result.text.trim();
      if (text.isNotEmpty) {
        contents.add(text);
      }
      if (region.depth >= 5 || result.resultPoints.isEmpty) {
        continue;
      }
      final xs = result.resultPoints.map((point) => point.x);
      final ys = result.resultPoints.map((point) => point.y);
      final left = xs.reduce((a, b) => a < b ? a : b).floor();
      final right = xs.reduce((a, b) => a > b ? a : b).ceil();
      final top = ys.reduce((a, b) => a < b ? a : b).floor();
      final bottom = ys.reduce((a, b) => a > b ? a : b).ceil();
      void add(int x, int y, int width, int height) {
        if (width >= 32 &&
            height >= 32 &&
            (width < region.width || height < region.height)) {
          queue.add((
            x: x,
            y: y,
            width: width,
            height: height,
            depth: region.depth + 1,
          ));
        }
      }

      add(region.x, region.y, left, region.height);
      add(region.x, region.y, region.width, top);
      add(region.x + right, region.y, region.width - right, region.height);
      add(region.x, region.y + bottom, region.width, region.height - bottom);
    } catch (_) {
      // Multiple finder patterns can prevent a whole-image decode. Overlapping
      // quadrants give separated codes another chance without exhaustive tiling.
      if (region.depth < 2 && region.width >= 96 && region.height >= 96) {
        final width = (region.width * 2 / 3).ceil();
        final height = (region.height * 2 / 3).ceil();
        for (final dx in [0, region.width - width]) {
          for (final dy in [0, region.height - height]) {
            queue.add((
              x: region.x + dx,
              y: region.y + dy,
              width: width,
              height: height,
              depth: region.depth + 1,
            ));
          }
        }
      }
    }
  }
  return contents.toList(growable: false);
}
