# Section 01: Foundation and Routing

## Objective
Create the presentation feature foundation so downstream work can rely on stable route wiring, constants, and shared contracts without affecting existing document/media behavior.

## Dependencies
- None.

## Implementation Scope
- Register a new presentation router in `apps/web/server/routers.ts`.
- Create presentation feature namespace under `apps/web/server/routers/` with guarded entry points.
- Add centralized constants for MVP limits and stable error-code identifiers used by presentation endpoints.
- Add shared typed contracts used by backend and client for presentation resource identifiers and item-type routing.
- Add route guard behavior to prevent wrong editor opening for non-presentation item types.

## Test-First Stubs (Write Before Implementation)
- Test: presentation router registration does not alter existing router namespaces.
- Test: feature-disabled or unsupported route access returns expected authorization/availability response.
- Test: wrong item type route path returns deterministic guard error with recovery CTA metadata.
- Test: shared limit/error constants expose stable machine-readable codes.

## Implementation Tasks
1. Add presentation router registration and exports.
2. Add minimal router scaffold with tenant/library guard invocation only.
3. Add shared `presentation` constants module (limits + error codes).
4. Add shared type contracts for presentation identifiers and route payload envelopes.
5. Add routing guard hook for document-management open behavior.
6. Add changelog notes in this section file for any cross-module contract introduced.

## Acceptance Criteria
- Presentation router is registered and reachable through existing API root.
- No existing router tests regress.
- Wrong-type editor openings are blocked with deterministic response shape.
- Constants/contracts needed by sections 02-07 exist and compile.

## Risks and Mitigations
- Risk: accidental route collisions.
- Mitigation: explicit namespace prefix and regression test for existing namespaces.

## Out of Scope
- Full CRUD logic.
- UI editor implementation.

## As-Built Implementation Notes

### Files Changed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/server/routers.ts`
- `apps/web/client/src/lib/presentationRouting.ts`
- `apps/web/client/src/lib/presentationRouting.test.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/App.tsx`

### Delivered Behavior
- Added a presentation router scaffold (`presentation.availability`, `presentation.guardEditorOpen`) with stable machine-readable error codes and deterministic recovery CTA payloads.
- Registered `presentation` namespace in the app router without removing existing namespaces.
- Added shared presentation constants/contracts used by both server and client route-guard logic.
- Added Document Management open-path routing hook: `item_type="presentation"` now routes to `/presentation-editor/:docId`.
- Added `PresentationEditor` route and guard placeholder page that blocks wrong-item opens with deterministic recovery action.

### Deviations from Plan
- Section 01 includes a placeholder `PresentationEditor` page to host guard behavior immediately; full editor UI remains deferred to section 05.

### Tests Added/Updated
- `apps/web/server/routers/presentation.test.ts`
  - feature-disabled availability response
  - presentation guard allow-path route construction
  - wrong-item deterministic guard + CTA payload
  - router registration presence check in `routers.ts`
- `apps/web/client/src/lib/presentationRouting.test.ts`
  - presentation item route decision
  - non-presentation fallback decision
  - deterministic wrong-editor guard payload
