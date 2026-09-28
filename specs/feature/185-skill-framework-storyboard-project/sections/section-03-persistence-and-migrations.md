# Section 03 — Persistence and migrations

## Goal

Add durable project/run/shot and reusable character-library storage without changing existing Drama tables or deleting user data.

## Files and ownership

- Modify `apps/web/drizzle/schema.ts` with additive exports.
- Add the next available numbered migration after the current worktree migration journal, not a guessed number; include journal registration only if repository convention requires it.
- Add schema/migration static tests and repositories in `apps/web/server/services/`.

## Tables

Create project, run, shot, character, immutable revision, look, library asset, alias, project-character binding, and interop/sync records. Project/run/shot rows carry owner scope and timestamps. Run stores normalized brief, skill/version/schema snapshot, model/options/reference snapshots, fingerprint/idempotency, lifecycle/error metadata. Shot stores exact number, beat, skill input, full response, canonical prompt, complete original/effective generation request, image/video metadata, attempts, and stage status.

Character revisions are immutable and uniquely numbered per character. Assets reference existing `media_assets` without binary duplication. Project bindings snapshot character name/role/look/revision and never mutate the source library record. Archive is reversible.

## Constraints

Use foreign keys, owner indexes, exact shot uniqueness `(run_id, shot_number)`, run idempotency uniqueness, revision uniqueness, and binding uniqueness. Migration is additive and idempotent according to the local Drizzle convention. No Drama backfill in v1 and no destructive SQL.

## Tests

Inspect SQL and schema metadata for all required tables/columns, owner indexes, foreign keys, idempotency keys, immutable-revision boundary, journal consistency, and absence of destructive statements. Run migration-check/static tests without contacting paid providers.

## UI/UX Contract

### Target User / JTBD
Creator sees durable project and character state after refresh or failure.

### Surface Inventory
Project tabs, run status, shot cards, revisions, looks, and source/conflict indicators.

### Component Map
Repositories expose owner-scoped snapshots; UI never infers state from transient provider responses.

### State Matrix
Persist draft, queued, running, partial, failed, archived, source-unavailable, and conflict states.

### Responsive Matrix
Persisted labels and status metadata remain available on mobile and desktop.

### Accessibility Acceptance
Stored status/error codes map to readable localized messages.

### Copy Contract
Persistence errors use stable localized codes, not raw SQL/provider text.

### Browser Evidence Required
Refresh during draft/run and verify the same project and character data returns.
