param(
    [Parameter(Mandatory)]
    [string]$AppPath
)

$app = (Resolve-Path -LiteralPath $AppPath).Path
Start-Process -FilePath $app