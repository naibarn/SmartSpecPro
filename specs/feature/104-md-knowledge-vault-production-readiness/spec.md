# Feature 104 - Markdown Knowledge Vault Production Readiness and Agent Memory

Version: 1.1
Date: 2026-04-21
Status: Draft
Depends-on: 103-obsidian-inspired-md-knowledge-vault
Audience: Product, Document Management UI, Library/RAG, Agent Runtime, MCP, Security, Data, QA, Operations

---

## 1. Executive Summary

Feature 103 established the Markdown Knowledge Vault foundation:

- Markdown extraction and relationship parsing
- knowledge note and relation cache schema
- saved views
- context packs
- runtime context-pack injection
- delegated worker context-pack grants
- canvas backend persistence
- forward-only migration
- tenant and single-note backfill executors
- operator CLI for backfill and repair

Feature 104 turns that foundation into a production-ready business-memory system that humans can curate and agents can safely consume.

The goal is to complete the full lifecycle:

1. Markdown notes are saved or changed.
2. Knowledge caches refresh automatically and measurably.
3. Users navigate the vault through quick switch, inspector, views, graph, and canvas.
4. Users curate trusted context packs from saved views or snapshots.
5. Reviewers approve packs for agent use with auditable lifecycle actions.
6. Agent skills explicitly select approved packs.
7. Runtime injects only selected pack content with citations.
8. MCP/delegated workers receive least-privilege pack access.
9. Observability proves freshness, citation coverage, latency, and zero hidden-note leakage.
10. Rollout controls keep graph-heavy and agent-facing behavior disabled until release gates pass.

This feature intentionally keeps v1 navigation-first. It does not automatically inject backlinks, graph neighbors, or unlinked mentions into agent context.

Feature 104 also does not include graph-driven or backlink-driven runtime expansion experiments. Any future behavior that widens agent context from relationship neighborhoods requires a separate feature spec, separate flags, and separate evaluation gates.

---

## 2. Current State From Feature 103

Feature 103 delivered the core backend slice and planning scaffold:

- `apps/web/drizzle/0157_library_md_knowledge_vault.sql`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/server/services/libraryKnowledgeReadService.ts`
- `apps/web/server/services/librarySavedViewService.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/libraryCanvasService.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/shared/libraryKnowledgeRead.ts`
- `apps/web/shared/librarySavedViews.ts`
- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/shared/libraryCanvas.ts`
- `apps/web/shared/workerDelegation.ts`

Feature 103 deliberately left several production-readiness slices as follow-up work:

- queue worker wiring for automatic knowledge refresh
- DB integration tests and migration idempotency checks
- UI panels for quick switch, inspector, saved views, context packs, and canvas
- explicit agent skill configuration for business-memory packs
- dedicated context-pack approval workflow actions
- observability and release gates
- snapshot context-pack mode
- feature flags and rollout controls
- graph/canvas productization

Feature 104 covers those follow-up slices.

---

## 3. Problem Statement

The vault now has enough backend primitives to represent Markdown knowledge, but it is not yet a complete operational product.

Without Feature 104:

- backfill can be run manually, but save/share/restore changes do not yet trigger a safe end-to-end refresh worker
- migrations exist, but DB integration coverage does not yet prove idempotent rollout
- context packs can be created and resolved, but approval is not a first-class human workflow
- agent skills can receive context-pack refs, but users cannot select or preview them from skill configuration
- users cannot yet navigate the vault through the intended UI surfaces
- operators cannot see coverage, stale state, leakage risk, or citation gaps
- snapshot mode exists in contracts, but not as a stable audit workflow
- release gates are documented, but not enforced through flags and dashboards

The result is a strong foundation that still depends on developer knowledge to operate safely.

Feature 104 should make the system understandable, measurable, and safe for product rollout.

---

## 4. Goals

### 4.1 Product Goals

- Make Markdown vault navigation usable by humans, not only by backend tests.
- Let users curate business-memory packs from saved views and snapshots.
- Let agent skill owners explicitly attach trusted context packs.
- Let reviewers approve, revoke, stale, and re-review packs through explicit workflow actions.
- Let operators measure readiness before enabling graph-heavy or agent-facing features.
- Keep core vault navigation keyboard-friendly, accessible, and safe for Thai/English metadata, aliases, and citations.
- Preserve existing Library browsing, search, upload, sharing, versioning, and RAG behavior.

### 4.2 Safety Goals

- Keep all derived reads permission-safe at read time.
- Keep private-vault content locked unless an approved caller provides explicit unlock state.
- Keep delegated workers least-privilege through explicit pack grants.
- Keep runtime context injection explicit and citation-backed.
- Prevent hidden-note leakage across backlinks, graph, saved views, context packs, and MCP.
- Preserve navigation-first v1 semantics: no automatic graph/backlink expansion into runtime context.

### 4.3 Operational Goals

- Provide idempotent migration rollout.
- Provide DB integration tests for core flows.
- Provide automatic refresh from Library index jobs without breaking vector indexing.
- Provide operator dashboards and CLI/UI repair paths.
- Provide measurable release gates for freshness, latency, coverage, and leakage.
- Provide machine-readable release-gate, diagnostics, and rollback behavior so rollout can be automated and audited.

---

## 5. Non-Goals

- Do not replace the current Library storage model.
- Do not make graph expansion a default runtime retrieval behavior.
- Do not auto-inject backlinks, unlinked mentions, or graph neighbors into agent prompts.
- Do not expose raw-note read access through context-pack MCP tools.
- Do not build Obsidian plugin compatibility.
- Do not introduce real-time collaborative editing.
- Do not build a full formula engine for saved views.
- Do not make context packs bypass existing ACL, private-vault, tenant, or group checks.
- Do not ship graph-driven, backlink-driven, or search-driven runtime memory expansion in Feature 104.
- Do not auto-select context packs at runtime from user prompts, search results, or graph proximity.

---

## 6. Scope

Feature 104 includes ten implementation areas:

1. Index job payload persistence and knowledge refresh worker
2. Migration integration tests and DB safety checks
3. Context-pack approval workflow
4. Agent skill memory picker and citation preview
5. Knowledge Vault UI navigation and curation surfaces
6. Observability, release gates, and leakage safety
7. Snapshot context packs and auditability
8. Feature flags, rollout controls, and access policy
9. Canvas, graph, and spatial knowledge productization
10. End-to-end adoption flows and release checklist

---

## 7. Recommendation Coverage Matrix

| Recommendation | Covered By |
|---|---|
| Queue worker wiring and index job payload persistence | Section 01 |
| DB integration tests for migration/backfill/ACL leakage | Section 02 |
| Context-pack approval workflow endpoints/actions | Section 03 |
| Agent skill context-pack picker and citation preview | Section 04 |
| Quick switcher, inspector, saved views, context-pack UI | Section 05 |
| Observability dashboard and release gates | Section 06 |
| Snapshot context-pack mode | Section 07 |
| Feature flags and rollout controls | Section 08 |
| Canvas UI and graph-heavy surfaces | Section 09 |
| Full save-to-agent business-memory lifecycle | Section 10 |

---

## 8. Core Product Principles

### 8.1 Markdown Remains The Source Of Truth

Knowledge cache rows, graph edges, saved-view results, and context-pack resolution outputs are rebuildable derivatives.

### 8.2 Human Curation Comes Before Agent Use

Agents should not silently discover broad vault context. Feature 104 supports explicit human selection of context packs only. Any future product-owned policy attachment requires a separate spec and evaluation path.

### 8.3 Approval Is Separate From Existence

A context pack can exist for human curation while remaining ineligible for agent runtime.

### 8.4 Runtime Context Must Be Explainable

Every pack item injected into runtime context needs citations and source references.

### 8.5 Permission Checks Happen At Read Time

Caches may accelerate reads, but they must not become authorization sources.

### 8.6 Navigation-First V1

Backlinks, graph, canvas, and unlinked mentions are navigation and curation surfaces in v1. They are not automatic prompt-expansion sources.

### 8.7 No Silent Memory Broadening

Runtime memory may only come from explicitly attached context packs that are readable, trusted, approved for agent use, and allowed by current flags. Search hits, related-note panels, backlinks, graph neighbors, and canvas edges must never silently widen runtime context.

---

## 9. Functional Requirements

### 9.1 Knowledge Refresh

- Persist enough index job payload metadata to identify knowledge-refresh work.
- Run knowledge refresh after the relevant Library content or permission mutation.
- Keep vector indexing and knowledge refresh independently retryable.
- Keep knowledge-refresh status and diagnostics observable independently of vector-index status.
- Mark cache rows stale when source content, metadata, permission, share, delete, restore, or private-vault state changes.
- Provide tenant rebuild and single-note repair paths.

### 9.2 UI Navigation

- Quick switch by title, alias, logical path, and recents.
- Quick switch and inspector must be keyboard-first and accessible without revealing hidden titles in labels, tooltips, or assistive text.
- Inspector shows properties, aliases, tags, outgoing links, backlinks, unlinked mentions, local graph, freshness, and diagnostics.
- Saved-view UI persists filters, columns, sorting, grouping, and publish-to-pack actions.
- Context-pack manager shows readiness, approval, citations, diagnostics, stale state, and runtime eligibility.
- Canvas UI persists board nodes and edges without changing retrieval semantics.
- Core vault UI must remain usable on desktop and tablet/mobile layouts supported by the existing Document Management surface.
- Thai and English titles, aliases, logical paths, and citations must render and rank without assuming English-only note metadata.

### 9.3 Context Pack Workflow

- Users can create draft packs.
- Users can submit packs for review.
- Authorized reviewers can approve trusted packs.
- Trusted packs can be explicitly approved for agent use.
- Structural changes or source mutations demote trusted packs to stale and clear agent approval.
- Review history is auditable.
- Snapshot packs freeze membership while still re-checking current ACL at resolve time.
- Generic update endpoints must not mutate approval, review, or agent-eligibility fields indirectly.

### 9.4 Agent Skill Integration

- Skill configuration can reference approved Library context packs.
- Skill configuration must preserve explicit pack order plus required/optional semantics.
- Skill runtime preview shows pack title, runtime tier, estimated tokens, citations, stale warnings, and diagnostics.
- Runtime request builder passes explicit pack refs into `build_context_pack`.
- Required pack failures abort runtime creation.
- Optional pack failures become diagnostics.
- Delegated workers receive explicit `library_context_pack` grants.
- Agent traces, artifacts, or output metadata should preserve used-memory citations when the runtime surface supports source display.
- Runtime must not auto-add packs from search hits, graph neighbors, or related-note UI state.

### 9.5 Observability

- Track cache coverage, refresh latency, stale ratio, quick-switch latency, graph latency, context-pack resolution latency, citation coverage, and hidden-note leakage.
- Provide dashboards for tenant and system operators.
- Enforce release gates before enabling graph-heavy or agent-facing surfaces.
- Expose machine-readable gate results and diagnostics so flags, admin UI, and tests evaluate the same rollout state.

---

## 10. Data And Contract Requirements

### 10.1 Minimum Persistence Requirements

Feature 104 requires queryable persistence for the following behaviors. Exact table or column names may vary if equivalent existing storage already exists, but the behavior and auditability are mandatory:

- knowledge-refresh payload metadata plus per-side-effect status for Library index jobs
- context-pack lifecycle fields for draft, review, trusted, stale, archived, and approved-for-agent-use states
- stable context-pack member ordering plus per-member snapshot metadata
- append-only context-pack review and approval history
- delegated worker grants for `library_context_pack` access

The most likely persistence surfaces are:

- `library_index_jobs`
- `library_knowledge_notes`
- `library_knowledge_relations`
- `library_knowledge_backfill_runs`
- `library_saved_views`
- `library_context_packs`
- `library_context_pack_members`
- `library_context_pack_review_events`
- delegated worker grant storage

Observability metrics may use the existing monitoring platform instead of database tables, but release-gate inputs must remain queryable and reproducible.

### 10.2 Migration Rules

All migrations must be forward-only.

Migration rollout must preserve these behaviors:

- legacy callers that do not send new payload metadata continue to work
- rerunning schema smoke in CI does not produce partial duplicate state
- tenant backfill and single-item repair remain resumable
- review and approval history cannot be lost when new lifecycle fields are added

If a migration cannot be safely rerun verbatim, CI must still prove that an already-applied environment fails cleanly and does not corrupt state.

### 10.3 Shared Contracts

- `apps/web/shared/libraryKnowledgeRead.ts`
- `apps/web/shared/librarySavedViews.ts`
- `apps/web/shared/libraryContextPacks.ts`
- `apps/web/shared/libraryCanvas.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/shared/contextEngine.ts`

Router inputs should validate shared schemas rather than duplicating inline shapes.

Shared schemas must canonically define:

- context-pack readiness states: `draft`, `review_pending`, `trusted`, `stale`, `archived`
- release-gate result states: `pass`, `blocked`, `insufficient_data`, `overridden`
- runtime pack modes: `required`, `optional`
- machine-readable diagnostics and error codes

### 10.4 Actor And Permission Matrix

| Actor | Create/Edit Pack | Submit For Review | Trust Review | Approve For Agents | Resolve In Own Runtime | Delegated Resolve | Private-Vault Runtime Unlock |
|---|---|---|---|---|---|---|---|
| Pack owner | Yes | Yes | No | No | Yes, if readable and flagged | No | No by default |
| Managing-group maintainer | Scoped | Scoped | Scoped when managing group matches | Scoped when managing group matches | Scoped | No | No by default |
| Tenant admin/reviewer | Yes | Yes | Yes | Yes | Yes | No | Only if explicitly supported and audited |
| General tenant user | Limited to owned/allowed packs | Limited | No | No | Yes, only for readable approved packs attached to owned workflow | No | No |
| Delegated worker | No | No | No | No | No | Explicit grant only | Never by default |
| Platform/operator admin | Operational repair only | Operational only where product policy allows | Operational only where product policy allows | Operational only where product policy allows | No implicit business-data access | No implicit access | Only through explicit audited operator workflow if later introduced |

### 10.5 Agent Memory Runtime Contract

Skill-level configuration must be explicit and stable. The canonical shape should follow this pattern:

```json
{
  "libraryContextPackIds": ["pack_sales_playbook"],
  "requiredLibraryContextPackIds": ["pack_sales_playbook"],
  "optionalLibraryContextPackIds": ["pack_regional_notes"]
}
```

Runtime request assembly must convert that configuration into explicit context-pack references rather than discovering packs implicitly:

```json
{
  "libraryContextPacks": [
    { "packId": "pack_sales_playbook", "mode": "required" },
    { "packId": "pack_regional_notes", "mode": "optional" }
  ]
}
```

Each resolved runtime memory item must preserve enough evidence to explain why it was injected:

```json
{
  "packId": "pack_sales_playbook",
  "libraryItemId": "lib_123",
  "mode": "required",
  "trustTier": "approved_for_agents",
  "freshness": "fresh",
  "citation": {
    "title": "Sales Playbook",
    "logicalPath": "sales/playbook.md",
    "excerpt": "Use approved pricing tiers..."
  },
  "estimatedTokens": 180
}
```

Canonical diagnostics should include at least:

- `required_pack_unavailable`
- `pack_not_trusted`
- `pack_not_approved_for_agents`
- `pack_flag_disabled`
- `pack_private_vault_locked`
- `pack_item_unreadable`
- `pack_resolve_timeout`

Required-pack failures block runtime creation. Optional-pack failures remain diagnostics and must not silently downgrade trust semantics.

### 10.6 Release Gate Evaluation Contract

Release gates must evaluate a defined scope and window, not ad hoc operator judgment.

Minimum contract:

- tenant rollout uses tenant-scoped evaluation
- default-on or broad rollout uses global evaluation
- latency and coverage gates evaluate a trailing 7-day window
- if minimum sample size is not met, status is `insufficient_data`, not `pass`
- unaudited config values such as bare `overridden` must fail closed
- overrides must record actor, approver, reason, scope, created time, expiry time, status, revocation state, and metadata
- override workflow must support `pending_approval -> active/rejected -> revoked/expired`
- self-approval must fail closed; tenant-scoped overrides require a second admin to approve
- standard overrides must expire within 24 hours; break-glass overrides must expire within 4 hours and require an incident reference
- an active override must be time-bounded, scoped to the evaluated tenant/global rollout, and visible in the readiness report
- protected surfaces may treat an override as release-gate-ready only when the override metadata validates and has not expired

Minimum sample expectations:

- refresh latency: at least 100 refresh events
- quick-switch latency: at least 100 interactive samples
- graph latency: at least 100 graph loads
- context-pack resolution latency: at least 25 resolves

Machine-readable output should include:

- `scopeType`
- `scopeId`
- `windowStart`
- `windowEnd`
- `status`
- `thresholds`
- `observed`
- `evaluatedAt`
- `override`
- `telemetryPersistenceFailureCount`

`blocked` and `insufficient_data` both prevent broad enablement of:

- `knowledgeVault.contextPacks.runtime.enabled`
- `knowledgeVault.contextPacks.delegatedMcp.enabled`
- `knowledgeVault.graph.enabled`

Telemetry evaluation must not rely on a fixed small raw-event limit. Production readiness requires either paginated reads over the full measurement window or durable rollups keyed by tenant, window, event type, surface, and status. If telemetry persistence fails, the readiness report must expose a persistence-failure counter instead of silently reporting stale data as authoritative.

### 10.7 Rollback And Operations Runbook

Feature 104 must support flag-first rollback without destructive schema rollback.

Required rollback modes:

- soft rollback: disable runtime memory and delegated MCP while keeping human navigation available
- graph rollback: disable graph and canvas while keeping saved views and packs intact
- containment rollback: disable the whole knowledge-vault surface if leakage or migration safety is in doubt

Required operator actions:

- tenant backfill
- single-note refresh/repair
- stale-state recompute
- release-gate re-evaluation
- audit/history inspection for review and approval events
- release-gate override request, approval/rejection, and revocation with reason, expiry, and incident metadata for break-glass mode
- telemetry rollup repair or raw-event replay when readiness data is incomplete
- snapshot drift demotion review for packs that were previously trusted/agent-approved

Incident response rules:

- any hidden-note or private-vault leakage count above zero triggers containment rollback for graph, delegated MCP, runtime packs, and private-vault unlock
- delegated unauthorized resolve attempts in production block release-gate pass until grants and worker manifests are reviewed
- archived context packs must resolve as empty/error and must not serve note content
- trusted agent-approved snapshot packs with content or metadata drift must demote to stale or block runtime until re-reviewed
- revoked or expired overrides must immediately stop contributing to protected-surface enablement

Schema rollbacks are not the primary containment path. The default containment path is feature-flag disable plus repair and forward fix.

---

## 11. Security And Privacy Requirements

- Every knowledge read must re-check actor visibility.
- Graph and backlinks must omit unreadable source and target notes.
- Unlinked mentions must not reveal private-vault or cross-tenant note names.
- Context-pack resolution must not grant raw-note read permissions.
- Delegated MCP tools must only list or resolve explicitly granted packs that are also trusted, approved for agents, and not archived.
- Archived packs must not resolve content even for owners unless an explicit admin/debug repair flow is introduced.
- Agent-facing snapshot packs must use drift demotion or runtime blocking by default; diagnose-only drift is allowed only for non-agent or explicit debug workflows.
- Runtime injection must preserve citations and source refs.
- Private-vault unlock state must be explicit and auditable.
- Counts, diagnostics, tooltips, labels, ARIA text, and logs must not reveal hidden titles, paths, or excerpts.
- Tests must include leakage attempts for stale cache, archived notes, private vault, deleted notes, and revoked shares.

---

## 12. Release Gates

The feature should not be broadly enabled until these gates are met for the evaluated scope and measurement window defined in Section 10.6:

- hidden-note leakage = 0
- citation coverage = 100% for runtime context-pack items
- readable Markdown backfill coverage >= 99% before graph defaults are enabled
- save-to-knowledge-refresh p95 <= 5 seconds
- quick switch p95 <= 250 ms for first 20 results up to 10k visible notes
- local graph p95 <= 400 ms with default cap <= 75 nodes
- context-pack resolution p95 <= 1200 ms for 25 notes or 20k estimated tokens
- delegated-worker unauthorized pack resolve attempts = 0 successful
- migration idempotency smoke passes in CI
- release-gate status = `pass` or time-bounded audited override

---

## 13. Rollout Strategy

### Phase 1: Backend Safety

- Index job payload metadata
- Refresh worker
- DB integration tests
- approval workflow
- feature flags

### Phase 2: Human Navigation

- quick switcher
- inspector
- property catalog UI
- saved-view manager

### Phase 3: Curation And Review

- context-pack manager
- publish saved view
- snapshot packs
- review workflow UI

### Phase 4: Agent Memory

- skill context-pack picker
- runtime preview
- citation preview
- delegated grants
- MCP resolve flows

### Phase 5: Graph And Canvas

- local graph UI
- canvas UI
- graph/canvas metrics
- graph/canvas scale hardening
- no runtime graph expansion in Feature 104

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Stale cache leaks unreadable notes | Always re-check visibility at read time; add leakage tests |
| Agent context becomes too broad | Explicit pack refs only; no automatic graph/backlink expansion |
| Queue worker breaks vector indexing | Separate payload persistence and retry paths; do not mark vector jobs complete from knowledge worker |
| Approval workflow becomes bypassable | Service-level transition guards and audit fields |
| UI suggests unsupported semantics | Clear labels: navigation, curation, runtime memory |
| Snapshot packs become stale without warning | Snapshot metadata and diagnostics on resolve |
| Rollout happens before coverage is safe | Feature flags and release-gate dashboard |

---

## 15. Acceptance Criteria

- Markdown save/share/restore paths can trigger automatic knowledge refresh without manual CLI intervention.
- Migration and DB integration tests prove schema, backfill, and ACL-sensitive reads.
- Users can navigate vault knowledge through UI surfaces without relying only on search.
- Users can curate and submit context packs for review.
- Reviewers can approve, revoke, stale, and re-review packs.
- Review and approval history is queryable and auditable.
- Agent skill owners can explicitly attach trusted packs and preview citations.
- Runtime context contains only selected pack content and citations.
- Runtime diagnostics and error codes distinguish required-pack failures from optional-pack warnings.
- Delegated workers can resolve only granted packs.
- Operators can see freshness, coverage, latency, citation, and leakage metrics.
- Release-gate evaluation is machine-readable and supports `pass`, `blocked`, `insufficient_data`, and audited override states.
- Snapshot packs support stable audit workflows.
- Feature flags keep risky surfaces disabled until release gates pass.
- Keyboard, accessibility, and Thai/English metadata handling do not widen or leak hidden knowledge.
- Rollback can disable agent-facing memory without removing the entire human navigation experience.

---

## 16. Implementation Plan

Detailed implementation sections live in `sections/`.

Start with queue/index-job and DB integration safety before UI or agent memory surfaces. This keeps the system correct before making it more visible.
