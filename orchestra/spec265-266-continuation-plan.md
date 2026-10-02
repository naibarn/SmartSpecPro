# Spec 265/266 Continuation Plan

## Classification
- Intent: explicit continuation and end-to-end completion; Orchestra owns the work.
- Scope/risk: project / high (tenant data, durable jobs, migrations, APIs and user-facing product).
- Route: resume current deep implementation; execute independent schema-free service slices in parallel, then integrate protected APIs and runtime serially.
- Skill routing: Orchestra + deep-implement; SocratiCode unavailable, so use targeted `rg`/bounded reads and record that fallback.
- Migration boundary: 0381 is applied and verified on the configured local `smartspec` database. Preserve the pre-existing `orchestra/.wave-active` marker and make no further schema edits (including 0382) while another schema owner is active. Do not apply SQL outside a migration-managed environment.
- Worktree: `main` is dirty with broad user-owned changes; no reset/stash/stage/commit/deploy. New files only in owned paths; shared router registration will be conductor-owned and reviewed for unrelated diff.

## Wave 1 — schema-free independent repositories
| Workstream | Ownership | Contract | Proof |
|---|---|---|---|
| Decision project and immutable analysis repository | `apps/web/server/services/decisionIntelligence/decisionProjectPersistence.ts` and its test only | Server supplies tenant/owner identity; queries always scope both; project creation validates bounded domain JSON; AnalysisRun append is immutable and verifies same project/tenant. | Focused Vitest with auth-scope, bounds, append-only and mismatched-tenant cases. |
| ResearchRun persistence repository | `apps/web/server/services/intelligenceFabric/researchRunPersistence.ts` and its test only | Server supplies tenant/request/job identity; request must bind same tenant and job; append receipt has stable idempotency/replay and immutable run records. No provider calls or queue. | Focused Vitest with mismatch, replay, conflict and immutable receipt cases. |

## Wave 2 — conductor-owned integration (completed for available schema-free scope)
- Protected decision tRPC routes are mounted once in `server/routers.ts`, with tenant and owner authority derived from authenticated account context.
- Added ResearchRun persistence bound to a tenant ResearchRequest and canonical worker job. It is not registered as an executor because there is no approved runtime composition; the existing runtime seam continues to fail closed.
- Added the authenticated `/decision-intelligence` project workspace and main sidebar entry using persisted APIs for create/list/history. Lifecycle status is read-only until a canonical execution receipt advances it; the workspace does not fabricate AnalysisRuns.
- Current focused proof: 32 files / 209 tests passed across workspace/menu/router/repositories/research contracts and existing 260/262 integration seams; scoped `git diff --check` passed.

## Wave 3 — still open
- Build Spec 266 authoritative repository/resolver and policy loaders on the applied 0381 schema; keep all unreviewed sources inactive.
- Compose admitted ResearchRequest → canonical executor → immutable ResearchRun and AnalysisRun only after the approved research runtime, credentials, rights, budget, artifact and cancellation/lease boundaries are bound.
- Complete additional 265/266 product surfaces and 260/262 integration only against verified upstream contracts.
- 0381 is already applied through the normal migration history after its predecessor hash and an idle target database were verified. The configured local target had an existing populated database, but the new tables are empty. Never roll this back after data is admitted without export/retention planning.

## Later gates
- Schema 0382 for DecisionQuestion/Template/Factor/Scenario/Claim/Watch remains blocked by the active single-writer marker. Do not bypass it.
- Spec 266 source health/registry production adapters, resolver APIs, artifact scanning/SSRF controls, admin, 260/262 compatibility cutover, UI/workspace/chat/map, watch and production/provider/legal evidence remain open and require subsequent slices.

## Required choices
- Decision project JSON stores versioned domain input and reference arrays; no evidence/source authority copy.
- AnalysisRun and ResearchRun records are append-only. Re-analysis creates another record.
- Only canonical `worker_jobs`/outbox may represent async execution.

## Current loop ledger
- iteration: 31 review rounds tracked; tool-call batches: ongoing; dispatch waves: read-only post-migration gap audit plus independent code review; repair rounds: 4/5 in this continuation.
- active implementation agents: 0/4; writers: 0/2; independent review agent: closed; cost: unknown within default proxy.
- stop reason: active.
