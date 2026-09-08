import '../../core/api_client.dart';
import 'scan_models.dart';

class ScanService {
  ScanService(this._api);

  final ApiClient _api;

  Future<ScanResult> scan(String input) async {
    final json = await _api.postJson('/scan', {
      'input': input,
    });
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
    required double imageForensicsRawLogit,
    required double imageForensicsThreshold,
    required bool imageForensicsIsAiGenerated,
    required String outputLanguage,
  }) async {
    final json = await _api.postJson('/media-analysis', {
      'imageBase64': imageBase64,
      'extractedText': extractedText,
      'mediaSignals': mediaSignals,
      'imageForensics': {
        'rawLogit': imageForensicsRawLogit,
        'threshold': imageForensicsThreshold,
        'isAiGenerated': imageForensicsIsAiGenerated,
      },
      'outputLanguage': outputLanguage,
    });

    return MediaAnalysisResult.fromJson(json);
  }

  Future<AiQuotaStatus> fetchAiQuotaWeek() async {
    final json = await _api.getJson('/usage/week');
    return AiQuotaStatus.fromJson(json);
  }

  Future<ScanStats> fetchStats() async {
    final json = await _api.getJson('/stats');
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
