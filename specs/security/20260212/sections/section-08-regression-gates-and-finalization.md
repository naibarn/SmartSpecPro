# Section 08: Regression Gates and Finalization

## Objective
Execute final type and regression gates, publish artifacts, and confirm release readiness.

## Scope
- full web typecheck
- deterministic sensitive test subset
- final report artifacts and checklist completion

## Preconditions
- Sections 06 and 07 completed.

## Tests First (Pre-final stubs)
1. Confirm phase reports exist:
- `typescript-phase-1.json`
- `typescript-phase-2.json`
- `typescript-phase-3.json`
- `typescript-phase-4.json` (if tracked separately)
2. Confirm remediation matrix includes all hotspot clusters.

## Implementation Steps
1. Run final typecheck:
```bash
cd apps/web && npm run check -- --pretty false
```
2. Run deterministic sensitive test subset:
```bash
cd apps/web && npx vitest run server/routers/library.test.ts
cd apps/web && npx vitest run server/routers/media.addToLibrary.test.ts
cd apps/web && npx vitest run server/services/libraryOpsTenantAttributionService.test.ts
cd apps/web && npx vitest run server/services/libraryUrlPolicy.test.ts
cd apps/web && npx vitest run server/services/securityRegressionReleaseGate.test.ts
```
3. Generate final JSON report:
- `reports/typescript-final.json` (must contain `total_errors`)
4. Complete behavior parity checklist for:
- `library`, `media`, `systemSettings`, `tenant`
5. Ensure CI assertion policy documented/applied:
- fail build when `total_errors > 0`

## Verification (Final stubs)
1. `total_errors == 0`.
2. Sensitive test subset passes.
3. No unresolved high-severity issues in review artifacts.
4. Exception protocol entries (if any) are complete.

## Artifacts
- `specs/security/20260212/reports/typescript-final.json`
- `specs/security/20260212/reports/remediation-matrix.md` (finalized)
- behavior parity checklist artifact (as referenced in plan)

## Success Criteria
- Web typecheck is clean.
- Regression-sensitive routes validated.
- Plan ready for `/deep-implement` execution.

## Failure and Recovery
- If final gate fails, stop release and return to owning section for targeted fixes.
- Preserve final failing report for traceability before remediation.
