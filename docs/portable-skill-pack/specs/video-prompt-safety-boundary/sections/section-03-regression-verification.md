# Section 03 — Regression and Verification

## Goal

Prove the fix with exact historical data and focused tests while preserving the
dirty worktree boundary.

## Files

- focused tests adjacent to the changed service/router/UI files
- no production data migration unless verification proves one is required

## Implementation

Add the exact episode-232 assistant response as a bounded fixture or deterministic
test input. Verify the current approved-frame data remains the source context and
that the resulting prompt is persisted. Add tests for billing-before/after
success, queue progression, idempotency, warning projection, and operational
failure. Run local Redis/PostgreSQL replay checks without mutating production
data.

Run focused Vitest commands, `git diff --check`, applicable type/lint checks, and
an authenticated browser flow if available. Inspect audit/job/credit rows after
the run. Explicitly report provider render, deployment, and production-DB
boundaries if they cannot be safely executed in this workspace.

## TDD

- Exact shot-1 fixture succeeds with warning or no warning, never policy failure.
- Real risky wording remains observable.
- Prompt persists, queue advances, and credits follow the successful contract.
- Browser displays prompt and warning independently.

## Acceptance

Focused proof passes and the final report distinguishes local code/data proof from
browser, provider, deployment, and production proof.
