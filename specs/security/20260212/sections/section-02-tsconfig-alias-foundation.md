# Section 02: TSConfig Alias Foundation

## Objective
Fix TypeScript configuration and alias resolution root causes that generate module-not-found and export cascade failures.

## Scope
- `apps/web/tsconfig.json`
- alias compatibility with existing import patterns (`@server/*`, `@smartspec/ui/src/*`)

## Preconditions
- Section 01 baseline report completed.

## Tests First (Pre-implementation stubs)
1. From baseline, assert presence of errors:
- `TS2307` for `@smartspec/ui/src/components/ui/*`
- `TS2307` for `@server/routers`
- `TS2305` cascades in UI wrapper consumers

2. Confirm current config snapshot retained for rollback (copy or git diff checkpoint).

## Implementation Steps
1. Update `apps/web/tsconfig.json` to align with base config (`../../tsconfig.base.json`) and preserve strict mode.
2. Ensure compiler target/lib supports currently used syntax/features (Map/Set iteration, regex flags).
3. Add/verify path aliases:
- `@server/*` -> `./server/*`
- `@smartspec/ui/src/*` -> `../../packages/ui/src/*`
4. Keep existing aliases untouched:
- `@/*`, `@shared/*`, `@db/*`
5. Re-run typecheck and generate phase report:
- `reports/typescript-phase-1.json`

## Verification (Post-implementation stubs)
1. `TS2307` alias errors removed or reduced to explicit residual outliers.
2. `TS2305` drops significantly due to restored module resolution.
3. Phase-1 gate pass recorded.

## Artifacts
- `specs/security/20260212/reports/typescript-phase-1.json`
- update row in `reports/remediation-matrix.md`

## Success Criteria
- Foundation alias/import graph compiles for targeted modules.
- Phase 1 hard-stop gate passes.

## Failure and Recovery
- If changes break existing valid imports, revert to previous tsconfig snapshot and re-apply minimal alias set.
