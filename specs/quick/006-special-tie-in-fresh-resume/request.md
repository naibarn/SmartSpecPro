# Request

เพิ่มตัวเลือกก่อนเปิดการสร้างตอนพิเศษจากหน้า Sub-episodes ให้ผู้ใช้เลือกระหว่างสร้างตอนใหม่แบบล้างงานเดิม หรือโหลดงานเดิมเพื่อทำต่อ โดย fresh mode ต้องไม่ auto-load history และงานที่สร้างใหม่ต้องเป็น latest resumable work ในครั้งถัดไป

## Constraints

- เปลี่ยนเฉพาะ Special Tie-in flow
- ไม่เปลี่ยน normal episode generation/continuation
- ไม่ลบ persisted history ถาวร
- รักษา `initialInput` edit flow ของตอนพิเศษเดิม
