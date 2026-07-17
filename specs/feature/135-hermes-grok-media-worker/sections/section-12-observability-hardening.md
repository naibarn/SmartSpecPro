# Section 12 — Observability + Hardening

**Section id:** `section-12-observability-hardening`
**Plan sources:** `../claude-plan.md` §15 + §17 (delivery step 8 in §16), `../claude-plan-tdd.md` §15–§17, `../spec.md` §16–§17
**Depends on:** section-01 (error codes, `hermesWorkerSettings` key constants), section-03 (`adminListHermesConnections`), section-04 (control-job settlement + audit hook call sites), section-05 (admission checks + exported quota key builder `hermes:quota:<connectionId>:<YYYY-MM-DD>`, scheduler), section-06 (finalize + terminal-state fee/status glue), section-07 (shared worker, systemd unit, secrets discipline), section-09 (surfaces submitting through `queueHermesMediaJob`)
**Blocks:** nothing — this is the final hardening pass; it must land after 07 and 09.
**Test command:** `pnpm --dir apps/web test` (Vitest; paths below relative to `apps/web/` unless absolute)

---

## 1. Purpose and context

Every functional piece of Feature 135 exists by now. This section makes it
operable and provably safe. Seven deliverables (plan §15 + §17, TDD §15/§16/§17):

1. **Audit events end-to-end** — JSONL audit protocol
   (`server/services/auditLogger.ts`, `auditLogger.log(...)`, traceId
   propagated end-to-end): connection connect / authorize / disconnect /
   revoke / entitlement-restricted; media-job submit; admission rejections
   with their `HermesMediaErrorCode`. Job claim/complete/fail/cancel already
   flow through the generic `worker_job_*` emissions in
   `workerRegistryService.ts` (claim emission at :1297, terminal at :1468) —
   this section only verifies coverage and enriches metadata with
   `connectionId` for hermes job types.
2. **`provider_usage_log` rows** for completed hermes jobs (provider
   `xai-hermes`, cost unknown → recorded as provider-account usage) plus the
   **daily quota counter bump** — the same Redis counter section-05's
   admission reads (`buildHermesQuotaKey` exported there; do NOT invent a
   second key shape).
3. **Admin panels** — worker fleet rows surface hermes runtime readiness +
   hermes version; a new admin section shows connections per scope, quota
   consumption, and kill-switch states. (Scope note: this minimal
   read-only view is deliberately pulled forward from spec §18's phase-5
   "quotas dashboard" — operating the shared pool safely requires seeing
   quota consumption from day one. The full dashboard — history, charts,
   per-user breakdowns — remains phase 5.)
4. **RenderJobsPage labels** — Thai labels for the hermes job types in
   `JOB_TYPE_LABELS` (no other changes; the `workerJobs` router already
   lists these jobs).
5. **Token-leak CI grep test** — a lint-style Vitest file (same idea as
   section-01's `hermesMediaNamespaceGuard.test.ts`) asserting no hermes
   source logs device codes / auth.json contents / token-like values, plus
   a masking-helper unit test (≤4 chars of any token in diagnostics —
   spec §16).
6. **Load assertion of admission control** — a concurrency test proving the
   admission limits hold under parallel submission (no cap ever exceeded;
   batch admission is all-or-nothing).
7. **Ops docs** — `run-services.sh` status listing includes
   `smartspec-hermes-worker.service`; unit install + pairing steps written
   down (the unit file itself shipped in section-07).

Namespace guard (section-01 invariant): no file touched here may import
`queueHermesWorkerJob` or `hermesAgentRuntime` (agent-gateway lane).
Secrets rule (spec §16): nothing in this section may put prompts, reference
URLs, device codes, or token material into audit metadata — audit payloads
respect prompt-privacy settings and `sanitizePayload` is not a license to
log secrets.

---

## 2. Files

| Action | Path | Purpose |
|---|---|---|
| Edit | `server/services/auditLogger.ts` | Add hermes members to the `AuditEventType` union |
| Create | `server/services/hermesMediaObservability.ts` | One thin module: audit-emit helpers, `recordHermesUsage`, quota bump, `xai-hermes` provider row resolution |
| Edit | `server/services/hermesMediaScheduler.ts` | Emit submit + admission-rejection audit events; stamp `traceId` into the job (instructionsJson) at enqueue |
| Edit | `server/services/hermesConnectionService.ts` | Emit connect-started / disconnect / revoke / admin-quota-change audit events |
| Edit | `server/services/hermesConnectionJobs.ts` | Fill section-04's optional audit hooks: authorized / reauth_required / entitlement_restricted; call `recordHermesUsage` from the terminal-state settlement path |
| Edit | `server/routes/workerRuntime.ts` or `server/services/hermesMediaFinalizeService.ts` | Completion hook: usage row + quota bump after finalize succeeds (single call site, idempotent) |
| Edit | `server/services/workerRegistryService.ts` | Enrich `worker_job_claimed` / terminal audit metadata with `connectionId` + `traceId` when jobType is `hermes_*` |
| Edit | `server/routers/hermesConnections.ts` | New `adminOverview` query (connections per scope + quota consumption + kill-switch/settings snapshot) |
| Edit | `server/services/workerFleetService.ts` | `WorkerFleetSummary` rows expose hermes readiness + version from `capabilitiesJson` (projection only) |
| Create | `client/src/components/admin/HermesWorkerAdminPanel.tsx` | Admin panel section (connections per scope, quota bars, kill-switch states) |
| Edit | `client/src/pages/AdminMonitoring.tsx` | Mount the panel near the existing worker-fleet UI (`workerFleetQuery` at :2017); show hermes badge/version on fleet rows |
| Edit | `client/src/pages/RenderJobsPage.tsx` | `JOB_TYPE_LABELS` entries (:58) |
| Edit (verify only) | `shared/hermesMedia.ts` | `maskTokenLike(value: string): string` was added by section-04's additive block — this section only TESTS it (add it here only if section-04's block is somehow missing) |
| Edit | `run-services.sh` | Status listing + stop path include `smartspec-hermes-worker.service` |
| Create | `docs/HERMES_MEDIA_WORKER_OPS.md` | Unit install, pairing, rotation, kill-switch runbook |
| Create | `server/services/__tests__/hermesMediaObservability.test.ts` | Tests §3.1–§3.2 |
| Create | `server/routers/__tests__/hermesConnections.adminOverview.test.ts` | Tests §3.3 |
| Create | `client/src/components/admin/__tests__/HermesWorkerAdminPanel.test.tsx` | Tests §3.3 (UI) |
| Edit | `client/src/pages/__tests__/RenderJobsPage.test.tsx` | Tests §3.4 |
| Create | `server/services/__tests__/hermesTokenLeakGuard.test.ts` | Tests §3.5 |
| Create | `server/services/__tests__/hermesMediaAdmission.load.test.ts` | Tests §3.6 |

---

## 3. Tests first (write these before implementation)

Conventions: Vitest from `apps/web`, injected deps (`vi.fn()` repos, fake
Redis/counter store, spied `auditLogger.log`), no real DB/network. Reuse
the fixture builders from sections 05/06 tests where job rows are needed.

### 3.1 Audit coverage — `hermesMediaObservability.test.ts` (+ spy cases added to existing scheduler/connection test files)

- **Event-type completeness:** each helper in
  `hermesMediaObservability.ts` calls `auditLogger.log` with the expected
  `eventType`, `userId`, `tenantId`-in-metadata, `traceId`, and
  `connectionId`; assert against a spied `auditLogger`.
- **Submit:** `queueHermesMediaJob` success path emits
  `hermes_media_job_submitted` with `{ jobId, jobType, connectionId, scope,
  operation, batchSize }` — and NEVER the prompt text or reference URLs
  (assert the logged metadata object has no `prompt`/`url` keys, same
  assertion style as section-06 §3.5).
- **Admission rejection:** a rejected submit emits
  `hermes_media_admission_rejected` with the exact
  `HermesMediaErrorCode` (`HERMES_QUEUE_FULL`, `HERMES_RATE_LIMITED` with
  `retryAfterSeconds`, `HERMES_QUOTA_EXHAUSTED` — table-test the codes).
- **Connection lifecycle:** `startConnect` → `hermes_connection_connect_started`;
  section-04 settlement marking a row `authorized` →
  `hermes_connection_authorized`; `disconnect`/revoke →
  `hermes_connection_disconnected` / `hermes_connection_revoked`;
  entitlement-403 classification → `hermes_connection_entitlement_restricted`.
  None of these events may contain a device `userCode`/`verificationUrl`
  (spy over all calls — the section-04 rule, now locked in).
- **Claim/terminal enrichment:** for a `hermes_media_*` job the existing
  `worker_job_claimed` and `worker_job_completed|failed|canceled` emissions
  include `metadata.connectionId` and the enqueue-time `traceId`;
  regression: a non-hermes job's emission is byte-identical to before.
- **traceId end-to-end:** the traceId stamped at enqueue is the one that
  appears on submit, claim, terminal, and usage events for the same job
  (single fixture walked through all hooks).

### 3.2 Usage + quota — same test file

- **Completed job** → exactly one `provider_usage_log` row: provider
  resolves to the `xai-hermes` `llm_providers` row (find-or-create helper
  — see §4.2), `modelUsed` from the contract's model key, `creditsCharged` =
  the platform fee actually kept (0 for personal/private),
  `requestType: "hermes_media"`, `traceId` set, `costUsd` `"0"` (cost is
  borne by the provider account — no per-token math ever).
- **Quota bump:** completion increments the section-05 counter via the
  imported `buildHermesQuotaKey(connectionId, date)` — assert the fake
  counter store received that exact key; a subsequent
  `checkHermesMediaAdmission` against the same fake store sees the
  incremented value (proves writer and reader share one key).
- **Idempotent:** double invocation of the completion hook (poll path +
  sweep path) writes one usage row and one increment (Redis idempotency
  key mirrors the `credit:reconciled:` pattern from section-06).
- **Failed/canceled jobs:** no usage row, no quota bump (quota counts
  completed generations only — matches admission semantics from
  section-05).
- Find-or-create of the `xai-hermes` provider row is cached and never
  enables the provider for LLM routing (row created disabled / no API key;
  assert insert payload).

### 3.3 Admin surfaces

`hermesConnections.adminOverview.test.ts` (router-level, injected service):
- admin-only (`adminProcedure`; non-admin ctx → FORBIDDEN).
- Returns per-scope groupings of `SafeHermesConnection` rows (no secret
  fields — reuse section-03's safe-shape assertion), each with
  `{ dailyJobQuota, usedToday, queueDepth }` where `usedToday` reads the
  same quota counter and `queueDepth` counts non-terminal worker_jobs for
  the connection.
- Includes a settings snapshot built from the section-01
  `hermesWorkerSettings` key constants: the five kill-switch flags
  (`hermes_worker_enabled`, `..._shared_pool_enabled`,
  `..._server_personal_enabled`, `..._private_enabled`,
  `..._video_enabled`), fee, and `hermes_worker_min_version` — as
  `configured` values only, never raw `system_settings` dumps.

`HermesWorkerAdminPanel.test.tsx` (jsdom + mocked tRPC, same pattern as
existing admin component tests):
- Renders scope sections, quota consumption (`usedToday`/`dailyJobQuota`),
  and kill-switch on/off states; disabled flag renders the "off" state
  visibly (Thai primary copy).
- Worker fleet row fixture with
  `capabilitiesJson: { hermesMedia: true, hermesVersion: "0.18.2" }`
  renders a hermes badge + version; a fleet row without it renders
  unchanged (regression).

### 3.4 RenderJobsPage labels — extend `RenderJobsPage.test.tsx`

- `formatJobType("hermes_media_image_generate")` /
  `("hermes_media_video_generate")` (and the three `hermes_connection_*`
  types) return Thai labels, not the raw string; unknown job types still
  fall back to the raw string (existing behavior untouched).

### 3.5 Token-leak guard — `hermesTokenLeakGuard.test.ts`

Lint-style source scan (fs read of checked-in sources at test time — model
on `hermesMediaNamespaceGuard.test.ts`; runs in normal CI via `pnpm test`):
- Enumerate all Feature-135 server sources: `server/hermesWorker/**/*.ts`,
  `server/services/hermes*.ts`, `server/routers/hermesConnections.ts`
  (exclude `__tests__`).
- Assert no logging/audit call site references the forbidden identifiers
  in a log context: `userCode`, `verificationUrl`, `auth.json` file reads
  piped to a logger, `HERMES_WORKER_TOKEN`. Implement as line-level regex
  over statements containing `logger.`, `console.`, `auditLogger.log`,
  with an explicit allowlist for the one legal sink (the
  `hermes_device_code` `worker_job_events` payload writer in section-04's
  module) — the allowlist is a named constant so additions are reviewable.
- Assert no `console.log`/`console.error` at all under `server/hermesWorker/`
  (structured logger only).
- Masking helper: `maskTokenLike("sk-abc123456789")` keeps ≤4 leading chars
  + fixed mask; short strings (<8 chars) fully masked; helper applied by the
  worker diagnostics exporter (assert the diagnostics module imports it —
  grep-level, not behavioral, if section-07 already tested behavior).

### 3.6 Admission load assertion — `hermesMediaAdmission.load.test.ts`

Against a fake atomic counter store (in-memory, but honoring the same
atomic check-and-increment contract the Redis implementation uses):
- Fire 50 concurrent `queueHermesMediaJob` calls (Promise.all, single user,
  single shared connection, queued-cap 8): exactly 8 succeed, 42 reject
  `HERMES_QUEUE_FULL`; the fake store's high-water mark never exceeds 8
  (no lost-update overshoot).
- Concurrent batch submits (batchSize 4, cap 8): admitted batches are
  all-or-nothing; total admitted jobs ≤ cap; no partial batch.
- Sliding-window: 50 concurrent submits with window 10/user → exactly 10
  admitted, rejections carry `retryAfterSeconds > 0`.
- Daily quota under parallelism: quota 5, 20 concurrent completions racing
  20 concurrent submits → admitted + already-consumed never exceeds 5 by
  more than the documented in-flight allowance (the invariant section-05
  defined — read its test file and mirror the exact semantics rather than
  inventing new ones).
- This is a fast deterministic Vitest file (fake store, fake clock), not a
  wall-clock benchmark; keep total runtime under a few seconds.

---

## 4. Implementation guidance

### 4.1 Audit events (`auditLogger.ts` + `hermesMediaObservability.ts`)

Add to the `AuditEventType` union (auditLogger.ts, next to the existing
`worker_*` members):

```ts
| "hermes_connection_connect_started"
| "hermes_connection_authorized"
| "hermes_connection_disconnected"
| "hermes_connection_revoked"
| "hermes_connection_entitlement_restricted"
| "hermes_media_job_submitted"
| "hermes_media_admission_rejected"
| "hermes_media_usage_recorded"
```

`hermesMediaObservability.ts` exports one small helper per event, e.g.:

```ts
export function auditHermesSubmit(params: {
  traceId: string; userId: number; tenantId: string;
  jobId: string; jobType: string; connectionId: string;
  scope: HermesConnectionScope; operation: string; batchSize?: number;
}): void; // auditLogger.log({ eventType: "hermes_media_job_submitted", ... })

export function auditHermesAdmissionRejected(params: {
  traceId: string; userId: number; tenantId: string;
  connectionId?: string; code: HermesMediaErrorCode; retryAfterSeconds?: number;
}): void;
// ... one per event type; all metadata-only, never prompt/URL/token fields.
```

Call sites stay one-liners: scheduler (submit + rejection),
`hermesConnectionService` (connect-started, disconnect, revoke),
`hermesConnectionJobs` settlement (authorized, entitlement-restricted,
reauth-required → use the `hermes_connection_revoked` /
`..._entitlement_restricted` types as mapped in §3.1). Section-04
deliberately left these as "thin optional hooks" — fill them now, do not
restructure its settlement logic.

traceId: the scheduler already runs inside a request context
(`getTraceId()` via `auditLogger`); persist it at enqueue into
`instructionsJson.traceId` so the claim/terminal/usage emissions (which run
outside the original request) can reuse it. Enrichment in
`workerRegistryService`: where the claim/terminal `auditLogger.log`
metadata objects are built (:1297, :1468), add
`connectionId: job.capabilityRequirementsJson?.connectionId` and
`traceId: job.instructionsJson?.traceId` **only when
`job.jobType.startsWith("hermes_")`** — keep other job types byte-identical.

### 4.2 Usage rows + quota counter

In `hermesMediaObservability.ts`:

```ts
export async function recordHermesUsage(params: {
  job: WorkerJobRecord; // completed hermes_media_* job
  contract: HermesMediaJobContract;
  feeCreditsKept: number;
}, deps?: { db?; counterStore?; redis?; now? }): Promise<void>;
// 1. Redis idempotency guard (`hermes:usage:recorded:<jobId>`, TTL ~7d).
// 2. resolveHermesUsageProviderId(): find llm_providers row by
//    providerName "xai-hermes"; create-if-missing (displayName
//    "xAI Hermes (provider account)", hasApiKey false — never routable);
//    module-level cache of the id. providerId is NOT NULL in
//    provider_usage_log (schema.ts:1139) — this row is why.
// 3. Insert provider_usage_log row (mirror costTracker.logRequest's
//    insert shape; costUsd "0", inputTokens/outputTokens 0,
//    requestType "hermes_media", traceId, statusCode 200).
// 4. INCR buildHermesQuotaKey(connectionId, today) + set expiry (48h)
//    — import the key builder from hermesMediaAdmission.ts (section 05).
// 5. auditHermesUsageRecorded(...).
```

Invocation point: exactly one — after `finalizeHermesMediaArtifact`
succeeds (the `publishing → completed` transition), in the same dispatch
added by section-06 in `routes/workerRuntime.ts`; the section-04/06
terminal-state sweep calls the same function for lease-expiry completions.
Failures of usage recording must not un-complete the job (log + audit
`error`, never throw into the artifact route).

### 4.3 Admin panels

Server: `adminOverview` in `routers/hermesConnections.ts`
(`adminProcedure.query`) delegating to a new
`getHermesAdminOverview({ tenantId })` in `hermesConnectionService.ts`
(or the observability module). Compose from existing pieces:
`adminListHermesConnections` (section-03) + per-connection
`usedToday` (quota counter read) + `queueDepth` (non-terminal worker_jobs
count, same query shape the scheduler's auto-pick uses) + a settings
snapshot from `getHermesWorkerSettings()` (section-01) — expose only the
typed values, never raw `system_settings` rows.

Fleet: in `workerFleetService.listWorkerFleet`'s summary projection add
optional `hermes?: { ready: boolean; version: string | null }` read from
the worker's `capabilitiesJson` (`hermesMedia`, `hermesVersion` — the
shapes sections 07/11 registered). Pure projection; no schema change.

Client: `HermesWorkerAdminPanel.tsx` consumes
`trpc.hermesConnections.adminOverview.useQuery()`; render scope sections
(`server_shared` / `server_personal` / `private_worker`), quota progress,
and kill-switch badges. **Read-only by design** — admin mutations
(connect shared / quota / disable) live solely in section-10's
`HermesConnectPanel` admin sub-panel; this monitoring panel links there
("จัดการที่หน้า Settings") instead of wiring its own mutations, so the two
admin surfaces cannot diverge (one writer rule). Mount inside
`AdminMonitoring.tsx` adjacent to the existing worker-fleet rendering
(around the `workerFleetQuery` usage, :2017–:2188); add the hermes
badge/version to the fleet row rendering via the new summary field. Thai
copy primary, English secondary, consistent with the section-10 panels.
Keep the panel lazily rendered with the fleet section (AdminMonitoring is
already heavy).

### 4.4 RenderJobsPage labels

Add to `JOB_TYPE_LABELS` (RenderJobsPage.tsx:58): the two media types
(e.g. `hermes_media_image_generate: "สร้างภาพ (Grok ผ่าน Hermes)"`,
video equivalent) and the three `hermes_connection_*` control types
(short Thai labels). Import nothing new; `formatJobType` fallback stays.

### 4.5 Token-leak guard + masking

Test-only for the scan (no production code), plus the masking helper if
section-07 didn't export one — prefer `shared/hermesMedia.ts` (importable
by both the Node worker and the web server; section-11's Rust side has its
own redaction, out of scope here):

```ts
export function maskTokenLike(value: string): string;
// >=8 chars → first 4 + "…", else full mask; never returns >4 original chars.
```

If the CI grep finds an existing violation in sections 04–11 code, fix the
call site (remove/mask the value) rather than allowlisting it — the
allowlist exists solely for the `hermes_device_code` event payload writer.

### 4.6 Admission load test

No production changes expected — this test exists to catch a non-atomic
check-then-increment in section-05's limiter. If it fails, fix the counter
store contract in `hermesMediaAdmission.ts` (atomic
increment-and-check / Lua-style compare, matching the existing custom
limiter family), not the test.

### 4.7 Ops docs + `run-services.sh`

- `run-services.sh`: add `smartspec-hermes-worker.service` to the status
  listing — the real status display lives in **`cmd_status()`
  (run-services.sh:617, per-service echo lines ~L678-703)**; do NOT touch
  `cleanup_screen_conflicts()` (~L121-129) thinking it is the status list —
  that loop kills orphaned non-systemd processes. Also add the unit to the
  stop path (~:589). Do NOT auto-start it — install/enable is a
  deliberate admin step (spec §8). Run
  `./scripts/validate-all-configs.sh` after editing per CLAUDE.md.
- `docs/HERMES_MEDIA_WORKER_OPS.md` must contain, beyond unit install
  (`sudo cp docker/systemd/smartspec-hermes-worker.service /etc/systemd/system/`
  + `daemon-reload` + `enable --now`), the `/etc/smartspec/hermes-worker.env`
  token file (0600, created by `scripts/pair-hermes-worker.ts`, rotation =
  re-pair + swap + restart), kill-switch keys, quota counter semantics, and
  the audit-log queries (grep by traceId per the CLAUDE.md protocol):

  1. **Phase-1 go-live flag-flip sequence (ordered checklist):**
     (1) pair the shared worker (`pair-hermes-worker.ts` → env file +
     `hermes_shared_worker_id` setting) → (2) start unit, verify heartbeat
     online in the fleet panel → (3) run
     `seed-media-models-hermes-grok.ts` (rows land disabled) → (4) flip
     global `hermes_worker_enabled` → (5) flip the tenant flag
     `hermesMediaWorker` for the pilot tenant → (6) flip scope flag(s)
     (`server_personal` first, then `shared_pool` after an admin
     connection exists) → (7) enable the two image model rows →
     (8) connect one account, run one text-to-image smoke on
     https://smartaihub.app → (9) video flag + video row only at phase 3.
     Rollback at any step = flip the same flags off (rollback is
     flags-only by design).
  2. **Web-health-under-load verification (owns the spec §20 criterion
     "the web service stays healthy under saturated Hermes load"):**
     post-deploy, saturate the shared worker (submit jobs until
     per-worker concurrency + queue caps are pinned, e.g. scripted
     submissions from 2 users) for ≥15 minutes while watching
     (a) `smartspec-web.service` p95 latency on an unrelated endpoint and
     journal error rate — must stay within the pre-test baseline ±10%,
     (b) `systemctl show smartspec-hermes-worker -p MemoryCurrent` stays
     under MemoryHigh, (c) zero D-state ffmpeg/hermes processes, load avg
     sane. Pass/fail recorded in the ops doc; owner: the deploying admin.
  3. **Phase 1–3 → phase 4 gate (concrete):** phase-4 (Worker App) work
     starts only after the shared worker has run ≥7 days in production
     with ≥50 completed hermes jobs across ≥3 connections covering BOTH
     server scopes, zero unresolved HIGH-severity incidents, and the
     load verification (item 2) passed. Sign-off: product owner records
     date + metrics in the ops doc.

  Documentation only — no scripts executed as part of this section.

---

## 5. Verification

1. New/edited test files in §3 pass:
   `pnpm --dir apps/web test -- hermes` (then full `pnpm --dir apps/web test`).
2. Regressions green: existing `auditLogger`, `workerRegistryService` claim,
   `workerFleetService`, `RenderJobsPage`, `hermesConnections` router, and
   admission/scheduler test suites unchanged in behavior.
3. `pnpm --dir apps/web check` — no new type errors beyond the known
   pre-existing baseline.
4. Section-01 namespace-guard test still green; new §3.5 token-leak guard
   green against ALL Feature-135 sources (sections 03–11 included).
5. Grep sanity on new code: no `console.log` in server code paths; audit
   metadata contains ids only (no prompt text, reference URLs, device
   codes, or >4 chars of any token).
6. Manual ops check (documented, performed at deploy time, not in CI):
   `./run-services.sh status` lists the hermes worker unit; admin panel
   renders on https://smartaihub.app with flags off (everything reads
   "disabled", nothing crashes — deployable dark).
---

## IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete — the final section. 631/632 in the combined run (the 1
failure is a pre-existing JWT_SECRET test-isolation flake in
workerFleetService, unrelated); typecheck baseline unchanged.

Review found 2 MAJORs that all-green tests could not have caught — both fixed:

1. **The load test was a rubber stamp.** Its core "quota under parallelism"
   scenario asserted `admittedCount >= 0 && <= 20` (tautologies) while its
   docstring claimed to prove the lost-update invariant. Rewritten into 4 real
   tests asserting the per-decision invariant (observed usage + batch <= QUOTA)
   — and made non-vacuous *provably*: flipping the fake store to non-atomic
   makes it fail (`expected 1 to be 20`), and that mutation check is now a
   permanent test in the suite.
2. **Usage "exactly once" failed open on a routine path.** Idempotency rested
   on a Redis SET NX whose error handler returns "proceed", while the sweep
   re-processed EVERY hermes job (the poll path never wrote the settled
   marker, contrary to the comments) — so one Redis hiccup meant a duplicate
   provider_usage_log row + double quota bump on ordinary jobs. Fixed both
   ways: the poll path now calls settleHermesConnectionJob (writing the
   marker, making the sweep a genuine backstop), and a durable
   worker_job_events marker (HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE) is
   checked before Redis and before the insert, so a Redis outage degrades to
   "usage delayed", not duplicated. No migration added (check-then-insert;
   a unique constraint would need one — flagged, not taken).

Also fixed: the dual-traceId ambiguity (the scheduler now reuses the
contract's own traceId as the audit trace — one value in both blobs, so the
CLAUDE.md "grep by traceId" protocol works from either); and the most common
real-world break — provider-side revocation via probe/auth failure
(reauth_required) — is now audited (new hermes_connection_reauth_required
event), where previously only admin-forced disable emitted anything.

Deviations accepted: disconnected (self-service) vs revoked (admin-forced)
event mapping; HermesFleetBadge extracted for testability; the daily-quota
load test proves no-lost-updates + per-decision consistency rather than an
exact admitted count (no hard real-time bound exists — the quota gate is
completion-lag-tolerant by design).

Ops runbook: `apps/web/docs/HERMES_MEDIA_WORKER_OPS.md` (unit install,
pairing/rotation, kill-switch keys, quota semantics, audit queries, the
9-step flag-flip order + rollback, web-health-under-load verification with
pass/fail + owner, phase-4 gate criteria).

Review trail: `../implementation/code_review/section-12-{diff,review,interview}.md`.
