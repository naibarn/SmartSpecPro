# Request

## Original request

แก้ Vertical Drama ให้สร้างภาพหลักตัวละครใหม่ได้ซ้ำโดยไม่ต้องลบภาพเก่า ภาพเก่าต้องอยู่ในประวัติแต่ไม่ถูกใช้เป็น reference สำหรับการสร้างภาพหลักใหม่โดยอัตโนมัติ ขณะที่การสร้างลุคใหม่ยังใช้ภาพหลักเป็น reference และกรณี user แนบหรือเลือกภาพ reference เองต้องใช้ภาพนั้นจริงเสมอ รวมถึงแก้สาเหตุ DNA หาย/สร้าง prompt ไม่ได้จากงานก่อนหน้าโดยไม่ทำให้พฤติกรรมที่แก้แล้วถอยกลับ

## Assumptions and constraints

- เปลี่ยนพฤติกรรมเฉพาะ main portrait generation; look generation และ variant/twin inheritance ต้องรักษา auto reference เดิม
- backend ต้องเป็น source of truth เพื่อป้องกัน caller ใหม่หรือ caller เก่าดึง primary เดิมโดยไม่ตั้งใจ
- explicit `referenceAssetLinkId` ที่ผ่าน ownership scope ต้องมี precedence เหนือ policy ทุกชนิด
- ไม่ลบ asset ประวัติ และไม่ต้อง migration หาก lifecycle เดิม demote primary ได้ถูกต้อง
- ต้องรักษา dirty worktree และแก้เฉพาะไฟล์ที่เกี่ยวข้อง
- SocratiCode MCP ไม่พร้อมใช้งานใน session นี้ จึงใช้ targeted shell discovery แทนและจะระบุไว้ใน handoff

## Non-goals

- ไม่เปลี่ยน provider/model selection ที่ไม่เกี่ยวกับ reference
- ไม่เปลี่ยนการสร้าง DNA schema หรือ backfill ข้อมูลตัวละครย้อนหลังในงานนี้
- ไม่เพิ่มปุ่มลบหรือทำลาย asset history
