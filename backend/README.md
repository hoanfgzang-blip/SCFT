# SCFT Java Backend

Backend toi thieu cho chuc nang truyen file trong SCFT. Service nay dung Java HTTP server built-in, khong can framework ngoai.

Huong du an la truyen file qua day USB. Backend nay la lop API xu ly file; khi lam USB, API se duoc dung qua ADB port tunnel hoac lop USB transport tuong duong.

```text
Desktop Java backend <-> ADB USB tunnel <-> Android app
```

Electron desktop app se tu thu dieu khien ADB reverse khi app khoi dong neu tim thay thiet bi Android da authorize.

## Run

Can JDK 11+.

```powershell
javac -d backend/out backend/src/main/java/com/scft/backend/ScftBackendServer.java
java -cp backend/out com.scft.backend.ScftBackendServer --port 7878
```

Mac dinh server chay tai:

```text
http://localhost:7878
```

## USB transfer plan

Giai do dau nen dung ADB tunnel de giu nguyen API hien co:

```powershell
adb reverse tcp:7878 tcp:7878
```

Khi do Android co the goi:

```text
http://127.0.0.1:7878
```

Request se di qua day USB ve backend desktop. Neu can chieu nguoc lai, dung `adb forward` tuy theo ben nao la server.

## API

### Health

```http
GET /api/health
```

### Device info

```http
GET /api/device
```

Tra ve id, ten may, IP local va port backend.

### Upload file

```http
POST /api/files?filename=example.txt
Content-Type: application/octet-stream

<binary file bytes>
```

Header tuy chon:

```text
X-Device-Id: sender-device-id
X-Original-Filename: example.txt
```

Gioi han upload: 2GB moi request. Filename khong duoc rong, khong duoc chua `/`, `\`, hoac `..`.

### List files

```http
GET /api/files
```

### Download file

```http
GET /api/files/{id}/download
```

### Delete file

```http
DELETE /api/files/{id}
```

## Storage

File upload duoc luu trong:

```text
backend/storage/uploads
```

Moi file co them sidecar metadata `*.meta.json`.

## Error responses

```json
{"error":"Missing filename"}
```

Ma loi chinh:

```text
400 invalid request
404 file not found
405 method not allowed
413 upload exceeds 2GB limit
500 internal server error
```
