# Section 10 — F05: optimizer engine + cooldown ledger + governance

**Section id:** `section-10-optimizer-governance`
**Rollout phase:** P3 (governance parts) + P4 (optimizer)
**Depends on:** `section-08-mutations-wizard` (`executeAdsAction` intent-row protocol, per-entity locks, budget cap validation helpers), `section-09-monitor-guards` (rule CRUD procedures `listRules`/`saveRule`/`toggleRule`/`deleteRule`, guard cooldown-ledger writes, Automation tab base UI, `socialHumanApprovals` approve-first routing)
**Blocks:** section-13 (observability/alerting references optimizer counters + runbooks)
**Parallelizable with:** section-12
**Working directory:** `apps/web/`
**Test command:** `cd apps/web && pnpm test`

---

## 1. Goal

Rule-based optimization that **cannot run away**. Deliverables:

1. `shared/socialAds/ruleSchemas.ts` — strict Zod discriminated-union schemas for `action_params`, validated at WRITE time and re-validated at EXECUTE time.
2. `server/services/social/adsOptimizerService.ts` — hourly per-connection executor: kill-switch checks → metric evaluation → Redis streak counters → cooldown ledger → per-entity lock → transactional re-read → dry-run or `executeAdsAction`.
3. Router extensions: dry-run report procedure + admin governance procedures (`forceDisableAdsConnection`, oversight aggregates).
4. Automation tab extensions: optimizer rule builder + dry-run report view.

## 2. Background context (self-contained)

- **Rule model** (table `social_ads_automation_rules`, created in section 01): `rule_type` `guard|optimize`; `scope` json (account/campaign/adset target selector); `metric` `cpa|cpm|ctr|frequency|roas|spend`; `window` `last_1d|last_3d|last_7d`; `operator` (`gt|lt|gte|lte`, varchar(4)); `threshold numeric`; `action varchar(30)`; `action_params json`; `cooldown_hours int DEFAULT 24`; `approve_first boolean`; `enabled boolean DEFAULT false`; `dry_run boolean DEFAULT true`; `consecutive_hits int DEFAULT 1`. There is deliberately **NO `last_fired_at` column** — cooldown state lives only in the ledger.
- **Cooldown ledger** (`social_ads_cooldowns`, section 01): keyed `UNIQUE (user_id, ad_account_id, target_id, action)` with `last_fired_at`. Rule-independent by design (sec finding 7): deleting + recreating an identical rule cannot reset cooldowns.
- **Actions:** `pause`, `notify`, `budget_increase_pct`, `budget_decrease_pct` (Money-typed min/max bounds **mandatory** in params), `reallocate_to_best` (within one campaign, shift pct of budget from below-threshold ad sets to the best performer).
- **Governance hierarchy (spec §10.1)** — checked top-down before every automated mutation:
  1. Tenant kill switch: `system_settings` key `integrations/social_ads_automation_halted` (boolean, tenant-scoped; registered in section 01).
  2. Per-user halt: `social_ads_settings.automation_halted`.
  3. Tenant org budget cap: `system_settings` key `integrations/social_ads_org_daily_cap` (Money json, optional) — bounds every user's effective `max_daily_budget`.
  4. Per-rule `enabled` + `dry_run` (lowest level).
- **Guard > optimizer precedence (D10):** the optimizer skips (and logs) any entity that has a cooldown-ledger entry written by a guard within that guard's cooldown window — ledger lookup **by target_id regardless of action**. It also skips entities whose per-entity Redis lock (`social-ads-lock:{entityId}`) is currently held (skip-and-log, never wait).
- **Provisional-data rule (arch finding 22):** conversion-dependent metrics (`cpa`, `roas`) are restatement-prone for ~28 days; the optimizer only acts on windows **≥ 3 days old** for conversion metrics. A conversion-metric rule configured with `window='last_1d'` is skipped (logged, never fired).
- **Streaks:** `consecutive_hits` requires the threshold to be met on N consecutive hourly evaluations. Counters live in Redis (`social-ads:streak:{ruleId}:{targetId}`, TTL = 2× the evaluation cadence window). Redis loss resets streaks — this only DELAYS firing, never fires early. A missed/failed evaluation (threshold not met) resets the counter.
- **Intent-row protocol (section 08):** every real mutation goes through `executeAdsAction({userId, tenantId, adAccountId, action, targetLevel, targetId, requestPayload, actor: "system:optimizer", execute})` — which itself re-asserts kill switches for system actors, takes the per-entity lock, writes the pending/ok/error/unknown action-log row, and handles lock contention as skip-and-log for jobs. Mutations are NEVER auto-retried.
- **Scheduling (section 03):** the `social:ads-optimize` queue + per-connection scheduler `social-ads:optimize:{connectionId}` (hourly, hash-staggered) already exist with a no-op-guarded processor dispatch. This section supplies the real processor. BullMQ payloads carry ids only (`{connectionId}`).
- **Insights access (section 06):** metric evaluation reads via `getAdsProvider("meta").getInsights(ctx, level, objectId, params)` with windows computed by `accountDayRange(timezoneName, preset)` from `shared/socialAds/accountTime.ts` — no `new Date()` day-bucketing. `ThrottleDeferred` from the BUC governor means "skip this cycle" (not a job failure).
- **Existing anchors:** notifications via `createNotification` (`server/services/notificationService.ts:292`) with `groupKey` dedup; audit via `logAuditEvent` (`server/services/auditLogger.ts`) using `social_ads_action` / `social_ads_guard_triggered` event types (section 01); Money math via `pctOfMinor(m, pct, {min, max})` from `shared/socialAds/money.ts` (section 02); admin role check idiom = existing admin-gated procedures in `server/routers.ts` (role `admin`/`domain_admin` on `ctx.user`).

## 3. Files

| File | Action |
|---|---|
| `shared/socialAds/ruleSchemas.ts` | EDIT — Section 09 creates this file with the guard schemas; this section EXTENDS it with the optimizer discriminated union + rule-write schema (single home for all rule `action_params` validation) |
| `shared/socialAds/ruleSchemas.test.ts` | NEW — schema unit tests |
| `server/services/social/adsOptimizerService.ts` | NEW — executor + cooldown ledger helpers + dry-run recording |
| `server/services/social/__tests__/adsOptimizerService.test.ts` | NEW |
| `server/workers/socialJobsWorker.ts` | EDIT — wire `social:ads-optimize` processor to `adsOptimizerService.runOptimizeCycle(connectionId)` |
| `server/routers/socialAds.ts` | EDIT — `getDryRunReport` procedure; admin procedures `forceDisableAdsConnection`, `getAdsOversight`; route `saveRule` validation through `ruleSchemas` (extends section 09's procedure) |
| `server/routers/__tests__/socialAdsGovernance.test.ts` | NEW — createCaller tests for admin procedures + dry-run report |
| `client/src/components/socialAds/automation/OptimizerRuleBuilder.tsx` | NEW — rule builder (Thai-first labels) |
| `client/src/components/socialAds/automation/DryRunReportView.tsx` | NEW — "would have done X because Y" report |
| Automation tab container (created by section 09 under `client/src/components/socialAds/`) | EDIT — mount builder + report view |
| `client/src/locales/{th,en}/social.json` | EDIT — fill `ads.automation.*` keys used here (family seeded in section 01) |

## 4. Tests FIRST (TDD)

Conventions: Vitest; `vi.hoisted` mock bag + `vi.mock` at module boundaries (idiom: `server/services/__tests__/socialDraftService.test.ts`); chainable drizzle mock (idiom: `creditService.test.ts:3-45`); routers via `router.createCaller({user, tenantId})` (idiom: `server/routers/__tests__/socialInbox.test.ts:56-70`); Redis mocked with an in-memory Map stub; no network, no test DB. Mock `executeAdsAction`, the `AdsProvider`, `createNotification`, system-settings reads, and the connection service. Write these tests before implementation; the section is done when they and the full suite pass.

### 4.1 `ruleSchemas.test.ts`

- `budget_increase_pct` / `budget_decrease_pct` params **without** `minBudget`/`maxBudget` Money bounds → parse rejected at write time; with bounds → accepted; bounds must be Money-shaped (`{currency, amountMinor: integer}`).
- Unknown extra key in any action's params → rejected (`.strict()` behavior).
- `pause` / `notify` accept empty params object only.
- `reallocate_to_best` requires `shiftPct` + Money bounds + implies campaign scope (schema-level refine).
- Discriminated union: params validated against the schema matching `action` — a `pause` blob under a `budget_increase_pct` action fails.

### 4.2 `adsOptimizerService.test.ts`

- **Kill switches:** tenant `integrations/social_ads_automation_halted=true` → cycle returns immediately, zero rule evaluations; user `automation_halted=true` → that user's rules skipped.
- **Streak:** rule with `consecutive_hits=3`; threshold met on evaluation 1 → no fire, Redis counter = 1 (TTL set to 2× window); met again → 2, no fire; met third consecutive time → fires; threshold NOT met in between → counter reset (next met evaluation starts at 1).
- **Cooldown ledger:** ledger row `(user, account, target, action)` with `last_fired_at` inside `cooldown_hours` → no fire; rule deleted + identical rule recreated (new `ruleId`) → STILL no fire (ledger is keyed without rule_id); after window elapses → fires and ledger `last_fired_at` updated.
- **Guard precedence:** entity has a ledger entry written by a guard (any action) inside the guard's cooldown → optimizer skips + logs; entity currently locked (`acquireSemaphore` mock returns contention) → skip-and-log, no throw.
- **Transactional re-read:** mock the `FOR UPDATE` re-read to return a rule row whose budget bounds were lowered between evaluation and execution → the NEW bounds win (asserted on the computed budget passed to `executeAdsAction`).
- **Re-validation failure:** stored `action_params` blob failing `.strict()` re-validation at execute time → rule set `enabled=false`, `createNotification` called once (`groupKey: "ads-rule-disabled:{ruleId}"`), NO action executed.
- **Budget bounds:** `budget_increase_pct` result = bounded by min(params.maxBudget, user `max_daily_budget`, org cap from system_settings) via `pctOfMinor`; assert the tightest cap wins in three permutations.
- **reallocate_to_best:** shifts only among ad sets of the SAME campaign; per-adset results respect Money bounds; never exceeds user/org caps.
- **Provisional rule:** `metric='cpa'` with `window='last_1d'` → evaluation skipped with a logged reason, no insights fetch for that rule.
- **Dry run:** `dry_run=true` rule that would fire → an action-log row is recorded with `action='dry_run:pause'` (prefix + real action), `intent_status='ok'`, `actor='system:optimizer'`, sanitized `request_payload` containing `{ruleId, metric, window, observedValue, threshold, wouldAction}`; the provider mutation and `executeAdsAction` are NOT called; cooldown ledger NOT written (dry runs never consume cooldowns).
- **approve_first:** rule fires with `approve_first=true` → routed through section 09's approval helper (`socialHumanApprovals` row, `metadata.kind='social_ads'`), no immediate `executeAdsAction`.
- **ThrottleDeferred:** insights fetch throwing `ThrottleDeferred` → cycle skips remaining work for that account without failing the job.
- **Hygiene canary:** serialized job payloads + dry-run `request_payload` contain no `EAA`/`access_token` substrings.

### 4.3 `socialAdsGovernance.test.ts` (createCaller)

- `forceDisableAdsConnection` by `admin`/`domain_admin` → connection `status='disabled'`, ALL that user's enabled rules set `enabled=false`, `removeConnectionSchedulers(connectionId)` called, a SEPARATE audit event emitted (distinct from normal disconnect), encrypted secret columns NOT touched.
- Non-admin tenant member calling `forceDisableAdsConnection` → `FORBIDDEN`.
- `getAdsOversight` (admin only) returns per-user aggregates ONLY: `{userId, status, ruleCounts, automatedActions24h, spendAggregates}` — walk the response and assert NO `ad_accounts` JSON bodies, NO `granted_scopes`, no token hints beyond `configured`-style booleans; non-admin → `FORBIDDEN`.
- `getDryRunReport(ruleId)` returns only rows with `actor='system:optimizer'` and `action LIKE 'dry_run:%'` whose payload `ruleId` matches, bounded to the last 7 days; ownership: a caller who does not own the rule → `FORBIDDEN`.
- `saveRule` with an optimize rule whose params fail `ruleSchemas` → write rejected (extends section 09's saveRule tests; guard-rule paths must remain green as regression).

### 4.4 UI (jsdom, lightweight)

- `OptimizerRuleBuilder`: selecting a budget action makes min/max budget bound fields required (submit blocked without them); `dry_run` defaults ON; enabling live mode from a dry-run rule shows a confirm dialog referencing the dry-run report.
- `DryRunReportView`: renders "would have done X because Y" rows from a fixture of dry-run action-log entries; empty state renders Thai copy.

## 5. Implementation guidance

### 5.1 `shared/socialAds/ruleSchemas.ts`

```ts
export const moneySchema = z.object({ currency: z.string().length(3), amountMinor: z.number().int() }).strict();

export const optimizerActionParamsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }).strict(),
  z.object({ action: z.literal("notify") }).strict(),
  z.object({ action: z.literal("budget_increase_pct"), pct: z.number().int().min(1).max(100),
             minBudget: moneySchema, maxBudget: moneySchema }).strict(),
  z.object({ action: z.literal("budget_decrease_pct"), /* same shape */ }).strict(),
  z.object({ action: z.literal("reallocate_to_best"), shiftPct: z.number().int().min(1).max(50),
             minBudget: moneySchema, maxBudget: moneySchema }).strict(),
]);

export const optimizeRuleWriteSchema = /* full rule row: scope, metric, window, operator,
  threshold, consecutive_hits >= 1, cooldown_hours >= 1, approve_first, dry_run — with
  a superRefine: conversion metrics (cpa|roas) forbid window last_1d;
  reallocate_to_best requires campaign scope */;
```

- Shared (`shared/`) so the rule builder client-validates with the identical schema the server enforces. The SAME parsed schema object is used at write time (router `saveRule`) and at execute time (optimizer re-validation) — never two divergent copies.
- Keep guard-rule params schemas (section 09) co-located here if section 09 placed them elsewhere; this file is the single home for rule `action_params` validation going forward.

### 5.2 `adsOptimizerService.ts`

Exported surface (signatures only):

```ts
runOptimizeCycle(connectionId: number): Promise<void>          // the social:ads-optimize processor body
checkCooldown(userId, adAccountId, targetId, action): Promise<boolean>   // + hasRecentGuardAction(targetId)
writeCooldown(userId, tenantId, adAccountId, targetId, action): Promise<void>   // upsert ledger
recordDryRun(rule, target, evaluation): Promise<void>          // inserts the dry_run action-log row
```

Executor flow per connection (each step logged with the connection/rule id):

1. Tenant kill switch (`system_settings`) → abort cycle. Load connection; `status !== 'active'` → abort.
2. Load enabled `rule_type='optimize'` rules for the connection's user/tenant; skip users with `social_ads_settings.automation_halted`.
3. Per rule → resolve target entities from `scope`; per target:
   a. Provisional guard: conversion metric + window < 3 days → skip (log reason, usable in the dry-run report as a skip row is optional — logging suffices).
   b. Fetch insights via the provider with `accountDayRange(account.timezone_name, rule.window)`; compute the metric; compare via `operator`/`threshold` (spend/budget comparisons in Money minor units).
   c. Threshold met → `INCR` Redis streak key `social-ads:streak:{ruleId}:{targetId}` + `EXPIRE` (2× window); not met → `DEL` the key. Fire only when counter ≥ `consecutive_hits`.
   d. Cooldown ledger check `(userId, adAccountId, targetId, action)`; guard-precedence check (`hasRecentGuardAction` — ledger lookup by target regardless of action, window = the guard rule's `cooldown_hours`).
   e. **Transactional re-read** (`db.transaction` + `SELECT ... FOR UPDATE` on the rule row; re-read `social_ads_settings` + tenant org cap inside the same transaction): re-validate `action_params` with `optimizerActionParamsSchema` — failure → `enabled=false` + notify + audit, continue to next rule. Recompute budget targets against the freshly-read bounds/caps (`pctOfMinor` with `{min, max}` = tightest of params/user cap/org cap).
   f. `dry_run` → `recordDryRun` (action-log row per §4.2; NO ledger write, NO lock needed beyond the insert) : else `approve_first` → section 09 approval helper : else `executeAdsAction({actor: "system:optimizer", ...})` and on `ok` → `writeCooldown`.
4. `ThrottleDeferred` anywhere → stop the cycle cleanly (job succeeds; next hourly tick retries naturally). Code-190 propagation is handled by the client/connection service (section 06) — the cycle just aborts.

Do NOT duplicate what `executeAdsAction` already owns (pending row, lock, dedupe, credit rules — system actors deduct no credits; that is section 08 behavior, verify not re-implemented here).

### 5.3 Router extensions (`server/routers/socialAds.ts`)

- `getDryRunReport({ ruleId })` — `protectedProcedure` + tenant flag + rule-ownership check; query `social_ads_action_log` for `actor='system:optimizer'`, `action LIKE 'dry_run:%'`, payload `ruleId` match, `created_at > now()-7d`; map to `{when, target, wouldAction, observedValue, threshold, reason}` DTOs.
- `forceDisableAdsConnection({ userId })` — admin/domain_admin gate (reuse the existing admin-procedure/role-check idiom in this router family). In one transaction: connection `status='disabled'`, user's rules `enabled=false`; then `removeConnectionSchedulers(connectionId)`; audit with a dedicated action name (e.g. `admin_force_disable`) so incident response is distinguishable from user disconnects. Secrets remain encrypted in place (only user-initiated `disconnect` deletes them — section 04).
- `getAdsOversight()` — admin gate; aggregate query only: connection status, enabled/total rule counts, count of `social_ads_action_log` rows with `actor LIKE 'system:%'` in last 24h, spend aggregates (from cached read data if cheap, else omit spend in v1). Response DTO must be constructed field-by-field (no row spreads) to guarantee no JSON blobs leak.

### 5.4 UI

- `OptimizerRuleBuilder.tsx`: form built from `optimizeRuleWriteSchema` (zodResolver); Thai-first labels from `ads.automation.*`; metric/window/operator selects; action select drives conditional params fields; budget bound inputs Money-formatted (`formatMoney`); `dry_run` toggle defaults ON with helper text explaining the 7-day report; "enable live" confirm dialog links to the dry-run report.
- `DryRunReportView.tsx`: per-rule table of `getDryRunReport` rows; renders the "would have done X because Y" sentence from structured fields (not free text).
- Mount both inside the Automation tab created in section 09 (optimize-rule list alongside the guard rule cards; keep section 09's action feed untouched).

## 6. Boundaries with other sections (reference only — do not implement here)

- Section 08 owns `executeAdsAction`, per-entity locks, credit deduction, and cache invalidation — mock it here.
- Section 09 owns rule CRUD procedures, guard evaluation, guard ledger WRITES, the approval-authority fix, and the Automation tab skeleton — this section only READS guard ledger entries for precedence and extends the tab.
- Section 06 owns `getInsights`, `ThrottleDeferred`, and the BUC governor — consumed as-is.
- Section 03 owns the `social:ads-optimize` scheduler + queue plumbing — this section only plugs in the processor function.
- Section 13 consumes the audit/counter events for alerting (guard/optimizer actions >N per hour) and documents the runaway-automation runbook.

## 7. Acceptance criteria

- All §4 tests green; `cd apps/web && pnpm test` full suite green; `pnpm check` clean on new files.
- Grep-level invariants: exactly one definition of the action-params schemas (`shared/socialAds/ruleSchemas.ts`); no `last_fired_at` reads/writes on the rules table anywhere; no direct provider mutation call in `adsOptimizerService.ts` (only `executeAdsAction`); no `new Date()` day-bucketing in optimizer metric windows.
- Manual gate (P4): a dry-run rule against a PAUSED-only real account produces report rows for 7 days without any Graph mutation appearing in `social_ads_action_log` with a non-`dry_run:` action.