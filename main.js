const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let backendProcess = null;
let virtualDisplayProcess = null;
let runtimePaths = null;

function waitForVirtualDisplay(timeoutMs) {
    return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            if (screen.getAllDisplays().length > 1 || Date.now() >= deadline) {
                resolve();
                return;
            }
            setTimeout(check, 250);
        };
        check();
    });
}

function getVirtualDisplayAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'virtual-display', 'SCFTVirtualDisplayApp.exe');
    }

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
async function startVirtualDisplay() {
    if (virtualDisplayProcess || screen.getAllDisplays().length > 1) return;

    const appPath = getVirtualDisplayAppPath();
    if (!fs.existsSync(appPath)) return;

    if (app.isPackaged) {
        virtualDisplayProcess = spawn(appPath, [], {
            windowsHide: true,
            stdio: 'ignore'
        });

        virtualDisplayProcess.on('exit', () => {
            virtualDisplayProcess = null;
        });
    } else {
        const command = `Start-Process -FilePath '${appPath.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden`;
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
            windowsHide: true
        });
    }

    await waitForVirtualDisplay(8000);
}

function stopVirtualDisplay() {
    if (virtualDisplayProcess) {
        virtualDisplayProcess.kill();
        virtualDisplayProcess = null;
        return Promise.resolve();
    }

    if (app.isPackaged) return Promise.resolve();

    const command = "Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/IM','SCFTVirtualDisplayApp.exe' -Verb RunAs -Wait -WindowStyle Hidden";
    return new Promise(resolve => {
        execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true }, () => resolve());
    });
}function getBundledResourcePath(name) {
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
    if (!app.isPackaged) {
        runtimePaths = null;
        return;
    }

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

function startBackend() {
    if (backendProcess) return;

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

function startUsbTunnel(port) {
    runAdb(['devices'], (error, stdout) => {
        if (error) return;

        const hasDevice = stdout
            .split(/\r?\n/)
            .some(line => /\tdevice$/.test(line.trim()));

        if (!hasDevice) return;
        runAdb(['reverse', `tcp:${port}`, `tcp:${port}`], () => {});
    });
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
}


ipcMain.handle("scft-virtual-display-start", async () => {
    await installVirtualDisplayDriver();
    await startVirtualDisplay();
    return screen.getAllDisplays().length;
});

ipcMain.handle("scft-virtual-display-stop", async () => {
    await stopVirtualDisplay();
    return screen.getAllDisplays().length;
});
app.whenReady().then(async () => {
    prepareBundledRuntime();
    await installVirtualDisplayDriver();
    await startVirtualDisplay();
    startBackend();
    startUsbTunnel(7878);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    stopVirtualDisplay();
    stopBackend();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});