# Task Lifecycle — SPEC-224 M6/M7 Recovery

Goal: continue SPEC-224 Mini App Factory M6/M7 recovery, fix independently executable runtime packaging defects, and preserve an actionable exact-SHA handoff for real acceptance.

Scope/risk: medium / medium. Source changes are limited to Linux Runner packaging/installer/docs and task-local evidence. No production/staging, schema, tenant data, or live Runner execution.

Current stage: VERIFY
Resume from: VERIFY
Stop reason: package fix integrated; focused Vitest and post-integration build remain pending/resource-blocked, and real M6/M7 acceptance waits on external non-production authority.

| Stage | Status | Evidence / next action |
|---|---|---|
| Planning | COMPLETE | Inspected current `origin/main` at `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`, Runner diagnostics, Factory runtime, SPEC-224 handoff, SPEC-278 source and release packaging. |
| TDD/Test Design | COMPLETE | `test-design.md`; baseline inspection recorded missing workflow packaging and installer behavior before implementation. |
| Implement | COMPLETE | Updated Linux release package, rollback-safe optional helper installation, packaging contract test, installer test, docs, matrix and handoff. |
| Verify | IN_PROGRESS | Shell installer, Node contract, YAML parse, shell syntax and diff checks pass. The focused Vitest regression remains pending. The exact-SHA canonical build is RESOURCE_BLOCKED because swap headroom is below the preflight threshold; no retry without fresh capacity observation. |
| Debug/Fix | COMPLETE | No failing implemented-scope check found; Vitest absence classified as tooling/dependency limitation, not code failure. |
| Review | COMPLETE | Focused source review and integration-controller preflight passed; PR #836 merged normally with no bypass. |
| Final Verify | IN_PROGRESS | PR checks passed; exact-SHA build and targeted Vitest remain post-integration obligations; mission-level M6/M7 acceptance remains separate and externally gated. |

## Gap ledger

- `GAP-03` — `RESOURCE_BLOCKED`, MEDIUM, OPEN. Condition: canonical web build for integrated SHA `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc` did not start because the user slice had less than 512 MiB swap headroom; exit 137 was classified `RESOURCE_BLOCKED`. Evidence: canonical build result `.../5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc-3049295e-e03b-49c5-b69a-3a3dcb95f6b8.json`. Owner: CI/dedicated build runner. Action: run exact-SHA build in CI/dedicated capacity or after a fresh resource observation. Prohibited retry: same shared-host build without changed capacity. Resume: VERIFY.
- `GAP-01` — `VERIFY_ONLY`, MEDIUM, OPEN. Condition: focused Vitest regression test could not run locally because `vitest` is absent from this isolated checkout. Evidence: `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/runnerReleaseWorkflow.test.ts` → `Command "vitest" not found`. Owner: CI/dedicated test runner. Action: run the focused contract test on the integrated SHA when admitted capacity/tooling is available. Resume: VERIFY.
- `GAP-02` — `BLOCKED`, external authority, OPEN. Condition: no owner-authorized non-production Runner/session with fresh capability + source/workspace binding or supported disposable PostgreSQL app-schema target. Evidence and exact predicate: `capability-matrix.json`. Owner: SPEC-224/workspace-authority maintainer and authenticated tenant owner. Action: provision through existing authorized route; only then run real M6/M7. Resume: real acceptance after the predicate is satisfied.

## Completion invariants

- PR #836 merged normally at `5f5154a161ef6cf73c2d0f1ea260ab0d43a495cc`; `progressive_integration_gate` passed.
- Scoped installer lifecycle test fresh: true.
- Release workflow contract unit test fresh: false; local Node assertions passed, Vitest pending post-integration.
- No unresolved conflict, damaged patch, or secret observed: true.
- Post-integration canonical build: RESOURCE_BLOCKED (exit 137, <512 MiB swap headroom, web build not started); no retry without fresh capacity observation.
- Canonical user workspace: dirty at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`; convergence pending and untouched.
- Real M6 acceptance: false.
- Real M7 acceptance: false.
- Browser UAT and final verification: false.
- M8 deferred: true.
- Overall mission complete: false.
