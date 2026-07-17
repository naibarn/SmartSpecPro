# Research Findings — 031-SocialAdsManagement

**Date:** 2026-07-17 | **Sources:** codebase Explore agent (14 topics, file:line verified) + web research agent (8 topics, July-2026 live sources) | Supplements spec v1.2 §2 audit (done earlier).

---

## ⚠️ Spec corrections discovered by research (MUST apply in plan)

1. **Graph API version: pin `v25.0`, NOT v21.0.** v21.0 Marketing API sunset 2025-09-09 (our live curl tests worked only because Marketing API auto-upgrades expired versions since May 2024). v24.0 Marketing API expires 2026-10-06. Latest stable: v25.0 (2026-02-18).
2. **Page Insights metrics in spec §17.2 are partially DEAD.** Two purges: Nov 15 2025 (impressions + fans family) and Jun 15 2026 (reach/unique family). Build ONLY on:
   - Followers: `page_follows` (replaces `page_fans`), `page_daily_follows`, `page_daily_unfollows_unique` (NO replacement for fan_adds/fan_removes semantics beyond these)
   - Views: `page_media_view`, `page_media_view_paid`; post: `post_media_views`, `post_media_views_paid`, `post_media_views_organic`, `post_media_views_follower`
   - Unique/reach successor: `page_total_media_view_unique`, `post_total_media_view_unique` (paid-vs-organic reach split NO LONGER POSSIBLE)
   - Engagement: `page_post_engagements`, `post_clicks`, `post_reactions_*_total`, `post_activity_by_action_type`
   - Video: `page_video_views`, `page_video_complete_views_30s`, `post_video_views`, `post_video_view_time`, `post_video_avg_time_watched`
   - Page profile views: `page_views_total` (low-confidence — verify live)
   - Per-post comments/shares: fetch from post object (`comments.summary(true)`, `shares`) not insights
   - New `page_viewer` cross-platform metric announced for v25 — name/shape unconfirmed, verify live before use
3. **`special_ad_categories` is MANDATORY on every campaign create** — pass `[]` when none. Values: EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS, FINANCIAL_PRODUCTS_SERVICES.
4. **Advantage+ Shopping/App campaigns can no longer be created via Marketing API** (since ~2026-05-19) — spec already excluded them; now it's not even possible.
5. **Sandbox ad accounts (spec §15.3) are UNCERTAIN in 2026** — creation UI reportedly flaky/removed at times; sandbox insights return no data (nothing delivers). Plan fallback: real ad account + PAUSED-only campaigns + guardrails for CRUD tests; insights pipeline tested with recorded fixtures.
6. **`executeSkill` does NOT invoke the LLM for llm-only skills** (`skillExecutor.ts:861` returns the prompt for the chat pipeline). Feature 08 advisors must load the skill content and call `invokeLLM` directly — exactly the `socialDraftService.generateSocialDraft` pattern (`services/socialDraftService.ts:475-521`).
7. **Migration numbering conflict:** `drizzle/meta/_journal.json` head = idx 197, tag `0211_vertical_drama_shot_references` → next would be 0212. BUT project memory (2026-07-16 lineage repair) warns a reserved/consolidated `0212` exists and next should be **0213**. VERIFY at implementation; do not assume either.

---

## Codebase implementation patterns (file:line verified)

### BullMQ worker (template: `server/services/webhookDispatchQueue.ts`, 308 lines)
- Module singletons; `initX()` creates `new Queue(name, { connection: getRealtimeClient().duplicate(), defaultJobOptions: { attempts, backoff: {type:"exponential"}, removeOnComplete, removeOnFail } })` + `new Worker(name, processor, { connection: ...duplicate(), concurrency })` (:216-239).
- Processor = standalone exported async fn (testable). `UnrecoverableError` for permanent failures (:148). Deterministic `jobId` for dedup (:278). `closeX()` closes worker then queue (:298).
- Repeatable: **`queue.upsertJobScheduler(schedulerId, { every: ms }, { name, data, opts })`** — newer idiom already used at `server/jobs/escalationJob.ts:235`, `memoryMaintenanceJobs.ts:598-613`. Per-entity: scheduler id = `sync:${entityId}`; upsert on create/update, `removeJobScheduler` on delete; reconciliation sweep compares `getJobSchedulers()` vs DB. Job template cannot set custom jobId.
- Boot wiring: `server/_core/index.ts` init ~:1684 (try/catch, log-and-continue), shutdown in BOTH SIGTERM (:2040-2100) and SIGINT (:2119+) blocks.
- Redis: `getRealtimeClient()` from `server/services/redisClients.ts:86` (`maxRetriesPerRequest:null` — required for BullMQ); `.duplicate()` per queue/worker. Lock primitive: `server/services/redisSemaphore.ts` `acquireSemaphore(redis, key, maxSlots, ttlSeconds)` (:57, Lua INCR+EXPIRE, TTL crash-recovery).

### LLM from server code (Feature 08)
- `invokeLLM(params)` from `server/_core/llm.ts:269`; `InvokeParams` (:59-71) supports `outputSchema` (JSON-schema structured output — use for the §18.4 report schema). OpenAI-shaped result. Model REQUIRED — resolve via `resolveEnabledLlmModelId()` (`services/enabledLlmModels.ts:295`).
- `invokeLLM` does NOT deduct credits or attach traceId. After the call: `deductCreditsForModel({ userId, model, inputTokens, outputTokens, ... })` (`creditService.ts:965`) → `{ creditsUsed, wasFree }`. Rich example incl. traceId convention: `marketplaceAutoReviewService.ts` (traceId = `` `feature-${stage}:${runId}` `` style).
- Skill registry: `autoSyncSkillsFromFolder` (`skillRegistry.ts:365`), `getSkillByIdAsync` (:808), `initializeSkillRegistry` (:880). Advisors: read skill row content (system prompt) → `invokeLLM` → parse.

### Credits
- `deductCredits(params)` (`creditService.ts:400`): supports `idempotencyKey` (Redis `credit:idemp:${key}` 24h + DB 23505 safety net :427-492), atomic balance guard, `sourceType`, `metadata.traceId`. `refundCredits` (:804). Reservation model available (:659-750).

### Notifications
- `createNotification(params)` (`notificationService.ts:292`) → `{ notificationId, deduplicated, channels } | null`. **Dedup built-in via `groupKey`** (ON CONFLICT + occurrenceCount :437-475) — spec §12.14 dedup maps directly to `groupKey`. Types: `"alert"|"system"|...` (:77-83); priority `low|normal|high|critical`.

### Rate limiting
- `createRateLimitMiddleware({ namespace, limit, windowMs })` (`_core/rateLimitedProcedure.ts:27`) — tRPC middleware, in-memory sliding window keyed by IP, TOO_MANY_REQUESTS. NOT Redis-backed (single-instance OK today). Usage: `.use(createRateLimitMiddleware({...}))` inline per procedure (e.g. `apiKeys.ts:74`).

### Feature flags — TWO systems; social uses Redis one
- Redis: `getTenantFeatureFlag(flag, tenantId)` (`services/featureFlags.ts:79`) → tenant key → global key → `process.env[flag]` → default **false**. `SOCIAL_ADS_ENABLED` works with zero schema change (opt-in default false); `setTenantFeatureFlag` (:100) to enable.
- Admin-UI DB system: `shared/featureFlags.ts` (`TenantFeatureFlags` :8, `ALLOWED_FEATURE_FLAGS` :217, `FEATURE_FLAG_DEFAULTS` :425 — `META_CHANNELS_ENABLED: true` :464). To surface in admin UI add key to all three. NOTE spec says SOCIAL_ADS_ENABLED "defaults to META_CHANNELS_ENABLED value" — implement as: check SOCIAL_ADS_ENABLED, if unset fall back to META_CHANNELS_ENABLED check (code-level fallback, since Redis default is false).

### system_settings sensitive
- Write: `{ key, value, sensitive }` → `storedValue = sensitive ? encrypt(value) : value` → upsert with `isSensitive` (`systemSettings.ts:1327-1350`). Read: mask `"****"+...` + `xConfigured: true` boolean (:1267-1284). Copy exactly for `meta_ads_app_id`/`meta_ads_app_secret`.

### Charts
- recharts ^2.15.2 wrapped by shadcn `@/components/ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`). Canonical: `client/src/pages/WorkpackRoiDashboard.tsx:9-10, 268-270`.

### i18n
- `client/src/locales/{en,th}/social.json` EXISTS — add ads keys there (keys like `"ads.title"`). Route→ns map `client/src/i18n/namespaces.ts:16` already maps `/social` prefix → `social` ns (covers `/social/ads` automatically). Components: `useScopedTranslation` (`i18n/useScopedTranslation.ts`, scope `social` :28). Dashboard menu labels: `locales/{en,th}/dashboard.json:557-561` `socialMenu.*` — add `socialMenu.ads`.

### Vitest
- Config `apps/web/vitest.config.ts` (node env; jsdom for client tsx via `environmentMatchGlobs` :34). Both `__tests__/` and co-located `.test.ts` used.
- DB fully mocked (no test DB): chainable drizzle mock (`creditService.test.ts:3-45`) or module-boundary `vi.mock` bag (`__tests__/socialDraftService.test.ts:3-56` — includes `vi.mock("../../_core/llm")` faking `invokeLLM`).
- tRPC router tests: mock services, `router.createCaller({ user, tenantId, userToken })` (`__tests__/socialInbox.test.ts:56-70`).

### Audit logger
- `auditLogger.log(entry)` (`auditLogger.ts:384`, buffered fire-and-forget). Add event types to `AuditEventType` union (:18-187; social events :83-96). `sanitizePayload` (:314, exported) deep-redacts by SENSITIVE_KEYS (:238 — includes `token`, `access_token`, case-insensitive) — spec §12.3 requires EXTENDING it with URL-embedded-token regex (`access_token=[^&]+`, `EAA[A-Za-z0-9]+`).

### Drizzle conventions (copy `socialPages` block, `schema.ts:18048-18092`)
- `pgTable("snake_name", {...}, t => [index(...).on(...)])`; `serial` PK; `varchar("tenantId",{length:36}).notNull().references(()=>tenants.id,{onDelete:"cascade"})`; `json("x").$type<T>()`; `text("encryptedX")`; varchar-enum with `.default()`; `timestamp("createdAt",{withTimezone:true}).defaultNow().notNull()`; export `$inferSelect`/`$inferInsert` types. Place new tables adjacent to social block (~:18012+).

---

## Web research — Meta API facts (July 2026)

### Marketing API create-chain essentials
- Campaign: `name`, `objective` (ODAX: `OUTCOME_AWARENESS|OUTCOME_TRAFFIC|OUTCOME_ENGAGEMENT|OUTCOME_LEADS|OUTCOME_APP_PROMOTION|OUTCOME_SALES`), `status:"PAUSED"`, `special_ad_categories` (mandatory, `[]` ok). Budget at campaign (CBO `daily_budget`/`lifetime_budget`) XOR ad-set level.
- Ad set: `campaign_id`, `optimization_goal`, `billing_event` (almost all goals bill `IMPRESSIONS` only; exceptions LINK_CLICKS/THRUPLAY/2s-video may bill themselves), `daily_budget|lifetime_budget` (minor units; lifetime needs `end_time`), `bid_strategy` (e.g. `LOWEST_COST_WITHOUT_CAP`), `targeting` (min: `{"geo_locations":{"countries":["TH"]}}`), `promoted_object` required for OUTCOME_SALES/offsite conversions, `start_time`, `status`.
- Creative: `object_story_spec` (`page_id` + exactly one of `link_data|video_data|photo_data|text_data`) for new unpublished post; `object_story_id` = `{page_id}_{post_id}` for boosting existing post (medium confidence — verify v25 reference). `instagram_user_id` optional.
- Ad: `adset_id`, `creative:{creative_id}`, `status`.

### Async insights + Batch + throttle
- Async: `POST /{object}/insights` (same params as GET) → `{report_run_id}` → poll `GET /{report_run_id}` for `async_status=="Job Completed" && async_percent_completion==100` → `GET /{report_run_id}/insights` (paginated). Jobs may take up to 1h; **report_run_id expires after 30 days**. Status enum: Job Not Started/Started/Running/Completed/Failed/Skipped (spot-verify).
- Batch: `POST /` with `batch=[...]`, **max 50**; each sub-request counts individually against limits; per-sub-request errors isolated.
- `X-Business-Use-Case-Usage`: JSON keyed by object id → `[{type: ads_insights|ads_management|pages|..., call_count, total_cputime, total_time (all % of 1h window), estimated_time_to_regain_access (min), ads_api_access_tier}]`. `X-App-Usage` app-level. Throttle subcodes: 80000 (insights), 80004 (ads_management), 80001 (pages).

### Token exchange + proof
- `GET /{v}/oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...` → `{access_token, expires_in}` (~60d). Cross-app exchange fails (behavior well-established; doc statement unconfirmed).
- Page tokens from long-lived user token via `/me/accounts` have **no expiration** (die on password/permission change) — relevant to Feature 07 collection.
- `appsecret_proof` = hex HMAC-SHA256(access_token, key=app_secret); param on every call; enforcement via App Settings "Require App Secret".

### Meta Automated Rules mental model (Feature 05 mirror)
- `evaluation_spec` (SCHEDULE|TRIGGER + filters with GREATER_THAN/LESS_THAN/IN_RANGE/...), `execution_spec` (PAUSE/NOTIFICATION/budget changes), `schedule_spec`. Windows are presets: TODAY, YESTERDAY, LAST_3D (exclusive of today), LAST_7D, ..., attribution-aware `LAST_ND_14_8` etc. Default cadence ≈ every 30 min. No first-class cooldown — practitioners use "condition true N consecutive evaluations" + exclusive windows to avoid immature-attribution false fires. → Our cooldown ledger + provisional-metric rule (spec §8.3) is a superset; add optional "consecutive hits ≥ N" rule param.

### Testing reality
- Sandbox: one per app, created in App Dashboard → Marketing API → Tools; full CRUD, zero delivery/spend/insights; Development-Mode apps limited to admin/dev/tester ad accounts; creation UI flaky in 2025-2026 reports. CI plan: recorded fixtures for contract tests (primary), sandbox CRUD if available (secondary), real-account PAUSED-only smoke (tertiary, gated manual).

---

## Testing approach (existing setup)
Vitest (apps/web), node env, DB/LLM/fetch all `vi.mock`ed per conventions above; tRPC via `createCaller`. No test DB, no network in CI. New code follows: services with injectable deps + module-boundary mocks; worker processors as standalone exported functions.
