import '../../core/api_client.dart';
import 'scan_models.dart';

class ScanService {
  ScanService(this._api);

  final ApiClient _api;

  Future<ScanResult> scan(String input,
      {required String idempotencyKey}) async {
    final json = await _api.postJson(
        '/scan',
        {
          'input': input,
        },
        idempotencyKey: idempotencyKey);
    return ScanResult.fromJson(json);
  }

  Future<ImageAuthenticityResult> checkImageAuthenticity({
    required String imageSignals,
    required String imageBase64,
  }) async {
    final json = await _api.postJson('/image-authenticity', {
      'imageSignals': imageSignals,
      'imageBase64': imageBase64,
    });
    return ImageAuthenticityResult.fromJson(json);
  }

  Future<MediaAnalysisResult> analyzeMedia({
    required String imageBase64,
    required String extractedText,
    required String mediaSignals,
    int encryptedEntriesDeclared = 0,
    required double imageForensicsRawLogit,
    required double imageForensicsThreshold,
    required bool imageForensicsIsAiGenerated,
    required String outputLanguage,
    required String idempotencyKey,
    List<String> qrContents = const [],
    String contextText = '',
  }) async {
    final json = await _api.postJson(
        '/media-analysis',
        {
          'imageBase64': imageBase64,
          'extractedText': extractedText,
          'qrContents': qrContents,
          'contextText': contextText,
          'mediaSignals': mediaSignals,
          'hiddenContent': {
            'source': 'client_report',
            'encryptedEntriesDeclared': encryptedEntriesDeclared,
          },
          'imageForensics': {
            'rawLogit': imageForensicsRawLogit,
            'threshold': imageForensicsThreshold,
            'isAiGenerated': imageForensicsIsAiGenerated,
          },
          'outputLanguage': outputLanguage,
        },
        idempotencyKey: idempotencyKey);

    return MediaAnalysisResult.fromJson(json);
  }

  Future<VideoAnalysisResult> analyzeVideo({
    required String filePath,
    required String mimeType,
    required String idempotencyKey,
    String contextText = '',
  }) async {
    final json = await _api.postMultipartFile(
      path: '/video-analysis',
      fieldName: 'media',
      filePath: filePath,
      mimeType: mimeType,
      idempotencyKey: idempotencyKey,
      fields: {
        'outputLanguage': _api.localeLanguageCode,
        'contextText': contextText,
      },
    );

    return VideoAnalysisResult.fromJson(json);
  }

  Future<VideoAnalysisResult> fetchVideoAnalysis(
    String analysisId,
  ) async {
    final json = await _api.getJson(
      '/video-analysis/${Uri.encodeComponent(analysisId)}',
    );

    return VideoAnalysisResult.fromJson(json);
  }

  Future<AiQuotaStatus> fetchAiQuotaWeek() async {
    final json = await _api.getJson('/usage/week');
    return AiQuotaStatus.fromJson(json);
  }

  Future<ScanStats> fetchStats({String period = 'week'}) async {
    final json =
        await _api.getJson('/stats?period=${Uri.encodeQueryComponent(period)}');
    return ScanStats.fromJson(json);
  }

  Future<ScanActivityResponse> fetchActivity({
    int page = 1,
    int limit = 10,
  }) async {
    final json = await _api.getJson('/activity?page=$page&limit=$limit');
    return ScanActivityResponse.fromJson(json);
  }
}
