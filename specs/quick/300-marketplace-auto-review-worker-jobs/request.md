# Request

Move Marketplace Auto Review's LLM and long-running work onto the canonical `worker_jobs` control plane so requests persist work and return promptly, executions are tenant-scoped/idempotent, and users can see queue/progress/failure state. The current Creative QC path writes to the feature-specific `marketplace_auto_review_outbox_jobs` table and may remain queued without a canonical worker job.

## Constraints and assumptions

- Scope is the Marketplace Auto Review workflow shown in the user's screenshots, including staged story creation/redraft, Creative QC, prompt authoring, and long-running generation/reconciliation that this workflow initiates.
- Use the existing `worker_jobs` plus dispatch outbox, executor registry, lease heartbeat, retry and tenant controls. Do not add another worker or queue system.
- Keep product/story state and credit/checkpoint policy in the existing Marketplace Auto Review domain services.
- Preserve legacy queued work through a safe bridge or recovery path; do not silently strand existing run records.
- Development deployment target is `legacy-debian-dev` on `smartaihub.app`, already authorized by the user's prior deploy request.
- Preserve unrelated dirty workspace paths. Do not run the prohibited local full typecheck.

## Acceptance

- A QC request creates/links a canonical `worker_jobs` row before LLM work starts; queued QC is visible and recoverable.
- Other LLM/long-running operations in this Auto Review flow use the same canonical worker lifecycle rather than request-bound execution or a feature-local executor queue.
- Duplicate submissions remain idempotent; work is tenant/user bound; failures become visible and retryable; no media spend bypasses existing approval checkpoints.
- Focused tests pass, change is integrated to `origin/main`, and the configured Debian development site is deployed and health-checked.
