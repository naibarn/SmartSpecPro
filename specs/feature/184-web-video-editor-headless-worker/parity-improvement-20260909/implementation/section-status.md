# Feature 184 parity implementation status

ตรวจ implementation ครบทั้ง 10 sections ใน working tree โดยยึด shared contract
เดิมและไม่สร้าง queue ใหม่ งานที่แก้เป็น additive และคง legacy adapter ไว้สำหรับ
เส้นทางที่ยังต้องรองรับ

| Section | ผลลัพธ์ที่ลงโค้ดแล้ว | จุดเชื่อมต่อหลัก | หลักฐานเฉพาะส่วน |
|---|---|---|---|
| 01 shared contracts | เพิ่ม operation allowlist, typed options, failure categories, transform/keyframe validation และ executor map | `packages/shared/src/video-editor/`, `editorMediaJobContract.ts`, `editorExecutorPolicy.ts` | contract/security tests, executor policy tests |
| 02 Bin/R2 ingest | Bin เป็นค่าเริ่มต้น, picker หลายไฟล์, dropzone, progress/cancel, managed upload/import, link เข้า project เมื่อมี project ID, basename-safe storage key | `ProjectBinPanel.tsx`, `webAssetResolver.ts`, `mediaJobs.ts`, migration 0290 | parity panel, resolver, migration tests |
| 03 Transform/keyframes/camera | แยก Transform กับ Keyframes, lock guard, image/video pan/zoom, camera settings และ `media.reframe` Worker handoff | `OverlayPanel.tsx`, `SmartCameraPanel.tsx`, `PreviewPlayer.tsx`, `VideoEditorPhase3.tsx` | transform, SmartCamera, PreviewPlayer tests |
| 04 silence/audio/ducking | Quick Silence Cut มีทั้ง review dialog เดิมและปุ่ม queue, Extract Audio ใช้ canonical operation เมื่อ handoff, ducking envelope/presets และ mute/solo/track gain | `SilenceDetectionPanel.tsx`, `VideoEditorPhase3.tsx`, `AudioDuckingPanel.tsx`, `Timeline.tsx` | silence/transform/timeline tests |
| 05 AI/recording/speakers/subtitles | เพิ่ม AI Music, AI Media Studio, Voice Recorder, Speaker Plan และ Subtitle SRT/VTT พร้อมสถานะ queue/consent/provenance; ไม่สร้างผลลัพธ์ปลอม | panel files ใน `components/videoeditor/` | parity panel tests, esbuild checks |
| 06 blur/tracking | region blur, strength, object tracking และ fail-closed queue `media.privacy_track` | `BlurPanel.tsx`, `editorExecutorPolicy.ts` | parity panel test, contract validation |
| 07 render/exports | Auto/Remotion/FFmpeg/GPU selector, MP3, still/frame export และ current-frame Worker handoff | `ExportDialog.tsx`, `VideoEditorPhase3.tsx` | ExportDialog/executor tests |
| 08 preview/ruler/timeline | save current frame action, text z-order parity, minor ruler ticks, horizontal/vertical scrolling, multi-track headers, mute/solo/volume/lock/visibility | `PreviewPlayer.tsx`, `Timeline.tsx`, `VideoEditorPhase3.tsx` | PreviewPlayer/Timeline tests |
| 09 symbols/AI code | sanitized stock SVG catalog, CSS/React/Three declarative preview, explicit approval และ typed queue | `SymbolCatalogPanel.tsx`, `CodeOverlayPanel.tsx` | parity panel test, esbuild checks |
| 10 persistence/results/rollout | additive upload/session/analysis migration, queue labels, `/worker-jobs` navigation, operation-to-job mapping และ project asset link | `0290_feature_184_video_editor_media_sessions.sql`, `schema.ts`, `RenderJobsPage.tsx` | migration/contract tests |

## Known environment gates

การตรวจนี้ยืนยัน source, contract, focused tests และ transpile ได้ แต่ยังไม่ใช่
หลักฐาน production round trip. Worker App ตอนนี้มี executor จริงสำหรับ operation native ของ FFmpeg/FFprobe ได้แก่
probe, proxy, waveform, thumbnail, analysis, Quick Silence Cut, audio extract,
MP3, normalize, render still และ full render. งาน AI/ASR/diarization/vision
ยังถูก capability-gated ด้วย operation token และจะไม่ถูก claim จนกว่าจะมี adapter,
signed R2 asset และ authenticated staging proof.

ยังไม่ได้รัน repository-wide `typecheck` ตามคำขอเพื่อหลีกเลี่ยงปัญหา memory และยัง
ไม่ได้ทำ deployment/restart, real R2 multipart, GPU/provider credit, microphone
hardware matrix หรือ browser screenshot proof จาก environment นี้ การบูต local
server ผ่าน pre-flight (`DB + Redis OK`) แล้วหยุดเพราะพอร์ต `3000` ถูกใช้งานอยู่;
`db:migrate` ของ PostgreSQL local ผ่านและตรวจตาราง Feature 184 ครบแล้ว
