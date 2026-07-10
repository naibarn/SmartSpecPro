# Input Contract — Vertical Drama Script Builder

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (never auto-triggered from chat).

- Inputs are explicit, deterministic, and non-interactive.
- Outputs are structured JSON only.

## Speech-budget inputs (optional superset, added 2026-07-07)

`speech_budget` (`target_speech_seconds_min`/`target_speech_seconds_max`,
`per_shot_band[]`, `locale`) and `content_budget` (`beatCount`,
`estimatedSpeechSeconds`, `conflictLevel`, `reversalTarget`, `arcThreads`) are
optional at the JSON-schema level (backward compatible with any caller
written before the story-density reform), but `skill.md`'s "Speech budget"
section requires dialogue-complete beats whenever either is supplied. See
`schemas/input.schema.json` for the full shape.
