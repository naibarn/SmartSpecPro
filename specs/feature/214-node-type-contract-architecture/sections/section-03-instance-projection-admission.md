# Section 03 — Instance validation, schema projection, and admission

## Goal
Make semantic instances strongly typed and keep extension proposals inside the Spec 214 admission boundary.

## Files
- Modify `apps/web/server/services/workflowNodeContracts.ts`.
- Extend `apps/web/shared/workflowNodeContracts.test.ts`.

## Requirements
- Validate NodeInstance shape, binding kind/version policy, config constraints, metadata constraints, and input/output port use.
- Reject secret material and runtime state recursively with safe key matching.
- Implement deterministic, pure binding/config-derived port/schema projection with stable IDs; explicit null remains distinct from missing.
- Add a 10-check extension admission evaluator with explicit rejection reasons for provider/protocol duplicates and substitutes covered by existing types, bindings, policies, scopes, or compositions.
- Keep unknown/unresolved descriptor states explicit; do not treat catalog existence as execution readiness.

## TDD and acceptance
Test each invalid boundary, null/missing behavior, resolver determinism/side-effect behavior, stable IDs, security key handling, and pass/fail cases across all admission checks.

## Dependencies / gates
Depends on Sections 01–02. No external extension package is installed or executed.

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

Implemented recursive secret/runtime-state rejection (including binding constraints), strict instance/binding/preset validation, Draft 2020-12 config and port-schema validation, stable derived port IDs, and provenance-backed extension admission metadata with reasoned failures. Trust metadata is validated as a declaration; this code does not verify external package signatures.

## Verification

`workflowNodeContracts.test.ts` covers malformed projections/resolver metadata, invalid instance boundaries, null schema preservation, admission and explicit failed reasons.
