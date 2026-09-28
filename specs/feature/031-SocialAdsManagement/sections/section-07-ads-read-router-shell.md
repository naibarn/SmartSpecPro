# Section 07 — F02 Read Layer: socialAds Router (Reads) + Menu + Route + Page Shell

**Section id:** `section-07-ads-read-router-shell`
**Feature:** 031-SocialAdsManagement — F02 (Ads module, read-only half)
**Rollout phase:** P1
**Working directory:** `apps/web/` for everything except the menu constant, which lives in `packages/shared/src/constants/menu.ts`.

## Dependencies

| Depends on | What this section consumes from it |
|---|---|
| section-01-schema-flags-i18n | `SOCIAL_ADS_ENABLED` flag in both flag systems; `ads.*` key families in `client/src/locales/{th,en}/social.json`; `socialMenu.ads` in `client/src/locales/{th,en}/dashboard.json` |
| section-05-connection-router-settings-ui | `socialAdsConnection` router registration pattern; connection-status DTO shape (`adAccounts[]` cache with `id, name, currency, timezone_name, account_status`); PRECONDITION_FAILED gating idiom |
| section-06-ads-graph-client | `AdsProvider` interface (`getAdAccounts`, `getCampaigns`, `getAdSets`, `getAds`, `getInsights`, `getIssues`), `adsGraphClient`, read cache, `resolveAdsError` conversion at the boundary, `Money` type |

**Blocks:** section-08 (mutations extend this router and enable the disabled buttons), section-11 (Pages tab content mounts into this shell).

Do not re-implement anything from those sections; import it.

## Goal

After this section, a user in a `SOCIAL_ADS_ENABLED` tenant with an active ads connection sees a "จัดการโฆษณาโซเชียล" menu item, navigates to `/social/ads`, picks an ad account, and can browse Overview, Campaigns (with drill-down to ad sets/ads), Issues, and Insights — all read-only, all ownership-checked, all Money/timezone-correct. Mutation affordances render disabled (Section 08 enables them).

## Background context (read once before coding)

- All ads tRPC procedures assert tenant flag `SOCIAL_ADS_ENABLED` via the Redis-backed `getTenantFeatureFlag` (`server/services/featureFlags.ts:79`); default false (premium). Do NOT fall back to `META_CHANNELS_ENABLED` for ads procedures.
- All money is `Money` (`{currency, amountMinor}`) from `shared/socialAds/money.ts`; all "today"/window computations use the ad account's `timezone_name` via `shared/socialAds/accountTime.ts`. Direct `new Date()` day-bucketing in ads code is forbidden.
- Graph errors surface to the client ONLY through `resolveAdsError` (`server/services/social/adsErrorMap.ts`) — routers never leak raw Graph error bodies.
- Rate limiting uses `createRateLimitMiddleware({namespace, limit, windowMs})` from `server/_core/rateLimitedProcedure.ts:27`, attached inline per procedure with `.use(...)` (usage example: `server/routers/apiKeys.ts:74`).
- Router registration in `server/routers.ts` requires THREE edits: import (existing social imports cluster around `:128`), member in the `AppRouterShape` type (~`:2010`), member in `appRouterInternal` (~`:2200`).
- i18n: `/social/ads` is already covered by the `/social` prefix → `social` namespace mapping in `client/src/i18n/namespaces.ts:16`; components use `useScopedTranslation` with scope `social`.
- Test idioms: routers via `router.createCaller({ user, tenantId, userToken })` (copy `server/routers/__tests__/socialInbox.test.ts:56-70`); services mocked with `vi.mock` module-boundary bags (copy `server/services/__tests__/socialDraftService.test.ts`); jsdom applies to client `.tsx` tests via `environmentMatchGlobs` in `vitest.config.ts:34`.

**Verified codebase facts for this section (checked 2026-07-17):**
- `packages/shared/src/constants/menu.ts` — existing social items occupy sortOrder 7.0–7.4 (lines 61-65), all with `requiresFeature: 'META_CHANNELS_ENABLED'` and no `labelTh`. New item slots in at 7.5.
- `client/src/hooks/useMenuItems.ts` — the `iconMap` (`:57-102`) contains **neither `Megaphone` nor `Target`**. You MUST add `Megaphone` to both the lucide-react import block (`:2-47`) and the `iconMap` object, otherwise the menu falls back to the `Sparkles` icon silently.
- `client/src/pages/Dashboard.tsx` — `socialSidebarItems` array at `:533-568`; entries are `{id, label: t("dashboard:socialMenu.X"), icon: <LucideComponent>, href}` and the array filter respects `socialMenuAllowed`, `hiddenMenuItemIds`, and duplicate-id suppression. `Megaphone` must be imported in this file too.
- `client/src/App.tsx` — social routes at `:649-653`, pattern `<Route path="/social/ads"><RequireAuth><SocialAds /></RequireAuth></Route>`. **Register `/social/ads` in the same cluster**; wouter matches in order and the existing `/social/*` paths are all literal so ordering conflicts are not expected, but keep it adjacent for readability. Add the lazy/static import of `SocialAds` following whichever import style the neighboring social pages use in this file.

## Files

| Action | Path |
|---|---|
| Create | `apps/web/server/routers/socialAds.ts` |
| Edit | `apps/web/server/routers.ts` (3 spots: import / type / value) |
| Edit | `packages/shared/src/constants/menu.ts` (one new item, sortOrder 7.5) |
| Edit | `apps/web/client/src/hooks/useMenuItems.ts` (add `Megaphone` to import + iconMap) |
| Edit | `apps/web/client/src/pages/Dashboard.tsx` (`socialSidebarItems` `:533-568` + `Megaphone` import) |
| Edit | `apps/web/client/src/App.tsx` (route `:649-653` cluster + page import) |
| Create | `apps/web/client/src/pages/SocialAds.tsx` (shell + tabs) |
| Create | `apps/web/client/src/components/socialAds/OverviewTab.tsx`, `CampaignsTab.tsx`, `IssuesTab.tsx`, `InsightsTab.tsx`, `AdAccountSwitcher.tsx`, `StatusChips.tsx` (small components; exact split may vary but keep tabs in separate files — Section 08/09/11 add sibling files here) |
| Create | `apps/web/client/src/hooks/useSocialAds.ts` |
| Create | `apps/web/server/routers/__tests__/socialAds.read.test.ts` |
| Create | `apps/web/client/src/components/socialAds/__tests__/CampaignsTab.test.tsx` |

---

## Tests FIRST (write these before implementation; TDD plan Section 07)

### `server/routers/__tests__/socialAds.read.test.ts` (node env, createCaller)

Mock at module boundary: `vi.mock` for `../services/social/socialAdsConnectionService` (returns a connection status/`ad_accounts` cache), `../services/social/adsProvider` (or `metaAdsProvider` factory — whichever seam Section 06 exports for constructing a provider per connection), `../services/featureFlags` (`getTenantFeatureFlag`), and `@shared/socialAds/accountTime` (spy-able). No network, no DB.

1. **Feature gate:** every read procedure throws `FORBIDDEN` when `getTenantFeatureFlag("SOCIAL_ADS_ENABLED", tenantId)` resolves false. Iterate the procedure list in one parameterized test.
2. **Connection gate:** with flag on but no active connection, procedures requiring a connection throw `PRECONDITION_FAILED` and the error message is the Thai i18n-sourced string that references Settings (assert message contains the Settings hint marker — mirror the assertion style used in Section 05's router tests).
3. **Ownership — ad account:** caller requests `adAccountId: "act_999"` not present in the mocked connection `ad_accounts` cache → `FORBIDDEN`. Also assert the provider was NEVER called (client-supplied `act_` ids never pass through unchecked).
4. **Ownership — entity lineage:** `listAdSets({campaignId})` where the campaign's `account_id` (from provider/cache lookup) is not an owned account → `FORBIDDEN`. Same for `listAds` under a foreign adset, and `getInsights`/`listIssues` on a foreign entity id.
5. **Read rate limit wiring:** assert `createRateLimitMiddleware` was invoked with `{namespace: "social-ads-read", limit: 120, windowMs: 60_000}` (mock the middleware module and inspect call args, as in Section 05's rate-limit test).
6. **getOverview timezone correctness:** with a mocked account whose `timezone_name` is `America/Los_Angeles`, spy on `accountDayRange`/`accountToday` and assert the account's timezone string is passed (never server-local). Assert spend fields in the response are `Money`-shaped (`{currency, amountMinor}` with integer `amountMinor`).
7. **getInsights provisional flag:** insights rows for a preset window whose `until` date is younger than 28 days → conversion metrics carry `provisional: true`; a window ending ≥28 days ago → `provisional: false`. Non-conversion metrics never get the flag.
8. **No secrets in DTOs:** serialize each procedure's response for a happy-path fixture and assert no `EAA`/`access_token` substrings (hygiene canary, same helper as Sections 04–06 tests).

### `client/src/components/socialAds/__tests__/CampaignsTab.test.tsx` (jsdom)

Fixture: one campaign `status: "ACTIVE"` containing an ad with `effective_status: "WITH_ISSUES"`.

1. Configured `status` chip and `effective_status` chip render as DISTINCT elements with different variants/test-ids for the ACTIVE/WITH_ISSUES fixture (a user must be able to see "you set it active, Meta says it has issues" at a glance).
2. Empty state renders (no campaigns → Thai empty-state copy + a create hint that is disabled, see mutation-disabled rule below).
3. Loading state renders (skeleton), error state renders the mapped Thai message.
4. Mutation affordances (pause toggle, edit budget, create button) render with `disabled` while the mutation capability probe is absent (mock the capability query to return `{mutationsAvailable: false}`).

Run with `cd apps/web && pnpm test` filtering these files; both must fail before implementation and pass after. Section is done only when its tests AND the full suite pass, plus `pnpm check` is clean on new files.

---

## Implementation

### 1. Menu + sidebar + route

- `packages/shared/src/constants/menu.ts` — insert after `social-automation` (line 65):
  ```ts
  { id: 'social-ads', label: 'Social Ads', labelTh: 'จัดการโฆษณาโซเชียล', icon: 'Megaphone', path: '/social/ads', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.5, requiresFeature: 'SOCIAL_ADS_ENABLED' },
  ```
  Note: `requiresFeature` here uses the admin-UI flag system (`shared/featureFlags.ts`) that Section 01 registered — this hides the menu for non-premium tenants at the menu-resolution layer, matching how `META_CHANNELS_ENABLED` gates the sibling items.
- `client/src/hooks/useMenuItems.ts` — add `Megaphone` to the lucide-react import list and to `iconMap` (it is currently absent; without this the icon silently falls back to `Sparkles`).
- `client/src/pages/Dashboard.tsx` — append to `socialSidebarItems` (`:533-568`): `{ id: "social-ads", label: t("dashboard:socialMenu.ads"), icon: Megaphone, href: "/social/ads" }` and import `Megaphone` from `lucide-react`. Keep it inside the existing array so the `socialMenuAllowed`/`hiddenMenuItemIds`/dedupe filter applies unchanged. If Dashboard's `socialMenuAllowed` is driven solely by `META_CHANNELS_ENABLED`, additionally gate this one entry on the tenant's `SOCIAL_ADS_ENABLED` enabled-features map (same source `useMenuItems` consumes) so a non-premium tenant with Meta channels does not see it.
- `client/src/App.tsx` — add `<Route path="/social/ads"><RequireAuth><SocialAds /></RequireAuth></Route>` adjacent to the `:649-653` social cluster + the page import.

### 2. Read router — `server/routers/socialAds.ts`

Structure: one `router({...})` of `protectedProcedure`s. **Gate helpers live in ONE home: `server/services/social/socialAdsGate.ts`** (created by Section 05 with `assertSocialAdsEnabled` + `requireActiveAdsConnection`). This section IMPORTS those and ADDS `resolveOwnedAccount` + `assertEntityLineage` to the SAME file (do not define router-local duplicates; use `assertSocialAdsEnabled` — the name `assertAdsEnabled` below is shorthand for it):

```ts
/** Throws FORBIDDEN if SOCIAL_ADS_ENABLED is off for ctx tenant. */
async function assertAdsEnabled(tenantId: string): Promise<void>;

/**
 * Loads the caller's active connection + ad_accounts cache.
 * - no connection / not active → TRPCError PRECONDITION_FAILED, Thai message with Settings link hint.
 * - adAccountId provided but not in the connection's ad_accounts cache → FORBIDDEN.
 * Returns { connection, account } so procedures get currency + timezone_name for free.
 */
async function resolveOwnedAccount(userId: string, tenantId: string, adAccountId?: string): Promise<{connection: ..., account: ...}>;
```

Lineage rule for entity-scoped procedures (`listAdSets`, `listAds`, `getInsights`, `listIssues` on an entity): resolve the entity's owning ad account (via the Section 06 read cache/provider — a cheap `?fields=account_id` read is acceptable; it is cached 60s) and pass THAT through `resolveOwnedAccount`. A client-supplied entity id must never reach the provider before its account ownership is proven. Centralize this in one helper (`assertEntityLineage(connectionId, level, entityId) → adAccountId`) so Section 08 mutations reuse it.

Every procedure: `.use(createRateLimitMiddleware({namespace: "social-ads-read", limit: 120, windowMs: 60_000}))` (per-user read budget), Zod input schemas, catch provider errors → `resolveAdsError` → TRPCError with the Thai `userMessageTh`.

Procedures (signatures only; internals delegate to the Section 06 provider):

| Procedure | Input (Zod) | Output notes |
|---|---|---|
| `listAdAccounts` | — | enabled accounts from the connection cache (id, name, currency, timezone_name, account_status, isDefault); no live Graph call needed |
| `getOverview` | `{adAccountId}` | spend today/7d/30d as `Money` computed with `accountDayRange(account.timezone_name, preset)`; active campaign count; open issues count; `account_status` banner data (e.g. disabled account → banner) |
| `listCampaigns` | `{adAccountId}` | id, name, configured `status`, `effective_status`, objective, budget (`Money`), spend, `updated_time` (Section 08 needs `updated_time` for optimistic concurrency — include it now) |
| `listAdSets` | `{campaignId}` | lineage-checked; budgets as `Money` |
| `listAds` | `{adsetId?}` xor `{campaignId?}` (refine: exactly one) | lineage-checked; include `effective_status` + `issues_info` summary |
| `getInsights` | `{level: 'account'|'campaign'|'adset'|'ad', id, preset, breakdowns?}` | rows with `Money` spend; each conversion-family metric annotated `provisional: boolean` = window `until` younger than 28 days (compute with `accountTime`, account tz) |
| `listIssues` | `{adAccountId}` | flattened `issues_info` across entities + account-level status problems, each with entity ref + mapped Thai remediation from `adsErrorMap` where applicable |
| `getCapabilities` | — | `{mutationsAvailable: false}` for now — the feature-detection probe the UI uses to disable mutation buttons; Section 08 flips it (and may gate per-scope: `ads_management` granted or not) |

Register in `server/routers.ts` (import ~`:128` cluster, `AppRouterShape` ~`:2010`, `appRouterInternal` ~`:2200`) as `socialAds: socialAdsRouter`.

Audit: reads are already audited at the Graph-client layer (Section 06 `social_ads_request/response`); the router adds nothing.

### 3. Page shell — `client/src/pages/SocialAds.tsx`

Follow the layout/structure of the sibling social pages (`SocialPublishing.tsx` et al.) — same page chrome, `useScopedTranslation` scope `social`, all strings from `ads.*` keys (seeded in Section 01; add any key this section needs that 01 missed, in BOTH th and en).

- **Gate states first:** flag off (should be unreachable via menu, but render an upsell/locked card anyway), no connection → full-page empty state with a button linking to Settings integrations tab (`ads.connection.*` copy). Drive from `socialAdsConnection.getStatus` (Section 05).
- **`AdAccountSwitcher`:** select fed by `listAdAccounts`; persists selection per user via guarded localStorage (use the project's safe-storage try/catch idiom — unguarded `setItem` has caused real bugs here); shows currency + timezone beside the name; disabled-account entries render with a warning badge.
- **Tabs skeleton (7 triggers):** Overview, Campaigns, Issues, Insights, Automation, Pages, Advisor. This section implements the first four panels; Automation/Pages/Advisor render a "coming in this rollout" placeholder panel (real content: Sections 09/10, 11, 12 — they mount into these slots, so give each panel a stable component seam/file).
- **OverviewTab:** stat cards (spend today/7d/30d Money-formatted via `formatMoney`, active campaigns, issue count), `account_status` banner when not 1/ACTIVE.
- **CampaignsTab:** table with BOTH chips per row — configured `status` and `effective_status` — visually distinct (`StatusChips.tsx`: variants keyed by status; `WITH_ISSUES`/`DISAPPROVED` destructive, `ACTIVE` positive, `PAUSED` neutral). Row drill-down → ad sets → ads (nested expansion or breadcrumb sub-table; keep it simple). Money-formatted spend/budget columns. Empty/loading/error states mandatory.
- **IssuesTab:** list from `listIssues`, grouped by entity, Thai remediation text, deep-link to the entity row in CampaignsTab.
- **InsightsTab:** preset picker (`today|yesterday|last_7d|last_30d`), charts via `@/components/ui/chart` (`ChartContainer` + recharts, canonical usage `client/src/pages/WorkpackRoiDashboard.tsx:9-10, 268-270`). Any conversion metric with `provisional: true` renders a "ข้อมูลเบื้องต้น" badge/tooltip.
- **Mutation buttons disabled by capability, not commented out:** render create/pause/edit affordances wherever they will live, `disabled` + tooltip driven by `getCapabilities().mutationsAvailable`. Section 08 flips the server value and the same UI lights up — no UI rework.

### 4. Hooks — `client/src/hooks/useSocialAds.ts`

Thin wrappers over `trpc.socialAds.*` queries (TanStack Query): `useAdAccounts`, `useAdsOverview(adAccountId)`, `useCampaigns(adAccountId)`, `useAdSets(campaignId)`, `useAds(parent)`, `useAdsInsights(params)`, `useAdsIssues(adAccountId)`, `useAdsCapabilities`, plus the selected-account state hook. Set sensible `staleTime` (~30s — the server cache is 60s) and disable queries until `adAccountId` is chosen. Keep query-key discipline so Section 08 can invalidate after mutations.

## Explicitly out of scope (later sections)

- Any mutation procedure or enabled mutation UI → Section 08.
- Automation tab content (rules/feed) → Sections 09/10. Pages tab → Section 11. Advisor tab → Section 12.
- No new tables, no schema edits, no migration in this section.

## Acceptance checklist

- [ ] Both new test files written first, initially red, now green; full `pnpm test` suite green; `pnpm check` clean.
- [ ] Menu item appears only for `SOCIAL_ADS_ENABLED` tenants; icon renders as `Megaphone` (not the `Sparkles` fallback).
- [ ] `/social/ads` loads behind `RequireAuth`; no-connection state links to Settings.
- [ ] Every read procedure: flag gate → connection gate → ownership/lineage gate → provider, in that order; foreign `act_`/entity ids rejected before any Graph call.
- [ ] All money rendered via `formatMoney`; all windows via `accountTime` with the account's `timezone_name`; zero raw-float or server-local-date math in new code.
- [ ] No token-shaped string in any DTO or client-visible error (hygiene canary green).