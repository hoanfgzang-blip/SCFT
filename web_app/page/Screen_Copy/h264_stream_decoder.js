class H264StreamDecoder {
    constructor(canvas, onStatsUpdate) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.onStatsUpdate = onStatsUpdate || (() => {});
        this.decoder = null;
        this.buffer = Buffer.alloc(0);
        this.frameCount = 0;
        this.lastFpsUpdate = Date.now();
        this.framesInLastSecond = 0;
        this.currentFps = 0;
        this.hasReceivedKeyframe = false;
        this.spsBuffer = null;
        this.ppsBuffer = null;
        this.timestampUs = 0;
        this.isDestroyed = false;

        this.initDecoder();
    }

    initDecoder() {
        if (typeof VideoDecoder === "undefined") {
            throw new Error("WebCodecs VideoDecoder API is not supported in this environment.");
        }

        this.decoder = new VideoDecoder({
            output: (frame) => this.handleFrame(frame),
            error: (e) => {
                console.error("H264 VideoDecoder error:", e);
            }
        });

        this.decoder.configure({
            codec: "avc1.42E01E",
            optimizeForLatency: true
        });
    }

    handleFrame(frame) {
        if (this.isDestroyed) {
            frame.close();
            return;
        }

        if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
            this.canvas.width = frame.displayWidth;
            this.canvas.height = frame.displayHeight;
        }

        this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
        frame.close();

        this.frameCount += 1;
        this.framesInLastSecond += 1;

        const now = Date.now();
        const elapsed = now - this.lastFpsUpdate;
        if (elapsed >= 1000) {
            this.currentFps = Math.round((this.framesInLastSecond * 1000) / elapsed);
            this.framesInLastSecond = 0;
            this.lastFpsUpdate = now;
        }

        this.onStatsUpdate({
            frameCount: this.frameCount,
            fps: this.currentFps,
            width: this.canvas.width,
            height: this.canvas.height
        });
    }

    feedChunk(chunkBuffer) {
        if (this.isDestroyed) return;

        this.buffer = Buffer.concat([this.buffer, chunkBuffer]);

        const startIndices = [];
        let i = 0;

        while (i <= this.buffer.length - 3) {
            if (this.buffer[i] === 0 && this.buffer[i + 1] === 0) {
                if (this.buffer[i + 2] === 1) {
                    startIndices.push({ index: i, length: 3 });
                    i += 3;
                    continue;
                } else if (i <= this.buffer.length - 4 && this.buffer[i + 2] === 0 && this.buffer[i + 3] === 1) {
                    startIndices.push({ index: i, length: 4 });
                    i += 4;
                    continue;
                }
            }
            i++;
        }

        if (startIndices.length === 0) {
            if (this.buffer.length > 5 * 1024 * 1024) {
                this.buffer = Buffer.alloc(0);
            }
            return;
        }

        for (let k = 0; k < startIndices.length - 1; k++) {
            const current = startIndices[k];
            const next = startIndices[k + 1];
            const nalUnit = this.buffer.slice(current.index, next.index);
            this.processNalUnit(nalUnit, current.length);
        }

        const lastStart = startIndices[startIndices.length - 1];
        this.buffer = this.buffer.slice(lastStart.index);
    }

    processNalUnit(nalUnit, startCodeLength) {
        if (nalUnit.length <= startCodeLength) return;

        const nalHeader = nalUnit[startCodeLength];
        const nalType = nalHeader & 0x1f;

        if (nalType === 7) {
            this.spsBuffer = nalUnit;
            return;
        }

        if (nalType === 8) {
            this.ppsBuffer = nalUnit;
            return;
        }

        const isKeyframe = (nalType === 5);

        if (isKeyframe) {
            this.hasReceivedKeyframe = true;
        }

        if (!this.hasReceivedKeyframe) {
            return;
        }

        let payload = nalUnit;
        if (isKeyframe && this.spsBuffer && this.ppsBuffer) {
            payload = Buffer.concat([this.spsBuffer, this.ppsBuffer, nalUnit]);
        }

        this.timestampUs += 33333;

        try {
            const chunk = new EncodedVideoChunk({
                type: isKeyframe ? "key" : "delta",
                timestamp: this.timestampUs,
                data: payload
            });

            if (this.decoder && this.decoder.state === "configured") {
                this.decoder.decode(chunk);
            }
        } catch (err) {
            console.error("Error decoding chunk:", err);
        }
    }

    reset() {
        this.buffer = Buffer.alloc(0);
        this.frameCount = 0;
        this.framesInLastSecond = 0;
        this.currentFps = 0;
        this.hasReceivedKeyframe = false;
        this.spsBuffer = null;
        this.ppsBuffer = null;
        this.timestampUs = 0;

        if (this.decoder && this.decoder.state === "configured") {
            try {
                this.decoder.reset();
                this.decoder.configure({
                    codec: "avc1.42E01E",
                    optimizeForLatency: true
                });
            } catch (e) {
                console.error("Error resetting decoder:", e);
            }
        }
    }

    destroy() {
        this.isDestroyed = true;
        if (this.decoder) {
            try {
                this.decoder.close();
            } catch (e) {}
            this.decoder = null;
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = H264StreamDecoder;
}
