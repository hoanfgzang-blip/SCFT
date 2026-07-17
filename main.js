const { app, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let backendProcess = null;
let runtimePaths = null;

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
    return path.join(__dirname, 'backend', 'out');
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

app.whenReady().then(() => {
    prepareBundledRuntime();
    startBackend();
    startUsbTunnel();
    createWindow();

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
