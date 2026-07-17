$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$resources = Join-Path $root "build-resources"
$javaRuntime = Join-Path $resources "java-runtime"
$platformTools = Join-Path $resources "platform-tools"
$tempRoot = Join-Path $env:TEMP "scft-build-runtime"
$tempJavaRuntime = Join-Path $tempRoot "java-runtime"

function Find-CommandPath($name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    return ""
}

function Find-Jlink {
    $path = Find-CommandPath "jlink"
    if ($path) {
        return $path
    }

    $candidate = Get-ChildItem -Path "C:\Program Files\Java" -Recurse -Filter jlink.exe -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1

    if ($candidate) {
        return $candidate.FullName
    }

    throw "jlink.exe not found. Install JDK 11+ before building SCFT."
}

function Find-PlatformTools {
    $candidates = @()

    if ($env:ANDROID_HOME) {
        $candidates += Join-Path $env:ANDROID_HOME "platform-tools"
    }

    if ($env:ANDROID_SDK_ROOT) {
        $candidates += Join-Path $env:ANDROID_SDK_ROOT "platform-tools"
    }

    if ($env:LOCALAPPDATA) {
        $candidates += Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
    }

    $candidates += Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk\platform-tools"

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath (Join-Path $candidate "adb.exe")) {
            return $candidate
        }
    }

    throw "Android platform-tools not found. Install Android SDK platform-tools before building SCFT."
}

New-Item -ItemType Directory -Force -Path $resources | Out-Null

if (Test-Path -LiteralPath $javaRuntime) {
    Remove-Item -LiteralPath $javaRuntime -Recurse -Force
}

if (Test-Path -LiteralPath $tempJavaRuntime) {
    Remove-Item -LiteralPath $tempJavaRuntime -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$jlink = Find-Jlink
& $jlink `
    --add-modules java.base,jdk.httpserver `
    --strip-debug `
    --no-header-files `
    --no-man-pages `
    --compress zip-6 `
    --output $tempJavaRuntime

if ($LASTEXITCODE -ne 0) {
    throw "jlink failed"
}

Copy-Item -LiteralPath $tempJavaRuntime -Destination $javaRuntime -Recurse

if (Test-Path -LiteralPath $platformTools) {
    Remove-Item -LiteralPath $platformTools -Recurse -Force
}

$sourcePlatformTools = Find-PlatformTools
Copy-Item -LiteralPath $sourcePlatformTools -Destination $platformTools -Recurse

if (-not (Test-Path -LiteralPath (Join-Path $javaRuntime "bin\java.exe"))) {
    throw "Bundled Java runtime was not created"
}

if (-not (Test-Path -LiteralPath (Join-Path $platformTools "adb.exe"))) {
    throw "Bundled adb.exe was not copied"
}
