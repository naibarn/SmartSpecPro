# SPEC-312 Amendment R1.20 — Canonical execution projection and gap closure

**Status:** PARTIAL · **Updated:** 2026-11-15
**Owner:** SPEC-312 Modular Core / Chat Shell; SPEC-277 owns the Task Control read-model foundation and SPEC-294 owns Mission Control projection semantics
**Targets:** `modular-debian-dev` only for development verification

## Scope

R1.20 continues R1.19 from its actual open implementation gaps. It adds a versioned read projection from a canonical Chat conversation to the existing worker job/event control plane. It does not add another job, Run, event or artifact authority.

## Canonical relationship contract

`smartaihub.chat-execution-projection.v1` contains the authorized workspace and conversation IDs and the conversation's canonical Chat jobs. Each job includes its canonical job ID, status, latest persisted attempt ID when available, and durable `worker_job_events.eventSequence` cursor. Agent, Harness, Run, Executor and Machine IDs are nullable and accompanied by an explicit unavailable list. A missing source value is not replaced with an ID created for display.

Core exposes `GET /v1/core/chat/conversations/:id/execution`. The authenticated Chat Worker proxies it at `/api/chat/v1/conversations/:id/execution`. Both paths resolve the caller's verified account and workspace. Core reads through the scoped SECURITY DEFINER resolver `list_modular_chat_conversation_execution`; the resolver checks conversation ownership and workspace membership before returning any related jobs. Empty conversations return an empty job list. An unauthorized or unknown conversation does not reveal job data.

The Inspector loads this read model when a conversation is selected and after refresh. This read does not dispatch or retry work. Persisted event ordering, SSE reconnect and polling remain governed by R1.19.

## Artifact and Task/Mission boundary

The output artifact path remains unavailable. R1.20 does not enable `artifacts` based on the existing input-attachment R2 bucket or generic `worker_artifacts` rows alone. Enablement requires a real output producer, private object registration tied to canonical job/workspace/user ownership, scoped metadata and content retrieval, safe previews/fallbacks, retention semantics, and negative authorization tests.

Task Control and Mission Control remain under SPEC-294 and their authoritative modules. No Modular endpoint/adapter is claimed by this revision. Any later navigation or projection must reuse canonical conversation/run/job identity and status and must not dispatch duplicate work.

The dependency investigation found that SPEC-294 assigns the user-facing Task Control/read-model foundation to SPEC-277 and defines Mission Control as an operations projection over existing execution authorities. SmartSpecPro contains legacy task observability/run-store implementation (`apps/web/server/services/taskObservabilityReadModel.ts`, `taskRunStore.ts`), but the deployed `smartaihub-platform` repository exposes no versioned Modular Task Control or Mission Control DTO/API and no cross-repository authorization adapter. Those legacy services are not imported or called by this Modular release. SPEC-294 is the contract/ownership authority; its implementers must publish the tenant-scoped read DTO and authorization semantics, while Modular Core owns any subsequent compatible adapter and Chat owns navigation/rendering. This is a verified integration dependency, not evidence that the underlying legacy Task Control or Mission Control systems do not exist.

## R1.20 implementation status

| Requirement | Implemented source | Verification | State |
| --- | --- | --- | --- |
| Versioned conversation/job/attempt/cursor projection with nullable upstream relationships | `smartaihub-platform@dfa5eaf`; SmartSpecPro migration `0438_modular_chat_conversation_execution_projection.sql` | Contract rejection tests; Core authorization route test; Chat proxy/API/Inspector tests; migration applied and catalog privilege evidence recorded | IMPLEMENTED · TESTED · DEPLOYED_DEV · AUTHORIZED DATA UAT PENDING |
| Thread Inspector restores canonical job/status/attempt facts on selection/refresh | Chat Inspector consumes the versioned Core projection | `@smartaihub/chat` 49/49, typecheck and build pass; deployed entry asset hash verified | IMPLEMENTED · TESTED · DEPLOYED_DEV · AUTHENTICATED UAT PENDING |
| Artifact registration, private retrieval, and inline preview | No verified output producer/read API yet | Not enabled; existing artifact route remains unavailable | MISSING |
| Agent/Harness/Run/Executor/Machine relationships | No authoritative source fields are exposed to Modular Chat | Projection explicitly returns null/unavailable | PARTIAL · UPSTREAM CONTRACT REQUIRED |
| Task Control / Mission Control integration | SPEC-277 owns the Task Control read-model foundation; SPEC-294 owns Mission Control projection semantics; no versioned Modular DTO/API or authorization adapter was found in `smartaihub-platform` | Legacy SmartSpecPro task store/read model located, but no Modular cross-surface contract test or endpoint exists | DEPENDENCY IDENTIFIED · API/DTO CONTRACT REQUIRED |
| Authenticated rendered UAT | Requires normal account/MFA browser session | Not attempted without an authorized session | UAT_PENDING |

R1.20 does not close SPEC-312 or enable artifacts. Inspector acceptance and authenticated data-path UAT remain open. Development deployment is verified only for the exact source SHA and target recorded in the R1.20 release evidence.
