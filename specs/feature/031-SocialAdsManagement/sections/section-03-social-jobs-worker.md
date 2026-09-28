# Section 03 — F00: socialJobsWorker (queues, schedulers, boot wiring) + scheduled-posts fix + automation-rules wiring

**Section id:** `section-03-social-jobs-worker`
**Feature:** 031-SocialAdsManagement — rollout phase **P0** (this section alone is the P0 gate)
**Working directory:** `apps/web/`
**Depends on:** `section-01-schema-flags-i18n` (only for the schema types of later ads tables; the P0 processors in this section touch only EXISTING tables — `social_posts`, automation rules — so this section can start as soon as Section 01's migration lands, and its scheduled-posts/automation work has no hard compile dependency on the new ads tables).
**Blocks:** section-09 (monitor jobs), section-11 (page-insights jobs), section-13 (retention/advisor jobs). Section 04 consumes `registerConnectionSchedulers`/`removeConnectionSchedulers` exported here.

---

## 1. Goal

Three deliverables, one worker module:

1. **The missing background runner exists.** Today there is NO BullMQ worker for the social module — scheduled posts sit in `social_posts.status='scheduled'` forever (**Gap A**) and `matchAutomationRules` has zero production callers (**Gap B**; verified — the only call sites are its own tests). This section creates `socialJobsWorker` and fixes both gaps.
2. **All ads/page job queues are registered** (`social:ads-monitor`, `social:ads-optimize`, `social:page-insights`, `social:advisor-reports`, `social:ads-retention`) with **no-op-guarded processor dispatch** — later sections plug real processors in without touching queue plumbing.
3. **Per-connection scheduler lifecycle helpers + reconciliation** used by Sections 04/09/11/12.

---

## 2. Background context (all verified against the repo)

- **Worker template:** `server/services/webhookDispatchQueue.ts` (~308 lines). Module singletons; `initWebhookDispatchQueue()` at `:216-239` creates `new Queue(name, { connection: getRealtimeClient().duplicate(), defaultJobOptions: {...} })` + `new Worker(name, processor, { connection: getRealtimeClient().duplicate(), concurrency })`; `UnrecoverableError` from `bullmq` for permanent failures (`:148`); `closeWebhookDispatchQueue()` closes worker then queue (`:298`). Copy this structure exactly.
- **Redis:** `getRealtimeClient()` from `server/services/redisClients.ts:86` (has `maxRetriesPerRequest: null`, required by BullMQ); call `.duplicate()` per queue/worker.
- **Repeatable-job idiom:** `queue.upsertJobScheduler(schedulerId, { every: ms }, { name, data, opts })` — existing usages at `server/jobs/escalationJob.ts:235` and `server/services/memoryMaintenanceJobs.ts:598-613`. `removeJobScheduler(schedulerId)` on delete; `getJobSchedulers()` for reconciliation. Job templates cannot set a custom `jobId`.
- **Boot wiring:** `server/_core/index.ts` — init block around `:1684` (right where `initWebhookDispatchQueue()` is called; import at `:96`), shutdown in **BOTH** blocks: SIGTERM (`closeWebhookDispatchQueue().catch(() => {})` at `:2052`) and SIGINT (`:2119`). Line numbers drift — anchor to the `initWebhookDispatchQueue`/`closeWebhookDispatchQueue` call sites, not the numbers.
- **Scheduled posts (Gap A):** table `social_posts` (`drizzle/schema.ts:18222-18258`) — quoted camelCase columns `status` (varchar20, values include `draft|scheduled|publishing|published|failed`), `scheduledAt` (timestamptz), `createdByUserId`, `errorMessage`, `tenantId`. Existing publish path: `publishPublishingPostNow({ tenantId, userId, postId })` in `server/services/socialPublishingService.ts:586` — it loads context, validates page readiness, calls the Python backend, and sets `published|failed` itself. **Reuse it; do not reimplement publishing.**
- **Automation rules (Gap B):** `matchAutomationRules(params: { tenantId, pageId, messageBody, conversationId, db? })` in `server/services/socialAutomationService.ts:1078` — evaluates enabled rules and routes matches through the existing approval/auto-send paths. It is currently dead code in production.
- **Inbound event entry point:** the Python backend delivers inbound social events through the internal actions route `server/routes/internalSocialActions.ts` → `executeSocialAction` (`server/services/socialBackgroundFacade.ts`) → provider adapters that persist `socialMessages`/`socialComments` rows. **Verify the exact persistence call site at implementation time** (the adapter path under `server/services/social/`), and place the enqueue hook immediately after the inbound row is persisted so the job payload can carry the new row id.
- **Notifications:** `createNotification(params)` at `server/services/notificationService.ts:292`; dedup is built-in via `groupKey` (ON CONFLICT + occurrenceCount).
- **Locks (not needed here, referenced by later sections):** `acquireSemaphore` in `server/services/redisSemaphore.ts`.

---

## 3. Files

| File | Action |
|---|---|
| `server/workers/socialJobsWorker.ts` | **New** — queues, workers, processors, scheduler helpers, enqueue helpers |
| `server/workers/__tests__/socialJobsWorker.test.ts` | **New** — all tests below |
| `server/_core/index.ts` | Edit — `initSocialJobsWorker()` beside `initWebhookDispatchQueue()` (~`:1684`); `closeSocialJobsWorker().catch(() => {})` in **both** SIGTERM and SIGINT shutdown blocks |
| `server/routes/internalSocialActions.ts` (and/or the adapter that persists inbound rows — verify) | Edit — enqueue `social:automation-rules` after inbound message/comment persistence |

---

## 4. TDD — write these tests FIRST

File: `server/workers/__tests__/socialJobsWorker.test.ts`. Conventions: Vitest, node env; **no test DB, no network, no real Redis**. Mock at module boundaries with a `vi.hoisted` mock bag (idiom: `server/services/__tests__/socialDraftService.test.ts:3-56`); mock `bullmq` (`Queue`/`Worker` as classes capturing constructor args, `upsertJobScheduler`/`removeJobScheduler`/`getJobSchedulers`/`add` as `vi.fn()`), `../services/redisClients` (`getRealtimeClient` → `{ duplicate: () => fakeRedis }`), `../services/socialPublishingService` (`publishPublishingPostNow`), `../services/socialAutomationService` (`matchAutomationRules`), `../services/notificationService` (`createNotification`), and the DB layer (chainable drizzle mock, idiom: `creditService.test.ts:3-45`, or a mocked `getDb`/transaction wrapper). Processors are exported standalone functions — test them directly, never through a live Worker.

1. **Sweep claim shape:** the scheduled-posts sweep processor claims only rows with `status='scheduled'` and `scheduledAt <= now` (assert the claim UPDATE/transaction shape on the mocked drizzle `sql` execution — presence of `FOR UPDATE SKIP LOCKED`, `LIMIT 20`, status predicate) and calls `publishPublishingPostNow` exactly once per claimed id with `{ tenantId, userId, postId }` derived from the row.
2. **Claim idempotency:** a row already `publishing` is NOT re-claimed by the normal claim query; a `publishing` row older than 10 minutes is finalized to `failed` with the "unknown outcome — verify manually" (Thai) message and `publishPublishingPostNow` is **never** called for it (no blind re-publish).
3. **Publish failure:** `publishPublishingPostNow` rejects → post finalized `failed` with `errorMessage`, and `createNotification` called with `groupKey: "social-post-failed:{postId}"`; a second failure for the same post in the same window relies on groupKey dedup (assert the same groupKey, not a new one).
4. **Payload hygiene canary:** for EVERY exported enqueue helper (`enqueueScheduledPostsSweepNow` if provided, `enqueueAutomationRuleEvaluation`, scheduler job templates from `registerConnectionSchedulers`), `JSON.stringify` the payload passed to `queue.add`/`upsertJobScheduler` and assert it contains neither `EAA` nor `access_token` and only id-shaped fields (`postId`, `connectionId`, `conversationId`, `commentId`, `ruleId`, `tenantId`, `pageId`).
5. **Scheduler lifecycle:** `registerConnectionSchedulers(connectionId)` calls `upsertJobScheduler` with exactly the ids `social-ads:monitor:{id}` (every 900_000 ms, staggered `startDate` offset = `hash(connectionId) % 900_000` ms), `social-ads:optimize:{id}` (every 3_600_000 ms), `social:page-insights:{id}` (every 86_400_000 ms); `removeConnectionSchedulers(connectionId)` calls `removeJobScheduler` for each of the three ids. Reconciliation: given mocked `getJobSchedulers()` missing one expected scheduler and containing one orphan (scheduler for a connection not in the mocked active-connections list), it upserts the missing one and removes the orphan.
6. **Automation wiring:** the inbound-event hook enqueues `social:automation-rules` with `{ conversationId }` (or `{ commentId }`); the automation processor loads the persisted entity (mocked DB) and invokes `matchAutomationRules` (mocked) with `{ tenantId, pageId, messageBody, conversationId }` from that entity — assert the arguments; a match result is routed onward (mock assertion only — approval/auto-send behavior itself is existing code, not re-tested here).
7. **Redis-down boot:** `initSocialJobsWorker()` with `getRealtimeClient` (or `Queue` constructor) throwing → resolves without throwing, logs the failure, and exposes an offline status (e.g. `isSocialJobsWorkerOnline() === false`) that Section 11's health panel will read.
8. **No-op dispatch for future queues:** a job arriving on `social:ads-monitor` (etc.) before a processor is registered completes as a logged no-op (no throw, no retry storm).

Section is done only when these tests pass AND the full suite (`cd apps/web && pnpm test`) is green, plus `pnpm check` clean on new files.

---

## 5. Implementation

### 5.1 Module skeleton (`server/workers/socialJobsWorker.ts`)

Follow the `webhookDispatchQueue.ts` template: module-level singletons, `init`/`close`, standalone exported processors. Sketch (stubs + docstrings only — flesh out per template):

```ts
import { Queue, Worker, UnrecoverableError } from "bullmq";
// getRealtimeClient from ../services/redisClients — .duplicate() per queue/worker

export const SOCIAL_JOB_QUEUES = {
  scheduledPosts: "social:scheduled-posts",
  automationRules: "social:automation-rules",
  adsMonitor: "social:ads-monitor",
  adsOptimize: "social:ads-optimize",
  pageInsights: "social:page-insights",
  advisorReports: "social:advisor-reports",
  adsRetention: "social:ads-retention",
} as const;

/** Boot: create all queues+workers, upsert global repeatable schedulers.
 *  Redis-down → log + continue (app must still boot). */
export async function initSocialJobsWorker(): Promise<void>;
/** Shutdown: close workers then queues (called from BOTH SIGTERM and SIGINT blocks). */
export async function closeSocialJobsWorker(): Promise<void>;
/** Health-panel probe (Section 11 reads this). */
export function isSocialJobsWorkerOnline(): boolean;

// ── Processors (standalone + exported = unit-testable) ─────────────
export async function processScheduledPostsSweep(): Promise<void>;
export async function processAutomationRuleJob(data: { conversationId?: number; commentId?: number }): Promise<void>;

// ── Enqueue helpers (payloads are IDS ONLY — enforced by canary test) ──
export async function enqueueAutomationRuleEvaluation(data: { conversationId?: number; commentId?: number }): Promise<void>;

// ── Per-connection scheduler lifecycle (consumed by Sections 04/09/11/12) ──
export async function registerConnectionSchedulers(connectionId: number): Promise<void>;
export async function removeConnectionSchedulers(connectionId: number): Promise<void>;
export async function reconcileConnectionSchedulers(): Promise<void>; // daily
```

**Registration for future processors:** ads/page queues route through a small dispatch map (`queueName → processor | undefined`); undefined → log `"no processor registered for {queue} — skipping"` and return (job completes). Later sections register their processors via the exported `registerSocialJobProcessor(queueName, fn)` — this is the REQUIRED mechanism (Sections 09/11/12/13 are written against it); they never edit init plumbing.

### 5.2 Queues, schedulers, job options

| Queue | Trigger | Concurrency | Attempts |
|---|---|---|---|
| `social:scheduled-posts` | repeatable `upsertJobScheduler("social:scheduled-posts:sweep", { every: 60_000 }, ...)` | **1** | 3, exponential (sweep is idempotent — the claim protects against double-publish) |
| `social:automation-rules` | event-driven enqueue + timeout sweep `upsertJobScheduler("social:automation-rules:sweep", { every: 300_000 }, ...)` | small (2-4) | 3 for the sweep; **1** for event jobs that lead to external sends |
| `social:ads-monitor` | per-connection scheduler (registered by Section 04, processor by Section 09) | 1 | 3 (read-only poll) |
| `social:ads-optimize` | per-connection hourly | 1 | **1** (mutates external state — NEVER retried) |
| `social:page-insights` | per-connection daily | 1 | 3 |
| `social:advisor-reports` | enqueued by Section 12's schedule tick | 1 | 1 (spends credits) |
| `social:ads-retention` | daily `upsertJobScheduler("social:ads-retention:daily", { every: 86_400_000 }, ...)` | 1 | 3 |

Everywhere: `removeOnComplete: { count: 100 }`, `removeOnFail: { count: 500 }` (Redis hygiene). Permanent failures inside processors throw `UnrecoverableError`.

**Redis-down behavior:** wrap the whole of `initSocialJobsWorker` body in try/catch-log-and-continue (idiom: `videoIntelligenceJobs.ts:355-389`). No inline-publish fallback for scheduled posts — they stay visibly `scheduled` in the Publishing UI until the worker returns (an inline fallback would bypass the claim idempotency).

**Job payload rule (hard):** ids only. No tokens, no denormalized entities, no user emails. The canary test (TDD #4) enforces this forever.

### 5.3 Scheduled-posts sweep processor (Gap A fix)

Per sweep run, single transaction claim (drizzle `sql` template — note quoted camelCase `"scheduledAt"`):

```sql
UPDATE social_posts SET status = 'publishing', "updatedAt" = now()
WHERE id IN (
  SELECT id FROM social_posts
  WHERE status = 'scheduled' AND "scheduledAt" <= now()
  ORDER BY "scheduledAt" LIMIT 20 FOR UPDATE SKIP LOCKED
) RETURNING id, "tenantId", "createdByUserId";
```

Then, for each claimed row (sequentially — concurrency 1):
- Call `publishPublishingPostNow({ tenantId, userId: createdByUserId, postId })` — it already sets `published|failed` and stores the provider post id / error. If `createdByUserId` is NULL (user deleted — FK is `set null`), do not attempt publish: finalize `failed` with a Thai "ไม่พบผู้สร้างโพสต์" style message.
- The publish call is a **mutation → the job never retries it**: catch errors per-post, mark that post `failed` + `errorMessage`, continue with the remaining claimed posts (one bad post must not poison the batch).
- On failure: `createNotification({ ..., groupKey: "social-post-failed:{postId}" })` (type `alert`, targeted at the post creator/tenant per existing notification conventions).

**Stuck-`publishing` recovery (same sweep):** also select `publishing` rows with `"updatedAt" < now() - interval '10 minutes'`. For each: if the platform outcome is determinable (e.g. `providerPostId` already set → finalize `published`), do so; otherwise finalize `failed` with the "unknown outcome — verify manually" message (Thai). **Never blind re-publish** — a crash between claim and finalize must not become a duplicate post.

### 5.4 Automation-rules wiring (Gap B fix)

- **Hook:** in the internal social actions flow (`server/routes/internalSocialActions.ts` → `executeSocialAction` → adapter that inserts the inbound `socialMessages`/`socialComments` row — locate the exact insert at implementation time), immediately after the inbound row is persisted, call `enqueueAutomationRuleEvaluation({ conversationId })` (messages) or `{ commentId }` (comments). Fire-and-forget with `.catch(log)` — inbound delivery must never fail because Redis is down.
- **Processor (`processAutomationRuleJob`):** load the persisted entity by id (message via conversation, or comment); derive `{ tenantId, pageId, messageBody, conversationId }`; call the EXISTING `matchAutomationRules` (`socialAutomationService.ts:1078`). Its match result already routes into the existing approval/auto-send machinery (see its existing callers in tests + `socialAutomationService.ts:977` auto-publish path) — this section only wires the trigger, it does not change rule semantics. Missing entity (deleted before job ran) → log + return (or `UnrecoverableError`); do not retry.
- **Timeout-based triggers:** evaluated inside the 5-minute `social:automation-rules:sweep` job — the sweep queries rules with timeout-style triggers and enqueues per-entity evaluations. Keep the sweep logic thin; rule evaluation itself remains in `socialAutomationService`.

### 5.5 Per-connection scheduler helpers + reconciliation

- Ids are a fixed convention (tests pin them): `social-ads:monitor:{connectionId}` (every 15 min), `social-ads:optimize:{connectionId}` (hourly), `social:page-insights:{connectionId}` (daily).
- **Stagger:** monitor scheduler gets `startDate` offset `= hash(connectionId) % 900_000` ms (simple stable string hash) so N connections don't poll Meta simultaneously.
- Job template `data` = `{ connectionId }` only.
- `reconcileConnectionSchedulers()` (run from the daily retention tick, or its own daily scheduler): fetch `getJobSchedulers()` from each ads/page queue, compare against active `social_ads_connections` rows (Section 01 table; status `active`), upsert missing schedulers, remove orphans. This heals drift from crashed disconnects or Redis flushes.
- Section 04's `saveToken`/`disconnect`/`markExpired` call `registerConnectionSchedulers`/`removeConnectionSchedulers` — keep both functions dependency-light (no import of connection service; take the id, hit the queues) to avoid an import cycle.

### 5.6 Boot wiring (`server/_core/index.ts`)

- Import `{ initSocialJobsWorker, closeSocialJobsWorker }` alongside the webhookDispatchQueue import (`:96` area).
- Call `await initSocialJobsWorker();` in the init sequence next to `await initWebhookDispatchQueue();` (~`:1684`) — it self-guards against Redis failure, so no extra try/catch needed at the call site if the function already catches (match whichever style the neighboring init calls use).
- Add `await closeSocialJobsWorker().catch(() => {});` to **BOTH** shutdown blocks — SIGTERM (near `:2052`) and SIGINT (near `:2119`). Missing one of the two is the classic leak here; grep for both `closeWebhookDispatchQueue` call sites and mirror them.

---

## 6. Constraints & non-goals

- Do NOT implement ads-monitor/optimize/page-insights/advisor/retention processor logic — those are Sections 09/10/11/12/13. Only the queue registration + no-op dispatch + scheduler id conventions land here.
- Do NOT modify `publishPublishingPostNow` or `matchAutomationRules` internals — reuse as-is (their behavior changes belong to later sections, e.g. Section 09's approval-authority change).
- No tokens/secrets anywhere near this module — payloads are ids; no `decrypt()` imports.
- No new i18n keys are strictly required here (worker-side notification strings may use existing notification patterns); if Thai strings are added for failure messages, they live server-side in the worker module (notifications are server-rendered strings in this codebase).
- Systemd/service restarts to verify on the live box are out of scope for the coding agent — note in the handoff that `server/_core/index.ts` changed (web service restart required per deployment rules).

## 7. Acceptance (phase P0 gate)

- A post scheduled ≤ now publishes within 90 seconds of the worker running.
- Worker restart mid-window does not double-publish (claim + stuck-row recovery semantics proven by tests 1-2).
- An automation rule fires on a test inbound event (test 6).
- `cd apps/web && pnpm test` green; `pnpm check` clean; payload-hygiene canary green.