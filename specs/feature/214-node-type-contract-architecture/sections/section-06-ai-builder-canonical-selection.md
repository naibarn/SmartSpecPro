# Section 06 — AI Builder canonical selection

## Goal
Ensure builder output is based on registered semantic types and resolvable binding choices, with capability/readiness gaps surfaced honestly.

## Files
- Modify `apps/web/server/services/workflowBuilderCompiler.ts` and narrowly scoped caller/router contracts as required.
- Extend builder and router tests.

## Requirements
- Derive allowed node types from registry contracts instead of an independent list.
- Candidate generation may select only real canonical types; provider/product names remain bindings.
- No synthetic `*.default` binding may be labeled ready or accepted as real availability.
- Return actionable capability/binding gap reasons. Preserve edit/accept idempotency and validation.

## TDD and acceptance
Tests reject missing/unready bindings, unknown option IDs, invented type IDs, and accepted invalid candidates; valid registered options still compile.

## Dependencies / gates
Depends on Sections 02–04. No live provider request is made by unit tests.

## UI/UX Contract

### Target User / JTBD
N/A: this section changes contract/service behavior only and does not change a user-visible workflow.

### Surface Inventory
N/A: no browser route, visual surface, or rendered component changes in this section.

### Component Map
N/A: no React component ownership changes; existing Studio facade remains the presentation boundary.

### State Matrix
N/A for loading, empty, error, success, disabled, hover, focus, and selected UI states; preserve stable backend reason codes for current UI consumers.

### Responsive Matrix
N/A: no layout or responsive behavior changes.

### Accessibility Acceptance
N/A: no rendered controls or interaction semantics change.

### Copy Contract
N/A: no new user-facing copy; preserve existing Thai/English localization behavior.

### Browser Evidence Required
N/A: service/shared-contract tests cover this section. If implementation changes browser-visible behavior, add browser evidence before completion.

## Implemented Result

Builder choices are checked against the canonical registry, placeholder/default bindings reject, and client-provided readiness never promotes output beyond `draft`. Runtime/provider readiness remains explicitly unverified because no trusted resolver for every binding family is wired into this route.

## Verification

`workflowBuilderCompiler.test.ts` and `workflowStudio.test.ts` cover canonical choices, missing/default binding rejection, draft-only client readiness, idempotent accept, and route contracts.
