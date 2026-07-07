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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    UsbFileTransferScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun UsbFileTransferScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var selectedName by remember { mutableStateOf("No file selected") }
    var selectedSize by remember { mutableStateOf<Long?>(null) }
    var status by remember { mutableStateOf("Connect USB, enable USB debugging, then choose a file.") }
    var uploading by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        selectedUri = uri
        if (uri == null) {
            selectedName = "No file selected"
            selectedSize = null
            return@rememberLauncherForActivityResult
        }
        val info = context.readFileInfo(uri)
        selectedName = info.name
        selectedSize = info.size
        status = if ((info.size ?: 0L) > MAX_UPLOAD_BYTES) {
            "File is larger than 2GB."
        } else {
            "Ready to upload through USB tunnel."
        }
        progress = 0f
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "SCFT USB File Transfer",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(text = "Target", fontWeight = FontWeight.Bold)
                Text(text = BACKEND_URL)
                Text(text = "Transport: USB cable via ADB reverse tunnel")
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(text = "Selected file", fontWeight = FontWeight.Bold)
                Text(text = selectedName)
                Text(text = selectedSize?.let { formatBytes(it) } ?: "-")

                Row {
                    OutlinedButton(
                        enabled = !uploading,
                        onClick = { picker.launch(arrayOf("*/*")) }
                    ) {
                        Text("Choose file")
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Button(
                        enabled = selectedUri != null && !uploading && (selectedSize ?: 0L) <= MAX_UPLOAD_BYTES,
                        onClick = {
                            val uri = selectedUri ?: return@Button
                            uploading = true
                            status = "Uploading..."
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
                        }
                    ) {
                        Text("Upload")
                    }
                }

                if (uploading) {
                    LinearProgressIndicator(
                        progress = { progress.coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(text = "Status", fontWeight = FontWeight.Bold)
                Text(text = status)
            }
        }
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
    if (size > MAX_UPLOAD_BYTES) return@withContext "File is larger than 2GB."

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
            if (rawInput == null) return@withContext "Cannot open selected file."
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
            "Upload completed."
        } else {
            val error = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            "Upload failed: HTTP $code ${error.take(120)}"
        }
    } catch (error: Exception) {
        "Upload failed. Check USB debugging and adb reverse."
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
