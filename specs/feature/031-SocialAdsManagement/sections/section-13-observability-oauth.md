# Section 13 — Observability, Retention, Runbooks + P6 OAuth & App Review Readiness

**Section id:** `section-13-observability-oauth`
**Feature:** 031-SocialAdsManagement — production operability + the premium onboarding path
**Rollout phase:** P6 (final section; the retention/alert/version-check parts may ship as soon as their dependencies exist, the OAuth half is the P6 gate)
**Working directory:** `apps/web/` (all relative paths below; runbooks live outside it — absolute paths given)
**Depends on:** section-01 (tables + i18n registry), section-03 (`socialJobsWorker` queues, `registerSocialJobProcessor`, `social:ads-retention:daily` scheduler), section-04 (`sweepExpiryNotifications`, `saveToken` pipeline), section-06 (`META_GRAPH_VERSION` in `adsGraphClient.ts`), section-05 (`SocialAdsConnectionPanel.tsx` — this section edits it), section-10 + section-12 (their action-log/report volumes are what retention and alerts operate on).
**Blocks:** nothing (final).

---

## 1. Goal

Four deliverables:

1. **Retention processor** on the `social:ads-retention` queue: bounded purges of aged rows + archive-then-delete for the immutable action log.
2. **Alerting + counters** with NO new metrics stack: a 15-minute alerts sweep (unknown-intent, guard-rate runaway, token-expiry backlog, BUC-sustained) emitting deduped admin notifications, plus a tiny structured-log metric helper.
3. **Startup Graph-version sunset check** + three operational **runbooks** + App Review checklist doc.
4. **P6 OAuth flow** (`socialAdsOAuth` router: `getAuthUrl`/`completeOAuth` with a Redis state nonce, server-side code→token exchange feeding the EXISTING `saveToken` pipeline) and the paste-token ↔ OAuth **mode switch** driven by an admin-set `meta_ads_app_reviewed` setting.

---

## 2. Background context (self-contained)

- **Queue plumbing already exists (Section 03):** `server/workers/socialJobsWorker.ts` registered queue `social:ads-retention` with a daily scheduler id `social:ads-retention:daily` (every 86_400_000 ms) and a no-op dispatch until a processor is registered via `registerSocialJobProcessor(queueName, fn)` (or the dispatch-map equivalent Section 03 landed — read that file first and use whichever registration mechanism it shipped). Job payloads are ids-only; `removeOnComplete/removeOnFail` already set.
- **Retention targets (tables from Section 01, retentions documented there):** `socialAdsMonitorSnapshots` (`detectedAt` > 90 days), `socialAdsDrafts` (`updatedAt` > 30 days), `socialPageInsightSnapshots` (`snapshotDate` > 13 months), `socialAdvisorReports` (`createdAt` > 1 year — Section 01 note), `socialAdsActionLog` (> 2 years: **archive to file storage, then delete** — never plain delete; the log is the audit/idempotency anchor). `social_ads_action_log` has **no connection FK by design** — disconnect (Section 04) never touches it; this section adds a regression assertion.
- **File storage:** `storagePut(relKey, data, contentType)` from `server/storage.ts:399` (local/S3/forge abstraction). Archive as JSONL (`application/x-ndjson`).
- **Notifications:** `createNotification` (`server/services/notificationService.ts:292`) with `groupKey` dedup. Admin-targeted notifications follow the existing convention used by the feedback/system alerts (locate an existing admin-broadcast call site and mirror it).
- **Unknown-intent semantics (Section 08):** every mutation writes an intent row `intentStatus='pending'` before the Graph call and finalizes `ok|error|unknown`. A `pending|unknown` row older than 15 minutes means a possible duplicate-spend situation → page a human (spec §14.2).
- **Version constant (Section 06):** `export const META_GRAPH_VERSION = "v25.0"` in `server/services/social/adsGraphClient.ts` — the ONLY version string. Known sunset facts (research): v21–v23 already sunset; v24 Marketing API expires **2026-10-06**; v25 sunset unpublished at planning time.
- **saveToken pipeline (Section 04):** `socialAdsConnectionService.saveToken(userId, tenantId, rawToken)` does live validation, debug_token, same-app long-lived exchange, encrypt, upsert, scheduler registration, audit. **OAuth reuses it verbatim** — completeOAuth's only job is obtaining `rawToken` server-side.
- **Existing OAuth precedent:** `client/src/pages/AuthCallback.tsx` handles `/auth/callback/:provider` (Google/GitHub/Meta-channels; the meta branch calls `trpc.metaChannels.completeOAuth`). The ads flow adds a `meta-ads` provider branch — but unlike metaChannels (which proxies Python), ads OAuth is Node-side.
- **App credentials:** user-level `appId`/`encryptedAppSecret` on the connection row, tenant fallback `integrations/meta_ads_app_id` / `meta_ads_app_secret` in system_settings (Section 01). OAuth mode REQUIRES a resolvable app id+secret (the code exchange needs `client_secret`).
- **Redis:** `getRealtimeClient()` from `server/services/redisClients.ts` (`.duplicate()` if a dedicated connection is warranted; plain client fine for GET/SET).
- **Rate limiting:** `createRateLimitMiddleware` from `server/_core/rateLimitedProcedure.ts:27`.
- **Router registration:** `server/routers.ts` — three spots (import, type, value), same as Section 05 did for `socialAdsConnection`.
- **Production origin:** `https://smartaihub.app` is the ONLY public domain — the OAuth redirect URI allowlist derives from it (reuse the server's existing base-URL/env helper if one exists; grep `redirect_uri` usages before hardcoding).

---

## 3. Files

| File | Action |
|---|---|
| `server/services/social/adsRetentionService.ts` | **New** — retention processor (purges + archive-then-delete), hosts the daily `sweepExpiryNotifications()` call |
| `server/services/social/adsObservabilityService.ts` | **New** — `logAdsMetric` helper, alerts sweep (`processAdsAlertsSweep`), guard-rate/unknown-intent/backlog checks |
| `server/services/social/__tests__/adsRetentionService.test.ts` | **New** |
| `server/services/social/__tests__/adsObservabilityService.test.ts` | **New** |
| `server/services/social/adsGraphClient.ts` | Edit — add `META_GRAPH_SUNSET_DATES` table + `checkGraphVersionSunset(now?)` beside `META_GRAPH_VERSION` |
| `server/workers/socialJobsWorker.ts` | Edit (small) — register the retention + alerts processors; add scheduler `social:ads-retention:alerts` (every 900_000 ms) beside the daily one; call `checkGraphVersionSunset()` once during `initSocialJobsWorker` (or in `_core/index.ts` — one WARN at boot, pick one site) |
| `server/routers/socialAdsOAuth.ts` | **New** — `getAuthUrl`, `completeOAuth`, `getCapabilities` |
| `server/routers.ts` | Edit — register `socialAdsOAuth` (import/type/value) |
| `server/routers/__tests__/socialAdsOAuth.test.ts` | **New** |
| `server/routers/systemSettings.ts` | Edit — register `integrations/meta_ads_app_reviewed` (boolean-string, non-sensitive, default `"false"`, admin-set) and `integrations/social_ads_guard_alert_hourly_max` (non-sensitive, default `"20"`) following the Section 01 idiom |
| `client/src/pages/AuthCallback.tsx` | Edit — `meta-ads` provider branch calling `trpc.socialAdsOAuth.completeOAuth`, then redirect to Settings integrations tab |
| `client/src/components/settings/SocialAdsConnectionPanel.tsx` | Edit — capability-driven mode switch: OAuth connect button (reviewed mode) vs paste-token card (default); paste stays available behind an "สำหรับผู้ดูแล/นักพัฒนา" disclosure in OAuth mode |
| `client/src/locales/{th,en}/social.json` + `client/src/lib/socialAdsI18nKeys.ts` | Edit — new `ads.connection.oauth*` / `ads.oauth.*` keys appended to `SOCIAL_ADS_I18N_KEYS` (Section 01 parity test enforces th/en) |
| `/home/dev/projects/SmartSpecPro/specs/feature/031-SocialAdsManagement/runbooks/graph-version-upgrade.md` | **New** doc |
| `/home/dev/projects/SmartSpecPro/specs/feature/031-SocialAdsManagement/runbooks/token-compromise.md` | **New** doc |
| `/home/dev/projects/SmartSpecPro/specs/feature/031-SocialAdsManagement/runbooks/unknown-intent-reconciliation.md` | **New** doc |
| `/home/dev/projects/SmartSpecPro/specs/feature/031-SocialAdsManagement/runbooks/app-review-checklist.md` | **New** doc |

No schema changes, no migration in this section.

---

## 4. TDD — write these tests FIRST

Conventions: Vitest, node env, no network/DB/Redis — `vi.hoisted` mock bag + module-boundary `vi.mock` (idiom: `server/services/__tests__/socialDraftService.test.ts`), chainable drizzle mock (idiom: `creditService.test.ts:3-45`), createCaller for the router (idiom: `__tests__/socialInbox.test.ts`). Mock `server/storage.ts` (`storagePut`), `server/services/notificationService.ts`, `server/services/redisClients.ts`, `server/services/social/socialAdsConnectionService.ts` (`saveToken`, `sweepExpiryNotifications`), `global.fetch` for the OAuth code exchange. No test performs real network I/O (unmocked fetch fails the suite per the vitest setup gate).

### `adsRetentionService.test.ts`

1. **Purge predicates:** the daily run issues bounded deletes with the exact cutoffs — `socialAdsMonitorSnapshots` `detectedAt < now-90d`, `socialAdsDrafts` `updatedAt < now-30d`, `socialPageInsightSnapshots` `snapshotDate < now-13mo`, `socialAdvisorReports` `createdAt < now-1y`. Rows younger than each cutoff are untouched (assert the where-clause bounds on the mocked drizzle calls; feed fixture rows straddling each cutoff).
2. **Archive-then-delete ordering:** `socialAdsActionLog` rows with `createdAt < now-2y` → `storagePut` called with a JSONL buffer + key shaped `social-ads/action-log-archive/{YYYY-MM-DD}/batch-*.jsonl` **before** any delete is issued; `storagePut` rejecting → **no delete executed** for that batch, error logged, run continues to the next table (one failure never poisons the whole run). Archived JSONL content passes the token-hygiene canary (no `EAA`/`access_token` substrings — rows were sanitized at insert, this re-asserts).
3. **Bounded batches:** deletes/archives run in `LIMIT`-ed loops (assert a limit ≤ 5000 appears; loop stops when a batch returns fewer rows than the limit).
4. **No cascade on disconnect (regression):** type-level — `socialAdsActionLog`'s select type has **no** `connectionId` key (the table has no connection FK, so connection deletion can never cascade into it); plus assert this service never issues a delete against `socialAdsActionLog` outside the >2y archive path.
5. **Expiry sweep hosted:** the daily run calls `sweepExpiryNotifications()` (mock) exactly once.

### `adsObservabilityService.test.ts`

6. **Unknown-intent alert:** given mocked `socialAdsActionLog` rows — one `pending` aged 20 min, one `unknown` aged 16 min, one `pending` aged 5 min — the alerts sweep calls `createNotification` for the two stale rows only, admin-targeted, with `groupKey: "ads-unknown-intent:{actionLogId}"`; a second sweep run produces the same groupKeys (dedup is groupKey's job — assert the exact strings, no new key shapes).
7. **Guard-rate runaway:** > N guard actions (`actor='system:guard'`, last 60 min, grouped per user; N from the mocked `social_ads_guard_alert_hourly_max` setting, default 20) → one admin notification with `groupKey: "ads-guard-runaway:{userId}:{yyyy-mm-dd-hh}"`; at/below N → none.
8. **Token-expiry backlog:** ≥ 1 connection `status='expired'` older than 7 days, or ≥ 5 expiring within 7 days → one deduped admin notification (`groupKey: "ads-token-backlog:{yyyy-mm-dd}"`).
9. **`logAdsMetric`:** emits ONE structured log line with a stable prefix (e.g. `[social-ads-metric]`) carrying `{metric, value, dims}` — and never any payload beyond scalars/ids (hygiene assertion on the serialized line).
10. **Version check:** `checkGraphVersionSunset(now)` — pinned version whose sunset entry is within 6 months of `now` → returns/logs a WARN with the version + date; sunset > 6 months away → silent; version absent from `META_GRAPH_SUNSET_DATES` → no warn (optionally one info). Test by injecting `now`; do not mock timers globally.

### `socialAdsOAuth.test.ts` (createCaller with mocked services)

11. **getAuthUrl:** returns a `https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth?...` URL containing `client_id` (resolved user-row → tenant-settings fallback, mocked), `redirect_uri` exactly from the allowlist constant (never client-supplied), `state` = the generated nonce, `scope` = the joined `SOCIAL_ADS_OAUTH_SCOPES` constant — and the Redis mock received a SET of `social-ads:oauth-state:{nonce}` → JSON `{userId, tenantId}` with TTL ≈ 600s. The URL and response contain **no** secret (`client_secret` absent — assert).
12. **completeOAuth — state validation:** unknown/expired state (Redis GETDEL → null) → TRPC `FORBIDDEN`/`BAD_REQUEST`, and the token-exchange fetch is **never** called. State whose stored `userId` ≠ caller → rejected (nonce is single-use AND caller-bound).
13. **completeOAuth — happy path:** valid state → server-side `GET /oauth/access_token` exchange (mock fetch; assert `client_secret` + `code` + allowlisted `redirect_uri` in the request, and that this URL never reaches a logger/thrown message) → `socialAdsConnectionService.saveToken(userId, tenantId, exchangedToken)` invoked (mock) → response = the secret-free `ConnectionStatusDTO` from saveToken; runtime walk of the response finds no `EAA`-prefixed string.
14. **getCapabilities:** `meta_ads_app_reviewed` setting `"false"`/absent → `{mode: "paste"}`; `"true"` → `{mode: "oauth"}`. Both gated by `SOCIAL_ADS_ENABLED` tenant flag (flag false → `FORBIDDEN`, same assert style as Section 05's router tests).
15. **Rate limit + registration:** mutations wrapped with `createRateLimitMiddleware({namespace: "social-ads-oauth", limit: 10, windowMs: 3_600_000})` (assert middleware presence per the Section 05 test idiom); router registered in `routers.ts` (import-level smoke).

Section is done only when these pass AND `cd apps/web && pnpm test` full suite is green and `pnpm check` is clean on new files.

---

## 5. Implementation

### 5.1 Retention (`adsRetentionService.ts`)

```ts
/** Daily processor for queue social:ads-retention (job name "daily").
 *  Order: archive action_log first (fail-safe), then purges, then sweepExpiryNotifications. */
export async function processAdsRetentionDaily(): Promise<void>;
/** Archive-then-delete for social_ads_action_log rows older than 2 years, batched. */
export async function archiveExpiredActionLog(now?: Date): Promise<{ archived: number }>;
```

- Cutoffs as module constants (`RETENTION_MONITOR_SNAPSHOT_DAYS = 90`, etc.) — tests pin them.
- Archive: select batch (≤ 5000, ordered by `createdAt`) → serialize to JSONL → `storagePut("social-ads/action-log-archive/{date}/batch-{n}.jsonl", buf, "application/x-ndjson")` → delete exactly those ids → loop. Put failure aborts that table's pass only.
- Each pass ends with `logAdsMetric("retention_deleted", count, { table })`.
- Register via Section 03's mechanism: `registerSocialJobProcessor(SOCIAL_JOB_QUEUES.adsRetention, dispatcher)` where the dispatcher switches on job name (`daily` → retention, `alerts` → observability sweep). Read `socialJobsWorker.ts` first — match whatever registration/dispatch shape it actually shipped.

### 5.2 Observability (`adsObservabilityService.ts`)

```ts
/** Structured-log counter — NO new metrics stack. Stable prefix "[social-ads-metric]". */
export function logAdsMetric(metric: string, value: number, dims?: Record<string, string | number>): void;
/** 15-min sweep (queue social:ads-retention, job name "alerts"):
 *  unknown intents >15min, guard-rate runaway, token-expiry backlog. */
export async function processAdsAlertsSweep(): Promise<void>;
```

- Add scheduler `upsertJobScheduler("social:ads-retention:alerts", { every: 900_000 }, { name: "alerts", data: {} })` next to the daily one in `socialJobsWorker.ts` init.
- BUC >95% sustained: read the `adsBucGovernor` Redis keys (`social-ads:buc:{adAccountId}`); if a governor snapshot has been >95% across two consecutive sweeps (keep last-seen in Redis `social-ads:buc-alert:{adAccountId}`, TTL 1h) → deduped admin notification. Keep this check tolerant — governor key absent → skip silently.
- **Job failure rate >20%/30min stays log-based** (no code): worker failure logs already carry queue names; document the grep/alert expression in `unknown-intent-reconciliation.md` ops notes. Do not build a metrics store.
- All notifications: admin-targeted, Thai copy, `groupKey` shapes exactly as pinned by the tests above.

### 5.3 Version check (`adsGraphClient.ts` edit + boot call)

- `export const META_GRAPH_SUNSET_DATES: Record<string, string> = { "v24.0": "2026-10-06" /* + any published dates; v25.0 added when Meta publishes */ };`
- `export function checkGraphVersionSunset(now = new Date()): void` — WARN when `META_GRAPH_SUNSET_DATES[META_GRAPH_VERSION]` exists and is < 6 months away (or past). Pure + injectable `now` for tests.
- Call once at boot (inside `initSocialJobsWorker` or beside it in `server/_core/index.ts` — one site only).

### 5.4 OAuth router (`server/routers/socialAdsOAuth.ts`)

```ts
export const SOCIAL_ADS_OAUTH_SCOPES = [
  "ads_read", "ads_management", "read_insights",
  "pages_show_list", "pages_read_engagement", "business_management",
] as const; // minimized to what Sections 04–12 actually call — do not add scopes "for later"

// Procedures (all protectedProcedure + SOCIAL_ADS_ENABLED flag assert):
// getAuthUrl (query)      → { url }              — nonce → Redis social-ads:oauth-state:{nonce} = {userId, tenantId}, TTL 600s
// completeOAuth (mutation, rate-limited 10/h) ({ code, state }) → ConnectionStatusDTO
// getCapabilities (query) → { mode: "oauth" | "paste"; appConfigured: boolean }
```

- **Dialog URL:** `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth` with `client_id`, `redirect_uri`, `state`, `scope`. Redirect URI = single allowlist constant built from the canonical origin (`https://smartaihub.app/auth/callback/meta-ads`); never taken from input.
- **completeOAuth:** GETDEL the state key (single-use), assert stored user/tenant match `ctx`; exchange `code` server-side via `GET /{v}/oauth/access_token?client_id&redirect_uri&client_secret&code` using the resolved app secret (user row → tenant `meta_ads_app_secret` fallback, decrypted server-side only); then call `socialAdsConnectionService.saveToken(...)` — everything downstream (validation, long-lived exchange, encryption, schedulers, audit) is Section 04's code, untouched. The exchange URL contains a secret → it must never appear in logs, audit payloads, or error messages (scrub before throwing; reuse Section 06's URL-scrubber idea).
- **getCapabilities:** reads `integrations/meta_ads_app_reviewed` (system_settings, admin-set boolean-string). `"true"` + app credentials resolvable → `oauth`; else `paste`. This is a UI hint only — both server paths remain enabled (paste is the admin/tester escape hatch; spec interview decision).
- Register in `routers.ts` (three spots).

### 5.5 Client

- **`AuthCallback.tsx`:** add a `meta-ads` branch mirroring the existing `meta` branch (`:25-42`) — parse `code`/`state` from the query string, call `trpc.socialAdsOAuth.completeOAuth`, success/error → redirect to the Settings integrations tab. No `App.tsx` route work needed if `/auth/callback/:provider` already matches (it does — verify).
- **`SocialAdsConnectionPanel.tsx`:** query `getCapabilities`; `mode === "oauth"` → primary CTA "เชื่อมต่อด้วย Facebook" (full-page redirect to `getAuthUrl().url`, same pattern as the meta-channels connect) with the paste-token card collapsed under a developer disclosure; `mode === "paste"` → current Section 05 layout unchanged plus a muted note that OAuth arrives after App Review. No token handling changes.
- i18n: `ads.connection.oauthConnect`, `ads.connection.oauthPendingReview`, `ads.connection.pasteAdvanced`, `ads.oauth.success`, `ads.oauth.failed` in both locales + appended to `SOCIAL_ADS_I18N_KEYS`.

### 5.6 Runbooks (markdown docs, no code)

- **graph-version-upgrade.md:** bump procedure — update `META_GRAPH_VERSION` + sunset table, re-record `__fixtures__/graph/*` fixtures, run contract tests, resolve F07 metric-name drift (unknown-metric → null policy), staged deploy.
- **token-compromise.md:** response order — tenant kill switch (`social_ads_automation_halted`) → admin `forceDisableAdsConnection` (Section 10) → user re-auth (paste/OAuth) → audit-log review by traceId → notification cleanup.
- **unknown-intent-reconciliation.md:** for each stale `pending|unknown` row — query Graph for a matching created/mutated object (name + creation-window per Section 06's reconciliation helper), finalize the row `ok`/`error` manually, refund/charge credits per outcome, never blind-retry. Include the log-based job-failure-rate alert expression here.
- **app-review-checklist.md:** per-scope justification (map each `SOCIAL_ADS_OAUTH_SCOPES` entry to the exact feature/endpoints using it), screencast requirements, test-user setup instructions, redirect-URI + privacy-policy prerequisites, and the flip procedure for `meta_ads_app_reviewed`.

---

## 6. Constraints & non-goals

- **No new metrics/observability infrastructure** — structured logs + audit events + notifications only.
- **Retention deletes are the ONLY sanctioned bulk deletes** in the feature; they are cutoff-bounded and tested. Action-log rows die only via archive-then-delete. Do not add TRUNCATE/unbounded deletes anywhere.
- OAuth adds **no new token storage path** — `saveToken` remains the single pipeline; `decrypt()` for ads credentials still appears only in `socialAdsConnectionService.ts`; the code-exchange secret/URL never reaches logs or client.
- Do not modify Section 04/06 behavior beyond the additive sunset-table export; do not touch guard/optimizer logic (Sections 09/10).
- Paste-token mode is never removed — it is the fallback while App Review is pending and the tester path afterward.
- Live systemd restarts / real Meta App Review submission are business/ops tasks outside the coding agent's scope — note in the handoff that `server/_core/index.ts` (or worker init) changed → web service restart required.

## 7. Acceptance (P6 gate)

- Retention: a seeded-aged dataset is purged/archived per cutoffs with zero younger-row loss (tests 1–5); archives appear in file storage as sanitized JSONL.
- A forced-stale `pending` intent row produces exactly one admin notification within one alerts sweep (test 6); groupKey dedup verified.
- Boot logs one WARN when the pinned Graph version is within 6 months of a published sunset (test 10).
- OAuth: state-nonce round-trip proven by tests 11–13; with `meta_ads_app_reviewed=true` a non-admin test user completes connect via the popup/redirect flow on the reviewed app, **or** the mode flag stays `"false"` and the feature ships dormant (paste mode) pending review — either satisfies the gate.
- `cd apps/web && pnpm test` green, `pnpm check` clean, i18n parity test green with the new keys, no token-shaped string in any new response/log fixture.