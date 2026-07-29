#include <windows.h>
#include <swdevice.h>
#include <conio.h>
#include <cstdio>

struct CreationState
{
    HANDLE eventHandle;
    HRESULT result;
};

VOID WINAPI CreationCallback(HSWDEVICE hSwDevice, HRESULT hrCreateResult, PVOID pContext, PCWSTR pszDeviceInstanceId)
{
    CreationState* state = static_cast<CreationState*>(pContext);
    state->result = hrCreateResult;
    SetEvent(state->eventHandle);
    UNREFERENCED_PARAMETER(hSwDevice);
    UNREFERENCED_PARAMETER(pszDeviceInstanceId);
}


bool ConfigureVirtualDisplay()
{
    for (DWORD index = 0;; index++)
    {
        DISPLAY_DEVICEW device = {};
        device.cb = sizeof(device);
        if (!EnumDisplayDevicesW(nullptr, index, &device, 0))
        {
            return false;
        }
        if (wcsstr(device.DeviceID, L"SCFTVirtualDisplayDriver") == nullptr)
        {
            continue;
        }

        DEVMODEW mode = {};
        mode.dmSize = sizeof(mode);
        if (!EnumDisplaySettingsW(device.DeviceName, ENUM_CURRENT_SETTINGS, &mode))
        {
            return false;
        }

        if (mode.dmPelsWidth == 2560 && mode.dmPelsHeight == 1440)
        {
            return true;
        }

        mode.dmPelsWidth = 2560;
        mode.dmPelsHeight = 1440;
        mode.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT;
        return ChangeDisplaySettingsExW(device.DeviceName, &mode, nullptr, CDS_UPDATEREGISTRY, nullptr) == DISP_CHANGE_SUCCESSFUL;
    }
}
int __cdecl wmain()
{
    CreationState state = {};
    state.eventHandle = CreateEvent(nullptr, FALSE, FALSE, nullptr);
    if (state.eventHandle == nullptr)
    {
        return 1;
    }

    SW_DEVICE_CREATE_INFO createInfo = {};
    createInfo.cbSize = sizeof(createInfo);
    createInfo.pszInstanceId = L"SCFTVirtualDisplayDriver";
    createInfo.pszzHardwareIds = L"SCFTVirtualDisplayDriver\0\0";
    createInfo.pszzCompatibleIds = L"SCFTVirtualDisplayDriver\0\0";
    createInfo.pszDeviceDescription = L"SCFT Virtual Display";
    createInfo.CapabilityFlags = SWDeviceCapabilitiesRemovable | SWDeviceCapabilitiesSilentInstall | SWDeviceCapabilitiesDriverRequired;

    HSWDEVICE softwareDevice = nullptr;
    HRESULT hr = SwDeviceCreate(L"SCFTVirtualDisplayDriver", L"HTREE\\ROOT\\0", &createInfo, 0, nullptr, CreationCallback, &state, &softwareDevice);
    if (FAILED(hr))
    {
        wprintf(L"SwDeviceCreate failed: 0x%08X\n", static_cast<unsigned int>(hr));
        CloseHandle(state.eventHandle);
        return 1;
    }

    DWORD waitResult = WaitForSingleObject(state.eventHandle, 10000);
    CloseHandle(state.eventHandle);
    if (waitResult != WAIT_OBJECT_0)
    {
        wprintf(L"SwDeviceCreate timed out: %lu\n", waitResult);
        SwDeviceClose(softwareDevice);
        return 1;
    }

    if (FAILED(state.result))
    {
        wprintf(L"Software device creation failed: 0x%08X\n", static_cast<unsigned int>(state.result));
        SwDeviceClose(softwareDevice);
        return 1;
    }

    for (int attempt = 0; attempt < 40 && !ConfigureVirtualDisplay(); attempt++)
    {
        Sleep(250);
    }

    printf("SCFT Virtual Display is active. Press Ctrl+C to stop.\n");
    while (true)
    {
        Sleep(1000);
    }
}
