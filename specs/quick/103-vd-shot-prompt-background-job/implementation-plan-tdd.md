# TDD Plan

1. Add failing service tests for enqueue, active-shot dedupe, distinct-shot
   independence, exact idempotency, success/failure transitions, stale-pointer
   healing, and queue-dispatch failure.
2. Add router tests proving public submit does not call the LLM inline and
   status cannot cross tenant/user/episode/shot boundaries.
3. Move existing prompt-generation assertions to the exported executor so the
   old business behavior remains covered.
4. Add client-flow tests for submit -> poll -> image admission, terminal
   failure -> no image, and the AI-edit/repair consumers waiting for completion.
5. Add startup/shutdown wiring assertions.
6. Implement the smallest code needed to turn each focused test green, then run
   the complete affected prompt/image test set and workspace typecheck.

## Test environment notes

- Inject a fake Redis adapter and enqueue function into service tests.
- Mock timers or use zero-delay poll configuration in client tests.
- Mock the exported executor at the queue boundary; retain current router
  fixtures for detailed prompt and JSONB behavior.
- Do not require a live Redis, provider, or paid LLM call.
