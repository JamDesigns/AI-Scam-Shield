String prepareImageScanText(
  String rawText, {
  required int maxLength,
}) {
  final normalizedText = rawText.replaceAll(RegExp(r'\s+'), ' ').trim();

  if (normalizedText.isEmpty) {
    return '';
  }

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return normalizedText.substring(0, maxLength);
}
