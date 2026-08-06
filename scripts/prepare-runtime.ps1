$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$resources = Join-Path $root "build-resources"
$javaRuntime = Join-Path $resources "java-runtime"
$platformTools = Join-Path $resources "platform-tools"
$ffmpegRuntime = Join-Path $resources "ffmpeg"
$tempRoot = Join-Path $env:TEMP "scft-build-runtime"
$tempJavaRuntime = Join-Path $tempRoot "java-runtime"
$tempFfmpeg = Join-Path $tempRoot "ffmpeg"
$ffmpegZip = Join-Path $tempRoot "ffmpeg-lgpl-shared.zip"
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-lgpl-shared-8.1.zip"

function Find-CommandPath($name) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    return ""
}

function Find-Jlink {
    $candidates = @()
    $commandPath = Find-CommandPath "jlink"
    if ($commandPath) {
        $candidates += $commandPath
    }

    if ($env:JAVA_HOME) {
        $candidates += Join-Path $env:JAVA_HOME "bin\jlink.exe"
    }

    foreach ($rootPath in @(
        "C:\Program Files\Java",
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Microsoft",
        "C:\Program Files\Amazon Corretto"
    )) {
        if (Test-Path -LiteralPath $rootPath) {
            $candidates += Get-ChildItem -Path $rootPath -Recurse -Filter jlink.exe -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty FullName
        }
    }

    foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate)) {
            continue
        }

        # Android Studio's bundled JBR can compile the project, but it cannot
        # create the trimmed runtime used by the Windows package.
        if ($candidate -match "(?i)Android Studio[\\/]jbr[\\/]bin[\\/]jlink\.exe$") {
            continue
        }

        $probe = Join-Path $tempRoot ("jlink-probe-" + [Guid]::NewGuid().ToString("N"))
        try {
            & $candidate --add-modules java.base --output $probe 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path $probe "bin\java.exe"))) {
                return $candidate
            }
        } finally {
            if (Test-Path -LiteralPath $probe) {
                Remove-Item -LiteralPath $probe -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    throw "A full JDK 11+ with a working jlink.exe is required. Android Studio JBR is not sufficient for packaging SCFT."
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

if (Test-Path -LiteralPath $tempFfmpeg) {
    Remove-Item -LiteralPath $tempFfmpeg -Recurse -Force
}

if (-not (Test-Path -LiteralPath $ffmpegZip)) {
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing
}

Expand-Archive -LiteralPath $ffmpegZip -DestinationPath $tempFfmpeg -Force
$ffmpegExecutable = Get-ChildItem -Path $tempFfmpeg -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ffmpegExecutable) {
    throw "FFmpeg executable was not found in the downloaded LGPL shared archive."
}

if (Test-Path -LiteralPath $ffmpegRuntime) {
    Remove-Item -LiteralPath $ffmpegRuntime -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $ffmpegRuntime | Out-Null
$ffmpegSourceBin = $ffmpegExecutable.Directory.FullName
Copy-Item -LiteralPath $ffmpegSourceBin -Destination (Join-Path $ffmpegRuntime "bin") -Recurse

$jlink = Find-Jlink
& $jlink `
    --add-modules java.base,java.desktop,jdk.httpserver `
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

if (-not (Test-Path -LiteralPath (Join-Path $ffmpegRuntime "bin\ffmpeg.exe"))) {
    throw "Bundled FFmpeg was not prepared"
}
