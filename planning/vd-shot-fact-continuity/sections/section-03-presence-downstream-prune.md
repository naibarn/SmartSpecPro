<!-- SECTION: section-03-presence-downstream-prune -->

# Section 03 — Presence downstream: repair, prune, fail-closed, warning

| | |
|---|---|
| **Depends on** | `section-02` |
| **Blocks** | `section-07` |
| **Flag** | `verticalDramaShotPresence` |

Section 02 stopped the reconcile from **adding** non-present characters. This section
handles the three places that would otherwise **re-add** them, plus the two
user-facing consequences: existing episodes need a way to be cleaned, and a wrongly
included character must stop **blocking renders**.

---

## 1. The repair pass re-adds what section 02 excluded

`server/services/verticalDramaShotCharacterRepair.ts` —
`computeRepairedStartFramePlan` / `repairEpisodeShotCharacterReferences`, exposed as
the `repairEpisodeShotCharacterReferences` mutation (`verticalDramaEpisodes.ts:9399`)
and the script `scripts/repair-episode-character-refs.ts`.

Its doc comment (`:1-30`) states the contract: it union-merges **every resolvable
dialogue speaker** into `requiredCharacterRefs` and **"Never removes an existing
ref"**. Left alone, one repair run silently undoes section 02 for the whole episode.

**Change, flag-gated:** its *additions* become presence-aware — a speaker is merged
only when the shot's resolved presence for them is `in_frame`. The
"never removes" invariant **stays**: this mutation must remain safe to run blind.
Removal is a separate, explicit action (§2).

---

## 2. `pruneNonPresentCharacterRefs` — the cleanup for existing episodes

Every episode created before this branch has `voice_only` characters baked into
`requiredCharacterRefs`. Section 02 only affects **future** storyboard reconciles.

New mutation, on the flag-gated procedure:

```ts
/**
 * Remove character refs from an episode's frames where the shot's declared presence
 * is voice_only / mentioned. USER-INVOKED ONLY — never automatic, never part of the
 * repair pass, because removing a ref changes an already-approved shot's composition
 * and the user must own that decision.
 *
 * Returns a per-shot preview of what WOULD be removed when `dryRun` is true, so the
 * UI can show the change before it happens.
 */
pruneNonPresentCharacterRefs: verticalDramaShotPresenceProcedure
  .input(z.object({
    seriesId: z.string().min(1),
    episodeId: z.string().min(1),
    shotNumbers: z.array(z.number().int().positive()).optional(),  // default: all
    dryRun: z.boolean().optional(),
  }))
  .mutation(/* … */),
```

Rules:

- Copy `setShotLocation`'s guard chain (`verticalDramaEpisodes.ts:9307-9386`):
  `requireTenantId` → `parseId` → `loadOwnedEpisode` → validate → spread-patch →
  `db.update` → return the updated plan. Cross-tenant ⇒ `NOT_FOUND`.
- **Never removes a ref that has an approved image already using it** unless the
  caller passes an explicit override — a shot whose rendered frame contains that
  person is evidence the declaration is wrong, not the image.
- Records what it removed on `frames[].nonPresentCharacterRefs` so the action is
  auditable and reversible by hand.
- `dryRun: true` performs no write.

---

## 3. The fail-closed portrait guard must stop blocking renders

`resolveRequiredShotCharacterAttachmentManifest`
(`verticalDramaEpisodes.ts:1711-1798`) **throws** when a required ref has no approved
portrait (`:1773-1779`), before credits are reserved.

Today that means a wrongly-added phone-call character does not merely corrupt the
image — **it blocks the shot from rendering at all**, with an error that names a
missing portrait and gives no hint that the real problem is a character who should
never have been in the list.

Because section 02 keeps such characters out of `requiredCharacterRefs`, this
resolves itself for new episodes. For existing ones, and as defence in depth:

- When the flag is on and a ref's resolved presence is not `in_frame`, **skip it**
  before the capacity assertion and before the throw.
- Keep the throw for genuinely `in_frame` characters — that guard is correct and
  protects identity.
- Log the skip with the shot number and character id.

**This is the most immediately visible user win in the branch:** episodes that cannot
render today start rendering, with the right people in them.

---

## 4. `VD_START_FRAME_UNSTAGED_CHARACTER` — closing VD's asymmetry

VD already warns when a required character is **missing** from a generated prompt —
`VD_START_FRAME_CHARACTER_IDENTITY_MISSING`
(`verticalDramaEpisodePipeline.ts:3869-3882`, produced by
`findMissingCharacterIdentityWarnings`). **There is no check in the opposite
direction.** A character wrongly present is invisible to QC, which is why this failure
survived so long.

Add, using the shipped `VerticalDramaWarning` shape (`contracts.ts:49-57`) and the
existing `stageQcWarnings` channel (`verticalDramaEpisodePipeline.ts:3447`, merged at
`:4266`, persisted `:1842`):

```ts
code: "VD_START_FRAME_UNSTAGED_CHARACTER",
severity: "warning",
message: `Shot ${n}: "${name}" is declared ${presence} for this shot but appears in the image references — they may be rendered as physically present.`,
targetStage: stage, targetShotNumber: n, repairable: true,
```

Trigger: a frame whose `requiredCharacterRefs` contains an id whose resolved presence
is not `in_frame`. Deterministic, no vision call, fail-open.

**Vision-based detection** (counting faces in the rendered image) is deliberately out
of scope — spec §8. This warning catches the declaration/reference mismatch, which is
where the bug actually originates.

---

## 5. UI (minimal)

- The existing repair/QC surface gains the new warning with its Thai message and a
  one-click "ตัดตัวละครที่ไม่ได้อยู่ในเฟรมออก" action calling
  `pruneNonPresentCharacterRefs` for that shot.
- The shot card shows a small chip when a shot has non-present characters declared
  (`vd-storyboard-voice-only-${shotNumber}`, e.g. "เสียงนอกเฟรม: แม่") so the user can
  see the declaration was understood. Copy the engine-badge pattern from
  `VerticalDramaStoryboardPanel.tsx:4614-4634`.
- Both gated on the flag; absent entirely when off.

---

## 6. Tests first

```
repair pass (verticalDramaShotCharacterRepair)
  flag ON: a voice_only speaker is NOT merged into requiredCharacterRefs
  flag ON: an in_frame speaker IS merged (unchanged behavior)
  flag ON: an EXISTING ref is still never removed by this pass
      ← the "safe to run blind" invariant must survive
  flag OFF: output byte-identical to today for every fixture

pruneNonPresentCharacterRefs
  removes voice_only / mentioned refs from the requested shots
  defaults to every shot when shotNumbers is omitted
  dryRun performs no write and returns the same preview
  does NOT remove a ref whose shot already has an approved image using it,
      unless the explicit override is passed
  records removals on frames[].nonPresentCharacterRefs
  enforces ownership (cross-tenant ⇒ NOT_FOUND) and leaves sibling plan keys intact
  is FORBIDDEN when the flag is off

fail-closed guard
  flag ON: a voice_only ref with NO approved portrait does NOT throw; the render
      proceeds without that person        ← the episodes-that-cannot-render win
  flag ON: an in_frame ref with no portrait STILL throws (identity guard intact)
  flag OFF: both cases throw exactly as today
  the capacity assertion counts only the refs that survive the skip

warning
  a frame whose refs include a voice_only id emits VD_START_FRAME_UNSTAGED_CHARACTER
      with the right shot number and name
  a clean frame emits nothing
  the existing MISSING-character warning is unchanged (both directions coexist)
  flag OFF emits nothing

UI (jsdom, props-only)
  the chip renders only when the flag is on and a non-present character is declared
  the warning's repair action calls the prune mutation for that shot
```

---

## 7. Traps

| Trap | Guard |
|---|---|
| Making the repair pass *remove* refs | It must stay safe to run blind. Removal belongs to the explicit prune action |
| Auto-pruning existing episodes | Changes approved compositions without consent. User-invoked, with a dry run |
| Skipping the portrait throw for everyone | Identity protection for real characters would be lost. Skip only non-`in_frame` refs |
| Emitting the warning from a vision call | Out of scope; the declaration/reference mismatch is deterministic and is where the bug starts |
| Forgetting the capacity assertion | It runs before the merge and counts refs; skipped refs must not count toward the model's reference cap |

---

## 8. Done when

1. The repair pass no longer re-adds non-present speakers, and still never removes.
2. `pruneNonPresentCharacterRefs` exists with a dry run, ownership guards, the
   approved-image safeguard, and an audit trail.
3. A `voice_only` character with no portrait no longer blocks a render; an `in_frame`
   one still does.
4. `VD_START_FRAME_UNSTAGED_CHARACTER` fires on a declaration/reference mismatch and
   is repairable from the UI.
5. Flag off ⇒ every path byte-identical, mutation FORBIDDEN, no chip, no warning.
6. `pnpm check` clean; P1 Gate A unchanged, Gate B fail-set no new entries.
