// image 4.8.0 is pinned because its coefficient model is an internal API.
// The adapter is covered by independent libjpeg-generated JPEG fixtures.
// ignore_for_file: implementation_imports, invalid_use_of_internal_member
import 'dart:typed_data';
import 'package:image/src/formats/jpeg/jpeg_data.dart';
import 'image_pixel_text.dart';

class JpegTextEvidence {
  const JpegTextEvidence(this.status, this.texts, this.coefficientsChecked);
  final String status;
  final List<String> texts;
  final int coefficientsChecked;
}

/// Partial plaintext recovery from eligible quantized AC coefficients.
/// No claim of detecting F5, OutGuess, encrypted or arbitrary JPEG payloads.
JpegTextEvidence recoverJpegCoefficientText(Uint8List bytes) {
  if (bytes.length < 4 || bytes[0] != 255 || bytes[1] != 216) {
    return const JpegTextEvidence('unsupported_format', [], 0);
  }
  if (bytes.length > 8 * 1024 * 1024) {
    return const JpegTextEvidence('encoded_size_limit', [], 0);
  }
  final found = <String>[];
  var checked = 0;
  final clock = Stopwatch()..start();
  try {
    final dimensions = _boundedJpegDimensions(bytes);
    if (dimensions == null) {
      return const JpegTextEvidence('dimensions_or_format_limit', [], 0);
    }
    final jpeg = JpegData()..read(bytes);
    final frame = jpeg.frame!;
    if (frame.precision != 8 || frame.componentsOrder.isEmpty) {
      return const JpegTextEvidence('unsupported_coefficients', [], 0);
    }
    final streams = [<int>[], <int>[]];
    final first = frame.componentsOrder.first;
    var blocks = 0;
    scan:
    for (var my = 0; my < frame.mcusPerColumn; my++) {
      for (var mx = 0; mx < frame.mcusPerLine; mx++) {
        for (final id in frame.componentsOrder) {
          final component = frame.components[id]!;
          for (var vy = 0; vy < component.vSamples; vy++) {
            for (var hx = 0; hx < component.hSamples; hx++) {
              if (++blocks > 8192 || clock.elapsedMilliseconds > 2000) {
                break scan;
              }
              final block = component.blocks[my * component.vSamples + vy]
                  [mx * component.hSamples + hx];
              for (var zig = 1; zig < 64; zig++) {
                final value = block[JpegData.dctZigZag[zig]];
                checked++;
                if (value.abs() <= 1) continue;
                if (id == first && streams[0].length < 131072) {
                  streams[0].add(value & 1);
                }
                if (streams[1].length < 131072) streams[1].add(value & 1);
              }
              if (streams.every((s) => s.length >= 131072)) break scan;
            }
          }
        }
      }
    }
    for (final bits in streams) {
      for (final littleEndian in [true, false]) {
        for (var alignment = 0; alignment < 8; alignment++) {
          if (clock.elapsedMilliseconds > 2000) {
            return JpegTextEvidence('time_budget_partial', found, checked);
          }
          final count = (bits.length - alignment) ~/ 8;
          if (count <= 0) continue;
          final packed = Uint8List(count);
          for (var i = 0; i < count; i++) {
            for (var bit = 0; bit < 8; bit++) {
              packed[i] |= bits[alignment + i * 8 + bit] <<
                  (littleEndian ? bit : 7 - bit);
            }
          }
          collectCandidateText(packed, found);
          if (found.length >= 3) {
            return JpegTextEvidence('candidate_limit_partial', found, checked);
          }
        }
      }
    }
    return JpegTextEvidence(
        'bounded_coefficient_prefix_checked', found, checked);
  } catch (_) {
    return JpegTextEvidence('malformed_or_unsupported', found, checked);
  }
}

// Do not use JpegDecoder.startDecode for this preflight: image 4.8.0 already
// allocates coefficient blocks there. Inspect SOF and sampling before allocation.
List<int>? _boundedJpegDimensions(Uint8List bytes) {
  final data = ByteData.sublistView(bytes);
  var p = 2;
  for (var markers = 0; markers < 4096 && p + 4 <= bytes.length; markers++) {
    if (bytes[p] != 255) return null;
    while (p < bytes.length && bytes[p] == 255) {
      p++;
    }
    if (p + 3 > bytes.length) return null;
    final marker = bytes[p++];
    if (marker == 218 || marker == 217) return null;
    if (marker == 1) continue;
    final size = data.getUint16(p);
    if (size < 2 || size > bytes.length - p) return null;
    if (marker == 192 || marker == 193 || marker == 194) {
      if (size < 8 || bytes[p + 2] != 8) return null;
      final height = data.getUint16(p + 3), width = data.getUint16(p + 5);
      final count = bytes[p + 7];
      if (width <= 0 ||
          height <= 0 ||
          width > 4096 ||
          height > 4096 ||
          width * height > 1000000 ||
          (count != 1 && count != 3) ||
          size != 8 + count * 3) {
        return null;
      }
      final ids = <int>{};
      for (var i = 0; i < count; i++) {
        final base = p + 8 + i * 3, sample = bytes[base + 1];
        if (!ids.add(bytes[base]) ||
            sample >> 4 < 1 ||
            sample >> 4 > 2 ||
            (sample & 15) < 1 ||
            (sample & 15) > 2 ||
            bytes[base + 2] > 3) {
          return null;
        }
      }
      return [width, height];
    }
    p += size;
  }
  return null;
}
