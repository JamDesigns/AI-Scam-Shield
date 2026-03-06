import 'package:flutter/material.dart';

import '../../i18n/app_localizations.dart';
import '../../core/revenuecat_service.dart';

class PaywallSheet extends StatelessWidget {
  const PaywallSheet({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('premium.cta'),
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 8),
            Text(
              t.t('premium.description'),
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                try {
                  await RevenueCatService.presentPaywall();
                } catch (_) {
                  messenger.showSnackBar(
                    SnackBar(content: Text(t.t('premium.iapNotReady'))),
                  );
                }
              },
              child: Text(t.t('premium.cta')),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () async {
                try {
                  await RevenueCatService.restorePurchases();
                  messenger.showSnackBar(
                    SnackBar(content: Text(t.t('premium.restoreSuccess'))),
                  );
                } catch (_) {
                  messenger.showSnackBar(
                    SnackBar(content: Text(t.t('premium.restoreNotReady'))),
                  );
                }
              },
              child: Text(t.t('premium.restore')),
            ),
            const SizedBox(height: 4),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close),
                tooltip: t.t('actions.close'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
