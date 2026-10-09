# Orchestra parallel contract — dependency security and SPEC-308 closeout

## Wave 1: independent read-only reconciliations

| Agent | Ownership | Read scope | Deliverable |
|---|---|---|---|
| CI reviewer | Read-only; no writes | PR #405 exact run `37933761880`, main `37929463981`, CI triage, api-generator lock repair | Per-job exact-SHA comparison; classify candidate regression vs baseline/environment; identify next authorized repair |
| MCP reviewer | Read-only; no writes | PR #403 diff/checks/worktree and MCP gate configuration | Exact evidence, stale checks, external authority required, readiness and safe next action |
| SPEC-308 reviewer | Read-only; no writes | PR #399 canonical SPEC, 66-row ledger, browser evidence, runtime acceptance scope | Requirement coverage quality, stale SHA evidence, live acceptance blocker and next action |

## Interfaces and impact boundaries

- No shared source files are written by Wave 1. Review outputs are result capsules only.
- PR #405 remains sole owner of dependency remediation and the api-generator lock repair.
- PR #403 remains sole owner of MCP fixtures/workflow work.
- PR #399 remains sole owner of SPEC-308 UI and requirement ledger.
- The primary conductor owns integration, commits, PR updates, and all approval decisions.
- No agent may alter dependencies, security policy, feature flags, runtime identity, secrets, production state, or another worktree.

## Verification boundary

- CI reviewer uses exact GitHub run logs and compares same job signatures with canonical main.
- MCP reviewer distinguishes fixture tests from live endpoint/identity acceptance.
- SPEC-308 reviewer distinguishes simulated browser evidence from authenticated runtime acceptance; no ledger row may be bulk-closed.
- Any recommended repair must name exact files, command/evidence, SHA freshness, and owner/authority dependency.

## Wave 2: independent baseline CI repairs

| Agent | Dedicated worktree / branch | Exclusive write scope | Completion evidence |
|---|---|---|---|
| Workspace install | `/home/dev/worktrees/ci-baseline-node-install-20261009` / `codex/ci-baseline-node-install-20261009` | `scripts/ci/node_tests.sh` and narrowly scoped script regression tests only | Demonstrate `workspace:*` packages select pnpm, normal npm-lock packages retain npm, and focused shell tests pass |
| TS package declarations | `/home/dev/worktrees/ci-baseline-ts-types-20261009` / `codex/ci-baseline-ts-types-20261009` | `apps/extension/package.json`, `apps/remotion-executor/package.json`, and sole-writer `pnpm-lock.yaml` | Exact React/Node declaration dependencies in owning workspaces; frozen lockfile and package-scope type/build checks |
| API Generator baseline coverage | `/home/dev/worktrees/ci-baseline-api-coverage-20261009` / `codex/ci-baseline-api-coverage-20261009` | `api-generator/**` test files only; production source and coverage thresholds remain unchanged | Add behavior assertions on uncovered branches and get focused coverage gate >= existing 80% thresholds |

Shared lockfile boundary: only the TS package declarations agent may change `pnpm-lock.yaml` in this wave. No branches are merged/pushed by agents. Primary conductor reviews each result, runs the fast gate, then promotes safe checkpoints through normal PR workflows.

## Explicitly deferred barriers

- Python tests referencing retired Agency/workflow systems cannot be suppressed, deleted, or recreated under the repository's retired-system policy without explicit migration scope; first identify safe supported replacements.
- `local_ai_runtime` and obsolete `apps/desktop` CI target require exact current source/workflow analysis before repair. They are not mixed into the independent Wave 2 writers.
- Security risk acceptance, live MCP identity, and authenticated SPEC-308 runtime acceptance remain external-owner decisions.

## Wave 3: remaining baseline CI root-cause reviews

| Agent | Read-only scope | Deliverable |
|---|---|---|
| Python collection reviewer | `python-backend` collection errors from CI `37933761880` and exact source/test imports | 26-error ledger grouped by missing dependency vs retired module vs stale test; smallest safe supported replacement; prohibited retired-system workarounds |
| Local AI reviewer | `local_ai_runtime` CI logs `37933761880` and `37929463981`, selected tests, Vitest setup, Remotion build order | Candidate/main delta, DOM setup vs generated output vs retired fixtures, minimal safe repair and focused commands |
| Desktop CI reviewer | `desktop_app` CI logs, `.github/workflows/ci.yml`, `apps/tauri-shell`, coverage summary generator/tests | Determine valid Tauri test target and truthful coverage handling without fabricated artifact or skipped gate |

- No Wave 3 agent writes source, workflow, tests, artifacts, or another task's handoff.
- Primary conductor integrates a fix only after root cause and required test/authority boundary are evidenced.

## Dispatch metadata

- dispatch_mode: parallel_batch, read-only
- model preference: repository requires gpt-5.6-terra for non-planning work; current tool registry does not expose that override, so agents inherit the current session model.
- same-wave dependencies: none
- parallel writers: 0
