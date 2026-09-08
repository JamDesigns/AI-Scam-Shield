import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

class ImageMetadataSignals {
  const ImageMetadataSignals({
    required this.fileName,
    required this.fileExtension,
    required this.fileSizeBytes,
    required this.width,
    required this.height,
    required this.aspectRatio,
  });

  final String fileName;
  final String fileExtension;
  final int fileSizeBytes;
  final int? width;
  final int? height;
  final String? aspectRatio;

  List<String> toSafeSignalLines() {
    return [
      'File name: $fileName',
      'File extension: $fileExtension',
      'Image size in bytes: $fileSizeBytes',
      if (width != null && height != null) 'Image resolution: ${width}x$height',
      if (aspectRatio != null) 'Approximate aspect ratio: $aspectRatio',
      'Privacy note: GPS, location, exact capture date, device identifiers, and camera serial data are intentionally excluded and must not be treated as authenticity evidence.',
    ];
  }
}

Future<ImageMetadataSignals> buildSafeImageMetadataSignals({
  required XFile image,
  required Uint8List imageBytes,
}) async {
  final decodedImage = img.decodeImage(imageBytes);
  final width = decodedImage?.width;
  final height = decodedImage?.height;

  return ImageMetadataSignals(
    fileName: image.name,
    fileExtension: _extractFileExtension(image.name),
    fileSizeBytes: imageBytes.length,
    width: width,
    height: height,
    aspectRatio: _buildAspectRatio(width, height),
  );
}

String _extractFileExtension(String fileName) {
  final parts = fileName.split('.');

  if (parts.length < 2) {
    return 'unknown';
  }

  final extension = parts.last.trim().toLowerCase();

  return extension.isEmpty ? 'unknown' : extension;
}

String? _buildAspectRatio(int? width, int? height) {
  if (width == null || height == null || width <= 0 || height <= 0) {
    return null;
  }

  final ratio = width / height;

  return ratio.toStringAsFixed(2);
}
