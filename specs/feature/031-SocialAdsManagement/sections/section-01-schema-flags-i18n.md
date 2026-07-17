# Section 01 — Database Schema + Migration + Feature Flag + i18n Scaffolding

**Section id:** `section-01-schema-flags-i18n`
**Feature:** 031-SocialAdsManagement (Facebook/Meta Ads suite inside the Social module family)
**Rollout phase:** P1 (foundation — required before nearly everything else)
**Working directory:** `apps/web/` (all paths below are relative to it unless absolute)

## Purpose

Create every persistence and configuration foundation the rest of the feature builds on:

1. **11 new Drizzle tables** in `drizzle/schema.ts` + generated migration.
2. **`SOCIAL_ADS_ENABLED` premium tenant feature flag** (default **false** — premium means explicitly enabled; NO fallback to `META_CHANNELS_ENABLED`).
3. **`system_settings` keys** for tenant-level Meta app credentials and ads governance.
4. **th/en i18n key families** (`ads.*` in `social.json`, `socialMenu.ads` in `dashboard.json`).

No services, routers, or UI in this section. Later sections that consume these artifacts: 03 (worker tables), 04/05 (connections + settings), 08 (action log, drafts, creative assets), 09 (entity state, snapshots, rules, cooldowns), 10 (rules, cooldowns), 11 (page insight snapshots), 12 (advisor reports), 13 (retention purges).

## Dependencies

- **Depends on:** nothing (Batch 1; parallelizable with section-02-shared-primitives).
- **Blocks:** sections 03, 04, 07, and transitively almost all others.

## Files

| Action | Path |
|---|---|
| Modify | `drizzle/schema.ts` — append new tables at the END of the social block (after `socialPages` etc.; social block starts ~line 18012 with `socialProviderConnections`) |
| Generate | `drizzle/0213_social_ads.sql` (expected tag — **verify**, see Migration below) + `drizzle/meta/_journal.json` entry |
| Modify | `shared/featureFlags.ts` — three spots (interface `:8`, `ALLOWED_FEATURE_FLAGS` `:217`, `FEATURE_FLAG_DEFAULTS` `:425`) |
| Modify | `server/routers/systemSettings.ts` — register the new `integrations/*` keys (see below) |
| Modify | `client/src/locales/th/social.json`, `client/src/locales/en/social.json` |
| Modify | `client/src/locales/th/dashboard.json`, `client/src/locales/en/dashboard.json` |
| Create | `client/src/lib/socialAdsI18nKeys.ts` — static key-list constant used by the i18n completeness test |
| Create (tests) | `drizzle/__tests__/socialAdsSchema.test.ts`, `shared/__tests__/featureFlagsSocialAds.test.ts`, `client/src/locales/__tests__/socialAdsI18n.test.ts` |

Vitest config already includes `drizzle/**/*.test.ts`, `shared/**/*.test.ts`, and `client/src/**/*.test.ts` (see `vitest.config.ts:37-46`), so these test locations run without config changes.

## Tests FIRST (write before implementation; Vitest, no DB, no network)

Per `claude-plan-tdd.md` §01. All three test files must fail (or fail to compile) before implementation and pass after.

### 1. `drizzle/__tests__/socialAdsSchema.test.ts` — type-level schema smoke

- Import all 11 table objects + their exported `$inferSelect` types from `../schema`.
- For each table, assert (via `expectTypeOf` from vitest, or plain typed-assignment compile checks) that the select type includes the expected load-bearing columns. Minimum column presence to assert per table:
  - `socialAdsConnections`: `encryptedAccessToken`, `encryptedAppSecret`, `tokenAppId`, `tokenHint`, `tokenExpiresAt`, `grantedScopes`, `adAccounts`, `defaultAdAccountId`, `status`
  - `socialAdsSettings`: `maxDailyBudgetMinor`, `currency`, `automationHalted`, `notificationPrefs`
  - `socialAdsAutomationRules`: `ruleType`, `metric`, `window`, `operator`, `threshold`, `action`, `actionParams`, `cooldownHours`, `approveFirst`, `enabled`, `dryRun`, `consecutiveHits` — and assert (type-level) there is **no** `lastFiredAt` key (cooldown ledger owns firing history)
  - `socialAdsCooldowns`: `targetId`, `action`, `lastFiredAt`
  - `socialAdsActionLog`: `actor`, `action`, `targetLevel`, `targetId`, `intentStatus`, `requestPayload`, `graphResponse`, `traceId`, `finalizedAt`
  - `socialAdsEntityState`: `connectionId`, `entityLevel`, `entityId`, `effectiveStatus`, `issuesInfo`
  - `socialAdsMonitorSnapshots`: `fromStatus`, `toStatus`, `issuesInfo`, `detectedAt`
  - `socialAdsDrafts`: `wizardState`, `step`
  - `socialAdsCreativeAssets`: `mediaAssetRef`, `metaImageHash`, `metaVideoId`
  - `socialPageInsightSnapshots`: `pageId`, `snapshotDate`, `metrics`, `postMetrics`
  - `socialAdvisorReports`: `subjectType`, `subjectId`, `skillName`, `factsSnapshot`, `report`, `modelUsed`, `creditsCharged`, `traceId`
- Runtime assertion example (keeps the test non-empty at runtime): each imported table object is defined and `insert` types accept a minimal valid row shape.

### 2. `shared/__tests__/featureFlagsSocialAds.test.ts` — premium flag wiring

- `ALLOWED_FEATURE_FLAGS.has("SOCIAL_ADS_ENABLED")` is `true`.
- `FEATURE_FLAG_DEFAULTS.SOCIAL_ADS_ENABLED === false` (premium default-off; contrast: `META_CHANNELS_ENABLED` default is `true` — do NOT copy that).
- Type-level: `TenantFeatureFlags` has a `SOCIAL_ADS_ENABLED: boolean` member.

### 3. `client/src/locales/__tests__/socialAdsI18n.test.ts` — translation completeness

- Import `SOCIAL_ADS_I18N_KEYS` (social.json namespace keys) and `SOCIAL_ADS_DASHBOARD_KEYS` (dashboard.json keys) from `@/lib/socialAdsI18nKeys`.
- Import all four JSON files directly (`import thSocial from "../th/social.json"` etc. — locale JSONs are **flat dotted-key maps**, e.g. `"channels.title": "..."`, not nested objects).
- For every key in each list: assert the key exists in BOTH th and en files and its value is a non-empty string.
- Assert `SOCIAL_ADS_DASHBOARD_KEYS` contains `"socialMenu.ads"` and both dashboard files define it (th: `"จัดการโฆษณาโซเชียล"`, en: `"Social Ads"`).
- This guards against missing-translation runtime fallbacks: later sections (05, 07, 08, 09, 11, 12) MUST add any new `ads.*` key to `SOCIAL_ADS_I18N_KEYS` when they add strings.

Migration application itself is verified by the phase-gate `pnpm db:push` + psql table-existence check, **not** by unit tests.

## Implementation

### 1. Drizzle tables (`drizzle/schema.ts`)

**Follow the existing social-block conventions exactly** (template: `socialProviderConnections` / `socialPages` at `schema.ts:18012-18092`):

- `pgTable("snake_case_table_name", {...}, t => [indexes])` with **quoted camelCase column names** (e.g. `varchar("tokenAppId", { length: 50 })`). The spec §11 DDL sketch is written in snake_case logical names — translate to camelCase column names per codebase convention; the snake_case names below are the *table* names only.
- `id: serial("id").primaryKey()`.
- **FK types — IMPORTANT, the plan text is wrong here; the codebase wins:** `users.id` is `serial` (integer) and `tenants.id` is `varchar(36)`. So: `userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" })` and `tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })` — exactly like `socialProviderConnections`.
- `json("...").$type<...>()` for JSON columns; `timestamp("...", { withTimezone: true })`; `createdAt`/`updatedAt` with `.defaultNow().notNull()`.
- Index names prefixed `idx_social_ads_*` / `idx_social_page_*` / `idx_social_advisor_*`; unique indexes via `uniqueIndex(...)`.
- Export `type X = typeof x.$inferSelect; type InsertX = typeof x.$inferInsert;` after each table.
- Append the whole group at the end of the social block with a `// ===== Social Ads Management (031) =====` banner comment.

Authoritative column lists (from spec.md §11; status/enum values as varchar with the documented value sets in a doc comment):

1. **`social_ads_connections`** (`socialAdsConnections`) — userId, tenantId, `provider varchar(30) notNull default 'meta_ads'`, `encryptedAccessToken text` (NULLed on disconnect — hard delete), `appId varchar(50)`, `encryptedAppSecret text` (NULLed on disconnect), `tokenAppId varchar(50)` (app that minted the token, from `debug_token` — gates exchange/appsecret_proof), `tokenHint varchar(8)`, `tokenExpiresAt`, `grantedScopes json $type<string[]>`, `adAccounts json $type<Array<{id: string; name: string; currency: string; timezone_name: string; account_status: number; minimum_budgets?: unknown}>>` (replaced wholesale on refresh, never appended), `defaultAdAccountId varchar(30)`, `status varchar(20) notNull default 'active'` (`active|expired|invalid|revoked|disabled`), `lastVerifiedAt`, `lastError text`, createdAt/updatedAt. Unique `(userId, tenantId, provider)`; index `(userId)`; index `(tenantId, status)`. **No** `encrypted_system_user_token` column (removed from v1 by arch finding 29).
2. **`social_ads_settings`** (`socialAdsSettings`) — userId, tenantId, `maxDailyBudgetMinor bigint` (Drizzle `bigint("maxDailyBudgetMinor", { mode: "number" })`) **default 50000** = ฿500/day (interview decision; NOT the spec's ฿1,000), `currency varchar(3)`, `automationHalted boolean default false`, `notificationPrefs json`, timestamps. Unique `(userId, tenantId)`.
3. **`social_ads_automation_rules`** (`socialAdsAutomationRules`) — userId, tenantId, `adAccountId varchar(30)`, `ruleType varchar(30)` (`guard|optimize`), `scope json`, `metric varchar(20)`, `window varchar(10)`, `operator varchar(4)`, `threshold numeric`, `action varchar(30)`, `actionParams json` (strict Zod union validated at write+execute in later sections), `cooldownHours int default 24`, `approveFirst boolean default false`, `enabled boolean default false`, `dryRun boolean default true`, `consecutiveHits int default 1` (research amendment #10), timestamps. Index `(userId, tenantId, enabled)`; index `(adAccountId, enabled)`. **NO `lastFiredAt` column** — the cooldown ledger owns firing history.
4. **`social_ads_cooldowns`** (`socialAdsCooldowns`) — userId, tenantId, `adAccountId varchar(30)`, `targetId varchar(40)`, `action varchar(30)`, `lastFiredAt timestamp notNull`. Unique `(userId, adAccountId, targetId, action)` (rule-independent — survives rule delete+recreate); index `(lastFiredAt)`.
5. **`social_ads_action_log`** (`socialAdsActionLog`) — userId, tenantId, `adAccountId varchar(30)`, `actor varchar(40)` (`user:<id>|system:guard|system:optimizer`), `action varchar(40)`, `targetLevel varchar(10)`, `targetId varchar(40)`, `intentStatus varchar(10) notNull` (`pending|ok|error|unknown` — idempotency/reconciliation anchor), `requestPayload json`, `graphResponse json` (both sanitizer-passed + 8KB-truncated BEFORE insert — enforced by section 08, documented in a column comment here), `errorMessage text`, `traceId varchar(64)`, `createdAt`, `finalizedAt timestamp`. Index `(userId, tenantId, createdAt)`; index `(targetId)`; index `(traceId)`. Immutable; retained 2 years then archived (section 13); **user FK must NOT cascade-delete audit rows on disconnect** — disconnect only nulls connection secrets. (User row deletion cascading is acceptable/consistent with the rest of the schema; connection deletion never touches this table because it has no connection FK.)
6. **`social_ads_entity_state`** (`socialAdsEntityState`) — `connectionId integer notNull references socialAdsConnections.id cascade`, `adAccountId varchar(30)`, `entityLevel varchar(10)`, `entityId varchar(40)`, `effectiveStatus varchar(30)`, `issuesInfo json`, `updatedAt`. Unique `(connectionId, entityId)`; index `(adAccountId)`.
7. **`social_ads_monitor_snapshots`** (`socialAdsMonitorSnapshots`) — `connectionId` FK cascade, `adAccountId`, `entityLevel`, `entityId`, `fromStatus varchar(30)`, `toStatus varchar(30)`, `issuesInfo json`, `detectedAt timestamp`. Index `(connectionId, detectedAt)`; index `(entityId)`. Transitions only; 90-day retention (section 13).
8. **`social_ads_drafts`** (`socialAdsDrafts`) — userId, tenantId, `adAccountId varchar(30)`, `wizardState json` (will hold `createdObjectIds {campaignId?, adSetId?, creativeId?}` for partial-failure resume — section 08), `step int`, timestamps. Index `(userId, tenantId, updatedAt)`; purge >30d (section 13).
9. **`social_ads_creative_assets`** (`socialAdsCreativeAssets`) — userId, tenantId, `adAccountId varchar(30)`, `mediaAssetRef varchar(255)`, `metaImageHash varchar(64)`, `metaVideoId varchar(40)`, `createdAt`. Unique `(adAccountId, mediaAssetRef)`.
10. **`social_page_insight_snapshots`** (`socialPageInsightSnapshots`) — `connectionId` FK cascade (references `socialAdsConnections`), `pageId varchar(40)`, `snapshotDate date` (Drizzle `date("snapshotDate")`), `metrics json`, `postMetrics json`, `createdAt`. Unique `(pageId, snapshotDate)`; index `(connectionId, snapshotDate)`. 13-month retention.
11. **`social_advisor_reports`** (`socialAdvisorReports`) — userId, tenantId, `subjectType varchar(20)` (`page|ad_account|campaign`), `subjectId varchar(40)`, `skillName varchar(80)` (`social-page-advisor|social-ads-advisor`), `factsSnapshot json` (metrics only, never tokens), `report json` (spec §18.4 schema), `modelUsed varchar(80)`, `creditsCharged numeric`, `traceId varchar(64)`, `createdAt`. Index `(userId, tenantId, subjectType, subjectId, createdAt)`. 1-year retention.

### 2. Migration (Database Safety Protocol applies)

All-new tables → **Low risk (ADD only)**, but the lineage caveat is critical:

1. **Verify the next migration number first.** Current journal head is `0211_vertical_drama_shot_references`; project memory records a reserved/never-run `0212_consolidated` baseline (lineage repaired 2026-07-16; the migrator orders by `created_at`, not hash). Inspect `drizzle/meta/_journal.json` and the `drizzle/` dir at implementation start — expected generated tag is `0213_social_ads` (or whatever drizzle-kit assigns after the reserved slot). **Never run/regenerate the 0212_consolidated SQL.**
2. Baseline: capture row counts of neighboring social tables (`social_provider_connections`, `social_pages`, `social_posts`) via psql into a note; `mkdir -p .db-backups` (no data backup needed for pure ADDs, counts suffice).
3. Run `cd apps/web && pnpm db:push` (generate + migrate). If migrate fails, apply the SQL manually and seed the journal/migrations table per project protocol.
4. Verify: all 11 tables exist (`\dt social_ads_*` etc.), neighbor row counts unchanged, `drizzle/meta/_journal.json` has the new entry.

### 3. Feature flag (`shared/featureFlags.ts`)

Add `SOCIAL_ADS_ENABLED` in three spots, following the existing `META_CHANNELS_ENABLED` member style (SCREAMING_SNAKE key):

- Interface `TenantFeatureFlags` (~`:8`, insert near `META_CHANNELS_ENABLED: boolean;` at `:47`): `SOCIAL_ADS_ENABLED: boolean; // F40 — Social Ads Management (premium, per-tenant)` (use the next free F-number in the file).
- `ALLOWED_FEATURE_FLAGS` set (`:217`, entry near `:256`).
- `FEATURE_FLAG_DEFAULTS` (`:425`): `SOCIAL_ADS_ENABLED: false` — **default false is the premium entitlement contract**; admins enable per tenant in the existing tenant-flags UI (which auto-picks up flags from this trio — no UI work needed here).

Server-side enforcement (later sections) calls the Redis-backed `getTenantFeatureFlag("SOCIAL_ADS_ENABLED", tenantId)` from `server/services/featureFlags.ts:79`. No fallback to `META_CHANNELS_ENABLED`. Nothing to change in `server/services/featureFlags.ts` — it is key-agnostic.

### 4. `system_settings` keys (`server/routers/systemSettings.ts`)

Register these keys under category `integrations`, following the encrypt-on-write (`:1327-1350` idiom — `encrypt()` from `server/services/crypto.ts` when `sensitive: true`) and mask-on-read (`:1267-1284` idiom — return `"****"...` + `*Configured: true`, never the value) patterns:

| Key | Sensitive | Default / notes |
|---|---|---|
| `meta_ads_app_id` | no | tenant-fallback Meta App ID (plaintext, not secret) |
| `meta_ads_app_secret` | **yes** | encrypt-on-write, masked read (`metaAdsAppSecretConfigured: true` + hint) |
| `social_ads_mutation_credit` | no | default `"1"` — flat platform credits per ads mutation (read by section 08) |
| `social_ads_automation_halted` | no | tenant-level ads kill switch, `"false"` default (read by sections 08–10) |
| `social_ads_org_daily_cap` | no | optional Money JSON `{currency, amountMinor}` — org budget ceiling (sections 08/10) |

Concretely: add a `getSocialAdsIntegrationSettings` admin query + `updateSocialAdsIntegrationSettings` admin mutation (or extend the existing integrations get/update procedures if one already covers the `integrations` category — check before adding new procedures) with signatures/stubs only mirroring `updateOAuthSettings` (`:1295`). Decrypted `meta_ads_app_secret` reads happen only server-side inside `socialAdsConnectionService` (section 04) via the settings service — never through tRPC output.

### 5. i18n scaffolding

Locale JSONs are **flat maps with dotted keys**. Seed both languages; Thai copy is primary, English is a faithful translation. Add to `client/src/locales/{th,en}/social.json` the `ads.*` families (seed at minimum the keys below; later sections extend):

- `ads.menu` — "จัดการโฆษณาโซเชียล" / "Social Ads"
- `ads.tabs.overview`, `ads.tabs.campaigns`, `ads.tabs.issues`, `ads.tabs.insights`, `ads.tabs.automation`, `ads.tabs.pages`, `ads.tabs.advisor`
- `ads.connection.title`, `ads.connection.notConnected`, `ads.connection.connectHint` (directs to Settings → integrations), `ads.connection.statusActive`, `ads.connection.statusExpired`, `ads.connection.statusInvalid`, `ads.connection.statusDisabled`, `ads.connection.expiresIn`, `ads.connection.reconnect`
- `ads.wizard.title`, `ads.wizard.stepObjective`, `ads.wizard.stepAdSet`, `ads.wizard.stepCreative`, `ads.wizard.stepReview`, `ads.wizard.confirmBudgetPhrase` — value MUST be exactly `"ยืนยันเพิ่มงบ"` in BOTH files (server compares this literal; section 08)
- `ads.issues.title`, `ads.issues.empty`
- `ads.automation.title`, `ads.automation.dryRun`, `ads.automation.guard`, `ads.automation.optimize`
- `ads.pages.title`, `ads.pages.analyze`
- `ads.advisor.title`, `ads.advisor.run`, `ads.advisor.estimatedCost`
- `ads.errors.featureDisabled` (premium not enabled for tenant), `ads.errors.noConnection` (Thai message linking Settings — used by `PRECONDITION_FAILED`), `ads.errors.tokenExpired`, `ads.errors.generic`

Add to `client/src/locales/{th,en}/dashboard.json` (flat keys, near the existing `socialMenu.*` block at th `:557`): `"socialMenu.ads": "จัดการโฆษณาโซเชียล"` / `"Social Ads"`.

Create `client/src/lib/socialAdsI18nKeys.ts`:

```ts
/** Static key registry for the ads.* i18n families. Every user-facing
 *  string added by sections 05/07/08/09/11/12 MUST be appended here so
 *  the completeness test guards th/en parity. */
export const SOCIAL_ADS_I18N_KEYS: readonly string[] = [/* all ads.* keys above */];
export const SOCIAL_ADS_DASHBOARD_KEYS: readonly string[] = ["socialMenu.ads"];
```

## Verification / Definition of Done

1. New tests written first and initially red; then green: `cd apps/web && pnpm vitest run drizzle/__tests__/socialAdsSchema.test.ts shared/__tests__/featureFlagsSocialAds.test.ts client/src/locales/__tests__/socialAdsI18n.test.ts`
2. `pnpm check` clean (no new type errors beyond the pre-existing baseline).
3. `pnpm db:push` applied; all 11 tables exist in psql; journal updated with the new tag; neighbor row counts unchanged; **schema.ts is never left un-migrated**.
4. Full suite `pnpm test` green.
5. `SOCIAL_ADS_ENABLED` visible in the admin tenant-flags UI (it auto-derives from the shared trio) with default OFF.

## Consistency notes for later sections

- Table/type export names used downstream: `socialAdsConnections`/`SocialAdsConnection`, `socialAdsSettings`, `socialAdsAutomationRules`, `socialAdsCooldowns`, `socialAdsActionLog`, `socialAdsEntityState`, `socialAdsMonitorSnapshots`, `socialAdsDrafts`, `socialAdsCreativeAssets`, `socialPageInsightSnapshots`, `socialAdvisorReports`.
- `userId` is **integer** (references `users.id serial`) across all these tables; `tenantId` is varchar(36). Downstream service signatures written as `(userId, tenantId)` must use `number` + `string`.
- Money is stored only as integer minor units (`maxDailyBudgetMinor`, org cap JSON) — the `Money` type itself lands in section 02 (`shared/socialAds/money.ts`); this section must not introduce any float money column.
- The ฿500 default = `50000` minor units lives ONLY in the `socialAdsSettings.maxDailyBudgetMinor` column default (and is asserted by section 05 tests).