# Section 11 — F06 + F07: Integration Glue, Health Panel, Page Insights Collection + Pages Tab

**Section id:** `section-11-integration-page-insights`
**Feature:** 031-SocialAdsManagement — F06 (social-suite integration & gap closure, non-worker half) + F07 (page performance monitoring)
**Rollout phase:** P4 (integration half) + P5 (pages half)
**Working directory:** `apps/web/` for everything (`shared/socialAds/factsTypes.ts` is `apps/web/shared/`, same alias family as `money.ts`).

## Dependencies

| Depends on | What this section consumes from it |
|---|---|
| section-03-social-jobs-worker | `SOCIAL_JOB_QUEUES.pageInsights` (`"social:page-insights"`) queue, the `registerSocialJobProcessor(queueName, fn)` dispatch seam, scheduler id convention `social:page-insights:{connectionId}` (daily, already registered by Section 04's `saveToken`), `isSocialJobsWorkerOnline()` health probe |
| section-07-ads-read-router-shell | `SocialAds.tsx` shell with a stable **Pages** tab placeholder seam, `server/routers/socialAds.ts` (this section appends read procedures), the read rate-limit idiom (`namespace: "social-ads-read", limit: 120, windowMs: 60_000`), `useSocialAds.ts` hook file, `assertAdsEnabled`/`resolveOwnedAccount` helpers |
| section-08-mutations-wizard | `CampaignWizard` + `listPagePostsForBoost` + the `object_story_id = "{pageId}_{postId}"` boost creative path (the boost button deep-links into it) |

Indirect (import, never re-implement): section-01 `socialPageInsightSnapshots` table (`pageId varchar(40)`, `snapshotDate date`, `metrics json`, `postMetrics json`, unique `(pageId, snapshotDate)`, `connectionId` FK → `socialAdsConnections`); section-02 hygiene helpers/`Money`; section-04 `socialAdsConnectionService` (`getDecryptedAccessToken` internal-only, status DTO with `grantedScopes`/`missingScopes`); section-06 `adsGraphClient`/`AdsProvider` seam + BUC governor + retry/audit mechanics.

**Blocks:** section-12 (advisors consume `PageFacts` from `pageFactsBuilder` and `shared/socialAds/factsTypes.ts`; the Pages tab hosts the "วิเคราะห์เพจนี้" button and report-history slot that Section 12 activates).

**Sequencing:** run AFTER section-09 — both edit files under `client/src/components/socialAds/` and the `SocialAds.tsx` tab wiring. Do not parallelize with 09.

## Goal

After this section: (a) a published post in Publishing has a "บูสต์โพสต์นี้" button that opens the campaign wizard prefilled for boosting; (b) Moderation marks comments that belong to ad posts with an "โฆษณา" badge; (c) `/social/channels` shows one health card explaining why any social module has no data — and the Python internal-token check **fails closed**; (d) every page the connected user can see gets a daily insight snapshot (post-purge metric set only) with 90-day backfill; (e) the Pages tab renders page cards + drill-down analytics from those snapshots.

## Background context (read once before coding)

- **F07 metric reality (research-verified):** the classic `page_fans`/`page_impressions*`/reach-unique families are DEAD (Nov-2025 + Jun-2026 purges). Build ONLY on the post-purge set listed in §2 below. Paid-vs-organic reach split is **impossible** — the facts builder must not emit such fields.
- **Page tokens:** derived per call from `/me/accounts` using the stored user token; NEVER persisted (they add no capability worth the extra secret surface). All decrypt calls stay inside `socialAdsConnectionService`.
- **Fail-closed target (verified 2026-07-17):** `server/routers/metaChannels.ts:45-71` `callPythonBackend` — when `getPreferredInternalToken()` (from `services/appRuntimeConfig`) returns null, lines `:55-58` only `console.warn` and proceed unauthenticated. Spec §9.3 upgrades this to a hard error.
- **Client anchors (verified):** `SocialPublishing.tsx` history table `:863-971` — actions column header `:897`; currently only `scheduled` rows render an action (cancel, `:939-948`); `published` rows render nothing → the boost button goes there. `SocialModeration.tsx` — `Badge` imported `:14`, `CommentStatusBadge` idiom `:31-44`, `trpc.socialModeration.listComments` infinite query `:60`, post column `:404`. `SocialChannels.tsx` — `DashboardCard` layout, `trpc.metaChannels.getConnectionStatus.useQuery` `:315`; the health card mounts on this page.
- **Router registration:** `server/routers.ts` needs THREE edits for the new `socialHealth` router (import cluster ~`:128`, `AppRouterShape` ~`:2010`, `appRouterInternal` ~`:2200`).
- **Processor plug-in:** Section 03 dispatches unregistered queues as logged no-ops; this section registers the real page-insights processor via the `registerSocialJobProcessor` seam (follow the exact registration call-site convention Section 09 established for `social:ads-monitor` — do not edit queue/init plumbing).
- Test idioms: services via `vi.mock` module-boundary bags (`server/services/__tests__/socialDraftService.test.ts`), routers via `createCaller` (`server/routers/__tests__/socialInbox.test.ts:56-70`), jsdom for client `.tsx`. No network, no DB.

## Files

| Action | Path |
|---|---|
| Create | `apps/web/server/services/social/pageInsightsService.ts` |
| Create | `apps/web/server/services/social/pageFactsBuilder.ts` |
| Create | `apps/web/shared/socialAds/factsTypes.ts` (`PageFacts`; Section 12 adds `AdsFacts` beside it) |
| Create | `apps/web/server/routers/socialHealth.ts` |
| Edit | `apps/web/server/routers.ts` (3 spots for `socialHealth`) |
| Edit | `apps/web/server/routers/metaChannels.ts` (`:55-58` fail closed) |
| Edit | `apps/web/server/routers/socialAds.ts` (append `listPages`, `getPageSnapshots`, `getPageFacts`, `listAdPostIds`) |
| Edit | `apps/web/server/services/social/adsProvider.ts` + `metaAdsProvider.ts` (add page-insights methods to the seam) |
| Edit | processor registration call-site from Section 09 (register `processPageInsightsJob`) |
| Edit | `apps/web/client/src/pages/SocialPublishing.tsx` (boost button on published rows) |
| Edit | `apps/web/client/src/pages/SocialModeration.tsx` (ad badge) |
| Create | `apps/web/client/src/components/social/SocialHealthPanel.tsx`; Edit `client/src/pages/SocialChannels.tsx` (mount it) |
| Create | `apps/web/client/src/components/socialAds/PagesTab.tsx`, `PageCard.tsx`, `PageDrilldown.tsx` (replace the Section 07 placeholder panel) |
| Edit | `apps/web/client/src/hooks/useSocialAds.ts` (page hooks) |
| Edit | `client/src/locales/{th,en}/social.json` (any missing `ads.pages.*`, `ads.health.*`, `ads.boost.*`, `ads.moderationBadge` keys — BOTH languages) |
| Create | tests: `server/services/social/__tests__/pageInsightsService.test.ts`, `__tests__/pageFactsBuilder.test.ts`, `server/routers/__tests__/socialHealth.test.ts`, `client/src/components/socialAds/__tests__/PagesTab.test.tsx` |

---

## Tests FIRST (write before implementation; TDD plan Section 11)

### `server/services/social/__tests__/pageInsightsService.test.ts`

Mock the provider seam (page-insights methods), `socialAdsConnectionService`, drizzle, `createNotification`. No fetch.

1. **Exact metric list:** the processor requests ONLY the post-purge metric names — assert the metric-name arrays passed to the mocked provider equal the exported `PAGE_INSIGHT_METRICS` / `POST_INSIGHT_METRICS` constants, and that those constants contain no dead names (`page_fans`, `page_impressions*`, `*_unique` reach family other than the two `*_total_media_view_unique` successors).
2. **Unknown-metric resilience:** provider throws/omits one metric (`page_views_total`) → snapshot stores `null` for it + a WARN log; the job still succeeds and other metrics persist.
3. **Upsert idempotency:** running the processor twice for the same `(pageId, snapshotDate)` produces one row (assert the upsert conflict target), storing Meta's `end_time` as-is (no local re-bucketing).
4. **Backfill bounds:** first run for a page with zero snapshot rows iterates bounded `since/until` windows back at most 90 days and stops at the mocked API horizon (provider returns empty/`error` past 90d → loop terminates, no infinite paging).
5. **Payload/permission hygiene:** job payload handled is `{connectionId}` (+ optional `pageId`) only; a page whose insights call fails with a `read_insights` permission error is recorded as unavailable (no throw) and does not abort remaining pages; a 190 mid-run → `markExpired` (mock) + abort remaining pages.

### `server/services/social/__tests__/pageFactsBuilder.test.ts`

1. Zero-post window → cadence/engagement facts are `null`, never fabricated zeros (no division-by-zero rates).
2. Output object contains NO paid-vs-organic reach fields (assert absent keys).
3. Growth deltas (7/28/90d) correct on a synthetic snapshot series; month-over-month self-comparison correct.
4. Hygiene canary: `JSON.stringify(facts)` contains no `EAA`/`access_token` substrings.

### `server/routers/__tests__/socialHealth.test.ts` (createCaller)

1. Internal token missing (`getPreferredInternalToken` → null) → health response reports the internal-token check as **hard error** status (fail closed), and `metaChannels.callPythonBackend` now throws rather than proceeding unauthenticated (regression test on the edited path).
2. Python backend unreachable (mocked fetch rejects) → overall `degraded`, response lists WHICH modules are affected (inbox/moderation/publishing/webhooks).
3. Worker offline (`isSocialJobsWorkerOnline()` → false) → "background jobs offline" entry (scheduled posts affected).
4. Ads connection expired → ads entry `expired` with Settings hint; no secrets/token shapes anywhere in the DTO (hygiene canary).

### `client/src/components/socialAds/__tests__/PagesTab.test.tsx` (jsdom)

1. Page card renders follower count + 28d sparkline from a snapshots fixture.
2. Connection `missingScopes` includes `read_insights` → reconnect prompt renders INSTEAD of charts.
3. Empty state (no pages) and loading skeleton render.

Also add (small, same files or the pages they touch): a jsdom assertion that a `published` row in Publishing renders the boost button linking to `/social/ads` with the boost param, and that Moderation renders the "โฆษณา" badge only for rows whose `postId` is in the mocked ad-post-id set — and renders NOTHING ads-related when that query errors (graceful degradation).

All tests red first; section done only when they pass, full `pnpm test` suite passes, and `pnpm check` is clean.

---

## Implementation

### 1. Fail-closed internal token + `socialHealth` router (F06)

- `metaChannels.ts:55-58`: replace the warn-and-continue with a thrown error (`TRPCError INTERNAL_SERVER_ERROR`-mappable service error, Thai user message via i18n key `ads.health.internalTokenMissing` semantics: "ระบบยังไม่ได้ตั้งค่า internal token"). Every python passthrough in this router now refuses to run unauthenticated.
- `server/routers/socialHealth.ts` — one `protectedProcedure` query `getStatus` (gated by `META_CHANNELS_ENABLED` like its host page, NOT by the ads flag — the panel must work for non-premium tenants; the ads entry simply reports `not_configured` when the ads flag is off). Returns a checks array, each `{id, status: 'ok'|'degraded'|'error'|'not_configured', affectedModules: string[], detail}`:
  - `pythonBackend` — short-timeout GET to the python health endpoint via the (now fail-closed) internal-call helper.
  - `internalToken` — `getPreferredInternalToken()` null → `error` (fail closed; affected: inbox, moderation, publishing, webhooks).
  - `webhookSubscriptions` — per connected page, reuse the existing metaChannels/python subscription-status source if one exists; otherwise a per-page Graph `subscribed_apps` read through the page token path. Degrade gracefully (`degraded` with detail) if the source itself is down.
  - `backgroundJobs` — `isSocialJobsWorkerOnline()` from Section 03 (affected: scheduled posts, automation, ads monitoring, page insights).
  - `adsConnection` — status from `socialAdsConnectionService.getStatus` (never scopes/JSON bodies beyond status + hint).
- Register in `routers.ts` (3 spots). `SocialHealthPanel.tsx`: `DashboardCard` on `/social/channels` listing the checks with status chips + Thai remediation text; mount near the existing connection hero in `SocialChannels.tsx`.

### 2. `pageInsightsService.ts` (F07 collection)

- Export the metric constants (ONE place; tests pin them):
  - `PAGE_INSIGHT_METRICS`: `page_follows`, `page_daily_follows`, `page_daily_unfollows_unique`, `page_media_view`, `page_media_view_paid`, `page_total_media_view_unique`, `page_post_engagements`, `page_views_total` (tolerate absence), `page_video_views`, `page_video_complete_views_30s`.
  - `POST_INSIGHT_METRICS`: `post_media_views`, `post_total_media_view_unique`, `post_clicks`, `post_reactions_*_total` family, `post_video_avg_time_watched`. Comments/shares come from the post OBJECT (`comments.summary(true)`, `shares`), not insights.
- Extend the `AdsProvider` seam (Section 06 files) with `getVisiblePages()` (`/me/accounts`), `getPageInsights(pageId, metrics, {since, until})`, `getRecentPagePosts(pageId, limit /* ≤25 */)`, `getPostInsights(postId, metrics)` — implemented in `metaAdsProvider` so retry/governor/cache/audit/token-header rules are inherited unchanged. Page-token derivation happens inside the provider per call (from `/me/accounts` response), never returned to callers or persisted.
- `processPageInsightsJob({connectionId, pageId?})` (standalone exported processor, registered on `SOCIAL_JOB_QUEUES.pageInsights` via `registerSocialJobProcessor`): for each visible page — fetch metrics + recent-post metrics, upsert one `socialPageInsightSnapshots` row per page per day on `(pageId, snapshotDate)` storing Meta's `end_time` as given. Unknown/deprecated metric → `null` + WARN, never a job failure. `read_insights` permission failure → mark page unavailable, continue. 190 → `socialAdsConnectionService.markExpired`, abort remaining. Governor `ThrottleDeferred` → skip cycle (rethrow for the worker's skip handling per Section 03/06 convention).
- **Backfill:** when a page has no snapshot rows, loop bounded `since/until` windows back up to 90 days (stop early when the API stops returning data). Idempotent via the upsert; safe to re-run.

### 3. `pageFactsBuilder.ts` + `shared/socialAds/factsTypes.ts` (facts ONLY)

`buildPageFacts(connectionId, pageId): Promise<PageFacts>` — reads snapshots (DB only, no Graph): metric time series + growth deltas (7/28/90d), posting cadence (posts/week, gap days), content-type mix, per-slot engagement histogram (day-of-week × hour), top-5/bottom-5 recent posts with attributes, follower net-change series, month-over-month self-comparison. Zero-post windows → `null`s, never fabricated zeros. **Explicitly NO paid-vs-organic reach split.** No thresholds, no good/bad labels, no advice — all judgment lives in Section 12's skill.md. Define `PageFacts` in `factsTypes.ts` with doc comments (Section 12 imports it and adds `AdsFacts`).

### 4. `socialAds` router additions (reads; same gating + `social-ads-read` rate limit as Section 07)

| Procedure | Notes |
|---|---|
| `listPages` | visible pages + latest snapshot summary (followers, 28d delta, last-post age) + `insightsAvailable` flag; DB-backed, no live Graph |
| `getPageSnapshots` | `{pageId, range: '28d'\|'90d'\|'13mo'}` → snapshot series for charts; verify the page belongs to the caller's connection |
| `getPageFacts` | `{pageId}` → `buildPageFacts` output (UI + Section 12 reuse) |
| `listAdPostIds` | effective `object_story_id`s (`{pageId}_{postId}`) across the caller's enabled accounts, via the Section 06 provider/read cache (60s) — feeds the Moderation badge |

### 5. Pages tab UI

Replace the Section 07 placeholder panel. `PagesTab.tsx`: grid of `PageCard`s (followers + 28d net-change sparkline, views trend, engagement, last-post age, "วิเคราะห์เพจนี้" button — rendered disabled with a "เร็ว ๆ นี้" tooltip until Section 12 wires it). `PageDrilldown.tsx`: charts via `@/components/ui/chart` + recharts (canonical usage `WorkpackRoiDashboard.tsx:9-10`) — followers/views/engagement/video over time, sortable post table, content-mix donut, posting-time heatmap (from the facts histogram), advisor-report-history slot (empty-state placeholder; Section 12 fills). Missing `read_insights` in the connection DTO's `missingScopes` → reconnect prompt (link to Settings panel) instead of charts. Hooks in `useSocialAds.ts`: `usePages`, `usePageSnapshots(pageId, range)`, `usePageFacts(pageId)`, `useAdPostIds` — keep query-key discipline.

### 6. Boost-post button (Publishing → Ads)

In the `SocialPublishing.tsx` history table actions cell (`:897`/`:939-948` region): for `status === "published"` rows with a resolvable `pageId` + platform post id, render "บูสต์โพสต์นี้" navigating (wouter) to `/social/ads?boost={pageId}_{postId}`. `SocialAds.tsx` reads the `boost` query param and opens the Section 08 `CampaignWizard` prefilled on the boost-existing-post creative path (`object_story_id`), then clears the param. Render the button only when the tenant's `SOCIAL_ADS_ENABLED` flag is on and `getCapabilities().mutationsAvailable` (reuse the Section 07/08 capability query) — otherwise omit entirely (Publishing must not advertise a premium feature to non-premium tenants).

### 7. Moderation ad badge

`SocialModeration.tsx`: query `socialAds.listAdPostIds` (enabled only when the ads flag/connection state allows; `retry: false`). Rows whose comment `postId` matches → `Badge` "โฆษณา" beside the post cell (`:404` column), following the `CommentStatusBadge` styling idiom. Query disabled/error/empty → no badges, zero impact on moderation actions (moderating ad comments uses the existing comment actions unchanged).

## Explicitly out of scope (other sections)

- Automation-rule wiring + worker plumbing → Section 03 (done). Monitor/guards UI → Section 09.
- Advisor skills, `AdsFacts`, "วิเคราะห์เพจนี้" activation, report history content → Section 12.
- Snapshot retention purges (13-month) → Section 13. Inbox click-to-Messenger referral tagging (optional Python change) → deferred, not in this section.
- No new tables, no migration (Section 01 owns `socialPageInsightSnapshots`).

## Acceptance checklist

- [ ] All new test files written first (red → green); full `pnpm test` green; `pnpm check` clean.
- [ ] `PAGE_INSIGHT_METRICS`/`POST_INSIGHT_METRICS` contain only post-purge names; unknown metric → null + WARN, job never fails; upsert on `(pageId, snapshotDate)` idempotent; backfill bounded at 90d.
- [ ] Page tokens derived per call, never persisted/logged; facts JSON hygiene canary green; no paid-vs-organic reach fields anywhere.
- [ ] Internal-token check fails closed (python passthrough throws when unconfigured); health card on `/social/channels` explains degraded modules including "background jobs offline".
- [ ] Boost button appears only on published rows in premium tenants and lands in the wizard's boost path; Moderation shows the "โฆษณา" badge with graceful degradation.
- [ ] Pages tab: cards + drill-down render from snapshots; `read_insights` missing → reconnect prompt; all strings from `ads.*` i18n keys in both th and en.