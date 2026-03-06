class ScanResult {
  ScanResult({
    required this.riskScore,
    required this.category,
    required this.reasons,
    required this.isPremium,
    required this.weeklyLimit,
    required this.weeklyUsed,
    required this.weeklyRemaining,
    required this.aiAllowed,
    required this.aiUsed,
    required this.aiWeeklyLimit,
    required this.aiWeeklyUsed,
    required this.aiWeeklyRemaining,
    required this.aiUnlimited,
    required this.aiResetAt,
  });

  final int riskScore;
  final String category;
  final List<String> reasons;
  final bool isPremium;

  final int? weeklyLimit; // null when unlimited
  final int weeklyUsed;
  final int? weeklyRemaining; // null when unlimited

  final bool aiAllowed;
  final bool aiUsed;

  final int? aiWeeklyLimit; // null when unlimited
  final int aiWeeklyUsed;
  final int? aiWeeklyRemaining; // null when unlimited
  final bool aiUnlimited;
  final String? aiResetAt;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    return ScanResult(
      riskScore: (json['riskScore'] as num).toInt(),
      category: json['category'] as String,
      reasons: (json['reasons'] as List<dynamic>).cast<String>(),
      isPremium: json['isPremium'] as bool? ?? false,
      weeklyLimit: (json['weeklyLimit'] as num?)?.toInt(),
      weeklyUsed: (json['weeklyUsed'] as num?)?.toInt() ?? 0,
      weeklyRemaining: (json['weeklyRemaining'] as num?)?.toInt(),
      aiAllowed: json['aiAllowed'] as bool? ?? false,
      aiUsed: json['aiUsed'] as bool? ?? false,
      aiWeeklyLimit: (json['aiWeeklyLimit'] as num?)?.toInt(),
      aiWeeklyUsed: (json['aiWeeklyUsed'] as num?)?.toInt() ?? 0,
      aiWeeklyRemaining: (json['aiWeeklyRemaining'] as num?)?.toInt(),
      aiUnlimited: json['aiUnlimited'] as bool? ?? false,
      aiResetAt: json['aiResetAt'] as String?,
    );
  }
}

class AiQuotaStatus {
  AiQuotaStatus({
    required this.isPremium,
    required this.aiWeeklyLimit,
    required this.aiWeeklyUsed,
    required this.aiWeeklyRemaining,
    required this.aiUnlimited,
    required this.aiResetAt,
    required this.weeklyLimit,
    required this.weeklyUsed,
    required this.weeklyRemaining,
  });

  final bool isPremium;

  final int? aiWeeklyLimit; // null when unlimited
  final int aiWeeklyUsed;
  final int? aiWeeklyRemaining; // null when unlimited
  final bool aiUnlimited;
  final String? aiResetAt;
  final int? weeklyLimit; // null when unlimited
  final int weeklyUsed;
  final int? weeklyRemaining; // null when unlimited

  factory AiQuotaStatus.fromJson(Map<String, dynamic> json) {
    return AiQuotaStatus(
      isPremium: json['isPremium'] as bool? ?? false,
      aiWeeklyLimit: (json['aiWeeklyLimit'] as num?)?.toInt(),
      aiWeeklyUsed: (json['aiWeeklyUsed'] as num?)?.toInt() ?? 0,
      aiWeeklyRemaining: (json['aiWeeklyRemaining'] as num?)?.toInt(),
      aiUnlimited: json['aiUnlimited'] as bool? ?? false,
      aiResetAt: json['aiResetAt'] as String?,
      weeklyLimit: (json['weeklyLimit'] as num?)?.toInt(),
      weeklyUsed: (json['weeklyUsed'] as num?)?.toInt() ?? 0,
      weeklyRemaining: (json['weeklyRemaining'] as num?)?.toInt(),
    );
  }
}
