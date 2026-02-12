# Section 07: Strict Cleanup Server Hotspots

## Objective
Eliminate remaining strict typing errors in server routers/services without changing auth/tenant/security behavior.

## Scope
- `apps/web/server/routers/*` (hotspot subset)
- `apps/web/server/services/*` (hotspot subset)
- tenant/auth/library/media sensitive paths

## Preconditions
- Section 05 completed.

## Tests First (Pre-implementation stubs)
1. Snapshot remaining server error families:
- `TS2322`, `TS2345`, `TS2554`, `TS18046`, `TS18047`, `TS2802`
2. Mark sensitive routes requiring behavior parity checks:
- `library`, `media`, `systemSettings`, `tenant`

## Implementation Steps
1. Resolve overloaded-call and payload-shape mismatches with precise types.
2. Normalize unknown data via explicit guards and narrowing.
3. Keep canonical tenant normalization utility at boundaries only.
4. Avoid ad-hoc unsafe casts and preserve authorization checks.
5. Update remediation matrix for server clusters.

## Verification (Post-implementation stubs)
1. Server hotspot strict errors converge toward zero.
2. Sensitive route regression tests still pass:
- `server/routers/library.test.ts`
- `server/routers/media.addToLibrary.test.ts`
- `server/services/libraryOpsTenantAttributionService.test.ts`
- `server/services/libraryUrlPolicy.test.ts`
- `server/services/securityRegressionReleaseGate.test.ts`

## Artifacts
- matrix updates in `reports/remediation-matrix.md`

## Success Criteria
- Server strict errors in targeted clusters resolved.
- Tenant/auth/security behavior parity maintained.

## Failure and Recovery
- If behavior parity fails on sensitive tests, rollback last server cluster change and re-apply with explicit boundary typing.
