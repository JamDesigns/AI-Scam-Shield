import 'package:flutter/material.dart';
import '../../design/shield_design.dart';

import '../../core/api_client.dart';
import '../../core/api_errors.dart';
import '../../core/app_session.dart';
import '../../i18n/app_localizations.dart';
import '../scan/scan_models.dart';
import '../scan/scan_service.dart';

class StatsPage extends StatefulWidget {
  const StatsPage({super.key, this.service});
  final ScanService? service;

  static final GlobalKey<StatsPageState> globalKey =
      GlobalKey<StatsPageState>();
  @override
  State<StatsPage> createState() => StatsPageState();
}

class StatsPageState extends State<StatsPage> {
  ScanStats? _stats;
  List<ScanActivityItem> _activity = [];
  bool _loading = true;
  bool _refreshing = false;
  bool _loadingMore = false;
  bool _hasMore = false;
  bool _serviceReady = false;
  int _page = 1;
  int _epoch = 0;
  String _period = 'week';
  String? _errorKey;
  late ScanService _service;
  ApiClient? _api;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _epoch++;
    _api?.close();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      if (widget.service != null) {
        _service = widget.service!;
      } else {
        final session = await SessionRepository.instance.getOrCreate();
        if (!mounted) return;
        _api = ApiClient(
          deviceId: session.deviceId,
          accessToken: session.accessToken,
          timeZone: session.timeZone,
          localeLanguageCode:
              AppLocalizations.of(context).locale.toLanguageTag(),
        );
        _service = ScanService(_api!);
      }
      _serviceReady = true;
      await refresh();
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _errorKey = apiErrorKey(error, fallback: 'errors.sessionUnavailable');
        });
      }
    }
  }

  Future<void> refresh() async {
    if (!_serviceReady || !mounted) return;
    final epoch = ++_epoch;
    setState(() {
      _refreshing = true;
      _errorKey = null;
    });
    try {
      if (_api != null) {
        _api!.localeLanguageCode =
            AppLocalizations.of(context).locale.toLanguageTag();
      }
      final responses = await Future.wait<Object>([
        _service.fetchStats(period: _period),
        _service.fetchActivity(limit: 20),
      ]);
      if (!mounted || epoch != _epoch) return;
      final activity = responses[1] as ScanActivityResponse;
      setState(() {
        _stats = responses[0] as ScanStats;
        _activity = activity.items;
        _page = activity.page;
        _hasMore = activity.hasMore ?? activity.items.length >= activity.limit;
        _loading = false;
      });
    } catch (error) {
      if (mounted && epoch == _epoch) {
        setState(() {
          _loading = false;
          _errorKey = apiErrorKey(error,
              fallback:
                  _stats == null ? 'errors.network' : 'stats.refreshFailed');
        });
      }
    } finally {
      if (mounted && epoch == _epoch) {
        setState(() {
          _refreshing = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _refreshing || !_hasMore) return;
    final epoch = _epoch;
    setState(() {
      _loadingMore = true;
      _errorKey = null;
    });
    try {
      final response = await _service.fetchActivity(page: _page + 1, limit: 20);
      if (!mounted || epoch != _epoch) return;
      final seen =
          _activity.map((item) => item.id).where((id) => id.isNotEmpty).toSet();
      setState(() {
        _activity = [
          ..._activity,
          ...response.items
              .where((item) => item.id.isEmpty || seen.add(item.id))
        ];
        _page = response.page;
        _hasMore = response.hasMore ?? response.items.length >= response.limit;
      });
    } catch (error) {
      if (mounted && epoch == _epoch) {
        setState(() =>
            _errorKey = apiErrorKey(error, fallback: 'stats.activityFailed'));
      }
    } finally {
      if (mounted && epoch == _epoch) setState(() => _loadingMore = false);
    }
  }

  ScanPeriodStats? get _selectedStats => _stats?.periods[_period];

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('stats.title')),
        actions: [
          IconButton(
            onPressed: (_loading || _refreshing)
                ? null
                : () => _serviceReady ? refresh() : _init(),
            icon: const Icon(Icons.refresh),
            tooltip: t.t('actions.refresh'),
          )
        ],
      ),
      body: SafeArea(
        top: false,
        child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _stats == null
              ? Center(
                  child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(t.t(_errorKey ?? 'errors.network')),
                    TextButton(
                        onPressed: () => _serviceReady ? refresh() : _init(),
                        child: Text(t.t('actions.retry'))),
                  ]),
                ))
              : RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView(
                    key: const ValueKey('stats-content'),
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_refreshing) const LinearProgressIndicator(),
                      if (_errorKey != null)
                        Padding(
                          padding: const EdgeInsetsDirectional.only(bottom: 12),
                          child: Text(t.t(_errorKey!),
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.error)),
                        ),
                      Wrap(spacing: 8, children: [
                        for (final period in ['today', 'week', 'month', 'year'])
                          ChoiceChip(
                            key: ValueKey('period-$period'),
                            selected: _period == period,
                            label: Text(t.t('stats.period.$period')),
                            onSelected: (_) => setState(() => _period = period),
                          ),
                      ]),
                      const SizedBox(height: 12),
                      if (_stats!.timeZone != null)
                        Text(t.t('stats.timeZone',
                            params: {'zone': _stats!.timeZone!})),
                      const SizedBox(height: 12),
                      _summary(context, t),
                      const SizedBox(height: 20),
                      _riskDistribution(context, t),
                      const SizedBox(height: 24),
                      Text(t.t('stats.historyAllPeriods'),
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 12),
                      if (_activity.isEmpty) Text(t.t('stats.empty')),
                      for (final item in _activity)
                        _historyItem(context, t, item),
                      if (_loadingMore)
                        const Center(
                            child: Padding(
                                padding: EdgeInsets.all(12),
                                child: CircularProgressIndicator())),
                      if (_hasMore && !_loadingMore)
                        TextButton(
                          key: const ValueKey('activity-load-more'),
                          onPressed: _refreshing ? null : _loadMore,
                          child: Text(t.t('stats.loadMore')),
                        ),
                      if (!_hasMore && _activity.isNotEmpty)
                        Text(t.t('stats.endOfHistory')),
                    ],
                  ),
                ),
      ),
    );
  }

  Widget _summary(BuildContext context, AppLocalizations t) {
    final selected = _selectedStats;
    if (selected == null) return Text(t.t('categories.inconclusive'));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      LayoutBuilder(builder: (context, constraints) {
        final width = (constraints.maxWidth - 12) / 2;
        return Wrap(spacing: 12, runSpacing: 12, children: [
          _summaryCard(
              context, t.t('stats.totalScans'), selected.totalScans, width),
          _summaryCard(
              context, t.t('stats.flagged'), selected.threatsDetected, width),
        ]);
      }),
      const SizedBox(height: 10),
      Text(
          '${t.t('stats.flaggedRate')}: ${(selected.flaggedShare * 100).round()}%'),
      if (selected.totalScans == 0)
        Padding(
          padding: const EdgeInsetsDirectional.only(top: 8),
          child: Text(t.t('stats.period.empty')),
        ),
    ]);
  }

  Widget _summaryCard(
      BuildContext context, String label, int value, double width) {
    return SizedBox(
        width: width,
        child: Card(
          key: ValueKey('stat-$label'),
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label),
              const SizedBox(height: 8),
              Text(MaterialLocalizations.of(context).formatDecimal(value),
                  style: Theme.of(context).textTheme.headlineSmall),
            ]),
          ),
        ));
  }

  Widget _riskDistribution(BuildContext context, AppLocalizations t) {
    final selected = _selectedStats;
    if (selected == null) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(t.t('stats.riskDistribution'),
          style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 12),
      BrandPanel(
          child: RiskDonut(
        counts: [
          for (final category in [
            'low_risk',
            'medium_risk',
            'high_risk',
            'inconclusive'
          ])
            selected.riskBreakdown[category] ?? 0
        ],
        total: selected.totalScans,
        label: '${t.t('stats.totalScans')}: ${selected.totalScans}',
      )),
      const SizedBox(height: 20),
      for (final category in [
        'low_risk',
        'medium_risk',
        'high_risk',
        'inconclusive'
      ])
        Padding(
          padding: const EdgeInsetsDirectional.only(bottom: 12),
          child: Column(children: [
            Row(children: [
              Expanded(child: Text(t.t('categories.$category'))),
              Text((selected.riskBreakdown[category] ?? 0).toString()),
            ]),
            const SizedBox(height: 4),
            LinearProgressIndicator(
              value: selected.totalScans == 0
                  ? 0
                  : ((selected.riskBreakdown[category] ?? 0) /
                          selected.totalScans)
                      .clamp(0, 1)
                      .toDouble(),
              color: _riskColor(context, category),
            ),
          ]),
        ),
    ]);
  }

  Color _riskColor(BuildContext context, String category) => switch (category) {
        'high_risk' => Theme.of(context).colorScheme.error,
        'medium_risk' => ShieldDesign.amber,
        'low_risk' => ShieldDesign.mint,
        _ => ShieldDesign.sky,
      };

  Widget _historyItem(
      BuildContext context, AppLocalizations t, ScanActivityItem item) {
    final category =
        item.finalRiskScore == null ? 'inconclusive' : item.finalCategory;
    final date = item.createdAtDate;
    final material = MaterialLocalizations.of(context);
    final dateText = date == null
        ? ''
        : '${material.formatShortDate(date)} ${material.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
    return Card(
        child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
            item.localizedMediaLabelKey == null
                ? item.inputPreview
                : t.t(item.localizedMediaLabelKey!),
            maxLines: item.localizedMediaLabelKey == null ? 2 : null,
            overflow: item.localizedMediaLabelKey == null
                ? TextOverflow.ellipsis
                : TextOverflow.visible),
        const SizedBox(height: 6),
        Text(
            '${t.t('categories.$category')} · ${t.t('threatTypes.${item.threatType}')}',
            style: TextStyle(color: _riskColor(context, category))),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(child: Text(dateText)),
          Text(
              item.finalRiskScore == null ? '—' : '${item.finalRiskScore}/100'),
        ]),
      ]),
    ));
  }
}
