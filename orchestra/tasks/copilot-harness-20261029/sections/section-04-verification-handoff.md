# Section 04 — Verification and handoff

- **Requirement IDs:** R6, R7
- **Objective:** Run requested offline regression tests and preserve honest delivery evidence.
- **Owned scope:** focused test files and this task's implementation handoff only.
- **Prerequisites:** Sections 01–03.
- **Completion predicate:** changed Rust/web tests pass; existing provider regressions pass; diff contains no secrets or unconditional tool approval; live E2E state and SPEC governance status are evidence-backed.
- **Verification:** focused Cargo and Vitest commands, owned diff review, no repository-wide typecheck.
- **Expected evidence:** revision, commands/results, Copilot CLI/auth availability, and live-test blocker if credentials are absent.
- **Fallback:** complete offline coverage and state live E2E as blocked; never fabricate a successful run.
- **Blocker challenge:** identify exact credential/runtime prerequisite and a rerunnable command; continue all independent validation.
- **Waiting/reactivation:** live E2E can reactivate when authorized Copilot credentials and a compatible Runner are available.
