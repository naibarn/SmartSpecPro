# Research — VD P1 (Features 137 + 138 Phase 1)

## 2026-08-01 current-worktree refresh

SocratiCode MCP was unavailable, so the refresh used targeted shell/source
inspection. Current facts supersede older HEAD/count claims below:

- the earlier `basePlan` prerequisite is obsolete;
- none of the four new long-form flags or new P1 fields is implemented;
- direct `bible.presetVisualIdentity` readers remain across character, location,
  episode and lineage paths, requiring one source-aware resolver;
- the focused video-prompt baseline includes a stale test expecting two LLM
  executions while the runtime fallback makes four;
- model prompt/reference caps must come from selected-model metadata;
- refreshed Specs 137–139 and `current-worktree-reconciliation.md` are current
  authority. Historical anchors below are discovery hints to re-verify.

Date: 2026-07-23 · HEAD `941547ff1` · Method: 3 parallel read-only Explore agents
(SocratiCode MCP unavailable this session → shell/grep fallback, per CLAUDE.md).
Web research skipped: every external fact was verified earlier this session
(kie.ai gpt-image-2 API doc supplied by the user; Grok I2V/R2V limits in 137 §3).

> **All paths relative to `apps/web/` unless noted.**
> RUNNER = `server/services/verticalDramaVideoMotionPromptGeneration.ts` (3911 lines)
> ROUTER = `server/routers/verticalDramaEpisodes.ts` (16778 lines)
> SFG = `server/services/verticalDramaStartFrameGeneration.ts`

---

## 0. Corrections to the specs and to session memory (READ FIRST)

| Claim | Reality | Impact |
|---|---|---|
| 138 §3: `location.data` holds `description`, `environment`, `timeOfDay`, `mood`, `aggregatedFacts` | **FALSE.** Only TWO keys exist in code: `description` (prose) and `primaryAssetLinkId`. Writers: `verticalDramaLocationReconciliation.ts:382`, `verticalDramaSeries.ts:3841`, `verticalDramaLocations.ts:370-371`, `verticalDramaLocationStock.ts:836`. `environment`/`timeOfDay`/`mood` are **NOT FOUND** anywhere | The scene visual state cannot be *derived* from stored location data — the skill must author lighting/time-of-day from scratch (prose description + the location image + shot summaries). Design unchanged, input list corrected |
| Flag name `verticalDramaSeriesQualityLedgers` (spec + memory) | **Wrong name.** Real flag is `verticalDramaQualityLedgers` (`shared/featureFlags.ts:197`) | Cosmetic, but fix the memory |
| Memory `project_vd_video_prompt_suites_red_baseline`: "generateShotVideoPrompt/split suites 40-red" | **REFUTED at HEAD.** Those suites are 100% green (43/43 and 10/10; whole video-prompt group 266/266). The healing branch was merged | The methodology (fail-set identity diff) is still mandatory — but it must be pointed at the **image-reference** suites, not the video-prompt ones |
| 137 §9.5 assumed the media layer's per-model cap applies to VD | **FALSE.** VD calls `mediaGenerationService.generateImageAsync` **directly** (`ROUTER:10441`), bypassing the `media.*` tRPC router, so `assertMediaPromptWithinModelLimit` never runs for any VD render. The helpers are **module-private** in `media.ts:669/681` | Item 14 is real plumbing work: extract the resolver, thread `configJson` (fetched at `ROUTER:10105-10113` but never forwarded) |
| `gpt-image-2` in the static model registry | **NOT FOUND** in `modelRegistry.ts`. Static rows carry `maxPromptLength: 5000` for several other models | The 20,000 budget must come from the DB `media_models.configJson` row (seed `scripts/seed-media-models-kie-ai.ts:1545+`) |

### Genuine production bug discovered at HEAD (not a test artifact)

`ReferenceError: basePlan is not defined` thrown from `ROUTER` (`basePlan` used
at ~`:9206-9272` and `:12602-13319`). It fails 2 tests in
`verticalDramaEpisodes.generateShotStartFramePrompt.test.ts`. This is in the
exact mutation Feature 138 P1 must edit → treat as a **prerequisite fix**.

---

## 1. Feature 137 P1 — anchors

### 1.1 `frame_analysis`

| Thing | Anchor |
|---|---|
| Zod | `RUNNER:1187-1203` inside `shotVideoPromptOutputSchema` (`:1133-1205`, ends `.passthrough()`) |
| REQUEST line | `RUNNER:1328-1330` (conditional, `null` when off) |
| skill.md | `skills/vertical-drama-shot-video-prompt/skill.md:140-175`; JSON contract `:68-77`; subshots twin `…-subshots/skill.md:146-178` |
| Normalizer | `normalizeFrameAnalysis` `RUNNER:1421-1440` — **drops `note`**, caps people at 6 |
| Result field | `RUNNER:1808` / `:2474`; stamped `:2370` / `:2932` |

**The gate (verbatim, `RUNNER:2143`):**
```ts
const hasEstablishedCharacters = (params.characterReferenceImages?.length ?? 0) >= 2;
```
Same expression at `RUNNER:2143, 2709, 3361, 3570` — **and the real upstream gate**
`ROUTER:14367-14376`:
```ts
const shotVideoCharacterReferenceImages =
  (frame?.requiredCharacterRefs?.length ?? 0) >= 2
    ? await resolveShotVideoPromptCharacterReferenceImages(...)
    : undefined;
```
Widening the runner alone is a **no-op** (router passes `undefined`); widening the
router alone raises vision cost on every solo shot. **Five sites, one change.**

### 1.2 Prompt composition

- System prompt = skill.md verbatim (`loadShotVideoPromptSystemPrompt` `RUNNER:1080-1110`).
- User prompt = `buildShotVideoPromptUserPrompt` `RUNNER:1822-2002` — a single
  `[...].filter(Boolean).join("\n")` array (`:1888-2001`). Twin:
  `buildSpeakerSwitchUserPrompt` `RUNNER:2489-2658` (duplicated lines, must stay in lockstep).
- **Copyable conditional-block idiom** (`RUNNER:1981-1983`, NATIVE AUDIO): ternary
  returning `null` when off ⇒ `.filter(Boolean)` removes it ⇒ byte-identical.
- Model-family fact block: `buildTargetVideoModelFactBlock` `RUNNER:1312-1335`;
  family resolver `RUNNER:1283-1297` → `shared/verticalDramaSeries/videoPromptModelFamily.ts:81-96`.
  **Code emits only the bare token; all per-family wording lives in skill.md** (`:451-518`).

### 1.3 Judge

- Orchestrators `RUNNER:3311-3496` / `:3518-3727`. Calls: 2 candidates + 1 judge
  (+1 repair) = **3 base / 4 with repair**. Fail-open (`:3274-3277`).
- Dimensions live ONLY in `skills/vertical-drama-video-prompt-judge/skill.md`
  (gates `:84-110`, craft `:112-136`). Zod `judgeOutputSchema` `RUNNER:2989-2996` —
  `scores` is `z.array(z.object({}).passthrough())`, **never read by code**
  (only `winner_index` `:3433`, `verdict` `:3436`, `repair_instruction` `:3454`).
- ⇒ A new dimension is **decorative** unless backed by a deterministic fact in
  `VdVideoPromptCandidateFactSheet` (`RUNNER:3037-3047`, built `:3061-3100`,
  serialized `:3170`) and/or a step in `pickBetterCandidateByHardFacts` (`:3111-3125`).
- Judge user prompt `buildJudgeUserPrompt` `:3134-3190`; per-candidate block `:3162-3173`
  already emits `frame_analysis` at `:3169` → `motion_profile` goes alongside.

### 1.4 Persist (the whitelist trap)

- `generateShotVideoPrompt` mutation `ROUTER:13814`; persist txn `:14645-14763`;
  row-lock re-read `:14645-14661`.
- Clip literals: **existing-pack `ROUTER:14688-14701`**, **minimal-pack `:14727-14740`**,
  **split-shot twin `ROUTER:6799`**. `frameAnalysis` stamped `:14699` / `:14738`.
- **There is NO zod over `motionPromptPack`** — it is a plain TS type
  (`shared/verticalDramaSeries/contracts.ts:873`, `frameAnalysis` at `:971-974`)
  over a jsonb column. Because the persist path builds **fresh object literals**,
  any field not named there is **silently dropped, with no type error**.
- Bulk projector `projectMotionPromptPack` `RUNNER:387-466` (type `:290-327`) is a
  second, narrower whitelist that already drops `frameAnalysis`.

### 1.5 `negative_motion_prompt`

Pure passthrough end-to-end: zod `RUNNER:1136` → result `:2362` → persist
`ROUTER:14692`/`:14731` → formatter `verticalDramaVideoPromptFormatter.ts:453`.
**No length cap** (`ensurePromptWithinLimit` only touches `result.prompt`,
`ROUTER:14514-14537`), no dedup, no sanitization. Artifact negatives are authored in
skill.md `:275-292` (+ subshots `:292-310`, pack `:131-137`).
**grok never receives it** — `videoPromptFamilySupportsNegativePrompt` returns false
(`videoPromptModelFamily.ts:103-107`).

### 1.6 Feature-flag idiom (copy exactly)

Helper `getTenantFeatureFlags` — `server/services/tenantFeatureFlagService.ts:183`.
Router-local resolver (`ROUTER:3541-3546`, doc `:3548-3564`):
```ts
async function resolveVerticalDramaRetentionHooksFlag(tenantId: string): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaRetentionHooks === true;
}
```
Resolve ONCE per request (`ROUTER:13906-13910`), thread the boolean; every service
param defaults to `false`/byte-identical (`RUNNER:1461-1470`, consumed `:1863`).
**A new flag needs FOUR registrations:** interface `shared/featureFlags.ts:~205`,
key list `:~423`, defaults map `:~635` (must be `false`), admin group
`client/src/components/admin/tenantFeatureFlagGroups.ts:~206`.

### 1.7 Authoring skills (draft-time prevention)

- Storyboard: `skills/vertical-drama-storyboard-shotgrid/skill.md`; service
  `verticalDramaStoryboardGeneration.ts:89`. Best structural sibling for new
  guidance: `## Shot-to-beat attribution and silence budget` (`skill.md:454`).
  Existing scene section: `## Location continuity and scene grouping` (`:228`).
- Deep-draft: `skills/vertical-drama-full-story-architect/skill.md`
  (**lowercase only — no SKILL.md twin**); loader `verticalDramaStoryBible.ts:5536`;
  prompts `:3529-3663`; per-shot zod `shotDraftSchema` `:361-410`.

### 1.8 House pattern for a new pure module

Best template: `shared/verticalDramaSeries/audienceAgeRating.ts` — tuple → union →
type guard → lenient `resolveX(unknown)` → labels Record → `renderXBlock()` prompt-fact
renderer, with a header stating the skill-first split. Runner-ups:
`videoPromptModelFamily.ts:18-107` (never-throws resolver),
`retentionFacts.ts:1-30` ("only counts, never judges, never throws"),
`presetVisualIdentity.ts:1-11` (LLM-asserted half + deterministic half).

---

## 2. Feature 138 P1 — anchors

### 2.1 Prompt-time vision images (`SFG:1871` `buildStartFrameShotPromptVisionImages`)

Caps: `VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES = 6` (`SFG:1847`),
`…MAX_PORTRAITS = 4` (`SFG:1849`).
Order: own image (`:1880`, unlabeled) → ≤4 portraits (`:1885`, label
`` `Image ${idx + 1} reference: ${portrait.label}` `` `:1897`) → ONE location
(`:1902`: `` label: `Location reference: ${…locationReferenceImage.label}` ``) →
`slice(0, 6)` (`:1909`) → `additionalImageUrls` appended **after** the clamp,
uncapped (`:1910-1912`).

⚠️ **`slice` keeps from the FRONT** ⇒ today, a shot with its own image + 4 portraits +
a location **already silently drops the location image** (no warn at all; portraits
warn at `:1887`). A neighbor anchor appended naively is dropped first.
`additionalImageUrls` is the only cap escape hatch.

### 2.2 Render-time references (`generateStartFrameImage`)

character `ROUTER:10024-10037` → location `:10085-10093` (**at most one URL**) →
product `:10098-10100`. Trim call verbatim `ROUTER:10130-10138`:
```ts
const { urls: referenceImageUrls, trimmedCount: trimmedProductReferenceCount } =
  mergeAndTrimReferenceImageUrls(characterRefUrls, locationRefUrls, productRefUrls,
                                 imageCapabilities.maxReferenceImages);
```
Helper `server/services/verticalDramaProductTieIn.ts:922` — concat, dedupe by first
occurrence (`:928-930`), `slice(0, max)` (`:935`) ⇒ **trims from the END**
(character > location > product). **Fixed 3-array positional signature; 3 call sites**
(`ROUTER:10133`, `:10739` angle-grid, `:13616` reference-frame) + 12 positional
assertions in `verticalDramaProductTieIn.test.ts:299-380`.
Fail-closed capacity guard runs BEFORE the merge (`ROUTER:10126-10130`).
`imageCapabilities.maxReferenceImages` ← `modelRegistry.ts:341-352`
(`configJson.maxReferenceImages ?? referenceImageLimit`) — **`undefined` for most
models ⇒ the trim is a no-op** (`verticalDramaProductTieIn.ts:934`).

### 2.3 Regenerate-in-place (`repairShotImage` `ROUTER:11084`)

Only the shot's own current URL: `:11144` resolve, `:11454` (Hermes,
`roleFor: () => "current_image"`, `requireAll: true`), `:11519`
`referenceImageUrls: [currentUrl]`. No character/location/product refs, no trim call.

### 2.4 `startFramePlan` + carry-over (the destructive projector)

Plain TS type `contracts.ts:475-626`; `frames[]` fields `:497-620`
(`locationKey` `:547`, `approvedMediaAssetId` `:523`, `promptMode` `:604`).
Unknown keys **survive** DB round-trip: write `ROUTER:7352`
(`z.record(z.string(), z.unknown())`), read `:8617-8618` (raw cast), all patches are
spread-based.

**BUT `projectStartFramePlan` (`SFG:305`) returns a fresh literal**
`{ mode, selectedImageModelId, imagePromptLanguage?, frames }` (`SFG:389-395`) ⇒
**any new plan-level key such as `sceneVisualStates` is silently deleted on every
`start_frame_render_plan` regen.** Per-frame carry-over (`SFG:424-437`) currently
carries exactly 7 fields: `productReferenceAssetIds`, `canonicalShotSummary`,
`productRefsCustomized`, `approvedMediaAssetId`, `locationKey`, `angleGrid`,
`angleGridAssetIds`. Doc comment (`:334-377`) lists 6 and omits
`promptSafetyAdjustments`/`promptAnalysis` — **doc drift, don't trust it**.
Caller builds the map at `verticalDramaEpisodePipeline.ts:2764-2768`.

### 2.5 Scene grouping — and the architectural constraint

`resolveEffectiveShotLocationIdentity` `ROUTER:2041-2071` (**module-private**):
override → `{ locationKey: override, name: "" }` (`:2046-2048`, **empty name**);
else first `distinct_locations` group containing the shot (`:2060-2064`); else
`undefined` (`:2058`, `:2065`). Wrapper `:2073-2081`.
Schema `verticalDramaStoryboardGeneration.ts:279-286`, attached `.optional()` at `:316`,
mechanical fallback `:1060-1090`, partition validation
`verticalDramaEpisodePipeline.ts:917` (called `:1014`).

🔑 **The scene group is NOT available inside SFG.** The service receives only
`location?: { name, description, hasReferenceImage }` (`SFG:1504` per-shot, `SFG:478`
batch) — no `locationKey`, no storyboard. ⇒ **Scene-key resolution and the
`sceneVisualStates[locationKey]` lookup must live in ROUTER + pipeline; SFG can only
accept a pre-rendered block string as a new optional param.** This is the single most
important constraint for 138 P1.

### 2.6 Prompt engines — two totally different injection mechanics

Mode resolution `ROUTER:12806-12839`; stamp persisted `:13134-13136`; skill dispatch
`SFG:1209-1217`; folder map `shared/verticalDramaSeries/imagePromptModelFamily.ts:48`.

- **Engine A `cinematic_narrative` (+legacy):** user prompt
  `buildStartFrameShotPromptUserPrompt` `SFG:1605-1798` (filter(Boolean) array).
  Injection point: right after the `location:` line (`SFG:1712-1719`); add an optional
  param near `SFG:1504`.
- **Engine B `policy_safe_rewrite`:** does **not** use that builder at all
  (branch `SFG:1995`, decided `:1934-1935`). Synopsis user prompt `SFG:1324-1334`
  (LLM is *forbidden* to add blocking/lighting/props, `:1330`); the FINAL prompt is
  built deterministically in code — `buildDeterministicPolicySafeImagePrompt`
  `SFG:1336-1352`, returning `` `REFERENCE MAPPING: ${mappings.join("; ")}.\n${synopsis}` ``
  (`:1350`). **That is the only injection point for mode 1**, and the cap check
  immediately after (`SFG:2040-2045`) **THROWS `VdSchemaValidationError`** instead of
  trimming.
- **Engine C batch render plan:** `buildStartFrameRenderPlanUserPrompt` `SFG:641-748`
  (per-shot suffix `:697-699` / `:652-658`; episode-level near `:713-716`).
- **Engine D video-prompt shotContext:** type `RUNNER:1544-1600`; single-shot fact
  lines `RUNNER:1905-1975` (location image fact `:1945-1947`); split builder
  `RUNNER:2562-2600` (`:2593-2595`). **Both builders must be edited — duplicated.**

### 2.7 Prompt budget

`VD_IMAGE_PROMPT_MAX = 3800` — `contracts.ts:1351` (`VD_VIDEO_PROMPT_MAX = 2000` `:1359`).
Consumers: `verticalDramaPromptQc.ts:42/44/119`, `ensurePromptWithinLimit` `:351`,
**`SFG:2040-2045` (THROWS)**, zod `ROUTER:13469`, client counter
`VerticalDramaStoryboardPanel.tsx:95, 4669, 7775`.
`ensurePromptWithinLimit` call sites: `ROUTER:6669, 10344, 10924, 11428, 12004, 12043,
13068, 13420, 14514` + pipeline `:3848, 4013`. The two that matter: **`:13068`**
(post-authoring) and **`:10344`** (right before the paid render).

Shipped resolver idiom to extract — `media.ts:651-667` (`resolveConfiguredMaxPromptLength`,
reads `configJson.maxPromptLength ?? max_prompt_length`), `:669` `resolveModelMaxPromptLength`
(DB row → static registry fallback), `:681` `assertMediaPromptWithinModelLimit`.
**All module-private.** VD dispatch: `ROUTER:10441`
`mediaGenerationService.generateImageAsync({ prompt, model: resolvedImageModelId, … })` —
`pricingModel.configJson` IS fetched at `:10105-10113` and used for capabilities
(`:10115-10121`), resolution (`:10139`), transport (`:10173`), but **never forwarded**.

### 2.8 Location asset resolution

`resolveEffectiveShotLocationIdentity` → `resolveLocationRosterRowByIdentity`
(`ROUTER:2097`) → `verticalDramaLocationStock.getPrimaryReferenceUrl` (`:551`):
explicit `data.primaryAssetLinkId` (`:555-556`) else newest approved
`role = "establishing_plate"` (`:558-572`). Wrapper returning
`{url,name,description,hasReferenceImage}`: `ROUTER:2174-2214`.
`data` column: `drizzle/schema.ts:20829` jsonb, unique `(seriesId, locationKey)` `:20841`.

### 2.9 UI

Shot cards are a **flat `shots.map`** — `VerticalDramaStoryboardPanel.tsx:3283`
(container `:3280-3282`, card root `:3298`). **No scene-group wrapper exists.**
Scene groups render only in the separate `VerticalDramaLocationsBibleCard` (`:6145`,
mounted `:2508-2513`, row testid `:6467`). Client scene resolver mirror `:877-888`;
location chip `:4363-4470`. Copyable badge: engine badge `:4614-4634`.
Generate buttons `:3568-3620` / page wiring `VerticalDramaEpisodePage.tsx:5336-5373`.
Mutation-wiring example `VerticalDramaEpisodePage.tsx:2324-2346`; server counterpart
`setShotLocation` `ROUTER:9307-9386` (load-owned → validate → spread-patch → update →
return `{ startFramePlan }`). Client types to mirror: `VerticalDramaStartFramePlanFrame`
`VerticalDramaStoryboardPanel.tsx:556-596`.

### 2.10 New-skill plumbing (smallest complete template)

Copy `server/services/verticalDramaLocationDetector.ts`:
folder const `:85` → loader `:96-117` (`resolveSkillDirCandidates`
`skillFiles.ts:222`, `resolveSkillManifestPath` `:235`,
`SKILL_MANIFEST_FILENAMES = ["skill.md","SKILL.md"]` `:7` — **lowercase wins**) →
lenient zod `:120-140` → model `:220-223` (`resolveVerticalDramaSeriesModel`; vision
variant `resolveStartFrameShotPromptModel` `SFG:1810`) → call `:233-242`
(`executeJsonPlanningCallWithRetry`; vision `executeVisionAwareJsonCallWithRetry`
`SFG:2101-2112`) → credits gate `:218` + deduct `:251-269`
(`sourceType: "skill"`, idempotency suffix) → user prompt `:174-196` ending with
`VD_COMPACT_JSON_INSTRUCTION`.

---

## 3. Testing (measured, not assumed)

### 3.1 Config

`apps/web/vitest.config.ts`, Vitest 2.1.9, binary at repo-root `node_modules/.bin`.
`environment: "node"`; jsdom ONLY for `client/src/**/*.test.tsx`.
`include` covers `server/**`, `shared/**`, `client/src/**`, `drizzle/**`, `scripts/**`.
Aliases `@`→client/src, `@shared`→shared, `@db`→drizzle.
**Must run from `apps/web`** (CONFIRMED: from repo root it globs the monorepo and dies
`EACCES … data/hermes`). JWT_SECRET not needed by VD suites but harmless.

### 3.2 Measured baselines at HEAD `941547ff1`

**GATE A — video-prompt side: 7 files / 266 tests / ALL GREEN (~3.2s).** Fail-set = {}.
Files: `verticalDramaVideoMotionPromptGeneration` (92), `…ShotVideoPromptGeneration` (45),
`…JudgedShotVideoPromptGeneration` (15), `…VideoPromptFormatter` (36),
`…VideoPromptModelFamilyRealSkillFile` (25), router `generateShotVideoPrompt` (43),
router `generateAndPersistSplitShotVideoPrompt` (10).

**GATE B — start-frame / image-reference side: 24 files, 59 failed / 560 passed (619).**
Red files (reproduce in isolation):
- `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` — **56/164**
- `verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` — **2/18** (`basePlan` ReferenceError)
- `verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts` — **1/8**

All 11 `shared/verticalDramaSeries/__tests__` files green (285 tests); all start-frame
**service** tests green (127).

**Cascade mechanics (critical for diffing):** the 56 are ONE throw + 55 cascade. First
domino `shotReferencesAndQualityReview.test.ts:4385` (`generateVideoClip — reference
trimming (Phase 2.6) > skips hasEnoughCredits/deductCredits for a zero-cost model…`)
throws `TRPCError: โมเดลวิดีโอที่เลือกใช้ไม่ได้` because the fixture's
`selectedVideoModelId: "veo-3-1"` no longer matches the overridden catalog under
fail-closed `resolveEpisodeVideoModel`; it dies **before consuming 3 queued
`mockDb.select.mockReturnValueOnce`** entries, which leak into every later test.
⇒ Any change to `mockDb.select` call ordering reshuffles the set non-monotonically.
**Diff as a SET; "a name left" counts as progress only if no new name entered.**

Fail-set extraction (do NOT pipe through `tail` — it truncates the FAIL block):
```bash
... --reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u
```

### 3.3 Patterns to copy

- **Service mock header** (LLM + credits + rate limiter + `skillFiles` + `fs` +
  `parseSkillFile`): `verticalDramaVideoMotionPromptGeneration.test.ts` — full block
  reproduced by the research agent; `successResponse()` envelope helper included.
- **Real-file skill gate (the taught-not-wired gate):**
  `server/services/__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts`
  (25 tests, green). Escapes its own `vi.mock("fs")` via
  `vi.importActual<typeof import("fs")>("fs")`; **mirrors** `resolveSkillDirCandidates`'s
  path formula rather than importing it (importActual doesn't unmock transitive deps).
  Asserts: lowercase/UPPERCASE twins byte-identical (`:139-143`, `:230-234`), required
  section headers (`REQUIRED_SECTION_HEADERS` `:110-114`), `'"frame_analysis"'` present
  (`:158-161`), and that the CODE's fact block contains the literal section name
  (`:194` ↔ `RUNNER:1329`). Sibling: `verticalDramaImagePromptModesRealSkillFile.test.ts`.
  Lighter form: `it.skipIf(!skillManifestExists("<skill>"))`
  (`productReviewSequentialStoryboardSkillRunner.cinematicPromptEngine.test.ts:660-673`).
- **Byte-identical prompt template** (exactly our shape):
  `verticalDramaStartFrameGeneration.referenceFrameMode.test.ts` — 73 lines, zero mocks:
  absent ⇒ `not.toContain`, false ⇒ `not.toContain`, on ⇒ exact line position, and the
  key assertion `expect(withFlag.replace("<line>\n", "")).toBe(without)`.
- **Attach-list equality**: `shotReferencesAndQualityReview.test.ts` asserts
  `referenceImageUrls` with `toEqual([...])` plus
  `expect(mockDb.select).toHaveBeenCalledTimes(N)` as a "zero new queries" guard.
  Also `toEqual` on the full vision array in
  `verticalDramaStartFrameGeneration.imagePromptModes.test.ts:499-556` — **inserting any
  entry breaks 4 tests**.
- **Router scaffolding**: mock `../../_core/trpc` so `.mutation(fn)` returns the raw
  handler; call `router.procedureName({ ctx, input })`; `ctx()` is a plain object
  (no JWT); `selectChain(rows)`/`updateChain()` thenable stubs; queue one
  `mockReturnValueOnce` per `db.select()` call site **in order**.
- **Pure-module tests**: `shared/verticalDramaSeries/__tests__/<name>.test.ts` (newer
  convention). Templates: `imagePromptLanguage.test.ts` (3 tests, minimal),
  `videoPromptModelFamily.test.ts` (13 — happy path → negative/boundary → precedence →
  null-safety → frozen-set assertion on the exported union).
- **Real-LLM gate**: only one exists —
  `marketplaceAutoReview.sequentialRealLlmGate.test.ts`, env
  `MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE`, guard
  `describe.skipIf(!isSequentialRealLlmGateEnabled())` (`:224`), enabled only by the
  exact string `"1"`. **No VD real-LLM gate exists** → 137/138's "real-LLM gate test"
  requirement means creating the first VD one, or relying on the real-FILE gates.

### 3.4 Caveat verdicts

| Caveat | Verdict |
|---|---|
| video-prompt suites carry a 40-red baseline | **REFUTED at HEAD** — 266/266 green. Real red is on the image-reference side (Gate B) |
| `vi.clearAllMocks()` doesn't drain `…Once` queues | **CONFIRMED** — `@vitest/spy@2.1.9` `mockClear` never touches `onceImplementations`; only `mockReset` does. Documented in-repo at `verticalDramaLocations.test.ts:836-842`. **Mitigation: `mockDb.select.mockReset()` in every new `beforeEach`** |
| must run from `apps/web` | **CONFIRMED** |

---

## 4. Consolidated landmines for the plan

1. **Five gate sites must widen together** (4 runner + 1 router) or the frame_analysis
   widening is a no-op / a cost regression.
2. **Three persist whitelists** (`ROUTER:14688`, `:14727`, `:6799`) + the bulk projector
   (`RUNNER:387-466`) silently drop unlisted fields — no type error.
3. **`normalizeFrameAnalysis` drops unknown sub-fields** (`RUNNER:1421-1440`) — extend it
   or the new observability fields never reach the result.
4. **`projectStartFramePlan` deletes unknown plan-level keys** (`SFG:389-395`) —
   `sceneVisualStates` dies on every plan regen unless explicitly carried.
5. **Scene identity is router-only** — SFG must receive a pre-rendered string.
6. **`policy_safe_rewrite` builds its final prompt in code and THROWS over 3800**
   (`SFG:1350`, `:2040-2045`) — appending a lock there can break working shots.
7. **The 6-image cap already silently drops the location image**; a naive neighbor
   append is dropped first (`SFG:1909`).
8. **`mergeAndTrimReferenceImageUrls` has a fixed 3-array signature, 3 call sites, 12
   positional test assertions.**
9. **`maxReferenceImages` is `undefined` for most models** ⇒ trim is a no-op; testing
   trim behavior requires a model row that declares a limit.
10. **VD bypasses the media router**, so the per-model prompt cap needs new plumbing
    (extract from `media.ts`, forward `configJson`).
11. **Dual-case skill twins**: 22 of 28 VD skills have byte-identical `skill.md` +
    `SKILL.md`; lowercase wins at runtime; a real-file test asserts equality.
    `full-story-architect` has lowercase ONLY.
12. **`toEqual` vision-array + attach-list tests** break on any inserted entry.
13. **`resolveEffectiveShotLocationIdentity` returns `name: ""` for overrides** — key
    scene state on `locationKey` only, never name.
14. **A shot may have NO scene group** (`undefined`) — lookups must tolerate it.
15. **Judge `scores[]` is never read** — a new dimension needs a deterministic fact.
16. **`basePlan is not defined`** — real ReferenceError at HEAD in the mutation 138 P1
    edits; fix first.
