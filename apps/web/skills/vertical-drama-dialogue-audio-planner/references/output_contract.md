# Output Contract — Vertical Drama Dialogue & Audio Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: dialogue_lines, speaker_mapping, voice_continuity_map, missing_voice_warnings, subtitle_cues, audio_timing_estimate, native_audio_snippets, separate_tts_plan, warnings, repair_queue, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.

## Delivery direction + spoken-register fields (optional superset)

Each entry in `dialogue_lines[]` MAY additionally carry `delivery`
(`{ tone, pace, pauses, texture }`) and `subtext` — see `skill.md`'s "Per-line
delivery direction" section. `dialogue_line` itself remains a plain string, but
`skill.md`'s "HARD RULE — dialogue must be natural spoken Thai" section requires
every Thai line to use spoken register (ภาษาพูด), not written/translated Thai —
this is a content-quality rule enforced by the system prompt, not a schema shape
change.
