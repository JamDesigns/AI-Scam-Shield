class ScanResult {
  ScanResult({
    required this.riskScore,
    required this.category,
    required this.threatType,
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
  final String threatType;
  final List<String> reasons;
  final bool isPremium;

  final int? weeklyLimit;
  final int weeklyUsed;
  final int? weeklyRemaining;

  final bool aiAllowed;
  final bool aiUsed;

  final int? aiWeeklyLimit;
  final int aiWeeklyUsed;
  final int? aiWeeklyRemaining;
  final bool aiUnlimited;
  final String? aiResetAt;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    return ScanResult(
      riskScore: (json['riskScore'] as num).toInt(),
      category: json['category'] as String? ?? 'low_risk',
      threatType: json['threatType'] as String? ?? 'none',
      reasons: (json['reasons'] as List<dynamic>? ?? const []).cast<String>(),
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
  final int? aiWeeklyLimit;
  final int aiWeeklyUsed;
  final int? aiWeeklyRemaining;
  final bool aiUnlimited;
  final String? aiResetAt;
  final int? weeklyLimit;
  final int weeklyUsed;
  final int? weeklyRemaining;

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

class ScanStats {
  ScanStats({
    required this.scansToday,
    required this.scansWeek,
    required this.scansMonth,
    required this.threatsDetected,
    required this.isPremium,
    required this.weeklyRemaining,
    required this.aiWeeklyRemaining,
  });

  final int scansToday;
  final int scansWeek;
  final int scansMonth;
  final int threatsDetected;
  final bool isPremium;
  final int? weeklyRemaining;
  final int? aiWeeklyRemaining;

  factory ScanStats.fromJson(Map<String, dynamic> json) {
    return ScanStats(
      scansToday: (json['scansToday'] as num?)?.toInt() ?? 0,
      scansWeek: (json['scansWeek'] as num?)?.toInt() ?? 0,
      scansMonth: (json['scansMonth'] as num?)?.toInt() ?? 0,
      threatsDetected: (json['threatsDetected'] as num?)?.toInt() ?? 0,
      isPremium: json['isPremium'] as bool? ?? false,
      weeklyRemaining: (json['weeklyRemaining'] as num?)?.toInt(),
      aiWeeklyRemaining: (json['aiWeeklyRemaining'] as num?)?.toInt(),
    );
  }
}

class ScanActivityResponse {
  ScanActivityResponse({
    required this.page,
    required this.limit,
    required this.items,
  });

  final int page;
  final int limit;
  final List<ScanActivityItem> items;

  factory ScanActivityResponse.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? const [];

    return ScanActivityResponse(
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 20,
      items: rawItems
          .map(
              (item) => ScanActivityItem.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ScanActivityItem {
  ScanActivityItem({
    required this.id,
    required this.createdAt,
    required this.inputPreview,
    required this.finalCategory,
    required this.threatType,
    required this.finalRiskScore,
    required this.aiUsed,
    required this.isThreat,
  });

  final String id;
  final String createdAt;
  final String inputPreview;
  final String finalCategory;
  final String threatType;
  final int finalRiskScore;
  final bool aiUsed;
  final bool isThreat;

  DateTime? get createdAtDate {
    return DateTime.tryParse(createdAt);
  }

  factory ScanActivityItem.fromJson(Map<String, dynamic> json) {
    return ScanActivityItem(
      id: json['id'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      inputPreview: json['inputPreview'] as String? ?? '',
      finalCategory: json['finalCategory'] as String? ?? 'low_risk',
      threatType: json['threatType'] as String? ?? 'none',
      finalRiskScore: (json['finalRiskScore'] as num?)?.toInt() ?? 0,
      aiUsed: json['aiUsed'] as bool? ?? false,
      isThreat: json['isThreat'] as bool? ?? false,
    );
  }
}

class ImageAuthenticityResult {
  ImageAuthenticityResult({
    required this.category,
    required this.confidence,
    required this.reasons,
    required this.explanation,
    required this.disclaimer,
    required this.isPremium,
  });

  final String category;
  final String confidence;
  final List<String> reasons;
  final String explanation;
  final String disclaimer;
  final bool isPremium;

  factory ImageAuthenticityResult.fromJson(Map<String, dynamic> json) {
    return ImageAuthenticityResult(
      category: json['category'] as String? ?? 'inconclusive',
      confidence: json['confidence'] as String? ?? 'low',
      reasons: (json['reasons'] as List<dynamic>? ?? const []).cast<String>(),
      explanation: json['explanation'] as String? ?? '',
      disclaimer: json['disclaimer'] as String? ?? '',
      isPremium: json['isPremium'] as bool? ?? false,
    );
  }
}

class MediaAnalysisResult {
  MediaAnalysisResult({
    required this.authenticity,
    required this.authenticityConfidence,
    required this.fraudAssessment,
    required this.fraudConfidence,
    required this.authenticityReasons,
    required this.fraudReasons,
    required this.explanation,
    required this.disclaimer,
    required this.isPremium,
    required this.aiUsed,
    required this.aiWeeklyLimit,
    required this.aiWeeklyUsed,
    required this.aiWeeklyRemaining,
    required this.aiResetAt,
    required this.aiUnlimited,
    required this.totalWeeklyUsed,
  });

  final String authenticity;
  final String authenticityConfidence;

  final String fraudAssessment;
  final String fraudConfidence;

  final List<String> authenticityReasons;
  final List<String> fraudReasons;

  final String explanation;
  final String disclaimer;

  final bool isPremium;
  final bool aiUsed;

  final int? aiWeeklyLimit;
  final int aiWeeklyUsed;
  final int? aiWeeklyRemaining;
  final String? aiResetAt;
  final bool aiUnlimited;

  final int totalWeeklyUsed;

  factory MediaAnalysisResult.fromJson(Map<String, dynamic> json) {
    return MediaAnalysisResult(
      authenticity: json['authenticity'] as String? ?? 'inconclusive',
      authenticityConfidence:
          json['authenticityConfidence'] as String? ?? 'low',
      fraudAssessment: json['fraudAssessment'] as String? ?? 'no_clear_signals',
      fraudConfidence: json['fraudConfidence'] as String? ?? 'low',
      authenticityReasons:
          (json['authenticityReasons'] as List<dynamic>? ?? const [])
              .cast<String>(),
      fraudReasons:
          (json['fraudReasons'] as List<dynamic>? ?? const []).cast<String>(),
      explanation: json['explanation'] as String? ?? '',
      disclaimer: json['disclaimer'] as String? ?? '',
      isPremium: json['isPremium'] as bool? ?? false,
      aiUsed: json['aiUsed'] as bool? ?? false,
      aiWeeklyLimit: (json['aiWeeklyLimit'] as num?)?.toInt(),
      aiWeeklyUsed: (json['aiWeeklyUsed'] as num?)?.toInt() ?? 0,
      aiWeeklyRemaining: (json['aiWeeklyRemaining'] as num?)?.toInt(),
      aiResetAt: json['aiResetAt'] as String?,
      aiUnlimited: json['aiUnlimited'] as bool? ?? false,
      totalWeeklyUsed: (json['totalWeeklyUsed'] as num?)?.toInt() ?? 0,
    );
  }
}
