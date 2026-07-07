const BACKEND_URL = "http://127.0.0.1:7878";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

let selectedFile = null;
let backendOnline = false;

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("file_input");
    const dropZone = document.getElementById("drop_zone");
    const uploadBtn = document.getElementById("upload_btn");
    const clearBtn = document.getElementById("clear_file_btn");
    const refreshBtn = document.getElementById("refresh_files_btn");
    const backendBtn = document.getElementById("open_backend_btn");

    fileInput.addEventListener("change", event => {
        setSelectedFile(event.target.files[0] || null);
    });

    dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("dragging");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragging");
    });

    dropZone.addEventListener("drop", event => {
        event.preventDefault();
        dropZone.classList.remove("dragging");
        setSelectedFile(event.dataTransfer.files[0] || null);
    });

    uploadBtn.addEventListener("click", uploadSelectedFile);
    clearBtn.addEventListener("click", clearSelectedFile);
    refreshBtn.addEventListener("click", loadFiles);
    backendBtn.addEventListener("click", () => window.open(`${BACKEND_URL}/api/health`, "_blank"));

    initFileTransfer();
});

async function initFileTransfer() {
    await checkBackend();
    await loadFiles();
}

async function checkBackend() {
    const statusText = document.getElementById("backend_status_text");
    const statusBadge = document.getElementById("backend_status_badge");

    try {
        const [healthResponse, deviceResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/health`),
            fetch(`${BACKEND_URL}/api/device`)
        ]);

        if (!healthResponse.ok || !deviceResponse.ok) {
            throw new Error("Backend is not ready");
        }

        const device = await deviceResponse.json();
        backendOnline = true;
        statusText.textContent = `Backend online at ${BACKEND_URL}`;
        statusBadge.textContent = "Online";
        statusBadge.classList.remove("offline");
        statusBadge.classList.add("online");
        document.getElementById("device_id_text").textContent = device.id || "-";
        document.getElementById("device_ip_text").textContent = device.ip || "-";
        document.getElementById("device_port_text").textContent = device.port || "7878";
    } catch (error) {
        backendOnline = false;
        statusText.textContent = "Backend offline. Start backend/run.ps1 first.";
        statusBadge.textContent = "Offline";
        statusBadge.classList.remove("online");
        statusBadge.classList.add("offline");
        document.getElementById("device_id_text").textContent = "-";
        document.getElementById("device_ip_text").textContent = "-";
        document.getElementById("device_port_text").textContent = "7878";
    }

    updateUploadControls();
}

async function loadFiles() {
    const tbody = document.getElementById("files_tbody");
    const emptyState = document.getElementById("empty_files");
    const tableWrapper = document.getElementById("files_table_wrapper");
    const fileCountText = document.getElementById("file_count_text");

    tbody.innerHTML = "";

    try {
        const response = await fetch(`${BACKEND_URL}/api/files`);
        if (!response.ok) {
            throw new Error("Cannot load files");
        }

        const data = await response.json();
        const files = data.files || [];
        fileCountText.textContent = `${files.length} ${files.length === 1 ? "file" : "files"}`;

        if (files.length === 0) {
            emptyState.classList.remove("hidden");
            tableWrapper.classList.add("hidden");
            return;
        }

        files.forEach(file => {
            tbody.appendChild(createFileRow(file));
        });

        emptyState.classList.add("hidden");
        tableWrapper.classList.remove("hidden");
    } catch (error) {
        fileCountText.textContent = "0 files";
        emptyState.textContent = "Cannot load files. Backend may be offline.";
        emptyState.classList.remove("hidden");
        tableWrapper.classList.add("hidden");
    }
}

function createFileRow(file) {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.className = "file-name-cell";
    nameCell.textContent = file.originalName || "-";

    const sizeCell = document.createElement("td");
    sizeCell.textContent = formatBytes(file.size || 0);

    const senderCell = document.createElement("td");
    senderCell.textContent = file.senderDeviceId || "-";

    const uploadedCell = document.createElement("td");
    uploadedCell.textContent = formatDate(file.uploadedAt);

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "file-actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "file-action-btn";
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => {
        window.open(`${BACKEND_URL}${file.downloadUrl}`, "_blank");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "file-action-btn danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteFile(file.id));

    actions.appendChild(downloadBtn);
    actions.appendChild(deleteBtn);
    actionsCell.appendChild(actions);

    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(senderCell);
    row.appendChild(uploadedCell);
    row.appendChild(actionsCell);

    return row;
}

function setSelectedFile(file) {
    selectedFile = file;
    const nameText = document.getElementById("selected_file_name");
    const metaText = document.getElementById("selected_file_meta");
    const message = document.getElementById("upload_message");

    resetProgress();
    message.textContent = "";
    message.className = "status-message";

    if (!file) {
        nameText.textContent = "Choose a file";
        metaText.textContent = "Click to browse or drop a file here";
        updateUploadControls();
        return;
    }

    nameText.textContent = file.name;
    metaText.textContent = `${formatBytes(file.size)} • ${file.type || "Unknown type"}`;

    if (file.size > MAX_UPLOAD_BYTES) {
        setUploadMessage("File is larger than 2GB.", "error");
    }

    updateUploadControls();
}

function clearSelectedFile() {
    selectedFile = null;
    document.getElementById("file_input").value = "";
    setSelectedFile(null);
}

function updateUploadControls() {
    const uploadBtn = document.getElementById("upload_btn");
    const clearBtn = document.getElementById("clear_file_btn");
    const canUpload = backendOnline && selectedFile && selectedFile.size <= MAX_UPLOAD_BYTES;
    uploadBtn.disabled = !canUpload;
    clearBtn.disabled = !selectedFile;
}

function uploadSelectedFile() {
    if (!selectedFile || !backendOnline || selectedFile.size > MAX_UPLOAD_BYTES) {
        return;
    }

    const uploadBtn = document.getElementById("upload_btn");
    const progressBar = document.getElementById("upload_progress_bar");
    const request = new XMLHttpRequest();
    const filename = encodeURIComponent(selectedFile.name);

    uploadBtn.disabled = true;
    setUploadMessage("Uploading...", "");

    request.open("POST", `${BACKEND_URL}/api/files?filename=${filename}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-Device-Id", localStorage.getItem("SCFT_DeviceID") || "desktop");

    request.upload.addEventListener("progress", event => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            progressBar.style.width = `${percent}%`;
        }
    });

    request.addEventListener("load", async () => {
        if (request.status >= 200 && request.status < 300) {
            progressBar.style.width = "100%";
            setUploadMessage("Upload completed.", "success");
            clearSelectedFile();
            await loadFiles();
        } else {
            setUploadMessage(parseErrorMessage(request.responseText), "error");
        }
        updateUploadControls();
    });

    request.addEventListener("error", () => {
        setUploadMessage("Upload failed. Check backend connection.", "error");
        updateUploadControls();
    });

    request.send(selectedFile);
}

async function deleteFile(id) {
    if (!id) {
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/files/${id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("Delete failed");
        }

        await loadFiles();
    } catch (error) {
        setUploadMessage("Cannot delete file. Backend may be offline.", "error");
    }
}

function setUploadMessage(text, type) {
    const message = document.getElementById("upload_message");
    message.textContent = text;
    message.className = `status-message ${type || ""}`;
}

function resetProgress() {
    document.getElementById("upload_progress_bar").style.width = "0";
}

function parseErrorMessage(raw) {
    try {
        return JSON.parse(raw).error || "Request failed.";
    } catch (error) {
        return "Request failed.";
    }
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) {
        return `${value} B`;
    }

    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size = size / 1024;
        unitIndex++;
    }

    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDate(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString();
}
