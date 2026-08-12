# Section 02 — Router and Worker Integration

## Ownership

Own `verticalDramaEpisodes.ts`, the executor boundary, startup wiring, and
server tests. Preserve unrelated router changes already present in the dirty
worktree.

## Work

- Move the current long body behind an internal executor used by the queue
  worker.
- Make the public mutation perform fast validation, enqueue, and return
  acknowledgement only.
- Add job status and episode active-job queries with ownership checks.
- Register/close the queue from `_core/index.ts`.
- Normalize strict boolean strings at the narrow motion-contract validation
  boundary and add regressions.

## Acceptance

Submit never calls the executor inline. Worker success persists before
`succeeded`; failure is sanitized and retryable. Existing executor prompt,
split-shot, quality-loop, and persistence tests remain green.
