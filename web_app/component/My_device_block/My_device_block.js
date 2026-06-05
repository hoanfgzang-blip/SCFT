function getDeviceIcon(deviceType) {
    if (deviceType === "smartphone") {
        return `
        <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 18.01V18M8 3H16C17.1046 3 18 3.89543 18 5V19C18 20.1046 17.1046 21 16 21H8C6.89543 21 6 20.1046 6 19V5C6 3.89543 6.89543 3 8 3Z" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
        `
    }
    else if (deviceType === "tablet") {
        return `
       <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 18H12.01M8.2 21H15.8C16.9201 21 17.4802 21 17.908 20.782C18.2843 20.5903 18.5903 20.2843 18.782 19.908C19 19.4802 19 18.9201 19 17.8V6.2C19 5.0799 19 4.51984 18.782 4.09202C18.5903 3.71569 18.2843 3.40973 17.908 3.21799C17.4802 3 16.9201 3 15.8 3H8.2C7.0799 3 6.51984 3 6.09202 3.21799C5.71569 3.40973 5.40973 3.71569 5.21799 4.09202C5 4.51984 5 5.07989 5 6.2V17.8C5 18.9201 5 19.4802 5.21799 19.908C5.40973 20.2843 5.71569 20.5903 6.09202 20.782C6.51984 21 7.07989 21 8.2 21Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
        `
    }
    return ``;
}
function createDeviceCard(device) {
    return `
    <div class="device-card ${device.status}" onclick="handleDeviceClick('${device.id}')">
            <div class="device-card ${device.status}">
                <div class="device-icon">
                    ${getDeviceIcon(device.deviceType)}
                </div>
                <div class="device-info">
                    <h4>${device.name}</h4>
                    <p>ID: ${device.id}</p>
                </div>
                <div class="device-status">
                    <span class="status-dot"></span>
                    <span>${device.status}</span>
                </div>
            </div>
        </div>
    `;
}

function renderConnectingDevice(device) {
    const container = document.getElementById("connecting_device");
    if (!container) return;

    let htmlContent = "";
    device.forEach(device => {
        if (device.using === true) {
            htmlContent += createDeviceCard(device);
        }
    });
    container.innerHTML = htmlContent;
}

let currentDevices = [];
function handleDeviceClick(deviceId) {
    const targetDevice = currentDevices.find(d => d.id === deviceId);

    if (targetDevice.using === true) {
        targetDevice.using = false;
    } else if (targetDevice.using === false&& targetDevice.status === "online") {
        currentDevices.forEach(d => d.using = false);
        targetDevice.using = true;
    }
    renderConnectingDevice(currentDevices);
    renderMyDevices(currentDevices);
}
function renderMyDevices(device) {
    const container = document.getElementById("my_device");
    if (!container) return;

    let htmlContent = "";
    device.forEach(device => {
        if (device.using === false) {
            htmlContent += createDeviceCard(device);
        }
    });
    container.innerHTML = htmlContent;
}

async function initDevices() {
    try {
        const response = await fetch('./mockData/device.json');
        currentDevices = await response.json();

        // Giao việc cho 2 hàm con chạy song song với cùng 1 nguồn dữ liệu
        renderConnectingDevice(currentDevices);
        renderMyDevices(currentDevices);

    } catch (error) {
        console.error("lỗi: ", error);
    }
}  
initDevices();