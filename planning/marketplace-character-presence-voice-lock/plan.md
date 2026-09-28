# Marketplace Auto Review — Character Presence Option + Video Voice Consistency Lock

Date: 2026-07-18
Status: Approved by user ("ทำให้เลย ให้เห็น option ตัวเลือกชัดเจน") — Opus agents implement

## Requirements (from user)

1. **Character presence option (opt-in, clearly visible):** when the user attaches
   a character/person reference image, they can choose to FORCE the generated 3x3
   storyboard to include that person in every frame. Implemented as a select with
   two intensity levels (per approved solution):
   - `auto` (default) — current behavior, byte-identical
   - `every_frame` — "มีคนทุกเฟรม (9/9)"
   - `most_frames` — "มีคนเกือบทุกเฟรม (อย่างน้อย 7/9, ยอมให้เฟรม close-up สินค้าไม่มีคน)"
2. **Video voice consistency:** video prompts must direct ONE consistent narrator
   voice (same voice/tone/pacing) across every clip used in the storyboard video.
   Applied automatically when `audioStrategy = native_video_audio` (that is when
   per-clip generated audio causes voice drift); "ตาม solution ที่เหมาะสม".

## Ground rules (same as sibling plans)

- Option absent/`auto` ⇒ storyboard prompts BYTE-IDENTICAL (tests required).
- Never block: QA/repair extensions degrade to warnings, never fail the run.
- Wire BOTH mutations AND BOTH UIs (legacy form + AutoStoryboardAdvancedOverrides)
  — lesson from motionDirection/creativeBrief (see
  planning/marketplace-video-motion-direction/plan.md).
- Skill-first: creative rules live in skill.md (lowercase canonical + byte-identical
  SKILL.md twin); TS passes facts; validators fail-closed.
- Anti-taught-not-wired: tests assert on the actually-submitted prompt.

## Existing infrastructure (verified 2026-07-18)

- Character upload: `autoReviewCharacterMode === "uploaded_reference"` +
  `characterAnchorUrl` → `reference_character_images` reach the
  product-reference-storyboard skill ("identity anchors", @Image2 convention,
  skill.md:151).
- Identity rules: "CHARACTER FACE AND 95 PERCENT IDENTITY LOCK" (skill.md:147-155);
  face-visibility rule discourages hidden-face frames (:155); Frame 8 is
  product-critical (:183) — presence rules must define precedence: on
  product-critical frames BOTH person AND readable product must appear.
- Child safety: skill.md:151 forbids binding uploaded presenter to a child;
  publish-safety blockers already gate storyboard-review selection
  (marketplaceAutoReviewService.ts:17050-17061). `every_frame` must not weaken any
  of this.
- QA loop: vision QA produces reasonCodes incl. `character_reference_mismatch`
  (characterConsistencySafe, marketplaceAutoReviewService.ts:1766) + repair
  attempts bounded by repair budget (`repair_budget_exhausted_*` seen in UI).
- Plumbing pattern to mirror EXACTLY: `motionDirection` (both mutations,
  HyperframesAutoPlanOverrideInputSchema is `.strict()`, RunMetadata persist,
  "USER-SELECTED … LOCK" directive into `buildRuntimeInput`, advanced-overrides
  panel auto-registers fields via `keyof HyperframesAutoPlanOverrideInput`).
- Video prompts: deterministic `buildMarketplaceAutoReviewSubmittedVideoPrompt` +
  seam `resolveMarketplaceAutoReviewVideoUnitPrompt` (skill path via
  product-video-motion-prompt when motionDirection present).
- Audio strategy value: `native_video_audio` (see audio-strategy prompt lines
  ~:13453-13461); spoken language lives in plan/overrides (ภาษาพูด).

## Design

### Feature A — `characterPresenceMode`

Contract (frozen): `characterPresenceMode: z.enum(["auto","every_frame","most_frames"]).optional()`
top-level on `startAutoReview` + in `HyperframesAutoPlanOverrideInputSchema`
(+normalize+defaults, `.strict()`), → RunMetadata. `auto`/absent ⇒ byte-identical.

Injection layers when `every_frame`/`most_frames` AND character references exist:
1. **Planner directive** in `buildRuntimeInput`:
   "USER-SELECTED CHARACTER PRESENCE LOCK:" — every shot's storyboardGuide/visual
   must include the referenced presenter visibly (identity-preserving, not
   hands-only); for `most_frames`, allow up to 2 product-only close-up shots;
   additional-not-replacement of product truth + minor-safety rules.
2. **Storyboard skill input**: pass `character_presence_mode` in the skill user
   inputs; add a gated rule section to
   apps/web/skills/product-reference-storyboard/skill.md (+ byte-identical
   SKILL.md): when `character_presence_mode=every_frame`, Frames 1-9 each include
   the referenced person with the identity lock; precedence: product-critical
   frames (e.g. Frame 8) show BOTH person and fully readable product — if both
   cannot fit, product readability wins on that frame and the person appears
   partially (shoulder/hand+face in frame edge) rather than being dropped;
   `most_frames` = at least 7 of 9 frames with the person, close-up product
   frames may omit; when the field is absent the section does not apply.
   Child-reference guard: rules at :151 stay controlling.
3. **QA + repair (fail-open)**: extend the vision-QA expectation text (where
   characterConsistencySafe/`character_reference_mismatch` is produced, ~:1766 —
   agent must locate the QA prompt builder) with a presence expectation when the
   mode is active; map a missing-presence finding to reasonCode
   `character_presence_missing` + a targeted repair instruction naming the frames
   that lack the person. Missing presence NEVER hard-fails: after repair budget,
   surface as warning. QA extension must not change behavior when mode is auto.

UI (BOTH places, clearly visible):
- Legacy form (MarketplaceCaptureProductDetail character section, near the
  uploaded-reference controls): a labeled select "การปรากฏของบุคคลในภาพ 3x3"
  with options: "อัตโนมัติ (ค่าเริ่มต้น)" / "มีคนทุกเฟรม (9/9)" /
  "มีคนเกือบทุกเฟรม (อย่างน้อย 7/9)". Helper caption explaining it applies when a
  character image is attached.
- AutoStoryboardAdvancedOverrides panel: same select, registered like other
  override fields (labels map + field markup + changed-fields summary).

### Feature B — Voice consistency lock (video prompts)

When run `audioStrategy === "native_video_audio"`:
- Deterministic voice profile built in TS from existing facts ONLY (no new LLM
  call): spoken language + presenter gender/age hints from characterBrief/preset
  when available, else neutral. Example: "one single consistent adult Thai female
  narrator voice" / fallback "one single consistent narrator voice".
- `buildMarketplaceAutoReviewSubmittedVideoPrompt`: append a compact
  "VOICE CONSISTENCY LOCK: every clip uses the same single narrator voice —
  <profile> — identical voice, timbre, tone, pacing, and language in every clip;
  never switch narrator between clips." line for native_video_audio runs.
- product-video-motion-prompt skill: add input fact `voice_profile` (optional) +
  skill.md rule (gated on presence) requiring the written prompt to state the
  same-narrator-voice continuity; absent ⇒ section does not apply.
- Other audio strategies (separate TTS / silent) unchanged — TTS already has a
  single voice; silent must not mention voice at all.
- This changes native-audio video prompts for all runs BY DESIGN (user request) —
  keep the line compact; add tests asserting presence for native_video_audio and
  absence for tts/silent.

## Implementation split

- **Backend agent (Opus, ssp-backend)**: Feature A backend (schema/router/
  normalize/metadata/planner directive/skill inputs/skill.md rules/QA+repair) +
  Feature B (voice profile + deterministic lock + skill input/rule) + tests.
- **Frontend agent (Opus, ssp-frontend)**: both UI surfaces for
  characterPresenceMode + component tests. (No UI for Feature B — automatic.)

## Verification (conductor)

1. All new + regression suites green (motionDirection/creativeBrief/seam suites).
2. pnpm check — no new errors.
3. Deploy: build:deploy + restart web.

## Progress

- [x] Backend A+B + tests — `characterPresenceMode` enum wired through router
  (startAutoReview) → autoPlan overrides/defaults/normalize (`.strict()`) →
  runtime service → startMarketplaceAutoReviewRun + RunMetadata persist →
  planner directive (`USER-SELECTED CHARACTER PRESENCE LOCK:`, gated on
  every_frame|most_frames AND a real character reference) → storyboard skill
  input (`character_presence_mode`, gated) + skill.md rule section (twins
  byte-identical) → fail-open grid vision-QA (`character_presence_missing`
  reasonCode + frame-naming repair instruction, reuses existing repair budget →
  warning). Feature B: deterministic voice descriptor + `VOICE CONSISTENCY LOCK`
  appended to submitted video prompt ONLY for native_video_audio (skill +
  deterministic paths) + optional `voice_profile` fact into
  product-video-motion-prompt skill (facts + user prompt + skill.md rule, twins
  byte-identical). New suites green (marketplaceAutoReviewCharacterPresenceVoice,
  marketplaceCapture.characterPresence); regressions green (motionDirection,
  creativeBrief, videoMotionPromptSeam, marketplaceCapture.motionDirection,
  autoPlan). The 3 `prompt_too_long_for_image_provider` failures in
  marketplaceAutoReviewService.test.ts are PRE-EXISTING on committed HEAD
  (verified via a detached worktree) — unrelated to this change.
- [x] Frontend A (both UIs) + tests — legacy run-start form (MarketplaceCaptureProductDetail,
  uploaded_reference block: labeled select + muted caption; state
  `autoReviewCharacterPresenceMode` default "auto"; payload
  `characterPresenceMode` sent only when != "auto") + AutoStoryboardAdvancedOverrides
  panel (labels/fieldLabels/options/select, base-default "auto" prunes to omitted) +
  3 new component tests (default auto / select every_frame / reset→{}). Component
  suite green (19/19). The 4 remaining `characterPresenceMode` typecheck errors are
  expected and clear once the backend agent adds the shared schema + router key.
- [x] Conductor verification + deploy — 72/72 tests green across 8 suites (new presence/voice + all regression), skill twins cmp-identical, pnpm check 140 baseline (frontend temp errors cleared), build:deploy + restart 2026-07-18, service active web 200
