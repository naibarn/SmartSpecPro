# Feature 140: Vertical Drama Shot Fact Continuity — Who Is Actually In Frame, and What Object Is Actually In Play

Version: 1.0.0
Date: 2026-07-23
Status: Proposed
Priority: **P0 for production quality** — the user reports both failures as happening "ตลอด/ประจำ", and together they are the single largest driver of per-shot repair work.
Author: Conductor session with a read-only code audit (every anchor below verified at HEAD `941547ff1`)
Related: 137 (identity: the PERSON stays the same person) · 138 (scene: the PLACE stays the same place) · 139 (look: the LOOK stays the same look). **140 = the FACTS of a shot are true and carried forward.**
Source: user report 2026-07-23, two named failures with worked examples.

---

## 1. Executive summary

Two failures, reported as constant, with one shared root cause: **a shot's image is
composed from facts nobody ever wrote down.**

**Failure A — people who are not there get drawn.** A character who is only
*mentioned* in dialogue, or who is on the other end of a **phone call**, is rendered
as physically present. Verified mechanism: the storyboard's deterministic
post-processing (a) force-adds any roster name whose **substring** appears in the
shot's `dialogue_excerpt` / `subtitle_text`, and (b) force-adds **every** dialogue
speaker — then overwrites the LLM's own character list with the result. That list
becomes `requiredCharacterRefs`, and portrait attachment at render time is
**fail-closed**, so a required ref is *guaranteed* to become an attached face. Three
separate layers (skill rule, deterministic reconcile, repair pass) only ever ADD
characters; **none can ever subtract one**. There is no field anywhere — in any
schema, contract or skill — that distinguishes *in frame* from *spoken about*.

**Failure B — objects change identity between shots.** Shot N shows a character
photographing something with a **mobile phone**; shot N+1 shows her looking at the
photo she took, and renders her looking at the back of an **SLR camera**. Verified
mechanism: there is **no structured prop field anywhere** in the VD pipeline (the
`VerticalDramaProp` type exists and is 100% dead code — one reference, its own
declaration), and **nothing carries an object from shot N into shot N+1's prompt**.

And the finding that makes Failure B unambiguous — a *taught-not-wired* instance of
the exact class this codebase has been bitten by before:

> `skills/vertical-drama-cinematic-narrative-image-prompt/skill.md:239-245` contains
> a **`## 10. CONTINUITY LOCKS`** rule instructing the model to lock "*objects in
> hand · prop positions · … emotional carry-over from the previous shot*".
> That skill runs **per shot**, and its user prompt
> (`buildStartFrameShotPromptUserPrompt`, `verticalDramaStartFrameGeneration.ts:1605-1787`)
> contains **no previous-shot data of any kind**. The model is ordered to maintain
> continuity against information it is never given.

This feature adds the two missing structured facts — **presence** and **objects** —
teaches the drafting layer to write them, stops the reconcile from inventing them,
carries them forward, and checks them.

---

## 2. Verified current state

### 2.1 How a shot's character set is actually decided

| Step | Anchor | What happens |
|---|---|---|
| 1 | `verticalDramaStoryBible.ts:363-390` (`shotDraftSchema`) | Deep draft emits `characters[] {name, emotion}` and `dialogue_lines[] {speaker, line}` |
| 2 | `verticalDramaStoryboardGeneration.ts:701` | The whole draft is injected into the storyboard call |
| 3 | `verticalDramaStoryboardGeneration.ts:899-906` | `narrativeText` = `action` + `narrative_purpose` + `visual_description` + **`dialogue_excerpt`** + **`subtitle_text`** |
| 4 | **`:923-924`** | `nameMatches = params.characters.filter(c => narrativeText.includes(c.name))` — **any roster name mentioned in dialogue is force-added** |
| 5 | **`:938-950`** | **every** draft `dialogue_lines[].speaker` resolvable via `speakerLookup` is force-added |
| 6 | **`:951-952`** | `shot.characters = resolvedIds; shot.required_character_refs = resolvedIds;` — **the LLM's own list is overwritten** |
| 7 | `verticalDramaEpisodePipeline.ts:2985-2992` → `verticalDramaStartFrameGeneration.ts:397-401` | becomes `frames[].requiredCharacterRefs`; the storyboard list always wins ("groundTruth") |
| 8 | `verticalDramaEpisodes.ts:10025-10036` + `:1773-1779` | `resolveRequiredShotCharacterAttachmentManifest` attaches one portrait per ref and **fail-closed throws** if a ref has no approved portrait |

Reinforcing layers, all additive-only:

- **Skill rule** — `skills/vertical-drama-storyboard-shotgrid/skill.md:525-530`:
  *"When a draft shot's `dialogue_lines[]` names a speaker, that speaker's character
  id MUST be included … a line whose speaker isn't in the frame makes the video
  invent a stand-in."* **No carve-out for a speaker who is not physically present.**
- **Repair pass** — `verticalDramaShotCharacterRepair.ts` union-merges every
  resolvable speaker and, per its own doc comment, **"Never removes an existing ref"**.
- **Auto-registration** — `verticalDramaCharacterRosterAutoRegister.ts:542-565`
  INSERTs a roster row for an AI-introduced speaker (guards: ≥2 lines or listed in
  `characters[]`, a junk denylist of `เสียง / narrator / off-screen / …` at `:89-109`,
  a sound-cue regex at `:112`). **The denylist catches labels, not real names** — so
  "แม่" on the phone passes every guard.
- **The architect skill actively produces the input** —
  `skills/vertical-drama-full-story-architect/skill.md:88-92` instructs that when a
  voice comes through a device, *"the speaker is the PERSON speaking, if they are in
  the bible"*. Correct for dialogue; catastrophic for image composition, because
  nothing downstream knows the difference.

**Presence flag: NOT FOUND** — verified absent in the storyboard JSON schema, the
storyboard server zod (`:229-265`), `shotDraftSchema`, `shotDraftCharacterSchema`
(`:339-345`), `characterIdentityMap.ts:36-42`, `speakingOrder`, `frames[]`
(`contracts.ts:475-560`), and every VD skill output contract.

**Asymmetry worth naming:** VD already warns when a required character is *missing*
from a prompt (`VD_START_FRAME_CHARACTER_IDENTITY_MISSING`,
`verticalDramaEpisodePipeline.ts:3869-3882`). There is **no check in the opposite
direction** — a character wrongly present is invisible to QC.

**Second-order harm:** because portrait attachment is fail-closed, a wrongly-added
character with no approved portrait doesn't just corrupt the image — it **blocks the
render entirely**.

### 2.2 How a shot's objects are decided

| Question | Answer |
|---|---|
| Structured prop field in the storyboard shot schema? | **NOT FOUND.** Full field list is `shot_number, timecode, duration_seconds, narrative_purpose, emotion, characters, required_character_refs, location, action, visual_description, camera{…}, lighting, facial_expression, body_language, gaze_direction, dialogue_excerpt, subtitle_text, continuity_notes, image_prompt, negative_prompt, age_suitability, source_beat_indexes, silence_intent, target_speech_seconds, change_type` |
| In `shotDraftSchema`? | **NOT FOUND** — `shot_number, summary, dialogue_lines, silence_intent, tie_in, contract, characters, location_key` |
| Any prop type in the codebase? | `VerticalDramaProp` at `contracts.ts:76-81` and `recurringProps` at `:125` — **grep returns exactly one hit, the declaration itself. Dead type, no feature.** |
| Closest live field? | `contract.newClueIds` (`verticalDramaStoryBible.ts:321`) — flag-gated, consumed only by a budget check (`verticalDramaDialogueChecks.ts:73-83`), **never reaches any image prompt** |
| Anything carrying an object from shot N to N+1? | **NOT FOUND.** `canonicalShotSummary` is per-shot and non-cumulative (`verticalDramaEpisodePipeline.ts:2823-2829`); the pipeline→storyboardShots mapping (`:3010-3025`) **drops `action`, `continuity_notes`, `image_prompt`**; `GenerateStartFrameShotPromptParams` (`verticalDramaStartFrameGeneration.ts:1442-1603`) has **no neighbor field at all**; `previousFramesByShotNumber` is same-shot-across-plan-versions, not neighbors; `episodePlanContext` is episode-level prose |
| Does any skill teach object continuity between shots? | Storyboard skill: `change_type` vs the previous shot (`skill.md:164-190`) and location grouping (`:228-240`) — **object-blind**. Architect skill: **absent**. The one real rule (`cinematic-narrative-image-prompt/skill.md:239-245`) is **unactionable** (§1) |
| Feature 138's `activeProps`/`fromShot`? | **Planned only** — zero code hits repo-wide. No migration conflict |

### 2.3 Why the synopsis cannot carry the load

`canonicalShotSummary` is the deep draft's `summary` — `z.string().min(1)`, no max,
no structure (`verticalDramaStoryBible.ts:366`), authored as *"a concrete synopsis of
what happens IN THIS SHOT: who does what, where, and what changes"*
(`full-story-architect/skill.md:52-55`). It reaches the prompt as **one line**
(`verticalDramaStartFrameGeneration.ts:661-663`, `:1670-1672`).

The architect skill explicitly makes it the dumping ground: *"Incidental extras (e.g.
'พนักงานเสิร์ฟ') may appear inside `summary` but never in `characters`"* (`:59-60`).
So objects live there too — as prose, per shot, non-cumulative, never extracted,
never normalized, never carried. **The user's diagnosis ("เรื่องย่อไม่ละเอียดพอ") is
correct, but the deeper problem is that even a perfect synopsis would not survive to
the next shot.**

---

## 3. Design

Two structured facts, one shared enforcement pattern.

### 3.1 Part A — character presence

Add `presence` to the character entry at both authoring layers.

```jsonc
// shotDraftCharacterSchema (verticalDramaStoryBible.ts:339-345) and the
// storyboard shot's character entries
{
  "name": "แม่",
  "emotion": "…",
  "presence": "in_frame" | "voice_only" | "mentioned"   // NEW, default "in_frame"
}
```

| Value | Meaning | Dialogue? | Portrait attached? | In `requiredCharacterRefs`? |
|---|---|---|---|---|
| `in_frame` | physically visible in this shot | yes | **yes** | **yes** |
| `voice_only` | heard but not seen — phone, intercom, another room, off-screen shout | **yes** | no | no |
| `mentioned` | talked about, not present at all | no | no | no |

**The load-bearing separation:** `voice_only` characters **keep their dialogue
lines**. Nothing about audio, subtitles, speech budget, voice casting or the video
prompt changes — only *image composition* stops treating them as bodies. That is
what makes this safe to ship: it subtracts from exactly one consumer.

**Rules:**

1. **Only `in_frame` reaches `requiredCharacterRefs`.** This is the whole fix.
2. **The substring match dies.** `verticalDramaStoryboardGeneration.ts:923-924`
   force-adds any roster name found inside `dialogue_excerpt`/`subtitle_text` — that
   is *mention detection presented as presence detection*. Under the flag it must
   stop feeding `required_character_refs`. It may remain as a *hint* the authoring
   LLM can accept or reject.
3. **The speaker force-add becomes presence-aware.** `:938-950` adds a speaker only
   when that speaker's declared presence is `in_frame`. When the draft declares no
   presence (legacy data), default `in_frame` — behavior unchanged.
4. **The repair pass must respect it.** `verticalDramaShotCharacterRepair.ts`'s
   "never removes" rule stays, but its *additions* become presence-aware. A separate,
   explicit `pruneNonPresentCharacterRefs` action (user-invoked, never automatic) is
   what removes a wrongly-added ref from existing episodes.
5. **`speakingOrder` excludes non-`in_frame` speakers.** The start-frame prompt
   positions characters left-to-right by dialogue order; a phone voice left in that
   order positions a ghost.
6. **`required_character_count` and camera widening** (`remapCameraSetupForRequiredCharacters`,
   `verticalDramaStartFrameGeneration.ts:693-696`) count only `in_frame` — today a
   phone voice silently widens the shot to fit a person who isn't there.

### 3.2 Part B — shot objects and the episode object ledger

Add a structured object list to the draft shot, and derive a cumulative ledger.

```jsonc
// shotDraftSchema (verticalDramaStoryBible.ts:363-390) — NEW
"objects": [
  { "name": "มือถือของมายด์", "role": "in_hand", "introduced": true },
  { "name": "ภาพถ่ายในมือถือ", "role": "focus", "from_object": "มือถือของมายด์" }
]
```

| `role` | Meaning |
|---|---|
| `in_hand` | held or operated by a character — **the instrument case** |
| `focus` | what the shot is *about* visually (the photo being examined) |
| `in_scene` | present set dressing that matters |
| `referenced` | spoken about, **not** visible — the object twin of `mentioned` |

**The episode object ledger (deterministic, no LLM).** Fold the shot drafts in shot
order into `Map<normalizedName, { name, introducedInShot, lastSeenInShot, roles[] }>`.
Pure, testable, no I/O — the same shape as the shipped quality-ledger reconcile
(F132B).

**Two prompt facts, and they are the actual fix for the phone→SLR bug:**

1. **Established objects** — for any object in this shot that the ledger says was
   introduced earlier, emit its established identity:
   `established objects (do not re-invent): มือถือของมายด์ — introduced in shot 3, in hand`
2. **`from_object` resolution** — when a shot's object derives from an earlier one
   (`ภาพถ่าย` ← `มือถือ`), state the causal link:
   `ภาพถ่ายในมือถือ is the output of มือถือของมายด์ (shot 3) — the device must match`

That second line is precisely what was missing when shot 4 rendered an SLR.

**Relationship to Feature 138's `activeProps`** — different scopes, and they must not
be merged:

| | 138 `activeProps` | 140 `objects` |
|---|---|---|
| Scope | the **scene** (a location's shots) | one **shot**, plus a cross-shot ledger |
| Purpose | static set dressing that must not drift or leak | the **instrument** used, and the **causal chain** between objects |
| Example | "brown envelope on the ledge" | "the phone that took the photo shot 4 examines" |
| Lives in | Scene Visual State | shot draft + episode ledger |

Implementation order matters: if 138 lands first, 140's ledger should *feed* 138's
`activeProps` rather than duplicate it (a scene's `activeProps` can be derived from
the ledger entries whose shots fall in that scene). Decide at implementation; do not
build two prop stores.

### 3.3 Part C — give the per-shot skill the previous shot (fixes the unactionable rule)

Add an optional `previousShotContext` to `GenerateStartFrameShotPromptParams`
(`verticalDramaStartFrameGeneration.ts:1442-1603`) and emit it as a labeled,
**reference-only** fact block in `buildStartFrameShotPromptUserPrompt` — the same
"ห้ามคัดลอกลง output" convention `episodePlanContext` already uses:

```
previous_shot (reference only — for continuity, do not copy into the output):
  shot 3 — summary: มายด์ยกมือถือขึ้นถ่ายภาพป้ายชื่อบนตึก
  objects in play: มือถือของมายด์ (in hand)
  characters in frame: มายด์
  continuity_notes: keep blazer + gold hoops
```

Without this, `## 10. CONTINUITY LOCKS` remains an order the model cannot obey.
**This single block is the highest-value line in Part B**, because per-shot
regeneration is the dominant repair workflow — and it is exactly the path that today
discards all cross-shot context.

### 3.4 Part D — drafting quality (the "เรื่องย่อไม่ละเอียดพอ" half)

Skill rules for `vertical-drama-full-story-architect` and
`vertical-drama-storyboard-shotgrid`:

- When a shot's action **uses an instrument** (photographing, recording, calling,
  writing, unlocking), the instrument must be **named** in `objects[]`, not left
  implicit in prose.
- When a later shot examines, shows, or refers to the **output** of an earlier
  action, it must reference the originating object via `from_object`.
- A character who speaks **through a device or from off-screen** must be declared
  `presence: "voice_only"`. A character merely talked about is `"mentioned"`. Neither
  loses their dialogue lines.
- Worked examples for both — the phone/photo case and the phone-call case — belong in
  the skill files, because these are the two failures actually observed.

---

## 4. Enforcement — four layers, copying the shipped marketplace pattern

Do not invent a new enforcement shape; mirror `characterPresenceMode`, which already
solves the sibling problem in production:

| Layer | Marketplace precedent | This feature |
|---|---|---|
| **Enum / plan field** | `shared/hyperframes/autoPlan.ts:112-114`, normalizer `marketplaceAutoReviewService.ts:5529-5534` (unknown → safe default, fail-open) | `presence` + `objects[].role`, lenient resolvers, unknown → `in_frame` / `in_scene` |
| **Prompt LOCK** | `buildMarketplaceAutoReviewCharacterPresenceDirective` `:5588-5613`, returns `""` when not applicable so the prompt stays byte-identical | `in_frame` roster line, established-objects line, `previous_shot` block — all `null` when absent |
| **Skill rule** | `skills/product-reference-storyboard/skill.md:169-177`, explicitly opt-in ("when absent, this section does not apply") | §3.4 rules, conditioned on the caller-stated facts |
| **QA reason code + repair** | `character_presence_missing` `:2563`, repair `:5594-5607` | `vd_unstaged_character_rendered`, `vd_object_identity_mismatch` |

**QC additions** (using the shipped `VerticalDramaWarning` +
`stageQcWarnings` channel — `contracts.ts:49-57`,
`verticalDramaEpisodePipeline.ts:3447/3869`):

- `VD_START_FRAME_UNSTAGED_CHARACTER` — a `voice_only`/`mentioned` character's
  portrait was attached, or the prompt names them as visible. **Closes the asymmetry
  in §2.1: VD checks for missing characters, never for extra ones.**
- `VD_SHOT_OBJECT_IDENTITY_DRIFT` — a shot references an object established earlier
  under a different name/kind (the phone→SLR shape). Detectable deterministically
  from the ledger for named objects; a vision check is P2.

Both fail-open warnings, repairable, never blocking.

---

## 5. Data model — additive, zero migrations

```text
shotDraftCharacterSchema      + presence?: "in_frame" | "voice_only" | "mentioned"
shotDraftSchema               + objects?: Array<{ name, role?, from_object?, introduced? }>
storyboard shot               + characters[].presence (mirrors the draft)
startFramePlan.frames[]       + shotObjects?: […]           (carried, for repair paths)
                              + nonPresentCharacterRefs?: string[]  (audit: who was excluded and why)
episode object ledger         derived, cached on the plan; never hand-authored
```

Everything lands in existing jsonb. Absent ⇒ legacy behavior, byte-identical.

**Carry-over warning:** `projectStartFramePlan` builds a fresh literal and deletes
unknown plan-level keys (the trap Feature 138 §13 documents). Any new plan-level key
here **must** be added to its carry-over or it dies on the next plan regeneration.

---

## 6. Flags and rollout

| Flag (tenant, default OFF) | Gates |
|---|---|
| `verticalDramaShotPresence` | Part A — the `presence` field, the reconcile changes, `speakingOrder`/count/camera-widening effects, the unstaged-character warning |
| `verticalDramaShotObjects` | Parts B + C — `objects[]`, the ledger, the established-objects and `previous_shot` prompt blocks, the object-drift warning |

Two flags, not one: Part A **subtracts** characters from renders (higher blast radius
— it can change who appears in an already-approved episode's future renders), while
Parts B+C only **add** context. They must be able to roll out and roll back
independently.

Flags off ⇒ byte-identical prompts, identical `requiredCharacterRefs`, identical
attach lists. Enforced by snapshot tests.

**Backfill:** existing episodes have no `presence`, so everything defaults
`in_frame` and nothing changes retroactively. The user-invoked
`pruneNonPresentCharacterRefs` action is how an existing episode gets cleaned —
never automatic, because removing a ref changes an approved shot's composition.

---

## 7. Testing

- **Pure modules** — the presence resolver and the object-ledger fold: exhaustive,
  zero mocks, including legacy-shaped input (no `presence`, no `objects`).
- **The reconcile is where the bug lives** — dedicated tests on
  `verticalDramaStoryboardGeneration.ts:899-952`:
  - a speaker declared `voice_only` is **not** in `required_character_refs`
  - a roster name appearing only inside `dialogue_excerpt` is **not** force-added
  - the same fixtures with the flag off reproduce today's output **exactly**
  - a draft with no `presence` at all behaves exactly as today
- **The phone/photo regression, end to end** — a 2-shot fixture (shot 3 photographs
  with a phone; shot 4 examines the photo) asserting shot 4's prompt names the phone
  as the established device and carries the `from_object` link.
- **Fail-closed interaction** — a `voice_only` character with no approved portrait
  must **not** block the render (today it would throw at
  `verticalDramaEpisodes.ts:1773-1779`). This is a real user-visible win and deserves
  its own test.
- **Real-file skill gates** for every rule added (taught-not-wired guard), plus a gate
  asserting that `## 10. CONTINUITY LOCKS` is now backed by an actual
  `previous_shot` block in the runner — the two must never drift apart again.
- **Flag-off snapshot parity** on every touched prompt builder.

---

## 8. Non-goals (v1)

- No vision-based presence QC (counting faces in the rendered image) — P2.
- No automatic removal of character refs from existing episodes; the prune action is
  explicit and user-invoked.
- No change to dialogue, subtitles, speech budget, voice casting or the video prompt
  for `voice_only` characters — they keep every one of those.
- No second prop store: if Feature 138 has landed, its scene `activeProps` derive
  from this ledger rather than duplicating it.
- No object *appearance* locking (what the phone looks like) — that is 139's look
  layer plus 138's scene layer; 140 only guarantees it is **the same object**.

---

## 9. Sequencing

Implement **after** the current P1 branch
(`planning/vd-p1-identity-scene-continuity/`), as its own branch. Rationale: 140's
bulk lives upstream (draft schema, storyboard reconcile, drafting skills) where the
P1 branch barely reaches, while its small prompt-fact additions rebase cleanly onto
the parameter conventions sections 11/15 establish.

**Coordination points to honor when it lands:**

- `buildStartFrameShotPromptUserPrompt` and `buildStartFrameRenderPlanUserPrompt` will
  by then carry the scene lock (138 §7.4) and the look lock (139 §3.3). The
  `previous_shot` block joins the same `.filter(Boolean)` array with the same
  `null`-when-absent discipline and the same byte-identical proof.
- `skills/vertical-drama-storyboard-shotgrid/skill.md` is edited by P1 section 08 and
  section 15. Serialize; re-run each other's real-file gates.
- `projectStartFramePlan` carry-over is extended by P1 section 10 — extend it again
  here rather than replacing it.
- Feature 138 §11's `activeProps` and this feature's ledger must be reconciled per §3.2
  before either ships prop data to a prompt.

---

## 10. Why this is the highest-value VD quality work after P1

137, 138 and 139 all make a *correct* shot stay correct across time, scene and
series. 140 is different: it stops shots from being **wrong at birth**. A shot with
a person who was never there, or an object that changed identity, is not a continuity
defect to be smoothed — it is unusable output, and the user reports regenerating such
shots constantly. Every repair also re-rolls identity, scene and look, so each
occurrence costs more than one render.

The fix is unusually cheap for its impact: two optional enum-ish fields, one
deterministic fold, three prompt fact lines, and the deletion of one substring match
that was never presence detection in the first place.
