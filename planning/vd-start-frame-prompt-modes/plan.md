# VD Start-Frame Image Prompt: Two Modes (Synopsis-Direct vs Cinematic Narrative)

Status: IN PROGRESS — 2026-07-22
Owner: naibarndotcom
Related: `planning/vd-video-prompt-model-family-quality/plan.md` (video side,
shipped 2026-07-22 — same skill-first + model-family-aware philosophy)

## Problem statement (user, 2026-07-22)

Start-frame images per shot are not natural enough and do not fully match
that shot's synopsis. Add a **per-sub-episode option** with TWO modes for how
the start-frame image prompt is produced, with an automatic default based on
the episode's selected IMAGE model family:

- **Mode 1 — synopsis_direct** (default when the image model is GPT-family):
  run the shot's synopsis through a skill whose job is to make it
  policy-safe (consensual/natural romance, no grabbing or forced contact,
  no sexualized wording, etc.) and use that output directly as the image
  prompt.
- **Mode 2 — cinematic_narrative** (default for every other image model): a
  new skill that receives the synopsis + all related character reference
  images + the location image and composes a story-first cinematic prompt
  (full spec supplied by the user: story meaning → one emotional beat → one
  decisive moment → natural performance → cinematic form → continuity →
  video-ready → safety rewrite → self-check).

Prompt length: user set the cap to **3800** (2026-07-22, second directive).
`VD_IMAGE_PROMPT_MAX` raised 3500 → 3800 in shared contracts (the single
source for the QC refiner, the UI counter, the textarea maxLength, and the
router's edit-prompt zod max). Every VD image skill that stated the shared
cap was updated to 3800 in both case twins: the two new mode skills plus
`vertical-drama-shot-start-frame-prompt`, `-start-frame-render`,
`-shot-image-action`, `-location-visual-bible`, `-character-visual-bible`.

**NO CODE-SIDE PROMPT APPENDING** (same directive): TypeScript must never
concatenate text onto a prompt after the skill returns it — any improvement
is a CONDITION INSIDE the skill. Audit found two existing violators on the
image path:
- `appendPresetVisualIdentityFragmentsToImagePrompt` /
  `mergePresetVisualIdentityNegativeFragments`
  (verticalDramaStartFrameGeneration.ts:943/957) — appends the series
  preset's look tokens as a comma tail at generation time. Its own doc
  comment records this as DEFERRED skill-first debt with 3 call sites
  (generateStartFrameImage, generateStartFrameAngleVariations,
  repairShotImage).
- `appendProductPresenceDirective` / `mergeProductLockNegativePrompt`
  (verticalDramaProductTieIn.ts:635) — appends the product-placement
  directive.
Both are now authored as CONDITIONAL SKILL SECTIONS instead: mode 2 §13
SERIES VISUAL IDENTITY + §14 PRODUCT TIE-IN, mode 1 §7 (combined). The
wiring must therefore pass those facts INTO the skill and SKIP the code
append for the two new modes (legacy paths keep their appends untouched, so
nothing double-appends).

## Decisions taken

1. **Two NEW skills, existing start-frame skill kept as-is.** The current
   `vertical-drama-shot-start-frame-prompt` remains the legacy/default
   engine for any path not covered by the mode switch (batch/reference-frame
   flows), so nothing that works today regresses. The mode switch selects
   between the two new skills for the per-shot start-frame prompt action.
   (Revisit after soak: if mode 2 clearly dominates, retire the legacy skill.)
2. **Both new skills MUST honor the REFERENCE MAPPING contract** — the
   validator (`VdReferenceMappingError`, fail-closed on the single-shot
   path) requires `REFERENCE MAPPING: Image 1 = X; Image 2 = Y; Image 3 =
   location: Z.` as the opening declaration, never restated, with the
   image-index clause kept separate from the position clause. Mode 1 is
   "synopsis as prompt" in spirit but still opens with this line + a compact
   identity lock; otherwise the image model swaps faces (known production
   incident) and the generation fails closed anyway.
3. **Same output contract as today** (`{prompt, negative_prompt}`) so the
   existing parser/validator/persistence works unchanged; mode 2 adds
   OPTIONAL extra fields (`analysis_summary`, `continuity_notes`,
   `video_readiness_notes`, `quality_score`, `quality_flags`) parsed
   leniently and persisted for display/audit only.
4. **Quality loop lives INSIDE the skill** for mode 2 (self-check + score +
   flags in one call), not as an external multi-call judge. Rationale: the
   image path already runs an image-QA pass downstream, and a 3-round
   external loop would triple cost on every "สร้าง prompt + ภาพ" click. The
   video-side judged loop stays the reference implementation if we later
   want an external judge here too.
5. **Default resolution is a fallback, not a lock.** The stored per-episode
   mode is `auto` by default; `auto` resolves at generation time from the
   episode's selected image model family (gpt → synopsis_direct, else →
   cinematic_narrative). An explicit user choice always wins and is
   remembered per sub-episode.

## Design

### D1. Shared image-model family resolver
New `apps/web/shared/verticalDramaSeries/imagePromptModelFamily.ts`
(mirrors the shipped `videoPromptModelFamily.ts`):
- `type ImagePromptModelFamily = "gpt" | "gemini" | "grok" | "flux" | "other"`
- `resolveImagePromptModelFamily({modelId, name, provider, configJson})` —
  gpt matches `gpt-image*`, `gpt-4o*image*`, `dall-e*`, or provider openai
  with an image-type model (registry today: `gpt-image-1.5-all`; DB rows may
  add `gpt-image-2`).
- `isGptImageFamily(family)` → the default-mode rule.
- `resolveDefaultImagePromptMode(family)` → `"synopsis_direct" | "cinematic_narrative"`.
Family is also passed to the skills as a fact (`target_model` in the spec).

### D2. Per-sub-episode mode setting
- Persist `imagePromptMode: "auto" | "synopsis_direct" | "cinematic_narrative"`
  on the episode (JSON field — no migration; exact container TBD from the
  flow map: episode settings JSON vs startFramePlan meta).
- tRPC mutation to set it (mirroring an existing per-episode setter such as
  `setEpisodeVideoPromptLanguage` / `setEpisodeModelSelection`).
- Client: a small segmented control / select on the sub-episode settings
  area, showing the resolved default when `auto` ("อัตโนมัติ — ตอนนี้ใช้:
  เรื่องย่อโดยตรง (โมเดล GPT)"). Copy keys in VD_COPY en+th.

### D3. Generation branch
In the start-frame prompt service: resolve mode (explicit → else family
default) → load the matching skill → build the mode's user prompt →
same parse/validate/persist path as today. Persist
`promptMode: { mode, resolvedFrom: "user" | "auto", imageModelFamily,
imageModelId, generatedAt }` on the frame (jsonb) so the UI can show which
engine wrote the prompt (same pattern as the video-side
`promptModelTarget` badge).
- Mode 1 attaches the same reference images as today (identity still matters).
- Mode 2 additionally REQUIRES the vision attachments (character portraits +
  location) — it is explicitly an image-grounded skill; when no vision model
  is available it degrades to text-only and records a warning (same
  precedent as the video path).

### D4. Cap + safety
- `ensurePromptWithinLimit({kind: "image"})` (3500) stays the enforcement
  point for both modes.
- `safety_adjustments` (mode 1) / `analysis_summary.safety_adjustments`
  (mode 2) persisted and surfaced so the user sees what was rewritten and
  why an image did not get refused.

## Affected files (provisional — confirm against the flow map)
- NEW `apps/web/shared/verticalDramaSeries/imagePromptModelFamily.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts` (frame metadata +
  episode setting types, additive)
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` (mode
  branch + two new skill loaders + lenient extra-field parse)
- `apps/web/server/routers/verticalDramaEpisodes.ts` (mode setter mutation +
  thread mode into the generate mutations + persist metadata)
- `apps/web/client/src/components/verticalDramaSeries/*` (mode control +
  engine badge + copy keys)
- SKILLS (DONE): `vertical-drama-shot-synopsis-image-prompt/`,
  `vertical-drama-cinematic-narrative-image-prompt/` (skill.md + SKILL.md
  twins, byte-identical)

## Risks
- REFERENCE MAPPING validator is fail-closed → a skill that forgets the
  mapping line breaks generation entirely. Mitigate with a real-file gate
  test asserting both skills declare the contract, plus a service test
  feeding a mapping-less LLM response and asserting the existing validator
  still catches it.
- Weak/cheap models returning sloppy JSON → parse leniently, extra fields
  optional, never block on them (memory: VD weak-model JSON class).
- Concurrent sessions editing `verticalDramaEpisodes.ts` → region-scoped
  additive edits only.
- Legacy frames without `promptMode` → badge hidden, no false claims.

## Verification
1. Real-file gate: both new skills' skill.md === SKILL.md and contain the
   REFERENCE MAPPING contract, the safety-rewrite table, the ≤3500 rule.
2. Service tests: mode resolution matrix (explicit vs auto × gpt vs
   non-gpt), correct skill loaded per mode, vision attached in mode 2,
   metadata persisted, cap QC applied, mapping validator still fail-closed.
3. Client test: mode control renders + persists; engine badge shows the
   mode that produced the prompt.
4. Manual: series 21 / ep 114 shot 3 — generate in both modes, compare
   against the shot synopsis and check faces/identity and policy safety.

## Confirmed insertion points (flow map, 2026-07-22)
- Mode storage: `startFramePlan.imagePromptMode` (jsonb, additive, NO migration)
  — sibling of `selectedImageModelId` (contracts.ts ~:468).
- Setter: new `setEpisodeImagePromptMode`, modeled on
  `setEpisodeVideoPromptLanguage` (verticalDramaEpisodes.ts ~:9586) — free,
  JSONB patch, materializes a minimal plan when absent.
- Mode branch: `generateStartFrameShotPrompt`
  (verticalDramaStartFrameGeneration.ts ~:1349) between model resolution and
  system/user-prompt build; `buildStartFrameShotPromptUserPrompt` (~:1156)
  stays the single fact-block builder (conditional lines, null-filtered).
- **KEY GAP THE FEATURE FIXES**: character portraits and the location image
  are NOT attached as vision at prompt time today — only as text facts. Mode
  2 attaches them via `buildStartFrameShotPromptVisionImages` (~:1335), in
  `character_reference_manifest` index order with matching labels, capped at
  6 images total.
- Reference-mapping validator is FAIL-CLOSED on this path (validate → 1
  corrective retry → throw). Both modes must satisfy it; `Image N =
  location:` is ignored by design. `referenceFrameMode: true`
  (generateShotReferenceFramePrompt) always keeps the LEGACY skill.
- Cap: `ensurePromptWithinLimit({kind:"image"})` unchanged — now 3800.

## Gap sweep (2026-07-22, user asked to close every recorded gap)

**G1 — batch plan regen wipes per-frame user state (PRE-EXISTING BUG, found
while closing the "stamps are dropped" note).** `projectStartFramePlan`
(verticalDramaStartFrameGeneration.ts ~:307-340) builds `frames[]` from
scratch, and the pipeline persists it wholesale
(`verticalDramaEpisodePipeline.ts:3771` `.set({ startFramePlan: generated.plan })`).
So re-running the `start_frame_render_plan` stage silently drops, per frame:
`approvedMediaAssetId` (the link to the APPROVED rendered image — the
expensive one), `locationKey` (per-shot location override), `angleGrid` /
`angleGridAssetIds`, and `productReferenceAssetIds` + `productRefsCustomized`.
That last one also silently breaks the pipeline's OWN documented contract at
:3680-3690 ("auto-resolution must never overwrite that choice on a plan
regen") — it reads `frame.productRefsCustomized` off a freshly-projected
frame where the flag can never be set. Evidence this is a bug, not a design
choice: the sibling per-shot path deliberately preserves
`approvedMediaAssetId` when it rewrites a prompt (verticalDramaEpisodes.ts
~:12787-12793). FIX: carry prior per-frame state over by shotNumber during
projection; `imagePrompt`/`negativePrompt` are still replaced (that is the
point of regenerating), and `promptMode` is still dropped (correct — the new
prompt came from the legacy batch skill, so the engine badge and the
append-skip must both revert).

**G2 — `promptMode` stamp dropped on batch regen: CLOSED, correct by
design.** The batch replaces the prompt with legacy-skill output, so the
stamp must go: badge hides, and the render-time preset append correctly
resumes for that frame. No change needed beyond G1's explicit exclusion.

**G3 — SFX text double-appended (PRE-EXISTING BUG).** With native audio on,
the per-shot generator folds ` SFX cues: <audio_direction>` into the
PERSISTED `clip.prompt` (verticalDramaVideoMotionPromptGeneration.ts
~:2175-2178) while ALSO returning `audioDirection` separately; the render
formatter then appends `clip.audioDirection` again
(verticalDramaVideoPromptFormatter.ts:412-414), whose own doc comment claims
to be "the ONLY place `audioDirection` is folded into the actual
provider-submitted prompt text". Result: the SFX direction appears twice in
the submitted prompt. This also violates the user's no-code-side-appending
rule. FIX: delete the generation-time concat (keep returning
`audioDirection`); the formatter stays the single fold point and already has
the cap guard that trims that tail first. Update the item-E tests to assert
the persisted prompt never carries the tail.

## Progress
- [x] Skills authored (conductor) — both, twins synced, incl. §SERIES VISUAL
      IDENTITY + §PRODUCT TIE-IN conditions replacing code-side appends
- [x] Cap raised to 3800 (contracts + all VD image skills, twins synced)
- [x] Flow map (Explore agent)
- [x] Server (ssp-backend): `imagePromptModelFamily.ts` + barrel export,
      contracts (plan-level mode + frame-level promptMode/safetyAdjustments/
      promptAnalysis), two cached skill loaders + dispatcher
      (referenceFrameMode always legacy), lenient extras schema
      (`z.array(z.unknown())` so one bad element can't sink a field),
      mode-2 vision attach (4 portraits / 6 images cap, labels = manifest
      indices), fact lines (TARGET IMAGE MODEL always; SERIES VISUAL
      IDENTITY / PRODUCT TIE-IN / frame_analysis_inputs new-modes-only),
      `setEpisodeImagePromptMode` mutation, router mode resolution
      (try/catch → "other" → cinematic_narrative), stamp persisted in the
      row-locked txn, render-time preset append gated on `!frame.promptMode`.
- [x] Client (ssp-frontend): mode select in the per-episode settings header
      (shows what `auto` resolves to), engine badge on the image-prompt card,
      7 key-synced en/th copy entries, 6/6 new tests.
- [x] Verification (conductor): 207 tests green — 72 new image-mode, 72
      pre-existing start-frame regression, 63 client + video-side; append
      gating read and confirmed in source; tsc error set unchanged.
- [x] `npm run build:deploy` — atomic swap done, FRONTEND LIVE.
- [ ] `sudo systemctl restart smartspec-web.service` — REQUIRED for the
      server-side half (mode branch, vision attach, mutation, persistence).
      Conductor cannot run it (permission classifier); user runs it. This
      one restart also activates the video-prompt work from the earlier
      session block.
- [x] Memory updated (project_vd_start_frame_prompt_modes.md +
      feedback_skill_first_authoring no-code-append rule)
- [x] Gap sweep complete (2026-07-22): G1 batch-regen state loss FIXED
      (projectStartFramePlan merges prior per-frame state by shot number),
      G2 closed as correct-by-design, G3/G4 SFX double-append FIXED (skill
      owns the sound clause; formatter no longer appends audioDirection and
      its cap guard now rolls back its OWN tiers LIFO), judge fact sheet
      solo-shot false flag FIXED, speaker-switch matrix 9→15 tests, dead
      import removed, 40 pre-existing router-test failures repaired (53/53).
- [x] Verified 405 tests green (service 265 + router/shared 116 + client 24)
      and committed as c38fb4498 (67 files).
- [ ] `git push origin main` — commit exists locally; push was blocked by the
      permission classifier, user must run it.
