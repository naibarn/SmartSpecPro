<!-- SECTION: section-02-presence-contract-reconcile -->

# Section 02 — Presence contract + the reconcile fix

| | |
|---|---|
| **Depends on** | `section-01` (flags + `shotPresence.ts`) |
| **Blocks** | `section-03`, `section-06` |
| **Parallel with** | `section-04` (different files, different flag) |
| **Flag** | `verticalDramaShotPresence` |

**This is the section that fixes failure (A).** Everything else in Part A is cleanup
around it.

---

## 1. The bug, mechanically

After the storyboard LLM returns, `server/services/verticalDramaStoryboardGeneration.ts`
runs a deterministic pass that **overwrites** the model's character list:

```
:899-906   narrativeText = action + narrative_purpose + visual_description
                          + dialogue_excerpt + subtitle_text
:923-924   nameMatches = params.characters.filter(c => narrativeText.includes(c.name))
:938-950   every draft dialogue_lines[].speaker resolvable via speakerLookup
:951-952   shot.characters = resolvedIds
           shot.required_character_refs = resolvedIds        ← LLM's own list discarded
```

Two independent defects live in those four anchors:

1. **`:923-924` is mention detection presented as presence detection.** A roster name
   appearing anywhere in the shot's prose *or its dialogue text* force-adds that
   character. Saying "แม่โทรมาบอกว่า…" out loud puts แม่'s body in the frame.
2. **`:938-950` cannot tell a speaker who is present from a speaker on the phone.**
   The upstream architect skill deliberately writes a phone voice as the **named
   person** (`skills/vertical-drama-full-story-architect/skill.md:88-92`) — correct
   for dialogue, catastrophic for image composition.

Downstream the result is binding: `verticalDramaEpisodePipeline.ts:2985-2992` →
`verticalDramaStartFrameGeneration.ts:397-401` treats the storyboard list as
"groundTruth" that the render skill cannot subtract from, and
`verticalDramaEpisodes.ts:10025-10036` attaches one portrait per ref with a
**fail-closed throw** when a portrait is missing (`:1773-1779`).

The reinforcing skill rule — `skills/vertical-drama-storyboard-shotgrid/skill.md:525-530`
— has no carve-out and is edited in section 06.

---

## 2. The contract

Add `presence` to the character entry at **both** authoring layers. Optional, lenient,
defaulting to `in_frame`.

```jsonc
// shotDraftCharacterSchema — server/services/verticalDramaStoryBible.ts:339-345
{ "name": "แม่", "emotion": "…", "emotion_after": "…",
  "presence": "in_frame" | "voice_only" | "mentioned" }   // NEW, optional
```

```jsonc
// storyboard shot — the LLM keeps emitting `characters` / `required_character_refs`
// as id arrays (unchanged), and gains a parallel declaration:
"character_presence": [ { "character_id": "mae", "presence": "voice_only" } ]  // NEW, optional
```

> **Why a parallel array rather than changing `characters[]` to objects.** The
> storyboard's `characters` / `required_character_refs` are bare `z.array(z.string())`
> (`verticalDramaStoryboardGeneration.ts:229-237`) consumed in several places. Turning
> them into objects is a breaking shape change across the pipeline, the client view
> types and every fixture. A sibling array is additive, ignorable by every existing
> reader, and trivially absent on legacy data.

| Value | Dialogue kept? | Portrait attached? | In `requiredCharacterRefs`? |
|---|---|---|---|
| `in_frame` (default) | yes | **yes** | **yes** |
| `voice_only` | **yes** | no | no |
| `mentioned` | n/a | no | no |

**The load-bearing separation:** `voice_only` characters keep every dialogue-side
behavior — lines, subtitles, speech budget, voice casting, the video prompt. Only
image composition stops treating them as bodies. Any change in this section that
touches a dialogue consumer has overreached.

---

## 3. Implementation

All under `apps/web`. Anchor by symbol name — the P1 branch edits these files first.

### 3.1 Schemas

- `verticalDramaStoryBible.ts:339-345` — `shotDraftCharacterSchema` gains
  `presence: z.string().optional()`. **Never `z.enum`**: a cheap model returning
  `"voice"` or `"off screen"` must not fail the whole draft parse. Coercion is
  `resolveShotPresence`'s job (section 01).
- `verticalDramaStoryboardGeneration.ts:229-265` — the shot schema gains
  `character_presence: z.array(z.object({ character_id: z.string(), presence: z.string() }).passthrough()).optional()`.
- `shared/verticalDramaSeries/contracts.ts` — `frames[]` gains the audit field:

```ts
/** F140 — character refs deliberately EXCLUDED from this frame's image references
 *  because the shot declared them voice_only / mentioned. Audit + QC only; never
 *  read back into the reference set. Absent on every legacy frame. */
nonPresentCharacterRefs?: Array<{ characterId: string; presence: string }>;
```

⚠️ Any new **plan-level** key would be wiped by `projectStartFramePlan` (it builds a
fresh literal). `frames[]` entries are carried per-shot instead — but confirm against
the P1 branch's section 10, which extends that carry-over, and add
`nonPresentCharacterRefs` to it if per-frame carry is desired across plan regens.
Recommended: **do not carry it** — it is derived, and a regenerated plan recomputes it.

### 3.2 The reconcile (the actual fix)

`verticalDramaStoryboardGeneration.ts:899-952`, all gated on the flag threaded in from
the caller:

1. Build `presenceByCharacterId` from the shot's `character_presence` plus the draft
   shot's `characters[].presence`, resolved through `resolveShotPresence`. Draft and
   storyboard disagreeing ⇒ **the more restrictive wins** (`mentioned` <
   `voice_only` < `in_frame`), because a declaration that someone is not there is a
   deliberate authoring act and an accidental omission defaults to present.
2. **Substring match no longer feeds required refs.** `:923-924` may still compute
   `nameMatches`, but under the flag its output is a *suggestion set* used only to
   fill `shot.characters` where the LLM said nothing — it must never reach
   `required_character_refs`. With the flag off, keep today's behavior exactly.
3. **Speaker force-add becomes presence-aware.** `:938-950` adds a speaker only when
   the resolved presence is `in_frame`. An undeclared speaker still defaults to
   `in_frame`, so legacy drafts are untouched.
4. `:951-952` writes `required_character_refs` from the `in_frame` set only, and
   records the excluded ids with their presence for the audit field.

### 3.3 Everything that counts characters must count only `in_frame`

Three consumers silently assume "required ref = body in frame". Each is a real,
user-visible defect today when a phone voice is in the list:

| Consumer | Anchor | Fix |
|---|---|---|
| `speakingOrder` (positions characters left-to-right by dialogue order) | `verticalDramaStartFrameGeneration.ts:499`, emitted `:1726-1728` | exclude non-`in_frame` speakers — otherwise the prompt positions a ghost |
| `required_character_count: N (all must appear in frame)` | `:682-685`, `:1740-1742` | count `in_frame` only |
| `remapCameraSetupForRequiredCharacters` (widens the shot to fit everyone) | `:693-696` | count `in_frame` only — today a phone call silently widens a close-up |

The third is worth stating plainly: a two-hander that becomes a wide shot because
someone phoned in is a composition defect nobody would attribute to presence.

---

## 4. Tests first

New file: `server/services/__tests__/verticalDramaStoryboardGeneration.characterPresence.test.ts`.
Copy the mock header from the existing storyboard-generation suite. `mockReset()` in
`beforeEach` for anything given `…Once` values.

```
the reconcile — flag ON
  a speaker declared voice_only is NOT in required_character_refs
  ...but their dialogue_lines are untouched          ← the safety guarantee
  a character declared mentioned is NOT in required_character_refs
  a roster name appearing ONLY inside dialogue_excerpt is NOT force-added
      ← the substring-match fix; today this is how a mentioned name becomes a body
  a roster name appearing in visual_description IS still available to `characters`
      (suggestion set) but does not by itself create a required ref
  an in_frame speaker IS force-added (the original guarantee is preserved)
  a character with NO presence declared defaults to in_frame and is added
      ← the legacy-data guarantee
  draft says voice_only + storyboard says in_frame ⇒ the RESTRICTIVE one wins
  excluded ids are recorded on frames[].nonPresentCharacterRefs with their presence

the reconcile — flag OFF
  output is byte-identical to today for every fixture above
      (same characters, same required_character_refs, same order)
  no nonPresentCharacterRefs key is emitted at all

counting consumers
  speakingOrder omits a voice_only speaker
  required_character_count counts in_frame only
  remapCameraSetupForRequiredCharacters does not widen for a voice_only character
  all three are unchanged with the flag off

schemas
  a draft character with presence "voice" (typo) parses and resolves to in_frame
  a storyboard shot with no character_presence parses exactly as today
  an unknown extra key in character_presence passes through without throwing
```

**The fixture to build first**, because it is the reported bug end to end: a shot
whose `dialogue_lines` contain `{ speaker: "แม่", line: "…" }` with
`presence: "voice_only"`, whose `dialogue_excerpt` also contains the string "แม่",
and whose `characters` list from the LLM contains only the protagonist. Flag on ⇒
`required_character_refs` is the protagonist alone. Flag off ⇒ both, as today.

---

## 5. Traps

| Trap | Guard |
|---|---|
| Using `z.enum` for `presence` | A weak model's `"voice"` would fail the whole draft parse. String + lenient resolver, per section 01 |
| Defaulting to a restrictive presence | Would silently remove characters from every existing episode. Default is `in_frame`, and a test pins it |
| Removing the substring match entirely | It still has value as a *suggestion*; only its path into `required_character_refs` is cut. Flag-off must keep today's behavior exactly |
| Touching a dialogue consumer | `voice_only` keeps lines, subtitles, speech budget, casting, video prompt. If a diff touches those, revert it |
| Changing `characters[]` to an object array | Breaking shape change across pipeline, client view types and every fixture. Use the parallel `character_presence` array |
| Forgetting the three counting consumers | The bug persists as a widened camera and a ghost in `speakingOrder`, which reads as an unrelated framing defect |
| A new plan-level key | `projectStartFramePlan` deletes unknown plan-level keys. This section adds a per-frame field only |

---

## 6. Done when

1. Both schemas accept `presence` / `character_presence` leniently; legacy input
   parses unchanged.
2. Flag on: a `voice_only` speaker keeps their dialogue and is absent from
   `required_character_refs`; a name mentioned only in dialogue text is not added.
3. Flag off: every fixture is byte-identical to today, and no new key is emitted.
4. `speakingOrder`, `required_character_count` and the camera remap count `in_frame`
   only under the flag.
5. `frames[].nonPresentCharacterRefs` records exclusions for section 03's warning.
6. `pnpm check` clean; the P1 branch's Gate A unchanged and its Gate B fail-set a
   subset with no new entries.
