import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/video_constraints.dart';

void main() {
  test('180 seconds is included and an extra millisecond is rejected', () {
    for (final duration in [179999, 180000]) {
      expect(VideoConstraints.errorCode(durationMillis: duration, bytes: 1024),
          isNull);
    }
    expect(VideoConstraints.errorCode(durationMillis: 180001, bytes: 1024),
        'video_too_long');
  });

  test('unknown duration and empty files are not accepted as safe videos', () {
    expect(VideoConstraints.errorCode(durationMillis: 0, bytes: 1024),
        'invalid_video');
    expect(VideoConstraints.errorCode(durationMillis: 1000, bytes: 0),
        'invalid_video');
  });

  test('the upload limit includes exactly 100 MiB', () {
    expect(
        VideoConstraints.errorCode(
            durationMillis: 1000, bytes: VideoConstraints.maxBytes),
        isNull);
    expect(
        VideoConstraints.errorCode(
            durationMillis: 1000, bytes: VideoConstraints.maxBytes + 1),
        'video_too_large');
  });
  test(
      'explicit server duration validation still enforces byte and known time limits',
      () {
    expect(
        VideoConstraints.errorCode(
            durationMillis: 0,
            bytes: 1024,
            serverWillValidateUnknownDuration: true),
        isNull);
    expect(
        VideoConstraints.errorCode(
            durationMillis: 180001,
            bytes: 1024,
            serverWillValidateUnknownDuration: true),
        'video_too_long');
    expect(
        VideoConstraints.errorCode(
            durationMillis: 0,
            bytes: VideoConstraints.maxBytes + 1,
            serverWillValidateUnknownDuration: true),
        'video_too_large');
    expect(
        VideoConstraints.errorCode(
            durationMillis: 0,
            bytes: 0,
            serverWillValidateUnknownDuration: true),
        'invalid_video');
    expect(
        VideoConstraints.errorCode(
            durationMillis: -1,
            bytes: 1024,
            serverWillValidateUnknownDuration: true),
        'invalid_video');
  });
}
