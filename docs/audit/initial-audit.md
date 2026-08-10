# Initial Audit Report

## Project Overview
SCFT (Screen Copy & File Transfer) is an application designed to connect a PC and an Android device, primarily over a USB cable using ADB port tunneling. It provides Second Display (PC Screen on Android), Screen Copy (Android Screen on PC), and File Transfer functionalities.

## Architecture Overview
- **PC UI**: Electron application serving HTML/JS/CSS.
- **PC Backend**: A standalone Java HTTP server (`localhost:7878`) handling file I/O and screen streaming logic.
- **Android App**: A native Android app handling MediaCodec H.264 decoding for the Second Display feature.
- **Mobile UI**: A React Native (Expo) app located in `mobile_UI/` (currently containing mocked data, possibly the new frontend for the Android app).
- **Communication**: HTTP API tunneled via `adb reverse tcp:7878 tcp:7878`.
- **PC Screen Capture**: Utilizes Windows Virtual Display Driver (VDD) and FFmpeg to encode H.264.

## Current Features
### Working Features
- **Second Display (PC Screen)**: Successfully implemented using H.264 streaming. Tuned for low latency with multiple presets (2K, Cân bằng, Nhanh, Siêu nhanh).
- **File Transfer**: Backend supports upload, download, list, delete with a 2GB limit. Basic UI exists.

### Known Bugs & Issues
- **Latency Target**: The strict 5-10ms end-to-end latency target for PC Screen is not proven. While transport RTT is low, encoding/decoding adds overhead.
- **Hardware Encoding**: NVENC is not universally usable (fails with bundled FFmpeg on some NVIDIA drivers). Defaulting to `h264_mf`.

### Potential Bugs
- **Network Failure Handling**: What happens if the USB cable is unplugged mid-transfer? The state might not be gracefully handled in the UI.
- **Concurrency**: The Java backend file upload might need strict checks for concurrent uploads of the same file.

### Technical Debt
- **Two Mobile Codebases**: There is a native `Android/` project and an Expo `mobile_UI/` project. The relationship and integration between these two need to be clarified and potentially unified.
- **Screen Copy (Android to PC)**: Currently uses a very slow `adb exec-out screencap -p` method. This should be rewritten to use an Android-side H.264 encoder.

### Security Concerns
- Backend listens on `localhost:7878`, which is secure if only accessed locally or via ADB tunnel. However, if fallback to LAN is used, the lack of authentication or encryption could expose file transfers to the local network.

### Performance Concerns
- VDD + MediaFoundation encoding can cause buffering and stuttering.

### Missing Features
- Proper Transfer History with search/filter (currently mocked).
- Data/Clipboard transfer.
- Pause/Resume for file transfer.

## Recommended Short-term Tasks
1. Clarify the relationship between `Android/` and `mobile_UI/`.
2. Add graceful error handling for USB disconnects in both File Transfer and PC Screen features.
3. Add explicit latency measurement for PC Screen.

## Recommended Long-term Tasks
1. Rewrite Screen Copy (Android to PC) to use hardware H.264 encoding instead of ADB PNG frames.
2. Implement real Transfer History.
3. Add authentication for LAN connections.
