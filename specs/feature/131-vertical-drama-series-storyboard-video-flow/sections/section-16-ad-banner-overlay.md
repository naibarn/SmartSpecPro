# section-16-ad-banner-overlay

## Goal

Add a series-level ad banner overlay design studio and per-episode banner
compositing — a deliberate advertising LAYER on top of a rendered clip
(bottom band / side vertical / fullscreen), explicitly separate from
in-story product tie-in (section-08 / spec §13-§13.2). Implements spec
§6.8.3 (skill) and §13.3 (full contract). Shipped and deployed 2026-07-08/09
(task #30); this section is written as an implementation record, matching
the convention used for section-10.

## Depends On

- section-01-skill-packages (new skill folder)
- section-02-contracts-persistence-assets (asset/ownership conventions)
- section-08-provider-qc-product-tie-in (model routing, product reference
  resolution, `productTieIn` jsonb conventions this design reuses)

Blocks: the render-time compositing half of this work (section-09 / spec
§12.4 Final Render Suite, task #21) — banners are DESIGNED here and
COMPOSITED there; this section does not implement `buildFinalRenderFfmpegArgs`.

Feature flag: `verticalDramaSeriesAdBannerOverlay` (F131W, spec §17).
Default OFF; enabled on `tenant-001` and `tenant-ZCSKEM9s` as of this spec
version (verified against the `tenants.featureFlags` column, 2026-07-09).

## Files

Created (task #30-A1/#30-A2, verified on disk):

- `apps/web/shared/verticalDramaSeries/adBannerPresets.ts` — style presets
  (`VD_AD_BANNER_STYLE_IDS`, 10 ids), placement presets, types, pure
  validators; isomorphic (no server/DB import)
- `apps/web/shared/verticalDramaSeries/adBannerPresets.test.ts`
- `apps/web/skills/vertical-drama-ad-banner-prompt/` — skill folder (skill.md
  + SKILL.md + schemas/{input,output,ui}.schema.json), loaded via the same
  `loadSkillSystemPrompt` pattern as every other vertical-drama skill
- server service for prompt generation (vision-capable model resolution)
- 3 router mutations/queries on `verticalDramaSeries.ts`:
  `generateAdBannerPrompt`, `generateAdBannerImage`, `getAdBannerImageStatus`
- 1 router mutation on `verticalDramaEpisodes.ts`: `updateEpisodeAdBannerPlan`
- UI: banner studio section inside the existing Product Tie-in tab, plus
  per-episode banner selection UI in the assembly/render options section

Modified:

- `apps/web/drizzle/schema.ts` — `vertical_drama_episodes.adBannerPlan` jsonb
  NULL (manual SQL + provenance file, per the DB Safety Protocol — series
  side needed NO migration, it reuses the existing `productTieIn` jsonb)
- `apps/web/shared/featureFlags.ts` — F131W, 4 registration points
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` — admin
  group entry

## Positioning: Not In-Story Tie-In

See spec §13.3 for the full rationale. The one point that matters most for
implementers: the banner prompt path is DELIBERATELY exempt from
`VD_PRODUCT_LOCK_INSTRUCTION` / `sanitizeBrandMentionsInPrompt`
(`server/services/verticalDramaProductTieIn.ts`) — those guards exist to
stop an IN-STORY shot from reading like an ad, which is the opposite of what
a banner is for. `forbiddenClaims[]`, `regulatedCategory` →
`requireHumanApproval`, and `disclosurePolicy` still apply to banners.

## Data Model

See spec §13.3 for the full `VerticalDramaAdBannerDesign` (series-level,
inside `productTieIn.adBanners[]`, max 5) and `VerticalDramaAdBannerPlan`
(episode-level, `adBannerPlan` column) shapes. Placement boxes (1080×1920
frame coordinates) and the 10 style preset ids are also pinned there —
implementers should treat spec §13.3 as the contract of record and this
section as the file/task map.

## Skill: `vertical-drama-ad-banner-prompt`

- Input: product name/category/copy/forbidden claims, image analysis of the
  product reference (color/packaging/mood, read by a vision-capable model),
  the selected style preset's prompt tokens, placement composition
  constraints, `language: "th"`.
- Output (JSON): `{ imagePrompt, negativePrompt, textInImage: string[],
  compositionNotes, complianceNotes }`.
- Model resolution (capability-based, never hard-coded):
  `selectBestLlmModel({ supportsVision: true, supportsStructuredOutputs: true })`
  when a product image is available, falling back to `resolveStoryBibleModel()`
  — mirrors `resolveShotVideoPromptModel`'s resolution pattern.
- Thai-text-in-image risk is real (AI image generation renders non-Latin
  script, including Thai, unreliably) and is surfaced to the user via each
  preset's `textInImageRisk` rating, not hidden.

## Generation Flow

1. Series banner studio (Product Tie-in tab): pick style preset (recommended
   ones surface first via `fitCategories` matching the tie-in's
   `productCategory`) → pick placement → fill copy fields → pick media
   model + aspect/size the model supports (same filtering pattern as Media
   Studio) → "Generate prompt" (`generateAdBannerPrompt`) → prompt renders in
   the reused `InlineEditablePromptBox` component and is editable →
   "Generate banner image" (`generateAdBannerImage`, async submit) → poll
   (`getAdBannerImageStatus`) → preview on a mock 9:16 frame at the chosen
   placement.
2. Reference images: product references are attached to the image-generation
   call the same way story-tie-in shots attach them (cap 3,
   `resolveProductReferenceImageUrls`, trimmed to the model's
   `maxReferenceImages`).
3. Regulated category → badge "ต้องอนุมัติก่อนใช้" (needs approval before use)
   + an explicit approve action; a banner in this state cannot be selected
   into an episode's `adBannerPlan` for rendering until approved.
4. Episode-level usage (`updateEpisodeAdBannerPlan`): pick from the series'
   `ready` banner designs, set timing (entire clip, or start-second +
   duration window) per selection.

## Guardrails (deterministic, v1)

- ≤ 5 banner designs per series; ≤ 5 selections per episode.
- Fullscreen selections must not overlap each other in time.
- All timing must resolve within the actual clip length (see spec §12.4's
  entire-mode-resolves-after-probe fix, task #21-B).
- `forbiddenClaims[]` checked in `prompt.final` and every copy field, before
  generation AND before render — a violation blocks with a reason, never a
  silent strip.
- Non-blocking warnings: fullscreen banners together exceeding 20% of clip
  length; a band and a side banner running simultaneously for the whole clip
  ("ad fatigue").
- Credits: banner image generation is charged through the normal media
  pipeline like any other image generation — no special-cased pricing.

## UI/UX Contract

### Target User / JTBD

- Role: series owner/operator designing a reusable ad banner for a product
  and choosing where/when it appears on specific episodes.
- Entry point: Product Tie-in tab (design) and the episode
  assembly/render-options surface (per-episode selection).
- Success outcome: a banner design that matches one of 10 current ad-design
  trends, previewed accurately at its placement, approved when regulated,
  and composited correctly at render time.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Banner studio | Product Tie-in tab (series detail) | new section: design cards, style/placement pickers, prompt box, generate/preview |
| Per-episode banner selection | episode assembly / render-options section | pick ready designs + per-selection timing |
| Regulated-category approval | banner studio | badge + approve action, gates render inclusion |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `adBannerPresets.ts` | shared | style/placement presets, validators | none (pure) |
| `vertical-drama-ad-banner-prompt` skill | skills folder | prompt generation contract | product data, style tokens |
| Banner studio UI | Product Tie-in tab component | design CRUD, prompt/image generation | 3 series-router endpoints |
| Episode banner plan UI | assembly/render-options component | per-episode selection + timing | `updateEpisodeAdBannerPlan`, series' ready designs |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| no designs yet | empty state with "create a banner" CTA | UI test |
| prompt generating | pending state on the prompt box | UI test |
| prompt ready, editable | inline editable prompt, "generate image" enabled | UI test |
| image generating | polling/pending state | UI test |
| ready | preview on 9:16 mock frame at placement | UI test |
| regulated, unapproved | badge + blocked from episode selection | unit/UI test |
| episode selection over cap / fullscreen overlap | validation error, selection blocked | unit test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | design cards stack; placement mock frame scales down | screenshot |
| tablet 768x1024 | 2-column design cards | screenshot |
| desktop 1440x900 | full studio layout with side-by-side prompt/preview | screenshot |

### Accessibility Acceptance

- Style/placement pickers are keyboard-navigable with text labels (not
  color/icon-only).
- Regulated-category warning is announced, not only visually badged.
- Prompt box is keyboard-editable and copyable.

### Copy Contract

- Thai-first; style preset descriptions (`essenceTh`) and placement labels
  ship in Thai with English fallback.
- Regulated-category and validation errors state the reason plainly (which
  cap was hit, which claim triggered the block).

### Browser Evidence Required

Capture: empty studio, prompt generated + editable, image ready + preview,
regulated-category blocked state, episode selection with a validation error
(over-cap or fullscreen overlap).

## Tests First

- Test: `adBannerPresets.ts` validators reject a 6th banner design, a 6th
  episode selection, and overlapping fullscreen timing windows.
- Test: style preset recommendation ordering matches `fitCategories` against
  the tie-in's `productCategory`.
- Test: `generateAdBannerPrompt` resolves a vision-capable model when a
  product image exists and falls back to `resolveStoryBibleModel()` when it
  does not.
- Test: `forbiddenClaims[]` violations in the generated prompt or any copy
  field block generation/render with a stated reason.
- Test: a regulated-category banner cannot be selected into an episode plan
  until approved.
- Test: with `verticalDramaSeriesAdBannerOverlay` off, no banner studio UI
  renders and `productTieIn.adBanners`/`adBannerPlan` are inert (byte-identical
  to pre-task-#30 behavior).
- Test: reference image resolution for banner generation reuses the same
  cap-3 / `maxReferenceImages` trim as story tie-in shots.

## Implementation Tasks

1. Shared style/placement presets + validators + tests (`adBannerPresets.ts`).
2. `vertical_drama_episodes.adBannerPlan` column (manual SQL + provenance +
   backup/verify per DB Safety Protocol).
3. Skill folder `vertical-drama-ad-banner-prompt` + prompt-generation service
   (vision-capable resolver) + `generateAdBannerPrompt` endpoint.
4. `generateAdBannerImage` (async submit via the existing media-generation
   pipeline with product references attached) + `getAdBannerImageStatus` poll.
5. Banner studio UI in the Product Tie-in tab; per-episode selection UI in
   the assembly/render-options surface; Thai copy.
6. Feature flag F131W registration (4 points) + admin group entry + tests
   across shared/service/router/component layers.

## Acceptance

- A series can design up to 5 ad banners across the 10 style presets and 3
  placements, with an editable, vision-grounded prompt.
- A regulated-category banner cannot reach an episode's render plan without
  explicit approval.
- An episode can select up to 5 ready banners with per-selection timing,
  validated against the fullscreen-overlap and cap rules.
- With the flag off, the feature is completely inert — no schema behavior
  change, no UI surface.
- Compositing correctness (z-order, crop, fade, timing-vs-actual-clip-length)
  is section-09's responsibility (spec §12.4) — this section's acceptance
  stops at "a valid, approved `adBannerPlan` exists and is ready to render."

## Verification

```bash
cd apps/web && pnpm test -- adBannerPresets
cd apps/web && pnpm test -- verticalDramaAdBanner
cd apps/web && pnpm check
```
