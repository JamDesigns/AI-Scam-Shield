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
      .map((content) => content.replaceAll(RegExp(r'\s+'), ' ').trim())
      .where((content) => content.isNotEmpty)
      .toSet()
      .toList();

  // This is the bounded legacy text representation. QR contents are also sent
  // separately in the API contract, so no URL depends on the OCR budget.
  final qrParts = <String>[];
  var qrLength = 0;
  for (final content in preparedQrContents) {
    final part = 'QR code content: $content';
    final nextLength = qrLength + (qrParts.isEmpty ? 0 : 1) + part.length;
    if (nextLength <= maxLength) {
      qrParts.add(part);
      qrLength = nextLength;
    }
  }
  final ocrBudget = maxLength - qrLength - (qrParts.isEmpty ? 0 : 1);
  final boundedOcr = ocrBudget > 0
      ? prepareImageScanText(preparedOcrText, maxLength: ocrBudget)
      : '';
  final parts = <String>[
    if (boundedOcr.isNotEmpty) boundedOcr,
    ...qrParts,
  ];

  if (parts.isEmpty) {
    return '';
  }

  return parts.join(' ');
}
