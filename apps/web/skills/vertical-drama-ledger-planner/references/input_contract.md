# Input Contract — Vertical Drama Quality Ledger Planner

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama story pipeline (never auto-triggered from chat), once per breakdown version, as the `ledger_plan` job phase.

- Inputs are explicit, deterministic, and non-interactive.
- `active_breakdown` is the season's full episode breakdown (drafted and not-yet-drafted episodes) — the same shape the story pipeline already stores per episode.
- Outputs are structured JSON only.
