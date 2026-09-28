---
spec_id: 243
title: SmartAIHub Managed Cloud Agent & Hosted Harness Integration
revision: 1.2
review_rounds: 26
review_method: cumulative 12+14 source-verified architecture, provider lifecycle, privacy, finance, security and release audit
last_audited: 2026-09-24
supersedes: revision 1.1
created: 2026-09-24
status: PROPOSED / IMPLEMENTATION SPECIFICATION / NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED
numbering: USER-PROPOSED 243 — verify canonical SmartSpecPro registry, default branch, active PRs/worktrees before commit
suggested_repository_path: specs/feature/243-managed-cloud-agent-hosted-harness-integration/spec.md
risk_class: HIGH — autonomous execution, third-party hosted compute, secrets, external side effects, tenant isolation, billing
primary_owner: Managed Agent Integration / External Agent Gateway
normative_language: MUST, MUST NOT, SHALL, SHOULD, MAY follow RFC 2119 intent
implementation_boundary:
  immutable_historical_specs: "1-213 inclusive — no retroactive spec edits; improvements only"
  in_progress_spec: "224 — consume via additive integration contract; do not rewrite lifecycle/final-verify semantics"
canonical_goal_agent: Feature 196
canonical_job_authority: Feature 186 / Feature 195 worker_jobs + worker_job_events + outbox + lease/fencing
canonical_external_agent_gateway: Spec 200 historical contract + additive compatibility extension only
canonical_mcp_gateway: Spec 199
canonical_a2a: Spec 206
canonical_computer_use: Specs 208/213 historical contract + additive improvement items only
canonical_workflow_runtime: Spec 215
canonical_development_runtime: Spec 224
canonical_authz_secrets: Spec 220
canonical_billing: Spec 207
canonical_llm_routing: Spec 231
canonical_cloudflare_runtime: Spec 242
canonical_memory: Spec 241 / existing Memory Service
canonical_data: PostgreSQL system-of-record; R2 artifacts; Vectorize semantic index only
---

# Spec 243 — SmartAIHub Managed Cloud Agent & Hosted Harness Integration

## 0. Executive decision

SmartAIHub SHALL add a provider-neutral **Managed Cloud Agent / Hosted Harness execution layer** that allows the existing SmartAIHub Control Plane to delegate eligible work to externally hosted, durable agent sessions while preserving SmartAIHub ownership of:

- authenticated user intent;
- tenant/project/product scope;
- authorization and approval;
- canonical logical run state;
- physical job admission and fencing;
- billing/credit reservations;
- long-term memory and retrieval policy;
- artifact/evidence registration;
- incident handling;
- final verification.

Managed cloud agents are **execution backends**, not independent SmartAIHub authorities.

The initial provider families targeted by this specification are:

1. **OpenAI Agents API** managed sessions and hosted/self-hosted environments.
2. **Claude Managed Agents** hosted long-horizon sessions.
3. **Cloudflare Think / Agents** when used as an agent harness, coordinated with Spec 242.
4. Future provider-hosted harnesses that satisfy the same conformance contract.

This specification MUST NOT create:

- a second job ledger;
- a second approval system;
- a second billing ledger;
- a second tenant/ACL authority;
- a second long-term memory database;
- a parallel development lifecycle competing with Spec 224;
- a provider-specific UI that becomes execution truth.

---

# 1. Why this spec exists

SmartAIHub already has major building blocks for autonomous and delegated execution:

- Spec 200 defines the historical External Agent Gateway and provider adapters.
- Specs 186/195 define canonical durable physical work through `worker_jobs`.
- Spec 215 defines workflow execution semantics.
- Spec 224 owns the autonomous development lifecycle and Final Verify semantics.
- Spec 231 owns LLM/model routing.
- Spec 242 integrates Cloudflare Agents/Sandbox as native execution infrastructure.
- Specs 220/207 own authorization/secrets and billing respectively.

What is missing is a **normalized managed-session contract** for cloud agents whose provider itself owns the session loop, environment lifecycle, context management, event stream and portions of recovery.

Without this layer, each provider integration risks inventing its own:

- session state;
- retry semantics;
- approval bridge;
- artifact handling;
- event vocabulary;
- cost model;
- recovery behavior;
- completion semantics.

Spec 243 standardizes those differences behind SmartAIHub's existing Control Plane.

---

# 2. Immutable implementation boundary

## 2.1 Specs 1–213 inclusive

Specs **1 through 213 inclusive are treated as immutable historical design inputs and compatibility boundaries**. A number or document does not prove that its runtime, schema, route or production contract is deployed; each dependency must be verified against current source, migrations and environment evidence before the managed-agent bridge can use it.

New managed-agent requirements MUST NOT be inserted retroactively into those specification files.

Any missing capability discovered in an earlier spec SHALL be recorded in this specification as an **Improvement Item** with:

- affected historical spec;
- missing behavior;
- compatibility requirement;
- new implementation owner;
- regression/conformance evidence.

The original historical specification remains unchanged.

## 2.2 Spec 224

Spec 224 is currently being implemented.

Spec 243 SHALL NOT rewrite:

- its development lifecycle;
- Final Verify rules;
- recovery state machine;
- workspace semantics already under implementation;
- approval semantics;
- checkpoint evidence model.

Spec 243 only provides a new execution backend through an additive adapter/integration contract.

## 2.3 Specs not yet implemented

Specs above the historical boundary may be updated in place only after repository verification confirms that implementation has not begun and no in-flight work depends on the frozen revision.

---

# 3. Current vendor capability baseline

This section records capability assumptions reviewed on 2026-09-24. These are vendor-capability references, not evidence that SmartAIHub has implemented or certified them.

## 3.1 Cloudflare Think

Cloudflare Think currently provides a stateful agent harness with:

- agentic tool loop;
- message persistence;
- streaming;
- stream resumption;
- client/server tools;
- sub-agent operation over RPC;
- Durable Object-backed state.

Spec 242 remains the canonical Cloudflare runtime/infrastructure integration. Spec 243 treats Think as one possible **managed harness profile**, not as a separate SmartAIHub control plane.

## 3.2 OpenAI Agents API

The OpenAI Agents API currently exposes:

- reusable Agent definitions;
- durable Sessions;
- asynchronous Turns;
- event streams and webhooks;
- hosted or self-hosted execution environments;
- session continuation and steering;
- hosted sandbox execution.

SmartAIHub SHALL map these concepts into the normalized Managed Agent contract rather than leaking provider-native lifecycle semantics throughout the platform.

## 3.3 Claude Managed Agents

Anthropic currently exposes Managed Agents as hosted infrastructure for long-horizon stateful agent work.

SmartAIHub SHALL treat Anthropic's session/harness lifecycle as provider-owned execution state while retaining platform authority for permission, billing, external effects and completion.

## 3.4 Future providers

A future provider may be admitted only if the adapter can truthfully declare a capability profile and pass conformance tests.

Provider marketing names SHALL NOT be interpreted as capabilities.

---

# 4. Canonical architecture

```text
User / Mobile / Tablet / Web / API / Mini App
                      |
                      v
          Feature 196 Universal Assistant
                      |
              Goal / Intent / Context
                      |
                      v
       Shared Durable Orchestration Kernel
          |           |            |
          |           |            +--> Spec 238 monitor/runtime use
          |           +----------------> Spec 215 workflow runtime
          +----------------------------> Spec 224 development runtime
                      |
                      v
            Capability / Placement Resolver
                      |
       +--------------+-----------------------------+
       |              |              |              |
       v              v              v              v
 Local Runner     CF Native      Managed Agent   Other approved
 / Browser        Spec 242       Spec 243        executor
                                  |
                    +-------------+-------------+
                    |             |             |
                    v             v             v
               OpenAI Agents   Claude MA     Future hosted
                    |
                    v
        Provider session / harness / environment
                    |
                    v
        normalized events / receipts / artifacts
                    |
                    v
        Feature 195 worker_jobs + PG authority
                    |
         +----------+-----------+-------------+
         |                      |             |
         v                      v             v
   PostgreSQL                 R2          Vectorize
 business truth          artifacts       semantic index
```

---

# 5. Authority hierarchy

The following hierarchy is normative.

| Concern | Canonical authority | Provider-managed copy allowed? |
|---|---|---|
| User identity | SmartAIHub identity/auth | Session-scoped principal reference only |
| Tenant/project ACL | Spec 220 / PostgreSQL | Time-bounded derived grant only |
| Logical run state | Shared Kernel / Spec 215 or 224 | Provider status is evidence only |
| Physical job state | Feature 195 / `worker_jobs` | Provider execution ref only |
| Approval | SmartAIHub Approval | Provider approval may be an additional gate |
| Billing/credits | Spec 207 | Provider metering observations only |
| LLM/model routing | Spec 231 | Provider-native model selection only if policy allows |
| Long-term memory | Spec 241 / canonical Memory Service | Minimum scoped projection only |
| Retrieval | Spec 229 | Scoped context package only |
| Artifacts | R2 + canonical metadata | Provider temporary files allowed |
| Audit | SmartAIHub canonical audit | Provider event IDs retained as evidence |
| Completion | Kernel / owning runtime | Provider `completed` is never sufficient |
| Final Verify | Spec 224 where development applies | Provider cannot mint Final Verify PASS |

A provider-native session result MUST NOT directly mutate canonical job, credit, permission or completion state.

---

# 6. Core normalized abstraction

## 6.1 ManagedAgentProviderAdapter

Illustrative TypeScript contract:

```ts
interface ManagedAgentProviderAdapter {
  providerId(): ManagedAgentProviderId;

  discoverCapabilities(
    request: CapabilityDiscoveryRequest
  ): Promise<ManagedAgentCapabilities>;

  createSession(
    request: ManagedSessionCreateRequest
  ): Promise<ManagedSessionHandle>;

  submitTurn(
    request: ManagedTurnRequest
  ): Promise<ManagedTurnHandle>;

  steerTurn(
    request: ManagedTurnSteerRequest
  ): Promise<void>;

  observe(
    request: ManagedObserveRequest
  ): AsyncIterable<ManagedAgentEvent>;

  getSession(
    request: ManagedSessionLookupRequest
  ): Promise<ManagedSessionSnapshot>;

  requestPause?(
    request: ManagedControlRequest
  ): Promise<ManagedControlReceipt>;

  resume?(
    request: ManagedControlRequest
  ): Promise<ManagedControlReceipt>;

  cancel(
    request: ManagedControlRequest
  ): Promise<ManagedControlReceipt>;

  collectArtifacts(
    request: ManagedArtifactCollectRequest
  ): Promise<ManagedArtifactReceipt[]>;

  reconcile(
    request: ManagedReconcileRequest
  ): Promise<ManagedReconcileResult>;

  closeSession(
    request: ManagedSessionCloseRequest
  ): Promise<ManagedControlReceipt>;
}
```

Actual repository naming SHALL be mapped during implementation discovery. A new abstraction MUST NOT duplicate an existing provider/session interface if one already exists.

## 6.2 ManagedAgentCapabilities

Minimum fields:

```ts
interface ManagedAgentCapabilities {
  provider: string;
  adapterVersion: string;

  session: {
    durable: boolean;
    maxIdleSeconds?: number;
    maxLifetimeSeconds?: number;
    steering: boolean;
    pause: boolean;
    resume: boolean;
    cancel: boolean;
  };

  execution: {
    hostedEnvironment: boolean;
    selfHostedEnvironment: boolean;
    filesystem: boolean;
    shell: boolean;
    python: boolean;
    node: boolean;
    browser: boolean;
    computerUse: boolean;
    networkPolicyConfigurable: boolean;
  };

  orchestration: {
    subagents: boolean;
    multiAgent: boolean;
    mcp: boolean;
    providerTools: boolean;
    webhooks: boolean;
    streaming: boolean;
  };

  security: {
    configurableEgress: boolean;
    secretIsolation: boolean;
    residencyProfiles: string[];
    retentionProfiles: string[];
  };

  economics: {
    metering: string[];
    priceProfileRef?: string;
  };

  limitations: string[];
  discoveredAt: string;
}
```

Capability values MUST be discovered or pinned from a certified version profile. Unknown MUST NOT mean true.

---

# 7. Canonical managed-session identity

Every delegated managed session SHALL bind at least:

```text
managed_execution_id
worker_job_id
logical_run_id
logical_step_id
tenant_id
principal_id
project_id / product_id where applicable
provider_id
provider_session_id
provider_environment_id if present
attempt
route_generation
owner_epoch
fencing_token
security_epoch
policy_revision
billing_reservation_id
created_at
last_reconciled_at
```

Provider session IDs are correlation identifiers only.

A provider session ID MUST NOT itself authorize:

- resource access;
- artifact download;
- memory retrieval;
- tool invocation;
- further turns;
- credit spending.

---

# 8. Session lifecycle

Canonical normalized lifecycle:

```text
REQUESTED
  -> POLICY_CHECK
  -> BUDGET_RESERVED
  -> ADMITTED
  -> SESSION_CREATING
  -> READY
  -> TURN_RUNNING
  -> WAITING_PROVIDER
  -> WAITING_APPROVAL
  -> WAITING_USER
  -> RECONCILING
  -> VERIFYING
  -> COMPLETED

Recoverable:
  BLOCKED_CAPABILITY
  BLOCKED_PROVIDER
  PAUSED_POLICY
  PAUSED_BUDGET
  UNKNOWN_EXTERNAL_EFFECT
  RECOVERY_REQUIRED

Terminal:
  COMPLETED
  CANCELLED
  FAILED_TERMINAL
```

Provider-native state maps into these states but SHALL NOT replace them.

Examples:

| Provider state | Normalized interpretation |
|---|---|
| queued | WAITING_PROVIDER |
| running | TURN_RUNNING |
| needs_input | WAITING_USER or WAITING_APPROVAL depending on request |
| provider_completed | RECONCILING / VERIFYING |
| provider_failed | BLOCKED_PROVIDER or FAILED_TERMINAL after policy |
| provider_cancelled | CANCELLED only after canonical reconciliation |

---

# 9. Admission and placement policy

Before creating a paid or stateful managed session, SmartAIHub MUST evaluate:

- task family;
- required tools;
- required OS/runtime;
- browser/computer-use requirement;
- data classification;
- tenant residency;
- provider retention policy;
- user/provider consent;
- provider availability;
- current rate limits;
- expected cost;
- latency requirement;
- session durability requirement;
- need for local files/devices;
- approval requirements;
- model/provider constraints from Spec 231;
- availability of lower-cost internal alternatives.

Placement is a constrained policy decision, not a simple provider ranking.

Example candidates:

```text
CF Think
CF Sandbox
OpenAI hosted managed session
OpenAI self-hosted session
Claude Managed Agent
Local Runner
External coding harness
Workflow-only deterministic execution
```

---

# 10. Routing separation: model vs harness vs compute

SmartAIHub MUST explicitly separate three routing decisions:

## 10.1 Model routing

Owned by Spec 231.

Question:

> Which model/provider/deployment should perform inference?

## 10.2 Harness routing

Owned by Spec 243 / existing external-agent integration.

Question:

> Which agent loop/session implementation should own the delegated reasoning/execution session?

## 10.3 Compute/environment placement

Owned by the relevant execution runtime, including Spec 242 and Runner infrastructure.

Question:

> Where do shell, filesystem, browser, Python, Node or other tools execute?

These may be combined only when a provider requires an integrated bundle.

Example:

```text
Harness = OpenAI Agents API
Environment = self-hosted SmartAIHub Sandbox
Model = approved OpenAI model
```

or:

```text
Harness = Cloudflare Think
Environment = Cloudflare Agent + Sandbox
Model = model selected under Spec 231 policy
```

No layer may silently take authority from another.

---

# 11. Provider session isolation

Each session MUST have an explicit isolation profile.

Suggested profiles:

```text
EPHEMERAL_PER_JOB
PERSISTENT_PER_USER_SCOPE
PERSISTENT_PER_PROJECT
DEDICATED_TENANT
DEVELOPMENT_WORKSPACE
```

Default for arbitrary autonomous execution is `EPHEMERAL_PER_JOB`.

Cross-tenant session reuse is prohibited.

Cross-project reuse requires:

- same tenant;
- explicit policy;
- purpose compatibility;
- fresh ACL validation;
- memory/context decontamination;
- new scoped grant.

A persistent provider session MUST NOT gradually become an uncontrolled substitute for SmartAIHub Memory.

---

# 12. Context and memory projection

Managed agents receive only the minimum context required for the current task.

Allowed sources include:

- bounded conversation context;
- project context package;
- approved RAG evidence;
- explicitly granted memory items;
- source files required for the task;
- tool schemas.

The projection SHALL contain provenance and policy metadata.

Example:

```json
{
  "context_package_id": "...",
  "tenant_id": "...",
  "project_id": "...",
  "purpose": "IMPLEMENT_SPEC",
  "sources": [],
  "memory_revision": "...",
  "acl_revision": "...",
  "expires_at": "...",
  "redaction_profile": "..."
}
```

Provider-native memory MUST NOT be treated as canonical Personal, Project, Team or Tenant Memory.

Revocation or project switching MUST invalidate future use of stale context.

---

# 13. Tool access

## 13.1 Default rule

A managed provider receives no platform-wide credentials.

Tools are exposed through:

- SmartAIHub MCP Gateway;
- scoped REST actions;
- provider-native tool bridge;
- A2A where certified;
- bounded execution grants.

## 13.2 Tool grant

Every tool call requiring external effects MUST be bound to:

```text
tenant
principal
run
step
provider session
tool/capability
resource scope
allowed operation
approval revision
budget
expiry
nonce
route generation
security epoch
```

## 13.3 Provider tool approval

Provider-native approval prompts may be used for UX, but they are not sufficient authorization.

SmartAIHub policy remains authoritative.

---

# 14. Secrets and credentials

Secrets SHALL remain in the existing Secret Broker / protected server bindings wherever technically possible.

Managed agents MUST receive:

- short-lived scoped tokens;
- brokered calls;
- delegated tool grants;

instead of permanent credentials.

Forbidden by default:

- database administrator credentials;
- R2 account-wide secrets;
- tenant-wide OAuth refresh tokens;
- production SSH keys;
- platform API master keys;
- unrestricted MCP bearer tokens.

If a provider requires a credential to exist inside its hosted environment, the capability MUST be explicitly classified as elevated risk and separately approved/certified.

---

# 15. Network and egress

Provider-managed environments MUST have a declared egress profile.

Minimum profiles:

```text
NO_NETWORK
BROKER_ONLY
ALLOWLISTED_PUBLIC
GENERAL_PUBLIC_APPROVED
PRIVILEGED_SERVICE
```

For each provider, certify:

- HTTP restrictions;
- redirect behavior;
- DNS behavior;
- private-IP access;
- metadata endpoint exposure;
- callback ingress;
- MCP endpoint security;
- download/upload limits.

If a provider cannot satisfy required data isolation, that placement is `BLOCKED_CAPABILITY`.

---

# 16. External side effects

The system assumes provider execution is **at least once**, not exactly once.

Before any irreversible or externally visible effect:

1. create canonical action intent;
2. validate current permission/approval;
3. validate route generation/fence;
4. reserve cost where applicable;
5. execute with idempotency key if supported;
6. persist provider receipt;
7. reconcile canonical result.

Examples:

- email send;
- purchase;
- Git push;
- pull request;
- deployment;
- database mutation;
- file deletion;
- social posting;
- external API write.

On timeout after possible effect:

```text
UNKNOWN_EXTERNAL_EFFECT
```

The runtime MUST reconcile before replay.

---

# 17. Event normalization

Provider-specific events SHALL map into a stable event envelope.

```ts
interface ManagedAgentEvent {
  eventId: string;
  providerEventId?: string;
  managedExecutionId: string;
  providerSessionId: string;

  kind:
    | "SESSION_CREATED"
    | "TURN_STARTED"
    | "MESSAGE_DELTA"
    | "TOOL_REQUESTED"
    | "TOOL_STARTED"
    | "TOOL_COMPLETED"
    | "APPROVAL_REQUIRED"
    | "ARTIFACT_CREATED"
    | "USAGE_REPORTED"
    | "TURN_COMPLETED"
    | "SESSION_COMPLETED"
    | "SESSION_FAILED"
    | "SESSION_CANCELLED"
    | "HEARTBEAT"
    | "UNKNOWN";

  sequence?: number;
  observedAt: string;
  payloadRef?: string;
  traceId: string;
}
```

Large provider payloads MUST NOT be copied unbounded into PostgreSQL.

Store large bodies in approved artifact/log storage and retain bounded indexed metadata.

---

# 18. Streaming and replay

Streaming is an observation channel, not durable truth.

The adapter MUST support:

- reconnect;
- cursor/event replay where available;
- deduplication;
- event gap detection;
- fallback polling/reconciliation.

A WebSocket/SSE disconnect MUST NOT imply execution failure.

A successful stream close MUST NOT imply canonical completion.

---

# 19. Recovery and reconciliation

Managed sessions introduce crash windows across two authorities:

```text
SmartAIHub PostgreSQL
        |
provider API/session
```

There is no distributed transaction.

Mandatory reconciliation cases:

1. SmartAIHub commits job before provider create call.
2. Provider creates session before SmartAIHub stores provider ID.
3. Turn starts before correlation persists.
4. Tool side effect occurs before receipt persists.
5. Provider completes while SmartAIHub is offline.
6. Callback arrives after route generation changed.
7. Provider session expires before artifacts are copied.
8. cancellation request races with provider tool execution.
9. provider retries a webhook.
10. SmartAIHub loses stream but provider continues.

Each adapter SHALL implement `reconcile()` and a watchdog profile.

---

# 20. Cancellation

Cancellation has three separate meanings:

```text
STOP_ACCEPTING_NEW_WORK
STOP_PROVIDER_REASONING
STOP_ACTIVE_EXTERNAL_EFFECTS
```

The adapter MUST distinguish them.

A provider "cancelled" response does not prove:

- shell process termination;
- network request cancellation;
- external transaction rollback;
- browser action rollback.

SmartAIHub fences new effects immediately, requests provider cancellation, then reconciles outstanding effects.

---

# 21. Artifact durability

Provider environment files are temporary until imported.

Before canonical completion:

- enumerate required artifacts;
- enforce size/type policy;
- scan/redact if needed;
- compute SHA-256;
- upload to tenant-scoped R2;
- persist canonical metadata;
- verify readable object;
- record provider source/provenance.

Provider file URLs are never long-term SmartAIHub artifact IDs.

---

# 22. Billing and cost control

All managed execution SHALL integrate with Spec 207.

Track separately:

```text
model inference
managed-agent/harness fee
hosted environment/container fee
browser/computer-use fee
tool/API fee
network/egress
artifact storage
retries/recovery
SmartAIHub service fee
creator/tenant share where applicable
```

Admission SHALL reserve a bounded maximum when practical.

Hard controls:

- max session duration;
- max turn duration;
- max tokens;
- max tool calls;
- max browser actions;
- max hosted compute time;
- max network bytes;
- max artifacts;
- max retries;
- max parallel sessions per principal/tenant;
- daily/monthly cost ceilings.

A long-lived agent SHALL NOT run indefinitely because credits were available when it started.

---

# 23. Cost-aware placement

Cost comparison SHALL be performed using **verified policy tables**, not hard-coded specification constants.

Required normalized metrics:

```text
estimated_total_cost
actual_total_cost
cost_per_successful_result
cost_per_verified_result
cost_per_recovered_result
idle_cost_ratio
provider_failure_cost
human_intervention_rate
```

The placement resolver SHOULD prefer lower total expected cost only after:

- security;
- required capability;
- data policy;
- success probability;
- recovery quality;

have passed hard constraints.

---

# 24. Reliability metrics

Per provider/harness profile, measure:

- session creation success;
- turn success;
- verified task success;
- resume success;
- cancellation accuracy;
- webhook/stream loss;
- artifact recovery;
- unknown external effect rate;
- p50/p95/p99 latency;
- provider 429/5xx;
- human intervention rate;
- cost per verified completion.

Provider selection SHALL use measured evidence only where Spec 231/placement policy permits it.

---

# 25. Development-runtime integration with Spec 224

Spec 224 remains the lifecycle owner.

Example:

```text
Spec 224
PLAN
  |
IMPLEMENT
  |
Managed Agent Delegate
  |
provider session performs bounded work
  |
returns:
  diff
  logs
  tests
  artifacts
  receipts
  provider status
  |
Spec 224 continues:
REVIEW
VERIFY
REGRESSION
FINAL_VERIFY
```

The managed agent may assist with:

- implementation;
- test creation;
- debugging;
- code review;
- documentation;
- research;
- dependency analysis.

It may NOT independently declare:

```text
SPEC_IMPLEMENTED
FINAL_VERIFY_PASS
PRODUCTION_CERTIFIED
```

## 25.1 Required development result envelope

```ts
interface ManagedDevelopmentResult {
  managedExecutionId: string;
  providerSessionId: string;
  sourceBaseSha: string;
  resultingTreeSha?: string;

  patches: string[];
  artifactRefs: string[];
  testEvidenceRefs: string[];
  logRefs: string[];

  providerReportedStatus: string;
  unresolvedIssues: string[];
  externalEffects: string[];

  costReceiptRef: string;
  provenanceRef: string;
}
```

---

# 26. Workflow integration with Spec 215

Spec 215 may expose a generic execution node such as:

```text
ManagedAgentTask
```

Do not add one node type per vendor.

Configuration:

```text
task
capability requirements
provider preference / denylist
environment profile
context package
tool grants
budget
timeout
artifact contract
verification contract
fallback policy
```

Provider-specific settings belong in adapter profiles.

---

# 27. Cloudflare integration with Spec 242

Spec 242 owns Cloudflare runtime infrastructure.

Spec 243 adds only the harness-level contract.

Examples:

```text
CF Think as harness
      +
Cloudflare Agent Durable Object as state/session substrate
      +
Cloudflare Sandbox as execution environment
```

or:

```text
OpenAI managed harness
      +
SmartAIHub-controlled Cloudflare Sandbox where a compatible self-hosted mode is certified
```

No assumption is made that every provider supports arbitrary environment substitution.

Capability discovery must prove it.

---

# 28. Computer-use improvement bridge

Specs 208/213 remain historical and MUST NOT be edited.

Managed Agent support introduces the following **Improvement Items**:

### IMP-213-MCA-001 — Remote hosted browser execution

Need:

- represent provider-hosted browser/computer-use capability in Capability Registry;
- classify trust level;
- distinguish provider browser from certified SmartAIHub BrowserPool;
- require provider-specific live certification.

Implementation owner:

- Spec 243 adapter;
- future Computer Use update spec if broader product semantics are required.

### IMP-213-MCA-002 — Remote approval handoff

Need:

- surface action request to SmartAIHub;
- freeze provider side effect until approved where provider supports it;
- if provider cannot pause reliably, deny privileged action profile.

### IMP-213-MCA-003 — Evidence

Need:

- screenshot/DOM/action receipts;
- provider environment identity;
- timestamp and session linkage;
- no automatic equivalence with Spec 213 certification.

---

# 29. Spec 200 improvement bridge

Spec 200 is historical and SHALL NOT be rewritten.

Record these improvement items:

### IMP-200-MCA-001 — Hosted Session Provider Type

Add adapter capability concept:

```text
LOCAL_HARNESS
REMOTE_HARNESS
HOSTED_MANAGED_SESSION
```

### IMP-200-MCA-002 — Provider-managed durable session

Support provider session IDs, turns, steering, events, webhook reconciliation and provider environment refs.

### IMP-200-MCA-003 — Provider capability manifest

Normalize:

- tools;
- browser;
- filesystem;
- shell;
- subagents;
- webhooks;
- pause/resume;
- environment ownership;
- retention;
- residency;
- billing units.

### IMP-200-MCA-004 — Provider completion is evidence

Historical `worker_jobs` authority remains unchanged.

Implementation of these items belongs to Spec 243.

---

# 30. Spec 199 improvement bridge

No historical rewrite.

Improvement items:

### IMP-199-MCA-001

Allow a managed agent to access approved SmartAIHub MCP capabilities through short-lived, session-scoped credentials.

### IMP-199-MCA-002

Bind MCP requests to:

```text
managed_execution_id
provider_session_id
tenant/principal
route_generation
security_epoch
expiry
```

### IMP-199-MCA-003

Provider-hosted agents MUST NOT receive unrestricted upstream MCP credentials.

---

# 31. Spec 206 improvement bridge

A2A may be available for some managed providers.

Requirements:

- A2A is optional transport/interoperability;
- provider support must be certified;
- A2A remote completion does not bypass `worker_jobs`;
- Agent Card capability claims must be verified against real adapter capability.

---

# 32. UI and Task Control

Future compatible UI SHALL expose one normalized Managed Agent session view.

Minimum information:

- task;
- provider/harness;
- execution environment;
- status;
- started time;
- latest progress;
- approval required;
- cost estimate / accrued cost;
- artifacts;
- logs/evidence;
- pause/cancel where valid;
- fallback/retry reason;
- current canonical owner.

Provider-native dashboards remain diagnostic links only.

---

# 33. Mobile and tablet requirements

A managed cloud agent must remain usable while the user's PC is off.

Mobile user SHALL be able to:

- start eligible task;
- see progress;
- answer clarification;
- approve/deny privileged action;
- pause/cancel;
- open artifacts;
- see cost;
- receive completion/incident notification.

Local-only capabilities SHALL be clearly marked unavailable rather than silently changing semantics.

---

# 34. Monitoring and scheduled agents

Spec 238 remains the monitoring product authority.

A monitor may delegate one evaluation to a managed agent, but provider-native schedules MUST NOT become a second user-facing monitor scheduler.

Canonical schedule occurrence:

```text
Spec 238 / Spec 215 due occurrence
       ->
worker job
       ->
optional managed agent execution
```

If a provider requires internal scheduling for recovery or local session maintenance, it remains subordinate infrastructure.

---

# 35. Security threat model

Mandatory threats include:

1. cross-tenant provider session reuse;
2. stale provider session after ACL revoke;
3. tool prompt injection;
4. provider environment secret exfiltration;
5. unrestricted MCP access;
6. browser session credential theft;
7. malicious downloaded dependency;
8. artifact poisoning;
9. callback spoofing;
10. replayed webhook;
11. stale route generation;
12. duplicate external effect;
13. provider retention beyond policy;
14. provider environment compromise;
15. overbilling/runaway loop;
16. unbounded sub-agent spawning;
17. data-residency mismatch;
18. output interpreted as approval;
19. provider self-reported success accepted without verify;
20. stale memory/context reuse.

---

# 36. Webhook security

Where provider webhook support exists:

- authenticate signature;
- bind event to registered provider/account/environment;
- validate timestamp;
- enforce replay window;
- deduplicate event ID;
- map to existing execution;
- validate route/security epoch;
- store bounded raw evidence;
- trigger reconciliation rather than directly mutating final state.

Unknown callbacks are quarantined.

---

# 37. Provider outage behavior

Provider outage SHALL NOT corrupt canonical state.

Policy may:

```text
WAIT
RETRY_SAME_PROVIDER
FAILOVER_NEW_SESSION
FALLBACK_INTERNAL
PARK_FOR_USER
FAIL_TERMINAL
```

Failover to a new provider session requires a new route generation and explicit context/artifact transfer.

An old session that later wakes MUST be fenced from new effects.

---

# 38. Provider upgrade and version pinning

Each certified integration profile SHALL record:

```text
provider
API version/beta header
SDK version
adapter version
environment image/version
capability manifest digest
policy profile
certification timestamp
```

Provider capability drift triggers re-certification for affected features.

Preview/beta features remain separately flagged.

---

# 39. Observability

Required dimensions:

```text
tenant_id
managed_execution_id
worker_job_id
logical_run_id
provider
provider_session_id_hash
adapter_version
route_generation
attempt
task_family
environment_profile
model_route_ref
cost_reservation_ref
trace_id
```

Do not expose raw sensitive provider session IDs in general client telemetry.

---

# 40. Audit

Audit log SHALL record:

- who initiated the task;
- context scope;
- provider selection rationale;
- capability decision;
- approval events;
- tool grants;
- session lifecycle;
- external effects;
- provider receipts;
- artifacts;
- cost settlement;
- cancellation;
- reconciliation;
- verification outcome.

---

# 41. Data retention

Provider retention behavior MUST be represented as policy metadata.

Example:

```text
EPHEMERAL_PROVIDER_STATE
FIXED_PROVIDER_RETENTION
TENANT_APPROVED_RETENTION
PROVIDER_RETENTION_UNKNOWN
```

`PROVIDER_RETENTION_UNKNOWN` blocks restricted data.

Deleting a SmartAIHub task does not imply provider deletion succeeded.

Deletion flow SHALL track provider deletion receipts separately.

---

# 42. Privacy and third-party egress

Before private data enters a provider-managed environment:

1. classify data;
2. determine provider/region eligibility;
3. minimize;
4. redact where possible;
5. apply purpose binding;
6. verify consent/tenant policy;
7. create auditable egress record.

No blanket "user uses this provider" consent is sufficient for all future projects.

---

# 43. Multi-agent and sub-agent control

If a provider supports sub-agents:

- cap depth;
- cap total children;
- inherit a subset of parent permissions;
- never widen data scope;
- never increase spending ceiling without approval;
- report lineage.

Example:

```text
parent_execution_id
child_provider_session_id
child_purpose
delegated_capabilities
budget_slice
```

Unknown/unbounded provider-created subagents require deny or restricted mode.

---

# 44. Human approval semantics

Approval classes remain SmartAIHub-owned.

Managed agent may request:

```text
DATA_EGRESS
EXTERNAL_WRITE
PURCHASE
DEPLOY
SECRET_USE
DESTRUCTIVE
PRIVILEGED_BROWSER
HIGH_BUDGET
NEW_SCOPE
```

Approval SHALL bind exact parameters when practical.

A later materially different action requires new approval.

---

# 45. Verification policy

Provider completion can result in:

```text
PROVIDER_DONE_UNVERIFIED
```

before the owning runtime decides finality.

Verification depends on task family.

Examples:

- coding: build/test/review/regression;
- research: source/evidence checks;
- file transform: artifact integrity;
- browser action: side-effect receipt;
- monitor: evidence freshness and policy checks.

---

# 46. Error taxonomy

Normalize provider errors:

```text
AUTH_ERROR
RATE_LIMIT
PROVIDER_UNAVAILABLE
SESSION_EXPIRED
SESSION_NOT_FOUND
CAPABILITY_UNAVAILABLE
POLICY_DENIED
BUDGET_EXCEEDED
ENVIRONMENT_FAILED
TOOL_FAILED
NETWORK_FAILED
WEBHOOK_GAP
ARTIFACT_LOST
UNKNOWN_EXTERNAL_EFFECT
CANCEL_UNCERTAIN
PROVIDER_PROTOCOL_DRIFT
```

Retry policy MUST depend on error class.

---

# 47. Minimum provider adapters

## 47.1 OpenAI Managed Agents Adapter

Required certification:

- session create;
- asynchronous turn;
- streaming;
- webhook;
- continued session;
- steering;
- hosted environment;
- self-hosted environment if adopted;
- artifact export;
- cancellation;
- metering;
- tool approval bridge;
- retention/policy profile.

## 47.2 Claude Managed Agents Adapter

Required certification:

- agent/session create;
- event observation;
- long-running continuation;
- tool policy;
- artifact/result extraction;
- cancellation;
- provider-hosted environment semantics;
- billing/usage;
- retention/residency profile.

Only documented and live-tested capabilities may be marked supported.

## 47.3 Cloudflare Think Adapter

Spec 242 owns runtime.

Spec 243 certifies harness behavior:

- top-level agent;
- sub-agent RPC;
- message persistence;
- streaming;
- tool bridge;
- approval bridge;
- session/context projection;
- cancellation/recovery behavior;
- cost telemetry.

---

# 48. Conformance test matrix

Every provider adapter MUST pass the applicable tests.

| ID | Test |
|---|---|
| C01 | Capability discovery truthful |
| C02 | Session create idempotency |
| C03 | PG commit before provider create crash |
| C04 | Provider created before correlation persisted |
| C05 | Stream disconnect while provider continues |
| C06 | Duplicate webhook |
| C07 | Stale route-generation callback |
| C08 | ACL revoke during active session |
| C09 | Budget exhaustion during tool loop |
| C10 | Approval required |
| C11 | Approval denied |
| C12 | Cancel during reasoning |
| C13 | Cancel during external effect |
| C14 | Unknown external effect reconciliation |
| C15 | Artifact copied before provider expiry |
| C16 | Artifact missing/expired |
| C17 | Provider reports success but verify fails |
| C18 | Session expires |
| C19 | Provider outage |
| C20 | Rate limit/backoff |
| C21 | Failover to new provider |
| C22 | Old provider wakes after failover |
| C23 | Cross-tenant session ID attack |
| C24 | MCP grant replay |
| C25 | Context revoked after project switch |
| C26 | Memory scope does not widen |
| C27 | Secret absent from logs/artifacts |
| C28 | Cost reservation/settlement |
| C29 | Sub-agent budget inheritance |
| C30 | Sub-agent permission cannot widen |
| C31 | Provider protocol/API version drift |
| C32 | Webhook signature rejection |
| C33 | Large output bounded storage |
| C34 | Data residency mismatch denied |
| C35 | Provider retention unknown denied for restricted data |
| C36 | Mobile approval and continuation |
| C37 | User PC offline cloud path succeeds |
| C38 | Local-only capability remains blocked |
| C39 | Provider `completed` cannot mint Final Verify |
| C40 | Full recovery/reconciliation drill |

---

# 49. Development-specific conformance

Additional Spec 224 bridge tests:

| ID | Test |
|---|---|
| D01 | Delegated implementation returns patch/evidence |
| D02 | Provider success but tests fail -> Spec 224 continues repair |
| D03 | Provider edits outside allowed workspace denied |
| D04 | Git push requires canonical approval |
| D05 | Provider cannot modify protected branch directly |
| D06 | Provider lost mid-implementation -> checkpoint/recovery |
| D07 | New provider resumes from canonical artifact/context |
| D08 | Provider-generated review does not equal independent verify |
| D09 | Final Verify remains Spec 224-owned |
| D10 | Cost and evidence linked to development run |

---

# 50. Rollout plan

## Phase P243.0 — Repository and runtime discovery

Before code:

- verify Spec 243 number;
- inspect real Spec registry;
- inspect Spec 200 implementation;
- inspect current Provider Adapter interfaces;
- inspect worker job schema;
- inspect Spec 224 extension seams;
- inspect Approval/Billing APIs;
- inspect Task Control UI;
- record active versions.

No schema or code assumptions from this document override repository truth.

## Phase P243.1 — Normalized contract

Implement:

- capability profile;
- session binding;
- normalized event envelope;
- adapter interface;
- reconciliation contract;
- policy gates.

No live external effects.

## Phase P243.2 — First provider

Implement one managed provider end-to-end with:

- deterministic tests;
- mock provider;
- real sandboxed non-destructive staging test;
- cost observation;
- artifact durability.

## Phase P243.3 — Second provider

Add second provider to prove abstraction is not provider-specific.

## Phase P243.4 — Cloudflare Think profile

Integrate with Spec 242 and verify there is no duplicate authority.

## Phase P243.5 — Spec 224 bridge

Only after current Spec 224 implementation reaches a safe integration point.

## Phase P243.6 — Task Control / Mobile

Expose unified session UX.

## Phase P243.7 — Canary

Enable by tenant/provider/task family with explicit budget caps.

---

# 51. Rollback

Rollback SHALL disable new managed sessions without losing existing canonical state.

Required:

1. feature flag off;
2. stop admission;
3. retain event reconciliation;
4. cancel or allow bounded drain according to policy;
5. collect artifacts;
6. settle usage;
7. fence stale provider callbacks;
8. move eligible new work to alternative backend.

Do not uninstall adapters before all active sessions are reconciled.

---

# 52. Feature flags

Suggested flags:

```text
managed_agents.enabled
managed_agents.provider.openai.enabled
managed_agents.provider.anthropic.enabled
managed_agents.provider.cloudflare_think.enabled
managed_agents.hosted_environment.enabled
managed_agents.self_hosted_environment.enabled
managed_agents.browser.enabled
managed_agents.subagents.enabled
managed_agents.spec224_bridge.enabled
managed_agents.production_side_effects.enabled
```

Production external side effects default off until certified.

---

# 53. Improvement backlog for immutable historical specs

This table is normative and replaces any attempt to edit Specs <=213.

| Improvement ID | Historical owner | Gap | Implementation owner |
|---|---|---|---|
| IMP-186/195-MCA-001 | Job Control | provider session correlation + stale callback fencing | Spec 243 |
| IMP-199-MCA-001 | MCP Gateway | session-scoped managed-agent grant | Spec 243 adapter over existing 199 |
| IMP-200-MCA-001 | External Agent Gateway | hosted managed session provider type | Spec 243 |
| IMP-200-MCA-002 | External Agent Gateway | turns/steering/webhook/session continuation | Spec 243 |
| IMP-200-MCA-003 | External Agent Gateway | capability manifest | Spec 243 |
| IMP-206-MCA-001 | A2A | managed provider A2A compatibility | Spec 243 compatibility |
| IMP-207-MCA-001 | Billing | harness/environment usage classes | Spec 243 + existing ledger |
| IMP-208-MCA-001 | Computer Use | provider-hosted browser/computer profile | Spec 243 |
| IMP-213-MCA-001 | Certification | separate certification for hosted browser | Spec 243 / future CU update |
| IMP-213-MCA-002 | Certification | remote approval/evidence bridge | Spec 243 |

Historical specifications remain unchanged.

---

# 54. Cross-spec contracts

## Spec 214

If not implemented, Node Catalog may add one generic `ManagedAgentTask` type.

## Spec 215

Workflow Runtime owns logical step semantics. Managed provider is an executor.

## Spec 220

Authorization, egress and secrets remain canonical.

## Spec 224

Development lifecycle and Final Verify remain canonical and untouched.

## Spec 225/226

Use existing attention/task UI projection; add normalized provider session view only through compatible extension.

## Spec 229

Retrieval remains governed. Provider-native retrieval cannot bypass ACL.

## Spec 231

Model routing remains distinct from harness selection.

## Spec 232

Transport/migration can move dispatch mechanisms but cannot create dual job ownership.

## Spec 238

Monitoring may use managed agent execution but keeps canonical monitor scheduler and alert authority.

## Spec 241

Managed agent receives purpose-limited memory projection only.

## Spec 242

Cloudflare Agents/Sandbox runtime remains Cloudflare-specific infrastructure owner.

---

# 55. Acceptance criteria

Spec 243 is **implementation complete** only when:

1. provider-neutral adapter is merged;
2. two materially different provider profiles pass deterministic contract tests;
3. capability discovery fails closed;
4. `worker_jobs` remains canonical;
5. stale provider callbacks are fenced;
6. approval remains canonical;
7. billing reserve/settle works;
8. provider completion cannot bypass verification;
9. artifacts survive provider environment expiry;
10. cancellation and unknown-effect reconciliation pass;
11. tenant isolation tests pass;
12. memory/context revocation passes;
13. mobile/offline-PC path works for cloud-capable tasks;
14. no Specs <=213 are rewritten to backdate the feature;
15. Spec 224 integration does not alter its in-flight lifecycle contract.

It is **production certified** only when applicable live provider tests are performed against the exact deployed versions and independently reviewed.

---

# 56. Non-goals

Spec 243 does not:

- replace SmartAIHub Agent;
- replace LangGraph/workflow runtime;
- replace Spec 224;
- replace Cloudflare Spec 242;
- make every task cloud-executable;
- make provider memory canonical;
- guarantee provider portability of hidden internal state;
- guarantee zero provider retention;
- guarantee exactly-once external effects;
- certify browser/computer use merely because a provider advertises it;
- allow arbitrary provider access to tenant data.

---

# 57. Operational runbook requirements

Before enabling a provider in production, operators need:

- provider status/health view;
- active session count;
- spend rate;
- rate-limit state;
- stale session detector;
- reconciliation backlog;
- callback failure count;
- artifact import failures;
- cancellation backlog;
- unknown-effect queue;
- provider disable switch;
- tenant/provider denylist;
- version/capability fingerprint.

---

# 58. Required documentation artifacts

Implementation SHALL produce:

```text
P243_REPOSITORY_BASELINE.md
P243_PROVIDER_CAPABILITIES.json
P243_ADAPTER_CONTRACT.md
P243_SECURITY_THREAT_MODEL.md
P243_COST_POLICY.md
P243_PROVIDER_OPENAI_CERT.md
P243_PROVIDER_ANTHROPIC_CERT.md
P243_PROVIDER_CF_THINK_CERT.md
P243_SPEC224_INTEGRATION_CONTRACT.md
P243_CANARY_REPORT.md
P243_ROLLBACK_DRILL.md
P243_FINAL_VERIFY.md
```

Names may follow repository conventions, but equivalent evidence is mandatory.

---

# 59. Final architecture principle

SmartAIHub should own the **decision, authority and evidence**, while execution may occur anywhere that satisfies policy.

```text
SmartAIHub owns:
WHO
WHAT
WHY
SCOPE
PERMISSION
BUDGET
CANONICAL STATE
VERIFICATION
AUDIT

Provider may own:
AGENT LOOP
SESSION INTERNALS
TEMPORARY ENVIRONMENT
TOOL EXECUTION MECHANICS
MODEL-SPECIFIC OPTIMIZATION
```

This boundary allows SmartAIHub to benefit from rapidly improving managed agent platforms without becoming locked to one harness and without surrendering tenant, financial or execution control.

---

# 60. References reviewed for this revision

Vendor capability references reviewed 2026-09-24:

1. Cloudflare Agents — https://developers.cloudflare.com/agents/
2. Cloudflare Think — https://developers.cloudflare.com/agents/harnesses/think/
3. OpenAI Agents API overview — https://developers.openai.com/api/docs/guides/agents-api/overview
4. OpenAI Agents API sessions — https://developers.openai.com/api/docs/guides/agents-api/sessions
5. OpenAI Agents API configuration — https://developers.openai.com/api/docs/guides/agents-api/configuration
6. Anthropic engineering: Managed Agents — https://www.anthropic.com/engineering/managed-agents
7. Claude Platform documentation — https://docs.anthropic.com/

These references establish vendor capability only. They do not establish SmartAIHub implementation status.

---

# 61. Definition of Done summary

The feature is ready only when:

```text
User goal
  -> SmartAIHub policy
  -> placement decision
  -> worker job
  -> managed provider session
  -> normalized events
  -> governed tools
  -> durable artifacts
  -> cost settlement
  -> reconciliation
  -> independent verification
  -> canonical completion
```

works without:

```text
duplicate authorities
retroactive edits to Specs <=213
Spec 224 lifecycle rewrite
cross-tenant leakage
unbounded spend
provider-completion shortcut
or unreconciled external effects
```


# 62. Revision 1.1 precedence

Sections **62–80** are normative hardening additions produced by a 12-round audit on 2026-09-24. Where an earlier section conflicts with these additions, the stricter R1.1 requirement SHALL apply.

This audit is a **design/document audit only**. It does not certify provider availability, entitlement, production behavior, pricing, retention, regional support, API stability, or SmartAIHub implementation.

Before implementation or production promotion, P243.0 MUST re-check the exact provider API/SDK version, account/plan entitlement, provider region/data-retention behavior, live repository interfaces and migrations, current Spec registry, active branches/worktrees, and deployed SmartAIHub build SHA.

---

# 63. Twelve-round hardening audit

| Round | Audit dimension | Gap found | R1.1 action |
|---|---|---|---|
| R01 | Canonical ownership | Multiple provider sessions could coexist for one logical step during failover and both remain effect-capable | Add canonical Managed Execution Ownership Lease and stale-session effect fencing |
| R02 | Session configuration | Provider session configuration may be partially immutable or snapshot-based; changing tools/instructions/model policy cannot be assumed to mutate an existing session | Add immutable Session Configuration Fingerprint + `session_config_epoch` and forced re-session rules |
| R03 | Self-hosted environment | Self-hosted executor identity/credential boundary was too generic | Add executor identity, outbound-only registration, restricted environment key, environment-to-session binding and revocation tests |
| R04 | Cloudflare Think | Think durable submissions, recovery and action hooks were represented only as broad capability flags | Add Think-specific admission/recovery/action normalization and idempotency contract |
| R05 | Claude Managed Agents | Spec assumed a generic provider lifecycle without explicitly modeling separate durable session, harness and replaceable sandbox semantics | Add brain/session/hand separation and sandbox-loss recovery rules |
| R06 | Concurrency/order | No strict rule for simultaneous turns, steering, approval continuation and out-of-order callbacks | Add turn generation, causal event cursor and concurrency policy |
| R07 | Retention/deletion | Provider deletion request was tracked but deletion lifecycle, legal hold and residual copies were underspecified | Add deletion saga, evidence, tombstone and retention-state model |
| R08 | Capacity/fairness | Provider quotas/rate limits could cause one tenant or long-horizon session to starve interactive tasks | Add provider quota broker, fair queues and bounded admission |
| R09 | Event integrity | Provider sequence numbers and timestamps cannot always be treated as globally ordered or trustworthy | Add canonical ingest sequence, clock-skew handling and replay windows |
| R10 | Cross-provider failover | Context transfer was mentioned but hidden provider state could still be implicitly treated as portable | Add Portable Execution Checkpoint contract; hidden state is non-portable |
| R11 | Evaluation/certification | Conformance tests lacked task-level comparative evaluation and drift gates | Add Provider Qualification Suite, shadow/canary rules and regression thresholds |
| R12 | Incident/kill switch | Provider compromise, API semantic drift or runaway spend needed a stronger global containment model | Add emergency provider quarantine, session drain/fence and independent cleanup/reconciliation |

All twelve gaps are patched below.

---

# 64. R01 — Managed Execution Ownership Lease

For every managed execution that may perform side effects, SmartAIHub SHALL maintain exactly one canonical **effect-capable provider owner**.

Minimum conceptual record:

```ts
interface ManagedExecutionOwnership {
  managedExecutionId: string;
  logicalRunId: string;
  logicalStepId: string;
  workerJobId: string;
  activeProvider: string;
  activeProviderSessionRef: string;
  ownerEpoch: number;
  routeGeneration: number;
  fencingToken: string;
  securityEpoch: number;
  state: "ACTIVE" | "HANDOFF_PREPARE" | "OLD_OWNER_FENCED" | "NEW_OWNER_ADMITTED" | "RECONCILING" | "TERMINAL";
  lastReconciledAt: string;
}
```

Rules:

1. At most one provider session may hold an active external-effect grant for a logical step.
2. Failover SHALL first fence the old owner's future SmartAIHub-mediated effects.
3. If the old provider may have an in-flight external effect, transition to `UNKNOWN_EXTERNAL_EFFECT` or equivalent reconciliation state.
4. New provider admission occurs only after the handoff preconditions are satisfied.
5. Read-only duplicate execution MAY be allowed for evaluation/shadow purposes, but its grant MUST be explicitly `NO_EXTERNAL_EFFECTS`.
6. A provider callback with stale `owner_epoch`, `route_generation`, `fencing_token` or `security_epoch` is evidence only and cannot authorize a new effect or canonical completion.

This record SHOULD extend existing Kernel/`worker_jobs` metadata rather than create a competing ledger.

---

# 65. R02 — Session Configuration Fingerprint and epoch

Managed-session configuration SHALL be treated as a versioned snapshot, because provider APIs may restrict which fields can be changed after session creation.

Canonical fingerprint inputs SHOULD include, where applicable:

```text
provider
provider API version
agent/harness definition revision
model-routing policy revision
tool schema digest
MCP grant profile digest
instructions/prompt-policy digest
multi-agent policy digest
environment type/template/image
network policy digest
retention/residency profile
approval policy digest
context/memory projection policy
```

Persist:

```text
session_config_fingerprint
session_config_epoch
provider_session_created_with_fingerprint
```

If a requested change affects a field that the provider cannot safely update in-place, SmartAIHub SHALL freeze new effects on the old session, create a canonical portable checkpoint, create a new provider session, transfer only authorized portable context/artifacts, increment `session_config_epoch`, rebind ownership, and fence the old session.

Never assume an API `update session` call changes tools, instructions, multi-agent behavior, environment or other fields unless the pinned provider version explicitly guarantees it.

---

# 66. R03 — Self-hosted managed-harness environment security

A managed harness connected to SmartAIHub-controlled compute is a distinct trust topology.

For self-hosted execution:

1. Application/control credentials MUST stay outside the untrusted execution environment.
2. The executor receives only a narrowly scoped environment credential sufficient to attach that specific environment/session class.
3. Environment credentials MUST NOT authorize unrelated model, billing, tenant, storage or admin APIs.
4. Bind executor identity to provider account/project, SmartAIHub tenant/workload, environment ID, allowed session(s), environment policy revision, and expiry/revocation epoch.
5. Prefer outbound-only control connections from the sandbox/runner where supported.
6. Cross-user or cross-tenant shared writable environments are prohibited unless a separately certified mandatory isolation boundary exists.
7. On revocation, fence SmartAIHub tool grants, revoke/rotate environment credential, terminate or drain provider connection, and reconcile outstanding work.
8. Executor connection loss MUST NOT imply task failure; provider/session state must be reconciled.

OpenAI self-hosted environments SHALL additionally be tested against the documented `codex exec-server` topology and restricted environment-key behavior for the exact deployed API/CLI version.

---

# 67. R04 — Cloudflare Think harness normalization

When Cloudflare Think is selected as a managed harness, the adapter SHALL model its actual lifecycle rather than treating it as a generic chat loop.

Required normalized mappings:

```text
Think durable submit / programmatic turn -> SmartAIHub provider-turn admission evidence
Think persisted messages/context blocks -> provider-local session state, not canonical SmartAIHub Memory
Think sub-agent / agent-as-tool run -> child managed execution lineage with bounded grants
Think beforeToolCall / action approval hooks -> SmartAIHub policy/approval bridge
Think recovery / continuation -> provider-local recovery evidence; canonical owner/fence revalidated
Think scheduled/proactive submission -> subordinate trigger only unless invoked from canonical SmartAIHub schedule/monitor
```

Rules:

1. Use provider idempotency/submission keys where available, but still retain SmartAIHub's canonical idempotency.
2. A recovered Think turn MUST revalidate current policy, security epoch, budget and ownership before any new external effect.
3. Think's persisted conversation, context blocks or search indexes MUST NOT become canonical Personal/Project Memory.
4. Sub-agent creation inherits a strict subset of parent scope/budget.
5. Think's built-in scheduling cannot create a second user-facing monitor/schedule authority.
6. Agent-as-tool child runs MUST expose lineage, cancellation and bounded replay to SmartAIHub.

---

# 68. R05 — Claude Managed Agents: brain, session and hands

The Anthropic Managed Agents integration SHALL explicitly preserve separation between:

```text
SESSION = durable event/context record
HARNESS = agent loop / reasoning coordinator
HAND = sandbox/tool/resource execution target
```

SmartAIHub SHALL NOT assume the harness must survive for the session to survive, a particular sandbox instance is durable, sandbox filesystem continuity is guaranteed, provider internal context engineering is portable, or credentials must exist inside the sandbox.

Required adapter behavior:

1. Correlate the provider session independently from sandbox/environment instances.
2. Treat provider sandbox replacement as normal recoverable behavior where supported.
3. Import durable SmartAIHub-required artifacts before relying on provider environment lifetime.
4. Keep SmartAIHub secrets outside untrusted/generated-code execution whenever provider tooling permits proxy/vault patterns.
5. Reconcile session events after harness or stream restart.
6. Model multiple execution "hands" as individual capability resources; each hand receives only the grant it needs.
7. Provider-internal session log remains provider evidence/context, not SmartAIHub's canonical job/event ledger.

---

# 69. R06 — Turn concurrency, causal ordering and steering

A managed provider may permit overlapping submissions, steering, tool continuations or sub-agent work. SmartAIHub SHALL make the concurrency policy explicit.

Minimum fields:

```text
turn_id
turn_generation
parent_turn_id?
causal_parent_event_id?
provider_request_id?
canonical_ingest_seq
session_config_epoch
owner_epoch
route_generation
```

Supported concurrency profiles:

```text
SERIAL_TURNS
PARALLEL_READ_ONLY
PARALLEL_ISOLATED_BRANCHES
PROVIDER_NATIVE_CONCURRENT
```

Default for mutable/external-effect work is `SERIAL_TURNS`.

Rules:

1. Two turns in the same session MUST NOT concurrently mutate the same protected resource unless the owning runtime explicitly supports and tests it.
2. Steering applies only to the intended active turn generation.
3. Late approval for an old turn is rejected after route/session/turn generation changes.
4. Out-of-order callbacks are reordered only when supported by reliable causal/sequence metadata; otherwise reconcile from provider state.
5. Child-agent outputs MUST identify their parent lineage.
6. Merging parallel branches is a canonical SmartAIHub operation requiring conflict checks.

---

# 70. R07 — Provider retention and deletion saga

Provider deletion is an asynchronous external effect and SHALL be modeled as a tracked saga.

Suggested states:

```text
DELETE_NOT_REQUESTED
DELETE_REQUESTED
PROVIDER_ACKNOWLEDGED
PROVIDER_CONFIRMED
RETENTION_WINDOW_ACTIVE
LEGAL_HOLD
DELETE_UNVERIFIED
DELETE_FAILED
```

Deletion scope MAY include provider session, hosted sandbox/environment, uploaded initial files, generated provider artifacts, provider-side context/index, webhooks/subscriptions, and temporary credentials.

Rules:

1. SmartAIHub deletion of its own canonical records does not prove provider deletion.
2. Maintain a minimal tombstone sufficient to prevent accidental resurrection/rebinding while respecting retention policy.
3. Legal/contractual retention exceptions must be explicit and auditable.
4. Provider retention capability/limitations belong in the capability manifest.
5. A provider without a verified retention profile cannot receive restricted data.
6. Data-export and deletion verification SHOULD be periodically sampled in certification.

---

# 71. R08 — Provider quota broker and fairness

Managed providers introduce shared quotas beyond SmartAIHub compute quotas.

Add a **Provider Capacity Broker** as a policy/coordination component, not a new job authority.

It SHALL track where available:

```text
requests/minute
tokens/minute
concurrent sessions
concurrent turns
hosted environments
browser/computer sessions
webhook backlog
provider account/project quota
tenant quota allocation
retry-after windows
```

Admission rules:

1. Enforce per-tenant and per-principal concurrency ceilings.
2. Reserve capacity for interactive/high-priority product traffic according to explicit policy.
3. Long-horizon background agents MUST NOT starve short interactive tasks.
4. Honor provider retry-after/backoff signals.
5. Circuit-break a provider profile after bounded failure thresholds.
6. Queueing remains subordinate to `worker_jobs`; the broker does not become another durable job ledger.
7. Estimate cost of waiting versus failover before moving providers.
8. Emit provider-capacity incidents into the existing incident system.

---

# 72. R09 — Event integrity, canonical ingest order and clock skew

Do not assume provider timestamps or event sequence values are globally ordered.

On ingestion, SmartAIHub SHALL assign:

```text
canonical_ingest_seq
received_at
provider_observed_at?
provider_sequence?
provider_event_id?
payload_digest
signature_verification_result
```

Rules:

1. Canonical event processing order is based on SmartAIHub ingest/reconciliation rules, not arbitrary provider wall clocks.
2. Define an allowed timestamp skew window for signed webhook verification.
3. Duplicate provider events with the same immutable event ID/digest are idempotent no-ops after first accepted processing.
4. Same event ID with conflicting payload is a security/protocol incident.
5. Sequence gaps trigger provider reconciliation or polling rather than fabricated missing events.
6. Unknown events are retained in bounded quarantine for adapter/version diagnosis.
7. Logs/traces from separate provider components are correlated by trace/run/session refs, not wall-clock ordering alone.

---

# 73. R10 — Portable Execution Checkpoint

Cross-provider recovery MUST use an explicit **Portable Execution Checkpoint (PEC)**.

A PEC may include only provider-independent, authorized information:

```text
goal / task contract
current canonical phase
completed verified steps
pending steps
bounded conversation summary
approved context-package references
artifact refs + digests
source revision / workspace base
tool-effect receipts
unresolved external-effect records
approval state
budget remaining
policy/security epochs
verification requirements
```

A PEC MUST NOT claim to serialize hidden chain-of-thought, provider private memory, provider internal planning state, opaque model cache, transient sandbox processes, provider-specific hidden tools, or non-exported credentials.

Failover flow:

```text
fence old provider
-> reconcile possible effects
-> produce PEC
-> verify current ACL/policy/budget
-> create new provider session
-> materialize only permitted state
-> bind new owner epoch/route generation
-> continue from an explicit safe phase
```

If safe continuation cannot be established, restart the step or park for human review.

---

# 74. R11 — Provider Qualification and drift certification

A provider adapter passing protocol conformance is not enough to be a production route.

Each provider/harness/environment profile SHALL have a **Provider Qualification Profile** containing:

```text
capability correctness
task success rate
verified-result rate
recovery success rate
external-effect uncertainty rate
latency distribution
cost distribution
artifact survival rate
approval correctness
tenant-isolation results
retention/residency status
version fingerprint
```

Certification stages:

```text
UNIT
MOCK_CONTRACT
SANDBOX_INTEGRATION
LIVE_NON_DESTRUCTIVE
SHADOW_NO_EFFECTS
TENANT_CANARY
PRODUCTION_GENERAL
```

Rules:

1. Shadow traffic MUST use data eligible for that provider; never duplicate restricted private prompts merely for benchmarking.
2. Provider comparison datasets SHOULD contain deterministic synthetic/replay fixtures plus explicitly approved representative workloads.
3. Route promotion requires minimum thresholds defined outside the spec in reviewed policy/config.
4. Version/API/harness drift can demote a profile automatically to a safer stage.
5. A model quality improvement does not automatically re-certify tools, browser, sandbox, billing or retention behavior.
6. Record test dataset revision and evaluator revision with certification evidence.

---

# 75. R12 — Emergency containment and provider quarantine

SmartAIHub SHALL support emergency quarantine at:

```text
global provider
provider account/project
adapter version
environment profile
tool class
tenant
task family
region
```

Quarantine behavior:

1. stop new admission immediately;
2. fence new external effects from affected sessions;
3. preserve canonical jobs as recoverable/blocked rather than falsely failed;
4. attempt bounded artifact/evidence capture;
5. request provider cancellation/drain where safe;
6. revoke session-scoped grants/credentials;
7. continue independent reconciliation;
8. surface operator incident;
9. require explicit reviewed re-enable.

Critical triggers include suspected credential exposure, cross-tenant isolation failure, webhook signature/protocol compromise, runaway spend, provider semantic/API drift, repeated unknown external effects, destructive tool bypass, and data-residency violation.

The emergency path MUST remain operable even when the provider itself is unavailable.

---

# 76. Extended conformance tests C41–C68

The following tests are added to Section 48.

| ID | Test |
|---|---|
| C41 | Two provider sessions race for same step; only current owner can effect |
| C42 | Old provider wakes after ownership transfer; effect denied |
| C43 | Session config fingerprint mismatch forces safe re-session |
| C44 | Immutable provider session field change is not silently assumed |
| C45 | Self-hosted executor loses WebSocket and reconnects without duplicate effect |
| C46 | Restricted environment key cannot invoke unrelated provider API |
| C47 | Revoked executor/environment cannot reattach |
| C48 | Think durable submission duplicate uses canonical idempotency |
| C49 | Think recovery re-checks budget/policy/fence before tool effect |
| C50 | Think sub-agent cannot widen parent grant |
| C51 | Claude sandbox replacement preserves session correlation but not filesystem assumption |
| C52 | Provider harness restart recovers from session/event evidence |
| C53 | Parallel mutable turns default to serialization |
| C54 | Late approval for stale turn generation denied |
| C55 | Conflicting duplicate provider event becomes incident |
| C56 | Provider event gap triggers reconciliation |
| C57 | Timestamp outside webhook skew window rejected/quarantined |
| C58 | Deletion saga tracks provider acknowledgment separately from confirmation |
| C59 | Restricted data denied when retention profile unknown |
| C60 | Background session cannot starve configured interactive quota |
| C61 | Retry-after respected without retry storm |
| C62 | Circuit breaker parks/fails over according to policy |
| C63 | Portable checkpoint excludes provider-private state |
| C64 | Cross-provider failover resumes only from safe canonical phase |
| C65 | Shadow evaluation cannot perform external effects |
| C66 | Provider version drift demotes affected qualification profile |
| C67 | Global provider quarantine stops admission and fences effects |
| C68 | Quarantine reconciliation works while provider API is unreachable |

---

# 77. Extended acceptance criteria

In addition to Section 55, production certification requires:

16. exactly one effect-capable managed provider owner per logical step;
17. session configuration fingerprinting and epoch transition tests pass;
18. self-hosted executor credentials are narrow, revocable and isolated;
19. Think-specific durable submission/recovery behavior is certified when Think is enabled;
20. Claude session/harness/sandbox separation is reflected in recovery tests when Claude Managed Agents are enabled;
21. turn concurrency and stale approval tests pass;
22. provider deletion/retention status is observable;
23. provider capacity/fairness controls pass load tests;
24. canonical event ingest survives duplicates, gaps and skew;
25. Portable Execution Checkpoint failover tests pass;
26. provider qualification profile exists for each production route;
27. emergency provider quarantine and offline reconciliation drill passes.

---

# 78. Updated implementation order

The implementation sequence is hardened to:

```text
P243.0   Repository + provider-version discovery
P243.1   Canonical ownership + session binding + event envelope
P243.2   Session configuration fingerprint / epochs
P243.3   Provider Capacity Broker + economic admission
P243.4   First managed provider adapter
P243.5   Provider-specific failure/recovery certification
P243.6   Second materially different provider adapter
P243.7   Portable Execution Checkpoint + cross-provider failover
P243.8   Cloudflare Think profile with Spec 242
P243.9   Spec 224 additive integration contract
P243.10  Task Control / mobile projection
P243.11  Shadow + tenant canary
P243.12  Emergency quarantine / rollback drill
P243.13  Production Final Verify
```

Implementation MUST NOT begin a later production phase merely because the API happy path works.

---

# 79. Additional vendor references reviewed for R1.1

Reviewed on 2026-09-24; re-check on implementation date:

8. Cloudflare Think — durable recovery  
   https://developers.cloudflare.com/agents/harnesses/think/recovery/

9. Cloudflare Think — programmatic submissions  
   https://developers.cloudflare.com/agents/harnesses/think/programmatic-submissions/

10. Cloudflare Think — lifecycle hooks  
    https://developers.cloudflare.com/agents/harnesses/think/lifecycle-hooks/

11. Cloudflare Agents — agents as tools / sub-agent execution  
    https://developers.cloudflare.com/agents/runtime/execution/agent-tools/

12. OpenAI Agents API — configuration and environment settings  
    https://developers.openai.com/api/docs/guides/agents-api/configuration

13. OpenAI Agents API — self-hosted sandboxes  
    https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted

14. OpenAI Agents API — architecture  
    https://developers.openai.com/api/docs/guides/agents-api/architecture

15. Anthropic — Scaling Managed Agents: Decoupling the brain from the hands  
    https://www.anthropic.com/engineering/managed-agents

These references document vendor surfaces only. SmartAIHub production support requires its own conformance and live certification.

---

# 80. R1.1 audit result

**Audit result: PASS AS A DESIGN CANDIDATE WITH PATCHES APPLIED.**

The twelve audit rounds identified material gaps and patched them in this revision.

The most consequential changes are:

1. provider sessions now have explicit canonical effect ownership;
2. provider-session configuration is versioned/fingerprinted;
3. self-hosted harness compute has an explicit restricted credential boundary;
4. Cloudflare Think receives provider-specific durable submission/recovery semantics;
5. Claude Managed Agents are modeled as separable session/harness/sandbox resources;
6. concurrent turns and stale approvals are fenced;
7. provider deletion becomes an auditable saga;
8. provider quota/fairness is a first-class admission constraint;
9. provider events get canonical ingest sequencing;
10. cross-provider failover uses an explicit portable checkpoint;
11. production routing requires task-level qualification, not protocol connectivity alone;
12. provider quarantine is a mandatory emergency control.

This result remains **NOT IMPLEMENTED / NOT PRODUCTION CERTIFIED** until the repository and live-provider gates are executed.

---

# 81. Revision 1.2 — precedence, evidence and implementation boundaries

**Normative amendment.** Sections 81–101 supersede any weaker or contradictory earlier language. This revision adds **14 new audit rounds (R13–R26)** after R1.1's twelve; the cumulative document-review count is **26**. This is design assurance, **not an executed provider integration test, deployment, price quote, regulatory compliance attestation or production certification**.

The implementation boundary is unchanged and MUST be machine-checked: **Specs 1–213, inclusive, are immutable historical files**; all associated changes are indexed improvement items implemented by this or another later approved spec. **Spec 224 is in progress**: only a separately versioned additive integration package/contract may connect to its verified extension seams; its lifecycle, Final Verify and active worktree may not be rewritten. Spec 242 retains ownership of Cloudflare Agents/Sandbox runtime primitives, while Spec 243 owns the provider-neutral harness/hosted-session surface; no duplicate Cloudflare adapter or job ledger.

Before allocating spec number 243 or creating migrations, inspect **live** SmartSpecPro registry, default branch, PRs, worktrees, schema, adapter packages, billing ownership and deployed build fingerprint. Library versions and this design are not evidence of that state. If the number is occupied, retain this content as a candidate without overwriting another spec; reconcile its canonical identity with the owner.

**Scope guard:** The policies below apply both to fully hosted third-party execution and provider-managed harnesses paired with SmartAIHub-hosted compute. Self-hosting a sandbox **does not** automatically change the provider's data-processing region, retention, legal terms, internal logs or model-processing location.

# 82. Audit round ledger — 14 independent new passes

| Round | Dimension examined | Material gap in v1.1 | Corrective section | Evidence gate |
|---|---|---|---|---|
| R13 | Vendor eligibility and data handling | No dated **hard deny** for current OpenAI/Claude region and non-ZDR managed-session restrictions | §83 | C69–C71 |
| R14 | OpenAI webhook / self-hosted lifecycle | `idle`, `action_required`, environment connection timeout and deletion did not have provider-specific normalization | §84 | C72–C76 |
| R15 | Claude webhooks / event sourcing | Webhooks can be missed, are unordered and do not contain the full resource; stream/webhook status names differ | §85 | C77–C81 |
| R16 | Cloudflare Think action effects | Optional built-in authorization and lease-based re-execution could bypass the platform effect ledger | §86 | C82–C86 |
| R17 | Hosted tool enforcement | Approval policy is unenforceable for opaque native tools or unrestricted hosted egress | §87 | C87–C90 |
| R18 | Unknown create / cleanup | Crash after provider create can orphan paid sessions and deleting the session may not stop compute | §88 | C91–C94 |
| R19 | Credit and cost consistency | Reservation, provider late invoice, nested agents and cleanup spend needed a bounded finance saga | §89 | C95–C98 |
| R20 | Delegated user authority | User logout, role changes and stale mobile approvals could leave provider sessions privileged | §90 | C99–C102 |
| R21 | Artifact confidentiality and erasure | Provider-side uploads, generated artifacts, local copies and deletion receipts lacked separate retention proof | §91 | C103–C105 |
| R22 | Task closure and UI correctness | Provider `idle`, session termination or completed turn could still include failed tools / incomplete work | §92 | C106–C109 |
| R23 | Capability drift and release identity | Experimental/beta feature changes could invalidate certification without a reproducible profile | §93 | C110–C113 |
| R24 | Agent input/output integrity | Prompt injection and untrusted streamed events could promote content into permission or execution commands | §94 | C114–C117 |
| R25 | Backward-compatible rollout | Prior implementation boundaries, shadow-mode effects and rollback schema skew lacked an executable release gate | §95 | C118–C121 |
| R26 | SRE containment | Provider-offline quarantine, billable orphan compute, missing callback delivery and operator overrides lacked a combined drill | §96 | C122–C126 |

Each finding is addressed by a **normative patch**, an assigned owner and one or more tests. Previously closed R01–R12 requirements remain in force unless explicitly tightened here.

# 83. R13 — Policy-first provider eligibility, residency and retention

## 83.1 As-of documentation baseline (2026-09-24)

| Execution offering | Documented retention/location fact | Mandatory SmartAIHub interpretation |
|---|---|---|
| OpenAI **Agents API managed sessions** | Documentation states session data residency is **US-only** and **ZDR is not supported**; self-hosted execution does not confer ZDR eligibility | Fail closed for any purpose/tenant demanding non-US provider processing or ZDR; do not infer eligibility from a self-hosted worker region |
| **Claude Managed Agents** | Managed Agents are stateful and currently **not ZDR-eligible**, including their self-hosted sandbox mode; provider session transcripts persist until deletion | Fail closed for ZDR-dependent datasets. Separately check contractual/region/retention eligibility before transmitting classified data |
| **Cloudflare Think/Agents** | State resides in Durable Objects and tool execution can use separate services; actual placement depends on current account/plan/region configuration | Verify location and retention **for DO, Workers logs, sandbox, R2, PostgreSQL, model processing and every third-party tool separately** |

No row is a permanent provider promise. Refresh from official documentation **and the customer's executed contract** on implementation and each material policy change. More permissive future vendor claims are not automatically effective without an owner-approved policy revision and live certification.

## 83.2 Binding eligibility decision

Before *any* outbound provider creation, context send, tool registration, file upload, sub-agent spawn or failover, the Spec 220 policy check SHALL evaluate `tenant_id`, data class, project/product purpose, data subject consent as applicable, `provider`, account/project, provider region, chosen model, managed-session retention, environment placement, tool destinations and effective policy epoch. Return a signed decision envelope with `allowed|denied|approval_required`, `reason_code`, immutable policy digest, expiry and evidence reference.

`UNKNOWN`, unsupported retention, undocumented processing region and vendor account entitlement mismatches **fail closed** for restricted workloads; general tasks may use only a separately reviewed low-risk profile. A provider type or self-hosted flag is **never** a substitute for verified region/ZDR terms. Block prohibited placement *before* provisioning billable hosted resources.

# 84. R14 — OpenAI Agents API exact event and environment recovery contract

For the certified OpenAI Agents API version, map session/turn **separately**: session `created`/`in_progress`/`action_required`/`idle`/`failed` do not replace turn completed/failed/cancelled. An idle session is ready for input, **not proof its last turn succeeded**; turn completion does not prove every tool succeeded. Consume stream turn outcome and canonical verification evidence before terminating SmartAIHub work.

The webhook's `action_required` payload may identify only the action category. **Retrieve the current session** to inspect `required_actions`; function calls require the provider's `turn_id` and `call_id`, and environment connection requires the current environment ID and provider-supplied remote URL. Do not act solely on stale webhook payload. Normalize API-version-specific event aliases through explicit versioned mappings and tests, rather than assuming historical names are interchangeable.

For self-hosted `environment_connection`, use signed webhook ingestion -> durable existing outbox/`worker_jobs` dispatch -> fresh session fetch -> independently admitted executor -> outbound `codex exec-server` connection using a restricted environment key (application API key remains outside the sandbox). Current documented connection wait can be **up to five minutes**; it is **not a durable user-input queue**. If it expires, reconcile turn/session outcome before retrying; a client timeout is not proof execution never began. API stream disconnect, webhook retry and delayed executor attach must converge on the same canonical attempt.

**Deletion/cancellation distinction:** OpenAI session deletion does not itself prove remote compute stopped and has no corresponding deletion webhook in the documented session webhook list. Request environment/process shutdown using certified means, fence governed effects, settle billable usage, independently check remaining resource state and maintain an orphan-cleanup incident if status is uncertain. A client-side `DELETE` acknowledgment MUST NOT be recorded as verified compute termination.

# 85. R15 — Claude Managed Agents webhook loss, event mapping and session semantics

Claude Managed Agents sessions are separate resources from Agent definitions and Environments. Persist the **exact version** of a versioned Agent resource when opening a production session; passing an unqualified ID that resolves to `latest` is prohibited on certified routes unless the owner explicitly authorizes a new revision. Record the current provider beta header (`managed-agents-2026-04-01` on reviewed documentation) as a **versioned capability requirement**, not a perpetual constant.

Webhook payloads are **hints to fetch current resources**, not canonical event logs. The official docs state retries can be exhausted and events then dropped, delivery can be **out of order**, stream and webhook event types can differ, and endpoints may auto-disable. Normalize each native event through a typed mapping table; never assume `session.status_idled` means `session.status_idle` or a globally terminal `COMPLETED`. Provider `idle` may mean waiting for user input/confirmation; `terminated` may mean archived or failed and requires reason/outcome retrieval.

The reconciler MUST poll/list relevant live sessions and compare latest durable event cursors **even when no webhook has arrived**. Record webhook registration and subscription coverage **before** starting any live session. On endpoint disable, alert operator, retain the canonical PG job, restore subscriptions and reconcile missed transitions; subscriptions created later do not backfill past events. A deleted-resource webhook may be the only final evidence when fetching that resource now returns not found, but remote execution/financial cleanup still needs its own proof.

# 86. R16 — Cloudflare Think Actions: duplicate effects and default-allow closure

Spec 242 owns the implementation/deployment of Think. Spec 243's harness profile SHALL require the following **bidirectional conformance contract**:

1. `authorizeTurn()` **MUST override Think's permissive default** with an explicit bounded grant from Spec 220. `authorizeAction()` MUST perform a fresh at-use validation for high-risk effects; body fields, transcript and LLM-supplied roles are untrusted.
2. Think `action()` idempotency and durable ledger are **subordinate defense-in-depth**. Their pending retry/reclaim lease is *not* proof an external effect did not execute. SmartAIHub canonical effect intent/receipt/fence MUST gate every external write.
3. For non-idempotent irreversible actions, disable automatic replay or ensure SmartAIHub effect-status reconciliation before any `execute` re-entry. Stable provider action keys MUST derive from the canonical operation identity, not a random tool-call ID; an unresolved pending row must park the step.
4. Approval-gated `needsApproval` and Think `durable-pause` `approveExecution()` map to **one** SmartAIHub approval intent. Approving provider-local state alone is not permission to run. Before resuming, validate operation arguments/digest, current scope, policy, budget and owner epoch; a stale approval is rejected.
5. `getTools()`, `getActions()`, workspace tools, MCP tools and extensions MUST share a centrally checked effective tool-name inventory. Colliding names or provider-side direct-tool fallbacks must be rejected or explicitly shadowed in a signed manifest; plain `tool()` must not be used for unbrokered privileged effects.
6. `runTurn({mode:"submit"})` may be called from within an active turn; nested `wait`/`stream`/continuation is prohibited on affected versions. `messageConcurrency` policy SHALL be pinned per profile and for external mutations must not treat `latest`, `merge` or `drop` as authorized cancellation of already-running effects.
7. Think's persistent transcript, local Action ledger and approved-tool UI are local provider data; PostgreSQL/`worker_jobs`, Spec 207 and SmartAIHub approval remain canonical.

**Safety exception:** If the actual deployed Think/API version cannot expose an at-use gate for an advertised action, mark that *specific action class* `UNSUPPORTED_FOR_SIDE_EFFECTS`; ordinary read-only Think tasks may remain eligible.

# 87. R17 — Enforceability of external tool / browser / shell controls

The presence of a provider approval API does **not** imply it intercepts all built-in tools, subprocesses, remote MCP connections, browser actions, nested tools or outbound network calls. Certification SHALL produce a per-tool **enforcement coverage matrix**:

```text
provider / account / adapter / environment / tool name
read-only vs external-write vs privileged vs destructive
actual execution principal and execution location
interception: PRE_EFFECT | OBSERVE_ONLY | NOT_INTERCEPTABLE
network/credential boundary verified by live test
required approval / receipt / idempotency support
allowed data class / permitted purpose
```

- `PRE_EFFECT` is mandatory for purchases, deployment, production mutations, external communications, secret use and regulated/restricted-data egress. An after-the-fact model message or provider approval is not adequate.
- `OBSERVE_ONLY` or `NOT_INTERCEPTABLE` may be admitted for explicitly approved low-risk read-only profiles **only if** network, account permission and data exposure genuinely constrain the effect.
- A hosted sandbox with unrestricted native browser/network/shell that cannot prove isolation MUST NOT be used for privileged customer tasks. Disabling SmartAIHub MCP does not disable a provider's native shell or web access.
- Tool schemas and output must be version-pinned and treated as untrusted. Detect provider-side built-in fallback, tool alias collisions and nested-subagent privilege escalation.

# 88. R18 — Ambiguous provider create, orphan inventory and lifecycle teardown

Every session/environment create request must be represented by a canonical **provisioning intent** committed through the existing PG outbox **before** the remote call, containing a privacy-safe correlation ID, provider/account, desired configuration fingerprint, budget reservation, owner epoch, attempt and execution deadline. When the provider offers a documented create idempotency key use it; **when it does not, do not invent an exactly-once guarantee**.

Crash matrix and recovery:

| Crash window | Required reconciler action |
|---|---|
| Before provider create | Dispatch the existing intent after fresh admission/fence check |
| After API accepts, before provider ref stored | Search/list by supported metadata or bounded account inventory; match verified correlation/config/creation window; if ambiguous quarantine unknown results rather than blindly create again |
| Provider provisions environment but no session is usable | Cancel/destroy environment where supported; retain cleanup receipt and estimated spend |
| Provider deletes session but executor continues | Revoke broker grants and separately kill/drain executor; verify cessation and usage settlement |
| Provider account unreachable during cleanup | Mark `CLEANUP_UNCERTAIN`, retain minimal inventory, meter expected accrued liability, alert owner and retry boundedly |

An **independent reaper** (not the doomed provider session, Think DO, or sandbox process) SHALL compare canonical active intents to provider sessions/environments/workers and billing usage. Inventory endpoints, provider metadata matching and deletion semantics must be verified per version/account. Never delete a foreign or pre-existing session on a mere name match. Reap attempts are idempotent and audit-logged.

# 89. R19 — Financial admission, hierarchical budgets and delayed settlement

The existing Spec 207 ledger remains the **only** authority for wallet balance, reservation, committed charge and refund; Provider Capacity Broker (§71) only grants provisional physical capacity. Every paid provider/session/subagent/tool/environment operation requires **joint admission** for signed policy, financial reservation and backend capacity under the canonical run/step/attempt. Because PG/provider/resource allocation are not atomic, recover partial admissions through a bounded compensation saga.

Budget envelope (conceptual, mapped onto existing ledger fields rather than inventing duplicate balances):

```text
root_run_budget
  -> provider_session_budget
      -> active_turn_budget
          -> child_subagent_budget / tool_budget / environment_budget
  -> reserved_recovery_and_cleanup_headroom
```

Requirements:

- Child budgets **partition** the parent's approved limit; they are not new spending allowances. Avoid double-charging the same vendor usage reported at session, turn and model level.
- Differentiate `ESTIMATED`, `RESERVED`, `OBSERVED`, `INVOICED`, `SETTLED`, `DISPUTED` usage; late provider metering may arrive after final user-visible task state.
- Track billing currency/rate timestamp, provider account and billable unit, usage window, retry/duplicate event ID, environment idle exposure and quota overages. Exchange-rate or provider-price changes cannot retroactively change an already accepted user spending ceiling.
- If limits approach exhaustion, stop **new** chargeable work, fence subagent creation, checkpoint where safe, request bounded cancellation and show a non-successful paused state when continuation requires user funds or consent.
- Preserve settlement liability for orphan compute, failed destroy, delayed usage and provider-side tool work even after task cancellation. Never assert a user owes zero for charges already incurred, but do not arbitrarily debit beyond authorized commercial terms.
- Spec 222 cost optimization may propose cheaper routes only from observed **cost per verified completed result**, adjusted for failure/recovery/idle cost and confidentiality restrictions.

# 90. R20 — Principal binding, delegated permissions and multi-device approvals

Managed sessions SHALL distinguish (a) authenticated SmartAIHub end user, (b) tenant/project resource owner, (c) delegated service workload principal, (d) external provider service identity, (e) optional human approver. Store verified bindings and **do not infer principal identity from provider transcript or tool arguments**.

Every grant, approval and provider callback bears a short-lived audience and current `principal_membership_epoch`, `project_security_epoch`, `session_config_epoch`, `turn_generation`, `route_generation` and `policy_digest` where applicable. Account logout alone may not revoke already-authorized background work unless that behavior is explicitly in tenant policy; **password reset, account suspension, ACL revocation, tenant removal, project switch and approval withdrawal** must have reviewed effect on every relevant grant and outstanding session.

A multi-device approval is a *single* canonical decision (PG CAS); competing phone/web responses cannot yield two approvals or allow a stale action after owner transfer. Show the exact provider, destination, resource, argument digest, cost ceiling and irreversible-effect class. Reject replayed deep links, provider-generated approval prompts without canonical request ID, and `approve` against a superseded tool call. A denial propagates to provider-native parked approval **without granting an alternative bypass route**.

# 91. R21 — Artifact confidentiality, provenance and verified deletion

Treat **five** physically distinct data surfaces separately: (1) SmartAIHub PostgreSQL metadata, (2) tenant-scoped R2 source/result objects, (3) provider uploaded initial files, (4) provider-generated files/session attachments, and (5) environment-local working copies/logs/checkpoints. Deleting one does not prove deletion of another.

A canonical artifact import manifest MUST include: `provider_account`, `provider_session_ref`, `provider_file_ref`, `source_hash`, `artifact_type`, `size`, `classification`, `source_revision`, `created_at`, `scan_status`, `authorized_owner`, `retention_policy`, `immutable_r2_ref`, `checksum_verified_at` and `import_epoch`. Use allowlisted content types and antivirus/supply-chain scanners appropriate to file type; HTML/JS/script/data extracts remain untrusted until separately reviewed. No provider presigned URL is a durable artifact identity.

Deletion saga SHALL distinguish deletion of SmartAIHub copies from **provider session, uploaded files and generated artifact deletion**; capture confirmed/provider-undocumented/unavailable states separately. Invalidating an R2 link or forgetting a session does not erase hosted third-party copies. Evidence containing personal information must itself follow retention/redaction policy. Keep a minimal non-sensitive tombstone for stale-webhook rejection until the reconciliation/retention window closes.

# 92. R22 — Provider-native state vs verified task state, including user UI

Expose **three separate columns**, not one overloaded `status`:

```text
provider_session_state = CREATED | IDLE | RUNNING | ACTION_REQUIRED | FAILED | ARCHIVED | DELETED | UNKNOWN
provider_turn_state    = QUEUED | RUNNING | WAITING_INPUT | COMPLETED | FAILED | CANCELLED | UNKNOWN
smartaihub_task_state  = canonical workflow/worker_jobs/Spec224 state
```

Examples:

- OpenAI `agent.session.idle` is only readiness for subsequent input; fetch latest turn/tool results. A completed turn may contain failed tools.
- Claude `idle` can mean waiting for user input/confirmation; `terminated` can arise from archival or unrecoverable failure. Fetch actual outcome evidence before mapping terminal states.
- Cloudflare Think persisted assistant message or returned `runTurn` is an observation, not proof the required external action or downstream verify passed.

Task Control / Mobile SHALL label `Provider finished — verification pending`, `Needs your approval`, `Recovery pending`, `Cancellation uncertain` and `Cleanup pending` truthfully. Never show a green `COMPLETED` on stream close, webhook reception, session deletion, model final text, `provider idle`, or an unverified artifact. Detect silently stalled **waiting states** separately from actively running work using task-specific deadlines and reconciliation. Only canonical runtime commits the final user-visible terminal result.

# 93. R23 — Provider capability provenance, experimental APIs and safe version drift

For every `ManagedAgentCapabilities` profile (§6), attach a signed **certification provenance bundle**: exact vendor product/API name, account/project and entitlement class, SDK/Beta header, region, model catalog snapshot, harness/agent version, execution environment/image digest, webhook subscription set, permission/tool manifest digests, tool mediation coverage, retention policy source/review date, pricing source/review date, deterministic test suite digest and deploy SHA.

Classify each capability as `DOCUMENTED`, `LIVE_VERIFIED`, `ACCOUNT_VERIFIED`, `EXPERIMENTAL`, `UNKNOWN`, `REVOKED` and give it an explicit `expires_at`. Only a **live-verified** capability set permits its corresponding high-risk production placement. For Cloudflare experimental `runTurn`/Actions, OpenAI Agents API beta and Claude Managed Agents beta, API shape, callback names and product limits must be probed at pinned versions; do not generate permanent adapter code from speculative beta examples.

Material version drift (permission hook default, webhook event rename, container image family, data-retention/region, session update mutability, price model, tool list) **demotes only affected provider routes**; unaffected safe routes may continue. Require re-certification before re-enabling paid or privileged pathways. Treat undocumented pricing/capacity limits as `UNKNOWN` and apply an owner-approved conservative budget or deny the route.

# 94. R24 — Prompt injection, provenance laundering and tool output boundaries

User-provided instructions, provider natural-language messages, fetched webpages, repository files, search results, screenshots/OCR, MCP tool responses, third-party hooks and artifact metadata SHALL be labeled by **origin and trust tier**. All third-party/tool content is **data by default** and cannot grant permissions, change budgets, create MCP credentials, alter approved provider destination or declare canonical verification success.

Use typed tool-call schemas and at-use authorization independent of the model explanation. Whenever an Agent proposes an action, compare verified tool name/parameters/resource IDs against the immutable approved intent and active capability grants. External text like 'ignore all previous instructions' or forged admin messages must not change execution policy; source-content-derived tool arguments receive least-privilege validation and, for consequential actions, human approval.

Context packages exported to providers carry source revisions, tenant scope, classification, attribution, redaction digest, retention profile and expiry. Do not export invisible system prompts, unrelated project history, all tenant Vectorize matches, secrets or raw long-term Memory as a convenience. A provider-generated summary is not a substitute for the original trusted approval/evidence record. Failure to verify classification/provenance blocks outbound restricted-data calls.

# 95. R25 — Additive rollout, schema compatibility and historical spec invariants

Implement through a **new versioned package/adapter under Spec 243**, consuming actual repository seams discovered at P243.0. If a historical Spec 1–213 adapter lacks an extension point, record an Improvement Item in §98 and create a backward-compatible **wrapper or new integration route in later code**, never retroactively modify historical spec text or misrepresent certification. For any unavoidable correction to already deployed code, use its independent approved bug/security-fix process; do not disguise a feature rewrite as a compatibility change.

Database changes, if strictly necessary, shall be **additive** and backward compatible (nullable new columns, secondary tables only when no existing canonical slot fits, versioned envelopes) via existing migration ownership. Do not assume an arbitrary `worker_jobs` schema; first compare actual migration journal and Spec 207 billing state. Legacy worker/runner implementations must continue serving their current routes. Staged deployment order: readers accept old+new envelopes; writers continue old; deploy adapters/monitoring; shadow with **no provider-side external effects**, then tenant canary; after evidence, make new writes; remove obsolete paths only after rollback horizon. No dual execution authority for a route generation.

**Spec 224 safe seam:** its in-flight development lifecycle/Final Verify remains untouched. Keep the Spec 243 bridge disabled by default and integrate only after the Spec 224 owner verifies a compatible adapter seam and independent test branch, without altering the active worktree or pretending the blocked/in-progress status is complete. **Spec 242 seam:** use its certified Cloudflare Think/Sandbox placement; reject double-wrapping the same Fiber/Workflow step with competing retry owners. **Spec 232 seam:** incremental family-by-family routing with exact rollback ownership, not global migration.

# 96. R26 — Operator incident, kill switch and provider-offline containment

Create a single **operator runbook** covering both external API and local/native Cloudflare cases. Emergency quarantine must be accessible through an independently authenticated SmartAIHub control channel even if the hosted provider API, webhook endpoint or Think DO is unavailable.

Runbook sequence:

```text
DETECT -> CLASSIFY -> LOCK NEW ADMISSION -> REVOKE PLATFORM TOOL/EGRESS GRANTS
-> FENCE OLD PROVIDER OWNER EPOCH -> FREEZE CHARGEABLE CHILD ALLOCATION
-> REQUEST PROVIDER CANCEL / TERMINATE WHERE AVAILABLE
-> RECONCILE OUTSTANDING SIDE EFFECTS AND LATE WEBHOOKS
-> INVENTORY / REAP ORPHAN COMPUTE -> VERIFY ARTIFACT / DATA HANDLING
-> SETTLE OBSERVED COST -> INDEPENDENT RELEASE-OWNER REVIEW
-> EXPLICIT REENABLE OR FALLBACK
```

Never describe a failed cancel request as successful cleanup. Track `quarantine_reason`, blast radius (provider/account/region/tenant/tool class), stale grant count, unknown external-effect queue, potential continuing spend/hour, provider cleanup attempts, next review deadline, affected mobile approval queue and whether retention/deletion promises remain unverified. When the provider cannot confirm state, preserve `UNKNOWN_EXTERNAL_EFFECT` / `CLEANUP_UNCERTAIN` and do not resume unsafe work elsewhere.

Operator overrides are dual-controlled or explicitly owner-reviewed according to existing Spec 220/Approval risk classes. The final incident postmortem MUST identify whether SDK defaults, retry loops, webhooks, quotas, policy drift, secret egress, native tooling or lost capability provenance caused the event. Restore via version-pinned canary and fresh billing/ACL checks, not simply toggling the feature flag back on.

# 97. New conformance tests C69–C126, plus D11–D18

These tests are **new requirements / NOT EXECUTED**. Earlier C01–C68 and D01–D10 remain mandatory when applicable. Every test records pinned provider API/SDK version, account/entitlement, environment region, test-data class, feature flags, exact trace, canonical job ID, owner epoch and independent verifier signature.

| ID | Scenario / expected result |
|---|---|
| C69 | Non-US-only tenant cannot use current US-only OpenAI managed-session processing despite self-hosted sandbox in-region |
| C70 | ZDR-required task rejects OpenAI and Claude Managed Agents under currently documented non-ZDR terms |
| C71 | Unknown retention/residency/entitlement blocks restricted workload before provider provisioning or upload |
| C72 | OpenAI idle webhook does not complete task; turn and failed-tool items are inspected |
| C73 | OpenAI `action_required` fetches live `required_actions`, binds exact `turn_id`/`call_id` and deduplicates tool result |
| C74 | OpenAI self-hosted environment connection delay/expiry reconciles without duplicate session/turn execution |
| C75 | OpenAI environment key cannot access account-wide application/model/admin APIs |
| C76 | OpenAI session deletion is not incorrectly treated as remote executor termination or billable resource cleanup |
| C77 | Claude webhook delivered out of order yields correct state after resource fetch |
| C78 | Exhausted/missed Claude webhook delivery is detected by independent polling/reconciliation |
| C79 | Claude endpoint disabled on redirect/other documented failure triggers operator alert and no false `COMPLETED` |
| C80 | Claude `idle` and `terminated` map to appropriate nonfinal/final evidence states, not assumed success |
| C81 | Claude session pins agent revision and beta API profile; `latest` drift requires reviewed requalification |
| C82 | Think `authorizeTurn` default-full behavior is explicitly replaced by deny-by-default scoped grants |
| C83 | Think stale action pending-row retry cannot duplicate an irreversible side effect after provider crash |
| C84 | Think durable pause approval requires live SmartAIHub approval digest/epoch and rejects a stale mobile approval |
| C85 | Think native tool/action/MCP name collision cannot bypass the certified effective tool inventory |
| C86 | Think nested wait/stream/continuation is avoided; submit idempotency and messageConcurrency effects are certified |
| C87 | Non-interceptable privileged hosted shell/browser action causes deny before provider provisioning |
| C88 | Read-only hosted profile has verified network/credential constraints; no hidden write route through native tool |
| C89 | Provider subagent inherits only parent-authorized tools/egress despite native auto-tool delegation |
| C90 | Native MCP or internet fallback cannot bypass SmartAIHub tool permission/revocation |
| C91 | Crash after remote create but before ID storage reconciles by authoritative provider inventory, not blind create |
| C92 | Ambiguous duplicate session create parks and flags spend exposure instead of killing arbitrary sessions |
| C93 | Orphan environment/process remains tracked after session deletion, until independent cleanup receipt |
| C94 | Provider outage during reaper leaves `CLEANUP_UNCERTAIN` and bounded audited retries |
| C95 | Nested child cost allocation never exceeds root authorization or double-bills session+turn inference |
| C96 | Late provider invoice after cancel/terminal result reconciles `OBSERVED`/`SETTLED` without silently creating new permission |
| C97 | Joint capacity and credit admission failure compensates partial reservation and launches no sandbox |
| C98 | Quarantine and credit exhaustion stop new paid child work and account for already accrued cleanup spend |
| C99 | Password reset/tenant removal revokes relevant grants while permitted background jobs follow explicit policy |
| C100 | Competing mobile+web approvals resolve to one CAS decision; stale turn cannot execute |
| C101 | Provider transcript-forged principal or approver identity never binds as real SmartAIHub identity |
| C102 | Provider callback with stale security/membership/session-config epoch is observation only |
| C103 | Provider uploads, generated files, session transcripts and local logs have separate deletion tracking |
| C104 | Artifact import validates classification, integrity, scanner status and current authorized owner before R2 publication |
| C105 | Expired provider signed URL never substitutes for a durable signed R2 artifact reference |
| C106 | Completed provider turn with failed tool goes to reconciliation/verify, not canonical `COMPLETED` |
| C107 | Provider session idle with pending user approval is shown `Needs approval`, not `Finished` |
| C108 | Task Control distinguishes `Cancellation uncertain` from `Cleanup confirmed` and pending cost settlement |
| C109 | Think returned final message with missing required artifact cannot pass independent task verification |
| C110 | Expired provider capability attestation blocks newly admitted privileged tasks |
| C111 | Beta event/API drift demotes only affected routes and preserves safe independent provider routes |
| C112 | Tool interception coverage digest changes and forces affected certification before external writes |
| C113 | An unknown price/retention/account entitlement cannot be silently interpreted as free/unrestricted |
| C114 | Prompt-injected fetched document cannot widen MCP permissions or reroute external egress |
| C115 | Provider tool output claiming `Final Verify PASS` is treated as untrusted evidence only |
| C116 | Context-package export rejects revoked/expired/unclassified source even when vector similarity is high |
| C117 | Forged streamed event payload cannot become canonical approval, usage, audit, or job transition |
| C118 | Historical Spec 1–213 files have unchanged digests in proposed PR; improvements live in Spec 243 backlog |
| C119 | Existing deployed producer/consumer read/write compatibility preserved across additive adapter release |
| C120 | Spec 224 bridge enabled only after owner-approved extension-seam test; no active worktree mutation |
| C121 | Shadow/canary/rollback preserve single effect owner and forbid shadow external side effects |
| C122 | Provider API offline quarantine fences platform grants and stops new admission |
| C123 | Billable orphan compute remains tracked through provider outage and eventual settlement |
| C124 | Missing provider callback plus webhook auto-disable triggers reconciliation and operator incident |
| C125 | Emergency re-enable requires version-pinned canary, owner approval and no unresolved unsafe effect |
| C126 | Incident operator override is auditable, role-bounded and cannot bypass tenant restrictions |

**Spec 224 additive bridge tests:** D11 provider idle is not Final Verify; D12 provider completion with failed tool enters review/repair; D13 provider account quarantine does not rewrite active development workflow; D14 partial artifact import preserves source SHA/diff provenance; D15 cross-provider PEC contains only portable execution state; D16 dual-run shadow cannot write protected repo/branch; D17 human approval for deploy is generation-bound across devices; D18 provider session deletion/orphan compute cannot be reported as development completion.

# 98. Additive improvement backlog for earlier specs and companion integrations

This section is an **append-only backlog within Spec 243**; it never changes historical Spec 1–213 documents or asserts historical implementation was incorrect.

| Improvement ID | Existing owner | New compatibility behavior | Implement in |
|---|---|---|---|
| IMP-186/195-MCA-002 | Canonical job control | Provider create intent, unknown-create reconciliation and one effect owner, no second ledger | Spec 243 adapter/PG extension only after schema audit |
| IMP-199-MCA-002 | MCP Gateway | Provider-native tool interception coverage, short-lived external principal grants and tool-name collision check | Spec 243 compatibility bridge |
| IMP-200-MCA-005 | External Agent Gateway | OpenAI and Claude exact webhook/turn/session outcomes + provider inventory/reaper | Spec 243 provider adapters |
| IMP-200-MCA-006 | External Agent Gateway | Separate hosted harness/agent/environment/session version fingerprints and deletion handles | Spec 243 provider adapters |
| IMP-207-MCA-002 | Billing | Hierarchical managed-agent budget plus delayed provider invoice, orphan spend and settlement reconciliation | Spec 243 metering via existing Spec 207 ledger |
| IMP-208/213-MCA-004 | Computer Use | Distinguish provider browser actions from certified SmartAIHub BrowserPool; deny non-interceptable privileged actions | Spec 243 hosted-browser conformance, later CU update if needed |
| IMP-213-MCA-005 | Live certification | Provider browser screenshots/actions cannot reuse P213 certification evidence without independent live tuple | Spec 243 conformance |
| IMP-224-MCA-002 | Development runtime (in progress, NOT historical) | Owner-approved additive adapter only; preserve immutable development lifecycle/Final Verify | Spec 243 integration contract only |
| IMP-242-MCA-001 | CF native runtime | Think Action auth default, pending reclaim behavior, approval resumption and effective tool inventory | Joint Spec 242/243 **integration contract**, not parallel adapters |
| IMP-225/226-MCA-001 | UI / attention/task center | Three status dimensions and honest cleanup/verification/cost display | Versioned UI projection when owner certifies seams |
| IMP-231-MCA-001 | Inference routing | Separate model eligibility from provider harness residency/retention/compute capability | Spec 243 placement input to Spec 231 without duplicate router |
| IMP-238-MCA-001 | Monitoring | Managed provider webhook/polling supports evaluation jobs but not a duplicate monitor scheduler | Spec 243 compatibility with existing Spec 238 |

If Spec 214–223 or later companion specs have already begun implementation, use an additive extension contract instead of in-place edits; determine status from repository evidence, not number alone.

# 99. Required release gates and evidence bundle

| Gate | Mandatory artifact/result | Failure action |
|---|---|---|
| P243.0 Repository | Registry uniqueness, real interface diff, SHA-based historical spec boundary, active Spec 224 worktree ownership | HOLD all mutations |
| P243.1 Policy | Signed provider capability/retention/residency profiles and actual tenant data-class matrix | Restrict route to verified safe class or DENY |
| P243.2 Contract | Model/harness/compute separation; canonical owner/correlation/turn/config epochs; versioned adapters | Mock-only |
| P243.3 Security | Tool-interception matrix, secrets/egress isolation, native-provider tool-bypass tests | No privileged provider route |
| P243.4 Finance | Spec 207 real reservation/settlement/late invoice path, fair capacity broker | No paid production session |
| P243.5 Providers | OpenAI exact webhook+environment lifecycle; Claude out-of-order+loss recovery; Think scoped Actions where enabled | Disable affected provider capability |
| P243.6 Reliability | Orphan-create/delete reaper, external-effect reconciler, PEC failover, independent watchdog | No long-running autonomous production |
| P243.7 Owner bridges | Spec 242 joint tests; Spec 224 owner-approved independent integration tests; historical contract hashes unchanged | Gate only affected path |
| P243.8 UX | Mobile approval cancellation, accurate 3-dimensional status, cost/cleanup evidence | No public launch |
| P243.9 Canary | Synthetic/safely authorized replay -> no-effect shadow -> single-owner low-risk tenant canary | Quarantine/demote on regression |
| P243.10 Final Verify | C01–C126 applicable tests, D01–D18 applicable tests, exact SHA, live receipts, provider account entitlements, rollback/quarantine drill, independent reviewer | Not production-certified |

No gate may be passed solely from documentation or mocks when the gate requires live provider behavior. Account-specific unsupported features are `NOT_APPLICABLE` **only** when the corresponding placement is disabled and the decision is explicit; otherwise `BLOCKED`, not silently `PASS`.

Minimum evidence bundle:

```text
P243_R12_14_ROUND_AUDIT.md
P243_PROVIDER_CURRENT_FACTS.md
P243_IMMUTABLE_BASELINE_DIGESTS.json
P243_CAPABILITY_POLICY_MATRIX.json
P243_PROVIDER_WEBHOOK_EVENT_MAPS.json
P243_TOOL_ENFORCEMENT_MATRIX.json
P243_UNKNOWN_CREATE_REAPER_RUNBOOK.md
P243_BILLING_FINANCE_SAGA.md
P243_DATA_DELETION_PROOF.md
P243_C69_C126_TEST_REPORT.md
P243_SPEC224_ADDITIVE_BRIDGE_D11_D18.md
P243_CANARY_QUARANTINE_ROLLBACK_DRILL.md
P243_FINAL_VERIFY.md
```

# 100. Official sources checked for Revision 1.2 (2026-09-24)

1. OpenAI, Agents API overview (US-only residency and non-ZDR managed sessions; self-hosted exception is **not** ZDR): https://developers.openai.com/api/docs/guides/agents-api/overview
2. OpenAI, Session webhooks (`action_required`, environment connection, idle not success and deletion caution): https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks
3. OpenAI, Managed Agents session events and turns: https://developers.openai.com/api/docs/guides/agents-api/sessions/events
4. OpenAI, Self-hosted sandbox lifecycle and reconnect: https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle
5. Claude Platform, Managed Agents overview/beta/retention: https://platform.claude.com/docs/en/managed-agents/overview
6. Claude Platform, Session operations and versioned Agent refs: https://platform.claude.com/docs/en/managed-agents/session-operations
7. Claude Platform, Managed Agents webhooks, dropped/out-of-order events, subscription timing and disable behavior: https://platform.claude.com/docs/en/managed-agents/webhooks
8. Claude Platform, API and data retention (Managed Agents non-ZDR including self-hosted mode): https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
9. Cloudflare, Think overview, modes and concurrency: https://developers.cloudflare.com/agents/harnesses/think/
10. Cloudflare, Think Actions, default permission behavior and pending retry lease: https://developers.cloudflare.com/agents/harnesses/think/actions/
11. Cloudflare, Think durable recovery: https://developers.cloudflare.com/agents/harnesses/think/recovery/
12. Cloudflare, Think programmatic submissions: https://developers.cloudflare.com/agents/harnesses/think/programmatic-submissions/

**Vendor-doc rule:** these pages support *documented current capabilities* only. They do not prove this user's vendor entitlement, contract, actual deployed behavior, date-specific future pricing, Thai regional eligibility beyond the stated restrictions, or SmartAIHub readiness. Recheck when implementing, not merely when generating the spec.

# 101. Revision 1.2 audit closure and actual certification status

**Document-audit outcome:** Fourteen additional independently mapped rounds R13–R26 identified and patched fourteen material design gaps, bringing the cumulative document-audit ledger to **26 rounds**. The revision also adds C69–C126 (58 new cases), D11–D18 (8 development bridge cases), stronger provider-local failure semantics and explicit release gates.

**This is an audited implementation design, not a claim that tests have run:** `IMPLEMENTED = NO`, `LIVE_PROVIDER_CERTIFIED = NO`, `PRODUCTION_CERTIFIED = NO`, `SPEC_ID_RESERVED_IN_GIT = UNVERIFIED`. All acceptance tests require actual implementation evidence and applicable live, permissioned provider environments.

**Non-negotiable invariants still hold:** no rewrites of Specs 1–213; no modification of Spec 224 in-progress lifecycle/Final Verify; no parallel `worker_jobs`, approval, wallet or Memory source of truth; no unverified high-risk provider tool or region/retention placement; no provider-only completion shortcut; no cross-provider failover without effect fencing and a portable checkpoint.

**END OF SPEC 243**
