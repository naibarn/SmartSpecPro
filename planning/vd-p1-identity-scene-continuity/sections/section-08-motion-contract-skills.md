<!-- SECTION: section-08-motion-contract-skills -->

# Section 08 — Motion-contract skill rules, anti-morph negatives, judge dimension, draft-time guidance

## Current-worktree override (binding)

Every new clause, including bulk and drafting guidance, activates only from an
explicit runner fact such as `motion_contracts: enabled`; attached images alone are
not activation. The judge consumes structured risk/observability facts. P1 adds no
language-dependent prompt matching and no obsolete two-call assertion.

**Feature:** VD P1 / Feature 137 (identity stability), Step 2 — the *authoring* half.
**Flag:** `verticalDramaMotionContracts` (tenant flag, default `false`).
**Depends on:** section-06 (`motion_profile` contract + `effectiveRisk` on the results), section-07 (`frame_analysis` observability fields + widened request gate). Both must be **merged and green** before this section starts.
**Blocks:** section-14 (joint verification, real-LLM gate).
**Parallel with:** nothing in Step 2 — it is the last Step 2 section by construction.

All paths are relative to `apps/web/` unless noted. Line anchors were verified at HEAD `941547ff1`; sections 01/06/07 all edit the RUNNER, the ROUTER and the two per-shot skill files before this section runs, so **locate every anchor by symbol name or adjacent literal, never by line number**.

RUNNER = `server/services/verticalDramaVideoMotionPromptGeneration.ts` (3911 lines at baseline).

---

## 1. What this section delivers

Sections 06 and 07 built the *data path*: the skill is asked for `motion_profile` and per-person observability, the answers are parsed leniently, a deterministic `effectiveRisk` is derived and persisted. **Nothing yet changes a single word of any rendered video prompt.**

This section is where the declarations start doing work:

| # | Deliverable | Where |
|---|---|---|
| 1 | Risk-scaled **motion contract** authoring rules under the existing `## MOTION PROFILE + MOTION CONTRACT` header | `skills/vertical-drama-shot-video-prompt/{skill.md,SKILL.md}` |
| 2 | Same rules, sub-shot/segment-aware | `skills/vertical-drama-shot-video-prompt-subshots/{skill.md,SKILL.md}` |
| 3 | **Anti-morph negatives**, family-shaped (grok gets positive phrasing — it never receives a negative prompt) | both per-shot skills' `negative_motion_prompt` rule (rule 7) |
| 4 | Identity-preserving motion guidance for the bulk pack — **prose only, no new output field** | `skills/vertical-drama-video-motion-prompt-pack/{skill.md,SKILL.md}` |
| 5 | One scored **judge dimension** + the fact-sheet contents paragraph | `skills/vertical-drama-video-prompt-judge/{skill.md,SKILL.md}` |
| 6 | `effectiveRisk` + a compact per-person observability summary on `VdVideoPromptCandidateFactSheet` | RUNNER `:3037-3047`, built `:3061-3100`, 6 call sites |
| 7 | A conditional `motion_profile:` line in the per-candidate judge block | RUNNER `buildJudgeUserPrompt` `:3162-3173` |
| 8 | Draft-time continuity guidance | `skills/vertical-drama-storyboard-shotgrid/{skill.md,SKILL.md}` and `skills/vertical-drama-full-story-architect/skill.md` (**lowercase only — no twin**) |
| 9 | Real-file gate assertions for every skill touched (taught-not-wired guard) | extends section-06's gate file + one new file |

**TypeScript changes are limited to items 6 and 7.** No new request lines, no new params on the generators, no new LLM calls, no change to `pickBetterCandidateByHardFacts`. Everything else is skill markdown.

---

## 2. Dependencies and hand-offs

### Consumed from section-06

```ts
// RUNNER — frozen literal; the skill section header must keep this exact name
export const VD_MOTION_PROFILE_SKILL_SECTION_NAME = "MOTION PROFILE + MOTION CONTRACT";

// Both generator result interfaces (single + speaker-switch twin)
motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
effectiveRisk?: VdIdentityRisk;   // mirror, undefined together with motionProfile
```

Section-06 already authored the `motion_profile` JSON contract entry **and the declaration semantics** (what `start_facing` / `end_facing` / `turn_magnitude` / `reveals_hidden_side` / `camera_motion` / `identity_risk` mean) under that header in both per-shot skills. **Section-08 appends rules under the same header — it does not create a second header and does not restate the declaration semantics.**

### Consumed from section-07

The normalized, camelCased observability shape reaching `result.frameAnalysis`:

```ts
{
  people: Array<{
    name: string; position: string;
    facing?: string; eyesVisible?: string; occlusion?: string;
    faceSize?: string; overlappedByOtherFace?: boolean;
  }>;
  positionSource?: string;
  facesSeparated?: boolean;
}
```

Section-07 also authored the observability field *definitions* inside `## FRAME ANALYSIS FIRST`. Section-08 does not repeat them; it references them.

### Handed to section-14

- The frozen skill literals in §4 — section-14's real-LLM gate asserts a live model actually emits a `motion_profile` and a contract-shaped prompt against these.
- The judge fact-sheet key names `effectiveRisk` / `faceObservability`, which the judge skill quotes verbatim.

---

## 3. Background an implementer needs

**The pipeline.** Per shot: an LLM (RUNNER + a markdown *skill* used verbatim as the system prompt) reads the shot's approved **start frame** and writes a video motion prompt; a paid video model then animates that start frame (image-to-video). Identity drift happens when the clip's motion turns a head and the video model has to invent the side of the face the start frame never showed — and invents a different person.

**Skill-first (standing product directive).** All creative wording lives in `skills/*/skill.md`. TypeScript supplies only *facts* (`- family: veo`, `- negative_prompt_supported: no`, `- motion_profile: REQUIRED …`). **Never write creative prose, thresholds, or phrasing rules in TypeScript.** This section adds no new facts — the facts it needs already exist:

| Fact already emitted by `buildTargetVideoModelFactBlock` | Added by |
|---|---|
| `- family: grok \| veo \| seedance \| other` | shipped |
| `- negative_prompt_supported: yes \| no` (RUNNER `:1326`, from `videoPromptFamilySupportsNegativePrompt`, false for grok only) | shipped |
| `- frame_analysis: REQUIRED …` / `- frame_observability: REQUIRED …` | section-07 |
| `- motion_profile: REQUIRED …` | section-06 |

**The skill scales the contract on its OWN declarations, not on `effectiveRisk`.** This is the single most important thing to understand before writing the rules. `effectiveRisk = max(skill's own identity_risk, deterministic floor)` is computed by TypeScript **after** the generation call returns. It is therefore *not available to the writer during writing*. The writer scales its contract on what it can see: the observability it just read from the image and the turn/camera it is about to direct. `effectiveRisk` exists downstream, for (a) persistence/audit and (b) the judge — which is exactly what catches a writer that under-declared. There is no second generation pass keyed on `effectiveRisk` in P1, and adding one is out of scope.

**Skill text changes are unconditional — and that is accepted house practice.** `skill.md` is the system prompt for every tenant regardless of flag. The shipped precedent is `## NATIVE AUDIO DIRECTION (conditional — only when the caller states native_audio: true …)`: the section exists for everyone, the *activation* is the caller's fact line. Every rule this section adds must be phrased the same way — conditioned on a fact the caller states (`motion_profile: REQUIRED`, `frame_observability: REQUIRED`, `negative_prompt_supported: no`, or "when start-frame images are attached"). **Do not attempt to gate a skill file itself.** With the flag off, none of the activation facts appear, so the rules stay dormant.

**The judge's `scores[]` is never read by code.** Only `winner_index`, `verdict` and `repair_instruction` are consumed (RUNNER `:3433`/`:3436`/`:3454`; `judgeOutputSchema` `:2989-2996` types `scores` as `z.array(z.object({}).passthrough())`). A dimension added only to the judge skill is **decorative**. It becomes real only because the judge is *shown* the deterministic facts to score against — which is item 6/7 of this section.

**Prompts are Thai *or* English** depending on the episode's language setting. Any check of the form "does the candidate's text assert a preserved facial angle" is substring matching over free prose in an unknown language and would be silently wrong in one of them. See §8.4.

---

## 4. Frozen literals (the real-file gates key on these — do not paraphrase)

Author the surrounding prose in your own words, in the voice of the surrounding skill, but these exact strings must appear:

**(a) Per-shot skill + subshots twin** — two sub-headers *inside* section-06's existing `## MOTION PROFILE + MOTION CONTRACT …` section:

```
### Writing the motion contract — scale it to what you declared
### Anti-morph negatives — family-shaped
```

**(b) Bulk pack skill** — one new top-level section:

```
## IDENTITY-PRESERVING MOTION — MANDATORY when start-frame images are attached
```

**(c) Judge skill** — one craft bullet whose first phrase is frozen, and which names the two fact-sheet keys verbatim:

```
- **Honors the motion contract its own frame reading demands.**
```
and, inside that bullet, the literal tokens `effectiveRisk` and `faceObservability`.

**(d) Storyboard shot-grid skill** — one new top-level section:

```
## Identity-safe shot boundaries — MANDATORY
```

**(e) Full-story architect skill** — the same header text, so one grep covers both draft-time surfaces:

```
## Identity-safe shot boundaries — MANDATORY
```

**(f) Fact-sheet key names** (TypeScript; the judge skill quotes them): `effectiveRisk`, `faceObservability`, `facesSeparated`.

---

## 5. Files touched

| File | Change |
|---|---|
| `skills/vertical-drama-shot-video-prompt/skill.md` + `SKILL.md` | contract rules (§7.1), anti-morph negatives (§7.3) |
| `skills/vertical-drama-shot-video-prompt-subshots/skill.md` + `SKILL.md` | same, segment-aware (§7.2, §7.3) |
| `skills/vertical-drama-video-motion-prompt-pack/skill.md` + `SKILL.md` | prose-only identity-preserving motion section (§7.4) |
| `skills/vertical-drama-video-prompt-judge/skill.md` + `SKILL.md` | craft dimension + fact-sheet contents paragraph (§7.5) |
| `skills/vertical-drama-storyboard-shotgrid/skill.md` + `SKILL.md` | draft-time guidance (§7.8) |
| `skills/vertical-drama-full-story-architect/skill.md` | draft-time guidance — **no `SKILL.md` twin exists; do not create one** (§7.8) |
| `server/services/verticalDramaVideoMotionPromptGeneration.ts` | fact-sheet fields + builder inputs + 6 call sites + judge per-candidate line (§7.6, §7.7) |

**Also owned by this section (hand-offs the audit found orphaned):**

1. The storyboard skill's **lighting-variety same-scene exception** (§7.8(b)) — spec
   138 §2.3's aggravator on the *drafting* side; section 11 §6 fixes only the render
   side.
2. A one-paragraph note in `skills/vertical-drama-shot-start-frame-render/skill.md`
   (the skill section 11 §6 already edits — coordinate, do not double-edit the file)
   telling the authoring LLM that **an attached image may be the previous frame of
   this same scene**, labeled with section 12's
   `formatSceneContinuityVisionLabel` literal
   (`Scene continuity reference (shot N): same scene, same lighting, same set`), and
   that such an image is a continuity reference for set/light/wardrobe — not the
   shot's own composition. Without this, section 12's carefully-labeled attachment is
   an unexplained extra image. **Practical ordering:** section 11 edits that file
   first; this section appends. Assert the literal in file A.

**Not touched (deliberate):** `pickBetterCandidateByHardFacts`, `findPositionAnchorIssues`, `projectMotionPromptPack`, any zod schema, any router file, any generator param interface, `judgeOutputSchema`.

---

## 6. Tests first (TDD)

Run **always from `apps/web`** (`cd apps/web && npx vitest run <file>`); from the repo root vitest globs the monorepo and dies on an unreadable directory. Never pipe a vitest run through `tail` — it truncates the FAIL block.

**Put new assertions in the files named below.** Gate A (7 suites, 266/266, zero tolerance) must stay interpretable for section-14 — do not add tests inside those files except where explicitly stated.

**Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that queues `…Once` values must `mockReset()` those mocks first, or one early throw poisons the rest of the file.

### 6.1 Test files

| id | Path | Status | Copy its header from |
|---|---|---|---|
| A | `server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts` | **extend** (created by section-06) | already in place |
| B | `server/services/__tests__/verticalDramaJudgeMotionContractFacts.test.ts` | **new** | `server/services/__tests__/verticalDramaJudgedShotVideoPromptGeneration.test.ts` (mock header `:1-105`, `mockExecute`, and its `extractUserText(call[0])` helper at `:170`) |
| C | `server/services/__tests__/verticalDramaDraftContinuityRealSkillFile.test.ts` | **new** | zero-mock file-reading test; it imports **no** service module, so it needs no `vi.mock("fs")` at all — just `node:fs` + `node:path` |

### 6.2 File A — real-file gates for the four video-prompt-side skills

```
describe("motion contract rules — per-shot + subshots")
  Test: both skill.md files contain "### Writing the motion contract — scale it to what you declared"
  Test: both contain "### Anti-morph negatives — family-shaped"
  Test: both sub-headers sit INSIDE the `## MOTION PROFILE + MOTION CONTRACT` section
        (index-of ordering assertion: section header < sub-headers < next `## `)
  Test: the anti-morph rule names each required negative concept at least once
        (orbit, profile-to-frontal, occlusion/overlap, re-interpretation, sudden
         expression change) — assert on stable single tokens, not whole sentences
  Test: the anti-morph rule states the grok/no-negative-channel fallback in terms of
        the `negative_prompt_supported` fact (assert that literal token appears
        inside the anti-morph sub-section)
  Test: the contract rule states that a LOW-risk shot adds nothing
        (assert the literal guard phrase chosen in §7.1 bullet 5)
  Test: skill.md and SKILL.md remain byte-identical for BOTH skills
        (already asserted by section-06 — must stay green after this section's edits)
  Test: neither skill lost any pre-existing REQUIRED_SECTION_HEADER
        (MODEL-FAMILY SHAPING, FRAME ANALYSIS FIRST, CAMERA & EMOTION GRAMMAR)

describe("bulk pack skill — rules without a contract")
  Test: the pack skill.md contains "## IDENTITY-PRESERVING MOTION — MANDATORY when start-frame images are attached"
  Test: the pack skill.md still declares NO "frame_analysis" in its JSON contract  (P1 asymmetry)
  Test: the pack skill.md declares NO "motion_profile" anywhere                    (P1 asymmetry)
  Test: pack skill.md and SKILL.md are byte-identical

describe("judge skill dimension")
  Test: the judge skill.md contains the frozen bullet lead
        "- **Honors the motion contract its own frame reading demands.**"
  Test: that bullet lives under "### 3. Craft" (ordering assertion), NOT under
        "### 2. Correctness gates" — a missing motion contract must never force a
        paid repair round (see §8.3)
  Test: the judge skill.md contains the literal tokens "effectiveRisk" and "faceObservability"
  Test: the judge skill's fact-sheet intro paragraph mentions identity risk /
        observability (assert the literal phrase added in §7.5)
  Test: judge skill.md and SKILL.md are byte-identical

describe("taught-not-wired cross-check (code <-> skill)")
  Test: buildTargetVideoModelFactBlock(flag on) still quotes
        VD_MOTION_PROFILE_SKILL_SECTION_NAME, and that literal is a real `## ` header
        in both per-shot skills  (section-06 assertion — must stay green)
  Test: every fact-sheet key the judge skill names verbatim ("effectiveRisk",
        "faceObservability") appears in a fact sheet actually produced by the code
        → build one via the orchestrator capture in file B, or assert on the
          serialized judge prompt fixture exported from that test
```

### 6.3 File B — judge fact sheet + judge prompt wiring

`buildCandidateFactSheet` and `buildJudgeUserPrompt` are **module-private and must stay private**. Test them the way the shipped judged suite does: mock `executeWithFallback`, run `generateJudgedVerticalDramaShotVideoPrompt`, and capture the judge call — it is the one whose user text contains `--- CANDIDATES ---`.

```
describe("fact sheet carries the motion facts")
  Test: flag ON + a candidate whose motion_profile resolved ⇒ the judge prompt's
        FACT SHEET JSON contains "effectiveRisk" with the resolved value
  Test: flag ON + observability present on frame_analysis ⇒ FACT SHEET contains
        "faceObservability" with one entry per person that HAS observability data
  Test: a person with NO observability field is omitted from faceObservability
  Test: "facesSeparated" is carried when present and the key is ABSENT otherwise
  Test: effectiveRisk in the fact sheet === result.effectiveRisk for the same candidate
        (no second derivation — the fact sheet must reuse, never recompute)

describe("per-candidate motion_profile line")
  Test: flag ON ⇒ each CANDIDATE block emits exactly one `motion_profile: {…}` line,
        immediately after its `frame_analysis:` line
  Test: a candidate with no motion_profile emits NO motion_profile line at all
        (not `motion_profile: null`)

describe("flag-off byte-identical judge prompt")
  Test: flag OFF ⇒ the captured judge user prompt is character-for-character equal to
        a fixture captured before this section (no "effectiveRisk", no
        "faceObservability", no "motion_profile" token anywhere)
  Test: flag OFF ⇒ JSON.stringify(factSheet) has exactly today's key set
        (undefined-valued keys must be OMITTED, not serialized — see §7.6)
  Test: removing the motion_profile line from the flag-on judge prompt reproduces the
        flag-off judge prompt byte-for-byte
        (withFlag.replace(`${line}\n`, "") === without)

describe("no behavior drift")
  Test: pickBetterCandidateByHardFacts is UNCHANGED — a repaired candidate with a
        BETTER effectiveRisk but worse verbatim coverage still loses
        (explicit regression: P1 deliberately does not extend the mechanical picker)
  Test: the judged loop still makes exactly 2 generation calls + 1 judge call
  Test: judge failure still fails open to candidate A
  Test: the speaker-switch judged orchestrator produces the same two additions
        (both orchestrators build their own fact sheets — 4 A/B sites + 2 repaired sites)
  Test: the REPAIRED fact sheet is built with the repaired candidate's own
        motionProfile (not the winner's)
```

### 6.4 File C — draft-time skills (zero-mock real-file gate)

```
Test: storyboard-shotgrid skill.md contains "## Identity-safe shot boundaries — MANDATORY"
Test: ...and its SKILL.md twin is byte-identical
Test: full-story-architect skill.md contains the same header
Test: full-story-architect has NO SKILL.md on disk
      (assert the absence, so a future "consistency fix" cannot add a divergent twin)
Test: the storyboard guidance is phrased as guidance, not as a validated requirement —
      assert the literal opt-out phrase from §7.8 is present (drafts stay free-form)
Test: neither draft-time skill gained a new REQUIRED output field
      (assert the JSON contract blocks are unchanged against a fixture hash/snapshot
       of the contract fence only, not the whole file)
```

---

## 7. Implementation

### 7.1 Motion contract rules — per-shot skill

Append **inside** section-06's `## MOTION PROFILE + MOTION CONTRACT — MANDATORY when the caller states \`motion_profile: REQUIRED\`` section, after the declaration semantics, under `### Writing the motion contract — scale it to what you declared`.

Required semantics (author the prose yourself; keep it tight — the judged path pays this system prompt up to four times per shot):

1. **Trigger.** The contract is written when the writer's own reading says the face is at risk: any character whose observability is worse than *frontal or three-quarter with at most partial occlusion*, or whose declared `turn_magnitude` is `moderate`/`large`, or whose `reveals_hidden_side` is true, or a `camera_motion` of `orbit`/`large_reframe`, or a character entering mid-shot.
2. **What the contract says, positively, inside `prompt`:** name the facial angle the start frame actually shows and state that it is preserved for the whole clip; restrict that character's motion to blink, breath, gaze shift, micro-expression and hand/shoulder beats; forbid revealing facial regions the start frame never showed.
3. **Camera consistency.** The camera vocabulary written in `prompt` must match the declared `camera_motion` — never "slow push-in" prose beside a declared `orbit`, and never a declared `locked` beside prose that pans. If the beat truly needs the bigger move, declare the bigger move; do not under-declare to dodge the contract.
4. **Under-declaring is the failure mode.** State plainly that the caller derives a risk floor from the other declared facts and can only raise the writer's `identity_risk`, never lower it, and that a judge sees both.
5. **Low risk adds nothing — frozen guard.** A frontal/three-quarter, clearly visible face with `turn_magnitude: none|subtle` on a `locked`/`push_in` camera gets **no** contract language at all. Over-restricted prompts produce static, lifeless clips; the contract is a targeted brake, not a default posture. Pick one short literal phrase for this guard and keep it stable — file A asserts on it.
6. **Budget.** The contract is a constraint list, never scene description or emotional direction (`plan §0.5`, "lock, don't describe"). It must fit inside the existing 2000-char `prompt` cap and inside rule 8's drop-priority order; when the budget is tight, the contract outranks atmosphere and sound texture but never the who-speaks-where anchors.

### 7.2 Subshots twin

Same rules, plus the two segment-specific additions the twin needs (it always runs with 2+ established characters and emits timed segments with internal cuts):

- The contract applies **per segment**, evaluated against the same single start frame.
- After every internal cut, identity must be re-anchored by name + screen position **and** the preserved facial angle re-stated for any at-risk character — a cut is exactly where a video model re-interprets a face.

Mirror the sub-headers from §4(a) verbatim.

### 7.3 Anti-morph negatives — family-shaped

Add `### Anti-morph negatives — family-shaped` in the same section of both per-shot skills, and add a **one-line cross-reference** inside the existing `negative_motion_prompt` rule (per-shot skill rule 7, `:275-292`; subshots rule 7, `:292-310`) pointing at it. Do not duplicate the list in two places.

Required semantics:

- When the contract is active, `negative_motion_prompt` gains the anti-morph entries: camera orbit around the face, profile-to-frontal (or back-to-frontal) transformation, face occlusion/overlap between two heads, re-interpretation of facial features into a different person, and sudden expression jumps.
- **Never contradict what you wrote.** If the shot legitimately declares `orbit`, the orbit entry is dropped from the negatives — the negative list and `prompt` must describe one coherent shot.
- **Family shaping — the load-bearing part.** The caller states `- negative_prompt_supported: yes|no`. When it is `no` (grok — `videoPromptFamilySupportsNegativePrompt` returns false for that family only), the model **never sees `negative_motion_prompt` at all**; the same constraints must therefore be stated **positively inside `prompt`** ("her face stays in the same three-quarter angle throughout; the camera does not orbit"). Still return `negative_motion_prompt` for other consumers. This is the exact shape of the shipped rule directly above it — reuse that phrasing pattern rather than inventing a new one.
- Low risk ⇒ no anti-morph entries (the §7.1 bullet 5 guard governs here too).

### 7.4 Bulk pack skill — prose only, no contract

Add `## IDENTITY-PRESERVING MOTION — MANDATORY when start-frame images are attached` (frozen literal §4(b)), placed after the pack's `## Single camera move + speaker anchoring per clip — MANDATORY` section (`:105-137`) and before `## MODEL-FAMILY SHAPING` (`:139`).

Content: when the caller attaches this pack's per-clip start frames, read each clip's own frame; for any character whose face is turned away, occluded, small in frame, or overlapped, keep the observed facial angle and restrict that clip's motion to micro-motion; do not direct a turn to camera or an orbit that would reveal an unseen side; when `negative_prompt_supported: no`, state it positively inside the clip prompt.

**Hard constraint:** the pack skill gets **no new output field** — it must still declare no `frame_analysis` and no `motion_profile`. The bulk runner never emits a `motion_profile: REQUIRED` fact, `projectMotionPromptPack` deliberately drops such fields, and a declared-but-never-requested output is exactly the taught-not-wired failure class. The pack's condition is the attached images it already reads (`:120-127`), not a flag.

### 7.5 Judge skill

Two edits, both small:

1. **Craft dimension** — add the frozen bullet (§4(c)) to `### 3. Craft — separates candidates that pass the gates` (`:112-136`), keeping the existing bullet style. It must reward *honoring the frame's observability*, not restriction for its own sake: a candidate that clamps a clearly frontal, fully visible face loses to one that lets it act. It must name `effectiveRisk` and `faceObservability` as the fact-sheet keys to read, and state that the fact sheet is code-computed and trusted for anything mechanical.
2. **Fact-sheet contents paragraph** (`:40-45`) — extend the list of what the fact sheet carries with the identity-risk + per-person observability entries, and add `motion_profile` to the list of per-candidate fields the judge is given (`:40-41`). Phrase both as "when the caller computed them" so a flag-off run reads coherently.

**Do not** add a correctness gate (§2, `:84-110`). A missing motion contract must never force `verdict: "repair"` — that costs a paid regeneration on every under-declared shot. See §8.3.

### 7.6 Fact sheet (`VdVideoPromptCandidateFactSheet`, RUNNER `:3037-3047`, built `:3061-3100`)

Add three optional fields. Doc-comment each with the omission rule:

```ts
/** Deterministic max(skill's own identity_risk, motion floor) for this candidate —
 *  section-04's resolveEffectiveIdentityRisk, reused from the generator result and
 *  NEVER recomputed here. Omitted when the candidate carried no motion_profile
 *  (flag off, weak model, or bulk path), so JSON.stringify(factSheet) is
 *  byte-identical to today's for every flag-off run. */
effectiveRisk?: VdIdentityRisk;

/** Compact per-person observability summary lifted from the candidate's own
 *  normalized frame_analysis (section-07). Contains ONLY people who actually carry
 *  at least one observability field; the whole key is omitted when nobody does. */
faceObservability?: Array<{
  name: string;
  facing?: string;
  eyesVisible?: string;
  occlusion?: string;
  faceSize?: string;
  overlappedByOtherFace?: boolean;
}>;

/** Mirror of frame_analysis.faces_separated; omitted when absent. */
facesSeparated?: boolean;
```

Builder changes:

- Widen the `data` param: `frameAnalysis` accepts the section-07 shape (structural — do not import section-04's tuples here), and gains `motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk }`.
- The three new keys are **conditionally spread**, never assigned `undefined`. `JSON.stringify` omits `undefined` values, so an explicit `effectiveRisk: undefined` would still be byte-safe — but an empty array `faceObservability: []` would **not** be. Omit the key.
- Everything existing (`chars`, `overCap`, `musicTermHits`, `veoSubtitleGuardPresent`, `perLineVerbatimCoverage`, `positionAnchorIssueCount`, `positionAnchorIssues`) is untouched, and the existing `as ShotVideoPromptOutput["frame_analysis"]` cast at `:3084` must still compile — run `pnpm check`.

Six call sites, all in the two judged orchestrators — pass the candidate's own `motionProfile` at each:

| Site | Orchestrator |
|---|---|
| `:3370` factSheetA, `:3376` factSheetB, `:3473` repairedFactSheet | `generateJudgedVerticalDramaShotVideoPrompt` |
| `:3579` factSheetA, `:3585` factSheetB, `:3681` repairedFactSheet | `…SpeakerSwitch` |

The repaired sheets must use `repairedResult.motionProfile`, not the winner's.

### 7.7 Judge per-candidate line (`buildJudgeUserPrompt`, RUNNER `:3134-3190`)

Add `motionProfile?: …` to the `candidates[]` param type and one **conditional** entry in the per-candidate block array (`:3162-3173`), immediately after the existing `frame_analysis: ${JSON.stringify(c.frameAnalysis ?? null)}` line (`:3169`):

- present ⇒ `motion_profile: ${JSON.stringify(c.motionProfile)}`
- absent ⇒ the entry is dropped entirely (the block is built with `[...].join("\n")`; use a `.filter(Boolean)` over the entry array, mirroring the idiom the outer return already uses at `:3188`). **Do not** copy the `?? null` idiom of the `frame_analysis` line — that would emit `motion_profile: null` on every flag-off run and break byte-identity.

Then thread `motionProfile: candidateA.motionProfile` / `candidateB.motionProfile` into the four candidate literals (`:3392-3407` and `:3600-3616`).

### 7.8 Draft-time guidance (prevention, not validation) — FLAG-GATED, and it also owns the lighting-variety fix

Two corrections from the plan audit, both binding:

**(a) It must be flag-gated.** Spec 137 §19 lists "draft-time guidance injection"
among the things `verticalDramaMotionContracts` gates. As originally written this
section edited the two authoring skills unconditionally, which would change every
tenant's storyboard drafting the moment the branch merges with both flags off —
breaking the plan's headline promise. Therefore:

- Add a caller-stated activation fact to the storyboard and deep-draft **runners**,
  emitted only when the flag is on (same ternary-returning-`null` idiom used
  everywhere else in this plan):
  `- identity_safe_shot_boundaries: REQUIRED — apply the skill's "Identity-safe shot boundaries" section.`
- Phrase both new skill sections as conditional on that fact, mirroring the shipped
  `## NATIVE AUDIO DIRECTION (conditional — only when the caller states native_audio: true …)`
  precedent this section already cites. Header becomes:
  `## Identity-safe shot boundaries — MANDATORY when the caller states \`identity_safe_shot_boundaries: REQUIRED\``
  (update the frozen literals in §4(d)/§4(e) and file C's assertions accordingly).
- Add a `storyboard-usertext` case to section 14 §5.1's D1 parity fixture table, so
  the flag-off byte-identity of the drafting prompt is actually proven.

**(b) This section also owns the storyboard lighting-variety fix.** Spec 138 §2.3
names `vertical-drama-storyboard-shotgrid`'s lighting-variety mandate as an
*aggravator* of scene drift, and section 11 §2 explicitly hands that skill to this
section. Section 11 §6 fixes the same conflict in the **render** skill; the
**drafting** skill needs the mirror fix, or the storyboard keeps authoring
per-shot lighting divergence before any lock exists.

Add to the same new section (or immediately beside the existing lighting rule at
`skills/vertical-drama-storyboard-shotgrid/skill.md:93-98`): shots that share one
entry in `distinct_locations` are one continuous scene and must share time of day,
sun direction and light quality; the required lighting *variety* applies **between**
scenes, not within one. Keep the existing variety guidance — add the exception,
do not delete the rule. Add its frozen literal to §4(d) and an assertion to file C.

---

#### Original guidance content (unchanged, now conditional per (a))

**Storyboard shot-grid** (`skills/vertical-drama-storyboard-shotgrid/skill.md` + twin): add `## Identity-safe shot boundaries — MANDATORY` after `## Location continuity and scene grouping` (`:228-311`, including its worked example) and before `## Character variant selection` (`:313`). Model the internal structure on `## Shot-to-beat attribution and silence budget` (`:454`) — numbered rules, no worked example needed.

Content: a beat that requires a character shown from behind or in profile to turn to camera, or a new character to walk into frame mid-shot, is an **identity-risk boundary**. Prefer authoring it as **two shots** — the action beat, then the reaction/reveal cut — so each shot's start frame can establish its own face, or mark it for the existing sub-shot editor. Include the frozen opt-out phrase (file C asserts it) making clear this is guidance the writer may set aside when the beat genuinely demands one continuous shot; drafts stay free-form and **nothing here is code-validated**.

**Full-story architect** (`skills/vertical-drama-full-story-architect/skill.md`): the same header with a two-to-three-sentence version, placed under `## Craft requirements — judged by a strict dramaturgy critic` (`:133-159`), never under `## Hard requirements — validated by code` (`:45`) — code validates nothing here and a rule filed under that header would be a lie to the model.

⚠️ **This folder has only a lowercase `skill.md`. Do not create a `SKILL.md`.** File C asserts its absence.

### 7.9 Twin sync procedure (every skill except full-story-architect)

Edit the lowercase `skill.md` first, then copy it over `SKILL.md` so the two are byte-identical. The loader reads lowercase `skill.md` **before** `SKILL.md`; a change made only in the uppercase twin is dead code, and divergent twins are a recurring live bug in this repo. Do **not** run `prettier --write` over files you did not create — match the surrounding style by hand.

---

## 8. Decisions already made — do not re-litigate

1. **The bulk pack gets rules but no contract.** Plan §4.4 lists the pack among the skills receiving motion-contract rules; sections 06 and 07 forbid giving it a `motion_profile` / `frame_analysis` **output field**. Both are satisfied by §7.4: unconditional-but-image-conditioned craft prose, zero new output fields. The pack lacks the per-shot fact lines that would activate a declared field, so declaring one would be dead code.
2. **The contract scales on the skill's own reading, not on `effectiveRisk`.** `effectiveRisk` does not exist until after the generation call returns (§3). It is a downstream audit/judge signal only. No second pass, no re-generation keyed on it in P1.
3. **The judge dimension is craft, never a gate.** Gates force `verdict: "repair"`, i.e. one extra paid LLM call per hit. An under-declared motion contract is a quality issue, not a "the rendered video will move the wrong mouth" defect. It belongs beside "moves the camera from the emotion", not beside "a line is attributed to the wrong speaker".
4. **No prose heuristics, ever.** Do not add any check of the form "does the candidate's text assert a preserved facial angle". VD prompts are Thai *or* English depending on the episode's language setting, so substring matching would be silently wrong in one of them. `pickBetterCandidateByHardFacts` (`:3111-3125`) stays **unchanged** in P1 — no language-independent deterministic check is available, and a fake one is worse than none. Carry the inputs; let the judge judge.
5. **Categories, never degrees.** The originating proposal specified numeric yaw thresholds ("≤15°"). An LLM cannot measure degrees and pseudo-precision creates false confidence. Numbers return only if a computer-vision path is ever added.
6. **Low risk adds nothing.** Over-restriction produces static, lifeless clips. This is a product requirement, not a nicety — it is the reason the judge dimension rewards *honoring* observability rather than *restricting* motion.
7. **Zero new LLM calls.** The judged loop stays 2 candidates + 1 judge (+1 repair). This section adds no call, no retry, and no gate that can trigger one.
8. **`skill.md` is the system prompt for everyone.** Every rule is conditioned on a caller-stated fact, following the shipped `## NATIVE AUDIO DIRECTION (conditional — …)` precedent. Do not try to gate a file.

---

## 9. Flag-off byte-identical obligations

With `verticalDramaMotionContracts` off, sections 06/07 emit no `motion_profile: REQUIRED` and no `frame_observability: REQUIRED` fact, so no model returns those fields, so:

| Surface | Proof |
|---|---|
| Generator user prompt | unchanged — this section adds no TS fact line (nothing to prove beyond sections 06/07's own proofs) |
| Judge user prompt | character-for-character today's; `withFlag.replace(`${motionLine}\n`, "") === without` |
| Serialized fact sheet | identical key set — `effectiveRisk` / `faceObservability` / `facesSeparated` keys **absent**, not null, not empty |
| Repair decision | `pickBetterCandidateByHardFacts` output identical for the same candidates |
| Persisted clip | untouched by this section |
| Bulk pack generator + projector | untouched under any flag value |

The system prompts themselves do change (new skill sections). That is the accepted, shipped pattern (§3, §8.8) and is covered by the real-file gates rather than by byte-identity.

---

## 10. Verification / done criteria

```
cd apps/web

# This section's suites
npx vitest run \
  server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts \
  server/services/__tests__/verticalDramaJudgeMotionContractFacts.test.ts \
  server/services/__tests__/verticalDramaDraftContinuityRealSkillFile.test.ts \
  --reporter=basic

# Gate A — must still be 266/266 green, zero tolerance
npx vitest run \
  server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaJudgedShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaVideoPromptFormatter.test.ts \
  server/services/__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts \
  --reporter=basic

# Storyboard suites (the draft-time skill's own runner)
npx vitest run server/services/__tests__/verticalDramaStoryboardGeneration*.test.ts --reporter=basic
```

Also re-run Gate B (start-frame / image-reference suites) and compare **fail-sets as sets**, never counts. This section touches no start-frame code; a new Gate B entry means something unrelated broke.

**Done when:**

1. All three suites in §6 green.
2. Gate A unchanged at 266/266; storyboard suites unchanged.
3. Gate B fail-set unchanged (no new names).
4. Every frozen literal in §4 present on disk, and every `SKILL.md` twin byte-identical to its lowercase partner (grep-verify before closing: `for f in skills/vertical-drama-{shot-video-prompt,shot-video-prompt-subshots,video-motion-prompt-pack,video-prompt-judge,storyboard-shotgrid}; do cmp "$f/skill.md" "$f/SKILL.md"; done`).
5. `skills/vertical-drama-full-story-architect/` still contains **no** `SKILL.md`.
6. Flag-off judge prompt byte-identical proof green.
7. `pickBetterCandidateByHardFacts` diff is empty.
8. `pnpm check` (or `npx tsc --noEmit`) shows no new errors attributable to this section.

---

## 11. Known traps

| Trap | Guard |
|---|---|
| **Decorative judge dimension.** A dimension added only to the judge skill is never read — `scores[]` is discarded by code. | Items 6+7 (fact sheet + per-candidate line) are what make it real. File A cross-checks the skill's literal key names against a fact sheet the code actually produced. |
| **`motion_profile: null` on flag-off.** Copying the `frame_analysis: ${JSON.stringify(x ?? null)}` idiom breaks judge-prompt byte-identity for every existing tenant. | Conditional entry + `.filter(Boolean)`. Explicit test in file B. |
| **`faceObservability: []`.** An empty array serializes; `undefined` does not. | Omit the key when nobody carries observability data. Explicit test. |
| **Recomputing `effectiveRisk` in the fact sheet.** Two derivations drift. | Reuse `candidate.effectiveRisk` from the result; test asserts equality with the result field. |
| **Only 4 of 6 fact-sheet call sites updated.** The two repaired sheets are easy to miss and only exercised on a `repair` verdict. | Grep `buildCandidateFactSheet(` — must be 6. Dedicated repaired-path test. |
| **Twin drift.** Five of the six skills edited here have a `SKILL.md`; the loader reads lowercase first, so an uppercase-only edit is dead. | Edit lowercase, copy over uppercase, `cmp` before closing, gates in files A and C. |
| **Creating a `SKILL.md` for full-story-architect.** Looks like a consistency fix; would create a divergent twin. | File C asserts its absence. |
| **Adding a correctness gate to the judge.** Costs one paid repair per under-declared shot. | Craft section only; ordering assertion in file A. |
| **Over-restriction.** Contract language applied by default makes every clip static. | The frozen low-risk guard phrase (§7.1 bullet 5), asserted in file A, plus a judge dimension that rewards honoring observability rather than restricting motion. |
| **Contradicting the declared camera motion.** Adding an "orbit" negative to a shot that legitimately orbits. | §7.3 bullet 2, plus the camera-consistency rule §7.1 bullet 3. |
| **Grok forgotten.** Grok is the *primary* family for this pipeline and never receives `negative_motion_prompt`; anti-morph rules that live only in the negatives are a no-op for it. | The rules key on the shipped `- negative_prompt_supported:` fact and mandate positive phrasing; file A asserts that token inside the anti-morph sub-section. |
| **Prompt budget.** The judged path pays the system prompt up to four times per shot, and `prompt` is still hard-capped at 2000 chars. | Keep every added section compact; the contract slots into rule 8's existing drop-priority order rather than adding a new priority tier. |
| **`vi.clearAllMocks()` in a new `beforeEach`.** Does not drain `mockReturnValueOnce` queues. | `mockReset()` the queued mocks, or one early throw poisons the file. |
| **Running vitest from the repo root.** Globs the monorepo and dies on an unreadable directory. | Always `cd apps/web` first; never pipe through `tail`. |

---

## 12. Implementation record (2026-08-01)

**Status:** complete.

- Added request-gated motion-contract authoring, family-shaped anti-morph rules,
  bulk-pack guidance, and a judge Craft dimension backed by structured
  `effectiveRisk`, `faceObservability`, and `facesSeparated` facts.
- Threaded `motionContractsEnabled` through storyboard, deep-story, run-stage,
  repair-stage, and bulk-pack paths. Omitted/false preserves the old prompt; tests
  prove removal of the single activation line recreates flag-off output.
- Added conditional identity-safe shot-boundary guidance, the same-scene lighting
  exception, and the explicit previous-frame continuity-reference interpretation.
- Added `storyboard-usertext` to section 14's flag-off parity fixture matrix.
- Verification: section-focused tests 19/19 green; activation tests 2/2 green;
  pipeline/router focused tests 38/38 green; package TypeScript check green; all
  lowercase/uppercase skill twins byte-identical; `git diff --check` green.
- Known baselines retained: Gate A is 261/266 with the same five obsolete
  retry/call-count assertions recorded before this section. The full deep-story
  suite is 99/101 because two pre-existing assertions expect `episode(s)` while
  the dirty worktree currently emits `Sub-episode(s)`. Gate B currently has 72
  failures versus the earlier 60-name snapshot because unrelated staged/worktree
  router and model-registry changes invalidate that aggregate baseline; no Gate B
  TypeScript production path was changed here, and the real start-frame skill-file
  gate is green.
