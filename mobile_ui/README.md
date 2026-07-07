# SCFT Mobile

React Native / Expo implementation of the SCFT mobile UI.

## Run

```bash
npm install
npm run start
```

Then open it in Expo Go, Android emulator, or iOS simulator.

The npm scripts run Expo with a larger Node heap and only 2 Metro workers to avoid Windows out-of-memory crashes.

## Android notes

To run on a physical phone, use `npm run start`, install Expo Go, and scan the QR code. This does not require Android Studio.

To run `npm run android`, install Android Studio with Android SDK Platform-Tools first, then set:

```powershell
ANDROID_HOME=C:\Users\admin\AppData\Local\Android\Sdk
```

and add this to PATH:

```powershell
C:\Users\admin\AppData\Local\Android\Sdk\platform-tools
```
