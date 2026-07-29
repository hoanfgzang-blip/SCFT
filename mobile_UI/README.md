# SCFT Mobile

React Native / Expo native Android implementation of the SCFT mobile UI.

## Run With Android Studio And USB

This project has been prebuilt into a native Android project at:

```text
android/
```

Expo Go is not required for this workflow.

1. Install Android Studio with Android SDK, Android SDK Platform-Tools, and a recent Android SDK Platform.
2. On the phone, enable Developer options and USB debugging.
3. Connect the phone with a data-capable USB cable or USB adapter.
4. Accept the "Allow USB debugging" prompt on the phone.
5. Open this folder in Android Studio:

```text
C:\Users\admin\Documents\Codex\2026-06-09\code-gi-p-t-i-ui\outputs\scft-mobile\android
```

6. Wait for Gradle sync to finish, choose the physical device, then press Run.

For local command-line device run after Android SDK is installed:

```powershell
npm run android:device
```

To start Metro for the native app:

```powershell
npm run start:native
```

## Android SDK Environment

After installing Android Studio, set:

```powershell
ANDROID_HOME=C:\Users\admin\AppData\Local\Android\Sdk
```

Add this to PATH:

```powershell
C:\Users\admin\AppData\Local\Android\Sdk\platform-tools
```

Then verify:

```powershell
adb devices
```

## Useful Scripts

```powershell
npm install
npm run android:prebuild
npm run start:native
npm run android:device
```

The npm start wrapper runs Expo/Metro with a larger Node heap and only 2 Metro workers to reduce Windows out-of-memory crashes.
