import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../design/shield_design.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/analytics_service.dart';
import '../../core/api_client.dart';
import '../../core/app_platform.dart';
import '../../core/app_session.dart';
import '../../core/api_errors.dart';
import '../../core/revenuecat_service.dart';
import '../../core/premium_account_service.dart';
import '../premium/account_device_page.dart';
import '../../i18n/app_localizations.dart';
import '../premium/premium_service.dart';
import '../premium/subscription_page.dart';
import '../premium/premium_offer_page.dart';
import '../navigation/home_page.dart';
import 'scan_models.dart';
import 'scan_service.dart';
import 'scan_action_advice.dart';
import 'image_qr_decoder.dart';
import 'image_scan_content.dart';
import 'image_metadata_signals.dart';
import 'image_forensics_service.dart';
import 'analysis_request_keys.dart';
import 'shared_input.dart';
import 'scan_access_policy.dart';
import 'video_constraints.dart';
import 'weekly_reset_hint.dart';

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> with WidgetsBindingObserver {
  static const int _maxInputLength = 1500;
  static const int _examplePlaceholderMaxLines = 20;
  static const int _mediaAnalysisMaxDimension = 1600;
  static const int _mediaAnalysisJpegQuality = 82;
  static const MethodChannel _shareIntentChannel = MethodChannel(
    'com.jamdesigns.scamshield/share_intent',
  );
  static const String _lastScannedInputKey = 'last_scanned_input';
  static const String _lastScanResultKey = 'last_scan_result';
  static const String _lastScannedFingerprintKey = 'last_scanned_fingerprint';

  final _controller = TextEditingController();
  final _resultScroll = ScrollController();
  final _resultKey = GlobalKey();
  final _imagePicker = ImagePicker();
  final _requestKeys = AnalysisRequestKeys();
  final _sharedInputs = Queue<SharedInput>();
  final _receivedShareEvents = <String>{};
  bool _drainingSharedInputs = false;
  bool _ready = false;
  bool _bootstrapping = false;
  bool _apiInitialized = false;
  bool _sessionInvalid = false;
  bool _subscriptionLoading = false;
  bool _unverifiedPurchase = false;
  final _imageForensicsService = ImageForensicsService();
  final _textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);

  late Future<void> _bootstrapFuture;

  bool _loading = false;
  bool _imageScanLoading = false;
  bool _videoScanLoading = false;
  bool _isPremium = false;
  bool _accountLinked = false;
  bool _hasInput = false;
  ScanResult? _lastResult;
  MediaAnalysisResult? _mediaAnalysisResult;
  int _imageEncryptedEntries = 0;
  bool get _hasUnreadableHiddenContent =>
      _videoAnalysisResult?.hasUnreadableHiddenContent == true ||
      (_mediaAnalysisResult != null && _imageEncryptedEntries > 0);
  VideoAnalysisResult? _videoAnalysisResult;
  ScanResult? _restoredLastResult;
  String? _lastScannedInput;
  String? _lastScannedFingerprint;

  String? _errorKey;
  String? _errorMessage;
  String? _noticeKey;

  AiQuotaStatus? _aiQuota;

  late ApiClient _api;
  late ScanService _scanService;
  late PremiumService _premiumService;

  bool get _isBusy =>
      _loading ||
      _imageScanLoading ||
      _videoScanLoading ||
      _subscriptionLoading;

  ScanAccessPolicy get _access => ScanAccessPolicy(
      isPremium: _isPremium,
      quota: _aiQuota,
      localPurchasePending: _unverifiedPurchase);
  bool get _isWeeklyScanLimitReached => _access.isWeeklyLimitReached;
  bool get _subscriptionPending => _access.isSubscriptionPending;
  bool get _canAnalyzeMedia =>
      _ready && !_sessionInvalid && _access.canAnalyzeMedia;

  String get _outputLanguage =>
      AppLocalizations.of(context).locale.toLanguageTag();

  void _syncRequestLanguage() => _api.localeLanguageCode = _outputLanguage;

  String _analysisErrorKey(Object error, {required bool video}) {
    final common = apiErrorKey(error, fallback: '');
    if (common.isNotEmpty) return common;
    final code = error is ApiException
        ? error.errorCode
        : error is PlatformException
            ? error.code
            : null;
    return switch (code) {
      'quota_exceeded' => 'errors.weeklyLimitExceeded',
      'ai_quota_exceeded' => 'errors.mediaAiQuota',
      'scan_in_progress' || 'idempotency_conflict' => 'errors.scanInProgress',
      'rate_limited' => 'errors.rateLimited',
      'video_too_large' || 'media_too_large' => 'errors.mediaTooLarge',
      'video_too_long' => 'errors.videoTooLong',
      'image_signals_too_large' => 'errors.imageSignalsTooLarge',
      'invalid_video' || 'video_processing_failed' => 'errors.invalidVideo',
      'unsupported_media_type' => 'errors.unsupportedMedia',
      'forensics_unavailable' ||
      'transcription_unavailable' ||
      'ai_unavailable' ||
      'forensics_failed' =>
        'errors.analysisUnavailable',
      'timeout' => 'errors.analysisTimeout',
      _ => video ? 'errors.videoScanFailed' : 'errors.imageScanFailed',
    };
  }

  Future<void> _finishRequestAfterError(String? signature, Object error) async {
    _recordSessionError(error);
    if (signature != null && error is ApiException && !error.mayHaveCompleted) {
      await _requestKeys.complete(signature);
    }
  }

  Uint8List _prepareMediaAnalysisImage(Uint8List imageBytes) {
    final decodedImage = img.decodeImage(imageBytes);

    if (decodedImage == null) {
      throw const FormatException('Unsupported image format');
    }

    final orientedImage = img.bakeOrientation(decodedImage);

    final resizedImage = orientedImage.width > _mediaAnalysisMaxDimension ||
            orientedImage.height > _mediaAnalysisMaxDimension
        ? img.copyResize(
            orientedImage,
            width: orientedImage.width >= orientedImage.height
                ? _mediaAnalysisMaxDimension
                : null,
            height: orientedImage.height > orientedImage.width
                ? _mediaAnalysisMaxDimension
                : null,
          )
        : orientedImage;

    return img.encodeJpg(
      resizedImage,
      quality: _mediaAnalysisJpegQuality,
    );
  }

  String _normalizeInput(String value) {
    return value.trim();
  }

  String _buildInputFingerprint(String value) {
    final normalized = _normalizeInput(value);

    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return normalized.replaceAll(RegExp(r'\s+'), ' ');
    }

    final normalizedPath = uri.path != '/' && uri.path.endsWith('/')
        ? uri.path.substring(0, uri.path.length - 1)
        : uri.path;

    final normalizedUri = uri.replace(
      scheme: uri.scheme.toLowerCase(),
      host: uri.host.toLowerCase(),
      path: normalizedPath,
      fragment: null,
    );

    return normalizedUri.toString();
  }

  bool get _hasVisibleMatchingTextResult {
    final input = _normalizeInput(_controller.text);
    // Clear/refresh removes the result card. The same pasted input must then
    // remain actionable; suppress duplicates only while its result is visible.
    return _lastResult != null &&
        input.isNotEmpty &&
        input == _lastScannedInput;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrapFuture = Future<void>.microtask(_bootstrap);
    _setupShareIntent();

    _controller.addListener(() {
      final hasInput = _controller.text.trim().isNotEmpty;
      if (!mounted) return;

      setState(() {
        _hasInput = hasInput;
      });
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _ready && !_isBusy) {
      unawaited(_refreshPremium().then((_) => _refreshAiQuota()));
    }
  }

  Future<void> _bootstrap() async {
    _bootstrapping = true;
    try {
      final session = await SessionRepository.instance.getOrCreate();
      if (!mounted) return;
      if (_apiInitialized) _api.close();
      _api = ApiClient(
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        localeLanguageCode: _outputLanguage,
        timeZone: session.timeZone,
      );
      _apiInitialized = true;
      _scanService = ScanService(_api);
      _premiumService = PremiumService(_api);
      _unverifiedPurchase = (await SharedPreferences.getInstance())
              .getBool('pending_sdk_entitlement:${session.deviceId}') ??
          false;
      try {
        var purchaseOwnerId = session.deviceId;
        try {
          final account = await PremiumAccountService(_api).status();
          _accountLinked = account.linked;
          purchaseOwnerId = account.revenueCatAppUserId ?? purchaseOwnerId;
        } catch (_) {
          // Older local APIs still support free use; purchases separately require account linking.
        }
        await RevenueCatService.initialize(appUserId: purchaseOwnerId);
      } catch (error) {
        debugPrint('Purchases initialization failed: $error');
      }
      await _restoreLastSuccessfulScan();
      if (!mounted) return;
      setState(() {
        _errorKey = null;
        _errorMessage = null;
      });
      await _refreshPremium();
      await _refreshAiQuota();
      if (mounted) setState(() => _ready = true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _ready = false;
          _errorKey = apiErrorKey(error, fallback: 'errors.sessionUnavailable');
        });
      }
    } finally {
      if (mounted) setState(() => _bootstrapping = false);
    }
  }

  void _recordSessionError(Object error) {
    if (mounted && error is ApiException && error.statusCode == 401) {
      setState(() {
        _sessionInvalid = true;
        _errorKey = 'errors.sessionInvalid';
      });
    }
  }

  Future<void> _restoreLastSuccessfulScan() async {
    final prefs = await SharedPreferences.getInstance();

    final storedInput =
        prefs.getString('$_lastScannedInputKey:${_api.deviceId}');
    final storedFingerprint =
        prefs.getString('$_lastScannedFingerprintKey:${_api.deviceId}');
    final storedResultRaw =
        prefs.getString('$_lastScanResultKey:${_api.deviceId}');

    ScanResult? storedResult;

    if (storedResultRaw != null && storedResultRaw.isNotEmpty) {
      try {
        final decoded = json.decode(storedResultRaw) as Map<String, dynamic>;
        storedResult = ScanResult.fromJson(decoded);
      } catch (_) {
        storedResult = null;
      }
    }

    if (!mounted) return;

    setState(() {
      _lastScannedInput = storedInput;
      _lastScannedFingerprint = storedFingerprint;
      _restoredLastResult = storedResult;
      _lastResult = null;
    });
  }

  Future<void> _persistLastSuccessfulScan(
    String input,
    ScanResult result,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final fingerprint = _buildInputFingerprint(input);

    await prefs.setString('$_lastScannedInputKey:${_api.deviceId}', input);
    await prefs.setString(
        '$_lastScannedFingerprintKey:${_api.deviceId}', fingerprint);
    await prefs.setString(
      '$_lastScanResultKey:${_api.deviceId}',
      json.encode(_scanResultToJson(result)),
    );
  }

  Map<String, dynamic> _scanResultToJson(ScanResult result) {
    return {
      'riskScore': result.riskScore,
      'languageNormalizationUnavailable':
          result.languageNormalizationUnavailable,
      'category': result.category,
      'threatType': result.threatType,
      'reasons': result.reasons,
      'isPremium': result.isPremium,
      'weeklyLimit': result.weeklyLimit,
      'weeklyUsed': result.weeklyUsed,
      'weeklyRemaining': result.weeklyRemaining,
      'aiAllowed': result.aiAllowed,
      'aiUsed': result.aiUsed,
      'aiWeeklyLimit': result.aiWeeklyLimit,
      'aiWeeklyUsed': result.aiWeeklyUsed,
      'aiWeeklyRemaining': result.aiWeeklyRemaining,
      'aiUnlimited': result.aiUnlimited,
      'aiResetAt': result.aiResetAt,
    };
  }

  Future<void> _setupShareIntent() async {
    _shareIntentChannel.setMethodCallHandler((call) async {
      if (call.method == 'onSharedContent') {
        await _enqueueSharedInput(call.arguments);
      }
    });
    try {
      final initial = await _shareIntentChannel.invokeMethod<Object?>(
        'getInitialSharedContent',
      );
      await _enqueueSharedInput(initial);
    } on MissingPluginException {
      // iOS will supply its own share receiver in the iOS implementation.
    } on PlatformException {
      if (mounted) setState(() => _errorKey = 'errors.sharedMediaUnreadable');
    }
  }

  Future<void> _enqueueSharedInput(Object? message) async {
    final input = SharedInput.fromMessage(message);
    if (input == null || !_receivedShareEvents.add(input.eventId)) return;
    if (_receivedShareEvents.length > 128) {
      _receivedShareEvents.remove(_receivedShareEvents.first);
    }
    _sharedInputs.add(input);
    await _drainSharedInputs();
  }

  Future<void> _drainSharedInputs() async {
    if (_drainingSharedInputs) return;
    _drainingSharedInputs = true;
    try {
      await _bootstrapFuture;
      while (mounted &&
          _ready &&
          !_sessionInvalid &&
          !_subscriptionPending &&
          !_isBusy &&
          _sharedInputs.isNotEmpty) {
        final input = _sharedInputs.removeFirst();
        HomePage.globalKey.currentState?.openScanTab();
        try {
          if (input.errorCode != null) {
            final key = switch (input.errorCode) {
              'multiple_items_not_supported' => 'errors.singleSharedItem',
              'media_too_large' => 'errors.mediaTooLarge',
              'shared_media_unreadable' => 'errors.sharedMediaUnreadable',
              _ => 'errors.unsupportedMedia',
            };
            setState(() {
              _errorKey = key;
              _errorMessage = null;
            });
          } else if (input.hasMedia) {
            if (input.text.length > _maxInputLength) {
              setState(() => _errorKey = 'errors.sharedTextTooLong');
            } else if (input.kind == SharedInputKind.image) {
              await _applySharedImageAndScan(input.path,
                  contextText: input.text);
            } else {
              final mimeType = _videoMimeType(
                path: input.path!,
                reportedMimeType: input.mimeType,
              );
              if (mimeType == null) {
                setState(() => _errorKey = 'errors.unsupportedMedia');
              } else {
                await _applyVideoAndScan(
                  videoPath: input.path!,
                  mimeType: mimeType,
                  contextText: input.text,
                );
              }
            }
          } else {
            await _applySharedTextAndScan(input.text);
          }
        } finally {
          if (input.path != null) {
            await AppPlatform.releaseSharedFile(input.path!);
          }
        }
      }
    } finally {
      _drainingSharedInputs = false;
    }
  }

  Future<void> _applySharedTextAndScan(String? sharedText) async {
    final input = sharedText == null ? null : _normalizeInput(sharedText);
    if (input == null || input.isEmpty) {
      return;
    }

    HomePage.globalKey.currentState?.openScanTab();

    if (input.length > _maxInputLength) {
      setState(() {
        _errorKey = 'errors.sharedTextTooLong';
        _errorMessage = null;
      });
      return;
    }
    final normalizedInput = input;

    _controller.value = TextEditingValue(
      text: normalizedInput,
      selection: TextSelection.collapsed(offset: normalizedInput.length),
    );

    if (!mounted) return;

    await _bootstrapFuture;
    if (!mounted) return;

    final fingerprint = _buildInputFingerprint(normalizedInput);
    final reusableResult = _lastResult ?? _restoredLastResult;
    final isSameInput =
        _lastScannedFingerprint == fingerprint && reusableResult != null;

    setState(() {
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
      _lastResult = isSameInput ? reusableResult : null;
    });

    if (isSameInput) {
      return;
    }

    if (_isBusy) return;
    if (_isWeeklyScanLimitReached) return;

    await _scan();
  }

  void _clear() {
    _controller.clear();
    setState(() {
      _hasInput = false;
      _lastResult = null;
      _mediaAnalysisResult = null;
      _videoAnalysisResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });
  }

  Future<void> _refreshScreenState() async {
    _controller.clear();

    if (!mounted) return;

    setState(() {
      _hasInput = false;
      _lastResult = null;
      _mediaAnalysisResult = null;
      _videoAnalysisResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    await _refreshPremium();
    await _refreshAiQuota();
  }

  Future<void> _setPurchasePending(bool pending) async {
    if (mounted) setState(() => _unverifiedPurchase = pending);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(
        'pending_sdk_entitlement:${_api.deviceId}', pending);
  }

  Future<void> _refreshPremium() async {
    try {
      final isPremium = await _premiumService.isPremium();
      bool? sdkActive;
      try {
        sdkActive = await _premiumService
            .sdkHasEntitlement()
            .timeout(const Duration(seconds: 5));
      } catch (_) {
        // Preserve a known pending purchase if SDK state is temporarily unreadable.
      }
      if (!mounted) return;
      setState(() => _isPremium = isPremium);
      await _setPurchasePending(
          !isPremium && (sdkActive ?? _unverifiedPurchase));
    } catch (error) {
      _recordSessionError(error);
    }
  }

  Future<void> _refreshAiQuota() async {
    try {
      if (!mounted) return;
      _syncRequestLanguage();
      final quota = await _scanService.fetchAiQuotaWeek();
      if (!mounted) return;
      setState(() {
        _aiQuota = quota;
        _isPremium = quota.isPremium;
        _sessionInvalid = false;
        if (_errorKey == 'errors.sessionInvalid') _errorKey = null;
      });
      if (quota.isPremium && _unverifiedPurchase) {
        await _setPurchasePending(false);
      }
      if (_ready && !_isBusy) unawaited(_drainSharedInputs());
    } catch (error) {
      _recordSessionError(error);
      if (mounted) {
        setState(() => _errorKey = apiErrorKey(error));
      }
    }
  }

  Future<void> _analyzeVideo() async {
    if (_isBusy || !_canAnalyzeMedia) return;

    final video = await _imagePicker.pickVideo(
      source: ImageSource.gallery,
    );

    if (video == null) {
      return;
    }

    final mimeType = _videoMimeType(
      path: video.path,
      reportedMimeType: video.mimeType,
    );

    if (mimeType == null) {
      if (!mounted) return;

      setState(() {
        _errorKey = 'errors.videoScanFailed';
        _errorMessage = null;
      });
      return;
    }

    await _applyVideoAndScan(
      videoPath: video.path,
      mimeType: mimeType,
    );
  }

  Future<void> _applyVideoAndScan({
    required String videoPath,
    required String mimeType,
    String contextText = '',
  }) async {
    final path = videoPath.trim();
    if (path.isEmpty) {
      return;
    }

    HomePage.globalKey.currentState?.openScanTab();

    await _bootstrapFuture;
    if (!mounted) return;

    if (_isBusy) return;
    if (!_canAnalyzeMedia) {
      setState(() => _errorKey = _isWeeklyScanLimitReached
          ? 'errors.weeklyLimitExceeded'
          : 'errors.mediaAiQuota');
      return;
    }

    setState(() {
      _videoScanLoading = true;
      _lastResult = null;
      _mediaAnalysisResult = null;
      _videoAnalysisResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    String? requestSignature;
    try {
      final bytes = await File(path).length();
      if (bytes > VideoConstraints.maxBytes) {
        throw ApiException(
            message: 'Video exceeds upload limit',
            statusCode: 413,
            body: const {'error': 'video_too_large'});
      }
      final serverDurationFallback =
          mimeType == 'video/quicktime' || mimeType == 'video/x-matroska';
      var duration = 0;
      try {
        duration = await AppPlatform.videoDurationMillis(path);
      } on PlatformException {
        if (!serverDurationFallback) rethrow;
        // A valid lossless carrier can be unsupported by Android playback.
        // The API independently probes duration before reserving a scan unit.
      }
      final validationError = VideoConstraints.errorCode(
          durationMillis: duration,
          bytes: bytes,
          serverWillValidateUnknownDuration:
              serverDurationFallback && duration == 0);
      if (validationError != null) {
        throw ApiException(
            message: 'Invalid video',
            statusCode: 422,
            body: {'error': validationError});
      }
      _syncRequestLanguage();
      requestSignature = await AnalysisRequestKeys.fileSignature(
        path: path,
        modality: 'video',
        contextText: contextText,
        language: _api.localeLanguageCode,
      );
      final result = await _scanService.analyzeVideo(
        filePath: path,
        mimeType: mimeType,
        contextText: contextText,
        idempotencyKey: await _requestKeys.forSignature(requestSignature),
      );
      await _requestKeys.complete(requestSignature);

      if (!mounted) return;

      setState(() {
        _lastResult = null;
        _mediaAnalysisResult = null;
        _videoAnalysisResult = result;
        _errorKey = null;
        _errorMessage = null;
        _noticeKey = null;
      });

      _revealCompletedResult();
      await _refreshAiQuota();
    } catch (e) {
      await _finishRequestAfterError(requestSignature, e);
      await _refreshAiQuota();
      if (!mounted) return;

      setState(() {
        _lastResult = null;
        _mediaAnalysisResult = null;
        _videoAnalysisResult = null;
        _errorKey = _analysisErrorKey(e, video: true);
        _errorMessage = kDebugMode ? e.toString() : null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _videoScanLoading = false;
        });
        unawaited(_drainSharedInputs());
      }
    }
  }

  String? _videoMimeType({
    required String path,
    String? reportedMimeType,
  }) {
    final reported = reportedMimeType?.trim().toLowerCase();

    if (reported == 'video/mp4' ||
        reported == 'video/webm' ||
        reported == 'video/quicktime' ||
        reported == 'video/x-matroska' ||
        reported == 'video/m4v' ||
        reported == 'video/x-m4v') {
      return reported;
    }

    final lowerPath = path.toLowerCase();

    if (lowerPath.endsWith('.mp4')) {
      return 'video/mp4';
    }

    if (lowerPath.endsWith('.mov')) return 'video/quicktime';
    if (lowerPath.endsWith('.mkv')) return 'video/x-matroska';
    if (lowerPath.endsWith('.webm')) {
      return 'video/webm';
    }

    if (lowerPath.endsWith('.m4v')) {
      return 'video/x-m4v';
    }

    return null;
  }

  Future<void> _analyzeImage() async {
    if (_isBusy || !_canAnalyzeMedia) return;

    final image = await _imagePicker.pickImage(
      source: ImageSource.gallery,
    );

    if (image == null) {
      return;
    }

    await _applySharedImageAndScan(image.path);
  }

  Future<void> _applySharedImageAndScan(
    String? imagePath, {
    String contextText = '',
  }) async {
    final path = imagePath?.trim();
    if (path == null || path.isEmpty) {
      return;
    }

    HomePage.globalKey.currentState?.openScanTab();

    await _bootstrapFuture;
    if (!mounted) return;

    if (_isBusy) return;
    if (!_canAnalyzeMedia) {
      setState(() => _errorKey = _isWeeklyScanLimitReached
          ? 'errors.weeklyLimitExceeded'
          : 'errors.mediaAiQuota');
      return;
    }

    setState(() {
      _imageScanLoading = true;
      _lastResult = null;
      _mediaAnalysisResult = null;
      _videoAnalysisResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    String? requestSignature;
    try {
      final image = XFile(path);
      final inputImage = InputImage.fromFilePath(path);

      final recognizedText = await _textRecognizer.processImage(inputImage);
      final qrContents = await decodeQrContentsFromImageFile(path);
      if (qrContents.length > 16 ||
          qrContents.any((value) => value.length > 4096) ||
          qrContents.fold<int>(0, (sum, value) => sum + value.length) > 16384) {
        throw ApiException(
            message: 'Image signals exceed limits',
            statusCode: 422,
            body: const {'error': 'image_signals_too_large'});
      }

      final extractedText = buildImageScanContent(
        ocrText: recognizedText.text,
        qrContents: qrContents,
        maxLength: _maxInputLength,
      );

      final imageBytes = await image.readAsBytes();
      final forensicsResult = await _imageForensicsService.analyze(imageBytes);
      final mediaAnalysisImageBytes = _prepareMediaAnalysisImage(imageBytes);
      final imageBase64 = base64Encode(mediaAnalysisImageBytes);

      final metadataSignals = await buildSafeImageMetadataSignals(
        image: image,
        imageBytes: imageBytes,
      );

      _imageEncryptedEntries = metadataSignals.container.encryptedEntries;
      final mediaSignals =
          buildImageAnalysisSignals(metadataSignals, recognizedText.text);

      _syncRequestLanguage();
      requestSignature = await AnalysisRequestKeys.fileSignature(
        path: path,
        modality: 'image',
        contextText: contextText,
        language: _api.localeLanguageCode,
      );
      final result = await _scanService.analyzeMedia(
        imageBase64: imageBase64,
        qrContents: qrContents,
        contextText: contextText,
        idempotencyKey: await _requestKeys.forSignature(requestSignature),
        extractedText: extractedText,
        mediaSignals: mediaSignals,
        encryptedEntriesDeclared: metadataSignals.container.encryptedEntries,
        imageForensicsRawLogit: forensicsResult.rawLogit,
        imageForensicsThreshold: forensicsResult.threshold,
        imageForensicsIsAiGenerated: forensicsResult.isAiGenerated,
        outputLanguage: _api.localeLanguageCode,
      );
      await _requestKeys.complete(requestSignature);

      if (!mounted) return;

      _controller.value = TextEditingValue(
        text: extractedText,
        selection: TextSelection.collapsed(offset: extractedText.length),
      );

      setState(() {
        _hasInput = extractedText.isNotEmpty;
        _lastResult = null;
        _mediaAnalysisResult = result;
        _errorKey = null;
        _errorMessage = null;
        _noticeKey = null;
      });

      _revealCompletedResult();
      await _refreshAiQuota();
    } catch (e) {
      await _finishRequestAfterError(requestSignature, e);
      await _refreshAiQuota();
      if (!mounted) return;

      setState(() {
        _lastResult = null;
        _mediaAnalysisResult = null;
        _errorKey = _analysisErrorKey(e, video: false);
        _errorMessage = kDebugMode ? e.toString() : null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _imageScanLoading = false;
        });
        unawaited(_drainSharedInputs());
      }
    }
  }

  Future<void> _scan() async {
    await _bootstrapFuture;
    if (!mounted || !_ready || _sessionInvalid || _isBusy) return;
    if (_subscriptionPending) {
      setState(() => _errorKey = 'premium.activating');
      return;
    }
    final input = _normalizeInput(_controller.text);
    if (input.isEmpty) return;
    if (_loading) return;
    if (_lastScannedFingerprint == _buildInputFingerprint(input) &&
        _lastResult != null) {
      return;
    }

    setState(() {
      _loading = true;
      _mediaAnalysisResult = null;
      _videoAnalysisResult = null;
      _errorKey = null;
      _errorMessage = null;
      _noticeKey = null;
    });

    _syncRequestLanguage();
    final requestSignature =
        AnalysisRequestKeys.textSignature(input, _api.localeLanguageCode);
    try {
      unawaited(AnalyticsService.scanSubmitted(inputLength: input.length)
          .catchError((Object _) {}));

      final result = await _scanService.scan(input,
          idempotencyKey: await _requestKeys.forSignature(requestSignature));
      await _requestKeys.complete(requestSignature);
      if (!mounted) return;

      setState(() {
        _lastResult = result;
        _lastScannedInput = input;
        _lastScannedFingerprint = _buildInputFingerprint(input);
        _restoredLastResult = result;

        if (!_isPremium) {
          final normalRemaining = result.weeklyRemaining ?? 0;
          final aiRemaining = result.aiWeeklyRemaining ?? 0;

          if (normalRemaining <= 0 && aiRemaining <= 0) {
            _noticeKey = 'errors.weeklyAndAiLimitExceeded';
          } else if (!result.aiAllowed && aiRemaining <= 0) {
            _noticeKey = 'errors.aiLimitExceeded';
          }
        }
      });

      _revealCompletedResult();
      await _persistLastSuccessfulScan(input, result);
      await _refreshAiQuota();

      unawaited(AnalyticsService.scanResult(
        riskScore: result.riskScore,
        category: result.category,
        reasonsCount: result.reasons.length,
        isPremium: _isPremium,
      ).catchError((Object _) {}));
    } catch (e) {
      await _finishRequestAfterError(requestSignature, e);
      if (!mounted) return;

      if (e is ApiException &&
          e.statusCode == 402 &&
          e.errorCode == 'quota_exceeded') {
        await _refreshAiQuota();
        if (!mounted) return;

        setState(() {
          _lastResult = null;
          _errorKey = 'errors.weeklyLimitExceeded';
          _errorMessage = null;
          _noticeKey = 'errors.weeklyAndAiLimitExceeded';
        });
        return;
      }

      if (e is ApiException &&
          e.statusCode == 429 &&
          e.errorCode == 'rate_limited') {
        setState(() {
          _errorKey = 'errors.rateLimited';
          _errorMessage = null;
        });
        return;
      }

      if (e is ApiException &&
          e.statusCode == 503 &&
          e.errorCode == 'ai_unavailable') {
        setState(() {
          _lastResult = null;
          _errorKey = 'errors.network';
          _errorMessage = null;
        });
        return;
      }

      setState(() {
        _errorKey = apiErrorKey(e);
        _errorMessage = kDebugMode ? e.toString() : null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
        unawaited(_drainSharedInputs());
      }
    }
  }

  Future<void> _pasteInput() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (!mounted || _isBusy || data?.text == null) return;
    final input = data!.text!;
    if (input.length > _maxInputLength) {
      setState(() {
        _errorKey = 'errors.sharedTextTooLong';
        _errorMessage = null;
      });
      return;
    }
    // Pasting never consumes quota or starts an analysis automatically.
    _controller.text = input;
    _controller.selection =
        TextSelection.collapsed(offset: _controller.text.length);
  }

  Future<void> _openAccountDevicePage({bool fromPurchase = false}) async {
    if (!_ready || _sessionInvalid || (_isBusy && !fromPurchase)) return;
    final t = AppLocalizations.of(context);
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => AccountDevicePage(
            service: PremiumAccountService(_api),
            labels: AccountDeviceLabels(
              title: t.t('account.title'),
              signInGoogle: t.t('account.signInGoogle'),
              restore: t.t('premium.restore'),
              activate: t.t('account.activate'),
              confirmTitle: t.t('account.confirmTitle'),
              confirmMessage: t.t('account.confirmMessage'),
              cancel: t.t('account.cancel'),
              confirm: t.t('account.confirm'),
              active: t.t('account.active'),
              inactive: t.t('account.inactive'),
              notLinked: t.t('account.notLinked'),
              failed: t.t('account.failed'),
              success: t.t('account.success'),
            ))));
    if (!mounted) return;
    try {
      final account = await PremiumAccountService(_api).status();
      if (mounted) setState(() => _accountLinked = account.linked);
    } catch (_) {
      // Preserve the last verified account state during temporary API failures.
    }
    await _refreshPremium();
    await _refreshAiQuota();
  }

  Future<bool> _ensurePremiumAccount() async {
    final service = PremiumAccountService(_api);
    var account = await service.status();
    if (!account.linked) {
      await _openAccountDevicePage(fromPurchase: true);
      if (!mounted) return false;
      account = await service.status();
    }
    final ownerId = account.revenueCatAppUserId;
    if (!account.linked || ownerId == null) return false;
    await RevenueCatService.initialize(appUserId: ownerId);
    return true;
  }

  Future<void> _onPremiumPressed() async {
    if (_isPremium) {
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SubscriptionPage()),
      );
      await _refreshPremium();
      await _refreshAiQuota();
      return;
    }

    final action = await Navigator.of(context).push<PremiumOfferAction>(
      MaterialPageRoute(builder: (_) => const PremiumOfferPage()),
    );
    if (!mounted) return;
    switch (action) {
      case PremiumOfferAction.plans:
        await _openPaywall();
      case PremiumOfferAction.restore:
        await _restorePurchases();
      case null:
        break;
    }
  }

  Future<void> _finishPurchaseSync({required bool restored}) async {
    final status = await _premiumService.reconcile();
    final account = await PremiumAccountService(_api).status();
    if (account.linked && !account.activeOnThisDevice && mounted) {
      // Restoring/buying never silently revokes another phone. The user confirms activation.
      await _openAccountDevicePage(fromPurchase: true);
    }
    await _refreshPremium();
    await _refreshAiQuota();
    if (!mounted) return;
    final key = _isPremium
        ? (restored ? 'premium.restoreSuccess' : 'premium.activated')
        : _subscriptionPending
            ? 'premium.activating'
            : !status.syncAvailable
                ? 'premium.syncUnavailable'
                : status.syncPending
                    ? 'premium.activating'
                    : 'premium.notActive';
    if (_isPremium) {
      unawaited(AnalyticsService.premiumActivated(
              source: restored ? 'restore' : 'paywall')
          .catchError((Object _) {}));
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).t(key))),
    );
  }

  Future<void> _restorePurchases() async {
    if (!_ready || _isBusy || _sessionInvalid) return;
    setState(() => _subscriptionLoading = true);
    try {
      if (!await _ensurePremiumAccount()) return;
      final info = await RevenueCatService.restorePurchases();
      await _setPurchasePending(
          info.entitlements.active.containsKey(PremiumService.entitlementId));
      await _finishPurchaseSync(restored: true);
    } catch (error) {
      _recordSessionError(error);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(AppLocalizations.of(context)
                  .t(apiErrorKey(error, fallback: 'premium.restoreNotReady')))),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _subscriptionLoading = false);
        unawaited(_drainSharedInputs());
      }
    }
  }

  Future<void> _openPaywall() async {
    if (!_ready || _isBusy || _sessionInvalid) return;
    setState(() => _subscriptionLoading = true);
    try {
      if (!await _ensurePremiumAccount()) return;
      unawaited(AnalyticsService.paywallOpened().catchError((Object _) {}));
      final changed = await _premiumService.presentPaywallIfNeeded();
      if (changed && mounted) {
        await _setPurchasePending(true);
        await _finishPurchaseSync(restored: false);
      }
    } catch (error) {
      _recordSessionError(error);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(AppLocalizations.of(context)
                  .t(apiErrorKey(error, fallback: 'errors.paywall')))),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _subscriptionLoading = false);
        unawaited(_drainSharedInputs());
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _shareIntentChannel.setMethodCallHandler(null);
    _controller.dispose();
    _resultScroll.dispose();
    _textRecognizer.close();
    _imageForensicsService.dispose();
    if (_apiInitialized) _api.close();
    super.dispose();
  }

  void _revealCompletedResult() {
    FocusManager.instance.primaryFocus?.unfocus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_resultScroll.hasClients) return;
      void reveal() {
        final context = _resultKey.currentContext;
        if (mounted && context != null) {
          unawaited(Scrollable.ensureVisible(context,
              alignment: 0, duration: const Duration(milliseconds: 200)));
        }
      }

      if (_resultKey.currentContext != null) {
        reveal();
        return;
      }
      // Build the result item when it was outside the lazy ListView viewport.
      _resultScroll.jumpTo(_resultScroll.position.maxScrollExtent);
      WidgetsBinding.instance.addPostFrameCallback((_) => reveal());
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('app.title')),
        actions: [
          IconButton(
            onPressed: _ready && !_isBusy && !_sessionInvalid
                ? () => _openAccountDevicePage()
                : null,
            icon: Icon(_accountLinked
                ? Icons.verified_user_outlined
                : Icons.manage_accounts_outlined),
            tooltip: t.t('account.title'),
          ),
          IconButton(
            onPressed: (_bootstrapping || _isBusy)
                ? null
                : () async {
                    if (!_ready) {
                      _bootstrapFuture = _bootstrap();
                      await _bootstrapFuture;
                      unawaited(_drainSharedInputs());
                    } else {
                      await _refreshScreenState();
                    }
                  },
            icon: const Icon(Icons.refresh),
            tooltip: t.t('actions.refresh'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          controller: _resultScroll,
          padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 24),
          children: [
            BrandHero(
                title: t.t('ui.scanHeadline'), subtitle: t.t('scan.subtitle')),
            const SizedBox(height: 4),
            Text(
              t.t(
                'scan.maxLength',
                params: {
                  'max': _maxInputLength.toString(),
                },
              ),
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 16),
            BrandPanel(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                  Text(t.t('scan.input.label'),
                      style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Semantics(
                      label: t.t('scan.input.label'),
                      child: TextField(
                        controller: _controller,
                        minLines: 3,
                        maxLines: 3,
                        maxLength: _maxInputLength,
                        decoration: InputDecoration(
                          hintText: t.t('scan.example'),
                          hintMaxLines: _examplePlaceholderMaxLines,
                          suffixIcon: IconButton(
                            tooltip: MaterialLocalizations.of(context)
                                .pasteButtonLabel,
                            onPressed: _isBusy ? null : _pasteInput,
                            icon: const Icon(Icons.content_paste_outlined),
                          ),
                        ),
                        textAlign: TextAlign.start,
                      )),
                  const SizedBox(height: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        child: FilledButton(
                          onPressed: (!_ready ||
                                  _controller.text.trim().isEmpty ||
                                  _sessionInvalid ||
                                  _subscriptionPending ||
                                  _isBusy ||
                                  _isWeeklyScanLimitReached ||
                                  _hasVisibleMatchingTextResult)
                              ? null
                              : _scan,
                          child: _loading
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : Text(t.t('scan.button')),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_hasInput)
                        OutlinedButton.icon(
                          onPressed: _isBusy ? null : _clear,
                          icon: const Icon(Icons.delete_outline),
                          label: Text(t.t('actions.clear')),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ])),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: (_isBusy || !_canAnalyzeMedia) ? null : _analyzeImage,
              icon: _imageScanLoading
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.image_outlined),
              label: Text(t.t(_imageScanLoading
                  ? 'scan.image.extracting'
                  : 'scan.media.image')),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: (_isBusy || !_canAnalyzeMedia) ? null : _analyzeVideo,
              icon: _videoScanLoading
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.video_library_outlined),
              label: Text(t.t(_videoScanLoading
                  ? 'scan.video.analyzing'
                  : 'scan.media.video')),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 6),
              child: Text(t.t('scan.video.maxDuration')),
            ),
            if (_subscriptionPending)
              Padding(
                padding: const EdgeInsetsDirectional.only(top: 6),
                child: Text(t.t('premium.activating')),
              ),
            if (_ready &&
                !_sessionInvalid &&
                !_isPremium &&
                !_canAnalyzeMedia &&
                !_subscriptionPending)
              Padding(
                padding: const EdgeInsetsDirectional.only(top: 8),
                child: Text(t.t(_isWeeklyScanLimitReached
                    ? 'errors.weeklyLimitExceeded'
                    : 'scan.media.freeRestriction')),
              ),
            const SizedBox(height: 12),
            const SizedBox(height: 8),
            _AiQuotaHint(
              isPremium: _isPremium,
              lastResult: _lastResult,
              quota: _aiQuota,
            ),
            const SizedBox(height: 4),
            _WeeklyQuotaHint(
              isPremium: _isPremium,
              lastResult: _lastResult,
              quota: _aiQuota,
            ),
            if (!_isPremium && _aiQuota?.resetAt != null)
              WeeklyResetHint(
                resetAt: _aiQuota!.resetAt!,
                timeZone: _aiQuota!.timeZone ?? _api.timeZone,
              ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: (!_ready || _sessionInvalid || _isBusy)
                  ? null
                  : _onPremiumPressed,
              icon: const Icon(Icons.workspace_premium_outlined),
              label: Text(
                  _isPremium ? t.t('subscription.title') : t.t('premium.cta')),
            ),
            TextButton(
              onPressed: (!_ready || _sessionInvalid || _isBusy)
                  ? null
                  : _restorePurchases,
              child: Text(t.t('premium.restore')),
            ),
            const SizedBox(height: 6),
            if (_noticeKey != null)
              Container(
                padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.amber.withValues(alpha: 0.12),
                  border: Border.all(
                    color: Colors.amber.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  t.t(_noticeKey!),
                  style: const TextStyle(color: ShieldDesign.amber),
                  textAlign: TextAlign.start,
                ),
              ),
            if (_noticeKey != null) const SizedBox(height: 10),
            if (_errorKey != null)
              Text(
                t.t(_errorKey!),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (_errorMessage != null)
              Text(
                _errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 6),
            if (_videoAnalysisResult != null ||
                _mediaAnalysisResult != null ||
                _lastResult != null)
              KeyedSubtree(
                key: _resultKey,
                child: Column(children: [
                  if (_hasUnreadableHiddenContent)
                    Card(
                        child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(t.t('result.hiddenContentUnreadable')),
                    )),
                  if (_videoAnalysisResult != null)
                    VideoAnalysisCard(result: _videoAnalysisResult!),
                  if (_mediaAnalysisResult != null)
                    MediaAnalysisCard(result: _mediaAnalysisResult!),
                  if (_lastResult != null) ScanResultCard(result: _lastResult!),
                ]),
              ),
          ],
        ),
      ),
    );
  }
}

class VideoAnalysisCard extends StatelessWidget {
  const VideoAnalysisCard({super.key, required this.result});

  final VideoAnalysisResult result;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final evidence = result.forensics;
    final analysis = result.analysis;

    return Card(
      margin: const EdgeInsetsDirectional.only(top: 0, bottom: 12),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('videoAnalysis.title'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.start,
            ),
            if (result.isProcessing) ...[
              const SizedBox(height: 14),
              const LinearProgressIndicator(),
              const SizedBox(height: 10),
              Text(
                t.t('videoAnalysis.processing'),
                textAlign: TextAlign.start,
              ),
            ] else ...[
              if (analysis != null) ...[
                const SizedBox(height: 14),
                Text(
                  t.t('mediaAnalysis.fraud.title'),
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.start,
                ),
                const SizedBox(height: 8),
                RiskOverview(
                    score: analysis.riskScore,
                    category: analysis.category,
                    label: t.t('result.riskScore'),
                    categoryLabel: t.t('categories.${analysis.category}')),
                const SizedBox(height: 6),
                _riskRow(
                  context,
                  t.t('result.category'),
                  t.t('categories.${analysis.category}'),
                  analysis.category,
                ),
                const SizedBox(height: 6),
                _riskRow(
                  context,
                  t.t('result.threatType'),
                  t.t('threatTypes.${analysis.threatType}'),
                  analysis.category,
                ),
                if (analysis.reasons.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    t.t('result.reasons'),
                    style: Theme.of(context).textTheme.labelLarge,
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 4),
                  ...analysis.reasons.map(_bullet),
                ],
                if (analysis.explanation.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text(
                    t.t('mediaAnalysis.explanation'),
                    style: Theme.of(context).textTheme.labelLarge,
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    analysis.explanation,
                    textAlign: TextAlign.start,
                  ),
                ],
              ],
              if (analysis != null && evidence != null) ...[
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 12),
              ],
              if (evidence != null) ...[
                _detectionRow(
                  context,
                  label: t.t('videoAnalysis.aiGenerated'),
                  status: evidence.aiGeneratedStatus,
                ),
                if (evidence.maxAiGeneratedScore != null) ...[
                  const SizedBox(height: 6),
                  _valueRow(
                    context,
                    t.t('videoAnalysis.maxScore'),
                    _formatScore(evidence.maxAiGeneratedScore!),
                  ),
                ],
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                _detectionRow(
                  context,
                  label: t.t('videoAnalysis.deepfake'),
                  status: evidence.deepfakeStatus,
                ),
                if (evidence.maxDeepfakeScore != null) ...[
                  const SizedBox(height: 6),
                  _valueRow(
                    context,
                    t.t('videoAnalysis.maxScore'),
                    _formatScore(evidence.maxDeepfakeScore!),
                  ),
                ],
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                _detectionRow(
                  context,
                  label: t.t('videoAnalysis.audioAiGenerated'),
                  status: evidence.audioAiGeneratedStatus,
                ),
                if (evidence.maxAiGeneratedAudioScore != null) ...[
                  const SizedBox(height: 6),
                  _valueRow(context, t.t('videoAnalysis.maxScore'),
                      _formatScore(evidence.maxAiGeneratedAudioScore!)),
                ],
                if (evidence.topGenerator != null) ...[
                  const SizedBox(height: 14),
                  _valueRow(
                    context,
                    t.t('videoAnalysis.topGenerator'),
                    '${evidence.topGenerator!.name} '
                    '(${_formatScore(evidence.topGenerator!.score)})',
                  ),
                ],
                if (evidence.suspiciousTimestamps.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text(
                    t.t('videoAnalysis.suspiciousMoments'),
                    style: Theme.of(context).textTheme.labelLarge,
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    evidence.suspiciousTimestamps
                        .map(_formatTimestamp)
                        .join(', '),
                    textAlign: TextAlign.start,
                  ),
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _riskRow(
    BuildContext context,
    String label,
    String value,
    String category,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    final Color color = switch (category) {
      'low_risk' => ShieldDesign.mint,
      'medium_risk' => ShieldDesign.amber,
      'high_risk' => colorScheme.error,
      'inconclusive' => ShieldDesign.sky,
      _ => Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black,
    };

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                ),
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('\u2022 '),
          Expanded(
            child: Text(
              text,
              textAlign: TextAlign.start,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detectionRow(
    BuildContext context, {
    required String label,
    required String status,
  }) {
    final t = AppLocalizations.of(context);
    final colorScheme = Theme.of(context).colorScheme;

    final backgroundColor = switch (status) {
      'detected' => colorScheme.error,
      'not_detected' => ShieldDesign.mint,
      _ => ShieldDesign.sky,
    };
    final foregroundColor =
        status == 'detected' ? colorScheme.onError : ShieldDesign.midnight;

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
            child: Container(
          padding: const EdgeInsetsDirectional.fromSTEB(10, 4, 10, 4),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            t.t(switch (status) {
              'detected' => 'videoAnalysis.detected',
              'not_detected' => 'videoAnalysis.notDetected',
              'unavailable' => 'videoAnalysis.unavailable',
              _ => 'videoAnalysis.inconclusive',
            }),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: foregroundColor,
                  fontWeight: FontWeight.w700,
                ),
          ),
        )),
      ],
    );
  }

  Widget _valueRow(
    BuildContext context,
    String label,
    String value,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }

  String _formatScore(double score) {
    return '${(score * 100).toStringAsFixed(1)}%';
  }

  String _formatTimestamp(double seconds) {
    final wholeSeconds = seconds.floor();
    final minutes = wholeSeconds ~/ 60;
    final remainingSeconds = wholeSeconds % 60;

    return '${minutes.toString().padLeft(2, '0')}:'
        '${remainingSeconds.toString().padLeft(2, '0')}';
  }
}

class MediaAnalysisCard extends StatelessWidget {
  const MediaAnalysisCard({super.key, required this.result});

  final MediaAnalysisResult result;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      margin: const EdgeInsetsDirectional.only(top: 0),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(
                child: Icon(Icons.image_search_outlined,
                    color: ShieldDesign.cyan, size: 42)),
            const SizedBox(height: 14),
            Text(
              t.t('mediaAnalysis.title'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 14),
            Text(
              t.t('mediaAnalysis.authenticity.title'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 8),
            _assessmentRow(
              context,
              t.t('mediaAnalysis.authenticity.assessment'),
              t.t('mediaAnalysis.authenticity.${result.authenticity}'),
              _authenticityLevel(result.authenticity),
            ),
            const SizedBox(height: 6),
            _confidenceRow(
              context,
              t.t('mediaAnalysis.confidence'),
              t.t(
                'mediaAnalysis.confidence.${result.authenticityConfidence}',
              ),
            ),
            if (result.authenticityReasons.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                t.t('mediaAnalysis.reasons'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 4),
              ...result.authenticityReasons.map(_bullet),
            ],
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 12),
            Text(
              t.t('mediaAnalysis.fraud.title'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 8),
            _assessmentRow(
              context,
              t.t('mediaAnalysis.fraud.assessment'),
              t.t('mediaAnalysis.fraud.${result.fraudAssessment}'),
              _fraudLevel(result.fraudAssessment),
            ),
            const SizedBox(height: 6),
            _confidenceRow(
              context,
              t.t('mediaAnalysis.confidence'),
              t.t('mediaAnalysis.confidence.${result.fraudConfidence}'),
            ),
            if (result.fraudReasons.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                t.t('mediaAnalysis.reasons'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 4),
              ...result.fraudReasons.map(_bullet),
            ],
            if (result.explanation.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(
                t.t('mediaAnalysis.explanation'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 6),
              Text(
                result.explanation,
                textAlign: TextAlign.start,
              ),
            ],
            if (result.disclaimer.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.amber.withValues(alpha: 0.12),
                  border: Border.all(
                    color: Colors.amber.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  result.disclaimer,
                  style: const TextStyle(color: ShieldDesign.amber),
                  textAlign: TextAlign.start,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _authenticityLevel(String authenticity) {
    return switch (authenticity) {
      'likely_authentic' => 'low',
      'manipulated_or_synthetic' => 'high',
      _ => 'undetermined',
    };
  }

  String _fraudLevel(String fraudAssessment) {
    return switch (fraudAssessment) {
      'no_clear_signals' => 'low',
      'possible_fraud' => 'medium',
      'strong_fraud_signals' => 'high',
      _ => 'undetermined',
    };
  }

  Widget _assessmentRow(
    BuildContext context,
    String label,
    String value,
    String level,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    final Color backgroundColor;
    final Color foregroundColor;

    switch (level) {
      case 'high':
        backgroundColor = colorScheme.error;
        foregroundColor = colorScheme.onError;
      case 'medium':
        backgroundColor = Colors.amber.shade600;
        foregroundColor = Colors.black87;
      case 'low':
        backgroundColor = ShieldDesign.mint;
        foregroundColor = ShieldDesign.midnight;
      default:
        backgroundColor = colorScheme.surfaceContainerHighest;
        foregroundColor = colorScheme.onSurfaceVariant;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Container(
            padding: const EdgeInsetsDirectional.fromSTEB(10, 4, 10, 4),
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: foregroundColor,
                    fontWeight: FontWeight.w700,
                  ),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ],
    );
  }

  Widget _confidenceRow(
    BuildContext context,
    String label,
    String value,
  ) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
            child: Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        )),
      ],
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('\u2022 '),
          Expanded(
            child: Text(
              text,
              textAlign: TextAlign.start,
            ),
          ),
        ],
      ),
    );
  }
}

class ScanResultCard extends StatelessWidget {
  const ScanResultCard({super.key, required this.result});

  final ScanResult result;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      margin: const EdgeInsetsDirectional.only(top: 0),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('result.title'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 10),
            RiskOverview(
              score: result.isInconclusive ? null : result.riskScore,
              category:
                  result.isInconclusive ? 'inconclusive' : result.category,
              label: t.t('result.riskScore'),
              categoryLabel: t.t(
                  'categories.${result.isInconclusive ? 'inconclusive' : result.category}'),
            ),
            const SizedBox(height: 4),
            _categoryRow(
              context,
              t.t('result.category'),
              t.t('categories.${result.isInconclusive ? 'inconclusive' : result.category}'),
              result.isInconclusive ? 'inconclusive' : result.category,
            ),
            const SizedBox(height: 4),
            _categoryRow(
              context,
              t.t('result.threatType'),
              t.t('threatTypes.${result.threatType}'),
              result.category,
            ),
            if (result.hasLimitedLanguageCoverage)
              Padding(
                padding: const EdgeInsetsDirectional.only(top: 10, bottom: 4),
                child: Text(t.t('result.limitedLanguageCoverage'),
                    key: const ValueKey('limited-language-coverage'),
                    style: const TextStyle(color: ShieldDesign.amber)),
              ),
            const SizedBox(height: 10),
            Text(
              t.t('result.reasons'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 4),
            ...result.reasons.map(
              (r) => Padding(
                padding: const EdgeInsetsDirectional.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('\u2022 '),
                    Expanded(
                      child: Text(
                        _formatReason(t, r),
                        textAlign: TextAlign.start,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              t.t('result.actions'),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.start,
            ),
            const SizedBox(height: 4),
            ..._buildActionBullets(t),
            if (result.category != 'low_risk') ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(text: _buildSafetyAdvice(t)),
                      );

                      if (!context.mounted) return;

                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(t.t('result.copyAdvice.copied')),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy),
                    label: Text(t.t('result.copyAdvice.button')),
                  ),
                  OutlinedButton.icon(
                    onPressed: () async {
                      await SharePlus.instance.share(
                        ShareParams(text: _buildSafetyAdvice(t)),
                      );
                    },
                    icon: const Icon(Icons.ios_share),
                    label: Text(t.t('result.shareAdvice.button')),
                  ),
                  OutlinedButton.icon(
                    onPressed: () {
                      _showVerificationChecklist(context, t);
                    },
                    icon: const Icon(Icons.checklist),
                    label: Text(t.t('result.checklist.button')),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showVerificationChecklist(
    BuildContext context,
    AppLocalizations t,
  ) {
    final checklistItems =
        result.category == 'low_risk' || result.isInconclusive
            ? [
                t.t('result.checklist.low.sender'),
                t.t('result.checklist.low.links'),
                t.t('result.checklist.low.requests'),
              ]
            : [
                t.t('result.checklist.risky.doNotClick'),
                t.t('result.checklist.risky.officialWebsite'),
                t.t('result.checklist.risky.contactProvider'),
                t.t('result.checklist.risky.neverShareCodes'),
                t.t('result.checklist.risky.report'),
              ];

    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(t.t('result.checklist.title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: checklistItems
                .map(
                  (item) => Padding(
                    padding: const EdgeInsetsDirectional.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.check_circle_outline, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            item,
                            textAlign: TextAlign.start,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: Text(t.t('actions.close')),
            ),
          ],
        );
      },
    );
  }

  List<String> _buildActionTexts(AppLocalizations t) {
    return buildScanActionAdviceContent(
      result: result,
      translate: (key) => t.t(key),
      formatReason: (reason) => _formatReason(t, reason),
    ).actions;
  }

  List<Widget> _buildActionBullets(AppLocalizations t) {
    return _buildActionTexts(t).map(_bullet).toList();
  }

  String _buildSafetyAdvice(AppLocalizations t) {
    return buildScanActionAdviceContent(
      result: result,
      translate: (key) => t.t(key),
      formatReason: (reason) => _formatReason(t, reason),
    ).safetyAdvice;
  }

  String _formatReason(AppLocalizations t, String reason) {
    const heuristicReasons = {
      'URGENT_REQUEST',
      'MONEY_REQUEST',
      'CRYPTO_REQUEST',
      'GIFT_CARD_REQUEST',
      'PASSWORD_OTP_REQUEST',
      'REMOTE_ACCESS_REQUEST',
      'UNKNOWN_SENDER',
      'SUSPICIOUS_LINK',
      'SHORTENED_URL',
      'SHORTENER',
      'LOOKALIKE_DOMAIN',
      'URL_TYPO',
      'SUSPICIOUS_PATH',
      'THREAT_LANGUAGE',
      'IMPERSONATION',
      'TOO_GOOD_TO_BE_TRUE',
      'SENSITIVE_DATA',
      'URGENCY_LANGUAGE',
      'SUSPICIOUS_TLD',
      'IP_URL',
      'MANY_SUBDOMAINS',
    };

    if (heuristicReasons.contains(reason)) {
      return t.t('reasons.$reason');
    }

    return reason.replaceFirst(RegExp(r'^reasons\.', caseSensitive: false), '');
  }

  Widget _categoryRow(
    BuildContext context,
    String label,
    String value,
    String category,
  ) {
    final colorScheme = Theme.of(context).colorScheme;

    final Color color = switch (category) {
      'low_risk' => ShieldDesign.mint,
      'medium_risk' => ShieldDesign.amber,
      'high_risk' => colorScheme.error,
      'inconclusive' => ShieldDesign.sky,
      _ => Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black,
    };

    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge,
            textAlign: TextAlign.start,
          ),
        ),
        Flexible(
            child: Text(
          value,
          textAlign: TextAlign.end,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        )),
      ],
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('\u2022 '),
          Expanded(child: Text(text, textAlign: TextAlign.start)),
        ],
      ),
    );
  }
}

class _AiQuotaHint extends StatelessWidget {
  const _AiQuotaHint({
    required this.isPremium,
    required this.lastResult,
    required this.quota,
  });

  final bool isPremium;
  final ScanResult? lastResult;
  final AiQuotaStatus? quota;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (isPremium) {
      return Align(
        alignment: AlignmentDirectional.centerStart,
        child: Text(
          t.t('scan.aiQuota.unlimited'),
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.start,
        ),
      );
    }

    final remaining = quota?.aiWeeklyRemaining ?? lastResult?.aiWeeklyRemaining;
    final limit = quota?.aiWeeklyLimit ?? lastResult?.aiWeeklyLimit;

    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        t.t(
          'scan.aiQuota.free',
          params: {
            'remaining': remaining?.toString() ?? '?',
            'limit': limit?.toString() ?? '?',
          },
        ),
        style: Theme.of(context).textTheme.bodySmall,
        textAlign: TextAlign.start,
      ),
    );
  }
}

class _WeeklyQuotaHint extends StatelessWidget {
  const _WeeklyQuotaHint({
    required this.isPremium,
    required this.lastResult,
    required this.quota,
  });

  final bool isPremium;
  final ScanResult? lastResult;
  final AiQuotaStatus? quota;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (isPremium) {
      return const SizedBox.shrink();
    }

    final remaining = quota?.totalWeeklyRemaining ??
        lastResult?.totalWeeklyRemaining ??
        ((quota?.weeklyRemaining ?? 0) + (quota?.aiWeeklyRemaining ?? 0));
    final limit = quota?.totalWeeklyLimit ??
        lastResult?.totalWeeklyLimit ??
        ((quota?.weeklyLimit ?? 2) + (quota?.aiWeeklyLimit ?? 1));

    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        t.t(
          'ui.weeklyAllowance',
          params: {
            'remaining': remaining.toString(),
            'limit': limit.toString(),
          },
        ),
        style: Theme.of(context).textTheme.bodySmall,
        textAlign: TextAlign.start,
      ),
    );
  }
}
