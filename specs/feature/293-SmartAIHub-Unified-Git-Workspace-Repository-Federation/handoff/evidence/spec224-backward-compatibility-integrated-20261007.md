# Spec-224 backward-compatibility investigation

- Baseline source: `12153b2268170c180d76bbfd9e137a121177b062` (before the test-only correction).
- Integrated correction: `761100ea1a0f3088a95afbd4677b98e405781b5c` (PR #113).
- Finding: the failing test reused the same idempotency key with a different payload while expecting a duplicate. `recordVerificationEvent` intentionally rejects mismatched event type/payload with `RUN_IDEMPOTENCY_CONFLICT`; no production persistence behavior was changed.
- Correction: replay the exact payload and timestamp for the duplicate assertion; separately assert that a changed payload with the same key conflicts.
- Validation on the corrected source: targeted event test — 1 passed; `spec224DevelopmentRunPersistence.test.ts` + `spec224FinalVerify.test.ts` — 26 passed.
- Classification: `STALE_TEST_ASSUMPTION`; focused Spec-224 backward-compatibility scope passes. This does not claim a repository-wide TypeScript/test pass.
