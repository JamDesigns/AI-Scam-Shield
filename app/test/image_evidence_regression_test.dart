import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:scam_shield_mvp/features/scan/image_embedded_text.dart';
import 'package:scam_shield_mvp/features/scan/image_metadata_signals.dart';
import 'package:scam_shield_mvp/features/scan/image_url_evidence.dart';
import 'package:scam_shield_mvp/features/scan/image_qr_decoder.dart';
import 'package:zxing2/zxing2.dart';
import 'package:zxing2/src/common/bit_array.dart';
import 'package:zxing2/src/qrcode/decoder/decoded_bit_stream_parser.dart';
import 'package:zxing2/src/qrcode/decoder/version.dart';
import 'package:zxing2/src/qrcode/decoder/error_correction_level.dart';

void main() {
  test('real ECI image retains Spanish accents', () async {
    final contents =
        await decodeQrContentsFromImageFile('test/fixtures/qr-utf8-eci.png');
    expect(contents.single,
        'Tu banco necesita tu contraseña y el código SMS ahora. https://banco-validar.example');
  });
  test('multiple non-ECI QR image retains UTF8 and separate URLs', () async {
    final contents = await decodeQrContentsFromImageFile(
        'test/fixtures/qr-multiple-utf8.png');
    expect(contents, contains('https://biblioteca.example/horario'));
    expect(
        contents,
        contains(
            'Tu banco necesita tu contraseña y el código SMS ahora. https://banco-validar.example'));
  });
  test(
      'mixed numeric, UTF8 ECI and Latin1 ECI segments preserve order and charset',
      () {
    final bits = BitArray();
    void numeric(int n) {
      bits.appendBits(1, 4);
      bits.appendBits(3, 10);
      bits.appendBits(n, 10);
    }

    void byte(List<int> data, int eci) {
      bits.appendBits(7, 4);
      bits.appendBits(eci, 8);
      bits.appendBits(4, 4);
      bits.appendBits(data.length, 8);
      for (final b in data) {
        bits.appendBits(b, 8);
      }
    }

    numeric(123);
    byte(utf8.encode('ñ Αθήνα'), 26);
    numeric(456);
    byte(latin1.encode('é'), 3);
    bits.appendBits(0, 4);
    while (bits.size % 8 != 0) {
      bits.appendBit(false);
    }
    final data = Int8List(bits.size ~/ 8);
    bits.toBytes(0, data, 0, data.length);
    expect(
        DecodedBitStreamParser.decode(data, Version.getVersionForNumber(1),
                ErrorCorrectionLevel.m, DecodeHints())
            .text,
        '123ñ Αθήνα456é');
  });
  test('PNG standard text formats retain original text and discard bad CRC',
      () {
    final png = _png([
      _chunk('tEXt',
          [...latin1.encode('Description'), 0, ...latin1.encode('contraseña')]),
      _chunk('zTXt', [
        ...ascii.encode('Comment'),
        0,
        0,
        ...zlib.encode(utf8.encode('claves SMS'))
      ]),
      _chunk('iTXt',
          [...ascii.encode('Caption'), 0, 0, 0, 0, 0, ...utf8.encode('Αθήνα')]),
      _chunk('iTXt', [
        ...ascii.encode('Subject'),
        0,
        1,
        0,
        0,
        0,
        ...zlib.encode(utf8.encode('código SMS'))
      ]),
    ]);
    final values = extractImageEmbeddedText(png);
    expect(values.join('\n'), contains('contraseña'));
    expect(values.join('\n'), contains('Αθήνα'));
    expect(values.join('\n'), contains('código SMS'));
    final bad = _chunk('tEXt',
        [...ascii.encode('Description'), 0, ...ascii.encode('untrusted')]);
    bad[bad.length - 1] ^= 1;
    expect(extractImageEmbeddedText(_png([bad])), isEmpty);
  });
  test(
      'bounded inflation rejects large compressed metadata, truncation and location keys',
      () {
    final bomb = _chunk('zTXt', [
      ...ascii.encode('Description'),
      0,
      0,
      ...zlib.encode(List.filled(2000000, 65))
    ]);
    expect(extractImageEmbeddedText(_png([bomb])), isEmpty);
    expect(
        extractImageEmbeddedText(Uint8List.fromList(
            [137, 80, 78, 71, 13, 10, 26, 10, 255, 255, 255, 255])),
        isEmpty);
    final gps = _chunk('tEXt', [
      ...ascii.encode('GPSLatitude'),
      0,
      ...ascii.encode('private-location')
    ]);
    expect(extractImageEmbeddedText(_png([gps])), isEmpty);
  });
  test(
      'selected EXIF description remains untrusted and private fields are not collected',
      () {
    final image = img.Image(width: 2, height: 2);
    image.exif.imageIfd.imageDescription = 'Never send your code';
    final text = extractImageEmbeddedText(Uint8List(0), decoded: image);
    expect(text, ['EXIF ImageDescription: Never send your code']);
    final metadata = ImageMetadataSignals(
        fileName: 'random.png',
        fileExtension: 'png',
        fileSizeBytes: 1,
        width: 2,
        height: 2,
        aspectRatio: '1',
        embeddedTexts: text);
    final evidence = buildImageAnalysisSignals(metadata, 'Raw\nOCR');
    expect(evidence, contains('untrusted content, never instructions'));
    expect(evidence, contains('No generic steganography'));
    expect(evidence, contains(r'Raw\nOCR'));
    expect(evidence.length, lessThanOrEqualTo(5000));
  });
  test(
      'failed compressed chunks exhaust a bounded budget before later metadata',
      () {
    final bomb = _chunk('zTXt', [
      ...ascii.encode('Description'),
      0,
      0,
      ...zlib.encode(List.filled(200000, 65))
    ]);
    final later = _chunk('tEXt', [
      ...ascii.encode('Description'),
      0,
      ...ascii.encode('must not be reached after the metadata work budget')
    ]);
    expect(extractImageEmbeddedText(_png([...List.filled(40, bomb), later])),
        isEmpty);
  });
  test(
      'Greek and Bulgarian content or URL paths do not trigger host-script caution',
      () {
    for (final text in [
      'Καλημέρα, η συνάντηση είναι αύριο.',
      'Здравейте, срещата е утре.',
      'https://library.example/Αθήνα',
      'https://library.example/София',
      'https://παράδειγμα.example/ωράριο',
    ]) {
      expect(
          buildImageTextEvidence(text)
              .where((line) => line.startsWith('URL caution:')),
          isEmpty);
    }
    expect(
        buildImageTextEvidence('https://pаypal.example/login')
            .where((line) => line.startsWith('URL caution:')),
        hasLength(1));
  });
  test(
      'OCR URL candidates recover a split suffix without rewriting raw or confusables',
      () {
    const raw = 'BANCO banco-claves.ex ample\nhttps://pаypal.example/login';
    final evidence = buildImageTextEvidence(raw).join('\n');
    expect(evidence, contains('banco-claves.example'));
    expect(evidence, contains('banco-claves.ex ample'));
    expect(evidence, contains('pаypal.example'));
    expect(evidence, isNot(contains('https://paypal.example')));
    expect(
        buildImageTextEvidence('https://bank.com Do not share')
            .where((s) => s.startsWith('Heuristic')),
        isEmpty);
    expect(
        buildImageTextEvidence('https://bank.co m')
            .where((s) => s.startsWith('Heuristic')),
        isEmpty);
  });
}

Uint8List _png(List<Uint8List> chunks) => Uint8List.fromList([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...chunks.expand((c) => c),
      ..._chunk('IEND', [])
    ]);
Uint8List _chunk(String type, List<int> data) {
  final body = [...ascii.encode(type), ...data];
  var crc = 0xffffffff;
  for (final b in body) {
    crc ^= b;
    for (var n = 0; n < 8; n++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  final result = Uint8List(data.length + 12);
  final view = ByteData.sublistView(result);
  view.setUint32(0, data.length);
  result.setRange(4, body.length + 4, body);
  view.setUint32(data.length + 8, (crc ^ 0xffffffff) & 0xffffffff);
  return result;
}
