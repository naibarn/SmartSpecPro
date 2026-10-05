# Spec 266 Deep Implementation Sections

<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-authority-and-contracts
section-02-registry-rights-provenance
section-03-semantic-geo-temporal
section-04-data-resolution-and-retrieval
section-05-research-plane
section-06-emergency-profile-compatibility
section-07-governance-admin-observability
section-08-migration-acceptance-and-production-gates
END_MANIFEST -->

Execution is dependency ordered. Implement schema-free slices while `orchestra/.wave-active` exists; do not edit Drizzle schema/migrations until its owner clears the single-writer marker.

| Section | Depends on | Main output | Gate |
|---|---|---|---|
| 01 Authority and contracts | — | Versioned contracts and owner map | Focused tests |
| 02 Registry and provenance | 01 | Rights-aware append-only services | Schema owner blocks migrations |
| 03 Semantic and geo-time | 01–02 | Semantic/geometry/entity projections | Focused tests |
| 04 Resolution and retrieval | 01–03 | Authorized resolver/index lifecycle | Focused tests |
| 05 Research plane | 01–04 | Durable request/run/admission composition | Runtime and schema gates |
| 06 Emergency compatibility | 02–04 | Lossless 260/262 adapters | No cutover/dual write |
| 07 Governance/admin | 01–06 | Audited admin, packs, observability | UI evidence where touched |
| 08 Migration/acceptance | 01–07 | Evidence map and operating gates | Production proof external |

Never claim production completion without environment/provider/migration proof in Spec §47. `worker_jobs` plus outbox remains the only durable async authority.
