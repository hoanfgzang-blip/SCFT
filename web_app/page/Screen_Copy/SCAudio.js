let nodePath = null;
let nodeFs = null;
let nodeNet = null;
let nodeChildProcess = null;

try {
    if (typeof require !== "undefined") {
        nodePath = require("path");
        nodeFs = require("fs");
        nodeNet = require("net");
        nodeChildProcess = require("child_process");
    } else if (typeof window !== "undefined" && window.require) {
        nodePath = window.require("path");
        nodeFs = window.require("fs");
        nodeNet = window.require("net");
        nodeChildProcess = window.require("child_process");
    }
} catch (e) {}

class SCAudioManager {
    constructor() {
        this.active = false;
        this.audioContext = null;
        this.gainNode = null;
        this.tcpSocket = null;
        this.serverProcess = null;
        this.nextStartTime = 0;
        this.pcmRemainder = null;
        this.receivedFrames = 0;
        this.headerSkipped = false;
        this.serverJarPath = this.resolveServerJarPath();
    }

    resolveServerJarPath() {
        try {
            if (!nodePath || !nodeFs) return null;
            const dirName = (typeof __dirname !== "undefined") ? __dirname : "";
            const candidates = [
                nodePath.join(dirName, "..", "..", "..", "build-resources", "scft-audio.jar"),
                nodePath.join(process.cwd ? process.cwd() : "", "build-resources", "scft-audio.jar"),
                nodePath.join(process.resourcesPath || "", "scft-audio.jar")
            ];
            for (const c of candidates) {
                if (nodeFs.existsSync(c)) return c;
            }
        } catch (e) {}
        return null;
    }

    isAudioShareEnabled() {
        if (typeof localStorage === "undefined") return true;
        const val = localStorage.getItem("SCFT_AudioShare");
        return val !== "false";
    }

    getSystemVolumeSetting() {
        if (typeof localStorage === "undefined") return 1.0;
        const rawVol = localStorage.getItem("SCFT_Volume");
        return rawVol !== null ? parseInt(rawVol, 10) / 100 : 1.0;
    }

    updateAudioStatus(statusText) {
        if (typeof document !== "undefined") {
            const el = document.getElementById("sc_audio_status_text");
            if (el) el.textContent = statusText;
        }
    }

    async startAudioShare(runAdbFn) {
        try {
            if (!this.isAudioShareEnabled()) {
                console.log("[SCAudioManager] Audio share is disabled in settings. Doing nothing.");
                this.updateAudioStatus("Tắt (Không chia sẻ)");
                return false;
            }

            if (this.active) return true;

            console.log("[SCAudioManager] Audio share is ENABLED. Pushing scft-audio.jar...");
            this.updateAudioStatus("Đang mở luồng âm thanh...");
            this.receivedFrames = 0;
            this.headerSkipped = false;

            const adbBin = (typeof process !== "undefined" && process.env.SCFT_ADB_PATH) ? process.env.SCFT_ADB_PATH : "adb";

            if (typeof runAdbFn === "function") {
                // 1. Push DEX server jar to phone
                const jarFile = this.serverJarPath || this.resolveServerJarPath();
                if (jarFile) {
                    try {
                        await runAdbFn(["push", jarFile, "/data/local/tmp/scft-audio.jar"]);
                        console.log("[SCAudioManager] Pushed scft-audio.jar to phone successfully.");
                    } catch (pushErr) {
                        console.warn("[SCAudioManager] ADB push note:", pushErr.message);
                    }
                }

                // 2. Setup ADB forward tcp:10790 to abstract socket scrcpy_audio
                try {
                    await runAdbFn(["forward", "tcp:10790", "localabstract:scrcpy_audio"]);
                } catch (fwdErr) {
                    console.warn("[SCAudioManager] ADB forward note:", fwdErr.message);
                }

                // 3. Spawn background app_process on phone under Shell UID 2000 using non-blocking spawn
                try {
                    const shellCmd = "CLASSPATH=/data/local/tmp/scft-audio.jar app_process / com.genymobile.scrcpy.Server 3.3.4 log_level=info video=false audio=true audio_codec=raw audio_encoder=pcm control=false tunnel_forward=true";
                    if (nodeChildProcess) {
                        this.serverProcess = nodeChildProcess.spawn(adbBin, ["shell", shellCmd], { windowsHide: true });
                        this.serverProcess.stderr.on("data", (d) => console.warn("[AudioServer stderr]:", d.toString()));
                    } else {
                        runAdbFn(["shell", shellCmd]).catch(() => {});
                    }
                    console.log("[SCAudioManager] Spawned background scft-audio.jar app_process over ADB.");
                } catch (err) {
                    console.warn("[SCAudioManager] Error spawning scft-audio.jar:", err.message);
                }
            }

            // 4. Initialize PC Web Audio Context & Gain Node
            try {
                const AudioContextClass = (typeof window !== "undefined") ? (window.AudioContext || window.webkitAudioContext) : null;
                if (AudioContextClass) {
                    this.audioContext = new AudioContextClass({ sampleRate: 48000 });
                    this.gainNode = this.audioContext.createGain();
                    const currentVol = this.getSystemVolumeSetting();
                    this.gainNode.gain.setValueAtTime(currentVol, this.audioContext.currentTime);
                    this.gainNode.connect(this.audioContext.destination);

                    if (this.audioContext.state === "suspended") {
                        await this.audioContext.resume();
                    }

                    const outputDeviceId = (typeof localStorage !== "undefined") ? localStorage.getItem("SCFT_OutputDevice") : null;
                    if (outputDeviceId && this.audioContext.setSinkId) {
                        await this.audioContext.setSinkId(outputDeviceId);
                    }
                    this.nextStartTime = this.audioContext.currentTime;
                }
            } catch (err) {
                console.warn("[SCAudioManager] Error setting up PC audio context:", err.message);
            }

            // 5. Connect TCP socket to receive internal PCM system audio stream
            if (nodeNet) {
                this.connectTcpStream(runAdbFn);
            }

            this.active = true;
            return true;
        } catch (globalErr) {
            console.warn("[SCAudioManager] startAudioShare error:", globalErr);
            this.updateAudioStatus("Tắt (Lỗi mở âm thanh)");
            return false;
        }
    }

    connectTcpStream(runAdbFn, retries = 5) {
        if (!nodeNet) return;
        if (this.tcpSocket) {
            try { this.tcpSocket.destroy(); } catch (e) {}
            this.tcpSocket = null;
        }

        try {
            const socket = nodeNet.createConnection({ port: 10790, host: "127.0.0.1" }, () => {
                console.log("[SCAudioManager] Connected to scft-audio.jar TCP socket (127.0.0.1:10790).");
                this.updateAudioStatus("Đã kết nối âm thanh hệ thống -> Loa PC 🔊");
            });

            this.tcpSocket = socket;

            socket.on("data", (chunk) => {
                if (!this.headerSkipped) {
                    if (chunk.length >= 64) {
                        this.headerSkipped = true;
                        chunk = chunk.slice(64);
                    } else {
                        return;
                    }
                }
                if (chunk.length > 0) {
                    this.playPcmChunk(chunk);
                }
            });

            socket.on("error", (err) => {
                if (retries > 0 && this.active) {
                    setTimeout(() => this.connectTcpStream(runAdbFn, retries - 1), 1000);
                }
            });

            socket.on("close", () => {});
        } catch (err) {}
    }

    playPcmChunk(chunk) {
        try {
            if (!this.audioContext || this.audioContext.state === "closed") return;

            if (this.audioContext.state === "suspended") {
                this.audioContext.resume().catch(() => {});
            }

            let data = chunk;
            if (this.pcmRemainder && this.pcmRemainder.length > 0) {
                data = Buffer.concat([this.pcmRemainder, chunk]);
                this.pcmRemainder = null;
            }

            const remainderBytes = data.length % 4;
            if (remainderBytes !== 0) {
                this.pcmRemainder = data.slice(data.length - remainderBytes);
                data = data.slice(0, data.length - remainderBytes);
            }

            if (data.length < 4) return;

            const int16Array = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
            const numFrames = int16Array.length / 2;
            if (numFrames <= 0) return;

            const audioBuffer = this.audioContext.createBuffer(2, numFrames, 48000);
            const leftChannel = audioBuffer.getChannelData(0);
            const rightChannel = audioBuffer.getChannelData(1);

            for (let i = 0; i < numFrames; i++) {
                leftChannel[i] = int16Array[i * 2] / 32768.0;
                rightChannel[i] = int16Array[i * 2 + 1] / 32768.0;
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            if (this.gainNode) {
                const currentVol = this.getSystemVolumeSetting();
                this.gainNode.gain.setValueAtTime(currentVol, this.audioContext.currentTime);
                source.connect(this.gainNode);
            } else {
                source.connect(this.audioContext.destination);
            }

            const now = this.audioContext.currentTime;
            if (this.nextStartTime < now) {
                this.nextStartTime = now + 0.02;
            }

            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.receivedFrames += numFrames;

            if (this.receivedFrames % 48000 < numFrames) {
                this.updateAudioStatus("Đang phát âm thanh hệ thống trên PC 🔊");
            }
        } catch (e) {}
    }

    async stopAudioShare(runAdbFn) {
        if (!this.active) return;
        this.active = false;

        this.updateAudioStatus("Đã tắt");

        if (this.serverProcess) {
            try {
                this.serverProcess.kill();
            } catch (e) {}
            this.serverProcess = null;
        }

        if (this.tcpSocket) {
            try { this.tcpSocket.destroy(); } catch (e) {}
            this.tcpSocket = null;
        }

        if (this.audioContext) {
            try {
                await this.audioContext.close();
            } catch (e) {}
            this.audioContext = null;
            this.gainNode = null;
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { SCAudioManager };
}
