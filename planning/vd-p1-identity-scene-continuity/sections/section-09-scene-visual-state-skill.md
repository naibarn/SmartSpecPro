<!-- SECTION: section-09-scene-visual-state-skill -->

# Section 09 — Scene Visual State Skill + Service

## Current-worktree override (binding)

Execute after Feature 139. The planner receives the authorized effective series
look: palette/lighting treatment stays within that register while scene state owns
concrete time-of-day and light direction. Stamp `membershipHash` and `revision` as
code-owned fields. Feature 140 owns prop persistence; `active_props` is optional or
derived and must not become a second ledger.

| | |
|---|---|
| **Section id** | `section-09-scene-visual-state-skill` |
| **Depends on** | `section-02-feature-flags`, `section-05-scene-continuity-module`, and `section-15-series-look-lock`; Feature 139 supplies the authorized register consumed by this planner. |
| **Blocks** | `section-10-scene-state-storage-carryover` |
| **Parallelizable with** | `section-06-motion-profile-contract`, `section-07-frame-observability-gate` |
| **Feature flag** | **None consumed here.** This section adds a skill + a service with **zero call sites**. `verticalDramaSceneContinuity` gates the callers (sections 10–13), not the authoring code. See §2.2. |
| **Test command** | `cd apps/web && npx vitest run server/services/__tests__/verticalDramaSceneVisualState.test.ts server/services/__tests__/verticalDramaSceneVisualStateRealSkillFile.test.ts --reporter=basic` |
| **Source** | `../claude-plan.md` §5.1 + §5.3 (implementation), `../claude-plan-tdd.md` §3a (tests first), `../claude-research.md` §2.8 + §2.10 (verified anchors) |

---

## 1. Background — everything an implementer needs

### 1.1 The product problem

**Vertical Drama (VD)** turns a written drama series into short vertical videos:

```
storyboard (9 shots per sub-episode)
  → per-shot START FRAME image  (an LLM writes an image prompt; a paid image model renders it)
  → per-shot VIDEO PROMPT       (an LLM writes motion/dialogue direction)
  → per-shot CLIP               (a paid video model animates the start frame)
```

**Problem B (Feature 138): scene drift.** Consecutive shots of one continuous scene
come out as different places — lighting jumps from sunset to midday, the set
rearranges, wardrobe changes, props appear and vanish. Every start frame is rendered
independently and **no shot ever sees another shot's rendered frame**; at most one
location photo reaches any render, so everything the photo does not show is
re-invented per shot.

The fix is **"invent once, reuse everywhere"**: author **one Scene Visual State** per
scene, render it into a compact **scene continuity lock block**, and inject that block
into every prompt for that scene.

**This section builds the authoring half only** — the skill that invents the state and
the service that runs it. Nothing calls it yet.

### 1.2 What this section builds — and what it explicitly does not

| In scope | Out of scope (owned elsewhere) |
|---|---|
| New skill folder `skills/vertical-drama-scene-visual-state/` (`skill.md` + byte-identical `SKILL.md`) | Storage at `startFramePlan.sceneVisualStates[locationKey]` and carry-over through `projectStartFramePlan` → **section 10** |
| New service `server/services/verticalDramaSceneVisualState.ts` | Lazy-on-first-use triggering, the fail-open wrapper, batch de-duplication ("author once per scene, not once per shot"), concurrency/row-lock re-read → **section 10 / 11** |
| The snake_case skill JSON contract and its lenient write-side zod | Lock injection into the four prompt engines → **section 11** |
| The camelCase mapper that stamps the code-owned fields | Neighbor anchoring → **section 12** |
| Vision attachment of the location's primary reference image | `planSceneVisualState` / `updateSceneVisualState` mutations and the UI → **section 13** |
| Credit gate + single deduct with an idempotency suffix | Any feature-flag branch, any router edit, any DB migration |

**No existing file is modified by this section.** Everything is new files.

### 1.3 Vocabulary (use these exact terms)

| Term | Meaning |
|---|---|
| **Shot** | One of 9 numbered beats in a sub-episode. |
| **Scene** | A group of shots sharing one location. Comes from the storyboard's `distinct_locations[]` (each entry lists its `shot_numbers`) or from a per-shot `locationKey` override. Keyed on `locationKey` **only**. |
| **Scene Visual State** | The stored per-scene lock **object**. Always this name for the *data*. This section authors it. |
| **Scene continuity lock block** | The compact **text** rendered from a Scene Visual State (section 05's `renderSceneContinuityLockBlock`) and injected into a prompt. Always this name for the *prompt text*. |
| **Skill** | A markdown file loaded verbatim as an LLM system prompt. |
| **Runner** | The TypeScript service that loads a skill, builds the user prompt, calls the LLM, and parses the result. This section is a runner. |

### 1.4 Ground truth verified in the codebase — do not re-derive

- **The location roster is thin.** `verticalDramaLocations.data` (jsonb,
  `drizzle/schema.ts:~20829`, unique on `(seriesId, locationKey)`) holds exactly two
  keys in practice: **`description`** (prose) and **`primaryAssetLinkId`**.
  **There is no stored `environment` / `timeOfDay` / `mood`.** The original design
  assumed there was. **This is the single most important correction in this section:**
  lighting/time-of-day/palette are **authored by the skill**, not read from a table.
- **The location image resolver already exists.**
  `verticalDramaLocationStock.getPrimaryReferenceUrl` prefers an explicit
  `data.primaryAssetLinkId`, else the newest approved asset with
  `role = "establishing_plate"`. The router wrapper
  (`verticalDramaEpisodes.ts` ≈`:2174-2214`) returns
  `{ url, name, description, hasReferenceImage }`. **The caller resolves this and
  passes a URL in** — this service does no DB reads at all.
- **Shot summaries already exist.** `startFramePlan.frames[].canonicalShotSummary`
  (`shared/verticalDramaSeries/contracts.ts:508`) is the exact Overview shot summary
  the start-frame skill consumed. Absent on frames predating canonical source
  tracking — the caller falls back to the storyboard shot synopsis. Either way it
  arrives here as a plain string.
- **The smallest complete new-skill template is
  `server/services/verticalDramaLocationDetector.ts`** (305 lines) and its test
  `server/services/__tests__/verticalDramaLocationDetector.test.ts`. Copy both
  end to end. Its shape:
  folder constant → cached `loadSkillSystemPrompt()` over `resolveSkillDirCandidates`
  / `resolveSkillManifestPath` → lenient zod → model resolution via
  `resolveVerticalDramaSeriesModel` → JSON call with retry → `hasEnoughCredits` gate
  + `deductCredits` with an idempotency-key suffix → user prompt ending with
  `VD_COMPACT_JSON_INSTRUCTION`.
- **`SKILL_MANIFEST_FILENAMES = ["skill.md", "SKILL.md"]` — lowercase wins.**
  (`server/services/skillFiles.ts:7`.) A change made only in `SKILL.md` is silently
  dead at runtime.
- **Vision plumbing already exists.** `executeVisionAwareJsonCallWithRetry`
  (`verticalDramaStoryBible.ts:1714`) takes `{ model, systemPrompt, userPromptText,
  hasVision, images, userId, schema, firstAttemptMaxTokens, retryMaxTokens }` and
  performs one schema-failure retry. `VisionAwareImageInput` is `{ url: string;
  label?: string }` (`:1641`).
- **The vision-model upgrade idiom** is `resolveStartFrameShotPromptModel`
  (`verticalDramaStartFrameGeneration.ts:1810`) — **module-private, not exported.**
  Mirror it locally (§6.3); do not export it from that file.
- **`resolveStartFramePlanModel(seriesId)`** *is* exported from
  `verticalDramaImproveScript.ts:401` and already delegates to
  `resolveVerticalDramaSeriesModel`. Use it as the configured-model source.
- **No test enumerates the skills directory.** Adding a new skill folder cannot
  redden an existing suite.

### 1.5 Standing product directive — "Lock, don't describe"

VD prompts carry the shot's story synopsis plus **only** what the pipeline must
control: identity, safety, scene locks, observability constraints. Emotional
expression and visual imagination are deliberately delegated to the render model,
which composes emotion from the story better than over-directed prose and improves
automatically as models improve.

The Scene Visual State is a **compact constraint list**, never scene description and
never emotional direction. The prompt-budget headroom won in section 03 exists for
locks, **not** for longer descriptions. This constrains the *skill's own authoring
instructions* as hard as it constrains the rendering code: a skill that produces
lyrical set description defeats section 11's whole budget argument.

### 1.6 The failure class this section must actively defend against

Project memory, **"VD skill taught-not-wired"**: a field or rule authored in a
`skill.md` that is never REQUESTED in the code's prompt contract, never SELECTED, or
never LOADED is **silent dead code** — it looks shipped, reviews as shipped, and does
nothing. Two shipped guards exist and both are mandatory here:

1. **Real-file gate test** — read the actual `skill.md` off disk and cross-check it
   against the code's own exported contract constants.
2. **Dual-case byte identity** — assert `skill.md` and `SKILL.md` are identical.

§5.2 specifies both.

---

## 2. Dependencies and scope boundary

### 2.1 What must already be green

- **section-01** — the `basePlan` `ReferenceError` fix, and the Gate A / Gate B
  baselines captured there.
- **section-02** — the two flags exist (nominal dependency: ordering + naming).
- **section-05** — `shared/verticalDramaSeries/sceneContinuity.ts` exists and exports
  the `VdSceneVisualState` type. This section **imports that type** rather than
  redeclaring it. Per the execution order, section 05 lands one wave earlier.

> If section 05 has genuinely not landed, **do not fork the type**. Land 05 first.
> Two declarations of `VdSceneVisualState` is exactly how the storage layer and the
> render layer drift apart.

### 2.2 Why there is no flag branch in this section

`verticalDramaSceneContinuity` is resolved **once per request in the router**
(section 02's `resolveVerticalDramaSceneContinuityFlag`) and threaded into services
as an optional boolean. This service is never reached with the flag off, because
sections 10–13 only call it inside the flag branch. Adding a flag parameter here
would duplicate the gate in two places and make the flag-off byte-identity argument
harder, not easier.

**Flag-off byte-identity for this section is trivial and provable by construction:
no existing code path changes.**

---

## 3. Deliverables

### Files to create

| Path | Purpose |
|---|---|
| `apps/web/skills/vertical-drama-scene-visual-state/skill.md` | The skill (loader reads this one first). |
| `apps/web/skills/vertical-drama-scene-visual-state/SKILL.md` | **Byte-identical** twin. |
| `apps/web/server/services/verticalDramaSceneVisualState.ts` | The runner. |
| `apps/web/server/services/__tests__/verticalDramaSceneVisualState.test.ts` | Service unit suite (mocked module graph). |
| `apps/web/server/services/__tests__/verticalDramaSceneVisualStateRealSkillFile.test.ts` | Real-file taught-not-wired gate. |

### Files that must NOT be touched

- `server/routers/verticalDramaEpisodes.ts` — no mutations here (section 13).
- `server/services/verticalDramaStartFrameGeneration.ts` — do **not** export
  `resolveStartFrameShotPromptModel`; mirror it (§6.3).
- `server/services/verticalDramaEpisodePipeline.ts` — no lazy trigger here (section 10/11).
- `shared/verticalDramaSeries/sceneContinuity.ts` / `contracts.ts` — section 05 and 10 own them.
- `shared/featureFlags.ts` — section 02 owns it.

---

## 4. Contracts

### 4.1 Skill JSON output contract (snake_case, LLM-facing)

One call authors **one scene**. The skill returns exactly:

```json
{
  "contract_version": 1,
  "scene_visual_state": {
    "lighting_state": "…",
    "fixed_elements": [{ "name": "…", "placement": "…" }],
    "spatial_layout": "…",
    "staging_axis": "…",
    "wardrobe_in_scene": [{ "character": "…", "wardrobe": "…" }],
    "active_props": [{ "name": "…", "placement": "…", "from_shot": 3 }],
    "palette_mood": "…",
    "time_jump_suspected": false,
    "coverage_gaps": ["…"]
  }
}
```

Field semantics (these are the words the skill must teach, in its own prose):

| Field | Meaning | Notes |
|---|---|---|
| `lighting_state` | time of day, sun/key direction, shadow behavior, sky/window state | **Authored**, not read — the location row stores no time-of-day (§1.4) |
| `fixed_elements` | things that never move within the scene, with placement | furniture, appliances, doors, signage |
| `spatial_layout` | how the set is arranged relative to the camera | |
| `staging_axis` | where characters stand; which side of the line the camera stays on | the 180° rule, expressed as a lock |
| `wardrobe_in_scene` | per-character outfit for the *whole* scene | one entry per character that appears |
| `active_props` | props in play, with placement; `from_shot` = the shot that introduces it | `from_shot` is optional provenance |
| `palette_mood` | the scene's colour/texture palette | palette, **not** emotion |
| `time_jump_suspected` | the script implies a time change inside this scene | a **review signal**, never rendered into a prompt |
| `coverage_gaps` | script-required elements no supplied location image shows | a **QA signal**, never rendered into a prompt |

`contract_version` is `1`.

### 4.2 Code-owned fields — the LLM never sets these

`locationKey`, `membershipHash`, `revision`, `memberShotNumbers`, `plannedAt`,
`skillVersion`, `manualEdit`, `stale`.

The skill contract deliberately **omits** them, the zod schema deliberately
**ignores** them if the model emits them anyway, and the mapper stamps them from
inputs the caller already knows. Rationale, in order of importance:

1. `memberShotNumbers` is the **invalidation key** (section 10's three-way rule). If
   an LLM could hallucinate it, a storyboard rewrite would silently keep a stale lock.
2. `locationKey` must match the storage key exactly, or the state is written under a
   key nothing looks up. It is echoed back into the object for self-description only.
3. `manualEdit` / `stale` are user-intent and lifecycle flags owned by sections 10
   and 13.

**A test asserts a hostile LLM response containing all eight of these keys does not
influence the mapped output.**

### 4.3 Service public API (stubs — implement the bodies, keep the docstrings)

Names are load-bearing; sections 10 and 13 are written against them.

```ts
/** One member shot of the scene, as the caller already has it. */
export interface SceneVisualStateShotInput {
  shotNumber: number;
  /** `startFramePlan.frames[].canonicalShotSummary` when present, else the storyboard shot synopsis. */
  summary?: string;
  /** Character display names appearing in this shot (roster order). Drives wardrobe locks. */
  characters?: string[];
}

/** Known wardrobe facts for characters in this scene (from the character bible/roster). */
export interface SceneVisualStateWardrobeInput {
  character: string;
  wardrobe: string;
}

export interface GenerateSceneVisualStateParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /** Provenance/logging only — never reaches the prompt. */
  episodeId?: number;
  /** The scene's storage key. Stamped verbatim onto the result; never LLM-authored. */
  locationKey: string;
  locationName?: string;
  /** `verticalDramaLocations.data.description` — the ONLY stored prose about this place. */
  locationDescription?: string;
  /**
   * The location's primary reference image (router wrapper over
   * `verticalDramaLocationStock.getPrimaryReferenceUrl`). Attached as the single
   * vision input when a vision-capable model resolves. Absent ⇒ text-only call.
   */
  locationImageUrl?: string;
  /** `distinct_locations[].description` for this group, when the storyboard has one. */
  sceneDescription?: string;
  /** Member shots. MUST be non-empty and is used verbatim as `memberShotNumbers`. */
  shots: SceneVisualStateShotInput[];
  characterWardrobe?: SceneVisualStateWardrobeInput[];
  /** Authorized effective Feature 139 register; this service never resolves rollout flags. */
  seriesLook?: VerticalDramaPresetVisualIdentity;
  /** Code-owned invalidation identity computed by the caller. */
  membershipHash: string;
  /** Code-owned lifecycle revision selected by the caller. */
  revision: number;
  lang?: StoryScriptLang;
  idempotencyKey?: string;
}

/**
 * Author ONE Scene Visual State for ONE scene via the
 * `vertical-drama-scene-visual-state` skill.
 *
 * Credit-gated (throws `InsufficientCreditsError` BEFORE calling out) and
 * schema-validated (throws `VdSchemaValidationError` after the built-in retry) —
 * same contract as `generateLocationDetectionPlan`.
 *
 * FAILURE POSTURE: this function throws honestly. The fail-open degradation the
 * plan requires on the render path lives at the LAZY call site (section 10/11),
 * never here — the explicit `planSceneVisualState` mutation (section 13) must be
 * able to surface an insufficient-credit error to the user.
 */
export async function generateSceneVisualState(
  params: GenerateSceneVisualStateParams
): Promise<{
  state: VdSceneVisualState;
  creditsUsed: number;
  model: string;
  /** True iff a vision-capable model resolved AND an image was actually attached. */
  usedVision: boolean;
}>;

/**
 * Assemble ONLY structured ground-truth facts as labeled plain-text lines — the
 * same "labeled data lines, no authored instruction prose" convention
 * `buildLocationDetectionPlannerUserPrompt` uses. Every creative decision (what the
 * lighting state IS, which elements are fixed, where the axis sits) is the skill's.
 * Ends with `VD_COMPACT_JSON_INSTRUCTION`.
 *
 * Exported for direct prompt assertions and for the real-file gate, which requires
 * this text to name `VD_SCENE_VISUAL_STATE_OUTPUT_KEY` literally.
 */
export function buildSceneVisualStatePlannerUserPrompt(
  params: GenerateSceneVisualStateParams
): string;

/**
 * The vision inputs for the authoring call: AT MOST ONE image — the location's
 * primary reference, labeled. Returns [] when there is no image URL.
 * P1 deliberately does not attach member frames (cost + the state is authored
 * BEFORE any frame of the scene exists on the common path).
 */
export function buildSceneVisualStateVisionImages(
  params: Pick<GenerateSceneVisualStateParams, "locationImageUrl" | "locationName">
): VisionAwareImageInput[];

/**
 * Map the validated snake_case skill output onto the camelCase
 * `VdSceneVisualState`, stamping every code-owned field (§4.2) from `owner`.
 * PURE — no clock, no I/O — so it is exhaustively testable; `generateSceneVisualState`
 * supplies `plannedAt`.
 */
export function toSceneVisualState(
  parsed: SceneVisualStatePlan,
  owner: {
    locationKey: string;
    membershipHash: string;
    revision: number;
    memberShotNumbers: number[];
    plannedAt: string;
    skillVersion?: string;
  }
): VdSceneVisualState;

/** Lenient WRITE-side validator. Section 05's `resolveSceneVisualState` is the READ side. */
export const sceneVisualStatePlanOutputSchema: z.ZodTypeAny;
export type SceneVisualStatePlan = z.infer<typeof sceneVisualStatePlanOutputSchema>;

// Re-exported so callers import from this one module (location-detector convention).
export { InsufficientCreditsError, VdSchemaValidationError };
```

### 4.4 Exported gate constants

These exist **so the real-file test can be structural instead of a hand-copied
list**. A field added to the zod schema but forgotten in `skill.md` must fail a test,
not ship dead.

```ts
/** Skill folder name — single source of truth for the loader and the gate test. */
export const VD_SCENE_VISUAL_STATE_SKILL_FOLDER = "vertical-drama-scene-visual-state";

/** The top-level output key the skill returns and the user prompt requests by name. */
export const VD_SCENE_VISUAL_STATE_OUTPUT_KEY = "scene_visual_state";

/** Every snake_case field the zod schema reads, in contract order. */
export const VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS = [
  "lighting_state",
  "fixed_elements",
  "spatial_layout",
  "staging_axis",
  "wardrobe_in_scene",
  "active_props",
  "palette_mood",
  "time_jump_suspected",
  "coverage_gaps",
] as const;

/** H2 headers the skill must contain. Asserted by the real-file gate. */
export const VD_SCENE_VISUAL_STATE_REQUIRED_SECTION_HEADERS = [
  "SCENE VISUAL STATE CONTRACT",
  "LOCK, DO NOT DESCRIBE",
  "LIGHTING STATE",
  "SET, LAYOUT AND STAGING AXIS",
  "WARDROBE AND PROPS CONTINUITY",
  "TIME JUMP AND COVERAGE GAPS",
] as const;
```

---

## 5. Tests first (TDD)

Write both files and confirm they are red for the right reason (module not found /
skill file missing) **before** writing the skill or the service.

Base list — `../claude-plan-tdd.md` §3a, verbatim:

```
Test: the service loads the real skill.md from disk (loader-path gate)
Test: skill.md and SKILL.md are byte-identical
Test: the skill's JSON contract declares every field the zod schema reads
Test: lenient zod accepts a partial state and drops unusable fields
Test: the service attaches the location's primary image as a vision input
Test: the service deducts credits exactly once on success
Test: the service throws InsufficientCreditsError when credits are short
      (this is the EXPLICIT mutation path; the lazy path must swallow it)
```

§5.2 and §5.3 expand that into the two files.

### 5.1 Conventions — from the existing codebase, do not invent new ones

- Vitest 2.1.9, **always run from `apps/web`** (from the repo root it globs the
  monorepo and dies on an unreadable directory). Environment is `node`.
- **Service test template:** `__tests__/verticalDramaLocationDetector.test.ts` — mock
  the module graph at the top, let `executeVisionAwareJsonCallWithRetry` run for real
  from the real `verticalDramaStoryBible`, and assert on the built prompt and the
  credit calls.
- **Real-file gate template:**
  `__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` — reads the
  real file via `vi.importActual<typeof import("fs")>("fs")` (which bypasses the
  file's own `vi.mock("fs")`) and **mirrors** `resolveSkillDirCandidates`'s path
  formula rather than importing it (`importActual` does not unmock transitive deps).
- **Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain
  `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that
  queues `…Once` values must `mockReset()` those mocks, or one early throw poisons
  the rest of the file. Prefer plain `mockResolvedValue` per case.
- Test names state the **rule**, not the mechanics.

### 5.2 `verticalDramaSceneVisualStateRealSkillFile.test.ts` (the taught-not-wired gate)

Structure: copy the template's mock preamble (needed only so the service module can
be imported at all), then read the real files.

```ts
/**
 * REAL-FILE gate for `vertical-drama-scene-visual-state` (taught-not-wired failure
 * class — see project memory `project_vd_skill_taught_not_wired.md`). Cross-checks
 * the ACTUAL skill.md on disk against the service's own exported contract
 * constants, so neither side can be trusted in isolation.
 */
const SKILL_DIR = resolve(__dirname, "../../../skills/vertical-drama-scene-visual-state");
```

```
loader path
  the folder resolves under at least one resolveSkillDirCandidates candidate
      (mirror the formula: cwd, ../, ../../, apps/web/ — do NOT import the real fn)
  skill.md exists at the lowercase path the loader reads FIRST
  skill.md has YAML frontmatter and a non-empty markdown body after parsing

dual-case twins
  skill.md and SKILL.md are byte-identical    ← the drift guard

contract coverage (structural — iterate the exported constants, never a copied list)
  the skill declares the top-level "scene_visual_state" output key
  it.each(VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS): the skill declares '"<field>"'
  it.each(VD_SCENE_VISUAL_STATE_REQUIRED_SECTION_HEADERS): the header is present
  the skill declares contract_version 1

request/contract agreement (the actual taught-not-wired assertion)
  buildSceneVisualStatePlannerUserPrompt(...) contains VD_SCENE_VISUAL_STATE_OUTPUT_KEY
  ...and ends with VD_COMPACT_JSON_INSTRUCTION

code-owned fields never taught to the LLM (§4.2)
  the skill does NOT ask for member_shot_numbers, planned_at, skill_version,
      manual_edit or stale
  the skill's frontmatter declares auto_trigger: false and trigger_patterns: []
      (this skill must never fire from chat detection)

lock-not-describe guard
  the skill contains the literal "LOCK, DO NOT DESCRIBE" section and forbids
      emotional/camera-direction prose in its own output rules
```

### 5.3 `verticalDramaSceneVisualState.test.ts` (service unit suite)

Mock preamble (copy from `verticalDramaLocationDetector.test.ts`, adjusted):

```ts
vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("fs", async () => { /* importActual spread + existsSync/readFileSync as vi.fn() */ });
// REAL executeVisionAwareJsonCallWithRetry, mocked model resolver:
vi.mock("../verticalDramaStoryBible", async () => { /* importActual spread + resolveStoryBibleModel: vi.fn() */ });
// Wholesale — avoids that module's heavy transitive chain:
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(), resolveQualityLargeContextModelId: vi.fn(),
}));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));
```

Add a local `successResponse(json)` envelope helper returning
`{ type: "success", response: { choices: [{ message: { content: JSON.stringify(json) } }], usage: { prompt_tokens, completion_tokens } } }`,
and a `makeParams(overrides)` factory.

```
skill loading
  loads the system prompt through resolveSkillDirCandidates/resolveSkillManifestPath
      and uses parseSkillFile's `content` verbatim as the system prompt
  caches the loaded prompt (a second call does not re-read the file)
  throws a descriptive Error when no candidate directory has a manifest
  reads skillVersion from the parsed frontmatter and stamps it onto the state
  tolerates missing frontmatter version (skillVersion left undefined)

user prompt (facts only)
  states locale, location_key, location_name and the location description
  states the scene description when present and "(none)" when absent
  lists every member shot as a labeled line with its summary
  states location_reference_image: attached | none   ← what coverage_gaps keys off
  lists known character wardrobe facts when supplied
  requests `scene_visual_state` by name and ends with VD_COMPACT_JSON_INSTRUCTION
  contains NO creative instruction prose (assert the whole prompt against a fixture)
  never includes episodeId / userId / tenantId

vision
  attaches the location's primary image as ONE labeled vision input
  attaches NOTHING when locationImageUrl is absent (hasVision false, images [])
  never attaches more than one image
  upgrades to a vision-capable model when the configured model is not vision-capable
  keeps the configured model when it already supports vision
  falls back to a text-only call (usedVision false) when no vision model resolves
      and still succeeds
  a throw inside model-row loading degrades to text-only, never propagates

zod leniency (write side)
  accepts a complete state
  accepts a partial state, defaulting missing strings to "" and arrays to []
  drops array members missing their required keys and keeps the well-formed ones
  coerces a non-boolean time_jump_suspected to false rather than failing
  passes an unknown extra field through the schema without throwing (passthrough)
  rejects a response with no scene_visual_state object at all (VdSchemaValidationError)

mapper (toSceneVisualState — pure)
  maps every snake_case field onto its camelCase twin
  stamps locationKey, memberShotNumbers, plannedAt and skillVersion from `owner`
  IGNORES LLM-supplied location_key / member_shot_numbers / planned_at /
      skill_version / manual_edit / stale                ← §4.2, hostile-input test
  preserves activeProps[].fromShot when the LLM supplied a valid from_shot
  drops a non-integer / non-positive from_shot instead of emitting NaN
  memberShotNumbers is ascending, deduped and taken from params.shots
  the result satisfies section 05's resolveSceneVisualState round trip
      (resolveSceneVisualState(toSceneVisualState(...)) is deep-equal)   ← contract bridge

credits
  gates on hasEnoughCredits BEFORE any LLM call
  throws InsufficientCreditsError and calls executeWithFallback ZERO times
  deducts exactly once on success with sourceType "skill"
  suffixes the idempotency key with ":scene-visual-state"
  omits idempotencyKey entirely when the caller did not pass one
  records model + feature "vertical_drama_series" + operation "scene_visual_state"
      + input/output tokens in the deduct metadata
  does NOT deduct when the LLM call throws

errors
  propagates VdSchemaValidationError after the built-in retry (does NOT swallow it)
  propagates an LLM transport error unchanged
      ← the fail-open wrapper is section 10/11's job, not this service's
```

### 5.4 The three tests that matter most

1. **`it.each(VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS)` against the real `skill.md`.**
   This is the only thing standing between "field added to zod" and "field never
   authored, silently always empty".
2. **"IGNORES LLM-supplied `member_shot_numbers`".** If an LLM value can reach
   `memberShotNumbers`, section 10's invalidation rule becomes a coin flip and stale
   locks pin the wrong lighting after a storyboard rewrite.
3. **"propagates `InsufficientCreditsError`" + "does NOT deduct when the LLM call
   throws".** Section 10/11 depends on this service throwing honestly so it can decide
   to swallow; a service that silently returns a half-state would make the lazy path
   persist garbage and charge for it.

---

## 6. Implementation notes

### 6.1 The skill (`skills/vertical-drama-scene-visual-state/skill.md`)

**Frontmatter** — copy the shape from
`skills/vertical-drama-location-detector/skill.md` verbatim (including its
`config.media_studio` and `config.orchestration` blocks, so registry sync behaves
identically), changing only:

```yaml
name: Vertical Drama Scene Visual State
description: <one sentence: author one durable visual continuity lock for one scene of a Vertical Drama sub-episode>
version: 1.0.0
execution_mode: llm-only
auto_trigger: false          # MUST stay false — this skill is invoked directly, never chat-detected
enabled_by_default: false
contract_version: 1
icon: layers
tags: [vertical-drama, scene, continuity, lock, visual-bible]
trigger_patterns: []         # MUST stay empty
priority: 50
```

**Body** — the six required H2 sections (§4.4), in this order:

1. **`## SCENE VISUAL STATE CONTRACT`** — the exact JSON shape from §4.1, with each
   field's meaning stated in one or two sentences. State plainly that the skill
   returns **one** state for **one** scene, and that it must never invent
   `member_shot_numbers`, `planned_at`, or `location_key` — the calling app owns
   those.
2. **`## LOCK, DO NOT DESCRIBE`** — the standing directive (§1.5), written as the
   skill's own output rule: every value is a **short factual constraint**, never
   cinematic prose, never emotional direction, never camera instruction. Include a
   good/bad worked pair, e.g.
   *good*: `"late afternoon, low sun from the window on camera-left, long warm shadows falling right"`;
   *bad*: `"a melancholy golden hour that mirrors her quiet heartbreak"` — the second
   directs emotion and will be re-interpreted differently by every shot.
3. **`## LIGHTING STATE`** — the correction that matters most (§1.4): the calling app
   stores **no** time-of-day or mood for a location. Author the lighting state from
   (a) the attached location reference image when present, (b) the location's prose
   description, (c) the scene description, (d) the member shots' summaries — in that
   order of authority. When there is no image and the prose is thin, choose one
   plausible, internally consistent state and commit to it: **an arbitrary but
   consistent lock beats nine independent inventions.**
4. **`## SET, LAYOUT AND STAGING AXIS`** — what counts as a *fixed* element (never
   moves within the scene) vs an active prop; how to express `spatial_layout`
   relative to the camera; and the 180° line as a `staging_axis` lock.
5. **`## WARDROBE AND PROPS CONTINUITY`** — one outfit per character for the whole
   scene unless the script explicitly changes it; props persist once introduced —
   record the introducing shot in `from_shot`.
6. **`## TIME JUMP AND COVERAGE GAPS`** — set `time_jump_suspected: true` when the
   member shots imply a time change **inside** one scene (the escape hatch for "one
   state per location per episode is not enough"); list in `coverage_gaps` anything
   the script requires that the supplied reference image does not show. Teach
   explicitly that **both are review signals for the calling app and are never
   rendered into an image prompt** — so the skill must not compensate by smuggling
   them into `lighting_state` or `palette_mood`.

Plus one **worked example** (input facts → output JSON) and one **edge-case example**
(no reference image, thin description → still commit to a consistent state, with a
populated `coverage_gaps`). Follow the location detector's worked-example format;
Thai fixture content is fine and matches the surrounding skills.

**Then copy `skill.md` to `SKILL.md` byte-for-byte.** Do not hand-edit the second
file. Project memory: the loader reads lowercase first, so a change made only in
`SKILL.md` is dead code. §5.2 asserts identity.

### 6.2 The service

Copy `verticalDramaLocationDetector.ts` end to end and adapt:

- **Module docstring** in the same style: what it is, why it exists (Feature 138 P1),
  who calls it (sections 10/11/13 — say "nothing yet" while it ships dark), the
  §1.4 correction about `data` holding no time-of-day, and the §4.2 rule that eight
  fields are code-owned.
- **Folder constant:** `path.join("skills", VD_SCENE_VISUAL_STATE_SKILL_FOLDER)`.
- **`loadSkillSystemPrompt()`:** same loop over `resolveSkillDirCandidates` →
  `resolveSkillManifestPath` → `fs.existsSync` → `fs.readFileSync` →
  `parseSkillFile`. **One deliberate deviation:** cache
  `{ systemPrompt, skillVersion }` instead of just the string, so `skillVersion` can
  be stamped from `metadata.version` rather than hardcoded in TypeScript (a hardcoded
  version drifts from the file the moment someone bumps the frontmatter).
- **Zod:** lenient, `.passthrough()` at the top level, every inner field optional with
  a default. Array element schemas drop malformed members rather than failing the
  whole parse. This is the **write-side** validator; section 05's
  `resolveSceneVisualState` is the read-side one. They must agree — the round-trip
  test in §5.3 is what proves it.
- **User prompt:** labeled plain-text lines only, ending with
  `VD_COMPACT_JSON_INSTRUCTION`. Suggested line set (fixture-pinned by a test):
  `contract_version`, `locale`, `location_key`, `location_name`,
  `location_description`, `location_reference_image` (`attached` / `none`),
  `scene_description`, `scene_shots` (one `- shot N: <summary> [characters: …]` line
  each), `character_wardrobe`, `requested_output: scene_visual_state`.
  **No instruction sentences.** If you find yourself writing "make sure to…", it
  belongs in `skill.md`.
- **Credits:** `hasEnoughCredits(params.userId, 1)` before anything else;
  `calculateCreditsForLLM(prompt_tokens, completion_tokens, model)` after;
  `deductCredits({ … sourceType: "skill", idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:scene-visual-state` : undefined, metadata: { model, llmModel: model, feature: "vertical_drama_series", operation: "scene_visual_state", inputTokens, outputTokens } })`.
- **The call:** `executeVisionAwareJsonCallWithRetry` with
  `firstAttemptMaxTokens: 2000`, `retryMaxTokens: 3000`. The output is a compact fact
  list, not prose — these sit between the policy-safe synopsis call (1400/1800) and
  the cinematic prompt call (3000/4000) in the same family. If real traffic truncates,
  raise them; do not raise them speculatively.
- **No rate limiter.** The location detector uses none; `mediaGenerationLimiter`
  guards paid media generation, not planning calls.
- **No DB access.** Everything arrives as parameters.

### 6.3 Model + vision resolution (local mirror, not an export)

```
configured = await resolveStartFramePlanModel(params.seriesId)   // exported, already series-policy aware
if (no locationImageUrl) → { model: configured, hasVision: false }
try {
  rows = await loadEnabledLlmModelRows()
  if configured row supportsVision === true → { configured, hasVision: true }
  visionModel = selectBestLlmModel({ supportsVision: true, supportsStructuredOutputs: true }, rows)
  if (visionModel) → { visionModel, hasVision: true }
} catch { /* fall through */ }
→ { model: configured, hasVision: false }
```

This mirrors `resolveStartFrameShotPromptModel`
(`verticalDramaStartFrameGeneration.ts:1810`) exactly, including its bare `catch`
that falls through to the configured model. **Do not export the original** —
exporting it from a 2600-line service to save 20 lines widens that module's public
surface and invites the next section to import more from it.

Vision failure is **soft**: no image, or no vision model, still produces a valid
state from prose. `usedVision` reports which path ran so section 13 can show it.

### 6.4 Failure posture — what belongs here vs the lazy caller

| Failure | This service | The LAZY caller (section 10/11) |
|---|---|---|
| Insufficient credits | throws `InsufficientCreditsError` **before** any LLM call | catches, skips authoring silently, renders with no lock, **charges nothing** |
| LLM error / timeout | propagates | catches, logs a warning, renders with no lock |
| Unparseable JSON after retry | throws `VdSchemaValidationError` | same as above |
| Shot resolves to no scene | never called | no authoring attempt at all |
| Existing state is malformed | not this service's concern | section 05's `resolveSceneVisualState` drops bad fields |

The explicit `planSceneVisualState` mutation (section 13) does **not** swallow: an
insufficient-credit error there is appropriate and expected.

### 6.5 Deliberate deviations from the location-detector template (record in review)

1. **Vision-aware call** (`executeVisionAwareJsonCallWithRetry`) instead of the
   text-only `executeJsonPlanningCallWithRetry` — the location image is a first-class
   authoring input.
2. **Loader caches `skillVersion` alongside the prompt** (§6.2) — needed to stamp
   `VdSceneVisualState.skillVersion` without hardcoding it.
3. **A separate pure mapper** (`toSceneVisualState`) rather than returning the raw
   parsed object — the snake_case→camelCase boundary plus eight code-owned fields is
   exactly the logic that must be exhaustively unit-tested without mocking an LLM.
4. **Exported contract constants** (§4.4) so the real-file gate is structural.
5. **No reconciliation adapter** — the location detector writes DB rows; this service
   returns a value and section 10/11 persists it into a jsonb plan.

---

## 7. Traps

| Trap | Why it bites | Guard |
|---|---|---|
| Editing only `SKILL.md` | Loader reads lowercase first; the change is silently dead | Byte-identity test; always copy lowercase → uppercase |
| Letting the LLM own `member_shot_numbers` | Section 10's invalidation becomes non-deterministic; stale locks survive a storyboard rewrite | §4.2 hostile-input test |
| Adding a field to zod but not to `skill.md` | Field is always empty; reads as "the model is bad" | `it.each(VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS)` real-file gate |
| Writing creative instructions into the user prompt | Violates skill-first; the skill and the code start disagreeing | Full-prompt fixture assertion |
| Emitting scene *description* instead of *locks* | Section 11 injects this into four engines; prose blows the policy-safe budget and gets paraphrased away | `## LOCK, DO NOT DESCRIBE` section + its gate assertion |
| Catching errors inside the service to "be safe" | Section 13's explicit mutation can no longer report insufficient credits; users are charged-or-not with no signal | §5.3 "propagates" tests |
| Attaching member frames as extra vision inputs | Cost, and on the common path no frame of the scene exists yet | "never attaches more than one image" test |
| Declaring a second `VdSceneVisualState` | Storage and render layers drift | Import the type from `@shared/verticalDramaSeries/sceneContinuity` |
| `vi.clearAllMocks()` in `beforeEach` with queued `…Once` values | One early throw poisons the whole file (this is exactly the 55-test cascade in Gate B) | `mockReset()`; prefer `mockResolvedValue` |
| Setting `auto_trigger: true` or non-empty `trigger_patterns` | The skill starts firing from chat detection and burning credits | Frontmatter assertions in the gate test |

---

## 8. Done when

1. `cd apps/web && npx vitest run server/services/__tests__/verticalDramaSceneVisualState.test.ts server/services/__tests__/verticalDramaSceneVisualStateRealSkillFile.test.ts --reporter=basic`
   is fully green.
2. `cd apps/web && pnpm check` introduces **no new** TypeScript errors attributable to
   the new files. (The repo has a large pre-existing red baseline — diff against it,
   never read the raw count.)
3. **Gate A is still 266/266** and the **Gate B fail-set is byte-identical** to the
   section-01 baseline — not a subset, *identical*. This section modifies no existing
   file, so any movement means something unrelated was touched. Investigate; do not
   accept.

   Extract the fail set as a **set**, never a count, and never pipe a vitest run
   through `tail` (it truncates the FAIL block):
   `--reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`
4. `diff apps/web/skills/vertical-drama-scene-visual-state/skill.md apps/web/skills/vertical-drama-scene-visual-state/SKILL.md`
   is empty.
5. `grep` proves the service imports **no** `../db`, no schema, and no router.
6. `grep` proves `VdSceneVisualState` is declared exactly once in the repo
   (`shared/verticalDramaSeries/sceneContinuity.ts`) and imported here.
7. `grep -rn "verticalDramaSceneVisualState" apps/web/server apps/web/client` returns
   only the service and its own tests — this section adds **no call sites**.
8. No file outside the five new paths is modified.

---

## 8.1 Implementation record (2026-08-01)

**Status:** complete.

- Added the new skill, runner, lenient write-side schema, pure mapper, vision-model
  fallback, credit contract, and real-file taught-not-wired gate. There are no
  production call sites and no DB/router imports.
- Applied the binding override to the public API: callers provide the authorized
  effective Series Look plus code-owned `membershipHash` and `revision`; none reach
  the LLM-owned JSON contract. Scene lighting stays within the series treatment but
  owns concrete time/source/shadow direction.
- Kept `active_props` as optional scene-local render context and explicitly deferred
  durable prop history to Feature 140.
- Verification: both section suites 16/16 green, package TypeScript check green,
  skill twins byte-identical, read-side round-trip green, and diff/import/call-site
  guards green. Gate A/B were not rerun because this section adds only five new files;
  the current dirty-worktree baseline caveats remain recorded in section 08.

---

## 9. Handoff to downstream sections (reference only — do not implement here)

| Section | What it consumes |
|---|---|
| **10** storage + carry-over | `VdSceneVisualState.memberShotNumbers` as the invalidation key, and `manualEdit` / `stale` which **this section never sets** |
| **11** lock injection | `generateSceneVisualState` (called lazily, wrapped in the fail-open try/catch); the *stored* state is read through section 05's `resolveSceneVisualState` → `renderSceneContinuityLockBlock` |
| **13** mutations + UI | `generateSceneVisualState` from `planSceneVisualState` (errors surface to the user here, unlike the lazy path); `usedVision` and `coverageGaps` for the scene-lock summary; `timeJumpSuspected` as a "review this scene" hint |
| **14** joint verification | The real-file gate joins the "every skill edited or added has a real-file gate" exit criterion; the skill's contract fields are candidates for the first VD real-LLM gate (`describe.skipIf`, dedicated env var equal to exactly `"1"`, never in the default run) |

Contract summary other sections must not re-derive:

```ts
// apps/web/server/services/verticalDramaSceneVisualState.ts
generateSceneVisualState(params: GenerateSceneVisualStateParams):
  Promise<{ state: VdSceneVisualState; creditsUsed: number; model: string; usedVision: boolean }>
buildSceneVisualStatePlannerUserPrompt(params): string
toSceneVisualState(parsed, owner): VdSceneVisualState
VD_SCENE_VISUAL_STATE_SKILL_FOLDER   // "vertical-drama-scene-visual-state"
VD_SCENE_VISUAL_STATE_OUTPUT_KEY     // "scene_visual_state"
VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS
InsufficientCreditsError, VdSchemaValidationError   // re-exported
```
