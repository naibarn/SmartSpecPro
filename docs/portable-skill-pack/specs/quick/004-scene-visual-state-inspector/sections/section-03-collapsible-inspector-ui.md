# Section 03 — Collapsible Inspector UI

## Ownership

Own the Location-panel Scene Visual State presentation and editing flow.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSceneLockRow.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` only if response data
  or invalidation wiring requires it.

## UI/UX Contract

### Target User / JTBD

Vertical Drama author who needs to correct one scene fact and have every
continuous shot use it without editing hidden prompts one by one.

### Surface Inventory

- Location card: compact always-visible Inspector header.
- Inspector body: collapsed by default; expandable inline content.
- State sections: lighting, furniture/sleep surface, layout, props, wardrobe,
  palette, and review gaps.
- Impact summary: member shot count and shot-number list.
- Save feedback: changed fields, stale warning, success, conflict/error.

### Component Map

`VerticalDramaSceneLockRow` owns the collapsed header and expanded Inspector;
`VerticalDramaStoryboardPanel` owns Location placement and member-shot context.
Existing page mutation callbacks remain the data boundary.

### State Matrix

| State | Required behavior |
|---|---|
| Disabled flag | No Inspector mounted |
| No state | Explain what the panel controls and offer plan action |
| AI state | Show AI status and allow edit |
| Manual state | Show manual status and allow edit |
| Needs review/stale | Amber warning and actionable explanation |
| Expanded | Show all sections and current values |
| Editing | Local draft only; save/cancel visible |
| Saving | Disable duplicate submits, show progress |
| Success | Show revision, affected shots, regenerate-later message |
| Conflict | Preserve draft if safe, show latest state and refresh/retry |
| Validation error | Error next to field with correction guidance |

### Responsive Matrix

- Desktop: compact two-column form where readable; repeatable lists remain
  stacked rows.
- Tablet/mobile: single-column sections, full-width controls, no horizontal
  overflow; header remains readable with count/status wrapping.
- Touch targets are at least the existing button minimum and have visible text.

### Accessibility Acceptance

- Use semantic button/collapsible controls with `aria-expanded` and a visible
  label, not icon-only affordances.
- Every field has a visible label, helper copy, focus ring, and error text.
- Escape closes a focused dialog if a dialog remains; keyboard can expand/save/
  cancel without pointer input.
- Status is conveyed by text as well as color.

### Copy Contract

- Primary title: `Scene Visual State — ข้อมูลกลางของฉากนี้`.
- Scope copy: `กำหนดสิ่งที่ควรคงเดิมในทุกช็อตที่เกิดขึ้นในสถานที่นี้`.
- Impact copy: `แก้ไขที่นี่ครั้งเดียว จะมีผลกับทุกช็อตในฉากนี้เมื่อสร้างพรอมต์
  หรือภาพครั้งถัดไป`.
- Furniture helper: `ระบุของชิ้นใหญ่ที่ต้องอยู่ในฉาก เช่น เตียงนอนทรงยาว เปล
  หรือโซฟา พร้อมตำแหน่งในห้อง`.
- Example: `เช่น เตียงนอนทรงยาวของภูมิ ไม่ใช่เปลเด็ก`.
- Save warning: `การแก้ไขนี้มีผลกับ N ช็อต ภาพเดิมจะยังอยู่ แต่ต้องสร้างภาพใหม่
  จึงจะเห็นการเปลี่ยนแปลง`.
- English fallback remains available through the existing `copy`/`t` pattern.

### Browser Evidence Required

Verify collapsed initial state, readable purpose copy, expansion, keyboard
operation, sleep-surface edit, save impact warning, and mobile wrapping.

## TDD and acceptance

- Starts collapsed.
- Title, purpose, count, and status are visible before expansion.
- Expanded fields have explanatory Thai copy and examples.
- List edits and sleep-surface edits produce the expected patch.
- Saving shows impact and stale outcome without hiding images.
