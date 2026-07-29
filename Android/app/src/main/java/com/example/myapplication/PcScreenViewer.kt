package com.example.myapplication

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

private const val PC_SCREEN_FRAME_URL = "http://127.0.0.1:7878/api/screen/frame?scale=0.65&quality=0.65"
private const val FRAME_INTERVAL_MS = 45L

@Composable
fun PcScreenViewerScreen(modifier: Modifier = Modifier, displayIndex: Int = 0, onBack: () -> Unit) {
    val view = LocalView.current
    var running by remember { mutableStateOf(true) }
    var controlsVisible by remember { mutableStateOf(false) }
    var frame by remember { mutableStateOf<Bitmap?>(null) }
    var status by remember { mutableStateOf("Đang kết nối màn hình PC qua USB...") }

    BackHandler(onBack = onBack)

    DisposableEffect(view) {
        val activity = view.context as? Activity
        val controller = activity?.let { WindowCompat.getInsetsController(it.window, view) }
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    LaunchedEffect(running, displayIndex) {
        if (!running) return@LaunchedEffect

        while (isActive) {
            val startedAt = android.os.SystemClock.elapsedRealtime()
            try {
                frame = withContext(Dispatchers.IO) { loadPcFrame(displayIndex) }
                status = "Đang nhận màn hình PC qua USB."
            } catch (error: Exception) {
                status = "Không thể nhận màn hình PC. Kiểm tra SCFT Desktop và gỡ lỗi USB."
            }
            delay((FRAME_INTERVAL_MS - (android.os.SystemClock.elapsedRealtime() - startedAt)).coerceAtLeast(0L))
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable { controlsVisible = !controlsVisible }
    ) {
        if (frame == null) {
            Text(
                text = status,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
            )
        } else {
            Image(
                bitmap = frame!!.asImageBitmap(),
                contentDescription = "Màn hình PC",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
        }

        if (controlsVisible) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(onClick = onBack) {
                    Text("Truyền tệp")
                }
                if (running) {
                    OutlinedButton(onClick = { running = false }) {
                        Text("Dừng")
                    }
                } else {
                    Button(onClick = { running = true }) {
                        Text("Bắt đầu")
                    }
                }
            }
        }
    }
}

private fun loadPcFrame(displayIndex: Int): Bitmap {
    val connection = URL("$PC_SCREEN_FRAME_URL&display=$displayIndex&t=${System.currentTimeMillis()}").openConnection() as HttpURLConnection

    try {
        connection.connectTimeout = 5000
        connection.readTimeout = 1500
        connection.useCaches = false
        connection.setRequestProperty("Connection", "keep-alive")
        if (connection.responseCode !in 200..299) {
            throw IOException("HTTP ${connection.responseCode}")
        }
        return connection.inputStream.use { input ->
            BitmapFactory.decodeStream(
                input,
                null,
                BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 }
            ) ?: throw IOException("Khung hình trống.")
        }
    } finally {
        connection.disconnect()
    }
}