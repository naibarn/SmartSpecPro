# Spec 215 Decisions

1. Spec 214 is the sole node taxonomy/manifest owner; Feature 195/186 is the physical job, attempt, lease, fence, retry, outbox and transport owner; Spec 215 persists logical graph/run/node state only.
2. Every detached/background business operation, including each scheduled occurrence, must enter `worker_jobs` + outbox before dispatch/side effects. Daemons/listeners that only wait are infrastructure; their bounded business work is a job.
3. Use only the canonical Spec 215/Workflow Studio runtime path. Do not revive retired `/workflows` or extend the old sequential `workflowStudioJobExecutor` as the canonical engine.
4. Correct the stale R4 statement about missing Spec 251. Spec 251 exists and owns Creator recipe/profile inputs; Spec 215 retains execution semantics.
5. Missing owner runtime remains disabled/fail-closed. In particular, no production Retrieval Broker claim until Specs 229/220 prove the adapter and authorization gates.
6. Use additive migrations, preserve existing data, and require actual production inventory/rollback proof before cutover or destructive cleanup.
7. Preserve dirty worktree state; do not commit individual plan sections or stage unrelated changes. Keep implementation locally reviewable.
8. Verification uses focused Vitest/Python checks and structural validators; repository-wide typecheck is prohibited by root `AGENTS.md`.
