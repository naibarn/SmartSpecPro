# Feature 132: Vertical Drama Story & Character Quality Engine

Version: 0.4
Date: 2026-07-09
Status: Proposed
Owner: Vertical Drama / Skill Runtime / Storyboard Review / Data
Depends-on: 131-vertical-drama-series-storyboard-video-flow (all sections; especially §7.7 density reform, §8.2.3 async story jobs, §8.8 wizard, §9.3 character reference v2, §16.1 quality-review auto-improve loop, §16.2 season dramaturgy critic)
Source brief: user-provided "SPEC: ปรับปรุงระบบสร้างบทพูดและตรวจคุณภาพบทละครหลายตอน" (multi-pass story & dialogue quality pipeline + character image quality, 2026-07-09) — see §18 traceability

> This spec is a **new feature file continuing Feature 131**. It does NOT modify
> Feature 131's spec; 131 remains the system-of-record for the shipped pipeline.
> 132 layers a *story engineering* upgrade on top: user-defined premise, ledgers,
> scene contracts, multi-pass QC, richer scorecards, targeted revision scopes,
> continuity contracts, structured character personality, and character image
> quality — applied as **one unified criteria set** across every generate AND
> update path (story bible, deep drafts, per-episode script, quality loop, and
> character prompt generation).

---

## 0. Changelog

### [0.4] - 2026-07-09
Added §19 "Camera Angle Set Quality (Nine-Angle Cinematic Grid)" — a new,
purely additive top-level section (F132I, no changes to §1-18) upgrading the
shipped "multi-angle variations" / "สร้างหลายมุมกล้อง (3x3)" feature
(`generateStartFrameAngleVariations`, `AngleVariationPicker`,
`frames[].angleGrid`). Confirmed via codebase research this is a distinct
concept from the storyboard's 9 SEQUENTIAL shots (§6/`contactSheets.ts`) —
the angle-grid feature is 9 camera angles of ONE shot, not 9 story beats.
Adds: a structured 9-field-per-angle schema (angle name, shot size, camera
position, camera height, lens/DOF, main subject, story function, emotional
effect, continuity role); deterministic diversity rules (max 2 angles per
narrative function, ≥5 distinct functions, redundant-framing detection); a
6-dimension best-angle scoring rubric (story clarity, emotional strength,
character readability, cinematic composition, visual continuity, 9:16
suitability) that recommends without replacing the existing manual-pick UX.

### [0.3] - 2026-07-09
Post-deep-plan completeness audit pass (9 parallel spec-vs-plan comparison
agents + 1 cross-cutting agent found 2 significant + several minor gaps —
see `reviews/completeness-audit-vs-spec-round-2.md`). Spec-level clarifications
only (the plan's own section files absorbed the majority of fixes):
§13 revision-plan two-location storage split documented as deliberate;
§14.2 lists a second new skill (`vertical-drama-character-image-qc`,
discovered during Section 09's deep-plan) alongside `vertical-drama-ledger-planner`;
§16.1 clarifies `premise_drifted` requires both F132A and F132D, not F132A alone.

### [0.2] - 2026-07-09
- Review round (user questions: spoken-language ease, per-character
  memorability, contemporary lead appeal). Added: §7.1 spoken-register rule;
  §10.8 cast-level contrast (visual + voice, new finding kinds
  `cast_visually_similar` joins `voices_too_similar`); §10.2 visual-bible
  `eraStyling` + `audienceAppealNotes`; §10.6 `audience_appeal` QC dimension
  with lead-tier floor; §16.4 acceptance updates. Noted reuse of existing
  `ROLE_TIER_DIRECTIVES` lead-appeal directives
  (`verticalDramaCharacterImageGeneration.ts:435-484`).

### [0.1] - 2026-07-09
- Initial proposal. Grounded in a 3-way codebase audit (story pipeline,
  character system, creation wizard) against the shipped Feature 131 v0.5
  system. Gap analysis in §3.

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **User-defined premise (โจทย์เรื่องของผู้ใช้)** — the create wizard's step 1
   gains an optional free-form field where the user describes what the story
   should be about and in what direction. When present, the user premise is
   the **primary story spine**; the selected 1–5 genre presets become
   supporting flavor that enriches and modernizes the premise — not the other
   way around.
2. **Story engineering, not bigger context** — add explicit control structures
   (ledgers, scene contracts, story state) so long seasons (e.g. 10 episodes ×
   9 shots = 90 shots) stay coherent by *tracking*, not by hoping a large
   context window catches everything.
3. **Multi-pass QC** — split quality review into named orthogonal passes
   (Structure / Character / Evidence / Threat / Dialogue / Continuity) instead
   of one monolithic critique, and extend scorecards with the missing
   dimensions (clarity, character, evidence, threat).
4. **Targeted revision** — never regenerate the whole season for a local
   weakness. Add shot-level and line-level revision scopes to the quality
   loop, with ledger updates and re-scoring of only the revised sections.
5. **Characters with real personality** — structured personality + speech
   ("voice") profiles per character that drive dialogue generation and a
   name-blind voice-distinctness check; persisted Character Visual Bibles,
   expression sets, image QC scorecard, and a visual consistency ledger so
   characters stay recognizable across 90+ shots.
6. **One criteria set everywhere** — the same quality rules apply when the
   user presses generate for the first time, regenerates, extends the season,
   updates a single episode, runs the auto-improve loop, or generates
   character prompts. No path may bypass the criteria module (§12).

### 1.2 Non-Goals (this feature)

- No rewrite of the Feature 131 pipeline; every change is additive and
  flag-gated, reusing the existing stage pipeline, story jobs queue, memory
  system, and skills.
- No full-season regeneration triggered by QC findings; regeneration scope is
  always the minimal one that fixes the finding (§9).
- No vision-LLM image drift scoring in phase 1 (kept as an explicit deferred
  option, consistent with 131 §9.3's deferral) — phase 1 image QC is
  prompt-level + metadata-level (§10.6).
- No changes to rendering, audio mixdown, ad banners, share links, or
  publishing (131 §12.4, §13.3, §24 unaffected).
- No prompt-only solution: rules that can be checked deterministically MUST be
  checked deterministically (clue budgets, anchor-line presence, ledger
  payoff, hook-to-opening response), with LLM passes reserved for qualitative
  judgment.

---

## 2. Current System Summary (as-is anchors)

Verified against the working tree on 2026-07-09. All paths under `apps/web/`.

### 2.1 Story generation
- Entry points (tRPC `server/routers/verticalDramaSeries.ts`): `create`
  (:2899), `synthesizeGenrePreset` (:3512), `generateStoryBible` (:3682),
  `generateStoryBibleDeep` (:3765), `extendStoryDraftHorizon` (:3842),
  `updateEpisodeDraftDialogue` (:3938), `critiqueSeasonDrafts` (:4047),
  `applySeasonCritique` (:4108), `startQualityLoop` (:4197+).
- `server/services/verticalDramaStoryBible.ts`: `generateStoryBible` (:1036),
  `generateStoryBibleDeep` (:2380) with standard chunk loop and **premium**
  3-way fan-out → deterministic gates → LLM judge (8-dim scorecard
  `VD_PREMIUM_DRAFT_SCORE_DIMENSIONS` :306: hook_strength, reversal_sharpness,
  emotion_variety, dialogue_naturalness, pacing, cliffhanger_strength,
  continuity_with_recap, season_cohesion, + tie_in_naturalness) → targeted
  revise with regression guard → one-time season continuity sweep.
- Season critic: `critiqueSeasonDrafts` (:5888) = deterministic
  `analyzeSeasonDramaturgy` (:5132) + LLM skill
  `vertical-drama-season-dramaturgy-critic`; finding kinds
  `VD_SEASON_CRITIQUE_FINDING_KINDS` (:5027): protagonist_no_stake,
  world_rules_undefined, key_character_late_intro,
  character_agency_zero_decisions, antagonist_tactic_repetition,
  finale_no_price_paid, on_the_nose_dialogue, unnatural_dialogue_language,
  info_heavy_low_action, tie_in_distribution, other.
  `applySeasonCritique` (:6590) revises selected findings with regression
  guard `seasonCritiqueRevisionIntroducesNewFinding` (:6110).
- Async story jobs (`server/services/verticalDramaStoryJobs.ts`): kinds
  deep_generate | extend | season_critique | apply_critique | quality_loop;
  Redis-backed single-slot-per-series.

### 2.2 Per-episode pipeline
- 15-stage `PIPELINE_ORDER` (`server/services/verticalDramaQc.ts:160`),
  runner in `verticalDramaEpisodePipeline.ts`; script generation via skill
  `vertical-drama-script-builder`
  (`verticalDramaScriptGeneration.ts:900`, params :200 include `storySource`,
  `characters[]`, `memoryBundle`, `speech_budget`/`content_budget`).
- Series memory: `buildEpisodeMemoryBundle`
  (`verticalDramaSeriesMemory.ts:335`) — canonical facts, prior summaries,
  unresolved/resolved hooks, relationship + emotional state, tie-in fatigue,
  standing arc drift warnings. Arc drift codes in `verticalDramaArcReplan.ts`
  (:212): VD_ARC_BEATS_CONSUMED_EARLY, _HOOK_RESOLVED_EARLY, _HOOK_UNPLANNED,
  _CONTENT_BUDGET_EXCEEDED, _ESCALATION_ORDER_BROKEN, _TIE_IN_DEFERRED.

### 2.3 Quality review & auto-improve loop
- `runVerticalDramaEpisodeQualityReview`
  (`verticalDramaEpisodeQualityReview.ts:659`), scorecard v2
  (contract_version 2, :124): reversal_count, reversal_sharpness,
  emotion_variety, dialogue_naturalness, pacing, hook_strength,
  cliffhanger_strength, continuity_consistency, tie_in_naturalness, overall
  (1–5) + deterministic `density_metrics`
  (`computeVerticalDramaDensityMetrics` :423).
- Apply loop: `verticalDramaQualityReviewApply.ts`
  (`classifyQualityReviewIssueLocation` :157 maps `beat N` →
  plan_episode_script, `shot N` → storyboard_shotgrid) and
  `runVerticalDramaQualityLoop` (`verticalDramaQualityLoop.ts:172`) — bounded
  rounds, **stage-grouped** repair (not shot-scoped), regression guard,
  `VerticalDramaQualityPolicy` (minOverall 4, minPerDimension 3,
  maxAutoImproveRounds 0–3) stored as `vertical_drama_series.qualityPolicy`.

### 2.4 Characters & images
- Manual CRUD (`server/routers/verticalDramaCharacters.ts`: createCharacter
  :604) — personality/appearance live as **ad-hoc JSONB keys** in
  `vertical_drama_characters.data` (description, personality, backstory,
  identityLock, wardrobeRules) read by `extractCharacterDescription` (:355).
- Image prompts via skill `vertical-drama-character-visual-bible`
  (`verticalDramaCharacterImageGeneration.ts:812`): role-tier directives,
  child-safety guardrail (CHILD_AGE_THRESHOLD=15, Thai numeral age
  extraction), solo-portrait rule, character-lock two-tier anchors with
  soften ladder (`shared/verticalDramaSeries/characterLock.ts`), preset
  visual identity flow-through. **The visual bible output is returned but
  never persisted** (transient per call).
- Identity across shots: anchor `primary_portrait` + best-sheet second
  reference (v2, F131Z; `verticalDramaCharacterStock.ts:395`), character
  identity map block in start-frame prompts
  (`shared/verticalDramaSeries/characterIdentityMap.ts`).
- Voice casting (W12-A): `voiceConfig` (provider/model/voice/styleHints[])
  per character — **no structured speech-style profile**.

### 2.5 Creation wizard
- `client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx` (6 steps;
  step 0 = MixAndMatchPresetPanel :1032 + basic fields). `แนวเรื่อง` is
  `form.genre` — a ≤100-char label persisted to `vertical_drama_series.genre`
  (NOT a premise). Mix panel steering inputs: `businessContext`,
  `primarySelectionId`, weights; sent only to `synthesizeGenrePreset`
  (input :2555 → `verticalDramaPresetSynthesis.ts`, v1 :272 / v2 :725,
  prompt `buildUserPrompt` :198). **No free-form user-premise input exists
  anywhere** — the primary story spine is always a selected preset.
- Deep story drafts panel (`VerticalDramaDeepStoryDraftsPanel.tsx`): generate /
  extend / critique / apply / auto quality loop with job polling.
- Field limits contract:
  `shared/verticalDramaSeries/createSeriesFieldLimits.ts` guarded by
  `createSeriesFieldLimits.agreement.test.ts`.

---

## 3. Gap Analysis

| # | Spec-132 concept | Status | Evidence |
|---|---|---|---|
| G1 | User premise primary over 1–5 mixed presets | **Missing** | Only `businessContext`/`toneHint`/`primarySelectionId` steer synthesis; primary spine is always a preset (`verticalDramaPresetSynthesis.ts:198-245`) |
| G2 | Multi-pass QC (6 named passes) | Partial | Season critic covers structure/character/dialogue/world-rules in ONE call; no Evidence or Threat pass (`verticalDramaStoryBible.ts:5027,5132`) |
| G3 | Evidence Ledger | **Missing** | No clue tracking anywhere |
| G4 | Character Activation Ledger | **Missing** | Only `key_character_late_intro` + `character_agency_zero_decisions` findings (indirect) |
| G5 | Threat Ladder | **Missing** | No escalation tracking; `_ESCALATION_ORDER_BROKEN` drift code is beat-order only |
| G6 | Consequence Ledger / Thread Ledger | Partial | `unresolved_hooks` in memory bundle is loose freeform; no must-move-by / payoff tracking |
| G7 | World Rule Ledger | Partial | `worldRuleSchema` + `world_rules_undefined` exist (:418); no used-again/creates-choice/payoff tracking |
| G8 | Causal Chain Map + hook-to-opening contract | Partial | `continuity_with_recap` is *scored*, not contract-enforced; no "hook answered within first 1–2 shots" check |
| G9 | Scene Contract per shot | **Missing** | `shotDraftSchema` (:220) has summary/dialogue/silence_intent/tie_in only |
| G10 | Story State after each episode (typed) | Partial | Memory events/snapshots exist but freeform; no known-by-protagonist/audience/villain split, no threat level |
| G11 | Scorecard dims: clarity, character, evidence, threat | **Missing** | v2 scorecard lacks all four (`verticalDramaEpisodeQualityReview.ts:124`) |
| G12 | Targeted revision: shot scope | Partial | Line scope (`updateEpisodeDraftDialogue`) and stage/episode/season scopes exist; quality loop groups by stage, never by shot |
| G13 | Anchor-line rule | **Missing** | No concept in script-builder skill or QC |
| G14 | Clue-overload budget (≤1–2 new proper nouns/clues per shot) | **Missing** | Abstract-word density exists (`VD_DRAMATURGY_ABSTRACT_WORDS` :5078); no proper-noun/clue budget |
| G15 | Read-aloud test | Existing | `analyzeVerticalDramaLineSpeakability`, `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`, script-builder HARD RULE — extend, don't rebuild |
| G16 | Per-character voice/speech profile driving dialogue | **Missing** | Only free-text `voiceConfig.styleHints[]` (TTS casting) + ad-hoc `data.personality` |
| G17 | Voice distinctness (name-blind) check | **Missing** | Nothing checks that characters sound different |
| G18 | Persisted Character Visual Bible | Partial | Rich skill output generated then **discarded** (`verticalDramaCharacterImageGeneration.ts:812-909`) |
| G19 | Expression Set (structured per-emotion) | Partial | Single multi-panel `expression_sheet_prompt` via `generateCharacterSheet` (:1603) |
| G20 | Character Image QC scorecard | **Missing** | Skill frontmatter thresholds exist but are bypassed (direct LLM path); `verticalDramaPromptQc.ts` is length-QC only |
| G21 | Visual Consistency Ledger | **Missing** | Only asset state machine + stale fan-out (`verticalDramaCharacterStock.ts:177-182`); drift QC deferred in 131 §9.3 |
| G22 | Age-appropriate guardrails | Existing | Child-safety tier + negatives + soften ladder — reuse as-is |
| G23 | Anchor Portrait workflow | Existing | `primary_portrait` identity-lock + reference v2 — reuse as-is |
| G24 | Unified criteria across generate AND update | **Missing** | Rules are scattered across 5 skills + 4 services; drift between paths already visible (e.g. premium judge dims ≠ episode review dims) |

---

## 4. User Premise & Premise-Primary Preset Mix (F132A)

### 4.1 UX (Create Wizard step 1 — ตั้งค่าพื้นฐาน)

Add an optional multi-line field to the **right column** of step 0 (the
"ข้อมูลพื้นฐาน" grid in `CreateSeriesWizard.tsx:708-753`), directly above
`เรื่องย่อ (logline)`:

- Label: `โจทย์เรื่องที่อยากได้ (ไม่บังคับ)`
- Placeholder: `อยากได้เรื่องเกี่ยวกับอะไร แนวไหน เกิดที่ไหน ตัวเอกเป็นใคร ปมหลักคืออะไร — ระบุเท่าที่อยากกำหนด ที่เหลือให้ AI ช่วยเติม`
- Helper text: `ถ้าระบุ ระบบจะใช้โจทย์ของคุณเป็นแกนเรื่องหลัก แล้วนำ preset ที่เลือก (1–5 แบบ) มาผสมเพื่อเสริมความเข้มข้นและความร่วมสมัย`
- `<Textarea>` (4 rows), max 2,000 chars.
- The mix panel (left) shows a small badge when a premise is present:
  `ใช้โจทย์ของคุณเป็นแกนหลัก — preset ที่เลือกจะเป็นตัวเสริม` so the
  premise-primary rule is visible at the moment of pressing
  `ให้ AI ผสมเป็น Preset`.

Distinctness from existing fields (MUST hold to avoid duplication):
- `แนวเรื่อง` (`form.genre`) stays a short label/tag (≤100 chars, series
  metadata column). Unchanged.
- `เรื่องย่อ (logline)` stays the *finished one-line summary* (an output the
  user can edit). Unchanged.
- `userPremise` is **creative intent input** — constraints and desires fed to
  AI *before* generation. When synthesis or story-bible generation runs, the
  produced logline/mainPlot must *satisfy* the premise; the premise itself is
  never overwritten by preset application (`applyPreset`/`applyPresetDraft`
  must not touch it).
- Mix panel `ธุรกิจ/ร้าน/บริการ` (businessContext) stays the tie-in business
  hint. Unchanged.

### 4.2 Schema & threading

1. `WizardState` + `INITIAL_WIZARD` (`CreateSeriesWizard.tsx:52-79,:81`): add
   `userPremise: string`.
2. `CREATE_SERIES_FIELD_LIMITS`
   (`shared/verticalDramaSeries/createSeriesFieldLimits.ts:11`): add
   `userPremise: 2000` (agreement test updates automatically enforced).
3. `createSeriesInput` (`verticalDramaSeries.ts:2516`): add
   `userPremise: z.string().trim().max(2000).optional()`. Persist into
   `bible.userPremise` (no migration; `bible` is jsonb).
4. `synthesizeGenrePresetInput` (:2555): add `userPremise` (same shape).
5. `SynthesizeVerticalDramaPresetParams` (:129) and `...V2Params`
   (`verticalDramaPresetSynthesis.ts:523`): add `userPremise?`; thread into
   `buildUserPrompt` (:198-245) and the V2 counterpart, and through both
   procedure call sites (`verticalDramaSeries.ts:3566-3577`, `:3640-3656`).
6. `handleCreate` (:335) and `handleSynthesizePreset` (:287) send the field.
7. Story generation: `generateStoryBible` (:1036) and
   `generateStoryBibleDeep` (:2380) read `bible.userPremise` and render it in
   their prompts as a dedicated `USER PREMISE (PRIMARY)` section ahead of
   preset/bible content. `extendStoryDraftHorizon` inherits it via the same
   bible read.

### 4.3 Premise-primary blending rule

Skill `vertical-drama-preset-synthesizer` gains a conditional instruction
block (rendered only when `userPremise` is non-empty):

```text
USER PREMISE (PRIMARY SPINE):
{{userPremise}}

Blending rules when a user premise is present:
- The user premise is the primary story spine. Setting, protagonist, core
  conflict, and direction stated by the user are non-negotiable.
- The selected presets (1-5) are supporting flavor: use them to intensify
  drama, sharpen tropes, add contemporary texture, and fill gaps the user
  left open. Do not let any preset displace a premise-stated element.
- primarySelectionId, when also provided, selects which preset contributes
  the strongest *flavor*, not the spine.
- If a preset directly conflicts with the premise, keep the premise and
  record the dropped preset element in `warnings`.
- The synthesized draft's logline and mainPlot must be traceable to the
  premise: a reader comparing them side by side must see the user's story.
```

When `userPremise` is empty, behavior is byte-for-byte identical to today
(preset spine via `primarySelectionId`), so the flag-off and empty-premise
paths coincide.

Deterministic guard (server-side, after synthesis and after
`generateStoryBible*`): `evaluatePremiseCoverage(premise, draft)` — keyword /
entity overlap heuristic that warns (never blocks) when the draft appears to
have ignored the premise; surfaces as a `warnings[]` entry the UI already
renders for synthesis drafts.

### 4.4 Series without a wizard premise

`updateSeries` (bible patch path) accepts `bible.userPremise` edits so a
premise can be added or refined after creation; the Deep Story Drafts panel
shows the active premise (read-only preview with an edit affordance linking
to series settings) so the user can see what spine drives generation.

---

## 5. Ledgers & Story State (F132B)

### 5.1 Placement & lifecycle

Ledgers are **versioned with the breakdown** (they describe a specific season
draft): stored on `StoredBreakdownVersion` (`verticalDramaStoryBible.ts:1137`)
as a new optional `ledgers` object, mirrored to `bible.ledgers` for the
active version (cheap read for UI + memory bundle). Story state per episode
is appended to the existing memory system as a new
`memoryKind: "story_state"` event with a typed payload, and projected into
`vertical_drama_memory_snapshots.memory.storyState`.

Lifecycle:
1. **Build** — a new `ledger_plan` step inside the `deep_generate` job runs
   after outline/before per-episode drafting (new job progress phase
   `ledger`). One LLM call (skill `vertical-drama-ledger-planner`, new §14.2)
   seeded from bible + breakdown; deterministic post-parse validation.
2. **Update** — after every deep-draft chunk, `applySeasonCritique`, quality
   loop round, `updateEpisodeDraft*`, and arc replan apply, a deterministic
   `reconcileLedgers` pass re-derives per-episode observations (which clues
   appear where, which characters act, threat events) from the drafts and
   marks ledger rows stale/satisfied. LLM is NOT needed for reconciliation.
3. **Consume** — ledger excerpts are rendered into: deep-draft chunk prompts,
   `vertical-drama-script-builder` memory section, QC pass prompts (§8), and
   the revision planner (§9).

### 5.2 Ledger schemas (zod, in `shared/verticalDramaSeries/qualityLedgers.ts` — new)

```text
evidenceLedger[]: { id, label, kind: person|object|place|date|rule|threat|other,
  introducedEpisode, mustPayoffByEpisode?, usedInEpisodes[], usedBy?,
  changesDecision: boolean, payoffEpisode?, status: planned|introduced|used|paid_off|orphaned }

characterActivationLedger[]: { characterKey, role, firstMentionEpisode?,
  firstAppearanceEpisode?, firstActionEpisode?, firstPlotImpactEpisode?,
  requiredActivationByEpisode  // default: ceil(totalEpisodes/2) = midpoint
  , missingEpisodes[], status: activated|weak|dormant }

threatLadder[]: { episode, threatLevel (1-10 non-decreasing intent),
  threatEvent, causedBy?, costToProtagonist, escalates: boolean }

consequenceLedger[]: { episode, keyEvent, immediateConsequence,
  mustBeFollowedInEpisode, riskIfIgnored, status: open|followed|dropped }

threadLedger[]: { id, question, openedEpisode, status: active|escalated|answered|deferred,
  mustMoveAgainByEpisode, expectedPayoffEpisode?, lastMovedEpisode }

worldRuleLedger[]: { id, rule, introducedEpisode, usedAgainEpisodes[],
  createsChoice: boolean, payoffEpisode?, verdict: keep|revise }
  // upgrade of existing worldRuleSchema (verticalDramaStoryBible.ts:418) — same rows, richer tracking

causalChainMap[]: { episode, causedByPrevious, mainEvent,
  consequenceForcingNext, endingHook, requiredNextOpeningResponse }
```

### 5.3 Story State (per episode, typed)

```text
storyState: { episode,
  knownByProtagonist[], knownByAudience[], knownOnlyByAntagonist[],
  evidenceGained[], evidenceLostOrDamaged[],
  trustChanges[{ from, to, direction }],
  emotionalResidue[{ characterKey, residue }],
  threatLevel, unresolvedThreadIds[],
  requiredNextEpisodeResponse }
```

Written by `summarizeEpisodeToMemory` (extended) and by the deep-draft
continuity sweep; consumed by `buildEpisodeMemoryBundle`
(`verticalDramaSeriesMemory.ts:335`) which renders it as a structured
`story_state` block ahead of the freeform facts (existing freeform memory is
kept — story state supplements, not replaces).

### 5.4 Deterministic ledger checks (feed QC passes in §8)

- Evidence: orphaned clue (introduced, never used), convenience clue (used
  with `changesDecision:false` everywhere), payoff overdue.
- Activation: character not activated by `requiredActivationByEpisode`;
  mentioned-only characters.
- Threat: non-escalating stretch > 2 episodes; no cost recorded for an
  episode; antagonist idle > 2 episodes.
- Consequence/Thread: `mustBeFollowedInEpisode`/`mustMoveAgainByEpisode`
  passed without movement; hook not answered in next episode's opening
  (cross-checked with §7 scene contracts: first 1–2 shots of episode N must
  reference `requiredNextOpeningResponse` of N-1).
- World rule: rule never used again or `createsChoice:false` → verdict
  `revise`.

These run inside `analyzeSeasonDramaturgy` as new deterministic finding
kinds (§8.2), so they automatically flow through the existing critique →
apply → regression-guard machinery.

---

## 6. Scene Contracts (F132C)

### 6.1 Schema

Extend `shotDraftSchema` (`verticalDramaStoryBible.ts:220`) with an optional
`contract` object (optional for backward compatibility with stored drafts;
required for new generation when the flag is on):

```text
contract: {
  storyFunction,            // one clear function
  emotionalBeat,            // one beat
  audienceTakeaway,         // what the viewer must retain
  tensionSource,            // conflict/pressure in this shot
  newClueIds[],             // refs into evidenceLedger; deterministic max 2
  dialoguePurpose,
  characterDecision?,       // if a decision happens here
  continuityDependency?,    // what earlier fact this shot relies on
  anchorLine?: boolean      // marks this shot as carrying an anchor line (§7.2)
}
```

### 6.2 Generation & enforcement

- Deep drafts: the per-chunk prompt (standard AND premium) instructs the
  model to emit `contract` per shot. Premium deterministic gates
  (`meetsPremiumDraftFloor` path) add: every shot has a contract; ≤2
  `newClueIds`; ≥1 anchor-line shot per 3 shots; episode's shots collectively
  cover want/obstacle/choice/cost (mapped from contracts + beats).
- Episode pipeline: `plan_episode_script` → script builder receives the
  active breakdown's contracts for its episode and must honor them;
  `storyboard_shotgrid` carries `contract` through to shots so start-frame
  and video prompts can bind emotional beats (§10.7).
- `validateStagePayload` (`verticalDramaEpisodePipeline.ts:799`) gains
  contract presence/shape checks for the two stages above (flag-gated).
- Update paths (`updateEpisodeDraft`, `updateEpisodeDraftDialogue`,
  `repairStageOutput`, quality-loop repairs) preserve contracts; a repair
  that changes a shot's dialogue must keep the contract or explicitly emit an
  updated one.

---

## 7. Dialogue Quality Rules v2 (F132D — shared criteria; see §12)

All rules live in one shared criteria module (§12) rendered into
`vertical-drama-script-builder`, deep-draft prompts, and the Dialogue QC pass.
Existing speakability machinery (G15) is extended, not replaced.

### 7.1 Rules (prompt-level)

```text
- Mystery must be understandable, not merely vague. Every abstract/poetic/
  symbolic line must be grounded by a clear line before or after it.
  Max 1 poetic/mysterious key line per shot unless the scene contract's
  storyFunction explicitly requires ritual/dreamlike speech.
- Dialogue reveals pressure, not plot summary. A line carrying information
  must also carry emotion, fear, doubt, urgency, resistance, or intention.
  Never merely describe what the visual already shows.
- Clue budget: ≤1-2 new important names/objects/dates/lore terms per shot;
  every new clue gets minimal context (what it is, why it matters, what to
  remember). New clues must map to contract.newClueIds.
- Anchor lines: at least one per 2-3 shots — a simple, direct, speakable line
  that consolidates what the audience should understand so far (who the
  clues point to / what changed / how the threat grew / what to follow next).
- Read-aloud: one main idea per spoken line; split long/dense/explanatory
  lines (extends the existing speakability HARD RULE).
- Spoken register (ภาษาพูด ไม่ใช่ภาษาเขียน): dialogue must use the natural
  spoken register of the series locale — for Thai: natural particles
  (สิ/นะ/ล่ะ/เหรอ) where the character's speech profile allows, contractions
  and ellipsis as real speakers use them, no written-essay connectives
  (อย่างไรก็ตาม, ดังนั้น, เนื่องจาก) in casual speech, and formality level
  matched to the relationship between speakers. A line that reads like
  narration or a news report is a violation even if it is short and clear.
  (Deterministic assist: written-register connective blocklist per locale
  feeds the existing `unnatural_dialogue_language` finding.)
- Distinct voices: every line must be consistent with the speaker's speech
  profile (§7.3); with names removed, major characters should remain
  identifiable by rhythm, word choice, and attitude.
```

### 7.2 Deterministic checks (extend density metrics)

`computeVerticalDramaDensityMetrics` (`verticalDramaEpisodeQualityReview.ts:423`)
gains: `new_proper_noun_count_per_shot` (Thai+English NER-lite heuristic +
`contract.newClueIds` cross-check), `anchor_line_gap` (max consecutive shots
without an anchor-marked shot), `abstract_line_ungrounded_count` (reuse
`VD_DRAMATURGY_ABSTRACT_WORDS` per line, flag lines with no adjacent plain
line). All force-overwritten onto the LLM card like existing density metrics.

### 7.3 Character speech profiles (F132F)

New typed object in `vertical_drama_characters.data.speechProfile`
(schema in `shared/verticalDramaSeries/speechProfile.ts` — new):

```text
speechProfile: {
  speakingSpeed: slow|measured|fast,
  vocabularyLevel: simple|everyday|educated|archaic,
  emotionalDefault,               // e.g. "quiet worry beneath curiosity"
  typicalSentenceLength: short|medium|long,
  metaphorUsage: no|rarely|yes,
  commonLineFunction,             // e.g. "asks the question the audience has"
  forbiddenStyle[],               // e.g. ["philosophizing", "exposition dumps"]
  signaturePhrases[]?             // optional, sparing
}
```

- **Generation**: a new `characterProfilesFromBible` step (one LLM call via
  the ledger-planner skill or a dedicated prompt inside it) proposes speech
  profiles + structured `personality` for all bible characters at
  deep-generate time; the wizard's step 3 (ตัวละคร) and the character stock
  panel expose them for editing. `seedCharactersFromDraft`
  (`verticalDramaSeries.ts:2928`) carries preset `charactersJson` profiles
  when presets define them.
- **Consumption**: `GenerateEpisodeScriptParams.characters[]`
  (`verticalDramaScriptGeneration.ts:200`) is extended to include
  `speechProfile`; script-builder renders a per-character voice card;
  `vertical-drama-dialogue-audio-planner` maps `emotionalDefault`/speed into
  per-line delivery hints; TTS `voiceConfig.styleHints` may be pre-seeded
  from the profile at casting time (suggestion only).
- **Check**: the Dialogue QC pass (§8) includes a name-blind voice
  distinctness spot check: sample N exchanges, strip speaker names, ask the
  judge to attribute; attribution below threshold → `voices_too_similar`
  finding (new kind).

---

## 8. Multi-Pass QC & Scorecard v3 (F132D)

### 8.1 Pass architecture

The season critique (`critiqueSeasonDrafts`) becomes a **multi-pass runner**
while keeping its job kind, polling UI, findings/apply UX, and regression
guard unchanged:

```text
Pass order (each = deterministic checks + one focused LLM call):
1. Structure Pass   — episode function, want/obstacle/choice/cost, hook specificity
2. Character Pass   — activation ledger, agency, weight vs role, disappearances
3. Evidence Pass    — evidence ledger: orphans, convenience, resistance, payoff
4. Threat Pass      — threat ladder: escalation, cost, antagonist pressure cadence
5. Dialogue Pass    — §7 rules incl. anchor lines, clue budget, voice distinctness
6. Continuity Pass  — causal chain, hook-to-opening, knowledge/emotional residue,
                      story-state contradictions, world-rule consistency
```

- Flag-off (or `qualityPolicy.multiPass=false`): single-call behavior is
  preserved exactly (today's critic).
- Each pass prompt receives ONLY the ledger slices + draft excerpts relevant
  to it (keeps prompts small; §3.2 of the source brief: "ตรวจแยก pass ดีกว่า
  ตรวจรวมครั้งเดียว").
- Deterministic ledger checks (§5.4) run first and are merged into that
  pass's findings, mirroring the existing `analyzeSeasonDramaturgy` + LLM
  merge pattern.
- New finding kinds appended to `VD_SEASON_CRITIQUE_FINDING_KINDS`:
  `evidence_orphaned`, `evidence_no_resistance`, `evidence_no_payoff`,
  `threat_not_escalating`, `antagonist_idle`, `clue_overload`,
  `missing_anchor_line`, `voices_too_similar`, `cast_visually_similar`,
  `hook_not_answered_in_opening`,
  `decision_without_consequence`, `thread_stalled`, `episode_replaceable`,
  `knowledge_continuity_break`, `emotional_residue_reset`,
  `premise_drifted` (G1 guard, only when userPremise present).
- Existing kinds remain valid; the season critique UI (findings list with
  kind chips) needs only new kind labels in `verticalDramaCopy.ts`.

### 8.2 Continuity Pass specifics

Implements source-brief §15.13's checklist. Deterministic core:
- `hook_not_answered_in_opening`: episode N's shots 1–2 (summary + contract
  continuityDependency) must reference episode N-1's
  `requiredNextOpeningResponse` (lexical/entity match heuristic; LLM
  confirms borderline cases).
- `episode_replaceable`: an episode whose causal chain row has empty
  `causedByPrevious` AND `consequenceForcingNext` → structural finding.
- knowledge/emotional residue: diff story states N-1 → N; a fact in
  `knownByProtagonist[N-1]` that a character re-asks in N without an
  in-story reason → `knowledge_continuity_break`.

### 8.3 Episode scorecard v3

`qualityReviewScorecardSchema` (`verticalDramaEpisodeQualityReview.ts:124`)
gains `contract_version: 3` adding (1–5 like existing):
`clarity` (first-listen understandability), `character_consistency`
(profile adherence + activation), `evidence_payoff` (clue discipline),
`threat_escalation`. Premium draft judge
(`VD_PREMIUM_DRAFT_SCORE_DIMENSIONS`, `verticalDramaStoryBible.ts:306`) gains
the same four so deep-draft and per-episode scoring finally share one
dimension vocabulary (fixes the drift noted in G24).
`VerticalDramaQualityPolicy` per-dimension floors apply unchanged
(minPerDimension covers new dims automatically; per-dimension overrides
allowed in the policy jsonb).

Severity taxonomy attached to every finding (used by §9):
`minor | moderate | major | structural`.

---

## 9. Targeted Revision Engine v2 (F132E)

### 9.1 Revision plan (typed)

Every QC output (season critique findings AND episode quality review issues)
is normalized into a revision plan entry:

```text
{ issueId, episode, shot?, lineRef?, problemKind, severity,
  evidenceFromDraft, whyItWeakens, fixStrategy,
  affectedLedgers[], needsRegeneration: boolean,
  scope: line | shot_dialogue | full_shot | episode_beat | episode_outline | cross_episode }
```

### 9.2 Scope execution

| Scope | Mechanism |
|---|---|
| line | existing `updateEpisodeDraftDialogue` path, driven by the plan (auto or one-click) |
| shot_dialogue / full_shot | **new**: quality loop + `applySeasonCritique` gain shot-scoped repair — `classifyQualityReviewIssueLocation` already extracts `shot N`; instead of regenerating the whole `storyboard_shotgrid` stage, the repair prompt carries ONLY the target shot(s) + adjacent context + relevant ledger slices, and splices results back (`composeQualityReviewRepairInstruction` extended) |
| episode_beat / episode_outline | existing stage-level repair (`plan_episode_script`) — unchanged |
| cross_episode | existing `applySeasonCritique` + arc replan — unchanged |

Rules (from source brief §3.3/§9): never widen scope silently; a `structural`
severity finding is the only thing allowed to escalate scope, and it
surfaces to the user for approval (consistent with the existing retcon
approve/reject UX). After any revision: `reconcileLedgers` (§5.1), re-score
**only** the revised episode(s), regression guard as today
(`escalated_regression` semantics unchanged).

### 9.3 Quality loop integration

`runVerticalDramaQualityLoop` (`verticalDramaQualityLoop.ts:172`) orders work
per round: line fixes → shot fixes → stage fixes (cheapest first), and the
round budget (`maxAutoImproveRounds`) is unchanged. Loop status vocabulary
unchanged.

---

## 10. Character Personality & Image Quality (F132F visual parts: F132G)

### 10.1 Structured personality

`vertical_drama_characters.data` gains typed sub-objects (zod in
`shared/verticalDramaSeries/characterProfile.ts` — new; existing ad-hoc keys
remain readable for legacy rows):
`personality { keywords[], emotionalBaseline, want, fear, contradiction }`,
`speechProfile` (§7.3), `visualBible` (§10.2), `consistencyLedger` (§10.5).
`extractCharacterDescription` (`verticalDramaCharacters.ts:355`) is extended
to render the typed fields first, then legacy keys.

### 10.2 Persisted Character Visual Bible

The `vertical-drama-character-visual-bible` skill output
(`visual_identity_summary`, `identity_anchors`, `signature_wardrobe`,
`hair_makeup_notes`, `performance_energy`, `consistency_strategy`, prompts)
is **persisted** into `data.visualBible` with `{ version, createdAt, model }`
on every `generateCharacterVisualPrompts` run
(`verticalDramaCharacterImageGeneration.ts:812` — currently discards it).
Additions to the bible template (from source brief §16.3, plus review round):
`signatureVisualCues[]`, `colorPalette`, `storyWorldRelationship`,
`forbiddenDrift[]`, `emotionalRangeNeeded[]`, `ageRange`, and for adult
lead/villain tiers `eraStyling` + `audienceAppealNotes` — contemporary hair,
wardrobe, and styling direction that makes the lead read as
current-era-attractive (สวยหล่อตามยุคสมัย) for the target audience region and
genre, derived from the preset visual identity + user premise era. These
*extend* the existing `ROLE_TIER_DIRECTIVES` appeal language
(`verticalDramaCharacterImageGeneration.ts:435-484` — heroine "natural
beauty with strong screen presence", male lead "magnetic, cold-CEO energy",
villains "dangerously attractive") with era/genre specificity; they never
override the child-safety tier, whose precedence is unchanged.
Subsequent image generations (portrait, turnaround, sheet, start-frame
identity map) read the stored bible instead of regenerating identity from
scratch, and only regenerate the bible on explicit user action or when
`identityLock`-relevant fields change (reusing the existing stale fan-out).

### 10.3 Prompt structure priority

`buildUserPrompt` (:706) reorders/labels blocks to the source-brief §16.2.2
order: identity → age → face/hair/body/wardrobe → personality & emotional
identity → signature cues → story-world connection → cinematic rendering →
guardrails. Existing guardrails (child-safety, solo-portrait, character-lock,
preset visual identity, negative-merge) are untouched (G22/G23 reuse).

### 10.4 Expression Set

`generateCharacterSheet` grows a structured mode: given
`visualBible.emotionalRangeNeeded[]` (default 8: neutral, curious, startled,
listening, quietly sad, scared-but-steady, determined, relieved), generate a
labeled expression set (either one composed sheet with labeled panels —
cheapest, default — or N individual assets behind a sub-flag). Assets carry
role `expression_set` and per-emotion metadata; the best-sheet picker
(`pickBestCharacterSheetAsset`, `verticalDramaCharacterStock.ts:226`) learns
the new role (priority after turnaround).

### 10.5 Visual Consistency Ledger

`data.consistencyLedger`: `{ anchorAssetId, approvedAgeRange,
faceIdentityNotes, hairIdentityNotes, wardrobeBase, colorPalette,
signatureCues[], allowedVariations[], forbiddenDrift[],
entries[{ assetId, generatedAt, issues[], verdict: ok|drift|revise }] }`.
Written on every character-asset generation/import/approval; the entries'
`issues` come from §10.6 QC. Identity-relevant edits already trigger stale
fan-out — the ledger records *why*.

### 10.6 Character Image QC (phase 1: prompt + metadata level)

New deterministic + LLM-text scorecard run at prompt-preview time
(`previewCharacterPrompt` :981) and post-generation (metadata only):
dimensions `character_identity, story_world_fit, emotional_precision,
age_appropriateness, visual_consistency, reusability, cinematic_quality,
prompt_compliance, audience_appeal` (1–10, source brief §16.7 + review
round). `audience_appeal` asks: for an adult lead/villain tier, does this
prompt produce a face and styling with enough contemporary screen magnetism
(ตามยุคสมัยปัจจุบัน) to hook a vertical-drama audience — or merely a correct,
consistent, but plain character? Scored against `eraStyling`/
`audienceAppealNotes` + the role-tier directive; N/A for child and
support tiers. Phase 1 scores the **prompt**
against the stored visual bible + guardrails (LLM text judging — no vision);
an anchor-portrait prompt must score ≥8 on identity, age, story-world fit,
and reusability — and, for adult lead tiers, ≥8 on audience_appeal — before
the render button is enabled (soft-block with
override, consistent with preview-then-spend UX). Vision-based scoring of the
rendered image stays deferred (131 §9.3 note) as an explicit phase-2 flag.

### 10.7 Scene contract → visual bible binding

Start-frame prompt assembly (`verticalDramaStartFrameGeneration.ts:283-297`)
adds, per character in shot: signature cues + wardrobe base + palette from
the stored visual bible, and the shot's `contract.emotionalBeat` mapped
through `emotionalRangeNeeded` (nearest expression). Rule (source brief
§16.10): scene prompts may vary action/framing/emotion/environment but must
not change approved identity, age, base hair, or core wardrobe without an
explicit story reason carried in the contract.

### 10.8 Cast-level contrast (review round)

Per-character consistency is not enough — characters must also be distinct
**from each other** so the audience never confuses them across 90 shots:

- **Visual contrast**: when the ledger planner (§14.2) proposes visual
  bibles for the cast, it receives all cast members together and must
  differentiate silhouettes, hair, palette, and signature cues between
  characters of the same role tier/gender. A deterministic check compares
  stored visual bibles pairwise (palette overlap, wardrobe-base similarity,
  hair descriptor overlap); high similarity between two major characters →
  new Character Pass finding kind `cast_visually_similar` with a suggested
  differentiation (fed to §9 at scope `full_shot`-equivalent for character
  assets: revise the weaker character's bible + regenerate its anchor, never
  both).
- **Voice contrast**: the §7.3 name-blind distinctness check is run on the
  cast as a whole (already specified) — `voices_too_similar` names the
  specific character pair and which profile axis to separate (speed,
  vocabulary, sentence length, or line function).
- Both checks respect identity locks: differentiation proposals may not
  contradict an approved anchor portrait; they surface as suggestions
  requiring user approval when an anchor already exists.

---

## 11. Unified Criteria Application (the "เงื่อนไขเดียวกันทั้งหมด" rule)

New shared module `server/services/verticalDramaQualityCriteria.ts` (+ prompt
fragments under `shared/verticalDramaSeries/qualityCriteria.ts`) is the
single source of: dialogue rules text (§7.1), scene-contract requirements
(§6), episode dramaturgy rules (want/obstacle/choice/cost, escalation,
activation), clue budget constants, anchor-line cadence, scorecard dimension
definitions, and severity taxonomy.

Every path MUST consume it (enforced by an agreement test that greps the
criteria version marker in each consumer's built prompt):

| Path | Entry point |
|---|---|
| Preset synthesis | `synthesizeVerticalDramaPreset[V2]` |
| Story bible (shallow) | `generateStoryBible` |
| Deep drafts (standard + premium, incl. judge) | `generateStoryBibleDeep` |
| Season extension | `extendStoryDraftHorizon` |
| Season critique + apply | `critiqueSeasonDrafts` / `applySeasonCritique` |
| Auto quality loop | `runVerticalDramaQualityLoop` |
| Per-episode script (generate/regenerate/repair) | `generateEpisodeScript` via runStage/regenerateStage/repairStageOutput |
| Episode continuation | `generateNextEpisodesViaLlm` |
| Manual draft edits | `updateEpisodeDraft`, `updateEpisodeDraftDialogue` (validation on save) |
| Episode quality review | `runVerticalDramaEpisodeQualityReview` |
| Character prompts (portrait/sheet/start-frame) | `generateCharacterVisualPrompts`, start-frame assembly |
| Dialogue audio planning | dialogue-audio-planner prompt |

Version note: the criteria module carries `criteriaVersion`; scorecards and
run artifacts stamp the version used, so mixed-version seasons are auditable.

---

## 12. Feature Flags

| Flag | Gates | Default |
|---|---|---|
| F132A `verticalDramaUserPremise` | §4 premise field + premise-primary synthesis + premise sections in story prompts | off |
| F132B `verticalDramaQualityLedgers` | §5 ledgers + story state + deterministic ledger checks | off |
| F132C `verticalDramaSceneContracts` | §6 contracts in drafts/pipeline validation | off |
| F132D `verticalDramaMultiPassQc` | §7 dialogue rules v2 + §8 multi-pass critique + scorecard v3 | off |
| F132E `verticalDramaTargetedRevisionV2` | §9 shot-scoped revision + revision plan | off |
| F132F `verticalDramaCharacterProfiles` | §7.3 + §10.1 structured personality/speech profiles | off |
| F132G `verticalDramaCharacterVisualQuality` | §10.2–10.7 persisted bible, expression set, image QC, consistency ledger | off |
| F132H `verticalDramaContinuityContracts` | §8.2 causal chain / hook-to-opening enforcement | off |
| F132I `verticalDramaAngleGridQuality` | §19 structured 9-angle schema, diversity/coverage rules, best-angle scoring rubric | off |

Dependency order: F132B before F132D/F132E/F132H (passes need ledgers);
F132C before F132E shot scope (splice needs contracts); F132F before the
voice-distinctness check in F132D. F132I is independent of F132A–H — it
gates a different pipeline stage (start-frame angle-set generation) with no
ledger/contract/premise dependency, though it MAY read `contract` fields
from F132C when present (see §19.2). Flags live in the existing tenant flag
group (`client/src/components/admin/tenantFeatureFlagGroups.ts`).

---

## 13. Persistence & Migration

- **No new tables required.** All new structures live in existing jsonb:
  `vertical_drama_series.bible` (userPremise, ledgers mirror),
  `StoredBreakdownVersion.ledgers` (inside bible.breakdownVersions),
  `vertical_drama_characters.data` (personality, speechProfile, visualBible,
  consistencyLedger), memory events (`memoryKind: "story_state"`), run
  artifacts (pass outputs, revision plans, image QC cards — new stage tags
  `qc_pass_<name>`, `revision_plan`, `character_image_qc`).
- Optional (defer until read patterns demand it): promote ledgers to a
  `vertical_drama_quality_ledgers` table near `schema.ts:21039`. Not needed
  for v1; jsonb keeps the Database Safety Protocol footprint at zero
  migrations.
- All schemas additive + optional → old rows parse unchanged; contract_version
  discriminates scorecards (existing v1/v2 pattern).
- **Revision plans (§9) use a deliberate two-location split**, not one uniform
  artifact location, discovered during deep-plan (v0.3 clarification):
  episode-scoped revision plans (`line`/`shot_dialogue`/`full_shot`/
  `episode_beat`/`episode_outline` scope) store as a run-artifact `jsonPayload`
  with `stage: "revision_plan"`, tied to that episode's active `runId`
  (`vertical_drama_run_artifacts.episodeId`/`runId` are NOT NULL, which fits
  this case cleanly). `cross_episode`-scoped revision plans (spanning
  multiple episodes) do NOT fit that NOT NULL shape and instead store as a
  sibling `revisionPlan` key alongside `lastCritique` on the active
  breakdown version's jsonb — mirroring how season-critique results are
  already stored. Both are jsonb-additive; no migration in either case.

---

## 14. Skills: changed & new

### 14.1 Changed (prompt + schema additions, all backward-compatible)
- `vertical-drama-preset-synthesizer` — premise-primary block (§4.3)
- `vertical-drama-script-builder` — criteria fragment, speech-profile voice
  cards, scene-contract honoring, anchor-line/clue-budget rules
- `vertical-drama-season-dramaturgy-critic` — becomes pass-parameterized
  (pass name + ledger slice in input; one skill, six invocations)
- `vertical-drama-episode-quality-review` — scorecard v3 dims + new density
  metrics passthrough
- `vertical-drama-character-visual-bible` — extended output (signature cues,
  palette, story-world relationship, forbidden drift, emotional range),
  §16.2.2 prompt block order
- `vertical-drama-series-memory-planner` — story-state aware compaction
- `vertical-drama-dialogue-audio-planner` — speech-profile → delivery mapping
- `vertical-drama-storyboard-shotgrid` — carry scene contracts through

### 14.2 New
- `vertical-drama-ledger-planner` — builds ledgers + causal chain + character
  speech/personality proposals from bible + breakdown (one call at
  deep-generate; incremental mode for extend)
- `vertical-drama-character-image-qc` (added during deep-plan, v0.3
  clarification) — the §10.6 Character Image QC scorer: deterministic
  pre-checks + one focused LLM-judge call scoring a character image PROMPT
  (never the rendered image — vision-based scoring stays deferred per this
  spec's §1.2/§10.6 and 131 §9.3) against the character's persisted Visual
  Bible and role-tier guardrails on the 9 §10.6 dimensions. Kept as a
  separate skill from `vertical-drama-character-visual-bible` so QC
  threshold/prompt iteration never risks touching the bible-generation
  skill's tested output contract.

---

## 15. Rollout Phases

| Phase | Content | Flags |
|---|---|---|
| 1. Prompt-level | criteria module + dialogue rules v2 into script-builder & deep drafts; premise field UI + synthesis threading | F132A, criteria core |
| 2. Structured intermediates | scene contracts; ledger planner + storage; story state events | F132B, F132C |
| 3. Multi-pass QC | six passes; scorecard v3; new finding kinds; deterministic ledger checks | F132D, F132H |
| 4. Targeted revision | revision plan normalization; shot-scoped repair; loop ordering | F132E |
| 5. Character quality | profiles; persisted visual bible; expression set; image QC; consistency ledger; contract→bible binding | F132F, F132G |

Each phase independently shippable and testable; ordering matches the source
brief's roadmap (§17 of the brief).

---

## 16. Acceptance Criteria

### 16.1 Premise (F132A)
- With no premise: synthesis + creation byte-identical to today.
- With a premise + 3 presets: synthesized draft's logline/mainPlot visibly
  derive from the premise; conflicting preset elements land in `warnings`.
- Premise survives preset apply, series update, deep generate, extend.
- **`premise_drifted` finding requires BOTH F132A and F132D enabled**
  (clarified v0.3): the deterministic coverage guard (`evaluatePremiseCoverage`,
  F132A-only) produces a `warnings[]` entry at synthesis time; the
  `premise_drifted` season-critique *finding kind* is registered and detected
  under F132D (§8.1's multi-pass critique), reusing the same coverage
  heuristic against later-drafted episode content. With F132A alone
  (F132D off), only the synthesis-time warning fires — not a
  `premise_drifted` finding.

### 16.2 Story quality (F132B–E, H)
- Every episode has want/obstacle/choice/cost derivable from contracts+beats;
  threat or consequence increases every episode (ladder check).
- Major characters activated before midpoint or a Character Pass finding
  fires; evidence introduced is tracked to use/payoff or flagged.
- Hook of episode N-1 answered in first 1–2 shots of N, or
  `hook_not_answered_in_opening` fires; removing any episode breaks the
  causal chain (`episode_replaceable` fires otherwise).
- Scorecard v3 shows per-dimension weakness per episode; a revision plan
  entry always names a scope; a dialogue-only weak episode is fixed at
  shot/line scope with structure intact and continuity unbroken
  (verified by re-running Continuity Pass on neighbors only).
- Ledgers and story state update after every revision; re-score touches only
  revised episodes.

### 16.3 Dialogue (F132D, F)
- Anchor-line cadence ≥1 per 3 shots (deterministic metric ≥ threshold);
  new-proper-noun budget respected; ungrounded abstract lines flagged.
- Read-aloud violations (existing speakability + new one-idea-per-line)
  reported per line with fixes; name-blind attribution of sampled exchanges
  meets the distinctness threshold or `voices_too_similar` fires.

### 16.4 Characters & images (F132F, G)
- Every lead has structured personality + speech profile consumed by script
  builder (visible voice cards in prompt artifacts).
- Visual bible persisted before any portrait render; anchor-portrait prompt
  gated at ≥8/10 on identity/age/story-world/reusability (+ audience_appeal
  for adult lead tiers); expression set generated for leads; consistency
  ledger records every asset with verdict; start-frame prompts carry
  signature cues + contract emotional beat.
- Adult leads carry `eraStyling`/`audienceAppealNotes` in their visual bible
  and score ≥8 audience_appeal; two major same-tier characters with
  near-identical palette/hair/wardrobe trigger `cast_visually_similar`.
- Dialogue in Thai series uses spoken register (particle/contraction usage,
  no written-essay connectives in casual speech) — register violations
  surface via `unnatural_dialogue_language`.
- Child-safety and character-lock behavior unchanged (regression tests).

### 16.5 System
- All §11 paths stamp `criteriaVersion`; agreement test fails if any consumer
  drops the criteria fragment.
- Flag-off = current behavior for every path (snapshot tests on built
  prompts and schemas).

---

## 17. Test Plan

1. **Unit**: ledger schemas + reconcile; clue-budget/anchor-gap/proper-noun
   metrics (Thai + English fixtures); premise coverage heuristic; scope
   classifier (line/shot/stage); contract validation in
   `validateStagePayload`; speech-profile rendering; criteria agreement test.
2. **Integration (mock LLM)**: deep generate 10 episodes × 9 shots with
   contracts + ledgers; force lowest-scoring episode → verify revision plan
   scopes, shot-splice repair, ledger reconciliation, neighbor-only re-score;
   critique multi-pass fan-out returns merged findings with correct kinds;
   hook-to-opening violation fixture fires; premium judge floor covers the
   four new dims.
3. **Character**: visual bible persistence round-trip; image QC gate blocks
   below-floor anchor prompt and allows override; expression-set role enters
   best-sheet priority; legacy `data` rows (no typed fields) still render
   prompts identically.
4. **UI (vitest)**: wizard premise field (limits, badge, no clobber on preset
   apply — extend `CreateSeriesWizard.test.tsx`); drafts panel premise
   preview; new finding-kind chips + scorecard v3 rows; revision-plan scope
   labels (extend `VerticalDramaDeepStoryDraftsPanel.*.test.tsx`).
5. **Source-brief test cases** (brief §14): TC1 dialogue clarity, TC2
   10×9 full run, TC3 evidence payoff, TC4 threat escalation, TC5 targeted
   revision — each mapped to an integration fixture above.

---

## 18. Traceability to source brief

| Brief section | Spec section |
|---|---|
| §3 หลักคิด (context ≠ control, multi-pass, targeted fix) | §1.1(2–4), §8, §9 |
| §4.1–4.6 dialogue problems | §7 |
| §4.7–4.10 activation / drama engine / threat / world rules | §5.2, §5.4, §8 |
| §5 data structures (Bible/Map/Ledgers/Contract/State) | §5, §6 |
| §6 workflow | §5.1 lifecycle, §11 |
| §7 multi-pass QC | §8.1 |
| §8 scorecard + severity | §8.3 |
| §9 targeted revision plan | §9 |
| §10 prompt instruction รวม | §11 criteria module |
| §11 acceptance criteria | §16 |
| §12–13 codebase inspection + gap analysis | §2, §3 |
| §14 test plan | §17 |
| §15 continuity & causal logic | §5.2 (causal/consequence/thread), §8.2, F132H |
| §16 character image quality | §10 |
| §17 roadmap | §15 |
| User request #1 (user-defined premise + preset mix) | §4 |
| User request #2 (criteria on every generate/update + character prompts) | §11 |
| User request #3 (structured 9-angle cinematic camera set + best-angle scoring) | §19 |

---

## 19. Camera Angle Set Quality (Nine-Angle Cinematic Grid)

### 19.1 Scope & distinctness — this is NOT the same "9 shots" as §6

This section upgrades the **existing, shipped** "multi-angle variations"
feature — the "สร้างหลายมุมกล้อง (3x3)" ("Generate multiple camera angles
(3x3)") button in the episode workspace, backed by
`generateStartFrameAngleVariations` (`server/routers/verticalDramaEpisodes.ts`),
rendered/picked in `VerticalDramaStoryboardPanel.tsx`'s `AngleVariationPicker`
UI, and persisted as `frames[].angleGrid` in
`shared/verticalDramaSeries/contracts.ts`. This feature already generates
**one 3×3 grid image containing 9 different camera angles of the SAME
shot/moment**, splits it into 9 candidate tiles client-side
(`lib/imageGridSplitter.ts`), and lets the user manually pick one tile as
that shot's start frame.

**This is a distinct concept from §6's Scene Contracts and the codebase's
other "9" — the storyboard's 9 SEQUENTIAL story shots** (9 different beats
across time, batched into a 3×3 grid purely for generation efficiency, per
`shared/verticalDramaSeries/contactSheets.ts` and 131 §7.5). The two "3×3
grid" concepts are already named distinctly in the codebase (the router's
own doc-comment on `generateStartFrameAngleVariations` explicitly
distinguishes them) — this section must not conflate them, and any
implementation must not touch `contactSheets.ts` or the
`vertical-drama-storyboard-shotgrid` skill, which govern the *other* 9.

**Current gap** (confirmed by reading the shipped code): the angle-grid
feature has (a) no structured per-angle schema — one prompt string with
inline example angle names (`wide establishing shot, medium shot, close-up,
over-the-shoulder, low angle, high angle, dutch angle, extreme close-up,
three-quarter profile`), not 9 individually-described panels; (b) no
enforcement that the 9 angles avoid redundant narrative function; (c) no
guaranteed functional coverage (an LLM could easily emit 5 close-ups and 4
establishing shots, all valid individually but a weak SET); (d) no
best-angle scoring — selection is 100% manual click, with zero guidance.

### 19.2 Structured per-angle schema (9 required fields per angle)

Extend `frames[].angleGrid` (`contracts.ts`) with a new optional
`candidates?: AngleGridCandidate[]` array (9 entries when populated),
alongside the existing `imageUrl`/`pendingTaskId`/`dismissedIndexes`
envelope (kept, unchanged, for backward compatibility with already-generated
grids that have no structured data):

```text
AngleGridCandidate {
  index: number,                // 0-8, matches the tile position in the grid
  angleName: string,             // e.g. "over-the-shoulder", "low-angle hero"
  shotSize: string,               // e.g. "medium close-up", "wide establishing"
  cameraPosition: string,         // free text, e.g. "behind character A's shoulder"
  cameraHeight: string,           // e.g. "eye-level", "low, looking up", "high, looking down"
  lensDepthOfField: string,       // e.g. "shallow DOF, subject isolated", "deep focus"
  mainSubject: string,            // which character/object this angle centers on
  storyFunction: AngleStoryFunction, // enum, see §19.3
  emotionalEffect: string,        // e.g. "isolates her vulnerability", "heightens threat"
  continuityRole: string,         // what this angle must stay consistent with
                                  // (e.g. "matches shot 4's eyeline", "establishes the
                                  // object's position for the reveal in shot 7")
}
```

`storyFunction` is a closed enum (`AngleStoryFunction`, §19.3), not free
text — this is what the diversity/coverage rules in §19.3 validate against
deterministically. All other fields are free text (LLM-authored, not
schema-constrained) since they describe cinematography choices, not
structural facts.

When Section 04's Scene Contracts (F132C) are present on the shot, the
angle-grid generation prompt SHOULD read `contract.emotionalBeat`/
`contract.tensionSource` as context for `emotionalEffect`/`storyFunction`
authoring — soft dependency, degrades to no cross-check when F132C is off or
the shot has no contract (mirrors the `null`-safe convention already
established for `contract` consumers elsewhere in this spec).

### 19.3 Diversity & mandatory functional coverage

`AngleStoryFunction` enum (9 named narrative functions, matching the user's
required palette):

```text
establishing_context | character_relationship | emotional_close_up |
over_the_shoulder_interaction | clue_object_insert | tension_angle |
reaction_shot | story_hook_frame | protagonist_identity_frame
```

Rules (deterministic, checked after generation — never left to prompt-only
hope, consistent with this spec's overall design principle in §1.2):

```text
- No more than 2 of the 9 angles may share the same storyFunction value.
- The 9-angle set must include a BALANCED MIX across the 9 named functions —
  not every function must appear in every set (a given shot may not call for
  a "clue/object insert," for example), but the set must show clear variety:
  at minimum, no single function may account for more than 3 of the 9 angles,
  and at least 5 distinct storyFunction values must appear across the 9.
- Redundant framing check: two angles with the same storyFunction AND highly
  similar shotSize + cameraPosition text (near-duplicate framing) is flagged
  even if the 2-per-function cap is technically satisfied — the intent is
  variety of COVERAGE, not just variety of labels.
```

A set that fails these checks produces a `warnings[]` entry (never blocks
generation or spends extra credit) — same warn-never-block posture as
§4.3's `evaluatePremiseCoverage` and other deterministic guards in this
spec.

### 19.4 Best-angle scoring (recommendation, not auto-replacement of user choice)

The existing picker UX (`AngleVariationPicker` — user clicks a tile, it
becomes the approved start frame) is **preserved unchanged**. This section
adds a scoring layer that surfaces a "แนะนำ" (recommended) badge on the
highest-scoring tile, so the user's manual choice is informed, not replaced
— consistent with this codebase's established "always human-approves before
spend" pattern (the same posture as §10.6's soft-block-with-override image
QC gate).

Each of the 9 candidates is scored (1–10) on exactly the six dimensions the
user specified — no others, and never "which is prettiest" as a standalone
criterion:

```text
story_clarity | emotional_strength | character_readability |
cinematic_composition | visual_continuity | vertical_9_16_suitability
```

The scoring pass may be deterministic-assisted (e.g. `visual_continuity`
cross-checks `continuityRole` text against the prior approved shot's known
state, similar in spirit to §8.2's causal-chain checks) plus one LLM-judge
call per angle set (not per individual angle — one call scoring all 9
candidates together, so relative judgments like "clearest for this story
moment" are comparative, not isolated). The recommended angle is the
highest total score; ties broken toward the candidate whose `storyFunction`
is currently under-represented in the season (reuses Section 03's
`characterActivationLedger`-style "coverage so far" thinking if F132B is on,
degrades to a simple tie-break when it is off).

**Explicitly forbidden as the sole selection criterion** (per the user's own
requirement): choosing the "best" angle by aesthetic beauty alone, with no
reference to the six dimensions above.

### 19.5 Generation & enforcement — files affected

- `apps/web/skills/vertical-drama-shot-start-frame-render/skill.md` (+
  `references/input_contract.md`/`output_contract.md`,
  `prompts/system.prompt.md`) — extend the per-shot start-frame prompt this
  skill already produces (which `generateStartFrameAngleVariations` wraps
  into the 3×3 grid instruction) to require the 9-field structured
  description per panel and the §19.3 diversity/coverage instruction,
  flag-gated on F132I.
- `server/routers/verticalDramaEpisodes.ts` — `generateStartFrameAngleVariations`:
  parse the LLM's structured 9-candidate response (not just the grid image),
  run the §19.3 deterministic diversity checks, run the §19.4 scoring pass,
  persist both onto `frames[].angleGrid.candidates[]`.
- `shared/verticalDramaSeries/contracts.ts` — add `AngleGridCandidate`,
  `AngleStoryFunction` schemas and the `candidates?`/`scores?`/
  `recommendedIndex?` fields on `angleGrid`, all optional (existing
  `imageUrl`-only grids from before F132I parse unchanged).
- `client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  + `AngleVariationPicker` — render the recommended-badge, and (optional,
  UI-detail) a hover/expand affordance showing a tile's 9-field description
  and scores; the underlying click-to-approve flow is unchanged.
- No changes to `contactSheets.ts`, `VerticalDramaContactSheetPicker.tsx`,
  or `vertical-drama-storyboard-shotgrid` — those govern the unrelated
  9-sequential-shots concept (§19.1).

### 19.6 Schema / migration notes

No new tables, no migration — `AngleGridCandidate[]`/scores are additive
optional fields inside the existing `frames[].angleGrid` jsonb envelope on
`vertical_drama_episodes`, following the same jsonb-only convention as every
other Feature 132 addition (§13).

### 19.7 Acceptance Criteria (extends §16)

- With F132I off: `generateStartFrameAngleVariations`'s prompt and the
  `angleGrid` schema are byte-identical to today — no structured fields, no
  scoring, existing manual-pick UX unchanged.
- With F132I on: every generated 9-angle set has a `storyFunction` recorded
  per angle; no function appears more than 2 times; at least 5 distinct
  functions appear across the 9; a violation produces a `warnings[]` entry,
  never a block.
- Every angle carries all 9 structured fields (§19.2); none are silently
  blank.
- The recommended angle is derived from the six named scoring dimensions
  (§19.4), never from aesthetic judgment alone — verified by a test
  asserting the scoring prompt never asks for a "prettiest"/"most
  beautiful" judgment without the six dimensions attached.
- The existing 9-sequential-shots storyboard feature (§19.1's "other 9") is
  provably untouched — no shared files edited, confirmed by a regression
  test on `contactSheets.ts`'s existing test suite.
