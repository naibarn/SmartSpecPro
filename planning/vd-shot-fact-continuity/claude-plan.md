# Implementation Plan — VD Shot Fact Continuity (Feature 140)

Target: `apps/web`. Branch: one feature branch off `main`, sequential inside it.
Spec: `specs/feature/140-vertical-drama-shot-fact-continuity/spec.md`.
All anchors verified at HEAD `941547ff1` by a read-only audit; **anchor by symbol
name, not line number** — several sibling branches edit these files.

---

## 0. What this branch fixes, in one paragraph

Two production failures the user reports as constant. **(A)** A character who is only
*mentioned* in dialogue, or who is on the other end of a **phone call**, gets rendered
as physically present. **(B)** An object changes identity between shots — a photo taken
with a **mobile phone** in shot 3 is examined on the back of an **SLR camera** in shot 4.

Both have the same root cause: a shot's image is composed from facts nobody wrote
down. There is no field anywhere distinguishing *in frame* from *spoken about*, no
structured prop field at all, and nothing carries an object from one shot to the next.

The fix is small for its impact: two optional structured fields, one deterministic
fold, three prompt fact lines, and the deletion of one substring match that was never
presence detection in the first place.

---

## 1. The three mechanisms being corrected (verified)

### 1.1 Characters are force-added by two rules that cannot tell presence from mention

In `server/services/verticalDramaStoryboardGeneration.ts`, after the storyboard LLM
returns, a deterministic pass rewrites the shot's character list:

- `:899-906` builds `narrativeText` from `action` + `narrative_purpose` +
  `visual_description` + **`dialogue_excerpt`** + **`subtitle_text`**.
- `:923-924` — `narrativeText.includes(c.name)` force-adds any roster name found in
  that text. **Saying a character's name out loud puts their body in frame.**
- `:938-950` — every draft `dialogue_lines[].speaker` is force-added.
- `:951-952` — `shot.characters` and `shot.required_character_refs` are **overwritten**
  with the result. The authoring LLM's own judgement is discarded.

Downstream, `verticalDramaEpisodePipeline.ts:2985-2992` →
`verticalDramaStartFrameGeneration.ts:397-401` makes that list `requiredCharacterRefs`
("groundTruth" — the storyboard always wins), and
`verticalDramaEpisodes.ts:10025-10036` attaches one portrait per ref with a
**fail-closed throw** when a ref has no approved portrait (`:1773-1779`).

So a required ref is *guaranteed* to become a face — and a wrongly-added character
without a portrait **blocks the render entirely**.

Three layers only ever ADD: the skill rule
(`skills/vertical-drama-storyboard-shotgrid/skill.md:525-530`, no carve-out for
"not physically present"), the reconcile above, and the repair pass
(`verticalDramaShotCharacterRepair.ts`, whose doc comment states **"Never removes an
existing ref"**).

The upstream architect skill supplies the input:
`skills/vertical-drama-full-story-architect/skill.md:88-92` instructs that a voice
through a device be written as the **PERSON** speaking. Correct for dialogue,
catastrophic for image composition — because nothing downstream knows the difference.

### 1.2 Objects have no representation at all

`VerticalDramaProp` (`shared/verticalDramaSeries/contracts.ts:76-81`) and
`recurringProps` (`:125`) exist as types with **exactly one reference repo-wide: their
own declaration**. Dead type, no feature. `contract.newClueIds`
(`verticalDramaStoryBible.ts:321`) is flag-gated and feeds only a budget check.

Nothing carries an object forward. The pipeline→`storyboardShots[]` mapping
(`verticalDramaEpisodePipeline.ts:3010-3025`) drops `action`, `continuity_notes` and
`image_prompt`; `GenerateStartFrameShotPromptParams`
(`verticalDramaStartFrameGeneration.ts:1442-1603`) has no neighbor field of any kind.

### 1.3 A rule that cannot be obeyed

`skills/vertical-drama-cinematic-narrative-image-prompt/skill.md:239-245` —
`## 10. CONTINUITY LOCKS` — orders the model to lock *"objects in hand · prop
positions · … emotional carry-over from the previous shot"*. That skill runs **per
shot**, and `buildStartFrameShotPromptUserPrompt` gives it **no previous-shot data**.

This is the taught-not-wired class in its purest form, and it is the direct mechanical
cause of failure (B). Section 05 makes the rule obeyable; section 06 adds a gate so
the rule and its data can never drift apart again.

---

## 2. Sequencing

| Step | Section | Flag |
|---|---|---|
| 1 | `01` flags + two pure modules | — |
| 2 | `02` presence contract + the reconcile fix | `verticalDramaShotPresence` |
| 3 | `03` presence downstream: repair, prune, fail-closed, warning | `verticalDramaShotPresence` |
| 4 | `04` object contract + episode ledger + persistence | `verticalDramaShotObjects` |
| 5 | `05` object facts + `previous_shot` injection | `verticalDramaShotObjects` |
| 6 | `06` drafting + prompt skills | both |
| 7 | `07` QC, flag-off parity, verification, rollout | both |

**Two flags, deliberately.** Section 02–03 **subtract** characters from renders — it
can change who appears in future renders of an already-approved episode. Sections
04–05 only **add** context. They must roll out and roll back independently.

---

## 3. Conventions binding on every section

1. **Additive only, zero migrations.** Everything lands in existing jsonb. Absent ⇒
   legacy behavior.
2. **Flags off ⇒ byte-identical** prompts, `requiredCharacterRefs`, attach lists,
   `db.select` counts. Snapshot-tested per section.
3. **Default `in_frame` / `in_scene`.** Legacy data has no `presence` and no
   `objects`, so it must behave exactly as today — this is what makes the branch safe
   to merge before any tenant opts in.
4. **`voice_only` keeps its dialogue.** Nothing about audio, subtitles, speech budget,
   voice casting or the video prompt changes. Only image composition stops treating
   the character as a body. Any section that touches a dialogue consumer has
   overreached.
5. **Skill-first.** Judgement lives in `skill.md`; TypeScript computes facts (filter,
   fold, render) and never decides who is present or what an object is.
6. **Dual-case skill twins.** Edit lowercase `skill.md`, copy to `SKILL.md`, assert
   byte-identity. The loader reads lowercase first.
7. **No prose heuristics.** Do not infer presence from prompt text; the whole point is
   that the substring match at `:923-924` was exactly that, and it is the bug.
8. **Run vitest from `apps/web`**; never pipe a run through `tail`; diff fail-sets as
   sets. `vi.clearAllMocks()` does not drain `mockReturnValueOnce` queues — use
   `mockReset()` in any `beforeEach` that queues them.

---

## 4. Coordination with the P1 branch (137/138/139)

This branch lands **after** `planning/vd-p1-identity-scene-continuity/`. Shared files
and how to avoid fighting:

| File | P1 owner | This branch |
|---|---|---|
| `buildStartFrameShotPromptUserPrompt` | sections 11 (scene lock), 15 (look lock) | adds `previous_shot` + established-objects entries to the **same** `.filter(Boolean)` array, same `null`-when-absent discipline, same byte-identical proof |
| `buildStartFrameRenderPlanUserPrompt` | sections 11, 15 | same |
| `projectStartFramePlan` carry-over | section 10 extends it | **extend again**, never replace — a new plan-level key that is not carried dies on the next regeneration |
| `skills/vertical-drama-storyboard-shotgrid/skill.md` | sections 08, 15 | section 06 here; serialize and re-run each other's real-file gates |
| Feature 138 `activeProps` (scene props) | section 05/09 of P1 | **must be reconciled** — see §5 |

### 5. The one open design question, to settle before section 04 starts

Feature 138's Scene Visual State carries `activeProps` (scene-level set dressing:
"brown envelope on the ledge"). This branch adds shot-level `objects[]` plus an
episode ledger (instrument identity and causal chains: "the phone that took the photo").

They are different scopes and both are legitimate, but **there must not be two prop
stores**. Decide one of:

- **(a) Ledger is the source; scene props derive from it.** A scene's `activeProps`
  becomes a projection of ledger entries whose shots fall inside that scene. Cleaner,
  one authoring surface, but couples 138's Scene Visual State to this branch.
- **(b) They stay separate with a written boundary:** 138 owns *static set dressing
  that must not drift*, 140 owns *objects with a causal role across shots*. Cheaper,
  but a reviewer will eventually ask why a phone appears in one and an envelope in the
  other.

Recommendation: **(a)**, taken at section 04, with 138's `activeProps` renderer reading
the ledger. If 138 has not shipped when this branch starts, (b) with a TODO is
acceptable — but write the decision down either way.

---

## 6. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Presence filtering removes a character who genuinely *was* in frame | An approved episode's future renders lose a person | Default `in_frame`; only an explicit non-`in_frame` declaration subtracts. The prune action is user-invoked, never automatic (section 03) |
| The reconcile change breaks the "speaker must be in frame" guarantee that exists for good reasons | Video invents a stand-in for a speaker who really is present | The guarantee is preserved for `in_frame` speakers; only `voice_only`/`mentioned` are excluded. Section 02's fixtures pin both directions |
| Ledger key collisions (two different phones both "มือถือ") | Wrong object identity asserted | Normalize per-episode, key on normalized name + introducing shot; when ambiguous, emit no established-object line rather than a wrong one (fail-open) |
| A new plan-level key is wiped by `projectStartFramePlan` | Ledger vanishes after a plan regeneration | Explicit carry-over (§4), regression test |
| Object facts bloat the prompt | Budget pressure alongside 138/139 blocks | Cap the established-objects line at the objects this shot actually references; the `previous_shot` block is one shot, not a history |
| Skill files edited by three branches | Silent loss | Serialize; real-file gates on both sides; copy lowercase → `SKILL.md` every time |

---

## 7. Exit criteria for the branch

1. A `voice_only` speaker is **not** in `requiredCharacterRefs`, keeps their dialogue,
   and does **not** block the render when they have no portrait.
2. A roster name appearing only inside `dialogue_excerpt` is **not** force-added.
3. The phone/photo two-shot fixture: shot 4's prompt names the phone as the
   established device and carries the `from_object` link.
4. `## 10. CONTINUITY LOCKS` is backed by a real `previous_shot` block, asserted by a
   gate that fails if either side is removed.
5. Both flags off ⇒ byte-identical everything, proven by snapshot parity.
6. Legacy drafts (no `presence`, no `objects`) behave exactly as today.
7. `pnpm check` adds no new errors; the P1 branch's Gate A/Gate B baselines are
   unchanged.
