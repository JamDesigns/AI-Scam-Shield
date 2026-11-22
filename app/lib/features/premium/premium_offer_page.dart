import 'package:flutter/material.dart';
import '../../design/shield_design.dart';
import '../../i18n/app_localizations.dart';

enum PremiumOfferAction { plans, restore }

/// The branded introduction delegates actual offers and purchases to RevenueCat.
class PremiumOfferPage extends StatelessWidget {
  const PremiumOfferPage({super.key});
  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.t('premium.badge'))),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            BrandHero(
                title: t.t('premium.cta'),
                subtitle: t.t('premium.description')),
            BrandPanel(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                  _Benefit(
                      icon: Icons.auto_awesome_outlined,
                      label: t.t('scan.aiQuota.unlimited')),
                  const Divider(),
                  _Benefit(
                      icon: Icons.image_search_outlined,
                      label: t.t('scan.media.image')),
                  const SizedBox(height: 18),
                  _Benefit(
                      icon: Icons.video_library_outlined,
                      label: t.t('scan.media.video')),
                ])),
            const SizedBox(height: 20),
            Text(t.t('scan.media.freeRestriction'),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),
            FilledButton.icon(
                onPressed: () =>
                    Navigator.pop(context, PremiumOfferAction.plans),
                icon: const Icon(Icons.workspace_premium_outlined),
                label: Text(t.t('ui.viewPlans'))),
            const SizedBox(height: 12),
            OutlinedButton(
                onPressed: () =>
                    Navigator.pop(context, PremiumOfferAction.restore),
                child: Text(t.t('premium.restore'))),
          ]),
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(icon, color: ShieldDesign.mint, size: 28),
        const SizedBox(width: 16),
        Expanded(
            child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
      ]);
}
