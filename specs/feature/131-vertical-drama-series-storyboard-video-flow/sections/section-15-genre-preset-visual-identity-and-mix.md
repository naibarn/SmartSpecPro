# section-15-genre-preset-visual-identity-and-mix

## Goal

Make genre presets able to reproduce a specific high-tech aesthetic
end-to-end (structured visual identity flowing from preset → bible →
character refs → start frames → motion prompts), seed a `sci_fi_mecha`
preset family grounded in the 2026-07-07 reference images, and upgrade
"Mix and Match" preset synthesis so every selected preset VERIFIABLY
contributes to the blend. Implements spec §8.2.2.

Problem being fixed: `vertical_drama_genre_presets.visualBible` is one prose
blob, so a preset's look dilutes before it reaches image prompts; and the
shipped `synthesizeGenrePreset` ("one primary story spine and supporting
flavors", `mixRecipe{primaryFlavor, supportingFlavors, rationale}`) lets
non-primary presets vanish into unverifiable "flavor" — the user's complaint
"preset แต่ละแบบไม่ถูกผสมจริง ๆ".

## Depends On

- section-02-contracts-persistence-assets (column addition pattern)
- section-10-ui-redesign-genre-presets-story-generation (shipped preset library + picker)
- section-11-user-and-admin-preset-ownership (scope/ownership rules apply to new fields)

Feature flag: `verticalDramaSeriesPresetMixV2` (independent; default OFF —
flags-off keeps shipped preset picker + Mix and Match byte-identical).

## Files

Create:

- `apps/web/shared/verticalDramaSeries/presetVisualIdentity.ts` — `VerticalDramaPresetVisualIdentity`, deterministic merge helpers, blend-coverage types
- `apps/web/shared/verticalDramaSeries/__tests__/presetVisualIdentity.test.ts`

Modify:

- `apps/web/drizzle/schema.ts` — nullable `visualIdentityJson` jsonb on `vertical_drama_genre_presets` (ADD COLUMN, low risk; follow Database Safety Protocol: backup table, `pnpm db:push`, verify counts)
- `apps/web/scripts/seed-vertical-drama-genre-presets.ts` — `sci_fi_mecha` category family (>= 4 presets, th + en), each with full `visualIdentityJson`
- `apps/web/server/services/verticalDramaPresetSynthesis.ts` — v2: weights, `facetAssignments` pre-pass, deterministic visual-identity merge, `blendReport` output (contract_version 2 superset), blend QC gate with one corrective retry
- `apps/web/server/routers/verticalDramaSeries.ts` — `synthesizeGenrePresetInput` gains `selections: [{id, weight}]` (back-compat with `selectedPresetIds`); create/apply-preset path stamps `visualIdentityJson` into the series bible fields
- `apps/web/server/services/verticalDramaCharacters.ts` — character reference prompts consume archetype `look` + wardrobe + palette when the series carries a preset visual identity
- start-frame / contact-sheet prompt construction (`verticalDramaStartFramePlanGeneration` path) — append `imagePromptFragments.positive`, merge `.negative`; add "visual identity adherence" line to the per-frame QC checklist
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` — style/lighting tokens carried into motion prompts
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx` — per-selection weight slider (1-5), blend report panel (per-facet contributions + coverage), under-blend warning state
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` / `verticalDramaWorkspaceCopy.ts` — Thai copy for weights, blend report, under-blend warning

## Contracts

Pinned in spec §8.2.2: `VerticalDramaPresetVisualIdentity` (styleName,
palette 3-6, lighting, environmentMotifs, wardrobeGrammar,
signaturePropsAndCompanions, cameraGrammar, characterArchetypes,
imagePromptFragments{positive,negative}, referenceAssetIds?).

Blend contracts:

```ts
type VerticalDramaPresetMixSelection = { presetId: string; weight: 1 | 2 | 3 | 4 | 5 };

type VerticalDramaBlendFacet =
  | "story_spine" | "situations" | "characters" | "tone"
  | "cliffhanger_style" | "world_texture" | "visual_identity" | "product_fit";

type VerticalDramaBlendReport = {
  contractVersion: 2;
  facets: Array<{
    facet: VerticalDramaBlendFacet;
    contributions: Array<{ presetId: string; element: string; kept: boolean }>;
  }>;
  contributionCoverage: Record<string, number>; // presetId -> facet count with kept contribution
  minFacetsPerPreset: number;                   // default 2
  underBlended: string[];                       // presetIds below the floor after retry
};
```

Hard rules:

1. Story spine comes from `primarySelectionId`; every OTHER selected preset
   must land kept contributions in >= `minFacetsPerPreset` (default 2)
   facets, scaled by its weight. The `facetAssignments` table is built
   deterministically BEFORE the LLM call; the LLM fills slots, it cannot
   silently drop a preset.
2. `visual_identity` facet merges deterministically in code (palette
   weighted-merge primary-heavy capped 6; motif/wardrobe/prop union +
   dedupe; negative-fragment union). The LLM writes only the blended
   `styleName` and a coherence pass.
3. Blend QC gate: coverage below floor → ONE auto-retry with a corrective
   instruction naming the under-blended preset → still failing → visible
   warning with coverage numbers; never a silent collapse.
4. Output is a superset: `contract_version: 1` results (shipped) remain
   parseable wherever v2 is consumed.
5. Flow-through: a series created/applied from a preset with
   `visualIdentityJson` stamps identity into bible fields AND all downstream
   prompt layers (character refs, start frames/contact sheets, motion
   prompts); preset-driven series add "visual identity adherence" to the
   start-frame QC checklist.
6. Ownership/scope rules from section-11 apply unchanged to the new column
   (global vs private presets; user presets may carry visual identity).
7. Seed content ships both locales (th primary, en secondary) and the
   `sci_fi_mecha` presets stay wardrobe-safe/age-appropriate per the
   existing age policy defaults.

## UI/UX Contract

### Target User / JTBD

- Role: creator picking or mixing presets to get a specific look.
- Goal: get a series whose IMAGES match the chosen aesthetic, and see proof
  of what each mixed preset contributed.
- Entry: create-series wizard step 1 (preset picker / Mix and Match).
- Success: preset look survives to start frames; blend report shows every
  selection contributed.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Preset picker cards | `CreateSeriesWizard.tsx` | visual identity chip row (styleName + palette swatches) |
| Mix and Match panel | `CreateSeriesWizard.tsx` | weight slider per selection (1-5) |
| Blend report | wizard step 1 result | per-facet contribution list + coverage per preset |
| Under-blend warning | wizard step 1 result | warning card naming the preset + retry/adjust actions |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `presetVisualIdentity` helpers | shared module | merge + coverage math | preset rows |
| `verticalDramaPresetSynthesis` v2 | server service | facet assignment, LLM call, blend QC gate | selections + weights |
| `VerticalDramaBlendReportPanel` | new UI component | blend report rendering | synthesis v2 result |
| Weight slider | `CreateSeriesWizard.tsx` | per-selection weight | selections state |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | synthesis pending state (existing) | UI test |
| success (well-blended) | blend report with all coverages >= floor | UI/service test |
| under-blended after retry | warning card with coverage numbers + adjust CTA | unit/UI test |
| v1 result (flag off) | shipped Mix and Match UI unchanged | UI test |
| preset with visual identity | chip row + swatches on card | UI test |
| legacy preset (no identity) | card renders without chip row, no errors | UI test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | swatches wrap; blend report collapses per facet | screenshot |
| tablet 768x1024 | weight sliders usable by touch | screenshot |
| desktop 1440x900 | blend report side panel fits wizard | screenshot |

### Accessibility Acceptance

- Palette swatches carry text labels (color names), never color-only.
- Weight sliders are keyboard operable with visible value.
- Under-blend warning is text + severity, announced on appearance.

### Copy Contract

- "น้ำหนักการผสม {n}/5"
- "สิ่งที่ preset นี้เพิ่มเข้ามา: {elements}"
- "preset '{title}' ยังไม่ถูกผสมจริง (ครอบคลุม {n}/{floor} ด้าน) — เพิ่มน้ำหนักหรือเลือกใหม่"
- "สไตล์ภาพ: {styleName}"

### Browser Evidence Required

Capture: preset card with identity chips, mix with weights, blend report
(well-blended), under-blend warning, flag off (shipped UI unchanged).

## Tests First

- Test: `visualIdentityJson` round-trips through the new column; legacy rows (null) list and apply without errors.
- Test: create-from-preset stamps visual identity into bible fields; character reference prompts include archetype look + wardrobe + palette; start-frame/contact-sheet prompts append positive fragments and merge negative fragments; motion prompts carry style tokens (flow-through, each layer asserted).
- Test: deterministic visual-identity merge — palette weighted-merge caps at 6 primary-heavy, unions dedupe, negative union; same inputs → identical output.
- Test: `facetAssignments` pre-pass requires every selected preset in >= `minFacetsPerPreset` facets, scaled by weight; primary owns story_spine.
- Test: blend QC gate — coverage below floor triggers exactly one corrective retry naming the preset, then surfaces `underBlended` with coverage numbers.
- Test: `blendReport.contributionCoverage` counts only `kept: true` contributions.
- Test: synthesis v2 output is a superset — v1 fixtures parse; v2 sets contract_version 2.
- Test: input back-compat — `selectedPresetIds` (no weights) still works with equal default weights.
- Test: `sci_fi_mecha` seeds — >= 4 presets, both locales, each with complete `visualIdentityJson` (all required fields non-empty).
- Test: with `verticalDramaSeriesPresetMixV2` off, `synthesizeGenrePreset` request/response and preset picker behavior are byte-compatible with shipped v1.
- Test: section-11 scope rules hold for the new column (private preset identity invisible cross-user; global readable).

## Implementation Tasks

1. Shared contracts + deterministic merge/coverage helpers.
2. Schema column (ADD COLUMN, DB safety protocol: backup → `pnpm db:push` → verify) + drizzle types.
3. Seed `sci_fi_mecha` family (4+ presets, th/en, full identity JSON per spec §8.2.2 list).
4. Synthesis v2: weights input, facet pre-pass, deterministic identity merge, blendReport, QC gate + retry, superset schema.
5. Router input extension (back-compat) + create/apply stamping into bible.
6. Flow-through wiring: character prompts, start-frame/contact-sheet prompts, per-frame QC checklist line, motion prompt tokens.
7. Wizard UI: identity chips, weight sliders, blend report panel, under-blend warning, Thai copy.
8. Tests per the list above; fixtures: 3-preset mix with skewed weights, legacy preset, under-blend scenario.

## Acceptance

- A series created from a `sci_fi_mecha` preset produces character refs and
  start frames that visibly match the preset's palette/wardrobe/motifs
  (identity reaches pixels, not just the bible).
- A 3-preset mix yields a blend report proving every preset contributed >= 2
  facets, or a visible under-blend warning naming the offender — never a
  silent collapse into one flavor.
- Weights change contributions measurably (coverage shifts with weight).
- Flag off = shipped preset behavior unchanged.

## Verification

```bash
cd apps/web && pnpm test -- presetVisualIdentity
cd apps/web && pnpm test -- verticalDramaPresetSynthesis
cd apps/web && pnpm check
```
