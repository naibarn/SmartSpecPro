# Feature Spec 021: Canva-like Canvas Editor for Presentation

**Status:** Draft  
**Created:** 2026-02-22  
**Author:** Product + Engineering Planning (Codex)  
**Priority:** Critical  
**Estimated Scope:** Large (multi-phase, cross frontend/backend/export)

---

## 1) Executive Summary

ระบบ `Presentation Editor` ปัจจุบันใช้งานได้พื้นฐาน แต่ยังไม่ตอบโจทย์การจัดองค์ประกอบแบบ visual-first และยังไม่ smooth สำหรับผู้ใช้ทั่วไป (โดยเฉพาะ mobile/tablet) เมื่อเทียบกับประสบการณ์ที่ผู้ใช้คาดหวังจากเครื่องมือแนว Canva

สเปกนี้กำหนดการยกระดับ editor ให้เป็น **Canva-like Workspace** โดยเน้น:

1. พื้นที่ทำงานแบบ canvas-centric (center stage)
2. แถบเครื่องมือซ้าย (assets/tools), properties ขวา, top action bar
3. interactions ครบ (drag/resize/rotate/snap/group/layer/align)
4. mobile-first usability (touch gestures + adaptive panels)
5. ขยายจากสถาปัตยกรรม Presentation เดิม โดยไม่ทำลายข้อมูลเดิม

---

## 2) Product Goals

### 2.1 Goals

1. ผู้ใช้สร้างและแก้ไขสไลด์ได้รวดเร็วในรูปแบบ WYSIWYG
2. รองรับ workflow แบบตัวอย่างภาพ: templates/photos/icons/text/video/upload/background/layers
3. รองรับ object manipulation ที่เสถียรทั้ง desktop และ mobile
4. export ได้ทั้ง PNG/MP4 จากระบบเดิม
5. ใช้งานกับระบบ tenant/permissions เดิมอย่างปลอดภัย

### 2.2 Non-Goals (Phase นี้)

1. Real-time collaboration (CRDT/OT)
2. AI auto-layout เต็มรูปแบบ
3. Advanced timeline animation per-keyframe แบบ Adobe After Effects
4. Import .pptx แล้ว map เป็น editable 1:1 ระดับสูง

---

## 3) Success Criteria (Definition of Success)

1. ผู้ใช้ใหม่สร้างงานจาก `New Presentation` แล้วแก้ไข slide แรกได้ภายใน 2 นาที
2. 95% ของ actions หลัก (select/move/resize/add-text/export) สำเร็จโดยไม่ error
3. touch interactions บน mobile/tablet ใช้ได้จริง (pinch-zoom + pan + select)
4. editor response time:
- drag object latency < 16ms/frame สำหรับงานขนาดทั่วไป (<= 100 objects/slide)
- initial load slide < 1.5s (warm cache)
5. crash-free sessions >= 99.5%

---

## 4) User Personas & Core Jobs

### 4.1 Personas

1. Content Creator: ทำโพสต์/สไลด์การตลาดเร็วๆ
2. Educator/Trainer: ทำสไลด์สอน + narration + export video
3. Founder/PM: ทำ pitch deck แบบแก้หน้างาน

### 4.2 Core Jobs-to-be-Done

1. สร้าง presentation ใหม่แล้วเริ่มแก้ไขได้ทันที
2. เลือก template/พื้นหลัง/asset จาก library ได้เร็ว
3. วาง text/image/icon/video บน canvas และจัดเลย์เอาต์แม่นยำ
4. preview/play และ export ได้โดยไม่ต้องย้ายระบบ
5. ทำงานบนมือถือเพื่อแก้จุดเล็กๆ ได้สะดวก

---

## 5) UX Direction (อิงภาพตัวอย่าง)

## 5.1 Layout Blueprint

### Desktop Layout

1. Top Bar (global actions)
- Back to Document Management
- File name / save status
- Undo / Redo
- Zoom controls
- Present / Export / Download

2. Left Rail (tools + assets)
- My designs
- Templates
- Text
- Photos
- Icons
- Upload
- Video
- Background
- Layers
- Resize

3. Left Content Panel
- Search box
- Asset grid/list (virtualized)
- Filters (type/color/orientation/license/tag)

4. Center Workspace
- Infinite gray workspace
- White slide frame (artboard)
- Snapping guides / rulers / safe areas

5. Right Property Panel
- Transform (x, y, w, h, rotation)
- Style
- Object-specific settings
- Arrange / lock / opacity / blend

6. Bottom Bar
- Page/Slide navigator
- Zoom slider
- (optional phase) timeline cue for transitions/audio

### Mobile Layout

1. Top compact bar
- Back, undo/redo, present/export menu

2. Center canvas
- pinch zoom / pan
- selection handles แบบ touch-friendly

3. Bottom segmented sheet
- tabs: Add / Layers / Properties / Pages
- draggable bottom sheet (collapsed/half/full)

4. Floating quick actions
- Add text, upload, duplicate, delete

---

## 6) Functional Requirements

### 6.1 Document Management Entry

1. มีปุ่ม `New Presentation` ใน toolbar ชัดเจน
2. เมื่อสร้างใหม่:
- สร้าง library item ประเภท `presentation`
- สร้าง editable deck อัตโนมัติ
- เปิดไป editor ทันที
3. ถ้าเข้าหน้า editor แล้ว deck ยังไม่มี: auto-initialize ให้อัตโนมัติ

### 6.2 Canvas Core

1. Artboard presets
- 16:9 (default), 4:3, 1:1, 9:16
2. Multi-select
- click, shift-click, marquee select
3. Object transform
- drag, resize (8 handles), rotate
4. Arrange
- bring forward/backward, front/back
5. Align/Distribute
- align left/center/right/top/middle/bottom
- distribute horizontal/vertical
6. Group/Ungroup
7. Lock/Unlock
8. Snap system
- edge-to-edge, center guides, spacing hints
9. Keyboard shortcuts
- copy/paste, duplicate, delete
- undo/redo
- nudge with arrows (+ shift = coarse)

### 6.3 Left Tools & Asset Workflows

1. Templates
- browse + apply to current slide
2. Text
- heading/subheading/body presets
3. Photos/Icons
- search + insert + drag-drop
4. Upload
- image/video/audio/file จาก local
5. Video
- insert as object with poster frame
6. Background
- solid, gradient, image background
7. Layers
- layer tree, reorder drag/drop, visibility toggle
8. Resize
- เปลี่ยน artboard size พร้อม fit strategy

### 6.4 Properties Panel

1. Generic properties
- position, size, rotation, opacity
2. Text properties
- font family, weight, size, line-height, letter-spacing, color, align
3. Image properties
- crop mode, corner radius, shadow, filters (phase)
4. Video properties
- autoplay/mute/loop/start-end trim
5. Shape/Line properties
- stroke/fill/thickness
6. Slide properties
- transition type, duration, slide notes

### 6.5 Slide/Page Management

1. add/duplicate/delete/reorder slides
2. slide thumbnail panel
3. multi-slide operations (phase 2)
4. pagination indicator + quick jump

### 6.6 Save/Version/Conflict

1. autosave debounce (e.g. 800–1200ms)
2. manual save button
3. optimistic version conflict handling (`409`) พร้อม options:
- Reload latest
- Overwrite
- Copy as new slide/deck

### 6.7 Playback & Export

1. Present mode fullscreen
2. keyboard + touch navigation
3. export PNG per slide
4. export MP4 ทั้ง deck (ผ่าน pipeline เดิม)

---

## 7) Technical Evaluation: Konva.js vs Fabric.js

### 7.1 Decision Matrix

| Criteria | Konva.js (+react-konva) | Fabric.js |
|---|---|---|
| React integration | ดีมาก (component model ชัด) | พอใช้ (imperative-heavy) |
| Mobile gesture handling | ดี (stage-level control) | ต้อง custom เพิ่มเยอะ |
| Performance with layered scene | ดี (Layer separation) | ดีแต่ tuning ยากเมื่อ object มาก |
| Custom controls/snapping | ทำได้ยืดหยุ่น | ทำได้ แต่ logic ผูก object model มาก |
| Learning curve กับทีม React | ต่ำกว่า | กลาง |
| Ecosystem for Canva-like UX | เหมาะกว่า | เหมาะกับ generic canvas editor |

### 7.2 Decision

**เลือก Konva.js (react-konva) เป็น editor runtime หลัก**

เหตุผล:

1. เข้ากับ React architecture ที่ใช้อยู่
2. ทำ mobile gesture + responsive stage ได้ง่ายกว่า
3. เขียน reusable UI controls (selection box, snap guides, transform handles) ได้ชัดกว่า

---

## 8) Target Architecture

### 8.1 Frontend Modules

1. `CanvasShell`
- layout orchestration (left/top/right/bottom)

2. `CanvasStage`
- Konva Stage + Layers
- viewport state (zoom/pan)

3. `CanvasObjects`
- object renderers: text/image/icon/video/shape/line/group

4. `SelectionEngine`
- single/multi select, bounds, transform hooks

5. `SnapEngine`
- alignment guides + snapping calculations

6. `CommandBus`
- actions + undo/redo stacks

7. `AssetPanel`
- search/browse/insert assets

8. `PropertyPanel`
- strongly typed editors per object type

### 8.2 Data Contracts (Slide Content Schema v2)

แนะนำเพิ่ม schema version เพื่อรองรับการขยายในอนาคต:

```json
{
  "schemaVersion": "presentation_canvas_v2",
  "artboard": { "width": 1920, "height": 1080, "preset": "16:9" },
  "objects": [
    {
      "id": "obj_1",
      "type": "text",
      "x": 120,
      "y": 80,
      "width": 600,
      "height": 160,
      "rotation": 0,
      "locked": false,
      "opacity": 1,
      "zIndex": 3,
      "props": {
        "text": "Heading",
        "fontFamily": "Inter",
        "fontSize": 64,
        "fontWeight": 700,
        "color": "#111827",
        "align": "left"
      }
    }
  ],
  "background": {
    "type": "color",
    "value": "#ffffff"
  },
  "guides": {
    "snapEnabled": true,
    "rulersEnabled": true
  }
}
```

### 8.3 Backend Compatibility

ใช้ endpoint เดิมเป็นหลัก และเพิ่มเฉพาะที่จำเป็น:

1. ใช้ endpoint ปัจจุบัน:
- `presentation.getDeckByLibraryItem`
- `presentation.updateSlide`
- `presentation.addSlide`
- `presentation.reorderSlides`
- `presentation.triggerExport`

2. เพิ่ม endpoint ที่ควรมี:
- `presentation.batchUpdateObjects` (optional optimization)
- `presentation.applyTemplateToSlide`
- `presentation.listTemplateCatalog`
- `presentation.searchAssets`

---

## 9) Mobile & Tablet Requirements

### 9.1 Interaction Requirements

1. pinch-to-zoom canvas
2. two-finger pan
3. single-tap select
4. long-press context menu
5. drag handles size >= 28px touch target

### 9.2 Adaptive UI Rules

1. < 768px
- hide persistent sidebars
- use bottom sheet tabs

2. 768–1024px
- collapsible left panel + compact properties drawer

3. > 1024px
- full desktop layout

### 9.3 Mobile Accessibility

1. explicit mode toggle: `Pan mode` vs `Edit mode`
2. prevent accidental move while scrolling page
3. haptic feedback hooks (where supported)

---

## 10) Performance & Reliability

### 10.1 Performance Targets

1. 60 FPS for common editing actions (<= 100 objects/slide)
2. load thumbnail list virtualized
3. asset grid virtualized + lazy image decoding
4. throttle high-frequency transform updates

### 10.2 Reliability

1. autosave recover on tab close/crash
2. offline draft buffer (phase 2)
3. deterministic undo/redo command model

### 10.3 Memory Management

1. unmount non-visible heavy panels
2. object cache invalidation strategy for images/video posters
3. release blob URLs after upload complete

---

## 11) Security, Permission, Tenant Isolation

1. ยึด `tenantId` ทุก endpoint เช่นเดิม
2. upload validation + content-type policy เดิมต้องยังทำงาน
3. cross-tenant asset attach ต้องถูกปฏิเสธ
4. editor routes ต้องตรวจ `item_type = presentation`
5. export status ต้อง tenant/user scoped

---

## 12) Observability & Analytics

1. Editor events
- object_add
- object_transform
- template_apply
- export_trigger
- autosave_success/fail

2. Operational metrics
- save latency p50/p95
- conflict rate
- export failure rate
- canvas render error count

3. Error taxonomy
- validation
- permission
- schema mismatch
- export throttled
- client rendering failure

---

## 13) Testing Strategy (TDD-oriented)

### 13.1 Unit Tests

1. snap calculations
2. transform reducers
3. command bus undo/redo
4. schema migration v1 -> v2
5. mobile gesture state machine

### 13.2 Integration Tests

1. create presentation -> auto deck init -> add object -> save
2. reorder layers + align/distribute + persisted reload
3. conflict handling UX path
4. export trigger and status polling

### 13.3 E2E Tests

1. Desktop full flow
- New Presentation -> edit slide -> present -> export
2. Mobile full flow
- open editor -> pinch/pan/select -> edit text -> save
3. Security regression
- tenant boundary checks

### 13.4 Performance Tests

1. render stress with 200 objects
2. interaction latency under repeated drag/resize
3. asset panel with 1000 thumbnails virtualized

---

## 14) Delivery Plan (Phases)

### Phase 0: Foundations (1 sprint)

1. choose/render runtime with `react-konva`
2. implement `CanvasStage` skeleton + artboard
3. data schema v2 + compatibility parser
4. keep old editor fallback behind feature flag

**Exit Criteria:** เปิด canvas ได้, select/move object ได้

### Phase 1: Core Editing UX (1–2 sprints)

1. left tools, properties panel, top bar
2. add text/image/icon/shape
3. resize/rotate/snap/align/layer operations
4. undo/redo command stack

**Exit Criteria:** ใช้งาน daily editing flow ได้บน desktop

### Phase 2: Mobile-first + Slide Workflow (1 sprint)

1. bottom sheet architecture
2. touch gestures (pinch/pan/select)
3. slide/page navigator ปรับให้ใช้ง่ายบนจอเล็ก
4. auto-save robustness

**Exit Criteria:** mobile usability ผ่าน baseline test scenarios

### Phase 3: Template/Asset Ecosystem + Export polish (1 sprint)

1. template apply flow
2. richer asset search/filter
3. export UX polish + progress states
4. analytics + observability hardening

**Exit Criteria:** ประสบการณ์ใกล้เคียง Canva-like MVP พร้อม rollout

### Phase 4: Hardening & Rollout (1 sprint)

1. performance optimization
2. regression/security suites
3. staged rollout + rollback checklist

**Exit Criteria:** production gate ผ่านทั้งหมด

---

## 15) Rollout Strategy

1. Feature Flags
- `PRESENTATION_CANVAS_V2_ENABLED`
- `PRESENTATION_CANVAS_V2_MOBILE_ENABLED`

2. Cohort rollout
- internal -> selected tenants -> 25% -> 100%

3. Rollback
- revert to old editor route/view with data compatibility parser

4. Data Safety
- additive schema only
- keep v1 read/write compatibility during rollout window

---

## 16) Acceptance Criteria (Release Gate)

Release ผ่านเมื่อครบ:

1. Functional
- New Presentation ใช้งานจนแก้ไข canvas ได้ทันทีโดยไม่ต้อง initialize เอง
- Back navigation ไป Document Management ชัดเจน
- core tools ตามภาพตัวอย่างใช้งานได้อย่างน้อยในระดับ MVP

2. UX
- desktop workflow ต่อเนื่อง
- mobile workflow ไม่ block งานหลัก

3. Quality
- unit/integration/e2e ผ่านตามขั้นต่ำ
- ไม่มี critical/high security findings

4. Ops
- monitoring/alerts พร้อม
- rollback tested

---

## 17) Risks & Mitigations

1. Risk: canvas complexity สูง ทำให้ regressions เยอะ
- Mitigation: command architecture + strong tests + phased rollout

2. Risk: mobile gesture conflict (scroll vs edit)
- Mitigation: explicit interaction modes + gesture guards

3. Risk: performance ตกเมื่อ object เยอะ
- Mitigation: layer strategy, virtualization, throttled updates

4. Risk: compatibility กับ slideContent เดิม
- Mitigation: versioned schema + migration adapter + fallback

---

## 18) Open Questions

1. จะรองรับ template marketplace ภายนอกใน phase ไหน
2. ต้องการ collaborative comments ในเฟสนี้หรือเฟสถัดไป
3. ต้องการ typography pack/brand kit ระดับ tenant หรือ global
4. export PDF ต้องรวม video frame strategy อย่างไร (poster vs keyframe)

---

## 19) Recommended Next Artifacts

1. `implementation-spec.md` (เจาะ contracts + component API)
2. `implementation-plan.md` (phase-to-section execution)
3. `implementation-plan-tdd.md` (test-first per section)
4. `sections/` split สำหรับ deep-implement

