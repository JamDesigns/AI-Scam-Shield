import 'package:flutter/material.dart';
import '../../design/shield_design.dart';

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
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
        padding: const EdgeInsetsDirectional.fromSTEB(20, 16, 20, 32),
        child: BrandPanel(
            child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BrandHero(title: t.t('subscription.title'), compact: true),
            const Icon(Icons.workspace_premium_outlined,
                color: ShieldDesign.mint, size: 32),
            const SizedBox(height: 16),
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
        )),
      ),
      ),
    );
  }
}
