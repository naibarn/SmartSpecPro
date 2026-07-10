# Implementation Plan: Vertical Drama Mix-and-Match Presets

## Objective

Add six curated Thai local service/comedy/lifestyle Vertical Drama presets and introduce an AI-assisted Mix and Match flow that lets users select multiple story flavors and receive one coherent editable draft preset. The UX must be simple: the user chooses story flavors and optional context; the LLM does the thinking and produces a ready-to-edit series seed.

## Current Codebase Fit

The existing preset table and wizard fields already match the output shape needed for both static presets and synthesized drafts. The least-impact design is therefore additive:

- extend the seed list and category labels;
- add a new skill package for preset synthesis;
- add a backend service and protected tRPC mutation that validates and credit-gates synthesis;
- extend `CreateSeriesWizard` with a small mode switch and AI draft preview.

No DB migration is required for the recommended MVP because synthesized output is temporary until applied to the wizard.

## Affected Files And Modules

Likely modified:

- `apps/web/scripts/seed-vertical-drama-genre-presets.ts`
- `apps/web/shared/verticalDramaSeries/genrePresetCategories.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaPresetSynthesis.ts` (new)
- `apps/web/server/services/__tests__/verticalDramaPresetSynthesis.test.ts` (new)
- `apps/web/server/routers/__tests__/verticalDramaSeries.synthesizeGenrePreset.test.ts` (new or adjacent existing test)
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- `apps/web/skills/vertical-drama-preset-synthesizer/**` (new skill package)
- `apps/web/server/services/__tests__/builtInSkillMetadata.test.ts` or adjacent skill metadata coverage if it enumerates required skill packages.

No expected changes:

- Existing `vertical_drama_genre_presets` schema.
- Existing Storyboard Review generation/handoff.
- Existing episode pipeline stages.

## Implementation Approach

### 1. Static Presets

Add six global curated preset entries to the seed script for both `GENRE_PRESETS` and `GENRE_PRESETS_EN`.

Each preset should include:

- a concrete Thai everyday/local business setting;
- customer/staff conflict with a light comedy rhythm;
- a human-scale emotional arc;
- a product/service tie-in that helps the scene but does not unrealistically solve the main conflict;
- mobile short-form cliffhanger style;
- grounded visual bible with recognizably Thai service/local business details.

Add bilingual category labels for all six slugs. Labels should be friendly and user-facing, not raw slugs.

### 2. New Skill Package

Create `apps/web/skills/vertical-drama-preset-synthesizer/` using the existing Vertical Drama package pattern.

The skill's job:

- receive selected categories/presets and optional business context;
- choose one primary story spine and supporting flavors;
- synthesize one coherent preset-shaped draft;
- return structured JSON only.

Output must match the wizard/preset shape:

- `title`
- `category`
- `logline`
- `mainPlot`
- `seasonArc`
- `tone`
- `cliffhangerStyle`
- `characters`
- `visualBible`
- `mixRecipe`
- `warnings`
- `contract_version`

The skill prompt should explicitly prevent copy-paste collage behavior. It should instruct the LLM to blend flavors into one natural premise with one main location, one ensemble, one recurring service situation, and one short-form comedy/drama engine.

### 3. Backend Synthesis Service

Add `verticalDramaPresetSynthesis.ts`.

It should mirror the safe LLM flow from `verticalDramaStoryBible.ts` and `verticalDramaScriptGeneration.ts`:

1. Validate input and cap selection count.
2. Check credits before LLM call.
3. Load the `vertical-drama-preset-synthesizer` skill prompt.
4. Build a compact JSON prompt from selected presets/categories and optional context.
5. Call the configured text model with JSON retry behavior.
6. Validate output with Zod.
7. Deduct credits only after schema-valid output.
8. Return the draft and model/credit metadata.

Recommended constraints:

- selected preset/category count: minimum 2, maximum 5 for MVP;
- optional primary flavor; if absent, service chooses the first selected item as primary;
- max context text length to avoid prompt bloat;
- no DB write in synthesis mutation.

### 4. tRPC Procedure

Add `verticalDramaSeries.synthesizeGenrePreset`.

Input:

- `locale`
- `selectedPresetIds`
- `selectedCategories`
- `primarySelectionId?`
- `businessContext?`
- `productContext?`
- `targetEpisodeCount?`
- `toneHint?`

Behavior:

- protected by the same `verticalDramaProcedure` and feature flag as the rest of the router;
- loads only global presets plus caller-owned private presets;
- rejects IDs not visible to the caller;
- passes normalized selected preset details to the synthesis service;
- returns `{ draft, creditsUsed, model }`.

### 5. Create Wizard UX

Keep the first tab as the only place users think about preset strategy. Add a small segmented control:

- `เลือก Preset`
- `ผสมหลายแนวด้วย AI`

Single-preset mode stays as-is.

Mix mode should be visually simple:

- Header: `ให้ AI ช่วยผสมแนวเรื่อง`
- Helper copy: `เลือก 2-5 แนวที่อยากได้ แล้ว AI จะช่วยทำเป็นพล็อตตั้งต้นให้แก้ต่อได้`
- Selection cards/chips from existing presets/categories.
- Optional short field: `ธุรกิจ/ร้าน/บริการที่อยากผูกเรื่อง` with placeholder examples like `ร้านก๋วยเตี๋ยว`, `คาเฟ่ในชุมชน`, `ร้านซ่อมมือถือ`.
- Optional primary dropdown: `แนวหลัก` defaulted automatically.
- Button: `ให้ AI ผสมเป็น Preset`
- Loading text: `AI กำลังจัดรสชาติเรื่องให้เข้ากัน...`
- Draft preview with clear actions:
  - `ใช้ draft นี้`
  - `ปรับใหม่`
  - `ยกเลิก`

Applying a draft should call the same field-set path as `applyPreset`, but from a draft object rather than a DB row.

## UX Principle

The user should not need to understand how prompt synthesis works. The visible mental model is:

1. Pick story flavors.
2. Add the local business context if useful.
3. Let AI propose a complete draft.
4. Edit anything before creating the series.

## Security And Boundary Concerns

- New mutation must keep the existing tenant/user boundary when loading private presets.
- The backend must never accept arbitrary private preset IDs without visibility checks.
- Raw model output should not expose secrets or debug prompts to clients.
- No credit deduction on invalid/malformed LLM output.
- Cap input length and selection count to limit cost and prompt injection surface.

## Acceptance Criteria

- Six new curated presets appear in Thai UI and English UI.
- Category labels show readable Thai/English names for all six slugs.
- Existing single-preset picker still works.
- Mix mode lets users select 2-5 items and generate one editable draft.
- Draft output can be applied to the wizard fields without creating a saved preset row.
- Invalid selections show simple user-facing errors.
- Synthesis uses a dedicated skill package and validates structured JSON.
- Credits are deducted only for successful schema-valid synthesis.
- Focused tests pass.

## Rollout Notes

- Keep the feature inside the existing Vertical Drama feature flag.
- Do not run the seed script against production without explicit deployment/runbook confirmation because it rewrites global preset rows.
- If the app has production global presets beyond the seed file, verify the seed strategy before rollout.

## Verification Commands

```bash
cd apps/web && pnpm test -- verticalDramaPresetSynthesis
cd apps/web && pnpm test -- verticalDramaSeries.synthesizeGenrePreset
cd apps/web && pnpm test -- CreateSeriesWizard
cd apps/web && pnpm check
cd apps/web && pnpm seed:vertical-drama:genre-presets
```

For implementation verification, run the seed command only against an intended local/test database unless deployment specifically asks for production seeding.
