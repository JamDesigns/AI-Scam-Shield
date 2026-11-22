import 'package:flutter/material.dart';

import '../../core/app_platform.dart';
import '../../i18n/app_localizations.dart';

class WeeklyResetHint extends StatefulWidget {
  const WeeklyResetHint(
      {super.key, required this.resetAt, required this.timeZone});
  final String resetAt;
  final String timeZone;

  @override
  State<WeeklyResetHint> createState() => _WeeklyResetHintState();
}

class _WeeklyResetHintState extends State<WeeklyResetHint> {
  String? _key;
  Future<String?>? _display;

  void _prepare() {
    final language = AppLocalizations.of(context).locale.toLanguageTag();
    final key = '${widget.resetAt}\n${widget.timeZone}\n$language';
    if (key != _key) {
      _key = key;
      _display = AppPlatform.formatResetAt(
        widget.resetAt,
        widget.timeZone,
        language,
      );
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _prepare();
  }

  @override
  void didUpdateWidget(covariant WeeklyResetHint oldWidget) {
    super.didUpdateWidget(oldWidget);
    _prepare();
  }

  @override
  Widget build(BuildContext context) {
    final instant = DateTime.tryParse(widget.resetAt)?.toUtc();
    if (instant == null) return const SizedBox.shrink();
    return FutureBuilder<String?>(
      future: _display,
      builder: (context, snapshot) {
        // If a platform has not implemented zone formatting yet, label UTC
        // honestly instead of formatting the device zone as the registered zone.
        final date = snapshot.data ?? instant.toIso8601String();
        final zone = snapshot.data == null ? 'UTC' : widget.timeZone;
        return Padding(
          padding: const EdgeInsetsDirectional.only(top: 6),
          child: Text(AppLocalizations.of(context)
              .t('scan.quota.resetAt', params: {'date': date, 'zone': zone})),
        );
      },
    );
  }
}
