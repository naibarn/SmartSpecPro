# Request

เพิ่มให้หน้าเครดิตสามารถ filter แหล่งที่มา กำหนดวันที่เริ่มต้นและสิ้นสุด โดย default ย้อนหลัง 1 เดือน และแสดง summary เครดิตเข้า / เครดิตออก / ยอดสุทธิจากรายการที่ตรงกับ filter เท่านั้น

## Repository assumptions

- หน้าหลักคือ `apps/web/client/src/pages/Credits.tsx`
- `credits.history` มี filter `sourceType`, `startDate`, `endDate` อยู่แล้ว
- ต้องรักษา response ของ `credits.history` เป็น array เพราะ Dashboard ใช้งานอยู่
- summary ต้อง aggregate จากฐานข้อมูลทุก row ที่ตรง filter ไม่ใช่เฉพาะ page ปัจจุบัน

## Non-goals

- ไม่แก้ schema/migration
- ไม่เปลี่ยน summary ของ OCR/context report หรือ balance ปัจจุบัน
- ไม่เพิ่ม export หรือ report format ใหม่
