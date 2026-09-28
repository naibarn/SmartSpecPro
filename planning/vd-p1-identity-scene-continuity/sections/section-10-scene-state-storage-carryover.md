<!-- SECTION: section-10-scene-state-storage-carryover -->

# Section 10 — Scene Visual State storage + the regeneration carry-over

## Current-worktree override (binding)

Persist `membershipHash`, `revision`, planning metadata and stale state. Every JSONB
write locks/reloads the fresh row or validates `expectedRevision`; never spread a
stale plan snapshot. A mismatched state may remain as provenance but is never
injected. Deterministic idempotency charges/persists concurrent planning once and
discards results whose membership changed during the call. Section 11 supersedes
any later blanket fail-open wording.

| | |
|---|---|
| **Section id** | `section-10-scene-state-storage-carryover` |
| **Depends on** | `section-05-scene-continuity-module` (pure module + `VdSceneVisualState`), `section-09-scene-visual-state-skill` (the authoring service that produces states) |
| **Blocks** | `section-11-scene-lock-injection`, `section-13-scene-mutations-ui` |
| **Parallelizable with** | `section-08-motion-contract-skills` |
| **Feature flag** | **None — deliberately.** See §2.3. Storage and carry-over are unconditional; the *writers* (sections 09/11/13) are flag-gated, so with `verticalDramaSceneContinuity` off no state is ever authored, the key never exists, and every output is byte-identical to today. |
| **Test command** | `cd apps/web && npx vitest run server/services/__tests__/verticalDramaStartFrameGeneration.sceneVisualStates.test.ts server/services/__tests__/verticalDramaEpisodePipeline.sceneVisualStates.test.ts server/services/__tests__/verticalDramaStartFrameGeneration.test.ts` |

All paths are relative to `apps/web/` unless noted. Line anchors were verified at HEAD `941547ff1`; several earlier sections edit the same files, so **locate every anchor by symbol name or an adjacent literal, never by line number**.

Shorthand used below:
- **SFG** = `server/services/verticalDramaStartFrameGeneration.ts`
- **PIPE** = `server/services/verticalDramaEpisodePipeline.ts`
- **ROUTER** = `server/routers/verticalDramaEpisodes.ts`

---

## 1. What this section delivers

Feature 138 P1 authors one **Scene Visual State** per scene (lighting, fixed elements, layout, staging axis, wardrobe, props) and injects a compact lock block into every prompt for that scene's shots. This section owns **where that object lives and how it survives**.

It contains no LLM calls, no prompt text, no UI, and no feature-flag reads.

| # | Deliverable | Where |
|---|---|---|
| 1 | `sceneVisualStates?: Record<string, VdSceneVisualState>` on the persisted plan type | `shared/verticalDramaSeries/contracts.ts` — `VerticalDramaStartFramePlan` |
| 2 | The same field on the projection type | SFG — `StartFrameRenderPlanProjection` |
| 3 | `readSceneVisualStatesFromPlan` — the one sanitising read helper every consumer must use | SFG (new export) |
| 4 | `carrySceneVisualStates` — the pure three-way invalidation rule | SFG (new export) |
| 5 | `upsertSceneVisualState` — the pure write/merge rule (manual-edit protection, lazy first-write-wins) | SFG (new export) |
| 6 | `projectStartFramePlan` stops deleting the key: new optional 7th param + one conditional spread | SFG — `projectStartFramePlan` |
| 7 | `sceneVisualStatesCarryOver` threaded through `GenerateStartFrameRenderPlanParams` | SFG |
| 8 | The caller builds and passes it, and logs what was dropped | PIPE — `generateRealStartFramePlan` |
| 9 | Carry-over doc-drift fix (7 carried fields, and the two undocumented non-carried ones) | SFG — `previousFramesByShotNumber` param doc comment |

**Not in this section** (referenced only): authoring the state (09), lazy triggering + lock injection (11), neighbour anchoring (12), the `planSceneVisualState` / `updateSceneVisualState` tRPC mutations, their ownership guards, their row-lock re-read and the UI (13).

---

## 2. Background an implementer needs

### 2.1 The pipeline, in one paragraph

A Vertical Drama **sub-episode** has 9 numbered **shots**. Each shot gets a **start frame** still image (an LLM writes the image prompt, a paid image model renders it), then a **video prompt**, then a **clip** animated from that start frame. A **scene** is the group of shots that share one physical location, identified by `locationKey`. Because every start frame is rendered independently, consecutive shots of one continuous scene drift — lighting jumps, the set rearranges, props appear and vanish. The fix is "invent once, reuse everywhere": author one Scene Visual State per scene and pin it into every prompt for that scene.

### 2.2 Where the data lives

`verticalDramaEpisodes.startFramePlan` is a **jsonb column**. Its TypeScript type (`VerticalDramaStartFramePlan`, `contracts.ts:475-626`) is a plain type, not a zod schema, and **unknown keys survive the round trip**:

- write path `ROUTER updateEpisodeDraft` — input schema is `z.record(z.string(), z.unknown())` (`:7352`);
- read path — a raw cast, no stripping;
- every per-shot patch mutation is spread-based (`{ ...plan, frames: updatedFrames }`), server side **and** client side (`client/src/pages/VerticalDramaEpisodePage.tsx` builds exactly that shape in three places).

So a brand-new plan-level key needs **no migration and no schema change**. It survives everything…

### 2.3 …except the one destructive path

`projectStartFramePlan` (SFG `:305`) **returns a fresh object literal**:

```ts
return {
  mode: "single_frame_per_shot",
  selectedImageModelId,
  ...(imagePromptLanguage ? { imagePromptLanguage } : {}),
  frames: /* … */,
};
```

and the pipeline persists that return value **as the whole column**:

```ts
// PIPE, start_frame_render_plan stage (~:3904-3916)
payload = { stage, ...generated.plan };
await db.update(verticalDramaEpisodes).set({ startFramePlan: generated.plan, updatedAt: new Date() })…
```

⇒ **every plan-level key not named in that literal is deleted on every `start_frame_render_plan` regeneration.** Without this section, `sceneVisualStates` is silently wiped the first time a user re-runs the storyboard→start-frame stage, and same-scene drift quietly returns with no error anywhere. This is the single reason section 10 exists.

**Why the carry-over must NOT be flag-gated.** If the carry were conditioned on `verticalDramaSceneContinuity`, then turning a tenant's flag *off* would destroy every authored and hand-edited lock on the next regen — a data-loss bug triggered by an admin toggle. Flag-off byte-identity is already guaranteed structurally: with the flag off nothing writes states, so `previous` is `undefined`, so no key is emitted (rule **C1**).

### 2.4 Scene identity — where it may and may not be resolved

`resolveEffectiveShotLocationIdentity` (ROUTER ≈`:2041-2071`, **module-private**) is the existing single source of truth for "which location does this shot belong to": per-shot override (`startFramePlan.frames[].locationKey`) wins → else the **first** `distinct_locations` group whose `shot_numbers` contains the shot → else `undefined`. For an override it returns `{ locationKey: override, name: "" }` — **an empty name**, which is why scenes are keyed on `locationKey` only, never on name.

SFG receives only `location?: { name, description, hasReferenceImage }` — no `locationKey`, no storyboard. **SFG must never resolve scenes.** This section does not violate that: the projector receives an **already-built** `VdSceneShotGroup[]` from the pipeline and only *compares set membership*. Section 05's `buildSceneShotGroups` runs in the pipeline, which already reads `storyboard.distinct_locations` (PIPE `:2904-2906`).

---

## 3. Consumed from section 05 — `shared/verticalDramaSeries/sceneContinuity.ts`

Import by direct path (this module is deliberately **not** in the `shared/verticalDramaSeries/index.ts` barrel).

```ts
export type VdSceneShotGroup = { locationKey: string; shotNumbers: number[] };

export type VdSceneVisualState = {
  locationKey: string;
  lightingState: string;
  fixedElements: Array<{ name: string; placement: string }>;
  spatialLayout: string;
  stagingAxis: string;
  wardrobeInScene: Array<{ character: string; wardrobe: string }>;
  activeProps: Array<{ name: string; placement: string; fromShot?: number }>;
  paletteMood: string;
  timeJumpSuspected: boolean;
  coverageGaps: string[];
  /** The scene's shots AT AUTHORING TIME. Required for invalidation. */
  memberShotNumbers: number[];
  plannedAt: string;
  skillVersion?: string;
  manualEdit?: boolean;
  stale?: boolean;
};

export function buildSceneShotGroups(input: {
  distinctLocations?: unknown;
  overridesByShotNumber?: ReadonlyMap<number, string | null | undefined>;
}): VdSceneShotGroup[];

/** Order- and duplicate-insensitive set equality over scene membership. */
export function isSameSceneMembership(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined
): boolean;

/** Lenient READ-side coercion of a persisted/unknown state. Never throws; undefined when unusable. */
export function resolveSceneVisualState(raw: unknown): VdSceneVisualState | undefined;
```

**Verify before starting:** `isSameSceneMembership` must return `true` for two empty/undefined inputs, and `resolveSceneVisualState` must return `undefined` for a blank `locationKey`. Both are asserted by section 05's own suite. If either behaves differently, fix it **in section 05**, never with a shim here.

---

## 4. Public API added by this section

All three helpers are **pure** (no I/O, no clock, no logging, no input mutation) and live in SFG beside `projectStartFramePlan`, so the invalidation rule can never be bypassed by a caller that forgets it.

```ts
/**
 * The ONE sanitising read of `startFramePlan.sceneVisualStates`. Every consumer
 * (sections 11, 12, 13, and the projector itself) must go through this rather
 * than casting the jsonb directly — it is the single place the read-side
 * leniency rule lives.
 *
 * Accepts the whole plan object (or anything at all — jsonb, null, a string).
 * Returns a record keyed by locationKey; entries that `resolveSceneVisualState`
 * rejects are dropped. Returns an EMPTY OBJECT, never undefined, so call sites
 * can index it without a null check. Never throws.
 */
export function readSceneVisualStatesFromPlan(
  startFramePlan: unknown
): Record<string, VdSceneVisualState>;

/**
 * The three-way invalidation rule applied on plan REGENERATION (§5).
 * Pure: returns the record to persist, or `undefined` when there is nothing to
 * store (so the caller can omit the key entirely and stay byte-identical).
 */
export function carrySceneVisualStates(input: {
  /** Raw `startFramePlan.sceneVisualStates` from the pre-regen row. Unvalidated jsonb. */
  previous?: unknown;
  /**
   * Scene membership as resolved for the NEW plan. `undefined` OR empty means
   * "membership could not be computed" — see rule C3; it does NOT mean
   * "every scene lost all its shots".
   */
  sceneShotGroups?: readonly VdSceneShotGroup[];
}): Record<string, VdSceneVisualState> | undefined;

/**
 * The write/merge rule shared by lazy authoring (section 11) and by the
 * `planSceneVisualState` / `updateSceneVisualState` mutations (section 13).
 * Pure — the DB transaction, the row-lock re-read and the ownership guards
 * belong to the caller. `next.plannedAt` is supplied by the caller (keeps this
 * function clock-free).
 */
export function upsertSceneVisualState(input: {
  current: Record<string, VdSceneVisualState> | undefined;
  next: VdSceneVisualState;
  /** "lazy" = render-path first-use authoring; "planned" = explicit re-plan; "manual" = user edit. */
  origin: "lazy" | "planned" | "manual";
  /** Only meaningful for origin "planned". */
  force?: boolean;
}): {
  states: Record<string, VdSceneVisualState>;
  written: boolean;
  /** Why nothing was written. Callers surface this; they never treat it as an error. */
  skippedReason?: "already_present" | "manual_edit_protected";
};
```

### Signature changes to existing symbols

```ts
// SFG — new 7th positional param, keeping the established positional style.
export function projectStartFramePlan(
  raw: StartFrameRenderPlanOutput,
  callerImageModelId: string,
  shotCharacterIdsByShotNumber?: Map<number, string[]>,
  canonicalShotSummaryByShotNumber?: Map<number, string>,
  previousFramesByShotNumber?: Map<number, VerticalDramaStartFramePlanFrame>,
  imagePromptLanguage?: VerticalDramaPromptLanguage,
  sceneVisualStatesCarryOver?: {
    previous?: unknown;
    sceneShotGroups?: readonly VdSceneShotGroup[];
  },
): StartFrameRenderPlanProjection;

// SFG — identically-named field on the batch params, threaded straight through.
export interface GenerateStartFrameRenderPlanParams {
  // …
  sceneVisualStatesCarryOver?: {
    previous?: unknown;
    sceneShotGroups?: readonly VdSceneShotGroup[];
  };
}
```

**One param object, not two positional params** — the function already takes six positionals; two more would make every call site unreadable and would make the "omitted ⇒ byte-identical" rule harder to test. Use the **same field name** in both places so `grep sceneVisualStatesCarryOver` finds the whole path.

---

## 5. Behavioural specification

### 5.1 `carrySceneVisualStates` — the three-way rule

| Rule | Condition | Behaviour |
|---|---|---|
| **C1** | `previous` absent / not a plain object / has no usable entry | return `undefined` ⇒ the projector emits **no** `sceneVisualStates` key at all (not `undefined`, not `{}`). This is the flag-off / legacy-episode path and it must be byte-identical to today. |
| **C2** | any entry | sanitise with `resolveSceneVisualState`; drop entries it rejects. The **record key is authoritative**: an entry survives under its record key, and when the state's own `locationKey` disagrees it is rewritten (on a copy) to the record key. A state that disagrees with its key would otherwise be present-but-unreachable, since every lookup path indexes `sceneVisualStates[locationKey]`. |
| **C3** | `sceneShotGroups` is `undefined` **or** empty | **carry every surviving state unchanged; mark nothing stale.** Inability to compute membership must never destroy data. Note the trap this closes: `buildSceneShotGroups` returns `[]` for a storyboard with no `distinct_locations`, and a naive implementation would read that as "every scene lost all its shots" and drop the lot. A legitimate regeneration can never produce zero scenes when scenes existed before — `validateStagePayload` already enforces full 1–9 coverage whenever `distinct_locations` is present. |
| **C4** | membership identical — `isSameSceneMembership(state.memberShotNumbers, group?.shotNumbers)` | carry the state **unchanged**, including a pre-existing `stale: true`. `stale` is a "please review" marker cleared only by an explicit user save or re-plan (§5.2), never silently by a regen that happens to restore the old membership. |
| **C5** | membership changed **and** `manualEdit` is falsy | **drop** the state. It will be re-authored lazily on next use (~1 LLM call). |
| **C6** | membership changed **and** `manualEdit === true` | **keep** the state and set `stale: true` on a copy. `memberShotNumbers` is **not** rewritten — it records what the lock was authored for, and the UI (section 13) shows it as needing review. A user's hand-written lock is never destroyed by a storyboard regeneration. |
| **C7** | a group exists with no matching state | nothing is created here. States are authored lazily (section 11) or explicitly (section 13). |
| **C8** | output | keys emitted in **lexicographic order** for deterministic tests. (Postgres jsonb does not preserve key order, so this is a test-determinism convenience, not a storage guarantee.) |
| **C9** | always | never mutate `input.previous`, its nested objects, or `sceneShotGroups`. Every modified state is a fresh copy. |
| **C10** | always | no feature-flag read, no logging, no clock. |

**No size cap in P1 — recorded decision.** A sub-episode has at most 9 scenes and the blob is written only by our own writers. Adding a cap would be a data-destroying guard against a threat that does not exist.

### 5.2 `upsertSceneVisualState` — the write rule

| `origin` | Existing state | Behaviour |
|---|---|---|
| `"lazy"` | none | write; `written: true` |
| `"lazy"` | any | **skip**, `skippedReason: "already_present"`. First write wins. This is the pure half of "concurrent lazy authoring of the same scene results in exactly ONE persisted state"; the transactional re-read is section 11/13's half. |
| `"planned"` | none, or `manualEdit` falsy | write; `written: true` |
| `"planned"` | `manualEdit === true`, `force !== true` | **skip**, `skippedReason: "manual_edit_protected"` |
| `"planned"` | `manualEdit === true`, `force === true` | write; the fresh authored content replaces the user's, so `manualEdit` is **cleared** |
| `"manual"` | any / none | write; sets `manualEdit: true` |

Every successful write: `stale` is cleared, `locationKey` is normalised to the record key, sibling scenes are untouched, and the input record is not mutated.

### 5.3 `projectStartFramePlan` — the emission rule

- Compute `const carried = carrySceneVisualStates(sceneVisualStatesCarryOver ?? {})`.
- Emit with a **conditional spread**: `...(carried ? { sceneVisualStates: carried } : {})`, positioned **after `imagePromptLanguage` and before `frames`** (plan-level metadata grouped together, bulk data last).
- Never emit `sceneVisualStates: undefined` and never emit `{}` — an existing test asserts `expect(withoutParam).toEqual(withUndefinedParam)`, and section 11's byte-identical proofs depend on the key being genuinely absent.
- The projector remains **pure and log-free** (its own doc comment promises this). Observability lives at the call site (§6).

---

## 6. Pipeline threading (`generateRealStartFramePlan`, PIPE)

Build both inputs next to the existing pre-regen reads (`previousStartFrames` ≈`:2763-2768`, `distinctLocationGroups` ≈`:2904-2906`) and pass one object into `generateStartFrameRenderPlan` (call ≈`:2955`, beside the existing `previousFramesByShotNumber` at ≈`:2966`):

1. `previous` — `(episode.startFramePlan as { sceneVisualStates?: unknown } | null)?.sceneVisualStates`, passed **raw**. Sanitising is `carrySceneVisualStates`' job, not the caller's.
2. `sceneShotGroups` — `buildSceneShotGroups({ distinctLocations: storyboard?.distinct_locations, overridesByShotNumber })`, where the override map is built from `previousStartFrames` (`shotNumber → frame.locationKey`).

**Why overrides come from the *previous* frames:** the projector carries `locationKey` forward per frame, so the pre-regen override set is exactly the post-regen one. It is also the only version available before the projection runs.

**Pass `storyboard?.distinct_locations` raw** — `buildSceneShotGroups` takes `unknown` and owns all tolerance rules. Do not pre-filter, do not reuse the already-mapped `distinctLocationGroups` variable if that would drop entries.

**Observability (impure, at the call site only).** After `generateStartFrameRenderPlan` returns, diff the previous keys against `generated.plan.sceneVisualStates` keys and emit one debug/warn line naming the dropped and newly-stale keys. Use the logger PIPE already imports (`debugError` from `../_core/logger`). This must be best-effort and must never fail the stage — same convention as the existing `reconcileEpisodeLocations` try/catch in this file.

### 6.1 The import trap that will break nine test files

**Nine** existing suites mock SFG with an explicit factory that lists only three exports:

```ts
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: mockGenerateStartFrameRenderPlan,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
```

(`verticalDramaEpisodePipeline.{distinctLocations,sceneContracts,repairStage,locationRosterWiring,storyboardRetentionHooks,episodeDraftHydration,characterVariants,retentionHooks,memoryWiring}.test.ts`)

⇒ **PIPE must not start importing any new *runtime* value from SFG.** Import `buildSceneShotGroups` from `@shared/verticalDramaSeries/sceneContinuity` (unmocked everywhere, so the real implementation runs) and keep SFG imports type-only, exactly as the existing `type VerticalDramaStartFramePlanFrame` import at PIPE `:110-114` does. Adding a runtime import would make all nine suites fail with an unhelpful "is not a function" — a Gate B fail-set regression that looks unrelated to this section.

---

## 7. Contracts change

`shared/verticalDramaSeries/contracts.ts`, on `VerticalDramaStartFramePlan` beside `imagePromptLanguage`:

```ts
import type { VdSceneVisualState } from "./sceneContinuity";

/**
 * Feature 138 P1 — per-scene visual lock, keyed by `locationKey` (never by
 * location name: an override resolves to `{ locationKey, name: "" }`).
 * Authored by `vertical-drama-scene-visual-state` (lazily on first use, or
 * explicitly via `planSceneVisualState`), rendered into the injected scene
 * continuity lock block by `renderSceneContinuityLockBlock`.
 *
 * Absent on every plan created before this field existed and on every tenant
 * with `verticalDramaSceneContinuity` off — absent means "no lock", which is
 * byte-identical to the pre-feature behavior everywhere.
 *
 * Survives `start_frame_render_plan` regeneration ONLY because
 * `projectStartFramePlan` explicitly carries it (that function builds a fresh
 * literal and deletes every plan-level key it does not name). See
 * `carrySceneVisualStates` for the invalidation rule.
 */
sceneVisualStates?: Record<string, VdSceneVisualState>;
```

Mirror the field, with a one-line "see contracts.ts" comment, on `StartFrameRenderPlanProjection` (SFG `:266-302`) — the two shapes are kept structurally identical by hand, exactly as the existing per-frame fields are.

`import type` from `./sceneContinuity` cannot create a cycle: section 05's module has **zero imports** by construction, and `contracts.ts` already uses this exact sibling `import type` pattern (`./memory`, `./assembly`, `./videoPromptModelFamily`).

---

## 8. The doc-drift fix

The `previousFramesByShotNumber` param doc comment (SFG ≈`:339-379`) enumerates **six** carried fields — `approvedMediaAssetId`, `locationKey`, `angleGrid`, `angleGridAssetIds`, `productReferenceAssetIds`, `productRefsCustomized` — while the code (≈`:424-437`) carries **seven**: those six plus `canonicalShotSummary` (mentioned later in the comment as a special case, but missing from the list). Its "deliberately never carries over" list names `imagePrompt` / `negativePrompt` / `promptMode` but **omits `promptSafetyAdjustments` and `promptAnalysis`**, which are also silently dropped.

Required edit — comment only:

1. Make the carried list say **seven** fields and include `canonicalShotSummary` explicitly (keeping the existing note that the projection's freshly-resolved value wins over the carried one).
2. Add `promptSafetyAdjustments` and `promptAnalysis` to the deliberately-not-carried list, with the reason: they are per-frame display/audit metadata stamped by the two *per-shot* prompt engines, and a batch regen replaces the prompt they describe — the same rationale that already justifies dropping `promptMode`.

⚠️ **Do not change which fields actually carry.** This is a documentation correction. Any behavioural change here is out of scope and would break the existing carry-over suite.

---

## 9. Traps

1. **`sceneVisualStates: undefined` is not the same as an absent key.** `toEqual` tolerates it; `Object.keys`, `JSON.stringify` and section 11's byte-identical proofs do not. Use the conditional spread.
2. **Empty `sceneShotGroups` means "unknown", not "no scenes".** Rule C3. Getting this backwards silently deletes every lock on the first regen of a legacy storyboard — the exact bug this section exists to prevent, reintroduced from the other direction.
3. **Do not add a runtime import from SFG into PIPE.** §6.1 — nine test files.
4. **Do not resolve scenes inside SFG.** It has no `locationKey` and no storyboard. It compares pre-built groups only.
5. **Do not flag-gate the carry.** §2.3.
6. **`Number(undefined)` is `NaN`, `Number("")` is `0`, `Number(null)` is `0`.** Section 05's resolver handles this for `memberShotNumbers`; do not re-derive membership numbers here.
7. **Do not clear `stale` on a carry.** Rule C4. Only `upsertSceneVisualState` clears it.
8. **The client round-trips the whole plan.** `VerticalDramaEpisodePage.tsx` patches with `{ ...plan, frames: updatedFrames }` in three places, which preserves unknown keys. Section 13's UI must keep that pattern and must never rebuild a plan literal field-by-field, or it will wipe `sceneVisualStates` from the client side.

---

## 10. Discovered adjacent issue — record, do not fix here

`imagePromptMode` (`VerticalDramaStartFramePlan.imagePromptMode`, set per sub-episode by `setEpisodeImagePromptMode`) is **also** absent from `projectStartFramePlan`'s literal, so a `start_frame_render_plan` regeneration silently resets the user's remembered prompt-mode choice back to `"auto"`. Same root cause, same file, different field.

**Do not fix it in this section.** It changes behaviour for tenants with both flags off, which would break section 14's flag-off byte-identical proof and is outside Feature 138's blast radius. Record it in the section's review notes as a follow-up so it can be fixed with its own test.

---

## 11. Tests first (TDD)

Write both suites **before** touching the implementation and confirm they are red for the right reason (helper not exported / key not emitted), then implement until green.

### 11.1 Conventions (from the existing codebase — do not invent new ones)

- Vitest 2.1.9, **always run from `apps/web`** (from the repo root it globs the monorepo and dies on an unreadable directory). Environment is `node`.
- Importing SFG pulls in `llmRouter`, `creditService`, `rateLimiter`, `skillFiles`, `@smartspec/skills`, `fs` and `verticalDramaImproveScript` at module load. **Copy the mock header verbatim from `server/services/__tests__/verticalDramaStartFrameGeneration.test.ts:1-39`** — do not try to import the module without it.
- New file per topic, matching the shipped convention (`verticalDramaStartFrameGeneration.{promptLanguage,locationGrounding,referenceFrameMode,requiredCharacters}.test.ts`).
- Pipeline suite: mirror `verticalDramaEpisodePipeline.distinctLocations.test.ts`'s mocking pattern **exactly** — `vi.hoisted` mock db + the full set of service mocks, and assert on `mockGenerateStartFrameRenderPlan.mock.calls[0][0]`.
- **Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that queues `…Once` values must reset those mocks, or one early throw poisons the rest of the file.
- Prefer a local `makeSceneVisualState(overrides)` factory; keep fixtures small.

### 11.2 File A — `server/services/__tests__/verticalDramaStartFrameGeneration.sceneVisualStates.test.ts`

```
readSceneVisualStatesFromPlan
  returns {} for null, a primitive, an array, and a plan with no sceneVisualStates key
  returns {} when sceneVisualStates is present but not a plain object
  drops entries that resolveSceneVisualState rejects and keeps the well-formed ones
  never throws on deeply malformed jsonb

carrySceneVisualStates — the three-way invalidation rule
  returns undefined when previous is absent            ← the flag-off / legacy path
  returns undefined when every previous entry is unusable
  carries a state UNCHANGED when membership is identical                       (C4)
  carries a state unchanged when membership is the same set in a different order (C4)
  DROPS a state whose memberShotNumbers no longer match when manualEdit is falsy (C5)
  KEEPS a state and sets stale:true when membership changed and manualEdit is true (C6)
  does NOT rewrite memberShotNumbers on a stale keep                           (C6)
  carries everything unchanged, marking nothing stale, when sceneShotGroups is undefined (C3)
  ...and when sceneShotGroups is an EMPTY ARRAY   ← the buildSceneShotGroups([]) trap (C3)
  preserves a pre-existing stale:true across a carry with matching membership   (C4)
  keys the output by the RECORD key and normalizes a disagreeing inner locationKey (C2)
  emits keys in lexicographic order (deterministic)                            (C8)
  does not mutate the input record, its states, or sceneShotGroups             (C9)
  is deterministic (two calls on the same input are deep-equal)

upsertSceneVisualState — the write rule
  lazy origin writes when no state exists
  lazy origin SKIPS with "already_present" when any state exists  ← the one-write concurrency rule
  planned origin overwrites a state with manualEdit falsy
  planned origin SKIPS with "manual_edit_protected" when manualEdit is true and force is not set
  planned origin with force:true overwrites AND clears manualEdit
  manual origin always writes and sets manualEdit:true
  every successful write clears stale and normalizes locationKey to the record key
  never touches sibling scenes; never mutates the input record

projectStartFramePlan — carry-over wiring
  emits NO sceneVisualStates key when the 7th param is omitted (byte-identical to today)
  emits NO key when the 7th param is {} or when previous is an empty object
  omitting the 7th param and passing it as undefined produce deep-equal plans
  sceneVisualStates survives a regeneration when membership is unchanged        ← plan §5.2
  a state whose memberShotNumbers no longer match is DROPPED when manualEdit is falsy
  ...is KEPT and marked stale:true when manualEdit is true
  the emitted key sits after imagePromptLanguage and before frames (key order)
  the per-frame carry-over list is UNCHANGED — the same 7 fields, none added, none lost
      (regression guard over the gap-5 behavior)
  the projection stays pure — no logger, clock or randomness is reachable from it
```

### 11.3 File B — `server/services/__tests__/verticalDramaEpisodePipeline.sceneVisualStates.test.ts`

```
generateRealStartFramePlan threading
  passes sceneVisualStatesCarryOver.previous through RAW from episode.startFramePlan
  passes sceneShotGroups built from the storyboard's distinct_locations
  applies per-shot locationKey overrides (from the PRE-regen frames) to those groups
  passes sceneShotGroups: [] for a storyboard with no distinct_locations, and the
      carried states still survive          ← the end-to-end version of rule C3
  omits nothing / breaks nothing for an episode whose startFramePlan has no
      sceneVisualStates key (byte-identical params object versus today)
  logs (does not throw) when a state is dropped by the regeneration
  an unknown sibling key on startFramePlan is unaffected by this threading
```

### 11.4 Regression suites to re-run unchanged

```
server/services/__tests__/verticalDramaStartFrameGeneration.test.ts
server/services/__tests__/verticalDramaEpisodePipeline.distinctLocations.test.ts
server/services/__tests__/verticalDramaEpisodePipeline.sceneContracts.test.ts
```

The first pins the gap-5 per-frame carry-over contract; the other two are the closest neighbours to the pipeline edit and the earliest warning that §6.1's import trap was tripped.

### 11.5 The three tests that matter most

- **"carries everything unchanged when sceneShotGroups is an EMPTY ARRAY"** — the difference between "we cannot compute membership" and "every scene is gone". Written backwards, this section silently deletes locks instead of preserving them.
- **"KEEPS a state and sets stale:true when manualEdit is true"** — the promise that a user's hand-written lock is never destroyed by a storyboard regeneration.
- **"emits NO sceneVisualStates key when the 7th param is omitted"** — the flag-off byte-identity guarantee that sections 11 and 14 build their proofs on.

---

## 12. Done when

1. Both new suites are fully green, and `verticalDramaStartFrameGeneration.test.ts` is green **with no edits** to its existing assertions.
2. **Gate A stays 266/266** and the **Gate B fail-set is a subset of the section-01 baseline with no new entries.** (Verify by fail-set identity diff, never by comparing counts.)
3. `cd apps/web && pnpm check` (or `npx tsc --noEmit`) introduces **no new** TypeScript errors attributable to the touched files. The repo has a large pre-existing red baseline — diff against it, do not read the raw count.
4. `grep` proves PIPE has **no new runtime import** from `./verticalDramaStartFrameGeneration` (type-only imports are fine).
5. `grep sceneVisualStatesCarryOver` returns exactly: the projector param, the batch params interface, the one forwarding call inside `generateStartFrameRenderPlan`, the pipeline call site, and the tests.
6. The `previousFramesByShotNumber` doc comment lists seven carried fields and names `promptSafetyAdjustments` / `promptAnalysis` as deliberately not carried — with **no change** to which fields actually carry.
7. Files modified: `shared/verticalDramaSeries/contracts.ts`, SFG, PIPE. Files added: the two test files. Nothing else.
8. The `imagePromptMode` finding (§10) is recorded in the section review notes as an untouched follow-up.

---

## 13. Handoff to downstream sections (reference only — do not implement here)

| Section | What it consumes |
|---|---|
| **11** lock injection | `readSceneVisualStatesFromPlan(episode.startFramePlan)[locationKey]` → `renderSceneContinuityLockBlock(state)` → the `sceneContinuityLockBlock?: string` param on all four engines. Scene resolution stays in ROUTER/PIPE. Lazy authoring persists via `upsertSceneVisualState({ origin: "lazy" })` inside the transaction that re-reads the plan row — the helper's `skippedReason: "already_present"` is the pure half of "exactly one persisted state per scene"; the row-lock re-read (copy the pattern at ROUTER `:14645-14661`) is the other half. Lazy authoring is **fail-open**: any failure, including insufficient credits, renders with no lock block and charges nothing. |
| **12** neighbour anchoring | Nothing directly — but note the shared scene grouping: `buildSceneShotGroups` is called with the same override map shape in both places. Keep them consistent. |
| **13** mutations + UI | `planSceneVisualState` uses `upsertSceneVisualState({ origin: "planned", force })` and surfaces `skippedReason: "manual_edit_protected"` as an "already manually edited — use force" response, not an error. `updateSceneVisualState` uses `origin: "manual"`. Both persist with a spread patch that preserves every sibling plan key. The UI reads `stale` to render the "needs review" state, and `memberShotNumbers` to show which shots the lock was authored for. The client must keep patching with `{ ...plan, … }`. |
| **14** joint verification | The flag-off proof that a plan regeneration on an episode with no `sceneVisualStates` key produces a byte-identical plan object, and the flag-on proof that a hand-edited lock survives a storyboard regeneration marked `stale`. |

---

## 14. Implementation record (2026-08-01)

**Status:** complete.

- Added the persisted/projection contract and the three pure helpers:
  `readSceneVisualStatesFromPlan`, `carrySceneVisualStates`, and
  `upsertSceneVisualState`.
- Threaded raw prior state plus scene membership derived from
  `distinct_locations` and pre-regeneration per-shot overrides. The params key
  is omitted entirely for legacy/flag-off plans.
- Added best-effort observability for dropped/newly-stale scene keys without
  adding a runtime import from SFG into PIPE.
- Added 19 focused helper/projector tests. Pipeline coverage was added to the
  existing `verticalDramaEpisodePipeline.distinctLocations.test.ts` harness
  (4 tests) instead of duplicating its large module-mock scaffold in a second
  file; this covers raw pass-through, membership overrides, empty-group
  preservation, flag-off omission, and non-blocking logging.
- Review found no required behavior gap. The binding's row-lock/re-read and
  deterministic charge-once contract applies at the authoring writers delivered
  by sections 11 and 13; Section 10 remains pure and performs no LLM/DB write.
- Verification: section + nearest-neighbor suites 76/76 green. Combined with
  Gate A, 337/342 pass; the same five pre-existing call-count assertions remain
  red (four judged-prompt expectations and one shot-prompt expectation). Full
  TypeScript check initially exposed one tuple-inference error in this section;
  it was fixed. All remaining diagnostics are outside the touched files.
- Untouched follow-up: `imagePromptMode` is still omitted by the projector and
  should receive its own behavior change and regression test outside Feature 138.
