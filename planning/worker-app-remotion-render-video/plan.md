# Worker App — รองรับ `remotion_render_video` (Lane B ดึงงานจากคิว render-jobs)

สถานะ: PLANNED (รอเริ่ม) — 2026-07-30
เป้าหมาย: Smart AI Hub Worker App (`apps/worker-app`, Tauri/Rust + Node sidecars) claim งาน
`remotion_render_video` จากตาราง `workerJobs` แล้ว render บนเครื่อง worker จริง
เพื่อย้ายภาระ Chromium/ffmpeg ออกจาก smartspec-web (Lane A ปัจจุบันเสี่ยง cgroup MemoryHigh 1.25GB)

## ข้อเท็จจริงจากโค้ด (ตรวจแล้ว)

| ชิ้นส่วน | สถานะวันนี้ |
|---|---|
| Job contract `RemotionRenderVideoWorkerInput` | ✅ ครบ (`shared/workerRuntime.ts:1419` — `.strict()`, golden fixtures, capability families `["remotion-render","chromium-render","ffmpeg-probe"]`) |
| Server claim + capability gate | ✅ มี (`workerSchedulerService.ts:260-332` — enforce `requirements.capabilityFamilies` ตอน claim) |
| Artifact upload protocol ฝั่ง Rust | ✅ มี (`worker_control_plane.rs` — `WorkerArtifactInit` + upload_token, 3 attempts, 30min timeout) |
| Progress-stage vocabulary ฝั่ง Rust | ✅ มีครบ 10 stage ของ remotion แล้ว (`worker_executor.rs:50-53`) — groundwork Phase 10 บางส่วนเริ่มไว้ |
| Remotion sidecar | ⚠️ มีแต่**ผิด contract** — `runtime-pack/remotion-sidecar/render.mjs` รับ `remotion_final_composite` (manifest+workspace) ไม่ใช่ `remotion_render_video` (template+captionLines+postPasses) |
| Rust executor branch | ❌ `worker_executor.rs:379-380` รับเฉพาะ `hyperframes_final_composite` — job type อื่น reject |
| Fleet | ❌ ตาย — 1 เครื่อง heartbeat ล่าสุด 2026-06-27 |
| Reference implementation ที่ต้อง replicate | `executeRemotionRenderVideoJob` (`server/workers/hyperframesRenderWorker.ts:2196`) — 10 stages: resolve_inputs → stage_assets (sha256 verify!) → bundle_composition → select_composition(GenericTemplate) → render_frames → run_post_passes(loudnorm/ass_burn/segment_concat) → verify_outputs(ffprobe) → upload_artifacts → server_verify → publish |

## Phases

### P1 — Sidecar variant `remotion_render_video` (Node, งานหลัก)
ไฟล์: `apps/worker-app/runtime-pack/remotion-sidecar/` (เพิ่ม mode ใหม่ ไม่แตะ final_composite เดิม)
- รับ argv `render-video --payload <path RemotionRenderVideoWorkerInput JSON> --workspace <dir> --output-dir <dir>` โปรโตคอลเดิม (`SMARTAIHUB_EVENT` progress lines — 1 line ต่อ stage ทั้ง 10)
- **Reuse โค้ด server ตรง ๆ ที่สุด**: แตก logic pure ของ `hyperframesRenderWorker.ts` (stage_assets checksum, `buildAssBurnSubtitleFileContent`, `remotionPostPassArgs.ts`, bundle/select/renderMedia ผ่าน `@smartspec/remotion-render`) เป็น shared package function ที่ทั้ง Lane A และ sidecar import ร่วมกัน — **ห้าม copy-paste** ไม่งั้น drift แน่ (คลาสเดียวกับ skill twins)
- Chromium/ffmpeg: ใช้ `runtime-pack/browser/` + `runtime-pack/bin/` ที่ bundle อยู่แล้ว (`browserExecutable` override — comment ใน sidecar เดิมยืนยันวิธีนี้)
- Validate payload ด้วย `remotionRenderVideoWorkerInputSchema` เดียวกัน (import จาก shared) — parse fail = fail ทันทีด้วย `contract_version_unsupported`

### P2 — Rust executor branch
ไฟล์: `worker_executor.rs`, `worker_control_plane.rs`, `executor_state.rs`
- `classify_job_type` + ปลด guard `:379-380`: เพิ่ม `remotion_render_video` → spawn remotion-sidecar mode ใหม่
- เขียน payload JSON ลง workspace, แปลง `SMARTAIHUB_EVENT` → progress report (stage enum ตรงกับ `REMOTION_RENDER_VIDEO_PROGRESS_STAGES`), map failure → `REMOTION_RENDER_VIDEO_FAILURE_CODES`
- upload mp4 ผ่าน `WorkerArtifactInit` protocol เดิม → รายงาน `outputJson.outputUrl` shape เดียวกับ Lane A (reconcile ฝั่ง server อ่าน field นี้อยู่แล้ว — ห้ามเปลี่ยน shape)
- ประกาศ capability families `["remotion-render","chromium-render","ffmpeg-probe"]` ตอน register/claim (ตรวจ `control_plane.rs` ว่าประกาศที่ registration หรือ per-claim)

### P3 — Routing: **Lane B เท่านั้นสำหรับ marketplace/VD (คำสั่งผู้ใช้ 2026-07-30)**
> **นโยบาย: ห้าม render Remotion บน smartspec-web เด็ดขาด** — memory ไม่พอแน่นอน
> (cgroup MemoryHigh 1.25GB + Chromium) งาน Remotion ของ marketplace/VD ต้องไป Worker App เท่านั้น
- **P0 (ทำทันที ก่อน Worker App เสร็จ):** ตัด `dispatchLaneARemotionRenderJob` ออกจาก
  `marketplaceAutoReviewStagedRemotionRender.ts` และ `verticalDramaRemotionRender.ts`
  — job เข้าคิว `workerJobs` แล้ว**รอ Lane B claim อย่างเดียว**
- **TTL fallback ต้องถอยไป renderer เดิม (ไม่ใช่ Lane A):** ไม่ถูก claim ภายใน X นาที
  (default 10) → reconcile เคลียร์ render refs แล้ว marketplace ถอยไป `ensureRender`
  legacy / VD ถอยไป ffmpeg assembly queue + reason code `*_remotion_worker_unavailable`
  — UI แจ้งชัดว่า "ไม่มีเครื่อง worker ออนไลน์ ใช้ renderer เดิมแทน"
- videoProjects (`/video-studio`) เป็นข้อยกเว้นเดิมที่ใช้ Lane A อยู่ — นอกขอบเขต ไม่แตะ
- Flag เปิด Lane B ราย tenant เมื่อ fleet พร้อม (default: คิว+TTL fallback ตามข้างบน)

### P4 — Fleet revival + doctor
- `hyperframes:doctor` ขยายเช็ค: Chromium, ffmpeg/ffprobe, font ไทย, `@smartspec/remotion-render` resolve ได้, disk space
- เอกสารติดตั้ง worker เครื่องใหม่ + heartbeat monitor (แจ้งเตือนเมื่อ fleet ว่าง แต่ flag Lane B เปิดอยู่)

### P5 — Verify end-to-end
- Golden fixture round-trip: payload จาก `shared/__fixtures__/remotionRenderVideoWorkerInput-*.json` render ผ่าน sidecar บนเครื่อง dev → เทียบ duration/track กับ Lane A output
- ยิงงานจริงจาก marketplace staged run + VD option บน smartaihub.app โดยเปิด Lane B flag เฉพาะ tenant ทดสอบ

## ความเสี่ยง

| เสี่ยง | กัน |
|---|---|
| Sidecar/Lane A drift (2 implementation) | P1 บังคับ shared package ไม่ copy |
| Job ค้างเมื่อ fleet หาย | TTL fallback → Lane A (P3) — ห้าม ship Lane B โดยไม่มีข้อนี้ |
| เครื่อง worker ไม่มี font ไทย → subtitle พัง | doctor เช็ค font (P4) + `ass_burn` ใช้ font ใน runtime-pack |
| Contract `.strict()` — field ใหม่ทำ golden fixture แตก | sidecar ใช้ schema shared ตัวเดียวกัน ไม่ประกาศซ้ำ |
| worker-app เป็น Tauri desktop — server headless รันไม่ได้ | ระบุชัด: Lane B สำหรับเครื่อง desktop จริงเท่านั้น; server ยังคง Lane A |

## ลำดับส่งมอบ
P1+P2 คู่กัน (ทดสอบด้วย fixture บนเครื่อง dev ได้โดยไม่แตะ server) → P3 (flag ปิด default = zero risk) → P4 → P5
