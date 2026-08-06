# SCFT — Báo cáo đọc và đúc kết toàn bộ dự án

- Ngày rà soát: 2026-08-06
- Phạm vi: toàn bộ cấu trúc Git, mã nguồn, cấu hình, script, README, test, tài nguyên web/Android/Windows và các artefact đang nằm trong repository.
- Trạng thái Git lúc rà soát: `main`, đồng bộ với `origin/main`, working tree sạch.
- Cách đọc: mã nguồn và cấu hình được đối chiếu theo luồng chạy; file nhị phân, lockfile và artefact sinh bởi công cụ được kiểm kê theo loại/kích thước và không diễn giải từng byte như mã nguồn.

## 1. Kết luận điều hành

SCFT hiện là một prototype đa nền tảng cho hai nhóm chức năng:

1. Truyền tệp giữa Android và desktop qua HTTP API chạy trên máy tính, đưa qua `adb reverse` trên cáp USB.
2. Sao chép màn hình Android lên desktop hoặc chiếu màn hình PC lên Android.

Phần đã trưởng thành nhất là Java backend, desktop Electron/web UI và Android native project trong thư mục `Android/`. `mobile_UI/` là một prototype React Native/Expo độc lập, dùng dữ liệu hard-code và thao tác mô phỏng; nó chưa nối vào backend SCFT.

Kiến trúc hiện tại có một đường chạy thực tế tương đối rõ:

```text
Android native app
        │ HTTP 127.0.0.1:7878
        │ adb reverse tcp:7878 tcp:7878
        ▼
Desktop Java backend ───────────────► file storage / screen capture / FFmpeg
        ▲                                      │
        │ HTTP                                 │ H.264/JPEG
        ▼                                      ▼
Electron + web_app                   Android native PC viewer
```

Điểm nghẽn lớn nhất được phát hiện bằng đọc code là nút “Chiếu màn hình PC” đang gọi hai IPC channel nhưng `main.js` chưa đăng ký handler cho chúng. Vì vậy đường khởi động/dừng virtual display từ desktop UI hiện không được nối hoàn chỉnh.

Đánh giá tổng thể:

| Khu vực | Mức độ | Nhận định |
|---|---:|---|
| File transfer backend/API | Khá tốt cho prototype | Có upload/list/download/delete, giới hạn 2 GB, metadata sidecar và ADB tunnel. |
| Desktop Electron/web | Khá tốt về giao diện và tích hợp ADB | Có tự khởi động backend, tìm ADB, preview màn hình; còn lỗi IPC virtual display và một số liên kết UI. |
| Android native | Có logic thật | Upload file thật và PC screen H.264/JPEG thật; package name vẫn là `com.example.myapplication`. |
| React Native mobile UI | Prototype giao diện | Dữ liệu máy tính, lịch sử, transfer và settings đều ở state cục bộ/hard-code. |
| Windows virtual display | Source prototype dựa trên Microsoft sample | Có pipeline ghi frame BMP nhưng build/install/signing chưa phải quy trình phân phối production. |
| Test/CI | Yếu | Chỉ còn test mẫu JUnit/Android; chưa có integration test backend, IPC, ADB, stream hay driver. |

## 2. Inventory repository

Repository có 194 file được Git theo dõi. Phân bố theo khu vực chính:

| Khu vực | Số file | Vai trò |
|---|---:|---|
| `web_app/` | 48 | HTML/CSS/JS desktop UI và asset SVG/mock JSON |
| `Android/` | 56 | Android native Compose client, upload và PC screen viewer |
| `mobile_UI/` | 39 | React Native/Expo UI prototype và Android wrapper |
| `windows_driver/` | 20 | Windows Indirect Display Driver, helper app, script build/install |
| `.gradle/` | 13 | Cache/metadata Gradle đang bị track |
| `backend/` | 4 | Java server, H.264 streamer, README, script chạy |
| `scripts/` | 2 | Chuẩn bị runtime và build Windows |
| Root + `build/` | 12 | Electron entrypoint, package/lock, README, summary, report sinh bởi Gradle |

Một số loại file đáng chú ý trong toàn repository: 14 JavaScript, 10 Kotlin, 2 Java, 2 C++, 11 CSS, 9 HTML, 31 XML, 8 JSON, 8 PowerShell, 2 Gradle project, 2 C/C++ project và 1 executable virtual-display đang được track.

Repository cũng đang track các artefact không nên là source of truth dài hạn:

- `.gradle/` cache/metadata.
- `build/reports/problems/problems-report.html`.
- `windows_driver/SCFTVirtualDisplay/bin/SCFTVirtualDisplayApp.exe`.
- `gradle-wrapper.jar`, các file `.bin`, `.ser`, lockfile và keystore debug.

Đây không nhất thiết làm project không chạy, nhưng làm diff/review nặng, khó tái lập và dễ che khuất source change. `.gitignore` hiện bỏ qua `node_modules`, `backend/storage`, `backend/out`, `dist`, `build-resources`, nhưng chưa loại các cache/artefact trên.

## 3. Cây thư mục có chú thích

```text
SCFT/
├─ main.js                         Electron main process
├─ package.json                    Electron 42 + electron-builder
├─ package-lock.json               npm lockfile của desktop
├─ pnpm-lock.yaml                  pnpm lockfile song song
├─ pnpm-workspace.yaml             chỉ có cấu hình build approval, chưa khai báo package workspace
├─ README.md                       hướng dẫn kiến trúc/chạy USB, có một số đoạn cũ
├─ WORK_SESSION_SUMMARY.md         nhật ký thay đổi và kết quả test lịch sử
├─ THIRD_PARTY_NOTICES.txt         thông báo license FFmpeg LGPL
├─ run-test.bat                    wrapper thử chạy npm/pnpm
│
├─ backend/
│  ├─ README.md                    API, storage, ADB reverse
│  ├─ run.ps1                      compile Java rồi chạy server
│  └─ src/main/java/com/scft/backend/
│     ├─ ScftBackendServer.java    HTTP API, file store, JPEG screen API
│     └─ H264ScreenStreamer.java    FFmpeg H.264 pipe/raw frame source
│
├─ web_app/
│  ├─ index.html                    dashboard
│  ├─ FT.html                       desktop file transfer
│  ├─ SC.html                       Android screen copy
│  ├─ SC_Popout.html                cửa sổ floating cho Android screen copy
│  ├─ PCScreen.html                 PC screen share
│  ├─ Setting.html                  settings desktop
│  ├─ Share/                        loader và CSS chung
│  ├─ component/                    header, sidebar và component legacy
│  ├─ page/                         JS/CSS của Home, File Transfer, Screen Copy, PC Screen, Setting
│  ├─ mockData/                     device.json, history.json
│  └─ asset/                        SVG icon set
│
├─ Android/                         Android native client
│  ├─ gradle/libs.versions.toml     AGP/Kotlin/Compose versions
│  └─ app/src/main/java/com/example/myapplication/
│     ├─ MainActivity.kt             upload file thật + route sang PC viewer
│     ├─ PcScreenViewer.kt            JPEG polling fallback
│     ├─ H264PcScreenViewer.kt        MediaCodec low-latency H.264 viewer
│     └─ ui/theme/                   Compose theme mặc định
│
├─ mobile_UI/                        React Native/Expo UI mock
│  ├─ App.js                         màn hình Home/Transfer/Copy/Setting
│  ├─ app.json/package.json           Expo/RN configuration
│  └─ android/                       native wrapper sinh bởi Expo
│
├─ windows_driver/SCFTVirtualDisplay/
│  ├─ SCFTVirtualDisplay.sln
│  ├─ SCFTVirtualDisplayDriver/      UMDF/IDD driver
│  ├─ SCFTVirtualDisplayApp/         tạo software device + giữ virtual monitor sống
│  ├─ scripts/                       build/install/test-sign/stage/start
│  ├─ bin/                           executable đã build và đang track
│  └─ LICENSE-Microsoft-MS-PL.txt
│
├─ scripts/
│  ├─ prepare-runtime.ps1            jlink Java + copy Android platform-tools
│  └─ build-win.ps1                  compile backend, prepare runtime, electron-builder
│
└─ build/.gradle/.vscode             artefact/cache/cấu hình IDE
```

## 4. Luồng chạy và phụ thuộc

### 4.1 Electron desktop

`main.js` là process chính của Electron:

1. Đổi `userData` và `sessionData` sang `%LOCALAPPDATA%\SCFT`.
2. Copy Java runtime và platform-tools đã bundle vào `%LOCALAPPDATA%\SCFT\runtime` nếu có.
3. Chọn FFmpeg từ `SCFT_FFMPEG_PATH`, bản bundle hoặc `PATH`; mặc định encoder là `h264_mf`.
4. Spawn `backend/run.ps1` ở port `7878`, storage nằm trong user data của Electron.
5. Dò ADB, gọi `adb devices`, rồi chạy `adb reverse tcp:7878 tcp:7878` nếu có thiết bị đã authorize.
6. Mở `web_app/index.html` trong `BrowserWindow`.

Electron đang dùng:

- `nodeIntegration: true`.
- `contextIsolation: false`.
- Không có preload bridge.
- `asar: false` khi đóng gói.
- `requestedExecutionLevel: requireAdministrator` cho bản Windows.

Đây là lựa chọn dễ tích hợp ADB/IPC nhưng làm tăng bề mặt tấn công nếu web UI sau này nhận dữ liệu không tin cậy.

### 4.2 File transfer

Luồng Android native:

```text
Android MainActivity.kt
  └─ POST http://127.0.0.1:7878/api/files?filename=...
       └─ adb reverse tcp:7878 tcp:7878
            └─ Java backend trên desktop
                 └─ storage/uploads/<uuid>-<filename>
                    + <uuid>.meta.json
```

Android native dùng `OpenDocument`, streaming 64 KiB, `Content-Length` nếu biết kích thước, progress callback và header `X-Device-Id`.

Desktop `FT.js` hỗ trợ:

- chọn file hoặc drag/drop;
- upload bằng `XMLHttpRequest` có progress;
- list file;
- download bằng `/api/files/{id}/download`;
- delete bằng `DELETE /api/files/{id}`;
- giới hạn client 2 GB, backend cũng kiểm tra giới hạn.

Backend không có database. Device ID được sinh một lần bằng UUID trong `device-id.txt`; metadata file là JSON sidecar do server tự ghi.

### 4.3 Sao chép màn hình Android lên desktop

Desktop `SC.js` không gọi backend để capture Android. Nó:

1. Tìm `adb.exe` qua nhiều vị trí.
2. Kiểm tra `adb devices`.
3. Spawn:

```text
adb exec-out screenrecord --output-format=h264 --size <WxH> --bit-rate <bps> --time-limit 1800 -
```

4. Đưa byte stream H.264 vào `H264StreamDecoder`.
5. Tách Annex-B NAL start code, lưu SPS/PPS, chờ keyframe rồi dùng WebCodecs `VideoDecoder` để vẽ lên canvas.

Đây là đường “Android screen -> desktop”, khác với đường “PC screen -> Android”. Cửa sổ pop-out dùng lại decoder và spawn process riêng.

### 4.4 Chiếu màn hình PC lên Android

Backend cung cấp hai cách lấy hình:

- JPEG polling: `/api/screen/frame`, dùng `Robot` hoặc BMP do virtual display ghi.
- H.264 streaming: `/api/screen/stream`, gọi FFmpeg và pipe ra HTTP.

Android native `H264PcScreenViewer.kt`:

- mở HTTP stream raw H.264;
- reader thread đọc chunk;
- queue có giới hạn theo preset;
- tách NAL;
- feed `MediaCodec` AVC vào `SurfaceView`;
- có `KEY_LOW_LATENCY`, `PARAMETER_KEY_LOW_LATENCY`, frame/drop/backlog/RTT metrics;
- fast preset có thể bỏ frame cũ để ưu tiên frame mới;
- lỗi stream thì fallback sang `JpegPcScreenViewer.kt`.

Preset hiện có trong source:

| Preset | Kích thước | Bitrate | Queue | Render |
|---|---:|---:|---:|---|
| `2K` | 2560×1440 | 24M | 2 MiB | giữ continuity |
| `Cân bằng` | 1600×900 | 6M | 768 KiB | giữ continuity |
| `Nhanh` | 1280×720 | 4M | 384 KiB | latest-frame ưu tiên |
| `Siêu nhanh` | 960×540 | 2M | 256 KiB | latest-frame ưu tiên |

### 4.5 Virtual display Windows

Driver là một biến thể từ Microsoft Indirect Display Driver sample:

1. `SCFTVirtualDisplayApp.exe` gọi `SwDeviceCreate` với hardware ID `SCFTVirtualDisplayDriver`.
2. Windows/IDD tạo một virtual monitor.
3. Driver nhận swap-chain frame.
4. `SwapChainProcessor::WriteFrame` map/copy BGRA frame.
5. Ghi file tạm `C:\ProgramData\SCFT\virtual-display-frame.tmp`, sau đó atomic replace thành `virtual-display-frame.bmp`.
6. Java backend đọc BMP này khi `display > 0`, rồi encode lại bằng FFmpeg.

Driver giới hạn frame ghi file khoảng 33 ms/frame, tương đương gần 30 FPS cho file path; monitor mode được khai báo 2560×1440/1920×1080/1280×720 ở 60 Hz cùng các target modes khác.

README root còn mô tả virtual display là 1920×1080, trong khi source driver/helper và work summary hiện đã ưu tiên 2560×1440. Đây là tài liệu bị lệch so với code.

## 5. Java backend và API

`ScftBackendServer` dùng `com.sun.net.httpserver.HttpServer`, fixed thread pool 8, CORS mở và các context sau:

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/health` | health check |
| GET | `/api/device` | device ID, user name, IP, port |
| GET | `/api/files` | list metadata, mới nhất trước |
| POST | `/api/files?filename=...` | upload binary body |
| GET | `/api/files/{id}/download` | download binary |
| DELETE | `/api/files/{id}` | xóa file + metadata |
| GET | `/api/screen/status` | headless/display list và URL |
| GET | `/api/screen/frame` | JPEG frame có cache/sequence/age headers |
| GET | `/api/screen/stream` | H.264 hoặc MPEG-TS FFmpeg pipe |
| GET | `/api/screen/latency` | server timestamp |
| GET | `/api/screen/view` | HTML viewer polling JPEG |

### Storage và kiểm tra dữ liệu

- Tên file bị từ chối nếu rỗng, có `/`, `\`, `..` hoặc ký tự điều khiển nguy hiểm.
- ID phải có dạng 36 ký tự gồm hex và dấu gạch ngang.
- Upload giới hạn `2L * 1024L * 1024L * 1024L`.
- Download có kiểm tra `Path.startsWith(uploadDir)`.
- File được ghi tạm `.uploading`, sau đó move sang tên thật.
- Metadata parser là parser JSON thủ công rất nhỏ, chỉ phục vụ schema do chính backend ghi.

### Các rủi ro backend

1. `HttpServer.create(new InetSocketAddress(port), 0)` tại `ScftBackendServer.java` khoảng dòng 88 không buộc loopback; server có thể lắng nghe trên các interface mạng. Kết hợp CORS `*` khoảng dòng 104 và không có authentication, bất kỳ client có thể truy cập được port đều có thể upload, download hoặc delete file.
2. Đây là HTTP cleartext. ADB reverse là hợp lý cho USB cục bộ, nhưng LAN URL được UI công khai mà không có auth/TLS.
3. Nếu upload vượt giới hạn hoặc ghi metadata thất bại, file tạm/orphan có thể còn lại vì cleanup chưa nằm trong `finally` hoàn chỉnh.
4. `handleDelete` resolve `record.storedName` rồi xóa nhưng không lặp lại kiểm tra `startsWith(uploadDir)` như download. Metadata thường do server tạo nên rủi ro thấp trong normal flow, nhưng nên phòng thủ đồng nhất.
5. H.264 phụ thuộc FFmpeg ngoài Java. Chạy backend trực tiếp bằng `backend/run.ps1` cần FFmpeg và encoder phù hợp; README backend mới chỉ nhấn mạnh JDK.
6. `screenCaptureExecutor` không có lifecycle shutdown rõ ràng. Trong process desktop lâu dài, nên xử lý shutdown server/executor.

## 6. Phân tích từng phần source

### `main.js`

Điểm tốt:

- quản lý path runtime ở user data;
- tìm ADB theo bundled SDK, environment và SDK mặc định;
- có version marker khi copy runtime;
- tự reverse ADB;
- có cơ chế chọn FFmpeg/Media Foundation/NVENC qua environment;
- có cửa sổ preview pop-out.

Điểm cần sửa:

- Có các hàm `installVirtualDisplayDriver`, `startVirtualDisplay`, `stopVirtualDisplay` trong `main.js` khoảng dòng 52–145 nhưng không có `ipcMain.handle("scft-virtual-display-start", ...)` hoặc `ipcMain.handle("scft-virtual-display-stop", ...)`.
- `PCScreen.js` gọi đúng hai channel trên khoảng dòng 112 và 142, nên hiện tại sẽ nhận lỗi kiểu “No handler registered” trước khi hoàn tất workflow.
- `installVirtualDisplayDriver()` cũng không được gọi trong lifecycle.
- Dev mode chạy helper bằng `Start-Process -Verb RunAs`; packaged mode spawn trực tiếp, nhưng lỗi process/driver không được trả rõ về UI.
- `stopBackend()` chỉ kill PowerShell process; không có shutdown handshake hoặc kiểm tra backend đã dừng.

### `backend/ScftBackendServer.java`

Đây là backend nhỏ, dễ đọc, không framework. Phần file transfer đủ để làm prototype thật. Phần screen capture có cache JPEG bất đồng bộ và phân biệt màn hình theo index. `deviceName` hiện lấy từ `user.name`, chưa phải tên thiết bị do người dùng cấu hình.

### `backend/H264ScreenStreamer.java`

Có hai nguồn:

- `gdigrab` trực tiếp từ desktop.
- `SCFT_SCREEN_STREAM_SOURCE=frame`: đọc BMP virtual display rồi feed raw BGRA vào FFmpeg.

Encoder output hỗ trợ `h264`, `mpegts`, scale, bitrate, GOP ngắn, `h264_mf`, `h264_nvenc` và fallback encoder khác. Giá trị bitrate được whitelist dạng `[0-9]{1,3}[kKmM]`.

Một giới hạn thiết kế: mọi `display > 0` đều thử đọc cùng một file virtual-display BMP; nếu người dùng chọn một physical display thứ hai thay vì virtual display thì source frame có thể không trùng với màn hình được chọn.

### `web_app/`

- `index.html`/`Home/Index.js`: dashboard polling backend/ADB mỗi 3 giây, tạm dừng khi tab hidden.
- `FT.html`/`FT.js`: file transfer desktop thật.
- `SC.html`/`SC.js`: Android H.264 screen copy thật trong Electron.
- `SC_Popout.*`: floating Android screen viewer.
- `PCScreen.html`/`PCScreen.js`: chọn display, preview JPEG, link USB/LAN, mở native Android viewer.
- `Setting.html`/`Setting.js`: local settings cho tên device, audio output, volume, FPS, resolution, bitrate, theme.
- `My_device_block` và `Historytb` còn dùng `mockData`; chúng là phần legacy, không phải nguồn dữ liệu của dashboard mới.

Các điểm lệch/không hoàn chỉnh:

- Header trỏ tới `profile.html`, nhưng file này không tồn tại.
- Sidebar trỏ tới `../Contact.html`, nhưng file này cũng không tồn tại.
- `global.css` import `component/Header/Header.css` trong khi thư mục thật là `component/header/`; Windows không phân biệt hoa thường nên có thể vẫn chạy, nhưng đây là lỗi portability.
- UI nạp `Sidebar.html`/`Header.html` bằng `fetch` từ trang `file://`. Cách này dễ bị CORS/file-origin restriction của Chromium/Electron; nếu gặp trang trắng ở header/sidebar, đây là nơi cần sửa đầu tiên. Nên nhúng trực tiếp, dùng custom protocol hoặc preload/resource loader.
- Setting lưu chủ yếu vào `localStorage`; lựa chọn resolution/FPS/bitrate được screen-copy đọc nhưng PC-screen H.264 viewer dùng preset riêng.
- Nút “Open backend” mở health endpoint thay vì một trang trạng thái hữu ích hơn.
- Tất cả URL backend bị hard-code `http://127.0.0.1:7878` ở nhiều file, chưa có một config trung tâm.

### `Android/`

Đây là client native có logic thật:

- Compose UI.
- `MainActivity.kt` upload file binary qua HTTP, progress, giới hạn 2 GB.
- `H264PcScreenViewer.kt` là đường PC screen chất lượng/thời gian thực.
- `PcScreenViewer.kt` là fallback JPEG khoảng 45 ms/frame.
- Manifest cho `INTERNET` và cleartext traffic.

Điểm cần lưu ý:

- namespace/application ID vẫn là `com.example.myapplication`; desktop `PCScreen.js` hard-code component này, nên đổi package cần sửa cả hai phía.
- Native app này là app mà desktop hiện cố mở bằng `adb shell am start`.
- Test hiện chỉ là test mẫu “2 + 2” và kiểm tra package name, chưa kiểm thử upload, decoder, fallback hay lifecycle.
- Build dùng SDK 36.1, AGP 9.2.1, Kotlin 2.2.10, Compose BOM 2026.02.01 và Gradle 9.4.1; môi trường build cần tương ứng.

### `mobile_UI/`

Đây là một app React Native/Expo khác, package `com.scft.mobile`, không phải client native `Android/`.

Bằng chứng source cho thấy đây là mock UI:

- `currentPhone`, `initialComputers`, `initialTransfers` hard-code trong `App.js`.
- `createMockTransfer` chỉ thêm item vào React state.
- Send/Receive không gọi API.
- Screen Copy có nút nhưng không có handler thực hiện stream.
- Settings chỉ đổi state trong memory, không dùng `AsyncStorage` hay backend.
- Không có `fetch`, `axios`, URL backend hay ADB integration trong `App.js`.

Vì vậy không nên gọi `mobile_UI` là implementation Android production. Cần quyết định một trong hai hướng:

1. Giữ `Android/` làm client chức năng và chuyển `mobile_UI` thành design/reference.
2. Port toàn bộ logic thật sang React Native, sau đó loại bỏ hoặc đổi vai trò project native hiện tại.

Giữ song song hai ứng dụng cùng tên SCFT nhưng khác package, khác dữ liệu và khác mức hoàn thiện sẽ gây nhầm lẫn build/release và là nguyên nhân trực tiếp của việc desktop chỉ mở được `com.example.myapplication`.

### `windows_driver/`

Đây là source driver nghiêm túc hơn một mock thông thường: có solution, UMDF/IDD callbacks, swap-chain processor, EDID/mode list và frame extraction. Tuy nhiên source vẫn giữ nhiều TODO của Microsoft sample về production driver, EDID động, commit mode và frame statistics.

Các giới hạn phân phối:

- cần Visual Studio C++ Build Tools + WDK;
- cần quyền Administrator;
- README nói build hiện test-signed, không dành cho end-user;
- Secure Boot/BitLocker có thể chặn Test Mode;
- install script chỉ cài package đã có INF/DLL/catalog, không tự build package;
- `stage-runtime.ps1` hiện chỉ copy `SCFTVirtualDisplayApp.exe`, không stage đầy đủ driver package.

## 7. Build và chạy

### Desktop development

```powershell
npm install
npm start
```

Điều kiện thực tế:

- Node/npm.
- Electron dependencies trong `node_modules`.
- JDK 11+ để `backend/run.ps1` compile Java nếu chưa có `backend/out`.
- ADB/platform-tools để USB workflow.
- FFmpeg cho PC screen H.264.

### Backend

```powershell
.\backend\run.ps1
```

Hoặc compile riêng:

```powershell
npm run backend:compile
```

Nếu chạy backend trực tiếp, storage mặc định là `backend/storage`; khi Electron chạy, storage được truyền vào user data của app.

### Windows package

```powershell
npm run dist
```

Pipeline:

1. compile Java;
2. `scripts/prepare-runtime.ps1` dùng `jlink` tạo Java runtime với `java.base`, `java.desktop`, `jdk.httpserver`;
3. copy Android `platform-tools`;
4. electron-builder tạo `win-unpacked`;
5. electron-builder đóng gói NSIS/portable.

`package.json` còn yêu cầu các resource sau nhưng chúng không nằm trong source tree hiện tại:

```text
build-resources/java-runtime
build-resources/platform-tools
build-resources/virtual-display
build-resources/ffmpeg
```

Do đó `npm run dist` cần chạy `runtime:prepare` và cần có thêm FFmpeg/virtual-display resource đúng vị trí.

### Android native

```powershell
cd Android
.\gradlew.bat :app:assembleDebug
```

Cần JDK và Android SDK phù hợp. Để test PC screen thật cần:

1. cài APK native `Android/`;
2. connect USB + authorize ADB;
3. desktop backend chạy port 7878;
4. `adb reverse tcp:7878 tcp:7878`;
5. driver/virtual display đã hoạt động nếu muốn lấy màn hình ảo.

### React Native/Expo

```powershell
cd mobile_UI
npm install
npm run android:device
```

README của `mobile_UI` còn chứa một đường dẫn tuyệt đối từ máy khác (`C:\Users\admin\Documents\...`), không nên dùng làm hướng dẫn chuẩn cho repo hiện tại.

### Windows driver

```powershell
cd windows_driver\SCFTVirtualDisplay
.\scripts\build-driver.ps1
```

Sau đó install bằng Administrator với INF/DLL/catalog và chạy helper. Đây chưa phải quy trình release vì chữ ký production chưa có.

## 8. Kết quả kiểm tra trong lần rà soát này

### Đã kiểm tra và đạt

- `node --check main.js` đạt.
- Tất cả JavaScript trong `web_app/` đạt `node --check`.
- Các JSON chính (`package.json`, `mobile_UI/package.json`, `mobile_UI/app.json`, mock JSON) parse hợp lệ.
- `git diff --check` không báo whitespace lỗi.
- Không có unmerged file (`git diff --name-only --diff-filter=U` rỗng).
- Đã đối chiếu các endpoint frontend với route backend.
- Đã đối chiếu package Android desktop mở với `Android/app`.

### Chưa thể chạy lại trong môi trường hiện tại

Các command hiện không có executable tương ứng trong PATH:

```text
javac   MISSING
java    MISSING
adb     MISSING
gradle  MISSING
msbuild MISSING
```

Vì vậy lần rà soát này chưa tự xác nhận được:

- Java backend compile/runtime hiện tại;
- Android `assembleDebug`;
- ADB reverse/upload/screen thật;
- FFmpeg H.264 stream;
- Electron E2E;
- driver build/install trên Windows.

`build/reports/problems/problems-report.html` có ghi 2 warning lịch sử về API Gradle wrapper deprecated (`Wrapper.getAvailableDistributionTypes`), không phải lỗi compile. `WORK_SESSION_SUMMARY.md` ghi các kết quả lịch sử như backend compile, Android build và test thiết bị `5f595062`; các kết quả đó được xem là bằng chứng lịch sử của project, không phải phép chạy lại trong lần audit này.

## 9. Danh sách ưu tiên sửa

### P0/P1 — nên xử lý trước khi coi PC screen share là hoàn chỉnh

1. Đăng ký IPC handlers trong `main.js`:

   - `ipcMain.handle('scft-virtual-display-start', ...)` gọi install/start và trả lỗi;
   - `ipcMain.handle('scft-virtual-display-stop', ...)` gọi stop;
   - gọi `installVirtualDisplayDriver()` đúng lifecycle hoặc thiết kế quy trình cài driver rõ ràng.

2. Chốt một Android client chính. Nếu chọn native hiện tại, đổi package/namespace khỏi `com.example.myapplication` và cập nhật `PCScreen.js`, manifest, test, build docs đồng thời.

3. Bổ sung hoặc loại bỏ staging driver package. Bản desktop phải biết INF/DLL/CAT nằm ở đâu, hoặc phải ghi rõ driver được cài trước ngoài installer.

4. Quyết định security model:

   - USB-only: bind backend vào loopback và không quảng bá LAN;
   - LAN: thêm pairing/auth/token, giới hạn origin và quyền delete/upload;
   - production: cân nhắc TLS hoặc tunnel được xác thực.

### P2 — độ tin cậy và bảo trì

5. Gom `BACKEND_URL`, ADB path và stream defaults vào config chung.
6. Dùng protocol/resource loader thay cho `fetch` component từ `file://`, hoặc nhúng header/sidebar trực tiếp.
7. Sửa các link `profile.html`, `Contact.html` và import folder case mismatch.
8. Thêm cleanup temp upload, kiểm tra path khi delete và xử lý shutdown cho executor/server.
9. Thêm API contract test cho health/device/files/screen status.
10. Thêm test decoder: chunk split giữa start code, SPS/PPS, keyframe, malformed NAL, reset/destroy.
11. Thêm integration test ADB tunnel bằng fake ADB hoặc test harness, không phụ thuộc điện thoại thật cho mọi PR.
12. Tách source khỏi artefact: bỏ `.gradle`, `build/reports`, binary `bin/` khỏi Git nếu không có lý do release rõ ràng.

### P3 — sản phẩm và tài liệu

13. Cập nhật root README từ 1920×1080 thành mode thực tế 2560×1440/preset hiện tại.
14. Viết rõ “Android native” và “React Native mock” là hai project khác nhau.
15. Thêm pairing/confirm transfer flow và USB-only mode như README đã ghi là chưa xong.
16. Thêm versioning/package naming/release signing cho Android và Windows driver.
17. Thêm CI tối thiểu: Node syntax/JSON checks, Java compile khi JDK có, Android compile khi runner có SDK.

## 10. Định hướng kiến trúc nên chọn

Nếu mục tiêu ngắn hạn là demo chạy thật qua USB, hướng ít rủi ro nhất là:

```text
Electron/web UI
       │
       ├─ REST/HTTP tới Java backend
       ├─ ADB reverse tới Android native app
       └─ IPC an toàn tới virtual-display lifecycle

Android native app duy nhất
       ├─ file upload/download flow
       └─ PC screen H.264 + JPEG fallback
```

Sau khi đường này ổn định mới quyết định có port UI sang React Native. Không nên vừa dùng `mobile_UI` làm app release vừa để desktop mở `com.example.myapplication`, vì hai codebase đang mô hình hóa hai sản phẩm khác nhau.

## 11. Tóm tắt cuối

SCFT đã có nền tảng kỹ thuật tốt cho một prototype USB screen/file utility: backend nhỏ, stream H.264 có tối ưu low-latency, client Android native có MediaCodec, và driver virtual display có đường frame rõ ràng. Tuy nhiên project chưa phải một sản phẩm đóng gói hoàn chỉnh vì lifecycle virtual display chưa nối qua IPC, driver/runtime packaging chưa khép kín, security của backend đang mở, test còn là test mẫu, và tồn tại hai mobile implementation không đồng nhất.

Thứ tự hành động hợp lý là: sửa IPC + driver lifecycle, chốt Android client, chạy lại E2E trên một máy Windows có JDK/ADB/FFmpeg/SDK, sau đó mới dọn tài liệu/artefact và mở rộng pairing/security.
