# Hoàn thiện PC Screen thành màn hình thứ hai bằng điện thoại

## 1. Kiến trúc và phạm vi v1

SCFT sẽ dùng bản **Virtual Display Driver 25.7.23 x64 chính thức, đã ký**, để Windows tạo màn hình thứ hai thật. Driver được giữ nguyên binary; SCFT chỉ quản lý cài đặt, phát hiện màn hình và truyền hình ảnh. Dự án VDD dùng giấy phép MIT và hỗ trợ Windows 10/11. [Nguồn VDD](https://github.com/VirtualDrivers/Virtual-Display-Driver), [mô hình IDD của Microsoft](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview).

Luồng tổng thể:

```text
VDD tạo màn hình Windows số 2
→ người dùng chọn Extend
→ SCFT chụp đúng màn hình ảo
→ FFmpeg mã hóa H.264
→ USB ADB hoặc LAN
→ Android MediaCodec giải mã và hiển thị fullscreen
```

Phạm vi v1:

- Chỉ Windows 10/11 x64 và Android 11 trở lên.
- Chưa điều khiển cảm ứng.
- Chưa truyền âm thanh PC sang điện thoại.
- Một màn hình ảo và một điện thoại xem tại một thời điểm.
- USB và LAN đều được hỗ trợ chính thức.
- Giữ driver SCFT hiện có trong mã nguồn để phát triển tương lai nhưng không đóng gói hoặc sử dụng trong v1.

## 2. Cài đặt và quản lý màn hình ảo

### Tích hợp VDD

- Đóng gói nguyên bản `VDD.Control.25.7.23` x64 trong tài nguyên SCFT.
- Lưu phiên bản, SHA-256 và thông tin Authenticode trong manifest dependency; chặn chạy nếu hash hoặc chữ ký không khớp.
- Bổ sung giấy phép MIT và thông tin tác giả vào `THIRD_PARTY_NOTICES`.
- Không tự tải hoặc tự nâng cấp driver; cập nhật VDD phải qua một bản SCFT mới đã kiểm thử.
- SCFT chạy quyền người dùng bình thường; chỉ VDD Control yêu cầu UAC khi cài/gỡ driver.
- Không dùng script cài im lặng chưa được nhà phát triển VDD công bố. SCFT mở VDD Control, hướng dẫn người dùng bấm `Install`, rồi tự kiểm tra kết quả.
- Nhận diện driver bằng thiết bị `ROOT\MTTVDD`, tên `Virtual Display Driver` và trạng thái PnP.
- Trạng thái chuẩn hóa: `missing`, `installing`, `ready`, `disabled`, `reboot_required`, `error`.
- Không tự gỡ hoặc tắt driver khi dừng stream; tránh làm mất cửa sổ đang nằm trên màn hình ảo.
- Mục quản lý riêng có các nút: `Cài màn hình ảo`, `Mở VDD Control`, `Mở Display Settings`, `Hướng dẫn khôi phục`.

### Provider có thể thay thế

Trong [main.js](D:/code/SCFT/SCFT/main.js), tách lớp quản lý màn hình thành interface:

```text
getDriverStatus()
openInstaller()
listDisplays()
openDisplaySettings()
getRecoveryInfo()
```

Provider v1 là `virtualdrivers-vdd`. Sau này có thể thêm `scft-idd` mà không thay đổi UI, backend hoặc Android.

## 3. UI PC, backend và Android

### UI PC

Cập nhật [PCScreen.js](D:/code/SCFT/SCFT/web_app/page/PC_Screen/PCScreen.js) thành quy trình bốn bước:

1. **Màn hình ảo**
   - Hiển thị trạng thái driver.
   - Nếu thiếu, hiện nút cài và hướng dẫn UAC.
   - Sau cài đặt, chờ Windows xuất hiện màn hình mới.

2. **Chọn màn hình**
   - Liệt kê tên, độ phân giải, tần số và trạng thái chính/phụ.
   - Tự chọn màn hình không phải màn hình chính nếu chỉ có một lựa chọn.
   - Nếu có nhiều màn hình phụ, bắt buộc người dùng xác nhận bằng ảnh preview.
   - Mặc định dùng 1920×1080, 60 Hz; nút mở Windows Display Settings để đổi lên 2K.

3. **Kết nối điện thoại**
   - USB: trạng thái ADB `chưa kết nối`, `chưa cấp quyền`, `sẵn sàng`.
   - LAN: hiển thị IP, QR ghép nối và URL trình duyệt.
   - Có nút cài/cập nhật APK qua ADB nhưng không tự mở app Android.

4. **Phát màn hình**
   - Chọn preset `Nhanh`, `Cân bằng`, `Full HD`, `2K`.
   - Nút `Bắt đầu` tạo phiên và thiết lập ADB reverse nếu có USB.
   - Nút `Kết thúc` dừng stream nhưng giữ màn hình ảo.
   - Hiển thị transport, FPS, bitrate, backlog, RTT và lỗi gần nhất.

Đồng thời sửa toàn bộ lỗi mojibake tiếng Việt và giữ giao diện responsive hiện tại.

### Backend

Cập nhật [ScftBackendServer.java](D:/code/SCFT/SCFT/backend/src/main/java/com/scft/backend/ScftBackendServer.java):

- Dùng `displayId` ổn định thay cho chỉ số màn hình; vẫn chấp nhận `display` cũ trong thời gian chuyển tiếp.
- Mỗi display trả về `id`, `name`, `index`, `x`, `y`, `width`, `height`, `primary`.
- Không tự đọc `virtual-display-frame.bmp` cho mọi màn hình phụ; đường BMP chỉ tồn tại trong chế độ legacy.
- VDD được chụp trực tiếp bằng bounds của Windows qua FFmpeg `gdigrab`; preview JPEG dùng cùng display ID.
- Khi màn hình bị mất giữa phiên, dừng encoder và trả lỗi `DISPLAY_LOST`, không âm thầm chuyển sang màn hình chính.
- FFmpeg được probe lúc khởi động; ưu tiên encoder phần cứng khả dụng, sau cùng fallback `libx264 ultrafast`.
- Encoder chỉ chạy khi điện thoại kết nối stream và phải bị đóng khi client ngắt kết nối.
- Chỉ cho phép một H.264 viewer; kết nối mới trả `409 STREAM_IN_USE`.
- Phiên và token chỉ nằm trong RAM, hết hiệu lực khi bấm Kết thúc hoặc thoát SCFT.
- Yêu cầu token với mọi request từ LAN; request loopback của UI PC và ADB reverse được phép lấy phiên USB.
- Firewall chỉ mở TCP 7878 trên mạng Private, không mở profile Public.
- Giảm CORS từ `*` xuống same-origin và origin cục bộ cần thiết.

Preset thống nhất:

| Preset | Đầu ra | FPS | Bitrate |
|---|---:|---:|---:|
| Nhanh | 1280×720 | 60 | 4 Mbps |
| Cân bằng | 1600×900 | 60 | 6 Mbps |
| Full HD | 1920×1080 | 60 | 10 Mbps |
| 2K | 2560×1440 | 60 | 20 Mbps |

Mặc định là `Cân bằng`.

### Android

- Giữ app native trong `Android/` làm ứng dụng chính; `mobile_UI/` tiếp tục là prototype, không tham gia PC Screen.
- Người dùng tự mở app; không gọi `adb shell am start`.
- Khi mở PC Screen, app thử USB tại `127.0.0.1:7878` trước.
- Nếu USB không có, cho phép quét QR bằng camera hệ thống qua deep link `scft://pair`; không cần nhúng trình quét camera vào app.
- Có ô nhập IP/mã phiên làm fallback cho LAN.
- Base URL, session và token trở thành dữ liệu kết nối, không hardcode toàn bộ vào viewer.
- H.264 tiếp tục giải mã bằng `MediaCodec`, fullscreen ngang, giữ màn hình sáng và bỏ frame cũ khi backlog tăng.
- Tự reconnect tối đa ba lần với khoảng chờ 1, 2 và 4 giây.
- Nếu H.264 hoặc codec thất bại, chuyển sang JPEG và thông báo rõ đang ở chế độ dự phòng.
- Không thêm touch forwarding, bàn phím hoặc audio trong v1.
- APK release được ký, đóng gói cùng SCFT và có thể cài/cập nhật bằng `adb install -r`.

## 4. API và ghép nối

API mới:

```text
GET    /api/screen/status
POST   /api/screen/session
GET    /api/screen/session/current
GET    /api/screen/session/{id}
DELETE /api/screen/session/{id}
GET    /api/screen/stream
GET    /api/screen/frame
GET    /api/screen/latency
```

`POST /api/screen/session` nhận:

```json
{
  "displayId": "stable-display-id",
  "preset": "balanced"
}
```

Và trả:

```json
{
  "sessionId": "random-id",
  "token": "128-bit-random-token",
  "usbUrl": "http://127.0.0.1:7878",
  "lanUrl": "http://192.168.x.x:7878",
  "expiresAt": 0
}
```

- `expiresAt: 0` nghĩa là phiên tồn tại đến khi người dùng bấm Kết thúc.
- USB Android lấy phiên hiện tại qua loopback sau khi ADB reverse được thiết lập.
- LAN nhận `sessionId` và token từ QR/deep link.
- Token sai hoặc thiếu trả `401`; màn hình biến mất trả `410 DISPLAY_LOST`.

## 5. Quy trình sử dụng

### Lần đầu

1. Cài SCFT.
2. Mở PC Screen.
3. Bấm `Cài màn hình ảo`.
4. Chấp nhận UAC và bấm `Install` trong VDD Control.
5. SCFT tự kiểm tra driver và màn hình mới.
6. Mở Display Settings, chọn `Extend these displays`.
7. Chọn đúng màn hình ảo bằng preview.
8. Cài app SCFT Android qua USB ADB hoặc APK release.
9. Chọn USB hoặc quét QR LAN.
10. Bấm `Bắt đầu` trên PC, sau đó tự mở PC Screen trên Android.

### Hằng ngày

1. Mở SCFT trên PC và Android.
2. Chọn màn hình ảo và preset.
3. Bấm Bắt đầu.
4. Android tự nhận USB hoặc phiên LAN đã ghép nối.

### Kết thúc và khôi phục

- Bấm `Kết thúc` chỉ dừng truyền hình.
- Driver và màn hình ảo vẫn còn để không làm mất vị trí cửa sổ.
- Nếu màn hình chính bị đen: dùng `Win + P`, chọn `PC screen only`, rồi mở VDD Control để disable/uninstall.
- Khi gỡ SCFT, hỏi riêng người dùng có muốn mở VDD Control để gỡ driver; không tự xóa driver dùng chung.

## 6. Kiểm thử và tiêu chí hoàn thành

- Unit test trạng thái driver, display selection, session token và encoder lifecycle.
- API test token đúng/sai, loopback USB, LAN, session trùng và display bị mất.
- Test Windows 10/11 x64 trên Intel, AMD và NVIDIA; gồm một màn hình thật, nhiều màn hình thật và VDD sau reboot.
- Test VDD thiếu, disabled, cài lỗi, yêu cầu reboot và khôi phục màn hình đen.
- Test ADB thiếu, unauthorized, rút cáp giữa phiên, LAN đổi IP và firewall Public/Private.
- Test Android 11–16, xoay màn hình, khóa/mở máy, codec lỗi và JPEG fallback.
- Xác nhận không bao giờ truyền nhầm màn hình chính khi display ID biến mất.
- Xác nhận USB đạt tối thiểu 50 FPS ổn định ở preset Cân bằng trên máy tham chiếu; đo và ghi rõ CPU/GPU/điện thoại/encoder.
- Mục tiêu độ trễ tham chiếu: dưới 100 ms qua USB và dưới 150 ms qua Wi‑Fi 5 GHz; nếu không đạt phải lưu FPS, RTT, backlog và encoder log để chẩn đoán.
- Build cuối phải chứa Java runtime, ADB, FFmpeg, APK Android, VDD Control, checksum và toàn bộ third-party notices.

## Giả định

- V1 không hỗ trợ Windows ARM64, macOS hoặc iPhone.
- Người dùng chấp nhận cài driver bên thứ ba đã ký và cấp UAC một lần.
- Driver VDD 25.7.23 được giữ nguyên, không rebrand hoặc chỉnh binary.
- Không triển khai cảm ứng và âm thanh cho đến giai đoạn sau.
