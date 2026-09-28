# Request

## Task summary

Improve the Vertical Drama Stop Frame workflow so prompt generation requires a
confirmation dialog, repeated prompt submissions are blocked while the async
job is active, and users can generate the Stop Frame image from the prompt
section.

## Affected areas

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- focused Vertical Drama storyboard component tests

## Constraints and assumptions

- The existing `useVerticalDramaCreditConfirmation` hook is the confirmation
  UX contract for paid AI actions.
- The page owns the Stop Frame submit-and-poll lifecycle and the existing Stop
  Frame image callback/polling state.
- No database, API, migration, provider, billing, auth, or credit-accounting
  changes are required.
- Existing dirty files outside this task belong to other work and must remain
  untouched.

## Explicit non-goals

- Do not replace the existing image-slot Stop Frame action.
- Do not add a second backend idempotency scheme or change provider behavior.
- Do not perform authenticated production/browser generation as part of local
  implementation verification.
