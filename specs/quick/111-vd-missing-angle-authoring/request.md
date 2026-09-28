# Request

## Task summary

Improve the Vertical Drama missing-location-angle workflow so a coverage gap can
be turned into an editable, user-confirmed prompt, rendered as a new location
camera variant, approved without replacing the primary location image, and
selected per storyboard shot.

## Repository assumptions

- `VerticalDramaLocationsBibleCard` already receives `sceneVisualStates.*.coverageGaps`.
- `previewLocationPrompt` already accepts `coverageRole` and `gapDescription`.
- `generateLocationImage` already accepts an approved prompt and stores coverage metadata.
- `getEpisodeDetail` already exposes approved `cameraVariants`.
- `ShotLocationPickerDialog` and `locationVariantId` already persist per-shot selection.
- The implementation must preserve unrelated dirty work in the shared Vertical Drama files.

## Constraints and non-goals

- No schema migration unless current contracts prove it is required.
- Do not auto-replace a location's primary reference image.
- Do not silently spend image/prompt credits.
- Keep tenant/user ownership validation on the existing server paths.
- Keep Thai/English copy and existing component styling conventions.
