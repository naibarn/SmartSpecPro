# Admin Database Backup Design

## Goal

เพิ่มระบบสำรองข้อมูลฐานข้อมูลสำหรับผู้ดูแลระบบ โดยสร้างไฟล์ ZIP สองชุดแบบ background:

1. PostgreSQL full dump สำหรับกู้คืนทั้ง schema และข้อมูล
2. Application-data export จากทุก table ในรูปแบบ JSONL พร้อม manifest

Admin เลือกโหมด `safe` (ปกปิดข้อมูลลับ) หรือ `full` (รวมค่าจริงเพื่อการกู้คืน/ย้ายระบบ),
เห็นสถานะงาน และดาวน์โหลดไฟล์แต่ละชุดจากหน้า Admin Dashboard ได้ ไฟล์บน server หมดอายุและถูกลบ
อัตโนมัติหลัง 24 ชั่วโมง

## Existing patterns and fit

- Admin authorization ใช้ `adminProcedure` และ route guard `RequireAdmin` อยู่แล้ว
- Backend รวม router ใน `apps/web/server/routers.ts`
- งาน background ใช้ BullMQ/Redis และ initialize จาก `apps/web/server/_core/index.ts`
- Download ที่ต้องส่งไฟล์ใช้ Express route และ session authentication
- ZIP dependency `adm-zip` มีอยู่แล้ว จึงไม่เพิ่ม dependency ใหม่
- การค้นหา SocratiCode ใช้ไม่ได้ใน session นี้; ใช้ targeted `rg` และอ่านไฟล์เฉพาะจุดแทน

## Architecture

สร้าง module ใหม่แยกความรับผิดชอบเป็น:

- `databaseBackupService`: สร้าง/อ่าน/expire job, ทำ path validation, cleanup
- `databaseBackupExportService`: เรียก `pg_dump`, อ่าน schema/table data, redact safe export,
  สร้าง ZIP และเขียน manifest/checksum
- `databaseBackupJob`: BullMQ queue + worker concurrency 1
- `databaseBackups` tRPC router: admin-only create/list/get
- `databaseBackupRoutes`: admin-only streaming download route
- `AdminDatabaseBackups` page: form, job list, status polling และปุ่ม download

สถานะงาน: `queued -> running -> completed | failed`; เมื่อครบอายุไฟล์จะเป็น `expired`.
มี `backup_jobs` เป็น source of truth เพื่อให้หน้า UI และ worker ใช้ข้อมูลร่วมกัน แม้ web process
จะ restart; ไฟล์ยังเป็น temporary local artifact ภายใต้ backup root ที่กำหนดเท่านั้น

## Data flow

1. Admin เปิด `/admin/database-backups` จากเมนู Admin
2. เลือก safe/full แล้วเรียก `databaseBackups.create`
3. API ตรวจ `adminProcedure`, insert job, enqueue BullMQ job และคืน job id
4. Worker claim job, สร้าง dump ZIP และ application ZIP ใน temporary directory เดียวกัน
5. Worker ตรวจ file exists/non-zero, ZIP integrity, checksum และอัปเดต metadata ก่อน `completed`
6. UI poll `databaseBackups.list` ทุกช่วงสั้น ๆ จน terminal state
7. Download route ตรวจ session + admin role + job state + expiry + artifact type + path containment
8. Cleanup job ลบ artifact ที่หมดอายุและเปลี่ยนสถานะที่ยัง completed เป็น `expired`

ถ้าขั้นตอนใดล้มเหลว worker จะลบ partial files, ไม่ expose command/credential/error stack ให้ client,
เก็บ sanitized error ใน job และ log รายละเอียด server-side พร้อม job id

## Database contract

ตาราง `backup_jobs` มีอย่างน้อย:

- `id`, `createdByUserId`, `mode`, `status`
- `databaseZipPath`, `databaseZipBytes`, `databaseZipSha256`
- `applicationZipPath`, `applicationZipBytes`, `applicationZipSha256`
- `startedAt`, `completedAt`, `expiresAt`, `errorMessage`, `createdAt`, `updatedAt`

ไม่มี `tenantId` เพราะเป็น platform-level admin backup ของฐานข้อมูลทั้งหมด แต่ download/query ทุกจุด
ต้องผ่าน admin authorization และไม่รับ path จาก client

## Export contract

### PostgreSQL dump ZIP

- ใช้ `pg_dump --format=custom --no-owner --no-acl` ผ่าน `spawn` และส่ง `DATABASE_URL` ให้ process
- เก็บไฟล์ dump และ `manifest.json` ใน ZIP
- ไม่ log `DATABASE_URL`
- ถ้าไม่มี `pg_dump` หรือ command ล้มเหลว ให้ fail ชัดเจนและไม่สร้าง completed job

### Application-data ZIP

- enumerate user tablesจาก `pg_catalog`/information schema ใน schema `public`
- แต่ละ table เป็น JSONL แยกไฟล์ พร้อม schema metadata ใน manifest
- `safe`: ค่าในคอลัมน์ที่ตรงกับ denylist/pattern เช่น password, token, secret, api key,
  encrypted credential, session จะถูกแทนด้วย `[REDACTED]`; ไม่เปลี่ยน source DB
- `full`: export ค่าจริงตามสิทธิ์ admin ที่ยืนยันแล้ว
- ชื่อ table/column มาจาก catalog ไม่รับเป็น SQL input จากผู้ใช้ และ identifier ต้อง quote อย่างปลอดภัย
- export ใช้ PostgreSQL cursor batches เพื่อลด memory peak ต่อ table; ZIP writer ยังใช้ `adm-zip` ที่มีอยู่ใน repo
- manifest ระบุ mode, timestamp, table count, row counts, redacted columns และ format version

## Security and abuse controls

- ทุก mutation/query/download ใช้ admin-only authorization; `system_agent` ที่ `adminProcedure`
  รองรับอยู่จะไม่ถูกขยายสิทธิ์เกิน pattern เดิมโดยไม่ตั้งใจ
- จำกัดงานที่ active ต่อครั้งต่อ instance/ระบบ และ rate-limit create เพื่อป้องกัน dump storm
- download route ใช้ allowlist artifact type (`database`/`application`) และ `realpath` containment
  ใต้ backup root ป้องกัน path traversal/symlink escape
- response ใช้ `Content-Disposition: attachment`, `Cache-Control: no-store`, และไม่ส่ง path จริง
- full export มีคำเตือนชัดเจนว่าอาจมี secrets; UI ต้องให้ adminยืนยันก่อนสร้าง
- cleanup ไม่ลบไฟล์นอก job directory และไม่ใช้ glob กว้าง

## UI/UX contract

### Target user / JTBD

- Role: platform admin
- Goal: สร้าง backup และดาวน์โหลด dump หรือ application data จากหน้า Admin โดยไม่ต้องใช้ shell
- Entry point: Admin menu > Database Backups
- Success: เห็น completed status และกด download ZIP แต่ละไฟล์ได้ภายใน 24 ชั่วโมง

### Surface and state matrix

- Page: `/admin/database-backups`
- Form: mode radio/select, warning for full, Create Backup button
- List: timestamp, creator, mode, status, progress text, sizes, expiry, database download,
  application download
- States: initial loading, empty, queued, running, completed, failed, expired, disabled while create,
  focus/hover keyboard states

### Responsive/accessibility

- Required browser evidence: mobile 390x844, tablet 768x1024, desktop 1440x900;
  extended small-mobile/laptop/wide-desktop because the list is data-dense
- Use semantic headings, labeled mode controls, buttons with text, visible focus ring,
  keyboard order, no horizontal overflow, readable status contrast in light/dark modes
- Use existing Dashboard/Admin card/button/badge vocabulary and localization files

## Failure modes and operations

- Database unavailable: job failed, no artifact links, retry by creating a new job
- Redis unavailable: create returns a sanitized service error; no orphan completed record
- Worker restart: queued/running jobs are reconciled on startup; stale running jobs fail safely
- Disk full: preflight available space where possible, fail without deleting unrelated files
- Large DB: worker concurrency 1 and streaming/temporary files avoid request timeout; object storage
  is a future scale option if local disk or multi-instance requirements grow
- Deployment must install the PostgreSQL client package that provides `pg_dump`; migration must be
  applied before relying on the feature. Live migration/provider/browser checks are separate from
  focused repository tests.

## Acceptance criteria

- Non-admin cannot create/list/download backup jobs
- Admin can create safe/full jobs and see both ZIP artifacts independently
- Full dump archive is non-empty and includes restoreable dump payload plus manifest
- App export archive contains all public app tables, correct row counts, and safe redaction behavior
- All completed artifacts have SHA-256, expiry, path containment and ZIP integrity checks
- Partial/expired jobs cannot download
- Files are deleted after 24 hours by cleanup worker
- UI covers loading/empty/running/success/failure/expired and responsive/accessibility states
- Focused Node tests and UI tests pass; typecheck/lint results are reported separately
