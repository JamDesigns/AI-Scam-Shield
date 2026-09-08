import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:onnxruntime_plus/onnxruntime_plus.dart';

class ImageForensicsResult {
  const ImageForensicsResult({
    required this.rawLogit,
    required this.threshold,
    required this.isAiGenerated,
  });

  final double rawLogit;
  final double threshold;
  final bool isAiGenerated;
}

class ImageForensicsService {
  static const String _modelAsset =
      'assets/models/community_forensics_frontier_fp16.onnx';

  static const String _inputName = 'images';
  static const String _outputName = 'logits';

  static const int _resizeShortEdge = 440;
  static const int _inputSize = 384;

  static const double _aiGeneratedThreshold = 1.359375;

  static const List<double> _mean = [
    0.485,
    0.456,
    0.406,
  ];

  static const List<double> _std = [
    0.229,
    0.224,
    0.225,
  ];

  OrtSession? _session;

  Future<void> _ensureInitialized() async {
    if (_session != null) {
      return;
    }

    OrtEnv.instance.init();

    final sessionOptions = OrtSessionOptions();

    try {
      final modelData = await rootBundle.load(_modelAsset);
      final modelBytes = modelData.buffer.asUint8List(
        modelData.offsetInBytes,
        modelData.lengthInBytes,
      );

      _session = OrtSession.fromBuffer(
        modelBytes,
        sessionOptions,
      );
    } finally {
      sessionOptions.release();
    }
  }

  Future<ImageForensicsResult> analyze(Uint8List imageBytes) async {
    await _ensureInitialized();

    final inputData = _preprocess(imageBytes);

    final inputTensor = OrtValueTensor.createTensorWithDataList(
      inputData,
      const [1, 3, _inputSize, _inputSize],
    );

    final runOptions = OrtRunOptions();
    List<OrtValue?>? outputs;

    try {
      final outputFuture = _session!.runAsync(
        runOptions,
        {
          _inputName: inputTensor,
        },
        const [_outputName],
      );

      if (outputFuture == null) {
        throw StateError('ONNX Runtime did not start inference');
      }

      outputs = await outputFuture;

      if (outputs.isEmpty || outputs.first == null) {
        throw StateError('ONNX Runtime returned no output');
      }

      final rawLogit = _extractScalar(outputs.first!.value);

      return ImageForensicsResult(
        rawLogit: rawLogit,
        threshold: _aiGeneratedThreshold,
        isAiGenerated: rawLogit >= _aiGeneratedThreshold,
      );
    } finally {
      inputTensor.release();
      runOptions.release();

      if (outputs != null) {
        for (final output in outputs) {
          output?.release();
        }
      }
    }
  }

  Float32List _preprocess(Uint8List imageBytes) {
    final decoded = img.decodeImage(imageBytes);

    if (decoded == null) {
      throw const FormatException('Unsupported image format');
    }

    final oriented = img.bakeOrientation(decoded);

    final resized = _resizeShortEdgeTo440(oriented);

    final cropX = (resized.width - _inputSize) ~/ 2;
    final cropY = (resized.height - _inputSize) ~/ 2;

    final cropped = img.copyCrop(
      resized,
      x: cropX,
      y: cropY,
      width: _inputSize,
      height: _inputSize,
    );

    const planeSize = _inputSize * _inputSize;
    final tensor = Float32List(3 * planeSize);

    for (var y = 0; y < _inputSize; y++) {
      for (var x = 0; x < _inputSize; x++) {
        final pixel = cropped.getPixel(x, y);
        final index = y * _inputSize + x;

        final r = pixel.r.toDouble() / 255.0;
        final g = pixel.g.toDouble() / 255.0;
        final b = pixel.b.toDouble() / 255.0;

        tensor[index] = (r - _mean[0]) / _std[0];
        tensor[planeSize + index] = (g - _mean[1]) / _std[1];
        tensor[(2 * planeSize) + index] = (b - _mean[2]) / _std[2];
      }
    }

    return tensor;
  }

  img.Image _resizeShortEdgeTo440(img.Image source) {
    if (source.width <= source.height) {
      return img.copyResize(
        source,
        width: _resizeShortEdge,
      );
    }

    return img.copyResize(
      source,
      height: _resizeShortEdge,
    );
  }

  double _extractScalar(Object? value) {
    dynamic current = value;

    while (current is List && current.isNotEmpty) {
      current = current.first;
    }

    if (current is num) {
      return current.toDouble();
    }

    throw StateError('Unexpected ONNX output format');
  }

  void dispose() {
    _session?.release();
    _session = null;
  }
}
