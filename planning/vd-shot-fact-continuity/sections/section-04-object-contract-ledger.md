<!-- SECTION: section-04-object-contract-ledger -->

# Section 04 — Object contract + episode ledger + persistence

| | |
|---|---|
| **Depends on** | `section-01` (`shotObjectLedger.ts`) |
| **Blocks** | `section-05`, `section-06` |
| **Parallel with** | `section-02` |
| **Flag** | `verticalDramaShotObjects` |

Failure (B) — a phone becoming an SLR — has two halves. This section adds the missing
**data**; section 05 gets it into the prompt.

---

## 1. What exists today: nothing

| Question | Answer (verified) |
|---|---|
| Structured prop field in the storyboard shot schema? | **NOT FOUND.** The full field list is `shot_number, timecode, duration_seconds, narrative_purpose, emotion, characters, required_character_refs, location, action, visual_description, camera{…}, lighting, facial_expression, body_language, gaze_direction, dialogue_excerpt, subtitle_text, continuity_notes, image_prompt, negative_prompt, age_suitability, source_beat_indexes, silence_intent, target_speech_seconds, change_type` |
| In `shotDraftSchema` (`verticalDramaStoryBible.ts:363-390`)? | **NOT FOUND** — `shot_number, summary, dialogue_lines, silence_intent, tie_in, contract, characters, location_key` |
| Any prop type at all? | `VerticalDramaProp` (`contracts.ts:76-81`) + `recurringProps` (`:125`) — **grep returns exactly one hit repo-wide: their own declaration.** Dead type, no feature |
| Closest live field? | `contract.newClueIds` (`verticalDramaStoryBible.ts:321`) — flag-gated, consumed only by a budget check (`verticalDramaDialogueChecks.ts:73-83`), never reaches an image prompt |
| Anything carrying an object shot N → N+1? | **NOT FOUND.** `canonicalShotSummary` is per-shot and non-cumulative (`verticalDramaEpisodePipeline.ts:2823-2829`); the pipeline→`storyboardShots[]` mapping (`:3010-3025`) drops `action`, `continuity_notes` and `image_prompt` |

So objects exist **only** as prose inside `summary` / `visual_description` / `action`.
The architect skill even designates the summary as the dumping ground:
*"Incidental extras (e.g. 'พนักงานเสิร์ฟ') may appear inside `summary` but never in
`characters`"* (`full-story-architect/skill.md:59-60`).

The user's own diagnosis — "เรื่องย่อไม่ละเอียดพอ" — is right, but incomplete: **even a
perfect synopsis would not survive to the next shot**, because nothing carries it.

---

## 2. The contract

```jsonc
// shotDraftSchema — server/services/verticalDramaStoryBible.ts:363-390, NEW field
"objects": [
  { "name": "มือถือของมายด์", "role": "in_hand", "introduced": true },
  { "name": "ภาพถ่ายในมือถือ", "role": "focus", "from_object": "มือถือของมายด์" }
]
```

`role` ∈ `in_hand | focus | in_scene | referenced` (section 01 owns the tuple).
All fields lenient — `z.array(z.object({ name: z.string() }).passthrough()).optional()`;
**never `z.enum`**, because a weak model returning `"held"` must not fail the draft.

Mirror it as an optional passthrough on the storyboard shot schema so the storyboard
LLM can add objects it introduces (a prop visible in the frame that the draft did not
name), but **the draft is authoritative** where both declare the same object.

### 2.1 The ledger

`buildEpisodeObjectLedger` (section 01) folds the drafts in shot order into
`Map<key, VdObjectLedgerEntry>`. Deterministic, pure, no LLM.

**Where it lives:** derive it where the shot drafts are already in hand —
`verticalDramaEpisodePipeline.ts` near `canonicalShotSummaryByShotNumber`
(`:2823-2829`) — and cache the *derived* result on the plan:

```ts
// VerticalDramaStartFramePlan — plan level
/** F140 — derived from the episode's shot drafts; the single source for
 *  established-object facts. Cached, never hand-authored, safe to recompute. */
objectLedger?: { entries: VdObjectLedgerEntry[]; derivedFromShotCount: number };
```

> ⚠️ **The carry-over trap.** `projectStartFramePlan` returns a **fresh literal** and
> deletes every plan-level key it does not name — the exact hazard Feature 138's
> section 10 documents for `sceneVisualStates`. `objectLedger` **must** be added to
> that carry-over, or it vanishes on the next `start_frame_render_plan` regeneration.
> Because it is *derived*, the safe rule is: recompute when the drafts are available,
> carry the cached copy otherwise. A regression test that regenerates a plan and
> asserts the ledger survives is mandatory.

Also extend the pipeline→`storyboardShots[]` mapping (`:3010-3025`) to carry each
shot's `objects` — today that mapping drops `action`/`continuity_notes`/`image_prompt`,
which is part of why nothing survives the hop.

---

## 3. The open question this section settles

Feature 138's Scene Visual State carries `activeProps` (scene-level set dressing:
"brown envelope on the ledge"). This branch adds shot-level `objects[]` plus the
ledger (instrument identity, causal chains). **Two prop stores is not acceptable.**

| | 138 `activeProps` | 140 `objects` + ledger |
|---|---|---|
| Scope | one scene | one shot + episode-wide chain |
| Purpose | static dressing that must not drift or leak | which instrument was used; what derives from what |
| Example | "brown envelope on the ledge" | "the phone that took the photo shot 4 examines" |

**Decision to record before writing code** (plan §5 recommends (a)):

- **(a) Ledger is the source.** 138's `activeProps` becomes a projection over ledger
  entries whose shots fall inside that scene. One authoring surface; 138's renderer
  reads the ledger.
- **(b) Separate with a written boundary.** Cheaper; requires a comment in both places
  explaining why a phone lives in one and an envelope in the other.

If Feature 138 has already shipped, prefer (a) and adapt its renderer. If it has not,
(b) with a TODO is acceptable — but the decision must be written into this section's
review notes either way, because the next reader will otherwise build the second store.

---

## 4. Tests first

New file: `server/services/__tests__/verticalDramaEpisodePipeline.objectLedger.test.ts`
(mirror `verticalDramaEpisodePipeline.distinctLocations.test.ts`'s mocking pattern),
plus schema cases in the draft/storyboard suites.

```
schemas
  a draft shot with no `objects` parses exactly as today (legacy guarantee)
  an object with an unknown role parses and coerces to in_scene
  an object with a blank name is dropped, the rest survive
  an unknown extra key passes through without throwing

ledger derivation
  the ledger is built from the shot drafts in ascending shot order
  introducedInShot is the first appearance and never moves
  an object re-declared in a later shot updates lastSeenInShot and appends its role
  two display names normalizing to one key mark the entry ambiguous
  a shot with no objects contributes nothing and does not break the fold

persistence + the carry-over trap
  objectLedger is written onto the plan when the flag is on
  NO objectLedger key at all when the flag is off (byte-identical plan object)
  the ledger SURVIVES a start_frame_render_plan regeneration          ← the trap
  the per-frame carry-over list is otherwise unchanged (regression guard)
  storyboardShots[] now carries each shot's objects
  an episode whose plan predates this field regenerates without error

determinism
  building the ledger twice from the same drafts is deep-equal
  the fold does not mutate the input drafts
```

**The test to write first** is the regeneration one. If the ledger does not survive a
plan regen, section 05's prompt facts silently stop appearing after the user's first
storyboard edit — and that failure looks exactly like "the feature doesn't work".

---

## 5. Traps

| Trap | Guard |
|---|---|
| A plan-level key wiped by `projectStartFramePlan` | Explicit carry-over + the regeneration test |
| `z.enum` on `role` | A weak model's `"held"` would fail the whole draft parse |
| Building a second prop store beside 138's `activeProps` | §3 forces the decision before code |
| Trusting `introduced: true` from the model | The ledger decides introduction by first appearance; the flag is advisory only |
| Ambiguous keys silently asserting an identity | Section 01's fail-open rule: ambiguous ⇒ emit nothing |
| Forgetting the pipeline mapping | `storyboardShots[]` drops fields it does not name; objects must be added explicitly |

---

## 6. Done when

1. `objects[]` parses leniently on both the draft and storyboard shot schemas; legacy
   input is unchanged.
2. The ledger is derived deterministically, cached on the plan under the flag, and
   **survives a plan regeneration** (tested).
3. `storyboardShots[]` carries per-shot objects.
4. Flag off ⇒ no new key anywhere, plan object byte-identical.
5. The 138-`activeProps` relationship decision is written into the review notes.
6. `pnpm check` clean; P1 Gate A unchanged, Gate B fail-set no new entries.
