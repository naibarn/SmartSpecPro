# Request

เพิ่มระบบ backup ฐานข้อมูลทั้งหมดใน SmartSpecPro สำหรับ admin โดยมี UI ใน Dashboard และให้ดาวน์โหลด ZIP ลงเครื่องได้สะดวก

## Confirmed product decisions

- สร้าง ZIP แยก 2 ไฟล์: PostgreSQL full dump และ application-data export
- ใช้ background job พร้อมสถานะและปุ่ม download
- Application export ให้เลือก safe/full ต่อ job
- เก็บไฟล์บน server 24 ชั่วโมงแล้วลบอัตโนมัติ
- ดำเนินการ end-to-end โดยไม่รอ approval เพิ่ม

## Constraints

- ใช้ pattern เดิมของ adminProcedure, BullMQ/Redis, Express download และ Dashboard admin route
- ไม่แตะหรือย้อนกลับ dirty worktree ที่ไม่เกี่ยวข้อง
- ไม่เพิ่ม dependency ถ้าไม่จำเป็น
- ต้อง fail closed เรื่อง admin authorization, path traversal และ partial artifacts

## Non-goals

- scheduled backup, R2 retention, restore UI, Redis/object-media backup
- production migration application, live database dump, browser deployment proof
