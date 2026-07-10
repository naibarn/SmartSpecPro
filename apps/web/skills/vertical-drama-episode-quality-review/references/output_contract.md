# Output Contract — Vertical Drama Episode Quality Review

Every output must validate against `schemas/output.schema.json` before it is persisted or handed back to the caller. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: episode_title, scorecard, summary, issues, warnings, repair_queue, contract_version.

`scorecard` required fields: reversal_count, reversal_sharpness, emotion_variety, dialogue_naturalness (integer 1-5 or `null` when no dialogue plan was supplied), pacing, overall.

Each entry in `issues[]` requires `location`, `problem`, and `suggested_fix` — all concrete, never vague.

This skill NEVER blocks or fails based on the score — even a maximally flat episode returns a full, valid scorecard. There is no minimum passing score enforced by this skill; the caller decides how to act on the result.

All outputs are structured JSON; free-form prose only inside named string fields (`summary`, `problem`, `suggested_fix`).

## Scorecard v2 (optional superset, `contract_version: 2`, added 2026-07-07 — story-density reform)

`contract_version` may be `1` (default, shipped scorecard shape above) or `2`.
v1 artifacts remain valid and readable under this schema unchanged. When `2`:

- `scorecard` MAY additionally carry `hook_strength`, `cliffhanger_strength`,
  `continuity_consistency` (all integer 1-5), and `tie_in_naturalness`
  (integer 1-5, or `null` when no tie-in is configured) — see `skill.md`'s
  "Scorecard v2" section.
- The output MAY carry a top-level `tie_in_assessment` (string) — a short
  qualitative note supporting `tie_in_naturalness`; omitted when no tie-in is
  configured.
- The output MAY carry a top-level `density_metrics` object
  (`estimated_speech_seconds`, `per_clip_coverage` summary, `silent_gap_count`,
  `duplicate_line_count`, `stage_direction_count`, `reversal_count`,
  `max_consecutive_same_emotion`) — these are deterministic facts computed in
  code and supplied in the input; this skill echoes them back VERBATIM and
  must never re-estimate them itself.

All v2 fields are optional at the JSON-schema level for backward
compatibility, but expected together whenever the caller requests
`contract_version: 2`.
