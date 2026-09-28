<!-- SECTION: section-06-drafting-and-prompt-skills -->

# Section 06 — Drafting and prompt skills

| | |
|---|---|
| **Depends on** | `section-02` (presence contract), `section-05` (the `previous_shot` block must exist before a rule may depend on it) |
| **Blocks** | `section-07` |
| **Flag** | both (each rule conditions on a caller-stated fact) |

Sections 01–05 built the fields and the plumbing. **Nothing populates them yet** —
the authoring LLMs have never been told these facts exist. This section is where the
feature stops being dead weight.

It is also where the user's other complaint — *"เรื่องย่อไม่ละเอียดเพียงพอ"* — is
addressed at its source.

---

## 1. Skills touched

| Skill | Change |
|---|---|
| `vertical-drama-full-story-architect` | declare `presence`; name instruments in `objects[]`; link derived objects via `from_object`; two worked examples. **Lowercase `skill.md` only — this folder has NO `SKILL.md` twin; do not create one** |
| `vertical-drama-storyboard-shotgrid` | the speaker-must-be-in-frame rule gains its carve-out; mirror `character_presence`; carry objects through |
| `vertical-drama-cinematic-narrative-image-prompt` | `## 10. CONTINUITY LOCKS` becomes obeyable — bind it to the real `previous_shot` block |

All rules are **conditional on a caller-stated fact**, following the shipped
`## NATIVE AUDIO DIRECTION (conditional — only when the caller states native_audio: true …)`
precedent. With the flags off the facts never appear and the rules stay dormant — that
is how a skill-file edit can be unconditional in the file yet inert in effect.

⚠️ **`vertical-drama-storyboard-shotgrid/skill.md` is also edited by the P1 branch**
(section 08's identity-safe shot boundaries and same-scene lighting clause, and section
15's look-lock register clause). Serialize: land one, re-run the other's real-file gate,
then append. Copy lowercase → `SKILL.md` after every edit.

---

## 2. Architect skill (`vertical-drama-full-story-architect`)

### 2.1 Presence

The skill currently instructs, at `skill.md:88-92`, that a voice through a device be
written as the **PERSON** speaking:

> A device, a group, or an off-screen sound is NOT a character. A radio, an
> announcement, or a crowd belongs in `summary` or in the `line` text — never as a
> `speaker`. If a voice comes through a radio, the speaker is the PERSON speaking, if
> they are in the bible…

That rule is **correct and must stay** — it is right for dialogue, casting and
subtitles. What it lacks is the other half. Add:

> When a character speaks but is **not physically in the shot** — on the phone, over
> an intercom, from another room, shouting off-screen — declare
> `presence: "voice_only"` on their entry in that shot's `characters[]`. They keep
> their dialogue lines exactly as before; the declaration only tells the image layer
> not to draw them.
> A character who is **talked about but not present at all** is
> `presence: "mentioned"`. Everyone physically visible is `"in_frame"` (the default —
> omit it if you like).

Worked example (the reported case) belongs in the skill:

```jsonc
// shot 5 — มายด์รับสายจากแม่ที่โรงพยาบาล
"characters": [
  { "name": "มายด์", "emotion": "ตกใจ", "presence": "in_frame" },
  { "name": "แม่",   "emotion": "อ่อนแรง", "presence": "voice_only" }
],
"dialogue_lines": [ { "speaker": "แม่", "line": "…", "delivery": "เสียงสั่น" } ]
```

### 2.2 Objects and instruments

New rules:

- When a shot's action **uses an instrument** — photographing, filming, recording,
  calling, writing, unlocking, paying — the instrument must be **named** in
  `objects[]` with `role: "in_hand"`. Not left implicit in `summary`.
- When a later shot **examines, shows, or refers to the output** of an earlier action
  (a photo, a recording, a message, a document), that object must reference its origin
  with `from_object` naming the earlier object **exactly as written before**.
- Objects merely spoken about are `role: "referenced"`.
- Name objects the way a props master would: specific enough to be the same object
  twice (`"มือถือของมายด์"`, not `"โทรศัพท์"`), because a generic name collides with
  every other phone in the episode and the system will decline to assert an identity.

Worked example (the reported bug, as the skill should have prevented it):

```jsonc
// shot 3
"summary": "มายด์ยกมือถือขึ้นถ่ายภาพป้ายชื่อบนตึก",
"objects": [ { "name": "มือถือของมายด์", "role": "in_hand", "introduced": true } ]

// shot 4
"summary": "มายด์ซูมดูภาพที่เพิ่งถ่าย เห็นเงาคนสะท้อนบนกระจก",
"objects": [
  { "name": "มือถือของมายด์", "role": "in_hand" },
  { "name": "ภาพถ่ายบนหน้าจอ", "role": "focus", "from_object": "มือถือของมายด์" }
]
```

### 2.3 Synopsis quality — the user's other complaint

The `summary` rule (`skill.md:52-55`) already says *"Write it so an artist who has read
nothing else can stage the shot"*. Strengthen it with the two specifics that fail in
practice:

- if an object is **used**, say which object;
- if this shot shows the **result** of a previous shot's action, say so explicitly.

The structured `objects[]` is what carries it forward, but the summary is what a human
reads — and the two must agree.

---

## 3. Storyboard skill (`vertical-drama-storyboard-shotgrid`)

### 3.1 The carve-out

`skill.md:525-530` currently reads:

> When a draft shot's `dialogue_lines[]` names a speaker, that speaker's character id
> MUST be included in this shot's `characters`/`required_character_refs` — even a
> brief reverse-shot listener line counts. Extra non-speaking characters are allowed;
> a SPEAKING character missing from the list is not — a line whose speaker isn't in
> the frame makes the video invent a stand-in.

**Keep it — and add the exception it has always lacked:**

> **Exception (when the draft declares presence):** a speaker whose draft entry says
> `presence: "voice_only"` or `"mentioned"` is **not** in the frame and must **not**
> be added to `required_character_refs`. Their line still belongs to them — the
> stand-in problem this rule prevents does not apply to a voice that is never seen.
> Mirror the declaration into this shot's `character_presence[]`.

Add a `character_presence[]` example to the skill's worked output so the shape is
unambiguous.

### 3.2 Objects

- Carry every draft object into the shot's `objects[]` unchanged.
- The storyboard may **add** an object it introduces visually (a prop in frame the
  draft did not name), but must **not rename** a draft object — renaming breaks the
  ledger's identity matching, which is the whole point.
- `continuity_notes` remains free text; objects are now structured. Do not duplicate
  the same fact in both.

---

## 4. Cinematic-narrative skill — make `## 10. CONTINUITY LOCKS` obeyable

The rule at `skill.md:239-245` orders the model to lock "objects in hand · prop
positions · … carry-over from the previous shot". Section 05 finally supplies the
`previous_shot` block. Bind them:

> When the caller provides a `previous_shot` block, lock against **it** —
> specifically the objects it lists and the characters it says were in frame. An
> object named there is the **same object**: do not substitute a different device,
> model or kind for it. When no `previous_shot` block is present, lock against this
> shot's own facts only and do not invent continuity you cannot see.

That last sentence matters as much as the first: without it, the rule keeps ordering
the model to reconcile against data it does not have — which is the state that
produced the bug.

---

## 5. Gates (tests first)

New file:
`server/services/__tests__/verticalDramaShotFactRealSkillFile.test.ts`. Template:
`verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` — reads the real files via
`vi.importActual<typeof import("fs")>("fs")` and **mirrors** the loader's path formula
rather than importing it.

```
architect skill
  declares "presence" with all three values
  contains the voice_only worked example
  declares "objects" with all four roles and "from_object"
  contains the phone/photo worked example
  the ORIGINAL device-voice rule (:88-92) is still present (added to, not replaced)
  the folder has NO SKILL.md         ← assert the absence so a future "fix" cannot
                                        create a divergent twin

storyboard skill
  the speaker-must-be-in-frame rule is still present
  ...AND now contains the presence carve-out (assert both — a replacement is a bug)
  declares character_presence[] with a worked example
  skill.md and SKILL.md are byte-identical

cinematic-narrative skill
  "## 10. CONTINUITY LOCKS" is still present
  it now references the previous_shot block by the literal header constant
      VD_PREVIOUS_SHOT_CONTEXT_HEADER (section 01)
  skill.md and SKILL.md are byte-identical

the taught-not-wired cross-check — the point of this file
  the literal the skill conditions on is EXACTLY the header the runner emits
      (import the constant; do not retype it)
  a rendered previous_shot block starts with that header
  ⇒ if either side is removed or renamed, this test fails loudly rather than the
    feature silently going dead again — which is precisely what happened to the
    original CONTINUITY LOCKS rule
```

---

## 6. Traps

| Trap | Guard |
|---|---|
| Replacing the speaker rule instead of adding the exception | The rule prevents a real defect (a speaking character missing from frame). Both assertions in the gate |
| Deleting the architect's device-voice rule | It is correct for dialogue. Only its image-side consequence needed a companion |
| Editing only `SKILL.md` | Loader reads lowercase first; the change would be dead. Copy, then assert byte-identity |
| Creating `SKILL.md` for the architect folder | It has none by design; the gate asserts the absence |
| Concurrent edits with the P1 branch's sections 08 and 15 | Serialize on `storyboard-shotgrid/skill.md`; re-run each other's gates |
| Generic object names | The ambiguity rule (section 01) makes the system silently decline to assert identity — the skill must teach specific naming, or the feature under-delivers with no error |
| Writing rules with no caller-stated activation fact | Flag-off behavior would change. Every rule conditions on a fact the runner emits |

---

## 7. Done when

1. All three skills carry their new rules with worked examples, and every pre-existing
   rule they extend is still present (asserted, not assumed).
2. The architect folder still has no `SKILL.md`; the other two have byte-identical twins.
3. The taught-not-wired cross-check passes: the skill's literal and the runner's
   emitted header are the same constant, imported once.
4. Flags off ⇒ no activation fact is emitted, so the rules are inert; prompt output is
   byte-identical.
5. P1 Gate A unchanged; Gate B fail-set no new entries; storyboard-generation suites green.
