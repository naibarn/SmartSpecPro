# Marketplace Auto Review — Optional User Motion Direction (คำกำกับการเคลื่อนไหว)

Date: 2026-07-18
Status: Approved by user — implementing (Phase 1 → Phase 2), Opus agents per user instruction

## Problem Statement

Video motion in marketplace auto-review output is generic ("Subtle product-focused
motion" fallback) because no user input steers it. The user wants an OPTIONAL
free-text "motion direction" field (Thai example: "นางแบบหยิบขวดแชมพูขึ้นมา
กดหัวปั๊มให้แชมพูไหลลงบนฝ่ามือ นำมาชะโลมบนศีรษะ เกิดฟองนุ่มทั่วเส้นผม
แล้วปิดท้ายด้วยการโชว์สินค้าให้เห็นชัดเจน") that flows — skill-first — into shot
planning and the real video prompt, so motion is realistic and product-true.

## Non-Negotiable Product Rules

1. **Optional, opt-in only.** Empty/absent field ⇒ every existing prompt and code
   path stays BYTE-IDENTICAL. No new LLM calls, no behavior change.
2. **Never block.** Any new LLM/skill failure degrades to the existing
   deterministic path (same principle as
   planning/marketplace-auto-review-storyboard-resilience/plan.md).
3. **Must reach the REAL prompt.** The existing `creativeBrief` field is a known
   taught-not-wired trap: it reaches only the preview
   (`buildVideoSegmentPrompt`, shared/videoSegmentPlanner/promptBuilder.ts:110),
   NEVER the submitted provider prompt. Every phase ships a test asserting the
   user text reaches the actually-submitted prompt.
4. Skill-first boundary (per VD pattern): TS passes facts; creative rules live in
   skill.md; validators fail-closed and never append creative content.

## Research Evidence (verified 2026-07-18, file:line anchors)

### Current video path (marketplaceAutoReviewService.ts)
- Stage flow `BASE_STAGES`/`FULL_VIDEO_STAGES` (~:738-746): … prompt_plan →
  image_generation → storyboard_review → video_generation → …
- REAL submitted video prompt: `scheduleVideoAttempt` (~:21862), per unit
  `prompt = buildVideoPrompt(plan, shot, {...})` (~:21946-21955) + existing
  append precedent `unit.repairInstruction` ("Targeted repair: …").
- `buildVideoPrompt` (~:15357) → `buildCompactMarketplaceAutoReviewVideoPrompt`
  (~:15257) → action line from `shot.title/visual/movement`
  (`buildCompactMarketplaceAutoReviewVideoActionLine` ~:15223-15255).
  Deterministic TS. NO skill today.
- `shot.movement` generated ONCE at concept_story by inline "Production
  Director" LLM prompt `buildRuntimeInput` (~:13378-13429); parsed by
  `normalizeCreativeShot` (~:12275, movement required non-empty);
  `AutoReviewShot` type (~:779-792).
- Directive precedents inside `buildRuntimeInput`:
  `buildMarketplaceAutoReviewCreativeDirectionDirective` (~:4194-4225) and
  `buildMarketplaceAutoReviewDescribedCharacterDirective` (~:4691-4708) — both
  emit "USER-SELECTED … LOCK:" blocks.
- English contract helper: `marketplaceAutoReviewEnglishPromptText` (Thai input
  must pass through translation/sanitize before provider prompt).
- Run start: `startMarketplaceAutoReviewRun` (~:17310);
  `creativeBrief = cleanText(input.creativeBrief)` (~:17366) persisted into
  RunMetadata (~:17506).

### Routers / schemas
- Legacy mutation `startAutoReview`: apps/web/server/routers/marketplaceCapture.ts:667-823
  (used by MarketplaceCaptureProductDetail page; NO creativeBrief field today).
- Newer mutation `startAutoStoryboardReview`: marketplaceCapture.ts:850 →
  `HyperframesAutoPlanOverrideInputSchema` at
  apps/web/shared/hyperframes/autoPlan.ts:176 with `creativeBrief
  z.string().trim().max(2000).optional()`; **schema is `.strict()`
  (autoPlan.ts:184-186)** — new keys must be added explicitly or Zod drops them.
  Plumbs via normalizeHyperframesAutoPlanOverrides (autoPlan.ts:319-325) →
  hyperframesRuntimeApiService.ts:1309/:1392 → startMarketplaceAutoReviewRun.

### UI (apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx)
- Run-start form inline in page; optional free-text precedent:
  `renderCharacterDetailField(label, value, onChange, placeholder)` (:4781-4799),
  used at :4877-4894; state hooks ~:2447-2455.
- Creative-direction panel ("อารมณ์และโครงเรื่อง") :4977-5067 — recommended
  placement for the new textarea.
- Mutation call site :4663-4675 (`startAutoReviewMutation.mutate({...})`).
- Labels are hardcoded Thai in this page (no locale file for this form).

### Reusable skill-first pattern (Vertical Drama)
- Optional user free-text directive: `repair_instruction` section in
  apps/web/skills/vertical-drama-shot-video-prompt/skill.md:438-453 — "treat as
  an ADDITIONAL directive layered on top of every Hard Rule … never a
  replacement"; rendered only-when-present at
  verticalDramaVideoMotionPromptGeneration.ts:1669-1671.
- Facts-only user prompt builder: `buildShotVideoPromptUserPrompt`
  (verticalDramaVideoMotionPromptGeneration.ts:1500-1677) — conditional strings,
  `.filter(Boolean).join("\n")`, absent field ⇒ zero bytes.
- Vision-capable JSON retry harness: `executeVisionAwareJsonCallWithRetry`
  (verticalDramaVideoMotionPromptGeneration.ts:1097-1129); schema retry
  VD_SCHEMA_MAX_RETRIES=2; fail-closed `extractJson` + zod; validator never
  appends content.
- Skill file dual-case caveat: loader reads lowercase `skill.md` BEFORE
  `SKILL.md` — author lowercase as canonical, keep uppercase twin byte-identical.

## Design Decisions (locked)

- **Field name (frozen contract): `motionDirection`** — top-level optional field
  on BOTH mutations (`startAutoReview` legacy + `startAutoStoryboardReview`
  overrides). `z.string().trim().min(1).max(2000).optional()`. NOT inside
  referenceAnchors (motion ≠ character identity).
- **Scope: run-level** (one text for the whole run), matching characterBrief.
  Per-shot targeting is out of scope.
- **UI**: one textarea "คำกำกับการเคลื่อนไหวในวิดีโอ (ไม่บังคับ)" in the
  creative-direction panel, ALWAYS wired but visually hinted as video-focused;
  placeholder = the user's shampoo example.
- **Phase 2 activation**: the new video-prompt skill runs ONLY when
  `motionDirection` is present. Absent ⇒ legacy deterministic builder untouched
  (zero cost, zero risk). Skill failure ⇒ fall back to Phase-1 output (never
  block).

## Phase 1 — Plumbing + Two Real Injection Points (no new skill)

### 1A Backend (ssp-backend, Opus)
1. `apps/web/server/routers/marketplaceCapture.ts`: add `motionDirection` to the
   `startAutoReview` Zod input (:667-770) and pass into
   `startMarketplaceAutoReviewRun`.
2. `apps/web/shared/hyperframes/autoPlan.ts`: add `motionDirection` to
   `HyperframesAutoPlanOverrideInputSchema` (remember `.strict()`), and to
   `normalizeHyperframesAutoPlanOverrides` merge → plan defaults.
   `apps/web/server/services/hyperframesRuntimeApiService.ts` (~:1392): pass to
   `startMarketplaceAutoReviewRun`.
3. `marketplaceAutoReviewService.ts`:
   - `startMarketplaceAutoReviewRun` input type + `cleanText` + persist into
     RunMetadata (`metadata.motionDirection`), mirroring creativeBrief
     (~:17366/:17506).
   - **Injection point 1 (shot planning)**: new
     `buildMarketplaceAutoReviewMotionDirectionDirective(motionDirection)` —
     emits a "USER-SELECTED MOTION DIRECTION LOCK:" block instructing the
     Production Director to decompose the user's motion sequence across the shot
     list into per-shot `movement` values, chronological order preserved, product
     truth intact, ending beat honored (e.g. final product showcase). Append into
     `buildRuntimeInput` ONLY when present (empty ⇒ byte-identical prompt).
     Directive text states: motion direction is ADDITIONAL to product-truth and
     safety rules, never a replacement (VD repair_instruction phrasing).
   - **Injection point 2 (real video prompt)**: in `scheduleVideoAttempt`
     (~:21946-21955), when `metadata.motionDirection` present, append a
     "User motion direction (MANDATORY, additional to the rules above): …" line
     to the submitted prompt via the same mechanism as `repairInstruction`.
     Thai text must pass through `marketplaceAutoReviewEnglishPromptText` (same
     translation path as shot.movement) before append; on translation failure use
     the raw text (never block).
4. Preview consistency: also thread into
   `buildMarketplaceAutoReviewVideoSegmentPlannerInput` (~:21202) so the
   storyboard-review preview shows the same guidance (do NOT rely on
   creativeBrief).

### 1B Frontend (ssp-frontend, Opus)
1. `MarketplaceCaptureProductDetail.tsx`: state
   `autoReviewMotionDirection` (~:2455); textarea via
   `renderCharacterDetailField` in the creative-direction panel (:4977-5067),
   label "คำกำกับการเคลื่อนไหวในวิดีโอ (ไม่บังคับ)", placeholder = shampoo
   example, helper caption ว่าใช้กับโหมดวิดีโอ; include
   `motionDirection: trimmed || undefined` in the mutation payload (:4663-4675).
2. Reset with the other form fields where the form resets (find existing reset
   block for autoReviewPropDetails etc.).

### 1C Tests (part of 1A/1B)
- Router: motionDirection accepted, trimmed, absent OK, >2000 rejected.
- Service: (a) buildRuntimeInput WITHOUT motionDirection is byte-identical to
  before (snapshot/equality test); (b) WITH it, directive block present exactly
  once; (c) scheduleVideoAttempt-submitted prompt contains the motion line when
  present and not when absent — **assert on the REAL submitted prompt value**
  (anti-creativeBrief-trap test); (d) hyperframes overrides path carries the
  field through normalize → run input.

## Phase 2 — Skill-First Video Prompt (`product-video-motion-prompt`)

### 2A New skill (author under apps/web/skills/product-video-motion-prompt/)
- Files: `skill.md` (lowercase canonical) + byte-identical `SKILL.md`,
  `schemas/input.schema.json`, `schemas/ui.schema.json`.
- Frontmatter: category `video_generation`-adjacent prompt skill
  (`prompt_enhancement` family like product-reference-storyboard), execution
  `llm-only`, `execution_policy: { mode: requirements, requirements:
  { supportsVision: true }, fallbackPolicy: error }` (context length modest —
  do NOT require 1M).
- Inputs (facts computed by TS, skill decides creative use): product facts,
  shot title/visual/movement (planner's), voiceover excerpt, aspect ratio,
  duration seconds, keyframe image(s) (start/stop frame URLs), reference product
  images, and OPTIONAL `motion_direction` (user free text).
- skill.md rules (authored, not code): ground motion in the keyframe image;
  physically-plausible product interaction (pump, pour, lather physics);
  continuity with start/stop frames; when `motion_direction` present — treat as
  MANDATORY ADDITIONAL directive on top of hard rules, mapping the relevant
  slice of the user's sequence to THIS shot's position in the timeline; when
  absent, the section does not apply; output language English; no invented
  product claims.
- Output contract: plain-text video prompt (text_output validation like
  product-reference-storyboard schemaHint), bounded length.

### 2B Runner + integration (ssp-backend, Opus)
- New `productVideoMotionPromptSkillRunner.ts` modeled on
  `productReferenceStoryboardSkillRunner.ts` INCLUDING the vision resilience we
  shipped 2026-07-18: `runProductReferenceStoryboardVisionLlmCallWithFallback`
  pattern (multi-vision-model retry → text-only fallback) — reuse/extract the
  helper rather than copy-paste if reasonably factorable.
- `scheduleVideoAttempt`: when `metadata.motionDirection` present → try skill
  runner per video unit (keyframes + facts + motion_direction) → on ANY failure
  fall back to Phase-1 prompt (deterministic + appended motion line), audit
  `videoPromptSource: "skill" | "deterministic_fallback"` + failure reason in
  unit/stage output (warning marker, reuse completed_with_warnings mechanics if
  available). When absent → legacy path untouched (no skill call, no cost).
- Credits: each skill call is billed like other skill LLM calls; log per-unit.
- Skill registry sync picks the new folder automatically (skillRegistry
  auto-sync); verify enabled state + policy resolution
  (resolveSkillExecutionPolicy) with a unit test.

### 2C Tests
- Runner: skill success path builds prompt from skill output; skill failure →
  deterministic fallback prompt equals Phase-1 output; absent motionDirection →
  runner never invoked (spy).
- Skill loader: input schema loads; lowercase/uppercase twins identical
  (guard test comparing the two files).

## Risk Assessment

- `.strict()` schema drop (autoPlan.ts) — covered by explicit field + test 1C(d).
- Byte-identical guarantee — covered by equality tests 1C(a).
- Thai→English contract — translation step with raw-text fallback (never block).
- Double LLM cost — only when user opts in; audited.
- Concurrent sessions may hold uncommitted edits in
  MarketplaceCaptureProductDetail.tsx / marketplaceAutoReviewService.ts — agents
  must Read current state before editing and keep diffs additive/minimal.
- Deploy: server changes need build:deploy + systemctl restart smartspec-web
  (conductor does this after verification; NOT the agents).

## Verification (conductor)

1. `pnpm vitest run` on touched/new test files — all green.
2. `pnpm check` — no NEW errors in touched files.
3. Deploy + restart; smoke: start a run WITHOUT the field (behavior unchanged)
   and WITH it (directive visible in audit prompt logs).

## Progress

- [x] Research complete (3 read-only agents, evidence above)
- [x] Plan approved by user (2 phases, optional-only, Opus implementation)
- [x] Phase 1A backend plumbing + injections + tests (2026-07-18, ssp-backend)
      - Router `startAutoReview` + `HyperframesAutoPlanOverrideInputSchema`
        (.strict) both carry optional `motionDirection`
        (z.string().trim().min(1).max(2000).optional()); normalize+apply thread it
        to plan.defaults → startMarketplaceAutoReviewRun → RunMetadata.
      - Injection 1: `buildMarketplaceAutoReviewMotionDirectionDirective` emits a
        "USER-SELECTED MOTION DIRECTION LOCK:" block (chronological decomposition,
        additional-not-replacement, final-beat) inserted into buildRuntimeInput
        only when present (empty ⇒ filtered ⇒ byte-identical concept prompt).
      - Injection 2: `buildMarketplaceAutoReviewSubmittedVideoPrompt` appends a
        "User motion direction (MANDATORY, additional to the rules above): …" line
        to the REAL scheduleVideoAttempt prompt (via
        marketplaceAutoReviewEnglishPromptText w/ raw-text fallback); byte-identical
        when absent, repair-only behavior unchanged.
      - Preview parity: motionDirection threaded through videoSegmentPlanner
        contracts/planner/promptBuilder + buildMarketplaceAutoReviewVideoSegmentPlannerInput.
      - Tests: 22 pass (router validation, directive present-once + byte-identical,
        REAL submitted-prompt present/absent, hyperframes carry-through). pnpm check:
        0 new errors in touched files (140 pre-existing baseline unchanged). The 3
        image-prompt storyboard test failures in marketplaceAutoReviewService.test.ts
        are pre-existing on clean HEAD (concurrent skill/prompt-length work), not this change.
- [x] Phase 1B frontend textarea + payload (autoReviewMotionDirection state, creative-direction textarea + video-mode caption, payload motionDirection trimmed/sliced/undefined; no form-reset block exists for these fields; payload TS error pending Phase 1A router type)
- [x] Phase 1 verification (conductor) — 22/22 tests green after fixing JWT_SECRET vi.hoisted stub in router test; pnpm check = 140 baseline, TS2353 in MarketplaceCaptureProductDetail cleared
- [x] Phase 2A skill authored (2026-07-18, ssp-backend)
      - New `apps/web/skills/product-video-motion-prompt/`: `skill.md` (lowercase
        canonical) + byte-identical `SKILL.md` twin + `schemas/input.schema.json`
        + `schemas/ui.schema.json`. Frontmatter: category `video_prompt_generation`,
        execution_mode llm-only, enabled_by_default true, execution_policy
        `{ mode: requirements, requirements: { supportsVision: true },
        fallbackPolicy: error }` — vision-only, NO 1M context requirement.
      - Body rules (authored, not code): keyframe grounding lock, physically-
        plausible product interaction, start→stop continuity/identity, optional
        `motion_direction` = MANDATORY ADDITIONAL directive mapped to THIS shot's
        timeline slice (absent ⇒ section does not apply, VD repair_instruction
        shape), English output, no invented product claims, bounded plain-text.
- [x] Phase 2B runner + integration + fallback (2026-07-18, ssp-backend)
      - New `server/services/productVideoMotionPromptSkillRunner.ts`
        (`runProductVideoMotionPromptSkill`). Vision resilience REUSED by importing
        the exported generic `runProductReferenceStoryboardVisionLlmCallWithFallback`
        (signature already model-agnostic: takes visionMessages/buildTextOnlyMessages/
        callModel/model IDs) — no loop copy-paste; only the small message-builders +
        candidate/text-only model resolvers are local. Output = bounded plain-text
        video prompt.
      - `scheduleVideoAttempt`: new exported seam
        `resolveMarketplaceAutoReviewVideoUnitPrompt({ basePrompt, repairInstruction,
        motionDirection, runSkill })`. motionDirection present ⇒ try skill per unit
        (product facts + shot title/visual/movement + voiceover + 9:16 + duration +
        start/stop keyframe URLs via referenceImagesForVideoUnit + motion_direction),
        success ⇒ skill prompt (+ targeted-repair line preserved), ANY failure ⇒ exact
        Phase-1 prompt (never throws/blocks). motionDirection absent ⇒ runSkill=null,
        skill never invoked (legacy byte-identical, zero cost). Per-unit audit recorded
        on the direct video ref's `skillRuntime` (videoPromptSource:
        "deterministic" | "skill" | "deterministic_fallback" + failureReason +
        warnings:["video_prompt_skill_fallback"] on fallback — reuses existing
        skillRuntime warning channel, no new stage status).
- [x] Phase 2C tests (2026-07-18, ssp-backend) — 14 new pass, 22 Phase-1 re-run green (36 total)
      - Seam (`marketplaceAutoReviewVideoMotionPromptSeam.test.ts`, 6): skill success
        (source=skill, no double motion line, repair preserved); failure ⇒ prompt
        EQUALS Phase-1 output exactly; empty-prompt ⇒ fallback; absent/whitespace
        motion ⇒ spy proves runSkill NEVER called.
      - Runner (`productVideoMotionPromptSkillRunner.test.ts`, 3): success builds
        prompt from skill LLM output + dispatches a vision image_url message (proves
        reuse of the real fallback helper); facts-only user prompt (absent ⇒ zero bytes,
        motion_direction rendered as mandatory additional directive).
      - Loader/policy (`productVideoMotionPromptSkillLoader.test.ts`, 5): skill.md/SKILL.md
        byte-identical (fs compare); frontmatter llm-only/enabled/vision-only + no 1M;
        input schema loads (motion_direction + required keys); ui schema orders
        motion_direction; resolveSkillExecutionPolicy resolves the vision model
        (mocked rows) with modelSource=requirements_match.
      - pnpm check: 140 total (unchanged baseline), 0 new errors in touched files.
- [x] Phase 2 verification + deploy — conductor: 43/43 tests green (14 new Phase-2 + 22 Phase-1 + 7 storyboard-resilience regression); skill twins byte-identical; build:deploy + web restart 2026-07-18 09:21; service active, web 200, skill row synced+enabled in DB (slug product-video-motion-prompt)

## Phase 3 — Wire creativeBrief (แนวเรื่องหรือคำบรรยายเพิ่มเติม) into the real planner prompt

User report (2026-07-18): filled "แนวเรื่องหรือคำบรรยายเพิ่มเติม" ("มีเด็กผู้หญิงชาวไทยอายุ 6 ขวบ
แม่กำลังสระผมให้") in the Auto advanced-overrides panel; generated image prompts
ignore it entirely. Verified: the field is `creativeBrief`
(AutoStoryboardAdvancedOverrides.tsx), cleaned+persisted at
marketplaceAutoReviewService.ts:17392/:17438/:17533, but consumed ONLY by the
preview segment planner (:21231). `creativeBriefSnapshot` (system-built object,
:14518, injected at :13449) does NOT contain the user's text. This is exactly
the taught-not-wired trap documented in Non-Negotiable Rule 3.

Fix (mirror the motionDirection Phase-1 injection):
1. New `buildMarketplaceAutoReviewCreativeBriefDirective(creativeBrief)` —
   "USER-SELECTED STORY DIRECTION LOCK:" block: the Production Director must
   weave the user's story/scenario into the shot plan (characters, setting,
   scenario per shot: storyboardGuide/visual/voiceover), chronologically
   coherent, ADDITIONAL to product truth + safety rules (never replaces them;
   minor-safety rules still apply when the scenario includes children).
2. Inject into `buildRuntimeInput` next to the motionDirection directive,
   only-when-present (absent ⇒ byte-identical).
3. Plumb creativeBrief into `buildGatewayCreativeAutoReviewPlan` the same way
   motionDirection was plumbed (from startMarketplaceAutoReviewRun).
4. No router/UI changes needed: the advanced-overrides path already carries
   creativeBrief end-to-end into RunMetadata.
5. Tests: byte-identical when absent; directive present exactly once when set;
   the user's text reaches the planner prompt (anti-trap assertion).

- [x] Phase 3 implementation + tests (2026-07-18, ssp-backend)
      - New `buildMarketplaceAutoReviewCreativeBriefDirective(creativeBrief)` +
        exported `creativeBriefDirectiveForTest` mirror the motionDirection helpers
        (marketplaceAutoReviewService.ts ~:4731-4753). Emits a "USER-SELECTED STORY
        DIRECTION LOCK:" block: Production Director weaves the user's scenario
        (characters/setting/situation) into per-shot storyboardGuide/visual/voiceover,
        chronologically coherent, ADDITIONAL-not-replacement, with all minor-safety
        rules preserved when the scenario involves children.
      - Injected into buildRuntimeInput adjacent to motionDirectionDirective
        (computed ~:13403, inserted ~:13426); array is `.filter(v => v !== "")` before
        join ⇒ absent creativeBrief = byte-identical concept prompt.
      - Plumbed like motionDirection: `creativeBrief?: string | null` added to
        buildGatewayCreativeAutoReviewPlan params (~:13294) and passed at the call site
        (~:17771). creativeBrief already cleaned at :17392 + persisted to RunMetadata —
        no router/schema/UI change; preview usage (:21231) + creativeBriefSnapshot
        (:13449/:14518) untouched.
      - Tests: new `marketplaceAutoReviewCreativeBrief.test.ts` (5): "" when
        absent/empty/whitespace (byte-identical), LOCK present exactly once, user text
        verbatim (anti-trap), per-shot storyboardGuide/visual/voiceover + chronological,
        additional-not-replacement + minor-safety language. 27/27 green (5 new + 22
        regression: motion-direction service 8, router 5, autoPlan 9). pnpm check: 140
        baseline unchanged, 0 new errors in touched files.
- [x] Phase 3 verification + deploy — conductor: 49/49 combined tests green (creativeBrief 5 + motion service 8 + seam 6 + router 5 + autoPlan 9 + overrides panel 16); also added motionDirection field to AutoStoryboardAdvancedOverrides panel (hyperframes path UI gap found by user); build:deploy + restart 2026-07-18 ~09:5x, service active web 200
