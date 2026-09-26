# Section 02 — Search Cache KV and Admin Control

## Goal

Move the noncritical Responses API web-search cache off Redis and make its Cloudflare configuration understandable and operable from Admin Infrastructure.

## Contract

- Cache scope is only `SearchResultCache`; this does not switch sessions, lock, rate limit, queue or other Redis responsibilities.
- Cloudflare Worker receives authenticated `POST /internal/cache/search` operations and requires binding `SEARCH_RESULT_CACHE`. Use discriminated requests `{operation:"probe"}`, `{operation:"get",scope,id,queryHash}`, and `{operation:"put",scope,id,queryHash,entry,ttlSeconds}`. `probe` confirms token/binding readiness without exposing application cache records.
- Gate the cache route independently from queue/job `CLOUDFLARE_ACTIVATION`; enabling cache must not activate job processing.
- Use a dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` secret, not a browser setting and not a token reused for unrelated APIs.
- Node adapter uses `CLOUDFLARE_RUNTIME_URL` plus the dedicated token. In active Cloudflare mode, failure means cache miss/no-op; it never falls back to Redis.
- Enforce allowed key tiers, tenant/user scoping, bounded key/identifier length, maximum body size, JSON shape, TTL between 1 and 3600 seconds, no-store responses and token comparison.
- Admin control selects `Disabled` or `Cloudflare KV` only after a backend-side authenticated probe succeeds. Persist only the provider enum through an admin-only setting; runtime processes refresh it with a bounded cache delay. The API returns sanitized readiness; secret stays in environment/deploy pipeline.
- Setup guide describes namespace creation, binding, secret, deploy, health/probe, enablement, disablement, troubleshooting, and which Redis functions remain separate.

## Relevant source surfaces

- `apps/web/server/services/searchResultCache.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routers/infrastructure.ts`
- `apps/web/client/src/components/admin/InfrastructureSettingsPanel.tsx`
- `apps/cloudflare/src/contracts.ts`, `src/index.ts`, `wrangler.jsonc`

## Tests before implementation

- Worker rejects unauthenticated, oversized, invalid-tier, malformed and TTL-out-of-range requests; KV errors return typed unavailable response; probe never returns tenant/user cache data.
- Node get returns miss and set becomes no-op on timeout, HTTP error, invalid response and missing config; configured KV mode never calls Redis.
- Admin cannot enable before endpoint/binding are ready; successful switch refreshes status; error retains prior state; secret never appears in UI/API.
- UI guide exposes every exact binding/secret/endpoint setup step in Thai and responsive layout.

## Acceptance

- Search cache read/write works through Worker KV and route returns normal model result on cache miss or KV outage.
- Freshness bypass remains intact; tenant cache and user cache cannot cross-scope.
- Admin switch actually changes server runtime behavior and cannot imply that it provisions Cloudflare resources.

## Rollback/recovery

Before selection, use disabled/bypass to avoid cache. After KV selection, keep Redis cache records untouched but do not use them as fallback. If KV fails, cache miss/no-op preserves user response. Disable cache in Admin while fixing; no business data requires restoration.

## UI/UX Contract

### Target User / JTBD

Platform admin needs to understand the status of the one cache migration and safely enable or disable it.

### Surface Inventory

Admin Settings → Infrastructure → Cache / Redis tab. No separate global Cloudflare cutover screen is added by this section.

### Component Map

Add a Cloudflare KV cache card in `InfrastructureSettingsPanel`; status/readiness query and admin-only mode mutation live in the infrastructure router/service. Secret remains in environment/deployment configuration.

### State Matrix

Loading, unconfigured/disabled, ready/off, ready/on, probe pending, save pending, probe failure, save failure (retain prior state), success and access-denied. A disabled binding/token must never appear as enabled.

### Responsive Matrix

Mobile uses one column; tablet/laptop/desktop may show status and mode side by side. Long commands/config blocks scroll horizontally without forcing page-level overflow.

### Accessibility Acceptance

Switch has an explicit label and description, works by keyboard, displays focus, and status is conveyed in text as well as color. Guide steps use semantic ordered lists and external links have descriptive names.

### Copy Contract

Thai-first through existing i18n conventions. State that KV cache miss/outage does not stop the request, that the switch affects only Search Result Cache, and that saving the switch does not provision Cloudflare resources. Never display a token.

### Browser Evidence Required

Check mobile/tablet/desktop plus unconfigured/off/on/error/loading; keyboard interaction; no token in DOM/network response; no overflow; and accurate endpoint/binding instructions. Record browser proof only after an actual browser run.

## Implementation status (2026-09-26)

- Implemented local Worker KV binding contract and authenticated `POST /internal/cache/search` probe/get/put endpoint. Probe performs an expiring KV write/read; endpoint responses use `Cache-Control: no-store`.
- Search cache now uses a dedicated Node adapter controlled by the admin setting `search_result_cache_provider`; default is disabled. KV failures are misses/no-ops, and the Responses API no longer imports Redis for this cache.
- Admin UI now exposes the cache-only switch and Thai setup steps for namespace, binding, Worker secret, Web endpoint/token, probe, cutover, and troubleshooting. It does not provision resources or expose secrets.
- A review caught a cross-tenant cache key issue before enablement; the authenticated tenant is now passed to the JSON handler and a regression test checks independent tenant keys. Scope IDs are base64url encoded in Worker KV keys.
- Focused proof: Cloudflare Worker tests passed (24 tests); web Responses/cache tests passed (71 tests). `git diff --check` passed. Browser proof, TypeScript check, deployed Worker probe, and target-account proof remain outstanding.
- SocratiCode was unavailable; targeted shell discovery and focused tests were used. This is local implementation evidence only, not a Cloudflare target deployment claim.
