# Output Contract — Vertical Drama Character Variant Planner

Every output must validate against `schemas/output.schema.json` before it is used.
Required top-level fields: `contract_version`, `character_plans`, `twin_detections`
(both arrays — empty arrays are valid and expected on many runs).

- `character_plans[].character_key` and `twin_detections[].source_character_key` must
  match an input roster `character_key` exactly — the calling app's reconciliation
  step (`reconcileCharacterVariantPlan`) silently skips any entry whose
  `character_key` isn't found in the current roster (best-effort, never throws).
- `variant_type` is either `"outfit"` (same face, different hair/clothing/makeup) or
  `"age_stage"` (same identity, face allowed to change naturally with age) — see
  `skill.md`'s "Two variant types" section for the full distinction.
- `shares_face_with`, when set on a `new_characters[]` entry, must equal that entry's
  parent `twin_detections[].source_character_key` — the calling app treats any other
  value as a schema violation and retries.
- The calling app's reconciliation is idempotent: re-running this skill on a series
  that already has variant/twin rows updates existing rows (matched by
  `(parentCharacterId, variantLabel)` for variants, or `(sharesFaceWithCharacterId,
  name)` for twins) rather than duplicating them.
