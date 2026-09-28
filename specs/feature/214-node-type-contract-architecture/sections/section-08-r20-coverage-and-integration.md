# Section 08 — R20 coverage and integrated verification

## Goal
Close local static proof against the Spec 212 R20 corpus and run the full focused Spec 214/215/209 contract regression set.

## Files
- Add or extend focused coverage tests under `apps/web/shared/`.
- Update Spec 214 code alignment/implementation status only with verified local evidence.
- Update section notes with actual files and focused proof.

## Requirements
- Verify corpus identity: 2,930 unique contiguous IDs, TH/EN localization, 5,860 expected prompt executions, and 16 canonical type IDs against R20 manifests/profile.
- Verify static coverage gates and all executable generated/test definitions resolve to registered semantic types.
- Separate local artifact integrity from authenticated live generation/provider availability.
- Check cross-section interfaces, forbidden retired systems, migration safety, and TypeScript policy compliance.

## TDD and acceptance
Run focused tests for node contracts, Spec 215 compiler contracts, Studio adapter/contracts/runtime/builder/router. Run corpus integrity and disposition tests. Run `git diff --check`. Do not run full TypeScript check.

## Dependencies / gates
Depends on Sections 04–07. External blockers are documented, not falsely marked passed.

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

Added a record-hash identity index for UC-0001..UC-2930, aligned Spec 214 revision 6/profile/disposition references, and refreshed hashes in the R20 corpus manifest. Local corpus integrity does not represent 5,860 authenticated model generations.

## Verification

`workflow214Coverage.test.ts` verifies identities/locales/counts/revisions/disposition equality and SHA-256 references. Production inventory, provider generations, browser execution, and deployment remain external evidence gates.
