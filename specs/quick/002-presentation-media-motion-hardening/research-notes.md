# Research Notes

## Existing implementation snapshot

- Shared contract/pure helper อยู่ที่ `apps/web/shared/presentation/contracts.ts` และ `apps/web/shared/presentation/mediaMotion.ts`
- Editor slideshow preview ใช้ shared helper โดยตรงใน `apps/web/client/src/pages/PresentationEditor.tsx`
- `PresentationPlayMode.tsx` ใช้ `CanvasStage` / `CanvasObjects` เป็น playback surface แยกอีกชุด
- Server slide-render route inject inline browser JS ที่ re-implements motion math ใน `apps/web/server/routes/slideRender.ts`
- Property panel preset list อยู่ใน `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- Static export warning ถูกสร้างใน `apps/web/server/services/presentationExportDegradation.ts`
- Presentation editor ปัจจุบันมี live region สรุป warning codes ในหน้า editor แต่ `ExportDialog` ยังไม่ได้ render media-motion-specific warning message โดยตรง

## Gaps confirmed from current code

### 1. Motion semantics duplicated

- Shared helper:
  - `MAX_PAN_TRAVEL_PERCENT = 12`
  - `MAX_ZOOM_DELTA = 0.18`
  - presets: `zoom-in`, `zoom-out`, `pan-left`, `pan-right`, `pan-up`, `pan-down`
- Server route inline JS hardcodesค่าเดียวกันอีกชุด
- ความเสี่ยง: preset ใหม่หรือ tuning ใหม่อาจหลุด parity ถ้าแก้ไม่ครบสองที่

### 1b. PlayMode is a separate playback path and is not covered by the current hardening plan

- `PresentationPlayMode.tsx` render slide ผ่าน `CanvasStage` ที่ [autoPlayVideos] และ transition layer ของตัวเอง
- จาก code scan ยังไม่พบ `mediaMotion` หรือ `computeMediaMotionFrame` ใน `PresentationPlayMode.tsx`
- `CanvasObjects.tsx` รองรับ crop/zoom/objectPosition ของ image/video แต่ยังไม่พบ motion transform
- ดังนั้นถ้าต้องการ “กดเข้า PlayMode แล้วเห็น effect” แผนต้องแตะ:
  - `apps/web/client/src/pages/PresentationPlayMode.tsx`
  - `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
  - และอาจรวม `CanvasObjects.tsx` / `CanvasObjects.test.tsx` ถ้าจะทำ motion ใน shared canvas renderer

### 2. Pause/resume behavior implemented but under-tested

- `PresentationEditor.tsx` เก็บ elapsed time ด้วย `performance.now()` + `requestAnimationFrame`
- logic ดูถูกทางแล้วสำหรับ freeze/resume
- regression test ที่มีอยู่เช็กเพียง:
  - video node ไม่ remount
  - transform เปลี่ยนเมื่อเวลาเดิน
- ยังไม่มี test ที่ assert:
  - pause แล้ว transform ต้องคงเดิมแม้ timer เดินต่อ
  - resume แล้ว transform ต้องค่อย ๆ เดินต่อจากค่าเดิม

### 3. Pan presetsยังเป็น single-axis only

- UI + schema + helper รองรับแค่ left/right/up/down
- requirement ใหม่ที่ผู้ใช้อาจคาดหวังจาก “หลายทิศทาง” เหมาะจะขยายเป็น diagonal presets แบบ:
  - `pan-up-left`
  - `pan-up-right`
  - `pan-down-left`
  - `pan-down-right`

### 4. Pan may reveal empty edges

- ตอนนี้ pan ใช้ translate อย่างเดียวโดยไม่เพิ่ม overscan scale
- ถ้า media fit พอดีกรอบ โดยเฉพาะ `contain`, การเลื่อนอาจโชว์พื้นหลัง/ขอบว่าง
- ควรมี policy ชัดเจน:
  - auto-overscan when preset is pan
  - หรือจำกัด pan intensity ตาม fit mode
- สำหรับ v1.1 ทางที่ practical กว่าคือ auto-overscan สูตร deterministic

### 5. Warning contract exists but user-facing surfacing is thin

- Backend สร้าง warning `SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED`
- Shared warning category map รองรับแล้ว
- ยังไม่พบ mapping ข้อความ human-readable ใน `ExportDialog.tsx`
- หากต้องการให้ “ผู้ใช้รู้ตัว” ก่อน/หลัง export ควรเพิ่ม copy ที่อิง warning code/category ใน dialog/history panel/editor message area

## Impacted files likely for next round

- `apps/web/shared/presentation/contracts.ts`
- `apps/web/shared/presentation/mediaMotion.ts`
- `apps/web/shared/presentation/mediaMotion.test.ts`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
- `apps/web/client/src/components/presentation/ExportDialog.tsx`
- `apps/web/client/src/components/presentation/ExportDialog.test.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`

## Recommended planning depth

- `standard`
- เหตุผล: งานยังอยู่ในขอบเขต small/medium, ไม่มี migration/infra change, แต่ต้องแตะหลายเลเยอร์และเพิ่ม regression matrix หลายจุด
