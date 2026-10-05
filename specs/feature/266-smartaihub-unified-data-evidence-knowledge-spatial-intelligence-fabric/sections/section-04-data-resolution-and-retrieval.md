# Section 04 — Resolver, Retrieval, Index Lifecycle

## Scope

Implement Phase C: DataRequirement/DataOffer resolution, progressive cost planning, retrieval authorization, Vectorize projection policy, conflict/drift handling, caching, revocation, privacy and untrusted connector boundaries.

## Spec coverage

Spec 266 §§22–31, 46.6–46.8.

## Implementation

- In `resolver.ts`, validate direct DataRequirement callers at the boundary, bound rejection detail, preserve unknown cost/coverage, and require health bound to the exact source/dataset/offer and current policy version.
- Apply authorization, tenant scope, rights, semantics, geography/time, freshness, quality, placement, and privacy gates before ranking. Use canonical UTC instants and reject inverted offer windows even when the caller omitted a desired window.
- Keep Vectorize/search as discovery. Reauthorize before hydration or deterministic numeric retrieval; deterministic queries remain available when index health fails.
- Bound query plans, provider fan-out, and cache lifetime by rights, freshness, and retention. Revocation/deletion invalidates projections and cache only, never immutable evidence.
- Keep connector input untrusted; reject unsafe URL resolution/SSRF and secret-bearing query or error content.

## Tests

- Extend `resolver.test.ts` with direct-input, scope/rights, health isolation, time, unknown-cost, index-outage, stale projection, revocation, cache, and SSRF/injection cases.

## Acceptance

Spec 266 §§46.6–46.8, especially resolver criteria 38–42.
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

## Implementation evidence (2026-10-05)

- Pure resolver inputs are validated at the boundary and bind offers to a current policy version and independently scoped health. Index health gates vector discovery only; deterministic source retrieval remains separate.
- Vector candidates are reauthorized before hydration and must match the current canonical evidence revision/hash and index generation. Cached candidates are rechecked against current rights/authorization and expiry, with expiry capped by source freshness, health, rights validity, and retention. Connector URLs require HTTPS plus exact host allowlisting, reject credential-bearing query strings and local/IP-literal hosts; runtime DNS/egress enforcement remains required.
- Progressive evidence planning propagates the server-resolved policy version to the resolver.
- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/resolver.test.ts server/services/decisionIntelligence/evidencePlan.test.ts` — 2 files, 24 tests passed after review fixes, including cache timestamp, rights expiry, metadata-only hydration and generation/hash checks; `DataOffer` statically requires the content-hydration policy field. `git diff --check` passed.
- External gate: no managed Retrieval Broker/vector runtime currently composes these pure contracts in this slice; live ACL/cache/index revocation and provider SSRF/egress proof remain open.
