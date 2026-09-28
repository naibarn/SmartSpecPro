# TDD guidance

## Red tests first

1. Router persistence tests:
   - persist provider/sync failure with `failureStage` and `lastTaskId`;
   - persist no-task admission failure;
   - reject/ignore no-task terminal failure when a newer pending task exists;
   - preserve the existing late-task guard.
2. Page source/flow tests:
   - sync failure persists a terminal state instead of returning with a pending
     task;
   - image mutation admission failure records the prompt-ready failure;
   - render-only retry does not call the prompt job.
3. Storyboard UI/helper tests:
   - pending prompt-ready, provider failure, sync failure, no-image,
     asset-loading, asset-loaded, and asset-load-error states;
   - error copy includes next action and does not claim success;
   - existing lightbox/download behavior remains available for ready assets.

## Test setup

- Use `// @vitest-environment jsdom` for React viewport tests.
- Prefer pure status resolver tests for precedence and a small rendered-panel
  test for overlay callbacks.
- Mock tRPC mutations and `AuthenticatedMediaImage` only where necessary; keep
  at least one native image `onLoad/onError` test so browser state is covered.
- Router tests should use the existing mocked DB/transaction patterns and
  verify owner-scoped row-lock update semantics without a live provider call.

## Regression gate

After implementation, rerun the existing 23-test focused baseline plus all new
tests. Any full-repo typecheck diagnostics unrelated to touched files must be
reported separately rather than masking a focused failure.
