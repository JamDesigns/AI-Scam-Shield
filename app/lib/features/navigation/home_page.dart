import 'package:flutter/material.dart';

import '../../i18n/app_localizations.dart';
import '../scan/scan_page.dart';
import '../stats/stats_page.dart';
import '../about/about_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  static final GlobalKey<HomePageState> globalKey = GlobalKey<HomePageState>();

  @override
  State<HomePage> createState() => HomePageState();
}

class HomePageState extends State<HomePage> {
  int _currentIndex = 0;

  void openScanTab() {
    if (!mounted) return;

    setState(() {
      _currentIndex = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    final pages = <Widget>[
      const ScanPage(),
      StatsPage(key: StatsPage.globalKey),
      const AboutPage(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });

          if (index == 1) {
            StatsPage.globalKey.currentState?.refresh();
          }
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.shield_outlined),
            selectedIcon: const Icon(Icons.shield),
            label: t.t('nav.scan'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.bar_chart_outlined),
            selectedIcon: const Icon(Icons.bar_chart),
            label: t.t('nav.stats'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.info_outline),
            selectedIcon: const Icon(Icons.info),
            label: t.t('nav.about'),
          ),
        ],
      ),
    );
  }
}
