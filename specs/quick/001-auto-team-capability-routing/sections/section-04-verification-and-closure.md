# Section 04: Verification And Closure

## Ownership

- Stabilization docs
- Test commands
- Final risk classification

## Goal

Stop the repeated audit/fix loop by recording objective verification results and only leaving explicit environment/manual-E2E limitations.

## Acceptance

- Typecheck passes.
- Targeted regression suite passes.
- Full test suite is attempted.
- In-scope failures are fixed.
- Unrelated failures are documented.
- Final response states exactly what passed, what remains, and whether code stabilization is complete.

## Verification

- `npm --prefix apps/web run check`
- targeted regression test command from `implementation-plan-tdd.md`
- `npm --prefix apps/web test`
