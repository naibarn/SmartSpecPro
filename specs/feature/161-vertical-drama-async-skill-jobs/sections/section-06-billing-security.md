# Section 06 — Billing, model identity and ownership

Route every new executor through canonical skill billing. Require a non-empty skill slug before provider invocation. Use deterministic call keys for retry settlement, but make an explicit new user run a new charge. Project the canonical skill name and exact model in credits history. Validate tenant/user/series/session on every submit and status/result read, reject stale/unbound pointers, and preserve immutable ledger/version data.

Tests must assert ledger metadata, no double billing on retry, new billing on deliberate rerun, selected model passthrough, and cross-tenant denial.
