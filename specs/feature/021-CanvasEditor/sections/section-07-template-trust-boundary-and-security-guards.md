# Section 07: Template Trust Boundary and Security Guards

## Objective
Integrate internal template catalog usage while enforcing upload-equivalent asset validation, tenant scoping, and permission invariants across all CanvasEditor write and export-adjacent paths.

## Dependencies
- `section-02-v2-schema-and-contracts`

## Scope
- Enforce upload-equivalent validation for internal template assets before attach/use.
- Enforce tenant-scoped asset linkage and cross-tenant attach rejection.
- Preserve existing actor attribution and permission checks on touched routes/services.
- Add deterministic blocked-edit guidance for unsupported payload and unauthorized attach flows.
- Add structured security telemetry for template apply failures and policy violations.

## Out of Scope
- External template marketplace support.
- Tenant brand-kit management.

## Files to Add or Modify
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationTemplateService.ts`
- `apps/web/server/services/assetValidationPolicy.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

## Test-First Stubs (Write Before Implementation)
- Test: template-apply path rejects assets failing upload-equivalent validation policy.
- Test: cross-tenant asset attach attempts are rejected with deterministic permission error mapping.
- Test: actor attribution fields remain populated for template apply and save operations.
- Test: unsupported legacy payload path is blocked with deterministic operator guidance.
- Test: template apply idempotency avoids duplicate asset-link inflation on repeated operations.

## Implementation Tasks
1. Extract and reuse upload validation policy for internal template asset ingestion and attach paths.
2. Implement tenant scope and permission guard checks for template apply endpoints/service methods.
3. Add idempotent template apply semantics to prevent duplicate object or asset link creation.
4. Add structured audit/telemetry event emission for validation and permission failures.
5. Ensure blocked legacy payload guidance reuses stable error code taxonomy from Section 02.
6. Extend router/service tests for policy enforcement and attribution invariants.

## Acceptance Criteria
- Template assets are validated to same trust standard as uploads.
- Cross-tenant or unauthorized asset/template use is consistently denied.
- Idempotency and attribution behavior is covered by tests and stable.

## Risk Controls
- Centralize validation policy to avoid drift between upload and template paths.
- Keep policy failures deterministic and machine-readable for support tooling.
- Do not bypass existing auth middleware in new template endpoints.

## As-Built

### Actual Files Changed
- `apps/web/server/services/assetValidationPolicy.ts`
- `apps/web/server/services/presentationTemplateService.ts`
- `apps/web/server/services/presentationTemplateService.test.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `specs/feature/021-CanvasEditor/reviews/section-07-review.md`

### Deviations From Plan
- Template apply was implemented as an additive service + router mutation for trusted asset linking, without introducing a broader template object-instantiation pipeline in this section.
- Upload-equivalent policy enforcement is focused on image template assets (`internal_template_catalog`) and byte-size bounds used by deck asset accounting.

### Tests Added or Updated
- Added:
  - `apps/web/server/services/presentationTemplateService.test.ts`
- Updated:
  - `apps/web/server/routers/presentation.test.ts`
  - `apps/web/server/services/presentationService.test.ts`
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
- Targeted run:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- server/services/presentationService.test.ts server/routers/presentation.test.ts server/services/presentationTemplateService.test.ts client/src/pages/PresentationEditor.test.tsx"`

### Known Follow-Ups
- Add explicit template object placement semantics (not only asset linkage) when template composition requirements are finalized.
- Extend policy parity checks if the internal catalog introduces non-image asset types.
