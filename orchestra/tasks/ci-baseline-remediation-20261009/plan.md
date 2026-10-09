# CI baseline remediation WorkUnits

## Objective and ownership

Close reproducible baseline CI defects without weakening coverage, audit, or security policy and without mixing the changes into dependency-security PR #405, MCP PR #403, or SPEC-308 PR #399.

- Repository: `github.com/naibarn/SmartSpecPro`
- Canonical starting SHA: `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48`
- Work owner: primary Codex conductor / PR author, until a repository team takes review ownership.
- Repository CODEOWNERS: none found; no team reviewer is inferred from CI logs.
- This is a partial checkpoint. PR approval and required CI checks remain governed by repository protection.

## Exact baseline evidence

- Main control: full CI run `37929463981` on `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48`.
- Security candidate: full CI run `37933761880` on `1e9b811cab529f13bb56cc4c63ceba0a8627ec52`; all seven failed jobs matched the canonical control.
- Candidate `api_generator` `npm ci` and 31 tests pass; baseline coverage was Branch 76.61% and Functions 57.74%, below existing 80% thresholds.
- The full production dependency audit on PR #405 remains blocked by the single unpatched Moderate `sprintf-js@1.1.3`; this CI baseline PR does not suppress or change that audit.
- PR #414 exact full CI run `37945132250` on SHA `28219359812041649c10fece6071e4361d65b176` closed with failure. `control_plane`, `skill_pack`, `api_generator`, and `marketplace_extension` passed. `python`, `smartspecweb`, `local_ai_runtime`, `desktop_app`, and `turbo_build` failed; coverage summary was skipped because its required inputs were not all produced.
- The candidate SmartSpecWeb job selected pnpm and completed install, then exposed broad existing test failures. Canonical `smartspecweb` failed earlier at npm `EUNSUPPORTEDPROTOCOL workspace:*`, so its downstream suite was masked on that main run. No changed application source caused the candidate assertions.
- Turbo logs identified missing `node:fs`/`node:path` declarations in `packages/agent-experience/src/testing/fixtures.ts`; the initial Node type declaration was in the wrong workspace package. A targeted declaration and lock entry now pass that package's typecheck.
- Local AI logs confirmed the workflow's `vitest run -- <paths>` invoked broad unrelated tests. The exact six-file target passes 34/34 locally after building the generated Remotion schema first.
- Desktop logs confirm the configured `apps/desktop` path does not exist. CI now targets the Tauri shell Rust tests and no longer expects fabricated JavaScript coverage from it.

## WorkUnits in this checkpoint

| WorkUnit | Owner | Scope | Completion evidence | State |
|---|---|---|---|---|
| `WU_API_GENERATOR_COVERAGE_BASELINE` | Primary conductor | `api-generator/tests/unit/helpers.test.ts` | 37 tests pass; Branch 83.08%, Functions 97.18%, Lines 95.2%; build passes | Locally verified; exact PR CI pending |
| `WU_WEB_WORKSPACE_INSTALL_BASELINE` | Primary conductor | `scripts/ci/node_tests.sh`, its focused test, `.github/workflows/ci.yml` | Workspace protocol selects pnpm even with npm lock; ordinary npm package still selects npm; two mocked cases pass | Locally verified; exact PR CI pending |
| `WU_EXTENSION_REACT_TYPES_BASELINE` | Primary conductor | `apps/extension/package.json`, `pnpm-lock.yaml` | Extension typecheck and package build pass with explicit React/React DOM declarations | Locally verified; exact PR CI pending |
| `WU_TURBO_NODE_TYPES_BASELINE` | Primary conductor | `apps/remotion-executor/package.json`, `pnpm-lock.yaml` | Package typecheck and build pass with explicit Node declarations compatible with the workspace's existing declaration version | Locally verified; exact PR CI pending |
| `WU_AGENT_EXPERIENCE_NODE_TYPES_BASELINE` | Primary conductor | `packages/agent-experience/package.json`, `pnpm-lock.yaml` | Correct package now declares Node types for `node:fs`/`node:path`; scoped typecheck passes | Locally verified; exact PR CI pending |
| `WU_LOCAL_AI_CI_SCOPE_BASELINE` | Primary conductor | `.github/workflows/ci.yml` | Build generated Remotion schema before tests; run exactly six Local AI test files positionally; local result 6 files / 34 tests pass | Locally verified; exact PR CI pending |
| `WU_DESKTOP_TAURI_CI_BASELINE` | Primary conductor | `.github/workflows/ci.yml`, `scripts/ci/coverage_summary.py` | Keep required desktop gate on Cargo tests; omit nonexistent JS coverage; summary test confirms measured inputs remain mandatory and desktop metric is not fabricated | Locally verified except Cargo test; exact PR CI pending |
| `WU_REMOTION_RELEASE_PNPM_SETUP_BASELINE` | Primary conductor | `.github/workflows/remotion-executor-release.yml` | Remove duplicate pnpm version source; root `packageManager` remains the version pin | YAML validated; exact PR CI pending |

## Remaining independent WorkUnits

| WorkUnit | Classification / constraint | Next action |
|---|---|---|
| `WU_PYTHON_COLLECTION_BASELINE` | 26 collection errors include tests importing retired Agency/workflow modules. Do not restore them, suppress test collection, or delete/migrate those tests without explicit retirement/migration scope. | Trace all 26 exact import errors and map supported replacements; retain full CI failure until migration scope is authorized. |
| `WU_LOCAL_AI_TEST_ENV_BASELINE` | The scoped Local AI regression passes; broad web suite still exposes missing browser globals, retired Agency fixture assertions, and unrelated baseline assertions. | Keep the Local AI gate scoped; migrate Vitest's removed environment-glob config and fixture assertions in separately reviewed baseline work. Do not restore retired fixtures. |
| `WU_DESKTOP_CI_PATH_BASELINE` | The stale path is replaced with an actual Tauri Cargo test command; native test remains unrun locally. | Require exact candidate CI result for Cargo tests and verify the report contains no desktop coverage metric. |

## Verification limits and next action

- The focused tests, typechecks/builds, frozen lockfile validation, shell syntax, and `git diff --check` are recorded in the PR description and agent result capsules.
- No repository-wide local typecheck was run because `AGENTS.md` prohibits it in a shared implementation session.
- Next: refresh this branch to current `origin/main`, commit the scoped repairs, and require a new exact-SHA Full CI plus Remotion release-gate run. Python collection migration and broad web test cleanup remain outside safe scope until the Python/web owners authorize migration work. Do not merge while mandatory checks or the separate security approval remain open.
