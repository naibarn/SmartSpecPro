# Phase 2 — Backend HTTP Resilience (Node server → Python backend)

**Status:** COMPLETE (helper + full migration + review fixes landed; see §9)
**Owner:** conductor + ssp-backend
**Branch:** claude/gallant-kirch-91ba85
**Related:** Phase 1 (frontend) shipped in `60efaaa85` — `client/src/lib/requestResilience.ts` + global QueryClient retry + bounded tRPC fetch timeout. Memory: `project_client_resilience_policy` ("backend Node→Python phase pending").

---

## 1. Problem statement

The Node web server makes ~85 internal HTTP calls to the Python backend (`runtime.pythonBackendUrl`, a few hardcoded `localhost:8000`). The posture is **inconsistent**:

- Many raw `fetch()` calls have **no timeout at all** → a hung/briefly-unavailable Python backend blocks the request until the outer client/nginx timeout, or fails immediately with no retry-and-wait.
- Some services already set an `AbortSignal.timeout` (10–180s) but with **no retry**.
- One (`federatedSearch.searchVectorStore`) creates an `AbortController` but **never arms it** (dead timeout — looks resilient, isn't).

Phase 1 gave the frontend a fixed, user-approved resilience policy. Phase 2 brings the **same policy** to the backend Node→Python hop via one shared helper, so a brief Python restart (systemd `Restart=on-failure`, a few seconds) is bridged by bounded retry-and-wait instead of surfacing as an immediate error, and a truly hung backend fails within a bounded time instead of hanging.

## 2. Goal (mirror Phase 1, adapted for Node/undici)

Introduce **one** shared helper `apps/web/server/_core/fetchWithResilience.ts`:

- **Bounded timeout** per attempt via `AbortSignal.timeout(timeoutMs)` composed with any caller-supplied signal (`AbortSignal.any` — available on Node v22.22.3).
- **Bounded retry with capped exponential backoff** for **transient** failures only.
- **Anti-double-side-effect rule (identical to Phase 1):** never auto-retry a non-idempotent POST/PUT/PATCH/DELETE on 5xx/timeout (the write may have landed). Only retry those on a **pure connection-refused** (request never reached the server), and **only if the caller opts in** (`retryPolicy: "connect-only"`).

Then migrate the internal-Python-backend fetches to it, choosing per-call whether retry is safe.

### 2.1 Parity with Phase 1 + deliberate divergences

| Aspect | Phase 1 (frontend) | Phase 2 (backend) | Why |
|---|---|---|---|
| Idempotent read retry | transient (network/5xx/timeout), ≤4 | transient, `maxRetries` default **3** | Each server retry consumes the single outer-request budget (180s tRPC ceiling), so slightly fewer than the frontend's 4. |
| Write retry | connection-failure only, ≤5 | connect-only, opt-in, default **3** | Same double-write safety; opt-in because most writes should not retry at all. |
| Backoff | `min(1000·2^n, 5000)` | **identical** | Reuse the exact formula. |
| "Never reached server" detection | `TypeError` regex (browser) | `err.cause.code ∈ {ECONNREFUSED, ENOTFOUND, EAI_AGAIN, EHOSTUNREACH, ENETUNREACH, UND_ERR_CONNECT_TIMEOUT}` (undici) | Node fetch failures are `TypeError: fetch failed` with a `cause` chain, not the browser's "Failed to fetch". |
| Timeout error | `AbortError` from client wrapper | `TimeoutError` from `AbortSignal.timeout` (distinct from a caller's `AbortError`) | Must distinguish our ceiling (retryable for reads) from a caller cancelling (never retry, propagate). |
| Default per-attempt timeout | 180s (whole tRPC req) | **30s** default, per-call override (long ops 60–170s) | Internal hop, not the whole request. |

## 3. nginx analysis — NO nginx change required

Internal Node→Python calls go **directly** to `localhost:8000`, bypassing nginx. nginx only bounds the **outer** client→nginx→Node hop. Ceilings observed:

- `nginx/conf.d/dev-host.conf`: `proxy_read_timeout` 600s (most routes), 700s (one), 300s (voice).
- `nginx/nginx-dev.conf`: 120s on some.

Our internal per-attempt timeouts (≤170s) and worst-case retry envelopes sit **comfortably under** every nginx ceiling and under the 180s tRPC client timeout, so a hung Python backend surfaces as a clean mapped error before nginx or the client aborts. **Action: none** — documented here per the task's "keep nginx in mind" requirement.

## 4. Helper design (exact spec — implement identically)

File: `apps/web/server/_core/fetchWithResilience.ts`

```ts
export type RetryPolicy = "transient" | "connect-only" | "off";

export interface ResilientFetchOptions extends RequestInit {
  /** Per-attempt ceiling before AbortSignal fires. Default 30_000. */
  timeoutMs?: number;
  /** Max RETRY attempts on top of the initial call. Default 3 (ignored when policy resolves to "off"). */
  maxRetries?: number;
  /**
   * Override the retry policy. Default is derived from the HTTP method:
   *   GET/HEAD/OPTIONS  -> "transient"     (retry network/5xx/timeout)
   *   POST/PUT/PATCH/DELETE -> "off"        (no retry)
   * A non-idempotent caller that is SAFE to re-attempt only when the request
   * never reached the server may opt into "connect-only".
   */
  retryPolicy?: RetryPolicy;
  /** Short label for structured logging on retry/exhaustion. */
  label?: string;
  /** Test seam: injectable backoff (defaults to the capped-exponential formula). */
  backoffMs?: (attempt: number) => number;
  /** Test seam: injectable fetch impl (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

export async function fetchWithResilience(
  url: string | URL,
  options?: ResilientFetchOptions,
): Promise<Response>;
```

**Behavior:**
1. Resolve method → default policy (GET/HEAD/OPTIONS = `transient`, else `off`); caller `retryPolicy` overrides.
2. Each attempt: compose `AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)])` (omit caller entry if none). Call `fetchImpl(url, { ...init, signal })`.
3. On a `Response`:
   - `status < 500` → **return it as-is** (body untouched, caller reads it). This includes 4xx — never retried.
   - `status >= 500` → retry iff policy === `transient` and attempts remain; **do not read the body** on the retry path. If not retrying → return the 5xx Response so the caller's existing status→error mapping runs unchanged.
4. On a thrown error, classify:
   - **Caller abort** (`err.name === "AbortError"` and the caller's signal is aborted) → rethrow immediately, never retry.
   - **Timeout** (`err.name === "TimeoutError"`, our ceiling) → retry iff policy === `transient`.
   - **Connect-never-reached** (`causeCode ∈ CONNECT_ERROR_CODES`) → retry iff policy ∈ {`transient`, `connect-only`}.
   - **Other transient network** (`ECONNRESET`/`EPIPE`/`ETIMEDOUT`/`UND_ERR_SOCKET`, or a generic `fetch failed` TypeError) → retry iff policy === `transient` (NOT connect-only — may have reached the server).
   - Anything else → rethrow.
5. Between attempts: await `backoffMs(attempt)` (0-indexed), abortable by the caller signal.
6. Exhaustion: return the last 5xx `Response` if that was the last outcome, else rethrow the last error.

**Exports for unit testing:** `fetchWithResilience`, `CONNECT_ERROR_CODES`, `classifyFetchOutcome`(or equivalent predicate set: `isCallerAbort`, `isTimeoutError`, `isConnectError`, `isTransientNetworkError`), `defaultRetryDelayMs`, `defaultPolicyForMethod`.

**Do NOT** read/clone response bodies except on the terminal (returned) response. **Do NOT** log secrets — `label` + method + host only, never headers/body (see Secret Exposure rules).

## 5. Per-call migration spec (authoritative — from the inventory)

Legend: **T**=transient (GET reads), **C**=connect-only (write safe to re-attempt only if never sent), **OFF**=timeout-only, no retry (paid/public/non-deduped writes or polymorphic calls). `t=` timeoutMs.

### routers/
| Site | Method | Policy | t (ms) |
|---|---|---|---|
| media.ts adminListTasks (~3776) | GET | T | 30000 |
| media.ts deleteTask (~3842) | DELETE | C (idempotent-by-id) | 30000 |
| media.ts fetchTaskResult (~3872) | POST | C (calls provider) | 120000 |
| approvals.ts pending/list/get (106,137,186,232) | GET | T | 30000 |
| approvals.ts respond/cancel (287,364) | POST | C (idempotent-by-id) | 30000 |
| agency.ts creator start/answer (3620,3746) | POST | C | 30000 |
| agency.ts creator status (3654) | GET | T | 30000 |
| agency.ts guardrails/test (4903) | POST | T (no persistence — verify) | 30000 |
| agency.ts review-agency (5548) | POST | C | 90000 |
| agency.ts analyze-feedback (5701) | POST | C | 30000 |
| presentationImport.ts start (136) | POST | C | 45000 |
| presentationImport.ts delete (312) | DELETE | C (best-effort, idempotent) | 30000 |
| **workflow.ts `fetchPythonBackend` wrapper (73, 16 sites, no timeout today)** | GET+POST | per-call: GET→T, `execute`→OFF, other POST→C | 30000 (execute/compile 60000) |
| workflow-health.ts probes (48,117) | GET/HEAD | T | 30000 |
| help.ts screenshot (69) | POST | C | 60000 |
| chat.ts vision/analyze (1244) | POST | C (fire-and-forget) | 120000 |
| webhookTriggers.ts webhook-trigger (376) | POST | C | keep 30000 |
| systemSettings.ts `fetchPythonAdminJson` (148, 4 sites) | GET+POST | GET→T, POST→C | keep 10000 |
| systemSettings.ts assert-config-edit (183) | POST | C | keep 10000 |
| automationCopilot.ts `callPythonBackend` (34, 4 sites) | GET+POST | GET→T, execute→C (has reservation_id), analyze→C, cancel→C | keep 30000/60000 |
| metaChannels.ts `callPythonBackend` (45, 5 sites) | GET+POST | GET→T, POST→C | keep 15000 |
| infrastructure.ts health/system (768) | GET | T | keep 5000 |
| sandbox.ts cancel (→ dispatchService.internalFetch) | POST | C | keep 30000 |
| queues.ts schedule/runs/stats (506,529,540) | GET | T | 30000 |
| mediaJobs.ts execute (322), process-video (690) | POST | C | 60000 |
| routers.ts /api/auth/me (1785, no timeout today) | GET | T | 30000 |
| googleDrive.ts `pyFetch` (143, 18 sites) | GET+POST+DELETE | GET→T, POST/DELETE→C | keep 10000/30000 |
| oneDrive.ts `pyFetch` (82, 18 sites) | GET+POST+DELETE | GET→T, POST/DELETE→C | keep 10000/30000 |

### routes/
| Site | Method | Policy | t (ms) |
|---|---|---|---|
| webhooks.ts process-changes (112) | POST | C (fire-and-forget, re-scan idempotent) | keep 5000 |
| browserTool.ts /api/browser/execute (369) | POST | **OFF** (arbitrary browser actions) | keep dynamic |
| workflowNodeTypes.ts node-types (60) | GET | T | 30000 |
| internalSocialTool.ts publish (358), reply (464) | POST | **OFF** (public post/comment dup risk) | 30000 |

### _core/
| Site | Method | Policy | t (ms) |
|---|---|---|---|
| mcpRegistry.ts tools/call (1898) | POST | **OFF** (polymorphic tool — can't assume idempotency) | 30000 |
| mcpRoutes.ts tools discovery (425) | GET | T | keep 2000 |
| mcpRoutes.ts tools/call (450) | POST | **OFF** (polymorphic) | 30000 |

### services/
| Site | Method | Policy | t (ms) |
|---|---|---|---|
| markdownExport.ts render-pdf (440) | POST | C (no DB mutation, long render) | 120000 |
| libraryService.ts search (467) | POST | T (read; already degrades) | keep 1500 |
| libraryService.ts propagate-scopes (3788) | POST | C (fire-and-forget, absolute set = idempotent) | 30000 |
| federatedSearch.ts (219,254,312) — **fix dead AbortController** | POST/GET | T (read tools) | 30000 |
| queryEmbeddingService.ts embeddings (39) | POST | T (deterministic, no persistence) | 30000 |
| sttService.ts stt (67) | POST | **OFF** (paid, no dedup) | 60000 |
| ttsService.ts tts (64) | POST | **OFF** (paid, no dedup) | 60000 |
| summaryService.ts generate-summary (190) | POST | C | 60000 |
| libraryUploadPipeline.ts `postInternalJson` (315, 2 sites) | POST | C (OCR/enrich; provider-paid → could be OFF) | keep 30000 |
| localAiMediaAssist.ts `postInternalJson` (63, 2 sites) | POST | C | keep 30000 |
| socialModerationService.ts `callPythonBackend` (130, 2 sites) | POST | reply→**OFF**, hide/delete→C | keep 15000 |
| socialInboxService.ts DM send (75/566) | POST | **OFF** (dup message risk) | keep 30000 |
| socialPublishGateway.ts publish (25, 2 callers) | POST | **OFF** (public content dup) | keep 30000 |
| social/providerActions.ts reply (329) | POST | **OFF** (public comment dup) | 30000 |
| mediaGenerationService.ts `postJson` submit (1982, 6 sites) | POST | **OFF** (paid media, credits; do NOT compound with `submitTaskWithRetry` settings-race retry) | 60000 |
| mediaGenerationService.ts poll/list (2807,2880) | GET | T | 30000 |
| mediaGenerationService.ts cancel (2903) | PATCH | C (idempotent-by-id) | 30000 |
| presentationPlaybackExport.ts export start (859) | POST | C | 120000 |
| presentationPlaybackExport.ts poll (1532) | GET | T | 30000 |
| presentationPlaybackExport.ts cancel (1685) | POST | C (best-effort) | 30000 |
| virtualAdmin restart-worker (approvalActions 29) | POST | C | keep 15000 |
| virtualAdmin revoke-task (approvalActions 68) | POST | C (idempotent-by-id) | keep 10000 |
| virtualAdmin retry-task (autoFixActions 15) | POST | **OFF** (could duplicate job) | keep 10000 |
| virtualAdmin celery-health (celeryHealth 11) | GET | T | keep 8000 |
| virtualAdmin apiLatency ping (28) | GET | T | keep 15000 |
| sandbox/dispatchService.ts `internalFetch` (56) dispatch (93) | POST | C (has idempotency_key) | keep 30000 |
| agentRuntime/client.ts `callMutation` (608, 4 sites) | POST | keep OFF (leave as-is; already best-in-class) — or C for cancel/resume | keep 180000 |
| agentRuntime/client.ts health (592) | GET | T (currently no timeout) | 30000 |
| chatService.ts drive-tools check (92) | GET | T | keep 2000 |
| webhookDispatchQueue.ts webhook-trigger (122) | POST | C | keep 60000 |
| marketplaceAutoReviewService.ts process-video (23643) | POST | C | 60000 |
| liveBrowserGateway.ts `callLiveBrowserBackend` (310, 8 sites) | POST | reads (getSession/listEvents)→T, control (sendCommand/createSession)→OFF | keep 30000 / per-call |
| agencyBridge.ts run (202) | POST | **OFF** (credit-charging, no dedup) | keep 120000 |
| agencyBridge.ts cancel (235) | POST | C (idempotent-by-id) | 30000 |
| agencyBridge.ts list/get (257,273) | GET | T | 30000 |

### DO NOT MIGRATE (streaming / out of scope)
- Streaming/SSE: `_core/agencyStreamProxy.ts`, `_core/liveBrowserStreamProxy.ts`, `_core/index.ts` generic `http.request` proxy, `routes/contentComposerStream.ts`.
- Out of scope (not the Python backend): `routers/factory.ts` + `controlPlaneClient.ts` (Control Plane / Orchestrator), `routers/systemSettings.ts:901/1308` (Google API tests), `routers/agency.ts:4542` + `routes/agencyToolsApi.ts:170` (arbitrary tenant tool URLs), `services/mcpMediaAdapter.ts:764` + `services/agencyMcpService.ts:147` (generic external MCP), `virtualAdmin/apiLatency` self-ping to `:3000`.
- Dead code: `services/socialPublishingService.ts:294` `callPythonBackend` (0 callers) — leave; optional separate cleanup.

## 6. Risk assessment

| Risk | Mitigation |
|---|---|
| **Timeout regression** — a legit-long call now aborts | Per-call timeouts from the inventory (120–170s for PDF/export/vision/media). Never shrink an existing generous timeout; only add where none exists or keep the current value. |
| **Double side-effect from retry** | Writes default to OFF; C is opt-in and only fires on connect-never-reached (fast, pre-send). Paid/public/non-deduped writes are OFF (timeout-only). |
| **Retry storm / compounding** | `mediaGenerationService.postJson` = OFF so it never stacks on the existing `submitTaskWithRetry` settings-race retry. Backoff capped at 5s; `maxRetries` bounded. |
| **Latency envelope** vs 180s tRPC ceiling | transient GET worst case (30s t × 4 attempts + backoff ≈ 127s) < 180s. Long-timeout calls are C/OFF, which don't compound on timeout. |
| **Body double-read** | Helper only reads the body of the terminal returned response; retry path inspects `status` only. |
| **`federatedSearch` dead timeout** | Fixed as part of migration (arm the timeout via the helper). |
| **Broad blast radius (~40 files)** | Migration is mechanical per this spec; staged in disjoint-file waves; helper is unit-tested first; final read-only review + typecheck-delta. |

## 7. Staging

1. **Wave 1** — helper `_core/fetchWithResilience.ts` + `_core/fetchWithResilience.test.ts` (12 cases). Must land + pass first.
2. **Wave 2** — migrate (disjoint file sets, ≤2 agents editing at once): Batch A routers/, Batch B services/, Batch C routes/+_core/.
3. **Wave 3** — verification: run helper tests, typecheck-delta on changed files, read-only review (ssp-reviewer) of a sample of write-path migrations for policy correctness.

## 8. Verification steps

- `cd apps/web && npx vitest run server/_core/fetchWithResilience.test.ts` → all green.
- Typecheck changed files only (repo baseline `tsc` has ~987 pre-existing unrelated errors — do NOT gate on a clean full `tsc`; confirm no NEW errors in touched files).
- Grep confirms no remaining raw `fetch(\`${...pythonBackendUrl}...\`)` in migrated files (except the DO-NOT-MIGRATE list).
- Spot-check: every OFF write still sets a bounded timeout; every C/T call passes the specified policy.
- No secrets logged by the helper.

## 9. Wave 3 outcomes (final state)

**Delivered:**
- Helper `_core/fetchWithResilience.ts` + `fetchWithResilience.test.ts` — **28/28 green** (12 required cases + regression guards, incl. the statusless-status case below).
- ~50 server files migrated across routers/, routes/, _core/, services/ (68 direct sites + 17 wrappers ≈ 85 units). `git diff --name-only` matches the §5 inventory.
- **Independent read-only review (ssp-reviewer): APPROVE_WITH_FIXES → all fixes applied.** Core safety invariant verified with **zero violations** across 67 explicit policies + every method-derived wrapper: no non-idempotent call can retry on a 5xx/timeout.

**Correctness hardening discovered during verification:**
- Helper now retries only a **confirmed numeric ≥500** (`typeof status === "number" && status >= 500`). Previously `status < 500` treated a statusless/`undefined`-status response (partial test mocks, exotic Responses) as a retryable 5xx → spurious retry/hang. No-op for real `fetch` (always numeric status); immunizes every statusless mock in the codebase. Regression test added.

**Review fixes (Wave 3):**
1. `agencyBridge.executeRun` migrated to the helper (`retryPolicy: "off"`, keeps `RUN_TIMEOUT_MS`); its catch already handled `TimeoutError`/`AbortError`, so the friendly timeout message is preserved.
2. Mixed-use wrappers (`pyFetch` google/onedrive, `fetchPythonBackend` workflow, `fetchPythonAdminJson` systemSettings, `callPythonBackend` automationCopilot/metaChannels) now default **reads→transient, writes→connect-only** (was the conservative "off"), delivering the plan's per-call intent — safe retry-and-wait for writes during a brief Python restart. `workflow.execute` explicitly kept `"off"` (credit-charging).
3. `federatedSearch` MCP `tools/call` (transient) documented with a guard comment: safe only because the tool name is hardcoded read-only; the same endpoint is `"off"` for polymorphic callers.

**Test-only follow-ups handled:**
- `presentationPlaybackExport.test.ts`: the status-poll swallow test given a 15s timeout (it now correctly retries a transient 5xx ~7s); 4 pre-existing mock gaps (mocks lacked `.text()`, proven failing on HEAD via baseline swap) fixed opportunistically → file now **38/38 green**.

**Verification:** full `tsc` = **987 = pre-existing baseline, zero new errors in any of the ~58 touched files** (pre-existing errors are all r3f JSX + ioredis/BullMQ dual-version, in untouched files). Leftover-fetch grep clean — every remaining raw `fetch` to the Python backend is either the DO-NOT-MIGRATE streaming list or one confirmed **dead** wrapper (`socialPublishingService.ts` `callPythonBackend`, 0 callers — flagged for separate removal).

**nginx:** no change required (see §3).

**Recommended before deploy:** run the full `pnpm test` suite + a real-env smoke (this worktree has no `.env`/DB, so some suites can't run here) — the migration is behaviorally transparent for healthy responses; the only behavior change is bounded timeout + bounded retry-and-wait on transient failures.
