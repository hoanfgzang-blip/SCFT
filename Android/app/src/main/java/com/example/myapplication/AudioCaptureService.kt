package com.example.myapplication

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "SCFT-AUDIO-SERVICE"
private const val PORT = 10790
private const val SAMPLE_RATE = 48000
private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_STEREO
private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
private const val CHANNEL_NOTIFICATION_ID = "scft_audio_channel"

class AudioCaptureService : Service() {
    private var serverSocket: ServerSocket? = null
    private val isRunning = AtomicBoolean(false)
    private var workerThread: Thread? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(1002, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning.getAndSet(true)) {
            workerThread = Thread { runServer() }.apply { start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning.set(false)
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing server socket: ${e.message}")
        }
        serverSocket = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelName = "SCFT Audio Service"
            val channel = NotificationChannel(
                CHANNEL_NOTIFICATION_ID,
                channelName,
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_NOTIFICATION_ID)
            .setContentTitle("SCFT Audio Share")
            .setContentText("Streaming audio to PC via USB")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun runServer() {
        try {
            serverSocket = ServerSocket(PORT)
            Log.i(TAG, "Audio Server listening on port $PORT")
            while (isRunning.get()) {
                try {
                    val clientSocket = serverSocket?.accept() ?: break
                    Log.i(TAG, "Client connected for audio streaming: ${clientSocket.remoteSocketAddress}")
                    handleClient(clientSocket)
                } catch (e: Exception) {
                    if (isRunning.get()) {
                        Log.w(TAG, "Socket accept error: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start Audio Server socket: ${e.message}")
        }
    }

    private fun handleClient(socket: Socket) {
        var audioRecord: AudioRecord? = null
        try {
            val minBufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            val bufferSize = Math.max(minBufSize, 8192)

            audioRecord = createAudioRecord(bufferSize)
            if (audioRecord == null || audioRecord.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                socket.close()
                return
            }

            audioRecord.startRecording()
            Log.i(TAG, "AudioRecord started recording")

            val outputStream: OutputStream = socket.getOutputStream()
            val buffer = ByteArray(2048)

            while (isRunning.get() && !socket.isClosed) {
                val read = audioRecord.read(buffer, 0, buffer.size)
                if (read > 0) {
                    outputStream.write(buffer, 0, read)
                    outputStream.flush()
                } else if (read < 0) {
                    Log.w(TAG, "AudioRecord read error code: $read")
                    break
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Audio streaming client error: ${e.message}")
        } finally {
            try {
                audioRecord?.stop()
                audioRecord?.release()
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing AudioRecord: ${e.message}")
            }
            try {
                socket.close()
            } catch (e: Exception) {}
            Log.i(TAG, "Audio streaming client disconnected")
        }
    }

    private fun createAudioRecord(bufferSize: Int): AudioRecord? {
        val sources = arrayOf(
            MediaRecorder.AudioSource.REMOTE_SUBMIX,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC
        )

        for (source in sources) {
            try {
                val rec = AudioRecord(
                    source,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize
                )
                if (rec.state == AudioRecord.STATE_INITIALIZED) {
                    Log.i(TAG, "AudioRecord initialized using source: $source")
                    return rec
                } else {
                    rec.release()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed source $source: ${e.message}")
            }
        }
        return null
    }
}
