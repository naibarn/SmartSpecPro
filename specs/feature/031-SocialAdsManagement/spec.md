# 031-SocialAdsManagement: Facebook Ads Management + Social Suite Completion

**Version:** 1.2.0
**Date:** 2026-07-17
**Status:** Draft — pending user approval
**Review History:** v1.0 → v1.1: dual adversarial review — 30 architecture findings (2 must-fix: duplicate-spend-on-retry, money-units/timezone) + 20 security findings (3 CRITICAL: tokens-in-Redis, token-in-URL, unsanitized immutable action log). All 50 incorporated; resolution matrix in §13. Factual correction: server-side `fetchWithResilience.ts` **does not exist in any branch** (verified via `git log --all`) — v1.0 referenced it as existing; v1.1 specifies building the Graph client's own resilience layer. | v1.1 → v1.2: added **Feature 07 (Page Performance Monitoring — all visible Pages)** and **Feature 08 (Skill-First Analysis & Advisor skills)** per user requirement: complete per-page performance monitoring + LLM-driven recommendations (follower growth, engagement, reach) and ads analysis/advice, all intelligence living in `skill.md` files (skill-first project policy), TypeScript computing facts only.
**Principle:** Reuse existing Social subsystem patterns (encrypted per-user credentials, `META_CHANNELS_ENABLED` gating, Dashboard social sidebar). All secrets live encrypted in PostgreSQL — **never in files, never in Redis, never in URLs**. Every user configures their own credentials through their own Settings UI. The system spends real money autonomously — every automated mutation is bounded, locked, logged, and killable.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current-State Audit: Social Suite Production Readiness](#2-current-state-audit)
3. [Feature 00: Social Jobs Worker (Prerequisite — fixes broken autopost)](#3-feature-00-social-jobs-worker)
4. [Feature 01: Per-User Encrypted Ads Credentials + Settings UI](#4-feature-01-credentials)
5. [Feature 02: Social Ads Management Module (menu, routes, Graph client, read layer)](#5-feature-02-ads-module)
6. [Feature 03: Campaign Creation & Management](#6-feature-03-campaign-management)
7. [Feature 04: Ad Monitoring, Issue Detection & Auto-Block](#7-feature-04-monitoring)
8. [Feature 05: Ads Optimization Engine](#8-feature-05-optimization)
9. [Feature 06: Social Suite Integration & Gap Closure](#9-feature-06-integration)
10. [Governance: Kill Switch, Roles, Approval Authority](#10-governance)
11. [Database Schema Changes](#11-database-schema-changes)
12. [Security Requirements](#12-security-requirements)
13. [Review Findings Resolution Matrix (v1.0 → v1.1)](#13-review-findings-resolution)
14. [Observability & Operations](#14-observability--operations)
15. [Testing Strategy](#15-testing-strategy)
16. [Rollout Phases, Rollback & Verification](#16-rollout-phases--verification)
17. [Feature 07: Page Performance Monitoring — All Visible Pages (v1.2)](#17-feature-07-page-performance)
18. [Feature 08: Skill-First Analysis & Advisor Skills (v1.2)](#18-feature-08-advisor-skills)

---

## 1. Executive Summary

### Goal

Add a complete **Social Ads Management** capability (Facebook/Meta Marketing API) to the existing Social suite (Channels, Inbox, Publishing, Moderation, Automation), covering:

- Per-user encrypted credential storage in the database (access tokens, app secrets, ad account selection) — configured only via each user's own Settings UI. No file-based tokens (the `.fb_token` proof-of-concept file is removed at rollout).
- New Dashboard menu item **Social Ads Management** alongside the 5 existing social items.
- Full ads lifecycle: view/create/edit campaigns → ad sets → ads, insights & reporting, issue detection, auto-pause of problematic ads (DISAPPROVED / WITH_ISSUES), and rule-based optimization.
- *(v1.2)* **Complete performance monitoring of every visible Page** (followers, reach, engagement, page views, video views, per-post performance, posting-time analysis) with daily snapshots and 90-day backfill (§17).
- *(v1.2)* **Skill-first analysis & recommendations**: two new skills — `social-page-advisor` (คำแนะนำเพิ่มผู้ติดตาม/reach/engagement ต่อเพจ) and `social-ads-advisor` (วิเคราะห์+แนะนำการจัดการโฆษณา) — where ALL judgment lives in `skill.md` and TypeScript computes facts only; advice can map to guarded one-click actions but never self-executes (§18).
- Repair of the existing Social suite so scheduling/automation actually executes (currently broken — see audit), because ads automation reuses the same background runner.

### Verified connectivity baseline (2026-07-17 manual test)

A live test from this server with a Graph API Explorer user token confirmed: `graph.facebook.com` reachable; `ads_read`/`ads_management`/`business_management`/`pages_read_engagement`/`pages_show_list` grantable; ad account `act_481391007413105` (8 campaigns / 8 ad sets / 8 ads) fully readable including `effective_status` (found live examples of `WITH_ISSUES` ×3 and `DISAPPROVED` ×2 — exactly the states Feature 04 must detect); page posts readable via Page token; comment reading requires `pages_read_user_content` (confirmed 400 without it). **Caution:** this 8-object account is too small to expose pagination, rate-limit, or async-insights behavior — those must be tested against sandbox accounts (§15).

### Key architectural decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Ads Graph API client implemented in TypeScript** (`apps/web/server/services/social/adsGraphClient.ts`) calling `https://graph.facebook.com/v21.0` directly, **with its own purpose-built resilience layer** (§5.2) | Keeps ads independent of the Python proxy. ⚠️ v1.1 correction: there is NO existing server-side resilience helper (`fetchWithResilience.ts` was planned but never committed — verified `git log --all` empty); the `whatsapp.ts` precedent is a bare one-shot `fetch`. The client therefore specifies its own retry/backoff/error-classification (GET-only retry; mutations never auto-retried). |
| D2 | **New dedicated table `social_ads_connections`** for per-user ads credentials rather than overloading `socialProviderConnections` | `socialProviderConnections` rows are written by the Python OAuth callback with page-scoped tokens; ads tokens have different scopes, lifecycle, and per-ad-account selection. Clean separation avoids breaking the existing Channels OAuth flow. |
| D3 | **Meta App ID + App Secret stored per-user (encrypted)** with an optional tenant-level fallback in `system_settings` (`category: "integrations"`, `isSensitive: true`). **Constraint (v1.1): app id/secret are only usable with tokens minted by that same app** — `fb_exchange_token` and `appsecret_proof` fail across apps. A pasted Graph-Explorer token (minted by Meta's own app) gets NO exchange/proof; it is stored short-lived with explicit expiry warning until the user provides a token from their own app. | User requirement: self-service per user. The cross-app mismatch was an unhandled failure mode in v1.0 (arch finding 9). |
| D4 | **`appsecret_proof` on all Graph calls when (and only when) the app secret matches the token's owning app**; token transport is **always `Authorization: Bearer` header — never URL query param** | Meta best practice + prevents token leakage into nginx/proxy logs, error objects, and audit trails (sec finding 2). |
| D5 | **Token onboarding v1 = paste token** with server-side validation + automatic long-lived exchange (when same-app secret available); **v2 = full OAuth popup flow** | `ads_management` advanced access requires Meta App Review (business process). Spec ships value before review completes. |
| D6 | **One shared BullMQ worker (`socialJobsWorker`)** runs scheduled publishing (fixing existing gap A), ads monitoring, and optimization. **Job payloads carry opaque ids only — never decrypted tokens** (§3.2). | Build the missing runner once; keep Redis free of secrets (sec finding 1 — CRITICAL). |
| D7 | Every mutating ads action writes an immutable **`social_ads_action_log`** row, **sanitized before insert** (§12.3), with `traceId` | Ads spend real money; immutability without sanitization would make a leaked token permanent (sec finding 3 — CRITICAL). |
| D8 | **Money is typed, never bare numbers**: `{ currency: ISO-4217, amountMinor: integer }` end-to-end. Meta budget/spend fields are integer minor units (satang/cents); per-currency minimums come from the Graph `minimum_budgets` endpoint (cached), never hardcoded. All date windows/caps computed in the **ad account's `timezone_name`**, captured at connect time. | Arch findings 3 & 4 — silent money-losing bugs otherwise, invisible on small test accounts. |
| D9 | **Provider seam from day one:** routers/UI depend on an `AdsProvider` interface (accounts/campaigns/adsets/ads/insights/mutations/issues); `MetaAdsProvider` (wrapping `adsGraphClient`) is the only v1 implementation. Google/TikTok ads plug in later without router/UI rewrites. | Arch finding 13; matches the existing `providerRegistry` philosophy in the social suite. |
| D10 | **Automation safety hierarchy:** global kill switch (tenant admin) → per-user `automation_halted` → guard rules → optimizer rules. Guard beats optimizer; per-entity Redis lock serializes ALL mutations to one entity; cooldowns live in a ledger independent of rule rows. | Arch findings 5, 6, 24; sec findings 6, 7, 16. |

### Existing systems reused (integration points)

| System | Location | Role |
|--------|----------|------|
| Encryption | `apps/web/server/services/crypto.ts` (AES-256-GCM, `LLM_ENCRYPTION_KEY` → SHA-256) | Encrypt all tokens/secrets: `encrypt()` on write, `decrypt()` service-internal only |
| Per-user secret CRUD template | `userLlmApiKeys` table (`drizzle/schema.ts:17728`), `userApiKeyService.ts`, `routers/userApiKeys.ts`, `components/settings/UserLlmKeysPanel.tsx` | Clone table/service/router/panel shape: `configured: true` + `keyHint`, never return ciphertext or plaintext |
| Audit sanitizer | `services/auditLogger.ts` `sanitizePayload()` | Extend (key-based today) with URL-embedded-token regex (§12.3), reuse for action log |
| Social tables & gating | `socialPages`, `socialProviderConnections` (`schema.ts:18012-18092`), `META_CHANNELS_ENABLED` tenant flag | Page linkage for boosted posts; same feature-flag gate pattern |
| Dashboard social sidebar | `apps/web/client/src/pages/Dashboard.tsx:533-568` (`socialSidebarItems`) | Add `social-ads` item; labels via `dashboard:socialMenu.*` i18n |
| Global menu (shared) | `packages/shared/src/constants/menu.ts:61-65` (Social group, sortOrder 7.0–7.4) | Add entry at 7.5 with inline `labelTh` |
| Routes | `apps/web/client/src/App.tsx:649-653` | Add `/social/ads` under `RequireAuth` |
| Settings UI | `pages/Settings.tsx` tab system (`:98,:102,:1053`), integrations tab `:2521-2537` | Add `SocialAdsConnectionPanel` |
| Rate limiting | `createRateLimitMiddleware` (used in `routers/userApiKeys.ts:22-28`) | Credential mutations, campaign mutations, AND read endpoints (§12.7) |
| Credit service | `services/creditService.ts` (`deductCredits`:400) | Platform credit per mutation, deducted **after** confirmed Graph success, idempotent by action_log id (§6.6) |
| Approval queue | `socialHumanApprovals` (`schema.ts:18357`) + Automation UI | `approve_first` mode — with **stricter authority rules** than chat automation (§10.3) |
| Queue infra | BullMQ + IORedis (existing project stack) | `socialJobsWorker` queues; `removeOnComplete/removeOnFail` mandatory |

---

## 2. Current-State Audit: Social Suite Production Readiness

Answering: *"ตรวจสอบว่าหัวข้อ social ที่ทำไว้แล้วทั้งหมดทำงานประสานกันสมบูรณ์ ใช้งานจริงได้แล้วหรือยัง"*

### Architecture reality

The Social suite is a **TypeScript orchestration layer over the Python backend**. All real Meta Graph calls (OAuth exchange, publish, webhook ingestion) happen in `python-backend` via `/api/oauth/meta/*` and `/api/internal/social/*`. TS owns the DB tables, tRPC routers, UI, and access control. Only Meta (Facebook Pages/Messenger) is implemented; TikTok/YouTube are stubs (`services/social/providers/tiktok.ts:10`, `youtube.ts:10`).

### Per-module status

| Module | Backend | UI | Works end-to-end today? |
|--------|---------|----|--------------------------|
| Social Channels | `routers/metaChannels.ts` (OAuth proxy to Python) | `SocialChannels.tsx` | ✅ Yes, if Python backend is running (tokens stored encrypted by Python callback) |
| Social Inbox | `routers/socialInbox.ts`, `socialInboxService.ts` | `SocialInbox.tsx` | ⚠️ Outbound reply works; inbound depends entirely on Python webhook ingestion filling `socialConversations`/`socialMessages` |
| Social Publishing | `routers/socialPublishing.ts`, `socialPublishingService.ts` | `SocialPublishing.tsx` | ⚠️ **`publishNow` works; `schedulePost` is a dead end** (see Gap A) |
| Social Moderation | `routers/socialModeration.ts`, `socialModerationService.ts` | `SocialModeration.tsx` | ⚠️ Reply/hide/delete actions work; comment list depends on Python ingestion of `socialComments` |
| Social Automation | `routers/socialAutomation.ts`, `socialAutomationService.ts` | `SocialAutomation.tsx` | ❌ **Rules can be created but never fire** (see Gap B); only the human-approval queue path executes |

### Confirmed gaps (with evidence)

| # | Gap | Evidence | Fixed by |
|---|-----|----------|----------|
| **A** | **Scheduled posts never publish.** `schedulePublishingPost` only sets `status='scheduled'` + `scheduledAt` (`socialPublishingService.ts:784-792`); repo-wide, no worker/cron/route consumes `socialPosts` by `scheduledAt`. Index `idx_social_posts_page_scheduled` (`schema.ts:18256`) anticipates a sweeper that was never built. | Feature 00 |
| **B** | **`matchAutomationRules` is dead code** — called only from its own test (`socialAutomationService.test.ts:355,383`), never from any production path. | Feature 00 + 06 |
| **C** | Automation triggers (keyword/auto-send/timeout) have no TS trigger point; depend on B and on Python webhook events. | Feature 06 |
| **D** | TikTok/YouTube provider stubs. | Out of scope (documented) |
| **E** | Inbox/Moderation lists are empty unless Python webhook ingestion is live — no health indicator tells the user why. | Feature 06 (health panel) |
| **F** | Internal gateway calls proceed with a warning when the internal auth token is unset (`metaChannels.ts:56-57`). | Feature 06 (fail closed) |
| **G** | Two parallel publish/reply implementations (tRPC path vs `internalSocialActions` facade) — duplication risk. | Feature 02 consolidates ads on one client |
| **H** | No ads-related code exists anywhere. **Also (v1.1): no server-side HTTP resilience helper exists** — the planned `fetchWithResilience.ts` was never committed to any branch. | Features 01–05 (greenfield); §5.2 builds resilience |
| **I** | `approveAutomationAction` is scoped only by tenantId — **any tenant member can approve any automation action** (`socialAutomation.ts`, confirmed in review). Acceptable-ish for chat replies; NOT acceptable for money-spending ads actions. | §10.3 (stricter authority for ads approvals) |

**Bottom line:** Immediate publish, comment actions, and inbox replies work when the Python backend is up. **Scheduling and automation — the two things needed for "schedule autopost" and "automatic ads management" — do not execute today.** Feature 00 is therefore a prerequisite, not an optional cleanup.

---

## 3. Feature 00: Social Jobs Worker (Prerequisite)

### 3.1 Problem

Gaps A + B: no background runner exists for time-based social work.

### 3.2 Requirements

1. New worker registered alongside existing workers (`apps/web/server/workers/`): **`socialJobsWorker.ts`** using BullMQ on the existing Redis connection. Queues:
   - `social:scheduled-posts` — repeatable sweep (every 60s): `SELECT ... FROM social_posts WHERE status='scheduled' AND scheduled_at <= now() LIMIT 20 FOR UPDATE SKIP LOCKED` → for each, call the existing `publishPublishingPostNow` path → transition `scheduled → published | failed` with error message persisted. Idempotency: post id is the BullMQ job id; a post is claimed by atomically setting `status='publishing'` before the gateway call.
   - `social:automation-rules` — invoked by inbound-event hook (Feature 06) and a periodic timeout sweep, calling the existing `matchAutomationRules` (`socialAutomationService.ts:1078`) so rules actually fire.
   - `social:ads-monitor` and `social:ads-optimize` — registered here, consumed by Features 04/05.
2. **Job payload hygiene (CRITICAL — sec finding 1):** job `data` carries **opaque references only** (`connectionId`, `userId`, `adAccountId`, `postId`, `ruleId`) — never decrypted tokens, never encrypted blobs. `decrypt()` runs only inside the connection service at the moment of the Graph call, in-process. All queues set `removeOnComplete: { count: 100 }` and `removeOnFail: { count: 500 }` so job history cannot accumulate payloads in Redis indefinitely.
3. **Retry policy split by side-effect class (arch finding 1):**
   - *Idempotent work* (sweeps, reads, status polls): max 3 attempts, exponential backoff.
   - *Mutating work* (publish, any Graph POST): **NO automatic retry.** On failure the job records the error and stops; recovery is by reconciliation (§5.2.4) or explicit user action. A publish timeout marks the post `unknown` and the next sweep verifies against the platform (was the post created?) before any re-attempt.
4. **Per-connection repeatable job lifecycle (arch finding 25):** monitor/optimize repeatable jobs are registered when a connection becomes `active`, deregistered on `disconnect`/`expired`/`revoked`/kill-switch, and staggered with a deterministic offset `hash(connectionId) % intervalSeconds` to prevent thundering-herd at :00/:15/:30/:45.
5. Worker lifecycle follows existing worker patterns (graceful shutdown, structured logs, per-job traceId).
6. Ops note: runs inside `smartspec-web.service` process like existing workers. No ffmpeg-style memory risk (network I/O only).

### 3.3 Acceptance

- A post scheduled 10 minutes ahead publishes automatically within 90s of `scheduledAt` with no human action (verified against a real test Page).
- Kill/restart of `smartspec-web.service` mid-window does not double-publish (idempotency proven by test).
- Redis inspection during a monitor run shows zero token-shaped strings in any job payload or job history (automated test greps `EAA` prefix + `access_token`).

---

## 4. Feature 01: Per-User Encrypted Ads Credentials + Settings UI

### 4.1 Storage model — `social_ads_connections` (new table)

One row per user **per tenant** per provider (v1: `meta_ads` only). See §11 for DDL. Columns cover the credential types in the Meta ads ecosystem:

| Credential | Column | Notes |
|------------|--------|-------|
| User access token (short- or long-lived) | `encrypted_access_token` | Pasted by user; server exchanges short→long-lived **only when the user's own app id+secret minted the token** (D3); otherwise stored as-is with real expiry shown |
| Token expiry | `token_expires_at` | From `debug_token`; drives UI expiry warnings + refresh prompts |
| Meta App ID | `app_id` (plaintext varchar — not secret) | Per-user; nullable → falls back to tenant default |
| Meta App Secret | `encrypted_app_secret` | Per-user; nullable → falls back to tenant default in `system_settings`. **Exchange/proof only applied when `app_id` matches the token's owning app** (validated via `debug_token.app_id`) |
| Selected ad accounts | `ad_accounts` json | `[{id:"act_...", name, currency, timezone_name, account_status}]` cached from `me/adaccounts` at connect; **replaced wholesale on every refresh, never appended** (sec finding 14). `timezone_name` + `currency` are load-bearing (D8) |
| Default ad account | `default_ad_account_id` | Scoped to this (user, tenant) row only — no cross-tenant fallback |
| Granted scopes | `granted_scopes` json | From `me/permissions`, revalidated on save; onboarding instructions request only scopes the v1 method list actually uses |
| Health | `status` (`active|expired|invalid|revoked|disabled`), `last_verified_at`, `last_error` | `disabled` = admin force-disable (§10.2) |

**Removed from v1 (arch finding 29):** `encrypted_system_user_token` — a column without an acquisition flow is dead schema. System User token support moves to the v2 roadmap alongside OAuth; the table gains the column in that migration.

**Hard rules (inherited from `userApiKeyService.ts` pattern):**
- `decrypt*` helpers live in `socialAdsConnectionService.ts` and are **INTERNAL ONLY** — never exposed via tRPC/HTTP, never placed in queue payloads.
- tRPC responses contain only `configured: true`, `tokenHint` (last 4 chars), scope list, ad account list, expiry, status.
- Unique index `(user_id, tenant_id, provider)`; all queries filter by `ctx.user.id` **AND resolved tenantId** — ownership can never come from client input; tenant-switch yields a fully separate connection (§12.5).
- Rate-limit credential mutations (10/hour, same middleware as `userApiKeys.ts:22-28`).
- On save: validate token live (`/me`, `/me/permissions`, `/me/adaccounts`, `debug_token`), reject tokens missing `ads_read`, warn if missing `ads_management`, **warn if missing `read_insights` (required for Feature 07 page performance) or `pages_read_engagement`**, capture per-account `timezone_name`/`currency`, then exchange (when same-app) and store. Audit-log the event (key name + hint only, never values). Onboarding instructions (Thai) list the full recommended scope set: `ads_read`, `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`, `read_insights`.
- **Disconnect = hard delete of secrets (sec finding 13):** the `disconnect` mutation NULLs `encrypted_access_token` + `encrypted_app_secret` in the same transaction as the status flip, deregisters repeatable jobs, disables all the user's enabled rules, and (v2, when OAuth lands) calls Meta's deauthorize endpoint. Action-log history is retained (audit rows never cascade-delete).

### 4.2 Token lifecycle (arch findings 9, 11)

- Long-lived user tokens (~60 days) have **no programmatic refresh** — re-auth is a human action. Expiry handling:
  - Notifications at 14 / 7 / 1 days before `token_expires_at` and on first `code 190` — **deduplicated**: one notification per threshold per connection (sec finding 11 applies to all notification paths).
  - On `code 190` mid-job: **fail fast** — mark connection `expired`, abort remaining work in that batch (no partial-batch continuation), deregister repeatable jobs, emit exactly one notification. UI shows a "reconnect" call-to-action that reuses the paste-token flow.
- `verify` mutation re-runs live validation on demand and repairs `status` in both directions (`expired → active` after re-paste).

### 4.3 Tenant-level fallback (admin)

`system_settings` keys (all `isSensitive: true`, following `googleClientSecret` handling in `routers/systemSettings.ts:1248-1314`): `integrations/meta_ads_app_id`, `integrations/meta_ads_app_secret`. Admin Settings UI gets masked fields. Used only when a user has no personal app id/secret **and** the tenant app actually minted the user's token (D3 constraint).

### 4.4 Settings UI — `SocialAdsConnectionPanel.tsx`

Clone `UserLlmKeysPanel.tsx` structure into `client/src/components/settings/`, rendered in the **integrations** tab of `Settings.tsx` (`:2521-2537`). Panel contents:

1. **Connection card** — status badge (active/expired/invalid/disabled + expiry countdown), token paste field with "Validate & Save", app id + app secret fields (secret masked, `...hint` badge when configured), disconnect button with confirm dialog explaining secrets are deleted.
2. **Ad accounts card** — after connect: list of accessible ad accounts (checkboxes for enabled ones, radio for default, currency + timezone shown per account), "Refresh accounts" button.
3. **Scope card** — granted permissions as chips; missing recommended scopes highlighted with re-generate instructions (Thai copy).
4. Empty/loading/error states per existing panel conventions.

**Client-side token hygiene (sec findings 9, 17):**
- Token input: `type="password"`, `autoComplete="off"`, non-credential-looking `name` (e.g. `metaAdsTokenInput`), not inside a native submitting `<form>`; component state cleared immediately after successful submit.
- The `saveToken` mutation's variables must be excluded from any error-reporting breadcrumbs and from any query-cache persistence; React Query Devtools confirmed disabled in production builds. No token ever touches localStorage, sessionStorage, or the URL.

### 4.5 tRPC router — `socialAdsConnection`

`getStatus` (query), `saveToken` (mutation, rate-limited), `saveAppCredentials` (mutation, rate-limited), `refreshAdAccounts` (mutation), `disconnect` (mutation), `verify` (mutation). Registered in `routers.ts` (three-spot registration per existing convention).

### 4.6 Migration away from file tokens

Delete `.fb_token` usage entirely; rollout checklist includes removing the file. `.gitignore` entry stays as a guard.

---

## 5. Feature 02: Social Ads Management Module

### 5.1 Menu & routing

1. `packages/shared/src/constants/menu.ts` — add to Social group: `{ id: 'social-ads', label: 'Social Ads Management', labelTh: 'จัดการโฆษณาโซเชียล', icon: 'Megaphone' (verify in useMenuItems iconMap), path: '/social/ads', platforms: ['web','desktop'], group: 'main', sortOrder: 7.5, requiresFeature: 'META_CHANNELS_ENABLED' }`.
2. `Dashboard.tsx` `socialSidebarItems` (`:533-568`) — add matching item with `dashboard:socialMenu.socialAds` i18n key (add to both `locales/th/dashboard.json` and `locales/en/dashboard.json`).
3. `App.tsx` — lazy route `/social/ads` → `pages/SocialAds.tsx` under `RequireAuth`.
4. Server-side gate: `META_CHANNELS_ENABLED` tenant-flag assertion (as `socialPublishing.ts:31-37`) **plus a new dedicated flag `SOCIAL_ADS_ENABLED`** (defaults to the value of `META_CHANNELS_ENABLED`) so ads can be disabled independently as a rollback lever (§16). Additionally every procedure requires an `active` `social_ads_connections` row for `ctx.user.id` (clear `PRECONDITION_FAILED` error with Thai message directing to Settings when absent).

### 5.2 Graph client — `services/social/adsGraphClient.ts` (behind the `AdsProvider` seam, D9)

1. **Interface first:** routers and jobs call `AdsProvider` (TypeScript interface: `getAdAccounts/getCampaigns/getAdSets/getAds/getInsights/getIssues/createCampaign/.../mutateStatus/uploadCreative/searchTargeting/getPreviews`). `MetaAdsProvider` wraps `adsGraphClient`; the provider registry keys on `social_ads_connections.provider`.
2. **Own resilience layer (arch findings 1, 2 — replaces the phantom `fetchWithResilience`):**
   - Base `https://graph.facebook.com/v21.0`, version in one constant.
   - **Transport:** token in `Authorization: Bearer` header ONLY (sec finding 2). If any endpoint forces the query-param form, the wrapper strips `access_token=[^&]+` from every URL before it can reach a logger, error object, or thrown message.
   - **Retry matrix:** GET/read → retry on network error, timeout, HTTP 5xx, Graph codes 4/17/32/613 (throttle) with exponential backoff + jitter, max 3. **POST/mutation → never auto-retried.** Code 190 → mark connection expired, no retry (§4.2).
   - **Reconciliation for mutation timeouts (arch finding 1):** before any manual/systemic re-attempt of a create, the client queries for a matching object (by name + creation window) and/or consults the action log intent row (§5.2.4); duplicate-create is treated as a bug-class incident, not a retry inconvenience.
   - Parse `X-Business-Use-Case-Usage` / `X-App-Usage` headers into a **Redis token-bucket per ad account + per app** (arch finding 8): when usage > 80%, reads defer to cache; when > 95%, non-critical jobs skip a cycle. This governor is shared across all users of a tenant-level app (sec finding 20).
3. **Pagination (arch finding 10):** every list method follows `paging.next` cursors to exhaustion with a hard bound (default 2,000 objects/call-site, logged when truncated — no silent caps).
4. **Action-intent logging:** every mutation writes an `intent` row to `social_ads_action_log` (status `pending`) before the Graph call and finalizes it (`ok|error|unknown`) after — this is both the audit trail (D7) and the idempotency/reconciliation anchor (sec finding 5): a new identical mutation within the dedupe window `(actor, action, target_id)` requires the previous row to be terminal.
5. **Async insights (arch finding 8):** account-level or wide-date-range insights use `?async=true` → `report_run_id` polling via the jobs worker; synchronous insights only for narrow single-entity windows.
6. **Batch API:** the monitor job fans out entity-status reads via Graph Batch (≤50 sub-requests/call).
7. **Caching:** Redis-backed (not in-memory — arch finding 8), keyed `(connectionId, endpoint, paramsHash)`, TTL 60s, **invalidated on any mutation touching the same entity** (arch finding 27).
8. Every call emits `ads_request`/`ads_response` audit events with traceId, endpoint (token-stripped URL), latency, usage headers — payloads truncated to 8KB and run through the sanitizer (§12.3).
9. **Version policy (arch finding 14):** Graph version pinned in one constant; a startup check logs WARN when the pinned version is within 6 months of Meta's published sunset; upgrade runbook documented in this spec folder (`runbooks/graph-version-upgrade.md`).

### 5.3 Money & time correctness (D8 — arch findings 3, 4)

- Shared `Money` type `{ currency, amountMinor }`; UI renders via a single formatter; all Graph budget/spend fields parsed as integer minor units.
- Per-currency minimum budgets fetched from the account's `minimum_budgets` edge at connect/refresh, cached on the connection row; validation uses these values, never hardcoded numbers.
- All insights presets (`today`, `last_7d`, …), spend baselines, and daily caps computed in the ad account's `timezone_name`. A helper owns this conversion; direct `new Date()` day-bucketing in ads code is a lint-flagged error.

### 5.4 Read layer & UI — `pages/SocialAds.tsx`

Tab layout consistent with existing social pages (`SocialPageShell` pattern):

1. **Overview** — per selected ad account: spend today/7d/30d (account timezone), active campaign count, ads-with-issues count (red badge), account status banner (disabled/risk states from `account_status` + `disable_reason`).
2. **Campaigns** — table: name, objective, effective_status, daily/lifetime budget, spend, results (per objective), CPA/CPM/CTR; row actions: pause/resume, edit budget, drill-down to ad sets → ads; status chips must distinguish configured `status` vs `effective_status` (the live test showed ACTIVE campaigns whose ads are `WITH_ISSUES`). Account switcher in the page header (multiple enabled accounts).
3. **Issues** — flat list of every ad whose `effective_status ∈ {WITH_ISSUES, DISAPPROVED}` with `issues_info` detail, review feedback, one-click pause/appeal-link.
4. **Insights** — charts (existing chart stack) for spend/impressions/clicks/conversions over time, breakdowns (age/gender/placement/platform). Conversion metrics for the trailing 28 days labeled **provisional** (attribution restatement — arch finding 22).
5. **Automation** — Feature 04/05 rules UI + kill-switch state + action history feed.
6. **Pages** *(v1.2)* — per-Page performance monitoring across ALL visible pages + advisor reports (defined in §17/§18).
7. **Advisor** *(v1.2)* — skill-generated analysis & recommendations for pages and ads, report history (§18).

tRPC router `socialAds`: `listAdAccounts`, `getOverview`, `listCampaigns`, `listAdSets`, `listAds`, `getInsights`, `listIssues` (+ mutations in Features 03–05). Reads hit the provider with the Redis cache; **read endpoints get their own per-user rate ceiling** (120/min) independent of Graph throttle (sec finding 20).

### 5.5 Error taxonomy (arch finding 20)

First-class artifact `services/social/adsErrorMap.ts`: Graph `code` + `error_subcode` → `{ severity, retryable, userMessageTh, userMessageEn, remediation }`. Prefer Meta's `error_user_msg` when present; unknown codes fall back to a generic entry and are logged for map expansion. All tRPC errors to the client come from this map — raw Graph errors never pass through.

---

## 6. Feature 03: Campaign Creation & Management

### 6.1 Scope (v1 — dominant Facebook ad flows)

1. **Campaign create wizard** (modal, 4 steps): objective (OUTCOME_* enums), budget mode (CBO daily/lifetime vs ad-set budget), special ad categories declaration, name. Created with `status=PAUSED` **always** — going live is an explicit separate action.
2. **Ad set step:** budget & schedule (start/end, account timezone), optimization goal + billing event (validated combinations per objective), targeting builder: geo (country/region/city search), age range, gender, detailed targeting via `searchTargeting` autocomplete, custom audience picker (existing audiences only), placements (automatic default / manual toggle), attribution setting. **Special-ad-category enforcement (arch finding 21):** when a special category is declared, the builder disables the targeting options Meta forbids (age/gender narrowing, detailed targeting restrictions) client-side AND revalidates server-side; the declaration is recorded in the action log.
3. **Creative step:** two sources — (a) **boost existing Page post** (picker reads Page posts via `socialPages.encryptedPageAccessToken`); (b) **new creative**: image/video from the existing media library. **Creative upload lifecycle (arch finding 30):** assets are uploaded per-ad-account to obtain `image_hash`/`video_id`; hashes cached in `social_ads_creative_assets` (asset id ↔ ad account ↔ hash) for reuse; orphaned uploads are acceptable (Meta garbage-collects unused hashes) but re-upload is avoided via the cache. Primary text, headline, description, CTA enum, destination URL. Ad preview via `getAdPreviews` rendered **only inside a sandboxed iframe (`sandbox="allow-scripts"`), never `dangerouslySetInnerHTML`** (sec finding 10a). The server never fetches user-supplied destination URLs in v1; if a link-preview feature is added later it must use an SSRF-guarded fetcher (block private/link-local/metadata ranges, no redirect-follow to internal hosts) (sec finding 10b).
4. **Wizard draft persistence (arch finding 15):** wizard state autosaves per step to `social_ads_drafts` (server row, `status='draft'`); reopening the wizard offers resume. Drafts older than 30 days are purged.
5. **Lifecycle mutations:** pause/resume/rename any level, budget edit (Money-typed, min-budget validated per currency), end-date edit, duplicate campaign/ad set, delete (soft — Meta archives). **Optimistic concurrency (arch finding 7):** the UI carries the entity's `updated_time` read from Graph; the server re-reads before mutating and returns a conflict warning when drift is detected (user confirms overwrite). Combined with the per-entity lock (§10.4) this covers user-vs-worker races.
6. **Guardrails:**
   - Budget ceiling per action: per-user `social_ads_settings.max_daily_budget` (Money-typed, default 100,000 minor units THB = ฿1,000) — creating/raising beyond it requires typed confirmation and is flagged in the action log. **Tenant admins may set an org-wide cap** that bounds every user's effective ceiling (§10.1).
   - All create mutations are two-phase in UI: review screen with full summary → confirm.
   - Every mutation follows the intent-row protocol (§5.2.4).
7. **Credit integration (arch finding 23):** platform credit deducted via `creditService.deductCredits()` **after** confirmed Graph success, idempotency-keyed by the action_log row id — a failed Graph call charges nothing; a retried confirmation cannot double-charge. Read calls free in v1.

### 6.2 Out of scope v1 (documented for v2)

Advantage+ shopping campaigns, catalog/DPA ads, lead-form creation, custom audience creation/upload, A/B test objects (`ad_studies`), **System User tokens, OAuth onboarding, Pixel/CAPI conversion ingestion, lead-gen webhooks** (the last two get roadmap entries so schema/routes don't foreclose them — arch finding 28).

---

## 7. Feature 04: Ad Monitoring, Issue Detection & Auto-Block

### 7.1 Monitor job (`social:ads-monitor`, every 15 min per active connection; hash-staggered)

1. Fetch all ads `effective_status` + `issues_info` + account `account_status`/`disable_reason` for enabled ad accounts, via Graph **Batch API**.
2. **State model (arch finding 12):** table `social_ads_entity_state` holds the current known state per entity (the diff baseline); `social_ads_monitor_snapshots` records transitions only. First run after connect/deploy seeds `entity_state` without emitting change events. Transitions that occur and resolve entirely within one polling gap are accepted as invisible (documented limitation; 15-min interval configurable per tenant).
3. **Detections** (all date math in account timezone, D8):
   - Ad/adset/campaign entered `WITH_ISSUES` or `DISAPPROVED` (with `issues_info` reason)
   - Ad account disabled / spend limit hit / payment failure (`account_status != 1`, `disable_reason`)
   - Token expiring < 14/7/1 days or invalid (code 190) — §4.2 flow
   - Spend anomaly: today's spend (account tz) > configurable multiplier (default 2×) of trailing 7-day average, or > absolute daily cap
   - Delivery = 0 for an ACTIVE ad for > N hours (learning-phase aware)
4. **Auto-block actions (rule-driven, per-user opt-in in Automation tab):**
   - `auto_pause_disapproved`: pause ads entering DISAPPROVED (default ON)
   - `auto_pause_overspend`: pause campaign when daily cap exceeded (default ON, cap required)
   - `auto_pause_zero_delivery`: pause after N hours zero delivery (default OFF)
   - **Hysteresis & resume ownership (arch finding 24):** guard actions have their own cooldown in the cooldown ledger (§11) — an entity auto-paused by a guard is NOT auto-resumed; resume is manual (one click from the feed) or by an explicit user-configured "resume next day" option per rule. A guard cannot re-fire on the same entity within its cooldown.
   - Every auto action → intent-row protocol + notification (deduplicated per entity per window — sec finding 11) + Automation tab feed; every auto action reversible in one click.
5. **Human approval mode:** each guard rule can be set to `approve_first` — action lands in `socialHumanApprovals` **with ads-specific approval authority** (§10.3).

### 7.2 Acceptance

- With a deliberately policy-violating ad on a **sandbox account** (§15), the DISAPPROVED state is detected within one poll cycle, the ad is paused, an intent-row + notification exist, and the Issues tab shows the `issues_info` reason.

---

## 8. Feature 05: Ads Optimization Engine

Rule-based v1 (LLM-assisted suggestions v2 — noted, not built):

1. **Rule model (`social_ads_automation_rules`)**: scope (account/campaign/adset), metric (`cpa|cpm|ctr|frequency|roas|spend`), window (`last_1d|last_3d|last_7d`), operator + threshold, action (`pause|notify|budget_increase_pct|budget_decrease_pct|reallocate_to_best`), action params (Money-typed min/max budget bounds mandatory for budget actions), cooldown hours (default 24), `approve_first` flag, enabled flag, `dry_run` flag (default true). Mirrors Meta's native Automated Rules semantics.
2. **`action_params` validation (sec finding 15):** per-action **discriminated-union Zod schema with `.strict()`** applied at write time AND re-applied at execution time — a stored blob that fails re-validation disables the rule and notifies, never executes.
3. **Executor** (`social:ads-optimize`, hourly): evaluate enabled rules against `getInsights` for their window; conversion-dependent metrics in the restatement window are treated as provisional — optimizer only acts on windows ≥ 3 days old for conversion metrics (arch finding 22). Respect cooldown ledger; execute or enqueue approval; intent-row protocol throughout.
4. **Execution-time re-validation (sec finding 6):** immediately before the Graph mutation, the executor re-reads the rule row + `social_ads_settings` + tenant cap inside a transaction (`SELECT ... FOR UPDATE`) and re-checks bounds — an edit landing between evaluation and execution wins.
5. **Cooldown ledger (sec finding 7):** last-fired state lives in `social_ads_cooldowns` keyed `(user_id, ad_account_id, target_id, action)` — independent of rule rows, so delete+recreate cannot reset cooldowns.
6. **Rule interaction (arch finding 5, D10):** guard > optimizer. All mutations to an entity acquire a per-entity Redis lock (`social-ads-lock:{entityId}`, TTL 60s); the optimizer skips (and logs) entities currently locked or acted on by a guard within the guard's cooldown.
7. **Budget reallocation** (`reallocate_to_best`): within a campaign, shift X% budget from ad sets below threshold to the best performer, bounded by Money-typed min/max — never exceeding the rule's campaign-level cap, the user's `max_daily_budget`, or the tenant cap.
8. **Dry-run:** default per rule; stores 7 days of "would have done X" evaluations viewable as a report before the user enables live mode.
9. **UI:** Automation tab — rule builder (Thai-first labels), rule list with last-fired/last-result, dry-run report view, action history feed from `social_ads_action_log`.

---

## 9. Feature 06: Social Suite Integration & Gap Closure

1. **Wire automation rule matching (Gap B/C):** hook in the inbound ingestion touchpoint (`routes/internalSocialActions.ts`) — enqueue `social:automation-rules` evaluation per inbound message/comment so `matchAutomationRules` finally executes in production. Timeout-based triggers run on the periodic sweep.
2. **Cross-module linkage:**
   - Publishing → Ads: "Boost this post" button on published posts (opens Feature 03 wizard pre-filled).
   - Moderation → Ads: comments on ad posts appear in Moderation with an "ad" badge; moderating them uses existing comment actions.
   - Inbox → Ads: Messenger conversations from click-to-Messenger ads tagged with campaign name (needs a small optional Python-side referral pass-through — the single Python change in this spec, deferred if unwanted).
3. **Social health panel (Gap E/F):** status card on `/social/channels`: Python backend reachability, webhook subscription status per page, internal token configured (**fail closed** — upgrade `metaChannels.ts:56-57` warning to a hard error), ads connection status. One place to see why a module shows no data.
4. **Verification sweep of existing modules** (part of rollout, §16): scripted end-to-end checks for publish-now, scheduled publish (new worker), inbox reply, comment hide/reply, automation rule fire — evidence recorded in `specs/feature/031-SocialAdsManagement/verification/`.

---

## 10. Governance: Kill Switch, Roles, Approval Authority

*(New section in v1.1 — arch findings 6, 19; sec findings 4, 16.)*

### 10.1 Policy hierarchy

1. **Tenant kill switch** (`system_settings`: `integrations/social_ads_automation_halted`, boolean, tenant-scoped) — halts ALL guard + optimizer mutations tenant-wide instantly. Checked at the top of every job tick and before every automated mutation.
2. **Per-user halt** (`social_ads_settings.automation_halted`) — same, scoped to one user.
3. **Tenant budget cap** (`system_settings`: `integrations/social_ads_org_daily_cap`, Money) — bounds every user's effective `max_daily_budget`; optimizer/guard/manual raises all validate against it.
4. Per-rule `enabled` + `dry_run` (lowest level).

### 10.2 Admin actions

- `forceDisableAdsConnection` (admin-only, separately audited): sets connection `status='disabled'`, disables all that user's enabled rules, deregisters jobs. For credential-compromise / runaway-spend incident response. Does NOT delete the user's secrets (that remains the user's own `disconnect`).
- Admin oversight view: list of users with connections — status, rule counts, last-24h automated-action count, spend visibility **as aggregates only**; never `ad_accounts`/`granted_scopes` JSON bodies, never hints beyond `configured` (sec finding 19).

### 10.3 Approval authority (sec finding 4 — stricter than chat automation)

Confirmed gap: existing `approveAutomationAction` lets **any tenant member** approve. For ads (money-spending) approvals: the approver MUST be the connection owner (`ctx.user.id === connection.userId`) **or** hold `admin`/`domain_admin` role. Enforced in the approval procedure for ads-type approvals; chat-automation approvals keep their existing behavior (out of scope).

### 10.4 Per-entity mutation lock

All ads mutations (user-initiated, guard, optimizer) acquire `social-ads-lock:{entityId}` (Redis, TTL 60s, token-fenced release). Lock contention returns a friendly "another change is in progress" error to users and a skip-and-log to jobs.

---

## 11. Database Schema Changes

New tables (Drizzle, `drizzle/schema.ts`; migration number = current head + 1 — baseline lineage 0212, expected `0213_social_ads.sql`, **verify at implementation**; backup protocol applies):

```
social_ads_connections
  id serial PK
  user_id varchar(36) NOT NULL → users.id (cascade)
  tenant_id varchar(36) NOT NULL
  provider varchar(30) NOT NULL DEFAULT 'meta_ads'
  encrypted_access_token text            -- NULLed on disconnect (hard delete)
  app_id varchar(50)
  encrypted_app_secret text              -- NULLed on disconnect
  token_app_id varchar(50)               -- app that minted the token (from debug_token) — exchange/proof gate
  token_hint varchar(8)
  token_expires_at timestamp
  granted_scopes json
  ad_accounts json                       -- replaced wholesale on refresh; includes currency + timezone_name + minimum_budgets
  default_ad_account_id varchar(30)
  status varchar(20) NOT NULL DEFAULT 'active'   -- active|expired|invalid|revoked|disabled
  last_verified_at timestamp
  last_error text
  created_at / updated_at
  UNIQUE (user_id, tenant_id, provider); INDEX (user_id); INDEX (tenant_id, status)

social_ads_settings                      -- per-user guardrails (per tenant)
  id, user_id, tenant_id,
  max_daily_budget_minor bigint, currency varchar(3),
  automation_halted boolean DEFAULT false,
  notification_prefs json, created_at/updated_at
  UNIQUE (user_id, tenant_id)

social_ads_automation_rules              -- Feature 04 guards + Feature 05 optimizer
  id, user_id, tenant_id, ad_account_id, rule_type varchar(30),  -- guard|optimize
  scope json, metric varchar(20), window varchar(10), operator varchar(4),
  threshold numeric, action varchar(30), action_params json,     -- Zod strict discriminated union, validated write+execute
  cooldown_hours int DEFAULT 24, approve_first boolean DEFAULT false,
  enabled boolean DEFAULT false, dry_run boolean DEFAULT true,
  created_at/updated_at
  INDEX (user_id, tenant_id, enabled); INDEX (ad_account_id, enabled)
  -- NOTE: no last_fired_at here — cooldowns live in the ledger below

social_ads_cooldowns                     -- rule-independent cooldown ledger (sec finding 7)
  id, user_id, tenant_id, ad_account_id, target_id varchar(40), action varchar(30),
  last_fired_at timestamp NOT NULL
  UNIQUE (user_id, ad_account_id, target_id, action); INDEX (last_fired_at)

social_ads_action_log                    -- immutable; sanitized BEFORE insert (§12.3)
  id, user_id, tenant_id, ad_account_id, actor varchar(40),  -- user:<id>|system:guard|system:optimizer
  action varchar(40), target_level varchar(10), target_id varchar(40),
  intent_status varchar(10) NOT NULL,    -- pending|ok|error|unknown  (idempotency/reconciliation anchor)
  request_payload json, graph_response json,   -- both sanitizer-passed, 8KB-truncated
  error_message text, trace_id varchar(64), created_at, finalized_at
  INDEX (user_id, tenant_id, created_at); INDEX (target_id); INDEX (trace_id)
  -- retention: 2 years, then archived (§14); NEVER cascade-deleted on disconnect

social_ads_entity_state                  -- current-state baseline for delta detection (arch finding 12)
  id, connection_id FK, ad_account_id, entity_level varchar(10), entity_id varchar(40),
  effective_status varchar(30), issues_info json, updated_at
  UNIQUE (connection_id, entity_id); INDEX (ad_account_id)

social_ads_monitor_snapshots             -- transitions only
  id, connection_id FK, ad_account_id, entity_level varchar(10), entity_id varchar(40),
  from_status varchar(30), to_status varchar(30), issues_info json, detected_at
  INDEX (connection_id, detected_at); INDEX (entity_id)
  -- retention: 90 days, purged by scheduled job (§14)

social_ads_drafts                        -- wizard autosave (arch finding 15)
  id, user_id, tenant_id, ad_account_id, wizard_state json, step int,
  created_at/updated_at
  INDEX (user_id, tenant_id, updated_at)  -- purge > 30 days

social_ads_creative_assets               -- media asset ↔ ad-account image_hash/video_id cache (arch finding 30)
  id, user_id, tenant_id, ad_account_id, media_asset_ref varchar(255),
  meta_image_hash varchar(64), meta_video_id varchar(40), created_at
  UNIQUE (ad_account_id, media_asset_ref)

social_page_insight_snapshots            -- v1.2, Feature 07: daily page metrics
  id, connection_id FK, page_id varchar(40), snapshot_date date,
  metrics json,                          -- {fans, fan_adds, fan_removes, impressions_unique, post_engagements, page_views, video_views, ...}
  post_metrics json,                     -- recent-post rollup [{postId, createdTime, type, reach, reactions, comments, shares, clicks, videoAvgWatch}]
  created_at
  UNIQUE (page_id, snapshot_date); INDEX (connection_id, snapshot_date)
  -- retention: 13 months (year-over-year comparisons), purged by scheduled job

social_advisor_reports                   -- v1.2, Feature 08: skill-generated analysis reports
  id, user_id, tenant_id,
  subject_type varchar(20),              -- page | ad_account | campaign
  subject_id varchar(40),
  skill_name varchar(80),                -- social-page-advisor | social-ads-advisor
  facts_snapshot json,                   -- exact facts JSON given to the skill (reproducibility; metrics only, never tokens)
  report json,                           -- structured skill output (schema §18.4)
  model_used varchar(80), credits_charged numeric, trace_id varchar(64),
  created_at
  INDEX (user_id, tenant_id, subject_type, subject_id, created_at)
  -- retention: 1 year
```

Migration protocol: all-new tables (Low risk / ADD only) → row-count baseline of neighbors + standard `pnpm db:push` + journal update, per Database Safety Protocol.

---

## 12. Security Requirements

1. **No plaintext secrets anywhere:** DB columns only via `encrypt()`; no file storage (`.fb_token` removed); no secrets in logs, audit events, tRPC responses, error messages, or LLM prompts (skills/agents get `configured: true` only). Mask to last-4 hint max.
2. **Token transport & Redis hygiene (CRITICAL):** tokens travel ONLY in `Authorization: Bearer` headers to graph.facebook.com (§5.2.2); BullMQ payloads carry opaque ids only, decrypt at execution point, `removeOnComplete/removeOnFail` set (§3.2). Automated test asserts no token-shaped string in Redis during a full monitor cycle.
3. **Action-log sanitizer (CRITICAL):** every insert into `social_ads_action_log` (and every `ads_request/ads_response` audit event) passes through the existing `sanitizePayload()` **extended with a URL-token regex** (`access_token=[^&]+` and `EAA[A-Za-z0-9]+` shaped substrings inside string values — the current sanitizer is key-name-based only, confirmed in `auditLogger.ts`). Unit test asserts no token survives any error-shape fixture. Payloads truncated to 8KB before persist.
4. **`appsecret_proof`** whenever a matching-app secret is available (D3/D4).
5. **Ownership + tenant isolation:** every query across ALL `social_ads_*` tables filters by `ctx.user.id` AND resolved tenantId; ad account ids validated against the user's own connection cache before use in any Graph path; tenant-switch yields a fully separate connection with no cross-tenant fallback of `default_ad_account_id` or cached lists (test required).
6. **Approval authority:** ads approvals restricted to connection owner or admin/domain_admin (§10.3) — do not inherit the any-tenant-member pattern.
7. **Rate limiting:** credential mutations 10/h; campaign mutations 60/h; **read endpoints 120/min per user** (cache-key variation cannot bypass the shared app-level Graph quota); jobs respect the Redis BUC token-bucket governor.
8. **Admin visibility without secret access:** aggregates only; never tokens, never `ad_accounts`/`granted_scopes` bodies (§10.2).
9. **Fail closed:** missing internal token (Gap F), missing encryption key, invalid connection, or failed `action_params` re-validation → refuse with actionable error, never degrade silently.
10. **Approval-first defaults:** optimizer rules default `dry_run=true`; guard `auto_pause_disapproved` default ON; budget-raising actions can never default ON.
11. **Client-side hygiene:** §4.4 rules (password field, autocomplete off, no form, state cleared, devtools/cache-persistence exclusions, nothing in localStorage/URL).
12. **Preview & URL safety:** ad previews in sandboxed iframes only; any future server-side fetch of user URLs behind an SSRF guard (§6.1.3).
13. **Disconnect = hard delete** of encrypted columns in-transaction; audit history retained; (v2) Meta deauthorize call. Scope minimization: onboarding requests only scopes the implemented methods use; caches replaced, never appended.
14. **Notification abuse:** all detection/notification paths deduplicate per (entity, threshold, window) — unbounded notification volume is treated as a defect.
15. **Webhook/OAuth (v2):** state parameter + PKCE where applicable, redirect URI allowlist, App Review scope minimization.

---

## 13. Review Findings Resolution Matrix (v1.0 → v1.1)

| Source | Findings | Resolution |
|--------|----------|-----------|
| Architecture review HIGH 1–10 | duplicate-spend retry; phantom resilience file; money minor-units; account timezone; rule/entity races; kill switch; concurrent edits; scale (batch/async/Redis cache/governor); cross-app secret mismatch; pagination | §5.2 (own resilience, no mutation retry, intent rows, reconciliation, Batch, async insights, Redis cache+governor, cursor-following); D8/§5.3 (Money + timezone); §10 (kill switch, locks, precedence); §6.1.5 (optimistic concurrency); D3 (`token_app_id` gate) |
| Architecture review MEDIUM 11–26 | token expiry mid-job; snapshot baseline; provider seam; version policy; wizard drafts; observability; testing; retention; org roles; error taxonomy; special-ad-category; attribution restatement; credit ordering; pause thrash; job lifecycle; rollback | §4.2; §7.1.2 (`entity_state`); D9; §5.2.9; §6.1.4 + `social_ads_drafts`; §14; §15; §11 retention notes + §14; §10.1; §5.5; §6.1.2; §5.4.4 + §8.3; §6.1.7; §7.1.4 hysteresis; §3.2.4; §16 rollback column |
| Architecture review LOW 27–30 | cache invalidation; CAPI/leadgen roadmap; dead System-User column; creative upload lifecycle | §5.2.7; §6.2 roadmap; column removed from v1 (§4.1); §6.1.3 + `social_ads_creative_assets` |
| Security CRITICAL 1–3 | tokens in Redis; token in URL; unsanitized immutable log | §3.2 (D6), §5.2.2 (D4), §12.2–12.3 with tests |
| Security HIGH 4–10 | approval authority; idempotency; rule-edit race; cooldown bypass; tenant isolation; client mutation-cache exposure; preview XSS/SSRF | §10.3; §5.2.4 intent rows; §8.4; §8.5 + `social_ads_cooldowns`; §12.5; §4.4 + §12.11; §6.1.3 + §12.12 |
| Security MEDIUM 11–17 | notification flooding; retention; disconnect hard-delete; cache prune/scope minimization; action_params strict re-validation; admin kill-switch; autofill hygiene | §12.14; §11 + §14; §4.1 + §12.13; §4.1 + §12.13; §8.2; §10.2; §4.4 |
| Security LOW 18–20 | sanitizer URL-regex; admin JSON visibility; read rate limits | §12.3; §10.2 + §12.8; §12.7 |

---

## 14. Observability & Operations

*(New in v1.1 — arch finding 16.)*

1. **Metrics** (existing metrics/logging stack; counters + gauges): job success/fail per queue, Graph error rate by code, BUC/App usage % gauge per ad account, monitor lag (scheduled vs actual tick), guard-action count, optimizer-action count, notification count.
2. **Alerts:** job failure rate > 20% over 30 min; any `intent_status='unknown'` row older than 15 min (possible duplicate-spend situation — page a human); BUC usage > 95% sustained; guard actions > configurable N/hour for one user (runaway detection); token-expiry backlog.
3. **Retention jobs** (in `socialJobsWorker`): purge `monitor_snapshots` > 90 days, `drafts` > 30 days; archive `action_log` > 2 years (export to file storage, then delete rows).
4. **Runbooks** in `specs/feature/031-SocialAdsManagement/runbooks/`: graph-version-upgrade, token-compromise response (kill switch → forceDisable → user re-auth), unknown-intent reconciliation.

---

## 15. Testing Strategy

*(New in v1.1 — arch finding 17.)*

1. **Unit:** Zod schemas (action_params unions, wizard payloads), Money math (minor units, currency minimums, timezone bucketing), sanitizer (token-shaped fixtures), cooldown ledger, error map.
2. **Contract tests:** `adsGraphClient` against recorded Graph fixtures (success, each error class, throttle headers, pagination chains, async insights lifecycle) — deterministic, CI-safe, no network.
3. **Integration (Meta sandbox ad accounts):** Meta provides sandbox ad accounts (create via the user's app) — CI-usable for create/pause/budget flows without spending money. Auto-block logic tested by injecting synthetic `entity_state` transitions (mockable monitor path) rather than waiting for a real disapproval; one manual real-account disapproval test at P3 gate.
4. **Redis hygiene test:** full monitor cycle in test env, then scan Redis for `EAA`/`access_token` — must be zero.
5. **Tenant-isolation test:** same user in two tenants — connections, defaults, caches provably separate.
6. **Worker idempotency test:** kill worker mid-publish, restart, assert no duplicate post/campaign.

---

## 16. Rollout Phases, Rollback & Verification

| Phase | Contents | Gate to next | Rollback |
|-------|----------|--------------|----------|
| **P0** | Feature 00 worker + Gap A/B wiring; verification sweep of existing 5 modules | Scheduled test post auto-publishes; automation rule fires on test message; evidence in `verification/` | Pause worker queues (no schema risk) |
| **P1** | Feature 01 credentials + Feature 02 read-only module (menu, page, Overview/Campaigns/Issues/Insights) + error map + observability base | User connects own token via UI only; live campaigns render with correct THB amounts + account-tz dates; typecheck + vitest green; security review of new router | `SOCIAL_ADS_ENABLED=false` hides menu + blocks router; tables remain (additive) |
| **P2** | Feature 03 campaign creation/management + action log + drafts + credit integration | Create → preview → PAUSED campaign on sandbox account via UI; guardrails + idempotency proven; full suite green | Flag off; no automated spend exists yet |
| **P3** | Feature 04 monitoring + auto-block + kill switch + governance | Sandbox disapproval auto-paused within one cycle; kill switch halts everything < 60s; notifications deduplicated | Tenant kill switch, then flag off |
| **P4** | Feature 05 optimizer (dry-run first) + Feature 06 cross-module linkage + health panel | 7-day dry-run report sane on real account; boost-post flow end-to-end | Kill switch; rules default back to dry_run |
| **P5** *(v1.2)* | Feature 07 page-insights collection + Pages tab + Feature 08 advisor skills (`social-page-advisor`, `social-ads-advisor`) + Advisor tab + weekly scheduled reports | 7 days of snapshots collected for all 6 test pages; on-demand advisor report renders structured Thai recommendations grounded in real facts; facts JSON verified token-free; skill edits change advice without deploy | Flag off Advisor UI; stop insight jobs (snapshots additive, harmless) |

**Standing verification per phase:** `pnpm check` (TS), `pnpm test`, targeted vitest for new services, `npm run build:deploy` atomic deploy, manual smoke through https://smartaihub.app, audit-log spot check by traceId.

**Dependencies / open items:**
1. `ads_management` advanced access requires Meta App Review for non-admin users of the app — until approved, feature works for app admins/developers (current user) only; UI must message this state. (Business task, tracked outside code.)
2. Click-to-Messenger attribution tagging needs one optional Python pass-through field (Feature 06.2) — deferred if Python change is unwanted.
3. Icon name (`Megaphone`) verified against `useMenuItems` iconMap at implementation time.
4. Migration number (expected 0213) verified against `drizzle/meta/_journal.json` at implementation time.
5. *(v1.2)* Page Insights metric names must be resolved against the live Graph version at implementation — Meta deprecated a large batch of page metrics in 2024–2025; unknown-metric responses are handled as per-metric nulls (logged), never job failures.
6. *(v1.2)* `read_insights` scope added to onboarding; existing connections without it see a per-feature prompt to re-generate their token (Feature 01 `verify` reports the missing scope).

---

## 17. Feature 07: Page Performance Monitoring — All Visible Pages (v1.2)

### 17.1 Scope

Monitor **every Page the connected user can see** (from `me/accounts` — 6 pages in the live test: Smart AI Hub - Thailand, Master café diary, นายบ้าน น้องมันนี่, นายบ้านแฟมิลี่, Home Has a Story, นายบ้าน พูดอสังหาฯ), regardless of whether the page is being advertised. Uses each page's own Page token (obtained per call from `me/accounts` with the stored user token — Page tokens are NOT persisted separately; they derive from the user token and add no capability worth the extra secret surface).

**Required scopes:** `read_insights` (page/post insights — NEW in onboarding list), `pages_read_engagement`, `pages_show_list` (already granted in the live test except `read_insights`).

### 17.2 Data collection — `social:page-insights` job (daily per connection, hash-staggered)

1. For each visible page: fetch daily metrics from `/{page-id}/insights` — follower total + adds/removes, unique impressions/reach (day/week/28d), post engagements, page views, video views — plus the page's recent posts (≤ 25) with per-post metrics (`post_impressions_unique`, reactions, comments, shares, clicks, video avg watch time) via post insights.
2. Write one `social_page_insight_snapshots` row per page per day (upsert on `(page_id, snapshot_date)`); Meta reports daily page metrics against its own day boundary — store `end_time` as given, no local re-bucketing.
3. **Metric resilience:** requested metric names live in one constant list; a deprecated/unknown metric yields a null for that metric + a WARN log — never a failed job (Meta prunes page metrics aggressively; open item #5).
4. Backfill on first connect: pull up to 90 days of history where the API allows (`since/until` windows), so charts and the advisor skill have context from day one.
5. Batch API + BUC governor + Redis cache rules from §5.2 apply unchanged; job payloads carry `connectionId`/`pageId` only (§3.2).

### 17.3 Facts builder — `services/social/pageFactsBuilder.ts`

Computes the **facts JSON** consumed by the UI and by the advisor skill (§18). **Facts only — no judgments** (skill-first policy, §18.1): metric time series + deltas (7d/28d/90d growth rates), posting cadence (posts/week, gap days), content-type mix (photo/video/reel/link/text share), per-slot engagement histogram (day-of-week × hour, computed from post performance), top-5 / bottom-5 recent posts with their attributes, follower net-change series, page-vs-own-history comparisons (this month vs last). No thresholds, no "good/bad" labels, no advice — those belong to the skill.

### 17.4 UI — **Pages** tab in `/social/ads`

1. **Grid of page cards** (all visible pages): follower count + 28d net-change sparkline, reach trend, engagement rate trend, last-post age, "วิเคราะห์เพจนี้" (advisor) button.
2. **Page drill-down:** charts (followers, reach, engagement, page views, video views over time — dataviz per existing chart stack), post performance table (sortable by reach/engagement), content-mix donut, posting-time heatmap, and the page's advisor report history (§18).
3. Empty/loading states; pages whose token lacks `read_insights` show a reconnect prompt instead of empty charts.

### 17.5 Acceptance

- After 7 days of collection on the 6 live test pages, each page card renders real trends; a page with zero posts in the window renders correctly (no division-by-zero engagement rates — facts builder emits nulls, not fabricated zeros).

---

## 18. Feature 08: Skill-First Analysis & Advisor Skills (v1.2)

### 18.1 Skill-first principle (project policy — MANDATORY)

Per the project's established skill-first policy: **TypeScript computes facts; `skill.md` owns ALL intelligence.** Concretely:

- Facts builders (`pageFactsBuilder.ts`, `adsFactsBuilder.ts`) emit raw computed metrics ONLY — no thresholds, no scoring, no "needs improvement" flags, no advice strings in TS.
- Every judgment — what counts as healthy growth, when frequency indicates ad fatigue, which content mix to recommend, how to prioritize actions — lives in the skill's `skill.md` and is applied by the LLM. Changing the advice logic = editing `skill.md` (auto-synced by `skillRegistry.ts`, 60s cache) — **no code deploy**.
- ⚠️ Implementation caveat from project history: the skill loader reads **lowercase `skill.md`** before `SKILL.md` — author the lowercase file only (a past bug shipped dead advice in an uppercase twin).
- Facts JSON sent to the LLM contains metrics only — **never tokens, account secrets, or PII beyond page/campaign names** (CLAUDE.md AI/LLM secret rules). A unit test asserts the facts builders' output contains no token-shaped strings.

### 18.2 Skill 1 — `apps/web/skills/social-page-advisor/`

- **Frontmatter:** `category: chat_assistant` (llm-only execution), `auto_trigger: false`, Thai-first description.
- **Input** (`schemas/input.schema.json`): the page facts JSON (§17.3) + user goal selector (optional: `grow_followers | increase_reach | increase_engagement | increase_video_views | general_health`).
- **skill.md intelligence** (the LLM's system prompt — authored in Thai, structured):
  - How to read the facts: interpret growth rates in context of page size and posting cadence; treat small-sample weeks with humility; compare page against its own history, not absolute industry numbers.
  - Analysis dimensions: follower growth dynamics (adds vs removes — churn vs stagnation), reach efficiency (reach per post vs follower base), engagement quality (reactions vs comments vs shares weighting), content-mix performance (which formats this page's audience responds to), posting cadence & timing (grounded in the per-slot histogram), video/Reels opportunity, cross-promotion & ads linkage (is organic being amplified?).
  - Recommendation rules: every recommendation must cite the specific fact(s) it derives from; prioritized (สูง/กลาง/ต่ำ) by expected impact × effort; each includes concrete how-to steps (e.g., "โพสต์วิดีโอสั้นเพิ่มเป็น 3 ครั้ง/สัปดาห์ ช่วง 19:00–21:00 ซึ่งเป็นช่วงที่ engagement ของเพจนี้สูงสุด — ดูจาก heatmap ข้อ X") and, where relevant, a measurable target to re-check on the next report.
  - Output format section (skills follow Output Format exactly): the JSON report schema of §18.4.
- **UI schema** (`schemas/ui.schema.json`): goal picker + page selector, Thai labels.

### 18.3 Skill 2 — `apps/web/skills/social-ads-advisor/`

- **Input:** ads facts JSON from `adsFactsBuilder.ts`: per-campaign/adset/ad metrics (spend in Money-typed minor units + display currency, CPM/CPC/CTR/CPA, frequency, results per objective), issues list (`effective_status` + `issues_info`), budget distribution across campaigns, placement/age/gender breakdowns, account status + limits, recent guard/optimizer action history, optimizer dry-run outputs when present, and the linked page's summary facts (organic context).
- **skill.md intelligence** (Thai, structured):
  - Diagnosis: spend efficiency per objective; creative fatigue signals (frequency trend + CTR decay interpretation — judgment, not hardcoded cutoffs); audience saturation; budget concentration risk; objective-fit sanity (e.g., MESSAGES objective but no Messenger response capacity); learning-phase awareness; issues triage (which DISAPPROVED/WITH_ISSUES items to fix first and how).
  - Recommendations: budget reallocation suggestions (bounded by the user's guardrails, stated explicitly), targeting/placement experiments, creative refresh advice grounded in the top/bottom performers, restart-vs-iterate guidance, next-step A/B experiment design; each recommendation cites its facts and carries priority + expected effect + how-to.
  - **Provisional-data humility:** conversion metrics younger than the attribution restatement window must be flagged as provisional in the advice (mirrors §8.3).
- **Advice → action mapping (execution stays outside the skill):** each recommendation MAY carry a machine-readable `suggestedAction` (`{type: 'pause'|'budget_adjust'|'none', targetId, params}`). The UI renders an "นำไปใช้" button ONLY for action types that map to existing Feature 03 mutations — clicking it opens the standard confirm flow with all §6 guardrails, §10 locks, and the intent-row protocol. **The skill never executes anything; the LLM's output is advice, execution is always an explicit user action through the guarded mutation path.**

### 18.4 Report output schema (shared, versioned `reportSchemaVersion: 1`)

```json
{
  "summary": "ภาพรวมสุขภาพ 2-3 ประโยค",
  "healthAssessment": { "overall": "...", "trend": "improving|stable|declining", "reasoning": "อ้างอิง facts" },
  "strengths": [{ "title": "...", "evidence": "fact citation" }],
  "issues":    [{ "title": "...", "evidence": "...", "severity": "high|medium|low" }],
  "recommendations": [{
    "priority": "high|medium|low", "title": "...", "rationale": "อ้างอิง facts ข้อไหน",
    "howTo": ["ขั้นตอน..."], "expectedImpact": "...", "recheckMetric": "...",
    "suggestedAction": { "type": "none" }
  }],
  "nextReviewSuggestedDays": 7
}
```

Lenient parsing per project policy for weak-model JSON (accept-then-normalize, retry ≤ 2); a report that fails parsing after retries is stored raw with `parseFailed: true` and rendered as markdown fallback — never dropped silently.

### 18.5 Execution & scheduling

1. **On-demand:** "วิเคราะห์เพจนี้" (Pages tab) / "วิเคราะห์โฆษณา" (Overview + Campaigns tabs) → builds fresh facts → runs the skill through the existing LLM gateway (OpenRouter primary route; the user's model selection is respected — never auto-escalated, per project policy) → deducts credits via `creditService` (standard llm-request flow) → stores `social_advisor_reports` row → renders report cards.
2. **Scheduled:** optional weekly report per subject (opt-in toggle) via `social:advisor-reports` job in `socialJobsWorker` — reuses the same path; notification links to the stored report. Notification dedup rules (§12.14) apply.
3. **History:** Advisor tab lists past reports per subject with facts snapshot (reproducibility) and diff-vs-previous-report highlights (facts deltas computed in TS — rendering only, no judgment).
4. **Cost transparency:** each report shows model + credits charged (mirrors per-response cost display conventions).

### 18.6 Quality loop (v2 roadmap)

A reviewer-LLM pass over generated reports (grounding check: does every recommendation cite a real fact?) mirroring the established quality-loop pattern used in the Vertical Drama pipeline — deferred to v2; v1 relies on skill.md iteration + the `parseFailed` telemetry.

### 18.7 Acceptance

- On-demand page report for a live test page returns structured Thai recommendations where every recommendation cites a fact present in the stored `facts_snapshot`; ads report on the live test account correctly triages the real `DISAPPROVED`/`WITH_ISSUES` ads found in the 2026-07-17 baseline test.
- Editing `skill.md` (e.g., changing recommendation priorities) changes the next report's behavior with **no deploy and no code change** (after registry cache refresh).
- Facts-token-hygiene unit test green (§18.1).
