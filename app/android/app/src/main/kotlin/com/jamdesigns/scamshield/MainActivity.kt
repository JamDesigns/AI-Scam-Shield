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
    private var pendingSharedImagePath: String? = null

    companion object {
        private var lastDeliveredSharedText: String? = null
        private var lastDeliveredSharedImagePath: String? = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        pendingSharedText = getSharedTextFromIntent(intent)
        pendingSharedImagePath = copySharedImageFromIntent(intent)

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
                "getInitialSharedImagePath" -> result.success(pendingSharedImagePath)
                "clearInitialSharedImagePath" -> {
                    pendingSharedImagePath = null
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

        val sharedImagePath = copySharedImageFromIntent(intent)
        if (sharedImagePath.isNullOrBlank()) {
            return
        }

        if (sharedImagePath == lastDeliveredSharedImagePath) {
            return
        }

        pendingSharedImagePath = sharedImagePath
        lastDeliveredSharedImagePath = sharedImagePath

        flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
            MethodChannel(messenger, channelName)
                .invokeMethod("onSharedImage", sharedImagePath)
        }
    }

    private fun getSharedTextFromIntent(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) {
            return null
        }

        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
    }

    private fun copySharedImageFromIntent(intent: Intent?): String? {
        if (intent == null) {
            return null
        }

        val uri = getSharedImageUri(intent) ?: return null
        val extension = getImageExtension(uri)
        val destination = File(cacheDir, "shared-image-${System.currentTimeMillis()}.$extension")

        return try {
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(destination).use { output ->
                    input.copyTo(output)
                }
            }

            destination.absolutePath
        } catch (_: Exception) {
            null
        }
    }

    private fun getSharedImageUri(intent: Intent): Uri? {
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) {
            return null
        }

        val type = intent.type ?: return null
        if (!type.startsWith("image/")) {
            return null
        }

        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            val streams = getSharedImageStreams(intent)
            return streams.firstOrNull()
        }

        return getSharedImageStream(intent)
    }

    @Suppress("DEPRECATION")
    private fun getSharedImageStream(intent: Intent): Uri? {
        return intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }

    @Suppress("DEPRECATION")
    private fun getSharedImageStreams(intent: Intent): ArrayList<Uri> {
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM) ?: arrayListOf()
    }

    private fun getImageExtension(uri: Uri): String {
        val mimeType = contentResolver.getType(uri)

        return when (mimeType) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            else -> "jpg"
        }
    }
}
