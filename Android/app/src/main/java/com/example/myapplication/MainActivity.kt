package com.example.myapplication

import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Icon
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.myapplication.ui.theme.MyApplicationTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.LaunchedEffect
import java.io.IOException
import org.json.JSONObject
private const val BACKEND_URL = "http://127.0.0.1:7878"
private const val MAX_UPLOAD_BYTES = 2L * 1024L * 1024L * 1024L
private const val RECEIVED_FILE_PREFS = "scft_received_files"
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
    private fun renderIntent(source: Intent) {
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                ScftApp(
                    initialScreen = source.getStringExtra("scft_screen"),
                    initialDisplay = source.getIntExtra("scft_display", 1),
                    initialDisplayId = source.getStringExtra("scft_display_id") ?: "",
                    initialBaseUrl = source.getStringExtra("scft_base_url") ?: "http://127.0.0.1:7878",
                    initialPresetId = source.getStringExtra("scft_preset"),
                    initialSessionId = source.getStringExtra("scft_session_id") ?: "",
                    initialGeneration = source.getLongExtra("scft_generation", 0L),
                    initialAttempt = source.getIntExtra("scft_attempt", 1),
                    autoStart = source.getBooleanExtra("scft_autostart", false),
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        renderIntent(intent)
    }
}

@Composable
fun ScftApp(initialScreen: String?, initialDisplay: Int, initialDisplayId: String, initialBaseUrl: String, initialPresetId: String?, initialSessionId: String, initialGeneration: Long, initialAttempt: Int, autoStart: Boolean, modifier: Modifier = Modifier) {
    var currentScreen by rememberSaveable(initialScreen, initialSessionId, initialGeneration) {
        mutableStateOf(if (initialScreen == "pc") "pc" else "home")
    }

    if (currentScreen == "pc") {
        key(initialSessionId, initialGeneration, initialPresetId) {
            PcScreenViewerScreen(modifier = modifier, displayIndex = initialDisplay, displayId = initialDisplayId, baseUrl = initialBaseUrl, initialPresetId = initialPresetId, sessionId = initialSessionId, generation = initialGeneration, attempt = initialAttempt, autoStart = autoStart, onBack = { currentScreen = "transfer" })
        }
        return
    }

    if (currentScreen == "home") {
        MobileHomeScreen(
            modifier = modifier,
            onOpenTransfer = { currentScreen = "transfer" },
            onOpenPcScreen = { currentScreen = "pc" }
        )
    } else {
        UsbFileTransferScreen(
            modifier = modifier,
            onOpenPcScreen = { currentScreen = "pc" },
            onOpenHome = { currentScreen = "home" }
        )
    }
}

@Composable
private fun MobileHomeScreen(
    modifier: Modifier = Modifier,
    onOpenTransfer: () -> Unit,
    onOpenPcScreen: () -> Unit
) {
    var device by remember { mutableStateOf<PcDeviceInfo?>(null) }
    var connection by remember { mutableStateOf<AndroidConnectionStatus?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
        try {
            val snapshot = fetchPcConnectionInfo()
            device = snapshot.device
            connection = snapshot.connection
            error = null
        } catch (exception: Exception) {
            device = null
            connection = null
            error = exception.message ?: "Không thể kết nối đến máy tính."
        } finally {
            loading = false
        }
        delay(5000)
        }
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            MobileDrawerContent(
                activeScreen = "home",
                onHome = { drawerScope.launch { drawerState.close() } },
                onTransfer = { drawerScope.launch { drawerState.close(); onOpenTransfer() } },
                onScreen = { drawerScope.launch { drawerState.close(); onOpenPcScreen() } }
            )
        }
    ) {
    Scaffold(
        modifier = modifier,
        containerColor = AppBackground,
        topBar = {
            MobileHeader(onMenu = { drawerScope.launch { drawerState.open() } })
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
            Text(
                text = "Trang chủ",
                color = AppText,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )

            PcConnectionCard(device = device, connection = connection, loading = loading, error = error)
            UsbGuideCard()
        }
    }
    }
}

@Composable
private fun PcConnectionCard(
    device: PcDeviceInfo?,
    connection: AndroidConnectionStatus?,
    loading: Boolean,
    error: String?
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = if (connection?.connected == true) "Máy tính đang kết nối" else "Chưa kết nối máy tính",
                color = AppText,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            when {
                loading -> Text("Đang kiểm tra kết nối...", color = AppMuted)
                device != null && connection?.connected == true -> {
                    Text("Tên máy: ${device.name}", color = AppText)
                    Text("ID: ${device.id}", color = AppMuted)
                    Text("IP: ${device.ip}:${device.port}", color = AppMuted)
                    Text("Kết nối từ: ${formatConnectionTime(connection.connectedAt)}", color = AppMuted)
                    Text("USB/ADB: Đã kết nối và được cấp quyền", color = AppSuccess)
                }
                else -> {
                    Text("Hãy kết nối điện thoại qua USB và mở SCFT Desktop.", color = AppMuted)
                    Text("Bật gỡ lỗi USB và chấp nhận thông báo trên điện thoại.", color = AppMuted)
                }
            }
        }
    }
}

@Composable
private fun MobileNavigationBar(
    activeScreen: String,
    onHome: () -> Unit,
    onTransfer: () -> Unit,
    onScreen: () -> Unit
) {
    Surface(color = AppSurface, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            MobileNavButton("⌂", "Home", activeScreen == "home", onHome)
            MobileNavButton("↔", "FT", activeScreen == "transfer", onTransfer)
            MobileNavButton("▣", "SC", false, onScreen)
        }
    }
}

@Composable
private fun RowScope.MobileNavButton(icon: String, label: String, active: Boolean, onClick: () -> Unit) {
    val background = if (active) AppPrimarySoft else Color.Transparent
    OutlinedButton(
        modifier = Modifier.weight(1f),
        onClick = onClick,
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = background,
            contentColor = AppText
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (active) AppPrimary else AppBorder),
        shape = RoundedCornerShape(10.dp)
    ) {
        Text("$icon  $label", fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
private fun MobileHeader(onMenu: () -> Unit) {
    Surface(color = AppSurface, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("SCFT", color = AppText, fontWeight = FontWeight.Bold)
                Text("Screen Copy & File Transfer", color = AppMuted, style = MaterialTheme.typography.labelMedium)
            }
            OutlinedButton(
                onClick = onMenu,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AppText),
                border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("☰", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun MobileDrawerContent(
    activeScreen: String,
    onHome: () -> Unit,
    onTransfer: () -> Unit,
    onScreen: () -> Unit
) {
    ModalDrawerSheet {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("SCFT", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("Screen Copy & File Transfer", color = AppMuted)
            Spacer(modifier = Modifier.height(12.dp))
            MobileDrawerItem("home", "Trang chủ", activeScreen == "home", onHome)
            MobileDrawerItem("transfer", "Truyền tệp", activeScreen == "transfer", onTransfer)
            MobileDrawerItem("screen", "Màn hình PC", false, onScreen)
        }
    }
}

@Composable
private fun MobileDrawerItem(
    icon: String,
    label: String,
    active: Boolean,
    onClick: () -> Unit
) {
    val background = if (active) Color(0xFFE5FCFF) else Color.Transparent
    val contentColor = if (active) Color.Black else AppText

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .clickable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        PcStyleNavIcon(icon, contentColor)
        Spacer(modifier = Modifier.width(12.dp))
        Text(label, color = contentColor, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable
private fun PcStyleNavIcon(type: String, color: Color) {
    val iconRes = when (type) {
        "home" -> R.drawable.ic_home
        "transfer" -> R.drawable.ic_open_folder
        else -> R.drawable.ic_duplicate
    }
    Icon(
        painter = painterResource(iconRes),
        contentDescription = null,
        tint = color,
        modifier = Modifier.size(28.dp)
    )
}

@Composable
fun UsbFileTransferScreen(
    modifier: Modifier = Modifier,
    onOpenPcScreen: () -> Unit,
    onOpenHome: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var selectedName by remember { mutableStateOf("Chưa chọn tệp") }
    var selectedSize by remember { mutableStateOf<Long?>(null) }
    var status by remember { mutableStateOf("Kết nối USB, bật gỡ lỗi USB rồi chọn tệp cần gửi.") }
    var uploading by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var remoteFiles by remember {
        mutableStateOf<List<RemoteFile>>(emptyList())
    }
    var loadingRemoteFiles by remember {
        mutableStateOf(false)
    }
    var remoteFilesError by remember {
        mutableStateOf<String?>(null)
    }
    var knownRemoteFileIds by remember { mutableStateOf<Set<String>?>(null) }
    var pendingDownloadFile by remember {
        mutableStateOf<RemoteFile?>(null)
    }
    var downloadingFileId by remember {
        mutableStateOf<String?>(null)
    }
    var deletingFileId by remember { mutableStateOf<String?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    suspend fun refreshRemoteFiles(showLoading: Boolean = true) {
        if (showLoading) {
            loadingRemoteFiles = true
        }
        try {
            val latestFiles = fetchRemoteFiles()
            val previousIds = knownRemoteFileIds
            remoteFiles = latestFiles
            knownRemoteFileIds = latestFiles.map { it.id }.toSet()

            if (previousIds != null && pendingDownloadFile == null) {
                val newPcFile = latestFiles.firstOrNull { file ->
                    file.id !in previousIds &&
                        !file.senderDeviceId.startsWith("android-") &&
                        savedUriFor(context, file.id) == null &&
                        !wasPromptedFor(context, file.id)
                }
                if (newPcFile != null) {
                    markPrompted(context, newPcFile.id)
                    pendingDownloadFile = newPcFile
                }
            }
            remoteFilesError = null
            if (!uploading) {
                status = "Đã kết nối USB/ADB, sẵn sàng truyền tệp."
            }
        } catch (error: Exception) {
            remoteFilesError = error.message ?: "Không thể tải danh sách file."
            if (!uploading) {
                status = "Chưa kết nối USB/ADB hoặc SCFT Desktop chưa sẵn sàng."
            }
        } finally {
            if (showLoading) {
                loadingRemoteFiles = false
            }
        }
    }

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

    val downloadPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { destinationUri ->
        val file = pendingDownloadFile
        pendingDownloadFile = null

        if (destinationUri == null || file == null) return@rememberLauncherForActivityResult

        downloadingFileId = file.id
        scope.launch {
            val result = downloadRemoteFile(context, file, destinationUri)
            status = result.message
            if (result.success) {
                saveLocalUri(context, file.id, destinationUri)
                snackbarHostState.showSnackbar("Đã nhận file ${file.originalName}.")
            }
            downloadingFileId = null
        }
    }

    LaunchedEffect(pendingDownloadFile) {
        pendingDownloadFile?.let { file ->
            downloadPicker.launch(file.originalName)
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            refreshRemoteFiles(showLoading = false)
            delay(2500)
        }
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            MobileDrawerContent(
                activeScreen = "transfer",
                onHome = { drawerScope.launch { drawerState.close(); onOpenHome() } },
                onTransfer = { drawerScope.launch { drawerState.close() } },
                onScreen = { drawerScope.launch { drawerState.close(); onOpenPcScreen() } }
            )
        }
    ) {
    Scaffold(
        modifier = modifier,
        containerColor = AppBackground,
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            if (false) {
            Surface(color = AppSurface, shadowElevation = 1.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 5.dp),
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
                            text = "Screen Copy & File Transfer",
                            color = AppMuted,
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                    OutlinedButton(
                        onClick = onOpenPcScreen,
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color.Black
                        ),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.Black),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Màn hình PC")
                    }
                }
            }
            }
            MobileHeader(onMenu = { drawerScope.launch { drawerState.open() } })
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
            TransferStatusCard(status)
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
                        if (!result.contains("thất bại", ignoreCase = true)) {
                            snackbarHostState.showSnackbar("Đã gửi file lên máy tính.")
                        }
                    }
                },
                canUpload = selectedUri != null && !uploading && (selectedSize ?: 0L) <= MAX_UPLOAD_BYTES
            )

            if (uploading) {
                UploadProgress(progress)
            }

            RemoteFilesCard(
                files = remoteFiles,
                loading = loadingRemoteFiles,
                error = remoteFilesError,
                downloadingFileId = downloadingFileId,
                deletingFileId = deletingFileId,
                onRefresh = {
                    scope.launch {
                        refreshRemoteFiles()
                    }
                },
                onDelete = { file ->
                    deletingFileId = file.id
                    scope.launch {
                        val result = deleteRemoteFile(context, file)
                        if (result == null) {
                            remoteFiles = remoteFiles.filterNot { it.id == file.id }
                            snackbarHostState.showSnackbar("Đã xóa file và nhật ký nhận file.")
                        } else {
                            snackbarHostState.showSnackbar(result)
                        }
                        deletingFileId = null
                    }
                }
            )

        }
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
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color.Black
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.Black),
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
    val isError = status.contains("lỗi", ignoreCase = true) || status.contains("thất bại", ignoreCase = true) || status.contains("vượt quá", ignoreCase = true) || status.contains("Chưa kết nối", ignoreCase = true)
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
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = AppSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, AppBorder)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Chuẩn bị kết nối USB", color = AppText, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("Làm đủ ba bước dưới đây để truyền tệp và màn hình ổn định.", color = AppMuted, style = MaterialTheme.typography.bodySmall)
            UsbGuideStep("1", "Dùng cáp USB có truyền dữ liệu")
            UsbGuideStep("2", "Bật gỡ lỗi USB và xác nhận thông báo trên điện thoại")
            UsbGuideStep("3", "Giữ SCFT Desktop đang chạy trong lúc sử dụng")
        }
    }
}

@Composable
private fun UsbGuideStep(number: String, text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier.size(40.dp),
            color = AppSurface,
            shape = CircleShape,
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.Black)
        ) {
            Box(contentAlignment = Alignment.Center) {
            Text(number, color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(modifier = Modifier.width(10.dp))
        Text(text, color = AppMuted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun RemoteFilesCard(
    files: List<RemoteFile>,
    loading: Boolean,
    error: String?,
    downloadingFileId: String?,
    deletingFileId: String?,
    onRefresh: () -> Unit,
    onDelete: (RemoteFile) -> Unit
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "File đã được truyền",
                        color = AppText,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Các file đã được gửi lên SCFT",
                        color = AppMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                OutlinedButton(
                    onClick = onRefresh,
                    enabled = !loading,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color.Black
                    ),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.Black),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(if (loading) "Đang tải" else "Làm mới")
                }
            }

            HorizontalDivider(color = AppBorder)

            when {
                loading -> {
                    Text(
                        text = "Đang tải danh sách file...",
                        color = AppMuted,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                error != null -> {
                    Text(
                        text = "Không thể tải danh sách file: $error",
                        color = AppWarning,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                files.isEmpty() -> {
                    Text(
                        text = "Chưa có file nào từ máy tính.",
                        color = AppMuted,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                else -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        files.forEach { file ->
                            RemoteFileRow(
                                file = file,
                                downloading = downloadingFileId == file.id,
                                deleting = deletingFileId == file.id,
                                onDelete = { onDelete(file) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RemoteFileRow(
    file: RemoteFile,
    downloading: Boolean,
    deleting: Boolean,
    onDelete: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = AppBackground,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .background(AppPrimarySoft, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "FILE",
                    color = AppPrimary,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.originalName,
                    color = AppText,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = formatBytes(file.size),
                    color = AppMuted,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            OutlinedButton(
                onClick = onDelete,
                enabled = !downloading && !deleting,
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Color.Black
                ),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color.Black),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(if (deleting) "Đang xóa" else "Xóa")
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
private suspend fun fetchRemoteFiles(): List<RemoteFile> =
    withContext(Dispatchers.IO) {
        val url = URL("$BACKEND_URL/api/files")
        val connection = url.openConnection() as HttpURLConnection

        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 7000
            connection.readTimeout = 30000

            val responseCode = connection.responseCode
            val responseStream =
                if (responseCode in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

            val responseBody = responseStream
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()

            if (responseCode !in 200..299) {
                throw IOException("HTTP $responseCode: $responseBody")
            }

            val json = JSONObject(responseBody)
            val jsonFiles = json.optJSONArray("files") ?: return@withContext emptyList()

            buildList {
                for (index in 0 until jsonFiles.length()) {
                    val item = jsonFiles.getJSONObject(index)

                    add(
                        RemoteFile(
                            id = item.getString("id"),
                            originalName = item.getString("originalName"),
                            size = item.optLong("size", 0L),
                            senderDeviceId = item.optString("senderDeviceId"),
                            uploadedAt = item.optString("uploadedAt"),
                            downloadUrl = item.getString("downloadUrl")
                        )
                    )
                }
            }
        } finally {
            connection.disconnect()
        }
    }

private suspend fun fetchPcDeviceInfo(): PcDeviceInfo =
    withContext(Dispatchers.IO) {
        val connection = (URL("$BACKEND_URL/api/device").openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 7000
            connection.readTimeout = 10000
            val responseCode = connection.responseCode
            val body = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            if (responseCode !in 200..299) {
                throw IOException("HTTP $responseCode")
            }
            val json = JSONObject(body)
            PcDeviceInfo(
                id = json.optString("id", "-"),
                name = json.optString("name", "SCFT Desktop"),
                ip = json.optString("ip", "-"),
                port = json.optInt("port", 7878)
            )
        } finally {
            connection.disconnect()
        }
    }

private suspend fun fetchPcConnectionInfo(): PcConnectionSnapshot =
    withContext(Dispatchers.IO) {
        val device = fetchPcDeviceInfo()
        val connection = fetchAndroidConnectionStatus()
        PcConnectionSnapshot(device, connection)
    }

private suspend fun fetchAndroidConnectionStatus(): AndroidConnectionStatus =
    withContext(Dispatchers.IO) {
        val connection = (URL("$BACKEND_URL/api/android/status").openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 7000
            connection.readTimeout = 10000
            val responseCode = connection.responseCode
            val body = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            if (responseCode !in 200..299) {
                throw IOException("HTTP $responseCode")
            }
            val json = JSONObject(body)
            AndroidConnectionStatus(
                connected = json.optBoolean("connected", false),
                deviceId = json.optString("deviceId"),
                deviceName = json.optString("deviceName"),
                connectedAt = json.optString("connectedAt").takeIf { it.isNotBlank() && it != "null" },
                transport = json.optString("transport", "USB")
            )
        } finally {
            connection.disconnect()
        }
    }

private fun formatConnectionTime(value: String?): String {
    if (value.isNullOrBlank()) return "-"
    return value.substringAfter('T').substringBefore('Z').take(8)
}

private suspend fun downloadRemoteFile(
    context: Context,
    file: RemoteFile,
    destinationUri: Uri
): DownloadResult = withContext(Dispatchers.IO) {
    val url = URL("$BACKEND_URL${file.downloadUrl}")
    val connection = url.openConnection() as HttpURLConnection

    try {
        connection.requestMethod = "GET"
        connection.connectTimeout = 7000
        connection.readTimeout = 30000

        val responseCode = connection.responseCode
        if (responseCode !in 200..299) {
            val error = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            return@withContext DownloadResult(
                "Tải file thất bại: HTTP $responseCode ${error.take(120)}",
                false
            )
        }

        val output = context.contentResolver.openOutputStream(destinationUri)
            ?: return@withContext DownloadResult("Không thể mở nơi lưu file.", false)

        connection.inputStream.use { input ->
            output.use { target ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    target.write(buffer, 0, read)
                }
                target.flush()
            }
        }

        DownloadResult("Đã tải file ${file.originalName} xuống điện thoại.", true)
    } catch (error: Exception) {
        DownloadResult("Tải file thất bại: ${error.message ?: "Lỗi kết nối"}", false)
    } finally {
        connection.disconnect()
    }
}

private data class DownloadResult(
    val message: String,
    val success: Boolean
)

private suspend fun deleteRemoteFile(context: Context, file: RemoteFile): String? =
    withContext(Dispatchers.IO) {
        val url = URL("$BACKEND_URL/api/files/${URLEncoder.encode(file.id, "UTF-8")}")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "DELETE"
            connection.connectTimeout = 7000
            connection.readTimeout = 30000
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                return@withContext "Không thể xóa file trên máy tính: HTTP $responseCode"
            }

            savedUriFor(context, file.id)?.let { uriText ->
                context.contentResolver.delete(Uri.parse(uriText), null, null)
            }
            removeLocalUri(context, file.id)
            null
        } catch (error: Exception) {
            "Không thể xóa file. Kiểm tra kết nối USB."
        } finally {
            connection.disconnect()
        }
    }

private data class PickedFileInfo(
    val name: String,
    val size: Long?
)

private data class RemoteFile(
    val id: String,
    val originalName: String,
    val size: Long,
    val senderDeviceId: String,
    val uploadedAt: String,
    val downloadUrl: String
)

private data class PcDeviceInfo(
    val id: String,
    val name: String,
    val ip: String,
    val port: Int
)

private data class PcConnectionSnapshot(
    val device: PcDeviceInfo,
    val connection: AndroidConnectionStatus
)

private data class AndroidConnectionStatus(
    val connected: Boolean,
    val deviceId: String,
    val deviceName: String,
    val connectedAt: String?,
    val transport: String
)

private fun receivedFilePreferences(context: Context) =
    context.getSharedPreferences(RECEIVED_FILE_PREFS, Context.MODE_PRIVATE)

private fun savedUriFor(context: Context, fileId: String): String? =
    receivedFilePreferences(context).getString("uri_$fileId", null)

private fun saveLocalUri(context: Context, fileId: String, uri: Uri) {
    receivedFilePreferences(context).edit().putString("uri_$fileId", uri.toString()).apply()
}

private fun removeLocalUri(context: Context, fileId: String) {
    receivedFilePreferences(context).edit().remove("uri_$fileId").apply()
}

private fun wasPromptedFor(context: Context, fileId: String): Boolean =
    receivedFilePreferences(context).getBoolean("prompted_$fileId", false)

private fun markPrompted(context: Context, fileId: String) {
    receivedFilePreferences(context).edit().putBoolean("prompted_$fileId", true).apply()
}

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
