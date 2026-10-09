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

## WorkUnits in this checkpoint

| WorkUnit | Owner | Scope | Completion evidence | State |
|---|---|---|---|---|
| `WU_API_GENERATOR_COVERAGE_BASELINE` | Primary conductor | `api-generator/tests/unit/helpers.test.ts` | 37 tests pass; Branch 83.08%, Functions 97.18%, Lines 95.2%; build passes | Locally verified; exact PR CI pending |
| `WU_WEB_WORKSPACE_INSTALL_BASELINE` | Primary conductor | `scripts/ci/node_tests.sh`, its focused test, `.github/workflows/ci.yml` | Workspace protocol selects pnpm even with npm lock; ordinary npm package still selects npm; two mocked cases pass | Locally verified; exact PR CI pending |
| `WU_EXTENSION_REACT_TYPES_BASELINE` | Primary conductor | `apps/extension/package.json`, `pnpm-lock.yaml` | Extension typecheck and package build pass with explicit React/React DOM declarations | Locally verified; exact PR CI pending |
| `WU_TURBO_NODE_TYPES_BASELINE` | Primary conductor | `apps/remotion-executor/package.json`, `pnpm-lock.yaml` | Package typecheck and build pass with explicit Node declarations compatible with the workspace's existing declaration version | Locally verified; exact PR CI pending |

## Remaining independent WorkUnits

| WorkUnit | Classification / constraint | Next action |
|---|---|---|
| `WU_PYTHON_COLLECTION_BASELINE` | 26 collection errors include tests importing retired Agency/workflow modules. Do not restore them, suppress test collection, or delete/migrate those tests without explicit retirement/migration scope. | Trace all 26 exact import errors and map supported replacements; retain full CI failure until migration scope is authorized. |
| `WU_LOCAL_AI_TEST_ENV_BASELINE` | Missing DOM globals and generated Remotion schema; missing Agency locale/skill fixture paths also occur on main. | Identify minimal test-environment/build-order repairs that do not restore retired Agency paths. |
| `WU_DESKTOP_CI_PATH_BASELINE` | Workflow references nonexistent `apps/desktop`; current desktop shell is Tauri and has no matching JS coverage summary. | Define an evidence-preserving Tauri test target and adjust coverage reporting without fabricating desktop coverage. |

## Verification limits and next action

- The focused tests, typechecks/builds, frozen lockfile validation, shell syntax, and `git diff --check` are recorded in the PR description and agent result capsules.
- No repository-wide local typecheck was run because `AGENTS.md` prohibits it in a shared implementation session.
- Next: push this safe partial checkpoint as a draft PR, let existing CI run on the exact head, and continue the three independent baseline investigations. Do not merge while mandatory checks or the separate security approval remain open.
