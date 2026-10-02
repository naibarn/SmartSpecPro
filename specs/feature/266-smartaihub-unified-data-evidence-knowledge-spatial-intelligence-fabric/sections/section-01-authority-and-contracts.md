# Section 01 — Authority Inventory and Versioned Contracts

## Scope

Map Specs 260/262 owners and define versioned Spec 266 contract boundaries for source, data, evidence, temporal, lineage, and research references. Do not migrate existing canonical rows or activate unverified source packs.

## Spec coverage

Spec 266 §§2–4, 6, 44–45 Phase 0, 46.11–46.12, Appendix A–E; cross-reference Spec 265 §§2, 6, 10.1.

## Implementation

- Produce a checked compatibility inventory for `emergencyIntelSources`, captures, hydrology stations/observations, geo watches, refresh route/job, and renderer projection.
- Inventory is recorded in [`compatibility-inventory.md`](../compatibility-inventory.md); it records current owners and explicit no-cutover/no-dual-write boundaries.
- Add runtime schemas/types with explicit contract versions and public-vs-tenant scope; reject omitted/ambiguous authorization scope.
- Establish stable reference mapping rules and fail-closed unknown versions.
- Preserve worker_jobs/outbox as the only durable asynchronous job authority.

## Tests

- Contract parsing rejects unknown version, missing scope, oversized identifiers, and secret-bearing payloads.
- Compatibility inventory test or validation proves no second registry/write authority was added.

## Acceptance

Relevant clauses are §§46.11–46.12 items 76–87. No database ownership cutover in this section.
