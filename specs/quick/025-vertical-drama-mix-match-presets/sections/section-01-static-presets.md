# section-01-static-presets

## Goal

Add six curated Vertical Drama genre presets to the existing global preset seed library without changing the preset schema or existing single-preset UX.

## Ownership Boundaries

Owns:

- `apps/web/scripts/seed-vertical-drama-genre-presets.ts`
- `apps/web/shared/verticalDramaSeries/genrePresetCategories.ts`

Does not own:

- `vertical_drama_genre_presets` schema
- tRPC procedures
- Create wizard Mix mode

## Target Presets

Add these categories:

- `thai_local_service_comedy_mini_drama`
- `restaurant_service_skit`
- `food_shop_tie_in_drama`
- `local_business_comedy_drama`
- `customer_staff_situation_comedy`
- `thai_everyday_lifestyle_skit`

Each category needs a Thai preset and an English preset.

## Content Requirements

Every preset must have:

- concrete local Thai service/business setting;
- customer/staff situation engine;
- short-form comedy/drama rhythm;
- recurring character ensemble;
- product or service tie-in that feels natural;
- realistic Thai everyday detail;
- clear cliffhanger style suitable for mobile vertical drama.

Avoid making all six variations too similar. Distinguish them by story engine:

- local service neighborhood ensemble;
- restaurant service incident;
- food shop/product tie-in;
- family/local business survival;
- customer/staff misunderstanding comedy;
- everyday lifestyle/slice-of-life skit.

## TDD Expectations

- Add or update test coverage so the six slugs are present in both locale seed arrays.
- Add/extend label test coverage so all six slugs have Thai/English labels.
- If seed arrays are not currently exported/testable, implement the smallest safe refactor to make preset counts/slug presence testable without running DB writes.

## Acceptance Checks

- `genrePresetCategoryLabel(slug, "th")` and `"en"` return friendly labels for all six categories.
- Seed output includes all required fields.
- Private presets remain untouched because the existing seed script deletes only global presets.

## Risks

- Re-running the seed script rewrites global presets. Treat production seeding as a deployment step requiring explicit confirmation.
- Long preset text can become unwieldy in cards; keep loglines compact.
