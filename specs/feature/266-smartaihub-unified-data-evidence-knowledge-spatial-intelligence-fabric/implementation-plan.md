# Spec 266 Implementation Plan

## Goal

Implement Spec 266 in dependency order as additive, owner-safe capabilities. Spec 260 remains emergency authority, Spec 262 remains renderer/geospatial operational authority, and existing `worker_jobs` plus outbox remain the durable execution authority. No migration cutover or external provider activation is implied by local code.

## Dependency order

1. Repository authority inventory and compatibility map (§§2, 44, 45 Phase 0).
2. Shared contracts, registry, rights, provenance, source health and evidence persistence (§§3, 5–9, 12–15; Phase A).
3. Semantic, entity, geographic, spatial and temporal contracts/projections (§§16–21; Phase B).
4. Resolver, retrieval, indexes, query planning, caching, revocation and security (§§22–31; Phase C).
5. Research admission, immutable runs/artifacts, candidate admission, identity/dependency/corroboration and watches (§§10–11; Phase D).
6. Emergency profile compatibility/adapters; retain current 260/262 write authority until lossless per-source cutover proof (§§34–37; Phase E).
7. Packs, governance, observability, admin surfaces, acceptance and operational gates (§§32–33, 38–48; Phase F and DoD).

## Codebase evidence and boundaries

- `apps/web/server/services/geoSources/*` is existing 260/262 source refresh work and an adapter input, not a second registry or complete Fabric runtime.
- `apps/web/drizzle/schema.ts` already contains 260/262 emergency source, capture, hydrology and watch authority. This work must preserve it and avoid dual writes.
- `apps/web/server/services/jobControlPlane.ts` and the transactional outbox are canonical async job authority.
- No full Spec 266 registry/resolver/research persistence runtime was found during targeted discovery.
- The worktree is already heavily modified. Edit only exact owned hunks/paths; never reset, stash, broadly stage, commit, or deploy.
- Repo typecheck is prohibited by AGENTS.md due RAM policy. Use focused Vitest, migration metadata check, and `git diff --check` only.

## Section manifest

Each implementation section maps all normative clauses in the spec to code, tests, or an explicit external proof gate. A code implementation does not close the production DoD without runtime/provider/data rights and migration evidence.

<!-- SECTION_MANIFEST
section-01-authority-and-contracts.md
section-02-registry-rights-provenance.md
section-03-semantic-geo-temporal.md
section-04-data-resolution-and-retrieval.md
section-05-research-plane.md
section-06-emergency-profile-compatibility.md
section-07-governance-admin-observability.md
section-08-migration-acceptance-and-production-gates.md
-->

## Completion semantics

Sections may be marked complete only when focused proof passes and every acceptance item in their mapped scope is implemented or explicitly identified as a verified external gate. A production claim requires §47 evidence; source-candidate catalogs with unverified rights/endpoints remain disabled.
