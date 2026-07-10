# Research Notes

## Current Preset System

- Presets are persisted in `vertical_drama_genre_presets`, defined in `apps/web/drizzle/schema.ts`.
- Fields already fit the new six presets: `title`, `category`, `locale`, `logline`, `mainPlot`, `seasonArc`, `tone`, `cliffhangerStyle`, `charactersJson`, `visualBible`, `sortOrder`, `scope`, `tenantId`, `userId`.
- `verticalDramaSeries.listGenrePresets({ locale })` returns global presets plus the caller's own private presets, filtered by locale and ordered by sort order.
- `apps/web/scripts/seed-vertical-drama-genre-presets.ts` is the existing seed path. It clears global presets only and preserves private presets.
- `apps/web/shared/verticalDramaSeries/genrePresetCategories.ts` maps category slugs to bilingual display labels. Unknown slugs fall back to raw slug, so labels are not strictly required for functionality but are required for polished UX.

## Current Create UX

- `CreateSeriesWizard.tsx` step 1 fetches presets through `listGenrePresets`.
- Current picker supports search and single category filtering.
- `applyPreset()` applies one preset at a time and overwrites `genre`, `logline`, `mainPlot`, `seasonArc`, `tone`, `cliffhangerStyle`, `characters`, and `visualBible`.
- `handleCreate()` sends these values into `verticalDramaSeries.create`; after create succeeds, it triggers `generateStoryBible({ seriesId })` best-effort.

## Current LLM Pattern

- `verticalDramaStoryBible.ts` performs credit check -> model resolve -> LLM JSON call with retry -> schema validation -> credit deduction.
- `verticalDramaScriptGeneration.ts` shows the preferred direct-skill service pattern:
  - loads `apps/web/skills/<skill>/skill.md`;
  - uses a skill-specific Zod output schema;
  - builds a JSON-oriented prompt;
  - validates output;
  - deducts credits only after success.
- Existing Vertical Drama skills live under `apps/web/skills/vertical-drama-*` and follow a package shape with `SKILL.md`, `skill.md`, `skill.json`, schemas, fixtures, examples, tests, help files, and `scripts/verify.sh`.

## Skill Package Requirements

- Existing Feature 131 plans require every Vertical Drama skill to be structured JSON only.
- Skill metadata defaults:
  - `category: video_prompt_generation`
  - `execution_mode: llm-only`
  - `auto_trigger: false`
  - `enabled_by_default: false`
  - `credit_multiplier: 1`
  - `strict_provider_pin: false`
  - `contract_version: 1`
- Free-form prose should live only in named fields such as `notes`, `human_summary`, or generated preset strings.

## Testing Commands

- Web package manager: `pnpm` in `apps/web`.
- Type check: `cd apps/web && pnpm check`.
- Focused tests: `cd apps/web && pnpm test -- <test-pattern>`.
- Seed script alias: `cd apps/web && pnpm seed:vertical-drama:genre-presets`.

## Dirty Tree Note

The repository currently has unrelated modified files, including existing Vertical Drama files. Implementation must avoid broad staging and must inspect file diffs before editing overlapping paths.

## Key Risks

- Seed script reruns clear global presets, so static preset additions must be deliberate and preserve existing private presets.
- Mix and Match can overwhelm users if exposed as a technical schema form; UX should hide prompt/payload details.
- Generated presets can become incoherent if every selected category has equal weight. The service should guide the LLM with one primary flavor, two to four supporting flavors, and clear output constraints.
- tRPC mutation and credit-consuming LLM calls require tenant/user ownership and credit safety checks.
