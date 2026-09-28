# Section 04: UI and Verification

## Goal

Make the derived age contract visible without adding a manual age field, then verify the
full casting surface and repository boundaries.

## UI/UX Contract

### Target User / JTBD

Vertical Drama creators need to understand why all candidates share a particular age
band before choosing a primary portrait.

### Existing Pattern Reference

Reuse the existing `VerticalDramaCharacterStockPanel.tsx` casting controls, age-stage
labels, candidate cards, loading/error states, and locale copy conventions. Do not add a
new dialog or user-entered age control.

### Surface Inventory

Modify the Characters tab casting controls and candidate preview summary to render the
bounded age range/source projection returned by the router. Server modules remain owners
of resolution and validation; the client only renders the projection.

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Casting controls | `VerticalDramaCharacterStockPanel.tsx` | Read-only range/source explanation and state rendering | Router preview projection |
| Candidate preview summary | same panel | Shared-age warning and candidate state copy | Candidate batch age profile |
| Age resolver/adapter | Server modules | N/A to browser; produces bounded contract | Authorized character facts |

### State Matrix

- Resolved: show range and source explanation.
- Inferred: show that it came from role/story context.
- Loading: preserve existing disabled/progress behavior.
- Unresolved/error: show actionable missing-context copy and block generation.
- Candidate success/partial/selected: show one shared range without changing card or
  primary-selection behavior.
- Disabled/focus/hover: preserve existing accessible button states.

### Responsive Matrix

- 390x844: copy wraps above controls without horizontal scroll.
- 768x1024: range/source and count controls remain readable.
- 1440x900: explanation aligns with the existing casting panel.
- 360x800 and 1024x768: verify dense layout does not hide generate action.
- 1280x800: verify candidate grid density is unchanged.

### Accessibility Acceptance

Use semantic text/alert regions, visible focus, keyboard order, accessible range/source
labels, sufficient contrast, and reduced-motion-compatible loading behavior.

### Copy Contract

Thai primary copy explains the casting range and DNA/role source; English fallback uses
the existing locale mechanism. Include explicit unresolved-context, same-age-band, and
under-18 age-appropriate messages. Do not expose private model reasoning.

### Browser Evidence Required

If authenticated browser tooling is available, inspect resolved, unresolved, and
five-candidate states at 390x844, 768x1024, and 1440x900. Otherwise report browser and
provider proof as unperformed; unit tests remain the available evidence.

## Tests before implementation

- Read-only age range/source rendering and no age input submission.
- Resolved, inferred, loading, unresolved, candidate-success, and selected states.
- Thai/English copy and accessible labeling.
- Editing optional references cannot delete the canonical primary portrait; more than six
  existing portrait links are projected deterministically to the six-reference UI cap.

## Completion proof

Focused UI tests, `git diff --check`, affected workspace typechecks, and available
browser evidence pass. Keep unrelated baseline typecheck failures separate.

## Implemented

- Candidate batch response and durable candidate metadata carry the server-owned age profile; the Characters panel renders the shared casting band/source rationale above the candidate grid.
- The existing optional reference/lock controls remain unchanged in flow; helper text now explains that the current primary portrait is preserved and cannot be removed from the casting-reference set.
- Focused UI/service tests pass; authenticated browser/provider/production proof was not run in this workspace.
