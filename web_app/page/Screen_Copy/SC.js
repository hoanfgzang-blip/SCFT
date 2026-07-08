const { execFile } = require("child_process");
const path = require("path");
const os = require("os");

const state = {
    adbPath: null,
    running: false,
    inFlight: false,
    timer: null,
    frameCount: 0
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    refreshDevice();
});

function bindElements() {
    elements.statusText = document.getElementById("screen_status_text");
    elements.refreshButton = document.getElementById("refresh_device_btn");
    elements.startButton = document.getElementById("start_preview_btn");
    elements.stopButton = document.getElementById("stop_preview_btn");
    elements.badge = document.getElementById("adb_status_badge");
    elements.deviceText = document.getElementById("adb_device_text");
    elements.adbPathText = document.getElementById("adb_path_text");
    elements.rateSelect = document.getElementById("capture_rate_select");
    elements.message = document.getElementById("screen_message");
    elements.preview = document.getElementById("screen_preview_img");
    elements.phoneShell = document.querySelector(".phone-shell");
    elements.frameInfo = document.getElementById("frame_info_text");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshDevice);
    elements.startButton.addEventListener("click", startPreview);
    elements.stopButton.addEventListener("click", stopPreview);
    elements.rateSelect.addEventListener("change", () => {
        if (!state.running) return;
        stopPreview();
        startPreview();
    });
}

function getAdbCandidates() {
    const candidates = ["adb.exe", "adb"];
    const localAppData = process.env.LOCALAPPDATA;
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

    if (androidHome) {
        candidates.unshift(path.join(androidHome, "platform-tools", "adb.exe"));
    }

    if (localAppData) {
        candidates.unshift(path.join(localAppData, "Android", "Sdk", "platform-tools", "adb.exe"));
    }

    candidates.unshift(path.join(os.homedir(), "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"));

    return [...new Set(candidates)];
}

function runAdb(args, options = {}) {
    const candidates = state.adbPath ? [state.adbPath] : getAdbCandidates();

    return new Promise((resolve, reject) => {
        function tryCandidate(index) {
            if (index >= candidates.length) {
                reject(new Error("ADB not found"));
                return;
            }

            const command = candidates[index];
            const execOptions = {
                windowsHide: true,
                encoding: options.encoding || "utf8",
                maxBuffer: options.maxBuffer || 1024 * 1024
            };

            execFile(command, args, execOptions, (error, stdout, stderr) => {
                if (error && error.code === "ENOENT") {
                    tryCandidate(index + 1);
                    return;
                }

                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }

                state.adbPath = command;
                resolve({ stdout, stderr, command });
            });
        }

        tryCandidate(0);
    });
}

async function refreshDevice() {
    stopPreview();
    setStatus("Checking ADB...", false);
    setMessage("");
    elements.deviceText.textContent = "-";
    elements.adbPathText.textContent = "-";

    try {
        const result = await runAdb(["devices"]);
        const device = parseDevice(result.stdout);

        elements.adbPathText.textContent = result.command;

        if (!device) {
            setStatus("No authorized Android device found.", false);
            setMessage("Plug in a data USB cable, enable USB debugging, then allow the prompt on the phone.", "error");
            return;
        }

        elements.deviceText.textContent = device;
        setStatus("ADB device ready.", true);
        setMessage("Ready to capture Android screen over USB.", "success");
    } catch (error) {
        setStatus("ADB unavailable.", false);
        setMessage(error.message, "error");
    }
}

function parseDevice(output) {
    const lines = output.split(/\r?\n/);
    const line = lines.find(item => /\tdevice$/.test(item.trim()));
    return line ? line.trim().split(/\s+/)[0] : null;
}

async function startPreview() {
    if (state.running) return;

    const ready = await ensureDeviceReady();
    if (!ready) return;

    state.running = true;
    state.frameCount = 0;
    elements.startButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.refreshButton.disabled = true;
    setMessage("Capturing screen...", "success");

    await captureFrame();
    if (!state.running) return;

    state.timer = setInterval(captureFrame, Number(elements.rateSelect.value));
}

function stopPreview() {
    state.running = false;

    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }

    if (elements.startButton) elements.startButton.disabled = false;
    if (elements.stopButton) elements.stopButton.disabled = true;
    if (elements.refreshButton) elements.refreshButton.disabled = false;
}

async function ensureDeviceReady() {
    try {
        const result = await runAdb(["devices"]);
        const device = parseDevice(result.stdout);

        if (!device) {
            setStatus("No authorized Android device found.", false);
            setMessage("ADB cannot capture until the phone appears as authorized device.", "error");
            return false;
        }

        elements.deviceText.textContent = device;
        elements.adbPathText.textContent = result.command;
        setStatus("ADB device ready.", true);
        return true;
    } catch (error) {
        setStatus("ADB unavailable.", false);
        setMessage(error.message, "error");
        return false;
    }
}

async function captureFrame() {
    if (!state.running || state.inFlight) return;

    state.inFlight = true;
    const startedAt = Date.now();

    try {
        const result = await runAdb(["exec-out", "screencap", "-p"], {
            encoding: "buffer",
            maxBuffer: 32 * 1024 * 1024
        });

        if (!result.stdout || result.stdout.length === 0) {
            throw new Error("Empty screen frame.");
        }

        elements.preview.src = `data:image/png;base64,${result.stdout.toString("base64")}`;
        elements.phoneShell.classList.add("has-frame");
        state.frameCount += 1;
        elements.frameInfo.textContent = `${state.frameCount} frames - ${Date.now() - startedAt} ms`;
    } catch (error) {
        setMessage(error.message, "error");
        stopPreview();
    } finally {
        state.inFlight = false;
    }
}

function setStatus(text, online) {
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
