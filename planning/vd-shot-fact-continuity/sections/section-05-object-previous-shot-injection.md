<!-- SECTION: section-05-object-previous-shot-injection -->

# Section 05 — Object facts + the `previous_shot` block

| | |
|---|---|
| **Depends on** | `section-04` (contract + ledger) |
| **Blocks** | `section-06`, `section-07` |
| **Flag** | `verticalDramaShotObjects` |

**This section fixes the phone→SLR failure.** Section 04 recorded what the objects
are; this one puts them where the authoring LLM can see them.

---

## 1. The finding that makes this section necessary

`skills/vertical-drama-cinematic-narrative-image-prompt/skill.md:239-245` contains:

> **## 10. CONTINUITY LOCKS**
> Check and lock, then record what you locked in `continuity_notes`: time of day ·
> light direction · wardrobe and accessories · hairstyle · **objects in hand** · prop
> positions · location state · weather · **emotional carry-over from the previous
> shot** · screen direction…

That skill runs **per shot**, and `buildStartFrameShotPromptUserPrompt`
(`verticalDramaStartFrameGeneration.ts:1605-1787`) hands it **no previous-shot data of
any kind**. `GenerateStartFrameShotPromptParams` (`:1442-1603`) has no neighbor field;
the router loads exactly one draft (`verticalDramaEpisodes.ts:12619-12621`,
`.find(s => s.shot_number === input.shotNumber)`).

The model is ordered to maintain continuity against information it is never given.
This is the taught-not-wired class in its purest form — and it is why shot 4 renders
an SLR: nothing ever told it a phone existed.

The batch path is only incidentally better: all nine shots appear in one prompt
(`:645-702`), so the model *could* notice — but no instruction asks it to reconcile
objects, `continuity_notes` is not passed at all, and **any per-shot regeneration
afterwards discards that context entirely**. Since per-shot repair is the dominant
workflow, the per-shot path is the one that matters.

---

## 2. Three additions, all `null`-when-absent

Each joins an existing `.filter(Boolean)` array with the same discipline the P1 branch
established for the scene lock (138) and the look lock (139): absent ⇒ nothing
emitted ⇒ byte-identical.

### 2.1 Established objects — batch and per-shot

From `resolveEstablishedObjectsForShot` + `renderEstablishedObjectsFact` (section 01):

```
established objects (do not re-invent): มือถือของมายด์ — introduced in shot 3, in hand
```

- **Per-shot:** a new entry in `buildStartFrameShotPromptUserPrompt`'s array, next to
  `canonical_shot_summary`.
- **Batch:** one entry per shot line in `buildStartFrameRenderPlanUserPrompt`
  (`:641-750`), appended to that shot's existing `| …` suffix chain, following the
  same conditional-suffix convention already used for `location` and `speakingOrder`
  (`:653-686`).

### 2.2 Object lineage — the causal line

From `renderObjectLineageFact`:

```
ภาพถ่ายในมือถือ is the output of มือถือของมายด์ (shot 3) — the device must match
```

**This single line is the fix.** It states the constraint the model was missing: not
"there is a phone somewhere", but "the thing you are rendering came *from* that
phone, so the phone must be the same phone."

Emitted only when a shot object carries a resolvable `fromObject`; ambiguous or
dangling references emit nothing (section 01's fail-open rule).

### 2.3 The `previous_shot` reference-only block — per-shot only

New optional param on `GenerateStartFrameShotPromptParams`:

```ts
/**
 * F140 — the immediately preceding shot's facts, for continuity only. Rendered by
 * `renderPreviousShotContextBlock` (shared/verticalDramaSeries/shotObjectLedger.ts).
 * This is what makes the skill's "## 10. CONTINUITY LOCKS" rule obeyable — that rule
 * has existed for a long time and has never had data behind it.
 *
 * Reference-only: the block carries the same "ห้ามคัดลอกลง output" framing as
 * `episodePlanContext`. Absent ⇒ no line at all, byte-identical.
 */
previousShotContext?: string;
```

Rendered as:

```
previous_shot (reference only — for continuity, do not copy into the output):
  shot 3 — summary: มายด์ยกมือถือขึ้นถ่ายภาพป้ายชื่อบนตึก
  objects in play: มือถือของมายด์ (in hand)
  characters in frame: มายด์
  continuity_notes: keep blazer + gold hoops
```

Deliberately **one shot, not a history** — the goal is continuity with the immediately
preceding beat, and a growing transcript would consume the prompt budget the P1 branch
just created.

**Resolved in the router, not the service.** The service has no access to the episode's
other shots; `verticalDramaEpisodes.ts` already loads the plan and the drafts, so it
composes the block and passes a string — the same architecture Feature 138 uses for the
scene lock, and for the same reason.

**Placement:** after `canonical_shot_summary`, before the reference manifest — story
facts together, then attachment facts.

---

## 3. Coordination with the P1 branch

By the time this lands, both builders carry the scene lock (138) and the look lock
(139). Rules:

- Join the **same** `.filter(Boolean)` array; do not create a parallel assembly path.
- Fixed order within the array: `canonical_shot_summary` → `previous_shot` →
  established objects → lineage → scene lock → look lock. Story context first,
  constraints after; assert the index order so a later edit cannot reshuffle it
  silently.
- The byte-identity proof removes **this section's** lines only, so a stale proof from
  another section fails loudly rather than silently — the desired outcome.
- Budget: three short lines. With 138's and 139's blocks present on a 3800-budget
  model, add one boundary test asserting the combination behaves per the P1 branch's
  per-model budget work (no truncation; throw only when genuinely over).

---

## 4. Tests first

New file:
`server/services/__tests__/verticalDramaStartFrameGeneration.objectContinuity.test.ts`
(pure builders, zero mocks — template:
`verticalDramaStartFrameGeneration.referenceFrameMode.test.ts`), plus router wiring
tests.

```
per-shot builder
  no established-objects line when the param is absent (BYTE-IDENTICAL)
  ...and when the shot references only objects it introduced itself
  emits the established line naming the object, its introducing shot and role
  emits the lineage line for a resolvable fromObject          ← THE fix
  emits NO lineage line for a dangling fromObject
  no previous_shot block when the param is absent (byte-identical)
  the previous_shot block carries the exact reference-only preamble
  removing this section's lines reproduces the flag-off prompt byte-for-byte
  the three lines appear in the documented order relative to each other

batch builder
  a shot with no established objects gets no suffix (byte-identical)
  a shot with established objects gets exactly one suffix on its own line
  other shots' lines are unaffected

router wiring
  flag ON: previousShotContext is composed from shot N-1's draft + objects and passed
  flag ON, shot 1: no previousShotContext (there is no previous shot)
  flag OFF: previousShotContext is undefined and NO extra db.select is issued
  the ledger is read from the plan, not recomputed per shot

the acceptance fixture — the reported bug, end to end
  shot 3: objects [{ name: "มือถือของมายด์", role: "in_hand", introduced: true }]
  shot 4: objects [{ name: "ภาพถ่ายในมือถือ", role: "focus", from_object: "มือถือของมายด์" }]
  ⇒ shot 4's prompt names the phone as established AND carries the lineage line
  ⇒ with the flag off, shot 4's prompt is byte-identical to today (an SLR is still
     possible — this is the control case that proves the fix is what changed)

budget
  previous_shot + objects + scene lock + look lock on a 3800-budget model behaves per
  the P1 branch's per-model budget rules
```

---

## 5. Traps

| Trap | Guard |
|---|---|
| Resolving neighbors inside the service | It has no access to other shots. Router composes, service renders — same as 138's scene lock |
| Growing `previous_shot` into a history | One shot only. Budget, and the goal is the preceding beat |
| Emitting a dangling lineage line | Fail-open: no line beats a wrong line |
| Creating a parallel prompt-assembly path | Join the existing `.filter(Boolean)` array; a second path silently diverges from the byte-identity proofs |
| Recomputing the ledger per shot | Read the cached plan copy; recomputing per shot is both wasteful and a divergence risk |
| Fixing only the batch path | Per-shot repair is the dominant workflow; the per-shot block is the one that matters |

---

## 6. Done when

1. Both builders emit the established-objects fact; the per-shot builder also emits
   the lineage line and the `previous_shot` block.
2. The acceptance fixture passes: shot 4 names shot 3's phone and its lineage.
3. Flag off ⇒ every builder byte-identical; no extra DB reads.
4. Line order is asserted, and the combination with 138/139 blocks respects the budget.
5. `pnpm check` clean; P1 Gate A unchanged, Gate B fail-set no new entries.
