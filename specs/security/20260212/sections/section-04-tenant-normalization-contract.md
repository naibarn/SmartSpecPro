# Section 04: Tenant Normalization Contract

## Objective
Establish one canonical tenantId normalization utility and enforce boundary-only usage to prevent inconsistent coercion.

## Scope
- shared tenant normalization utility location (server-side)
- router/service call sites where mixed tenant input can appear
- usage policy documentation for allowed and forbidden normalization points

## Preconditions
- Section 02 complete.
- Section 03 may be in progress but canonical contract must converge before section 05.

## Tests First (Pre-implementation stubs)
1. Identify current mixed tenant input boundaries:
- request context tenantId
- user currentTenantId
- input payload tenant identifiers

2. Assert current behavior expectations from existing tests:
- `server/routers/library.test.ts`
- `server/routers/media.addToLibrary.test.ts`
- `server/services/libraryOpsTenantAttributionService.test.ts`

## Implementation Steps
1. Define canonical normalization function contract:
- accepted input types
- output type and nullability
- explicit precedence rules when multiple tenant sources exist
2. Update boundary call sites to use only the canonical utility.
3. Prohibit ad-hoc inline normalization in business logic internals.
4. Document usage map in remediation matrix (allowed/forbidden boundaries).
5. Re-run targeted tests and typecheck delta.

## Verification (Post-implementation stubs)
1. Tenant-related tests continue to pass.
2. No new tenant coercion errors introduced.
3. Phase dependency for section 05 is satisfied.

## Artifacts
- utility and call-site updates (code)
- usage map entry in `reports/remediation-matrix.md`

## Success Criteria
- Single normalization strategy governs tenant boundary conversion.
- Behavior parity maintained for tenant-sensitive flows.

## Failure and Recovery
- If normalization change alters expected behavior, revert call-site change and tighten boundary precedence rules before re-applying.
