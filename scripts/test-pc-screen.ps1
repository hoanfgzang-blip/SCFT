[CmdletBinding()]
param(
    [string]$BackendUrl = "http://127.0.0.1:7878",
    [string]$AdbPath = "",
    [int]$Display = 1,
    [string]$DisplayId = "",
    [int]$PresetCycleRounds = 10,
    [int]$StopStartRounds = 10,
    [int]$SoakMinutes = 0,
    [switch]$SkipCycles
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AdbPath)) {
    $AdbPath = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
}
if (-not (Test-Path -LiteralPath $AdbPath)) {
    throw "ADB not found: $AdbPath"
}

$presets = @("zero_latency", "balanced", "adaptive_2k")
$packageName = "com.example.myapplication"
$activityName = "$packageName/.MainActivity"
$results = [System.Collections.Generic.List[object]]::new()
$serial = $null

function Invoke-Adb {
    param([string[]]$Arguments)
    $output = & $script:AdbPath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "ADB failed ($($Arguments -join ' ')): $($output -join ' ')"
    }
    return $output
}

function Get-Json {
    param([string]$Uri)
    return Invoke-RestMethod -Uri $Uri -Method Get
}

function Get-AuthorizedDevice {
    $lines = Invoke-Adb @("devices") | ForEach-Object { $_.ToString().Trim() }
    $deviceLine = $lines | Where-Object { $_ -match "^(\S+)\s+device$" } | Select-Object -First 1
    if (-not $deviceLine) {
        if ($lines | Where-Object { $_ -match "unauthorized" }) {
            throw "ADB_UNAUTHORIZED"
        }
        throw "ADB_DEVICE_NOT_FOUND"
    }
    return ($deviceLine -split "\s+")[0]
}

function Assert-PhoneUnlocked {
    $window = (Invoke-Adb @("-s", $script:serial, "shell", "dumpsys", "window")) -join "`n"
    $power = (Invoke-Adb @("-s", $script:serial, "shell", "dumpsys", "power")) -join "`n"
    $state = "$window`n$power"
    if ($state -match "mDreamingLockscreen\s*=\s*true|isKeyguardShowing\s*=\s*true|mKeyguardShowing\s*=\s*true|mWakefulness\s*=\s*(Asleep|Dozing)") {
        throw "PHONE_LOCKED: unlock tablet manually, then retry"
    }
}

function Get-DisplayId {
    if (-not [string]::IsNullOrWhiteSpace($script:DisplayId)) {
        return $script:DisplayId
    }
    $status = Get-Json "$script:BackendUrl/api/screen/status"
    $screen = @($status.screens) | Where-Object { [int]$_.index -eq $script:Display } | Select-Object -First 1
    if (-not $screen) {
        throw "Display $script:Display not found"
    }
    return [string]$screen.id
}

function Wait-Session {
    param([string]$SessionId, [int]$TimeoutSeconds = 12)
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $session = Get-Json "$script:BackendUrl/api/screen/session"
        if (-not $session -or $session.sessionId -ne $SessionId) {
            throw "STARTUP_TIMEOUT: session disappeared"
        }
        if ($session.state -eq "streaming") {
            return $session
        }
        if ($session.state -eq "error") {
            throw "$($session.errorCode): $($session.errorMessage)"
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "STARTUP_TIMEOUT"
}

function Stop-Stream {
    $startedAt = [DateTime]::UtcNow
    Invoke-Adb @("-s", $script:serial, "shell", "am", "force-stop", $script:packageName) | Out-Null
    Invoke-RestMethod -Uri "$script:BackendUrl/api/screen/session" -Method Delete | Out-Null
    do {
        $session = Get-Json "$script:BackendUrl/api/screen/session"
        if (-not $session) { break }
        Start-Sleep -Milliseconds 100
    } while (([DateTime]::UtcNow - $startedAt).TotalSeconds -lt 2)
    return [math]::Round(([DateTime]::UtcNow - $startedAt).TotalSeconds, 3)
}

function Start-Stream {
    param([string]$PresetId, [int]$Attempt = 1)
    $displayId = Get-DisplayId
    $query = 'display={0}&displayId={1}&preset={2}&requestedPreset={2}&transport=usb&attempt={3}' -f `
        $script:Display, [uri]::EscapeDataString($displayId), $PresetId, $Attempt
    $session = Invoke-RestMethod -Uri "$script:BackendUrl/api/screen/session?$query" -Method Post
    $args = @(
        "-s", $script:serial, "shell", "am", "start", "-S", "-n", $script:activityName,
        "--es", "scft_screen", "pc",
        "--ei", "scft_display", "$script:Display",
        "--es", "scft_display_id", $displayId,
        "--es", "scft_preset", $PresetId,
        "--es", "scft_session_id", $session.sessionId,
        "--el", "scft_generation", "$($session.generation)",
        "--ei", "scft_attempt", "$Attempt",
        "--ez", "scft_autostart", "true",
        "--es", "scft_base_url", $script:BackendUrl
    )
    Invoke-Adb $args | Out-Null
    return Wait-Session $session.sessionId
}

function Invoke-Apply {
    param([string]$PresetId, [int]$Round)
    $stopSeconds = Stop-Stream
    $startedAt = [DateTime]::UtcNow
    $session = Start-Stream $PresetId
    $startSeconds = [math]::Round(([DateTime]::UtcNow - $startedAt).TotalSeconds, 3)
    $results.Add([pscustomobject]@{
            type = "apply"
            round = $Round
            preset = $PresetId
            startSeconds = $startSeconds
            stopSeconds = $stopSeconds
            fps = $session.metrics.fps
            firstFrameAt = $session.metrics.firstFrameAt
        })
}

function Invoke-Soak {
    param([string]$PresetId)
    $session = Start-Stream $PresetId
    $deadline = [DateTime]::UtcNow.AddMinutes($script:SoakMinutes)
    $samples = 0
    $fpsSum = 0
    $dropped = 0
    $lastFirstFrame = $session.metrics.firstFrameAt
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 1
        $current = Get-Json "$script:BackendUrl/api/screen/session"
        if (-not $current -or $current.state -ne "streaming") {
            throw "SOAK_SESSION_LOST: $PresetId"
        }
        $samples++
        $fpsSum += [int]$current.metrics.fps
        $dropped += [int]$current.metrics.droppedFrames
        $lastFirstFrame = $current.metrics.firstFrameAt
    }
    $stopSeconds = Stop-Stream
    $results.Add([pscustomobject]@{
            type = "soak"
            preset = $PresetId
            minutes = $script:SoakMinutes
            samples = $samples
            averageFps = if ($samples) { [math]::Round($fpsSum / $samples, 2) } else { 0 }
            droppedFrames = $dropped
            firstFrameAt = $lastFirstFrame
            stopSeconds = $stopSeconds
        })
}

try {
    $script:serial = Get-AuthorizedDevice
    Assert-PhoneUnlocked
    Invoke-Adb @("-s", $script:serial, "reverse", "tcp:7878", "tcp:7878") | Out-Null
    $status = Get-Json "$BackendUrl/api/screen/status"
    if (-not $status.available -or [int]$status.displays -le $Display) {
        throw "VDD_NOT_READY: display $Display unavailable"
    }

    if (-not $SkipCycles) {
        for ($round = 1; $round -le $PresetCycleRounds; $round++) {
            foreach ($preset in $presets) {
                Invoke-Apply $preset $round
            }
        }
        for ($round = 1; $round -le $StopStartRounds; $round++) {
            Invoke-Apply "balanced" $round
            $stopSeconds = Stop-Stream
            $results.Add([pscustomobject]@{ type = "stop_start"; round = $round; stopSeconds = $stopSeconds })
        }
    }

    if ($SoakMinutes -gt 0) {
        foreach ($preset in $presets) {
            Invoke-Soak $preset
        }
    }

    $results | ConvertTo-Json -Depth 6
} finally {
    if ($script:serial) {
        try { Invoke-Adb @("-s", $script:serial, "shell", "am", "force-stop", $script:packageName) | Out-Null } catch { }
        try { Invoke-RestMethod -Uri "$BackendUrl/api/screen/session" -Method Delete | Out-Null } catch { }
    }
}
