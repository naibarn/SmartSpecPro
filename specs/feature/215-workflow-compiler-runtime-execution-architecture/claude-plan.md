# Spec 215 Deep Implementation Plan

## Goal

Turn Spec 215's repository-local runtime contract into an executable, durable, test-backed Workflow Studio runtime. Every asynchronous workflow action must use the existing Feature 195/186 canonical `worker_jobs` + outbox plane, while Spec 215 owns only logical workflow/node state and scheduling.

## Why the current slice is incomplete

The repository has node manifests, compiler validation, immutable plan shapes, aggregate Studio run records, and a physical-job handoff. It currently admits jobs for every selected node before dependencies have committed; logical per-node outputs and attempts are not durable; the registered job executor has no complete production dispatcher; compiled policy is partly disconnected from physical execution; and current tests prove contracts rather than a resumable graph runtime. Extending the old sequential `workflowStudioJobExecutor.ts` would preserve the wrong execution model and is not an acceptable shortcut.

## Architecture decisions

1. **One physical execution authority:** keep `worker_jobs`, its attempt/lease/fence, events and outbox in Feature 195/186. Spec 215 persists logical WorkflowRun/NodeRun/NodeAttempt transitions and canonical job references; no second job ledger/queue.
2. **Readiness before admission:** only roots or nodes whose required predecessors have committed outputs are eligible to create a physical job. State transition plus job/outbox intent must be atomic or reconciled by a durable idempotent command.
3. **At-least-once safe execution:** every scheduler wake, job delivery, output commit, checkpoint, approval response and resume is keyed/idempotent. Unknown paid/external outcome is reconciled or held for operator review, never blindly resubmitted.
4. **Versioned adapter registry:** resolve exact Spec 214 manifest/type/version/digest and an authorized runtime binding; preflight is mandatory before effects. Unsupported/missing external capability returns a typed unavailable result and keeps production disabled.
5. **No ownership duplication:** use Spec 220 for authorization/secrets, 207 for economics, 225/226 for attention/actions, 229 for retrieval, Feature 195/186 for physical jobs, and Spec 251 for creator profile inputs. Missing owner runtime remains a named fail-closed gate.
6. **Migration-safe evolution:** inventory persisted definitions/runs and active work before strict cutover; additive migrations, read compatibility, explicit backfill/retention, rollback and restore proof precede any destructive contraction.
7. **No prohibited runtime:** do not use the retired legacy custom workflow engine, `/workflows`, `workpacks/*`, Agency, or OpenSandbox/Docker dispatch. Do not extend the legacy sequential Studio executor as Spec 215.

## Implementation sections

| Section | Coverage | Deliverable |
|---|---|---|
| 01 Authority and migration baseline | §0–2, §67–69, §70–73, §75 ownership | Correct cross-spec ownership, current Spec 251 reference, inventory/readiness contract; retain historical audit as history only |
| 02 Durable logical execution state | §3–4, §7–12, §24–25, §35, §49 | Additive per-run/node/attempt/dependency/output/checkpoint persistence linked to worker job/attempt IDs |
| 03 Compiler, plan locking and policy projection | §4–8, §16, §36, §55–59 | Validate all non-node constructs, pin manifests/bindings, normalize policies and version locks deterministically |
| 04 Run activation and dependency scheduler | §9–11, §17–20, §41 | Idempotent triggers and scheduler that admits roots/ready nodes only; preserves deadline/time semantics |
| 05 Canonical job gateway and executor lifecycle | §12, §15, §18, §26–30, §50 | Transactional worker_jobs/outbox handoff, fenced handler claims, durable output/result settlement and cancellation |
| 06 Node adapter registry and preflight | §13–16, §34, §36–40, §65–66 | Versioned adapters and typed preflight outcomes for all 16 core nodes; no direct bypass of owned capability boundaries |
| 07 Graph control flow | §20–24, §46, §48 | Persisted router, fan-out, join, loop, subflow, partial execution and expansion semantics |
| 08 Checkpoint, wait and human interaction | §25, §31–33, §60, §74 | Durable suspension/input/approval state and authorized resume through Specs 225/226 |
| 09 Effects, idempotency, replay and recovery | §26–30, §43–50, §61–63 | Atomic output/effect receipts, retry/timeout, cache correctness, uncertain outcomes, orphan repair, recovery |
| 10 Authorization, placement and data governance | §13–16, §38–40, §53–58, §75 | Current policy/tenant/capability checks, credentials/residency, drift/revocation; bind Creator profile from Spec 251 |
| 11 Economics, fairness and operations | §41–42, §51–52, §62 | Budget/quota/scope enforcement, progress/audit/metrics, safe operator actions and truthful status |
| 12 Full conformance, migration and release proof | §64–73, §76 and acceptance/DoD across §0–76 | 16-type and Spec 212 corpus coverage, migration/upgrade/DR gates, integrated acceptance and external-gate inventory |

## Complete heading coverage map

Every current numbered clause and amendment maps to an implementation section; historical audit text remains historical and is not treated as new runtime behavior.

| Spec sections | Plan section |
|---|---|
| §0–2 | 01 |
| §3–12 | 02 (definition/run/node state), 03 (compile/lock), 04 (activation), 05 (physical job integration) |
| §13–16 | 03, 06, 10 |
| §17–20 | 04, 07 |
| §21–24 | 02, 07 |
| §25–30 | 02, 05, 08, 09 |
| §31–33 | 08 |
| §34–40 | 03, 06, 10 |
| §41–46 | 04, 07, 09, 11 |
| §47–50 | 05, 09 |
| §51–58 | 03, 10, 11 |
| §59–63 | 02, 08, 09, 12 |
| §64–68 | 01, 12 |
| §69–71 | 12 |
| §72–73 historical/rejection contract | 01 (history boundary), 12 (required new-definition rejection coverage) |
| §74 | 08 |
| §75 R4 Creator | 01, 06, 10, 12; correct stale Spec 251 statement |
| §76 R5 Retrieval | 06, 10, 12; stay fail-closed until Spec 229 + 220 release gates |

## Execution order

1. Section 01: reconcile authorities, inventory the actual current route, correct stale owner claims; no legacy data deletion.
2. Section 02: schema/migration single-writer step; serialize all schema work before code depending on new fields.
3. Section 03: compiler/policy projection.
4. Section 04: dependency-aware scheduler.
5. Section 05: physical job handoff and handler lifecycle.
6. Section 06: adapter registry and preflight contracts.
7. Sections 07, 08, and 09: graph semantics, suspend/resume, side effects and recovery; use persisted state and fault/race tests.
8. Sections 10 and 11: security/data/economic/operations policy closure.
9. Section 12: full matrix, source inventory, integration/failure tests, migration and release gates.

No two tasks edit Drizzle schema/migrations concurrently. Implementation is conducted in the existing dirty worktree; the conductor owns the schema changes and will stage no unrelated files. Deep-implement's normal per-section commit operation is disabled in practice because this checkout is already dirty on `main` with overlapping user changes; no safe commit boundary exists for those shared files. Keep every result reviewable and do not push/deploy.

## Completion boundary

Local completion means source, schema, and focused tests satisfy every locally implementable contract and every external dependency fails closed with an explicit typed reason. It does not mean production records were migrated, providers were called, Spec 229 was deployed, a target runtime was activated, or disaster recovery was rehearsed. Those are named owning-team release gates.

## Required review loop

Run at least ten numbered, evidence-backed rounds after implementation. Each round checks a separate invariant family, records findings/fixes/gates in `orchestra/review-findings.md`, and invalidates/reruns stale checks after repairs. Do not declare convergence while a safe local requirement, failing focused test, untracked async business job path, or open must-fix gap remains.
