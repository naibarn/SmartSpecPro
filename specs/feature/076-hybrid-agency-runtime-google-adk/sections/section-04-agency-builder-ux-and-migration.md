# Section 04: Agency Builder UX and Migration

## Purpose

Extend the current Agency Builder UI with hybrid-runtime controls while keeping legacy agencies calm, familiar, and safe by default.

## Ownership

- engine badges
- subgraph containers
- boundary-node UX
- compile diagnostics
- upgrade-to-hybrid flow

## Target files

- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/*`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- agency-related locale/help surfaces as needed

## Implementation notes

1. Keep the current canvas and node property editing flow.

2. Add visual markers for:
   - node engine
   - subgraph membership
   - boundary nodes
   - legacy compatibility state

3. Add compile preview and diagnostics surfaces that can explain:
   - why a graph cannot run
   - why a node is emulated on Agency Swarm
   - why a loop lowers to ADK dynamic workflow

4. Hide hybrid-only controls by default for legacy agencies.

5. Require an explicit upgrade action that creates a new agency version before hybrid editing is enabled.

6. Make migration/save flows write the full Agency Document v2 snapshot for upgraded versions while keeping legacy versions restorable as-is.

## TDD expectations

- Extend `AgencyBuilder.test.tsx` first.
- Add at least one test showing that legacy agencies do not show hybrid controls until upgraded.

## Acceptance checks

- Legacy agencies keep a low-noise UI.
- Hybrid-capable agencies can see engine/subgraph diagnostics.
- Boundary requirements are visible before run time.

## Coordination notes

- Avoid introducing a second builder surface or a raw engine-centric UI vocabulary in phase 1.

## Implementation status

- Completed.
- Added legacy-safe hybrid upgrade UX in `AgencyBuilder`, compile preview/diagnostics controls, default engine + compile mode selectors, and admin feature-flag grouping coverage for hybrid runtime rollout.
- Verification:
  - `npm --prefix apps/web test -- --run client/src/components/agency/__tests__/AgencyBuilder.test.tsx client/src/components/admin/tenantFeatureFlagGroups.test.ts shared/__tests__/agencyHybridFeatureFlag.test.ts`
  - `npm --prefix apps/web run typecheck`
