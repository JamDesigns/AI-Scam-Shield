import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';

void main() {
  test('ScanResult fromJson parses threat type correctly', () {
    final json = {
      'riskScore': 85,
      'category': 'high_risk',
      'threatType': 'bank_phishing',
      'reasons': ['Suspicious bank login request'],
      'isPremium': false,
      'weeklyUsed': 1,
      'aiAllowed': true,
      'aiUsed': true,
      'aiWeeklyUsed': 1,
      'aiUnlimited': false,
    };

    final result = ScanResult.fromJson(json);

    expect(result.riskScore, 85);
    expect(result.category, 'high_risk');
    expect(result.threatType, 'bank_phishing');
    expect(result.reasons, ['Suspicious bank login request']);
  });

  test('ScanResult fromJson falls back to none threat type', () {
    final json = {
      'riskScore': 10,
      'category': 'low_risk',
      'reasons': <String>[],
    };

    final result = ScanResult.fromJson(json);

    expect(result.threatType, 'none');
  });

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
          'finalCategory': 'medium_risk',
          'threatType': 'delivery_scam',
          'finalRiskScore': 45,
          'createdAt': '2026-01-01T10:00:00Z',
        }
      ]
    };

    final response = ScanActivityResponse.fromJson(json);

    expect(response.items.length, 1);
    expect(response.items.first.inputPreview, 'Test message');
    expect(response.items.first.finalCategory, 'medium_risk');
    expect(response.items.first.threatType, 'delivery_scam');
    expect(response.items.first.finalRiskScore, 45);
    expect(response.items.first.createdAtDate, isNotNull);
  });

  test('ScanActivityItem fromJson falls back to none threat type', () {
    final item = ScanActivityItem.fromJson({
      'inputPreview': 'Test message',
      'finalCategory': 'low_risk',
      'finalRiskScore': 10,
      'createdAt': '2026-01-01T10:00:00Z',
    });

    expect(item.threatType, 'none');
  });
}
