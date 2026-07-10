# section-04-create-wizard-ux

## Goal

Add a simple Mix and Match mode to Create Series Wizard step 1 so users can select several story flavors and let AI generate an editable preset draft.

## Ownership Boundaries

Owns:

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- focused client tests for `CreateSeriesWizard`

Does not own:

- backend synthesis implementation
- seed data content
- Storyboard Review or episode pipeline

## UI/UX Contract

### Target User / Job To Be Done

Creator or marketer wants to make a Thai short vertical drama for a local service/restaurant/food shop without knowing how to write a good premise. They should be able to pick a few desired flavors and let AI turn them into a usable story seed.

### Surface Inventory

- Existing Create Series Wizard, Step 1.
- Existing preset grid.
- New mode switch inside the same card:
  - `เลือก Preset`
  - `ผสมหลายแนวด้วย AI`
- New draft preview panel after AI synthesis.

### Component Map

- Mode segmented control.
- Multi-select preset/category card list.
- Optional business context input.
- Optional primary flavor selector.
- Generate button.
- Loading row.
- Draft preview summary.
- Apply/Retry/Cancel actions.

### State Matrix

| State | Expected UI |
|---|---|
| single mode | Current preset picker unchanged. |
| mix empty | Friendly guidance and disabled generate button until 2 selections. |
| mix ready | Generate button enabled; selected flavors visible as chips/cards. |
| loading | Shows plain-language AI thinking copy, button disabled. |
| success | Draft preview shows title, logline, tone, character count, and actions. |
| error | Simple retryable message; no schema jargon. |
| applied | Draft fills wizard fields and user can edit every tab. |

### Responsive Matrix

| Viewport | Expected Behavior |
|---|---|
| mobile 390x844 | Mode switch and selections stack; draft actions remain visible without horizontal overflow. |
| tablet 768x1024 | Two-column selection grid where space allows. |
| desktop 1440x900 | Selection grid and draft preview can sit comfortably in the existing dialog width. |

### Accessibility Acceptance

- Mode control is keyboard reachable and announces selected mode.
- Multi-select cards expose selected state.
- Generate/apply buttons have clear accessible names.
- Loading and error states use text, not color only.
- Focus moves or remains predictably after draft generation.

### Copy Contract

Thai-first copy, with English fallback.

Recommended Thai copy:

- Header: `ให้ AI ช่วยผสมแนวเรื่อง`
- Helper: `เลือก 2-5 แนวที่อยากได้ แล้ว AI จะช่วยทำเป็นพล็อตตั้งต้นให้แก้ต่อได้`
- Business context label: `ธุรกิจ/ร้าน/บริการที่อยากผูกเรื่อง`
- Placeholder: `เช่น ร้านก๋วยเตี๋ยว, คาเฟ่ในชุมชน, ร้านซ่อมมือถือ`
- Generate: `ให้ AI ผสมเป็น Preset`
- Loading: `AI กำลังจัดรสชาติเรื่องให้เข้ากัน...`
- Apply: `ใช้ draft นี้`
- Retry: `ปรับใหม่`
- Error: `ผสมแนวเรื่องไม่สำเร็จ ลองลดจำนวนแนวหรือใส่บริบทธุรกิจให้ชัดขึ้น`

Avoid these visible terms:

- schema
- JSON
- payload
- synthesis
- LLM

### Browser Evidence Required

- Desktop single-preset mode.
- Desktop Mix mode with 2+ selected flavors.
- Desktop draft preview.
- Mobile Mix mode, before and after draft generation.

## Implementation Notes

- Reuse the existing preset query data to avoid another list endpoint.
- Add local selected state for Mix mode.
- Call `trpc.verticalDramaSeries.synthesizeGenrePreset.useMutation`.
- Add `applyPresetDraft(draft)` that uses the same field mappings as `applyPreset`.
- Keep title user-entered; the draft title can be suggested but should not overwrite the user's series title unless the user has not typed one or explicitly chooses to use it.

## TDD Expectations

- Existing single preset test remains green.
- New tests cover disabled/enabled generate state.
- New tests cover draft apply mapping.
- New tests cover error/loading copy.

## Acceptance Checks

- Users can complete the flow without reading technical instructions.
- AI draft is editable after apply.
- Create action still requires only title and valid episode count.

## Risks

- Wizard file may grow large. If implementation becomes hard to maintain, extract a small `MixAndMatchPresetPanel` component under the same folder.
- Existing dirty changes currently touch `CreateSeriesWizard.tsx`; implementation must inspect current diff before editing.
