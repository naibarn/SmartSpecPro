# Claude Research — Feature 136 Sequential Shot Storyboard

Date: 2026-07-21
Method: 4 parallel Explore agents (flow map / skills machinery / spec conventions /
per-shot pipeline) + direct verifications, executed during spec authoring in this
session; plus one gap-fill agent (addendum §8). Web research skipped: the only
external tech (openai-agents-python) is already installed
(`python-backend/requirements.txt:23`, `openai-agents==0.17.4`) and governed by
in-repo Features 106/107.

All paths relative to repo root unless noted. `SVC` =
`apps/web/server/services/marketplaceAutoReviewService.ts` (~27k lines).

---

## 1. Current Auto Storyboard Review architecture (what we extend)

### 1.1 UI layer
- Main page: `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  (8,534 lines, "MPCPD").
  - Launch mode toggle Auto/Standard: `MarketplaceAutoReviewLaunchModeSwitch.tsx`
    (values `auto_storyboard_review` | `standard_order`, :26/:40).
  - Plan summary cards + primary action: `AutoStoryboardReviewPlanSummary.tsx`
    (cards :138-165, action button :120-134).
  - Advanced overrides incl. `characterPresenceMode` dropdown
    ("การปรากฏของบุคคลในภาพ 3x3"): `AutoStoryboardAdvancedOverrides.tsx`
    (options :333-348, control :642-658, `frameStrategyOptions` :276-285);
    story/motion fields component `AutoStoryboardStoryMotionFields` (:99).
  - Character mode (inline in MPCPD): `AutoReviewCharacterMode` =
    `product_only|hands_only|described_character|uploaded_reference` (:157-161),
    choices :271-294, upload dropzone :4943-5060 & :6631-6735,
    `uploadAnchorFile` :4135.
  - Anchors payload builder `buildAutoReviewReferenceAnchors` :4312-4520 —
    product/character/environment URL+ref+hash+storageKey, `lockPolicy`
    :4365-4389 (incl. `multiViewReferenceSheet`,
    `allowSingleFileMultiViewSheet: true`), `reviewTone` added ~:4355.
  - Tone picker "อารมณ์ / โทนการพูด" :5072; state `autoReviewTone`.
- UI copy: `client/src/components/marketplaceCapture/hyperframesUiCopy.ts`
  (TH/EN; `createAutoReview` :35).

### 1.2 Creative presets (REUSE for skill inputs)
`apps/web/shared/hyperframes/autoReviewCreativePresets.ts`:
- Families (:3-12): `tone_preset`, `story_arc_preset`, `pacing_preset`,
  `camera_motion_preset`, `visual_style_preset`, `audio_preset`,
  `platform_preset`, `segment_structure_preset`.
- `AutoReviewCreativePresetSelectionSchema` :18-23; presets list :280;
  `buildAutoReviewCreativePresetDirective` :311;
  `autoReviewCreativePresetRequestedAudioStrategy` :343.

### 1.3 Shared auto-plan schemas
`apps/web/shared/hyperframes/autoPlan.ts`:
- `frameStrategy` defaults enum :44-48, override field enum :160-162
  (currently `["storyboard_3x3_split","video_shot_start_stop"]`), base value
  :202 (`storyboard_3x3_split`).
- `characterPresenceMode` :71-73/:182-184/base :213 (pattern for new override
  fields).
- `videoStructureMode` :59/:170/base :208 (`per_shot`);
  `motionDirection` :70/:181/base :212 (max 2000 chars free text).
- `buildHyperframesAutoStoryboardReviewPlan` :434 (produces defaults,
  blockers, `planHash`, `creditEstimate`, `primaryAction`).

### 1.4 tRPC surface (`apps/web/server/routers/marketplaceCapture.ts`)
| Procedure | Line | Notes |
|---|---|---|
| `getAutoStoryboardReviewPlan` | :829 | → `getAutoStoryboardReviewPlanForApi` (`hyperframesRuntimeApiService.ts:1110`) |
| `startAutoStoryboardReview` | :854 | → API `:1309-1423`; validates `expectedPlanHash` (PRECONDITION_FAILED on stale); passes plan.defaults incl. characterPresenceMode (API `:1394`), frameStrategy (API `:1383`) |
| `startAutoReview` (legacy/standard) | :667 | big inline zod :669-818; `frameStrategy` enum :678-681; `characterPresenceMode` :703-705; `referenceAnchors` :707-817 |
| `getAutoReviewRun` / `listAutoReviewRuns` | :1106/:1129 | queue background advancement |
| `advanceAutoReviewRun` | :1161 | → `SVC:26048` |
| `selectAutoReviewImageAttemptForStoryboardReview` | :1171 | template for new per-shot mutation |
| `cancelAutoReviewRun` | :1186 | |

### 1.5 Run engine (Feature 118, unchanged by 136)
- Stage sets: `BASE_STAGES` SVC:734 (`product_preflight → production_project →
  concept_story → prompt_plan → image_generation → storyboard_review`);
  `FULL_VIDEO_STAGES` :743 (+`video_generation → audio_generation → video_edit
  → render → library_finalize`).
- Two "plans": UI plan (hyperframes autoPlan) vs internal `AutoReviewPlan`
  (shots/productTruth/storyboardGuide) built during concept_story/prompt_plan;
  re-hydration `extractPlanFromRun` :25794,
  `hydrateMarketplaceAutoReviewPlanForStoryboardReview` :11512.
- Frame strategy resolution `resolveFrameStrategy` :6641-6651 (`auto` →
  `storyboard_3x3_split`); union type :124.
- DB: `marketplace_auto_review_runs` (schema.ts:19062, `frameStrategy`
  varchar(40) :19075 — new value fits, NO migration), stages :19129, stage
  attempts :19209, provider events :19269, outbox :19321, leases :19166,
  artifacts :19508 (unique runId+kind+hash). All plan/candidate/frame state in
  `metadataJson`/`resultJson` JSONB.

### 1.6 3x3 image path (must stay byte-identical with flags off)
- Initial unit: `buildInitialImageUnits` :8459 → `[{unitId:
  "storyboard-grid-image", role: "storyboard_grid"}]`.
- Prompt: PRIMARY = `product-reference-storyboard` skill via
  `buildProductReferenceStoryboardSkillInputs` :9159 (runtime_contract :9352,
  layout preset `canvas_9_16_grid_3x3_frame_9_16_exact`) →
  `runProductReferenceStoryboardPromptSkill`
  (`productReferenceStoryboardSkillRunner.ts:1998`, skill id :33). FALLBACK
  deterministic `build3x3StoryboardPrompt` :15239-15351 (dispatch :8600; test
  export `buildMarketplaceAutoReview3x3StoryboardPromptForTest` :15404).
- Per-shot prompt builder (start/stop mode, REUSED as sequential fallback):
  `buildShotFramePrompt` :15353.
- Candidates: `MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW = 3`
  :653; repair budget `MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS = 2` :658;
  scheduling `scheduleImageAttempt` :18225; completion gate :20206-20216;
  accept-with-warnings flow :20190-20310.
- Scoring/best-select: `buildImageAttemptScoreBreakdown` :6885 (base = mean
  vision-QA score :6894-6902, penalties :6914-6961);
  `bestImageAttemptReview` :7060; `applyBestImageAttemptSelection` :7085;
  reviews in `metadata.imageAttemptReviews[]` (`appendImageAttemptReview`
  :7225); provider-failure fallback `acceptBestImageAttemptAfterProviderFailure`
  :7127.
- Grid vision QA: :18960-19240 (JSON verdict/score/isStrict3x3/
  productMatchesReference/characterPresenceSatisfied/minorPresent/…, prompt
  :19023-19043, model default `gpt-4o-mini` :660, dense escalation gpt-4o
  :2557, `visionQaModelOverride` :2531-2570, cache key :18989).
- Split: `splitStoryboardGrid` :17272/:21243 (`storyboardGridGeometry.ts`).
- Handoff: `createStoryboardReview` :17402 → `mediaStudioStoryboardReviews`
  record; storyboard-only completes :17444-17447.
- Submit: `mediaGenerationService.generateImageAsync({prompt, model,
  aspectRatio:"9:16", resolution:"2K", numImages:1, referenceImageUrls,
  extraParams:{__origin_surface:"marketplace_auto_review",
  referenceImageManifest, referenceImageRoleCounts,…}})` :18584-18626; poll
  `getTask` :18820. Video `generateVideoAsync` :22479.

### 1.7 Reference handling (the single-anchor constraint)
- Server resolve: `resolveMarketplaceAutoReviewReferenceAnchors` :4949;
  `normalizeMarketplaceAutoReviewCharacterMode` :3987.
- Groups+manifest: `productReferenceStoryboardReferenceImageGroups` :5305;
  manifest `productReferenceStoryboardReferenceImageManifest` :5357-5387
  (@Image1=product, @Image2=character, @Image3=environment, per-role
  instructions); URL resolution
  `resolveProductReferenceStoryboardReferenceImageUrl` :5389 (needs publicUrl).
- **HARD LIMIT to relax (mode-scoped only):** `approvedProductReferenceUrls`
  throws if supporting product refs exist (:5185-5189) or providerReferenceUrls
  length ≠ 1 (:5193-5200); called with max 1 at :5310. Character refs allow up
  to 5 (:5313-5322; submit slice :18260-18268).

### 1.8 characterPresenceMode 4-layer machinery (pattern to clone)
- Directive `buildMarketplaceAutoReviewCharacterPresenceDirective` :4766-4783
  (guardrail: only for uploaded/described presenter,
  `marketplaceAutoReviewHasCharacterPresence` :4743; child-binding prohibition
  :4781/:4720; test export :4785).
- QA: `characterPresenceExpected` :18978; prompt fields :19034-19043.
- Repair: `buildMarketplaceAutoReviewCharacterPresenceRepairInstruction`
  :4795-4806.
- Reason codes + fail-open convention: verdict normalizer
  `normalizeShotFrameVisionQaDecision` :1738-1801 (`character_presence_missing`
  :1778; fail-open `!== false` idiom :1759-1771).
- Minor safety: trigger `marketplaceAutoReviewPlanNeedsMinorSafetyLock` :1357
  (signals regex :1306); `buildMinorSafetyClothingLock` :1395-1403; injection
  sites :9211, :15145, :15176, :15333, :15400; QA
  `visionQaMinorPresenceState` :1666-1679,
  `normalizeVisionQaMinorSafetyResult` :1690-1735 (codes
  `minor_safety_child_clothing_unverified` :1725,
  `vision_qa_minor_presence_evidence_missing` :1728); publish-block set
  `imageReasonCodeBlocksPublishSafety` :1650.
- Repair directive machinery:
  `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` :1443,
  `buildTargetedRepairDirective` :1479, severity :2856.

### 1.9 Prompt length governance (existing)
- Budgets: image `PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 3800`
  (runner :37; preferred 3600 :38);
  `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS` = same (SVC:15196);
  `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000` :15198 (== VD
  `VD_VIDEO_PROMPT_MAX`, `shared/verticalDramaSeries/contracts.ts:1247`).
- LLM compression (primary): in-prompt directives (runner :1162-1172),
  `promptLengthGuard.ts` `buildPromptLengthPlan` :83-109 (Thai-aware),
  optimizer skill invocation
  `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` :1535 (only when
  over budget :1549).
- Mechanical `compactImagePromptText` :15200-15206 ONLY for sub-blocks
  (≤180/220/500/700); lock-append helpers degrade gracefully
  (`ensureMinorSafetyClothingLockInImagePrompt` :1414,
  `ensureTargetedRepairDirectiveInImagePrompt` :1508, drop-not-corrupt
  :1432-1434).
- Preflight: `validateMarketplaceAutoReviewImagePromptPreflight` :8633
  (blockers `prompt_empty`, `prompt_too_long_for_image_provider`,
  `minor_safety_clothing_lock_missing`);
  `prepareMarketplaceAutoReviewImagePromptForSubmit` :18408; skill preflight
  loop `MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS = 3`
  :1218, loop :9617-9697, degraded fallback warning
  `storyboard_prompt_degraded_fallback` :9512/:9611-9616.

### 1.10 Claims/evidence (existing hooks)
- `ProductTruth` + `PRODUCT FACTS LOCK` via `buildAutoReviewPlan` /
  `buildProductTruth` / `buildProductDetailText` (Feature 118); up to 8 image
  URLs; extraction contract "ห้ามเดาข้อมูลที่ไม่มีหลักฐาน" + per-field
  confidence in `marketplacePromptService.ts:1-26`.
- `claimEvidenceMapping.blockedClaims` :5794; blocked claims gate paid stages
  :5947; policy ref `paid-spend-fail-closed-on-input-change` :6567.
- Category: 21-value enum :1220-1245;
  `inferProductReferenceStoryboardCategory` :9185; per-category rule file
  injection `appendProductReferenceStoryboardCategoryRules`
  (`productReferenceStoryboardCategoryRules.ts:75-149`, fail-open audit
  statuses :101-113/:145-149).

### 1.11 Credits/estimate
- `buildHyperframesCreditEstimate`
  (`hyperframesFeatureAccessService.ts:137-227`); auto plan uses
  `costClass: "composition_preview"` → freePreview
  (`hyperframesAutoPlanService.ts:330-340`);
  `autoPlanWorkerComplexityMultiplier` :167-182 (qualityMode high 1.35 / fast
  0.8; start_stop ×1.15). Runtime LLM/vision spend:
  `reconcileMarketplaceLlmCredits` SVC:19116, `creditCategory: "vision_qa"`
  :19084.

---

## 2. Skills machinery (how to add the new skill)

- Location: `apps/web/skills/<slug>/` (app-scoped; NOT root portable mirror).
- Dual manifest twins `skill.md` + `SKILL.md` byte-identical; lowercase wins
  on read (`services/skillFiles.ts:7,146-154`; writer mirrors both :290-299).
- Parser `packages/skills/src/parser.ts` (`parseSkillFile` :14; category map
  :64; body → `content`).
- Registry `services/skillRegistry.ts`: DB primary, folder auto-sync by md5
  contentHash (`autoSyncSkillsFromFolder` :365; per-use
  `syncSingleSkillIfChanged` :549); cache TTL 60s :307; body stored to
  `skillContent` + `systemPrompt` (:449,:490-492,:522);
  `getSkillByIdAsync` :808; `KNOWN_REQUIREMENT_KEYS` :227-240; executionMode
  default "llm-only" :451/:658 (frontmatter `execution_mode` passthrough —
  `agents_python` is an additive value).
- Canonical runner pattern (`productReferenceStoryboardSkillRunner.ts`):
  sync :2019 → load :2027 → throw-if-missing :2028-2032 → input-schema audit
  HARD-FAILS before spend :2054-2079 → `resolveSkillExecutionPolicy`
  (services/skillExecutionPolicy.ts) → `getProviderForModel`
  (`llmRouter.ts:85`; `executeWithFallback` :665;
  `disableProviderFallbacks: true` pin, SVC:11773) →
  `executeSharedSkillTextRuntime`
  (services/agentRuntime/skillRuntimeOrchestrator.ts) with `legacyExecute`
  closure; credits `calculateCreditsForLLMDynamic` + `deductCredits`
  (SVC:11799-11836).
- Voiceover skill call example:
  `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill` SVC:11604.
- Structured JSON with lenient enums (reuse):
  `executeJsonPlanningCallWithRetry` (`verticalDramaStoryBible.ts:1353`),
  `extractJson` + jsonrepair :970/:1036, error classifier :1268-1307, lenient
  enum normalizers (weak-model tolerance; do NOT change model per cost
  policy).
- Loop orchestrator template: `services/videoProjectQualityLoop.ts` —
  injectable effects :60-63, maxLoops capped 1 in Phase 1 (:12-14), Phase-3
  bounded multi-round marker :124-126.
- Existing skills to reuse: `product-reference-storyboard` (unified 3x3;
  frontmatter with contextLength 1000000 + auto_learning QA config),
  `product-video-motion-prompt` (identity block skill.md:86-94),
  `product-reference-storyboard-prompt-optimizer` (LLM compression),
  `media-products-storyboard-planner`, `elevenlabs-product-voiceover-dialogue`.
- Real-file skill test pattern: `services/reviewerSkillsUpgrade.test.ts:6-70`
  (reads skill.md from disk, parses, asserts policy + schemas; no mocks).
  Also `skillFiles.test.ts`, `skillRegistry.frontmatter.test.ts`.

---

## 3. Per-shot pipeline prior art (Vertical Drama) — patterns to clone

- Start-frame plan/prompts: `services/verticalDramaStartFrameGeneration.ts`
  (`generateStartFrameRenderPlan` :741 — exactly-9 schema :222-231;
  single-shot `generateStartFrameShotPrompt` :1349; projection :256; skill
  loaded from `skills/vertical-drama-shot-start-frame-render/skill.md`
  :162-189).
- Reference assembly/order: `routers/verticalDramaEpisodes.ts`
  `resolveShotCharacterReferenceEntries` :1812 (portraits before sheets
  :1859-1870); fail-closed manifest
  `resolveRequiredShotCharacterAttachmentManifest` :1681 (PRECONDITION_FAILED
  :1711/:1742/:1754); capacity
  `assertRequiredCharacterReferenceCapacity` :1771; merge+trim
  `mergeAndTrimReferenceImageUrls` (`verticalDramaProductTieIn.ts:922-937`,
  character→location→product, trim from END).
- Mapping validator (CLONE for product angles):
  `shared/verticalDramaSeries/characterIdentityMap.ts`
  `findCharacterImageIndexMappingMismatches` :317 (claims extractor :239,
  lenient-on-silence :305-312); enforcement: corrective retry then throw
  `VdReferenceMappingError` (`verticalDramaStartFrameGeneration.ts:111-120,
  1462-1536`), router → PRECONDITION_FAILED (`verticalDramaEpisodes.ts:
  12670-12674`), submit-time re-validation before credits :9813-9825.
- Video jobs: start frame prepended as `referenceImageUrls[0]` :11648-11665;
  extra budget = cap−1, priority fill + trim :11549-11646; Grok single-ref
  guard :11579-11600; prompt compiler
  `verticalDramaVideoMotionPromptGeneration.ts` (`generateVideoMotionPromptPack`
  :746; attached-image-is-truth :1490; start-frame sync :553); token-ceiling
  retry pattern :1703-1704 (2000→4000).
- Media task service (both VD and marketplace use it):
  `services/mediaGenerationService.ts` `generateImageAsync` :2418 /
  `generateVideoAsync` :2553 → Python backend async tasks; `getTask` :2786;
  ref URLs resolver `resolveReferenceImageUrlsForModel` :1407 slices to
  `getReferenceImageLimitForModel` (default 5 :1401-1404); payload key
  `reference_image_urls` :2467.
- Provider caps (`services/modelRegistry.ts` + `mediaProviderUtils.ts`):
  image — `google-banana-2-lite` maxRef 10 (:503-505), most others default 5;
  video — grok-imagine-video-1-5 startFrame+maxRef1 promptCap 5000
  (:864-931), veo-3/3.1 startFrame+maxRef3 cap 5000 (:619-680),
  happyhorse/reference-to-video maxRef 9 (:804-813), wavespeed seedance i2v
  maxRef 4 (utils :12/:290-379), kling-2.6/sora-2 NO start frame (:954-1002);
  limit readers `getReferenceImageLimitFromConfig` utils :1483-1495.
- Age-safety enforcer (separate layer, still applies):
  `services/ageSafeMediaEnforcer.ts` `evaluateMediaPrompt` :32, reason codes
  :61-94.
- Child-safety directive preservation pattern:
  `shared/verticalDramaSeries/characterLock.ts:130`
  (`CHILD_SAFETY_DIRECTIVE_MARKER`); regen refuses to drop directive
  (`verticalDramaStartFrameGeneration.ts:1432-1440,1517-1523`).

---

## 4. OpenAI Agents SDK (Tier-2 skill runtime, Phase 6)

- Installed: `python-backend/requirements.txt:23` → `openai-agents==0.17.4`.
- Governing in-repo specs: Feature 106 (native Agents-Python skill system —
  locked decisions: SKILL.md primary contract; `scripts/run.sh`+`verify.sh`
  mandatory; `SandboxAgent + Capabilities.default() + Skills(
  LocalDirLazySkillSource(...))` loading; phase-supervised checkpoints;
  **verification-before-finalize**; runtime policy beats prose) and Feature
  107 §8 (bundle shape: SKILL.md, skill.lock.json, scripts/, references/
  {input,output}_contract.md, agents/orchestrator.md + specialists/,
  subagents.json). Feature 130 = hybrid-flow runtime; Feature 101 = base SDK
  orchestration.
- `product-reference-storyboard` already ships `skill.lock.json` +
  `references/{input_contract,output_contract,maintenance}.md` — partway onto
  the bundle shape.

---

## 5. Feature flags precedent

- Tenant flags edited in admin panel: `client/src/components/admin/
  TenantFeatureFlagsPanel.tsx` + `tenantFeatureFlagGroups.ts` (hermesMediaWorker
  from Feature 135 is the newest precedent; big panels can't mount in jsdom —
  extract card for tests, per memory `project_hermes_media_worker`).
- Two new flags per spec §26: `marketplaceSequentialStoryboard`,
  `marketplaceReviewEvidenceGuard` (independent; both default off).
- (Server-side flag read helper + PRECONDITION_FAILED gating precedent: see
  gap-fill addendum §8.1.)

---

## 6. Testing landscape

- JS/TS: Vitest run from `apps/web` (NOT repo root); worktrees need
  node_modules symlinked from main checkout (memory
  `reference_worktree_test_env`); `pnpm` blocked by packageManager field — use
  `npm --prefix apps/web run test -- <files>`.
- tsc: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run
  check`; baseline has ~987 pre-existing errors — compare against baseline,
  don't chase.
- Router tests need `vi.hoisted` JWT_SECRET stub (memory
  `project_marketplace_motion_direction`).
- Real-file skill tests: `reviewerSkillsUpgrade.test.ts` pattern (§2). Skill
  "taught-not-wired" failure class must be guarded by real-LLM gate + loader
  tests (memory `project_vd_skill_taught_not_wired`).
- Relevant existing test files: `services/__tests__/
  marketplaceAutoReviewService.test.ts`, `shared/storyboardPromptAudio.test.ts`,
  `routers/__tests__/mediaProduction.execution.test.ts`.

---

## 7. Operational constraints (repo-level)

- Prod serves from the main checkout on disk; concurrent sessions can revert
  working-tree edits — prove fixes via isolated copies; prefer worktrees +
  ff-merge (memories `project_deploy_serves_from_checkout`,
  `project_worktree_concurrent_reverts`).
- Frontend deploy: `cd apps/web && npm run build:deploy` (atomic); restart
  `smartspec-web.service` only when server/*.ts changed. Never dev-mode in
  background; systemd only.
- No git stash for baseline checks (other sessions' stashes present).
- DB safety: Feature 136 requires NO migration (varchar(40) fits; JSONB
  metadata) — Low risk class.

---

## 8. Gap-fill addendum (verified)

### 8.1 Tenant feature flags end-to-end
- Client admin: `client/src/components/admin/tenantFeatureFlagGroups.ts` —
  `TenantFlagGroup`/`TenantFlagInfo` :4-13, `BASE_TENANT_FLAG_GROUPS` :15,
  media/generation group entries :292-301 (`hermesMediaWorker` :301).
- Shared: `shared/featureFlags.ts` — interface member (:59 precedent),
  `ALLOWED_FEATURE_FLAGS` set (:218, entry :269), `FEATURE_FLAG_DEFAULTS`
  (:427, entry :478, default false), `TenantFeatureFlagKey` :212.
- Server read: `services/tenantFeatureFlagService.ts:183`
  `getTenantFeatureFlags(tenantId)` → `resolveFeatureFlags` :201 (per-key
  default fill :175-177); write `updateTenantFeatureFlags` :211.
- **Flag-off rejection precedent uses `FORBIDDEN`** (not PRECONDITION_FAILED):
  `mediaTransportResolver.ts:96-101`, `hermesMediaScheduler.ts:538-540`,
  `hermesConnectionService.ts:944-946`. → Feature 136 flag gating should
  follow the FORBIDDEN convention (spec §7.3 said PRECONDITION_FAILED; plan
  follows codebase convention and notes the deviation). Hyperframes stack
  itself folds flags into access-decision + `blocker(...)` entries instead
  (`hyperframesFeatureAccessService.ts:72-78`, blockers :117+).

### 8.2 Auto plan service internals
- No runtime-filtered strategy list — the selectable set IS the zod enum
  (`autoPlan.ts:44-48`); overrides applied `autoPlan.ts:271-276`. Sequential
  visibility filtering = new logic (plan defaults + blocker when flag off).
- `blockers`: `HyperframesBlocker[]` populated
  `hyperframesAutoPlanService.ts:322-328` via `buildBlocker(code, severity)`
  :126-139; schema `shared/hyperframes/contracts.ts:320-329` (`.strict()`:
  `{code, severity: info|warning|blocking|critical, copyId, safeMessage,
  nextAction?, userActionRequired}`); Thai copy via
  `getHyperframesBlockerCopy(code, "th")`.
- `autoPlanWorkerComplexityMultiplier` :167-182: `quality(high 1.35/fast 0.8)
  × (shotCount/9) × (start_stop? 1.15 : 1)`, 2-dp rounding → add sequential
  factor here.
- `buildHyperframesCreditEstimate` call site :330-340 with inputs
  `{tenantId, userId, runId?, renderIntent, compositionMode, costClass:
  "composition_preview", platformPreset, quotaDecision,
  workerComplexityMultiplier}`.

### 8.3 Quality mode + per-unit tracking
- `effectiveQualityModePolicy` SVC:2578-2592 → `{maxRepairAttemptsPerUnit,
  visionQaModel}`; built by `buildMarketplaceAutoReviewQualityModePolicy`
  :2521-2576 (fast_draft=1, balanced=MAX+1 default, premium_strict_qa=MAX+2
  with gpt-4o).
- `maxImageProviderSubmissionsForFrameStrategy` :8491-8498: 3x3 → policy cap;
  **any other strategy → POSITIVE_INFINITY** (sequential relies on per-unit
  budget, no change needed here).
- `nextDirectAttempt` :7735-7742 filters `directImageTasks` by unitId +
  `directMediaRefReachedProvider` :7744-7761.
- `DirectMediaTaskRef` type :943-982 (fields incl. unitId, attempt, taskId,
  status, promptHash/LengthChars/Snippet, promptPreflight, skillRuntime,
  referenceImageUrls, referenceImageManifest, credit* + providerSubmitIntent*);
  `RunMetadata.directImageTasks` :819-821.

### 8.4 Router mutation template
- `selectAutoReviewImageAttemptForStoryboardReview` :1171-1184 =
  `protectedProcedure.input(z.object({runId: min1 max64, attempt: int
  positive max20})).output(z.any()).mutation(({input, ctx}) =>
  service(input, authFromCtx(ctx)))` — template for
  `regenerateAutoReviewSequentialShot`.
- `startAutoReview` passes whole input (anchors included) to
  `startMarketplaceAutoReviewRun(input, auth, autoReviewRuntimeFromCtx(ctx))`
  :822-826; `startAutoStoryboardReview` forwards `referenceAnchors` :864.
- `resolveMarketplaceAutoReviewReferenceAnchors` invoked inside
  `startMarketplaceAutoReviewRun` at :17673-17681.

### 8.5 Skill execution APIs
- `resolveSkillExecutionPolicy(input: {skill, conversationModel?})`
  → `{modelId, allowFreeModels, preferredProviderId?, strictProviderPin?,
  modelSource, …}` — `services/skillExecutionPolicy.ts:129` (types :19-47).
- `executeSharedSkillTextRuntime` —
  `services/agentRuntime/skillRuntimeOrchestrator.ts:892`; required input
  fields: `tenantId, userId, objective, entryPoint, modelConfig, skillSlugs,
  legacyExecute`; optional `originSurface, systemPrompt, userPrompt,
  referenceImages, schemaHint, …` (`ExecuteSharedSkillRuntimeInput`
  :101-139).

### 8.6 Voiceover hook call site
- `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill` called UNCONDITIONALLY
  in `concept_story` stage at SVC:17993-18005 (after
  `buildGatewayCreativeAutoReviewPlan` :17969); only skip is zero shots
  (:11622-11631). Output replaces plan; metadata
  `voiceoverSkillRewrite` :18006-18012. Sequential reuses as-is.

### 8.7 Client anchors payload (top-level keys, order)
`buildAutoReviewReferenceAnchors` returns: `schemaVersion: 2` (:4352),
`creationIntent`, `requiredRoles`, **`reviewTone`** (:4355, top level),
`storytellingStructure` (:4356-4358), `creativePresets` (:4359-4361),
`characterMode`, `characterBrief`, `characterPreset`, `lockPolicy`
(:4365-4389), product image fields (:4390-4400), character image fields
(:4401-4408), environment fields (:4409-4416), `auditMetadata` (:4417-4460),
`fileEvidence`, `sourceRefs`. Router ALREADY accepts: `reviewTone` enum
:730-741, `storytellingStructure` :742-754, `creativePresets:
z.array(AutoReviewCreativePresetSelectionSchema).max(8)` :755-758; anchors
object is `.passthrough()` :815. → §12.6 wiring needs NO new zod for
tone/structure/presets — only `productAngleImages` + the new overrides.

### 8.8 Plan output schema is `.strict()`
`GetAutoStoryboardReviewPlanOutputSchema` —
`shared/hyperframes/runtimeApiSchemas.ts:63-70`: `{contractVersion: literal,
access, plan, templates}` **`.strict()`** → `evidencePreview`/
`referenceCapacity` MUST be added as optional fields inside the object
(before `.strict()`), else rejected.

### 8.9 Per-frame vision QA assembly/parse points
- Per-shot frame QA runner `runShotFrameVisionQa` SVC:19287; Thai prompt
  lines :19358-19383; **JSON schema request string :19380** (`verdict, score,
  reasonCodes, failedFrameRoles, frameVerdicts[], repairInstruction,
  productMatchesReference, continuityMatchesShot, characterConsistencySafe,
  adWarningTextSafe, minorPresent, minorSafetyClothingSafe`) → add
  `adultGuardianPresent`/`assemblyContentDetected` here + prose criteria near
  :19368-19379.
- Grid QA `runStoryboardGridLayoutVisionQa` :18937, schema string :19043,
  parse :19131, normalize :19153 (shared-guard fields added here for 3x3).
- Parse: `parseAgentRuntimeJsonOutput` :19469 (+fallback envelopes
  :19470-19478) → `normalizeShotFrameVisionQaDecision({parsed, plan,
  reasonCodes})` :19482; extend its parse+return (:1743-1753) and
  verdict/reason folding (:1772-1789).
- `ShotFrameVisionQaEnvelopeSchema` (higher-level envelope) —
  `shared/marketplaceAutoReview/contracts.ts:1473-1497`.

### 8.10 Shot-frame prompt injection pattern
- `buildShotFramePrompt(plan, shot, role, overlayTextMode)` :15353-15402 —
  array of directive lines; `buildMinorSafetyClothingLock(plan)` is the FINAL
  element (:15400); 3x3 injects same lock :15333 + repair tail :15347-15350.
- New always-on directives (`buildGuardianPresenceDirective`,
  `buildDemonstrationEvidenceDirective`) → new array elements beside :15400.
- Targeted repair appended by the unit dispatcher (routes by unit.role,
  :8539-8623) via string-concat after the builder call :8615-8623; reusable
  TARGETED REPAIR builder :1480-1503, idempotent appender :1510-1514.
