# TDD Plan

## 1. Overview

This TDD companion mirrors the implementation plan and describes the tests to write before each implementation slice.

## 2. ISC native target and exporter

### Tests to write first

- `create --target-platform agents_python` emits `SKILL.md`, `scripts/run.sh`, `scripts/verify.sh`, `MODEL_COMPATIBILITY.md`, `skill.lock.json`, and the `references/` files.
- `SKILL.md` frontmatter includes the native target declaration and required metadata fields.
- Wrapper scripts are present, executable, and non-interactive.
- `evaluate` fails when required bundle files are missing.
- `evaluate` fails when the verification command or lock metadata is inconsistent.
- `migrate-legacy` produces a valid bundle from a legacy skill layout.

## 3. Python native runtime and supervisor

### Tests to write first

- The runtime uses the sandbox-agent skill-loading pattern instead of plain agent construction.
- Larger skill directories are loaded lazily through a local directory source.
- The required phase sequence is persisted and can be resumed from a stored checkpoint.
- `verify` blocks `finalize` when the verification command fails.
- Persisted state redacts secrets and tokens.
- Interruption recovery restores the last safe phase and prior artifact index.
- Workspace logs and artifact indexes are written in the expected directories.
- The canonical run files `state/progress.json`, `state/last_session_state.json`, `logs/phase_<n>.md`, and `out/artifact_index.json` exist after a run.

## 4. Node registry, resolver, and router integration

### Tests to write first

- Skill file resolution recognizes native bundle layouts without breaking legacy `skill.md` / `SKILL.md` behavior.
- Compatibility snapshots capture the new native-bundle surface files.
- Maintenance analysis ranks skills higher when native bundle files are missing.
- The upgrade applier only touches the allowed bundle write scope.
- Router responses expose native-bundle compatibility and migration readiness.

## 5. Maintenance and migration workflow

### Tests to write first

- Auto-evaluate and auto-propose are allowed for native bundles.
- Auto-apply is blocked for breaking changes.
- Safe bundle updates re-run verification before apply is considered successful.
- Migration prioritization prefers high-usage/high-risk bundles first.
- Migration preserves legacy compatibility mirrors only when policy says they are needed.
- Safe maintenance updates bump lock/version metadata and changelog content when applicable.

## 6. Security and runtime policy

### Tests to write first

- Path traversal is rejected.
- Undeclared entrypoints are rejected.
- Writes outside declared output paths are rejected.
- Finalize is blocked when verification fails.
- Secrets are not persisted in checkpoints or artifact indexes.
- Workspace artifacts land in the expected state/output/log directories.

## 7. End-to-end coverage

### Tests to write first

- One OpenAI-model-compatible path can create, load, verify, and finalize a native bundle.
- One non-OpenAI provider tier can pass the supported compatibility checks.
- A migrated legacy skill can execute through the native runtime path.
