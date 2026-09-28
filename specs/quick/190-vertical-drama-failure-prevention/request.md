# Request

## ผู้ขอ

ทีม SmartSpecPro

## คำขอ

วางแผนปรับปรุง Vertical Drama ให้สมบูรณ์ เพื่อป้องกันเหตุการณ์ที่ storyboard ถูกหยุดด้วย high-risk policy context จาก automatic repair ทั้งที่เนื้อหาเป็นฉากปกติ และเพื่อให้การหยุดของ worker/server ระหว่างงานยาวไม่ทำให้งานค้างหรือเริ่มสร้างซ้ำโดยไม่ตั้งใจ

## เหตุการณ์อ้างอิง

- หน้าจอ episode 296 ของ series 58 หยุดที่ `storyboard_shotgrid` และแสดงข้อความให้ review preserved candidate ก่อนสร้าง media
- ข้อมูลที่ตรวจแบบ read-only พบ finding `graphic_violence` ระดับ high ใน shot 7
- เนื้อหาจริงเป็นข้อความไทยที่มีคำว่า `ประกาศพัก`; detector แบบ `includes("ศพ")` มองตัวอักษรข้ามขอบคำเป็น `ศพ` จึงเกิด false positive
- หลังแก้ detector และ replay candidate เดิมแบบไม่เรียก provider พบว่าไม่เหลือ finding; focused safety/story-job tests ผ่าน 51 tests

## ผลลัพธ์ที่ต้องการ

1. เนื้อหาที่ปลอดภัยไม่ถูกบล็อกเพราะ substring หรือ metadata ที่ไม่ใช่ story intent
2. เนื้อหาที่เสี่ยงจริงยัง fail-closed และมีหลักฐานว่าเกิดจาก field/shot ใด
3. automatic repair มีขอบเขตชัดเจน เก็บ candidate เดิมและ findings ให้ผู้ใช้ตรวจได้ และไม่ใช้เครดิตซ้ำโดยไม่จำเป็น
4. งาน story ที่ worker/server restart หรือ BullMQ delivery สะดุด สามารถ resume จาก checkpoint เดิมได้ โดยไม่สร้างซ้ำและไม่คิดเครดิตซ้ำ
5. ผู้ใช้เห็นสถานะที่ truthful: กำลังทำงาน, recoverable, ไม่มี checkpoint, ถูก policy block, สำเร็จ หรือรอ operator
6. deployment/restart มี readiness, drain, reconciliation และ alert ที่ป้องกันงานค้างเงียบ

## ขอบเขต

- ครอบคลุม story generation, storyboard safety gate, repair/recovery, job lifecycle, UI status และ production rollout
- รองรับภาษาไทยและอังกฤษก่อน และออกแบบ marker registry ให้เพิ่มภาษาได้
- ใช้ existing Redis job record, checkpoint, BullMQ และ durable assurance run เป็นฐาน

## ไม่อยู่ในขอบเขต

- ไม่ bypass safety gate ทั่วระบบ
- ไม่ลบหรือเขียนทับ authored dialogue, story candidate, media history หรือเครดิตเดิม
- ไม่ regenerate หรือเรียก provider ระหว่างการวิเคราะห์/ทดสอบ
- ไม่ deploy, restart production หรือ run migration ในงานวางแผนนี้

## สมมติฐาน

- งานใน `specs/quick/179-storyboard-policy-recovery/` และ `specs/quick/001-vertical-drama-checkpoint-recovery/` เป็น baseline ที่มีการลงมือทำแล้วบางส่วนและต้อง audit ต่อ ไม่ใช่ให้ทำซ้ำทั้งหมด
- ถ้าไม่พบความจำเป็นด้าน query/retention ระหว่าง implement จะยังไม่เพิ่ม schema migration ใหม่
