# Section 02 — Queue, Router, and UI Boundary

## Goal

Treat advisory-warning results as successful jobs and show warnings without
discarding the persisted prompt.

## Files

- `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- adjacent queue/router/UI tests

## Implementation

Carry optional warning metadata through the job result and router projection. A
warning-bearing result must be marked `succeeded`, clear its active pointer,
advance the sequence, persist the prompt, and retain normal idempotency and billing
semantics. Preserve the existing hard-error mapping for missing media, auth,
queue, credits, LLM/schema, vision, and provider failures.

Keep warning metadata out of provider-facing prompt fields unless the existing
contract already supports it. Update the storyboard polling/result branches so a
successful prompt remains visible and the warning is secondary, not an error
state or disabled action.

## TDD

- Warning-bearing job terminal state is successful with a non-null result.
- Queue pointers and sequence progress after warning-bearing success.
- Router persists prompt and optional warning without changing render payload.
- UI keeps prompt and generate action available while showing the warning.
- Operational failure still shows the existing error behavior.

## Acceptance

The screenshot flow cannot end with an empty prompt solely because of a policy
warning; it either shows a persisted prompt or a genuine operational error.
