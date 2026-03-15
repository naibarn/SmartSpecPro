## Request

แก้ไขให้ block/component ใน Presentation Edit สามารถใช้ mouse ปรับขนาดได้แบบยืดไปทางขวาและยืดลงล่าง โดยตัวอักษรภายในยังคงขนาดเดิม แต่ element อื่นภายใน block ปรับสัดส่วนตาม เพื่อเพิ่มความยืดหยุ่นในการใส่ข้อความ

## Repository Assumptions

- การแสดงผล block แบบ editable ใช้ `components[].fallbackElements` เป็น render source บน canvas
- การ resize แบบ mouse สำหรับ element เดี่ยวมีอยู่แล้วใน `CanvasObjects.tsx`
- การ resize component ปัจจุบันมีเฉพาะ command/button path และยังไม่มี pointer handles บน `ComponentCanvasOverlay`
- built-in component ยังต้องรักษา slot editing, drag, และ render order เดิม

## Non-goals

- ยังไม่เปิดให้เลือก fallback child แต่ละตัวของ built-in component เป็น editable standalone selection
- ยังไม่เปลี่ยน typography auto-fit หรือ font scaling ของ text slot
