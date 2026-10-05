---
name: development-lifecycle
description: Shared project-neutral lifecycle contract for durable work, checkpoints, canonical state, dependency waits, automatic resume, and handoffs.
---

# Universal Development Lifecycle

This contract is the shared semantic source for lifecycle skills and orchestration. Product-specific services may implement it on their existing durable control plane; do not create a competing queue or work ledger.

## Work and canonical state

- A `WorkUnit` owns objective, source metadata, progress, dependencies, validation, artifacts, and durable handoff. A session/provider/runner owns only execution context and may disappear or change.
- Project and repository identity are required. Source types (spec, issue, prompt, bug, feature, maintenance, migration, refactor, generated) are metadata, not lifecycle architecture keys.
- `canonical_ref` is supplied by repository/project policy. `origin/main` is only a repository default when policy selects it; never hard-code it in reusable lifecycle logic.
- Canonical repository/project state is the shared engineering truth. Task completion is not required to integrate a safe, valuable checkpoint.

## Shared states

Use `DISCOVERING`, `WORKING`, `CHECKPOINT_READY`, `CANONICALIZING`, `PARTIAL_INTEGRATED`, `CONTINUATION_REQUIRED`, `WAITING_DEPENDENCY`, `WAITING_EXTERNAL`, `WAITING_RESOURCE`, `WAITING_CAPABILITY`, `WAITING_APPROVAL`, `WAITING_CANONICAL_ARTIFACT`, `IMPLEMENTATION_COMPLETE`, `VALIDATION_PENDING`, `VALIDATING`, `REPAIR_REQUIRED`, `VERIFIED`, `RELEASE_READY`, `DEPLOYING`, `DEPLOYED`, `BLOCKED_RECOVERABLE`, `FAILED_TERMINAL`, and `CANCELLED` consistently. `PARTIAL_INTEGRATED` and valid `WAITING_*` states are non-terminal.

These states remain distinct: implemented is a source change; integrated means
present on the configured canonical ref; verified means required evidence
passes; deployed means the exact artifact is running; accepted means required
acceptance evidence exists; complete means every applicable outcome criterion
is satisfied. A later lifecycle state requires evidence for that state.

## Outcome and requirement ownership

A WorkUnit owns the user's outcome through closure, not merely the assigned
implementation task. For requirement-driven work, keep a machine-readable ledger
with `requirement_id`, `authority_source`, `applicability`,
`implementation_status`, `verification_method`, `evidence`, `blocker`,
`next_action`, and `final_state`. Final states are `PASS`, `FAIL`,
`BLOCKED_TRUE_EXTERNAL`, and `NOT_APPLICABLE`; `PARTIAL` is an intermediate
status with a required next action. Every `PASS` links fresh evidence.

## Planning and implementation closure contract

Planners first reconcile authoritative requirements with current code, tests, and repository decisions. Record already-satisfied, unresolved, and not-applicable requirements; avoid re-planning proven implementation. Define the Definition of Done, per-requirement closure and evidence strategies, acceptance/deployment obligations, and true external authority boundaries. Every implementation section/workunit maps to requirement IDs, objective, owned paths/scope, prerequisites, completion predicate, verification method, expected evidence, fallback/substitution routes, blocker challenge strategy, and—when waiting is needed—satisfaction and reactivation predicates.

Interviews infer facts from source/spec/tests first. Choose safe reversible defaults and run bounded experiments. Ask only for genuine product ambiguity, accepted-risk security decisions, or verified external authority. Recoverable destructive operations proceed through a verified backup/rollback plan; unrecoverable external destruction remains a true blocker. Decomposition/spec/section creation is a planning checkpoint, not project outcome completion.

Implementation records commits as checkpoints only. Finalization reconciles the full requirement ledger, skipped/stalled work, task-caused regressions, fresh evidence, canonical integration, and required acceptance/deployment. Any unresolved applicable requirement keeps the outcome in `VALIDATION_PENDING` and routes to another closure cycle; only the shared policy kernel may classify the outcome `COMPLETE`.

## Blocker challenge and progress

A blocker triggers a new closure analysis, not an automatic stop. Record root
cause separately from symptom and assess necessity, direct repair, compatible
substitution, reduction/downgrade/isolation, evidence generation, backup and
recovery, alternate execution path, project-local policy repair, and independent
work. Classify failures as task regression, baseline, environment, resource,
tool capability, external dependency, policy, product ambiguity, or security;
apply the matching recovery. Only a genuine external authority boundary,
unrecoverable destructive operation, unresolved product choice, mandatory legal
approval without substitute, platform dead end, or critical security finding
can be terminal after alternatives are evidenced as unavailable.

Each closure cycle records a measurable delta in unresolved requirements,
blocker state, implementation/evidence, verification, or canonical checkpoint.
On the second appearance of the same blocker, challenge it fully and list at
least two alternatives where feasible. Three repeats without delta become
`STALLED_STRATEGY`; prohibit the failed strategy and route to root-cause,
architecture, or policy review. Do not rerun unchanged checks as a substitute
for information gain.

## Checkpoint and handoff

At a meaningful safe checkpoint, pause/end/handoff, quota/context risk, disconnect, preemption, placement change, controller restart, or planned interval:

1. Inspect the delta and isolate the valuable safe subset from unfinished work.
2. Refresh configured canonical state, reconcile, and run the bounded fast integration gate.
3. Integrate the safe subset through the repository's protected normal path; do not wait for heavy validation or task completion.
4. Persist canonical revision, completed and remaining scope, pending validation, resume point, next action/owner, and wake condition in machine-readable handoff state.
5. Continue execution or release the executor. Keep heavy validation tied to the integrated revision.

Never strand valuable progress only in chat, agent memory, a session, dirty checkout, temporary branch, or temporary storage when it can be safely canonicalized. Preserve unsafe remainder durably with a reason and recovery location.

## Central build source

After parallel session changes are integrated, build from the latest configured canonical ref, never from whichever feature branch or session worktree launched the command. Pin the build to the fetched canonical SHA, record that SHA with the result, and check the canonical ref again after the build; if it advanced, mark that build stale and rebuild the newer tip. Source verification proves which code was selected; only a successful build command proves the build passed. Serialize builds using the shared source root on the same host; cross-host build scheduling belongs to the existing `worker_jobs` plus outbox control plane. Update the primary checkout to the built SHA only when it is clean and already on the configured canonical branch. If it is dirty or on another branch, preserve it unchanged, report the sync blocker, and keep the canonical build workspace/result path visible.

## Dependency waits and reactivation

Wait on a verifiable predicate, not a person, session, branch, or spec identifier. A dependency records consumer work, project scope, requirement type/locator/minimum revision, predicate/evidence source, optional producer metadata, event types, resume point, and fallback routes.

Before waiting, minimize the dependency: check the immediate next step, independent work, existing equivalent canonical output, alternate capability/provider/route, and safe checkpoint opportunities. Continue independent scopes while waiting.

A `WAITING_*` state is valid only with a durable dependency identity, satisfaction predicate, evidence source, registered predicate adapter, watcher, polling/reconciliation fallback, resume point, next action, and continuation owner. If no adapter can verify evidence and recheck its authority, keep the work runnable through another route or mark the wait unavailable; do not register a blind wait. Timeouts do not become terminal by themselves. On evidence, re-evaluate the predicate against its authority, record durable evidence, and enqueue an idempotent continuation through the existing job/outbox control plane. Lost notifications are repaired by periodic reconciliation. The original executor is not required to remain alive. Invalid evidence or invalidated requirements must not resume work.

Before entering a wait, search for ready independent WorkUnits and continue
them. Persist exact attempted and prohibited strategies, evidence freshness,
waiting/reactivation predicates, and the next ready action. Resume reconciles
canonical state first, then performs that next action without repeating closed
investigation. Missing owners, another session's unrelated dirty state, and
resource contention do not by themselves block the WorkUnit.

## Verification and status

The fast integration gate checks changed-scope syntax/compile, conflicts, patch integrity, and accidental secrets. Full builds, repository-wide typechecks, heavy tests, UAT, provider checks, and production/deployment checks are post-integration obligations and must cite the exact revision. Resource blocks are pending/queued resource outcomes, not code failures.

Report each milestone separately. Use `UNIVERSAL_DEVELOPMENT_LIFECYCLE_PARTIAL_INTEGRATED` while required runtime/caller integration remains. `IMPLEMENTATION_COMPLETE` means the requested source scope is implemented and canonicalized; `VERIFIED` requires fresh required verification evidence; `DEPLOYED` requires runtime evidence for the exact artifact; acceptance requires its own evidence. Overall `COMPLETE` is allowed only when every criterion in the outcome's Definition of Done is met, including acceptance/deployment when required.
