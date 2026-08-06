const { execFile, spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const net = require("net");

const RESOLUTION_MAP = {
    "720p": "720x1280",
    "1080p": "1080x1920",
    "1440p": "1440x2560",
    "4K": "2160x3840"
};

const state = {
    adbPath: null,
    running: false,
    adbProcess: null,
    decoder: null,
    frameCount: 0,
    currentOrientation: null,
    controller: null
};

let rotationInterval = null;
let currentRotation = null;
let controlSocket = null;
let javaServerProcess = null;
let audioManager = null;

function getAudioManager() {
    if (!audioManager) {
        if (typeof SCAudioManager !== "undefined") {
            audioManager = new SCAudioManager();
        } else {
            try {
                const { SCAudioManager: Manager } = require("./SCAudio.js");
                audioManager = new Manager();
            } catch (e) {
                console.warn("SCAudioManager could not be loaded:", e);
            }
        }
    }
    return audioManager;
}

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    loadSettingsDisplay();
    refreshDevice();
});

function bindElements() {
    elements.statusText = document.getElementById("screen_status_text");
    elements.refreshButton = document.getElementById("refresh_device_btn");
    elements.startButton = document.getElementById("start_preview_btn");
    elements.stopButton = document.getElementById("stop_preview_btn");
    elements.popoutButton = document.getElementById("popout_btn");
    elements.badge = document.getElementById("adb_status_badge");
    elements.deviceText = document.getElementById("adb_device_text");
    elements.adbPathText = document.getElementById("adb_path_text");
    elements.resolutionText = document.getElementById("sc_resolution_text");
    elements.bitrateText = document.getElementById("sc_bitrate_text");
    elements.fpsText = document.getElementById("sc_fps_text");
    elements.orientationText = document.getElementById("sc_orientation_text");
    elements.message = document.getElementById("screen_message");
    elements.canvas = document.getElementById("screen_preview_canvas");
    elements.phoneShell = document.querySelector(".phone-shell");
    elements.frameInfo = document.getElementById("frame_info_text");
    elements.controllerToggle = document.getElementById("controller_toggle_btn");
}

function bindEvents() {
    elements.refreshButton.addEventListener("click", refreshDevice);
    elements.startButton.addEventListener("click", startPreview);
    elements.stopButton.addEventListener("click", stopPreview);

    if (elements.popoutButton) {
        elements.popoutButton.addEventListener("click", openPopout);
    }

    if (elements.controllerToggle) {
        elements.controllerToggle.addEventListener("click", toggleController);
    }

    window.addEventListener("beforeunload", stopPreview);
    window.addEventListener("storage", (e) => {
        if (e.key && e.key.startsWith("SCFT_")) {
            loadSettingsDisplay();
        }
    });
}

function getStreamSettings() {
    const resKey = localStorage.getItem("SCFT_Resolution") || "1080p";
    const bitrateRaw = parseFloat(localStorage.getItem("SCFT_Bitrate") || "4");
    const fps = localStorage.getItem("SCFT_FPS") || "60";

    return {
        resolutionLabel: resKey,
        resolution: RESOLUTION_MAP[resKey] || "1080x1920",
        bitrateMbps: bitrateRaw,
        bitrate: String(Math.round(bitrateRaw * 1000000)),
        fps: fps
    };
}

function loadSettingsDisplay() {
    const settings = getStreamSettings();
    if (elements.resolutionText) elements.resolutionText.textContent = settings.resolutionLabel + " (" + settings.resolution + ")";
    if (elements.bitrateText) elements.bitrateText.textContent = settings.bitrateMbps + " Mbps";
    if (elements.fpsText) elements.fpsText.textContent = settings.fps + " FPS";
}

function toggleController() {
    if (!state.controller && elements.canvas) {
        state.controller = new SCController(elements.canvas, (cmdStr) => sendSocketCommand(cmdStr));
    }
    const isEnabled = state.controller ? !state.controller.enabled : true;
    if (state.controller) state.controller.setEnabled(isEnabled);
    if (elements.controllerToggle) {
        elements.controllerToggle.textContent = isEnabled ? "🎮 Control: ON" : "🎮 Control: OFF";
        elements.controllerToggle.classList.toggle("secondary-btn", !isEnabled);
        elements.controllerToggle.classList.toggle("primary-btn", isEnabled);
    }
}

function updateOrientation(width, height) {
    const isLandscape = width > height;
    const newOrientation = isLandscape ? "landscape" : "portrait";

    if (elements.phoneShell) {
        elements.phoneShell.style.aspectRatio = `${width} / ${height}`;
        elements.phoneShell.classList.remove("portrait", "landscape");
        elements.phoneShell.classList.add(newOrientation);
    }

    if (state.currentOrientation === newOrientation) return;

    state.currentOrientation = newOrientation;

    if (elements.orientationText) {
        elements.orientationText.textContent = isLandscape ? "Landscape ↔" : "Portrait ↕";
    }
}

function openPopout() {
    try {
        const { ipcRenderer } = require("electron");
        ipcRenderer.send("open-popout-window", {
            adbPath: state.adbPath || ""
        });
        stopPreview();
        
        // Clear canvas to black
        if (elements.canvas) {
            const ctx = elements.canvas.getContext("2d");
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
        }

        setMessage("Stream moved to floating window.", "success");
    } catch (err) {
        setMessage("Cannot open floating window: " + err.message, "error");
    }
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
                process.env.SCFT_ADB_PATH = command;
                resolve({ stdout, stderr, command });
            });
        }

        tryCandidate(0);
    });
}

async function ensureControlServer() {
    if (controlSocket && !controlSocket.destroyed) {
        return controlSocket;
    }

    return new Promise((resolve) => {
        const client = net.createConnection({ port: 10789, host: "127.0.0.1" }, () => {
            controlSocket = client;
            resolve(controlSocket);
        });
        client.on("error", () => {
            resolve(null);
        });
    });
}

let adbShellProcess = null;

function getAdbShell() {
    if (adbShellProcess && !adbShellProcess.killed && adbShellProcess.stdin && adbShellProcess.stdin.writable) {
        return adbShellProcess;
    }
    const candidates = state.adbPath ? [state.adbPath] : getAdbCandidates();
    for (const cmd of candidates) {
        try {
            if (fs.existsSync(cmd) || cmd === "adb") {
                adbShellProcess = spawn(cmd, ["shell"], { windowsHide: true });
                adbShellProcess.on("error", () => { adbShellProcess = null; });
                adbShellProcess.on("exit", () => { adbShellProcess = null; });
                state.adbPath = cmd;
                process.env.SCFT_ADB_PATH = cmd;
                return adbShellProcess;
            }
        } catch (e) {}
    }
    return null;
}

function sendAdbShellCommand(cmdStr) {
    const proc = getAdbShell();
    if (proc && proc.stdin && proc.stdin.writable) {
        proc.stdin.write(cmdStr + "\n");
    }
}

function sendSocketCommand(cmdStr) {
    const parts = cmdStr.trim().split(" ");
    const type = parts[0];

    // 1. Write directly to Java Socket server if connected
    if (controlSocket && !controlSocket.destroyed) {
        try {
            controlSocket.write(cmdStr + "\n");
            return;
        } catch (e) {}
    }

    // 2. Fallback to native cmd input via persistent ADB shell pipe instantly
    if (type === "DOWN") {
        sendAdbShellCommand(`cmd input motionevent DOWN ${parts[1]} ${parts[2]}`);
    } else if (type === "MOVE") {
        sendAdbShellCommand(`cmd input motionevent MOVE ${parts[1]} ${parts[2]}`);
    } else if (type === "UP") {
        sendAdbShellCommand(`cmd input motionevent UP ${parts[1]} ${parts[2]}`);
    } else if (type === "SCROLL" && parts.length >= 4) {
        sendAdbShellCommand(`cmd input mouse scroll ${parts[1]} ${parts[2]} --axis VSCROLL,${parts[3]}`);
    } else if (type === "TAP") {
        sendAdbShellCommand(`cmd input tap ${parts[1]} ${parts[2]}`);
    } else if (type === "KEY") {
        sendAdbShellCommand(`cmd input keyevent ${parts[1]}`);
    } else if (type === "TEXT") {
        sendAdbShellCommand(`cmd input text ${cmdStr.substring(5)}`);
    }

    ensureControlServer().catch(() => {});
}

function stopControlServer() {
    if (controlSocket) {
        try { controlSocket.destroy(); } catch (e) {}
        controlSocket = null;
    }
    if (adbShellProcess) {
        try {
            adbShellProcess.stdin.end();
            adbShellProcess.kill();
        } catch (e) {}
        adbShellProcess = null;
    }
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

async function getDeviceRotation() {
    try {
        const result = await runAdb(["shell", "dumpsys", "input"]);
        const match = result.stdout.match(/SurfaceOrientation:\s*(\d)/);
        if (match) return match[1];
    } catch (e) {}
    
    try {
        const result = await runAdb(["shell", "dumpsys", "window", "displays"]);
        const match = result.stdout.match(/mCurrentRotation=ROTATION_(\d+)/);
        if (match) {
            return match[1] === "0" ? "0" : match[1] === "90" ? "1" : match[1] === "180" ? "2" : "3";
        }
    } catch (e) {}
    return null;
}

function startRotationPolling() {
    stopRotationPolling();
    getDeviceRotation().then(rot => {
        currentRotation = rot;
    });

    rotationInterval = setInterval(async () => {
        if (!state.running) {
            stopRotationPolling();
            return;
        }

        const newRot = await getDeviceRotation();
        if (newRot !== null && currentRotation !== null && newRot !== currentRotation) {
            currentRotation = newRot;
            console.log("Device rotation changed to", newRot, "- restarting stream");
            
            stopPreview();
            setTimeout(() => {
                startPreview();
            }, 600);
        } else if (newRot !== null) {
            currentRotation = newRot;
        }
    }, 1500);
}

function stopRotationPolling() {
    if (rotationInterval) {
        clearInterval(rotationInterval);
        rotationInterval = null;
    }
}

async function startPreview() {
    if (state.running) return;

    const ready = await ensureDeviceReady();
    if (!ready) return;

    state.running = true;
    state.frameCount = 0;
    state.currentOrientation = null;
    elements.startButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.refreshButton.disabled = true;
    if (elements.popoutButton) elements.popoutButton.disabled = false;
    setMessage("Streaming screen in real-time...", "success");

    startRotationPolling();

    if (!state.controller && elements.canvas) {
        state.controller = new SCController(elements.canvas, (cmdStr) => sendSocketCommand(cmdStr));
    } else if (state.controller) {
        state.controller.setEnabled(true);
    }

    try {
        state.decoder = new H264StreamDecoder(elements.canvas, (stats) => {
            elements.phoneShell.classList.add("has-frame");
            elements.frameInfo.textContent = `${stats.frameCount} frames | ${stats.fps} FPS (${stats.width}×${stats.height})`;

            updateOrientation(stats.width, stats.height);
        });
    } catch (err) {
        setMessage(err.message, "error");
        stopPreview();
        return;
    }

    const settings = getStreamSettings();
    loadSettingsDisplay();
    const adbCommand = state.adbPath || "adb";

    const spawnArgs = [
        "exec-out",
        "screenrecord",
        "--output-format=h264",
        "--bit-rate", settings.bitrate,
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

        // Trigger Audio Share safely after video stream spawn
        try {
            getAudioManager()?.startAudioShare(runAdb).catch((err) => {
                console.warn("[SC] Audio share background error:", err);
            });
        } catch (audioErr) {
            console.warn("[SC] Audio share sync error:", audioErr);
        }
    } catch (err) {
        setMessage("Failed to spawn screenrecord: " + err.message, "error");
        stopPreview();
    }
}

function stopPreview() {
    state.running = false;
    stopRotationPolling();
    stopControlServer();
    getAudioManager()?.stopAudioShare(runAdb);

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
