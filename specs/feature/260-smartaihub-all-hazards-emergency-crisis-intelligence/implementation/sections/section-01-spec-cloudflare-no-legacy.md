# Section 01 — Spec Cloudflare-First Delivery Without Legacy Compatibility

## Goal

Make the current normative Spec 260 direction unambiguous before feature implementation starts. Spec 260 is implemented as a Cloudflare-first product. It does not add support for the old runtime or old application clients. Real Cloudflare account/environment validation happens once, after the whole implementation and its local/CI gates are ready.

## Source requirements

- User direction: use Cloudflare as the complete target service and do not come back to legacy compatibility.
- `development-plan.md`, sections 2, 4 and 5: remove ambiguity in existing compatibility passages, preserve canonical platform contracts, and defer real provider checks until Wave 14.
- Spec 260 existing architecture boundaries: PostgreSQL/PostGIS is authoritative for emergency and geospatial state; `worker_jobs` plus the transactional outbox owns durable jobs; Cloudflare Queues are transport; public and restricted projections are distinct.
- Spec 245 remains the platform migration authority. Do not rewrite or claim completion of its production cutover as part of this section.

## Required change

Append a clearly dated/revisioned normative addendum at the end of `spec.md`. Do not rewrite the historical review passes. State that this addendum takes precedence whenever earlier Spec 260 language can be read as requiring legacy compatibility.

The addendum must specify:

1. **Runtime:** new Spec 260 production routes and jobs use the approved Cloudflare-first runtime and bindings. There is no legacy runtime dispatch, traffic split, dual-run/shadow route, dual-write, compatibility adapter, or automatic fallback to the old service.
2. **Client versions:** no old SmartAIHub client release is a supported deployment target for this feature. APIs may be explicitly versioned for safe evolution and external standards interoperability, but must not preserve obsolete client behavior or silently reinterpret old payloads.
3. **Routes:** one canonical route table owns public, authenticated, verified, and operations pages/APIs. Routes must not redirect into a retired or legacy application surface. Public emergency information and minimum anonymous reporting remain usable when account services are unavailable.
4. **Authorities:** retain the already-approved authorities for PostgreSQL/PostGIS, authz/tenant scope, `worker_jobs`/outbox, credits/accounting, audit, media, model routing, Skills, and notifications. Reuse means integrating their current canonical contracts, not retaining a retired runtime or introducing a duplicate authority.
5. **Cloudflare placement:** Workers serve the edge/API boundary; KV/CDN are non-authoritative caches with bounded freshness; R2 holds protected originals and approved derivatives; Queues carry work admitted through the canonical outbox; Durable Objects are used only for a concrete coordination/realtime need; Hyperdrive is used only under the approved database connection contract. No Cloudflare product is selected as a substitute authority merely because it is available.
6. **Schema and rollback:** no dual-schema support for an old application or rollback to the old runtime. Database changes are forward-safe and preserve accepted emergency/financial facts. A release rollback can target a prior Cloudflare release only when it can safely handle all accepted records; otherwise use a fenced forward fix or enter a controlled service hold.
7. **Development verification:** local tests, fakes, static/config checks and CI may be prepared during implementation, but no real Cloudflare resource provisioning, credential probe, deployment, canary or provider behavior assertion is performed until the final integrated Cloudflare gate after all implementation sections are complete.
8. **Evidence:** mocks/local CI do not prove Cloudflare entitlement, binding availability, deployed routing, real provider delivery or production readiness. The final report must distinguish local/CI evidence, Cloudflare staging evidence, and production evidence.
9. **External interoperability:** CAP, MCP, agency feeds and other explicitly specified external standards remain supported where required by Spec 260. This is standards interoperability, not backward compatibility with SmartAIHub's old runtime or clients.

## Tests and source checks to author

- Add a focused spec consistency check or documented grep-based check proving the addendum exists and explicitly governs the legacy compatibility language around passes 246–247 and 300.
- Add a source-level regression test in a later route/runtime section that rejects any Spec 260 legacy router, old-runtime fallback, dual-write, or old-client shim.
- This section is documentation-only: no product test is run now. The user requested one test pass after all implementation sections are complete.

## Acceptance criteria

- Spec 260 has one clear precedence statement and runtime/compatibility policy.
- Existing historic pass text remains intact for provenance, with current applicability clarified by the addendum.
- Cloudflare staging and production verification remain explicitly unclaimed and deferred to the final integrated phase.
- This change does not alter Spec 245/257, shared migration services, or unrelated dirty files.

## Scope boundaries

- Do not edit application code, migrations, or Cloudflare configuration in this section.
- Do not run tests, provisioning, Wrangler commands, account probes, or deployments.
- Do not stage or commit; the repository contains unrelated dirty work on `main`.

## Actual implementation record

**Implemented:** Appended Spec 260 R1.37, covering Cloudflare-first runtime, no old-client/runtime compatibility, canonical platform authorities, forward-safe data handling, final-only real Cloudflare verification, and standards interoperability. Independent review then identified and closed additional safety gaps: anonymous intake success requires PostgreSQL/outbox commit; one shared route manifest owns browser/Worker route IDs; R2 is byte storage behind canonical media records; queue envelopes are reference-only under fenced leases; the feature fails closed without its Cloudflare binding without changing unrelated platform transports; additive replay-safe migrations remain allowed; and retired-system names are explicitly prohibited. Historical R1.1–R1.36 text was preserved as provenance and superseded where needed by R1.37.

**Files:** `specs/feature/260-smartaihub-all-hazards-emergency-crisis-intelligence/spec.md`.

**Verification:** Source was read at the end and the new addendum heading/content were checked by targeted text search. No tests, deploys, Cloudflare probes, staging checks, or production checks were run; the user requested that product tests be run once after full implementation, and R1.37 defers live Cloudflare checks to the final integrated phase.

**Review status:** Independent read-only review completed; all nine findings were incorporated into R1.37 and the development plan. No findings remain open for this section.
