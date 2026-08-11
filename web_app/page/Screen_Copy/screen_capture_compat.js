(function (global) {
    const { execFile, spawn } = require("child_process");
    const fs = require("fs");
    const net = require("net");
    const path = require("path");

    const PNG_MAX_BUFFER = 12 * 1024 * 1024;
    const SCRCPY_VERSION = "4.1";

    function execFilePromise(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            execFile(command, args, options, (error, stdout, stderr) => {
                if (error) {
                    error.stdout = stdout;
                    error.stderr = stderr;
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
    }

    async function detectRawH264(adbPath) {
        let output = "";
        try {
            const result = await execFilePromise(adbPath, ["shell", "screenrecord", "--help"], {
                windowsHide: true,
                encoding: "utf8",
                maxBuffer: 256 * 1024
            });
            output = `${result.stdout || ""}\n${result.stderr || ""}`;
        } catch (error) {
            output = `${error.stdout || ""}\n${error.stderr || error.message || ""}`;
        }

        const hasFormatOption = /--output-format(?:[=\s]|$)/i.test(output);
        const hasRawH264 = hasFormatOption && /(h264|raw)/i.test(output);
        return {
            h264: hasRawH264,
            help: output
        };
    }

    function capturePngFrame(adbPath) {
        return execFilePromise(adbPath, ["exec-out", "screencap", "-p"], {
            windowsHide: true,
            encoding: null,
            maxBuffer: PNG_MAX_BUFFER
        }).then(({ stdout, stderr }) => {
            const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
            if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) {
                const detail = Buffer.isBuffer(stderr) ? stderr.toString() : String(stderr || "");
                throw new Error(detail || "ADB screencap did not return a PNG frame.");
            }
            return bytes;
        });
    }

    function renderPngToCanvas(canvas, bytes) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([bytes], { type: "image/png" });
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                try {
                    canvas.width = image.naturalWidth;
                    canvas.height = image.naturalHeight;
                    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve({ width: canvas.width, height: canvas.height });
                } finally {
                    URL.revokeObjectURL(url);
                }
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Không giải mã được frame PNG từ Android."));
            };
            image.src = url;
        });
    }

    function startPngCapture(options) {
        const intervalMs = Math.round(1000 / Math.min(15, Math.max(1, Number(options.fps) || 10)));
        let stopped = false;
        let timer = null;
        let frameCount = 0;
        let framesInWindow = 0;
        let windowStartedAt = Date.now();
        let errorReported = false;

        const stop = () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            timer = null;
        };

        const schedule = () => {
            if (!stopped && options.isActive()) timer = setTimeout(capture, intervalMs);
        };

        const capture = async () => {
            if (stopped || !options.isActive()) return;
            try {
                const bytes = await capturePngFrame(options.adbPath);
                if (stopped || !options.isActive()) return;
                const size = await renderPngToCanvas(options.canvas, bytes);
                frameCount += 1;
                framesInWindow += 1;
                const now = Date.now();
                const elapsed = now - windowStartedAt;
                let fps = 0;
                if (elapsed >= 1000) {
                    fps = Math.round((framesInWindow * 1000) / elapsed);
                    framesInWindow = 0;
                    windowStartedAt = now;
                }
                errorReported = false;
                options.onFrame({ frameCount, fps, width: size.width, height: size.height, mode: "png" });
            } catch (error) {
                if (!errorReported) {
                    errorReported = true;
                    options.onError?.(error);
                }
            } finally {
                schedule();
            }
        };

        capture();
        return stop;
    }

    function resolveScrcpyServerPath() {
        const candidates = [];
        if (process.resourcesPath) {
            candidates.push(path.join(process.resourcesPath, "scrcpy", `scrcpy-server-v${SCRCPY_VERSION}.jar`));
        }
        if (typeof __dirname !== "undefined") {
            candidates.push(path.join(__dirname, "..", "..", "..", "resources", "scrcpy", `scrcpy-server-v${SCRCPY_VERSION}.jar`));
            candidates.push(path.join(__dirname, "..", "..", "..", "build-resources", "scrcpy", `scrcpy-server-v${SCRCPY_VERSION}.jar`));
        }
        candidates.push(path.join(process.cwd(), "build-resources", "scrcpy", `scrcpy-server-v${SCRCPY_VERSION}.jar`));
        return candidates.find(candidate => {
            try {
                return fs.existsSync(candidate);
            } catch (_) {
                return false;
            }
        }) || null;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function startScrcpyRawCapture(options) {
        const adbPath = options.adbPath;
        const serverPath = options.serverPath || resolveScrcpyServerPath();
        if (!serverPath) {
            throw new Error("Không tìm thấy scrcpy-server trong gói SCFT.");
        }

        const scid = Math.floor(Math.random() * 0x7fffffff).toString(16);
        const socketName = `scrcpy_${scid.padStart(8, "0")}`;
        const remotePath = `/data/local/tmp/scft-scrcpy-server-${scid}.jar`;
        let port = null;
        let serverProcess = null;
        let socket = null;
        let remotePids = [];
        let stopped = false;
        let stderr = "";

        const removeForward = async () => {
            if (port === null) return;
            try {
                await execFilePromise(adbPath, ["forward", "--remove", `tcp:${port}`], {
                    windowsHide: true,
                    encoding: "utf8",
                    maxBuffer: 64 * 1024
                });
            } catch (_) {}
            port = null;
        };

        const stop = async () => {
            if (stopped) return;
            stopped = true;
            if (socket) {
                try { socket.destroy(); } catch (_) {}
                socket = null;
            }
            if (serverProcess) {
                try { serverProcess.kill(); } catch (_) {}
                serverProcess = null;
            }
            if (remotePids.length > 0) {
                try {
                    await execFilePromise(adbPath, ["shell", "kill", "-9", ...remotePids], {
                        windowsHide: true,
                        encoding: "utf8",
                        maxBuffer: 64 * 1024
                    });
                } catch (_) {}
                remotePids = [];
            }
            await removeForward();
        };

        try {
            await execFilePromise(adbPath, ["push", serverPath, remotePath], {
                windowsHide: true,
                encoding: "utf8",
                maxBuffer: 256 * 1024
            });

            const forwardResult = await execFilePromise(adbPath, [
                "forward",
                "tcp:0",
                `localabstract:${socketName}`
            ], {
                windowsHide: true,
                encoding: "utf8",
                maxBuffer: 64 * 1024
            });
            const portMatch = String(forwardResult.stdout || "").match(/\d+/);
            port = portMatch ? Number(portMatch[0]) : null;
            if (!port) throw new Error("ADB không cấp được cổng cho scrcpy-server.");

            const streamType = options.streamType || "video";
            const isAudio = streamType === "audio";
            const maxSize = Number(options.maxSize) || 1920;
            const maxFps = Number(options.maxFps) || 60;
            const bitrate = Number(options.bitrate) || 4000000;
            const serverArgs = [
                "shell",
                `CLASSPATH=${remotePath}`,
                "app_process",
                "/",
                "com.genymobile.scrcpy.Server",
                SCRCPY_VERSION,
                `scid=${scid}`,
                "tunnel_forward=true",
                `video=${isAudio ? "false" : "true"}`,
                `audio=${isAudio ? "true" : "false"}`,
                "control=false",
                "cleanup=true",
                "raw_stream=true",
                ...(isAudio ? [
                    "audio_codec=raw",
                    "audio_source=output"
                ] : [
                    `max_size=${maxSize}`,
                    `max_fps=${maxFps}`,
                    `video_bit_rate=${bitrate}`
                ])
            ];
            serverProcess = spawn(adbPath, serverArgs, { windowsHide: true });
            serverProcess.stderr?.on("data", data => {
                stderr += data.toString();
                if (stderr.length > 16 * 1024) stderr = stderr.slice(-16 * 1024);
            });

            // The ADB forward can accept a TCP connection before the Android
            // local socket is listening. Give app_process time to create it.
            await sleep(Number(options.startupDelayMs) || 600);
            try {
                const psResult = await execFilePromise(adbPath, ["shell", "ps", "-A", "-o", "PID,ARGS"], {
                    windowsHide: true,
                    encoding: "utf8",
                    maxBuffer: 512 * 1024
                });
                remotePids = String(psResult.stdout || "")
                    .split(/\r?\n/)
                    .filter(line => line.includes(remotePath))
                    .map(line => line.trim().match(/^(\d+)/)?.[1])
                    .filter(Boolean);
            } catch (_) {}
            const deadline = Date.now() + 10000;
            let lastConnectError = null;
            while (!stopped && Date.now() < deadline) {
                try {
                    socket = await new Promise((resolve, reject) => {
                        const candidate = net.createConnection({ host: "127.0.0.1", port });
                        const onError = error => {
                            candidate.destroy();
                            reject(error);
                        };
                        candidate.once("connect", () => {
                            candidate.removeListener("error", onError);
                            resolve(candidate);
                        });
                        candidate.once("error", onError);
                    });
                    break;
                } catch (error) {
                    lastConnectError = error;
                    await sleep(120);
                }
            }

            if (!socket) {
                const detail = stderr.trim() || lastConnectError?.message || "Không kết nối được tới scrcpy-server.";
                throw new Error(detail);
            }

            socket.on("data", chunk => {
                if (!stopped && chunk.length > 0) options.onData?.(chunk);
            });
            socket.on("error", error => {
                if (!stopped) options.onError?.(error);
            });
            socket.on("close", () => {
                if (!stopped) options.onClose?.();
            });
            serverProcess.on("close", code => {
                if (!stopped && code !== 0) {
                    options.onError?.(new Error(stderr.trim() || `scrcpy-server exited with code ${code}`));
                }
            });

            return {
                mode: isAudio ? "scrcpy-audio-pcm" : "scrcpy-h264",
                port,
                stop,
                serverProcess,
                socket
            };
        } catch (error) {
            await stop();
            throw error;
        }
    }

    function startScrcpyH264Capture(options) {
        return startScrcpyRawCapture({ ...options, streamType: "video" });
    }

    function startScrcpyAudioCapture(options) {
        return startScrcpyRawCapture({ ...options, streamType: "audio" });
    }

    global.SCFTScreenCaptureCompat = {
        detectRawH264,
        capturePngFrame,
        renderPngToCanvas,
        startPngCapture,
        resolveScrcpyServerPath,
        startScrcpyH264Capture,
        startScrcpyAudioCapture
    };
})(typeof window !== "undefined" ? window : globalThis);
