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

## Line provenance (optional superset, added 2026-07-07 — story-density reform)

Each entry in `dialogue_lines[]` MAY additionally carry `origin`
(`"script" | "script_fallback"`) — see `skill.md`'s "HARD RULE —
dialogue-complete script is the source of truth" section. When the input
script is dialogue-complete, this skill DISTRIBUTES/ENRICHES those lines
(never invents new story dialogue) and tags them `origin: "script"`; the
legacy reconstruction path is always tagged `origin: "script_fallback"` with a
matching `warnings` entry. This field is optional at the JSON-schema level for
backward compatibility, but expected on every real generation.
