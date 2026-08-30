# TDD Plan: Warning-Only Video Prompt Safety

## Section 1 — Safety decision contract

- Test that the exact episode-232 generated prompt does not become a blocking
  authoring error because of `child` and `restrained tension`.
- Test that actual physical restraint and minor threat/surveillance still produce
  findings for advisory telemetry.
- Test that negative prompts, policy instructions, and audio/style metadata do
  not create authored-event findings.
- Test whole-pack, single-shot, and speaker-switch paths do not throw for policy
  findings and still return valid prompt results.

## Section 2 — Queue, router, persistence, and UI boundary

- Test a warning-bearing executor result is stored as `succeeded` with result data
  and no job error.
- Test sequence advancement and active-pointer cleanup after warning-bearing
  success.
- Test the router persists the prompt and warning projection without changing
  provider-facing prompt fields.
- Test operational/precondition errors remain failed and are mapped to their
  existing error contract.
- Test the storyboard panel renders an advisory warning while keeping the prompt
  and generate action available.

## Section 3 — Regression and verification

- Replay the real episode-232 shot-1 Redis job and audit response fixture through
  the service analyzer and result projection.
- Verify no shot-1 video-prompt user credit transaction exists before success and
  exactly the normal successful transaction exists after an explicit successful
  run.
- Run focused Vitest suites for safety, motion generation, judged generation,
  queue jobs, router integration, then run the repository's applicable broader
  checks and record unrelated baseline failures separately.
- Verify browser success/error/warning states and preserve render-time rejection
  as a separate state when that provider boundary is available.
