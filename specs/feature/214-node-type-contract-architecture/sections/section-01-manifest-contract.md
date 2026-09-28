# Section 01 — Manifest contract

## Goal
Bring `NodeTypeManifest` into alignment with Spec 214 v4 without moving runtime ownership into the node contract.

## Files
- Modify `apps/web/server/services/workflowNodeContracts.ts`.
- Extend `apps/web/shared/workflowNodeContracts.test.ts`.

## Requirements
- Add missing manifest declarations: runtime resources, derived/fixed effect union, data governance, richer UI descriptor, full AI Builder descriptor, lifecycle statuses including quarantine, compatibility, and optional resolver descriptors.
- Define types for ports/config derivation, extension provenance/admission metadata, and historical immutable manifests.
- Keep one source of truth for effect/execution semantics. Do not put retry/queue/run/lease/checkpoint mechanics here.
- Update canonical manifests deterministically and recompute digest after every change.
- Preserve exactly 16 core IDs and safe frozen objects.

## TDD and acceptance
Add failing tests for required-field validation, invalid enums/semver/IDs/digests, resource bounds, effect union shape, governance/UI fields, and immutable digest stability. Focused node contract suite passes.

## Dependencies / gates
No DB/API migration. Do not introduce schema library/dependency. This section is the shared interface prerequisite for all later sections.

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

Implemented in `apps/web/server/services/workflowNodeContracts.ts`: schema-v4 typed declarations, bounded per-core JSON Schemas, enum/shape validation, Ajv 2020-12 validation, deterministic digesting, immutable manifests. Ajv was already in the lockfile; it is now declared directly because this module imports it at runtime.

## Verification

`workflowNodeContracts.test.ts` covers all 16 bounded config schemas, malformed semantic/governance declarations, digest/schema rejection, and resource/security boundaries.
