# Output Contract — Vertical Drama Storyboard Shotgrid

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: storyboard_summary, canonical_style_bible, shot_grid_plan, shots, plain_text_storyboard, storyboard_handoff_json, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.

## Emotional/acting quality fields (optional superset)

Each shot in `shots[]` MAY additionally carry `facial_expression`, `body_language`,
and `gaze_direction` (object keyed by `character_id`, or a plain string for a
single-character shot) — see `skill.md`'s "Emotional & acting direction" section.
`emotion` remains required, but must vary — the same value MUST NOT appear on more
than 2 consecutive shots. These are optional at the JSON-schema level for backward
compatibility, but expected on every real generation.

Each shot MAY carry `screen_caller_refs` (`string[]`) for remote phone/video callers.
These references remain attached for identity grounding, but the caller may appear
only inside a clearly visible device call screen and must never be rendered as a
physical person in the shot. `required_character_refs` and `characters` describe
physical scene presence only.

## Shot-to-beat attribution and silence budget (optional superset, added 2026-07-07)

Each shot in `shots[]` MAY additionally carry `source_beat_indexes` (`integer[]`,
matching the input script's `structure.beats[].beat`), `silence_intent`
(`"dramatic_pause" | "action_visual" | "montage" | "establishing"`), and
`target_speech_seconds` (`number`) — see `skill.md`'s "Shot-to-beat attribution
and silence budget" section. These are optional at the JSON-schema level for
backward compatibility, but `source_beat_indexes` is REQUIRED in practice
whenever the input script's beats are dialogue-complete, and `silence_intent`
is REQUIRED in practice on any shot with no spoken dialogue (max 2 of 9 shots
visual-only unless the episode is marked visual-first). Downstream,
`vertical-drama-dialogue-audio-planner` and `resolveShotDialogueLines` prefer
this persisted mapping over positional guesswork.
