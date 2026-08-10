---
name: debugging
description: Guidelines for debugging the SCFT project.
---

# Debugging SCFT

## Process
1. **Reproduce**: Verify the issue.
2. **Collect evidence**: Check logs, console errors.
3. **Identify root cause**: Trace through the architecture (e.g. Electron -> Java Backend -> ADB -> Android).
4. **Determine affected components**: Find exactly which modules are responsible.
5. **Implement minimal fix**: Avoid rewriting components to fix a single bug.
6. **Build & Test**: Compile the backend/Android app and run the Electron app.
7. **Regression test**: Ensure existing features aren't broken.
8. **Document**: Update the `docs/project-status.md` or other related documentation.

## Evidence Gathering
- **Java Backend**: Check terminal output or log files if available.
- **Android**: Use `adb logcat | grep SCFT`. The PC Screen viewer logs metrics with tag `SCFT-PC-SCREEN`.
- **Electron**: Check developer tools in the browser window.
