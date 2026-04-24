import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show Clipboard, ClipboardData, rootBundle;
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../i18n/app_localizations.dart';

class PrivacyPolicyPage extends StatefulWidget {
  const PrivacyPolicyPage({super.key});

  @override
  State<PrivacyPolicyPage> createState() => _PrivacyPolicyPageState();
}

class _PrivacyPolicyPageState extends State<PrivacyPolicyPage> {
  String? _content;
  bool _loading = true;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  Future<void> _loadContent() async {
    try {
      final content = await rootBundle.loadString(
        'assets/legal/privacy-policy.md',
      );

      if (!mounted) return;

      setState(() {
        _content = content;
        _loading = false;
        _hasError = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _hasError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('about.privacyTitle')),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _hasError
                ? Center(child: Text(t.t('errors.network')))
                : Markdown(
                    data: _content ?? '',
                    padding: const EdgeInsets.all(16),
                    selectable: true,
                    onTapLink: (text, href, title) async {
                      if (href == null) return;

                      final messenger = ScaffoldMessenger.of(context);
                      final uri = Uri.parse(href);

                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri);
                        return;
                      }

                      await Clipboard.setData(ClipboardData(text: uri.path));

                      if (!mounted) return;

                      messenger.showSnackBar(
                        SnackBar(
                          content: Text(t.t('about.emailCopied')),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
