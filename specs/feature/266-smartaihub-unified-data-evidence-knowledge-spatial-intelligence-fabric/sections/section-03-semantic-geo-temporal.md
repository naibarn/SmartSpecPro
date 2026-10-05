# Section 03 — Semantic, Entity, Geo-Time Foundation

## Scope

Implement Phase B: semantic compatibility, explicit units, entity resolution, canonical geometry/time contracts, spatial operations, and GeoEvidenceFeature projections for Spec 262.

## Spec coverage

Spec 266 §§16–21, 34.2–34.12, 46.4–46.5, 46.9.

## Implementation

- Extend `semantic.ts`, `geometry.ts`, and `spatialOps.ts` as bounded contract/evaluation modules. Pin semantic, unit, method, and geometry revisions; never resolve ambiguous entity matches silently.
- Geometry parsing validates serialized input only: dense bounded arrays, supported GeoJSON types, polygon closure, coordinate bounds, explicit CRS84, source/version/precision metadata. Reject unsupported CRS; do not silently relabel, transform, repair topology, persist, or run unbounded spatial analysis.
- Keep observed, effective, published, and fetched instants separate; reject invalid ranges and retain explicit data gaps.
- Keep proximity distinct from accessibility and observations distinct from official warnings.
- Project through existing Spec 262 contracts and renderer; preserve source/authority/confidence and avoid a second map UI.

## Tests

- Extend `semantic.test.ts`, `geometry.test.ts`, and `spatialOps.test.ts` for unit/method drift, ambiguity, nested sparse arrays, structure/complexity/CRS/range/time cases, and projection authority preservation.

## Acceptance

Spec 266 §§46.4–46.5, emergency profile items 48–57.
## UI/UX Contract

### Target User / JTBD
- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.

### Existing Pattern Reference
- N/A: no user-facing surface is added by this section.

### Surface Inventory
- N/A: no route/page/dialog/form/table is added.

### Component Map
- N/A: no client component is added.

### State Matrix
- N/A: no browser state is added.

### Responsive Matrix
- N/A: no browser layout is added.

### Accessibility Acceptance
- N/A: no user-facing control is added.

### Copy Contract
- N/A: no user-facing copy is added.

### Browser Evidence Required
- N/A: no browser-visible changes are planned in this section.

## Implementation evidence (2026-10-05)

- Semantic compatibility now pins methodology revision as well as semantic/unit/aggregation versions; entity resolution rejects unsupported methods and reports conflicting authoritative matches.
- Temporal gap analysis rejects duplicate/non-increasing and sparse series while retaining valid irregular observations. It reports only whole absent cadence intervals and never invents interpolated values.
- GeoEvidence projections validate enum/range/reference fields and defensively copy nested input metadata. Spatial operations re-parse the complete GeometryContract at the operation boundary.
- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/semantic.test.ts server/services/intelligenceFabric/geometry.test.ts server/services/intelligenceFabric/spatialOps.test.ts` — 3 files, 20 tests passed after review correction. `git diff --check` and retired-system scan passed for section paths.
- External gate: canonical semantic/geometry version persistence and Spec 262 live projection remain unverified; no schema/migration or renderer authority changed.
