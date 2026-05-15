import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/image_scan_text.dart';

void main() {
  test('prepareImageScanText normalizes whitespace from OCR text', () {
    final text = prepareImageScanText(
      'Your bank account\n\nis locked.   Verify now.',
      maxLength: 1500,
    );

    expect(text, 'Your bank account is locked. Verify now.');
  });

  test('prepareImageScanText preserves suspicious URLs from OCR text', () {
    final text = prepareImageScanText(
      'Verify now:\nhttps://secure-login-paypaI.com\nDo not ignore this.',
      maxLength: 1500,
    );

    expect(
      text,
      'Verify now: https://secure-login-paypaI.com Do not ignore this.',
    );
  });

  test('prepareImageScanText keeps text when it matches max length exactly', () {
    final text = prepareImageScanText(
      'a' * 1500,
      maxLength: 1500,
    );

    expect(text.length, 1500);
    expect(text, 'a' * 1500);
  });

  test('prepareImageScanText returns empty string when OCR text is blank', () {
    final text = prepareImageScanText(
      '   \n\t   ',
      maxLength: 1500,
    );

    expect(text, '');
  });

  test('prepareImageScanText truncates text to max length', () {
    final text = prepareImageScanText(
      'a' * 1600,
      maxLength: 1500,
    );

    expect(text.length, 1500);
    expect(text, 'a' * 1500);
  });
}
