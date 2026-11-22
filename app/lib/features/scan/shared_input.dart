enum SharedInputKind { text, image, video }

class SharedInput {
  const SharedInput({
    required this.eventId,
    this.text = '',
    this.path,
    this.mimeType,
    this.errorCode,
  });

  final String eventId;
  final String text;
  final String? path;
  final String? mimeType;
  final String? errorCode;

  bool get hasMedia => path != null && mimeType != null;

  SharedInputKind get kind {
    if (hasMedia && mimeType!.startsWith('image/')) return SharedInputKind.image;
    if (hasMedia && mimeType!.startsWith('video/')) return SharedInputKind.video;
    return SharedInputKind.text;
  }

  static SharedInput? fromMessage(Object? message) {
    if (message is! Map) return null;
    final eventId = message['eventId'];
    if (eventId is! String || eventId.isEmpty) return null;
    return SharedInput(
      eventId: eventId,
      text: message['text'] is String ? (message['text'] as String).trim() : '',
      path: message['path'] is String ? message['path'] as String : null,
      mimeType:
          message['mimeType'] is String ? message['mimeType'] as String : null,
      errorCode: message['errorCode'] is String
          ? message['errorCode'] as String
          : null,
    );
  }
}
