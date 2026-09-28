# TDD Plan

## Red

1. Router: mock `getMcpMediaTask` to return an MCP task and assert global
   `fetch` is not called.
2. Scheduler: assert repeated calls before 15 seconds return no runnable task;
   assert an in-flight request blocks another; assert 429 extends cooldown.
3. Middleware: mock token verification and limiter inspection; assert keys for
   `sub`, `user_id`, and `openId`, with IP fallback for missing/invalid identity.
4. MCP timeout: assert an old image task fails before the existing 24-hour
   generic limit while video retains its longer window.

## Green

Implement the smallest server dispatch, scheduler helper/wiring, identity
normalizer, and media-type timeout changes required for the tests.

## Refactor

Remove duplicated claim-selection and time arithmetic where possible without
changing public interfaces.

## Regression

- Existing media router contract tests.
- Existing MCP reconciler suite.
- Media History module tests.
- Python middleware tests.
- Kie resolver and async model-resolution tests.
