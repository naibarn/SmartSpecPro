# Feature 180 implementation audit — 10 rounds

> Historical 10-round checkpoint. The latest convergence is recorded in [implementation-audit-50-rounds.md](implementation-audit-50-rounds.md).

ตรวจวนหลัง deep-implement ตามลำดับ dependency จาก contract → persistence → scheduler → Worker/cloud → integration → release proof ทุกจุดที่พบถูกแก้ใน workspace หรือถูกปิดเป็น explicit runtime gate

| รอบ | ตรวจ | ผลและการแก้ |
| --- | --- | --- |
| 1 | Shared Zod contracts และ immutable revisions | พบ draft profile ที่ไม่มี reference ถูกบังคับเกิน spec; ปรับให้ draft ไม่มี reference ได้ แต่ ready/clone ต้องมี reference และ policy ต้อง allow binding ที่เลือก |
| 2 | Provider capability matrix | ตรวจ VoxCPM2/Confucius4/MOSS/Fish + cloud catalog/clone; เพิ่ม registry กลางและปิด Fish ด้วย license gate; unknown provider/model fail closed |
| 3 | Queue, billing และ idempotency | พบ direct `worker_jobs` insert และ training run ที่ไม่ผ่าน scheduler; รวมเป็น `queueUnifiedAudioWorkerJob` พร้อม reservation, conflict hash และ refund |
| 4 | Router/service import boundary | bundle `unifiedAudioVoiceService`, `unifiedAudio` router และ app router ผ่าน; เพิ่ม tenant/workspace/project/series ownership และ binding revision checks |
| 5 | Migration/schema parity | ตรวจ SQL กับ Drizzle schema, เพิ่ม workspace columns และแก้ nullable creator ที่ใช้ `ON DELETE SET NULL`; ไม่รัน migration กับ DB จริงในรอบ audit |
| 6 | Worker dispatch/admission | เพิ่ม UnifiedAudio job classifier, capability hints, heartbeat readiness, local/cloud target rejection และ pinned VoxCPM2 LoRA training admission; Rust tests ผ่าน |
| 7 | Reference staging/security | พบ Worker ยังไม่ได้ส่ง bytes ของ reference ให้ adapter; เพิ่ม profile snapshot ใน job payload, download ตาม artifact checksum และ `stagedReferenceAudio` paths; executable ยังคงมาจาก fixed env allowlist |
| 8 | Cloud output/timing | ตัดการประมาณ duration จาก byte size; ใช้ ffprobe กับ bytes จริง, เก็บ checksum/managed artifact/provenance และ refund เมื่อ provider/upload ล้มเหลว |
| 9 | Consent/training lifecycle | เพิ่ม revoke consent/binding, execution-time consent checks, dataset freeze/hash/rights checks, evaluation ก่อน promotion และ compensation เมื่อ training-run persistence ล้มเหลว |
| 10 | Final convergence/proof | focused Web 7 files/48 tests ผ่าน (core subset 4 files/22 tests ก็ผ่าน), Worker `cargo test --lib` 235 tests ผ่าน, TypeScript bundle/import และ Python/Node syntax checks ผ่าน, `git diff --check` ผ่าน; full `tsc --noEmit` ถูกหยุดเพราะ process ใช้ memory จน OOM และไม่รบกวน server |

## Residual release gates

หลังรอบที่ 10 พบและปิด gap เพิ่มเติมสามจุด: route stream reference ของ unified audio ต้องไม่พึ่ง `workerSeriesBindingId`, event sequence ของ TTS ต้องเพิ่มต่อเนื่องไม่ซ้ำกัน และ Worker ต้องประกาศ provider capability ตาม command ที่พร้อมจริง แยก inference/training กัน นอกจากนี้ completion ของ training ถูกผูกเข้ากับการสร้าง candidate model แบบ private เพื่อไม่ให้ run ค้างที่ `queued` หลัง Worker สำเร็จ การตรวจหลังแก้ไขผ่าน route/service bundle, focused Worker provider tests 4/4, Rust compile path และ `git diff --check`.

- ต้องติดตั้งและตรวจ checksum/runtime manifest ของ VoxCPM2, Confucius4-TTS และ MOSS-TTS บน Worker จริง รวมถึง GPU/VRAM calibration ก่อนเปิด local production
- ต้องตั้งค่าและทำ live no-credit probe ของ cloud gateway/provider ที่เลือกก่อนเปิด cloud production
- Fish Speech ยัง disabled ตาม license/GPU gate
- Training ต้องมี operator command ที่สร้าง candidate จริงและ held-out evaluation artifact; หากไม่มีจะ fail เป็น `TRAINING_UNAVAILABLE`
- ไม่มี browser visual evidence ในรอบนี้เพราะ implementation รอบนี้เพิ่ม contract/service/Worker runtime และไม่ได้เปลี่ยน UI component โดยตรง
