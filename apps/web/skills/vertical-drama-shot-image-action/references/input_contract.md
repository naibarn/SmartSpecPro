# Input Contract — Vertical Drama Shot Image Action Composer

See `schemas/input.schema.json`. This skill is invoked explicitly by
`server/services/verticalDramaShotImageAction.ts` (never auto-triggered from chat).

- `action` selects which of the two skill.md sections applies: `multi_angle_grid`
  or `repair`.
- `shot.current_prompt` / `shot.current_negative_prompt` are the ONLY scene ground
  truth — the skill must preserve their content, never reinvent it.
- `repair_instruction` is required (non-null) only for `action == "repair"`.
- `character_reference_manifest`, `target_audience_region`, and `product_lock`
  carry FACTS only (names, image indices, descriptors, product identity) — never
  pre-authored instruction sentences. The skill is responsible for turning these
  facts into natural prose.
- `grid_layout` is present only for `action == "multi_angle_grid"`.
