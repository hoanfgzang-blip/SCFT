param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Mo PowerShell bang Run as administrator roi chay lai script nay."
}

$wingetId = "VirtualDrivers.Virtual-Display-Driver"
$wingetVersion = "25.7.23"
$settingsPath = "C:\VirtualDisplayDriver\vdd_settings.xml"

Get-Process -Name "VDD Control" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$devices = Get-PnpDevice -Class Display -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -match "Virtual Display Driver|MttVDD" }

foreach ($device in $devices) {
    Write-Host "Removing VDD device $($device.InstanceId)"
    & pnputil.exe /remove-device $device.InstanceId
    if ($LASTEXITCODE -ne 0) {
        throw "Could not remove VDD device $($device.InstanceId)."
    }
}

Write-Host "Uninstalling VDD package..."
& winget.exe uninstall --id $wingetId --exact --silent
if ($LASTEXITCODE -ne 0) {
    Write-Warning "winget uninstall returned exit code $LASTEXITCODE; continuing with installation."
}

if (-not $SkipInstall) {
    if (Test-Path -LiteralPath $settingsPath) {
        $backupPath = "$settingsPath.scft-backup"
        Copy-Item -LiteralPath $settingsPath -Destination $backupPath -Force
        try {
            $settings = New-Object System.Xml.XmlDocument
            $settings.Load($settingsPath)
            $gpuName = $settings.SelectSingleNode('/vdd_settings/gpu/friendlyname')
            if ($null -ne $gpuName) { $gpuName.InnerText = 'default' }
            $monitorCount = $settings.SelectSingleNode('/vdd_settings/monitors/count')
            if ($null -ne $monitorCount) { $monitorCount.InnerText = '1' }
            $settings.Save($settingsPath)
            Write-Host "Reset VDD GPU selection to default and monitor count to 1."
        } catch {
            Write-Warning "Could not normalize $settingsPath. Backup kept at $backupPath."
        }
    }

    Write-Host "Installing VDD $wingetVersion..."
    & winget.exe install --id $wingetId --exact --version $wingetVersion --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "VDD installation failed with exit code $LASTEXITCODE."
    }
}

Write-Host "VDD repair complete. Reboot Windows before starting PC Screen."
