# Input Contract — Vertical Drama Episode Quality Review

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (or a manual "check quality" action) — never auto-triggered from chat.

- Inputs are explicit, deterministic, and non-interactive.
- `script` and `storyboard` are the raw (or a relevant subset of the) outputs of `vertical-drama-script-builder` and `vertical-drama-storyboard-shotgrid` respectively.
- `dialogue_plan` is optional; when omitted, `dialogue_naturalness` is scored `null` rather than penalized.
- Outputs are structured JSON only.
- `density_metrics` (optional, added 2026-07-07 — story-density reform) carries deterministic density facts pre-computed in code (the platform's canonical speech-budget module). When supplied, request `contract_version: 2`; this skill must echo the object back verbatim, never re-estimate it — see `skill.md`'s "Scorecard v2" section.
- `tie_in_config` (optional) signals whether tie-in QC is active for this episode (`enabled: true`). When present and enabled, this skill additionally scores `scorecard.tie_in_naturalness` and produces a short `tie_in_assessment`; when absent or disabled, `tie_in_naturalness` is `null` and `tie_in_assessment` is omitted.
