package com.jamdesigns.scamshield

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterFragmentActivity() {
    private val channelName = "com.jamdesigns.scamshield/share_intent"
    private var pendingSharedText: String? = null
    private var pendingSharedMedia: Map<String, String>? = null

    companion object {
        private var lastDeliveredSharedText: String? = null
        private var lastDeliveredSharedMediaUri: String? = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        pendingSharedText = getSharedTextFromIntent(intent)
        pendingSharedMedia = copySharedMediaFromIntent(intent)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            channelName,
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "getInitialSharedText" -> result.success(pendingSharedText)
                "clearInitialSharedText" -> {
                    pendingSharedText = null
                    result.success(null)
                }

                "getInitialSharedMedia" -> result.success(pendingSharedMedia)
                "clearInitialSharedMedia" -> {
                    pendingSharedMedia = null
                    result.success(null)
                }

                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)

        val sharedText = getSharedTextFromIntent(intent)
        if (!sharedText.isNullOrBlank()) {
            if (sharedText == lastDeliveredSharedText) {
                return
            }

            pendingSharedText = sharedText
            lastDeliveredSharedText = sharedText

            flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                MethodChannel(messenger, channelName)
                    .invokeMethod("onSharedText", sharedText)
            }

            return
        }

        val mediaUri = getSharedMediaUri(intent) ?: return
        val mediaUriKey = mediaUri.toString()

        if (mediaUriKey == lastDeliveredSharedMediaUri) {
            return
        }

        val sharedMedia = copySharedMedia(mediaUri, intent.type) ?: return

        pendingSharedMedia = sharedMedia
        lastDeliveredSharedMediaUri = mediaUriKey

        flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
            MethodChannel(messenger, channelName)
                .invokeMethod("onSharedMedia", sharedMedia)
        }
    }

    private fun getSharedTextFromIntent(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) {
            return null
        }

        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
    }

    private fun copySharedMediaFromIntent(intent: Intent?): Map<String, String>? {
        if (intent == null) {
            return null
        }

        val uri = getSharedMediaUri(intent) ?: return null
        return copySharedMedia(uri, intent.type)
    }

    private fun copySharedMedia(
        uri: Uri,
        intentMimeType: String?,
    ): Map<String, String>? {
        val mimeType = resolveMediaMimeType(uri, intentMimeType) ?: return null
        val extension = getMediaExtension(mimeType)
        val destination = File(
            cacheDir,
            "shared-media-${System.currentTimeMillis()}.$extension",
        )

        return try {
            val copied = contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(destination).use { output ->
                    input.copyTo(output)
                }
                true
            } ?: false

            if (!copied) {
                null
            } else {
                mapOf(
                    "path" to destination.absolutePath,
                    "mimeType" to mimeType,
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getSharedMediaUri(intent: Intent): Uri? {
        if (
            intent.action != Intent.ACTION_SEND &&
            intent.action != Intent.ACTION_SEND_MULTIPLE
        ) {
            return null
        }

        val type = intent.type ?: return null
        if (!type.startsWith("image/") && !type.startsWith("video/")) {
            return null
        }

        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            return getSharedMediaStreams(intent).firstOrNull()
        }

        return getSharedMediaStream(intent)
    }

    @Suppress("DEPRECATION")
    private fun getSharedMediaStream(intent: Intent): Uri? {
        return intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }

    @Suppress("DEPRECATION")
    private fun getSharedMediaStreams(intent: Intent): ArrayList<Uri> {
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
            ?: arrayListOf()
    }

    private fun resolveMediaMimeType(
        uri: Uri,
        intentMimeType: String?,
    ): String? {
        val resolverMimeType = contentResolver.getType(uri)

        val candidates = listOfNotNull(
            resolverMimeType,
            intentMimeType,
        )

        return candidates.firstOrNull {
            it.startsWith("image/") || it.startsWith("video/")
        }
    }

    private fun getMediaExtension(mimeType: String): String {
        return when (mimeType.lowercase()) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/gif" -> "gif"
            "video/webm" -> "webm"
            "video/x-m4v",
            "video/m4v" -> "m4v"
            else -> if (mimeType.startsWith("video/")) "mp4" else "jpg"
        }
    }
}
