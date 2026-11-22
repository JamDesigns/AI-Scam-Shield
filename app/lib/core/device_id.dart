import 'app_session.dart';

/// Kept as a compatibility adapter: IDs are now server-issued and backed by
/// the same secure session used by ApiClient and RevenueCat.
class DeviceId {
  static Future<String> getOrCreate() async =>
      (await SessionRepository.instance.getOrCreate()).deviceId;
}
