<!-- SECTION: section-14-joint-verification -->

# Section 14 — Joint verification, flag-off proof, real-LLM gate, rollout docs

## Current-worktree override (binding)

Close P1 with neighbor anchoring off. Test a pure truth table for the legacy preset
flag plus four P1 flags, then focused integrations for each flag, child-on/parent-off,
all-off parity and all-on precedence. Use refreshed section-01 fail sets, not
historical counts. Validate JSONB concurrency, tRPC tenant/owner guards, event
privacy, Astryx/browser evidence and offline/manual GA rubrics. Section 12 runs
afterward as an independent canary with its own latency/capacity/security gates.

| | |
|---|---|
| **Section id** | `section-14-joint-verification` |
| **Depends on** | sections 08, 11, 13, and 15. Section 12 is explicitly excluded until the later P1b canary. |
| **Blocks** | – (last section; the branch merges after this) |
| **Parallelizable** | **No.** Nothing may land after it without re-running it. |
| **Feature flags** | `verticalDramaMotionContracts` (F137 P1) and `verticalDramaSceneContinuity` (F138 P1) — both still default `false` at merge. This section proves **both off** and exercises **both on**. |
| **Runtime / test command** | `cd apps/web && npx vitest run` (Vitest 2.1.9, `environment: "node"`; jsdom only for `client/src/**/*.test.tsx`) |
| **DB / schema changes** | none (read-only verification queries only) |
| **Skill files touched** | none (only *asserted* on, via the real-file gates each earlier section shipped) |

Source: `../claude-plan.md` §6 (Step 4 — Verification) + `../claude-plan-tdd.md` §"Step 4 — Joint verification". Baselines and measurement rules come from `section-01-prereq-baseplan-fix.md` §6. All work is in `apps/web` except the two documentation deliverables.

---

## 1. Why this section exists

Sections 02–13 each prove **their own** change in isolation. Nobody has yet proven the three things that actually decide whether this branch is safe to merge and whether the features do anything at all:

1. **Flag-off byte-identity across the whole branch.** Each section proved "my line disappears when my flag is off". Nobody proved that *the union of thirteen sections*, with **both** flags off, reproduces the pre-branch output character-for-character. Thirteen individually-correct diffs can still compose into a changed default path (an extra `.filter(Boolean)` entry, a reordered array, a newly-threaded `undefined` that reaches a `JSON.stringify`).
2. **Both flags on together.** Every section tested one flag. F137's motion contract and F138's scene lock land in the *same* video-prompt `shotContext` and the *same* prompt budget. Their interaction — ordering, duplication, budget pressure, vision-attach cap — is untested until here.
3. **That the skills were actually taught what the runners request.** Real-*file* gates prove a literal string exists in `skill.md`. Only a **real-LLM** run proves a live model, given that system prompt, emits `motion_profile` and a usable Scene Visual State. This is the "taught-not-wired" failure class that has bitten this codebase repeatedly, and P1 creates the **first VD real-LLM gate** to close it.

Plus the two things a reviewer will ask for: a fail-set diff they can read, and a rollout/rollback runbook.

### 1.1 Deliverables

| # | Deliverable | Artifact |
|---|---|---|
| D1 | **Aggregate flag-off parity harness** — capture pre-branch fixtures, replay them on the branch with both flags off | `server/services/__tests__/verticalDramaP1FlagOffParity.test.ts` + `server/services/__fixtures__/vdP1FlagOff/` |
| D2 | **Both-flags-on joint suite** — 2×2 flag matrix, coexistence, budget, attach-cap interaction | `server/services/__tests__/verticalDramaP1BothFlagsOn.test.ts` |
| D3 | **First VD real-LLM gate** — pure evaluator + offline suite + opt-in live suite | `server/services/verticalDramaP1RealLlmGate.ts`, `…/__tests__/verticalDramaP1RealLlmGate.test.ts`, `…/__tests__/verticalDramaP1RealLlmGate.live.test.ts`, `server/services/__fixtures__/vdP1RealLlmGate/` |
| D4 | **Gate A / Gate B / typecheck verification report** | `planning/vd-p1-identity-scene-continuity/baselines/` (final artifacts + `verification-report.md`) |
| D5 | **Manual smoke, executed and recorded** | §8 checklist, evidence pasted into `verification-report.md` |
| D6 | **Rollout + rollback runbook and spec/doc updates** | `docs/runbooks/vertical-drama-p1-identity-scene-continuity.md` + spec status edits |

---

## 2. What this section consumes from earlier sections

Do **not** re-derive any of these; read them from where they were frozen.

| From | Symbol / artifact | Used here for |
|---|---|---|
| 01 | `planning/…/baselines/gate-a-files.txt` (7 files, 266 tests) | Gate A run list |
| 01 | `planning/…/baselines/gate-b-files.txt` + `gate-b-failset-after.txt` | Gate B run list and **the** fail-set the final measurement is diffed against |
| 01 | `baselines/README.md` (HEAD sha of the measurement) | the merge-base used for fixture capture (§5.2) |
| 02 | `verticalDramaMotionContracts`, `verticalDramaSceneContinuity`, `VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS`, `areVerticalDramaP1FeatureFlagsRegistered()` | flag matrix + rollout guard test |
| 03 | `resolveVdImagePromptBudget`, `resolveVdImagePromptBudgetForModel`, `VD_IMAGE_PROMPT_ABSOLUTE_MAX = 20_000`, default `VD_IMAGE_PROMPT_MAX = 3800` | budget-interaction tests (§6.3) and the gate's `prompt_over_budget` check |
| 04 | `resolveMotionProfile`, `deriveMotionRiskFloor`, `resolveEffectiveIdentityRisk`, `VD_FACINGS` / `VD_TURN_MAGNITUDES` / `VD_CAMERA_MOTIONS` / `VD_IDENTITY_RISKS` | real-LLM gate enum validation |
| 05 | `renderSceneContinuityLockBlock`, `VD_SCENE_CONTINUITY_LOCK_HEADER`, `selectSceneContinuityAnchor`, `isSameSceneMembership` | lock-text identity assertions, anchor smoke |
| 06 | `VD_MOTION_PROFILE_SKILL_SECTION_NAME` (`"MOTION PROFILE + MOTION CONTRACT"`), `motionContractsEnabled` param, `result.motionProfile` / `.effectiveRisk` | flag matrix, gate expectations |
| 07 | `frameObservabilityRequested` request line + widened `normalizeFrameAnalysis` fields | gate's `frame_observability_missing` check |
| 08 | motion-contract rules + judge dimension in the skills | real-LLM gate (does a live model honor them) |
| 09/10 | `verticalDramaSceneVisualState` service, `startFramePlan.sceneVisualStates[locationKey]` with `memberShotNumbers` | gate's scene-state checks, smoke DB evidence |
| 11 | `sceneContinuityLockBlock?: string` on all four engines | flag-off parity + coexistence tests |
| 12 | vision cap 6→7 under flag, anchor as 4th array in `mergeAndTrimReferenceImageUrls` | attach-array parity + cap-interaction tests |
| 13 | `planSceneVisualState` / `updateSceneVisualState` mutations + UI | manual smoke only (no new automated coverage here) |

> If any earlier section renamed one of these, **stop and fix the rename at its source section**, then return. Section 14 never adds a shim.

---

## 3. Files created / touched

| Path | Kind |
|---|---|
| `apps/web/server/services/__tests__/verticalDramaP1FlagOffParity.test.ts` | new test (capture-or-compare, D1) |
| `apps/web/server/services/__fixtures__/vdP1FlagOff/*.json` + `manifest.json` | new fixtures (captured at the merge-base) |
| `apps/web/server/services/__tests__/verticalDramaP1BothFlagsOn.test.ts` | new test (D2) |
| `apps/web/server/services/verticalDramaP1RealLlmGate.ts` | new **pure** module (D3) |
| `apps/web/server/services/__tests__/verticalDramaP1RealLlmGate.test.ts` | new offline test (D3) |
| `apps/web/server/services/__tests__/verticalDramaP1RealLlmGate.live.test.ts` | new opt-in live suite (D3) |
| `apps/web/server/services/__fixtures__/vdP1RealLlmGate/recorded/*.json`, `…/expectations/*.json` | new fixtures (D3) |
| `planning/vd-p1-identity-scene-continuity/baselines/{gate-a-final.txt,gate-b-failset-final.txt,typecheck-before.txt,typecheck-after.txt,verification-report.md}` | new artifacts (D4/D5) |
| `docs/runbooks/vertical-drama-p1-identity-scene-continuity.md` | new runbook (D6) |
| `specs/feature/137-…/spec.md`, `specs/feature/138-…/spec.md` | status/rollout note edits only (D6) |

**No production source file is modified by this section.** If verification finds a defect, the fix belongs to the owning section (re-open it, fix, re-run its suite, then re-run section 14). A production edit landing inside section 14 means the earlier section was closed prematurely — say so in the report rather than patching here.

---

## 4. Non-negotiable measurement rules (inherited from section-01 §6.1)

1. **Always run vitest from `apps/web`.** From the repo root it globs the monorepo and dies with `EACCES … data/hermes`.
2. **Never pipe a vitest run through `tail`** — it truncates the `FAIL` block and silently yields a short, wrong fail-set.
3. Compare fail-sets as **sets** of sorted unique names, never counts. A name leaving is progress **only if no new name entered**.
4. **No `git stash`** to produce a clean tree — other sessions hold stashes in this repo. Use a git worktree or scratchpad copies.
5. In a worktree, **symlink `node_modules`** from the main checkout first (worktrees have none). Additive only; never delete.
6. Record the sha next to every measurement.
7. **Mock hygiene:** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Every new `beforeEach` in this section that queues `…Once` values must `mockReset()` those mocks, or one early throw poisons the rest of the file (this is precisely the mechanism behind Gate B's 55-test cascade).

Fail-set extraction idiom:

```
… --reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u > <artifact>
```

---

## 5. D1 — Aggregate flag-off parity (tests first)

### 5.1 What must be proven

With **both flags absent from the tenant record** (not "false" — absent, the real production default), every prompt/payload surface this branch touched must be byte-identical to the merge-base. The surfaces, one fixture case each (minimum):

| id | Surface | Owning section |
|---|---|---|
| `sfg-cinematic` | `cinematic_narrative` start-frame user prompt (engine A) | 11 |
| `sfg-legacy` | legacy start-frame user prompt (same builder, legacy mode) | 11 |
| `sfg-policysafe` | `policy_safe_rewrite` deterministic final prompt (engine B) | 11 |
| `sfg-batchplan` | 9-shot batch render-plan user prompt (engine C) | 11 |
| `sfg-vision` | start-frame prompt vision attach array, serialized (labels + order) | 12 |
| `vp-factblock` | `buildTargetVideoModelFactBlock` output, ≥2 refs and 1 ref, 4 model families | 06, 07 |
| `vp-shotcontext` | single-shot video-prompt `shotContext` fact lines (engine D) | 11 |
| `vp-splitcontext` | split/sub-shot video-prompt fact lines (engine D twin) | 11 |
| `storyboard-usertext` | storyboard shot-grid user prompt with `motionContractsEnabled` omitted/false | 08 |
| `merge-refs` | **Special case — see the note below.** `mergeAndTrimReferenceImageUrls` output for the 3 shipped call-site shapes, incl. an `undefined maxReferenceImages` model and a model that declares a limit | 12 |
| `clip-literal` | persisted clip object **key set** for the existing-pack / minimal-pack / split-shot literals | 06 |
| `plan-projection` | `projectStartFramePlan` output key set + per-frame carry-over field list | 10 |

### 5.2 Capture protocol (the only tricky part)

The fixtures must be produced by **base code**, not by branch code with flags off — otherwise the test proves nothing.

1. Read the merge-base sha from `baselines/README.md` (the HEAD all anchors were verified at, `941547ff1`, unless the branch was rebased — then use `git merge-base main HEAD`).
2. Create a worktree at that sha and symlink `node_modules` into it from the main checkout.
3. **Copy** `verticalDramaP1FlagOffParity.test.ts` into the worktree (untracked). Run it there with the capture env var set; it writes the JSON fixtures.
4. Copy the produced fixtures back into the branch under `server/services/__fixtures__/vdP1FlagOff/` and commit them.
5. On the branch, run the same file with the env var **unset** — it now compares instead of capturing.

The file is therefore **capture-or-compare in one module**:

```ts
/**
 * VD P1 §14 D1 — aggregate flag-off byte-identity.
 *
 * MODE A (capture): with VD_P1_CAPTURE_FLAG_OFF_FIXTURES === "1", writes one
 *   JSON fixture per case into __fixtures__/vdP1FlagOff/. Run ONLY in a
 *   worktree checked out at the merge-base sha; never on the branch.
 * MODE B (compare, the default): rebuilds every case from the SAME frozen
 *   param set with both P1 flags OMITTED and asserts byte-equality against the
 *   captured fixture.
 *
 * HARD CONSTRAINT: this file may import ONLY symbols that exist at the
 * merge-base. It must never import motionProfile.ts, sceneContinuity.ts,
 * modelPromptBudget.ts or any new param — the flag-off path must be reachable
 * by passing nothing new at all. If a case cannot be built without a new
 * import, that case's default path changed and the parity claim is already
 * false.
 */
```

Frozen param sets live in one exported `const` in the test file (one object per case id) so capture and compare cannot drift. Serialization is `JSON.stringify(value, null, 2)` for arrays/objects and raw text for strings, each written to `<caseId>.json` alongside `manifest.json` recording: base sha, capture date, node version, case ids, and a hash of the param-set literal.

### 5.3 Test stubs

```
describe("VD P1 flag-off parity — captured at merge-base <sha>")
  Test: every case id in the frozen param set has a captured fixture
        (guards against a case silently skipped during capture)
  Test: manifest.json records the merge-base sha and the param-set hash, and the
        param-set hash still matches the literal in this file
        (if it does not, the params were edited after capture ⇒ recapture, do not
         "update the fixture")
  Test.each(caseIds): rebuilding <case> with both flags OMITTED equals the fixture
        byte-for-byte
  Test.each(caseIds): rebuilding <case> with both flags EXPLICITLY false equals the
        same fixture (absent and false must not differ)
  Test: no fixture file is unused (fixture set and case set are equal as sets)
```

### 5.3b The `merge-refs` case cannot obey §5.2's "same symbol" rule — handle it this way

Section 12 §4.1 gives `mergeAndTrimReferenceImageUrls` a **positional signature
change** (3 arrays → 4). Capture-mode runs at the merge-base, where the 4-arg form
does not exist; compare-mode runs on the branch, where the 3-arg form no longer
exists. The two trees therefore *cannot* call the same symbol, and §5.2's hard
constraint is unsatisfiable for this one case.

**Resolution — capture the OUTPUT, not the call.** Freeze the fixture as the
`{ urls, trimmedCount }` results produced at the merge-base for a fixed table of
input shapes (the three shipped call-site shapes × `{undefined, 4, 16}` caps).
Compare-mode rebuilds the same table through the 4-arg signature with `[]` in the
new anchor slot and asserts deep-equality against those frozen results. That is
exactly the semantic claim worth proving — "an empty anchor array reproduces the
pre-F138 behavior" — and it is provable across a signature change, whereas
call-identity is not.

Record this as the single documented exception to §5.2 in `manifest.json`.

⚠️ **One consequence to state in the report:** if sub-task 12.0 raised the live
`gpt-image-2` `maxReferenceImages` from 4 to 16, the *production* trim behavior for
that model changed by design. The parity fixture must therefore pin caps as literal
numbers in the table, never read them from a model row — otherwise this case would
fail for a reason that is a deliberate fix, not a regression.

### 5.4 Rules

- **Never edit a fixture to make a test pass.** A red parity case is a behavior change on the default path; fix the owning section.
- Where a builder is module-private at the merge-base, drive it through the nearest **exported** entry point with the standard service-mock header (copy from `server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts`). Do **not** add an `export` at the merge-base to make capture easier — the two trees must call the same symbol.
- For client-side surfaces (section 13) there is no parity fixture: with the flag off the new UI renders nothing, which section 13's own tests assert. Do not mount panels in jsdom here.

---

## 6. D2 — Both flags on (tests first)

New file `server/services/__tests__/verticalDramaP1BothFlagsOn.test.ts`. Mock header copied from `verticalDramaVideoMotionPromptGeneration.test.ts`; `mockReset()` in `beforeEach` for anything given `…Once` values.

### 6.1 Flag matrix — now THREE flags, not two

Section 15 (Feature 139 P1, `verticalDramaSeriesLookLock`) injects a **series look
lock** into the same builders. A full 2³ matrix is 8 cases; that is justified only
for the two builders where all three can co-occur — the **batch render plan** and the
**per-shot policy-safe assembly**. Everywhere else, keep the 2×2 below and add one
look-lock-only case.

The three interaction cases that must exist:

```
Test: all three flags ON ⇒ the batch render plan carries the look block exactly
      once and the scene lock exactly once, in a stable order, and the motion
      markers appear only on the video side
Test: policy-safe assembly with BOTH locks: order is
      REFERENCE MAPPING → scene lock → look lock → synopsis, and removing both
      blocks reproduces the all-off prompt byte-for-byte
Test: budget — scene lock + look lock together on a 3800-budget model behave per
      section 03 (no silent truncation, throw only when genuinely over)
```

```
describe("flag matrix — off/off, on/off, off/on, on/on")
  Test: off/off  ⇒ neither the motion_profile REQUEST line nor
        VD_SCENE_CONTINUITY_LOCK_HEADER appears in any builder output
  Test: on/off   ⇒ motion markers present, scene lock header ABSENT
  Test: off/on   ⇒ scene lock header present, motion markers ABSENT
  Test: on/on    ⇒ both present, each exactly once
  Test: the on/on output minus BOTH marker line-groups equals the off/off output
        (the composed byte-identity proof: apply each section's own removal
         transform in turn; template =
         verticalDramaStartFrameGeneration.referenceFrameMode.test.ts)
  Test: areVerticalDramaP1FeatureFlagsRegistered() is true and both defaults are
        false (rollout guard — the branch must merge dark)
```

### 6.2 Coexistence

```
describe("motion contract + scene lock in the same prompt")
  Test: video-prompt shotContext with both flags on emits the scene lock block and
        the motion_profile request in a STABLE order (assert index order, so a
        future edit cannot silently reshuffle the system prompt)
  Test: neither block is duplicated when the same builder is called twice with the
        same params (idempotent construction)
  Test: the split/sub-shot builder produces the same two blocks (duplicated
        builders — both must be covered)
  Test: image-prompt builders (engines A/B/C) carry the scene lock but NEVER the
        motion_profile request (motion contracts are a video-prompt concern only)
  Test: two shots of the SAME scene receive byte-identical lock text across engines
        A, C and D (one state ⇒ one deterministic render)
  Test: two shots of DIFFERENT scenes receive different lock text
```

### 6.3 Budget interaction (ties section-03 to section-11)

```
describe("scene lock vs. the per-model prompt budget")
  Test: a policy_safe prompt that is within 3800 today, plus a lock block that
        pushes it past 3800, does NOT throw for a model declaring
        maxPromptLength 20000 (gpt-image-2 row shape)
  Test: the same prompt still THROWS VdSchemaValidationError for a model with no
        declared limit (3800 default preserved — no silent widening)
  Test: the effective budget never exceeds VD_IMAGE_PROMPT_ABSOLUTE_MAX (20000)
        even if a row declares more
  Test: with the scene flag off, the budget resolution is unchanged from today
```

### 6.4 Attach-cap interaction (ties section-12 to section-07)

```
describe("vision attach cap under both flags")
  Test: flag off ⇒ auto cap is 6 and the array is byte-identical to the D1 fixture
  Test: scene flag on with an anchor ⇒ cap is 7 and the anchor carries its
        descriptive label with the anchor shot number
  Test: at the cap, drop order is scene anchor first, then location, then the 4th
        portrait — identity references are NEVER dropped
  Test: a dropped anchor is LOGGED (today's silent location drop must not be
        repeated)
  Test: render-time reference order is character → location → anchor → product and
        the fail-closed character-capacity guard still runs BEFORE the merge
  Test: no new db.select calls are introduced by either flag being on
        (expect(mockDb.select).toHaveBeenCalledTimes(N) — cost guard)
```

---

## 7. D3 — The first VD real-LLM gate

### 7.1 Shape (copied from the only shipped precedent)

`server/services/marketplaceAutoReviewSequentialGate.ts` + `marketplaceAutoReview.sequentialRealLlmGate.test.ts` establish the pattern, and this section follows it exactly:

- a **pure** evaluator module (no I/O, no LLM) that turns recorded output into a pass/fail report with a frozen failure-code set,
- an **offline** test that drives that evaluator over recorded fixtures — this runs in every normal test run,
- a **live** suite wrapped in `describe.skipIf(...)` that produces the recorded output from a real model — this never runs by default,
- an env helper enabled by the **exact string `"1"`**.

### 7.2 Module API (stubs — implement bodies, keep the docstrings)

`server/services/verticalDramaP1RealLlmGate.ts`:

```ts
/** env `VERTICAL_DRAMA_P1_REAL_LLM_GATE === "1"` — false by default, and false
 *  for "true"/"yes"/"0"/any other value. The ONLY switch for the live suite. */
export function isVerticalDramaP1RealLlmGateEnabled(): boolean;

/** Frozen failure-code set. Adding a code is a deliberate, tested change. */
export const VD_P1_REAL_LLM_GATE_FAILURE_CODES = [
  "motion_profile_missing",        // F137 requested it; the model returned nothing
  "motion_profile_enum_invalid",   // a value outside VD_FACINGS / VD_TURN_MAGNITUDES /
                                   // VD_CAMERA_MOTIONS / VD_IDENTITY_RISKS survived resolution
  "effective_risk_not_raised",     // declared facts imply a higher floor than effectiveRisk
  "frame_observability_missing",   // F137 gate widened, but no per-person observability came back
  "motion_contract_absent",        // effectiveRisk high, yet the prompt carries no contract text
  "scene_state_missing",           // F138 authored no state for a scene that has one
  "scene_state_incomplete",        // state present but a required lock field is empty
  "scene_member_shots_mismatch",   // memberShotNumbers ≠ the resolved scene group
  "scene_lock_absent_from_prompt", // state exists but the prompt lacks the lock header
  "scene_lock_text_diverged",      // two same-scene shots got different lock text
  "prompt_over_budget",            // image prompt > effective budget, or video prompt > 2000
  "batch_lighting_diverged",       // same-scene shots in ONE batch render-plan call got
                                   // divergent lighting despite a lock being present
                                   // (spec 138 §20.4/§23 — the output-level proof that
                                   //  the §7.5 clause actually works, not just that it exists)
] as const;

/** What a fixture scenario is allowed to expect. Numbers come from section-03's
 *  budget resolver and the shipped VD_VIDEO_PROMPT_MAX = 2000. */
export type VdP1RealLlmGateExpectations = { /* fixtureId, expectMotionProfile,
  expectSceneVisualState, expectedSceneMemberShots, imagePromptMaxChars,
  videoPromptMaxChars, sceneLockHeader, motionSectionName */ };

/** The recorded output of ONE gate run: the video-prompt results, the
 *  start-frame prompts, and the authored scene states, in a JSON-round-trippable
 *  shape. Written by the live suite, replayed by the offline suite. */
export type VdP1RealLlmGateSample = { /* … */ };

export type VdP1RealLlmGateReport = { /* fixtureId, passed, failures[],
  observed{...}, generatedAt */ };

/** PURE — no I/O, no LLM. Offline-tested against recorded samples. */
export function evaluateVerticalDramaP1RealLlmGate(
  sample: VdP1RealLlmGateSample,
  expectations: VdP1RealLlmGateExpectations,
): VdP1RealLlmGateReport;
```

Enum validation must reuse section-04's exported tuples and `deriveMotionRiskFloor` — the gate must never re-declare an enum list (a second list is exactly how the two drift).

### 7.3 Offline suite — `verticalDramaP1RealLlmGate.test.ts`

Recorded fixtures under `server/services/__fixtures__/vdP1RealLlmGate/recorded/` (one clean sample plus one deliberately broken sample per failure code that is cheap to synthesize), expectations under `…/expectations/`.

```
describe("evaluateVerticalDramaP1RealLlmGate (offline, deterministic)")
  Test: a clean same-scene 2-shot sample passes with failures: []
  Test: a sample missing motion_profile flags motion_profile_missing with the shot id
  Test: an out-of-enum facing flags motion_profile_enum_invalid
  Test: a sample whose declared facts imply "high" but reports "medium" flags
        effective_risk_not_raised
  Test: a sample whose two same-scene shots carry different lock text flags
        scene_lock_text_diverged and names BOTH shot ids
  Test: a state whose memberShotNumbers disagree with the group flags
        scene_member_shots_mismatch
  Test: an image prompt above the expectations' budget flags prompt_over_budget
        with detail "image_prompt"; a video prompt above 2000 with "video_prompt"
  Test: observed{} reports facts even when the verdict is fail (facts ≠ verdict)
  Test: the frozen failure-code tuple is unchanged (toEqual on the constant)

describe("isVerticalDramaP1RealLlmGateEnabled")
  Test: false when VERTICAL_DRAMA_P1_REAL_LLM_GATE is unset (save/restore the var)
  Test: true ONLY for the exact string "1" ("true", "yes", "01" ⇒ false)
  Test: therefore the live suite is SKIPPED in the default run
        (asserted via the helper, never by running the live suite)
```

### 7.4 Live suite — `verticalDramaP1RealLlmGate.live.test.ts`

```ts
/**
 * OPT-IN ONLY. Wrapped in describe.skipIf(!isVerticalDramaP1RealLlmGateEnabled()).
 * Spends real LLM credits on the internal tenant. NEVER add it to CI, to a
 * package.json script, or to a default vitest run.
 *
 * Scope: LLM AUTHORING CALLS ONLY. It must not trigger a paid image or video
 * render — no generateImageAsync, no clip generation, no approvals.
 * Budget: ~5 calls (2 video-prompt authorings incl. the judged loop's own
 * candidates, 1 scene-state authoring, 2 start-frame prompt authorings).
 *
 * With VD_P1_REAL_LLM_GATE_RECORD === "1" it also writes its sample JSON back
 * into __fixtures__/vdP1RealLlmGate/recorded/ so the offline fixtures can be
 * refreshed from a real run instead of hand-written.
 */
```

```
describe.skipIf(!isVerticalDramaP1RealLlmGateEnabled())("VD P1 real-LLM gate")
  Test: with verticalDramaMotionContracts ON, a real model returns a
        motion_profile whose enums all resolve — proves the skill was taught what
        the runner requests (taught-not-wired guard, live edition)
  Test: with the flag ON and a profile/back-of-head start facing, the authored
        prompt carries a motion contract and effectiveRisk is not "low"
  Test: with verticalDramaSceneContinuity ON, one authoring call per scene yields a
        Scene Visual State with a non-empty lightingState and correct
        memberShotNumbers
  Test: two same-scene shots receive byte-identical rendered lock text
  Test: with the scene flag ON, one BATCH render-plan authoring call for a scene
        spanning shots 1-3 produces mutually consistent lighting across those three
        shots  ← spec 138 §20.4/§23: the output-level proof. The skill-file gate in
        section 11 §7.7 only proves the clause EXISTS; this proves it WORKS.
        Failure code: batch_lighting_diverged
  Test: evaluateVerticalDramaP1RealLlmGate(sample, expectations).passed === true
        (the same evaluator the offline suite pins — one implementation, two
         drivers)
```

Run it explicitly, never as part of a sweep:

```
cd apps/web && VERTICAL_DRAMA_P1_REAL_LLM_GATE=1 \
  npx vitest run server/services/__tests__/verticalDramaP1RealLlmGate.live.test.ts --reporter=basic
```

**Secret hygiene:** the suite reads provider credentials through the existing router/service plumbing. It must never log, assert on, or serialize a key; fixtures must contain prompts and outputs only. Do not add credentials to the fixture manifest.

---

## 8. Verification runbook

Run in this order; paste each result into `baselines/verification-report.md`.

### 8.1 New suites for this section

```bash
cd apps/web && npx vitest run \
  server/services/__tests__/verticalDramaP1FlagOffParity.test.ts \
  server/services/__tests__/verticalDramaP1BothFlagsOn.test.ts \
  server/services/__tests__/verticalDramaP1RealLlmGate.test.ts \
  --reporter=basic
```

All green. The live suite must report as **skipped**, not run.

### 8.2 Gate A — zero tolerance

Run the exact 7-file list from `baselines/gate-a-files.txt`. Required: **266/266 green, fail-set `{}`**. Any red here is a merge blocker with no exceptions and no triage path — find the section that caused it and fix it there.

> If a section legitimately added tests to a Gate A file, the count rises above 266. That is allowed **only** if section-06/07's notes recorded it; the fail-set must still be `{}`. Record the new count in the report so the next wave inherits a true baseline.

### 8.3 Gate B — fail-set identity diff

Run the exact list from `baselines/gate-b-files.txt`, extract to `baselines/gate-b-failset-final.txt`, and diff against `baselines/gate-b-failset-after.txt`.

**Pass condition:** `final ⊆ after` **and** `final \ after = ∅` (no new names). A smaller set is fine and expected only if a section genuinely healed something.

**Triage for any new name** (sections 07, 11, 12 and 13 all change `db.select` call ordering, which reshuffles the 55-test cascade non-monotonically):

1. Re-run that one suite in isolation, filtered to the single test name.
2. **Fails in isolation** ⇒ real regression. Fix in the owning section. Do not accept it.
3. **Passes in isolation** ⇒ mock-queue leakage from a `…Once` queue that a newly added or reordered `db.select` left undrained. The fix is `mockReset()` hygiene in the suite the section touched — *not* editing the baseline, and *not* "fixing" the pre-existing first domino at `shotReferencesAndQualityReview.test.ts` (that is out of scope and would invalidate the baseline for everyone).

Record, for the report: the diff, the triage verdict per new name, and the final counts (counts are commentary; the set is the contract).

### 8.4 The rest of the VD suites

```bash
cd apps/web && npx vitest run shared/verticalDramaSeries --reporter=basic
```

All shared pure-module suites green, including sections 04/05's new `motionProfile.test.ts` and `sceneContinuity.test.ts`. Then re-run section-03's regression list (`media.db-first.contract.test.ts`, `verticalDramaPromptQc.test.ts`, the two SFG mode suites, the two router prompt suites, `verticalDramaEpisodes.imagePromptMode.test.ts`) plus every new suite named by sections 06–13, and each section's real-**file** skill gate.

### 8.5 TypeScript delta

`pnpm check` is **not** clean at base — `apps/web` carries a large pre-existing error baseline (~987 errors historically). The operative criterion from plan §6.3 is therefore **no new errors attributable to this branch**, and the index's shorthand "clean" must be read that way.

Measure both sides the same way, normalizing away line/column noise so an inserted line does not read as a new error:

```bash
# in the merge-base worktree, then on the branch
cd apps/web && pnpm check 2>&1 | grep -E "error TS" \
  | sed -E 's/\(([0-9]+),([0-9]+)\)//' | sort -u > <artifact>
```

Diff `typecheck-before.txt` → `typecheck-after.txt`. Required: **no added lines**. Removed lines are fine (section-01 removes at least the `TS2304: Cannot find name 'basePlan'` entry).

### 8.6 Production build

Section 13 edits client components, where a type error can break the real build even though `pnpm check` is noisy.

```bash
cd apps/web && npm run build:deploy
```

Must succeed. This is the atomic build (staging dir + rename), so it is safe to run against the live checkout. Frontend-only changes are live immediately; because this branch also changes `server/**`, a `sudo systemctl restart smartspec-web.service` is required before the manual smoke — and must **not** be run while another agent is editing server files.

---

## 9. D5 — Manual smoke (both flags ON)

This is the only check that can fail while every automated gate is green, because it exercises the ordering decision that determines whether neighbor anchoring does anything at all (risk A1). Do not skip it.

Environment: internal tenant on **https://smartaihub.app** (this server has no browser and no localhost access for users; the domain is the only entry point). Nginx (`smartspec-nginx-dev`) must be up.

### 9.1 Setup

1. Deploy the branch (§8.6) and restart `smartspec-web.service`.
2. Admin → tenant feature flags → enable **both** `verticalDramaMotionContracts` and `verticalDramaSceneContinuity` for the internal tenant only.
3. Open a VD sub-episode whose storyboard has a `distinct_locations` entry covering **at least shots 1–3** in one location, and at least one other location. A fresh sub-episode with nothing approved is required — that is the scenario risk A1 is about.

### 9.2 Scene lock (F138)

4. Trigger scene planning — either the explicit "วางแผนความต่อเนื่องของฉาก" action on the locations-bible card, or simply generate shot 1's start-frame prompt (lazy authoring).
5. Read back the state (read-only):
   `SELECT jsonb_pretty("startFramePlan"->'sceneVisualStates') FROM <episodes table> WHERE id = <id>;`
   Expect one entry per planned `locationKey`, each with a non-empty `lightingState` and a `memberShotNumbers` array matching the storyboard group.
6. Generate the start-frame prompts for shots 1 and 2 and compare them: the scene continuity lock block (starting with `VD_SCENE_CONTINUITY_LOCK_HEADER`) must be **byte-identical** in both. Diff the two prompt strings and confirm the only differences are the shot synopses.
7. Confirm the lock block is a **constraint list**, not scene description or emotional direction ("lock, don't describe"). If it reads like prose, section-09's skill or section-05's renderer regressed.

### 9.3 Neighbor anchoring (the A1 proof)

8. Click "generate all" start-frame images on the fresh sub-episode (nothing approved yet).
9. From the audit log, confirm shots 2+ of the same scene carry an anchor at **both** layers:
   - prompt time: the authoring call's vision array contains `Scene continuity reference (shot N): …`;
   - render time: the media request's `referenceImageUrls` contains the earlier shot's asset URL, positioned between the location and product URLs.
   ```bash
   grep '"traceId":"<trace>"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .
   ```
10. Confirm the batch processed the scene's shots in **ascending** order (timestamps in the audit log), and that the anchor's `source` is `latest_generated` — approval has not happened yet. **If every shot's anchor is absent, the feature shipped and does nothing** (risk A1): stop and re-open section-12.
11. Approve shot 1, regenerate shot 2, and confirm the anchor `source` flips to `approved`.

### 9.4 Motion contract (F137)

12. Generate a video prompt for a shot whose start frame shows a character in profile or back-of-head.
13. Confirm the persisted clip carries the profile:
    `SELECT jsonb_pretty("motionPromptPack"->'clips') FROM <episodes table> WHERE id = <id>;`
    Expect `motionProfile` with `effectiveRisk` on the regenerated clip, and untouched clips unchanged.
14. Confirm the authored prompt names the preserved facial angle and restricts motion, and that a **low-risk** shot's prompt gained nothing (over-restriction produces static clips — that is the failure mode to watch for).
15. Confirm the grok family received the constraints **positively phrased** and no negative prompt (grok never gets one).

### 9.5 Cost and fail-open

16. Count authoring calls for the batch: a 9-shot sub-episode spanning 2 scenes must produce **2** scene-state authoring calls, not 9.
    ```sql
    SELECT "modelUsed", count(*) FROM provider_usage_log
    WHERE "createdAt" > NOW() - INTERVAL '30 minutes' GROUP BY 1;
    ```
17. Fail-open check: with the tenant temporarily out of credits (or the authoring model disabled), a start-frame render must still succeed with **no lock block**, **no charge**, and a logged warning — never an error on the render path. The explicit `planSceneVisualState` mutation is the one place an insufficient-credit error is correct.

### 9.6 Flags back off

18. Disable both flags. Regenerate one start-frame prompt and one video prompt and confirm the lock block and motion lines are gone and the output matches the pre-flag text. **Leave both flags OFF** at merge.

Paste the traceIds, the two compared prompts (trimmed), and the query outputs into `verification-report.md`.

---

## 10. D6 — Documentation

### 10.1 Runbook — `docs/runbooks/vertical-drama-p1-identity-scene-continuity.md`

Model it on `docs/runbooks/hyperframes-marketplace-auto-review.md`. Required content:

- what the two flags do, in one paragraph each, with the spec links;
- **enable procedure**: per-tenant only, one flag at a time, internal tenant first;
- **rollback**: flip the flag off — no deploy, no migration, no data cleanup. `sceneVisualStates` and `clips[].motionProfile` are additive jsonb keys that become inert when the flag is off;
- **what to watch after enabling**: LLM call volume (one scene-state call per scene, not per shot), start-frame prompt length vs. the per-model budget, vision-token cost on the authoring call (cap 6→7), and clip staticness complaints (over-restrictive contracts);
- **known limitations** (§12);
- the real-LLM gate command and its cost.

### 10.1b GA-gate instrumentation (REQUIRED — both specs make GA a *measured* transition)

137 §19 gates GA on "≥30% reduction in manually-regenerated clips per episode";
138 §17 on "manual frame-regens attributed to scene mismatch drop ≥30%". Nothing in
the branch counts either today, so GA would be a judgement call rather than a
measurement.

Minimal instrumentation — one audit line per existing manual-regeneration mutation,
no new code path:

```
vd_manual_frame_regen  { episodeId, shotNumber, hadSceneLock, hadSceneAnchor }
vd_manual_clip_regen   { episodeId, shotNumber, effectiveRisk }
```

Together with `vd_scene_state_planned` (section 11 §3.1) and
`vd_scene_neighbor_anchor_attached` (section 12 §4.8), these four events are what
make both GA gates computable. Document the exact query in the runbook (§10.1) —
"regens per episode, split by whether a lock/anchor was present" — so the person
flipping the flag to GA runs a query, not an opinion.

### 10.2 Spec and planning updates

- `specs/feature/137-…/spec.md` and `specs/feature/138-…/spec.md`: mark P1 scope delivered and confirm the long-form flag names (section-02 §5.5 already renamed them).

**Spec reconciliations — each of these is a place where the plan deliberately
diverged, so the spec must be amended or it will assert something false:**

| Spec text | What P1 actually does | Required amendment |
|---|---|---|
| 137 §14 + §20.3 — bulk pack gets "contract parity (schema additive)" | Section 08 §7.4/§8.1: **prose rules only, no output field** (the bulk path has no attached start frame to ground `start_facing`) | Change the pack row to "prose rules only; no schema change", with the reason |
| 137 §21 — deterministic runner-side check for prompt prose vs declared `camera_motion`, one corrective regen | Not implemented; sections 06 §8.4 and 08 §8.4 forbid prose heuristics (Thai/English prompts) | Either drop the runner-check clause from §21, **or** record it as a P2 item. Note the honest counter-argument: `camera_motion` is a *closed enum*, so a language-keyed vocabulary table is more tractable here than for the facial-angle check — if the conductor wants it, it belongs in P2 with its own tests, not smuggled into P1 |
| 138 §8.3 — regenerate-in-place "additionally attaches the neighbor" | Section 12 §4.7 sub-task 12.6 is explicitly deferrable | Add "deferred to P2" if it was not landed |
| 138 §8.3 — "on `gpt-image-2` the neighbor is never capacity-trimmed" | True **only after** section 12 §4.0 raises the seeded cap 4 → 16 | If §4.0's alternative path was taken instead, amend §8.3 — it currently asserts something false |
| 138 §8 — no batching semantics | Section 12 §4.5 makes "generate all" run a scene's shots **serially** (the mechanism that makes anchoring work). Real, user-visible latency change on single-scene episodes | Add it to §8 as P1 behavior, and to the runbook's "what to watch" |
| 137 §9.5.1 — the UI character counter is one of four enforcement points | Section 03 §9 leaves it at 3800 | Either implement it (see below) or record the gap |

**The UI counter is worth closing, not deferring.** The whole point of section 03 is
to create prompt headroom for locks; leaving the client warning at `n / 3800` warns
users away from exactly the headroom P1 just created. Cheapest route: section 13
already threads props into `VerticalDramaStoryboardPanel.tsx` — pass the effective
per-model budget alongside `flags.sceneContinuity` from `getEpisodeDetail` and use it
at the three counter sites (`:95`, `:4669`, `:7775`). If it does not land, record it
in §12 as a known P1 limitation rather than leaving the spec claiming four
enforcement points.
- **Do not rewrite** anything under `planning/vd-p1-identity-scene-continuity/` — planning docs are a permanent historical record. Add findings to `verification-report.md` instead.

### 10.3 PR description must call out

1. The client-facing zod input bound on the image prompt widened from 3800 to 20000 characters (section-03) — deliberate, still finite, with the per-model runtime check unchanged. A security reviewer must see this was considered (finding A8).
2. The bulk projector deliberately does not carry `motionProfile` (the bulk skill has no attached start frame to ground `start_facing`).
3. `repairShotImage` anchoring was deferred (finding A6 — riskiest change, smallest gain).
4. Both flags ship **OFF**; no migration; no new paid generation.

---

## 11. Exit criteria — merge blocker checklist

Mapping plan §6.3 items 1–7 plus this section's own deliverables:

- [ ] **1.** Gate A green with fail-set `{}` (266/266, or the recorded higher count if sections 06/07 added tests).
- [ ] **2.** Gate B final fail-set is a subset of `baselines/gate-b-failset-after.txt` with **zero** new names; every triaged name documented.
- [ ] **3.** All new pure-module suites green (`shared/verticalDramaSeries/__tests__/motionProfile.test.ts`, `sceneContinuity.test.ts`).
- [ ] **4.** D1 parity suite green — every touched prompt builder byte-identical with both flags off **and** with both explicitly false.
- [ ] **5.** Every real-**file** skill gate green (sections 06, 07, 08, 09, 11's start-frame-render clause), each asserting its `skill.md` / `SKILL.md` twins byte-identical — except `vertical-drama-full-story-architect`, which has **no** uppercase twin and whose test asserts that absence.
- [ ] **6.** `typecheck-after.txt` adds no lines over `typecheck-before.txt`.
- [ ] **7.** Manual smoke §9 executed on the internal tenant, with §9.3 step 10 (anchors present before any approval) explicitly confirmed.
- [ ] **8.** D2 both-flags-on suite green, including the 2×2 matrix and the composed off/off equality.
- [ ] **9.** D3 offline gate suite green; live suite **skipped** by default; live suite executed manually at least once and its report `passed: true`, recorded in `verification-report.md`.
- [ ] **10.** `npm run build:deploy` succeeds.
- [ ] **11.** Runbook committed; specs updated; PR description carries the four call-outs.
- [ ] **12.** Both flags still default `false` in `FEATURE_FLAG_DEFAULTS`; `areVerticalDramaP1FeatureFlagsRegistered()` returns true.

---

## 12. Known limitations carried into P2 (state them; do not fix them here)

| Limitation | Why it is acceptable in P1 |
|---|---|
| Re-approving an earlier shot does not regenerate later shots that anchored to its previous version (**no cascades**) | Deliberate credit protection. P2's continuity QC surfaces the mismatch. |
| The anchor provenance badge cannot tell the user the referenced image has since changed | Phrased as provenance ("สร้างโดยอ้างอิงภาพช็อต N"), not a live claim (finding A7). |
| Bulk-generated clips get no `motionProfile` | The bulk skill has no attached start frame to ground `start_facing`; a profile there would be a guess. |
| `repairShotImage` does not attach a scene anchor | Deferred (finding A6). A repair already holds the strongest continuity reference — the shot's own image. |
| The judge's new dimension is scored but `scores[]` is never read by code; `pickBetterCandidateByHardFacts` is unchanged | No language-independent deterministic check exists (VD prompts are Thai *or* English), and a fake one is worse than none (finding A4). |
| One Scene Visual State per location per episode | `timeJumpSuspected` is the escape hatch that surfaces the case where one is not enough, without pretending to model it. |
| Vision-token cost rises on start-frame authoring calls that carry an anchor (cap 6→7) | Only under the flag, only on shots that actually have an anchor (finding A5). |

---

## 13. Risks specific to this section

| Risk | Mitigation |
|---|---|
| Fixtures "captured" on the branch instead of at the merge-base ⇒ the parity proof is circular and worthless | `manifest.json` records the base sha and param-set hash; a test asserts the hash still matches; capture runs only in a worktree at that sha (§5.2) |
| A red parity case gets "fixed" by editing the fixture | Explicitly forbidden (§5.4). Fixture edits must appear in the diff as a **recapture** with a new manifest sha, or the reviewer rejects the PR |
| Gate B triage rationalizes a new name as "just the cascade" | Mandatory isolation re-run (§8.3 step 1); a name that fails in isolation is a regression, full stop |
| Counting instead of set-diffing | Report template requires the diff, not the counts; counts are recorded as commentary only |
| Live gate accidentally enabled in a sweep | Env value must be exactly `"1"`; the offline suite asserts the skip engages under the default env; never referenced from `package.json` |
| Live gate spends more than expected, or triggers a paid render | Suite scope is authoring calls only (§7.4); run on the internal tenant; verify `provider_usage_log` after the run |
| Manual smoke performed on an episode that already has approvals ⇒ risk A1 goes undetected | §9.1 step 3 requires a fresh sub-episode with nothing approved |
| Restarting `smartspec-web.service` while another agent edits server files | Coordinate before §8.6; this section is the last to land, so announce the restart |
| A production source edit sneaks into this section | §3: section 14 modifies no production file. Any needed fix re-opens its owning section |

---

## 14. Commits

Keep the verification artifacts separable from the test code:

```
test(vertical-drama): flag-off parity harness + both-flags-on joint suite for VD P1
test(vertical-drama): first VD real-LLM gate (pure evaluator + offline suite + opt-in live suite)
docs(vertical-drama): VD P1 rollout runbook, spec status, and verification report
```

The branch merges with both flags `false`. Enabling is a per-tenant operation performed after merge, one flag at a time, internal tenant first.
