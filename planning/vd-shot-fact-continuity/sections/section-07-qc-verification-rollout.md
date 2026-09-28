<!-- SECTION: section-07-qc-verification-rollout -->

# Section 07 — QC, verification, rollout

| | |
|---|---|
| **Depends on** | `section-03`, `section-06` (transitively all) |
| **Blocks** | – (last section; the branch merges after this) |
| **Flags** | both, still default **false** at merge |

Every earlier section proved its own change. This section proves the **branch**: both
flags off is byte-identical, both flags on actually fixes the two reported failures,
and the fixes are measurable after rollout.

---

## 1. The object-drift warning

Section 03 added `VD_START_FRAME_UNSTAGED_CHARACTER` for failure (A). This is its
twin for failure (B), using the same shipped `VerticalDramaWarning` shape
(`contracts.ts:49-57`) and the `stageQcWarnings` channel
(`verticalDramaEpisodePipeline.ts:3447` → `:4266` → persisted `:1842`):

```ts
code: "VD_SHOT_OBJECT_IDENTITY_DRIFT",
severity: "warning",
message: `Shot ${n}: "${name}" derives from "${source}" (shot ${m}) but that object was not carried into this shot's facts — the rendered device may not match.`,
targetStage: stage, targetShotNumber: n, repairable: true,
```

Deterministic triggers, no vision call:

1. A shot object declares `from_object` naming something **not in the ledger**
   (dangling lineage — the authoring layer named it inconsistently).
2. A shot references an object whose ledger entry is **ambiguous** (two display names
   collapsed to one key) — the system declined to assert an identity, and the user
   should know why.
3. A shot's `focus` object has a `from_object` whose source object is **absent from
   this shot's own objects** — i.e. examining a photo without the phone in play.

Vision-based drift detection (does the rendered device match?) is **out of scope** —
spec §8. These three cover the authoring-side causes, which is where the bug starts.

---

## 2. Flag-off parity — the branch-level proof

Each section proved "my lines disappear when my flag is off". Thirteen individually
correct diffs can still compose into a changed default path (a reordered array, a
newly threaded `undefined` reaching a `JSON.stringify`, an extra `db.select`).

Capture-or-compare harness, same technique the P1 branch's section 14 uses:

**Surfaces (one fixture case each):**

| id | Surface |
|---|---|
| `sfg-per-shot` | per-shot start-frame user prompt |
| `sfg-batch` | 9-shot batch render-plan user prompt |
| `storyboard-reconcile` | the reconciled `characters` / `required_character_refs` for a fixture episode |
| `plan-projection` | `startFramePlan` key set + per-frame carry-over field list |
| `repair-merge` | `computeRepairedStartFramePlan` output |
| `attach-manifest` | the resolved character attachment manifest (order + ids) |

**Capture protocol:** produce the fixtures from a worktree at the **merge-base**, not
from the branch with flags off — otherwise the proof is circular. Copy the harness in
untracked, run it there in capture mode, copy the JSON back, commit, then run it on the
branch in compare mode. Record the base sha and a hash of the frozen param set in
`manifest.json`; a test asserts the hash still matches, so editing the params after
capture fails loudly instead of silently invalidating the proof.

**Never edit a fixture to make a test pass.** A red parity case is a behavior change on
the default path — fix the owning section.

Also assert, for both flags off:

```
Test: requiredCharacterRefs for the fixture episode is identical to the baseline
Test: the router issues the same number of db.select calls as the baseline
Test: no new key appears anywhere on startFramePlan (Object.keys comparison,
      not toEqual — toEqual tolerates an explicit undefined)
```

---

## 3. Both flags on — the acceptance tests

These are the two reported failures, written as executable acceptance criteria.

### 3.1 Failure (A) — the phone call

```
Fixture: shot 5, dialogue_lines [{ speaker: "แม่" }], แม่ declared voice_only,
         dialogue_excerpt also contains the literal "แม่",
         มายด์ declared in_frame

Test: required_character_refs === ["มายด์"]                    ← nobody else
Test: แม่'s dialogue line is unchanged and still attributed to แม่
Test: speakingOrder omits แม่
Test: required_character_count === 1 and the camera is NOT widened
Test: no portrait is attached for แม่
Test: with แม่ having NO approved portrait, the render still proceeds   ← the win
Test: VD_START_FRAME_UNSTAGED_CHARACTER does NOT fire (nothing was wrongly included)
Test: an episode created BEFORE this branch, with แม่ baked into the refs, fires the
      warning and is cleaned by pruneNonPresentCharacterRefs
```

### 3.2 Failure (B) — the phone and the photo

```
Fixture: shot 3 objects [{ name: "มือถือของมายด์", role: "in_hand", introduced: true }]
         shot 4 objects [{ name: "ภาพถ่ายบนหน้าจอ", role: "focus",
                           from_object: "มือถือของมายด์" }]

Test: shot 4's per-shot prompt contains the established-objects line naming
      มือถือของมายด์ and its introducing shot
Test: shot 4's prompt contains the lineage line stating the device must match
Test: shot 4's prompt contains a previous_shot block listing shot 3's objects
Test: the batch render plan carries the established line on shot 4's line
Test: with both flags OFF, shot 4's prompt is byte-identical to the baseline
      ← the control: an SLR is still possible, proving the fix is what changed
Test: renaming shot 4's from_object to something absent fires
      VD_SHOT_OBJECT_IDENTITY_DRIFT and emits no lineage line (fail-open)
```

---

## 4. Real-LLM gate additions

The P1 branch creates the first VD real-LLM gate
(`verticalDramaP1RealLlmGate.ts` + a `describe.skipIf` live suite enabled only by an
env var equal to the exact string `"1"`, never in the default run). Extend the same
evaluator rather than building a second one:

New failure codes:

```
presence_declaration_missing   // a phone/off-screen speaker got no presence declaration
unstaged_character_referenced  // a voice_only character reached required_character_refs
object_not_named               // a shot whose action uses an instrument declared no objects[]
object_lineage_missing         // a shot examining a derived object declared no from_object
```

Live cases (authoring calls only, no paid renders):

```
Test: given a beat where a character phones another, a real model declares the caller
      voice_only  ← proves the architect skill rule was actually taught
Test: given a beat where a character photographs something, a real model names the
      instrument in objects[]
Test: given the following beat that examines the photo, a real model links it with
      from_object
Test: the reconcile keeps the voice_only speaker out of required_character_refs
      end to end
```

This is the only test that can prove the **skills** were taught what the runners
request — the real-*file* gates prove a literal exists, not that a model honors it.

---

## 5. GA metric

Both flags stay OFF at merge; enabling is per tenant, one flag at a time, internal
tenant first. Make the GA decision measurable rather than a judgement call — emit one
audit line per repair, reusing the existing audit-JSONL helper:

```
vd_shot_repair  { episodeId, shotNumber, reason, hadPresenceDeclared, hadObjectsDeclared }
```

`reason` distinguishes the causes the user named: `unusable_image`, `wrong_characters`,
`object_mismatch`, `video_distortion`, `other`. Then the GA question — *"did per-shot
repairs caused by wrong characters or wrong objects actually fall?"* — is a query, not
an opinion.

Document the exact query in the runbook.

---

## 6. Runbook — `docs/runbooks/vertical-drama-shot-fact-continuity.md`

Model it on the P1 branch's runbook. Required content:

- **What each flag does**, one paragraph each, with spec links.
- **Enable order:** `verticalDramaShotObjects` **first** (it only adds context, so it
  is safe to observe alone), then `verticalDramaShotPresence` (it subtracts characters
  and can change who appears in future renders).
- **Rollback:** flip the flag off. No deploy, no migration, no cleanup — `presence`,
  `objects` and `objectLedger` are additive jsonb keys that become inert.
  **One exception to state plainly:** `pruneNonPresentCharacterRefs` is destructive by
  design; it edits `requiredCharacterRefs` on existing episodes and is **not** undone
  by turning the flag off. Recommend running it with `dryRun` first, on one episode.
- **What to watch:** how often the unstaged-character warning fires (a high rate means
  the architect skill is not declaring presence, not that the code is wrong); how often
  object drift fires; whether the repair rate for `wrong_characters` and
  `object_mismatch` falls.
- **Known limitations** (§7).
- The real-LLM gate command and its cost.

Spec updates in the same PR: mark 140's scope delivered, and record any deviation
taken during implementation — in particular the section-04 decision about Feature
138's `activeProps`.

---

## 7. Known limitations carried forward

| Limitation | Why acceptable |
|---|---|
| No vision check that the rendered image actually excludes the voice_only character | The declaration/reference mismatch is where the bug originates and is deterministic; a vision check is P2 |
| No vision check that the rendered device matches the established object | Same reasoning; the three authoring-side triggers cover the causes |
| `previous_shot` is one shot, not a history | Budget, and the goal is continuity with the preceding beat |
| Existing episodes need an explicit prune | Removing a ref changes an approved composition; the user must own that |
| Generic object names silently produce no established-object fact | Fail-open by design (asserting a wrong identity is worse). The skill teaches specific naming; the drift warning surfaces the ambiguity |
| Legacy drafts get no presence or objects | Defaults keep them behaving exactly as today; backfill is not attempted |

---

## 8. Exit criteria

- [ ] Both acceptance fixtures (§3.1, §3.2) pass with both flags on.
- [ ] Both control cases (flags off) are byte-identical to the merge-base capture.
- [ ] The parity harness's `manifest.json` records the base sha and a matching
      param-set hash.
- [ ] `VD_START_FRAME_UNSTAGED_CHARACTER` and `VD_SHOT_OBJECT_IDENTITY_DRIFT` fire on
      their fixtures, are repairable, and never block.
- [ ] The taught-not-wired cross-check from section 06 is green.
- [ ] The real-LLM gate's four new codes are implemented offline and the live suite is
      **skipped** by default; it has been run manually once with `passed: true`.
- [ ] The P1 branch's Gate A is unchanged and its Gate B fail-set has no new entries.
- [ ] `pnpm check` adds no new errors; `npm run build:deploy` succeeds.
- [ ] Runbook committed; spec 140 updated; both flags still default `false`.
- [ ] The section-04 decision about Feature 138's `activeProps` is recorded.
