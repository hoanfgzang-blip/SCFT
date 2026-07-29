package com.example.myapplication

import android.app.Activity
import android.content.pm.ActivityInfo
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

private const val PC_SCREEN_STREAM_BASE_URL = "http://127.0.0.1:7878/api/screen/stream"
private const val PC_SCREEN_LATENCY_URL = "http://127.0.0.1:7878/api/screen/latency"
private const val FRAME_INTERVAL_US = 16_666L
private const val PC_SCREEN_LOG_TAG = "SCFT-PC-SCREEN"
private const val READ_BUFFER_BYTES = 128 * 1024
private const val MAX_PENDING_H264_BYTES = 2 * 1024 * 1024
private const val MAX_INPUT_NALS_PER_CYCLE = 32

private val PC_SCREEN_PRESETS = listOf(
    PcScreenPreset("Nhanh", 1080, 920, "6M"),
    PcScreenPreset("2K", 2560, 1440, "24M"),
    PcScreenPreset("720p", 1280, 720, "8M")
)

private data class PcScreenPreset(val label: String, val width: Int, val height: Int, val bitrate: String) {
    fun streamUrl(displayIndex: Int): String = "$PC_SCREEN_STREAM_BASE_URL?display=$displayIndex&fps=60&format=h264&width=$width&height=$height&bitrate=$bitrate"
}

@Composable
fun PcScreenViewerScreen(modifier: Modifier = Modifier, displayIndex: Int = 0, onBack: () -> Unit) {
    var fallback by remember { mutableStateOf(false) }
    if (fallback) {
        JpegPcScreenViewerScreen(modifier, displayIndex, onBack)
    } else {
        H264PcScreenViewer(modifier, displayIndex, onBack) { fallback = true }
    }
}

@Composable
private fun H264PcScreenViewer(modifier: Modifier, displayIndex: Int, onBack: () -> Unit, onFallback: () -> Unit) {
    val view = LocalView.current
    var holder by remember { mutableStateOf<SurfaceHolder?>(null) }
    var player by remember { mutableStateOf<LowLatencyH264Player?>(null) }
    var streaming by remember { mutableStateOf(false) }
    var connecting by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("S\u1eb5n s\u00e0ng nh\u1eadn m\u00e0n h\u00ecnh PC qua USB.") }
    var metrics by remember { mutableStateOf("") }
    var preset by remember { mutableStateOf(PC_SCREEN_PRESETS.first()) }

    fun stopStream() {
        player?.stop()
        player = null
        streaming = false
        connecting = false
        metrics = ""
                status = "\u0110\u00e3 k\u1ebft th\u00fac chi\u1ebfu m\u00e0n h\u00ecnh."
    }

    fun startStream() {
        val surface = holder?.surface
        if (surface == null || !surface.isValid) {
            status = "\u0110ang chu\u1ea9n b\u1ecb m\u00e0n h\u00ecnh..."
            return
        }
        stopStream()
        connecting = true
        status = "\u0110ang k\u1ebft n\u1ed1i m\u00e0n h\u00ecnh PC qua USB..."
        player = LowLatencyH264Player(
            surface = surface,
            preset = preset,
            displayIndex = displayIndex,
            onStarted = {
                connecting = false
                streaming = true
                status = ""
            },
            onStopped = {
                connecting = false
                streaming = false
                status = "\u0110\u00e3 k\u1ebft th\u00fac chi\u1ebfu m\u00e0n h\u00ecnh."
            },
            onStats = {
                metrics = it
            },
            onError = {
                connecting = false
                streaming = false
                onFallback()
            }
        ).also { it.start() }
    }

    BackHandler {
        stopStream()
        onBack()
    }

    DisposableEffect(view) {
        val activity = view.context as? Activity
        val controller = activity?.let { WindowCompat.getInsetsController(it.window, view) }
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            player?.stop()
            player = null
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        AndroidView(
            factory = { context ->
                SurfaceView(context).apply {
                    this.holder.addCallback(object : SurfaceHolder.Callback {
                        override fun surfaceCreated(surfaceHolder: SurfaceHolder) {
                            holder = surfaceHolder
                        }

                        override fun surfaceChanged(surfaceHolder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

                        override fun surfaceDestroyed(surfaceHolder: SurfaceHolder) {
                            holder = null
                            stopStream()
                        }
                    })
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (!streaming) {
            Text(
                text = status,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
            )
        }

        if (streaming && metrics.isNotBlank()) {
            Text(
                text = metrics,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp)
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!streaming && !connecting) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PC_SCREEN_PRESETS.forEach { item ->
                        if (item == preset) {
                            Button(onClick = { preset = item }) { Text(item.label) }
                        } else {
                            OutlinedButton(onClick = { preset = item }) { Text(item.label) }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { startStream() }, enabled = !streaming && !connecting) {
                    Text("B\u1eaft \u0111\u1ea7u")
                }
                OutlinedButton(onClick = { stopStream() }, enabled = streaming || connecting) {
                    Text("K\u1ebft th\u00fac")
                }
                OutlinedButton(onClick = {
                    stopStream()
                    onBack()
                }) {
                    Text("Quay l\u1ea1i")
                }
            }
        }
    }
}

private class LowLatencyH264Player(
    private val surface: Surface,
    private val preset: PcScreenPreset,
    private val displayIndex: Int,
    private val onStarted: () -> Unit,
    private val onStopped: () -> Unit,
    private val onStats: (String) -> Unit,
    private val onError: () -> Unit
) {
    private val running = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var thread: Thread? = null
    private var latencyThread: Thread? = null
    @Volatile private var latestNetworkRttMs = -1L
    private var connection: HttpURLConnection? = null
    private var codec: MediaCodec? = null

    fun start() {
        if (!running.compareAndSet(false, true)) return
        thread = Thread(::run, "scft-low-latency-h264").also { it.start() }
        latencyThread = Thread(::runLatencyProbe, "scft-screen-rtt").also { it.start() }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        closeResources()
        post(onStopped)
    }

    private fun run() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY)
        var failed = false
        try {
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            codec = decoder
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, preset.width, preset.height)
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 4 * 1024 * 1024)
            if (Build.VERSION.SDK_INT >= 23) {
                format.setInteger(MediaFormat.KEY_PRIORITY, 0)
                format.setInteger(MediaFormat.KEY_OPERATING_RATE, 60)
            }
            if (Build.VERSION.SDK_INT >= 30) format.setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
            decoder.configure(format, surface, null, 0)
            decoder.start()
            post(onStarted)

            val http = URL(preset.streamUrl(displayIndex)).openConnection() as HttpURLConnection
            connection = http
            http.connectTimeout = 2500
            http.readTimeout = 2500
            http.useCaches = false
            http.doInput = true
            http.connect()
            if (http.responseCode !in 200..299) throw IllegalStateException("Stream HTTP ${http.responseCode}")

            http.inputStream.use { input ->
                val readBuffer = ByteArray(READ_BUFFER_BYTES)
                val nalBuffer = NalBuffer()
                var ptsUs = 0L
                var bytesThisSecond = 0L
                var renderedThisSecond = 0
                var queuedThisSecond = 0
                var droppedThisSecond = 0
                var lastStatsAt = SystemClock.elapsedRealtime()
                while (running.get()) {
                    drainLatest(decoder).also {
                        renderedThisSecond += it.renderedFrames
                        droppedThisSecond += it.droppedFrames
                    }
                    val read = input.read(readBuffer)
                    if (read <= 0) break
                    bytesThisSecond += read
                    nalBuffer.append(readBuffer, read)
                    if (nalBuffer.size > MAX_PENDING_H264_BYTES) {
                        droppedThisSecond += nalBuffer.keepLatestKeyframeOrTail(MAX_PENDING_H264_BYTES / 3)
                    }
                    val result = feedAvailableNalUnits(decoder, nalBuffer, ptsUs)
                    ptsUs = result.nextPtsUs
                    queuedThisSecond += result.queuedFrames
                    renderedThisSecond += result.renderedFrames
                    droppedThisSecond += result.droppedFrames
                    if (nalBuffer.size > MAX_PENDING_H264_BYTES) {
                        droppedThisSecond += nalBuffer.keepLatestKeyframeOrTail(MAX_PENDING_H264_BYTES / 3)
                    }

                    val now = SystemClock.elapsedRealtime()
                    if (now - lastStatsAt >= 1000L) {
                        val kbps = bytesThisSecond / 1024L
                        val net = if (latestNetworkRttMs >= 0L) "${latestNetworkRttMs} ms" else "-"
                        val stats = "${renderedThisSecond} FPS | ${queuedThisSecond} NAL | ${droppedThisSecond} drop | ${kbps} KB/s | net ${net}"
                        Log.d(PC_SCREEN_LOG_TAG, stats)
                        post { onStats(stats) }
                        bytesThisSecond = 0L
                        renderedThisSecond = 0
                        queuedThisSecond = 0
                        droppedThisSecond = 0
                        lastStatsAt = now
                    }
                }
            }
        } catch (_: Exception) {
            failed = true
            if (running.get()) post(onError)
        } finally {
            if (running.getAndSet(false)) {
                closeResources()
                if (!failed) post(onStopped)
            }
        }
    }

    private fun runLatencyProbe() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
        while (running.get()) {
            latestNetworkRttMs = measureNetworkRttMs()
            var slept = 0
            while (running.get() && slept < 1000) {
                Thread.sleep(100)
                slept += 100
            }
        }
    }

    private fun measureNetworkRttMs(): Long {
        val startedAt = SystemClock.elapsedRealtime()
        var http: HttpURLConnection? = null
        return try {
            http = URL(PC_SCREEN_LATENCY_URL).openConnection() as HttpURLConnection
            http.connectTimeout = 250
            http.readTimeout = 250
            http.useCaches = false
            http.connect()
            if (http.responseCode !in 200..299) return -1L
            http.inputStream.use { input ->
                val buffer = ByteArray(64)
                input.read(buffer)
            }
            SystemClock.elapsedRealtime() - startedAt
        } catch (_: Exception) {
            -1L
        } finally {
            try {
                http?.disconnect()
            } catch (_: Exception) {
            }
        }
    }

    private fun feedAvailableNalUnits(decoder: MediaCodec, buffer: NalBuffer, startPtsUs: Long): FeedResult {
        var ptsUs = startPtsUs
        var rendered = 0
        var queued = 0
        var dropped = 0
        var first = findStartCode(buffer.data, 0, buffer.size)
        if (first < 0) {
            buffer.keepTail(4)
            return FeedResult(ptsUs, rendered, queued, 0)
        }
        var next = findStartCode(buffer.data, first + startCodeLength(buffer.data, first, buffer.size), buffer.size)
        while (next >= 0 && running.get() && queued < MAX_INPUT_NALS_PER_CYCLE) {
            val queueResult = queue(decoder, buffer.data, first, next - first, ptsUs)
            queued += queueResult.queuedFrames
            rendered += queueResult.renderedFrames
            dropped += queueResult.droppedFrames
            ptsUs += FRAME_INTERVAL_US
            first = next
            next = findStartCode(buffer.data, first + startCodeLength(buffer.data, first, buffer.size), buffer.size)
        }
        buffer.dropBefore(first)
        return FeedResult(ptsUs, rendered, queued, dropped)
    }

    private fun queue(decoder: MediaCodec, data: ByteArray, offset: Int, size: Int, ptsUs: Long): QueueResult {
        var attempts = 0
        var rendered = 0
        var dropped = 0
        while (running.get() && attempts < 8) {
            val index = decoder.dequeueInputBuffer(0)
            if (index >= 0) {
                val input = decoder.getInputBuffer(index) ?: return QueueResult(rendered, 0, dropped)
                input.clear()
                if (size > input.remaining()) return QueueResult(rendered, 0, dropped)
                input.put(data, offset, size)
                decoder.queueInputBuffer(index, 0, size, ptsUs, 0)
                drainLatest(decoder).also {
                    rendered += it.renderedFrames
                    dropped += it.droppedFrames
                }
                return QueueResult(rendered, 1, dropped)
            }
            drainLatest(decoder).also {
                rendered += it.renderedFrames
                dropped += it.droppedFrames
            }
            attempts++
        }
        return QueueResult(rendered, 0, dropped)
    }

    private fun drainLatest(decoder: MediaCodec): DrainResult {
        val info = MediaCodec.BufferInfo()
        val ready = ArrayList<Int>(4)
        while (running.get()) {
            val index = decoder.dequeueOutputBuffer(info, 0)
            if (index >= 0) {
                if (info.size > 0) {
                    ready.add(index)
                } else {
                    decoder.releaseOutputBuffer(index, false)
                }
            } else if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                continue
            } else {
                break
            }
        }
        if (ready.isEmpty()) return DrainResult(0, 0)
        if (ready.size <= 2) {
            ready.forEach { decoder.releaseOutputBuffer(it, true) }
            return DrainResult(ready.size, 0)
        }
        for (i in 0 until ready.lastIndex) {
            decoder.releaseOutputBuffer(ready[i], false)
        }
        decoder.releaseOutputBuffer(ready.last(), true)
        return DrainResult(1, ready.size - 1)
    }

    private fun closeResources() {
        try {
            connection?.disconnect()
        } catch (_: Exception) {
        }
        connection = null
        try {
            codec?.stop()
        } catch (_: Exception) {
        }
        try {
            codec?.release()
        } catch (_: Exception) {
        }
        codec = null
    }

    private fun findStartCode(data: ByteArray, from: Int, limit: Int): Int {
        var index = max(0, from)
        while (index <= limit - 3) {
            if (data[index] == 0.toByte() && data[index + 1] == 0.toByte()) {
                if (data[index + 2] == 1.toByte()) return index
                if (index <= limit - 4 && data[index + 2] == 0.toByte() && data[index + 3] == 1.toByte()) return index
            }
            index++
        }
        return -1
    }

    private fun startCodeLength(data: ByteArray, offset: Int, limit: Int): Int {
        return if (offset <= limit - 4 && data[offset + 2] == 0.toByte() && data[offset + 3] == 1.toByte()) 4 else 3
    }

    private fun post(action: () -> Unit) {
        mainHandler.post(action)
    }

    private data class FeedResult(val nextPtsUs: Long, val renderedFrames: Int, val queuedFrames: Int, val droppedFrames: Int)

    private data class QueueResult(val renderedFrames: Int, val queuedFrames: Int, val droppedFrames: Int)

    private data class DrainResult(val renderedFrames: Int, val droppedFrames: Int)

    private class NalBuffer(initialCapacity: Int = 512 * 1024) {
        var data = ByteArray(initialCapacity)
            private set
        var size = 0
            private set

        fun append(source: ByteArray, length: Int) {
            ensure(size + length)
            System.arraycopy(source, 0, data, size, length)
            size += length
        }

        fun dropBefore(index: Int) {
            if (index <= 0) return
            val remaining = size - index
            if (remaining > 0) System.arraycopy(data, index, data, 0, remaining)
            size = remaining
        }

        fun keepTail(length: Int) {
            if (size <= length) return
            dropBefore(size - length)
        }

        fun keepLatestKeyframeOrTail(tailLength: Int): Int {
            if (size <= tailLength) return 0
            var droppedNalUnits = 0
            var latestKeyframe = -1
            var current = findLocalStartCode(0)
            while (current >= 0) {
                val next = findLocalStartCode(current + localStartCodeLength(current))
                val payload = current + localStartCodeLength(current)
                if (payload < size) {
                    val nalType = data[payload].toInt() and 0x1F
                    if (nalType == 5 || nalType == 7 || nalType == 8) latestKeyframe = current
                }
                if (next < 0) break
                if (current < size - tailLength) droppedNalUnits++
                current = next
            }
            val keepFrom = if (latestKeyframe > 0 && latestKeyframe < size) latestKeyframe else max(0, size - tailLength)
            dropBefore(keepFrom)
            return droppedNalUnits
        }

        private fun findLocalStartCode(from: Int): Int {
            var index = max(0, from)
            while (index <= size - 3) {
                if (data[index] == 0.toByte() && data[index + 1] == 0.toByte()) {
                    if (data[index + 2] == 1.toByte()) return index
                    if (index <= size - 4 && data[index + 2] == 0.toByte() && data[index + 3] == 1.toByte()) return index
                }
                index++
            }
            return -1
        }

        private fun localStartCodeLength(offset: Int): Int {
            return if (offset <= size - 4 && data[offset + 2] == 0.toByte() && data[offset + 3] == 1.toByte()) 4 else 3
        }

        private fun ensure(required: Int) {
            if (required <= data.size) return
            var next = data.size
            while (next < required) next *= 2
            data = data.copyOf(next)
        }
    }
}
