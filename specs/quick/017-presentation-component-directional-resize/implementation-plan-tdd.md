## TDD Sequence

1. เพิ่ม test ใน `presentationEditorState.test.ts`
   - resize component wider/taller แล้ว text `fontSize` ยังเท่าเดิม
   - rect/image ภายในถูก scale ตาม width/height ratio ใหม่
2. เพิ่ม test ใน `ComponentCanvasOverlay.test.tsx`
   - drag handle ขวาเรียก `onResizeComponent(nextWidth, sameHeight)`
   - drag handle ล่างเรียก `onResizeComponent(sameWidth, nextHeight)`
3. เพิ่ม integration test ใน `PresentationEditor.test.tsx`
   - เลือก component แล้วลาก handle ขวาหรือ handle ล่าง ทำให้ canvas object เปลี่ยน width/height จริง

## Expected Initial Failures

- overlay tests fail เพราะยังไม่มี handles/props ใหม่
- editor state tests fail เพราะ resize behavior ยัง scale ทุกอย่างแบบเดิม
- editor integration test fail เพราะ `handleDragResize()` ยังไม่รองรับ selected component

## Regression Checks

- component drag เดิมยังทำงาน
- transform button path (`Wider`, `Taller`) ยังทำงาน
- element เดี่ยว resize handle เดิมไม่พัง
