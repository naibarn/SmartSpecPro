# Request

เพิ่มการสร้างโลโก้ PNG พื้นหลังโปร่งใสในหน้า Vertical Drama Settings สำหรับโลโก้ชื่อเรื่องและโลโก้ชื่อช่อง โดยเลือกเฉพาะ image model ที่รองรับ native transparent background, สร้าง prompt ตั้งต้นตาม requirement, เปิดให้แก้ prompt, ยืนยันก่อน generate, preview ผลลัพธ์ และยืนยันอีกครั้งก่อนแทน watermark เดิม

## Assumptions

- โลโก้ชื่อเรื่องใช้ series title ที่มีอยู่แล้ว
- โลโก้ชื่อช่องถามชื่อช่องใหม่ใน dialog ทุกครั้งที่เริ่ม flow
- การ apply จะคง placement settings เดิมและตั้ง slot เป็น enabled image watermark
- ใช้ existing async media task, credit, task polling และ Vertical Drama managed-media durability
- ไม่มี schema/migration ใหม่

## Non-goals

- ไม่สร้าง provider integration ใหม่
- ไม่เปลี่ยนรูปแบบ watermark storage เดิม
- ไม่เพิ่ม logo history UI แยกต่างหาก
