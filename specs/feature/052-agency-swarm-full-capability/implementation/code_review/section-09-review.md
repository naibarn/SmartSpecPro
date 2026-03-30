## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agencyStream.ts:394` | DB unavailable silently skips tenant isolation. The agency ownership check is wrapped in `try/catch` with a "best-effort — continue if DB unavailable" comment. A transient DB error allows any authenticated user from any tenant to subscribe to any `runId` channel. This is a tenant isolation bypass. | Remove the "continue" behavior. On DB error, `releaseStream(userId)` and return 503. Tenant verification must be authoritative, not best-effort. |
| HIGH | `agencyStream.ts` | `AGENCY_STREAMING_ENABLED` flag is checked with the global unscoped `getFeatureFlag()` rather than the tenant-scoped `getTenantFeatureFlag()`. The `TenantFeatureFlags` interface in `shared/featureFlags.ts` is the authoritative flag registry, and `agencyStreamingEnabled` is not registered in it — it exists only as a Redis freeform string. All other agency/orchestrator flags (`orchestratorEnabled`, `agencyBrowserSessionUi`) are typed entries in `TenantFeatureFlags`. | Add `agencyStreamingEnabled: boolean` as F30 to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` in `apps/web/shared/featureFlags.ts`. Replace `getFeatureFlag("AGENCY_STREAMING_ENABLED")` with `getTenantFeatureFlag("agencyStreamingEnabled", tenantId)` on both routes. |
| HIGH | `agency_orchestrator.py:875–878` (diff context) | `after_turn` cancellation mode is validated by the cancel endpoint Zod schema and stored in Redis, but the orchestrator's `_check_cancelled` / cancellation check only handles `"immediate"`. The `"after_turn"` mode is silently ignored — the run continues indefinitely until it finishes naturally. | After `_execute_node` returns for an agent turn, check for `"after_turn"` and break the execution loop, emitting an `error` event with `code: "cancelled"`. |
| HIGH | `agencyStream.test.ts:170–189` | The "returns SSE content-type headers for valid request" test is entirely vacuous. Its assertion is `expect(true).toBe(true)`. It verifies nothing about the implementation: headers, status code, content-type, SSE frame format, heartbeat, or Redis subscription are all un-asserted. | Assert the response has `Content-Type: text/event-stream` and status 200. With supertest, `await p` and check `res.headers['content-type']`. Alternatively assert `mockRedisDuplicate` was called (proves Redis subscriber was created) and `mockRedisSubscribe` was called with the correct channel. |
| HIGH | Spec §Tests | 4 of the 8 spec-required Vitest tests are absent: "SSE route sends heartbeat every 15s", "SSE events include id: field for replay", "SSE route handles client disconnect gracefully", and "SSE backpressure — bounded buffer drops oldest when full". The 8-test TDD spec is 50% implemented. | Implement the missing 4 tests. The heartbeat test requires `vi.useFakeTimers()`. The disconnect test emits `close` on `req` and asserts `mockRedisUnsubscribe` + `mockRedisQuit` were called. The backpressure test configures a small `MAX_BUFFER_SIZE` and verifies the buffer shift behavior. |
| MEDIUM | `agency_orchestrator.py` (diff) | `tool_start` and `tool_end` events are listed in the spec's event table and in the shared TypeScript types, but are never emitted in the orchestrator diff. The orchestrator calls `self.adapter.run(...)` and receives a final `run_result.response` — no per-tool-call hooks are present. | The spec (§Implementation Guidance §2) requires `tool_start`/`tool_end` emissions around tool calls. This depends on the adapter exposing a tool-call callback or streaming interface. If the adapter does not support per-tool hooks in this section, the gap must be documented explicitly as deferred to section-16, and the shared event types file should note which events are currently unused. |
| MEDIUM | `agency_orchestrator.py:908–911` (diff) | The `guardrail_trigger` event always reports `guardrailName` as `getattr(agent_guardrails[0], "name", "unknown")` — it always picks the first guardrail in the list, regardless of which guardrail actually fired. If `agent_guardrails` has multiple entries, the reported name is wrong for any non-first guardrail. | The `execute_guardrails` return value (`input_result`) should carry the triggering guardrail's name. Patch `GuardrailResult` to include `guardrail_name: str` and use that in the emit call. |
| MEDIUM | `agency_service.py:985` (diff) | `emit_complete` is called with hardcoded `{"tokens": 0, "cost": 0}`. The `run_result` object from `adapter.run()` likely contains actual token usage. Sending zeroed usage data to SSE clients causes the frontend (section-10) to display incorrect cost/token information. | Extract actual usage from `run_result` (check `run_result.usage` or the existing `execution_context` object that section-15 already reads). Pass real values to `emit_complete`. |
| MEDIUM | `agencyStream.ts:447–451` | If `getRedisClient()` returns `null` (Redis unavailable), the route calls `cleanup()` which calls `res.end()` — but `res.writeHead(200, ...)` was already sent at line 399. The response ends with just headers and no events, no error event, and no explanation. The client receives an empty SSE stream and likely retries in a loop. | After `writeHead`, if Redis is unavailable, write an error SSE frame: `res.write('event: error\ndata: {"code":"redis_unavailable","message":"Streaming unavailable"}\n\n')` then end. |
| MEDIUM | `test_agency_event_emitter.py` | 3 of the 7 spec-required pytest tests are absent: "orchestrator emits text_delta events during agent response", "orchestrator emits tool_start/tool_end around tool calls", "orchestrator emits agent_switch on handoff". The spec requires these as integration-level tests verifying emitter wiring in the orchestrator. | Add the three orchestrator-level tests. These require a minimal mock of `self.adapter.run()` and a mock emitter, then verify `emitter.emit` was called with the right event types and data. |
| LOW | `agencyStream.ts:483–484` | `redis.duplicate()` is called synchronously and `subscriber.subscribe(...)` is awaited. However, `redis.duplicate()` on an IORedis client returns a new client synchronously but does not guarantee the connection is established before subscribe. On a cold path this can produce a "Redis client is not connected" error that is silently caught by the outer `try/catch`. | After `duplicate()`, call `await subscriber.connect()` if available, or verify the existing connection pattern used in `orchestratorStream.ts` and match it exactly. |
| LOW | `agencyStream.ts` | The cancel endpoint does not call `agencyBridge.cancelRun` as specified in §3 of the spec: "Also call existing `agencyBridge.cancelRun` for adapter-level cancellation." The Redis key write is best-effort, but without the adapter-level cancel the running Python task may not receive the signal if Redis pub/sub delivery fails. | Import and call `agencyBridge.cancelRun(runId)` after the Redis set, with its own error handling. |
| LOW | `agencyStream.ts:379–396` | Dynamic `await import(...)` calls for `../db`, `../../drizzle/schema`, and `drizzle-orm` inside the request handler on every SSE connection. These modules are always available and the dynamic import adds latency on the hot path. | Convert to static top-level imports. Dynamic imports are appropriate for optional/lazy modules, not always-present core modules. |
| LOW | `agencyStreamEvents.ts:697–704` | `parseAgencyStreamEvent` casts the parsed object directly to `AgencyStreamEvent` without validating the `data` field shape. A message with `event: "text_delta"` but `data: null` passes the type guard and returns a typed `AgencyTextDeltaEvent` with `data: null`, which will crash section-10 consumers accessing `.data.delta`. | Add a `data !== null && typeof data === "object"` check before the cast, or use a Zod schema for runtime validation. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| JWT auth on SSE route | PASS | `authenticateSSE` calls `sdk.authenticateRequest`, returns 401 on failure |
| JWT auth on cancel route | PASS | Same pattern applied |
| Feature flag gate on both routes | PARTIAL FAIL | Flag name `AGENCY_STREAMING_ENABLED` is not registered in `TenantFeatureFlags`; uses unscoped global flag instead of tenant-scoped. See HIGH finding #2. |
| Tenant isolation — agency ownership check | PARTIAL FAIL | Logic is correct but silently bypassed on DB error. See HIGH finding #1. |
| `agencyId` format validation | PASS | `AGENCY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/` applied before all lookups |
| Redis key naming conventions | PASS | `agency:stream:{runId}`, `agency:stream:{runId}:events`, `agency:cancel:{runId}` — all match spec §Redis Key Conventions |
| Replay list TTL = 1800s | PASS | `REPLAY_LIST_TTL = 1800` in emitter; used on every `expire()` call |
| Cancel key TTL = 300s | PASS | `"EX", 300` in Redis `set` call; matches spec |
| SSE headers (Content-Type, Cache-Control, X-Accel-Buffering) | PASS | All three present in `writeHead` |
| Heartbeat interval = 15s | PASS | `HEARTBEAT_INTERVAL_MS = 15_000` |
| Max stream duration = 30 min | PASS | `MAX_DURATION_MS = 30 * 60 * 1000` |
| Per-user stream limit = 3 | PASS | `MAX_STREAMS_PER_USER = 3` with `acquireStream`/`releaseStream` |
| Bounded buffer max 1000 | PASS | `MAX_BUFFER_SIZE = 1000` with `buffer.shift()` on overflow |
| Monotonic event IDs | PASS | `_event_counter` starts at 0, incremented before each emit, stored as string |
| Emitter graceful on Redis failure | PASS | `except Exception` swallows and logs; does not raise |
| `after_turn` cancellation handled in orchestrator | FAIL | Mode stored in Redis but never checked in orchestrator loop. See HIGH finding #3. |
| `tool_start`/`tool_end` events emitted | FAIL | Not implemented in orchestrator diff. See MEDIUM finding #1. |
| Shared event types file created | PASS | `agencyStreamEvents.ts` exports discriminated union, `AgencyStreamEventType`, `AGENCY_STREAM_EVENT_TYPES`, `parseAgencyStreamEvent` |
| Route registration in `index.ts` | PASS | `import agencyStreamRouter` and `app.use(agencyStreamRouter)` added |
| `emit_complete` with real usage data | FAIL | Hardcoded `tokens: 0, cost: 0`. See MEDIUM finding #2. |
| Vitest: 8 spec-required tests | PARTIAL FAIL | 4 of 8 implemented; 4 absent (heartbeat, id field, disconnect, backpressure). SSE headers test is vacuous. |
| pytest: 7 spec-required tests | PARTIAL FAIL | 4 of 7 core emitter tests implemented (plus 4 `check_cancelled` tests). 3 orchestrator-level tests absent. |

---

### Summary

The core architecture is sound: the Python `AgencyEventEmitter`, the Redis pub/sub wiring into the orchestrator, the Node.js SSE route with replay and bounded buffer, and the shared TypeScript event types are all correctly structured and follow the established `orchestratorStream.ts` pattern. The emitter unit tests for the Python side are thorough.

The implementation has four HIGH-severity issues that block approval: a tenant isolation bypass on DB error, the `AGENCY_STREAMING_ENABLED` flag not registered in `TenantFeatureFlags`, `after_turn` cancellation mode silently ignored in the orchestrator, and a vacuous SSE headers test alongside 4 missing spec-required Vitest tests. Two additional MEDIUM issues — hardcoded zero usage in `emit_complete` and the guardrail trigger always naming the first guardrail — will produce incorrect data visible to users. All findings are fixable without architectural changes.
