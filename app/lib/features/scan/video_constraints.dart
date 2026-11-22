class VideoConstraints {
  static const maxDurationMillis = 180000;
  static const maxBytes = 100 * 1024 * 1024;

  static String? errorCode(
      {required int durationMillis,
      required int bytes,
      bool serverWillValidateUnknownDuration = false}) {
    if (bytes <= 0 ||
        durationMillis < 0 ||
        (durationMillis == 0 && !serverWillValidateUnknownDuration)) {
      return 'invalid_video';
    }
    if (bytes > maxBytes) return 'video_too_large';
    if (durationMillis > maxDurationMillis) return 'video_too_long';
    return null;
  }
}
