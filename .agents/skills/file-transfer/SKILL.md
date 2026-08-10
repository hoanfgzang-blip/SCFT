---
name: file-transfer
description: File Transfer knowledge.
---

# File Transfer

## Architecture
- Backend provides API: `POST /api/files`, `GET /api/files`, `GET /api/files/{id}/download`, `DELETE /api/files/{id}`.
- Maximum file size per request is 2GB.
- Uploaded files are stored in `backend/storage/uploads` with a sidecar `*.meta.json`.

## States
Every transfer must have a clear state:
```text
Transfer ID, Source, Destination, Filename, Size, Transferred bytes, Speed, Progress, Status, Start time, End time, Error
```
Possible statuses: `Pending, Connecting, Transferring, Paused, Completed, Failed, Cancelled`.

- Never mark as `Completed` until confirmed.
- Handle connection lost, partial transfers, duplicate files, large files, insufficient storage, and cancellation.
