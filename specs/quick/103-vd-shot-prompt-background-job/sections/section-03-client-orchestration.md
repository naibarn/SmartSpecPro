# Section 03 — Client Orchestration

## Ownership

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- focused client flow tests

## Work

Add a shared submit-and-poll helper with a bounded deadline. Adapt prompt+image,
AI edit, and repair consumers to wait for terminal job success. Continue to the
existing image mutation only from a successful prompt result.

## TDD expectations

Cover successful continuation, failure/no-image, polling timeout, and all three
call sites using the terminal result rather than submit acknowledgement.

## Acceptance checks

- Loading state lasts until terminal completion.
- Repeated clicks do not create a second prompt job.
- Prompt errors remain retryable and do not show false success.

## UI/UX Contract

- Target user/job: a creator generating one or many shot images without losing
  work during long prompt generation.
- Surface inventory: existing shot actions, AI edit dialog, repair dialog, and
  existing toasts; no new layout.
- Component map: existing page mutation hooks plus one polling helper.
- State matrix: queued/running = existing loading state; succeeded = update and
  continue; failed/expired/timeout = error toast and retry enabled.
- Responsive matrix: no visual geometry changes.
- Accessibility: disabled/loading controls retain text or accessible status;
  errors remain announced through the existing toast system.
- Design tokens: none added.
- Copy: preserve current Thai labels; use concise Thai terminal error with the
  server reason and retry guidance; English fallback may use existing generic
  errors.
- Browser evidence: after deployment, verify a deliberately long job survives
  page polling and creates one Media History image task.
