# ASR/alignment implementation gap audit — 20 รอบ

วันที่ตรวจ: 2026-09-08
ขอบเขต: ส่วนขยาย ASR/alignment ของ Feature 180, canonical transcript contract, Worker routing/runtime, subtitle UI/export, TTS timing lineage และ scheduler admission

วิธีตรวจ: ตรวจทีละ risk boundary โดยใช้ source, tests และเอกสารเป็นหลัก แก้ code gap ที่พบในรอบนั้นทันที แล้วตรวจซ้ำด้วย focused proof ห้ามนับ provider/GPU/cloud ที่ยังไม่ติดตั้งเป็นความพร้อมใช้งาน

| รอบ | จุดตรวจ | หลักฐาน/การแก้ไข | สถานะ |
|---:|---|---|---|
| 1 | ความสอดคล้องของ spec authority | ปรับ `claude-spec.md` และ parent/section statuses ให้ระบุ core implementation กับ external gates ตรงกัน | ปิดแล้ว |
| 2 | Section manifest | `check-sections.py` ยืนยัน sections 01–08 ครบ 8/8 และไม่มี missing section | ปิดแล้ว |
| 3 | Request/result schema strictness | ตรวจ `audio-transcription.v1` และเพิ่ม validation ของ partial timing, bounds, unavailable evidence, coverage และ granularity | ปิดแล้ว |
| 4 | Source/output lineage | ตรวจ source checksum, source revision, model/runtime/normalizer revision และแก้ transcript/output fingerprint ให้แยก engine/model/runtime/normalizer | ปิดแล้ว |
| 5 | TTS duration authority | พบ byte-size fallback ใน catalog TTS; ลบออกและบังคับ decoded `ffprobe` duration ก่อน persist/timing | ปิดแล้ว |
| 6 | Canonical word coverage | พบ coverage ที่อิง auxiliary top-level words; เปลี่ยนให้คำนวณจาก words ที่อยู่ใน persisted segments จริง | ปิดแล้ว |
| 7 | Segment-only/unavailable words | ปรับ normalizer ให้รักษา source segment text, speaker และ unavailable word evidence โดยไม่สร้างเวลาเทียม; เพิ่ม regression test | ปิดแล้ว |
| 8 | Timing provenance | ส่งต่อ `forced_alignment` จาก provider metadata เมื่อมีหลักฐานครบ และคง `segment_only` เมื่อไม่มี word evidence | ปิดแล้ว |
| 9 | Diarization truthfulness | canonical result จะเป็น `needs_review` และมี warning เมื่อร้องขอ diarization แต่ไม่มี speaker evidence; ไม่ประกาศความสำเร็จเท็จ | ปิดแล้ว |
| 10 | Runtime/model integrity | เพิ่ม SHA-256 verification สำหรับ Whisper binary/model ทั้งตอน execute และ capability readiness | ปิดแล้ว |
| 11 | Runtime path confinement | เพิ่ม canonical symlink escape check ใน `runtime_relative_path`; เพิ่ม Unix regression test | ปิดแล้ว |
| 12 | WSL/local process boundary | ตรวจ path conversion และ shell single-quote ของ runner/input/output; regression เดิมผ่าน | ปิดแล้ว |
| 13 | Output isolation/concurrency | output directory แยกด้วย source checksum + engine + model และล้าง stale JSON ก่อน run; transcript id แยก revision | ปิดแล้ว |
| 14 | Legacy invoke compatibility | optional engine/word/diarization/output args ยังคงทำให้ payload Whisper.cpp เดิมใช้งานได้; UI regression ผ่าน | ปิดแล้ว |
| 15 | UI timestamp validation | UI ปฏิเสธ NaN/Infinity/non-integer, negative, reversed, เกิน segment/video และไม่ใช้ `+3s`/`800ms` fallback | ปิดแล้ว |
| 16 | UI untrusted payload | กัน non-array segments/words และ non-string text/speaker ก่อน map; cue ว่างถูกปฏิเสธ | ปิดแล้ว |
| 17 | Generate → Review → Apply | UI เก็บผลไว้ pending, แสดง Review/export และ Apply แยกกัน ไม่ auto-apply; source ที่ restore จาก project ไม่ถูกล้างตอน workspace switch และปุ่ม missing-source พาไป Media; 82 Worker UI tests ผ่าน รวม whitespace-only source guard | ปิดแล้ว |
| 18 | Subtitle export integrity | เพิ่ม ASS escaping (`\\`, `{}`, newline) และยืนยัน SRT/VTT ใช้ measured bounds; formatter tests ผ่าน | ปิดแล้ว |
| 19 | Scheduler/billing/target admission | ASR/alignment ต้องมี `runtimeGate: signed_ready` ก่อน reserve credits, map `executionTarget`, block cloud request ที่ยังไม่มี adapter และเปิดผ่าน unifiedAudio capability/preflight/queue surface แบบ fail-closed | ปิดแล้ว |
| 20 | Final convergence proof | Web focused 72 tests plus Video Projects regression 163 tests, Worker UI 82 tests, speaker-aware runner 2 tests, Rust lib 243 tests, runtime manifest 13 tests, Worker TS, `cargo check`, section check และ `git diff --check` ผ่าน | ปิดแล้ว |

## Convergence

ไม่พบ code-level `MUST_FIX` คงค้างหลังครบ 20 รอบ การเปิดใช้จริงยังถูกกั้นโดยเงื่อนไขภายนอกที่ระบบตั้งใจ fail-closed 3 กลุ่ม:

1. signed runtime/model และ measured GPU/provider evidence สำหรับ Faster-Whisper/WhisperX/VibeVoice;
2. acoustic `audio.align` runtime สำหรับจัดเวลาจากเสียง TTS;
3. cloud ASR/alignment adapter ที่ผ่าน credential, upload-region/retention, callback authentication และ pricing/quality approval

จึงยังไม่เปิด profile เหล่านี้และไม่มี silent fallback, fabricated timestamp, fabricated speaker identity หรือการอัปโหลด local audio ไป cloud โดยอัตโนมัติ

## Evidence commands

```text
npm --workspace apps/web test -- --run shared/verticalDramaMedia/__tests__/audioTranscription.test.ts shared/verticalDramaMedia/__tests__/contracts.test.ts shared/verticalDramaMedia/__tests__/unifiedAudio.test.ts shared/verticalDramaMedia/__tests__/ttsProviderRegistry.test.ts server/services/__tests__/workerSchedulerService.test.ts server/services/__tests__/queueUnifiedAudioWorkerJob.test.ts server/services/__tests__/unifiedAudioTranscriptionService.test.ts
npm --workspace apps/web test -- --run server/routers/__tests__/videoProjects.crud.test.ts server/routers/__tests__/videoProjects.stages.test.ts server/routers/__tests__/videoProjects.render.test.ts
apps/web/node_modules/.bin/vitest run --root apps/worker-app --environment jsdom tests/media-workspace
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --test runtime_manifest_tests
npm --workspace apps/worker-app run speaker-aware:version
npm --workspace apps/worker-app run speaker-aware:test
npx tsc --noEmit -p apps/worker-app/tsconfig.json
cargo check --manifest-path apps/worker-app/src-tauri/Cargo.toml
uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/180-worker-speaker-identity-localized-dubbing/asr-alignment
git diff --check
```

ข้อจำกัดที่ยังรายงานตามจริง: full Web TypeScript check เคยชน Node heap limit; ยังไม่ได้ production build/restart service และยังไม่มี live model/GPU/cloud/browser proof หรือ paid inference ในรอบนี้
