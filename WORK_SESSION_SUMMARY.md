# Work Session Summary

Ngay lam viec: 2026-07-08

## Muc tieu

Lam chuc nang truyen file cho SCFT, uu tien backend va luong truyen file qua day USB giua desktop va Android.

## Da lam

### Desktop backend

Them Java backend tai:

```text
backend/src/main/java/com/scft/backend/ScftBackendServer.java
```

Backend cung cap API:

```text
GET    /api/health
GET    /api/device
POST   /api/files?filename=<name>
GET    /api/files
GET    /api/files/{id}/download
DELETE /api/files/{id}
```

Tinh nang da co:

```text
Upload file binary
List file da upload
Download file
Delete file
Metadata sidecar *.meta.json
Gioi han upload 2GB
Validate filename
404 cho file khong ton tai
413 cho file qua lon
CORS cho frontend Electron
```

### Desktop app Electron

Sua:

```text
main.js
```

Thay doi:

```text
npm start tu bat Java backend
Fix duong dan load web_app/index.html
Tu tim adb
Tu chay adb reverse tcp:7878 tcp:7878 neu Android da authorize
Dung backend khi app quit
```

### Frontend File Transfer

Sua:

```text
web_app/FT.html
web_app/page/File_Transfer/FT.css
web_app/page/File_Transfer/FT.js
```

UI hien co:

```text
Backend online/offline status
Device info
Choose file
Drag and drop file
Upload progress
Max 2GB validation
Received files table
Download file
Delete file
Refresh list
```

Frontend goi:

```text
http://127.0.0.1:7878
```

### Frontend Screen Copy

Them:

```text
web_app/SC.html
web_app/page/Screen_Copy/SC.css
web_app/page/Screen_Copy/SC.js
```

Sua sidebar:

```text
web_app/component/SideBar/Sidebar.html
```

UI hien co:

```text
ADB device status
ADB path
Start/Stop preview
Refresh device
Capture rate 1/2/5 FPS
Android screen preview
Frame count va capture time
```

Luong Screen Copy hien tai:

```text
Desktop Electron
-> adb exec-out screencap -p
-> Android screen PNG frame qua USB
-> render trong Electron
```

Phan nay la prototype tu build bang ADB, khong phu thuoc scrcpy.

### Android app

Thay template Hello Android bang man USB File Transfer:

```text
Android/app/src/main/java/com/example/myapplication/MainActivity.kt
```

Them vao manifest:

```text
INTERNET permission
usesCleartextTraffic=true
```

Android app hien co:

```text
Chon file bang system picker
Hien thi ten file va dung luong
Upload file toi http://127.0.0.1:7878/api/files
Progress bar
Status thanh cong/that bai
Chan file lon hon 2GB
```

Luong USB hien tai:

```text
Android app
-> http://127.0.0.1:7878
-> ADB reverse qua day USB
-> Java backend tren desktop
```

### Documentation

Them/sua:

```text
README.md
backend/README.md
```

Da ghi ro:

```text
Huong du an la truyen file qua day USB
Dung ADB reverse lam USB tunnel giai do dau
Cach chay backend/frontend
Cac phan USB con can lam tiep
```

### Git ignore

Sua:

```text
.gitignore
```

Them ignore:

```text
backend/storage
backend/out
```

Android local config:

```text
Android/local.properties
```

File nay da nam trong Android/.gitignore, chi phuc vu build local.

## Da kiem tra

```text
Java backend compile: OK
Backend health API: OK
Upload/list/download/delete backend: OK
File upload va download giong nhau: OK
Boundary missing filename: 400
Boundary path traversal filename: 400
Boundary bad id: 400
Boundary delete missing file: 404
Boundary >2GB Content-Length: 413
node --check main.js: OK
node --check web_app/page/File_Transfer/FT.js: OK
node --check web_app/page/Screen_Copy/SC.js: OK
adb version: OK
Android :app:compileDebugKotlin: BUILD SUCCESSFUL
```

## Cach chay tren desktop

```cmd
cd /d "E:\Code\Du an WMS\REPO git\SCFT"
npm install
npm start
```

Luu y: duong dan that tren may hien co dau tieng Viet:

```text
E:\Code\Du an WMS\REPO git\SCFT
```

Khi app Electron mo len, backend Java se duoc bat tu dong.

## Cach chay USB transfer

1. Bat Developer Options tren Android.
2. Bat USB debugging.
3. Cam cap USB vao PC.
4. Chap nhan prompt USB debugging tren Android.
5. Chay desktop app:

```cmd
npm start
```

6. Cai/chay Android app bang Android Studio.
7. Trong Android app chon file va bam Upload.

Neu auto ADB reverse khong chay, chay thu cong:

```cmd
adb devices
adb reverse tcp:7878 tcp:7878
```

## Trang thai hien tai

Da co luong truyen file qua day USB theo cach ADB reverse tunnel.

Nghia la app Android upload file qua `127.0.0.1:7878`, va ADB reverse dua request ve Java backend tren PC qua cap USB.

Da co prototype Screen Copy tren desktop theo cach ADB screencap. Khi dien thoai that duoc `adb devices` nhan la `device`, mo trang Screen Copy, bam Start de xem preview man hinh Android.

## Chua lam

```text
Pairing/confirm transfer flow
USB-only mode trong Electron UI
Hien thi Android device list tren desktop
Tu bao loi neu adb unauthorized/no device
Android download file tu desktop
Screen Copy real-time encode/decode giong scrcpy
Forward input mouse/keyboard tu desktop sang Android
Dong goi backend Java thanh jar thay vi compile moi lan
Dong goi Electron app release
Test tren thiet bi Android that
```

## File thay doi chinh

```text
.gitignore
README.md
WORK_SESSION_SUMMARY.md
main.js
backend/README.md
backend/run.ps1
backend/src/main/java/com/scft/backend/ScftBackendServer.java
web_app/FT.html
web_app/page/File_Transfer/FT.css
web_app/page/File_Transfer/FT.js
web_app/SC.html
web_app/page/Screen_Copy/SC.css
web_app/page/Screen_Copy/SC.js
web_app/component/SideBar/Sidebar.html
Android/app/src/main/AndroidManifest.xml
Android/app/src/main/java/com/example/myapplication/MainActivity.kt
```
