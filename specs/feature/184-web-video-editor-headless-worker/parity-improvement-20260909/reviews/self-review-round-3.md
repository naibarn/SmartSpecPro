# Deep-plan completeness audit — ten verification rounds (latest)

ตรวจทานแผนทั้งหมดอีกสิบรอบเมื่อ 2026-09-10 หลังรอบก่อนหน้า โดยอ่าน
`spec.md`, research, interview, synthesized spec, main plan, TDD plan, index
และ sections ทั้งสิบไฟล์ แล้วแก้ gap ที่ยืนยันได้ทันทีในไฟล์ที่เกี่ยวข้อง

## Round 1 — โครงสร้างและการส่งต่องาน

**PASS.** Manifest มี section ครบ 10/10 และทุก section มี goal, ownership,
sequence, UI/UX contract, state/responsive/accessibility, browser evidence,
tests และ risks ไม่มี orphan หรือ section ที่ขาด dependency

## Round 2 — Requirement coverage 18 ข้อ

**PASS.** ตาราง coverage ครบทั้ง 18 ข้อ รวม Bin, keyframe, silence, extract,
AI music, blur, mic, speaker plan, render modes, MP3, subtitle, preview,
frame, ruler, ducking, SVG, AI code และ Transform/Keyframes UX โดยเพิ่ม
subtitle export ให้ completion signal ชัดเจน

## Round 3 — ตรวจเทียบ Worker App controls จริง

**FIXED and PASS.** จาก `MediaVideoEditorPlayer.tsx` และ `MultiTrackTimeline.tsx`
พบรายการที่เดิมยังไม่ระบุเป็นเจ้าของชัดเจน: Compound/Decompose, Ken Burns,
CapCut Draft, Project settings, AI Media Studio, portable project JSON, track
M/S/Duck/Volume, marker show/hide, voiceover monitor/discard-take และการแทน
local folder/Explorer ได้เพิ่ม inventory, owner และ acceptance test ใน main plan,
Section 10 และ TDD plan แล้ว

## Round 4 — Shared envelope และ wire compatibility

**FIXED and PASS.** แยก internal `MediaJobEnvelopeV1` ที่มี typed options,
requester, idempotency และ revision pin ออกจาก wire `MediaJobEnvelope` รุ่นเก่า
ที่มี `inputs/plan/requirements/retry/billing`; ระบุ lossless projection,
required revision และ old-worker rejection แล้วเพิ่ม role registry และ plan-hash
กติกาไม่ให้ retry เปลี่ยน work identity

## Round 5 — Status, event และ callback fencing

**FIXED and PASS.** ใช้ DB statuses เดิมครบและให้ `encoding` เป็น stage event,
reuse `worker_job_events.assignmentId + sequence`, เพิ่ม attempt/lease/sequence
idempotency และ callback authentication/tenant/expiry verification ไม่มี event
ledger ซ้ำหรือ late callback ที่ข้าม lease ได้

## Round 6 — Bin, R2 และเส้นทางโค้ดปัจจุบัน

**PASS.** ระบุแก้ initializer `mediaHistory → bin`, ข้อยกเว้น `libraryItemId`
ที่เปลี่ยนไป Library ชั่วคราว, ปรับ `localPath` เป็น managed asset ref,
single/multipart, per-file/global concurrency, checksum/HEAD/CORS/ETag,
partial success, expiry sweeper และ revoke preview blobs ครบแล้ว

## Round 7 — Persistence, migration และ tenant boundary

**FIXED and PASS.** ระบุ migration ถัดจาก migration ล่าสุดใน Drizzle journal
(0289 มีอยู่ใน worktree ปัจจุบัน จึงใช้เลขถัดไปที่ว่าง เช่น 0290) พร้อม
field/unique/index ของ upload sessions, parts และ analysis artifacts; reuse
`worker_artifacts`; เพิ่ม
กติกา project ที่ยังไม่มี tenant column ต้องตรวจ tenant membership กับ
revision/link tenant ใน transaction เดียว และมี dry-run/rollback/retention

## Round 8 — Media feature and output parity

**FIXED and PASS.** ตรวจ silence inverse undo/source immutability/alignment และ
presets, ducking waveform/EBU R128 metadata, AI music/AI Media Studio, recorder
offset/device privacy, monitor/discard-take, speaker stages, subtitle SRT/VTT
export and provenance, privacy fail-closed, MP3/still roles, และ operation
adapter ทุกตัว (`extract_audio`, `ai_music`, `privacy_track`, `export_mp3`,
`render_still`) มีเส้นทางชัดเจน

## Round 9 — Preview, transform, ruler และ output safety

**FIXED and PASS.** แยก Transform/Keyframes/pin/lock/camera namespace,
image/video parity, pin marker visibility, fit/frame/camera/render-like modes,
safe-area/center/grid guide, custom ratio validation, adaptive ruler, snap
markers, 20+ tracks, frame color/dimension/DPR และ exclusion ของ guide/chrome
จาก output แล้ว

## Round 10 — Security, tests, performance และ rollout

**PASS.** SVG/code sandbox มี opaque origin, CSP, strict postMessage, no
credential cookies, SSRF rejection, deterministic versions/skill pinning;
tests ครอบคลุม parity inventory, migration-เลขถัดจาก journal, upload quota/
session states, legacy-route gating, browser/device/provider mocks, 20-track
performance, active-job fencing, canary/rollback และ pending environment gates
อย่างชัดเจน โดยไม่เรียก repository-wide typecheck ตามคำขอ

## Final scorecard

| Category | Result |
|---|---|
| User requirements | PASS — 18/18 mapped |
| Worker App control inventory | PASS — controls have owners or explicit managed replacement |
| Shared contracts | PASS — internal/wire adapter, roles, hash and CAS defined |
| Upload/media safety | PASS — resumable, bounded, tenant scoped, no local paths |
| Async execution | PASS — capability admission, lease fencing, replay and QC |
| Test/evidence plan | PASS — focused, browser, staging and pending gates separated |

ไม่พบ high-confidence gap ที่ค้างอยู่หลังการแก้ไขรอบนี้ จุดที่ยังรอคือ
environment gates เช่น R2 จริง, Worker claim, GPU, provider credits,
microphone, deployment/restart และ performance run ซึ่งถูกระบุเป็น pending
โดยตั้งใจ ไม่ได้ถูกนับเป็น source-plan completion
