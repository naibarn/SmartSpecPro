# Interview — VD P1 (Features 137 + 138 Phase 1)

## 2026-08-01 reconciliation note

The user asked to re-audit Specs 137–139, authorized direct spec improvements, and
then requested a considered implementation order plus continued deep-plan. Current
code/spec evidence supersedes stale 2026-07-23 operational assumptions:

- the `basePlan` bug is no longer a prerequisite; recapture baseline instead;
- use long-form flags and a separate neighbor child flag;
- implement foundation → 139 → 137 → 138 P1a → verification → 138 P1b;
- required multi-shot scene planning fails before paid render, while explicit
  single-shot remains warning/fail-open;
- current reconciliation/spec files are authoritative when older answers below
  conflict. No further product interview is required for these resolved choices.

Date: 2026-07-23 · 1 round, 4 questions (research answered everything else)

---

## Q1 — The `basePlan is not defined` production bug found at HEAD

Research found a genuine `ReferenceError: basePlan is not defined` thrown from
`server/routers/verticalDramaEpisodes.ts` (fails 2 tests in
`verticalDramaEpisodes.generateShotStartFramePrompt.test.ts`), inside the same
mutation Feature 138 P1 must edit.

**Answer: แก้เป็นขั้นแรกของแผนนี้ (fix it as Step 0 of this plan).**

Implication: the plan opens with a prerequisite bug-fix step, before any feature
work. Rationale accepted: we must touch that file anyway, and leaving it red
makes the fail-set baseline noisier than it needs to be.

---

## Q2 — Delivery shape (both P1s share three files)

**Answer: สาขาเดียว ทำต่อกันเป็นลำดับ (one branch, sequential inside it).**

Order: Step 0 bug fix → shared foundation → 137-P1 → 138-P1 → joint verification.
Rationale accepted: the shared files are edited once, no cross-branch conflicts,
one deploy — and both flags ship OFF, so landing them together carries no
behavioral risk.

---

## Q3 — When is the Scene Visual State created?

**Answer: อัตโนมัติตอนใช้ครั้งแรก + มีปุ่มสั่งเองด้วย (lazy on first use AND an
explicit action).**

Implication: the first start-frame prompt/render for a scene pays ~1 LLM call to
author the lock, then every later shot of that scene reuses it for free. Users
never have to learn a new step, but can still regenerate or edit the lock
deliberately. Plan must therefore cover: lazy generation inside the request path
(with a failure posture that never blocks the render), an explicit
`planSceneVisualState` mutation, and `updateSceneVisualState` for manual edits.

---

## Q4 — Prompt budget, given VD bypasses the media router

Research finding presented: VD calls `mediaGenerationService.generateImageAsync`
directly (`verticalDramaEpisodes.ts:10441`), so the per-model cap machinery in
`media.ts` never runs for VD; VD only enforces the flat
`VD_IMAGE_PROMPT_MAX = 3800`, and the `policy_safe_rewrite` engine **throws**
(`VdSchemaValidationError`) rather than trimming when the final prompt exceeds it.
Appending a scene-lock block there could break currently-working shots.

**Answer: ทำ per-model budget เต็มรูปแบบใน P1 (full per-model budget in P1).**

Implication: the foundation step must extract the resolver from `media.ts`,
forward the model's `configJson` into the VD render path, seed
`gpt-image-2` with `maxPromptLength: 20000`, and keep `3800` as the default for
every unconfigured model (Magnific / Higgsfield unchanged, per the standing
provider-scoping directive).

---

## Auto-decisions (technical — decided from research, not asked)

- **Flag names** `vdMotionContracts` / `vdSceneContinuity`, registered in all four
  places (`shared/featureFlags.ts` interface + key list + defaults=false, plus
  `client/src/components/admin/tenantFeatureFlagGroups.ts`) — matches the shipped
  `verticalDramaRetentionHooks` pattern.
- **Flag plumbing**: resolve once per request in the router via a local
  `resolveXFlag(tenantId)` helper; thread the boolean into services; services never
  call `getTenantFeatureFlags` themselves — copied from `verticalDramaEpisodes.ts:3541-3564`.
- **Conditional prompt lines**: ternary returning `null` inside the existing
  `.filter(Boolean)` arrays, so flag-off output is byte-identical — copied from the
  NATIVE AUDIO block (`verticalDramaVideoMotionPromptGeneration.ts:1981-1983`).
- **New pure modules** live at `shared/verticalDramaSeries/<name>.ts` with tests at
  `shared/verticalDramaSeries/__tests__/<name>.test.ts`; module shape follows
  `audienceAgeRating.ts` (tuple → union → guard → lenient resolver → render helper).
- **New skill service** copies `verticalDramaLocationDetector.ts` end-to-end
  (folder const → loader → lenient zod → model resolve → JSON call with retry →
  credit gate/deduct).
- **Scene-key resolution stays in the router/pipeline**; the start-frame service
  receives a pre-rendered block string — forced by the fact that
  `verticalDramaStartFrameGeneration.ts` never receives `locationKey` or the storyboard.
- **Testing**: Vitest from `apps/web`; new `beforeEach` blocks use `mockReset()` on
  any `vi.fn()` that gets `…Once` queues (confirmed leak); Gate A must stay 266/266
  green; Gate B judged by fail-set identity diff.
- **No real-LLM gate exists for VD** — the plan creates the first one following the
  `MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE` pattern (`describe.skipIf`, env value must
  be exactly `"1"`), in addition to real-FILE loader gates.
