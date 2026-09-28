# Section 01 Code Review

## Scope

Reviewed the new shared visual/news contracts, deterministic fingerprint/coverage/segment/B-roll validators, and focused tests.

## Findings

- No blocking correctness issue found.
- Provider/signed URLs are excluded from fingerprint input by contract shape; later snapshot persistence must continue this rule.
- Segment validation correctly rejects missing/reversed video bounds and time bounds on still media.
- AI/news evidence separation is represented as separate origin/evidence fields and tested at the contract layer.

## Verification

- Focused Vitest: 2 files, 12 tests passed.
- apps/web typecheck: passed.

## Auto-fixes

The initial test review found two test-shape issues (coverage helper was called with a snapshot instead of its required arrays; stale revision used invalid zero). Tests were corrected to assert the actual contract. No production code change was required.

## Residual integration risk

Sections 02–08 must preserve the shared field names and must not introduce a second fingerprint or evidence vocabulary.
