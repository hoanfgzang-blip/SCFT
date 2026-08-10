# Architecture Guidelines

## Overall Architecture
- **Desktop UI**: Electron (`web_app/`). Communicates with the Java backend.
- **Desktop Backend**: Java HTTP Server (`backend/`). Exposes APIs for file transfer and screen streaming.
- **Android Native**: `Android/`. Handles high-performance tasks like H.264 decoding using MediaCodec.
- **Mobile UI**: `mobile_UI/`. Expo/React Native app.
- **Networking**: Primarily via USB ADB tunnel (`adb reverse tcp:7878 tcp:7878`).

## Changes
- Do not change the architecture, framework, or database arbitrarily.
- Ensure that any architectural changes are reflected in the corresponding documentation. Code and documentation must be in sync.
