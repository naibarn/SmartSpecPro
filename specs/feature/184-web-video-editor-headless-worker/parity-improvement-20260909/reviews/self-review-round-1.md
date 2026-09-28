# Deep-plan self-review — parity improvement

Review mode: self-review (Phase A checklist, Phase B adversarial pass and
Phase C section cross-consistency pass). Reviewed on 2026-09-09 against
`spec.md`, `claude-spec.md`, `claude-interview.md`, `claude-research.md`,
`claude-plan.md`, `claude-plan-tdd.md` and all ten section files.

## Round 1 — completeness against the eighteen requests

| Check | Result | Evidence |
|---|---|---|
| Bin one/multiple R2 upload and default tab | PASS | Section 02 session protocol, partial states and default Bin |
| Keyframes/pin/free position | PASS | Section 03 reducer, pin/lock distinction, camera tracks |
| Quick Silence Cut and audio extraction | PASS | Section 04 review/apply CAS and derived asset lineage |
| AI Music, recording and speaker plan | PASS | Section 05 preflight, device matrix and confidence review |
| Blur tracking | PASS | Section 06 privacy track and fail-closed gate |
| Auto/Manual/GPU render and MP3 | PASS | Section 07 mode admission and audio-only artifact |
| Subtitle, preview modes and frame capture | PASS | Sections 05, 07 and 08 |
| Detailed ruler and many tracks | PASS | Section 08 adaptive ticks and 20-track evidence |
| Ducking/waveform presets | PASS | Section 04 bounded mix map/filter compiler |
| Stock SVG and AI code overlays | PASS | Section 09 catalog, sanitizer and sandbox |
| Clear Transform versus Keyframes and image/video pan/zoom | PASS | Section 03 terminology and shared evaluator |
| Dashboard/Worker Jobs connection | PASS | Plan and Section 10 route/menu contract |

## Round 2 — adversarial implementation review

Findings and fixes applied directly to the plan:

1. **Gap:** A plan covering individual features could still omit an existing
   toolbar/panel. **Fix:** Added a parity ledger with the complete panel and
   toolbar inventory in `claude-plan.md` and Section 10; an unaccounted row is a
   release blocker.
2. **Gap:** Dashboard navigation was implied by the queue route but not an
   explicit acceptance check. **Fix:** Added Dashboard editor/queue link and
   query-preserving legacy deep-link tests to Section 10.
3. **Gap:** Large upload behavior could regress to the current whole-file
   Buffer path. **Fix:** Section 02 now sets a memory threshold rule, bounded
   part concurrency, resume metadata and a stop condition.
4. **Gap:** Preview and Worker could use different transform semantics. **Fix:**
   Section 03 requires shared fixtures and exact-frame browser/Worker comparison.
5. **Gap:** Privacy tracking could silently render clear frames. **Fix:**
   Section 06 requires missing/low-confidence intervals and fail-closed
   preflight.
6. **Gap:** “All microphones” is not a browser guarantee. **Fix:** Section 05
   defines an explicit secure-context device/MIME matrix and forbids an
   unverified universal-support claim.

## Round 3 — interface and dependency consistency

| Check | Result | Notes |
|---|---|---|
| Shared envelope names/fields | PASS | `MediaJobEnvelopeV1`, `revisionId`, `planHash`, `outputRoles` used consistently |
| Upload session producer/consumer | PASS | Section 01 contract; Section 02 init/complete/abort/resume |
| Analysis review/apply semantics | PASS | Sections 01, 04, 05, 06, 10 all require expected revision |
| Transform/keyframe ownership | PASS | Section 03 owns reducer; 06 uses separate privacy namespace |
| Render provider ownership | PASS | Section 07 owns admission; Worker owns providers; Section 10 owns results |
| Route/menu naming | PASS | `/worker-jobs` canonical; `/render-jobs` alias; Dashboard explicit |
| Migration ordering | PASS | contracts before feature schema; Section 10 additive persistence |
| UI contract coverage | PASS | all ten files contain required headings; checker reports 10/10 |
| Overlapping file ownership | PASS | each section lists bounded primary paths; shared changes go through Section 01 |

## Scorecard

- Structural integrity: **PASS** (10 manifest entries, 10 section files, index
  and TDD mirror present).
- Completeness vs spec: **PASS** (18/18 mapped; toolbar/panel ledger added).
- Implementability: **PASS** (owners, data flow, APIs, states, tests and stop
  conditions are explicit; exact schema names remain an implementation task).
- Internal consistency: **PASS** (shared envelope, revision CAS and route names
  match across sections).
- Edge cases and safety: **PASS** (partial upload, stale results, no audio,
  denied mic, low-confidence privacy, checksum/QC and sandbox failure covered).

No unresolved high-confidence gap remains. Optional choices that still require
product/runtime evidence are provider/model selection, exact R2 size threshold,
GPU profiles, catalog licensing source and retention duration; these are
explicitly configuration or environment gates, not hidden assumptions.
