# Local decoding correction

Vendored from the public zxing2 0.2.4 package. The original licence and README are retained. The QR bit-stream parser and charset-guess byte handling are changed: signed Int8List byte segments are converted to unsigned octets before charset guessing and Encoding.decode. This fixes replacement characters for non-ASCII bytes while preserving segment boundaries, ECI selection, numeric/alphanumeric sections and the upstream result API. The Hanzi/Kanji byte decoding call sites receive the same unsigned conversion; upstream charset support remains unchanged.

Do not edit a machine-wide pub cache. App regression tests cover UTF-8 with and without explicit ECI, Latin-1 and mixed numeric/byte segments.
