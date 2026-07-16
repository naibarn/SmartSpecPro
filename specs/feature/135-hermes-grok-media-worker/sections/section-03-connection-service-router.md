# Section 03 — Connection Service + tRPC Router

**Section id:** `section-03-connection-service-router`
**Plan reference:** `claude-plan.md` §5 (with context from §3, §4, §6); `claude-plan-tdd.md` §5; `spec.md` §7.1–7.3, §12.0–12.4, §13.7, §18.
**Depends on:** `section-01-shared-contracts` (error codes, job-type constants, capability manifest type, `hermesWorkerSettings.ts`, tenant flag `hermesMediaWorker`), `section-02-db-schema` (`hermes_provider_connections` table + types).
**Blocks:** `section-04-connection-control-jobs`, `section-05-admission-scheduler`, `section-10-client-web`.
**Test command:** `pnpm --dir apps/web test` (Vitest; service tests in `apps/web/server/services/__tests__/`, router tests in `apps/web/server/routers/__tests__/`).

---

## 1. Objective

Build the user-facing connection layer for Hermes/Grok provider connections:

1. `apps/web/server/services/hermesConnectionService.ts` (new) — list/connect/status/default/disconnect/probe/admin operations over the `hermes_provider_connections` table, modeled on `mcpConnectionService.ts`. Enforces tenant scoping, ownership, admin-only `server_shared` mutations, the one-time data-transfer consent gate, and shared-worker discovery via the `hermes_shared_worker_id` system setting.
2. `apps/web/server/routers/hermesConnections.ts` (new) — thin tRPC wrapper (including `getAvailability`), registered as `hermesConnections` in `apps/web/server/routers.ts` next to `mcpConnections`.

This section is ALSO the client's readiness source: the model picker (section-10) derives "Grok via Hermes available / disabled(reason)" from `listConnections` + `getAvailability`. There is **no separate readiness service**.

This section enqueues the three control job types as plain `worker_jobs` rows and performs **lazy** settlement of connection rows when reading job outcomes. The worker-side handlers, stdout parsers, proactive completion hook, and 60s terminal-state sweep belong to section-04 and must NOT be implemented here (leave the documented seam).

## 2. Background you need

- **Template:** `apps/web/server/services/mcpConnectionService.ts` — study `SafeMcpConnection`, `listMcpConnections` (tenant + `ownerUserId` enforcement), `updateMcpConnectionDefaults`, `disconnectMcpConnection`. `apps/web/server/routers/mcpConnections.ts` — `tenantIdFromCtx(ctx)` helper pattern.
- **Table (section-02):** `hermesProviderConnections` in `apps/web/drizzle/schema.ts`. Columns: `id`, `tenantId`, `ownerUserId`, `scope` (`server_shared | server_personal | private_worker`), `providerType` (`"xai_grok"`), `adapterType` (`"hermes_cli"`), `authenticationType` (`"oauth_device_code"`), `status` (`pending | authorized | reauth_required | entitlement_restricted | disconnected | error`), `assignedWorkerId`, `profileReference`, `accountLabel`, `accountHint`, `entitlementStatus`, `capabilitiesJson`, `defaultForImage`/`defaultForVideo` (partial-unique per (tenantId, ownerUserId) among statuses `authorized|reauth_required|entitlement_restricted`), `dailyJobQuota`, `metadataJson`, `createdAt`/`authorizedAt`/`lastProbeAt`/`disconnectedAt`. **No token/secret columns exist — none may be added or surfaced.**
- **Shared constants (section-01):** `shared/workerRuntime.ts` exports `HERMES_CONNECTION_AUTH_JOB_TYPE = "hermes_connection_authorize"`, `HERMES_CONNECTION_PROBE_JOB_TYPE = "hermes_connection_probe"`, `HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect"`. `shared/hermesMedia.ts` exports `HermesConnectionCapabilityManifest`, `HERMES_MEDIA_ERROR_CODES`, `hermesErrorCopy`.
- **Settings (section-01):** `apps/web/server/services/hermesWorkerSettings.ts` exposes TTL-cached getters for `hermes_worker_enabled`, `hermes_worker_shared_pool_enabled`, `hermes_worker_server_personal_enabled`, `hermes_worker_private_enabled`, `hermes_worker_video_enabled`, and `hermes_shared_worker_id`. Use whatever getter names section-01 landed (expected: a `getHermesWorkerSettings()` aggregate and/or per-key getters such as `getHermesSharedWorkerId()`).
- **Workers:** `workers` table has `status` (`workerStatusEnum`, default `"offline"`), `lastSeenAt`, `registeredByUserId`. "Online" = `status === "online"` AND `lastSeenAt` within the fleet heartbeat-staleness threshold already used by the worker fabric (reuse the existing helper in `workerRegistryService`/monitoring if one exists; otherwise compute in the repo query).
- **worker_jobs insert shape:** `{ tenantId, workerId, runtimeType, requestedByUserId, jobType, status: "queued", priority, resourceProfile, capabilityRequirementsJson, inputJson, ... }` (see `workerJobs` pgTable, schema.ts ~L14002).
- **Critical namespace rule:** the existing **agent-gateway** Hermes lane (`hermesAgentRuntime` flag, `queueHermesWorkerJob`, `hermes_agent_gateway` runtimeType usages for agents) is a DIFFERENT feature. Never guess the shared worker from `runtimeType` — the shared unit's worker id comes ONLY from the `hermes_shared_worker_id` system setting written by the pairing script (section-07). Do not import `queueHermesWorkerJob` or read the `hermesAgentRuntime` flag anywhere in this section.

## 3. TDD — write these tests FIRST

Use the injected-repo pattern (research A7): the service accepts a `deps`/`repo` object of `vi.fn()`s — no DB, no `vi.mock` of drizzle needed for the service tests. Add a small fixture factory (`buildConnectionRow(overrides)`, `buildDeps(overrides)`).

### 3.1 `apps/web/server/services/__tests__/hermesConnectionService.test.ts` (new)

- **listHermesConnections**
  - returns caller-owned `server_personal` + `private_worker` rows plus tenant-wide `server_shared` rows; a fixture row with `ownerUserId` of another user and scope `server_personal` is NOT returned.
  - result objects contain no token-like fields: assert `JSON.stringify(result)` does not match `/token|secret|password|refresh|auth_json/i` (mirror of the schema guard in section-02).
  - `assetType: "image"` filters out connections whose manifest has no enabled image operation (and same for video); rows with `capabilitiesJson = null` (not yet probed) are still listed but with `capabilitySummary` reflecting "unprobed".
  - each row carries `assignedWorkerOnline: boolean` derived from the injected worker lookup.
- **startConnect**
  - rejects with typed `HERMES_DISABLED` when the master flag or the requested scope's flag is off (cover all three scope flags), and when the tenant flag `hermesMediaWorker` is false.
  - rejects when `consentAcknowledged` is false (no row created, no job enqueued).
  - rejects `scope: "server_shared"` for a non-admin caller.
  - `private_worker`: rejects when `workerId` is not owned by the caller (`registeredByUserId` mismatch) or the worker is offline (`HERMES_WORKER_UNAVAILABLE`); auto-selects the worker when the caller owns exactly one online eligible worker and `workerId` is omitted.
  - server scopes: resolves the shared unit from the `hermes_shared_worker_id` setting; **fails typed (`HERMES_WORKER_UNAVAILABLE`) — never guesses** — when the setting is absent or that worker is offline. Assert the settings getter was consulted and that no query filtered workers by `runtimeType`.
  - happy path: creates exactly one row with `status: "pending"`, `profileReference: "conn_<id>"`, consent timestamp persisted in `metadataJson`, and enqueues exactly one `hermes_connection_authorize` job pinned to the resolved worker — assert `insertWorkerJob` args: `jobType`, `workerId`, `resourceProfile: "cpu_light"`, `inputJson` = `{ connectionId, profileReference, timeoutSeconds }`, `requestedByUserId`.
- **getConnectStatus**
  - surfaces `verificationUrl` / `userCode` / `expiresAt` from the auth job's `hermes_device_code` event (injected `findJobEvents` returns the event fixture).
  - maps auth-job failure reasons to typed codes (`HERMES_OAUTH_SESSION_EXPIRED`, `HERMES_OAUTH_DENIED`, timeout → typed) in `errorCode`.
  - **lazy settlement:** on a terminal-success job the connection row is updated (`status: "authorized"`, `accountHint`, `capabilitiesJson`, `authorizedAt`); on terminal failure → `status: "error"` with the typed reason in `metadataJson`; settlement is idempotent (second read does not re-update).
  - enforces ownership: caller who is neither owner nor (for `server_shared`) admin gets NOT_FOUND-style rejection.
- **setDefault**
  - flips defaults atomically per assetType: setting `defaultForImage` on connection B clears it on the caller's previous default A **in the same transaction/repo call** (assert clear-then-set ordering so the partial-unique index cannot trip); video default untouched.
  - rejects for connections not visible to the caller and for non-default-eligible statuses (`pending`, `disconnected`).
- **disconnect**
  - enqueues exactly one `hermes_connection_disconnect` job pinned to `assignedWorkerId` and does NOT immediately set `status: "disconnected"` (row marked only after job completion — settlement path); records `disconnectRequestedAt` in `metadataJson`.
  - `server_shared` disconnect requires admin.
- **probe**
  - enqueues one `hermes_connection_probe` job pinned to the assigned worker; rejects when worker offline (`HERMES_WORKER_UNAVAILABLE`).
- **admin ops**
  - `adminSetQuota` updates `dailyJobQuota` on `server_shared` rows only; `adminDisable` marks the row disconnected and enqueues profile cleanup when the worker is online.

### 3.2 `apps/web/server/routers/__tests__/hermesConnections.test.ts` (new)

Follow the existing router-test style in that directory (build a caller with a fake ctx, or invoke procedures via the app router with mocked service module — `vi.mock("../../services/hermesConnectionService")`).

- every procedure rejects an unauthenticated ctx (UNAUTHORIZED).
- `adminList` / `adminSetQuota` / `adminDisable` reject a non-admin ctx (FORBIDDEN).
- `getAvailability` reflects flag states: with master flag off returns `enabled: false`; with master on + video off returns `videoEnabled: false`; per-scope booleans mirror the three scope flags AND the tenant flag.
- input validation: `startConnect` rejects an invalid `scope` value; `setDefault` rejects an invalid `assetType` (zod).
- responses never contain token-like keys (same regex assertion on a happy-path `listConnections` response with the service mocked to return a full row).

### 3.3 Namespace-guard extension

Section-01 introduced a grep-style guard test (no new-service file imports `queueHermesWorkerJob` / reads `hermesAgentRuntime`). Ensure the two new files created here are inside that test's globs (extend the glob list if needed).

## 4. Implementation

### 4.1 `apps/web/server/services/hermesConnectionService.ts` (new)

Structure the module like `mcpConnectionService.ts`: exported plain async functions, each taking a params object; internally all DB access goes through a `HermesConnectionRepo` object so tests can inject fakes. Provide `createHermesConnectionService(deps?)` OR module-level functions with an optional `deps` last parameter — match whichever injected-repo style the newest fabric services use (`workerSchedulerService` pattern preferred).

Key exported types/signatures (stubs shown; do not inline full bodies here):

```ts
export interface SafeHermesConnection {
  id: string;
  scope: "server_shared" | "server_personal" | "private_worker";
  status: HermesConnectionStatus;
  accountLabel: string | null;
  accountHint: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  entitlementStatus: string | null;
  assignedWorkerId: string | null;
  assignedWorkerOnline: boolean;
  capabilitySummary: {
    probedAt: string | null;
    imageEnabled: boolean;
    videoEnabled: boolean;
    maxEditReferences: number | null;
  };
  dailyJobQuota: number | null;
  createdAt: string;
  authorizedAt: string | null;
} // NEVER any token/secret/profile-path field

export interface HermesConnectionDeps {
  repo: { /* findConnections, findConnectionById, insertConnection,
            updateConnection, clearDefaultFor, findWorkerById,
            findOwnedOnlineWorkers, insertWorkerJob, findLatestControlJob,
            findJobEvents — all injectable vi.fn()s in tests */ };
  settings: { /* hermesWorkerSettings getters */ };
  flags: { getTenantFeatureFlags(tenantId: string): Promise<...> };
  now?: () => Date;
}

export async function listHermesConnections(params: {
  tenantId: string; userId: number; assetType?: "image" | "video";
}, deps?): Promise<SafeHermesConnection[]>;

export async function getHermesConnection(params: { tenantId; userId; connectionId }, deps?): Promise<SafeHermesConnection & { capabilities: HermesConnectionCapabilityManifest | null }>;

export async function startHermesConnect(params: {
  tenantId: string; userId: number; isAdmin: boolean;
  scope: HermesConnectionScope; workerId?: string; label?: string;
  consentAcknowledged: boolean;
}, deps?): Promise<{ connectionId: string }>;

export async function getHermesConnectStatus(params: { tenantId; userId; isAdmin; connectionId }, deps?):
  Promise<{ status: HermesConnectionStatus; verificationUrl?: string; userCode?: string;
            expiresAt?: string; errorCode?: HermesMediaErrorCode }>;

export async function setHermesDefaultConnection(params: { tenantId; userId; connectionId; assetType: "image" | "video" }, deps?): Promise<void>;
export async function disconnectHermesConnection(params: { tenantId; userId; isAdmin; connectionId }, deps?): Promise<void>;
export async function probeHermesConnection(params: { tenantId; userId; isAdmin; connectionId }, deps?): Promise<void>;
export async function adminListHermesConnections(params: { tenantId }, deps?): Promise<SafeHermesConnection[]>;
export async function adminSetHermesQuota(params: { tenantId; connectionId; dailyJobQuota: number | null }, deps?): Promise<void>;
export async function adminDisableHermesConnection(params: { tenantId; connectionId }, deps?): Promise<void>;

export async function getHermesAvailability(params: { tenantId: string }, deps?): Promise<{
  enabled: boolean; videoEnabled: boolean;
  scopes: { serverShared: boolean; serverPersonal: boolean; privateWorker: boolean };
}>;

// Settlement seam — section-04's completion hook and 60s sweep import this.
export async function settleHermesConnectionFromControlJob(params: {
  connectionId: string; job: { jobType; status; failureReason?; outputJson? };
}, deps?): Promise<void>;
```

Behavioral rules (all enforced in the service, not the router):

1. **Visibility:** personal + private rows require `ownerUserId === userId`; `server_shared` rows visible tenant-wide (read); `server_shared` mutations admin-only. All queries `tenantId`-scoped (tenantRequired — throw if missing, mirroring `listMcpConnections`).
2. **Flag gating (`startConnect` + `getAvailability`):** master `hermes_worker_enabled` AND tenant flag `hermesMediaWorker` AND the per-scope system flag must all be on; otherwise typed `HERMES_DISABLED`. Fail closed on settings-read errors.
3. **Consent gate:** `consentAcknowledged: true` required; persist `{ consentAcknowledgedAt, consentUserId }` into `metadataJson` on the new row (spec §12.1 step 4).
4. **Target-worker resolution:**
   - `server_shared` / `server_personal` → read `hermes_shared_worker_id` from settings; verify the worker exists in this tenant and is online. Absent setting or offline worker → typed `HERMES_WORKER_UNAVAILABLE`. **Never infer from `runtimeType`.**
   - `private_worker` → `params.workerId` must be an online worker with `registeredByUserId === userId`; auto-select when the caller owns exactly one online eligible worker.
5. **Enqueue (authorize/probe/disconnect):** insert a `worker_jobs` row with `jobType` from the shared constants, `workerId` pinned to the resolved/assigned worker, `runtimeType` = that worker's registered `runtimeType` (read from the worker row — do not hardcode), `resourceProfile: "cpu_light"`, tight `timeout` in inputJson (`timeoutSeconds`, e.g. 900 for authorize / 300 for probe / 120 for disconnect — expose as constants), `requestedByUserId`, `capabilityRequirementsJson: { connectionId }`. Keep the insert-building logic in small exported builder helpers (`buildAuthorizeJobInsert(...)` etc.) so section-04's `hermesConnectionJobs.ts` can reuse them without duplication.
6. **`getConnectStatus`:** find the latest authorize job for the connection; read its `worker_job_events` for the `hermes_device_code` event and surface `{ verificationUrl, userCode, expiresAt }`; on terminal job states call `settleHermesConnectionFromControlJob` (lazy settlement) before returning the row's fresh status. Never log the device code or user code (structured logs may include connectionId/jobId only).
7. **Settlement mapping** (in `settleHermesConnectionFromControlJob`, idempotent — skip if the row already left `pending`/the expected pre-state):
   - authorize success → `status: "authorized"`, `authorizedAt`, `accountHint` from the job's `hermes_authorized` event/outputJson, plus `capabilitiesJson` if the output carries an initial manifest.
   - authorize failure → `status: "error"` + typed reason (`HERMES_OAUTH_SESSION_EXPIRED` / `HERMES_OAUTH_DENIED` / `HERMES_TIMEOUT`) in `metadataJson.lastError`.
   - probe success → `capabilitiesJson`, `lastProbeAt`; probe classified xAI-403 → `status: "entitlement_restricted"`, `entitlementStatus` updated.
   - disconnect success → `status: "disconnected"`, `disconnectedAt`.
8. **`setDefault`:** single transaction — clear the caller's existing default for that assetType (respecting the partial-unique predicate statuses), then set the new one. Reject non-eligible statuses.
9. **Error convention (pinned):** throw `TRPCError` with the appropriate HTTP-ish code (FORBIDDEN/PRECONDITION_FAILED/NOT_FOUND/BAD_REQUEST) and `message: formatHermesErrorMessage(code, detail?)` from `shared/hermesMedia.ts` — the `[HERMES_X] …` message prefix is the canonical wire channel (TRPCError `cause` does not serialize to the client). Section-10's `extractHermesErrorCode` parses it back. Never hand-format codes; the router must not translate.

### 4.2 `apps/web/server/routers/hermesConnections.ts` (new)

Thin wrapper only — zod parse, ctx extraction (`tenantIdFromCtx` pattern from `mcpConnections.ts`, `ctx.user.id`, admin check from ctx role), delegate to the service. Procedures (spec §12.0):

| Procedure | Type | Input (zod) |
|---|---|---|
| `listConnections` | `protectedProcedure.query` | `{ assetType?: z.enum(["image","video"]) }` optional |
| `getConnection` | `protectedProcedure.query` | `{ connectionId: z.string() }` |
| `getAvailability` | `protectedProcedure.query` | none |
| `startConnect` | `protectedProcedure.mutation` | `{ scope: z.enum([...3 scopes]), workerId?: z.string(), label?: z.string().max(120), consentAcknowledged: z.boolean() }` |
| `getConnectStatus` | `protectedProcedure.query` | `{ connectionId: z.string() }` |
| `setDefault` | `protectedProcedure.mutation` | `{ connectionId: z.string(), assetType: z.enum(["image","video"]) }` |
| `disconnect` | `protectedProcedure.mutation` | `{ connectionId: z.string() }` |
| `probe` | `protectedProcedure.mutation` | `{ connectionId: z.string() }` |
| `adminList` | `adminProcedure.query` | none |
| `adminSetQuota` | `adminProcedure.mutation` | `{ connectionId: z.string(), dailyJobQuota: z.number().int().min(0).nullable() }` |
| `adminDisable` | `adminProcedure.mutation` | `{ connectionId: z.string() }` |

`protectedProcedure` / `adminProcedure` come from `apps/web/server/_core/trpc` (see imports at the top of `apps/web/server/routers.ts`). Note `server_shared` `startConnect` is admin-gated **inside the service** (procedure stays `protectedProcedure` since non-admins may start personal/private connects).

### 4.3 `apps/web/server/routers.ts` (modify)

Import `hermesConnectionsRouter` and register it as `hermesConnections` in the app router, adjacent to the existing `mcpConnections` entry. No other changes.

## 5. What this section must NOT do

- No worker-side handlers, stdout parsing, fake `hermes` CLI fixture, completion hook, or terminal-state sweep — section-04.
- No admission control, fee logic, or media-job enqueue — section-05.
- No client components — section-10.
- No `media_models` / transport changes — section-08.
- No new columns or secrets on `hermes_provider_connections`; never return raw `profileReference` or worker filesystem details to clients.
- Never touch or reuse the agent-gateway Hermes lane (`hermesAgentRuntime`, `queueHermesWorkerJob`).

## 6a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 58 tests green (48 service + 9 router + guard);
typecheck baseline unchanged (140, zero hermes matches).

As planned, with review-driven changes (verdict was REQUEST_CHANGES —
BLOCKER + 5 findings, all fixed):

1. **setDefault is owner-only regardless of scope** (`assertOwnerRegardlessOfScope`)
   — review caught an authz bypass where any tenant member could mutate an
   admin-owned server_shared row's defaults.
2. **Probe-failure settlement paths added** (`classifyProbeFailureReason`):
   auth-invalidation → `reauth_required` + HERMES_REAUTH_REQUIRED;
   403 → `entitlement_restricted`; others → lastError only.
3. **`capabilityFamilies: HERMES_MEDIA_CAPABILITY_FAMILIES` added** to
   buildControlJobInsert (the existing workerJobMatchesSelection matcher
   reads that array — requiredClaimCapability alone was unconsumed).
4. Namespace guard extended to `server/routers/hermes*`.
5. **Composite transactional repo methods**: `insertConnectionWithJob`,
   `setDefaultAtomic` (db.transaction in defaultHermesConnectionRepo).
6. Error convention consolidated: server_shared mutations (disconnect,
   probe) require admin via one explicit check.

Errors carried by formatHermesErrorMessage: HERMES_DISABLED,
HERMES_WORKER_UNAVAILABLE (business-rule rejections stay plain TRPCErrors —
no matching code among the 22).

Deferred to section-04 (recorded in its dispatch): shared failure-reason
constants (replace substring classification), tenantId defense-in-depth in
settleHermesConnectionFromControlJob direct callers.

Exports for later sections: `buildAuthorizeJobInsert`/`buildProbeJobInsert`/
`buildDisconnectJobInsert`, timeout constants (900/300/120),
`settleHermesConnectionFromControlJob`, `defaultHermesConnectionRepo`,
`HermesConnectionRepo`, `HERMES_WORKER_ONLINE_STALE_MS`.
Review trail: `../implementation/code_review/section-03-{diff,review,interview}.md`.

## 6. Verification

1. New tests green: `pnpm --dir apps/web test -- hermesConnection` (both new files).
2. Full suite unchanged: `pnpm --dir apps/web test` — in particular the existing `mcpConnections` and worker-fabric tests must pass untouched.
3. `pnpm --dir apps/web check` (tsc) clean for the new/modified files (repo has known pre-existing errors; introduce none).
4. Manual smoke (optional, dev): tRPC `hermesConnections.getAvailability` returns `enabled: false` with flags at defaults (everything fails closed).