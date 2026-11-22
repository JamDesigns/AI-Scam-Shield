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
    this.totalWeeklyLimit,
    this.totalWeeklyUsed,
    this.totalWeeklyRemaining,
    this.nextAnalysisUsesAi,
    this.languageNormalizationUnavailable = false,
  });

  final int? riskScore;
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
  final int? totalWeeklyLimit;
  final int? totalWeeklyUsed;
  final int? totalWeeklyRemaining;
  final bool? nextAnalysisUsesAi;
  final bool languageNormalizationUnavailable;

  bool get isInconclusive => riskScore == null || category == 'inconclusive';
  bool get hasLimitedLanguageCoverage =>
      !aiUsed && languageNormalizationUnavailable;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    return ScanResult(
      riskScore: (json['riskScore'] as num?)?.toInt(),
      category: json['riskScore'] == null
          ? 'inconclusive'
          : json['category'] as String? ?? 'inconclusive',
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
      totalWeeklyLimit: (json['totalWeeklyLimit'] as num?)?.toInt(),
      totalWeeklyUsed: (json['totalWeeklyUsed'] as num?)?.toInt(),
      totalWeeklyRemaining: (json['totalWeeklyRemaining'] as num?)?.toInt(),
      nextAnalysisUsesAi: json['nextAnalysisUsesAi'] as bool?,
      languageNormalizationUnavailable:
          json['languageNormalizationUnavailable'] == true,
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
    this.totalWeeklyLimit,
    this.totalWeeklyUsed,
    this.totalWeeklyRemaining,
    this.nextAnalysisUsesAi,
    this.resetAt,
    this.timeZone,
    this.subscriptionSyncPending = false,
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

  final int? totalWeeklyLimit;
  final int? totalWeeklyUsed;
  final int? totalWeeklyRemaining;
  final bool? nextAnalysisUsesAi;
  final String? resetAt;
  final String? timeZone;
  final bool subscriptionSyncPending;

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
      totalWeeklyLimit: (json['totalWeeklyLimit'] as num?)?.toInt(),
      totalWeeklyUsed: (json['totalWeeklyUsed'] as num?)?.toInt(),
      totalWeeklyRemaining: (json['totalWeeklyRemaining'] as num?)?.toInt(),
      nextAnalysisUsesAi: json['nextAnalysisUsesAi'] as bool?,
      resetAt: (json['resetAt'] ?? json['aiResetAt']) as String?,
      timeZone: json['timeZone'] as String?,
      subscriptionSyncPending: json['subscriptionSyncPending'] == true,
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
    this.scansYear,
    this.periods = const {},
    this.timeZone,
  });

  final int scansToday;
  final int scansWeek;
  final int scansMonth;
  final int threatsDetected;
  final bool isPremium;
  final int? weeklyRemaining;
  final int? aiWeeklyRemaining;
  final int? scansYear;
  final Map<String, ScanPeriodStats> periods;
  final String? timeZone;

  factory ScanStats.fromJson(Map<String, dynamic> json) {
    return ScanStats(
      scansToday: (json['scansToday'] as num?)?.toInt() ?? 0,
      scansWeek: (json['scansWeek'] as num?)?.toInt() ?? 0,
      scansMonth: (json['scansMonth'] as num?)?.toInt() ?? 0,
      threatsDetected: (json['threatsDetected'] as num?)?.toInt() ?? 0,
      isPremium: json['isPremium'] as bool? ?? false,
      weeklyRemaining: (json['weeklyRemaining'] as num?)?.toInt(),
      aiWeeklyRemaining: (json['aiWeeklyRemaining'] as num?)?.toInt(),
      scansYear: (json['scansYear'] as num?)?.toInt(),
      timeZone: json['timeZone'] as String?,
      periods: {
        if (json['periods'] is Map)
          for (final entry in (json['periods'] as Map).entries)
            if (entry.key is String && entry.value is Map<String, dynamic>)
              entry.key as String:
                  ScanPeriodStats.fromJson(entry.value as Map<String, dynamic>),
      },
    );
  }
}

class ScanPeriodStats {
  const ScanPeriodStats({
    required this.totalScans,
    required this.threatsDetected,
    required this.riskBreakdown,
    this.startAt,
    this.endAt,
  });
  final int totalScans;
  final int threatsDetected;
  final Map<String, int> riskBreakdown;
  final String? startAt;
  final String? endAt;

  double get flaggedShare => totalScans == 0
      ? 0
      : (threatsDetected / totalScans).clamp(0, 1).toDouble();

  factory ScanPeriodStats.fromJson(Map<String, dynamic> json) =>
      ScanPeriodStats(
        totalScans: (json['totalScans'] as num?)?.toInt() ?? 0,
        threatsDetected: (json['threatsDetected'] as num?)?.toInt() ?? 0,
        startAt: json['startAt'] as String?,
        endAt: json['endAt'] as String?,
        riskBreakdown: {
          if (json['riskBreakdown'] is Map)
            for (final entry in (json['riskBreakdown'] as Map).entries)
              if (entry.key is String && entry.value is num)
                entry.key as String: (entry.value as num).toInt(),
        },
      );
}

class ScanActivityResponse {
  ScanActivityResponse({
    required this.page,
    required this.limit,
    required this.items,
    this.hasMore,
  });

  final int page;
  final int limit;
  final List<ScanActivityItem> items;
  final bool? hasMore;

  factory ScanActivityResponse.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? const [];

    return ScanActivityResponse(
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 20,
      hasMore: json['hasMore'] as bool?,
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
    this.inputType = 'text',
    required this.createdAt,
    required this.inputPreview,
    required this.finalCategory,
    required this.threatType,
    required this.finalRiskScore,
    required this.aiUsed,
    required this.isThreat,
  });

  final String inputType;
  final String id;

  String? get localizedMediaLabelKey => switch (inputType) {
        'image' => 'scan.media.image',
        'video' => 'scan.media.video',
        'image_authenticity' => 'imageAuthenticity.title',
        _ => null,
      };
  final String createdAt;
  final String inputPreview;
  final String finalCategory;
  final String threatType;
  final int? finalRiskScore;
  final bool aiUsed;
  final bool isThreat;

  DateTime? get createdAtDate {
    return DateTime.tryParse(createdAt)?.toLocal();
  }

  factory ScanActivityItem.fromJson(Map<String, dynamic> json) {
    return ScanActivityItem(
      id: json['id'] as String? ?? '',
      inputType: json['inputType'] as String? ?? 'text',
      createdAt: json['createdAt'] as String? ?? '',
      inputPreview: json['inputPreview'] as String? ?? '',
      finalCategory: json['finalCategory'] as String? ?? 'low_risk',
      threatType: json['threatType'] as String? ?? 'none',
      finalRiskScore: (json['finalRiskScore'] as num?)?.toInt(),
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

class VideoAnalysisResult {
  VideoAnalysisResult({
    required this.analysisId,
    required this.status,
    required this.forensics,
    required this.analysis,
    this.hasUnreadableHiddenContent = false,
  });

  final String analysisId;
  final String status;
  final MediaForensicsEvidence? forensics;
  final VideoSemanticAnalysis? analysis;
  final bool hasUnreadableHiddenContent;

  bool get isCompleted => status == 'completed';
  bool get isProcessing => status == 'processing';
  bool get isFailed => status == 'failed';

  factory VideoAnalysisResult.fromJson(Map<String, dynamic> json) {
    final rawForensics = json['forensics'] ?? json['result'];
    final rawAnalysis = json['analysis'];
    final hidden = json['hiddenContent'];
    final encrypted = hidden is Map ? hidden['encryptedEntriesDeclared'] : null;

    return VideoAnalysisResult(
      hasUnreadableHiddenContent: encrypted is num && encrypted > 0,
      analysisId: json['analysisId'] as String? ?? '',
      status: json['status'] as String? ?? '',
      forensics: rawForensics is Map<String, dynamic>
          ? MediaForensicsEvidence.fromJson(rawForensics)
          : null,
      analysis: rawAnalysis is Map<String, dynamic>
          ? VideoSemanticAnalysis.fromJson(rawAnalysis)
          : null,
    );
  }
}

class VideoSemanticAnalysis {
  VideoSemanticAnalysis({
    required this.riskScore,
    required this.category,
    required this.threatType,
    required this.reasons,
    required this.explanation,
  });

  final int? riskScore;
  final String category;
  final String threatType;
  final List<String> reasons;
  final String explanation;

  factory VideoSemanticAnalysis.fromJson(Map<String, dynamic> json) {
    return VideoSemanticAnalysis(
      riskScore: (json['riskScore'] as num?)?.toInt(),
      category: json['category'] as String? ?? 'inconclusive',
      threatType: json['threatType'] as String? ?? 'none',
      reasons: (json['reasons'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(),
      explanation: json['explanation'] as String? ?? '',
    );
  }
}

class MediaForensicsEvidence {
  MediaForensicsEvidence({
    required this.provider,
    required this.aiGeneratedDetected,
    required this.deepfakeDetected,
    required this.maxAiGeneratedScore,
    required this.maxDeepfakeScore,
    required this.maxAiGeneratedAudioScore,
    required this.topGenerator,
    required this.suspiciousTimestamps,
    this.aiGeneratedStatus = 'inconclusive',
    this.deepfakeStatus = 'inconclusive',
    this.audioAiGeneratedStatus = 'inconclusive',
  });

  final String provider;
  final bool? aiGeneratedDetected;
  final bool? deepfakeDetected;
  final String aiGeneratedStatus;
  final String deepfakeStatus;
  final String audioAiGeneratedStatus;
  final double? maxAiGeneratedScore;
  final double? maxDeepfakeScore;
  final double? maxAiGeneratedAudioScore;
  final MediaForensicsTopGenerator? topGenerator;
  final List<double> suspiciousTimestamps;

  factory MediaForensicsEvidence.fromJson(Map<String, dynamic> json) {
    final rawTopGenerator = json['topGenerator'];

    return MediaForensicsEvidence(
      provider: json['provider'] as String? ?? '',
      aiGeneratedDetected: json['aiGeneratedDetected'] as bool?,
      deepfakeDetected: json['deepfakeDetected'] as bool?,
      aiGeneratedStatus: _evidenceStatus(
          json['aiGeneratedStatus'], json['aiGeneratedDetected']),
      deepfakeStatus:
          _evidenceStatus(json['deepfakeStatus'], json['deepfakeDetected']),
      audioAiGeneratedStatus:
          _evidenceStatus(json['audioAiGeneratedStatus'], null),
      maxAiGeneratedScore: (json['maxAiGeneratedScore'] as num?)?.toDouble(),
      maxDeepfakeScore: (json['maxDeepfakeScore'] as num?)?.toDouble(),
      maxAiGeneratedAudioScore:
          (json['maxAiGeneratedAudioScore'] as num?)?.toDouble(),
      topGenerator: rawTopGenerator is Map<String, dynamic>
          ? MediaForensicsTopGenerator.fromJson(rawTopGenerator)
          : null,
      suspiciousTimestamps:
          (json['suspiciousTimestamps'] as List<dynamic>? ?? const [])
              .whereType<num>()
              .map((value) => value.toDouble())
              .toList(),
    );
  }
}

String _evidenceStatus(Object? status, Object? legacyDetected) {
  if (status is String &&
      const {
        'detected',
        'not_detected',
        'inconclusive',
        'unavailable',
      }.contains(status)) {
    return status;
  }
  if (legacyDetected is bool) {
    return legacyDetected ? 'detected' : 'not_detected';
  }
  return 'inconclusive';
}

class MediaForensicsTopGenerator {
  MediaForensicsTopGenerator({
    required this.name,
    required this.score,
  });

  final String name;
  final double score;

  factory MediaForensicsTopGenerator.fromJson(
    Map<String, dynamic> json,
  ) {
    return MediaForensicsTopGenerator(
      name: json['name'] as String? ?? '',
      score: (json['score'] as num?)?.toDouble() ?? 0,
    );
  }
}
