# Input Contract — Vertical Drama Character Variant Planner

See `schemas/input.schema.json`. This skill is invoked explicitly by
`server/services/verticalDramaCharacterVariantPlanner.ts` (never auto-triggered from
chat), as the final phase of `runImproveScriptJob`.

- `characters` is the series' current roster — STANDALONE/parent rows only (rows that
  are themselves already a variant of another character are not re-sent as separate
  roster entries; they've been materialized already).
- `episodes` is the WHOLE season's drafted content (not a subset), in the same
  `StoryScriptEpisodeInput` shape the sibling `drama-script-evaluate-improve` skill
  consumes — reused verbatim, not reinvented.
- Every fact here is ground truth; the skill is the sole author of the variant/twin
  plan. Code never pre-decides which characters need variants.
