# Section 04 — Connection Control Jobs (OAuth device-code through the worker fabric)

Section id: `section-04-connection-control-jobs`
Plan source: `claude-plan.md` §6 (+ §8 stale-job glue bootstrap), `claude-plan-tdd.md` §6
Spec source: `spec.md` §10 (control job constants, lines 500–515), §12.1–§12.4, §13.7
Depends on: `section-01-shared-contracts` (job-type constants, error codes, capability manifest type, `hermesWorkerSettings.ts`), `section-02-db-schema` (`hermes_provider_connections`), `section-03-connection-service-router` (`hermesConnectionService.startConnect` / `getConnectStatus` call into this section's enqueue/settlement API)
Blocks: `section-07-shared-worker` (dispatches to the handlers built here), `section-10-client-web` (renders device-code payloads), `section-11-worker-app` (Rust port of handler logic; reuses the fake-CLI fixture and parser test vectors)
Test command: `pnpm --dir apps/web test`

---

## 1. Objective

Make the three Hermes connection-control job types real, end to end on the server side:

1. `hermes_connection_authorize` — runs `hermes auth add xai-oauth --no-browser` in an isolated profile on the target worker; the verification URL + user code travel back as a `worker_job_events` row (event type `hermes_device_code`), **never through logs**.
2. `hermes_connection_probe` — runs `hermes auth status xai-oauth` + `hermes tools` (post-auth, because media tools are credential-gated) and produces the `HermesConnectionCapabilityManifest` in the job's `outputJson`.
3. `hermes_connection_disconnect` — `hermes auth logout xai-oauth` + secure profile directory removal.

This section delivers four things:

- **`apps/web/server/services/hermesConnectionJobs.ts`** — enqueue-and-track for the three control job types + the settlement logic that maps terminal job outcomes onto `hermes_provider_connections` rows (authorized / reauth_required / entitlement_restricted / error / disconnected).
- **A 60s terminal-state sweep** bootstrapped in `_core/index.ts` (mirror of `startMcpStaleMediaTaskReconciler`, `_core/index.ts` ~L1769) so lease-expired/terminal hermes jobs still settle their connection rows even when nobody polls.
- **Worker-side handler cores + defensive stdout parsers** in `apps/web/server/hermesWorker/` (pure functions with injected effects — spawn, event posting, profile ops, logger — so they are fully unit-testable now; section 07's `jobHandlers.ts` dispatch and main loop merely wire them in; section 11 ports the same logic to Rust).
- **The fake `hermes` CLI test fixture** — a small executable Node script emitting configurable stdout/outputs, shared by this section's handler tests and by sections 07/11 tests and the step-4 CI smoke.

Nothing here is imported by the web server from `server/hermesWorker/` — the web server only touches `hermesConnectionJobs.ts` (services) and the shared event-contract schemas; `server/hermesWorker/` modules are consumed only by the worker process (section 07) and tests.

## 2. Background you need

- **Job fabric shapes:** `worker_job_events` (`drizzle/schema.ts` ~L14080) is `{ id, workerJobId, eventType varchar(100), payloadJson jsonb, createdAt }`. Control jobs are ordinary `worker_jobs` rows claimed over the existing control plane — no new queue.
- **Control-job policy (spec §10):** `resourceProfile: "cpu_light"`, tight timeouts (auth job timeout ≤ device-code expiry), **exempt from the media-generation rate limiter** (they never call `checkHermesMediaAdmission`), **max 1 concurrent control job per connection**.
- **runtimeType follows the assigned worker, never the feature** — private scope stamps `desktop_zeroclaw_managed`, shared unit stamps `hermes_agent_gateway`. "This is a Hermes job" is expressed only by `jobType` + `capabilityRequirementsJson.requiredClaimCapability` (`HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` from `shared/workerRuntime.ts`, section 01).
- **Enqueue template:** `queueVerticalDramaFfmpegAssemblyJob` (`workerSchedulerService.ts` ~L1066) — injected `WorkerSchedulerRepository` (`findJobByIdempotencyKey`, `findWorkerById`, `insertJob`), tests inject `vi.fn()` repos, no DB.
- **Hermes CLI facts (research B2/B3):** device-code stdout format is **undocumented** — parse defensively; token lives at `<profile>/auth.json`, auto-refresh; `hermes auth status xai-oauth` / `hermes auth logout xai-oauth`; native profiles via `hermes -p <name>` under an isolated `HERMES_HOME`. Exit codes are advisory only.
- **Namespace rule:** never touch `queueHermesWorkerJob` / `hermesAgentRuntime` (unrelated agent-gateway lane). Everything here is `hermesConnection*` / `hermes_connection_*`.
- **Section 03 handoff:** `hermesConnectionService.startConnect` already creates the pending row and resolves the target worker; it calls this section's enqueue function. `getConnectStatus` reads the auth job's events and lazily calls this section's settlement function.

## 3. Files

| Action | Path |
|---|---|
| Create | `apps/web/server/services/hermesConnectionJobs.ts` |
| Create | `apps/web/server/hermesWorker/hermesCliParsers.ts` |
| Create | `apps/web/server/hermesWorker/connectionControlHandlers.ts` |
| Create | `apps/web/server/hermesWorker/__tests__/hermesCliParsers.test.ts` |
| Create | `apps/web/server/hermesWorker/__tests__/connectionControlHandlers.test.ts` |
| Create | `apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/hermes.mjs` (executable) |
| Create | `apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/scenario.ts` (scenario types + `buildFakeHermesEnv` helper) |
| Create | `apps/web/server/services/__tests__/hermesConnectionJobs.test.ts` |
| Modify | `apps/web/shared/hermesMedia.ts` — additive: control-event constants + zod payload schemas (section 01 owns the file; this section appends one block) |
| Modify | `apps/web/server/_core/index.ts` — bootstrap `startHermesConnectionJobSweep()` (lazy import + try/catch, mirror of the MCP reconciler block ~L1769) |
| Modify | `apps/web/server/services/hermesConnectionService.ts` — replace the section-03 settlement stub/TODO with calls into `hermesConnectionJobs.ts` (getConnectStatus lazy settle, disconnect enqueue) |

## 4. Tests first (write these BEFORE implementing)

All Vitest, run from `apps/web`. Injected-dependency pattern throughout — no DB, no real child processes except where the fake CLI fixture is explicitly spawned.

### 4.1 `hermesCliParsers.test.ts` (TDD §6, test 1)

- `parseHermesDeviceCodeOutput` extracts `verificationUrl` + `userCode` from several plausible Hermes output shapes:
  - URL and code on the same line (`Visit https://accounts.x.ai/... and enter ABCD-EFGH`);
  - URL and code on separate lines;
  - decorated output (box-drawing characters, ANSI-free but padded/indented lines);
  - expiry line present → `expiresAt` populated; absent → undefined.
- Unparseable output → falls back to `{ raw }` payload (raw candidate lines preserved), never throws, never returns a half-parsed code without its URL being at least attempted.
- `parseHermesAuthStatusOutput` → `{ authorized: boolean, accountHint?: string }` for authorized / not-authorized / garbage inputs.
- `parseHermesToolsOutput` + `buildCapabilityManifest` → manifest with `operations` gated on which media tools appear post-auth (image tools only → `video.* enabled:false` with `reason`); output validates against the section-01 manifest schema/type.
- `classifyHermesFailureOutput` maps a 403-ish xAI error body/stderr to the entitlement classification, auth-invalid/revoked output to the reauth classification, anything else to a generic process failure.

### 4.2 `connectionControlHandlers.test.ts` (TDD §6, tests 2–4)

Handlers take an injected deps object (`spawn`, `postEvent`, `profileOps`, `logger`, `clock`); tests use the fake CLI fixture (spawn the real `hermes.mjs` for at least one path per handler) and stubs elsewhere.

- **Authorize handler:**
  - posts the `hermes_device_code` event **exactly once** per run (assert `postEvent` call count for that event type);
  - the injected `logger` spy is never called with a string containing the user code or verification URL (assert across all log calls — this is the token-leak rule from spec §16, enforced fleet-wide by section 12's CI grep);
  - success path: fake CLI approves after a short poll → handler runs `auth status`, posts `hermes_authorized` event with `accountHint`, resolves with a success outcome;
  - device-code expiry/timeout → typed failure `HERMES_OAUTH_SESSION_EXPIRED`; denial output → `HERMES_OAUTH_DENIED`; both terminate the child.
- **Probe handler:**
  - produces a manifest whose `operations` reflect post-auth tool availability (fixture scenario controls `hermes tools` output);
  - xAI-403 scenario → outcome classified `HERMES_ENTITLEMENT_RESTRICTED` (settlement will mark the row `entitlement_restricted`);
  - manifest carries `hermesVersion` + `probedAt`.
- **Disconnect handler:**
  - runs logout **then** profile removal (order asserted via call sequence);
  - profile-removal failure → typed failure returned (no silent success), logout still attempted;
  - success → outcome that settlement maps to `disconnected`.

### 4.3 `hermesConnectionJobs.test.ts` (enqueue + settlement + sweep)

- **Enqueue (per type):** `insertJob` args assert `jobType`, `resourceProfile: "cpu_light"`, tight `timeoutSeconds` (auth ≤ device-code expiry default, probe/disconnect smaller), `runtimeType` = the resolved worker's registered type (fixture workers: `desktop_zeroclaw_managed` private, `hermes_agent_gateway` shared), pinned `workerId`, `capabilityRequirementsJson` carrying `requiredClaimCapability` + `connectionId` + `preferredWorkerId`, and inputJson `{ connectionId, profileReference, timeoutSeconds }` for authorize. No call into any admission/rate-limit function (spy asserts zero calls — rate-limiter exemption).
- **1-concurrent-per-connection:** enqueue while a non-terminal control job exists for the same `connectionId` (any of the three types) returns the existing job (`created: false`) / typed rejection; a terminal prior job does not block.
- **Settlement mapping (table-driven):**
  - authorize completed → row `authorized`, `authorizedAt` set, `accountHint` persisted from the `hermes_authorized` event/outputJson;
  - authorize failed with expiry/denial reasons → row `error` + `metadataJson.lastError` typed (`HERMES_OAUTH_SESSION_EXPIRED` / `HERMES_OAUTH_DENIED`);
  - authorize lease-expired with no terminal event → row `error` with the expiry code;
  - probe completed → `capabilitiesJson` = manifest, `lastProbeAt` set; probe classified 403 → `entitlement_restricted`; probe classified auth-invalid → `reauth_required`;
  - disconnect completed → `disconnected` + `disconnectedAt`; disconnect failed → row NOT marked disconnected, lastError recorded;
  - **media-job side effects:** a terminal `hermes_media_*` job with an auth-classified failureReason → connection `reauth_required`; 403-classified → `entitlement_restricted` (fee reconciliation itself is section 06 — assert only the status side effect here).
- **Idempotency:** settling the same job twice performs one row update / marker write (second call is a no-op).
- **Sweep:** with an injected repo of terminal-but-unsettled hermes jobs, one tick settles all of them and marks them settled; a repo error in one job does not abort the rest; `startHermesConnectionJobSweep`/`stop...` are idempotent and the timer is `.unref()`ed (assert via injected timer or exported tick function `runHermesConnectionSettlementTick(deps)` tested directly, same style as `runInlineRenderWorkerTick`).

### 4.4 Event-contract tests (in the section-01 `shared/hermesMedia.ts` test file, additive)

- `hermesDeviceCodeEventPayloadSchema` accepts `{ verificationUrl, userCode, expiresAt }` and the raw-fallback shape; rejects payloads with token-like extra fields (schema is `.strict()`).
- Event-type constants are exact strings `"hermes_device_code"` / `"hermes_authorized"` (frozen contract consumed by sections 03/07/10/11).

## 5. Implementation

### 5.1 Shared event contract (append to `apps/web/shared/hermesMedia.ts`)

```ts
export const HERMES_DEVICE_CODE_EVENT_TYPE = "hermes_device_code";
export const HERMES_AUTHORIZED_EVENT_TYPE = "hermes_authorized";
export const HERMES_CONNECTION_SETTLED_EVENT_TYPE = "hermes_connection_settled";

export const hermesDeviceCodeEventPayloadSchema = z.object({
  verificationUrl: z.string().url().optional(),
  userCode: z.string().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
  raw: z.string().optional(), // fallback when parsing failed — still never logged
}).strict();

export const hermesAuthorizedEventPayloadSchema = z.object({
  accountHint: z.string().optional(),
}).strict();

/** Shared masking helper (tested by section 12's token-leak guard):
 *  ≥8 chars → first 4 + fixed mask; shorter → fully masked.
 *  Never returns more than 4 original characters. */
export function maskTokenLike(value: string): string;
```

Rule (document in a comment): device-code payloads exist ONLY in `worker_job_events.payloadJson` and the `getConnectStatus` response — never in worker logs, audit JSONL, or error messages.

### 5.2 `hermesConnectionJobs.ts` (web server service)

Public surface (all deps injectable for tests, defaults wired to real modules):

```ts
export interface HermesConnectionJobsRepo { /* findJobById, findNonTerminalControlJobForConnection,
  findWorkerById, insertJob, listTerminalUnsettledHermesJobs, appendJobEvent,
  updateConnectionRow, findConnectionById */ }

export async function enqueueHermesConnectionControlJob(params: {
  jobType: typeof HERMES_CONNECTION_AUTH_JOB_TYPE | typeof HERMES_CONNECTION_PROBE_JOB_TYPE
         | typeof HERMES_CONNECTION_DISCONNECT_JOB_TYPE;
  tenantId: string; requestedByUserId: number;
  connection: HermesProviderConnection;      // resolved + authorized by section-03 caller
  workerId: string;                          // target worker (already validated online by caller)
}, deps?: { repo?: HermesConnectionJobsRepo; now?: () => Date },
): Promise<{ created: boolean; job: WorkerJobRecord }>;

export async function settleHermesConnectionJob(job: WorkerJobRecord,
  deps?: {...}): Promise<{ settled: boolean }>;   // idempotent; also exported for getConnectStatus lazy settle

export function runHermesConnectionSettlementTick(deps?): Promise<void>; // one sweep pass, pure/testable
export function startHermesConnectionJobSweep(): void;  // 60s interval, .unref(), idempotent
export function stopHermesConnectionJobSweep(): void;
```

Key rules:

- **Insert values:** `status: "queued"`, `statusReason: "hermes_connection_jobs"`, `resourceProfile: "cpu_light"`, `priority` above media default (control jobs should jump the media queue on the same worker), `retryPolicyJson: { maxAttempts: 1 }` for authorize/disconnect (device codes are single-use) and `{ maxAttempts: 2 }` for probe, `timeoutSeconds`: authorize = device-code expiry budget (default 900, constant `HERMES_AUTH_JOB_TIMEOUT_SECONDS`; keep ≤ expiry per spec §10), probe 300, disconnect 120. `runtimeType` from `repo.findWorkerById(workerId)`; `workerId` pinned; `capabilityRequirementsJson: { capabilityFamilies: HERMES_MEDIA_CAPABILITY_FAMILIES, requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY, connectionId, preferredWorkerId: workerId }`. `inputJson` for authorize: `{ connectionId, profileReference: connection.profileReference, timeoutSeconds }`; probe/disconnect: `{ connectionId, profileReference }`.
- **Concurrency guard:** before insert, `findNonTerminalControlJobForConnection(connectionId)` — hit → return `{ created: false, job: existing }`. Idempotency key `${jobType}:${connectionId}` on the insert as a second line of defense against races (unique-conflict → re-read).
- **No admission call.** Control jobs bypass `hermesMediaAdmission` entirely.
- **Settlement:** read the job's terminal state + latest handler outcome (typed `failureReason` / `outputJson.classification` / `hermes_authorized` event) and apply the mapping from §4.3 to the connection row via one `updateConnectionRow`. Idempotency: after settling, append a `hermes_connection_settled` event to the job; `listTerminalUnsettledHermesJobs` filters on absence of that event. Lease-expired auth jobs with no events at all → `HERMES_OAUTH_SESSION_EXPIRED` mapping.
- **Media-job side effects only** (status transitions on the connection row) live here; fee reconciliation for `hermes_media_*` jobs is section 06's `reconcileWorkerJobCredits` glue — leave a named hook (`onTerminalHermesMediaJob(job)`) that section 06 extends, so the sweep has a single dispatch point.
- **Sweep bootstrap in `_core/index.ts`:** copy the `startMcpStaleMediaTaskReconciler` block (~L1769): lazy `import`, flag-guard on `hermes_worker_enabled` via `hermesWorkerSettings` (section 01), `try/catch` so failure never blocks startup, timer `.unref()`.

### 5.3 Parsers (`server/hermesWorker/hermesCliParsers.ts`)

Pure functions, no I/O. Device-code parsing strategy (research B2: format undocumented):

- strip decoration (box-drawing chars, leading/trailing punctuation) per line;
- URL: first `https://` token whose host matches an xAI-ish allowlist pattern (do not over-fit — accept any https URL, prefer xAI hosts when multiple);
- code: token matching `/\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?\b/` excluding tokens inside the URL;
- expiry: `expires`/`valid for` phrasing → best-effort ISO conversion using an injected `now`;
- nothing parseable → `{ raw }` with the candidate lines joined (the UI then shows the raw instruction text — degraded but functional).

`buildCapabilityManifest({ hermesVersion, toolsOutput, authStatus, probedAt })` composes the section-01 `HermesConnectionCapabilityManifest`: an operation is `enabled: true` only when its backing tool is present post-auth; absent tools get `enabled: false` + `reason`. `classifyHermesFailureOutput(text)` returns a discriminant consumed by both handlers and settlement: `"entitlement_restricted" | "reauth_required" | "oauth_denied" | "oauth_expired" | "process_failed"`.

### 5.4 Handler cores (`server/hermesWorker/connectionControlHandlers.ts`)

Three exported async functions with one deps interface (everything injected — this is what makes TDD §6 possible without the worker loop):

```ts
export interface ConnectionControlDeps {
  spawnHermes(args: string[], opts: { timeoutMs: number; onStdoutLine(line: string): void }): Promise<{ exitCode: number|null; stdout: string; stderr: string }>;
  postEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
  profileOps: { ensureProfile(ref: string): Promise<void>; removeProfile(ref: string): Promise<void> };
  logger: { info(msg: string): void; warn(msg: string): void };  // NEVER given device-code values
  clock?: () => Date;
}

export async function runHermesConnectionAuthorize(input: { connectionId: string; profileReference: string; timeoutSeconds: number }, deps: ConnectionControlDeps): Promise<HermesControlOutcome>;
export async function runHermesConnectionProbe(input, deps): Promise<HermesControlOutcome>;   // outcome carries the manifest
export async function runHermesConnectionDisconnect(input, deps): Promise<HermesControlOutcome>;
```

Authorize flow: `ensureProfile` → spawn `hermes -p <profile> auth add xai-oauth --no-browser` → on stdout lines, run the device-code parser; on first successful parse (or raw fallback once a URL-like/code-like line appears), post `hermes_device_code` **once** (latch a boolean) → keep the child alive while Hermes polls (bounded by `timeoutSeconds`) → on success run `hermes -p <profile> auth status xai-oauth`, parse `accountHint`, post `hermes_authorized` → return success outcome. Timeout/denial → kill child (term → kill escalation is section 07's invocation module; here a simple timeout-kill in the injected `spawnHermes` contract suffices) → typed outcome. `HermesControlOutcome` is `{ ok: true; accountHint?: string; manifest?: HermesConnectionCapabilityManifest } | { ok: false; errorCode: HermesMediaErrorCode; diagnostic: string }`. The probe handler's success outcome carries `manifest` (this exact field name; sections 07/11 wire it into the job's outputJson verbatim, no renaming). The failure arm's `diagnostic` must already be masked (no code/URL/token content). The masking helper is **`maskTokenLike(value: string): string`** exported from `shared/hermesMedia.ts` — add it in this section's additive shared block (§5.1): ≥8 chars → first 4 + fixed mask, shorter → fully masked, never returns >4 original chars. Section 12's token-leak guard tests this exact helper — do not create a second masking function under another name.

Section 07 will wrap these with the real `spawnHermes` (from `hermesInvocation.ts`), the real event poster (`controlPlaneClient`), and `ProfileStrategy`; section 11 ports the same state machine to Rust against the same fixture scenarios.

### 5.5 Fake `hermes` CLI fixture

`__tests__/fixtures/fakeHermesCli/hermes.mjs` — `#!/usr/bin/env node`, executable, dispatches on argv (`auth add`, `auth status`, `auth logout`, `tools`, `--version`, `-z`) and reads scenario JSON from `FAKE_HERMES_SCENARIO_FILE` (written per-test into the OS tmpdir by `buildFakeHermesEnv`). Scenario fields (typed in `scenario.ts`): per-command `stdoutLines`, `stderr`, `exitCode`, `delayMs`; auth-add extras `approveAfterMs | denyAfterMs | neverApprove`; generate extras `mediaTags`, `cacheFiles`, `workspaceFiles`, `markerBlock` (the generate branch is consumed by sections 07/10-smoke, define it now so the fixture is stable). Keep it dependency-free (node builtins only) so `cargo test` (section 11) can spawn it directly by path.

## 6a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. Hermes suite 192 tests green across 13 files (this
section added ~99: parsers 20, handlers 16, jobs service 30, event
contracts + carry-forward service tests); typecheck baseline unchanged.

As planned, with review-driven changes (verdict REQUEST_CHANGES → fixed):

1. **Raw-fallback device-code posting** — handler now latch-and-posts the
   `{ raw }` payload when a URL-like/code-like line appears without a clean
   parse (was: silent hang on undocumented CLI format).
2. **`failureReason` added to HermesControlOutcome failure shape** (raw
   `HermesControlFailureReason`), so worker_jobs.failureReason carries the
   constants-first vocabulary verbatim.
3. Tenant defense-in-depth in enqueue + tenantId filter in the concurrency
   check; unique-conflict recovery narrowed to Postgres 23505.
4. Diagnostic prefers stderr / last stdout line; TERMINAL_STATUSES single
   constant backs all queries (typed against workerJobStatusValues).

Carry-forwards from section-03 delivered here: `HERMES_CONTROL_FAILURE_REASONS`
vocabulary (constants-first classification with legacy substring fallback)
and the settlement seam tenant check.

Extra exports vs plan: `HERMES_CONTROL_JOB_PRIORITY = 50` (section-05 must
keep media priority below it); `onTerminalHermesMediaJob(job, deps?)` hook
(section-06 extends for fee reconciliation); fixture `scenario.ts` exports
`FAKE_HERMES_CLI_PATH` + `buildFakeHermesEnv`. Known ride-along: the
committed _core/index.ts also carries a concurrent session's model-registry
cache-warm hunk (identified in review; shared-tree policy).

Review trail: `../implementation/code_review/section-04-{diff,review,interview}.md`.

## 6. Acceptance criteria

- All new tests in §4 pass; `pnpm --dir apps/web test` fully green (no regressions in section-01/02/03 suites).
- `worker_job_events` is the ONLY place device-code data lands server-side; grep of the new modules shows no logger/audit call receiving `userCode`/`verificationUrl` (section 12's CI grep test will lock this in fleet-wide).
- `hermesConnectionService.getConnectStatus` (section 03) now settles terminal auth jobs lazily via `settleHermesConnectionJob`, and `disconnect` enqueues through this module — the section-03 router tests still pass unchanged.
- `_core/index.ts` starts the 60s sweep behind try/catch; web startup unaffected when the hermes flag is off or the module throws.
- No import of `queueHermesWorkerJob` / `hermesAgentRuntime` anywhere in the new files (covered by section-01's namespace-guard test — extend its file list to include this section's modules).
- Typecheck green (`pnpm --dir apps/web check`).

## 7. Out of scope (owned elsewhere)

- Worker main loop, claim/heartbeat client, `ProfileStrategy` isolation probe, real spawn/timeout/cancellation machinery → section 07.
- Fee reservation/reconciliation for media jobs → sections 05/06 (this section only exposes the `onTerminalHermesMediaJob` hook and performs connection-status side effects).
- Rust handler port + Worker App device-code UI → section 11; web device-code UI → section 10.
- Audit events for connect/authorize/disconnect → section 12 (leave event-emission call sites as thin optional hooks if convenient, but do not implement audit plumbing here).