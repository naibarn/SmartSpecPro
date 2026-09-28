<!-- SECTION: section-05-scene-continuity-module -->

# Section 05 — Scene Continuity Pure Module

## Current-worktree override (binding)

State identity includes a stable `membershipHash` over episode, location key,
member shots, location asset and canonical summaries. A mismatched hash makes the
state stale and renders no lock. Anchor selection accepts only approved assets or
the latest successful same-scene asset from the current plan/revision; failed,
rejected, stale-plan and cross-scene assets are ineligible.

## Implementation record (2026-08-01)

- Added the zero-import `sceneContinuity.ts` module and 22 focused tests.
- Added `computeSceneMembershipHash`, using a versioned stable hash over the
  episode id, location key, normalized member-shot set, location asset id, and
  canonical summaries in shot order.
- `VdSceneVisualState` now carries `membershipHash` and `revision`. Lock
  rendering requires the current membership hash and refuses stale or
  mismatched state, so provenance cannot silently become an active lock.
- Tightened generated-anchor input to carry status, scene key, plan revision,
  rejection, and stale metadata. Only successful, current-plan, same-scene,
  non-rejected candidates are eligible; an approved asset still wins within
  the same candidate shot.
- Grouping preserves router precedence (override, then first storyboard
  membership), key-only identity, deterministic ordering, and input purity.
- The rendered block contains locked facts only and excludes authoring/UI
  metadata.
- Focused tests (22/22) and the full TypeScript check pass.
- Review was performed inline because the active repository policy did not
  authorize sub-agent delegation for this run.

| | |
|---|---|
| **Section id** | `section-05-scene-continuity-module` |
| **Depends on** | `section-01-prereq-baseplan-fix` (must be green first) |
| **Blocks** | `section-10-scene-state-storage-carryover`, `section-11-scene-lock-injection`, `section-12-neighbor-anchoring` |
| **Parallelizable with** | `section-02-feature-flags`, `section-03-model-prompt-budget`, `section-04-motion-profile-module` |
| **Feature flag** | None. This module is pure code with no call sites yet — it ships dark and is byte-identical-safe by construction. |
| **Test command** | `cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts` |

---

## 1. Background — what an implementer needs to know

### 1.1 The product problem this module serves

**Vertical Drama (VD)** turns a written drama series into short vertical videos:

```
storyboard (9 shots per sub-episode)
  → per-shot START FRAME image  (an LLM writes an image prompt; a paid image model renders it)
  → per-shot VIDEO PROMPT       (an LLM writes motion/dialogue direction)
  → per-shot CLIP               (a paid video model animates the start frame)
```

**Problem B (Feature 138): scene drift.** Consecutive shots of one continuous scene
come out as different places — lighting jumps from sunset to midday, the set
rearranges, wardrobe changes, props appear and vanish. Every start frame is
rendered independently and **no shot ever sees another shot's rendered frame**.

The fix is "invent once, reuse everywhere":

1. Author **one Scene Visual State** per scene (lighting, fixed elements, layout,
   staging axis, wardrobe, props), render it into a compact **scene continuity lock
   block**, and inject that block into every prompt for that scene.
2. Additionally attach the **previous frame of the same scene** as a visual
   reference so later shots can see what the scene actually looks like.

This section builds the **deterministic half** of both mechanics: grouping shots
into scenes, selecting the neighbor anchor, and rendering the lock block. It has
zero I/O and zero LLM calls. Sections 09–13 wire it into skills, storage, prompts,
references and UI.

### 1.2 Vocabulary (use these exact terms)

| Term | Meaning |
|---|---|
| **Shot** | One of 9 numbered beats in a sub-episode. |
| **Scene** | A group of shots sharing one location. Comes from the storyboard's `distinct_locations[]` array (each entry lists its `shot_numbers`) or from a per-shot `locationKey` override. |
| **Start frame** | The still image a shot's video is animated from. |
| **Approved frame** | The start frame the user accepted (`startFramePlan.frames[].approvedMediaAssetId`). This is display canon. |
| **Scene Visual State** | The stored per-scene lock **object**. Always this name for the *data*. |
| **Scene continuity lock block** | The compact **text** rendered from a Scene Visual State and injected into a prompt. Always this name for the *prompt text*. |
| **Anchor** | The earlier same-scene shot whose rendered image is attached as a continuity reference. |

### 1.3 Ground truth already in the codebase (verified — do not re-derive)

- **`distinct_locations` is snake_case, stored verbatim from the LLM's JSON.**
  Schema: `distinctLocationSchema` in
  `apps/web/server/services/verticalDramaStoryboardGeneration.ts` (attached
  `.optional()` on the storyboard object). Fields: `location_key`, `location_name`,
  `description`, `shot_numbers`. The field is **optional** — storyboards predating
  it exist in production.
- **Per-shot override.** `startFramePlan.frames[].locationKey`
  (`shared/verticalDramaSeries/contracts.ts`), set by the `setShotLocation`
  mutation, cleared by passing `locationKey: null`.
- **The router's precedence function** `resolveEffectiveShotLocationIdentity`
  (`server/routers/verticalDramaEpisodes.ts` ≈`:2041-2071`, **module-private**) is
  the existing single source of truth for "which location does this shot belong
  to": override wins → else the **first** `distinct_locations` group whose
  `shot_numbers` contains the shot → else `undefined`. For an override it returns
  `{ locationKey: override, name: "" }` — **an empty name**.
  ⚠️ **This is why scenes are keyed on `locationKey` only, never on name.** Any
  name-keyed logic breaks for exactly the users who customized their shots.
- **A shot may legitimately belong to no scene** (`undefined`). Every function here
  must tolerate that without throwing.
- **`approvedMediaAssetId` is a `string` on the frame** but is used numerically
  everywhere (`Number(frame.approvedMediaAssetId)` guarded by
  `Number.isInteger(...) && > 0`, e.g. router `:11140`, `:12888-12892`,
  `:13865-13871`). This module takes **numbers** and must itself reject `NaN`, `0`,
  negatives and non-integers.
- **Location roster data is thin.** `verticalDramaLocations.data` holds only
  `description` and `primaryAssetLinkId` in practice — no `timeOfDay`/`mood`/
  `environment`. That is why the Scene Visual State is *authored* (section 09), not
  read from a table. Nothing in this section reads the DB.

### 1.4 Standing product directive — "Lock, don't describe"

VD image prompts carry the shot's story synopsis plus **only** what the pipeline
must control: identity, safety, scene locks, observability constraints. Emotional
expression and visual imagination are deliberately delegated to the render model.

Every block this feature injects is a **compact constraint list** — never scene
description, never emotional direction, never cinematic prose. The prompt-budget
headroom won in section 03 exists for locks, **not** for longer descriptions.
`renderSceneContinuityLockBlock` is deterministic string assembly precisely so that
no LLM optimizer step can paraphrase the lock away.

---

## 2. Deliverables

### Files to create

| Path | Purpose |
|---|---|
| `apps/web/shared/verticalDramaSeries/sceneContinuity.ts` | The pure module (new file). |
| `apps/web/shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts` | Its unit suite (new file). |

### Files that must NOT be touched in this section

- `server/routers/verticalDramaEpisodes.ts` — no call sites yet. Section 11/12 wire
  them. Do **not** refactor `resolveEffectiveShotLocationIdentity` here.
- `shared/verticalDramaSeries/contracts.ts` — section 10 owns adding
  `sceneVisualStates?: Record<string, VdSceneVisualState>` to
  `VerticalDramaStartFramePlan` and will `import type` from this module.
- `shared/verticalDramaSeries/index.ts` — **do not add this module to the barrel.**
  The newest pure modules (`videoPromptModelFamily.ts`, `imagePromptLanguage.ts`,
  `audienceAgeRating.ts`, and section 04's `motionProfile.ts`) are all imported by
  direct path. Follow that; touching the barrel widens the import graph for no gain.

### Module constraints (hard)

- **Zero imports.** No `db`, no server modules, no `zod`, and (deliberately) not
  even `./contracts` — keeping this file import-free guarantees section 10's future
  `import type { VdSceneVisualState } from "./sceneContinuity"` inside
  `contracts.ts` cannot create a cycle.
- **Pure.** No clock, no `Math.random`, no env reads, no mutation of inputs. Same
  input ⇒ byte-identical output, forever. (`plannedAt` is data *carried* on the
  state object, never *produced* here.)
- Safe to import from the browser bundle (section 13's UI will).
- Shape convention: follow `audienceAgeRating.ts` — constant tuple → union type →
  type guard → lenient resolver → render helper.

---

## 3. Public API

Names are load-bearing: sections 09–13 are written against them. Do not rename.

### 3.1 Types

```ts
/** One scene: the shots that share one physical setting. Keyed on locationKey ONLY. */
export type VdSceneShotGroup = {
  locationKey: string;
  /** Ascending, de-duplicated, positive integers. */
  shotNumbers: number[];
};

/** Where a shot's continuity reference image came from. */
export type VdSceneAnchorSource = "approved" | "latest_generated";

export type VdSceneAnchor = {
  anchorShotNumber: number;
  mediaAssetId: number;
  /** Provenance. "approved" is preferred but "latest_generated" is NOT a degraded mode. */
  source: VdSceneAnchorSource;
};

/**
 * The stored per-scene lock. Persisted at
 * `startFramePlan.sceneVisualStates[locationKey]` (section 10), authored by the
 * `vertical-drama-scene-visual-state` skill/service (section 09), rendered into a
 * prompt by `renderSceneContinuityLockBlock` below.
 *
 * Everything except the booleans and the number arrays is free prose. The value is
 * CONSISTENCY across shots, not schema precision.
 */
export type VdSceneVisualState = {
  locationKey: string;
  lightingState: string;        // time of day, sun direction, shadow behavior, sky
  fixedElements: Array<{ name: string; placement: string }>;
  spatialLayout: string;        // how the set is arranged relative to the camera
  stagingAxis: string;          // where characters stand; which side the camera stays on
  wardrobeInScene: Array<{ character: string; wardrobe: string }>;
  activeProps: Array<{ name: string; placement: string; fromShot?: number }>;
  paletteMood: string;
  timeJumpSuspected: boolean;   // the script implies a time change inside this scene
  coverageGaps: string[];       // script-required elements no approved location image shows
  /**
   * The scene's shots AT AUTHORING TIME. REQUIRED for invalidation (section 10) —
   * without it "membership changed" is not computable.
   */
  memberShotNumbers: number[];
  plannedAt: string;
  skillVersion?: string;
  manualEdit?: boolean;         // set by updateSceneVisualState; protects user edits
  stale?: boolean;              // membership changed but the state was preserved
};
```

### 3.2 Functions (stubs — implement the bodies, keep the docstrings)

```ts
/**
 * Group shots into scenes from the storyboard's `distinct_locations` plus any
 * per-shot `locationKey` overrides. Tolerates a missing/partial/legacy storyboard:
 * shots with no resolvable scene are simply ABSENT from the result. Never throws.
 */
export function buildSceneShotGroups(input: {
  /**
   * Raw `storyboard.distinct_locations` (jsonb read, snake_case, unvalidated).
   * Typed `unknown` — see §5.1 for why this widens the plan's illustrative shape.
   */
  distinctLocations?: unknown;
  /** shotNumber → override locationKey. null/undefined/blank means "no override". */
  overridesByShotNumber?: ReadonlyMap<number, string | null | undefined>;
}): VdSceneShotGroup[];

/** The group containing `shotNumber`, or undefined when the shot has no scene. */
export function findSceneShotGroupForShot(
  groups: readonly VdSceneShotGroup[],
  shotNumber: number
): VdSceneShotGroup | undefined;

/**
 * Order- and duplicate-insensitive set equality over scene membership. Section 10's
 * three-way invalidation rule is defined in terms of this; it lives here so the
 * comparison can never drift from how membership is built.
 */
export function isSameSceneMembership(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined
): boolean;

/**
 * The nearest LOWER shot number in the same scene that has a usable frame.
 * Per candidate shot, an APPROVED asset is preferred; if that shot has none, its
 * most recently generated asset is used (source: "latest_generated").
 * Returns undefined for the first shot of a scene, for a shot with no scene, and
 * when no earlier shot has produced any image yet. Never returns the shot itself.
 */
export function selectSceneContinuityAnchor(input: {
  shotNumber: number;
  group: VdSceneShotGroup | undefined;
  approvedAssetIdByShotNumber: ReadonlyMap<number, number | null | undefined>;
  latestGeneratedAssetIdByShotNumber: ReadonlyMap<number, number | null | undefined>;
}): VdSceneAnchor | undefined;

/**
 * Lenient READ-side coercion of a persisted/unknown scene state (jsonb round-trip,
 * hand-edited rows, states written by an older skill version). Never throws;
 * unusable fields are dropped, a fully unusable input returns undefined.
 * Section 09's zod is the WRITE-side validator; this is the READ-side one.
 */
export function resolveSceneVisualState(raw: unknown): VdSceneVisualState | undefined;

/**
 * Deterministic render of a Scene Visual State into the compact scene continuity
 * lock block injected into prompts. LOCKED FACTS ONLY — no scene description, no
 * emotional direction, no authoring metadata. Returns undefined when there is no
 * state and when the state carries no renderable fact.
 */
export function renderSceneContinuityLockBlock(
  state: VdSceneVisualState | undefined
): string | undefined;
```

### 3.3 Exported constants

```ts
export const VD_SCENE_ANCHOR_SOURCES = ["approved", "latest_generated"] as const;

/**
 * The exact first line of every rendered lock block. Exported because
 * section 11's byte-identical proofs and section 08's start-frame-render skill
 * clause ("when a scene continuity lock is present…") both key off this literal.
 * Changing it is a cross-section breaking change.
 */
export const VD_SCENE_CONTINUITY_LOCK_HEADER: string;
```

---

## 4. Behavioral specification

### 4.1 `buildSceneShotGroups`

| Rule | Behavior |
|---|---|
| R1 Input tolerance | `distinctLocations` that is absent, `null`, not an array, or empty ⇒ storyboard contributes nothing. Never throws. |
| R2 Entry validity | An entry contributes only if `location_key` is a **non-blank string**. `shot_numbers` is read via `Array.isArray`, each element coerced with `Number(...)`, keeping only positive integers. |
| R3 First-match wins | If a shot number appears in **two** storyboard groups, it belongs to the **first** one in input order. This mirrors the router's `.find()` exactly — divergence here would make scene resolution disagree with location-reference resolution. |
| R4 Key-only merge | Two entries with the **same** `location_key` merge into **one** group (union of shots). Never key on `location_name`. |
| R5 Overrides win | A non-blank override for shot N removes N from its storyboard group and adds it to the override key's group, creating that group if it does not exist. Mirrors the router's precedence. |
| R6 Blank override = none | `null`, `undefined`, `""` and whitespace-only override values mean "no override" — the shot falls back to its storyboard group. (`setShotLocation(locationKey: null)` clears the field.) |
| R7 No scene = absent | A shot with neither an override nor a matching group appears in **no** group. |
| R8 Empty groups dropped | A group that loses all its shots to overrides is not emitted. |
| R9 Deterministic order | Groups sorted by **lowest member shot number ascending**; ties (only possible via malformed input) broken by `locationKey` lexicographic. `shotNumbers` ascending and de-duplicated within each group. Group ordering is independent of input ordering; **membership** assignment (R3) is not. |
| R10 No name field | `VdSceneShotGroup` deliberately has no `locationName`. Overrides carry `name: ""`; a name field would invite name-keyed logic. |

### 4.2 `selectSceneContinuityAnchor`

| Rule | Behavior |
|---|---|
| R11 No group | `group === undefined` ⇒ `undefined`. |
| R12 Candidates | `group.shotNumbers` filtered to **strictly less than** `shotNumber`, scanned **descending** (nearest first). The shot itself is never a candidate even if its own id maps are populated. |
| R13 Per-shot preference, not global | For each candidate, in nearest-first order: valid approved id ⇒ `source: "approved"`; else valid latest-generated id ⇒ `source: "latest_generated"`; else continue downward. **Nearest wins over approved-ness.** Shot 3 with `latest_generated` at shot 2 and `approved` at shot 1 anchors to **shot 2**. |
| R14 Id validity | An id counts only if it is a finite **integer > 0**. `NaN` (from `Number(undefined)`), `0`, negatives and fractions are treated as absent. |
| R15 Exhausted | No qualifying candidate ⇒ `undefined`. Callers treat this as "no anchor", never as an error. |

**Why R13 matters (do not re-litigate).** The common workflow is "generate all 9 →
look → approve". During that batch **nothing is approved yet**. An approved-only
anchor returns `undefined` for every shot and the entire neighbor-anchoring half of
Feature 138 silently does nothing on the path most users take. Approved still wins
*within* a shot (display canon outranks a draft), but a never-approved scene must
still anchor. Section 12 pairs this with ascending in-scene batch ordering; the two
together are what make the feature do anything at all.

### 4.3 `renderSceneContinuityLockBlock`

Renders **only** these fields, each on its own line, in this fixed order, omitting
any line whose source is empty/blank after trimming:

| Line | Source | Format |
|---|---|---|
| header | — | `VD_SCENE_CONTINUITY_LOCK_HEADER` |
| Lighting | `lightingState` | `- Lighting: <value>` |
| Fixed elements | `fixedElements[]` | `- Fixed elements: <name> — <placement>; <name> — <placement>` |
| Spatial layout | `spatialLayout` | `- Spatial layout: <value>` |
| Staging axis | `stagingAxis` | `- Staging axis: <value>` |
| Wardrobe | `wardrobeInScene[]` | `- Wardrobe: <character>: <wardrobe>; …` |
| Active props | `activeProps[]` | `- Active props: <name> — <placement>; …` |
| Palette / mood | `paletteMood` | `- Palette and mood: <value>` |

**Deliberately NOT rendered** — these are authoring/UI metadata, and emitting them
would be describing rather than locking:

`timeJumpSuspected` (a review signal that the scene may need splitting — injecting
it would invite the render model to *depict* a time change), `coverageGaps` (a QA
signal about missing reference imagery), `memberShotNumbers`, `plannedAt`,
`skillVersion`, `manualEdit`, `stale`, `locationKey`.
**This is a settled decision. A test asserts none of them leak.**

Additional rules:

- **R16** `undefined`/`null` state ⇒ `undefined`.
- **R17** A state whose every renderable field is empty ⇒ `undefined` (never a lone
  header — a bare header is prompt weight with no constraint value).
- **R18** Field values pass through **verbatim**, trimmed only. Labels are English
  constants (same convention as `renderAudienceAgeRatingBlock`); values keep
  whatever language the authoring skill produced.
- **R19** Runtime-defensive despite the types: values arrive from jsonb, so
  non-string entries, `null` array members and objects missing `name`/`placement`
  must be skipped, not crashed on and not rendered as `"undefined"`.
- **R20** No trailing newline; `\n`-joined lines only. Section 11 owns the spacing
  around the block at each injection point.
- **R21** `fromShot` on `activeProps` **is rendered as a text qualifier** when
  present: `- Active props: brown envelope — on the concrete ledge (from shot 2); …`.
  Spec 138 §11 requires `from_shot` visibility "so props neither vanish **nor leak
  into shots before they exist**" — and prop leakage is one of the five drift
  classes in the original evidence (§2.1: an envelope that exists only in shot 2).
  Rendering it as text keeps the block **identical for every shot of the scene**, so
  section 11's dedupe-by-text and its byte-identical fixtures still hold; the skill's
  own rule is what teaches the model to honor the qualifier. **Do not** add a
  `shotNumber` parameter to filter props per shot in P1 — that would make the block
  differ per shot and break Engine C's dedupe. Update the render fixture accordingly.

### 4.4 `resolveSceneVisualState`

- Non-object / `null` / array / primitive ⇒ `undefined`.
- Missing string fields default to `""`; missing arrays default to `[]`; missing
  `timeJumpSuspected` defaults to `false`; missing `plannedAt` defaults to `""`.
- Array entries that are not objects, or whose required string members are missing,
  are dropped — the surviving entries are kept (matching the plan's failure posture:
  "lenient parse drops the bad fields; render whatever survives").
- `memberShotNumbers` coerced with `Number(...)`, keeping positive integers,
  de-duplicated, ascending.
- `manualEdit` / `stale` are preserved only when strictly boolean.
- Returns `undefined` when nothing usable survives — including when `locationKey` is
  blank, since a state that cannot be keyed cannot be stored or matched.

---

## 5. Implementation notes

### 5.1 Deliberate deviations from `claude-plan.md` §3.4 (record these in review)

1. **`distinctLocations` is typed `unknown`**, not the plan's illustrative
   `Array<{ location_key?: unknown; shot_numbers?: unknown }>`. Callers read a raw
   jsonb storyboard; widening removes a cast at every call site and moves all
   validation inside the module, which is where the tolerance rules belong.
2. **Three helpers added beyond the plan's three functions**:
   `findSceneShotGroupForShot`, `isSameSceneMembership`, `resolveSceneVisualState`.
   All three are needed by sections 10–12; leaving them out would push identical
   ad-hoc logic into a router, a service and a projector, where it would drift.
   `resolveSceneVisualState` specifically satisfies the plan's §5.3 failure-table row
   "a state exists but is malformed ⇒ render whatever survives" on the **read** path,
   which section 09's write-side zod does not cover.
3. Map parameters are `ReadonlyMap` rather than `Map` — callers can still pass a
   `Map`, and the module cannot mutate caller state.

### 5.2 Traps

- **Do not key anything on location name.** Overrides give `name: ""`.
- **Do not import `./contracts`.** Section 10 will import *from* this file into
  `contracts.ts`.
- **Do not sort membership by input order.** R9 pins group ordering explicitly;
  fixtures in sections 10–12 depend on it.
- **`Number(undefined)` is `NaN`, `Number("")` is `0`, `Number(null)` is `0`.** All
  three must be rejected by R14 / R2, or a shot with no approved asset will look like
  it has asset `0`.
- **`toEqual` on arrays breaks on any inserted entry.** Keep the emitted array shapes
  minimal; every extra field becomes a downstream test edit.

### 5.3 Doc-comment expectations

Open the file with a module docstring in the style of `audienceAgeRating.ts` /
`characterLock.ts`: what it is, why it exists (Feature 138 P1), the two encoded
rules (locationKey-only keying; every function tolerates "no scene"), the
"Lock, don't describe" directive, and an explicit note that the module never judges
— it only groups, selects and renders what the skill declared.

---

## 6. Tests first (TDD)

Write the whole suite **before** the module and confirm it is red for the right
reason (module not found / functions undefined), then implement until green.

**File:** `apps/web/shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts`
**Run:** `cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts`

### 6.1 Conventions (from the existing codebase — do not invent new ones)

- Vitest 2.1.9, **always run from `apps/web`** (from the repo root it globs the
  monorepo and dies on an unreadable directory).
- Environment is `node` (config default; `shared/**/*.test.ts` is in `include`).
- **Zero mocks.** Pure module ⇒ real calls only. No `vi.mock`, no `vi.fn`, so the
  `mockReturnValueOnce`-queue footgun does not apply here.
- Templates to copy: `__tests__/imagePromptLanguage.test.ts` (minimal shape) and
  `__tests__/videoPromptModelFamily.test.ts` (happy path → boundary → precedence →
  null-safety → frozen-set assertion). Import by relative path: `../sceneContinuity`.
- One `describe` per exported function; test names state the *rule*, not the
  mechanics.
- Prefer small inline fixtures. Add one shared `makeSceneVisualState(overrides)`
  factory local to the file for the render/resolve suites.

### 6.2 Required cases

Every line below is a test. The first block is the plan's TDD companion §1d
verbatim; the rest cover the added helpers and the pinned decisions.

```
buildSceneShotGroups
  partitions shots from distinct_locations
  applies per-shot locationKey overrides over the storyboard grouping
  returns [] for a missing/empty distinct_locations (never throws)
  tolerates a storyboard where some shots belong to no group
  keys groups on locationKey only (a group whose location_name is empty still works)
  merges two distinct_locations entries that share one location_key into ONE group
  assigns a shot listed in two groups to the FIRST group (mirrors the router's .find())
  treats a null / "" / whitespace override as "no override" (falls back to storyboard)
  creates a new group for an override key that is absent from distinct_locations
  drops a group that loses all its shots to overrides
  emits groups ordered by lowest member shot number, shotNumbers ascending + deduped
  ignores non-array shot_numbers, non-numeric members, zero and negative shot numbers
  ignores an entry whose location_key is missing, blank or not a string
  does not mutate the input arrays or the overrides map
  is deterministic (two calls on the same input produce deep-equal output)

findSceneShotGroupForShot
  returns the group containing the shot
  returns undefined for a shot in no group and for an empty group list

isSameSceneMembership
  true for the same set in a different order and with duplicates
  false when one side has an extra shot
  true for two empty/undefined inputs; false for empty vs non-empty

selectSceneContinuityAnchor
  returns undefined for the first shot of a scene
  returns undefined when no earlier shot has any image
  prefers an APPROVED asset over a latest-generated one for the same shot
  falls back to latest_generated and reports source: "latest_generated"
  picks the NEAREST lower shot, not the first one, when several qualify
  picks the nearest shot's latest_generated over a FARTHER shot's approved
      ← pins R13; the batch-workflow case the feature exists for
  skips an earlier shot that has no image and continues searching downward
  never returns the shot itself (own approved asset present, no earlier shot)
  returns undefined when the shot belongs to no scene group
  rejects NaN / 0 / negative / non-integer asset ids as "no image"

resolveSceneVisualState
  returns undefined for null, a primitive, an array and an empty object
  returns undefined when locationKey is blank
  coerces a partial state, defaulting strings to "" and arrays to []
  drops malformed array members and keeps the well-formed ones
  normalizes memberShotNumbers (positive integers, deduped, ascending)
  preserves manualEdit / stale only when strictly boolean
  never throws on deeply malformed input

renderSceneContinuityLockBlock
  returns undefined for undefined state
  returns undefined for a state with no renderable fact (no lone header)
  emits every locked field present and omits absent ones
  emits the fields in the fixed documented order, starting with the exact header
  never emits timeJumpSuspected, coverageGaps, memberShotNumbers, plannedAt,
      skillVersion, manualEdit, stale or locationKey   ← anti-drift guard
  output contains no emotional/descriptive prose beyond the stored facts
      (assert the full block against a fixture string)
  skips null / non-object array members instead of rendering "undefined"
  passes non-English values through verbatim
  is deterministic (same input, byte-identical output across calls)

exports
  VD_SCENE_ANCHOR_SOURCES is a frozen set (toEqual on the constant tuple)
  VD_SCENE_CONTINUITY_LOCK_HEADER is the exact first line of a rendered block
```

### 6.3 The two tests that matter most

- **"picks the nearest shot's latest_generated over a farther shot's approved"** —
  this is the test that proves the feature works on the real workflow. If it is
  written backwards, the feature ships dead.
- **"never emits … metadata" + the full-block fixture** — the standing guard against
  a future edit turning the lock into a description. Assert the *whole* rendered
  string, not `toContain` fragments.

---

## 7. Done when

1. `cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts`
   is fully green.
2. `cd apps/web && pnpm check` (or `npx tsc --noEmit`) introduces **no new**
   TypeScript errors attributable to these two files. (The repo has a large
   pre-existing red baseline; diff against it, do not read the raw count.)
3. **Gate A stays 266/266** and the **Gate B fail-set is unchanged** versus the
   baseline captured in section 01. This section adds files with no call sites, so
   any movement in either gate means something unrelated was touched — investigate,
   do not accept.
4. `grep` proves the new module has no `import` of `contracts`, `db`, `zod` or any
   `server/` path, and does not appear in `shared/verticalDramaSeries/index.ts`.
5. No file outside the two new paths is modified.

---

## 8. Handoff to downstream sections (reference only — do not implement here)

| Section | What it consumes from this module |
|---|---|
| **10** storage + carry-over | `VdSceneVisualState` (type imported into `contracts.ts` for `startFramePlan.sceneVisualStates`), `buildSceneShotGroups` + `isSameSceneMembership` for the three-way invalidation rule (unchanged ⇒ carry / changed+auto ⇒ drop / changed+manual ⇒ keep + `stale: true`) inside `projectStartFramePlan`. |
| **09** scene-state skill + service | `VdSceneVisualState` as the authored output shape; the service's write-side zod must be a superset-tolerant mirror of `resolveSceneVisualState`. |
| **11** lock injection | `resolveSceneVisualState` → `renderSceneContinuityLockBlock` → the new `sceneContinuityLockBlock?: string` parameter threaded into all four engines. Scene resolution happens in the router/pipeline — `verticalDramaStartFrameGeneration.ts` receives only a pre-rendered string and must never resolve scenes itself. |
| **12** neighbor anchoring | `buildSceneShotGroups` + `findSceneShotGroupForShot` + `selectSceneContinuityAnchor`; ascending in-scene batch ordering; `VdSceneAnchor.source` decides nothing at attach time but is stored for the UI badge. |
| **13** UI | `VdSceneVisualState` mirrored into the client's own view types; `VdSceneAnchor.anchorShotNumber` renders as **provenance** ("สร้างโดยอ้างอิงภาพช็อต N"), never as a live claim — there are no cascades, so an anchored-to frame may since have changed. |
| **08** skills | `VD_SCENE_CONTINUITY_LOCK_HEADER` is the literal the start-frame-render skill's same-scene lighting-override clause conditions on. |
