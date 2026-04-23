# Section 08: End-to-End Sequence Flows

## Objective

Define the operational and end-to-end sequences that tie the earlier sections together, so rollout, backfill, runtime handoff, and failure behavior are unambiguous.

## Scope

- save-to-refresh lifecycle
- quick-switcher and inspector read flows
- saved-view publish to context-pack flow
- context-pack resolve to runtime handoff
- delegated-worker resolve
- permission-change and private-vault state transitions
- rollout gates and observability

## Implementation Guidance

### 1. Markdown save to knowledge-read readiness

- User saves Markdown note.
- Existing Library versioning persists the content.
- Knowledge refresh job or transaction recalculates extracted properties and edges.
- Cache freshness status becomes readable to inspector, views, and pack resolution.

### 2. Quick-switcher / inspector read

- User opens quick switcher or note inspector.
- Router resolves actor and private-vault state.
- Read-side service returns only visible notes plus diagnostics for unresolved/ambiguous references.
- UI shows intentional empty/disabled states when the current surface is unsupported.

### 3. Publish saved view to context pack

- User selects a saved view and publishes it as a pack.
- Publication stores pack metadata, policy, and any pinned/excluded membership.
- If the pack is marked agent-ready, approval/readiness checks still apply before runtime use.
- Any later change to the saved-view query definition or the readable membership it produces must stamp `lastSourceMutationAt`, transition trusted packs to `stale`, and clear `approvedForAgents`.

### 4. Resolve pack to runtime

- Caller supplies an explicit Library pack ref.
- Service resolves visible notes, applies policy and budget, and returns citation-backed items.
- Runtime adapter converts resolved items into shared context slots.
- Required failures stop the request; optional failures return diagnostics.

### 5. Delegated worker resolve

- Worker presents a delegated session with explicit grants.
- MCP layer checks pack grant before resolution.
- Resolved output contains only what the worker may see through that pack; raw-note reads remain separately gated.

### 6. Permission and vault-state changes

- Share changes, permission revocation, delete/restore, or private-vault lock changes must invalidate stale assumptions immediately.
- Read paths always re-check current visibility, even if cache/backfill state is older.

## Rollout and Observability

- Track:
  - cache freshness
  - backfill coverage
  - quick-switcher latency
  - graph node counts
  - context-pack resolution latency
  - citation coverage
  - hidden-note leakage
- Use feature flags to gate graph-heavy and agent-facing rollouts until metrics are stable.
- Keep repair/rebuild commands available during the rollout period.
- Numeric gates:
  - save-to-read freshness p95 <= 5 seconds
  - quick-switcher p95 <= 250 ms for first 20 results up to 10k visible notes
  - local graph default cap 75 nodes, p95 <= 400 ms
  - global graph hard cap 250 nodes while flagged
  - context-pack resolution p95 <= 1200 ms for 25 resolved notes or 20k estimated tokens
  - citation coverage 100%
  - hidden-note leakage 0
  - readable-Markdown backfill coverage >= 99% before graph becomes default

## Test-First Checklist

- Test: save-to-refresh flow reaches readable state under accepted freshness limits
- Test: quick-switcher and inspector reads remain permission-safe during stale or backfill states
- Test: published saved view resolves into stable pack output across rename/share/title changes
- Test: delegated-worker resolve remains least-privilege
- Test: current Library search and browsing behavior remain backward compatible when this feature is disabled or unused

## Acceptance Checkpoints

- Teams can reason about each major end-to-end flow without reconstructing hidden assumptions.
- Rollout gates are measurable and tied to actual product safety requirements.
- The section set is ready for `/deep-implement` to pick up without additional planning work.

## Implementation Notes

- Covered the Markdown-save-to-read path with refresh hooks, extraction helpers, schema tests, and knowledge read services.
- Covered tenant Markdown enrollment and single-note repair with concrete backfill/refresh executors plus deployment migration.
- Covered operator-triggered rebuild/repair through `backfill:library-knowledge`.
- Covered quick-switcher and inspector backend flows through permission-safe read contracts and tests.
- Covered saved-view-to-context-pack flow through durable saved views, publish service logic, and view-backed pack resolution.
- Covered pack-to-runtime flow through explicit runtime pack refs and context-state injection in `apps/web/server/services/contextPackBuilder.ts`.
- Covered delegated-worker pack resolve through `library_context_pack` grants and dedicated MCP list/resolve tools.
- Covered canvas persistence as a backend flow without allowing canvas edges to mutate backlink or retrieval semantics.
- Focused verification passed for the new backend slices; broader Library share/security tests still have unrelated existing mock-contract failures that should be handled separately.
- Remaining rollout work is mostly productization: UI panels, queue worker wiring that persists index-job payload metadata for automatic refresh execution, observability dashboards, private-vault unlock propagation for runtime callers, and operator repair/rebuild UI controls.
