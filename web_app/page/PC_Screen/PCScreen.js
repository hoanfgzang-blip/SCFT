const { execFile } = require("child_process");
const { ipcRenderer } = require("electron");
const os = require("os");
const path = require("path");

const BACKEND_URL = "http://127.0.0.1:7878";

const state = {
    online: false,
    usbUrl: "",
    lanUrl: "",
    previewTimer: null,
    backendRetryTimer: null,
    backendRetryCount: 0,
    adbPath: null,
    displayIndex: 1,
    viewerRunning: sessionStorage.getItem("scft_pc_screen_running") === "true"
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    refreshScreenShare();
});

function bindElements() {
    elements.statusText = document.getElementById("screen_status_text");
    elements.badge = document.getElementById("screen_status_badge");
    elements.message = document.getElementById("screen_message");
    elements.frameStatus = document.getElementById("frame_status_text");
    elements.usbUrl = document.getElementById("usb_url_text");
    elements.lanUrl = document.getElementById("lan_url_text");
    elements.displays = document.getElementById("display_count_text");
    elements.displaySelect = document.getElementById("display_select");
    elements.preview = document.getElementById("desktop_preview_img");
    elements.previewShell = document.querySelector(".desktop-preview");
    elements.refreshButton = document.getElementById("refresh_btn");
    elements.openButton = document.getElementById("open_viewer_btn");
    elements.repairButton = document.getElementById("repair_vdd_btn");
    elements.stopButton = document.getElementById("stop_viewer_btn");
    elements.stopButton.hidden = !state.viewerRunning;
    elements.stopButton.disabled = !state.viewerRunning;
    elements.repairButton.hidden = true;
    elements.copyUsbButton = document.getElementById("copy_usb_btn");
    elements.copyLanButton = document.getElementById("copy_lan_btn");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshScreenShare);
    elements.openButton.addEventListener("click", openPhoneViewer);
    elements.repairButton.addEventListener("click", repairVirtualDisplay);
    elements.stopButton.addEventListener("click", stopPhoneViewer);
    elements.displaySelect.addEventListener("change", () => {
        state.displayIndex = Number(elements.displaySelect.value) || 0;
        refreshScreenShare();
    });
    elements.copyUsbButton.addEventListener("click", () => copyText(state.usbUrl));
    elements.copyLanButton.addEventListener("click", () => copyText(state.lanUrl));
}

function getAdbCandidates() {
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

function runAdb(args) {
    const candidates = state.adbPath ? [state.adbPath] : getAdbCandidates();

    return new Promise((resolve, reject) => {
        function tryCandidate(index) {
            if (index >= candidates.length) {
                reject(new Error("ADB not found."));
                return;
            }

            const command = candidates[index];
            execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
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

async function openPhoneViewer() {
    if (!state.usbUrl) return;

    elements.openButton.disabled = true;
    setMessage("Đang mở màn hình PC trên điện thoại...", "success");

    try {
        await ipcRenderer.invoke("scft-virtual-display-start");
        // The newly available monitor is the preferred target for a first
        // session. Users can still change it from the selector afterwards.
        state.displayIndex = Math.max(1, state.displayIndex);
        await refreshScreenShare();
        let usbReady = false;
        let usbConnected = false;
        let usbError = null;
        try {
            const devices = await runAdb(["devices"]);
            const connected = devices.split(/\r?\n/).some(line => /\tdevice$/.test(line.trim()));
            if (connected) {
                usbConnected = true;
                await runAdb(["reverse", "tcp:7878", "tcp:7878"]);
                await runAdb(["shell", "am", "start", "-n", "com.example.myapplication/.MainActivity", "--es", "scft_screen", "pc", "--ei", "scft_display", String(state.displayIndex), "--es", "scft_base_url", "http://127.0.0.1:7878"]);
                usbReady = true;
            }
        } catch (error) {
            usbError = error;
            // USB is optional. The LAN URL remains available when ADB is
            // missing, unauthorized, or the phone is not connected.
        }

        state.viewerRunning = true;
        elements.repairButton.hidden = true;
        sessionStorage.setItem("scft_pc_screen_running", "true");
        elements.stopButton.hidden = false;
        elements.stopButton.disabled = false;
        if (!state.previewTimer) startPreview();
        if (usbReady) {
            setMessage("Đã mở ứng dụng SCFT trên điện thoại qua USB.", "success");
        } else if (usbConnected && usbError) {
            setMessage(`Màn hình phụ đã sẵn sàng nhưng USB ADB không mở được ứng dụng: ${usbError.message || "lỗi không xác định"}. Bạn có thể dùng liên kết LAN.`, "error");
        } else {
            setMessage("Màn hình phụ đã sẵn sàng. Hãy mở liên kết LAN trên điện thoại hoặc kết nối USB đã cấp quyền ADB.", "success");
        }
    } catch (error) {
        const vddError = error && (error.code === "VDD_DUPLICATE_DEVICES"
            || error.code === "VDD_DISPLAY_NOT_READY"
            || error.code === "VDD_INSTALL_FAILED"
            || /Virtual Display Driver|VDD Control/i.test(error.message || ""));
        elements.repairButton.hidden = !vddError;
        if (error.message && error.message.includes("Mở trang tải driver chính thức")) {
            try {
                await ipcRenderer.invoke("scft-virtual-display-open-installer");
            } catch (_) {
                // Keep the original installation error visible in the page.
            }
        }
        setMessage(error.message, "error");
    } finally {
        elements.openButton.disabled = false;
    }
}

async function repairVirtualDisplay() {
    elements.repairButton.disabled = true;
    setMessage("Đang mở PowerShell Administrator để sửa driver. Sau khi hoàn tất, hãy khởi động lại Windows.", "success");
    try {
        await ipcRenderer.invoke("scft-virtual-display-repair");
        setMessage("Đã chạy sửa driver. Hãy khởi động lại Windows rồi mở lại SCFT.", "success");
    } catch (error) {
        setMessage(error.message || "Không thể mở quyền Administrator để sửa driver.", "error");
    } finally {
        elements.repairButton.disabled = false;
    }
}

async function stopPhoneViewer() {
    elements.stopButton.disabled = true;
    setMessage("Đang dừng chiếu màn hình PC...", "success");

    try {
        try {
            await runAdb(["shell", "am", "force-stop", "com.example.myapplication"]);
        } catch (_) {
            // The viewer may be connected over LAN or the phone may already
            // be disconnected. Stopping the desktop session must still work.
        }
        await ipcRenderer.invoke("scft-virtual-display-stop");
        state.viewerRunning = false;
        sessionStorage.removeItem("scft_pc_screen_running");
        elements.stopButton.hidden = true;
        stopPreview();
        elements.preview.removeAttribute("src");
        elements.previewShell.classList.remove("has-frame");
        elements.frameStatus.textContent = "Đã dừng";
        setMessage("Đã dừng chiếu màn hình PC trên điện thoại.", "success");
    } catch (error) {
        setMessage(error.message, "error");
    } finally {
        elements.stopButton.disabled = !state.viewerRunning;
        elements.stopButton.hidden = !state.viewerRunning;
    }
}
async function refreshScreenShare() {
    if (state.backendRetryTimer) {
        clearTimeout(state.backendRetryTimer);
        state.backendRetryTimer = null;
    }
    stopPreview();
    setStatus("Đang kiểm tra chụp màn hình PC...", false);
    setMessage("");
    setLinks("", "");

    try {
        const [statusResponse, deviceResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/screen/status`),
            fetch(`${BACKEND_URL}/api/device`)
        ]);

        if (!statusResponse.ok || !deviceResponse.ok) {
            throw new Error("Máy chủ chưa sẵn sàng.");
        }

        const status = await statusResponse.json();
        const device = await deviceResponse.json();

        if (!status.available) {
            throw new Error(status.error || "Chưa thể chụp màn hình PC.");
        }

        const usbUrl = `${BACKEND_URL}${status.viewUrl}`;
        const lanUrl = `http://${device.ip || "127.0.0.1"}:${device.port || 7878}${status.viewUrl}?display=${state.displayIndex}`;
        setLinks(usbUrl, lanUrl);
        populateDisplays(Array.isArray(status.screens) ? status.screens : []);
        elements.displays.textContent = String(status.displays || 1);
        const hasSecondaryDisplay = Number(status.displays || 0) > 1;
        state.backendRetryCount = 0;
        setStatus(
            hasSecondaryDisplay ? "Màn hình phụ đã sẵn sàng." : "SCFT sẵn sàng tạo màn hình phụ.",
            true
        );
        setMessage(
            hasSecondaryDisplay
                ? "Bấm Bắt đầu để truyền màn hình phụ sang điện thoại."
                : "Bấm Bắt đầu để cài/bật màn hình ảo rồi truyền sang điện thoại.",
            "success"
        );
        startPreview();
    } catch (error) {
        elements.displays.textContent = "-";
        setStatus("Chiếu màn hình PC đang ngoại tuyến.", false);
        setMessage(error.message, "error");
        scheduleBackendRetry();
    }
}

function scheduleBackendRetry() {
    if (state.backendRetryTimer || state.backendRetryCount >= 30) return;
    state.backendRetryCount += 1;
    state.backendRetryTimer = setTimeout(() => {
        state.backendRetryTimer = null;
        refreshScreenShare();
    }, 1000);
}


function populateDisplays(screens) {
    const selected = state.displayIndex;
    elements.displaySelect.innerHTML = "";

    screens.forEach(screen => {
        const option = document.createElement("option");
        option.value = String(screen.index);
        option.textContent = `Màn hình ${screen.index + 1} (${screen.width} x ${screen.height})`;
        elements.displaySelect.appendChild(option);
    });

    if (screens.length === 0) {
        const option = document.createElement("option");
        option.value = "0";
        option.textContent = "Không có màn hình";
        elements.displaySelect.appendChild(option);
        state.displayIndex = 0;
        elements.displaySelect.disabled = true;
        return;
    }

    const available = screens.some(screen => screen.index === selected);
    state.displayIndex = available ? selected : screens[0].index;
    elements.displaySelect.value = String(state.displayIndex);
    elements.displaySelect.disabled = false;
}
function startPreview() {
    updatePreviewFrame();
    state.previewTimer = setInterval(updatePreviewFrame, 1500);
}

function stopPreview() {
    if (state.previewTimer) {
        clearInterval(state.previewTimer);
        state.previewTimer = null;
    }
}

function updatePreviewFrame() {
    const startedAt = Date.now();
    elements.preview.onload = () => {
        elements.previewShell.classList.add("has-frame");
        elements.frameStatus.textContent = `${Date.now() - startedAt} ms`;
    };
    elements.preview.onerror = () => {
        elements.frameStatus.textContent = "Không nhận được khung hình";
    };
    elements.preview.src = `${BACKEND_URL}/api/screen/frame?display=${state.displayIndex}&scale=0.65&quality=0.65&t=${Date.now()}`;
}

function setLinks(usbUrl, lanUrl) {
    state.usbUrl = usbUrl;
    state.lanUrl = lanUrl;
    elements.usbUrl.textContent = usbUrl || "-";
    elements.lanUrl.textContent = lanUrl || "-";
    elements.openButton.disabled = !usbUrl;
    elements.copyUsbButton.disabled = !usbUrl;
    elements.copyLanButton.disabled = !lanUrl;
}

async function copyText(text) {
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        setMessage("Đã sao chép liên kết.", "success");
    } catch (error) {
        setMessage("Không thể sao chép liên kết.", "error");
    }
}

function setStatus(text, online) {
    state.online = online;
    elements.statusText.textContent = text;
    elements.badge.textContent = online ? "Trực tuyến" : "Ngoại tuyến";
    elements.badge.classList.toggle("online", online);
    elements.badge.classList.toggle("offline", !online);
}

function setMessage(text, type) {
    elements.message.textContent = text;
    elements.message.classList.toggle("error", type === "error");
    elements.message.classList.toggle("success", type === "success");
}
