<!-- SECTION: section-11-scene-lock-injection -->

# Section 11 — Scene continuity lock injection (four engines)

## Current-worktree override (binding)

Eligible multi-shot batch or lazy generation requires a fresh matching scene state;
planner failure or stale state stops before paid image credits with a retry CTA.
Explicit single-shot generation may proceed unlocked with one bounded warning. This
replaces the historical blanket fail-open contract. Inject after Feature 139's
series register and before shot creative direction. Neighbor attachment/scheduling
is outside this P1a section.

| | |
|---|---|
| **Section id** | `section-11-scene-lock-injection` |
| **Depends on** | `section-03-model-prompt-budget`, `section-10-scene-state-storage-carryover`, and `section-15-series-look-lock`. Transitively: sections 01, 02, 05, and 09. |
| **Blocks** | `section-14-joint-verification` |
| **Parallelizable with** | Nothing. Runs after 03 + 10, before 12. |
| **Feature flag** | `verticalDramaSceneContinuity` (F138 P1), default **false**. Flag off ⇒ every prompt in this section is byte-identical to today **and issues zero additional DB queries**. |
| **Runtime / test command** | typescript-pnpm · `cd apps/web && npx vitest run <file>` (always from `apps/web`; from the repo root vitest globs the monorepo and dies) |
| **Line anchors** | Verified at HEAD `941547ff1`. Sections 01/02/03/10 all edit `server/routers/verticalDramaEpisodes.ts` before this one — **anchor by symbol name, never by line number**. |

---

## 1. Background — what an implementer needs to know

### 1.1 The problem

Vertical Drama renders each shot's **start frame** independently and then animates it.
No shot ever sees another shot's rendered frame, so consecutive shots of one
continuous scene drift: lighting jumps from sunset to midday, the set rearranges,
wardrobe changes, props appear and vanish.

Feature 138 P1 fixes this with "invent once, reuse everywhere":

1. Author **one Scene Visual State** per scene (sections 09 + 10).
2. Render it deterministically into a **scene continuity lock block** and inject
   that block into **every prompt for that scene** — this section.
3. Attach the previous same-scene frame as a visual reference — section 12.

This section is step 2, plus the one skill rule that today actively *causes* the
drift (§6).

### 1.2 Vocabulary (use these exact terms)

| Term | Meaning |
|---|---|
| **Scene** | Shots sharing one `locationKey`. Comes from `storyboard.distinct_locations[]` or a per-shot `startFramePlan.frames[].locationKey` override. |
| **Scene Visual State** | The stored per-scene lock **object** (`VdSceneVisualState`, section 05). |
| **Scene continuity lock block** | The compact **text** rendered from that object and injected into prompts. Always `sceneContinuityLockBlock` in code. |
| **Engine A / B / C / D** | The four prompt builders that must receive the block — see §4. |

### 1.3 The architectural constraint (the single most important fact)

`server/services/verticalDramaStartFrameGeneration.ts` (**SFG**) receives only
`location?: { name, description, hasReferenceImage }` — **no `locationKey`, no
storyboard**. Scene identity is therefore resolvable only in the **router** and the
**pipeline**.

⇒ The router/pipeline resolves the scene, renders the block, and passes a
**pre-rendered string** into SFG and into the video-prompt runner.
**SFG and the runner must never attempt scene resolution.** Any code in those two
files that reads `distinct_locations` or `sceneVisualStates` is a bug in this
section.

### 1.4 Standing product directive — "Lock, don't describe"

Injected text is a **compact constraint list** — light, fixed elements, layout,
staging axis, wardrobe, props. Never scene description, never emotional direction,
never cinematic prose. The prompt-budget headroom won in section 03 exists for
locks, not for longer descriptions. `renderSceneContinuityLockBlock` is deterministic
string assembly precisely so that no LLM optimizer step can paraphrase the lock away.

### 1.5 What earlier sections already gave you — import, do not re-derive

From `apps/web/shared/verticalDramaSeries/sceneContinuity.ts` (section 05, direct
path import — this module is deliberately **not** in the barrel):

```ts
buildSceneShotGroups({ distinctLocations, overridesByShotNumber })  // -> VdSceneShotGroup[]
findSceneShotGroupForShot(groups, shotNumber)                      // -> VdSceneShotGroup | undefined
resolveSceneVisualState(raw)                                       // lenient READ-side coercion
computeSceneMembershipHash(input)                                 // -> string
renderSceneContinuityLockBlock(state, currentMembershipHash)       // -> string | undefined
VD_SCENE_CONTINUITY_LOCK_HEADER                                    // exact first line of every block
type VdSceneVisualState
```

From `apps/web/server/services/modelPromptBudget.ts` (section 03):

```ts
resolveVdImagePromptBudgetForModel({ modelId, configJson })        // -> number
VD_IMAGE_PROMPT_ABSOLUTE_MAX                                       // 20000
```

From `apps/web/server/routers/verticalDramaEpisodes.ts` (section 02):

```ts
resolveVerticalDramaSceneContinuityFlag(tenantId): Promise<boolean>
```

From section 09 — the authoring service `server/services/verticalDramaSceneVisualState.ts`.
Its exported function is expected to be `generateSceneVisualState(...)`.
**Confirm the exact exported name and signature from section 09 before wiring; adapt
at the single call site in §3.1 — never reimplement its inputs, its credit gate, or
its location-image attachment here.**

From section 10 — `startFramePlan.sceneVisualStates?: Record<string, VdSceneVisualState>`
on `VerticalDramaStartFramePlan`, plus the `projectStartFramePlan` carry-through
parameter threaded from `verticalDramaEpisodePipeline.ts`. **Read section 10 for that
parameter's exact name and pass newly-authored states through it — do not invent a
second one and do not write the plan row separately in the batch path.**

---

## 2. Deliverables

### Files to create

| Path | Purpose |
|---|---|
| `apps/web/server/services/verticalDramaSceneContinuityLock.ts` | The resolve-or-author orchestrator shared by the router and the pipeline (§3.1). |
| `apps/web/server/services/__tests__/verticalDramaSceneContinuityLock.test.ts` | Its unit suite. |
| `apps/web/server/services/__tests__/verticalDramaStartFrameGeneration.sceneContinuityLock.test.ts` | Engines A, B, C — pure builders, zero mocks. |
| `apps/web/server/services/__tests__/verticalDramaShotVideoPromptGeneration.sceneContinuityLock.test.ts` | Engine D — both duplicated builders, via the public generators. |
| `apps/web/server/routers/__tests__/verticalDramaEpisodes.sceneContinuityLockInjection.test.ts` | Router wiring + flag-off proof + zero-extra-query proof. |
| `apps/web/server/services/__tests__/verticalDramaEpisodePipeline.sceneContinuityLock.test.ts` | Batch pre-pass: "9 shots / 2 scenes ⇒ exactly 2 authoring calls". |
| `apps/web/server/services/__tests__/verticalDramaStartFrameRenderSkillSceneLock.test.ts` | Real-file skill gate for the §6 clause (twins byte-identical + literal wording). |

### Files to modify

| Path | Change |
|---|---|
| `apps/web/server/services/verticalDramaStartFrameGeneration.ts` | Engine A param + fact line; Engine B param + deterministic append; Engine C per-shot param + episode-level section renderer. |
| `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` | Engine D `shotContext` field + the fact line in **both** builders. |
| `apps/web/server/routers/verticalDramaEpisodes.ts` | Flag resolution + lock resolution + threading at 4 call sites; lazy-authored state merged into the existing row-locked persist. |
| `apps/web/server/services/verticalDramaEpisodePipeline.ts` | Batch pre-pass before `generateStartFrameRenderPlan`; per-shot `sceneContinuityLockBlock` on `storyboardShots[]`. |
| `apps/web/skills/vertical-drama-shot-start-frame-render/skill.md` **and** `SKILL.md` | The same-scene lighting override clause (§6). Twins must stay byte-identical. |

### Files that must NOT be touched here

- `shared/verticalDramaSeries/sceneContinuity.ts` — section 05 owns it. **This
  section adds nothing to it.** (Section 12 does add one additive export,
  `planSceneOrderedBatch`; that is its call, not this section's.)
- `buildSceneVisualStateAuthoringInput` — **this section owns it**, inside
  `verticalDramaSceneContinuityLock.ts`, and must **export** it. Section 13's
  `planSceneVisualState` mutation reuses that export rather than assembling
  authoring inputs a second time. One implementation, two callers.
- `shared/verticalDramaSeries/contracts.ts` — section 10 owns `sceneVisualStates`.
- `skills/vertical-drama-video-motion-prompt-pack`, `vertical-drama-video-prompt-judge`,
  `vertical-drama-storyboard-shotgrid`, `vertical-drama-full-story-architect` —
  **section 08 owns these.** `skills/vertical-drama-shot-video-prompt*/` is edited by
  sections **07 → 06 → 08** in that order (see section 06 §1b item 6); this section
  edits none of them.
  **Hand-off, now owned:** `vertical-drama-storyboard-shotgrid` also carries a
  same-scene-hostile "lighting variety" line (spec 138 §2.3 names it an aggravator).
  It is **section 08's** to fix, and section 08 §7.8 has been updated to do so — this
  section does not touch it.
- `mergeAndTrimReferenceImageUrls` and any reference-image array — section 12.
- `planSceneVisualState` / `updateSceneVisualState` mutations and all UI — section 13.
- `GenerateVerticalDramaClipDialogueParams.shotContext` (RUNNER `:3770`) — a
  **different type** used by `regenerateClipDialogue` (router `:14211`, `:14935`).
  It has a red-baseline suite of its own. Do not add the field there.

---

## 3. Public interfaces (stubs — implement the bodies, keep the docstrings)

### 3.1 New service — `server/services/verticalDramaSceneContinuityLock.ts`

Lives in `server/services/` (not the router) because **both** the router and
`verticalDramaEpisodePipeline.ts` need it, and the pipeline must never import a
router. It is the only place scene resolution, lazy authoring and block rendering
are composed.

```ts
/**
 * Scene continuity lock resolution (F138 P1) — the one place that turns
 * "which shots are in which scene" + "what is that scene's stored visual
 * state" into "the exact lock text this shot's prompt must carry".
 *
 * Composes section 05's pure module (grouping / lenient read / deterministic
 * render) with section 09's authoring service (one LLM call per scene) and
 * section 10's storage shape. It returns structured failures; callers own the
 * binding posture: batch/lazy generation fails closed, while an explicit
 * single-shot action may continue unlocked with one bounded warning.
 */

export interface VdSceneContinuityLockResolution {
  /** shotNumber -> rendered lock block. Shots with no scene, no state, or an
   *  unrenderable state are simply ABSENT. Never contains empty strings. */
  blockByShotNumber: Map<number, string>;
  /** locationKey -> the state that produced the block (existing or fresh). */
  statesByLocationKey: Record<string, VdSceneVisualState>;
  /** Authored during THIS call and NOT yet persisted. The caller persists it
   *  inside its own row-locked transaction (§5.3) — this service never writes. */
  newlyAuthoredByLocationKey: Record<string, VdSceneVisualState>;
  /** Diagnostics for audit and caller posture decisions. */
  diagnostics: {
    sceneCount: number;
    authoredCount: number;
    /** Populated when authoring was attempted and failed; callers decide posture. */
    authoringFailures: Array<{ locationKey: string; reason: string }>;
  };
}

/**
 * Resolve the lock block for a set of shots in ONE pass.
 *
 * `enabled: false` (the tenant flag off) returns an empty resolution
 * IMMEDIATELY — no DB read, no LLM call, no import of the authoring service.
 * That early return is what makes the flag-off byte-identity and
 * zero-extra-query guarantees provable.
 *
 * A stored state is usable only when it is not stale and its code-owned
 * membershipHash equals the current scene membership hash. A mismatch remains
 * provenance only and is never rendered or injected.
 *
 * When `authorIfMissing` is true, a scene with no usable stored state is
 * authored AT MOST ONCE per call (deduped by locationKey), regardless of how
 * many of its shots were requested. Authoring errors are captured in
 * diagnostics, never erased; callers apply the posture above.
 */
export async function resolveSceneContinuityLocks(params: {
  enabled: boolean;
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  /** Raw `episodes.storyboard` jsonb — passed straight to `buildSceneShotGroups`. */
  storyboard: unknown;
  /** The episode's current plan; supplies both the per-shot `locationKey`
   *  overrides and the stored `sceneVisualStates`. */
  startFramePlan: VerticalDramaStartFramePlan | null;
  /** The shots to resolve for. One shot for a per-shot path, 1..9 for a batch. */
  shotNumbers: readonly number[];
  /** Default false. Only the two prompt-AUTHORING paths pass true — see §5.4. */
  authorIfMissing?: boolean;
  /** Canonical shot summaries for the authoring call's grounding, when the
   *  caller already has them (pipeline batch path). Optional. */
  canonicalShotSummaryByShotNumber?: ReadonlyMap<number, string>;
  idempotencyKey?: string;
  traceId?: string;
  /** Forwarded to the authoring service so it can absolutize the location image. */
  publicUrl?: string;
}): Promise<VdSceneContinuityLockResolution>;

/** Single-shot convenience wrapper over `resolveSceneContinuityLocks`. Returns
 *  `undefined` for `block` whenever there is no usable state and preserves the
 *  failure diagnostic so the caller can apply explicit-single-shot posture. */
export async function resolveShotSceneContinuityLock(params: {
  /* …same fields, `shotNumber: number` instead of `shotNumbers`… */
}): Promise<{
  block?: string;
  locationKey?: string;
  newlyAuthored?: VdSceneVisualState;
  failure?: { reason: string };
}>;
```

Implementation notes:

- Overrides map for `buildSceneShotGroups` is built from
  `startFramePlan.frames.map(f => [f.shotNumber, f.locationKey])`.
- Stored states are read through section 10's **`readSceneVisualStatesFromPlan(plan)`**
  — the mandatory single read path, which internally applies section 05's
  `resolveSceneVisualState` per entry and returns `{}` rather than `undefined`.
  Never cast the jsonb directly and never call `resolveSceneVisualState` on the
  whole record yourself: one read path means one leniency rule.
- Compute the current code-owned membership hash and render with
  **`renderSceneContinuityLockBlock(state, currentMembershipHash)`**. A stale or
  mismatched state is never injected; `undefined`/empty results are dropped,
  never stored as `""`.
- The authoring service is **lazily imported** inside the `authorIfMissing` branch
  (`await import("./verticalDramaSceneVisualState")`), matching the repo's
  lazy-import convention and keeping the flag-off path free of its transitive deps.
- Idempotency-key suffix convention: `` `${idempotencyKey}:scene-visual-state:${locationKey}` ``.
- Never mutates `startFramePlan`.
- **Emits the `vd_scene_state_planned` audit event after each authoring call**
  (spec 138 §21, REQUIRED). Fields: `{ locationKey, memberShotCount,
  coverageGapCount, timeJumpSuspected, usedVision, ms, outcome: "authored" |
  "failed" }`, on the request's `traceId`, via the repo's existing audit-JSONL
  helper. Emit nothing when `enabled: false` (the early return happens first), so
  the flag-off audit stream is byte-identical. Without this event, section 14
  §9.3's manual smoke and spec §17's GA gate are both unmeasurable. Test:
  one event per authoring call, zero events when the flag is off, and an
  `outcome: "failed"` event on the captured-failure path.

### 3.2 Engine A — `GenerateStartFrameShotPromptParams` (SFG, beside `location` ≈`:1504`)

```ts
  /**
   * F138 P1 scene continuity lock (planning/vd-p1-identity-scene-continuity
   * §5.4). A PRE-RENDERED block string from
   * `renderSceneContinuityLockBlock` — this service never resolves scenes
   * itself (it has no locationKey and no storyboard). Emitted verbatim as a
   * fact block immediately after the `location:` line. Absent/blank
   * (every caller with the flag off) ⇒ no line at all, byte-identical to
   * before this field existed.
   */
  sceneContinuityLockBlock?: string;
```

### 3.3 Engine B — `buildDeterministicPolicySafeImagePrompt` (SFG ≈`:1336-1353`)

```ts
export function buildDeterministicPolicySafeImagePrompt(params: {
  rewrittenSynopsis: string;
  characterReferenceManifest: GenerateStartFrameShotPromptCharacterManifestEntry[];
  locationReferenceImage?: { url: string; label: string };
  /** F138 P1 — appended DETERMINISTICALLY (this engine has no creative
   *  authoring step to weave it in). Absent ⇒ byte-identical output. */
  sceneContinuityLockBlock?: string;
}): string;
```

### 3.4 Engine C — batch render plan (SFG)

```ts
// GenerateStartFrameRenderPlanParams.storyboardShots[] — beside `location` ≈:478
  /** F138 P1 — this shot's pre-rendered scene continuity lock block. Shots of
   *  one scene carry the IDENTICAL string; the builder dedupes them into one
   *  section (see `buildRenderPlanSceneContinuityLockSection`). Absent ⇒ this
   *  shot contributes nothing, byte-identical. */
  sceneContinuityLockBlock?: string;

/**
 * Render the episode-level SCENE CONTINUITY LOCKS section from the per-shot
 * blocks: dedupe by block TEXT, list each block's shot numbers ascending,
 * order groups by first (lowest) shot number. Returns `null` when no shot
 * carries a block — the `.filter(Boolean)` array then drops the entry
 * entirely. Exported only for direct unit tests (same precedent as
 * `remapCameraSetupForRequiredCharacters`).
 */
export function buildRenderPlanSceneContinuityLockSection(
  storyboardShots: readonly { shotNumber: number; sceneContinuityLockBlock?: string }[],
): string | null;
```

### 3.5 Engine D — video-prompt `shotContext` (RUNNER `:1544-1624`)

```ts
    /**
     * F138 P1 — the same pre-rendered scene continuity lock block the shot's
     * start frame was authored under, so the motion/acting direction cannot
     * contradict the scene's locked lighting, set, wardrobe or props. The
     * ROUTER resolves it; this service only renders the fact line. Absent
     * (every caller with the flag off) ⇒ byte-identical prompt in BOTH
     * builders. NOT gated on `attachShotImage` — the lock is text, not an
     * image fact.
     */
    sceneContinuityLockBlock?: string;
```

`GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams` **extends**
`GenerateVerticalDramaShotVideoPromptParams` (`:2426-2427`), so one field
declaration covers both types — but **both builders must emit the line
independently**; they are duplicated code, not shared.

---

## 4. Behavioral specification — engine by engine

Every rule below has the same shape: **absent ⇒ nothing emitted anywhere ⇒
byte-identical**. That is the tested bar in all four engines.

### 4.1 Engine A — `cinematic_narrative` + legacy + reference-frame mode

- Builder: `buildStartFrameShotPromptUserPrompt` (SFG ≈`:1605-1787`), a
  `.filter(Boolean)` array of fact lines.
- **Position:** a new conditional entry **immediately after the `location:` entry**
  (currently ≈`:1715-1721`) and **before** the `speaking_order:` entry.
- **Content:** the block **verbatim**, no wrapper prose, no re-labelling. Precedent:
  `characterIdentityMapBlock ?? null` is pushed verbatim in the same array.
- **Guard:** `params.sceneContinuityLockBlock?.trim() ? params.sceneContinuityLockBlock.trim() : null`.
  A blank/whitespace-only string must behave exactly like `undefined`.
- **Applies to every mode** that uses this builder — mode 2, legacy, and
  `referenceFrameMode: true`. It does **not** apply to `policy_safe_rewrite`, which
  never calls this builder (branch at SFG `:1995`).
- **Byte-identity proof:** `expect(withBlock.replace(`${block}\n`, "")).toBe(without)`.

### 4.2 Engine B — `policy_safe_rewrite`

This engine does not use the Engine A builder at all. Its final prompt is assembled
deterministically in `buildDeterministicPolicySafeImagePrompt`.

- **Position:** between the `REFERENCE MAPPING: …` line and the synopsis, so all
  machine constraints are grouped ahead of the story text:

  ```
  REFERENCE MAPPING: Image 1 = Aria; Image 2 = location: café.
  <lock block>
  <rewritten synopsis>
  ```

- **All four combinations must be pinned by tests:** (mapping, lock),
  (mapping, no lock), (no mapping, lock), (no mapping, no lock). With no mapping and
  a lock, the output is `` `${block}\n${synopsis}` ``.
- **This is the only engine where code appends the lock to the FINAL image prompt.**
  That asymmetry is deliberate — see §9 D3.
- **No conflict with the policy-safe LLM rule** ("do not add or infer blocking,
  expressions, clothing, lighting, camera, weather, props, or events", SFG `:1329`):
  that rule constrains the **LLM**; the lock is appended by code **after** the LLM
  step and never passes through `validatePolicySafeSynopsisRewrite`.
- **Budget interaction (why section 03 blocks this section).** The post-assembly
  check at SFG ≈`:2040-2045` **throws `VdSchemaValidationError`** instead of trimming.
  After section 03 it measures against `params.imagePromptMaxChars ?? VD_IMAGE_PROMPT_MAX`.
  Requirements here:
  1. **Keep the throw.** Do not convert it to truncation and do not silently drop the
     lock to stay under budget.
  2. The router must pass the **same** `imagePromptMaxChars` section 03 already wires
     at the `generateShotStartFramePrompt` cap site, so the throw and the QC cap agree.
     Import `resolveVdImagePromptBudgetForModel`; never re-derive a budget.
  3. **Observability:** when the throw fires and a lock block was present, the error
     detail object must carry `sceneContinuityLockChars: block.length` alongside the
     existing `length`, so the audit log shows the lock's contribution instead of
     leaving a reviewer guessing.

### 4.3 Engine C — the 9-shot batch render plan

- Builder: `buildStartFrameRenderPlanUserPrompt` (SFG `:641-747`).
- **Position:** a new entry in the top-level `.filter(Boolean)` array **immediately
  after** the `Storyboard shots (…)` entry and **before** `characterIdentityMapBlock`.
- **Shape (pin this literal):**

  ```
  SCENE CONTINUITY LOCKS (one block per scene; each applies to the shots listed with it):
  Shots 1, 2, 3:
  <block>

  Shots 4, 5:
  <block>
  ```

  Groups separated by exactly one blank line, no trailing newline. Shot numbers
  ascending, comma-space separated. Groups ordered by lowest member shot number.
- **Dedupe by block text**, not by locationKey — the params carry no key, two scenes
  with identical locks are harmlessly merged, and the TDD requirement "shots of the
  same scene receive the SAME lock text" becomes structurally impossible to violate.
- **Why episode-level rather than a per-shot `| suffix`:** a block is multi-line and
  would have to be flattened and repeated on up to 9 shot lines (~3.6 KB of prompt).
  The parameter still lives on `storyboardShots[]` exactly as the plan specifies —
  only the *rendering* is deduped. Record this as deviation D1 (§9).
- **The code emits only the structural label and the facts.** The rule about what to
  *do* with the locks lives in the skill (§6) — this is the same skill-first split the
  2026-07-11 cleanup enforced when a code-authored instruction sentence was removed
  from this exact builder.

### 4.4 Engine D — video-prompt `shotContext` (two duplicated builders)

- Builders: `buildShotVideoPromptUserPrompt` (RUNNER `:1822-2002`) **and**
  `buildSpeakerSwitchUserPrompt` (RUNNER `:2489-2658`). Both are module-private.
- **Position in both:** immediately after the environment/location-reference-image
  fact line (`:1945-1947` and `:2593-2595`), before the additional-images fact.
  That places the lock after the "TRUST THE ATTACHED IMAGE" line, so the image
  remains the source of truth for blocking while the lock pins scene state.
- **Content: the block wrapped in a REFERENCE-ONLY preamble** — spec 138 §7.4
  requires it be rendered "as a grounding block, sibling of `episodePlanContext` —
  reference-only, 'ห้ามคัดลอกลง output' wording reused". Reuse the exact preamble the
  runner already emits for `episodePlanContext` (RUNNER `:709-732`), then the block
  verbatim; `null` when absent/blank. **This is not decoration:** the video prompt is
  hard-capped at `VD_VIDEO_PROMPT_MAX = 2000`, and a model that copies the lock's
  fixed-element and wardrobe lines into `prompt` eats a large share of that cap —
  exactly the failure the shipped `episodePlanContext` wording exists to prevent.
  Two extra tests: the preamble appears exactly once, and the byte-identity removal
  transform removes preamble + block together.
- **Not gated on `attachShotImage`** — unlike the location fact beside it, the lock is
  text and applies even when no image is attached.
- **Gate A is zero-tolerance (266/266).** Any change to these two builders must be
  provably inert when the field is absent: assert the captured user-prompt string is
  byte-identical to the no-field baseline in both builders.

---

## 5. Wiring — routers and pipeline

### 5.1 Flag resolution

Resolve **once per request**, in the router handler, via
`resolveVerticalDramaSceneContinuityFlag(tenantId)` (section 02). Thread the boolean
into `resolveSceneContinuityLocks({ enabled })`. Services never read tenant flags.

For the pipeline's batch stage (no router hop), use the file's existing lazy-import
fail-closed convention:
`const enabled = await import("../routers/…").…` is **forbidden** (pipeline must not
import a router) — instead read the flag through
`await import("./tenantFeatureFlagService")` and apply the same
`flags?.verticalDramaSceneContinuity === true` test, wrapped in `.catch(() => false)`.

### 5.2 Call sites

| # | Site (anchor by symbol) | Engine | `authorIfMissing` | Notes |
|---|---|---|---|---|
| 1 | `generateShotStartFramePrompt` → `generateStartFrameShotPrompt({…})` (router ≈`:12920`) | A **or** B (mode-dependent — one param, the service routes it) | **true** | `row.storyboard` and `basePlan` are already in scope. Pass `imagePromptMaxChars` from section 03 at the same time. |
| 2 | `generateShotReferenceFramePrompt` → `generateStartFrameShotPrompt({…})` (router ≈`:13344`) | A (legacy forced by `referenceFrameMode`) | **false** | A supplementary reference frame reuses an existing lock; it never pays to author one. |
| 3 | `generateShotVideoPrompt` → `generateJudgedVerticalDramaShotVideoPrompt({ shotContext: {…} })` (router ≈`:14390`) | D single | **false** | The video path is a read-only consumer of whatever lock exists. |
| 4 | `generateAndPersistSplitShotVideoPrompt` → `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch({ shotContext: {…} })` (router ≈`:6605`, inside the shared helper) | D split | **false** | Same. |
| 5 | `generateRealStartFramePlan` → `generateStartFrameRenderPlan({ storyboardShots })` (pipeline ≈`:2955`) | C | **true** | Batch pre-pass — §5.5. |
| 6 | Pipeline speaker-switch sub-shot generation (`verticalDramaEpisodePipeline.ts` ≈`:1625`) | D split | **false** | **Deferrable — do this LAST.** Drop it under time or risk pressure; the per-shot router path (#4) covers the user-visible case. |

**Not wired, deliberately:** `generateStartFrameImage` (the paid render path). It
renders the **stored** prompt and builds no prompt text, so a lock would change
nothing there while spending credits. A dedicated test asserts it triggers **no**
authoring. Deviation D2 (§9).

**Not wired:** `regenerateClipDialogue` (router `:14211`, `:14935`) — a different
`shotContext` type.

### 5.3 Persisting a lazily-authored state (per-shot path, site 1)

`generateShotStartFramePrompt` already ends with a row-locked persist
(`db.transaction` + `.for("update")` re-read of `startFramePlan`, ≈`:13101-13170`).
Merge the newly authored state into that **same** transaction **using section 10's
`upsertSceneVisualState`** — do not hand-roll the merge:

```ts
const { states, written } = upsertSceneVisualState({
  current: readSceneVisualStatesFromPlan(freshPlan),
  next: authoredState,
  origin: "lazy",
});
```

- **First write wins** is section 10's rule, not this section's: `origin: "lazy"`
  returns `written: false` with `skippedReason: "already_present"` whenever the fresh
  plan already has a state for that `locationKey`. Duplicate LLM work is acceptable;
  duplicate *writes* are not. The transactional `.for("update")` re-read is this
  section's half of that guarantee; the pure merge rule is section 10's.
- Persist only when `written === true`.
- Never touch any other `locationKey`, never touch `frames[]` beyond what the
  existing code already writes, never drop unknown sibling keys of `startFramePlan`.
- When nothing was authored, the spread must be **absent entirely** so the persisted
  object is byte-identical to today (`...(x ? { sceneVisualStates: … } : {})`).

### 5.4 Failure posture (binding override; exhaustive — every row is a test)

| Failure | Behavior |
|---|---|
| LLM call fails / times out / returns unparseable JSON | batch/lazy caller stops before paid image credits with retry CTA; explicit single-shot may continue unlocked with one warning |
| Insufficient credits during authoring | same posture; never charge image credits after a required batch lock failed |
| Rate limiter rejects the authoring call | same posture |
| The shot resolves to no scene | no authoring attempt at all, no lock |
| A stored state is malformed, stale, or has a mismatched membershipHash | never inject it; author when eligible, otherwise apply caller posture |
| A state exists but renders to nothing | no lock line (never a bare header) |
| The flag is off | early return before any DB read or import |

**Only an explicit single-shot action may proceed unlocked. Batch/lazy generation
must not reach paid image generation without a fresh matching lock for every
eligible multi-shot scene.**

### 5.5 Batch pre-pass (site 5) — 2 calls, not 9

In `generateRealStartFramePlan`, immediately after `distinctLocationGroups` /
`locationByShotNumber` are built and **before** `generateStartFrameRenderPlan(...)`:

1. Call `resolveSceneContinuityLocks({ enabled, shotNumbers: <all shots>, authorIfMissing: true, canonicalShotSummaryByShotNumber })` **once**.
2. Set each shot's `sceneContinuityLockBlock` from `blockByShotNumber`.
3. Pass `newlyAuthoredByLocationKey` merged over the episode's existing
   `sceneVisualStates` into section 10's carry-through parameter on
   `generateStartFrameRenderPlan`, so `projectStartFramePlan` persists them as part
   of the plan it is already writing. **Do not issue a separate UPDATE.**

Because scenes are deduped inside the service, 9 shots spanning 2 scenes produce
exactly **2** authoring calls.

---

## 6. The skill clause — same-scene lighting override

`skills/vertical-drama-shot-start-frame-render/skill.md` rule 4 ("Mood lighting +
color", ≈`:125-135`) currently instructs that *"Across the 9 shots the episode's start
frames must show real lighting variety"*. That is correct **between** scenes and is a
verified aggravator of the reported drift **within** a scene.

Append a clause to that rule (do not delete or rewrite the existing variety
guidance). It must:

1. **Condition explicitly on the lock's presence** — quote
   `VD_SCENE_CONTINUITY_LOCK_HEADER` **verbatim** so the condition is machine-checkable
   and a future edit cannot make the override unconditional by accident.
2. State that a locked lighting state **overrides** the variety guidance for the shots
   listed with that lock: one scene shares time of day, sun direction and light quality.
3. State that per-shot emotion is then expressed through **framing, blocking and
   micro-expression**, not through lighting changes.
4. State that lighting variety still applies **between** scenes.
5. Note that every other locked fact (fixed elements, spatial layout, staging axis,
   wardrobe, active props) is equally fixed for those shots.

Then:

- Copy the edited `skill.md` to `SKILL.md` **byte-for-byte**. The loader reads
  lowercase first; divergent twins are a known recurring failure mode in this repo.
- Do **not** touch `references/`, `schemas/`, `fixtures/` or `examples/` — this clause
  adds no output field, so no contract changes.
- With the flag off the block never appears, the condition never fires, and the rule
  behaves exactly as today. That is the clause's flag-off argument.

**Engine A's and Engine D's skills are deliberately not edited.** A grep confirms
only `vertical-drama-shot-start-frame-render` and `vertical-drama-storyboard-shotgrid`
(section 08's file) carry a contradicting lighting-variety rule; the other skills have
nothing to override, and the block's own header is self-imperative. If section 14's
real-LLM gate shows mode 2 dropping the lock from its authored prose, adding the same
clause to `vertical-drama-cinematic-narrative-image-prompt` is the follow-up — record
it in the handoff, do not pre-emptively expand scope here.

---

## 7. Tests first (TDD)

Write each suite and watch it fail for the right reason before touching source.

### 7.1 Conventions (fixed by the repo — do not invent new ones)

- Vitest 2.1.9, **always from `apps/web`**. Environment `node`.
- **Mock hygiene:** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce`
  queues — only `mockReset()` does. Any `beforeEach` queueing `…Once` values must
  `mockReset()` first, or one early throw poisons the rest of the file.
- Never pipe a vitest run through `tail` — it truncates the FAIL block.
- Diff Gate B by **fail-set identity**, never by count:
  `--reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`.

### 7.2 `verticalDramaStartFrameGeneration.sceneContinuityLock.test.ts` (Engines A/B/C)

Pure builders, **zero mocks**. Templates: `…referenceFrameMode.test.ts` (byte-identity
idiom) and `…locationGrounding.test.ts` (`baseParams` / `baseShotParams` factories —
copy both).

```
Engine A — buildStartFrameShotPromptUserPrompt
  no lock line at all when sceneContinuityLockBlock is undefined (byte-identical)
  ...and when it is "" / whitespace-only
  emits the block verbatim immediately after the `location:` line
  emits it even when `location` is absent (placed where the location line would be)
  removing the block line reproduces the flag-off prompt EXACTLY
      (withBlock.replace(`${block}\n`, "") === without)
  the emitted text starts with VD_SCENE_CONTINUITY_LOCK_HEADER
  a multi-line block survives intact (no re-wrapping, no re-indenting)

Engine B — buildDeterministicPolicySafeImagePrompt
  unchanged output when no block is provided (mapping present)
  unchanged output when no block is provided (mapping absent)
  block sits between the REFERENCE MAPPING line and the synopsis
  no mapping + block ⇒ `${block}\n${synopsis}`
  the synopsis text itself is untouched (trim semantics unchanged)

Engine B — budget interaction (ties section 03 to section 11)
  a prompt that only exceeds 3800 BECAUSE of the lock is accepted when
      imagePromptMaxChars is 20000
  the same prompt still throws VdSchemaValidationError when the budget is 3800
  the throw's detail carries sceneContinuityLockChars alongside length
  a prompt over 20000 still throws even with imagePromptMaxChars 20000

Engine C — buildRenderPlanSceneContinuityLockSection / buildStartFrameRenderPlanUserPrompt
  returns null (and emits no section) when no shot carries a block
  per-shot lines are byte-identical to today when no shot carries a block
  two shots of ONE scene produce ONE section listing both shot numbers
      ← the TDD requirement "shots of the same scene receive the SAME lock text"
  two scenes produce two groups ordered by lowest shot number
  shot numbers render ascending and deduped
  the section is emitted after the shot list and before the character identity map
  a shot with no block is simply omitted from every group
  deterministic: two calls on the same input produce identical strings
```

### 7.3 `verticalDramaShotVideoPromptGeneration.sceneContinuityLock.test.ts` (Engine D)

Both builders are module-private, so assert on the **captured `userPromptText`**
passed to the mocked LLM executor. Copy the mock header from
`server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts` verbatim
(LLM + credits + rate limiter + `skillFiles` + `fs` + `parseSkillFile`, plus its
`successResponse()` envelope helper). Do **not** export the builders just to make
testing easier; if the mock header proves unworkable, exporting is an acceptable
fallback but then Gate A must be re-run in full and the reason recorded.

```
single-shot builder
  no lock text when shotContext.sceneContinuityLockBlock is absent (byte-identical)
  emits the block immediately after the location-reference-image fact line
  emits it when attachShotImage is false (the lock is NOT image-gated)
  emits it when there is no locationReferenceImage at all
  removing the block reproduces the flag-off prompt exactly

split / speaker-switch builder
  every case above, repeated  ← the builders are duplicated; both must be covered
  the two builders place the block at the same relative position
```

### 7.4 `verticalDramaSceneContinuityLock.test.ts` (the orchestrator)

Mock `./verticalDramaSceneVisualState` (section 09) and `../db`. Template:
`verticalDramaLocationDetector.test.ts`.

```
flag off
  returns an empty resolution, calls NOTHING (no db, no authoring service import)

resolution
  maps each shot of a scene to the SAME rendered block
  a shot with no scene gets no block
  a scene with no stored state and authorIfMissing:false gets no block, authors nothing
  a malformed stored state is coerced leniently; unusable ⇒ no block
  a state that renders to nothing produces no entry (never an empty string)
  per-shot locationKey overrides win over the storyboard grouping
  a legacy storyboard with no distinct_locations resolves nothing and never throws

lazy authoring
  a scene with no state and authorIfMissing:true authors exactly ONCE
  9 shots spanning 2 scenes author exactly 2 states, not 9
  the same scene requested twice in one call authors once (dedupe by locationKey)
  authored states appear in newlyAuthoredByLocationKey and are NOT written to the db
  authoring throw ⇒ no block, no rethrow, diagnostics record the failure
  InsufficientCreditsError during authoring ⇒ captured, nothing charged, no block
  a state with manualEdit:true is never re-authored
```

### 7.5 `verticalDramaEpisodes.sceneContinuityLockInjection.test.ts` (router)

Copy the router scaffolding conventions from
`verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` (mock `../../_core/trpc`
so `.mutation(fn)` returns the raw handler; `selectChain(rows)` / `updateChain()`
thenables; queue one `mockReturnValueOnce` per `db.select()` call site **in order**).

```
flag OFF (the byte-identity + zero-cost bar)
  generateShotStartFramePrompt passes sceneContinuityLockBlock: undefined
  mockDb.select is called EXACTLY as many times as before this section  ← guards the
      Gate B cascade from reshuffling
  no authoring service is imported or called
  generateShotVideoPrompt / generateAndPersistSplitShotVideoPrompt pass undefined

flag ON
  generateShotStartFramePrompt threads the resolved block into the service
  ...and threads section 03's imagePromptMaxChars in the same call
  generateShotReferenceFramePrompt threads the block but NEVER authors one
  generateShotVideoPrompt threads it onto shotContext
  generateAndPersistSplitShotVideoPrompt threads it onto shotContext
  generateStartFrameImage triggers NO authoring (the paid render path is read-only)
  a lazily authored state is merged into the SAME row-locked persist transaction
  a state already present in the FRESH row wins; the freshly authored one is discarded
  unknown sibling keys of startFramePlan still survive the persist
  a shot with no scene produces no lock and no extra query
  explicit single-shot authoring failure returns a successful unlocked prompt plus one warning
```

### 7.6 `verticalDramaEpisodePipeline.sceneContinuityLock.test.ts` (batch)

Template: `verticalDramaEpisodePipeline.distinctLocations.test.ts`.

```
flag off ⇒ every storyboardShots[] entry has no sceneContinuityLockBlock (byte-identical)
flag on ⇒ shots of one scene carry the identical block string
9 shots / 2 scenes ⇒ exactly 2 authoring calls
newly authored states reach projectStartFramePlan via section 10's carry-through param
      (assert on the params passed to generateStartFrameRenderPlan)
an authoring failure stops the batch before `generateStartFrameRenderPlan` and returns a retry CTA
```

### 7.7 `verticalDramaStartFrameRenderSkillSceneLock.test.ts` (real-file gate)

Template: `verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` — it escapes its
own `vi.mock("fs")` via `vi.importActual<typeof import("fs")>("fs")` and **mirrors**
`resolveSkillDirCandidates`'s path formula rather than importing it.

```
skills/vertical-drama-shot-start-frame-render/skill.md and SKILL.md are byte-identical
skill.md contains the same-scene lighting override clause's exact section wording
the clause quotes VD_SCENE_CONTINUITY_LOCK_HEADER verbatim
      ← the condition gate; a future edit cannot make the override unconditional
the ORIGINAL "real lighting variety" guidance is still present (not deleted)
the clause states that variety applies BETWEEN scenes
```

### 7.8 Regression suites that must stay green, run unchanged

```bash
cd apps/web && npx vitest run \
  server/services/__tests__/verticalDramaStartFrameGeneration.locationGrounding.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.referenceFrameMode.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.promptLanguage.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.requiredCharacters.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.test.ts \
  server/services/__tests__/verticalDramaEpisodePipeline.distinctLocations.test.ts \
  --reporter=basic
```

Plus the full **Gate A** 7-file set (must stay 266/266 — Engine D touches two of its
files) and a **Gate B** fail-set diff against the section-01 baseline.

---

## 8. Implementation order

Each step ends green before the next begins. No step edits more than one production
file except where noted.

1. §7.2 Engine A/B/C tests — red.
2. SFG Engine A param + fact line — Engine A green.
3. SFG Engine B param + deterministic append + the `sceneContinuityLockChars` detail —
   Engine B green (including the two budget tests).
4. SFG Engine C param + `buildRenderPlanSceneContinuityLockSection` — Engine C green.
5. §7.3 Engine D tests — red; then RUNNER field + **both** builders — green.
   **Re-run all of Gate A here**, not at the end.
6. §7.4 orchestrator tests — red; then `verticalDramaSceneContinuityLock.ts` — green.
7. §7.5 router tests — red; then router sites 1–4 + the persist merge — green.
   Re-read the router file immediately before editing (sections 01/02/03/10 touched it).
8. §7.6 pipeline test — red; then the batch pre-pass + site 5 — green.
9. §7.7 skill gate test — red; then the §6 clause + the byte-identical `SKILL.md` twin —
   green.
10. Site 6 (pipeline split sub-shot) — **optional, deferrable**.
11. Full sweep: §7.8 + Gate A + Gate B fail-set diff + `pnpm check`.

---

## Implementation record (2026-08-01)

- Implemented the shared resolver/authoring-input helper, membership-hash
  revalidation, lazy state carry-over, router read/write wiring, pipeline batch
  pre-pass, all four prompt-engine inputs, deterministic policy-safe append, the
  `vd_scene_state_planned` audit event, and the same-scene lighting clause in
  both skill twins.
- Focused proof: `verticalDramaSceneContinuityLock.test.ts` (4), start-frame
  image-prompt suite (35), video-prompt suite (94), and distinct-location
  pipeline suite (15) all pass; skill twins are byte-identical and
  `git diff --check` is clean. The touched-file typecheck filter reports no
  diagnostics; the repository still has unrelated baseline type errors.
- The existing large Gate A suites were extended with lock assertions rather
  than duplicating their heavy harnesses into the planned new files. This is a
  test-organization deviation only; the new assertions are isolated and the
  baseline fail-set remains unchanged.
- Site 6 (pipeline speaker-switch sub-shot generation) remains deferred: the
  user-visible router split path is wired, while the pipeline's existing
  speaker-switch path remains a later hand-off.
- Location reference-image lookup is intentionally not reimplemented in the
  resolver; storyboard-provided image URLs are accepted as authoring facts, and
  the existing router/pipeline location-reference paths remain the source of
  truth for paid rendering.

## 9. Deliberate deviations from `claude-plan.md` §5.3–§5.5 (record these in review)

| # | Deviation | Why |
|---|---|---|
| **D1** | Engine C keeps the plan's per-shot `storyboardShots[].sceneContinuityLockBlock` parameter but **renders one deduped episode-level section** instead of a per-shot suffix. | The plan explicitly offers both rendering options. A multi-line block repeated across 9 shot lines is ~3.6 KB of prompt for zero added information, and deduping makes "same scene ⇒ same lock text" structurally guaranteed rather than merely asserted. |
| **D2** | Lazy authoring fires on the **prompt-authoring** paths only, never on the paid render path (`generateStartFrameImage`) or any video-prompt path. The plan's wording was "first start-frame prompt **or render**". | The lock only ever changes prompt text. Authoring at render time cannot alter the already-stored prompt, so it would spend credits for nothing — and the spec's "no new paid generations" pressure argues against it. The video path is a pure consumer. |
| **D3** | Engine B appends the lock to the FINAL image prompt in code; engines A and C hand it to the authoring LLM as a fact for the skill to weave in. | Engine B has no creative authoring step at all (its output is deterministic by design). A and C follow the established VD "NO CODE-SIDE PROMPT APPENDING" convention set by `SERIES VISUAL IDENTITY`. **Known limitation:** an authoring LLM can dilute a fact it was given; the §6 skill clause and section 14's real-LLM gate are the mitigations, and continuity QC in P2 is the durable one. |
| **D4** | A new shared service (`verticalDramaSceneContinuityLock.ts`) instead of a router-private helper. | The pipeline needs the identical logic and must never import a router. One implementation, two callers. |
| **D5** | The `resolveSceneContinuityLocks` service returns newly authored states instead of writing them. | Both callers already own a row-locked write; a second writer would fight them and break first-write-wins. |

---

## 10. Risks and traps

| Risk | Mitigation |
|---|---|
| **Flag-on turns a working policy-safe shot into a `VdSchemaValidationError`** when the lock pushes it past budget. | Section 03 raises the budget to 20000 for the primary model (`gpt-image-2`); the lock is compact (typically a few hundred chars). The throw is kept per the TDD contract, but the error detail now names the lock's size. If a P1 tenant runs a model with no declared `maxPromptLength`, escalate to the conductor rather than silently trimming. |
| **Any extra `db.select` with the flag off reshuffles Gate B's 56-test cascade.** | The `enabled: false` early return happens before any query; a dedicated router test pins the exact `mockDb.select` call count. |
| **Gate A (266/266) regression from the two Engine D builders.** | Both builders' new entry is `null` when the field is absent; byte-identity is asserted in both, and Gate A is re-run at step 5 rather than at the end. |
| **Editing only one of the skill twins.** | The loader reads lowercase `skill.md` first; §7.7 asserts byte-equality of both files. |
| **Concurrent edits to `verticalDramaEpisodes.ts`** (13k lines; this repo has reverted concurrent working-tree edits before). | Re-read immediately before each edit, write in one contiguous pass per call site, then grep for every new symbol to confirm it survived. |
| **Two sections editing the same skill folder.** | Section 08 owns every video-prompt/storyboard/architect skill; section 11 owns only `vertical-drama-shot-start-frame-render`. Verify with `git status` before committing. |
| **Guessing section 09's or section 10's exported names.** | Both are hard dependencies that land first. Read their section files and the shipped code; adapt at the call site; never reimplement or shadow them. |
| **Blank-string blocks leaking a bare header or an empty line into a prompt.** | Every engine guards on `?.trim()`; `renderSceneContinuityLockBlock` already returns `undefined` rather than a lone header. Tests cover `""` and whitespace-only. |
| **Someone "simplifies" the lock into scene description.** | Section 05's render function is the only producer, and its own suite asserts the full block against a fixture. This section never constructs lock text by hand. |

---

## 11. Done when

- [ ] All four engines accept `sceneContinuityLockBlock` and emit nothing when it is
      absent or blank — proven by a byte-identity assertion per engine (five builders
      total: A, B, C, D-single, D-split).
- [ ] `buildRenderPlanSceneContinuityLockSection` dedupes correctly and shots of one
      scene provably receive the same lock text.
- [ ] `verticalDramaSceneContinuityLock.ts` captures every failure row in §5.4,
      authors at most once per scene per call, and never writes to the DB; batch
      callers fail closed while explicit single-shot callers emit one warning.
- [ ] Router sites 1–4 and pipeline site 5 are wired; `generateStartFrameImage`
      triggers no authoring; site 6 is either wired or explicitly deferred in the PR.
- [ ] A lazily authored state is persisted inside the existing row-locked transaction
      with first-write-wins semantics, and unknown `startFramePlan` keys survive.
- [ ] Section 03's `imagePromptMaxChars` reaches the policy-safe throw from the same
      call site that sets the QC `maxChars`.
- [ ] `vertical-drama-shot-start-frame-render/skill.md` carries the same-scene
      lighting override clause, quotes `VD_SCENE_CONTINUITY_LOCK_HEADER` verbatim,
      keeps the original variety guidance, and `SKILL.md` is byte-identical.
- [ ] With the flag **off**: every touched prompt builder is byte-identical, and the
      router issues the exact same number of `db.select` calls as before.
- [ ] **Gate A is still 266/266.** **Gate B's fail-set is a subset of the section-01
      baseline with zero new entries.**
- [ ] `cd apps/web && pnpm check` introduces no new TypeScript errors attributable to
      the touched files (diff against the pre-existing red baseline; do not read the
      raw count).
- [ ] PR description records deviations D1–D5 and the D3 known limitation.

---

## 12. Handoff to neighboring sections

| Section | Contract |
|---|---|
| **12** neighbor anchoring | Consumes the same `buildSceneShotGroups` results. It attaches images; this section attaches text. The two are independent — do not fold the anchor into the lock block or vice versa. Section 12's prompt-time vision cap (6→7) is unrelated to any budget here. |
| **13** mutations + UI | `planSceneVisualState` / `updateSceneVisualState` write the same `startFramePlan.sceneVisualStates[locationKey]` this section reads. A state with `manualEdit: true` must never be re-authored by lazy authoring — enforced here and re-asserted there. The UI's scene-lock summary should render from the stored **state**, never from the rendered block. |
| **14** joint verification | Owns the flag-off byte-identity proof for all five builders touched here, the Gate A/Gate B diffs, and the first VD real-LLM gate. Add one gate assertion specific to this section: with the flag on, a mode-2 (`cinematic_narrative`) authored prompt must still contain the locked lighting facts — if it does not, the follow-up is to add the §6 clause to `vertical-drama-cinematic-narrative-image-prompt` as well. Also include the manual smoke: two same-scene shots share locked lighting text. |
| **08** motion-contract skills | Informational only: the scene continuity lock header may now appear in the video-prompt user prompt. P1 adds no video-skill rule for it. Do not add one in section 08 without coordinating — it would change Gate A's prompt fixtures. |
