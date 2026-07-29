package com.example.myapplication

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.myapplication.ui.theme.MyApplicationTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

private const val BACKEND_URL = "http://127.0.0.1:7878"
private const val MAX_UPLOAD_BYTES = 2L * 1024L * 1024L * 1024L
private val AppBackground = Color(0xFFF6F7F9)
private val AppSurface = Color(0xFFFFFFFF)
private val AppText = Color(0xFF171A1F)
private val AppMuted = Color(0xFF68707D)
private val AppBorder = Color(0xFFE2E5EA)
private val AppPrimary = Color(0xFF146C5B)
private val AppPrimarySoft = Color(0xFFE4F5F0)
private val AppSuccess = Color(0xFF157A4C)
private val AppSuccessSoft = Color(0xFFE2F6E9)
private val AppWarning = Color(0xFFAA5A00)
private val AppWarningSoft = Color(0xFFFFEFD9)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                ScftApp(
                    initialScreen = intent.getStringExtra("scft_screen"),
                    initialDisplay = intent.getIntExtra("scft_display", 0),
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
fun ScftApp(initialScreen: String?, initialDisplay: Int, modifier: Modifier = Modifier) {
    var currentScreen by rememberSaveable { mutableStateOf(if (initialScreen == "pc") "pc" else "transfer") }

    if (currentScreen == "pc") {
        PcScreenViewerScreen(modifier = modifier, displayIndex = initialDisplay, onBack = { currentScreen = "transfer" })
        return
    }

    UsbFileTransferScreen(modifier = modifier, onOpenPcScreen = { currentScreen = "pc" })
}

@Composable
fun UsbFileTransferScreen(
    modifier: Modifier = Modifier,
    onOpenPcScreen: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var selectedName by remember { mutableStateOf("Chưa chọn tệp") }
    var selectedSize by remember { mutableStateOf<Long?>(null) }
    var status by remember { mutableStateOf("Kết nối USB, bật gỡ lỗi USB rồi chọn tệp cần gửi.") }
    var uploading by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        selectedUri = uri
        if (uri == null) {
            selectedName = "Chưa chọn tệp"
            selectedSize = null
            return@rememberLauncherForActivityResult
        }

        val info = context.readFileInfo(uri)
        selectedName = info.name
        selectedSize = info.size
        status = if ((info.size ?: 0L) > MAX_UPLOAD_BYTES) {
            "Tệp vượt quá giới hạn 2 GB."
        } else {
            "Sẵn sàng gửi tệp qua cáp USB."
        }
        progress = 0f
    }

    Scaffold(
        modifier = modifier,
        containerColor = AppBackground,
        topBar = {
            Surface(color = AppSurface, shadowElevation = 1.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 15.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "SCFT",
                            color = AppText,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Truyền tệp qua USB",
                            color = AppMuted,
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                    OutlinedButton(
                        onClick = onOpenPcScreen,
                        border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Màn hình PC")
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(paddingValues)
                .padding(horizontal = 20.dp, vertical = 22.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            TransferHeader()
            ConnectionCard()
            FileSelectionCard(
                selectedName = selectedName,
                selectedSize = selectedSize,
                uploading = uploading,
                onPickFile = { picker.launch(arrayOf("*/*")) },
                onUpload = {
                    val uri = selectedUri ?: return@FileSelectionCard
                    uploading = true
                    status = "Đang gửi tệp..."
                    progress = 0f
                    scope.launch {
                        val result = uploadFile(context, uri, selectedName) { sent, total ->
                            if (total > 0L) {
                                progress = sent.toFloat() / total.toFloat()
                            }
                        }
                        uploading = false
                        status = result
                    }
                },
                canUpload = selectedUri != null && !uploading && (selectedSize ?: 0L) <= MAX_UPLOAD_BYTES
            )

            if (uploading) {
                UploadProgress(progress)
            }

            TransferStatusCard(status)
            UsbGuideCard()
        }
    }
}

@Composable
private fun TransferHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = "Gửi tệp đến máy tính",
            color = AppText,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Tệp sẽ được gửi đến SCFT Desktop qua kết nối USB ADB.",
            color = AppMuted,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun ConnectionCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = AppSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(AppPrimarySoft, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("USB", color = AppPrimary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier) {
                Text("Kết nối đến máy tính", color = AppText, fontWeight = FontWeight.SemiBold)
                Text(BACKEND_URL, color = AppMuted, style = MaterialTheme.typography.bodySmall)
            }
            Surface(
                color = AppSuccessSoft,
                shape = RoundedCornerShape(20.dp)
            ) {
                Text(
                    text = "USB ADB",
                    color = AppSuccess,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun FileSelectionCard(
    selectedName: String,
    selectedSize: Long?,
    uploading: Boolean,
    onPickFile: () -> Unit,
    onUpload: () -> Unit,
    canUpload: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = AppSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Chọn tệp", color = AppText, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Giới hạn tối đa 2 GB", color = AppMuted, style = MaterialTheme.typography.bodySmall)
                }
                Surface(color = AppPrimarySoft, shape = RoundedCornerShape(8.dp)) {
                    Text(
                        text = "TỆP",
                        color = AppPrimary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            HorizontalDivider(color = AppBorder)

            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    text = selectedName,
                    color = AppText,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = selectedSize?.let { formatBytes(it) } ?: "Chưa có tệp nào được chọn",
                    color = AppMuted,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    modifier = Modifier,
                    enabled = !uploading,
                    onClick = onPickFile,
                    border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Chọn tệp")
                }
                Button(
                    modifier = Modifier,
                    enabled = canUpload,
                    onClick = onUpload,
                    colors = ButtonDefaults.buttonColors(containerColor = AppPrimary, contentColor = Color.White),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(if (uploading) "Đang gửi" else "Gửi tệp")
                }
            }
        }
    }
}

@Composable
private fun UploadProgress(progress: Float) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = AppSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Đang gửi tệp", color = AppText, fontWeight = FontWeight.SemiBold)
                Text("${(progress * 100).toInt()}%", color = AppPrimary, fontWeight = FontWeight.Bold)
            }
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
                color = AppPrimary,
                trackColor = AppPrimarySoft
            )
        }
    }
}

@Composable
private fun TransferStatusCard(status: String) {
    val isError = status.contains("lỗi", ignoreCase = true) || status.contains("thất bại", ignoreCase = true) || status.contains("vượt quá", ignoreCase = true)
    val background = if (isError) AppWarningSoft else AppSuccessSoft
    val color = if (isError) AppWarning else AppSuccess

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = background),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text("Trạng thái truyền tệp", color = color, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            Text(status, color = AppText, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun UsbGuideCard() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Chuẩn bị USB", color = AppText, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("1. Dùng cáp có truyền dữ liệu", color = AppMuted, style = MaterialTheme.typography.bodySmall)
        Text("2. Bật gỡ lỗi USB và xác nhận thông báo trên điện thoại", color = AppMuted, style = MaterialTheme.typography.bodySmall)
        Text("3. Giữ SCFT Desktop đang chạy trong lúc gửi tệp", color = AppMuted, style = MaterialTheme.typography.bodySmall)
        Spacer(modifier = Modifier.height(4.dp))
    }
}

private suspend fun uploadFile(
    context: Context,
    uri: Uri,
    fileName: String,
    onProgress: (Long, Long) -> Unit
): String = withContext(Dispatchers.IO) {
    val info = context.readFileInfo(uri)
    val size = info.size ?: -1L
    if (size > MAX_UPLOAD_BYTES) return@withContext "Tệp vượt quá giới hạn 2 GB."

    val encodedName = URLEncoder.encode(fileName, "UTF-8")
    val url = URL("$BACKEND_URL/api/files?filename=$encodedName")
    val connection = url.openConnection() as HttpURLConnection

    try {
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.connectTimeout = 7000
        connection.readTimeout = 30000
        connection.setRequestProperty("Content-Type", "application/octet-stream")
        connection.setRequestProperty("X-Device-Id", "android-${UUID.randomUUID()}")
        if (size >= 0L) {
            connection.setFixedLengthStreamingMode(size)
        } else {
            connection.setChunkedStreamingMode(64 * 1024)
        }

        context.contentResolver.openInputStream(uri).use { rawInput ->
            if (rawInput == null) return@withContext "Không thể mở tệp đã chọn."
            BufferedInputStream(rawInput).use { input ->
                BufferedOutputStream(connection.outputStream).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var sent = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        sent += read
                        onProgress(sent, size)
                    }
                }
            }
        }

        val code = connection.responseCode
        if (code in 200..299) {
            "Gửi tệp hoàn tất."
        } else {
            val error = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            "Gửi tệp thất bại: HTTP $code ${error.take(120)}"
        }
    } catch (error: Exception) {
        "Gửi tệp thất bại. Kiểm tra gỡ lỗi USB và adb reverse."
    } finally {
        connection.disconnect()
    }
}

private data class PickedFileInfo(
    val name: String,
    val size: Long?
)

private fun Context.readFileInfo(uri: Uri): PickedFileInfo {
    var name = uri.lastPathSegment ?: "selected-file"
    var size: Long? = null

    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) {
                name = cursor.getString(nameIndex) ?: name
            }
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                size = cursor.getLong(sizeIndex)
            }
        }
    }

    return PickedFileInfo(name, size)
}

private fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = arrayOf("KB", "MB", "GB")
    var value = bytes / 1024.0
    var index = 0
    while (value >= 1024 && index < units.lastIndex) {
        value /= 1024.0
        index++
    }
    return "%.1f %s".format(value, units[index])
}