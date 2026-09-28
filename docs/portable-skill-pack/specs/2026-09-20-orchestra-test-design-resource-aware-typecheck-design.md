# Orchestra Test Design and Resource-Aware Verification

## Goal

Improve Orchestra's implementation quality without replacing the existing
`deep-plan -> deep-implement` pipeline, while preventing automatic full-repo
TypeScript checks from exhausting the development host and dropping SSH.

## Design

Orchestra keeps ownership of routing, state, quality gates, and final evidence.
Before implementation, the conductor must design tests from the requirements,
including the behavior, test level, failure proof, and residual-risk boundary.
The existing deep planning and implementation skills remain the execution path.

TypeScript verification becomes resource-aware. Full-repository typechecking is
never an automatic gate in this repository. The default path uses focused
tests and changed-scope checks. A full typecheck is allowed only after an
explicit user request, a memory preflight, serial workspace execution, and a
survivable execution wrapper such as CI or tmux. OOM, timeout, or lost-session
failures stop the gate without blind retries and are reported as unverified,
not passing.

## Test Design Contract

Every behavior-changing task produces a requirement-to-test matrix. Each row
maps a requirement to its observable behavior, test level, test file or
assertion, and the evidence needed to prove failure before the fix and success
after it. The matrix must consider happy path, invalid input, error/retry,
authorization or tenant isolation, state transitions, idempotency/concurrency,
external boundaries, persistence/recovery, and observability as applicable.

Reviewers must reject tests that only assert an internal call, mock away the
behavior under test, contain no meaningful assertion, cover only the happy
path for a failure-prone behavior, or cannot fail when the requirement is
broken.

## Typecheck Policy

- `npm run typecheck` and equivalent full-repository commands are explicit-only.
- The gate maps changed files to affected workspaces before selecting checks.
- Workspace checks run independently and serially when explicitly requested.
- The gate records memory budget, command, exit status, and log artifact.
- OOM, SSH/session loss, timeout, and resource refusal are terminal for that
  attempt; the same command is not retried automatically.
- A skipped or resource-blocked check is never reported as pass.
- The repository's package manager and documented project constraints override
  generic gate command defaults.

## Acceptance Criteria

1. A normal TypeScript change does not trigger root `turbo run typecheck`.
2. A spec-driven implementation records test design before code changes.
3. High-risk behavior includes negative, boundary, and integration evidence as
   appropriate.
4. Review-driven fixes invalidate and rerun affected test/typecheck gates.
5. Resource failures produce an explicit residual-risk report and no blind retry.
6. Existing deep-plan/deep-implement routing and unrelated worktree changes are
   preserved.
