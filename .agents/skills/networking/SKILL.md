---
name: networking
description: Networking knowledge and rules for the SCFT project.
---

# Networking

## Core Concept
The primary transport is over a USB cable using ADB port tunneling.

```text
Android app -> http://127.0.0.1:7878 -> ADB reverse over USB -> Desktop Java backend
```
The desktop app automatically runs `adb reverse tcp:7878 tcp:7878` when a device is authorized.

## Validation Checklist
When making changes to networking, always test:
- Phone disconnect / PC disconnect.
- WiFi loss / IP change.
- Network delay / Packet loss.
- App background / App restart / Device restart.

Do not assume the connection is a stable LAN environment. Handle timeouts, connection loss, and heartbeat properly.
