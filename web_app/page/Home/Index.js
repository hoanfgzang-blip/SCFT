const BACKEND_URL = "http://127.0.0.1:7878";
const POLL_INTERVAL_MS = 3000;

const state = {
    adbPath: null,
    pollTimer: null,
    refreshing: false,
    backendOnline: false,
    androidOnline: false,
    captureOnline: false,
    androidConnectedAt: null,
    androidDeviceId: ""
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    elements.refreshButton.addEventListener("click", () => refreshStatus(true));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", stopLiveUpdates);
    startLiveUpdates();
});

function bindElements() {
    elements.refreshButton = document.getElementById("refresh_status_btn");
    elements.lastUpdated = document.getElementById("last_updated_text");
    elements.backend = getStatusElements("backend");
    elements.android = getStatusElements("android");
    elements.capture = getStatusElements("capture");
    elements.fileTransfer = getStatusElements("file_transfer");
    elements.connectionTime = document.getElementById("connection_time_text");
    elements.connectionSummary = document.getElementById("connection_summary");
    elements.homeNotice = document.getElementById("home_notice");
    elements.nextStepTitle = document.getElementById("next_step_title");
    elements.nextStepDetail = document.getElementById("next_step_detail");
    elements.primaryAction = document.getElementById("primary_action");
    elements.screenAction = document.getElementById("screen_action");
}

function getStatusElements(name) {
    return {
        badge: document.getElementById(`${name}_badge`),
        value: document.getElementById(`${name}_value`),
        detail: document.getElementById(`${name}_detail`)
    };
}

function startLiveUpdates() {
    stopLiveUpdates();
    refreshStatus(true);
    state.pollTimer = window.setInterval(() => refreshStatus(false), POLL_INTERVAL_MS);
}

function stopLiveUpdates() {
    if (state.pollTimer) {
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopLiveUpdates();
        return;
    }

    startLiveUpdates();
}

async function refreshStatus(showChecking) {
    if (state.refreshing) return;

    state.refreshing = true;
    state.backendOnline = false;
    state.captureOnline = false;
    if (elements.refreshButton) {
        elements.refreshButton.disabled = true;
        elements.refreshButton.textContent = "Đang kiểm tra...";
    }

    if (showChecking) {
        setStatus(elements.backend, "Đang kiểm tra", "Đang kiểm tra dịch vụ cục bộ...", BACKEND_URL, false);
        setStatus(elements.android, "Đang kiểm tra", "Đang kiểm tra ADB...", "Cần bật gỡ lỗi USB", false);
        setStatus(elements.capture, "Đang kiểm tra", "Đang kiểm tra dịch vụ màn hình...", "Chiếu màn hình PC", false);
        setStatus(elements.fileTransfer, "Đang kiểm tra", "Đang kiểm tra khả năng truyền tệp...", "Cần Backend và USB/ADB", false);
    }

    try {
        await Promise.all([checkBackend(), checkAndroid()]);
    } finally {
        state.refreshing = false;
        if (elements.refreshButton) {
            elements.refreshButton.disabled = false;
            elements.refreshButton.textContent = "Cập nhật trạng thái";
        }
        updateFileTransferStatus();
        updateConnectionSummary();
        updateNextStep();
        elements.lastUpdated.textContent = `Cập nhật lúc ${formatTime(new Date())}`;
    }
}

async function checkBackend() {
    try {
        const [healthResponse, deviceResponse] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/health`),
            fetchWithTimeout(`${BACKEND_URL}/api/device`),
        ]);

        if (!healthResponse.ok || !deviceResponse.ok) {
            throw new Error("Backend is not ready.");
        }

        const device = await deviceResponse.json();
        state.backendOnline = true;
        setStatus(
            elements.backend,
            "Trực tuyến",
            "Máy chủ cục bộ đang hoạt động",
            `http://${device.ip || "127.0.0.1"}:${device.port || 7878}`,
            true
        );

        return;

        if (!screenResponse.ok) {
            state.captureOnline = false;
            setStatus(elements.capture, "Ngoại tuyến", "Dịch vụ màn hình chưa khả dụng", "Mở Chiếu màn hình PC sau khi khởi động máy chủ", false);
            return;
        }

        const screen = await screenResponse.json();
        if (!screen.available) {
            state.captureOnline = false;
            setStatus(elements.capture, "Ngoại tuyến", "Chưa thể chụp màn hình", screen.error || "Mở Chiếu màn hình PC để thử lại", false);
            return;
        }

        const displayCount = Number(screen.displays) || 1;
        state.captureOnline = true;
        setStatus(
            elements.capture,
            "Sẵn sàng",
            `${displayCount} màn hình khả dụng`,
            "Sẵn sàng chiếu màn hình PC",
            true
        );
    } catch (error) {
        setStatus(elements.backend, "Ngoại tuyến", "Máy chủ đang ngoại tuyến", "Mở lại SCFT để khởi động dịch vụ cục bộ", false);
        setStatus(elements.capture, "Ngoại tuyến", "Dịch vụ màn hình chưa khả dụng", "Máy chủ cần hoạt động", false);
    }
}

async function checkAndroid() {
    if (typeof require !== "function") {
        setStatus(elements.android, "Không khả dụng", "Chỉ kiểm tra ADB được trong ứng dụng SCFT trên máy tính", "Mở trang này bằng ứng dụng Electron", false);
        return;
    }

    try {
        const devices = await runAdb(["devices"]);
        const connected = devices
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => isUsbAdbDeviceLine(line));

        if (!connected) {
            if (state.androidDeviceId) {
                localStorage.removeItem(`SCFT_AndroidConnectedAt_${state.androidDeviceId}`);
            }
            state.androidOnline = false;
            state.captureOnline = false;
            state.androidDeviceId = "";
            state.androidConnectedAt = null;
            elements.connectionTime.textContent = "-";
            await syncAndroidStatus({ connected: false });
            setStatus(elements.capture, "Ngoại tuyến", "Sao chép màn hình chưa khả dụng", "Hãy kết nối điện thoại Android qua USB", false);
            setStatus(elements.android, "Ngoại tuyến", "Không có thiết bị Android đã được cấp quyền", "Kết nối USB và chấp nhận thông báo gỡ lỗi trên điện thoại", false);
            return;
        }

        const deviceId = connected.split("\t")[0];
        const properties = await runAdb(["-s", deviceId, "shell", "getprop"]);
        const deviceName = getAndroidDeviceName(deviceId, properties);
        const storageKey = `SCFT_AndroidConnectedAt_${deviceId}`;
        const savedConnectedAtMs = Number(localStorage.getItem(storageKey));
        const isNewDevice = !state.androidOnline || state.androidDeviceId !== deviceId;
        if (isNewDevice) {
            const connectedAtMs = savedConnectedAtMs > 0 ? savedConnectedAtMs : Date.now();
            localStorage.setItem(storageKey, String(connectedAtMs));
            state.androidConnectedAt = new Date(connectedAtMs);
        }
        state.androidDeviceId = deviceId;
        state.androidOnline = true;
        state.captureOnline = true;
        elements.connectionTime.textContent = formatTime(state.androidConnectedAt);
        await syncAndroidStatus({
            connected: true,
            deviceId,
            deviceName,
            connectedAtMs: state.androidConnectedAt.getTime()
        });
        setStatus(elements.capture, "Sẵn sàng", "Sao chép màn hình khả dụng", "Sẵn sàng nhận màn hình Android", true);
        setStatus(elements.android, "Sẵn sàng", deviceName, "USB/ADB đã kết nối và được cấp quyền", true);
    } catch (error) {
        state.captureOnline = false;
        state.androidOnline = false;
        state.androidDeviceId = "";
        setStatus(elements.capture, "Ngoại tuyến", "Sao chép màn hình chưa khả dụng", "Kiểm tra kết nối USB và ADB", false);
        state.androidConnectedAt = null;
        elements.connectionTime.textContent = "-";
        await syncAndroidStatus({ connected: false });
        setStatus(elements.android, "Ngoại tuyến", "ADB chưa khả dụng", "Cài Android platform-tools hoặc đặt SCFT_ADB_PATH", false);
    }
}

async function syncAndroidStatus(status) {
    try {
        const params = new URLSearchParams({
            connected: String(Boolean(status.connected))
        });
        if (status.connected) {
            params.set("deviceId", status.deviceId);
            params.set("deviceName", status.deviceName);
            params.set("connectedAtMs", String(status.connectedAtMs));
        }

        await fetchWithTimeout(`${BACKEND_URL}/api/android/status?${params.toString()}`, {
            method: "POST"
        });
    } catch (error) {
        // Backend may be unavailable while ADB is still being discovered.
    }
}

function isUsbAdbDeviceLine(line) {
    const match = line.match(/^(\S+)\s+device$/);
    if (!match) return false;

    const deviceId = match[1];
    const isEmulator = deviceId.startsWith("emulator-");
    const isWirelessAdb = deviceId.includes(":");

    return !isEmulator && !isWirelessAdb;
}

function getAndroidDeviceName(deviceId, properties) {
    const manufacturer = getAndroidProperty(properties, "ro.product.manufacturer")
        || getAndroidProperty(properties, "ro.product.brand");
    const model = getAndroidProperty(properties, "ro.product.marketname")
        || getAndroidProperty(properties, "ro.product.model")
        || getAndroidProperty(properties, "ro.product.system.model")
        || getAndroidProperty(properties, "ro.product.vendor.model")
        || getAndroidProperty(properties, "ro.product.name")
        || getAndroidProperty(properties, "ro.product.device");
    const parts = [manufacturer, model]
        .map(value => value.trim())
        .filter((value, index, values) => value && !values.slice(0, index).some(item => item.toLowerCase() === value.toLowerCase()));

    return parts.join(" ") || `Thiết bị Android (${deviceId})`;
}

function getAndroidProperty(properties, name) {
    const match = properties.match(new RegExp(`\\[${name.replace(/\\./g, "\\\\.")}\\]: \\[(.*?)\\]`));
    return match ? match[1].trim() : "";
}

function applyMockConnectedState() {
    state.backendOnline = true;
    state.androidOnline = true;
    state.captureOnline = true;
    state.androidConnectedAt = new Date(Date.now() - 18 * 60 * 1000);

    setStatus(
        elements.backend,
        "Sẵn sàng",
        "Backend đang hoạt động",
        `${BACKEND_URL}`,
        true
    );
    setStatus(
        elements.android,
        "Sẵn sàng",
        "OPPO Reno13 F 5G",
        "USB/ADB đã kết nối và được cấp quyền",
        true
    );
    setStatus(
        elements.capture,
        "Sẵn sàng",
        "Chiếu màn hình khả dụng",
        "Sẵn sàng chiếu màn hình PC",
        true
    );
    setStatus(
        elements.fileTransfer,
        "Sẵn sàng",
        "Truyền tệp khả dụng",
        "Tốc độ gần nhất: 12.4 MB/s",
        true
    );

    elements.connectionTime.textContent = formatTime(state.androidConnectedAt);
    updateConnectionSummary();
    elements.lastUpdated.textContent = `Dữ liệu mock lúc ${formatTime(new Date())}`;
    elements.refreshButton.textContent = "Đang xem mock";
    elements.refreshButton.disabled = true;
    updateNextStep();
}

function updateFileTransferStatus() {
    if (!state.backendOnline || !state.androidOnline) {
        setStatus(
            elements.fileTransfer,
            "Chưa sẵn sàng",
            "Truyền tệp chưa khả dụng",
            "Cần Backend và điện thoại USB/ADB đã cấp quyền",
            false
        );
        return;
    }

    const lastSpeed = Number(localStorage.getItem("SCFT_LastTransferSpeed"));
    const speedText = lastSpeed > 0
        ? `Tốc độ gần nhất: ${formatTransferSpeed(lastSpeed)}`
        : "Tốc độ ước tính: chưa có dữ liệu";

    setStatus(
        elements.fileTransfer,
        "Sẵn sàng",
        "Truyền tệp khả dụng",
        speedText,
        true
    );
}

function updateConnectionSummary() {
    if (state.backendOnline && state.androidOnline && state.captureOnline) {
        elements.connectionSummary.textContent = "Tất cả hệ thống đang hoạt động. Hãy trải nghiệm SCFT nhé ^^";
        elements.connectionSummary.className = "connection-summary ready";
        return;
    }

    let message = "Chưa sẵn sàng kết nối đầy đủ.";
    if (!state.backendOnline) {
        message = "Backend chưa hoạt động. Hãy khởi động lại SCFT Desktop.";
    } else if (!state.androidOnline) {
        message = "Hãy kết nối điện thoại qua USB và cấp quyền gỡ lỗi USB.";
    } else if (!state.captureOnline) {
        message = "Thiết bị đã kết nối nhưng chức năng màn hình chưa sẵn sàng.";
    }

    elements.connectionSummary.textContent = message;
    elements.connectionSummary.className = "connection-summary warning";
}

function formatTransferSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => window.clearTimeout(timer));
}

function runAdb(args) {
    const { execFile } = require("child_process");
    const os = require("os");
    const path = require("path");
    const candidates = state.adbPath ? [state.adbPath] : getAdbCandidates(os, path);

    return new Promise((resolve, reject) => {
        function tryCandidate(index) {
            if (index >= candidates.length) {
                reject(new Error("ADB not found."));
                return;
            }

            const command = candidates[index];
            execFile(command, args, { windowsHide: true, timeout: 2500 }, (error, stdout, stderr) => {
                if (error && error.code === "ENOENT") {
                    tryCandidate(index + 1);
                    return;
                }

                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }

                state.adbPath = command;
                resolve(stdout);
            });
        }

        tryCandidate(0);
    });
}

function getAdbCandidates(os, path) {
    const localAppData = process.env.LOCALAPPDATA;
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const candidates = [
        process.env.SCFT_ADB_PATH,
        localAppData && path.join(localAppData, "Android", "Sdk", "platform-tools", "adb.exe"),
        androidHome && path.join(androidHome, "platform-tools", "adb.exe"),
        path.join(os.homedir(), "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"),
        path.join(process.resourcesPath || "", "platform-tools", "adb.exe"),
        "adb.exe",
        "adb"
    ];

    return [...new Set(candidates.filter(Boolean))];
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setStatus(target, badgeText, value, detail, online) {
    if (!target || !target.badge || !target.value || !target.detail) {
        return;
    }

    target.badge.textContent = badgeText;
    target.value.textContent = value;
    target.detail.textContent = detail;
    target.badge.classList.toggle("online", online);
    target.badge.classList.toggle("offline", !online);
}
function updateNextStep() {
    if (!state.backendOnline) {
        elements.nextStepTitle.textContent = "Máy chủ SCFT chưa hoạt động";
        elements.nextStepDetail.textContent = "Mở lại ứng dụng SCFT Desktop để khởi động dịch vụ cục bộ.";
        elements.primaryAction.textContent = "Cập nhật trạng thái";
        elements.primaryAction.href = "#";
        elements.primaryAction.onclick = event => {
            event.preventDefault();
            refreshStatus(true);
        };
        return;
    }

    if (!state.androidOnline) {
        elements.nextStepTitle.textContent = "Kết nối điện thoại qua USB";
        elements.nextStepDetail.textContent = "Bật gỡ lỗi USB và chấp nhận thông báo cấp quyền trên điện thoại.";
        elements.primaryAction.textContent = "Kiểm tra lại USB";
        elements.primaryAction.href = "#";
        elements.primaryAction.onclick = event => {
            event.preventDefault();
            refreshStatus(true);
        };
        return;
    }

    elements.nextStepTitle.textContent = "Thiết bị đã sẵn sàng";
    elements.nextStepDetail.textContent = "Bạn có thể gửi tệp, sao chép màn hình Android hoặc chiếu màn hình PC.";
    elements.primaryAction.textContent = "Bắt đầu truyền tệp";
    elements.primaryAction.href = "FT.html";
    elements.primaryAction.onclick = null;
}

// User-facing actions: navigation is available only after the Android device and Backend are ready.
function updateNextStep() {
    const ready = state.backendOnline && state.androidOnline;
    const unavailableMessage = !state.backendOnline
        ? "Hãy khởi động SCFT Desktop để sử dụng chức năng này."
        : "Hãy kết nối thiết bị Android qua USB và cấp quyền gỡ lỗi USB để sử dụng chức năng này.";

    elements.primaryAction.textContent = "Truyền tệp";
    elements.primaryAction.href = ready ? "FT.html" : "#";
    elements.primaryAction.classList.toggle("action-disabled", !ready);
    elements.primaryAction.onclick = ready
        ? null
        : event => {
            event.preventDefault();
            showHomeNotice(unavailableMessage);
        };

    elements.screenAction.href = ready ? "SC.html" : "#";
    elements.screenAction.classList.toggle("action-disabled", !ready);
    elements.screenAction.onclick = ready
        ? null
        : event => {
            event.preventDefault();
            showHomeNotice(unavailableMessage);
        };

    elements.nextStepTitle.textContent = ready
        ? "Thiết bị đã sẵn sàng"
        : "Kết nối thiết bị Android để bắt đầu";
    elements.nextStepDetail.textContent = ready
        ? "Bạn có thể truyền tệp hoặc sao chép màn hình Android."
        : unavailableMessage;
}

let homeNoticeTimer = null;

function showHomeNotice(message) {
    elements.homeNotice.textContent = message;
    elements.homeNotice.classList.add("visible");
    if (homeNoticeTimer) clearTimeout(homeNoticeTimer);
    homeNoticeTimer = window.setTimeout(() => {
        elements.homeNotice.classList.remove("visible");
    }, 3500);
}
