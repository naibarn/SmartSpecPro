# Implementation completeness audit — 10 รอบ

วันที่ตรวจ: 2026-09-10 (Asia/Bangkok)

การตรวจใช้ source inspection, focused Vitest และ esbuild transpile โดยไม่เรียก
repository-wide typecheck ตามข้อจำกัด memory. เมื่อพบ gap ในรอบใด แก้ใน working
tree ทันทีแล้วตรวจซ้ำในรอบถัดไป

| รอบ | ขอบเขตตรวจ | gap ที่พบและการแก้ | ผลตรวจหลังแก้ |
|---:|---|---|---|
| 1 | Shared operation/contract coverage | operation ใหม่บางค่าขาดจาก shared allowlist และ options validation | เพิ่ม `audio_extract`, `audio_export`, `ai_music`, `ai_media_studio`, `privacy_track`, `recording_normalize`, `render_still`; contract tests ผ่าน |
| 2 | Bin single/multiple upload | Bin เดิมไม่มี picker/dropzone/progress/cancel และ deep link ใช้ workspace download | เพิ่ม multi-file managed upload, abort/cancel, project context/link และเปลี่ยน deep link เป็น `importRemoteAsset`; resolver/parity tests ผ่าน |
| 3 | R2 safety/tenant reference | ชื่อไฟล์จาก browser path เข้า storage key ได้ และ upload ไม่ส่ง project context | normalize ด้วย `path.basename`, ส่ง project/idempotency context, ตรวจ ownership ก่อนสร้าง project asset link; esbuild + migration test ผ่าน |
| 4 | Transform/Keyframes/Camera | Smart Camera เป็นเพียง local flag และการแก้กล้อง/Transform ไม่กัน track lock | queue `media.reframe` พร้อม review-required options และเพิ่ม lock guards ใน camera/transform/keyframe handlers; SmartCamera/transform tests ผ่าน |
| 5 | Quick Silence/Extract Audio | Silence sidebar เปิดได้เฉพาะ dialog เดิม และ Worker handoff ของ Extract Audio ยังไม่ canonical | เพิ่มปุ่ม queue `media.silence_detect`; Extract Audio ส่ง `media.audio_extract` เมื่อ handoff พร้อม source range/placement/lineage; silence tests ผ่าน |
| 6 | Ducking/track controls | Ducking ไม่มี waveform envelope และ timeline ขาด solo/track gain | เพิ่ม envelope preview, lock-aware ducking controls, audio-track S/M/volume และนำ gain/solo ไป preview/legacy render/canonical project; Timeline tests + esbuild ผ่าน |
| 7 | AI/recording/speaker/subtitle | Speaker panel เคยมีผลลัพธ์ตัวอย่างที่ทำให้ดูเหมือนวิเคราะห์เสร็จ | ลบ mock result; panel แสดงสถานะรอ Worker, consent/provenance และ error state; parity panel tests ผ่าน |
| 8 | Blur/privacy | blur region ยังไม่มีเงื่อนไข fail-closed และ tracking queue | เพิ่ม region requirement, object tracking option, `failClosed:true`, explicit Worker status และ output role `privacy_track`; contract/parity tests ผ่าน |
| 9 | Render/preview/export | MP3/frame/current-frame และ render mode ไม่ได้ผูกกับ canonical queue ครบ; text preview z-index ผิด | เพิ่ม Auto/Manual Remotion/FFmpeg/GPU, MP3, still/frame queue, current-frame action และแก้ z-index เป็นลำดับ 1-based; Export/Preview/executor tests ผ่าน |
| 10 | Timeline/ruler/symbol/code/persistence/results | ruler มีแต่ major ticks, migration สำหรับ upload/analysis ไม่มี, queue label ไม่ครอบคลุม operation ใหม่ | เพิ่ม minor ticks, migration `0290`, Drizzle schema/types, job labels และ declarative SVG/code panels; migration/contract tests และ static coverage audit ผ่าน |

## Final static coverage checks

คำสั่งตรวจ operation map, default Bin, managed callback, Smart Camera queue,
Silence queue และ migration tables รายงาน `PASS` ทุกข้อ. `git diff --check`
รายงานผ่าน และ esbuild transpile ไฟล์ที่แก้ทั้งหมดผ่าน

การตรวจ static convergence รอบสุดท้ายแยก 10 assertion ตามลำดับ contract,
schema, router, job map, executor policy, Bin, Library, camera/lock, timeline
และ output/persistence รายงาน `PASS` ครบ 10/10.

## Post-audit hardening — รอบ 11

หลังปิดรอบ 10 มีการตรวจซ้ำก่อนส่งมอบและพบ gap เล็กน้อยจากเส้นทาง runtime:

- `ProjectBinPanel` ต้องผูก `projectId` ใน dependency ของ upload callback เพื่อไม่
  ใช้ context ของโปรเจกต์เดิมหลังสลับโปรเจกต์ และยังต้องคง cancel state จนกว่า
  loop อัปโหลดจะจบ เพื่อไม่ให้ upload ใหม่ชนกับ loop เดิม
- `SpeakerPlanPanel` มีการอ้าง state ที่ไม่มีอยู่ในปุ่มล้างผลวิเคราะห์ จึงลบ
  reference นั้นและคงสถานะผลลัพธ์แบบรอ Worker โดยไม่สร้างผลปลอม
- `VoiceRecorderPanel` ต้องส่ง `projectId` และ idempotency key ตอนเก็บ take เพื่อ
  ให้ server link asset เข้าโปรเจกต์ได้เหมือน Bin upload
- Library/Media History และ drag/drop import ต้องส่ง project context เดียวกัน
  และ cache key ต้องแยกตามโปรเจกต์ เพื่อไม่ให้ asset จากโปรเจกต์หนึ่งหลุดไปอีก
  โปรเจกต์หนึ่ง
- AI Music ต้องมี BPM, คีย์, เครื่องดนตรี, loop/fade และภาษา พร้อม validation
  ก่อน queue; recorder เพิ่ม input meter, MIME/channel/sample-rate metadata และ
  monitor playback; speaker plan เพิ่ม diarization, speaker hint, silence policy
  และ subtitle option
- label เดิมของ route alias `render-jobs` ใน locale ถูกปรับเป็น “Worker Jobs” /
  “คิวงาน Worker” เพื่อให้เมนูและข้อความจาก Worker App สื่อความหมายเดียวกัน

แก้ครบแล้ว ตรวจ `esbuild` ของ Phase3/Bin/Speaker ผ่าน, final focused regression
ผ่าน 17 files / 67 tests, convergence assertions รอบล่าสุดผ่าน 10/10 และ
`git diff --check` ผ่าน.

หลังจากนั้นปิด local schema gate ด้วย `npm --workspace apps/web run db:migrate`
สำเร็จ และตรวจพบตาราง additive ของ Feature 184 ครบ 6 ตารางใน PostgreSQL
(`video_editor_project_revisions`, `video_editor_project_assets`,
`video_editor_project_jobs`, `video_editor_upload_sessions`,
`video_editor_upload_parts`, `video_editor_analysis_artifacts`).

## สิ่งที่ยังเป็น environment gate

การตรวจ 10 รอบนี้ไม่ปลอมหลักฐาน runtime และบันทึกสถานะก่อน hardening รอบ 11–20:
ขณะนั้น Worker App มี executor จริงเฉพาะ `editor_video_render` และ operation ขั้นสูง
จะไม่ถูก claim หากไม่มี capability ที่ตรงกัน. หลัง hardening ปัจจุบัน Worker มี
native executor สำหรับ probe/proxy/waveform/thumbnail/analysis/silence-detect,
audio extract/export/normalize, render still และ full render ส่วน AI/ASR/diarization/
vision ยังถูก capability-gated จนกว่าจะมี adapter และ authenticated staging proof.
ยังต้องทำ authenticated staging proof สำหรับ R2 multipart, Worker claim/lease/callback/
artifact, Remotion/FFmpeg/GPU, provider เครดิต, microphone hardware และ browser
screenshots ก่อนเปิด rollout cohort. Local web server ผ่าน pre-flight (`DB + Redis OK`)
แล้ว แต่หยุดเพราะพอร์ต `3000` ถูกใช้งานอยู่.

## Post-audit hardening — รอบ 12

ตรวจชื่อเมนูและข้อความจาก Worker App ที่ยังใช้คำว่า render แล้วปรับ locale ของ
route alias ให้แสดง “Worker Jobs” / “คิวงาน Worker” โดยยังคง `/render-jobs` เป็น
compatibility alias. `useMenuItems`, `workerJobsRoute` และ `RenderJobsPage` ผ่าน
3 files / 28 tests; `workerEditorProject` ผ่านเพิ่มอีก 1 file / 5 tests. การ
ตรวจ static 10 assertions วนซ้ำ 10 รอบยังผ่าน 10/10.

## Post-audit hardening — rounds 13–14

The runtime statement was stale after the Worker expansion. It was corrected to
list the native FFmpeg/FFprobe operation subset and operation-level claim tokens;
AI/ASR/vision work remains explicitly adapter-gated. Redis evidence was also
updated: local boot passed DB+Redis preflight and only encountered an occupied
port. The initial hardening snapshot had 246 Rust unit tests; the latest rerun
has 248 passing tests, including the waveform threshold and advanced-operation
capability-gate regressions.
