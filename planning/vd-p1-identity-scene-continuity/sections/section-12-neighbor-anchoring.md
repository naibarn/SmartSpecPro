<!-- SECTION: section-12-neighbor-anchoring -->

# Section 12 — Sequential Neighbor Anchoring

## Current-worktree override (binding)

This is a separate P1b canary after section 14. Gate it with
`verticalDramaSceneNeighborAnchors && verticalDramaSceneContinuity`. Resolve and
persist one eligible anchor id before prompt authoring; prompt and render use that
exact id. Revalidate ownership/availability before paid render and fail without
substitution if invalid. Latest-generated means successful current-plan/revision
output only. Serialize within each scene, measure p95 latency, and defer repair-path
anchoring unless focused tests prove it safe.

| | |
|---|---|
| **Section id** | `section-12-neighbor-anchoring` |
| **Depends on** | sections 02, 05, 11, and 14. P1a must be green before this separate child-flag canary begins. |
| **Blocks** | `section-13-scene-mutations-ui` (provenance badge), `section-14-joint-verification` |
| **Runs after** | `section-11-scene-lock-injection` (per the index's execution order — 11 and 12 edit the same two router mutations and the same service param object) |
| **Feature flag** | `verticalDramaSceneContinuity` — resolved once per request in the router, threaded as an optional boolean. Off ⇒ byte-identical to today. |
| **Test command** | `cd apps/web && npx vitest run <paths listed in §6> --reporter=basic` |

> **Source:** `../claude-plan.md` §5.6 (implementation) + `../claude-plan-tdd.md` §3f (tests first). Research anchors: `../claude-research.md` §2.1–2.3. Review findings A1 (critical), A5, A6, A7 in `../reviews/self-review-round-1.md`.
>
> **All work is in `apps/web`.** Line numbers below were verified at HEAD `941547ff1`; sections 01–11 have already edited `server/routers/verticalDramaEpisodes.ts` and `server/services/verticalDramaStartFrameGeneration.ts` by the time this section runs — **anchor by symbol name, never by line number.**

---

## 1. Why this section exists

Feature 138 has two halves. Section 11 shipped the first: a text **scene continuity lock block** injected into every prompt of a scene. This section ships the second and harder one: **letting a shot actually see the previous shot of its own scene.**

Today no start frame is ever rendered with another shot's rendered frame attached. Everything the location photo does not show — sun direction, where the sofa is, which side of the room the camera lives on, what the character is wearing — is re-invented independently for every one of the 9 shots. A text lock narrows that; an actual pixel reference closes it.

The mechanism is one image: for the shot being generated, attach the nearest **lower** shot number in the same scene that has produced an image. That image is attached in two places:

| Where | What it feeds | Cap that governs it |
|---|---|---|
| **Prompt time** | the vision input of the *prompt-authoring LLM* (the text model that writes the image prompt) | `VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES` (VD-internal, 6) |
| **Render time** | the *image model's* reference-image list | that model's `imageCapabilities.maxReferenceImages` |

⚠️ **These two caps are unrelated. Do not conflate them** (review finding A5). Raising the prompt-time cap costs vision tokens on the authoring call and has zero effect on the render payload. Raising it does **not** raise the number of references the paid image model receives.

### 1.1 The detail that decides whether this feature does anything at all

Review finding **A1** is the reason this section is not "attach one more URL and go home":

1. The anchor must fall back to a shot's **most recently generated** asset when nothing is approved — approved wins per-shot, but an approved-only rule returns `undefined` for every shot on the workflow most users take. (`selectSceneContinuityAnchor` in section 05 already implements this; §4 here only has to feed it the two maps.)
2. **"Generate all" must not fan out unordered.** Today it does: `Promise.all(shotNumbers.map(...))` in `client/src/pages/VerticalDramaEpisodePage.tsx` (`onGenerateAllStartFrameImages`, ≈`:5342-5356`). Every shot's prompt+render is submitted before any of them has completed, so at anchor-resolution time no earlier shot has an asset and every anchor is `undefined`.

**Verified correction to `claude-plan.md` §5.6 — read this before designing anything.** The plan assumes "during that batch nothing is approved yet". That is *not* what the code does. `pollStartFrameTask` (`VerticalDramaEpisodePage.tsx` ≈`:1185-1223`) auto-promotes a completed render: it imports the result URL as a media asset and immediately calls `setApprovedStartFrameAsset`, which writes `frames[].approvedMediaAssetId`. So a completed render **is** approved. The consequence is the same but the reason is different, and it changes the fix:

> The anchor is missing during a batch not because approval is pending, but because **the write-back happens only after that shot's own poll resolves**. Serializing within a scene (sub-task 12.4) is therefore not an optimization — it is the entire mechanism. Without it, sub-tasks 12.2 and 12.3 are dead code.

### 1.2 Second verified correction — the prompt-time cap is not currently reachable

`../claude-research.md` caveat #7 states that a shot with its own image + 4 portraits + a location "already silently drops the location image". **That is false at HEAD.** Do the arithmetic against `buildStartFrameShotPromptVisionImages` (`verticalDramaStartFrameGeneration.ts` ≈`:1871-1914`):

```
own image (≤1) + portraits (hard-capped at VD_START_FRAME_SHOT_PROMPT_MAX_PORTRAITS = 4) + location (≤1) = 6
slice(0, VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES = 6)   ⇒ no-op, always
```

The clamp is a defensive no-op today. Adding the anchor makes the maximum 7, and raising the cap to 7 under the flag makes it a no-op again. **The explicit drop order this section adds is therefore a guard, not a hot path** — but it must still exist, be priority-ordered rather than positional, and be logged, because the moment `MAX_PORTRAITS` rises or a second location image is added, a silent positional `slice` would eat the anchor first. §6.1 explains how to reach the over-cap branch in a unit test.

---

## 2. Ground truth already in the codebase (verified — do not re-derive)

**Prompt time — `verticalDramaStartFrameGeneration.ts`**

- `buildStartFrameShotPromptVisionImages(imageUrl?, additionalImageUrls?, cinematicNarrativeVisionInputs?)` is **exported** and directly unit-tested. Order built: own image (unlabeled) → ≤4 portraits labeled `` `Image ${idx + 1} reference: ${label}` `` → one location labeled `` `Location reference: ${label}` `` → `slice(0, 6)` → `additionalImageUrls` appended **after** the clamp (the only cap-exempt channel).
- Its single caller is inside `generateStartFrameShotPrompt` (≈`:1998-2007`), gated by `hasModeTwoVisionInputs`:
  ```ts
  const isCinematicNarrativeMode =
    params.imagePromptMode === "cinematic_narrative" && !params.referenceFrameMode;
  const hasModeTwoVisionInputs =
    isCinematicNarrativeMode &&
    Boolean(params.characterReferenceImages?.length || params.locationReferenceImage);
  ```
  ⚠️ **A shot whose only vision input is the anchor would be dropped by this gate.** The anchor must be added to the `Boolean(...)` disjunction.
- `policy_safe_rewrite` (mode 1) calls the LLM with `hasVision: false, images: []` (≈`:2009-2018`). **Prompt-time anchoring is `cinematic_narrative`-only.** That is a scope fact, not a gap — render-time anchoring (§4.3) covers both modes.
- `projectStartFramePlan` carries exactly 7 per-frame fields (≈`:420-441`), including `approvedMediaAssetId`. See §4.6 for why the anchor provenance is deliberately *not* added to that list.

**Render time — `server/routers/verticalDramaEpisodes.ts`**

- `mergeAndTrimReferenceImageUrls(characterRefUrls, locationRefUrls, productRefUrls, maxReferenceImages)` lives in `server/services/verticalDramaProductTieIn.ts` (≈`:922-938`): concat → dedupe by first occurrence → `slice(0, max)`, i.e. **trims from the END**, so array position *is* priority. Three call sites: `generateStartFrameImage` (≈`:10133`), `generateStartFrameAngleVariations` (≈`:10739`), `generateShotReferenceFrameImage` (≈`:13616`, already passes `[]` for products).
- `assertRequiredCharacterReferenceCapacity` (≈`:1801-1811`) is a **fail-closed** guard that runs **before** the merge at all three sites. It must keep running before, and must keep counting only `characterAttachmentManifest.primaryEntries.length` — the anchor never participates in it.
- `imageCapabilities.maxReferenceImages` is `undefined` for most model rows ⇒ the trim is a no-op. Any test that exercises trimming must use a model row that declares a limit (`mockResolveVerticalDramaCapabilities` returns `maxReferenceImages: 10` in the existing fixtures).

> ### ⚠️ Escalated from section 03 (finding F3) — resolve this before implementing 12.2b
>
> The **primary** image model, kie.ai `gpt-image-2-text-to-image`, declares
> **`maxReferenceImages: 4`** in its seeded `configJson`
> (`scripts/seed-media-models-kie-ai.ts:1576`, mirrored by `inputFields[0].maxItems`
> at `:1583`) — even though the kie.ai API itself accepts **16** `input_urls`.
> Section 03 deliberately did **not** change it (prompt length and reference
> capacity are different budgets) and escalated the decision here, because at 4 the
> trim is **not** a no-op on the model this feature actually runs on:
> characters + location + product can fill all four slots and evict the anchor,
> making render-time anchoring a silent no-op exactly where it matters most.
>
> **RESOLVED — this is now sub-task 12.0 (§4.0), a required first step, not a
> decision to make at implementation time.** Raise the seeded value to the API's
> real limit of 16 (seed script + targeted `jsonb_set` on the live row, own commit,
> own test). The full procedure and the single permitted alternative are in §4.0.
- Render-time reference URLs are used **raw** (`characterRefEntries.map(e => e.url)`); prompt-time URLs are absolutized with `resolveReferenceUrl(url, ctx.publicUrl ?? undefined)` (≈`:12955-12967`). Follow each side's own convention exactly — **always pass `ctx.publicUrl`**; a self-fetch fallback dies with "fetch failed" from a systemd-managed service.
- `resolveEffectiveShotLocationIdentity` (≈`:2041-2071`) is the module-private precedence function: per-shot override wins → else the **first** `distinct_locations` group containing the shot → else `undefined`. Section 05's `buildSceneShotGroups` deliberately mirrors its first-match rule. Do not re-implement either here.
- `generateStartFrameImage` already performs a conditional `db.update` of `startFramePlan` when the prompt-QC step rewrote the prompt (≈`:10356-10381`). §4.5 extends that **existing** write rather than adding a second one.
- `repairShotImage` (≈`:11084`) attaches only the shot's own current image (`referenceImageUrls: [currentUrl]` ≈`:11519`; Hermes branch ≈`:11454` with `roleFor: () => "current_image"`, `requireAll: true`).

**Client**

- `onGenerateAllStartFrameImages` receives `shotsNeedingImages` — already ascending shot order (`VerticalDramaStoryboardPanel.tsx` ≈`:2347-2353`), filtered to shots with a prompt and no approved image. The array order is fine; the **concurrency** is the problem.

---

## 3. Deliverables

### 3.1 Files modified

| File | Change | Risk |
|---|---|---|
| `server/services/verticalDramaProductTieIn.ts` | widen `mergeAndTrimReferenceImageUrls` to a 4-array signature | Medium — positional signature, 3 call sites |
| `server/routers/verticalDramaEpisodes.ts` | new module-private `resolveShotSceneContinuityAnchor` helper; anchor wiring in `generateStartFrameImage` + `generateShotStartFramePrompt`; `[]` at the two other merge call sites; provenance persist | High — 13k-line file, concurrently edited |
| `server/services/verticalDramaStartFrameGeneration.ts` | `sceneAnchorImage` + `sceneContinuityEnabled` on `GenerateStartFrameShotPromptParams`; anchor slot + flag-raised cap + priority drop order in `buildStartFrameShotPromptVisionImages`; widen `hasModeTwoVisionInputs` | Medium |
| `shared/verticalDramaSeries/sceneContinuity.ts` | **additive export only**: `planSceneOrderedBatch` | Low |
| `shared/verticalDramaSeries/contracts.ts` | additive `sceneAnchor?` on `VerticalDramaStartFramePlan.frames[]` | Low |
| `client/src/pages/VerticalDramaEpisodePage.tsx` | scene-ordered "generate all" runner | Medium |

### 3.2 Files created (tests)

| Path | Covers |
|---|---|
| `shared/verticalDramaSeries/__tests__/sceneContinuity.batchOrder.test.ts` | `planSceneOrderedBatch` (new file so section 05's suite stays untouched) |
| `server/services/__tests__/verticalDramaStartFrameGeneration.sceneAnchorVision.test.ts` | prompt-time attach list, cap, drop order, logging, flag-off byte-identity |
| `server/routers/__tests__/verticalDramaEpisodes.sceneAnchorReference.test.ts` | render-time anchor resolution, attach position, DB-read count, provenance persist |

### 3.3 Files modified (existing tests)

| Path | Why |
|---|---|
| `server/services/__tests__/verticalDramaProductTieIn.test.ts` (`describe("mergeAndTrimReferenceImageUrls")`, ≈`:299-398`, **10 cases**) | every call passes `maxReferenceImages` in the 4th slot |
| `server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts` (≈`:499-556`, **4 `toEqual` cases**) | must stay green **unmodified** — see §5.1 |

> The plan says "twelve positional assertions" in `verticalDramaProductTieIn.test.ts`; the verified count is **10 `it` blocks / ~19 `expect`s**. Count them yourself before claiming completeness.

### 3.4 Explicitly out of scope

- The scene lock **text** block (section 11) — do not touch `sceneContinuityLockBlock`.
- The scene chip / lock dialog / provenance badge UI (section 13). This section only **persists** the provenance the badge reads.
- Any cascade or invalidation when an anchored-to frame later changes. **There are no cascades** — deliberate credit protection (review finding A7). P2's continuity QC surfaces the mismatch.
- `generateStartFrameAngleVariations` and `generateShotReferenceFrameImage` receive an **empty** anchor array. They keep today's behavior exactly.

---

## 4. Implementation, as five ordered sub-tasks

Each sub-task is its own commit and must be green before the next starts.

### 4.0 Sub-task 12.0 — raise `gpt-image-2`'s reference cap to its real API limit (REQUIRED, do this first)

**This is no longer a menu of options.** Spec 137 §9.5.1 lists
`maxReferenceImages: 16` as part of the seed change, and spec 138 §8.3 asserts as
fact that "on the primary render model (kie.ai `gpt-image-2`, ≤16 `input_urls`) the
neighbor is **never** capacity-trimmed". The seeded row says **4**
(`scripts/seed-media-models-kie-ai.ts:1576`, mirrored by `inputFields[0].maxItems`
at `:1583`) — a value that was already wrong relative to the provider API, which
accepts 16. Left at 4, a shot with 3+ character references or any product reference
trims the anchor away, and **half of Feature 138 ships green, fully tested, and
inert on the model it actually runs on.**

**Do this:**

1. **Back up first** (Database Safety Protocol): `pg_dump --data-only
   --table=media_models` into `.db-backups/`, and record `SELECT count(*) FROM media_models;`.
2. **Seed script**: change `maxReferenceImages: 4` → `16` and
   `inputFields[0].maxItems: 4` → `16` on the `gpt-image-2-text-to-image` entry.
3. **Live row**: apply a single-row, single-key `jsonb_set` on
   `media_models WHERE "modelId" = 'gpt-image-2-text-to-image'` — exactly the
   targeted procedure section 03 §8.2 documents. **Do not re-run the seed**; its
   `ON CONFLICT … "configJson" = EXCLUDED."configJson"` overwrites the whole blob
   for every kie.ai row and would discard admin edits.
4. **Verify**: row count unchanged; that row's `configJson->>'maxReferenceImages'`
   reads `16` while `maxPromptLength` (section 03's change) is still intact.

**Own commit, own test, own PR line.** This changes trimming for *every* existing
`gpt-image-2` render, VD and marketplace alike — it is a platform-wide correctness
fix, not a VD-local one. Test: `mergeAndTrimReferenceImageUrls` at cap 16 keeps
characters + location + anchor + products with `trimmedCount: 0` for a realistic
3-character shot.

**If the conductor rejects the raise** (the only acceptable alternative): spec 138
§8.3 must be amended in the same PR — it currently asserts something false — and a
P1 limitation row must be added to section 14 §12 stating that render-time anchoring
is dropped on `gpt-image-2` whenever a shot needs 4+ higher-priority references,
with the §4.3 drop logged so the frequency is measurable. Silently leaving §8.3
false is the one outcome forbidden.

### 4.1 Sub-task 12.1 — widen `mergeAndTrimReferenceImageUrls` (pure refactor, no behavior change)

New signature — the anchor array sits **between location and product**:

```ts
/**
 * Priority, highest → lowest (trimming removes from the END):
 *   character refs  — identity lock, never trimmed first
 *   location ref    — environment lock, at most one URL per shot
 *   scene anchor    — F138 same-scene neighbor frame (at most one URL)
 *   product refs    — trimmed first (it has its own independent hard gate)
 *
 * `sceneAnchorRefUrls` is `[]` for every caller that has no anchor concept,
 * which reproduces the pre-F138 3-array behavior byte-for-byte.
 */
export function mergeAndTrimReferenceImageUrls(
  characterRefUrls: string[],
  locationRefUrls: string[],
  sceneAnchorRefUrls: string[],
  productRefUrls: string[],
  maxReferenceImages: number | undefined,
): { urls: string[]; trimmedCount: number };
```

Body change is one array literal. Dedupe-by-first-occurrence and end-slicing are untouched.

Update **all three** call sites in the same commit, passing `[]` in the new third slot at `generateStartFrameAngleVariations` and `generateShotReferenceFrameImage`, and (for now) `[]` at `generateStartFrameImage` too — sub-task 12.2 fills it.

> **Why this is safe to land alone:** every existing call passes `maxReferenceImages` (a `number | undefined`) in the 4th slot. After the widening, that slot is `string[]`, so a stale call is a `pnpm check` error, and an `undefined` left there makes `productRefUrls` `undefined` and throws on spread. There is no silent-drift failure mode. Run `pnpm check` before the test suite.

### 4.2 Sub-task 12.2a — the shared router resolver

One module-private helper, used by both 12.2b and 12.3. It is the only place that turns "a shot" into "an anchor image".

```ts
/**
 * F138 P1 — resolve this shot's same-scene neighbor anchor.
 *
 * Fail-open and read-cheap: returns `undefined` when the flag is off, when
 * the shot has no scene, when no earlier shot of the scene has an image, or
 * when the anchor's media asset can no longer be resolved (deleted /
 * inaccessible). Never throws, never blocks a render.
 *
 * DB cost: ZERO extra reads when it returns `undefined` before the URL
 * lookup; EXACTLY ONE `resolveMediaAssetUrlsByIds` call otherwise.
 */
async function resolveShotSceneContinuityAnchor(input: {
  tenantId: string;
  userId: number;
  seriesId: number;
  shotNumber: number;
  storyboard: unknown;                      // row.storyboard, raw jsonb
  plan: VerticalDramaStartFramePlan | null; // for frames[] + per-shot locationKey overrides
  sceneContinuityEnabled: boolean;
}): Promise<{ anchor: VdSceneAnchor; url: string } | undefined>;
```

Composition (no new logic — all rules live in section 05's pure module):

1. `if (!input.sceneContinuityEnabled) return undefined;` — **first line**, before any work.
2. `buildSceneShotGroups({ distinctLocations: (storyboard as any)?.distinct_locations, overridesByShotNumber })` where the overrides map is built from `plan.frames[].locationKey`.
3. `findSceneShotGroupForShot(groups, shotNumber)`.
4. Build the two id maps (see §4.2.1) and call `selectSceneContinuityAnchor`.
5. `resolveMediaAssetUrlsByIds(tenantId, userId, [anchor.mediaAssetId])` → `undefined` if the URL is missing.

#### 4.2.1 What feeds the two id maps (pin this — it is the A1 fix)

| Map | Source | Note |
|---|---|---|
| `approvedAssetIdByShotNumber` | `Number(frame.approvedMediaAssetId)` for every frame | Populated during a batch **because completed renders auto-promote** (§1.1). This map does the real work. |
| `latestGeneratedAssetIdByShotNumber` | `frame.angleGridAssetIds?.at(-1)` | The only durable per-shot record of a generated-but-not-current image. `recordShotAngleGridAsset` documents most-recent-last, capped at 5. Covers a shot whose main image was dropped or swapped. |

`selectSceneContinuityAnchor` rejects `NaN` / `0` / negatives / non-integers itself — do **not** pre-filter beyond `Number(...)` coercion, or the module's own contract tests stop describing the call site.

### 4.3 Sub-task 12.2b — render time (`generateStartFrameImage`)

1. Resolve the flag **once**, beside the other flag resolutions already in this mutation:
   `const sceneContinuityEnabled = await resolveVerticalDramaSceneContinuityFlag(tenantId);`
2. Call `resolveShotSceneContinuityAnchor(...)` immediately after `locationRefUrls` is computed and **before** `assertRequiredCharacterReferenceCapacity`.
3. `const sceneAnchorRefUrls = sceneAnchor ? [sceneAnchor.url] : [];` — raw URL, no `resolveReferenceUrl` (matches `characterRefUrls` / `locationRefUrls` on this path).
4. Pass it as the new third argument to `mergeAndTrimReferenceImageUrls`.
5. `assertRequiredCharacterReferenceCapacity` **keeps running first and keeps its current arguments.** The anchor must never turn a renderable shot into a `PRECONDITION_FAILED`.

Ordering invariant to preserve: capacity guard → merge/trim → credit reserve → transport decision → submit.

### 4.4 Sub-task 12.3 — prompt time (`buildStartFrameShotPromptVisionImages`)

**Service signature** (additive fields on the existing third parameter object — this is what keeps the four `toEqual` assertions in `imagePromptModes.test.ts` valid unmodified):

```ts
export function buildStartFrameShotPromptVisionImages(
  imageUrl?: string,
  additionalImageUrls?: VisionAwareImageInput[],
  cinematicNarrativeVisionInputs?: {
    characterReferenceImages?: readonly { url: string; label: string }[];
    locationReferenceImage?: { url: string; label: string };
    /** F138 — the same-scene neighbor frame. Attached AFTER the location. */
    sceneAnchorImage?: { url: string; anchorShotNumber: number };
    /** Raises the auto cap 6 → 7. Flag-off callers omit it. */
    sceneContinuityEnabled?: boolean;
  },
): VisionAwareImageInput[];
```

**New exported constants** (tests and section 08's skill wording key off these literals):

```ts
/** Auto-attachment cap when the scene-continuity flag is ON (6 + the anchor). */
export const VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES_WITH_SCENE_ANCHOR = 7;

/** Exact vision label for the anchor. Changing it is a cross-section break. */
export function formatSceneContinuityVisionLabel(anchorShotNumber: number): string;
// → `Scene continuity reference (shot ${n}): same scene, same lighting, same set`
```

**Behavioral rules**

| Rule | Behavior |
|---|---|
| P1 Position | The anchor is appended **after** the location entry, before the clamp. |
| P2 Cap | `sceneContinuityEnabled === true` ⇒ cap 7; otherwise cap 6. No other input changes the cap. |
| P3 Drop order | If the auto list exceeds the cap, drop in this order until it fits: **scene anchor → location → the last portrait**. Never the shot's own image. Implement as an explicit priority list, **not** as a positional `slice` (§1.2). |
| P4 Logging | A dropped anchor logs `console.warn("[vd_shot_start_frame_prompt] scene continuity anchor dropped by the vision-attachment cap", { anchorShotNumber, cap, attached })`. Today's location drop is silent — **do not repeat that**; if the location is dropped, warn too. |
| P5 Exempt tail | `additionalImageUrls` is still appended **after** the clamp, uncapped. Unchanged. |
| P6 Absent ⇒ identical | With `sceneAnchorImage` absent, the returned array is `toEqual`-identical to today for every input, including the existing 4 fixtures. |

**Caller changes in `generateStartFrameShotPrompt`**

- Add `sceneAnchorImage?: { url: string; anchorShotNumber: number }` and `sceneContinuityEnabled?: boolean` to `GenerateStartFrameShotPromptParams` (beside `locationReferenceImage`). Both optional; omitted ⇒ today's behavior.
- Widen the gate: `Boolean(params.characterReferenceImages?.length || params.locationReferenceImage || params.sceneAnchorImage)`.
- Forward both new fields into the `cinematicNarrativeVisionInputs` object literal.

**Router changes in the `generateShotStartFramePrompt` mutation**

- Resolve the flag once; call `resolveShotSceneContinuityAnchor(...)`.
- Pass `sceneAnchorImage: anchor ? { url: resolveReferenceUrl(anchor.url, ctx.publicUrl ?? undefined), anchorShotNumber: anchor.anchor.anchorShotNumber } : undefined` — **absolutized here**, matching the sibling `characterReferenceImages` / `locationReferenceImage` lines.
- Pass `sceneContinuityEnabled`.

### 4.5 Sub-task 12.4 — scene-ordered batch execution (the sub-task that makes the feature real)

**a) Additive pure export** in `shared/verticalDramaSeries/sceneContinuity.ts`:

```ts
/**
 * Split a batch of shot numbers into independent LANES for scene-aware
 * generation. Shots inside one lane must run SEQUENTIALLY in ascending order
 * (each can then anchor to the frame the lane just produced); lanes are
 * independent and may run in parallel.
 *
 *  - one lane per scene, ascending, containing only the requested shots
 *  - every shot with no scene gets its own single-element lane (maximum
 *    parallelism — a scene-less shot can never have an anchor)
 *  - lane order is deterministic: by each lane's lowest shot number
 *  - a shot appears in exactly one lane; the union equals the input set
 */
export function planSceneOrderedBatch(input: {
  shotNumbers: readonly number[];
  groups: readonly VdSceneShotGroup[];
}): number[][];
```

Pure, zero I/O, browser-safe (the client imports it). Put its tests in a **new** file so section 05's suite is not edited.

**b) Client runner** in `VerticalDramaEpisodePage.tsx`'s `onGenerateAllStartFrameImages`:

- Flag off (or the storyboard yields no groups) ⇒ **today's exact code path**: `Promise.all(shotNumbers.map(...))`. Byte-identical behavior, no new awaits.
- Flag on ⇒ build groups from the episode's `storyboard.distinct_locations` + `startFramePlan.frames[].locationKey`, call `planSceneOrderedBatch`, then run **lanes in parallel, shots within a lane sequentially**:
  `await Promise.all(lanes.map(lane => runLaneSequentially(lane)))`.
- "Sequentially" means **awaiting the shot's poll to resolve**, not just awaiting `.mutate()`. `handleGeneratePromptAndImage` submits and `pollStartFrameTask` resolves on completion — the write-back that creates the next shot's anchor happens inside that poll. Awaiting only the submit reproduces today's bug with extra code.
- `setPollingStartFrameShots` must still mark **all** batch shots as pending up front, so the UI does not look idle while a lane waits. Do not change that.
- Keep the three `require*OrToast` preflight guards first, unchanged.

> **Known cost, accepted:** a 9-shot single-scene episode now renders serially instead of concurrently. That is the price of the feature and applies only under the flag. Multi-scene episodes still parallelize across scenes.
>
> **Do not "improve" this into a server-side batch mutation.** There is no server-side generate-all today, and adding one is a much larger change (credits, idempotency, transport, polling) that P1 does not need.

**c) Client-side flag read — use `flags.sceneContinuity`, and nothing else.**
`getEpisodeDetail` returns `flags.sceneContinuity` (added by **section 02** §5.3b
precisely so this section can depend on it). Read it exactly as the page already
reads `flags.qualityLoopV2` / `flags.tieInQc`.

> ⚠️ **Do NOT fall back to "the presence of `startFramePlan.sceneVisualStates`".**
> An earlier draft of this section proposed that. It is wrong in the one scenario
> that matters: on a **fresh sub-episode** no scene state exists yet, so the client
> would take the legacy parallel `Promise.all` branch and **no shot would anchor** —
> silently reproducing the exact A1 failure this whole section exists to fix, on the
> exact episode section 14 §9.1 mandates for the smoke test. Gate on the flag only.

Never add a new tRPC round-trip just to read a flag.

### 4.6 Sub-task 12.5 — provenance persistence (needed by section 13)

Additive field on `VerticalDramaStartFramePlan.frames[]` in `shared/verticalDramaSeries/contracts.ts`:

```ts
/**
 * F138 P1 — which same-scene neighbor frame was attached when THIS frame's
 * image was last generated. PROVENANCE, not a live claim: there are no
 * cascades, so the referenced shot may have been regenerated since. The UI
 * must phrase it in the past tense ("สร้างโดยอ้างอิงภาพช็อต N").
 */
sceneAnchor?: {
  anchorShotNumber: number;
  mediaAssetId: number;
  source: "approved" | "latest_generated";
  attachedAt: string; // ISO
};
```

Write it in `generateStartFrameImage` by **extending the existing conditional plan write** (the prompt-QC block ≈`:10356-10381`) — widen its condition to `promptChanged || sceneAnchorChanged`, and patch both fields in the same `updatedFrames.map`. With the flag off there is never an anchor, so the condition, the write and the `db.update` call count are unchanged.

**Do not add `sceneAnchor` to `projectStartFramePlan`'s carry-over list.** Section 10's regression test pins that list at its current 7 fields, and a regenerated plan re-authors prompts anyway (the shot will be re-rendered). The badge disappearing after a full plan regeneration is an accepted P1 limitation — record it in the PR. If a reviewer insists it be carried, it is a one-line conditional spread **plus** an update to section 10's test; do not do one without the other.

### 4.8 Sub-task 12.7 — the `vd_scene_neighbor_anchor_attached` audit event (REQUIRED)

Spec 138 §21 requires it, and — more concretely — **section 14 §9.3 step 9's manual
smoke instructs the verifier to grep the audit JSONL for anchor attachment at both
layers.** Without this event that check cannot pass, so the branch's acceptance
procedure is unexecutable. It is also the only way to measure §17's GA gate.

Emit one event per attach decision, at **both** layers, using the repo's existing
audit-JSONL helper with the request's `traceId`:

```
event: "vd_scene_neighbor_anchor_attached"
fields: { shotNumber, anchorShotNumber, source: "approved" | "latest_generated",
          layer: "prompt" | "render", dropped: boolean, dropReason?: "cap" | "trim" }
```

- `dropped: true` covers spec §19's "neighbor anchor dropped by model cap (audit
  note, not user-facing)" — that requirement is an **audit note**, so the
  `console.warn` in §4.4 P4 is necessary but not sufficient; emit both.
- Emit nothing at all when the flag is off (no anchor is resolved, so there is no
  decision to record) — this keeps the flag-off audit stream byte-identical.

Tests (add to the two suites this section already creates):

```
Test: flag ON + an anchor attached at render time emits exactly one event with layer "render"
Test: flag ON + an anchor attached at prompt time emits exactly one event with layer "prompt"
Test: a dropped anchor emits dropped:true with its dropReason
Test: flag OFF emits NO vd_scene_neighbor_anchor_attached event at all
```

### 4.7 Sub-task 12.6 — `repairShotImage` (LAST, and explicitly deferrable)

Per review finding **A6**: adding the anchor here touches a fail-closed transport branch (`roleFor: () => "current_image"`, `requireAll: true`) and changes that branch's operation decision, for the smallest gain in the section — a repair already holds the strongest possible continuity reference, the shot's own image.

**Ship sub-tasks 12.1–12.6 first. If any risk or time pressure appears, drop this one.** The feature loses nothing material; P2 can revisit. If you do implement it: the anchor goes *after* the current image, the Hermes `roleFor` must map the second URL to a non-`current_image` role, and `requireAll` must not start rejecting a shot whose anchor asset vanished.

---

## 5. Flag-off byte-identity argument

This is a tested requirement, not a claim.

| Path | Why it is identical with the flag off |
|---|---|
| `mergeAndTrimReferenceImageUrls` | `[]` in the new slot ⇒ the merged array is the same concatenation in the same order; the dedupe and end-slice are untouched. |
| Prompt-time vision array | `sceneAnchorImage` absent ⇒ no entry appended; `sceneContinuityEnabled` absent ⇒ cap stays 6; the priority-drop path is unreachable because the auto list still maxes at 6. |
| `hasModeTwoVisionInputs` | The added disjunct is always `false`. |
| DB reads | `resolveShotSceneContinuityAnchor` returns on its first line. `expect(mockDb.select).toHaveBeenCalledTimes(N)` must match the pre-branch N exactly. |
| Plan writes | `sceneAnchorChanged` is always `false`, so the existing conditional write fires under exactly the same condition as today. |
| "Generate all" | The client takes the pre-existing `Promise.all` branch verbatim. |

### 5.1 The four existing vision-array assertions must pass UNMODIFIED

`claude-plan.md` §6.2 anticipated updating the four `toEqual` cases in `verticalDramaStartFrameGeneration.imagePromptModes.test.ts:499-556`. **With the design in §4.4 they do not need to change** — the anchor is an optional field on an existing parameter object, and all four fixtures omit it.

**Treat any required edit to those four assertions as a design smell**, not as expected work: it means the anchor changed the flag-off output. Stop and fix the design instead of the test.

---

## 6. Tests first (TDD)

Write each sub-task's tests before its implementation and confirm they fail for the right reason.

**Conventions (from the existing codebase — do not invent new ones)**

- Vitest 2.1.9, **always run from `apps/web`**. Environment `node` for everything here.
- Pure module: zero mocks. Template — `shared/verticalDramaSeries/__tests__/videoPromptModelFamily.test.ts`.
- Service: mock the module graph at the top, assert on the built array. Template — `verticalDramaStartFrameGeneration.imagePromptModes.test.ts`.
- Router: mock `../../_core/trpc` so `.mutation(fn)` returns the raw handler; call `router.procedure({ ctx, input })` with a plain `ctx`; thenable `selectChain(rows)` stubs; queue one `mockReturnValueOnce` per `db.select()` call site **in order**. Template — `server/routers/__tests__/verticalDramaEpisodes.locationReference.test.ts` (the direct precedent: same procedures, same fixtures, and its header already documents the widened merge signature — **update that header comment**).
- **Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that queues `…Once` values must `mockReset()` them, or one early throw poisons the rest of the file.

### 6.1 `verticalDramaStartFrameGeneration.sceneAnchorVision.test.ts` (new)

```
buildStartFrameShotPromptVisionImages — scene anchor
  attaches no anchor entry and is toEqual-identical to today when sceneAnchorImage is absent
  attaches no anchor entry when the whole cinematicNarrativeVisionInputs object is absent
  appends the anchor AFTER the location entry when provided
  labels the anchor exactly "Scene continuity reference (shot 3): same scene, same lighting, same set"
  keeps additionalImageUrls appended after the clamp, uncapped, unchanged
  cap is 6 when sceneContinuityEnabled is omitted/false and 7 when true
  own image + 4 portraits + location + anchor all survive at cap 7   ← the normal flag-on case
  drops the ANCHOR first when over cap (anchor supplied without raising the cap)   ← reaches P3
  drops the LOCATION second (anchor already gone, still over cap)
  never drops the shot's own image
  warns with { anchorShotNumber, cap } when the anchor is dropped
  warns when the location is dropped (today it is silent — regression guard)

generateStartFrameShotPrompt — vision gate
  a shot whose ONLY vision input is the anchor still takes the mode-2 vision path
  policy_safe_rewrite never receives an anchor (hasVision false, images [])
  referenceFrameMode never receives an anchor
```

> **How to reach the over-cap branch:** call the exported function directly with a `sceneAnchorImage` and **without** `sceneContinuityEnabled`. Cap stays 6, candidates total 7, priority drop fires. This is a legitimate unit-level path and the only way to pin P3 while the production configuration keeps it unreachable.

### 6.2 `verticalDramaProductTieIn.test.ts` (modify the existing `describe`)

```
mergeAndTrimReferenceImageUrls
  <all 10 existing cases, updated to pass [] in the new 3rd slot, same expectations>
  merges character, location, anchor, then product in that priority order
  trims product before ever trimming the anchor
  trims the anchor before ever trimming the location
  trims the location before ever trimming a character ref (unchanged rule)
  dedupes an anchor URL that is already present as a character or location ref
  an empty anchor array is byte-identical to the pre-F138 3-array shape
  maxReferenceImages undefined ⇒ no trim at all (guards the "undefined for most models" fact)
```

### 6.3 `verticalDramaEpisodes.sceneAnchorReference.test.ts` (new)

```
generateStartFrameImage — render-time anchor
  flag OFF ⇒ referenceImageUrls byte-identical to today AND db.select called exactly N times
  flag OFF ⇒ no sceneAnchor is persisted and startFramePlan is not written
  flag ON, shot 1 of a scene ⇒ no anchor (first shot), no extra db.select
  flag ON, shot 2 with shot 1 approved ⇒ shot 1's URL sits between location and product
      ← the test that proves the feature works at all
  flag ON, shot 3 with shot 2 latest_generated and shot 1 approved ⇒ anchors to shot 2
  flag ON, shot with no scene ⇒ no anchor, no extra db.select
  flag ON, anchor asset URL unresolvable (deleted) ⇒ renders anyway, no anchor, no throw
  flag ON ⇒ exactly ONE additional db.select versus flag OFF
  the fail-closed character-capacity guard still runs BEFORE the merge
  the anchor never counts toward assertRequiredCharacterReferenceCapacity
  persists frames[].sceneAnchor { anchorShotNumber, mediaAssetId, source } on success
  a model with undefined maxReferenceImages is unaffected (trim is a no-op)

generateStartFrameAngleVariations / generateShotReferenceFrameImage
  both behave identically to today (empty anchor array), flag on or off

generateShotStartFramePrompt — prompt-time anchor
  flag OFF ⇒ vision array byte-identical, no extra db.select
  flag ON ⇒ the anchor URL is absolutized with ctx.publicUrl
```

### 6.4 `sceneContinuity.batchOrder.test.ts` (new)

```
planSceneOrderedBatch
  one lane per scene, each ascending
  two scenes ⇒ two lanes (parallelizable)
  a shot with no scene gets its own single-element lane
  only the REQUESTED shots appear (a scene's unrequested shots are not injected)
  every input shot appears exactly once; the union equals the input set
  lane order is deterministic (by lowest shot number) and duplicate-input-safe
  empty input ⇒ []
  no groups at all ⇒ one lane per shot (today's full-parallel behavior)
```

### 6.5 Test that is deliberately NOT written

A jsdom mount of `VerticalDramaEpisodePage.tsx` to prove sequential execution. Big VD panels do not mount in jsdom in this repo. The lane **planning** is unit-tested in §6.4; the lane **execution** is covered by section 14's manual smoke ("generate all on a fresh episode, confirm shots 2+ carry an anchor"). Do not spend the section's budget fighting jsdom.

---

## 7. Verification

```bash
cd apps/web

# 1. This section's suites
npx vitest run \
  shared/verticalDramaSeries/__tests__/sceneContinuity.batchOrder.test.ts \
  shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.sceneAnchorVision.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts \
  server/services/__tests__/verticalDramaProductTieIn.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.sceneAnchorReference.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.locationReference.test.ts \
  --reporter=basic

# 2. Types — the widened positional signature lives or dies here
pnpm check

# 3. Gate A (the 7-file video-prompt list from section-01) — must still be 266/266
# 4. Gate B — regenerate the fail-set and diff it against section-01's baseline
```

**Never pipe a vitest run through `tail`** — it truncates the FAIL block. Capture the Gate B **fail set**, not the count:
`--reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`.
Compare fail-sets as **sets**. A name leaving counts as progress only if no new name entered.

---

## 8. Risks and gotchas

| Risk | Mitigation |
|---|---|
| **The anchor resolves to nothing on the common path** — the whole half of F138 ships and does nothing, reading as "not deployed" | The per-shot preference order (§4.2.1) plus scene-ordered batching (§4.5). Verify explicitly with §6.3's "shot 2 anchors to shot 1" test *and* section 14's smoke. |
| Positional signature change breaks 3 call sites + 10 assertions | Sub-task 12.1 is its own commit with its own test update; `pnpm check` catches every stale call. |
| Anchor silently dropped by a cap (prompt time) | Cap 6→7 under the flag + explicit priority drop order + a warn log. Tested at both caps. |
| **Anchor evicted at RENDER time on the primary model** — `gpt-image-2` declares `maxReferenceImages: 4` (section 03 finding F3) | **Sub-task 12.0 (§4.0) raises it to the API's real 16 before anything else in this section.** Own commit, own backup, own test. |
| Concurrent edits to `verticalDramaEpisodes.ts` / `verticalDramaStartFrameGeneration.ts` reverting work (sections 11 and 13 touch the same files; this repo has lost edits to concurrent sessions) | Re-read immediately before every edit; write, then `grep` to confirm the insert survived; keep each sub-task's diff small and committed. |
| Anchor turns a renderable shot into `PRECONDITION_FAILED` | `assertRequiredCharacterReferenceCapacity` keeps its current arguments and still runs before the merge; explicit test. |
| Serialization makes "generate all" feel slow | Flag-gated; lanes still parallelize across scenes; documented as the deliberate cost. |
| Anchor asset deleted between resolution and render | Resolver returns `undefined` on an unresolvable URL; render proceeds. Tested. |
| Stale provenance after a neighbor is regenerated (A7) | Accepted P1 limitation. Section 13 phrases the badge in the past tense. P2's continuity QC surfaces it. |
| `repairShotImage` fail-closed Hermes branch breaks | Sub-task 12.6 is last and deferrable (A6). |
| Extra vision tokens on every flag-on authoring call (A5) | One image per call, only on shots that actually have an anchor. State it in the PR description. |

---

## 9. Done when

- [ ] `mergeAndTrimReferenceImageUrls` takes 4 arrays; all three call sites updated; its suite green with the anchor cases added.
- [ ] `resolveShotSceneContinuityAnchor` exists, returns on its first line when the flag is off, and costs at most one extra `db.select` otherwise.
- [ ] `generateStartFrameImage` attaches the anchor between location and product, after the unchanged capacity guard.
- [ ] `buildStartFrameShotPromptVisionImages` attaches the anchor after the location, caps at 7 under the flag, drops by explicit priority (anchor → location → last portrait), and logs every drop.
- [ ] `hasModeTwoVisionInputs` accepts an anchor-only shot; mode 1 and `referenceFrameMode` still attach nothing.
- [ ] `planSceneOrderedBatch` is exported and unit-tested; "generate all" runs lanes in parallel and shots within a lane sequentially, awaiting each shot's **poll**.
- [ ] `frames[].sceneAnchor` is persisted via the existing conditional plan write, and is **not** added to `projectStartFramePlan`'s carry-over list.
- [ ] The four `toEqual` assertions in `imagePromptModes.test.ts` pass **unmodified**.
- [ ] Flag-off proofs green: identical vision arrays, identical reference arrays, identical `db.select` counts, identical plan-write behavior.
- [ ] `pnpm check` clean; Gate A 266/266; Gate B fail-set a subset of section-01's baseline with zero new entries.
- [ ] Sub-task 12.6 (`repairShotImage`) either landed with tests, or explicitly recorded as deferred to P2 in the PR description.
- [ ] **Sub-task 12.0 landed**: `gpt-image-2-text-to-image` declares `maxReferenceImages: 16` in both the seed script and the live row, `media_models` row count unchanged, `maxPromptLength` intact, cap-16 trim test green, own commit + PR line.
- [ ] `vd_scene_neighbor_anchor_attached` audit events are emitted at both attach layers and asserted in tests (§4.8) — without them section 14 §9.3 cannot be executed.

---

## 10. Handoff to downstream sections (reference only — do not implement here)

| Section | What it consumes |
|---|---|
| **13** UI | `frames[].sceneAnchor` → the provenance badge, copying the engine-badge pattern in `VerticalDramaStoryboardPanel.tsx` (≈`:4614-4634`). Render it **only** when the field is present, and phrase it as past-tense provenance: **"สร้างโดยอ้างอิงภาพช็อต N"**, never "อ้างอิงช็อต N". The client re-declares its own view types (`VerticalDramaStoryboardPanel.tsx` ≈`:556-596`) — mirror the field there. |
| **14** joint verification | The flag-off proofs in §5 and the manual smoke: on a fresh episode with both flags ON, "generate all" must leave shots 2+ of a scene carrying a `sceneAnchor`, and shot 2's render payload must contain shot 1's URL. |
| **08** skills | `formatSceneContinuityVisionLabel`'s literal is what the start-frame skill's "an attached image may be the previous frame of this same scene" guidance refers to. Keep the two in sync or the guidance is unwired. |
