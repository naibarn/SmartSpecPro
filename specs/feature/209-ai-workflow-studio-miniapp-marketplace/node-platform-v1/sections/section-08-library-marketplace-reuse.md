# Section 08 — Library, Mini App, Marketplace, and reusable workflow contracts

## Goal

Make a published workflow reusable and runnable from Library/Marketplace while
preserving immutable versions, dependency visibility, and tenant isolation.

## Owned paths

- `apps/web/server/services/workflowStudioReuse.ts`
- `apps/web/server/services/workflowStudioMarketplace.ts`
- focused tests under `apps/web/server/services/__tests__/`.

## Behavior

1. Derive reusable input/output contracts from root graph ports and registry
   metadata. Include node/adapter/provider/permission dependency manifests.
2. Save Library entries as immutable version references with owner, access mode,
   tags, readiness, and compatible registry snapshot.
3. Permit Marketplace publication only for published versions with complete
   validation, reviewable dependencies, no secrets/private references, and
   truthful provider readiness.
4. Instantiate/copy a version into a tenant draft with new IDs where needed,
   preserving source/version/content hash metadata and requiring explicit
   rebinding of unavailable private resources.
5. Run from Marketplace against the exact published version; never run a mutable
   draft or silently upgrade an adapter.
6. Expose not-ready reasons when a skill/provider/permission/version is absent.

## Persistence

Prefer existing Feature 209 tables. Add only necessary additive fields/migration
for dependency manifest, registry snapshot, or artifact/output contract. Keep
existing records readable and add deterministic legacy projection.

## TDD-first checks

- Draft/private versions cannot be Marketplace-runnable.
- Contracts and manifests are deterministic and secret-free.
- Copy/instantiate/run preserve version/content hash and tenant boundaries.
- Changed registry/adapter/provider versions produce explicit incompatibility.
- Marketplace run enters canonical runtime rather than a special local path.

## Exit criteria

Library, Mini App, and Marketplace are meaningful reuse surfaces: users can
inspect required inputs/outputs/dependencies, instantiate, configure, and run a
published workflow with real results.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; this section exposes reusable/version/readiness data to Library and Marketplace surfaces.

### Existing Pattern Reference

Reuse existing Marketplace cards/detail/readiness patterns; direct component work is outside this section.

### Surface Inventory

N/A — service layer only.

### Component Map

N/A — later UI components consume reuse projections.

### State Matrix

Draft, published, not-ready, incompatible, private, marketplace-ready, instantiated, and run states are projected.

### Responsive Matrix

N/A — existing Marketplace/section 10 surfaces own responsive behavior.

### Accessibility Acceptance

N/A — rendered Marketplace acceptance is covered by existing patterns and section 12.

### Copy Contract

Provide localized readiness/dependency/version error keys.

### Browser Evidence Required

N/A for direct browser behavior; section 12 proves instantiate and Marketplace run.
