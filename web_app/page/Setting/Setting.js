// ==========================================
// 1. CÁC HÀM DÙng lại
// ==========================================
function localSaver(key, value) {
    localStorage.setItem(key, value);
}

function localLoader(key, defaultValue) {
    return localStorage.getItem(key) || defaultValue;
}

// Hàm tô màu thanh trượt. Tham số truyền vào phải là thẻ <input> (Element)
function updateSliderColor(sliderElement) {
    const val = sliderElement.value;
    const min = sliderElement.min || 0;
    const max = sliderElement.max || 100;
    const percentage = (val - min) / (max - min) * 100;
    sliderElement.style.background = `linear-gradient(to right, #000 ${percentage}%, #e0e0e0 ${percentage}%)`;
}


// ==========================================
// 2. KHỞI ĐỘNG SAU KHI HTML LOAD XONG
// ==========================================
document.addEventListener("DOMContentLoaded", () => {

    // ----------------------------------------
    // KHỐI 1: DEVICE IDENTIFY
    // ----------------------------------------
    const nameInput = document.getElementById('device_name_input');
    const editBtn = document.getElementById('edit_device_name');
    let isEditing = false;

    const savedName = localLoader('SCFT_DeviceName', 'My_laptop');
    nameInput.value = savedName;

    editBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        if (isEditing) {
            nameInput.removeAttribute('disabled');
            nameInput.focus();
            editBtn.innerHTML = `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.1716 1C18.702 1 19.2107 1.21071 19.5858 1.58579L22.4142 4.41421C22.7893 4.78929 23 5.29799 23 5.82843V20C23 21.6569 21.6569 23 20 23H4C2.34315 23 1 21.6569 1 20V4C1 2.34315 2.34315 1 4 1H18.1716ZM4 3C3.44772 3 3 3.44772 3 4V20C3 20.5523 3.44772 21 4 21L5 21L5 15C5 13.3431 6.34315 12 8 12L16 12C17.6569 12 19 13.3431 19 15V21H20C20.5523 21 21 20.5523 21 20V6.82843C21 6.29799 20.7893 5.78929 20.4142 5.41421L18.5858 3.58579C18.2107 3.21071 17.702 3 17.1716 3H17V5C17 6.65685 15.6569 8 14 8H10C8.34315 8 7 6.65685 7 5V3H4ZM17 21V15C17 14.4477 16.5523 14 16 14L8 14C7.44772 14 7 14.4477 7 15L7 21L17 21ZM9 3H15V5C15 5.55228 14.5523 6 14 6H10C9.44772 6 9 5.55228 9 5V3Z" fill="#0F0F0F"/></svg>`;
        } else {
            nameInput.setAttribute('disabled', 'true');
            localSaver('SCFT_DeviceName', nameInput.value);
            editBtn.innerHTML = `<svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.4998 5.49994L18.3282 8.32837M3 20.9997L3.04745 20.6675C3.21536 19.4922 3.29932 18.9045 3.49029 18.3558C3.65975 17.8689 3.89124 17.4059 4.17906 16.9783C4.50341 16.4963 4.92319 16.0765 5.76274 15.237L17.4107 3.58896C18.1918 2.80791 19.4581 2.80791 20.2392 3.58896C21.0202 4.37001 21.0202 5.63634 20.2392 6.41739L8.37744 18.2791C7.61579 19.0408 7.23497 19.4216 6.8012 19.7244C6.41618 19.9932 6.00093 20.2159 5.56398 20.3879C5.07171 20.5817 4.54375 20.6882 3.48793 20.9012L3 20.9997Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        }
    });

    const idInput = document.getElementById('deviceId');
    const ipInput = document.getElementById('deviceIp');
    let deviceId = localLoader('SCFT_DeviceID', '');
    if (!deviceId) {
        deviceId = "" + crypto.randomUUID().substring(0, 8).toUpperCase();
        localSaver('SCFT_DeviceID', deviceId);
    }
    if (idInput) idInput.value = deviceId;
    if (ipInput) ipInput.value = "192.168.1.52";


    // ----------------------------------------
    // KHỐI 2: AUDIO
    // ----------------------------------------
    const ICON_MAX = `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 9.00009C18.6277 9.83575 18.9996 10.8745 18.9996 12.0001C18.9996 13.1257 18.6277 14.1644 18 15.0001M6.6 9.00009H7.5012C8.05213 9.00009 8.32759 9.00009 8.58285 8.93141C8.80903 8.87056 9.02275 8.77046 9.21429 8.63566C9.43047 8.48353 9.60681 8.27191 9.95951 7.84868L12.5854 4.69758C13.0211 4.17476 13.2389 3.91335 13.4292 3.88614C13.594 3.86258 13.7597 3.92258 13.8712 4.04617C14 4.18889 14 4.52917 14 5.20973V18.7904C14 19.471 14 19.8113 13.8712 19.954C13.7597 20.0776 13.594 20.1376 13.4292 20.114C13.239 20.0868 13.0211 19.8254 12.5854 19.3026L9.95951 16.1515C9.60681 15.7283 9.43047 15.5166 9.21429 15.3645C9.02275 15.2297 8.80903 15.1296 8.58285 15.0688C8.32759 15.0001 8.05213 15.0001 7.5012 15.0001H6.6C6.03995 15.0001 5.75992 15.0001 5.54601 14.8911C5.35785 14.7952 5.20487 14.6422 5.10899 14.4541C5 14.2402 5 13.9601 5 13.4001V10.6001C5 10.04 5 9.76001 5.10899 9.54609C5.20487 9.35793 5.35785 9.20495 5.54601 9.10908C5.75992 9.00009 6.03995 9.00009 6.6 9.00009Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const ICON_MUTE = `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 9.50009L21 14.5001M21 9.50009L16 14.5001M4.6 9.00009H5.5012C6.05213 9.00009 6.32759 9.00009 6.58285 8.93141C6.80903 8.87056 7.02275 8.77046 7.21429 8.63566C7.43047 8.48353 7.60681 8.27191 7.95951 7.84868L10.5854 4.69758C11.0211 4.17476 11.2389 3.91335 11.4292 3.88614C11.594 3.86258 11.7597 3.92258 11.8712 4.04617C12 4.18889 12 4.52917 12 5.20973V18.7904C12 19.471 12 19.8113 11.8712 19.954C11.7597 20.0776 11.594 20.1376 11.4292 20.114C11.239 20.0868 11.0211 19.8254 10.5854 19.3026L7.95951 16.1515C7.60681 15.7283 7.43047 15.5166 7.21429 15.3645C7.02275 15.2297 6.80903 15.1296 6.58285 15.0688C6.32759 15.0001 6.05213 15.0001 5.5012 15.0001H4.6C4.03995 15.0001 3.75992 15.0001 3.54601 14.8911C3.35785 14.7952 3.20487 14.6422 3.10899 14.4541C3 14.2402 3 13.9601 3 13.4001V10.6001C5 10.04 5 9.76001 3.10899 9.54609C3.20487 9.35793 3.35785 9.20495 3.54601 9.10908C3.75992 9.00009 4.03995 9.00009 4.6 9.00009Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const selectBox = document.getElementById('output_device');
    const volumeSlider = document.getElementById('volume_slider');
    const volumeText = document.getElementById('volume_text');
    const muteToggleBtn = document.getElementById('mute_toggle_btn');
    let isMuted = false;

    async function getRealAudioDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

            selectBox.innerHTML = '';
            if (audioOutputs.length === 0) {
                selectBox.innerHTML = '<option>Không tìm thấy loa</option>';
                return;
            }

            audioOutputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Speaker ${selectBox.length + 1}`;
                selectBox.appendChild(option);
            });
            const savedOutput = localLoader('SCFT_OutputDevice', '');
            if (savedOutput) selectBox.value = savedOutput;
        } catch (err) {
            console.error("Lỗi lấy thiết bị: ", err);
             selectBox.innerHTML = '<option>This device (Default)</option>';
        }
    }
    getRealAudioDevices();

    selectBox.addEventListener('change', (e) => {
        localSaver('SCFT_OutputDevice', e.target.value);
    });

    // Xử lý Volume
    const savedVolume = localLoader('SCFT_Volume', 100);
    volumeSlider.value = savedVolume;
    volumeText.textContent = `${savedVolume}%`;
    updateSliderColor(volumeSlider);
    if (savedVolume == 0) {
        muteToggleBtn.innerHTML = ICON_MUTE;
        isMuted = true;
    }

    volumeSlider.addEventListener('input', (e) => {
        let currentVal = e.target.value;
        volumeText.textContent = `${currentVal}%`;
        updateSliderColor(volumeSlider);
        
        if (currentVal == 0) {
            muteToggleBtn.innerHTML = ICON_MUTE;
            isMuted = true;
        } else {
            muteToggleBtn.innerHTML = ICON_MAX;
            isMuted = false;
        }
        localSaver('SCFT_Volume', currentVal);
    });


    // ----------------------------------------
    // KHỐI 3: STREAM PERFORMANCE
    // ----------------------------------------
    const resolutionSelect = document.getElementById('resolution_select');
    const mockSupportedResolutions = ['720p', '1080p', '1440p', '4K'];
    resolutionSelect.innerHTML = '';
    mockSupportedResolutions.forEach(res => {
        const option = document.createElement('option');
        option.value = res;
        option.text = res;
        resolutionSelect.appendChild(option);
    });

    const savedResolution = localLoader('SCFT_Resolution', '1080p');
    resolutionSelect.value = savedResolution;
    resolutionSelect.addEventListener('change', (e) => {
        localSaver('SCFT_Resolution', e.target.value);
    });

    const bitrateSlider = document.getElementById('bitrate_slider');
    const bitrateText = document.getElementById('bitrate_text');
    
    const savedBitrate = localLoader('SCFT_Bitrate', 12.5);
    bitrateSlider.value = savedBitrate;
    bitrateText.textContent = `${savedBitrate} mbps`;
    updateSliderColor(bitrateSlider); 

    bitrateSlider.addEventListener('input', (e) => {
        const currentVal = e.target.value;
        bitrateText.textContent = `${currentVal} mbps`;
        updateSliderColor(bitrateSlider); 
        localSaver('SCFT_Bitrate', currentVal);
    });

    const fpsRadios = document.querySelectorAll('input[name="fps"]');
    const savedFps = localLoader('SCFT_FPS', '60');
    fpsRadios.forEach(radio => {
        if(radio.value === savedFps) radio.checked = true;

        radio.addEventListener('change', (e) => {
            localSaver('SCFT_FPS', e.target.value);
        });
    });


    // ----------------------------------------
    // KHỐI 4: THEME
    // ----------------------------------------
    const themeRadios = document.querySelectorAll('input[name="app_theme"]');
    const savedTheme = localLoader('SCFT_Theme', 'light');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme_dark').checked = true;
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('theme_light').checked = true;
    }

    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedTheme = e.target.value;
            if (selectedTheme === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            localSaver('SCFT_Theme', selectedTheme);
        });
    });

});