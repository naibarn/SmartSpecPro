# Section 03 — Resumable Bin and Library ingest

## Goal

Make Bin the default, support one or many files, and guarantee durable
R2-backed managed assets that can be resumed after reload or network failure.

## Implementation

- Complete `create upload session`, `put part`, `complete`, `abort`, `status`
  and `retry` procedures. The server owns object keys and verifies tenant,
  project, user, byte count, MIME, checksum, expiry, quota and idempotency.
- Select simple PUT for small files and multipart for large files; enforce a
  fixed bounded part size, maximum parts, per-file and project quotas, and an
  abort/expiry sweeper. Store ETags/checksums per part and verify the final R2
  object before creating `media_assets`.
- Bin picker/dropzone accepts video, image and audio with a visible per-file
  state. Multiple files must not share an idempotency key. Cancel removes only
  the session, never an existing asset.
- Library, Media History and Bin use the same managed-asset projection. Drag
  and drop creates a project link/revision; external URLs are imported through
  the server and never persisted in the Worker envelope.

## Tests and proof

Test one-file/multi-file, duplicate retry, resume after reload, abort, checksum
mismatch, quota, expired session, unauthorized project and R2 publication. Stage
with real R2 and capture object metadata plus DB rows.

## Rollback

Keep the old upload path behind a feature flag for existing projects. Do not
expose incomplete sessions as playable media.

## UI/UX Contract

### Target User / JTBD
Editors need to complete the requested media task, understand whether it runs in the browser or Worker, and recover safely from a blocked or failed operation.

### Surface Inventory
The owning editor panel, Worker handoff state, Worker Jobs result/review state, and Dashboard deep link are the required surfaces for this section.

### Component Map
Reuse the existing Phase 3 editor shell and shared operation status components. Add a typed panel state, operation capability badge, progress/error banner and review action where this section owns a user action.

### State Matrix
`idle` → `editing` → `preflight` → `queued` → `running` → `review` → `applied`; `blocked`, `failed`, `canceled`, `stale` and `expired` are explicit recoverable states. No unavailable capability is shown as success.

### Responsive Matrix
Verify the surface at 390x844, 768x1024, 1280x800 and 1440x900. Horizontal timeline overflow is intentional and scrollable; dialogs must remain usable without clipping.

### Accessibility Acceptance
Every action has an accessible name, keyboard path, visible focus, disabled reason and status announcement. Errors identify the next recovery action without exposing tokens, paths or signed URLs.

### Copy Contract
Use `Worker Jobs` / `คิวงาน Worker` for the queue. Use `กำลังตรวจสอบความสามารถ Worker`, `ต้องติดตั้ง Worker adapter`, `รอตรวจสอบผลลัพธ์` and `ผลลัพธ์ล้าสมัย` for the corresponding states.

### Browser Evidence Required
Capture a focused browser trace or screenshot for the happy path and each blocked/error state. Record viewport, operation, capability manifest revision and whether the proof is local, staging or production.
