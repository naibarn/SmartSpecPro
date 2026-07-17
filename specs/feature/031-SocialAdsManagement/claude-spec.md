# Planning Spec (Synthesized) — 031-SocialAdsManagement

**Date:** 2026-07-17
**Base document:** `spec.md` v1.2.0 in this directory (authoritative for all feature requirements; dual-adversarial-reviewed, 50 findings incorporated). This file consolidates the base spec with **research corrections** (`claude-research.md`) and **interview decisions** (`claude-interview.md`). Where this file conflicts with spec.md, THIS FILE WINS (it is newer).

---

## 1. What we are building (summary)

Nine features on the existing SmartSpecPro web app (React + Express/tRPC + Drizzle/PostgreSQL + BullMQ/Redis), full detail in spec.md:

- **F00 — socialJobsWorker:** BullMQ worker fixing the broken scheduled-post pipeline (Gap A) and dead automation rules (Gap B); also hosts all ads/page jobs. Job payloads = opaque ids only.
- **F01 — Per-user encrypted ads credentials:** `social_ads_connections` table (AES-256-GCM via crypto.ts), paste-token onboarding v1, Settings UI panel, hard-delete on disconnect, token lifecycle notifications.
- **F02 — Ads module:** menu item (menu.ts 7.5 + Dashboard socialSidebarItems), route `/social/ads`, `AdsProvider` interface + `MetaAdsProvider`/`adsGraphClient` (own resilience layer: header-only tokens, GET-only retry, intent-row idempotency, Batch API, async insights, Redis cache + BUC governor, pagination), Money type (minor units) + ad-account timezone, error taxonomy → Thai messages.
- **F03 — Campaign creation & management:** 4-step wizard (objective→ad set→creative→review), PAUSED-always creation, boost-existing-post, drafts autosave, budget guardrails + typed confirmation, credit per mutation after Graph success.
- **F04 — Monitoring & auto-block:** 15-min polls per connection, entity-state baseline + transition snapshots, auto-pause DISAPPROVED/overspend/zero-delivery (opt-in rules), hysteresis + manual resume, approval-first mode.
- **F05 — Optimization engine:** rule-based (metric/window/operator/action), strict Zod discriminated-union params validated write+execute, cooldown ledger (rule-independent), per-entity Redis locks, guard>optimizer precedence, dry-run default.
- **F06 — Social suite integration:** wire matchAutomationRules to inbound events, boost-post linkage, ads-comments in Moderation, health panel, fail-closed internal token.
- **F07 — Page performance monitoring:** daily insights collection for ALL visible pages + 90-day backfill, `social_page_insight_snapshots`, Pages tab (cards + drill-down charts).
- **F08 — Skill-first advisors:** `social-page-advisor` + `social-ads-advisor` skills (lowercase `skill.md` = ALL intelligence; TS facts builders = facts only), on-demand + weekly scheduled reports, `social_advisor_reports`, advice→guarded-action mapping (never self-executing).
- **Governance (spec §10):** tenant kill switch, per-user halt, tenant org budget cap, admin forceDisable, ads approval authority = connection owner or admin.

## 2. Amendments from research (override spec.md where different)

1. **Graph API version = `v25.0`** (spec said v21.0 — sunset). Version constant + startup deprecation check per spec §5.2.9.
2. **Page Insights metric set (F07) replaced** — the spec's `page_fans`/`page_impressions*`/`*_unique` family is dead (Nov-2025 + Jun-2026 purges). Use: `page_follows`, `page_daily_follows`, `page_daily_unfollows_unique`; `page_media_view(_paid)`, `post_media_views(_paid|_organic|_follower)`; `page_total_media_view_unique`, `post_total_media_view_unique`; `page_post_engagements`, `post_clicks`, `post_reactions_*_total`, `post_activity_by_action_type`; `page_video_views`, `page_video_complete_views_30s`, `post_video_views`, `post_video_view_time`, `post_video_avg_time_watched`; `page_views_total` (verify live). Comments/shares from post object fields. Paid-vs-organic reach split impossible — facts builder must not promise it.
3. **`special_ad_categories` mandatory** on every campaign create (empty array allowed).
4. **Advantage+ creation via API no longer exists** — remove from v2 roadmap wording ("not possible", not "deferred").
5. **Async insights flow:** `POST /{object}/insights` → `report_run_id` → poll `async_status`/`async_percent_completion` → `GET /{run}/insights`; run ids expire in 30 days (don't persist).
6. **BullMQ:** use `upsertJobScheduler(schedulerId, {every}, template)` + `removeJobScheduler` (not legacy `repeat:`); per-connection scheduler id convention `social-ads:{job}:{connectionId}`; reconciliation sweep vs DB.
7. **F08 execution path:** `executeSkill` cannot run llm-only skills → advisors load skill content (via skillRegistry) and call `invokeLLM` (`_core/llm.ts:269`, with `outputSchema` for §18.4 report JSON) + `deductCreditsForModel` after; model from `resolveEnabledLlmModelId` (respect user selection policy — never auto-escalate).
8. **Sandbox ad accounts unconfirmed** in 2026 → testing gates use recorded-fixture contract tests as the CI backbone; sandbox CRUD if available; real-account PAUSED-only manual smoke as tertiary.
9. **Migration number:** journal head is `0211` but project memory records a reserved `0212_consolidated` (lineage repair 2026-07-16) → next is likely **0213**; MUST verify `drizzle/meta/_journal.json` + `drizzle/` dir at implementation start.
10. **Automated-rules mental model:** add optional `consecutive_hits >= N` param to rule model (mirrors Meta's practitioner pattern); evaluation windows named after Meta presets (TODAY, LAST_3D exclusive, LAST_7D…).

## 3. Decisions from interview (override spec.md where different)

1. **Premium feature** — sold per tenant:
   - Entitlement switch = tenant feature flag `SOCIAL_ADS_ENABLED` (Redis system via `getTenantFeatureFlag`, default **false**, NO fallback to META_CHANNELS_ENABLED — premium means explicitly enabled). Also added to `shared/featureFlags.ts` trio (interface + ALLOWED + DEFAULTS false) so admins toggle it in the existing tenant-flags UI.
   - **OAuth popup flow + Meta App Review preparation move INTO plan scope** as the final implementation phase (P6): full `getAuthUrl`/`completeOAuth` for the ads scopes (state+PKCE-style protections per spec §12.15), scope-minimized review submission checklist, and UI that switches between paste-token (admins/testers) and OAuth (reviewed) modes automatically based on app review status.
2. **Credits — charge both:**
   - Advisor reports: `deductCreditsForModel` by actual tokens.
   - Ads mutations: flat platform credit per mutation, rate from system_settings `integrations/social_ads_mutation_credit` (default 1 credit), deducted after Graph success, idempotency key = action_log id. Reads/monitoring free.
3. **Default `max_daily_budget` = ฿500/วัน** (50,000 minor units THB; currency from ad account) — spec's ฿1,000 superseded.

## 4. Key codebase anchors (from research; the plan references these)

| Concern | Anchor |
|---|---|
| Worker template | `server/services/webhookDispatchQueue.ts` (init/processor/close/UnrecoverableError), boot wiring `server/_core/index.ts` ~:1684 + both shutdown blocks |
| Repeatable jobs | `upsertJobScheduler` idiom `server/jobs/escalationJob.ts:235` |
| Redis | `services/redisClients.ts` `getRealtimeClient().duplicate()`; locks `services/redisSemaphore.ts` |
| LLM | `_core/llm.ts:269 invokeLLM` + `services/enabledLlmModels.ts:295` + `creditService.ts:965 deductCreditsForModel`; pattern `services/socialDraftService.ts:475-521` |
| Credits | `creditService.ts:400 deductCredits` (idempotencyKey), `:804 refundCredits` |
| Notifications | `services/notificationService.ts:292 createNotification` (`groupKey` dedup) |
| Rate limit | `_core/rateLimitedProcedure.ts:27` |
| Flags | `services/featureFlags.ts:79 getTenantFeatureFlag`; admin UI trio `shared/featureFlags.ts:8/:217/:425` |
| Sensitive settings | `routers/systemSettings.ts:1327-1350` encrypt-on-write / `:1267-1284` mask-on-read |
| Secret CRUD template | `userLlmApiKeys` (`schema.ts:17728`) + `userApiKeyService.ts` + `routers/userApiKeys.ts` + `UserLlmKeysPanel.tsx` |
| Audit | `services/auditLogger.ts:384 log` / `:314 sanitizePayload` (extend w/ URL-token regex) / union :18-187 |
| Schema conventions | social block `schema.ts:18012-18092` |
| Charts | `@/components/ui/chart` + recharts (`WorkpackRoiDashboard.tsx:9-10`) |
| i18n | `locales/{en,th}/social.json` + `dashboard.json:557 socialMenu.*`; `/social` route→ns already mapped |
| Tests | `__tests__/socialDraftService.test.ts` (vi.mock bag incl. invokeLLM), `__tests__/socialInbox.test.ts` (createCaller) |
| Menu | `packages/shared/src/constants/menu.ts:61-65` + `Dashboard.tsx:533-568` + `App.tsx:649-653` |
| Settings tabs | `pages/Settings.tsx:98/:102/:1053/:2521-2537` |

## 5. Rollout (amended)

P0 worker+gap-fix → P1 credentials+read-only ads → P2 campaign mgmt → P3 monitoring+auto-block+governance → P4 optimizer+integration → P5 pages+advisors → **P6 OAuth + App Review readiness (premium onboarding)**. Gates/rollback per spec §16 + P6 gate: OAuth flow works for a non-admin test user on the reviewed app OR is feature-flagged dormant pending review approval.
