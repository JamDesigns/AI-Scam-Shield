import 'package:flutter/material.dart';

import '../../core/revenuecat_service.dart';
import '../../i18n/app_localizations.dart';

class SubscriptionPage extends StatelessWidget {
  const SubscriptionPage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('subscription.title')),
      ),
      body: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('subscription.subtitle'),
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () async {
                await RevenueCatService.openManageSubscriptions();
              },
              child: Text(t.t('subscription.manageCta')),
            ),
            const SizedBox(height: 8),
            Text(
              t.t('subscription.manageHint'),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.start,
            ),
          ],
        ),
      ),
    );
  }
}
