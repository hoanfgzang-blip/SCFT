# SCFT Work Session Summary

Last updated: 2026-07-30 01:18:17

## Done
- Backend file transfer has 2GB limit and upload/list/download/delete flow.
- Desktop Electron can start the Java backend, ADB reverse, bundled FFmpeg, and virtual display helper.
- PC Screen Share backend uses FFmpeg raw H.264 stream for Android instead of slow JPEG refresh.
- Backend H.264 stream supports query bitrate, for example `bitrate=24M`, while validating the value.
- Backend H.264 stream now supports optional `width` and `height` query params for lower-latency scaled presets.
- Virtual display target is wired to 2560x1440 at 60 Hz.
- Android PC Screen viewer uses MediaCodec raw H.264 and SurfaceView fullscreen landscape.
- Android PC Screen viewer has presets: `Nhanh` default at 1080x920/6M, `2K` quality at 2560x1440/24M, and `720p` light at 1280x720/8M.
- Android decoder uses adaptive frame dropping: render all small backlogs, drop old frames only when decoder output backlog is large.
- Android PC Screen viewer logs real render metrics with tag `SCFT-PC-SCREEN`.
- Android PC Screen Vietnamese text was fixed with Unicode escape strings; UI dump confirms correct text.

- No real Git merge conflict was found: `git diff --name-only --diff-filter=U` returned empty, and conflict-marker search only found comment separators.
- Backend latency route was fixed and verified: `/api/screen/latency` returns `{"serverTimeMs":...}`.

## Verification
- Backend compile passed: `backend/run.ps1 -CompileOnly`.
- Backend compile passed after latency route fix.
- Android build passed after conflict/dangling-code check.
- Android build passed: `:app:assembleDebug`.
- Backend status returned display 1 as 2560x1440.
- Raw 2K stream endpoint returned H.264 2560x1440 through ffprobe.
- Backend scaled stream verified through ffprobe:
  - `width=1920&height=1080` -> H.264 1920x1080.
  - `width=1280&height=720` -> H.264 1280x720.
  - `width=1080&height=920&bitrate=6M` -> H.264 1080x920.
- Real Android 2K adaptive metrics included: 60 FPS, 61 FPS, 61 FPS, 60 FPS, then one stall around 34 FPS, then 60 FPS again.
- Real Android low-resolution/preset test after user interruption logged mostly 59-63 FPS, with throughput around 244-324 KB/s and near-zero drop.
- Practical FPS target of 30-60 FPS is verified on the real phone.
- 2K target is verified at the backend stream level and remains available as the quality preset. Default is now the faster 1080x920 preset to reduce transfer delay.

## Current Limits
- End-to-end latency target of 5-10ms is not proven. At 60 Hz, one display frame is about 16.7ms before encode/decode/display overhead, so 5-10ms total latency is not a realistic guaranteed target for this pipeline.
- Reducing resolution improves speed/latency but conflicts with the minimum 2K quality requirement if the user selects 1080p or 720p.
- NVENC is not usable on this PC with the bundled FFmpeg because the installed NVIDIA driver exposes an older NVENC API.
- Current best working encoder on this machine is `h264_mf` with low-delay VBR and display-remoting scenario.

## Next Work
1. Current default prioritizes lower latency with `Nhanh` 1080x920/6M; user can select `2K` when quality matters more.
2. If proving latency is required, add explicit latency measurement instead of relying on FPS/drop metrics.
3. Package a new desktop build after the user confirms the phone-side visual result is acceptable.
4. Do not commit or push unless the user asks.
## 2026-07-30 - Low-latency PC screen tuning
- Pushed existing work first at commit 6226038a on main.
- Added Android-side network RTT probe for PC Screen stream through `/api/screen/latency`; overlay/log now shows `net X ms`.
- Android H.264 viewer now uses a smaller 128KB read buffer, caps pending H.264 data at 2MB, and only drops stale buffered data when backlog grows.
- Backend H.264 encoder now uses shorter GOP/keyframe interval (`max(6, fps / 4)`) so recovery is faster after a dropped backlog.
- Backend Java compile passed with `powershell -ExecutionPolicy Bypass -File .\backend\run.ps1 -CompileOnly`.
- Android debug build passed with `C:\tmp\scft-android\gradlew.bat :app:assembleDebug`.
- Real device `5f595062` test after tuning: mostly 57-62 FPS, low drops, ADB RTT usually 4-13ms; one initial second at 45 FPS during startup.
- Important finding: transfer/network delay is low; perceived >100ms delay is more likely encode/decode/display buffering or Windows capture/encoder behavior than ADB transport.
## 2026-07-30 - Default 2K Android PC screen
- Changed Android PC Screen default preset to `2K 2560x1440` so the default viewer no longer starts at 1080x920.
- Added preset and resolution to the Android stream overlay/log, for example `2K 2560x1440 | 54 FPS | ... | net 6 ms`.
- Tested default 2K on real device `5f595062` through ADB reverse: after startup it held mostly 51-57 FPS with RTT around 3-10ms.
- Tried a more aggressive latest-frame-only decoder drain plus 2K 16M bitrate; it reduced FPS to about 40-48 and increased drops, so that drain strategy was reverted.
- Current evidence still does not prove true end-to-end latency of 5-10ms; it proves the USB/HTTP RTT is usually within that range and the remaining perceived delay is outside the transport layer.

## 2026-07-30 - Backend 2K encoder check
- Measured backend 2K stream locally with FFmpeg for 10 seconds: backend produced 600 frames at 2560x1440, proving backend/USB is not the main FPS bottleneck.
- Tested forcing `h264_mf -hw_encoding 1`; it failed with RGB input unless converted to nv12, so hard-forcing hardware encode is not safe for every machine.
- Updated backend H.264 filter chain to append `format=nv12` for `h264_mf`, matching the encoder supported pixel format before MediaFoundation receives frames.
- Backend compile passed after the filter update.
- Real Android 2K test after `format=nv12`: still around 50-57 FPS after startup, RTT about 5-14ms. This is safe but not a decisive FPS/latency breakthrough.
- Current bottleneck remains Android decode/render timing or Windows/MediaFoundation buffering, not ADB transfer.

## 2026-07-30 - Android MediaCodec runtime low latency
- Added Android runtime `MediaCodec.PARAMETER_KEY_LOW_LATENCY` after decoder start, in addition to the existing `MediaFormat.KEY_LOW_LATENCY` configure flag.
- Android build passed with `C:\tmp\scft-android\gradlew.bat :app:assembleDebug`.
- Real device `5f595062` default 2K test after the change: startup second 44 FPS, then mostly 51-59 FPS with RTT about 4-10ms.
- This is a low-risk decoder configuration improvement, but it still does not prove true end-to-end 5-10ms latency.

## 2026-07-30 - Android split reader and decoder
- Split Android H.264 receiving into a dedicated HTTP reader thread plus a capped encoded chunk queue, while the main stream thread focuses on MediaCodec feed/drain.
- Queue is capped by `MAX_PENDING_H264_BYTES` and drops oldest encoded chunks when it grows too large, keeping decoder closer to the newest data.
- Android build passed with `C:\tmp\scft-android\gradlew.bat :app:assembleDebug`.
- Real device `5f595062` 2K test after selecting preset 2K: 56-62 FPS, 0 drops across the sampled log, RTT usually 4-12ms with one 85ms spike.
- This is the strongest improvement so far for the 2K/60 FPS target. End-to-end 5-10ms still is not fully proven, but transport RTT and render FPS are now much closer to target.

## 2026-07-30 - Fast mode tuned for lower stutter
- User reported mode `Nhanh` still stuttered too much and accepted lowering quality settings to prioritize faster image transfer.
- Changed Android `Nhanh` preset from 1920x1080/12M to 1600x900/6M.
- Changed 720p preset bitrate from 8M to 4M for an even lighter fallback.
- Added per-preset encoded queue limits: 2K keeps 2MB, `Nhanh` uses 768KB, 720p uses 512KB.
- Kept the `buf X KB` overlay/log metric so internal backlog can be seen directly.
- Android build passed with `C:\tmp\scft-android\gradlew.bat :app:assembleDebug`.
- Real device `5f595062` test for `Nhanh 1600x900`: after startup it held mostly 59-63 FPS, 0 drops, backlog about 110-116KB, RTT about 5-10ms.

## 2026-07-30 - Faster Android presets for PC Screen
- User reported `Nhanh` mode still had too much stutter and accepted reducing quality more when the preset is meant to prioritize speed.
- Changed Android PC Screen presets:
  - `2K`: 2560x1440/24M, 2MB pending queue, kept for quality.
  - `Cân bằng`: 1600x900/6M, 768KB pending queue, moved from the old fast preset.
  - `Nhanh`: 1280x720/4M, 384KB pending queue, now optimized for lower delay.
  - `Siêu nhanh`: 960x540/2M, 256KB pending queue, lowest-latency fallback.
- Android build passed with `C:\tmp\scft-android\gradlew.bat :app:assembleDebug`.
- Real device `5f595062` UI dump confirmed all four preset buttons and Start/Stop/Back buttons fit in landscape.
- Real device `5f595062` test for `Nhanh 1280x720`: after startup it held 56-60 FPS, 0 drops, backlog about 84-88KB, RTT about 5-9ms.
- Real device `5f595062` test for `Siêu nhanh 960x540`: held 53-62 FPS, 0 drops, backlog about 56-60KB, RTT about 7-8ms after startup.
- This reduces transport pressure and queued video backlog. True end-to-end visual latency is still not proven at 5-10ms and needs a separate latency measurement path if that exact target must be verified.
