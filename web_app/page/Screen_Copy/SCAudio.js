let nodePath = null;
let nodeFs = null;
let nodeChildProcess = null;

try {
    if (typeof require !== "undefined") {
        nodePath = require("path");
        nodeFs = require("fs");
        nodeChildProcess = require("child_process");
    } else if (typeof window !== "undefined" && window.require) {
        nodePath = window.require("path");
        nodeFs = window.require("fs");
        nodeChildProcess = window.require("child_process");
    }
} catch (e) {}

/**
 * SCAudioManager — scrcpy-server raw PCM audio with legacy JAR fallback
 *
 * Architecture (simple, no sockets):
 *   Phone: scrcpy-server runs AudioRecord → writes raw PCM to an ADB socket
 *   PC:    adb exec-out pipes that stdout directly to Node.js
 *   PC:    Node.js feeds chunks to WebAudio API → PC speakers
 *
 * The legacy SimpleAudioCapture JAR is retained only as a fallback.
 */
class SCAudioManager {
    constructor() {
        this.active = false;
        this.audioContext = null;
        this.gainNode = null;
        this.adbProcess = null;  // adb exec-out process
        this.scrcpyCapture = null;
        this.nextStartTime = 0;
        this.pcmRemainder = null;
        this.receivedFrames = 0;
        this.simpleJarPath = this.resolveSimpleJarPath();
    }

    resolveSimpleJarPath() {
        try {
            if (!nodePath || !nodeFs) return null;
            const dirName = (typeof __dirname !== "undefined") ? __dirname : "";
            const candidates = [
                nodePath.join(dirName, "..", "..", "..", "build-resources", "scft-simple-audio.jar"),
                nodePath.join(process.cwd ? process.cwd() : "", "build-resources", "scft-simple-audio.jar"),
                nodePath.join(process.resourcesPath || "", "scft-simple-audio.jar")
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

    async prepareAudioContext() {
        try {
            const AudioContextClass = (typeof window !== "undefined")
                ? (window.AudioContext || window.webkitAudioContext) : null;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass({ sampleRate: 48000 });
                this.gainNode = this.audioContext.createGain();
                this.gainNode.gain.setValueAtTime(this.getSystemVolumeSetting(), this.audioContext.currentTime);
                this.gainNode.connect(this.audioContext.destination);
                const outputDeviceId = (typeof localStorage !== "undefined")
                    ? localStorage.getItem("SCFT_OutputDevice") : null;
                if (outputDeviceId && this.audioContext.setSinkId) {
                    await this.audioContext.setSinkId(outputDeviceId);
                }
                if (this.audioContext.state === "suspended") {
                    await this.audioContext.resume();
                }
                this.nextStartTime = this.audioContext.currentTime;
                console.log("[SCAudioManager] WebAudio context ready, sampleRate=48000");
            }
        } catch (err) {
            console.warn("[SCAudioManager] WebAudio setup error:", err.message);
        }
    }

    async closeAudioOutput() {
        if (this.audioContext) {
            try { await this.audioContext.close(); } catch (e) {}
            this.audioContext = null;
            this.gainNode = null;
        }
    }

    async startAudioShare(runAdbFn) {
        try {
            if (!this.isAudioShareEnabled()) {
                this.updateAudioStatus("Tắt (Không chia sẻ)");
                return false;
            }

            if (this.active) return true;

            this.updateAudioStatus("Đang khởi động âm thanh...");
            this.receivedFrames = 0;

            const adbBin = (typeof process !== "undefined" && process.env.SCFT_ADB_PATH)
                ? process.env.SCFT_ADB_PATH : "adb";

            const compat = (typeof SCFTScreenCaptureCompat !== "undefined")
                ? SCFTScreenCaptureCompat : null;
            if (compat?.startScrcpyAudioCapture) {
                try {
                    await this.prepareAudioContext();
                    this.active = true;
                    this.updateAudioStatus("Đang kết nối audio scrcpy-server...");
                    this.scrcpyCapture = await compat.startScrcpyAudioCapture({
                        adbPath: adbBin,
                        serverPath: compat.resolveScrcpyServerPath?.(),
                        startupDelayMs: 900,
                        onData: chunk => {
                            if (this.active) this.playPcmChunk(chunk);
                        },
                        onError: error => {
                            console.warn("[SCAudioManager] scrcpy-server audio:", error.message);
                            if (this.active) this.updateAudioStatus("Lỗi audio: " + error.message.substring(0, 60));
                        },
                        onClose: () => {
                            if (this.active) {
                                this.active = false;
                                this.updateAudioStatus("Luồng audio kết thúc");
                            }
                        }
                    });
                    this.updateAudioStatus("Đang phát âm thanh hệ thống 🔊");
                    console.log("[SCAudioManager] scrcpy-server raw PCM audio started.");
                    return true;
                } catch (scrcpyErr) {
                    console.warn("[SCAudioManager] scrcpy-server audio unavailable:", scrcpyErr.message);
                    this.active = false;
                    this.scrcpyCapture = null;
                    await this.closeAudioOutput();
                    this.updateAudioStatus("Không khởi động được audio scrcpy");
                }
            }

            // Step 1: Find and push the simple audio JAR
            const jarFile = this.simpleJarPath || this.resolveSimpleJarPath();
            if (!jarFile) {
                console.error("[SCAudioManager] scft-simple-audio.jar NOT FOUND. Build it with build-resources/audio-engine/build-audio-jar.ps1");
                this.updateAudioStatus("Lỗi: Chưa build scft-simple-audio.jar");
                return false;
            }

            console.log("[SCAudioManager] Found JAR:", jarFile);
            this.updateAudioStatus("Đang push JAR lên thiết bị...");

            try {
                await runAdbFn(["push", jarFile, "/data/local/tmp/scft-simple-audio.jar"]);
                console.log("[SCAudioManager] Pushed scft-simple-audio.jar to phone.");
            } catch (pushErr) {
                console.warn("[SCAudioManager] ADB push error:", pushErr.message);
                this.updateAudioStatus("Lỗi push JAR: " + pushErr.message.substring(0, 50));
                return false;
            }

            // Step 2: Initialize WebAudio on PC
            try {
                const AudioContextClass = (typeof window !== "undefined")
                    ? (window.AudioContext || window.webkitAudioContext) : null;
                if (AudioContextClass) {
                    this.audioContext = new AudioContextClass({ sampleRate: 48000 });
                    this.gainNode = this.audioContext.createGain();
                    this.gainNode.gain.setValueAtTime(this.getSystemVolumeSetting(), this.audioContext.currentTime);
                    this.gainNode.connect(this.audioContext.destination);
                    if (this.audioContext.state === "suspended") {
                        await this.audioContext.resume();
                    }
                    const outputDeviceId = (typeof localStorage !== "undefined")
                        ? localStorage.getItem("SCFT_OutputDevice") : null;
                    if (outputDeviceId && this.audioContext.setSinkId) {
                        await this.audioContext.setSinkId(outputDeviceId);
                    }
                    this.nextStartTime = this.audioContext.currentTime;
                    console.log("[SCAudioManager] WebAudio context ready, sampleRate=48000");
                }
            } catch (err) {
                console.warn("[SCAudioManager] WebAudio setup error:", err.message);
            }

            // Step 3: Launch app_process via adb exec-out, read raw PCM from stdout
            // Key insight: no TCP socket needed — PCM streams directly through adb pipe
            this.active = true;
            this.updateAudioStatus("Đang kết nối luồng âm thanh...");

            if (nodeChildProcess) {
                const shellCmd = "CLASSPATH=/data/local/tmp/scft-simple-audio.jar app_process / com.scft.audio.SimpleAudioCapture";
                console.log("[SCAudioManager] Spawning: adb exec-out", shellCmd);

                this.adbProcess = nodeChildProcess.spawn(adbBin, ["exec-out", shellCmd], {
                    windowsHide: true
                });

                this.adbProcess.stdout.on("data", (chunk) => {
                    if (!this.active) return;
                    this.playPcmChunk(chunk);
                });

                this.adbProcess.stderr.on("data", (d) => {
                    const msg = d.toString().trim();
                    if (!msg) return;
                    console.log("[SCAudioManager stderr]:", msg);
                    if (msg.includes("Recording started")) {
                        this.updateAudioStatus("Đang phát âm thanh hệ thống 🔊");
                    } else if (msg.includes("not available") || msg.includes("failed to initialize")) {
                        this.updateAudioStatus("Lỗi: REMOTE_SUBMIX không khả dụng");
                    } else if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("exception")) {
                        this.updateAudioStatus("Lỗi: " + msg.substring(0, 60));
                    }
                });

                this.adbProcess.on("error", (err) => {
                    console.error("[SCAudioManager] adb exec-out error:", err.message);
                    this.updateAudioStatus("Lỗi ADB: " + err.message.substring(0, 60));
                });

                this.adbProcess.on("close", (code) => {
                    console.log("[SCAudioManager] adb exec-out exited, code:", code);
                    if (this.active) {
                        this.updateAudioStatus("Luồng âm thanh kết thúc (code " + code + ")");
                        this.active = false;
                    }
                });

                console.log("[SCAudioManager] Option A: adb exec-out PCM pipe started.");
            }

            return true;
        } catch (globalErr) {
            console.warn("[SCAudioManager] startAudioShare error:", globalErr);
            this.updateAudioStatus("Lỗi khởi động âm thanh");
            return false;
        }
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
        if (!this.active && !this.scrcpyCapture && !this.adbProcess && !this.audioContext) return;
        this.active = false;
        this.updateAudioStatus("Đã tắt");

        if (this.adbProcess) {
            try { this.adbProcess.kill(); } catch (e) {}
            this.adbProcess = null;
        }

        if (this.scrcpyCapture) {
            try { await this.scrcpyCapture.stop(); } catch (e) {}
            this.scrcpyCapture = null;
        }

        await this.closeAudioOutput();
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { SCAudioManager };
}
