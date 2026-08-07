const { ipcRenderer } = require("electron");

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
    warmupRequested: false,
    adbPath: null,
    applying: false,
    operationStep: "idle",
    operationMessage: "",
    lastErrorCode: "",
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
    ipcRenderer.on("scft-pc-screen-progress", (_event, progress) => {
        state.operationStep = progress?.step || "working";
        state.operationMessage = progress?.message || "";
        if (progress?.step === "streaming") {
            state.lastErrorCode = "";
            startSessionPolling();
            pollSessionOnce();
            setMessage(progress.message, "success");
        } else if (progress?.step === "stopped") {
            setMessage(progress.message, "success");
        } else if (progress?.message) {
            setMessage(progress.message, "success");
        }
        updateControls();
    });
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
    if (elements.copyUsbButton) elements.copyUsbButton.addEventListener("click", () => copyText(state.usbUrl));
    if (elements.copyLanButton) elements.copyLanButton.addEventListener("click", () => copyText(state.lanUrl));
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
    return ["applying", "connecting", "streaming", "recovering"].includes(state.activeSession?.state);
}

function reduceUiState() {
    if (!state.online) return "offline";
    if (state.applying) return state.operationStep || "preparing";
    if (state.activeSession?.state === "streaming") return "streaming";
    if (state.activeSession?.state === "recovering") return "recovering";
    if (state.activeSession?.state === "error" || state.lastErrorCode) return "error";
    return "idle";
}

function updateControls() {
    if (!elements.openButton) return;
    state.uiState = reduceUiState();
    const active = hasActiveSession();
    const dirty = !configEquals(draftConfig(), activeConfig());
    const failed = state.activeSession?.state === "error" || Boolean(state.lastErrorCode);
    elements.openButton.textContent = active ? "Áp dụng" : (failed ? "Thử lại" : "Bắt đầu");
    elements.openButton.disabled = !state.online || state.applying || (active && !dirty);
    elements.openButton.title = active && !dirty
        ? "Cấu hình này đang được áp dụng"
        : (failed ? "Thử lại kết nối PC Screen" : "Áp dụng cấu hình lên điện thoại");
    elements.stopButton.hidden = !active && !state.applying;
    elements.stopButton.disabled = !active && !state.applying;
    elements.stopButton.textContent = state.applying ? "Hủy" : "Kết thúc";
    elements.displaySelect.disabled = !state.online || state.applying;
    elements.presetSelect.disabled = !state.online || state.applying;
}

async function applyDraft() {
    if (state.applying || !state.online) return;
    state.applying = true;
    state.lastErrorCode = "";
    updateControls();
    try {
        const session = await ipcRenderer.invoke("scft-pc-screen-apply", draftConfig());
        state.sessionId = session?.sessionId || "";
        state.activeSession = session;
        startSessionPolling();
        if (session?.effectivePreset && session.effectivePreset !== state.draft.presetId) {
            setMessage(session.effectivePreset === "zero_latency"
                ? "Đã chuyển sang Không độ trễ để duy trì kết nối."
                : `Đã kết nối bằng preset ${session.effectivePreset}.`, "success");
        } else {
            setMessage("Đã áp dụng và điện thoại đang nhận màn hình PC.", "success");
        }
    } catch (error) {
        if (error.code === "PC_SCREEN_STOPPED") {
            state.sessionId = "";
            state.activeSession = null;
            stopSessionPolling();
            stopPreview();
            return;
        }
        state.lastErrorCode = error.code || "PC_SCREEN_ERROR";
        state.sessionId = "";
        state.activeSession = null;
        setMessage(error.message || "Không thể áp dụng cấu hình.", "error");
    } finally {
        state.applying = false;
        state.operationStep = "idle";
        updateControls();
    }
}

async function stopPhoneViewer() {
    state.applying = true;
    updateControls();
    setMessage("Đang dừng chiếu màn hình PC...", "success");
    try {
        await ipcRenderer.invoke("scft-pc-screen-stop");
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
    if (!session || session.state === "stopped") {
        state.activeSession = null;
        if (!state.applying) stopSessionPolling();
        updateControls();
        return;
    }
    state.activeSession = session;
    state.sessionId = session.sessionId || state.sessionId;
    const droppedFrames = session.metrics?.droppedFrames ?? session.metrics?.dropped ?? 0;
    if (session.metrics?.fps) {
        const metrics = session.metrics;
        const stages = [
            ["cap", metrics.captureSetupMs],
            ["enc", metrics.encodeSetupMs],
            ["usb", metrics.usbTransferMs],
            ["dec", metrics.decodeMs],
            ["ren", metrics.renderMs]
        ].filter(([, value]) => Number.isFinite(value) && value >= 0)
            .map(([label, value]) => `${label} ${Math.round(value)}ms`)
            .join(" · ");
        elements.frameStatus.textContent = `${metrics.fps} FPS · ${droppedFrames} drop · buf ${Math.round((metrics.bufferBytes || 0) / 1024)} KB · q ${metrics.decoderQueueDepth || 0}${stages ? ` · ${stages}` : ""}`;
    } else {
        elements.frameStatus.textContent = session.state === "error" ? "Lỗi" : session.state;
    }
    if (session.state === "error") {
        state.lastErrorCode = session.errorCode || "PC_SCREEN_ERROR";
        setStatus("PC Screen gặp lỗi.", true);
        setMessage(session.errorMessage || "Không thể duy trì phiên màn hình.", "error");
        stopSessionPolling();
    } else {
        setStatus(
            session.state === "streaming"
                ? "Đang chiếu màn hình PC."
                : (session.state === "recovering" ? "Đang thử khôi phục H264..." : "Đang áp dụng cấu hình..."),
            true
        );
    }
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
        if (!hasActiveSession() && state.activeSession?.state !== "error") {
            setStatus(
                Number(status.displays || 0) > 1 ? "Màn hình phụ đã sẵn sàng." : "SCFT sẵn sàng tạo màn hình phụ.",
                true
            );
            if (!options.keepMessage) setMessage("Chọn cấu hình rồi bấm Bắt đầu.", "success");
        }
        updateControls();
        requestCaptureWarmup();
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

function requestCaptureWarmup() {
    if (state.warmupRequested) return;
    state.warmupRequested = true;
    const query = `display=${state.draft.displayIndex}&displayId=${encodeURIComponent(state.draft.displayId)}`;
    fetch(`${BACKEND_URL}/api/screen/warmup?${query}`, { method: "POST" })
        .then(async response => {
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                console.warn("PC Screen capture/encoder warm-up failed", body.error || response.status);
            }
        })
        .catch(error => console.warn("PC Screen capture/encoder warm-up unavailable", error));
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
    elements.usbUrl.textContent = usbUrl ? "USB + ADB reverse sẵn sàng." : "USB + ADB reverse đang kiểm tra...";
    elements.lanUrl.textContent = lanUrl ? "LAN chỉ dùng cho tương thích, chưa phải luồng H264 chính." : "LAN chưa sẵn sàng.";
    if (elements.copyUsbButton) elements.copyUsbButton.disabled = !usbUrl;
    if (elements.copyLanButton) elements.copyLanButton.disabled = !lanUrl;
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
