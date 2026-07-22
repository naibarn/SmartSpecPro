# Implementation Plan — Feature 136: Sequential Shot Storyboard (Phases 1–5)

Date: 2026-07-21
Inputs synthesized: `spec.md` v1.3.0 (authoritative), `claude-research.md`,
`claude-interview.md`, `claude-spec.md`.
Scope: spec Phases 1–5. Phase 6 (Tier-2 executable Agents SDK skill) is
explicitly OUT of this plan (interview Q1) — the skill ships as Tier 1
(markdown body + TypeScript-orchestrated loop).

---

## 1. What we are building and why

Marketplace Auto Review currently generates a product-review storyboard as ONE
image containing a 3x3 grid of 9 frames, retries to ≥3 candidates, picks the
best by vision-QA score, splits it into 9 frames, and builds a Storyboard
Review (and optionally a full video) from them. Known failure classes: product
detail drift inside grid cells (1/9 pixel budget each), product identity
anchored to a single reference image, an evidence-blind deterministic planner
that invents content — most damagingly furniture ASSEMBLY reviews showing
parts that don't exist — and no requirement that a depicted child using a
child product be accompanied by an adult guardian.

This feature adds a fourth frame strategy, `sequential_shot_storyboard`:
**9 separate images, one prompt per image, one continuous Thai review story**,
planned by a new evidence-grounded skill, with the product identity locked by
MULTIPLE user-attached product angle photos on every image job. Alongside it,
a **shared evidence-guard package** (assembly guard, guardian presence, claim
whitelist) ships behind its own flag and can be enabled for the existing 3x3
mode immediately — improvements are deliberately NOT hostage to the new mode.

Two independent tenant flags, both default off:
- `marketplaceSequentialStoryboard` — the new strategy.
- `marketplaceReviewEvidenceGuard` — the shared guards (both modes).

Hard invariant: with both flags off, every existing byte of behavior is
preserved (snapshot-tested). No DB migration anywhere (the `frameStrategy`
column is `varchar(40)`; all new state lives in existing JSONB metadata).

## 2. Context for the unfamiliar reader

- Monorepo; the web app is `apps/web` (React client + Express/tRPC server +
  Drizzle). The orchestration engine is
  `apps/web/server/services/marketplaceAutoReviewService.ts` (~27k lines,
  called `SVC` below): a durable run machine with stages
  `product_preflight → production_project → concept_story → prompt_plan →
  image_generation → storyboard_review` (+5 video stages for full-video),
  persisted in `marketplace_auto_review_runs` (+stages/attempts/artifacts
  tables), advanced by background jobs, resumable after restarts. We reuse
  this machine unchanged — all new behavior forks INSIDE stages on
  `frameStrategy`.
- "Skills" are markdown bundles under `apps/web/skills/<slug>/` (dual twins
  `skill.md`+`SKILL.md`, byte-identical; lowercase wins on read) auto-synced
  into a DB registry by content hash. A skill's markdown body becomes the LLM
  system prompt; runners add a runtime contract, resolve a model via
  `resolveSkillExecutionPolicy`, and execute via
  `executeSharedSkillTextRuntime`. Creative judgment lives in skill bodies;
  TypeScript validates only machine-checkable facts (repo rule).
- Media generation goes through `mediaGenerationService.generateImageAsync` /
  `generateVideoAsync` (Python backend async tasks, polled via `getTask`),
  with reference images passed as `referenceImageUrls` (sliced to the model's
  cap, default 5) and a role manifest in `extraParams`.
- The Vertical Drama (VD) feature already runs a per-shot pipeline (start
  frames + per-shot videos) and provides proven patterns we clone: fail-closed
  reference mapping, capacity assertions, start-frame-as-first-reference.

All file:line anchors in this plan were verified 2026-07-21 and are indexed in
`claude-research.md` (read it before implementing any section).

## 3. Design decisions (binding)

1. **Fork points, not new machinery.** New strategy behavior enters at the
   existing per-strategy forks: `resolveFrameStrategy` (SVC:6641),
   `buildInitialImageUnits` (SVC:8459), the unit prompt dispatcher
   (SVC:8539-8623), the image_generation stage loop, and the storyboard_review
   handoff. Stage keys, tables, leases, outbox, background advancement are
   untouched.
2. **Flag-off rejection = typed `FORBIDDEN`** (hermes precedent,
   `mediaTransportResolver.ts:96-101`) with Thai copy — deviation from spec
   §7.3's PRECONDITION_FAILED wording, recorded in claude-interview.md. Plan
   query never throws for visibility: flag off ⇒ strategy simply not offered
   + a `HyperframesBlocker` entry when explicitly requested.
3. **Skill-first with mandatory in-skill QA.** The skill must return loop
   evidence (`loopReport` incl. per-round candidate scores) and a passing
   `finalQc`; the runner rejects bare answers. Rounds are TS-orchestrated
   (Tier 1): up to 3 skill invocations inside `prompt_plan`, each persisted
   before the next (mid-loop resume).
4. **No mechanical truncation of final prompts.** Over-budget prompts go to
   the `product-reference-storyboard-prompt-optimizer` skill with a new
   `prompt_kind` input; `compactImagePromptText` stays sub-block-only.
5. **3x3 single-anchor rule untouched.** Multi-angle is a NEW resolver used
   only by the sequential fork; `approvedProductReferenceUrls` (SVC:5185-5200)
   keeps throwing for the grid path.
6. **Shared guards are enumerated directive/QA additions ONLY.** Injected via
   shared builders beside the existing minor-safety lock; a diff-shape
   snapshot test proves nothing else changes for 3x3 under the guard flag.
7. **Publish-blocking severity for `guardian_presence_missing` and minor-
   safety codes; `assembly_content_unverified` repairs then blocks the unit.**
   The existing accept-with-warnings flow may never pass a publish-blocking
   code.
8. **Metrics land in Phase 2** (not Phase 5) so a 3x3-vs-sequential baseline
   exists when the pilot pins GA thresholds (interview Q2).

## 4. Work breakdown

The sections below are ordered by dependency; each becomes one implementation
section file. Tests are enumerated per section in `claude-plan-tdd.md`.

### WS-1: Flags and shared schema foundation (spec §7, §20.1; Phase 1)

Goal: both tenant flags exist end-to-end; the new enum value and override
fields exist; everything dark; snapshots locked in.

- `apps/web/shared/featureFlags.ts` — add two boolean members
  (`marketplaceSequentialStoryboard`, `marketplaceReviewEvidenceGuard`) to
  the interface (:59 precedent), `ALLOWED_FEATURE_FLAGS` (:218) and
  `FEATURE_FLAG_DEFAULTS` (:427, both `false`).
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` — two
  `TenantFlagInfo` entries in the media/generation group (:292-301), Thai
  labels/descriptions.
- `apps/web/shared/hyperframes/autoPlan.ts` — add `"sequential_shot_storyboard"`
  to the defaults enum (:44-48) and override enum (:160-162); base value
  stays `storyboard_3x3_split` (:202). Add optional override fields
  (characterPresenceMode pattern :71-73/:182-184/:213):
  `confirmedAttributes: Record<string,string>`, `forbiddenClaims: string[]`,
  `targetAudience: string`, `userRequirements: string`,
  `sequentialImagePromptMaxChars: number (1000–4000, default 4000)`, with
  normalization in the override-apply block (:271-276 pattern).
- `apps/web/server/routers/marketplaceCapture.ts` — extend `startAutoReview`
  `frameStrategy` enum (:678-681). NOTE: `reviewTone` /
  `storytellingStructure` / `creativePresets` already exist in the anchors zod
  (:730-758) — do NOT add parallel fields.
- `apps/web/server/services/marketplaceAutoReviewService.ts` — extend the
  strategy union (:124) and `resolveFrameStrategy` (:6641-6651): `auto` still
  resolves to `storyboard_3x3_split`; the resolver stays a PURE passthrough
  for the new value (no flags argument). Flag enforcement lives ONLY at the
  two start entry points (gating below), keeping the resolver deterministic
  and cheap for background advancement of already-started runs.
- Gating: in `startMarketplaceAutoReviewRun` (SVC:17549) and
  `startAutoStoryboardReviewForApi` (`hyperframesRuntimeApiService.ts:1309`),
  when strategy is sequential and
  `(await getTenantFeatureFlags(tenantId)).marketplaceSequentialStoryboard`
  is false → throw typed FORBIDDEN with Thai copy
  "โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้".
  Plan side: `hyperframesAutoPlanService.ts` adds a blocker via
  `buildBlocker(...)` (:126-139) when an override requests sequential while
  the flag is off, and never emits sequential in `plan.defaults` in that case.
- Snapshot suite (committed in this WS): fixed fixtures through
  `getAutoStoryboardReviewPlan`,
  `buildMarketplaceAutoReview3x3StoryboardPromptForTest` (SVC:15404), and
  `buildShotFramePrompt` — byte-identical with both flags off.

### WS-2: Multi-angle reference layer (spec §8; Phase 1–2)

Goal: multi-view product references flow client → zod → resolver → provider
manifest, with capacity fail-closed and a fail-closed index-mapping validator.

- Client (`MarketplaceCaptureProductDetail.tsx`): extend
  `buildAutoReviewReferenceAnchors` (:4312-4520) with optional
  `productAngleImages[]` (max 8; `{url, ref, hash, storageKey, source,
  angleLabel}`; angleLabel enum front/back/side/top/base/detail/package/
  parts_diagram/scale/other). Sources: captured `marketplaceProductImages`,
  Media Panel, `uploadAnchorFile` (:4135). UI chips/capacity meter are WS-11.
- Router: optional `productAngleImages` array inside the `referenceAnchors`
  zod (:707-817), entries validated like existing anchor fields.
- Server: new resolver `approvedSequentialProductReferenceUrls(metadata, plan,
  modelCap)` in SVC (sequential fork only):
  order primary → angles (user order), dedupe by hash/URL, resolve via
  `resolveProductReferenceStoryboardReferenceImageUrl` (:5389); slot
  RESERVATION priority primary(1) → guardian character(1 when required) →
  environment(1 optional) → angles fill remainder, trimmed from END
  (VD ordering guarantee, `verticalDramaEpisodes.ts:1859-1870`); attachment
  ORDER = primary, angles, guardian, environment (spec §8.3 note — the two
  rules differ). `package`/`parts_diagram` entries are `evidenceOnly: true`:
  excluded from provider attachments, still passed as skill vision inputs.
  Capacity fail-closed: required refs > model cap
  (`getReferenceImageLimitForModel`, `mediaGenerationService.ts:1401-1404`)
  ⇒ throw before any credit reservation
  (`assertRequiredCharacterReferenceCapacity` contract,
  `verticalDramaEpisodes.ts:1771`).
- Per-shot manifest: extend the existing manifest shape (SVC:5357-5387) to
  variable-length product block `{index, role, angleLabel, url,
  evidenceOnly?}`; persist in run metadata
  (`sequentialStoryboard.referenceManifest`) and pass via
  `extraParams.referenceImageManifest` as today (:18584-18626).
- New pure module `apps/web/shared/marketplaceCapture/referenceIndexMap.ts`:

  ```ts
  export type ReferenceIndexEntry = { index: number; role: string;
    angleLabel?: string };
  export function findReferenceIndexMappingMismatches(
    prompt: string, manifest: ReferenceIndexEntry[]):
    ReferenceIndexMappingMismatch[]
  ```

  Clone of `findCharacterImageIndexMappingMismatches`
  (`shared/verticalDramaSeries/characterIdentityMap.ts:317`): extracts
  explicit `@ImageN` role claims; lenient on silence. Enforcement in the
  runner: one corrective retry through the skill, then throw (never persist a
  contradictory prompt); re-validate at submit time against the live manifest
  (VD `:9813-9825` pattern).

### WS-3: Skill bundle `product-review-sequential-storyboard` (spec §9; Phase 1)

Goal: complete Tier-1 bundle on disk, registry-synced, contract-tested.

Files: `apps/web/skills/product-review-sequential-storyboard/` — `skill.md` +
byte-identical `SKILL.md`; `schemas/input.schema.json` (fields per spec §9.6:
product truth, reference_manifest, budgets, tone/presets/videoStructureMode/
motionDirection, targetAudience, userRequirements, forbiddenClaims,
confirmedAttributes, child_subject_policy, character fields, audio_strategy,
platform), `schemas/output.schema.json` (the §19.2 `sequentialStoryboard`
shape), `schemas/ui.schema.json`; `references/claim-safety.md` (prohibited/
safe Thai wording incl. price ban), `references/narrative-patterns.md`
(category-conditional structures; furniture assembly beats default OFF),
`references/guardian-presence.md`, `references/demonstration-evidence.md`.

Frontmatter per spec §9.2: `execution_mode: llm-only`,
`execution_policy.requirements {supportsVision: true, contextLength: 1000000}`,
`fallbackPolicy: error`, `config.media_studio.
marketplace_auto_review_sequential_storyboard {enabled, loop_rounds: 3,
candidate_count: 3, min_prompt_score_to_pass: 88}`.

Body content (Phases A–K per spec §9.3) MUST include: evidence-before-
creativity + image-over-text rules; claim confidence levels; category
strategy hooks (category rule files injected by the runner via
`appendProductReferenceStoryboardCategoryRules` — reuse, no duplication);
the 9-shot default structure + hook rules; dialogue continuity + duration
fitting; start-frame action rule; image-prompt template with `@ImageN`
binding authored by the skill; the mandatory global video block template;
`demonstration_type` typing + assembly guard rules; guardian rules; round
contracts for Phases H–J; output = strict JSON per output schema. Rule text
lives here, NOT in TS.

### WS-4: Skill runner + loop orchestration (spec §9.4, §9.7, §15, §16; Phase 2)

Goal: `productReviewSequentialStoryboardSkillRunner.ts` produces a validated,
quality-verified 9-shot pack inside `prompt_plan`.

- Runner skeleton clones `productReferenceStoryboardSkillRunner.ts:1998-2079`:
  `syncSingleSkillIfChanged` → `getSkillByIdAsync` → system prompt =
  `skill.systemPrompt ?? skill.skillContent` + runtime contract (budgets, shot
  count 9, manifest, product truth, blocked claims, confirmed attributes,
  childSubjectPolicy, preset directive via
  `buildAutoReviewCreativePresetDirective`, and `motionDirection` — which the
  skill must inject BOTH into the story plan AND into every submitted video
  prompt's action/camera language, spec §14.6 dual-injection) → input-schema
  audit hard-fails
  before spend → `resolveSkillExecutionPolicy` →
  `getProviderForModel(..., disableProviderFallbacks: true)` →
  `executeSharedSkillTextRuntime` with `legacyExecute` closure; product
  reference images attached as vision inputs (`referenceImages`).
- JSON parsing via `executeJsonPlanningCallWithRetry` + `extractJson` +
  lenient enum normalizers (`verticalDramaStoryBible.ts:1353,970,1268`).
- Loop: TS orchestrates ≤3 rounds (injectable-effects shape of
  `videoProjectQualityLoop.ts:60-63` with `maxLoops = 3`, or the preflight
  bounded-attempt shape SVC:1218/:9617-9697). Each round = one skill
  invocation carrying prior retained output + that round's review contract
  (evidence → narrative/feasibility → compliance/compression). Round outputs
  + 8-dimension scores persisted to `metadataJson.sequentialStoryboard.
  loopReport.round_N` BEFORE the next round (mid-loop resume). Best-version
  retention with deterministic disqualifiers (lower total, unsupported claims,
  missing global block, broken continuity, length failure).
- Candidates: within a round the skill may return up to `candidate_count` (≤3)
  candidate sets; scores + selection rationale recorded in
  `loopReport.round_N.candidates[]`.
- Deterministic preflight (TS, after final round): 9 shots present, both
  prompts per shot, image ≤ effective budget
  (`min(sequentialImagePromptMaxChars, provider maxPromptLength)`, new
  constant `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS =
  4000`), video ≤ 2000 (existing constant :15198), global-block marker per
  video prompt, guardian directive present when policy active, assembly
  blocker (`assembly_demo_unverified`) when a prompt stages assembly while
  `assembly_documented` is false, price-pattern backstop
  (`price_claim_detected`), shot ≤10s, speech estimate ≤ duration (Thai ≈17
  chars/s estimator, facts-only), reference-index mapping (WS-2 validator),
  and `product_reference_model_conflict` when skill Phase A reports that the
  attached references depict DIFFERENT product models (hard fail until the
  user resolves roles/confirmation — spec §23.1 item 12).
  Blocker ids reuse/extend `validateMarketplaceAutoReviewImagePromptPreflight`
  (:8633) conventions.
- Over-budget → optimizer skill invocation with new input flag
  `prompt_kind: "sequential_image" | "sequential_video"` (extend
  `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` :1535-1549);
  revalidate; bounded; never slice.
- Runner rejects returns lacking loopReport/finalQc evidence.
- Structural failure after bounds → deterministic fallback: per-shot prompts
  from `buildShotFramePrompt` (:15353) + safety locks; audit warning
  `sequential_prompt_degraded_fallback` (mirror :9512/:9611-9616).
- Voiceover: reuse the unconditional concept_story rewrite hook
  (SVC:17993-18005) untouched.

### WS-5: prompt_plan orchestration + evidence persistence + plan surface (spec §6.1, §10, §19, §20.2; Phase 2)

Goal: the sequential `prompt_plan` stage actually runs end-to-end; evidence
profile and shot pack persisted; plan response exposes preview; new overrides
flow.

- **Own the sequential `prompt_plan` call site** (`runSequentialPromptPlanStage`,
  added in cross-consistency review round 1 — WS-4 builds the runner as a
  callable and WS-6 starts at `image_generation`, so without this nothing
  invokes the skill). Order: strategy gate → idempotent-resume check →
  fail-closed reference/capacity resolution (BEFORE any LLM spend) →
  `childSubjectPolicy` pre-computation → loop-effects construction with
  DB-durable per-round persistence → runner invocation → reference-index
  mapping enforcement → persist → degraded-fallback handling. The
  deterministic plan and the shipped voiceover hook keep running; the skill
  enriches rather than replaces. One runner call covers skill Phases A–K at
  the `prompt_plan` boundary (reconciliation with spec §6.1's two-stage
  diagram recorded in section 05 §5.0).

- Persist skill output at `metadataJson.sequentialStoryboard.*` exactly per
  spec §19.2 (evidenceProfile with `assembly_documented`/`assembly_evidence`,
  claimWhitelist, conflicts, reviewStrategy, childSubjectPolicy,
  globalContinuity incl. wardrobe + video_global_block, shots[] with
  demonstration_type/depicts_minor/guardian_required/claim_trace/qc,
  loopReport, shotOverrides, finalQc, referenceManifest). Claim whitelist
  feeds the existing `claimEvidenceMapping.blockedClaims` (:5794) so the
  shipped paid-media gate applies.
- `GetAutoStoryboardReviewPlanOutputSchema`
  (`shared/hyperframes/runtimeApiSchemas.ts:63-70`, `.strict()`): add
  OPTIONAL `evidencePreview {needsConfirmation[], verifiedHighlights[],
  childSubjectPolicy}` and `referenceCapacity {modelCap, attachedAngles,
  trimmedAngles}` INSIDE the object. Populated only when flag on + sequential
  requested; existing clients unaffected.
  DESIGN DECISION (cost): the plan query must stay cheap, so `evidencePreview`
  is derived DETERMINISTICALLY from `ProductTruth` text at plan time
  (declared attributes, missing info, text-level title/description conflicts,
  category signals) — no LLM call, no vision. Full visual verification
  happens in-run (skill Phase A); visually-detected conflicts surface in the
  run UI/loop report and are excluded from output per spec §10.3 (unresolved
  conflicts never block generation except §23.1 hard cases).
- Confirmation loop: `confirmedAttributes` / `forbiddenClaims` overrides
  (WS-1) reach the skill input; confirmations upgrade claims to
  `user_confirmed`; unresolved conflicts excluded from output (never block
  generation except spec §23.1 hard cases).

### WS-6: Sequential unit pipeline (spec §18; Phase 2)

Goal: 9 independent image units generate, QA, repair, and hand off.

- `buildInitialImageUnits` (SVC:8459): sequential branch returns 9 units
  `sequential-shot-01..09`, role `sequential_shot_frame`.
- Unit prompt dispatcher (SVC:8539-8623): new role branch returns the shot's
  skill-authored prompt (from `sequentialStoryboard.shots[i]` or
  `shotOverrides`), with targeted-repair concat via the existing appender
  (:8615-8623, builder :1480-1503).
- Submission: existing `scheduleImageAttempt` (:18225) +
  `generateImageAsync` payload (:18584-18626) with
  `referenceImageUrls = approvedSequentialProductReferenceUrls(...)` and the
  WS-2 manifest; `aspectRatio "9:16"`, `numImages 1`. Per-unit attempts via
  `nextDirectAttempt` (:7735) and `directImageTasks` records (type :943-982)
  — restarts resume incomplete units without resubmitting completed ones.
- QA: extend `runShotFrameVisionQa` (:19287) — sequential units flow through
  the per-frame QA path (grid QA :18937 NOT invoked). Prompt additions: story
  continuity vs the shot contract (reuse `storyboard_continuity_mismatch`),
  multi-angle product fidelity (reuse `product_reference_mismatch`), guardian
  + assembly fields (WS-7). JSON schema string at :19380 gains the new
  fields; `normalizeShotFrameVisionQaDecision` (:1738-1801) parses + folds
  them.
- Repair budget: `effectiveQualityModePolicy(metadata).maxRepairAttemptsPerUnit`
  (:2578-2592) as-is; `maxImageProviderSubmissionsForFrameStrategy` already
  returns POSITIVE_INFINITY for non-3x3 (:8491-8498) — per-unit budget
  governs. Optional `qualityMode: high` best-of-2 for units 1–2: two attempts scored
  with `buildImageAttemptScoreBreakdown` (:6885) and the winner recorded on
  the unit — do NOT reuse `applyBestImageAttemptSelection` (:7085), which is
  grid-specific.
- Stage gate: all 9 units pass or accepted-with-warnings with ZERO
  publish-blocking codes (guardian/minor/assembly always block); reuse the
  acceptance flow (:20190-20310) per unit with that constraint.
- Handoff: `createStoryboardReview` (:17402) with
  `storyboardFrameUrls = [unit1..unit9]`; skip `splitStoryboardGrid`; clip
  metadata gains frameStrategy, depicts_minor, guardianRequired,
  demonstration_type, claim-trace summary.
- Metrics (Phase-2 landing per interview Q2): record per-mode
  `product_reference_mismatch` rate, continuity mismatch rate, repairs per
  accepted frame, publish-safety blocks, mean qualityScore into audit events
  + `imageAttemptReviews[]` metadata (see WS-12).

### WS-7: Shared evidence-guard package (spec §3.4, §11.5, §17; Phase 3)

Goal: assembly guard + guardian presence + claim/conflict injection for BOTH
modes behind `marketplaceReviewEvidenceGuard`.

- Shared builders in SVC (beside `buildMinorSafetyClothingLock` :1395):

  ```ts
  function buildDemonstrationEvidenceDirective(plan): string  // "" when off/N-A
  function buildGuardianPresenceDirective(plan): string       // "" when policy inactive
  function buildGuardianPresenceRepairInstruction(plan): string
  ```

- `childSubjectPolicy` computation (TS facts):
  `productChildRelated` = category child-related OR minor-safety signals
  (same trigger family as `marketplaceAutoReviewPlanNeedsMinorSafetyLock`
  :1357, regex :1306); `childDepictionPlanned` = any `shots[].depicts_minor`.
  Persisted in `sequentialStoryboard.childSubjectPolicy`; passed to the skill.
  ORDERING NOTE: the computation itself ships in Phase 2 (with WS-5) so the
  skill marks `depicts_minor`/`guardian_required` correctly from day one;
  WS-7 adds the ENFORCEMENT layers (directives, QA fields, publish-block,
  repair) in Phase 3.
- Injections (guard flag on): new array elements beside :15400 in
  `buildShotFramePrompt`, beside :15333 in `build3x3StoryboardPrompt`, into
  the 3x3 skill `runtime_contract` (:9352), and into the sequential runner
  contract. Claim whitelist + conflict exclusions appended to the 3x3
  contract as exclusion lines.
- QA fields both paths: per-frame schema string :19380 and grid schema string
  :19043 gain `adultGuardianPresent`, `framesMissingGuardian`,
  `assemblyContentDetected`. Verdict normalizer (:1738-1801):
  `minorPresent === true && adultGuardianPresent !== true` ⇒ repair with
  reason code `guardian_presence_missing` (FAIL-CLOSED — deliberate exception
  to the `!== false` fail-open idiom :1765-1771); `assemblyContentDetected
  === true` while `assembly_documented` false ⇒ repair with
  `assembly_content_unverified`.
- Publish-block set (`imageReasonCodeBlocksPublishSafety` :1650): add
  `guardian_presence_missing` (and keep minor-safety codes); assembly code
  blocks the unit after repair budget but is not a publish-safety code (it
  fails the unit instead).
- Repair directives: new entries in
  `MARKETPLACE_AUTO_REVIEW_REPAIR_REASON_CODE_DIRECTIVES` (:1443) — guardian:
  "add the supervising adult guardian [matching @Image(K+1)] OR reframe
  without the minor"; assembly: "reframe on the fully assembled product;
  remove parts/disassembly imagery".
- Preflight blockers: `guardian_directive_missing`,
  `assembly_demo_unverified` (both modes when guard on).
- Existing rules preserved verbatim: presenter-never-child (:4781/:4720),
  clothing lock, characterPresenceMode thresholds now counted across 9
  separate frames.
- Diff-shape snapshot: guard flag alone ⇒ 3x3 prompt output differs from
  baseline ONLY by the enumerated directive lines.

### WS-8: Per-shot regeneration + edited prompts (spec §18.4, §21.5; Phase 2)

- New tRPC mutation in `marketplaceCapture.ts` following the select… template
  (:1171-1184):

  ```ts
  regenerateAutoReviewSequentialShot
    .input(z.object({ runId: z.string().min(1).max(64),
                      shotId: z.number().int().min(1).max(9) }))
  ```

  Service re-runs ONE unit (optional single-shot prompt refresh via a
  single-shot skill contract — the VD `generateStartFrameShotPrompt` shape —
  WITHOUT re-running the 3-round loop → image job → QA/repair), leaving the
  other 8 untouched; re-validates reference mapping at submit.
- `shotOverrides[shotId]` (dialogue / image prompt / video prompt / editedAt)
  stored under `sequentialStoryboard`; regeneration prefers overrides after
  the SAME deterministic preflight; failing edits rejected with the specific
  blocker id + Thai message (never silently rewritten).

### WS-9: Full-video per-shot (spec §14; Phase 4)

- Video prompts come from the skill pack (self-contained, global block
  included). Preflight: global-block marker + ≤2000 chars + price backstop
  per prompt before any video job.
- Attachment: approved unit frame = `referenceImageUrls[0]`; remaining budget
  `maxReferenceImages − 1` filled guardian portrait (when depicted) → primary
  product → angles, trim end; single-ref models (grok-imagine-video-1-5,
  `modelRegistry.ts:890-891`) get ONLY the start frame (VD guard
  :11579-11600). Reference-mode semantics = Feature 118
  `single_storyboard_frame` (references are immutable product refs, never
  stop frames).
- Per-shot `duration_seconds` (3–10) passed where the model supports it;
  otherwise model duration used and dialogue was already fitted by the skill.
  Plan blocker when the selected video model lacks start-frame support
  (kling-2.6/sora-2 :954-1002).
- Audio strategies, video_edit, render, library stages unchanged.

### WS-10: Credits and estimates (spec §22; Phase 2)

- `buildHyperframesCreditEstimate` call site
  (`hyperframesAutoPlanService.ts:330-340`): add `imageJobCount` (9 sequential
  / 1 grid) to the estimate inputs; extend
  `autoPlanWorkerComplexityMultiplier` (:167-182) with sequential factor 1.10
  (tunable).
- Runtime spend unchanged (per-task reserve/reconcile;
  `reconcileMarketplaceLlmCredits` :19116). Estimate card must reflect 9
  image jobs before start.

### WS-11: UI (spec §21; Phases 2/3/5)

All copy TH/EN via `hyperframesUiCopy.ts`; reuse existing panel patterns.

- Strategy option in `frameStrategyOptions`
  (`AutoStoryboardAdvancedOverrides.tsx:276-285`) + summary-card strategy
  label; hidden when flag off.
- Angle chips + capacity meter on the product-images surface
  ("ใช้ได้ {n}/{modelCap} ภาพอ้างอิงต่อภาพ"), trim warning chip; evidence-only
  labels for package/parts_diagram.
- Guardian notice (§17.5 Thai copy) when childSubjectPolicy active; no
  opt-out; "การปรากฏของบุคคลในภาพ 3x3" label generalized for sequential to
  "การปรากฏของบุคคลในภาพ".
- Evidence & conflict review collapsible (default collapsed): verified chips,
  needsConfirmation ยืนยัน/ตัดออก → `confirmedAttributes`, free-text
  "คำที่ห้ามใช้" → `forbiddenClaims`; new fields "กลุ่มเป้าหมาย (ไม่บังคับ)" →
  `targetAudience`, "ความต้องการเพิ่มเติม (ไม่บังคับ)" → `userRequirements`.
- Storyboard Review per-shot cards: dialogue, both prompts + char counts,
  claim sources, QC status, guardian badge, demonstration_type,
  "สร้างภาพนี้ใหม่" action, editable fields with preflight errors; Loop
  Report section (rounds, candidates, selected version).
- Existing pickers (tone/structure/motion/presets/model) untouched.

### WS-12: Observability + GA-gate plumbing (spec §25–26; Phases 2/5)

- Audit events: `sequential_skill_plan_round`,
  `sequential_prompt_degraded_fallback`, prompt-over-budget rewrites (with
  prompt_kind), guardian/assembly occurrences (shot id only),
  `sequential_reference_angles_trimmed`.
- Mode-comparison metrics recorder (both modes): mismatch rates, repairs per
  accepted frame, publish blocks, mean qualityScore — queryable for the
  Phase-5 pilot review that pins numeric GA thresholds.
- Real-LLM gate (CI-tagged/manual, pre-GA): children's desk chair (4 angles +
  adult ref) and a furniture fixture with NO assembly documentation — asserts
  9 frames, guardian in every minor frame, zero assembly content, no price
  tokens, budgets + global block ×9.

## 5. Milestones (map to spec §26 phases)

1. **M1 Foundation (dark)** = WS-1 + WS-3 + runner skeleton (WS-4 partial) +
   snapshots. Exit: flags off ⇒ byte-identical; skill bundle contract tests
   green.
2. **M2 Sequential pipeline** = WS-2, WS-4, WS-5, WS-6, WS-8, WS-10 +
   metrics (WS-12 partial) + core UI (WS-11 partial). Internal tenant only.
3. **M3 Shared evidence-guard** = WS-7 (+ guardian UI notice). 3x3 may enable
   the guard flag in production once its tests pass — independent of
   sequential GA.
4. **M4 Full-video** = WS-9.
5. **M5 Evidence UI + GA** = WS-11 remainder, WS-12 remainder, real-LLM gate,
   pilot metrics review → pin GA thresholds; then per-tenant enablement.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 27k-line SVC edits collide with concurrent sessions (repo has live prod from checkout) | small additive forks; feature-flag everything; snapshot suite as tripwire; verify via isolated copies per repo memory |
| Skill returns malformed/weak JSON on cheap models | lenient-enum + bounded retry machinery (VD precedent); deterministic fallback keeps runs alive; never "fix" by switching models (cost policy) |
| 9× image jobs cost surprise | estimate card shows imageJobCount pre-start; per-unit repair budget bounded; candidate_count ≤3 |
| Guardian/assembly QA false positives block frames | targeted repair rounds first; reason-code metrics watched in pilot; prompt criteria iterated in skill references (skill-first) |
| `.strict()` schemas reject additive fields | all new plan-response fields added INSIDE the strict objects (verified anchor runtimeApiSchemas.ts:63-70) |
| Shared guard accidentally changes 3x3 beyond directives | diff-shape snapshot test enumerates allowed lines |
| tsc baseline noise (~987 pre-existing errors) | compare against baseline snapshot, gate only on NEW errors |

## 7. Out of scope (this plan)

Phase 6 Tier-2 (`execution_mode: agents_python`) executable skill; `auto`
strategy preferring sequential; configurable shot count; multilingual
dialogue; visual-similarity QC; price overlay slot; Feature 117 run-engine
migration.
