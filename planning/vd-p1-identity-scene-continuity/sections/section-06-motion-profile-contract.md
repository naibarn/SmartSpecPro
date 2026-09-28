<!-- SECTION: section-06-motion-profile-contract -->

# Section 06 — `motion_profile` contract, parsing, exposure, persistence

## Current-worktree override (binding)

Persist `motionContractStatus` in every per-shot/sub-shot clip branch. Missing or
invalid output is non-compliant in the existing judged loop; if all bounded
candidates lack a valid profile, keep the selected legacy prompt, persist status
only, leave profile/risk absent and emit a bounded event. Do not add retries or pin
the historical two-generation-call count. Bulk output schema stays unchanged.

**Feature:** VD P1 / Feature 137 (identity stability), Step 2.
**Flag:** `verticalDramaMotionContracts` (tenant flag, default `false`).
**Depends on:** section-02 (flag registration + router resolver), section-04 (pure module `shared/verticalDramaSeries/motionProfile.ts`).
**Blocks:** section-08 (motion-contract skill rules + judge dimension).
**Parallel with:** section-07 (frame observability gate) — both edit `buildTargetVideoModelFactBlock` and the same four generator functions, so coordinate merge order (see §11).

All paths are relative to `apps/web/` unless noted. Line anchors were verified at HEAD `941547ff1`; section-01 edits the router, so **locate every anchor by symbol/adjacent literal, not by line number**.

---

## 1. What this section delivers

The authoring LLM is asked to **declare** how much each character's face moves in a shot, that declaration is parsed leniently, a deterministic `effectiveRisk` is derived from it, and both are exposed on the generator results and persisted onto the clip.

This section wires the *data path only*. It does **not** teach the skill how to write a motion contract (section-08), and it does **not** change `frame_analysis` or its request gate (section-07).

Concretely:

| # | Deliverable | Where |
|---|---|---|
| 1 | `motionContractsEnabled?: boolean` param on both per-shot generator param interfaces | RUNNER |
| 2 | Lenient `motion_profile` object on `shotVideoPromptOutputSchema` | RUNNER `:1133-1205` |
| 3 | One conditional REQUEST line in `buildTargetVideoModelFactBlock` | RUNNER `:1312-1335` |
| 4 | `motionProfile` + `effectiveRisk` on both result interfaces and both return literals | RUNNER `:1808` / `:2474`, stamped `:2370` / `:2932` |
| 5 | `motionProfile` on the persisted clip type | `shared/verticalDramaSeries/contracts.ts` next to `frameAnalysis` (`:971-974`) |
| 6 | Persistence in **all three** fresh clip literals | ROUTER `:14688-14701`, `:14727-14740`, `:6785-6805` |
| 7 | Flag resolution + threading in the router (both branches) | ROUTER `generateShotVideoPrompt` + `generateAndPersistSplitShotVideoPrompt` |
| 8 | `motion_profile` JSON-contract declaration + field semantics in the skill (4 files) | `skills/vertical-drama-shot-video-prompt[-subshots]/{skill.md,SKILL.md}` |
| 9 | A code comment recording the deliberate bulk-path omission | RUNNER `projectMotionPromptPack` `:387-466` |

RUNNER = `server/services/verticalDramaVideoMotionPromptGeneration.ts` (3911 lines).
ROUTER = `server/routers/verticalDramaEpisodes.ts` (16778 lines).

---

## 1b. MERGED CONTRACT with section 07 — read this BEFORE writing any code

Sections 06 and 07 are marked parallel and both edit the **same** exported
function, the **same** params interface and the **same** two skill files. Left as
originally written they specified *incompatible* signatures. This block is the
single reconciled contract; it supersedes any conflicting wording later in either
section. It is duplicated verbatim in section 07 §1b — if you change one, change both.

**1. Final `buildTargetVideoModelFactBlock` signature (both sections' fields, one object):**

```ts
export function buildTargetVideoModelFactBlock(params: {
  family: VideoPromptModelFamily;
  modelId: string;
  modelName?: string;
  maxReferenceImages?: number;
  /** section 07 — RENAMED from `hasEstablishedCharacters`; under the flag this is
   *  `refs >= 1`, not `refs >= 2`. Gates the `frame_analysis: REQUIRED` line. */
  frameAnalysisRequested: boolean;
  /** section 07 — flag-gated observability request. Omitted ⇒ byte-identical. */
  frameObservabilityRequested?: boolean;
  /** section 06 — flag-gated motion_profile request. Omitted ⇒ byte-identical. */
  motionContractsEnabled?: boolean;
}): string
```

**2. Fixed line order inside the emitted block** (section 14 §6.2 asserts index
order; neither section may reorder unilaterally):

```
…existing family / model / negative-prompt-support lines…
- frame_analysis: REQUIRED …            ← when frameAnalysisRequested
- frame_observability: REQUIRED …       ← when frameObservabilityRequested  (07)
- motion_profile: REQUIRED …            ← when motionContractsEnabled       (06)
Apply the skill's "MODEL-FAMILY SHAPING" section for this family.
```

**3. `motionContractsEnabled` is declared exactly ONCE** — on
`GenerateVerticalDramaShotVideoPromptParams`. The speaker-switch and both judged
param interfaces already `extend` it, so one declaration reaches all four
generators. Section 06 §7.1's instruction to add it to the speaker-switch
interface as well is **superseded**: do not declare it twice.

**4. Gate A test policy — binding on both sections.** Gate A is the 266/266
zero-tolerance baseline that section 14 §8.2 diffs against. **Neither section adds
test cases to a Gate A file.** Section 07 §4.1–§4.3 must be re-homed into new
files alongside section 06's:

| Content | File |
|---|---|
| 06's request line / schema / result exposure | `server/services/__tests__/verticalDramaShotVideoPromptMotionProfile.test.ts` |
| 07's observability fields, normalizer, gate widening | `server/services/__tests__/verticalDramaFrameObservability.test.ts` (**new**) |
| 07's router gate-widening + db.select count | `server/routers/__tests__/verticalDramaEpisodes.frameObservabilityGate.test.ts` (**new**) |
| both sections' real-file skill assertions | `server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts` |

The **one** permitted Gate A edit is the mechanical param rename inside
`verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts:186-192`
(`hasEstablishedCharacters` → `frameAnalysisRequested`), which changes no
assertion count. Gate A therefore stays exactly **266/266** through both sections.

**5. Merge order.** Land 07 first (it owns the rename and the two-boolean split),
then rebase 06 onto it and add only `motionContractsEnabled` + its line. Re-run
**both** sections' byte-identical proofs after the rebase — each proof removes only
its own line, so a stale one fails loudly rather than silently.

**6. Skill-file serialization.** `skills/vertical-drama-shot-video-prompt/skill.md`
and its `-subshots` twin are edited by 07 (observability fields), then 06
(`motion_profile` contract + section header), then 08 (motion-contract rules). One
section at a time; copy lowercase → `SKILL.md` after each; never edit concurrently.

---

## 2. Dependencies and hand-offs

### Consumed from section-02

```ts
// server/routers/verticalDramaEpisodes.ts (router-local, mirrors
// resolveVerticalDramaRetentionHooksFlag at :3565)
async function resolveVerticalDramaMotionContractsFlag(tenantId: string): Promise<boolean>
```

### Consumed from section-04 — `shared/verticalDramaSeries/motionProfile.ts`

```ts
type VdFacing = "frontal" | "three_quarter" | "profile" | "back_of_head" | "not_visible";
type VdTurnMagnitude = "none" | "subtle" | "moderate" | "large";
type VdCameraMotion = "locked" | "push_in" | "pull_back" | "small_pan_tilt" | "small_lateral" | "orbit" | "large_reframe";
type VdIdentityRisk = "low" | "medium" | "high";
type VdMotionProfileCharacter = { name; startFacing; endFacing; turnMagnitude; revealsHiddenSide };
type VdMotionProfile = { characters; cameraMotion; newCharacterEnters; identityRisk; riskReasons };

function resolveMotionProfile(raw: unknown): VdMotionProfile | undefined;   // never throws
function resolveEffectiveIdentityRisk(profile: VdMotionProfile): VdIdentityRisk;
```

**Two hard requirements on that module that this section depends on — verify before you start:**

1. `resolveMotionProfile` must accept the **snake_case wire shape** (`start_facing`, `end_facing`, `turn_magnitude`, `reveals_hidden_side`, `camera_motion`, `new_character_enters`, `identity_risk`, `risk_reasons`) and return the camelCase `VdMotionProfile`. That is where the LLM boundary is crossed (plan §0.5). If section-04 shipped a camelCase-only resolver, **fix it in section-04** — never add a translation shim in the runner.
2. `resolveMotionProfile` must **bound** its output (≤6 characters, name trimmed to ≤80 chars), the same way `normalizeFrameAnalysis` bounds `frame_analysis`. The runner does not re-normalize. Section-06 has a test that proves the bound holds end-to-end; if it fails, the fix belongs in section-04.

### Handed to section-08

- The exported literal `VD_MOTION_PROFILE_SKILL_SECTION_NAME` (§4) — section-08 must keep the skill's section header on exactly that name.
- `GenerateVerticalDramaShotVideoPromptResult.effectiveRisk` and `.motionProfile` — section-08 reads these to build the judge candidate fact sheet.
- The real-file gate suite created here (§6.1, file B) — section-08 extends the same file with its section-header/rules assertions.

---

## 3. Background an implementer needs

**The pipeline.** For each of the 9 shots in a sub-episode, an LLM (the *runner* + a markdown *skill* used verbatim as the system prompt) writes a video motion prompt from the shot's approved **start frame** image; a paid video model then animates that start frame. Identity drift happens when the clip's motion turns a head and the video model invents the side of the face the start frame never showed.

**Skill-first.** All creative wording lives in `skills/*/skill.md`. TypeScript supplies only *facts* (e.g. `- family: veo`) and assembles the user prompt from an array of conditional lines joined with `\n` after `.filter(Boolean)`. Never write creative prose in TypeScript.

**Naming across the LLM boundary.** Skill JSON contracts are `snake_case`; TypeScript is `camelCase`. The runner's resolver/normalizer is the only place the two meet.

**Flag-off byte-identical.** With `verticalDramaMotionContracts` off, the **TS-built user prompt and the persisted payload must be character-for-character what they are today**. This is enforced by tests using the shipped template in `server/services/__tests__/verticalDramaStartFrameGeneration.referenceFrameMode.test.ts` (absent ⇒ `not.toContain`; explicitly `false` ⇒ `not.toContain`; on ⇒ exact line position; then `expect(withFlag.replace("<line>\n", "")).toBe(without)`).

Note the scope of that rule: **skill.md text changes are unconditional and that is accepted house practice** (see the shipped `## NATIVE AUDIO DIRECTION (conditional — only when the caller states native_audio: true …)` section). The system prompt gains a conditional section; the *activation* is the caller's fact line. Do **not** attempt to gate the skill file itself.

**The whitelist trap (the single most likely way this section silently ships nothing).** There is **no zod schema over the persisted `motionPromptPack`** — it is a plain TypeScript type over a jsonb column, and every persist path builds a **fresh object literal** enumerating each field. A field not named in that literal is dropped with **no error and no type error**. `frameAnalysis` is stamped in exactly three places; `motionProfile` must go beside it in all three.

**Weak-model JSON failure class.** VD deliberately routes cheap models for some series. Every new output field must be optional, string-typed (never a zod enum), and `.passthrough()`, with the enum coercion happening in the lenient resolver — a model returning `"three-quarter"` or `"3/4"` must not fail validation.

---

## 4. Frozen interfaces (other sections depend on these exact literals)

Export from the RUNNER, beside `buildTargetVideoModelFactBlock`:

```ts
/** The literal skill.md section name the motion-profile REQUEST line points at.
 *  Exported so the runner's request text and the real-skill-file gate test can
 *  never drift apart (taught-not-wired guard). Section-08 authors the rules
 *  under this exact header — do not rename. */
export const VD_MOTION_PROFILE_SKILL_SECTION_NAME = "MOTION PROFILE + MOTION CONTRACT";
```

**REQUEST line** (emitted only when the flag is on), placed immediately after the existing `frame_analysis` line and before the trailing `Apply the skill's "MODEL-FAMILY SHAPING" section for this family.` line:

```
- motion_profile: REQUIRED — return the motion_profile output field per the skill's "MOTION PROFILE + MOTION CONTRACT" section, grounding start_facing in the ATTACHED IMAGE and end_facing in the shot beat.
```

**Skill section header** (all four skill files, byte-identical between case twins):

```
## MOTION PROFILE + MOTION CONTRACT — MANDATORY when the caller states `motion_profile: REQUIRED`
```

**Persisted clip shape** (`contracts.ts`, imported from `./motionProfile`):

```ts
motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
```

**Result shape** (both generator result interfaces):

```ts
motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
effectiveRisk?: VdIdentityRisk;   // mirror; always === motionProfile.effectiveRisk, undefined together
```

---

## 5. Files touched

| File | Change |
|---|---|
| `server/services/verticalDramaVideoMotionPromptGeneration.ts` | params, zod, request line, resolver helper, result fields ×2, projector comment |
| `server/routers/verticalDramaEpisodes.ts` | flag resolution, threading ×2 call sites, 3 persist literals |
| `shared/verticalDramaSeries/contracts.ts` | clip type field + doc comment |
| `skills/vertical-drama-shot-video-prompt/skill.md` + `SKILL.md` | JSON contract entry + section header/field semantics |
| `skills/vertical-drama-shot-video-prompt-subshots/skill.md` + `SKILL.md` | same |
| `server/services/verticalDramaEpisodePipeline.ts` | (optional, recommended) one cross-reference comment at `:1708-1719` |

**Not touched (deliberate):** `skills/vertical-drama-video-motion-prompt-pack/skill.md`, `projectMotionPromptPack`'s clip mapping, `pickBetterCandidateByHardFacts`, anything under `frame_analysis`.

---

## 6. Tests first (TDD)

Runner: **always from `apps/web`** (`cd apps/web && npx vitest run <file>`); from the repo root vitest globs the monorepo and dies. Never pipe a vitest run through `tail` — it truncates the FAIL block.

**Put new tests in NEW files.** Gate A (the 7 video-prompt suites) is baselined at **266/266 green with zero tolerance**; adding tests inside those files makes the baseline uninterpretable for section-14.

**Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that queues `…Once` values must `mockReset()` those mocks first, or one early throw poisons the rest of the file.

### 6.1 New test files

| id | Path | Copy its mock header from |
|---|---|---|
| A | `server/services/__tests__/verticalDramaShotVideoPromptMotionProfile.test.ts` | `server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts` (lines 1-115: `llmRouter`, `creditService`, `rateLimiter`, `skillFiles`, `@smartspec/skills`, `fs`, `enabledLlmModels`, `intelligentModelSelector`, `modelRegistry`, `verticalDramaProviderRouting`, `verticalDramaStoryBible`, `verticalDramaImproveScript`, `verticalDramaLlmModelPolicy`) |
| B | `server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts` | `server/services/__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` — reads the real `skill.md` via `vi.importActual("fs")` and **mirrors** the loader's path formula rather than importing it |
| C | `server/routers/__tests__/verticalDramaEpisodes.motionProfilePersistence.test.ts` | `server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts` (mock `../../_core/trpc` so `.mutation(fn)` returns the raw handler; thenable `selectChain(rows)` stubs; `vi.hoisted` `mockGetTenantFeatureFlags` for `../../services/tenantFeatureFlagService`) |

### 6.2 File A — request line, schema, exposure

```
describe("motion_profile REQUEST line (flag-off byte-identical)")
  Test: buildTargetVideoModelFactBlock omits the motion_profile line when
        motionContractsEnabled is OMITTED
  Test: ...omits it when motionContractsEnabled is explicitly false
  Test: ...emits it exactly once, immediately after the frame_analysis line and
        before the trailing "Apply the skill's ..." line, when true
  Test: removing that one line from the flag-on block yields the flag-off block
        byte-for-byte  (withFlag.replace(`${line}\n`, "") === without)
  Test: the emitted line contains VD_MOTION_PROFILE_SKILL_SECTION_NAME
  Test: VD_MOTION_PROFILE_SKILL_SECTION_NAME === "MOTION PROFILE + MOTION CONTRACT"
        (frozen-literal assertion — prevents a rename from silently un-wiring
         the skill gate in file B)
  Test: the request line is independent of hasEstablishedCharacters
        (emitted for a solo shot when the flag is on; never emitted when off)

describe("shotVideoPromptOutputSchema leniency")
  Test: accepts a well-formed motion_profile
  Test: accepts a response with NO motion_profile (parses, field undefined)
  Test: accepts unknown enum strings ("3/4", "slight", "dolly") without throwing
  Test: accepts a motion_profile whose characters[] entries carry extra keys
        (passthrough preserved so the resolver sees the raw sub-fields)

describe("generateVerticalDramaShotVideoPrompt — result exposure")
  Test: with the flag ON and a well-formed motion_profile, the result exposes
        motionProfile (camelCase, snake_case wire keys resolved) AND effectiveRisk
  Test: result.effectiveRisk === result.motionProfile.effectiveRisk
  Test: effectiveRisk is RAISED above the skill's own identity_risk when the
        declared facts warrant it (e.g. skill says "low" + reveals_hidden_side
        true ⇒ "high") — proves resolveEffectiveIdentityRisk is actually applied
  Test: with the flag OFF, a model that VOLUNTEERS motion_profile is ignored —
        result.motionProfile and result.effectiveRisk are both undefined
  Test: with the flag ON and no motion_profile returned, both are undefined and
        nothing throws
  Test: a raw profile with 20 characters is bounded to <=6 on the result
        (bound belongs to section-04's resolver; this test proves it holds
         end-to-end — if it fails, fix motionProfile.ts, not the runner)
  Test: every other field of the result is unchanged vs. the flag-off call
        (prompt/dialogue/negativeMotionPrompt/frameAnalysis/family)

describe("generateVerticalDramaShotVideoPromptSpeakerSwitch — twin path")
  Test: the speaker-switch twin emits the same REQUEST line under the flag
  Test: ...and exposes the same motionProfile + effectiveRisk fields
  Test: ...and stays byte-identical with the flag off

describe("judged wrappers propagate (no dedicated logic)")
  Test: generateJudgedVerticalDramaShotVideoPrompt carries the WINNER's
        motionProfile through the accept path
  Test: ...through the repair-shipped path (repaired candidate's profile wins)
  Test: ...through the judge-unavailable fail-open path (candidate A's profile)
  Test: the judged loop still makes exactly 2 generation calls + 1 judge call

describe("bulk pack path stays out (documented decision)")
  Test: the pack generator's fact block never carries the motion_profile line
        (it passes hasEstablishedCharacters:false and no motionContractsEnabled)
  Test: projectMotionPromptPack does NOT carry motionProfile onto its clips
        (documents the deliberate asymmetry — see §8)
```

### 6.3 File B — real-file skill gate (taught-not-wired guard)

```
Test: skills/vertical-drama-shot-video-prompt/skill.md and SKILL.md are byte-identical
Test: skills/vertical-drama-shot-video-prompt-subshots/skill.md and SKILL.md are byte-identical
Test: the per-shot skill's JSON contract block declares "motion_profile"
Test: ...and declares every sub-field the resolver reads (start_facing, end_facing,
      turn_magnitude, reveals_hidden_side, camera_motion, new_character_enters,
      identity_risk, risk_reasons)
Test: the subshots twin declares the same contract
Test: both skills contain a header line starting with
      `## ${VD_MOTION_PROFILE_SKILL_SECTION_NAME}`
Test: the runner's REQUEST text (from buildTargetVideoModelFactBlock, flag on)
      quotes that same literal section name
      → this pair is the whole point: a field authored in the skill but never
        requested, or requested under a name the skill does not define, is
        silent dead code
```

Mirror the loader's path formula (`path.join("skills", "<folder>")` resolved against the same base the runner uses) rather than importing the loader, per the shipped template.

### 6.4 File C — router persistence (three literals, separately)

```
Test: EXISTING-PACK branch of generateShotVideoPrompt persists
      clips[].motionProfile (flag on, episode already has a motionPromptPack)
Test: MINIMAL-PACK branch persists it (flag on, episode has no pack yet)
Test: the split-shot path (generateAndPersistSplitShotVideoPrompt) persists it
Test: flag OFF ⇒ none of the three literals contain a motionProfile key at all
      (compare the persisted clip object's key set against today's)
Test: flag OFF ⇒ the mutation makes exactly the same number of db.select calls
      as today (no new reads introduced by flag resolution)
Test: back-compat — an existing pack whose clips carry NO motionProfile is read,
      regenerated for a DIFFERENT shot, and the untouched clips survive unchanged
Test: the flag is resolved ONCE per request and threaded (assert
      getTenantFeatureFlags call count, mirroring the retention-hooks convention)
```

---

## 7. Implementation

Follow the repo's convention of a doc comment on **every** new param/field stating what happens when it is omitted ("omitted ⇒ byte-identical to today").

### 7.1 Runner params

Add to `GenerateVerticalDramaShotVideoPromptParams` (near the existing `retentionHooksEnabled` at `:1461-1475`) and to `GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams` (`:2400-2454`):

```ts
/** Feature 137 P1 (tenant flag `verticalDramaMotionContracts`) — when true,
 *  the fact block REQUESTS `motion_profile` and the result/persist path reads
 *  it. Omitted/false ⇒ the field is never requested AND a volunteered
 *  `motion_profile` is ignored, so both the built prompt and the persisted
 *  clip are byte-identical to today. */
motionContractsEnabled?: boolean;
```

The judged wrappers extend these interfaces, so they need no change.

### 7.2 Zod schema (`shotVideoPromptOutputSchema`, `:1133-1205`)

Add a `motion_profile` sibling after `frame_analysis`, before the closing `.passthrough()`. Shape rules, not a full implementation:

- every field optional;
- `characters: z.array(z.object({ name: z.string() }).passthrough()).optional()` — only `name` is typed, everything else rides passthrough into the resolver;
- `camera_motion`, `identity_risk`: `z.string().optional()` — **never** `z.enum`;
- `new_character_enters: z.boolean().optional()`;
- `risk_reasons: z.array(z.string()).optional()`;
- object ends `.passthrough().optional()`.

Carry a doc comment in the style of the existing `frame_analysis` comment: what it is, which flag requests it, and why it is lenient (weak-model JSON failure class).

### 7.3 REQUEST line (`buildTargetVideoModelFactBlock`, `:1312-1335`)

Add `motionContractsEnabled?: boolean` to the params object (optional, so the bulk-pack call site at `:938-953` and every existing test call compile and behave unchanged), and one ternary entry in the array returning `null` when off — exactly the idiom the `frame_analysis` line already uses. Position: after the `frame_analysis` ternary, before the trailing `Apply the skill's …` line. Extend the function's doc comment to say there are now **two** conditional lines and which flag governs each.

### 7.4 Normalization helper + result fields

Add a runner-local helper beside `normalizeFrameAnalysis` (`:1421-1440`):

```ts
/** Resolve the LLM's raw `motion_profile` into the persisted shape + its
 *  derived effective risk. Returns `{}` (both undefined) when the flag is off
 *  or nothing usable came back — the "omit when there's nothing to say"
 *  convention this file already follows. Never throws. */
function resolveShotVideoPromptMotionProfile(
  raw: unknown,
  motionContractsEnabled: boolean,
): { motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk }; effectiveRisk?: VdIdentityRisk }
```

It flag-checks first, then calls `resolveMotionProfile`, then `resolveEffectiveIdentityRisk`, and returns the profile spread with `effectiveRisk` folded in plus the mirror. Both return literals (`:2360-2372` and `:2920-2934`) spread its result beside `frameAnalysis: normalizeFrameAnalysis(data.frame_analysis)`. Add the two fields to `GenerateVerticalDramaShotVideoPromptResult` (`:1791-1808` area) and `GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult` (`:2471-2476`), the twin's doc comment pointing at the first one exactly as `frameAnalysis` does today.

### 7.5 Judged wrappers — verify, do not edit

`generateJudgedVerticalDramaShotVideoPrompt` (`:3311`) and its speaker-switch sibling (`:3518`) return `{ ...winner, promptQuality }` on every path (accept `:3441`, judge-unavailable `:3423`, repair-shipped `:3481`, repair-rejected `:3488`, one-candidate-failed `:3341`). The new fields therefore propagate for free. **No edits here** — only the propagation tests in file A.

### 7.6 `contracts.ts`

Add `motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };` to the clip type immediately after `frameAnalysis` (`:971-974`), importing the two types from `./motionProfile` (contracts.ts already imports sibling shared types this way, e.g. `./videoPromptModelFamily`). Doc comment must state: which flag produced it, that `effectiveRisk` is the max of the skill's own `identityRisk` and the deterministic floor, that it is `undefined` for every clip generated before this task or by the bulk pack path, and that no consumer may require it.

### 7.7 Router

1. **Resolve once.** In the `generateShotVideoPrompt` mutation, beside the existing `const retentionHooksEnabled = await resolveVerticalDramaRetentionHooksFlag(tenantId);` (`:13909-13910`), add a sibling `const motionContractsEnabled = await resolveVerticalDramaMotionContractsFlag(tenantId);`. Add it as a **separate statement** — do not refactor the existing line into a `Promise.all`; that changes await ordering under the router tests' mock queues for no benefit. Resolution sits **before** the split-vs-single branch so one resolution serves both.
2. **Thread it** into `generateJudgedVerticalDramaShotVideoPrompt({ … })` (`:14378`, beside `retentionHooksEnabled` at `:14420`) and into the `generateAndPersistSplitShotVideoPrompt({ … })` args (`:14307`).
3. **Accept it** in `generateAndPersistSplitShotVideoPrompt`'s `args` type (`:6450`) and forward to `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch({ … })` (`:6594`).
4. **Persist** `motionProfile: result.motionProfile,` **and its sibling
   `effectiveRisk: result.effectiveRisk,`** immediately after
   `frameAnalysis: result.frameAnalysis,` and before `promptQuality:` in the
   existing-pack literal (`:14699`) and the minimal-pack literal (`:14738`); and the
   same two lines off `speakerSwitchGeneration` in the split literal (`:6799`).

   > **Why both keys.** Spec 137 §7.3/§15 define `clips[].motionProfile` **and**
   > `clips[].effectiveRisk` as siblings. Folding the risk only inside
   > `motionProfile` is functionally equivalent within P1, but P2's
   > generation-mode advisory chip (137 §11.4) is specified to read
   > `clips[].effectiveRisk` and would silently read `undefined`. Two extra lines
   > now remove a future trap. Add `effectiveRisk?: VdIdentityRisk;` beside
   > `motionProfile?` in `contracts.ts`, and assert both keys in the §6.4
   > persistence tests.

Consistent placement in all three keeps the diff reviewable and makes a missing site obvious.

**Clip literals you must NOT touch:** `regenerateClipDialogue`'s collapse literal (`:15002-15016`) spreads the existing clip (`...matchingClipRest`) so `motionProfile` survives automatically; its fallback literal (`:15026-15032`) creates an empty-prompt clip with no generation behind it. Leave both alone. (Sanity check before you finish: `clipNumber:` object literals in the ROUTER are at `:6786`, `:14689`, `:14728`, `:15010`, `:15027` — only the first three are generation results.)

### 7.8 Bulk-path comments

At `projectMotionPromptPack`'s clip mapping (RUNNER `:452-464`) add a comment recording the decision verbatim from §8 below, so the omission never reads as an oversight. Recommended (not required): a one-line cross-reference at the pipeline's split-pass clip literal (`server/services/verticalDramaEpisodePipeline.ts:1708-1719`) — that literal is a **fourth** whitelist that already drops `frameAnalysis` and is deliberately left alone for the same reason.

### 7.9 Skill files (4 files — dual-case twins)

Edit the lowercase `skill.md` first, then copy it over `SKILL.md` so the twins stay byte-identical. The loader reads lowercase `skill.md` **before** `SKILL.md`; a change made only in the uppercase twin is dead.

**(a) JSON contract block** — in `skills/vertical-drama-shot-video-prompt/skill.md` the contract is at `:47-79`; add a `motion_profile` sibling after `frame_analysis` (`:68-77`), documenting the closed enums inline in the same style the existing block uses:

```json
"motion_profile": {
  "characters": [
    {
      "name": "string (character name from the CHARACTER IDENTITY MAP)",
      "start_facing": "frontal | three_quarter | profile | back_of_head | not_visible",
      "end_facing": "frontal | three_quarter | profile | back_of_head | not_visible",
      "turn_magnitude": "none | subtle | moderate | large",
      "reveals_hidden_side": "boolean — true when the end pose exposes facial regions the start frame never showed"
    }
  ],
  "camera_motion": "locked | push_in | pull_back | small_pan_tilt | small_lateral | orbit | large_reframe",
  "new_character_enters": "boolean",
  "identity_risk": "low | medium | high",
  "risk_reasons": ["string (short, factual)"]
}
```

The subshots twin's contract sits at `…-subshots/skill.md` in the same position; mirror it there.

**(b) Section body** — add `## MOTION PROFILE + MOTION CONTRACT — MANDATORY when the caller states \`motion_profile: REQUIRED\`` to both skills. In **this section** write only the *declaration semantics*:

- `start_facing` is read from the **attached start-frame image** (fall back to the supplied image-prompt text when no image is attached, exactly as `frame_analysis.position_source` already does);
- `end_facing` follows from the shot beat/intent, not from the image;
- `turn_magnitude` describes the head, not the body;
- `reveals_hidden_side` is true whenever the end pose shows facial regions the start frame never showed;
- `camera_motion` must match the camera vocabulary actually used in `prompt`;
- `identity_risk` is your own honest judgment — under-declaring is the failure mode this field exists to catch; the caller derives a floor from your other declarations and can only raise your answer, never lower it;
- return the object for solo shots too.

Place it after `## FRAME ANALYSIS FIRST` (`:140-176`) and before `## Hard rules` (`:177`) so the two observability sections sit together. **Do not** write prompt-shaping rules, negatives, or risk-scaled restrictions here and **do not** leave TODO/placeholder text in a live system prompt — section-08 appends the rules under this same header.

---

## 8. Decisions already made — do not re-litigate

1. **Bulk generation gets no motion profile.** `projectMotionPromptPack` (RUNNER `:387-466`) is a separate, narrower whitelist that already drops `frameAnalysis`, and the bulk pack skill has no `frame_analysis` contract at all. The bulk path lacks the attached per-shot start frame that grounds `start_facing`, so a profile authored there would be a guess. The asymmetry is intentional; record it in the code comment and in the rollout notes.
2. **Categories, never degrees.** The originating proposal specified numeric yaw thresholds ("≤15°"). They were deliberately replaced by closed categories: an LLM cannot measure degrees, and pseudo-precision creates false confidence. Numbers return only if a computer-vision path is ever added.
3. **The runner never judges.** `effectiveRisk` is `max(skill's identityRisk, deterministic floor)` and nothing else. All aesthetic judgment stays in the skill.
4. **No prose heuristics.** Do not add any check of the form "does the candidate's text assert a preserved facial angle". VD prompts are Thai *or* English depending on the episode's language setting, so substring matching would be silently wrong in one of them. `pickBetterCandidateByHardFacts` (`:3111-3125`) stays unchanged in P1.
5. **The request line is gated on the flag only**, not on `hasEstablishedCharacters`. Identity drift applies to solo shots too. Section-07's widening of the `frame_analysis` gate is an independent change to an independent line of the same fact block.
6. **A volunteered `motion_profile` is ignored when the flag is off.** The skill documents the field unconditionally, so a model may return it anyway; reading it would change the persisted payload with the flag off. Flag-check before resolving.

---

## 9. Flag-off byte-identical proof

The proof obligations for this section, all in files A and C:

| Surface | Proof |
|---|---|
| Fact block | `withFlag.replace(`${motionLine}\n`, "") === without` |
| Full user prompt (single generator) | same string as today for an identical param set with the flag omitted |
| Full user prompt (speaker-switch twin) | same |
| Persisted clip object | identical key set and values; no `motionProfile` key present at all |
| Router DB access | identical `db.select` call count |
| Bulk pack generator + projector | untouched under any flag value |

---

## 10. Verification / done criteria

```
cd apps/web

# New suites for this section
npx vitest run \
  server/services/__tests__/verticalDramaShotVideoPromptMotionProfile.test.ts \
  server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.motionProfilePersistence.test.ts \
  --reporter=basic

# Gate A — must still be 266/266 green, zero tolerance
npx vitest run \
  server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaJudgedShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaVideoPromptFormatter.test.ts \
  server/services/__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts \
  --reporter=basic
```

Also re-run Gate B (start-frame/image-reference suites) and compare **fail-sets as sets**, never counts — this section should add no new entries. Type check with `pnpm check` (or `npx tsc --noEmit`) and compare the error count against the pre-change baseline; no *new* errors attributable to this section.

**Done when:**

1. All three new suites green.
2. Gate A unchanged at 266/266.
3. Gate B fail-set unchanged (no new names).
4. Byte-identical proofs in §9 all green.
5. All four skill files edited, twins byte-identical, real-file gate green.
6. `motionProfile` appears in exactly three router clip literals and the two runner result literals — grep to confirm before closing.
7. No new TypeScript errors.

---

## 11. Known traps

- **Twin drift.** `skills/vertical-drama-shot-video-prompt/SKILL.md` and `-subshots/SKILL.md` both exist. The loader reads lowercase first. Edit lowercase, copy to uppercase, and let the file-B gate prove it.
- **Merge collision with section-07.** Both sections add a conditional line to `buildTargetVideoModelFactBlock` and touch the same four call sites (`:2148`, `:2714`, `:3362`, `:3571`). Land one, rebase the other, and re-run *both* byte-identical proofs — each proof removes only its own line, so a stale proof will fail loudly rather than silently, which is the desired outcome.
- **Line anchors drift after section-01**, which edits the ROUTER. Locate by symbol name or adjacent literal (`frameAnalysis: result.frameAnalysis`, `hasEstablishedCharacters`, `Apply the skill's "MODEL-FAMILY SHAPING"`).
- **Five `hasEstablishedCharacters` sites, four fact-block call sites, one bulk site.** The bulk-pack call at RUNNER `:938-953` passes `hasEstablishedCharacters: false` and must pass no `motionContractsEnabled` at all.
- **`z.enum` anywhere in the new schema is a bug.** Cheap models return sloppy enums; coercion belongs in `resolveMotionProfile`.
- **Formatting.** Do not run `prettier --write` over files you did not create; match the surrounding style by hand.
- **Cost.** The judged path runs 2 candidate generations + 1 judge (+1 repair), so every added prompt character is paid up to four times per shot. The REQUEST line is one line by design — keep it that way.

---

## Implementation record (2026-08-01)

- Added the request-gated, lenient `motion_profile` wire contract to both
  per-shot generators; flag-off ignores volunteered fields and preserves the
  existing fact block byte-for-byte.
- Exposed and persisted bounded `motionProfile`, deterministic `effectiveRisk`,
  and `motionContractStatus` in all three generated-clip branches. Missing or
  invalid profiles persist status only.
- Existing judged loops prefer a valid contract candidate without adding an
  LLM call or retry. When no bounded candidate emits a valid contract, the
  legacy-selected prompt remains in place and the structured audit event keeps
  the degraded outcome measurable without logging prompt or image data.
- Kept the bulk pack schema/projector unchanged because it has no grounded
  per-shot start frame.
- Added focused contract, real-skill-file, observability-order, and persistence
  wiring tests. The two existing router suites remain 53/53 green. Existing
  judged-suite call-count assertions remain a known baseline mismatch with the
  current fallback implementation; this section adds no retry and deliberately
  does not rewrite those historical counts.
