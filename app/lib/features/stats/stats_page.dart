import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/device_id.dart';
import '../../i18n/app_localizations.dart';
import '../scan/scan_models.dart';
import '../scan/scan_service.dart';

class StatsPage extends StatefulWidget {
  const StatsPage({super.key});

  static final GlobalKey<StatsPageState> globalKey =
      GlobalKey<StatsPageState>();

  @override
  State<StatsPage> createState() => StatsPageState();
}

class StatsPageState extends State<StatsPage> {
  ScanStats? _stats;
  List<ScanActivityItem> _activity = [];

  bool _loading = true;
  bool _animateChart = false;

  late ScanService _service;
  final _activityScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _activityScrollController.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    final deviceId = await DeviceId.getOrCreate();

    final api = ApiClient(
      deviceId: deviceId,
      localeLanguageCode:
          WidgetsBinding.instance.platformDispatcher.locale.languageCode,
    );

    _service = ScanService(api);

    await refresh();
  }

  Future<void> refresh() async {
    if (mounted) {
      setState(() {
        _animateChart = false;
      });
    }

    try {
      final stats = await _service.fetchStats();
      final activity = await _service.fetchActivity(limit: 20);

      if (!mounted) return;

      setState(() {
        _stats = stats;
        _activity = activity.items;
        _loading = false;
        _animateChart = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;

        setState(() {
          _animateChart = true;
        });
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_stats == null) {
      return Scaffold(
        appBar: AppBar(title: Text(t.t('stats.title'))),
        body: Center(child: Text(t.t('errors.network'))),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(t.t('stats.title'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildKpis(context, t),
          const SizedBox(height: 20),
          _buildChart(context, t),
          const SizedBox(height: 20),
          _buildActivity(context, t),
        ],
      ),
    );
  }

  Widget _buildKpis(BuildContext context, AppLocalizations t) {
    final stats = _stats!;

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.8,
      children: [
        _kpiCard(t.t('stats.scansToday'), stats.scansToday),
        _kpiCard(t.t('stats.scansWeek'), stats.scansWeek),
        _kpiCard(t.t('stats.scansMonth'), stats.scansMonth),
        _kpiCard(t.t('stats.threats'), stats.threatsDetected),
      ],
    );
  }

  Widget _kpiCard(String label, int value) {
    return Container(
      constraints: const BoxConstraints(minHeight: 78),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 14),
          ),
          const Spacer(),
          Text(
            value.toString(),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChart(BuildContext context, AppLocalizations t) {
    final stats = _stats!;

    final chartItems = [
      _ChartBarItem(
        label: t.t('stats.chart.day'),
        shortLabel: t.t('stats.chart.dayShort'),
        value: stats.scansToday,
      ),
      _ChartBarItem(
        label: t.t('stats.chart.week'),
        shortLabel: t.t('stats.chart.weekShort'),
        value: stats.scansWeek,
      ),
      _ChartBarItem(
        label: t.t('stats.chart.month'),
        shortLabel: t.t('stats.chart.monthShort'),
        value: stats.scansMonth,
      ),
      _ChartBarItem(
        label: t.t('stats.chart.threats'),
        shortLabel: t.t('stats.chart.threatsShort'),
        value: stats.threatsDetected,
      ),
    ];

    final maxValue =
        chartItems.map((item) => item.value).reduce((a, b) => a > b ? a : b);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.t('stats.activity'),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: chartItems
                .map(
                  (item) => Expanded(
                    child: _buildChartBar(
                      context: context,
                      item: item,
                      maxValue: maxValue,
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildChartBar({
    required BuildContext context,
    required _ChartBarItem item,
    required int maxValue,
  }) {
    const double maxBarHeight = 128;
    const double minBarHeight = 12;

    final theme = Theme.of(context);
    final factor = maxValue == 0 ? 0.0 : item.value / maxValue;

    final targetBarHeight = item.value == 0
        ? 0.0
        : (maxBarHeight * factor).clamp(minBarHeight, maxBarHeight);

    final barHeight = _animateChart ? targetBarHeight : 0.0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            item.value.toString(),
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: maxBarHeight,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: item.value == 0
                  ? const SizedBox.shrink()
                  : AnimatedContainer(
                      duration: const Duration(milliseconds: 500),
                      curve: Curves.easeOutCubic,
                      height: barHeight,
                      width: 20,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        color: theme.colorScheme.primary,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.shortLabel,
            style: theme.textTheme.labelMedium,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildActivity(BuildContext context, AppLocalizations t) {
    if (_activity.isEmpty) {
      return Text(t.t('stats.empty'));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.t('stats.history'),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 220,
          child: Scrollbar(
            controller: _activityScrollController,
            thumbVisibility: true,
            child: ListView.builder(
              controller: _activityScrollController,
              itemCount: _activity.length,
              itemBuilder: (context, index) {
                final item = _activity[index];

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _activityItem(context, item),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _activityItem(BuildContext context, ScanActivityItem item) {
    final theme = Theme.of(context);

    Color color;
    IconData icon;

    switch (item.finalCategory) {
      case 'high_risk':
        color = theme.colorScheme.error;
        icon = Icons.warning_rounded;
        break;
      case 'medium_risk':
        color = Colors.orange;
        icon = Icons.error_outline;
        break;
      default:
        color = Colors.green;
        icon = Icons.check_circle_outline;
    }

    final date = item.createdAtDate;
    final timeText = date != null
        ? '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}'
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.inputPreview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  item.finalCategory,
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${item.finalRiskScore}%',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (timeText.isNotEmpty)
                Text(
                  timeText,
                  style: theme.textTheme.labelSmall,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChartBarItem {
  const _ChartBarItem({
    required this.label,
    required this.shortLabel,
    required this.value,
  });

  final String label;
  final String shortLabel;
  final int value;
}
