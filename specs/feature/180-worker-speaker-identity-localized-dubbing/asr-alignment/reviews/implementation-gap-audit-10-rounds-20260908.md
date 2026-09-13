# ASR/alignment implementation gap audit — 10 rounds

วันที่ตรวจ: 2026-09-08
ขอบเขต: ส่วนขยาย ASR/alignment ของ Feature 180, Web contracts/UI, Worker runtime routing และเอกสาร rollout

หลักการตรวจ: แต่ละรอบตรวจจุดเสี่ยงคนละด้าน แล้วปิดด้วยโค้ดหรือระบุเป็น external gate ที่ระบบ fail-closed อยู่แล้ว ห้ามสรุปว่า provider/model พร้อมใช้งานจาก mock เพียงอย่างเดียว

| รอบ | จุดตรวจ | ผลและการปิด gap | สถานะ |
|---|---|---|---|
| 1 | Contract และ schema version | เพิ่ม `audio-transcript.v1`, request schemas, source artifact/revision/checksum, timing provenance และ strict validation ใน `audioTranscription.ts` | ปิดแล้ว |
| 2 | Timestamp integrity | ปฏิเสธ partial/invalid timings, จำกัด segment/text offsets และ Worker UI ไม่สร้าง `+3s` หรือ `800ms` fallback อีกต่อไป | ปิดแล้ว |
| 3 | ภาษาไทยและ word-level output | เพิ่มการรวมคำไทยโดยไม่แทรกช่องว่างใน Worker segment projection; คำที่ไม่มีหลักฐานเวลาถูกเก็บเป็น unavailable และไม่ส่งต่อเป็น subtitle cue | ปิดแล้ว |
| 4 | Backward compatibility | engine/flags ใหม่เป็น optional, payload Whisper.cpp เดิมใช้ได้, และ manifest เก่าที่ไม่มี `transcriptionProfiles` parse ได้ด้วย serde default | ปิดแล้ว |
| 5 | Runtime readiness | เพิ่ม signed-manifest transcription profile descriptors และ `worker_app_transcription_capabilities`; ตรวจ binary/model/hash/language/feature ก่อนเปิดใช้ | ปิดแล้ว |
| 6 | Provider selection และ fallback | Faster-Whisper, VibeVoice-ASR และ cloud เป็นตัวเลือกที่แสดงตาม capability; ถ้า gate ไม่ผ่านจะคืนเหตุผล unavailable และไม่มี silent fallback | ปิดแล้ว |
| 7 | Runner isolation/security | profile runner รับเฉพาะ path จาก signed manifest, ตรวจ relative path และใช้ shell-single-quote สำหรับ WSL/local arguments | ปิดแล้ว |
| 8 | Canonical artifact/provenance | Worker canonicalize ผลลัพธ์เป็น transcript envelope พร้อม source hash, model/runtime revision, timing origin, coverage และ nullable confidence; ห้าม fabricate evidence | ปิดแล้ว |
| 9 | TTS subtitle lineage | เอา server-side re-transcription ออกจาก TTS caption flow; ใช้ approved script เป็น `script_timed` และสงวน `audio.align` เป็น job type ที่ fail-closed จนมี acoustic runtime จริง | ปิดแล้ว (gate ภายนอกสำหรับ acoustic aligner) |
| 10 | Integration และ proof | Worker job classification รองรับ `audio_transcribe`/`audio_align`, UI มี Generate → review → Apply, targeted Web/Worker/Rust tests ผ่าน; full Web tsc ชน Node heap limit จึงรายงานเป็นข้อจำกัดของ proof | ปิดแล้ว (full Web tsc เป็นข้อจำกัดทรัพยากร) |

## Convergence

ไม่พบ `MUST_FIX` ที่ยังเป็น code gap ในขอบเขตนี้หลัง 10 รอบ การเปิดใช้จริงยังถูกกั้นด้วย external gates ที่ตั้งใจไว้ 3 กลุ่ม: signed runtime/model สำหรับ Faster-Whisper/WhisperX/VibeVoice, acoustic `audio.align` runtime สำหรับจัดเวลาเสียง TTS และ cloud ASR adapter ที่ผ่าน provider/security approval การกั้นเหล่านี้คืนสถานะ unavailable อย่างชัดเจนและไม่ทำให้ระบบเดาข้อมูลหรือ fallback เงียบ

## Evidence commands

```text
npm --workspace apps/web test -- --run shared/verticalDramaMedia/__tests__/audioTranscription.test.ts shared/verticalDramaMedia/__tests__/contracts.test.ts server/services/__tests__/workerSchedulerService.test.ts server/services/__tests__/queueUnifiedAudioWorkerJob.test.ts
apps/web/node_modules/.bin/vitest run --root apps/worker-app --environment jsdom tests/media-workspace
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --test runtime_manifest_tests
npx tsc --noEmit -p apps/worker-app/tsconfig.json
git diff --check
```

ผลล่าสุด: Web targeted 54 tests ผ่าน, Worker UI 76 tests ผ่าน, Rust lib 240 tests ผ่าน, runtime manifest 13 tests ผ่าน, Worker TypeScript ผ่าน และ `git diff --check` ผ่าน Full Web TypeScript check เคยชน Node heap limit โดยไม่มีการ restart service หรือ build production
