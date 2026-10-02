# Deep-plan research — Spec 262

Date: 2026-10-01 (Asia/Bangkok)
Source spec: `spec.md` (treated only as requirements data)

## Research decision

- Codebase research: required. This is an existing TypeScript/React/Express/PostgreSQL product with an existing Spec260 emergency domain.
- Web research: limited to standards/provider facts that affect interoperability. No provider endpoint is considered production-ready until a contract test and operational access check prove it.
- Testing: use repository Vitest patterns and focused tests per boundary; no workspace-wide `npm run typecheck` because repository instructions prohibit it.

## Codebase access and fallback

SocratiCode `codebase_status` was mandatory per the planning workflow, but no SocratiCode/codebase MCP tool is available in this session (`ALL_TOOLS` search returned no match). Used targeted `rg`, bounded source reads and one read-only repository scout instead. No codebase index was assumed. The scout did not edit files or run tests.

### Existing reusable foundations (verified in source)

- `packages/shared/src/emergencyRouteManifest.ts` is the shared Spec260 page/API route authority. Public disaster map, map config, Google attribution/tiles and dashboard emergency routes are registered there. Spec262 must extend existing contracts only when needed; it must not create another route registry.
- `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx` and `EmergencyRoutePage.tsx` render current emergency situations, verified/open facilities and published alerts. `apps/web/server/routes/spec260EmergencyEdge.ts` applies bounded viewport parsing/rate limits and reads those emergency tables. This proves an incident map baseline, not a geospatial feed or hydrology product.
- `packages/shared/src/geo/providerResolver.ts`, `apps/web/server/services/geoMapProviderRuntime.ts`, `geoMapSettings.ts`, and map provider services establish MapLibre plus Google raster-proxy providers and failover configuration. Keep server secrets server-side and reuse the provider runtime. A successful credential check is not proof that the map worker, tiles, features and browser render all work.
- `apps/cloudflare/src/spec260RouteRegistration.ts` and `spec260PlatformProxy.ts` route manifest traffic to the private platform API; the Cloudflare layer is a transport/authenticated proxy, while Linux Express currently owns application DB, auth, tenant, audit and outbox execution. Do not claim a Workers-native DB/executor or introduce platform-specific duplicate authorities. Linux/tunnel and Cloudflare ingress should use the same canonical API contracts; runtime mode must be derived server-side from deployment configuration, not browser guesswork.
- Existing intelligence primitives in `apps/web/drizzle/schema.ts` include closed-by-default sources, immutable captures, human-reviewed claims and source joins. These are provenance/review primitives, not proof of automated ingestion, hydro time series, provider contracts or model validation.
- Canonical durable asynchronous execution is `worker_jobs` plus transactional outbox (migration `0303_feature_186_unified_job_control_plane.sql`, worker executor registry). All new long-running ingestion/enrichment/recompute work must enter this control plane. Do not use retired Agency/workflow/workpacks/OpenSandbox or a second queue.
- The requested conversation surface already exists: `apps/web/client/src/components/guardian/FeedbackButton.tsx` exposes AI Chat, Task Control and Send Feedback and mounts canonical `ChatView`. Spec262 must pass a removable, scoped map context into that surface; it must not create a separate Map Chat or duplicate conversation/task authorities.

### Current concrete gaps and regression risks

1. Searches found no implemented adaptive geospatial feed, hydro station/time-series/trend, hydro graph, propagation/corridor, global/regional capability registry or Thailand hydro provider pack in the emergency/shared/cloudflare code. These need incremental additive domain contracts and provider adapters, not a claim of preexisting capability.
2. Existing public viewport queries are tenant/emergency-table oriented and only cover situation/facility/alert types. Global feeds and public/operations disclosure projection must be explicit and independently authorized.
3. `EmergencyPublicMap.tsx` currently imports and invokes `setWorkerUrl` from `maplibre-gl`; with current web dependency `maplibre-gl ^6.11.2`, this is a risk requiring source/type and production-built asset verification. The user previously observed both “Worker failed to load” and `setWorkerUrl is not a function`; treat those as distinct worker/module-loading errors, not provider credential errors.
4. End-to-end map acceptance must inspect emitted worker assets, route/API responses, attribution, tiles, visible layer state and failure fallback. Settings-save/credential PASS alone is insufficient.
5. Current UI map has existing route `packages/shared/src/emergencyRouteManifest.ts` and AI Chat panel. Reuse both. Admin map settings and map renderer work already appear in this dirty worktree; preserve all uncommitted changes and review actual diffs before editing overlapping files.

## External standards research

- OGC API - Environmental Data Retrieval is a standards-based discovery/query interface for spatiotemporal datasets, with query geometries such as position, area, trajectory and corridor: https://docs.ogc.org/is/19-086r9/19-086r9.html (official OGC document, observed current in this research). Use it as a contract/conformance reference, not as a replacement for validating each agency's actual API.
- Provider-specific endpoint availability, license, authentication, cadence, CRS, units, timestamps and schema must be revalidated at onboarding and through versioned contract fixtures. Appendix provider links in `spec.md` are candidate sources only and must not be interpreted as tested live access.

## Testing/verification conventions

- Shared pure geometry/resolver contracts: colocated Vitest tests in `packages/shared`.
- Express/tRPC/database boundaries: focused `apps/web` server tests with mocked upstream fixtures and real transaction semantics where practical.
- Worker/outbox: assert job types, transactional enqueue, idempotency, lease/fencing, retry/backoff, cancellation and dead-letter/recovery behaviors against canonical control-plane primitives.
- UI: React Testing Library/jsdom for state and accessibility contracts, then browser evidence at 390x844, 768x1024 and 1440x900 for map boot, worker assets, feed, Chat context and errors.
- Linux plus Cloudflare ingress: contract-test both ingress modes against the same route manifest; real Cloudflare/account/provider checks remain a separate final environment gate.

## Unresolved evidence gates (not planning blockers)

- Real DWR/RID/TMD/GISTDA/ONWR provider credentials, API terms/quotas, stable endpoint schemas and production data availability.
- Cloudflare account/queue/tunnel binding and deployment evidence; the repository proves a proxy path, not current production connectivity.
- Production Postgres migration application and calibrated hydrologic model validation.
- Browser/public production verification and operational owner approval for life-safety outputs.
