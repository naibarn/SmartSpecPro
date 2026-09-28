# Interview transcript — Feature 169

ไม่มีคำถามค้างจาก stakeholder เพราะ requirements ถูกยืนยันให้ทำต่ออัตโนมัติ

## Q1 — งานหนักอยู่ที่ใด

คำตอบ: ffprobe, transcription, dead-air trim, preparation และ render ต้องทำใน Worker; Server ทำ auth, metadata, job state, Skill และ credit ledger

## Q2 — ความปลอดภัยของการตัดต่อ

คำตอบ: source ต้อง immutable; middle silence เป็นข้อเสนอให้ user อนุมัติ ไม่ตัดช่วงพูดหรือ meaningful pause โดยอัตโนมัติ; ทุกผลลัพธ์เป็น derived artifact พร้อม time map และ QC

## Auto-Decisions

- ใช้ runtime pack/manifest เป็น authority และ direct bundled CLI launcher
- ใช้ existing authenticated worker event endpoint และ local event outbox
- ใช้ Remotion GenericTemplate executor ที่ repository รองรับอยู่แล้ว
- ใช้ Rust unit/integration tests, runtime doctor, fixture media และ authenticated E2E เป็นหลักฐาน
