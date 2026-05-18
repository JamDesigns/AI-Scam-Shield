import 'image_scan_text.dart';

String buildImageScanContent({
  required String ocrText,
  required List<String> qrContents,
  required int maxLength,
}) {
  final preparedOcrText = prepareImageScanText(
    ocrText,
    maxLength: maxLength,
  );

  final preparedQrContents = qrContents
      .map((content) => prepareImageScanText(content, maxLength: maxLength))
      .where((content) => content.isNotEmpty)
      .toSet()
      .toList();

  final parts = <String>[
    if (preparedOcrText.isNotEmpty) preparedOcrText,
    ...preparedQrContents.map((content) => 'QR code content: $content'),
  ];

  if (parts.isEmpty) {
    return '';
  }

  return prepareImageScanText(
    parts.join(' '),
    maxLength: maxLength,
  );
}
