# Deep tRPC Security Audit — Round 2
## Agency Router + Stream + ToolsApi
**Auditor:** CMD-6 tRPC Security Auditor
**Date:** 2026-03-23
**Branch:** codex/feature-044-multimodal-chat-memory
**Files examined:**
- `apps/web/server/routers/agency.ts`
- `apps/web/server/routes/agencyStream.ts`
- `apps/web/server/routes/agencyToolsApi.ts`
- `apps/web/server/_core/agencyStreamProxy.ts`
- `apps/web/server/_core/index.ts`

---

## Summary Table

| ID   | Severity | File:Line                                                  | Anti-Pattern                       | Description                                                                                                                                       | Recommended Fix                                                                                                                          |
|------|----------|------------------------------------------------------------|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| R2-01 | HIGH    | `server/_core/agencyStreamProxy.ts:67–69`                 | Auth middleware bypass (tenant isolation) | `agencyStreamProxy` checks only the **global** `getFeatureFlag("AGENCY_SWARM_ENABLED")` — not the tenant-scoped flag. Any authenticated user from a tenant that has not had the flag set can start a run if the global flag is on. The new `agencyStream.ts` already uses the tenant-scoped path; the proxy does not. | Replace `getFeatureFlag` with `getTenantFeatureFlag("AGENCY_SWARM_ENABLED", tenantId)`, deriving `tenantId` the same way `agencyStream.ts` does on lines 92–98. |
| R2-02 | HIGH    | `server/_core/agencyStreamProxy.ts:56–271`                | IDOR — Missing tenant isolation on agency stream | After auth, the proxy extracts `agencyId` from `req.body` and forwards it to Python **without verifying that the agency belongs to the authenticated user's tenant**. An attacker can supply any valid agencyId to run any agency. `agencyStream.ts` added this check at lines 134–159; the proxy has no equivalent. | Before forwarding to Python, add: `SELECT id FROM agencies WHERE id = agencyId AND tenantId = resolvedTenantId`. Refuse if not found. |
| R2-03 | HIGH    | `server/routes/agencyStream.ts:302–355`                   | IDOR — cancel route missing ownership check on runId | The `/api/agency/:agencyId/cancel` route verifies `agencyId` belongs to the tenant (correct), but then writes `agency:cancel:{runId}` to Redis using a caller-supplied `runId` with **no check that the run belongs to the caller's agency or tenant**. Any authenticated user can cancel any run ID if they know it. | Before setting the Redis key, verify that the run exists and belongs to `agencyId`. A `SELECT` on the runs table with `WHERE id = runId AND agencyId = agencyId` (with tenantId already verified for agencyId) is sufficient. |
| R2-04 | HIGH    | `server/routers/agency.ts:760–764`                        | IDOR — `getById` loads agency before tenant check | `getById` fetches the full agency record with `WHERE id = input.id` only (line 760–764), then checks `agency.tenantId !== tenantId` in application code. The DB scan is cross-tenant; the guard is in JS, not SQL. If Drizzle ORM ever returns cached/partial results or if a future refactor removes the JS check, data leaks cross-tenant. | Combine into `WHERE id = input.id AND tenantId = tenantId` in the same SQL call (defense-in-depth), matching the pattern in `shareAgencyWithGroups` (line 332). |
| R2-05 | HIGH    | `server/routers/agency.ts:2719–2746`                      | IDOR — `autoCreateStatus` polling not bound to requesting user | `autoCreateStatus` accepts a `taskId` regex-validated as `^agcreate-[a-f0-9]{12}$` and forwards it to the Python `/status/:taskId` endpoint using **the caller's own JWT** (`Authorization: Bearer ${ctx.userToken}`). Python validates the JWT but there is no claim in the token that binds `taskId` to the requesting user. If Python's status endpoint uses only the taskId as the lookup key and returns data to whoever holds a valid JWT, any authenticated user can poll another user's task by guessing or brute-forcing the 12-hex-char suffix (4.0 × 10^14 space — large but not impossible if tasks are short-lived and replayed IDs are recycled). | On `autoCreate` mutation (line 2712), store `taskId → userId` mapping in Redis with a short TTL (e.g. `agcreate:owner:{taskId} → userId`, TTL 1h). On `autoCreateStatus`, verify `await redis.get("agcreate:owner:{taskId}") === String(ctx.user!.id)` before forwarding. |
| R2-06 | MEDIUM  | `server/routers/agency.ts:3262–3275`                      | Missing input validation — `routeResult` accepts fully untyped envelope | `routeResult` takes `envelope: z.unknown()` with no schema, no size limit, and no ownership check. The `parseAndRouteAgencyResult` service receives raw user-supplied JSON. If `agencyId` or `agencyRunId` are also unvalidated inside that service, a user can route results under a different tenant's agency. Additionally, an unbounded JSON blob can cause OOM in the service. | Add `z.string().uuid()` to `agencyId`/`agencyRunId` (already partially done — `.min(1).max(36)` is not UUID-strict). Add a JSON size cap (`envelope: z.unknown()` → validate byte size in middleware). Verify inside `parseAndRouteAgencyResult` that the agency belongs to `ctx.tenantId`. |
| R2-07 | MEDIUM  | `server/routers/agency.ts:1170`                           | Missing numeric bounds — `position.x` / `position.y` accept NaN and Infinity | `position: z.object({ x: z.number(), y: z.number() })` in both `saveBuilder` and `create` does not reject `NaN`, `Infinity`, or `-Infinity`. Zod's `z.number()` passes IEEE 754 specials. These get stored in the DB as JSON and can cause downstream rendering or arithmetic failures. Same issue exists in `/api/internal/agency/create` at line 930. | Replace with `z.number().finite()` (rejects `NaN`/`Infinity`) or add `.refine(n => Number.isFinite(n))`. Apply to both `saveBuilder`, `create`, and the internal create endpoint. |
| R2-08 | MEDIUM  | `server/routers/agency.ts:917, 1171`                      | Missing array size limit — `toolIds` has no max-length cap | `toolIds: z.array(z.string().min(1).max(100)).optional()` has no `.max(N)` constraint. A single agent can receive an unlimited list of toolId strings, causing an unbounded number of `INSERT` statements into `agencyAgentTools` inside a transaction. This exists in both `saveBuilder` (line 1171) and `create` (line 917). | Add `.max(50)` consistent with the `sharedToolIds` limit at line 1425. |
| R2-09 | MEDIUM  | `server/routers/agency.ts:918–919, 1172–1173`             | Unbounded `nodeConfig` / `toolConfigs` — arbitrary keys stored without sanitization | `nodeConfig: z.record(z.unknown()).optional()` and `toolConfigs: z.record(z.string(), z.record(z.unknown())).optional()` accept any key-value pairs. The superRefine block validates only the **known** nodeType-specific fields; unrecognised keys on all 14 node types are silently persisted to the DB. For the `aggregator` and `knowledge_base` types specifically, **there are no superRefine rules at all** — the entire `nodeConfig` for those two types is stored as-is with zero sanitisation. | Add an allowlist of known top-level keys per nodeType. For `aggregator` and `knowledge_base`, add explicit superRefine blocks (even if minimal). At minimum, add a JSON size limit via `.refine(v => JSON.stringify(v).length <= 16384)`. |
| R2-10 | MEDIUM  | `server/routers/agency.ts:1156, 902`                      | `instructions` field stored without HTML/script sanitisation | `instructions: z.string().max(50000).optional()` is stored in the database and rendered in the agency builder panel. No HTML-stripping or sanitisation step is applied before storage. If the frontend renders this field as HTML/innerHTML, this is a stored XSS vector. The `fewShotSanitizer` (`sanitizeExamples`) is invoked for examples but not for `instructions`. | Apply a server-side HTML-strip (e.g. strip tags using `sanitize-html` with no-tag allowlist) to `instructions` before DB insert, or enforce a policy of never rendering `instructions` as innerHTML on the frontend. |
| R2-11 | LOW     | `server/routers/agency.ts:2852–2857`                      | `listMarketplace` search uses `ILIKE` with unescaped `%` / `_` in pattern | At line 2854, `const searchPattern = `%${input.search}%`;` is passed directly to `ILIKE`. If `input.search` contains `%` or `_`, they act as wildcards, making the LIKE expression broader than intended and potentially causing full-table scans on large tables. | Escape `%` and `_` before building the pattern: `input.search.replace(/%/g, '\\%').replace(/_/g, '\\_')`. |
| R2-12 | LOW     | `server/routes/agencyToolsApi.ts:142–143`                 | `endpoint_url` column key mismatch — SSRF check may be silently bypassed | The tool `config` column is stored as `{ endpoint: input.endpoint }` at insert time (line 3331 of `agency.ts`), but retrieved as `config.endpoint_url` (snake_case) at line 142 of `agencyToolsApi.ts`. If the column key is `endpoint` (camelCase), `endpointUrl` will be `undefined`, causing line 143 to return a 500 "Tool has no endpoint configured" rather than executing — but the SSRF check at line 148 is placed **after** the undefined guard, meaning the execution path never reaches it. The mismatch makes the feature silently broken and the SSRF guard unreachable. | Align the key: either store as `endpoint_url` on insert or read as `endpoint` on fetch. Confirm which is correct by checking the Drizzle schema column definition for `agencyTools.config`. |

---

## Detailed Notes

### Area 1 — saveBuilder superRefine Coverage (all 14 node types)

| Node Type | superRefine rules present? | Notes |
|---|---|---|
| `agent` | YES | executionMode, maxReflectionCycles, planningStrategy, showReasoning validated |
| `supervisor` | YES | Same rules as `agent` (same `includes` check) |
| `router` | YES | Requires `routes.length >= 1` |
| `aggregator` | **NO** | No superRefine rules. Entire `nodeConfig` stored as-is. |
| `knowledge_base` | **NO** | No superRefine rules. Entire `nodeConfig` stored as-is. |
| `skill_call` | YES | `inputMappings` source types validated |
| `human_approval` | **NO** | No superRefine rules. `nodeConfig` free-form. |
| `browser_session` | YES | `goal`, `handoffMode`, `handoffSummary` validated |
| `conditional_branch` | YES | `evaluationMode`, `rules`, `categories` validated |
| `parallel_fan_out` | YES | `branches`, `mergeStrategy`, `maxConcurrent`, `timeoutMs` validated |
| `loop_retry` | YES | `loopTargetNodeId`, `exitCondition`, `maxIterations` validated |
| `skill_discovery` | YES | `taskSource`, `confidenceThreshold`, `maxResults` validated |
| `data_transform` | YES | `transformMode`, `jsonpathExpression`, `template`, `filterCondition` validated |
| `error_handler` | YES | `watchedNodeIds`, `onError`, `retryConfig`, `fallbackNodeId` validated |

**Three types — `aggregator`, `knowledge_base`, `human_approval` — have zero nodeConfig validation.** All key-value pairs are accepted and persisted. This is R2-09.

### Area 2 — `create` vs `saveBuilder` validation parity

The `create` procedure (lines 882–940) and `saveBuilder` share identical agent schema shapes **except**:
- `create` has no `superRefine` block on the agent objects — the full superRefine with 14 node-type validations is only present in `saveBuilder`.
- `create` also lacks the `examples` field.
- `toolIds` in `create` also has no `.max(N)` bound (R2-08 applies to both).

This means an agency can be created via `create` with invalid `nodeConfig` values (e.g. a `conditional_branch` with no `evaluationMode`) that `saveBuilder` would reject.

### Area 3 — `getById` IDOR pattern (R2-04)

The SELECT uses `eq(agencies.id, input.id)` only. The tenantId enforcement is a JavaScript comparison on the returned object. While functionally equivalent today, this is architecturally weaker than a DB-level guard. The safer pattern used elsewhere in this file (e.g. `listAgencyGroups` line 292, `shareAgencyWithGroups` line 332) uses `and(eq(agencies.id, ...), eq(agencies.tenantId, tenantId))` in the WHERE clause directly.

### Area 4 — `autoCreateStatus` task ownership (R2-05)

The `taskId` regex `^agcreate-[a-f0-9]{12}$` defines a 12-hex-char space (~280 trillion combinations). Python receives only the taskId and the caller's JWT. Unless Python's status endpoint performs its own userId-to-taskId binding check, any holder of a valid JWT can retrieve any task's status and `previewJson` (which contains the full agency design specification) by iterating the space. The tRPC layer does not bind taskId to userId at creation time.

### Area 5 — `agencyStreamProxy` IDOR (R2-02)

`agencyStreamProxy.ts` is the older proxy-style stream route (`POST /api/v1/agency/stream`). It validates auth, credit balance, and format of `agencyId`, but never queries the DB to confirm `agencyId.tenantId === user's tenantId`. The newer `agencyStream.ts` (`POST /api/agency/:agencyId/stream`) correctly added this check. The proxy is still registered in `index.ts` line 482 and remains reachable.

### Area 6 — `agencyToolsApi.ts` (clean findings)

- Tenant isolation is correct: `WHERE id = toolId AND tenantId = auth.tenantId AND isExposedAsApi = true AND isEnabled = true` (lines 113–119).
- `isExposedAsApi: false` tools are blocked at the SQL level.
- Rate limiting is present via Redis sliding window (lines 55–68).
- SSRF validation is present at line 148, but see R2-12 for the `endpoint_url` vs `endpoint` key mismatch that may render the execution path unreachable.
- API key scope check (`agency:tool:execute`) is enforced via `requireScopes` middleware (line 75).

### Area 7 — Express routes for agency (no unprotected routes found)

All Express routes touching agency functionality are either:
- tRPC-gated via `protectedProcedure` / `adminProcedure`
- Auth-gated via `authorizeRequest` / `sdk.authenticateRequest` at the route handler level
- Internal endpoints protected by `verifyInternalBearerToken` (timing-safe) or JWT auth

No unauthenticated Express routes for agency were found. `/v1/agencies` (public API) at line 464 of `index.ts` goes through the full `publicApiMiddleware` stack including `apiKeyAuthMiddleware`.

### Area 8 — `routeResult` (R2-06)

`routeResult` is a `protectedProcedure` (auth OK), but the `envelope` field is `z.unknown()` with no structure, size limit, or type narrowing. The procedure delegates immediately to `parseAndRouteAgencyResult` which may perform DB writes under the caller-supplied `agencyId`. The `agencyId` parameter is `z.string().min(1).max(36)` — the `.max(36)` matches UUID length but does not enforce UUID format (a 36-char arbitrary string passes). No check that `agencyId` belongs to `ctx.tenantId` is visible in the router layer.

---

## Fixed / Clean Areas (confirmed in this audit)

- `saveBuilder` tenant isolation: two-step (DB lookup then JS check) — architecturally weaker than single SQL AND but functionally correct for current code.
- `saveBuilder` ownership: `agency.createdBy !== userId && !isAdmin` is enforced.
- `agencyStream.ts` stream route: agencyId verified against tenantId in SQL AND clause (lines 140–153). Clean.
- `agencyToolsApi.ts` tool execution: tenant-scoped SQL AND clause with `isExposedAsApi = true`. Clean.
- `saveBuilder` cycle detection: `detectFlowCycle()` DFS prevents infinite-loop agent graphs.
- Per-user concurrent stream limit: both `agencyStream.ts` and `agencyStreamProxy.ts` enforce `MAX_STREAMS_PER_USER = 3`.
- `autoCreate` rate limit: 5 req/min via `createRateLimitMiddleware`.
- `createCustomTool`: SSRF validation via `validateSsrfUrl`, headers encrypted via AES-256-GCM, per-tenant tool limit of 50.
