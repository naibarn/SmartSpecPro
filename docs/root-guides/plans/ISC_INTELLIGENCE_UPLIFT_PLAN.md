# Intelligence Skill Creator Uplift Plan

## Goal

Upgrade `apps/web/skills/intelligence-skill-creator` from a mostly generative skill scaffold tool into a self-checking skill creation system with one consistent lifecycle:

1. create a skill
2. validate it deterministically
3. improve it against real quality gates
4. apply fixes safely
5. keep outputs aligned with repo skill conventions

This plan assumes one implementation cycle, but splits the work into phases with explicit acceptance criteria so it can be executed without redesign churn mid-stream.

## Current Problems To Solve

1. Create and improve operate on different roots and different layout assumptions.
2. Proposal storage and apply flow are broken because the system mixes JSON full-file patches with legacy unified diff handling.
3. Evaluation quality is too weak; it rewards substring matches instead of valid contracts and useful behavior.
4. Generated artifacts are not validated before being written.
5. Security and dependency guardrails are shallow and inconsistent with the prompts.
6. Output conventions drift from the repo's own skill guidelines, especially around auxiliary files and metadata.

## Target State

ISC should behave like a small build system for skills, not a prompt wrapper.

- One canonical skill layout for create, improve, evaluate, and apply.
- One canonical proposal format.
- Deterministic validators gate every artifact before persistence.
- Evaluator measures contract quality, not just text fragments.
- Improve mode can target skills created by create mode without manual copying.
- Generated skills match the repo's current skill conventions by default.

## Non-Goals

- Rebuilding the SmartAIHub runtime skill engine outside ISC.
- Adding external package execution or arbitrary sandboxed code execution.
- Building a full marketplace ranking system for skill exemplars.

## Implementation Strategy

Deliver in six phases. Earlier phases remove broken contracts first; later phases add intelligence on top of stable plumbing.

---

## Phase 0: Freeze Contracts And Canonical Layout

### Objective

Define one source of truth for skill layout, test locations, metadata files, proposal payloads, and skill root resolution.

### Changes

1. Introduce a canonical ISC contract document in code comments and constants:
   - skill root: `apps/web/skills/{skill-name}/`
   - code entrypoints: `python/skill.py` or `js/skill.js`
   - tests: `tests/tests.json`
   - manifest: `skill.md`
   - schemas: `schemas/input.schema.json`, `schemas/output.schema.json`, `schemas/ui.schema.json`

2. Replace hard-coded legacy fallbacks in registry/evaluator/orchestrator where they conflict with the canonical contract.

3. Add shared path helpers in `isc/registry.py`:
   - `canonical_skills_root()`
   - `canonical_skill_dir(skill_name)`
   - `resolve_skill_files(skill_name)`

4. Make both create and improve operate on the same skill root under `apps/web/skills`.

### Acceptance Criteria

- A skill created by ISC is immediately visible to improve mode without copying files.
- Registry, evaluator, orchestrator, and CLI all resolve the same files for the same skill.
- Legacy support, if retained, is explicitly adapter-based and covered by tests.

### Tests

- Unit test: canonical path resolution for Python skill.
- Unit test: canonical path resolution for JS skill.
- Unit test: newly created skill is discoverable by improve mode.

---

## Phase 1: Repair Proposal And Apply Pipeline

### Objective

Make improve mode usable end-to-end.

### Changes

1. Standardize `PatchProposal` around one format only:
   - `patch_payload`: JSON map of `{relative_path: full_file_content}`

2. Remove all reads/writes of nonexistent `unified_diff`.

3. Rename proposal persistence to reflect actual content:
   - store payload as `.json`
   - store metadata separately as `.meta.json`

4. Replace CLI `apply` implementation:
   - load proposal JSON
   - validate touched paths
   - write replacements through the same safe writer used by improve mode
   - print changed files

5. Update web entrypoint improve summary to describe applied contract correctly.

### Acceptance Criteria

- Improve mode completes without attribute errors.
- Saved proposals can be applied from CLI successfully.
- Applied files match the proposal payload exactly.

### Tests

- Unit test: proposal serialization/deserialization.
- Unit test: apply rejects path traversal.
- Integration test: improve proposal for sample skill can be saved and applied.

---

## Phase 2: Deterministic Validation Layer

### Objective

Prevent bad artifacts from being written just because the LLM returned parseable output.

### Changes

1. Add artifact validators in a new module such as `isc/artifact_validation.py`.

2. Validate `input.schema.json` and `output.schema.json` as JSON Schema documents.

3. Validate `ui.schema.json` against SmartAIHub UI rules:
   - required top-level keys
   - valid sections/fields shape
   - outputMapping covers all rendered fields
   - field types and required attributes align

4. Validate `skill.md` frontmatter:
   - required metadata keys
   - trigger patterns format
   - execution mode aligns with generated language

5. Validate generated code contract statically:
   - required entrypoint signature/module export
   - no banned imports/APIs
   - returns JSON string on primary path

6. Validate `tests/tests.json` structure before TDC and before final write.

7. Add a repair loop:
   - if any artifact validator fails, feed validator errors back to the LLM for a bounded retry
   - fail hard after retry budget is exhausted

### Acceptance Criteria

- ISC never writes malformed schema or malformed tests files.
- Validator failures produce actionable error messages tied to concrete artifacts.
- Create mode exits with `success=false` when contract repair fails.

### Tests

- Unit test: reject malformed input schema.
- Unit test: reject malformed UI schema.
- Unit test: reject `skill.md` with missing frontmatter fields.
- Unit test: reject tests file with wrong structure.

---

## Phase 3: Replace Weak Evaluation With Multi-Dimensional Scoring

### Objective

Make the system optimize for correct and useful skills instead of substring tricks.

### Changes

1. Redesign `tests/tests.json` schema to support structured assertions:
   - `expected_success`
   - `expected_contains`
   - `expected_json_paths`
   - `expected_schema_valid`
   - `forbidden_contains`
   - `expected_status` or similar normalized quality markers

2. Update evaluator to:
   - parse skill output as JSON when applicable
   - validate output against `output.schema.json`
   - check assertion types separately
   - score by dimensions:
     - execution
     - output contract
     - semantic expectations
     - safety failures

3. Emit richer `EvaluationReport`:
   - total score
   - per-test reasons
   - per-dimension failures
   - blocking vs non-blocking findings

4. Update triage and patch strategy logic to consume structured failures instead of raw substring misses.

5. Update TDC loop to use the new evaluator, not only `expected_contains`.

### Acceptance Criteria

- A skill that returns invalid JSON fails evaluation even if substrings match.
- A skill that violates output schema fails evaluation clearly.
- Improve prompts receive specific failure reasons, not only missing substrings.

### Tests

- Unit test: invalid JSON output fails.
- Unit test: valid JSON but wrong schema fails.
- Unit test: forbidden content fails.
- Integration test: sample skill moves from failing to passing under the new evaluator.

---

## Phase 4: Add Real Intelligence To Planning And Improvement

### Objective

Improve skill generation quality with grounded examples and better planning context.

### Changes

1. Add exemplar retrieval from `apps/web/skills`:
   - index metadata from nearby skills
   - choose 1-3 relevant exemplars by tags, triggers, category, and lexical similarity

2. Feed exemplar summaries into planning/code/test generation prompts.

3. Add repo convention hints to planner:
   - keep SKILL/skill manifest concise
   - avoid unnecessary files
   - follow existing schema style
   - match current SmartAIHub UI field vocabulary

4. Improve research loop:
   - prioritize local repo evidence before web research
   - use web research only for domain logic, standards, or external API behavior
   - rank local and external evidence separately

5. Introduce a planning rubric before code generation:
   - clarity of inputs
   - observability of outputs
   - feasibility under runtime constraints
   - dependency compliance
   - testability

6. Reject or repair plans that are too vague to implement deterministically.

### Acceptance Criteria

- Create prompts are grounded by real repo patterns.
- Generated skills stop drifting toward arbitrary file structures.
- Plans with impossible or underspecified logic are flagged before code generation.

### Tests

- Unit test: exemplar selector returns relevant local skills.
- Unit test: planning rubric rejects missing-output plans.
- Snapshot-style test: planner context includes exemplar summaries, not raw large file dumps.

---

## Phase 5: Security And Dependency Hardening

### Objective

Close the gap between stated guardrails and actual enforcement.

### Changes

1. Expand banned operation detection for Python and JS:
   - direct filesystem reads/writes
   - subprocess execution
   - eval/exec or equivalent
   - direct DB clients
   - direct external LLM SDKs/endpoints

2. Replace loose regex-only checks with layered checks:
   - regex prefilter
   - AST-based checks where practical for Python
   - normalized import scanning for JS

3. Remove dependency generation by default.
   - Default rule: generated skills must use stdlib/built-ins only.
   - Only allow dependency generation behind an explicit future capability flag if the runtime truly supports it.

4. Ensure validator and prompts say the same thing about allowed libraries.

5. Add safety findings to evaluation so insecure code cannot “pass” purely by behavior.

### Acceptance Criteria

- Skills with banned capabilities fail before write/apply.
- No generated `requirements.txt` or `package.json` is emitted in the normal path.
- Security failures are visible in both create and improve reporting.

### Tests

- Unit test: detect Python `subprocess`.
- Unit test: detect Python `Path.read_text`.
- Unit test: detect JS `fs.readFile` and child process use.
- Unit test: dependency file generation disabled by default.

---

## Phase 6: Align Outputs With Repo Skill Conventions

### Objective

Make ISC produce skills that match the repo's actual authoring standards.

### Changes

1. Stop generating `README.md` by default.

2. Generate only essential files unless explicitly requested:
   - `skill.md`
   - `schemas/*`
   - code entrypoint
   - `tests/tests.json`
   - optional `agents/openai.yaml` if the platform expects it

3. Add metadata generation for UI-facing skill listing if required by the platform:
   - if `agents/openai.yaml` is in use elsewhere, generate/validate it
   - otherwise omit it deliberately

4. Update prompts and examples in ISC’s own `skill.md` and UI schema text so the tool describes current behavior accurately.

5. Remove stale references to legacy manifest layouts where no longer supported.

### Acceptance Criteria

- Newly generated skills match the repo’s preferred minimal file set.
- ISC documentation and behavior match each other.
- Skill outputs are cleaner and require less manual cleanup.

### Tests

- Unit test: create output file list excludes `README.md`.
- Unit test: generated execution mode matches code location.
- Snapshot test: generated `skill.md` frontmatter aligns with chosen language.

---

## Cross-Cutting Refactors

### Data Models

Update `isc/models.py` so the evaluator and proposal pipeline can express richer state:

- `PatchProposal`
- `EvaluationReport`
- `TestCase`
- `TestResult`
- optional `ArtifactValidationResult`

### Shared Helpers

Consolidate utility logic now duplicated across modules:

- path resolution
- proposal persistence
- artifact validation
- output parsing
- skill file discovery

### Error Messages

All user-facing errors should be concrete and actionable:

- which artifact failed
- which rule failed
- whether the failure is retryable
- what the user can fix manually

---

## Execution Order

Implement in this order:

1. Phase 0 contract unification
2. Phase 1 proposal/apply repair
3. Phase 2 deterministic validators
4. Phase 3 evaluator redesign
5. Phase 5 security/dependency hardening
6. Phase 4 intelligence upgrades
7. Phase 6 convention alignment and documentation cleanup

Reason:

- phases 0-3 establish a stable correctness loop
- phase 5 prevents regressions while the loop gets stronger
- phase 4 should build on reliable validators/evaluator
- phase 6 cleans output contracts once behavior is fixed

## TDD Plan

### Section A: Canonical skill root and file resolution

- add failing tests for discovery, load, and improve against created skills
- implement path helpers
- remove broken dual-root assumptions

### Section B: Proposal payload lifecycle

- add failing tests for save/apply using JSON payloads
- remove unified diff references
- implement safe apply

### Section C: Artifact validators

- add failing tests for each artifact class
- implement validators
- wire retry/fail logic into creator

### Section D: Evaluator redesign

- add failing tests for invalid JSON, schema mismatch, forbidden output
- update test model and evaluator
- update triage/orchestrator prompts

### Section E: Security hardening

- add failing tests for banned operations
- implement deeper checks
- disable dependency generation by default

### Section F: Intelligence upgrades

- add failing tests for exemplar selection and plan gating
- implement local retrieval and planning rubric

### Section G: Convention cleanup

- add failing tests for file inventory and docs accuracy
- update generation behavior and ISC self-documentation

---

## Rollout Plan

### Step 1

Land internal refactors and tests first without changing user-facing wording.

### Step 2

Switch create/improve/apply to canonical contracts behind a temporary compatibility adapter for any legacy sandbox samples.

### Step 3

Update ISC UI text and `skill.md` after behavior is stable.

### Step 4

Regenerate or manually repair bundled sample skills under `intelligence-skill-creator/skills` so they conform to the new contract, or remove them if they are only fixtures.

## Risks And Mitigations

1. Breaking legacy sample skills.
   - Mitigation: adapter layer plus migration tests.

2. Over-tight validation causing false negatives.
   - Mitigation: classify validators into blocking vs warning where appropriate.

3. Larger prompt size from exemplar/context injection.
   - Mitigation: use concise exemplar summaries, not raw files.

4. Improve mode quality drops temporarily during evaluator redesign.
   - Mitigation: ship with sample fixtures and golden tests before replacing the old scoring path.

## Definition Of Done

The uplift is complete when all of the following are true:

1. A skill created by ISC can be improved immediately by ISC.
2. Improve proposals can be saved and applied successfully.
3. Evaluator rejects invalid JSON and schema-invalid outputs.
4. Artifact validation blocks malformed schemas/tests/manifests before write.
5. Security checks block banned capabilities with explicit reasons.
6. Generated skills follow the repo’s minimal convention by default.
7. ISC documentation, UI schema text, and runtime behavior describe the same system.

## Recommended First PR Split

If implementation still needs manageable review chunks, split the work into four PRs while keeping one planning round:

1. `isc-contracts-and-apply`
2. `isc-artifact-validation-and-evaluator`
3. `isc-security-and-dependency-hardening`
4. `isc-exemplar-grounding-and-convention-alignment`
