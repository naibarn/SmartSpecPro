# Research notes

## Repository evidence

- `apps/worker-app/src-tauri/src/media_pipeline.rs` มี allowlisted FFmpeg, trim, silence analysis, crop/reframe และ QC primitives
- `worker_loop.rs` มี `media_ingest` และ `broll_preprocess` แต่ยังต้องเพิ่ม transcription/guide/final composition stages สำหรับ Special Tie-in
- `worker_executor.rs` ยัง classify `video_assembly` เป็น unknown; ต้องเพิ่ม executor หรือใช้ supported `remotion_render_video` route อย่างชัดเจน
- `runtime-pack/hyperframes` และ bundled `node/bin/hyperframes` แสดงคำสั่ง `transcribe`, รองรับ word-level timestamps และโมเดล `large-v3`
- Server `hyperframesTranscriptionService.ts` เป็น reference implementation แต่ปัจจุบันทำงานบน Server detached worker; ห้ามใช้เป็น implicit Special Tie-in fallback
- Remotion generic template รองรับ video layers, timing, trim, mute/volume และเหมาะกับ final B-roll composition หลัง asset พร้อม

## Runtime risks

- HyperFrames package, app dependency และข้อความตรวจ version มี drift ต้อง pin ให้ตรงกัน
- CLI presence ไม่ได้พิสูจน์ว่ามี `whisper-cli` binary หรือ `ggml-large-v3.bin`
- Thai transcription ต้องใช้ model/capability ที่ผ่าน doctor และต้องจำกัด concurrency

SocratiCode transport was unavailable in this session; findings were verified with targeted repository search, source reads and bundled CLI `transcribe --help`.
