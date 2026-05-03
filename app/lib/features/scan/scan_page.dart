import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/device_id.dart';
import '../../core/revenuecat_service.dart';
import '../../i18n/app_localizations.dart';
import '../premium/premium_service.dart';
import '../premium/subscription_page.dart';
import '../navigation/home_page.dart';
import 'scan_models.dart';
import 'scan_service.dart';
import 'scan_action_advice.dart';

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  static const int _maxInputLength = 1500;
  static const MethodChannel _shareIntentChannel = MethodChannel(
    'com.jamdesigns.scamshield/share_intent',
  );
  static const String _lastScannedInputKey = 'last_scanned_input';
  static const String _lastScanResultKey = 'last_scan_result';
  static const String _lastScannedFingerprintKey = 'last_scanned_fingerprint';

  final _controller = TextEditingController();

  late final Future<void> _bootstrapFuture;

  String? _deviceId;
  bool _loading = false;
  bool _isPremium = false;
  bool _hasInput = false;
  ScanResult? _lastResult;
  ScanResult? _restoredLastResult;
  String? _lastScannedInput;
  String? _lastScannedFingerprint;

  String? _errorKey;
  String? _errorMessage;
  String? _noticeKey;

  AiQuotaStatus? _aiQuota;

  late ApiClient _api;
  late ScanService _scanService;
  late PremiumService _premiumService;

  bool get _isWeeklyScanLimitReached {
    if (_isPremium) return false;

    final normalRemaining =
        _lastResult?.weeklyRemaining ?? _aiQuota?.weeklyRemaining;
    final aiRemaining =
        _lastResult?.aiWeeklyRemaining ?? _aiQuota?.aiWeeklyRemaining;

    final noNormalScansLeft = normalRemaining != null && normalRemaining <= 0;
    final noAiScansLeft = aiRemaining != null && aiRemaining <= 0;

    return noNormalScansLeft && noAiScansLeft;
  }

  String _normalizeInput(String value) {
    return value.trim();
  }

  String _buildInputFingerprint(String value) {
    final normalized = _normalizeInput(value);

    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return normalized.replaceAll(RegExp(r'\s+'), ' ');
    }

    final normalizedPath = uri.path != '/' && uri.path.endsWith('/')
        ? uri.path.substring(0, uri.path.length - 1)
        : uri.path;

    final normalizedUri = uri.replace(
      scheme: uri.scheme.toLowerCase(),
      host: uri.host.toLowerCase(),
      path: normalizedPath,
      fragment: null,
    );

    return normalizedUri.toString();
  }

  bool get _isCurrentInputAlreadyScanned {
    final input = _normalizeInput(_controller.text);
    return input.isNotEmpty && input == _lastScannedInput;
  }

  @override
  void initState() {
    super.initState();
    _bootstrapFuture = _bootstrap();
    _setupShareIntent();

    _controller.addListener(() {
      final hasInput = _controller.text.trim().isNotEmpty;
      if (hasInput == _hasInput) return;
      if (!mounted) return;

      setState(() {
        _hasInput = hasInput;
      });
    });
  }

  Future<void> _bootstrap() async {
    final deviceId = await DeviceId.getOrCreate();

    await RevenueCatService.initialize(appUserId: deviceId);

    _api = ApiClient(
      deviceId: deviceId,
      localeLanguageCode:
          WidgetsBinding.instance.platformDispatcher.locale.languageCode,
    );
    _scanService = ScanService(_api);
    _premiumService = PremiumService(_api);

    await _restoreLastSuccessfulScan();

    if (!mounted) return;
    setState(() {
      _deviceId = deviceId;
    });

    await _refreshPremium();
    await _refreshAiQuota();
  }

  Future<void> _restoreLastSuccessfulScan() async {
    final prefs = await SharedPreferences.getInstance();

    final storedInput = prefs.getString(_lastScannedInputKey);
    final storedFingerprint = prefs.getString(_lastScannedFingerprintKey);
    final storedResultRaw = prefs.getString(_lastScanResultKey);

    ScanResult? storedResult;

    if (storedResultRaw != null && storedResultRaw.isNotEmpty) {
      try {
        final decoded = json.decode(storedResultRaw) as Map<String, dynamic>;
        storedResult = ScanResult.fromJson(decoded);
      } catch (_) {
        storedResult = null;
      }
    }

    if (!mounted) return;

    setState(() {
      _lastScannedInput = storedInput;
      _lastScannedFingerprint = storedFingerprint;
      _restoredLastResult = storedResult;
      _lastResult = null;
    });
  }

  Future<void> _persistLastSuccessfulScan(
    String input,
    ScanResult result,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final fingerprint = _buildInputFingerprint(input);

    await prefs.setString(_lastScannedInputKey, input);
    await prefs.setString(_lastScannedFingerprintKey, fingerprint);
    await prefs.setString(
      _lastScanResultKey,
      json.encode(_scanResultToJson(result)),
    );
  }

  Map<String, dynamic> _scanResultToJson(ScanResult result) {
    return {
      'riskScore': result.riskScore,
      'category': result.category,
      'threatType': result.threatType,
      'reasons': result.reasons,
      'isPremium': result.isPremium,
      'weeklyLimit': result.weeklyLimit,
      'weeklyUsed': result.weeklyUsed,
      'weeklyRemaining': result.weeklyRemaining,
      'aiAllowed': result.aiAllowed,
      'aiUsed': result.aiUsed,
      'aiWeeklyLimit': result.aiWeeklyLimit,
      'aiWeeklyUsed': result.aiWeeklyUsed,
      'aiWeeklyRemaining': result.aiWeeklyRemaining,
      'aiUnlimited': result.aiUnlimited,
      'aiResetAt': result.aiResetAt,
    };
  }

  Future<void> _setupShareIntent() async {
    _shareIntentChannel.setMethodCallHandler((call) async {
      if (call.method != 'onSharedText') {
        return;
      }

      final sharedText = call.arguments as String?;
      await _applySharedTextAndScan(sharedText);
    });

    final initialSharedText = await _shareIntentChannel.invokeMethod<String>(
      'getInitialSharedText',
    );

    await _applySharedTextAndScan(initialSharedText);

    await _shareIntentChannel.invokeMethod<void>('clearInitialSharedText');
  }

  Future<void> _applySharedTextAndScan(String? sharedText) async {
    final input = sharedText == null ? null : _normalizeInput(sharedText);
    if (input == null || input.isEmpty) {
      return;
    }

    HomePage.globalKey.currentState?.openScanTab();

    final normalizedInput = input.length > _maxInputLength
        ? input.substring(0, _maxInputLength)
        : input;

    _controller.value = TextEditingValue(
      text: normalizedInput,
      selection: TextSelection.collapsed(offset: normalizedInput.length),
    );

    if (!mounted) return;

    await _bootstrapFuture;
    if (!mounted) return;

    final fingerprint = _buildInputFingerprint(normalizedInput);
    final reusableResult = _lastResult ?? _restoredLastResult;
    final isSameInput =
        _lastScannedFingerprint == fingerprint && reusableResult != null;

    setState(() {
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
      _lastResult = isSameInput ? reusableResult : null;
    });

    if (isSameInput) {
      return;
    }

    if (_loading) return;
    if (_isWeeklyScanLimitReached) return;

    await _scan();
  }

  void _clear() {
    _controller.clear();
    setState(() {
      _hasInput = false;
      _lastResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });
  }

  Future<void> _refreshScreenState() async {
    _controller.clear();

    if (!mounted) return;

    setState(() {
      _hasInput = false;
      _lastResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    await _refreshPremium();
    await _refreshAiQuota();
  }

  Future<void> _refreshPremium() async {
    try {
      final isPremium = await _premiumService.isPremium();
      if (!mounted) return;
      setState(() {
        _isPremium = isPremium;
      });
    } catch (_) {
      // Keep silent for MVP.
    }
  }

  Future<void> _refreshAiQuota() async {
    try {
      final quota = await _scanService.fetchAiQuotaWeek();
      if (!mounted) return;
      setState(() {
        _aiQuota = quota;
      });
    } catch (_) {
      // Keep silent for MVP.
    }
  }

  Future<void> _scan() async {
    final input = _normalizeInput(_controller.text);
    if (input.isEmpty) return;
    if (_loading) return;
    if (_lastScannedFingerprint == _buildInputFingerprint(input) &&
        _lastResult != null) {
      return;
    }

    setState(() {
      _loading = true;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    try {
      await AnalyticsService.scanSubmitted(inputLength: input.length);

      final result = await _scanService.scan(input);
      if (!mounted) return;

      setState(() {
        _lastResult = result;
        _lastScannedInput = input;
        _lastScannedFingerprint = _buildInputFingerprint(input);
        _restoredLastResult = result;

        if (!_isPremium) {
          final normalRemaining = result.weeklyRemaining ?? 0;
          final aiRemaining = result.aiWeeklyRemaining ?? 0;

          if (normalRemaining <= 0 && aiRemaining <= 0) {
            _noticeKey = 'errors.weeklyAndAiLimitExceeded';
          } else if (!result.aiAllowed && aiRemaining <= 0) {
            _noticeKey = 'errors.aiLimitExceeded';
          }
        }
      });

      await _persistLastSuccessfulScan(input, result);
      await _refreshAiQuota();

      await AnalyticsService.scanResult(
        riskScore: result.riskScore,
        category: result.category,
        reasonsCount: result.reasons.length,
        isPremium: _isPremium,
      );
    } catch (e) {
      if (!mounted) return;

      if (e is ApiException &&
          e.statusCode == 402 &&
          e.errorCode == 'quota_exceeded') {
        await _refreshAiQuota();
        if (!mounted) return;

        setState(() {
          _lastResult = null;
          _errorKey = 'errors.weeklyLimitExceeded';
          _errorMessage = null;
          _noticeKey = 'errors.weeklyAndAiLimitExceeded';
        });
        return;
      }

      if (e is ApiException &&
          e.statusCode == 429 &&
          e.errorCode == 'rate_limited') {
        setState(() {
          _errorKey = 'errors.rateLimited';
          _errorMessage = null;
        });
        return;
      }

      if (e is ApiException &&
          e.statusCode == 503 &&
          e.errorCode == 'ai_unavailable') {
        setState(() {
          _lastResult = null;
          _errorKey = 'errors.network';
          _errorMessage = null;
        });
        return;
      }

      setState(() {
        _errorKey = kDebugMode ? null : 'errors.network';
        _errorMessage = kDebugMode ? e.toString() : null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _onPremiumPressed() async {
    if (_isPremium) {
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SubscriptionPage()),
      );
      return;
    }

    await _openPaywall();
  }

  Future<void> _openPaywall() async {
    final t = AppLocalizations.of(context);

    try {
      await AnalyticsService.paywallOpened();

      final changed = await _premiumService.presentPaywallIfNeeded();
      if (!mounted) return;

      if (changed) {
        await _refreshPremium();
        if (!mounted) return;

        await AnalyticsService.premiumActivated(source: 'paywall');
        if (!mounted) return;

        final messenger = ScaffoldMessenger.of(context);
        messenger.showSnackBar(
          SnackBar(content: Text(t.t('premium.activated'))),
        );
      }
    } catch (e, st) {
      debugPrint('Paywall error: $e');
      debugPrintStack(stackTrace: st);

      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(
        SnackBar(content: Text(t.t('errors.paywall'))),
      );
    }
  }

  @override
  void dispose() {
    _shareIntentChannel.setMethodCallHandler(null);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('app.title')),
        actions: [
          IconButton(
            onPressed: _loading
                ? null
                : () async {
                    await _refreshScreenState();
                  },
            icon: const Icon(Icons.refresh),
            tooltip: t.t('actions.refresh'),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 12),
            child: Row(
              children: [
                const Spacer(),
                FilledButton(
                  onPressed: _loading ? null : _onPremiumPressed,
                  child: Text(
                    _isPremium ? t.t('subscription.title') : t.t('premium.cta'),
                  ),
                ),
                const SizedBox(width: 12),
                if (_isPremium)
                  Container(
                    padding: const EdgeInsetsDirectional.fromSTEB(10, 4, 10, 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: Theme.of(context).colorScheme.primaryContainer,
                    ),
                    child: Text(
                      t.t('premium.badge'),
                      style: Theme.of(context).textTheme.labelMedium,
                      textAlign: TextAlign.start,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 24),
          children: [
            Text(
              t.t('scan.title'),
              style: Theme.of(context).textTheme.headlineMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 6),
            Text(
              t.t('scan.subtitle'),
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 4),
            Text(
              t.t(
                'scan.maxLength',
                params: {
                  'max': _maxInputLength.toString(),
                },
              ),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              minLines: 3,
              maxLines: 3,
              maxLength: _maxInputLength,
              decoration: InputDecoration(
                labelText: t.t('scan.input.label'),
                hintText: t.t('scan.example'),
                border: const OutlineInputBorder(),
              ),
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: (_loading ||
                            _isWeeklyScanLimitReached ||
                            _isCurrentInputAlreadyScanned)
                        ? null
                        : _scan,
                    child: _loading
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(t.t('scan.button')),
                  ),
                ),
                const SizedBox(width: 12),
                if (_hasInput)
                  OutlinedButton.icon(
                    onPressed: _loading ? null : _clear,
                    icon: const Icon(Icons.delete_outline),
                    label: Text(t.t('actions.clear')),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _AiQuotaHint(
              isPremium: _isPremium,
              lastResult: _lastResult,
              quota: _aiQuota,
            ),
            const SizedBox(height: 4),
            _WeeklyQuotaHint(
              isPremium: _isPremium,
              lastResult: _lastResult,
              quota: _aiQuota,
            ),
            const SizedBox(height: 6),
            if (_noticeKey != null)
              Container(
                padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.amber.withValues(alpha: 0.12),
                  border: Border.all(
                    color: Colors.amber.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  t.t(_noticeKey!),
                  style: TextStyle(color: Colors.amber.shade800),
                  textAlign: TextAlign.start,
                ),
              ),
            if (_noticeKey != null) const SizedBox(height: 10),
            if (_errorKey != null)
              Text(
                t.t(_errorKey!),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (_errorMessage != null)
              Text(
                _errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (kDebugMode && _deviceId != null)
              Padding(
                padding: const EdgeInsetsDirectional.only(top: 6),
                child: Text(
                  'deviceId: $_deviceId',
                  style: Theme.of(context).textTheme.labelSmall,
                  textAlign: TextAlign.start,
                ),
              ),
            const SizedBox(height: 6),
            if (_lastResult != null) _ResultCard(result: _lastResult!),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final ScanResult result;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      margin: const EdgeInsetsDirectional.only(top: 0),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('result.title'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 10),
            _riskScoreRow(
              context,
              t.t('result.riskScore'),
              '${result.riskScore}/100',
              result.category,
            ),
            const SizedBox(height: 4),
            _categoryRow(
              context,
              t.t('result.category'),
              t.t('categories.${result.category}'),
              result.category,
            ),
            const SizedBox(height: 4),
            _categoryRow(
              context,
              t.t('result.threatType'),
              t.t('threatTypes.${result.threatType}'),
              result.category,
            ),
            const SizedBox(height: 10),
            Text(
              t.t('result.reasons'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 4),
            ...result.reasons.map(
              (r) => Padding(
                padding: const EdgeInsetsDirectional.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('• '),
                    Expanded(
                      child: Text(
                        _formatReason(t, r),
                        textAlign: TextAlign.start,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              t.t('result.actions'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 4),
            ..._buildActionBullets(t),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(
                      ClipboardData(text: _buildSafetyAdvice(t)),
                    );

                    if (!context.mounted) return;

                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(t.t('result.copyAdvice.copied'))),
                    );
                  },
                  icon: const Icon(Icons.copy),
                  label: Text(t.t('result.copyAdvice.button')),
                ),
                OutlinedButton.icon(
                  onPressed: () async {
                    await SharePlus.instance.share(
                      ShareParams(text: _buildSafetyAdvice(t)),
                    );
                  },
                  icon: const Icon(Icons.ios_share),
                  label: Text(t.t('result.shareAdvice.button')),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    _showVerificationChecklist(context, t);
                  },
                  icon: const Icon(Icons.checklist),
                  label: Text(t.t('result.checklist.button')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showVerificationChecklist(
    BuildContext context,
    AppLocalizations t,
  ) {
    final checklistItems = result.category == 'low_risk'
        ? [
            t.t('result.checklist.low.sender'),
            t.t('result.checklist.low.links'),
            t.t('result.checklist.low.requests'),
          ]
        : [
            t.t('result.checklist.risky.doNotClick'),
            t.t('result.checklist.risky.officialWebsite'),
            t.t('result.checklist.risky.contactProvider'),
            t.t('result.checklist.risky.neverShareCodes'),
            t.t('result.checklist.risky.report'),
          ];

    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(t.t('result.checklist.title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: checklistItems
                .map(
                  (item) => Padding(
                    padding: const EdgeInsetsDirectional.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.check_circle_outline, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            item,
                            textAlign: TextAlign.start,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: Text(t.t('actions.close')),
            ),
          ],
        );
      },
    );
  }

  List<String> _buildActionTexts(AppLocalizations t) {
    return buildScanActionAdviceContent(
      result: result,
      translate: (key) => t.t(key),
      formatReason: (reason) => _formatReason(t, reason),
    ).actions;
  }

  List<Widget> _buildActionBullets(AppLocalizations t) {
    return _buildActionTexts(t).map(_bullet).toList();
  }

  String _buildSafetyAdvice(AppLocalizations t) {
    return buildScanActionAdviceContent(
      result: result,
      translate: (key) => t.t(key),
      formatReason: (reason) => _formatReason(t, reason),
    ).safetyAdvice;
  }

  String _formatReason(AppLocalizations t, String reason) {
    const heuristicReasons = {
      'URGENT_REQUEST',
      'MONEY_REQUEST',
      'CRYPTO_REQUEST',
      'GIFT_CARD_REQUEST',
      'PASSWORD_OTP_REQUEST',
      'REMOTE_ACCESS_REQUEST',
      'UNKNOWN_SENDER',
      'SUSPICIOUS_LINK',
      'SHORTENED_URL',
      'SHORTENER',
      'LOOKALIKE_DOMAIN',
      'URL_TYPO',
      'SUSPICIOUS_PATH',
      'THREAT_LANGUAGE',
      'IMPERSONATION',
      'TOO_GOOD_TO_BE_TRUE',
      'SENSITIVE_DATA',
      'URGENCY_LANGUAGE',
      'SUSPICIOUS_TLD',
      'IP_URL',
      'MANY_SUBDOMAINS',
    };

    if (heuristicReasons.contains(reason)) {
      return t.t('reasons.$reason');
    }

    return reason.replaceFirst(RegExp(r'^reasons\.', caseSensitive: false), '');
  }

  Widget _riskScoreRow(
    BuildContext context,
    String label,
    String value,
    String category,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    final Color color = switch (category) {
      'low_risk' => Colors.green.shade700,
      'medium_risk' => Colors.amber.shade800,
      'high_risk' => colorScheme.error,
      _ => Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black,
    };

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge,
            textAlign: TextAlign.start,
          ),
        ),
        Text(
          value,
          textAlign: TextAlign.end,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _categoryRow(
    BuildContext context,
    String label,
    String value,
    String category,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    final Color color = switch (category) {
      'low_risk' => Colors.green.shade700,
      'medium_risk' => Colors.amber.shade800,
      'high_risk' => colorScheme.error,
      _ => Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black,
    };

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge,
            textAlign: TextAlign.start,
          ),
        ),
        Text(
          value,
          textAlign: TextAlign.end,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('• '),
          Expanded(child: Text(text, textAlign: TextAlign.start)),
        ],
      ),
    );
  }
}

class _AiQuotaHint extends StatelessWidget {
  const _AiQuotaHint({
    required this.isPremium,
    required this.lastResult,
    required this.quota,
  });

  final bool isPremium;
  final ScanResult? lastResult;
  final AiQuotaStatus? quota;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (isPremium) {
      return Align(
        alignment: AlignmentDirectional.centerStart,
        child: Text(
          t.t('scan.aiQuota.unlimited'),
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.start,
        ),
      );
    }

    final remaining = lastResult?.aiWeeklyRemaining ?? quota?.aiWeeklyRemaining;
    final limit = lastResult?.aiWeeklyLimit ?? quota?.aiWeeklyLimit;

    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        t.t(
          'scan.aiQuota.free',
          params: {
            'remaining': remaining?.toString() ?? '?',
            'limit': limit?.toString() ?? '?',
          },
        ),
        style: Theme.of(context).textTheme.bodySmall,
        textAlign: TextAlign.start,
      ),
    );
  }
}

class _WeeklyQuotaHint extends StatelessWidget {
  const _WeeklyQuotaHint({
    required this.isPremium,
    required this.lastResult,
    required this.quota,
  });

  final bool isPremium;
  final ScanResult? lastResult;
  final AiQuotaStatus? quota;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (isPremium) {
      return const SizedBox.shrink();
    }

    final remaining = lastResult?.weeklyRemaining ?? quota?.weeklyRemaining;
    final limit = lastResult?.weeklyLimit ?? quota?.weeklyLimit;

    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        t.t(
          'scan.weeklyQuota.free',
          params: {
            'remaining': remaining?.toString() ?? '?',
            'limit': limit?.toString() ?? '?',
          },
        ),
        style: Theme.of(context).textTheme.bodySmall,
        textAlign: TextAlign.start,
      ),
    );
  }
}
