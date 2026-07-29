const { execFile, spawn } = require("child_process");
const path = require("path");
const os = require("os");

const RESOLUTION_MAP = {
    "720p": "720x1280",
    "1080p": "1080x1920",
    "1440p": "1440x2560",
    "4K": "2160x3840"
};

const state = {
    adbPath: null,
    adbProcess: null,
    decoder: null,
    running: false
};

document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const passedAdbPath = params.get("adbPath");
    if (passedAdbPath) {
        state.adbPath = passedAdbPath;
    }

    startStream();
});

window.addEventListener("beforeunload", () => {
    stopStream();
});

function getSettings() {
    const resKey = localStorage.getItem("SCFT_Resolution") || "1080p";
    const bitrateRaw = parseFloat(localStorage.getItem("SCFT_Bitrate") || "4");
    const fps = localStorage.getItem("SCFT_FPS") || "60";

    return {
        resolution: RESOLUTION_MAP[resKey] || "1080x1920",
        bitrate: String(Math.round(bitrateRaw * 1000000)),
        fps: fps
    };
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

function findAdb() {
    if (state.adbPath) return Promise.resolve(state.adbPath);

    const candidates = getAdbCandidates();

    return new Promise((resolve, reject) => {
        function tryCandidate(index) {
            if (index >= candidates.length) {
                reject(new Error("ADB not found"));
                return;
            }

            const command = candidates[index];
            execFile(command, ["version"], { windowsHide: true }, (error) => {
                if (error && error.code === "ENOENT") {
                    tryCandidate(index + 1);
                    return;
                }

                if (error) {
                    tryCandidate(index + 1);
                    return;
                }

                state.adbPath = command;
                resolve(command);
            });
        }

        tryCandidate(0);
    });
}

async function startStream() {
    const statsEl = document.getElementById("popout_stats");
    const container = document.getElementById("popout_container");
    const canvas = document.getElementById("popout_canvas");

    statsEl.textContent = "Finding ADB...";

    let adbCommand;
    try {
        adbCommand = await findAdb();
    } catch (err) {
        statsEl.textContent = "ADB not found";
        return;
    }

    const settings = getSettings();
    statsEl.textContent = "Starting stream...";

    let orientationSet = false;

    state.decoder = new H264StreamDecoder(canvas, (stats) => {
        container.classList.add("has-frame");
        statsEl.textContent = `${stats.frameCount} frames | ${stats.fps} FPS (${stats.width}×${stats.height})`;

        if (!orientationSet && stats.width > 0 && stats.height > 0) {
            orientationSet = true;
        }
    });

    const spawnArgs = [
        "exec-out",
        "screenrecord",
        "--output-format=h264",
        "--size", settings.resolution,
        "--bit-rate", settings.bitrate,
        "--time-limit", "1800",
        "-"
    ];

    state.running = true;

    try {
        state.adbProcess = spawn(adbCommand, spawnArgs, { windowsHide: true });

        state.adbProcess.stdout.on("data", (chunk) => {
            if (!state.running || !state.decoder) return;
            state.decoder.feedChunk(chunk);
        });

        state.adbProcess.stderr.on("data", (data) => {
            console.warn("Popout ADB stderr:", data.toString());
        });

        state.adbProcess.on("error", (err) => {
            statsEl.textContent = "ADB error: " + err.message;
            stopStream();
        });

        state.adbProcess.on("close", () => {
            if (state.running) {
                statsEl.textContent = "Disconnected";
                state.running = false;
            }
        });
    } catch (err) {
        statsEl.textContent = "Failed to start: " + err.message;
    }
}

function stopStream() {
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
}
