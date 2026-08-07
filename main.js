const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const { execFile, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const scftUserData = path.join(localAppData, 'SCFT');
fs.mkdirSync(scftUserData, { recursive: true });
app.setPath('userData', scftUserData);
app.setPath('sessionData', path.join(scftUserData, 'session'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(scftUserData, 'cache'));

let backendProcess = null;
let runtimePaths = null;
let popoutWindow = null;
let virtualDisplayProcess = null;
let pcScreenOperation = null;
let pcScreenActive = null;
let pcScreenMonitorTimer = null;
let pcScreenMonitorBusy = false;
let pcScreenRecoveryPromise = null;
const VDD_WINGET_ID = 'VirtualDrivers.Virtual-Display-Driver';
const VDD_VERSION = '25.7.23';
const VDD_RELEASE_URL = 'https://github.com/VirtualDrivers/Virtual-Display-Driver/releases';

function waitForVirtualDisplay(timeoutMs) {
    return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            if (screen.getAllDisplays().length > 1 || Date.now() >= deadline) {
                resolve(screen.getAllDisplays().length > 1);
                return;
            }
            setTimeout(check, 250);
        };
        check();
    });
}

function runExternal(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error((stderr || stdout || error.message || '').trim()));
                return;
            }
            resolve((stdout || '').trim());
        });
    });
}

async function isVddInstalled() {
    const status = await getVddDeviceStatus();
    return status.installed;
}

async function getVddDeviceStatus() {
    try {
        const output = await runExternal('pnputil.exe', ['/enum-devices', '/class', 'Display']);
        const blocks = output.split(/(?=Instance ID:\s*)/gi);
        const vddBlocks = blocks.filter(block => /Device Description:\s+Virtual Display Driver/i.test(block));
        const started = vddBlocks.filter(block => /Status:\s+Started/i.test(block));
        return { installed: vddBlocks.length > 0, nodeCount: vddBlocks.length, startedCount: started.length, output };
    } catch (_) {
        return { installed: false, nodeCount: 0, startedCount: 0, output: '' };
    }
}

async function installVdd() {
    try {
        const installed = await runExternal('winget.exe', [
            'list',
            '--id', VDD_WINGET_ID,
            '--exact',
            '--accept-source-agreements'
        ]);
        if (new RegExp(VDD_WINGET_ID, 'i').test(installed)) {
            return;
        }
    } catch (_) {
        // Continue to the install command when winget cannot report state.
    }

    try {
        await runExternal('winget.exe', [
            'install',
            '--id', VDD_WINGET_ID,
            '--exact',
            '--version', VDD_VERSION,
            '--accept-source-agreements',
            '--accept-package-agreements'
        ]);
    } catch (error) {
        const message = error.message || 'Không thể cài Virtual Display Driver.';
        const wrapped = new Error(`${message} Mở trang tải driver chính thức để cài thủ công.`);
        wrapped.code = 'VDD_INSTALL_FAILED';
        wrapped.releaseUrl = VDD_RELEASE_URL;
        throw wrapped;
    }
}

function findVddControlExecutable() {
    const roots = [
        path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'),
        path.join(__dirname, 'build-resources', 'virtual-display')
    ];
    const queue = roots.filter(root => fs.existsSync(root));
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);

        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (_) {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (entry.isFile() && /(?:VDD|Virtual).*?(?:Control|Driver).*\.exe$/i.test(entry.name)) {
                return fullPath;
            }
        }
    }

    return null;
}

function launchVddControl() {
    const executable = findVddControlExecutable();
    if (!executable) return false;

    const child = spawn(executable, [], {
        detached: true,
        windowsHide: false,
        stdio: 'ignore'
    });
    child.unref();
    return true;
}

function setVddDisplayCount(count = 1) {
    const safeCount = Math.max(0, Math.min(1, Math.floor(Number(count) || 0)));
    const command = `
$pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'MTTVirtualDisplayPipe', [System.IO.Pipes.PipeDirection]::Out)
$pipe.Connect(3000)
$bytes = [System.Text.Encoding]::Unicode.GetBytes('SETDISPLAYCOUNT ${safeCount}')
$pipe.Write($bytes, 0, $bytes.Length)
$pipe.Flush()
$pipe.Dispose()
`;
    return runExternal('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command
    ], { timeout: 10000 });
}

function startVddRepair() {
    const scriptPath = path.join(__dirname, 'scripts', 'repair-vdd.ps1');
    if (!fs.existsSync(scriptPath)) {
        const error = new Error('Không tìm thấy script sửa Virtual Display Driver trong gói SCFT.');
        error.code = 'VDD_REPAIR_SCRIPT_MISSING';
        throw error;
    }

    const escapedScriptPath = scriptPath.replace(/'/g, "''");
    const command = [
        `$scriptPath = '${escapedScriptPath}'`,
        "$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath) -Wait -PassThru",
        'exit $process.ExitCode'
    ].join('; ');

    return runExternal('powershell.exe', ['-NoProfile', '-Command', command]);
}

async function ensureVirtualDisplay() {
    let status = await getVddDeviceStatus();
    if (status.nodeCount > 1) {
        const error = new Error(`Windows đang có ${status.nodeCount} node Virtual Display Driver bị trùng. Hãy gỡ sạch VDD bằng PowerShell Administrator rồi cài lại một lần.`);
        error.code = 'VDD_DUPLICATE_DEVICES';
        error.vddNodeCount = status.nodeCount;
        throw error;
    }

    if (!status.installed) {
        await installVdd();
        status = await getVddDeviceStatus();
        if (status.nodeCount > 1) {
            const error = new Error(`Windows đang có ${status.nodeCount} node Virtual Display Driver bị trùng. Hãy gỡ sạch VDD bằng PowerShell Administrator rồi cài lại một lần.`);
            error.code = 'VDD_DUPLICATE_DEVICES';
            error.vddNodeCount = status.nodeCount;
            throw error;
        }
    }

    const controlOpened = launchVddControl();
    try {
        // VDD creates the PnP node during install, but the node only becomes
        // an active Windows display after SETDISPLAYCOUNT 1 is sent over its
        // named pipe. This also avoids asking users to open VDD Control and
        // press a second Enable/Install button after a reboot.
        await setVddDisplayCount(1);
    } catch (_) {
        // The pipe may need a moment to start; the display wait below remains
        // the authoritative readiness check.
    }
    const appeared = await waitForVirtualDisplay(controlOpened ? 60000 : 15000);
    if (!appeared) {
        status = await getVddDeviceStatus();
        if (status.nodeCount > 1) {
            const error = new Error(`Windows đang có ${status.nodeCount} node Virtual Display Driver bị trùng. Hãy gỡ sạch VDD bằng PowerShell Administrator rồi cài lại một lần.`);
            error.code = 'VDD_DUPLICATE_DEVICES';
            error.vddNodeCount = status.nodeCount;
            throw error;
        }
        const error = new Error(controlOpened
            ? 'VDD Control đã mở nhưng Windows chưa nhận màn hình ảo. Hãy bấm Install/Enable trong VDD Control rồi thử lại.'
            : 'Virtual Display Driver đã cài nhưng chưa tìm thấy VDD Control. Hãy mở VDD Control từ gói driver rồi bấm Install/Enable.');
        error.code = 'VDD_NOT_READY';
        throw error;
    }

    status = await getVddDeviceStatus();
    if (!status.installed || status.startedCount < 1) {
        const error = new Error('Virtual Display Driver đã cài nhưng Windows chưa khởi động màn hình ảo. Hãy bật Install/Enable trong VDD Control rồi thử lại.');
        error.code = 'VDD_NOT_READY';
        throw error;
    }

    await setVirtualDisplayMode();
    return { ready: true, displays: screen.getAllDisplays().length, driverInstalled: true };
}

function getVirtualDisplayAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'virtual-display', 'SCFTVirtualDisplayApp.exe');
    }

    const bundledHelper = path.join(__dirname, 'build-resources', 'virtual-display', 'SCFTVirtualDisplayApp.exe');
    if (fs.existsSync(bundledHelper)) return bundledHelper;

    return path.join(__dirname, 'windows_driver', 'SCFTVirtualDisplay', 'bin', 'SCFTVirtualDisplayApp.exe');
}

function getVirtualDisplayDriverPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, "virtual-display", "driver", "SCFTVirtualDisplayDriver.inf");
    }

    return path.join(__dirname, "windows_driver", "SCFTVirtualDisplay", "x64", "Release", "SCFTVirtualDisplayDriver", "SCFTVirtualDisplayDriver.inf");
}

function installVirtualDisplayDriver() {
    if (!app.isPackaged) return Promise.resolve();
    const driverPath = getVirtualDisplayDriverPath();
    if (!fs.existsSync(driverPath)) return Promise.resolve();

    return new Promise(resolve => {
        execFile("pnputil.exe", ["/add-driver", driverPath, "/install"], { windowsHide: true }, () => resolve());
    });
}
function setVirtualDisplayMode() {
    const command = `
$code=@"
using System;
using System.Runtime.InteropServices;
public static class ScftDisplayModeApi {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DISPLAY_DEVICE { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString; public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DEVMODE { [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName; public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields; public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput; public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName; public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevices(IntPtr lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, int dwflags, IntPtr lParam);
}
"@;
Add-Type $code;
$DM_PELSWIDTH=0x80000;
$DM_PELSHEIGHT=0x100000;
$DM_DISPLAYFREQUENCY=0x400000;
$CDS_UPDATEREGISTRY=0x1;
for($i=0;$i -lt 20;$i++){
  $d=New-Object ScftDisplayModeApi+DISPLAY_DEVICE;
  $d.cb=[Runtime.InteropServices.Marshal]::SizeOf([type]'ScftDisplayModeApi+DISPLAY_DEVICE');
   if(-not [ScftDisplayModeApi]::EnumDisplayDevices([IntPtr]::Zero,$i,[ref]$d,0)){ break }
    if($d.DeviceString -notmatch '^(Virtual Display Driver|SCFT Virtual Display)$' -and $d.DeviceID -notmatch '^Root\\MttVDD$|SCFTVirtualDisplayDriver'){ continue }
   $supports1600=$false;
   for($mode=0;$mode -lt 256;$mode++){
     $candidate=New-Object ScftDisplayModeApi+DEVMODE;
     $candidate.dmSize=[Runtime.InteropServices.Marshal]::SizeOf([type]'ScftDisplayModeApi+DEVMODE');
     if(-not [ScftDisplayModeApi]::EnumDisplaySettings($d.DeviceName,$mode,[ref]$candidate)){ break }
     if($candidate.dmPelsWidth -eq 2560 -and $candidate.dmPelsHeight -eq 1600 -and $candidate.dmDisplayFrequency -eq 60){ $supports1600=$true; break }
   }
   $targetWidth=if($supports1600){2560}else{2560};
   $targetHeight=if($supports1600){1600}else{1440};
   $m=New-Object ScftDisplayModeApi+DEVMODE;
  $m.dmSize=[Runtime.InteropServices.Marshal]::SizeOf([type]'ScftDisplayModeApi+DEVMODE');
  [void][ScftDisplayModeApi]::EnumDisplaySettings($d.DeviceName,-1,[ref]$m);
   if($m.dmPelsWidth -eq $targetWidth -and $m.dmPelsHeight -eq $targetHeight -and $m.dmDisplayFrequency -eq 60){ continue }
   $m.dmPelsWidth=$targetWidth;
   $m.dmPelsHeight=$targetHeight;
  $m.dmDisplayFrequency=60;
  $m.dmFields=$DM_PELSWIDTH -bor $DM_PELSHEIGHT -bor $DM_DISPLAYFREQUENCY;
  [void][ScftDisplayModeApi]::ChangeDisplaySettingsEx($d.DeviceName,[ref]$m,[IntPtr]::Zero,$CDS_UPDATEREGISTRY,[IntPtr]::Zero);
}`;
    return new Promise(resolve => {
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true }, () => resolve());
    });
}
async function startVirtualDisplay() {
    return ensureVirtualDisplay();
}

function stopVirtualDisplay() {
    // Stopping a session must not uninstall or disable VDD. Windows may still
    // have application windows positioned on the virtual monitor.
    return Promise.resolve({ stopped: true, driverKept: true });
}

function getBundledResourcePath(name) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, name);
    }

    return path.join(__dirname, 'build-resources', name);
}

function copyDirectoryIfAvailable(source, destination) {
    if (!fs.existsSync(source)) return false;

    const marker = path.join(destination, '.scft-version');
    const expectedVersion = app.getVersion();
    const existingVersion = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';

    if (fs.existsSync(destination) && existingVersion !== expectedVersion) {
        fs.rmSync(destination, { recursive: true, force: true });
    }

    if (!fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(source, destination, { recursive: true });
        fs.writeFileSync(marker, expectedVersion);
    }

    return true;
}

function prepareBundledRuntime() {
    const runtimeRoot = path.join(app.getPath('userData'), 'runtime');
    const javaSource = getBundledResourcePath('java-runtime');
    const adbSource = getBundledResourcePath('platform-tools');
    const javaTarget = path.join(runtimeRoot, 'java-runtime');
    const adbTarget = path.join(runtimeRoot, 'platform-tools');

    copyDirectoryIfAvailable(javaSource, javaTarget);
    copyDirectoryIfAvailable(adbSource, adbTarget);

    runtimePaths = {
        java: path.join(javaTarget, 'bin', 'java.exe'),
        adb: path.join(adbTarget, 'adb.exe')
    };

    if (fs.existsSync(runtimePaths.adb)) {
        process.env.SCFT_ADB_PATH = runtimePaths.adb;
    }
}

function getBundledBackendOutPath() {
    return path.join('backend', 'out');
}

function prepareScreenStreamEncoder() {
    if (!process.env.SCFT_H264_ENCODER) {
        process.env.SCFT_H264_ENCODER = 'auto';
    }

    if (process.env.SCFT_FFMPEG_PATH && fs.existsSync(process.env.SCFT_FFMPEG_PATH)) return;
    const bundled = app.isPackaged
        ? path.join(process.resourcesPath, 'ffmpeg', 'bin', 'ffmpeg.exe')
        : path.join(__dirname, 'build-resources', 'ffmpeg', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(bundled)) {
        process.env.SCFT_FFMPEG_PATH = bundled;
        return;
    }
    try {
        const result = execFileSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8', windowsHide: true });
        const executable = result.split(/\r?\n/).find(Boolean);
        if (executable && fs.existsSync(executable)) process.env.SCFT_FFMPEG_PATH = executable.trim();
    } catch (_) {
    }
}
function startBackend() {
    if (backendProcess) return;
    prepareScreenStreamEncoder();

    const scriptPath = path.join(__dirname, 'backend', 'run.ps1');
    const backendDataPath = path.join(app.getPath('userData'), 'backend');
    const backendStoragePath = path.join(backendDataPath, 'storage');
    const backendOutPath = getBundledBackendOutPath();
    const backendArgs = [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Port',
        '7878',
        '-Storage',
        backendStoragePath,
        '-OutDir',
        backendOutPath
    ];

    if (app.isPackaged) {
        backendArgs.push('-SkipCompile');
    }

    if (runtimePaths && fs.existsSync(runtimePaths.java)) {
        backendArgs.push('-JavaExe', runtimePaths.java);
    }

    backendProcess = spawn('powershell.exe', backendArgs, {
        cwd: __dirname,
        windowsHide: true,
        stdio: 'ignore'
    });

    backendProcess.on('exit', () => {
        backendProcess = null;
    });
}

function stopBackend() {
    if (!backendProcess) return;
    backendProcess.kill();
    backendProcess = null;
}

function getAdbCandidates() {
    const candidates = [
        runtimePaths ? runtimePaths.adb : '',
        process.env.SCFT_ADB_PATH || '',
        path.join(getBundledResourcePath('platform-tools'), 'adb.exe'),
        'adb.exe',
        'adb'
    ];
    const localAppData = process.env.LOCALAPPDATA;
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

    if (androidHome) {
        candidates.unshift(path.join(androidHome, 'platform-tools', 'adb.exe'));
    }

    if (localAppData) {
        candidates.unshift(path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
    }

    candidates.unshift(path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'));

    return [...new Set(candidates.filter(Boolean))];
}

function runAdb(args, callback) {
    const candidates = getAdbCandidates();

    function tryCandidate(index) {
        if (index >= candidates.length) {
            callback(new Error('adb not found'));
            return;
        }

        execFile(candidates[index], args, { windowsHide: true }, (error, stdout, stderr) => {
            if (error && error.code === 'ENOENT') {
                tryCandidate(index + 1);
                return;
            }
            callback(error, stdout, stderr, candidates[index]);
        });
    }

    tryCandidate(0);
}

function startUsbTunnel() {
    runAdb(['devices'], (error, stdout) => {
        if (error) return;

        const hasDevice = stdout
            .split(/\r?\n/)
            .some(line => /\tdevice$/.test(line.trim()));

        if (!hasDevice) return;

        runAdb(['reverse', 'tcp:7878', 'tcp:7878'], () => {});
    });
}

function runAdbPromise(args) {
    const candidates = getAdbCandidates();
    return new Promise((resolve, reject) => {
        const tryCandidate = index => {
            if (index >= candidates.length) {
                const error = new Error('Không tìm thấy ADB.');
                error.code = 'ADB_NOT_FOUND';
                reject(error);
                return;
            }
            execFile(candidates[index], args, { windowsHide: true }, (error, stdout, stderr) => {
                if (error && error.code === 'ENOENT') {
                    tryCandidate(index + 1);
                    return;
                }
                if (error) {
                    const failure = new Error((stderr || stdout || error.message || '').trim());
                    failure.code = error.code || 'ADB_COMMAND_FAILED';
                    reject(failure);
                    return;
                }
                resolve({ stdout: (stdout || '').trim(), command: candidates[index] });
            });
        };
        tryCandidate(0);
    });
}

function emitPcScreenProgress(event, step, message, extra = {}) {
    event.sender.send('scft-pc-screen-progress', { step, message, ...extra });
}

async function getAuthorizedAdbDevice() {
    const result = await runAdbPromise(['devices']);
    const lines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const unauthorized = lines.some(line => /\tunauthorized$/.test(line) || /\sunauthorized$/.test(line));
    const deviceLine = lines.find(line => /\tdevice$/.test(line) || /\sdevice$/.test(line));
    if (!deviceLine) {
        const error = new Error(unauthorized
            ? 'Điện thoại chưa được cấp quyền ADB. Hãy mở khóa và chấp nhận thông báo gỡ lỗi USB.'
            : 'Chưa có điện thoại ADB được cấp quyền. Hãy kết nối điện thoại bằng cáp USB.');
        error.code = unauthorized ? 'ADB_UNAUTHORIZED' : 'ADB_DEVICE_NOT_FOUND';
        throw error;
    }
    return deviceLine.split(/\s+/)[0];
}

async function isAndroidLocked(serial) {
    const [windowState, activityState, powerState] = await Promise.all([
        runAdbPromise(['-s', serial, 'shell', 'dumpsys', 'window', 'windows']),
        runAdbPromise(['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']),
        runAdbPromise(['-s', serial, 'shell', 'dumpsys', 'power'])
    ]);
    const state = `${windowState.stdout}\n${activityState.stdout}\n${powerState.stdout}`;
    return /mKeyguardShowing(?:=|\s+)(true)|isKeyguardShowing(?:=|\s+)(true)|isStatusBarKeyguard(?:=|\s+)(true)|mDreamingLockscreen(?:=|\s+)(true)|KeyguardShowing=true|mWakefulness=(?:Asleep|Dozing)/i.test(state);
}

async function backendJson(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error || `HTTP ${response.status}`);
        error.code = body.errorCode || `HTTP_${response.status}`;
        throw error;
    }
    return body;
}

async function deleteBackendSession(sessionId) {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    await fetch(`http://127.0.0.1:7878/api/screen/session${suffix}`, { method: 'DELETE' }).catch(() => {});
}

async function failBackendPcScreenSession(sessionId, generation, code) {
    if (!sessionId || !generation) return;
    const query = new URLSearchParams({
        sessionId,
        generation: String(generation),
        state: 'error',
        errorCode: code || 'STREAM_STALLED'
    });
    await fetch(`http://127.0.0.1:7878/api/screen/telemetry?${query}`, { method: 'POST' }).catch(() => {});
}

async function waitForPcScreenStreaming(event, sessionId, timeoutMs, operation = null) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (operation?.cancelled) {
            const cancelled = new Error('PC Screen operation was cancelled.');
            cancelled.code = 'PC_SCREEN_STOPPED';
            throw cancelled;
        }
        const session = await backendJson('http://127.0.0.1:7878/api/screen/session');
        if (!session || session.sessionId !== sessionId) return { session: null, ok: false };
        if (session.state === 'streaming') return { session, ok: true };
        if (session.state === 'error' || session.state === 'stopped') return { session, ok: false };
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return { session: await backendJson('http://127.0.0.1:7878/api/screen/session').catch(() => null), ok: false };
}

function stopPcScreenMonitor() {
    if (pcScreenMonitorTimer) clearInterval(pcScreenMonitorTimer);
    pcScreenMonitorTimer = null;
    pcScreenMonitorBusy = false;
    if (pcScreenActive) pcScreenActive.cancelled = true;
    pcScreenActive = null;
}

async function recoverPcScreenSession(event, active) {
    emitPcScreenProgress(event, 'recovering', 'Luồng H264 bị gián đoạn, đang thử kết nối lại...');
    const presets = [active.presetId, active.presetId];
    if (active.presetId !== 'zero_latency') presets.push('zero_latency');
    let failedSessionId = active.sessionId;
    for (let index = 0; index < presets.length; index++) {
        if (pcScreenActive !== active || active.cancelled) {
            const cancelled = new Error('PC Screen recovery was cancelled.');
            cancelled.code = 'PC_SCREEN_STOPPED';
            throw cancelled;
        }
        const presetId = presets[index];
        await runAdbPromise(['-s', active.serial, 'shell', 'am', 'force-stop', 'com.example.myapplication']).catch(() => {});
        await deleteBackendSession(failedSessionId);
        failedSessionId = '';
        try {
            const result = await launchPcScreenAttempt(event, active.serial, active.config, presetId, index + 1, active);
            if (pcScreenActive !== active || active.cancelled) {
                await deleteBackendSession(result.sessionId || '');
                const cancelled = new Error('PC Screen recovery was cancelled.');
                cancelled.code = 'PC_SCREEN_STOPPED';
                throw cancelled;
            }
            if (result.ok) {
                active.sessionId = result.sessionId;
                active.presetId = presetId;
                emitPcScreenProgress(event, 'streaming', 'Đã khôi phục kết nối H264.', { effectivePreset: presetId, sessionId: result.sessionId });
                return result.session;
            }
            failedSessionId = result.sessionId || '';
        } catch (error) {
            failedSessionId = error.sessionId || '';
        }
    }
    const failedSession = await backendJson('http://127.0.0.1:7878/api/screen/session').catch(() => null);
    if (failedSession?.sessionId === failedSessionId) {
        await failBackendPcScreenSession(failedSession.sessionId, failedSession.generation, 'STREAM_STALLED');
    }
    const error = new Error('Không thể khôi phục luồng H264. Hãy bấm Thử lại.');
    error.code = 'STREAM_STALLED';
    throw error;
}

function startPcScreenMonitor(event, serial, config, presetId, sessionId) {
    stopPcScreenMonitor();
    pcScreenActive = { serial, config: { ...config }, presetId, sessionId, cancelled: false };
    pcScreenMonitorTimer = setInterval(async () => {
        const active = pcScreenActive;
        if (!active || pcScreenRecoveryPromise || pcScreenMonitorBusy) return;
        pcScreenMonitorBusy = true;
        try {
            const session = await backendJson('http://127.0.0.1:7878/api/screen/session');
            if (!session || session.sessionId !== active.sessionId) return;
            if (session.state !== 'recovering' && session.state !== 'error') return;
            pcScreenRecoveryPromise = recoverPcScreenSession(event, active)
                .catch(error => {
                    stopPcScreenMonitor();
                    if (error.code !== 'PC_SCREEN_STOPPED') {
                        emitPcScreenProgress(event, 'error', error.message || 'Không thể khôi phục luồng H264.', { code: error.code || 'STREAM_STALLED' });
                    }
                })
                .finally(() => {
                    pcScreenRecoveryPromise = null;
                });
        } catch (_) {
            // The next monitor tick retries after a transient backend failure.
        } finally {
            pcScreenMonitorBusy = false;
        }
    }, 1000);
}

async function launchPcScreenAttempt(event, serial, config, presetId, attempt, operation = null) {
    emitPcScreenProgress(event, 'session', `Đang tạo phiên H264 (${presetId}, lần thử ${attempt})...`, { presetId, attempt });
    const query = new URLSearchParams({
        display: String(config.displayIndex),
        displayId: config.displayId || '',
        preset: presetId,
        requestedPreset: config.presetId || presetId,
        transport: 'usb',
        attempt: String(attempt)
    });
    let session = null;
    try {
        session = await backendJson(`http://127.0.0.1:7878/api/screen/session?${query}`, { method: 'POST' });
        const args = [
            '-s', serial, 'shell', 'am', 'start', '-S', '-n', 'com.example.myapplication/.MainActivity',
            '--es', 'scft_screen', 'pc',
            '--ei', 'scft_display', String(config.displayIndex),
            '--es', 'scft_display_id', config.displayId || '',
            '--es', 'scft_preset', presetId,
            '--es', 'scft_session_id', session.sessionId,
            '--el', 'scft_generation', String(session.generation || 0),
            '--ei', 'scft_attempt', String(attempt),
            '--ez', 'scft_autostart', 'true',
            '--es', 'scft_base_url', 'http://127.0.0.1:7878'
        ];
        emitPcScreenProgress(event, 'launch', 'Đang khởi chạy viewer trên điện thoại...', { presetId, attempt, sessionId: session.sessionId });
        await runAdbPromise(args);
        emitPcScreenProgress(event, 'connecting', 'Đang chờ frame H264 đầu tiên...', { presetId, attempt, sessionId: session.sessionId });
        const result = await waitForPcScreenStreaming(event, session.sessionId, 12000, operation);
        return { ...result, sessionId: session.sessionId };
    } catch (error) {
        if (session?.sessionId) error.sessionId = session.sessionId;
        throw error;
    }
}

function assertPcScreenOperation(operation) {
    if (!operation?.cancelled) return;
    const cancelled = new Error('PC Screen operation was cancelled.');
    cancelled.code = 'PC_SCREEN_STOPPED';
    throw cancelled;
}

async function applyPcScreen(event, config) {
    if (pcScreenOperation || pcScreenRecoveryPromise) {
        const error = new Error('PC Screen đang có một thao tác khác.');
        error.code = 'PC_SCREEN_BUSY';
        throw error;
    }
    const operation = { cancelled: false, serial: null };
    pcScreenOperation = operation;
    let activeSessionId = '';
    let serial = null;
    try {
        emitPcScreenProgress(event, 'driver', 'Đang kiểm tra màn hình ảo...');
        await ensureVirtualDisplay();
        assertPcScreenOperation(operation);
        emitPcScreenProgress(event, 'adb', 'Đang kiểm tra điện thoại USB/ADB...');
        serial = await getAuthorizedAdbDevice();
        operation.serial = serial;
        assertPcScreenOperation(operation);
        if (await isAndroidLocked(serial)) {
            const error = new Error('Điện thoại đang khóa. Hãy tự mở khóa điện thoại rồi bấm Thử lại.');
            error.code = 'PHONE_LOCKED';
            throw error;
        }
        assertPcScreenOperation(operation);
        emitPcScreenProgress(event, 'usb', 'Đang thiết lập kết nối USB...');
        try {
            await runAdbPromise(['-s', serial, 'reverse', 'tcp:7878', 'tcp:7878']);
        } catch (error) {
            error.code = 'USB_REVERSE_FAILED';
            error.message = 'Không thể thiết lập ADB reverse qua USB. Hãy kiểm tra cáp USB rồi bấm Thử lại.';
            throw error;
        }
        assertPcScreenOperation(operation);
        stopPcScreenMonitor();
        await runAdbPromise(['-s', serial, 'shell', 'am', 'force-stop', 'com.example.myapplication']).catch(() => {});
        await deleteBackendSession('');
        assertPcScreenOperation(operation);

        const requestedPreset = config.presetId || 'balanced';
        const presets = [requestedPreset, requestedPreset];
        if (requestedPreset !== 'zero_latency') presets.push('zero_latency');
        let previousPreset = '';
        for (let index = 0; index < presets.length; index++) {
            assertPcScreenOperation(operation);
            const presetId = presets[index];
            if (presetId !== previousPreset && previousPreset) {
                emitPcScreenProgress(event, 'fallback', 'Preset hiện tại không ổn định, chuyển sang Không độ trễ...', { presetId });
            }
            previousPreset = presetId;
            await runAdbPromise(['-s', serial, 'shell', 'am', 'force-stop', 'com.example.myapplication']).catch(() => {});
            assertPcScreenOperation(operation);
            let result;
            try {
                result = await launchPcScreenAttempt(event, serial, config, presetId, index + 1, operation);
            } catch (error) {
                activeSessionId = error.sessionId || '';
                if (index < presets.length - 1) {
                    await deleteBackendSession(activeSessionId);
                    activeSessionId = '';
                    continue;
                }
                throw error;
            }
            activeSessionId = result.sessionId || '';
            if (result.ok) {
                emitPcScreenProgress(event, 'streaming', 'Điện thoại đang nhận màn hình PC.', { presetId, effectivePreset: presetId, sessionId: activeSessionId });
                startPcScreenMonitor(event, serial, config, presetId, activeSessionId);
                return { ...result.session, requestedPreset, effectivePreset: presetId };
            }
            if (index < presets.length - 1) {
                await deleteBackendSession(activeSessionId);
                activeSessionId = '';
            }
        }
        const error = new Error('Không thể nhận frame H264. Hãy kiểm tra điện thoại, cáp USB rồi bấm Thử lại.');
        error.code = 'STARTUP_TIMEOUT';
        throw error;
    } catch (error) {
        await runAdbPromise(['-s', serial, 'shell', 'am', 'force-stop', 'com.example.myapplication']).catch(() => {});
        throw error;
    } finally {
        pcScreenOperation = null;
    }
}

async function stopPcScreen(event) {
    emitPcScreenProgress(event, 'stopping', 'Đang dừng truyền hình...');
    const operation = pcScreenOperation;
    if (operation) operation.cancelled = true;
    const recovery = pcScreenRecoveryPromise;
    stopPcScreenMonitor();
    const serial = operation?.serial || await getAuthorizedAdbDevice().catch(() => null);
    if (serial) await runAdbPromise(['-s', serial, 'shell', 'am', 'force-stop', 'com.example.myapplication']).catch(() => {});
    await deleteBackendSession('');
    if (recovery) await recovery.catch(() => {});
    emitPcScreenProgress(event, 'stopped', 'Đã dừng truyền hình. Màn hình ảo vẫn được giữ lại.');
    return { stopped: true, driverKept: true };
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('web_app/index.html');
    win.removeMenu();
}

function createPopoutWindow(adbPath) {
    if (popoutWindow && !popoutWindow.isDestroyed()) {
        popoutWindow.focus();
        return;
    }

    popoutWindow = new BrowserWindow({
        width: 480,
        height: 854,
        minWidth: 240,
        minHeight: 320,
        alwaysOnTop: true,
        title: 'SCFT - Screen Preview',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const queryParams = adbPath ? `?adbPath=${encodeURIComponent(adbPath)}` : '';
    popoutWindow.loadFile('web_app/SC_Popout.html', {
        search: queryParams
    });

    popoutWindow.on('closed', () => {
        popoutWindow = null;
    });
}

app.whenReady().then(() => {
    prepareBundledRuntime();
    startBackend();
    startUsbTunnel();
    createWindow();

    ipcMain.handle('scft-virtual-display-start', async () => startVirtualDisplay());
    ipcMain.handle('scft-virtual-display-stop', async () => stopVirtualDisplay());
    ipcMain.handle('scft-pc-screen-apply', async (event, config) => applyPcScreen(event, config || {}));
    ipcMain.handle('scft-pc-screen-stop', async event => stopPcScreen(event));
    ipcMain.handle('scft-virtual-display-open-installer', async () => {
        if (launchVddControl()) return { opened: true, local: true };
        await shell.openExternal(VDD_RELEASE_URL);
        return { opened: true, local: false };
    });
    ipcMain.handle('scft-virtual-display-repair', async () => {
        await startVddRepair();
        return { started: true };
    });

    ipcMain.on('open-popout-window', (event, data) => {
        const adbPath = (data && data.adbPath) || (process.env.SCFT_ADB_PATH || '');
        createPopoutWindow(adbPath);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    stopBackend();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
