# Request

Implement the approved Create Series Wizard design in
`2026-08-11-create-series-wizard-draft-gate-design.md`.

Requirements:

- Route one, multiple, and premise-based sources through skill-first synthesis.
- Remove the single-preset verbatim shortcut from the active wizard flow.
- Require explicit draft application before forward navigation or final create.
- Require 4–5 generated title choices unless the user supplies a manual title.
- Invalidate applied draft state when synthesis inputs change or regeneration starts.
- Make single-preset synthesis produce a distinct variation, not copied preset text.
- Preserve old series, current 9-shot episode behavior, existing authorization/credits,
  and unrelated dirty worktree changes.

## Assumptions

- The existing `synthesizeGenrePreset` tRPC procedure remains the single synthesis entry point.
- The transient draft remains client-side; no DB migration is needed.
- The repo has existing Vitest coverage for the wizard and preset synthesis paths.
- `writing-plans` is unavailable, so this quick-plan package is the implementation handoff.

## Non-goals

- No retroactive edits to existing series or episode data.
- No changes to shot duration, episode length, storyboard, or production flows.
- No new AI provider, endpoint, environment variable, or persistent draft table.
