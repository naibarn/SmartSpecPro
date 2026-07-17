# Section 06 — Character UI

## Goal

Make narrative role unambiguous and editable while keeping occupation visible as a separate
secondary fact.

## Ownership

- `VerticalDramaCharacterStockPanel.tsx` and related editor/card components.
- `CreateSeriesWizard.tsx` structured role display.
- Existing vertical-drama copy/localization modules and UI tests.

## UI/UX Contract

### Target User / JTBD

Vertical-drama creator/editor; identify and correct story role before generating a consistent
character image. Entry points are the series wizard, character stock panel, and image prompt
controls. Success means labels, persistence, and prompt role agree.

### Existing Pattern Reference

Search existing character card chips, selectors, prompt preview, toast, and warning states
with targeted `rg` under `apps/web/client/src/components/verticalDramaSeries`. Reuse
`VerticalDramaCharacterStockPanel` card/editor patterns and existing primitives; diverge
only for canonical-role/occupation separation and structured conflict warnings.

### Surface Inventory and Component Map

| Surface/component | Ownership |
|---|---|
| Character card | primary narrative chip + secondary occupation chip |
| Role editor | grouped role-tier selector, provenance, review state, save |
| Conflict notice | lock/age/role warnings and resolution copy |
| Prompt preview | skill output, validation state, provenance |
| Wizard | structured cast role display and transport |

### State Matrix

| State | Expected behavior |
|---|---|
| loading | skeleton/disabled mutation |
| empty/review | review-required label and selectable role |
| error | inline error, old data retained, retry |
| success | Thai role and occupation chips |
| partial | AI-assigned/review-required state |
| disabled/focus/hover/selected | visible semantics and focus ring |

### Responsive Matrix

| Viewport | Acceptance |
|---|---|
| mobile 390x844 | chips wrap; selector full-width; primary action reachable |
| tablet 768x1024 | no horizontal scroll; controls remain visible |
| desktop 1440x900 | hierarchy and prompt preview readable |
| small-mobile 360x800 | dense card overflow check |
| laptop 1024x768 | editor breakpoint check |
| wide-desktop 1280x800 | prompt preview width check |

### Accessibility and Visual Direction

Keyboard order reaches role selector, warnings, save, cancel, and prompt actions. All
controls have accessible names, semantic text, visible focus, and text-plus-icon warnings.
Reuse existing card density, tokens, colors, typography, spacing, radius, and motion;
respect reduced-motion and avoid raw colors.

### Copy and Browser Evidence

Use Thai labels `นางเอก`, `พระเอก`, `ตัวเอก`, `พระรอง`, `นางร้าย`, `ตัวร้าย`, `ตัวร้ายแฝงตัว`,
`ตัวประกอบเด่น`, `ตัวประกอบ`, `เด็ก`, and `ต้องตรวจสอบบทบาท`. Keep occupation separate,
e.g. `ซีอีโอหญิง`. Warnings explain which lock/safety rule wins. Capture standard browser
evidence at all required and extended viewports; record console, overflow, keyboard,
loading/error, focus, and contrast checks.

## TDD stubs

- Chip/selector labels and persistence.
- AI-assigned, user-confirmed, review-required states.
- Loading/error/disabled/focus/warning behavior.
- Keyboard/accessibility and responsive component behavior.
- Browser route evidence with no new console errors or horizontal overflow.
