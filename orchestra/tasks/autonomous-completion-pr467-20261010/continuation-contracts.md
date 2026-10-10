# Continuation Wave Contracts — PR #471 / RFC #467

Dispatch mode: explicitly authorized parallel read-only audits. Agents do not edit files, push, merge, or delete refs/worktrees. The conductor owns all integration and implementation choices.

## Wave 1 ownership

| Workstream | Read scope | Write scope | Output |
|---|---|---|---|
| A — GitHub reconciliation | PR #471 metadata, `git log`/ancestry/compare, branch protection and workflow configuration | None | Exact ahead/behind/mergeability cause, task vs non-task commit/file inventory, safe normal-path repair recommendation |
| B — Existing scheduler/runtime | `apps/web/server/services/jobControlPlaneMonitor.ts`, worker job scheduler/dispatcher/reconciler, worker capability/lease/health/resource sources and focused tests | None | Existing end-to-end scheduling path, safe repair/reschedule hooks, reason taxonomy, duplicate/loop guards, missing evidence |
| C — Spec consolidation | Feature 077 registry/requirements and SPEC-224/226/267/269/276/277 canonical specs/handoffs | None | Confirmed ownership map, overlap decisions, existing autonomous completion contract and next WorkUnits; no speculative edits |

## Shared decisions and test boundary

- Canonical durable control plane remains `worker_jobs` + outbox; no new queue, scheduler, approval engine, or runtime.
- Only the conductor may resolve PR #471 ancestry or create a replacement candidate; original branch/PR remain preserved until a replacement is verified.
- Runtime changes must rely on authoritative per-job capability, worker-health, lease and resource evidence and must be idempotent under duplicate reconciliation.
- Proposed tests must use existing package commands and bounded fixtures; no repository-wide typecheck/build. Ten failure scenarios are a design target, not a claim until each has fresh passing evidence.
- Feature 077 owns distributed worker fabric unless the registry evidence proves a different canonical allocation. Existing spec writers/active task paths are not edited by this wave.
