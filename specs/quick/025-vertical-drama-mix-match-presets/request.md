# Request: Vertical Drama Mix-and-Match Presets

## Original User Request

Plan work and then follow the recommended solution:

1. Add six new Vertical Drama Series presets to the existing preset system:
   - `thai_local_service_comedy_mini_drama`
   - `restaurant_service_skit`
   - `food_shop_tie_in_drama`
   - `local_business_comedy_drama`
   - `customer_staff_situation_comedy`
   - `thai_everyday_lifestyle_skit`
2. Add an optional Mix and Match UX where users can select multiple categories/presets at once and let an LLM synthesize a new preset through a dedicated skill. The UX must stay easy to understand and not feel complicated; the product goal is to let the LLM help users think.

## Task Summary

Extend the Vertical Drama Series create flow with six curated Thai local service/comedy/lifestyle preset templates and an AI-assisted Mix and Match draft generator that produces one coherent editable preset from multiple selected flavors.

## Inferred Constraints

- Preserve the existing one-preset picker flow; Mix and Match is additive.
- Keep the user-facing workflow simple: users should select story flavors, optionally provide a business/product context, and let AI generate the draft.
- Use the existing Vertical Drama skill package conventions under `apps/web/skills`.
- Do not let skill execution auto-trigger or bill by surprise.
- Keep schema validation and credit handling consistent with existing Vertical Drama generation services.
- Do not add new dependencies unless current tooling cannot cover validation or execution.

## Assumptions

- Six static presets should be available in both Thai and English locale lists, matching the current `listGenrePresets({ locale })` behavior.
- Mix and Match should create a temporary draft first, not immediately insert a saved global/private preset.
- Users can edit the AI-generated draft before applying it to the wizard fields.
- A later follow-up may allow saving synthesized drafts as private presets through the existing `saveSeriesAsPreset` flow after the series is created.

## Non-Goals

- No new standalone preset management screen.
- No replacement of the existing single-preset workflow.
- No paid media/image/video generation in this feature.
- No admin moderation workflow for synthesized presets.
