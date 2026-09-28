# Section 04 — regression and verification

## Ownership

Own focused tests and final diagnostics only; do not modify unrelated tests.

## Target files

- new lifecycle service tests
- touched credit/auth/Dashboard tests selected from the existing harness

## Acceptance

Focused Vitest coverage passes, `git diff --check` is clean, and TypeScript
errors are separated into touched-file failures versus pre-existing baseline
noise. No browser, payment-provider, deployment, or production-auth claim is
made without evidence.
