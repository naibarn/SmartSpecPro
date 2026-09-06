# Implementation Plan

## Objective

Implement durable twin linking, shared face/age DNA synchronization, symmetric
Characters-tab visibility, and fresh character-data hydration for episode prompt/image
generation without changing episode character selection flow.

## Work sequence

1. Add shared pure helpers for twin relation resolution, canonical DNA selection,
   shared/local DNA merge, provenance, and incompatible age-variant validation.
2. Add tenant-scoped server procedures to inspect/repair an unambiguous legacy pair
   and project symmetric relationship/effective-DNA metadata. Make repair idempotent.
3. Update character image/prompt and episode pipeline boundaries to reload current rows,
   use effective twin DNA, enforce hard face/age lock, and reject incompatible variants
   before any paid action.
4. Extend the Characters tab using existing cards/details/badges with a Twin
   Relationship section and shared-vs-local DNA explanation; keep episode UI unchanged.
5. Add focused unit, router, pipeline, and component tests; run bounded parse/tests and
   diff checks only (no provider generation).

## Affected modules

- `apps/web/shared/verticalDramaSeries/` twin relation/DNA helpers and tests
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaStoryboardGeneration.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- matching focused test files

## Data and API contract

- Keep character rows independent and preserve `characterKey`.
- Store the one-way source pointer in `sharesFaceWithCharacterId`.
- Return symmetric twin metadata (`twinCharacterId`, source name, shared DNA status,
  provenance/revision) from character list/detail projections.
- Add an idempotent repair mutation that links only the explicit legacy pair and
  materializes shared fields without media generation.
- All reads/writes remain tenant, user, and series scoped.

## Generation contract

- Reload character rows and approved assets at the generation boundary.
- Shared face/age fields are authoritative; own hair, wardrobe, personality and body
  language remain local.
- Include `face_source_reference`/twin pair facts and DNA provenance in prompt context.
- Reject missing canonical identity or incompatible age-stage selections before credit
  deduction/provider calls.

## Acceptance criteria

- Series 53 shows ภูมิ and ภาคิน as linked twins in both roster/detail views.
- Their DNA displays identical shared face/age fields and visibly separate local fields.
- Episode UI still shows two separate characters and unchanged controls.
- Prompt/image generation uses fresh rows and never independently invents the twin face.
- Infant variant 198 cannot be paired with the 9-year twin look without an explicit,
  actionable validation result.
- Repair is idempotent, tenant-scoped, credit-free, and covered by tests.

## Risks and mitigations

- Stale storyboard JSON: rehydrate at generation boundary and mark old output stale.
- DNA drift: provenance/revision plus effective resolver and synchronized snapshots.
- Ambiguous role-text inference: repair only explicit/unique pairs; otherwise surface
  review-required state.
- Existing dirty worktree: edit only listed files and preserve unrelated changes.
