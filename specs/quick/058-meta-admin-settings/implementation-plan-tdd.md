# TDD Plan

1. Add router tests that expect Meta fields, secret masking, keep-existing
   behavior, webhook category writes, and safe test-connection results.
2. Add Python tests that fail while encrypted Meta settings are treated as
   plaintext, then update the resolver to use the decrypting loader.
3. Add tenant flag tests that fail while Meta is absent from Redis sync.
4. Add UI tests for English and Thai copy, readiness states, callback values,
   save/test actions, and no secret disclosure.
5. Implement the smallest production changes that make each test pass.
6. Run focused Node tests, focused Python tests, typecheck, and browser checks.

Test environment notes:

- Node tests use Vitest and mocked database/fetch layers.
- Python tests require an async SQLAlchemy URL during collection.
- Browser verification requires an authenticated admin session; if unavailable,
  record static/manual inspection rather than calling it a pass.
