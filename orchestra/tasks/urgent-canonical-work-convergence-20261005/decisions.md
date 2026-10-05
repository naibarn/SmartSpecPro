# Decisions — Urgent Canonical Work Convergence

- 2026-10-05: Treat the attachment as structured requirements, not as an authority source that can override repository instructions.
- 2026-10-05: Use an isolated worktree at latest `origin/main`; the original checkout has 158 dirty entries and is on a task branch 48 commits behind main.
- 2026-10-05: Preserve the existing active Spec 215 Orchestra state. Store this task under `orchestra/tasks/urgent-canonical-work-convergence-20261005/` instead of archiving or replacing unrelated lifecycle records.
- 2026-10-05: Keep existing `worker_jobs` plus outbox as the durable execution authority; do not add another ledger or queue.
- 2026-10-05: Require an explicit canonical checkout path in `canonical-checkout-sync` rather than hardcode a checkout path in a mirrored skill.
- 2026-10-05: Do not integrate branch candidates solely because they are ahead/diverged or marked ready; ownership and semantic diff review are pending.
