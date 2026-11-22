import 'dart:typed_data';
import 'image_embedded_text.dart';
import 'image_pixel_text.dart';

class ContainerEvidence {
  const ContainerEvidence(
      this.status, this.entries, this.encryptedEntries, this.texts);
  final String status;
  final int entries;

  /// Headers declare encryption; encrypted bytes are not decrypted or authenticated.
  final int encryptedEntries;
  final List<String> texts;
}

/// Recognizes a bounded, structurally consistent ZIP after a media end marker.
/// It neither extracts files to disk nor executes data nor guesses passwords.
ContainerEvidence inspectAppendedContainer(Uint8List bytes) {
  const absent = ContainerEvidence('no_recognized_appended_zip', 0, 0, []);
  if (bytes.length > 16 * 1024 * 1024) {
    return const ContainerEvidence('input_size_limit', 0, 0, []);
  }
  try {
    final end = _mediaEnd(bytes);
    if (end == null || bytes.length - end < 22) return absent;
    final data = ByteData.sublistView(bytes);
    int u16(int p) => data.getUint16(p, Endian.little);
    int u32(int p) => data.getUint32(p, Endian.little);
    var eocd = -1;
    final lower = (bytes.length - 65557).clamp(end, bytes.length);
    for (var i = bytes.length - 22; i >= lower; i--) {
      if (u32(i) == 0x06054b50 && i + 22 + u16(i + 20) == bytes.length) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return absent;
    final count = u16(eocd + 10);
    final size = u32(eocd + 12), offset = u32(eocd + 16);
    if (u16(eocd + 4) != 0 ||
        u16(eocd + 6) != 0 ||
        u16(eocd + 8) != count ||
        count < 1 ||
        count > 8 ||
        size > 65536 ||
        offset == 0xffffffff) {
      return const ContainerEvidence('zip_layout_outside_limits', 0, 0, []);
    }
    final centralStart = eocd - size;
    final base = centralStart - offset;
    if (base < end || base - end > 65536 || centralStart < base) return absent;
    var cursor = centralStart;
    var encrypted = 0;
    final texts = <String>[];
    for (var entry = 0; entry < count; entry++) {
      if (cursor + 46 > eocd || u32(cursor) != 0x02014b50) return absent;
      final flags = u16(cursor + 8), method = u16(cursor + 10);
      final crc = u32(cursor + 16), compressed = u32(cursor + 20);
      final uncompressed = u32(cursor + 24);
      final nameLength = u16(cursor + 28), extraLength = u16(cursor + 30);
      final commentLength = u16(cursor + 32), localOffset = u32(cursor + 42);
      final next = cursor + 46 + nameLength + extraLength + commentLength;
      if (nameLength > 1024 ||
          next > eocd ||
          u16(cursor + 34) != 0 ||
          compressed == 0xffffffff ||
          uncompressed == 0xffffffff ||
          localOffset == 0xffffffff) {
        return absent;
      }
      final local = base + localOffset;
      if (local < base ||
          local + 30 > centralStart ||
          u32(local) != 0x04034b50 ||
          u16(local + 6) != flags ||
          u16(local + 8) != method ||
          u16(local + 26) != nameLength) {
        return absent;
      }
      final start = local + 30 + nameLength + u16(local + 28);
      if (start > centralStart || compressed > centralStart - start) {
        return absent;
      }
      for (var i = 0; i < nameLength; i++) {
        if (bytes[local + 30 + i] != bytes[cursor + 46 + i]) return absent;
      }
      if ((flags & 8) == 0 &&
          (u32(local + 14) != crc ||
              u32(local + 18) != compressed ||
              u32(local + 22) != uncompressed)) {
        return absent;
      }
      if ((flags & 1) != 0) {
        encrypted++;
      } else if ((method == 0 || method == 8) &&
          compressed <= 8192 &&
          uncompressed <= 8192) {
        try {
          final encoded =
              Uint8List.sublistView(bytes, start, start + compressed);
          final plain =
              method == 0 ? encoded : inflateTextBounded(encoded, raw: true);
          if (plain.length == uncompressed && _crc32(plain) == crc) {
            collectCandidateText(plain, texts);
          }
        } catch (_) {/* No partial text from failed or oversized inflation. */}
      }
      cursor = next;
    }
    if (cursor != eocd) return absent;
    return ContainerEvidence(
        'recognized_appended_zip', count, encrypted, texts);
  } catch (_) {
    return const ContainerEvidence(
        'malformed_or_unsupported_container', 0, 0, []);
  }
}

int? _mediaEnd(Uint8List b) {
  if (b.length < 12) return null;
  final d = ByteData.sublistView(b);
  if (b[0] == 137 && b[1] == 80 && b[2] == 78 && b[3] == 71) {
    var p = 8;
    for (var n = 0; n < 4096 && p + 12 <= b.length; n++) {
      final size = d.getUint32(p);
      if (size > b.length - p - 12) return null;
      if (d.getUint32(p + 4) == 0x49454e44 &&
          size == 0 &&
          d.getUint32(p + 8) == 0xae426082) {
        return p + 12;
      }
      p += size + 12;
    }
  } else if (b[0] == 255 && b[1] == 216) {
    var p = 2, markers = 0;
    var entropy = false;
    while (p < b.length && markers < 4096) {
      if (entropy) {
        while (p < b.length && b[p] != 255) {
          p++;
        }
        if (p + 1 >= b.length) return null;
        if (b[p + 1] == 0 || (b[p + 1] >= 208 && b[p + 1] <= 215)) {
          p += 2;
          continue;
        }
      }
      if (b[p] != 255) return null;
      while (p < b.length && b[p] == 255) {
        p++;
      }
      if (p >= b.length) return null;
      final marker = b[p++];
      markers++;
      if (marker == 217) return p;
      if (marker == 1) {
        entropy = false;
        continue;
      }
      if (p + 2 > b.length) return null;
      final size = d.getUint16(p);
      if (size < 2 || size > b.length - p) return null;
      p += size;
      entropy = marker == 218;
    }
  } else if (b[0] == 66 && b[1] == 77) {
    final size = d.getUint32(2, Endian.little);
    if (size >= 54 && size <= b.length) return size;
  } else if (d.getUint32(0) == 0x52494646 && d.getUint32(8) == 0x57454250) {
    final size = d.getUint32(4, Endian.little) + 8;
    if (size >= 12 && size <= b.length) return size;
  }
  return null;
}

int _crc32(Uint8List data) {
  var crc = 0xffffffff;
  for (final byte in data) {
    crc ^= byte;
    for (var i = 0; i < 8; i++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}
