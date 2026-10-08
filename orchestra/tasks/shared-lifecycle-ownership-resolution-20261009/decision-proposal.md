# Shared Lifecycle Eligibility — Accepted Architecture and Implementation Gate

**Status:** ARCHITECTURE ACCEPTED BY PROJECT OWNER / REPOSITORY MAINTAINER; runtime implementation remains blocked pending production caller identification and a collision-free authorized WorkUnit
**Repository baseline:** `origin/main` / `89ef3697976cade1d6811ee9e4ec0f822e1d0e7a` (verified 2026-10-09)
**Date:** 2026-10-09 (Asia/Bangkok)
**Scope:** Architecture and bounded implementation handoff only. No runtime, Spec, handoff, generated-view, schema, migration, grant, or dispatch changes are authorized by this record.

## Recorded owner decision

On 2026-10-09, the project owner/repository maintainer confirmed the following technical ownership assignments and accepted Decisions A–D plus the DevelopmentRun-only Phase 1 boundary, subject to existing security and change-control policies. The same authorized maintainer holds all three roles; repository governance inspection found no mandatory independent-review rule. This records the architecture and accountable roles. It does not authorize production deployment, migration, grants, economic provisioning, Runner dispatch, or modification of another owner's work.

| Role | Accountable owner | Authorized responsibility | Decision | Evidence / approval reference | Outstanding blocker |
|---|---|---|---|---|---|
| SPEC-224 DevelopmentRun lifecycle | `@naibarn` | DevelopmentRun lifecycle paths under SPEC-224; actual admission integration path must be confirmed before implementation | ACCEPT | Project Owner / Repository Maintainer Decision in this conversation, 2026-10-09; SPEC-224 spec | Identify and verify the actual production admission caller; record exact file ownership and a collision-free implementation WorkUnit |
| Canonical Spec Handoff / Global Views | `@naibarn` | Canonical handoff writer and generated reporting views | ACCEPT | Same owner decision; `specs/project/canonical-spec-handoff-reconciliation/04-global-views-and-migration/spec.md` | No Phase 1 reporting change is needed; any future reporting change must remain recommendation-only |
| SPEC-186 worker_jobs / Outbox admission | `@naibarn` | Existing worker_jobs/outbox admission boundary and its tenant, approval, economic, lease, fencing, and idempotency controls | ACCEPT | Same owner decision; SPEC-186 spec | Must confirm the real DevelopmentRun caller and preserve all gates; no production dispatch is authorized |
| Non-DevelopmentRun domain adapters | Each respective domain owner | Existing domain-owned durable identities only | DEFERRED | Owner decision explicitly excludes universal adapters | Separate owner approval and collision-free WorkUnit for each adapter |

The repository owner confirmed the accountable roles directly. This is the owner approval evidence for the architecture and role assignments, not proof that runtime behavior is implemented or that a production caller exists.

## Proposed decisions

1. Spec continuation values such as `CONTINUE_REQUIRED`, priority, and `next_ready_workunit` are recommendations. A generated queue entry never creates a `worker_jobs` row and is never dispatch authorization.
2. DevelopmentRun-owned units continue through the SPEC-224 durable lifecycle. Non-DevelopmentRun units retain their existing domain-owned durable identity and may participate only through an adapter registered by that domain owner.
3. Runtime execution remains on `worker_jobs` plus outbox and its existing authorization, tenant, approval, idempotency, lease, fencing, and economic gates. Eligibility is an input to admission, not an authorization token.
4. No generic WorkUnit ledger, queue, scheduler, migration, runtime grant, or approval is introduced.
5. SPEC-269 and SPEC-275 provide domain state/evidence only. Neither can override dispatch authority.
6. Missing adapters, unsatisfied predicates, stale evidence, missing tenant authority, unresolved owner, or ownership collision fail closed with an explicit reason.
7. A task-local proposal or canonical handoff nomination is not a canonical owner decision and does not mark any Spec complete.

## Minimal interface proposal

Illustrative TypeScript shape only; not merged runtime API:

```ts
type EligibilityState =
  | "READY"
  | "WAITING_DEPENDENCY"
  | "WAITING_AUTHORITY"
  | "OWNER_REQUIRED"
  | "ADAPTER_UNAVAILABLE"
  | "STALE_EVIDENCE"
  | "OWNERSHIP_CONFLICT"
  | "INELIGIBLE";

type WorkUnitEligibility = {
  state: EligibilityState;
  workUnit: {
    domain: string;
    durableKind: string;
    durableId: string;
    tenantId: string;
  } | null;
  sourceRevision: string | null;
  reasonCodes: string[];
  evidence: Array<{
    reference: string;
    source: string;
    observedAt: string;
    verifiedAt: string;
    revision?: string;
  }>;
  ownership: {
    ownerId: string;
    adapterId: string;
    verifiedAt: string;
    conflictRefs: string[];
  } | null;
};
```

Required semantics:

- `READY` means the evaluator verified the unit's current predicates and ownership at the returned source revision. The authorized admission path must recheck freshness, tenant authority, approvals, leases/fencing, and idempotency before dispatch.
- `WAITING_DEPENDENCY` and `WAITING_AUTHORITY` require registered, re-checkable predicates and evidence provenance. Otherwise return `ADAPTER_UNAVAILABLE`, `OWNER_REQUIRED`, or `INELIGIBLE` as applicable; never create a blind wait.
- `STALE_EVIDENCE` and `OWNERSHIP_CONFLICT` are terminal for the current evaluation and require fresh evidence or conflict resolution before reevaluation.
- `workUnit: null` is permitted only for an unbound Spec recommendation. It can never be `READY`.
- Do not persist these results in a new ledger. Return/project them from the existing domain record or DevelopmentRun, with any durable event/job state remaining on its current owner.
- Keep `reasonCodes` stable and machine-readable; free-text rationale may accompany but cannot replace them.

## Phase 1 boundary and integration plan, gated by implementation admission

1. The project owner has accepted the DevelopmentRun-only result semantics, the recommendation/dispatch boundary, and the continued authority of worker_jobs/outbox and its existing gates.
2. Verify the actual production DevelopmentRun admission caller before choosing an integration point. The previously identified `createAndBindNextPhase()` seam has no confirmed production caller.
3. Record exact file ownership, active reservations, and a collision-free implementation WorkUnit before implementation. Do not modify Lane 1-owned paths or the preserved ecosystem-foundation worktree.
4. Do not implement universal non-DevelopmentRun adapters or modify generated reporting views in Phase 1.
5. After the above implementation admission conditions are met, implement only a DevelopmentRun lifecycle/admission guard using the existing durable DevelopmentRun and `worker_jobs`/outbox path. Do not create storage or migrations.
6. Run the authorized focused DevelopmentRun tests, SPEC-038 negative regression, and at least ten independent focused QA/review passes. Tests of an unconnected service do not establish runtime enforcement.
7. A later non-DevelopmentRun adapter requires a separate collision-free WorkUnit and explicit approval from that domain owner.

## Focused acceptance matrix for the authorized implementation

1. Ready WorkUnit: fresh evidence and verified owner produce advisory `READY`; admission still rechecks authorization.
2. Missing evidence: return `WAITING_DEPENDENCY` only if its predicate adapter and watcher can recheck it; otherwise fail closed.
3. Recoverable blocker: preserve a valid wait and resume point without losing independent eligible work.
4. Missing predicate adapter: return `ADAPTER_UNAVAILABLE`; do not dispatch or create a blind wait.
5. Stale evidence: return `STALE_EVIDENCE`; no dispatch.
6. Ownership conflict: return `OWNERSHIP_CONFLICT`; no dispatch and preserve all owner work.
7. Duplicate recommendation: remain idempotent; a repeated nomination does not create duplicate jobs.
8. Resume after evidence arrival: revalidate evidence and authority, then enqueue through existing idempotent outbox path.
9. Cross-tenant authorization: reject mismatched tenant/project scope before admission.
10. Existing DevelopmentRun compatibility: existing wait, evidence, fencing, and resume behavior remains valid.
11. SPEC-038 regression: queue recommendation remains visible, CMS implementation remains ineligible, closed dashboard workunit stays closed, and reactivation requires verified CMS-specific evidence.
12. Independent unit: an unrelated domain unit with an approved adapter and satisfied predicates remains selectable.

## Current collision and preserved work

Read-only inspection found `/home/dev/worktrees/SmartSpecPro-ecosystem-foundation` on `codex/smarthub-authority-recovery-uat-20261007`, substantially behind canonical main with dirty and untracked changes including shared handoffs and SPEC-268/269/302. This proposal does not alter that worktree or any overlapping paths. Recheck the worktree and active path reservations before any later implementation decision.

## Remaining implementation gate and next action

- **Production admission caller:** identify and verify the live DevelopmentRun caller; a service method and its unit tests alone are insufficient.
- **Implementation WorkUnit and paths:** create/identify a collision-free, admitted WorkUnit and record exact authorized file paths before any runtime edit.
- **Non-DevelopmentRun domain owners:** separate approval is required per future adapter; all such adapters are deferred.
- **Collision owner:** identify and reconcile the dirty ecosystem-foundation worktree through its owner; no one else should stage, rebase, cherry-pick, or overwrite it.

No runtime implementation WorkUnit is currently declared eligible. The documentation-only PR #374 can proceed through normal repository policy. After merge, the next eligible shared runtime WorkUnit is **not yet established**; first action is a read-only trace from the DevelopmentRun production entrypoints to a verified admission caller, followed by WorkUnit admission and path reservation.

## Evidence and limitations

- Canonical source inspected for current caller search: `89ef3697976cade1d6811ee9e4ec0f822e1d0e7a`.
- Project-owner/repository-maintainer decision and role assignments were received on 2026-10-09 and are recorded against PR #374.
- Repository governance inspection found zero rulesets, no `main` branch protection, and no configured mandatory independent review. Only `@naibarn` is listed as a collaborator/admin; no guessed reviewer is requested.
- `tools/spec_handoff next` returns generated continuation-queue rows; repository search found no runtime caller that turns those rows into dispatch.
- `apps/web/server/services/developmentLifecyclePredicateRegistry.ts` fails closed for unavailable and duplicate predicate IDs; `developmentLifecycleDependencyWatcher.ts` uses the existing worker-job-backed DevelopmentRun persistence path.
- `apps/web/server/services/spec224PhaseController.ts`: `createAndBindNextPhase()` calls `createControlPlaneJob()` at line 217; `reconcileAndContinueNextPhase()` calls it at line 311. A search of the latest `origin/main` found no other caller outside these service definitions/self-call. This seam has no confirmed production caller, so no runtime enforcement claim is made.
- `apps/web/server/services/jobControlPlaneGateway.ts` identifies `createControlPlaneJob()` as the producer-facing creation boundary. Existing admission controls remain authoritative.
- This PR changes documentation only. Runtime tests were not run and would not establish production wiring. Implementation QA requirements remain pending until separately authorized runtime work.
