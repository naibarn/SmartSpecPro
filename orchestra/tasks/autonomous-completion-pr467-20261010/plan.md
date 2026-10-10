# Work Plan — PR #467 Follow-on

## Objective

Implement one safe vertical slice of the audit-first architecture: expose a truthful, read-only signal when canonical pending/queued jobs coexist with fresh online worker capacity. Preserve all other session and Git ownership.

## Scope

- Owned implementation: `apps/web/server/services/jobControlPlaneMonitor.ts`.
- Owned verification: `apps/web/server/services/__tests__/jobControlPlaneMonitor.test.ts`.
- Task evidence: this directory only.
- No new scheduler, queue, approval service, schema, job state, production execution, or multi-machine default.
- Do not edit the six canonical Specs or generated handoffs while their current authority/handoffs and active related worktrees are unresolved; record the exact next reconciliation action instead.

## Requirement ledger

| Requirement | Authority | Status | Evidence | Next action |
|---|---|---|---|---|
| Report pending/queued work with fresh online workers and known free aggregate capacity through the admin summary API. | PR #467 §4; SPEC-267 canonical job/capacity ownership | Implemented; service test passed, route contract test added and awaits rerun | Service monitor and workerJobs admin summary tests | Rerun both focused files before treating this candidate as verified; CI/review/merge remain pending. |
| Suppress signal if no backlog, no fresh worker, unknown capacity, or no free slots. | PR #467 §§3–4; truthful status / no false completion | Implemented; boundary tests passed | Same focused Vitest run | Preserve additive API field; confirm CI on PR SHA. |
| Do not duplicate queue or scheduler authority. | PR #467 §§2,9; SPEC-267 | Pass by design | Existing `worker_jobs`, outbox and monitor reused; no schema or authority changes | Continue only after current spec ownership reconciles. |
| Align all six canonical Specs, resolve execution-fabric spec identity, and implement full GitHub lifecycle. | PR #467 §§2,5,7,10 | Open / partial | `audit-and-lifecycle-report.md`; current canonical handoffs | Follow up without editing active-owner paths; reconcile SPEC-077 boundary and create separate bounded WUs. |

## Checkpoint

The code slice is isolated and can be reviewed as an implementation PR. It does not close the architecture outcome. CI/review, ancestry, automatic Git repair/merge/cleanup, multi-machine recovery and benchmark remain separate obligations.
