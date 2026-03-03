# Presentation Editor AI Layout Plan (V2.1)

- Version: `v2.1`
- Date: `2026-03-03`
- Owner: `Web Platform Team (Presentation)`
- Status: `Planned`

## 1) Goal

ยกระดับ `Presentation Edit` ให้รองรับรูปแบบสไลด์เชิงโครงสร้างตามตัวอย่าง (Hero + Feature Grid, Numbered Steps + Side Visual + Callout) โดยทำให้ทั้ง `Draft with AI` และ `Auto Layout` ใช้งานได้จริงในงานภาษาไทย/อังกฤษ พร้อมความปลอดภัยด้านข้อมูล (version conflict), ความเสถียร และทดสอบครอบคลุม รวมถึงรองรับ `Watermark จากไฟล์ใน Library` แบบเป็นตัวเลือกเปิด/ปิดโดยผู้ใช้

## 2) Scope

### In Scope

1. เพิ่ม slide archetypes ใหม่ใน AI pipeline และ layout engine
2. เพิ่ม structured content schema (feature items / steps / callout) แบบ backward compatible
3. เพิ่มโหมด `Auto Layout` แบบ semantic-preserving
4. เพิ่ม preview/dry-run ก่อน apply จริง
5. เพิ่ม conflict-safe apply flow (preview token + optimistic lock)
6. เพิ่ม reliability สำหรับ batch apply (retry/resume/report)
7. เพิ่ม quality gates (overflow/overlap/readability)
8. เพิ่ม test matrix รวม visual regression
9. rollout ด้วย feature flags แยกความสามารถและ kill switch
10. รองรับ watermark file จาก library แบบ optional (เลือกเพิ่มหรือไม่เพิ่มได้)

### Out of Scope (V2.1)

1. สร้าง drag-and-drop template editor แบบใหม่ทั้งหมด
2. redesign ของ Canvas object model ทั้งระบบ
3. แทนที่ AI model/provider stack เดิม
4. เปลี่ยนระบบ export/playback schema หลัก
5. สร้างระบบ Digital Rights Management ใหม่

## 3) Key Improvements From Previous Plan

1. เพิ่ม `Contract & Migration phase` แยกชัดเจนก่อนเริ่ม implement
2. เพิ่ม conflict handling สำหรับช่วง `Preview -> Apply`
3. เพิ่ม batch partial-failure policy และ resume strategy
4. เพิ่ม quality gate เชิง layout ไม่ใช่แค่ schema validation
5. กำหนด performance SLO/P95 และ timeout/degrade path
6. เพิ่ม visual regression criteria (TH/EN + multi-ratio)
7. แยก feature flag ตาม capability เพื่อลด blast radius

## 4) Architecture Decisions (Approved for V2.1)

1. **Backward compatibility first**
   - เพิ่ม schema แบบ optional union; read old + new format ได้เสมอ
   - write path สำหรับ V2 จะเก็บ structured metadata เฉพาะเมื่อมี

2. **Semantic-first relayout**
   - Auto Layout จะพยายาม map existing elements เป็น semantic blocks ก่อน
   - ถ้า confidence ต่ำ fallback เป็น legacy template path พร้อม warning

3. **Preview token workflow**
   - preview endpoint คืน `previewToken` + `sourceSlideVersion` + `contentHash`
   - apply endpoint ต้องส่ง token นี้กลับ และ reject หาก slide version เปลี่ยน

4. **Progressive rollout**
   - flags แยก: `new_templates`, `structured_draft`, `relayout_preview`
   - เริ่มเปิดทีละส่วน

5. **Watermark as optional overlay**
   - watermark ถูกเก็บเป็น asset reference จาก library ของ tenant เดียวกันเท่านั้น
   - ผู้ใช้เลือกได้ว่าจะเปิด watermark หรือไม่ และกำหนด scope (`current slide` / `all slides` / `new slides`)
   - กรณี asset หายหรือเข้าถึงไม่ได้ ระบบต้อง fallback แบบไม่ทำให้ apply ทั้งงานล้ม
   - persistence model ใช้ `slideContent.watermark` (metadata) แล้ว render เป็น overlay element แบบ deterministic

## 5) Detailed Execution Plan

## Phase 0.1: Contract & Migration Hardening

- ETA: `1.5 engineer-days`
- Objective: ป้องกัน regression ของข้อมูลเก่า/ใหม่ก่อนเพิ่ม feature

### Tasks

1. [A1] เพิ่ม versioned schema สำหรับ structured blocks ใน `aiTypes`
   - Files:
     - `apps/web/shared/presentation/aiTypes.ts`
2. [A2] เพิ่ม compatibility parser/normalizer สำหรับอ่าน slide data ทั้ง old/new
   - Files:
     - `apps/web/server/services/aiPresentationService.ts`
3. [A3] เพิ่ม test migration cases (old -> new parse, new -> old fallback)
   - Files:
     - `apps/web/server/services/__tests__/aiPresentationService.test.ts`

### Acceptance Criteria

1. deck เก่าที่มีเฉพาะ `title + body[]` ต้องใช้งานได้เหมือนเดิม 100%
2. draft ใหม่ที่มี structured blocks ต้อง parse ผ่านและไม่ทำให้ legacy flow พัง
3. tests ผ่านครบ

---

## Phase 1: New Archetypes + Template Builders + UI Selectors

- ETA: `3 engineer-days`
- Objective: รองรับโครงสไลด์ตัวอย่างในระดับ layout engine และหน้า editor

### New Archetypes (V2.1)

1. `hero_banner_feature_grid_2x2`
2. `hero_feature_grid_2x2`
3. `left_steps_right_image_callout`

### Tasks

1. [B1] เพิ่ม template IDs และ labels
   - Files:
     - `apps/web/shared/presentation/aiTypes.ts`
     - `apps/web/client/src/pages/PresentationEditor.tsx`
2. [B2] implement builders ใน layout engine
   - Files:
     - `apps/web/server/services/aiPresentationLayoutEngine.ts`
3. [B3] ปรับ template resolver ให้รองรับ archetype ใหม่
   - Files:
     - `apps/web/server/services/aiPresentationService.ts`
4. [B4] เพิ่มตัวเลือก structure ใน `AIDraftModal`
   - Files:
     - `apps/web/client/src/components/presentation/AIDraftModal.tsx`
5. [B5] เพิ่มตัวเลือก structure ใน Auto Layout dialog
   - Files:
     - `apps/web/client/src/pages/PresentationEditor.tsx`
6. [B6] เพิ่ม unit tests สำหรับ template rendering ใหม่
   - Files:
     - `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`

### Acceptance Criteria

1. สามารถ generate/re-layout ให้ได้ 3 archetypes ข้างต้น
2. ผ่าน TH/EN text samples และ canvas ratios อย่างน้อย `16:9`, `4:3`, `9:16`
3. ไม่มี overlap/overflow ชัดเจนจาก golden snapshots

---

## Phase 2: Structured Draft with AI (Semantic Output)

- ETA: `3.5 engineer-days`
- Objective: ให้ Draft with AI สร้าง semantic content ที่ตรงกับรูปแบบเป้าหมาย

### Structured Content Model (Draft)

1. `featureItems[]`: `{ iconHint, title, description }`
2. `steps[]`: `{ index, title, description }`
3. `callout`: `{ title, body, tone }`
4. `hero`: `{ title, subtitle?, imageIntent }`

### Tasks

1. [C1] ขยาย `AIPresentationSlide` schema รองรับ semantic blocks
   - Files:
     - `apps/web/shared/presentation/aiTypes.ts`
2. [C2] อัปเดต slide split system prompt ให้กำหนด output โครงสร้างใหม่
   - Files:
     - `apps/web/server/services/aiPresentationService.ts`
3. [C3] เพิ่ม parser/validator สำหรับ structured response + fallback
   - Files:
     - `apps/web/server/services/aiPresentationService.ts`
4. [C4] mapping semantic blocks -> template builders
   - Files:
     - `apps/web/server/services/aiPresentationLayoutEngine.ts`
5. [C5] tests: structured response success/fallback/corrupted payload
   - Files:
     - `apps/web/server/services/__tests__/aiPresentationService.test.ts`

### Acceptance Criteria

1. Draft with AI สร้าง 3 archetypes ได้โดยไม่ต้องปรับมือมาก
2. เมื่อ LLM ตอบไม่ครบ ระบบ fallback ได้โดยไม่ fail ทั้งงาน
3. warning ชัดเจนและไม่ drop slide โดยไม่แจ้ง

---

## Phase 2.5: Optional Watermark From Library

- ETA: `2.5 engineer-days`
- Objective: ให้ผู้ใช้เลือกเพิ่ม watermark จากไฟล์ภาพใน library ได้แบบ optional และปลอดภัย

### Watermark Capability (V2.1)

1. Source: image file จาก library (tenant เดียวกัน)
2. Toggle: `Add Watermark` (default OFF)
3. Placement: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`
4. Style controls: `clarityPercent`, `widthPercent`, `marginPx`
5. Scope: `current`, `all`, `apply-to-new-slides`

### Watermark Policy

1. Allowed file types: `png`, `jpg` เท่านั้น
2. Max watermark file size: `10 MB`
3. Min source dimensions: `>= 256x256`
4. หากเลือกไฟล์ที่ policy ไม่ผ่าน ต้อง block ก่อน apply พร้อม error ที่แก้ไขได้
5. ตอน apply ต้องสร้าง deck-asset reference ที่ตรวจสอบ tenant scope แล้ว
6. กรณีไฟล์ต้นทางถูกลบ/สิทธิ์เปลี่ยนหลัง apply: render ด้วย fallback (skip watermark) + warning ใน export/playback logs
7. `clarityPercent` เป็นค่าที่ผู้ใช้กำหนดได้ช่วง `5-100` (step 5)
8. Mapping: `opacity = clarityPercent / 100`
9. Default style: `clarityPercent=18`, `widthPercent=14`, `marginPx=24`
10. UI ต้องแสดงค่าเป็น `%` ชัดเจน (ไม่ให้ user เจอเลขทศนิยม opacity โดยตรง)
11. Layering contract: watermark อยู่เหนือ background/media หลัก แต่ต่ำกว่า text/callout (กันบังเนื้อหา)
12. V2.1 จำกัด 1 watermark ต่อ slide

### Tasks

1. [W1] กำหนด watermark contract และ metadata
   - Fields: `enabled`, `libraryItemId`, `placement`, `clarityPercent`, `widthPercent`, `marginPx`, `scope`
   - Storage: `slideContent.watermark` (ห้าม duplicate overlay element แบบฝังซ้ำหลายชั้น)
   - Files:
     - `apps/web/shared/presentation/contracts.ts`
     - `apps/web/shared/presentation/aiTypes.ts`
2. [W2] เพิ่ม service สำหรับ resolve watermark asset (permission + tenant validation)
   - Files:
     - `apps/web/server/services/presentationTemplateService.ts`
     - `apps/web/server/services/aiPresentationService.ts`
3. [W3] เพิ่ม API inputs สำหรับ draft/relayout preview/apply ให้รับ watermark options
   - Files:
     - `apps/web/server/routers/presentation.ts`
4. [W4] เพิ่ม UI controls ใน `AIDraftModal` สำหรับ watermark source + toggle + style
   - UI label: `Watermark Clarity (%)`
   - Files:
     - `apps/web/client/src/components/presentation/AIDraftModal.tsx`
5. [W5] เพิ่ม UI controls ใน `Auto Layout` dialog และ preview panel
   - UI label: `Watermark Clarity (%)`
   - Files:
     - `apps/web/client/src/pages/PresentationEditor.tsx`
6. [W6] เพิ่ม layout apply logic แทรก watermark เป็น layer ที่กำหนดตำแหน่งได้
   - Files:
     - `apps/web/server/services/aiPresentationLayoutEngine.ts`
7. [W7] tests ครอบคลุม permission/fallback/render/preview/apply
   - Files:
     - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
     - `apps/web/server/routers/__tests__/presentation.ai.test.ts`
     - `apps/web/client/src/pages/PresentationEditor.test.tsx`
8. [W8] เพิ่ม watermark lifecycle handling (asset removed / permission changed / stale url)
   - Files:
     - `apps/web/server/services/presentationExportService.ts`
     - `apps/web/server/services/presentationPlaybackExport.ts`
     - `apps/web/server/services/presentationService.ts`

### Acceptance Criteria

1. ผู้ใช้สามารถเลือกภาพ watermark จาก library และเปิด/ปิดได้
2. apply watermark แล้วยังผ่าน preview/apply conflict-safe flow
3. ถ้า watermark asset ใช้งานไม่ได้ ระบบแจ้งเตือนและ fallback โดยไม่ทำให้ apply ทั้งงานล้ม
4. export/playback แสดง watermark ตามที่ตั้งค่าไว้
5. เมื่อ watermark source ใช้งานไม่ได้ในภายหลัง ระบบไม่ crash และมี warning code ที่ trace ได้
6. watermark ไม่บัง text หลักตาม layering contract
7. apply ซ้ำต้อง idempotent (ไม่เกิด watermark ซ้อนหลายชั้น)

---

## Phase 3: Auto Layout Preview + Semantic Preserve + Safe Apply

- ETA: `4 engineer-days`
- Objective: ลดความเสี่ยง apply ผิดสไลด์/ทับข้อมูล และเพิ่มความมั่นใจผู้ใช้

### Tasks

1. [D1] เพิ่ม endpoint `previewRelayoutSlide`
   - คืนค่า: `previewSlideContent`, `previewToken`, `sourceVersion`, `summaryDiff`
   - Files:
     - `apps/web/server/routers/presentation.ts`
     - `apps/web/server/services/aiPresentationService.ts`
2. [D2] เพิ่ม endpoint `applyRelayoutPreview` ที่ validate token/hash/version
   - Files:
     - `apps/web/server/routers/presentation.ts`
3. [D3] เพิ่ม semantic-preserve strategy ใน relayout path
   - Files:
     - `apps/web/server/services/aiPresentationService.ts`
4. [D4] เพิ่ม UI preview panel ก่อน apply (side-by-side + warnings)
   - Files:
     - `apps/web/client/src/pages/PresentationEditor.tsx`
5. [D5] เพิ่ม `Apply current` / `Apply all` พร้อม per-slide result summary
   - Files:
     - `apps/web/client/src/pages/PresentationEditor.tsx`
6. [D6] conflict handling UX
   - ถ้า version เปลี่ยนระหว่าง preview/apply -> แจ้ง re-preview

### Acceptance Criteria

1. ผู้ใช้ต้องเห็น preview ก่อน apply ได้
2. apply ต้อง fail-safe เมื่อ version เปลี่ยน
3. semantic blocks สำคัญ (feature count/step count/callout) ไม่หายโดยไม่แจ้ง

---

## Phase 4: Reliability, Performance, and Batch Failure Strategy

- ETA: `2 engineer-days`
- Objective: ทำให้การใช้งานจริงเสถียร โดยเฉพาะงาน `All slides`

### Tasks

1. [E1] policy สำหรับ partial failure
   - retry ต่อ slide ได้สูงสุด 2 ครั้ง (idempotent)
   - เก็บรายงาน `success/failed/skipped`
2. [E2] resume strategy
   - ถ้า user ยกเลิกกลางทาง สามารถ resume จาก slide ถัดไปได้
3. [E3] performance instrumentation
   - metrics: preview latency, apply latency, batch completion time
4. [E4] timeout/degrade policy
   - ถ้า semantic mapping เกิน threshold -> fallback legacy template พร้อม warning

### Acceptance Criteria

1. batch 30 slides ต้องไม่ fail ทั้งชุดจาก error เฉพาะบาง slide
2. มี telemetry เพียงพอสำหรับ debug production
3. P95 targets ผ่านตาม section 8

---

## Phase 5: QA, Visual Regression, Rollout, and Kill Switch

- ETA: `2 engineer-days`
- Objective: deploy อย่างปลอดภัยและถอยกลับได้เร็ว

### Tasks

1. [F1] เพิ่ม test suites
   - router/service/layout/editor integration
2. [F2] visual regression snapshots
   - TH/EN
   - ratios: `16:9`, `4:3`, `9:16`
3. [F3] เปิดใช้ feature flags ทีละเฟส
4. [F4] เตรียม runbook rollback และ monitoring dashboard

### Acceptance Criteria

1. test pass ครบ
2. visual baseline ผ่าน review
3. rollout 5% -> 25% -> 100% โดยไม่มี Sev-1/Sev-2

## 6) Work Breakdown (Task Board)

| ID | Area | Owner | Estimate | Depends On | Deliverable |
|---|---|---:|---:|---|---|
| A1 | Schema versioning | Backend + Shared | 0.5d | - | New schema types + docs |
| A2 | Compatibility parser | Backend | 0.5d | A1 | Safe read old/new |
| A3 | Migration tests | Backend QA | 0.5d | A1,A2 | Passing migration tests |
| B1 | Template IDs/UI labels | Frontend + Shared | 0.5d | A1 | New selector options |
| B2 | Layout builders | Backend | 1.5d | B1 | 3 new builders |
| B3 | Resolver updates | Backend | 0.5d | B2 | Deterministic mapping |
| B4 | Draft modal structure option | Frontend | 0.5d | B1 | Archetype chooser in modal |
| B5 | Auto layout structure option | Frontend | 0.5d | B1 | Archetype chooser in dialog |
| B6 | Template tests | Backend QA | 0.5d | B2 | New rendering tests |
| C1 | Structured slide schema | Shared | 0.5d | A1 | Semantic block schema |
| C2 | Prompt update | Backend | 0.5d | C1 | Structured LLM contract |
| C3 | Parser/fallback | Backend | 1.0d | C2 | Robust parse + fallback |
| C4 | Semantic mapping | Backend | 1.0d | C3 | Blocks -> builder mapping |
| C5 | Structured tests | Backend QA | 0.5d | C3,C4 | Service tests |
| W1 | Watermark schema/metadata | Shared + Backend | 0.5d | A1 | Watermark contracts |
| W2 | Watermark asset resolver | Backend | 0.5d | W1 | Permission-safe resolver |
| W3 | Watermark API inputs | Backend | 0.3d | W1,W2 | Draft/relayout API support |
| W4 | Draft watermark UI | Frontend | 0.5d | W3 | Watermark option in Draft modal |
| W5 | Auto layout watermark UI | Frontend | 0.5d | W3 | Watermark option in Auto Layout |
| W6 | Watermark overlay renderer | Backend | 0.4d | W1,W2 | Watermark layer in layout |
| W7 | Watermark tests | Fullstack QA | 0.3d | W3,W6 | E2E and regression coverage |
| W8 | Watermark lifecycle fallback | Backend | 0.4d | W2,W6 | Safe behavior on missing/revoked asset |
| D1 | Preview endpoint | Backend | 1.0d | B2,C4 | previewRelayout API |
| D2 | Apply with token | Backend | 1.0d | D1 | Conflict-safe apply API |
| D3 | Semantic preserve | Backend | 0.5d | C4 | Preserve strategy |
| D4 | Preview UI | Frontend | 1.0d | D1 | Side-by-side preview |
| D5 | Batch result UX | Frontend | 0.5d | D2 | Detailed summary |
| D6 | Conflict UX | Frontend | 0.5d | D2 | Re-preview flow |
| E1 | Partial failure policy | Backend | 0.5d | D2 | Retry/report logic |
| E2 | Resume strategy | Backend | 0.5d | E1 | Resume metadata |
| E3 | Instrumentation | Backend | 0.5d | D2 | Metrics/logs |
| E4 | Timeout/degrade | Backend | 0.5d | C4 | Guardrail path |
| F1 | Integration tests | Fullstack QA | 0.8d | D5,E1 | Stable CI |
| F2 | Visual regression | QA | 0.8d | B6,D4 | Baselines |
| F3 | Flag rollout | SRE + Backend | 0.3d | F1,F2 | controlled rollout |
| F4 | Runbook/rollback | SRE | 0.1d | F3 | ops docs |

## 7) Risk Register

| Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| Structured schema breaks old decks | Critical | compatibility parser + migration tests (A1-A3) | Backend |
| Preview/apply race condition | Critical | token + version lock (D1-D2) | Backend |
| Watermark asset invalid/missing ทำให้ apply fail | High | resolver + graceful fallback + warning (W2,W6) | Backend |
| Watermark URL หมดอายุระหว่าง export/playback | High | lifecycle fallback + URL refresh policy (W8) | Backend |
| All-slides apply unstable | High | retry/resume/report (E1-E2) | Backend |
| Layout still readableไม่พอ | High | quality gates + visual regression (B6,F2) | QA |
| Latency สูงเกินใช้งาน | High | P95 tracking + degrade mode (E3-E4) | Backend |

## 8) Performance & Reliability Targets

1. `previewRelayoutSlide` P95 < 1.2s (single slide)
2. `applyRelayoutPreview` P95 < 800ms (single slide save path)
3. Auto Layout all 30 slides (no image generation) P95 < 45s
4. Failure rate < 1% ต่อ slide (หลัง retry policy)
5. 100% conflict-safe: apply ต้อง reject เมื่อ `sourceVersion` mismatch
6. เปิด watermark แล้วเวลาประมวลผลต่อสไลด์เพิ่มไม่เกิน 80ms (P95)
7. watermark apply validation P95 < 200ms ต่อคำขอ

## 9) Testing Strategy

### Unit

1. template builder correctness
2. semantic parser/fallback
3. preview token validation
4. retry/resume policies
5. watermark placement + style normalization
6. watermark z-order contract validation

### Integration

1. draft -> slide generation -> save
2. preview -> apply happy path
3. preview -> apply conflict path
4. auto layout all slides partial failure path
5. watermark from library -> preview -> apply -> export/playback
6. watermark source revoked after apply -> export/playback graceful fallback

### Visual Regression

1. archetype ทั้ง 3 แบบ
2. TH and EN content
3. aspect ratios: `16:9`, `4:3`, `9:16`
4. baseline update workflow with reviewer sign-off
5. with/without watermark comparison baseline

## 10) Feature Flags & Rollout Plan

- `PRESENTATION_AI_LAYOUT_NEW_TEMPLATES`
- `PRESENTATION_AI_LAYOUT_STRUCTURED_DRAFT`
- `PRESENTATION_AI_LAYOUT_PREVIEW_APPLY`
- `PRESENTATION_AI_LAYOUT_WATERMARK`

Rollout sequence:

1. Enable `NEW_TEMPLATES` internal only
2. Enable `STRUCTURED_DRAFT` to 5% tenants
3. Enable `PREVIEW_APPLY` to 5% tenants
4. Enable `WATERMARK` internal only
5. Increase to 25% after 48h no Sev issues
6. 100% rollout + monitor 7 days

Watermark rollout gate:

1. watermark warning rate < 0.5% ของ apply attempts
2. watermark render fallback rate < 0.3% ของ export/playback jobs
3. ไม่มี critical permission leak incident (cross-tenant asset access)

Kill switch:

1. disable `PREVIEW_APPLY` first
2. disable `STRUCTURED_DRAFT`
3. disable `WATERMARK`
4. fallback to legacy templates only

## 11) Definition of Done (V2.1)

1. รองรับ 3 archetypes ตามตัวอย่างจริง
2. Draft with AI สร้าง semantic layout ได้และ fallback ปลอดภัย
3. Auto Layout มี preview ก่อน apply พร้อม conflict-safe token flow
4. batch apply มี retry/resume/report ชัดเจน
5. ผ่าน test + visual regression + performance targets
6. rollout 100% โดยไม่มี incident ระดับสูง
7. มี watermark option จาก library ที่เปิด/ปิดได้ และไม่กระทบ flow เดิม

## 12) Immediate Next Actions (Week 1)

1. Finalize schema contract (A1)
2. Implement compatibility parser (A2)
3. Add migration tests (A3)
4. Start template IDs/builders (B1-B2)
5. Finalize watermark contract and UX defaults (W1)
