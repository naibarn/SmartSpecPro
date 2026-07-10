# Input Contract — Vertical Drama Dialogue & Audio Planner

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (never auto-triggered from chat).

- Inputs are explicit, deterministic, and non-interactive.
- Outputs are structured JSON only.
- `episode_script` may be dialogue-complete (added 2026-07-07, story-density reform) — beats carrying `dialogue_lines[]`, per-beat `estimated_speech_seconds`, and the script's own `speech_budget`. When it is, `skill.md`'s "HARD RULE — dialogue-complete script is the source of truth" applies: this skill distributes/enriches those lines and must not invent new story dialogue.
- `shot_clip_timing[]` items may carry a per-shot/clip `target_speech_seconds` and `silence_intent` (optional superset) — see `schemas/input.schema.json`.
