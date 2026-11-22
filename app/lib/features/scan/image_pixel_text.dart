import 'dart:convert';
import 'dart:typed_data';
import 'package:image/image.dart' as img;

/// Bounded, heuristic recovery of plaintext, not a universal steganalysis verdict.
class PixelTextEvidence {
  const PixelTextEvidence(this.status, this.texts, this.pixelsChecked);
  final String status;
  final List<String> texts;
  final int pixelsChecked;
}

PixelTextEvidence recoverPixelText(Uint8List original, img.Image? image) {
  final png = original.length >= 8 &&
      original[0] == 137 &&
      original[1] == 80 &&
      original[2] == 78 &&
      original[3] == 71;
  final bmp = original.length >= 2 && original[0] == 66 && original[1] == 77;
  if (!png && !bmp) {
    return const PixelTextEvidence('unsupported_format', [], 0);
  }
  if (image == null ||
      image.format != img.Format.uint8 ||
      image.numChannels < 3 ||
      image.width * image.height > 4000000) {
    return const PixelTextEvidence('unsupported_pixels_or_size', [], 0);
  }
  // Fixed work bounds: row-major prefix, 1/2 low bits, selected channel orders,
  // eight byte alignments. No encryption guessing, payload execution or URLs fetched.
  final count = (image.width * image.height).clamp(0, 131072);
  final clock = Stopwatch()..start();
  final found = <String>[];
  final channels = <List<int>>[
    [0],
    [1],
    [2],
    [0, 1, 2],
    [2, 1, 0]
  ];
  var checked = 0;
  final pixels = Uint8List(count * 3);
  for (var i = 0; i < count; i++) {
    if (i % 1024 == 0 && clock.elapsedMilliseconds > 1500) {
      return PixelTextEvidence('time_budget_partial', found, checked);
    }
    final pixel = image.getPixel(i % image.width, i ~/ image.width);
    pixels[i * 3] = pixel.r.toInt();
    pixels[i * 3 + 1] = pixel.g.toInt();
    pixels[i * 3 + 2] = pixel.b.toInt();
    checked = i + 1;
  }
  for (final order in channels) {
    for (final depth in [1, 2]) {
      final packed = Uint8List((count * order.length * depth + 7) ~/ 8);
      var bitIndex = 0;
      for (var i = 0; i < count; i++) {
        if (i % 1024 == 0 && clock.elapsedMilliseconds > 1500) {
          return PixelTextEvidence('time_budget_partial', found, checked);
        }
        for (final channel in order) {
          final value = pixels[i * 3 + channel];
          for (var bit = depth - 1; bit >= 0; bit--) {
            packed[bitIndex >> 3] |=
                ((value >> bit) & 1) << (7 - (bitIndex & 7));
            bitIndex++;
          }
        }
        checked = i + 1;
      }
      for (var alignment = 0; alignment < 8; alignment++) {
        if (clock.elapsedMilliseconds > 1500) {
          return PixelTextEvidence('time_budget_partial', found, checked);
        }
        final bytes = alignment == 0 ? packed : Uint8List(packed.length - 1);
        if (alignment != 0) {
          for (var i = 0; i < bytes.length; i++) {
            bytes[i] = ((packed[i] << alignment) & 255) |
                (packed[i + 1] >> (8 - alignment));
          }
        }
        collectCandidateText(bytes, found);
        if (found.length >= 3) {
          return PixelTextEvidence('candidate_limit_partial', found, checked);
        }
      }
    }
  }
  return PixelTextEvidence('bounded_prefix_checked', found, checked);
}

void collectCandidateText(Uint8List bytes, List<String> found) {
  if (found.length >= 3) return;
  var start = 0;
  for (var end = 0; end <= bytes.length; end++) {
    final b = end < bytes.length ? bytes[end] : 0;
    final eligible = b == 9 ||
        b == 10 ||
        b == 13 ||
        (b >= 32 && b <= 126) ||
        (b >= 128 && b <= 244);
    if (eligible && end - start < 4096) continue;
    if (end - start >= 32) {
      try {
        final text = utf8.decode(bytes.sublist(start, end)).trim();
        final words =
            RegExp(r'\p{L}{2,}', unicode: true).allMatches(text).length;
        final letters = RegExp(r'\p{L}', unicode: true).allMatches(text).length;
        final url = RegExp(
                r'https?://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/?:#][^\s]*)?')
            .hasMatch(text);
        if ((words >= 6 && letters >= text.length * 0.55) || url) {
          final bounded = text.length > 600 ? text.substring(0, 600) : text;
          if (!found
              .any((old) => old.contains(bounded) || bounded.contains(old))) {
            found.add(bounded);
            if (found.length >= 3) return;
          }
        }
      } on FormatException {
        // Binary data or an incomplete UTF-8 run is not recovered plaintext.
      }
    }
    start = end + 1;
  }
}
