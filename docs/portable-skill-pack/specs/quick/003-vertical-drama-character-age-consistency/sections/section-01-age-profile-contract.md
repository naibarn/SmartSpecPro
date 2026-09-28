# Section 01: Age Profile Contract

## Goal

Create the single server-owned, role-aware apparent-age contract consumed by both
casting prompt paths.

## Implementation scope

- Add `CharacterCastingAgeProfile` type/schema with bounded `min`, `max`, `label`,
  source, confidence, and bounded rationale.
- Add pure fact normalization and precedence resolution. Use explicit story facts first,
  then approved Visual Bible/DNA, age-stage metadata, then role/occupation/relationship
  and story-context inference.
- Keep student/young-worker/older-lead examples contextual, not a universal age.
- Preserve distinct ranges for distinct characters and intended age-gap relationships.
- Support the existing age-stage lower bound, including 17–19, without adult-only
  clamping. Enforce age-appropriate, non-sexualized language for under-18 profiles.
- Return an actionable unresolved result only when there is no meaningful fact/context
  from which to derive a safe range.

## Interfaces

The resolver should accept bounded character facts already loaded under tenant/user
authorization and return either a validated profile or a typed unresolved diagnostic.
It must not query the database, read provider URLs, parse arbitrary prompt instructions,
or depend on image generation.

## Tests before implementation

- Explicit range precedence and normalization.
- Approved DNA age range precedence.
- Age-stage variant and child/teen/adult cases.
- Student 17–19, young working adult 22–25, and older lead 30–35 examples.
- Age-gap leads resolved independently.
- Invalid/inverted/unsafe/absent cases.
- No universal 24–25 fallback.

## Completion proof

Pure Vitest tests pass and the exported contract is usable by both downstream sections.

## UI/UX Contract

### Target User / JTBD
N/A — pure server/shared contract; no browser surface.

### Existing Pattern Reference
N/A — no new interaction; UI reuse is defined in section 04.

### Surface Inventory
N/A — no route or component changes.

### Component Map
N/A — resolver has no UI ownership.

### State Matrix
N/A — states are returned as typed server results and tested at the caller boundary.

### Responsive Matrix
N/A — no layout change.

### Accessibility Acceptance
N/A — no new user-facing control.

### Copy Contract
N/A — rationale is bounded data; UI copy is defined in section 04.

### Browser Evidence Required
N/A — pure contract proof uses Vitest; browser evidence is defined in section 04.

## Implemented

- Added `apps/web/shared/verticalDramaSeries/characterCastingAge.ts` and exported it from the shared barrel.
- Resolution precedence is story facts, approved DNA, age-stage, then contextual role/occupation inference; ambiguous lead roles use a broad 22–35 inferred band rather than the former universal 24±1 fallback.
- Added pure coverage for explicit precedence, 17–19 students, 22–25 early workers, 30–35 older roles, under-18 handling, and unresolved context.
