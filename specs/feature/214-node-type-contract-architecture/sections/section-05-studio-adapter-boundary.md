# Section 05 — Studio adapter boundary

## Goal
Keep the Spec 209 facade fail-closed and canonical at the definition boundary.

## Files
- Modify `apps/web/server/services/workflowStudioCanonicalAdapter.ts` only if needed.
- Extend adapter and focused `workflowStudio` router tests.

## Requirements
- Maintain a closed migration conversion table separate from registry aliases.
- Convert virtual input/output cards to WorkflowInterface, never executable nodes.
- Reject unsupported node identities and malformed binding/config data; keep supported migration mappings deterministic.
- Do not delete old registrations or persisted definitions without deployed inventory and rollback evidence.

## TDD and acceptance
Tests cover every canonical ID, virtual IO, known migration input, unsupported legacy ID, and no legacy ID emitted into new semantic definitions.

## Dependencies / gates
Depends on Sections 02–04. No client UI redesign or database mutation.

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

Implemented strict Studio conversion: virtual input/output shells become interface declarations; outputs follow explicit shell edges; dangling/unsupported edges, ambiguous mappings, duplicate fields, missing outputs, and invalid configs fail closed. All 16 canonical IDs are exercised.

## Verification

`workflowStudioCanonicalAdapter.test.ts` covers all canonical IDs, virtual IO, output edge ordering, multiple input-field mappings, unsupported nodes/edges, malformed bindings/config, and secret/runtime state.
