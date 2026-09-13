# Section 01: mode entry and editor hydration

## Ownership

- `VerticalDramaSeriesDetailPage.tsx`: chooser visibility and mode handoff.
- `SpecialTieInEpisodeDialog.tsx`: fresh/resume state boundary and history hydration.

## Implementation

- Reuse current Dialog/Button primitives.
- Fresh mode must reset all local editor state before opening and keep idea-history query disabled.
- Resume mode must preserve latest-run hydration.
- Edit mode with `initialInput` must keep precedence.

## Implementation result

- Added `SpecialTieInStartModeDialog` and wired the existing create-special button through it.
- Added `SpecialTieInStartMode` and `shouldLoadSpecialTieInHistory` to make the history boundary explicit.
- Fresh mode skips history query/hydration; resume mode refetches and waits for the current result before hydration.
- Successful creation invalidates the history list so the new run is the next explicit resume candidate.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama creator.
- Goal: Start a genuinely new special episode or intentionally resume prior work.
- Entry point: Sub-episodes tab, “สร้างตอนพิเศษ”.
- Success outcome: No accidental stale episode data; explicit resume remains available.

### Existing Pattern Reference

- Searched: `rg "<Dialog|DialogTitle|DialogFooter" apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx apps/web/client/src/components/verticalDramaSeries`.
- Found: existing page Dialogs and the current responsive Special Tie-in Dialog.
- Decision: reuse.

### Surface Inventory

| Surface        | File/route                         | Change                         |
| -------------- | ---------------------------------- | ------------------------------ |
| Start chooser  | Series detail Sub-episodes surface | New centered mode Dialog       |
| Special editor | `SpecialTieInEpisodeDialog.tsx`    | Add mode prop and history gate |

### Component Map

| Component           | File                                | Owns                           | Consumes                      |
| ------------------- | ----------------------------------- | ------------------------------ | ----------------------------- |
| Series detail owner | `VerticalDramaSeriesDetailPage.tsx` | chooser and mode handoff       | series id, language           |
| Special editor      | `SpecialTieInEpisodeDialog.tsx`     | editor state/history hydration | `initialMode`, `initialInput` |

### State Matrix

| State                | Expected UI                                           | Verification               |
| -------------------- | ----------------------------------------------------- | -------------------------- |
| chooser              | two clear choices                                     | page/component test        |
| fresh                | blank editor, no history hydration                    | focused test               |
| resume               | latest history may hydrate                            | focused test               |
| no history           | editor remains empty with existing empty behavior     | focused test/source check  |
| loading              | existing editor loading states                        | existing tests             |
| disabled/focus/hover | Dialog buttons keyboard reachable and visibly focused | source/accessibility check |

### Responsive Matrix

| Viewport         | Expected behavior                                  | Evidence                 |
| ---------------- | -------------------------------------------------- | ------------------------ |
| mobile 390x844   | chooser stacks choices and remains within viewport | manual/source inspection |
| tablet 768x1024  | centered compact chooser; editor unchanged         | manual/source inspection |
| desktop 1440x900 | centered compact chooser; editor unchanged         | manual/source inspection |

### Accessibility Acceptance

- Keyboard path reaches chooser buttons in reading order; Escape closes chooser.
- DialogTitle and description identify the decision.
- Buttons have visible labels and focus rings; no color-only distinction.
- Existing reduced-motion behavior remains unchanged.

### Copy Contract

- Thai primary labels: “เลือกวิธีเริ่มต้น”, “สร้างตอนใหม่”, “โหลดงานเดิม”, “ยกเลิก”.
- English fallback labels: “Choose how to start”, “Create new episode”, “Load previous work”, “Cancel”.
- Fresh helper text explicitly says previous episode data will not be loaded.

### Browser Evidence Required

- If browser tooling is available, inspect the chooser at mobile, tablet, and desktop sizes. Otherwise report code/test evidence and browser verification as skipped.
