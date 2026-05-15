import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';

void main() {
  test('ScanStats fromJson parses correctly', () {
    final json = {
      'scansToday': 3,
      'scansWeek': 10,
      'scansMonth': 25,
      'threatsDetected': 7,
    };

    final stats = ScanStats.fromJson(json);

    expect(stats.scansToday, 3);
    expect(stats.scansWeek, 10);
    expect(stats.scansMonth, 25);
    expect(stats.threatsDetected, 7);
  });

  test('ScanActivityResponse parses list correctly', () {
    final json = {
      'items': [
        {
          'inputPreview': 'Test message',
          'finalCategory': 'low_risk',
          'finalRiskScore': 10,
          'createdAt': '2026-01-01T10:00:00Z',
        }
      ]
    };

    final response = ScanActivityResponse.fromJson(json);

    expect(response.items.length, 1);
    expect(response.items.first.inputPreview, 'Test message');
    expect(response.items.first.finalCategory, 'low_risk');
    expect(response.items.first.finalRiskScore, 10);
    expect(response.items.first.createdAtDate, isNotNull);
  });
}
