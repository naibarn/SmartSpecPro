## Objective

ทำให้ editable presentation component/block ปรับขนาดด้วย mouse ได้จากด้านขวาและด้านล่าง โดยคง typography เดิมไว้ และขยายพื้นที่ layout ภายใน block อย่างยืดหยุ่น

## Current-Codebase Fit

- ใช้ command/state path เดิมของ component transform
- เติม pointer resize handles ใน `ComponentCanvasOverlay`
- ทำให้ `handleDragResize()` รองรับ selected component เช่นเดียวกับ button resize

## Affected Files

- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/client/src/presentation-canvas/components/ComponentCanvasOverlay.tsx`
- `apps/web/client/src/presentation-canvas/components/ComponentCanvasOverlay.test.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

## Approach

1. ปรับ component resize transform ให้ scale frame geometry ของ fallback elements แต่ไม่แตะ `fontSize`
2. เติม component overlay resize handles สำหรับ right, bottom, และ bottom-right
3. ต่อ pointer drag path ให้เรียก component resize command แบบ merge ได้
4. เพิ่ม regression tests สำหรับ:
   - text slot frame โตขึ้นแต่ font size คงเดิม
   - non-text children scale ตามสัดส่วน
   - pointer drag resize component ทำงานผ่าน editor

## Risks And Mitigations

- Gesture conflict กับ drag surface:
  - แยก resize handles เป็น pointer targets ของตัวเอง
- Text overflow ยังอาจเกิดถ้าเนื้อหายาวมาก:
  - งานนี้แก้เรื่อง capacity ผ่าน frame expansion ก่อน ไม่แก้ auto-fit font

## Acceptance Criteria

- เมื่อเลือก component/block แล้วสามารถลาก handle ด้านขวาเพื่อเพิ่มความกว้างได้
- สามารถลาก handle ด้านล่างเพื่อเพิ่มความสูงได้
- สามารถลากมุมขวาล่างเพื่อเพิ่มทั้งกว้างและสูงได้
- ข้อความภายใน component ไม่ถูก scale font size ตามการ resize
- image/rect/video/line ภายใน component scale ตำแหน่งและขนาดตามสัดส่วนใหม่
- regression tests ผ่าน
