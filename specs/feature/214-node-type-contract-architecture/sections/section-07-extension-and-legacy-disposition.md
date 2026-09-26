# Section 07 — Extension and legacy disposition

## Goal
Turn the spec’s 112-name disposition table into validated machine-readable evidence and reject semantic duplication.

## Files
- Add `specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-214-112-nodeType-clean-slate-disposition.json`.
- Add focused test coverage under `apps/web/shared/` for artifact integrity and admission behavior.
- Modify the R20 manifest only if its reference/shape needs correction.

## Requirements
- Extract all 112 unique legacy names and the exact disposition/canonical target from Appendix A.
- Validate allowed disposition vocabulary and known semantic/non-node target classes.
- Keep this artifact as audit evidence; do not use it as a legacy alias map.
- Guard new canonical registry definitions/presets/compiled workflow fixtures against legacy IDs.

## TDD and acceptance
Assert 112 count, unique IDs, expected categories, valid targets, exact R20 reference, no registry alias acceptance, and representative rejection for every disposition class.

## Dependencies / gates
Depends on Sections 01–03. Destructive runtime retirement remains gated by production inventory.

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

Added the exact ordered Appendix A 112-name disposition artifact without alias authority; extension manifests require matching admission evidence, package digest, host API version, trust declaration, and sandboxed UI metadata. No legacy registrations or persisted definitions were deleted.

## Verification

`workflow214Coverage.test.ts` compares all ordered triples to Spec 214 Appendix A; node-contract tests cover extension admission/provenance and canonical legacy rejection.
