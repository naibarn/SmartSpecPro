# Section 03 — Creator UI

## Dependency

Consumes Section 02 tRPC and manifest contracts.

## Ownership

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- focused panel tests and, only if extraction is needed, one local candidate subcomponent

Preserve existing role-tier and custom-instruction changes in the dirty component.

## Implementation

Add open-casting eligibility, per-character count default 3, candidate preview/confirm, batch
submission, per-candidate polling keyed by asset link, settle success/failure, reload resume,
batch grouping, selection, alternatives, warning, and normal-flow fallback. Reuse existing
URL resolution and lightbox behavior but never generic-link a candidate as primary.

## UI/UX Contract

### Target User / JTBD

- Role: vertical-drama creator.
- Goal: compare 1-5 different but equally strong faces and select canonical identity.
- Entry: Characters detail for a standalone character with identity open.
- Success: selected primary plus retained non-reference alternatives.

### Existing Pattern Reference

- Searched: candidate grid/selection and discrete option controls.
- Found: `VerticalDramaContactSheetPicker.tsx` and current panel prompt preview.
- Decision: reuse card/selection/status/a11y semantics; diverge to individual portrait tasks.

### Surface Inventory

| Surface | Change |
|---|---|
| Generation controls | 1-5 radiogroup, default 3, eligibility |
| Prompt confirmation | read-only N summaries, model/count/cost basis |
| Candidate grid | status, 9:16 preview, select, alternatives |

### Component Map

| Unit | Owns | Consumes |
|---|---|---|
| Count control | per-character quantity | eligibility |
| Candidate preview | confirm/cancel | preview response |
| Candidate card/grid | state/image/select | manifest + polling |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| open empty | selector + generate | component test |
| prompt loading/ready | disabled duplicate + N summaries | component test |
| submitting/rendering | independent status cards | component test |
| partial/failed | siblings retained + text error | component test |
| selected/switching | pressed badge + future-only warning | component test |
| read-only/focus/hover | actions disabled, viewable, visible focus | test/manual |

### Responsive Matrix

| Viewport | Behavior | Evidence |
|---|---|---|
| mobile 390x844 | 2 columns, wrapped controls | browser/manual |
| tablet 768x1024 | 3 columns | browser/manual |
| desktop 1440x900 | up to 5 columns | browser/manual |
| laptop 1024x768 | wraps, no hidden action | manual if available |

### Accessibility Acceptance

- Labelled radiogroup/radios for count.
- `aria-pressed` candidate selection and unique names.
- Text status in addition to color; polite live status and alert errors.
- Visible logical focus; no essential new motion.

### Design Token Extraction

- Sources: current character panel, contact-sheet picker, existing UI primitives.
- Color: semantic primary/muted/destructive/warning classes.
- Typography/density: existing text-sm/xs balanced operational density.
- Spacing/radius/elevation: current Card/Button/Badge and rounded border patterns.
- Do not change: global theme, raw colors, normal character-card layout.

### Copy Contract

Thai primary with English fallback. Explain count, different faces/equal role quality, primary,
alternatives, task states, partial failure, and future-generation-only switching. Hide JSON,
task IDs, DNA terminology, and provider jargon.

### Browser Evidence Required

Follow Orchestra UI browser evidence for required viewports, console, keyboard, overflow,
async states, focus, labels, and light/dark readability.

## TDD and acceptance

Write helper/component failures first. Existing primary, approved-DNA recovery, variant, twin,
and normal regeneration must not render batch controls. All new async states must be covered.

