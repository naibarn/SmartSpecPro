# Decision Log

## Planning depth: standard quick plan

The work is an architecture integration within one product domain. It reuses the existing worker control plane and Marketplace Auto Review's durable run state; it does not create a new job runtime or require a new database schema. Three implementation sections are sufficient. Promote to full deep-plan only if code research finds the current flow crosses another independently owned runtime or needs a new lifecycle/schema.

## Decisions

- Treat `worker_jobs` as the sole execution lifecycle for new LLM/long-running Auto Review work; keep run metadata as the domain progress projection.
- Keep request handlers limited to validation, durable state/operation admission and returning a pollable run/job reference.
- Use stable operation-scoped idempotency and existing worker retry/lease controls. Do not add an in-process LLM fallback when canonical admission fails.
- Migrate or reconcile existing feature-local queued rows before retiring their executor path; leave historical terminal rows untouched.
- Limit scope to Marketplace Auto Review and its invoked work, not unrelated LLM features elsewhere in the app.
