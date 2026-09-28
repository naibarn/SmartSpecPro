# Section 02 — Character-tab DNA editor

## Ownership boundaries

Own the selected-character detail UI, draft state, mutation wiring, localized
copy, and focused component tests. Do not alter prompt generation behavior in
this section.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` if
  needed
- focused Character-tab tests

## UI/UX Contract

### Target User / JTBD

A drama creator must find the exact age and face identity data used for a
character, correct it in the Character tab, and save without accidentally
spending generation credits.

### Surface Inventory

- Selected character detail card: DNA status/source summary.
- Collapsible `Character DNA` section: editable identity fields.
- Read-only story/design DNA group: inspectable AI metadata.
- Existing casting notes group: explicitly non-canonical.
- Save/cancel/error/stale status controls.

Prefer existing Card, Label, Input, Textarea, Badge, Alert, and Button patterns
from the component. Keep per-character draft state keyed by `characterId`.

### Component Map

- Selected character detail Card and DNA status summary.
- Editable identity fields and read-only story/design field groups.
- Save/cancel controls, stale warning, and localized error/status feedback.

### State Matrix

| State | Required behavior |
| --- | --- |
| DNA present / clean | Show persisted values and source metadata. |
| DNA present / edited | Enable save and cancel; show unsaved indicator. |
| Saving | Disable fields/actions for that character and show spinner. |
| Saved | Refetch, show success, mark prompt/portrait potentially stale. |
| No DNA | Explain that DNA must be generated first; do not show fake values. |
| Validation error | Keep draft and show field-level error. |
| Revision conflict | Refetch latest DNA and ask user to review before retry. |
| Read-only mode | Show values but disable edits and save. |

### Responsive Matrix

- Desktop: two-column identity/story groups where the existing card layout
  allows it; keep labels adjacent to values.
- Narrow viewport: single-column fields, full-width textareas and action row.
- Long DNA text: preserve readable wrapping without horizontal scrolling.

### Accessibility Acceptance

- Every field has a stable label and unique `htmlFor`/id.
- Save/cancel and status messages are keyboard reachable.
- Pending and error states are announced through existing alert/toast patterns.
- Read-only fields are not presented as editable controls.
- Color is not the sole signal for stale, error, or read-only status.

### Copy Contract

- Thai is the primary UI language; retain English fallback through the existing
  `t(lang, thai, english)` pattern.
- Use `Character DNA — ข้อมูลหลักที่ใช้สร้างภาพ` for the section title.
- Label age as `อายุ/ช่วงอายุ Canonical ที่ใช้สร้างภาพ`.
- Label casting details as `หมายเหตุ Casting เพิ่มเติม (ไม่ใช่ Canonical DNA)`.
- Success: `บันทึก Character DNA แล้ว`.
- Stale: `DNA ถูกแก้ไขแล้ว Prompt/ภาพเดิมอาจยังไม่ตรง`.
- Empty: `ยังไม่มี Character DNA กรุณาสร้าง Preview ก่อน`.
- Preserve English equivalents for all labels, validation, loading, success,
  and conflict messages.

### Browser Evidence Required

In the Character tab, verify display of the persisted age, edit/save behavior,
absence of generation requests/credit calls on save, and stale status after
save. Then explicitly generate and verify the edited age reaches the prompt.

## TDD expectations

Add focused tests for display, draft edits, save payload, no-generation side
effect, read-only metadata, no-DNA state, errors, pending state, and conflict
refresh behavior.

## Risks

The component is large and already dirty. Keep helpers near existing pure UI
builders or extract only small testable functions; avoid broad refactoring.

## Implementation status

Implemented in `VerticalDramaCharacterStockPanel.tsx`. The selected character
now exposes the canonical age and eight face-identity fields for editing,
shows source/revision/stale state, keeps Story/Design DNA read-only, and saves
through the dedicated DNA mutation without triggering generation. Focused UI
tests cover canonical reads and the no-DNA state.
