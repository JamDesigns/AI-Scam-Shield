import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/device_id.dart';
import '../../core/revenuecat_service.dart';
import '../../i18n/app_localizations.dart';
import '../premium/premium_service.dart';
import '../premium/subscription_page.dart';
import 'scan_models.dart';
import 'scan_service.dart';

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final _controller = TextEditingController();

  String? _deviceId;
  bool _loading = false;
  bool _isPremium = false;
  bool _hasInput = false;
  ScanResult? _lastResult;

  // Blocking error (red)
  String? _errorKey;
  String? _errorMessage;

  // Non-blocking notice (yellow)
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

  @override
  void initState() {
    super.initState();
    _bootstrap();

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

    if (!mounted) return;
    setState(() {
      _deviceId = deviceId;
    });

    await _refreshPremium();
    await _refreshAiQuota();
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
    final input = _controller.text.trim();
    if (input.isEmpty) return;

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
            onPressed: () async {
              await _refreshPremium();
              await _refreshAiQuota();
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
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              minLines: 4,
              maxLines: 10,
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
                    onPressed:
                        (_loading || _isWeeklyScanLimitReached) ? null : _scan,
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

            // Non-blocking notice (AI limit / weekly limit)
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

            // Blocking error
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
            _bullet(t.t('result.action.block')),
            _bullet(t.t('result.action.verify')),
            _bullet(t.t('result.action.report')),
          ],
        ),
      ),
    );
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
