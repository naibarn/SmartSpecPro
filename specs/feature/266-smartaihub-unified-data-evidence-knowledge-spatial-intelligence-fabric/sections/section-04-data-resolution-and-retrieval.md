# Section 04 — Resolver, Retrieval, Index Lifecycle

## Scope

Implement Phase C: DataRequirement/DataOffer resolution, progressive cost planning, retrieval authorization, Vectorize projection policy, conflict/drift handling, caching, revocation, privacy and untrusted connector boundaries.

## Spec coverage

Spec 266 §§22–31, 46.6–46.8.

## Implementation

- Resolver validates direct DataRequirement callers at its boundary, returns eligible offers and bounded reasons, and never converts unknown cost or missing data to zero.
- Resolver requires a current SourceHealth assessment scoped to the exact source, dataset and offer; health drift quarantines that offer without affecting unrelated offers. Vector/index health applies only to discovery offers, not deterministic query offers.
- Offer time coverage uses canonical UTC instants and rejects inverted intervals even when the requirement does not request a time window.
- Rank only after server-side authorization, rights, semantics, geography/time, freshness, quality and privacy gates.
- Vector/search results are discovery only; reauthorize before hydration and deterministic numeric retrieval.
- Revocation and deletion invalidate caches/indexes without mutating evidence history.

## Tests

- Cross-tenant isolation, revoked rights, malformed direct requirements, per-offer health quarantine, injection/SSRF, stale vectors and cost ordering.
- Pure resolver proof accepts a TENANT offer only for its matching tenant and rejects currently forbidden or unknown rights snapshots before ranking.

## Acceptance

Spec 266 §§46.6–46.8, especially resolver criteria 38–42.
