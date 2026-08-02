# Marketplace Auto Review — 4-character cast with per-shot presence, looks, and supporting-cast story beats

## Context

Marketplace Auto Review can attach **2** reference characters (host + guest) and they are
sent to **every** shot. The user wants the Vertical Drama experience instead:

- up to **4 characters**, freely mixing Drama Series characters with self-uploaded images,
  counted together against one cap;
- a **per-shot character row** on the shot card — pick who is in this shot, edit it, and
  **switch a character's look** — visually and behaviourally the same as the VD storyboard
  shot card;
- all of it feeding the **start-frame image** for each shot's video.

On the dialogue question the user was explicit: **two main speakers stay the spine.**
Characters 3–4 are *supporting* — they may or may not have a line, may carry business/action,
and **must earn their place in the frame**: raise atmosphere, add a story beat, or pull the
viewer's emotion. Their words: a child playing with the product without speaking, or an extra
who says "ฉันก็ใช้อันนี้นะ". Explicitly rejected: a supporting character who just sits there
contributing nothing.

That framing is what makes this tractable — the existing `host`/`guest` dialogue engine and
its LLM planner prompt stay intact, and supporting cast becomes an **orthogonal layer**.

---

## What exists today (verified)

| Fact | Where |
|---|---|
| Input cap `.max(2)` + `characterRole: "host"\|"guest"` | `apps/web/shared/hyperframes/characterCast.ts:23,47` |
| Seed cap `characterEntries.length < 2`, role by index | `marketplaceAutoReviewService.ts:22478,22516` |
| Derive cap `.slice(0, 2)` | `marketplaceAutoReviewStagedPipelineService.ts:378` |
| ~7 more `slice(0,2)` + hardcoded two-speaker Thai/EN prompt prose | `marketplaceAutoReviewStoryArcPlanner.ts:659,809,925,1173,1176-1199,479-513` |
| `castInShot` exists in the contract but is **always the full cast**, never a subset | `stagedContracts.ts:151`; written at `planner.ts:708,1319` |
| Start-frame refs = **whole manifest for every shot**; `castInShot` never read | `stagedPipelineService.ts:1649-1683` |
| Skill-first prompt seam **drops cast entirely** | `marketplaceAutoReviewStagedCheckpointRouterService.ts:1421-1460` |
| Picker dialog has look `<select>` but **discards** the look's identity on confirm | `MarketplaceDramaCharacterPickerDialog.tsx:160-174` |
| Looks ARE available from the server (`looks[].characterId/variantLabel/portraitAssetId`) | `verticalDramaExtensionReadService.ts:1059-1067` |
| No per-shot component — the shot card is inline JSX | `StagedCheckpointReviewPanel.tsx:2573+` |
| Image model is not the bottleneck (`google-banana-2`, `maxReferenceImages: 14`) | `seed-media-models-kie-ai.ts:1710` |
| Reusable pure helpers already shipped | `VerticalDramaStoryboardPanel.tsx` — `buildShotCharacterLookOptions`, `swapShotCharacterRefKey` |

---

## Design

### 1. Cast model — 2 leads + up to 2 supporting

Extend `characterRole` additively to `"host" | "guest" | "support"`, cap the roster at 4, at
most one `host` and one `guest`.

**`resolveStagedConversationMode` keeps counting LEADS only** (`planner.ts:48`). Solo and
`two_person_conversation` behave exactly as today; the two-speaker planner prompt, the
deterministic `buildShotDialogueTurnsTH/EN`, `buildStagedTwoVoiceDescriptor` and their tests
are untouched. This is the single decision that keeps the change affordable.

### 2. Per-shot presence — `castInShot` becomes real

`castInShot` already exists in `StagedShotStateV1Schema`; make it an actual subset. Leads
default to present; supporting presence is authored per shot. Nothing new to persist.

### 3. Supporting beats — the "must not be idle" rule, skill-first

New additive per-shot field (contract + planner shot type):

```ts
supportingBeats?: Array<{ castId: string; action: string; line?: string }>
```

Ownership follows this repo's skill-first rule (`project_marketplace_staged_skill_first`,
`feedback_skill_first_authoring`):

- **TypeScript supplies FACTS only** — the supporting roster (name, `ageRange`, portrait,
  `@ImageN` tag) and who is present in this shot.
- **The skill authors** `action` (required) and `line` (optional, short). All creative prose —
  what the child does with the toy, what the extra says — lives in
  `apps/web/skills/product-review-sequential-storyboard/skill.md`, never in TS.
- **A deterministic validator enforces the rule, fail-closed**: a supporting character present
  in a shot with a missing/empty `action` is a schema issue → one bounded corrective retry,
  exactly the pattern `findLeadPromptQualityIssues` and the region-anchor gate already use in
  `verticalDramaCharacterImageGeneration.ts`. A supporting `line` may never replace a lead
  turn: when `conversationMode === "two_person_conversation"` both leads must still have
  turns.

`skill.md` edits (both case twins — `skill.md` is loaded first, see
`project_vd_skill_dualcase_file_drift`): a new **Supporting Cast** section, and
"**Casting is fixed per run**" (line 246) becomes "*lead* casting is fixed per run;
supporting presence is per shot".

### 4. Per-shot looks — override, don't spend a slot

New additive per-shot field:

```ts
castLooks?: Record<string /*castId*/, { url: string; portraitAssetId?: string; variantLabel?: string }>
```

A look changes which image represents a person **in that shot only**; the cap counts *people*,
not outfits. Requires the picker dialog to stop discarding variant identity — emit
`vdBaseCharacterId` (family root, for finding sibling looks) **and** `vdCharacterId` (the
variant row's own id) **and** `variantLabel`. Uploaded characters have no family → the look
button hides, same rule as VD.

### 5. Image assembly — where it all becomes real

`handleImageProvider` (`stagedPipelineService.ts:1649-1683`) builds the ordered reference list
from **this shot's** present characters (with `castLooks` applied) instead of the whole
manifest. `@ImageN` indices therefore become per-shot, so the same per-shot ordered list must
be handed to `buildStagedSingleShotRefreshInput`
(`marketplaceAutoReviewStagedCheckpointRouterService.ts:1421-1460`) together with each entry's
`characterName`/`characterRole` — today it passes neither, which is why the skill would have
no idea who `@Image2..@Image5` are.

### 6. UI

- **Caps 2 → 4** in both surfaces: `MarketplaceCaptureProductDetail.tsx:4844,5711,5722,4828`
  and `StagedCheckpointReviewPanel.tsx:767,896,2260`; role `<select>` gains ตัวประกอบ; the
  "โหมดสนทนา 2 คน" badge counts leads, and the cap warning text becomes 4.
- **New per-shot character row** in the staged shot card, inserted after the header block
  (`StagedCheckpointReviewPanel.tsx:2578`), mirroring the VD storyboard chip row: `w-16`
  portrait chips (`aspect-[3/4]`, `variantLabel ?? name`), a **shirt** button opening the look
  menu, and a **pencil** opening a multi-select "who is in this shot" dialog.
- **Extract the two VD helpers** into `apps/web/client/src/lib/shotCharacterLooks.ts`, generic
  over the portrait shape; `VerticalDramaStoryboardPanel.tsx` re-exports them so its existing
  suite keeps passing unchanged, and the marketplace row imports the same logic rather than a
  copy.

---

## Honest limits — say these out loud

1. **Supporting characters get beats, not arcs.** One action + at most one short line per shot.
   A genuine 3–4-way conversation needs the `castRosterBlock`/`buildShotDialogueTurns*` rewrite
   the user set aside.
2. **Identity fidelity degrades with 4 faces.** 1 product + 4 character refs is 5 of the model's
   14 slots, so nothing is dropped — but image models hold 2 identities far better than 4.
   Expect weaker per-face likeness in crowded frames; this is a model limit, not a wiring one.
3. **The child example walks into the minor-safety gate.** `guardianReferenceIndex` is currently
   "the first `role === "character"` entry" (`…CheckpointRouterService.ts:1404-1406`) and
   `productChildRelated` is hardcoded `false`, so with 4 characters the guardian is
   misidentified. Per `project_marketplace_minor_safety_qa_grounding`, silence reads as "a minor
   may be present" and can block a whole run's images. Each roster entry therefore needs an
   explicit `depictsMinor` fact, and the guardian index must be derived from it — **this is
   required work, not optional**, or the user's own toy-and-child scenario burns credits and
   fails QA.

---

## Phases (each independently shippable)

**P1 — cast capacity + per-shot wiring.** `characterRole` enum, cap 2→4, remove the `slice(0,2)`
chain, `castInShot` as a real subset, `castLooks`, per-shot reference assembly, cast identity
passed to the skill seam, `depictsMinor` + guardian derivation. UI caps raised. *After P1 four
characters work end to end; presence is chosen by the planner, not yet by hand.*

**P2 — supporting beats.** `supportingBeats` contract, skill.md Supporting Cast section, the
fail-closed idle-supporting validator, video-prompt pass-through. *After P2 supporting characters
carry story function.*

**P3 — per-shot UI.** The chip row, look switcher, and who-is-in-this-shot dialog; helper
extraction. *After P3 the user edits per-shot cast and looks by hand, like VD.*

---

## Files to modify

**Shared/contract** — `shared/hyperframes/characterCast.ts`,
`shared/marketplaceAutoReview/stagedContracts.ts`
**Server** — `routers/marketplaceCapture.ts`, `services/marketplaceAutoReviewService.ts`,
`marketplaceAutoReviewStagedPipelineService.ts`, `marketplaceAutoReviewStoryArcPlanner.ts`,
`marketplaceAutoReviewStagedCheckpointRouterService.ts`,
`productReviewSequentialStoryboardSkillRunner.ts`
**Skill** — `apps/web/skills/product-review-sequential-storyboard/{skill.md,SKILL.md}` (keep twins identical)
**Client** — `pages/MarketplaceCaptureProductDetail.tsx`,
`components/marketplaceCapture/{StagedCheckpointReviewPanel.tsx,MarketplaceDramaCharacterPickerDialog.tsx}`,
new `lib/shotCharacterLooks.ts`, `components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` (re-export only)
**Plan record** — `planning/marketplace-four-character-cast/plan.md`

---

## Verification

- **Unit**: roster cap/role assignment; `castInShot` subset → per-shot reference ordering;
  `castLooks` override; the idle-supporting validator (present-with-no-action must fail, and a
  supporting line must not displace a lead turn); look-identity round-trip through the picker;
  extracted look helpers (VD's existing suite must stay green as a regression check).
- **Suites to keep green**: `marketplaceAutoReviewStagedPipeline*.test.ts`,
  `marketplaceAutoReviewStoryArcPlanner.test.ts`, `StagedCheckpointReviewPanel.test.tsx`,
  `MarketplaceDramaCharacterPickerDialog.test.tsx`,
  `VerticalDramaStoryboardPanel.lookSwitcher.test.ts`.
- **Real-LLM gate** (per `project_vd_skill_taught_not_wired` — a skill rule that is authored but
  never *requested* in the prompt contract is silent dead code): one real staged run with 2
  leads + 1 child + 1 extra, asserting from the audit log that the request carried the
  supporting roster and that the response returned a non-empty `action` for each supporting
  character.
- **End-to-end on smartaihub.app**: a 4-character job — confirm each shot's start frame receives
  only that shot's characters, a per-shot look switch changes one shot and no other, and no
  minor-safety block on the child scenario.

---

## Implementation log

### P1 — server side COMPLETE (2026-08-01)

Shipped in one commit; every suite that was green stayed green (the 9 remaining
failures in the marketplace sweep were verified pre-existing against a HEAD worktree:
6 Feature-136 snapshots, plus `perShotIndependence`, `selfHealPersist` and
`sequentialEvidencePersistence`, all other sessions' in-flight work).

* `shared/hyperframes/characterCast.ts` — `support` role, cap 4, `depictsMinor`,
  `vdBaseCharacterId`/`variantLabel`, and `assignMarketplaceCastRoles` as the single
  role assigner. Invariants: never two hosts; an explicit `support` is never promoted
  into a free lead seat; at least one lead whenever anyone is cast.
* `resolveStagedConversationMode` now counts **leads**, not roster size — the decision
  that let the roster grow without touching the two-voice dialogue engine. A legacy
  2-entry roster still resolves `two_person_conversation`.
* `shared/marketplaceAutoReview/shotCast.ts` (new) — the ONE answer to "which character
  images does shot N get, in what order", used by all three call sites so `@ImageN`
  can never drift from the images actually sent.
* `handleImageProvider` + `buildStagedImagePrompt` + `buildStagedSingleShotRefreshInput`
  all consume it. `buildStagedImagePrompt` carries each character's ORIGINAL roster
  index alongside the filtered list, because `castId`/`plan.cast` are positional over
  the full roster.
* Cast identity now actually reaches the skill: `SequentialReferenceManifestEntry` gained
  `characterName`/`characterRole`/`variantLabel`/`depictsMinor` **and** they are spread
  into `reference_manifest` in the skill payload — the type alone would have been
  taught-not-wired dead code.
* Guardian index = first character with `depictsMinor !== true`, no longer "first
  character". `undefined` stays eligible, so behavior is byte-identical for runs that
  never stated the fact.

### Remaining

* **P1 client** (task 4) — caps 2→4 on both surfaces, ตัวประกอบ role option, lead-based
  conversation badge, and the picker must stop discarding look identity.
* **P2** (task 5) — supporting beats + skill.md + fail-closed idle validator.
  **Ship before or with P1's client half**: until P2 lands, a supporting character can be
  rendered into a frame with no story instruction, which is the "นั่งเฉย ๆ" the user
  explicitly rejected.
* **P3** (task 6) — per-shot chip row + look switcher UI.

### P2 + P3 — COMPLETE (2026-08-01)

**P2 — supporting beats.** `supportingBeats: [{castId, action, line?}]` (action required, line
optional — the inverse of a dialogue turn) on both the planner shot type and
`StagedShotStateV1Schema`. The story planner is handed the supporting roster as FACTS plus one
structural rule; WHAT a supporting character does is the model's judgment, and the creative
contract lives in `skills/product-review-sequential-storyboard/skill.md` (new **Supporting
Cast** section, twins kept identical; "Casting is fixed per run" is now "LEAD casting is fixed
per run; supporting presence is per shot").

Enforcement is `enforceSupportingBeats`, and it works by CONSTRUCTION rather than rejection: a
supporting character the model gave no action is **removed from that shot's `castInShot`**, so
their reference image is never sent and they cannot appear idle. Rejecting-and-retrying was
rejected as a design — it is the same trap `pinApprovedCanonicalDesignDna` had to undo the same
week. Worst case a supporting character appears in fewer shots; no path fails the run. It also
makes an absent `castInShot` explicit once a supporting tier exists, closing the hole where
"everyone" would have meant "a beatless extra in every frame".

Beats surface in the image prompt (TH + EN) and the video prompt, in their own block AFTER the
lead turns so a supporting line can never be mistaken for a main voice.

**P1 client.** Caps to 4 on both surfaces via the shared constant; ตัวประกอบ role option; the
conversation badge counts LEADS (a host + 2 supporting is still "พูดคนเดียว", with a
"+ ตัวประกอบ N" chip); the duplicate-role nudge is now about a duplicated LEAD role. The picker
keeps the look's own `vdCharacterId` + `vdBaseCharacterId` + `variantLabel` instead of
discarding them, matches selection on the family root, and assigns roles against the roster the
panel already holds so picking into a run that has a host never mints a second one.

**P3 — per-shot UI.** `client/src/lib/shotCharacterLooks.ts` holds the generic look helpers;
`VerticalDramaStoryboardPanel` re-exports them (its suite passes unchanged, which is the
regression proof). New `StagedShotCharacterRow` renders portrait chips, a shirt look menu, a
pencil who-is-in-this-shot picker, and each supporting character's action as a caption so the
user can see WHY an extra is in frame. Persisted by the new free
`updateStagedAutoReviewShotCast` mutation, which patches only `castInShot`/`castLooks` on the
addressed shot. Choosing "ลุคหลัก" CLEARS the override rather than pinning the base url.

Precedence fixed along the way: `resolveShotCastSelectionFromMetadata` now prefers the STATE
shot over the PLAN shot for `castInShot` — a user who removes someone from a shot must not have
the planner put them back.

**Tests:** 283/283 marketplace client (a suite that was 17-red before is now green), 990-run
server+shared sweep at the same 9 pre-existing failures, VD storyboard unchanged at its 3
pre-existing failures. Built and restarted; `[SkillRegistry] Auto-sync complete: 1 synced`
confirms the skill edit reached the registry.

**Not done (deliberate):** the real-LLM gate and the end-to-end 4-character run on
smartaihub.app. Both need a paid run and the user's own product.

### Follow-up round (2026-08-01, from user review of the live panel)

**1. Roster-level look selector.** The picker offered looks only at ADD time and the new
switcher only overrides ONE shot, so there was no way to change a character's default look
after adding them. Added a 👕 dropdown on each VD-sourced roster card
(`updateCharacterManifestLook`) that rewrites the entry's `url` + look identity for the whole
run. It clears `portraitAssetId` — that id pointed at the PREVIOUS look's asset and wins over
`url` at generation time, so leaving it would silently resolve the old outfit back. Position in
the manifest is preserved so positional `castId`s keep addressing the same people. Hidden for
uploaded photos (no look family).

**2. Regenerating the story after adding characters — already possible, plus two bugs found.**
"ร่างเนื้อเรื่องใหม่ (ใช้ LLM)" (`redraftStagedMarketplaceAutoReviewRun`) re-derives `cast` from
the manifest and re-authors every shot, and it stays available after approval
(`storyEditAvailable`). Investigating it surfaced two real defects:

* **Redraft could not place newly added characters.** `stagedMetadataForPlan` carried the
  previous revision's `castInShot` over via `{...existingShot}`, and state wins over plan — so
  any shot the user had hand-edited stayed pinned to the OLD cast forever. Now cleared on
  redraft; per-shot LOOK overrides survive, because a look is about a person, not the story.
* **Positional castIds go stale when the roster changes.** `cast-1..cast-4` are positions over
  the character manifest, so removing or reordering a character silently re-points every
  per-shot `castInShot`/`castLooks` at a DIFFERENT person — wrong character in the frame, or
  the right one in someone else's outfit. `updateStagedAutoReviewReferenceManifest` now detects
  a changed character roster and drops per-shot cast state.

  *Known limitation:* this is a reset, not a remap. Stable ids (keyed on the character rather
  than its position) would preserve per-shot edits across roster changes, but `castId` is
  referenced by `dialogueTurns`, `castInShot` and the persisted plan, so that is a larger
  refactor than this feature warranted.

Tests: 1272-run sweep, same 9 pre-existing failures; 6 new precedence/staleness tests.

### Gap-closing round (2026-08-01) — cast-first flow

Closes the four gaps found by reviewing a fresh job end to end, plus the flow change that
prevents paying for the story twice.

**1. Character facts reach the planner (`descriptor`).** The picker fetched
`occupation`/`narrativeRole`/`role`/`description` from the series and discarded all four on
confirm, so `StagedCastMember.descriptor` was NEVER populated by anything and the planner only
ever knew a name + role + age. New `buildDramaCharacterDescriptor` joins them (deduped, clamped
to 400) and they now flow picker -> cast payload -> seeded manifest -> `deriveStagedCastFromManifest`
-> `descriptor`, which `castRosterBlock` already rendered. This is the single change that makes
the story actually about the character rather than a generic script with a name attached.

**2. `depictsMinor` is now settable.** It was plumbed contract -> server -> guardian with no UI,
so the child case still resolved as "not stated". Added a checkbox on BOTH cast surfaces, plus
`inferDepictsMinorFromAgeRange` to seed it from the series' own age text. The inference returns
`undefined` for anything it cannot read confidently — silence must stay distinguishable from an
affirmative "adult".

**3. Full cast editing at creation time.** The creation card was display-only (and its 2-way
role ternary labelled every supporting character "เปิดเรื่อง/ถาม" — a defect introduced by the
third role). It now carries a role select, a look select, and the minor checkbox.

**4. Cast-first, so the story is authored once.** The story LLM call happens inside
`initializeStagedMarketplaceAutoReviewRun`, i.e. the moment the run starts — so any cast change
afterwards costs a second generation. Rather than restructure the pipeline into a deferred
story stage, casting was made COMPLETABLE before submit (items 1-3), with an explicit warning at
the point of decision on the creation page, and a matching warning on the staged panel that
editing cast there does not rewrite the story by itself and requires "ร่างเนื้อเรื่องใหม่".

*Considered and rejected:* a server-side `castLocked` checkpoint that defers story authoring.
It buys little once casting is completable up front, and would add a new checkpoint state to a
pipeline that already gates the expensive step (images) behind plan review.

Tests: 1307-run sweep, same 9 pre-existing failures; 8 new tests for the two picker helpers.

### Look-selector fixes (2026-08-01, from user report)

Two separate reasons the look control appeared missing, both real:

**1. Picker: the look select was `disabled={selected}`.** Ticking a character FROZE their look,
so the only way to change it was to untick and start over — a character that plainly had looks
read as broken. Now enabled, with `applyLookToSelection` re-pointing the existing selection in
place (position, and therefore lead/support ordering, preserved). Switching back to "ภาพต้นแบบ"
clears the variant label.

**2. Roster cards: silent absence for a look-less character.** ไอริณ/ภาคิน have ZERO variant rows
in either คาเฟ่รีโนเวท series (verified in the DB), so `buildStagedShotLookOptions` correctly
returned `[]` and the control hid itself — indistinguishable from a broken feature. Both
surfaces now render an explicit "👕 ยังไม่มีลุคอื่น" chip for a VD character with no looks,
tooltipped with where looks are created. Uploaded photos still render nothing, since they have
no look family at all.

### Presenter-mode conflict + story LLM (2026-08-01, from user review)

**Presenter mode vs drama cast — a real contradiction, now resolved.** The "Character /
Presenter" selector and the Drama Series cast block were completely independent: the block
rendered and `characterCast` was sent regardless of mode. So Product-only ("Do not generate a
visible person.") or Hands-only ("do not generate a recurring face.") could ship 2-4 character
portraits AND a two-person conversation cast in the same request — contradictory instructions,
wasted reference slots, and a story written for people who must not appear.

The MODE wins: `autoReviewModeUsesCast` (true only for `described_character` /
`uploaded_reference`) gates the panel, empties the `characterCast` payload, and stops a cast
from satisfying `hasCharacterReference`. The picked cast is KEPT in state — a mode mis-click
must not destroy casting work — and a notice says so.

**Story/skill LLM was auto-picked CHEAPEST-first.** `generateStagedStoryArcPlanWithLLM` resolved
"อัตโนมัติ" via `selectQualityLargeContextEligibleModels(rows)[0]`, which is sorted
cheapest-first — that is why runs showed `google/gemini-3.1-flash-lite`, the exact model behind
the 2026-07-18 lead-beauty-gate incident. Vertical Drama moved to the admin-curated recommended
set on 2026-07-31 (`resolveQualityLargeContextModelId`); the marketplace planner was left
behind, and it matters far more now that a 4-person cast with supporting beats is structured
output a lite model gets wrong (`project_vd_weak_model_json_class`).

Now: auto-selection calls `resolveQualityLargeContextModelId` (recommended set, priority
order), and a new `storyPlanningModel` override lets the user pick explicitly — surfaced in the
advanced panel as "โมเดล LLM (เขียนเนื้อเรื่อง/รัน skill)" defaulting to "แนะนำ (อัตโนมัติ)",
sourced from the same recommended-first `listQualityPlanningModels` the redraft picker uses.
Threaded creation -> `referenceAnchors.storyPlanningModel` -> init AND redraft, so a redraft
cannot silently drop to a weaker model than the one that authored revision 1.

Note: `storyPlanningModel` is absent-by-default in `buildDefaultHyperframesAutoPlanDefaults()`,
following this file's binding decision §3.4 for decorative override keys (my first attempt set
it to `null` there and broke the feature-136 shape guard).

Tests: 3083-run sweep, 13 failures all pre-existing (the 9 marketplace/VD ones plus 4 unrelated
shared suites: finance, notification flags, publicApi flag, layoutDsl).

### Drama cast locked to `uploaded_reference` (2026-08-01, user proposal)

Earlier the cast was allowed in both `described_character` and
`uploaded_reference`. The user asked whether it should be locked to
`uploaded_reference` only — it should, and `described_character` was a real
mistake vector, not just an aesthetic one.

A picked character IS a reference identity: real portrait, name, age,
personality. `described_character` builds its identity from the
เพศ/วัย/ลักษณะ/ลุค dropdowns and sends a `describedSummary` for a GENERATED
person. Layering real portraits on top hands the model two competing
identities — leave gender on "ผู้หญิง 20-29" while casting คิริน (male) and the
directive and the reference image flatly disagree, with nothing in the pipeline
to arbitrate.

`autoReviewModeUsesCast` is now `uploaded_reference` only. The other three modes
show a notice naming the correct mode (the picker button lives inside that
panel, so a hidden panel would otherwise leave no signpost), and the mode card's
own description now reads "…หรือเลือกนักแสดงจาก Drama Series". The picked cast
is still kept in state across mode switches.

### Descriptor ordering fix (same round)

Verified against real data (series 18): the roster rows carry no
description/personality at all, and the picker's fallback to the series bible's
`refinedCharacters` is what actually supplies them —
`"เจ้าหน้าที่ประสานงานตารางบินที่ฉลาดและรับมือแรงกดดันได้ดี…"`.

`buildDramaCharacterDescriptor` had `description` LAST behind a 400-char clamp,
so a fully-profiled character (Description | Personality | Backstory | Identity
lock | Wardrobe rules) would have had its personality cut and kept only job
titles — the exact failure the field exists to prevent. `description` now goes
FIRST and the ceiling is the shared `MARKETPLACE_CHARACTER_DESCRIPTOR_MAX` (900),
asserted against the wire schema so the two can't drift.

**Series genre/tone/logline/mainPlot remain deliberately NOT pulled.** A product
review is not a continuation of the drama's plot. Only the person travels.

### Uploaded character reference was dropped on staged runs (2026-08-01)

Reported: "ได้แนบตัวละครแบบ upload ไว้แล้ว แต่พอถูกส่งมาหน้านี้ ตัวละครหาย".

Checked the run itself rather than guessing — `mar_7ad4117099970f8973831b02a5652fbb`:

```
characterMode      = "uploaded_reference"
characterImageUrl  = "/api/storage/files/chat/uploads/1/KlSzmfN4lI-....png"
customReferenceManifest = []          <- empty
```

So the mode was right and the upload was stored; the manifest simply never received
it. NOT a regression from the mode-lock — a pre-existing gap:

* `buildSeededStagedCharacterCastManifest` returned `null` whenever `characterCast`
  was empty; it only ever read the drama-picked cast.
* `grep characterImageUrl` across the staged pipeline: **zero hits** — nothing
  downstream reads the anchor either.
* With an empty manifest, `handleImageProvider` falls back to the hero product image
  alone (`.slice(0, 1)`).

Net effect: an uploaded presenter reached neither the review panel ("0 ภาพแนบ /
พูดคนเดียว") nor any start frame, and the story was authored as a solo narration.

Fix: `referenceAnchors.characterImageUrl` now seeds the manifest as a `role:
"character"` entry. It goes FIRST (in "อัปโหลด reference" mode it is the identity the
user chose, so it takes the host seat) and combines with a drama cast under the same
4-person cap. The seeding trigger widened from "has cast" to "has cast OR has anchor";
the grep-guard test was updated to match, plus two behaviour tests.
