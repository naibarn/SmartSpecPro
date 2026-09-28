# Research notes

## Evidence

- The screenshot for series 21 / episode 140 shows human names in the video
  prompt and character cards, while dialogue cards show `character-2` and
  `character`.
- `apps/extension/src/panel/App.tsx` renders `line.speaker` directly.
- `projectDramaShotDialogueLinesForExtension` currently returns
  `dialogueAudioPlan.dialogueLines[].speakerName` first and otherwise exposes
  `clip.dialogue[].characterKey`.
- `getDramaSeriesEpisodeDetailForExtension` already loads each series
  character's `characterKey` and `name`, but does not pass that mapping into
  the dialogue projection.
- The focused test suite passed 8/8 before the fix; its fixtures only use
  human-readable speaker values and therefore do not cover opaque keys.

## Boundaries

- The endpoint is read-only and already verifies tenant, user, series, and
  episode ownership before loading character rows.
- No response fields, route contracts, dependencies, or database objects need
  to change.
- SocratiCode was unavailable in this session; discovery used bounded `rg` and
  targeted reads.

