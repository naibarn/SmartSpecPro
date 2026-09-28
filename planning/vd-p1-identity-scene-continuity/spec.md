# VD P1 — Identity Stability + Scene Continuity (combined Phase 1 of Features 137 & 138)

Date: 2026-07-23
Scope: **Phase 1 only** of two sibling specs, implemented together because
they touch the same files and would otherwise conflict.

Authoritative source specs (read these first — this file is the SCOPE
CONTRACT, they are the DESIGN):
- `specs/feature/137-vertical-drama-identity-stable-i2v-pipeline/spec.md` (v1.2.0)
- `specs/feature/138-vertical-drama-scene-continuity-engine/spec.md` (v1.2.0)

## Why these two together

Both specs answer user-reported quality failures in the Vertical Drama
image→video pipeline, verified against code on 2026-07-23:

- **137 — the PERSON must stay the same person.** Faces drift/morph when a
  clip's motion reveals facial regions the start frame never showed.
- **138 — the PLACE must stay the same place.** Consecutive shots of one
  continuous scene render as different locations/times (lighting jumps
  sunset→midday, set geometry rearranges, wardrobe and props drift).

Their Phase 1s share: the same start-frame generation service, the same
episode router, the same shared contracts file, the same skill-authoring
discipline, and the same isolation posture (tenant flags default OFF ⇒
byte-identical behavior). Phase 2 of both (QC skill with request-gated field
groups, reference packs) is **out of scope here** and will be planned later.

## P1 deliverables

### A. From Feature 137 — flag `vdMotionContracts`

1. **Shot motion profile** (137 §7): optional categorical `motion_profile`
   object added to the per-shot video-prompt skill OUTPUT (start/end facing,
   turn magnitude, reveals_hidden_side, camera_motion, new_character_enters,
   identity_risk, risk_reasons). Zero new LLM calls — same call that already
   produces `frame_analysis`.
2. **Deterministic risk floor** (137 §7.2): new pure module
   `shared/verticalDramaSeries/motionProfile.ts` — `deriveMotionRiskFloor()`
   consumes only closed-enum facts and maxes with the skill's own
   `identity_risk`. No LLM judgment in TS.
3. **Storage** (137 §7.3): persisted per clip at
   `motionPromptPack.clips[].motionProfile` (+ `effectiveRisk`) via the
   existing persist path; old clips parse unchanged.
4. **Face-observability ride-along fields** (137 §8.1): optional per-person
   fields on the EXISTING `frame_analysis` contract (facing, eyes_visible,
   occlusion, face_size, overlapped_by_other_face, faces_separated) + the
   **request-gate widening** from `characterReferenceImages.length >= 2` to
   `>= 1` under the flag (injector gate as broad as the validator trigger).
5. **Motion contract in the video prompt** (137 §11.1): skill rules in
   `vertical-drama-shot-video-prompt` + its subshots twin + the bulk pack, so
   the prompt states the preserved facial angle and limits motion when
   observability is poor; `negative_motion_prompt` gains family-shaped
   anti-morph negatives; camera vocabulary must match the declared
   `camera_motion`; low-risk shots get NO extra restriction.
6. **Judge dimension** (137 §11.2): one added scored dimension in
   `vertical-drama-video-prompt-judge` — "motion contract honors frame
   observability". Same ≤4-call loop.
7. **Draft-time prevention** (137 §11.3): continuity guidance in the
   storyboard/deep-draft authoring skills (a back/profile→frontal reveal or a
   mid-shot entrance should be authored as TWO shots). Guidance, not a
   validator.

### B. From Feature 138 — flag `vdSceneContinuity`

8. **Scene Visual State lock** (138 §7): new skill
   `vertical-drama-scene-visual-state` authoring ONE state per effective
   scene per episode (lighting_state, fixed_elements, spatial_layout,
   staging_axis, wardrobe_in_scene, active_props, palette_mood,
   time_jump_suspected, coverage_gaps). Stored at
   `startFramePlan.sceneVisualStates[locationKey]`. Scene grouping already
   exists — reuse `resolveEffectiveShotLocationIdentity`.
9. **Lock injection** (138 §7.4): runner-injected compact CONSTRAINT block
   into both start-frame prompt engines, the 9-shot batch render-plan
   contract, and the video-prompt `shotContext`. Compact locks only — no
   scene-describing or emotion-directing prose (see "Prompt philosophy").
10. **Lighting-variety override clause** (138 §7.5): the batch render skill's
    "9 shots must show real lighting variety" rule gains a same-scene
    exception conditioned on the injected lock's presence (dormant when the
    flag is off). This rule is a verified AGGRAVATOR of the reported drift.
11. **Sequential neighbor anchoring** (138 §8): new pure module
    `shared/verticalDramaSeries/sceneContinuity.ts` selecting the nearest
    earlier same-scene APPROVED frame as a continuity reference; attached at
    prompt time (vision, cap 6→7 under flag) and at render time
    (`referenceImageUrls`, priority identity > location > scene-neighbor >
    product) and in regenerate-in-place. No cascades: re-approving an earlier
    shot never auto-regenerates later ones.
12. **Wardrobe + prop continuity** (138 §11): carried as lines inside the
    lock (QC verification is P2).
13. **Mutations + UI** (138 §14/§15): `planSceneVisualState`,
    `updateSceneVisualState`; scene chip + view/edit dialog on the storyboard
    scene group; "อ้างอิงภาพช็อต N" indicator on shot cards.

### C. Shared foundation

14. **Per-model image prompt budget** (137 §9.5): replace the flat
    `VD_IMAGE_PROMPT_MAX = 3800` assumption with
    `configJson.maxPromptLength ?? 3800`, clamped by a new absolute max of
    20000, using the shipped media-layer resolver idiom
    (`resolveModelMaxPromptLength`, `apps/web/server/routers/media.ts:656-691`).
    Needed so 138's lock does not fight the budget on the primary model.
    **Provider-scoped:** the 20k / 16-reference numbers bind ONLY to the
    kie.ai `gpt-image-2` row; Magnific (direct REST) and Higgsfield (MCP)
    keep existing defaults. Also record the operational trap: requesting
    2K/4K with `aspect_ratio` auto/unspecified FAILS the task.

## Prompt philosophy (standing user directive — applies to every prompt change)

**Lock, don't describe.** VD image prompts are the shot's story synopsis plus
ONLY the elements the pipeline must control (identity, safety, scene locks,
observability constraints). Emotional expression and visual imagination are
deliberately DELEGATED to the render model (primary: kie.ai `gpt-image-2`),
which composes emotion from the story better than over-directed prose and
improves automatically as models improve. The 20k budget headroom exists for
LOCKS, never for longer descriptions.

## Non-negotiable constraints

1. **Additive-only persistence. ZERO database migrations.** All new state
   lives in existing jsonb (`startFramePlan`, `motionPromptPack`) or as new
   VALUES in existing varchar columns. Lenient zod everywhere; absent field ⇒
   today's behavior.
2. **Both flags OFF ⇒ byte-identical behavior** — prompts, request text,
   attach lists, caps, provider payloads, credit estimates. Snapshot-tested.
3. **Skill-first.** Creative/judgment rules live in skill.md; TypeScript
   computes facts (grouping, ordering, enum mapping) and never hardcodes
   thresholds that replace LLM judgment.
4. **No silent capability activation.** Every new skill-output field must be
   REQUESTED by the runner contract and covered by a real-file loader test
   plus a real-LLM gate test (the "taught-not-wired" failure class has bitten
   this codebase repeatedly).
5. **No new paid generations in P1.** No auto-regeneration, no auto model
   switching, no cascade renders. Fail-closed guards (Image-N mapping,
   no-model guard, credits) are untouched.
6. **Dual-case skill files.** The loader reads lowercase `skill.md` before
   `SKILL.md`; edit the lowercase file and keep twins identical.
7. **Known-red suites.** `generateShotVideoPrompt` / split suites carry a
   pre-existing ~40-red baseline; verify by fail-set IDENTITY DIFF, never by
   raw pass counts.

## Verification expectations

- Pure modules (`motionProfile.ts`, `sceneContinuity.ts`) unit-tested
  exhaustively — they are where all deterministic logic lives.
- Flag-off snapshot tests proving byte-identical prompts/attach lists.
- Loader + real-LLM gate tests per new skill field group.
- Fail-set identity diff against the known-red baseline before/after.
- No credit-spend assertions on the new paths.

## Open questions for the interview

- Do we ship both flags in one PR/branch, or land 137-P1 first and 138-P1 on
  top (they share `verticalDramaStartFrameGeneration.ts` and the episode
  router)?
- Scene state generation: lazy-on-first-use (blocks one call) vs
  explicit-action-only vs both?
- Should the per-model budget change (item 14) land as its own small,
  independently verifiable change before the feature work?
- Which internal tenant/series is the measurement bed for the GA gates?
