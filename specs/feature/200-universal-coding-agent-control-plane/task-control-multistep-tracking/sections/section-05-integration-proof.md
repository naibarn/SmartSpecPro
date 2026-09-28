# Section 05 — Integration proof and closeout

## Objective

Prove the user-visible flow at target viewports and record exact boundaries.

## Implementation

1. Update Playwright tRPC fixtures with two groups, including a three-step
   group with completed/running/queued steps.
2. Assert all open groups render, expansion reveals ordered steps and progress,
   load-more/scroll has no horizontal overflow, and the global single button
   still works outside `/chat`.
3. Update Feature 200 completion/review notes with focused commands and
   residual limitations.

## Tests

- Focused Vitest service/router/component suites.
- Playwright control-plane browser suite for mobile/tablet/desktop.
- `git diff --check`.

## Completion evidence

Report what was proven locally and explicitly separate provider/deployment/live
runtime proof that is outside this change.
