# Task Lifecycle — SPEC-224 M6/M7 Recovery

Goal: continue SPEC-224 Mini App Factory M6/M7 recovery, fix independently executable runtime packaging defects, and preserve an actionable exact-SHA handoff for real acceptance.

Scope/risk: medium / medium. Source changes are limited to Linux Runner packaging/installer/docs and task-local evidence. No production/staging, schema, tenant data, or live Runner execution.

Current stage: VERIFY
Resume from: VERIFY
Stop reason: scoped package fix prepared; required Vitest/CI evidence is pending and real M6/M7 acceptance waits on external non-production authority.

| Stage | Status | Evidence / next action |
|---|---|---|
| Planning | COMPLETE | Inspected current `origin/main` at `162846d83b76c56a2fb1f2931327aa4ea6f65d9d`, Runner diagnostics, Factory runtime, SPEC-224 handoff, SPEC-278 source and release packaging. |
| TDD/Test Design | COMPLETE | `test-design.md`; baseline inspection recorded missing workflow packaging and installer behavior before implementation. |
| Implement | COMPLETE | Updated Linux release package, rollback-safe optional helper installation, packaging contract test, installer test, docs, matrix and handoff. |
| Verify | IN_PROGRESS | Shell installer, Node contract, YAML parse, shell syntax and diff checks pass. Vitest is unavailable in the clean worktree; required PR CI remains pending. |
| Debug/Fix | COMPLETE | No failing implemented-scope check found; Vitest absence classified as tooling/dependency limitation, not code failure. |
| Review | IN_PROGRESS | Conductor reviewed changed call path and fail-closed boundaries. Complete focused second-pass review after CI result. |
| Final Verify | PENDING | Requires normal PR checks and exact integrated SHA. Mission-level M6/M7 acceptance remains separate and externally gated. |

## Gap ledger

- `GAP-01` — `VERIFY_ONLY`, MEDIUM, OPEN. Condition: focused Vitest regression test could not run locally because `vitest` is absent from this isolated checkout. Evidence: `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/runnerReleaseWorkflow.test.ts` → `Command "vitest" not found`. Owner: PR CI. Action: require the normal CI job to run the contract test before merge. Resume: VERIFY.
- `GAP-02` — `BLOCKED`, external authority, OPEN. Condition: no owner-authorized non-production Runner/session with fresh capability + source/workspace binding or supported disposable PostgreSQL app-schema target. Evidence and exact predicate: `capability-matrix.json`. Owner: SPEC-224/workspace-authority maintainer and authenticated tenant owner. Action: provision through existing authorized route; only then run real M6/M7. Resume: real acceptance after the predicate is satisfied.

## Completion invariants

- Scoped installer lifecycle test fresh: true.
- Release workflow contract unit test fresh: false; pending CI.
- No unresolved conflict, damaged patch, or secret observed: true.
- Real M6 acceptance: false.
- Real M7 acceptance: false.
- Browser UAT and final verification: false.
- M8 deferred: true.
- Overall mission complete: false.
