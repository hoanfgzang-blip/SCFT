# Project Status

This document tracks the current status of features within SCFT.

| Feature | Status | Known Issues | Missing Parts | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **PC Screen (Second Display)** | WORKING | Requires VDD installation. End-to-end latency of 5-10ms is not strictly proven yet. | Audio streaming? (Need to check if AudioCaptureService is active) | High |
| **File Transfer (Backend API)** | WORKING | 2GB file limit | Resume/Pause capabilities | High |
| **File Transfer (PC UI)** | WORKING | UI only has basic USB mode | Advanced history, drag and drop | Medium |
| **File Transfer (Android UI)** | PARTIALLY WORKING | Mocked history data in React Native app | Real integration with History | Medium |
| **Screen Copy (Android to PC)**| INCOMPLETE | Uses slow PNG frame capture via ADB | Native MediaCodec encoding on Android | Low |
| **Data Transfer (Clipboard/Text)**| UNKNOWN | None discovered | The entire feature | Low |
| **Connection Management** | PARTIALLY WORKING| ADB reverse tunnel works | Auto-discovery over LAN is untested/flaky | Medium |

## Status Definitions
- `STABLE`: Fully implemented, tested, and robust.
- `WORKING`: Functions correctly in the happy path, but might have edge cases or lack polish.
- `PARTIALLY WORKING`: Core logic exists but is incomplete or buggy.
- `BUGGY`: Implemented but currently broken or unstable.
- `INCOMPLETE`: Prototype or stub exists, but not usable.
- `PLANNED`: On the roadmap but no code exists.
- `UNKNOWN`: Status is currently unverified.
