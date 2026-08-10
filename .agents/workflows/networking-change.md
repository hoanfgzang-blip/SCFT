# Networking Change Workflow

## Process
When changing network-related code (API, ADB tunnel, connection logic):

1. **Review**: Ensure no security vulnerabilities are introduced (e.g., exposing local APIs to the public without auth).
2. **Implement**: Make the minimal change.
3. **Test Failure Scenarios**:
   - Phone disconnect / PC disconnect.
   - WiFi drop / ADB failure.
   - High delay / packet loss.
   - App background / restart.
4. **Document**: Update `networking.md` or API documentation.
