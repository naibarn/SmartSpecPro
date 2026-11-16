# R03.4 implementation traceability and resume handoff

Review date: 2026-11-16
Source baselines: SmartSpecPro `85ac769a49b3f43a4165b4305ad2e47c1cf5861e`; Platform `25c362422641ba8213a9753ca3547f979f2f7c9d`.

## Evidence-backed implementation state

| Requested outcome | Current evidence | Status |
|---|---|---|
| Authenticated Harness catalog | SmartSpecPro `runner_nodes` and capability snapshots are Runner sources. The snapshot contract has no validated `harnessType` or stable `harnessInstanceId`. Core has no authenticated Harness catalog endpoint. | `CATALOG_IMPLEMENTED = NO` |
| Real instance discovery | The inspected local `smartaihub-runner.service` is inactive/not enabled. No authorized online Codex, Claude, Hermes, or other Harness instance was verified from an authenticated registry. This is a local host observation only. | `INSTANCE_DISCOVERED = NO` |
| Canonical execution binding | `runner_execution_sessions` contains exact Job, Attempt number, Runner and Session relations. This does not identify a Harness and does not prove a Mission relation for an external Job. | `EXECUTION_BOUND = NO` |
| Mission projection | Core migration 0441 `list_modular_chat_missions` projects modular Chat turn Jobs using `conversationId`; it does not project arbitrary Runner Jobs or establish Harness ownership. | `MISSION_PROJECTION_VERIFIED = NO` for Harness executions |
| Exact Task Control deep link | Existing `/v1/core/chat/missions/:missionId/jobs/:jobId/execution` reauthorizes through current Mission and Task Control projections for Chat jobs. It cannot establish the requested Harness → Mission → Job/Attempt path. | `TASK_DEEP_LINK_VERIFIED = NO` for Harness execution |
| DEV deployment | No R03.4 runtime code or migration was produced because no canonical producer/read source exists. The deployed Modular DEV release was not changed. | `DEV_DEPLOYED = NO` |
| Authenticated owner UAT | No browser UAT of a real Harness vertical slice was performed. | `OWNER_UAT_PENDING` |

Detailed source mapping is in [source-to-canonical-identity-map.md](source-to-canonical-identity-map.md). The existing LIVE and DEMO routes remain separate. No synthetic identity or fixture was introduced into LIVE.

## Exact producer dependency to unblock implementation

The authorized Harness/Runner registration and execution producer must publish these facts from authenticated boundaries, not from CLI discovery:

1. Stable `harnessType` and `harnessInstanceId`, with canonical `runnerId` association, actor/tenant/workspace scope, enrollment/trust, capability provenance, and observed/expiry timestamps. Unknown entitlement or dispatch readiness remains unknown.
2. At dispatch or Runner acknowledgment, the exact canonical correlation among `missionId` (if explicitly created), `conversationId`, Modular workspace and environment tenant, legacy Runner tenant, `runnerId`, `workerJobId`, canonical `runId` only when one exists, `worker_job_attempts` attempt identity/number, and `runner_execution_sessions.sessionId`.
3. A producer-owned integrity guarantee that the correlation cannot be asserted by a Chat client and cannot be inferred from shared Runner, title, timestamps, tenant labels, or similar identifiers. Historical records without this provenance remain null.
4. An authenticated DEV producer instance with a fresh registration/heartbeat and at least one genuine execution. The existing local Runner service was observed inactive; do not retarget or reuse credentials from the legacy SmartAIHub Runner.

When those facts exist, resume in this order: additive narrow correlation source only if no current canonical relation can hold it; privilege-reviewed bounded read model; workspace-authenticated Core routes; live R03.3 UI adaptation; focused isolation and identity continuity tests; migration through the registered DEV runner; deploy using the `modular-debian-dev` controller; verify release and real Task Control deep link; then record owner UAT separately. Do not create a Job store, scheduler, event ledger, or synthetic backfill.

## Existing contracts reviewed

- SmartSpecPro: `runner_nodes`, `runner_capability_snapshots`, `spec224_conversation_workspaces`, `runner_execution_sessions`, `worker_jobs`, `worker_job_attempts`, `worker_job_events`.
- Platform: `list_modular_chat_missions`, `list_modular_chat_task_control_projection`, authenticated `/v1/core/chat/missions` reads, and Mission/Job execution route.
- SPEC-277 identity boundary: Runner, Harness, Session, Job, Attempt, and Mission remain distinct.
- SPEC-310 consumer note: R03.4 does not change the gated Native Harness runtime proposal or claim its acceptance.

## Change/deployment record

Preserved `modular-debian-dev` release: source SHA `25c362422641ba8213a9753ca3547f979f2f7c9d`, release ID `modular-debian-dev-25c362422641ba8213a9753ca3547f979f2f7c9d-built`, receipt `/home/dev/modular-development-releases/modular-debian-dev-25c362422641ba8213a9753ca3547f979f2f7c9d-mission-control-r033/release-manifest.json` (target map and immutable receipt reviewed read-only).

R03.4 runtime implementation: none. Database mutation: none. Build/tests: not run because no runtime source changed. Deployment: not run; no R03.4 runtime delta exists to deploy. Platform source `25c362422641ba8213a9753ca3547f979f2f7c9d` remains the integrated baseline. Current checkout worktrees contain unrelated user changes; preserve them during resume.
