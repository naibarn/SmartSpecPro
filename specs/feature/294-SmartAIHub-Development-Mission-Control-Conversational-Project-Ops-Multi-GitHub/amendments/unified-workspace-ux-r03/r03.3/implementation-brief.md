# SPEC-294 R03.3 — Live Read-Only Runtime Integration

Baseline Platform source: `b1f29c58aaf645fbc485209cafee07e7e6179979`.
Target: `modular-debian-dev` / `aimarkethubs.com`.

## Objective
Add a DEV-only Live mode adjacent to, and visually consistent with, the R03.2 Mission Control and Task Control prototypes. Preserve R03.2 synthetic routes unchanged. Live mode must query authenticated, workspace-scoped canonical runtime records and must never mix fixtures with live records.

## Requirements

- R033-01: Discover Harness adapters/instances only from existing registered sources. Show type, exact instance/runner identity, connection/heartbeat freshness, trust/enrollment, entitlement, capabilities, and readiness only when an authorized canonical source provides each fact. Otherwise report unavailable.
- R033-02: Project existing Mission, Task/Job, Run, Attempt, Thread/Session, Agent/Harness, Runner, event cursor, artifacts, and receipts without changing canonical IDs or conflating identities. A Job can have multiple Attempts and a Mission can span Jobs/Harnesses.
- R033-03: Provide independent Harness and execution tabs with per-tab selection, cursor, inspector state, split assignment, refresh/reconnect, and tab close that cannot cancel work. Use bounded/shared updates.
- R033-04: Task deep links carry exact canonical IDs/context, validate and reauthorize server-side on open/refresh, restore Mission context on return, and never create or dispatch a Job.
- R033-05: Display ordered captured events and available attempt/transcript/tool/terminal/diff/test/artifact/receipt evidence with FULL/PARTIAL/NOT_CAPTURED/REDACTED provenance. Never show evidence across Attempts or invent missing evidence.
- R033-06: Keep explicit DEV LIVE and DEMO routes/modes separate. No lifecycle mutation controls in LIVE mode until their canonical contracts are verified.
- R033-07: Cover workspace denial, multi-job/multi-attempt projection, tab restore/cursors, Attempt isolation, exact deep-link identity, no dispatch-on-navigation, and disconnected/unavailable Harness states. Authenticated owner UAT remains distinct from automated evidence.
- R033-08: R03.3 acceptance requires at least one genuine authorized Harness execution shown in Mission Control and opened by exact Job/Run/Attempt in Task Control. Synthetic fixtures do not satisfy this requirement.

## Evidence boundary / current known gap
The R03.2 route is fixture-only. Modular Core has authenticated tenant Mission and Task Control projections, but current Task projection explicitly reports Harness/Agent/Run/Executor/Machine unavailable. SPEC-309 is not a canonical active source; SPEC-310 is proposal-only. No live Harness catalog or verified Mission-to-Harness Job relation may be inferred. R03.3 must implement safe useful read-only projection while retaining the acceptance gap when upstream canonical evidence is absent.

## R03.3 implementation and deployment checkpoint

- Platform source integrated on `main`: `25c362422641ba8213a9753ca3547f979f2f7c9d`.
- Core endpoints used: `GET /v1/core/chat/missions` and `GET /v1/core/chat/conversations/:id/task-control`; exact navigation uses the new authenticated `GET /v1/core/chat/missions/:missionId/jobs/:jobId/execution?conversationId=...&attemptId=...` projection filter.
- Exact-navigation endpoint reloads the authenticated workspace Mission list and Task Control projection; Mission/conversation/Job/Attempt mismatch returns not-found, and workspace membership is rechecked by Core.
- Focused Core tests: 35/35; focused Shell tests: 14/14; Core and Shell package typechecks passed; Core/Shell/Chat build passed.
- DEV release `modular-debian-dev-25c362422641ba8213a9753ca3547f979f2f7c9d-mission-control-r033` deployed via the registered controller to `aimarkethubs.com`; Core/Shell/Chat local health, public shell/chat health and module manifest smoke checks passed.
- Authenticated owner UAT: PENDING. Browser sidecar was unavailable, so no owner session was used.
- Genuine Harness execution acceptance: OPEN. No Core Harness catalog exists, and the available Task Control projection does not establish a Harness/Runner/Run relationship for a real Job. The live UI explicitly shows this as unavailable and never substitutes R03.2 fixtures.
- Multi-Harness execution tabs, event replay, transcript/tool/terminal/diff/test/receipt evidence, cross-workspace live UAT, and a genuine Mission-to-Task Harness drill-through remain unverified or unsupported by current Core sources.
