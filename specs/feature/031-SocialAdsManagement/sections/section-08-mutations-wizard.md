# Section 08 — F03: Mutations, Guardrails, Action Log, Credits, Campaign Wizard

**Section id:** `section-08-mutations-wizard`
**Feature:** 031-SocialAdsManagement — F03 (Campaign creation & management, all mutation paths)
**Rollout phase:** P2
**Working directory:** `apps/web/`

## Dependencies

| Depends on | What this section consumes from it |
|---|---|
| section-01-schema-flags-i18n | Tables `socialAdsActionLog` (`actor`, `action`, `targetLevel`, `targetId`, `intentStatus`, `requestPayload`, `graphResponse`, `traceId`, `finalizedAt`), `socialAdsDrafts` (`wizardState`, `step`), `socialAdsCreativeAssets` (`mediaAssetRef`, `metaImageHash`, `metaVideoId`, unique `(adAccountId, mediaAssetRef)`), `socialAdsSettings` (`maxDailyBudgetMinor` default 50000, `automationHalted`); system_settings keys `integrations/social_ads_mutation_credit` (default 1), `integrations/social_ads_automation_halted`, `integrations/social_ads_org_daily_cap`; `SOCIAL_ADS_I18N_KEYS` constant + th/en `social.json` |
| section-02-shared-primitives | `Money`/`formatMoney`/`pctOfMinor`/`assertSameCurrency` (`shared/socialAds/money.ts`), `accountTime`, `resolveAdsError` (`server/services/social/adsErrorMap.ts`), `sanitizeForActionLog` (8KB truncation + token redaction, `server/services/auditLogger.ts`) |
| section-06-ads-graph-client | `AdsProvider` mutation methods (`createCampaign`, `createAdSet`, `createAdCreative`, `createAd`, `updateEntity`, `mutateStatus`, `duplicateEntity`, `uploadAdImage`, `uploadAdVideo`, `searchTargeting`, `getPreviews`, `getPagePosts`), `getAdsProvider("meta")`, `invalidateEntity(connectionId, entityId)` on the read cache; POST/DELETE are NEVER HTTP-retried — mutation idempotency comes from THIS section's intent-row protocol |
| section-07-ads-read-router-shell | `server/routers/socialAds.ts` (this section extends it), helpers `assertAdsEnabled`, `resolveOwnedAccount`, `assertEntityLineage`; `getCapabilities` probe (this section flips `mutationsAvailable`); the disabled mutation affordances in `SocialAds.tsx` tabs (this section lights them up); `useSocialAds.ts` query keys (this section invalidates them after mutations) |

**Blocks:** section-09 (guards execute through `executeAdsAction` with `actor:'system:guard'`), section-10 (optimizer same, `actor:'system:optimizer'`), section-12 (advisor "นำไปใช้" apply path routes through `executeAdsAction`).

Do not re-implement anything from those sections; import it. `executeAdsAction`'s signature is a contract consumed by 09/10/12 — do not deviate from the shape below without updating those sections.

## Goal

After this section, a user can create a full campaign (campaign → ad set → creative → ad) through a 4-step wizard with server-side drafts and partial-failure resume, and manage existing entities (budget, schedule, rename, pause/resume, duplicate, archive) — with every mutation flowing through the intent-row protocol (action log + per-entity lock + kill-switch check + post-success credit deduction) and every payload validated (ODAX objectives, PAUSED-on-create, budget minimums/ceilings, special-ad-category enforcement, optimistic concurrency).

## Background context (read once before coding)

- **Intent-row protocol is the mutation idempotency layer.** The Graph client never retries POST/DELETE (Section 06); instead every mutation writes a `socialAdsActionLog` row with `intentStatus='pending'` BEFORE the provider call and finalizes it `ok|error|unknown` after. A row stuck `pending|unknown` blocks duplicate submissions and is later reconciled/alerted by Section 13.
- **Locks:** `acquireSemaphore(redis, key, maxSlots, ttlSeconds)` in `server/services/redisSemaphore.ts` (Lua INCR+EXPIRE, TTL crash-recovery). Redis handle: `getRealtimeClient()` from `server/services/redisClients.ts`. Lock key convention (spec §10.4): `social-ads-lock:{entityId}`, TTL 60s, maxSlots 1.
- **Credits:** `deductCredits(params)` (`server/services/creditService.ts:400`) supports `idempotencyKey` (Redis `credit:idemp:${key}` 24h + DB unique safety net), `sourceType`, `metadata.traceId`. Rate comes from system_settings `integrations/social_ads_mutation_credit` (default 1). Deduct AFTER confirmed Graph success only; a failed call charges nothing; a retried confirmation cannot double-charge (idempotency key = action-log row id).
- **Kill switches (checked for SYSTEM actors only** — a human clicking a button is never blocked by automation halts): tenant `integrations/social_ads_automation_halted` (system_settings) and per-user `socialAdsSettings.automationHalted`. This section builds the choke point; Sections 09/10 rely on it.
- **Validation facts (from research):** ODAX objectives = `OUTCOME_AWARENESS|OUTCOME_TRAFFIC|OUTCOME_ENGAGEMENT|OUTCOME_LEADS|OUTCOME_APP_PROMOTION|OUTCOME_SALES`. `special_ad_categories` is mandatory on every campaign create (empty array allowed). Ad set: almost all optimization goals bill `IMPRESSIONS` only (exceptions: LINK_CLICKS/THRUPLAY-style goals may bill themselves); `lifetime_budget` requires `end_time`; targeting minimum is `{"geo_locations":{...}}`; budgets are integer minor units validated against the account's `minimum_budgets` (available in the connection's `adAccounts` cache entry). Budget mode: CBO campaign budget XOR ad-set budget.
- **Budget ceiling:** effective cap = `min(user socialAdsSettings.maxDailyBudgetMinor (default 50000 = ฿500), tenant integrations/social_ads_org_daily_cap)`. Exceeding requires literal `confirmationText === "ยืนยันเพิ่มงบ"` (same constant Section 05 uses for `updateSettings`) and is flagged in the action-log payload.
- **Optimistic concurrency (arch finding 7):** client sends the entity's `updated_time` (exposed as `updatedTime` by Section 07's `listCampaigns`) as `expectedUpdatedTime`; server re-reads the entity before mutating; drift → `CONFLICT` TRPCError carrying the fresh value, retriable with an explicit `override: true` flag.
- **Security:** ad previews render ONLY inside `<iframe sandbox="allow-scripts" srcDoc={...}>` — never `dangerouslySetInnerHTML` (sec finding 10a). The server never fetches user-supplied destination URLs in v1 (sec finding 10b — no link-preview fetcher). All action-log payloads pass `sanitizeForActionLog` before insert (token redaction + 8KB truncation).
- Rate limiting: `createRateLimitMiddleware({namespace, limit, windowMs})` from `server/_core/rateLimitedProcedure.ts:27`, attached per procedure with `.use(...)`.
- i18n: every new user-facing string gets an `ads.*` key added to `SOCIAL_ADS_I18N_KEYS` (`client/src/lib/socialAdsI18nKeys.ts`) AND both `client/src/locales/{th,en}/social.json` (flat dotted-key maps) — the Section 01 completeness test will fail otherwise.
- Test idioms: services via `vi.hoisted` mock bags + module-boundary `vi.mock` (copy `server/services/__tests__/socialDraftService.test.ts`); chainable drizzle mock (copy `creditService.test.ts:3-45`); routers via `router.createCaller({user, tenantId, userToken})`; jsdom for client `.tsx` tests. No network, no test DB.

## Files

| Action | Path |
|---|---|
| Create | `apps/web/server/services/social/adsActionService.ts` |
| Create | `apps/web/server/services/social/adsMutationService.ts` |
| Edit | `apps/web/server/routers/socialAds.ts` (append mutation procedures; flip `getCapabilities`) |
| Create | `apps/web/shared/socialAds/mutationSchemas.ts` (Zod inputs shared by router + wizard) |
| Create | `apps/web/client/src/components/socialAds/CampaignWizard.tsx` |
| Create | `apps/web/client/src/components/socialAds/wizard/StepObjective.tsx`, `StepAdSet.tsx` (targeting builder + `searchTargeting` autocomplete + placements), `StepCreative.tsx` (boost picker / media-library upload / preview iframe), `StepReview.tsx` |
| Create | `apps/web/client/src/components/socialAds/mutations/BudgetEditor.tsx`, `StatusToggle.tsx`, `DuplicateDialog.tsx`, `RenameDialog.tsx`, `ArchiveConfirm.tsx` |
| Edit | `apps/web/client/src/components/socialAds/CampaignsTab.tsx` + `SocialAds.tsx` (wire the Section 07 disabled affordances to the now-available mutations; keep capability-driven) |
| Edit | `apps/web/client/src/hooks/useSocialAds.ts` (mutation hooks + query invalidation) |
| Edit | `apps/web/client/src/lib/socialAdsI18nKeys.ts` + `client/src/locales/{th,en}/social.json` (new `ads.wizard.*`, `ads.mutations.*` keys) |
| Create | `apps/web/server/services/social/__tests__/adsActionService.test.ts` |
| Create | `apps/web/server/services/social/__tests__/adsMutationService.test.ts` |
| Create | `apps/web/server/routers/__tests__/socialAds.mutations.test.ts` |
| Create | `apps/web/client/src/components/socialAds/__tests__/CampaignWizard.test.tsx` |

No schema changes, no migration — all tables exist from Section 01.

---

## Tests FIRST (write before implementation; TDD plan Section 08)

### 1. `server/services/social/__tests__/adsActionService.test.ts` (node)

Mock bag (`vi.hoisted` + `vi.mock`): drizzle db (chainable, capture inserts/updates on `socialAdsActionLog`), `../redisSemaphore` (`acquireSemaphore`), `../creditService` (`deductCredits`), `../redisClients`, system-settings reader, `../social/adsGraphClient` or the injected cache-invalidation seam, `../auditLogger` (`sanitizeForActionLog` pass-through spy + audit event spy).

1. **Pending-before-provider ordering:** `executeAdsAction` inserts an action-log row with `intentStatus:'pending'` BEFORE `execute()` runs (assert call order via a shared sequence array).
2. **Finalize ok:** `execute()` resolves → row updated `intentStatus:'ok'`, `graphResponse` set (sanitized), `finalizedAt` set.
3. **Finalize error:** `execute()` rejects with a typed provider error → row `intentStatus:'error'` + `errorMessage`; NO credit deduction; error rethrown after `resolveAdsError` mapping.
4. **Timeout → unknown:** `execute()` rejects with a timeout/abort shape → row `intentStatus:'unknown'`; `deductCredits` NOT called; caller receives a typed "unknown outcome" error (Thai message present).
5. **Dedupe:** an open `pending|unknown` row exists for the same `(actor, action, targetId)` → new call rejected before lock/provider; provider never invoked.
6. **Kill switches:** with `actor:'system:guard'`, tenant halt ON → blocked; user `automationHalted` ON → blocked; with `actor:'user:123'` both switches ON → NOT blocked (kill switches gate system actors only).
7. **Lock contention:** `acquireSemaphore` returns failure → user actor gets typed "another change in progress" error (Thai); system actor path resolves as a skip result + log (no throw). Assert lock key `social-ads-lock:{targetId}` and TTL 60.
8. **Credits:** on `ok` for a user actor, `deductCredits` called exactly once with `idempotencyKey === 'social-ads-action:' + actionLogId`, `sourceType:'social_ads'`, amount from mocked system-settings rate (and default 1 when unset). System actors → never charged.
9. **Payload hygiene:** `requestPayload`/`graphResponse` passed through `sanitizeForActionLog` before insert/update (spy assertion); read-cache `invalidateEntity` called after finalize; audit event emitted.

### 2. `server/services/social/__tests__/adsMutationService.test.ts` (node)

Mock the `AdsProvider` (all mutation methods as `vi.fn()`), connection/account cache (with `minimum_budgets` fixture), settings + org-cap readers, drizzle for `socialAdsCreativeAssets`/`socialAdsDrafts`.

1. **Campaign create:** missing `special_ad_categories` → validation error (Thai); explicit `[]` passes; input `status:'ACTIVE'` → provider receives `status:'PAUSED'` regardless; non-ODAX objective (`LINK_CLICKS`) → error; ODAX `OUTCOME_TRAFFIC` passes.
2. **Ad set create:** invalid `optimization_goal`/`billing_event` combo → error; valid goal defaults/accepts `IMPRESSIONS`; `lifetime_budget` without `end_time` → error; missing `targeting.geo_locations` → error; budget below the account's `minimum_budgets` for its currency (fixture) → error with Thai message.
3. **Budget ceiling:** effective cap = `min(userMax=50000, orgCap)`; amount over cap without `confirmationText` → error; with `confirmationText:"ยืนยันเพิ่มงบ"` → passes and the flag lands in the action payload; lowering below cap needs nothing.
4. **Special-ad-category enforcement:** category declared (e.g. `HOUSING`) + targeting containing forbidden narrowing (age range ≠ default, gender, restricted detailed targeting) → stripped or rejected server-side per field policy; assert the payload reaching the provider contains none of the forbidden narrowing.
5. **Optimistic concurrency:** `expectedUpdatedTime` stale vs the re-read entity → `CONFLICT`-shaped error carrying fresh `updatedTime`; same call with `override:true` proceeds; matching timestamp proceeds without override.
6. **Wizard chain partial failure:** `submitWizard` with a draft — campaign create succeeds, adset create rejects → draft row's `wizardState.createdObjectIds.campaignId` persisted; a second `submitWizard` on the same draft does NOT call `provider.createCampaign` again (spy call count stays 1) and resumes at adset.
7. **Creative asset cache:** first `uploadCreativeAsset` for `(adAccountId, mediaAssetRef)` calls `provider.uploadAdImage` and inserts a cache row; second call for the same pair returns the cached `metaImageHash` with NO provider upload call.
8. **Creative spec:** `object_story_spec` with zero or two of `link_data|video_data|photo_data` → error; boost path builds `object_story_id === "{pageId}_{postId}"`.

### 3. `server/routers/__tests__/socialAds.mutations.test.ts` (node, createCaller)

Mock `adsActionService`/`adsMutationService` at module boundary; reuse Section 07's feature-flag/connection/ownership mock setup.

1. **Gates (parameterized over every mutation procedure):** flag off → `FORBIDDEN`; no connection → `PRECONDITION_FAILED`; foreign `act_`/entity id → `FORBIDDEN` via `resolveOwnedAccount`/`assertEntityLineage` BEFORE any service call.
2. **Rate limit wiring:** `createRateLimitMiddleware` invoked with `{namespace:"social-ads-mutation", limit:60, windowMs:3_600_000}` for mutation procedures (read namespace unchanged).
3. **`getCapabilities` flip:** with an active connection whose `grantedScopes` includes `ads_management` → `{mutationsAvailable:true}`; scope missing → `false` (UI stays disabled).
4. **Drafts:** `saveDraft` upserts per `(userId, tenantId, adAccountId)` scope; `getDraft` returns wizardState+step; `deleteDraft` removes; drafts of another user are unreachable (ownership).
5. **Hygiene canary:** serialized responses of `getAdPreview`, `listPagePostsForBoost`, `saveDraft` contain no `EAA`/`access_token` substrings.

### 4. `client/src/components/socialAds/__tests__/CampaignWizard.test.tsx` (jsdom)

Mock tRPC hooks (`useSocialAds` mutation wrappers).

1. **Review step payload summary:** advancing to step 4 renders the full summary (objective, budget via `formatMoney`, schedule, targeting, creative source) — assert the exact-payload summary block exists (two-phase confirm rule).
2. **Sandboxed preview:** the preview element is an `<iframe>` with `sandbox` attribute equal to `allow-scripts`; component source assertion: no `dangerouslySetInnerHTML` used for preview HTML (render the preview fixture and assert it is NOT in the document body outside the iframe).
3. **Resume prompt:** when `getDraft` returns a draft, the wizard offers resume and restores `step`; partial-failure draft (with `createdObjectIds.campaignId`) shows the "resuming from ad set" notice and step-1 fields are locked.
4. **Special-category client mirror:** declaring a special category disables the forbidden targeting inputs in `StepAdSet` (server remains the authority — this is UX only).
5. **Autosave:** advancing a step fires `saveDraft` with the current `wizardState` and `step`.

All four files must be red before implementation. Section is done only when they pass, the full `cd apps/web && pnpm test` suite is green, and `pnpm check` is clean on new files.

---

## Implementation

### 1. `adsActionService.ts` — the mutation choke point

```ts
export type AdsActor = `user:${string}` | "system:guard" | "system:optimizer";

export interface ExecuteAdsActionInput<T = unknown> {
  userId: number;
  tenantId: string;
  connectionId: number;
  adAccountId: string;
  action: string;               // e.g. "create_campaign", "update_budget", "mutate_status"
  targetLevel: "account" | "campaign" | "adset" | "creative" | "ad";
  targetId: string;             // ad-account id for creates, entity id otherwise
  requestPayload: unknown;      // sanitized+truncated before insert
  actor: AdsActor;
  execute: () => Promise<T>;    // the actual provider call, injected by adsMutationService
}

export interface AdsActionResult<T> {
  outcome: "ok" | "skipped";    // "skipped" only for system actors on lock/kill-switch
  actionLogId?: number;
  result?: T;
}

/**
 * The ONLY path any ads mutation may take (user, guard, optimizer, advisor-apply).
 * Order: kill-switch (system actors) → dedupe (open pending|unknown for
 * (actor, action, targetId)) → per-entity lock → pending intent row →
 * execute() → finalize ok|error|unknown → credits (user actors, ok only) →
 * release lock → invalidateEntity → audit event.
 */
export async function executeAdsAction<T>(input: ExecuteAdsActionInput<T>): Promise<AdsActionResult<T>>;
```

Implementation notes:
- **Kill switches** (system actors only): read tenant `integrations/social_ads_automation_halted` + user `socialAdsSettings.automationHalted`; blocked → return `{outcome:"skipped"}` + audit log (never throw for jobs).
- **Dedupe** queries `socialAdsActionLog` for an open `pending|unknown` row matching `(actor, action, targetId)` → user actor: typed error "มีคำสั่งเดิมที่ยังไม่ทราบผล…" hinting to wait/reconcile; system actor: skip.
- **Lock:** `acquireSemaphore(redis, \`social-ads-lock:${targetId}\`, 1, 60)`; release in `finally`. Contention → user: typed Thai error; system: skip-and-log.
- **Unknown classification:** distinguish timeout/abort (`AbortError`, undici timeout shapes) from a definitive Graph error body — only the former finalizes `unknown`; a real error body is `error`. Never blindly re-execute after `unknown` (that is Section 13's reconciliation problem).
- **Credits:** rate = number from system_settings `integrations/social_ads_mutation_credit` (default 1); `deductCredits({ userId, amount, idempotencyKey: \`social-ads-action:${actionLogId}\`, sourceType: "social_ads", metadata: { traceId } })`. A credit failure AFTER Graph success must NOT roll back the mutation — log + audit, surface a warning field in the result.
- **traceId** convention: `social-ads-action:{actionLogId}` stored on the row; audit events `social_ads_action_*` reuse it.
- Payloads: always `sanitizeForActionLog(requestPayload)` / `sanitizeForActionLog(graphResponse)` before writes.

### 2. `adsMutationService.ts` — validation + provider orchestration

Stateless functions taking `{connection, account}` (from Section 07's `resolveOwnedAccount`) + validated input, building the provider payload, and delegating the actual call to `executeAdsAction` with an `execute` closure. Key exports (signatures only; each returns the provider DTO):

```ts
export const ODAX_OBJECTIVES = ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"] as const;
export const BUDGET_RAISE_CONFIRMATION = "ยืนยันเพิ่มงบ"; // same literal Section 05 uses

export async function createCampaign(ctx, input): Promise<CreatedEntityDTO>;   // forces status PAUSED
export async function createAdSet(ctx, input): Promise<CreatedEntityDTO>;
export async function createAdWithCreative(ctx, input): Promise<CreatedEntityDTO>; // creative + ad
export async function updateBudget(ctx, input): Promise<void>;                // Money, ceiling, concurrency
export async function updateSchedule(ctx, input): Promise<void>;
export async function renameEntity(ctx, input): Promise<void>;
export async function mutateStatus(ctx, input): Promise<void>;                // pause/resume
export async function duplicateEntity(ctx, input): Promise<CreatedEntityDTO>;
export async function archiveEntity(ctx, input): Promise<void>;               // soft delete — Meta archives
export async function uploadCreativeAsset(ctx, input): Promise<{imageHash?: string; videoId?: string}>; // cache-first
export async function submitWizard(ctx, draftId): Promise<WizardSubmitResult>; // chained create w/ resume
```

Validation internals (helpers, unit-tested directly):
- `validateCampaignInput` — ODAX check, `special_ad_categories` present (array, `[]` ok), CBO-XOR-adset budget mode, force `status:"PAUSED"`.
- `validateAdSetInput` — goal/billing table (constant map: goal → allowed billing events, default+almost-always `IMPRESSIONS`), `Money` budget ≥ account `minimum_budgets` entry for `account.currency`, lifetime→`end_time`, `targeting.geo_locations` required, `bid_strategy` default `LOWEST_COST_WITHOUT_CAP`, schedule times in account timezone via `accountTime`.
- `enforceSpecialCategoryTargeting(categories, targeting)` — returns a stripped targeting object + list of removed fields (surfaced as a warning in the response); hard-reject only when stripping would leave targeting invalid.
- `assertBudgetCeiling({amount: Money, userSettings, orgCap, confirmationText?})` — `min()` of caps; over-cap without the literal `BUDGET_RAISE_CONFIRMATION` → typed error; over-cap WITH confirmation → mark `budgetCeilingOverride: true` into the action payload.
- `assertNoDrift(ctx, entityId, expectedUpdatedTime, override?)` — provider re-read (cheap `?fields=updated_time`), drift without override → error carrying `{ conflict: true, currentUpdatedTime }` which the router maps to `TRPCError CONFLICT`.

**Creative paths:**
- Boost: `listPagePostsForBoost` reads Page posts through the existing `socialPages` page-token path (Section 11 adds the Publishing-side button; the picker itself lives here); creative payload uses `object_story_id = \`${pageId}_${postId}\``.
- New creative: resolve media-library asset → check `socialAdsCreativeAssets` on `(adAccountId, mediaAssetRef)` → hit: reuse `metaImageHash`/`metaVideoId`; miss: `provider.uploadAdImage/uploadAdVideo` then insert cache row (race-safe: on unique-violation, re-read). `object_story_spec` must contain EXACTLY ONE of `link_data|video_data|photo_data` (Zod refine).

**Wizard chain (`submitWizard`):** campaign → adset → creative → ad, each step through `executeAdsAction` (separate intent rows, `action` values `create_campaign|create_adset|create_creative|create_ad`). After EACH success, persist the created id into the draft's `wizardState.createdObjectIds {campaignId?, adSetId?, creativeId?}` (write-through, not end-of-chain). On failure mid-chain: earlier objects remain PAUSED, the error response tells the user which step failed, the draft survives. Resume: `submitWizard` skips any step whose id is already recorded (never re-creates). On full success: delete the draft, return all ids.

### 3. Router extension (`server/routers/socialAds.ts`)

Append mutation procedures, each `.use(createRateLimitMiddleware({namespace:"social-ads-mutation", limit:60, windowMs:3_600_000}))`, each running `assertAdsEnabled` → `resolveOwnedAccount` → `assertEntityLineage` (for entity-scoped ops) before touching the services. Zod inputs live in `shared/socialAds/mutationSchemas.ts` so the wizard reuses them client-side.

Procedures: `createCampaign`, `createAdSet`, `createAd`, `submitWizard`, `updateBudget`, `updateSchedule`, `renameEntity`, `mutateStatus`, `duplicateEntity`, `archiveEntity`, `saveDraft`, `getDraft`, `deleteDraft`, `uploadCreativeAsset`, `getAdPreview`, `searchTargeting`, `listPagePostsForBoost`.

- Actor for all router mutations: `` `user:${ctx.user.id}` ``.
- `getAdPreview` returns the raw preview HTML strings from `provider.getPreviews` — DTO field named `previewHtml`; the client renders it only via iframe `srcDoc`.
- `searchTargeting` is a read but lives under the mutation namespace budget? No — keep it on the READ rate limit (`social-ads-read`): it fires per keystroke in the autocomplete (debounced client-side, ≥300ms).
- Flip `getCapabilities` → `{ mutationsAvailable: boolean }` computed from active connection + `ads_management` in `grantedScopes`.
- All provider errors → `resolveAdsError` → TRPCError with `userMessageTh`; drift errors → `CONFLICT` code with `currentUpdatedTime` in `cause`/data.

### 4. Wizard UI (`CampaignWizard.tsx` + `wizard/*`)

Modal (Radix Dialog) with 4 steps, state in one `wizardState` object mirroring `mutationSchemas` types:

1. **StepObjective:** objective radio (6 ODAX cards, Thai labels), budget mode (CBO daily/lifetime vs ad-set), special-ad-categories multi-select with explainer copy, campaign name.
2. **StepAdSet:** budget input (`formatMoney` display, minor-unit state — never floats), schedule pickers labeled with the ACCOUNT timezone, targeting builder (geo search, age/gender, detailed-targeting autocomplete via `searchTargeting` with 300ms debounce, existing-audience picker, placements auto/manual toggle). Special category declared in step 1 → forbidden controls disabled with tooltip (server re-validates).
3. **StepCreative:** source toggle — boost existing post (picker fed by `listPagePostsForBoost`) vs new creative (media-library picker → `uploadCreativeAsset`); primary text/headline/description/CTA enum/destination URL; preview button → `getAdPreview` → `<iframe sandbox="allow-scripts" srcDoc={previewHtml} />`.
4. **StepReview:** full payload summary (two-phase rule) + PAUSED-on-create notice + confirm → `submitWizard`.

Behaviors: autosave `saveDraft` on every step advance (debounced); on open, `getDraft` → resume prompt; partial-failure resume banner when `createdObjectIds` non-empty (earlier steps rendered read-only); on success, invalidate `useCampaigns`/`useAdsOverview` query keys and toast. Guarded localStorage only for trivial UI prefs (safe-storage try/catch idiom) — wizard state itself is server-side.

### 5. Mutation components (`mutations/*`) + tab wiring

`BudgetEditor` (Money input, ceiling confirm dialog reusing the `"ยืนยันเพิ่มงบ"` literal, passes `expectedUpdatedTime`, CONFLICT → "ข้อมูลเปลี่ยนไปแล้ว" dialog offering refresh or override), `StatusToggle` (pause/resume with confirm on resume), `DuplicateDialog`, `RenameDialog`, `ArchiveConfirm`. Wire into `CampaignsTab` rows — the Section 07 affordances flip from disabled automatically once `getCapabilities().mutationsAvailable` is true; no structural UI rework. After every mutation: invalidate the affected `useSocialAds` query keys.

### 6. Hooks (`useSocialAds.ts`)

Add `useCreateCampaignWizard` (draft CRUD + submit), `useUpdateBudget`, `useMutateStatus`, `useDuplicateEntity`, `useArchiveEntity`, `useRenameEntity`, `useUpdateSchedule`, `useTargetingSearch(query)`, `useAdPreview`, `usePagePostsForBoost` — thin `trpc.socialAds.*` wrappers with per-mutation `onSuccess` invalidation. Mutations must NOT be auto-retried by the client resilience layer beyond its network-only policy (the intent-row dedupe is the backstop either way).

## Explicitly out of scope (later sections)

- Guard/optimizer callers of `executeAdsAction` → Sections 09/10 (this section only guarantees the `actor`/skip semantics they need).
- `pending|unknown` reconciliation alerts + draft/action-log retention → Section 13.
- Boost-post entry button in SocialPublishing + ads badge in Moderation → Section 11.
- Advisor "นำไปใช้" apply path → Section 12.
- Custom audience creation/upload, lead forms, catalog/DPA, A/B tests → v2 (spec §6.2).

## Acceptance checklist

- [ ] All four test files written first, initially red, now green; full `pnpm test` green; `pnpm check` clean on new files.
- [ ] Every mutation (router or future system caller) flows through `executeAdsAction`; no direct provider mutation call exists outside `adsMutationService`'s `execute` closures.
- [ ] Intent row inserted `pending` before every provider call; `ok|error|unknown` finalization correct; `unknown` never charges credits and never auto-retries.
- [ ] Credit deduction only after Graph success, idempotency-keyed `social-ads-action:{actionLogId}`, rate from system_settings (default 1).
- [ ] Campaign creates always land PAUSED; `special_ad_categories` mandatory; ODAX-only; budget minimums + `min(user, org)` ceiling + typed confirmation enforced; special-category targeting stripped server-side; stale `expectedUpdatedTime` → CONFLICT unless override.
- [ ] Wizard: server drafts autosaved per step, resume works, partial failure resumes without re-creating recorded objects, review step shows the full payload summary.
- [ ] Creative cache prevents duplicate uploads per `(adAccountId, mediaAssetRef)`; previews render only in sandboxed iframes; no `dangerouslySetInnerHTML` anywhere in new files.
- [ ] Action-log payloads sanitized + ≤8KB; hygiene canary green (no token-shaped strings in DTOs, drafts, or logs); read cache invalidated after every mutation; new i18n keys registered in `SOCIAL_ADS_I18N_KEYS` + both locale files.