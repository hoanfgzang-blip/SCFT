param(
    [switch]$Disable
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$state = if ($Disable) { "off" } else { "on" }
& bcdedit.exe /set testsigning $state
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Output "Test signing is set to $state. Restart Windows before installing or loading the test driver."