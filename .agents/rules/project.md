# SCFT Project Rules

## Core Principle
- **No unnecessary rewrites**: Maintain the existing architecture as long as it is working, stable, and extensible.
- **Incremental Improvement**: Only propose large changes if the current architecture causes critical bugs, performance issues, security issues, scalability issues, or maintainability issues.

## Technology Stack
- **PC**: Electron (UI), Java HTTP Server (Backend).
- **Android**: Native Android (MediaCodec, SurfaceView for Screen), React Native (Expo) for UI (`mobile_UI/`).
- **Communication**: ADB USB Tunnel (Primary), LAN (Secondary).
