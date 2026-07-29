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
    elements.stopButton = document.getElementById("stop_viewer_btn");
    elements.stopButton.hidden = !state.viewerRunning;
    elements.stopButton.disabled = !state.viewerRunning;
    elements.copyUsbButton = document.getElementById("copy_usb_btn");
    elements.copyLanButton = document.getElementById("copy_lan_btn");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshScreenShare);
    elements.openButton.addEventListener("click", openPhoneViewer);
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
        await refreshScreenShare();
        const devices = await runAdb(["devices"]);
        const connected = devices.split(/\r?\n/).some(line => /\tdevice$/.test(line.trim()));

        if (!connected) {
            throw new Error("Hãy kết nối điện thoại Android đã cấp quyền USB trước khi mở.");
        }

        await runAdb(["reverse", "tcp:7878", "tcp:7878"]);
        await runAdb(["shell", "am", "start", "-n", "com.example.myapplication/.MainActivity", "--es", "scft_screen", "pc", "--ei", "scft_display", String(state.displayIndex)]);
        state.viewerRunning = true;
        sessionStorage.setItem("scft_pc_screen_running", "true");
        elements.stopButton.hidden = false;
        elements.stopButton.disabled = false;
        if (!state.previewTimer) startPreview();
        setMessage("Đã mở ứng dụng SCFT trên điện thoại.", "success");
    } catch (error) {
        setMessage(error.message, "error");
    } finally {
        elements.openButton.disabled = false;
    }
}

async function stopPhoneViewer() {
    elements.stopButton.disabled = true;
    setMessage("Đang dừng chiếu màn hình PC...", "success");

    try {
        await runAdb(["shell", "am", "force-stop", "com.example.myapplication"]);
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
        const lanUrl = `http://${device.ip || "127.0.0.1"}:${device.port || 7878}${status.viewUrl}`;
        setLinks(usbUrl, lanUrl);
        populateDisplays(Array.isArray(status.screens) ? status.screens : []);
        elements.displays.textContent = String(status.displays || 1);
        setStatus("Chiếu màn hình PC đã sẵn sàng.", true);
        setMessage("Nhấn Mở trên điện thoại để khởi chạy ứng dụng SCFT qua USB ADB.", "success");
        startPreview();
    } catch (error) {
        elements.displays.textContent = "-";
        setStatus("Chiếu màn hình PC đang ngoại tuyến.", false);
        setMessage(error.message, "error");
    }
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
