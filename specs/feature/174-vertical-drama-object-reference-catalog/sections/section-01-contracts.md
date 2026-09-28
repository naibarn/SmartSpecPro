# Section 01 — Contracts

## Goal

Make `apps/web/shared/verticalDramaSeries/objectReferences.ts` the single
cross-layer contract for Feature 174. Preserve the existing exported names
where possible and add aliases only at boundaries.

## Implementation

- Add enums/schemas for object type, narrative role, continuity policy, asset
  role/state, assignment source, suggestion decision, and commercial profile.
- Add the capability keys `objectCatalog`, `objectDetection`,
  `objectImageGeneration`, and `objectLegacyBackfill`.
- Add revision/idempotency schemas and stable typed error/warning shapes.
- Normalize `history` to managed library provenance and `upload` to `uploaded`
  while retaining `originalSource`.
- Add pure helpers for aliases, fingerprints, deterministic reference ordering,
  provider cap trimming, and warning serialization.
- Keep create image-optional with `objectType=other` and `source=manual` defaults.

## Tests first

Add Vitest coverage for every normalization, fingerprint, schema boundary,
cap-trimming rule, and capability/error serialization described in the TDD plan.

## Ownership and acceptance

Only the shared contract file and its focused tests are owned by this section.
All downstream sections import these definitions rather than re-declaring
string literals.

## UI/UX Contract

### Target User / JTBD

Series creator needs understandable labels and safe states for object actions.

### Surface Inventory

Shared labels feed the catalog, shot controls, and capability notices.

### Component Map

`VerticalDramaObjectReferenceTab` and `VerticalDramaStoryboardPanel` consume
these contracts; this section owns no visual component.

### State Matrix

Loading, empty, success, warning, conflict, archived, and disabled states must
have stable typed labels and no silent operation.

### Responsive Matrix

N/A for shared code; consumers must preserve the central wide desktop and
stacked mobile layout.

### Accessibility Acceptance

Labels must be translatable, non-empty, and suitable for button/input names.

### Copy Contract

Thai-first human labels with English fallback; internal enum values stay out of
user-facing copy.

### Browser Evidence Required

Consumer browser tests must prove capability-disabled and typed-warning copy.

## Implementation Record

Implemented in `apps/web/shared/verticalDramaSeries/objectReferences.ts` with
focused Vitest coverage. Final review added canonical-first media ordering and
non-paid prompt construction.
