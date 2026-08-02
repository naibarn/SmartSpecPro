# Staged Auto Review — Final Render ผ่านคิว render-jobs (Remotion) + Subtitle จากบทพูด

สถานะ: APPROVED (ผู้ใช้สั่งตรง 2026-07-30)
คำสั่งผู้ใช้: ขั้นสุดท้ายเมื่อวิดีโอครบทุกช็อต ให้รวมวิดีโอด้วย **Remotion** รองรับ **subtitle/ข้อความ CSS ซ้อน layout** โดย**โยนเข้าคิว render-jobs ไม่ใช่สั่ง render ตรง** — config ทุกอย่างไว้ก่อน (css/ข้อความ/subtitle) และ**ดึงบทพูดเป็น subtitle ตาม timing จริง**

## ข้อเท็จจริงจาก recon (ตรวจแล้ว มี file:line ในรายงาน Explore)

- ปัจจุบัน staged full_video จบที่ `ensureRender` → **Python backend legacy renderer** (ไม่ใช่ Remotion, ไม่มี subtitle) ที่ `marketplaceAutoReviewService.ts:33554-33566`
- โครงคิวมีครบแล้ว (Feature 133): `remotion_render_video` contract ใน `shared/workerRuntime.ts` มี `captionLines {startSec,endSec,text}` (absolute timeline) + `captionPresetId` (10 preset) + `postPasses ["loudnorm","ass_burn"]` + `GenericTemplate` composition รับ video layers ต่อเนื่องได้ตรง ๆ
- **Lane A ทำงานจริงวันนี้**: `queueRemotionRenderVideoJob` → insert `workerJobs` → `dispatchLaneARemotionRenderJob` render in-process (ไม่พึ่ง desktop fleet ที่ตาย) — gate: env `DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED` + tenant flag `remotionRenderVideoJobEnabled`
- **ไม่มี duration จริงของคลิป persist ไว้** — ต้อง ffprobe เอง (reuse `probeDurationSeconds` จาก `verticalDramaEpisodeVideoAssembly.ts:503`)
- **ไม่มี adapter dialogue→captionLines** — ต้องเขียนใหม่ (ผสม pattern `buildCaptionLinesForRender` ของ videoProjects + chunking ของ `shared/hyperframes/subtitleCues.ts`)
- VD/drama ยังไม่มีใครเรียก ass_burn ใน production — implement ครบเฉพาะฝั่ง Video Intelligence Platform

## Design (ตาม seam ที่ recon แนะนำ)

`submitStagedRemotionFinalRender` (service ใหม่) แทน `ensureRender` เฉพาะ staged branch:
1. อ่าน `metadata.videoClipUrls` + `plan.shots` → **ffprobe ทุกคลิป** ได้ duration จริง
2. สร้าง `RemotionTemplateConfig` ตรง ๆ (ไม่ผ่าน videoProjectCompiler): video layer เต็มเฟรม 1080×1920@30fps ต่อช็อต, `startFrame` = cumulative จาก duration จริง
3. สร้าง `captionLines` จาก dialogue/dialogueTurns (ชื่อผู้พูดนำหน้าในโหมดสนทนา) ด้วย chunking อ่านง่าย + offset ตาม timeline จริงเดียวกับ video layers — **ข้อความ = บทที่อนุมัติแล้ว verbatim (facts, ไม่ใช่งาน LLM)**
4. enqueue `queueRemotionRenderVideoJob` + fire `dispatchLaneARemotionRenderJob` → persist `renderJobId`
5. Reconcile: advance tick อ่าน `workerJobs` row → completed ⇒ finalize ผ่าน glue เดิม (`buildRenderFinalizationMetadata`/`addRenderResultToLibrary`) / failed ⇒ surface + retry ได้
6. **Fallback ปลอดภัย**: flag ปิด/enqueue ล้ม → ใช้ `ensureRender` legacy ต่อ + warning `staged_remotion_render_fallback` (additive) — ห้ามทำ run ค้าง
7. Config subtitle: `finalAssembly.subtitlePresetId` (default `classic_box`, `no_subtitle_style` = ปิด) รับผ่าน `editStagedAutoReviewFinalAssembly` — UI select เป็น follow-up ถัดไป

## Follow-ups (นอกขอบเขตรอบนี้)
- UI เลือก subtitle preset/แก้ cue ในพาแนล final checkpoint
- ข้อความ/CSS overlay เพิ่มเติมนอกเหนือ subtitle (text layers ใน template รองรับแล้ว — รอ requirement รูปแบบ)
- ทดสอบจริงบน smartaihub.app run แรก (ต้องเปิด tenant flag `remotionRenderVideoJobEnabled`)
