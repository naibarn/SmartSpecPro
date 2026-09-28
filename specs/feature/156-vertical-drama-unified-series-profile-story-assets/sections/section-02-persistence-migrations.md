# Section 02 — Persistence and Migrations

## Objective

Persist staged and series-bound Story Source Packs as normalized, owner/tenant
scoped aggregates with assets, slots, analyses, claims, rights, readiness,
versions, idempotency keys, and redacted audit events.

## Target Files

- `apps/web/server/db/schema/`
- `apps/web/drizzle/`
- `apps/web/server/services/verticalDramaSeries/sourcePackRepository.ts`
- `apps/web/server/services/verticalDramaSeries/sourcePackTypes.ts`
- `apps/web/server/services/verticalDramaSeries/*.test.ts`

## Tests First

1. Schema tests cover nullable staged/series ownership, foreign keys, indexes,
   profile/version fields, lifecycle states, and soft deletion.
2. Repository tests cover one active staged pack, optimistic concurrency,
   attach-once, retry idempotency, tenant crossover rejection, and rollback.
3. Migration tests cover expand/read compatibility, legacy projection, rollback,
   and preservation of existing series.

## Implementation

- Add source-pack, source-asset, source-slot, source-analysis, source-claim,
  source-rights, source-session, and audit tables using existing Drizzle naming
  and migration conventions.
- Enforce one active pack per staged session and one attach operation per pack
  transactionally. Use version columns and idempotency keys for mutations.
- Store managed media IDs and provenance separately; provider URLs are not
  availability proof. Keep staged ownership nullable only until a successful
  attach, then make the ownership transition atomic.
- Add lifecycle `draft_ready` and `production_ready` rather than one overloaded
  ready state. Keep rights pending visible and block production render.
- Migration reads legacy `productTieIn`/look fields as unverified creative hints
  and never silently upgrades them to verified facts.

## Acceptance

- No provider call, upload, credit charge, or media side effect occurs inside
  the atomic series-shell/pack attach transaction.
- Every row is tenant/owner scoped and has an explicit deletion or retention rule.
- Existing projects can still be opened before backfill and after rollback.

## UI/UX Contract

### Target User / JTBD

See whether source data is saved, attached, stale, or awaiting rights.

### Surface Inventory

Save indicator, version-conflict notice, attachment status, and audit summary.

### Component Map

SaveStatus, ConflictBanner, AttachmentStatus.

### State Matrix

Saving, saved, conflict, retrying, blocked, and unavailable.

### Responsive Matrix

Status remains readable beside the primary action on mobile and desktop.

### Accessibility Acceptance

Announce save/conflict changes and provide a non-color status label.

### Copy Contract

Use plain language: saved draft sources are not automatically production-cleared.

### Browser Evidence Required

Show staged save and retry after a simulated conflict.
