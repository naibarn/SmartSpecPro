# Section 03 — Client Status and Verification

## Ownership

Own `VerticalDramaEpisodePage.tsx`, localized workspace copy, and client tests.

## UI/UX Contract

- Target user: a Vertical Drama author generating prompts for several shots.
- Job to be done: submit several shots, know each was accepted, and see the
  final prompt without accidental duplicate charges.
- States: idle, submitting, queued/waiting, running, succeeded, failed,
  deduplicated, conflict, expired/unknown, and transient poll error.
- Copy: Thai and English labels must explain admission versus completion;
  success copy appears only after terminal success.
- Same-shot action is disabled while active; other shots remain usable.
- Poll active jobs from the server and resume after page reload.
- Use existing tokens/components and preserve responsive storyboard layout.
- Accessibility: status is text-readable, buttons have disabled/loading labels,
  and conflict/failure messages are announced through existing toast/status
  patterns.
- Browser evidence: submit at least two shots, observe queued/running states,
  reload during active work, and verify final prompts appear after success.

## Work

- Handle admission result and job ID rather than final prompt data.
- Poll active jobs with TanStack Query only while active.
- Invalidate episode detail after terminal success.
- Distinguish dedupe and different-instruction conflict messages.
- Keep AI-adjust input attached to the queued payload.

## Acceptance

The page never treats a queued acknowledgement as completion, never silently
resubmits after a poll/network failure, and retains correct per-shot state after
refetch/reload.
