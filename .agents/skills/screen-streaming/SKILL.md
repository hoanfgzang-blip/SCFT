---
name: screen-streaming
description: Screen Copy (Android to PC) knowledge.
---

# Screen Streaming (Screen Copy)

## Architecture
Currently an early prototype relying on ADB:
```text
Desktop Electron -> adb exec-out screencap -p -> Android screen PNG frames
```

## Performance
When modifying this:
- Monitor FPS, Latency, Bitrate, Dropped frames, CPU, GPU, RAM, Network usage.
- Do not optimize based on feelings. Measure -> Identify Bottleneck -> Optimize -> Measure again.
- Consider encoding the stream to H.264 on Android (via MediaCodec/MediaProjection) and decoding on PC (via WebCodecs or a native module) for better performance than PNG frames.
