import 'package:flutter/services.dart';

/// Android supplies the IANA identifier; DateTime.timeZoneName can be only an
/// abbreviation and must never be used as the server's zone identifier.
class AppPlatform {
  static const channel =
      MethodChannel('com.jamdesigns.scamshield/share_intent');

  static Future<String> timeZone() async {
    try {
      final zone = await channel.invokeMethod<String>('getTimeZone');
      return zone == null || zone.isEmpty ? 'UTC' : zone;
    } on MissingPluginException {
      return 'UTC';
    } on PlatformException {
      return 'UTC';
    }
  }

  static Future<int> videoDurationMillis(String path) async {
    final duration = await channel.invokeMethod<int>(
      'getVideoDurationMillis',
      {'path': path},
    );
    if (duration == null || duration <= 0) {
      throw PlatformException(code: 'invalid_video');
    }
    return duration;
  }

  static Future<String?> formatResetAt(
    String resetAt,
    String timeZone,
    String language,
  ) async {
    final instant = DateTime.tryParse(resetAt);
    if (instant == null) return null;
    try {
      return await channel.invokeMethod<String>('formatZonedDateTime', {
        'epochMillis': instant.toUtc().millisecondsSinceEpoch,
        'timeZone': timeZone,
        'language': language,
      });
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<void> releaseSharedFile(String path) async {
    try {
      await channel.invokeMethod<void>('releaseSharedFile', {'path': path});
    } on PlatformException {
      // Cleanup cannot turn a completed analysis into a failed one.
    } on MissingPluginException {
      // Other platforms have their own shared-file lifecycle.
    }
  }
}
