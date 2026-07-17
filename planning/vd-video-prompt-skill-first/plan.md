# VD Video-Prompt: Skill-First + Reality-Grounded Redesign

Status: IMPLEMENTED (Phase 1+2+3) & DEPLOYED — 2026-07-15
Date: 2026-07-15
Owner: (naibarndotcom)

## Shipped (2026-07-15)
- Phase 1: `shotContext.canonicalShotSummary` (from deep-draft `summary`) + a
  `beatIsSilent` flag threaded into both video-prompt builders as authoritative
  facts (`AUTHORITATIVE SHOT BEAT (story overview ...)` / `SILENT BEAT (MANDATORY)`).
  Vision-off now emits `[vd_video_prompt] generated WITHOUT vision` warning.
- Phase 2: persistence pin-bug fixed — when resolved source `dialogueLines` is
  empty, `persistedDialogue = []` (LLM-invented dialogue is NO LONGER written to
  `clip.dialogue`), breaking the "silent beat becomes speaking, permanently" lock-in.
  `beatIsSilent` forces `requiredDialogue = []` at generation time too.
- Phase 3: `appendMissingDialogueVerbatim` (both paths) + render-time
  `formatVideoClipRequest` now GATED behind `promptEmbedsDialogueVerbatim` — they
  only stitch when the skill's own prose didn't already embed the dialogue
  (safety net for weak models), so a compliant skill-first prompt is trusted as-is
  (no more double-dialogue).
- skill.md (both `vertical-drama-shot-video-prompt` + `-subshots`, lowercase +
  mirrored SKILL.md): read the authoritative beat first, "reading a message" =
  silent action (not speech), honor SILENT BEAT, produce a SELF-CONTAINED final
  prompt (no reliance on post-processing).
- Tests: 157 pass across the 4 touched suites. Deployed via web restart.
- CAVEAT: shipped alongside another session's in-progress
  `resolveRequiredShotCharacterAttachmentManifest` work in the same router file
  (user approved the joint restart); that code has 11 type errors of its own,
  tolerated at runtime (tsx type-strips; project baseline already ~hundreds).

## Problem statement (user-reported)

1. The per-shot **video prompt** is not composed "skill-first" — TypeScript stitches
   dialogue/lip-sync text onto the LLM output after the fact (violates the
   skill-first rule: the prompt should be the LLM's own coherent composition).
2. The video prompt frequently **misreads the shot's real beat** — e.g. the synopsis
   says a character is *reading a message on their phone* (silent), but the video
   prompt makes them *speak it aloud*. The system appears to "guess the image" rather
   than actually read the synopsis + the real start-frame image (vision).

## Investigation findings (evidence: verticalDramaVideoMotionPromptGeneration.ts,
## verticalDramaEpisodes.ts, verticalDramaVideoPromptFormatter.ts, nativeDialogue.ts,
## the two video skill.md files)

- **Synopsis gap.** The video-prompt skill's `shotContext` carries only the terse
  **storyboard `description`** (verticalDramaEpisodes.ts:12154-12168), never the
  canonical Overview synopsis (`canonicalShotSummary` / deep-draft `summary`). That
  richer, user-edited synopsis IS threaded into the sibling *start-frame* prompt flow
  but never into the video path. So the LLM must guess "reads silently" vs "reads
  aloud" from a thin description.

- **Vision is DB-gated & silent-fallback.** `resolveShotVideoPromptModel` attaches the
  real start-frame image only when an enabled model has `supportsVision=true`
  (verticalDramaVideoMotionPromptGeneration.ts:911-931). Otherwise it silently falls
  back to *text-only* (the imagePrompt proxy) — i.e. it literally guesses the image.
  No signal to the user that this happened.

- **TRUE ROOT CAUSE of reading→speaking = a persistence/pinning bug (not wording).**
  The skill.md ALREADY says "never invent speech for a genuinely silent shot"
  (vertical-drama-shot-video-prompt/skill.md:71-76). But:
  - When a shot has no resolved source dialogue (`dialogueLines=[]`), the skill may
    invent a line on one call.
  - The router then **blindly persists that invented line** as `matchingClip.dialogue`
    (verticalDramaEpisodes.ts:12299-12307 sets `persistedDialogue = result.dialogue`
    because the "pin to resolved source" branch is skipped when `dialogueLines` is
    empty; 12373-12385 writes it into the pack).
  - On every later call, `resolveShotDialogueLines` Source 1 (2372-2374, "most
    authoritative") returns that fabricated line, and the deterministic stitching
    (`appendMissingDialogueVerbatim`, the COMPLIANCE-CORRECTION retry, and the
    independent render-time `formatVideoClipRequest`) force-quotes it verbatim with
    lip-sync — turning a one-time guess into permanent, code-enforced "the character
    speaks this line," even though the beat was silent.

- **Silence signal is fragile.** `silence_intent` only reaches the path when the
  deep-story-drafts flag is on AND that shot's deep-draft explicitly set it
  (resolveShotDialogueLines:2359-2367). Otherwise there is no silence concept at all.

- **External stitching inventory (6 sites).** #2 `appendMissingDialogueVerbatim` and
  #4 render-time `formatVideoClipRequest` are the biggest; both are **silence-unaware**
  (they react to whatever `dialogueLines`/`clip.dialogue` they're handed). #1 the
  COMPLIANCE-CORRECTION retry and #2's canonical-block exist to (a) stop weak/"nano"
  models writing "mouth moves"-style prose instead of the line, and (b) stop
  native-audio providers speaking a line twice. Removing them outright reopens those
  bugs — they are genuine safety nets, not gratuitous stitching.

## Proposed work (phased by value & risk)

### Phase 1 — Ground the skill in reality (LOW risk, directly skill-first)
1a. Thread the canonical Overview synopsis (`canonicalShotSummary` / deep-draft
    `summary`) into the video-prompt `shotContext` and into `buildShotVideoPromptUserPrompt`
    as an AUTHORITATIVE beat source (same role it plays in the start-frame flow), so the
    skill knows "reads silently" vs "speaks." No TS interpretation — just supply the fact.
1b. Surface vision fallback: when `hasVision=false`, emit a visible warning/telemetry
    ("video prompt generated without seeing the image — no vision model enabled") instead
    of silently guessing. (Actually enabling a vision model is an ops/config action.)

### Phase 2 — Fix the persistence/pinning root cause (LOW-MED risk, fixes the bug)
2a. Do NOT auto-promote LLM-invented dialogue to authoritative `matchingClip.dialogue`
    when there was no prior source dialogue. Tag such output `origin:"llm_guess"` and
    never let a guess become Source-1 authoritative on later calls (verticalDramaEpisodes.ts
    ~12299-12385 + resolveShotDialogueLines source ordering).
2b. When the synopsis/silence signal indicates a silent beat, force `dialogueLines=[]`
    and prevent invented speech from being embedded (both generation-time and the
    render-time formatter must honor silence).

### Phase 3 — Move dialogue/lip-sync composition into the skill (HIGHER risk)
3a. Let the skill compose ONE coherent prompt incl. dialogue/lip-sync (it already can
    quote verbatim). Downgrade `appendMissingDialogueVerbatim` from an UNCONDITIONAL
    override to a SILENCE-AWARE safety net that only triggers for known-weak models and
    never force-embeds when the beat is silent.
3b. Make render-time `formatVideoClipRequest` silence-aware (don't force-embed
    `clip.dialogue` for a silent beat / stale guess).
    RISK: weak-model non-compliance + native-audio double-speak regressions. Must keep a
    safety net; "pure skill-first with zero code enforcement" is not safe for the
    cheapest-model policy (see memory project_vd_weak_model_json_class).

## Verification
- Repro: a "reads phone message" shot → regenerate video prompt → expect SILENT action,
  empty dialogue, no forced verbatim line; regenerate again → stays silent (no lock-in).
- A genuine dialogue shot → still quotes verbatim once, native-audio no double-speak.
- Sub-shots (2-3 speakers) path unchanged.
- Vision on → image attached; vision off → visible warning.

## Open decision (needs user)
How far to go now: Phase 1+2 only (safe, fixes the reported bug, keeps safety nets) vs.
also Phase 3 (fuller skill-first, but risks weak-model/native-audio regressions).
