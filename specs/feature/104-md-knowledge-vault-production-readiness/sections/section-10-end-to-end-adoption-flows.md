# Section 10: End-to-End Adoption Flows

## Objective

Verify and document the complete adoption lifecycle from Markdown save to approved agent memory, delegated MCP resolution, observability, and operator repair.

## Scope

- E2E flow definitions
- cross-surface tests
- rollout checklist
- failure recovery
- documentation handoff
- release readiness review

## Likely Files and Modules

- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/server/services/libraryKnowledgeReadService.ts`
- `apps/web/server/services/librarySavedViewService.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/libraryCanvasService.ts`
- `apps/web/server/services/*KnowledgeRefresh*`
- `apps/web/server/routes.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/client/src/components/library/*`
- `apps/web/client/src/pages/*`
- `apps/web/shared/libraryKnowledgeRead.ts`
- `apps/web/shared/librarySavedViews.ts`
- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/shared/libraryCanvas.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/__tests__/*knowledge*`
- `apps/web/client/src/**/*.test.*`
- `docs/*knowledge-vault*`

## Implementation Guidance

### 1. Treat E2E flows as product contracts

Each flow below should become either an automated integration test, a Playwright-style UI flow where the project already supports it, or an operator checklist when automation would be too brittle.

Do not treat this section as documentation-only. It is the final proof that Features 103 and 104 behave as one coherent business-memory system.

### 2. Keep fixtures realistic

Use a small but representative vault fixture:

- one public Markdown note
- one shared Markdown note
- one private-vault Markdown note
- one deleted or archived Markdown note
- one note with YAML properties and tags
- one note with outgoing wiki links
- one note referenced through unlinked mention
- one saved view
- one view-backed context pack
- one snapshot context pack
- one delegated worker session with and without grants

Fixtures should include Thai and English titles where possible so search, alias, and citation rendering do not silently assume English-only content.

### 3. Verify user-visible evidence

Every successful E2E flow should leave visible evidence:

- UI state such as inspector freshness, pack readiness, approval badge, stale warning, or citation list
- server audit entry for review, approval, revoke, stale, delegated grant, or private-vault unlock use
- metric increment for refresh, resolve, hidden-note filtering, or release-gate probe
- runtime context artifact that includes citations and excludes forbidden notes

### 4. Keep failure paths first-class

The adoption flow is not complete unless failure states are also understandable.

At minimum, verify:

- required pack unavailable blocks runtime with a clear reason
- optional pack unavailable produces diagnostics without silently injecting partial context as trusted memory
- stale pack cannot be approved for agent use until reviewed
- delegated worker cannot enumerate packs outside explicit grants
- graph and backlinks do not reveal unreadable note titles through counts, labels, suggestions, or diagnostics
- release gate blocks rollout when freshness, citation, or leakage probes fail
- archived context pack resolves as empty/error and never serves note content
- trusted agent-approved snapshot drift demotes the pack to stale or blocks runtime
- release-gate override expires or revokes closed and does not hide failed checks
- telemetry persistence failure appears in readiness diagnostics

### 5. Produce an operator release packet

Before Feature 104 exits Draft, create or update release documentation with:

- feature flag names and default states
- rollout order by tenant or cohort
- dashboard links or metric names
- repair commands
- known failure signatures
- rollback strategy for disabling agent-facing memory while keeping human navigation available
- override request/approve/reject/revoke rules with max duration, second-approver requirement, reason, and incident link for break-glass mode
- telemetry retention/rollup policy and replay instructions
- archived-pack and snapshot-drift repair workflow
- support wording that explains navigation-first v1 and explicit context-pack attachment

## End-to-End Flows

### 1. Markdown save to knowledge refresh

- User saves Markdown note.
- Library persists version/chunk.
- Index job stores payload/source metadata.
- Knowledge refresh worker invokes single-note refresh.
- Note cache and outgoing relation rows update.
- Inspector and quick switcher read fresh state.
- Metrics record refresh latency.

### 2. Permission change to safe stale/read state

- Owner revokes share or locks private vault.
- System marks affected knowledge assumptions stale or refreshes cache.
- Backlink, graph, saved-view, and pack reads re-check current visibility.
- Hidden note does not leak.
- Observability records blocked/hidden count.

### 3. Saved view to approved context pack

- User creates saved view.
- User publishes view-backed or snapshot context pack.
- Owner submits pack for review.
- Reviewer approves trusted state.
- Reviewer approves for agent use.
- Later source mutation demotes pack to stale and clears agent approval.

### 4. Agent skill uses business memory

- Skill owner selects approved context packs.
- Preview shows tokens, citations, and diagnostics.
- Runtime request includes explicit pack refs.
- Required pack failure aborts runtime request.
- Optional pack failure becomes diagnostics.
- Agent output displays memory citations.

### 5. Delegated worker resolves pack

- Delegated worker session includes explicit `library_context_pack` grants.
- MCP lists/resolve tools are visible only when grants and flags permit.
- Resolve returns only pack-scoped readable items.
- Raw note reads remain separately gated.

### 6. Snapshot audit pack

- User freezes saved-view result as snapshot.
- Snapshot stores membership and metadata.
- Content or title drift later appears as diagnostic.
- Deleted/unreadable items are omitted safely.
- Reviewer can re-review or stale the pack.

### 7. Operator repair

- Dashboard shows low coverage or failed refresh.
- Operator runs tenant backfill or single-note repair.
- Metrics update.
- Release gate passes after coverage and leakage checks pass.

## Test-First Checklist

- Test: Markdown save triggers refresh worker and inspector sees updated relations.
- Test: share revocation prevents stale backlink leakage.
- Test: saved view publish -> review -> approve -> runtime resolve succeeds.
- Test: trusted pack mutation demotes to stale and blocks runtime.
- Test: skill runtime citations include context pack and library item refs.
- Test: delegated worker without grant cannot list/resolve packs.
- Test: snapshot pack remains stable after saved-view query changes.
- Test: operator backfill improves coverage metric.
- Test: release gate blocks rollout when leakage probe fails.

## Acceptance Checkpoints

- Product, engineering, QA, and operations can follow each critical flow without hidden assumptions.
- Feature flags, metrics, and tests support staged production rollout.
- The system behaves as a curated business-memory layer, not an uncontrolled RAG expansion.
