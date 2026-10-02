# Section 03 — Semantic, Entity, Geo-Time Foundation

## Scope

Implement Phase B: semantic compatibility, explicit units, entity resolution, canonical geometry/time contracts, spatial operations, and GeoEvidenceFeature projections for Spec 262.

## Spec coverage

Spec 266 §§16–21, 34.2–34.12, 46.4–46.5, 46.9.

## Implementation

- Keep ambiguous entity matches unresolved and visible; pin semantic/geometry/method revisions.
- Add a bounded, strict geometry reference contract with GeoJSON structural checks, dense-array enforcement at every nesting level, closed polygon rings, CRS84 longitude/latitude range validation, source/version/precision metadata, and explicit rejection of unsupported CRS rather than silent relabeling.
- Preserve separate observed/effective/published/fetched times and gaps.
- Distinguish proximity from accessibility and model outputs from official warnings.
- Project features through Spec 262 contracts; do not create a map renderer or replace emergency authority.

The geometry parser validates serialized geometry inputs only. It does not perform CRS transformation, topology repair, persistence, or spatial analysis; those remain separate engine and storage work.

## Tests

- Unit, CRS, geometry complexity/structure, time and entity ambiguity cases.
- Projection never upgrades a model/community observation to official authority.

## Acceptance

Spec 266 §§46.4–46.5, emergency profile items 48–57.
