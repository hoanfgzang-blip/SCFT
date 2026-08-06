param(
    [int]$Port = 7878,
    [string]$Storage = "backend/storage",
    [string]$OutDir = "backend/out",
    [string]$JavaExe = "",
    [switch]$SkipCompile,
    [switch]$CompileOnly
)

$ErrorActionPreference = "Stop"

$java = if ($JavaExe) { Get-Item -LiteralPath $JavaExe -ErrorAction SilentlyContinue } else { Get-Command java -ErrorAction SilentlyContinue }
$javac = Get-Command javac -ErrorAction SilentlyContinue
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledJava = Join-Path $projectRoot "build-resources\java-runtime\bin\java.exe"
$ffmpegCandidates = @(
    (Join-Path $projectRoot "build-resources\ffmpeg\bin\ffmpeg.exe"),
    (Join-Path $projectRoot "..\ffmpeg\bin\ffmpeg.exe")
)
if (-not $env:SCFT_FFMPEG_PATH) {
    $bundledFfmpeg = $ffmpegCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($bundledFfmpeg) {
        $env:SCFT_FFMPEG_PATH = (Resolve-Path -LiteralPath $bundledFfmpeg).Path
    }
}
$sourceFiles = Get-ChildItem -Path "backend/src/main/java" -Recurse -Filter "*.java" | ForEach-Object { Join-Path "backend/src/main/java" $_.FullName.Substring((Resolve-Path "backend/src/main/java").Path.Length + 1) }
$classFile = Join-Path $OutDir "com/scft/backend/ScftBackendServer.class"
$targetClassMajor = 55 # Java 11; also runs on every newer bundled runtime.

if (-not $javac -or -not $java) {
    $jdkRoots = @(
        $env:JAVA_HOME,
        "C:\Program Files\Java",
        "C:\Program Files\Android\Android Studio\jbr"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
    $jdkBin = $jdkRoots |
        ForEach-Object { Get-ChildItem -Path $_ -Recurse -Filter javac.exe -ErrorAction SilentlyContinue } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 |
        ForEach-Object { $_.Directory.FullName }

    if ($jdkBin) {
        $javac = Join-Path $jdkBin "javac.exe"
        $java = Join-Path $jdkBin "java.exe"
    }
}

if (-not $java) {
    if (Test-Path -LiteralPath $bundledJava) {
        $java = Get-Item -LiteralPath $bundledJava
    } else {
        throw "Java runtime not found. Install Java 11+ and make sure java is available."
    }
}

$needsCompile = (-not $SkipCompile) -and (-not (Test-Path $classFile))

if ((-not $SkipCompile) -and (-not $needsCompile)) {
    $needsCompile = ($sourceFiles | ForEach-Object { (Get-Item $_).LastWriteTimeUtc } | Measure-Object -Maximum).Maximum -gt (Get-Item $classFile).LastWriteTimeUtc
}

if ((-not $SkipCompile) -and (-not $needsCompile)) {
    $classBytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $classFile))
    if ($classBytes.Length -lt 8 -or $classBytes[0] -ne 0xCA -or $classBytes[1] -ne 0xFE -or $classBytes[2] -ne 0xBA -or $classBytes[3] -ne 0xBE) {
        $needsCompile = $true
    } else {
        $classMajor = ($classBytes[6] -shl 8) -bor $classBytes[7]
        $needsCompile = $classMajor -gt $targetClassMajor
    }
}

if ($needsCompile) {
    if (-not $javac) {
        throw "Java backend class not found and javac is unavailable. Install JDK 11+ or rebuild the app with backend classes included."
    }

    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    & $javac --release 11 -d $OutDir $sourceFiles
    if ($LASTEXITCODE -ne 0) {
        throw "Java backend compile failed"
    }
}

if ($CompileOnly) {
    exit 0
}

if (-not (Test-Path $classFile)) {
    throw "Java backend class not found. Rebuild the app before running."
}

$javaPath = if ($java -is [System.IO.FileInfo]) {
    $java.FullName
} elseif ($java.Source) {
    $java.Source
} else {
    [string]$java
}
if (-not $javaPath -or -not (Test-Path -LiteralPath $javaPath)) {
    throw "Java runtime path is invalid: $javaPath"
}
& $javaPath -cp $OutDir com.scft.backend.ScftBackendServer --port $Port --storage $Storage
