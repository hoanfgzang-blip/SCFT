package com.example.myapplication

import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.Uri
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Build
import android.os.Bundle
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import java.net.SocketTimeoutException
import java.net.URL
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.max

private const val DEFAULT_PC_SCREEN_BASE_URL = "http://127.0.0.1:7878"
private const val PC_SCREEN_LOG_TAG = "SCFT-PC-SCREEN"
private const val READ_BUFFER_BYTES = 32 * 1024
private const val DEFAULT_PENDING_H264_BYTES = 768 * 1024
// Keep decoder input paced. A large burst makes latest-only rendering discard
// otherwise valid frames and inflates dropped-frame telemetry.
private const val MAX_ACCESS_UNITS_PER_CYCLE = 1

private fun cleanPcBaseUrl(value: String): String {
    return value.trim()
        .substringBefore('?')
        .substringBefore('#')
        .removeSuffix("/api/screen/view")
        .removeSuffix("/api/screen")
        .trimEnd('/')
}

private fun phoneScreenAspect(): String {
    val metrics = android.content.res.Resources.getSystem().displayMetrics
    val longSide = max(metrics.widthPixels, metrics.heightPixels).toFloat()
    val shortSide = minOf(metrics.widthPixels, metrics.heightPixels).toFloat()
    return if (shortSide > 0f && abs(longSide / shortSide - 1.6f) < 0.08f) "16:10" else "16:9"
}

private val PC_SCREEN_PRESETS = listOf(
    PcScreenPreset("zero_latency", "Kh\u00f4ng \u0111\u1ed9 tr\u1ec5", 1280, 800, "5M", 256 * 1024, 60, true),
    PcScreenPreset("balanced", "C\u00e2n b\u1eb1ng", 1920, 1200, "10M", 512 * 1024, 50, true),
    PcScreenPreset("adaptive_2k", "2K", 2048, 1280, "16M", DEFAULT_PENDING_H264_BYTES, 30, true)
)

private enum class PcViewerState {
    Idle,
    WaitingForSurface,
    Connecting,
    Streaming,
    Recovering,
    Error,
    Stopped
}

private data class PcScreenPreset(
    val id: String,
    val label: String,
    val width: Int,
    val height: Int,
    val bitrate: String,
    val pendingLimitBytes: Int,
    val initialFps: Int,
    val renderLatestOnly: Boolean = true
) {
    fun dimensions(aspect: String): Pair<Int, Int> {
        return if ("16:10" == aspect) width to height else when (id) {
            "zero_latency" -> 1280 to 720
            "balanced" -> 1920 to 1080
            else -> 2048 to 1152
        }
    }

    fun streamUrl(baseUrl: String, displayIndex: Int, displayId: String, sessionId: String, generation: Long, aspect: String, fps: Int): String {
        val (streamWidth, streamHeight) = dimensions(aspect)
        val stableDisplay = if (displayId.isBlank()) "" else "&displayId=${Uri.encode(displayId)}"
        val stableSession = if (sessionId.isBlank()) "" else "&sessionId=${Uri.encode(sessionId)}"
        val stableGeneration = if (generation <= 0L) "" else "&generation=$generation"
        return "${cleanPcBaseUrl(baseUrl)}/api/screen/stream?display=$displayIndex$stableDisplay$stableSession$stableGeneration&fps=$fps&format=h264&preset=$id&aspect=$aspect&width=$streamWidth&height=$streamHeight&bitrate=$bitrate"
    }
}

@Composable
fun PcScreenViewerScreen(modifier: Modifier = Modifier, displayIndex: Int = 0, displayId: String = "", baseUrl: String = DEFAULT_PC_SCREEN_BASE_URL, initialPresetId: String? = null, sessionId: String = "", generation: Long = 0L, attempt: Int = 1, autoStart: Boolean = false, onBack: () -> Unit) {
    var serverBaseUrl by remember { mutableStateOf(baseUrl) }
    H264PcScreenViewer(modifier, displayIndex, displayId, serverBaseUrl, initialPresetId, sessionId, generation, attempt, autoStart, onBack, { serverBaseUrl = it })
}

@Composable
private fun H264PcScreenViewer(modifier: Modifier, displayIndex: Int, displayId: String, baseUrl: String, initialPresetId: String?, sessionId: String, generation: Long, attempt: Int, autoStart: Boolean, onBack: () -> Unit, onBaseUrlChanged: (String) -> Unit) {
    val view = LocalView.current
    var holder by remember { mutableStateOf<SurfaceHolder?>(null) }
    var player by remember { mutableStateOf<LowLatencyH264Player?>(null) }
    var viewerState by remember { mutableStateOf(PcViewerState.Idle) }
    var playerToken by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf("S\u1eb5n s\u00e0ng nh\u1eadn m\u00e0n h\u00ecnh PC qua USB ho\u1eb7c LAN.") }
    var metrics by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf(baseUrl) }
    var preset by remember { mutableStateOf(PC_SCREEN_PRESETS.firstOrNull { it.id == initialPresetId } ?: PC_SCREEN_PRESETS[1]) }
    var streamFps by remember { mutableStateOf(preset.initialFps) }
    var controlsVisible by remember { mutableStateOf(!autoStart) }
    val screenAspect = remember { phoneScreenAspect() }
    val streamDimensions = preset.dimensions(screenAspect)

    fun stopStream(nextState: PcViewerState = PcViewerState.Stopped) {
        playerToken += 1
        player?.stop()
        player = null
        viewerState = nextState
        metrics = ""
                status = "\u0110\u00e3 k\u1ebft th\u00fac chi\u1ebfu m\u00e0n h\u00ecnh."
    }

    fun startStream() {
        val surface = holder?.surface
        if (surface == null || !surface.isValid) {
            viewerState = PcViewerState.WaitingForSurface
            status = "\u0110ang chu\u1ea9n b\u1ecb m\u00e0n h\u00ecnh..."
            return
        }
        stopStream()
        val token = playerToken + 1
        playerToken = token
        viewerState = PcViewerState.Connecting
        status = "\u0110ang k\u1ebft n\u1ed1i m\u00e0n h\u00ecnh PC..."
        player = LowLatencyH264Player(
            surface = surface,
            preset = preset,
            displayIndex = displayIndex,
            displayId = displayId,
            sessionId = sessionId,
            generation = generation,
            attempt = attempt,
            baseUrl = serverUrl,
            fps = streamFps,
            streamWidth = streamDimensions.first,
            streamHeight = streamDimensions.second,
            onStarted = {
                if (token == playerToken) {
                    viewerState = PcViewerState.Streaming
                    controlsVisible = false
                    status = ""
                }
            },
            onStopped = {
                if (token == playerToken) {
                    if (viewerState != PcViewerState.Error) {
                        viewerState = PcViewerState.Stopped
                        status = "\u0110\u00e3 k\u1ebft th\u00fac chi\u1ebfu m\u00e0n h\u00ecnh."
                    }
                }
            },
            onStats = {
                if (token == playerToken) metrics = it
            },
            onError = {
                if (token == playerToken) {
                    viewerState = PcViewerState.Recovering
                    controlsVisible = true
                    status = "\u0110ang th\u1eed k\u1ebft n\u1ed1i l\u1ea1i H264..."
                }
            },
        ).also { it.start() }
    }

    LaunchedEffect(viewerState, playerToken) {
        if (viewerState == PcViewerState.Recovering) {
            delay(1000)
            if (viewerState == PcViewerState.Recovering) {
                viewerState = PcViewerState.Error
                status = "Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i H264. H\u00e3y th\u1eed l\u1ea1i t\u1eeb PC."
            }
        }
    }

    LaunchedEffect(holder, autoStart) {
        if (autoStart && holder?.surface?.isValid == true && viewerState != PcViewerState.Streaming && viewerState != PcViewerState.Connecting) {
            // The activity requests landscape above; wait for the final SurfaceView
            // instance after rotation before binding MediaCodec to it.
            val stableHolder = holder
            delay(350)
            if (stableHolder == holder && stableHolder?.surface?.isValid == true && viewerState != PcViewerState.Streaming && viewerState != PcViewerState.Connecting) {
                startStream()
            }
        }
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
                    setOnClickListener { controlsVisible = !controlsVisible }
                    this.holder.addCallback(object : SurfaceHolder.Callback {
                        override fun surfaceCreated(surfaceHolder: SurfaceHolder) {
                            holder = surfaceHolder
                        }

                        override fun surfaceChanged(surfaceHolder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

                        override fun surfaceDestroyed(surfaceHolder: SurfaceHolder) {
                            holder = null
                            if (viewerState == PcViewerState.Error) {
                                playerToken += 1
                                player?.stop()
                                player = null
                            } else {
                                stopStream(PcViewerState.WaitingForSurface)
                            }
                        }
                    })
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (viewerState != PcViewerState.Streaming) {
            Text(
                text = status,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
            )
        }

        if (controlsVisible && viewerState == PcViewerState.Streaming && metrics.isNotBlank()) {
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

        if (controlsVisible) Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (viewerState != PcViewerState.Streaming && viewerState != PcViewerState.Connecting) {
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = {
                        serverUrl = it
                        onBaseUrlChanged(it)
                    },
                    label = { Text("Địa chỉ PC (USB hoặc LAN)") },
                    singleLine = true
                )
            }
            if (viewerState != PcViewerState.Streaming && viewerState != PcViewerState.Connecting) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PC_SCREEN_PRESETS.forEach { item ->
                        if (item == preset) {
                            Button(onClick = { preset = item; streamFps = item.initialFps }) { Text(item.label) }
                        } else {
                            OutlinedButton(onClick = { preset = item; streamFps = item.initialFps }) { Text(item.label) }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { startStream() }, enabled = viewerState != PcViewerState.Streaming && viewerState != PcViewerState.Connecting) {
                    Text("B\u1eaft \u0111\u1ea7u")
                }
                OutlinedButton(onClick = { stopStream() }, enabled = viewerState == PcViewerState.Streaming || viewerState == PcViewerState.Connecting) {
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
    private val displayId: String,
    private val sessionId: String,
    private val generation: Long,
    private val attempt: Int,
    private val baseUrl: String,
    private val fps: Int,
    private val streamWidth: Int,
    private val streamHeight: Int,
    private val onStarted: () -> Unit,
    private val onStopped: () -> Unit,
    private val onStats: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private val running = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var thread: Thread? = null
    @Volatile private var readerThread: Thread? = null
    private var latencyThread: Thread? = null
    @Volatile private var latestNetworkRttMs = -1L
    private var connection: HttpURLConnection? = null
    private var codec: MediaCodec? = null
    private val transportReadWaitMs = AtomicLong(0L)

    fun start() {
        if (!running.compareAndSet(false, true)) return
        Log.d(PC_SCREEN_LOG_TAG, "start session=$sessionId generation=$generation attempt=$attempt preset=${preset.id} display=$displayIndex")
        thread = Thread(::run, "scft-low-latency-h264").also { it.start() }
        latencyThread = Thread(::runLatencyProbe, "scft-screen-rtt").also { it.start() }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        closeResources()
        val worker = thread
        if (worker != null && worker !== Thread.currentThread()) {
            worker.interrupt()
            try {
                worker.join(300)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        post(onStopped)
    }

    private fun run() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY)
        var failed = false
        try {
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            codec = decoder
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, streamWidth, streamHeight)
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 4 * 1024 * 1024)
            if (Build.VERSION.SDK_INT >= 23) {
                format.setInteger(MediaFormat.KEY_PRIORITY, 0)
                format.setInteger(MediaFormat.KEY_OPERATING_RATE, 60)
            }
            if (Build.VERSION.SDK_INT >= 30) format.setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
            decoder.configure(format, surface, null, 0)
            decoder.start()
            if (Build.VERSION.SDK_INT >= 30) {
                decoder.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_LOW_LATENCY, 1) })
            }
            val aspect = if (streamWidth.toFloat() / streamHeight.toFloat() > 1.7f) "16:9" else "16:10"
            val http = URL(preset.streamUrl(baseUrl, displayIndex, displayId, sessionId, generation, aspect, fps)).openConnection() as HttpURLConnection
            connection = http
            http.connectTimeout = 5000
            http.readTimeout = 10000
            http.useCaches = false
            http.doInput = true
            http.connect()
            if (http.responseCode !in 200..299) throw IllegalStateException("Stream HTTP ${http.responseCode}")
            val captureSetupMs = http.getHeaderField("X-SCFT-Capture-Setup-Ms")?.toLongOrNull() ?: -1L
            val encodeSetupMs = http.getHeaderField("X-SCFT-Encode-Setup-Ms")?.toLongOrNull() ?: -1L

            val chunks = EncodedChunkQueue(preset.pendingLimitBytes)
            val readerDone = AtomicBoolean(false)
            var lastDataAt = SystemClock.elapsedRealtime()
            val reader = Thread({
                Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY)
                try {
                    http.inputStream.use { input ->
                        val readBuffer = ByteArray(READ_BUFFER_BYTES)
                        while (running.get()) {
                            val readStartedAt = SystemClock.elapsedRealtime()
                            val read = input.read(readBuffer)
                            transportReadWaitMs.addAndGet(SystemClock.elapsedRealtime() - readStartedAt)
                            if (read <= 0) break
                            lastDataAt = SystemClock.elapsedRealtime()
                            chunks.push(readBuffer.copyOf(read))
                        }
                    }
                } catch (_: Exception) {
                } finally {
                    readerDone.set(true)
                    chunks.close()
                }
            }, "scft-h264-reader")
            readerThread = reader
            reader.start()

            val nalBuffer = NalBuffer()
            var ptsUs = 0L
            var bytesThisSecond = 0L
            var renderedThisSecond = 0
            var queuedThisSecond = 0
            var droppedThisSecond = 0
            var droppedNalUnitsThisSecond = 0
            var decodeNanosThisSecond = 0L
            var renderNanosThisSecond = 0L
            var maxBacklogKbThisSecond = 0
            var lastStatsAt = SystemClock.elapsedRealtime()
            var firstFrameReported = false
            while (running.get() && (!readerDone.get() || chunks.hasPending() || nalBuffer.size > 0)) {
                drainLatest(decoder).also {
                    renderedThisSecond += it.renderedFrames
                    droppedThisSecond += it.droppedFrames
                    renderNanosThisSecond += it.renderNanos
                    if (!firstFrameReported && it.renderedFrames > 0) {
                        firstFrameReported = true
                        post(onStarted)
                        sendTelemetry("streaming", 1, it.droppedFrames, 0, 0, 0, "", captureSetupMs, encodeSetupMs, transportReadWaitMs.get(), 0L, it.renderNanos / 1_000_000L)
                    }
                }
                val chunk = chunks.pop(4)
                if (chunk != null) {
                    bytesThisSecond += chunk.size.toLong()
                    nalBuffer.append(chunk, chunk.size)
                    if (nalBuffer.size > preset.pendingLimitBytes) {
                        droppedNalUnitsThisSecond += nalBuffer.keepLatestKeyframeOrTail(preset.pendingLimitBytes / 3)
                    }
                    val decodeStartedAt = System.nanoTime()
                    val result = feedAvailableNalUnits(decoder, nalBuffer, ptsUs)
                    decodeNanosThisSecond += System.nanoTime() - decodeStartedAt
                    ptsUs = result.nextPtsUs
                    queuedThisSecond += result.queuedFrames
                    renderedThisSecond += result.renderedFrames
                    droppedThisSecond += result.droppedFrames
                    renderNanosThisSecond += result.renderNanos
                    if (nalBuffer.size > preset.pendingLimitBytes) {
                        droppedNalUnitsThisSecond += nalBuffer.keepLatestKeyframeOrTail(preset.pendingLimitBytes / 3)
                    }
                } else if (firstFrameReported && SystemClock.elapsedRealtime() - lastDataAt > 5000L) {
                    throw SocketTimeoutException("Kh\u00f4ng nh\u1eadn d\u1eef li\u1ec7u H264 qu\u00e1 5 gi\u00e2y")
                }

                maxBacklogKbThisSecond = max(maxBacklogKbThisSecond, (chunks.pendingBytes() + nalBuffer.size) / 1024)
                val now = SystemClock.elapsedRealtime()
                if (now - lastStatsAt >= 1000L) {
                    val kbps = bytesThisSecond / 1024L
                    val net = if (latestNetworkRttMs >= 0L) "${latestNetworkRttMs} ms" else "-"
                    val usbMs = transportReadWaitMs.getAndSet(0L)
                    val decodeMs = decodeNanosThisSecond / 1_000_000L
                    val renderMs = renderNanosThisSecond / 1_000_000L
                    val stats = "${preset.label} ${streamWidth}x${streamHeight} | ${renderedThisSecond} FPS | ${queuedThisSecond} frame | ${droppedThisSecond} drop | nal ${droppedNalUnitsThisSecond} | ${kbps} KB/s | buf ${maxBacklogKbThisSecond} KB | net ${net} | cap ${captureSetupMs}ms enc ${encodeSetupMs}ms usb ${usbMs}ms dec ${decodeMs}ms ren ${renderMs}ms"
                    Log.d(PC_SCREEN_LOG_TAG, "session=$sessionId generation=$generation attempt=$attempt $stats")
                    post { onStats(stats) }
                    val decoderQueueDepth = chunks.pendingCount()
                    sendTelemetry("streaming", renderedThisSecond, droppedThisSecond, decoderQueueDepth, maxBacklogKbThisSecond * 1024L, decoderQueueDepth, "", captureSetupMs, encodeSetupMs, usbMs, decodeMs, renderMs)
                    bytesThisSecond = 0L
                    renderedThisSecond = 0
                    queuedThisSecond = 0
                    droppedThisSecond = 0
                    droppedNalUnitsThisSecond = 0
                    decodeNanosThisSecond = 0L
                    renderNanosThisSecond = 0L
                    maxBacklogKbThisSecond = 0
                    lastStatsAt = now
                }
            }

        } catch (error: Exception) {
            failed = true
            Log.e(PC_SCREEN_LOG_TAG, "H264 stream failed session=$sessionId generation=$generation attempt=$attempt preset=${preset.id} display=$displayIndex", error)
            sendTelemetry(
                "error", 0, 0, 0, 0, 0,
                if (error is SocketTimeoutException) "STREAM_STALLED" else "DECODER_ERROR"
            )
            if (running.get()) post { onError(error.message ?: "L\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh") }
        } finally {
            if (running.getAndSet(false)) {
                closeResources()
                if (!failed) {
                    sendTelemetry("error", 0, 0, 0, 0, 0, "STREAM_STALLED")
                    post { onError("Luồng H264 đã kết thúc bất thường") }
                }
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

    private fun sendTelemetry(state: String, fpsValue: Int, droppedValue: Int, queueValue: Int, bufferBytes: Long, decoderQueueDepth: Int, errorCode: String = "") {
        sendTelemetry(state, fpsValue, droppedValue, queueValue, bufferBytes, decoderQueueDepth, errorCode, -1L, -1L, -1L, -1L, -1L)
    }

    private fun sendTelemetry(state: String, fpsValue: Int, droppedValue: Int, queueValue: Int, bufferBytes: Long, decoderQueueDepth: Int, errorCode: String, captureSetupMs: Long, encodeSetupMs: Long, usbTransferMs: Long, decodeMs: Long, renderMs: Long) {
        if (sessionId.isBlank()) return
        var telemetry: HttpURLConnection? = null
        try {
            val query = ("sessionId=${Uri.encode(sessionId)}"
                + "&generation=$generation"
                + "&state=${Uri.encode(state)}"
                + "&preset=${Uri.encode(preset.id)}"
                + "&fps=$fpsValue"
                + "&dropped=$droppedValue"
                + "&queue=$queueValue"
                + "&bufferBytes=$bufferBytes"
                + "&decoderQueueDepth=$decoderQueueDepth"
                + "&captureSetupMs=$captureSetupMs"
                + "&encodeSetupMs=$encodeSetupMs"
                + "&usbTransferMs=$usbTransferMs"
                + "&decodeMs=$decodeMs"
                + "&renderMs=$renderMs"
                + if (errorCode.isBlank()) "" else "&errorCode=${Uri.encode(errorCode)}"
                + "&rtt=$latestNetworkRttMs")
            telemetry = URL("${cleanPcBaseUrl(baseUrl)}/api/screen/telemetry?$query").openConnection() as HttpURLConnection
            telemetry.requestMethod = "POST"
            telemetry.connectTimeout = 250
            telemetry.readTimeout = 250
            telemetry.doInput = true
            telemetry.connect()
            telemetry.inputStream.use { it.readBytes() }
        } catch (_: Exception) {
            // Telemetry must never stop the video path.
        } finally {
            telemetry?.disconnect()
        }
    }

    private fun measureNetworkRttMs(): Long {
        val startedAt = SystemClock.elapsedRealtime()
        var http: HttpURLConnection? = null
        return try {
            http = URL("${cleanPcBaseUrl(baseUrl)}/api/screen/latency").openConnection() as HttpURLConnection
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
        var renderNanos = 0L
        var first = findStartCode(buffer.data, 0, buffer.size)
        if (first < 0) {
            buffer.keepTail(4)
            return FeedResult(ptsUs, rendered, queued, 0, 0L)
        }
        var accessUnitStart = first
        var cursor = first
        var next = findStartCode(buffer.data, cursor + startCodeLength(buffer.data, cursor, buffer.size), buffer.size)
        while (next >= 0 && running.get() && queued < MAX_ACCESS_UNITS_PER_CYCLE) {
            val nalPayload = cursor + startCodeLength(buffer.data, cursor, buffer.size)
            val nalType = if (nalPayload < buffer.size) buffer.data[nalPayload].toInt() and 0x1F else -1
            if (nalType == 9 && cursor > accessUnitStart) {
                val queueResult = queue(decoder, buffer.data, accessUnitStart, cursor - accessUnitStart, ptsUs)
                queued += queueResult.queuedFrames
                rendered += queueResult.renderedFrames
                dropped += queueResult.droppedFrames
                renderNanos += queueResult.renderNanos
                ptsUs += 1_000_000L / fps
                accessUnitStart = cursor
            }
            cursor = next
            next = findStartCode(buffer.data, cursor + startCodeLength(buffer.data, cursor, buffer.size), buffer.size)
        }
        if (next >= 0 && cursor > accessUnitStart && queued < MAX_ACCESS_UNITS_PER_CYCLE) {
            val queueResult = queue(decoder, buffer.data, accessUnitStart, cursor - accessUnitStart, ptsUs)
            queued += queueResult.queuedFrames
            rendered += queueResult.renderedFrames
            dropped += queueResult.droppedFrames
            renderNanos += queueResult.renderNanos
            ptsUs += 1_000_000L / fps
            accessUnitStart = cursor
        }
        buffer.dropBefore(accessUnitStart)
        return FeedResult(ptsUs, rendered, queued, dropped, renderNanos)
    }

    private fun queue(decoder: MediaCodec, data: ByteArray, offset: Int, size: Int, ptsUs: Long): QueueResult {
        var attempts = 0
        var rendered = 0
        var dropped = 0
        var renderNanos = 0L
        while (running.get() && attempts < 8) {
            val index = decoder.dequeueInputBuffer(0)
            if (index >= 0) {
                val input = decoder.getInputBuffer(index) ?: return QueueResult(rendered, 0, dropped, renderNanos)
                input.clear()
                if (size > input.remaining()) return QueueResult(rendered, 0, dropped, renderNanos)
                input.put(data, offset, size)
                decoder.queueInputBuffer(index, 0, size, ptsUs, 0)
                drainLatest(decoder).also {
                    rendered += it.renderedFrames
                    dropped += it.droppedFrames
                    renderNanos += it.renderNanos
                }
                return QueueResult(rendered, 1, dropped, renderNanos)
            }
            drainLatest(decoder).also {
                rendered += it.renderedFrames
                dropped += it.droppedFrames
                renderNanos += it.renderNanos
            }
            attempts++
        }
        return QueueResult(rendered, 0, dropped, renderNanos)
    }

    private fun drainLatest(decoder: MediaCodec): DrainResult {
        val renderStartedAt = System.nanoTime()
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
        if (ready.isEmpty()) return DrainResult(0, 0, 0L)
        if (!preset.renderLatestOnly && ready.size <= 2) {
            ready.forEach { decoder.releaseOutputBuffer(it, true) }
            return DrainResult(ready.size, 0, System.nanoTime() - renderStartedAt)
        }
        for (i in 0 until ready.lastIndex) {
            decoder.releaseOutputBuffer(ready[i], false)
        }
        decoder.releaseOutputBuffer(ready.last(), true)
        return DrainResult(1, ready.size - 1, System.nanoTime() - renderStartedAt)
    }

    private fun closeResources() {
        try {
            connection?.disconnect()
        } catch (_: Exception) {
        }
        connection = null
        val reader = readerThread
        readerThread = null
        if (reader != null && reader !== Thread.currentThread()) {
            reader.interrupt()
            try {
                reader.join(250)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
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

    private data class FeedResult(val nextPtsUs: Long, val renderedFrames: Int, val queuedFrames: Int, val droppedFrames: Int, val renderNanos: Long)

    private data class QueueResult(val renderedFrames: Int, val queuedFrames: Int, val droppedFrames: Int, val renderNanos: Long)

    private data class DrainResult(val renderedFrames: Int, val droppedFrames: Int, val renderNanos: Long)

    private class EncodedChunkQueue(private val maxBytes: Int) {
        private val lock = Object()
        private val chunks = ArrayDeque<ByteArray>()
        private var bytes = 0
        private var closed = false

        fun push(chunk: ByteArray) {
            synchronized(lock) {
                if (closed) return
                chunks.addLast(chunk)
                bytes += chunk.size
                while (bytes > maxBytes && chunks.size > 1) {
                    bytes -= chunks.removeFirst().size
                }
                lock.notifyAll()
            }
        }

        fun pop(timeoutMs: Long): ByteArray? {
            synchronized(lock) {
                if (chunks.isEmpty() && !closed) {
                    try {
                        lock.wait(timeoutMs)
                    } catch (_: InterruptedException) {
                    }
                }
                if (chunks.isEmpty()) return null
                val chunk = chunks.removeFirst()
                bytes -= chunk.size
                return chunk
            }
        }

        fun pendingBytes(): Int {
            synchronized(lock) {
                return bytes
            }
        }

        fun pendingCount(): Int {
            synchronized(lock) {
                return chunks.size
            }
        }

        fun hasPending(): Boolean {
            synchronized(lock) {
                return chunks.isNotEmpty()
            }
        }

        fun close() {
            synchronized(lock) {
                closed = true
                lock.notifyAll()
            }
        }
    }

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
