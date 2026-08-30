# Section 05 — World rules, genre profile, and media capability bridge

## Scope

Support fantasy, sci-fi, future, cartoon/high-spectacle, realistic combat,
creatures, transformations, and cinematic non-explicit intimacy through
provider-neutral story contracts.

## Owned paths

- `apps/web/shared/verticalDramaSeries/longFormContracts.ts`
- existing audience/safety, visual narrative, motion, and provider policy
  modules
- new world-rule/capability validator and focused tests

## Design

Every power/technology/miracle declares origin, limit, cost, user scope,
escalation, and visual signature. Capability tags resolve to supported,
fallback, unavailable, or blocked through provider policy. No future provider
API is hard-coded into the story contract.

## TDD acceptance

- A free miracle or rule without cost blocks.
- Unsupported capability cannot silently pass.
- Safe fallback preserves narrative causality.
- Adult non-explicit intimacy is plot-relevant and minor-safe.

## UI/UX Contract

### Target User / JTBD

N/A — provider-neutral capability service; user presentation is Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — capability states are returned as typed findings.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — provider-policy contract tests are sufficient for this section.

## Implementation notes

Provider-neutral world-rule validation and supported/fallback/unavailable/
blocked capability resolution are implemented in
`verticalDramaLongFormDomain.ts`; no provider-specific media API is stored in
the story contract.
