import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Selected standard metadata only. No claim of generic steganography detection.
List<String> extractImageEmbeddedText(Uint8List bytes, {img.Image? decoded}) {
  const maxTotal = 1600;
  const maxValue = 600;
  final texts = <String>[];
  var total = 0;
  void add(String source, String value) {
    // Bound even a freeform EXIF value before scanning or cleaning it.
    final input = value.length > 8192 ? value.substring(0, 8192) : value;
    final cleaned = input
        .replaceAll(RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'), '')
        .trim();
    if (cleaned.isEmpty || texts.length >= 8 || total >= maxTotal) return;
    final room = (maxTotal - total).clamp(0, maxValue);
    final bounded =
        cleaned.length > room ? cleaned.substring(0, room) : cleaned;
    final text = '$source: $bounded';
    if (!texts.contains(text)) {
      texts.add(text);
      total += bounded.length;
    }
  }

  if (bytes.length <= 16 * 1024 * 1024 && _isPng(bytes)) {
    var offset = 8;
    var scanned = 0;
    var textChunks = 0;
    while (offset + 12 <= bytes.length && scanned++ < 4096) {
      final length =
          ByteData.sublistView(bytes, offset, offset + 4).getUint32(0);
      if (length > bytes.length - offset - 12) break;
      final type = latin1.decode(bytes.sublist(offset + 4, offset + 8));
      final end = offset + 8 + length;
      // Count failed/oversized chunks too; failed inflation is not free work.
      if (['tEXt', 'zTXt', 'iTXt'].contains(type) && ++textChunks > 32) break;
      if (['tEXt', 'zTXt', 'iTXt'].contains(type) && length <= 65536) {
        final expected = ByteData.sublistView(bytes, end, end + 4).getUint32(0);
        if (_crc32(bytes, offset + 4, end) == expected) {
          try {
            final data = Uint8List.sublistView(bytes, offset + 8, end);
            final split = data.indexOf(0);
            if (split > 0 && split <= 79) {
              final key = latin1.decode(data.sublist(0, split));
              if (_allowedKeys.contains(key.toLowerCase())) {
                var start = split + 1;
                String? value;
                if (type == 'tEXt' && data.length - start <= 8192) {
                  value = latin1.decode(data.sublist(start));
                } else if (type == 'zTXt' &&
                    start < data.length &&
                    data[start++] == 0) {
                  value = latin1.decode(
                      inflateTextBounded(Uint8List.sublistView(data, start)));
                } else if (type == 'iTXt' && start + 2 <= data.length) {
                  final compressed = data[start++];
                  final method = data[start++];
                  if (compressed <= 1 && method == 0) {
                    final languageEnd = data.indexOf(0, start);
                    if (languageEnd >= start) {
                      final translatedEnd = data.indexOf(0, languageEnd + 1);
                      if (translatedEnd >= languageEnd + 1) {
                        final content =
                            Uint8List.sublistView(data, translatedEnd + 1);
                        if (content.length <= 8192) {
                          value = utf8.decode(compressed == 1
                              ? inflateTextBounded(content)
                              : content);
                        }
                      }
                    }
                  }
                }
                if (value != null) add('PNG $key', value);
              }
            }
          } on Exception {
            // Invalid, oversized or unsupported metadata is not evidence.
          }
        }
      }
      offset = end + 4;
      if (type == 'IEND') break;
    }
  }
  // These content fields are intentionally selected; GPS/device/camera IDs are excluded.
  final exif = decoded?.exif;
  if (exif != null) {
    final description = exif.imageIfd.imageDescription;
    if (description != null) add('EXIF ImageDescription', description);
    final comment = exif.exifIfd.userComment;
    if (comment != null) add('EXIF UserComment', comment);
  }
  return texts;
}

const _allowedKeys = {
  'description',
  'comment',
  'title',
  'caption',
  'subject',
  'parameters',
  'prompt',
  'negative prompt'
};
bool _isPng(Uint8List bytes) =>
    bytes.length >= 8 && base64.encode(bytes.sublist(0, 8)) == 'iVBORw0KGgo=';

int _crc32(Uint8List data, int start, int end) {
  var crc = 0xffffffff;
  for (var i = start; i < end; i++) {
    crc ^= data[i];
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}

Uint8List inflateTextBounded(Uint8List input, {bool raw = false}) {
  if (input.length > 8192) throw const FormatException('Metadata input limit');
  final sink = _LimitedBytes(8192);
  final decoder = ZLibDecoder(raw: raw).startChunkedConversion(sink);
  // Small input chunks let the output sink stop inflation early, rather than after convert().
  var closed = false;
  try {
    for (var i = 0; i < input.length; i += 64) {
      decoder.add(
          Uint8List.sublistView(input, i, (i + 64).clamp(0, input.length)));
    }
    decoder.close();
    closed = true;
    return sink.bytes.takeBytes();
  } finally {
    if (!closed) {
      try {
        decoder.close();
      } catch (_) {/* Preserve the original bounds/format error. */}
    }
  }
}

class _LimitedBytes implements Sink<List<int>> {
  _LimitedBytes(this.limit);
  final int limit;
  final bytes = BytesBuilder(copy: false);
  var count = 0;
  @override
  void add(List<int> chunk) {
    if (count + chunk.length > limit) {
      throw const FormatException('Metadata output limit');
    }
    count += chunk.length;
    bytes.add(chunk);
  }

  @override
  void close() {}
}
