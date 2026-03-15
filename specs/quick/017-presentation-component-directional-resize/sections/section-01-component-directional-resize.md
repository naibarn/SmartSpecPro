## Scope

ทำให้ editable component รองรับ mouse directional resize จาก overlay และทำให้ fallback child geometry ภายใน block ปรับอย่างเหมาะสมกับ text/non-text content

## Tasks

1. ปรับ `resizeComponentFallbackElements()` ให้คง typography fields เดิม แต่ scale frame geometry ของ fallback children ตาม bounds ใหม่
2. เพิ่ม resize handles ใน `ComponentCanvasOverlay`
3. ต่อ `PresentationEditor` ให้ drag-resize component ผ่าน command merge path
4. เพิ่ม tests ตาม `implementation-plan-tdd.md`

## Done When

- component resize ด้วย mouse right/bottom/bottom-right ใช้งานได้
- text font size ไม่เปลี่ยนหลัง resize
- regression tests ผ่าน
