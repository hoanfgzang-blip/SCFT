# Testing Guidelines

## Existing Tests
- Agent must run existing tests before claiming a task is done.
- If making changes, ensure no regressions.

## Backend
- Compile check: `backend/run.ps1 -CompileOnly`

## Android
- Build check: `gradlew :app:assembleDebug`

## UI/Electron
- Check build script: `npm run dist` or start `npm start`
