package com.jamdesigns.scamshield

import android.content.Intent
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val channelName = "com.jamdesigns.scamshield/share_intent"
    private var pendingSharedText: String? = null

    companion object {
        private var lastDeliveredSharedText: String? = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        pendingSharedText = getSharedTextFromIntent(intent)

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
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)

        val sharedText = getSharedTextFromIntent(intent)
        if (sharedText.isNullOrBlank()) {
            return
        }

        if (sharedText == lastDeliveredSharedText) {
            return
        }

        pendingSharedText = sharedText
        lastDeliveredSharedText = sharedText

        flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
            MethodChannel(messenger, channelName)
                .invokeMethod("onSharedText", sharedText)
        }
    }

    private fun getSharedTextFromIntent(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) {
            return null
        }

        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
    }
}
