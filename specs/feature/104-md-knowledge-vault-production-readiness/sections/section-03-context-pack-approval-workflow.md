# Section 03: Context Pack Approval Workflow

## Objective

Turn context-pack readiness from editable fields into explicit workflow actions with auditable transitions and service-level guards.

## Scope

- submit for review
- approve as trusted
- approve for agents
- revoke agent approval
- mark stale with reason
- re-review after source mutation
- append-only review-history storage
- router and shared contracts

## Likely Files and Modules

- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/drizzle/schema.ts`
- new migration for review history unless equivalent append-only audit storage already exists
- `apps/web/server/services/libraryContextPackService.test.ts`

## Implementation Guidance

### 1. Add explicit workflow contracts

- Add shared schemas for:
  - `submitContextPackForReview`
  - `approveContextPack`
  - `approveContextPackForAgents`
  - `revokeContextPackAgentApproval`
  - `markContextPackStale`
  - `requestContextPackReReview`
- Avoid letting clients mutate lifecycle fields indirectly through generic update calls.
- Generic update may still edit title, description, policy, and membership.

### 2. Enforce transition rules in service

- `draft -> review_pending`: owner or authorized maintainer.
- `review_pending -> trusted`: authorized reviewer.
- `trusted + approvedForAgents`: only after trusted approval.
- `trusted -> stale`: automatic on structural/source mutation.
- `stale -> review_pending`: explicit re-review request.
- Any transition to `stale` clears `approvedForAgents`.
- Archive always clears `approvedForAgents`.

### 3. Persist audit history

- First-class fields already added by Feature 103/104 remain useful as fast-read summary fields:
  - `submittedForReviewAt`
  - `reviewedAt`
  - `approvedAt`
  - `reviewerUserId`
  - `lastSourceMutationAt`
  - `freshUntil`
- Production workflow also requires append-only review events, most likely `library_context_pack_review_events`:
  - actor user id
  - action
  - previous status
  - next status
  - reason
  - metadata
  - created at

### 4. Make source mutation explainable

- When saved-view definition changes, view-backed packs should become stale.
- When explicit membership changes, packs should become stale.
- When pinned/excluded items are edited, packs should become stale.
- Store stale reason in metadata or review event.

### 5. Keep permissions conservative

- Pack owner can submit.
- Tenant admin can review.
- Managing-group maintainer can review when `managingGroupId` is set.
- Users without manage permission can only read visible pack summaries.

## Test-First Checklist

- Test: draft pack can be submitted for review by owner.
- Test: non-owner cannot submit someone else's private pack.
- Test: reviewer can approve review-pending pack.
- Test: approving for agents fails unless readiness is trusted.
- Test: structural update on trusted pack demotes to stale and clears agent approval.
- Test: stale pack requires re-review before returning to trusted.
- Test: archive clears agent approval.
- Test: review event rows or audit fields are updated deterministically.

## Acceptance Checkpoints

- Approval lifecycle is explicit and auditable.
- Generic update cannot silently bypass review semantics.
- Agent runtime can trust `approvedForAgents` as an intentional reviewer-approved state.
