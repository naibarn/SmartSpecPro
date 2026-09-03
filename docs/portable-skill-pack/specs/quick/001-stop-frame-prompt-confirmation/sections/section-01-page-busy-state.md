# Section 01 — Page Busy State and Prop Plumbing

## Ownership boundary

Own the async lifecycle and the typed pass-through from page to panel. Do not
change tRPC inputs, task persistence, polling semantics, or server behavior.

## Target files

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`

## Work

- Add a `Set<number>` state in the page for prompt generation initiated by the
  Stop Frame prompt action.
- In `handleGenerateStopFramePrompt`, add the shot before calling the existing
  submit-and-poll helper and delete it in `finally`. Keep the existing success
  invalidation and toast behavior.
- Thread `generatingStopFramePromptForShot` through workspace data and both
  workspace-to-panel render paths if both are explicit.
- Give the panel prop a stable empty-set default so existing callers/tests do
  not need to provide it.

## TDD expectations

The panel test must be able to supply a busy set and verify the prompt action is
disabled. A page-level unit test is optional if the existing page harness makes
the async mutation practical; otherwise the `finally` lifecycle is verified by
the focused page helper or type/build checks and code inspection.

## Acceptance checks

- No duplicate callback can be triggered while a shot is in the busy set.
- Busy set clears on every exit path.
- Existing prompt submit input, including fresh idempotency key, is unchanged.
- TypeScript accepts all three prop contracts and call sites.

## Known risks

The local set does not persist across reloads. That is intentional: durable
task recovery is already handled by the existing page effects and this change
only guards the current manual click lifecycle.

## Implementation result

Implemented in `VerticalDramaEpisodePage.tsx` and threaded through both
`VerticalDramaEpisodeWorkspace.tsx` panel render paths. A ref-backed Set closes
the same-tick duplicate window, while React state drives the per-shot disabled
and loading UI.
