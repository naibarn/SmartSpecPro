# R1.19 Architecture Audit

**Result:** PARTIAL · deployed `smartaihub-platform@921553af6dc8b72e6730f3ab5e0a1fba56eb444b`

## Implemented boundary

The Chat Worker remains a thin authenticated module proxy. SmartSIHub Core remains the owner of account/workspace authorization, conversation and message state, the canonical worker job, provider admission and credit settlement. Chat execution still enters `worker_jobs` + outbox + Cloudflare Queue. The R1.19 event path uses the same SQL database's `worker_job_events` ledger, assigning per-job sequence numbers while holding the canonical job row lock; it does not create an event bus, queue, or in-memory-only source of truth. Core authorizes every replay read using the session account, environment tenant, workspace membership and job scope. The UI cursor is a resume hint, never an authorization grant.

SSE delivers persisted job/status/progress events only. The Core worker reads bounded batches, the Chat proxy streams without buffering, and clients reconnect from the last accepted sequence. The UI ignores duplicate/out-of-order frames and falls back to canonical status polling after stream failure. Closing the browser does not request job cancellation. No token streaming claim is made.

## Boundaries still missing

- **Artifacts:** the legacy `worker_artifacts` table associates a storage reference with a `worker_jobs` row, but this alone does not prove a Modular Chat result producer, tenant-safe registration, private R2 read path or allowed preview contract. Core capability remains false. Do not reuse a legacy public URL or expose `storageRef` as a URL.
- **Inspector:** actual workspace/conversation ID (not a canonical Thread ID), last response model, token usage, credits, execution source, message count/update time and current job/attempt/status are displayed from persisted Core responses. Same-browser refresh resumes a stored active-job hint through authorized Core status/events. Discovery without that hint and authoritative Project/Session/Run/Agent/Harness/Executor/artifact facts are still absent.
- **Task Control and Mission Control:** SPEC-294 is the authoritative owner. The Modular Core target has no verified route/adapters for these views; SPEC-294 defines shared authorization-scoped projection requirements, so navigation must wait for an API/DTO contract that the Chat module can consume. Do not build an independent work queue, task table, Run store or mission orchestrator to fill the visual gap.
- **Retention:** event replay follows existing worker job/event retention and foreign-key cascade. Deleting the canonical job removes its event history. There is no independent archive/retention policy in this amendment.
- **DEV:** latest exact source `921553af6dc8b72e6730f3ab5e0a1fba56eb444b` is deployed to `modular-debian-dev`; earlier source `691c9cd05a70e9ccb7b7394f962e3d609a5c4076` added event replay; local and public smoke checks passed. The deterministic pinned-SHA builder is now implemented and used for this release. The Core dev role cannot read the Drizzle migration ledger, so applied-ledger reconciliation and authenticated live Chat/Queue proof remain pending. The inspected SECURITY DEFINER replay function is owned by a superuser but has no PUBLIC/production execute grant; review least-privilege function ownership with the migration authority before further schema changes.

## Eight-area assessment

| Area | Previous audit | R1.19 now | Evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| Architecture | PARTIAL | PARTIAL | Queue-first source, persisted event replay, exact-target deploy receipt | Migration ledger/owner reconciliation and authenticated queue proof |
| SPEC | PARTIAL | PARTIAL | R1.19 normative amendment, traceability and release evidence | Canonical handoff validation; keep parent/R1.18 open |
| Chat UI | PARTIAL | PARTIAL | 47 tests; typecheck; deployed shell/Chat smoke | Authenticated rendered desktop/tablet/mobile UAT |
| Runtime Adapter | PARTIAL | PARTIAL | Core 120 tests/typecheck/build; live health/route smoke; target replay function ACL | Migration ledger reconciliation; authenticated replay/reconnect/queue proof |
| Thread Inspector | PARTIAL | PARTIAL | Persisted model/token/credit/source facts, live job facts and same-browser refresh resume without redispatch | Discovery without browser hint and missing canonical Project/Session/Run/Agent/Harness/Executor/Artifact read-model fields |
| Inline Artifacts | MISSING | MISSING | Capability remains false; routes unsupported | Registration + private authorized reads + previews + UI/tests |
| Task Control | MISSING | BLOCKED | SPEC-294 is authority; no verified modular endpoints | Extend/consume authoritative backend; cross-navigation tests |
| Mission Control | MISSING | BLOCKED | SPEC-294 is authority; no verified modular endpoints | Extend/consume authoritative backend; do not clone orchestration |

## Current checkpoint update — 2026-11-15

- Shared `ExecutionEventEnvelopeV1` validation now defines optional canonical identity fields without inventing absent Thread/Run/Agent/Executor IDs; both Core emission and Chat consumption use this shared type/parser. Chat ignores malformed, cross-workspace, mismatched-job, duplicate and out-of-order frames.
- Inspector now renders persisted last-response model, input/output tokens, credits and execution source. It accurately labels the conversation ID, adds a timeline of up to 20 validated persisted events and restores that summary on refresh. Chat regression suite is 47/47.
- `scripts/build-modular-debian-dev-release.sh` verifies the source is integrated on `origin/main`, locks the output target to `modular-debian-dev`, builds separate Core/Shell/Chat artifacts and writes SHA-bound digests. It was used for the current deployment.
- Current release receipt and smoke evidence: [`r1.19-dev-release-20261115-691c9cd.md`](r1.19-dev-release-20261115-691c9cd.md). This does not satisfy authenticated UAT or the missing output artifact and SPEC-294 APIs.

## Current checkpoint — 2026-11-15 (`921553a`)

The enabled-model catalog now validates eligible provider credential decryption concurrently instead of serially, after the shared enabled-model repository and live quote intersection. A barrier regression test proves all candidate checks start before completion; Core tests 120/120, typecheck and Wrangler dry-run pass. Exact target-gated DEV receipt: `implementation/r1.19-dev-release-20261115-921553a.md`. This improves serial wait in model-catalog admission, but no authenticated latency benchmark has run; model availability, artifacts, canonical run/agent/executor links, Task/Mission adapters, migration review and authenticated UAT remain open.
