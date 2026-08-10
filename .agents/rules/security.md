# Security Guidelines

## Focus Areas
- Device pairing and authentication (Do not automatically trust devices just because they are on the same LAN).
- File path validation and preventing path traversal.
- Handling untrusted input.
- Logging (Never log passwords, tokens, private keys, or sensitive payloads).

## Network Exposure
- Ensure that the Java backend (`localhost:7878`) is properly secured or only exposed to authenticated devices.
