package com.scft.backend;

import java.awt.Graphics2D;
import java.awt.GraphicsDevice;
import java.awt.GraphicsEnvironment;
import java.awt.Rectangle;
import java.awt.Robot;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;

final class H264ScreenStreamer implements AutoCloseable {
    private static final Path VIRTUAL_DISPLAY_FRAME_PATH = Path.of(System.getenv().getOrDefault("ProgramData", "C:\\ProgramData"), "SCFT", "virtual-display-frame.bmp");
    private static volatile String detectedEncoder;
    private final int display;
    private final String displayId;
    private final int fps;
    private final String format;
    private final String bitrate;
    private final int targetWidth;
    private final int targetHeight;
    private final AtomicBoolean closed = new AtomicBoolean();
    private volatile Process process;

    H264ScreenStreamer(int display, String displayId, int fps, String format, String bitrate, int targetWidth, int targetHeight) {
        this.display = display;
        this.displayId = displayId == null ? "" : displayId.trim();
        this.fps = fps;
        this.format = format;
        this.bitrate = sanitizeBitrate(bitrate);
        this.targetWidth = targetWidth;
        this.targetHeight = targetHeight;
    }

    void stream(OutputStream response) throws IOException {
        if ("frame".equalsIgnoreCase(System.getenv("SCFT_SCREEN_STREAM_SOURCE"))) {
            streamFramePipe(response);
            return;
        }

        process = startDesktopEncoder();
        try (InputStream encoded = process.getInputStream()) {
            encoded.transferTo(response);
        }
    }

    private Process startDesktopEncoder() throws IOException {
        Rectangle bounds = screenBounds(display, displayId);
        List<String> command = encoderBase();
        command.addAll(List.of("-fflags", "nobuffer", "-f", "gdigrab", "-draw_mouse", "1", "-framerate", Integer.toString(fps), "-offset_x", Integer.toString(bounds.x), "-offset_y", Integer.toString(bounds.y), "-video_size", bounds.width + "x" + bounds.height, "-i", "desktop"));
        appendEncoderOutput(command);
        return start(command);
    }

    private void streamFramePipe(OutputStream response) throws IOException {
        RawFrame firstFrame;
        try {
            firstFrame = captureFramePipeSource();
        } catch (Exception error) {
            throw new IOException("Screen capture failed", error);
        }
        process = startFramePipeEncoder(firstFrame.width, firstFrame.height, firstFrame.pixelFormat);
        Thread producer = new Thread(() -> writeFrames(firstFrame), "scft-h264-producer");
        producer.setDaemon(true);
        producer.start();
        try (InputStream encoded = process.getInputStream()) {
            encoded.transferTo(response);
        }
    }

    private Process startFramePipeEncoder(int width, int height, String pixelFormat) throws IOException {
        List<String> command = encoderBase();
        command.addAll(List.of("-fflags", "nobuffer", "-f", "rawvideo", "-pixel_format", pixelFormat, "-video_size", width + "x" + height, "-framerate", Integer.toString(fps), "-i", "pipe:0"));
        appendEncoderOutput(command);
        return start(command);
    }

    private List<String> encoderBase() {
        String executable = resolveFfmpegExecutable();
        return new ArrayList<>(List.of(executable, "-hide_banner", "-loglevel", "error"));
    }

    private static String resolveFfmpegExecutable() {
        String configured = System.getenv("SCFT_FFMPEG_PATH");
        if (configured != null && !configured.isBlank() && Files.isRegularFile(Path.of(configured))) {
            return configured;
        }

        Path workingDirectory = Path.of(System.getProperty("user.dir", "."));
        for (Path candidate : List.of(
                workingDirectory.resolve("build-resources/ffmpeg/bin/ffmpeg.exe"),
                workingDirectory.resolve("../ffmpeg/bin/ffmpeg.exe"),
                workingDirectory.resolve("../resources/ffmpeg/bin/ffmpeg.exe")
        )) {
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().normalize().toString();
            }
        }

        return configured == null || configured.isBlank() ? "ffmpeg" : configured;
    }

    private void appendEncoderOutput(List<String> command) {
        String encoder = resolveH264Encoder();
        List<String> filters = new ArrayList<>();
        if (targetWidth > 0 && targetHeight > 0) {
            filters.add("scale=" + targetWidth + ":" + targetHeight + ":flags=fast_bilinear");
        }
        if ("h264_mf".equalsIgnoreCase(encoder)) {
            filters.add("format=nv12");
        }
        if (!filters.isEmpty()) {
            command.addAll(List.of("-vf", String.join(",", filters)));
        }
        command.addAll(List.of("-an", "-c:v", encoder));
        if ("h264_nvenc".equalsIgnoreCase(encoder)) {
            command.addAll(List.of("-preset", "p1", "-tune", "ull", "-rc-lookahead", "0", "-delay", "0", "-zerolatency", "1", "-bf", "0", "-g", Integer.toString(keyframeInterval()), "-b:v", bitrate));
        } else if ("h264_mf".equalsIgnoreCase(encoder)) {
            command.addAll(List.of("-rate_control", "ld_vbr", "-scenario", "display_remoting", "-g", Integer.toString(keyframeInterval()), "-bf", "0", "-b:v", bitrate));
        } else {
            command.addAll(List.of("-preset", "ultrafast", "-tune", "zerolatency", "-g", Integer.toString(keyframeInterval()), "-bf", "0", "-b:v", bitrate));
        }
        command.addAll(List.of("-flush_packets", "1", "-flags", "low_delay"));
        if ("h264".equalsIgnoreCase(format)) {
            command.addAll(List.of("-bsf:v", "h264_metadata=aud=insert", "-flags", "low_delay", "-f", "h264", "pipe:1"));
        } else {
            command.addAll(List.of("-muxdelay", "0", "-muxpreload", "0", "-f", "mpegts", "-mpegts_flags", "+resend_headers", "pipe:1"));
        }
    }

    private static String resolveH264Encoder() {
        String configured = System.getenv("SCFT_H264_ENCODER");
        if (configured != null && !configured.isBlank() && !"auto".equalsIgnoreCase(configured)) {
            return configured.trim();
        }
        String cached = detectedEncoder;
        if (cached != null) return cached;
        synchronized (H264ScreenStreamer.class) {
            if (detectedEncoder != null) return detectedEncoder;
            String executable = resolveFfmpegExecutable();
            try {
                Process probe = new ProcessBuilder(executable, "-hide_banner", "-encoders")
                        .redirectErrorStream(true)
                        .start();
                byte[] output = probe.getInputStream().readAllBytes();
                boolean completed = probe.waitFor(2, TimeUnit.SECONDS);
                String listing = new String(output, java.nio.charset.StandardCharsets.UTF_8);
                if (completed && probe.exitValue() == 0) {
                    for (String candidate : List.of("h264_mf", "h264_qsv", "h264_nvenc", "libx264")) {
                        if (listing.contains(" " + candidate) || listing.contains("\\t" + candidate)) {
                            detectedEncoder = candidate;
                            return candidate;
                        }
                    }
                }
            } catch (Exception ignored) {
            }
            detectedEncoder = "libx264";
            return detectedEncoder;
        }
    }


    private int keyframeInterval() {
        return Math.max(6, fps / 4);
    }

    private static String sanitizeBitrate(String value) {
        if (value == null || value.isBlank()) {
            return "24M";
        }
        String trimmed = value.trim();
        if (trimmed.matches("[1-9][0-9]{0,2}[kKmM]")) {
            return trimmed;
        }
        return "24M";
    }
    private Process start(List<String> command) throws IOException {
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        return builder.start();
    }

    private void writeFrames(RawFrame firstFrame) {
        long interval = 1_000_000_000L / fps;
        RawFrame frame = firstFrame;
        try (OutputStream input = process.getOutputStream()) {
            while (!closed.get()) {
                long startedAt = System.nanoTime();
                input.write(frame.data, frame.offset, frame.length);
                frame = captureFramePipeSource();
                long remaining = interval - (System.nanoTime() - startedAt);
                if (remaining > 0) Thread.sleep(remaining / 1_000_000L, (int) (remaining % 1_000_000L));
            }
        } catch (Exception ignored) {
        }
    }

    private RawFrame captureFramePipeSource() throws Exception {
        RawFrame virtualFrame = display > 0 ? readVirtualDisplayFrame() : null;
        if (virtualFrame != null) {
            return virtualFrame;
        }

        Rectangle bounds = screenBounds(display, displayId);
        BufferedImage source = new Robot().createScreenCapture(bounds);
        BufferedImage bgr = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D graphics = bgr.createGraphics();
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        byte[] data = ((DataBufferByte) bgr.getRaster().getDataBuffer()).getData();
        return new RawFrame(bgr.getWidth(), bgr.getHeight(), "bgr24", data, 0, data.length);
    }

    private static RawFrame readVirtualDisplayFrame() throws IOException {
        if (!Files.isRegularFile(VIRTUAL_DISPLAY_FRAME_PATH)) {
            return null;
        }

        byte[] bytes = Files.readAllBytes(VIRTUAL_DISPLAY_FRAME_PATH);
        if (bytes.length < 54 || bytes[0] != 'B' || bytes[1] != 'M') {
            return null;
        }

        int dataOffset = readInt(bytes, 10);
        int width = readInt(bytes, 18);
        int rawHeight = readInt(bytes, 22);
        int height = Math.abs(rawHeight);
        int planes = readShort(bytes, 26);
        int bitCount = readShort(bytes, 28);
        int compression = readInt(bytes, 30);
        int rowBytes = width * 4;
        int imageBytes = rowBytes * height;

        if (width <= 0 || height <= 0 || planes != 1 || bitCount != 32 || compression != 0 || dataOffset < 54 || bytes.length < dataOffset + imageBytes) {
            return null;
        }

        if (rawHeight < 0) {
            return new RawFrame(width, height, "bgra", bytes, dataOffset, imageBytes);
        }

        byte[] topDown = new byte[imageBytes];
        for (int row = 0; row < height; row++) {
            int sourceOffset = dataOffset + (height - 1 - row) * rowBytes;
            System.arraycopy(bytes, sourceOffset, topDown, row * rowBytes, rowBytes);
        }
        return new RawFrame(width, height, "bgra", topDown, 0, topDown.length);
    }

    private static Rectangle screenBounds(int display, String displayId) {
        GraphicsDevice[] devices = GraphicsEnvironment.getLocalGraphicsEnvironment().getScreenDevices();
        if (devices.length == 0) {
            throw new IllegalStateException("No display is available");
        }
        if (displayId != null && !displayId.isBlank()) {
            for (GraphicsDevice device : devices) {
                if (displayId.equalsIgnoreCase(device.getIDstring())) {
                    return device.getDefaultConfiguration().getBounds();
                }
            }
            throw new IllegalArgumentException("Display is no longer available: " + displayId);
        }
        int index = Math.min(Math.max(display, 0), devices.length - 1);
        return devices[index].getDefaultConfiguration().getBounds();
    }

    private static int readShort(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8);
    }

    private static int readInt(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF)
                | ((bytes[offset + 1] & 0xFF) << 8)
                | ((bytes[offset + 2] & 0xFF) << 16)
                | (bytes[offset + 3] << 24);
    }

    public void close() {
        if (closed.compareAndSet(false, true) && process != null) process.destroyForcibly();
    }

    private static final class RawFrame {
        private final int width;
        private final int height;
        private final String pixelFormat;
        private final byte[] data;
        private final int offset;
        private final int length;

        private RawFrame(int width, int height, String pixelFormat, byte[] data, int offset, int length) {
            this.width = width;
            this.height = height;
            this.pixelFormat = pixelFormat;
            this.data = data;
            this.offset = offset;
            this.length = length;
        }
    }
}

