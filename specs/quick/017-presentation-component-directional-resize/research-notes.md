## Codebase Scan

- `apps/web/client/src/lib/presentationEditorState.ts`
  - `resizeComponentFallbackElements()` scale ทุก fallback element ตรง ๆ และยังไม่แยก text/non-text behavior
- `apps/web/client/src/pages/PresentationEditor.tsx`
  - `handleResizeSelection()` รองรับ component path
  - `handleDragResize()` ยังรองรับเฉพาะ selected elements ไม่รองรับ selected component
- `apps/web/client/src/presentation-canvas/components/ComponentCanvasOverlay.tsx`
  - มีเฉพาะ drag surface/slot overlays ยังไม่มี resize handles
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
  - element เดี่ยวมี pointer resize handle อยู่แล้ว ใช้ drag state แบบ bottom-right resize

## Test Surface

- `apps/web/client/src/lib/presentationEditorState.test.ts`
  - มี fixture สำหรับ component duplicate/resize/rotate อยู่แล้ว เหมาะกับการเพิ่ม assertion เรื่อง text font size และ directional scaling
- `apps/web/client/src/presentation-canvas/components/ComponentCanvasOverlay.test.tsx`
  - มี interaction test สำหรับ drag overlay อยู่แล้ว เหมาะกับการเพิ่ม pointer resize handle coverage
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - มี canvas pointer resize test สำหรับ element เดี่ยว และ component transform buttons อยู่แล้ว

## Risks

- ถ้า resize path ไปแตะ slot text geometry ผิด อาจทำให้ slot overlay bounds ไม่ตรงกับ component จริง
- ถ้า component drag/resize merge เข้ากับ undo group ไม่ถูก อาจทำให้ gesture ย้อนกลับได้ไม่ครบ
- built-in component ที่ถูก rebuild ระหว่าง load อาจกระทบ persistence ของ manual geometry; งานนี้จะเน้น behavior ระหว่าง edit path ก่อน และหลีกเลี่ยง schema/migration scope
