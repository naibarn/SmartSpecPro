# Spec 215 TDD Plan

Commands use `npm --workspace apps/web test -- --run <file>` for focused Vitest. Cross-service work uses the corresponding Python pytest file. Root typecheck is forbidden by repository policy.

## Section 01 — Authority and migration baseline
- Test: source/spec conformance guard confirms Spec 251 is discovered and its ownership is correctly referenced.
- Test: retired workflow engine and `/workflows` are not imported/registered by the canonical Spec 215 path.
- RED: current §75 says Spec 251 was not found; existing code/spec registry confirms it exists.
- Residual: deployed definitions/runs require production inventory.

## Section 02 — Durable logical execution state
- Test: schema/migration contains tenant-scoped run/node/attempt identity, dependency readiness, committed output references, checkpoint and canonical job/attempt links.
- Test: tenant and run uniqueness, sequence ordering, idempotency, legal state transitions, malformed references, and migration rollback/compatibility.
- RED: no durable NodeAttempt/output/readiness bridge currently exists.
- Residual: migration application on target DB and backfill of deployed rows are external.

## Section 03 — Compiler, plan locking and policy projection
- Test: invalid scope/policy/binding/output shapes fail before plan persistence.
- Test: plan digest is deterministic and pinned manifest/binding revision changes invalidate acceptance.
- Test: retry/timeout/budget/cache/checkpoint/fallback/instrumentation declarations map to normalized execution policy or typed unsupported policy.
- RED: existing compiled policies are not fully translated into runtime behavior.
- Residual: live catalogs/credential entitlements remain external.

## Section 04 — Run activation and dependency scheduler
- Test: root nodes enqueue; blocked downstream nodes do not enqueue before predecessor output commits.
- Test: a successful commit wakes exactly the newly-ready dependent nodes; duplicate wake/trigger is idempotent.
- Test: join waits for its declared predecessor policy, branch failure and cancellation do not activate invalid descendants.
- RED: current router admits all selected jobs in one loop.
- Residual: production load/concurrency needs staged capacity evidence.

## Section 05 — Canonical job gateway/executor
- Test: logical state/outbox/job creation is atomic or recoverably idempotent; one node attempt binds to one worker job.
- Test: duplicate delivery, stale lease/fence, unknown job type, cancellation race, and worker loss cannot double-run committed effects.
- RED: current dispatcher fails closed without a registered production handler.
- Residual: external transport/account/deployment activation is not proven by local tests.

## Section 06 — Node adapters/preflight
- Test: exact type/version/digest lookup for all 16 node IDs; one safe adapter or explicit unavailable/fail-closed reason per type.
- Test: tenant grant, capability readiness, placement, residency, credential and revocation checks occur before effect.
- Test: adapter exceptions normalize to typed results and never claim success.
- RED: no complete production node adapter matrix exists.
- Residual: provider/runtime entitlements and live external execution remain owner gates.

## Section 07 — Graph control flow
- Test: router selects only valid edges; fan-out and join behavior is stable under replay; loops enforce iteration/deadline bounds; subflow lineage and outputs are isolated.
- Test: dynamic expansion policy rejects over-limit/unauthorized expansion.
- RED: graph activation state is not persisted.
- Residual: distributed scale characteristics need later load proof.

## Section 08 — Checkpoint and human interaction
- Test: checkpoint version and output snapshot restore exact state; tampered/missing checkpoint fails closed.
- Test: approval/input action is tenant-bound, one-time/idempotent, revocation-aware; duplicate resume returns existing result.
- Test: suspension releases physical execution lease and resume reacquires fenced ownership.
- RED: existing older executor wait behavior is not canonical durable state.
- Residual: actual cross-device notification delivery depends on Specs 225/226 deployment.

## Section 09 — Effects/replay/recovery
- Test: result plus logical node terminal state is atomic or settled through a durable marker/outbox.
- Test: unknown provider submission checks operation receipt/status and never generates a fresh side-effect key blindly.
- Test: retry/timeout/cancel/cache hit/eviction/orphan repair preserve same logical run and correct attempt lineage.
- RED: no end-to-end effect receipt and fence bridge currently exists.
- Residual: provider idempotency semantics require provider-specific contract tests.

## Section 10 — Authorization/placement/data governance
- Test: cross-tenant and revoked principal denied at invoke and commit; data tier/purpose/residency incompatible execution is rejected.
- Test: secrets are references only and never persisted into workflow plan, job envelope or logs.
- Test: retrieval adapter is unavailable in production unless Spec 229/220 release gates are active; no direct provider search fallback.
- RED: current policy declarations are not enforced end to end.
- Residual: production Spec 220/229 certification remains external.

## Section 11 — Economics/fairness/operations
- Test: budget reserve/settle is idempotent and assigned to the authoritative Spec 207 operation; tenant/user concurrency and priority fairness are bounded.
- Test: run/node/job observability is correlated and redacts secrets/PII; operator actions require expected revision and authorization.
- RED: runtime behavior does not consume every attached policy.
- Residual: alert thresholds and workload SLOs need production baseline data.

## Section 12 — Conformance/migration/release
- Test: all 16 types compile and resolve adapter outcomes; graph suite covers each normative control construct.
- Test: Spec 212 R20 corpus/identities and old-ID rejection match pinned source artifacts.
- Test: migration expand/backfill/verify/contract rollback; restart/lease expiry/outbox loss/replay; deployment-version compatibility.
- RED: current suite is contract-focused and does not exercise the complete durable graph lifecycle.
- Residual: production data, real provider, Cloudflare binding, and DR restore gates require owning environment evidence.
