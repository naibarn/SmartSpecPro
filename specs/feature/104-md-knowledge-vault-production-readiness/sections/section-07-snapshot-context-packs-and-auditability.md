# Section 07: Snapshot Context Packs and Auditability

## Objective

Implement snapshot context-pack mode so teams can freeze a curated set of notes for audit, SOP, handoff, and review workflows while still enforcing current ACL at resolve time.

## Scope

- publish saved view as snapshot
- freeze manual/view-backed membership
- snapshot item metadata
- resolve snapshot with current ACL
- stale and drift diagnostics
- review/audit integration

## Likely Files and Modules

- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/components/library/ContextPackManager.tsx`
- `apps/web/client/src/components/library/PublishContextPackDialog.tsx`

## Implementation Guidance

### 1. Define snapshot semantics

- Snapshot freezes membership at publication time.
- Snapshot does not freeze permissions.
- Resolve still re-checks current actor ACL.
- Snapshot diagnostics should report:
  - item deleted
  - item unreadable
  - content changed since snapshot
  - title/path changed since snapshot
  - item missing markdown content

### 2. Store snapshot metadata

- Store per-member `snapshotMetadata`:
  - title
  - logical path
  - content fingerprint
  - source updated at
  - captured at
  - captured by user id
  - saved view id and query hash when published from view
- Avoid storing full Markdown content unless product explicitly needs immutable content capture.

### 3. Add publish flows

- Publish current saved-view result as snapshot.
- Convert manual pack to snapshot.
- Duplicate view-backed pack into snapshot.
- Preserve pinned/excluded ordering.

### 4. Resolve snapshot packs

- Use snapshot membership order.
- Re-check Library item visibility.
- Compare current fingerprint/title/logical path to snapshot metadata.
- Include drift diagnostics while still returning readable current content.

### 5. Integrate review workflow

- Snapshot creation should set readiness to draft or review-pending.
- Snapshot drift should demote trusted packs to stale only when policy requires it.
- Approval UI should show captured state and drift state separately.

## Test-First Checklist

- Test: publishing saved view as snapshot freezes current result ids.
- Test: later saved-view query changes do not change snapshot membership.
- Test: deleted snapshot item appears as diagnostic.
- Test: unreadable snapshot item is omitted and diagnosed safely.
- Test: changed content fingerprint produces drift diagnostic.
- Test: snapshot resolve still returns current citations for readable items.
- Test: snapshot pack approval lifecycle works with review workflow.

## Acceptance Checkpoints

- Teams can create stable audit packs.
- Snapshot packs remain permission-safe.
- Drift is visible and explainable.
