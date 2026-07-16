# Section 05 — Admission Control + Scheduler (`hermesMediaAdmission` / `hermesMediaScheduler` / claim gating)

Feature: 135 Hermes Grok Media Worker
Plan source: `../claude-plan.md` §7 (+ §3 contract facts, §16 step 3) · TDD source: `../claude-plan-tdd.md` §7 · Normative spec: `../spec.md` §9, §10.2, §13.7, §14
Test command: `pnpm --dir apps/web test` (Vitest; run from `apps/web` in worktrees — root run breaks `@shared`).

## 1. Goal

Build the single server-side entry point through which EVERY generation surface submits a Hermes media job, plus the admission control that protects the shared host and the claim-time gating that stops the wrong worker from taking a Hermes job.

Three deliverables:

1. **`apps/web/server/services/hermesMediaAdmission.ts`** (new) — Redis-backed limiter enforcing spec §9 limits, exposing `checkHermesMediaAdmission`.
2. **`apps/web/server/services/hermesMediaScheduler.ts`** (new) — `queueHermesMediaJob`: flags → single-pass connection resolution → admission → shared-pool-only fee reserve → contract parse → non-terminal-only idempotency → `runtimeType`-follows-worker `worker_jobs` insert → returns `taskId = "hermes_" + jobId`.
3. **Claim gating edits in `apps/web/server/services/workerRegistryService.ts`** — required claim capability + connection affinity inside `claimWorkerJob`'s candidate loop, following the existing `remotion_render_video` precedent.

No new queue infrastructure: jobs are ordinary `worker_jobs` rows claimed through the existing `/api/worker-jobs/*` control plane.

## 2. Dependencies and consumers (reference only — do not re-implement)

Depends on (must exist before this section):

- **section-01-shared-contracts**: `shared/hermesMedia.ts` (`HermesMediaJobContract` zod schema, `HermesMediaErrorCode` + the 22 codes, `effectiveHermesCapability`), `shared/workerRuntime.ts` constants (`HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate"`, `HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate"`, the three `hermes_connection_*` control types, `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media"`, `HERMES_MEDIA_CAPABILITY_FAMILIES = ["hermes-media-generation"]`), and `server/services/hermesWorkerSettings.ts` (TTL-cached `system_settings` reads for `hermes_worker_enabled`, per-scope flags, limit overrides, `hermes_shared_pool_fee_credits`, `hermes_shared_worker_id`).
- **section-02-db-schema**: `hermesProviderConnections` table + `HermesProviderConnection` type (`scope`, `status`, `assignedWorkerId`, `dailyJobQuota`).
- **section-03-connection-service-router**: connection rows exist and reach `authorized`; the scheduler consumes them read-only.

Blocks / consumed by:

- **section-06** builds the `hermes_` task projection on top of the jobs this scheduler inserts; **section-07** (shared worker) and **section-11** (Worker App) claim these jobs; **section-09** wires every VD surface + `media.ts` into `queueHermesMediaJob`; **section-12** load-asserts the admission control.

Existing code this section reuses unchanged (read these before implementing):

- `apps/web/server/services/workerSchedulerService.ts` — enqueue template `queueVerticalDramaFfmpegAssemblyJob` (~L1066) and the billed variant `queueDesktopVideoAssemblyJob` (~L871: `reserveCredits?`/`getFeatureFlags?` deps, kill-switch check, `workerBilling` block in `instructionsJson`). Also `WorkerSchedulerRepository` (`findJobByIdempotencyKey`, `findWorkerById`, `insertJob`, …) — the injected-repo pattern all scheduler tests use.
- `apps/web/server/services/workerBillingService.ts` — `reserveWorkerJobCredits` (L62) / `reconcileWorkerJobCredits` (L87).
- `apps/web/server/services/rateLimiter.ts` — the custom Redis limiter family (no new library).
- `apps/web/server/services/workerRegistryService.ts` — `claimWorkerJob` candidate loop (~L1238-1268), `REMOTION_RENDER_VIDEO_REQUIRED_CLAIM_CAPABILITY` doc comment + F133-05 `continue`-not-`throw` fix, `filterClaimableJobsForWorker`, `workerJobMatchesSelection`.
- `shared/featureFlags.ts` tenant flag `hermesMediaWorker` (section-01).

Namespace rule (hard): everything here is `hermesMedia*` / `hermes_media_*`. Never import or reference `queueHermesWorkerJob` or `hermesAgentRuntime` (the unrelated agent-gateway lane). Only the `hermes_agent_gateway` runtime-type *enum value* may appear (as the shared worker's registered type read from the worker row, never hardcoded as the job's runtimeType).

## 3. TDD — write these tests FIRST

Location per project convention: `apps/web/server/services/__tests__/hermesMediaAdmission.test.ts`, `.../hermesMediaScheduler.test.ts`, and claim-gating cases added to the existing `workerRegistryService` claim tests (fake in-memory worker_jobs table pattern from `inlineRenderWorker.test.ts`). Injected deps (`vi.fn()` repos), no DB, no real Redis (inject a fake Redis/counter store or stub the limiter store interface).

### 3.1 `hermesMediaAdmission.test.ts`

- **Per-connection running=1**: with one running job counted on connection C, a second submit for C is rejected `{ ok: false, code: "HERMES_CONNECTION_BUSY" }`.
- **Queued-per-user cap (default 8)**: the 9th queued job for a user rejects with `HERMES_QUEUE_FULL`; the 8th admits.
- **Tenant shared-pool queued cap (default 20)**: applies only to `server_shared` scope; a `private_worker` connection submit is exempt from the tenant cap but still subject to the per-user submission limiter and running=1.
- **Sliding submission windows** (10/user, 60/tenant per 10 min): the 11th user submission inside the window rejects `HERMES_RATE_LIMITED` with a positive `retryAfterSeconds`.
- **`dailyJobQuota` exhaustion**: a shared connection at quota rejects `HERMES_QUOTA_EXHAUSTED` (non-retryable until reset).
- **Batch admission**: `batchSize: 4` (portrait candidate batch) admits in one call under default caps — each candidate counts individually against the queued cap.
- **Limit-coherence invariant**: the settings write-validation helper (exported from this module, called by the settings write path) rejects any configuration where queued-per-user cap < 4 (max batch size). Assert both the reject and that default config passes.
- All defaults readable through an injected `getSettings`/`hermesWorkerSettings` stub — assert an admin override (e.g. queued cap 12) takes effect.

### 3.2 `hermesMediaScheduler.test.ts`

Fixture factory `buildInput()` producing a valid `HermesMediaJobContract` + `{ tenantId, requestedByUserId }`; injected `deps` `{ repo, admission, reserveFee, getFlags, now }`.

- **Flags fail-closed**: global `hermes_worker_enabled` off, tenant `hermesMediaWorker` off, or the per-scope flag off ⇒ typed reject `HERMES_DISABLED`; repo.insertJob never called.
- **Connection authorization**: connection status `pending`/`reauth_required`/`entitlement_restricted`/`disconnected` ⇒ typed reject (`HERMES_REAUTH_REQUIRED` / `HERMES_ENTITLEMENT_RESTRICTED` / `HERMES_CONNECTION_REQUIRED` as appropriate); tenant/owner mismatch ⇒ reject, never another user's connection.
- **Single-pass resolution**: an explicitly configured connection (or user default) that fails admission does NOT fall through to the shared pool — the typed admission error propagates.
- **Shared-pool auto-pick**: with no explicit connectionId on a shared-pool submit, the scheduler picks the eligible `server_shared` connection with lowest queue depth AND daily-quota headroom (fixture with two pool connections, assert the pick).
- **Worker online gate**: assigned worker offline per heartbeat ⇒ `HERMES_WORKER_UNAVAILABLE`.
- **Fee (interview decision 1)**: `reserveFee` spy called iff `scope === "server_shared"` AND `hermes_shared_pool_fee_credits > 0`; assert for all three scopes; `workerBilling` block present in `instructionsJson` only in that case; fee=0 shared-pool submit reserves nothing.
- **insertJob args** (assert the exact values object):
  - `runtimeType` equals the assigned worker's registered type — `desktop_zeroclaw_managed` for a private-worker fixture, `hermes_agent_gateway` for the shared unit; never derived from the feature.
  - `workerId` pinned for `private_worker` scope; null for server scopes (connection pinning rides `capabilityRequirementsJson`).
  - `capabilityRequirementsJson = { capabilityFamilies: HERMES_MEDIA_CAPABILITY_FAMILIES, requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY, connectionId, preferredWorkerId }` and is never caller-overridable.
  - image vs video: `resourceProfile` `network_heavy` vs `long_running`; `timeoutSeconds` 600 vs 1800; `jobType` image vs video constant.
  - `retryPolicyJson { maxAttempts: 2, backoffSeconds: 30 }`, `statusReason: "hermes_media_scheduler"`, `status: "queued"`.
  - `inputJson` is the parsed contract and contains references as `{assetId, index, role, label, sha256}` only — **no URL-shaped fields** (section-09's minting happens at claim time; this test also backs TDD §9's "inputJson has no URLs" assertion).
- **Contract validation**: zod parse failure (e.g. >effective maxReferences, non-continuous indices) ⇒ typed reject (`HERMES_REFERENCE_LIMIT_EXCEEDED` / `HERMES_REFERENCE_MAPPING_CONFLICT`) before admission/fee.
- **Operation-unsupported gate (owns spec §20 criterion "unsupported
  reference-to-video is visibly blocked")**: a `video.reference_to_video`
  contract against a connection whose manifest does not advertise it (or
  with `hermes_worker_reference_to_video_enabled` off) ⇒ typed reject
  `HERMES_OPERATION_UNSUPPORTED` before admission — never silently
  degraded to image-to-video or reference-dropping. Same gate for any
  operation the effective capability disables.
- **Idempotency (non-terminal only)**: duplicate submit while the first job is queued/running ⇒ `{ created: false, job: existing }` and no second fee reserve; same contract resubmitted after the first job is `failed`/`canceled`/`expired`/`completed` ⇒ creates a fresh job (attempt-suffixed key).
- **Return shape**: `taskId === "hermes_" + job.id`.

### 3.3 Claim gating (extend workerRegistryService claim tests, fake-table pattern)

- A `hermes_media_*` candidate is skipped (`continue`) when the claim's `capabilityHints` lack `hermes_media`; same for `hermes_connection_*` candidates.
- Connection affinity: candidate whose `capabilityRequirementsJson.connectionId` resolves (via the connection row's `assignedWorkerId`) to a DIFFERENT worker is skipped even when the hint is present — a user with two machines can never cross-claim.
- **No availability regression** (mirror of the F133-05 remotion fix): a worker with empty hints and an unrelated claimable job in the same candidate pool still claims the unrelated job in the same pass — the hermes assertion `continue`s, never throws.
- Existing remotion + private-mode (`filterClaimableJobsForWorker`) tests pass unchanged.

## 4. Implementation

### 4.1 `apps/web/server/services/hermesMediaAdmission.ts` (new)

```ts
export interface HermesAdmissionResult
  { ok: true } | { ok: false; code: HermesMediaErrorCode; retryAfterSeconds?: number };

export async function checkHermesMediaAdmission(params: {
  tenantId: string; userId: number;
  connection: HermesProviderConnection;
  operation: HermesMediaOperation;
  batchSize?: number;             // portrait batch counts each candidate
}, deps?: { /* injected counter store + settings + job counters for tests */ }): Promise<HermesAdmissionResult>;

/** Called by the settings write path (systemSettings hook, section-01 wiring):
 *  rejects queued-per-user cap < 4 (max batch). */
export function validateHermesLimitCoherence(limits: HermesAdmissionLimits): { ok: boolean; reason?: string };
```

Notes:

- Follow the `server/services/rateLimiter.ts` custom-limiter family for the sliding windows (Redis sorted-set or fixed-bucket approach already in that file — no new library). Running/queued counts come from `worker_jobs` (count queries by `capabilityRequirementsJson.connectionId` / `requestedByUserId` / tenant + shared scope), injected as a small repo interface so tests need no DB.
- Check order (cheapest → most specific), each mapping to its code from spec §13.7: per-connection running=1 → `HERMES_CONNECTION_BUSY`; queued-per-user (8) and tenant shared-pool queued (20, `server_shared` only) → `HERMES_QUEUE_FULL`; sliding windows (10/user, 60/tenant shared per 10 min) → `HERMES_RATE_LIMITED` + `retryAfterSeconds`; `dailyJobQuota` → `HERMES_QUOTA_EXHAUSTED`. `batchSize` is added to queued/window counts atomically (admit all 4 or none).
- Private workers: exempt from the tenant shared-pool caps, keep running=1 and the per-user submission limiter (control-plane protection, spec §9).
- All defaults read through `hermesWorkerSettings.ts` (section-01); the daily-quota counter is the same counter section-12 increments on completion — define its Redis key shape here (e.g. `hermes:quota:<connectionId>:<YYYY-MM-DD>`) and export the key builder for reuse.
- Control jobs (`hermes_connection_*`) are exempt from this limiter (enforced by the scheduler only calling it for media types; section-04 caps control jobs at 1/connection itself).

### 4.2 `apps/web/server/services/hermesMediaScheduler.ts` (new)

Template: `queueVerticalDramaFfmpegAssemblyJob` + the billed `queueDesktopVideoAssemblyJob` variant in `workerSchedulerService.ts`.

```ts
export async function queueHermesMediaJob(
  rawInput: HermesMediaJobContract & {
    tenantId: string; requestedByUserId: number;
    priority?: number; idempotencyKey?: string;
  },
  deps: {
    repo?: WorkerSchedulerRepository & HermesSchedulerRepoExtras; // findConnectionById, listEligibleSharedConnections, isWorkerOnline, countQueuedForConnection
    admission?: typeof checkHermesMediaAdmission;
    reserveFee?: typeof reserveWorkerJobCredits;
    getFlags?: (tenantId: string) => Promise<TenantFeatureFlags>;
    getSettings?: typeof getHermesWorkerSettings;
    now?: () => Date;
  } = {},
): Promise<{ created: boolean; taskId: string; job: WorkerJobRecord }>;
```

Flow (each numbered step is a test target above; fail closed with the typed `HermesMediaErrorCode` — throw `TRPCError` with `message: formatHermesErrorMessage(code, detail?)` per the pinned section-01 convention, so routers pass errors through untranslated and the client extracts the code from the `[HERMES_X]` prefix):

1. Flags: global `hermes_worker_enabled` + tenant `hermesMediaWorker` + per-scope flag (`hermes_worker_shared_pool_enabled` / `hermes_worker_server_personal_enabled` / `hermes_worker_private_enabled`; video ops also require `hermes_worker_video_enabled`) → `HERMES_DISABLED`.
2. Resolve connection: explicit `connectionId` from the contract, else the caller's default for the asset type, else (shared pool) auto-pick lowest-queue-depth eligible `server_shared` connection with quota headroom. Enforce tenant + (for personal/private) owner match; status must be `authorized`. **Single pass — no tier fallback.**
3. Assigned worker online per latest heartbeat → else `HERMES_WORKER_UNAVAILABLE`.
4. `checkHermesMediaAdmission` (batchSize from `settings.outputCount` where the surface submits one job per output, else 1 — portrait batch callers pass per-candidate jobs, so batchSize is the caller's batch count on the first admission call; keep the parameter explicit).
5. Fee: iff `scope === "server_shared"` && `hermes_shared_pool_fee_credits > 0` → `reserveFee(...)` and write the `workerBilling` block into `instructionsJson` (same shape `queueDesktopVideoAssemblyJob` writes). Other scopes never bill.
6. Contract: strip queue-only fields, `hermesMediaJobContractSchema.parse(core)` (schema lives in `shared/hermesMedia.ts`, section-01) + capability check via `effectiveHermesCapability(modelRow, connection.capabilitiesJson, operation)` for reference count / operation enablement.
7. Idempotency: `rawInput.idempotencyKey ?? \`${jobType}:${connectionId}:${sha256(canonicalContract).slice(0, 32)}\``. Dedupe with `repo.findJobByIdempotencyKey` **against non-terminal jobs only** — a terminal match does not block; the fresh row gets an attempt-suffixed key (`...:a2`). (If the existing repo helper returns terminal rows, add a status filter in the hermes path rather than changing shared behavior.)
8. `repo.insertJob` with the values asserted in §3.2 (runtimeType from `repo.findWorkerById(connection.assignedWorkerId).runtimeType`; `requestedBySystemComponent: "hermes_media_scheduler"`; `instructionsJson.intent` + `requiredProgressStages` matching section-07's event sequence: `downloading_references, starting_hermes, generating, collecting_output, validating_output, uploading`).
9. Return `{ created, taskId: "hermes_" + job.id, job }`.

On any failure AFTER a successful fee reserve (insert error), release the reservation before rethrowing (use the existing reconcile/refund helper; test optional but recommended).

### 4.3 Claim gating — edit `apps/web/server/services/workerRegistryService.ts`

Inside `claimWorkerJob`'s candidate loop (directly after the existing remotion assertion, ~L1263):

- Add `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` import from `shared/workerRuntime.ts` and a helper `isHermesFabricJobType(jobType)` covering `hermes_media_*` + `hermes_connection_*` (constants, not regex on arbitrary strings).
- Assertion 1 (capability): if candidate is a hermes job type and `!input.payload.capabilityHints.includes(HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY)` → `continue` (never throw — copy the F133-05 comment discipline).
- Assertion 2 (connection affinity): if the candidate's `capabilityRequirementsJson.connectionId` is set, resolve the connection row's `assignedWorkerId` (add a narrow repo method, e.g. `getHermesConnectionAssignedWorkerId(connectionId)`, so tests can stub it; cache per claim call) and `continue` unless it equals the claiming `worker.id`. This layers on top of — never replaces — the existing `filterClaimableJobsForWorker` owner check and pinned `workerId` for private scope.
- Do not touch `listClaimableJobs`, `workerJobMatchesSelection`, or the remotion assertion itself.

## 5. Files summary

| File | Action |
|---|---|
| `apps/web/server/services/hermesMediaAdmission.ts` | create |
| `apps/web/server/services/hermesMediaScheduler.ts` | create |
| `apps/web/server/services/workerRegistryService.ts` | edit (claim loop: 2 assertions + repo method) |
| `apps/web/server/services/__tests__/hermesMediaAdmission.test.ts` | create |
| `apps/web/server/services/__tests__/hermesMediaScheduler.test.ts` | create |
| `apps/web/server/services/__tests__/workerRegistryService*.test.ts` | extend (claim gating cases) |

## 6a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 85 tests across the 3 files (admission 16, scheduler
32, registry 37); targeted regression 316/316 across 19 files; typecheck
baseline unchanged.

As planned, with review-driven changes (verdict REQUEST_CHANGES → fixed):

1. **Atomic admission (was BLOCKER):** sliding windows now ONE Redis Lua
   script (prune+count+conditional-add in a single EVAL); DB-backed
   running/queued checks + fee + insertJob now execute inside an
   injectable `withAdmissionLock` seam whose default impl takes Postgres
   advisory transaction locks keyed by connection + user. Concurrency
   test: 12 parallel submits vs cap 8 → exactly 8 created.
2. **Weighted queued caps (was MAJOR):** baselines use SQL
   SUM(outputCount) over non-terminal hermes_media_* rows, matching the
   incoming batch weighting (outputCount:4 vs cap 8 admits exactly 2).
3. Auto-pick filters by assetType capability + skips busy (running>0)
   connections before depth sort.
4. Flow order (final): flags → connection resolution (single-pass) →
   worker-online → contract parse + operation-unsupported gate →
   idempotency dedupe → [seam: admission → fee reserve → insert] —
   duplicates consume zero budget; fee reserved at most once.
5. Refund-failure on insert-failure path logged (reservationId/userId);
   getHermesConnectionAssignedWorkerId tenant-scoped.

Implementer deviations accepted at review: optional connectionId on the
queue input (auto-pick path), manifest-only operation gate with
findHermesModelRow future hook, connection-status→code mapping incl.
`error`→HERMES_CONNECTION_REQUIRED.

Exports for 06/09/12: `queueHermesMediaJob` (taskId "hermes_"+job.id),
`checkHermesMediaAdmission` (+ injectable HermesAdmissionCounters),
`buildHermesQuotaKey` (section-12 increments; this module reads),
`validateHermesLimitCoherence` (wired into systemSettings write path),
HERMES media job priority 25 (< control-job 50).
Review trail: `../implementation/code_review/section-05-{diff,review,interview}.md`.

## 6. Verification

1. New tests red → implement → green: `pnpm --dir apps/web test -- hermesMedia` and the workerRegistryService suite.
2. Full `pnpm --dir apps/web test` green — especially existing remotion claim tests, `queueVerticalDramaFfmpegAssemblyJob`/`queueDesktopVideoAssemblyJob` tests, and private-mode claim filtering (zero regressions).
3. `pnpm --dir apps/web check` (typecheck) clean.
4. Namespace guard (section-01's grep test) still passes: no `queueHermesWorkerJob` / `hermesAgentRuntime` references in the new files.
5. Grep the new files for URL-shaped reference fields persisted to `inputJson` — none (claim-time minting is section-06/09's job).