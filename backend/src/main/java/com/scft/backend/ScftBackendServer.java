package com.scft.backend;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.AWTException;
import java.awt.Graphics2D;
import java.awt.GraphicsDevice;
import java.awt.GraphicsEnvironment;
import java.awt.Image;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.Robot;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

public final class ScftBackendServer {
    private static final int DEFAULT_PORT = 7878;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long MAX_UPLOAD_BYTES = 2L * 1024L * 1024L * 1024L;

    private final int port;
    private final Path uploadDir;
    private final String deviceId;
    private final String deviceName;

    private ScftBackendServer(int port, Path storageRoot) throws IOException {
        this.port = port;
        this.uploadDir = storageRoot.resolve("uploads").toAbsolutePath().normalize();
        this.deviceId = getOrCreateDeviceId(storageRoot);
        this.deviceName = System.getProperty("user.name", "SCFT Desktop");
        Files.createDirectories(uploadDir);
    }

    public static void main(String[] args) throws IOException {
        int port = DEFAULT_PORT;
        Path storageRoot = Paths.get("backend", "storage");

        for (int i = 0; i < args.length; i++) {
            if ("--port".equals(args[i]) && i + 1 < args.length) {
                port = Integer.parseInt(args[++i]);
            } else if ("--storage".equals(args[i]) && i + 1 < args.length) {
                storageRoot = Paths.get(args[++i]);
            }
        }

        ScftBackendServer app = new ScftBackendServer(port, storageRoot);
        app.start();
    }

    private void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/health", withCors(this::handleHealth));
        server.createContext("/api/device", withCors(this::handleDevice));
        server.createContext("/api/files", withCors(this::handleFiles));
        server.createContext("/api/screen", withCors(this::handleScreen));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println("SCFT backend running at http://localhost:" + port);
        System.out.println("Uploads stored in " + uploadDir);
    }

    private HttpHandler withCors(ExchangeHandler handler) {
        return exchange -> {
            Headers headers = exchange.getResponseHeaders();
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
            headers.set("Access-Control-Allow-Headers", "Content-Type,X-Device-Id,X-Original-Filename");

            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            try {
                handler.handle(exchange);
            } catch (IllegalArgumentException error) {
                sendJson(exchange, 400, "{\"error\":\"" + json(error.getMessage()) + "\"}");
            } catch (NotFoundException error) {
                sendJson(exchange, 404, "{\"error\":\"" + json(error.getMessage()) + "\"}");
            } catch (PayloadTooLargeException error) {
                sendJson(exchange, 413, "{\"error\":\"" + json(error.getMessage()) + "\"}");
            } catch (Exception error) {
                error.printStackTrace();
                sendJson(exchange, 500, "{\"error\":\"Internal server error\"}");
            }
        };
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (!requireMethod(exchange, "GET")) {
            return;
        }
        sendJson(exchange, 200, "{\"status\":\"ok\",\"service\":\"scft-backend\"}");
    }

    private void handleDevice(HttpExchange exchange) throws IOException {
        if (!requireMethod(exchange, "GET")) {
            return;
        }
        String body = "{"
                + "\"id\":\"" + json(deviceId) + "\","
                + "\"name\":\"" + json(deviceName) + "\","
                + "\"ip\":\"" + json(findLocalIp()) + "\","
                + "\"port\":" + port
                + "}";
        sendJson(exchange, 200, body);
    }

    private void handleFiles(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        if ("/api/files".equals(path) || "/api/files/".equals(path)) {
            if ("GET".equalsIgnoreCase(method)) {
                handleListFiles(exchange);
                return;
            }
            if ("POST".equalsIgnoreCase(method)) {
                handleUpload(exchange);
                return;
            }
        }

        if (path.startsWith("/api/files/")) {
            String suffix = path.substring("/api/files/".length());
            if (suffix.endsWith("/download") && "GET".equalsIgnoreCase(method)) {
                String id = suffix.substring(0, suffix.length() - "/download".length());
                handleDownload(exchange, sanitizeId(id));
                return;
            }
            if ("DELETE".equalsIgnoreCase(method)) {
                handleDelete(exchange, sanitizeId(suffix));
                return;
            }
        }

        sendJson(exchange, 404, "{\"error\":\"Route not found\"}");
    }

    private void handleScreen(HttpExchange exchange) throws Exception {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        if (!"GET".equalsIgnoreCase(method)) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        if ("/api/screen".equals(path) || "/api/screen/".equals(path) || "/api/screen/status".equals(path)) {
            handleScreenStatus(exchange);
            return;
        }

        if ("/api/screen/frame".equals(path)) {
            handleScreenFrame(exchange);
            return;
        }

        if ("/api/screen/view".equals(path)) {
            handleScreenView(exchange);
            return;
        }

        sendJson(exchange, 404, "{\"error\":\"Route not found\"}");
    }

    private void handleScreenStatus(HttpExchange exchange) throws IOException {
        boolean available = !GraphicsEnvironment.isHeadless();
        int displays = 0;
        String error = "";

        if (available) {
            try {
                displays = GraphicsEnvironment.getLocalGraphicsEnvironment().getScreenDevices().length;
            } catch (Exception exception) {
                available = false;
                error = exception.getMessage();
            }
        } else {
            error = "Screen capture is unavailable in headless mode";
        }

        String body = "{"
                + "\"available\":" + available + ","
                + "\"displays\":" + displays + ","
                + "\"viewUrl\":\"/api/screen/view\","
                + "\"frameUrl\":\"/api/screen/frame\","
                + "\"error\":\"" + json(error) + "\""
                + "}";
        sendJson(exchange, 200, body);
    }

    private void handleScreenFrame(HttpExchange exchange) throws IOException, AWTException {
        if (GraphicsEnvironment.isHeadless()) {
            sendJson(exchange, 503, "{\"error\":\"Screen capture is unavailable in headless mode\"}");
            return;
        }

        Map<String, String> params = queryParams(exchange.getRequestURI());
        double scale = clampDouble(params.get("scale"), 0.25, 1.0, 0.65);
        float quality = (float) clampDouble(params.get("quality"), 0.25, 0.95, 0.7);
        byte[] image = captureScreenJpeg(scale, quality);

        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "image/jpeg");
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        headers.set("Pragma", "no-cache");
        headers.set("Content-Length", Integer.toString(image.length));
        exchange.sendResponseHeaders(200, image.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(image);
        }
    }

    private void handleScreenView(HttpExchange exchange) throws IOException {
        String body = "<!doctype html>"
                + "<html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">"
                + "<title>SCFT PC Screen</title>"
                + "<style>html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Arial,sans-serif;overflow:hidden}#screen{width:100vw;height:100vh;object-fit:contain;background:#000}.bar{position:fixed;left:12px;right:12px;bottom:12px;display:flex;gap:8px;align-items:center;justify-content:center}.bar button,.bar select{border:1px solid #fff;background:rgba(0,0,0,.72);color:#fff;border-radius:8px;padding:10px 12px;font-weight:700}</style>"
                + "</head><body>"
                + "<img id=\"screen\" alt=\"PC screen\">"
                + "<div class=\"bar\"><button id=\"full\">Fullscreen</button><select id=\"rate\"><option value=\"1000\">1 FPS</option><option value=\"500\" selected>2 FPS</option><option value=\"250\">4 FPS</option><option value=\"150\">6 FPS</option></select></div>"
                + "<script>const img=document.getElementById('screen');const rate=document.getElementById('rate');let timer=null;function tick(){img.src='/api/screen/frame?scale=0.7&quality=0.68&t='+Date.now()}function run(){if(timer)clearInterval(timer);tick();timer=setInterval(tick,Number(rate.value))}rate.onchange=run;document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();run();</script>"
                + "</body></html>";
        sendHtml(exchange, 200, body);
    }
    private void handleListFiles(HttpExchange exchange) throws IOException {
        List<FileRecord> records = new ArrayList<>();
        if (Files.exists(uploadDir)) {
            try (Stream<Path> stream = Files.list(uploadDir)) {
                stream.filter(path -> path.getFileName().toString().endsWith(".meta.json"))
                        .forEach(path -> {
                            try {
                                records.add(readRecord(path));
                            } catch (Exception ignored) {
                            }
                        });
            }
        }

        records.sort(Comparator.comparing((FileRecord record) -> record.uploadedAt).reversed());

        StringBuilder body = new StringBuilder();
        body.append("{\"files\":[");
        for (int i = 0; i < records.size(); i++) {
            if (i > 0) {
                body.append(',');
            }
            body.append(records.get(i).toJson());
        }
        body.append("]}");
        sendJson(exchange, 200, body.toString());
    }

    private void handleUpload(HttpExchange exchange) throws IOException {
        validateContentLength(exchange);

        String filename = getHeader(exchange, "X-Original-Filename");
        if (filename == null || filename.isBlank()) {
            filename = queryParams(exchange.getRequestURI()).get("filename");
        }
        filename = sanitizeFilename(filename);

        String id = UUID.randomUUID().toString();
        String storedName = id + "-" + filename;
        Path target = uploadDir.resolve(storedName).normalize();
        if (!target.startsWith(uploadDir)) {
            throw new IllegalArgumentException("Invalid filename");
        }

        Path temp = uploadDir.resolve(id + ".uploading").normalize();
        long size;
        try (InputStream input = exchange.getRequestBody(); OutputStream output = Files.newOutputStream(temp)) {
            size = copyLimited(input, output, MAX_UPLOAD_BYTES);
        }
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);

        FileRecord record = new FileRecord(
                id,
                filename,
                storedName,
                size,
                getHeader(exchange, "X-Device-Id"),
                Instant.now().toString()
        );
        writeRecord(record);
        sendJson(exchange, 201, record.toJson());
    }

    private void handleDownload(HttpExchange exchange, String id) throws IOException {
        FileRecord record = readRecord(metaPath(id));
        Path file = uploadDir.resolve(record.storedName).normalize();
        if (!file.startsWith(uploadDir) || !Files.exists(file)) {
            throw new NotFoundException("File not found");
        }

        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/octet-stream");
        headers.set("Content-Disposition", "attachment; filename=\"" + headerValue(record.originalName) + "\"");
        headers.set("Content-Length", Long.toString(Files.size(file)));
        exchange.sendResponseHeaders(200, Files.size(file));

        try (OutputStream output = exchange.getResponseBody(); InputStream input = Files.newInputStream(file)) {
            copy(input, output);
        }
    }

    private void handleDelete(HttpExchange exchange, String id) throws IOException {
        FileRecord record = readRecord(metaPath(id));
        Files.deleteIfExists(uploadDir.resolve(record.storedName).normalize());
        Files.deleteIfExists(metaPath(id));
        sendJson(exchange, 200, "{\"deleted\":true,\"id\":\"" + json(id) + "\"}");
    }

    private static boolean requireMethod(HttpExchange exchange, String expected) throws IOException {
        if (!expected.equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return false;
        }
        return true;
    }

    private static long copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            total += read;
        }
        return total;
    }

    private static long copyLimited(InputStream input, OutputStream output, long maxBytes) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new PayloadTooLargeException("Upload exceeds 2GB limit");
            }
            output.write(buffer, 0, read);
        }
        return total;
    }


    private static byte[] captureScreenJpeg(double scale, float quality) throws IOException, AWTException {
        Rectangle bounds = screenBounds();
        Robot robot = new Robot();
        BufferedImage captured = robot.createScreenCapture(bounds);
        BufferedImage image = toRgb(scaleImage(captured, scale));

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(output);
            ImageWriteParam params = writer.getDefaultWriteParam();
            if (params.canWriteCompressed()) {
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(quality);
            }
            writer.write(null, new IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static Rectangle screenBounds() {
        Rectangle bounds = new Rectangle();
        GraphicsDevice[] devices = GraphicsEnvironment.getLocalGraphicsEnvironment().getScreenDevices();
        for (GraphicsDevice device : devices) {
            bounds = bounds.union(device.getDefaultConfiguration().getBounds());
        }
        return bounds;
    }

    private static BufferedImage scaleImage(BufferedImage source, double scale) {
        if (scale >= 0.99) {
            return source;
        }

        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        Image scaled = source.getScaledInstance(width, height, Image.SCALE_SMOOTH);
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(scaled, 0, 0, null);
        graphics.dispose();
        return target;
    }

    private static BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }

        BufferedImage target = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        return target;
    }

    private static double clampDouble(String raw, double min, double max, double fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            double value = Double.parseDouble(raw);
            return Math.max(min, Math.min(max, value));
        } catch (NumberFormatException error) {
            return fallback;
        }
    }
    private static void validateContentLength(HttpExchange exchange) {
        String value = getHeader(exchange, "Content-Length");
        if (value == null || value.isBlank()) {
            return;
        }
        try {
            long length = Long.parseLong(value);
            if (length > MAX_UPLOAD_BYTES) {
                throw new PayloadTooLargeException("Upload exceeds 2GB limit");
            }
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("Invalid Content-Length");
        }
    }

    private static Map<String, String> queryParams(URI uri) {
        Map<String, String> params = new HashMap<>();
        String query = uri.getRawQuery();
        if (query == null || query.isBlank()) {
            return params;
        }

        for (String pair : query.split("&")) {
            int index = pair.indexOf('=');
            if (index <= 0) {
                continue;
            }
            String key = decode(pair.substring(0, index));
            String value = decode(pair.substring(index + 1));
            params.put(key, value);
        }
        return params;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new IllegalArgumentException("Missing filename");
        }
        if (filename.contains("/") || filename.contains("\\") || filename.contains("..")) {
            throw new IllegalArgumentException("Invalid filename");
        }
        String cleaned = filename.replaceAll("[\\p{Cntrl}<>:\"|?*]+", "_").trim();
        if (cleaned.isBlank() || ".".equals(cleaned) || "..".equals(cleaned)) {
            throw new IllegalArgumentException("Invalid filename");
        }
        return cleaned;
    }

    private static String sanitizeId(String id) {
        if (id == null || !id.matches("[a-fA-F0-9-]{36}")) {
            throw new IllegalArgumentException("Invalid file id");
        }
        return id;
    }

    private Path metaPath(String id) {
        return uploadDir.resolve(id + ".meta.json").normalize();
    }

    private void writeRecord(FileRecord record) throws IOException {
        Files.writeString(metaPath(record.id), record.toJson(), StandardCharsets.UTF_8);
    }

    private FileRecord readRecord(Path path) throws IOException {
        if (!path.startsWith(uploadDir) || !Files.exists(path)) {
            throw new NotFoundException("File not found");
        }
        return FileRecord.fromJson(Files.readString(path, StandardCharsets.UTF_8));
    }

    private static String getHeader(HttpExchange exchange, String name) {
        return exchange.getRequestHeaders().getFirst(name);
    }

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }


    private static void sendHtml(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
    private static String getOrCreateDeviceId(Path storageRoot) throws IOException {
        Files.createDirectories(storageRoot);
        Path deviceFile = storageRoot.resolve("device-id.txt");
        if (Files.exists(deviceFile)) {
            String existing = Files.readString(deviceFile, StandardCharsets.UTF_8).trim();
            if (!existing.isBlank()) {
                return existing;
            }
        }

        String id = UUID.randomUUID().toString();
        Files.writeString(deviceFile, id, StandardCharsets.UTF_8);
        return id;
    }

    private static String findLocalIp() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                if (!networkInterface.isUp() || networkInterface.isLoopback() || networkInterface.isVirtual()) {
                    continue;
                }

                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "127.0.0.1";
    }

    private static String json(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\b", "\\b")
                .replace("\f", "\\f")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static String headerValue(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws Exception;
    }

    private static final class NotFoundException extends RuntimeException {
        private NotFoundException(String message) {
            super(message);
        }
    }

    private static final class PayloadTooLargeException extends RuntimeException {
        private PayloadTooLargeException(String message) {
            super(message);
        }
    }

    private static final class FileRecord {
        private final String id;
        private final String originalName;
        private final String storedName;
        private final long size;
        private final String senderDeviceId;
        private final String uploadedAt;

        private FileRecord(String id, String originalName, String storedName, long size, String senderDeviceId, String uploadedAt) {
            this.id = id;
            this.originalName = originalName;
            this.storedName = storedName;
            this.size = size;
            this.senderDeviceId = senderDeviceId == null ? "" : senderDeviceId;
            this.uploadedAt = uploadedAt;
        }

        private String toJson() {
            return "{"
                    + "\"id\":\"" + json(id) + "\","
                    + "\"originalName\":\"" + json(originalName) + "\","
                    + "\"storedName\":\"" + json(storedName) + "\","
                    + "\"size\":" + size + ","
                    + "\"senderDeviceId\":\"" + json(senderDeviceId) + "\","
                    + "\"uploadedAt\":\"" + json(uploadedAt) + "\","
                    + "\"downloadUrl\":\"/api/files/" + json(id) + "/download\""
                    + "}";
        }

        private static FileRecord fromJson(String raw) {
            return new FileRecord(
                    extractString(raw, "id"),
                    extractString(raw, "originalName"),
                    extractString(raw, "storedName"),
                    extractLong(raw, "size"),
                    extractString(raw, "senderDeviceId"),
                    extractString(raw, "uploadedAt")
            );
        }

        private static String extractString(String raw, String key) {
            String marker = "\"" + key + "\":\"";
            int start = raw.indexOf(marker);
            if (start < 0) {
                return "";
            }
            start += marker.length();
            StringBuilder value = new StringBuilder();
            boolean escaping = false;
            for (int i = start; i < raw.length(); i++) {
                char current = raw.charAt(i);
                if (escaping) {
                    value.append(current);
                    escaping = false;
                    continue;
                }
                if (current == '\\') {
                    escaping = true;
                    continue;
                }
                if (current == '"') {
                    break;
                }
                value.append(current);
            }
            return value.toString();
        }

        private static long extractLong(String raw, String key) {
            String marker = "\"" + key + "\":";
            int start = raw.indexOf(marker);
            if (start < 0) {
                return 0;
            }
            start += marker.length();
            int end = start;
            while (end < raw.length() && Character.isDigit(raw.charAt(end))) {
                end++;
            }
            if (end == start) {
                return 0;
            }
            return Long.parseLong(raw.substring(start, end));
        }
    }
}