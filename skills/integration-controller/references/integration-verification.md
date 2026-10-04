# Resource-aware integration verification

## Verification lanes

### FAST
Promote with bounded, task-local evidence. Never require a full monorepo typecheck/build merely because unrelated long-running sessions exist.

### TARGETED
Run directly affected tests/checks with constrained parallelism where supported. Escalate if shared/global surfaces are touched.

### HEAVY
Requires a serialized expensive gate before main promotion. The implementation session may already be closed and its branch safely pushed.

## Heavy gate placement

Preferred:

1. external CI/dedicated runner;
2. isolated verification machine/container;
3. shared host only under the heavy-resource lease and memory guard.

## Promotion behavior

A HEAVY_PENDING branch does not block unrelated FAST/TARGETED branches. Keep it queued and continue.

## Main health vs branch correctness

Do not conflate repository-wide historical debt with a low-risk branch regression. Likewise, do not use a scoped pass to waive a genuinely global/high-risk change.

## Overlap escalation

Escalate to HEAVY when a branch touches dependency manifests/lockfiles, root compiler/build config, schema/migrations, auth/security/billing/deployment, or broad shared contracts.

## Resource continuity

The integration process must preserve the ability of unrelated Codex/Claude sessions to continue running. A verification strategy that routinely OOMs or stalls the host is itself unsafe.

## Marker integrity

A readiness marker is accepted only when it is the single terminal lifecycle marker for the session branch, its parent is the declared implementation tip, its verified baseline is an ancestor of that implementation, and that baseline still belongs to current main history. Dirty associated session worktrees block automatic promotion even if the remote marker is otherwise valid.
