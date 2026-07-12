# Vertical Drama — Skill-First Architecture (remove code-authored prompt/content logic)

## Context

Investigating why a shot's generated image had mismatched clothing between two
consecutive shots led to finding that the identity-lock instruction appended to
every image prompt was being re-appended on every render/retry, stacking up to
4 duplicate copies in one prompt (confirmed live, series 6 episode 2 shot 2 —
2,887/3,500 chars, most of it duplicate boilerplate). That bug is now patched
(idempotent strip-before-append), but the user has identified the *actual*
root cause: **this whole class of bug exists because code, not the skill's
LLM call, is authoring creative/instructional prompt content** — string
concatenation, regex rewriting, and hardcoded instruction blocks scattered
across services and one very large router file.

**Directive (verbatim intent):** the system must run through skills for
everything except UI/UX and pure data-format parsing. Prompt authoring, story
ideation, and quality evaluation are LLM decisions — never hand-coded logic.
If a skill's output is wrong or incomplete, fix `skill.md` (better
instructions/examples) or give the skill more **input** — never patch its
output with code. This is a deliberate bet: skill quality rides LLM
improvement over time; hand-coded prompt-engineering strings do not.

A 3-way parallel audit (narrative pipeline / image-video pipeline /
`verticalDramaEpisodes.ts` router) mapped every violation across the whole
Vertical Drama feature, with file:line evidence, cross-checked against two
**already-correct reference patterns already in this codebase**:

- `verticalDramaImproveScript.ts` — refactored earlier this year to trust the
  skill with minimal, non-suppressive steering. Doc comment there documents
  the real incident this fixed (a "mandatory" framing that silently
  suppressed the skill's own enrichment instruction).
- `verticalDramaEpisodeQualityReview.ts` — the clean template: code computes
  **objective facts** (density metrics, reversal counts) deterministically,
  injects them as input with "never recompute" framing, and **force-overwrites**
  only those specific objective fields afterward. The LLM authors every
  subjective verdict/score; code never invents verdict text.

Every fix in this plan follows one of those two templates.

## Binding principles for every work package

1. **`skill.md` is the sole author of creative/instructional content.** Camera
   language, lighting rules, tone/softening, role-tier appearance direction,
   repair instructions, quality verdicts — all belong in the skill's prompt
   text, not in TypeScript string literals or template concatenation.
2. **Code supplies only structured input facts** the LLM cannot know on its
   own (real DB ids, real asset URLs, an image-index↔character-name mapping,
   objective computed metrics) — as **input fields to the LLM call**, never
   appended to its output afterward.
3. **Wrong/missing skill output → fix the skill**, via better instructions or
   a concrete example (the `repair_queue`/`storyboard_handoff_json` incidents
   this session are the template: the skill's own examples never showed the
   needed shape, so the model never produced it).
4. **Legitimate parser code**: reshaping/deriving data that's already fully
   decided (e.g. rebuilding `storyboard_handoff_json.shots[]` from the
   already-validated `shots` array — pure mechanical transform, zero new
   authored prose) stays as code. Zod tolerance/coercion safety nets stay.
5. **Never persist a code-mutated version of an LLM-authored string as the
   new "source of truth."** The read-stored-prompt → mutate-via-code →
   write-back cycle is banned outright — it's what caused the compounding bug.

## Severity-ranked findings (full audit — grep-verified)

### Tier 1 — zero LLM/skill involvement at all (worst)
- **`generateStartFrameAngleVariations` grid-prompt builder**
  (`server/routers/verticalDramaEpisodes.ts:8220-8238`) — the entire 3x3
  camera-angle-grid instructional prompt (camera vocabulary, "no text in
  image" rule, consistency rules) is array+join in the router. No skill call
  authors any of it. Doc comment shows this wording was already hand-tuned
  once via a code/redeploy cycle in response to a live failure.
- **`repairShotImage` repair-prompt builder** (same file, `:8570-8578`) — the
  user's own edit instruction (`input.instruction`) is concatenated with
  code-authored wrapper sentences and sent straight to the image API. No LLM
  ever revises/authors the final repair prompt.
- **Character-lock "soften" ladder** (`shared/verticalDramaSeries/characterLock.ts`
  `applyLevel1`/`applyLevel2`, `LEVEL_1_REPLACEMENTS`/`LEVEL_2_STRIP_PATTERNS`)
  — regex word-substitution ("exactly"→"closely", strip "skin tone") on an
  already-LLM-authored prompt, to dodge image-provider content-policy
  rejections. 3+ call sites in the router (`:7710`, `:8055`, `:8581`), all
  triggered by a client-supplied `softenLevel` retry parameter — a clean
  signal that could become skill **input** instead.

### Tier 2 — character visual bible (worst duplication risk)
`server/services/verticalDramaCharacterImageGeneration.ts`:
- `ROLE_TIER_DIRECTIVES`/`ROLE_TIER_NEGATIVE_TERMS` (`:462-536`) — **verified
  duplicate**: `skills/vertical-drama-character-visual-bible/skill.md:48-108`
  already has the identical role-tier table (same child-precedence rule,
  confirmed via grep). Code re-authors the same prose and injects it as a
  "MANDATORY... authoritative" directive that **overrides** the skill's own
  judgment — two independently-maintained copies of the same creative
  content that can (and will) drift.
- `VD_SOLO_PORTRAIT_INSTRUCTION` (`:575-583`), `VD_CINEMATIC_LANGUAGE_INSTRUCTION`
  (`:596-602`) — full paragraphs of hardcoded visual-direction prose (lens
  spec, color grade, framing rules), injected verbatim into every prompt.
- Derived-prompt fallback via string concatenation (`:899-910`) —
  `turnaroundPrompt`/`fullBodyPrompt`/`expressionSheetPrompt`/`outfitSheetPrompt`
  each built as `` `${primary_portrait_prompt}, <hardcoded suffix>` `` when the
  LLM leaves the field empty — same "code invents a fallback" anti-pattern
  the `repair_queue`/`storyboard_handoff_json` incidents already taught us to
  fix via a *skill.md example*, not a code fallback.

### Tier 3 — identity-lock / preset / product-lock append pattern (systemic)
- `formatIdentityLockedImagePrompt` — 2 copies (`shared/verticalDramaSeries/characterIdentityMap.ts`
  canonical + drifted duplicate in `server/routers/verticalDramaEpisodes.ts:1307`).
  Hybrid: the character-name↔image-index mapping is legitimate ground truth,
  but the surrounding instructional sentence ("Strictly reference each
  character's exact facial identity...") is 100% code-authored and forced
  onto every prompt via append, at multiple pipeline stages, now patched
  idempotent but still architecturally a violation.
- `appendPresetVisualIdentityFragmentsToImagePrompt` / `mergePresetVisualIdentityNegativeFragments`
  (`verticalDramaStartFrameGeneration.ts:458-481`) and
  `appendPresetVisualIdentityStyleTokensToMotionPrompt`
  (`verticalDramaVideoMotionPromptGeneration.ts:291-303`) — same
  force-append-after-the-fact shape; doc comments explicitly say this is
  deliberate because the code "doesn't trust" the one-time plan LLM call to
  include the given facts.
- `mergeProductLockNegativePrompt` / `VD_PRODUCT_LOCK_INSTRUCTION`
  (`server/services/verticalDramaProductTieIn.ts:558,628`) — same pattern,
  called pervasively across the router (7+ call sites).
- `VD_CHARACTER_REF_INDEXING_INSTRUCTION` (`verticalDramaStartFrameGeneration.ts:298-299`)
  — a small authored prompting-technique sentence living in TS instead of
  skill.md.

### Tier 4 — story bible: no skill.md at all (biggest structural gap)
`server/services/verticalDramaStoryBible.ts` **never loads a skill.md** —
confirmed via grep (zero matches for `loadSkillSystemPrompt`/`parseSkillFile`
anywhere in the file). Six separate creative system prompts are hand-written
in TypeScript instead:
- `buildPrompts` (season arc + episode breakdown) — `:1086-1099`
- `buildDeepDraftPrompts` (per-shot dialogue drafting incl. dramaturgy-critic
  fields `protagonist_stake`/`world_rules`/`price_paid`/etc.) — `:2281-2307`
- `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts` (quality judge) —
  `:3624-3634`, `:3693-3703`
- `buildPremiumRevisePrompts` (feedback-driven revision) — `:3765-3820`
- `buildPremiumSweepPrompts` (cross-episode continuity check) — `:3840-3846`

**Confirmed via grep**: a purpose-built skill,
`skills/vertical-drama-season-dramaturgy-critic/skill.md`, already exists on
disk and is **never referenced anywhere in `server/`** — the exact "orphaned
skill" pattern already found once this session for the dialogue-audio-planner
skill (fixed for its repair path only; main-plan path there is legitimately
code-only per the audit).

Also: `evaluatePremiseCoverage` (`server/services/verticalDramaPresetSynthesis.ts:317-345`,
called from `verticalDramaStoryBible.ts:1201-1209`) is a hand-written
token-overlap heuristic that judges whether a draft "sufficiently reflects"
the user's premise and authors its own warning text — quality evaluation
done in code, the exact thing the directive prohibits.

### Tier 5 — script builder gaps (skill exists, missing sections)
`skills/vertical-drama-script-builder/skill.md` mentions product tie-in in
one sentence and never mentions "repair mode" at all, yet
`verticalDramaScriptGeneration.ts`'s `buildUserPrompt` (`:494-701`) fully
authors both in code: product placement-style semantics (`:587-622`) and
repair-mode behavior ("REPAIR MODE: you are REPAIRING... preserve every other
beat...", `:672-679`).

### Already correct — no action needed
- `verticalDramaEpisodeQualityReview.ts` — the template pattern (see above).
- `verticalDramaStoryboardGeneration.ts`'s `buildUserPrompt` — camera/lighting
  language is skill-owned; only facts are assembled.
- `verticalDramaVideoMotionPromptGeneration.ts`'s prompt builders — same,
  clean.
- `storyboard_handoff_json` deterministic reconstruction and
  `character_attachment_manifest` backfill (both fixed this session) — pure
  derivation of already-decided data, zero new authored prose. **Recommend
  additionally** strengthening `vertical-drama-storyboard-shotgrid/skill.md`
  with a non-empty `storyboard_handoff_json` example (the model currently
  omits it well under the token ceiling — a skill-reliability gap, same
  root-cause class as the `repair_queue` incident) so the code fix becomes a
  true belt-and-suspenders fallback, not the only thing making the field
  appear.
- `verticalDramaDialogueAudio.ts`'s main plan builder (voice binding, timing
  math, subtitle cue windows) — deterministic derivation from already-authored
  dialogue, no creative content. Leave as-is.
- `enforceEpisodeShotDraftSpeakability`/`dialogueQuality.ts` symbol-stripping
  — mechanical TTS-safety normalization (strip unspeakable symbols). Borderline
  but acceptable as a deterministic safety net; **recommend** teaching
  `skill.md` (script-builder, improve-script) to never emit these symbols via
  better examples, but do not remove the stripper — treat as a safety net,
  not a violation to eliminate.

## Phased implementation plan

Each phase is independently shippable and testable — do not start the next
until the previous is verified. Every phase follows Rule 1b: skill.md
rewrites and code deletions delegate to `ssp-backend`/`ssp-python` per work
package with a complete brief (exact file, exact lines, exact principle
being enforced), the same way this session's `repair_queue` and
`storyboard_handoff_json` fixes were delegated and independently verified.

### Phase 1 — Stop code-authored prompts with zero LLM involvement (Tier 1)
Highest risk, cheapest to fix, most obviously wrong (a human/code is
literally the only author of these prompts today):
1. **Multi-angle grid prompt** — give `vertical-drama-shot-start-frame-render`
   (or a new small skill, if a mode-switch is cleaner) a `mode: "multi_angle_grid"`
   input carrying {base shot facts, angle list, panel-count}, and let it
   author the full grid-composition instruction text itself. Delete the
   array+join builder in the router.
2. **Shot-image repair** — same treatment: the repair-prompt authoring moves
   into a skill call taking {user's edit instruction, current prompt, active
   locks (identity/product/region) as facts} as input; the skill authors the
   final repair prompt. Delete the router's manual concatenation.
3. **Soften ladder** — replace `applyLevel1`/`applyLevel2`'s regex tables
   with a `soften_level: 0|1|2` input field on the image-prompt-authoring
   skill(s), instructing it to write more conservative wording directly on
   retry (never regex-edit its own prior output). Keep the child-safety
   guard (`CHILD_SAFETY_DIRECTIVE_MARKER`) as a hard post-generation
   assertion — that one hard rule is legitimate deterministic policy, not
   content authorship. Delete `applyLevel1`/`applyLevel2`/the replacement
   tables once the skill path is verified.

### Phase 2 — Character visual bible (Tier 2)
1. Remove `ROLE_TIER_DIRECTIVES`/`ROLE_TIER_NEGATIVE_TERMS` from
   `verticalDramaCharacterImageGeneration.ts` entirely — first diff them
   against `skill.md`'s existing table line-by-line to confirm no content is
   *only* in code (if any is, port it into skill.md before deleting the code
   copy). Stop overriding the skill's own tier judgment.
2. Fold `VD_SOLO_PORTRAIT_INSTRUCTION`/`VD_CINEMATIC_LANGUAGE_INSTRUCTION` into
   skill.md as standing instructions; delete the TS constants and their
   injection call sites.
3. Replace the 4 derived-prompt string-concat fallbacks with a skill.md fix:
   add a concrete example showing `turnaround_prompt`/`full_body_prompt`/
   `expression_sheet_prompt`/`outfit_sheet_prompt` all populated (mirrors the
   `repair_queue` fix pattern exactly), and a schema/prompt instruction that
   these are never omitted. Delete the fallback concatenation once verified
   reliable across a real generation batch.
4. Convert `buildPresetVisualIdentityInstruction`'s authored connective prose
   into structured input fields (`preset.styleName`/`palette`/`wardrobeGrammar`/
   `matchedArchetype`) that skill.md is taught to weave into its own prose.

### Phase 3 — Identity-lock / preset / product-lock consolidation (Tier 3)
1. Move identity-lock authorship into the *planning-time* skill calls
   (start-frame-render, storyboard-shotgrid): add a structured
   `character_reference_index_map` input field (`[{index, characterId, name}]`)
   and teach skill.md to always end `image_prompt` with its own natural-voice
   identity-lock sentence referencing it. Once both planning skills reliably
   do this, delete `formatIdentityLockedImagePrompt` (both copies) and
   `stripExistingIdentityLockSuffix` — the render-time call sites
   (`generateStartFrameImage`/`generateStartFrameAngleVariations`) then need
   zero further text mutation; they only trim stale character refs when
   `maxReferenceImages` cuts the list, which is pure truncation of an
   already-skill-authored list, not new authored text.
2. Convert the preset-visual-identity fragment appenders and product-lock
   instruction/negative-terms into structured skill input fields the same
   way; delete the post-hoc append functions once the owning skills reliably
   incorporate them.
3. Fold `VD_CHARACTER_REF_INDEXING_INSTRUCTION` into skill.md; delete the TS
   constant.

### Phase 4 — Story bible: build the missing skills (Tier 4, largest)
This is the biggest single work package — it's authoring skill.md content
from scratch, not just moving existing prose. Recommend splitting into its
own dedicated design pass once Phases 1-3 are shipped and the "convert
inline prompt → skill.md + input fields" motion is well-practiced on smaller
stages first:
1. Activate the existing orphaned `vertical-drama-season-dramaturgy-critic`
   skill for the judge/rejudge/revise/sweep prompts (`buildPremiumJudgePrompts`
   etc.) — it may already cover most of what's needed; gap-fill only what's
   missing, don't rewrite from scratch.
2. Author a new skill (or extend an existing story one) for season-arc +
   episode-breakdown generation (`buildPrompts`) and per-shot deep-draft
   dialogue (`buildDeepDraftPrompts`), carrying the dramaturgy-critic fields
   (`protagonist_stake`/`world_rules`/`price_paid`/`antagonist_tactics`/
   `character_decisions`) as documented skill instructions instead of inline
   TS prompt strings.
3. Replace `evaluatePremiseCoverage`'s hand-written heuristic — fold premise-
   coverage self-assessment into the generation/judge skill's own output
   (ask it to report coverage as a structured field), removing the
   token-overlap heuristic and its authored warning text entirely.

### Phase 5 — Script builder gaps (Tier 5)
Add "Product Tie-In" and "Repair Mode" sections to
`skills/vertical-drama-script-builder/skill.md` (placement-style semantics,
repair-preservation contract) mirroring what's currently only in
`buildUserPrompt`. Code shrinks to supplying only the raw facts
(`product_tie_in_policy`, `repairContext`/`current_script`) as input.

## Work package assignment (per Rule 1b)

Each phase's code-deletion + skill.md-authoring work delegates to
`ssp-backend` (skill.md is plain text but lives alongside the TypeScript it
replaces, and these agents already have full context on this codebase's
skill-loading conventions from this session). Each brief must include: the
exact skill.md file, the exact code to delete and why, a concrete non-empty
example to add (never rely on an empty-array/placeholder example — that's
the proven root cause of 2 bugs already fixed this session), and instructions
to run `pnpm check` + relevant tests and report back for independent
verification before moving to the next work package within a phase.

## Verification (per phase)

1. `pnpm check` + full `pnpm vitest run` for every touched service/router
   test file (regression safety net).
2. For each converted stage, generate real content on an existing test
   series (series 6 is already mid-production with real data from this
   session) and manually confirm: (a) the skill's own output now contains
   the previously-code-authored content in its natural voice, (b) no
   duplicate/stacked boilerplate appears on repeated retries, (c) removing
   the deleted code path doesn't regress the specific bug each Tier's finding
   was evidence of (clothing continuity, grid-prompt text-in-image, repair
   instructions actually being applied, softened prompts reading naturally).
3. Write the permanent plan record to `planning/vertical-drama-skill-first-architecture/plan.md`
   per the project's Implementation Planning Protocol (this plan-mode file is
   ephemeral; the permanent one is the historical record) — first step of
   Phase 1 implementation, not before.
