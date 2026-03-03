# Feature Spec: 030-PresentationEditAdditional

**Spec ID:** 030-PresentationEditAdditional  
**Created:** 2026-03-03  
**Status:** In Progress (Stability-first, Wave 3/4 validated)  
**Owner:** Presentation Team

---

## 0. Latest Validation Update (2026-03-03)

อัปเดตจากการทดสอบล่าสุด:

1. **Video ใน slide เล่นได้ใน Play Mode แล้ว** (ผ่าน)
2. **Export MP4 ที่มี video ใน slide render เป็น video แล้ว** (ผ่าน)

งานที่ยังต้องโฟกัสหลัก:

1. Auto Layout ยังต้อง lock เรื่อง element loss/overlap ให้เสถียรทุกเคส
2. SVG ใน Play/Export ยังต้องปิดความเสี่ยง white block ให้ครบทุกรูปแบบ
3. ต้องเพิ่ม regression automation สำหรับ video path ที่เพิ่งผ่าน เพื่อกัน regression รอบถัดไป

---

## 1. Background & Problem Statement

ปัญหา Production ที่ผู้ใช้พบจริงใน Presentation Editor/Player/Export:

1. **Auto Layout พังเมื่อมีรูปจำนวนมาก**
- จัด layout ทับกันมั่ว
- บาง element หายหลัง apply auto layout

2. **SVG แสดงผิดใน Play Mode**
- element ที่เป็น SVG กลายเป็น block สีขาว

3. **Video ใน Play Mode ไม่เล่น**
- video element ปรากฏแต่ไม่ autoplay/play ตาม slide

4. **Video ไม่ถูก render ใน MP4 export**
- ในไฟล์ออกมาเป็นสี่เหลี่ยมดำ/ไม่ขยับ

5. **มี white pre-roll ก่อนเริ่ม slide ใน export MP4**
- เดิม ~1 วินาที แต่ปัจจุบันยาวหลายวินาที

6. **ต้องมี runbook restart worker ชัดเจน**
- โดยเฉพาะ `presentation_export` queue worker

---

## 2. Goals (ต้องผ่านทั้งหมด)

1. **Auto Layout ไม่ลบ element โดยไม่ตั้งใจ** และไม่ทำให้ media ทับกันแบบ unusable
2. **SVG parity**: Editor, Play Mode, Export render เหมือนกัน
3. **Video parity**: Play Mode และ MP4 export เล่น video ได้จริง
4. **Zero visible white pre-roll** ใน MP4 export (target: <= 100ms)
5. มี **operational runbook** สำหรับ restart/health-check worker
6. สร้าง baseline regression tests ครอบคลุม 5 อาการหลัก

---

## 3. Non-Goals (รอบนี้)

1. Motion graphics/element animation timeline แบบ keyframe
2. Public share play mode ใหม่
3. Re-architecture ระบบ export ทั้งหมด

---

## 4. Scope & Affected Code (ตามโค้ดปัจจุบัน)

### 4.1 Core Fix Path (ต้องทำก่อน)

- `apps/web/server/services/aiPresentationService.ts`
  - `buildRelayoutPreservedElements()`
  - `layoutPreservedMediaElements()`
  - `mergeRelayoutElementsWithPreserved()`

- `apps/web/client/src/pages/PresentationEditor.tsx`
  - play overlay + readonly slide render path (`renderReadonlySlideElement`)
  - auto layout apply flow

- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
  - video playback state consistency
  - svg image rendering consistency

- `apps/web/server/routes/slideRender.ts`
  - internal render HTML for screenshot/record mode
  - `window.__slideReady` gating

- `python-backend/app/tasks/presentation_render.py`
  - record mode pre-roll trimming
  - fallback behavior when slide-ready timeout

- `apps/web/server/services/presentationPlaybackExport.ts`
  - render spec build path (`hasDynamicVideo`, media source resolution)

- `apps/web/server/services/presentationExportDegradation.ts`
  - ปัจจุบัน `ALLOWED_ELEMENT_TYPES = text,image,rect,line`
  - ต้องอัปเดต policy ให้รองรับการ export warning ที่สะท้อน capability จริง

### 4.2 UX/Feature Waves (ต่อจาก stabilization)

- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/presentation-canvas/commands/commands.ts`
- `apps/web/client/src/presentation-canvas/CanvasStage.tsx`
- `apps/web/shared/presentation/contracts.ts`

---

## 5. Wave 0: Stability Guardrail (NEW - Mandatory)

### 5.1 Rendering Parity Contract

Element types ที่ต้อง parity ทั้ง 3 path:
- Editor canvas
- Play Mode
- Export render (slide-render + worker)

Types:
- `text`, `image`, `image(svgContent)`, `video`, `rect`, `line`

### 5.2 Regression Dataset

เพิ่ม fixture deck สำหรับทดสอบ:
- 1 slide มี image จำนวนมาก (>= 60)
- มี inline SVG (`svgContent`) + uploaded `.svg`
- มี video พร้อม poster
- มี mixed z-order

### 5.3 CI Gates

1. Auto layout apply แล้ว element count ต้องไม่ลดลงโดยไม่ได้ตั้ง policy truncation
2. Play mode video ต้อง emit `playing` event ภายใน timeout
3. Export MP4 เฟรมแรกต้องไม่เป็นขาวล้วน (pixel threshold check)
4. Export MP4 ต้อง detect motion frame ในช่วงที่มี video

---

## 6. Wave 1: Auto Layout Reliability (Critical)

### 6.1 Functional Requirements

1. **No silent drop**
- ห้ามลบ preserved media แบบเงียบ
- ถ้าเกิน capacity ต้องมี warning ที่ระบุจำนวนและเหตุผลชัดเจน

2. **Deterministic overflow policy**
- จัดลำดับด้วยกติกาเดียวกันทุกครั้ง (เช่น z-index/order + area)
- ผลลัพธ์ต้อง stable เมื่อ `layoutSeed` เดิม

3. **Collision control**
- หลัง arrange ต้องตรวจ overlap ratio
- หากเกิน threshold ให้ re-pack fallback grid จนผ่านหรือลง warning

4. **Preserve media metadata**
- `imagePrompt`, `imageModelId`, `imageReferenceUrls`, `video.poster`, `video.loop`, `video.muted`

### 6.2 Acceptance Criteria

1. Slide ที่มี 80 media elements: หลัง auto layout element count เท่าเดิม (หรือมี warning truncation ที่ตรวจสอบได้)
2. ไม่มี media pair ใด overlap > 35% โดยไม่ถูกจัดเป็น intentional stack
3. รัน auto layout ซ้ำด้วย seed เดิม ได้ตำแหน่งเดิม

---

## 7. Wave 2: SVG Render Fix (Critical)

### 7.1 Functional Requirements

1. รองรับทั้ง:
- Inline SVG (`svgContent`)
- SVG file (`src` เป็น .svg)

2. Normalize renderer ระหว่าง Editor/Play/Export
- color replacement (`currentColor`) behavior ตรงกัน
- transparent background ไม่กลายเป็น white block

3. ถ้า SVG โหลดไม่สำเร็จ:
- แสดง fallback อย่างชัดเจน (ไม่ใช่ block ขาวเงียบ)
- เพิ่ม warning code ใน export status

### 7.2 Acceptance Criteria

1. Deck ที่มี inline+file SVG render ตรงกันใน Editor, Play, MP4
2. ไม่พบ white rectangle artifact จาก SVG ใน play/export

---

## 8. Wave 3: Play Mode Video Playback Fix (Critical)

**Status:** Completed (manual verification passed on 2026-03-03)

### 8.1 Functional Requirements

1. Slide enter -> video play อัตโนมัติ
2. Slide leave -> pause/reset ตาม policy
3. เปลี่ยน slide แล้ว state ไม่ reset ผิดพลาดจาก shared map lifecycle
4. รองรับกรณี autoplay blocked ด้วย muted-first fallback

### 8.2 Acceptance Criteria

1. กด Play Mode แล้ว video ใน slide เริ่มเล่นภายใน 1 วินาที
2. Next/Prev slide แล้ว state ไม่ค้าง/ไม่คุม video ผิดตัว
3. (Verified 2026-03-03) เคส `video in slide` เล่นได้จริงใน Play Mode

---

## 9. Wave 4: Export MP4 Dynamic Video + White Pre-roll Removal (Critical)

**Status:** Partially Completed (video render path passed on 2026-03-03, pre-roll hardening still required)

### 9.1 Functional Requirements

1. ถ้า `hasDynamicVideo=true`:
- ต้อง record mode per slide และตัดช่วงก่อน ready อย่างแม่นยำ

2. ถ้า `window.__slideReady` timeout:
- ห้าม fallback เป็นคลิปขาวยาวแบบเงียบ
- ต้อง retry 1 ครั้ง แล้วค่อย degrade พร้อม warning

3. Improve readiness gate
- mark ready หลัง media + first paint พร้อมจริง
- ลดโอกาส false-ready/false-timeout

4. Export degradation policy ให้ตรง capability จริง
- update `presentationExportDegradation.ts` ให้ warning ไม่ misleading กับ video/svg

### 9.2 Acceptance Criteria

1. MP4 ที่มี video element แสดง motion จริง (ไม่ใช่ black rectangle)
2. ช่วงต้นคลิปไม่มี white pre-roll เกิน 100ms
3. timeout/degrade ทุกเคสมี warning code ชัดเจนใน UI
4. (Verified 2026-03-03) เคส `video in slide` export ออกมาเป็น video แล้ว

---

## 10. Wave 5: Operations Runbook (Worker)

เพิ่มเอกสารส่วนปฏิบัติการในสเปกนี้และ docs runbook:

### 10.1 Restart Presentation Export Worker

```bash
# เฉพาะ worker presentation_export
docker compose -p smartspecpro -f docker-compose.media.yml restart celery-presentation

# เช็คสถานะ
docker compose -p smartspecpro -f docker-compose.media.yml ps celery-presentation

# ดู log ล่าสุด
docker logs --tail 200 smartspec-celery-presentation
```

### 10.2 Health Checks

1. worker ต้อง subscribe queue `presentation_export`
2. ทดสอบ trigger export 1 งาน แล้วสถานะต้องวิ่ง `queued -> processing -> done`
3. ถ้าเจอค้าง ให้เช็ค `INTERNAL_RENDER_BASE_URL` และ `JWT_SECRET`

---

## 11. Additional Feature Waves (จากแผนเดิม ปรับลำดับ)

## Wave 6: Layer/Z-order UI + Transition Picker Completion
- ตรวจ gap จริงก่อนทำซ้ำ (บางส่วนถูก wire แล้ว)
- เติม UI ที่ยังขาดใน panel/sidebar

## Wave 7: Notes Panel + Export Payload Notes
- เพิ่ม Notes editor ที่ใช้งานได้จริง
- ตรวจเส้นทาง export payload (ห้าม strip notes ถ้าใช้ downstream)

## Wave 8: Alignment/Distribution Commands + UI
- align left/right/center-h/top/bottom/center-v
- distribute horizontal/vertical

## Wave 9: Slide Background Color
- canvas background config + UI + command + compatibility

## Wave 10: Find & Replace (cross slides)
- Ctrl+H, replace one/all, navigate match

## Wave 11: Better Thumbnails + Outline View
- thumbnail จาก content จริง
- outline edit text ข้ามทุก slide

## Wave 12: Table + Group/Ungroup + Transition Animation + Refactor
- table element
- group/ungroup
- slide transition animation in actual play path
- split `PresentationEditor.tsx` เป็น sub-components

---

## 12. Corrected File Ownership Notes

1. `degradeSlidesForExport()` อยู่ที่:  
`apps/web/server/services/presentationExportDegradation.ts`

2. ปัญหา video playback state ไม่ได้อยู่เฉพาะ `PresentationEditor.tsx`  
ต้องตรวจ `CanvasObjects.tsx` ด้วย

3. Transition animation ต้องแก้บนเส้นทาง play/render จริง  
ไม่ใช่ editor overlay อย่างเดียว

---

## 13. Verification Plan

### 13.1 Automated

```bash
cd apps/web && pnpm check
cd apps/web && pnpm test -- --run presentation
```

เพิ่ม test cases อย่างน้อย:
1. auto-layout-many-media regression
2. svg-play-render parity
3. play-mode-video-autoplay
4. export-mp4-dynamic-video-motion
5. export-mp4-no-white-preroll

### 13.2 Manual

1. Auto Layout slide ที่มี 50-80 รูป -> ตรวจว่าของไม่หายและไม่ทับ unusable
2. Play Mode -> SVG ไม่เป็น block ขาว
3. Play Mode -> video เล่นจริง (ผ่านแล้ว 2026-03-03)
4. Export MP4 -> video render เป็นภาพเคลื่อนไหวจริง (ผ่านแล้ว 2026-03-03)
5. Export MP4 -> ไม่มีหน้าขาวนำหลายวินาที
6. Restart worker ตาม runbook แล้ว export ได้ต่อทันที

---

## 14. Rollout Strategy

1. เปิดใช้ behind feature flag สำหรับ export dynamic video fixes
2. Canary internal tenant ก่อน
3. เก็บ metric: export failure rate, preroll incident rate, video-motion detection pass rate
4. ถ้า regression ให้ fallback เป็น screenshot mode พร้อม warning (ไม่ปล่อยไฟล์เสียเงียบ)

---

## 15. Done Definition

ถือว่าเสร็จเมื่อครบทุกข้อ:

1. 5 ปัญหาหลักถูกปิดด้วย test + manual evidence
2. ไม่มี silent element loss จาก auto layout
3. MP4 export ที่มี video ผ่านเกณฑ์ motion + no-white-preroll
4. มี runbook restart/health-check ที่ทีม ops ใช้งานได้จริง
5. ผ่าน `pnpm check` และชุด presentation tests

---

## 16. Current Remaining Scope (After 2026-03-03 Validation)

1. ปิดบั๊ก Auto Layout เรื่อง element ซ้อนทับและ element หายให้ deterministic
2. ปิดบั๊ก SVG white block ใน Play/Export ให้ครบทั้ง inline SVG และไฟล์ `.svg`
3. ปิด pre-roll ขาวช่วงต้นคลิปให้ผ่านเกณฑ์ `<=100ms` อย่างสม่ำเสมอ
4. เพิ่ม regression test ครอบคลุมเคส video path ที่ผ่านแล้ว เพื่อกันพังซ้ำ
