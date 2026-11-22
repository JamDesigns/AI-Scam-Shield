import 'package:flutter_test/flutter_test.dart';
import 'package:scam_shield_mvp/features/scan/shared_input.dart';

void main() {
  test('an image and its caption form one image operation', () {
    final input = SharedInput.fromMessage({
      'eventId': 'share-one', 'text': '  Urgent bank message  ',
      'path': '/cache/original.png', 'mimeType': 'image/png',
    })!;
    expect(input.kind, SharedInputKind.image);
    expect(input.text, 'Urgent bank message');
    expect(input.path, '/cache/original.png');
  });

  test('a video caption stays context for the video operation', () {
    final input = SharedInput.fromMessage({
      'eventId': 'share-video', 'text': 'Check this clip',
      'path': '/cache/video.mp4', 'mimeType': 'video/mp4',
    })!;
    expect(input.kind, SharedInputKind.video);
    expect(input.text, 'Check this clip');
  });

  test('repeated content can be delivered with a new event for retry', () {
    final first = SharedInput.fromMessage({'eventId': 'one', 'text': 'same'});
    final retry = SharedInput.fromMessage({'eventId': 'two', 'text': 'same'});
    expect(first!.kind, SharedInputKind.text);
    expect(retry!.text, first.text);
    expect(retry.eventId, isNot(first.eventId));
  });

  test('unsupported multiple selections preserve an explicit error', () {
    final input = SharedInput.fromMessage({
      'eventId': 'multiple', 'errorCode': 'multiple_items_not_supported',
    })!;
    expect(input.errorCode, 'multiple_items_not_supported');
    expect(input.hasMedia, isFalse);
  });

  test('invalid messages are ignored without creating an analysis', () {
    expect(SharedInput.fromMessage(null), isNull);
    expect(SharedInput.fromMessage({'text': 'no event'}), isNull);
  });
}
