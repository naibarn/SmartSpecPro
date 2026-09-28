# Section 02 — Search Cache KV and Admin Control

## Goal

Move the noncritical Responses API web-search cache off Redis and make its Cloudflare configuration understandable and operable from Admin Infrastructure.

## Contract

- Cache scope is only `SearchResultCache`; this does not switch sessions, lock, rate limit, queue or other Redis responsibilities.
- Cloudflare Worker receives authenticated `POST /internal/cache/search` operations and requires binding `SEARCH_RESULT_CACHE`. Use discriminated requests `{operation:"probe"}`, `{operation:"get",scope,id,queryHash}`, and `{operation:"put",scope,id,queryHash,entry,ttlSeconds}`. `probe` confirms token/binding readiness without exposing application cache records.
- Gate the cache route independently from queue/job `CLOUDFLARE_ACTIVATION`; enabling cache must not activate job processing.
- Use a dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` secret, not a browser setting and not a token reused for unrelated APIs.
- Node adapter uses `CLOUDFLARE_RUNTIME_URL` plus the dedicated token. In active Cloudflare mode, failure means cache miss/no-op; it never falls back to Redis.
- Enforce allowed key tiers, tenant/user scoping, bounded key/identifier length, maximum body size, JSON shape, TTL between 60 and 3600 seconds (Cloudflare KV minimum), no-store responses and token comparison.
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
- Admin UI now exposes the cache-only switch plus a Cloudflare tab listing all required Worker bindings, optional `SEARCH_RESULT_CACHE`, endpoints, secrets, and hostname/route setup. Thai setup steps cover namespace, binding, Worker secret, Web endpoint/token, probe, cutover, and troubleshooting. It does not provision resources or expose secrets. All eight infrastructure sub-tabs now have explicit accessible names even when their text labels are visually hidden on mobile.
- A review caught a cross-tenant cache key issue before enablement; the authenticated tenant is now passed to the JSON handler and a regression test checks independent tenant keys. Scope IDs are base64url encoded in Worker KV keys.
- Focused proof from the preceding implementation run: Cloudflare Worker tests passed (24 tests); web Responses/cache tests passed (71 tests); `git diff --check` passed. Current direct TypeScript run completed with 632 repository-wide errors; the filtered output had no diagnostics in `InfrastructureSettingsPanel.tsx`, `searchResultCache`, `cloudflareSearchResultCache` or the new browser spec.
- Browser proof: Playwright Chromium passed the Admin guide/cache-switch scenario at mobile (390 px), tablet (768 px) and desktop (1440 px), with tRPC responses mocked to an unconfigured target. It verified the guide/binding labels render, the switch remains disabled, keyboard tab navigation works, there is no horizontal page overflow, and no bearer-token text appears in the DOM. Evidence screenshots are in local `apps/web/test-results/cloudflare-search-cache/`. It did not test switch activation, all loading/error/on states, real network secret redaction, or production configuration.
- This browser run found that mobile tab names were inaccessible when visual labels were hidden; explicit `aria-label`s were added and the rerun passed. Local browser proof is not a deployed Worker probe or target-account proof.
- Target deployment proof (2026-09-26): authenticated Wrangler using the existing Vectorize credential with KV permissions; created namespace `SEARCH_RESULT_CACHE` (`df6d9bead8644d0f8f334f59b6bdfbeb`), deployed `smartspec-cloudflare-runtime` version `f6f0ba85-3d23-476e-b8af-55840609442d`, and attached custom domain `runtime.smartaihub.app`. The production deployment config is `apps/cloudflare/wrangler.production.jsonc`; it keeps `workers_dev:false` and `CLOUDFLARE_ACTIVATION=disabled` and binds only the cache namespace. A dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` was stored as a Worker secret and in the Web environment; values are intentionally absent from docs and command output.
- Live target probes: `/healthz` returned HTTP 200; authenticated `/internal/cache/search` probe returned HTTP 200 and `{"ready":true}`. `/readyz` returned HTTP 503 listing unrelated job/runtime bindings and no configured job handler. This is expected for the cache-only deployment and does not establish readiness for G2–G6.
- Direct cutover completed for the disposable SearchResultCache provider: PostgreSQL setting `infrastructure.search_result_cache_provider=cloudflare_kv`; `smartspec-web.service` restarted successfully and local Web `/healthz` returned `{"status":"ok"}`. A real app-adapter write/read roundtrip through the deployed Worker passed using an ephemeral entry with TTL. Cache entries are disposable; no Redis cache data was copied.
- G1 is not fully closed yet: capture one real beta Responses API search followed by a cache hit, and verify the old Redis caller/traffic for this cache is closed. Rollback is the Admin provider switch to `disabled`; the cache Worker can remain deployed. Do not infer global Redis retirement from this cutover.
- The earlier browser proof remains a mocked, unconfigured-target UI test at mobile/tablet/desktop. It verified layout and keyboard access, not the live production enablement UI. Earlier TypeScript run reported 632 repository-wide errors; no diagnostics were filtered to the changed cache/UI paths. This remains a repository baseline issue, not a passing typecheck claim.
- Follow-up Production verification (2026-09-26): the deployed Worker still passed `/healthz` and the authenticated KV probe. Synthetic Tenant A/B keys with the same query hash returned their own entries; a synthetic third tenant returned empty; unauthenticated probe returned HTTP 401. Redis scan found zero legacy `search_cache:*` keys. These checks do not substitute for Beta-user Search hit/miss traces or authenticated Production Admin UI review. Focused SearchResultCache/adapter tests passed 26/26, including network-failure miss/no-op behavior. G1 remains `VERIFICATION_INCOMPLETE` pending account-level and command-attribution proof.
- G1 evidence follow-up (2026-09-26): Web now forwards the sanitized `nanoid` trace ID to the Worker and logs only `{traceId, operation, outcome}` for KV get/put; no tenant, user, query, key or secret is logged. A production-browser spec is prepared to use local authorized storage-state files for both beta users and Admin. Fault injection is disabled by default and requires both a temporary Worker/Web flag and an authenticated Admin request header; the Worker returns a simulated get failure before touching KV. This code has local tests but has not been deployed or run on Production. No authorized browser state, Production URL/model config, or browser connector was available in the environment.
- G2 security preflight follow-up: read-only Production metadata confirms migration head `0344_runner_session_fencing` (local journal index 328) matches by hash; exactly 0345–0349 are pending, the required `users.id` FK type matches, and the four new tables are absent. Five migrations were executed in order in a disposable test schema transaction and rolled back. Current read-only Redis audit found 275 active JTI revocations and zero login counters, device grants, or Runner/Worker pairing keys. Production backup/restore evidence and the separate G2-D keyring are still missing; no Production migration, import, deploy or caller cutover was performed.
