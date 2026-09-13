# TDD guidance

## Tests first

1. Add Python tests for a first-attempt transient failure followed by success;
   assert two pages/tokens/navigation attempts and one capture.
2. Add a Python test proving three failed attempts stop at the configured
   retry bound and raise `E_SLIDE_MEDIA_DEGRADED`.
3. Add a Python test proving HTTP 404/401/403 is terminal and does not retry.
4. Extend the Node route test to make two independent requests and assert
   `storagePresignGet` is called for the managed key on each request.

## Expected red/green behavior

- Before the change, a media-degraded page raises immediately and no second
  navigation occurs.
- After the change, transient failure recovers with a new page/request, while
  terminal failures remain immediate.

## Fixtures and mocks

- Keep `SimpleNamespace(status=200)` for Playwright response status.
- Make mock pages expose independent `evaluate()` state per attempt.
- Mock `goto()` failures with `TimeoutError` or a transient readiness state;
  never use a generic `MagicMock` that can make missing fields truthy.
- Keep screenshot bytes valid so PNG validation remains meaningful.

## Regression checks

- Existing readiness timeout, media degraded, screenshot validation, video
  record-mode, JWT security, progress, and upload tests must continue to pass.
- Run `git diff --check` and inspect the diff for accidental `.env`, DB, or
  provider-generation changes.
