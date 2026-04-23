# Implementation Plan

## 1. Overview

Feature 106 introduces a native skill system for OpenAI Agents Python. The central idea is to move from a mixed skill ecosystem to one canonical bundle shape that can be authored, validated, loaded, supervised, maintained, and migrated using the same contract.

The new contract is intentionally bundle-first:

- `SKILL.md` is the primary declaration surface.
- `scripts/run.sh` and `scripts/verify.sh` are the required executable entrypoints.
- `skill.lock.json` is the reproducible metadata anchor.
- `MODEL_COMPATIBILITY.md` documents provider and model support.
- runtime state is phase-based and checkpointed.

The plan follows the spec’s recommended sequence so each stage becomes usable as soon as it lands.

## 2. Architecture principles

- Keep the existing DB-backed registry during rollout, but do not let it remain the source of truth for native bundle validity.
- Make bundle contracts explicit and machine-checkable.
- Treat native skill loading as a sandbox-agent problem, not a generic agent construction problem.
- Make maintenance safe by constraining write scope and requiring verification before finalize.
- Preserve legacy compatibility only long enough to support migration safety.

## 3. Target bundle contract

The native bundle contract should be treated as the shared interface across authoring, runtime, validation, and maintenance.

### Required bundle surface

- `SKILL.md`
- optional `skill.md` compatibility mirror
- `scripts/run.sh`
- `scripts/verify.sh`
- `references/input_contract.md`
- `references/output_contract.md`
- `references/maintenance.md`
- `MODEL_COMPATIBILITY.md`
- `skill.lock.json`

### Contract rules

- `SKILL.md` must carry the platform declaration for `agents_python`.
- Wrapper scripts must be deterministic, non-interactive, and path-constrained.
- `skill.lock.json` must declare entrypoints, outputs, modes, and compatibility mirror policy.
- Verification must be explicit and must run before finalize.
- `MODEL_COMPATIBILITY.md` must capture minimum capabilities, recommended capabilities, optional feature gates, provider caveats, and support tier classification.

## 4. ISC native target and exporter

The first implementation slice is the Intelligence Skill Creator path.

### What this slice must do

- Add `agents_python` as a first-class target platform.
- Generate the native bundle surface rather than a legacy `skill.py` / `skill.js` bundle.
- Preserve the existing legacy target for older bundles.
- Route the CLI through platform-specific create, evaluate, improve, and migration behavior.

### Relevant modules

- `apps/web/skills/intelligence-skill-creator/isc/cli.py`
- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
- `apps/web/skills/intelligence-skill-creator/isc/evaluator.py`
- `apps/web/skills/intelligence-skill-creator/isc/validator.py`
- new exporter and evaluator modules under `isc/exporters/`, `isc/evaluators/`, and `isc/migrations/`

### Behavioral expectations

- `create --target-platform agents_python` writes every required bundle file.
- `evaluate` validates file presence, frontmatter, scripts, lock metadata, and compatibility metadata.
- `improve --target-platform agents_python` checks the current bundle, proposes or applies safe updates, and reruns verification.
- `migrate-legacy` converts older bundles into native bundles and validates the result.

## 5. Python native runtime and supervisor

The second implementation slice is the dedicated runtime path in the Python backend.

### What this slice must do

- Introduce a native skill runtime service separate from the generic agent adapter.
- Use the sandbox-agent pattern with `Capabilities.default()` and lazy skill loading for larger local skill sets.
- Persist run state by phase.
- Support recovery from interruption, turn-budget exhaustion, and resume hints.

### Relevant modules

- `python-backend/app/services/openai_agents_skill_runtime.py`
- `python-backend/app/services/openai_agents_skill_supervisor.py`
- `python-backend/app/services/openai_agents_skill_persistence.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`

### Required phase model

1. discover
2. inspect
3. plan
4. execute
5. verify
6. summarize
7. finalize

### Persistence contract

Each run must persist:

- current phase
- phase status
- loaded skills
- last command
- produced artifacts
- verification command
- resume hint

### Workspace layout

The runtime workspace should keep execution artifacts in a predictable shape:

```text
workspace/
  repo/
  .agents/
  state/
  out/
  logs/
```

The runtime must write durable progress artifacts under the workspace state directories described in the spec, including phase logs and artifact indexes.
The expected files are:

- `state/progress.json`
- `state/last_session_state.json`
- `logs/phase_<n>.md`
- `out/artifact_index.json`

### Runtime contract additions

The native execution request should record enough metadata to resume and audit a run later:

- target skill slug
- resolved bundle path or reference
- loaded skills
- current phase
- artifact outputs
- verification command
- resume hint

## 6. Node registry, resolver, and router integration

The third implementation slice updates the Node-side integration so the registry and APIs understand the native bundle shape.

### What this slice must do

- Make native-bundle metadata first-class in the registry and skill files resolver.
- Extend compatibility snapshots to distinguish native-ready bundles from legacy-only bundles.
- Update the skill API surface so it can report native-bundle compatibility and migration readiness.
- Keep the legacy registry path intact during rollout.

### Relevant modules

- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/agentRuntime/checkpointService.ts`
- `apps/web/server/routers/skills.ts`

### Expected behavior

- Registry resolution should prefer canonical server-owned skill roots.
- Bundle-aware resolution should recognize native bundle structures and compatibility mirrors.
- Compatibility snapshots should surface missing native bundle surface files.
- Router responses should make migration and compatibility status visible to callers.

## 7. Maintenance and migration workflow

The fourth implementation slice turns maintenance into a first-class lifecycle.

### What this slice must do

- Evaluate bundles against the native contract.
- Classify changes as breaking or non-breaking.
- Auto-apply only safe changes.
- Use the same bundle contract for create, improve, verify, and migrate.
- Promote legacy bundles gradually, starting with high-usage/high-risk skills.
- Update lock/version metadata and changelog entries when a safe change is applied.

### Policy rules

- Auto-evaluate is allowed.
- Auto-propose is allowed.
- Auto-apply is allowed only for non-breaking changes.
- Breaking changes require approval.
- Maintenance write scope must stay inside the skill bundle.

### Migration strategy

The initial migration set should be curated rather than global. The analyzer should rank skills by upgrade priority so the native bundle contract lands where it has the most operational value first.

## 8. Security and runtime policy

The feature’s safety model should be enforced through machine checks.

### Required security rules

- Do not trust arbitrary client-provided skill paths.
- Only load bundles that pass native validation or are explicitly marked legacy in migration mode.
- Only invoke entrypoints declared in `skill.lock.json`.
- Reject script path traversal and undeclared shell invocation.
- Confine writes to declared output directories.
- Redact secrets and tokens from persisted runtime state.
- Block finalize when verification fails.

### Compatibility policy

- Treat `Tier A - Universal` as the minimal tool-and-text baseline.
- Treat `Tier B - Recommended` as the preferred operational tier for routine native bundles.
- Treat `Tier C - Full OpenAI` as the richest path for OpenAI-native capabilities such as hosted search or server-managed conversation features.
- Validate compatibility at least once against an OpenAI model path and once against a non-OpenAI provider tier before production readiness.

## 9. Testing strategy

Tests should be built in parallel with implementation and aligned to the repository’s current tooling.

### Web/Node tests

- Use `vitest`
- Focus on bundle validation, compatibility snapshots, migration ranking, safe apply behavior, and skill-file resolution.

### Python backend tests

- Use `pytest`
- Focus on runtime request/response contracts, phase persistence, lazy skill loading hooks, resume behavior, and checkpoint redaction.

### End-to-end coverage

Add tests that prove:

- native create emits the full bundle
- runtime discovers and loads the bundle
- verification blocks finalize when it fails
- resume restores the last safe phase
- migration produces a runnable native bundle
- compatibility passes across at least one OpenAI model path and one non-OpenAI provider tier

## 10. Rollout sequence

1. Implement ISC native bundle creation and evaluation.
2. Add the Python native runtime and supervisor.
3. Update Node registry and compatibility checks.
4. Add migration and maintenance workflows.
5. Expand tests and tighten rollout guards.

This ordering keeps the earliest slices independently valuable and reduces the chance that runtime work lands before the bundle contract is fully defined.
