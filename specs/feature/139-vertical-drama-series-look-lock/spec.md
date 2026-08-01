# Feature 139: Vertical Drama Series Look Lock — One Visual Direction for Every Shot

Version: 1.1.0
Date: 2026-08-01
Status: P1 implementation complete; rollout quality evidence pending
Priority: P1 (quality-critical; user-reported, and the fix is mostly wiring)
Depends-on: Feature 131 (storyboard/start-frame pipeline), Feature 131S §8.2.2 (preset visual identity — already built)
Related: Feature 137 (identity: the PERSON stays the same person), Feature 138 (scene: the PLACE stays the same place). **139 = the LOOK stays the same look.** Implemented as section 15 of `planning/vd-p1-identity-scene-continuity/` because it injects at the same four prompt builders as 138 P1.
Source: user report 2026-07-23 — "ตอนเดียวกัน แต่คนละช็อตก็ออกมาคนละโทนกันเลย" plus a proposed 5-genre style catalog.

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-23 | Initial look-lock proposal and current-state audit. |
| 1.1.0 | 2026-08-01 | Approved P1 reconciliation: retain the existing `VerticalDramaPresetVisualIdentity` slot, add one editable series look with provenance, wire every image-authoring path, use a dedicated default-off flag, and land in the shared 137/138 P1 builder bundle. No preset backfill or video color-grade work. |
| 1.2.0 | 2026-08-01 | Code integration is complete behind `verticalDramaSeriesLookLock` (default off). Joint flag tests cover coexistence with Features 137/138; internal genre-quality labeling and GA rollout remain operational gates. |

### Approved implementation scope (2026-08-01)

- Keep exactly one **effective** generation identity in
  `bible.presetVisualIdentity`; do not introduce a second governing style object.
  A non-governing inherited-source snapshot is allowed solely so a user can switch
  back to the preset/AI-mix look after trying a genre/manual override.
- Add the five-entry editable catalog, create/settings UI, provenance, batch and
  per-shot injection, and conditional same-register skill clauses.
- Keep `canonical_style_bible` one-way in P1: the series lock constrains
  storyboard authoring; the episode value remains a display artifact.
- Keep video prompt shaping and ffmpeg color grading out of scope.

---

## 1. Executive summary

Shots of one sub-episode render in visibly different tones. The user proposed a
series-creation UI offering ~5 genre styles whose prompt is appended to every
start-frame generation.

**The investigation found that most of that machinery already exists and is simply
not connected.** `shared/verticalDramaSeries/presetVisualIdentity.ts` (527 lines)
defines a full typed visual-identity contract — `styleName`, `palette`, `lighting`,
`cameraGrammar`, `imagePromptFragments {positive[], negative[]}` — with a
deterministic merge, a blend report, and a `visualIdentityJson` jsonb column
(`drizzle/schema.ts:21396`). What is missing is not the concept; it is four things:

1. **The 9-shot batch render plan — where all nine prompts are authored in ONE LLM
   call — receives nothing.** `GenerateStartFrameRenderPlanParams`
   (`verticalDramaStartFrameGeneration.ts:450`) has no style field at all, and
   `generateRealStartFramePlan` never reads the series' visual identity. This single
   gap explains the reported symptom better than anything else: the one call that
   could trivially make all nine shots agree is style-blind.
2. **Coverage is 8 of 238 presets.** Only the `sci_fi_mecha` category carries
   `visualIdentityJson` — a category that is not even in the label table. Every
   other series gets `null`, so every append no-ops.
3. **No user-facing style choice.** The wizard picks a *story* preset; the AI-mix
   path explicitly discards the computed identity (`appliedPresetId: undefined`,
   `CreateSeriesWizard.tsx:841`); `visualIdentityJson` has no authoring UI; and the
   only free-text look field (`bible.visualStyle`) is read **only** by character
   design, never by shot rendering. There is no way to set a look after creation.
4. **The storyboard skill actively mandates divergence** — "Across the 9 shots the
   episode's lighting must show genuine variety" (`vertical-drama-storyboard-shotgrid/skill.md:93-98`).

Plus one dead end worth naming: the storyboard skill authors a `canonical_style_bible`
(overall_style / lighting_language / camera_language / color_language) that is
stored losslessly and **never read back into any prompt** — one UI label is its only
consumer.

This feature closes the loop with a small, ordered change set: a **series look lock**
chosen by the user from a short genre catalog (or authored from a preset), persisted
at the series level, editable after creation, and injected as **one fact line into
the batch render plan** plus the per-shot engines — the same "invent once, reuse
everywhere" principle Feature 138 applies to scenes.

---

## 2. Verified current state

| Capability | Anchor | Status |
|---|---|---|
| Typed visual-identity contract + deterministic merge + blend report | `shared/verticalDramaSeries/presetVisualIdentity.ts` (types `:112`, fragments `:24`, merge `:439`) | Shipped |
| `imagePromptFragments {positive[], negative[]}` — "reusable tokens appended to image prompts" / "style-breaking tokens to suppress" | `presetVisualIdentity.ts:24` | Shipped |
| Preset storage | `vertical_drama_genre_presets.visualIdentityJson` jsonb (`drizzle/schema.ts:21396`) | Shipped, **8/238 populated**, all `sci_fi_mecha` |
| Series storage | `bible.presetVisualIdentity` inside the existing `bible` jsonb; writer `stampPresetVisualIdentityIntoBible` (`verticalDramaSeries.ts:3859-3880`) | Shipped, **create-only** |
| Append helpers | `appendPresetVisualIdentityFragmentsToImagePrompt` (`verticalDramaStartFrameGeneration.ts:1067`), `mergePresetVisualIdentityNegativeFragments` (`:1081`) | Shipped |
| Per-shot render append | `generateStartFrameImage` (`verticalDramaEpisodes.ts:9984-10022`) | Shipped **but positive tokens skipped whenever `frame.promptMode` is stamped** (`:10011`) — i.e. skipped for every modern frame |
| Grid + repair append | `:10614-10637`, `:11398-11424` | Shipped (full positive + negative) |
| Per-shot prompt authoring gets it as a FACT | `verticalDramaEpisodes.ts:12861-12874` → `verticalDramaStartFrameGeneration.ts:1693` `SERIES VISUAL IDENTITY` | Shipped, but only for `cinematic_narrative`; the synopsis engine has no such section and **bans style language** (`vertical-drama-shot-synopsis-image-prompt/SKILL.md:84`) |
| **9-shot batch render plan** | `buildStartFrameRenderPlanUserPrompt` (`:641`), params `:450` | **NOT WIRED — the core gap** |
| Video prompt | 3 sites append `styleName` + `lighting` only; bulk pack gets nothing | Partial |
| Tenant flag `verticalDramaSeriesPresetMixV2` | `shared/featureFlags.ts:184`, default **`false`** (`:614`) | Shipped, off |
| Genre catalog | `genrePresetCategories.ts` — **115 labels, presentation only**, no style data | Shipped, wrong shape for this purpose |
| `canonical_style_bible` (per episode, LLM-authored) | schema `verticalDramaStoryboardGeneration.ts:292`; only consumer is a UI label | Dead end |
| Style-selection UI | — | **NOT FOUND** |

---

## 3. Design

### 3.1 The look lock

There is exactly one effective `VerticalDramaPresetVisualIdentity` per series, in
the existing `bible.presetVisualIdentity` slot. A sibling control envelope makes
the source explicit and switching reversible:

```ts
bible.lookLockControl?: {
  mode: "inherit_source" | "genre" | "manual" | "none";
  genreKey?: VdLookLockGenre;
  inheritedIdentity?: VerticalDramaPresetVisualIdentity;
  inheritedSource?: "preset" | "ai_mix" | "lineage";
  inheritedGovernance?: "preset_mix" | "look_lock";
  revision: number;
  updatedAt: string;
};
```

`inheritedIdentity` is a non-governing snapshot captured from the applied preset or
strictly validated AI-mix/lineage result before any override. `inheritedSource`
preserves which path produced it; `inheritedGovernance` preserves which tenant flag
authorized that source. Generation call sites must never read the snapshot directly;
only the central resolver may use it for `inherit_source` or to restore legacy
preset behavior while the look-lock flag is disabled. This is necessary because the
current series row does not persist `appliedPresetId`, and AI-mix may have no single
preset id.

Mode semantics are exact:

1. `inherit_source`: copy the captured inherited identity into the effective slot;
   unavailable when no inherited identity exists.
2. `genre`: resolve a catalog entry server-side and copy it into the effective slot.
3. `manual`: apply a bounded visual-register patch to an existing inherited/catalog
   identity and copy the validated result into the effective slot. P1 does not allow
   raw editing of character archetypes, reference assets, props, or color grade.
4. `none`: remove the effective slot intentionally; do not fall back to a preset.

Legacy series with `presetVisualIdentity` but no control envelope behave as
`inherit_source` with `inheritedGovernance: "preset_mix"`, preserving current
behavior.

### 3.1a Source-aware resolver and flag isolation

The statement “existing readers light up for free” is unsafe without source-aware
gating. Today character, location, and episode paths read the same slot under
`verticalDramaSeriesPresetMixV2`. A genre/manual identity written there could remain
active after `verticalDramaSeriesLookLock` is disabled.

Add one shared server-safe resolver used by **every** generation reader:

```ts
resolveEffectiveSeriesVisualIdentity({ bible, presetMixEnabled, lookLockEnabled })
```

- when `verticalDramaSeriesLookLock` is disabled: ignore look-lock-owned
  `genre`/`manual`/`none` mode and return the inherited snapshot only when
  `inheritedGovernance` is `preset_mix` and `verticalDramaSeriesPresetMixV2` is
  enabled; a lineage snapshot governed by `look_lock` remains inert. This restores
  legacy preset/AI-mix behavior without mutating stored data;
- with look lock enabled, legacy or `inherit_source`: return the
  inherited/effective identity only when its recorded governing flag is enabled;
- with look lock enabled, `genre` or `manual`: return the effective identity under
  `verticalDramaSeriesLookLock`, independent of the preset flag;
- with look lock enabled, `none`, malformed data, or no authorized source: return
  `undefined`;
- never mutate or silently fall back inside the resolver.

All character, location, episode/start-frame, repair/grid/reference-frame, and
video-prompt call sites must use this resolver or a thin owner-scoped wrapper. With
both flags off, a stored look is inert and prompt/payload behavior remains identical
to the pre-feature baseline.

### 3.2 The genre style catalog (net-new, small)

A pure, code-owned catalog of **five** entries, each carrying a
`VerticalDramaPresetVisualIdentity`-shaped fragment set. The user's five categories
are retained, but generic model/vendor/resolution and motion phrases are normalized
into still-image visual constraints. A look lock must not compete with Feature 137's
motion contract or re-describe identity.

| Key | Thai label | Positive fragments |
|---|---|---|
| `drama_romance` | ดราม่า / โรแมนติก | warm natural key light, gentle contrast, shallow depth of field, restrained golden highlights, intimate cinematic framing |
| `horror_thriller` | ระทึกขวัญ / สยองขวัญ | low-key directional light, controlled hard shadows, restrained saturation, subtle film grain, uneasy negative space |
| `scifi_cyberpunk` | ไซไฟ / โลกอนาคต | neon practical lighting, cool blue-violet palette, selective volumetric haze, controlled anamorphic highlights, dense futuristic production design |
| `action_epic` | แอ็กชัน / มหากาพย์ | high-contrast directional light, bold scale cues, crisp subject separation, strong diagonal composition, restrained warm-cool split |
| `fantasy_fairytale` | แฟนตาซี / เวทมนตร์ | ethereal soft light, luminous pastel palette, subtle magical particles, painterly environmental detail, controlled bloom |

Each entry also carries `negative` fragments (the style-breakers for that genre) and
a `lighting` / `cameraGrammar` sentence, so the object is a complete visual identity
rather than a token list.

**Design rules:**
- The catalog lives in `shared/verticalDramaSeries/` as pure data — importable by
  client (for the picker) and server (for injection), zero I/O.
- It is **orthogonal to the 115 story categories.** A revenge-melodrama can be shot
  in horror style; forcing style to follow story genre would be worse than today.
- Five is the starting set, not a closed universe: the shape must allow a
  preset-derived or hand-written identity in the same slot (§3.1 sources 2 and 3).
- These are **starting fragments the user can edit**, not a locked house style.
- Catalog fragments must avoid resolution claims (`8K`), vendor/engine names,
  character-appearance instructions, video movement, and camera motion. Those are
  provider, identity, and Feature 137 responsibilities respectively.
- Every string and array uses the existing strict identity schema plus bounded P1
  authoring limits: trim strings, reject control characters, cap individual strings
  at 500 characters, cap fragment arrays at 12 items, and cap the rendered look-lock
  block at the selected model's effective prompt budget. Never mechanically truncate
  a lock; reject an oversized manual edit with a field-level error.

### 3.2b Why the central slot matters more than the catalog (user-stated requirement)

Per-shot repair is the **dominant** production workflow, not an edge case. Observed
causes, all recurring: an unusable image forces a synopsis rewrite and a re-render;
character detection places the wrong people in a shot — most often someone merely
*mentioned* in dialogue or the party on a **phone call** rendered as physically
present (a separate failure class, §6); and an image that looks fine but distorts
once animated has to be rebuilt afterwards.

Therefore the requirement is not "append a style to the batch call". It is:

> **One stored look per series, read by every path that produces a prompt or an
> image — batch, per-shot re-author (both engines), reference frame, render, i2i
> repair, angle grid, character portraits, location plates. No caching, no
> re-derivation, no per-call override.**

A batch-only fix would let the tone drift away one repair at a time, which is
indistinguishable from today's bug. Four of those nine paths (repair, grid,
portraits, plates) already understand the effective identity shape, which is the
strongest argument for keeping that shape and slot. They do **not** light up safely
without the source-aware resolver in §3.1a.

### 3.3 Injection — the actual fix

| Engine | Change | Why |
|---|---|---|
| **Batch render plan** (`buildStartFrameRenderPlanUserPrompt`) | **NEW** compact `SERIES LOOK LOCK` fact block (register fields only; not raw fragment arrays), emitted once per call | One LLM call authors all nine prompts in one register. **This is the highest-value line in the feature.** |
| Per-shot `cinematic_narrative` | Replace the direct preset reader with the resolver and provide the same compact register block; instruct the output not to copy lock tokens verbatim | Existing path gains every authorized source without duplicating final fragments |
| Per-shot `policy_safe_rewrite` (synopsis) | Keep the skill's style-language ban; pass no style request to that LLM | The shared final assembler below applies the lock after authoring without weakening policy-safe behavior |
| Final image-prompt assembly (all image-producing paths) | Resolve the current effective identity immediately before provider submission and append positive fragments once; merge negative fragments idempotently through one shared helper | Covers old saved prompts and a look changed after authoring, while removing path-specific ownership ambiguity |
| Video prompt | Unchanged in P1 (already appends `styleName` + `lighting`) | Out of scope |

Exactly-once invariant: authoring LLMs receive only the compact register needed to
shape composition; raw positive/negative fragment arrays are owned exclusively by
the shared final assembler. The assembler strips no user prose, resolves the current
authorized look on every provider submission, appends each normalized positive
fragment once, and merges negative fragments idempotently. It also emits path +
look revision provenance without prompt text. Tests cover batch, both per-shot modes,
reference frame, paid render, i2i repair, angle grid, character portraits, and
location plates under both source flags. No image-producing call site may invoke the
legacy append helpers directly after this centralization.

### 3.3a Mutation and concurrency contract

`setSeriesLookLock` is an owner-scoped, flag-gated mutation accepting
`{ seriesId, mode, genreKey?, manualPatch?, expectedRevision }`. `manualPatch` is
limited to `styleName`, `palette`, `lighting`, `cameraGrammar`, and positive/negative
image fragments, and requires an existing effective/inherited/catalog base.

- Load and lock the fresh series row in a transaction; never spread an earlier
  `bible` snapshot over concurrent settings/story edits.
- Reject a stale `expectedRevision` with `CONFLICT` and return the current revision.
- Server-resolve catalog entries; never trust a client-supplied catalog identity.
- Merge a manual patch onto the fresh current effective identity; if it is absent,
  use the inherited identity. If neither exists, return `PRECONDITION_FAILED` and
  require the user to select a genre or inherited source first. Then validate the
  complete identity with the bounded schema from §3.2.
- Update `lookLockControl` and the effective `presetVisualIdentity` atomically.
- `none` removes the effective identity and sets control mode `none`, while retaining
  the inherited snapshot for reversible restore; unrelated bible keys survive.
- Emit an audit event with series id, prior/new mode, revision, and actor id, but no
  full prompt fragments or sensitive user prose.

### 3.3b Cross-feature precedence

The look lock is the broad visual register, not the strongest fact in every domain:

1. Character reference assets and identity mappings win over look-level archetype or
   wardrobe language; the look may shape treatment, never change who appears.
2. Feature 138's scene state wins for concrete time-of-day, light direction, fixed
   set elements, and scene props, while remaining inside the series palette/contrast
   register. The scene planner receives the look lock as an input and may not
   contradict it.
3. Feature 137's motion contract wins for camera/character movement. Look
   `cameraGrammar` is interpreted as still composition/lens/framing only.
4. Shot facts, product locks, age/safety policy, and required-character mappings
   remain authoritative over all stylistic preferences.

The combined prompt renders these blocks in stable order: policy/safety → identity
and required facts → series look → scene lock → shot-specific creative direction →
motion contract (video only). Composition tests cover all three P1 flags together.

### 3.4 The storyboard lighting rule

`vertical-drama-storyboard-shotgrid/skill.md:93-98` mandates lighting variety across
the nine shots. With a look lock present, that guidance must yield the same way
Feature 138 §7.5 makes it yield inside a scene: **the lock's lighting language sets
the episode's register; variety happens within that register, not across registers.**
Same conditional-clause technique, same dormancy when no lock exists.

### 3.5 `canonical_style_bible` — connect it or retire it

The storyboard skill already authors exactly the object this feature needs, per
episode, and nothing reads it. The two architectural options considered were:

- **Connect:** feed the series look lock INTO storyboard authoring as a constraint,
  and let `canonical_style_bible` be the episode-level realization of it, which then
  feeds the batch render plan. Elegant, and it makes the existing field meaningful.
- **Retire:** mark it explicitly as a UI-display artifact so no future reader assumes
  it is wired.

P1 decision: **connect it in one direction only** — the look lock flows into
the storyboard call as a fact; `canonical_style_bible` stays a display artifact for
now. Full bidirectional wiring is P2.

---

## 4. UI

1. **Series creation** — a "สไตล์ภาพของซีรีส์" step: five genre cards (Thai labels,
   one-line description, and the *why* from the user's own rationale), plus
   "ใช้สไตล์ต้นทาง" when a preset/AI-mix inherited identity exists, plus
   "ไม่ใช้ Look Lock" with the exact `none` semantics from §3.1.
2. **Series settings — editable after creation.** Today there is **no** way to set a
   look after creation; that is arguably a worse gap than the missing picker,
   because every existing series is stuck. The settings tab already displays
   `bible.visualStyle` read-only — make the look lock editable there.
3. **Storyboard panel** — a small chip showing the active look ("สไตล์: ดราม่า /
   โรแมนติก") so the user can see at a glance that a lock is in force, matching
   Feature 138's scene chip.
4. Use Astryx components and tokens according to the repository contract: discover
   the page/block/component APIs before implementation, add no raw color/spacing
   values, and cover loading, disabled, empty/inherited, conflict, save-error, and
   keyboard/focus states. The existing preset-mix path remains usable when the new
   flag is off.

---

## 5. Flag and rollout

Reuse **`verticalDramaSeriesPresetMixV2`**? No — that flag gates preset *mixing*
and defaults off. Add `verticalDramaSeriesLookLock` (tenant, default OFF), gating:
catalog exposure in the UI, persistence of a genre-sourced lock, and the new batch
injection. The pre-existing preset-derived path keeps its own flag and behavior via
the source-aware resolver in §3.1a; turning the new flag off makes genre/manual data
inert without deleting it.

Rollout: internal tenant → one series per genre → compare nine shots for tonal
consistency → GA. Before GA, label at least 45 shot pairs (one 9-shot episode per
genre) using a fixed palette/lighting/camera-register rubric; require ≥85% same-look
agreement, no increase in identity-reference failures, and no duplicate look tokens
in captured render prompts. Emit `vd_series_look_lock_changed` and
`vd_series_look_lock_applied` events so adoption and prompt-path coverage are
queryable without storing full prompts.

---

## 6. Non-goals (P1)

- Backfilling `visualIdentityJson` for the other 230 presets.
- Per-episode or per-scene style overrides (Feature 138 owns within-scene locking;
  this is the series register above it).
- Changing the video-prompt style payload.
- Making `canonical_style_bible` bidirectional.
- Color-grade (ffmpeg) changes — `resolvePresetColorGrade` is render-time video
  grading and is unrelated to image prompts.

---

## 7. Why this belongs with 137/138 rather than after them

All three are the same failure class at three altitudes — **decide once, reuse
everywhere**: 137 pins the person, 138 pins the place, 139 pins the look. More
practically, 139 injects into the **same four prompt builders** section 11 of the
P1 plan is already modifying. Doing it separately means editing
`buildStartFrameRenderPlanUserPrompt`, both per-shot engines and the deterministic
policy-safe assembly **twice**, with two sets of byte-identical proofs. Hence
implementation lands as **section 15** of `planning/vd-p1-identity-scene-continuity/`.

---

## 8. Data and API contract

All persistence remains inside the existing series `bible` JSONB; no migration.
New fields are additive and lenient on read:

```text
bible.presetVisualIdentity   — the only effective generation identity
bible.lookLockControl        — mode/provenance/inherited snapshot/revision; never
                               consumed directly by generation services
```

The inherited snapshot is captured atomically when a preset, AI-mix, or series-
lineage identity is first stamped. A sequel/special edition records source
`lineage` and copies the parent's current governing family (`preset_mix` or
`look_lock`) so disabling a flag has predictable behavior across generations.
Existing series with an identity but no control envelope are lazily interpreted as
legacy `inherit_source` under `preset_mix`; no background backfill is required.
Extend the existing series-lineage snapshot/handoff with the safe look-control
source/governance metadata alongside its already-carried identity. Do not copy
revision numbers or actor/audit data into the child; the child starts at revision 1.

API surface:

| Procedure | Kind | Contract |
|---|---|---|
| `setSeriesLookLock` | mutation | owner-scoped, flag-gated, expected-revision conflict protection; modes and bounded patch from §3.3a |
| existing series detail query | query | returns effective identity plus safe control metadata; does not return duplicated sensitive prompt/audit data |
| existing create mutation | mutation | accepts a genre key/mode, or captures the preset/AI-mix inherited identity atomically before background generation begins |

The single-preset create path resolves the preset id server-side. The existing
AI-mix client/server handoff may submit its generated identity as an
`inheritedIdentityCandidate`; the server strictly validates the complete shape,
drops client-supplied `referenceAssetIds`, records `inheritedSource: "ai_mix"`, and
never treats it as a private-preset authorization token.

Error mapping: malformed mode/patch → `BAD_REQUEST`; missing inherited base for
`inherit_source`/`manual` → `PRECONDITION_FAILED`; stale revision → `CONFLICT`;
unowned/missing series → `NOT_FOUND`. No best-effort swallowing for an explicit
settings save—the UI must know it did not persist.

## 9. Testing plan

1. Pure resolver matrix: legacy/new envelopes × preset flag × look-lock flag × all
   modes, including malformed JSON and `none`.
2. Reversible state: preset/AI-mix/lineage → genre → manual → inherit → none,
   preserving unrelated bible keys and incrementing revisions exactly once; child
   lineage copies source/governance but starts its own revision counter.
3. Concurrency: stale revision rejects; fresh row merge preserves simultaneous
   story/settings fields; catalog identity is server-resolved.
4. Exactly-once injection matrix for batch, both per-shot modes, reference frame,
   paid render, i2i repair, angle grid, character portraits, and location plates.
5. Flag-off parity: both flags absent/false produce baseline DB reads, prompts,
   payloads, and UI; genre/manual stored data remains inert.
6. Skill real-file gates: lowercase/uppercase twins are byte-identical; conditional
   same-register clauses activate only when the runner supplies the look-lock fact.
7. UI: create/settings/chip states, keyboard/focus behavior, conflict reload, error
   retry, inherited/none labels, and responsive rendering using Astryx components.
8. Focused browser smoke: create one series, change its look after creation,
   regenerate one shot via each authoring mode, and inspect captured prompt
   provenance for no duplicate fragments.

## 10. Security, privacy, and operational behavior

- All reads/mutations use tenant + user + series ownership predicates.
- Preset ids and catalog keys are server-resolved; private presets remain visible
  only to their owner.
- Any `referenceAssetIds` restored from an inherited server-resolved preset are
  rechecked against tenant/user media ownership before attachment. Client-submitted
  AI-mix/manual data cannot introduce reference asset ids.
- Manual text is bounded and never interpolated into logs. Audit only mode,
  revision, actor, series id, and outcome.
- No new external service, secret, migration, or automatic paid generation.
- If the feature flag is disabled, stored genre/manual data remains recoverable but
  inert. Re-enabling restores it without data repair.
- Rollback is a flag flip; no JSON cleanup is required. Legacy preset behavior stays
  governed by `verticalDramaSeriesPresetMixV2`.

## 11. P1 acceptance criteria

- A look chosen during creation is active before any background storyboard/start-
  frame generation can race ahead of persistence.
- An existing series can switch among genre, manual, inherited, and none without
  losing unrelated bible data or the inherited source snapshot.
- Every image-producing path consumes the same effective identity exactly once.
- Turning only `verticalDramaSeriesLookLock` off disables genre/manual identities
  while leaving legacy preset behavior controlled solely by its existing flag.
- With all relevant flags off, focused parity fixtures match the recaptured
  pre-feature baseline.
- The internal rollout meets §5 quality gates and records no cross-tenant access,
  duplicate token, or stale-write event.
