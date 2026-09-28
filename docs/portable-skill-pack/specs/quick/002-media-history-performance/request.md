# Request

ปรับปรุงการโหลดและการใช้ cache ของหน้า Media History ให้เร็วใกล้เคียงกับแท็บย่อยของ Vertical Drama โดยให้รายการใหม่ถูก revalidate และแสดงได้ทันที ขณะที่ไฟล์ภาพ/วิดีโอเดิมซึ่ง URL คงที่สามารถใช้ browser cache ได้นานหลายวัน

## Scope

- ปรับ client query cache ของ `media.listTasks` และสถานะ Library โดยคงข้อมูลเดิมระหว่าง revalidate
- ลดเวลารอรวมข้อมูลจากหลาย source ใน `media.listTasks`
- ปรับการตอบไฟล์ managed media ให้ cache แบบ private หลายวันพร้อม ETag เดิม
- ลดการโหลด preview ที่อยู่นอก viewport ตั้งแต่เริ่มเปิดหน้า

## Constraints and non-goals

- ห้ามทำ managed media เป็น `public` หรือข้าม tenant/user authorization
- ไม่แก้ไขข้อมูลย้อนหลังและไม่เปลี่ยนรูปแบบ URL
- ไม่เพิ่ม server-side shared list cache ที่อาจทำให้ข้อมูลข้ามผู้ใช้หรือข้อมูลใหม่ล่าช้า
