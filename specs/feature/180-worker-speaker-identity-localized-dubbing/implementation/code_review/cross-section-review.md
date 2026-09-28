# Cross-section integration review

ดำเนิน self-review ข้าม section หลัง implementation เพราะ workspace นี้ไม่มี SocratiCode transport และไม่เปิด sub-agent ตามข้อจำกัดของรอบงาน; ใช้ import graph, focused tests, bundle และ Rust test เป็นหลักฐานแทน

## Findings resolved

- Shared scheduler เป็นจุดเดียวสำหรับ feature flag, idempotency, credit reservation และ worker job creation
- Job payload freeze `voiceBinding` และ `voiceProfile` snapshot ป้องกัน mutable catalog/profile ถูก re-resolve ระหว่างรัน
- Local Worker ตรวจ binding target/provider/model ก่อน spawn และ stage reference/dataset bytes ผ่าน checksum-protected control-plane download
- Cloud adapter จำกัด provider registry, เก็บ managed artifact, probe duration จาก bytes จริง และ reconcile credit เมื่อสำเร็จ/ล้มเหลว
- Consent ถูกตรวจตอน execution พร้อม operation/provider/locale/expiry และ revoke มีผลกับงานใหม่
- Training จำกัด initial lane เป็น VoxCPM2 LoRA และส่งผลไม่มี adapterเป็น `TRAINING_UNAVAILABLE`; ไม่สร้าง mock candidate
- Existing 178/179 audio pipeline และ speaker-aware paths ยังคงเป็น source/plan authority; unified audio เพิ่ม durable artifacts ไม่สร้าง queue หรือ schema runtime ซ้ำ

## Deliberate gates

- Model binaries, GPU calibration, cloud credentials/provider entitlement และ official training command เป็น deployment prerequisites ไม่ถูกปลอมด้วย fixture
- Full TypeScript check ใช้ memory เกิน environment และจบด้วย OOM; ใช้ esbuild/import และ focused Vitest แทนโดยไม่ restart service
- Browser visual pass ไม่ได้รัน เพราะรอบนี้ไม่มี UI component change ใน unified audio implementation
