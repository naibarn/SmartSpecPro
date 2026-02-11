# Section 05 - Tenant Feature Gating

## Objective
Enforce deny-by-default behavior when tenant context is missing in allowlist mode.

## Scope
- Update library feature-flag evaluation logic.
- Add tests for allowlist and missing-tenant scenarios.

## Files to Add / Modify
- Modify: `apps/web/server/services/libraryFeatureFlags.ts`
- Add: `apps/web/server/services/libraryFeatureFlags.test.ts`
- Modify: `apps/web/server/routers/library.test.ts` (if route-level assertions needed)
- Modify: `apps/web/server/routers/media.addToLibrary.test.ts` (if affected)

## TDD Stubs (Write First)
- Test: allowlist configured + missing tenant => disabled.
- Test: allowlisted tenant => enabled.
- Test: non-allowlisted tenant => disabled.
- Test: no allowlist configured => existing default behavior unchanged.

## Implementation Tasks
1. Adjust `isLibraryEnabledForTenant` missing-context branch.
2. Add explicit tests for edge cases and env-var parsing.
3. Verify router behavior remains correct with new gate semantics.

## Acceptance Criteria
- Missing tenant no longer bypasses allowlist.
- No regression for explicitly allowlisted tenants.

## Notes / Risks
- Ensure numeric/string tenant id normalization remains compatible.
