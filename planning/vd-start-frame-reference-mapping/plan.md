# VD Start-Frame Reference-Mapping Fix (2026-07-16)

## Problem statement

User report (series 16, episode 66, shot 9): the start-frame image prompt
contains a **direct self-contradiction** in character↔reference-image mapping:

- Prose (skill-authored): `ภาคิน (Image 1, leftmost...)`, `ไอริณ (Image 2, rightmost...)`
- Appended tail block (code-authored): `[Attached character reference images: Image 1 = ไอริณ; Image 2 = ภาคิน. ...]`

Contradictory mapping instructions can make the diffusion model swap faces,
swap wardrobe, or blend identities. Additional prompt-quality issues reported:
still-image prompts using video language ("expression shifting from X to Y",
"as he delivers the warning"), `visible shoes` locked in a medium two-shot,
`precisely` repeated excessively, abstract atmosphere, no story-driven
wardrobe-override mechanism, and the user mandate that prompt authoring be
**skill-first** (no prompt text appended outside the skill).

## Root causes (verified in code, not guessed)

### RC1 — Per-shot manifest ordering is DB-arbitrary (critical, deterministic)

`generateShotStartFramePrompt` (router `verticalDramaEpisodes.ts` ~11329)
builds the skill's `character_reference_manifest` (index=1,2,…) directly from
`resolveShotCharacterReferenceEntries` output order. That function's query has
**no ORDER BY** — its own sibling caller
`resolveShotVideoPromptCharacterReferenceImages` documents this at ~1752-1754
("that function's own return order is NOT reliably `characterKeysInOrder` …
so this re-sorts to match") and re-sorts; the start-frame prompt path does
NOT re-sort. The paid render (`generateStartFrameImage`) attaches reference
images via a DIFFERENT resolver, `resolveRequiredShotCharacterAttachmentManifest`
(~1522), which explicitly restores `frame.requiredCharacterRefs` order.
When Postgres returns rows in a different order than `requiredCharacterRefs`,
the skill is TOLD the wrong indices → prose mapping is wrong relative to the
actual attachment. The comment at ~11322-11328 claiming the orders match is
**false**.

### RC2 — Dual authorship of identity lock (skill-first violation)

Uncommitted change (file mtime 2026-07-13) re-added
`formatIdentityLockedImagePrompt` to `@shared/verticalDramaSeries/characterIdentityMap.ts`
and calls it on every paid render (router ~9461, angle-grid ~9946), appending
a code-authored bracket mapping block in attachment order on top of skill
prose that already carries its own mapping (skill.md rule 7 explicitly says
"nothing else in the pipeline appends this for you"). When RC1/RC3 make the
prose mapping differ, the two mappings contradict inside one prompt. The
QC-processed prompt (bracket included) is persisted back onto
`frame.imagePrompt` (~9483), so the contradiction becomes visible/stored state.
HEAD (commit 789c14d08, skill-first architecture) had removed this append.

### RC3 — No Reference Mapping Validation; index-vs-position conflation

Batch path ordering is consistent by construction (`storyboardShots[].characterIds`
is both the prose-listed order and the persisted `requiredCharacterRefs`), but
the LLM can still misindex: skill rule 6 ("first speaker leftmost") and rule 7
("index = input list order") interact — the model tends to give the LEFTMOST
character Image 1 when the first speaker is not the first-listed character
(exactly the observed shot: speaking_order puts ภาคิน first/leftmost while the
attachment list is [ไอริณ, ภาคิน]). Nothing validates the authored prompt's
"Image N ↔ name" claims against the manifest before persisting or rendering.

### RC4 — skill.md guidance gaps

No rules for: single canonical mapping declaration; still-image emotion
phrasing; story-driven wardrobe override; frame-visible lock scope; exact
person count; concretizing atmosphere; repetition discipline.

## Fix design

Ordering truth = `frame.requiredCharacterRefs` order, everywhere.
Skill authors ALL prompt text; code validates (deterministically) and never
appends.

### Phase 1 — Deterministic ordering (RC1)

- In `generateShotStartFramePrompt`, re-sort `resolveShotCharacterReferenceEntries`
  output to `frame.requiredCharacterRefs` order, first-entry-per-characterKey
  (portraits-first guarantee already held), before building
  `characterReferenceManifest`. Reuse/extract the ordering loop from
  `resolveShotVideoPromptCharacterReferenceImages` (shared helper).
- Fix the false comment (~11322-11328).
- Audit other manifest builders: soften (~9396), angle grid (~9873), repair
  (~10300) — these already derive from `requiredCharacterRefs`-ordered
  sources; confirm and leave as-is.

### Phase 2 — Shared Reference Mapping Validator (RC3, user-requested)

New pure function in `@shared/verticalDramaSeries/characterIdentityMap.ts`:
`findCharacterImageIndexMappingMismatches(prompt, references: {imageIndex, characterName}[])`
— conservative claim extraction: `Image N = <name>`, `<name> (Image N`,
`<name> (attached Image N`, `(Image N, … <name>` adjacency. A mismatch is an
EXPLICIT claim binding a known reference name to the wrong index (or an index
to the wrong name). Missing/implicit mentions are NOT mismatches (lenient —
no false-positive blocking). Match longer names first (substring safety).

Authoring-time enforcement:
- `generateStartFrameShotPrompt` (per-shot): validate result against the
  manifest passed to the skill; on mismatch retry ONCE with a deterministic
  corrective instruction stating the required mapping and detected
  contradiction; still mismatched → typed error → router surfaces a clear
  Thai message (fail-closed; prompt with a wrong mapping is never persisted).
- `generateStartFrameRenderPlan` (batch, 9 shots): validate each frame using
  index = position in that shot's `characterIds` + names from
  `params.characters`; on any mismatch retry the call once listing offending
  shots; after retry accept but surface warnings via the same non-blocking
  channel as `findMissingCharacterIdentityWarnings` (don't fail a whole
  9-shot plan for one shot's phrasing).

### Phase 3 — Skill-first render path (RC2)

- Remove `formatIdentityLockedImagePrompt` (function + interface + call sites
  ~9263/~9461/~9781/~9946 + `assertRequiredIdentityBlockFits`) — restore
  HEAD's skill-first contract. KEEP `stripExistingIdentityLockSuffix`
  (legacy stored prompts).
- Render-time guard (replaces the append): run the validator against
  `keptCharEntries` (attachment order); an EXPLICIT contradiction →
  `PRECONDITION_FAILED` with Thai message telling the user to regenerate the
  shot's prompt (fail-closed, same convention as the model-selection guard).
  Legacy prompts without explicit claims proceed unchanged.
- Update/remove tests added for the append; keep stripper tests.

### Phase 4 — skill.md upgrades (RC4)

Both `vertical-drama-shot-start-frame-render/skill.md` and
`vertical-drama-shot-start-frame-prompt/skill.md` (edit lowercase files —
loader reads lowercase; copy over uppercase twins to prevent drift):

1. **Single REFERENCE MAPPING declaration** — state the canonical
   `Image N = name / Image K = location` mapping ONCE near the start of the
   prompt; every later mention must reuse those exact numbers; NEVER restate
   a different mapping anywhere (root of the user's observed bug).
2. **Index ≠ screen position** — reference index (attachment order) and
   left/right placement (speaking_order) are independent; write them as
   separate clauses ("ภาคิน, referenced from Image 2, stands on the left"),
   never "Image 1, leftmost".
3. **Still-image emotion** — dominant instantaneous emotion + secondary
   residue in physical detail; BAN "shifting from X to Y" / narrated actions;
   mid-speech = "captured mid-warning, lips slightly parted".
4. **Story-driven wardrobe override** — evaluate canonical shot summary /
   episode context FIRST; default = strict wardrobe lock to reference; when
   the story requires different attire, keep face/hair locked and explicitly
   describe the story-required outfit as an intentional override of the
   reference wardrobe.
5. **Frame-visible lock scope** — "preserve all visible wardrobe and
   accessories within the frame" (no shoe-lock in waist-up shots).
6. **Exact person count** — "Exactly N people in the frame" + negative-prompt
   reinforcement (no extra people/reflections/duplicated bodies).
7. **Concrete atmosphere** — translate mood into visible cues (distance,
   posture, grip, shadows, negative space).
8. **Repetition discipline** — identity-lock attribute list once per
   character, woven into prose; no "precisely" spam.
9. **All speakers in frame** — everyone in `speaking_order` must be visibly
   in frame with readable faces and meeting eyelines (reinforces existing
   rules 1/6).

### Phase 5 — Grok Imagine + backup-angle reference frames (RESEARCHED 2026-07-16)

Research findings (sources: docs.x.ai video-generation / reference-to-video,
fal.ai hosted schemas, Morphic/Videoconia/WaveSpeed guides):

- Grok has TWO mutually exclusive video modes: **image-to-video** (exactly ONE
  start frame, becomes frame 1; `grok-imagine-video-1.5`, up to 1080p, native
  lip-synced audio) and **reference-to-video** (1–7 reference images via
  `@Image1..@ImageN`, but only on the OLDER `grok-imagine-video` model, max
  10s/720p, no exact-first-frame lock). Sending `image` + `reference_images`
  in one request returns **HTTP 400** — they cannot be combined.
- ⇒ The originally-envisioned feature "attach backup same-scene stills as
  extra references when generating video from a start frame" is an API-level
  dead end on the Grok path. **On Grok, the single start frame carries 100%
  of identity** — which makes THIS plan's mapping/identity fixes the
  highest-leverage change for video quality too.
- Where alternate-angle stills DO pay off (scoped follow-up feature):
  (a) as inputs to the start-frame IMAGE composition step (multi-image edit
  accepts up to 3 source images); (b) as a model-capability-flagged feature
  for video models that DO accept start frame + refs together (Kling
  multi-elements, Vidu reference-to-video); (c) as reshoot/repair assets —
  regenerate a drifted shot's start frame from a stored alternate angle.
  The existing `generateStartFrameAngleVariations` 3x3 grid is the natural
  asset source for (c).
- Grok video prompting best practices to fold into the video-prompt skill
  (separate follow-up, `vertical-drama-shot-video-prompt` skill): one camera
  move per clip; quoted dialogue after an `AUDIO:` delimiter; identify the
  speaker by screen position + appearance ("the man on the right in the grey
  suit says: …" — synergizes with the speaking-order left-to-right rule);
  5–8s sweet spot (current ~6s is ideal); NO negative prompts (unsupported —
  convert to positive phrasing); render start frames natively 9:16 (explicit
  mismatched aspect_ratio stretches the frame).

## Affected files

- `apps/web/server/routers/verticalDramaEpisodes.ts` (manifest ordering,
  remove appends, render-time guard)
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
  (authoring-time validation + retry)
- `apps/web/shared/verticalDramaSeries/characterIdentityMap.ts` (remove
  formatIdentityLockedImagePrompt, add validator)
- `apps/web/shared/verticalDramaSeries/characterIdentityMap.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.characterRefV2.test.ts`
- `apps/web/skills/vertical-drama-shot-start-frame-render/skill.md` (+ SKILL.md)
- `apps/web/skills/vertical-drama-shot-start-frame-prompt/skill.md` (+ SKILL.md)

## Risk assessment

- Removing the render-time append restores HEAD behavior; identity-lock text
  is guaranteed by skill rules + authoring-time validation, so no protection
  regression for newly authored prompts. Legacy prompts: stripper still
  removes stale brackets; prompts with explicit wrong claims now fail-closed
  with a clear message instead of rendering with contradictions (better than
  silent identity swaps).
- Validator is lenient by design — only explicit contradictions block.
- Batch retry adds at most one extra LLM call per batch, only on mismatch.
- Prod serves from this checkout; server file changes require web restart —
  do at the end, after tests, per deploy protocol.

## Verification

- Unit tests for validator (correct/contradictory/implicit/Thai names).
- Per-shot manifest ordering test (requiredCharacterRefs order preserved even
  when DB rows return reversed).
- Existing suites for the touched routers/services pass.
- `pnpm check` no new type errors; restart web; smoke: regenerate shot prompt
  and render on a 2-character shot.

## Status

- [x] Investigation complete (this file)
- [x] Phase 1 — ordering
- [x] Phase 2 — validator + authoring-time enforcement
- [x] Phase 3 — remove render-time append + render-time fail-closed guard
- [x] Phase 4 — skill.md upgrades (both skills, lowercase edited + SKILL.md twins synced; REFERENCE MAPPING declaration, index≠position, still-image emotion, wardrobe override, visible-wardrobe scope, exact person count, concrete atmosphere, repetition discipline, examples updated)
- [x] Verification + deploy (2026-07-16 01:22: targeted suites 49+133 tests pass; broad-run failures confirmed pre-existing from other in-flight work — getEpisodeDetail/DNA-schema areas untouched by this diff; web restarted, skill prompts disk-loaded fresh) (unit tests green, `pnpm check` shows zero NEW
      errors — see backend-agent note below; full smoke test + web restart
      still pending, deliberately deferred per deploy protocol)
- [x] Phase 5 — research complete (see findings above)
- Phase 5 implementation (2026-07-16, this session):
  - [x] 5a — video prompt skills Grok alignment (shot-video-prompt: one camera
    move per clip, speech cue before every quote, name+screen-position speaker
    anchoring, critical constraints never negative-prompt-only; subshots:
    speaker anchoring + positive-constraint rules; motion-pack: new "Single
    camera move + speaker anchoring per clip" section; SKILL.md twins synced)
  - [x] 5b — `generateVideoClip` reference-slot accounting fix (VERIFIED
    off-by-one: router budgets `maxReferenceImages` for EXTRAS with start
    frame "always kept" separately at ~10758-10795, but the service-side cap
    `resolveReferenceImageUrlsForModel`/`getReferenceImageLimitFromConfig`
    slices the COMBINED array (start frame included) to the same number →
    the last kept ref (usually location) is silently dropped and
    `trimmedReferenceCount` under-reports; extras budget must be
    `max - (startFrame ? 1 : 0)`) — DONE 2026-07-16
  - [x] 5c — auto-attach required-character primary portraits at video
    generation for multi-image models only (`maxReferenceImages > 1`), fill
    remaining slots after speaker-switch portraits + manual shot refs,
    before location; dedupe by asset id; Grok (max=1) byte-identical —
    DONE 2026-07-16
  - [x] 5d (server side) — persist angle-grid assets per shot
    (`startFramePlan.frames[].angleGridAssetIds`, cap 5) +
    `recordShotAngleGridAsset` mutation + `getEpisodeDetail` resolved-URL
    exposure — DONE 2026-07-16. Client re-open in AngleVariationPicker is a
    SEPARATE follow-up task (not done in this session — see "Client work
    still needed" below).
  - [x] 5d (client side) — persist-on-completion + reopen stored grids —
    DONE 2026-07-16 (see "Frontend agent implementation notes" below).
  - [x] Phase 5 verified + deployed 2026-07-16 03:51 (+07): key suites re-run
    by conductor (121 pass; the 44 failures in
    shotReferencesAndQualityReview are the pre-existing other-session set,
    count unchanged vs baseline), `npm run build:deploy` (client changed),
    web restarted, skill registry synced the 3 updated video-prompt skills
    (hash change detected), https://smartaihub.app → 200.

### Backend agent implementation notes (2026-07-16, Phases 1-3)

**New symbols introduced:**

- `apps/web/shared/verticalDramaSeries/characterIdentityMap.ts`
  - `findCharacterImageIndexMappingMismatches(prompt, references)` — the
    shared Phase 2 validator (exported, pure).
  - `CharacterImageIndexMappingMismatch`, `CharacterImageIndexMappingReference`
    — supporting types (exported).
  - `findKnownNameOccurrences` / `extractExplicitMappingClaims` — private
    helpers (longest-name-first, non-overlapping name matching, no `\b`
    usage anywhere — Thai text has no reliable regex word boundary).
  - REMOVED: `formatIdentityLockedImagePrompt`, `CharacterIdentityLockReference`
    (the 2026-07-13 uncommitted RC2 regression). `stripExistingIdentityLockSuffix`
    untouched.
- `apps/web/server/routers/verticalDramaEpisodes.ts`
  - `reorderShotCharacterRefEntriesByKeyOrder(entries, keysInOrder)` — new
    private helper, extracted from `resolveShotVideoPromptCharacterReferenceImages`'s
    own inline re-sort; now also used by `generateShotStartFramePrompt`'s
    manifest builder (the RC1 fix).
  - REMOVED: `assertRequiredIdentityBlockFits`, and all
    `formatIdentityLockedImagePrompt` call sites (both `generateStartFrameImage`
    and `generateStartFrameAngleVariations`, softenLevel-0 AND final-QC
    branches).
  - ADDED: render-time fail-closed `referenceMappingMismatches` /
    `angleReferenceMappingMismatches` guards in both mutations, running
    BEFORE credit reservation, using `findCharacterImageIndexMappingMismatches`
    against the stripped stored prompt.
  - `generateShotStartFramePrompt`'s catch block now maps the service's
    `VdReferenceMappingError` to `PRECONDITION_FAILED`.
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
  - `VdReferenceMappingError` — new typed error class (same style as
    `VdSchemaValidationError`).
  - `VdReferenceMappingWarning` — exported interface (batch path).
  - `buildReferenceMappingCorrectiveInstruction` (single-shot),
    `buildBatchReferenceMappingCorrectiveInstruction` (batch),
    `formatReferenceMappingLine`, `formatMappingMismatchSummary`,
    `buildBatchReferenceMappingReferences`, `findBatchReferenceMappingIssues`
    — private helpers.
  - `generateStartFrameShotPrompt`: validates after the child-safety check;
    on mismatch does ONE corrective retry (billed separately, same
    convention as `verticalDramaStoryBible.ts`'s deep-draft-chunk
    missing-episode retry); still-mismatched throws `VdReferenceMappingError`.
  - `generateStartFrameRenderPlan`: validates every shot after the initial
    credit deduction; on any mismatch does ONE corrective retry of the WHOLE
    batch (billed separately); still-mismatched shots are returned as
    `referenceMappingWarnings` (non-blocking) instead of failing the batch.
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
  - `generateRealStartFramePlan`'s return type gained
    `referenceMappingWarnings?: VdReferenceMappingWarning[]` (spread-through,
    no logic change needed at that call site).
  - `runStage`'s `start_frame_render_plan` branch now also pushes
    `VD_START_FRAME_REFERENCE_MAPPING_MISMATCH` warnings into the existing
    `stageQcWarnings` channel (same convention as
    `VD_START_FRAME_CHARACTER_IDENTITY_MISSING`).

**Tests:**

- `characterIdentityMap.test.ts`: removed `formatIdentityLockedImagePrompt`
  describe block; added 11 new tests for the validator (correct mapping,
  swapped mapping, Thai names, tail-style claims, "(Image N, leftmost"
  claims, Latin case-insensitivity, implicit prose, location-claim
  exclusion, substring-safety, empty-input edge cases, unknown-name
  exclusion).
- `verticalDramaEpisodes.generateShotStartFramePrompt.test.ts`: added an RC1
  ordering regression test (DB returns character rows in the OPPOSITE order
  from `requiredCharacterRefs`; asserts the manifest still follows
  `requiredCharacterRefs` order) and a `VdReferenceMappingError` ->
  `PRECONDITION_FAILED` mapping test; updated the mocked module's export
  list to include `VdReferenceMappingError`.
- `verticalDramaEpisodes.characterRefV2.test.ts`: replaced the RC2-era
  "adds the deterministic render-time Image mapping" test (which asserted
  the now-removed append) with a test asserting the render prompt is
  byte-identical to the stored prompt and `mockDb.update` is correctly NOT
  called (no QC-diff to persist).
- `verticalDramaStartFrameGeneration.test.ts`: unmodified — the batch
  validator is a no-op for all its existing fixtures (no explicit "Image N"
  claims in any test prompt); confirmed still green.
- All 4 target suites green: `npx vitest run
  shared/verticalDramaSeries/characterIdentityMap.test.ts
  server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts
  server/routers/__tests__/verticalDramaEpisodes.characterRefV2.test.ts` (71
  tests) plus `server/services/__tests__/verticalDramaStartFrameGeneration.test.ts`
  (22 tests) — 93/93 passing. `server/services/__tests__/verticalDramaEpisodePipeline.*`
  (75 tests, 9 files) also all green.

**Deviations from the literal plan text:**

- The router's render-time guard runs immediately after
  `resolveRequiredShotCharacterAttachmentManifest` resolves (right after
  `characterRefUrls` is built), rather than at the pre-existing
  `keptCharEntries` binding further down the function — this keeps the
  guard as early as possible (still "before credits reserved", the plan's
  actual requirement) without reordering any of the OTHER uncommitted
  session's surrounding code in this file.
- `pnpm check` (project-wide `tsc --noEmit`, run with `--max-old-space-size=8192`
  per `package.json`'s own `check` script) reports ~140 pre-existing errors
  across many unrelated files (editor components, job queues, etc.) plus 9
  pre-existing errors inside `resolveRequiredShotCharacterAttachmentManifest`
  (the OTHER uncommitted session's addition, untouched by this work — a
  `db.select(...)` type-inference gap unrelated to reference-mapping). Zero
  NEW errors are attributable to this plan's Phase 1-3 edits.
- Three test files in the same router
  (`verticalDramaEpisodes.locationReference.test.ts`,
  `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`,
  `verticalDramaEpisodes.textOverlayPlan.test.ts`) fail on the current
  working tree — confirmed pre-existing (caused by the OTHER uncommitted
  session's `resolveRequiredShotCharacterAttachmentManifest`/model-
  resolution/text-overlay changes, not by this plan's edits — e.g.
  `locationReference.test.ts`'s own mocked character rows have no
  `characterKey` field at all, a fixture shape written for the OLD
  pre-`resolveRequiredShotCharacterAttachmentManifest` code path) and
  explicitly out of scope per this task's constraints ("do NOT touch
  `resolveRequiredShotCharacterAttachmentManifest`'s ordering... or any
  other VD flows"). Left untouched — flagged here for whoever owns that
  other in-flight change.

### Backend agent implementation notes (2026-07-16, Phase 5b/5c/5d — server side)

**5b — `generateVideoClip` reference-slot accounting fix**
(`apps/web/server/routers/verticalDramaEpisodes.ts`, `generateVideoClip`,
~line 10740 onward):

- New `extraReferenceBudget = Math.max(0, maxReferenceImages - (startFrameAssetId ? 1 : 0))`
  replaces the bare `maxReferenceImages` everywhere it was previously used to
  slice/trim the EXTRAS array (`clip.extraReferenceAssetIds` + shot
  references +, additively, the new 5c character portraits + the location
  reference). Renamed the old inline extras array to `manualReferenceAssetIds`
  (`clip.extraReferenceAssetIds` + shot references only, unchanged content/
  order) so it can be reused by 5c's slot-remaining calculation.
  `trimmedReferenceCount` and `keptReferenceAssetIds` both now use
  `extraReferenceBudget` instead of `maxReferenceImages`. Byte-identical for
  every clip with no `startFrameAssetId` (the `- 1` term is 0 in that case).
- No sibling batch/retry code path exists for this pattern in this router —
  grepped for `.slice(0, maxReferenceImages)` and `maxReferenceImages` usages
  file-wide; `generateVideoClip` is the only call site that trims a
  reference-id array against this capability field.

**5c — auto-attach required-character primary portraits**
(same function, immediately after the 5b budget calculation):

- New private helper `resolveClipRequiredCharacterPortraitAssetIds(tenantId,
  userId, seriesId, startFramePlan, sourceShotNumbers)` (added near
  `resolveMediaAssetUrlsByIds`, ~line 1350) — unions `requiredCharacterRefs`
  across every one of `clip.sourceShotNumbers`' matching
  `startFramePlan.frames[]` entries (first-appearance order, deduped),
  resolves each character key to its DB row, then to its current approved
  primary-portrait asset id via the SAME
  `verticalDramaCharacterStockService.getPrimaryPortraitAssetId` primitive
  the 2026-07-11 speaker-switch redesign already uses for
  `clip.extraReferenceAssetIds`. Returns `[]` immediately (zero DB calls) if
  no shot has any `requiredCharacterRefs`.
- Call site: gated on `maxReferenceImages > 1` (Grok Imagine's `max: 1` is a
  complete no-op — asserted by a dedicated test) AND
  `remainingPortraitSlots = extraReferenceBudget - manualReferenceAssetIds.length > 0`.
  Wrapped in try/catch — `debugError("verticalDramaEpisodes.generateVideoClip", ...)`
  on failure, never throws (best-effort enrichment on a paid render path, no
  new LLM calls, cheap DB lookups only).
  Resolved portrait ids are filtered against a `Set` of
  `[startFrameAssetId, ...manualReferenceAssetIds]` (dedupe — never
  double-attach an id already present) then `.slice(0, remainingPortraitSlots)`.
  Note: ALL required characters' portraits are resolved up front (the DB/
  service calls happen for every required character key), but only the ones
  that fit `remainingPortraitSlots` are inserted into
  `orderedReferenceAssetIds` — a portrait excluded purely by this per-call
  slot limit is NOT counted in `trimmedReferenceCount` (that counter only
  reflects overflow of the array actually assembled); this is intentional,
  since portraits are additive best-effort enrichment the user never
  explicitly requested, unlike shot references/location.
- Final `orderedReferenceAssetIds` order:
  `[...manualReferenceAssetIds, ...characterPortraitReferenceAssetIds, ...(location ? [location] : [])]`
  — portraits sit BEFORE the location reference (identity before
  environment, matching `resolveShotCharacterReferenceEntries`'s documented
  priority convention), so a tight budget drops the location before it ever
  drops a character portrait.

**5d — persisted angle-grid assets (server side only)**

- `apps/web/shared/verticalDramaSeries/contracts.ts` —
  `VerticalDramaStartFramePlan["frames"][number]` gained
  `angleGridAssetIds?: number[]` (additive, absent-equivalent-to-`[]` on
  every pre-existing frame).
- New mutation `recordShotAngleGridAsset` in `verticalDramaEpisodes.ts`
  (placed immediately after `setApprovedStartFrameAsset`, reusing its exact
  id-parsing/ownership-check/"no plan"/"no frame entry" error pattern):
  - **Input**: `{ seriesId: string, episodeId: string, shotNumber: number, mediaAssetId: string, idempotencyKey?: string }`.
    `idempotencyKey` is accepted for API-shape consistency with this
    router's other client mutations but is NOT read anywhere — this is a
    free, no-credit, already-idempotent-by-construction data patch (dedupe-
    then-append), unlike the paid mutations that actually consume it.
  - **Behavior**: verifies `mediaAssetId` belongs to
    `{tenantId, userId}` (NOT_FOUND if not); PRECONDITION_FAILED if no
    `startFramePlan` exists yet; NOT_FOUND if no frame entry matches
    `shotNumber`. On success: `angleGridAssetIds` = dedupe (drop any
    existing occurrence of the id) + append the new id + `.slice(-5)` (keeps
    the 5 MOST RECENT, drops the oldest once a 6th would be added;
    re-recording an already-present id promotes it to most-recent instead of
    duplicating). Persists via the same "read plan → patch one frame →
    write the whole jsonb column back" `db.update` pattern as
    `setApprovedStartFrameAsset`.
  - **Output**: `{ startFramePlan: VerticalDramaStartFramePlan, angleGridAssetIds: number[], angleGridAssets: Array<{ mediaAssetId: number; url: string }> }`
    — `angleGridAssets` is resolved via the existing `resolveMediaAssetUrlsByIds`
    helper (tenant/user scoped), in the same order as `angleGridAssetIds`; an
    id whose asset row is missing/deleted is silently skipped (never throws).
- `getEpisodeDetail` exposure (episode-load response, no new query):
  - `resolveEpisodePlanAssetUrls` (the function that already builds the
    `assetUrls` flat `id -> {url, thumbnailUrl}` map for
    `approvedMediaAssetId`/`startFrameAssetId`/`endFrameAssetId`) now ALSO
    folds every frame's `angleGridAssetIds` into the SAME `ids` Set before
    the one batch `mediaAssets` query — i.e. angle-grid asset URLs are
    already present in `assetUrls` by numeric-id string key, same as every
    other asset id this function resolves.
  - New pure function `buildAngleGridAssetsByShotNumber(startFramePlan, assetUrls)`
    (next to `resolveEpisodePlanAssetUrls`) re-groups that already-resolved
    data into `Record<number /* shotNumber */, Array<{ mediaAssetId: number; url: string }>>`
    — purely in-memory, zero additional DB calls.
  - `getEpisodeDetail`'s response gained top-level key
    **`angleGridAssetsByShotNumber: Record<number, Array<{ mediaAssetId: number; url: string }>>`**
    (built from the above, right after `assetUrls` in the return object). A
    shot with no recorded angle-grid assets is simply ABSENT as a key (never
    an empty-array placeholder) — grandfathered/backward-compatible.

**Exact new/changed symbols the frontend step needs:**

| Symbol | File | Shape |
|---|---|---|
| `VerticalDramaStartFramePlan["frames"][number].angleGridAssetIds` | `shared/verticalDramaSeries/contracts.ts` | `number[] \| undefined`, cap 5, most-recent-last |
| `recordShotAngleGridAsset` (tRPC mutation) | `server/routers/verticalDramaEpisodes.ts` | in: `{seriesId, episodeId, shotNumber, mediaAssetId, idempotencyKey?}`; out: `{startFramePlan, angleGridAssetIds: number[], angleGridAssets: {mediaAssetId:number, url:string}[]}` |
| `getEpisodeDetail` response `.angleGridAssetsByShotNumber` | `server/routers/verticalDramaEpisodes.ts` | `Record<number, {mediaAssetId:number, url:string}[]>`, key absent when a shot has none |

**Tests** (`server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`):

- Extended the pre-existing `generateVideoClip — reference trimming (Phase 2.6)`
  describe block:
  - Updated 2 pre-existing tests whose expected `trimmedReferenceCount`/
    `referenceImageUrls` encoded the PRE-fix (buggy) budget math (now
    documented inline as such): `"trims references beyond
    maxReferenceImages..."` (max=1 + start frame → budget 0, not 1) and
    `"...extraReferenceAssetIds are kept first..."` (max=2 + start frame →
    budget 1, not 2). Bumped one `"location reference"` sub-suite test's
    `maxReferenceImages` from 1 to 2 (budget 1) to keep exercising its
    actual point (shot-ref vs. location priority) now that budget-1 no
    longer leaves room for either.
  - New nested describe `"Phase 5b (reference-slot accounting fix) + 5c
    (auto-attach required-character portraits)"` — 7 new tests: 5b budget
    math (max=3 exactly-2-kept, Grok max=1 zero-extras byte-identical,
    no-start-frame byte-identical-to-pre-fix); 5c auto-attach ordering
    (after manual refs, before location), dedupe-against-existing-refs,
    never-on-max=1 (asserts `getPrimaryPortraitAssetId` never called + exact
    `db.select` count), and best-effort-survives-a-throw.
  - New top-level describe `"recordShotAngleGridAsset — persisted
    alternate-angle backup stills (Phase 5d)"` — 7 tests: append-onto-empty,
    append-onto-existing (order preserved), dedupe-promotes-to-most-recent,
    cap-at-5-drops-oldest, NOT_FOUND (asset not owned),
    PRECONDITION_FAILED (no plan), NOT_FOUND (no frame entry).
  - Extended the `verticalDramaCharacterStock` mock (hoisted
    `mockGetPrimaryPortraitAssetId`) to add `getPrimaryPortraitAssetId`
    alongside the pre-existing `getPrimaryPortraitUrl` stub.
- All 20 new/updated tests pass; the file's pre-existing 44 failures
  (`deferEpisodeTieIn`/idempotencyKey-passthrough/`repairShotImage`/
  resolution-validation/Wave-4A tie-in-gate — all in `generateStartFrameImage`/
  `deferEpisodeTieIn`, code this session never touched) are unchanged in
  count before and after this session's edits — confirmed by running the
  file in isolation before making any change (44 failed/100 passed) and
  after (44 failed/114 passed = same 44 + all 14 new tests green).
- `pnpm check` (project-wide `tsc --noEmit`): see the run recorded at the end
  of this session — zero new errors attributable to this session's 3 edited
  files (`verticalDramaEpisodes.ts`, `contracts.ts`, the test file).

**Deviations from the literal task text:**

- `resolveClipRequiredCharacterPortraitAssetIds` resolves EVERY required
  character's portrait before the caller applies the remaining-slot slice
  (rather than stopping early once slots run out) — simpler and still
  bounded (a shot's `requiredCharacterRefs` list is small, same order of
  magnitude as the 9-shot grid), and keeps the "best-effort, log and
  continue" try/catch boundary at a single call site instead of threading a
  limit parameter through the helper.
- `getEpisodeDetail`'s new field is named `angleGridAssetsByShotNumber`
  (a `Record<shotNumber, {mediaAssetId,url}[]>`), not a bare
  `angleGridAssets` key on each raw frame object — the task text's literal
  phrasing ("`angleGridAssets: [...]` per frame") was interpreted as
  "grouped by shot/frame", and `getEpisodeDetail` returns
  `startFramePlan.frames[]` as the RAW persisted JSON (never reshaped
  per-key), so adding a resolved-URL array field directly onto each raw
  frame object isn't the existing pattern — `assetUrls` (the existing
  flat id->url map this whole function's convention is built on) is itself
  a SEPARATE top-level key the client joins against by id, and
  `angleGridAssetsByShotNumber` follows that exact convention (separate
  top-level key, client joins by `shotNumber` instead of by raw id, since
  `angleGridAssetIds` is a PER-FRAME array rather than a single id like
  `approvedMediaAssetId`). The `recordShotAngleGridAsset` mutation's own
  response DOES use the literal `angleGridAssets: {mediaAssetId,url}[]`
  shape the task specified, since that response is naturally scoped to one
  shot already.
- Client-side work (AngleVariationPicker re-opening stored grids from
  `angleGridAssetIds`/calling `recordShotAngleGridAsset` when a grid tile is
  approved/consuming `angleGridAssetsByShotNumber`) is explicitly OUT OF
  SCOPE for this task (server-only) and is NOT done — flagged as the next
  step for whoever picks up the frontend half of Phase 5d.

### Frontend agent implementation notes (2026-07-16, Phase 5d — client side)

The actual angle-grid submit/poll/completion orchestration lives in
`VerticalDramaEpisodePage.tsx` (NOT `VerticalDramaStoryboardPanel.tsx`,
despite the task brief's line-number pointers into the panel — those were
either unrelated hits (`resolveMediaAssetForImport` at panel ~5518 belongs to
the separate `VerticalDramaLocationsBibleCard`) or referred to the panel's
purely-presentational half of this feature, which IS a real file/prop
surface, just not where the mutation calls happen). Traced the real flow
before editing: `VerticalDramaEpisodePage.tsx`'s `resolveCompletedAngleVariationsTask`
is the single choke point both the live submit-then-poll path AND the
resume-on-load path converge on.

**New/changed symbols:**

- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
  - `recordShotAngleGridAssetMutation` — new
    `trpc.verticalDramaEpisodes.recordShotAngleGridAsset.useMutation()`.
  - `persistAngleGridAsMediaAsset(shotNumber, gridUrl)` — new async helper:
    resolves the grid URL to a durable media asset via the ALREADY-EXISTING
    `resolveMediaAssetForImportMutation` (line ~1045, reused verbatim — no
    new resolve mutation created), then calls `recordShotAngleGridAsset`,
    then patches `utils.verticalDramaEpisodes.getEpisodeDetail`'s cache
    (`setData`) so `angleGridAssetsByShotNumber[shotNumber]` updates without
    a refetch. Wrapped in try/catch → `console.warn` only, never
    throws/toasts (fire-and-forget, per task constraint). Idempotent by
    construction: `resolveMediaAssetForImport` dedupes by URL checksum
    server-side, and `recordShotAngleGridAsset` dedupes-then-promotes by
    asset id — so calling it twice for the same grid URL (e.g. live
    completion + a later resume-on-load) is safe.
  - `resolveCompletedAngleVariationsTask` — one new line,
    `void persistAngleGridAsMediaAsset(shotNumber, resultUrl)`, added after
    its existing `persistAngleGrid(...)` call. Fires for BOTH the live and
    resume-on-load paths (both are legitimate "grid task completed" events;
    non-issue given the idempotency above). Non-grid images (single start-frame
    renders, `pollStartFrameTask`) are a completely separate poll function
    and were not touched — `recordShotAngleGridAsset` is never called from
    there.
  - `handleOpenStoredAngleGrid(shotNumber, url)` — new; sets
    `angleVariationGridUrlByShot[shotNumber] = url`, which is ALL it needs to
    do — the pre-existing persist effect (keyed off
    `persistedAngleGridUrlByShotRef`) already reacts to any new value there
    and calls `persistAngleGrid` on its own, so this doesn't duplicate that
    logic. Does not re-call `persistAngleGridAsMediaAsset` (the grid is
    already recorded — that's how it got into `angleGridAssetsByShotNumber`
    in the first place).
  - `storyboardPanel` prop object gained
    `angleGridAssetsByShotNumber: episodeDetailQuery.data?.angleGridAssetsByShotNumber`
    and `onOpenStoredAngleGrid: handleOpenStoredAngleGrid`.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
  - `VerticalDramaStoryboardPanelData` interface gained the same two fields
    (pure pass-through type mirror).
  - Threaded through at the FIRST `<VerticalDramaStoryboardPanel>` render
    site only (~line 1171, the interactive/primary render) — the SECOND
    render site (~line 1889, the read-only "advanced stage run detail" view)
    already omits the entire angle-variation prop surface
    (`onGenerateAngleVariations`, `angleVariationGridUrlByShot`, etc.), so
    the new fields were deliberately NOT added there either, for
    consistency with that existing omission.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  - `VerticalDramaStoryboardPanelProps` gained
    `angleGridAssetsByShotNumber?: Record<number, Array<{mediaAssetId:number,url:string}>>`
    and `onOpenStoredAngleGrid?: (shotNumber, url) => void`.
  - New module-level `EMPTY_ANGLE_GRID_ASSETS_BY_SHOT` constant (stable `{}`
    default, same convention as the pre-existing `EMPTY_SHOT_NUMBER_SET`).
  - New "กริดที่สร้างไว้" (stored grids) UI block, rendered per shot card
    right after the "Generate multi-angle (3x3)" button and before the
    reference strip — a row of up to 5 `h-9 w-9` thumbnail buttons (same
    sizing/pattern as `ShotReferenceStrip`'s reference thumbnails),
    most-recent-first (server persists oldest-first via `.slice(-5)` append;
    reversed for display here). Clicking one calls `onOpenStoredAngleGrid`,
    which loads it into the exact same `angleVariationGridUrlByShot`/
    `splitImage`/`AngleVariationPicker` flow a freshly-completed grid uses —
    no new picker/split logic needed. Gated independently of
    `onGenerateAngleVariations`/`frame?.imagePrompt` (shows whenever stored
    grids exist, regardless of whether the generate button itself is
    visible).
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
  - New copy keys `storedAngleGridsLabel` / `storedAngleGridsHint` (en + th),
    added next to the pre-existing `pickBestAngleTitle`/`angleTileCount`
    angle-grid strings.

**Tests** (`VerticalDramaStoryboardPanel.tsx`'s "AngleVariationPicker" test
file — that name refers to the panel's 9-tile picker UI region, not a
separate component; no standalone `AngleVariationPicker.tsx` file exists):

- `apps/web/client/src/components/verticalDramaSeries/__tests__/AngleVariationPicker.test.tsx`
  — new `describe("stored angle-grid re-open (Phase 5d)")` block, 3 tests:
  no stored-grids row when `angleGridAssetsByShotNumber` has no entry for
  the shot; renders one thumbnail per stored grid in most-recent-first
  order (asserted via DOM button order, not just presence); clicking a
  thumbnail calls `onOpenStoredAngleGrid(shotNumber, url)`. Component-level
  (not pure-helper) tests, matching this file's own existing convention —
  the new logic is UI-prop-driven (conditional render + click handler), not
  a pure function suitable for extraction the way `shouldResumeAngleGridPoll`
  was in the sibling `VerticalDramaEpisodePage.angleGridResume.test.ts`.
- All 7 tests in the file pass (4 pre-existing + 3 new).
- `npx tsc --noEmit -p .` (apps/web): zero errors attributable to the 5
  edited files (`VerticalDramaStoryboardPanel.tsx`,
  `VerticalDramaEpisodeWorkspace.tsx`, `VerticalDramaEpisodePage.tsx`,
  `verticalDramaWorkspaceCopy.ts`, the test file).
- Ran the broader VD storyboard/workspace test suites (12 files, 139 tests)
  as a regression check: 9 pre-existing failures across 4 files
  (`VerticalDramaEpisodeWorkspace.finalRenderOptions.test.tsx`,
  `.episodeBeyondPlan.test.tsx`, `.adBannerPlan.test.tsx`'s sibling
  `VerticalDramaStoryboardPanel.nativeAudioPrompts.test.tsx`, and
  `VerticalDramaStoryboardPanel.wave5a.test.tsx`) — confirmed unrelated to
  this diff by inspecting each failure (duplicate `mock-select` elements in
  the Final Render Suite section, a locale-template assertion, a native-audio
  toggle visibility case, a tie-in error-message mapper case — none touch
  angle-grid code, and `git diff` of this session's edits contains zero
  additions matching `subtitle|native.?audio|tie.?in` in either edited
  component file) and consistent with this same plan file's Phase 1-3/5b-c
  notes about a separate uncommitted in-flight session touching these exact
  files. Left untouched, out of scope for this task.

## Phase 6 — User-controlled supplementary reference frames (2026-07-16, user spec)

User spec (verbatim intent): a new per-shot button that generates additional
reference frames — no fixed count, **cap 10 per shot** (future multi-ref
models); the USER picks which characters appear and types a free-text
directive (pose/camera/action, e.g. "ไอริณโอบกอดภาคิน"); prompt authoring goes
through the SAME flow as the "สร้าง prompt + ภาพ" button with the user text
injected; after the prompt is generated the user must CONFIRM before the paid
image render; results display as one growing row of thumbnails (character-chip
size, click-to-fullscreen); the input field shows placeholder examples; and
the whole flow must be verified to actually work end-to-end, not dangling UI.

### Design

Single source of truth: `vertical_drama_shot_references` rows with new
`source: "reference_frame"` (column is varchar(20) — zod-enum addition only,
NO migration). Video-render attachment comes free: `generateVideoClip`
already folds shotReferences into the ordered reference array (Phase 5b/5c
budget applies; Grok max=1 ignores them in-app but they remain available for
manual use).

Flow: button → dialog (character multi-select from roster, default = shot's
requiredCharacterRefs, no-portrait characters disabled with hint; textarea
with placeholder examples) → `generateShotReferenceFramePrompt` (LLM,
reuses `generateStartFrameShotPrompt` service in a new
`referenceFrameMode` — emits `reference_frame_mode: true` fact + user text as
`repair_instruction`, manifest = selected characters in selection order,
speakingOrder omitted; mapping validator + retry + fail-closed identical to
the main flow; does NOT touch `frame.imagePrompt`) → prompt shown for user
confirm (editable) → `generateShotReferenceFrameImage` (cap-10 guard,
render-time mapping validator fail-closed BEFORE credits, portraits resolved
fail-closed via the requiredCharacterRefs-order resolver with the SELECTED
keys, location ref attached, same model/credit path as
`generateStartFrameImage`) → async task → client polls → import media asset →
`linkShotReference(source: "reference_frame", role: "reference")` → row
renders strip entries filtered to that source.

Skill: new "Supplementary reference frame mode" section in
`vertical-drama-shot-start-frame-prompt/skill.md` — when
`reference_frame_mode: true`: the user directive OUTRANKS
`canonical_shot_summary` for action/pose/camera (the beat may deviate);
location/wardrobe continuity, REFERENCE MAPPING declaration, identity lock,
still-image emotion rules, and exact-person-count (= manifest entries) all
still apply; `speaking_order`/`framing_override` absent by design.

### Status
- [x] 6a server — two mutations + service referenceFrameMode + source enum + tests (2026-07-16, backend agent — see notes below)
- [x] 6b skill — reference-frame-mode section DONE (user directive outranks canonical summary for action/pose/camera; identity/mapping/still-image rules unchanged; exact person count = manifest; face-readability floor for wide shots)
- [x] 6c client — button/dialog/two-step confirm/row/fullscreen/copy + tests (2026-07-16, frontend agent — see notes below)
- [x] 6d verify end-to-end + deploy — DONE 2026-07-16 06:57 (+07). Conductor traced the FULL wiring chain (button→dialog two-step→page handlers→generateShotReferenceFramePrompt/Image mutations→pollReferenceFrameTask→resolveMediaAssetForImport→linkShotReference source=reference_frame→listShotReferences invalidate→GeneratedReferenceFrameRow filtered by source) confirming no dangling props: page passes 4 props into storyboardPanel object → VerticalDramaEpisodeWorkspace forwards all 4 → panel destructures with EMPTY_SHOT_NUMBER_SET defaults. 44 Phase-6 tests pass; build:deploy + web restart; reference-frame-mode section confirmed live in production DB (skills.systemPrompt); https://smartaihub.app → 200.

### Backend agent implementation notes (2026-07-16, Phase 6a — server side)

**New/changed symbols the frontend step (6c) needs:**

| Symbol | File | Shape |
|---|---|---|
| `GenerateStartFrameShotPromptParams.referenceFrameMode` | `server/services/verticalDramaStartFrameGeneration.ts` | `boolean \| undefined` — service-internal only, never sent by the client directly (set by the router mutation below) |
| `generateShotReferenceFramePrompt` (tRPC mutation) | `server/routers/verticalDramaEpisodes.ts` | in: `{ seriesId: string, episodeId: string, shotNumber: number, characterKeys: string[] (1-10, non-empty strings), instruction: string (1-2000 chars, trimmed), idempotencyKey?: string }`; out: `{ prompt: string, negativePrompt: string, creditsUsed: number, model: string, characterKeys: string[] }` (`characterKeys` = the de-duped, order-preserved list the manifest was built from — echo this straight into the confirm step's `generateShotReferenceFrameImage` call). Does NOT persist anything on the episode row. |
| `generateShotReferenceFrameImage` (tRPC mutation) | `server/routers/verticalDramaEpisodes.ts` | in: `{ seriesId: string, episodeId: string, shotNumber: number, prompt: string (1-3500 chars, trimmed — `VD_IMAGE_PROMPT_MAX`), negativePrompt?: string (max 2000), characterKeys: string[] (1-10), resolution?: string, mcpConnectionId?: string, sharedGroupId?: number, idempotencyKey?: string }`; out: `{ taskId: string, creditCost: number, modelId: string, trimmedReferenceCount: number }` (`trimmedReferenceCount` is an additive extra beyond the task brief's literal `{taskId, creditCost, modelId}` — same trim-notice convention `generateStartFrameImage`/`generateStartFrameAngleVariations` already return; safe to ignore). Client polls this `taskId` via the existing `media.getTask` convention, then imports the completed asset and calls `linkShotReference({..., source: "reference_frame", role: "reference"})` to persist it. |
| `linkShotReference` input `source` enum | `server/routers/verticalDramaEpisodes.ts` | gained `"reference_frame"` (alongside the pre-existing `generated \| grid_cut \| history \| library \| upload \| previous_main`) — `varchar(20)` column, no migration. |
| `VerticalDramaShotReferenceSource` type | `server/services/verticalDramaShotReferences.ts` | gained `"reference_frame"` member (same shared type `linkShotReference`'s zod enum and `listShotReferences`'s response both key off). |
| Where to read `source` for filtering the reference strip to just this shot's reference frames | `listShotReferences` query (`verticalDramaProcedure`, existing) | `{ references: Record<shotNumber, Array<{referenceId, mediaAssetId, role, source, sortOrder, createdAt, thumbnailUrl}>> }` — filter `references[shotNumber].filter(r => r.source === "reference_frame")`. `getEpisodeDetail` does NOT carry shot references at all (verified — searched the whole procedure); `listShotReferences` is the existing, already-shipped read path the client should use (each row already carries `source` via `shotReferenceRowToContract`, no change needed there). |

**Design decisions / deviations from the literal task text:**

- `generateShotReferenceFramePrompt` validates every selected `characterKey` against the series roster with a dedicated query BEFORE calling the LLM (fail fast, save a wasted LLM call on a typo'd/stale key) — the task text only specified this as a requirement, not an exact mechanism; implemented as a single `verticalDramaCharacters` lookup scoped to the caller's `(tenantId, seriesId)` + the de-duped `characterKeys`, Thai `PRECONDITION_FAILED` message mirroring the existing roster-lookup error style elsewhere in this router.
- `generateShotReferenceFramePrompt` runs the returned prompt through `ensurePromptWithinLimit` (same as `generateShotStartFramePrompt`) even though the task text's step-by-step list didn't explicitly call this out — this keeps the mutation's returned prompt within `generateShotReferenceFrameImage`'s own zod `max(VD_IMAGE_PROMPT_MAX)`, so a user who confirms the prompt UNMODIFIED can never hit a `BAD_REQUEST` on the render call purely from LLM verbosity.
- `generateShotReferenceFrameImage` returns an additional `trimmedReferenceCount` field beyond the task brief's literal `{taskId, creditCost, modelId}` — additive/backward-compatible, matches the sibling mutations' existing trim-notice convention (`trimmedProductReferenceCount` on `generateStartFrameImage`, `trimmedReferenceCount` on `generateVideoClip`).
- `VD_IMAGE_PROMPT_MAX` is imported into `verticalDramaEpisodes.ts` from `@shared/verticalDramaSeries` (the shared barrel where it's actually defined), NOT from `server/services/verticalDramaPromptQc.ts`'s re-export as originally planned — the QC service module is wholesale-mocked (via `vi.mock`) by essentially every existing VD router test file (18 files), and none of those mocks exported this constant; importing a NEW named export from an already-mocked module breaks every one of those files' module resolution at collection time (`No "X" export is defined on the mock`) the instant the router statically imports it, regardless of whether the specific test file under test ever exercises the new code path. Importing from the shared/pure `@shared/verticalDramaSeries` barrel (never mocked — it's plain shared code, the same barrel `VERTICAL_DRAMA_MEMORY_KINDS` etc. already come from in this same import block) avoids the blast radius entirely with zero test-file changes required. Confirmed via a full run of every `verticalDramaEpisodes*.test.ts` + the two Phase 6a service/shot-reference test files (536 tests across 25 files): 52 failures across the exact same 3 files (`locationReference`, `shotReferencesAndQualityReview`, `textOverlayPlan`) already documented as pre-existing/out-of-scope elsewhere in this plan file, zero new failures.
- No cap-10 guard constant was factored out into a shared named constant (e.g. `VD_REFERENCE_FRAME_CAP`) — the literal `10` appears once, inline, matching the task text's own literal "cap 10 per shot" wording; flagged here in case 6c's client-side dialog wants to mirror the same cap for a pre-emptive UI disable (10 is currently NOT exported anywhere for it to import).
- `generateShotReferenceFrameImage` deliberately does NOT call `assertTieInQualityGatePassed`/the quality-floor-override audit/`resolveVerticalDramaQualityLoopFlags` that `generateStartFrameImage` runs — a supplementary reference frame is never the shot's tie-in carrier (no product reference is ever attached, per the task's own item (e), letter (2) in the doc comment), so those gates are not applicable here. Not a deviation from the task text (which never mentioned them for this mutation) — noted here only so a future reader doesn't mistake the omission for a bug.

**Tests** (`npx vitest run`, full output below):

- `server/services/__tests__/verticalDramaStartFrameGeneration.referenceFrameMode.test.ts` (NEW, 5 tests) — pure-function coverage for `buildStartFrameShotPromptUserPrompt`'s new `reference_frame_mode: true` fact line (byte-identical when absent/false, line lands immediately after `repair_instruction`, byte-identical otherwise, `repair_instruction` still carries the user's directive unaffected).
- `server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` (extended, +5 tests, 17/17 total pass) — new `describe("generateShotReferenceFramePrompt", ...)`: no-plan/no-frame precondition; unknown-characterKey precondition (LLM never called); manifest order follows the USER's `characterKeys` order (not `frame.requiredCharacterRefs`, proven with DELIBERATELY reversed fixtures), `referenceFrameMode: true` threaded through, no `speakingOrder` fact, return shape incl. `characterKeys` echo, and `mockDb.update`/`mockDb.transaction` NEVER called (proves nothing is persisted); `VdReferenceMappingError` → `PRECONDITION_FAILED` mapping.
- `server/routers/__tests__/verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts` (NEW, 8 tests) — no-plan/no-frame precondition; cap-10 guard (rejects at exactly 10 existing `reference_frame` rows, Thai message, credits/provider never touched) and its negative case (10 rows of a DIFFERENT source never trips the cap); render-time mapping-mismatch guard fails BEFORE `deductCredits`; missing-portrait precondition; happy path (extraParams `__vd_purpose: "reference_frame"`, exact `{taskId, creditCost, modelId, trimmedReferenceCount}` return shape, `mockDb.update` never called); NO product reference attached even when the shot carries `productReferenceAssetIds`; refund-on-submit-failure.
- `server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` (extended, +1 test) — `linkShotReference` accepts `source: "reference_frame"` and forwards it verbatim to the service.
- Full-suite regression check (`npx vitest run server/routers/__tests__/verticalDramaEpisodes*.test.ts server/services/__tests__/verticalDramaStartFrameGeneration*.test.ts server/services/__tests__/verticalDramaShotReferences*.test.ts`): **536 tests, 484 passed, 52 failed** — the 52 failures are 100% within the 3 files already documented above (`locationReference`, `shotReferencesAndQualityReview` — 44 pre-existing `deferEpisodeTieIn`/etc. failures unrelated to `linkShotReference`, `textOverlayPlan` — 8 pre-existing "EP" vs "SUB-EP" label failures) as belonging to the OTHER uncommitted in-flight session's changes, confirmed unchanged in count/identity before vs. after this session's edits.
- `tsc --noEmit` (`NODE_OPTIONS='--max-old-space-size=8192'`, project-wide, matching `package.json`'s own `check` script): **140 errors total**, matching this plan file's own previously-documented baseline exactly; the only errors inside any of this session's 3 touched files (`verticalDramaEpisodes.ts`, `verticalDramaStartFrameGeneration.ts`, `verticalDramaShotReferences.ts`) are the 9 pre-existing errors inside `resolveRequiredShotCharacterAttachmentManifest` already documented in this plan file's Phase 1-3 notes (untouched by this session). Zero new errors attributable to Phase 6a.

### Frontend agent implementation notes (2026-07-16, Phase 6c — client side)

**New files:**

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaReferenceFrameDialog.tsx`
  — new standalone, presentational two-step dialog (same "page owns mutations,
  dialog is presentational" convention as `VerticalDramaRepairDialog.tsx`).
  Built on the real `@/components/ui/dialog` primitive (Radix `Dialog`), not
  the panel's hand-rolled `role="alertdialog"` picker pattern
  (`ShotCharacterReferencePickerDialog`), since a real modal with proper
  focus-trap/ESC/overlay semantics was preferred for a paid-render
  confirmation flow. Exports:
  - `VerticalDramaReferenceFrameDialog` (default + named export) — props:
    `locale?`, `open`, `onOpenChange`, `shotNumber`, `characterOptions:
    VerticalDramaReferenceFrameCharacterOption[]`, `defaultSelectedKeys:
    string[]`, `existingCount: number`, `cap? = 10`, `generatingPrompt?`,
    `generatingImage?`, `onGeneratePrompt(args) =>
    Promise<VerticalDramaReferenceFramePromptResult | null>`,
    `onConfirmRender(args) => Promise<boolean>` (returning `true` closes the
    dialog; `false` keeps the review step open so the user can retry without
    re-typing anything — the caller has already surfaced the error via
    toast).
  - `VerticalDramaReferenceFrameCharacterOption` (`{key, name, portraitUrl}`)
    and `VerticalDramaReferenceFramePromptResult` (mirrors
    `generateShotReferenceFramePrompt`'s tRPC output shape verbatim) — types.
  - Internal step state (`"select" | "review"`) resets on every `open`/
    `shotNumber` change. Step 1: character checkboxes (portrait-less
    characters disabled with the `referenceFrameNoPortraitHint` label) +
    instruction `Textarea` with placeholder examples; "สร้าง prompt" disabled
    until ≥1 character selected AND instruction non-empty AND the shot isn't
    already at the 10-frame cap. Step 2: the returned prompt/negative-prompt
    render into EDITABLE `Textarea`s (the brief's "แก้ไข prompt" requirement
    is satisfied by direct in-place editing, not a separate edit-mode toggle)
    + a credits-used note + "สร้างภาพ" (confirm render) + "กลับไปแก้ไขตัวเลือก"
    (back to step 1, instruction text preserved) + cancel.
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaReferenceFrameDialog.test.tsx`
  (NEW, 8 tests) — mocks `@/components/ui/dialog` (same convention as
  `ExportAsSkillDialog.test.tsx`) for deterministic step-logic coverage:
  default-checked/disabled-no-portrait seeding, generate-button gating
  (character + instruction + cap), cap-reached disables generate regardless
  of selection, `onGeneratePrompt` called with the right args and transitions
  to the editable review step, stays on step 1 when `onGeneratePrompt`
  resolves `null`, "back to selection" preserves the instruction text,
  confirming render calls `onConfirmRender` with the (possibly hand-edited)
  prompt and closes only on `true`, stays open on `false`.
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.referenceFrames.test.tsx`
  (NEW, 6 tests) — mounts the REAL (unmocked) panel + Radix `Dialog` (proven
  to render/query fine in this test env, unlike some other Dialog-based
  components in the repo that mock it): trigger button absent when neither
  callback is wired; clicking the trigger opens the real dialog with the
  shot's `requiredCharacterRefs` pre-checked; trigger disabled at exactly 10
  existing `reference_frame` rows; the growing row is absent with zero
  entries; the row filters OUT non-`reference_frame` sources and orders
  most-recent-first (DOM button order asserted, not just presence — same
  convention as the Phase 5d stored-angle-grids test); clicking a thumbnail
  opens the fullscreen `ImageLightbox`.

**Changed files (all additive — no existing prop/behavior removed or
renamed):**

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  - `VerticalDramaShotReferenceView["source"]` union gained `"reference_frame"`
    (mirrors the server's `VerticalDramaShotReferenceSource` addition — no
    server-side type import exists on the client, so this is a hand-kept
    mirror like every other field on this view type).
  - `VerticalDramaStoryboardPanelProps` gained
    `onGenerateReferenceFramePrompt?`, `generatingReferenceFramePromptForShot?
    = EMPTY_SHOT_NUMBER_SET`, `onGenerateReferenceFrameImage?`,
    `generatingReferenceFrameImageForShot? = EMPTY_SHOT_NUMBER_SET` (placed
    right after the existing `usingShotReferenceAsMainForShot` prop, same
    "Phase 2.5 reference strip" neighborhood).
  - New local state `referenceFrameDialogForShot` (single-open-at-a-time,
    same convention as `characterRefPickerForShot`).
  - New per-shot render block (placed directly ABOVE `ShotReferenceStrip` —
    "near the existing reference drop-zone" per the brief — and BELOW the
    Phase 5d stored-angle-grids row): the "สร้างเฟรมอ้างอิง (AI)" trigger
    button (disabled at the 10-frame cap or while either step is pending for
    that shot), the new `GeneratedReferenceFrameRow`, and the
    `VerticalDramaReferenceFrameDialog` itself (rendered inline per-shot,
    gated on `referenceFrameDialogForShot === shotNumber` — safe because
    Radix `Dialog` portals its content, so per-shot inline mounting doesn't
    nest visually). The button/row/dialog are gated as a group on BOTH
    `onGenerateReferenceFramePrompt && onGenerateReferenceFrameImage` being
    wired (same "optional feature surface" convention as the reference strip
    itself). Default character selection recomputes the shot's current
    `frame.requiredCharacterRefs` / `shot.required_character_refs` /
    `shot.characters` fallback chain inline (same logic as the pre-existing
    character-chips block a few hundred lines up, which lives inside its own
    IIFE and isn't reusable as a shared variable) — flagged here as a small,
    intentional duplication rather than a refactor of code outside this
    task's scope. The character roster for the dialog's checkboxes is built
    directly from the ALREADY-PASSED-IN `characterPortraits` flat map (every
    base/twin/variant row, not re-using
    `buildShotCharacterReferencePickerGroups`'s nested grouping — a flat list
    was simpler and sufficient here since there's no "nested under parent"
    UI requirement for this dialog).
  - New `GeneratedReferenceFrameRow` function component (placed immediately
    after `ShotReferenceStrip`'s definition) — the DISTINCT "เฟรมอ้างอิงที่สร้างไว้"
    row (design decision (a) from this plan's own Phase 6 design section: a
    separate row filtered to `source === "reference_frame"`, not folded into
    the general strip), same chip-sized thumbnail (`h-9 w-9`) +
    click-to-fullscreen (`ImageLightbox`) treatment as `ShotReferenceStrip`.
    Takes `frames` ALREADY ordered by the caller (the panel reverses the
    filtered `shotReferencesByShot[shotNumber]` array before passing it in,
    since the server/`buildShotReferenceManifest` sorts oldest-first —
    same "reverse for most-recent-first display" convention the Phase 5d
    stored-angle-grids row already established). Renders nothing (`null`)
    when `frames.length === 0` — the row only appears once the first
    reference frame exists, satisfying the "growing row" requirement.
  - No `Object.entries`/roster helper was factored out as its own exported
    pure function (unlike `buildShotCharacterReferencePickerGroups`) — the
    mapping is a single one-line `.map()`, not worth extracting for this
    task's scope.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
  - `VerticalDramaStoryboardPanelData` interface gained the same four fields
    (pure pass-through type mirror, imports
    `VerticalDramaReferenceFramePromptResult` directly from
    `./VerticalDramaReferenceFrameDialog`).
  - Threaded through at the FIRST `<VerticalDramaStoryboardPanel>` render
    site only (interactive/primary render) — the SECOND render site
    (read-only "advanced stage run detail" view) already omits
    `shotReferencesByShot`/the whole reference-strip prop surface entirely,
    so the new Phase 6c props were deliberately NOT added there either, for
    consistency with that existing omission (same precedent as the Phase 5d
    angle-grid props).
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
  - `generateShotReferenceFramePromptMutation` /
    `generateShotReferenceFrameImageMutation` — new
    `trpc.verticalDramaEpisodes.generateShotReferenceFramePrompt/
    generateShotReferenceFrameImage.useMutation()` calls.
  - `generatingReferenceFramePromptForShot` (new `Set<number>` state, step-1
    spinner) and `pollingReferenceFrameShots` (new `Set<number>` state,
    step-2 submit+poll — deliberately SEPARATE from `pollingStartFrameShots`
    so a shot can have a start-frame render AND a reference-frame render in
    flight at once without either poller's success/failure toast firing for
    the wrong feature).
  - `handleGenerateReferenceFramePrompt(args)` — step 1 handler; same
    `requireModelSelectedOrToast("image")` /
    `requireMcpConnectionOrToast("image")` guards as
    `handleGeneratePromptAndImage`; returns the mutation's result or `null`
    on failure (toasted here, `BAD_REQUEST` scrolls to the model picker).
  - `pollReferenceFrameTask(taskId, shotNumber)` — new dedicated poller,
    structurally mirrors `pollStartFrameTask` (same
    `VD_START_FRAME_POLL_INTERVAL_MS`/`VD_START_FRAME_POLL_MAX_ATTEMPTS`
    constants, reused rather than duplicated) but on `"completed"` calls
    `linkShotReferenceMutation.mutateAsync({..., role: "reference", source:
    "reference_frame"})` instead of `setApprovedStartFrameAssetMutation`, and
    never auto-softens/resubmits on a policy failure (that retry convention
    is specific to the main start-frame identity-lock flow, not applicable
    to an arbitrary user-directed supplementary frame). Clears its own
    `pollingReferenceFrameShots` entry in a `finally` block.
  - `handleGenerateReferenceFrameImage(args)` — step 2 handler; submits
    `generateShotReferenceFrameImage` with the same
    `mcpConnectionId`/`sharedGroupId`/`selectedImageResolution` wiring
    pattern `handleGeneratePromptAndImage` uses for
    `generateStartFrameImageMutation`, then fires `pollReferenceFrameTask`
    and returns `true` immediately (submit-succeeded convention — the dialog
    closes while the render continues in the background, same as every
    other async VD render in this file). Returns `false` on a submit
    failure (toasted here, `BAD_REQUEST` scrolls to the model picker, dialog
    stays open on the review step for a retry).
  - `storyboardPanel` prop object gained
    `onGenerateReferenceFramePrompt: handleGenerateReferenceFramePrompt`,
    `generatingReferenceFramePromptForShot`,
    `onGenerateReferenceFrameImage: handleGenerateReferenceFrameImage`,
    `generatingReferenceFrameImageForShot: pollingReferenceFrameShots`.
  - All four new symbols are declared AFTER `linkShotReferenceMutation`
    (`~line 2339`) and `handleUseShotReferenceAsMain` (both referenced by the
    new poller/handlers) — placed immediately below them, before the
    pre-existing "Phase 3.4 — dialogue box" section.
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
  — new copy keys (en + th, both `VD_COPY` blocks kept in sync per this
  file's own `Record<keyof en, string>` type constraint):
  `referenceFrameGenerateButton`, `referenceFrameDialogTitle`,
  `referenceFrameDialogHint`, `referenceFrameCharactersLabel`,
  `referenceFrameNoPortraitHint`, `referenceFrameInstructionLabel`,
  `referenceFrameInstructionPlaceholder` (contains the user's own verbatim
  example: "ไอริณโอบกอดภาคิน"), `referenceFrameGeneratePromptButton`,
  `referenceFrameGeneratingPrompt`, `referenceFramePromptLabel`,
  `referenceFrameNegativePromptLabel`, `referenceFrameBackToSelection`,
  `referenceFrameConfirmRenderButton`, `referenceFrameGeneratingImage`,
  `referenceFrameCreditsNote`, `referenceFrameCountLabel`,
  `referenceFrameCapReached`, `referenceFrameRowLabel`,
  `referenceFrameRowHint`, `referenceFrameRenderSuccess`,
  `referenceFrameRenderFailed` — added right after the pre-existing
  "Stored angle-grid re-open (Phase 5d)" block in both locale sections
  (the panel already imports `vdCopy` and uses `t2 = vdCopy(locale)`
  throughout, so no new copy-lookup mechanism was introduced;
  `verticalDramaCopy.ts`, the OTHER copy module the brief mentioned, was not
  touched — it's used for a different set of components
  (`VerticalDramaShell`/deep-story-drafts copy), not the storyboard panel).

**How the growing row filters by source (as required by the OUTPUT
contract):** the panel does NOT receive a separate
`referenceFramesByShot`/similar prop — it reuses the EXISTING
`shotReferencesByShot` prop (already `listShotReferences`-shaped, already
carrying `.source` on every entry per the Phase 6a backend notes) and derives
`referenceFramesForShot = (shotReferencesByShot[shotNumber] ?? []).filter(r
=> r.source === "reference_frame")` inline, then reverses it before passing
to `GeneratedReferenceFrameRow` for most-recent-first display. No new query,
no new top-level prop for the list itself — only the two callback props +
two pending-state props described above were added, keeping this Phase 6c
diff additive-only on the data-fetching side (the existing
`shotReferencesQuery`/`listShotReferences.invalidate()` calls already used by
`linkShotReferenceMutation`'s `onSuccess` automatically refresh the row once
`pollReferenceFrameTask` links the completed asset — no new invalidation
needed either).

**Tests summary:** 14 new client tests (8 dialog-unit + 6 panel-integration),
all passing. Full `verticalDramaSeries/__tests__/` regression run: 854
passing / 23 failing across 9 files — every failing file/test cross-checked
against `git status` (untouched by this session: `VerticalDramaArcReplanCard`,
`VerticalDramaDeepStoryDraftsPanel` improveScript, `VerticalDramaDialogueAudioPanel`,
`VerticalDramaEpisodeWorkspace` episodeBeyondPlan/finalRenderOptions,
`VerticalDramaProductionWizard`, `VerticalDramaStoryboardPanel`
nativeAudioPrompts/wave5a, `verticalDramaWorkspaceCopy` nativeAudioPrompts) —
all pre-existing failures from the other uncommitted in-flight session
already documented elsewhere in this plan file (`DeepStoryDraftsPanel.tsx`,
`verticalDramaCopy.ts`, etc. show as independently modified in `git status`,
untouched by this task). All 6 `VerticalDramaEpisodePage.*` VD test files
(48 tests) pass. `npx tsc --noEmit -p .`
(`NODE_OPTIONS='--max-old-space-size=8192'`): 140 errors total, matching this
plan file's own documented baseline exactly; zero errors inside any of this
session's edited/new files.

**Deviations from the literal task text:**

- The trigger button/dialog/row are rendered INLINE per-shot inside the
  `shots.map(...)` body (an IIFE, matching the existing character-chips
  block's own pattern a few hundred lines up) rather than as a single
  bottom-of-component dialog keyed by `referenceFrameDialogForShot` the way
  `ShotCharacterReferencePickerDialog` is mounted — chosen because Radix
  `Dialog` already portals its rendered content out of the DOM tree, so
  per-shot inline conditional mounting has no visual/layout cost and avoids
  re-deriving `shot`/`frame` for the target shot number in a second, distant
  code location.
- `onConfirmRender` returning `true` closes the dialog on SUBMIT success, not
  on render COMPLETION — consistent with how every other async VD image/video
  action in this file works (the mutation call closes/dismisses the
  triggering UI immediately; a background poller finishes the job and
  surfaces its own success/failure toast later). The task brief's step
  list ("(5) renders the image") reads as a single synchronous step, but the
  server contract (6a notes) is explicitly async (`taskId` + `media.getTask`
  polling), so this matches the ALREADY-established async convention rather
  than the brief's simplified prose.
- No dedicated `VD_REFERENCE_FRAME_CAP` constant was imported/created on the
  client (Phase 6a notes flagged that the server has no such exported
  constant) — the client mirrors the literal `10` inline in three places
  (dialog default prop, panel's cap-disable check, panel's `cap` comment),
  matching the server's own choice not to factor it out.

## Phase 7 — Chrome extension: show + drag new reference frames (2026-07-16)

User: the "SmartAIHub Marketplace Capture" extension (apps/extension) must display
the Phase-6 supplementary reference frames and support dragging them into Grok web
like the existing character/reference images.

Finding: the server payload ALREADY streams them through — `getDramaSeriesEpisodeDetailForExtension`
(verticalDramaExtensionReadService.ts) queries `vertical_drama_shot_references` and
puts every non-`grid_cut` row (incl. `source: "reference_frame"`) into each shot's
`referenceImages[]` with `source` preserved. NO server change needed.

Change (extension only, `apps/extension/src/panel/App.tsx`, drama shot render block
~5423): split `shot.referenceImages` into `source === "reference_frame"` vs the rest;
render the standard refs in the existing strip, and the reference frames in a NEW
labelled strip ("เฟรมอ้างอิงที่สร้างเพิ่ม (N) · ลากไปวางใน Grok ได้") using the SAME
`startProductionMediaDrag` markup — so they inherit the identical drag-to-Grok bridge
(dragBridge.ts already matches grok.com). Extracted a local `renderDramaReferenceCard`
helper to avoid duplicating the ~30-line card markup.

Ship: bumped EXTENSION_VERSION/manifest/package to 0.1.124 (verify script asserts the
version marker is in panel.js), ran `npm run package:web-dashboard` → verified zip at
`apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.124.zip`.
The web release route (`/api/desktop-releases/marketplace-extension/latest`) reads the
releases dir per-request and already serves 0.1.124 (confirmed live) — no web restart
needed. Users re-download/reload the extension to get it.

### Status
- [x] 7 — extension shows reference frames as a distinct drag-to-Grok row; packaged + live 0.1.124


## Phase 7b — extension bumped to 0.1.132 + fixed stale-download bug (2026-07-16)

Requested: build the extension at 0.1.132 (superseding the interim 0.1.124) and
diagnose why the dashboard showed an old version.

Diagnosis (evidence, not guessed):
- `/api/desktop-releases/marketplace-extension/latest` scans the releases dir
  live per-request with `Cache-Control: no-store` and a semver-aware sort
  (`compareDesktopReleaseVersions`) — it returned the new version correctly.
  `DesktopReleasePanel`'s hook also fetches with `cache: "no-store"`. So the
  version *display* was never cached server- or client-side; a stale render is
  browser-tab staleness (hard refresh / the panel's refresh button re-fetches).
- REAL bug: `MarketplaceCaptureConnect.tsx` "Download extension" button was a
  HARDCODED static link `href="/extension/smartspecpro-marketplace-extension.zip"`
  → HTTP 404 (the file never existed in the release pipeline). Even had it
  existed, that static path is NOT wired to the versioned release pipeline, so it
  could never reflect new builds — the classic "download page stuck on an old
  build" symptom. Fixed to `/api/desktop-releases/marketplace-extension/download`
  (always serves the latest = 0.1.132).

Shipped: bumped EXTENSION_VERSION/package.json/public/manifest.json to 0.1.132,
removed the interim 0.1.124 zip, `npm run package:web-dashboard` →
`smartaihub-marketplace-capture-extension-0.1.132.zip` (verified). Fixed the
download link, `npm run build:deploy` (atomic, no restart) — confirmed the dead
`smartspecpro-marketplace-extension.zip` string is gone from the deployed bundle,
`/latest` → 0.1.132, versioned download endpoint → HTTP 200 zip.

- [x] 7b — extension 0.1.132 live; stale hardcoded download link fixed + deployed
