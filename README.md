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

Chay app Electron:

```powershell
npm install
npm start
```

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
