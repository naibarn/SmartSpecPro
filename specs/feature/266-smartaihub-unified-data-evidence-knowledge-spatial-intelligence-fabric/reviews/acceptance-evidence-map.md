# Spec 266 Acceptance Evidence Map

Checked in the isolated implementation worktree on 2026-10-05. This is a source/test inventory, not production certification. A local unit test proves only its stated boundary.

| Spec criteria | Local owner / proof surface | Current classification | Closure evidence still required |
|---|---|---|---|
| 46.1–46.3 (1–21): source, rights, evidence | `intelligenceFabric/{registry,registryPersistence,contracts,sourceHealth}.ts` and focused tests | Partial; admissions and pure policy exist, authoritative activation/rights/evidence persistence remains gated | Trusted rights receipt and activation lifecycle; durable append/revocation; source-health history; runtime authorization tests |
| 46.4–46.5 (22–31): semantics, geo/time | `intelligenceFabric/{semantic,geometry,spatialOps}.ts` and focused tests | Local calculations/contracts; canonical versioned source binding unverified | Versioned canonical input fixtures, boundary/time integration and Spec 262 projection evidence |
| 46.6 (32–37): retrieval/index | `intelligenceFabric/resolver.ts`; Spec 229 boundary in R1.2 | Partial policy seam; managed retrieval integration unverified | Provider-backed catalog, hydration reauthorization, revocation/index watermark, deterministic numeric retrieval |
| 46.7 (38–42): resolver | `intelligenceFabric/resolver.ts` and tests | Pure bounded resolver only | Server-owned offer/policy composition, real source execution, missing coverage and cost behavior end-to-end |
| 46.8 (43–47): security | Contracts and focused negative tests | Local input bounds only | SSRF/egress, prompt-injection, cross-tenant cache/vector tests and secret mediation integration |
| 46.9 (48–57): emergency | `compatibility-inventory.md`; Spec 260/262 existing owners | Authority mapping only; no new writer or renderer | Replay/compatibility tests and a live Spec 260/262 consumer proof |
| 46.10 (58–75): research | `research{Contracts,Admission,Persistence}.ts`, `researchRunPersistence.ts` and tests | Tenant request/job admission and immutable run receipt seams exist; executor, candidate promotion, notices and full rights gates remain partial/blocked | Approved runtime composition, real run, candidate promotion admission, source/dependency graph and notice ordering proof |
| 46.11 (76–79): migration | `compatibility-inventory.md` | Ownership map only; cutover not performed | Named source owner, replay parity, count/hash reconciliation, rollback rehearsal, compatibility suite |
| 46.12 (80–89): portable knowledge | Spec R1.2 + Section 07 plan | Contract/ownership requirements only; canonical object persistence/runtime not verified | Schema-owner window, authorized roundtrip fixture/hash/citation proof, rights re-evaluation and Spec 278 integration |
| §47 (production DoD 1–23) | This map plus source and runtime evidence | OPEN; no production promotion claim | Every numbered gate requires environment/provider/runtime/deployment/operator evidence as specified by §47 |

## Hard gates

- `orchestra/.wave-active` remains owned by the separate Wave 3 / Wave 4A work. This implementation does not change Drizzle schema, SQL migrations, journal/snapshot, apply migrations, or release the marker.
- Repository tests, static inspection, and adapters do not prove provider rights, external executor configuration, production deployment, rollback, or live user utility.
- Source candidates without independently reviewed endpoint, rights, cadence, schema, freshness, attribution, and operating contact remain disabled.
