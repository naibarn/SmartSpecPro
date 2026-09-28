# Section 01 — contracts and safe migration

## Objective

Create the shared contract and additive persistence foundation for Feature 165.
The section must preserve existing Worker, Remotion, Hermes, media-ingest, and
legacy Comfy payloads. No existing row is deleted or rewritten as new AI
evidence.

## Owned files

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/workerAccessKeys.ts`
- `apps/web/drizzle/schema.ts`
- the next numbered additive migration under `apps/web/drizzle/`
- focused shared/server contract tests

## Required implementation

1. Add canonical `comfy_video_generation` and `shot_video_generation` job
   types while retaining old Comfy types.
2. Define schemas for profile transport/kind, capability snapshots, workflow
   version/checksum, Series binding, canonical frame/input resolution,
   permissions, output/publication policy, revisions, execution phases, stable
   errors, and `WorkerJobSummary`.
3. Keep legacy payloads behind explicit adapters. New jobs reject browser-owned
   server fields such as tenant, owner, selected profile revision, lease,
   workflow checksum, and Library target.
4. Add `workers:jobs:read` as additive scope with no silent backfill.
5. Add nullable/defaulted Drizzle records for profiles, capabilities,
   workflows/versions, bindings, execution/publication ledger, and projection
   metadata. Use tenant/owner foreign keys and uniqueness for active defaults,
   bindings, and idempotency.
6. Use the repository's next migration number; migration is idempotent,
   additive, dry-run friendly, and non-destructive.

## TDD sequence

- Parse all four Comfy job types and reject unsafe unknown fields.
- Verify profile/permission/policy, remote consent, output target, and AI
  evidence atomic null/non-null groups.
- Verify legacy fixtures remain readable with null new provenance.
- Verify scope presets do not add `workers:jobs:read` to existing pairings.
- Verify unique constraints and tenant/owner behavior.
- Run migration twice over representative legacy settings/jobs/artifacts and
  compare counts/checksums.

## Compatibility and security

All server-owned identity and revision fields are derived server-side. Do not
serialize local absolute paths, secrets, MCP prompt/tool graphs, or provider
credentials. A missing owner/tenant is a hard authorization failure.

## UI/UX Contract

### Target User / JTBD

All later client surfaces need one stable, locale-neutral contract so an
operator sees the same job identity and safe state in every screen.

### Surface Inventory

Shared schemas are consumed by Worker screens, Web Render Jobs, admin monitoring,
and the Series shot drawer; this section owns no duplicate screen.

### Component Map

Canonical job type, profile/workflow labels, status, revision, error, and
publication fields are the shared component inputs.

### State Matrix

Unknown values fail closed; legacy values use an explicit adapter; null grouped
fields remain null together; invalid contract data is surfaced as a stable code.

### Responsive Matrix

The contract remains presentation-neutral; consumers must be able to render the
required identity/state fields in table, card, and narrow drawer layouts.

### Accessibility Acceptance

Schemas include human-readable labels/description keys where needed; consumers
must associate validation errors with their controls and not rely on color.

### Copy Contract

Canonical types and stable error keys are locale-neutral; Thai/English catalogs
translate them without changing IDs, timestamps, or evidence semantics.

### Browser Evidence Required

Contract fixtures must be exercised by the Worker and Web browser-facing tests;
this section does not claim real provider or production browser proof.

### Existing Pattern Reference

- Searched `apps/web/shared`, `apps/web/client/src`, and
  `apps/worker-app/src-tauri`; found `workerRuntime.ts` and existing Comfy
  contract tests.
- Decision: reuse those schema naming and test patterns; this section adds no
  presentation component.

### Visual Direction / Token Strategy

N/A for this contract-only section; consumers use existing semantic tokens and
shared primitives.

## Exit criteria

Shared exports compile, focused contract tests pass, migration safety is proved,
and Sections 02–09 can import stable names without duplicating schemas.
