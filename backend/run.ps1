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
$sourceFile = Join-Path $PSScriptRoot "src/main/java/com/scft/backend/ScftBackendServer.java"
$classFile = Join-Path $OutDir "com/scft/backend/ScftBackendServer.class"

if (-not $javac -or -not $java) {
    $jdkBin = Get-ChildItem -Path "C:\Program Files\Java" -Recurse -Filter javac.exe -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1 |
        ForEach-Object { $_.Directory.FullName }

    if ($jdkBin) {
        $javac = Join-Path $jdkBin "javac.exe"
        $java = Join-Path $jdkBin "java.exe"
    }
}

if (-not $java) {
    throw "Java runtime not found. Install Java 11+ and make sure java is available."
}

$needsCompile = (-not $SkipCompile) -and (-not (Test-Path $classFile))

if ((-not $SkipCompile) -and (-not $needsCompile)) {
    $needsCompile = (Get-Item $sourceFile).LastWriteTimeUtc -gt (Get-Item $classFile).LastWriteTimeUtc
}

if ($needsCompile) {
    if (-not $javac) {
        throw "Java backend class not found and javac is unavailable. Install JDK 11+ or rebuild the app with backend classes included."
    }

    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    & $javac -d $OutDir $sourceFile
}

if ($CompileOnly) {
    exit 0
}

if (-not (Test-Path $classFile)) {
    throw "Java backend class not found. Rebuild the app before running."
}

$javaPath = if ($java.FullName) { $java.FullName } else { $java.Source }
& $javaPath -cp $OutDir com.scft.backend.ScftBackendServer --port $Port --storage $Storage
