# Spec 282 — SmartAIHub Continuous Canonicalization & Durable Work Convergence

**Status:** Proposed / additive platform reliability contract
**Revision:** R1.0
**Date:** 2026-10-05
**Target path:** `specs/feature/282-smartaihub-continuous-canonicalization-durable-work-convergence-r1-0/spec.md`
**Primary owners:** Spec 224 DevelopmentRun; Spec 186 Job Control; repository integration lifecycle; Spec 277 Task Control projection; Spec 261 SPAAS versioning
**Canonical Git baseline:** `origin/main` for the integrated development state
**Implementation rule:** additive-first; preserve current runtime contracts; no blind backfill, rewrite, branch deletion, or production activation.

## 1. Purpose

SmartAIHub MUST preserve accepted, valuable work across session termination, provider failure, quota exhaustion, worktree changes, and developer handoff. A task does not need to be complete or fully verified before its largest coherent safe checkpoint becomes durable in the owning canonical source.

For Git-backed implementation work, `origin/main` is the first shared durable landing point. It records integrated development state only; it does not certify release readiness, production readiness, deployment, or complete validation. For non-Git authoring, the owning subsystem's canonical version/revision is the equivalent landing point.

The lifecycle is:

```text
work → safe checkpoint → bounded fast gate → canonical revision → durable handoff → continue
                                  ↓
                         post-integration verification
                                  ↓
                       repair as a later checkpoint
```

## 2. Scope and boundaries

This Spec defines checkpoint timing, candidate discovery, source-of-truth boundaries, durable handoff contents, integration evidence, and Task Control visibility. It does not create a new work queue, scheduler, run ledger, approval system, verification engine, Mini App runtime, or workflow state store.

Existing authority boundaries MUST remain intact:

| Concern | Owner / contract | This Spec may |
|---|---|---|
| Multi-phase autonomous development lifecycle | Spec 224 `DevelopmentRun` | clarify checkpoint and handoff obligations |
| Individual execution state, leases, events, fencing, approval and dispatch outbox | Spec 186 `worker_jobs`, `worker_job_events`, and existing outbox contracts | reference IDs and append typed evidence through existing contracts |
| Runner process/session continuity | Spec 278 | require recovery to re-check current `worker_jobs` authority before continuing |
| User-facing task/run projection | Spec 226 integration surface; proposed Spec 277 presentation contract | require display of canonical revision, partial state, and pending proof |
| Canonical app identity, package, and immutable released version | Spec 261 SPAAS Application/Application Version and Application Registry contract | require stable source/version identity in handoffs |
| Verification profile, resource admission and obligation status | Spec 224 / Spec 186 contracts and existing verification policy | require results bound to a revision and preserve pending/blocked distinctions |
| Provider/harness session | owning provider adapter / Spec 224 handoff contract | treat as an execution context only, never as the durable work owner |

The unresolved universal Work/Goal identity MUST be mapped to an existing canonical owner during implementation. The application package/version contract is owned by Spec 261; if its registry persistence is absent for an authoring flow, implementation MUST extend that owner instead of adding a parallel Mini App/version store. Implementers MUST NOT introduce a second ledger to satisfy this Spec. Until the Work/Goal mapping is approved, records MUST correlate through existing stable run/job/version IDs and preserve tenant, actor, and idempotency boundaries.

Historical proposals that conflict with currently implemented ownership are audit inputs only. In particular, this Spec MUST NOT revive systems prohibited by repository policy or route new work through them.

## 3. Continuous checkpoint requirements

1. A coherent, valuable, safe subset MUST be canonicalized at the earliest practical checkpoint, without waiting for task completion, full-repository verification, UAT, provider validation, release, or deployment.
2. A checkpoint is eligible only after a bounded fast gate confirms: no changed-scope syntax/compile failure, unresolved conflict, damaged patch, or accidental secret.
3. The exact candidate revision and changed scope MUST be recorded. Promotion uses the repository's normal non-force path and honors branch protection.
4. Heavy checks MUST run after the checkpoint is reachable from the canonical source. Each check is bound to that revision and recorded as `PASS`, `FAIL`, `PENDING`, or `NOT_RUN`; resource exhaustion is not a code failure.
5. A failing post-integration check creates a repair against current canonical state. The repair is a new checkpoint; previously integrated history remains visible.
6. Partial behavior MUST use an existing containment boundary where required. Checkpointing MUST NOT enable production behavior or execute production migrations as a side effect.
7. A later checkpoint MAY stale earlier verification evidence. The obligation ledger MUST say which revision each result covers.

## 4. Candidate discovery and ownership

The integration controller MUST inventory local branches, remote task branches, dirty and clean worktrees (including detached worktrees), and recovery/quarantine refs. Uncommitted worktree changes MUST be listed independently from each worktree's committed branch tip.

Readiness markers and commit trailers are optional legacy evidence. Their absence MUST NOT exclude a candidate. Candidate classification MUST use actual ancestry, changed paths, worktree state, evidence, and owner/work ID. At minimum, each candidate is classified as:

`ALREADY_IN_CANONICAL | SAFE_PARTIAL_TO_INTEGRATE | SAFE_COMPLETE_TO_INTEGRATE | NEEDS_RECONCILIATION | FAST_GATE_BLOCKED | DUPLICATE/SUPERSEDED | UNKNOWN_OWNER`.

Dirty state is never an automatic merge or discard instruction. The controller MUST preserve exact valuable changes and stage only owned paths. A candidate with unknown ownership, secret-bearing material, unresolved conflict, or failed fast gate remains durably preserved with a named owner and next action. Branches and worktrees MUST NOT be deleted until valuable contents are proven canonical or separately preserved.

The discovery report MUST identify candidate ref/worktree, committed tip, relation to canonical state, dirty paths/state, owner/work ID if known, marker status, classification, and next action. It MUST also state any inventory surfaces that could not be inspected.

## 5. Durable checkpoint and handoff contract

Each canonical checkpoint MUST have a discoverable handoff correlated to its existing work/run/job/version owner. The handoff MUST include:

- stable work/run/job/version ID(s), tenant and authorized owner;
- `PARTIAL` or `IMPLEMENTATION_COMPLETE` state;
- source ref/worktree and exact integrated canonical revision, or the canonical non-Git version;
- completed scope and remaining scope;
- changed artifact/path summary and containment state for unfinished behavior;
- fast-gate evidence, post-integration checks and the exact revision each covers;
- known failures, pending/resource-blocked checks, and stale evidence;
- next action, named owner, and durable recovery reference.

For implementation work, an integration report, canonical task/run record, or versioned repository handoff may supply these fields, provided the next session can discover them without the original chat or provider session. For non-Git authoring, the owning version service MUST preserve accepted progress and the same handoff fields.

The handoff is a projection/reference, not a competing authority. `worker_jobs` remains execution truth; Spec 224 remains development lifecycle authority; provider sessions remain resumable execution context only. No new queue, ledger, approval store, or read model may be introduced solely for this contract.

## 6. Recovery and duplicate-request behavior

On resume or duplicate request, the controller MUST load the latest canonical revision and durable handoff before generating or applying new work. It MUST compare requested scope, completed scope, open gaps, and current validation obligations, then continue from the recorded next action. It MUST NOT rebuild already completed canonical work merely because the original session ended.

Before resuming a process/session, the execution owner MUST revalidate job status, lease/fencing epoch, authorization, cancellation, approval, and current checkpoint compatibility. A provider-reported `completed` state is not sufficient to mark the parent work complete.

## 7. Task Control visibility

Task Control MUST project, from canonical sources:

- canonical revision/version and whether the work is partial or implementation-complete;
- completed scope, remaining scope, and next action;
- checks passed, failed, pending, not run, resource blocked, or stale, each bound to a revision;
- work awaiting an authorized human action;
- durable handoff/recovery availability.

The UI MUST distinguish execution-session state from parent work state. A provider or Runner process may complete while the parent task remains partial or validation-pending. UI projections MUST NOT create a second task lifecycle authority.

## 8. Compatibility and migration

Implementation MUST first inventory existing state and runtime callers read-only. Historical readiness markers remain readable as metadata, but new correctness and discovery MUST NOT depend on them. Existing `worker_jobs`, outbox, Spec 224 run records, Spec 278 session records, approval state, and app versions MUST remain readable during rollout.

### 8.1 Spec 224 promotion compatibility

Spec 224's rule that cancellation MUST NOT merge a partial candidate remains in force for automatic run finalization and release/promotion-grade candidate semantics. It does not prohibit a separate repository integration controller from promoting a coherent safe subset to `origin/main` after the fast gate. These are separate operations:

| Operation | Allowed for partial work? | Required authority/evidence |
|---|---|---|
| Canonical development checkpoint to `origin/main` | Yes, for a safe bounded subset | Task-owned diff, fast gate, authorized normal non-force GitHub path, durable handoff |
| Mark DevelopmentRun/parent task complete | No, until its own completion contract passes | Spec 224 finality/verification contract |
| Release or production promotion | No, unless its stronger candidate/final verification gates pass | Existing Spec 224/219 and deployment/release authority |
| Automatic Git integration caused solely by cancellation or provider completion | No | Separate explicit integration decision required |

Thus a cancelled or partial DevelopmentRun MUST NOT silently merge its entire candidate. The repository controller MAY independently promote only the fast-gate-passing safe subset, while retaining the parent run as partial and linking the integrated SHA to its handoff. Existing Spec 224 PR/freshness/merge-queue protections remain applicable wherever repository policy requires them.

Any schema or projection change requires an expand/compatibility/backfill/cutover/contract plan, owner approval, rollback notes, and preservation of old readers for the defined replay/retention interval. No destructive cleanup is part of checkpointing. Existing rows MUST NOT be rewritten solely to manufacture new handoff status.

Spec 261's package-level Application/Application Version semantics remain canonical for generated Mini Apps and other AI applications. Accepted or released versions MUST be immutable; a mutable authoring draft is separate from publish/release and MUST be persisted through the Spec 261 registry owner when that persistence is implemented. Spec 266 owns knowledge/evidence semantics; any accepted portable knowledge-bundle revision contract remains subordinate content state and MUST NOT replace the parent application version.

## 9. Acceptance scenarios

| ID | Scenario | Required outcome |
|---|---|---|
| A | Multiple sessions stop at quota boundaries | Each safe subset is canonical; each remainder has owner, scope, and next action. |
| B | Heavy verification has no resource slot | Safe checkpoint integrates; heavy obligation is pending/not run against that SHA. |
| C | Backend slice is safe while UI is incomplete | Backend integrates independently; unsafe UI remainder stays preserved and handed off. |
| D | Valuable branch has no readiness marker | Discovery finds and classifies it from refs, ancestry, diff, and evidence. |
| E | Dirty worktree contains valuable changes | Changes remain intact; owned safe subset may integrate; rest has a durable recovery path. |
| F | Two developers change overlapping paths | Promotion reconciles latest canonical state; conflict is explicit and no change is silently overwritten. |
| G | User repeats a request after partial implementation | Resume discovers canonical checkpoint/handoff and continues only the remainder. |
| H | Mini App authoring stops mid-session | Accepted draft/version survives; public publish remains separate. |
| I | Provider reports `completed` but verification is pending | Parent work remains partial/pending; UI does not call it fully complete. |
| J | Controller/restart recovery | State is reconstructed from canonical source plus durable handoff, without the original chat. |

## 10. Verification requirements

Tests MUST cover marker-free branch discovery, partial checkpoint handoff, dirty-worktree preservation, fast-gate-blocked preservation, exact revision binding for deferred checks, duplicate-request continuation, stale job/session fencing, Task Control partial/pending projection, Mini App draft recovery, and provider-complete/parent-partial behavior.

Verification reports MUST separate source correctness, focused tests, heavy checks, provider evidence, deployment, and runtime proof. Passing a Git integration gate MUST NOT be reported as full validation or production readiness.

## 11. Rollout order

1. Publish this additive contract and authority/implementation-state matrix.
2. Update repository Skills and policy; remove marker dependency from discovery while preserving legacy marker reads.
3. Audit and align Spec 224 with existing `worker_jobs`/outbox and verification resource contracts.
4. Audit Spec 278 session recovery, Spec 277 Task Control projection, and the declared App/version owner for compatibility.
5. Inventory and reconcile stranded refs, worktrees, handoffs, and durable work records without deleting unclassified data.
6. Add missing Task Control visibility and App/Mini App/workflow version recovery through existing authorities.
7. Run the acceptance matrix by integrated revision; keep release and deployment as separate gates.
