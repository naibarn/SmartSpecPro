# Gap Review Round 9 — B-roll timeline, Remotion render, and per-shot media editing

วันที่ตรวจ: 2026-08-23

เอกสารนี้เป็น follow-up จาก Feature 160 เพื่อปิด gap ที่พบจากการตรวจว่า
สื่อ B-roll ถูกเลือกได้จากหน้าตอนย่อย แต่ยังไม่ถูกส่งเข้า job-render ด้วยเวลา
ปลายทางที่ชัดเจน และผู้ใช้ยังเปลี่ยนสื่อของแต่ละช็อตได้ไม่ครบ

## ผลการแก้ไขหลัก

- source pack, active binding, UI picker และ render submit ใช้ owner-scoped
  projection เดียวกัน
- still ใช้ `displayDurationSeconds`; footage ใช้ `inSeconds/outSeconds`
- `projectBrollPlacements` คำนวณ `startSeconds/endSeconds` จาก duration ที่ probe
  ได้จริงของคลิปในแต่ละช็อต
- Remotion สร้าง image/video layers ด้วย destination frame และ source trim
  แยกกันชัดเจน และใส่ asset manifest ทุกชิ้น
- media ที่ส่งเข้า B-roll ต้องเป็น R2 storage proxy URL และตรวจ object พร้อมใช้
- ถ้า B-roll render submit ล้มเหลว จะไม่ fallback ไปเส้นทางที่ทำให้ B-roll หาย
- compiled Sub-Episode ที่มี B-roll ถูกทำเครื่องหมาย `brollApplied` เพื่อป้องกัน
 การซ้อนซ้ำใน Production Episode; shot-assembly แบบ raw จะหยุดด้วย error ที่แก้ได้
- เมื่อผู้ใช้เปลี่ยน/นำ B-roll ออก compiled artifact เดิมจะถูก mark stale ทันที
  เพื่อบังคับให้ประกอบ Sub-Episode ใหม่ก่อนนำไปทำ Production Episode
- หน้าตอนย่อยแสดง B-roll ในช็อตที่เรื่องย่อสื่อว่าต้องใช้ และเลือก/เปลี่ยน/นำออกได้

## ตรวจ gap 5 รอบ

### รอบที่ 1 — data contract และ ownership

- ตรวจ binding → snapshot slot → media asset → R2 proxy ครบทุกจุด
- ปิด gap: ไม่ยอมรับ provider/original URL เป็น render asset และตรวจ tenant/user
  ทุก query/mutation

### รอบที่ 2 — timeline และ frame math

- ตรวจการแยก source in/out ออกจาก destination start/end
- ปิด gap: ใช้ duration ที่ probe ได้จริง, เรียงตาม shot/order และ reject overflow
  หรือ shot ที่ไม่มีอยู่ใน assembled timeline

### รอบที่ 3 — Remotion/job-render

- ตรวจ submit → staging → worker URL resolution → template → asset manifest
- ปิด gap: image/video มี layer คนละชนิด, footage มี trim, audio policy ถูกบังคับ
  และ B-roll ไม่ถูกตัดทิ้งเมื่อ Remotion submit fail

### รอบที่ 4 — production composition และ double overlay

- ตรวจ compiled-only/auto กับ shot-assembly
- ปิด gap: compiled artifact ระบุ `brollApplied`; production ไม่ overlay ซ้ำ และ
  raw shot assembly ที่ยังไม่มี B-roll-capable feed ถูก block พร้อมข้อความให้ render
  Sub-Episode ใหม่ก่อน

### รอบที่ 5 — UI/UX และ regression

- ตรวจ source candidate, active binding, replace ด้วย binding เดิม, remove,
  loading/error และการแสดงเฉพาะช็อตที่เกี่ยวข้อง
- ตรวจ focused tests, typecheck และ diff whitespace หลังแก้ไข

## หลักฐานการตรวจ

- `verticalDramaBrollService.test.ts`: projection ของ shot window, sequential
  placement และ overflow
- `verticalDramaRemotionRender.test.ts`: image/footage layer, destination frame
  และ source trim
- `verticalDramaAssembly.test.ts`: assembly regression
- ต้องแยก baseline-wide typecheck errors จาก error ที่เกิดในไฟล์ของ feature นี้
  และระบุ browser/live worker/R2 production checks ที่ยังไม่ได้ทำแยกต่างหาก
