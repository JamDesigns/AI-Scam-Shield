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
