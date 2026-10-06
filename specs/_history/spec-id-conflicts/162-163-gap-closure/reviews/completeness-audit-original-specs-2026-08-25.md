# Feature 162/163 implementation completeness audit — 2026-08-25

## Verdict

ผลการตรวจ 5 รอบ: **ยังไม่ผ่านความสมบูรณ์ 100% ของ spec หลักทั้งสองฉบับ**

มี implementation ที่ใช้งานได้จริงบางส่วน ได้แก่ shared contracts, tenant/Series-scoped admission, Worker job claim, local FFmpeg probe/QC, artifact publication, vector-index enqueue, MCP discovery และ sidebar shell แต่ยังมี gap เชิงฟีเจอร์และ integration ที่ทำให้ไม่สามารถระบุว่า acceptance criteria ของ Feature 162 และ 163 ถูกปิดครบแล้วได้

เอกสาร deep-plan ของทั้งสอง feature ตรวจโครงสร้างได้ครบ 6/6 sections ต่อ feature แต่ผลดังกล่าวยืนยันความครบของแผน ไม่ใช่หลักฐานว่า implementation ครบทุก acceptance criteria

## Round 1 — contract, ownership, security, data boundary

### ผ่าน

- มี shared schemas สำหรับ media root, source/probe/edit/QC, start frame, reference pack, workflow resolution และ capability probe
- server ตรวจ Series/episode/shot ownership ก่อน dispatch และไม่ใช้ frame payload จาก browser เป็น authority
- มี binding revision, idempotency และ artifact checksum/ownership validation ใน publication path

### Gap

- `verticalDramaSeriesAccessService.ts` resolve principal จาก Worker ที่จับคู่กับ owner และ projection query จำกัด `verticalDramaSeries.userId`; ยังไม่ใช่ effective principal ที่รองรับ private/group/tenant sharing policy ตาม Feature 163
- Quick Actions route รับ action ที่ทำงานจริงเพียง `select`; ยังไม่มีชุด action ที่มี eligibility, blocked reason, command/job reference และ bounded operation ตาม spec
- Acceptance checklist ของ spec หลักยังไม่ถูกปิด: Feature 162 เหลือ 47 รายการ และ Feature 163 เหลือ 23 รายการ

## Round 2 — server job flow, workflow routing, publication/index

### ผ่าน

- มีเส้นทาง browser shot dispatch → durable Worker job → claim → artifact proof → Series publication
- Admin workflow policy, allowlist, user override และ immutable workflow resolution มีโครงสร้างใน shared/server contract
- Publication สร้าง `verticalDramaMediaAssets`, ตั้ง vector state และสร้าง idempotent index record
- `verticalDramaMediaIndexWorker.ts` มี tenant/Series metadata, embedding provider และ vector dispatch จริง

### Gap

- index text ที่ส่งเข้า embedding ใน publication path ยังเป็นเพียง `sourceAssetId + kind`; ยังไม่ครอบคลุม transcript, scene, silence/dead-air, subject/object, source time range และ transform data ที่ spec ต้องการ
- ยังไม่พบ grounded retrieval contract ที่ส่ง asset/segment/time-range evidence กลับไปใช้ draft generation/B-roll recommendation อย่างครบวงจร
- ยังไม่พบ implementation เฉพาะของ EpisodeResourcePlan, GPU lease, cost reservation/settlement, per-operation timeout/retry/retention policy, rollout flag และ policy rollback/audit ครบตาม spec

## Round 3 — MCP/native worker/media processing

### ผ่าน

- Worker ใช้ shell-free stdio MCP discovery, `initialize`, `tools/list`, schema validation และ `tools/call`
- local media path ใช้ Rust/FFprobe/FFmpeg, atomic checkpoint และ derived-output QC
- งาน local ถูกจำกัดอยู่ใน root/derived scope และมี failure state เมื่อ binding revision ไม่ตรง

### Gap

- `media_pipeline.rs` ให้ center point เป็น `center_fallback_requires_vision_review`; ยังไม่มี person/object detector, temporal tracking, smoothing, occlusion handling หรือ subject-aware 9:16 reframe จริง
- `automated_ai_editing` ใน payload เป็น processing mode/rationale และตัวเลือก UI แต่ยังไม่ใช่ AI planner ที่สร้าง bounded edit plan จาก evidence พร้อม confidence/explanation/review gate
- `comfy_mcp_client.rs` รองรับ discovery และ single tool call แต่ยังไม่มี submit/watch/wait/cancel/history/queue reconciliation, persistent remote execution ID, reconnect recovery และ duplicate-cost protection ครบตาม adapter lifecycle ใน spec
- generated-shot branch ส่ง start/reference frame metadata เช่น `storageKey` เข้า `run_workflow` แต่ไม่พบขั้นตอน materialize/download/verify ไฟล์เหล่านั้นเข้า isolated local workspace ก่อนเรียก ComfyUI

## Round 4 — Worker App and storyboard UI/UX

### ผ่าน

- มี Sidebar route registry และ legacy route aliases
- มี Series workspace สำหรับเลือก local root, scan, analysis, processing mode, dead-air, aspect ratio และ focus intent
- Storyboard มี per-shot Worker inspector และปุ่ม dispatch/cancel ระดับ queued job

### Gap

- `CanonicalWorkerRouteScreen.tsx` ยังเป็น summary screen สำหรับ overview, queue, published, ai-plan, workflows และ runtime ไม่ใช่ functional screens ตาม Feature 163
- `QuickActionsBar.tsx` เป็นปุ่มนำทางคงที่ ไม่คำนวณ eligibility/prerequisite/blocked state หรือแสดง accepted/blocked job contract
- `MediaWorkspaceHost.tsx` เป็น stage navigation/status card; ยังไม่มี native upload/copy-to-folder, inventory detail, derived preview, approve/exclude, QC action, publish/index status และ recovery controls ครบ
- `VerticalDramaWorkerShotInspector.tsx` ยังเป็น card ที่เลือก Worker และ workflow แรก; ยังไม่มี drawer/sheet ที่รวม source roles, ordered references, 9:16 preview, focus/timeline, AI review, resource route, artifact revisions, QC และ approval
- ยังไม่มี browser/native evidence ของ loading, empty, blocked, stale, revoked, reduced-motion, keyboard/focus restoration และ specified responsive viewports สำหรับ flow นี้

## Round 5 — tests, recovery, runtime and production proof

### ผ่าน

- `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib`: 165 passed
- focused web tests: 3 files / 16 tests passed
- Worker TypeScript typecheck passed
- `git diff --check` ของ target paths ผ่าน

### ยังไม่มีหลักฐานที่จำเป็นต่อการปิด acceptance

- browser E2E ของ Feature 162/163
- packaged Tauri/native UI flow
- live ComfyUI MCP workflow ที่รับ start/reference frames
- GPU scheduling/VRAM/resource exhaustion/cancel/restart recovery
- R2 upload/publication และ vector retrieval บน environment จริง
- migration dry-run/production database verification และ deployment smoke

การรัน `npm --workspace apps/web run typecheck` ในรอบนี้ใช้เวลานานผิดปกติและถูกหยุดเพื่อไม่ให้ค้าง session; จึงไม่นับเป็นผลผ่านของรอบนี้ แม้ focused web tests และผล typecheck จากรอบก่อนหน้าจะผ่านก็ตาม

## Required next implementation wave

1. ทำ subject-aware analysis/reframe จริง พร้อม temporal track, smooth crop path, explicit fallback/review และ automated edit-plan service
2. เพิ่ม typed MCP adapter lifecycle และ frame materialization/verification ใน Worker ก่อน ComfyUI call พร้อม remote execution checkpoint/reconciliation/cancel
3. ขยาย effective principal/access policy, Quick Actions contract และ Series binding/migration receipt ให้ครบ Feature 163
4. แยก canonical Worker screens ให้เป็น functional screens และทำ Media Workspace/Shot Inspector drawer ตาม UI contract
5. เพิ่ม rich media intelligence metadata, grounded Series retrieval, resource/cost/lease/audit/rollback/flag contracts
6. เพิ่ม browser/native/integration fixtures และรัน live ComfyUI, GPU, R2/vector และ migration/deployment proof ก่อนติ๊ก acceptance criteria

## Safety boundary

รอบนี้เป็น completeness audit จึงไม่แก้ source code แบบกว้างหรือเปลี่ยน migration/production state เพราะ gap ที่พบเป็น implementation wave ใหญ่และบางส่วนต้องยืนยัน provider/runtime contract ก่อน การสรุปว่า “ปิด gap หมดแล้ว” ณ จุดนี้จะไม่สอดคล้องกับหลักฐาน
