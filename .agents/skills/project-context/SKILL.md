---
name: project-context
description: Core knowledge and architecture of the SCFT project.
---

# Project Context

## Project Purpose
SCFT (Screen Copy & File Transfer) is an application to stream the PC screen to an Android device (acting as a second display), stream Android screen to PC, and transfer files between them, primarily via USB cable (ADB tunnel).

## Technology Stack
- **PC UI**: Electron (JS, HTML, CSS).
- **PC Backend**: Java HTTP Server (built-in, no framework).
- **Android**: Native Android (Kotlin/Java) for high performance tasks (MediaCodec, SurfaceView).
- **Mobile UI**: Expo/React Native (`mobile_UI/`).
- **Networking**: ADB USB tunnel (`adb reverse`), HTTP/TCP.
- **Windows Driver**: Virtual Display Driver (VDD) for second display.

## Architecture
- **Desktop Electron**: `main.js` manages processes (starts Java backend, ADB reverse, bundled FFmpeg, VDD helper).
- **Java Backend**: Listens on `localhost:7878`. Handles file transfer API and screen stream API.
- **Android App**: Connects to `localhost:7878` (tunneled via ADB reverse) to consume APIs and stream.

## Important Directories
- `web_app/`: Electron frontend HTML/JS/CSS.
- `backend/`: Java backend source code.
- `Android/`: Native Android app source code.
- `mobile_UI/`: React Native Expo frontend.
- `windows_driver/`: Old experimental VDD (not currently packaged for users).
- `scripts/`: Utilities like `repair-vdd.ps1`.

## Features
- **Screen streaming (Screen Copy)**: `web_app/SC.html`. Desktop uses ADB to capture frames. (PARTIALLY IMPLEMENTED).
- **Second display (PC Screen)**: `web_app/PCScreen.html`. Windows VDD -> FFmpeg H.264 encode -> Java Backend -> ADB reverse -> Android Native App (MediaCodec decoder).
- **File transfer**: `web_app/FT.html`. HTTP API over ADB.
- **Data transfer**: UNKNOWN.
- **Transfer history**: Mobile UI has mock data. PC UI implementation UNKNOWN.
- **Database**: No SQL DB, uses `.meta.json` sidecar files in `backend/storage/uploads/`.

## Current Development Status
Project is currently WORKING for PC Screen Share (tuned for low latency) and File Transfer via USB.
See `docs/project-status.md` and `docs/audit/initial-audit.md` for more details.
