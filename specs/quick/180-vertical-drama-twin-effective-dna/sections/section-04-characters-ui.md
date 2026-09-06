# Section 04 — Characters UI

## Ownership

Own `VerticalDramaCharacterStockPanel.tsx` and component tests. Do not change episode
picker layout or shot interaction semantics.

## Work

- Show a symmetric `ฝาแฝดกับ {name}` badge for both linked rows.
- Add a compact Twin Relationship section in character details.
- Show shared face/age fields as inherited and local style/personality fields as editable.
- Show a credit-free legacy repair action and clear loading/error/success states.

## UI/UX Contract

### Target User / JTBD

Vertical Drama creator; confirm twin identity before generating media; success means the
relationship and shared-vs-local DNA are obvious without opening an episode.

### Existing Pattern Reference

Reuse roster cards, conditional badges, collapsible DNA editor, and existing mutation
toast/error patterns in `VerticalDramaCharacterStockPanel.tsx`.

### Surface Inventory

| Surface | Change |
|---|---|
| Roster cards | symmetric twin badge |
| Character detail | relationship summary and repair state |
| DNA editor | inherited shared fields vs local fields |
| Episode page | no UI change; only fresh backend payload |

### State Matrix

| State | Expected UI |
|---|---|
| linked/complete | badge + shared/local DNA |
| legacy detected | repair action, no generation |
| loading | existing spinner/skeleton |
| error | retryable message, preserve edits |
| missing DNA | actionable blocked state |

### Responsive Matrix

Use existing layout at 390x844, 768x1024, 1440x900, and 1024x768; relationship content
wraps with no horizontal overflow.

### Accessibility Acceptance

Text labels must convey relationship without color, repair action is keyboard reachable,
focus is visible, and sections use semantic headings.

### Copy Contract

Thai primary: `ฝาแฝดกับ {name}`, `DNA ร่วมของฝาแฝด`, `ส่วนที่แตกต่างได้`,
`บันทึกความสัมพันธ์แฝด`; provide English via existing localization helper.

### Browser Evidence Required

Run existing route/browser checks or bounded component evidence at mobile, tablet, and
desktop viewports without paid generation.

## Risks

Do not hide twins under variant nesting. Keep existing character selection and shot flow
unchanged.

## Implementation status (2026-09-06)

Implemented symmetric roster/detail badges, a Twin Relationship section, shared-vs-local
DNA guidance, and a credit-free existing-character link action. Episode picker/layout code
was not changed.
