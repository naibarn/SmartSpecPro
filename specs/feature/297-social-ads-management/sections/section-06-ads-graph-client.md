# Section 06 — F02 core: adsGraphClient + AdsProvider seam + BUC governor + Redis cache

**Section id:** `section-06-ads-graph-client`
**Rollout phase:** P1
**Depends on:** `section-02-shared-primitives` (Money, accountTime, adsErrorMap, sanitizer), `section-04-ads-connection-service` (`getDecryptedAccessToken`, `markExpired`)
**Blocks:** section-07 (read router), section-08 (mutations), section-09 (monitor), section-11 (page insights)
**Parallelizable with:** section-05
**Working directory:** `apps/web/`
**Test command:** `cd apps/web && pnpm test`

---

## 1. Goal

Build the ONE Graph API access layer every ads feature uses — resilient, token-safe, rate-aware, paginated. Nothing outside this section (plus `socialAdsConnectionService`) may ever call `graph.facebook.com` directly. Deliverables:

1. `AdsProvider` interface + provider registry (Meta is the only v1 implementation, but routers/jobs consume the interface, never `MetaAdsProvider` directly).
2. `adsGraphClient` — low-level HTTP mechanics: Bearer-header-only tokens, GET-only retry, 30s timeouts, pagination, Batch API, async insights, `appsecret_proof`, usage-header parsing, audit events.
3. `adsBucGovernor` — Redis-backed Business-Use-Case rate governor shared across users of a tenant app.
4. Redis read cache with per-entity invalidation.
5. Recorded-fixture contract tests (no network, ever).

## 2. Background context (self-contained)

- **Why Node-direct:** existing social features route Graph calls through the Python backend; this feature deliberately calls Graph directly from Node (per-user tokens live on the Node side; precedent exists; simpler ops).
- **Graph version:** single constant `META_GRAPH_VERSION = "v25.0"` exported from `adsGraphClient.ts`. v21–v23 are sunset; v24 Marketing API expires 2026-10-06. Nothing else hardcodes a version string.
- **Token rules (global convention):** tokens travel ONLY in `Authorization: Bearer` headers — never in URLs, never in BullMQ payloads, never in logs. `decrypt()` happens only inside `socialAdsConnectionService`; this section calls its internal-only `getDecryptedAccessToken(connectionId)` per request and never caches the plaintext beyond the call.
- **Meta API facts** (from research, verified):
  - `X-Business-Use-Case-Usage` response header: JSON keyed by object id → `[{type: ads_insights|ads_management|pages|..., call_count, total_cputime, total_time (each a % of a 1h window), estimated_time_to_regain_access (minutes), ads_api_access_tier}]`. `X-App-Usage` is the app-level equivalent. Throttle error subcodes: 80000 (insights), 80004 (ads_management), 80001 (pages).
  - Batch: `POST /` with `batch=[...]`, max **50** sub-requests; each counts individually against limits; per-sub-request errors are isolated.
  - Async insights: `POST /{object}/insights` (same params as GET) → `{report_run_id}` → poll `GET /{report_run_id}` until `async_status === "Job Completed" && async_percent_completion === 100` → `GET /{report_run_id}/insights` (paginated). Runs may take up to 1h; `report_run_id` expires after 30 days — never persist run ids beyond the polling job.
  - `appsecret_proof` = hex HMAC-SHA256 of the access token keyed by the app secret; only valid when the stored app id matches the token's `token_app_id` (cross-app proof fails at Meta). Section 04 already enforces same-app storage; this section adds the proof param only when `getDecryptedAccessToken` returns a same-app `appSecret`.
  - Code 190 = token expired/invalid → non-retryable; must trigger `socialAdsConnectionService.markExpired(connectionId, reason)`.
- **Money/time:** all money values crossing the `AdsProvider` boundary are the shared `Money` type (`shared/socialAds/money.ts`, integer minor units). All Graph errors surfaced upward go through `resolveAdsError` (`server/services/social/adsErrorMap.ts`). Both exist after section 02.
- **Existing codebase anchors:**
  - Redis: `getRealtimeClient()` from `server/services/redisClients.ts:86`; `.duplicate()` where a dedicated connection is needed. Governor/cache can share one non-blocking client.
  - Audit: `logAuditEvent`/`sanitizePayload` in `server/services/auditLogger.ts`; section 02 added `social_ads_request`/`social_ads_response` to `AuditEventType` (Section 02 owns the auditLogger.ts edit).
  - Directory `server/services/social/` already exists (`providerRegistry.ts` there is the analogous registry pattern for publishing providers — mirror its shape).

## 3. Files

| File | Action |
|---|---|
| `server/services/social/adsProvider.ts` | NEW — `AdsProvider` interface, shared DTO types, provider registry (`getAdsProvider(provider: "meta")`) |
| `server/services/social/metaAdsProvider.ts` | NEW — `MetaAdsProvider implements AdsProvider`, maps interface methods to Graph endpoints/params, Money↔minor-unit mapping, error mapping |
| `server/services/social/adsGraphClient.ts` | NEW — HTTP mechanics + `META_GRAPH_VERSION` + read cache + batch + async insights |
| `server/services/social/adsBucGovernor.ts` | NEW — Redis usage governor |
| `server/services/social/__fixtures__/graph/*.json` | NEW — recorded fixtures (see §6) |
| `server/services/social/__tests__/adsGraphClient.test.ts` | NEW |
| `server/services/social/__tests__/metaAdsProvider.test.ts` | NEW |
| `server/services/social/__tests__/adsBucGovernor.test.ts` | NEW |

No edits to existing files in this section (routers consume these in section 07+).

## 4. Tests FIRST (TDD)

Conventions: Vitest, node env; `global.fetch = vi.fn()` returning fixture responses (status + headers + json body); `vi.mock` at module boundary for `socialAdsConnectionService`, `auditLogger`, and the Redis client (in-memory Map stub with `get/set/del/expire/keys|scan`). Idioms to copy: `vi.hoisted` mock bag as in `server/services/__tests__/socialDraftService.test.ts`. No network, no test DB. Write these tests before implementation; the section is done when they and the full suite pass.

### 4.1 `adsGraphClient.test.ts` — contract tests on fixtures

- **Pagination:** 3-page campaign-list fixture (`paging.cursors.after` / `paging.next`) → client follows cursors to exhaustion and returns 3 pages merged; a bound-exceeded fixture (bound = 2,000 rows) → results truncated at bound and `log()`/logger warn called once.
- **Token hygiene:** for every request made in the suite, assert mock-fetch args: `Authorization: Bearer <token>` header present, and the URL string contains no `access_token=` substring. (Make this a shared afterEach assertion helper.)
- **appsecret_proof:** when the mocked `getDecryptedAccessToken` returns `{token, appSecret, appId}` (same-app) → every request includes `appsecret_proof` param equal to HMAC-SHA256-hex(token, appSecret); when `appSecret` absent → param absent.
- **Retry matrix:** GET returning 500 twice then 200 → 3 fetch calls total, exponential backoff invoked (fake timers), success result; GET timing out (AbortError) → retried; POST returning 500 → exactly ONE fetch call, error thrown (never retried).
- **190 handling:** fixture with `error.code = 190` → `socialAdsConnectionService.markExpired(connectionId, ...)` called once, thrown error marked non-retryable (no retry fetches).
- **Usage headers:** response carrying `X-Business-Use-Case-Usage` / `X-App-Usage` fixtures → `adsBucGovernor.report(adAccountId, usage)` called with parsed values.
- **Batch:** batch fixture where sub-request 2 of 3 fails → helper returns per-sub-request results with the failure isolated (others succeed); >50 requests → rejected before any fetch.
- **Async insights lifecycle:** `startInsightsRun` → returns `report_run_id`; poll fixture sequence `Job Started` → `Job Running` → `Job Completed`/100% → `fetchInsightsRunResults` follows result pagination.
- **Read cache:** first GET fetches + stores; second identical GET within TTL → zero fetch calls; `invalidateEntity(connectionId, entityId)` → next read fetches again. Cache key includes connectionId + endpoint + params hash.

### 4.2 `adsBucGovernor.test.ts`

- `report()` stores usage per ad account in Redis key `social-ads:buc:{adAccountId}` with TTL ~1h.
- `check()` at ≤80% → passes for all callers.
- >80% → non-critical (`{critical: false}`) reads are told to serve cache/defer (typed result or `ThrottleDeferred` per implementation choice below); critical user reads still pass.
- >95% → `check({critical:false})` throws `ThrottleDeferred` (jobs interpret as "skip cycle"); critical still passes.
- State is keyed per ad account (two accounts don't interfere).

### 4.3 `metaAdsProvider.test.ts`

- Each interface method issues the expected Graph endpoint/params (spot-check `getCampaigns`, `getInsights` with a date preset — assert `time_range`/preset params derived via `accountTime` semantics, `createCampaign` posting `status=PAUSED` untouched here — full validation lives in section 08).
- Budget/spend fields in responses are surfaced as `Money` (integer minor units + account currency); a budget-min Graph error fixture maps through `resolveAdsError` to the seeded entry.
- List methods delegate to the client's cursor-following (mock client and assert exhaustion flag/bound passed).
- Registry: `getAdsProvider("meta")` returns the singleton; unknown provider throws.

## 5. Implementation guidance

### 5.1 `adsProvider.ts`

```ts
export const META_ADS_PROVIDER = "meta" as const;

export interface AdsProvider {
  getAdAccounts(ctx): Promise<AdAccountDTO[]>;
  getCampaigns(ctx, adAccountId, opts?): Promise<CampaignDTO[]>;
  getAdSets(ctx, campaignId | adAccountId, opts?): Promise<AdSetDTO[]>;
  getAds(ctx, parentId, opts?): Promise<AdDTO[]>;
  getInsights(ctx, level, objectId, params): Promise<InsightsDTO>;
  getIssues(ctx, adAccountId): Promise<EntityIssueDTO[]>;
  createCampaign(ctx, adAccountId, input): Promise<CreatedEntityDTO>;
  createAdSet(ctx, adAccountId, input): Promise<CreatedEntityDTO>;
  createAdCreative(ctx, adAccountId, input): Promise<CreatedEntityDTO>;
  createAd(ctx, adAccountId, input): Promise<CreatedEntityDTO>;
  updateEntity(ctx, entityId, patch): Promise<void>;
  mutateStatus(ctx, entityId, status): Promise<void>;
  duplicateEntity(ctx, entityId, opts): Promise<CreatedEntityDTO>;
  uploadAdImage(ctx, adAccountId, bytesRef): Promise<{ imageHash: string }>;
  uploadAdVideo(ctx, adAccountId, bytesRef): Promise<{ videoId: string }>;
  searchTargeting(ctx, query, type): Promise<TargetingOptionDTO[]>;
  getPreviews(ctx, creativeOrAdId, formats): Promise<PreviewDTO[]>;
  getPagePosts(ctx, pageId, opts?): Promise<PagePostDTO[]>;
}
```

- `ctx` = `{ connectionId, adAccountId?, critical?: boolean }` — carries only ids, never tokens.
- All money in/out as `Money`. All list methods cursor-follow to exhaustion, hard bound 2,000 items, warn-log on truncation.
- Registry mirrors the shape of the existing `server/services/social/providerRegistry.ts` (map keyed by provider id; `getAdsProvider` throws on unknown).
- DTO types exported here are the types sections 07–09/11 import — keep them provider-neutral (no raw Graph field names like `daily_budget` in DTOs; use `dailyBudget: Money`).

### 5.2 `adsGraphClient.ts`

- `export const META_GRAPH_VERSION = "v25.0";` and base URL `` `https://graph.facebook.com/${META_GRAPH_VERSION}` ``.
- Class/factory taking `{ connectionId }`. Per call:
  1. `adsBucGovernor.check(adAccountId, { critical })` — may throw `ThrottleDeferred` or direct to cache.
  2. Resolve token lazily via `socialAdsConnectionService.getDecryptedAccessToken(connectionId)` (returns `{token, appSecret?, appId?} | null`; null → typed "connection missing" error). Do NOT store the token on the instance.
  3. Build request: token in `Authorization: Bearer` header ONLY; add `appsecret_proof` query param when `appSecret` present (HMAC via node `crypto.createHmac("sha256", appSecret).update(token).digest("hex")`).
  4. `fetch` with `AbortSignal.timeout(30_000)`.
  5. Parse `X-Business-Use-Case-Usage` / `X-App-Usage` headers → `adsBucGovernor.report(...)` (tolerate absent/malformed headers silently).
  6. On error body: URL-scrubber strips any `access_token=[^&]+` from URLs/strings before the error can reach logs (defense in depth — section 02's sanitizer is the second net); code 190 → `markExpired` + throw non-retryable; other codes classified via `resolveAdsError` for retryability.
- **Retry matrix:** GET → up to 3 retries on network error/timeout/5xx/retryable throttle codes, exponential backoff + jitter. POST/DELETE → NEVER retried (mutations get idempotency from section 08's intent-row protocol, not from HTTP retry).
- **Pagination helper:** `getAllPages(path, params, { bound = 2000 })` following `paging.cursors.after`; each page passes through the governor check.
- **Batch:** `batch(requests: BatchRequest[])` — assert `length <= 50`, POST `/` with `batch` param (tokens still header-level for the outer request), return per-sub-request `{status, body | error}` isolating failures. Used by section 09's monitor.
- **Async insights:** `startInsightsRun(objectId, params) → reportRunId`, `getInsightsRunStatus(reportRunId)`, `fetchInsightsRunResults(reportRunId)` (paginated). Run ids live only in job memory.
- **Read cache:** Redis key `social-ads:cache:{connectionId}:{endpoint}:{paramsHash}` (stable hash of sorted params, e.g. sha1 of canonical JSON), TTL 60s, GETs only. `invalidateEntity(connectionId, entityId)` deletes matching keys (maintain a per-entity key index set `social-ads:cache-index:{connectionId}:{entityId}` rather than `KEYS`/`SCAN` pattern-matching in the hot path).
- **Audit:** emit `social_ads_request` / `social_ads_response` events with token-stripped endpoint, latency ms, usage %, truncated + sanitized payloads (use section 02's `sanitizeForActionLog`/`sanitizePayload`).

### 5.3 `adsBucGovernor.ts`

- `report(adAccountId, usage)` — persist the worst-of `{callCount, totalCputime, totalTime, estimatedTimeToRegainAccess}` percentages to `social-ads:buc:{adAccountId}` (JSON, TTL 3600s). Keyed by ad account → naturally shared across a tenant's users of the same app.
- `check(adAccountId, { critical }): Promise<GovernorVerdict>`:
  - `<=80%` → `allow`.
  - `>80%` → non-critical reads: `preferCache` (client serves cache even if stale / defers); critical (interactive user reads) → `allow`.
  - `>95%` → non-critical: throw `ThrottleDeferred` (exported typed error; jobs catch it and skip the cycle without failing the job); critical → `allow` (user still gets a real answer; Meta will throttle-error if truly out, which maps via `adsErrorMap`).
- Missing state (no header seen yet) → `allow`.

### 5.4 `metaAdsProvider.ts`

- Thin mapping layer: interface method → Graph endpoint + field list + param encoding; converts Graph integer-minor budget/spend fields ↔ `Money` using the ad-account currency from `ctx`/account cache; converts Graph errors via `resolveAdsError` before rethrowing typed errors.
- Creative endpoints: `object_story_id = "{pageId}_{postId}"` for boost; `object_story_spec` with exactly one of `link_data|video_data|photo_data` for new creatives (input validation of "exactly one" belongs to section 08 — the provider just encodes).
- Date presets pass through `accountTime` semantics (`shared/socialAds/accountTime.ts`) — no `new Date()` day-bucketing here.

## 6. Fixtures (`__fixtures__/graph/`)

Recorded/hand-authored JSON, one file per scenario (name suggestions):

- `campaigns-page-1.json` / `-2.json` / `-3.json` — paginated list with cursors.
- `error-190-expired-token.json` — OAuthException code 190.
- `error-throttle-80004.json` — code 17/4 + subcode 80004 with usage headers metadata.
- `error-budget-min.json` — budget-below-minimum validation error.
- `buc-usage-headers.json` — sample `X-Business-Use-Case-Usage` + `X-App-Usage` header values.
- `insights-run-started.json` / `-running.json` / `-completed.json` / `-results-page-1.json`.
- `batch-partial-failure.json` — 3 sub-requests, middle one errored.

Fixtures must contain NO real tokens/ids — use `EAA_FIXTURE_REDACTED`-style placeholders that the token-hygiene canary would still catch if they leaked into payloads (i.e., do not embed `EAA` + 20 alnum shapes).

## 7. Boundaries with other sections (reference only — do not implement here)

- Section 04 owns `getDecryptedAccessToken` / `markExpired` — mock them here.
- Section 07 wires the read router onto `AdsProvider` and adds ownership/lineage checks — this section performs no authorization.
- Section 08 owns the intent-row protocol, per-entity locks, and cache invalidation calls after mutations — this section only exposes `invalidateEntity`.
- Section 09 consumes `batch()` and `ThrottleDeferred` skip semantics.
- Section 02's `resolveAdsError` is the ONLY error-translation path to user-facing messages.

## 8. Acceptance criteria

- All §4 tests green; `cd apps/web && pnpm test` full suite green; `pnpm check` clean on new files.
- Grep-level invariants hold: no `access_token=` string construction anywhere in the new files; no `graph.facebook.com` reference outside `adsGraphClient.ts` (and `socialAdsConnectionService` from section 04); exactly one `META_GRAPH_VERSION` definition.
- No test performs real network I/O (fixture-only; unmocked fetch fails the suite per the vitest setup gate).