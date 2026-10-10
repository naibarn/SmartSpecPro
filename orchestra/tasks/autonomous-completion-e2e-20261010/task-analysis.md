# Autonomous Completion E2E task analysis

Baseline refreshed from `origin/main` at `056922d71912f5bededd06d173a9e57580a9fcb9`; PR #528–530 are ancestors. The task worktree is isolated at `/home/dev/worktrees/autonomous-completion-e2e-20261010`; dirty primary and other sessions are excluded.

## Smallest safe implementation slice
1. Bound workspace authority discovery and return explicit partial/unavailable evidence. Existing registered task workspaces may be observed; foreign/unregistered/active worktrees are never mutated. No clean-primary prerequisite.
2. Repair concrete GitHub adapter and retirement preflight defects; revalidate exact PR head and existing policy before side effects.
3. Add targeted tests for timeout/partial resolver, adapter shape, cleanup dry-run order. Use existing worker control plane and existing tests; do not add a parallel scheduler.
4. Use an owned native PostgreSQL cluster only if current-schema setup can be safely bounded. No shared DB.

## Acceptance evidence
Targeted tests and syntax checks; exact target-branch ancestry; live repository policy and required checks before any merge; post-merge SHA verification; ownership-gated cleanup; durable handoff. No live merge or CI pass claim without GitHub evidence.
