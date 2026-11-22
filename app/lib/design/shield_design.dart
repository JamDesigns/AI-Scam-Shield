import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Luminous Navy: shared visual language, independent of analysis/billing logic.
abstract final class ShieldDesign {
  static const midnight = Color(0xFF03091E);
  static const navy = Color(0xFF071633);
  static const panel = Color(0xFF0C2142);
  static const cyan = Color(0xFF00DBF0);
  static const mint = Color(0xFF13E6AE);
  static const muted = Color(0xFFACBDD5);
  static const amber = Color(0xFFFFD074);
  static const coral = Color(0xFFFF8795);
  static const sky = Color(0xFF90C9FF);
  static Color riskColor(String category) => switch (category) {
        'high_risk' => coral,
        'medium_risk' => amber,
        'low_risk' => mint,
        _ => sky,
      };

  static ThemeData get theme {
    final scheme = ColorScheme.fromSeed(
      seedColor: cyan,
      brightness: Brightness.dark,
      primary: mint,
      onPrimary: midnight,
      secondary: cyan,
      surface: navy,
      onSurface: const Color(0xFFF1F6FF),
      error: coral,
      onError: midnight,
    );
    final base = ThemeData(useMaterial3: true, colorScheme: scheme);
    final rounded =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(20));
    return base.copyWith(
      scaffoldBackgroundColor: midnight,
      textTheme: base.textTheme
          .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface)
          .copyWith(
            headlineMedium: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                height: 1.18,
                color: Colors.white),
            titleLarge: const TextStyle(
                fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
            bodyMedium: const TextStyle(
                fontSize: 14, height: 1.5, color: Color(0xFFE0EAF8)),
            bodySmall:
                const TextStyle(fontSize: 12, height: 1.45, color: muted),
          ),
      appBarTheme: const AppBarTheme(
          backgroundColor: midnight,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
          elevation: 0),
      cardTheme: CardThemeData(
          color: navy,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 6),
          shape: rounded.copyWith(
              side: BorderSide(color: cyan.withValues(alpha: .25)))),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: navy,
          contentPadding: const EdgeInsets.all(18),
          labelStyle: const TextStyle(color: muted),
          hintStyle: const TextStyle(color: muted),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: cyan)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: cyan.withValues(alpha: .4))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: mint, width: 2))),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              minimumSize: const Size(0, 50),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontWeight: FontWeight.w700))),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
              foregroundColor: cyan,
              minimumSize: const Size(0, 48),
              side: BorderSide(color: cyan.withValues(alpha: .5)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)))),
      navigationBarTheme: NavigationBarThemeData(
          backgroundColor: navy,
          surfaceTintColor: Colors.transparent,
          indicatorColor: mint.withValues(alpha: .14),
          iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
              color: states.contains(WidgetState.selected) ? mint : muted)),
          labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: states.contains(WidgetState.selected) ? mint : muted))),
      chipTheme: base.chipTheme.copyWith(
          backgroundColor: navy,
          selectedColor: mint.withValues(alpha: .18),
          side: BorderSide(color: cyan.withValues(alpha: .3))),
      dividerTheme:
          DividerThemeData(color: cyan.withValues(alpha: .18), space: 24),
      bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: navy,
          surfaceTintColor: Colors.transparent,
          showDragHandle: true),
      dialogTheme: DialogThemeData(
          backgroundColor: navy,
          surfaceTintColor: Colors.transparent,
          shape: rounded),
      progressIndicatorTheme: ProgressIndicatorThemeData(
          color: mint, linearTrackColor: sky.withValues(alpha: .12)),
      snackBarTheme: const SnackBarThemeData(
          backgroundColor: panel,
          contentTextStyle: TextStyle(color: Colors.white)),
    );
  }
}

class BrandPanel extends StatelessWidget {
  const BrandPanel(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(20)});
  final Widget child;
  final EdgeInsetsGeometry padding;
  @override
  Widget build(BuildContext context) => Container(
      padding: padding,
      decoration: BoxDecoration(
          gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [ShieldDesign.panel, ShieldDesign.navy]),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: ShieldDesign.cyan.withValues(alpha: .28)),
          boxShadow: [
            BoxShadow(
                color: ShieldDesign.cyan.withValues(alpha: .035),
                blurRadius: 22)
          ]),
      child: child);
}

/// Decorative vector artwork; does not imply protection or a completed scan.
class ShieldMark extends StatelessWidget {
  const ShieldMark({super.key, this.size = 100});
  final double size;
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
      child: SizedBox.square(
          dimension: size,
          child: CustomPaint(
              painter: _ShieldPainter(),
              child: Center(
                  child: Padding(
                      padding: EdgeInsets.only(bottom: size * .1),
                      child: Text('AI',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: size * .24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 2)))))));
}

class _ShieldPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final r = Offset.zero & size;
    Path shield(double inset) {
      final w = size.width, h = size.height;
      return Path()
        ..moveTo(w * .5, h * (.08 + inset))
        ..lineTo(w * (.88 - inset), h * (.22 + inset * .4))
        ..cubicTo(w * (.89 - inset), h * .59, w * .77, h * (.79 - inset),
            w * .5, h * (.94 - inset))
        ..cubicTo(w * .23, h * (.79 - inset), w * (.11 + inset), h * .59,
            w * (.12 + inset), h * (.22 + inset * .4))
        ..close();
    }

    final outline = shield(0);
    canvas.drawPath(
        outline,
        Paint()
          ..color = ShieldDesign.cyan.withValues(alpha: .3)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14));
    canvas.drawPath(
        outline,
        Paint()
          ..shader = const LinearGradient(
              colors: [Color(0xFF12396A), ShieldDesign.navy]).createShader(r));
    for (final inset in [0.0, .065, .13]) {
      canvas.drawPath(
          shield(inset),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..shader = const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF007DFF),
                  ShieldDesign.cyan,
                  ShieldDesign.mint
                ]).createShader(r));
    }
  }

  @override
  bool shouldRepaint(covariant _ShieldPainter oldDelegate) => false;
}

class BrandHero extends StatelessWidget {
  const BrandHero(
      {super.key, required this.title, this.subtitle, this.compact = false});
  final String title;
  final String? subtitle;
  final bool compact;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(children: [
        ShieldMark(size: compact ? 82 : 120),
        const SizedBox(height: 12),
        Text(title,
            style: Theme.of(context).textTheme.headlineMedium,
            textAlign: TextAlign.center),
        if (subtitle != null) ...[
          const SizedBox(height: 10),
          Text(subtitle!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: ShieldDesign.muted, height: 1.5))
        ],
      ]));
}

/// A screening score, never a probability or a forensic confidence percentage.
class RiskOverview extends StatelessWidget {
  const RiskOverview(
      {super.key,
      required this.score,
      required this.category,
      required this.label,
      required this.categoryLabel});
  final int? score;
  final String category, label, categoryLabel;
  @override
  Widget build(BuildContext context) {
    final color = ShieldDesign.riskColor(category);
    final valid = score != null && category != 'inconclusive';
    return SizedBox(
        width: double.infinity,
        child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Column(children: [
              Semantics(
                  label: '$label: ${valid ? '${score!}/100' : categoryLabel}',
                  child: ExcludeSemantics(
                      child: SizedBox.square(
                          dimension: 144,
                          child: Stack(alignment: Alignment.center, children: [
                            SizedBox.expand(
                                child: CircularProgressIndicator(
                                    value: valid
                                        ? (score! / 100).clamp(0, 1).toDouble()
                                        : 0,
                                    strokeWidth: 8,
                                    color: color,
                                    backgroundColor:
                                        color.withValues(alpha: .13))),
                            Text(valid ? '${score!}/100' : '—',
                                style: TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w800,
                                    color: color)),
                          ])))),
              const SizedBox(height: 14),
              Text(label,
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center),
              const SizedBox(height: 6),
              Text(categoryLabel,
                  style: TextStyle(
                      color: color, fontSize: 20, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center),
            ])));
  }
}

class RiskDonut extends StatelessWidget {
  const RiskDonut(
      {super.key,
      required this.counts,
      required this.total,
      required this.label});
  final List<int> counts;
  final int total;
  final String label;
  @override
  Widget build(BuildContext context) => Semantics(
      label: label,
      child: ExcludeSemantics(
          child: Center(
              child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: SizedBox.square(
                      dimension: 160,
                      child: CustomPaint(
                          painter: _DonutPainter(counts),
                          child: Center(
                              child: Text(
                                  MaterialLocalizations.of(context)
                                      .formatDecimal(total),
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium))))))));
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.counts);
  final List<int> counts;
  @override
  void paint(Canvas canvas, Size size) {
    final rect = (Offset.zero & size).deflate(9),
        total = counts.fold<int>(0, (a, b) => a + b);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12;
    canvas.drawOval(rect, paint..color = ShieldDesign.panel);
    var start = -math.pi / 2;
    final colors = [
      ShieldDesign.mint,
      ShieldDesign.amber,
      ShieldDesign.coral,
      ShieldDesign.sky
    ];
    for (var i = 0; i < counts.length; i++) {
      final angle = total == 0 ? 0.0 : counts[i] / total * math.pi * 2;
      if (angle > 0) {
        canvas.drawArc(rect, start, angle, false,
            paint..color = colors[i % colors.length]);
      }
      start += angle;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) =>
      oldDelegate.counts.toString() != counts.toString();
}

/// Size the legal-page toolbar for its complete localized title and text scale.
AppBar readableAppBar(BuildContext context, String title) {
  final theme = Theme.of(context);
  final style = theme.appBarTheme.titleTextStyle ?? theme.textTheme.titleLarge!;
  final painter = TextPainter(
    text: TextSpan(text: title, style: style),
    textDirection: Directionality.of(context),
    textScaler: MediaQuery.textScalerOf(context),
  )..layout(maxWidth: math.max(80, MediaQuery.sizeOf(context).width - 112));
  final height = math.max(kToolbarHeight, painter.height + 24);
  painter.dispose();
  return AppBar(
      toolbarHeight: height,
      titleTextStyle: style,
      title: Text(title, maxLines: 10, softWrap: true));
}
