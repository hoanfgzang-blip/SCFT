param(
    [int]$Port = 7878,
    [string]$Storage = "backend/storage"
)

$ErrorActionPreference = "Stop"

$javac = Get-Command javac -ErrorAction SilentlyContinue
$java = Get-Command java -ErrorAction SilentlyContinue

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

if (-not $javac -or -not $java) {
    throw "Java JDK not found. Install JDK 11+ and make sure java and javac are available."
}

New-Item -ItemType Directory -Force -Path "backend/out" | Out-Null
& $javac -d "backend/out" "backend/src/main/java/com/scft/backend/ScftBackendServer.java"
& $java -cp "backend/out" com.scft.backend.ScftBackendServer --port $Port --storage $Storage
