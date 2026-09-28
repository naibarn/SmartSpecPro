# Section 04 — Verification

## Ownership

Focused tests and read-only operational checks; no production mutation.

## Work

Run service, router, page-flow, prompt/cast, and lifecycle suites; then run the
web workspace typecheck. Inspect the relevant diff separately from unrelated
dirty changes.

## TDD expectations

Tests must fail against the old synchronous contract and pass only when submit,
polling, dedupe, and continuation are wired end to end.

## Acceptance checks

- Focused tests pass without network/provider calls.
- Typecheck passes or any pre-existing baseline failure is clearly separated.
- No schema, migration, dependency, deploy, restart, commit, or push occurs.

## Known risks

Static tests alone cannot prove Cloudflare behavior. Production smoke testing
requires a separate explicit deployment confirmation.
