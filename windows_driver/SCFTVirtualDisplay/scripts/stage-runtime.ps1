param(
    [Parameter(Mandatory)]
    [string]$AppPath
)

$source = (Resolve-Path -LiteralPath $AppPath).Path
$targets = @(
    (Join-Path $PSScriptRoot "..\bin"),
    (Join-Path $PSScriptRoot "..\..\..\build-resources\virtual-display")
)

foreach ($target in $targets) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -LiteralPath $source -Destination (Join-Path $target "SCFTVirtualDisplayApp.exe") -Force
}