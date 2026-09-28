# Section 01 — Shared and server DNA contract

## Ownership boundaries

Own shared Character DNA schemas/helpers and the `verticalDramaCharacters`
router mutation. Do not change unrelated character CRUD behavior or UI JSX.

## Target files

- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/shared/verticalDramaSeries/characterCastingAge.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- focused shared/router tests

## Implementation requirements

- Define the bounded edit payload for `ageRange` and the eight existing
  `faceIdentity` fields.
- Define optional revision metadata on the typed visual-bible contract.
- Implement a pure merge that preserves all non-editable fields and unrelated
  JSONB keys.
- Add `updateCharacterIdentityDna` with tenant/user/series/character checks,
  valid-DNA precondition, and optimistic revision conflict handling.
- Synchronize `visualBible.ageRange` and `designDna.ageRange`.
- Ensure the canonical visual-bible age participates as the highest-priority
  explicit story fact in age resolution.

## TDD expectations

Write shared helper tests before implementation, then router tests for success,
preservation, missing DNA, conflict, and ownership boundaries. Assert no media,
prompt, or billing service is called by this mutation.

## Acceptance checks

- A valid edit returns the refreshed authorized character DTO.
- Invalid/overlong fields fail server-side.
- A stale revision cannot overwrite newer DNA.
- Existing `visualBible` metadata and `data` siblings remain unchanged.

## UI/UX Contract

### Target User / JTBD

The Character tab needs a stable server contract that lets a creator inspect
and save canonical DNA without generation side effects.

### Surface Inventory

- Character-tab DNA editor data and mutation response.
- Validation, missing-DNA, permission, and revision-conflict states.

### Component Map

- Router input schema and owner-scoped mutation.
- Shared DNA edit/merge helpers consumed by the Character-tab component.

### State Matrix

| State | Contract |
| --- | --- |
| valid | Return refreshed character DTO |
| invalid | Return field-level validation error |
| missing DNA | Return precondition error |
| stale revision | Return conflict without writing |

### Responsive Matrix

The server returns bounded text and does not impose layout assumptions; the UI
must handle narrow and wide layouts.

### Accessibility Acceptance

Validation and conflict responses must be expressible as readable localized UI
messages, not status codes alone.

### Copy Contract

Return stable error categories so the Character tab can provide Thai and
English messages for validation, missing DNA, and revision conflict.

### Browser Evidence Required

Network evidence must show that saving DNA calls only the DNA mutation and does
not call prompt, image, or billing endpoints.

## Risks

The router file is heavily modified. Apply narrow patches around the router
schema/helpers and inspect only owned hunks before testing.

## Implementation status

Implemented in `apps/web/shared/verticalDramaSeries/characterDnaEditor.ts`,
`characterProfile.ts`, and `verticalDramaCharacters.ts`. The mutation validates
the full identity subset, preserves unrelated JSONB data, synchronizes the
canonical age fields, and uses an owner-scoped revision predicate. Covered by
the shared helper tests and the router integration fixture.
