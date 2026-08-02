# TDD Companion — VD visual consistency P1

Write each test group before its implementation wave. Use Vitest from `apps/web`;
server/shared tests use Node and React component tests use jsdom. Reset queued mocks
with `mockReset`, not only `clearAllMocks`.

## Wave 0 — baseline

- Recapture exact focused suite file lists and fail sets at current HEAD.
- Record the known four-execution fallback versus stale two-execution assertion.
- Capture TypeScript error identity by file/code/message.
- Test artifacts record command, SHA, date and exit code.

## Wave 1 — foundation

### Flags

- Each of four new flags appears in the interface, allowlist, default map and admin
  group and defaults false.
- Legacy preset flag and all new flags remain independent.
- Neighbor child-on/scene-parent-off produces off behavior plus one bounded warning.
- All omitted/false leaves request DB reads and service params unchanged.

### Prompt budget

- DB selected-model cap wins; static registry is fallback; missing cap uses the VD
  default; malformed/negative values are rejected.
- Absolute ceiling is enforced without mechanical truncation.
- Provider/model rows without new metadata preserve current behavior.
- UI counters and runtime guards agree on the effective selected-model budget.

### Pure modules

- Look resolver covers legacy/new envelope × preset flag × look flag × every mode,
  malformed JSON, lineage governance and none.
- Motion resolver covers valid/missing/invalid profiles; missing/invalid leaves risk
  absent and cannot produce `i2v_ok` as though low.
- Risk floor covers every enum boundary and never lowers skill risk.
- Scene grouping applies overrides; membership hash is stable and changes for member,
  location asset or canonical-summary changes; stale state never renders a lock.
- Anchor selection covers approved/latest-successful precedence and rejects failed,
  rejected, stale-plan, cross-scene and current-shot assets.

## Wave 2 — Feature 139

### Persistence/resolver

- Mode transitions preset/AI-mix/lineage → genre → manual → inherit → none preserve
  inherited snapshot and unrelated bible keys and increment revision once.
- Stale revision returns conflict; fresh row merge preserves concurrent story edits.
- Catalog identity is server-resolved; client reference ids are dropped/revalidated.
- Create persists before background generation; child lineage starts revision 1.
- Flag matrix prevents genre/manual/lineage leakage through the legacy preset flag.

### Prompt ownership

- Authoring paths receive compact register facts without raw fragment arrays.
- Parameterized final-assembler test covers batch, both per-shot modes, reference
  frame, render, repair, grid, portraits and location plates.
- Each normalized positive fragment appears once; negatives merge idempotently.
- A look changed after prompt authoring is applied on the next provider submission.
- All flags off reproduces recaptured prompts/payloads and DB-read shape.

### UI

- Creation/settings/chip tests cover loading, inherited, none, selected, disabled,
  conflict/reload, save error and success.
- Keyboard selection, focus return, labels and error announcements work.
- Browser evidence at 390x844, 768x1024 and 1440x900; no overflow.
- Astryx component/token usage is verified; no raw visual constants are introduced.

## Wave 3 — Feature 137

### Contract/persistence

- Request/activation lines appear only under `verticalDramaMotionContracts`.
- Per-shot and sub-shot parse valid profile; bulk schema remains unchanged.
- Every persistence branch stores profile, effective risk and status.
- Missing/malformed output is scored non-compliant; when all candidates fail, status
  is persisted, risk remains absent and total calls do not exceed current bounded
  fallback behavior.
- A model volunteering fields while flag-off is ignored.

### Observability/skills

- All runner/router gates stay ≥2 flag-off and widen to ≥1 flag-on.
- New optional observability fields normalize without dropping existing fields.
- Real skill files prove explicit activation fact presence/on and absence/off.
- Judge selection reacts to risk/observability without language-dependent substring
  matching.
- P1 adds no additional LLM call or paid render; only bounded token growth.

### Calibration

- Fixed 30-fixture rubric reaches ≥90% medium/high-risk contract compliance.
- Zero high-risk fixture instructs a large hidden-side reveal.
- Missing/invalid status and event telemetry are queryable without prompt text.

## Wave 4 — Feature 138 P1a

### Planner/storage

- Multi-shot eligible scene plans once per membership hash under concurrency and
  charges once.
- Changed membership during the external call discards the result.
- Stale state is marked and never injected; manual state is not overwritten without
  force + expected revision.
- JSONB fresh-row merge preserves unrelated plan fields.
- Planner receives the Feature 139 look and cannot contradict its broad register.
- Props are absent/derived from Feature 140, never independently persisted.

### Failure behavior/injection

- Eligible multi-shot batch/lazy planner failure stops before paid image credits and
  shows retry behavior.
- Explicit single-shot failure continues unlocked with one bounded warning.
- Both image modes, batch and both video builders receive the same compact lock;
  flag-off output is byte-identical.
- Look/scene/motion composition follows frozen precedence and stays within the
  selected-model budget.

### API/UI/security

- Plan/update mutations enforce tenant + owner predicates, strict bounded inputs and
  expected-revision conflicts.
- UI covers absent, loading, stale/replan, manual, conflict, disabled, error and
  success; keyboard/focus and three viewports are verified.
- Audit events contain bounded ids/enums/timing only.

### GA evidence

- At least 30 same-scene pairs across ≥3 episodes reach ≥85% same-place/time
  agreement; manual scene-mismatch regens improve by the declared target.
- P1a evidence does not depend on deferred continuity-QC code.

## Wave 5 — joint P1 gates

- Pure truth table: legacy preset flag + look + motion + scene + neighbor.
- Focused integration: each single flag, child-on/parent-off, all-off parity and
  all-on precedence.
- Refreshed Gate A remains green; Gate B adds no new failing test identity.
- Focused typecheck delta has no new errors in changed surfaces.
- Real-LLM opt-in fixtures emit the newly requested structures.
- Browser smoke: create/change look, regenerate both authoring modes, plan/edit a
  scene and inspect provenance without duplicate fragments.
- Rollback each flag independently and confirm stored data remains recoverable/inert.

## Wave 6 — Feature 138 P1b canary

- Neighbor flag alone with scene parent off changes no scheduling/reference/prompt/
  persistence behavior.
- Anchor is selected and persisted before prompt authoring; prompt and render use the
  identical asset id.
- Deleted, unowned or unavailable anchor fails before paid render and never switches.
- Only shots within one scene serialize; different scenes remain parallel.
- Cap cases drop neighbor before location/identity and emit a bounded capacity event.
- Fresh episode: shot 2 uses shot 1's latest successful current-plan frame.
- Canary verifies p95 latency budget, ≥95% eligible anchor records and zero id
  mismatch before broader rollout.
