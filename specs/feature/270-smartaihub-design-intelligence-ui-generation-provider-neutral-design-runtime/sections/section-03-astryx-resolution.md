# Section 03 — Astryx Resolution and Catalog Snapshot

## Goal

Create a deterministic resolver from canonical `ComponentIntent` to approved SmartAIHub and Astryx components. This resolver is a design-time mapping service, not a new UI framework, model capability registry, or provider client.

## Dependencies

- Depends on: Section 01 canonical contracts and G0 catalog evidence.
- May proceed in parallel with Section 04 after Section 01 only where it does not require persisted artifacts.
- Blocks: Section 06 and Section 07.

## Tests first

1. Given an intent and pinned catalog snapshot, resolution is stable and returns the same selected component, rationale, compatibility and fallback provenance.
2. Resolver ordering follows: approved SmartAIHub component, approved Astryx component/pattern/theme/template, safe composed pattern, safe primitive; unsupported capability fails closed rather than inventing a component.
3. Snapshot mismatch or incompatible component version invalidates a previous resolution and produces a review-needed result.
4. Fixture coverage includes theme (light/dark/system/high contrast), locale/RTL, device/responsive intent, safe area/input constraints, role/permission constraints and reduced-motion requirement.
5. A design/source drift test detects a changed component contract or snapshot digest.
6. Static test proves no direct provider SDK imports, no global CSS reset, and no mutation of model `capabilityRegistry.ts` unless G0 identifies it as the actual Spec 256 seam.

## Implementation

1. Before implementation, run the required Astryx discovery from repo root: `npm run astryx -- build "design authoring review workspace"`, `npm run astryx -- docs layout`, and component/token commands for each candidate. Record exact component/version findings in the reconciliation record.
2. Add a compact catalog snapshot representation containing pinned Astryx package version, SmartAIHub component identifiers, supported properties, semantic roles, compatibility window and snapshot digest. Do not scrape runtime components or synthesize unsupported props.
3. Implement pure resolver functions that consume canonical intent and snapshot, return selected component/pattern, normalized props allowed by the catalog, rationale, missing capabilities, fallback provenance, and invalidation status.
4. Put any React wrappers later in Section 06. This section owns resolver contracts/catalog fixtures only and must not add raw layout markup or a new route.
5. Track source/design drift through version and digest comparison, with review required for incompatible changes.

## Completion criteria

- Resolution is deterministic, pinned, inspectable, and safe across supported visual/accessibility contexts.
- Astryx 0.6.3 is consumed through SmartAIHub-owned wrappers in later UI code; no global reset or raw hard-coded visual values are introduced.
- Model capability filtering stays separate from design catalog authority.

## Implementation record

- Added `apps/web/shared/designComponentResolver.ts` and its focused suite. It pins a source-controlled, deeply frozen Astryx 0.6.3 catalog snapshot with a canonical SHA-256 digest, source priority, verified prop allow-lists, role/capability compatibility, theme/RTL/locale/device/safe-area/reduced-motion/permission constraints, safe prop normalization, explicit invalidation and fail-closed unsupported output. Caller-created catalogs are rejected even with a valid self-computed digest.
- Extended `componentIntentSchema` and `componentResolutionSchema` in `apps/web/shared/designIntelligence.ts` so the resolver uses the canonical contract rather than a parallel shape. The resolver has no provider or runtime component imports.
- Required Astryx build/layout/tokens/template/component discovery ran using an isolated temporary package set because the borrowed `node_modules` lacked core/theme and the root CLI link. No manifest/lockfile or main-workspace dependency changes were made. The exact package/version and component discovery are documented in `implementation/G0-reconciliation-record.md`.
- Focused verification: `cd apps/web && npm test -- --run shared/designComponentResolver.test.ts shared/designIntelligence.test.ts` — 2 files, 29 tests passed, including nested JSON key-order determinism.
- Component contract drift or snapshot mismatch returns `review-needed`; unsupported requirements fail closed. A full SmartAIHub wrapper is not part of this section and remains Section 06 work.

## UI/UX Contract

### Target User / JTBD
N/A for this backend/contract section; its outputs serve the authenticated design-authoring user described by Section 06.

### Surface Inventory
N/A; this section adds no browser route or screen.

### Component Map
N/A; no UI component is owned here. Contract/service ownership is specified above; UI is owned by Section 06.

### State Matrix
N/A for direct UI. Service outcomes (success, validation failure, unauthorized, stale version, cancellation, unavailable provider) must be machine-readable for Section 06.

### Responsive Matrix
N/A; no layout is changed by this section.

### Accessibility Acceptance
N/A for direct UI; this section must not remove accessibility metadata consumed by the UI.

### Copy Contract
N/A; user-visible Thai/English text belongs to Section 06 localization resources. Never expose raw provider or secret errors.

### Browser Evidence Required
N/A for direct UI; integration browser evidence is collected in Section 06 and final hardening.
