# CURRENT CUMULATIVE REVISION — R1.4
## Agent → Orchestrator MCP Control Protocol — Tasks Extension, Live Authority, Delegation Delivery & Cross-Tenant Hardening

**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready / 14-Pass Hardened  
**Spec ID:** 279  
**Revision:** 1.4 — MCP Tasks Extension mapping, live-source mutation authority, idempotency fingerprinting, two-phase context disclosure, durable delegation-result delivery, input/approval correlation, eventual cancellation semantics, result-egress filtering, admission backpressure and capability-freshness hardening  
**Target repository path:** `specs/feature/279-universal-command-ingress-agent-delegation-gateway/spec.md`  
**Revision precedence:** This R1.4 amendment is normative where it is more specific than R1.3/R1.2/R1.1 predecessor text. All predecessor requirements remain in force unless explicitly superseded.  
**Implementation mode:** additive-only around implemented/frozen dependencies. No second orchestrator, scheduler, task database, permission engine, billing ledger, Memory system or placement authority may be introduced.

---

# R1.4 Executive Decision

The R1.3 architecture remains correct. R1.4 closes production gaps discovered by a fresh multi-pass audit and aligns the SmartAIHub Agent→Orchestrator profile with the current MCP Tasks Extension without making MCP Tasks the SmartAIHub source of truth.

The strengthened architecture is:

```text
Agent / Harness
    │
    │ tools/call
    ▼
Spec 199 MCP Gateway
    │
    ├─ optional io.modelcontextprotocol/tasks transport lifecycle
    │       └─ mcp_task_id / tasks/get / tasks/update / tasks/cancel
    │
    ▼
Spec 279 Orchestrator-Control Profile
    ├─ principal + live-source authority
    ├─ idempotent command admission
    ├─ canonical runtime routing
    ├─ permission/budget attenuation
    ├─ provider/account/capability resolution receipt
    ├─ minimum-context disclosure
    ├─ parent/child delivery mailbox
    └─ return/result-egress policy
    │
    ▼
Canonical SmartAIHub Task / Run / Workflow
    │
    ▼
worker_jobs / existing runtime authority
    │
    ▼
Runner / External Harness / Container / Sandbox
```

The mandatory identity distinction is:

```text
MCP Tasks taskId
    ≠ SmartAIHub canonical task_ref
    ≠ SmartAIHub run_ref
    ≠ worker_job_id
    ≠ provider-native session/task id
```

An MCP task is a **transport-facing long-running request handle**. It may mirror or observe canonical SmartAIHub work, but it SHALL NOT become canonical business/execution authority.

---

# R1.4-1. Fresh 14-Pass Gap Audit — Findings and Immediate Closures

The following gaps were found in R1.3 and are closed normatively by this revision.

| Pass | Audit lens | Gap found | R1.4 closure |
|---|---|---|---|
| 1 | MCP standards alignment | R1.3 defined SmartAIHub task tools but did not map them to the current MCP Tasks Extension | Add explicit `io.modelcontextprotocol/tasks` compatibility and identity separation |
| 2 | Post-turn authority | A provider-bound agent could retain a still-valid credential after its owning turn/run ended | Require live-source mutation lease or explicit out-of-band client authority |
| 3 | Idempotency integrity | Same idempotency key with a different payload was not explicitly rejected | Add canonical request fingerprint and `IDEMPOTENCY_CONFLICT` semantics |
| 4 | Tenant/economic context | R1.3 invocation envelope collapsed tenant context more than R1.2 allowed | Restore `source_tenant`, `execution_tenant`, and `commercial_context` separation |
| 5 | Delegation disclosure | Target selection and sensitive-context hydration could be performed as one unsafe step | Add two-phase resolve→authorize disclosure→hydrate→launch sequence |
| 6 | Parent/child completion | Child can finish after parent turn disconnects/ends, leaving ambiguous delivery/wake semantics | Add durable Delegation Result Mailbox + delivery acknowledgement/disposal |
| 7 | Input/approval correlation | `task.send_input` could be misused as free-form approval continuation | Require stable runtime-request/input-request IDs and typed response semantics |
| 8 | Cancellation semantics | A cancel acknowledgement could be interpreted as “execution stopped” | Separate cancel intent accepted from observed terminal cancellation/reconciliation |
| 9 | Context staleness | Context refs lacked explicit version/freshness behavior | Add immutable/versioned refs or hydration-time freshness policy and expiry |
| 10 | Result egress | A child result could return sensitive data through a less-trusted return route | Add Result Egress Gate before delivery/exposure |
| 11 | Loop/backpressure | Depth limits existed, but ingress capacity/rate/backpressure was underspecified | Add bounded admission, active-task quotas and retry-after behavior |
| 12 | Capability TOCTOU | Capability/provider/account state might become stale after discovery but before execution | Revalidate executable capability/auth/subscription/account at launch/admission |
| 13 | Legacy Memory coupling | `memory_handles` could be implemented against legacy persona/schema assumptions | Require opaque Memory-owner handles; prohibit permanent coupling to legacy personaId/schema |
| 14 | Internal topology leakage | `worker_job_refs` could be exposed as normal external work handles | Make physical job/session refs privileged diagnostics, not default Agent API output |

A release candidate SHALL fail if any of these closures is omitted without a documented owner, temporary mitigation and rollback-safe plan.

---

# R1.4-2. Current MCP Tasks Extension Compatibility — Mandatory

SmartAIHub SHOULD support the current MCP Tasks Extension when Spec 199 negotiates it:

```text
io.modelcontextprotocol/tasks
```

R1.4 does not redefine its wire schema. Spec 199 owns MCP negotiation and wire compatibility. Spec 279 owns the semantic mapping to canonical SmartAIHub work.

## R1.4-2.1 Semantic tools vs MCP protocol methods

These MUST remain distinct:

```text
smartaihub.task.get        = SmartAIHub semantic tool called through tools/call
smartaihub.task.cancel     = SmartAIHub semantic tool called through tools/call

MCP tasks/get              = MCP Tasks Extension transport method
MCP tasks/update           = MCP Tasks Extension transport method
MCP tasks/cancel           = MCP Tasks Extension transport method
```

Implementations SHALL NOT alias one identifier namespace into the other without an explicit binding record.

## R1.4-2.2 Task-backed tool execution

When a caller declares `io.modelcontextprotocol/tasks` for a supported `tools/call`, Spec 199 MAY return an MCP `CreateTaskResult` instead of the ordinary tool result.

The corresponding MCP task SHALL be durably resolvable before that handle is returned.

The MCP task may observe a canonical SmartAIHub command until one of these conditions:

- canonical work reaches the result boundary declared for the originating tool call;
- the MCP task expires by transport retention policy;
- the MCP task is cancelled/detached according to negotiated transport semantics;
- the MCP binding becomes unrecoverable.

Expiration/removal of the MCP task handle SHALL NOT silently cancel or delete the canonical SmartAIHub task/run/job.

## R1.4-2.3 No MCP task enumeration

SmartAIHub SHALL NOT add a `tasks/list` behavior to this profile.

MCP task IDs MUST be unguessable with sufficient entropy. Every task operation SHALL still perform authentication and authorization; possession of an ID alone SHALL NOT be treated as sufficient SmartAIHub business authorization.

## R1.4-2.4 MCP Task statuses are transport statuses

MCP task wire statuses SHALL use only statuses permitted by the negotiated Tasks Extension.

SmartAIHub richer internal states map approximately as:

```text
QUEUED / RUNNING / WAITING_FOR_CHILDREN
    → working

WAITING_FOR_APPROVAL / WAITING_FOR_USER_INPUT
    → input_required

CANONICAL_RESULT_AVAILABLE and tool-call result boundary satisfied
    → completed

canonical cancellation observed for the represented request
    → cancelled

JSON-RPC/protocol execution failure of represented request
    → failed
```

SmartAIHub MUST NOT emit proprietary internal states as if they were MCP Tasks wire statuses.

A canonical SmartAIHub task may be terminally unsuccessful while the MCP task is still `completed` at the protocol layer if the represented `tools/call` itself completed and returned a tool/business result with an error payload. MCP `failed` is reserved for the failure semantics defined by the negotiated Tasks Extension (for example JSON-RPC execution failure), not for every SmartAIHub business/runtime failure. The returned tool result SHALL therefore carry the canonical SmartAIHub state/failure explicitly.

Any MCP task `statusMessage`, error message or task notification content is potentially model/user-visible and SHALL pass the same redaction/data-egress policy as other external result surfaces. Secrets, internal topology, signed URLs and restricted diagnostics SHALL NOT be placed there by default.

## R1.4-2.5 Cancel is intent, not observed finality

MCP `tasks/cancel` acknowledgement means only that the cancellation request was accepted for processing.

It MUST NOT be rendered or interpreted as proof that:

```text
canonical task is already CANCELLED
provider process has already stopped
child tasks have already reconciled
billing settlement has already completed
workspace mutation has already ceased
```

Observed canonical state remains authoritative.

## R1.4-2.6 Input-required mapping

Where MCP Tasks `inputRequests`/`tasks/update` are available, outstanding SmartAIHub runtime requests MAY be projected into them only when the trust and response semantics are compatible.

Each projected input request SHALL have a stable, unique correlation key. Responses SHALL map to the canonical runtime-request/approval/input identity and be idempotent.

A successful MCP `tasks/update` acknowledgement means the input response was accepted for processing; it does not prove the canonical runtime has already consumed the input or left `input_required`. Follow-up observation remains eventually consistent.

An MCP task is not a higher-trust approval channel merely because it is task-backed.

## R1.4-2.7 Notifications

Where task subscriptions are negotiated, `notifications/tasks` MAY project the current MCP task state.

SmartAIHub SHALL NOT depend on notifications for correctness. Polling/recovery through durable handles MUST remain possible.

## R1.4-2.8 No dependence on transport sessions

The orchestrator-control profile SHALL NOT require a persistent MCP protocol-session identity for correctness.

Cross-call state SHALL use explicit SmartAIHub or server-minted handles and authenticated principals. An implementation MAY use connection-local optimizations, but losing the connection SHALL not erase canonical work identity.

---

# R1.4-3. MCP Control Task Binding

When MCP Tasks is used, SmartAIHub SHALL persist or be able to deterministically reconstruct a binding equivalent to:

```yaml
mcp_control_task_binding:
  binding_id: mcpbind_...
  mcp_task_id: <unguessable server-minted id>
  originating_tool: smartaihub.task.delegate
  originating_command_id: cmd_...
  canonical_task_ref: task_...
  canonical_run_ref: run_...
  canonical_result_boundary: child_result | runtime_terminal | workflow_terminal | direct_capability_result
  principal_ref: ...
  source_tenant_id: ...
  execution_tenant_id: ...
  client_binding_ref: ...
  authority_snapshot_ref: ...
  created_at: ...
  ttl_ms: ...
  transport_state: working | input_required | completed | cancelled | failed
```

Rules:

1. `mcp_task_id` SHALL NOT replace `canonical_task_ref`.
2. `ttl_ms` governs transport retention, not canonical work retention.
3. Re-authentication/authorization SHALL be evaluated on follow-up task methods as required by Spec 199/policy.
4. A binding may become unavailable while canonical work continues; Task Control and canonical task lookup remain separate recovery surfaces.
5. MCP task state MUST NOT be used as the sole source for billing, approval, execution fencing or workflow finality.

---

# R1.4-4. Live Source Authority — Close the Post-Turn Mutation Gap

A provider-bound Agent→Orchestrator credential SHALL NOT gain indefinite mutation authority merely because its bearer token has not yet expired.

Every mutating call from a thread/run-bound agent SHALL additionally prove or resolve a **live mutation source** equivalent to:

```text
source principal is still authorized
AND source run/turn/control lease is active
AND provider/session binding still owns that source execution
AND source authority epoch is current
AND requested operation is inside the source's delegated control classes
```

If the owning provider turn/run has terminalized, been superseded, fenced, archived, or lost mutation ownership, further mutations SHALL fail with a normalized failure such as:

```text
PARENT_NOT_ACTIVE
SOURCE_AUTHORITY_EXPIRED
STALE_AUTHORITY_EPOCH
```

Exceptions require an explicit separate client authority, for example an authenticated SmartAIHub application/OAuth client whose grant is not derived from the ended provider turn.

A completed agent SHALL therefore not be able to keep creating tasks or mutating other threads using a cached run-scoped credential.

---

# R1.4-5. Strong Idempotency — Key + Canonical Request Fingerprint

Every mutating control request SHALL derive a canonical request fingerprint over security-relevant normalized input, including at minimum:

```text
operation
principal / source binding
tenant namespace
target canonical scope
normalized semantic payload
requested authority/budget envelope
provider/environment pinning when material
```

Conceptually:

```text
request_fingerprint = HASH(canonicalized_security_relevant_request)
```

For a given idempotency scope:

```text
same idempotency key + same fingerprint
    → return existing receipt/result binding

same idempotency key + different fingerprint
    → IDEMPOTENCY_CONFLICT
```

An implementation SHALL NOT silently treat the latter as a retry.

Idempotency identity MUST NOT rely on raw prompt text alone.

---

# R1.4-6. Restore Three Tenant / Commerce Contexts in MCP Control

The R1.4 control envelope SHALL preserve the R1.2 separation:

```text
source_tenant_id
execution_tenant_id
commercial_context_ref
```

and, when useful, an explicit data-owner/work-context scope.

These concepts MAY be equal but SHALL NOT be collapsed.

The normalized control invocation SHOULD therefore include:

```yaml
scope:
  source_tenant_id: ...
  execution_tenant_id: ...
  organization_id: ...
  project_ref: ...
  work_context_ref: ...
  data_scope_ref: ...

commercial:
  commercial_context_ref: ...
  payer_policy_ref: ...
  budget_ref: ...
```

Rules:

- cross-tenant execution requires explicit authorization;
- cross-tenant context disclosure requires explicit disclosure/data policy;
- a branded/source tenant does not automatically become commercial beneficiary;
- changing execution tenant is a material routing decision and MUST be auditable.

---

# R1.4-7. Delegation Resolution Receipt + Two-Phase Context Disclosure

Cross-provider delegation SHALL use a two-phase process:

```text
Phase 1 — Resolve target with non-sensitive metadata
  role/result contract/capability requirements
  authority constraints
  tenant/data classification
  provider/account availability
  budget/placement constraints
        ↓
  candidate target(s)

Phase 2 — Authorize disclosure and hydrate minimum context
  verify target egress/data policy
  verify current artifact/memory/source authorization
  bind credentials separately
  materialize minimum required context
        ↓
  launch canonical child execution
```

Sensitive context SHALL NOT be hydrated before the selected target is known and approved for that data class/egress route.

Each admitted delegation SHOULD produce an immutable or append-only `DelegationResolutionReceipt` equivalent to:

```yaml
delegation_resolution:
  delegation_id: ...
  resolver_version: ...
  capability_requirements: [...]
  selected_provider: ...
  selected_provider_instance_ref: ...
  selected_provider_account_ref: ...
  selected_model_ref: ...
  selected_capability_release_refs: [...]
  selected_execution_environment_ref: ...
  fallback_policy_ref: ...
  authority_snapshot_ref: ...
  egress_decision_ref: ...
  commercial_admission_ref: ...
  reason_codes: [...]
  resolved_at: ...
```

This receipt is evidence of the admission decision, not a permanent guarantee that the target remains healthy.

---

# R1.4-8. Admission-Time Capability / Account Freshness

Discovery/catalog state is advisory until admission.

Immediately before launch or sensitive context disclosure, the owning adapter/execution fabric SHALL revalidate material facts such as:

```text
provider/harness still installed/reachable
provider instance/account binding still valid
required authentication still valid
model/capability still advertised/usable
required subscription/quota policy still permits execution
selected capability release still eligible
execution environment still eligible
commercial reservation still valid where required
```

A stale catalog entry SHALL NOT authorize execution.

If revalidation fails, fallback MAY occur only under the predeclared policy. A fallback that changes provider cost, data egress, tenant, capability trust level or user-owned subscription SHALL be treated as material and re-authorized where policy requires.

---

# R1.4-8A. Transport-Neutral Delegation Lineage and Cycle Accounting

Delegation safety counters SHALL be attached to canonical SmartAIHub lineage, not to one transport/provider session.

Every child delegation SHOULD carry or derive:

```text
delegation_root_id
parent_delegation_id
depth_from_root
canonical ancestor task/run refs
cumulative child/budget counters
cycle-detection identity
```

Switching any of the following SHALL NOT reset depth, budget, authority or cycle accounting:

```text
MCP → A2A
A2A → MCP
provider-native subagent → SmartAIHub child
Codex → Claude → Codex
local → cloud placement
thread/workflow handoff
```

Cycle detection SHOULD use canonical agent/task/work identities and declared intent/result contracts where feasible, not merely ephemeral provider session IDs. A new provider session is not a new delegation root.

---

# R1.4-9. Durable Delegation Result Mailbox

A delegated child may finish when the parent provider turn is no longer actively reading. Result return therefore SHALL NOT depend on a live parent socket/turn callback.

SmartAIHub SHALL maintain a durable delivery state equivalent to:

```text
PENDING_DELIVERY
→ DELIVERING
→ ACKNOWLEDGED
   OR DISPOSED
   OR ROUTED_TO_FALLBACK
```

A `DelegatedCompletion` record SHOULD bind:

```yaml
delegated_completion:
  delegation_id: ...
  parent_task_ref: ...
  parent_run_ref: ...
  child_task_ref: ...
  published_result_ref: ...
  delivery_id: ...
  wake_policy: wake_parent | queue_for_next_turn | task_control_only | no_auto_wake
  delivery_state: ...
  delivered_to_ref: ...
  acknowledged_at: ...
```

Requirements:

1. delivery SHALL be idempotent;
2. child completion SHALL remain recoverable after client/agent disconnect;
3. parent wake/continuation SHALL use the canonical runtime owner, not direct provider mutation from the child;
4. a child result published as the delegated-task result SHALL remain stable even if later follow-up runs occur on the child thread, unless the parent explicitly requests a new task/review round;
5. parent finality and child completion SHALL reconcile using the declared child policy rather than race on wall-clock timing;
6. disposal means “do not auto-deliver further” and SHALL NOT erase the durable child result/evidence.

---

# R1.4-10. Typed Runtime Input / Approval Correlation

`task.send_input` SHALL NOT be a generic bypass for approvals or privileged decisions.

For pending runtime requests, the response MUST identify the exact request, for example:

```yaml
runtime_input_response:
  task_ref: ...
  runtime_request_id: req_...
  request_revision: ...
  response_kind: user_input | approval_decision | elicitation_response | provider_question
  response_payload: ...
  idempotency_key: ...
```

Rules:

- approval decisions SHALL use canonical approval IDs/scope and the existing Approval authority;
- stale/superseded requests SHALL reject a late response;
- the same request response SHALL be idempotent;
- one response SHALL NOT satisfy a different request merely because the displayed text is similar;
- where MCP Tasks `inputRequests` is used, each input-request key maps to exactly one current canonical runtime request and is never reused for a different request over that MCP task lifecycle;
- hosts SHALL apply the ordinary trust model to elicitation/sampling payloads surfaced through task input requests.

---

# R1.4-11. Cancellation / Interrupt Finality Contract

SmartAIHub SHALL distinguish:

```text
CANCEL_REQUEST_ACCEPTED
CANCEL_PROPAGATING
EXECUTION_INTERRUPT_REQUESTED
EXECUTION_STOP_OBSERVED
CANONICAL_CANCELLED
CANONICAL_COMPLETED_BEFORE_CANCEL
CANCEL_REJECTED
```

The exact internal names may differ, but the semantic distinction is mandatory.

A successful control-call acknowledgement means the **intent is durably accepted**, not that physical execution is already stopped.

Before canonical cancellation becomes final, the owning runtime SHALL reconcile as applicable:

- active execution attempt;
- child/delegated work policy;
- leases/fencing;
- artifact commits/checkpoints;
- paid-capability settlement/reservation release;
- provider session state;
- return-route delivery.

If work completes successfully before the cancellation can take effect, canonical finality MAY be completion rather than cancellation and this SHALL be surfaced truthfully.

---

# R1.4-12. ContextTransferManifest Integrity, Versioning and Freshness

R1.3 reference-first transfer remains correct and is strengthened as follows.

Every material reference SHALL be either:

```text
IMMUTABLE_VERSIONED_REF
or
LIVE_REF_WITH_HYDRATION_POLICY
```

A materializable context entry SHOULD carry enough metadata to prevent accidental stale substitution:

```yaml
context_ref:
  ref: ...
  version_ref: ...
  digest: ...
  freshness_policy: immutable | latest_authorized | max_age | execution_snapshot
  classification: ...
  required: true | false
```

Rules:

1. authorization is checked when the manifest is created **and again when protected context is hydrated** if time/policy could have changed;
2. a mutable `latest` reference SHALL NOT silently replace a version that was required for reproducibility;
3. required context that expired/revoked/changed incompatibly SHALL fail or request an explicit re-plan; it SHALL NOT be silently omitted for high-impact work;
4. manifests MAY have their own expiry/refresh policy;
5. secret values remain separately bound and MUST NOT be serialized into the manifest;
6. facts/summaries remain distinguishable from original evidence;
7. context digests SHOULD be included in provenance for reproducibility where feasible.

## R1.4-12.1 Memory boundary during Memory migration

`memory_handles` are opaque references owned by the current/future canonical Memory subsystem.

Spec 279 SHALL NOT permanently bind orchestration, context transfer or delegation identity to:

```text
legacy personaId
legacy memory row/schema
legacy persona-scoped storage assumptions
```

A Memory implementation may evolve independently as long as it can resolve authorized opaque scope/entry handles through its compatibility boundary.

---

# R1.4-13. Result Egress Gate

Result transfer is a data-egress event and SHALL be policy-checked independently from execution admission.

Before a delegated result, artifact, evidence excerpt or diagnostic is returned to an external agent/session/channel, SmartAIHub SHALL evaluate:

```text
recipient principal/session authorization
return-route trust class
source/execution tenant boundary
data classification
artifact/source ACL
secret/credential redaction
provider/channel egress policy
commercial/contractual restrictions where relevant
```

The result gate MAY:

```text
ALLOW
ALLOW_REDACTED
RETURN_HANDLES_ONLY
REQUIRE_APPROVAL
ROUTE_TO_TRUSTED_FALLBACK
DENY
```

A child shall not exfiltrate data merely because its parent requested the delegation.

Raw provider logs, shell output, internal worker identifiers, secrets, signed URLs and diagnostic payloads SHALL NOT be returned by default.

---

# R1.4-14. Admission Backpressure and Agent-Loop Protection

Depth/parallelism/budget controls are necessary but not sufficient for a production Agent→Orchestrator interface.

Admission SHALL support policy-bounded limits such as:

```text
max active canonical tasks per principal/client
max active delegated children per parent
max queued child work per tenant/project
max control mutations per time window
max context hydration bytes per delegation
max result payload bytes before handle-only fallback
max provider launches per retry/fallback chain
```

When capacity is exhausted, SmartAIHub SHALL return an explicit retryable admission result such as:

```text
ADMISSION_LIMIT_REACHED
RATE_LIMITED
TENANT_CAPACITY_EXHAUSTED
```

with retry/backoff guidance when safe to expose.

An agent loop SHALL NOT cause unbounded database rows, provider sessions, paid invocations or context materializations merely because recursion depth has not yet been exceeded.

---

# R1.4-15. Placement Change Is a Material Decision When Semantics Change

R1.3 correctly leaves placement authority outside Spec 279.

R1.4 adds that moving work between environments SHALL trigger a new/updated placement decision when it materially changes any of:

```text
data residency / egress
workspace identity
available credentials/subscriptions
security isolation
GPU/compute cost
provider account
session continuity
network reachability
user/tenant payer
```

A placement preference such as `prefer_fast_start` or `prefer_user_machine` is never consent to a materially more expensive or less private fallback.

Spec 279 consumes the placement decision/reference; it does not compute resource scheduling itself.

---

# R1.4-16. External Handle Exposure and Internal Topology Minimization

Normal Agent-facing `work_ref` responses SHOULD expose only durable logical identifiers needed for control:

```yaml
work_ref:
  task_ref: ...
  run_ref: ...
  runtime_owner: ...
  state: ...
  result_ref: ...
```

The following SHALL be omitted by default unless required and authorized for diagnostics/administration:

```text
raw worker_job_ids
runner internal ids
process ids
private network routes
secret-store ids
raw provider credential/account metadata
internal database keys
```

Provider bindings SHOULD use opaque, non-secret references.

This supersedes any R1.3 example that implied `worker_job_refs` are required in the normal external response.

---

# R1.4-17. Protocol / Canonical Completion Separation

An MCP tool request and the canonical work it creates may have different completion boundaries.

Supported patterns include:

### Immediate-handle mode

```text
tools/call smartaihub.task.create
    → ordinary complete result containing canonical work_ref

canonical work continues asynchronously
```

### MCP-task-backed observation mode

```text
tools/call smartaihub.task.delegate
    → MCP CreateTaskResult
    → tasks/get / notifications/tasks
    → MCP task completes when declared canonical_result_boundary is satisfied
```

The server SHALL declare/implement the chosen result boundary deterministically for a given operation/mode.

It SHALL NOT report an MCP task `completed` merely because a `worker_job` was queued when the tool contract promised a verified child result.

Conversely, a transport task does not need to remain alive for the entire lifetime of a long-lived SmartAIHub project/workflow if the tool contract returned a canonical `work_ref` and its result boundary was already satisfied.

---

# R1.4-18. Backward Compatibility and Wire Evolution

Spec 199 owns exact wire compatibility, but Spec 279 requires the following semantic behavior:

1. A client that does not negotiate the current MCP Tasks Extension MAY still use SmartAIHub high-level tools and receive ordinary tool results containing durable SmartAIHub `work_ref` handles.
2. SmartAIHub SHALL NOT require a legacy MCP Tasks capability merely because a modern task extension is supported.
3. A compatibility adapter MAY support older MCP peers, but old transport task semantics SHALL NOT change canonical SmartAIHub task/job semantics.
4. The profile SHALL NOT invent or expose deprecated/removed task methods as canonical SmartAIHub business APIs.
5. Tool/schema evolution SHALL be additive/versioned where possible; an unknown optional response field SHALL not grant authority or change execution semantics.
6. A client/server downgrade that removes a required control capability SHALL fail explicitly or degrade to a documented safe handle/poll path rather than silently changing authority.

---

# R1.4-19. Trace and Correlation Propagation

Where Spec 199 supports standard trace-context propagation, the Gateway SHOULD propagate trace/correlation context through:

```text
MCP request
→ Spec 279 command admission
→ canonical runtime
→ worker_job
→ execution session/provider adapter
→ result delivery
```

Trace metadata is observability context, not authorization.

A trace identifier SHALL NOT be accepted as proof of task ownership, idempotency, principal identity or permission.

---

# R1.4-20. Revised Canonical Control Envelope

The R1.3 envelope is superseded by the following more complete logical shape:

```yaml
mcp_control_invocation:
  schema_version: 2
  profile: smartaihub.orchestrator-control/v1

  invocation_id: mcpctl_...
  command_id: cmd_...
  idempotency_key: ...
  request_fingerprint: ...

  caller:
    principal_ref: ...
    client_binding_ref: ...
    provider_instance_ref: ...
    provider_session_ref: ...
    source_thread_ref: ...
    source_run_ref: ...
    source_authority_epoch: ...

  scope:
    source_tenant_id: ...
    execution_tenant_id: ...
    organization_id: ...
    project_ref: ...
    work_context_ref: ...
    data_scope_ref: ...

  target:
    canonical_task_ref: ...
    canonical_run_ref: ...
    workflow_ref: ...

  operation: task.delegate

  authority:
    caller_authority_ref: ...
    delegated_authority_ref: ...
    approval_context_ref: ...
    max_delegation_depth: ...
    max_parallel_children: ...

  commercial:
    commercial_context_ref: ...
    payer_policy_ref: ...
    budget_ref: ...
    child_budget_cap: ...

  context:
    context_transfer_ref: ...
    egress_policy_ref: ...

  placement:
    constraints: []
    preferences: []
    pinned_environment_ref: null

  result:
    result_contract_ref: ...
    result_egress_policy_ref: ...
    return_route_ref: ...

  transport:
    mcp_task_binding_ref: null
    negotiated_extensions: [...]
```

This remains an ingress/control record, not a second task state machine.

---

# R1.4-21. New / Strengthened Failure Classes

Add the following normalized failures where applicable:

```text
SOURCE_AUTHORITY_EXPIRED
STALE_AUTHORITY_EPOCH
MCP_TASK_EXPIRED
MCP_TASK_BINDING_NOT_FOUND
MCP_TASK_CAPABILITY_REQUIRED
ADMISSION_LIMIT_REACHED
RATE_LIMITED
TENANT_CAPACITY_EXHAUSTED
DISCLOSURE_DENIED
CONTEXT_REF_STALE
CONTEXT_REF_REVOKED
RESULT_EGRESS_DENIED
RESULT_REDACTED
PROVIDER_ACCOUNT_UNAVAILABLE
CAPABILITY_STALE_AT_ADMISSION
PLACEMENT_REAUTH_REQUIRED
```

Retryability SHALL be explicit or derivable from structured reason codes. Security/policy denial SHALL NOT be treated as an automatic retry/fallback signal.

---

# R1.4-22. Additional Required Acceptance Tests

## MCP Tasks interop

- `R279-MCP-070`: negotiated `io.modelcontextprotocol/tasks` can return an MCP task for a supported `tools/call` while preserving a separate canonical `task_ref` binding.
- `R279-MCP-071`: client without Tasks extension receives a valid ordinary result/work handle or explicit required-capability error; server never returns an unnegotiated task result.
- `R279-MCP-072`: expiry/deletion of MCP task handle does not cancel/delete canonical SmartAIHub work.
- `R279-MCP-073`: MCP `tasks/cancel` ack does not falsely project canonical `CANCELLED` before reconciliation.
- `R279-MCP-074`: MCP task IDs are unguessable; every follow-up is authorization-checked; no cross-caller task enumeration surface exists.
- `R279-MCP-075`: `smartaihub.task.get` tool and MCP `tasks/get` cannot be confused or cross-bound to a different canonical task.
- `R279-MCP-076`: `input_required` maps only compatible canonical runtime requests; unique input keys are not reused.
- `R279-MCP-077`: reconnect can resume observation through durable explicit handles without relying on a persistent MCP transport session.
- `R279-MCP-078`: canonical business/runtime failure is not incorrectly encoded as MCP `failed` when the tool call completed with a structured error result.
- `R279-MCP-079`: `tasks/update` acknowledgement does not falsely imply the canonical runtime already consumed the input; status changes are observed separately.

## Live authority

- `R279-MCP-080`: provider-bound agent cannot mutate after its source run/turn has terminalized even if the credential has not expired.
- `R279-MCP-081`: stale authority epoch cannot create child work.
- `R279-MCP-082`: separately authorized application/OAuth client may continue only within its own explicit grant after provider turn end.

## Idempotency

- `R279-MCP-090`: same key + same canonical fingerprint returns the prior receipt/binding.
- `R279-MCP-091`: same key + different target/payload/authority fingerprint returns `IDEMPOTENCY_CONFLICT` and creates no new work.

## Tenant / commerce / disclosure

- `R279-MCP-100`: source tenant, execution tenant and commercial context remain independently auditable.
- `R279-MCP-101`: cross-tenant execution cannot imply cross-tenant data disclosure.
- `R279-MCP-102`: target is resolved before sensitive context hydration; denied egress creates no provider session containing that context.
- `R279-MCP-103`: switching to a SmartAIHub-paid/provider-paid fallback requires existing payer policy or approval when it changes charge responsibility.

## Delegation delivery

- `R279-MCP-110`: child result finishing after parent turn ends is durably queued and remains recoverable.
- `R279-MCP-111`: duplicate child-completion event does not deliver duplicate parent continuation.
- `R279-MCP-112`: later child follow-up run does not silently replace the published delegated-task result.
- `R279-MCP-113`: disposal disables auto-delivery but does not erase result/evidence.
- `R279-MCP-114`: MCP→A2A→provider-native delegation cannot reset root depth, budget, authority or cycle counters.
- `R279-MCP-115`: creating a fresh provider session for a descendant does not create a new delegation root.

## Input / approval

- `R279-MCP-120`: late answer to superseded runtime request is rejected.
- `R279-MCP-121`: approval response cannot be submitted as untyped free text to bypass Approval scope.
- `R279-MCP-122`: duplicated input response is idempotent and cannot satisfy another request.

## Context integrity / Memory boundary

- `R279-MCP-130`: immutable context version cannot silently drift to a newer source version.
- `R279-MCP-131`: revoked live reference fails hydration before protected data is disclosed.
- `R279-MCP-132`: required stale context causes fail/re-plan rather than silent omission for high-impact work.
- `R279-MCP-133`: orchestration/context transfer remains functional after Memory schema migration without permanent dependency on legacy `personaId`.

## Result egress

- `R279-MCP-140`: result containing a secret is redacted or handle-only before external delivery.
- `R279-MCP-141`: child executing in one tenant cannot return a protected artifact to a different source tenant without authorized disclosure.
- `R279-MCP-142`: raw worker/process/network identifiers are absent from ordinary Agent work responses.

## Admission / capability freshness

- `R279-MCP-150`: recursive agent loop hits bounded admission without unbounded provider launches or rows.
- `R279-MCP-151`: provider/model advertised at discovery but unavailable at launch is revalidated and does not execute from stale catalog state.
- `R279-MCP-152`: fallback after quota/auth failure obeys data/cost/account policy and is not automatic when material semantics change.

## Completion boundaries

- `R279-MCP-160`: immediate-handle tool call may complete while canonical work continues, with clear work_ref semantics.
- `R279-MCP-161`: task-backed delegation does not mark MCP task completed at queue admission when its declared result boundary is child completion.
- `R279-MCP-162`: cancellation racing with completion surfaces the actual reconciled canonical final state.

---

# R1.4-23. Fourteen-Pass Verification Result

After applying the R1.4 corrections, the spec SHALL be reviewed against these release gates:

| Pass | Release gate | Required invariant |
|---|---|---|
| 1 | Ownership | MCP profile remains interface-only; no duplicate runtime/job/Memory/placement authority |
| 2 | MCP standards | Current Tasks Extension maps cleanly without replacing canonical SmartAIHub task identity |
| 3 | Live authority | ended/superseded provider turn cannot retain mutation power |
| 4 | Idempotency | retry identity is payload-bound and tenant/principal-safe |
| 5 | Tenant/commercial | source/execution/commercial scopes remain distinct |
| 6 | Delegation | provider-neutral child work has durable parent/child/result lifecycle |
| 7 | Disclosure | sensitive context is hydrated only after target/egress authorization |
| 8 | Input/approval | runtime requests are typed, correlated, idempotent and stale-safe |
| 9 | Cancellation | accepted intent is not confused with physical/canonical finality |
| 10 | Context/Memory | transfer is version-aware, least-context, secret-safe and legacy-schema-independent |
| 11 | Result egress | result delivery cannot become a data-exfiltration bypass |
| 12 | Backpressure | agent recursion/retry cannot create unbounded work/cost/state |
| 13 | Capability/placement freshness | discovery hints are revalidated at admission; material fallback requires policy |
| 14 | Observability/privacy | traceability exists without exposing internal topology/secrets as normal Agent API |

**Verification conclusion:** R1.4 is implementation-ready when all acceptance tests in R1.3 + R1.4 are represented in the implementation test plan and the canonical owners named above remain unchanged.

---

# R1.4-24. Current MCP Compatibility References — Informative, Not Authority Owners

Implementation SHOULD validate current wire behavior against the official MCP specification/extension at implementation time because MCP evolves independently from SmartAIHub.

Current references reviewed for R1.4:

- MCP Tasks Extension draft: `https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks`
- MCP Tasks Extension overview: `https://tasks.extensions.modelcontextprotocol.io/`
- MCP base-spec changelog: `https://modelcontextprotocol.io/specification/draft/changelog`

The external specification owns its wire protocol. If MCP changes, Spec 199 adapts the wire contract while Spec 279 preserves the canonical SmartAIHub semantics and identity/authority invariants defined here.

---

# R1.4 Final Architectural Position

```text
                          AUTHORIZED AGENT
             Codex / Claude / Hermes / ACP / Native
                                 │
                      MCP tools/call + extensions
                                 ▼
                         Spec 199 Gateway
                                 │
             optional MCP Tasks transport handle
                                 │
                                 ▼
                   Spec 279 Control Semantics
            ┌────────────────────┼────────────────────┐
            │ principal + live authority             │
            │ idempotency fingerprint                │
            │ tenant/commerce separation             │
            │ runtime/provider resolution            │
            │ disclosure/egress policy               │
            │ delegation mailbox                     │
            │ typed input/approval correlation       │
            └────────────────────┬────────────────────┘
                                 ▼
                  Canonical runtime/task/run owner
             Spec 224 / Spec 269 / Workflow / Direct
                                 │
                                 ▼
                          Spec 256 / Spec 280
                                 │
                                 ▼
                         worker_jobs authority
                                 │
                                 ▼
                    Feature 197 / Spec 278 / Runner
                                 │
                                 ▼
                    Provider / Session / Environment
```

**R1.4 closes the remaining high-impact protocol, authority, recovery, context, egress and interoperability gaps without expanding Spec 279 into another execution system.**

---

# PRESERVED R1.3 BASELINE

The complete R1.3 specification follows and remains normative except where R1.4 is more specific.

---

# CURRENT CUMULATIVE REVISION — R1.3
## Agent → Orchestrator MCP Control Protocol Profile

**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Spec ID:** 279  
**Revision:** 1.3 — canonical Agent→Orchestrator MCP control profile, authority attenuation, cross-provider delegation and portable context/result transfer hardening  
**Target repository path:** `specs/feature/279-universal-command-ingress-agent-delegation-gateway/spec.md`  
**Revision precedence:** This R1.3 amendment is normative where it is more specific than R1.2/R1.1 predecessor text. All predecessor requirements remain in force unless explicitly superseded.  
**Implementation mode:** additive-only around implemented/frozen dependencies.

---

# R1.3 Executive Decision

SmartAIHub SHALL expose a canonical **Agent → Orchestrator MCP Control Protocol Profile** through the existing SmartAIHub MCP Gateway / Spec 199 boundary.

The protocol profile exists so a supported agent or harness can ask SmartAIHub to create, delegate, inspect, wait for, continue, steer, interrupt, cancel and correlate canonical work without learning provider-specific execution APIs and without becoming the owner of SmartAIHub orchestration.

The architecture is:

```text
External / Native Agent or Harness
Codex / Claude / Hermes / ACP / SmartAIHub Native / future compatible client
                            │
                            │ MCP
                            ▼
             Spec 199 — MCP transport/gateway
                            │
                            ▼
       Spec 279 — Agent→Orchestrator control profile
              normalize / authorize / attenuate
              route / correlate / preserve return path
                            │
           ┌────────────────┼─────────────────┐
           ▼                ▼                 ▼
        Spec 224         Spec 269        Workflow Runtime
     Development Run   Assistant/Work      existing owner
           │                │                 │
           └────────────────┼─────────────────┘
                            ▼
                   Spec 256 resolution
                            │
                            ▼
                 canonical worker_jobs
                            │
                            ▼
              Feature 197 / Spec 278 / Runner
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
          Codex           Claude         ACP / other
```

The central invariant is:

> **MCP is a control interface into existing SmartAIHub authority. MCP is not a new orchestration runtime, job system, scheduler, permission authority, billing authority, memory authority, execution placement authority or provider-session source of truth.**

A second invariant is equally mandatory:

> **An agent may request orchestration; it may not manufacture orchestration authority.**

---

# R1.3-1. Why This Revision Exists

Earlier Spec 279 revisions already define Universal Command Ingress, delegation, child authority attenuation, return routes, durable correlation and high-level MCP tools.

R1.3 closes the remaining ambiguity: those MCP operations SHALL be treated as one versioned **orchestrator-control profile**, not a loose collection of unrelated MCP tools.

Without this profile, individual integrations risk inventing provider-specific APIs such as:

```text
delegate_to_claude(...)
delegate_to_codex(...)
run_on_hermes(...)
resume_grok_session(...)
```

or bypassing canonical execution with direct provider control.

The canonical SmartAIHub approach is instead:

```text
request capability / role / result contract
        ↓
SmartAIHub resolves runtime owner and execution target
        ↓
canonical job/run/task authority remains SmartAIHub-owned
```

Provider pinning remains allowed when explicitly requested or required by policy, compatibility, subscription ownership or reproducibility, but provider identity SHALL NOT be the default orchestration abstraction.

---

# R1.3-2. Implemented / Existing Ownership Boundary — Mandatory

R1.3 SHALL NOT redefine implemented owners.

| Concern | Canonical owner | R1.3 role |
|---|---|---|
| MCP wire transport, peer/session protocol, auth transport, extension negotiation | Spec 199 | consume only |
| External provider/harness adapter execution | Spec 200 | consume only |
| A2A interoperability | Spec 206 | consume only |
| Browser/computer dynamic capability fallback | Spec 208 | consume only |
| Development lifecycle | Spec 224 | route into / control through adapter |
| Skill/capability semantic resolution | Spec 256 | consume only |
| Assistant/workforce runtime | Spec 269 | route into / control through adapter |
| Task Control read model / evidence UX | Spec 277 | project state only |
| Canonical durable job authority | `worker_jobs` / `worker_job_events` | source of execution truth |
| Runner execution fabric / local resource truth | Feature 197 | placement/execution substrate |
| Durable execution session/recovery/resource advertisement | Spec 278 | placement/session substrate |
| Commercial admission/paid capability settlement where applicable | Spec 280 | consume only |
| Universal ingress, delegation semantics and return routing | Spec 279 | owner |

R1.3 therefore introduces **no competing runtime**.

---

# R1.3-3. Protocol Profile Identity and Negotiation

The MCP-facing orchestration profile SHOULD advertise a stable logical profile identifier such as:

```text
smartaihub.orchestrator-control/v1
```

The exact MCP extension negotiation and peer capability advertisement mechanism is owned by Spec 199 / applicable MCP compatibility contracts.

A client MUST NOT infer support from a tool name alone. It SHOULD negotiate or discover:

```yaml
orchestrator_control_profile:
  profile: smartaihub.orchestrator-control/v1
  supported_operations:
    - orchestrator.capabilities
    - task.create
    - task.delegate
    - task.get
    - task.wait
    - task.cancel
    - task.interrupt
    - task.send_input
    - task.steer
    - thread.launch
    - thread.read
    - thread.send
    - thread.interrupt
    - workflow.launch
    - workflow.get
    - workflow.cancel
    - artifact.get
  supports_async_results: true
  supports_subscriptions: <negotiated>
  supports_portable_context_transfer: true
  supports_provider_pinning: true
  max_delegation_depth: <policy-bounded>
```

Unsupported operations SHALL fail explicitly and SHALL NOT silently downgrade into privileged UI/computer automation.

---

# R1.3-4. Canonical Tool Surface

Tool names below are semantic names. Wire aliases MAY preserve backward compatibility with existing `smartaihub.*` names.

## R1.3-4.1 Read / discovery operations

```text
orchestrator.capabilities
task.get
task.wait
thread.read
workflow.get
artifact.get
```

These operations SHALL expose only information authorized for the calling principal/session.

## R1.3-4.2 Mutating orchestration operations

```text
task.create
task.delegate
task.cancel
task.interrupt
task.send_input
task.steer
thread.launch
thread.send
thread.interrupt
workflow.launch
workflow.cancel
```

All mutating operations SHALL:

1. bind the authenticated principal;
2. bind the MCP client/session/provider instance where applicable;
3. validate target scope;
4. compute effective authority;
5. validate budget/commercial constraints;
6. use idempotent command admission;
7. call the canonical runtime owner;
8. return a canonical SmartAIHub work reference;
9. preserve an auditable return/correlation path.

## R1.3-4.3 No raw execution escape hatch

The orchestrator-control profile SHALL NOT expose unbounded equivalents of:

```text
runner.exec_arbitrary_shell
runner.claim_any_job
worker_job.force_complete
approval.force_grant
billing.force_settle
permission.override
credential.dump
```

Lower-level operational tools MAY exist for administrators through separate, stronger authorization surfaces, but SHALL NOT be part of the normal Agent→Orchestrator profile.

---

# R1.3-5. Canonical MCP Control Invocation Envelope

Each accepted orchestrator-control mutation SHALL normalize to an internal envelope equivalent to:

```yaml
mcp_control_invocation:
  schema_version: 1
  profile: smartaihub.orchestrator-control/v1

  invocation_id: mcpctl_...
  command_id: cmd_...
  idempotency_key: ...

  caller:
    principal_ref: ...
    tenant_id: ...
    organization_id: ...
    mcp_client_ref: ...
    provider_instance_ref: ...
    provider_session_ref: ...
    source_thread_ref: ...

  target:
    project_ref: ...
    work_context_ref: ...
    canonical_task_ref: ...
    canonical_run_ref: ...
    workflow_ref: ...

  requested_operation: task.delegate

  authority:
    caller_authority_ref: ...
    delegated_authority_ref: ...
    approval_context_ref: ...
    max_delegation_depth: ...

  economics:
    payer_policy_ref: ...
    budget_ref: ...
    child_budget_cap: ...

  placement:
    constraints: []
    preferences: []
    pinned_environment_ref: null

  context_transfer_ref: ...
  result_contract_ref: ...
  return_route_ref: ...
```

This envelope is an ingress/control record, not another task state machine.

---

# R1.3-6. Canonical Work References

Provider-native session/task IDs SHALL be treated as adapter references, never as SmartAIHub canonical work identity.

A control response SHOULD return a normalized handle equivalent to:

```yaml
work_ref:
  task_ref: task_...
  run_ref: run_...
  worker_job_refs: [...]
  runtime_owner: spec224 | spec269 | workflow | direct_capability
  state: queued | running | waiting | needs_input | needs_approval | completed | failed | cancelled | interrupted
  result_ref: ...
  provider_bindings:
    - adapter: codex
      external_session_ref: <opaque>
```

Clients SHALL use canonical SmartAIHub references for subsequent control calls.

---

# R1.3-7. `orchestrator.capabilities`

`orchestrator.capabilities` SHALL answer what the caller can request **now**, not merely what SmartAIHub supports in theory.

The result SHOULD include:

- available canonical operation classes;
- allowed target projects/work contexts;
- effective delegation depth;
- maximum parallel child count;
- provider/runtime options visible under current policy;
- portable-context support;
- interactive control support;
- wait/subscription support;
- provider pinning eligibility;
- execution-placement constraints visible to the caller;
- current commercial/approval restrictions where safe to expose.

Capability discovery SHALL NOT itself grant authorization.

---

# R1.3-8. `task.create`

`task.create` creates or routes a canonical SmartAIHub work request.

Illustrative input:

```yaml
task:
  goal: "Review the current implementation for auth regressions"
  intent_class: auto | development | assistant | workflow | direct_capability
  project_ref: ...
  role: reviewer
  result_contract:
    kind: review
    required_evidence: true
  execution:
    provider_preference: auto
    interaction: async
```

`task.create` SHALL route through existing runtime ownership defined by Spec 279 and MUST NOT directly invent a new `worker_job` lifecycle if a higher-level runtime owns the task semantics.

---

# R1.3-9. `task.delegate` — Orchestrator-Owned Cross-Provider Delegation

`task.delegate` is the canonical Agent→Orchestrator delegation operation.

It SHALL create a SmartAIHub-owned child/delegated work relationship rather than relying on provider-native subagent identity as canonical state.

Illustrative input:

```yaml
delegate:
  task: "Perform an independent security review"
  role: security_reviewer

  target:
    capability_requirements:
      - code.review
      - security.analysis
    provider_preference: auto
    provider_instance_ref: null
    model_ref: null

  execution:
    mode: async | wait
    timeout_ms: 120000

  context_transfer_ref: ctx_...
  result_contract_ref: result_contract_...
```

Normative rules:

1. `role` / capability requirements SHOULD be preferred over provider names.
2. Provider/model/instance pinning MAY be supplied when explicitly required.
3. Spec 256 resolves semantic capability candidates where applicable.
4. Spec 200/206/provider adapters execute through their existing boundaries.
5. The child receives equal or narrower authority than the parent.
6. The child receives equal or narrower budget/egress/data scope than the parent unless an explicit higher-authority approval grants otherwise.
7. Delegation lineage SHALL be durable and auditable.
8. Parent cancellation/finality SHALL reconcile child execution per Spec 279 delegation policy.
9. Provider-native subagents MAY be used as an optimization only when they preserve the required SmartAIHub authority, evidence and lifecycle contract.
10. Failure of one provider MAY trigger fallback only when policy, cost and authority permit it.

---

# R1.3-10. `task.get` and `task.wait`

`task.get` returns current canonical state.

`task.wait` MAY wait until:

- terminal result;
- needs approval;
- needs user input;
- material progress event;
- caller-specified timeout.

A `task.wait` timeout SHALL NOT cancel the task.

Long waits SHOULD degrade into a durable task handle plus later polling/subscription rather than holding an unbounded transport request.

A response SHOULD distinguish:

```text
WORKING
WAITING_FOR_CHILDREN
WAITING_FOR_APPROVAL
WAITING_FOR_USER_INPUT
RESULT_AVAILABLE
FAILED
CANCELLED
INTERRUPTED
```

The precise runtime-specific state remains owned by the canonical runtime and is normalized for the caller.

---

# R1.3-11. Cancel vs Interrupt vs Steer

These operations SHALL remain semantically distinct.

```text
task.cancel
  = request canonical work cancellation / terminal reconciliation

task.interrupt
  = stop or suspend currently active execution attempt when supported

task.steer
  = modify active work direction when the canonical runtime/provider safely supports it

task.send_input
  = answer a pending request or append authorized continuation input
```

Provider limitations SHALL be handled by explicit capability/fallback rules.

Examples:

```text
native steer available
    → use native steer through adapter

native steer unavailable but safe restart supported
    → canonical interrupt + continuation/restart

neither safe
    → return unsupported / requires user decision
```

A fallback MUST NOT create duplicate mutation authority.

---

# R1.3-12. Thread Control Semantics

The protocol MAY expose thread operations, but a SmartAIHub `thread` SHALL mean a canonical SmartAIHub conversation/work thread, not a provider-native conversation object.

Minimum operations:

```text
thread.launch
thread.read
thread.send
thread.interrupt
```

Provider session/thread references are bindings beneath the canonical thread.

A client MUST NOT target another thread solely by guessing an identifier; authorization and project/work-context scope SHALL be validated on every mutation.

---

# R1.3-13. Workflow Control Semantics

Workflow operations SHALL be adapters to the existing workflow runtime:

```text
workflow.launch
workflow.get
workflow.cancel
```

Spec 279 does not own workflow DAG/state semantics.

Agent-originated workflow launch SHALL still obey:

- principal authorization;
- tenant/work-context scope;
- budget;
- capability/Skill metering;
- approvals;
- idempotency;
- canonical job admission;
- evidence/audit requirements.

---

# R1.3-14. Permission Ceiling Propagation — Mandatory

This is a high-value, mandatory safety contract.

For every mutating request SmartAIHub SHALL compute:

```text
EffectiveAuthority =
    CallerPrincipalAuthority
  ∩ MCPCredentialScope
  ∩ SourceTask/RunAuthority
  ∩ TargetProject/WorkContextPolicy
  ∩ RuntimePolicy
  ∩ CurrentApprovalScope
  ∩ TenantPolicy
  ∩ Data/EgressPolicy
  ∩ Commercial/BudgetPolicy
```

For delegation:

```text
ChildEffectiveAuthority ⊆ ParentEffectiveAuthority
```

unless a separate, explicitly authorized higher-principal decision grants a broader scope through the canonical approval/authorization system.

An agent SHALL NOT escalate by:

- delegating to a different provider;
- creating a new thread;
- creating a new `worker_job`;
- switching from MCP to A2A;
- falling back to browser/computer use;
- asking a child to invoke a privileged Skill;
- using a new user-owned subscription;
- switching execution environment.

`PERMISSION_DENIED` SHALL NOT be converted into a lower-level fallback route.

---

# R1.3-15. MCP Credential / Session Scope

Normal Agent→Orchestrator MCP credentials SHOULD be bound as narrowly as practical to:

```text
principal
tenant
organization (when applicable)
client installation / MCP client
provider instance
provider session
source SmartAIHub thread/run when applicable
project/work-context scope
allowed control operation classes
absolute expiry
idle expiry / revocation policy where supported
```

A raw credential SHOULD NOT be persisted into canonical orchestration event payloads.

Revocation SHALL prevent new privileged mutations. Existing durable work is reconciled according to its canonical runtime and policy rather than being silently abandoned.

---

# R1.3-16. Portable Context Transfer — Reference-First

Cross-provider delegation needs a provider-neutral transfer contract, but SmartAIHub SHALL NOT create a second Memory system or copy full conversations by default.

The canonical object is a `ContextTransferManifest` equivalent to:

```yaml
context_transfer:
  id: ctx_...
  schema_version: 1

  goal:
    text: ...

  work_identity:
    project_ref: ...
    work_context_ref: ...
    parent_task_ref: ...
    parent_run_ref: ...

  facts:
    - fact_ref: ...
      statement: ...
      provenance_ref: ...

  artifact_refs: [...]
  source_refs: [...]
  workspace_ref: ...
  checkpoint_ref: ...

  memory_handles:
    - scope_ref: ...
      retrieval_policy_ref: ...

  prior_result_refs: [...]
  unresolved_questions: [...]

  policy:
    data_classification: ...
    allowed_egress: ...
    secret_redaction_applied: true
    minimum_required_context_only: true

  integrity:
    manifest_digest: ...
    created_at: ...
```

Rules:

1. References/handles are preferred over embedding large raw payloads.
2. Provider-native resume/session continuation MAY be used when compatible, but it is an optimization, not canonical identity.
3. Whole chat history, whole mailbox, whole MemorySpace or whole repository SHALL NOT be copied by default.
4. Context hydration SHALL re-check current authorization where needed.
5. Summaries SHALL remain distinguishable from canonical facts/source artifacts.
6. Secret material SHALL be re-bound through credential/secret infrastructure rather than copied into the manifest.
7. Large artifacts SHALL be referenced through durable artifact handles.
8. Context transfer failure SHALL be explicit; SmartAIHub SHALL NOT silently run a materially under-contextualized high-impact task.

---

# R1.3-17. Portable Result Transfer

Delegated results SHALL be transferable independently of provider session format.

A normalized result SHOULD include:

```yaml
result_transfer:
  result_ref: result_...
  task_ref: ...
  run_ref: ...
  executor_ref: ...
  provider_binding_ref: ...

  outcome: completed | failed | partial | cancelled | interrupted
  summary: ...
  artifact_refs: [...]
  evidence_refs: [...]
  checkpoint_refs: [...]
  unresolved_items: [...]
  followup_recommendations: [...]

  verification:
    status: verified | unverified | partial
    evidence_complete: true | false

  provenance_ref: ...
```

A provider's raw final text SHALL NOT by itself become canonical completion evidence when the owning runtime requires stronger verification.

---

# R1.3-18. Environment Identity vs Connection Route — Minimal Contract Only

R1.3 adopts one inexpensive but important invariant:

```text
ExecutionEnvironmentIdentity ≠ ConnectionRoute
```

A stable execution environment / Runner identity MAY be reachable through changing transport routes.

Examples of routes include:

```text
LAN
private network / VPN
relay
tunnel
SSH-forwarded control path
public authenticated endpoint
```

Spec 279 SHALL carry or correlate a stable `execution_environment_ref` when needed, but SHALL NOT implement route probing, route ranking, reconnect supervision or a second connection manager.

Those concerns remain with Runner/connection/execution fabric owners such as Feature 197 / Spec 278 and related platform infrastructure.

R1.3 therefore gains the identity invariant without taking on the operational complexity of a T3-style full multi-route subsystem.

---

# R1.3-19. Resource-Aware Dynamic Execution Placement — Hint Only in Spec 279

R1.3 SHALL NOT become a machine scheduler.

Agent-originated requests MAY include bounded placement constraints/preferences such as:

```yaml
placement:
  constraints:
    - requires_gpu
    - data_residency: local_only
    - requires_workspace_ref: ...
  preferences:
    - prefer_user_machine
    - prefer_low_cost
    - prefer_fast_start
  pinned_environment_ref: null
```

But final placement remains owned by existing scheduling/execution layers using real resource/capability state from Feature 197 / Spec 278 and canonical job policy.

An agent SHALL NOT choose a machine merely because it reported free CPU/RAM. Policy, authority, data locality, session continuity, capability compatibility, cost and current lease/fencing state remain mandatory inputs.

---

# R1.3-20. Cross-Provider Delegation Resolution

The target resolution order SHOULD be capability-first:

```text
1. Required result contract / role
2. Required capabilities
3. Authority / egress / tenancy constraints
4. Existing canonical runtime/session compatibility
5. User/tenant provider preference or pinning
6. BYO subscription/account availability
7. Budget/commercial constraints
8. Execution placement feasibility
9. Resource availability
10. fallback policy
```

A provider name SHALL NOT outrank a hard security or authority rule.

A fallback caused by `CAPABILITY_UNAVAILABLE` MAY be allowed.

A fallback caused by `PERMISSION_DENIED`, `DATA_EGRESS_DENIED`, `TENANT_DENIED` or `BUDGET_DENIED` SHALL NOT bypass the denial.

---

# R1.3-21. Idempotency and At-Least-Once Delivery

Agent/harness reconnects, MCP retries and network retries SHALL be treated as at-least-once delivery.

Each mutating operation SHALL support an idempotency identity scoped by enough context to prevent cross-user/tenant collisions.

At minimum, the server SHALL be able to distinguish:

```text
same command retry
vs
same text submitted as a new command
vs
same external message ID in a different provider/tenant namespace
```

Idempotency SHALL prevent duplicate child delegation, duplicate workflow launch and duplicate paid capability admission.

---

# R1.3-22. Concurrency and Stale Control

Multiple surfaces may control one canonical task:

```text
SmartAIHub Chat
Codex
Claude
mobile Task Control
API client
```

Viewing MAY be concurrent.

Mutating control SHALL obey canonical revision/authority checks.

A stale client SHALL NOT overwrite:

- a newer approval decision;
- a newer cancellation;
- a newer user response;
- a newer runtime owner/handoff;
- a newer authority/placement epoch.

Where applicable, mutation APIs SHOULD carry an expected revision, command precondition or equivalent optimistic-concurrency guard.

---

# R1.3-23. Return Route and Async Completion

Every asynchronous MCP-initiated command SHALL remain observable after the initiating MCP request/session disappears.

The canonical task continues according to runtime policy.

The return route SHOULD use:

```text
1. initiating authorized MCP session when still valid
2. source SmartAIHub thread/work context
3. Task Control / notification projection
4. durable result/artifact reference
```

Loss of the MCP transport SHALL NOT by itself mark canonical work failed.

---

# R1.3-24. Task Control Projection

Spec 277 MAY project:

- caller/initiator;
- MCP control profile/version;
- canonical runtime owner;
- delegation parent/children;
- provider target(s);
- authority snapshot/provenance;
- portable context/result refs;
- waiting/approval/input state;
- placement/environment summary;
- execution continuity/recovery state;
- final evidence.

Spec 277 SHALL remain a projection/read-model UX layer and MUST NOT become the control-plane source of truth.

---

# R1.3-25. Observability and Audit

Each material control operation SHOULD be traceable through:

```text
MCP invocation
→ authenticated principal/session
→ normalized command
→ runtime route decision
→ effective authority decision
→ delegation/context transfer if any
→ canonical task/run
→ worker_job(s)
→ execution placement/session
→ provider adapter/session binding
→ result/evidence
→ return-route delivery
```

Audit records SHOULD capture reason codes rather than exposing secrets.

Metrics SHOULD include:

- MCP orchestrator-control calls by operation;
- authorization denials;
- idempotent replay hits;
- delegation depth/parallelism;
- provider resolution/fallback rates;
- context-transfer size and hydration failures;
- wait timeout rate;
- cancel/interrupt/steer outcomes;
- result return-route failures;
- cross-provider delegation success rate.

---

# R1.3-26. Failure Classes

Minimum normalized failures SHOULD include:

```text
CONTROL_PROFILE_UNSUPPORTED
OPERATION_UNSUPPORTED
AUTHENTICATION_REQUIRED
AUTHORIZATION_DENIED
TARGET_NOT_FOUND
TARGET_OUT_OF_SCOPE
STALE_CONTROL_REVISION
PARENT_NOT_ACTIVE
DELEGATION_DEPTH_EXCEEDED
DELEGATION_PARALLELISM_EXCEEDED
BUDGET_DENIED
APPROVAL_REQUIRED
DATA_EGRESS_DENIED
CAPABILITY_UNAVAILABLE
PROVIDER_UNAVAILABLE
PROVIDER_AUTH_FAILURE
PROVIDER_QUOTA_FAILURE
CONTEXT_TRANSFER_FAILED
CONTEXT_INSUFFICIENT
PLACEMENT_UNAVAILABLE
RUN_ALREADY_TERMINAL
WAIT_TIMEOUT
RETURN_ROUTE_UNAVAILABLE
IDEMPOTENCY_CONFLICT
```

Failure classes SHALL remain distinguishable enough for clients to decide whether retry, fallback, approval, user input or terminal failure is appropriate.

---

# R1.3-27. Implementation Slices

## Phase A — Profile + read surface

Implement/normalize:

```text
orchestrator.capabilities
task.get
task.wait
artifact.get
```

Deliverables:

- profile negotiation/advertisement through Spec 199;
- canonical work references;
- scoped MCP credentials;
- read authorization;
- audit/metrics.

## Phase B — Canonical task control

Implement/normalize:

```text
task.create
task.cancel
task.interrupt
task.send_input
```

Deliverables:

- idempotent command admission;
- runtime-owner adapters;
- stale-control guards;
- Task Control projection.

## Phase C — Cross-provider delegation

Implement/normalize:

```text
task.delegate
portable ContextTransferManifest
portable ResultTransfer
```

Deliverables:

- authority/budget attenuation;
- role/capability-first target resolution;
- provider pinning option;
- parent/child saga linkage;
- cancellation/orphan reconciliation.

## Phase D — Thread/workflow control

Implement only where canonical owners expose safe adapter contracts:

```text
thread.launch/read/send/interrupt
workflow.launch/get/cancel
```

## Phase E — Advanced steering/subscriptions

Add only after provider/runtime capability truth is available:

```text
task.steer
progress/event subscriptions
provider-native optimization paths
```

No phase requires a new job table or scheduler.

---

# R1.3-28. ROI / Scope Decision for the Five T3-Derived Concepts

The following decision is normative for this revision.

| Concept | Value to SmartAIHub | Cost / risk | R1.3 decision |
|---|---:|---:|---|
| Permission Ceiling Propagation | **Very High** | Low–Medium | **Implement now; mandatory** |
| Orchestrator-owned Cross-provider Delegation | **Very High** | Medium | **Implement now; core profile behavior** |
| Portable Context Transfer | **High** | Medium if reference-first; High if attempting full conversation portability | **Implement minimal reference-first contract now; expand incrementally** |
| Environment Identity & Multi-route Connection | Identity separation = High; full multi-route = Medium | Full multi-route operational complexity is High | **Adopt identity≠route invariant now; defer full route manager to Runner/connection owners** |
| Resource-aware Dynamic Execution Placement | Medium now / High at multi-machine scale | Medium–High; scheduling errors can be costly | **Do not implement in 279; accept hints only and delegate final placement to existing execution fabric** |

### R1.3-28.1 Why Permission Ceiling is immediately worth it

It prevents the highest-impact class of orchestration bug: an agent escaping its authority by creating a child, switching provider/protocol, changing environment or invoking a stronger capability.

The underlying policy/approval infrastructure already exists, so the incremental cost is primarily contract enforcement and tests.

### R1.3-28.2 Why Orchestrator-owned delegation is immediately worth it

It allows Codex/Claude/Hermes/ACP/SmartAIHub-native agents to collaborate through one durable SmartAIHub lifecycle rather than one-off provider APIs.

This directly increases the value of the existing Spec 200/206/224/256/269/worker_jobs infrastructure and reinforces BYO-subscription positioning.

### R1.3-28.3 Why Portable Context should be deliberately small

A full universal conversation/session format would be expensive, brittle and duplicate Memory/provider state.

A reference-first manifest gives most of the value:

- provider switching;
- independent reviewers;
- child tasks;
- recovery;
- auditable provenance;

without copying entire histories.

### R1.3-28.4 Why full Multi-route is deferred

Stable environment identity is foundational and cheap.

Automatic LAN/VPN/relay/SSH route discovery, probing, ranking, credential binding and failover is useful mainly when SmartAIHub actively manages many reachable user machines from multiple clients. It is not required to ship Agent→Orchestrator MCP control.

### R1.3-28.5 Why resource-aware placement is not owned here

Feature 197 and Spec 278 already own Runner resource truth/capability advertisement/session placement context. Putting scheduling into Spec 279 would create split-brain placement authority.

R1.3 only preserves intent/constraints and consumes the selected environment result.

---

# R1.3-29. Required Acceptance Tests

## Protocol/profile

- `R279-MCP-001`: client discovers/negotiates orchestrator-control profile without assuming support from tool names.
- `R279-MCP-002`: unsupported operation returns explicit failure, not silent computer-use fallback.
- `R279-MCP-003`: MCP reconnect/retry with same idempotency key does not duplicate work.

## Authority

- `R279-MCP-010`: approval-required parent cannot create full-access child.
- `R279-MCP-011`: switching MCP→A2A does not widen authority.
- `R279-MCP-012`: switching provider does not widen authority.
- `R279-MCP-013`: switching execution environment does not widen authority.
- `R279-MCP-014`: child paid capability cannot escape inherited/root budget.
- `R279-MCP-015`: `PERMISSION_DENIED` cannot trigger browser/computer fallback.

## Delegation

- `R279-MCP-020`: Codex-originated delegation can resolve to Claude through SmartAIHub-owned child work identity.
- `R279-MCP-021`: Claude-originated delegation can resolve to Codex without provider-specific canonical task schema.
- `R279-MCP-022`: provider pin is honored when authorized and available.
- `R279-MCP-023`: unavailable provider may fall back only under declared fallback policy.
- `R279-MCP-024`: parent cancellation reconciles mutation-capable children.
- `R279-MCP-025`: recursive delegation depth/parallelism/budget limits are enforced.

## Context/result transfer

- `R279-MCP-030`: context transfer sends references/required facts without entire unrelated chat history.
- `R279-MCP-031`: revoked artifact/memory access is rechecked on hydration.
- `R279-MCP-032`: secrets are not copied into ContextTransferManifest.
- `R279-MCP-033`: provider-native resume can fail and portable transfer still produces explicit, bounded fallback behavior.
- `R279-MCP-034`: final provider text does not bypass required verification/evidence gate.

## Control semantics

- `R279-MCP-040`: wait timeout does not cancel work.
- `R279-MCP-041`: cancel, interrupt and steer remain distinct operations.
- `R279-MCP-042`: stale client cannot overwrite newer approval/input/cancel state.
- `R279-MCP-043`: closed MCP connection does not incorrectly fail durable canonical work.

## Environment/placement boundaries

- `R279-MCP-050`: changing connection route does not create a second execution environment identity.
- `R279-MCP-051`: placement hint does not override data residency or permission policy.
- `R279-MCP-052`: Spec 279 cannot directly self-assign a Runner merely from advertised CPU/RAM.

## Ownership / no duplication

- `R279-MCP-060`: no new canonical task/job table is introduced by the control profile.
- `R279-MCP-061`: development task routes into Spec 224 rather than a new development runtime.
- `R279-MCP-062`: assistant work routes into Spec 269 rather than a new bot runtime.
- `R279-MCP-063`: workflow calls route into existing workflow runtime.
- `R279-MCP-064`: Task Control remains projection/read model and not execution authority.

---

# R1.3-30. Ten-Pass Gap Audit

| Pass | Lens | R1.3 closure |
|---|---|---|
| 1 | Duplicate runtime risk | MCP profile is interface-only; canonical runtimes unchanged |
| 2 | Protocol ownership | Spec 199 retains MCP wire/session/negotiation ownership |
| 3 | Authorization escalation | explicit intersection-based EffectiveAuthority + child≤parent invariant |
| 4 | Cross-provider portability | orchestrator-owned task identity + provider bindings beneath it |
| 5 | Context portability | reference-first ContextTransferManifest; no duplicate Memory system |
| 6 | Delivery/retry | at-least-once + idempotent mutation admission |
| 7 | Control semantics | create/wait/cancel/interrupt/input/steer distinguished |
| 8 | Placement split-brain | 279 accepts hints only; 197/278/existing scheduler own placement/resource truth |
| 9 | Async UX/recovery | durable canonical task survives MCP disconnect; return-route fallback preserved |
| 10 | Evidence/provenance | normalized result transfer and end-to-end command→job→execution→evidence trace |

A release candidate FAILS if any pass introduces a second source of truth or an authority path that bypasses existing policy/approval/worker-job ownership.

---

# R1.3-31. Final Architecture Position

```text
                    ANY AUTHORIZED AGENT
          Codex / Claude / Hermes / ACP / Native
                             │
                             │ MCP
                             ▼
                     Spec 199 Gateway
                             │
                             ▼
             Spec 279 Orchestrator-Control Profile
             ├─ normalize
             ├─ bind principal/session
             ├─ compute effective authority
             ├─ route canonical runtime
             ├─ delegate / correlate
             ├─ portable context/result handles
             └─ preserve return path
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
       Spec 224           Spec 269       Workflow / Direct
          │                                      │
          └──────────────────┬───────────────────┘
                             ▼
                         Spec 256
                             │
                      worker_jobs truth
                             │
                    Feature 197 / Spec 278
                             │
                  execution target/provider
```

**R1.3 makes MCP a first-class Agent→SmartAIHub Orchestrator control interface while preserving one canonical authority model.**

---

# PRESERVED R1.2 BASELINE

The following R1.2 content remains normative except where R1.3 above is more specific.

---
# CURRENT CUMULATIVE REVISION — R1.2
## Organizational, Human-Role & Federated Routing Alignment

**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Revision precedence:** This section and the amendment sections appended at the end are normative where they are more specific than predecessor text. The predecessor content is retained verbatim for compatibility and historical context.  
**Implementation mode:** additive-only around implemented dependencies.


## Implemented dependency boundary — mandatory

The following owners are already implemented and are **READ-ONLY** for this program:

- **Spec 206** — A2A-first Hybrid External Agent Interoperability
- **Spec 208** — Hybrid Computer Use / Dynamic Capability Routing
- **Spec 224** — Development Orchestrator Runtime
- **Spec 256** — Skill-First Capability Discovery / Intent Execution

A requirement that touches one of these owners MUST be implemented through an additive adapter, projection, compatibility contract, read model, or consumer-side metadata contract. It MUST NOT redefine the implemented owner's semantics or create a competing authority.


## Cross-spec ownership for this revision


- Spec 279 remains ingress/normalization/delegation/return-route gateway.
- Spec 282 owns business WorkHandoff/organizational/federated work semantics.
- Spec 239/283 own external-agent binding/capability intelligence.
- Spec 256 remains implemented/read-only semantic capability resolver.
- worker_jobs remains canonical durable execution state.



## Cross-program invariants

```text
PROJECT ≠ CHAT SESSION
CHAT HISTORY ≠ MEMORY
CHAT TRANSCRIPT ≠ TASK SOURCE OF TRUTH

MCP ≠ CAPABILITY
A2A ≠ BUSINESS AUTHORIZATION
EXTERNAL AGENT ≠ HUMAN PRINCIPAL
EXTERNAL AGENT MEMORY ≠ SMARTAIHUB MEMORY
EXTERNAL AGENT SUMMARY ≠ CANONICAL FACT

VECTOR MATCH ≠ ANSWER
VECTOR INDEX ≠ SOURCE OF TRUTH
RAG CHUNK ≠ CURRENT OPERATIONAL STATE
SEMANTIC SIMILARITY ≠ TRUTH

CLAIM ≠ FACT
FACT ≠ CURRENT OPERATIONAL STATE
LATEST ≠ MOST SEMANTICALLY SIMILAR

ATTACHMENT ≠ CHANNEL-OWNED OBJECT
FILENAME ≠ DOCUMENT IDENTITY
SUMMARY ≠ ORIGINAL DOCUMENT
OCR TEXT ≠ ORIGINAL DOCUMENT
EMBEDDING ≠ DOCUMENT BACKUP

EPHEMERAL SOURCE ≠ DURABLE STORAGE
PRESERVE FIRST, INDEX SECOND

MESSAGE ≠ HANDOFF
ASSISTANT CHATTER ≠ WORK PROGRESS
APPROVAL CANDIDATE ≠ FORMAL APPROVAL

RELEVANCE ≠ AUTHORIZATION
CAPABILITY_UNAVAILABLE MAY FALL BACK
PERMISSION_DENIED MUST NOT BE BYPASSED BY LOWER-LEVEL UI AUTOMATION

CROSS-TENANT EXCHANGE ≠ CROSS-TENANT MEMORY ACCESS

EVERY MATERIAL RESPONSIBILITY TRANSFER MUST LEAVE A DURABLE RECEIPT
EVERY MATERIAL ANSWER MUST BE TRACEABLE TO SUPPORTING EVIDENCE
```


---

# PRESERVED PREDECESSOR CONTENT

# Spec 279 — SmartAIHub Universal Command Ingress & Agent Delegation Gateway
## Harness/Bot/Chat/Messaging-to-Canonical-Runtime Routing Without Duplicating Orchestration Authority

**Status:** Proposed / Additive implementation-ready specification  
**Spec ID:** 279  
**Revision:** 1.1 — second cross-spec production audit; route determinism, delegation saga, tenant boundaries, context minimization, provider-fallback consent and paid-child budget propagation added  
**Date:** 2026-10-04  
**Target repository path:** `specs/feature/279-universal-command-ingress-agent-delegation-gateway/spec.md`  
**Primary owner:** SmartAIHub Command Ingress / Interop Gateway  
**Canonical development runtime:** Spec 224  
**Canonical assistant runtime:** Spec 269  
**Canonical capability / Skill semantic authority:** implemented Spec 256 + existing Capability Registry  
**Canonical durable job authority:** existing `worker_jobs` / `worker_job_events`  
**Canonical portable app/product contract:** Spec 261 SPAAS  
**Execution continuity:** Spec 278  
**Commercial Skill/Mini App invocation runtime:** Spec 280  
**MCP gateway:** existing Spec 199 / current MCP infrastructure  
**External harness adapters:** Spec 200 / related adapters  
**Implementation rule:** ADDITIVE ONLY. This Spec MUST NOT redefine or require invasive rewrites of already-implemented Spec 224 or Spec 256.

---

# 0. Executive Decision

SmartAIHub SHALL provide one **Universal Command Ingress & Delegation Gateway** through which a user may initiate or continue SmartAIHub work from:

- SmartAIHub Chat;
- Claude Code;
- Codex;
- Hermes;
- other supported external harnesses;
- SmartAIHub Primary/Specialist Assistants;
- managed bots/agents with supported integration surfaces;
- Mini Apps;
- public/private APIs;
- MCP clients;
- A2A-capable agents;
- future messaging channels such as WhatsApp, LINE, Telegram, Slack, Teams, email, voice or SMS.

The Gateway SHALL NOT become another orchestration engine.

Its responsibility is:

```text
receive
→ authenticate / bind principal
→ normalize command
→ determine canonical runtime owner
→ attenuate authority/budget
→ create/continue canonical work
→ preserve return route
→ correlate result
```

Canonical runtime selection remains:

```text
Development goal
    → Spec 224

Persistent assistant / bot work
    → Spec 269

Workflow-owned work
    → existing Workflow runtime

Direct capability request
    → Spec 256 resolution
    → Spec 280 when the selected capability is metered

Physical execution
    → worker_jobs
    → Spec 278 / Runner
```

The fundamental product invariant is:

> **A Harness or Bot may be both a SmartAIHub client and a SmartAIHub execution target, but it MUST NOT bypass SmartAIHub's canonical runtime, job authority, policy, budget, approval, metering or audit boundaries.**

---

# 1. Product Purpose

A SmartAIHub user SHOULD be able to use the interface they prefer without losing SmartAIHub orchestration.

Examples:

```text
Claude Code:
"ให้ Codex ตรวจ implementation นี้ แล้วให้ Hermes research library ที่เหมาะ"

Codex:
"ให้ SmartAIHub รัน UAT แล้วถ้าพบปัญหาให้ delegate กลับมาที่ Codex แก้"

Hermes:
"ให้ SmartAIHub ใช้ Skill ตรวจ deployment readiness"

SmartAIHub Chat:
"สร้าง Mini App แล้ว publish"

Future WhatsApp:
"ตรวจ build ล่าสุดของ Project A และแจ้งเมื่อเสร็จ"
```

All of these SHALL converge on the same canonical control plane.

The Gateway exists so SmartAIHub does not require the user to learn and manually coordinate every external harness, MCP server, agent session, Skill and Runner.

---

# 2. Business/Product Positioning

SmartAIHub SHALL support **Bring Your Own AI / Bring Your Own Subscription**.

Users MAY use:

- their own Claude subscription;
- their own Codex/OpenAI subscription;
- Hermes or provider API credentials;
- compatible local models;
- provider accounts owned by a tenant;
- SmartAIHub-provided model access where offered.

Spec 279 MUST NOT force model traffic through SmartAIHub merely to create margin.

Instead, it preserves the SmartAIHub value layer:

```text
User-owned AI
    +
SmartAIHub orchestration
    +
SmartAIHub premium Skills
    +
durable execution
    +
verification
    +
deployment
    +
distribution
    +
creator/tenant economy
```

This allows a low-friction economic relationship:

```text
LLM cost      → paid by user to provider where desired
SmartAIHub    → paid for capabilities, orchestration-linked services,
                hosted execution and monetized products
```

---

# 3. Explicit Non-Goals

Spec 279 SHALL NOT:

- replace Spec 224;
- replace Spec 269;
- replace Spec 256;
- create a second `worker_jobs`;
- create another approval engine;
- create another billing ledger;
- create another Skill registry;
- copy provider-specific chat/session concepts into canonical authority;
- claim integration with a managed bot if no supported integration surface exists;
- allow raw external MCP clients to directly execute privileged Runner shell commands;
- force messaging channels such as WhatsApp into the first implementation milestone.

---

# 4. Universal Command Envelope

Every ingress path SHALL normalize to a versioned `CommandEnvelope`.

Illustrative contract:

```yaml
command_envelope:
  schema_version: 1

  command_id: cmd_...
  idempotency_key: ...

  principal:
    user_id: ...
    tenant_id: ...
    organization_id: ...
    external_principal_ref: ...
    auth_strength: ...

  source:
    channel: smartaihub_chat | mcp | a2a | api | claude | codex | hermes | bot | messaging
    provider: ...
    client_instance_id: ...
    source_session_ref: ...
    source_message_ref: ...

  intent:
    requested_outcome: ...
    intent_class: development | assistant | workflow | direct_capability | unknown
    project_ref: ...
    application_ref: ...

  authority:
    permission_scope_ref: ...
    approval_context_ref: ...
    delegated_authority_depth: ...
    max_delegation_depth: ...

  economics:
    payer_policy_ref: ...
    budget_cap_credit: ...
    paid_capability_policy: allow | ask | deny | bounded
    tenant_commerce_context_ref: ...

  context:
    conversation_ref: ...
    memory_scope_refs: []
    artifact_refs: []
    workspace_ref: ...
    minimum_required_context_only: true

  return_route:
    channel: ...
    destination_ref: ...
    response_mode: synchronous | async | event | message
```

Provider-native payloads MAY be retained as non-authoritative diagnostic metadata.

---

# 5. Principal Binding & Cross-Channel Identity

A command MUST NOT gain SmartAIHub authority merely because it contains a known email/username/phone.

Each channel adapter SHALL produce a verified or explicitly limited principal state:

```text
VERIFIED_ACCOUNT
VERIFIED_LINKED_CHANNEL
TENANT_ASSERTED
LIMITED_GUEST
UNVERIFIED
```

High-risk execution SHALL require the applicable SmartAIHub authentication/approval boundary.

External channels MUST support anti-replay/idempotency protection.

Messaging channels MUST bind:

```text
external sender
→ SmartAIHub principal
→ tenant
→ permitted workspace/project
```

before privileged work begins.

---

# 6. Canonical Runtime Router

The Gateway SHALL route by **runtime ownership**, not by UI origin.

Example:

```text
Command arrives from Codex UI
"build a Mini App"
        ↓
runtime owner = Spec 224
```

The fact that Codex was the ingress UI does not make Codex the orchestration authority.

Minimum runtime-routing contract:

```text
DEVELOPMENT
ASSISTANT
WORKFLOW
DIRECT_CAPABILITY
CONTINUE_EXISTING
UNRESOLVED
```

Rules:

1. `DEVELOPMENT` routes to Spec 224.
2. `ASSISTANT` routes to Spec 269.
3. `WORKFLOW` routes to the existing workflow runtime.
4. `DIRECT_CAPABILITY` uses Spec 256 and may invoke Spec 280.
5. `CONTINUE_EXISTING` resolves the existing canonical run/job/session owner.
6. `UNRESOLVED` SHALL request one targeted clarification only when execution cannot safely proceed.

---

# 7. Harness as Client

A supported external harness MAY register SmartAIHub MCP tools such as:

```text
smartaihub.capability.search
smartaihub.skill.describe
smartaihub.skill.invoke
smartaihub.task.create
smartaihub.task.get
smartaihub.task.cancel
smartaihub.task.send_input
smartaihub.agent.delegate
smartaihub.session.continue
smartaihub.artifact.get
```

Normal harnesses SHOULD NOT receive raw privileged tools such as:

```text
runner.exec_unbounded_shell
runner.kill_arbitrary_process
billing.settle
approval.force_grant
```

High-level command tools SHALL map into canonical SmartAIHub authority.

---

# 8. Harness as Execution Target

The same harness MAY also be selected as an executor.

Example:

```text
Claude session
  ↓ delegate
SmartAIHub
  ↓ worker_job
  ↓ placement
Codex session
```

Supported target semantics SHALL distinguish:

```text
CONTINUE_SAME_SESSION
CREATE_CHILD_SESSION
CREATE_INDEPENDENT_REVIEWER
HANDOFF_PRIMARY_EXECUTION
BACKGROUND_SUBTASK
```

The Gateway SHALL preserve:

- parent command/run;
- parent job;
- delegation chain;
- target harness;
- target session;
- requested result contract;
- return route.

---

# 9. Self-Delegation

A Harness MAY delegate back to another instance/session of itself through SmartAIHub.

Example:

```text
Claude A
→ SmartAIHub
→ Claude B independent reviewer
```

Self-delegation SHALL NOT shortcut policy, budget, metering or execution authority.

---

# 10. Delegation Envelope

Every delegation SHALL use a bounded envelope:

```yaml
delegation:
  parent_job_id: ...
  parent_session_id: ...
  delegation_id: ...
  chain:
    - principal_or_agent_ref
    - ...
  depth: 2
  max_depth: 4
  max_parallel_children: 3

  authority:
    scope_ref: ...
    may_mutate: true
    may_deploy: false
    may_spend_credit: bounded

  budget:
    max_credit: 25
    max_external_model_cost_ref: ...
    deadline: ...

  context_policy:
    minimum_required: true
    allowed_artifact_refs: []
    allowed_memory_scopes: []

  result_contract:
    type: implementation | review | research | evidence | artifact
```

Child delegation authority MUST be equal to or narrower than parent authority.

---

# 11. Recursive Delegation Protection

The platform SHALL prevent uncontrolled loops such as:

```text
Claude → Codex → Claude → Hermes → Codex → ...
```

Required controls:

- `delegation_depth`;
- maximum depth;
- maximum child count;
- maximum parallel children;
- cumulative credit cap;
- deadline;
- cycle detection;
- duplicate-intent detection where feasible;
- per-target cooldown/backoff;
- explicit approval for material budget extension.

A child task SHALL NOT silently reset the parent's budget/depth limits.

---

# 12. MCP / A2A / API Transport Neutrality

Spec 279 defines **semantic ingress**, not one wire protocol.

MCP SHOULD be the preferred interoperability surface when the external harness supports it.

A2A MAY be used for agent-to-agent delegation.

REST/WebSocket/Webhook/provider APIs MAY be used by adapters.

The canonical work identity SHALL remain SmartAIHub-owned even if an external provider supplies its own task/session handle.

---

# 13. Managed Bot / Agent Adapter Classification

Each managed bot integration SHALL truthfully declare:

```text
MCP_NATIVE
A2A_NATIVE
API_NATIVE
WEBHOOK_CAPABLE
CHANNEL_BRIDGE
COMPUTER_USE_ONLY
HANDOFF_ONLY
UNSUPPORTED
```

SmartAIHub MUST NOT pretend that a hosted bot such as a future Grok/Muse/Dots/Manus-class system is directly controllable unless a supported programmatic integration exists.

---

# 14. Messaging Channels

Messaging channels are optional adapters, not orchestration owners.

Illustrative path:

```text
WhatsApp / LINE / Telegram / Slack / Teams
    ↓ verified channel adapter
Spec 279
    ↓ runtime router
Spec 224 / 269 / workflow / direct capability
    ↓
worker_jobs
    ↓
Runner / harness
    ↓
result
    ↓
original channel
```

The first release MAY omit WhatsApp without reducing the core architecture.

---

# 15. Result Routing

Every async command SHALL preserve a return route.

Possible result destinations:

- original external harness session;
- SmartAIHub Chat thread;
- Task Control;
- Mini App;
- messaging channel;
- webhook;
- artifact inbox.

A result SHALL be typed:

```text
FINAL_RESULT
PROGRESS_UPDATE
NEEDS_APPROVAL
NEEDS_USER_INPUT
FAILED_RECOVERABLE
FAILED_TERMINAL
ARTIFACT_READY
DELEGATED_CHILD_COMPLETE
```

---

# 16. Spec 224 Integration

Spec 224 remains unchanged and authoritative for DevelopmentRun semantics.

Spec 279 SHALL integrate through an adapter contract equivalent to:

```text
create_development_goal(CommandEnvelope)
continue_development_run(CommandEnvelope, development_run_id)
send_user_decision(...)
cancel(...)
```

A command arriving from Claude/Codex/Hermes that represents software-development intent SHALL enter Spec 224 rather than directly launching arbitrary harness execution.

This preserves:

```text
Plan
→ Implement
→ Test
→ Debug
→ Review
→ Verify
→ Final Verify
```

and allows Spec 224 to discover and invoke new SmartAIHub Skills through Spec 256/280.

---

# 17. Spec 269 Integration

Spec 269 remains the canonical assistant/team/workforce layer.

Spec 279 MAY route:

```text
"tell my research assistant to monitor X"
"ask my specialist bot to do Y"
```

to Spec 269.

Spec 279 MUST NOT create a second persistent bot identity.

---

# 18. Spec 256 / Spec 280 Integration

For direct capability requests:

```text
Command
→ Spec 256 semantic resolve
→ candidate capability
```

If the capability is:

```text
BUILT_IN_FREE
```

it may execute without Spec 280 metering.

If the capability is:

```text
SMARTAIHUB_METERED
MINI_APP_METERED
WORKFLOW_METERED
AGENT_SERVICE_METERED
```

execution SHALL pass through Spec 280's commercial invocation boundary.

The ingress channel MUST NOT bypass paid capability metering.

---

# 19. Spec 278 Integration

Spec 279 does not own execution sessions.

Once a canonical job is created:

```text
Spec 279
→ canonical runtime
→ worker_job
→ Spec 278 execution
```

Spec 278 may bind the session to the original source/return route for continuation but SHALL not become the command router.

---

# 20. BYO-Subscription Safety

Provider credentials MAY be user-owned.

The Gateway SHALL distinguish:

```text
USER_SUBSCRIPTION
USER_API_KEY
TENANT_SUBSCRIPTION
SMARTAIHUB_PROVIDER_ACCOUNT
LOCAL_MODEL
```

SmartAIHub SHOULD preserve the economic advantage of user-owned provider subscriptions.

SmartAIHub metering applies to SmartAIHub paid capabilities, not merely because an external harness was used.

---

# 21. Audit

Audit SHALL record:

```text
command_id
principal
tenant
source channel
canonical runtime selected
delegation parent/chain
authority attenuation
budget
target harness/agent
paid capability invocation refs
worker_job refs
result route
terminal state
```

Sensitive message contents SHOULD be minimized/redacted according to platform privacy policy.

---

# 22. Failure & Recovery

The Gateway SHALL handle:

- duplicate webhook/message delivery;
- external harness disconnect;
- provider session loss;
- delayed result;
- stale return route;
- source session closed;
- cross-device continuation;
- destination channel temporarily unavailable.

Canonical work SHALL continue according to its runtime even if the original UI disappears.

---

# 23. Feature Flags

Recommended:

```text
command_gateway.enabled
command_gateway.mcp_ingress
command_gateway.external_harness_ingress
command_gateway.agent_delegation
command_gateway.self_delegation
command_gateway.a2a
command_gateway.messaging
command_gateway.whatsapp
command_gateway.result_router
command_gateway.recursion_guards
```

---

# 24. Initial Implementation Slice

Phase 1 SHOULD support:

```text
SmartAIHub Chat
Claude Code
Codex
Hermes
MCP
```

with:

- verified SmartAIHub user identity;
- runtime routing;
- Spec 224 development ingress;
- Spec 269 assistant ingress where available;
- child task delegation;
- result return;
- cycle/budget guards.

WhatsApp SHOULD remain a later adapter.

---

# 25. Acceptance Criteria

Spec 279 is ready for production rollout only when:

1. A command from Claude can create/continue a Spec 224 DevelopmentRun without bypassing `worker_jobs`.
2. A command from Codex can delegate a child review to Claude/Hermes through SmartAIHub.
3. Self-delegation creates a distinct bounded child session/job.
4. Delegated permissions never exceed the parent envelope.
5. Recursive cycles are bounded.
6. External-harness disconnect does not destroy canonical SmartAIHub work.
7. Duplicate ingress delivery does not duplicate canonical work.
8. Paid Skill invocation cannot bypass Spec 280 by entering from an external harness.
9. BYO provider credentials remain distinguishable from SmartAIHub-paid model use.
10. Result routing can return to the original external harness or SmartAIHub Task Control.
11. Managed bot adapters report unsupported capabilities truthfully.
12. Messaging-channel adapters cannot impersonate a SmartAIHub user merely from sender text.
13. Tenant context is preserved end-to-end.
14. Cancellation from one authorized surface reconciles with the canonical job.
15. Spec 279 introduces no second job/orchestration/approval/billing authority.

---

# 26. Ten-Pass Gap Audit

| Pass | Domain | Required hardening |
|---|---|---|
| 1 | Runtime ownership | Prevent ingress Gateway from becoming another orchestrator |
| 2 | External identity | Require verified cross-channel principal binding |
| 3 | Delegation safety | Attenuate permission and budget |
| 4 | Recursive loops | Depth/child/budget/cycle controls |
| 5 | Duplicate delivery | Idempotent ingress |
| 6 | Harness as client+target | Separate source session from target execution |
| 7 | BYO provider economics | Do not force model resale |
| 8 | Paid capability bypass | Route metered capability through Spec 280 |
| 9 | Provider truthfulness | Explicit integration capability classes |
| 10 | Async UX | Preserve return routes and durable continuation |

All ten controls are incorporated into this revision.

---

# 27. Final Architectural Position

```text
ANY SURFACE
Chat / Claude / Codex / Hermes / Bot / API / Messaging
                      │
                      ▼
                 Spec 279
       Universal Command Ingress
                      │
            canonical runtime route
          ┌───────────┼────────────┐
          ▼           ▼            ▼
       Spec 224    Spec 269     Workflow/Direct
          │                         │
          └───────────┬─────────────┘
                      ▼
                  Spec 256
                      │
             if paid capability
                      ▼
                  Spec 280
                      │
                  worker_jobs
                      │
                  Spec 278
                      │
         Runner / Harness / Container
```

**Spec 279 makes every supported interface a doorway into SmartAIHub without making that interface the owner of SmartAIHub's work.**

---

# 28. Revision 1.1 Addendum — Deterministic Routing, Delegation Saga & Cross-Tenant Safety

Revision 1.1 hardens Spec 279 after a second cross-spec review with Specs 278 and 280.

## 28.1 Registered Ingress Binding

An external Harness, Bot or messaging adapter SHALL not be treated as trusted merely because it can call an endpoint.

Each persistent integration SHOULD bind:

```text
ingress_binding_id
principal_binding_ref
tenant_scope
client_type
provider
client_instance_id / installation_id
allowed_command_classes[]
allowed_project/workspace scopes[]
credential/auth assurance
registered_at
revoked_at?
```

Trust classes MAY include:

```text
PLATFORM_NATIVE
REGISTERED_USER_HARNESS
REGISTERED_TENANT_HARNESS
VERIFIED_CHANNEL_ADAPTER
LIMITED_EXTERNAL_CLIENT
UNVERIFIED
```

High-risk commands from `UNVERIFIED` sources SHALL fail closed or require re-authentication in an approved SmartAIHub surface.

## 28.2 Runtime Route Decision Record

Runtime routing SHALL be explainable and replay-safe.

Each material routing decision SHOULD create:

```yaml
runtime_route_decision:
  route_decision_id: ...
  command_id: ...
  intent_class: ...
  selected_runtime: spec224 | spec269 | workflow | direct_capability
  rule_version: ...
  policy_version: ...
  relevant_context_digest: ...
  reason_codes: [...]
  confidence_class: ...
  user_override_ref: ...
  created_at: ...
```

Rules:

- UI origin SHALL NOT be the runtime-selection rule.
- Same command/idempotency identity SHALL not create competing runtime owners.
- A user override MAY change a non-safety routing choice, but the override becomes a new versioned decision.
- If a command is already attached to an existing canonical run, `CONTINUE_EXISTING` takes precedence over reclassification.
- Route changes after protected work begins SHALL use explicit handoff/continuation semantics, not duplicate work.

## 28.3 At-Least-Once Ingress Semantics

Webhooks, MCP clients, provider reconnects and messaging channels may deliver duplicates.

Spec 279 SHALL assume:

> **at-least-once ingress delivery + idempotent command admission**

not "exactly once delivery".

An idempotency scope SHALL include enough of:

```text
authenticated principal
tenant
source channel/provider
source message/task identity
command semantic identity
```

to avoid both duplicate work and unsafe collision between unrelated users.

## 28.4 Three Tenant Contexts

The Gateway SHALL keep these concepts separate:

```text
source_tenant_id       = tenant through which the command entered
execution_tenant_id    = tenant whose runtime/data boundary executes the work
commercial_context_ref = Spec-280 economic attribution/offering context
```

They MAY be equal but are not interchangeable.

Cross-tenant execution requires explicit authorization.

A branded source tenant MUST NOT gain revenue or data access merely because the user opened the same globally hosted product through that UI.

## 28.5 Delegation Lifecycle Saga

Parent/child delegation SHALL have explicit lifecycle linkage:

```text
PROPOSED
→ ADMITTED
→ RUNNING
→ WAITING
→ SUCCEEDED / FAILED / CANCELLED / ORPHANED
```

Parent policy SHALL declare child behavior on:

```text
parent cancel
parent timeout
parent permission revoke
parent budget exhaustion
parent final success
parent terminal failure
```

Supported child-cancel policies SHOULD include:

```text
CANCEL_WITH_PARENT
ALLOW_TO_FINISH_READ_ONLY
DETACH_AS_INDEPENDENT_TASK
REQUIRE_EXPLICIT_DECISION
```

Default for mutation-capable paid child work SHOULD be `CANCEL_WITH_PARENT` unless the canonical runtime declares otherwise.

## 28.6 Child Budget / Commercial Propagation

Delegation SHALL propagate a bounded commercial envelope to Spec 280 when the child may use paid capabilities.

```text
root_budget_ref
parent_budget_ref
child_budget_cap
paid_capability_policy
payer_policy_ref
commercial_depth
```

A child SHALL NOT obtain a fresh unlimited budget simply by becoming a new `worker_job`.

Budget extension requires the existing approval/policy path.

## 28.7 Approval Propagation

Parent approval does not automatically approve every child action.

An approval SHALL be reused only when:

```text
child action
⊆ approved effect scope
AND
same/safe principal scope
AND
same/safe tenant/data scope
AND
approval remains valid
```

Otherwise a new approval decision is required.

A child SHALL never amplify approval scope.

## 28.8 Context Minimization Per Hop

The Gateway SHALL not forward an entire conversation/repository/memory graph to every delegated Harness.

Each hop SHOULD construct a `DelegationContextBundle` containing:

```text
goal
required facts
allowed artifact refs
allowed workspace scope
minimum memory excerpts/handles
redacted secrets
data classification
egress policy
return contract
```

Sensitive tenant/user data SHALL be blocked from a provider whose egress policy does not permit it.

## 28.9 Provider Authentication / Quota Failure

When a user-owned provider subscription expires, reaches quota or becomes unavailable:

```text
USER_HARNESS_AUTH_FAILURE
USER_HARNESS_QUOTA_FAILURE
USER_PROVIDER_UNAVAILABLE
```

SHALL be distinguishable from SmartAIHub platform failure.

SmartAIHub MUST NOT silently switch to a SmartAIHub-paid model/provider if that creates a new charge unless:

- user/tenant policy already authorizes the fallback and budget; or
- an approval is obtained.

Fallback preferences SHOULD be declared before execution where possible.

## 28.10 Paid Direct Capability Admission

For `DIRECT_CAPABILITY` resolved to a metered capability:

```text
279 normalize/routable command
→ 256 semantic resolution
→ 280 estimate/reservation/commercial authorization
→ canonical job admission
→ 278 execution
```

The Gateway SHALL NOT start paid physical execution before the applicable commercial reservation/authorization exists.

Free/built-in capability paths remain unaffected.

## 28.11 Return-Route Fallback

Original return surfaces may disappear.

Return routing SHALL use ordered fallback such as:

```text
1. original authorized session/channel
2. SmartAIHub conversation/task thread
3. Task Control / notification inbox
4. durable artifact/result reference
```

A failed WhatsApp/provider callback MUST NOT make the canonical work fail.

Return attempts SHALL be idempotent where the channel supports idempotency.

## 28.12 Result Authenticity

A delegated result SHALL include enough provenance to distinguish:

```text
which canonical job produced it
which target harness/agent executed it
which capability release(s) were used
whether it was verified
whether evidence is complete/truncated
```

Spec 277 SHOULD render this provenance without exposing internal secrets.

## 28.13 Human Takeover / External UI Concurrency

If the same canonical task is open in SmartAIHub, Claude and Codex simultaneously:

- viewing MAY be concurrent;
- mutations/terminal input SHALL honor existing Spec-278 input authority;
- user decisions SHALL use canonical approval/decision IDs;
- stale external tabs SHALL not overwrite newer decisions;
- `command_id`/revision checks SHALL reject stale control.

## 28.14 Orphan Detection

A child is `ORPHANED` when:

- its parent no longer exists or has terminalized under a policy requiring child reconciliation; and
- no valid independent ownership/handoff exists.

Orphaned mutation-capable child work SHALL be paused/cancelled or explicitly adopted through canonical authority.

## 28.15 Action Provenance Snapshot

A high-impact delegated action SHOULD correlate:

```text
source principal
source surface
route decision
delegation chain
permission snapshot
approval snapshot
commercial budget snapshot
target runtime/harness
worker_job
execution session
result/evidence
```

This feeds Spec 277 advanced Task Control and existing audit systems.

## 28.16 Additional Failure Scenarios

The implementation SHALL test:

1. duplicate webhook arrives at two API instances;
2. same message ID is reused by a different tenant/provider namespace;
3. parent cancels while child paid Skill is starting;
4. parent budget is exhausted while child attempts another delegation;
5. child requests broader filesystem/network authority;
6. user-owned Codex/Claude quota expires mid-run;
7. fallback SmartAIHub-paid model would create a new charge;
8. source tenant differs from execution tenant;
9. branded tenant surface differs from commercial attribution tenant;
10. original return channel is deleted/revoked;
11. two external Harness UIs submit conflicting user decisions;
12. provider adapter reconnect replays the last command;
13. sensitive context would egress to an unapproved provider;
14. parent completes while a mutation-capable child remains running;
15. managed bot integration downgrades from API-native to handoff-only.

## 28.17 Additional Acceptance Criteria

16. Runtime route decisions are versioned and explainable.
17. Duplicate ingress delivery does not duplicate work across API replicas.
18. Source/execution/commercial tenant contexts remain distinct.
19. Cross-tenant execution requires explicit authorization.
20. Parent cancellation reconciles child work according to declared policy.
21. Child paid capability spend is bounded by inherited/root budget.
22. Parent approval cannot silently amplify to a broader child effect.
23. Delegation sends minimum required context rather than full account context.
24. User-provider quota/auth failure is distinguishable from platform failure.
25. New paid fallback provider use requires prior policy or approval.
26. Paid direct capability cannot physically start before Spec-280 commercial admission.
27. Result-route failure does not incorrectly fail the canonical task.
28. Stale external control surfaces cannot overwrite newer decisions/input authority.
29. Orphaned mutation-capable child work cannot continue indefinitely without adoption.
30. Task Control/audit can reconstruct command → route → delegation → execution → result provenance.

---

# 29. Second Ten-Pass Cross-Spec Gap Audit — R1.1

| Pass | Domain | Gap found | R1.1 correction |
|---|---|---|---|
| 1 | Ingress trust | API reachability could be mistaken for trusted Harness registration | Added registered ingress binding/trust classes |
| 2 | Runtime ownership | Routing was defined but lacked versioned deterministic decision evidence | Added RuntimeRouteDecision |
| 3 | Delivery semantics | Duplicate delivery behavior was not formally at-least-once/idempotent | Added scoped idempotent admission |
| 4 | Multi-tenant | source, execution and economic tenant could be conflated | Added three tenant contexts and cross-tenant authorization |
| 5 | Delegation lifecycle | parent/child cancel/finality semantics were incomplete | Added delegation saga and child-cancel policies |
| 6 | Commercial delegation | new child job could accidentally reset paid budget | Added root/parent/child budget propagation to Spec 280 |
| 7 | Data/privacy | whole context could be forwarded to every Harness | Added minimum DelegationContextBundle + egress policy |
| 8 | BYO provider failure | provider quota/auth failures and paid fallback consent were underspecified | Added explicit failure classes/fallback authorization |
| 9 | Async UX/concurrency | vanished return route and conflicting external UIs were not closed | Added durable fallback + stale-control rejection |
| 10 | Provenance/orphans | orphan child and end-to-end command lineage lacked a strict contract | Added orphan adoption rules + provenance snapshot |

All ten corrections are additive and preserve existing Spec 224/256 authority.


---

# CURRENT REVISION AMENDMENT


## A. Expanded target kinds

Normalize destinations beyond agent/runtime targets:

```text
HUMAN_PRINCIPAL
ASSISTANT
HUMAN_ROLE
DEPARTMENT
TEAM
APPROVAL_QUEUE
WORKFLOW
TASK_AGENT
EXTERNAL_AGENT
EXTERNAL_ORGANIZATION
```

The target kind is not an authorization grant.

## B. Responsibility-based destination

Ingress MAY specify a semantic responsibility rather than a concrete person:

```yaml
target:
  kind: HUMAN_ROLE
  responsibility_key: FINANCE_APPROVER_L2
  work_context_ref: ...
```

Spec 282 resolves current responsibility bindings; canonical auth revalidates before action.

## C. Work-context correlation

Normalized ingress SHALL be able to carry:

```text
work_context_ref
project_ref
conversation_session_ref
work_item_ref
artifact_refs
source_refs
```

Unknown references remain untrusted until resolved.

## D. Human return routes

Return routes MAY include:

- SmartAIHub Chat/thread;
- Task Control inbox;
- email notification;
- external messaging channel;
- external-agent callback;
- webhook/API;
- human approval inbox.

Transport failure does not change canonical work outcome.

## E. External-channel normalization

Messages from LINE/Gmail/other channels MAY enter through 279 only after principal/source binding appropriate to the connector.

Free-form external text does not become trusted task authority solely because it was delivered through a connected channel.

## F. Federated target

For cross-tenant/external-organization work, 279 carries routing identity/correlation but Spec 282 owns the business exchange contract/disclosure state.

## G. Context minimization

Delegation SHALL include only the context needed for the target's responsibility. Whole mailbox, whole Project transcript or whole MemorySpace MUST NOT be attached by default.

## H. Acceptance tests

- `R279-WORK-01`: role target resolves to current responsible principal without hard-coded user ID.
- `R279-WORK-02`: staff reassignment changes future routing without rewriting history.
- `R279-WORK-03`: email-originated request preserves source/return route.
- `R279-WORK-04`: external-agent target cannot amplify parent authority.
- `R279-WORK-05`: cross-tenant route requires explicit exchange authorization.
- `R279-WORK-06`: return-channel failure leaves canonical job/result intact.
- `R279-WORK-07`: minimum context bundle excludes unrelated project data.
- `R279-WORK-08`: human approval target remains human authority even if an Assistant prepared the request.



## 12-pass cross-spec gap audit

| Pass | Audit lens | Required closure |
|---|---|---|
| 1 | Canonical ownership | No duplicate Project, Job, Memory, Evidence, Retrieval, Auth, Capability, A2A or Browser/Computer authority |
| 2 | Principal identity | Human, Assistant, external agent and organization remain distinct and attributable |
| 3 | Project variability | Different Projects may use different vocabulary, people, bots, sources and workflows without schema forks |
| 4 | Authorization | Relevance/discovery never grants access; current authorization is checked before hydration/action |
| 5 | Temporal correctness | Current state, historical state, promise, observation and forecast remain distinguishable |
| 6 | Evidence/provenance | Claims and answers remain traceable to source/evidence/artifact versions |
| 7 | Artifact continuity | Expiring/external documents can be preserved, versioned, deduplicated and recovered |
| 8 | Retrieval quality | Structured, semantic, temporal, graph and live-source retrieval are composed rather than replaced by vector similarity |
| 9 | External agents/protocols | MCP/A2A/provider capability discovery does not grant business authority or silently import foreign memory |
| 10 | Failure/fallback | Unsupported/incomplete capability may fall back; denial/policy rejection cannot be bypassed |
| 11 | Multi-tenant/privacy | Cross-tenant collaboration uses explicit disclosure; private deliberation/memory stays private |
| 12 | Operability | Incremental checkpoints, stale-source detection, idempotency, cost budgets, mobile UX and rollback are testable |

A release candidate FAILS if any pass is unresolved without an explicit owner, blocker and rollback-safe mitigation.

