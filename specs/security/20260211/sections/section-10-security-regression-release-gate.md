# Section 10 - Security Regression and Release Gate

## Objective
Finalize test coverage and release criteria to ensure hardening is complete and compatibility remains intact.

## Scope
- Add end-to-end security regression cases spanning previous sections.
- Confirm compatibility checks for external image workflows.
- Define explicit release gate checklist and evidence artifacts.

## Files to Add / Modify
- Modify/Add test files in:
  - `apps/web/server/services/*.test.ts`
  - `apps/web/server/routers/*.test.ts`
  - `apps/web/client/src/lib/*.test.ts`
- Add: `specs/security/20260211/release-gate-checklist.md`
- Add: `specs/security/20260211/migration-verification-report.md` (template/output)

## TDD Stubs (Write First)
- Test: external `https://` image preview remains functional in document workflows.
- Test: markdown external image links still render.
- Test: unsafe URL inputs rejected across create/update/media paths.
- Test: active-content execution vectors blocked.
- Test: allowlist missing-tenant behavior denied.
- Test: tenant-scoped ops protections hold for phase 1 and phase 2.

## Implementation Tasks
1. Assemble regression test suite from section-level tests.
2. Add compatibility smoke checks for key user flows.
3. Generate migration verification artifacts (URLs + tenant attribution).
4. Define clear pass/fail release checklist with commands and owners.

## Acceptance Criteria
- Security regression suite is green.
- Compatibility regressions are green.
- Migration verification artifacts completed.
- Release gate checklist is actionable and complete.

## Notes / Risks
- Keep test runtime manageable by grouping focused suites and one integration pass.

## As-Built (Implemented)
- Added focused security regression + compatibility smoke tests:
  - `apps/web/server/services/securityRegressionReleaseGate.test.ts`
  - `apps/web/client/src/lib/securityCompatibility.test.ts`
- Added release/migration verification artifacts:
  - `specs/security/20260211/release-gate-checklist.md`
  - `specs/security/20260211/migration-verification-report.md`

## Deviations From Plan
- Rather than introducing a heavy new end-to-end harness, section-level regression checks were consolidated into focused smoke suites and explicit release-gate command lists.

## Test Evidence
- `bash -lc 'export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && source \"$NVM_DIR/nvm.sh\" && cd apps/web && npm test -- server/services/securityRegressionReleaseGate.test.ts client/src/lib/securityCompatibility.test.ts server/services/libraryUrlPolicy.test.ts server/services/uploadContentSafety.test.ts server/services/libraryFeatureFlags.test.ts server/services/libraryOpsService.test.ts server/routers/libraryOps.test.ts server/services/libraryOpsTenantAttributionService.test.ts server/services/imageProxySafety.test.ts client/src/lib/previewHostSafety.test.ts client/src/lib/documentManagementUi.test.ts'`
- Result: pass
