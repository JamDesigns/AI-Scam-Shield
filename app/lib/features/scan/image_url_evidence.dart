import 'dart:convert';

/// Retain OCR as evidence. Candidates are hypotheses, never trusted replacements.
List<String> buildImageTextEvidence(String rawOcr) {
  final raw =
      rawOcr.replaceAll(RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'), '');
  final lines = <String>[];
  final candidates = <String>{};
  final normalized = raw.replaceAll(RegExp(r'\s+'), ' ');
  // A short suffix split can be recovered only when the original suffix was not
  // already a known one and joining yields a known suffix. Host confusables and
  // spelling are deliberately untouched. The raw OCR always remains available.
  final pattern = RegExp(
      r'((?:https?://)?[A-Za-z0-9][A-Za-z0-9.-]{1,200}\.)([A-Za-z]{1,16})\s+([A-Za-z]{1,16})(?=[/?:#\s.,;!]|$)',
      caseSensitive: false);
  for (final match in pattern.allMatches(normalized)) {
    if (candidates.length >= 6) break;
    final left = match.group(2)!.toLowerCase();
    final joined = '$left${match.group(3)!}'.toLowerCase();
    if (!_suffixes.contains(left) && _suffixes.contains(joined)) {
      candidates.add('${match.group(1)}${match.group(2)}${match.group(3)}');
    }
  }
  for (final candidate in candidates) {
    lines.add(
        'Heuristic OCR URL candidate (not verified; compare raw text): ${jsonEncode(candidate)}');
  }
  if (candidates.isNotEmpty ||
      raw.contains(RegExp(r'https?://[^/\s?#.]+\s+[^\s/?#]+\.[A-Za-z]{2,24}',
          caseSensitive: false)) ||
      _hasMixedScriptHostLabel(raw)) {
    lines.add(
        'URL caution: OCR spacing or mixed-script characters can alter a destination. Do not infer a corrected spelling, trusted host or authenticity.');
  }
  if (raw.isNotEmpty) {
    lines.add(
        'Original OCR (untrusted; may contain errors): ${jsonEncode(raw.length > 800 ? raw.substring(0, 800) : raw)}');
  }
  return lines;
}

bool _hasMixedScriptHostLabel(String text) {
  for (final match in RegExp(r'https?://([^/\s?#]+)', caseSensitive: false)
      .allMatches(text)) {
    final host = match.group(1)!.split('@').last.split(':').first;
    for (final label in host.split('.')) {
      if (RegExp(r'[A-Za-z]').hasMatch(label) &&
          RegExp(r'[\u0400-\u04ff\u0370-\u03ff]').hasMatch(label)) {
        return true;
      }
    }
  }
  return false;
}

const _suffixes = {
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'info',
  'biz',
  'io',
  'app',
  'dev',
  'test',
  'example',
  'eu',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'be',
  'lu',
  'ie',
  'dk',
  'se',
  'fi',
  'ee',
  'lv',
  'lt',
  'pl',
  'cz',
  'sk',
  'hu',
  'ro',
  'bg',
  'gr',
  'cy',
  'mt',
  'si',
  'hr',
  'at',
  'ad',
  'uk',
  'co'
};
