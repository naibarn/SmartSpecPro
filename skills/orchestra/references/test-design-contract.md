# Test Design Contract

This contract is the conductor's pre-implementation gate for behavior changes.
It makes the test plan prove requirements rather than merely increase the
number of test files or lines.

## Required Matrix

Create `orchestra/test-design.md` for medium, large, project, high-risk, and
security-sensitive work. For small behavior changes, the same matrix may live
inside the task plan. Each row must have these fields:

| Field | Requirement |
|---|---|
| Requirement | Exact spec/issue requirement or invariant |
| Observable behavior | What a caller, user, persisted record, event, or boundary can observe |
| Test level | Unit, contract, integration, E2E, or manual/runtime proof |
| Test location | Exact test file, fixture, scenario, or evidence artifact |
| RED evidence | Failure or absence before the implementation |
| GREEN evidence | Passing command and decisive assertion after the implementation |
| Residual boundary | What the evidence does not prove and the required follow-up gate |

## Design Review Checklist

Before implementation, the conductor checks every matrix row for:

1. A behavior assertion rather than an implementation-detail assertion.
2. A negative, boundary, or failure case where the requirement can fail safely.
3. Authorization, tenant, ownership, or secret-handling coverage where relevant.
4. Persistence, queue/outbox, idempotency, and race coverage where relevant.
5. A deterministic external-boundary seam instead of a live provider dependency.
6. A browser, process, deployment, or provider proof requirement when unit tests
   cannot establish the claim.
7. A focused command that can run within the current resource budget.

## Rejection Rules

Reject or revise a test design when it:

- passes even if the requested behavior is removed
- only asserts that a mocked function was called
- mocks the system boundary that the requirement is about
- has no meaningful assertion or accepts any result
- covers only the happy path for a failure-prone behavior
- uses a broad full-suite command when a narrower proof exists
- claims browser, provider, production, or restart proof from a unit test

## Completion Rule

After review-driven fixes, mark affected evidence stale and rerun it. A test
design is complete only when all required rows have GREEN evidence or an
explicit residual-risk record describing the missing proof and why it could
not safely run.
