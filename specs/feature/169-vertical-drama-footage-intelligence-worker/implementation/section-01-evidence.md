# Deep-implement evidence — Section 01

สถานะ: completed (Worker analysis lane)

สิ่งที่ส่งมอบ:

- Rust classification/capability hints สำหรับ `footage_probe_analyze` และ `footage_prepare`
- materialize source ผ่าน authenticated control-plane endpoint แบบ stream-to-disk พร้อม max-bytes และ SHA-256 verification; ไม่โหลด video ทั้งไฟล์เข้า memory
- ffprobe technical probe, audio/silence analysis และ bounded guide artifact
- direct pinned HyperFrames CLI invocation (`node .../hyperframes/dist/cli.js transcribe`) ไม่ใช้ `npx` ที่ลอยเวอร์ชัน
- required/preferred/disabled transcription policy และ typed unavailable/failed result
- guide มี technical facts, non-silence/silence ranges, scene hints, transcript/word tokens และ conservative tie-in guidance
- checkpoint, heartbeat, artifact upload และ retry-safe terminal event

หลักฐาน:

- runtime CLI help ของ HyperFrames `transcribe` ผ่าน
- Rust worker unit tests ของ `worker_loop::tests` ผ่าน 34 tests
- managed WSL ที่ไม่มี transcription runtime จะคืน partial guide เมื่อ policy เป็น preferred และ fail เมื่อ policy เป็น required ตาม contract

## Runtime completion evidence (2026-08-30)

- Worker App `0.1.196` now uses runtime pack `2026.08.30.1`, which carries a
  pinned `whisper.cpp` executable and the
  `ggml-large-v3.bin` model in the runtime-pack contract, pending official
  signing. The current local WSL2 payload hashes are recorded in
  `runtime-pack/manifest.json` and
  `runtime-pack/SHA256SUMS`; the model is not downloaded during a job.
- The Worker invokes the bundled Node + HyperFrames CLI with an isolated
  `--dir`, then reads the generated `transcript.json` and normalizes
  word-level timestamps into the footage guide. Managed WSL and native runtime
  paths use the same contract, and the blocking process runs off the UI async
  executor.
- A real local smoke run against a generated 3-second WAV completed with
  `ok: true`, `wordCount: 5`, and 5 transcript words. Rust tests: 204 passed;
  Worker frontend build, Node syntax checks, and runtime SHA-256 verification
  also passed.
- Release publication remains fail-closed until the official
  `SHA256SUMS.sig` replaces the repository placeholder. No placeholder
  signature is accepted as production proof.
