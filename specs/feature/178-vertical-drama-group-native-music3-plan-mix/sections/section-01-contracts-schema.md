# Section 01 — Contracts and Schema

## Goal

Create the durable identity and shared wire contract that distinguish a
publishable Production Episode from one of its Sub-Episodes. This section owns
the additive Web schema/migration and shared Zod contracts. It does not queue
paid work or change the UI.

## Ownership paths

- `apps/web/drizzle/schema.ts`
- new additive migration under `apps/web/drizzle/`
- `apps/web/shared/verticalDramaMedia/audioScoringContracts.ts`
- `apps/web/shared/verticalDramaMedia/contracts.ts`
- `apps/web/shared/verticalDramaMedia/__tests__/`
- schema/migration tests adjacent to existing Drizzle tests

## Implementation requirements

1. Add a normalized Production Episode group identity with tenant/user/series
   ownership, stable group position, ordered member snapshot, `groupRevision`,
   final-cut managed storage reference, checksum, artifact revision, content
   type, duration/probe, source-lineage hash, publication time and
   lifecycle/error projection.
2. Add group-scoped audio analysis, plan, plan-revision and durable
   `vertical_drama_production_audio_pipeline_runs` tables. Keep the existing
   episode-scoped tables and unique indexes unchanged.
3. Add the exact foreign keys/indexes/uniqueness needed for tenant isolation,
   group lookup, current revision lookup and idempotent plan identity.
4. Add a discriminated scope envelope: episode scope requires `episodeId`,
   production scope requires `productionGroupId`, `groupRevision` and ordered
   member IDs. Reject mixed IDs and unknown scope fields.
5. Extend the existing `episode_audio_analyze`, `minimax_music3_generate` and
   `episode_score_mix` job payloads with a discriminated production-group scope
   rather than creating parallel job types. Include contract version, plan
   hash/revision, source artifact checksum, rights snapshot, binding revision,
   idempotency key and artifact references.
6. Keep the existing episode union parse-compatible. Scheduler and callback
   code must consume the same union instead of duplicating a weaker schema.
7. Create the migration as additive SQL and register it in the repository's
   migration ledger. Never use `db:push` and never invent backfill checksums.
8. Add `verticalDramaGroupNativeMusic3` to the feature-flag type/allowlist with
   default false. The flag must gate group mutations/admission but not the
   explanatory readiness heading.
9. Bound transcript/edit-map/QC artifact refs and preserve typed Worker error
   codes; large payloads remain checksum-addressed artifacts.
10. Extend the shared artifact-kind contract and publication validators with
    concrete `score_mix_export` and `score_mix_qc` kinds, matching the existing
    Worker artifact types in Zod, Rust parsing, `worker_artifacts` metadata and
    browser display projections.

## TDD stubs

- Valid episode/group payloads parse and serialize without scope loss.
- Missing/mixed scope IDs, stale revision, bad hash, URL-only media and unknown
  scope fields fail validation.
- Group schema exposes ownership and required indexes.
- Migration ordering/ledger test passes and incomplete legacy manifests remain
  absent or blocked rather than fabricated.
- Idempotency fixtures change when group revision, plan hash, checksum or take
  selection changes.

## UI/UX Contract

### Target User / JTBD

The Web Production-tab producer needs a stable group identity so readiness and
blocked states describe the correct Production EP rather than a member episode.

### Surface Inventory

The contract feeds the Production tab readiness card, group card and Worker job
projection; this section does not render those surfaces.

### Component Map

Shared scope schemas feed the Web service/router and Worker parser; the UI
consumes only bounded projections.

### State Matrix

Missing group, missing artifact, stale revision and invalid scope must map to
distinct display-safe blocked/readiness states.

### Responsive Matrix

No direct layout change; section 04 verifies the six required viewports against
these display projections.

### Accessibility Acceptance

Every blocked reason exposed by the contract must be renderable as visible text,
not color or tooltip-only state.

### Copy Contract

Use `Production EP`, `ตอนย่อย`, `groupRevision` and `final cut` consistently;
never label a member scope as group-native.

### Browser Evidence Required

Section 05 must verify the empty and stale projections in the authenticated
Production route.

## Exit criteria

The Web and Worker can import one canonical group payload union; schema tests and
focused contract tests pass; no existing episode test requires changed inputs.
