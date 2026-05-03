import 'scan_models.dart';

class ScanActionAdviceContent {
  const ScanActionAdviceContent({
    required this.actions,
    required this.safetyAdvice,
  });

  final List<String> actions;
  final String safetyAdvice;
}

ScanActionAdviceContent buildScanActionAdviceContent({
  required ScanResult result,
  required String Function(String key) translate,
  required String Function(String reason) formatReason,
}) {
  final actions = _buildActionTexts(result, translate);
  final translatedReasons =
      result.reasons.map((reason) => '- ${formatReason(reason)}').toList();

  final safetyAdvice = [
    translate('result.copyAdvice.header'),
    '',
    '${translate('result.riskScore')}: ${result.riskScore}/100',
    '${translate('result.category')}: ${translate('categories.${result.category}')}',
    '${translate('result.threatType')}: ${translate('threatTypes.${result.threatType}')}',
    '',
    translate('result.reasons'),
    if (translatedReasons.isEmpty)
      '- ${translate('result.copyAdvice.noReasons')}'
    else
      ...translatedReasons,
    '',
    translate('result.actions'),
    ...actions.map((action) => '- $action'),
  ].join('\n');

  return ScanActionAdviceContent(
    actions: actions,
    safetyAdvice: safetyAdvice,
  );
}

List<String> _buildActionTexts(
  ScanResult result,
  String Function(String key) translate,
) {
  if (result.category == 'low_risk') {
    return [
      translate('result.action.low.noImmediateAction'),
      translate('result.action.low.stayCautious'),
      translate('result.action.low.verifyIfUnusual'),
    ];
  }

  return [
    translate('result.action.block'),
    translate('result.action.verify'),
    translate('result.action.report'),
  ];
}
