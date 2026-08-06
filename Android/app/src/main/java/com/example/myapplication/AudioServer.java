package com.example.myapplication;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * SCFT Standalone Audio Capture Server (scrcpy-inspired architecture)
 * Captures Android internal system audio (REMOTE_SUBMIX) under Shell UID (2000) over TCP port 10790.
 */
public class AudioServer {
    public static void main(String[] args) {
        int port = 10790;
        int sampleRate = 48000;
        int channelConfig = AudioFormat.CHANNEL_IN_STEREO;
        int audioFormat = AudioFormat.ENCODING_PCM_16BIT;

        System.out.println("[SCFT AudioServer] Starting audio capture on port " + port);

        try (ServerSocket serverSocket = new ServerSocket(port)) {
            while (true) {
                try {
                    Socket socket = serverSocket.accept();
                    System.out.println("[SCFT AudioServer] Client connected: " + socket.getRemoteSocketAddress());

                    int minBuf = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat);
                    int bufferSize = Math.max(minBuf, 8192);

                    AudioRecord audioRecord = null;

                    // 1. Initialize AudioRecord with REMOTE_SUBMIX for system media capture
                    try {
                        audioRecord = new AudioRecord.Builder()
                            .setAudioSource(MediaRecorder.AudioSource.REMOTE_SUBMIX)
                            .setAudioFormat(new AudioFormat.Builder()
                                .setEncoding(audioFormat)
                                .setSampleRate(sampleRate)
                                .setChannelMask(channelConfig)
                                .build())
                            .setBufferSizeInBytes(bufferSize)
                            .build();
                    } catch (Throwable t) {
                        System.err.println("[SCFT AudioServer] AudioRecord.Builder failed, trying legacy constructor: " + t.getMessage());
                        try {
                            audioRecord = new AudioRecord(
                                MediaRecorder.AudioSource.REMOTE_SUBMIX,
                                sampleRate,
                                channelConfig,
                                audioFormat,
                                bufferSize
                            );
                        } catch (Throwable t2) {
                            System.err.println("[SCFT AudioServer] AudioRecord legacy init failed: " + t2.getMessage());
                        }
                    }

                    if (audioRecord != null && audioRecord.getState() == AudioRecord.STATE_INITIALIZED) {
                        audioRecord.startRecording();
                        OutputStream out = socket.getOutputStream();
                        byte[] buffer = new byte[2048];

                        while (!socket.isClosed()) {
                            int read = audioRecord.read(buffer, 0, buffer.length);
                            if (read > 0) {
                                out.write(buffer, 0, read);
                                out.flush();
                            } else if (read < 0) {
                                break;
                            }
                        }

                        try {
                            audioRecord.stop();
                            audioRecord.release();
                        } catch (Exception ignored) {}
                    } else {
                        System.err.println("[SCFT AudioServer] AudioRecord STATE_UNINITIALIZED");
                    }

                    try {
                        socket.close();
                    } catch (Exception ignored) {}
                } catch (Exception e) {
                    System.err.println("[SCFT AudioServer] Socket error: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
