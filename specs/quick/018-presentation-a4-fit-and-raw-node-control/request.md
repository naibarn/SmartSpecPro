## Request

1. แก้ bug ใน Draft with AI แบบ Auto ที่ Header/Footer ถูกปิดไว้แต่ระบบยังสร้างออกมา
2. เพิ่ม toolbar สำหรับ autofit การยืด block:
   - block แบบ A4 ให้ fit เข้ากับ canvas อัตโนมัติทั้งซ้าย/ขวา/บน/ล่าง
   - block แบบอื่นให้ขยายซ้าย/ขวาจนสุด canvas โดยไม่ทำให้สัดส่วนพัง
3. เปิด raw decorative fallback node ทุกชิ้นให้ select/resize แยกได้
4. เพิ่ม Block A4 แบบหลายรูปภาพ และ A4 แบบแนวนอนสำหรับ 16:9
5. ให้ Draft with AI auto-fit block แบบ A4 อัตโนมัติ
6. ตรวจว่าควรเพิ่ม hardening อะไรอีก

## Assumptions

- built-in presentation blocks ยัง render ผ่าน `components[].fallbackElements`
- A4 family อยู่ทั้งใน client catalog และ server AI recipe path แล้ว แต่ยังขาดบางแบบและขาด post-insert fit behavior
- งานนี้จะเน้น implementation path ที่มี regression test รองรับได้ใน repo ปัจจุบัน

## Non-goals

- ไม่ redesign ทั้งระบบ transform ของ editor ใหม่หมด
- ไม่ทำ migration schema ใหญ่ ถ้าเลี่ยงได้
