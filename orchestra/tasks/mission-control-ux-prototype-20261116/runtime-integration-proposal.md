# Runtime integration proposal

1. Keep the prototype route isolated and unlinked from primary navigation until the owner approves its UX. Do not replace Chat or the current Mission surface in this step.
2. Define a read-only Mission Control adapter in the existing SaaS Core boundary using canonical Mission, `worker_jobs`/TaskControl, Runner/Harness, event and artifact authorities. Reuse current DTOs where possible; do not add a second scheduler or execution ledger.
3. Build the fleet view from authorization-scoped projections. Tenant/workspace/project checks must occur before data is returned. Missing Agent, Harness, Runner, Run, Attempt, event freshness, or evidence stays unknown/unavailable.
4. Resolve selectable items to stable canonical Mission/Job/Run/Attempt IDs. Store selection in the URL and restore it only after the same authorization checks; tab hide/close remains distinct from job cancellation.
5. Implement Activity from ordered durable events and cursor replay; expose freshness and exact identity. Add terminal, diff, tests, browser, usage, receipts, artifacts, and verification only when their existing authority can supply them.
6. Keep filters and sort as client-side projection over authorized results, with pagination/server filtering if needed. UI navigation must never dispatch duplicate work.
7. Only expose decision or lifecycle actions after their runtime owner contract defines state preconditions, idempotency, authorization, and audit behavior. The concept's local button is not a runtime action.
8. After owner review, integrate the approved view behind a DEV flag, run authenticated tenant-isolation UAT, compare real screen captures, then separately propose primary-navigation promotion. SPEC-312 completion and production launch remain independent decisions.
