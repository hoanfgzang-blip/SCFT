const BACKEND_URL = "http://127.0.0.1:7878";

const state = {
    online: false,
    usbUrl: "",
    lanUrl: "",
    previewTimer: null
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
    elements.preview = document.getElementById("desktop_preview_img");
    elements.previewShell = document.querySelector(".desktop-preview");
    elements.refreshButton = document.getElementById("refresh_btn");
    elements.openButton = document.getElementById("open_viewer_btn");
    elements.copyUsbButton = document.getElementById("copy_usb_btn");
    elements.copyLanButton = document.getElementById("copy_lan_btn");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshScreenShare);
    elements.openButton.addEventListener("click", () => {
        if (state.usbUrl) window.open(state.usbUrl, "_blank");
    });
    elements.copyUsbButton.addEventListener("click", () => copyText(state.usbUrl));
    elements.copyLanButton.addEventListener("click", () => copyText(state.lanUrl));
}

async function refreshScreenShare() {
    stopPreview();
    setStatus("Checking PC screen capture...", false);
    setMessage("");
    setLinks("", "");

    try {
        const [statusResponse, deviceResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/screen/status`),
            fetch(`${BACKEND_URL}/api/device`)
        ]);

        if (!statusResponse.ok || !deviceResponse.ok) {
            throw new Error("Backend is not ready.");
        }

        const status = await statusResponse.json();
        const device = await deviceResponse.json();

        if (!status.available) {
            throw new Error(status.error || "Screen capture is unavailable.");
        }

        const usbUrl = `${BACKEND_URL}${status.viewUrl}`;
        const lanUrl = `http://${device.ip || "127.0.0.1"}:${device.port || 7878}${status.viewUrl}`;
        setLinks(usbUrl, lanUrl);
        elements.displays.textContent = String(status.displays || 1);
        setStatus("PC screen share is ready.", true);
        setMessage("Open the USB URL on the phone when using ADB reverse, or open the LAN URL on the same network.", "success");
        startPreview();
    } catch (error) {
        elements.displays.textContent = "-";
        setStatus("PC screen share is offline.", false);
        setMessage(error.message, "error");
    }
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
        elements.frameStatus.textContent = "Frame failed";
    };
    elements.preview.src = `${BACKEND_URL}/api/screen/frame?scale=0.35&quality=0.55&t=${Date.now()}`;
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
        setMessage("Copied link.", "success");
    } catch (error) {
        setMessage("Cannot copy link.", "error");
    }
}

function setStatus(text, online) {
    state.online = online;
    elements.statusText.textContent = text;
    elements.badge.textContent = online ? "Online" : "Offline";
    elements.badge.classList.toggle("online", online);
    elements.badge.classList.toggle("offline", !online);
}

function setMessage(text, type) {
    elements.message.textContent = text;
    elements.message.classList.toggle("error", type === "error");
    elements.message.classList.toggle("success", type === "success");
}
