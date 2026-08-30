# Worker rollout and operations

- ติดตั้ง/ตรวจ runtime pack ที่มี ffmpeg, ffprobe, Node และ pinned HyperFrames/Remotion sidecar ก่อนเปิด capability hints
- ให้ Worker มี root binding ที่ active และใช้ control-plane token/device proof ทุก download/upload/publication
- งาน analysis/prepare เป็น CPU/media lane; งาน B-roll render ต้องผ่าน Remotion contract gate และใช้ concurrency slot เดียวกับ Chromium render
- ตรวจ `worker_jobs`, `worker_job_events`, `worker_artifacts` และ credit reservation ด้วย job idempotency key เมื่อ debug
- transcription `preferred` ยอมให้ guide partial พร้อม warning; `required` ต้องหยุดก่อนสร้าง idea หาก transcription ใช้งานไม่ได้
- ห้ามแก้ source หรือ publication row เมื่อ checksum/binding/QC ไม่ตรง; ให้ retry ด้วย revision ใหม่
