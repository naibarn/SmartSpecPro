<!-- section-04-motion-profile-module -->

# Section 04 — Pure module: `motionProfile.ts`

## Current-worktree override (binding)

Add `VdMotionContractStatus = "emitted" | "missing" | "invalid"`. A missing or
malformed profile returns no profile and no effective risk; it is never coerced to
safe enum defaults or interpreted as low-risk. Export parsing needed to distinguish
missing from invalid output without parsing free prose.

## Implementation record (2026-08-01)

- Added the zero-import, client-safe `motionProfile.ts` module and 28 focused
  tests.
- The binding override supersedes the older fallback table below: only a
  complete, valid declaration receives `status: "emitted"`, a profile, and an
  effective risk. Absent output is `missing`; present malformed output is
  `invalid`; neither receives guessed enum defaults or risk.
- `parseMotionProfile` preserves missing-vs-invalid telemetry, while
  `resolveMotionProfile` remains the compatibility convenience returning only
  a valid profile.
- Known enum spellings are normalized across case, whitespace, and hyphens;
  unknown enums remain invalid. Snake-case wire data and camelCase persisted
  data both parse and round-trip.
- Risk derivation reads closed categorical facts only and can raise, never
  lower, the skill-declared risk.
- Focused tests (28/28) and the full TypeScript check pass.
- Review was performed inline because the active repository policy did not
  authorize sub-agent delegation for this run.

**Section id:** `section-04-motion-profile-module`
**Feature:** VD P1 — Identity Stability (Feature 137)
**Depends on:** `section-01-prereq-baseplan-fix` (must be green first — nothing else)
**Blocks:** `section-06-motion-profile-contract`
**Parallel with:** `section-02-feature-flags`, `section-03-model-prompt-budget`, `section-05-scene-continuity-module`
**Flag:** none — this module is flag-agnostic. It is pure code with no call sites until section-06 wires it under `verticalDramaMotionContracts`.

---

## 1. What this section delivers

One new pure TypeScript module plus its unit suite:

| Path | Action |
|---|---|
| `apps/web/shared/verticalDramaSeries/motionProfile.ts` | **create** |
| `apps/web/shared/verticalDramaSeries/__tests__/motionProfile.test.ts` | **create** |

Nothing else. No runner, router, skill, schema, or database change belongs to this
section. Because there are zero call sites when this section lands, the flag-off
byte-identity requirement that dominates the rest of the plan is satisfied
trivially here — but only if the "no call sites" rule is respected.

---

## 2. Background an implementer needs

### 2.1 The problem this module is half of

Vertical Drama renders each shot as a **start frame** image, then animates that
still with an image-to-video model. When the clip's motion turns a character's
head, the video model must invent the side of the face the start frame never
showed — and it invents a *different person*. That is identity drift.

The fix (Feature 137 P1) has two halves:

- **The skill half** — the per-shot video-prompt skill *declares*, in closed
  categorical vocabulary, how each face was observable in the attached start frame
  and how much the shot moves. It then writes a **motion contract** into the video
  prompt that scales with the resulting risk level. (Sections 06 and 08.)
- **The deterministic half — this module.** It takes the skill's raw JSON
  declaration, coerces it into a typed object without ever throwing, and derives a
  **risk floor** from the closed-enum facts alone. The effective risk a downstream
  consumer uses is `max(skill's own judgment, derived floor)`.

### 2.2 Skill-first split — the design constraint that matters most

Per `memory/feedback_skill_first_authoring`: **this module never judges.** It has
no aesthetic opinion, no prose analysis, no threshold that implies a verdict about
quality. It maxes two declarations and normalizes types. Every creative and
aesthetic rule lives in `skill.md` (section-08).

The proposal that originally motivated Feature 137 specified numeric yaw
thresholds (e.g. "≤15°"). Those were **deliberately replaced by categories**,
because an LLM cannot measure degrees and pseudo-precision creates false
confidence. Do not reintroduce numbers. Numeric thresholds return only if a
computer-vision path is ever added. Record that rationale in the module header so
a future reader does not "improve" it back.

### 2.3 Naming across the LLM boundary

Codebase convention, already followed by `frame_analysis` / `frameAnalysis`:

- Skill JSON contracts use `snake_case` (`motion_profile`, `start_facing`,
  `reveals_hidden_side`).
- TypeScript uses `camelCase` (`motionProfile`, `startFacing`, `revealsHiddenSide`).
- The **resolver is where the two meet**.

### 2.4 The failure class this module must survive

`memory/project_vd_weak_model_json_class`: VD's cost policy routes some
generations to the cheapest capable model, and those models return sloppy enums
and malformed shapes. The fix is always made at the **extraction layer**, never by
switching models. That is exactly what `resolveMotionProfile` is. It must never
throw, for any input, ever.

### 2.5 House pattern to copy

`apps/web/shared/verticalDramaSeries/audienceAgeRating.ts` — tuple → union → type
guard → lenient `resolveX(unknown)` → (optional) render helper, with a header
comment stating the skill-first split. Runners-up worth skimming:

- `shared/verticalDramaSeries/videoPromptModelFamily.ts` — never-throws resolver,
  exported frozen tuple + labels, dependency-free so both client and server import
  it.
- `shared/verticalDramaSeries/retentionFacts.ts` — the "only counts, never judges,
  never throws, never gates" header this module's header should echo.
- `shared/verticalDramaSeries/presetVisualIdentity.ts` — the LLM-asserted-half +
  deterministic-half framing.

---

## 3. Public API (signatures and docstrings only — no bodies)

```ts
// apps/web/shared/verticalDramaSeries/motionProfile.ts

/** Closed enums the skill must choose from. Frozen sets — adding a member is a
 *  breaking change that also requires the skill contract (section-08) to change. */
export const VD_FACINGS = [
  "frontal", "three_quarter", "profile", "back_of_head", "not_visible",
] as const;
export const VD_TURN_MAGNITUDES = ["none", "subtle", "moderate", "large"] as const;
export const VD_CAMERA_MOTIONS = [
  "locked", "push_in", "pull_back", "small_pan_tilt",
  "small_lateral", "orbit", "large_reframe",
] as const;
export const VD_IDENTITY_RISKS = ["low", "medium", "high"] as const;

export type VdFacing = (typeof VD_FACINGS)[number];
export type VdTurnMagnitude = (typeof VD_TURN_MAGNITUDES)[number];
export type VdCameraMotion = (typeof VD_CAMERA_MOTIONS)[number];
export type VdIdentityRisk = (typeof VD_IDENTITY_RISKS)[number];

export interface VdMotionProfileCharacter {
  /** Free string as received (trimmed, capped). The skill is asked to use a key
   *  from the shot's characterIdentityMap; this module NEVER validates that —
   *  it has no access to the map and does no cross-referencing. */
  name: string;
  /** Grounded in the ATTACHED start frame. */
  startFacing: VdFacing;
  /** Grounded in the shot intent. */
  endFacing: VdFacing;
  turnMagnitude: VdTurnMagnitude;
  /** End pose exposes facial regions the start frame never showed. */
  revealsHiddenSide: boolean;
}

export interface VdMotionProfile {
  characters: VdMotionProfileCharacter[];
  cameraMotion: VdCameraMotion;
  newCharacterEnters: boolean;
  /** The skill's OWN judgment — never overwritten here. */
  identityRisk: VdIdentityRisk;
  riskReasons: string[];
}

/** Narrowing type guards, mirroring `isAudienceAgeRating`. */
export function isVdFacing(value: unknown): value is VdFacing;
export function isVdTurnMagnitude(value: unknown): value is VdTurnMagnitude;
export function isVdCameraMotion(value: unknown): value is VdCameraMotion;
export function isVdIdentityRisk(value: unknown): value is VdIdentityRisk;

/** Lenient coercion of raw skill JSON (or of a previously persisted profile).
 *  Never throws for ANY input. Unknown enum values fall back to the documented
 *  conservative option (§4.1). Returns `undefined` when the input carries no
 *  usable signal at all (§4.2). Accepts snake_case and camelCase keys (§4.3). */
export function resolveMotionProfile(raw: unknown): VdMotionProfile | undefined;

/** Deterministic risk floor derived ONLY from closed-enum facts the skill
 *  asserted (§4.4). Pure; no prose is read. */
export function deriveMotionRiskFloor(profile: VdMotionProfile): VdIdentityRisk;

/** max(profile.identityRisk, deriveMotionRiskFloor(profile)) over
 *  low < medium < high. May only ever RAISE severity, never lower it. */
export function resolveEffectiveIdentityRisk(profile: VdMotionProfile): VdIdentityRisk;
```

`VdMotionProfile`'s fields are all **required**. `resolveMotionProfile` fills every
default, so a consumer branches only on the whole profile being `undefined` —
never on individual sub-fields. That property is what keeps section-06's runner
and section-08's fact lines simple.

---

## 4. Semantics — the exact rules to implement

### 4.1 Coercion / fallback table

Applies when a value is absent, `null`, the wrong type, or a string outside the
closed set **after normalization** (see §4.3).

| Field | Fallback | Rationale (put this in the code comment) |
|---|---|---|
| `startFacing` | `"not_visible"` | Never claim we observed a face we did not. The most protective facing. |
| `endFacing` | `"not_visible"` | Same. |
| `turnMagnitude` | `"moderate"` | Hedges to the **medium** floor. Does not fabricate the high tier. |
| `revealsHiddenSide` | `false` | A **high**-tier trigger — fires only on an explicit assertion. |
| `cameraMotion` | `"small_pan_tilt"` | The most protective value that is not itself a high trigger. Any non-`orbit`/non-`large_reframe` value is floor-equivalent; the rule that matters is "unknown never means orbit". |
| `newCharacterEnters` | `false` | A **high**-tier trigger — explicit assertion only. |
| `identityRisk` | `"medium"` | Do not fabricate `"low"` (under-protects) nor `"high"` (over-restricts → static, lifeless clips). The floor can still raise it. |
| `riskReasons` | `[]` | Prose only; never read by the floor. |

**The governing principle, stated once and testable:** an unreadable field may
push toward *medium*, but **only an explicit skill assertion may produce
`"high"`**. High-tier motion contracts are the expensive ones (over-restriction
produces static clips — see the risk register), so a parse failure must never
trigger one.

**Known consequence to test explicitly:** a well-formed character that simply
omits `turn_magnitude` lands on the medium floor, not low. That is intended — the
skill contract (section-08) makes the field required, so absence means the model
ignored the contract. If the smoke test in section-14 shows this is noisy, the
change is one constant plus one test, fully contained in this module.

**Boolean coercion** (weak-model tolerance): boolean `true`, or the case-insensitive
string `"true"`, coerce to `true`. Everything else — including `1`, `"yes"`,
`"TRUE "` with stray whitespace already trimmed, `null`, absent — coerces to
`false`. Keep the accepted set small, documented, and pinned by a test; do not
grow it speculatively.

**Trim/cap conventions** (mirroring `normalizeFrameAnalysis` in
`server/services/verticalDramaVideoMotionPromptGeneration.ts:1421-1440`, which
trims to 80 chars and caps at 6 people):

- `characters`: entries whose `name` is empty after trimming are **dropped**;
  `name` trimmed and capped at 80 chars; the array capped at **6** entries.
- `riskReasons`: non-array → `[]`; each entry must be a string, trimmed, empties
  dropped, capped at 200 chars, array capped at **6** entries.
- **Preserve input order.** Do not sort and do not dedupe — shot character order
  carries speaking-order meaning elsewhere in VD, and stable order keeps tests and
  persisted values deterministic.

### 4.2 When `resolveMotionProfile` returns `undefined`

Return `undefined` when the input is not a plain object (including `null`,
`undefined`, arrays, strings, numbers), **or** when it carries no usable signal:

```
usable =  coercedCharacters.length > 0
       || hasValue(raw.camera_motion ?? raw.cameraMotion)
       || hasValue(raw.new_character_enters ?? raw.newCharacterEnters)
       || hasValue(raw.identity_risk ?? raw.identityRisk)

hasValue(v) = v !== undefined && v !== null && v !== ""
```

So `{}`, `{ characters: [] }`, `[]`, `"nope"`, `null` → `undefined`; but
`{ characters: [], camera_motion: "orbit" }` → a real profile (the skill *did*
declare something about the camera). This mirrors the runner's established "omit
when there is nothing to say" convention — a useless empty shape must never be
persisted onto a clip.

### 4.3 Key spelling and string normalization

- **Both spellings accepted, snake_case read first**, per key
  (`start_facing ?? startFacing`, etc.). Rationale: the same function must resolve
  fresh skill JSON *and* re-resolve an already-persisted
  `motionPromptPack.clips[].motionProfile` (camelCase) without a second code path.
  There is precedent in this same plan — section-03's
  `resolveModelMaxPromptLength` accepts both `maxPromptLength` and
  `max_prompt_length`.
- **Enum string normalization before membership check:** `trim()` →
  `toLowerCase()` → collapse runs of whitespace and `-` into `_`. This makes
  `"Three Quarter"`, `"three-quarter"` and `"THREE_QUARTER"` all resolve to
  `three_quarter`. Anything still unrecognized takes the §4.1 fallback. Do **not**
  add a hand-written synonym dictionary (`"static"` → `"locked"` and friends) in
  P1: that is unbounded guesswork about model vocabulary, and the fallbacks are
  already safe.

### 4.4 `deriveMotionRiskFloor` — the decision table

Evaluate high first, then medium, else low.

| Tier | Fires when |
|---|---|
| `"high"` | any character with `revealsHiddenSide === true` **or** `turnMagnitude === "large"`; **or** `cameraMotion` ∈ `{ "orbit", "large_reframe" }`; **or** `newCharacterEnters === true` |
| `"medium"` | any character with `turnMagnitude === "moderate"`; **or** any character whose `startFacing` ∈ `{ "profile", "back_of_head", "not_visible" }` **and** whose `turnMagnitude !== "none"` |
| `"low"` | otherwise (includes an empty `characters` array with a locked camera and no entrance) |

Note the medium rule's second clause is only *independently* reachable for
`turnMagnitude === "subtle"` — `moderate` and `large` are already covered. Test it
via the subtle case so the clause is genuinely exercised.

### 4.5 `resolveEffectiveIdentityRisk`

`max` over the severity order `low < medium < high`, taking the skill's own
`identityRisk` and `deriveMotionRiskFloor(profile)`. Implement with a private rank
map (`{ low: 0, medium: 1, high: 2 }`); do not export it unless a later section
needs it.

**Invariant to state in the docstring and pin with a test:** the result is never
lower than `profile.identityRisk`. A conservative skill answer can never be
weakened by code. (This was raised and closed in review round 1, item A9.)

---

## 5. Tests first (TDD)

Write `apps/web/shared/verticalDramaSeries/__tests__/motionProfile.test.ts`
**before** the module. Run it, watch it fail to resolve the import, then implement.

**Runner facts:**
- Always run from `apps/web` — from the repo root vitest globs the monorepo and
  dies on an unreadable directory.
- `shared/**/*.test.ts` is in `vitest.config.ts`'s `include`; environment is
  `node` (jsdom applies only to `client/src/**/*.test.tsx`). No config change.
- **Zero mocks.** This module has no dependencies to mock. If you find yourself
  reaching for `vi.mock`, the module has grown an import it must not have.
- The `vi.clearAllMocks()` / `mockReturnValueOnce` footgun documented elsewhere in
  this plan does not apply here — there are no mocks. Keep it that way.

Command:

```
cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/motionProfile.test.ts
```

### 5.1 Test skeleton (titles are the specification; assertions are yours)

```ts
import { describe, expect, it } from "vitest";
import {
  deriveMotionRiskFloor,
  resolveEffectiveIdentityRisk,
  resolveMotionProfile,
  VD_CAMERA_MOTIONS,
  VD_FACINGS,
  VD_IDENTITY_RISKS,
  VD_TURN_MAGNITUDES,
} from "../motionProfile";

// Small local factory so each test states only the field under test.
// e.g. makeProfile({ cameraMotion: "orbit" }) / makeCharacter({ turnMagnitude: "large" })

describe("deriveMotionRiskFloor", () => {
  it("returns high for any character with revealsHiddenSide");
  it("returns high for turnMagnitude 'large'");
  it("returns high for cameraMotion 'orbit'");
  it("returns high for cameraMotion 'large_reframe'");
  it("returns high when newCharacterEnters is true");
  it("returns medium for turnMagnitude 'moderate'");
  it("returns medium when startFacing is profile and the turn is subtle");
  it("returns medium when startFacing is back_of_head and the turn is subtle");
  it("returns medium when startFacing is not_visible and the turn is subtle");
  it("returns low when a bad startFacing is paired with turnMagnitude 'none'");
  it("returns low for a locked camera, frontal start, no turn, no entrance");
  it("returns low for an empty characters array with a locked camera");
  it("takes the worst character, not the first (mixed low + high roster)");
});

describe("resolveEffectiveIdentityRisk", () => {
  it("never LOWERS the skill's own identityRisk (skill 'high' + floor 'low' => 'high')");
  it("raises to the floor when the floor is higher than the skill's answer");
  it("returns the shared value when skill and floor agree");
});

describe("resolveMotionProfile — leniency", () => {
  it("returns undefined for null, undefined, a string, a number and an array");
  it("returns undefined for {} and for { characters: [] }");
  it("returns a profile when only camera_motion is declared (no characters)");
  it("coerces unknown enum values to the documented conservative fallback, never throws");
  it("normalizes casing/spacing/hyphens before the membership check ('Three Quarter')");
  it("lands on the MEDIUM floor for a character that omits turn_magnitude");
  it("never produces 'high' from unreadable input alone");
  it("coerces reveals_hidden_side: 'true' to true and any other value to false");
  it("defaults identityRisk to 'medium' when the skill's value is unreadable");
  it("drops characters with an empty/missing name and caps the array at 6");
  it("trims and caps name, and trims/drops/caps riskReasons");
  it("preserves character order (no sort, no dedupe)");
  it("accepts camelCase keys so a persisted profile round-trips unchanged");
  it("does not throw for deeply malformed input (characters: 'nope', nested nulls)");
});

describe("frozen enum sets", () => {
  it("VD_FACINGS / VD_TURN_MAGNITUDES / VD_CAMERA_MOTIONS / VD_IDENTITY_RISKS are exactly the documented members");
});
```

### 5.2 Extra assertions worth including

- **Round-trip:** `resolveMotionProfile(resolveMotionProfile(raw))` deep-equals
  `resolveMotionProfile(raw)`. This is the single strongest guard that §4.3's
  dual-spelling rule actually works, and it is what section-06's persistence path
  relies on.
- **Purity:** calling any exported function twice with the same input returns
  deep-equal results, and does not mutate the input object (assert the raw input
  is unchanged after the call).
- **Frozen sets:** plain `toEqual` on the exported tuples, following
  `videoPromptModelFamily.test.ts`'s closing describe. Adding a member later
  breaks this test on purpose — the skill contract in section-08 must move with it.

---

## 6. Implementation guidance

- **Zero imports.** No `zod`, no server modules, no `Date`, no `Math.random`, no
  environment reads. The zod schema over `motion_profile` belongs to the runner
  (section-06); this module is the layer *after* zod's `.passthrough()` lets the
  raw object through.
- **Client-safe.** It must be importable from `client/src` as well as `server/`,
  exactly like `videoPromptModelFamily.ts`.
- **Do not add the module to `shared/verticalDramaSeries/index.ts`.** That barrel
  is partial by design — neither `audienceAgeRating.ts` nor
  `videoPromptModelFamily.ts` is exported from it. Consumers import by direct
  path: `@shared/verticalDramaSeries/motionProfile` (client) or a relative path
  (server).
- **Module header comment is a deliverable, not decoration.** It must state, at
  minimum: (a) which feature and flag this serves
  (`verticalDramaMotionContracts`, Feature 137 P1); (b) the skill-first split —
  this module never judges, only maxes two declarations; (c) why categories
  replaced numeric yaw thresholds; (d) that it never throws and never gates.
- **`pnpm check` must stay clean** for the two new files. There is a large
  pre-existing `tsc` red baseline in this repo; verify you added nothing to it
  rather than expecting a clean global run.
- Use `switch`/lookup maps over long `if` chains for the floor, so the decision
  table in §4.4 reads back out of the code one-to-one.

---

## 7. Non-goals for this section (explicit)

- **No renderer.** Do not add a `renderMotionProfileBlock()` here. Per the plan,
  the runner emits only bare fact lines (exactly as it does today for model-family
  shaping, `- family: ${family}`) and **all wording lives in the skill**
  (section-08). If a deterministic renderer ever becomes necessary it belongs in
  this module, not in the runner — but P1 does not have one.
- **No prose heuristics.** Never inspect free text to infer risk. VD prompts are
  written in Thai *or* English depending on the episode's language setting, so any
  substring check is silently wrong in one of them.
- **No contract/type edits elsewhere.** `VerticalDramaMotionPromptPack["clips"][number]`
  in `shared/verticalDramaSeries/contracts.ts` gains its `motionProfile` field in
  **section-06**, next to the existing `frameAnalysis` declaration. Do not touch it
  here.
- **No call sites.** No import of this module from the runner, router, or client
  in this section. If a section-04 diff touches
  `server/services/verticalDramaVideoMotionPromptGeneration.ts` or
  `server/routers/verticalDramaEpisodes.ts`, the section has overreached.
- **No feature-flag usage.** The flag gate is applied by consumers (section-06),
  not by this module.

---

## 8. Downstream contract (reference only — implemented in section 06)

Recorded here so the API shape is designed for its real consumers; do **not**
implement any of it in this section.

- Section-06 extends `shotVideoPromptOutputSchema` (runner `:1133-1205`) with a
  lenient `motion_profile` object, adds the REQUEST line beside the existing
  `frame_analysis` request (runner `:1328-1330`) as a ternary returning `null`
  when the flag is off, then pipes the raw value through `resolveMotionProfile`,
  computes `resolveEffectiveIdentityRisk`, and exposes `motionProfile` +
  `effectiveRisk` on both result objects (runner `:1808` and the speaker-switch
  twin `:2474`).
- Section-06 persists to `motionPromptPack.clips[].motionProfile` in **all three**
  fresh object literals (router `:14688-14701`, `:14727-14740`, `:6799`) — a field
  not named in those literals is dropped with no error and no type error.
- The bulk projector `projectMotionPromptPack` (runner `:387-466`) deliberately
  does **not** carry it, because the bulk skill has no attached start frame to
  ground `start_facing`.
- Section-06/§4.5 carries `effectiveRisk` plus a compact per-character
  observability summary into `VdVideoPromptCandidateFactSheet` (runner
  `:3037-3047`) so the judge is *shown* what it is asked to score.
- Clips persisted before this change have no `motionProfile` key; every consumer
  treats it as optional. `resolveMotionProfile(undefined) === undefined` is what
  makes that back-compat free.

---

## 9. Done when

1. `apps/web/shared/verticalDramaSeries/motionProfile.ts` exists with exactly the
   §3 surface, zero imports, and the §6 header comment.
2. `apps/web/shared/verticalDramaSeries/__tests__/motionProfile.test.ts` is green,
   covering every §5.1 title plus the §5.2 round-trip and purity assertions.
3. `cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/motionProfile.test.ts`
   passes with zero mocks.
4. Gate A (the seven video-prompt suites captured in section-01) is still
   **266/266** — unchanged, since this section adds no call sites.
5. Gate B's fail-set is byte-identical to the section-01 baseline — no new
   entries, none removed.
6. `pnpm check` adds no new TypeScript errors attributable to these two files.
7. `git diff --name-only` for this section lists exactly those two new files.
