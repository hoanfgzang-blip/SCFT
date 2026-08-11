# SCFT

SCFT la ung dung Screen Copy & File Transfer. Huong trien khai cua nhom la truyen du lieu qua day USB.

## File transfer direction

Muc tieu chinh:

```text
Desktop app <-> USB cable <-> Android device
```

Backend Java hien tai cung cap API upload/list/download/delete file. API nay la lop xu ly file, khong phai giao thuc USB hoan chinh.

De dung qua USB trong giai do dau, dung ADB port tunnel:

```text
Android app -> ADB reverse/forward over USB -> Desktop Java backend
```

Sau do UI Electron van goi backend nhu hien tai, con duong truyen giua desktop va Android se di qua USB tunnel thay vi Wi-Fi.

## Current backend

Backend nam tai:

```text
backend/
```

Chay backend:

```powershell
.\backend\run.ps1
```

Mac dinh backend lang nghe tai:

```text
http://localhost:7878
```

## Current frontend

Trang File Transfer nam tai:

```text
web_app/FT.html
web_app/page/File_Transfer/FT.js
web_app/page/File_Transfer/FT.css
```

Trang Screen Copy nam tai:

```text
web_app/SC.html
web_app/page/Screen_Copy/SC.js
web_app/page/Screen_Copy/SC.css
```

Screen Copy dang di theo huong truyen truc tiep qua ADB. SCFT bundle `scrcpy-server` de tao luong H.264 tu MediaCodec tren Android, sau do WebCodecs giai ma tren Electron.

```text
Android screen -> scrcpy-server/MediaCodec -> H.264 qua ADB -> WebCodecs -> Electron canvas
```

SCFT uu tien `scrcpy-server` H.264 tren Android moi va cu. Neu server khong khoi dong duoc, app thu `screenrecord --output-format=h264` tren thiet bi co ho tro stdout; cuoi cung moi fallback sang `adb exec-out screencap -p` voi FPS thap hon.

Audio Share uu tien socket audio cua `scrcpy-server` voi PCM 48 kHz stereo de phat qua WebAudio; `scft-simple-audio.jar` chi con la fallback cho thiet bi cu.

Chay app Electron:

```powershell
npm install
npm start
```

Dong goi app thanh file Windows `.exe`:

```powershell
npm install
npm run dist
```

Ban build se nam trong:

```text
dist/
```

Khong can Docker de dong goi desktop app. Lenh build se bundle Java runtime va Android platform-tools vao ban `.exe`, nen nguoi dung chi can chay app. Khi dung USB transfer/screen copy, nguoi dung van can cap USB data, bat Developer Options, bat USB debugging va chap nhan prompt tren dien thoai.

Khi chay `npm start`, Electron se tu bat Java backend. Neu muon chay backend rieng de debug:

```powershell
.\backend\run.ps1
```

## Not done yet

Nhung phan USB can lam tiep:

```text
Pairing/confirm transfer flow
USB-only mode in File Transfer UI
```

## USB file transfer flow

Da co luong upload tu Android qua USB tunnel:

```text
Android app -> http://127.0.0.1:7878 -> ADB reverse over USB -> Desktop Java backend
```

Can thuc hien:

```text
1. Bat Developer Options tren Android
2. Bat USB debugging
3. Cam cap USB vao may tinh
4. Cho phep USB debugging prompt tren Android
5. Chay desktop app bang npm start
6. Mo Android app, chon file, bam Upload
```

Desktop app se tu thu chay:

```powershell
adb reverse tcp:7878 tcp:7878
```

Neu tu dong khong duoc, chay thu cong:

```powershell
adb devices
adb reverse tcp:7878 tcp:7878
```
## PC Screen: dien thoai lam man hinh phu

Trang PC Screen Share nam tai:

```text
web_app/PCScreen.html
web_app/page/PC_Screen/PCScreen.js
web_app/page/PC_Screen/PCScreen.css
```

Backend cung cap:

```text
GET /api/screen/status
GET /api/screen/frame
GET /api/screen/view
GET /api/screen/stream
TCP 7879 raw H.264 (duong frame USB low-latency)
```

Luong chinh qua USB:

```text
Windows VDD -> DXGI Desktop Duplication
             -> SCFT backend H.264
             -> raw H.264 socket TCP 7879 qua adb reverse USB
             -> MediaCodec Android -> SurfaceView
```

Mo trang `PCScreen.html`, bam `Bat dau`. SCFT se chuyen Windows sang topology Extend de gan man hinh VDD cho phien truyen, sau do tu chon man hinh ao vua xuat hien. Khi bam `Ket thuc`, khi khoi dong phien that bai hoac khi thoat SCFT, Windows tro ve topology Internal; man hinh ao khong con xuat hien va trang thai nay duoc giu sau khi khoi dong lai. Driver VDD van duoc cai san vi ban driver ky hien tai khong ho tro go/nap lai an toan trong tung phien.

Khi dien thoai da bat USB debugging va chap nhan khoa ADB, SCFT tu chay ca `adb reverse tcp:7878 tcp:7878` (dieu khien/telemetry) va `adb reverse tcp:7879 tcp:7879` (frame H.264), roi mo PC Screen tren Android. Khong can Test Mode va khong can HDMI dummy.

Neu khong dung USB, app hien URL LAN co san chi so man hinh; dien thoai va PC phai o cung mang. Android viewer cung cho phep nhap dia chi backend LAN.

Neu Windows bao VDD bi trung node hoac khong tao man hinh ao, mo PowerShell bang `Run as administrator` tai thu muc du an va chay `powershell -ExecutionPolicy Bypass -File .\scripts\repair-vdd.ps1`. Script se go cac node VDD cu, cai lai dung mot driver, sau do reboot Windows.

Neu loi nay xuat hien trong ung dung, nut `Sua driver` se mo cung script bang quyen Administrator; sau khi script xong van can reboot Windows.

`windows_driver/SCFTVirtualDisplay/` la driver thu nghiem cu cua SCFT, chi giu lai de tham khao va khong con duoc dong goi hoac su dung boi PC Screen hien tai. Khong dung cac script trong thu muc do cho ban nguoi dung thong thuong.
