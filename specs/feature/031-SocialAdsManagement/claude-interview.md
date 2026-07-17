# Interview Transcript — 031-SocialAdsManagement

**Date:** 2026-07-17 | 1 round (3 questions) — spec v1.2 answered most decisions already; only unresolved business questions asked.

## Q1: ระยะแรกจะให้ใครใช้ฟีเจอร์ Social Ads Management?

**Answer: เปิดขายเป็นฟีเจอร์ premium**

Implications for the plan:
- Meta App Review preparation + full OAuth popup flow move **INTO scope** (was v2-deferred in spec). Plan gets a dedicated OAuth/App-Review section — but sequenced LAST (after P5), since paste-token path works for app admins immediately and App Review is a business-timeline dependency.
- Premium gating: the codebase has **no subscription-plan tier system** (monetization = `credit_packages` purchases + per-tenant feature flags; verified — only `credit_packages`/`billing_migration_runs` tables exist). → "Sold as premium" = admin enables tenant feature flag `SOCIAL_ADS_ENABLED` for paying tenants (flag becomes the entitlement switch, surfaced in the existing admin tenant-feature-flags UI) + usage charges via credits. No new billing system is built.

## Q2: นโยบายคิดเครดิตแพลตฟอร์ม?

**Answer: คิดทั้งคู่**

- Advisor reports: charge by real LLM token usage via `deductCreditsForModel` (standard flow) after each `invokeLLM` call.
- Ads mutations: small flat platform credit per mutation, admin-configurable rate (system_settings key `integrations/social_ads_mutation_credit`, default small e.g. 1 credit), deducted AFTER confirmed Graph success, idempotency-keyed by action_log id (spec §6.1.7 ordering).
- Reads/monitoring/page-insights collection: free (infrastructure cost only).

## Q3: เพดานงบเริ่มต้น max_daily_budget?

**Answer: ฿500/วัน**

- `social_ads_settings.max_daily_budget_minor` default = 50,000 satang (฿500), currency THB default from the ad account's currency at connect time. Overriding upward requires typed confirmation (spec §6.1.6); tenant org cap still bounds it (spec §10.1).
- Spec v1.2 said ฿1,000 default — **superseded by this answer: ฿500.**

## Auto-Decisions (technical — decided from codebase research, not asked)

- Graph API version: pin **v25.0** (v21.0 Marketing sunset 2025-09; research finding).
- Page metrics: build exclusively on post-purge families (`page_follows`, `page_media_view`, `page_total_media_view_unique`, `post_media_views*`, `post_video_avg_time_watched`, ...).
- BullMQ: `upsertJobScheduler`/`removeJobScheduler` keyed by connection id; worker template = `webhookDispatchQueue.ts`; Redis via `getRealtimeClient().duplicate()`.
- Premium gating mechanism: Redis tenant flag `SOCIAL_ADS_ENABLED` (code fallback to `META_CHANNELS_ENABLED` NOT applied anymore — premium means explicitly enabled; default false) + add key to `shared/featureFlags.ts` trio so it appears in the admin tenant-flags UI.
- Advisor LLM calls: `invokeLLM` + `resolveEnabledLlmModelId` + `deductCreditsForModel` (executeSkill can't run llm-only skills; socialDraftService pattern).
- Notifications: `createNotification` with `groupKey` dedup.
- Rate limits: `createRateLimitMiddleware` inline per procedure.
- Locks: `redisSemaphore.acquireSemaphore` (maxSlots=1) for per-entity mutation locks.
- Tests: Vitest module-boundary `vi.mock` conventions; router tests via `createCaller`; no test DB.
- Migration number: verify journal at implementation (0212 vs 0213 conflict noted in research).
- Sandbox accounts: attempt, but CI relies on recorded fixtures (sandbox availability unconfirmed in 2026).
