import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../../core/premium_account_service.dart';

/// Labels are supplied from the app's localization catalogue, never provider-generated.
class AccountDeviceLabels {
  const AccountDeviceLabels(
      {required this.title,
      required this.signInGoogle,
      required this.restore,
      required this.activate,
      required this.confirmTitle,
      required this.confirmMessage,
      required this.cancel,
      required this.confirm,
      required this.active,
      required this.inactive,
      required this.notLinked,
      required this.failed,
      required this.success});
  final String title,
      signInGoogle,
      restore,
      activate,
      confirmTitle,
      confirmMessage,
      cancel,
      confirm,
      active,
      inactive,
      notLinked,
      failed,
      success;
}

class AccountDevicePage extends StatefulWidget {
  const AccountDevicePage(
      {super.key, required this.service, required this.labels, this.onChanged});
  final PremiumAccountService service;
  final AccountDeviceLabels labels;
  final VoidCallback? onChanged;
  @override
  State<AccountDevicePage> createState() => _AccountDevicePageState();
}

class _AccountDevicePageState extends State<AccountDevicePage> {
  PremiumAccountStatus? _status;
  bool _busy = false;
  String? _notice;
  @override
  void initState() {
    super.initState();
    _run(widget.service.status, notify: false);
  }

  Future<void> _run(Future<PremiumAccountStatus> Function() operation,
      {bool notify = true}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final status = await operation();
      if (!mounted) return;
      setState(() {
        _status = status;
        _notice = notify ? widget.labels.success : null;
      });
      if (notify) widget.onChanged?.call();
    } catch (error) {
      if (mounted) {
        setState(() {
          _notice = widget.labels.failed;
          if (kDebugMode && error is AccountStepException) {
            _notice = '${widget.labels.failed} [${error.stage}: ${error.code}]';
          }
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _activate() async {
    final l = widget.labels;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(l.confirmTitle),
                content: Text(l.confirmMessage),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: Text(l.cancel)),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(l.confirm)),
                ]));
    if (confirmed == true && mounted) {
      await _run(() => widget.service.activate(confirmed: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.labels;
    return Scaffold(
        appBar: AppBar(title: Text(l.title)),
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(20), children: [
          Text(_status?.linked != true
              ? l.notLinked
              : _status!.activeOnThisDevice
                  ? l.active
                  : l.inactive),
          const SizedBox(height: 20),
          if (_status?.linked != true)
            FilledButton.icon(
                onPressed:
                    _busy ? null : () => _run(widget.service.signInGoogle),
                icon: const Icon(Icons.account_circle_outlined),
                label: Text(l.signInGoogle)),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: _busy ? null : () => _run(widget.service.restore),
              child: Text(l.restore)),
          const SizedBox(height: 12),
          if (_status?.activeOnThisDevice != true)
            FilledButton(
                key: const ValueKey('activate-account-phone'),
                onPressed: _busy || _status?.linked != true ? null : _activate,
                child: Text(l.activate)),
          if (_busy)
            const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator())),
          if (_notice != null)
            Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(_notice!, semanticsLabel: _notice)),
        ])));
  }
}
