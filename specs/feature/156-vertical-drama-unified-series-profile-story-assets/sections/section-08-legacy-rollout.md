# Section 08 — Legacy Projection and Rollout

## Objective

Ship the feature safely beside existing series, migrate only what is provable,
and provide observability, feature flags, rollback, and reconciliation.

## Target Files

- `apps/web/server/services/verticalDramaSeries/legacyProjection.ts`
- `apps/web/server/services/verticalDramaSeries/sourcePackReconciliation.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/shared/verticalDramaSeries/featureFlags.ts`
- `apps/web/server/services/verticalDramaSeries/*.test.ts`

## Tests First

1. Verify old projects open and generate with read-only legacy projections.
2. Verify new profiles never write incompatible legacy look values.
3. Verify feature-flag off behavior and rollback/re-enable behavior.
4. Test reconciliation for orphaned staged packs, failed attaches, missing
   managed media, stale analyses, and duplicate idempotency keys.
5. Test metrics/log redaction and tenant separation.

## Implementation

- Gate the new source hub/profile authority behind a narrowly scoped server and
  client flag, with old flow preserved for existing projects during rollout.
- Project legacy `seriesFormat`, `lookLock`, `visualNarrativeEnabled`, and
  `productTieIn` for display/compatibility only. Mark imported descriptions as
  unverified creative hints.
- Add reconciliation commands/jobs that are read-only by default and make only
  evidence-based, owner-scoped repairs. Never backfill blind ownership.
- Emit counters for gate blocks, analysis failures, stale digests, attachment
  retries, production-rights blocks, and unavailable managed assets, without
  raw source text or URLs.
- Document rollback: disable new writes, preserve readable rows, re-enable after
  repair; do not destructive-drop expanded tables.

## UI/UX Contract

### Target User / JTBD

Use existing series safely and understand whether the new workflow is active.

### Surface Inventory

Migration notice, compatibility badge, rollback-safe error, and reconciliation status.

### Component Map

LegacyCompatibilityNotice, ProfileProjectionBadge, RecoveryStatus.

### State Matrix

Legacy, migrated, flag-off, flag-on, needs-reconcile, and rollback-safe.

### Responsive Matrix

Notices remain inline on mobile and desktop without blocking existing content.

### Accessibility Acceptance

Status text is explicit, dismissals are labelled, and no critical warning is color-only.

### Copy Contract

Say “ข้อมูลเดิมใช้ต่อได้” and identify any newly required preparation separately.

### Browser Evidence Required

Open a legacy series with flag off and on, then verify no content loss.
