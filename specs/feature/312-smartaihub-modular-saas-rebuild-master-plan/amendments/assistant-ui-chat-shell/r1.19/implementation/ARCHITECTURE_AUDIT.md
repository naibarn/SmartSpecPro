# R1.19 Architecture Audit

**Result:** PARTIAL · deployed `smartaihub-platform@e2f78ef6af0162736ff0fb28159f6ff9ef38813c`

## Implemented boundary

The Chat Worker remains a thin authenticated module proxy. SmartSIHub Core remains the owner of account/workspace authorization, conversation and message state, the canonical worker job, provider admission and credit settlement. Chat execution still enters `worker_jobs` + outbox + Cloudflare Queue. The R1.19 event path uses the same SQL database's `worker_job_events` ledger, assigning per-job sequence numbers while holding the canonical job row lock; it does not create an event bus, queue, or in-memory-only source of truth. Core authorizes every replay read using the session account, environment tenant, workspace membership and job scope. The UI cursor is a resume hint, never an authorization grant.

SSE delivers persisted job/status/progress events only. The Core worker reads bounded batches, the Chat proxy streams without buffering, and clients reconnect from the last accepted sequence. The UI ignores duplicate/out-of-order frames and falls back to canonical status polling after stream failure. Closing the browser does not request job cancellation. No token streaming claim is made.

## Boundaries still missing

- **Artifacts:** the legacy `worker_artifacts` table associates a storage reference with a `worker_jobs` row, but this alone does not prove a Modular Chat result producer, tenant-safe registration, private R2 read path or allowed preview contract. Core capability remains false. Do not reuse a legacy public URL or expose `storageRef` as a URL.
- **Inspector:** current actual fields are workspace/thread/model and current job/attempt/status during the mounted chat request. Same-browser refresh now resumes a stored active-job hint through the authorized Core status/events path. No server read model for discovery without that hint or the remaining Project/Session/Run/Agent/Harness/Executor/usage/artifact facts is present.
- **Task Control and Mission Control:** SPEC-294 is the authoritative owner. The Modular Core target has no verified route/adapters for these views. Do not build an independent work queue, task table, Run store or mission orchestrator to fill the visual gap.
- **Retention:** event replay follows existing worker job/event retention and foreign-key cascade. Deleting the canonical job removes its event history. There is no independent archive/retention policy in this amendment.
- **DEV:** exact source `e2f78ef6af0162736ff0fb28159f6ff9ef38813c` is deployed to `modular-debian-dev`; local and public smoke checks passed. The Core dev role cannot read the Drizzle migration ledger, so applied-ledger reconciliation and authenticated live Chat/Queue proof remain pending. The inspected SECURITY DEFINER replay function is owned by a superuser but has no PUBLIC/production execute grant; review least-privilege function ownership with the migration authority before further schema changes.

## Eight-area assessment

| Area | Previous audit | R1.19 now | Evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| Architecture | PARTIAL | PARTIAL | Queue-first source, persisted event replay, exact-target deploy receipt | Migration ledger/owner reconciliation and authenticated queue proof |
| SPEC | PARTIAL | PARTIAL | R1.19 normative amendment, traceability and release evidence | Canonical handoff validation; keep parent/R1.18 open |
| Chat UI | PARTIAL | PARTIAL | 46 tests; typecheck; deployed shell/Chat smoke | Authenticated rendered desktop/tablet/mobile UAT |
| Runtime Adapter | PARTIAL | PARTIAL | Core 119 tests/typecheck; live health/route smoke; target replay function ACL | Migration ledger reconciliation; authenticated replay/reconnect/queue proof |
| Thread Inspector | PARTIAL | PARTIAL | Live job facts and same-browser refresh resume without redispatch | Discovery without browser hint and missing canonical read-model fields |
| Inline Artifacts | MISSING | MISSING | Capability remains false; routes unsupported | Registration + private authorized reads + previews + UI/tests |
| Task Control | MISSING | BLOCKED | SPEC-294 is authority; no verified modular endpoints | Extend/consume authoritative backend; cross-navigation tests |
| Mission Control | MISSING | BLOCKED | SPEC-294 is authority; no verified modular endpoints | Extend/consume authoritative backend; do not clone orchestration |
