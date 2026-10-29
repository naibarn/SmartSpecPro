# Section 02 — Canonical dispatch

- **Requirement IDs:** R3, R4
- **Objective:** Add Copilot to existing provider admission and dispatch without creating a new lifecycle authority.
- **Owned scope:** Agent provider contract, runtime admission, external-agent dispatcher and matching focused tests.
- **Prerequisites:** Section 01 fixes the adapter ID and the Runner capability/model contract.
- **Completion predicate:** command carries existing job/attempt/lease/fence/idempotency/authorization/budget/workspace/model bindings; retries stay idempotent; stale or unsupported commands fail closed; Codex/Claude behavior is preserved.
- **Verification:** focused Vitest tests for dispatcher, admission, command validation and existing provider regressions.
- **Expected evidence:** dispatch payload and security binding assertions plus passing focused regressions.
- **Fallback:** reject unsupported Copilot selection rather than weakening existing checks.
- **Blocker challenge:** keep changes additive in provider mapping and allowlists; preserve canonical `worker_jobs`, outbox, lease and approval services.
- **Waiting/reactivation:** only gated on the adapter contract from section 01.
