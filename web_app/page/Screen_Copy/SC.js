const { execFile, spawn } = require("child_process");
const path = require("path");
const os = require("os");

const state = {
    adbPath: null,
    running: false,
    adbProcess: null,
    decoder: null,
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
    elements.resolutionSelect = document.getElementById("screen_resolution_select");
    elements.bitrateSelect = document.getElementById("screen_bitrate_select");
    elements.message = document.getElementById("screen_message");
    elements.canvas = document.getElementById("screen_preview_canvas");
    elements.phoneShell = document.querySelector(".phone-shell");
    elements.frameInfo = document.getElementById("frame_info_text");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshDevice);
    elements.startButton.addEventListener("click", startPreview);
    elements.stopButton.addEventListener("click", stopPreview);

    if (elements.resolutionSelect) {
        elements.resolutionSelect.addEventListener("change", restartIfRunning);
    }
    if (elements.bitrateSelect) {
        elements.bitrateSelect.addEventListener("change", restartIfRunning);
    }

    window.addEventListener("beforeunload", stopPreview);
}

function restartIfRunning() {
    if (!state.running) return;
    stopPreview();
    startPreview();
}

function getAdbCandidates() {
    const candidates = [];
    const localAppData = process.env.LOCALAPPDATA;
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const resourceRoot = process.resourcesPath;

    if (process.env.SCFT_ADB_PATH) {
        candidates.push(process.env.SCFT_ADB_PATH);
    }

    if (resourceRoot) {
        candidates.push(path.join(resourceRoot, "platform-tools", "adb.exe"));
    }

    candidates.push(path.join(__dirname, "..", "..", "..", "build-resources", "platform-tools", "adb.exe"));
    candidates.push(path.join(os.homedir(), "OneDrive", "Documents", "platform-tools", "adb.exe"));
    candidates.push(path.join(os.homedir(), "Documents", "platform-tools", "adb.exe"));
    candidates.push("adb.exe", "adb");

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
        setMessage("Ready to stream Android screen over USB (H.264 WebCodecs).", "success");
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

async function startPreview() {
    if (state.running) return;

    const ready = await ensureDeviceReady();
    if (!ready) return;

    state.running = true;
    state.frameCount = 0;
    elements.startButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.refreshButton.disabled = true;
    setMessage("Streaming screen in real-time...", "success");

    try {
        state.decoder = new H264StreamDecoder(elements.canvas, (stats) => {
            elements.phoneShell.classList.add("has-frame");
            elements.frameInfo.textContent = `${stats.frameCount} frames | ${stats.fps} FPS (${stats.width}x${stats.height})`;
        });
    } catch (err) {
        setMessage(err.message, "error");
        stopPreview();
        return;
    }

    const resolution = elements.resolutionSelect ? elements.resolutionSelect.value : "1280x720";
    const bitrate = elements.bitrateSelect ? elements.bitrateSelect.value : "4000000";
    const adbCommand = state.adbPath || "adb";

    const spawnArgs = [
        "exec-out",
        "screenrecord",
        "--output-format=h264",
        "--size", resolution,
        "--bit-rate", bitrate,
        "--time-limit", "1800",
        "-"
    ];

    try {
        state.adbProcess = spawn(adbCommand, spawnArgs, { windowsHide: true });

        state.adbProcess.stdout.on("data", (chunk) => {
            if (!state.running || !state.decoder) return;
            state.decoder.feedChunk(chunk);
        });

        state.adbProcess.stderr.on("data", (data) => {
            console.warn("ADB screenrecord stderr:", data.toString());
        });

        state.adbProcess.on("error", (err) => {
            setMessage("Error launching ADB screenrecord: " + err.message, "error");
            stopPreview();
        });

        state.adbProcess.on("close", (code) => {
            if (state.running) {
                stopPreview();
            }
        });
    } catch (err) {
        setMessage("Failed to spawn screenrecord: " + err.message, "error");
        stopPreview();
    }
}

function stopPreview() {
    state.running = false;

    if (state.adbProcess) {
        try {
            state.adbProcess.stdout.removeAllListeners();
            state.adbProcess.stderr.removeAllListeners();
            state.adbProcess.kill("SIGINT");
        } catch (e) {}
        state.adbProcess = null;
    }

    if (state.decoder) {
        state.decoder.destroy();
        state.decoder = null;
    }

    if (elements.startButton) elements.startButton.disabled = false;
    if (elements.stopButton) elements.stopButton.disabled = true;
    if (elements.refreshButton) elements.refreshButton.disabled = false;
    if (elements.phoneShell) elements.phoneShell.classList.remove("has-frame");
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
