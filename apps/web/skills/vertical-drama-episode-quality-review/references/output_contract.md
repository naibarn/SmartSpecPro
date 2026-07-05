# Output Contract — Vertical Drama Episode Quality Review

Every output must validate against `schemas/output.schema.json` before it is persisted or handed back to the caller. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: episode_title, scorecard, summary, issues, warnings, repair_queue, contract_version.

`scorecard` required fields: reversal_count, reversal_sharpness, emotion_variety, dialogue_naturalness (integer 1-5 or `null` when no dialogue plan was supplied), pacing, overall.

Each entry in `issues[]` requires `location`, `problem`, and `suggested_fix` — all concrete, never vague.

This skill NEVER blocks or fails based on the score — even a maximally flat episode returns a full, valid scorecard. There is no minimum passing score enforced by this skill; the caller decides how to act on the result.

All outputs are structured JSON; free-form prose only inside named string fields (`summary`, `problem`, `suggested_fix`).
