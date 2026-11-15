# SPEC-312 Amendment R1.19 — Chat execution, event, artifact and control-plane integration

**Status:** IMPLEMENTATION IN PROGRESS · **Date:** 2026-11-15
**Parent:** SPEC-312, R1.18 assistant-ui Chat shell. R1.18 history and evidence remain immutable.
**Source baseline:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`; current integrated/deployed checkpoint `e2f78ef6af0162736ff0fb28159f6ff9ef38813c`.
**DEV target:** `modular-debian-dev` (`https://aimarkethubs.com`); never release this work to `smartaihub.app` or production `smartsihub.com`.

## Objective

Close implementation gaps identified by the R1.18 completeness audit. Core remains the authority for authentication, tenant/workspace ownership, conversations, messages, jobs, credits, artifacts and execution links. Continue using `worker_jobs` + outbox + Cloudflare Queue for all model/agent execution. Do not add a second queue, run store, task manager, mission orchestrator, credit ledger, or provider dispatch path.

## Normative requirements

1. Define and persist a versioned, tenant-authorized execution event contract with stable event/correlation/idempotency IDs, ordered per-scope cursors, replay, deduplication and a documented retention policy. Do not synthesize unavailable entity IDs.
2. Expose authenticated SSE (or an explicitly justified compatible transport) over persisted events for Chat job progress and canonical message/job state. Reconnect by cursor; preserve polling fallback; disconnect must not cancel durable work. Do not describe completed-response jobs as token streaming.
3. Enable artifact capability only with complete authenticated registration, ownership validation, metadata/preview and private retrieval/download paths backed by the existing storage contract. Render only content-type-appropriate, non-executable previews. No placeholder success or permanent public private-file URLs.
4. Provide a truthful Thread Inspector projection for available canonical workspace/project/session/thread/model/job/run/agent/harness/attempt/executor/usage/event/artifact facts. Missing source facts stay explicitly unavailable. Refresh and reconnect restore state without enqueueing another turn.
5. Integrate Chat navigation and read state with the existing Task Control and Mission Control authorities. Preserve canonical Thread/Run/Job IDs; do not clone their storage/orchestration. If authoritative contracts do not exist, ship only compatible slices and mark the corresponding feature PARTIAL/BLOCKED.
6. Complete responsive assistant-ui shell interactions for desktop 1440x900, tablet 820x1180 and mobile 390x844 while preserving current themes, locale, navigation, attachments and queue-first send path.
7. Maintain tenant/workspace authorization, idempotency, worker fencing, provider admission and credit reservation/settlement. Any new persistent schema uses additive, reversible migrations and migration/authorization tests.
8. Every acceptance claim maps to requirement ID → authority → source/API → test → exact DEV receipt. Real authenticated browser UAT is not replaceable by mocks; if unavailable, record BLOCKED and provide steps.

## Acceptance areas

Architecture; SPEC; Chat UI; Runtime Adapter; Thread Inspector; Inline Artifacts; Task Control; Mission Control. Each is reported PASS/PARTIAL/MISSING/FAIL/BLOCKED with exact evidence. Parent SPEC-312 and amendment R1.18 remain open until their acceptance requirements and authenticated UAT are satisfied.

## Execution sequence

P0 canonical schema/API and cross-SPEC contract reconciliation → P1 persisted event/replay/SSE and durable run correlation → P2 private artifacts → P3 Inspector → P4 Task Control → P5 Mission Control → P6 UI and responsive closure → focused regressions, DEV release, handoff reconciliation. Independent compatible work may continue around external UAT blockers.

## Explicit exclusions

No production release, no legacy SmartAIHub runtime changes, no direct provider invocation from Chat HTTP, no fabricated Run/Agent/Executor data, no new orchestration system, no weakening auth, and no assertion of full acceptance without proof.

## Current implementation evidence (2026-11-15)

- Source `smartaihub-platform@e2f78ef6af0162736ff0fb28159f6ff9ef38813c` is integrated on `main` and deployed to `modular-debian-dev`.
- R1.19-1 and R1.19-2 have source and deployed-smoke implementation: migration `0437_modular_chat_job_event_replay.sql` reuses `worker_job_events`; Core exposes owner/workspace-scoped replay via `list_modular_chat_job_events`; the authenticated Core SSE route and Chat Worker proxy stream persisted events; the Chat UI consumes ordered events, resumes from its saved per-job cursor, rejects duplicates, and falls back to canonical status polling without re-enqueueing. A session-scoped active-job hint now restores the known turn after browser refresh using authorized Core job-status and replay reads; the hint is not an authorization grant. This is persisted job status/progress, not generated-token streaming.
- Focused evidence: Chat package tests 46/46; Core tests 119/119; Chat/Core TypeScript package checks passed; Core, Shell and Chat builds and Wrangler dry-runs passed. The DEV release controller deployed exact source SHA `e2f78ef6af0162736ff0fb28159f6ff9ef38813c`; local Core/Chat/Shell health was 200, Chat anonymous session was 401, Chat manifest/entry were 200, and public shell/login/Chat health/manifest smoke checks passed. See `implementation/r1.19-dev-release-20261115.md`.
- Event ordering/correlation is job-scoped because the existing canonical `worker_job_events` ledger provides `eventSequence` under the job-row lock. Replay is retained only as long as the existing worker job/event ledger rows; cascading job retention/deletion therefore also removes this replay history. R1.19 does not create an independent event-retention store.
- Target schema readback found `worker_jobs`, `worker_job_events`, and `list_modular_chat_job_events` on `smartspec`; function ACL denies public and production auth roles and grants the development auth role. That runtime role cannot read `drizzle.__drizzle_migrations`, so applied-ledger reconciliation remains open. Do not claim a migration receipt from object presence alone. Authenticated UAT remains BLOCKED until an approved signed-in browser session verifies the exact deployed SHA.
- R1.19-3 remains MISSING: Core correctly reports `artifacts=false` and Chat artifact routes remain unsupported. The existing `worker_artifacts` ledger alone is not sufficient evidence of a Chat artifact producer, tenant/workspace/thread association, private retrieval route or rendering safety contract.
- R1.19-4 is PARTIAL: the Inspector reports actual workspace/thread/model and job/attempt/event status during a live page session; after same-browser refresh, a known job is restored through the authorized status/event path without re-enqueueing. Discovery without its session-scoped hint, complete run/agent/harness/executor/usage/artifact projection and related navigation remain open.
- R1.19-5 remains BLOCKED/PARTIAL pending verified Modular Core APIs and cross-surface adapters owned by SPEC-294 Task Control and Mission Control. No duplicate task/run/mission state is introduced.
- R1.19-6 remains PARTIAL: exact-target release and public smoke passed, but authenticated desktop/tablet/mobile rendered UAT is not available. Automated UI tests do not establish rendered runtime acceptance.
- See [`implementation/IMPLEMENTATION_TRACEABILITY.md`](implementation/IMPLEMENTATION_TRACEABILITY.md), [`implementation/ARCHITECTURE_AUDIT.md`](implementation/ARCHITECTURE_AUDIT.md), and [`implementation/HANDOFF.md`](implementation/HANDOFF.md) for requirement-level status and the precise continuation procedure. R1.18 remains NOT ACCEPTED; this evidence does not close SPEC-312.
