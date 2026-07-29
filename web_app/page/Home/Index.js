const BACKEND_URL = "http://127.0.0.1:7878";
const POLL_INTERVAL_MS = 3000;

const state = {
    adbPath: null,
    pollTimer: null,
    refreshing: false,
    backendOnline: false,
    androidOnline: false
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
    elements.nextStepTitle = document.getElementById("next_step_title");
    elements.nextStepDetail = document.getElementById("next_step_detail");
    elements.primaryAction = document.getElementById("primary_action");
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
    state.androidOnline = false;
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = "Đang kiểm tra...";

    if (showChecking) {
        setStatus(elements.backend, "Đang kiểm tra", "Đang kiểm tra dịch vụ cục bộ...", BACKEND_URL, false);
        setStatus(elements.android, "Đang kiểm tra", "Đang kiểm tra ADB...", "Cần bật gỡ lỗi USB", false);
        setStatus(elements.capture, "Đang kiểm tra", "Đang kiểm tra dịch vụ màn hình...", "Chiếu màn hình PC", false);
    }

    try {
        await Promise.all([checkBackend(), checkAndroid()]);
    } finally {
        state.refreshing = false;
        elements.refreshButton.disabled = false;
        elements.refreshButton.textContent = "Cập nhật trạng thái";
        updateNextStep();
        elements.lastUpdated.textContent = `Cập nhật lúc ${formatTime(new Date())}`;
    }
}

async function checkBackend() {
    try {
        const [healthResponse, deviceResponse, screenResponse] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/health`),
            fetchWithTimeout(`${BACKEND_URL}/api/device`),
            fetchWithTimeout(`${BACKEND_URL}/api/screen/status`)
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

        if (!screenResponse.ok) {
            setStatus(elements.capture, "Ngoại tuyến", "Dịch vụ màn hình chưa khả dụng", "Mở Chiếu màn hình PC sau khi khởi động máy chủ", false);
            return;
        }

        const screen = await screenResponse.json();
        if (!screen.available) {
            setStatus(elements.capture, "Ngoại tuyến", "Chưa thể chụp màn hình", screen.error || "Mở Chiếu màn hình PC để thử lại", false);
            return;
        }

        const displayCount = Number(screen.displays) || 1;
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
            .find(line => /\tdevice$/.test(line));

        if (!connected) {
            setStatus(elements.android, "Ngoại tuyến", "Không có thiết bị Android đã được cấp quyền", "Kết nối USB và chấp nhận thông báo gỡ lỗi trên điện thoại", false);
            return;
        }

        const deviceId = connected.split("\t")[0];
        const properties = await runAdb(["-s", deviceId, "shell", "getprop"]);
        const deviceName = getAndroidDeviceName(deviceId, properties);
        state.androidOnline = true;
        setStatus(elements.android, "Đã kết nối", deviceName, "Android đã sẵn sàng qua USB ADB", true);
    } catch (error) {
        setStatus(elements.android, "Ngoại tuyến", "ADB chưa khả dụng", "Cài Android platform-tools hoặc đặt SCFT_ADB_PATH", false);
    }
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
function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);

    return fetch(url, { signal: controller.signal }).finally(() => window.clearTimeout(timer));
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