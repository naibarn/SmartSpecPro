# Section 01 — Authority Inventory and Versioned Contracts

## Scope

Map Specs 260/262 owners and define versioned Spec 266 contract boundaries for source, data, evidence, temporal, lineage, and research references. Do not migrate existing canonical rows or activate unverified source packs.

## Spec coverage

Spec 266 §§2–4, 6, 44–45 Phase 0, 46.11–46.12, Appendix A–E; cross-reference Spec 265 §§2, 6, 10.1.

## Implementation

- Verify `compatibility-inventory.md` for emergency sources/captures, hydrology, geo watches, refresh jobs, MapLibre projections, Decision Intelligence, SPAAS, and Spec 278 ownership.
- In `server/services/intelligenceFabric/contracts.ts` and `researchContracts.ts`, maintain explicit versions, reference-only bounded payloads, mandatory PUBLIC/TENANT scope, and detached nested snapshots.
- In `decisionIntelligence/researchAdapter.ts`, map consumers into the canonical request without copying evidence authority into caller payloads.
- Fail closed on unknown versions and unresolved authority. Preserve `worker_jobs` plus transactional outbox as the sole async authority.

## Tests

- Extend `contracts.test.ts`, `researchContracts.test.ts`, and adapter tests for unknown version/scope, size limits, secret fields, sparse arrays, and mutation after parse.
- Validate compatibility ownership and assert no duplicate writer or retired-system entry point was introduced.

## Acceptance

Relevant clauses are §§46.11–46.12 items 76–87. No database ownership cutover in this section.
## Completed evidence

- Updated the compatibility inventory with inspected runtime ownership for Specs 260/262 and explicit normative-only ownership mappings for Specs 261/265/278/229. Spec 278 implementation was not inspected; its local SQLite/FTS5 provider, bundle mechanics, and capability negotiation are recorded from the Spec 266 R1.2 contract only.
- Existing parser coverage plus new focused cases proves explicit scope/version, secret/bounds rejection, sparse arrays, detached snapshots, missing server project authority rejection, and rejection of caller-supplied source/rights/evidence authority. No production writer or route changed in this section.
- Compatibility delta validation: only `researchAdapter.test.ts` changed under application source; `git diff --cached --unified=0 -- 'apps/web/**/*.ts'` contained no retired-system call pattern (`work/request`, `workpacks`, `/workflows`, `OpenSandbox`, `sandbox_jobs`, `Agency`). No new writer was introduced.
- Verification: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/researchContracts.test.ts server/services/decisionIntelligence/researchAdapter.test.ts` — 3 files, 27 tests passed; `git diff --check` passed.

## UI/UX Contract

### Target User / JTBD
- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.

### Existing Pattern Reference
- N/A: no user-facing surface is added by this section.

### Surface Inventory
- N/A: no route/page/dialog/form/table is added.

### Component Map
- N/A: no client component is added.

### State Matrix
- N/A: no browser state is added.

### Responsive Matrix
- N/A: no browser layout is added.

### Accessibility Acceptance
- N/A: no user-facing control is added.

### Copy Contract
- N/A: no user-facing copy is added.

### Browser Evidence Required
- N/A: no browser-visible changes are planned in this section.
