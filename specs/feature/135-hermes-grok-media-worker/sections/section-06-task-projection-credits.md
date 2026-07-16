# Section 06 — Task Projection + Credits (`hermesMediaAdapter`)

Section id: `section-06-task-projection-credits`
Plan sources: `../claude-plan.md` §8–§9, `../claude-plan-tdd.md` §8–§9
Depends on: `section-01-shared-contracts` (job contract, error codes, taskId conventions), `section-05-admission-scheduler` (`queueHermesMediaJob`, `hermes_<jobId>` taskId, `workerBilling` block in instructionsJson)
Blocks: `section-07-shared-worker` (workers call the reference-URL routes; finalize consumes their artifacts), `section-09-vd-surface-integration` (surfaces poll via `getTask`)
Test command: `pnpm --dir apps/web test` (Vitest; all paths below are relative to `apps/web/` unless absolute)

## 1. Purpose and context

Hermes media jobs live entirely in the existing worker fabric
(`worker_jobs`, `worker_job_events`, `worker_artifacts`) — this section adds
**no new tables**. It makes those jobs look like normal media tasks to every
existing polling client, settles the (fee-only) credits, publishes completed
artifacts into the Library, and mints the short-lived reference URLs workers
need (URLs are banned at rest — the contract carries `assetId + sha256`
only; see section 01).

Five deliverables:

1. `server/services/hermesMediaAdapter.ts` — MediaTask projection from
   worker fabric rows, ownership check, cancel.
2. `hermes_` branch in `mediaGenerationService.getTask` (the `mcp_` branch
   at `server/services/mediaGenerationService.ts:2789` is the exact
   template).
3. Fee-only hermes branch in `reconcileTaskCredits`
   (`server/routers/media.ts:671`).
4. `server/services/hermesMediaFinalizeService.ts` — artifact re-validation
   → `media_assets` + `library_items` + `publishedItemId` + lineage →
   job `publishing → completed`.
5. Claim-time reference URL minting + `POST
   /api/worker-jobs/:jobId/references/urls` in
   `server/routes/workerRuntime.ts`, plus terminal-state fee/status glue.

Existing shapes to mirror (read these before writing code):

- `server/services/mcpMediaAdapter.ts` — the module to mirror:
  `getMcpMediaTask` (exported), `rowToMediaTask` (**private, unexported** —
  a shape reference only, not a reusable import), cancel,
  `startMcpStaleMediaTaskReconciler` bootstrap wiring in
  `server/_core/index.ts:1769`. NOTE: there is **no existing
  `isMcpMediaTaskId` export** — the MCP prefix check is the inline
  `taskId.startsWith("mcp_")` at `mediaGenerationService.ts:2789`; our new
  `isHermesMediaTaskId` is the first named helper of its kind.
- `MediaTask` interface: `server/services/mediaGenerationService.ts:1111`
  (`status: TaskStatus`, `resultUrl?`, `errorMessage?`, timestamps as ISO
  strings).
- `server/services/hyperframesLibraryFinalizeService.ts`
  (`finalizeHyperframesRenderToLibrary` at :227) — the finalize model.
- `server/services/workerRegistryService.ts` —
  `completeWorkerArtifact` (:1527) shows the artifact-complete flow, lease
  enforcement (`ensureLease`), and the `publishing` status transition the
  finalize service continues from.
- `server/services/workerBillingService.ts` —
  `reserveWorkerJobCredits` (:62), `reconcileWorkerJobCredits` (:87).
- `server/services/workerJobMonitorService.ts` —
  `cancelQueuedUserWorkerJob` (:553).
- `server/storage.ts` — `storagePresignGet` (:576);
  `server/services/mediaAssetService.ts` for signed-URL resolution over
  `media_assets`.

Namespace guard (section 01 invariant): nothing in this section may import
`queueHermesWorkerJob` or read `hermesAgentRuntime` — those belong to the
unrelated agent-gateway Hermes lane.

## 2. Files

| Action | Path |
|---|---|
| Create | `server/services/hermesMediaAdapter.ts` |
| Create | `server/services/hermesMediaFinalizeService.ts` |
| Edit | `server/services/mediaGenerationService.ts` (getTask, ~L2789) |
| Edit | `server/routers/media.ts` (`reconcileTaskCredits`, L671) |
| Edit | `server/routes/workerRuntime.ts` (claim enrichment + new route) |
| Edit | `server/services/hermesConnectionJobs.ts` (terminal-state glue call sites — sweep itself is section 04) |
| Create | `server/services/__tests__/hermesMediaAdapter.test.ts` |
| Create | `server/services/__tests__/hermesMediaFinalizeService.test.ts` |
| Create | `server/routers/__tests__/media.hermesReconcile.test.ts` |
| Create | `server/services/__tests__/hermesReferenceUrls.test.ts` |

## 3. Tests first (write these before implementation)

Conventions: Vitest, injected-repo pattern (`vi.fn()`, no DB), same as the
scheduler tests in section 05. Fixture builders for `WorkerJobRecord` /
`WorkerArtifactRecord` / event rows should be small local helpers (or reuse
the fake in-memory worker_jobs table pattern from
`inlineRenderWorker.test.ts` where claim-like behavior is needed).

### 3.1 `hermesMediaAdapter.test.ts`

- `isHermesMediaTaskId` — true for `hermes_<uuid>`, false for `mcp_x`,
  gateway ids, and the bare string `hermes_` edge case per section-01
  convention.
- Status mapping table test — one fixture per `worker_jobs.status`:
  - `queued | claimed | preparing` → MediaTask `"pending"`
  - `running | uploading | publishing` → `"processing"`
  - `completed` → `"completed"`
  - `failed | expired` → `"failed"` with `errorMessage` derived from the
    typed `failureReason` via `hermesErrorCopy` (section 01)
  - `canceled` → `"failed"` with errorCode `HERMES_JOB_CANCELLED`
- Ownership: job with `requestedByUserId !== userId` (same tenant) →
  returns `null` (never throws with details); tenant mismatch → `null`.
- Completed task exposes `resultUrl` ONLY when finalize has registered the
  asset (artifact has `publishedItemId` / outputJson carries the
  mediaAssetId); a `completed` job without a registered asset must not
  fabricate a URL (assert `resultUrl` undefined and a diagnosable state).
- `resultUrl` is the signed URL of the registered `media_assets` row
  (stub `mediaAssetService`/`storagePresignGet`), never a worker-local or
  provider-hosted path.
- `cancelHermesMediaTask` delegates to `cancelQueuedUserWorkerJob` for
  queued jobs and posts a cancel event path for claimed/running; foreign
  user cancel is rejected.

### 3.2 `mediaGenerationService.getTask` routing (extend an existing getTask test file or add cases in the adapter test)

- `hermes_` prefix routes to `getHermesMediaTask` (spy), requires a
  numeric `auditContext.userId` (missing → throws, mirror of the MCP
  guard at mediaGenerationService.ts:2790-2793), audit-logs
  `transport: "hermes_worker"` in the response event.
- Regression: `mcp_` ids still hit the MCP adapter; non-prefixed ids still
  fall through to the gateway fetch. Existing behavior byte-identical.

### 3.3 `media.hermesReconcile.test.ts`

- Failed shared-pool job (fee was reserved by the scheduler): refunds
  exactly the reserved fee once — the Redis idempotency key
  (`credit:reconciled:<taskId>` pattern reused unchanged) makes a second
  call a no-op.
- Canceled-before-start shared-pool job → full fee refund.
- Completed shared-pool job → fee kept, zero adjustment.
- `server_personal` / `private_worker` jobs → zero adjustments in every
  terminal state (no reserve existed).
- Never runs per-duration math for `hermes_` ids (assert
  `getModelWithPricing` / `calculateCreditCost` spies are NOT called).
- Regression: mcp/gateway tasks flow through the existing body unchanged.
- `settlePortraitCandidate` (see `server/routers/verticalDramaCharacters.ts`
  / `verticalDramaCharacterStock.ts`) settles a `hermes_` candidate
  end-to-end with a stubbed `getTask` returning each terminal shape —
  including the stuck-candidate recovery path — with NO edits to
  `settlePortraitCandidate` itself (it calls getTask + reconcileTaskCredits
  generically; this test proves that assumption).

### 3.4 `hermesMediaFinalizeService.test.ts`

- Checksum/mime/size re-validation against init metadata: mismatch →
  typed `OUTPUT_INVALID` failure, job transitioned to `failed`, no
  media_assets row created.
- Happy path: creates `media_assets` (storageKey, checksum, dimensions
  from artifact `metadataJson`) + `library_items` (folder from the job
  contract's `storage.libraryFolderId`; default folder when absent), sets
  `worker_artifacts.publishedItemId`, writes lineage metadata (operation,
  prompt, model, referenceAssetIds, workerJobId, hermesVersion,
  connectionId), transitions job `publishing → completed`.
- Content-safety gate: a stubbed `uploadContentSafety` failure blocks
  publication — no `media_assets`/`library_items` rows, job failed typed;
  a passing scan proceeds (spec §16 "upload scanning hook" requirement).
- Idempotent: duplicate completion (same artifact) returns the existing
  ids without duplicating rows or double-transitioning.
- Non-`hermes_media_*` job artifacts are ignored by the dispatch hook
  (hyperframes finalize regression untouched).

### 3.5 `hermesReferenceUrls.test.ts`

- Claim response for a `hermes_media_*` job includes
  `referenceUrls: Array<{ assetId, url, expiresAt }>` — one entry per
  contract `references[].assetId`, ownership (tenant + requester)
  re-verified at mint time; a reference asset the requester no longer owns
  fails the claim path with a typed error, not a silent skip.
- Claim response for non-hermes jobs is byte-identical to before
  (regression).
- `POST /api/worker-jobs/:jobId/references/urls`: rejects missing/expired
  lease token (same `ensureLease` semantics as the events/artifacts
  routes), rejects jobs not in an active state
  (claimed/preparing/running/uploading), returns re-minted URLs for an
  active lease.
- inputJson persisted by the scheduler contains `assetId + sha256` only —
  assert no `/url/i` keys anywhere in the stored contract (this is the
  at-rest half; the worker-side sha256-verify test lives in section 07).

## 4. Implementation guidance

### 4.1 `server/services/hermesMediaAdapter.ts`

Mirror `mcpMediaAdapter`'s public surface but store nothing new —
projections are built from worker fabric tables via an injectable repo
(reuse/extend the `WorkerRuntimeRepository` read methods:
`getJobById`, latest events, artifacts for job).

```ts
export function isHermesMediaTaskId(taskId: string): boolean;
// "hermes_" prefix + non-empty id remainder.

export function hermesTaskIdToJobId(taskId: string): string;

export async function getHermesMediaTask(
  taskId: string,
  userId: number,
  deps?: { repo?; presign?; now? },
): Promise<MediaTask | null>;
// Load worker_jobs row (+ latest events + artifacts), enforce
// requestedByUserId === userId within tenant scope (violation → null),
// map to MediaTask per the status table in §3.1. errorMessage comes from
// hermesErrorCopy(failureReason) — never raw stderr. completed →
// resultUrl = signed URL of the finalize-registered media asset.

export async function cancelHermesMediaTask(
  taskId: string,
  userId: number,
): Promise<void>;
// queued → cancelQueuedUserWorkerJob; claimed/running → cancel-requested
// event path (worker-side graceful term is section 07).
```

Notes:
- `MediaTask.mediaType` derives from jobType
  (`hermes_media_image_generate` → "image", `..._video_generate` →
  "video"); `model`/`prompt`/`parameters` project from the stored
  `HermesMediaJobContract` in inputJson.
- **`parameters` MUST also carry the job's `instructionsJson.workerBilling`
  block when present** (e.g. `parameters.workerBilling`) — §4.3's
  fee-reconcile branch and `settlePortraitCandidate` read the reserved fee
  from the projected task; omitting it silently breaks shared-pool fee
  refunds. Add a projection test asserting the field round-trips.
- Do NOT copy mcpMediaAdapter's in-memory task map or provider polling —
  worker_jobs is already the source of truth; the projection is pure read.

### 4.2 `mediaGenerationService.getTask` branch

Insert the `hermes_` branch immediately before the `mcp_` branch (or
directly after it — before the gateway `fetch` fallback), structurally
identical to lines 2789–2812: require numeric `auditContext.userId`, call
`getHermesMediaTask`, throw `Task ${taskId} not found` on null, audit-log
`media_response` with `transport: "hermes_worker"`.

### 4.3 `reconcileTaskCredits` hermes branch (`server/routers/media.ts:671`)

Early branch at the top of the try block, before the
`__reserved_credits` logic:

```ts
if (isHermesMediaTaskId(task.id)) {
  // Reuse the same redis `credit:reconciled:${task.id}` idempotency key.
  // Fee-only: read the workerBilling block (written by the section-05
  // scheduler into instructionsJson, surfaced on the projected task's
  // parameters). failed/canceled-before-start → refund the full fee via
  // reconcileWorkerJobCredits/refundCredits; completed → keep fee;
  // no workerBilling block (personal/private) → noOp.
  // NEVER fall through to the duration/resolution math below.
  return ...;
}
```

Keep the return-shape contract
(`{ adjusted, difference, action }`) identical so `settlePortraitCandidate`
and the fire-and-forget call at media.ts:3498 work unchanged.

### 4.4 `server/services/hermesMediaFinalizeService.ts`

Model: `hyperframesLibraryFinalizeService`. Single export:

```ts
export async function finalizeHermesMediaArtifact(params: {
  job: WorkerJobRecord;
  artifact: WorkerArtifactRecord;
}, deps?: { repo?; db?; now? }): Promise<{ mediaAssetId: string; libraryItemId: string }>;
```

Invocation point: the artifact-complete path — after
`workerRegistry.completeWorkerArtifact` succeeds in the
`/api/worker-jobs/:jobId/artifacts/complete` handler
(`server/routes/workerRuntime.ts:1157`), dispatch on
`job.jobType.startsWith("hermes_media_")`. `completeWorkerArtifact`
already moved the job to `publishing` (workerRegistryService.ts:1571);
finalize completes it. Re-validate mime/size/checksum against the
artifact's init metadata (`metadataJson.checksumSha256`, `contentType`,
`sizeBytes`) before creating any rows; mismatch → fail the job with
`OUTPUT_INVALID`. **Then run the platform's existing content-safety gate
(`server/services/uploadContentSafety.ts` — spec §16 requires reusing it,
not just format validation)** on the uploaded object before any
`media_assets`/`library_items` row is created; a failed scan fails the job
typed (`HERMES_LIBRARY_REGISTRATION_FAILED` with a safety reason) and
nothing is published. Keep the gate injectable for tests. Idempotency: keyed on `(workerJobId, artifact.id)` — if
`publishedItemId` is already set, return the recorded ids.

### 4.5 Reference URL minting (`server/routes/workerRuntime.ts`)

- **Claim enrichment:** in the `/api/workers/:workerId/jobs/claim` handler
  (workerRuntime.ts:960), when the claimed job's jobType is
  `hermes_media_*`, mint short-lived presigned GET URLs
  (`storagePresignGet` over `media_assets`, re-verifying tenant +
  requester ownership per asset at mint time) for each
  `references[].assetId` and attach `referenceUrls` to the returned job
  payload only. The DB row is never mutated to contain URLs.
- **New route** `POST /api/worker-jobs/:jobId/references/urls` — same
  middleware stack as the events route (rate limiter, body cap,
  `requireBearerToken` + `verifyWorkerRouteAccessToken` with
  `worker_execution` use + `workers:report` scope), then lease + active
  state enforcement mirroring `recordWorkerJobEvent`, then re-mint the
  same URL set. Factor the mint logic into one helper shared by both call
  sites (may live in `hermesMediaAdapter.ts` or a small
  `hermesReferenceUrlService.ts` — keep it injectable for tests).

### 4.6 Terminal-state fee/status glue

No new reconciler process. Section 04's 60s sweep in
`hermesConnectionJobs.ts` (bootstrapped from `_core/index.ts`, mirroring
`startMcpStaleMediaTaskReconciler` at `_core/index.ts:1769`) is the driver;
this section contributes the callee: when a `hermes_media_*` job reaches a
terminal state via lease expiry (never observed by a polling client),
invoke the same fee reconciliation used by `reconcileTaskCredits` (share
one function, not two implementations) and let section 04's settlement map
auth/entitlement failures onto connection rows (`reauth_required`,
`entitlement_restricted`). Redis idempotency keys make sweep + poll-path
double-invocation safe.

## 5a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 70 tests in the section's files (adapter 36, finalize
11, reconcile 11, referenceUrls 11 + guard); regression 321 across 18
files; typecheck baseline unchanged.

As planned, with review-driven changes (verdict REQUEST_CHANGES → fixed):

1. **Finalize publish phase fail-closed (was MAJOR):** try/catch →
   HERMES_LIBRARY_REGISTRATION_FAILED terminal failure (no more stuck
   `publishing`); `outputJson.mediaAssetId` checkpointed right after
   insertMediaAsset so an interrupted publish retries by reusing the
   asset row instead of double-inserting.
2. Fee reconcile takes RAW status with an internal terminal-status guard
   (in-flight → action "none"); canceled/expired refund correctly.
3. `/references/urls` gated to hermes_media_* jobTypes (404 otherwise);
   unused assignmentAttempt dropped (the /events equivalent is a no-op for
   non-hyperframes jobs — nothing to mirror).
4. **libraryFolderId ownership validated** (injectable
   resolveLibraryFolderOwner; mismatch/missing → root + lineage note).
   Pre-existing systemic gap in routers/library.ts spun off as
   task_8d22477a (running in a separate session).
5. Structured debugError replaces console.* at the two flagged sites.

Extra exports vs plan: `reconcileHermesMediaJobFee` (shared fee impl for
media.ts + hermesConnectionJobs), `mintHermesMediaReferenceUrls` +
`extractHermesJobReferenceAssetIds` + `HermesReferenceAssetOwnershipError`.
Known ride-along: mediaGenerationService.ts carries a concurrent session's
__vd_portrait_candidate_* extra-param keys hunk (identified in review).
Deviations accepted: settlePortraitCandidate proof via stubbed-getTask
chain; content-safety gate built on existing uploadContentSafety
primitives (injectable for a real scanner); verifyStoredObject seam.

Review trail: `../implementation/code_review/section-06-{diff,review,interview}.md`.

## 5. Verification

1. New test files above pass: `pnpm --dir apps/web test -- hermesMedia`
2. Regressions: existing mcpMediaAdapter, getTask, reconcileTaskCredits,
   hyperframes finalize, and workerRuntime route tests all pass unchanged
   (`pnpm --dir apps/web test`).
3. `pnpm --dir apps/web check` typechecks (no new errors beyond the known
   pre-existing baseline).
4. Namespace guard test (section 01) still green — no agent-gateway Hermes
   imports from any new file.
5. Grep check: no logging of reference URLs or contract prompts at info
   level in the new route handlers; error messages sanitized.
