# Research notes

## Current flow

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
  requires five prompt fields in the legacy response schema, calls the LLM with
  `maxTokens: 5500`, and settles a skill charge after validation. The returned
  render prompt is primary portrait or full body when the skill verdict says
  `full_body`; the sibling prompt fields are returned but are not sent to the
  portrait image renderer.
- `apps/web/server/routers/verticalDramaCharacters.ts` uses the preview result
  for portrait approval, skips prompt generation when an approved prompt is
  supplied, and uses only `turnaroundPrompt` for turnaround sheets or
  `sheetPrompt` for named sheets.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  stores the preview's turnaround value for compatibility but documents that it
  no longer reads it. Sheet generation is direct-confirm without preview.
- `apps/web/shared/verticalDramaSeries/characterProfile.ts` has a strict
  approved snapshot requiring legacy `designDna`; the broader persisted visual
  bible is passthrough and already tolerates optional fields.
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts` uses
  persisted `visualBible.designDna` and `visualIdentitySummary` as comparison
  evidence for later generations.

## New skill

- `apps/web/skills/character-prompt-skill/skill.md` requires series-aware input,
  role/age/region handling, face blueprint, presentation profile, diversity
  signature, safety mode, and a single `positive_prompt`/`negative_prompt`.
- `schemas/character-prompt-request.schema.json` accepts `series_dna`, one or
  more `characters`, and `generation.render_context`.
- `schemas/character-prompt-profile.schema.json` returns one profile and does
  not define the five legacy sibling prompts.
- The skill must be amended to make `generation.render_context` explicitly
  select a standalone portrait, turnaround, or named-sheet prompt.

## Billing evidence

Recent database rows for feature `vertical_drama_character_visual_bible` show
one skill transaction per call. The latest 14-day sample used
`openai/gpt-5.6-luna`, averaged roughly 50k input and 3.6k output tokens, and
charged the configured two credits while recording much higher actual work
credits. Reducing response fields should reduce provider work even when the
user-facing fixed skill charge remains two credits.

## Boundaries

- `character-candidate-prompt` is a separate multimodal candidate contract and
  stays unchanged.
- Existing model capability normalization removes a separate negative prompt
  for inline-only image models; the new adapter must preserve that behavior.
- Existing stale approved-prompt checks compare contract version, prompt profile,
  casting fingerprint, and current facts; the adapter must emit compatible
  contract metadata.
