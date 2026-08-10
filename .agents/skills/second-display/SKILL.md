---
name: second-display
description: Second Display (PC Screen on Android) knowledge.
---

# Second Display (PC Screen)

## Architecture
This is a Virtual Display (Extend Display) feature, not simple Screen Mirroring.

```text
Windows VDD -> Windows Secondary Display
            -> SCFT backend H.264 encode (FFmpeg)
            -> adb reverse TCP 7878 via USB
            -> SCFT Android app
            -> MediaCodec H.264 decode -> SurfaceView
```

## Status
- Tuned for low latency with different presets: `2K` (2560x1440/24M), `Cân bằng` (1600x900/6M), `Nhanh` (1280x720/4M), `Siêu nhanh` (960x540/2M).
- Fast presets use `renderLatestOnly` to prioritize low delay over visual continuity.

## Important Note
- Uses Virtual Display Driver installed via `winget` (`VirtualDrivers.Virtual-Display-Driver`).
- If Windows fails to create a virtual display, users can run `scripts\repair-vdd.ps1`.
- Do not confuse this with Screen Mirroring.
