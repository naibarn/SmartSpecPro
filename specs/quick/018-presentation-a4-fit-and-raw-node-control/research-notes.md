## Research Summary

### AI Draft header/footer

- UI ส่ง `headerEnabled/footerEnabled` จาก `AIDraftModal.tsx`
- server path ใน `aiPresentationService.ts` มีการ apply preset overrides และมี logic ปิด header/footer บางกรณี
- มีจุดน่าสงสัยชัดใน path ที่ set `headerCustomText` แล้วไปเปิด `showDeckTitle` แม้ `header.enabled` จะปิดอยู่

### A4 / block fit

- A4 family มีอยู่แล้วใน:
  - `presentationBlockPresets.ts`
  - `presentationComponentCatalog.ts`
  - `aiPresentationComponentRecipes.ts`
  - `componentRecipes.ts`
- ยังไม่เห็น helper กลางสำหรับ "fit component to canvas" แบบ user-invoked หรือ auto-fit after insert

### Raw decorative fallback node selection

- editor ปัจจุบัน map fallback element click -> component selection ใน `handleSelectElement()`
- operation path ของ element ส่วนใหญ่แตะเฉพาะ `content.elements`
- รอบก่อนเพิ่ม slot resize ไปแล้ว แต่ยังไม่เปิด raw fallback node selection

### Likely Affected Tests

- `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/client/src/presentation-canvas/components/ComponentCanvasOverlay.test.tsx`
- อาจต้องเพิ่ม catalog/block preset tests ถ้ามี A4 family ใหม่
