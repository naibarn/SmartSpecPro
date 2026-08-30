# Research findings — Feature 169

## Codebase

- `media_pipeline.rs` มี allowlisted FFmpeg/FFprobe, silence/trim/crop/QC primitives
- `worker_loop.rs` มี claim/heartbeat/event retry และ media job plumbing
- `runtime-pack/manifest.json` ระบุ bundled Node, HyperFrames package, FFmpeg/FFprobe และ sidecar paths; `runtime_manifest.rs` ตรวจไฟล์สำคัญ
- HyperFrames CLI รองรับ `transcribe`, `--language`, `--model`, `--json` และให้ word-level timestamps
- `packages/remotion-render` GenericTemplate รองรับ timed video layers, trim, muted/volume
- Existing `video_assembly` path ไม่ใช่ executor ของ feature นี้; ต้องเพิ่ม catalog/adapter ให้ route ใหม่ชัดเจน

## Testing

Worker ใช้ Rust Cargo tests จาก `apps/worker-app/src-tauri`; shared Web contract fixtures ต้องใช้ร่วมกันกับ Worker. ต้องแยก unit, media fixtures, runtime doctor, event recovery, render QC และ authenticated E2E

## Constraints

SocratiCode transport unavailable; ใช้ targeted repository search/source reads. Package/runtime versions มี drift จึงต้อง pin และตรวจ doctor ก่อน enable feature. ห้ามแก้ unrelated dirty worktree.
