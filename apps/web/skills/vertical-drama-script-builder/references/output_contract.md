# Output Contract — Vertical Drama Script Builder

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: episode_title, hook, structure, scene_dialogue_summary, cliffhanger, character_state_deltas, product_tie_in_plan, continuity_notes, warnings, repair_queue, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.

## Narrative quality fields (optional superset, strongly expected)

These fields are optional at the JSON-schema level (backward compatible with any
caller written before this rule existed), but `skill.md`'s system prompt requires
the LLM to populate them on every real generation:

- `structure.beats[].power_shift` — `{ holder_before, holder_after, how }`
- `structure.beats[].is_reversal` — boolean, true for beats with a real power flip
- `structure.beats[].intensity` — integer 1-10, escalating toward the cliffhanger
- `character_emotional_arcs[]` — `{ character_id, start_emotion, turning_beat, end_emotion }`, one entry per named character

An episode with fewer than 2 `is_reversal: true` beats fails the narrative quality
bar even though it still validates against the JSON schema — see `vertical-drama-episode-quality-review`
for the automated scorecard that checks this before paid image/video generation.

## Dialogue-complete beats (optional superset, added 2026-07-07 — story-density reform)

These fields are optional at the JSON-schema level (any script written before
the reform still validates), but `skill.md`'s "Speech budget" section requires
them whenever the input carries `speech_budget`/`content_budget`:

- `structure.beats[].dialogue_lines[]` — `{ speaker, line, delivery?, subtext?, estimated_speech_seconds? }`,
  dialogue authored AT SCRIPT STAGE and sized to the episode's speech budget.
  Downstream, `vertical-drama-dialogue-audio-planner` distributes/enriches
  these lines and must not invent a parallel script.
- `structure.beats[].estimated_speech_seconds` — beat-level total, the sum of
  that beat's `dialogue_lines[].estimated_speech_seconds`.

An episode below the platform's minimum whole-episode speech-coverage ratio is
returned for repair before the storyboard stage — see
`vertical-drama-storyboard-shotgrid` and `vertical-drama-dialogue-audio-planner`
for how `source_beat_indexes`/`silence_intent` and `origin` continue this
chain downstream.
