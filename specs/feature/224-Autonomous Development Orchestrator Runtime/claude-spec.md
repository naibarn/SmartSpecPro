# Developer Autonomous Mode Amendment (Task Brief)

## Objective

Within an authenticated developer's existing repository/project permissions, make ordinary reversible local development continue automatically through isolated workspace creation, registered ownership, bounded implementation, scoped verification, repair, restart/resume, and useful delivery. Keep protected production, tenant-crossing, destructive, release, and deployment operations on their existing separate authorization paths.

## Constraints

- Canonical base: `2a762faf2d1f66b46eaa5027be6047c5f0730e9c`.
- Preserve the shared dirty checkout; use the current registered task worktree.
- Reuse SPEC-224 DevelopmentRun/WorkUnit, SPEC-226 control surfaces, `worker_jobs`/outbox, workspace registry, Agents SDK/Codex subscription adapter, Task Control, and existing Browser UAT tooling.
- Local development must not require a Protected Runner grant. It still requires authenticated developer identity, repository/project/path scope, an isolated workspace and a bounded budget.
- Never turn chat text, a branch name, or unauthenticated CLI arguments into authority. Do not expose API keys or create provider fallbacks.
- Keep CI gates and repository protection intact. PR #944 repair must be a new task/branch based on its candidate SHA, never the original branch.

## Existing boundaries and initial decisions

- SPEC-224 risk classes already distinguish R1 safe dev execution and R2 reversible isolated source writes from external/production risks.
- SPEC-226's ordinary run creation persists a DevelopmentRun but leaves dispatch pending authorization; the current authorization service is Runner/approval/budget-oriented.
- The workspace registry already creates isolated task worktrees, but its helper does not issue an owner lease for newly created worktrees and has no atomic owner reclaim/fencing operation.
- The existing Agents SDK subscription WorkUnit runner has durable run/tool receipts, test/repair/review and browser UAT support, but validates only canonical SPEC WorkUnits and is not a general repository Runner.
- First increment: add the narrow local-development execution authorization/workspace lifecycle to existing contracts and expose no protected operation through it. Preserve API/Runner paths unchanged.

## Completion evidence

One disposable local Mini-App WorkUnit must bind an authenticated developer, exact repository/source, task, registered workspace, active lease/fence, allowed write set and budget; demonstrate implement → deterministic failure → repair → retest → restart/resume → browser UAT → final receipt. Requested model is not effective-model evidence without runtime identity. SPEC-224 protected Runner acceptance remains separate.
