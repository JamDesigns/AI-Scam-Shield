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
}
