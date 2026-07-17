$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$unpacked = Join-Path $dist "win-unpacked"
$tmp = Join-Path $dist "win-unpacked.tmp"

Set-Location $root

npm run backend:compile
if ($LASTEXITCODE -ne 0) {
    throw "Backend compile failed"
}

foreach ($target in @($unpacked, $tmp)) {
    if (Test-Path -LiteralPath $target) {
        $resolved = (Resolve-Path -LiteralPath $target).Path
        if (-not $resolved.StartsWith($root.Path)) {
            throw "Refusing to delete path outside project: $resolved"
        }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

npx electron-builder --win --dir
$dirExitCode = $LASTEXITCODE

if ((-not (Test-Path -LiteralPath $unpacked)) -and (Test-Path -LiteralPath $tmp)) {
    Rename-Item -LiteralPath $tmp -NewName "win-unpacked"
}

if (-not (Test-Path -LiteralPath (Join-Path $unpacked "SCFT.exe"))) {
    throw "win-unpacked build was not created. electron-builder exit code: $dirExitCode"
}

npx electron-builder --win --prepackaged $unpacked
if ($LASTEXITCODE -ne 0) {
    throw "Windows installer build failed"
}
