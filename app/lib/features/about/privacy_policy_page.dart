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

  bool _contentLoaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    if (_contentLoaded) {
      return;
    }

    _contentLoaded = true;
    _loadContent(Localizations.localeOf(context).languageCode);
  }

  Future<void> _loadContent(String locale) async {
    try {
      final content = await _loadLocalizedPrivacyPolicy(locale);

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

  Future<String> _loadLocalizedPrivacyPolicy(String locale) async {
    try {
      return await rootBundle.loadString(
        'assets/legal/privacy-policy.$locale.md',
      );
    } catch (_) {
      return rootBundle.loadString('assets/legal/privacy-policy.en.md');
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
