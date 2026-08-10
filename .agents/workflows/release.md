# Release Workflow

## Process
1. Run full regression test suite (Backend, Android, PC).
2. Verify all critical features:
   - Second Display (PC Screen) streaming.
   - File Transfer via USB.
3. Update version numbers in `package.json`, `build.gradle`, etc.
4. Package PC App: `npm run dist`.
5. Package Android App: `gradlew :app:assembleRelease`.
6. Test artifacts manually before marking as release-ready.
