import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
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
      required this.success,
      this.deleteAccount = 'Delete account',
      this.deleteMessage =
          'Permanently delete your AI Scam Shield account and associated history on every linked phone? Google Play subscriptions are not cancelled. Cancel your subscription separately to stop future charges. You will verify your Google identity before deletion is requested.',
      this.deleteAccepted =
          'Deletion requested. All linked sessions have been revoked. Server processing continues if you close the app.',
      this.manageSubscriptions = 'Manage Google Play subscription',
      this.deletionHelp = 'Account deletion help'});
  final String deleteAccount,
      deleteMessage,
      deleteAccepted,
      manageSubscriptions,
      deletionHelp;
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

  Future<void> _delete() async {
    final l = widget.labels;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(l.deleteAccount),
                content: Text(l.deleteMessage),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: Text(l.cancel)),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(l.deleteAccount)),
                ]));
    if (confirmed != true || !mounted || _busy) return;
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      await widget.service.requestDeletion(confirmed: true);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _status = null;
      });
      await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
                  title: Text(l.deleteAccount),
                  content: Text(l.deleteAccepted),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(l.confirm)),
                  ]));
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _notice = l.failed;
        });
      }
    }
  }

  Future<void> _external(String url) async {
    try {
      if (!await launchUrl(Uri.parse(url),
          mode: LaunchMode.externalApplication)) {
        throw StateError('unavailable');
      }
    } catch (_) {
      if (mounted) setState(() => _notice = widget.labels.failed);
    }
  }

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
          if (_status?.linked == true) ...[
            const Divider(),
            TextButton(
                onPressed: _busy
                    ? null
                    : () => _external(
                        'https://play.google.com/store/account/subscriptions?package=com.jamdesigns.scamshield'),
                child: Text(l.manageSubscriptions)),
            OutlinedButton.icon(
                key: const ValueKey('delete-account'),
                onPressed: !_busy && _status?.deletionAvailable == true
                    ? _delete
                    : null,
                icon: const Icon(Icons.delete_forever_outlined),
                label: Text(l.deleteAccount)),
          ],
          TextButton(
              onPressed: _busy
                  ? null
                  : () => _external(
                      'https://jamdesigns.github.io/AI-Scam-Shield/delete-account.html'),
              child: Text(l.deletionHelp)),
          if (_notice != null)
            Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(_notice!, semanticsLabel: _notice)),
        ])));
  }
}
