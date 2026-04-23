# Section 05: Agent Skill Context Packs and Business Memory

## Objective

Finish the product path that turns curated note sets into approved, explainable business memory for downstream analysis and agent skills.

## Scope

- context-pack CRUD
- publishing from saved views
- manual, snapshot, and view-backed pack modes
- memory-readiness and approval semantics
- resolve behavior with citations and diagnostics

## Likely Files and Modules

- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/client/src/components/library/ContextPackManager.tsx`
- `apps/web/client/src/components/library/PublishContextPackDialog.tsx`

## Implementation Guidance

### 1. Finish the scaffold instead of replacing it

- Reuse the shared Zod contracts already present in `libraryContextPacks.ts`.
- Reuse the existing `library_context_packs` and `library_context_pack_members` tables.
- Implement service logic behind the scaffolded router methods instead of inventing a second pack system.

### 2. Support three pack source modes

- `manual`: owner curates exact notes
- `view_backed`: membership is derived from a saved view at resolve time
- `snapshot`: membership freezes at publication time

### 3. Make business-memory readiness explicit

- Pack status, readiness status, and `approvedForAgents` are separate concerns.
- A pack may exist for human workflows before it is safe for agents.
- Resolve output should include:
  - note ids
  - titles
  - logical paths
  - runtime tier
  - freshness
  - included reason
  - citations
  - diagnostics
- Readiness lifecycle:
  - `draft`: owner-editable, not agent-eligible
  - `review_pending`: submitted for approval by `ownerUserId` or `managingGroupId` maintainer
  - `trusted`: approved by an authorized reviewer and eligible for `approvedForAgents = true`
  - `stale`: auto-entered whenever source-view logic, source-note membership, note visibility, or freshness windows change
- Required audit fields:
  - `submittedForReviewAt`
  - `reviewedAt`
  - `approvedAt`
  - `reviewerUserId`
  - `lastSourceMutationAt`
  - `freshUntil`
- Transition rule: any move into `stale` must automatically clear `approvedForAgents` and require a new `review_pending` submission before returning to `trusted`.

### 4. Keep relation expansion conservative

- Default `relationExpansionPolicy` stays `none`.
- Do not auto-add backlinks or graph neighbors to pack resolution in v1.
- If future gated expansion is explored, it should be explicit and separately evaluated.

## Test-First Checklist

- Test: create/update/archive flows enforce shared contracts and tenancy
- Test: publish saved view to pack preserves pinned/excluded membership rules
- Test: pack resolution returns `complete | partial | empty`
- Test: unreadable, stale, deleted, or over-budget notes appear as diagnostics
- Test: approved-for-agents gates default business-memory eligibility
- Test: readiness lifecycle transitions and automatic stale demotion clear agent approval deterministically

## Acceptance Checkpoints

- Teams can publish reusable business-memory packs without weakening ACLs.
- Packs remain explainable and auditable enough for analysis workflows.
- The pack system is usable for SOP, policy, and handoff knowledge curation.

## Implementation Notes

- Implemented context-pack CRUD, archive, saved-view publication, and resolution in `apps/web/server/services/libraryContextPackService.ts`.
- Kept the existing shared context-pack contract as the boundary in `apps/web/shared/libraryContextPacks.ts`; no parallel pack model was introduced.
- Supported manual and view-backed pack resolution for the backend slice; snapshot mode remains represented in contracts but needs a dedicated membership-freeze flow before UI rollout.
- Enforced agent-readiness semantics so `approvedForAgents` requires `readinessStatus = trusted`, and trusted packs are demoted to `stale` with agent approval cleared after structural or membership mutations.
- Promoted review/audit lifecycle fields into first-class schema and shared detail contracts: `submittedForReviewAt`, `reviewedAt`, `approvedAt`, `reviewerUserId`, `lastSourceMutationAt`, and `freshUntil`.
- Resolution returns citation-capable items plus `complete | partial | empty` diagnostics while preserving Library ACL checks at read time.
- Added focused tests in `apps/web/server/services/libraryContextPackService.test.ts` for approval gating, stale demotion, view-backed publishing, and resolution behavior.
- Dedicated context-pack management UI remains a follow-up slice after backend contracts stabilize.
