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
    adbProcess: null,
    decoder: null,
    running: false,
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
                process.env.SCFT_ADB_PATH = command;
                resolve(command);
            });
        }

        tryCandidate(0);
    });
}

function runAdb(args) {
    return new Promise((resolve, reject) => {
        findAdb().then((command) => {
            execFile(command, args, { windowsHide: true }, (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout, stderr, command });
            });
        }).catch(reject);
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

async function getDeviceRotation() {
    try {
        const result = await new Promise((resolve) => {
            execFile(state.adbPath || "adb", ["shell", "dumpsys", "input"], { windowsHide: true }, (err, stdout) => {
                if (err) resolve(null);
                else resolve(stdout);
            });
        });
        if (result) {
            const match = result.match(/SurfaceOrientation:\s*(\d)/);
            if (match) return match[1];
        }
    } catch (e) {}

    try {
        const result = await new Promise((resolve) => {
            execFile(state.adbPath || "adb", ["shell", "dumpsys", "window", "displays"], { windowsHide: true }, (err, stdout) => {
                if (err) resolve(null);
                else resolve(stdout);
            });
        });
        if (result) {
            const match = result.match(/mCurrentRotation=ROTATION_(\d+)/);
            if (match) {
                return match[1] === "0" ? "0" : match[1] === "90" ? "1" : match[1] === "180" ? "2" : "3";
            }
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
            
            stopStream();
            setTimeout(() => {
                startStream();
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

    startRotationPolling();

    if (!state.controller && canvas) {
        state.controller = new SCController(canvas, (cmdStr) => sendSocketCommand(cmdStr));
    } else if (state.controller) {
        state.controller.setEnabled(true);
    }

    const spawnArgs = [
        "exec-out",
        "screenrecord",
        "--output-format=h264",
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

        try {
            getAudioManager()?.startAudioShare(runAdb).catch((err) => {
                console.warn("[Popout] Audio share background error:", err);
            });
        } catch (audioErr) {
            console.warn("[Popout] Audio share sync error:", audioErr);
        }
    } catch (err) {
        statsEl.textContent = "Failed to start: " + err.message;
    }
}

function stopStream() {
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

    const canvas = document.getElementById("popout_canvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
