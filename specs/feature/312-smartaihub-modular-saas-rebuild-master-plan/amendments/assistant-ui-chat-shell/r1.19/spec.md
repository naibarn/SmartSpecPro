# SPEC-312 Amendment R1.19 — Chat execution, event, artifact and control-plane integration

**Status:** IMPLEMENTATION IN PROGRESS · **Date:** 2026-11-15
**Parent:** SPEC-312, R1.18 assistant-ui Chat shell. R1.18 history and evidence remain immutable.
**Source baseline:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`.
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
