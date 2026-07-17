# Implementation Plan — 031-SocialAdsManagement

**Date:** 2026-07-17 | **Inputs:** `claude-spec.md` (authoritative synthesis), `spec.md` v1.2 (full requirements), `claude-research.md` (codebase anchors + Meta API facts), `claude-interview.md` (business decisions).

**What we are building:** a Facebook/Meta Ads management suite inside SmartSpecPro's existing Social module family, plus repair of the broken social scheduling/automation pipeline, plus per-page performance monitoring and skill-first LLM advisors. Sold as a premium per-tenant feature. Nine features (F00–F08) across 7 rollout phases (P0–P6).

**Repo context for the unfamiliar reader:** monorepo; the web app is `apps/web/` (React 19 + Vite client in `client/`, Express + tRPC 11 server in `server/`, Drizzle ORM schema in `drizzle/schema.ts`, PostgreSQL + Redis + BullMQ). All Meta Graph calls for the EXISTING social features route through a separate Python backend; **this feature deliberately calls the Graph API directly from Node** (precedent exists; simpler ops; per-user tokens live on the Node side). Everything below is in `apps/web/` unless stated.

---

## Global conventions (apply to every section)

- **Graph API version:** single constant `META_GRAPH_VERSION = "v25.0"` in the Graph client module. v21-v23 are sunset; do not use.
- **Money:** `{ currency: string /* ISO-4217 */, amountMinor: number /* integer */ }` — shared type in `shared/socialAds/money.ts` with format/parse/compare helpers. Meta budget & spend fields are integer minor units. UI formatting via one helper only.
- **Time:** all insight windows, spend caps, and "today" computations use the **ad account's `timezone_name`** (captured at connect). Helper in `shared/socialAds/accountTime.ts`. Direct `new Date()` day-bucketing in ads code is forbidden.
- **Tokens:** travel ONLY in `Authorization: Bearer` headers; never in URLs, never in BullMQ payloads, never in logs. `decrypt()` calls happen only inside `socialAdsConnectionService`.
- **Every ads mutation** follows the intent-row protocol (§10 below): pending action-log row → Graph call → finalize `ok|error|unknown`. Mutations are NEVER auto-retried.
- **Audit:** new `AuditEventType` members (`social_ads_request`, `social_ads_response`, `social_ads_action`, `social_ads_guard_triggered`, `social_ads_advisor_report`) added to the union in `server/services/auditLogger.ts:18-187`; all payloads pass `sanitizePayload` (extended — see §2.4).
- **Feature gate:** every ads tRPC procedure asserts tenant flag `SOCIAL_ADS_ENABLED` via `getTenantFeatureFlag` (`server/services/featureFlags.ts:79`), default false (premium = explicitly enabled). NOT falling back to `META_CHANNELS_ENABLED`.
- **i18n:** all user-facing strings in `client/src/locales/{th,en}/social.json` under an `ads.*` key family (Thai copy is primary); dashboard menu label in `dashboard.json` `socialMenu.ads`.
- **Tests:** Vitest; DB/LLM/fetch mocked at module boundary (`vi.mock`), routers tested via `createCaller` — copy idioms from `server/services/__tests__/socialDraftService.test.ts` and `server/routers/__tests__/socialInbox.test.ts`.

---

## Section 01 — Database schema + migration + feature flag + i18n scaffolding

**Goal:** all nine new tables, the premium flag, and translation keys exist so every later section builds on them.

**Files:** `drizzle/schema.ts` (append near the social block ~line 18012), generated migration in `drizzle/`, `shared/featureFlags.ts`, `client/src/locales/{th,en}/social.json`, `client/src/locales/{th,en}/dashboard.json`.

**Tables** (column lists are in spec.md §11 and are authoritative; follow the drizzle conventions of `socialPages` at `schema.ts:18048-18092` — quoted camelCase columns, `serial` PK, `varchar(36)` tenant/user FKs with cascade, `json(...).$type<...>()`, `timestamp(...,{withTimezone:true})`, exported `$inferSelect/$inferInsert` types):

1. `social_ads_connections` — per (user, tenant, provider); encrypted token + app secret columns; `token_app_id`; `ad_accounts` json (each entry: id, name, currency, timezone_name, account_status, minimum_budgets); `status` enum-varchar `active|expired|invalid|revoked|disabled`.
2. `social_ads_settings` — per (user, tenant); `max_daily_budget_minor` bigint **default 50000** (฿500 — interview decision), `currency`, `automation_halted` boolean, `notification_prefs` json.
3. `social_ads_automation_rules` — guard+optimizer rules; NO `last_fired_at` column (ledger owns that); include `consecutive_hits` int default 1 (research amendment #10).
4. `social_ads_cooldowns` — ledger keyed `(user_id, ad_account_id, target_id, action)`.
5. `social_ads_action_log` — immutable; `intent_status` `pending|ok|error|unknown`; sanitized json payloads.
6. `social_ads_entity_state` — current known `effective_status` per entity per connection.
7. `social_ads_monitor_snapshots` — transitions only.
8. `social_ads_drafts` — wizard autosave.
9. `social_ads_creative_assets` — media asset ↔ ad-account `image_hash`/`video_id` cache.
10. `social_page_insight_snapshots` — daily page metrics (unique `(page_id, snapshot_date)`).
11. `social_advisor_reports` — advisor outputs + facts snapshot.

**Migration:** ⚠️ verify the next number first — journal head is `0211` but a reserved `0212_consolidated` exists per project memory; expected next = `0213`. Follow the project's Database Safety Protocol (all-new tables = low risk; still snapshot row counts of neighboring social tables before `pnpm db:push`, verify journal entry after).

**Feature flag:** add `SOCIAL_ADS_ENABLED` to `shared/featureFlags.ts` — interface (`:8`), `ALLOWED_FEATURE_FLAGS` (`:217`), `FEATURE_FLAG_DEFAULTS` **false** (`:425`) — so it appears in the existing admin tenant-flags UI as the premium entitlement switch. Server checks use the Redis-backed `getTenantFeatureFlag("SOCIAL_ADS_ENABLED", tenantId)`.

**system_settings keys** (registered where the admin settings router validates keys): `integrations/meta_ads_app_id`, `integrations/meta_ads_app_secret` (sensitive → encrypt-on-write, mask-on-read per `systemSettings.ts:1327-1350`/`1267-1284`), `integrations/social_ads_mutation_credit` (default `1`), `integrations/social_ads_automation_halted` (tenant kill switch), `integrations/social_ads_org_daily_cap` (Money json, optional).

**i18n:** seed the `ads.*` key families (`ads.menu`, `ads.tabs.*`, `ads.connection.*`, `ads.wizard.*`, `ads.issues.*`, `ads.automation.*`, `ads.pages.*`, `ads.advisor.*`, `ads.errors.*`) in Thai + English; `socialMenu.ads` = "จัดการโฆษณาโซเชียล" / "Social Ads".

**Tests:** schema type exports compile; a migration-applied smoke assertion (table exists) is covered implicitly by `pnpm db:push` verification in the phase gate, not unit tests.

---

## Section 02 — Shared ads primitives: Money, account time, error map, sanitizer extension

**Goal:** the correctness primitives every other section imports.

**Files:** `shared/socialAds/money.ts`, `shared/socialAds/accountTime.ts`, `server/services/social/adsErrorMap.ts`, edit `server/services/auditLogger.ts`.

1. **Money** (`shared/` so client + server share): type + `formatMoney(m, locale)`, `addMinor`, `pctOfMinor(m, pct, {min, max})` (bounded budget math), `assertSameCurrency`. No floats anywhere; percentages computed with integer rounding half-up.
2. **Account time:** `accountDayRange(timezoneName, preset)` returning `{since, until}` date strings for Meta presets (`today`, `yesterday`, `last_3d` exclusive, `last_7d`, `last_30d`, `lifetime`) computed in the account's IANA timezone via `Intl.DateTimeFormat`; `accountToday(timezoneName)` for cap checks.
3. **Error map:** `resolveAdsError(graphError) → { severity, retryable, code, subcode, userMessageTh, userMessageEn, remediation }`. Seed entries: 190 (token expired → reconnect), 100 (validation), 17/4/32/613 + subcodes 80000/80004/80001 (throttle), 200/272/294 (permission), 2635 (version deprecated), budget-min violations, special-ad-category targeting violations. Unknown codes → generic entry + WARN log with code/subcode for map expansion. Prefer Meta's `error_user_msg` when present. tRPC procedures convert Graph failures ONLY through this map.
4. **Sanitizer extension** (in `auditLogger.ts`): extend `sanitizeValue` so string values are regex-scrubbed for `access_token=[^&]+` and `EAA[A-Za-z0-9]{20,}` shapes (`[REDACTED]`), in addition to the existing key-name redaction (`:238-269`). Export a `sanitizeForActionLog(payload)` that also truncates to 8KB. Unit tests: token-shaped fixtures in URLs, nested error objects, arrays — nothing survives.

---

## Section 03 — F00: socialJobsWorker (queues, schedulers, boot wiring) + scheduled-posts fix + automation-rules wiring

**Goal:** the missing background runner exists; Gap A (scheduled posts never publish) and Gap B (automation rules never fire) are FIXED; ads/page job queues are registered for later sections.

**Files:** `server/workers/socialJobsWorker.ts` (new), edits to `server/_core/index.ts` (init ~line 1684 pattern + BOTH shutdown blocks), `server/routes/internalSocialActions.ts` (enqueue hook), tests `server/workers/__tests__/socialJobsWorker.test.ts`.

**Structure** (template: `server/services/webhookDispatchQueue.ts` — module singletons, `init*/close*`, standalone exported processors, `UnrecoverableError` for permanent failures, `getRealtimeClient().duplicate()` connections):

- Queues + workers: `social:scheduled-posts` (repeatable sweep every 60s via `upsertJobScheduler("social:scheduled-posts:sweep", {every: 60_000}, ...)`, concurrency 1), `social:automation-rules` (event-driven + timeout sweep every 5 min), `social:ads-monitor`, `social:ads-optimize`, `social:page-insights`, `social:advisor-reports`, `social:ads-retention` (daily). Ads/page queues get processors in later sections — this section registers queue + no-op-guarded processor dispatch.
- Default job options: `attempts: 3, backoff: exponential` for idempotent sweeps; `attempts: 1` for anything that mutates external state; `removeOnComplete: {count: 100}`, `removeOnFail: {count: 500}` everywhere (Redis hygiene).
- **Redis-down behavior:** `initSocialJobsWorker()` follows the template's try/catch-log-and-continue (`videoIntelligenceJobs.ts:355-389` idiom) — the web app still boots; the health panel (Section 11) surfaces "background jobs offline"; scheduled posts stay `scheduled` (visible in the Publishing UI) until the worker returns. No silent inline-publish fallback for scheduled posts (that would bypass idempotency claims).
- **Job payload rule:** ids only (`postId`, `connectionId`, `ruleId`...). A test greps serialized payloads for `EAA`/`access_token`.

**Scheduled-posts sweep processor:**
- Claim: `UPDATE social_posts SET status='publishing' WHERE id IN (SELECT id FROM social_posts WHERE status='scheduled' AND "scheduledAt" <= now() ORDER BY "scheduledAt" LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING id` (single transaction; drizzle `sql` template).
- For each claimed id call the EXISTING `publishPublishingPostNow` path in `server/services/socialPublishingService.ts` (`:586`) → set `published|failed` (+ error message). The publish call is a mutation → no retry; a crash between claim and finalize leaves `publishing` rows — the sweep also re-examines `publishing` rows older than 10 min: verify against the platform result if determinable, else mark `failed` with "unknown outcome — verify manually" (never blind re-publish).
- Emits notification on failure via `createNotification` (`notificationService.ts:292`) with `groupKey: "social-post-failed:{postId}"`.

**Automation-rules wiring (Gap B):** in `routes/internalSocialActions.ts` (the endpoint the Python backend calls when delivering inbound webhook events), after persisting the inbound message/comment, enqueue `social:automation-rules` with `{conversationId | commentId}`; processor calls the EXISTING `matchAutomationRules` (`socialAutomationService.ts:1078`) and routes matches through the existing approval/auto-send paths. Timeout-based triggers evaluated in the 5-min sweep.

**Per-connection scheduler lifecycle helper** (used by later sections): `registerConnectionSchedulers(connectionId)` / `removeConnectionSchedulers(connectionId)` — upserts/removes `social-ads:monitor:{id}` (every 15 min, stagger offset = `hash(connectionId) % 900_000` ms via scheduler `startDate`), `social-ads:optimize:{id}` (hourly), `social:page-insights:{id}` (daily). Reconciliation sweep (daily) compares `getJobSchedulers()` vs active connections and repairs drift.

**Acceptance (phase P0 gate):** scheduled post publishes within 90s; worker restart mid-window does not double-publish; automation rule fires on a test inbound event.

---

## Section 04 — F01 backend: socialAdsConnectionService + token lifecycle

**Goal:** per-user encrypted credential storage with validation, long-lived exchange, hard-delete disconnect, expiry handling.

**Files:** `server/services/social/socialAdsConnectionService.ts` (new), tests in `__tests__`.

**Service surface (signatures only):**

```ts
saveToken(userId, tenantId, rawToken): Promise<ConnectionStatusDTO>
saveAppCredentials(userId, tenantId, appId, appSecret): Promise<ConnectionStatusDTO>
refreshAdAccounts(userId, tenantId): Promise<ConnectionStatusDTO>
verify(userId, tenantId): Promise<ConnectionStatusDTO>          // re-validates live; repairs status both directions
disconnect(userId, tenantId): Promise<void>                      // hard-deletes encrypted columns in-transaction; removes schedulers; disables rules
getStatus(userId, tenantId): Promise<ConnectionStatusDTO>
// INTERNAL ONLY — never exported through tRPC; used by Graph client + workers:
getDecryptedAccessToken(connectionId): Promise<{token, appSecret?, appId?} | null>
markExpired(connectionId, reason): Promise<void>                 // code-190 path: status=expired, deregister schedulers, ONE deduped notification
```

**saveToken behavior:** validate live (`/me`, `/me/permissions`, `debug_token`, `/me/adaccounts?fields=id,name,currency,timezone_name,account_status,minimum_budgets`); reject if `ads_read` missing; warn-list missing recommended scopes (`ads_management`, `read_insights`, `pages_read_engagement`); read `debug_token.app_id` → store as `token_app_id`; if a same-app secret is available (user's or tenant fallback) exchange via `GET /oauth/access_token?grant_type=fb_exchange_token...` and store the long-lived result + its expiry; else store as-is with true expiry. Encrypt via `encrypt()` from `server/services/crypto.ts`; `token_hint` = last 4 chars. Upsert on `(user_id, tenant_id, provider)`. On success call `registerConnectionSchedulers`. Audit event (names + hint only).

**appsecret_proof rule:** exchange and proof are ONLY attempted when `app_id === token_app_id` (cross-app mismatch fails at Meta — spec D3).

**Expiry lifecycle:** notifications at 14/7/1 days (checked inside the daily retention/reconciliation job) using `createNotification` with `groupKey: "ads-token-expiry:{connectionId}:{threshold}"`; mid-job 190 → `markExpired` (fail-fast: abort remaining batch).

**Tenant fallback app credentials:** read via the system-settings service (decrypt server-side only).

**Tests:** vi.mock the Graph fetch layer; cover: happy paste→exchange→active; cross-app token (no exchange, short expiry stored); missing ads_read rejection; disconnect nulls encrypted columns + deregisters schedulers (mock) + disables rules; markExpired dedups notification.

---

## Section 05 — F01 frontend + router: socialAdsConnection tRPC router + Settings panel

**Goal:** users configure everything via their own Settings UI; nothing secret ever reaches the client.

**Files:** `server/routers/socialAdsConnection.ts` (new; register in `server/routers.ts` three spots — import, type, value), `client/src/components/settings/SocialAdsConnectionPanel.tsx` (new), edit `client/src/pages/Settings.tsx` (integrations tab block `:2521-2537`), tests for router (createCaller) + panel.

**Router procedures** (all `protectedProcedure` + tenant flag assert; mutations wrapped with `createRateLimitMiddleware({namespace:"social-ads-cred", limit:10, windowMs:3_600_000})`): `getStatus` (query), `saveToken`, `saveAppCredentials`, `refreshAdAccounts`, `verify`, `disconnect`, `updateSettings` (max budget w/ typed-confirmation string when raising, notification prefs, automation_halted), `setDefaultAdAccount`, `setEnabledAdAccounts`. Response DTO: `{configured, status, tokenHint, tokenExpiresAt, grantedScopes[], missingScopes[], adAccounts[], defaultAdAccountId, appIdConfigured, appSecretHint, settings}` — never ciphertext/plaintext secrets.

**Panel** (clone structure of `client/src/components/settings/UserLlmKeysPanel.tsx` — DashboardCard, TanStack Query + invalidation, AlertDialog confirms): connection card (status badge + expiry countdown + paste field + validate&save), app credentials card, ad-accounts card (enable checkboxes, default radio, currency+timezone shown), scopes card (chips + Thai re-generate instructions), guardrails card (max daily budget ฿ input — display Money-formatted, warn+typed-confirm when raising, default ฿500), danger zone (disconnect explains secrets are deleted).

**Client token hygiene:** `type="password"`, `autoComplete="off"`, `name="metaAdsTokenInput"`, not in a native form; clear component state after submit; verify React Query Devtools not enabled in prod build (assert in code review, note in test plan).

---

## Section 06 — F02 core: adsGraphClient + AdsProvider seam + BUC governor + Redis cache

**Goal:** the one Graph access layer every feature uses — resilient, token-safe, rate-aware, paginated.

**Files:** `server/services/social/adsGraphClient.ts`, `server/services/social/adsProvider.ts` (interface + registry), `server/services/social/metaAdsProvider.ts`, `server/services/social/adsBucGovernor.ts`, tests with recorded fixtures under `server/services/social/__fixtures__/graph/`.

**AdsProvider interface** (consumed by routers/jobs; Meta is the only v1 impl): `getAdAccounts`, `getCampaigns`, `getAdSets`, `getAds`, `getInsights`, `getIssues`, `createCampaign`, `createAdSet`, `createAdCreative`, `createAd`, `updateEntity`, `mutateStatus`, `duplicateEntity`, `uploadAdImage`, `uploadAdVideo`, `searchTargeting`, `getPreviews`, `getPagePosts`. All money in/out as `Money`; all list methods cursor-follow to exhaustion (bound 2,000, `log()` when truncated).

**adsGraphClient mechanics:**
- Constructor `{connectionId}` — resolves token lazily per call via `socialAdsConnectionService.getDecryptedAccessToken` (never caches decrypted token beyond the call).
- Base URL `https://graph.facebook.com/${META_GRAPH_VERSION}`; token in `Authorization: Bearer` header only; `appsecret_proof` param added when same-app secret available; a URL-scrubber strips any `access_token=` from URLs before they can reach errors/logs (defense in depth).
- **Retry matrix:** GET → up to 3 retries on network/timeout/5xx/throttle codes (exp backoff + jitter); POST/DELETE → never retried. 190 → `markExpired`, throw non-retryable.
- Timeout 30s per call via `AbortSignal.timeout`.
- Parses `X-Business-Use-Case-Usage` / `X-App-Usage` after every call → `adsBucGovernor.report(adAccountId, usage)`; before every call → `adsBucGovernor.check(adAccountId, {critical})`: >80% non-critical reads served from cache/deferred, >95% non-critical jobs skip (throw a typed `ThrottleDeferred` the jobs interpret as "skip cycle"). Governor state in Redis (`social-ads:buc:{adAccountId}`, TTL 1h) — shared across users of a tenant app.
- **Batch:** `batch(requests[])` helper (≤50, each counts individually) used by the monitor.
- **Async insights:** `startInsightsRun(objectId, params)` → `report_run_id`; polled by the jobs worker (`getInsightsRunStatus`, `fetchInsightsRunResults`); run ids never persisted beyond the job (30-day expiry irrelevant then).
- **Read cache:** Redis, key `social-ads:cache:{connectionId}:{endpoint}:{paramsHash}`, TTL 60s; `invalidateEntity(connectionId, entityId)` deletes matching keys after any mutation.
- Audit: `social_ads_request/response` events (token-stripped endpoint, latency, usage %, truncated+sanitized payloads).

**Fixture-based contract tests:** recorded JSON fixtures for: paginated campaign list (3 pages), throttle header parsing, 190 error, async insights lifecycle, batch partial failure, budget-min error. `global.fetch = vi.fn()` returning fixtures.

---

## Section 07 — F02 read layer: socialAds router (reads) + menu + route + page shell

**Goal:** menu item, `/social/ads` page skeleton with account switcher, and all read endpoints.

**Files:** `server/routers/socialAds.ts` (new, registered in routers.ts), `packages/shared/src/constants/menu.ts` (add `social-ads`, sortOrder 7.5, `labelTh` inline, icon verified against `useMenuItems` iconMap — use `Megaphone` if present else `Target`), `client/src/pages/Dashboard.tsx` `socialSidebarItems` (`:533-568`), `client/src/App.tsx` route (`:649-653`), `client/src/pages/SocialAds.tsx` (shell + tabs skeleton: Overview, Campaigns, Issues, Insights, Automation, Pages, Advisor), hooks `client/src/hooks/useSocialAds.ts`.

**Read procedures** (gate: tenant flag + active connection → else `PRECONDITION_FAILED` with Thai message linking Settings; per-user read rate limit `{limit:120, windowMs:60_000}`): `listAdAccounts`, `getOverview` (spend today/7d/30d in account tz, active campaign count, issues count, account_status banner data), `listCampaigns`, `listAdSets(campaignId)`, `listAds(adsetId|campaignId)`, `getInsights(level, id, preset, breakdowns?)`, `listIssues`. Ownership: every procedure validates the requested `adAccountId`/entity lineage against the caller's connection `ad_accounts` cache — client-supplied `act_` ids never pass through unchecked.

**UI this section:** page shell + Overview and Campaigns tabs (table with configured-status vs effective_status chips, drill-down, Money-formatted spend, empty/loading/error states); Issues and Insights tabs (charts via `@/components/ui/chart` + recharts, provisional-label on <28d conversion metrics). Mutation buttons render disabled until Section 08 lands (feature-detection via router capability, not commented-out code).

---

## Section 08 — F03: mutations, guardrails, action log, credits, wizard

**Goal:** create/manage campaigns end-to-end with every safety layer.

**Files:** `server/services/social/adsActionService.ts` (intent-row protocol + per-entity lock + credits), `server/services/social/adsMutationService.ts` (validation + provider calls), extend `server/routers/socialAds.ts` with mutation procedures: `createCampaign`, `createAdSet`, `createAd` (wizard submit = the three chained with rollback-note on partial failure: earlier objects stay PAUSED, wizard resumes from the failed step), `updateBudget`, `updateSchedule`, `renameEntity`, `mutateStatus` (pause/resume), `duplicateEntity`, `archiveEntity`, `saveDraft`/`getDraft`/`deleteDraft`, `uploadCreativeAsset`, `getAdPreview`, `searchTargeting`, `listPagePostsForBoost` — all rate-limited `{namespace:"social-ads-mutation", limit:60, windowMs:3_600_000}`; `client/src/components/socialAds/CampaignWizard.tsx` + step components + `client/src/components/socialAds/mutations/*` (budget editor, status toggles, duplicate dialog).

**Intent-row protocol (adsActionService):** `executeAdsAction({userId, tenantId, adAccountId, action, targetLevel, targetId, requestPayload, actor, execute: () => Promise<GraphResult>})`:
1. Assert kill switches (tenant setting, user `automation_halted` — for system actors), assert dedupe: no `pending|unknown` row for same `(actor, action, targetId)`.
2. Acquire per-entity Redis lock `social-ads-lock:{targetId}` via `acquireSemaphore(redis, key, 1, 60)`; contention → typed error ("another change in progress") for users / skip-and-log for jobs.
3. Insert action-log row `intent_status='pending'` (sanitized payload) → run `execute()` → finalize `ok` (+ Graph response) | `error` | `unknown` (timeout).
4. On `ok` for user-initiated mutations: deduct platform credit via `deductCredits({idempotencyKey: 'social-ads-action:' + actionLogId, amount: <system_settings rate, default 1>, sourceType: 'social_ads'})`.
5. Release lock; invalidate read cache for the entity; audit event.

**Mutation validation (adsMutationService):** campaign create requires `special_ad_categories` (array, may be empty) and always `status:"PAUSED"`; ODAX objectives only; ad set validates optimization_goal/billing_event combos (table from research: almost all → IMPRESSIONS), Money budgets ≥ account `minimum_budgets` for the currency, lifetime requires end_time, targeting requires `geo_locations`; special-ad-category declared → server strips/rejects forbidden targeting narrowing; budget ceiling: effective cap = min(user `max_daily_budget`, tenant org cap) — exceeding requires `confirmationText === "ยืนยันเพิ่มงบ"` param; optimistic concurrency: client sends `expectedUpdatedTime`, server re-reads entity, drift → CONFLICT warning response requiring explicit override flag.

**Creative paths:** boost existing post via `object_story_id` = `{pageId}_{postId}` (page picker reads via existing `socialPages` page token); new creative via upload → `social_ads_creative_assets` cache (image_hash/video_id per ad account, reuse on hit) → `object_story_spec` with exactly one of link_data/video_data/photo_data; preview via `getPreviews` rendered in sandboxed `<iframe sandbox="allow-scripts" srcDoc=...>` — never `dangerouslySetInnerHTML`.

**Wizard:** 4 steps (objective/budget-mode/special-categories → ad set: budget, schedule, targeting builder w/ `searchTargeting` autocomplete + placements → creative → review = full summary + confirm). Autosave per step to `social_ads_drafts` (server row; resume prompt on reopen; purge >30d handled by retention job). Two-phase: review screen shows the exact provider payload summary. **Partial-failure resume:** submit chains campaign→adset→creative→ad; after each successful create the draft's `wizard_state.createdObjectIds {campaignId?, adSetId?, creativeId?}` is updated — a mid-chain failure leaves earlier objects PAUSED and the wizard resumes reusing recorded ids (never re-creates them).

---

## Section 09 — F04: monitor job, entity state, auto-block guards, notifications

**Goal:** problems detected within 15 minutes; opt-in guards pause bad ads automatically; humans can approve-first.

**Files:** `server/services/social/adsMonitorService.ts` (processor logic), guard evaluation in `server/services/social/adsGuardService.ts`, extend socialAds router (`listRules`, `saveRule`, `toggleRule`, `deleteRule`, `listActionFeed`, `resumeEntity`), Automation tab UI (rule cards for the 3 guard types + feed), extend approval flow.

**Monitor processor** (per connection, 15-min scheduler from Section 03): via Batch API fetch `effective_status`+`issues_info` for all ads/adsets/campaigns of enabled accounts + account status; diff against `social_ads_entity_state` (first run seeds silently); write transitions to `social_ads_monitor_snapshots`; update state table. Detections → guard evaluation + notification (`groupKey: "ads-issue:{entityId}:{toStatus}"`). Spend anomaly check: today's spend (account tz) vs trailing-7d avg multiplier and vs absolute cap. Token 190 mid-batch → fail fast (`markExpired`). Governor skip → log + next cycle.

**Guards (rules with `rule_type='guard'`):** `auto_pause_disapproved` (default-created ON at connect), `auto_pause_overspend` (ON, requires cap), `auto_pause_zero_delivery` (OFF, N hours param). Execution through `executeAdsAction` with `actor:'system:guard'`; guard cooldowns via the ledger; auto-paused entities are never auto-resumed (manual resume button in feed, or per-rule "resume next day" opt-in evaluated by the monitor). `approve_first` mode routes into `socialHumanApprovals` with `metadata.kind='social_ads'`.

**Approval authority change:** in the existing approval procedure (`socialAutomationService.approveAutomationAction` path), ads-kind approvals require `ctx.user.id === connection.userId` OR admin/domain_admin role; chat approvals unchanged.

---

## Section 10 — F05: optimizer engine + cooldown ledger + governance

**Goal:** rule-based optimization that cannot run away.

**Files:** `server/services/social/adsOptimizerService.ts`, Zod schemas `shared/socialAds/ruleSchemas.ts` (discriminated union per action, `.strict()`), extend router + Automation tab (rule builder UI incl. dry-run report view), admin governance endpoints (`forceDisableAdsConnection` admin procedure + oversight aggregates view).

**Executor flow (hourly per connection):** kill-switch checks → load enabled optimize rules → for each rule: evaluate metric over window via insights (account tz; conversion metrics require window ≥3 days old — provisional-data rule); `consecutive_hits` streak counters live in Redis (`social-ads:streak:{ruleId}:{targetId}`, TTL = 2× evaluation window — Redis loss resets streaks, which only DELAYS firing, never fires early); threshold met for the required streak → cooldown ledger check `(user, account, target, action)` → per-entity lock → **transactional re-read** of rule + settings + tenant cap (`SELECT ... FOR UPDATE`) re-validating `action_params` with the strict Zod schema (fail → disable rule + notify) → dry_run ? record a dry-run action-log row (`action='dry_run:'+realAction`, `intent_status='ok'`, `actor='system:optimizer'` — the dry-run report view filters these) : execute via `executeAdsAction({actor:'system:optimizer'})` → write ledger.
**Actions:** `pause`, `notify`, `budget_increase_pct`/`budget_decrease_pct` (Money-bounded by params min/max AND user cap AND org cap), `reallocate_to_best` (within campaign, shift pct from below-threshold ad sets to best performer, all bounds enforced).
**Precedence:** optimizer skips entities with a guard action inside the guard's cooldown window (ledger lookup by target regardless of action).
**Dry-run report:** stored evaluations viewable per rule ("would have done X because Y") for 7 days before user enables live.

---

## Section 11 — F06 + F07: integration glue, health panel, page insights collection + Pages tab

**Goal:** the suite acts as one product; every visible page is monitored.

**Files:** boost-post button in `client/src/pages/SocialPublishing.tsx` (opens wizard prefilled via router state), ads-badge in Moderation list (`SocialModeration.tsx` — comment rows whose post id matches an ad creative's effective post), health status card in `SocialChannels.tsx` + `server/routers/socialHealth.ts` (python reachability, webhook subscription per page, internal token configured — now FAIL CLOSED: `metaChannels.ts:56-57` warning becomes thrown error, ads connection status), `server/services/social/pageInsightsService.ts` + `pageFactsBuilder.ts`, Pages tab UI.

**Page insights processor** (daily per connection + 90-day backfill on connect): for each visible page (`/me/accounts` via user token — page tokens derived per call, not persisted): fetch the POST-PURGE metric set only — `page_follows`, `page_daily_follows`, `page_daily_unfollows_unique`, `page_media_view(_paid)`, `page_total_media_view_unique`, `page_post_engagements`, `page_views_total` (tolerate absence), `page_video_views`, `page_video_complete_views_30s`; recent ≤25 posts with `post_media_views`, `post_total_media_view_unique`, `post_clicks`, `post_reactions_*_total`, `post_video_avg_time_watched` + `comments.summary(true)`/`shares` from the post object. Metric names in ONE constant list; unknown-metric → null + WARN (never job failure). Upsert `social_page_insight_snapshots` on `(page_id, snapshot_date)` storing Meta's `end_time` as-is.

**pageFactsBuilder (FACTS ONLY — no judgments):** series + growth deltas (7/28/90d), posting cadence, content-type mix, per-slot engagement histogram (day×hour), top/bottom-5 posts with attributes, follower net-change, month-over-month self-comparison; nulls for zero-post windows (no fabricated zeros); explicitly NO paid-vs-organic reach split (API can't). Output shape documented as `PageFacts` type in `shared/socialAds/factsTypes.ts`. Unit test: output contains no token-shaped strings.

**Pages tab:** grid of page cards (followers + 28d sparkline, views trend, engagement, last-post age, "วิเคราะห์เพจนี้" button) → drill-down (charts, post table sortable, content-mix donut, posting-time heatmap, advisor report history). Pages lacking `read_insights` scope show reconnect prompt.

---

## Section 12 — F08: advisor skills + advisor service + Advisor tab + weekly reports

**Goal:** LLM analysis where ALL intelligence lives in skill.md files.

**Files:** `skills/social-page-advisor/skill.md` (LOWERCASE filename — loader precedence caveat) + `schemas/input.schema.json` + `schemas/ui.schema.json`; same for `skills/social-ads-advisor/`; `server/services/social/adsFactsBuilder.ts`; `server/services/social/socialAdvisorService.ts`; router procedures (`runAdvisor`, `listReports`, `getReport`, `setWeeklySchedule`); Advisor tab UI; weekly job processor.

**adsFactsBuilder (facts only):** per ad account — campaign/adset/ad metric rollups (spend Money, CPM/CPC/CTR/CPA, frequency, results per objective), issues list, budget distribution, placement/age/gender breakdowns, account limits/status, recent guard+optimizer action history, dry-run outputs, linked page summary facts. Provisional flags on <restatement-window conversion metrics. No thresholds/labels/advice in TS. **Types:** `AdsFacts` lives beside `PageFacts` in `shared/socialAds/factsTypes.ts` (Section 11); the advisor report Zod schema (`reportSchemaVersion: 1`, shape per spec §18.4) lives in `shared/socialAds/advisorReportSchema.ts` and is the `outputSchema` passed to `invokeLLM` AND the parse validator.

**socialAdvisorService.runReport({userId, tenantId, subjectType, subjectId, goal?}):**
1. Build facts (page or ads builder). 2. Load skill row via `getSkillByIdAsync` (content = system prompt; skills auto-synced from folder by the registry). 3. `invokeLLM({model: await resolveEnabledLlmModelId(), messages: [system: skill content, user: facts JSON + goal], outputSchema: reportSchema})` — `executeSkill` is NOT used (it cannot run llm-only skills). 4. Lenient parse (accept-then-normalize, ≤2 retries; final failure stores raw + `parseFailed:true`, renders markdown fallback). 5. `deductCreditsForModel({userId, model, inputTokens, outputTokens, sourceType:'social_ads_advisor', skillSlug})`. 6. Persist `social_advisor_reports` (facts_snapshot + report + model + credits + traceId `social-ads-advisor:{reportId}`). 7. Audit event.

**skill.md content requirements** (both skills; Thai-first; authored per spec §18.2/18.3): frontmatter (`category: chat_assistant`, `auto_trigger: false`); analysis-dimension guidance; the recommendation rules (cite facts, priority × effort, how-to steps, recheck metric, humility on small samples/provisional data); Output Format section = the §18.4 JSON schema verbatim. `social-ads-advisor` additionally emits optional `suggestedAction` entries restricted to `pause|budget_adjust|none` — the Advisor tab renders "นำไปใช้" only for mappable types, routing through the standard Section 08 confirm flow (skills never execute).

**Advisor tab:** subject picker (page or ad account), goal selector, run button with display-only cost estimate (facts-JSON token approximation × model input rate + typical output allowance, labeled "โดยประมาณ" — actual charge is post-hoc via deductCreditsForModel), report cards (summary/health/strengths/issues/recommendations with priority chips + apply buttons), history list with facts-diff highlights (TS-computed deltas, rendering only), weekly schedule toggle per subject — schedules persist in `social_ads_settings.notification_prefs.advisorSchedules: [{subjectType, subjectId, cadence:'weekly', hourLocal}]`, read by the daily scheduler tick which enqueues `social:advisor-reports` jobs.

---

## Section 13 — Observability, retention, runbooks, P6 OAuth + App Review readiness

**Goal:** production operability + the premium onboarding path.

**Files:** metrics/counters in worker + client services (follow existing logging patterns; counters via structured logs + audit events — no new metrics stack), `social:ads-retention` daily processor (purge snapshots >90d, drafts >30d, page snapshots >13mo; archive action_log >2y to file storage then delete), runbooks in `specs/feature/031-SocialAdsManagement/runbooks/` (graph-version-upgrade.md, token-compromise.md, unknown-intent-reconciliation.md), alert conditions (log-based: job failure rate, `intent_status='unknown'` older than 15 min → notification to admins, BUC >95% sustained, guard actions >N/hour per user), **OAuth flow (P6):** `server/routers/socialAdsOAuth.ts` — `getAuthUrl` (state param = signed nonce in Redis, scope list minimized to implemented methods) + `completeOAuth` (code→token exchange server-side with app secret, then the same pipeline as saveToken), callback page reusing the existing `AuthCallback.tsx` pattern; UI switches paste-token ↔ OAuth automatically by app review status (system_settings `integrations/meta_ads_app_reviewed` boolean, admin-set); App Review checklist doc (scopes justification, screencast requirements, test-user instructions) in runbooks.

**Startup version check:** on boot, log WARN if `META_GRAPH_VERSION` is within 6 months of its published sunset (table maintained in the version constant module).

---

## Testing strategy summary (per phase gates)

- Unit: money math, account-time bucketing, rule Zod unions, sanitizer fixtures, cooldown ledger, error map, facts builders (token-hygiene + null-handling).
- Contract: adsGraphClient vs recorded fixtures (pagination, throttle, 190, async insights, batch partial failure).
- Router: createCaller with mocked services (ownership, gating, rate limits, PRECONDITION paths).
- Worker: processors as pure functions with mocked provider + DB; idempotency (claim semantics) tests; Redis payload hygiene test.
- Integration (manual/gated): sandbox account CRUD if available; real-account PAUSED-only smoke; App-Review-mode OAuth with a test user (P6).
- Standing per phase: `pnpm check`, `pnpm test`, `npm run build:deploy`, smoke via https://smartaihub.app, audit-log spot check by traceId.

## Risks & mitigations (top 5)

1. **Duplicate spend via retry/timeout** → mutations never auto-retried; intent rows; `unknown` alert within 15 min; reconciliation runbook.
2. **Meta metric/version churn** → single version constant + startup check; metric list constant with null-tolerance; fixtures updated per version bump (runbook).
3. **Token in Redis/logs** → payload-id-only rule + automated grep test + sanitizer regex extension.
4. **Runaway automation** → kill-switch hierarchy, dry-run defaults, cooldown ledger, org cap, per-entity locks, guard>optimizer precedence.
5. **Sandbox unavailability** → fixture-first CI; PAUSED-only real-account manual gates.
