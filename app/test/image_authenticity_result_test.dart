import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';

void main() {
  test('ImageAuthenticityResult parses API response', () {
    final result = ImageAuthenticityResult.fromJson({
      'category': 'likely_ai_generated',
      'confidence': 'medium',
      'reasons': ['Synthetic-looking details'],
      'explanation': 'The image shows some possible AI-generation signals.',
      'disclaimer': 'This is only an estimate.',
      'isPremium': true,
    });

    expect(result.category, 'likely_ai_generated');
    expect(result.confidence, 'medium');
    expect(result.reasons, ['Synthetic-looking details']);
    expect(result.explanation,
        'The image shows some possible AI-generation signals.');
    expect(result.disclaimer, 'This is only an estimate.');
    expect(result.isPremium, isTrue);
  });

  test('ImageAuthenticityResult uses safe defaults', () {
    final result = ImageAuthenticityResult.fromJson({});

    expect(result.category, 'inconclusive');
    expect(result.confidence, 'low');
    expect(result.reasons, isEmpty);
    expect(result.explanation, isEmpty);
    expect(result.disclaimer, isEmpty);
    expect(result.isPremium, isFalse);
  });
}
