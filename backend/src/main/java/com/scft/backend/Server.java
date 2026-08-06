package com.scft.backend;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.ServerSocket;
import java.net.Socket;

public class Server {
    private static Process adbShellProcess;
    private static BufferedWriter shellWriter;

    public static void main(String[] args) {
        int port = 10789;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (Exception ignored) {}
        }

        initAdbShell();

        try (ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("SCFT Java Controller Server listening on port " + port);
            while (true) {
                try {
                    Socket socket = serverSocket.accept();
                    handleClient(socket);
                } catch (Exception e) {
                    System.err.println("Controller client disconnected or error: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            stopAdbShell();
        }
    }

    public static void startInThread(int port) {
        Thread thread = new Thread(() -> main(new String[]{String.valueOf(port)}));
        thread.setDaemon(true);
        thread.setName("SCFT-Controller-Server");
        thread.start();
    }

    private static String findAdbCommand() {
        String envPath = System.getenv("SCFT_ADB_PATH");
        if (envPath != null && !envPath.isBlank() && new File(envPath).exists()) {
            return envPath;
        }

        String userHome = System.getProperty("user.home", "");
        String localAppData = System.getenv("LOCALAPPDATA");

        String[] candidates = new String[]{
            localAppData != null ? localAppData + "\\Android\\Sdk\\platform-tools\\adb.exe" : "",
            userHome + "\\OneDrive\\Documents\\platform-tools\\adb.exe",
            userHome + "\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
            userHome + "\\Documents\\platform-tools\\adb.exe",
            "build-resources\\platform-tools\\adb.exe",
            "adb.exe",
            "adb"
        };

        for (String candidate : candidates) {
            if (!candidate.isBlank() && new File(candidate).exists()) {
                return candidate;
            }
        }

        return "adb";
    }

    private static synchronized void initAdbShell() {
        if (adbShellProcess != null && adbShellProcess.isAlive() && shellWriter != null) {
            return;
        }

        String adbCmd = findAdbCommand();

        try {
            ProcessBuilder pb = new ProcessBuilder(adbCmd, "shell");
            pb.redirectErrorStream(true);
            adbShellProcess = pb.start();
            shellWriter = new BufferedWriter(new OutputStreamWriter(adbShellProcess.getOutputStream()));
            System.out.println("Persistent ADB Shell initialized in Java Server using: " + adbCmd);
        } catch (Exception e) {
            System.err.println("Failed to initialize persistent ADB Shell: " + e.getMessage());
        }
    }

    private static synchronized void sendShellCommand(String cmd) {
        initAdbShell();
        if (shellWriter != null) {
            try {
                shellWriter.write(cmd + "\n");
                shellWriter.flush();
            } catch (Exception e) {
                System.err.println("Error writing to ADB Shell stdin: " + e.getMessage());
                stopAdbShell();
            }
        }
    }

    private static synchronized void stopAdbShell() {
        if (shellWriter != null) {
            try { shellWriter.close(); } catch (Exception ignored) {}
            shellWriter = null;
        }
        if (adbShellProcess != null) {
            try { adbShellProcess.destroy(); } catch (Exception ignored) {}
            adbShellProcess = null;
        }
    }

    private static void handleClient(Socket socket) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                processCommand(line.trim());
            }
        } catch (Exception ignored) {}
    }

    private static void processCommand(String cmd) {
        if (cmd.isEmpty()) return;
        String[] parts = cmd.split(" ");
        String type = parts[0];

        if ("DOWN".equals(type) && parts.length >= 3) {
            int x = Math.round(Float.parseFloat(parts[1]));
            int y = Math.round(Float.parseFloat(parts[2]));
            sendShellCommand("cmd input motionevent DOWN " + x + " " + y);
        } else if ("MOVE".equals(type) && parts.length >= 3) {
            int x = Math.round(Float.parseFloat(parts[1]));
            int y = Math.round(Float.parseFloat(parts[2]));
            sendShellCommand("cmd input motionevent MOVE " + x + " " + y);
        } else if ("UP".equals(type) && parts.length >= 3) {
            int x = Math.round(Float.parseFloat(parts[1]));
            int y = Math.round(Float.parseFloat(parts[2]));
            sendShellCommand("cmd input motionevent UP " + x + " " + y);
        } else if ("SCROLL".equals(type) && parts.length >= 4) {
            int x = Math.round(Float.parseFloat(parts[1]));
            int y = Math.round(Float.parseFloat(parts[2]));
            int amount = Math.round(Float.parseFloat(parts[3]));
            sendShellCommand("cmd input mouse scroll " + x + " " + y + " --axis VSCROLL," + amount);
        } else if ("TAP".equals(type) && parts.length >= 3) {
            int x = Math.round(Float.parseFloat(parts[1]));
            int y = Math.round(Float.parseFloat(parts[2]));
            sendShellCommand("cmd input tap " + x + " " + y);
        } else if ("KEY".equals(type) && parts.length >= 2) {
            sendShellCommand("cmd input keyevent " + parts[1]);
        } else if ("TEXT".equals(type) && parts.length >= 2) {
            String text = cmd.substring(5);
            sendShellCommand("cmd input text " + text);
        }
    }
}
