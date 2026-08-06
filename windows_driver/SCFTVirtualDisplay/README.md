# SCFT Virtual Display (legacy development driver)

> This is the old SCFT development driver. It is not used by the current PC
> Screen feature and is not packaged by the desktop app. The current feature
> uses the signed VirtualDrivers VDD package instead, so end users do not need
> Windows Test Mode. Keep this folder only for historical source reference.

This folder contains the Windows Indirect Display Driver source used to create one real virtual monitor for SCFT. When the driver package is installed and `SCFTVirtualDisplayApp.exe` is running, Windows exposes a separate 1920x1080 60 Hz display. Select that display in SCFT PC Screen Share and extend the desktop to it in Windows Display Settings.

## Requirements

- Windows 11 x64
- Visual Studio 2022 Build Tools with Desktop development with C++
- Windows Driver Kit (WDK) for Windows 11
- Administrator permission to install a driver package

## Build

Open `SCFTVirtualDisplay.sln` in Visual Studio and build `Release|x64`, or run:

```powershell
.\scripts\build-driver.ps1
```

The produced driver package must contain `SCFTVirtualDisplayDriver.inf`, `SCFTVirtualDisplayDriver.dll`, and its generated catalog file.

## Development test

The current build is test-signed for development only. It is not suitable for normal end-user distribution.

Run the following as Administrator to enable Test Mode, then restart Windows:

```powershell
.\scripts\set-test-signing.ps1
```

Secure Boot or BitLocker policy can prevent Test Mode from being enabled. Do not disable those protections unless this is a controlled development machine.

## Install and start

Run PowerShell as Administrator:

```powershell
.\scripts\install-driver.ps1 -PackageDirectory <driver-package-folder> -TestCertificatePath <SCFTVirtualDisplayDriver.cer>
.\scripts\start-virtual-display.ps1 -AppPath <SCFTVirtualDisplayApp.exe>
```

Open Windows Settings > System > Display, find SCFT Virtual Display, then select Extend these displays. The virtual display appears in SCFT PC Screen Share as a source monitor. The Android app receives the selected monitor through USB ADB.

## Important

A development driver cannot be shipped to end users until it has a valid production signature. Test signing or changes to Secure Boot are not performed by this repository scripts. The install script only installs an already signed package.

## Source and license

This implementation is derived from the Microsoft Windows Driver Samples Indirect Display Driver sample. The retained source is licensed under the Microsoft Public License in `LICENSE-Microsoft-MS-PL.txt`.
