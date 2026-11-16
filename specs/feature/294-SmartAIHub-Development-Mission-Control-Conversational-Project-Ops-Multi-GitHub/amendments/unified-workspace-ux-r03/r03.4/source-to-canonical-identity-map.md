# R03.4 source-to-canonical identity map

**Review baseline:** SmartSpecPro `85ac769a49b3f43a4165b4305ad2e47c1cf5861e`; Platform `25c362422641ba8213a9753ca3547f979f2f7c9d`.
**Scope:** read-only source inspection on 2026-11-16. No registry rows were synthesized and no runtime data was mutated.

| Identity / fact | Current source of truth | What is safely available | R03.4 rule / gap |
|---|---|---|---|
| Runner instance | `runner_nodes` | `runnerId`, legacy `tenantId`, `ownerUserId`, node kind/profile, trust/status, snapshot freshness, last-seen, revocation | Canonical Runner identity only. Do not relabel it as Harness instance. |
| Runner workspace binding | `spec224_conversation_workspaces` | Explicit `conversationId`, actor, legacy tenant, `runnerId`, opaque Runner `workspaceId`, snapshot revision | Join only by exact conversation and actor; preserve legacy tenant and opaque workspace separately from Modular environment tenant/workspace. |
| Runner capabilities | `runner_capability_snapshots` / `runner_nodes.currentSnapshotJson` | Authenticated capability snapshot, observed/expiry, declared capabilities and workspace facts | Schema has no Harness type/instance identity. Never infer one from capability names, `nodeKind`, `profile`, or installed binaries. |
| Job | `worker_jobs` | Canonical Job identity and lifecycle | Remains execution authority; Job-to-Mission relationship is not implied by a similar title, thread, tenant or timestamp. |
| Attempt | `worker_job_attempts` | Canonical attempt UUID/number, runnerId where recorded, outcome/timestamps | Join to session by exact Job and attempt number; historical nulls stay null. |
| Runner execution session | `runner_execution_sessions` | `sessionId`, canonical `workerJobId`, `workerJobAttempt`, `runnerId`, driver, session state/freshness | Reliable Job-to-Runner/Session correlation only when exact foreign/correlation fields agree. `driverId` is not automatically a Harness type. |
| Job events | `worker_job_events` | Ordered events where event sequence/attempt context was recorded | Job events are not Harness events; preserve cursor and Attempt association. |
| Chat Mission | `modular_chat_missions` | Owner, Modular environment tenant, Modular workspace, canonical conversation, lifecycle | Current `list_modular_chat_missions` associates modular Chat turn Jobs only. It does not establish a general external Runner Job relationship. |
| Existing Core Task projection | `list_modular_chat_task_control_projection` | Chat Job, latest Attempt, optional progress-derived Run ID, artifacts, event cursor | Agent/Harness/Executor/Machine are explicitly null today; never fill them with display identifiers. |
| Harness type/instance | No validated registry or authenticated snapshot fields found | Unavailable | SPEC-310's native Harness runtime contract remains gated/proposal-only; SPEC-309 has no published canonical source in the inspected repository. No genuine Harness instance can be claimed from this source. |

## Runtime observation

`smartaihub-runner.service` on the inspected DEV host returned `inactive` and `not-found` for enabled state. This observation is host-local and does not prove the state of any other Runner. No Codex, Claude or Hermes Harness instance or execution was available to bind to a Mission during this source review.

## Required producer contract before live Harness tabs

An authorized, authenticated producer must publish a stable Harness instance identity and type, Runner association, freshness/trust/capability facts, and an explicit canonical Job/Run/Attempt/Session-to-Mission/Conversation binding. Existing worker Job/Attempt and `runner_execution_sessions` remain the execution authorities. Any new table may hold only that identity/correlation crosswalk; it must not duplicate Job state, scheduling, events, or permissions. Both producer and Core must reauthorize tenant, workspace, conversation, Mission, Harness, Job, Run and Attempt on every read.

Until that producer contract exists, the LIVE view must display Harness identity and Harness-to-Mission associations as `UNAVAILABLE`/`NOT_CAPTURED`. It may show a Runner or canonical Job only in a separately labeled projection when its own exact authorized relationship is proven.
