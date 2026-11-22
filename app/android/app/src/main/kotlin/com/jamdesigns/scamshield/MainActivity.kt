package com.jamdesigns.scamshield

import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.util.TimeZone
import java.util.Date
import java.util.Locale
import java.text.DateFormat
import java.util.UUID
import java.util.concurrent.Executors

class MainActivity : FlutterFragmentActivity() {
    private val channelName = "com.jamdesigns.scamshield/share_intent"
    private val mediaIo = Executors.newSingleThreadExecutor()
    private var initialSharedIntent: Intent? = null
    private var shareChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        initialSharedIntent = intent.takeIf { isShareIntent(it) }
        shareChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
        shareChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "getInitialSharedContent" -> {
                    val initial = initialSharedIntent
                    initialSharedIntent = null
                    if (initial == null) result.success(null)
                    else resolveSharedContent(initial) {
                        clearDeliveredIntent(initial)
                        result.success(it)
                    }
                }
                "getTimeZone" -> result.success(TimeZone.getDefault().id)
                "formatZonedDateTime" -> {
                    val epoch = call.argument<Number>("epochMillis")?.toLong()
                    val zone = call.argument<String>("timeZone")
                    val language = call.argument<String>("language") ?: "en-GB"
                    if (epoch == null || zone == null ||
                        !TimeZone.getAvailableIDs().contains(zone)) {
                        result.error("invalid_time_zone", null, null)
                    } else {
                        val formatter = DateFormat.getDateTimeInstance(
                            DateFormat.MEDIUM, DateFormat.SHORT,
                            Locale.forLanguageTag(language),
                        )
                        formatter.timeZone = TimeZone.getTimeZone(zone)
                        result.success(formatter.format(Date(epoch)))
                    }
                }
                "getVideoDurationMillis" -> {
                    val path = call.argument<String>("path")
                    if (path.isNullOrBlank()) {
                        result.error("invalid_video", null, null)
                    } else {
                        mediaIo.execute {
                            val retriever = MediaMetadataRetriever()
                            try {
                                retriever.setDataSource(path)
                                val duration = retriever.extractMetadata(
                                    MediaMetadataRetriever.METADATA_KEY_DURATION,
                                )?.toLongOrNull()
                                runOnUiThread {
                                    if (duration == null || duration <= 0)
                                        result.error("invalid_video", null, null)
                                    else result.success(duration)
                                }
                            } catch (_: Exception) {
                                runOnUiThread { result.error("invalid_video", null, null) }
                            } finally {
                                retriever.release()
                            }
                        }
                    }
                }
                "releaseSharedFile" -> {
                    val path = call.argument<String>("path")
                    mediaIo.execute {
                        try {
                            val file = path?.let { File(it).canonicalFile }
                            val root = cacheDir.canonicalFile
                            if (file != null && file.parentFile == root &&
                                file.name.startsWith("shared-media-")) file.delete()
                        } catch (_: Exception) {
                            // Best-effort cleanup of copied files only.
                        }
                        runOnUiThread { result.success(null) }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (isShareIntent(intent)) {
            resolveSharedContent(intent) { content ->
                clearDeliveredIntent(intent)
                shareChannel?.invokeMethod("onSharedContent", content)
            }
        }
    }

    private fun isShareIntent(intent: Intent): Boolean =
        intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE

    private fun clearDeliveredIntent(delivered: Intent) {
        if (intent === delivered) {
            setIntent(Intent(Intent.ACTION_MAIN).setClass(this, MainActivity::class.java))
        }
    }

    private fun resolveSharedContent(intent: Intent, deliver: (Map<String, Any>) -> Unit) {
        // Copy large shared files away from the Android UI thread. The URI grant
        // is held while this Activity owns the incoming Intent.
        mediaIo.execute {
            val content = try {
                buildSharedContent(intent)
            } catch (_: Exception) {
                mapOf<String, Any>(
                    "eventId" to UUID.randomUUID().toString(),
                    "errorCode" to "shared_media_unreadable",
                )
            }
            runOnUiThread { deliver(content) }
        }
    }

    private fun buildSharedContent(intent: Intent): Map<String, Any> {
        val content = mutableMapOf<String, Any>("eventId" to UUID.randomUUID().toString())
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
        if (!text.isNullOrBlank()) content["text"] = text

        val streams = getStreams(intent)
        if (streams.size > 1 || (intent.action == Intent.ACTION_SEND_MULTIPLE && streams.isEmpty())) {
            content["errorCode"] = "multiple_items_not_supported"
            return content
        }

        val uri = streams.singleOrNull()
        if (uri == null) {
            if (text.isNullOrBlank()) content["errorCode"] = "unsupported_shared_content"
            return content
        }

        val mimeType = listOfNotNull(contentResolver.getType(uri), intent.type)
            .firstOrNull { it.startsWith("image/") || it.startsWith("video/") }
        if (mimeType == null) {
            content["errorCode"] = "unsupported_shared_content"
            return content
        }
        val extension = when (mimeType.lowercase()) {
            "image/png" -> "png"
            "image/bmp", "image/x-ms-bmp" -> "bmp"
            "image/webp" -> "webp"
            "image/gif" -> "gif"
            "image/heic", "image/heif" -> "heic"
            "video/webm" -> "webm"
            "video/x-m4v", "video/m4v" -> "m4v"
            "video/quicktime" -> "mov"
            else -> if (mimeType.startsWith("video/")) "mp4" else "jpg"
        }
        val destination = File(cacheDir, "shared-media-${UUID.randomUUID()}.$extension")
        try {
            val input = contentResolver.openInputStream(uri)
                ?: throw IllegalStateException("Shared file cannot be opened")
            input.use { source ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > 100L * 1024 * 1024) {
                            throw SharedMediaTooLarge()
                        }
                        output.write(buffer, 0, count)
                    }
                }
            }
            content["path"] = destination.absolutePath
            content["mimeType"] = mimeType
        } catch (_: SharedMediaTooLarge) {
            destination.delete()
            content["errorCode"] = "media_too_large"
        } catch (_: Exception) {
            destination.delete()
            content["errorCode"] = "shared_media_unreadable"
        }
        return content
    }

    @Suppress("DEPRECATION")
    private fun getStreams(intent: Intent): List<Uri> {
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            return intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
        }
        val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (stream != null) return listOf(stream)
        val clip = intent.clipData ?: return emptyList()
        return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
    }

    private class SharedMediaTooLarge : Exception()
}
