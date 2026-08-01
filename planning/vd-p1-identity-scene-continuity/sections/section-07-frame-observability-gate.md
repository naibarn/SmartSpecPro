# section-07-frame-observability-gate

## Current-worktree override (binding)

All widened request/validator gates require the motion flag plus an explicit runner
activation fact. Flag-off retains the current two-reference threshold and DB-read
shape; flag-on widens to one. Volunteered fields while flag-off are ignored.

**Step:** 2 (Feature 137 P1) · **Flag:** `verticalDramaMotionContracts` (default `false`)
**Depends on:** section-02 (feature flags) · **Parallel with:** section-06, section-09 · **Blocks:** section-08
**All paths relative to `apps/web/`.** Test command: `cd apps/web && npx vitest run <file>`

---

## 1. Why this section exists

Feature 137's motion contract (section-08) can only clamp motion if the authoring LLM has
first **declared how observable each face is** in the attached start frame. Today the
per-shot video-prompt skill already returns a `frame_analysis` vision reading — but it is
only a left↔right *position map*, and it is only ever requested when a shot has **2 or more**
character reference images.

Two consequences, both of which this section fixes:

1. A solo-character shot — the single most common identity-drift case, because there is no
   second face to disambiguate and the model is free to reinterpret the one face it has —
   never produces any frame reading at all.
2. Even if the skill volunteered observability fields today, they would be **silently
   deleted**: `normalizeFrameAnalysis` rebuilds a fresh `{ name, position }` object per
   person and drops everything else (it already discards the *documented* `note` field).

This section delivers the **data channel only**. The rules that consume it (motion contract
wording, anti-morph negatives, judge dimension, fact-sheet summary) are section-08.

---

## 1b. MERGED CONTRACT with section 06 — read this BEFORE writing any code

Sections 06 and 07 are marked parallel and both edit the **same** exported
function, the **same** params interface and the **same** two skill files. Left as
originally written they specified *incompatible* signatures. This block is the
single reconciled contract; it supersedes any conflicting wording later in either
section. It is duplicated verbatim in section 06 §1b — if you change one, change both.

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
`GenerateVerticalDramaShotVideoPromptParams`, as §3.6 of this section states. The
speaker-switch and both judged param interfaces already `extend` it. Section 06
§7.1's instruction to also declare it on the speaker-switch interface is
**superseded**.

**4. Gate A test policy — binding on both sections.** Gate A is the 266/266
zero-tolerance baseline section 14 §8.2 diffs against. **Neither section adds test
cases to a Gate A file.** This section's §4.1–§4.3 are therefore re-homed:

| Originally in (Gate A file) | Now goes to (new file) |
|---|---|
| `verticalDramaShotVideoPromptGeneration.test.ts` (§4.1) | `server/services/__tests__/verticalDramaFrameObservability.test.ts` |
| `verticalDramaEpisodes.generateShotVideoPrompt.test.ts` (§4.2) | `server/routers/__tests__/verticalDramaEpisodes.frameObservabilityGate.test.ts` |
| `verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts` (§4.3) | same new router file |
| `verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` (§4.4) | `server/services/__tests__/verticalDramaMotionContractRealSkillFile.test.ts` (shared with 06) |

Copy each source file's mock header into its new home. The **one** permitted Gate A
edit is the mechanical param rename inside
`verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts:186-192`
(`hasEstablishedCharacters` → `frameAnalysisRequested`), which changes no assertion
count. **Gate A stays exactly 266/266** — this section's §9 done-criterion is
therefore literally true, not approximately true.

**5. Merge order.** Land **this section first** (it owns the rename and the
two-boolean split), then rebase 06 onto it. Re-run both sections' byte-identical
proofs after the rebase.

**6. Skill-file serialization.** `skills/vertical-drama-shot-video-prompt/skill.md`
and its `-subshots` twin are edited by 07 (observability fields), then 06
(`motion_profile`), then 08 (motion-contract rules). One at a time; copy lowercase →
`SKILL.md` after each.

---

## 2. Ground truth anchors (verified at HEAD `941547ff1` — re-verify line numbers before editing)

| Thing | Anchor |
|---|---|
| RUNNER | `server/services/verticalDramaVideoMotionPromptGeneration.ts` |
| ROUTER | `server/routers/verticalDramaEpisodes.ts` |
| Zod `frame_analysis` | RUNNER `:1187-1203`, inside `shotVideoPromptOutputSchema` (`:1133-1205`, ends `.passthrough()`) |
| REQUEST line (`frame_analysis: REQUIRED`) | RUNNER `:1328-1330`, inside `buildTargetVideoModelFactBlock` (`:1312-1335`, **exported**) |
| Normalizer | `normalizeFrameAnalysis` RUNNER `:1421-1440` |
| Result field (single) | RUNNER `:1808`, stamped `:2370` |
| Result field (speaker-switch twin) | RUNNER `:2474`, stamped `:2932` |
| Persisted clip type | `shared/verticalDramaSeries/contracts.ts:971-974` |
| Gate site 1 | RUNNER `:2143` — `generateVerticalDramaShotVideoPrompt` |
| Gate site 2 | RUNNER `:2709` — `generateVerticalDramaShotVideoPromptSpeakerSwitch` |
| Gate site 3 | RUNNER `:3361` — `generateJudgedVerticalDramaShotVideoPrompt` |
| Gate site 4 | RUNNER `:3570` — `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch` |
| Gate site 5 (the real upstream gate) | ROUTER `:14367-14376` — `(frame?.requiredCharacterRefs?.length ?? 0) >= 2 ? await resolveShotVideoPromptCharacterReferenceImages(...) : undefined` |
| Split-path generator call (always ≥2 by construction — **no gate**, flag threading only) | ROUTER `:6594` inside `generateAndPersistSplitShotVideoPrompt` |
| Bulk pack call — **must stay `false`** | RUNNER `:951` (`hasEstablishedCharacters: false`; the pack skill has no `frame_analysis` contract) |
| Skill JSON contract | `skills/vertical-drama-shot-video-prompt/skill.md:68-77` · subshots twin `skills/vertical-drama-shot-video-prompt-subshots/skill.md:96-105` |
| Skill teaching section | `…/skill.md:140-175` (`## FRAME ANALYSIS FIRST — MANDATORY …`) · twin `:146-…` |
| Validator that reads `frame_analysis` | `findPositionAnchorIssues` RUNNER `:1381-1408` |
| Judge fact sheet builder | `buildCandidateFactSheet` RUNNER `:3061-3100` |
| Vision images array | `buildShotVideoPromptVisionImages` RUNNER `:1235-1263` |

Facts you can rely on and must not re-derive:

- `shotVideoPromptOutputSchema` is `.passthrough()` and the per-person object is
  `.passthrough()` too — **an LLM emitting observability fields today already validates and
  is then thrown away by the normalizer.** That is exactly why "the skill was taught it" is
  not evidence that anything works.
- The three clip persist literals (ROUTER `:14699`, `:14738`, `:6799`) each write
  `frameAnalysis: result.frameAnalysis` — the **whole object**. Widening the object's shape
  flows through automatically. **Do not touch those literals in this section**; that is
  section-06's job for `motionProfile`.
- `shotVideoCharacterIdentityMapBlock` (ROUTER `:14153`) is built for **every** shot,
  including solo shots — it is not gated on `>= 2`. Only the reference *portraits* are.

---

## 3. Design

### 3.1 Two booleans, not one (decision — do not collapse them)

`hasEstablishedCharacters` currently does **two** jobs:

- it gates the `frame_analysis: REQUIRED` **request** line (`buildTargetVideoModelFactBlock`);
- it is threaded into `findPositionAnchorIssues` / `buildCandidateFactSheet` as the
  **validator** signal that makes "`frame_analysis.people` is missing or empty" a defect.

If you widen the single variable to `>= 1`, a flag-on **solo** shot with native-audio
dialogue whose model omits `frame_analysis` now trips the position-anchor defect and spends
the corrective-retry budget — an extra paid LLM call per shot. The plan's promise for this
work is explicitly **"zero new LLM calls."** Weak models omitting requested fields is a
known, recurring failure class in this pipeline, so this would not be a rare edge.

Therefore:

| Boolean | Meaning | Feeds |
|---|---|---|
| `frameAnalysisRequested` | `motionContractsEnabled ? refs >= 1 : refs >= 2` | `buildTargetVideoModelFactBlock` (the request) |
| `hasEstablishedCharacters` | **unchanged** `refs >= 2` | `findPositionAnchorIssues`, `buildCandidateFactSheet` (the validation) |

Requesting more than you validate is the safe direction and preserves the invariant
`findPositionAnchorIssues`'s doc comment already states — *never flag issue (1) for a shot
the skill was never asked for `frame_analysis`*. Position anchoring is about multi-character
speaker attribution, which genuinely does not apply to a solo shot, so this split is
semantically correct rather than merely conservative. **Update both doc comments** (they
currently assert the two signals are the same variable) as part of the change.

### 3.2 Fact-block shape

`buildTargetVideoModelFactBlock` is exported and covered by the real-skill-file gate test.
Rename its `hasEstablishedCharacters` param to `frameAnalysisRequested` (the name is now a
lie) and add one **optional** observability param that defaults to off, so every omitted-arg
call reproduces today's output byte-for-byte:

```ts
export function buildTargetVideoModelFactBlock(params: {
  family: VideoPromptModelFamily;
  modelId: string;
  modelName?: string;
  maxReferenceImages?: number;
  /** RENAMED from `hasEstablishedCharacters` — under `verticalDramaMotionContracts`
   *  this is `refs >= 1`, not `refs >= 2`. Gates the `frame_analysis: REQUIRED` line. */
  frameAnalysisRequested: boolean;
  /** Flag-gated. Appends the observability request line directly beneath
   *  `frame_analysis: REQUIRED`. Omitted/false ⇒ output byte-identical to today. */
  frameObservabilityRequested?: boolean;
}): string
```

Call sites to update: RUNNER `:951` (pack → `frameAnalysisRequested: false`, never
observability), `:2149`, `:2715`, `:3362`, `:3571`, plus the one literal in
`verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts:186-192`. That test edit is
mechanical and Gate A stays 266/266.

Proposed request line (exact wording is the implementer's, but the literal section name it
cites **must** match the skill's real header — that is what the taught-not-wired gate test
asserts on both sides):

```
- frame_observability: REQUIRED — also fill the per-person observability fields
  (facing, eyes_visible, occlusion, face_size, overlapped_by_other_face) and the sibling
  faces_separated flag inside frame_analysis, per the skill's "FRAME ANALYSIS FIRST" section.
```

Position: immediately after the `frame_analysis: REQUIRED` entry, before the closing
`Apply the skill's "MODEL-FAMILY SHAPING" section…` line. Emit via the same
`ternary → null → .filter(Boolean)` idiom the existing line uses.

### 3.3 Contract fields (skill-side vocabulary)

Extend the existing per-person object; add one sibling boolean. All optional, all lenient:

```jsonc
"people": [{
  "name": "…", "position": "left|center-left|center|center-right|right",   // existing
  "facing": "frontal|three_quarter|profile|back_of_head|not_visible",
  "eyes_visible": "both|one|none",
  "occlusion": "none|partial|heavy",            // hair, object, or the other actor
  "face_size": "large|medium|small|tiny",
  "overlapped_by_other_face": false
}],
"position_source": "image|image_prompt_text",                              // existing
"faces_separated": true
```

The `facing` vocabulary is deliberately identical to `motion_profile.start_facing`
(section-04 / section-06) so the skill reasons in one vocabulary. **Do not import
section-04's tuples here** — section-07 does not depend on section-04, and this file's
established convention (documented at RUNNER `:1173-1186`) is that `frame_analysis` values
are *never* enum-validated in TypeScript. The enums live in `skill.md` as authoring
guidance; TS stays string-lenient. This also removes any drift risk between two enum copies.

Zod: add the five optional fields to the per-person object and the top-level
`faces_separated`, all `z.string().optional()` / `z.boolean().optional()`. The object stays
`.passthrough()`.

### 3.4 Normalizer

`normalizeFrameAnalysis` keeps everything it does today (trim to 80 chars, drop people with
no usable name/position, cap at 6) and additionally carries the observability fields through:

```ts
function normalizeFrameAnalysis(
  raw: ShotVideoPromptOutput["frame_analysis"],
): {
  people: Array<{
    name: string;
    position: string;
    facing?: string;
    eyesVisible?: string;
    occlusion?: string;
    faceSize?: string;
    overlappedByOtherFace?: boolean;
  }>;
  positionSource?: string;
  facesSeparated?: boolean;
} | undefined
```

Rules (mirror the existing `positionSource` handling exactly — it is the precedent in this
same function):

- Strings: trim, lowercase, cap at 24 chars; omit the key when empty/non-string. **Never**
  enum-validate, never throw.
- Booleans: `=== true` → `true`, `=== false` → `false`, anything else → key omitted.
- Everything remains additive: absent observability ⇒ the returned object is
  **`toEqual`-identical to today's**, which is what keeps the four existing
  `frameAnalysis` assertions in `verticalDramaShotVideoPromptGeneration.test.ts` green.
- No flag parameter. It is a pure function; it preserves what it is given. The flag governs
  whether the fields are ever *requested*.

### 3.5 Type propagation

Same widened shape in four places (extract a single exported/local type alias rather than
copy-pasting the literal four times):

1. `GenerateVerticalDramaShotVideoPromptResult.frameAnalysis` — RUNNER `:1808`
2. `GenerateVerticalDramaShotVideoPromptSpeakerSwitchResult.frameAnalysis` — RUNNER `:2474`
3. `VerticalDramaMotionPromptPack["clips"][number].frameAnalysis` —
   `shared/verticalDramaSeries/contracts.ts:971-974` (extend the doc comment: new fields are
   `undefined` for every clip generated before this change, and whenever the flag was off)
4. The judge-side structural param types RUNNER `:3065` and `:3147` accept the wider object
   unchanged (no excess-property check on a variable) — leave them, but confirm `pnpm check`
   is clean, including the `as ShotVideoPromptOutput["frame_analysis"]` cast at `:3084`.

### 3.6 Gate widening — all five sites, one commit

**Runner (4 sites).** Add `motionContractsEnabled?: boolean` to
`GenerateVerticalDramaShotVideoPromptParams`. The speaker-switch and both judged param
interfaces `extend` it (RUNNER `:2426`, `:3287`, `:3498`), so one field reaches all four.
At each of `:2143`, `:2709`, `:3361`, `:3570`, keep `hasEstablishedCharacters` exactly as it
is and add beside it:

```ts
const motionContractsEnabled = params.motionContractsEnabled === true;      // default false
const frameAnalysisRequested =
  (params.characterReferenceImages?.length ?? 0) >= (motionContractsEnabled ? 1 : 2);
const frameObservabilityRequested = motionContractsEnabled && frameAnalysisRequested;
```

**Router (1 site).** In `generateShotVideoPrompt` (ROUTER `:13814`), resolve the flag once
next to the existing `resolveVerticalDramaRetentionHooksFlag` call (`:13909`) using
section-02's `resolveVerticalDramaMotionContractsFlag(tenantId)`, then widen the threshold at
`:14367-14376` to `>= (motionContractsEnabled ? 1 : 2)` and pass `motionContractsEnabled`
into the `generateJudgedVerticalDramaShotVideoPrompt` call at `:14378`.

**Router split path (threading only, not a gate).** Add `motionContractsEnabled: boolean` to
`generateAndPersistSplitShotVideoPrompt`'s args (ROUTER `:6450-…`) and forward it to
`generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch` at `:6594`. That path's reference
set is ≥2 by construction, so its `frameAnalysisRequested` is already true — the flag is only
what turns the observability request line on.

Why all five together: widening the runner alone is a **no-op** (the router passes
`undefined`); widening the router alone silently raises vision-token cost on every solo shot
with no benefit.

### 3.7 Skill files (contract declaration only)

Edit `skills/vertical-drama-shot-video-prompt/skill.md` **and** its
`-subshots` twin:

- JSON contract block (`:68-77` / `:96-105`): add the five per-person fields and
  `faces_separated`, each annotated `(optional — ONLY when the caller states
  frame_observability: REQUIRED)`. This mirrors the shipped `audio_direction` convention at
  `:67` — the skill file is the system prompt for *everyone*, so any new output must be
  explicitly conditional on a caller request or the flag-off path changes behavior.
- `## FRAME ANALYSIS FIRST` section (`:140-175` / `:146-…`): one short paragraph defining
  each value, stating that the fields are grounded in the **attached image** (never guessed
  from prompt text), and that they are returned **only** when the caller requests
  `frame_observability`. Keep it compact — the judged path pays this prompt up to three
  times per shot.
- **Do not** add motion-contract rules here. That is section-08.
- **Do not** touch `skills/vertical-drama-video-motion-prompt-pack/skill.md` — the bulk pack
  has no `frame_analysis` contract and P1 deliberately keeps that asymmetry.
- After editing, copy the lowercase file over `SKILL.md` so the twins are **byte-identical**
  (the loader reads lowercase first; divergent twins are a known recurring bug in this repo).

---

## 4. Tests first (TDD)

Write these **before** touching implementation. Stubs + names only; assertions are the
implementer's. Run everything from `apps/web`, environment `node`.

### 4.0 Baselines (capture before any edit)

Re-use section-01's captured Gate A / Gate B artifacts. Gate A (7 suites, 266/266) must stay
green through this section — the only permitted Gate A change is the mechanical param rename
inside `verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts`.

### 4.1 `server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts` (extend)

Add a nested `describe("frame observability + gate widening (F137 P1)")` inside the existing
`model-family-aware…` block, with its own `beforeEach` that **`mockReset()`s** any mock it
queues `…Once` values on (`vi.clearAllMocks()` does not drain `mockReturnValueOnce` queues —
one early throw otherwise poisons the rest of the file).

```
Test: flag OFF + 1 character reference ⇒ user prompt does NOT contain "frame_analysis: REQUIRED"
Test: flag OFF + 2 character references ⇒ contains it exactly once (unchanged from today)
Test: flag OFF ⇒ never contains "frame_observability: REQUIRED" (regardless of ref count)
Test: flag ON + 1 character reference ⇒ contains BOTH request lines, each exactly once
Test: flag ON + 0 character references ⇒ contains NEITHER (>=1 means at least one)
Test: byte-identical proof — flag-on prompt with both new/changed lines removed equals the
      flag-off prompt for the same params (template:
      verticalDramaStartFrameGeneration.referenceFrameMode.test.ts)
Test: normalizeFrameAnalysis preserves facing/eyes_visible/occlusion/face_size/
      overlapped_by_other_face per person and top-level faces_separated (camelCased)
Test: ...still drops entries with an empty name or position, still caps at 6 people
Test: ...omits an observability key whose value is a non-string / empty string / non-boolean
      (never throws — weak-model garbage in, clean object out)
Test: ...unknown enum-ish values are PRESERVED verbatim (lowercased, trimmed) and never rejected
Test: ...a response with no observability fields yields an object toEqual-identical to today
      (regression guard for the 4 existing frameAnalysis assertions)
Test: NO NEW LLM CALLS — flag ON, solo shot, native-audio dialogue, response omits
      frame_analysis entirely ⇒ exactly ONE execute call (the position-anchor corrective
      retry must NOT fire; this is the §3.1 two-boolean split's whole point)
Test: flag ON, 2+ refs, response omits frame_analysis ⇒ the existing single corrective
      retry still fires (validator behavior for established characters is UNCHANGED)
Test: the speaker-switch twin produces the same request lines and the same normalized shape
```

### 4.2 `server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts` (extend)

`getTenantFeatureFlags` is mocked as a bare `vi.fn()` (resolves `undefined`), so the
resolver's optional chaining must make that mean "flag off". Queue one `mockReturnValueOnce`
per `db.select()` call site **in order**.

```
Test: flag OFF + frame.requiredCharacterRefs.length === 1 ⇒ character reference images are
      NOT resolved (characterReferenceImages passed to the generator is undefined)
Test: flag OFF ⇒ the mutation makes exactly the same number of db.select calls as today
      (explicit count assertion — this is the cost-regression guard)
Test: flag ON + 1 required character ref ⇒ resolver IS called and the generator receives a
      1-entry characterReferenceImages array
Test: flag ON + 0 required character refs ⇒ resolver is NOT called
Test: flag ON/OFF ⇒ motionContractsEnabled is threaded into the generator params
      (false when the tenant flag record is undefined — fail-closed)
Test: the flag is resolved exactly ONCE per request (no per-shot re-read)
```

### 4.3 `server/routers/__tests__/verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts` (extend)

```
Test: motionContractsEnabled is forwarded to the speaker-switch generator
Test: the split path's reference-image resolution is UNCHANGED by the flag (always resolved)
```

### 4.4 `server/services/__tests__/verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts` (extend)

Real-file gate — reads the real `skill.md` via `vi.importActual("fs")` and **mirrors** the
loader's path formula rather than importing it.

```
Test: skill.md and SKILL.md remain byte-identical twins (both skills — existing test, must stay green)
Test: the JSON contract declares "eyes_visible", "occlusion", "face_size",
      "overlapped_by_other_face" and "faces_separated" (both skills)
Test: the contract marks them conditional on the caller's frame_observability request
      (assert the literal conditional phrasing, so a future edit cannot make them unconditional)
Test: taught-not-wired guard — buildTargetVideoModelFactBlock({ frameObservabilityRequested: true })
      output cites the EXACT section header string the real skill.md contains
Test: buildTargetVideoModelFactBlock with frameObservabilityRequested omitted produces output
      identical to the same call with it explicitly false
Test: the bulk pack skill still declares NO "frame_analysis" (assert absence — P1 asymmetry)
```

---

## 5. Implementation order

1. Land the tests from §4 (red).
2. `contracts.ts` — widen the persisted `frameAnalysis` type + doc comment.
3. RUNNER — zod fields, `normalizeFrameAnalysis`, the two result-interface types.
4. RUNNER — `buildTargetVideoModelFactBlock` param rename + new optional line; update all
   five internal call sites incl. the pack site at `:951`.
5. RUNNER — `motionContractsEnabled` param + the three derived locals at the four gate sites;
   update the `findPositionAnchorIssues` / `buildTargetVideoModelFactBlock` doc comments to
   describe the new two-boolean split.
6. ROUTER — flag resolution, gate widening at `:14367`, threading at `:14378` and `:6594`
   (+ `generateAndPersistSplitShotVideoPrompt` args).
7. Skill contract edits + `SKILL.md` twin sync (both skills).
8. Green: the four suites above, then full Gate A, then Gate B fail-set diff, then `pnpm check`.

---

## 6. Flag-off byte-identical requirements (tested, not assumed)

With `verticalDramaMotionContracts` off:

- `buildTargetVideoModelFactBlock` output is character-for-character today's.
- The router resolves character reference images at `>= 2` only, and issues the same number
  of `db.select` calls.
- The vision images array (`buildShotVideoPromptVisionImages`) is unchanged — a solo shot
  still sends the single unlabeled start frame.
- `normalizeFrameAnalysis` returns a `toEqual`-identical object (the new keys are only ever
  present when the model was asked for them).
- Persisted clips gain no new keys.

---

## 7. Traps

| Trap | Guard |
|---|---|
| Widening only the runner | No-op — the router passes `undefined`. All five sites, one commit. |
| Widening only the router | Silent vision-token cost on every solo shot, zero benefit. |
| Collapsing the two booleans | Solo shots start burning corrective retries; breaks the "zero new LLM calls" promise. See §3.1. |
| Extending the zod but not the normalizer | Fields validate (`.passthrough()`) and are then deleted. The zod change alone proves nothing. |
| Enum-validating in TS | Weak models return sloppy enums; a rejection here would silently blank the field. Stay string-lenient, exactly like `positionSource`. |
| Editing only `skill.md` | The loader prefers lowercase, but a divergent `SKILL.md` is a recurring live bug. Copy the twin; the gate test enforces it. |
| Unconditional skill contract fields | `skill.md` is the system prompt for every tenant, flag or not. New outputs must be conditional on the caller's request line. |
| Touching the bulk pack skill/projector | P1 deliberately keeps the asymmetry (no start frame ⇒ no grounded observability). Leave `hasEstablishedCharacters: false` at RUNNER `:951`. |
| Touching the three clip persist literals | They already write the whole `frameAnalysis` object. Section-06 owns those literals for `motionProfile`; editing them here creates a merge conflict. |
| `vi.clearAllMocks()` in a new `beforeEach` | Does not drain `mockReturnValueOnce` queues — use `mockReset()` or one early throw poisons the file. |

---

## 8. Coordination with neighbouring sections

- **section-02** supplies `resolveVerticalDramaMotionContractsFlag(tenantId)` (optional
  chaining, fail-closed). Do not add a second resolver.
- **section-06** runs in parallel and touches the **same** `skill.md` JSON contract block
  (adding `motion_profile`) and the **same** `GenerateVerticalDramaShotVideoPromptParams`
  interface (needing the same `motionContractsEnabled` param) and the same router threading
  at `:14378` / `:6594`. Whichever lands first adds `motionContractsEnabled` and the router
  threading; the second **reuses** it — never add a second flag param or a second resolver
  call. Serialize the `skill.md` / `SKILL.md` edits between the two sections; do not edit
  that file concurrently.
- **section-08** consumes what this section produces: the motion-contract rules, the
  anti-morph negatives, the judge dimension, and the per-character observability summary in
  `VdVideoPromptCandidateFactSheet`. It also extends the real-file gate further. Do not
  pre-implement any of it here.
- **section-14** re-proves both flag-off byte-identical output and the Gate A/B fail-set
  containment for everything in Step 2.

---

## 9. Done when

- [ ] All §4 tests green.
- [ ] Gate A still 266/266 (only the mechanical param-rename edit in the real-skill-file test).
- [ ] Gate B fail-set is a subset of the section-01 baseline with **zero** new entries.
- [ ] `pnpm check` reports no new TypeScript errors attributable to this section.
- [ ] `skill.md` ≡ `SKILL.md` for both `vertical-drama-shot-video-prompt` and its `-subshots` twin.
- [ ] Flag off ⇒ prompt text, `db.select` count, vision array, and persisted clip shape are all provably unchanged.
- [ ] Flag on, solo shot ⇒ both request lines present, observability round-trips into
      `result.frameAnalysis`, and the call count is still one per candidate generation.
