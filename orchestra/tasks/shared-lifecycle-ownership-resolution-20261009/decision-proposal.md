# Shared Lifecycle Eligibility — Owner Decision Proposal

**Status:** CONDITIONALLY ACCEPTED BY PROJECT OWNER — required canonical/runtime owner confirmations pending
**Repository baseline:** `origin/main` / `34aa1137b2bfa1aa2c1c752fbad23cf5d02157ab`
**Date:** 2026-10-09 (Asia/Bangkok)
**Scope:** Architecture and bounded implementation handoff only. No runtime, Spec, handoff, generated-view, schema, migration, grant, or dispatch changes are authorized by this record.

## Decision requested

The project owner accepted Decisions A–D as the design direction, conditional on confirmation by the responsible canonical and runtime owners. This is not a canonical owner approval, implementation authorization, runtime grant, economic authorization, or dispatch permission. The required owner confirmations remain pending.

| Concern | Proposed owner/boundary | Current evidence | Approval status |
|---|---|---|---|
| Spec continuation recommendation | Canonical Spec Handoff manifests and their generated views | `specs/project/canonical-spec-handoff-reconciliation/04-global-views-and-migration/spec.md`; `tools/spec_handoff/index.py` | Reporting role verified; approval of the explicit no-dispatch boundary requested |
| DevelopmentRun lifecycle | SPEC-224 Development Orchestration Runtime | `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md` names DevelopmentRun as its lifecycle aggregate and correlates it with `worker_jobs` | Domain responsibility verified; approval of shared eligibility contract and enforcement integration pending |
| Non-DevelopmentRun WorkUnit identity/lifecycle | Each existing domain owner through an explicitly registered adapter | No universal identity mapping or complete adapter owner registry verified | **Unresolved; owner approval required per domain** |
| Durable dispatch and execution | SPEC-186 `worker_jobs` + transactional outbox, with current authorization, leases, fencing, approvals, and economic controls | `specs/feature/186-unified-job-control-plane-adapters/spec.md`; SPEC-278 confirms `worker_jobs` remains execution authority | Boundary verified; approval required before any admission-path integration |
| SPEC-269 task/delegation state | SPEC-269 domain consumes its state through its approved owner adapter | Canonical SPEC-269 exists, but manifest authority is not proof of shared dispatch authority | Adapter ownership and interface approval pending |
| SPEC-275 reliability evidence | SPEC-275 domain consumes its evidence through its approved owner adapter | Canonical SPEC-275 exists; manifest records unresolved authority for production evidence bindings | Evidence owner and interface approval pending |

Canonical owner roles are identifiable from source, but no named owner acceptance or approval receipt was found in the inspected canonical records. The current task cannot substitute for those approvals.

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

## Phase 1 boundary and integration plan, gated by approvals

1. Obtain written approval from the SPEC-224 runtime owner for the DevelopmentRun-only result semantics, reuse of its existing predicate registry/watcher, and exact owned admission call site.
2. Obtain approval from the canonical handoff/global-view owner that continuation output remains reporting-only and confirm whether any reporting change is necessary. No generated-view changes are included in Phase 1 by default.
3. Obtain SPEC-186/runtime-admission owner approval for the exact consumption point and confirm that all existing dispatch gates remain authoritative.
4. Verify file ownership, active reservations, and a collision-free task workunit before implementation. If any owner or path remains unresolved, stop at this boundary.
5. After those approvals, implement only a DevelopmentRun lifecycle/admission guard using the existing durable DevelopmentRun and `worker_jobs`/outbox path. Do not enable non-DevelopmentRun adapters, change canonical Spec Handoff, create new storage, or add migrations in Phase 1.
6. Define and run focused tests for the approved DevelopmentRun path, including fail-closed predicates, evidence freshness, tenant authorization, idempotency/fencing, and the SPEC-038 blocked regression. SPEC-038 remains a negative case; do not reopen CMS implementation.
7. After authorized implementation, run at least ten independent focused QA/review passes plus existing DevelopmentRun compatibility tests. Those reviews do not substitute for runtime, tenant, database/outbox, or exact-SHA verification.
8. A later non-DevelopmentRun adapter requires a separate collision-free WorkUnit and explicit approval from that domain owner; no such adapter is enabled by this proposal.

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

Read-only inspection at this task start found `/home/dev/worktrees/SmartSpecPro-ecosystem-foundation` on `codex/smarthub-authority-recovery-uat-20261007`, 394 commits behind the recorded canonical tip, with 22 changed paths (including generated global views and SPEC-269/302 handoffs) plus an untracked SPEC-268 directory and task evidence. This proposal does not alter that worktree or any overlapping paths. There were no open PRs at inspection time. Recheck both the worktree and PR list before any later implementation decision.

## Unresolved approvals and next action

- **SPEC-224/runtime owner:** confirm the DevelopmentRun-only result semantics and identify/accept the exact lifecycle/admission integration owner/path.
- **Canonical handoff/global-view owner:** confirm the reporting-only boundary and generated-view ownership. No display change is needed for Phase 1 unless that owner identifies one.
- **SPEC-186/runtime-admission owner:** confirm the specific admission call site and retained dispatch gates.
- **Each non-DevelopmentRun domain owner:** identify the existing durable ID and approve its adapter contract; SPEC-269 and SPEC-275 require separate domain evidence/ownership approval.
- **Collision owner:** identify and reconcile the dirty ecosystem-foundation worktree through its owner; no one else should stage, rebase, cherry-pick, or overwrite it.

No exact next shared WorkUnit is declared eligible. The continuation queue contains recommendations, but owner and adapter verification is not yet established for any candidate. Resume implementation only after the approvals above and a fresh collision/ownership audit.

## Evidence and limitations

- Canonical source inspected: `34aa1137b2bfa1aa2c1c752fbad23cf5d02157ab`.
- Project-owner conditional acceptance was received on 2026-10-09; it does not replace the three canonical/runtime owner confirmations above.
- PR #374 currently has no comments, reviews, or requested reviewers; therefore no required owner confirmation is evidenced there.
- `tools/spec_handoff next` returns generated continuation-queue rows; repository search found no runtime caller that turns those rows into dispatch.
- `apps/web/server/services/developmentLifecyclePredicateRegistry.ts` fails closed for unavailable and duplicate predicate IDs; `developmentLifecycleDependencyWatcher.ts` uses the existing worker-job-backed DevelopmentRun persistence path.
- No runtime tests were run: this artifact is an architecture proposal and the authorized owner approvals are not present. Passing documentation checks would not prove runtime behavior.
