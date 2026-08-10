# Networking Guidelines

## Communication Flow
- **Protocol**: HTTP over TCP.
- **Transport**: Primarily ADB USB tunnel (`adb reverse tcp:7878 tcp:7878`).
- **Fallback**: LAN (Wi-Fi).

## Reliability
- Agent must check and test for:
  - Phone disconnect / PC disconnect.
  - WiFi loss / IP change.
  - Network delay / Packet loss.
  - App background / App restart / Device restart.
- Do not assume LAN or USB is always stable.
- Handle connection lost, timeouts, and reconnects gracefully.
