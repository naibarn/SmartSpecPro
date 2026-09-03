# Research Notes

## Repository patterns

- `VerticalDramaStoryboardPanel` already imports and renders
  `useVerticalDramaCreditConfirmation`; paid Start Frame image and View 2
  actions use it.
- The visible prompt section at approximately the `vd-storyboard` Stop Frame
  prompt block calls `onGenerateStopFramePrompt(shotNumber)` directly and has
  no image action.
- An earlier Stop Frame image-slot block already renders an image action when
  `frame.stopFramePrompt` exists, using
  `generatingStopFrameImageForShot` and the same confirmation hook.
- The page's `handleGenerateStopFramePrompt` creates a new random idempotency
  key for every invocation and awaits submit plus polling, but currently has no
  per-shot UI busy set.
- The page already owns `pollingStopFrameShots` for image generation and passes
  it through the storyboard data to the panel.

## Impacted contracts

The new prompt busy set must be threaded through the existing data path:

`VerticalDramaEpisodePage` → `VerticalDramaEpisodeWorkspace`'s
`VerticalDramaStoryboardPanelData` → `VerticalDramaStoryboardPanel`.

No shared API or persisted JSON shape changes.

## Test and build configuration

- Package manager: npm (`npm@10.9.8`).
- Web tests: `npm --workspace apps/web test -- <vitest args>`.
- Web build: `npm --workspace apps/web run build`.
- Existing tests use Testing Library, Vitest, and panel `baseProps` fixtures.

## Security and boundary scan

The change is presentational state and callback gating only. It does not alter
authorization, tenant identity, prompt contents, persisted records, provider
selection, or credit reservation. Existing server-side validation remains the
authoritative boundary.
