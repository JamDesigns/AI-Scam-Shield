import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/scan_action_advice.dart';
import 'package:scam_shield_mvp/features/scan/scan_models.dart';

void main() {
  test('buildScanActionAdviceContent uses preventive actions for low risk', () {
    final result = _scanResult(
      riskScore: 0,
      category: 'low_risk',
      threatType: 'none',
      reasons: const [],
    );

    final content = buildScanActionAdviceContent(
      result: result,
      translate: _translate,
      formatReason: _formatReason,
    );

    expect(content.actions, [
      'No immediate action is needed.',
      'Stay cautious if the sender later asks for sensitive data.',
      'Verify via official channels if anything feels unusual.',
    ]);

    expect(content.safetyAdvice, contains('Risk score: 0/100'));
    expect(content.safetyAdvice, contains('Category: Low risk'));
    expect(
      content.safetyAdvice,
      contains('Threat type: No specific threat detected'),
    );
    expect(
      content.safetyAdvice,
      contains('- No specific reasons detected.'),
    );
    expect(
      content.safetyAdvice,
      contains('- No immediate action is needed.'),
    );
    expect(
      content.safetyAdvice,
      isNot(contains('- Do not reply to the message.')),
    );
    expect(
      content.safetyAdvice,
      isNot(contains('- Block the sender and do not click any links.')),
    );
    expect(
      content.safetyAdvice,
      isNot(contains('- Delete the message after reporting it if needed.')),
    );
  });

  test('buildScanActionAdviceContent uses strong actions for high risk', () {
    final result = _scanResult(
      riskScore: 100,
      category: 'high_risk',
      threatType: 'bank_phishing',
      reasons: const [
        'SUSPICIOUS_TLD',
        'URL_TYPO',
      ],
    );

    final content = buildScanActionAdviceContent(
      result: result,
      translate: _translate,
      formatReason: _formatReason,
    );

    expect(content.actions, [
      'Do not reply to the message.',
      'Block the sender and do not click any links.',
      'Delete the message after reporting it if needed.',
      'Verify via official channels.',
    ]);

    expect(content.safetyAdvice, contains('Risk score: 100/100'));
    expect(content.safetyAdvice, contains('Category: High risk'));
    expect(content.safetyAdvice, contains('Threat type: Bank phishing'));
    expect(
      content.safetyAdvice,
      contains('- The link uses a suspicious domain extension.'),
    );
    expect(
      content.safetyAdvice,
      contains('- The URL contains a suspicious typo.'),
    );
    expect(
      content.safetyAdvice,
      contains('- Do not reply to the message.'),
    );
    expect(
      content.safetyAdvice,
      contains('- Block the sender and do not click any links.'),
    );
    expect(
      content.safetyAdvice,
      contains('- Delete the message after reporting it if needed.'),
    );
    expect(
      content.safetyAdvice,
      isNot(contains('- No immediate action is needed.')),
    );
  });
}

ScanResult _scanResult({
  required int riskScore,
  required String category,
  required String threatType,
  required List<String> reasons,
}) {
  return ScanResult(
    riskScore: riskScore,
    category: category,
    threatType: threatType,
    reasons: reasons,
    isPremium: false,
    weeklyLimit: 2,
    weeklyUsed: 0,
    weeklyRemaining: 2,
    aiAllowed: false,
    aiUsed: false,
    aiWeeklyLimit: 1,
    aiWeeklyUsed: 0,
    aiWeeklyRemaining: 1,
    aiUnlimited: false,
    aiResetAt: null,
  );
}

String _translate(String key) {
  const translations = {
    'result.copyAdvice.header': 'Scam Shield safety advice',
    'result.riskScore': 'Risk score',
    'result.category': 'Category',
    'result.threatType': 'Threat type',
    'result.reasons': 'Reasons',
    'result.actions': 'What to do',
    'result.copyAdvice.noReasons': 'No specific reasons detected.',
    'categories.low_risk': 'Low risk',
    'categories.high_risk': 'High risk',
    'threatTypes.none': 'No specific threat detected',
    'threatTypes.bank_phishing': 'Bank phishing',
    'result.action.low.noImmediateAction': 'No immediate action is needed.',
    'result.action.low.stayCautious':
        'Stay cautious if the sender later asks for sensitive data.',
    'result.action.low.verifyIfUnusual':
        'Verify via official channels if anything feels unusual.',
    'result.action.noReply': 'Do not reply to the message.',
    'result.action.block': 'Block the sender and do not click any links.',
    'result.action.delete': 'Delete the message after reporting it if needed.',
    'result.action.verify': 'Verify via official channels.',
    'result.action.report': 'Report it to your provider if it involves money.',
  };

  return translations[key] ?? key;
}

String _formatReason(String reason) {
  const reasons = {
    'SUSPICIOUS_TLD': 'The link uses a suspicious domain extension.',
    'URL_TYPO': 'The URL contains a suspicious typo.',
  };

  return reasons[reason] ?? reason;
}
