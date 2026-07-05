# Input Contract — Vertical Drama Episode Quality Review

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (or a manual "check quality" action) — never auto-triggered from chat.

- Inputs are explicit, deterministic, and non-interactive.
- `script` and `storyboard` are the raw (or a relevant subset of the) outputs of `vertical-drama-script-builder` and `vertical-drama-storyboard-shotgrid` respectively.
- `dialogue_plan` is optional; when omitted, `dialogue_naturalness` is scored `null` rather than penalized.
- Outputs are structured JSON only.
