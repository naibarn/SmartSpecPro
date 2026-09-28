# Section 04 — Spec 215 compiler consumption

## Goal
Ensure the existing compiler contract consumes immutable Spec 214 manifests without creating a second node semantic authority.

## Files
- Modify `apps/web/server/services/workflowCompilerRuntimeContracts.ts` only where it validates/records Spec 214 projections.
- Extend `apps/web/server/services/__tests__/workflowCompilerRuntimeContracts.test.ts`.

## Requirements
- Validate projected ports, required node bindings, manifest digests, and contract declarations at compile time.
- Preserve WorkflowInterface, WorkflowBinding, ExecutionScope, PolicyAttachment, InstrumentationAttachment, plans, runs, and attempts as Spec 215 contracts.
- Preserve Feature 195 job handoff; do not add job tables, scheduler, runtime executor, or alternate queue.
- Unknown/unavailable binding readiness is blocked state, not a fake successful compile/readiness claim.

## TDD and acceptance
Tests verify digest-locked plan, rejection for invalid declaration/projection, non-node constructs remain outside manifest, and canonical 16-type behavior.

## Dependencies / gates
Depends on Sections 01 and 03. Runtime scheduling and production execution remain outside this section.

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

Implemented compile-time manifest lookup and port projection, input required/cardinality/channel checks, closed-world binding sources including config, interface/variable schema validation, attachment target/config validation, and immutable digest-locked plans. Resolved derived ports enter through an explicit trusted compile argument; Feature 195 remains the physical job authority.

## Verification

`workflowCompilerRuntimeContracts.test.ts` covers projection, missing/mixed inputs, unknown binding sources, declaration failures, deterministic locking, runtime records, and Feature 195 handoff.
