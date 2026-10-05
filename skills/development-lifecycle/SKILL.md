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

## Checkpoint and handoff

At a meaningful safe checkpoint, pause/end/handoff, quota/context risk, disconnect, preemption, placement change, controller restart, or planned interval:

1. Inspect the delta and isolate the valuable safe subset from unfinished work.
2. Refresh configured canonical state, reconcile, and run the bounded fast integration gate.
3. Integrate the safe subset through the repository's protected normal path; do not wait for heavy validation or task completion.
4. Persist canonical revision, completed and remaining scope, pending validation, resume point, next action/owner, and wake condition in machine-readable handoff state.
5. Continue execution or release the executor. Keep heavy validation tied to the integrated revision.

Never strand valuable progress only in chat, agent memory, a session, dirty checkout, temporary branch, or temporary storage when it can be safely canonicalized. Preserve unsafe remainder durably with a reason and recovery location.

## Dependency waits and reactivation

Wait on a verifiable predicate, not a person, session, branch, or spec identifier. A dependency records consumer work, project scope, requirement type/locator/minimum revision, predicate/evidence source, optional producer metadata, event types, resume point, and fallback routes.

Before waiting, minimize the dependency: check the immediate next step, independent work, existing equivalent canonical output, alternate capability/provider/route, and safe checkpoint opportunities. Continue independent scopes while waiting.

A `WAITING_*` state is valid only with a durable dependency identity, satisfaction predicate, evidence source, registered watcher, polling/reconciliation fallback, resume point, next action, and continuation owner. Timeouts do not become terminal by themselves. On evidence, re-evaluate the predicate against its authority, record durable evidence, and enqueue an idempotent continuation through the existing job/outbox control plane. Lost notifications are repaired by periodic reconciliation. The original executor is not required to remain alive. Invalid evidence or invalidated requirements must not resume work.

## Verification and status

The fast integration gate checks changed-scope syntax/compile, conflicts, patch integrity, and accidental secrets. Full builds, repository-wide typechecks, heavy tests, UAT, provider checks, and production/deployment checks are post-integration obligations and must cite the exact revision. Resource blocks are pending/queued resource outcomes, not code failures.

Report partial integration honestly. Use `UNIVERSAL_DEVELOPMENT_LIFECYCLE_PARTIAL_INTEGRATED` while required runtime/caller integration or validation remains; reserve the implemented status for canonicalized implementation with acceptance evidence.
