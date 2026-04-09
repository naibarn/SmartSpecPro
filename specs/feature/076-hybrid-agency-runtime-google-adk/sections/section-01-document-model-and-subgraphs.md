# Section 01: Document Model and Subgraphs

## Purpose

Create the hybrid-capable agency document contract and the additive persistence needed for subgraph-aware mixed-engine agency graphs.

## Ownership

- agency document v2
- additive schema/storage changes
- subgraph metadata
- legacy auto-wrap rules

## Target files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0136_agency_hybrid_document_foundation.sql`
- `apps/web/server/routers/agency.ts`
- `apps/web/server/services/agencyBuilderDocument.ts`
- `apps/web/server/services/agencyBuilderDocument.test.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/nodes/types.ts`
- `apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx`

## Implementation notes

1. Add hybrid-capable metadata to the agency model:
   - `documentVersion`
   - `defaultEngine`
   - `compileMode`
   - `compatibilityMode`

2. Add subgraph persistence, either as:
   - a new `agency_subgraphs` table
   - or an equivalent additive storage contract that is versioned and testable
   - implemented as `agency_subgraphs` with a generated row `id` plus stable `subgraphKey` per agency

3. Extend agency nodes with hybrid metadata:
   - `subgraphId`
   - `engineHint`
   - runtime config fields needed by the compiler
   - implemented additively on `agency_agents`

4. Keep legacy agencies valid without migration:
   - auto-wrap all existing nodes into `sg_root_legacy`
   - default engine remains `agency_swarm`

5. Upgrade `agency_versions.snapshotJson` so hybrid-capable versions persist the full assembled Agency Document v2:
   - `documentVersion`
   - `defaultEngine`
   - `nodes`
   - `edges`
   - `subgraphs`
   - `settings`
   - legacy snapshots remain supported and normalize into a synthetic root subgraph at load/restore time

6. Keep structural semantics aligned with the current agency schema:
   - `subgraph` is container metadata, not a phase-1 persisted node row
   - `isEntryPoint` remains the persisted entry semantic
   - `start` and `end` stay synthetic compile/preview markers
   - `engine_boundary` is the only new structural node that must persist explicitly in phase 1

## TDD expectations

- Add schema/router tests first for hybrid metadata acceptance and legacy auto-wrap behavior.
- Make sure a legacy agency still round-trips through save/load without hybrid fields.
- Added helper tests for document normalization plus router tests for legacy auto-wrap and hybrid snapshot persistence.
- Added AgencyBuilder smoke coverage to keep hybrid metadata pass-through changes from breaking existing editor rendering.

## Acceptance checks

- Hybrid metadata can be stored without breaking old agencies.
- A single current agency can load as one implicit root subgraph.
- Agency version history remains usable after the schema uplift and supports full-document restore/diff for hybrid versions.

## Coordination notes

- Do not replace current normalized agency persistence with one giant JSON blob in phase 1.

## Implementation status

- Completed.
- Added Agency Document v2 helpers, legacy auto-wrap normalization, additive hybrid schema/migration, hybrid-aware save/load/restore wiring, and builder pass-through support for persisted hybrid metadata.
- Verification:
  - `npm --prefix apps/web test -- --run drizzle/schema.test.ts server/services/agencyBuilderDocument.test.ts server/routers/__tests__/agency.test.ts client/src/components/agency/__tests__/AgencyBuilder.test.tsx`
  - `npm --prefix apps/web run typecheck`
