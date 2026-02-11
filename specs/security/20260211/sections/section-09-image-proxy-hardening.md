# Section 09 - Image Proxy Hardening

## Objective
Harden `/api/media/image-proxy` against SSRF/resource abuse without breaking valid external image proxy usage.

## Scope
- Add timeout control.
- Add maximum payload size limit.
- Validate redirect chain destinations.
- Keep content-type enforcement (`image/*`) and host safety checks.

## Files to Add / Modify
- Modify: `apps/web/server/_core/index.ts`
- Add: `apps/web/server/services/imageProxySafety.ts` (if extracted)
- Add: `apps/web/server/services/imageProxySafety.test.ts`
- Add/Modify: route-level tests for proxy behavior

## TDD Stubs (Write First)
- Test: proxy rejects private/local target URLs.
- Test: proxy rejects redirect to private/local target.
- Test: proxy times out and returns safe failure code.
- Test: proxy rejects oversized payload.
- Test: proxy rejects non-image content type.
- Test: proxy succeeds for valid public image URL.

## Implementation Tasks
1. Add configurable timeout and response size guard.
2. Implement redirect-aware destination validation.
3. Keep error responses stable and non-leaky.
4. Add tests for positive and negative scenarios.

## Acceptance Criteria
- Hardening controls active and validated.
- Existing public image proxy behavior still works.

## Notes / Risks
- Ensure fetch implementation supports timeout and response size interruption cleanly.

## As-Built (Implemented)
- Added dedicated image proxy hardening service:
  - `apps/web/server/services/imageProxySafety.ts`
  - `apps/web/server/services/imageProxySafety.test.ts`
- Updated proxy endpoint to use centralized hardening logic:
  - `apps/web/server/_core/index.ts`

## Deviations From Plan
- Redirect-aware validation and payload/timeout protections were implemented in a service abstraction rather than inline in route code to keep route responses stable and tests deterministic.

## Test Evidence
- `bash -lc 'export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && source \"$NVM_DIR/nvm.sh\" && cd apps/web && npm test -- server/services/imageProxySafety.test.ts server/services/libraryUrlPolicy.test.ts'`
- Result: pass (16 tests)
