# Section 04: Context, Validation, Alignment, and Repair

## Objective

Turn the existing story generator and Feature 132 quality system into a bounded
validation/repair loop that proves draft alignment before final persistence.

## Owned paths

- `apps/web/server/services/verticalDramaStoryGenerationContext.ts`
- `apps/web/server/services/verticalDramaStoryGenerationValidation.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRepair.ts`
- `apps/web/server/services/verticalDramaQualityLoop.ts` when the shared loop is
  introduced
- existing Feature 132 criteria/quality-loop files only at narrow integration
  seams
- focused validator, alignment, repair, and replay fixtures

## Required behavior

- Build a bounded `StoryGenerationContextPack` from immutable source snapshots;
  include only relevant prior episodes, controls, characters, locations,
  quality criteria version, skills, and rule packs.
- Run deterministic structure, identity/roster, control, continuity, budget,
  and plan-alignment rule packs before semantic review.
- Compare generated beats to the accepted plan using stable IDs, planned
  episode/key-beat scope, allowed evidence episodes, and explicit deferral.
- Reuse Feature 132 quality criteria, scene contracts, continuity ledgers,
  dramaturgy critic, and targeted revision. Capture criteria/flag snapshot in
  every report.
- Select only impacted episodes/scenes for repair. Cross-episode or structural
  findings require approval and cannot be silently repaired.
- Stop on max repair rounds, impact expansion, source drift, budget ceiling,
  criteria drift, or unresolved blocking findings with a resumable status.

## TDD and proof

Add golden fixtures for aligned output, missing key beat, identity drift,
continuity break, criteria-version mismatch, local repair, cross-episode
approval, repair impact closure, and exhausted repair budget. Test that legacy
quality-loop writes cannot bypass candidate/approval/final-gate APIs.

## UI/UX Contract

### Target User / JTBD
N/A: validation findings are data consumed by the series-detail UI.

### Existing Pattern Reference
Reuse existing Feature 132 quality finding and approval payload conventions.

### Surface Inventory
None directly; findings are exposed through the API.

### Component Map
None.

### State Matrix
N/A; section 06 maps findings to visible states.

### Responsive Matrix
N/A; no UI is changed.

### Accessibility Acceptance
N/A; findings must retain stable labels for section 06.

### Copy Contract
Use stable machine-readable reason codes; localized copy belongs to the client.

### Browser Evidence Required
None for this section; fixture and API tests are required.
