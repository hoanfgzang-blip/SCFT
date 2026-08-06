const { execFile } = require("child_process");
const { ipcRenderer } = require("electron");
const os = require("os");
const path = require("path");

const BACKEND_URL = "http://127.0.0.1:7878";
const SESSION_POLL_MS = 300;

const state = {
    online: false,
    usbUrl: "",
    lanUrl: "",
    previewTimer: null,
    sessionTimer: null,
    backendRetryTimer: null,
    backendRetryCount: 0,
    adbPath: null,
    applying: false,
    sessionId: "",
    activeSession: null,
    draft: {
        displayIndex: 1,
        displayId: "",
        presetId: "balanced"
    }
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
    elements.presetSelect = document.getElementById("preset_select");
    elements.preview = document.getElementById("desktop_preview_img");
    elements.previewShell = document.querySelector(".desktop-preview");
    elements.refreshButton = document.getElementById("refresh_btn");
    elements.openButton = document.getElementById("open_viewer_btn");
    elements.repairButton = document.getElementById("repair_vdd_btn");
    elements.stopButton = document.getElementById("stop_viewer_btn");
    elements.copyUsbButton = document.getElementById("copy_usb_btn");
    elements.copyLanButton = document.getElementById("copy_lan_btn");
    updateControls();
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshScreenShare);
    elements.openButton.addEventListener("click", applyDraft);
    elements.repairButton.addEventListener("click", repairVirtualDisplay);
    elements.stopButton.addEventListener("click", stopPhoneViewer);
    elements.displaySelect.addEventListener("change", () => {
        state.draft.displayIndex = Number(elements.displaySelect.value) || 0;
        const selected = [...elements.displaySelect.options]
            .find(option => Number(option.value) === state.draft.displayIndex);
        state.draft.displayId = selected?.dataset.displayId || "";
        updateLinks();
        updateControls();
        updatePreviewFrame();
    });
    elements.presetSelect.addEventListener("change", () => {
        state.draft.presetId = elements.presetSelect.value || "balanced";
        updateControls();
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
                reject(new Error("Không tìm thấy ADB."));
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

function draftConfig() {
    return { ...state.draft };
}

function activeConfig() {
    return state.activeSession?.config || null;
}

function configEquals(left, right) {
    if (!left || !right) return false;
    return Number(left.displayIndex) === Number(right.displayIndex)
        && String(left.displayId || "") === String(right.displayId || "")
        && String(left.presetId || "") === String(right.presetId || "");
}

function hasActiveSession() {
    return ["applying", "connecting", "streaming"].includes(state.activeSession?.state);
}

function updateControls() {
    if (!elements.openButton) return;
    const active = hasActiveSession();
    const dirty = !configEquals(draftConfig(), activeConfig());
    elements.openButton.textContent = active ? "Áp dụng" : "Bắt đầu";
    elements.openButton.disabled = !state.online || state.applying || (active && !dirty);
    elements.openButton.title = active && !dirty
        ? "Cấu hình này đang được áp dụng"
        : "Áp dụng cấu hình lên điện thoại";
    elements.stopButton.hidden = !active && !state.applying;
    elements.stopButton.disabled = !active || state.applying;
    elements.displaySelect.disabled = !state.online || state.applying;
    elements.presetSelect.disabled = !state.online || state.applying;
}

async function applyDraft() {
    if (state.applying || !state.usbUrl) return;
    state.applying = true;
    updateControls();
    setMessage("Đang áp dụng cấu hình lên điện thoại...", "success");

    let sessionId = "";
    try {
        await ipcRenderer.invoke("scft-virtual-display-start");
        await refreshScreenShare({ keepMessage: true });

        const devices = await runAdb(["devices"]);
        const connected = devices.split(/\r?\n/).some(line => /\tdevice$/.test(line.trim()));
        if (!connected) throw new Error("Chưa có điện thoại ADB được cấp quyền.");

        await runAdb(["reverse", "tcp:7878", "tcp:7878"]);
        const config = draftConfig();
        const query = new URLSearchParams({
            display: String(config.displayIndex),
            displayId: config.displayId,
            preset: config.presetId,
            transport: "usb"
        });
        const sessionResponse = await fetch(`${BACKEND_URL}/api/screen/session?${query}`, { method: "POST" });
        const session = await readJsonResponse(sessionResponse);
        sessionId = session.sessionId;
        state.sessionId = sessionId;
        state.activeSession = session;
        startSessionPolling();

        await runAdb([
            "shell", "am", "start", "-n", "com.example.myapplication/.MainActivity",
            "--es", "scft_screen", "pc",
            "--ei", "scft_display", String(config.displayIndex),
            "--es", "scft_display_id", config.displayId,
            "--es", "scft_preset", config.presetId,
            "--es", "scft_session_id", sessionId,
            "--ez", "scft_autostart", "true",
            "--es", "scft_base_url", "http://127.0.0.1:7878"
        ]);

        const streaming = await waitForStreaming(sessionId, 8000);
        if (streaming) {
            setMessage("Đã áp dụng và điện thoại đang nhận màn hình PC.", "success");
        } else {
            setMessage("Đã gửi cấu hình nhưng chưa nhận được frame đầu tiên. Kiểm tra trạng thái trên điện thoại.", "error");
        }
    } catch (error) {
        if (sessionId) await deleteSession(sessionId);
        state.sessionId = "";
        state.activeSession = null;
        setMessage(error.message || "Không thể áp dụng cấu hình.", "error");
    } finally {
        state.applying = false;
        updateControls();
    }
}

async function stopPhoneViewer() {
    if (state.applying) return;
    state.applying = true;
    updateControls();
    setMessage("Đang dừng chiếu màn hình PC...", "success");
    try {
        try {
            await runAdb(["shell", "am", "force-stop", "com.example.myapplication"]);
        } catch (_) {
            // The backend session is still stopped when the phone is absent.
        }
        await deleteSession(state.sessionId);
        await ipcRenderer.invoke("scft-virtual-display-stop");
        state.sessionId = "";
        state.activeSession = null;
        stopSessionPolling();
        stopPreview();
        elements.preview.removeAttribute("src");
        elements.previewShell.classList.remove("has-frame");
        elements.frameStatus.textContent = "Đã dừng";
        setMessage("Đã dừng chiếu màn hình PC trên điện thoại.", "success");
    } catch (error) {
        setMessage(error.message || "Không thể dừng phiên chiếu.", "error");
    } finally {
        state.applying = false;
        updateControls();
    }
}

async function deleteSession(sessionId) {
    if (!sessionId) return;
    await fetch(`${BACKEND_URL}/api/screen/session?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

async function waitForStreaming(sessionId, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        await pollSessionOnce();
        if (state.sessionId === sessionId && state.activeSession?.state === "streaming") return true;
        if (state.sessionId === sessionId && state.activeSession?.state === "error") return false;
        await new Promise(resolve => setTimeout(resolve, SESSION_POLL_MS));
    }
    return false;
}

function startSessionPolling() {
    stopSessionPolling();
    state.sessionTimer = setInterval(pollSessionOnce, SESSION_POLL_MS);
}

function stopSessionPolling() {
    if (state.sessionTimer) clearInterval(state.sessionTimer);
    state.sessionTimer = null;
}

async function pollSessionOnce() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/screen/session`);
        if (!response.ok) return;
        const session = await response.json();
        syncActiveSession(session);
    } catch (_) {
        // The main refresh path displays backend errors; polling stays quiet.
    }
}

function syncActiveSession(session) {
    if (!session || ["stopped", "error"].includes(session.state)) {
        state.activeSession = null;
        if (!state.applying) stopSessionPolling();
        updateControls();
        return;
    }
    state.activeSession = session;
    state.sessionId = session.sessionId || state.sessionId;
    if (session.config) {
        elements.frameStatus.textContent = session.metrics?.fps
            ? `${session.metrics.fps} FPS · ${session.metrics.dropped || 0} drop · buf ${session.metrics.queue || 0}`
            : session.state;
    }
    setStatus(
        session.state === "streaming" ? "Đang chiếu màn hình PC." : "Đang áp dụng cấu hình...",
        true
    );
    updateControls();
}

async function refreshScreenShare(options = {}) {
    if (state.backendRetryTimer) {
        clearTimeout(state.backendRetryTimer);
        state.backendRetryTimer = null;
    }
    stopPreview();
    setStatus("Đang kiểm tra màn hình PC...", false);
    if (!options.keepMessage) setMessage("");
    setLinks("", "");

    try {
        const [statusResponse, deviceResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/screen/status`),
            fetch(`${BACKEND_URL}/api/device`)
        ]);
        const status = await readJsonResponse(statusResponse);
        const device = await readJsonResponse(deviceResponse);
        if (!status.available) throw new Error(status.error || "Chưa thể chụp màn hình PC.");

        populateDisplays(Array.isArray(status.screens) ? status.screens : []);
        const usbUrl = `${BACKEND_URL}${status.viewUrl}`;
        const lanUrl = `http://${device.ip || "127.0.0.1"}:${device.port || 7878}${status.viewUrl}?display=${state.draft.displayIndex}&displayId=${encodeURIComponent(state.draft.displayId)}`;
        setLinks(usbUrl, lanUrl);
        elements.displays.textContent = String(status.displays || 1);
        state.backendRetryCount = 0;
        state.online = true;
        syncActiveSession(status.session);
        if (!hasActiveSession()) {
            setStatus(
                Number(status.displays || 0) > 1 ? "Màn hình phụ đã sẵn sàng." : "SCFT sẵn sàng tạo màn hình phụ.",
                true
            );
            if (!options.keepMessage) setMessage("Chọn cấu hình rồi bấm Bắt đầu.", "success");
        }
        updateControls();
        startPreview();
    } catch (error) {
        state.online = false;
        elements.displays.textContent = "-";
        setStatus("Chiếu màn hình PC đang ngoại tuyến.", false);
        setMessage(error.message, "error");
        updateControls();
        scheduleBackendRetry();
    }
}

async function readJsonResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
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
    const selected = state.draft.displayIndex;
    elements.displaySelect.innerHTML = "";
    screens.forEach(screen => {
        const option = document.createElement("option");
        option.value = String(screen.index);
        option.dataset.displayId = screen.id || "";
        option.textContent = `Màn hình ${screen.index + 1} (${screen.width} x ${screen.height})`;
        elements.displaySelect.appendChild(option);
    });
    if (screens.length === 0) {
        const option = document.createElement("option");
        option.value = "0";
        option.textContent = "Không có màn hình";
        elements.displaySelect.appendChild(option);
        state.draft.displayIndex = 0;
        state.draft.displayId = "";
        elements.displaySelect.disabled = true;
        return;
    }
    const available = screens.some(screen => screen.index === selected);
    state.draft.displayIndex = available ? selected : screens[0].index;
    const selectedScreen = screens.find(screen => screen.index === state.draft.displayIndex) || screens[0];
    state.draft.displayId = selectedScreen?.id || "";
    elements.displaySelect.value = String(state.draft.displayIndex);
    elements.presetSelect.value = state.draft.presetId;
    elements.displaySelect.disabled = false;
}

function startPreview() {
    if (state.previewTimer) return;
    updatePreviewFrame();
    state.previewTimer = setInterval(updatePreviewFrame, 400);
}

function stopPreview() {
    if (state.previewTimer) clearInterval(state.previewTimer);
    state.previewTimer = null;
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
    elements.preview.src = `${BACKEND_URL}/api/screen/frame?display=${state.draft.displayIndex}&displayId=${encodeURIComponent(state.draft.displayId)}&scale=0.65&quality=0.65&t=${Date.now()}`;
}

function updateLinks() {
    const displayQuery = `display=${state.draft.displayIndex}&displayId=${encodeURIComponent(state.draft.displayId)}`;
    if (state.usbUrl) state.usbUrl = `${BACKEND_URL}/api/screen/view?${displayQuery}`;
    if (state.lanUrl) {
        const base = state.lanUrl.split("?")[0];
        state.lanUrl = `${base}?${displayQuery}`;
    }
    setLinks(state.usbUrl, state.lanUrl);
}

function setLinks(usbUrl, lanUrl) {
    state.usbUrl = usbUrl;
    state.lanUrl = lanUrl;
    elements.usbUrl.textContent = usbUrl || "-";
    elements.lanUrl.textContent = lanUrl || "-";
    elements.copyUsbButton.disabled = !usbUrl;
    elements.copyLanButton.disabled = !lanUrl;
    updateControls();
}

async function copyText(text) {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        setMessage("Đã sao chép liên kết.", "success");
    } catch (_) {
        setMessage("Không thể sao chép liên kết.", "error");
    }
}

async function repairVirtualDisplay() {
    elements.repairButton.disabled = true;
    setMessage("Đang mở PowerShell Administrator để sửa driver...", "success");
    try {
        await ipcRenderer.invoke("scft-virtual-display-repair");
        setMessage("Đã chạy sửa driver. Hãy khởi động lại Windows rồi mở lại SCFT.", "success");
    } catch (error) {
        setMessage(error.message || "Không thể sửa driver.", "error");
    } finally {
        elements.repairButton.disabled = false;
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
