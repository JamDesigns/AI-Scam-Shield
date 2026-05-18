import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/image_scan_content.dart';

void main() {
  test('buildImageScanContent combines OCR text and QR content', () {
    final content = buildImageScanContent(
      ocrText: 'Verify your account now.',
      qrContents: const ['https://secure-login-paypaI.com'],
      maxLength: 1500,
    );

    expect(
      content,
      'Verify your account now. QR code content: https://secure-login-paypaI.com',
    );
  });

  test('buildImageScanContent works with QR content only', () {
    final content = buildImageScanContent(
      ocrText: '',
      qrContents: const ['https://fake-bank-login.example'],
      maxLength: 1500,
    );

    expect(
      content,
      'QR code content: https://fake-bank-login.example',
    );
  });

  test('buildImageScanContent removes duplicated QR content', () {
    final content = buildImageScanContent(
      ocrText: 'Scan this QR code.',
      qrContents: const [
        'https://fake-bank-login.example',
        'https://fake-bank-login.example',
      ],
      maxLength: 1500,
    );

    expect(
      content,
      'Scan this QR code. QR code content: https://fake-bank-login.example',
    );
  });

  test('buildImageScanContent returns empty string without OCR or QR content', () {
    final content = buildImageScanContent(
      ocrText: '   ',
      qrContents: const ['', '   '],
      maxLength: 1500,
    );

    expect(content, '');
  });

  test('buildImageScanContent respects max length', () {
    final content = buildImageScanContent(
      ocrText: 'a' * 1600,
      qrContents: const ['https://fake-bank-login.example'],
      maxLength: 1500,
    );

    expect(content.length, 1500);
  });
}
