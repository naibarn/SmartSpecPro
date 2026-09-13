# Feature 186 Interview Transcript

No additional stakeholder round was required. The user already confirmed the governing business decisions in the conversation: existing `worker_jobs` and `worker_job_events` are the shared foundation; `worker_jobs.id` is the canonical ID; queues/runtimes are adapters; migration is adapter-by-adapter; and the work should be driven through implementation and verification without a parallel jobs model.

## Confirmed decisions

### Q1 — What is the canonical persistence model?

**Answer:** Reuse the existing `worker_jobs` and `worker_job_events` tables. Extend them into a Unified Job Control Plane and do not create a duplicate generic `jobs` table.

### Q2 — Which identifier owns job identity?

**Answer:** `worker_jobs.id` is immutable and canonical for the whole system. BullMQ, Celery, Cloudflare Queues, Workflows, Containers, and Worker App IDs are references only.

### Q3 — How should migration be staged?

**Answer:** Migrate adapter-by-adapter and queue-family-by-queue-family. Existing producers may drain behind compatibility shims; no all-queue stop or destructive rewrite is allowed.

### Q4 — What should happen when transport state is unavailable?

**Answer:** PostgreSQL remains the source of truth for status, ownership, lease, attempts, retries, recovery, and audit history. Transport retry is subordinate to centralized business retry semantics.

## Auto-decisions

- Use the existing Drizzle/PostgreSQL and Vitest conventions in the web service.
- Use pytest and the existing migration-test conventions in Python.
- Keep the first database migration additive and retain legacy enum values/read aliases until all readers are migrated.
- Use dependency injection for repository/transport ports to make failure and concurrency behavior testable without live brokers.
- Do not run a data-mutating migration against the configured database in this implementation pass without a verified backup and explicit target confirmation; provide a dry-run/backfill tool and separate execution gate.
- Do not commit or stage unrelated dirty-worktree changes. The deep-implement commit-per-section workflow is adapted to this repository's dirty worktree discipline; implementation will be handed off uncommitted unless the user separately requests a commit.
