# Section 09 — F04: monitor job, entity state, auto-block guards, notifications

**Section id:** `section-09-monitor-guards`
**Feature:** 031-SocialAdsManagement — rollout phase **P3**
**Working directory:** `apps/web/`
**Test command:** `cd apps/web && pnpm test`
**Depends on:** `section-03-social-jobs-worker` (`social:ads-monitor` queue, per-connection scheduler `social-ads:monitor:{connectionId}`, processor registration seam), `section-06-ads-graph-client` (`AdsProvider`, `batch()`, `getInsights`, `ThrottleDeferred`), `section-08-mutations-wizard` (`executeAdsAction` intent-row protocol). Also consumes section 01 (tables `social_ads_entity_state`, `social_ads_monitor_snapshots`, `social_ads_automation_rules`, `social_ads_cooldowns`, i18n `ads.automation.*`/`ads.issues.*` families, audit type `social_ads_guard_triggered`), section 02 (`Money`, `accountTime`, `adsErrorMap`), section 04 (`markExpired`).
**Blocks:** section-10 (optimizer reuses guard precedence + the rule/feed UI seams built here). Section 11 edits the same SocialAds page files — **09 lands before 11** (index batch 6, sequential).

---

## 1. Goal

Problems on live ad accounts are detected within one 15-minute poll cycle; opt-in guard rules pause bad ads automatically with hysteresis; humans can require approval-first; nobody gets notification-flooded. Deliverables:

1. **Monitor processor** for the `social:ads-monitor` queue (registered per-connection by Section 03's scheduler): Batch API polls of `effective_status`/`issues_info`/account status, diffed against the `social_ads_entity_state` baseline, transitions persisted to `social_ads_monitor_snapshots`, spend-anomaly + zero-delivery detections in the ad account's timezone.
2. **Three guard rules** (`rule_type='guard'`): `auto_pause_disapproved`, `auto_pause_overspend`, `auto_pause_zero_delivery` — executed through `executeAdsAction` with `actor:'system:guard'`, cooldown-ledger hysteresis, never auto-resumed (manual resume, or explicit per-rule "resume next day" opt-in).
3. **Approve-first mode** routing into `socialHumanApprovals` with `metadata.kind='social_ads'` — including the **authority fix**: ads-kind approvals require connection owner OR admin/domain_admin (the existing any-tenant-member behavior is a confirmed security gap for money-spending actions; chat approvals unchanged).
4. **Router + UI:** `listRules`/`saveRule`/`toggleRule`/`deleteRule`/`listActionFeed`/`resumeEntity` procedures on `socialAds.ts`; the Automation tab (guard rule cards + action feed) replacing Section 07's placeholder panel.
5. **Deduped notifications** everywhere via `createNotification` `groupKey`.

---

## 2. Background context (verified against the repo)

- **Worker seam (Section 03):** `server/workers/socialJobsWorker.ts` dispatches `social:ads-monitor` jobs (payload `{ connectionId }` only) through a processor map; before this section the job is a logged no-op. Register the real processor via the mechanism Section 03 landed (`registerSocialJobProcessor(queueName, fn)` or a one-line entry in the worker's dispatch map that lazy-imports the service — match whichever exists; lazy import avoids a worker↔service cycle). Monitor jobs are read-heavy polls: `attempts: 3` is already configured queue-side; guard mutations inside the processor go through `executeAdsAction` and are never HTTP-retried.
- **Provider (Section 06):** `getAdsProvider("meta")` — use `batch()` (≤50 sub-requests, per-sub-request error isolation), `getInsights(ctx, level, objectId, params)`, `mutateStatus`. `ThrottleDeferred` thrown by the BUC governor for non-critical calls at >95% usage = "skip this cycle, don't fail the job". Code 190 surfaces as a non-retryable typed error after the client has already called `markExpired`.
- **Intent rows (Section 08):** `executeAdsAction({userId, tenantId, adAccountId, action, targetLevel, targetId, requestPayload, actor, execute})` in `server/services/social/adsActionService.ts` — asserts kill switches for system actors, dedupes open intents, takes the per-entity lock, writes the pending→final action-log row, deducts credits only for user actors. Guards call it with `actor:'system:guard'`; lock contention for system actors = skip-and-log (Section 08 behavior).
- **Tables (Section 01, shapes per spec §11):**
  - `social_ads_entity_state` — UNIQUE `(connection_id, entity_id)`; columns `entity_level` (`campaign|adset|ad|account`), `effective_status`, `issues_info` json, `updated_at`. Convention this section relies on: **rows are only written on transition** (or first seed), so `updated_at` doubles as "time in current status" for the zero-delivery age check.
  - `social_ads_monitor_snapshots` — transitions only: `from_status`, `to_status`, `issues_info`, `detected_at`. 90-day retention (Section 13 purges; not this section's job).
  - `social_ads_automation_rules` — `rule_type` `guard|optimize`, `action`, `action_params` json, `cooldown_hours` default 24, `approve_first`, `enabled`, `dry_run`, `consecutive_hits`. **No `last_fired_at`** — the ledger owns firing state.
  - `social_ads_cooldowns` — keyed `(user_id, ad_account_id, target_id, action)`, rule-independent (delete+recreate of a rule cannot reset hysteresis).
- **Approvals (existing):** `socialHumanApprovals` at `drizzle/schema.ts:18357` — columns `tenantId`, `pageId` (**currently NOT NULL FK → socialPages**), `entityType` varchar(50), `entityId` integer, `proposedContent` text, `confidence`, `status` (`pending|approved|rejected|expired`), `reviewedByUserId`, `decisionNote`. **There is no `metadata` column and `pageId` cannot be satisfied by ads approvals** → this section makes `pageId` nullable and adds a nullable `metadata` json column (see §5.4 + migration notes §7).
- **Approval procedure (existing):** `approveAutomationAction(params: { tenantId, userId, approvalId, editedContent? })` in `server/services/socialAutomationService.ts:923` — branches on `entityType` (`reply` → send reply, `post` → publish, else BAD_REQUEST). Called from `server/routers/socialAutomation.ts:155` (protectedProcedure; `ctx.user` carries the role). **Confirmed gap:** it is scoped only by tenantId — any tenant member can approve.
- **Notifications:** `createNotification(params)` (`server/services/notificationService.ts:292`) — `groupKey` dedup is built-in (ON CONFLICT + occurrenceCount). Types `alert|system|...`, priority `low|normal|high|critical`.
- **Kill switches:** tenant `system_settings` `integrations/social_ads_automation_halted` + per-user `social_ads_settings.automation_halted`. They halt automated **mutations** (asserted inside `executeAdsAction` for system actors); detection + notifications continue while halted.
- **Meta facts:** `effective_status` values include `ACTIVE|PAUSED|CAMPAIGN_PAUSED|ADSET_PAUSED|DISAPPROVED|WITH_ISSUES|PENDING_REVIEW|ARCHIVED|...`; `issues_info` carries the review reason; ad set `learning_stage_info.status === "LEARNING"` identifies learning phase; account health = `account_status` (`1` = active) + `disable_reason`.
- **Documented limitation:** transitions that occur AND resolve entirely within one 15-min polling gap are invisible — accepted per spec (arch finding 12).

---

## 3. Files

| File | Action |
|---|---|
| `server/services/social/adsMonitorService.ts` | **New** — monitor processor, entity-state diffing, detections |
| `server/services/social/adsGuardService.ts` | **New** — guard rule evaluation/execution, default-rule seeding, approve-first, resume paths |
| `shared/socialAds/ruleSchemas.ts` | **New** — Zod **guard** rule discriminated union (`.strict()`); Section 10 extends this same file with optimizer actions (10 depends on 09 — safe) |
| `server/routers/socialAds.ts` | Edit — add `listRules`, `saveRule`, `toggleRule`, `deleteRule`, `listActionFeed`, `resumeEntity` |
| `server/workers/socialJobsWorker.ts` | Edit — register `processAdsMonitorJob` for `social:ads-monitor` (one-line, per Section 03's registration seam) |
| `server/services/socialAutomationService.ts` | Edit — `social_ads` entityType branch + approval-authority check (`userRole` param) |
| `server/routers/socialAutomation.ts` | Edit — pass `ctx.user.role` (and forward to reject path too) |
| `drizzle/schema.ts` | Edit — `socialHumanApprovals`: `pageId` → nullable, add `metadata` json column (+ migration, see §7) |
| `client/src/components/socialAds/AutomationTab.tsx` | **New** — replaces Section 07's placeholder panel slot |
| `client/src/components/socialAds/GuardRuleCard.tsx`, `ActionFeed.tsx` | **New** — rule cards for the 3 guard types + feed (resume button, pending approvals) |
| `client/src/hooks/useSocialAds.ts` | Edit — rules/feed/resume hooks |
| `client/src/locales/{th,en}/social.json` | Edit — concrete `ads.automation.*` / `ads.issues.*` keys used by the tab |
| `server/services/social/__tests__/adsMonitorService.test.ts` | **New** |
| `server/services/social/__tests__/adsGuardService.test.ts` | **New** |
| `server/routers/__tests__/socialAds.guards.test.ts` | **New** — createCaller tests for the new procedures |
| `server/services/__tests__/socialAutomationService.adsApproval.test.ts` | **New** — authority fix + chat regression |

Do NOT touch `SocialAds.tsx` beyond mounting `AutomationTab` into the existing tab slot (Section 11 edits the same page next).

---

## 4. TDD — write these tests FIRST

Conventions: Vitest, node env (jsdom only for the tab render test); no network, no test DB, no real Redis. `vi.hoisted` mock bag idiom (`server/services/__tests__/socialDraftService.test.ts`); chainable drizzle mock (`creditService.test.ts` idiom); mock `adsProvider` registry, `adsActionService` (`executeAdsAction` as `vi.fn()`), `notificationService`, `socialAdsConnectionService` (`markExpired`), cooldown-ledger DB reads. Processors and evaluators are standalone exported functions — test directly, never through a live Worker.

### 4.1 `adsMonitorService.test.ts`

1. **First-run seeding:** empty `social_ads_entity_state` for the connection + a batch fixture of entities → state rows inserted for every entity, **zero** snapshot inserts, **zero** `createNotification` calls, **zero** guard evaluations.
2. **Transition detection:** existing state row `ACTIVE`, poll returns `WITH_ISSUES` → exactly ONE `social_ads_monitor_snapshots` insert (`from_status='ACTIVE'`, `to_status='WITH_ISSUES'`, `issues_info` copied), state row updated; unchanged entities produce no writes (assert `updated_at` untouched — the zero-delivery age contract).
3. **Notification dedup:** same entity transitioning to the same bad status → `createNotification` called with `groupKey: "ads-issue:{entityId}:{toStatus}"`; a second detection in-window asserts the SAME groupKey (dedup is the service's job, the monitor must not invent fresh keys).
4. **Overspend detection is tz+Money-correct:** spend fetched via `getInsights` with a `today` preset derived from `accountTime` using the account's `timezone_name` (spy asserts the tz argument); comparison uses `Money` minor-unit compare (never floats); cap exceeded → guard evaluation invoked once for the campaign.
5. **190 mid-batch:** batch sub-response with `error.code=190` → `markExpired(connectionId, ...)` called once, remaining batch/accounts aborted (no further provider calls), exactly one notification path (via `markExpired`'s own dedup — assert the monitor does NOT also notify).
6. **Governor skip:** provider throwing `ThrottleDeferred` → processor logs + returns cleanly (job completes; no failure, no retry storm, no partial state writes for the skipped account).

### 4.2 `adsGuardService.test.ts`

1. **DISAPPROVED, rule ON:** transition to `DISAPPROVED` with an enabled `auto_pause_disapproved` rule → `executeAdsAction` called once with `{actor: 'system:guard', action: 'pause', targetLevel: 'ad', targetId}` and a ledger row written; audit `social_ads_guard_triggered` emitted.
2. **DISAPPROVED, rule OFF:** notification only; `executeAdsAction` NOT called.
3. **Hysteresis:** existing ledger row for `(userId, adAccountId, targetId, 'pause')` inside `cooldown_hours` → guard does NOT re-fire (executeAdsAction not called), skip is logged.
4. **No auto-resume:** an entity paused by a guard, later polling shows it could run → no resume call ever originates from guard evaluation; `resume_next_day` opt-in (overspend rule param): account-tz day rolled over since the pause → exactly one resume via `executeAdsAction` (`actor:'system:guard'`) + ledger entry preventing a same-day repeat; day not rolled over → nothing.
5. **approve_first:** rule with `approve_first=true` → ONE `socialHumanApprovals` insert with `entityType='social_ads'`, `entityId=<ruleId>`, `pageId=null`, `metadata` containing `{kind:'social_ads', connectionId, adAccountId, targetLevel, targetId, action, actionParams}`, Thai `proposedContent` summary; `executeAdsAction` NOT called; a second evaluation while that approval is still `pending` for the same `(targetId, action)` inserts nothing (dedupe).
6. **Default seeding idempotent:** `ensureDefaultGuardRules(connection)` on a connection with no guard rules creates the three rows (`auto_pause_disapproved` enabled, `auto_pause_overspend` enabled with cap defaulted from `social_ads_settings.max_daily_budget_minor`, `auto_pause_zero_delivery` disabled; all `dry_run=false`); calling again creates nothing.

### 4.3 `socialAds.guards.test.ts` (createCaller)

1. `saveRule` rejects an unknown/extra param via the `.strict()` guard schema; `auto_pause_overspend` without a Money cap → BAD_REQUEST with Thai message; valid rule persists with `rule_type='guard'`.
2. `resumeEntity` requires connection owner or admin/domain_admin → FORBIDDEN for another tenant member; success path routes through `executeAdsAction` (spy: `actor` is the user actor form, so Section 08's credit policy applies) — the router never calls the provider directly.
3. Feature-flag + connection gates apply to every new procedure (reuse Section 07's parameterized gate-test idiom); `listActionFeed` returns action-log rows + pending ads approvals, never raw tokens (serialize response, assert no `EAA`/`access_token` shapes — hygiene canary).

### 4.4 `socialAutomationService.adsApproval.test.ts`

1. **Authority fix:** an ads-kind approval (`entityType='social_ads'`) approved by a tenant member who is neither the connection owner nor admin/domain_admin → FORBIDDEN; owner → allowed; admin → allowed. Same authority applied to reject.
2. **Execution on approve:** approving runs the guarded action through `executeAdsAction` (spy asserts actor + `requestPayload` includes `approvalId`/approver id), marks the approval `approved`.
3. **Chat regression:** `reply`/`post` approvals behave exactly as before with the new optional `userRole` param absent/present (existing tests still green; add one explicit any-member `reply` approval passing).

### 4.5 UI (jsdom, one light test)

`AutomationTab` renders the three guard rule cards from a rules fixture with correct enabled states + the feed list from an action-log fixture; the manual resume button appears only on guard-paused feed entries.

Section is done only when these pass AND `cd apps/web && pnpm test` full suite is green, `pnpm check` clean on new files.

---

## 5. Implementation guidance

### 5.1 `adsMonitorService.ts`

```ts
/** Processor for `social:ads-monitor` jobs (payload: { connectionId } only). */
export async function processAdsMonitorJob(data: { connectionId: number }): Promise<void>;

/** Pure-ish helpers, exported for tests: */
export async function pollConnectionEntities(connectionId: number): Promise<PolledEntity[]>; // Batch API fan-out
export async function diffAndPersistEntityState(connectionId: number, polled: PolledEntity[]): Promise<EntityTransition[]>;
export async function runSpendChecks(connection, adAccount): Promise<SpendFinding[]>;
export async function runZeroDeliveryChecks(connection, adAccount, stateRows): Promise<ZeroDeliveryFinding[]>;
```

Flow per job:
1. Load connection; not `active` → log + return (Section 03's reconciliation will remove the scheduler).
2. `ensureDefaultGuardRules(connection)` (idempotent; heals pre-existing connections — this is where the "default-created ON at connect" requirement is satisfied without editing Section 04's service).
3. Per enabled ad account, via `AdsProvider.batch()` (≤50 sub-requests, chunked): campaigns/adsets/ads with `id,effective_status,issues_info` (+ adset `learning_stage_info`), and account `account_status,disable_reason`. `ThrottleDeferred` → log "skip cycle" + return cleanly. A 190 in any sub-response → the client already called `markExpired` (which deregisters schedulers + sends ONE deduped notification) — abort the remainder, do not double-notify.
4. Diff vs `social_ads_entity_state`: no rows for this connection → **seed silently** (insert all, emit nothing). Otherwise per changed entity: insert one snapshot row, update the state row (**only** changed rows get `updated_at` bumped — the zero-delivery age contract), and hand the transition to `adsGuardService.evaluateTransition(...)`. Notify on bad transitions (`WITH_ISSUES`, `DISAPPROVED`, account `account_status != 1`) with `groupKey: "ads-issue:{entityId}:{toStatus}"`, priority `high` (account-level → `critical`).
5. **Spend anomaly** (account tz via `accountTime`, all comparisons in `Money` minor units): today's spend via `getInsights` (`today` preset) vs trailing-7d average × multiplier (default 2×, tenant/user-configurable via `notification_prefs`) → notification (`groupKey: "ads-anomaly:{adAccountId}:{accountDay}"`); campaign daily spend vs the `auto_pause_overspend` rule cap → guard evaluation.
6. **Zero delivery:** ACTIVE ads with 0 impressions today whose state row `updated_at` is older than the rule's N hours AND whose parent ad set is NOT in learning phase → guard evaluation for `auto_pause_zero_delivery`.

Keep the processor free of direct Graph calls (provider only) and free of direct mutation calls (guard service only). Job payloads/logs: ids only — the Redis hygiene canary from Section 03 stays green.

### 5.2 `adsGuardService.ts`

```ts
export async function ensureDefaultGuardRules(connection): Promise<void>;
export async function evaluateTransition(connection, transition): Promise<void>;
export async function evaluateSpendFinding(connection, finding): Promise<void>;
export async function evaluateZeroDelivery(connection, finding): Promise<void>;
/** Called from the approval flow after authority passes: */
export async function executeApprovedGuardAction(params: { approval, approverUserId }): Promise<void>;
/** Called each monitor cycle for rules with resume_next_day: */
export async function evaluateScheduledResumes(connection): Promise<void>;
```

Rules of engagement:
- Load enabled `rule_type='guard'` rows scoped to the connection's user/account. Match rule → **cooldown ledger check** on `(user_id, ad_account_id, target_id, action)` (rule-independent hysteresis) → if `approve_first`: insert the `socialHumanApprovals` row (see §5.4) + notification, done; else `executeAdsAction({actor:'system:guard', action:'pause', ...})` → on `ok`, upsert the ledger row and emit audit `social_ads_guard_triggered`. Kill switches are asserted inside `executeAdsAction` for system actors; pre-check them here only to skip quietly (detection/notification still ran).
- **Never auto-resume.** The only automated resume is the per-rule `resume_next_day` opt-in (offered ONLY on `auto_pause_overspend` — daily spend resets with the account-tz day): when the account-tz day has rolled past the pause's ledger timestamp, resume once via `executeAdsAction` and write a ledger entry for the resume so it cannot flap.
- Guard params come from `shared/socialAds/ruleSchemas.ts` (this section defines the guard branch):

```ts
export const guardRuleSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auto_pause_disapproved"), approveFirst: z.boolean().default(false), resumeNextDay: z.literal(false).default(false) }).strict(),
  z.object({ action: z.literal("auto_pause_overspend"), capMinor: z.number().int().positive(), currency: z.string(), approveFirst: ..., resumeNextDay: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("auto_pause_zero_delivery"), hours: z.number().int().min(1).max(72), approveFirst: ... }).strict(),
]);
```
Validated at `saveRule` write time AND re-checked before firing (a stored blob failing re-validation → disable rule + notify, never execute — same posture Section 10 applies to optimizer rules).
- Guards are created/stored with `dry_run=false` (dry-run is an optimizer concept; guards are the safety mechanism).

### 5.3 Router additions (`server/routers/socialAds.ts`)

All behind Section 07's `assertAdsEnabled` + connection gates; write procedures rate-limited with the Section 08 mutation namespace (`social-ads-mutation`, 60/h). Signatures only:

- `listRules` — guard + optimizer rows for the caller (Section 10 reuses).
- `saveRule` / `toggleRule` / `deleteRule` — guard schema validation; ownership: rules always belong to `ctx.user.id` + resolved tenant.
- `listActionFeed({adAccountId?, cursor?})` — merged, newest-first: `social_ads_action_log` rows (sanitized payloads as stored), monitor snapshots, pending ads approvals. Response DTO never includes raw Graph payload bodies beyond the sanitized/truncated stored json.
- `resumeEntity({targetLevel, targetId, adAccountId})` — authority: connection owner or admin/domain_admin; executes `mutateStatus → ACTIVE` **through `executeAdsAction`** (user actor → Section 08 credit policy applies); does NOT clear the guard's ledger row (the guard still can't re-fire until cooldown lapses, but a fresh DISAPPROVED transition after cooldown may re-pause — that is the intended hysteresis).

Approve/reject of ads approvals go through the EXISTING `socialAutomation` router procedures — do not duplicate approval endpoints here.

### 5.4 Approvals: schema change + authority fix

**Schema (this section owns it):** `socialHumanApprovals` — make `pageId` nullable (ads approvals are not page-scoped) and add `metadata: json("metadata").$type<{ kind?: "social_ads"; connectionId?: number; adAccountId?: string; targetLevel?: string; targetId?: string; action?: string; actionParams?: unknown } | null>()`. For ads rows: `entityType='social_ads'`, `entityId = ruleId` (integer — fits the existing column; the Meta target id lives in `metadata.targetId` since Graph ids overflow integer), `proposedContent` = human-readable Thai summary. Audit the listing code paths (`toApprovalSummary`, `loadApprovalContext`, the leftJoin at `socialAutomationService.ts:908-911`) for null-`pageId` tolerance.

**Service edit (`approveAutomationAction`, `:923`):** add optional `userRole` param (router passes `ctx.user.role`; same for the reject procedure). New branch **before** any side effect:

```ts
if (context.approval.entityType === "social_ads") {
  // load connection via approval.metadata.connectionId;
  // FORBIDDEN unless params.userId === connection.userId || userRole ∈ {admin, domain_admin};
  // then adsGuardService.executeApprovedGuardAction({ approval, approverUserId }) → executeAdsAction
}
```
Chat (`reply`/`post`) branches untouched. `expireOldApprovals` already handles staleness generically — verify it doesn't assume a page join.

### 5.5 Automation tab UI

- `AutomationTab.tsx` mounts into the stable placeholder slot Section 07 left in `SocialAds.tsx`. Two zones: (a) three `GuardRuleCard`s (toggle, params — Money-formatted cap input for overspend, hours for zero-delivery, approve-first switch, resume-next-day switch on overspend only, cooldown hours), (b) `ActionFeed` (grouped by day; each entry: actor chip `guard|optimizer|user`, action, target, status, one-click **resume** on guard-paused entries, approve/reject deep-link for pending approvals). Kill-switch state banner (from settings DTO) at the top.
- TanStack Query via `useSocialAds.ts` hooks; invalidate feed + rules on every mutation. All strings from `ads.automation.*` / `ads.issues.*` (add the concrete keys th+en; Thai primary).
- Section 10 adds optimizer rule-builder UI into this same tab — keep `GuardRuleCard` guard-specific and the tab layout extensible (render rules by `rule_type`).

### 5.6 Worker registration

One line in `server/workers/socialJobsWorker.ts` using Section 03's seam, e.g. `registerSocialJobProcessor(SOCIAL_JOB_QUEUES.adsMonitor, (job) => import("../services/social/adsMonitorService").then(m => m.processAdsMonitorJob(job.data)))` — lazy import avoids the import cycle; keep the exact style Section 03 established.

---

## 6. Constraints & non-goals

- **No optimizer logic** (streaks, budget actions, dry-run reports, `forceDisableAdsConnection`) — Section 10. This section only guarantees the guard-precedence primitives Section 10 needs (ledger rows queryable by target regardless of action).
- **No retention/purging** of snapshots/action-log — Section 13.
- **Never bypass `executeAdsAction`** for any pause/resume — the intent-row protocol, kill switches, locks, and credits all live there (Section 08).
- **No direct `graph.facebook.com` access** — provider only (Section 06 invariant).
- Tokens: never in job payloads, feed DTOs, notifications, approval rows, or logs (canary tests enforce).
- Do not refactor chat-approval semantics; the authority change is scoped strictly to `entityType='social_ads'`.
- Section 11 edits `SocialAds.tsx` next — keep this section's page edit minimal (mount the tab; nothing else).

---

## 7. Migration & deploy notes

- `socialHumanApprovals` change = ALTER on an existing table with data (`pageId` DROP NOT NULL + ADD nullable `metadata` json). Per the Database Safety Protocol: backup `social_human_approvals` first, record row counts, run `pnpm db:push` immediately after the schema edit, verify counts + journal entry. Migration number = next after the current journal head at implementation time (Section 01 targeted `0213`; verify, never reuse `0212_consolidated`).
- `server/workers/socialJobsWorker.ts` and server services change → web service restart required after deploy (note in handoff; the coding agent does not restart services).

## 8. Acceptance (phase P3 gate)

- On a sandbox account with a deliberately policy-violating ad: DISAPPROVED detected within one 15-min cycle, ad paused via intent row (`actor='system:guard'`), notification + Issues tab reason visible, feed shows the action with a working one-click resume (owner/admin only).
- Guard cannot re-fire on the same entity within its cooldown; auto-paused entities never auto-resume except the explicit resume-next-day opt-in.
- Ads approval by a non-owner non-admin tenant member is FORBIDDEN; chat approvals regress nothing.
- First monitor run after connect seeds silently (zero notifications); repeated bad states produce deduped notifications only.
- `cd apps/web && pnpm test` green; `pnpm check` clean; Redis payload + feed-DTO hygiene canaries green.