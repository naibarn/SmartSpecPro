# Feature 195 — SmartAIHub Unified Async Job Control Plane
## Cloudflare Queues Backbone + Provider Capacity Pools + Universal Execution Monitoring + Spec 196 Integration

**Status:** Implementation Specification  
**Priority:** P0 / Platform Core  
**Feature ID:** 195  
**Recommended path:** `specs/feature/195/spec.md`  
**Supersedes architectural direction:** Feature 187 Worker-only execution interpretation  
**Preserves:** existing `worker_jobs`, `worker_job_events`, lease/idempotency concepts, Unified Job model, SmartAIHub Library, existing product UIs  
**Primary migration target:** `smartspec-node-worker.service` queue/dispatch responsibilities → Cloudflare Queues + Unified Job Control Plane  
**Companion specifications:** Feature 196 — SmartAIHub Goal Orchestration, Capability & Expertise Graph, Solution Optimizer and Universal Command Gateway; Feature 197 — SmartAIHub Runner Adaptive Execution Fabric
**Related specifications:** Feature 198 — Intelligent Chat, Universal Orchestration & Capability Evolution; Feature 199 — External MCP Gateway & Upstream Management; Feature 200 — Universal External Agent Control Plane
**Shared cross-spec contracts:** `SAH-EXEC-1` (durable execution), `SAH-CAP-1` (capability), `SAH-RUNNER-1` (Runner), `SAH-CONTEXT-1` (context), `SAH-ASSET-1` (asset); Feature 195 owns durable `worker_jobs` execution truth.


---

# Relationship with Feature 196

Feature 195, Feature 196 and Feature 197 form three cooperating planes and MUST retain explicit ownership boundaries.

```text
Feature 196
Goal / Intent / Plan / Capability / Solution Selection
        │
        │ Compiled Execution Plan / Job Graph
        ▼
Feature 195
Job / Queue / Capacity / Provider / Runtime / Retry / Billing / Execution Monitoring
        ▲
        │ Runner protocol / execution intelligence contracts
        │
Feature 197
Runner Fabric / Local Capability Discovery / Control / Provenance / Learning Feedback
```

Feature 196 is authoritative for:

- incoming command/context
- Goal
- workflow plan
- capability requirements
- selected Solution Profile
- plan-level approval
- schedule/routine definition
- cross-channel conversation/session continuity
- workflow-run aggregation

Feature 197 is authoritative for the Runner-side architecture contract, local capability discovery model, local runtime topology, execution control protocol semantics, handoff protocol, provenance extensions and experience-learning feedback contract. Feature 197 does not create a second Job source of truth or a second planner.

Feature 195 is authoritative for:

- canonical `worker_jobs`
- execution state
- queue state
- leases
- provider account selection
- slots/capacity
- runtime/node selection
- retries
- actual progress/events
- actual provider/runtime usage
- actual cost settlement
- artifacts produced by execution

No specification may duplicate another plane's source of truth.

Feature 195 MUST remain usable by legacy/internal callers that already know the exact Job/Capability, but new user-facing natural-language orchestration SHOULD enter through Feature 196.

---

# 0. Executive Decision

SmartAIHub MUST have one authoritative asynchronous execution architecture for the entire product.

The target system is:

```text
SmartAIHub Features
      │
      ▼
JobService.create()
      │
      ▼
PostgreSQL / worker_jobs
Canonical Source of Truth
      │
      ▼
Transactional Outbox
      │
      ▼
Cloudflare Queues
Unified Async Dispatch Backbone
      │
      ▼
Admission + Fair Scheduler + Capacity/Slot Manager + Runtime Router
      │
      ├── External Provider Pools
      │     ├── OpenRouter
      │     ├── KIE
      │     ├── fal
      │     ├── WaveSpeed
      │     └── future providers
      │
      ├── SmartAIHub Cloud Runtime
      │     └── Cloudflare Containers
      │
      ├── SmartAIHub Runner Pools
      │     ├── Windows / macOS / Linux
      │     └── Runner-hosted local runtimes
      │           ├── Claude / Codex / Hermes / future Agent CLIs
      │           ├── FFmpeg / FFprobe / Remotion
      │           ├── ComfyUI / Local AI
      │           ├── Browser / Desktop control
      │           ├── local MCP servers
      │           └── custom CLI/runtime adapters
      │
      ├── SmartAIHub Worker
      │     └── existing UI-based desktop Worker during migration
      │
      └── Direct / Managed Execution Backends
            ├── external provider APIs
            ├── Cloudflare Containers
            ├── server runtimes
            └── genuinely remote/cloud Agent services
```

The central rule is:

> **Every asynchronous execution is a SmartAIHub Job. Cloudflare Queues transports dispatch work, but PostgreSQL remains the source of truth.**

The system MUST NOT create separate canonical job systems for:

- providers
- Runner
- Worker
- Cloudflare Containers
- Hermes
- Claw runtimes
- Skills
- Agents
- ComfyUI
- FFmpeg
- media generation
- automations

---

# 1. Background and Existing System

SmartAIHub already has:

- `worker_jobs`
- `worker_job_events`
- lease concepts
- heartbeat concepts
- idempotency concepts
- `smartspec-node-worker.service`
- Celery / Redis paths
- Celery Beat
- BullMQ / Redis paths
- background skill execution
- background agent execution
- media generation
- local Worker jobs
- FFmpeg / rendering
- ComfyUI
- Local AI
- MCP
- scheduler / automations
- external provider APIs

The previous architecture direction already establishes:

1. canonical Job model
2. PostgreSQL as source of truth
3. queue is transport, not truth
4. feature layer must not call broker directly
5. UI must not know infrastructure details
6. no permanent parallel “Worker v2”
7. one Job Detail / one status vocabulary / one artifact integration

Feature 195 keeps these principles and expands them into the platform-wide async backbone.

---

# 2. Problem Statement

The existing `smartspec-node-worker.service` currently carries responsibilities that will not scale cleanly if they remain tied to one process or one server.

These responsibilities include:

- accepting queued jobs
- waiting for provider capacity
- preparing execution slots
- calling external providers
- dispatching local Worker jobs
- dispatching render jobs
- dispatching ComfyUI
- running background Skills
- running background Agents
- coordinating scheduled work
- processing callbacks/results
- handling retry
- handling timeouts
- tracking long-running work
- preventing synchronous request timeout

Future requirements increase the load:

- 100–1,000+ SmartAIHub users/accounts
- multiple provider accounts per provider
- dynamic provider capacity
- rate-limit-aware routing
- multiple local Runners
- Cloudflare Container execution
- Hermes / AutoClaw / OpenClaw
- more Skills/Agents
- more media providers
- more background automation
- more tenant/partner traffic

If provider account selection, slot limits, queueing, retry and rate-limit handling are implemented separately inside each feature/provider, SmartAIHub will accumulate many independent schedulers.

Feature 195 prevents that.

---

# 3. Goals

## 3.1 Primary Goals

1. Move platform-wide async dispatch to Cloudflare Queues.
2. Keep PostgreSQL/`worker_jobs` authoritative.
3. Replace the queue/dispatch role of `smartspec-node-worker.service` incrementally.
4. Make all non-trivial background work asynchronous.
5. Centralize provider capacity and account selection.
6. Support up to 5 configured provider accounts initially without schema redesign.
7. Allow accounts to be activated/deactivated gradually according to load.
8. Support account-specific and model-specific rate limits.
9. Prevent rate limit issues from becoming feature-specific bugs.
10. Support SmartAIHub Worker, SmartAIHub Runner and Cloudflare Containers through one execution model.
11. Support Hermes / AutoClaw / OpenClaw and future agents as execution runtimes.
12. Provide fairness among users/tenants.
13. Centralize retries, backoff, idempotency, DLQ and circuit breakers.
14. Avoid HTTP request timeout by returning Job IDs quickly.
15. Provide one Web UI to observe and tune the whole execution system.
16. Make operational thresholds adjustable without source-code changes.
17. Preserve existing Media Studio, Video Edit, Agent, Plugin and Automation UX.
18. Allow full Cloudflare migration later without redesigning Job contracts.

---

# 4. Non-Goals

Feature 195 does NOT require:

- migrating the entire SmartAIHub backend to Cloudflare immediately
- replacing PostgreSQL immediately
- deleting SmartAIHub Worker immediately
- moving GPU workloads to Cloudflare
- forcing all providers to use identical rate-limit semantics
- creating one physical Queue for every account
- creating one Container per job
- keeping Cloudflare Containers alive while waiting on external APIs
- replacing SmartAIHub Library
- redesigning revenue-sharing business rules
- requiring end users to understand Cloudflare
- requiring macOS users to install Xcode
- requiring end users to use GitHub
- bypassing provider contractual or account/rate-limit rules

---

# 5. Core Architecture Principles

## 5.1 Single Canonical Job

Every execution is represented by a canonical `worker_jobs` record.

Do NOT create:

```text
provider_jobs_v2
runner_jobs
cloud_jobs
agent_jobs_v2
comfyui_jobs_v2
media_jobs_new
```

unless a table is only a specialized child/detail record linked to canonical `worker_jobs`.

---

## 5.2 PostgreSQL Is Source of Truth

Cloudflare Queues MUST NOT become the authoritative job database.

Authoritative fields include:

- status
- ownership
- progress
- execution assignment
- attempt
- lease
- external provider ID
- result
- error
- billing reference
- timestamps

Queue messages are disposable transport envelopes.

---

## 5.3 Async by Default

Any work that may exceed a normal interactive request duration SHOULD become async.

Examples:

- image generation
- video generation
- audio generation
- music generation
- LLM batch work
- long LLM/agent work
- Skill execution
- Agent execution
- FFmpeg
- Remotion
- ComfyUI
- model inference
- file conversion
- document parsing
- web research
- browser automation
- scheduled tasks
- webhook-driven media workflows

Frontend request pattern:

```text
POST action
  ↓
create Job
  ↓
return 202 / Job ID quickly
  ↓
background execution
  ↓
SSE/WebSocket status
```

---

## 5.4 Queue Is Dispatch, Not Execution Lease

A Queue delivery MUST NOT be treated as the full lifetime lock of a long-running Job.

Correct pattern:

```text
Queue delivery
  ↓
validate canonical Job
  ↓
reserve required capacity
  ↓
assign/claim Job
  ↓
create SmartAIHub execution lease
  ↓
ACK dispatch message
  ↓
long execution continues under Job lease/heartbeat/watchdog
```

This prevents a long render or agent run from depending on Queue visibility semantics.

---

## 5.5 Late Binding of Provider Account

A Job normally requests:

```text
provider = KIE
capability = video.generate
model = ...
```

It SHOULD NOT request:

```text
provider_account = KIE-03
```

Provider account selection happens at dispatch time so the system can respond to:

- active capacity
- 429 responses
- account health
- quota
- current concurrency
- account enable/disable
- newly activated accounts
- provider latency
- budget policy

Admin/debug override may explicitly pin an account.

---

# 6. Target Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                            SmartAIHub Web                               │
│ Media Studio | Video Edit | Agents | Plugins | Skills | Automations    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │      JobService      │
                     │ create/query/cancel  │
                     └──────────┬───────────┘
                                │ transaction
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL — Source of Truth                         │
│ worker_jobs | worker_job_events | steps | artifacts | leases | outbox  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
                       Transactional Outbox
                                │
                                ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                    Cloudflare Queues Backbone                           ║
║ Dispatch lanes / retry / delay / DLQ                                   ║
╚═══════════════════════════════╤══════════════════════════════════════════╝
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Unified Job Control Plane                            │
│                                                                          │
│ Admission Controller                                                     │
│ Fair Scheduler                                                           │
│ Provider Pool Manager                                                    │
│ Provider Rate Limit Manager                                              │
│ Slot / Capacity Manager                                                  │
│ Circuit Breaker                                                          │
│ Runtime Router                                                           │
│ Watchdog                                                                 │
│ Billing/Meter                                                            │
└───────────────┬───────────────────┬──────────────────┬───────────────────┘
                │                   │                  │
                ▼                   ▼                  ▼
     External Provider Pool   Execution Nodes      Agent Runtimes
     OpenRouter               CF Containers         Hermes
     KIE                      Runner                AutoClaw
     fal                      Worker                OpenClaw
     WaveSpeed                ComfyUI               Skills/Agents
     future                   FFmpeg/Remotion       Automations
```

---

# 7. Cloudflare Queue Topology

The platform has one logical Async Backbone, but SHOULD use multiple physical lanes to avoid head-of-line blocking.

Initial lanes:

```text
sah-dispatch-priority
sah-dispatch-default
sah-provider-dispatch
sah-media-render
sah-local-runtime
sah-agent-runtime
sah-maintenance
sah-dispatch-dlq
```

The feature layer MUST NOT know which physical lane a Job uses.

Queue routing belongs to the Control Plane.

---

# 8. Logical Queue Classes

Every Job SHOULD have:

```text
queue_class
```

Suggested values:

```text
interactive
priority
default
provider
media
render
local
agent
automation
maintenance
```

Queue class is NOT provider account identity.

---

# 9. Queue Lane Rules

## 9.1 Priority Lane

Use for:

- short user-visible operations
- critical continuation events
- approval continuation
- callback continuation

Must not be used for arbitrary heavy batch work.

## 9.2 Provider Lane

Use for:

- OpenRouter admission
- KIE submission
- fal submission
- WaveSpeed submission
- future external API submission

The provider consumer should remain short-lived:
reserve capacity → submit → persist provider request ID → ACK.

## 9.3 Render Lane

Use for:

- FFmpeg
- Remotion
- proxy/export
- media transformations

## 9.4 Local Runtime Lane

Use for:

- Runner
- existing Worker
- ComfyUI
- local AI
- host-specific tools

## 9.5 Agent Runtime Lane

Use for:

- Hermes
- AutoClaw
- OpenClaw
- long-running Agent sessions
- background Skills/Agents

---

# 10. Queue Message Envelope

Queue payload MUST be small and reference canonical state.

Example:

```json
{
  "schema": "sah-dispatch/1",
  "message_id": "msg_...",
  "job_id": "job_...",
  "tenant_id": "tenant_...",
  "queue_class": "provider",
  "dispatch_reason": "initial",
  "attempt": 1,
  "not_before": null,
  "trace_id": "trace_...",
  "created_at": "..."
}
```

Do NOT put:

- API keys
- large prompts when avoidable
- large files
- binary media
- provider secrets
- full user credentials

into Queue messages.

Consumer reads Job details from canonical storage/API.

---

# 11. Transactional Outbox

To prevent:

```text
DB commit success
Queue send failure
```

every dispatchable state transition MUST write an Outbox record in the same DB transaction.

Flow:

```text
BEGIN
  create/update worker_job
  insert job_outbox_event
COMMIT

Outbox Publisher
  ↓
Cloudflare Queue
  ↓
mark outbox published
```

Outbox publishing MUST be idempotent.

---

# 12. Outbox Table

Logical contract (the current canonical implementation table is `worker_job_outbox`; this section does not authorize a second outbox table):

```text
worker_job_outbox
```

Fields:

```text
outbox_id
job_id
event_type
queue_class
payload_json
dedupe_key
status
publish_attempt
next_attempt_at
created_at
published_at
last_error
```

Unique constraint:

```text
dedupe_key
```

where appropriate.

---

# 13. Inbox / Consumer Dedupe

Cloudflare Queue delivery can be redelivered.

Consumer MUST check idempotency before executing dispatch side effects.

The current implementation uses `worker_job_dispatches` for dispatch identity/state together with event/action idempotency. A separate inbox table is not required by this specification and MUST NOT be introduced merely because the logical concept is called an inbox. The following is a logical record shape; it is not a requirement that these names become columns on `worker_job_dispatches`:

```text
worker_job_dispatches
```

Fields:

```text
message_id
job_id
consumer_name
received_at
processed_at
result
```

or use an equivalent atomic dedupe mechanism.

---

# 14. Queue ACK Semantics

ACK after the dispatch responsibility is durably transferred.

Examples:

## External provider

```text
reserve submission capacity
submit provider
persist provider_job_id + waiting_external
release submission lease if appropriate
ACK
```

## Runner/Worker

Cloudflare Queue is consumed by SmartAIHub-controlled dispatch infrastructure, not by an end-user Runner/Worker directly.

```text
Queue consumer validates Job
→ persist dispatch-ready state / eligible execution-pool intent
→ emit lightweight work-available wake through SmartAIHub Runner/Worker protocol
→ ACK Queue message after durable dispatch responsibility transfer
→ eligible Runner/Worker calls `lease_next()` with current capability/resource snapshot
→ Core atomically selects Job + Runner under fairness/policy/isolation rules
→ create work offer / claim record and execution lease with fencing token
→ Runner/Worker starts execution
```

If no eligible Runner claims work, the Job remains `waiting_resource`/dispatch-ready under canonical DB state. Targeted assignments may still use an assignment-claim deadline; expiry returns the Job to its eligible pool through Outbox/Dispatcher recovery.

## Cloudflare Container

```text
Queue consumer validates Job
→ persist runtime assignment / instance intent
→ start or wake compatible Container
→ ACK after durable ownership transfer
→ Container claims execution lease
```

Do not hold a Queue message open while waiting for a local device or Container to finish long work.

Do not hold Queue message for full render/agent/provider runtime.

---

# 15. Retry Categories

Separate:

```text
dispatch retry
execution retry
provider retry
workflow continuation retry
```

They are not the same.

## Dispatch Retry

Cannot transfer Job to a valid executor.

## Execution Retry

Executor claimed Job but failed.

## Provider Retry

External API submission or provider processing failed.

## Workflow Retry

Orchestration step failed.

Each has separate attempt counters/policies.

---

# 16. Dead Letter Queue Semantics

DLQ means:

> the dispatch/event message could not be processed safely after configured delivery retries.

DLQ does NOT mean:

> the user Job failed normally.

User Job failure remains:

```text
worker_jobs.status = failed
```

Every production Queue lane SHOULD define a DLQ.

DLQ UI must show:

- message ID
- Job ID
- queue/lane
- delivery attempts
- error
- first/last failure
- replay action
- discard action with audit

---

# 17. Cloudflare Queue Platform Constraints

Implementation must isolate Cloudflare-specific constraints behind the Queue Adapter.

As verified for the current Cloudflare platform (September 2026):

- push and HTTP pull consumers are supported
- HTTP pull consumers can run outside Cloudflare Workers
- multiple concurrent pull consumers may pull one queue
- a queue has one consumer type at a time
- retries, delays and DLQ are supported
- delayed send/retry can be used for backpressure
- pull visibility timeout is configurable
- platform limits may change

Do NOT hard-code current Cloudflare limits into core domain logic.

---

# 18. Queue Consumer Strategy

Choose **one consumer type per physical Cloudflare Queue**. Do not configure push and HTTP pull simultaneously on the same Queue.

## Push Consumer

Preferred for SmartAIHub-managed lanes that perform:

- fast admission
- provider submission
- short DB transitions
- event handling
- callback continuation
- lightweight routing
- durable dispatch-ready/work-offer creation for Runner/Worker and durable runtime assignment intent for Container

## HTTP Pull Consumer

Use only for **SmartAIHub-controlled infrastructure** outside Cloudflare where pull-rate control is operationally useful, such as a platform-owned dispatch bridge or managed GPU fleet.

HTTP Pull MUST NOT be the authentication mechanism for an end-user SmartAIHub Runner/Worker. Cloudflare Queue API bearer tokens MUST NOT be distributed to user devices.

Local Runner/Worker flow:

```text
Cloudflare Queue
  ↓
SmartAIHub-controlled Queue Consumer / Dispatch Gateway
  ↓
canonical dispatch-ready / eligible-pool state in PostgreSQL
  ↓ work.available wake (optional fast path)
Runner Protocol (WSS/HTTPS lease API)
  ↓ lease_next() / atomic match + claim
SmartAIHub Runner / legacy Worker
```

Physical node preassignment is NOT the default. It is reserved for pinned-device, local-artifact affinity, interactive-session affinity, exclusive-hardware or equivalent targeted cases.

Runner/Worker authenticates with its SmartAIHub device credential and can only lease Jobs authorized for that device/user/tenant.

---

# 19. Provider Capacity Management — Overview

Provider capacity management is a P0 subsystem.

Components:

```text
Provider Registry
Provider Account Pool
Capability/Model Limit Registry
Rate Limit Manager
Slot Manager
Health Monitor
Circuit Breaker
Load Balancer
Budget Guard
Telemetry
```

All provider adapters MUST use this system.

---

# 20. Provider Registry

Suggested table:

```text
providers
```

Fields:

```text
provider_id
code
display_name
enabled
adapter_id
health
default_timeout_seconds
supports_webhook
supports_polling
metadata_json
created_at
updated_at
```

Examples:

```text
openrouter
kie
fal
wavespeed
```

---

# 21. Provider Account Pool

Suggested table:

```text
provider_accounts
```

Fields:

```text
provider_account_id
provider_id
display_name

enabled
activation_mode
state

priority
weight

credential_ref

budget_policy_id
health_state
circuit_state
cooldown_until

created_at
updated_at
```

Initial product policy:

```text
max configured accounts per provider = 5
```

The database design MUST NOT assume exactly five rows.

Allow future increase without schema migration.

---

# 22. Provider Account States

```text
standby
activating
active
draining
cooldown
degraded
circuit_open
disabled
error
```

Definitions:

## standby
Configured but not participating in scheduling.

## active
Eligible for new work.

## draining
No new Jobs; existing in-flight work finishes.

## cooldown
Temporarily removed due to 429/backoff/quota signal.

## degraded
Still usable according to policy but with reduced score/capacity.

## circuit_open
No new work until recovery policy succeeds.

---

# 23. Provider Account Activation

Initial mode:

```text
manual activation
```

Future:

```text
auto capacity activation
```

Example:

```text
KIE-01 Active
KIE-02 Active
KIE-03 Standby
KIE-04 Standby
KIE-05 Standby
```

When load grows:

```text
activate KIE-03
```

The Scheduler immediately sees increased eligible capacity.

No feature code changes.

---

# 24. Multi-Account Policy Safety

Multi-account support is an operational capacity feature.

It MUST be used only when:

- provider account structure permits it
- contractual terms permit it
- credentials belong to authorized SmartAIHub/provider accounts
- it is not used to circumvent prohibited limits or restrictions

Admin metadata SHOULD allow:

```text
provider_policy_notes
terms_verified_at
account_scope
```

---

# 25. Provider Limits Model

Suggested table:

```text
provider_account_limits
```

Fields:

```text
limit_id
provider_account_id

capability
model_pattern
endpoint_pattern

max_concurrency

rpm
rph
rpd

tpm
tph
tpd

daily_job_limit
monthly_job_limit

max_inflight_processing

reset_policy_json
effective_from
effective_to

metadata_json
```

Null means unknown/not enforced by SmartAIHub for that dimension.

---

# 26. Hierarchical Limit Resolution

Rate/slot policy may exist at:

```text
provider
  ↓
account
  ↓
capability
  ↓
model
  ↓
endpoint
```

Most specific applicable policy wins, optionally combined with parent caps.

Example:

```text
KIE account max concurrent = 20
KIE video max concurrent   = 5
KIE specific model max     = 3
```

Effective model capacity:

```text
min(all active applicable limits)
```

---

# 27. Two Different Slot Types

The system MUST distinguish:

## Submission Capacity

Controls:

- RPM
- TPM
- request burst
- API admission

Usually short-lived.

## Processing Capacity

Controls:

- concurrent provider jobs
- GPU jobs
- ComfyUI jobs
- FFmpeg renders
- Container workloads
- agent sessions

Usually held longer.

Never merge them into one ambiguous counter.

---

# 28. Slot Lease Table

Suggested:

```text
capacity_leases
```

Fields:

```text
lease_id
job_id

resource_kind
provider_id
provider_account_id
execution_node_id
runtime_instance_id

capability
model

slot_type
quantity

state

reserved_at
activated_at
heartbeat_at
expires_at
released_at

metadata_json
```

`slot_type` examples:

```text
submission_request
submission_token
provider_processing
gpu
render
container
agent_session
browser_session
```

---

# 29. Slot Leases, Not Counters

Do NOT only implement:

```text
active_slots += 1
active_slots -= 1
```

because crashes cause capacity leaks.

Lease must expire/reconcile.

Reconciler detects:

- Job terminal but lease active
- lease expired but Job running
- provider callback received but processing slot not released
- node disconnected with active slots
- duplicate slot reservation

---

# 30. Rate Limit Counters

Rate-limit windows MAY use a fast distributed counter store, but PostgreSQL SHOULD retain audit/summary data.

Possible fast implementation:

- Durable Object per provider/account
- Redis during migration
- another atomic counter backend

The abstraction MUST be:

```text
RateLimitStore
```

not hard-coded into provider adapters.

---

# 31. Provider Account Selection

Use capacity-aware weighted scheduling.

Selection score SHOULD consider:

```text
enabled
state
free_processing_capacity
request_capacity_remaining
token_capacity_remaining
health
recent_429_rate
recent_failure_rate
latency
priority
weight
daily/monthly budget
model support
regional/provider constraints
```

Simple round robin alone is insufficient.

---

# 32. Late Binding

Do not bind account during Job creation.

Bind at the last safe moment before provider submission.

Reason:

- capacity changes
- cooldown changes
- account activation changes
- quota changes
- health changes
- load changes

Persist selected account after reservation for audit/billing.

---

# 33. 429 Handling

Provider adapter MUST normalize HTTP 429 / equivalent into:

```text
RATE_LIMITED
```

and report:

```text
provider
provider_account_id
model/capability
retry_after
limit_scope if known
response metadata safe for logs
```

Control Plane action:

```text
update rate model
possibly cooldown account/model
release/reschedule Job
select another eligible account when policy permits
```

Do NOT simply mark every 429 Job terminally failed.

---

# 34. Dynamic Backoff

Backoff sources:

1. explicit Retry-After
2. provider reset headers
3. provider-documented windows
4. observed adaptive policy
5. default exponential backoff with jitter

Job event:

```text
provider.rate_limited
```

UI should show:

```text
Waiting for provider capacity
```

not raw 429 for normal users.

---

# 35. Circuit Breaker

Circuit breaker scope can be:

```text
provider
provider_account
provider_account + capability
provider_account + model
```

States:

```text
closed
open
half_open
```

Open conditions configurable from:

- consecutive failures
- error rate
- repeated auth errors
- repeated 429 beyond expected
- provider outage
- healthcheck failure

---

# 36. Half-Open Probe

After cooldown:

```text
circuit_open
  ↓
half_open
  ↓
limited probe traffic
  ├── success → closed
  └── failure → open
```

Do not send normal full traffic to an unverified recovered account.

---

# 37. Provider Health Scoring

Suggested health inputs:

```text
success_rate_5m
success_rate_1h
p50_latency
p95_latency
429_rate
5xx_rate
auth_error_rate
timeout_rate
callback_delay
poll_delay
quota_remaining
```

Score is operational guidance, not user-facing provider quality ranking.

---

# 38. Budget Guard

Provider account can have:

```text
hourly_budget
daily_budget
monthly_budget
soft_budget
hard_budget
```

At soft limit:

```text
warn / reduce weight / recommend standby account policy
```

At hard limit:

```text
stop new reservation
route elsewhere or queue
```

---

# 39. Fair Scheduling

At 100–1,000 users, FIFO alone is insufficient.

Scheduling hierarchy:

```text
priority
  ↓
tenant fairness
  ↓
user fairness
  ↓
project/job policy
  ↓
capability queue
  ↓
capacity selection
```

Recommended approach:

- Weighted Fair Queueing or Deficit Round Robin
- configurable weights
- per-tenant burst caps
- per-user active-job caps
- starvation prevention

---

# 40. Fairness Fields

Job scheduling metadata:

```text
priority_class
tenant_weight
user_weight
queue_entered_at
fairness_virtual_time
cost_estimate
resource_weight
```

Do not persist implementation-specific scheduling math if it makes migrations difficult; only persist what is needed for recovery/audit.

---

# 41. Starvation Prevention

A low-weight Job must not wait forever.

Use:

- aging
- max wait promotion
- reserved minimum share where appropriate

Admin UI SHOULD show:

```text
oldest queued job
P95 wait by plan/tenant
starvation warnings
```

---

# 42. Plan-Based Scheduling

Optional future policy:

```text
Free       weight 1
Standard   weight 2
Pro        weight 4
Enterprise configurable
```

This MUST remain policy-driven, not hard-coded into Queue consumers.

---

# 43. Canonical Job Lifecycle

Recommended states:

```text
created
queued
admission_wait
waiting_resource
assigned          # targeted/legacy assignment only
claimed
starting
running
waiting_child_job
waiting_provider_capacity
waiting_external
waiting_permission
paused
validating
retrying
draining
completed
failed
cancel_requested
cancelled
node_lost
expired
```

Adapters may have internal states, but UI/canonical state must map here.

---

# 44. State — `admission_wait`

Use when Job exists but cannot yet enter dispatch because of:

- tenant cap
- user cap
- budget
- queue policy
- maintenance
- global safety gate

---

# 45. State — `waiting_provider_capacity`

Use when:

- provider selected or constrained
- no eligible account/slot currently available
- system expects capacity later

This is not a provider failure.

---

# 46. State — `waiting_external`

Use after provider accepted async request.

Example:

```text
KIE accepted task ID
status = waiting_external
```

No active Container/Runner required solely for waiting.

---

# 47. External Provider Async Pattern

Standard provider lifecycle:

```text
queued
  ↓
reserve submission capacity
  ↓
submit
  ↓
provider request/task ID
  ↓
persist provider execution record
  ↓
waiting_external
  ↓
ACK dispatch
  ↓
callback/webhook OR workflow polling
  ↓
result ready
  ↓
ingest artifact
  ↓
completed
```

---

# 48. Webhook-First Policy

For providers that support callback:

```text
webhook first
polling fallback
```

Webhook handler MUST:

- authenticate/verify signature if provider supports it
- dedupe
- locate provider execution
- update canonical Job
- signal Workflow if one is waiting
- enqueue post-processing if needed
- return quickly

---

# 49. Polling Fallback

Use only when:

- callback deadline exceeded
- provider lacks callback
- callback is unreliable
- recovery/reconciliation needs status

Backoff:

```text
short initial
increasing interval
bounded maximum
jitter
```

Do not keep a Worker/Container busy sleeping between polls.

---

# 50. Cloudflare Workflows Role

Use Workflows for durable orchestration that includes waiting.

Examples:

```text
submit external provider
wait for event/callback
timeout
poll
download result
postprocess
finalize
```

Use Workflows when a durable multi-step state machine is valuable.

Do not move canonical Job truth into Workflow state.

Workflow instance ID MUST link to `worker_jobs`.

---

# 51. Provider Execution Record

Suggested table:

```text
provider_executions
```

Fields:

```text
provider_execution_id
job_id
attempt

provider_id
provider_account_id
model
capability

provider_request_id
provider_status

submitted_at
callback_deadline_at
last_polled_at
completed_at

submission_latency_ms
external_processing_ms

cost_estimate
cost_actual

result_metadata_json
error_code
error_summary
```

---

# 52. OpenRouter Capacity Model

OpenRouter/LLM traffic may need:

- RPM
- TPM
- concurrent streams
- model route restrictions
- token budgets
- account budget
- retry/fallback policies

Slot Manager MUST NOT model LLM traffic as only `active_jobs`.

Admission may reserve:

```text
request unit
estimated tokens
stream concurrency
```

Then reconcile actual tokens.

---

# 53. KIE / fal / WaveSpeed Capacity Model

Media providers may expose:

- submission limits
- concurrent processing limits
- webhook/callback
- task IDs
- polling endpoints
- model-specific quotas

Adapter declares a capability/limit profile.

Core does not hard-code provider names into scheduling algorithms.

---

# 54. Provider Adapter Contract

```text
discover_capabilities()
healthcheck(account)
normalize_limits()
estimate(job)
reserve_requirements(job)

submit(job, account)
query_status(provider_request_id)
cancel(provider_request_id) optional

verify_callback(request)
parse_callback(request)

normalize_error(error)
estimate_cost(job)
finalize_cost(result)
```

Provider-specific logic stays in adapter.

Scheduling stays in Control Plane.

---

# 55. Execution Backend Abstraction

Canonical:

```text
ExecutionBackend
```

Implementations:

```text
ProviderExecutionBackend
ExternalAgentExecutionBackend
OutboundConnectorExecutionBackend
LegacyWorkerExecutionBackend
RunnerExecutionBackend
CloudflareContainerExecutionBackend
LegacyCeleryExecutionBackend
LegacyBullMQExecutionBackend
ServerRuntimeExecutionBackend
```

Contract:

```text
discover()
healthcheck()
capabilities()
estimate(job)
reserve(job)
assign(job)
start(job)
heartbeat()
stream_events()
cancel(job)
drain()
collect_artifacts()
cleanup()
runtime_metrics()
```

---

# 56. Execution Node Model

Use generic concept:

```text
execution_node
```

Node kinds:

```text
legacy_worker
runner
cloud_container
server_runtime
agent_runtime   # only for genuinely direct/remote managed agent runtime
```

Runner-hosted Claude/Codex/Hermes/local Agent processes are subordinate local runtime sessions and MUST NOT be registered as separate `agent_runtime` execution nodes by default.

Existing `worker_nodes` may remain physical table initially but SHOULD be logically wrapped/migrated.

---

# 57. Execution Node Fields

Suggested:

```text
execution_nodes
```

Fields:

```text
node_id
tenant_id
owner_user_id
node_kind
display_name

platform
architecture

host_version
protocol_version

state
health

drain_mode
disabled

last_heartbeat_at
last_progress_at
last_job_at

resource_profile_json
metadata_json

created_at
updated_at
```

---

# 58. SmartAIHub Worker Role

Existing SmartAIHub Worker remains:

- desktop application
- has UI
- local capabilities
- migration compatibility layer

It SHOULD progressively become:

```text
LegacyWorkerExecutionBackend
```

and share canonical Job/Capability/Runtime contracts.

Do not delete immediately.

---

# 59. SmartAIHub Runner Role

SmartAIHub Runner is the new lightweight headless runtime.

Responsibilities:

```text
Connection Manager
Device Pairing
Job Lease Client
Capability Scanner
Runtime Package Manager
OCI Engine
Native Runtime Engine
Process Supervisor
Watchdog
Resource Monitor
Artifact Client
Event Reporter
Self Updater
Local Execution Journal
```

Primary UI remains SmartAIHub Web.

---

# 60. Runner Installation

User flow:

```text
smartaihub.app
  ↓
Execution / Devices
  ↓
Install SmartAIHub Runner
  ↓
download signed installer
  ↓
pair
  ↓
ready
```

End user does NOT need:

- GitHub
- Xcode
- Rust
- Go
- Python toolchain
- Node toolchain

---

# 61. Runner Build/Release

Build infrastructure:

```text
GitHub tag
  ↓
GitHub Actions
  ├── Windows
  ├── Linux
  └── macOS hosted runner
       ├── build
       ├── sign
       └── notarize
  ↓
R2 / SmartAIHub release registry
```

User-facing URL:

```text
downloads.smartaihub.app
```

GitHub repository can remain private.

---

# 62. Runner Self Update

Host update lifecycle:

```text
available
download
verify checksum/signature
stage
drain
activate
healthcheck
commit OR rollback
```

Channels:

```text
stable
beta
nightly
```

---

# 63. Runtime Packages

Frequently changing capabilities MUST be outside Runner Host.

Examples:

```text
media-utils
video-render
remotion-render
hermes-runtime
document-runtime
browser-runtime
code-sandbox
comfyui-runtime
local-ai-runtime
```

Package types:

```text
OCI
native signed
configuration/skill
```

---

# 64. Runtime Package Manifest

Example:

```yaml
id: video-render
version: 2.0.0

capabilities:
  - media.ffmpeg
  - media.ffprobe
  - media.render

execution:
  cloudflare: true
  oci: true
  native: false

platforms:
  - linux/amd64
  - linux/arm64

resources:
  cpu_min: 2
  memory_min_mb: 4096
  gpu: false

concurrency:
  default: 1

protocol:
  version: sah-runtime/1
```

---

# 65. Runtime Package Versioning

Never depend on `latest` in production.

Persist:

```text
package_id
version
digest
channel
compatibility
```

Support:

```text
install
update
rollback
pin
unpin
```

---

# 66. Cloudflare Containers Role

Cloudflare Containers are an execution backend, not the Queue/Control Plane.

Initial SmartAIHub Core may remain on Debian.

Flow:

```text
Debian SmartAIHub Core
  ↓
Cloudflare Queue/Controller
  ↓
Cloudflare Container
```

No full-platform migration required first.

---

# 67. Cloud Runtime Controller

Responsibilities:

- authenticate Core
- select runtime class
- start/wake instance
- track instance ID
- expose health
- enforce lifecycle caps
- enforce cost guards
- route execution
- stop/drain/destroy
- emit events

It MUST NOT own canonical Job state.

---

# 68. Cloud Runtime Types

## `media-utils-runtime`

- ffprobe
- thumbnails
- metadata
- light transformations

Mode:

```text
shared_stateless_pool
```

## `video-render-runtime`

- FFmpeg
- concat
- subtitles
- watermark
- transcode
- mix
- rough-cut postprocess

Mode:

```text
queue_draining_worker
```

Concurrency:

```text
1 heavy render / instance
```

## `remotion-render-runtime`

Separate image because Node/Chromium dependencies are heavy.

## `document-runtime`

Shared/stateless CPU processing.

## `hermes-runtime`

Session-isolated.

## `code-sandbox-runtime`

Job/session-isolated.

## `browser-runtime`

Optional.

---

# 69. Container Image Policy

Do not create one giant image.

Each runtime image:

```text
Dockerfile
runtime manifest
entrypoint
health endpoint
structured logs
progress protocol
SIGTERM handling
workspace policy
artifact upload
version metadata
```

Dependencies SHOULD be baked at build time.

---

# 70. Cloudflare Container Scheduling

For render initial policy:

```text
normal instances = 1
burst max = 2
hard max = 2 initially
1 heavy job / instance
oldest queue wait before scale = 15m
idle grace = 3m
```

These are defaults, not constants.

---

# 71. Health Before Scale

Before starting an additional render Container:

1. inspect current worker heartbeat
2. inspect last progress
3. inspect active render ETA
4. verify not stalled
5. verify cost guard
6. verify hard cap
7. verify real backlog

If current instance is stalled:

```text
recover/recycle first
```

Do not hide failure by scaling out.

---

# 72. FFmpeg Progress

Run with machine-readable progress.

Track:

```text
out_time
speed
fps
frame
total_size
```

ETA when confidence exists:

```text
remaining_media_time / speed
```

Historical performance profile:

```text
runtime version
instance type
codec
preset
resolution
fps
filter profile
```

---

# 73. Container Watchdog

Track separately:

```text
last_heartbeat_at
last_progress_at
job_started_at
instance_started_at
```

Initial configurable render defaults:

```text
heartbeat             30s
progress report        30–60s
suspect no progress    3m
hard no progress       5m
startup ready deadline 60s
```

---

# 74. Container Recycle

Configurable:

```text
max jobs per instance
max instance age
recycle on OOM
recycle on repeated child process failure
recycle after stall recovery
```

Suggested starting points:

```text
30 jobs
6h max age
```

---

# 75. Container Cost Guards

Per runtime class:

```text
normal target
burst max
absolute max
max starts / time window
max runtime minutes/hour
hourly estimated cost
daily estimated cost
max job runtime
max instance age
```

If hard guard reached:

```text
leave jobs queued
alert admin
allow healthy active jobs to finish
do not start more
```

---

# 76. Hermes / AutoClaw / OpenClaw

Treat each as Agent Runtime, not independent scheduler.

Example:

```text
Job
job_class = agent
capability = agent.hermes
```

Runtime Router may choose:

```text
Cloudflare Container
SmartAIHub Runner
server runtime
```

Agent can spawn child Jobs:

```text
FFmpeg
ComfyUI
Browser
Media generation
Skill
```

All child Jobs return to Unified Job Control Plane.

---

# 77. Agent Session vs Job

```text
Session != Job
```

Session:

- conversation
- persistent user interaction
- agent context

Job:

- one execution/run/tool chain
- status
- lease
- retry
- artifacts
- billing

One Session can own many Jobs.

---

# 78. Background Skills and Agents

Existing background Skills/Agents MUST migrate to:

```text
JobService.create()
```

No Skill/Plugin may create a private queue for normal execution.

Plugin/Skill declares:

```text
capabilities
resource requirements
execution preference
retry policy
artifact policy
```

---

# 79. Automations

Scheduler/trigger creates canonical Job.

If previous run active:

```text
skip
queue
replace
parallel
```

policy is per automation.

Scheduler does not own execution status.

---

# 80. Canonical Job Schema

Keep `worker_jobs`.

Suggested additions/normalization:

```text
job_class
source_feature

parent_job_id
root_job_id

tenant_id
user_id
project_id

queue_class
priority_class

execution_target_kind
requested_node_id
assigned_node_id
execution_backend

runtime_package_id
runtime_package_version

provider_id
provider_account_id
provider_execution_id

workflow_instance_id

status
progress_percent
current_step_id

attempt
max_attempts
dispatch_attempt

idempotency_key
side_effect_class

requirements_json
input_json
result_json

estimated_runtime_seconds
active_runtime_seconds
external_wait_seconds

estimated_cost_credits
final_cost_credits

lease_id
last_heartbeat_at
last_progress_at

error_code
error_summary

created_at
queued_at
assigned_at
started_at
finished_at
```

---

# 81. Job Steps

`worker_job_steps`:

```text
step_id
job_id
parent_step_id
name
status
progress
tool_id
attempt
started_at
finished_at
metadata_json
```

---

# 82. Job Events

Reuse `worker_job_events`.

Normalized event types include:

```text
job.created
job.queued
job.admission_wait
job.assigned
job.claimed
job.started
job.progress

capacity.waiting
capacity.reserved
capacity.released

provider.account_selected
provider.rate_limited
provider.submitted
provider.callback_received
provider.poll
provider.completed

runtime.starting
runtime.ready
runtime.stalled
runtime.recycled

permission.requested
permission.resolved

artifact.created
artifact.ingested

retry.scheduled

job.completed
job.failed
job.cancelled
```

---

# 83. Event Ordering

Events require:

```text
event_id
job_id
sequence
created_at
producer
attempt
```

Consumer/UI must tolerate:

- duplicate events
- late events
- replay
- reconnect

---

# 84. Progress Contract

```json
{
  "progress_percent": 61,
  "stage": "video_generation",
  "step": 5,
  "total_steps": 9,
  "message": "Generating shot 5",
  "eta_seconds": null,
  "confidence": null
}
```

ETA is optional.

Never fabricate ETA.

---

# 85. Cancellation

Cancel flow depends on current execution owner.

Canonical:

```text
cancel_requested
```

Then:

- Provider adapter cancel if supported
- Runner/Worker process terminate
- Container signal/stop
- Agent stop/checkpoint
- release capacity leases
- cleanup
- acknowledge
- `cancelled`

If provider cannot cancel, UI must show that cancellation stops SmartAIHub continuation but upstream may still finish.

---

# 86. Retry and Idempotency

Every Job:

```text
idempotency_key
attempt
max_attempts
retry_policy
retryable_errors
side_effect_class
```

Side-effect classes:

```text
safe
idempotent
external_effect
destructive
```

No blind retry for destructive effects.

---

# 87. Provider Idempotency

If provider supports client idempotency keys, use canonical Job/attempt-derived key.

If not:

- persist submission intent before request
- persist request ID immediately after response
- reconciliation checks for ambiguous submission
- avoid duplicate media generation when status is uncertain

---

# 88. Admission Controller

Before dispatch:

```text
tenant enabled?
user allowed?
budget available?
global maintenance?
queue class allowed?
rate/capacity potentially available?
execution policy valid?
```

If not immediately eligible:

```text
admission_wait
```

with reason.

---

# 89. Runtime Router

Inputs:

```text
capability
provider preference
model
GPU
CPU/RAM/VRAM
local file need
privacy
tenant policy
user execution preference
queue age
cost
health
compatibility
```

Outputs:

```text
execution_backend
candidate pool
```

---

# 90. Execution Location UX

Default:

```text
Auto
```

Optional:

```text
SmartAIHub Cloud
This Computer
Specific Device
Provider-specific advanced override
```

User MUST NOT select incompatible device.

---

# 91. Provider Credential Vault

Never put provider secrets in:

- Queue message
- `worker_jobs.input_json`
- event payload
- logs
- Runner package
- Container image

Store:

```text
credential_ref
```

Actual secret comes from secure secret store.

Access is scoped to adapter/account execution.

---

# 92. Secret Rotation

Provider account supports:

```text
credential version
created_at
rotated_at
expires_at
healthcheck
```

Rotation SHOULD be possible without changing account identity.

---

# 93. Multi-Tenant Isolation

Every:

- Job
- execution node
- artifact
- approval
- account visibility
- log

must respect tenant boundary.

Provider accounts are platform resources unless explicitly tenant-owned.

Tenant/user does not see provider secret/account internals unless role permits.

---

# 94. RBAC

Roles:

```text
User
Project Admin
Tenant Admin
Platform Admin
```

New permissions:

```text
view_execution
manage_device
manage_runner
view_provider_capacity
manage_provider_accounts
activate_provider_account
edit_rate_limits
edit_queue_policy
edit_runtime_policy
replay_dlq
view_cost_debug
force_cancel
force_destroy_runtime
```

---

# 95. Credit Reservation

Before expensive work:

```text
estimate
reserve credits
dispatch
```

If insufficient:

```text
admission_wait or fail according to product policy
```

Do not submit paid provider request before successful reservation.

---

# 96. Cost Ledger

Suggested:

```text
job_cost_ledger
```

Fields:

```text
ledger_id
job_id
attempt

component
provider_id
provider_account_id
execution_node_id

quantity
unit
unit_price
currency

cost_actual
credits_actual

estimate_or_final

created_at
```

Components:

```text
provider_api
llm_tokens
cloud_runtime
storage
network
skill_fee
platform_fee
```

---

# 97. Credit Lifecycle

```text
RESERVE
  ↓
METER
  ↓
SETTLE
  ↓
RELEASE unused
  ↓
RECONCILE
```

Platform-chosen Container idle grace SHOULD normally be platform overhead/rate-card cost, not direct second-by-second user charge.

---

# 98. Provider Revenue/Cost Boundary

Raw provider/API infrastructure cost should be recorded separately from revenue-shareable value/skill fee.

Do not blindly apply creator/tenant/platform percentage to raw provider expense.

Feature 195 only supplies cost components/ledger references; existing business rules decide distribution.

---

# 99. SmartAIHub Runtime Rate Card

Create internal stable rate card for cloud runtime classes rather than exposing raw Cloudflare billing.

Examples:

```text
cloud.media-utils
cloud.video-render
cloud.remotion-render
cloud.hermes
cloud.code-sandbox
```

---

# 100. Web Real-Time Architecture

Browser never owns background execution.

```text
Executor/Provider
  ↓
Core / Job Events
  ↓
Event Gateway
  ↓
SSE/WebSocket
  ↓
Browser
```

On page refresh:

1. query PostgreSQL current state
2. subscribe to live events
3. replay missed events if necessary

---

# 101. User-Facing Information Architecture

Recommended:

```text
Execution
├── Overview
├── Jobs
├── Devices
├── Approvals
└── Activity
```

Admin:

```text
Execution Admin
├── Queue & Backlog
├── Provider Capacity
├── Cloud Runtime
├── Runtime Packages
├── Rate Limits
├── Cost Guards
├── DLQ
├── Policies
└── Advisor
```

Existing route can remain for compatibility.

---

# 102. Overview UI

Cards:

```text
Queued Jobs
Running Jobs
Waiting Provider Capacity
Waiting External
Waiting Approval
Failed Today
Online Devices
Cloud Runtime Active
Provider Accounts Active
Oldest Queue Wait
```

---

# 103. Jobs UI

Columns:

```text
Job
Source
Class
Status
Progress
Execution
Provider
Created
Queue Wait
Duration
Owner
```

Filters:

```text
status
source
job class
provider
execution backend
device/node
tenant
user
project
date
needs attention
```

---

# 104. Job Detail UI

Tabs:

```text
Overview
Steps
Attempts
Execution Path
Timeline
Controls
Quality
Logs
Artifacts
Permissions
Cost
Debug
```

Overview additionally shows:

```text
Queue wait
Provider account (admin only)
Execution backend
External wait
Retries
Current capacity reason
```

---

# 105. Provider Capacity Center

Main table:

```text
Provider      Active Accounts   Utilization   Queue   Oldest Wait   Health
OpenRouter    2/5               72%           8       11s           Healthy
KIE           2/5               91%           22      4m            Healthy
fal           1/5               43%           3       20s           Healthy
WaveSpeed     2/5               67%           5       55s           Healthy
```

---

# 106. Provider Detail UI

Tabs:

```text
Overview
Accounts
Limits
Models/Capabilities
Usage
Rate Limits
Errors
Cost
Recommendations
Audit
```

Account row:

```text
KIE-01  Active   Healthy   4/5 processing   RPM 32/50
KIE-02  Active   Healthy   5/5 processing   RPM 40/50
KIE-03  Standby
KIE-04  Standby
KIE-05  Standby
```

Actions:

```text
Activate
Drain
Disable
Test
Edit Limits
Rotate Credential
View Jobs
```

---

# 107. Account Activation UI

Before activation show:

- expected added capacity
- configured rate limits
- credential health
- estimated budget impact
- provider policy note
- current backlog

Example:

```text
Activate KIE-03?

Expected video capacity: 10 → 15
Current queue: 22
Oldest wait: 4m 17s

[Activate]
```

---

# 108. Auto Capacity Mode

Future/optional after telemetry:

```text
Manual
Recommendation Only
Auto
```

Auto activation conditions MAY include:

```text
P95 wait > threshold
utilization > threshold for duration
active accounts < max
standby account healthy
budget available
no provider incident
```

Auto deactivation:

```text
drain
wait in-flight complete
idle stability window
standby
```

---

# 109. Provider Recommendation Engine

Examples:

```text
KIE utilization > 90% for 18m.
P95 queue wait increased to 6m.
Recommendation: activate KIE-03.
```

```text
KIE-02 produced repeated 429 responses.
Recommendation: reduce model concurrency 5 → 3 for 30m.
```

```text
WaveSpeed account 2 error rate is elevated.
Recommendation: drain account and run healthcheck.
```

Recommendations require explicit Apply unless Auto mode is enabled.

---

# 110. Queue & Backlog UI

Show by logical class:

```text
Queue Class
Queued
Oldest
P50 Wait
P95 Wait
Throughput
Retry
DLQ
```

Do not require user to understand physical Cloudflare Queue name.

Advanced mode can show actual lane/broker.

---

# 111. DLQ UI

Show:

```text
message
job
lane
attempts
error
age
```

Actions:

```text
Inspect canonical Job
Replay
Mark resolved
Discard with reason
```

Replay must be idempotent and audited.

---

# 112. Cloud Runtime UI

Show:

```text
Runtime
Package Version
Active
Busy
Idle
Draining
Queued
Oldest Wait
Stalls
Starts
Estimated Cost
Hard Max
Budget Guard
```

---

# 113. Runtime Policy Editor

Per runtime:

```text
Enabled
Preferred execution
Fallback execution

Normal target
Burst max
Hard max
Concurrency

Scale threshold
Scale step
Idle grace

Heartbeat
Suspect no-progress
Hard no-progress

Job hard timeout
Instance max age
Jobs before recycle

Start rate cap
Hourly cost cap
Daily cost cap
```

---

# 114. Setting Help Requirement

Every adjustable field MUST show:

1. what it controls
2. default
3. recommended range
4. effect when increased
5. effect when decreased
6. cost impact
7. reliability impact
8. current telemetry
9. system recommendation
10. risky-value warning

No important operations tuning should require code edit.

---

# 115. Runtime Advisor

Inputs:

```text
P50/P95 queue wait
P50/P95 execution
utilization
stall rate
retry rate
cold start
jobs/instance
cost/job
cost/day
```

Advisory output:

```text
keep
increase
decrease
investigate health
```

---

# 116. Devices UI

Contains:

```text
SmartAIHub Worker
SmartAIHub Runner
```

Fields:

```text
Name
Product type
Platform
Online
Version
Capabilities
Runtime packages
CPU/RAM/GPU
Active Jobs
Last Seen
```

---

# 117. SmartAIHub Runner Package UI

Actions:

```text
Install
Update
Rollback
Pin
Change Channel
Health Check
```

Update while active Job:

```text
UPDATE_PENDING
  ↓
DRAINING
  ↓
finish
  ↓
activate
  ↓
healthcheck
```

---

# 118. Permissions and Approvals

Risky actions remain centralized.

Examples:

- git push
- destructive file operations
- privileged container
- browser login
- credential access
- external publishing
- elevated shell
- reboot/shutdown

Actions:

```text
Allow once
Allow Job
Allow Project
Deny
```

---

# 119. Artifact Architecture

No new artifact library.

```text
Job Artifact = execution result view
SmartAIHub Library = durable asset
```

Provider URL may expire.

Result ingestion MUST copy durable output to R2/Library according to artifact policy.

---

# 120. Large Input/Output Handling

Queue payload contains references.

Use:

- R2 object keys
- signed URLs
- Library asset IDs
- checksum
- content metadata

Do not put binary/base64 media in Queue messages.

---

# 121. Callback Security

Callback endpoint:

- provider-specific verification when supported
- random/unpredictable identifiers where appropriate
- replay protection
- idempotency
- timestamp tolerance
- secret redaction
- body size limit
- rate limit

Unknown callback MUST NOT mutate a Job.

---

# 122. Runner Security

- outbound connection by default
- secure device pairing
- rotating device credentials
- OS secure credential store
- signed runtime packages
- least privilege
- no public inbound port requirement
- permission broker for risky host actions

---

# 123. Cloud Runtime Security

- scoped Core→Controller auth
- scoped secrets
- per-job workspace
- no cross-tenant temp data reuse
- no secrets baked into image
- controlled outbound access where feasible
- non-root container process where practical

---

# 124. Workspace Isolation

Shared execution runtime:

```text
/workspace/jobs/<job_id>/
```

After Job:

1. finalize
2. checksum
3. upload
4. emit durable completion
5. cleanup

---

# 125. Persistent State

Cloudflare Container disk is treated as ephemeral.

Persistent state:

```text
PostgreSQL
R2
SmartAIHub Library
Durable state service when appropriate
```

Hermes/Agent session state must be externalized or reconstructable.

---

# 126. Heartbeat

Execution node heartbeat default:

```text
15–30 seconds
```

Cloud render recommended:

```text
30 seconds
```

Heartbeat is not progress.

Maintain separate:

```text
last_heartbeat_at
last_progress_at
```

---

# 127. Watchdog

Detect:

- heartbeat missing
- progress missing
- lease expiring
- callback overdue
- polling overdue
- upload stuck
- cancel stuck
- orphan process
- capacity lease leak
- crash loop
- Container startup failure
- provider account degradation

---

# 128. Job Lease

Long-running execution requires SmartAIHub lease.

Fields:

```text
lease_id
job_id
owner_kind
owner_id
attempt
acquired_at
heartbeat_at
expires_at
state
```

Queue visibility is not a substitute.

---

# 129. Lease Recovery

If lease expires:

1. inspect owner health
2. inspect provider execution if external
3. avoid duplicate side effect
4. reconcile
5. retry/requeue only under policy

Never immediately duplicate a provider request merely because heartbeat disappeared.

---

# 130. Local Offline Recovery

Runner/Worker can keep lightweight journal:

```text
active jobs
process IDs
adapter
checkpoint
last event sequence
pending uploads
```

After reconnect:

```text
recovery report
Core reconciliation
resume/complete/fail safely
```

---

# 131. `smartspec-node-worker.service` Migration

Treat current service as legacy implementation of several roles.

Inventory exact responsibilities:

```text
queue consumption
job dispatch
slot/concurrency control
provider invocation
background skill execution
agent execution
render/worker dispatch
retries
scheduling
```

Map each responsibility to new component.

---

# 132. Migration Mapping

```text
smartspec-node-worker.service queue intake
  → Cloudflare Queues + Queue Adapter

local concurrency/slot logic
  → Capacity/Slot Manager

provider selection
  → Provider Pool Manager

provider API call
  → Provider Adapter

background skill/agent execution
  → canonical Job + Agent/Runtime Backend

render worker dispatch
  → Runtime Router

retry
  → canonical retry policy + Queue delay/Workflow

status
  → worker_jobs / worker_job_events
```

---

# 133. Migration Must Avoid Big Bang

During transition:

```text
JobService
  ↓
ExecutionBackend abstraction
  ├── LegacyNodeWorkerBackend
  └── CloudflareQueueBackend
```

Use feature flags by Job class.

Do not switch every Job type in one deployment.

---

# 134. Migration Phase 0 — Code Audit

Inventory:

- every direct Redis/BullMQ/Celery call
- every `smartspec-node-worker.service` consumer path
- all provider call sites
- all background Skill/Agent producers
- all media generation producers
- all render queues
- all local Worker queues
- all scheduler entry points
- all retry loops
- all timeout workarounds
- all duplicated status enums

Deliverable:

```text
Legacy Producer → Canonical Job Type → Current Executor → Target Queue Class → Target Backend
```

---

# 135. Migration Phase 1 — Canonical Job Hardening

Before Queue cutover:

- normalize statuses
- add Job class
- add queue class
- add provider/execution fields
- add last progress
- add leases
- add attempts
- add Outbox
- add idempotency
- add Job events

No executor needs to change yet.

---

# 136. Migration Phase 2 — Outbox + Queue Adapter

Implement:

```text
CloudflareQueueAdapter
```

Shadow publish initially if desired.

Verify:

- no lost Jobs
- duplicate safe
- queue latency
- retry behavior
- DLQ

---

# 137. Migration Phase 3 — Provider Dispatch

Start with one provider/capability.

Suggested:

```text
image generation or a low-risk media provider path
```

Implement:

- account pool
- slot lease
- selected account
- 429 feedback
- webhook/polling
- cost ledger

Then expand provider by provider.

---

# 138. Migration Phase 4 — Provider Multi-Account

For each provider:

1. account 1 only
2. validate capacity tracking
3. add account 2 standby
4. activate manually
5. validate balancing
6. configure up to 5
7. later enable recommendation/auto capacity

---

# 139. Migration Phase 5 — Background Skills/Agents

Replace legacy background process dispatch with canonical Jobs.

Migrate:

- Skills
- Agents
- scheduled Agent tasks
- research jobs
- plugin background work

---

# 140. Migration Phase 6 — Local Worker / ComfyUI

Wrap existing Worker:

```text
LegacyWorkerExecutionBackend
```

Then route:

- FFmpeg
- ComfyUI
- local AI

through canonical Control Plane.

---

# 141. Migration Phase 7 — Cloudflare Containers Pilot

Keep Core on Debian.

Pilot:

```text
video-render-runtime
```

Policy:

```text
normal 1
burst 2
hard 2
scale wait 15m
```

Collect real benchmark/cost data.

---

# 142. Migration Phase 8 — SmartAIHub Runner

Implement headless Runner.

Targets:

```text
Windows
macOS
Linux
```

Then migrate appropriate local capabilities from Worker.

Worker UI remains available.

---

# 143. Migration Phase 9 — Agent Runtimes

Add:

```text
Hermes
AutoClaw
OpenClaw
```

as Runtime/Agent adapters.

No independent queue.

---

# 144. Migration Phase 10 — Retire Legacy Queue Paths

After each Job class stabilizes:

- disable legacy producer
- drain pending jobs
- remove direct queue calls
- remove duplicate status handling
- keep compatibility reader only as needed

End state:

```text
one Job producer contract
one async backbone
one status model
one UI
```

---

# 145. Source Feature Contract

All features call:

```text
JobService.create()
```

Forbidden in new code:

```text
direct BullMQ push
direct Celery task
direct Cloudflare Queue call
direct Worker socket call
direct provider account selection
direct slot counter mutation
```

Only infrastructure adapters may access those mechanisms.

---

# 146. Job Creation Request

Concept:

```json
{
  "job_type": "media.video.generate",
  "source_feature": "media_studio",
  "owner": "...",
  "project_id": "...",
  "inputs": {},
  "requirements": {
    "capabilities": ["video.generate"]
  },
  "provider_policy": {
    "preferred": ["kie"],
    "allow_fallback": true
  },
  "execution_policy": {
    "location": "auto"
  },
  "priority": "default",
  "retry_policy": {},
  "artifact_policy": {}
}
```

No provider account credential/account ID from normal feature layer.

---

# 147. API Surface — Jobs

```text
POST /v1/jobs
GET  /v1/jobs
GET  /v1/jobs/:id

POST /v1/jobs/:id/cancel
POST /v1/jobs/:id/retry
POST /v1/jobs/:id/pause
POST /v1/jobs/:id/resume
```

---

# 148. API Surface — Execution

```text
GET  /v1/execution/nodes
GET  /v1/execution/nodes/:id
POST /v1/execution/nodes/:id/drain

GET  /v1/execution/runtime-packages
POST /v1/execution/runtime-packages/:id/update

GET  /v1/execution/cloud/policies
PUT  /v1/execution/cloud/policies/:runtime
```

---

# 149. API Surface — Provider Capacity

```text
GET    /v1/admin/providers
GET    /v1/admin/providers/:provider

GET    /v1/admin/providers/:provider/accounts
POST   /v1/admin/providers/:provider/accounts

PUT    /v1/admin/provider-accounts/:id
POST   /v1/admin/provider-accounts/:id/activate
POST   /v1/admin/provider-accounts/:id/drain
POST   /v1/admin/provider-accounts/:id/disable
POST   /v1/admin/provider-accounts/:id/test

GET    /v1/admin/provider-accounts/:id/limits
PUT    /v1/admin/provider-accounts/:id/limits

GET    /v1/admin/provider-capacity
GET    /v1/admin/provider-capacity/recommendations
```

---

# 150. API Surface — Queue/DLQ

```text
GET  /v1/admin/execution/queues
GET  /v1/admin/execution/dlq
GET  /v1/admin/execution/dlq/:message

POST /v1/admin/execution/dlq/:message/replay
POST /v1/admin/execution/dlq/:message/resolve
```

Do not expose raw Cloudflare credentials/API to frontend.

---

# 151. Protocol Versioning

Version independently:

```text
Job API
Queue message schema
Execution protocol
Runner Host
Runtime Package protocol
Runtime Package version
Provider Adapter version
```

One upgrade must not unnecessarily force all others.

---

# 152. Metrics — Queue

```text
enqueued/sec
dequeued/sec
dispatch latency
queue depth
oldest age
retry rate
DLQ rate
P50 wait
P95 wait
```

---

# 153. Metrics — Provider

```text
active accounts
free processing slots
submission capacity
request rate
token rate
429 rate
5xx rate
timeout rate
P50/P95 latency
callback delay
cost/hour
cost/day
```

---

# 154. Metrics — Execution Nodes

```text
online
busy
degraded
active Jobs
CPU
RAM
GPU
VRAM
disk
heartbeat age
runtime package health
```

---

# 155. Metrics — Cloud Runtime

```text
active instances
busy
idle
draining
cold starts
startup latency
stalls
recycles
runtime seconds
cost estimate
jobs/instance
```

---

# 156. Tracing

Trace dimensions:

```text
trace_id
root_job_id
job_id
attempt
dispatch_message_id
provider_execution_id
provider_account_id
execution_node_id
runtime_instance_id
workflow_instance_id
```

---

# 157. Alerts

Alert conditions:

- oldest queue > threshold
- queue growth abnormal
- provider capacity > 90% sustained
- repeated 429
- provider account circuit open
- all accounts unavailable
- DLQ messages present
- Runner/Worker offline mid-job
- Container stall
- repeated retry
- callback overdue spike
- cost budget near limit
- credit settlement failures
- slot leak detected

---

# 158. Notification Policy

User notification only for actionable product states:

```text
completed
failed
waiting approval
device lost
long delay when meaningful
```

Infrastructure alerts go to Admin/operations.

Do not spam user with provider account internals.

---

# 159. Error Taxonomy

Normalized codes:

```text
AUTH_ERROR
CONFIG_ERROR
TOOL_NOT_FOUND
MODEL_NOT_FOUND
RESOURCE_EXHAUSTED
CAPACITY_UNAVAILABLE
RATE_LIMITED
PROVIDER_UNAVAILABLE
TIMEOUT
NETWORK_ERROR
CALLBACK_TIMEOUT
USER_CANCELLED
PERMISSION_DENIED
TOOL_CRASHED
INVALID_INPUT
UNSUPPORTED_ACTION
BUDGET_EXCEEDED
CIRCUIT_OPEN
UNKNOWN
```

---

# 160. User-Facing Error

Must answer:

- what failed
- where
- retryable?
- what user can do

Example:

```text
Video generation is waiting for provider capacity.
No action is required. Your job remains queued.
```

Not:

```text
HTTP 429
```

---

# 161. Reliability Requirements

System must tolerate:

- duplicate Queue delivery
- Queue retry
- Queue delayed delivery
- DB reconnect
- Core restart
- Worker reconnect
- Runner restart
- Container restart
- provider callback duplicate
- provider callback late
- webhook missing
- provider submission timeout ambiguity
- R2 failure
- capacity lease expiration
- crash loop
- DLQ replay

---

# 162. Performance Goals

Initial design goals:

```text
Job creation API < 1s typical
Job queued confirmation immediate after DB commit
UI status propagation within a few seconds
Provider admission low latency when capacity exists
No request waits for long media processing
Historical Jobs pageable/filterable
```

Exact SLOs require production benchmark.

---

# 163. Capacity Planning

Admin should answer:

```text
How many Jobs can each provider account accept?
How many active accounts are enabled?
How much queue delay exists?
How much extra capacity would next account add?
Where are 429s happening?
Which model/capability is saturated?
```

---

# 164. Provider Account Expansion Strategy

Default account slots:

```text
Provider
Account 1 ACTIVE
Account 2 STANDBY
Account 3 STANDBY
Account 4 STANDBY
Account 5 STANDBY
```

Actual starting active count can differ by provider.

As traffic grows, activate without feature changes.

---

# 165. Account Deactivation

Never hard-disable account with in-flight jobs unless emergency.

Normal:

```text
ACTIVE
  ↓
DRAINING
  ↓
inflight = 0
  ↓
STANDBY/DISABLED
```

---

# 166. Account Credential Failure

Auth failure:

```text
mark DEGRADED / CIRCUIT_OPEN
stop new submissions
alert Admin
do not retry across same broken credential repeatedly
```

Other accounts may remain active.

---

# 167. Global Provider Outage

If all accounts unavailable:

```text
provider state = degraded/outage
Jobs remain waiting_provider_capacity
fallback provider if Job policy allows
otherwise queue
```

Do not create infinite rapid retries.

---

# 168. Cross-Provider Fallback

Optional per Job/Skill policy:

```text
preferred provider
allowed fallback providers
quality constraints
cost ceiling
feature compatibility
```

Fallback must not silently change behavior where model/provider identity is user-visible or contractually significant.

---

# 169. Model Capability Registry

Do not hard-code model names into core scheduler.

Registry:

```text
provider
model
capabilities
input modes
output modes
duration
resolution
audio
reference support
cost model
limit profile
```

Scheduler matches capability.

---

# 170. Scheduling Decision Record

For debug/audit, store or emit:

```text
candidate providers
candidate accounts
excluded reasons
selected account
capacity snapshot
policy version
```

Do not expose secrets.

---

# 171. Policy Versioning

Provider/slot/scheduler policies should have:

```text
policy_version
effective_at
changed_by
change_reason
```

Job event references policy version used at dispatch.

---

# 172. Admin Change Audit

Audit:

- provider account added
- activated/drained/disabled
- rate limit changed
- hard cap changed
- cost budget changed
- queue policy changed
- runtime scale changed
- DLQ replay
- manual Job reassignment
- force cancel/destroy

---

# 173. Configuration Storage

Operational policy belongs in DB/config service, not constants.

Examples:

```text
provider limits
account activation
scheduler weight
queue threshold
runtime scale
watchdog timeout
cost budget
```

Validate ranges server-side.

---

# 174. Safe Defaults

Dangerous values require warning/confirmation.

Examples:

```text
hard max containers very high
retry count very high
no-progress timeout disabled
provider concurrency above known limit
auto capacity without budget guard
```

---

# 175. Test Strategy — Unit

Test:

- canonical state machine
- admission
- fairness algorithm
- account selection
- effective limit calculation
- lease expiration
- rate counters
- circuit breaker
- retry classification
- Queue envelope validation
- idempotency
- cost reservation
- provider callback dedupe

---

# 176. Test Strategy — Integration

Test:

- DB + Outbox + Queue
- Queue duplicate delivery
- provider submit
- callback
- polling fallback
- 429 and account cooldown
- multi-account load balancing
- account activation under load
- Runner claim
- Worker claim
- Container claim
- artifact upload
- cancellation
- credit settlement

---

# 177. Test Strategy — Failure Injection

Inject:

- kill Queue consumer
- duplicate message
- DB timeout after provider response
- provider timeout
- 429 storm
- provider 5xx storm
- callback missing
- callback duplicate
- Runner disconnect
- Container stall
- R2 failure
- slot lease leak
- account credential invalid
- all accounts unavailable
- budget cap reached

---

# 178. Load Testing

Scenarios:

```text
100 users
500 users
1,000 users
```

Traffic mix:

- image burst
- video burst
- LLM burst
- Skill background jobs
- Agent long-running
- render jobs

Measure:

```text
P50/P95 queue wait
fairness
429 rate
slot utilization
provider account distribution
DB load
Queue throughput
callback recovery
cost
```

---

# 179. Multi-Account Load Test

For provider with 5 accounts:

1. one active
2. two active
3. three active
4. simulate one 429/cooldown
5. simulate one credential failure
6. activate standby
7. verify no lost/duplicate Job

---

# 180. Cloud Render Benchmark

Benchmark:

```text
30s
60s
3m
5m
1080x1920
```

Profiles:

- transcode
- subtitles/watermark
- reframe
- overlays/transitions/audio

Compare instance profiles using:

```text
cost per completed render
not only seconds/job
```

---

# 181. Migration Acceptance Criteria

Before decommissioning a legacy queue path:

- all producers use JobService
- canonical Job visible
- Queue dispatch idempotent
- retry tested
- DLQ configured
- metrics visible
- cancel semantics defined
- cost/credit semantics defined
- fallback/recovery defined
- old pending jobs drained
- feature flag rollback available

---

# 182. Feature 195 Acceptance Criteria — Core

1. one canonical Job model
2. PostgreSQL remains source of truth
3. Cloudflare Queues is async backbone
4. Transactional Outbox exists
5. Queue duplicate delivery safe
6. Queue message does not own long-running execution
7. Job lease/heartbeat exists
8. one Job Detail UI
9. one event model
10. one artifact integration
11. no feature calls broker directly
12. no feature selects provider account directly

---

# 183. Acceptance Criteria — Provider Capacity

1. up to 5 provider accounts configurable initially
2. schema allows future expansion
3. accounts can be Active/Standby/Drain/Disabled
4. capability/model-specific limits supported
5. submission and processing capacity separated
6. slot leases recover from crashes
7. rate limits centralized
8. 429 feeds back into scheduling
9. account-level circuit breaker exists
10. budget guard exists
11. account activation visible in UI
12. recommendations possible from telemetry
13. user/tenant fairness exists
14. provider secrets not exposed to Queue/Job/logs

---

# 184. Acceptance Criteria — Async Provider

1. API request returns Job ID without waiting for generation
2. provider request ID persisted
3. webhook-first supported where available
4. polling fallback supported
5. no Container/Runner waits idle on provider
6. callback deduped
7. expired result URL ingested promptly to durable storage
8. retries do not blindly duplicate paid request

---

# 185. Acceptance Criteria — Runner

1. Windows/macOS/Linux
2. no end-user build toolchain
3. macOS no Xcode requirement
4. pairing via Web
5. self-update
6. package update independent from Host
7. signed/checksummed updates
8. rollback
9. canonical Job claim
10. heartbeat/progress
11. local recovery journal

---

# 186. Acceptance Criteria — Cloud Runtime

1. Core can stay on Debian
2. Cloudflare Container executes canonical Job
3. instance lifecycle visible
4. render queue-first scaling
5. health checked before scale
6. hard max
7. cost guard
8. no-progress watchdog
9. graceful drain
10. ephemeral disk not source of truth

---

# 187. Acceptance Criteria — Agents

1. Hermes uses canonical Jobs
2. AutoClaw uses canonical Jobs
3. OpenClaw uses canonical Jobs
4. no independent production queue
5. tool calls can create child Jobs
6. parent/child visible in Job tree
7. session is separated from run/job
8. long tasks survive browser close

---

# 188. Critical Blocking Rules

### Rule 1
Never create another authoritative Job system.

### Rule 2
Never make Cloudflare Queue the source of truth.

### Rule 3
Never let feature code select provider account.

### Rule 4
Never store provider credentials in Queue messages or Job logs.

### Rule 5
Never keep long Queue delivery open only because execution is long.

### Rule 6
Never keep Container/Runner alive solely waiting on async provider.

### Rule 7
Never model provider capacity with one unleased integer counter.

### Rule 8
Never treat 429 as generic terminal failure without capacity feedback.

### Rule 9
Never auto-retry destructive/external side effect blindly.

### Rule 10
Never create one queue per provider account as the default architecture.

### Rule 11
Never let one tenant/user monopolize all capacity indefinitely.

### Rule 12
Never scale Containers to hide a stalled worker.

### Rule 13
Never make operational thresholds source-code-only.

### Rule 14
Never require Xcode/GitHub/build tools on Runner end-user machines.

### Rule 15
Never create separate Worker/Runner/Cloud job histories for users.

---

# 189. Recommended Repository Boundaries

```text
web/
  features/execution/
  features/jobs/
  features/devices/
  features/provider-capacity/
  features/cloud-runtime/
  features/approvals/
  components/execution/

server/
  job-control/
  outbox/
  queue/
    adapters/
    routing/
    dlq/
  scheduler/
    admission/
    fairness/
    slots/
    rate-limits/
    circuit-breaker/
  providers/
    registry/
    accounts/
    adapters/
  execution/
    router/
    backends/
  workflows/
  watchdog/
  billing/
  artifacts/
  approvals/

runner/
  host/
  protocol/
  package-manager/
  engines/
  updater/
  watchdog/

runtimes/
  media-utils/
  video-render/
  remotion-render/
  hermes/
  document/
  code-sandbox/
  browser/

cloud/
  queues/
  workflows/
  runtime-controller/
  containers/

legacy/
  smartspec-node-worker-adapter/
  worker-adapter/
  celery-adapter/
  bullmq-adapter/
```

---

# 190. Suggested Data Tables

Core (logical names mapped to existing canonical tables where present):

```text
worker_jobs
worker_job_events
worker_job_steps
worker_job_artifacts
worker_job_permissions
worker_job_outbox
worker_job_dispatches
worker_job_attempts (lease/fencing state)
```

Execution:

```text
execution_nodes
execution_capabilities
runtime_packages
runtime_instances
runtime_performance_profiles
```

Provider:

```text
providers
provider_accounts
provider_account_limits
provider_account_usage
provider_account_health
provider_executions
capacity_leases
provider_policy_versions
```

Financial:

```text
job_credit_reservations
job_cost_ledger
```

Operations:

```text
execution_policy_audit
runtime_policy_recommendations
```

Before creating a table, code audit MUST check for an existing equivalent.

---

# 191. Initial Recommended Defaults

## Provider Accounts

```yaml
provider_accounts:
  configured_max_initial: 5
  activation_mode: manual
  auto_capacity: false

circuit_breaker:
  enabled: true

rate_limit:
  use_retry_after: true
  jitter: true
```

## Queue

```yaml
queue:
  dlq_required: true
  payload_reference_only: true
  long_execution_uses_job_lease: true
```

## Render

```yaml
video_render:
  normal_instances: 1
  burst_max: 2
  hard_max: 2
  concurrency_per_instance: 1
  scale_oldest_wait: 15m
  idle_grace: 3m

watchdog:
  heartbeat: 30s
  suspect_no_progress: 3m
  hard_no_progress: 5m

recycle:
  max_jobs: 30
  max_age: 6h
```

All values are configurable from Admin UI.

---

# 192. Deployment Strategy

Use:

```text
development
staging
production
```

Cloud Queue migration:

1. provision queues
2. provision DLQs
3. deploy consumers
4. shadow metrics
5. route small Job class
6. observe
7. expand percentage
8. expand providers
9. expand background runtimes
10. retire legacy consumer per class

---

# 193. Rollback Strategy

Feature flag per Job class:

```text
queue_backend = legacy | cloudflare
```

Rollback must not change canonical Job API.

If Cloudflare Queue path is disabled:

```text
new Jobs return to legacy transport
existing cloud-dispatched Jobs finish/reconcile
```

No duplicate execution.

---

# 194. Operational Runbook — Provider Saturation

When queue grows:

1. verify provider healthy
2. inspect account utilization
3. inspect 429
4. inspect account cooldown/circuit
5. inspect active/standby accounts
6. inspect budget
7. activate next approved account if appropriate
8. adjust safe concurrency only with evidence
9. verify queue drains
10. record policy change

---

# 195. Operational Runbook — Stuck Render

1. heartbeat current?
2. progress current?
3. FFmpeg speed/out_time?
4. suspect threshold exceeded?
5. cancel child process gracefully
6. force terminate if necessary
7. cleanup
8. retry according to idempotency
9. recycle Container if state uncertain
10. do not blindly add many Containers

---

# 196. Operational Runbook — Provider 429 Storm

1. identify provider/account/model scope
2. apply Retry-After
3. reduce effective capacity
4. cooldown affected account/model
5. route to other active accounts if allowed
6. activate standby only if provider terms/capacity support it
7. alert Admin if all accounts affected
8. keep Jobs queued
9. recover using half-open probes
10. update observed limit telemetry

---

# 197. Operational Runbook — Queue/DLQ Incident

1. inspect canonical Job
2. determine whether side effect already happened
3. inspect message attempts
4. fix schema/consumer/config
5. replay only if idempotency safe
6. record audit
7. verify Job transitions
8. do not blindly bulk replay external-effect Jobs

---

# 198. UI/UX Anti-Duplication Rules

1. one Job Detail
2. one status enum
3. one progress contract
4. one Approval Center
5. one durable Library
6. one Devices view for Worker/Runner
7. Cloud Runtime admin view is infrastructure, not separate Jobs
8. Provider Capacity admin view is capacity, not separate Jobs
9. no provider-specific queue viewer in Media Studio
10. no duplicate Agent job history

---

# 199. Current Cloudflare Platform References

Verified during spec preparation (September 2026):

Cloudflare Queues:
- https://developers.cloudflare.com/queues/
- https://developers.cloudflare.com/queues/configuration/pull-consumers/
- https://developers.cloudflare.com/queues/configuration/batching-retries/
- https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- https://developers.cloudflare.com/queues/configuration/consumer-concurrency/
- https://developers.cloudflare.com/queues/platform/limits/

Cloudflare Workflows:
- https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/
- https://developers.cloudflare.com/workflows/build/workers-api/

Cloudflare Containers:
- https://developers.cloudflare.com/containers/configuration/scaling-and-routing/

Platform facts MUST be revalidated before production rollout because Cloudflare capabilities/limits can change.

---

# 200. Definition of Done

Feature 195 is complete when SmartAIHub has:

```text
one Job model
one JobService
one async dispatch backbone
one provider capacity model
one account pool model
one slot/lease model
one fairness scheduler
one runtime router
one event model
one artifact model
one Web execution experience
```

and:

- `smartspec-node-worker.service` is no longer a unique architectural bottleneck
- Cloudflare Queues carries platform dispatch according to migration plan
- provider multi-account capacity is centrally managed
- rate limits are centrally observable and adjustable
- external providers are asynchronous
- Skills and Agents run as canonical Jobs
- Worker and Runner consume the same execution model
- Cloudflare Containers consume the same execution model
- Hermes/AutoClaw/OpenClaw consume the same execution model
- future provider integration requires an Adapter + limit/capacity profile, not a new scheduler

The architectural objective is:

> **SmartAIHub must be able to improve queueing, fairness, capacity, rate-limit handling, provider-account utilization, runtime selection and reliability from one Job Control Plane without rewriting Media Studio, Video Edit, Skills, Agents, Plugins or client runtimes.**

---

# 201. Implementation Priority Summary

## P0 — Must implement first

- canonical Job hardening
- Transactional Outbox
- Cloudflare Queue Adapter
- DLQ
- dispatch idempotency
- provider registry
- provider accounts
- provider limit model
- capacity leases
- Slot Manager
- rate-limit feedback
- account health/circuit breaker
- fair scheduling foundation
- provider async execution
- webhook/polling pattern
- observability
- Admin Provider Capacity UI
- Admin Queue UI
- migration adapter for `smartspec-node-worker.service`

## P1 — Immediately after P0

- Cloudflare Container render pilot
- SmartAIHub Runner MVP
- runtime package registry
- Runner self-update/distribution
- Hermes adapter
- AutoClaw/OpenClaw adapter
- telemetry recommendations
- budget/cost optimization

## P2 — After production telemetry

- auto account activation
- advanced predictive capacity
- cross-provider automatic fallback where product permits
- autoscaled account weighting
- predictive queue ETA
- automatic runtime profile optimization

---

---

---

# 202. Final Implementation Rule

Before merging any execution-related feature, reviewers MUST answer YES:

```text
Uses JobService?
Uses canonical worker_jobs?
Queue is transport only?
Outbox used where dispatch follows DB write?
Idempotency safe?
Provider account selected centrally?
Capacity lease used?
Rate limit policy centralized?
Fairness respected?
Retry classified?
Side effect safe?
Artifacts use Library?
Events normalized?
Secrets redacted?
Metrics emitted?
UI uses shared execution components?
No new private queue/job system?
Migration/rollback defined?
```

If a core architecture answer is NO, the feature is not ready to merge.

---

# 203. Spec 196 → Spec 195 Execution Contract

Feature 196 compiles a Goal into a concrete or partially-bound Job Graph and submits it to Feature 195.

Minimum envelope:

```json
{
  "schema": "sah-execution-plan/1",
  "goal_id": "goal_...",
  "goal_run_id": "grun_...",
  "plan_id": "plan_...",
  "plan_revision": 1,
  "plan_hash": "sha256:...",
  "submission_id": "psub_...",
  "workflow_run_id": "wrun_...",
  "context_snapshot_id": "ctx_...",
  "origin": {
    "channel": "mobile",
    "caller_type": "user",
    "caller_id": "...",
    "session_id": "...",
    "conversation_id": "..."
  },
  "solution_profile": "balanced",
  "budget": {
    "max_credits": 100
  },
  "data_policy": {
    "classification": "standard",
    "external_processing_allowed": true
  },
  "steps": []
}
```

Feature 195 MUST validate plan schema and convert executable steps to canonical Jobs without changing the Goal semantics.

---

# 204. Plan/Workflow Correlation Fields

Add or normalize in `worker_jobs`:

```text
goal_id
goal_run_id
plan_id
plan_revision
plan_hash
workflow_run_id
plan_step_id
context_snapshot_id
logical_capability_id
capability_contract_version
selected_offer_id
solution_profile
```

These fields are correlation/provenance only. `worker_jobs` remains the execution source of truth.

---

# 205. Origin and Caller Provenance

Every canonical Job SHOULD preserve:

```text
origin_channel
origin_command_id
origin_session_id
origin_conversation_id
caller_type
caller_id
delegation_id
request_correlation_id
```

`origin_channel` examples:

```text
web
mobile_ios
mobile_android
tablet
telegram
mcp
grok_bot
hermes
autoclaw
openclaw
api
plugin
scheduler
```

The Job does not depend on the originating channel remaining online.

---

# 206. Execution Path Model

Feature 195 MUST be able to reconstruct how every Job actually ran.

Execution path example:

```text
Goal: Daily AI Podcast
  ↓
Plan Step: research.news
  ↓
Offer: user.grok_bot.research
  ↓
Execution Backend: ExternalAgentExecutionBackend
  ↓
Runtime: Grok Bot
  ↓
Child Job: podcast.script
  ↓
Offer: smartaihub.pro.podcast-writer
  ↓
Child Job: audio.tts
  ↓
Provider: MiniMax / account-02
  ↓
Child Job: audio.mix
  ↓
Cloud Runtime: media-utils-runtime
```

Persist/emit enough normalized metadata to reconstruct this path without exposing secrets.

---

# 207. Execution Path Event Types

Add normalized events:

```text
execution.plan_received
execution.step_created
execution.offer_bound
execution.backend_selected
execution.node_selected
execution.provider_selected
execution.provider_account_selected
execution.runtime_selected
execution.runtime_started
execution.runtime_changed
execution.fallback_started
execution.fallback_completed
execution.replanned
execution.handoff
execution.result_delivered
```

Admin/debug can show full path. Normal users see simplified wording.

---

# 208. Progress Aggregation Contract

Feature 195 provides Job/Step progress; Feature 196 aggregates workflow progress.

Each Job SHOULD report when possible:

```text
progress_percent
stage
step
total_steps
eta_seconds
progress_confidence
progress_weight_hint
```

If a runtime cannot report percentage, Feature 195 MUST report state/stage without fabricating a percentage.

Feature 196 may compute aggregate workflow progress only from declared weights and actual Job states.

---

# 209. Dynamic Job Graph Support

Agent/Planner execution may add child Jobs after a workflow has started.

Feature 195 MUST support:

- late-created child Jobs
- dynamically discovered tools
- agent delegation
- fallback Jobs
- replan replacements
- skipped/cancelled branches

The root `goal_run_id` and `workflow_run_id` MUST remain stable.

---

# 210. Replan/Fallback Provenance

If Feature 196 changes an executor/offer while a Goal is running, Feature 195 records:

```text
previous_offer
new_offer
reason
policy_version
trigger_job_id
approved_by if required
```

Reasons include:

```text
unavailable
rate_limited
quality_requirement_changed
budget_changed
runtime_offline
provider_outage
user_override
manual_edit_handoff
```

---

# 211. Channel-Independent Completion

A Job MUST continue if Telegram/Web/Mobile/Grok/Hermes disconnects.

Upon terminal or attention-required events, Feature 195 emits a normalized result/notification event to Feature 196 Delivery Router.

Feature 195 does NOT directly implement Telegram/mobile/Grok presentation logic.

---

# 212. Delivery Event Contract

Normalized events to Feature 196:

```json
{
  "schema": "sah-execution-event/1",
  "event_id": "evt_...",
  "type": "execution.attention|execution.completed|execution.failed",
  "goal_run_id": "...",
  "workflow_run_id": "...",
  "job_id": "...",
  "job_attempt": 1,
  "sequence": 42,
  "status": "...",
  "summary": "...",
  "artifact_ids": [],
  "action_required": null,
  "occurred_at": "..."
}
```

Feature 196 decides delivery channel(s).

---

# 213. Result and Artifact Lineage

Artifacts SHOULD preserve:

```text
goal_id
goal_run_id
plan_id
workflow_run_id
plan_step_id
job_id
producer_offer_id
provider/runtime provenance
```

This allows Mobile/Web/external assistants to browse results by Goal rather than only raw Job ID.

---

# 214. Cost Aggregation Hooks

Feature 195 remains authoritative for actual execution cost.

Every ledger item SHOULD correlate to:

```text
goal_run_id
workflow_run_id
plan_step_id
selected_offer_id
```

Feature 196 can therefore display:

```text
Estimated Plan Cost
Reserved Credits
Actual Cost So Far
Final Cost
External/BYO cost unknown or estimated
```

---

# 215. Delegated Caller Budget Enforcement

When caller is an external assistant such as Grok Bot/Hermes/AutoClaw, Feature 195 MUST enforce the delegation budget/scope received from Feature 196.

Examples:

```text
max credits/run
max credits/day
allowed capabilities
provider restrictions
publish requires approval
no destructive local action
expiry
```

External assistants never receive unrestricted platform credit authority by default.

---

# 216. Approval Propagation

Execution approval states MUST correlate back to Feature 196.

User can approve from:

- Web
- SmartAIHub Mobile
- Tablet
- permitted originating assistant/channel

Decision is canonical and must resolve the same Job regardless of channel.

---

# 217. Manual / Assisted / Auto / Hybrid Execution

Feature 195 MUST support execution initiated under these plan modes:

```text
auto
assisted
manual
hybrid
```

Manual/hybrid mode may pause a Job Graph and hand the user to a SmartAIHub Plugin UI/editor.

The same `goal_run_id` and artifact lineage continue after the user returns control to automation.

---

# 218. Monitoring API Additions

Add conceptual endpoints:

```text
GET /v1/execution/workflow-runs/:id/jobs
GET /v1/execution/workflow-runs/:id/path
GET /v1/execution/workflow-runs/:id/cost
GET /v1/execution/jobs/:id/path
GET /v1/execution/jobs/:id/provenance
```

Feature 196 may aggregate these for user-facing Goal Run UI.

---

# 219. Monitoring UI Additions

Admin Job Detail SHOULD show:

```text
Origin
Goal / Workflow Run
Logical Capability
Selected Offer
Execution Backend
Agent/Runtime
Provider
Provider Account (Admin only)
Device/Container
Fallback history
Queue waits
External waits
Cost breakdown
```

User-facing UI SHOULD simplify to:

```text
Researching with your connected assistant
Generating video with SmartAIHub Cloud
Editing on Home-PC Runner
Waiting for provider
```

---

# 220. Mobile/Tablet Monitoring Support

Feature 195 APIs/events MUST be presentation-agnostic and suitable for:

- compact Job cards
- background push notifications
- image/video/audio result previews
- approval actions
- resume/deep link to Web/plugin UI
- planner/history queries through Feature 196

No execution feature may require desktop browser presence.

---

# 221. External Assistant Reverse Invocation

When Grok Bot/Hermes/AutoClaw/OpenClaw calls SmartAIHub through Feature 196/MCP/API and SmartAIHub starts Jobs, those Jobs follow the same Spec 195 semantics.

The external assistant receives only:

- accepted/queued acknowledgement
- correlation IDs
- safe progress/result callbacks according to its connector

It does not receive internal provider credentials or queue details.

---

# 222. Loop and Recursive Invocation Safety

Because SmartAIHub may delegate to an external agent which can call SmartAIHub again, every Job chain SHOULD carry:

```text
call_chain_id
parent_call_id
origin_system
hop_count
max_hops
```

Detect and block orchestration cycles such as:

```text
SmartAIHub → Grok → SmartAIHub → Grok → ...
```

unless explicitly modeled as bounded iterative workflow.

---

# 223. Revised Definition of Done with Feature 196

In addition to existing criteria, Feature 195 is aligned with Feature 196 when:

1. every Job can identify its Goal/Plan/Workflow Run when applicable
2. origin channel/caller is traceable
3. execution path can be reconstructed
4. provider/runtime/agent handoffs are visible
5. workflow progress can be aggregated without fabricated percentages
6. actual cost can be rolled up to Goal/Plan
7. channel disconnect does not affect execution
8. approvals can be resolved cross-channel
9. external assistants operate under delegation/budget scopes
10. recursive orchestration loops are bounded/detected
11. manual/hybrid handoff preserves the same Goal Run
12. Mobile/Tablet clients can monitor all execution through APIs/events

---

# 224. Revised Architecture Boundary

```text
Feature 196
Command Gateway + Goal Orchestrator + Capability/Expertise Graph + Solution Optimizer
        │
        │ execution-plan/1
        ▼
Feature 195
Canonical Jobs + Queues + Capacity + Providers + Runtimes + Actual Cost + Execution Telemetry
        │
        │ normalized execution events/results
        ▼
Feature 196
Goal Run Aggregation + Delivery Router + Mobile/Web/External Assistant UX
```

This boundary is mandatory to prevent future channel, agent and provider growth from coupling directly to queue/runtime implementation.
---

# 225. Cross-Plane Plan Revision and Idempotency Contract

Feature 196 → Feature 195 submission MUST be versioned and idempotent.

Every execution-plan submission includes:

```text
goal_run_id
workflow_run_id
plan_id
plan_revision
plan_hash
submission_id
idempotency_key
created_at
```

Rules:

1. `(plan_id, plan_revision)` is immutable after acceptance.
2. Retrying the same `submission_id` MUST NOT create duplicate Jobs.
3. A changed plan MUST increment `plan_revision`.
4. `plan_hash` covers the normalized executable plan payload.
5. Feature 195 stores the accepted revision/hash on every derived root Job.
6. Feature 195 rejects a stale revision after a newer revision has become authoritative unless explicitly marked as a recovery replay.
7. Dynamic child Jobs carry the authoritative `plan_revision` plus their creation reason.

Suggested table:

```text
execution_plan_submissions
```

Fields:

```text
submission_id
goal_run_id
workflow_run_id
plan_id
plan_revision
plan_hash
status
accepted_at
rejected_reason
root_job_id
```

---

# 226. Semantic Replan vs Operational Fallback Boundary

Feature 195 owns **operational fallback**. Feature 196 owns **semantic replan**.

Feature 195 MAY change without returning to Feature 196:

```text
provider account within same Offer
queue lane
runtime instance
compatible execution node
container instance
retry timing
capacity lease
endpoint/model route explicitly allowed by the selected Offer
```

Feature 195 MUST emit:

```text
execution.replan_required
```

when continuation requires changing:

```text
logical capability
capability contract version
Offer outside allowed Offer set
quality class
privacy/locality boundary
user-pinned vendor/tool
interaction/control mode
material cost envelope
artifact semantics
approval policy
```

`execution.replan_required` payload:

```text
job_id
plan_step_id
reason
failed_offer_id
remaining_allowed_offer_ids
observed_cost
observed_health
constraints_snapshot
```

Feature 195 MUST pause affected downstream Jobs until Feature 196 responds with a new plan revision or a terminal decision.

---

# 227. Fencing Tokens and Atomic Capacity Reservation

Capacity leases MUST include a monotonically increasing or otherwise unique **fencing token** to prevent an expired/stale executor from committing results after ownership moved.

Recommended fields:

```text
lease_id
fencing_token
resource_key
job_id
attempt
owner_id
reserved_at
expires_at
released_at
```

Any mutation that depends on a capacity/execution lease SHOULD validate the current fencing token.

Atomic reservation MUST ensure:

```text
observed capacity
+ requested quantity
<= effective limit
```

under concurrency.

Implement with a transactional/atomic store appropriate to the resource. A plain read-then-increment sequence is forbidden.

---

# 228. Provider Limit Learning and Safe Adaptation

Provider-documented limits remain authoritative when known.

Observed telemetry MAY refine effective limits conservatively:

```text
429 / Retry-After
rate-limit headers
queueing response
provider task rejection
latency degradation
successful sustained throughput
```

Rules:

1. Learned limits never automatically exceed a documented hard limit.
2. Capacity increases above configured limits require Admin approval or an explicit Auto Capacity policy.
3. Decreases may happen automatically for safety.
4. Every adaptive change records reason, evidence window and expiry.
5. Provider Terms/contract policy can disable cross-account balancing or auto-activation.
6. Unknown limits start conservative and are expanded only from evidence.

Suggested record:

```text
provider_limit_observations
```

---

# 229. Execution Data Governance, Retention and Residency

Feature 195 MUST enforce execution-side data policy received from Feature 196/tenant policy.

Every Job may carry:

```text
data_classification
residency_policy
retention_policy_id
external_processing_allowed
log_redaction_level
artifact_retention_class
```

Required behavior:

- secrets never enter Queue payloads or ordinary events
- sensitive inputs are passed by scoped references
- temporary runtime workspaces have deterministic cleanup
- logs/events have configurable retention shorter than durable product assets
- deleted/revoked source assets cause future retries to fail safely rather than using stale cached copies
- regional/provider restrictions are checked before dispatch
- external provider submission records what data classes were sent, without storing secret content
- execution data deletion supports policy-driven tombstone/audit semantics

Retention classes SHOULD include:

```text
ephemeral_debug
short_execution
standard_history
compliance_audit
durable_library
```

---

# 230. Runtime/Container Supply-Chain Security

Every Runtime Package or Container image used by Feature 195 MUST have:

```text
package_id
version
immutable digest
publisher
signature/attestation
SBOM reference
build provenance
compatibility range
security status
release channel
```

Rules:

1. production MUST pin digest, never floating `latest`
2. signature/provenance verification before activation
3. vulnerability policy can block new activation
4. permission/capability delta is reviewed before rollout
5. rollback retains last-known-good package
6. staged rollout supports canary Runner/Container nodes
7. package revocation immediately prevents new Jobs
8. currently-running Jobs follow emergency policy: finish, drain or terminate

---

# 231. SLO, Disaster Recovery and Incident Modes

Feature 195 MUST define measurable operational objectives.

Initial SLO categories:

```text
Job create availability
dispatch latency
event propagation latency
queue recovery
provider callback ingestion
lease/watchdog detection
result durability
billing settlement
```

Production deployment MUST define concrete targets after benchmark.

Disaster recovery requirements:

```text
PostgreSQL backup/restore policy
RPO
RTO
R2 durability assumptions
Queue outage procedure
Workflow outage procedure
provider outage procedure
regional incident procedure
```

Degraded modes:

```text
accept Jobs but hold dispatch
disable selected providers
local-only mode
cloud-only mode
read-only monitoring
pause recurring workloads
```

Incident mode MUST be visible in Admin UI and reflected to Feature 196 so users receive accurate high-level status.

---

# 232. Hot-Path Scalability, Indexing and Archival

For 100–1,000+ active users and long history, schema design MUST separate hot operational queries from historical analytics.

Minimum indexing review:

```text
worker_jobs(status, queue_class, queued_at)
worker_jobs(tenant_id, user_id, created_at)
worker_jobs(goal_run_id, workflow_run_id)
worker_job_events(job_id, sequence)
capacity_leases(resource_key, state, expires_at)
provider_executions(provider_id, provider_account_id, provider_status)
worker_job_outbox(published_at, cancelled_at, quarantined_at, next_attempt_at)
```

`worker_job_outbox` is the physical canonical table; `job_outbox` is not a second
table or an alternate implementation name.

In this target index review, `capacity_leases` and `provider_executions` are
logical role names from the earlier design. The current repository's provider
admission baseline is `worker_job_provider_reservations`; any new physical table
for the remaining roles requires a fresh equivalence and impact review.

Rules:

- large event/log tables must support partitioning/archive strategy
- polling endpoints must use cursor pagination, not large offset scans
- dashboard aggregates SHOULD use rollups/materialized views/cache rather than scanning raw events
- Job creation path must not synchronously compute historical analytics
- Queue scheduling must avoid one global DB lock
- fairness/capacity state must be horizontally scalable

---

# 233. Exactly-Once Effect for 195 → 196 Execution Events

Network delivery between Features 195 and 196 is at-least-once; business effects MUST be idempotent.

Every cross-plane event includes:

```text
event_id
event_schema_version
goal_run_id
workflow_run_id
job_id
job_attempt
sequence
occurred_at
```

Feature 196 MUST dedupe by `event_id` and preserve ordering by `(job_id, sequence)` where required.

Feature 195 MUST retain/replay enough normalized events to recover from a Feature 196 outage.

Terminal event redelivery MUST NOT:

- duplicate user notifications unintentionally
- duplicate billing
- create a new Goal Run
- recreate artifacts

---

# 234. Retry, Fallback and Charging Semantics

Billing MUST distinguish:

```text
successful billable work
provider charge incurred before failure
platform retry overhead
user-caused re-run
quality fallback
system recovery retry
```

Rules:

1. credit reservation is not final charge
2. retries caused by SmartAIHub infrastructure SHOULD NOT double-charge service fees
3. provider costs that were actually incurred may be recorded even if Job later fails, according to product policy
4. duplicate provider submissions caused by a SmartAIHub idempotency failure are platform loss by default
5. fallback to a more expensive Offer requires Feature 196 policy/budget authorization
6. final Goal cost rolls up only settled ledger entries

---

# 235. Manual/Hybrid Handoff Control Lease

When a workflow enters a manual Plugin/editor step, automation and the human editor MUST NOT mutate the same working artifact concurrently without an explicit collaboration model.

Introduce:

```text
handoff_control_lease
```

Fields:

```text
goal_run_id
workflow_run_id
plan_step_id
artifact_id
control_owner = automation|user|plugin
lease_version
acquired_at
expires_at nullable
state
```

Flow:

```text
automation checkpoints artifact
→ acquire user/plugin control
→ downstream automation pauses
→ user edits/version commits
→ handback event
→ Feature 196 recompiles mappings if needed
→ Feature 195 resumes downstream Jobs
```

---

# 236. Contract Compatibility and Staged Rollout

Feature 195 MUST support multiple adjacent versions during rolling deployment.

Compatibility dimensions:

```text
queue message schema
execution-plan schema
execution event schema
Runner protocol
Runtime Package protocol
Provider Adapter contract
```

Each producer advertises current version; consumers declare:

```text
min_supported
max_supported
preferred
```

Rollout:

```text
dev
staging
canary
percentage rollout
full rollout
```

A new version MUST have rollback path before production activation.

---

# 237. Evidence/Source Artifact Support

Feature 195 does not decide research truth, but it MUST preserve evidence artifacts emitted by research-capable Offers.

Artifact metadata MAY include:

```text
source_url
source_type
publisher
published_at
retrieved_at
content_hash
citation_locator
evidence_role
producing_job_id
```

These fields allow Feature 196 to build source-backed reports and detect stale/replaced evidence.

---

# 238. Cross-Spec Contract Test Matrix

CI SHOULD run contract tests across supported version combinations:

```text
Spec 196 planner → Spec 195 plan ingestion
Spec 195 event → Spec 196 event ingestion
Runner protocol
Worker compatibility adapter
Provider Adapter
Runtime Package
Plugin/Offer capability contract
```

Required cases:

- duplicate submission
- stale plan revision
- out-of-order event
- replan request
- manual handoff
- budget exceeded
- provider account cooldown
- runtime offline
- schema upgrade/downgrade
- cancellation race
- terminal event replay

---

# 239. Feature 195 Review Addendum — Definition of Done

Feature 195 is not considered architecture-complete until, in addition to previous criteria:

1. plan submission is revisioned and idempotent
2. semantic replan vs operational fallback boundary is enforced
3. capacity reservations are atomic and fenced
4. data retention/residency policy reaches the executor
5. runtime/container supply chain is verified and rollback-capable
6. 195→196 events are replayable and idempotent
7. manual/hybrid handoff prevents concurrent mutation
8. SLO/DR/degraded modes are specified for production
9. hot-path indexes/archival strategy are verified under load
10. retry/fallback charging cannot double-charge due to system duplication
11. contract compatibility is tested during rolling upgrades
12. evidence artifacts can preserve source lineage when produced
---

# 240. Queue Credential Isolation, Work Offers and Targeted Assignment

Cloudflare Queue credentials are platform infrastructure credentials. They MUST remain only in SmartAIHub-controlled services/secrets.

End-user devices receive only SmartAIHub device credentials scoped to:

```text
device identity
tenant/user ownership
capabilities
Job lease/heartbeat/events/artifact operations
```

Normalize two pre-execution mechanisms:

1. **Eligible-pool work offer** — the default for Runner/Worker work. It does not require a physical node before claim.
2. **Targeted assignment lease** — used only when a specific node is required by affinity or explicit pinning.

Default work-offer fields:

```text
work_offer_id
job_id
pool_id
candidate_node_id optional
offer_scope
created_at
expires_at optional
state
reason
```

Targeted assignment fields:

```text
assignment_id
job_id
candidate_node_id
assignment_fencing_token
assigned_at
claim_deadline_at
state
```

Work-offer/assignment states MAY include:

```text
offered
pending_claim
claimed
declined
expired
revoked
cancelled
```

Queue ACK is independent of device response time. For pool work, the Job remains dispatch-ready until an authorized Runner atomically claims it; for targeted work, claim-deadline expiry returns the Job to the eligible pool or triggers policy-defined fallback.
---

# 241. Execution-Time Authorization and Entitlement Revalidation

Feature 196 filters Offers during planning, but Feature 195 MUST revalidate execution authorization immediately before irreversible/paid execution to prevent time-of-check/time-of-use errors.

Revalidate:

```text
user/tenant status
Offer entitlement
Plugin/runtime enabled state
delegation expiry/scope
budget/credit reservation
provider policy
artifact/input access
data/residency policy
execution node ownership
```

If authorization changed after planning:

```text
execution.authorization_changed
```

and either:

- wait for user/admin action
- request Feature 196 replan
- fail safely

according to policy.

Jobs SHOULD preserve `context_snapshot_id` and authorization/policy version references for provenance without copying unrestricted context into the Job row.
---

# 242. DAG Dependency Readiness and Queue Ordering

Cloudflare Queue delivery order MUST NOT be used as workflow dependency ordering.

Feature 195 needs explicit dependency state. Suggested logical table:

```text
job_dependencies
```

Fields:

```text
job_id
depends_on_job_id
dependency_type = success|required_terminal|artifact_available|approval|condition
condition_ref optional
created_at
```

A Job becomes `dispatch_ready` only when all required dependencies are satisfied.

Support:

```text
fan-out
fan-in/barrier
conditional branch
skipped branch
optional dependency
late-created child Job
```

The readiness transition MUST be transactional/idempotent and may emit an Outbox dispatch event.

Do not enqueue every future DAG step at plan acceptance and rely on consumers to hold/retry it until predecessors finish.

---

# 243. Asset Locality, Transfer and Large Media Handling

Execution planning may select local or cloud compute based on where large inputs already exist. Feature 195 MUST model asset accessibility explicitly.

Input reference MAY include:

```text
asset_id
content_hash
size_bytes
location_kind = library_r2|runner_local|worker_local|mobile_upload|external_url|provider_output
location_ref
access_scope
expires_at
```

Transfer requirements:

- resumable/chunked upload for large mobile/video inputs where practical
- checksum verification
- signed short-lived transfer URLs
- restartable downloads
- transfer progress as a first-class Job/Step when material
- local cache keyed by immutable content hash
- cache retention policy
- egress/network cost telemetry where relevant
- never expose arbitrary local filesystem paths to another tenant/node

When a file exists only on a Runner, Feature 195 may prefer a compatible local executor or create an explicit transfer Job according to the Feature 196 Plan policy.

---

# 244. Compensation and Partial Failure Semantics

A multi-step workflow may have completed external effects before a later step fails. Retry alone is insufficient.

Each executable step SHOULD declare:

```text
side_effect_class
compensation_capability optional
compensation_policy
reusable_output
```

Examples:

- uploaded temporary file → delete temporary file
- reserved resource → release resource
- draft social post → delete draft when safe
- published post → do NOT auto-delete unless explicitly approved/policy allows
- provider-generated paid asset → retain/reuse even if downstream editing fails

Feature 195 records compensation as canonical child Jobs/events. Compensation failures are visible and audited.


---

# 245. Feature 197 Alignment and Normative Precedence

Feature 195 remains the authoritative execution-state specification. Feature 197 defines the Runner-side execution fabric and learning contracts that Feature 195 MUST enforce or consume.

When older text in Feature 195 conflicts with the following revised local-execution rules, sections 245 onward take precedence for Runner-hosted execution:

```text
canonical Job / attempt / lease / retry / cost truth     → Feature 195
Goal / Plan / semantic binding / approval truth          → Feature 196
Runner local topology / local discovery / control model  → Feature 197
experience-learning feedback                             → Feature 197
```

Feature 197 MUST NOT introduce a second canonical Job table, queue state machine or planner.

---

# 246. Runner-First Local Execution Invariant

For production execution, a local CLI, Agent, media runtime, browser runtime, local MCP server or custom executable installed on a Windows/macOS/Linux host where SmartAIHub Runner is supported MUST be exposed through that Runner instead of registering as an independent SmartAIHub execution node.

Examples:

```text
Runner Office-PC-01
├── Claude Code CLI
├── Codex CLI
├── Hermes CLI
├── FFmpeg / FFprobe
├── ComfyUI
├── Browser automation
├── Local AI
└── Local MCP servers
```

Core registers the Runner device identity. Local implementations are subordinate runtime/tool identities for provenance and local resolution.

Allowed exceptions:

```text
legacy migration mode
development/debug mode
unsupported Runner platform
genuinely remote/cloud service
explicitly approved specialized integration
```

A local tool MUST NOT receive Cloudflare Queue credentials or independent Job-claim authority outside Runner unless an explicit architecture revision permits it.

---

# 247. Runner Capability Discovery and Dynamic Inventory

Runner MUST continuously maintain two distinct inventories:

```text
Tool Inventory       — what executables/services/MCP endpoints exist locally
Capability Inventory — what semantic work the Runner can currently perform
```

Discovery triggers SHOULD include:

```text
startup
Runner upgrade
periodic rescan
explicit rescan
PATH/package/config change when detectable
MCP configuration change
adapter/runtime package update
execution failure indicating stale metadata
```

Runner MAY discover through:

```text
PATH / known install locations
package managers
safe `--version` probes
adapter-specific health checks
MCP configuration + tools/list
approved local service/runtime configuration
GPU/CPU/RAM/VRAM inventory
browser/runtime dependencies
authentication-state probes that do not expose secrets
```

Discovery states:

```text
discovered
probed
verified
ready
busy
degraded
auth_required
unsupported
disabled
```

A newly found executable MUST NOT automatically become production-capable. It requires a signed/approved adapter, manifest or administrator-approved Generic CLI profile.

Runner sends versioned capability snapshots and deltas to Core. Core MUST record snapshot freshness and MUST NOT assume stale capability data is current.

Suggested normalized events:

```text
runner.capability_snapshot
runner.capability_added
runner.capability_changed
runner.capability_removed
runner.runtime_health_changed
runner.auth_state_changed
```

---

# 248. Two-Level Scheduling and Resolution

Feature 195 MUST distinguish global scheduling from Runner-local implementation selection.

```text
Feature 196 Compiled Plan
        ↓
Feature 195 Global Resolver
        ↓
Runner / managed backend / provider / remote service
        ↓
Runner Local Resolver
        ↓
Claude / Codex / Hermes / FFmpeg / ComfyUI / MCP / other local implementation
```

Global resolver owns:

```text
eligible Runner pool
fairness/priority
tenant/user isolation
data locality
budget/privacy/control constraints
required capability
specific local tool when explicitly pinned
```

Runner local resolver owns:

```text
current tool readiness
local slots/resources
adapter health
local runtime/session availability
allowed local implementation choice
```

Runner may select a local implementation only from the policy envelope compiled by Feature 196.

If the Plan pins Claude, Runner MUST NOT silently substitute Codex. If the Plan allows capability-bound local resolution, Runner MAY select any currently eligible local implementation.

---

# 249. Execution Resource Pools and Pool-First Leasing

The default local scheduling unit is an **Execution Resource Pool**, not a preselected physical node.

Pool scopes MAY include:

```text
user-owned Runner pool
tenant-shared Runner pool
project-dedicated pool
managed SmartAIHub runtime pool
```

Before claim:

```text
assigned_node_id = null
```

Recommended flow:

```text
Job becomes dispatch-ready
→ Core identifies eligible pool(s)
→ optional WSS `work.available` hint
→ Runner calls `lease_next()` with current snapshot/free slots
→ Core performs atomic policy/fairness/capability match
→ work offer/claim persisted
→ execution lease + fencing token created
→ Runner starts work
```

Runner MUST NOT browse arbitrary Jobs or locally choose from another user's/tenant's raw queue.

Targeted assignment is permitted only when justified by:

```text
explicit user/device pin
large local-only artifact affinity
interactive-session affinity
exclusive hardware/device dependency
strict local data-residency requirement
manual handoff to a specific device
```

---

# 250. Work Offer, Claim and Execution Session

Feature 195 SHOULD normalize the following concepts.

## 250.1 Work Offer

```text
work_offer_id
job_id
pool_id
candidate_node_id optional
offer_scope
created_at
expires_at optional
state
reason
```

States MAY include:

```text
offered
accepted
declined
expired
revoked
```

Decline before work starts is not a full execution failure.

## 250.2 Execution Session

After atomic claim, create an execution-session identity separate from the logical Job:

```text
execution_session_id
job_id
attempt_id
runner_id / backend_id
lease_id
fencing_token
control_profile_id
started_at
last_seen_at
state
```

A Runner-hosted session MAY contain nested local runtime sessions without creating separate top-level execution nodes for each CLI.

Example:

```text
Job J100
└── Attempt A2
    └── Runner Windows-03
        ├── Codex session C1
        ├── Browser session B1
        └── FFmpeg process F1
```

---

# 251. Runner Local Runtime Adapter Contract

Runner MUST support an extensible adapter model rather than hard-code every local tool in SmartAIHub Core.

Canonical local interface:

```text
LocalRuntimeAdapter
```

Recommended contract:

```text
discover()
probe()
version()
capabilities()
auth_state()
health()
resource_requirements()
estimate() optional
start()
status()
stream_events() optional
steer() optional
pause() optional
resume() optional
cancel()
checkpoint() optional
collect_artifacts()
cleanup()
```

Initial adapters SHOULD include:

```text
CodexCLIAdapter
ClaudeCLIAdapter
HermesCLIAdapter
FFmpegAdapter
RemotionAdapter
ComfyUIAdapter
BrowserAdapter
DesktopControlAdapter
ApprovedLocalRuntimeAdapter
LocalAIAdapter
MCPAdapter
GenericCLIAdapter
```

Adapter/runtime packages MUST participate in the existing signed Runtime Package supply-chain, compatibility and rollback controls.

---

# 252. Agent Execution Envelope and Internal Tool Autonomy

Runner supervises the **execution envelope** of Claude/Codex/Hermes-like Agents but MUST NOT assume every internal Agent tool call is routed through Runner.

Runner can authoritatively control only what the selected integration surface exposes, such as:

```text
process/session lifecycle
working directory
environment
resource limits
job lease
cancel/terminate when supported
checkpoint/files when supported
progress/events when observable
job-scoped configuration injection when supported
```

User-owned Skills, MCP servers, subscriptions and local Agent tools remain available according to Feature 196 policy.

Feature 195 MUST represent observability honestly:

```text
PROCESS_ONLY
SESSION_EVENTS
TOOL_EVENTS
FULL_TOOL_TRACE
```

Unknown internal tool usage/cost remains `unknown`, not `zero` or inferred fact.

---

# 253. Durable Execution Control Inbox

Job dispatch and runtime control are separate channels.

Feature 195 MUST persist control commands in a durable canonical store such as:

```text
execution_control_commands
```

Suggested fields:

```text
command_id
job_id
execution_session_id
attempt_id
sequence
command_type
payload_json
requested_by
created_at
expires_at
status
delivered_at
acknowledged_at
applied_at
error_code
```

Supported normalized commands MAY include:

```text
STATUS_REQUEST
STEER_CURRENT
PATCH_CONTEXT
PAUSE
RESUME
CANCEL_EXECUTION
CHECKPOINT
SWITCH_LOCAL_RUNTIME
HANDOFF_REQUEST
DRAIN_AFTER_STEP
```

Transport strategy:

```text
WSS notification = fast path
HTTPS pull/control cursor = durable fallback
PostgreSQL = source of truth
```

A WSS send is never proof that a command was applied.

---

# 254. Control Command Lifecycle and Idempotency

Control command lifecycle:

```text
created
→ queued
→ delivered
→ acknowledged
→ applied
```

Terminal alternatives:

```text
rejected
unsupported
expired
failed
superseded
```

Every command MUST have an idempotency key or stable `command_id` and monotonic session sequence where ordering matters.

`desired_state` and `observed_state` MUST remain separate.

Example:

```text
desired_state = cancelled
observed_state = running
control_state = cancel_requested
```

UI MUST NOT report the executor stopped until observed/reconciled evidence supports it.

---

# 255. Control Capability Profiles

Every execution implementation SHOULD advertise a normalized control profile.

Suggested levels:

```text
L0 NONE
L1 LEASE_ONLY
L2 COOPERATIVE_POLL
L3 SESSION_CONTROL
L4 FULL_INTERACTIVE
```

Example support flags:

```text
status
stage_progress
native_percent
steer
pause
resume
cancel
checkpoint
handoff
nested_tool_events
```

Runner itself can provide L4 transport/control for the local execution envelope, while a nested Agent may expose a lower capability level internally.

Feature 195 MUST enforce the minimum control level compiled by Feature 196 when one is required.

---

# 256. Local Handoff and Cross-Runner Handoff

When the user/system requests a change from one local implementation to another, Feature 195 SHOULD prefer a safe local handoff if the same Runner can satisfy the new policy.

Example:

```text
Runner Windows-01
Codex running
→ checkpoint/stop Codex
→ start Claude on same Runner
→ preserve attempt lineage and artifacts
```

If local handoff is unavailable:

```text
Runner returns LOCAL_HANDOFF_UNAVAILABLE
→ release/finish old execution ownership safely
→ Job enters canonical `waiting_resource` with an explicit reason code
→ other eligible Runner or backend claims
```

Handoff MUST create a new runtime/session identity and fencing generation where required. The previous session cannot later overwrite the canonical result.

---

# 257. Executor Disposition Contract

Do not collapse all non-success outcomes into `failed`.

Normalized dispositions:

```text
ACCEPTED
DECLINED
PARTIAL
CANNOT_CONTINUE
COMPLETED
FAILED
CANCELLED
LOST
```

When work has started and execution does not complete, persist where available:

```text
reason_code
retryable
work_started
side_effects_committed
checkpoint_ref
artifact_refs
completed_capabilities
remaining_capabilities
recommended_next_action
```

`DECLINED` does not consume the same retry budget as an execution failure.

`PARTIAL` / `CANNOT_CONTINUE` SHOULD preserve valid work for downstream reuse or handoff.

---

# 258. Progress and Activity Normalization

Feature 195 MUST support multiple observability levels without fabricating precision.

Normalized progress fields SHOULD include:

```text
lifecycle_state
stage
activity_message
progress_percent optional
progress_source
progress_confidence
eta_seconds optional
last_progress_at
```

`progress_source` examples:

```text
executor_native
adapter_derived
workflow_derived
estimated
unknown
```

If only lifecycle is available, report only lifecycle. If stage/activity is available, surface it. Estimated percentage MUST be labeled as estimated.

Runner MUST normalize local process/Agent events into canonical Job events while preserving raw adapter diagnostics separately for debugging.

---

# 259. Interactive User Intervention Execution Contract

Feature 195 executes runtime-side effects of user intervention only after Feature 196 classifies whether the command changes Plan semantics.

Execution-level commands MAY be applied without semantic replan when within the current compiled envelope, for example:

```text
cancel current attempt
pause/resume supported runtime
request checkpoint
switch among explicitly allowed equivalent local implementations
```

Commands that change output requirements, cost/privacy boundary, required Offer/tool, downstream DAG or quality contract MUST be represented by a Feature 196 Plan revision or explicit replan decision before Feature 195 executes the new semantics.

Every intervention MUST be preserved in provenance.

---

# 260. Quality Gate as Completion Contract

When a Plan Step declares mandatory quality evaluation, `process_exit=0`, provider `succeeded`, or Agent `completed` produces `OUTPUT_PRODUCED`, not canonical `COMPLETED`.

Required lifecycle:

```text
running
→ event/attempt phase `output_produced`
→ canonical Job state `validating`
→ quality event `quality_passed`
→ completed
```

or:

```text
validating
→ quality event `quality_failed`
→ repair / retry / fallback / replan / human decision
```

Feature 196 owns the semantic Quality Contract. Feature 195 owns execution of the gate, persistence of evidence and enforcement of retry/repair policy.

Quality evaluation MAY be:

```text
deterministic validator
domain-specific QC
AI evaluator
human approval
composite gate
```

---

# 261. Layered Retry Budgets and Failure Classification

A single `attempt` counter is insufficient for orchestration analytics and policy.

Feature 195 SHOULD persist at least:

```text
dispatch_attempt
work_offer_attempt
execution_attempt
same_node_retry
quality_attempt
repair_attempt
replan_count
```

Failure classes SHOULD distinguish:

```text
DISPATCH_FAILURE
ASSIGNMENT_EXPIRED
NODE_LOST
RUNTIME_CRASH
RESOURCE_EXHAUSTED
AUTH_FAILURE
INPUT_INVALID
DEPENDENCY_FAILURE
PROVIDER_FAILURE
RATE_LIMIT
NETWORK_FAILURE
OUTPUT_INVALID
QUALITY_FAILED
POLICY_FAILED
SIDE_EFFECT_UNCERTAIN
USER_CANCELLED
USER_REJECTED
USER_REFINEMENT
```

Retry policy evaluates:

```text
failure class
side-effect class
same-failure recurrence
remaining budget
repeat cost
deadline
current runtime/provider health
quality requirement
checkpoint/reuse availability
```

A node loss SHOULD usually return work to the eligible pool rather than retry the same physical node repeatedly.

---

# 262. Repair, Regenerate, Fallback and Replan Escalation

Quality or execution remediation SHOULD escalate deliberately:

```text
local repair when safe/cheaper
→ retry current implementation when evidence supports it
→ different eligible local implementation/node
→ allowed fallback Offer
→ Feature 196 replan
→ user/human decision
```

Repeated identical failure MUST reduce the value of repeating the same strategy.

Structured QC/failure feedback SHOULD be passed to a repair/regeneration attempt rather than blindly resubmitting identical inputs.

Feature 195 MUST NOT select an Offer outside Feature 196's pre-authorized equivalent set. Crossing semantic, quality, privacy, control or material-cost boundaries requires `execution.replan_required`.

---

# 263. Offline Runner Recovery and Local Journal

Runner local journal SHOULD persist enough non-secret state to reconcile after network interruption or process restart:

```text
active execution sessions
lease/fencing token
local process/session identifiers
adapter/runtime identity and version
checkpoint references
last emitted event sequence
pending artifact uploads
pending control-command cursor/acks
local completion evidence
```

After reconnect:

```text
Runner sends recovery report
→ Core compares lease/fencing/session state
→ resume / accept completion / cancel / invalidate / requeue
```

Runner MUST NOT assume its local state is canonical after reconnect.

---

# 264. User-Owned Tool Cost and Telemetry Semantics

For Runner-hosted Agents, SmartAIHub may not know the exact external cost of user-owned subscriptions, Skills, MCP services or API keys.

Represent:

```text
smartaihub_cost = authoritative
external_user_owned_cost = known | estimated | unknown
```

`unknown` MUST NOT be converted to zero.

Feature 195 records tool/provenance detail only to the observability level actually available. Opaque internal Agent activity remains opaque.

---

# 265. Three Integration Directions and Credential Isolation

Feature 195 MUST preserve three distinct integration directions:

```text
A. Runner Execution Plane
   SmartAIHub ↔ Runner
   SmartAIHub assigns/controls execution.

B. MCP Inbound Command Plane
   External MCP client → SmartAIHub MCP Server
   Client may invoke only exposed MCP capabilities/scopes.

C. MCP/Connector Outbound Plane
   SmartAIHub → external MCP/service/provider
   SmartAIHub consumes an external capability.
```

MCP inbound authentication does not grant Runner device privileges.

Runner device credentials do not automatically grant arbitrary public MCP user authority.

Outbound connector credentials cannot be reused as SmartAIHub login/device credentials.

Canonical credential classes SHOULD remain distinct:

```text
RunnerDeviceCredential
MCPInboundPrincipal
ConnectorCredential
JobScopedDelegatedCredential
```

---

# 266. Optional Job-Scoped SmartAIHub MCP for Runner-Hosted Agents

When supported by the local Agent, Runner MAY provision a temporary/job-scoped SmartAIHub MCP configuration so the Agent can optionally call platform capabilities such as Library or managed generation.

This is not mandatory tool routing.

Rules:

1. existing user Skills/MCP/tools remain available unless Feature 196 policy restricts them
2. delegated MCP credential is scoped to the parent Job/Goal, allowed capabilities and budget
3. nested platform calls MUST preserve `parent_job_id`, `execution_session_id` and provenance
4. expensive SmartAIHub capability calls remain subject to credit/budget/approval policy
5. Agent may use user-owned alternatives when binding policy permits
6. Runner MUST NOT rewrite permanent/global Agent configuration when job-scoped configuration is sufficient

Nested SmartAIHub capability calls become canonical child Jobs when asynchronous/durable execution is required.

---

# 267. Nested Child Jobs and Parent Execution Waiting

A Runner-hosted Agent MAY request SmartAIHub platform capability during a Job when Feature 196 policy permits it.

Example:

```text
Parent Job J100 — Runner/Claude
    ↓ request image.generate
Child Job J101 — SmartAIHub managed provider
    ↓ artifact result
Parent Job J100 resumes
```

Parent Job may enter:

```text
waiting_child_job
waiting_external
waiting_approval
```

without losing its execution lineage.

Do not require the local Agent to know provider-account, queue or Cloudflare implementation details.

---

# 268. Nested Execution Provenance

Feature 195 MUST reconstruct not only the selected backend but the nested execution topology when observable.

Example:

```text
Goal Run
→ Plan revision 7
→ Step research_and_edit
→ Job J100
→ Runner Office-PC-03
→ Local resolver selected Codex
→ Codex used Browser (observable)
→ Codex returned partial checkpoint
→ local handoff to Claude
→ Claude requested child Job J101 image.generate
→ provider output returned
→ FFmpeg local render
→ QC pass
→ completed
```

Provenance SHOULD include versions where available:

```text
runner_version
adapter_version
local_tool_version
agent/model version
MCP server identity/version
plan_revision
policy_version
capability_contract_version
```

This provenance is an input to Feature 197 learning; it is not merely debug logging.

---

# 269. Runner and Local Tool Security Boundary

Runner is a privileged local component and MUST enforce attenuating delegation.

Effective permission is no greater than:

```text
user/tenant permission
∩ compiled Plan permission
∩ Job permission
∩ Runner/device policy
∩ adapter/tool restriction
```

Capability scopes MAY include:

```text
filesystem.read
filesystem.write
process.execute
browser.read
browser.interact
computer.keyboard
computer.mouse
network.access
credential.use
publish.external
destructive.write
```

Local vendor credentials SHOULD remain local when possible. Core normally needs health/auth state, not the secret itself.

High-impact external effects require idempotency, reconciliation and approval controls appropriate to the side-effect class.

---

# 270. Enterprise Shared Runner Pools

Tenant administrators MAY mark selected Runner capacity as tenant-shared.

Scheduler MUST enforce:

```text
tenant membership/authorization
project/device restrictions
resource quotas
concurrency limits
data-locality/privacy policy
fairness between users/projects
admin drain/disable policy
```

A tenant-shared Runner remains one device identity even if it exposes many local capabilities.

Local user-owned personal tools MUST NOT automatically become tenant-shared merely because the host Runner is shared; each capability/implementation needs an explicit share policy.

---

# 271. Data Model Extensions

Reuse existing tables where possible. Add/normalize only where existing schema cannot represent the contract.

Recommended entities/views:

```text
runner_tool_inventory
runner_capability_inventory
runner_runtime_health
runner_resource_snapshots

work_offers
execution_attempts
execution_sessions
execution_control_commands
execution_handoffs
execution_checkpoints
quality_evaluations
retry_budget_state
```

All new entities MUST reference canonical `worker_jobs`/Job identifiers and preserve tenant/user authorization boundaries.

Do not create a separate Runner job table as source of truth.

---

# 272. Runner Protocol Surface

Recommended versioned protocol surface:

```text
session.connect / WSS
runner.heartbeat
runner.capability_snapshot
runner.capability_delta
runner.resource_snapshot

work.available                 # push hint
POST /runner/leases/next       # atomic work match/claim
POST /runner/work/{id}/decline
POST /runner/jobs/{job}/heartbeat
POST /runner/jobs/{job}/events
POST /runner/jobs/{job}/checkpoint
POST /runner/jobs/{job}/complete
POST /runner/jobs/{job}/fail

control.available              # push hint
GET/POST /runner/control/next
POST /runner/control/{id}/ack
POST /runner/control/{id}/result

POST /runner/jobs/{job}/child-capability-request
```

Exact REST/WSS naming may change during implementation, but the semantic separation of work lease, execution lease, events and control inbox MUST remain.

---

# 273. Compatibility and Migration from Legacy Worker

Migration MUST avoid creating permanent old/new parallel architectures.

Phases:

```text
1. Wrap legacy Worker behavior behind existing ExecutionBackend adapter.
2. Introduce Runner device identity and capability inventory.
3. Add pool-first lease_next() while preserving targeted legacy assignment adapter.
4. Move local CLI/MCP/tool registration behind Runner.
5. Add durable Control Inbox and execution sessions.
6. Add local resolver and handoff.
7. Add mandatory QC/retry contracts per capability.
8. Enable nested provenance and learning telemetry.
9. Retire obsolete direct local-executor registrations.
10. Retire legacy assignment semantics after production evidence and rollback validation.
```

Every phase requires backward-compatible event/protocol version negotiation until the previous client version exits support.

---

# 274. Feature 195 Revised Acceptance Criteria

Feature 195 is not ready for Runner-first implementation until all of the following hold:

1. PostgreSQL remains canonical for all async Jobs.
2. Cloudflare Queue credentials never reach end-user Runner devices.
3. pool-first claim is the default for unpinned local work.
4. targeted assignment is an explicit exception.
5. Runner capability snapshots are freshness/version aware.
6. local tools are subordinate to Runner identity.
7. Runner local resolution obeys Feature 196's allowed implementation/binding policy.
8. work offer/decline does not consume execution retry incorrectly.
9. execution session and fencing prevent stale-owner completion.
10. durable control commands survive WSS disconnect/reconnect.
11. desired vs observed control state is visible.
12. local and cross-runner handoff preserve valid artifacts/checkpoints.
13. QC can block canonical completion.
14. layered retry budgets distinguish dispatch/execution/quality/repair/replan.
15. user-owned external cost can remain unknown without being misreported.
16. Runner/MCP inbound/MCP outbound credentials and privileges remain isolated.
17. nested SmartAIHub child Jobs preserve parent lineage and budget policy.
18. provenance can reconstruct Runner → local runtime → child Job path where observable.
19. tenant-shared Runner pools preserve capability-level sharing/permission boundaries.
20. rolling protocol compatibility and legacy migration have tested rollback paths.


---

# 275. Attempt vs Local Runtime Session Semantics

Feature 195 MUST distinguish a canonical execution attempt from nested local runtime sessions.

Definition:

```text
execution_attempt
= one continuous period of canonical execution ownership under one execution lease/fencing generation
```

A Runner may host multiple local runtime sessions inside one attempt.

Example:

```text
Attempt A5 — Runner Windows-01 owns lease F42
├── Runtime session R1 — Codex
└── Runtime session R2 — Claude after safe local handoff
```

If Runner retains the same valid execution lease and performs an allowed local handoff, the Job MAY remain on the same `execution_attempt` while creating a new `local_runtime_session` and `execution_handoff` record.

Create a new execution attempt when canonical ownership/fencing changes, including:

```text
cross-Runner handoff
lease expiry/recovery
return-to-pool followed by new claim
different managed backend ownership
retry after canonical execution failure when policy starts a new ownership cycle
```

This distinction prevents local tool switching from inflating retry counts while preserving exact provenance.

Suggested additional counter:

```text
local_handoff_count
```

---

# 276. Nested Child Job Budget and Settlement

When a Runner-hosted Agent invokes an asynchronous SmartAIHub capability that becomes a child Job, cost must not be double-counted between parent and child.

Rules:

1. parent Goal/Job budget envelope is authoritative for authorization
2. child Job creates its own credit reservation/metering entries for actual SmartAIHub service use
3. parent Job records child cost as attributed/subordinate cost, not a duplicate charge
4. retry/service-fee policy follows existing system-recovery/user-refinement charging semantics
5. child execution that exceeds remaining envelope requires approval/replan according to Feature 196 policy
6. user-owned external cost used by the parent Agent remains known/estimated/unknown separately

Suggested linkage:

```text
parent_job_id
budget_context_id
cost_attribution_group_id
```

Parent waiting time for a child Job is not active local compute time unless the Runner/Agent truly remains consuming resources required by policy.

---

# 277. Runner Discovery Privacy and Safety

Capability discovery MUST be bounded and privacy-aware.

Runner discovery MUST NOT perform arbitrary filesystem crawling, credential extraction or local-network scanning merely to discover capabilities.

Use:

```text
approved adapter discovery rules
known executable paths
explicit user-configured MCP endpoints
safe version/health probes
OS/package-manager metadata where permitted
```

Sensitive config values are redacted before telemetry leaves the device.

A discovered local MCP endpoint or executable is not callable until trust/enablement policy allows it.

---

# 278. Job Detail UI — Runner-Adaptive Additions

Existing Job Detail tabs SHOULD be extended to support:

```text
Overview
Steps
Attempts
Execution Path
Timeline
Controls
Quality
Logs
Artifacts
Permissions
Cost
Debug
```

User-facing view SHOULD show a simplified journey such as:

```text
Grok could not continue
→ Codex accepted on Office-PC-02
→ Codex research completed
→ switched locally to Claude by user request
→ waiting for SmartAIHub image generation child Job
→ FFmpeg render
→ QC passed
```

Admin/debug view may expose full Runner, adapter, runtime-session, lease/fencing, control-command and fallback metadata subject to secret redaction.


---

# 279. Atomicity and Uniqueness Invariants

Implementation MUST enforce atomic invariants in PostgreSQL, not only in application memory.

At minimum:

1. a Job cannot have two simultaneously valid canonical execution leases
2. a fencing generation monotonically advances when canonical ownership changes
3. pool claim selects Job + creates/updates attempt + creates lease atomically
4. targeted assignment claim cannot be won by two devices
5. idempotent Runner completion cannot settle cost/artifacts twice
6. one control command `command_id` cannot be applied twice as a new effect
7. one provider/client idempotency key cannot create duplicate paid submission when provider semantics permit prevention

Recommended techniques:

```text
transactional row locks / SKIP LOCKED where appropriate
partial unique indexes for active ownership
compare-and-swap on fencing generation
idempotency-key unique constraints
outbox transaction coupling
```

Exact SQL is implementation-specific, but race-safety is part of the contract.

---

# 280. Runner Delegated Platform Capability Client

Runner is bidirectional: it receives SmartAIHub Jobs and MAY request SmartAIHub platform capabilities while executing a parent Job.

Two supported paths:

```text
A. Runner-native delegated request
   deterministic Runner flow/adapter
   → Core child-capability API

B. Runner-hosted Agent delegated request
   Claude/Codex/Hermes
   → optional job-scoped SmartAIHub MCP
   → Core child-capability API
```

Both converge on the same canonical authorization and child-Job creation path.

Runner-native flows MUST NOT require an internal Agent to understand SmartAIHub MCP.

Request context MUST include/reference:

```text
parent_job_id
parent_execution_session_id
goal/workflow/plan lineage
requested capability
input/artifact refs
budget context
privacy/permission context
idempotency key
delegation depth/causation chain
```

Core remains responsible for selecting provider/cloud/other Runner implementation for the delegated capability.

---

# 281. Nested Delegation Cycle and Deadlock Prevention

Nested child capability requests introduce recursion and resource-deadlock risk.

Feature 195 MUST enforce:

```text
max_delegation_depth
causation_chain / ancestor_job_ids
capability recursion policy
resource-wait policy
child timeout/deadline
```

Reject or replan cycles such as:

```text
Parent Runner Agent
→ requests capability X
→ child Job X routes to same parent Agent/session
→ requests capability X again
```

When parent waits for a child Job, Runner/Core MUST decide whether parent resources can be released.

Example deadlock to avoid:

```text
Parent holds the only GPU slot
→ child Job requires same GPU slot
→ parent waits for child forever
```

Use one or more of:

```text
release/reduce parent resource reservation while waiting
route child to different eligible resource
allow re-entrant child only when adapter explicitly supports it
fail/replan when no deadlock-free schedule exists
```

Cancel semantics:

```text
cancel parent Goal/Job
→ cancel not-started descendants
→ request cancellation for running child Jobs according to policy
→ reconcile uncancelable external side effects
```

Child failure does not automatically cancel parent if parent workflow has an allowed fallback/repair path.

---

# 282. Runner-Hosted Artifact and Output Contract

General-purpose Agents may create files/results outside SmartAIHub's direct tool path. Runner MUST provide a normalized output contract so execution can complete deterministically.

Each Runner-hosted Job SHOULD define:

```text
required output schema/result contract
workspace root
allowed artifact directories
artifact collection rules
maximum artifact size/count when relevant
required final status/summary channel
```

Adapters MAY collect outputs from:

```text
stdout/structured response
known workspace manifest
explicit result file
Agent session API
artifact directory
adapter-specific result event
```

Runner MUST NOT upload arbitrary unrelated user files discovered on disk.

Artifact collection must respect privacy, path allowlists and Job permissions.

---

# 283. Local Tool Authentication Required State

Discovery may find an installed tool that is not currently authenticated.

Such capability MUST report:

```text
auth_state = required | expired | ready | unknown
```

Core/Runner UI SHOULD provide a user action such as:

```text
Open login instructions
Run local authentication flow
Re-probe
Disable capability
```

Runner MUST NOT attempt to extract or upload existing local credentials to Core merely to mark a capability ready.

Jobs requiring an unauthenticated local implementation return/enter an explicit waiting/decline reason and may use allowed fallback policy.


---

# 284. Direct External Agent and Outbound Connector Backends

Local Agent CLIs belong behind Runner, but genuinely remote/cloud Agent services remain valid direct execution backends.

`ExternalAgentExecutionBackend` is appropriate when:

```text
Agent is a remote/cloud service
programmatic execution API/session exists
SmartAIHub can persist a request/session identifier
status/result/control semantics are adapter-defined
```

`OutboundConnectorExecutionBackend` is appropriate for durable external MCP/connector/service work that is not a local Runner-hosted tool.

An external Agent that merely connects to SmartAIHub's inbound MCP and asks SmartAIHub to perform work is a **caller**, not automatically an execution backend.

---

# 285. Offer vs Local Implementation Identity

Feature 195 MUST not assume `offer_id == local executable/runtime`.

Example:

```text
Offer: user-owned local code/research execution
Execution backend: Runner
Runner local implementations:
- Codex CLI
- Claude Code
- Hermes CLI
```

Feature 196 may compile a generic Runner-capability Offer/envelope and permit Runner-local resolution, or may pin a specific implementation when semantics/user choice require it.

Feature 195 records both:

```text
selected_offer_id
actual_local_implementation_id optional
```

Telemetry, QC, latency and learning MUST retain the actual implementation identity when observable so Feature 197 can learn without redefining the commercial/semantic Offer.

---

# 286. Resource Wait and Fallback Timing

Feature 195 MUST honor Plan-defined resource-wait policy rather than wait indefinitely for local capacity.

Suggested policy inputs from Feature 196:

```text
preferred_pool_order
max_wait_per_pool
fallback_after_seconds
local_only
cloud_fallback_allowed
fallback_requires_approval
deadline_at
```

Example:

```text
user-owned Runner pool    wait up to 120s
→ tenant-shared pool      wait up to 30s
→ SmartAIHub cloud        requires approval
```

`waiting_resource` MUST carry a reason and current fallback deadline/decision state so monitoring can explain why work is waiting.

When policy is `local_only`, expiry produces attention/failure according to Plan policy rather than silent cloud substitution.

---

# 287. Control Command Conflict and Precedence

Concurrent user/system control commands require deterministic ordering.

Rules:

1. `CANCEL_EXECUTION` supersedes pending non-applied steer/pause/handoff commands unless policy explicitly converts cancellation into handoff
2. a newer approved `SWITCH_LOCAL_RUNTIME`/`HANDOFF_REQUEST` MAY supersede an older unstarted switch request
3. duplicate `command_id` is idempotent
4. commands targeting a stale fencing generation/session are rejected as stale
5. commands applied after Plan revision MUST reference/validate the effective revision
6. runtime adapter must not apply a queued command after canonical ownership has moved to another attempt/session

Persist supersession/denial reason for audit.

---

# 288. Runner Capability Claims Are Not Authorization

Runner-reported inventory/resource data is operational input, not proof of permission or trust.

Core MUST separately enforce:

```text
device identity
tenant/user ownership
capability enablement/share policy
Plan permission
adapter/package trust
entitlement
budget/privacy requirements
```

A compromised or misconfigured Runner advertising a capability MUST NOT gain permissions outside its authorized scope.

Higher-assurance environments MAY add device attestation or enterprise-managed Runner policy, but the baseline architecture must remain secure without assuming end-user devices are fully trusted.

---

# 289. Decision Records for Scheduling and Recovery

Material execution decisions SHOULD produce structured decision records/events, not only free-text logs.

Examples:

```text
why this Runner/pool was chosen
why another Runner was ineligible
why Codex was selected locally
why Grok/Codex path was abandoned
why fallback waited 120s then escalated
why retry/repair/replan was chosen
why control command was rejected
```

Decision record SHOULD reference:

```text
policy_version
plan_revision
capability snapshot
candidate set summary
selected option
reason codes
cost/quality/control constraints
learning evidence reference when used
```

This supports UI explanation, debugging and Feature 197 learning without reconstructing intent from raw logs.


---

# 290. Quality Evaluation Failure Is Not Quality Failure

Feature 195 MUST distinguish:

```text
QUALITY_FAILED
= evaluator successfully assessed output and output did not satisfy contract

QUALITY_EVALUATION_FAILED
= QC infrastructure/evaluator could not produce a trustworthy decision
```

Examples of evaluation failure:

```text
validator crashed
AI evaluator unavailable/rate-limited
required reference artifact missing due infrastructure error
human-review service unavailable
```

Default recovery for `QUALITY_EVALUATION_FAILED` is retry/fallback of the evaluator or attention according to policy, not regeneration of otherwise unassessed content.

Quality evidence SHOULD record:

```text
evaluator_id/version
quality_contract_version
input artifact hashes/refs
result
confidence where applicable
failure codes
```

---

# 291. Same Tool, Distinct MCP Caller and Runner Runtime Roles

The same software installation may participate in SmartAIHub through different roles that MUST remain separately authenticated and correlated.

Example Claude Code on one PC:

```text
Role A — user manually runs Claude and connects to SmartAIHub public MCP
         identity = MCPInboundPrincipal
         Claude is a caller

Role B — SmartAIHub Runner launches Claude for Job J100
         identity = RunnerDeviceCredential + execution session
         Claude is a nested local runtime
         optional SmartAIHub MCP = JobScopedDelegatedCredential
```

Role A does not grant Runner Job claim/control privileges.

Role B does not automatically inherit the user's public MCP session scopes.

Audit MUST identify which role caused each SmartAIHub request.

---

# 292. High-Impact Local Capabilities Require Explicit Enablement

Discovery does not imply permission to use powerful capabilities.

The following SHOULD be disabled or restricted until user/tenant policy enables them:

```text
computer.control
browser.interact with authenticated sites
filesystem.write outside Job workspace
credential.use
process.execute arbitrary command
publish.external
payment/destructive operations
```

Capability inventory MUST separate:

```text
technically_available
policy_enabled
currently_eligible
```

Runner local resolver may select only `currently_eligible` implementations/capabilities.

---

# 293. Local Implementation Selector Semantics

Feature 195 SHOULD accept either an explicit local implementation set or a policy selector from Feature 196.

Examples:

```text
allowed_local_implementation_ids = [codex-cli, claude-code]
```

or:

```text
allowed_local_selector:
  trust_state >= verified
  provides capability contract X
  user_owned = true
  control_level >= L2
  forbidden_ids = [...]
```

If `local_resolution_allowed=true` and no explicit list/selector narrowing is supplied, eligibility defaults to any trusted, policy-enabled implementation on the claimed Runner that satisfies the capability contract and all user/tenant/Plan constraints.

Actual selected implementation/version is always recorded.

---

# 294. Codebase Alignment Baseline — 2026-09-17

This specification is the target Feature 195 contract. The following implementation baseline was verified in the repository on 2026-09-17 and MUST remain explicit during rollout:

| Contract area | Current repository evidence | Alignment status |
|---|---|---|
| Canonical Job state | `apps/web/drizzle/schema.ts` tables `worker_jobs`, `worker_job_events`, `worker_job_attempts` | Implemented baseline via Feature 186; authoritative target for this feature |
| Outbox and dispatch identity | `worker_job_outbox`, `worker_job_dispatches`, event/action idempotency | Implemented baseline; these are the physical equivalents of the logical outbox/inbox concepts above |
| Provider admission | `worker_job_provider_reservations` and the Node Job Control Plane service | Implemented baseline; provider account selection remains late-bound |
| Node control plane | `apps/web/server/services/jobControlPlaneGateway.ts`, `apps/web/server/services/jobControlPlane.ts`, `apps/web/server/routes/jobControlPlane.ts` | Implemented baseline; `createControlPlaneJob` is the producer boundary |
| Python bridge | `python-backend/app/api/internal_job_control_plane.py` and `python-backend/app/services/job_control_plane.py` | Implemented transport adapter; it does not create a second Job truth |
| Current transport | `apps/web/server/jobs/postgresNodeJobWorker.ts`, `apps/web/server/jobs/unifiedJobControlPlaneRuntime.ts`, `apps/web/server/services/cloudflareRuntimeTarget.ts` | PostgreSQL-pull is the current controlled path; Cloudflare Queue adapters are migration-ready, not proof of active production cutover |
| Cloudflare adapters | `apps/web/server/services/cloudflareJobAdapters.ts` and `apps/web/server/services/jobTransportAdapters.ts` | Prepared target adapters; activation requires explicit readiness, rollout and rollback evidence |
| Transport contract version | `python-backend/app/services/job_control_plane.py` and current Feature 186 producers | Current control-plane payloads use `feature-186-v1`; Feature 195 MUST publish a compatibility matrix and MUST NOT advance the contract version until mixed-version and rollback evidence exists |
| Capacity/provider execution records | Earlier design sections propose logical `capacity_leases` and `provider_executions`; no physical tables with those names were found in the current schema audit | Target extensions only; map to an existing equivalent or add through a separate schema/impact review, never from prose alone |
| Runner work offer/session/control inbox | No dedicated canonical Feature 197 tables/routes were found in the current schema/control-plane surface | Target work; must extend the canonical model without creating a second Job system |
| Retired-code residue | Existing repository code still contains legacy identifiers/routes or compatibility adapters, including public docs/social-tool surfaces and Python Docker/Kilo services | Not valid Feature 195 implementation evidence; this audit adds no new callers. Removal requires a separate authorized migration audit with data-retention and rollback review |

The logical names `job_outbox`, `job_dispatch_inbox` and `job_leases` in older design prose MUST NOT be implemented as duplicate physical tables when the existing `worker_job_outbox`, `worker_job_dispatches` and `worker_job_attempts` semantics are sufficient.

Feature 195 implementation MUST preserve these project boundaries: no Agency, work-request/workpacks, legacy `/workflows` engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. Isolated server-side execution uses the approved Cloudflare Container runtime; local execution belongs behind the governed Runner boundary in Feature 197.

“Cloudflare Queue is the primary migration target” is a rollout objective, not a statement that the repository snapshot has already completed production cutover. Production readiness requires a real target enqueue, fresh deployment evidence, readiness evidence and rollback verification.

## Problem

Async execution currently spans `worker_jobs`, PostgreSQL-pull, legacy worker adapters and prepared Cloudflare transports. Without one explicit control-plane contract, queue delivery, lease ownership, retries, provider admission and monitoring can drift or create duplicate Job truth.

## Solution

Use `worker_jobs` and its event/attempt/outbox/dispatch records as the canonical execution state, publish through an idempotent outbox, and let Feature 196 provide Goal/Plan intent while Feature 197 provides governed local Runner execution. Cloudflare Queues and Containers are transport/runtime targets behind the same contract.

## Requirements

Functional requirements include durable admission, idempotent dispatch, fenced claims, lease/heartbeat/retry handling, provider-capacity reservations, external callback settlement, cancellation/recovery, progress and artifact references. Non-functional requirements include tenant isolation, authorization, auditability, bounded retries, safe secret handling, observability, rollback and mixed-version compatibility.

## Architecture

Feature 195 owns Job state, attempts, leases, queue dispatch, capacity, providers, runtime selection, retry/recovery, billing evidence and execution monitoring. Feature 196 owns Goal/Plan semantics; Feature 197 owns Runner-local discovery, work offers, control and provenance. No logical contract may create a second durable Job state machine.

## Implementation

The current implementation baseline is Feature 186's Node/Python control plane and `worker_job_*` schema. Implementation work for Feature 195 must converge the prepared Cloudflare adapters and Runner contracts through explicit readiness, deployment, enqueue, rollback and focused contract-test evidence; current adapter presence alone is insufficient.

## Assumptions

PostgreSQL remains the canonical database during migration, queue delivery is at-least-once, provider APIs can be delayed or opaque, and local tools are available only through an authorized Feature 197 Runner.

## Constraints

No duplicate job/outbox/lease truth, no secret-bearing queue payloads, no client-supplied tenant authority, no unbounded retry, and no retired execution system or Docker/OpenSandbox dispatch.

## Risks

The highest risks are duplicate external submission, stale leases, false readiness, provider-account race conditions, incomplete Cloudflare cutover evidence and divergence between local Runner state and canonical Job state. Each requires reconciliation and rollback evidence.

## Alternatives

PostgreSQL-pull, BullMQ/Celery adapters and Cloudflare Queue are transport alternatives only; none may become an independent source of truth. Direct provider-specific Job systems are not an architectural alternative to the canonical control plane.

## User Stories

As a tenant user, I can submit a long-running generation and see one durable Job across queueing, execution, retry, external wait and completion. As an operator, I can reconcile, cancel, recover or force-fail a Job with auditable authority and fencing evidence.

## Acceptance Criteria

The feature is accepted only when canonical admission precedes publication, redelivery is idempotent, competing claims are fenced, provider capacity and settlement are durable, current and target transports share the contract, tenant/auth boundaries hold, and production rollout has fresh target enqueue plus tested rollback proof.
