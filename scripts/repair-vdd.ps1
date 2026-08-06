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
$driverHardwareId = "Root\MttVDD"
$driverBaseUrl = "https://api.github.com/repos/VirtualDrivers/Virtual-Display-Driver/releases/latest"
$nefconUrl = "https://github.com/nefarius/nefcon/releases/download/v1.17.40/nefcon_v1.17.40.zip"
$nefconSha256 = "812bae7ed7dfb7d6d2284bc7de2f8ccebc92ed2a0b1ae893c53b337096e50c1a"

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

if (-not $SkipInstall) {
    $wingetState = (& winget.exe list --id $wingetId --exact --accept-source-agreements 2>&1 | Out-String)
    if ($wingetState -match [regex]::Escape($wingetId)) {
        Write-Host "VDD Control is already installed; keeping the existing user-scope package."
    } else {
        Write-Host "Installing VDD Control $wingetVersion..."
        & winget.exe install --id $wingetId --exact --version $wingetVersion --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) {
            throw "VDD Control installation failed with exit code $LASTEXITCODE."
        }
    }

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
            $resolutions = $settings.SelectSingleNode('/vdd_settings/resolutions')
            if ($null -ne $resolutions) {
                $required = @(
                    @{ width = '1280'; height = '800' },
                    @{ width = '1920'; height = '1200' },
                    @{ width = '2560'; height = '1600' }
                )
                foreach ($item in $required) {
                    $exists = $resolutions.SelectSingleNode("resolution[width='$($item.width)' and height='$($item.height)']")
                    if ($null -eq $exists) {
                        $resolution = $settings.CreateElement('resolution')
                        $width = $settings.CreateElement('width'); $width.InnerText = $item.width
                        $height = $settings.CreateElement('height'); $height.InnerText = $item.height
                        $rate = $settings.CreateElement('refresh_rate'); $rate.InnerText = '30'
                        [void]$resolution.AppendChild($width)
                        [void]$resolution.AppendChild($height)
                        [void]$resolution.AppendChild($rate)
                        [void]$resolutions.AppendChild($resolution)
                    }
                }
            }
            $settings.Save($settingsPath)
            Write-Host "Reset VDD GPU selection, monitor count, and 16:10 modes."
        } catch {
            Write-Warning "Could not normalize $settingsPath. Backup kept at $backupPath."
        }
    }

    # Winget installs VDD Control, but it does not create the display device.
    # Install the signed driver package directly so SCFT does not depend on a
    # user finding and pressing the Install Driver button in a second window.
    $workPath = Join-Path $env:TEMP ("scft-vdd-install-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $workPath -Force | Out-Null
    try {
        $release = Invoke-RestMethod -Uri $driverBaseUrl -Headers @{ "User-Agent" = "SCFT" }
        $assetName = if ([Environment]::Is64BitOperatingSystem -and $env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
            "VirtualDisplayDriver-ARM64.Driver.Only.zip"
        } else {
            # The upstream x64 Windows package is currently named x86.Driver.Only.
            "VirtualDisplayDriver-x86.Driver.Only.zip"
        }
        $asset = @($release.assets | Where-Object { $_.name -eq $assetName }) | Select-Object -First 1
        if ($null -eq $asset) {
            throw "Không tìm thấy gói VDD $assetName trong release $($release.tag_name)."
        }

        $driverZip = Join-Path $workPath $asset.name
        Write-Host "Downloading signed VDD package $($asset.name)..."
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $driverZip
        $expectedHash = ([string]$asset.digest) -replace "^sha256:", ""
        if ($expectedHash) {
            $actualHash = (Get-FileHash -LiteralPath $driverZip -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
                throw "VDD package checksum mismatch."
            }
        }

        $driverExtract = Join-Path $workPath "driver"
        Expand-Archive -LiteralPath $driverZip -DestinationPath $driverExtract -Force
        $inf = Get-ChildItem -LiteralPath $driverExtract -Recurse -Filter "MttVDD.inf" -File | Select-Object -First 1
        if ($null -eq $inf) { throw "VDD package không chứa MttVDD.inf." }
        $packageDir = $inf.Directory.FullName

        $nefconZip = Join-Path $workPath "nefcon.zip"
        Write-Host "Downloading verified nefcon device installer..."
        Invoke-WebRequest -Uri $nefconUrl -OutFile $nefconZip
        $nefconHash = (Get-FileHash -LiteralPath $nefconZip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($nefconHash -ne $nefconSha256) { throw "nefcon checksum mismatch." }
        $nefconExtract = Join-Path $workPath "nefcon"
        Expand-Archive -LiteralPath $nefconZip -DestinationPath $nefconExtract -Force
        $nefconName = "nefconc.exe"
        $nefconArch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }
        $nefcon = Get-ChildItem -LiteralPath $nefconExtract -Recurse -Filter $nefconName -File |
            Where-Object { $_.Directory.Name -eq $nefconArch } |
            Select-Object -First 1
        if ($null -eq $nefcon) {
            throw "Không tìm thấy nefconc.exe cho kiến trúc $nefconArch."
        }

        New-Item -ItemType Directory -Path (Split-Path -Parent $settingsPath) -Force | Out-Null
        Get-ChildItem -LiteralPath $packageDir -File | ForEach-Object {
            if ($_.Name -ne "vdd_settings.xml") {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path (Split-Path -Parent $settingsPath) $_.Name) -Force
            }
        }
        New-Item -Path "HKLM:\SOFTWARE\MikeTheTech\VirtualDisplayDriver" -Force | Out-Null
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MikeTheTech\VirtualDisplayDriver" -Name "VDDPATH" -Value (Split-Path -Parent $settingsPath) -Force

        Write-Host "Installing the signed VDD device..."
        & $nefcon.FullName install $inf.FullName $driverHardwareId --no-duplicates --remove-duplicates 2>&1 | ForEach-Object { Write-Host $_ }
        $nefconExitCode = $LASTEXITCODE
        if ($nefconExitCode -ne 0 -and $nefconExitCode -ne 3010) {
            throw "nefcon install failed with exit code $nefconExitCode."
        }

        Start-Sleep -Seconds 2
        $installedDevices = @(Get-PnpDevice -Class Display -ErrorAction SilentlyContinue |
            Where-Object { $_.HardwareID -contains $driverHardwareId -or $_.FriendlyName -match "Virtual Display Driver|MttVDD" })
        if ($installedDevices.Count -ne 1) {
            throw "Sau khi cài, Windows nhận $($installedDevices.Count) VDD node; yêu cầu đúng 1 node."
        }
        Write-Host "VDD device installed successfully: $($installedDevices[0].Status)"
    } finally {
        Remove-Item -LiteralPath $workPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "VDD repair complete. Reboot Windows before starting PC Screen."
