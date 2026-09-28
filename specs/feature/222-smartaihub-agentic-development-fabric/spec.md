# Spec 222 — Self-Improving Exploration Layer
## Dream-RSI-Inspired Replay, Evaluation, and Safe Policy Evolution for SmartAIHub

**Status:** Proposed / Design Specification — Canonical Alignment Revision 17
**Spec ID:** 222  
**Revision:** 17 — Spec 229 production retrieval authority and logical learning-index separation
**Date:** 2026-09-22
**Target repository path:** `specs/feature/222-smartaihub-agentic-development-fabric/spec.md`
**Primary role:** Additive learning and exploration-optimization layer
**Companion specs:** 199, 200, 206, 213, 215, 220, 221, 223, 224, 225, 226, 228, 229, 230
**Implementation principle:** Observe first → normalize/redact → hybrid semantic retrieval → replay offline → shadow → canary → explicitly promote
**Non-goal:** Replacing existing orchestration, runners, skills, gateways, queues, or engineering workflows.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

`apps/web/server/services/agenticDevelopmentFabricContracts.ts` and focused tests provide pure contracts for artifact classification, reuse, work packages, context freshness, trust, harness capabilities and evidence. Existing `runEngine`/agent-runtime learning and orchestration services are related platform infrastructure, not proof of the Spec 222 replay store, exploration graph, policy evaluator, shadow/canary promotion or production learning-advisory path.

Spec 222 remains additive and advisory. It must consume redacted evidence and cannot create a second execution engine, queue, authority or automatic production-policy promotion path.

## 1. Executive Summary

Spec 222 adds a self-improving exploration layer to SmartAIHub. It learns from completed executions and evaluates alternative exploration strategies offline before any strategy is allowed to influence production routing.

The design is inspired by Dream-RSI-style recursive improvement through accumulated exploration experience, but it MUST NOT depend on an unreleased or unstable upstream implementation. SmartAIHub owns its contracts and persistence model. A future upstream Dream-RSI implementation may be connected through an adapter.

The first release is deliberately non-invasive:

1. Existing execution remains authoritative.
2. Spec 222 consumes immutable/redacted execution evidence.
3. It builds replayable discovery graphs.
4. Candidate policies are evaluated offline.
5. No candidate can change production behavior automatically.
6. Promotion requires explicit policy gates, auditability, and rollback.
7. Tenant/user data and secrets remain isolated.

This spec MUST be implementable and removable without creating a second execution engine or changing the semantics of existing jobs.

---

## 2. Context and Problem

SmartAIHub already has multiple ways to execute work:

- internal skills and workflows;
- LangGraph/control-plane orchestration;
- MCP tools;
- external harnesses such as Claude/Codex-class runners;
- A2A-capable agents;
- SmartAIHub Runner / worker infrastructure;
- engineering workflows such as Spec 221.

The missing capability is systematic learning from prior execution evidence.

Today an orchestrator can choose an execution route, but the platform needs a safe way to answer questions such as:

- For this class of task, should it use one path or multiple competing paths?
- When should exploration stop?
- Is a second external harness worth its additional cost?
- Which retry/fallback sequence historically performs better?
- Which policy works for a given capability/task class?
- Can a candidate policy be tested using existing traces before spending money on live execution?
- How do we improve routing without silently changing user-visible behavior?

Spec 222 addresses these questions without replacing existing systems.

---

## 3. Design Principles

### 3.1 Additive only

The initial implementation MUST NOT require destructive modification of Specs 199, 200, 206, 213, or 221.

Integration occurs through versioned observation and advisory interfaces.

### 3.2 Existing execution remains Source of Truth

`worker_jobs`, existing orchestration state, execution events, approvals, and authoritative job state remain owned by their current specs.

Spec 222 MUST NOT create a competing job state machine.

### 3.3 No autonomous production mutation

Learning does not imply automatic deployment.

A learned/challenger policy MUST NOT become production-active merely because an evaluator scores it higher.

### 3.4 Replay before live experimentation

Historical/offline evaluation is the default.

Live experiments are permitted only after replay qualification and explicit policy authorization.

### 3.5 Reversible adoption

Every integration point MUST support:

- feature flag;
- shadow mode;
- deterministic fallback;
- kill switch;
- policy version pinning;
- rollback to last-known-good baseline.

### 3.6 Evidence over hidden reasoning

The system records operational evidence, decisions, tool calls, structured outcomes, scores, costs, timings, errors, approvals, and artifacts.

It MUST NOT require storage of private chain-of-thought. Evaluations use explicit structured rationale/evidence fields where explanation is required.

### 3.7 Tenant isolation by default

Cross-tenant learning is forbidden unless a future explicit privacy-preserving feature defines eligibility, consent, anonymization, governance, and audit requirements.

---

## 4. Scope

### In scope

- execution observation;
- normalized exploration traces;
- discovery graph/tree representation;
- replay datasets;
- offline replay;
- baseline/challenger policies;
- multi-objective evaluation;
- confidence and sample sufficiency;
- shadow evaluation;
- canary rollout;
- promotion gates;
- rollback;
- policy registry/versioning;
- cost/latency/quality budgets;
- trace provenance;
- privacy/redaction;
- tenant isolation;
- policy lab/admin UI;
- execution insights;
- discovery viewer;
- audit logs;
- upstream Dream-RSI adapter boundary;
- integration contracts with Specs 199/200/206/213/221.

### Out of scope

- training/fine-tuning foundation-model weights;
- replacing LangGraph;
- replacing `worker_jobs`;
- replacing external harnesses;
- replacing MCP/A2A;
- copying SmartAIHub skills to external agents;
- exposing secrets or private prompts in replay datasets;
- automatic self-modification of production source code;
- automatic promotion without configured approval;
- universal cross-tenant model training;
- reproducing unpublished upstream implementation details.

---

## 5. Terminology

**Execution** — one authoritative attempt to fulfill a task.

**Exploration** — generation or evaluation of one or more candidate approaches/routes.

**Branch** — one candidate execution path.

**Discovery Graph** — normalized DAG representing decisions, branches, actions, observations, outcomes, and relationships.

**Trace** — replayable evidence captured from an execution.

**Policy** — versioned rules/configuration deciding how exploration is allocated and stopped.

**Baseline** — currently approved policy used for comparison.

**Challenger** — candidate policy being evaluated.

**Replay** — evaluating a policy against recorded evidence without re-running expensive external actions where evidence is sufficient.

**Counterfactual** — estimate of what might have happened under an alternative action. It is not equivalent to observed ground truth.

**Shadow Mode** — candidate policy makes decisions but those decisions do not control execution.

**Canary** — constrained live exposure of an approved candidate.

**Promotion** — explicit transition of a policy into an active state.

---

## 6. Relationship to Existing Specs

| Spec | Ownership | Spec 222 relationship |
|---|---|---|
| 199 | External MCP Gateway | Observes MCP execution evidence; never replaces gateway |
| 200 | External Agent Gateway | Learns from external-agent execution outcomes |
| 206 | A2A routing/interoperability | Evaluates A2A vs fallback route evidence |
| 213 | Control plane / execution selection | Supplies advisory exploration policy; Spec 213 remains execution authority |
| 221 | Superpowers/engineering workflow | Treats disciplined workflow choices/results as evaluable execution patterns |
| 222 | Learning/exploration optimization | Owns trace normalization, replay, policy evaluation and safe promotion |

### Ownership rule

Spec 222 may recommend:

`exploration_plan`

It MUST NOT directly execute tools, mutate jobs, bypass approvals, or directly command runners.

The execution owner decides whether and how to apply an advisory plan.

---

## 7. Target Architecture

```text
                         Existing SmartAIHub
┌───────────────────────────────────────────────────────────────────┐
│ User / API / Universal Assistant                                  │
│                         │                                         │
│                         v                                         │
│                 Control / Orchestration                           │
│                  (Spec 213 et al.)                                │
│                         │                                         │
│        ┌────────────────┼───────────────────┐                     │
│        v                v                   v                     │
│   Internal Skills    MCP/A2A          External Agents             │
│                     199/206               200                     │
│        └────────────────┼───────────────────┘                     │
│                         v                                         │
│              Existing Job/Event Infrastructure                    │
│                   worker_jobs / events                            │
└─────────────────────────┬─────────────────────────────────────────┘
                          │ read/subscribe through adapter
                          v
┌───────────────────────────────────────────────────────────────────┐
│                    SPEC 222 — Learning Plane                       │
│                                                                   │
│  Observation Adapter                                              │
│       ↓                                                           │
│  Redaction + Normalization                                        │
│       ↓                                                           │
│  Trace Store ─────→ Discovery Graph Store                          │
│       │                                                           │
│       ├────→ Replay Dataset Builder                                │
│       │           ↓                                               │
│       │      Replay Simulator                                     │
│       │           ↓                                               │
│       │      Policy Evaluator                                     │
│       │           ↓                                               │
│       │   Baseline vs Challenger                                  │
│       │           ↓                                               │
│       │      Promotion Gate                                       │
│       │                                                           │
│       └────→ Insights / Policy Lab / Discovery Viewer              │
│                                                                   │
└─────────────────────────┬─────────────────────────────────────────┘
                          │ versioned advisory contract
                          v
                  Spec 213 Policy Consumer
                    (feature-flagged)
```

No reverse direct dependency from job infrastructure to the internal implementation of Spec 222 is allowed.

---

## 8. Core Components

### 8.1 Observation Adapter

Purpose: consume existing execution evidence without taking ownership of execution.

Responsibilities:

- consume committed job/execution events;
- map source event versions into Spec 222 observation schema;
- deduplicate events;
- preserve provenance;
- tolerate missing optional fields;
- never block the source execution path.

Preferred ingestion order:

1. existing durable event/outbox stream;
2. versioned event subscriber;
3. asynchronous read model;
4. direct database polling only as a temporary compatibility adapter.

Failure of Spec 222 MUST NOT fail a production job.

### 8.2 Redaction and Normalization

Before evidence enters replay storage:

- remove secrets/tokens/API keys;
- classify sensitive payload fields;
- replace restricted payloads with references/hashes where possible;
- preserve artifact IDs rather than duplicating large binaries;
- normalize provider/model/tool names;
- normalize cost and latency units;
- attach tenant/user ownership;
- attach schema version.

Raw secrets MUST never be replay inputs.

### 8.3 Trace Store

Each trace contains sufficient structured evidence to reconstruct execution topology and evaluate observed outcomes.

Minimum fields:

```text
trace_id
tenant_id
actor_scope
source_execution_id
source_job_id
task_class
task_fingerprint
policy_id
policy_version
started_at
completed_at
outcome_status
quality_metrics
cost_metrics
latency_metrics
safety_metrics
artifact_refs
event_refs
schema_version
redaction_version
provenance
```

### 8.4 Discovery Graph Store

Use a DAG rather than assuming every execution is a strict tree.

Node types MAY include:

- task;
- decision;
- branch;
- tool_call;
- agent_call;
- observation;
- evaluation;
- approval;
- artifact;
- terminal_outcome.

Edge types MAY include:

- spawned;
- depends_on;
- evaluated_by;
- supersedes;
- retries;
- fallback_to;
- produced;
- approved_by.

Each node and edge MUST have stable IDs and schema versions.

### 8.5 Replay Dataset Builder

Produces immutable/versioned dataset snapshots.

A dataset manifest includes:

- dataset ID/version;
- tenant boundary;
- query/selection criteria;
- time range;
- trace count;
- task-class distribution;
- policy distribution;
- redaction version;
- evaluator version;
- exclusions;
- provenance checksum.

Datasets MUST be reproducible from retained source evidence where retention permits.

### 8.6 Replay Simulator

The simulator evaluates candidate policy behavior against available evidence.

It MUST distinguish:

1. **Observed replay** — candidate selects an action/branch for which historical outcome evidence exists.
2. **Partial replay** — only part of the candidate path has observed evidence.
3. **Counterfactual estimate** — outcome is inferred rather than observed.
4. **Unsupported replay** — insufficient evidence.

Counterfactual estimates MUST NOT be represented as observed outcomes.

A promotion gate MUST define maximum permitted dependence on counterfactual evidence.

### 8.7 Policy Registry

Policy object:

```yaml
policy_id:
version:
tenant_scope:
task_scope:
status: draft|replay|shadow|canary|active|retired|quarantined
parent_policy:
created_by:
created_at:
configuration:
budgets:
constraints:
evaluator_set:
compatibility:
signature/checksum:
```

Policies are immutable once used in an auditable evaluation. Changes create a new version.

### 8.8 Policy Evaluator

Evaluation is multi-objective.

Required dimensions:

- task success;
- quality score;
- safety/constraint compliance;
- monetary cost;
- token/compute consumption;
- latency;
- retries;
- branch count;
- external-provider usage;
- human intervention rate;
- failure/recovery rate.

A single weighted score MAY be shown for convenience but MUST NOT erase the underlying dimensions.

### 8.9 Promotion Gate

Default lifecycle:

```text
draft
  ↓
replay
  ↓
shadow
  ↓
canary
  ↓
active
```

Any stage may transition to:

```text
quarantined
retired
rolled_back
```

Production promotion requires all configured gates.

### 8.10 Policy Consumer Adapter

Spec 213 or another authorized execution owner requests an advisory plan.

Example:

```json
{
  "task_class": "skill-development",
  "tenant_id": "...",
  "constraints": {
    "max_cost": 2.50,
    "max_latency_ms": 900000
  },
  "available_capabilities": ["internal", "claude", "codex"]
}
```

Response:

```json
{
  "policy_id": "explore-skill-dev",
  "policy_version": 7,
  "mode": "advisory",
  "plan": {
    "initial_paths": ["internal", "claude"],
    "max_branches": 2,
    "stop_conditions": ["quality_threshold", "budget_threshold"]
  },
  "fallback": "baseline",
  "decision_id": "...",
  "expires_at": "..."
}
```

Spec 222 MUST NOT return provider credentials or secret material.

---

## 9. Policy Model

A policy may control only explicitly registered dimensions.

Examples:

- number of initial branches;
- sequential vs parallel exploration;
- allowed executor classes;
- branch budget;
- retry count;
- fallback order;
- evaluator selection;
- stopping threshold;
- tie-breaking behavior;
- human escalation threshold.

Policies MUST NOT dynamically invent privileged capabilities.

Capability authorization remains owned by existing authorization/control-plane systems.

---

## 10. Task Classification

Policy comparison is meaningful only for sufficiently comparable tasks.

Task classification SHOULD include:

- task family;
- capability requirements;
- expected artifact type;
- complexity bucket;
- risk class;
- interactive vs unattended;
- estimated cost class;
- relevant tool/provider availability.

Task fingerprints MUST avoid storing raw sensitive prompts where a derived representation is sufficient.

Policy results MUST NOT be generalized from one task class to another without explicit evaluation.

---

## 11. Evaluation Methodology

### 11.1 Baseline comparison

Every challenger evaluation identifies an explicit baseline policy version.

No moving baseline is allowed inside a single evaluation run.

### 11.2 Sample sufficiency

The system MUST support configurable minimums by task class.

`1000 traces` is not a universal hard-coded threshold.

Example:

```text
minimum_trace_count
minimum_success_count
minimum_failure_count
minimum_task_diversity
minimum_observed_coverage
maximum_counterfactual_fraction
```

### 11.3 Confidence

Evaluation reports SHOULD include:

- sample size;
- confidence interval or uncertainty estimate;
- effect size;
- task distribution;
- observed vs estimated evidence ratio.

### 11.4 Pareto comparison

Where quality/cost/latency conflict, the evaluator SHOULD expose a Pareto frontier rather than claiming one policy is universally superior.

### 11.5 Regression guardrails

A challenger is rejected when any hard guardrail regresses beyond configured tolerance, even if aggregate score improves.

Examples:

- safety failures;
- catastrophic task failures;
- tenant isolation failures;
- excessive cost;
- excessive p95/p99 latency;
- approval bypass.

---

## 12. Offline Replay Limitations

Replay is not equivalent to real execution.

Historical data can contain:

- selection bias;
- provider-version drift;
- evaluator drift;
- missing branches;
- changing prices;
- changed tools;
- changed model behavior.

Therefore:

- replay results MUST show evidence freshness;
- stale provider/model traces can be excluded;
- evaluator versions are pinned;
- price normalization MAY recalculate cost using both historical and current price tables;
- uncertain counterfactual results are labeled;
- live shadow/canary evidence is required before broad promotion for material policy changes.

---

## 13. Shadow Mode

Shadow mode is mandatory for policies that would materially alter routing.

During shadow:

- baseline controls execution;
- challenger receives the same eligible decision context;
- challenger produces a proposed plan;
- proposed plan is logged;
- no challenger action is executed solely because of the shadow decision.

Shadow comparison measures:

- agreement rate;
- predicted branch count;
- predicted cost;
- route divergence;
- expected quality;
- unsupported decision rate.

---

## 14. Canary Mode

Canary is optional and requires authorization.

Canary controls:

- tenant allowlist;
- user/admin allowlist;
- task-class allowlist;
- percentage exposure;
- maximum spend;
- maximum concurrent jobs;
- time window;
- automatic abort conditions.

Canary assignment MUST be stable enough to avoid accidental repeated switching for the same experiment unit.

---

## 15. Promotion Rules

Default promotion requires:

1. schema compatibility;
2. replay qualification;
3. minimum observed coverage;
4. no hard safety regression;
5. budget compliance;
6. shadow qualification;
7. canary qualification when required;
8. human/admin approval;
9. signed/versioned policy artifact;
10. rollback target;
11. audit record.

Promotion MUST be idempotent.

Promotion MUST use optimistic concurrency/version checks so two admins cannot unknowingly promote conflicting versions.

---

## 16. Rollback and Kill Switch

Rollback MUST NOT depend on the learning system being healthy.

Required controls:

- global Spec 222 kill switch;
- tenant-level kill switch;
- task-class kill switch;
- policy quarantine;
- baseline pin;
- automatic canary abort;
- last-known-good policy pointer.

When Spec 222 is unavailable:

```text
policy lookup fails
      ↓
use configured baseline/existing Spec 213 behavior
      ↓
record telemetry if possible
```

Existing execution MUST continue.

---

## 17. Data Isolation and Security

### 17.1 Tenant boundary

All primary learning entities MUST carry `tenant_id`.

Queries MUST enforce tenant scope at the data-access layer, not only UI filtering.

### 17.2 User data

User-level traces may be used only according to platform policy and retention rules.

### 17.3 Secrets

Never persist:

- API keys;
- OAuth tokens;
- session cookies;
- private runner credentials;
- plaintext secrets returned by tools.

### 17.4 Prompt/artifact content

Prefer:

- content references;
- hashes;
- structured features;
- redacted excerpts.

Full content retention requires an explicit approved purpose and retention policy.

### 17.5 External model use

Replay data MUST NOT be sent to an external evaluator unless tenant policy permits that provider/data class.

---

## 18. Retention and Deletion

Spec 222 MUST integrate with platform retention/deletion semantics.

Deletion must propagate to derived data where required.

Derived entities SHOULD preserve tombstone/provenance metadata sufficient for audit without retaining deleted content.

Dataset manifests MUST indicate when underlying evidence has been removed and the dataset is no longer reproducible.

---

## 19. Multi-Tenant Learning

### Phase 1

Strict tenant-local learning only.

### Future phase

Cross-tenant learning MAY be introduced only through a separate reviewed design addressing:

- explicit eligibility/consent;
- anonymization;
- aggregation thresholds;
- leakage tests;
- tenant opt-out;
- deletion;
- data residency;
- commercial/revenue implications.

It is NOT implicitly enabled by this spec.

---

## 20. Cost Accounting

Every branch SHOULD record:

```text
provider_cost
platform_cost
token_count
compute_seconds
runner_seconds
storage_cost_estimate
network_cost_estimate
```

The evaluator MUST distinguish:

- historical actual cost;
- normalized cost;
- estimated future cost.

Policy budgets MAY be defined per:

- task;
- execution;
- user;
- tenant;
- day/month;
- experiment.

Spec 222 MUST integrate with existing SmartAIHub credit/accounting systems through read/advisory contracts rather than implementing another ledger.

---

## 21. Provider and Model Drift

Trace compatibility key SHOULD include:

```text
executor_type
provider
model
model_version/revision when available
toolset_version
skill_version
runner_version
policy_version
evaluator_version
```

When an executor changes materially, historical evidence may be down-weighted or marked incompatible.

---

## 22. Evaluator Governance

Evaluators can themselves drift or be biased.

Each evaluator MUST be versioned.

Evaluation sets MAY combine:

- deterministic tests;
- schema validation;
- unit/integration tests;
- domain metrics;
- LLM judge;
- human review;
- artifact-specific QC.

LLM-as-judge MUST NOT be the sole gate for safety-critical promotion.

Where possible, evaluator calibration SHOULD be compared against human-reviewed samples.

---

## 23. Discovery Graph Semantics

Example:

```text
Task
 ├─ Decision: exploration strategy
 │   ├─ Branch A: internal skill
 │   │    ├─ tool calls
 │   │    ├─ tests
 │   │    └─ outcome
 │   └─ Branch B: external harness
 │        ├─ tool calls
 │        ├─ review
 │        └─ outcome
 ├─ Evaluation
 ├─ Human selection
 └─ Final artifact
```

Graph reconstruction MUST be deterministic from normalized trace events.

A graph is evidence, not a representation of hidden model reasoning.

---

## 24. Event Contract

Example normalized event:

```json
{
  "event_id": "evt_...",
  "schema_version": 1,
  "tenant_id": "tenant_...",
  "trace_id": "trace_...",
  "source": {
    "system": "worker_jobs",
    "execution_id": "..."
  },
  "type": "branch.completed",
  "occurred_at": "...",
  "payload": {
    "branch_id": "...",
    "executor_type": "external_agent",
    "outcome": "success",
    "latency_ms": 120000
  },
  "redaction_version": 2
}
```

Consumers MUST ignore unknown additive fields.

Breaking schema changes require a new major schema version.

---

## 25. Idempotency and Ordering

Observation ingestion MUST tolerate:

- duplicate events;
- delayed events;
- out-of-order events;
- reconnect/replay;
- partial execution history.

Use:

```text
event_id
source_sequence where available
source_execution_id
idempotency_key
```

Graph finalization MUST support late evidence without corrupting prior audit history.

---

## 26. Failure Model

| Failure | Required behavior |
|---|---|
| Spec 222 unavailable | existing execution continues |
| trace ingestion delayed | queue/backfill; no execution block |
| malformed event | quarantine event; alert |
| replay worker failure | retry replay only |
| evaluator failure | mark evaluation incomplete |
| policy lookup timeout | baseline fallback |
| policy incompatible | baseline fallback |
| promotion conflict | reject and require refresh |
| canary regression | auto-abort and baseline |
| data isolation violation | quarantine affected datasets/policies and security incident path |

---

## 27. UI/UX

### 27.1 Navigation

Admin/authorized users:

```text
AI Control
 ├─ Execution
 ├─ Policies
 └─ Learning & Exploration
      ├─ Overview
      ├─ Discovery
      ├─ Replay Lab
      ├─ Policies
      ├─ Experiments
      └─ Audit
```

Regular users SHOULD NOT see administrative policy-promotion controls.

### 27.2 Overview

Show:

- observed executions;
- replay-ready traces;
- active baseline;
- challengers;
- shadow/canary status;
- quality/cost/latency trends;
- rejected/quarantined policies;
- ingestion health.

### 27.3 Discovery Viewer

Must visualize DAGs without implying hidden reasoning.

User can inspect:

- branch;
- executor;
- duration;
- cost;
- result;
- evaluation;
- fallback;
- artifact;
- failure;
- approval.

Filters:

- tenant;
- task class;
- executor;
- policy;
- status;
- date range.

### 27.4 Replay Lab

Workflow:

```text
Select baseline
      ↓
Select/create challenger
      ↓
Select dataset snapshot
      ↓
Validate compatibility
      ↓
Run replay
      ↓
Compare dimensions
      ↓
Inspect regressions
      ↓
Eligible for Shadow?
```

### 27.5 Policy Comparison

Never show only a single score.

Example:

| Metric | Baseline | Challenger | Delta | Confidence |
|---|---:|---:|---:|---|
| success | | | | |
| quality | | | | |
| avg cost | | | | |
| p95 latency | | | | |
| retries | | | | |
| human intervention | | | | |

### 27.6 Promotion Dialog

Must show:

- exact policy/version;
- baseline/version;
- evaluation dataset;
- hard guardrails;
- unresolved warnings;
- target tenant/task scope;
- rollout mode;
- rollback target.

Require explicit confirmation.

---

## 28. Authorization

Suggested permissions:

```text
learning.view
learning.trace.view
learning.replay.run
learning.policy.create
learning.policy.evaluate
learning.policy.shadow
learning.policy.canary
learning.policy.promote
learning.policy.rollback
learning.audit.view
```

Promotion and rollback SHOULD be restricted to privileged roles.

Tenant admins MUST NOT operate on other tenants.

---

## 29. API Surface

Version all APIs.

Suggested endpoints:

```text
GET  /v1/learning/traces
GET  /v1/learning/traces/{id}
GET  /v1/learning/discovery/{traceId}

POST /v1/learning/datasets
GET  /v1/learning/datasets/{id}

POST /v1/learning/replays
GET  /v1/learning/replays/{id}

GET  /v1/learning/policies
POST /v1/learning/policies
GET  /v1/learning/policies/{id}/versions/{version}

POST /v1/learning/policies/{id}/shadow
POST /v1/learning/policies/{id}/canary
POST /v1/learning/policies/{id}/promote
POST /v1/learning/policies/{id}/rollback

POST /v1/learning/advice
```

Mutating endpoints require authorization, idempotency keys, and audit events.

---

## 30. Storage Model

New tables SHOULD be namespaced rather than modifying existing job tables.

Illustrative names:

```text
learning_traces
learning_trace_events
learning_graph_nodes
learning_graph_edges
learning_dataset_manifests
learning_policies
learning_policy_versions
learning_evaluation_runs
learning_evaluation_metrics
learning_experiments
learning_promotion_events
learning_audit_events
```

No foreign-key design may create a failure dependency that prevents deletion/operation of authoritative job infrastructure.

Use soft references where lifecycle ownership differs.

---

## 31. Scalability

Large trace payloads SHOULD NOT reside entirely in hot relational rows.

Recommended separation:

- PostgreSQL: metadata/indexes/state;
- object storage: large replay bundles/snapshots;
- existing vector/search infrastructure only where semantic retrieval adds value.

Do not add a vector database solely for Spec 222 unless a concrete retrieval use case requires it.

---

## 32. Concurrency

Replay jobs may run concurrently.

Required controls:

- immutable input dataset;
- immutable policy versions;
- evaluator version pinning;
- deterministic seed where supported;
- isolated run ID;
- no shared mutable replay state.

Promotion uses serialized/version-checked state transition.

---

## 33. Reproducibility

A replay report MUST identify:

```text
dataset_version
policy_version
baseline_version
evaluator_versions
pricing_version
schema_version
code/build version
run configuration
```

Given retained evidence and compatible software, an operator should be able to reproduce the evaluation.

---

## 34. Observability

Metrics:

```text
learning_ingest_lag_seconds
learning_ingest_errors_total
learning_trace_completion_ratio
learning_replay_duration_seconds
learning_replay_failures_total
learning_counterfactual_ratio
learning_shadow_divergence_ratio
learning_canary_abort_total
learning_policy_fallback_total
learning_policy_lookup_latency
learning_promotion_total
learning_rollback_total
```

Logs MUST include correlation IDs but not secrets.

Distributed traces SHOULD connect:

```text
source execution
→ observation
→ learning trace
→ replay run
→ evaluation
→ promotion
```

---

## 35. SLO and Degradation

Spec 222 is not on the critical path during initial rollout.

Policy-advice lookup, when later enabled, MUST have:

- strict timeout;
- cached baseline;
- local fallback;
- circuit breaker.

Example target:

```text
If policy advice cannot be returned within configured latency budget:
    use baseline
    do not delay execution
```

---

## 36. Dream-RSI Adapter Boundary

Create a provider-neutral interface:

```text
ExplorationLearningProvider
    ingest_trace()
    build_dataset()
    propose_policy()
    replay_policy()
    evaluate_policy()
```

Initial implementation:

```text
NativeSmartAIHubLearningProvider
```

Future optional adapter:

```text
DreamRSIProvider
```

The upstream adapter MUST map into SmartAIHub contracts rather than making upstream schemas authoritative.

An upstream implementation is not enabled until:

- code/license/security review;
- reproducibility verification;
- sandboxing;
- dependency review;
- benchmark against native implementation;
- tenant isolation review.

---

## 37. Interaction with Spec 221

Spec 221 defines disciplined engineering workflows.

Spec 222 may learn from structured outcomes such as:

```text
planning
TDD
implementation
verification
debugging
review
```

It MUST NOT silently weaken mandatory workflow gates.

Example:

If Spec 221 mandates verification before completion, Spec 222 cannot learn a policy that skips verification merely because historical jobs were cheaper.

Mandatory constraints are hard constraints, not optimization variables.

---

## 38. Interaction with Spec 213

Spec 213 remains decision/execution authority.

Integration phases:

### Phase 1 — Observe

No call from 213 to 222.

### Phase 2 — Shadow advice

213 sends decision context; ignores returned plan for execution.

### Phase 3 — Advisory

213 may apply policy only when enabled for tenant/task class.

### Phase 4 — Controlled policy execution

Approved policy influences exploration parameters, while Spec 213 continues enforcing capability, security, approval, and execution constraints.

Spec 222 never bypasses 213.

---

## 39. Interaction with Specs 199/200/206

Spec 222 receives normalized evidence about:

- MCP route;
- external agent route;
- A2A route;
- fallback route;
- outcome;
- cost;
- latency;
- error class.

It does not directly manage MCP sessions, A2A protocol, or external runner lifecycle.

---

## 40. Human Agency

For consequential or ambiguous routing choices where policy confidence is insufficient, the system SHOULD surface alternatives rather than force a learned choice.

Example:

```text
SmartAIHub
Claude
Codex
Multi-path comparison
```

The UI may explain evidence such as expected cost, historical success, and latency without hiding alternatives available to the user.

User explicit route selection overrides optimization unless prohibited by security/policy.

---

## 41. Experiment Integrity

Experiments MUST define:

- hypothesis;
- baseline;
- challenger;
- unit of assignment;
- task scope;
- start/end criteria;
- metrics;
- guardrails;
- budget;
- abort criteria.

Do not repeatedly inspect and promote based on noisy intermediate results without configured statistical/operational controls.

---

## 42. Cold Start

When insufficient evidence exists:

```text
No qualified learned policy
        ↓
Existing baseline behavior
        ↓
Collect evidence
        ↓
Replay eligibility
```

Spec 222 MUST NOT fabricate confidence.

---

## 43. New Executor / New Model

A newly registered executor starts with insufficient evidence.

Policy may:

- exclude it;
- use explicit admin experiment;
- collect bounded canary evidence;
- inherit only compatible priors where permitted.

It MUST NOT automatically treat evidence from another provider/model as equivalent.

---

## 44. Data Quality

Each trace receives data-quality status:

```text
complete
partial
late
inconsistent
quarantined
```

Evaluation can define acceptable quality classes.

Corrupted/quarantined traces are excluded by default.

---

## 45. Audit

Audit events include:

- dataset creation;
- policy creation;
- policy edit/new version;
- replay start/end;
- evaluator configuration;
- shadow activation;
- canary activation;
- promotion;
- rollback;
- quarantine;
- kill-switch change.

Record:

```text
who
when
tenant
action
object/version
reason
before/after references
correlation ID
```

---

## 46. Threat Model

Explicitly test:

- poisoned traces;
- malicious tool output;
- prompt injection stored in traces;
- evaluator manipulation;
- tenant data leakage;
- replay of secrets;
- unauthorized policy promotion;
- policy artifact tampering;
- cost-exhaustion policy;
- infinite branching;
- recursive retry explosion;
- stale policy execution.

Trace content is untrusted data.

Replay/evaluation systems MUST NOT treat historical tool output as executable instructions.

---

## 47. Resource Guards

Hard limits:

```text
max_branches
max_depth
max_retries
max_external_calls
max_cost
max_tokens
max_runtime
max_parallelism
```

A policy cannot raise limits above tenant/platform ceilings.

---

## 48. Testing Strategy

### Unit

- normalization;
- redaction;
- graph reconstruction;
- metric calculation;
- policy validation;
- compatibility checks;
- state transitions.

### Contract

- Specs 199/200/206/213 event/advice contracts;
- schema backward compatibility;
- unknown-field tolerance.

### Integration

- event → trace → graph;
- dataset → replay → report;
- shadow comparison;
- canary abort;
- rollback.

### Failure injection

- duplicate events;
- delayed events;
- out-of-order events;
- missing evaluator;
- database outage;
- object-store outage;
- policy service timeout;
- corrupted dataset;
- stale policy.

### Security

- cross-tenant access;
- secret redaction;
- prompt injection in replay data;
- unauthorized promotion;
- signed policy tampering.

### Performance

- high event volume;
- large DAG;
- replay batch;
- concurrent evaluation;
- policy lookup latency.

---

## 49. Acceptance Criteria

Spec 222 Phase 1 is acceptable when:

- existing jobs complete with Spec 222 disabled/unavailable;
- execution evidence can be captured asynchronously;
- duplicate/out-of-order events do not corrupt traces;
- tenant isolation tests pass;
- secrets are removed before replay persistence;
- discovery DAG reconstructs representative executions;
- datasets are immutable/versioned;
- replay differentiates observed/counterfactual/unsupported evidence;
- baseline/challenger comparison is reproducible;
- no policy can reach active state without configured promotion gates;
- kill switch and rollback are tested;
- Spec 213 fallback works when policy advice fails;
- audit trail covers all privileged mutations.

---

## 50. Rollout Plan

### P222-A0 — Contract inventory

Read-only audit of actual implementation for Specs 199/200/206/213/221 and job/event schemas.

Deliver:

- real event inventory;
- ownership map;
- integration map;
- compatibility gaps.

No production mutation.

### P222-A1 — Observation foundation

Implement:

- observation adapter;
- redaction;
- trace schema;
- provenance;
- idempotent ingestion.

Feature flag default OFF.

### P222-A2 — Discovery graph

Implement DAG reconstruction and read-only viewer.

No policy influence.

### P222-B1 — Dataset builder

Immutable dataset manifests and compatibility filtering.

### P222-B2 — Replay engine

Observed replay first.

Counterfactual support remains explicitly labeled and may initially be disabled.

### P222-C1 — Policy registry/evaluator

Baseline/challenger comparison.

No live activation.

### P222-C2 — Policy Lab UI

Admin-only replay and comparison.

### P222-D1 — Shadow integration with Spec 213

Candidate decisions recorded but ignored.

### P222-D2 — Canary

Opt-in/allowlisted controlled experiments with automatic abort.

### P222-E1 — Promotion/rollback

Versioned promotion gates, approval, rollback, kill switch.

### P222-F — Upstream adapters

Evaluate official Dream-RSI implementation when mature enough.

No architectural dependency on its release schedule.

---

## 51. Migration Strategy

There is no big-bang migration.

Sequence:

```text
existing system
   +
observation-only
   +
offline replay
   +
shadow
   +
limited canary
   +
approved policy influence
```

At every stage the existing baseline remains usable.

No existing execution record is rewritten into Spec 222 ownership.

---

## 52. Feature Flags

Minimum:

```text
learning.enabled
learning.capture.enabled
learning.discovery.enabled
learning.replay.enabled
learning.shadow.enabled
learning.canary.enabled
learning.advice.enabled
learning.promotion.enabled
```

Support platform and tenant overrides.

Default production rollout:

```text
capture: controlled opt-in
advice: off
canary: off
promotion: off
```

until preceding gates pass.

---

## 53. Compatibility Contract

Spec 222 MUST tolerate existing components evolving independently.

Rules:

- consume versioned contracts;
- never depend on undocumented database internals where a stable event exists;
- additive schema changes tolerated;
- breaking changes versioned;
- compatibility matrix maintained;
- policy declares compatible executor/tool/schema ranges.

---

## 54. Operational Runbooks

Required before canary:

1. disable Spec 222 globally;
2. disable one tenant;
3. quarantine policy;
4. rollback policy;
5. replay ingestion backlog;
6. rebuild derived discovery graph;
7. rotate compromised evaluator/provider credential outside trace storage;
8. investigate unexpected cost increase;
9. respond to cross-tenant data incident;
10. recover from corrupted replay dataset.

---

## 55. Implementation Constraints

The implementation team MUST NOT:

- create `jobs_v2` or another execution queue for ordinary SmartAIHub jobs;
- replace `worker_jobs`;
- introduce a second capability registry;
- introduce a second approval system;
- duplicate credit ledger;
- directly execute external harnesses from Spec 222;
- make Dream-RSI upstream code mandatory;
- expose chain-of-thought;
- enable autonomous production promotion;
- perform unrelated refactors.

If implementation discovers a required breaking change to a companion spec, stop and create an explicit cross-spec change proposal before modifying that contract.

---

## 56. Definition of Done

Spec 222 is production-ready only when all of the following are true:

- additive architecture demonstrated;
- failure isolation demonstrated;
- baseline fallback demonstrated;
- privacy/redaction review passed;
- tenant isolation passed;
- threat-model tests passed;
- replay reproducibility demonstrated;
- evaluator versioning operational;
- shadow mode operational;
- canary abort operational;
- promotion/rollback audited;
- policy lookup does not materially degrade execution;
- operational dashboards/runbooks exist;
- cross-spec contract tests pass;
- no duplicate execution/control-plane subsystem was introduced.

---

## 57. Open Extension Points

Future specs may extend:

- policy synthesis;
- meta-learning across compatible task families;
- privacy-preserving aggregate learning;
- learned budget allocation;
- dynamic evaluator ensembles;
- provider/model drift adaptation;
- simulation using synthetic environments;
- automatic proposal generation.

These extensions MUST preserve the promotion, isolation, provenance, and human-control principles defined here.

---

## 58. Final Architecture Decision

Spec 222 is a **learning plane**, not an execution plane.

Its core loop is:

```text
OBSERVE
   ↓
NORMALIZE + REDACT
   ↓
BUILD DISCOVERY GRAPH
   ↓
FREEZE DATASET
   ↓
REPLAY
   ↓
COMPARE BASELINE / CHALLENGER
   ↓
SHADOW
   ↓
CANARY
   ↓
EXPLICIT PROMOTION
   ↓
OBSERVE NEW EVIDENCE
   ↺
```

The most important invariant is:

> **SmartAIHub may learn continuously, but production behavior changes only through controlled, versioned, observable, reversible gates.**

This preserves the stability of the existing platform while creating a clean path toward Dream-RSI-style self-improving exploration.


---

## 59. Twenty-Pass Completeness Audit and Incorporated Corrections

This revision was reviewed through 20 distinct architectural failure lenses. The review is not a claim that future implementation cannot reveal new facts; it records the concrete gaps identified at design time and the requirements added to close them.

| Pass | Review lens | Gap found | Correction |
|---:|---|---|---|
| 1 | Source-of-truth boundaries | Advisory ownership was clear, but policy-decision attribution was not explicit enough | Add Decision Envelope and immutable attribution |
| 2 | Off-policy evaluation | Replay distinguished counterfactual evidence but lacked propensity/coverage requirements | Add off-policy validity rules |
| 3 | Reward hacking | Multi-objective metrics existed but gaming detection was underspecified | Add anti-reward-hacking invariants |
| 4 | Evaluator circularity | Evaluator versioning existed but challenger/evaluator dependency could bias results | Add evaluator independence controls |
| 5 | Feedback loops | Promoted policies can alter future datasets and reinforce themselves | Add feedback-loop controls and exploration debt |
| 6 | Non-stationarity | Provider drift existed, but task/population drift detection was incomplete | Add drift detector and requalification |
| 7 | Policy cache consistency | Fallback existed but distributed policy activation semantics were unspecified | Add activation epochs and cache rules |
| 8 | Experiment attribution | Canary assignment existed but contamination between experiments was possible | Add experiment namespace/exclusion rules |
| 9 | User overrides | Human agency existed but persistence/audit semantics were incomplete | Add override contract |
| 10 | Budget concurrency | Cost limits existed but parallel branches could race past a budget | Add budget reservation/commit protocol |
| 11 | Backpressure | Replay scalability existed but ingestion/replay pressure isolation was incomplete | Add separate queues/quotas |
| 12 | Data residency | Tenant isolation existed but regional processing/storage constraints were absent | Add residency policy |
| 13 | Erasure lineage | Deletion existed but derived-policy contamination needed stronger handling | Add lineage invalidation/requalification |
| 14 | Trace poisoning | Threat model named poisoning but lacked trust levels | Add evidence trust classification |
| 15 | Branch comparability | Task classes existed but branch outcome comparability was underspecified | Add outcome contract |
| 16 | Partial executions | Data quality covered partial traces but interrupted execution semantics were weak | Add censoring/terminal-reason model |
| 17 | Policy composition | Multiple policies could conflict across platform/tenant/task layers | Add deterministic precedence |
| 18 | Emergency operations | Kill switches existed but break-glass governance was incomplete | Add break-glass protocol |
| 19 | Release compatibility | Compatibility matrix existed but deployment ordering was not explicit | Add expand/migrate/contract rollout |
| 20 | Production readiness | DoD lacked explicit go/no-go evidence package | Add release evidence bundle and final gates |

All corrections below are normative parts of Spec 222.

---

## 60. Decision Envelope and Attribution Contract

Every advisory decision MUST produce an immutable `decision_envelope`.

Minimum fields:

```text
decision_id
tenant_id
request_id
source_execution_id
task_class
policy_id
policy_version
policy_activation_epoch
experiment_id | null
assignment_id | null
mode: baseline|shadow|canary|active|user_override
available_capabilities_snapshot
constraints_snapshot
budget_snapshot
decision_output
fallback_policy
created_at
expires_at
```

The authoritative execution layer MUST echo `decision_id` into downstream job/events when it accepts the advice.

This provides exact attribution between a policy decision and an observed outcome without transferring execution ownership to Spec 222.

Missing attribution MUST cause the trace to be excluded from causal policy comparisons by default.

---

## 61. Off-Policy Evaluation Validity

Historical replay can only evaluate choices represented by historical evidence.

For every replay run, report:

```text
action_support_coverage
branch_support_coverage
observed_outcome_fraction
counterfactual_fraction
unsupported_fraction
historical_policy_distribution
```

If historical action-selection probabilities/propensities are available, store them with the trace.

Off-policy estimators MAY be introduced, but:

- estimator type/version MUST be recorded;
- assumptions MUST be displayed;
- low-support regions MUST be flagged;
- estimated evidence MUST never be relabeled as observed;
- a challenger relying materially on unsupported actions cannot be promoted from replay evidence alone.

Replay reports MUST include an `evidence_validity` result:

```text
qualified
qualified_with_limits
insufficient_support
invalid
```

---

## 62. Outcome Contract and Censored Executions

A comparable outcome requires an explicit outcome contract per task class.

Example:

```yaml
task_class: skill-development
required_outcomes:
  - artifact_created
  - tests_completed
  - verification_completed
terminal_reasons:
  - success
  - quality_failure
  - budget_exhausted
  - timeout
  - user_cancelled
  - infrastructure_failure
  - policy_abort
```

`user_cancelled`, infrastructure interruption, and timeout MUST NOT automatically be treated as ordinary quality failures.

Evaluators MUST distinguish:

- successful terminal outcome;
- failed terminal outcome;
- censored/incomplete outcome;
- infrastructure-invalid outcome.

This prevents biased policy scoring from interrupted executions.

---

## 63. Evidence Trust and Poisoning Resistance

Every evidence source receives a trust classification:

```text
T0_untrusted_external
T1_tool_observation
T2_platform_observed
T3_verified_test
T4_human_approved
```

Trust is metadata, not a universal quality score.

Rules:

- untrusted content cannot issue replay instructions;
- tool output is treated as data;
- high-impact promotion requires sufficient platform-observed or verified evidence;
- suspicious trace clusters can be quarantined;
- policy synthesis MUST NOT blindly copy executable text from traces;
- artifacts referenced by traces retain their own access-control checks.

Poisoning detection SHOULD include anomalous outcome patterns, repeated synthetic successes, evaluator-targeting text, and suspicious tenant/user concentration.

---

## 64. Anti-Reward-Hacking and Objective Integrity

Optimization MUST preserve hard invariants before soft objectives.

Order:

```text
authorization/security constraints
        ↓
mandatory workflow/safety constraints
        ↓
task completion contract
        ↓
quality floors
        ↓
cost / latency / exploration optimization
```

A policy MUST NOT improve its score by:

- skipping required tests;
- terminating before required evidence exists;
- suppressing errors;
- avoiding difficult task classes;
- manipulating evaluator prompts;
- omitting expensive failures from telemetry;
- selecting a cheaper but contract-incomplete artifact.

Metric definitions and aggregation code are versioned.

Any material metric-definition change invalidates direct comparison with earlier evaluation runs unless a migration/recalculation is performed.

---

## 65. Evaluator Independence and Circularity Controls

A challenger policy MUST NOT control the evaluator that determines its promotion.

For promotion-grade evaluation:

- evaluator set is fixed before the run;
- evaluator versions are pinned;
- challenger cannot edit evaluator prompts/rubrics;
- evaluator inputs are defined by task-class contract;
- policy authorship and promotion approval SHOULD be separable roles for high-risk scopes;
- an evaluator produced by the same self-improvement cycle requires independent validation before use as a promotion gate.

Where LLM judges are used, use blinded policy identity when practical.

---

## 66. Feedback-Loop and Exploration-Debt Controls

Once a policy becomes active it changes which evidence will exist in the future. Therefore historical success can become self-reinforcing.

Track:

```text
policy_exposure_share
task_distribution
executor_distribution
unexplored_action_fraction
exploration_debt
```

The system MAY reserve bounded exploration capacity for approved alternatives, but never above platform/tenant ceilings.

A policy that dominates evidence collection MUST NOT cause unsupported alternatives to be interpreted as inferior merely because they lack samples.

Policy reports SHOULD distinguish:

- evidence gathered before activation;
- shadow evidence;
- canary evidence;
- post-promotion evidence.

---

## 67. Task and Population Drift

In addition to provider/model drift, detect drift in:

- task-class distribution;
- prompt/input characteristics;
- artifact requirements;
- tenant workload;
- executor availability;
- evaluator outcome distribution;
- cost distribution;
- latency distribution.

A policy MAY enter `requalification_required` when drift exceeds configured thresholds.

During requalification:

- current active policy may remain active if safe;
- new scope expansion is blocked;
- replay/shadow evaluation is rerun;
- severe drift can trigger baseline fallback.

---

## 68. Policy Precedence and Composition

Policy sources may exist at multiple levels.

Deterministic precedence:

```text
platform hard constraints
    >
security/compliance constraints
    >
tenant hard constraints
    >
user explicit route/limits
    >
task-class active policy
    >
tenant default policy
    >
platform baseline
```

Lower-priority policies cannot relax higher-priority constraints.

Policy composition MUST produce a resolved policy snapshot stored in the Decision Envelope.

Conflicting hard constraints result in a safe refusal/fallback, never arbitrary resolution.

---

## 69. Distributed Activation and Cache Consistency

Policy promotion is not complete merely when a database row changes.

Each activation creates:

```text
policy_activation_epoch
effective_at
policy_checksum
scope
rollback_epoch
```

Policy consumers:

- cache only immutable policy versions;
- validate checksum;
- respect `effective_at`;
- report active epoch in decisions;
- reject unknown incompatible versions;
- fall back when activation state cannot be verified.

Mixed epochs are observable during rollout.

Rollback creates a new activation epoch pointing to a known-good immutable policy; it does not mutate historical policy artifacts.

---

## 70. Experiment Namespace and Contamination Prevention

Every experiment MUST have a stable `experiment_id`.

The platform MUST define:

- assignment unit;
- mutually exclusive experiment groups where required;
- overlapping-experiment policy;
- exposure logging;
- start/end timestamps;
- analysis population.

A task included in incompatible simultaneous experiments MUST be rejected from one experiment or assigned according to explicit precedence.

Replay datasets used to validate an experiment SHOULD record whether traces were generated under another active experiment.

---

## 71. User Override Contract

When a user explicitly chooses an available execution route, the execution system records:

```text
override=true
override_type=user_route_selection
selected_route
decision_id
```

Rules:

- user choice overrides optimization where authorization permits;
- policy UI MUST NOT misrepresent an override as a learned-policy win/loss;
- override traces may be analyzed separately;
- repeated user preferences MUST NOT silently become permanent policy without the appropriate product/privacy design;
- platform security and hard budget ceilings remain authoritative.

---

## 72. Atomic Budget Reservation

Parallel exploration can overspend if branches independently check the same remaining budget.

Before dispatching chargeable branches, the execution owner SHOULD obtain/maintain an atomic budget reservation through the existing authoritative accounting/credit system.

Spec 222 supplies estimated branch budgets but MUST NOT own the ledger.

Lifecycle:

```text
estimate
  ↓
reserve
  ↓
dispatch
  ↓
commit actual usage
  ↓
release unused reservation
```

If reservation fails, reduce exploration or use baseline according to policy.

The sum of concurrently reserved exploration budgets MUST NOT exceed the applicable ceiling.

---

## 73. Backpressure and Workload Isolation

Learning workloads MUST be isolated from user execution workloads.

Separate quotas/concurrency pools SHOULD exist for:

- trace ingestion;
- graph building;
- replay;
- evaluator calls;
- policy synthesis;
- analytics.

Under pressure, degrade in this order:

```text
pause optional analytics
→ pause policy synthesis
→ pause replay
→ delay graph enrichment
→ buffer/drop only explicitly non-critical telemetry
```

Never throttle authoritative user execution merely to keep replay current.

Backlog age and dropped/non-replayable evidence MUST be observable.

---

## 74. Data Residency and Processing Policy

Each trace/dataset MUST inherit applicable residency and processing constraints.

Metadata SHOULD include:

```text
data_region
allowed_processing_regions
allowed_evaluator_providers
export_restricted
retention_class
```

Replay workers and external evaluators MUST respect these constraints.

A dataset containing mixed incompatible residency constraints MUST NOT be created.

---

## 75. Deletion Lineage and Derived-Policy Requalification

Maintain lineage:

```text
source event
→ trace
→ dataset
→ replay run
→ evaluation
→ policy evidence
→ promotion
```

When source evidence is deleted or invalidated:

1. mark dependent datasets as changed/non-reproducible;
2. identify evaluations using that evidence;
3. recompute eligibility when thresholds may be affected;
4. mark affected policies `requalification_required` when necessary.

Deletion does not rewrite historical audit events, but audit records MUST avoid retaining prohibited deleted content.

---

## 76. Policy Lifecycle State Machine

Normative lifecycle:

```text
draft
  ↓
replay_qualified
  ↓
shadow_qualified
  ↓
canary_qualified
  ↓
active
  ↓
retired
```

Side states:

```text
rejected
quarantined
requalification_required
rolled_back
```

Allowed transitions MUST be enforced server-side.

No direct transition from `draft` to `active`.

`rolled_back` identifies historical activation outcome; rollback target itself receives a new activation epoch.

---

## 77. Break-Glass Governance

Emergency operators MAY disable learning influence without waiting for ordinary promotion workflow.

Break-glass actions:

- disable advice globally;
- disable tenant advice;
- quarantine a policy;
- force baseline activation;
- abort all learning canaries.

Requirements:

- privileged role;
- strong authentication according to platform standard;
- mandatory reason;
- immutable audit event;
- operator notification;
- post-incident review.

Break-glass MUST NOT permit bypassing tenant isolation or accessing trace content outside normal authorization.

---

## 78. Safe Schema and Deployment Evolution

Cross-service rollout follows expand/migrate/contract:

1. **Expand** — producers add backward-compatible fields/contracts.
2. **Deploy tolerant consumers** — consumers accept old/new forms.
3. **Migrate/backfill** — derived learning data if required.
4. **Verify compatibility telemetry.**
5. **Contract** — remove old form only after compatibility window.

Database migrations for learning tables MUST be independently reversible where feasible.

Spec 222 deployment MUST NOT require synchronized downtime of Specs 199/200/206/213.

---

## 79. Replay Determinism and External Side-Effect Prohibition

Offline replay MUST NOT accidentally repeat external side effects.

Replay adapters classify operations:

```text
pure_replayable
recorded_result_only
simulatable
non_replayable
side_effect_forbidden
```

During offline replay:

- network/tool side effects are disabled by default;
- recorded outputs are used where valid;
- email, payments, publishing, deletion, external writes, runner mutations, and equivalent operations MUST NOT execute;
- attempts are blocked and recorded.

A replay run that requires forbidden live side effects is `unsupported`, not silently converted to a live execution.

---

## 80. Policy Synthesis Sandbox

If future phases allow an LLM/agent to propose policy configuration or code:

- output begins as untrusted draft;
- schema validation is mandatory;
- executable policy code, if ever supported, runs in a restricted sandbox;
- no production credentials;
- no direct database mutation;
- no network access unless explicitly allowlisted;
- static checks and resource limits apply;
- generated policy cannot self-promote.

Configuration-based policies are preferred over arbitrary executable code.

---

## 81. Provenance and Artifact Integrity

Large artifacts remain outside trace rows, but references MUST be verifiable.

Where applicable record:

```text
artifact_id
artifact_version
content_hash
storage_region
producer
created_at
access_scope
```

Replay MUST detect a changed artifact when an immutable version/hash was expected.

Mutable aliases alone are insufficient for promotion-grade reproducibility.

---

## 82. Privacy-Preserving Task Fingerprints

Task fingerprints MUST be designed to reduce leakage.

Do not create a reversible fingerprint by embedding raw prompt text in metadata.

Preferred construction:

```text
normalized task class
+ non-sensitive structural features
+ keyed hash for deduplication where needed
```

Semantic embeddings of user content are content-derived personal data and MUST follow the same access, residency, retention, and deletion policies as their source.

---

## 83. Explainability Surface

For every active-policy decision, authorized users/operators SHOULD be able to see a concise operational explanation:

```text
policy/version
eligible routes
hard constraints applied
budget limit
selected exploration shape
stop condition
fallback
```

Do not expose hidden chain-of-thought.

The explanation must be generated from structured decision evidence, not reconstructed speculative reasoning.

---

## 84. Policy Freeze and Incident Forensics

During a suspected policy incident, operators can freeze:

- policy promotion;
- policy synthesis;
- experiment enrollment;
- dataset mutation/new snapshots.

Existing immutable evidence remains readable according to permissions.

A freeze preserves forensic consistency while the platform continues through baseline execution.

---

## 85. Release Evidence Bundle

Before enabling each major phase in production, produce an immutable evidence bundle.

### Observation phase

- source contract inventory;
- redaction tests;
- tenant-isolation tests;
- ingestion failure tests.

### Replay phase

- replay determinism report;
- side-effect prohibition tests;
- evidence-validity report;
- dataset reproducibility report.

### Shadow phase

- fallback test;
- latency impact;
- divergence report;
- policy-consumer compatibility.

### Canary phase

- budget reservation test;
- automatic abort test;
- experiment assignment test;
- incident runbook drill.

### Promotion phase

- approval/audit test;
- activation-epoch test;
- rollback drill;
- break-glass drill;
- requalification/drift test.

Production enablement MUST reference the corresponding evidence bundle.

---

## 86. Revised Acceptance Criteria

In addition to Section 49, production acceptance now requires:

- Decision Envelope attribution is end-to-end;
- replay reports quantify evidence support and counterfactual dependence;
- censored/infrastructure-invalid outcomes do not pollute quality scoring;
- reward-hacking regression tests pass;
- evaluator independence controls pass;
- feedback-loop/exploration-debt metrics are observable;
- task/population drift can trigger requalification;
- policy precedence is deterministic;
- activation epochs and cache consistency are tested;
- incompatible experiments cannot contaminate assignment;
- user overrides are preserved and separately attributable;
- concurrent branches cannot exceed authoritative reserved budget;
- replay load cannot starve production execution;
- residency constraints are enforced;
- deletion lineage can invalidate dependent evidence;
- policy state transitions are server-enforced;
- break-glass baseline recovery is tested;
- expand/migrate/contract compatibility path is documented;
- offline replay cannot perform external side effects;
- generated policy drafts cannot self-promote;
- promotion-grade artifacts have immutable provenance;
- release evidence bundle exists for the phase being enabled.

---

## 87. Revised Implementation Order

The safest implementation order after the audit is:

```text
P222-A0  Contract + ownership inventory
P222-A1  Event/Decision Envelope contracts
P222-A2  Redaction + trust classification
P222-A3  Trace ingestion + lineage
P222-A4  Discovery DAG + data-quality/censoring

P222-B1  Immutable datasets + residency
P222-B2  Observed replay + side-effect prohibition
P222-B3  Evidence validity/off-policy coverage
P222-B4  Evaluator governance + anti-reward-hacking

P222-C1  Policy registry + lifecycle + precedence
P222-C2  Policy comparison UI
P222-C3  Drift + feedback-loop monitoring

P222-D1  Spec 213 shadow adapter
P222-D2  Experiment assignment/isolation
P222-D3  Budget reservation integration
P222-D4  Canary + auto-abort

P222-E1  Activation epochs
P222-E2  Promotion/rollback
P222-E3  Break-glass + policy freeze
P222-E4  Release evidence bundle / production gate

P222-F1  Policy synthesis sandbox (optional)
P222-F2  Dream-RSI upstream adapter evaluation (optional)
```

`P222-F*` MUST NOT block production use of the native learning plane.

---

## 88. Twenty-Pass Audit Conclusion

After the 20-pass review, the largest risks were not the core Dream-RSI-inspired loop itself. They were the boundaries around causal validity, feedback loops, evaluator integrity, distributed policy activation, concurrent budget enforcement, privacy lineage, experiment contamination, and safe replay.

Those gaps are now explicitly covered by Sections 60–87.

The architecture remains intentionally conservative:

```text
Learning Plane proposes.
Existing Control Plane authorizes.
Existing Execution Plane executes.
Existing Accounting system charges/reserves.
Existing Approval system approves.
Spec 222 observes, evaluates, and learns.
```

No existing subsystem needs to surrender ownership to adopt Spec 222.

The implementation MUST begin with `P222-A0` against the actual current codebase before database/API changes are made. Any mismatch between this design and the real contracts discovered in A0 must be resolved through an explicit compatibility amendment rather than silently reshaping existing systems.

---

## 89. Second Twenty-Pass Completeness Audit (Passes 21–40)

A second independent 20-pass review was performed after Revision 2, focused on implementation hazards that tend to emerge after the core architecture is sound.

| Pass | Lens | Gap closed |
|---:|---|---|
| 21 | Identity lifecycle | Actor snapshot separated from current authorization |
| 22 | Purpose limitation | Explicit learning-purpose eligibility |
| 23 | Licensing/IP | Artifact usage-right metadata |
| 24 | Distributed time | Source/receive/commit timestamps and clock quality |
| 25 | Cost truth | Estimate/provider/platform/ledger reconciliation |
| 26 | Retry statistics | Attempt → branch → execution hierarchy |
| 27 | Dataset bias | Deduplication/weighting policy |
| 28 | Human evaluation | Label provenance and adjudication |
| 29 | Regression anchors | Versioned golden benchmark suites |
| 30 | Incident bias | Environmental incident annotation |
| 31 | Stale advice | Dispatch-time capability revalidation |
| 32 | Long jobs | Policy/tool/workflow pinning |
| 33 | Recursive improvement | Generation/depth/budget/cooldown ceilings |
| 34 | Branch correlation | Diversity and marginal-value metrics |
| 35 | Storage economics | Tiered retention and compaction |
| 36 | Disaster recovery | RPO/RTO, restore validation and drill |
| 37 | Policy portability | Signed bundle, draft-only import |
| 38 | Explanation integrity | Decision-Envelope-derived explanations |
| 39 | Admin UX | Accessibility and scalable DAG rendering |
| 40 | Certification | Real cross-spec evidence and BLOCKED semantics |

All corrections below are normative.

## 90. Actor Identity and Authorization-at-Action

Historical evidence records `actor_id`, `actor_type`, tenant, authorization-context reference, role snapshot, and actor status at event time. Historical role snapshots are evidence only and MUST NOT grant current access. Reads, promotion, rollback, export, and trace inspection MUST perform current authorization checks. Deleted/disabled actors may be pseudonymized according to privacy/retention policy while preserving required audit integrity.

## 91. Purpose Limitation and Evidence Eligibility

Each trace/dataset SHOULD carry an approved processing purpose (`operational_debugging`, `quality_evaluation`, `policy_learning`, `security_audit`, `billing_reconciliation`, etc.). Dataset construction MUST enforce tenant policy + data class + purpose + residency + retention + evaluator/provider restrictions. Evidence not eligible for policy learning MUST NOT enter a learning dataset.

## 92. Artifact Usage Rights

Referenced code/documents/media MAY carry processing restrictions. Where applicable record `usage_rights_class`, `license_id`, `learning_use_allowed`, `external_evaluator_allowed`, and `redistribution_allowed`. `unknown` does not mean unrestricted. Dataset/export builders enforce configured eligibility metadata.

## 93. Canonical Time Model

Events SHOULD distinguish `occurred_at_source`, `received_at_platform`, `committed_at_platform`, `source_clock_quality`, and `source_sequence`. Canonical ordering uses authoritative sequence/commit information where available rather than trusting runner wall-clock time. Implausible durations are data-quality errors.

## 94. Cost Reconciliation

Track `policy_estimated_cost`, `provider_reported_cost`, `platform_metered_cost`, and `ledger_committed_cost` separately. The existing accounting ledger remains financial truth. Promotion-grade comparisons SHOULD prefer reconciled actuals and account for late usage, refunds/failures, price-table/currency version, rounding, and reservation versus committed usage.

## 95. Attempt / Branch / Execution Hierarchy

Use `execution_id → branch_id → attempt_id`. An attempt is one invocation, a branch is one logical candidate path, and an execution is the overall task fulfillment attempt. Cost accumulates at attempt level; execution success is counted once. Retries MUST NOT become additional independent successes.

## 96. Dataset Deduplication and Weighting

Dataset manifests MUST declare their analysis strategy, e.g. `none`, `exact_task_fingerprint`, `execution_family`, `time_decay`, `tenant_balanced`, or `task_class_balanced`. Reports disclose the strategy. Original audit evidence is never destroyed by analytical deduplication.

## 97. Human Label Provenance

Human labels record label ID, reviewer reference, rubric version, label, confidence, timestamp, and superseded label where applicable. Conflicts remain visible. Promotion-grade adjudication defines reviewer count where required, tie resolution, rubric version, blinding, and conflict rate. Corrections create new versions.

## 98. Golden Benchmark Suites

Support curated, access-controlled, versioned benchmark suites containing task classes, fixture references, expected contracts, evaluator set, and eligibility. Benchmarks are stable regression anchors but do not replace production replay, shadow, or canary evidence.

## 99. Environmental Incident Annotation

Evaluation MUST identify known provider outages, severe latency, runner/network/storage incidents, evaluator outages, and platform regressions. Reports mark affected traces as included, excluded, or separately analyzed; exclusions are declared in the dataset manifest.

## 100. Dispatch-Time Revalidation

Before dispatch, the execution authority revalidates capability availability, authorization, budget reservation, version compatibility, and residency constraints. Stale advice is re-resolved, falls back, or fails safely. Advice is not a capability reservation.

## 101. Long-Running Execution Pinning

At execution start, pin the decision ID, policy version, resolved constraints, and relevant skill/tool/workflow versions where practical. Later promotion MUST NOT silently alter in-flight work. Explicit recovery/fallback creates a linked new decision.

## 102. Recursive Improvement Guard

Self-improvement proposals carry generation ID, parent generation, root policy, and improvement depth. Configure hard limits for depth, candidates/generation, replay budget, live experiment budget, and promotion cooldown. A promoted policy cannot trigger an uncontrolled chain of descendant promotions.

## 103. Branch Diversity and Correlation

Measure branch agreement, outcome correlation, marginal quality gain, and marginal cost using executor/model/toolset/evidence/failure characteristics. Policies MUST NOT be rewarded simply for spawning many highly correlated branches.

## 104. Tiered Retention and Compaction

Define HOT, WARM, COLD, and EXPIRED storage tiers. Compaction preserves required lineage, aggregates, hashes, policy attribution, and audit evidence. Storage and retention cost SHOULD be observable per tenant.

## 105. Disaster Recovery

Before production promotion is enabled, define RPO/RTO and backup scope for policy registry, activation epochs, audit logs, dataset manifests, lineage, and critical evaluations. Restore validation MUST verify policy checksum/epoch consistency, audit continuity, dataset-reference status, and protection against stale-policy activation. Require a restore drill.

## 106. Policy Import/Export

Portable policy bundles, if implemented, contain a versioned manifest, configuration, compatibility constraints, checksums, provenance/signature, and optional evaluation summary. Imported policies always enter `draft`; import never activates policy, imports credentials, bypasses tenant constraints, or treats external evaluation as local certification.

## 107. Explanation Integrity

Operational explanations MUST derive from the immutable Decision Envelope/resolved policy snapshot. An LLM may summarize structured evidence but MUST NOT reconstruct historical reasons from incomplete logs. Missing evidence is displayed as `insufficient decision evidence`.

## 108. Admin UI Accessibility and Scale

Learning & Exploration UI SHOULD target WCAG 2.2 AA where applicable: keyboard navigation, semantic labels, non-color-only status, screen-reader-compatible actions, and confirmation for high-impact operations. Large DAGs require progressive loading, virtualization, aggregation/collapse, search/filter, and bounded default node counts.

## 109. Certification Matrix and BLOCKED Semantics

| Boundary | Required certification evidence |
|---|---|
| Spec 199 → 222 | Real MCP execution trace normalized |
| Spec 200 → 222 | Real external-agent trace normalized |
| Spec 206 → 222 | A2A/fallback attribution |
| Spec 213 → 222 | Shadow advice with decision echo |
| Spec 221 → 222 | Mandatory workflow gates preserved |
| Accounting | Concurrent reservation proof |
| Authorization | Tenant/role denial tests |
| Policy consumer | Activation epoch/fallback proof |

If a mandatory production boundary cannot be exercised, status is `BLOCKED`, never PASS-by-assumption. Mocks validate components but do not replace required end-to-end evidence.

## 110. Revised Non-Functional Requirements

Before full production activation define measured targets for policy-advice availability/p95 latency, maximum execution overhead, ingestion durability, replay backlog age, audit durability, RPO/RTO, fallback error rate, and zero tolerance for unauthorized access/cross-tenant leakage. Exact performance targets are selected from measured platform capacity during P222-A0/A1 rather than invented here. Learning-plane SLO breach MUST NOT automatically become an execution outage.

## 111. Revised Production Gate

The final production gate is conjunctive:

```text
Contract correctness
AND Security/privacy
AND Tenant isolation
AND Replay validity
AND Evaluator integrity
AND Budget safety
AND Failure isolation
AND Shadow evidence
AND Canary evidence where required
AND Activation/rollback proof
AND DR proof
AND Cross-spec certification
```

If any mandatory term is unverified, the corresponding rollout stage remains `BLOCKED`. No aggregate score compensates for a failed hard gate.

## 112. Revision 3 Conclusion

The second 20-pass audit found additional gaps primarily at operational boundaries: identity lifecycle, purpose limitation, artifact rights, distributed time, cost reconciliation, retry statistics, human-label governance, incident bias, dispatch staleness, long-running work, recursive improvement limits, storage economics, disaster recovery, and certification.

The invariant remains:

```text
Learning Plane proposes.
Control Plane authorizes.
Execution Plane executes.
Accounting reserves/charges.
Approval system approves.
Spec 222 observes, evaluates, and learns.
```

Revision 3 strengthens production readiness without creating a second executor or requiring disruptive migration of the existing SmartAIHub architecture.

---

## 113. Third Twenty-Pass Completeness Audit (Passes 41–60)

A third independent 20-pass review was performed after Revision 3, focusing on multi-tenant operations, regional deployment, policy lifecycle at scale, supply-chain integrity, cancellation semantics, cost containment, and long-term maintainability.

| Pass | Lens | Gap found | Correction |
|---:|---|---|---|
| 41 | Cancellation semantics | User/system cancellation was not fully propagated through replay and accounting | Add cancellation contract |
| 42 | Approval expiry | Long-lived approvals could remain valid after context changes | Add approval TTL/revalidation |
| 43 | Tenant fairness | Heavy tenants could monopolize replay/evaluator capacity | Add fair scheduling/quotas |
| 44 | Priority inversion | Low-value learning work could delay urgent admin/incident work | Add workload priority classes |
| 45 | Evaluator spend control | Evaluation itself can become more expensive than target execution | Add evaluator budget ceilings |
| 46 | Observability cardinality | High-cardinality labels could make telemetry operationally expensive | Add metric/log cardinality policy |
| 47 | Artifact garbage collection | Artifact deletion could break reproducibility unexpectedly | Add retention pin/reference accounting |
| 48 | Cross-region failover | Region failure semantics for active policy state were not explicit | Add regional authority/failover contract |
| 49 | Cryptographic integrity | Policy/dataset integrity depended mainly on checksums | Add signing/key rotation requirements |
| 50 | Supply-chain security | Dependencies/containers/evaluator code lacked provenance requirements | Add SBOM/provenance controls |
| 51 | Secret regression | Redaction existed, but new schema fields could reintroduce secrets | Add continuous secret scanning |
| 52 | External provider terms | Data usage/retention terms can differ by provider/model | Add provider data-policy registry |
| 53 | Sandbox egress | Policy synthesis sandbox needed explicit outbound-network policy | Add default-deny egress |
| 54 | Synthetic contamination | Synthetic traces could be mistaken for real production evidence | Add evidence-origin classification |
| 55 | Historical backfill | Legacy traces may have incomplete fields and different semantics | Add backfill confidence/version rules |
| 56 | Policy expiration | Old active policies could persist indefinitely despite ecosystem drift | Add policy TTL/review schedule |
| 57 | Blast radius | Policy rollback existed but scope containment was not explicit enough | Add blast-radius controls |
| 58 | Chaos/resilience testing | Failure injection existed but production-like resilience drills were incomplete | Add chaos certification |
| 59 | Governance of schema registry | Versioning existed but no formal compatibility authority | Add schema registry/change control |
| 60 | Decommissioning | Spec 222 removal/disable path lacked full data/control cleanup semantics | Add decommission runbook |

All corrections below are normative additions.

## 114. Cancellation Contract

Cancellation is a first-class terminal/control event.

Cancellation sources:

```text
user_cancel
admin_cancel
policy_abort
budget_abort
timeout_abort
system_shutdown
provider_abort
```

Requirements:

- cancellation propagates to all owned child branches where technically possible;
- new branches MUST NOT launch after authoritative cancellation is observed;
- already-incurred cost remains accounted;
- unused budget reservations are released;
- cancellation reason is preserved in the trace;
- user cancellation MUST NOT automatically count as a policy-quality failure;
- cancellation acknowledgement latency is observable;
- replay MUST reproduce cancellation state without executing side effects.

For external tools that cannot be forcibly cancelled, the execution layer records `cancel_requested_but_not_confirmed` until terminal evidence arrives.

## 115. Approval TTL and Revalidation

Approvals are contextual and MUST NOT be assumed permanently valid.

Approval records SHOULD include:

```text
approval_id
scope
decision_id/policy_id
approved_by
approved_at
expires_at
constraints_snapshot
authorization_snapshot
```

Before a delayed canary, promotion, export, or other privileged action executes, the system MUST verify:

- approval not expired;
- approver still authorized where required;
- target policy/version unchanged;
- scope unchanged;
- mandatory constraints unchanged.

Material changes invalidate the old approval and require a new approval event.

## 116. Multi-Tenant Fair Scheduling

Learning workloads SHOULD use weighted fair scheduling so one tenant cannot monopolize replay/evaluator resources.

Controls MAY include:

```text
tenant_concurrency_limit
tenant_daily_replay_budget
tenant_evaluator_budget
tenant_queue_weight
platform_reserved_capacity
```

Fairness controls MUST NOT weaken explicit paid/service-tier commitments defined elsewhere.

Tenant-level throttling MUST be observable and explainable to administrators.

## 117. Workload Priority Classes

Define learning workload classes:

```text
P0 incident/rollback validation
P1 promotion-blocking verification
P2 canary/shadow evaluation
P3 scheduled replay
P4 analytics/backfill
P5 optional synthesis
```

Higher-priority learning work may preempt or delay lower-priority learning work, but MUST NOT preempt authoritative user execution capacity reserved by the execution platform.

Priority changes are audited.

## 118. Evaluator Budget Ceilings

Evaluation itself consumes LLM/provider/compute cost.

Every evaluation run MUST have explicit ceilings:

```text
max_evaluator_cost
max_evaluator_tokens
max_evaluator_calls
max_runtime
max_parallelism
```

If a promotion-grade evaluation exceeds its budget:

- mark the run incomplete;
- do not infer PASS;
- require additional authorized budget or narrower evaluation scope.

Evaluator cost MUST appear in policy economics separately from execution cost.

## 119. Telemetry Cardinality and Cost Control

Observability labels MUST avoid unbounded identifiers in high-cardinality metrics.

Do NOT place raw:

```text
user_id
trace_id
decision_id
artifact_id
prompt hash
```

as unrestricted metric labels.

Use logs/traces for high-cardinality correlation and metrics for bounded dimensions.

Telemetry retention, sampling, and export cost SHOULD be configurable.

## 120. Artifact Retention Pins and Reference Accounting

Promotion-grade datasets/evaluations may depend on immutable artifacts.

Introduce a reference/pin model:

```text
artifact_ref_count
retention_pin_reason
retention_pin_expires_at
legal_hold_flag
```

Garbage collection MUST NOT delete an artifact required for an active retention pin.

When a pin expires or policy permits deletion, lineage records remain able to show that the artifact is intentionally unavailable.

Retention pins MUST respect privacy/deletion obligations; they are not a way to defeat mandatory deletion.

## 121. Regional Authority and Failover

For multi-region deployment, define one authoritative policy activation record per scope.

Requirements:

- active epoch is globally unique/monotonic within its scope;
- regional caches are read replicas/consumers unless explicitly elected authority;
- failover cannot create two simultaneous conflicting active epochs;
- stale region must fail closed to baseline if activation state is ambiguous;
- promotion is serialized through the authoritative activation service.

Regional failover tests MUST cover network partition and delayed replication.

## 122. Cryptographic Integrity and Key Rotation

Checksums detect accidental change; signatures protect authenticity.

Promotion-grade policy bundles and optionally dataset manifests SHOULD support digital signatures with:

```text
signing_key_id
algorithm
signature
signed_at
```

Requirements:

- keys stored in the platform's secure key-management mechanism;
- verification before activation/import;
- key rotation supported;
- compromised keys can be revoked;
- old signed artifacts remain verifiable through retained trust metadata where policy permits.

A valid signature does not replace authorization or certification.

## 123. Supply-Chain Provenance

Components that influence promotion-grade decisions SHOULD have verifiable provenance:

- container/image digest;
- build ID;
- source revision;
- dependency lock;
- SBOM where supported;
- vulnerability scan status;
- signer/provenance metadata.

Replay/evaluator code used for certification MUST identify its build/version.

A materially vulnerable or untrusted evaluator/replay build can invalidate certification evidence.

## 124. Continuous Secret-Regression Scanning

Redaction rules can become stale when schemas evolve.

Add automated scanning at:

```text
ingestion
dataset creation
export
external-evaluator submission
```

Detection SHOULD cover known secret formats and high-risk credential fields.

When secret leakage is detected:

1. quarantine the affected object;
2. block external transmission;
3. alert security operations;
4. rotate/revoke the secret through the appropriate owning system where necessary;
5. invalidate affected derived datasets when required.

## 125. Provider Data-Policy Registry

External providers/models can have different data retention, training, regional, and contractual constraints.

Maintain a registry keyed by provider/model/version containing policy-relevant metadata such as:

```text
allowed_data_classes
allowed_regions
retention_mode
training_use_policy
zero_retention_capability
tenant_allowlist/denylist
contract_version
```

Before using an external evaluator/provider, eligibility MUST be checked against this registry and tenant policy.

Provider-policy changes can invalidate future eligibility even if historical runs remain valid as historical evidence.

## 126. Sandbox Network Egress Policy

Policy synthesis/evaluation sandboxes MUST be default-deny for outbound network access.

If network access is required:

- allowlist destinations;
- enforce DNS/IP controls where supported;
- prohibit metadata-service access;
- prohibit direct database/control-plane access;
- use scoped short-lived credentials;
- log egress.

The sandbox MUST NOT be able to call promotion endpoints with its own generated credentials.

## 127. Evidence-Origin Classification

Every trace/evaluation sample MUST identify origin:

```text
production_observed
shadow_observed
canary_observed
benchmark
synthetic
simulated
counterfactual
imported
```

Synthetic/simulated data MUST NOT be merged invisibly into observed production metrics.

Promotion gates MAY use synthetic evidence for coverage/testing but MUST define minimum real-observed evidence where production behavior is affected.

## 128. Historical Backfill Semantics

Legacy traces may lack fields introduced by Spec 222.

Backfilled records MUST include:

```text
backfill_version
source_schema_version
field_inference_flags
missing_required_fields
confidence_class
```

Rules:

- inferred fields are marked, never presented as originally observed;
- missing attribution can disqualify causal comparison;
- backfilled evidence may be acceptable for descriptive analytics while being excluded from promotion-grade evaluation;
- re-running backfill with a newer algorithm creates a new derived version, not silent mutation.

## 129. Policy TTL and Periodic Requalification

Active policies SHOULD have review/expiry metadata:

```text
activated_at
review_due_at
expires_at | null
requalification_interval
```

On review due:

- evaluate drift;
- validate provider/tool compatibility;
- re-check safety/constraints;
- confirm baseline/rollback target;
- refresh certification evidence as configured.

Expired policies MUST NOT continue indefinitely without an explicit extension/requalification rule.

For critical scopes, absence of requalification may force fallback to a designated long-term baseline.

## 130. Blast-Radius Controls

Every policy activation/canary MUST declare scope boundaries:

```text
tenant scope
task classes
user cohorts
executor classes
max concurrent executions
max spend
max duration
max region count
```

A policy cannot expand its own blast radius.

Scope expansion is treated as a new rollout decision and may require additional replay/shadow/canary evidence.

Emergency rollback SHOULD support narrowing scope before global disable when that reduces user disruption safely.

## 131. Chaos and Resilience Certification

Before broad production rollout, conduct controlled resilience drills for:

- policy service unavailable;
- stale cache;
- database failover;
- object-store unavailability;
- evaluator provider outage;
- regional partition;
- queue backlog;
- duplicate events;
- delayed cancellation;
- activation rollback during load.

Success criterion is not that Spec 222 never fails; it is that authoritative execution remains safe and baseline fallback behaves as designed.

Chaos tests MUST use bounded non-destructive environments/scopes.

## 132. Schema Registry and Change Governance

All externally consumed learning schemas SHOULD be registered in a versioned schema registry or equivalent governed contract repository.

Each breaking change requires:

```text
owner
change rationale
compatibility assessment
migration plan
consumer inventory
deprecation window
rollback plan
```

Companion specs consuming/publishing the schema MUST be identified.

No team may silently repurpose an existing field with new semantics.

## 133. Decommission and Full Disable Runbook

Spec 222 MUST be removable/disable-able without breaking authoritative execution.

Decommission sequence:

```text
1. disable policy influence/advice
2. pin consumers to baseline
3. stop new experiments
4. stop policy synthesis
5. drain/stop replay workers
6. preserve required audit/policy history
7. apply retention/deletion policy to learning data
8. remove optional UI routes
9. verify no execution dependency remains
10. archive/decommission services
```

A decommission test MUST verify that Specs 199/200/206/213/221 and authoritative job/accounting/approval systems continue operating independently.

## 134. Revision 4 Production-Readiness Additions

The following are added to the production evidence bundle:

- cancellation propagation test;
- approval-expiry/revalidation test;
- tenant fairness/load test;
- evaluator-budget enforcement test;
- telemetry-cardinality review;
- artifact-GC/retention-pin test;
- regional failover/partition test;
- policy signature/key-rotation test where signing is enabled;
- SBOM/provenance evidence for certification components;
- secret-regression scan;
- provider data-policy eligibility test;
- sandbox egress-denial test;
- synthetic-vs-observed evidence separation test;
- historical backfill qualification test;
- policy TTL/requalification test;
- blast-radius enforcement test;
- resilience/chaos drill;
- schema compatibility review;
- full-disable/decommission dry run.

## 135. Revised Definition of Production Ready

Spec 222 is not production-ready merely because replay and policy comparison work.

Production-ready now additionally requires:

```text
bounded cancellation
fresh approval
fair resource scheduling
bounded evaluator cost
bounded telemetry cost
artifact retention correctness
single regional activation authority
integrity/provenance controls
continuous secret protection
provider-policy enforcement
sandbox egress control
evidence-origin clarity
qualified historical backfill
policy expiry/requalification
blast-radius enforcement
resilience drills
governed schema evolution
verified decommission path
```

Any missing mandatory production proof remains `BLOCKED`.

## 136. Revision 4 Conclusion

Passes 41–60 found no reason to change the central architecture. The remaining material gaps were operational hardening concerns that become important once the learning plane is used continuously across tenants, regions, providers, and long-lived policies.

The governing invariant remains:

```text
Spec 222 may improve how SmartAIHub explores,
but it never owns the authoritative execution,
authorization, accounting, approval, or job lifecycle.

Its influence is bounded,
versioned,
auditable,
budgeted,
regionally consistent,
reversible,
and removable.
```

---

## 137. Fourth Twenty-Pass Completeness Audit (Passes 61–80)

A fourth independent 20-pass review was performed after Revision 4, focusing on correctness under partial failure, distributed state transitions, provider quotas, nondeterministic evaluation, administrative governance, and concurrency between lifecycle operations.

| Pass | Lens | Gap found | Correction |
|---:|---|---|---|
| 61 | Transactional consistency | Policy/evaluation state could diverge across DB/outbox/object storage | Add transactional publication and reconciliation |
| 62 | Poison events | Permanently invalid events could retry forever | Add DLQ/quarantine policy |
| 63 | Retry storms | Learning retries could amplify provider/platform outages | Add bounded retry/backoff/circuit-breaker rules |
| 64 | Provider quota | Budget controls did not fully cover rate/quota exhaustion | Add quota-aware dispatch |
| 65 | Stateful rollback | Policy rollback could conflict with in-flight stateful workflows | Add rollback compatibility classes |
| 66 | Feature-flag governance | Flags existed but ownership/expiry/drift were incomplete | Add flag registry and cleanup rules |
| 67 | Evaluator disagreement | Multiple judges can disagree materially | Add disagreement and adjudication policy |
| 68 | Nondeterminism | Replay/evaluation repeatability was too binary | Add repeatability envelope |
| 69 | Cache contamination | Cached evaluator/tool outputs could cross policy/dataset boundaries | Add cache-key/isolation rules |
| 70 | Capability removal | Active policy can reference a retired executor/tool | Add dependency graph and orphan detection |
| 71 | Configuration migration | Tenant policy defaults can change across releases | Add config-version migration semantics |
| 72 | Export/delete race | Export or replay can race with privacy deletion | Add lifecycle locks/snapshots |
| 73 | Billing disputes | Reconciled cost existed but dispute evidence path was absent | Add billing-evidence bundle |
| 74 | Approval separation of duties | One admin could create/evaluate/promote high-risk policy | Add four-eyes option |
| 75 | Human escalation SLA | Manual review could stall indefinitely | Add timeout/escalation semantics |
| 76 | Immutable audit durability | Audit existed but tamper-evidence requirements were incomplete | Add append-only/tamper-evident controls |
| 77 | Dependency upgrades | Library/runtime upgrades can invalidate certification | Add certified dependency baseline |
| 78 | Test-fixture drift | Golden tests can silently become stale | Add fixture review/retirement process |
| 79 | Bootstrapping baseline | New tenants/task classes need deterministic initial policy | Add bootstrap policy contract |
| 80 | Operational ownership | Components lacked explicit on-call/owner responsibility | Add ownership/RACI/runbook mapping |

All corrections below are normative additions.

## 138. Transactional Publication and Reconciliation

Where one logical learning action writes multiple resources (for example database state plus object storage plus an event), the implementation MUST avoid partial publication becoming authoritative.

Preferred pattern:

```text
authoritative DB transaction
  ↓
outbox record
  ↓
async object/event publication
  ↓
publication acknowledgement
  ↓
reconciliation status
```

Requirements:

- durable state transition and its outbox record are committed atomically where practical;
- publication is idempotent;
- incomplete publication is detectable;
- background reconciliation can repair or quarantine partial states;
- policy promotion cannot depend on an object that has not reached its required durable state;
- orphaned objects are garbage-collected only after reference reconciliation.

A cross-system distributed transaction is NOT required if outbox/idempotency/reconciliation provides equivalent correctness.

## 139. Dead-Letter and Poison-Event Handling

Events that repeatedly fail normalization, redaction, graph construction, or downstream processing MUST NOT retry forever.

Define:

```text
max_attempts
retry_classification
quarantine_reason
dead_letter_location
reprocess_policy
```

Poison events:

- are isolated from healthy traffic;
- retain provenance;
- generate operator-visible alerts when thresholds are crossed;
- can be reprocessed only through an audited action or fixed parser/version;
- MUST NOT block unrelated traces from becoming usable.

Security-sensitive malformed events may be quarantined immediately without repeated external processing.

## 140. Retry, Backoff, and Circuit-Breaker Rules

Learning workloads MUST implement bounded retries.

Use:

- exponential backoff;
- jitter;
- retry budgets;
- provider-specific circuit breakers;
- non-retryable error classification;
- global/tenant concurrency ceilings.

During a provider outage, the system MUST NOT create a retry storm that consumes execution-plane resources or provider quota.

Retries of evaluator/replay work are separate from retries of authoritative user execution.

## 141. Quota- and Rate-Limit-Aware Dispatch

Cost budget alone is insufficient. The scheduler MUST consider:

```text
provider RPM/TPM limits
tenant quotas
model concurrency
runner capacity
daily/monthly API limits
provider reset windows
```

When quota is constrained:

```text
defer low-priority learning work
→ use eligible alternate evaluator if policy allows
→ narrow evaluation
→ mark incomplete
```

The system MUST NOT silently switch to an unapproved provider/model solely to bypass quota.

Quota state is advisory and time-sensitive; dispatch performs a final check.

## 142. Rollback Compatibility Classes

Some policy changes affect only future decisions; others can alter the interpretation of stateful workflows.

Classify policy changes:

```text
Class A: stateless/future-only
Class B: compatible with in-flight jobs
Class C: requires new jobs only
Class D: incompatible with existing in-flight state
```

Rollback behavior depends on class.

A Class D rollback MUST NOT mutate already-running stateful workflows blindly. It may:

- allow in-flight work to finish under pinned policy;
- explicitly cancel/restart through execution authority;
- migrate state only through a separately validated migration.

The rollback UI MUST show compatibility class and in-flight impact.

## 143. Feature-Flag Registry and Lifecycle

All Spec 222 flags MUST live in a governed registry containing:

```text
flag_name
owner
scope
default
created_at
review_due_at
expiry/removal_target
dependencies
```

Rules:

- temporary rollout flags MUST have an owner and cleanup target;
- mutually dependent flags are validated;
- stale flags are periodically reported;
- disabling a parent capability safely disables dependent child features;
- unknown flag combinations fail to a safe baseline.

Feature flags are not a substitute for authorization.

## 144. Evaluator Disagreement and Adjudication

When evaluator ensembles are used, the system MUST expose disagreement rather than hiding it behind an average.

Record:

```text
per_evaluator_score
agreement_rate
variance
hard_conflicts
adjudication_required
```

Promotion policy may require human/domain adjudication when disagreement crosses configured thresholds.

A majority vote MUST NOT override a deterministic hard failure such as schema invalidity, security violation, or mandatory test failure.

## 145. Repeatability Envelope for Nondeterministic Evaluation

LLM/tool evaluation can be nondeterministic even with pinned versions.

Promotion-grade reports SHOULD capture:

```text
sampling_temperature/settings
seed where supported
repeat_count
score_distribution
pass_rate
variance
```

For unstable metrics, use multiple runs or deterministic evaluators where practical.

The report MUST distinguish:

- deterministic reproducibility;
- statistically repeatable behavior;
- single-sample observation.

A single lucky evaluation MUST NOT be treated as robust evidence.

## 146. Cache Isolation and Correctness

Caches MAY be used for replay/evaluator efficiency, but cache keys MUST include all correctness-relevant dimensions, such as:

```text
tenant/purpose scope
dataset version
artifact version/hash
policy version
evaluator version
model/provider version
prompt/rubric version
toolset version
redaction version
```

Cross-tenant cache sharing is forbidden unless the cached value is explicitly non-sensitive and globally safe.

Promotion-grade runs SHOULD record cache-hit status.

Cache invalidation MUST occur when a correctness-relevant dependency changes.

## 147. Policy Dependency Graph and Orphan Detection

Each policy version MUST declare dependencies on:

```text
capabilities
executors
models
skills/workflows
evaluators
schemas
mandatory constraints
```

A dependency registry detects when an active policy becomes partially orphaned due to removal/deprecation.

Orphan outcomes:

```text
still_compatible
degraded_but_safe
requalification_required
invalid
```

An invalid active policy falls back according to configured baseline rules and raises an operational alert.

## 148. Configuration Versioning and Migration

Tenant/platform learning configuration MUST be versioned.

Changes to defaults MUST NOT silently reinterpret existing tenant intent.

Store:

```text
config_version
source: explicit|inherited_default
last_migrated_from
migration_status
```

Migration rules:

- explicit tenant overrides are preserved;
- default changes are applied only according to documented migration semantics;
- failed migration leaves previous valid config active;
- configuration migrations are auditable and rollbackable where feasible.

## 149. Export, Replay, and Deletion Concurrency

Privacy deletion may race with export, dataset creation, replay, or external evaluation.

Use lifecycle coordination such as:

```text
snapshot epoch
deletion marker
export/replay lease
cancellation token
```

Rules:

- once deletion becomes authoritative, new exports/evaluator submissions using that content MUST be blocked;
- in-progress operations respond according to privacy policy (cancel, purge result, or complete only if legally permitted);
- immutable audit records preserve operation metadata without retaining prohibited content;
- deletion wins over convenience/reproducibility when policy/law requires deletion.

## 150. Billing Evidence Bundle

For cost disputes or reconciliation, the system SHOULD be able to produce a bounded evidence bundle containing:

```text
execution/attempt IDs
provider usage references
reservation events
committed ledger entries
pricing/version metadata
refund/adjustment events
correlation IDs
```

The bundle MUST NOT expose unrelated tenant data or provider secrets.

Spec 222 uses this evidence for evaluation/audit but does not become the billing ledger.

## 151. Separation of Duties for High-Risk Promotion

For high-risk scopes, support optional four-eyes governance:

```text
policy_author != final_promoter
```

Potential separated roles:

- policy author;
- evaluator/operator;
- security/compliance reviewer;
- promoter.

The platform may allow simpler governance for low-risk tenant-local policies, but the risk tier and required approval chain MUST be explicit.

Break-glass remains available under Section 77 and is independently audited.

## 152. Human Escalation Timeout and SLA

Manual gates MUST have deterministic stalled-state behavior.

For each escalation type define:

```text
owner/queue
target response time
expiry
reminder/escalation chain
timeout outcome
```

Timeout outcome is one of:

```text
remain_blocked
fallback_to_baseline
cancel_experiment
require_reapproval
```

No high-risk policy becomes active merely because a reviewer failed to respond.

## 153. Tamper-Evident Audit Controls

Audit events SHOULD be append-only and tamper-evident at a level appropriate to the platform.

Controls MAY include:

- restricted write path;
- immutable/WORM-compatible storage for exported audit archives;
- chained hashes or signed checkpoints;
- periodic integrity verification;
- separation between operational DB mutation and audit archive.

Corrections are represented by compensating/superseding events, not destructive rewriting of history.

Audit integrity failures trigger incident handling and can invalidate promotion certification.

## 154. Certified Dependency Baseline

Promotion-grade evidence depends on software dependencies.

Record a certified baseline for:

```text
application build
runtime
container digest
critical libraries
SDK versions
schema package versions
evaluator dependencies
```

Security patches may be applied through an expedited path, but a materially changed dependency stack SHOULD trigger compatibility/requalification tests before relying on previous certification.

The goal is not to freeze dependencies indefinitely; it is to know which software produced the evidence.

## 155. Golden Fixture Drift and Retirement

Benchmark fixtures require lifecycle governance.

Each fixture/suite SHOULD have:

```text
owner
created_at
last_reviewed_at
review_due_at
retirement_reason
coverage_tags
```

Retire or revise fixtures when:

- product requirements change;
- capability is removed;
- evaluator contract changes;
- fixture leaks into training/testing workflows in a way that invalidates it;
- fixture is no longer representative.

Historical benchmark results retain their original suite version.

## 156. Bootstrap Policy Contract

A new tenant/task class with insufficient evidence MUST begin from a deterministic, reviewed bootstrap policy.

Bootstrap policy properties:

- conservative branch limits;
- explicit budget ceilings;
- approved capability set;
- existing platform safety/approval constraints;
- no dependence on learned confidence;
- clear transition criteria into learned policy evaluation.

Bootstrap policies are versioned and may differ by task risk class.

Cold start MUST NOT choose a random or self-generated active policy.

## 157. Operational Ownership and RACI

Before production enablement, assign owners for at least:

```text
trace ingestion
replay engine
policy registry
evaluation framework
security/privacy controls
billing integration
Spec 213 adapter
UI/admin
incident response
data retention/deletion
DR/backup
schema governance
```

Every production alert/runbook MUST have an owning team/role.

A component without an operational owner cannot be certified for production.

## 158. Revised Incident Classification

Spec 222 incidents SHOULD be classified so response is proportional.

Suggested classes:

```text
SEV0 cross-tenant/security/unauthorized promotion
SEV1 wrong active policy / uncontrolled spend / widespread failure
SEV2 degraded replay/advice / stale data / bounded canary issue
SEV3 analytics/backfill/optional synthesis issue
```

Incident severity does not replace the platform-wide incident standard; it maps learning-specific symptoms into it.

For SEV0/SEV1, policy influence SHOULD be disabled or narrowed rapidly while preserving authoritative execution through baseline.

## 159. Revision 5 Acceptance Additions

Add the following to acceptance/certification evidence:

- DB/outbox/object publication reconciliation test;
- poison-event/DLQ recovery test;
- retry-storm suppression test;
- quota/rate-limit exhaustion test;
- rollback compatibility test with in-flight stateful work;
- feature-flag invalid-combination test;
- evaluator-disagreement/adjudication test;
- nondeterministic repeatability report;
- cache-isolation test;
- orphaned-policy dependency test;
- configuration migration/rollback test;
- deletion-vs-export race test;
- billing evidence reconstruction test;
- separation-of-duties test for high-risk scope;
- human-review timeout behavior test;
- audit-integrity verification;
- certified dependency baseline capture;
- golden-fixture lifecycle review;
- bootstrap-policy cold-start test;
- operational owner/RACI completion.

## 160. Revision 5 Conclusion

Passes 61–80 found material gaps in distributed correctness and operational governance rather than in the central learning-loop design.

Revision 5 now requires Spec 222 to remain safe when:

- messages are malformed or duplicated;
- downstream publication partially fails;
- providers rate-limit or fail;
- evaluators disagree;
- results are nondeterministic;
- capabilities disappear;
- configuration defaults evolve;
- privacy deletion races with replay/export;
- humans do not respond;
- dependencies change;
- new tenants have no evidence;
- rollback occurs while stateful jobs are running.

The invariant remains:

```text
Learn aggressively offline.
Change production conservatively.
Never infer PASS from missing evidence.
Never allow learning-plane failure to become execution-plane ownership.
```

---

## 161. Value, Cost-Effectiveness, and Application Review

Revision 6 adds the business and operational justification required to decide **where Spec 222 should actually be used**.

Spec 222 MUST NOT be enabled merely because recursive self-improvement is technically interesting.

Every production application requires a documented answer to five questions:

```text
1. Is the task repeated often enough to learn from history?
2. Is exploration materially expensive or slow?
3. Can outcome quality be measured reliably?
4. Can the learned policy influence a bounded decision safely?
5. Does expected value exceed learning-plane overhead?
```

If the answer is not sufficiently positive, the task remains on the existing baseline execution path.

The design goal is not "use learning everywhere."

The goal is:

> apply replay-based exploration optimization only where accumulated history can reduce future waste or improve quality at economically meaningful scale.

## 162. External Evidence and Transferability Boundary

The Dream-RSI research motivating this design reports meaningful efficiency gains in several narrow, executable discovery settings, including algorithm engineering and GPU-kernel optimization. The reported results include fewer discovery calls/compute in some comparisons and improved performance at matched budgets.

These results support the architectural hypothesis that historical discovery traces can have economic value.

They MUST NOT be interpreted as a guaranteed SmartAIHub production ROI.

Reasons include:

- different task distributions;
- different agents/models;
- different evaluators;
- different provider pricing;
- different workflow constraints;
- multi-tenant overhead;
- human approval cost;
- storage/replay/evaluator cost;
- production safety constraints.

Therefore Spec 222 treats external benchmark results as **feasibility evidence**, not as the financial forecast.

SmartAIHub ROI MUST be measured from SmartAIHub telemetry.

## 163. Value Thesis for SmartAIHub

Spec 222 can create value through six primary mechanisms.

### 163.1 Avoid repeated exploration

If many similar tasks repeatedly try the same weak routes, historical evidence can reduce unnecessary branches.

### 163.2 Allocate expensive executors selectively

Claude/Codex/external agents, premium media models, GPU runners, and evaluator calls can be reserved for tasks where their marginal value is supported by evidence.

### 163.3 Stop earlier when sufficient quality is reached

Learned stopping policies can prevent unnecessary second/third/fourth attempts.

### 163.4 Escalate earlier when cheap paths are unlikely to succeed

For difficult task classes, a learned policy can avoid wasting several cheap but ineffective attempts before selecting a stronger executor.

### 163.5 Reuse evaluation evidence

Offline replay can compare exploration strategies without repeating every expensive external execution.

### 163.6 Improve user choice with evidence

Where SmartAIHub offers the user multiple routes, the platform can present evidence-based expected cost/latency/quality while preserving user choice.

## 164. Full Cost Model

The economic model MUST include all costs, not only LLM API usage.

### 164.1 One-time engineering cost

```text
C_engineering =
  contract integration
+ trace normalization
+ replay engine
+ evaluator framework
+ Policy Lab UI
+ security/privacy work
+ certification
+ runbooks/operations
```

### 164.2 Ongoing infrastructure cost

```text
C_infra_month =
  event ingestion
+ PostgreSQL metadata
+ object storage
+ replay compute
+ evaluator compute/API
+ observability
+ backup/DR
+ network/egress
```

### 164.3 Operational cost

```text
C_ops_month =
  incident response
+ policy review
+ benchmark maintenance
+ evaluator calibration
+ security/compliance review
+ human promotion approval
```

### 164.4 Opportunity cost

Engineering and operational resources spent on Spec 222 are resources not spent on other product work.

This cost SHOULD be considered during prioritization even if it is not booked into runtime credits.

### 164.5 Risk cost

Expected risk cost may include:

```text
incorrect policy × blast radius
unexpected spend
user-visible degradation
privacy/security incident
provider policy violation
operator time
```

Hard safety/privacy failures are not converted into an acceptable monetary tradeoff.

## 165. Full Benefit Model

Measure benefits separately instead of collapsing them prematurely.

```text
B_execution_savings
B_evaluator_savings
B_runner/GPU_savings
B_latency_reduction
B_success_rate_gain
B_quality_gain
B_human_time_saved
B_failure/retry_avoidance
B_provider_outage_resilience
B_user_retention/conversion (if later proven)
```

Do not assign revenue value to soft metrics unless the product team has empirical evidence connecting them to revenue or retention.

## 166. ROI and Break-Even Equations

At use-case level:

```text
Monthly Net Value =
    Execution Savings
  + Evaluation Savings
  + Infrastructure Savings
  + Quantified Human-Time Savings
  + Quantified Quality/Success Value
  - Learning Infrastructure Cost
  - Learning Evaluator Cost
  - Operations Cost
```

```text
ROI =
  (Total Measured Benefit - Total Learning Cost)
  / Total Learning Cost
```

Break-even task volume:

```text
N_break_even =
  Fixed monthly learning overhead
  / Expected net saving per eligible task
```

Quality-adjusted cost MAY be used:

```text
Cost per Successful Outcome =
  Total execution + learning cost
  / Number of contract-valid successful outcomes
```

For tasks where quality varies materially:

```text
Cost per Quality-Qualified Outcome =
  Total cost
  / outcomes meeting the configured quality floor
```

The platform SHOULD compare these metrics against the current baseline before enabling broad policy influence.

## 167. Economic Decision Rule

A use case SHOULD proceed from observation to replay only when:

- task repetition is sufficient;
- baseline exploration has measurable waste/variation;
- outcome contract is reliable;
- expected improvement is economically material;
- learning overhead is bounded;
- no simpler deterministic optimization solves the problem better.

A use case SHOULD proceed from shadow to canary only when:

```text
expected_net_value > configured_minimum
AND evidence_validity qualified
AND safety/privacy gates pass
AND no material hard-metric regression
```

Production promotion does not require every dimension to improve.

It does require the declared objective and hard constraints to remain valid.

## 168. "Do Not Use Spec 222" Conditions

Spec 222 is usually NOT cost-effective for:

- one-off tasks;
- very low-volume task classes;
- tasks with negligible execution cost;
- tasks already solved reliably by deterministic rules;
- tasks with no credible outcome evaluator;
- tasks whose environment changes faster than evidence can accumulate;
- tasks where the optimization variable should be a fixed safety/compliance rule;
- tasks where every execution is fundamentally unique and historical routes have little transferable value;
- tasks where human review dominates total cost;
- tasks where replay evidence coverage remains persistently poor.

In these cases use the existing SmartAIHub execution/control architecture directly.

## 169. Use-Case Eligibility Scorecard

Before creating a learned policy, score each candidate use case from 0–3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Repetition | rare | occasional | frequent | very high volume |
| Execution cost | negligible | low | moderate | high |
| Outcome measurability | weak | partial | good | deterministic/strong |
| Exploration variance | none | small | meaningful | large |
| Historical coverage | none | small | usable | rich |
| Safe bounded action | poor | limited | good | excellent |
| Provider/model stability | unstable | variable | acceptable | stable |
| Expected savings | none | small | material | high |

Recommended interpretation:

```text
0–8   → keep deterministic/baseline
9–14  → observation only
15–19 → replay candidate
20–24 → shadow candidate
25+   → strong candidate for controlled canary
```

This score is a prioritization aid, not a production safety gate.

Hard safety/privacy requirements still dominate.

## 170. Application Registration Contract

Every application of Spec 222 MUST be registered as a versioned `learning_use_case`.

Minimum schema:

```yaml
use_case_id:
name:
owner:
tenant_scope:
task_classes:
business_goal:
baseline_policy:
optimization_variables:
hard_constraints:
eligible_executors:
outcome_contract:
evaluators:
cost_model:
expected_value_hypothesis:
required_trace_volume:
minimum_observed_coverage:
counterfactual_limit:
shadow_required:
canary_required:
blast_radius:
rollback_target:
success_kpis:
stop_conditions:
review_due_at:
```

No learned policy enters production without a registered use case.

## 171. Application Catalogue — Priority Tiers

### Tier A — Highest expected value / strongest fit

1. Software-development / Skill-development exploration
2. External harness routing (SmartAIHub vs Claude vs Codex)
3. Workflow/Agent implementation strategy
4. MCP/A2A/fallback route selection
5. Computer-Use execution strategy
6. Expensive media generation/provider retry strategy
7. AI video editing / rough-cut / render strategy

### Tier B — Good fit after sufficient evidence

8. RAG/retrieval strategy
9. Universal Assistant tool-selection strategy
10. Model/provider selection under quality/cost constraints
11. Testing/debugging/review strategy
12. Prompt/parameter strategy for repeated media templates
13. Runner placement for heavy workloads
14. Evaluator selection/ensemble strategy

### Tier C — Limited/conditional

15. Background-job recovery strategy
16. User-facing route recommendation
17. Marketplace/skill discovery ranking experiments
18. Content-production workflow optimization

### Explicitly not self-optimized

- authentication;
- authorization;
- tenant isolation;
- accounting truth;
- safety hard rules;
- approval requirements;
- legal/privacy deletion requirements;
- cryptographic trust;
- authoritative job-state semantics.

These remain deterministic control constraints.

## 172. Application: Software / Skill Development

### Goal

Reduce cost and failed iterations while increasing the probability that a development task reaches verified completion.

### Candidate exploration variables

```text
single vs multi-agent
SmartAIHub-native vs Claude vs Codex
planning depth
TDD-first route
review depth
parallel implementation count
debugger choice
verification sequence
```

### Evidence

- tests passed/failed;
- implementation retries;
- review findings;
- token/API cost;
- execution time;
- user intervention;
- rollback/rework;
- final acceptance.

### Example learned behavior

For a small schema-only Skill change, history may show that:

```text
Plan → implement → targeted tests → review
```

outperforms expensive three-agent parallel exploration.

For a high-complexity cross-spec implementation, history may support:

```text
independent plans
→ two implementations/reviews
→ verifier
→ merge/reconciliation
```

### Value

Potentially high because coding-agent calls are expensive, development tasks repeat, and outcome contracts can include tests/review/verification.

### Guardrails

Spec 221 mandatory engineering gates cannot be optimized away.

## 173. Application: External Harness Routing

Applicable to Spec 200.

### Question

For a task, should execution use:

```text
SmartAIHub internal agent
Claude
Codex
another registered harness
parallel comparison
user choice
```

### Learning variables

- route;
- escalation point;
- number of routes;
- stopping condition;
- fallback order.

### Metrics

```text
verified completion
cost
latency
retry count
human intervention
artifact quality
```

### High-value case

Repeated task families where external harnesses have materially different success/cost profiles.

### Low-value case

Unique tasks with little historical comparability.

### Human agency

If the user selects a route explicitly, that choice wins subject to hard platform constraints.

## 174. Application: Workflow / Agent Builder

Applicable to AI-generated workflows and agent construction.

Spec 222 can learn:

- which workflow decomposition patterns succeed;
- when to use a Skill vs Workflow vs external agent;
- whether sequential or parallel branches are worth the cost;
- when human approval improves final success enough to justify latency.

Evidence can include:

```text
workflow validation
execution success
node/tool failure
cost
latency
manual edits after generation
user acceptance
```

The learned system MUST NOT modify permission boundaries or grant tools that the builder/user is not authorized to use.

## 175. Application: MCP / A2A / Fallback Routing

Applicable to Specs 199 and 206.

Example routing candidates:

```text
native Skill
MCP tool
A2A agent
external harness fallback
computer-use fallback
```

Learnable decisions:

- preferred protocol for a capability class;
- fallback order;
- timeout before fallback;
- whether parallel probing is cost-effective.

Hard constraints:

- protocol security;
- tool authorization;
- capability correctness;
- data residency.

Spec 222 optimizes among already-authorized routes only.

## 176. Application: Computer Use

Computer Use is a strong candidate because route cost and reliability can differ significantly.

Potential route hierarchy:

```text
WebMCP/API
→ accessibility/DOM
→ deterministic executor
→ Jev-like structured interaction
→ vision/LLM computer use
```

Learnable dimensions:

- which route succeeds by site/task class;
- when to escalate;
- how many retries before fallback;
- whether vision is necessary;
- expected latency/cost.

Evidence:

- action success;
- post-condition verification;
- number of UI actions;
- recovery count;
- computer-use model cost;
- user intervention.

Hard rule:

Spec 222 MUST NOT learn to bypass confirmation/approval requirements for consequential UI actions.

## 177. Application: Media Generation

Applies to image/video/audio generation.

### Learnable decisions

```text
provider/model
quality tier
resolution
generation count
retry strategy
reference-image strategy
prompt template
upscale/post-process choice
```

### Evidence

- user-selected result;
- QC score;
- generation failures;
- cost;
- latency;
- regeneration count;
- provider availability.

### Economic value

Potentially high for video because each branch can be materially expensive.

### Important limitation

Subjective aesthetics require careful evaluator governance.

User preference should carry more weight than generic automated scoring where appropriate.

## 178. Application: AI Video Editor / Rough Cut

Applicable to the SmartAIHub video-editing architecture.

Spec 222 may learn exploration strategy for:

- transcript cleanup;
- semantic cut candidates;
- B-roll selection strategy;
- reframing;
- render preset;
- AI Director alternatives;
- quality verification sequence.

The system can compare:

```text
cheap analysis only
vs
analysis + semantic scorer
vs
analysis + external harness editorial plan
```

Outcome evidence may include:

- user-accepted EDL;
- number of manual edits after AI rough cut;
- render retries;
- QC failures;
- processing cost/time.

Heavy rendering remains the responsibility of Runner/Worker infrastructure, not Spec 222.

## 179. Application: RAG / Help / Retrieval

Spec 222 can optimize bounded retrieval strategy, not factual truth itself.

Learnable dimensions:

```text
keyword/vector/hybrid ratio
top-k
reranking use
Help docs vs Library vs other allowed sources
second retrieval pass
query reformulation
```

Metrics:

- grounded-answer rate;
- citation correctness;
- retrieval latency;
- token cost;
- user correction;
- fallback rate.

Hard constraints:

- source permissions;
- tenant isolation;
- no unauthorized source expansion.

## 180. Application: Universal Assistant Tool Selection

The Universal Assistant can use learned policies to decide whether a request is best served by:

```text
direct answer
Help/RAG
Skill
Workflow
MCP
A2A
external agent
Computer Use
```

Spec 222 can optimize:

- route order;
- escalation;
- parallelism;
- stop conditions.

It MUST NOT infer new authorization from historical success.

The capability resolver still provides the eligible set.

## 181. Application: Provider / Model Selection

This is valuable when several providers satisfy the same functional contract.

Policy can optimize among eligible providers using:

```text
quality
cost
latency
rate-limit health
historical task success
regional eligibility
```

Potential examples include LLM, image, video, speech, or evaluator providers.

Important:

- provider routing is constrained by user/tenant policy;
- learned policy must not override explicitly selected provider where product behavior promises that choice;
- model drift triggers requalification.

## 182. Application: Testing, Debugging, and Review Strategy

Spec 222 can learn which engineering verification pattern is cost-effective for a task class.

Examples:

```text
unit tests only
unit + integration
unit + integration + E2E
single reviewer
independent reviewer
static analysis + reviewer
```

Hard constraints from Spec 221 remain mandatory.

The learning system chooses only among allowed verification strategies; it cannot remove required tests/reviews.

Useful metric:

```text
post-merge defect rate
verification cost
time to verified completion
reopened issue rate
```

## 183. Application: Runner Placement / Heavy Compute

Spec 222 MAY advise among eligible execution locations:

```text
Windows Runner
Mac Runner
Linux Runner
Cloudflare/container
other registered compute
```

Learnable factors:

- queue wait;
- capability;
- historical reliability;
- compute cost;
- transfer cost;
- runtime.

This application is advisory only.

Actual lease, capacity, job ownership, and dispatch remain under existing worker/job infrastructure.

## 184. Application: Background Job Recovery

This is a constrained Tier C use case.

Spec 222 MAY learn advisory recovery strategy:

```text
retry same worker
wait
move to alternate runner
recreate external call if idempotent
escalate to operator
```

But it MUST NOT learn or alter:

- job state-machine invariants;
- lease correctness;
- idempotency semantics;
- accounting semantics.

Those remain deterministic reliability engineering.

## 185. Application: User-Facing Route Recommendation

Where the UI offers several valid routes, Spec 222 can display evidence such as:

```text
historical success range
estimated cost
estimated latency
confidence
```

Example:

```text
SmartAIHub internal
Claude
Codex
Multi-path comparison
```

The recommendation must remain informational when the product intends user choice.

Do not use manipulative defaults designed merely to maximize platform margin.

## 186. Application: Marketplace / Skill Discovery

Potential future application:

- choose among multiple Skills satisfying the same declared capability;
- learn which Skill works for a task class;
- estimate expected cost/quality/latency.

Requirements:

- marketplace ranking/revenue incentives MUST NOT be silently mixed with technical quality optimization;
- sponsored/commercial preferences, if ever introduced, must be explicitly separated;
- tenant-installed/authorized Skills only;
- revenue-share logic remains outside Spec 222.

This is NOT an initial rollout priority.

## 187. Application: Repeated Content Production

Examples:

- 9-shot storyboard generation;
- vertical drama planning;
- product-review storyboard templates;
- subtitle/cut workflows;
- recurring social-content production.

Spec 222 may learn:

- which planning/template route requires fewer manual revisions;
- how much branching is worthwhile;
- which media provider combination is cost-effective.

Subjective creative direction remains user-controlled.

Aesthetic diversity SHOULD NOT be optimized away purely for historical acceptance averages.

## 188. Application: Evaluator Selection

Spec 222 can itself reduce evaluation cost by choosing among pre-approved evaluators.

Example:

```text
deterministic checks first
→ cheap model judge
→ expensive judge only on ambiguity
→ human review on high-risk disagreement
```

This can be valuable because evaluation can become a major fraction of total learning cost.

Meta-evaluation MUST obey the evaluator-independence controls in Section 65.

An evaluator policy cannot certify itself without independent evidence.

## 189. Application Pattern — Cheap First, Escalate on Evidence

A default high-value policy family for SmartAIHub is:

```text
low-cost deterministic/internal path
      ↓ if insufficient
stronger internal/LLM path
      ↓ if still uncertain
external harness
      ↓ if branches disagree/high impact
independent verifier/human
```

Spec 222 learns the escalation thresholds and which stages are unnecessary for a specific task class.

It does NOT make every task use every stage.

## 190. Application Pattern — Parallel Only When Marginal Value Justifies It

Parallel exploration SHOULD be treated as an economic decision.

For candidate branch `b`:

```text
Expected Marginal Value(b)
>
Expected Marginal Cost(b)
```

Marginal value may include:

- probability of recovering from baseline failure;
- expected quality gain;
- avoided future rework.

A second agent with highly correlated behavior may have low marginal value even if individually strong.

## 191. Application Pattern — Learned Stop Conditions

Potential stop signals:

```text
outcome contract satisfied
quality threshold met
independent verifier agrees
additional branch marginal value below threshold
budget threshold reached
latency/SLA threshold reached
user selects result
```

Stopping early is one of the most direct ways Spec 222 can save cost.

A stop policy cannot terminate before mandatory safety/verification requirements.

## 192. Credit and Revenue Accounting Implications

Spec 222 changes how often providers/Skills may be called, but it does not own credits or revenue sharing.

Each execution attempt continues through the existing accounting/gateway path.

The cost model SHOULD expose separately:

```text
user-billed execution cost
platform-paid learning overhead
tenant-paid learning overhead if configured
experimental subsidy
evaluator cost
```

Initial recommendation:

- do NOT bill end users for invisible offline replay using historical traces unless product terms explicitly define such billing;
- live branches that perform user work follow existing credit rules;
- platform learning overhead should initially be measured separately to establish economics.

If later a tenant opts into advanced optimization as a paid feature, billing behavior requires its own explicit product specification.

## 193. Value Attribution Rules

Do not claim savings simply because a learned policy is cheaper.

A valid saving requires a baseline comparison adjusted for outcome quality.

Example invalid claim:

```text
Challenger costs 40% less
```

if it also produces substantially fewer valid completions.

Preferred metrics:

```text
cost per valid completion
cost per quality-qualified completion
time per valid completion
human minutes per valid completion
```

Quality gains should be reported separately unless monetization has been empirically established.

## 194. KPI Set for Spec 222

### Economic KPIs

```text
cost_per_valid_outcome
cost_per_quality_qualified_outcome
net_savings_per_eligible_task
monthly_net_value
learning_overhead_ratio
evaluator_cost_ratio
break_even_volume
```

### Product/quality KPIs

```text
verified_success_rate
user_acceptance_rate
manual_rework_rate
retry_rate
fallback_rate
```

### Performance KPIs

```text
p50/p95 completion latency
branch_count
external_call_count
runner_minutes
```

### Learning quality KPIs

```text
observed_coverage
counterfactual_fraction
shadow_divergence
policy_regression_rate
policy_rollback_rate
requalification_frequency
```

## 195. Learning Overhead Ratio

Define:

```text
Learning Overhead Ratio =
  Total Spec 222 runtime/evaluation/ops cost
  / Baseline task-execution cost for eligible workload
```

A use case with a high overhead ratio and weak measured benefit SHOULD be disabled or returned to observation-only mode.

Thresholds are use-case specific and MUST be based on real measurements.

## 196. Application Value Dashboard

Admin UI SHOULD add an explicit **Value** view.

Per use case show:

```text
eligible tasks
baseline cost
active-policy cost
quality-adjusted cost
learning overhead
estimated/measured savings
success delta
latency delta
confidence
current rollout state
```

Use visual labels:

```text
Value proven
Promising / insufficient evidence
Neutral
Negative value
Blocked by quality/safety
```

These labels must be based on configured objective evidence, not marketing text.

## 197. Use-Case Detail Page

Each registered application gets a page containing:

1. Business goal
2. Why learning is needed
3. Existing deterministic alternative
4. Optimization variables
5. Hard constraints
6. Baseline
7. Current policy
8. Eligible executors/providers
9. Dataset/evidence coverage
10. Replay result
11. Shadow result
12. Canary result
13. Cost model
14. KPI history
15. Known risks
16. Current owner
17. Review/expiry date
18. Rollback target
19. Decision log
20. "Disable learning for this use case" control

This makes application intent auditable and prevents generic policies from spreading without explicit ownership.

## 198. Use-Case Promotion Decision

A use case is promoted, not merely a policy.

Before enabling learned influence, certify both:

```text
USE CASE ELIGIBILITY
AND
POLICY QUALIFICATION
```

A technically strong policy MUST NOT activate for a task domain whose economics or evaluator quality make learning inappropriate.

## 199. Initial SmartAIHub Rollout Priorities

Recommended order based on expected value and current architecture:

### Wave 1 — Observation and replay

```text
1. Skill/software development
2. External harness routing
3. MCP/A2A route outcomes
4. Computer Use route outcomes
```

Why:

- structured outcomes;
- high execution cost;
- substantial route variation;
- existing orchestration/runner evidence.

### Wave 2 — Expensive generation workloads

```text
5. Video generation/provider strategy
6. AI video editing/rough-cut strategy
7. Image/audio provider strategy
```

Why:

- strong cost-saving potential;
- repeated retries are expensive.

But subjective QC requires stronger evaluator/user-feedback design.

### Wave 3 — High-volume assistant/retrieval

```text
8. Universal Assistant tool selection
9. RAG/retrieval policy
10. model/provider selection
```

Why:

- high volume may create strong aggregate value;
- per-task savings can be small but cumulative.

### Wave 4 — Experimental/marketplace optimization

```text
11. Skill marketplace discovery
12. content-production workflow optimization
13. advanced evaluator routing
```

These require more product/business-policy design and should not block core Spec 222.

## 200. Minimum Viable Economic Proof

Before Wave 1 advances to broad canary, require at least one use case to demonstrate:

```text
A. measurable baseline waste or quality variance
B. replayable evidence with sufficient observed coverage
C. shadow policy with no hard-metric regression
D. quantified expected saving or quality gain
E. learning overhead measured
F. rollback/kill-switch proven
```

If no initial use case can demonstrate economic benefit, Spec 222 SHOULD remain observation/research infrastructure rather than becoming production-routing infrastructure.

## 201. 30/60/90-Day Value Review After First Canary

For each first production use case:

### First review window

Focus on correctness:

- attribution;
- cost reconciliation;
- evaluator reliability;
- unexpected regressions.

### Second review window

Focus on economics:

- net savings;
- overhead ratio;
- branch reduction;
- latency;
- user rework.

### Third review window

Decide:

```text
expand
hold
retrain/requalify policy
reduce scope
return to shadow
disable use case
```

Do not preserve an unprofitable use case merely because significant engineering effort was already invested.

## 202. Application Governance

Each learning application has:

```text
product owner
technical owner
risk tier
data owner
evaluator owner
operational owner
```

The product owner is responsible for explaining why the use case deserves optimization.

The technical owner is responsible for contract correctness.

The evaluator owner is responsible for outcome validity.

The operational owner is responsible for production health.

High-risk applications additionally require the approval chain defined elsewhere in this spec.

## 203. Strategic Value Beyond Immediate Cost Savings

Spec 222 may create platform value that is not fully captured by direct API savings:

- reusable execution evidence;
- measurable comparison between harnesses/providers;
- reduced vendor lock-in through empirical route selection;
- faster adoption of new models/providers;
- data-driven retirement of weak execution routes;
- better capacity planning;
- clearer product economics per task class.

These benefits SHOULD be tracked, but they MUST NOT be used to hide negative direct economics indefinitely.

## 204. Why This Is Particularly Relevant to SmartAIHub

SmartAIHub is unusually suitable for this architecture because it can observe multiple interchangeable execution mechanisms behind one platform boundary:

```text
Skills
Workflows
Internal agents
MCP
A2A
External harnesses
Computer Use
Runner/Worker
Media providers
```

This creates exactly the kind of repeated route-selection and exploration history from which replay-based policy learning can derive value.

However, the same breadth increases governance risk.

Therefore the strongest business case exists only if Spec 222 remains an advisory/learning plane rather than becoming a universal autonomous controller.

## 205. Final Cost-Effectiveness Decision

The business conclusion of this specification is:

### Spec 222 is likely worth implementing as infrastructure when

- SmartAIHub has repeated, expensive, multi-route tasks;
- execution history can be normalized;
- outcomes can be evaluated credibly;
- offline replay can replace some live exploration;
- rollout is incremental and learning influence remains bounded.

### Spec 222 is not worth using indiscriminately

It SHOULD NOT become a mandatory layer for every SmartAIHub request.

The optimal architecture is:

```text
Most simple/cheap/deterministic tasks
        → existing direct execution

Repeated/high-cost/variable tasks
        → Spec 222 observation/replay

Only economically proven + qualified use cases
        → shadow/canary/active learned policy
```

This selective application is essential to keeping the learning system economically positive.

## 206. Revision 6 Acceptance Additions

A production implementation is incomplete unless it includes:

- use-case registration;
- explicit business goal;
- baseline economics;
- full cost accounting for learning overhead;
- benefit attribution;
- eligibility scorecard;
- "do not use" criteria;
- per-use-case KPI dashboard;
- measured net-value review;
- route/application-specific hard constraints;
- disable control per use case;
- economic proof before broad rollout.

## 207. Revision 6 Conclusion

Revision 6 converts Spec 222 from a technically production-hardened learning architecture into a **selectively deployable product/economic architecture**.

The core decision is no longer:

```text
"Can SmartAIHub learn a better exploration policy?"
```

It is:

```text
"Can SmartAIHub learn a better policy
for this specific repeated task class,
with trustworthy evidence,
at lower quality-adjusted cost
than the current baseline,
without weakening hard constraints?"
```

Only when that question is supported by evidence should Spec 222 influence production.

---

## 208. Capability-Completeness Audit (Passes 81–92)

After the value/application review, Spec 222 was audited again to determine whether it is merely safe and economical, or functionally complete enough to become a real self-improving exploration platform.

| Pass | Capability lens | Gap found | Added capability |
|---:|---|---|---|
| 81 | Candidate creation | Could evaluate challengers but lacked a complete native way to generate them | Candidate Policy Factory |
| 82 | Search strategy | Candidate generation could become random/manual | Bounded Policy Search Space + optimizer interface |
| 83 | Information acquisition | Learned passively from whatever happened | Active Learning / Value-of-Information planner |
| 84 | Causal validity | Replay support existed but causal comparison remained limited | Treatment/propensity/outcome evidence model |
| 85 | Uncertainty | No unified calibrated uncertainty contract | Uncertainty & OOD framework |
| 86 | Hierarchical learning | Per-task policies could relearn from zero | Hierarchical inheritance / safe transfer |
| 87 | Multi-objective decisions | Pareto view existed but no constrained resolver | Constraint-first multi-objective optimizer |
| 88 | Scenario planning | No first-class operator what-if simulation | Scenario/What-if Lab |
| 89 | Human preference | Override existed but no safe preference layer | Preference profile / opt-in personalization |
| 90 | Exploration collapse | Optimization could converge too narrowly | Diversity/novelty preservation |
| 91 | Meta-evaluation | Evaluator quality lacked a continuous scorecard | Evaluator Performance Registry |
| 92 | Maturity control | Advanced capabilities could be enabled inconsistently | Capability maturity model |

All corrections below are normative additions.

## 209. Native Candidate Policy Factory

Spec 222 MUST support a provider-neutral way to create candidate policies without requiring arbitrary executable code.

Candidate sources include `human-authored`, `template-derived`, `parameter mutation`, `rule recombination`, `historical-success extraction`, `LLM/agent proposed`, `imported`, and `Dream-RSI adapter`.

Every candidate begins in `draft`. The factory validates schema, declares parent/baseline, changed dimensions, generation/provenance, worst-case cost, dependencies, and blast radius; rejects unauthorized capabilities; enforces platform ceilings; and never self-promotes.

Configuration-based candidates are preferred over arbitrary code.

## 210. Bounded Policy Search Space

Each registered use case MUST explicitly define which policy dimensions may vary.

```yaml
search_space:
  max_branches: [1, 2, 3]
  parallelism: [sequential, parallel]
  retry_limit: [0, 1, 2]
  stop_quality_threshold: [0.80, 0.90, 0.95]
```

Hard constraints are never optimization variables. Search spaces are typed, bounded, versioned, cost-capped, and may declare prohibited combinations. An optimizer MUST NOT invent undeclared dimensions.

## 211. Policy Optimizer Interface

Add:

```text
PolicyOptimizer
  propose_candidates()
  rank_for_replay()
  update_from_results()
  estimate_uncertainty()
```

Optimizer families MAY include bounded grid/random search, Bayesian optimization, evolutionary search, contextual-bandit proposal, LLM-guided proposal, and Dream-RSI-inspired search.

No optimizer is globally privileged. Optimizer/version is recorded; it proposes candidates but promotion gates remain authoritative.

## 212. Active Learning and Value-of-Information Planner

Spec 222 SHOULD support an Active Learning Planner that asks which next bounded evidence-gathering action reduces decision uncertainty most per cost and risk.

```text
ValueOfInformation(e)
=
Expected Decision Improvement
× Uncertainty Reduction
- Experiment Cost
- Risk Penalty
```

It MAY recommend additional shadow traces, one bounded canary cohort, evidence for an under-sampled executor, human labeling on ambiguous samples, rerunning a stale benchmark, or stopping evidence collection when marginal value is low.

It MUST NOT autonomously launch live experiments outside existing canary/approval controls.

## 213. Evidence Treatment Model for Causal Comparison

Promotion-grade comparisons SHOULD model execution choice as an explicit treatment:

```text
context_features
eligible_actions
selected_action
selection_policy
propensity_if_known
observed_outcome
censoring_status
confounder_flags
```

Reports MUST distinguish descriptive correlation, controlled experiment evidence, off-policy estimates, and causal estimates with explicit assumptions. Correlation MUST NOT be presented as causation.

## 214. Unified Uncertainty Contract

Major learned outputs SHOULD expose uncertainty for expected success, cost, latency, policy ranking, evaluator judgment, provider suitability, and transferability.

Suggested fields:

```text
estimate
confidence
uncertainty_type
support_level
```

Uncertainty types include data sparsity, model variance, distribution shift, evaluator disagreement, and counterfactual dependence.

Low confidence can trigger fallback, user choice, more evidence, shadow-only behavior, or no recommendation.

## 215. Out-of-Distribution Detection

A policy MUST NOT assume every task is familiar.

OOD signals MAY include unseen task features, new capability combinations, novel artifact types, new provider/tool versions, unusual cost/latency, low similarity to qualified evidence, and evaluator uncertainty spikes.

```text
in-distribution → learned policy
uncertain       → conservative/shadow/user choice
strong OOD      → bootstrap baseline + collect evidence
```

OOD logic is versioned and advisory.

## 216. Hierarchical Policy Inheritance

Support:

```text
platform baseline
→ domain policy
→ task-family policy
→ task-class policy
→ tenant override
→ use-case policy
```

Children may inherit safe defaults, approved executors, evaluator sets, priors, and search-space bounds, but never permissions they do not independently possess.

Inherited evidence is labeled `transferred/prior`, not local observed evidence.

## 217. Safe Transfer Learning

Transfer assessment SHOULD consider input similarity, outcome-contract compatibility, executor overlap, evaluator compatibility, cost structure, and failure-mode similarity.

Transferred evidence can accelerate cold start but has lower trust than local observed evidence until validated. Cross-tenant transfer remains prohibited absent a separate privacy-preserving design.

## 218. Constraint-First Multi-Objective Resolver

Policy selection follows:

```text
1. hard constraints
2. minimum quality/success floors
3. remove dominated candidates
4. optimize declared soft objectives
5. expose unresolved trade-offs
```

Soft objectives MAY include cost, latency, quality, human effort, provider concentration, and compute.

Supported methods include weighted preference, lexicographic ordering, Pareto frontier, and budget-constrained optimization. The chosen method is part of the versioned use case.

## 219. Scenario / What-If Lab

Policy Lab SHOULD provide non-production scenario analysis:

```text
What if provider price rises 30%?
What if an executor is unavailable?
What if max cost drops?
What if p95 latency must be below Y?
What if task mix shifts?
What if a provider becomes regionally prohibited?
```

Outputs include predicted route mix, cost, success/quality impact, capacity impact, uncertainty, and unsupported assumptions. Scenario results never mutate active policy and are not promotion evidence by themselves.

## 220. Optional User Preference Learning

For non-sensitive soft preferences, Spec 222 MAY support opt-in profiles such as speed-vs-quality, lower cost, preferred eligible provider, fewer branches, or more manual confirmation.

Preference profiles MUST be scoped, editable/resettable, never infer authorization, never override hard constraints, and distinguish explicit preferences from behavioral inference.

Behavioral preference inference is disabled by default unless separately designed and approved.

## 221. Preference-Aware Policy Resolution

When enabled:

```text
platform constraints
> tenant constraints
> explicit user constraints/preferences
> learned task policy
```

Preferences may alter soft-objective weights but cannot expand capability access.

## 222. Exploration Diversity and Anti-Mode-Collapse

Measure route concentration, provider concentration, branch diversity, strategy diversity, and novel-route coverage.

For creative/discovery-heavy tasks, a policy MAY reserve bounded diversity to reduce vendor lock-in, blind spots, aesthetic homogenization, and self-reinforcing certainty.

Diversity floors remain below budget/safety ceilings.

## 223. Novelty Budget

A use case MAY define a bounded novelty budget, e.g.:

```text
95% exploitation
5% approved under-sampled exploration
```

Only when risk tier, cost, user/tenant policy, experiment attribution, and safety constraints permit it. Novelty budget defaults to zero for high-risk tasks.

## 224. Evaluator Performance Registry

Track evaluator/version quality:

```text
agreement_with_human
false_positive_rate
false_negative_rate
calibration
cost
latency
failure_rate
domain_coverage
drift
```

Evaluators may be restricted, shadow-only, recalibration-required, or retired. Policies relying heavily on degraded evaluators can be requalified.

## 225. Evaluator Calibration Sets

Maintain curated calibration samples with clear pass, clear fail, edge, adversarial, and ambiguous cases. Evaluator version changes require calibration before promotion-grade use in a domain.

## 226. Policy Compiler and Static Validator

Every candidate passes a deterministic compiler/validator checking schema, unknown/forbidden capabilities, contradictory constraints, unbounded recursion/branching, missing fallback/budget, invalid evaluators, region/provider incompatibility, and state-transition validity.

Compiler output:

```text
compiled_policy_artifact
validation_report
policy_checksum
dependency_graph
```

Only compiled artifacts may enter replay/promotion.

## 227. Policy Linter

Warn on unnecessarily large search space, redundant/correlated branches, expensive evaluator chains, weak outcome coverage, stale dependencies, broad blast radius, weak fallback, and excessive policy complexity.

Warnings become blocking only when configured as hard rules.

## 228. Policy Complexity Budget

Track number of rules, branches, conditions, dependencies, and evaluator stages. A use case MAY define a complexity ceiling. If two policies perform similarly, prefer the simpler policy unless evidence justifies added complexity.

## 229. Meta-Policy for Learning Mode

Add a bounded `LearningModeResolver`:

```text
deterministic baseline
replay-only
replay + shadow
controlled bandit
active learning
candidate search
human-guided optimization
```

It considers task volume, risk, evaluator strength, action count, evidence coverage, non-stationarity, and economic value, but cannot enable a mode above the use case's permitted maturity.

## 230. Optional Contextual Bandit Mode

For safe, high-volume, low-blast-radius routing, Spec 222 MAY support contextual bandits, e.g. equivalent low-risk providers, retrieval strategies, or cheap evaluator routes.

Requirements: explicit approval, bounded actions, propensity logging, regret monitoring, exploration floor/ceiling, cost/safety constraints, immediate kill switch. It is not required for initial production and is disabled by default for high-risk actions.

## 231. Regret Monitoring

Adaptive policies SHOULD track excess cost, missed success, excess latency, and quality delta against the best known qualified alternative. Persistent negative performance triggers reduced exploration, requalification, or rollback.

## 232. Policy Knowledge Base

Maintain structured operational knowledge containing use cases, policy versions, evaluation outcomes, failure patterns, drift events, promotion/rollback decisions, and operational lessons.

This is not chain-of-thought and remains subject to tenant/data isolation.

## 233. Failure Pattern Library

Normalize failure modes such as:

```text
provider_timeout
runner_unavailable
tool_permission_denied
schema_invalid
verification_failed
budget_exhausted
rate_limited
context_overflow
artifact_corrupt
human_rejected
```

Taxonomy is versioned and extensible. Policies may use it for fallback/escalation decisions.

## 234. Capability Effectiveness Matrix

Maintain empirical effectiveness by task class:

| Capability/Executor | Success | Quality | Cost | Latency | Evidence | Confidence |
|---|---:|---:|---:|---:|---:|---:|

The matrix informs users/operators, candidate generation, route retirement, and capacity planning, but is never generalized outside its evidence scope.

## 235. Provider Concentration Risk

Track share of tasks, spend, critical task classes, and fallback readiness per provider. Tenant/platform policy MAY set provider-concentration ceilings for resilience.

## 236. Model / Provider Introduction Workflow

New capability workflow:

```text
register
→ compatibility tests
→ benchmark/calibration
→ observation/shadow
→ bounded canary
→ eligible for learned routing
```

New availability alone does not authorize learned production routing.

## 237. Autonomous Candidate Proposal Boundary

Spec 222 MAY autonomously propose draft candidates. It MUST NOT autonomously expand authorization, alter safety rules, change accounting/tenant isolation/approval semantics, promote itself, or deploy arbitrary product code.

## 238. Integration SDK

Provide internal helpers:

```text
record_execution_context()
record_branch()
record_attempt()
record_outcome()
request_policy_advice()
echo_decision_id()
record_user_override()
record_cancellation()
```

The SDK wraps versioned API/event contracts and never exposes internal DB tables.

## 239. Policy Evaluation SDK

Provide reusable helpers for `register_outcome_contract`, `register_evaluator`, `run_replay`, `compare_policies`, and `emit_evaluation_metric` so software, media, RAG, and Computer Use can add domain-specific evaluation consistently.

## 240. CLI / Administrative Automation

Authorized operators SHOULD have scriptable operations for listing use cases, freezing datasets, running replay, comparing policies, starting shadow/canary, validating policy, rollback/quarantine, and exporting evidence bundles.

CLI/API uses the same authorization/audit path as UI.

## 241. Capability Maturity Levels

Each use case/capability has a maximum maturity:

```text
L0 Disabled
L1 Observe
L2 Analyze/Replay
L3 Recommend/Shadow
L4 Controlled Canary
L5 Active Learned Policy
L6 Adaptive Online Learning
```

A use case cannot skip levels. L6 is optional and never required for Spec 222 success.

## 242. Capability Matrix by Use Case

Example maximum levels:

| Capability | Max level |
|---|---:|
| Software development routing | L5 |
| Computer Use route selection | L5 |
| Media provider routing | L5 |
| RAG strategy | L6 possible |
| Low-risk evaluator routing | L6 possible |
| Authentication/security policy | L0 |
| Accounting truth | L0 |

## 243. Product-Level "Why This Decision?" Surface

Where user-facing, show structured reasons such as compatible task, cost limit, historical evidence, current availability, and fallback. If evidence is weak, explicitly say the baseline is being used due to limited evidence.

No hidden chain-of-thought is exposed.

## 244. Product-Level "Use Another Route" Control

Where user choice is intended, allow another eligible route and show expected cost, latency, confidence, and constraints. The override is recorded and excluded from misleading autonomous-policy attribution.

## 245. Learning-System Self-Health Scorecard

Admin UI SHOULD show separate dimensions for data freshness, trace completeness, evaluator health, replay backlog, policy compatibility, drift, budget health, provider availability, and audit integrity.

Do not collapse hard failures into one opaque aggregate score.

## 246. Self-Improvement Stop Conditions

Pause candidate generation/evaluation when marginal improvement is repeatedly below threshold, uncertainty cannot be reduced economically, data quality is insufficient, evaluator calibration fails, major drift is active, budget is exhausted, operators freeze learning, or an incident is active.

## 247. Diminishing-Returns Detection

Per generation track quality gain, cost saving, latency gain, human-effort gain, and search cost.

If marginal benefit remains below marginal search cost for a configured number of generations, mark the use case `stable_policy` and switch to periodic monitoring.

## 248. Relearning Trigger

A stable policy resumes learning after material task drift, provider/model change, price change, new capability, quality regression, user preference shift, repeated fallback, or scheduled requalification.

Record:

```text
learning_reopened
reason
prior_policy
trigger_evidence
```

## 249. Complete Self-Improvement Loop

```text
REGISTER USE CASE
→ OBSERVE
→ NORMALIZE / REDACT
→ BUILD EVIDENCE + DISCOVERY GRAPH
→ FREEZE DATASET
→ ASSESS SUPPORT / UNCERTAINTY / OOD
→ GENERATE BOUNDED CANDIDATES
→ COMPILE + VALIDATE + LINT
→ REPLAY / BENCHMARK / SCENARIO
→ MULTI-OBJECTIVE EVALUATION
→ ACTIVE-LEARNING DECISION
→ SHADOW
→ CANARY
→ PROMOTE / REJECT / HOLD
→ MONITOR VALUE + DRIFT + REGRET
→ STABLE POLICY
→ REOPEN LEARNING ONLY WHEN TRIGGERED
```

This is the target end-state architecture.

## 250. Capability Completeness Checklist

A full-capability use case considers:

### Evidence
normalized traces, lineage, trust, purpose, eligibility, causal/support metadata.

### Learning
candidate factory, bounded search, optimizer, uncertainty/OOD, active learning, safe transfer/inheritance.

### Evaluation
deterministic tests, evaluator registry/calibration, replay, benchmark, multi-objective resolution, what-if analysis.

### Deployment
shadow, canary, activation epoch, rollback, blast-radius controls, maturity cap.

### Economics
full cost, net value, overhead ratio, diminishing returns.

### Product
explanation, user override where appropriate, value dashboard.

### Operations
health, drift, regret, requalification, stop/reopen learning.

Not every use case needs every advanced capability; omissions MUST be intentional and documented.

## 251. Revision 7 Acceptance Additions

Where enabled, certification adds evidence for candidate provenance, bounded-search validation, optimizer versioning, active-learning audits, causal/support classification, uncertainty/OOD behavior, transfer qualification, multi-objective resolution, scenario isolation, preference/authorization separation, anti-mode-collapse metrics, evaluator calibration, compiler/linter proof, complexity ceilings, L6 bandit safety if used, maturity enforcement, diminishing-return stopping, relearning triggers, and SDK contract tests.

## 252. Revision 7 Conclusion

Revision 7 closes the main functional gap between a policy-evaluation system and a genuinely self-improving exploration platform.

Spec 222 can now define how to generate bounded challengers, choose what evidence to collect next, quantify uncertainty, detect unfamiliar tasks, transfer knowledge safely, resolve trade-offs, simulate scenarios, preserve diversity, evaluate evaluators, stop when optimization is no longer worth its cost, and reopen learning when the environment changes.

> **Self-improvement must be bounded by explicit search spaces, explicit evidence quality, explicit economics, explicit uncertainty, explicit maturity levels, and reversible human-governed promotion.**

---

## 253. Fifth Completeness Audit (Passes 93–104)

After Revision 7, a further 12-pass audit was performed against failure modes that commonly make adaptive systems look successful in offline evaluation but fail under real production composition.

| Pass | Lens | Gap found | Added requirement |
|---:|---|---|---|
| 93 | Benchmark leakage | Candidate generation could overfit replay/benchmark data | Sealed holdout and contamination controls |
| 94 | Sequential testing | Repeatedly checking experiments could inflate false wins | Sequential-analysis and multiplicity controls |
| 95 | Delayed outcomes | Immediate success can hide later defects/rework | Delayed outcome and attribution windows |
| 96 | Policy composition | Several locally-good policies can conflict in one execution | Policy Interaction Graph |
| 97 | Global optimization | Local cost/latency gains can reduce end-to-end utility | End-to-end utility budget and episode evaluation |
| 98 | Silent provider drift | Black-box providers may change without version identifiers | Behavioral fingerprints and requalification triggers |
| 99 | Feedback manipulation | User/agent feedback can be gamed or spammed | Feedback trust and anti-gaming controls |
| 100 | Feature governance | Learned context features lacked explicit provenance/minimization | Feature Registry and data-minimization contract |
| 101 | Cohort robustness | Aggregate gains can hide severe degradation for operational subgroups | Cohort robustness monitoring |
| 102 | Graceful degradation | Baseline fallback was defined, but degradation stages were coarse | Degradation profiles and service modes |
| 103 | Policy retirement | Retired policies/evaluators may still be needed for historical reproducibility | Retirement tombstones and archival compatibility |
| 104 | Upstream adapter conformance | Future Dream-RSI adapter could alter semantics accidentally | Provider conformance suite and equivalence boundary |

The following sections are normative additions.

## 254. Sealed Holdout and Benchmark Contamination Control

Replay, benchmark, and candidate-generation evidence MUST be separated sufficiently to detect overfitting.

A use case MAY define:

```text
training/discovery evidence
development/tuning evidence
sealed holdout evidence
production shadow/canary evidence
```

Rules:

- candidate-generating systems MUST NOT receive sealed holdout labels/results;
- holdout access is restricted and audited;
- repeated use of the same holdout reduces its validity and triggers rotation;
- benchmark fixture IDs and hashes are tracked to detect accidental reuse;
- generated candidates that explicitly encode known benchmark answers are rejected where detectable;
- benchmark leakage incidents invalidate affected comparison evidence.

The purpose is not to recreate academic ML training splits rigidly for every use case. The purpose is to preserve at least one independent source of evidence when optimization intensity is high.

## 255. Experiment Peeking and Multiple-Comparison Controls

If many candidates are tested repeatedly, a false winner can emerge by chance.

Experiment metadata MUST include:

```text
candidate_count
comparison_family_id
planned_metrics
primary_metric
guardrail_metrics
analysis_method
stopping_rule
```

Promotion-grade analysis SHOULD use an approach appropriate to the experiment design, such as:

- predeclared fixed-horizon analysis;
- sequential testing with valid stopping rules;
- false-discovery/multiple-comparison correction where many candidates are compared;
- Bayesian decision rules with declared priors/thresholds.

Operators MUST NOT repeatedly inspect noisy results and promote whichever candidate temporarily looks best without an explicit analysis rule.

## 256. Delayed Outcome and Attribution Windows

Some outcomes appear only after the execution is initially marked successful.

Examples:

- post-merge defects;
- later user rework;
- render/artifact rejection;
- production rollback;
- downstream workflow failure;
- support ticket/user correction.

Task classes SHOULD define:

```text
immediate_outcome_window
delayed_outcome_window
finalization_delay
late_failure_types
```

A trace MAY move through:

```text
provisionally_successful
→ finalized_success
or
→ late_failure
```

Promotion-grade evaluation for such task classes SHOULD wait for the configured finalization window or explicitly report incomplete delayed-outcome coverage.

## 257. Episode-Level Policy Attribution

One execution may contain multiple Spec 222 decisions.

Define an `episode_id` grouping all learned decisions associated with one higher-level user goal/execution.

Record:

```text
episode_id
ordered decision_ids
policy_versions
intermediate outcomes
final user-visible outcome
total cost
total latency
```

This allows evaluation of whether a sequence of individually reasonable decisions produced a good final outcome.

## 258. Policy Interaction Graph

Multiple policies can interact:

```text
provider routing
+ retry policy
+ evaluator policy
+ stopping policy
+ runner placement
```

Maintain a Policy Interaction Graph identifying:

- policy dependencies;
- shared optimization variables;
- conflicting constraints;
- circular influence;
- ordering.

Before promoting a policy into a use case with other active learned policies, run compatibility checks against the interaction graph.

A locally superior policy MAY be rejected if composition causes end-to-end regression.

## 259. End-to-End Utility Budget

Optimization MUST be evaluated at the level that matters to the user, not only at the local decision node.

For an episode:

```text
EndToEndUtility =
  outcome quality/value
  - execution cost
  - learning/evaluation overhead
  - latency penalty
  - human rework penalty
  - risk penalty
```

Exact weights are use-case specific and MUST not replace hard constraints.

Local policies MAY receive sub-budgets, but their combined behavior MUST fit the episode-level budget.

## 260. Local-Optimum Guard

A policy MUST NOT be promoted solely because it improves a local metric if end-to-end outcomes worsen.

Examples:

- a cheaper model creates more downstream retries;
- a faster rough-cut requires more human correction;
- fewer retrieval tokens lower answer quality and trigger repeat questions;
- aggressive early stopping increases later rework.

Promotion reports SHOULD include both local metric deltas and episode/final-outcome deltas where applicable.

## 261. Black-Box Provider Behavioral Fingerprint

Some external providers change model behavior without exposing a stable model revision.

For high-value integrations, periodically build a behavioral fingerprint using a small approved probe suite.

Fingerprint MAY include:

```text
structured-output compliance
tool-call behavior
latency distribution
selected quality benchmarks
error profile
token/usage characteristics
```

A material fingerprint change can trigger:

```text
provider_drift_detected
→ restrict scope
→ recalibrate evaluator/policy
→ replay/shadow requalification
```

Probe content must respect provider terms and platform data policy.

## 262. Feedback Trust Model

User feedback, automated ratings, and downstream signals have different reliability.

Classify feedback sources:

```text
explicit_user_choice
explicit_user_rating
expert_review
deterministic_test
implicit_behavior
automated_heuristic
external_agent_feedback
```

Each source carries provenance and trust semantics.

Implicit behavior MUST NOT automatically be treated as explicit preference or quality truth.

## 263. Feedback Manipulation and Anti-Gaming

Learning systems can be manipulated by repeated feedback or agents optimizing the measured reward.

Controls SHOULD include:

- rate limiting;
- duplicate/near-duplicate feedback detection;
- source reputation/trust;
- anomaly detection;
- tenant/user concentration monitoring;
- separation of quality metrics from commercial incentives;
- robust aggregation where appropriate.

Suspected manipulation moves affected evidence into quarantine or down-weighted analysis, never silently into promotion-grade truth.

## 264. Feature Registry and Provenance

Contextual policies depend on input features.

Every learned feature SHOULD be registered with:

```text
feature_id
description
type
source
owner
tenant_scope
purpose
sensitivity_class
retention
calculation_version
allowed_use_cases
```

Feature values used for a decision are reproducible or reference a versioned source.

No policy may begin consuming a newly invented feature in production without registry/compatibility review.

## 265. Data-Minimization for Learned Features

Only features required for a declared policy purpose should be collected.

Prefer:

- structural metadata;
- coarse buckets;
- derived non-sensitive features;
- scoped hashes/references;

over raw content where equivalent predictive value exists.

If a feature provides negligible measured value but materially increases privacy/security cost, it SHOULD be removed.

Feature-ablation analysis MAY be used to demonstrate whether a feature is worth retaining.

## 266. Cohort Robustness Monitoring

Aggregate improvement can hide operational regressions.

Where relevant and lawful, monitor performance across non-sensitive operational cohorts such as:

```text
task complexity
tenant size/tier
region
executor availability profile
artifact type
device/runner class
new vs mature task class
```

Do not infer protected/sensitive personal attributes merely for optimization.

Promotion MAY be blocked when a challenger causes a material severe regression in an important supported cohort even if aggregate metrics improve.

## 267. Graceful Degradation Profiles

Define explicit runtime modes:

```text
NORMAL
LEARNING_DEGRADED
ADVICE_DEGRADED
BASELINE_ONLY
EMERGENCY_FROZEN
```

Example behavior:

### NORMAL
Replay, policy advice, shadow/canary, and monitoring operate normally.

### LEARNING_DEGRADED
Existing active policies may continue, but candidate generation/replay is paused.

### ADVICE_DEGRADED
New advice unavailable; execution uses cached/approved baseline.

### BASELINE_ONLY
All learned policy influence disabled.

### EMERGENCY_FROZEN
Promotion, experiments, policy synthesis, and mutable learning operations frozen while authoritative execution follows incident runbooks.

Transitions between modes are observable and auditable.

## 268. Policy Retirement Tombstones

Retiring a policy MUST NOT delete the identity required to interpret historical traces.

Retirement record:

```text
policy_id
version
retired_at
reason
replacement_policy
final_checksum
compatibility_metadata
archive_location
```

Historical executions continue resolving their original policy reference.

A retired policy cannot become active again without an explicit requalification/new activation decision.

## 269. Evaluator and Dependency Archival Compatibility

Historical replay/reproducibility may depend on retired evaluators or libraries that are unsafe to execute.

Therefore distinguish:

```text
historically_resolvable
re-executable
non-re-executable-but-auditable
```

The platform is not required to preserve insecure runtime binaries indefinitely.

It MUST preserve enough metadata/artifacts/results to explain historical certification, subject to retention/privacy constraints.

## 270. Dream-RSI / External Learning Provider Conformance Suite

Any future `DreamRSIProvider` or other external learning provider MUST pass a conformance suite before it can replace or augment native implementation behavior.

Conformance areas:

```text
trace ingestion semantics
tenant isolation
policy search-space boundaries
candidate provenance
replay side-effect prohibition
uncertainty labeling
counterfactual labeling
promotion non-authority
budget enforcement
kill switch
audit emission
deterministic fallback
```

An adapter that produces better benchmark results but violates these contracts is incompatible.

## 271. Semantic Equivalence Boundary for External Providers

SmartAIHub contracts are authoritative.

An external provider MAY internally use different concepts/algorithms, but its adapter MUST map outputs into:

```text
SmartAIHub Policy
SmartAIHub Evidence
SmartAIHub Evaluation
SmartAIHub Decision Envelope
SmartAIHub Promotion State
```

The provider MUST NOT redefine:

- active-policy state;
- authorization;
- tenant scope;
- hard constraints;
- billing truth;
- approval semantics.

## 272. Revision 8 Acceptance Additions

Where applicable, certification now also requires:

- sealed-holdout leakage test;
- multiple-comparison/sequential-analysis review;
- delayed-outcome finalization test;
- episode-level attribution;
- multi-policy interaction compatibility test;
- end-to-end utility regression test;
- black-box provider fingerprint drift test;
- feedback provenance/manipulation test;
- feature-registry enforcement;
- feature minimization review;
- cohort robustness report;
- graceful-degradation transition test;
- retired-policy historical-resolution test;
- non-re-executable historical audit test;
- external learning-provider conformance test.

## 273. Revision 8 Completeness Conclusion

The fifth audit found that the largest remaining risks were no longer missing primary capabilities. They were **evaluation leakage and composition effects**:

```text
a candidate can overfit the evidence,
an experiment can win by statistical luck,
a local policy can improve while the whole workflow worsens,
a provider can drift silently,
and feedback can be manipulated.
```

Revision 8 therefore strengthens the specification around independent evidence, experiment validity, delayed outcomes, episode-level utility, policy interaction, behavioral provider drift, feedback trust, learned-feature governance, graceful degradation, and archival compatibility.

The governing rule is now:

> **A policy is not good because it wins one replay metric. It is good only when independent evidence shows that its composed, end-to-end behavior improves the declared use-case objective without violating hard constraints, economic limits, or operational safety.**

---

## 274. Sixth Completeness Audit (Passes 105–124)

A further 20-pass review was performed after Revision 8. This pass focuses on silent correctness failures: situations in which the platform continues operating but the evidence, attribution, replay, or operator interpretation is no longer trustworthy.

| Pass | Review lens | Gap found | Correction |
|---:|---|---|---|
| 105 | Telemetry completeness | Missing telemetry could silently bias policy evidence | Observability Coverage Contract |
| 106 | Temporal leakage | Post-outcome information could leak into decision features | Decision-Time Feature Barrier |
| 107 | Feature freshness | Correct features could still be stale at decision time | Feature TTL/Freshness Contract |
| 108 | Stateful replay | Browser/agent workflows may depend on mutable world state | Stateful Replay Validity Model |
| 109 | Canary attribution | Fallback/non-compliance could contaminate experiment treatment | Treatment Compliance Model |
| 110 | Shadow validity | Shadow policy may not experience the state created by its own actions | Shadow Equivalence Classes |
| 111 | Runtime nondeterminism | GPU/runtime/provider nondeterminism can make replay misleading | Determinism Profile |
| 112 | Policy churn | Frequent promote/rollback cycles can cause instability | Hysteresis and Churn Guard |
| 113 | Privacy deletion | Backups/caches/exports may retain deleted evidence | Extended Erasure Propagation |
| 114 | Legal hold | Deletion and legal/audit hold requirements can conflict | Hold/Deletion Precedence Contract |
| 115 | Units/currency semantics | Metrics can compare incompatible units/pricing bases | Semantic Unit Registry |
| 116 | Producer authenticity | A forged/misconfigured producer could inject false trace identity | Producer Identity/Attestation |
| 117 | Knowledge-base injection | Stored operational text could instruct later agents | Knowledge Retrieval Safety Boundary |
| 118 | Capability freshness | Policy can rely on a stale capability-registry snapshot | Capability Freshness Lease |
| 119 | Telemetry blackout | Learned policy could keep adapting while evidence collection is blind | Observability Fail-Safe |
| 120 | Runtime invariant enforcement | Compiled policy can still encounter invalid runtime context | Policy Runtime Firewall |
| 121 | Experiment restart | Service restart can lose assignment/analysis continuity | Experiment Checkpoint/Resume Contract |
| 122 | Rolling version skew | Mixed service versions can evaluate different semantics | Version-Skew Envelope |
| 123 | Alert fatigue | Too many learning alerts can hide critical incidents | Alert Governance and Deduplication |
| 124 | Evidence export | Support/evidence bundles can leak unnecessary tenant data | Minimum-Disclosure Export Contract |

The following requirements are normative.

## 275. Observability Coverage Contract

A policy must not be evaluated as if its evidence is complete when telemetry coverage is materially incomplete.

For each trace/episode, record coverage for expected evidence domains:

```text
decision_events
branch_events
attempt_events
cost_events
outcome_events
approval_events
cancellation_events
artifact_events
delayed_outcome_events
```

Example:

```yaml
coverage:
  decision_events: complete
  cost_events: partial
  delayed_outcome_events: pending
overall_evidence_state: incomplete
```

Requirements:

- expected event set is defined by task/outcome contract;
- missing mandatory event classes reduce trace eligibility;
- dropped telemetry and ingestion gaps are measurable;
- promotion-grade datasets declare minimum coverage;
- missing telemetry MUST NOT be treated as a successful zero-cost/zero-error outcome.

The system SHOULD compute an `evidence_completeness_ratio`, but hard-required missing evidence remains a categorical failure regardless of ratio.

## 276. Decision-Time Feature Barrier

A learned decision may only use information legitimately available at the time the decision was made.

Every feature used by an active policy SHOULD include:

```text
available_at
observed_at
source_event_id
calculation_version
```

The evaluation system MUST detect and reject temporal leakage such as:

- using final task success as an input feature for the original route decision;
- using final cost when simulating a pre-dispatch choice;
- using post-review labels that did not exist at decision time;
- using a later provider-health state as if it were known earlier.

Offline replay MUST reconstruct the decision context as-of the original decision timestamp/sequence.

## 277. Feature Freshness and TTL Contract

A feature can be valid in principle but stale in practice.

Feature Registry entries MAY define:

```text
freshness_ttl
refresh_source
stale_behavior
max_clock_skew
```

At decision time, features are classified:

```text
fresh
stale_usable
stale_forbidden
missing
```

Examples:

- provider health may need seconds/minutes freshness;
- tenant preferences may tolerate longer TTL;
- model pricing may require versioned effective-date validity;
- authorization/capability availability requires dispatch-time revalidation regardless of cache TTL.

Stale-forbidden features trigger recomputation or fallback.

## 278. Stateful Replay Validity Model

Some decisions change the world, meaning an alternate policy cannot be accurately replayed from the same later state.

Examples:

- browser/computer-use actions;
- Git repository mutation;
- file editing;
- external API writes;
- queue/job mutations;
- media editing state transitions.

Each replayable step is classified:

```text
stateless_observable
stateful_snapshot_available
stateful_transition_recorded
stateful_but_nonreplayable
external_world_dependency
```

Promotion-grade replay for stateful tasks requires either:

- a sufficient state snapshot;
- deterministic transition model;
- a controlled sandbox clone;
- or explicit labeling as unsupported/counterfactual.

The system MUST NOT pretend that an alternative browser click sequence was observed merely because the original final page was recorded.

## 279. Treatment Compliance and Canary Attribution

A job assigned to a canary treatment may not actually receive that treatment because of fallback, outage, user override, or authorization constraints.

Record:

```text
assigned_policy
attempted_policy
effective_policy
deviation_reason
```

Analysis SHOULD distinguish:

- assignment/intention-to-treat population;
- treatment-compliant population;
- fallback/non-compliant population.

Promotion reports MUST disclose compliance rate.

A canary with low treatment compliance cannot be interpreted as strong evidence for the challenger.

## 280. Shadow Equivalence Classes

Shadow evaluation is not equally valid for all decision types.

Classify shadow decisions:

```text
S1 fully equivalent
S2 context-equivalent but action-not-executed
S3 state-dependent/non-equivalent
S4 unsafe/impossible to shadow
```

Examples:

- provider route selection may often be S1/S2;
- computer-use next-action planning can be S3 because the shadow route would create a different UI state;
- consequential external writes may be S4.

Policy qualification MUST consider the shadow class.

For S3/S4 decisions, replay/sandbox/canary evidence carries more weight than passive shadow comparison.

## 281. Determinism Profile

Each executor/evaluator SHOULD declare a determinism profile:

```text
deterministic
seeded_best_effort
stochastic_repeatable
environment_sensitive
black_box_variable
```

For hardware-sensitive/GPU/media/kernel workloads, evidence SHOULD record where relevant:

```text
hardware class
driver/runtime
library version
precision mode
seed
device configuration
```

Replay reports MUST avoid claiming bitwise reproducibility when the runtime only supports statistical repeatability.

A hardware/runtime change can trigger compatibility requalification independently from model/provider drift.

## 282. Policy Hysteresis and Churn Guard

A policy system that frequently promotes and rolls back can become operationally unstable.

Track:

```text
promotion_frequency
rollback_frequency
policy_dwell_time
directional_reversals
performance_delta_after_switch
```

Controls MAY include:

- minimum dwell time;
- minimum material improvement threshold;
- promotion cooldown;
- stronger evidence for reversing a recent decision;
- operator review after repeated oscillation.

Emergency rollback is never blocked by hysteresis.

The purpose is to prevent noise-driven policy thrashing.

## 283. Extended Erasure Propagation

Deletion requirements MUST cover all derivative locations, not only primary learning tables.

Deletion lineage SHOULD include:

```text
primary DB
object storage
search/vector indexes
caches
temporary replay workspace
exports
support bundles
backup policy
external evaluator retained data if contractually controllable
```

Requirements:

- caches are invalidated;
- queued exports/replay are cancelled where required;
- external provider deletion/retention obligations are tracked where supported;
- backup deletion follows platform backup/privacy policy;
- restored backups MUST reapply authoritative deletion tombstones before deleted data becomes available to learning workloads.

## 284. Hold-versus-Deletion Precedence Contract

Legal/security/audit holds may conflict with ordinary retention/deletion workflows.

The platform MUST define an explicit precedence model controlled by the appropriate compliance/legal policy, not by Spec 222 itself.

Possible states:

```text
normal_retention
deletion_requested
hold_active
deletion_deferred_by_authoritative_hold
deleted
```

Spec 222 MUST:

- consume the authoritative hold/deletion decision;
- prevent held evidence from ordinary compaction if required;
- prevent ordinary operators from creating ad-hoc holds;
- avoid exposing held content outside its original authorization scope;
- resume deletion when the authoritative hold ends where required.

## 285. Semantic Unit and Pricing Registry

Metrics MUST declare semantic units.

Examples:

```text
USD_2026_09_provider_price
THB_ledger_actual
milliseconds
runner_seconds
GPU_seconds
input_tokens
output_tokens
megabytes
quality_score_v3
```

Rules:

- no arithmetic across incompatible units without explicit conversion;
- currency conversion records FX source/version/effective time when used for analytics;
- historical actual ledger currency remains preserved;
- normalized comparison currency is analytical, not billing truth;
- pricing version and tax/fee inclusion semantics are explicit.

This prevents apparently precise ROI comparisons built on inconsistent cost definitions.

## 286. Producer Identity and Event Authenticity

Trace provenance MUST identify the system producer, not merely trust fields supplied inside the event body.

Where supported, producers SHOULD have authenticated identities:

```text
producer_service_id
producer_instance_id
software_build
runner/device_id
credential/key identity
```

High-trust events MAY use message signing or transport-level identity attestation.

Rules:

- tenant/user identity inside payload is validated against authenticated producer authority;
- unauthorized producer/tenant combinations are rejected/quarantined;
- producer identity rotation is supported;
- spoofed or unverifiable high-trust evidence cannot qualify for promotion-grade use.

## 287. Knowledge Retrieval Safety Boundary

The Policy Knowledge Base, Failure Pattern Library, trace summaries, and imported operational notes are untrusted retrieval content.

When agents use this knowledge to propose candidates:

- retrieved content is treated as data, not system instruction;
- instruction-like text from traces cannot override policy-generation constraints;
- tool calls/actions remain controlled by the candidate-generation sandbox;
- citations/provenance are retained for retrieved operational claims;
- suspicious injection patterns can be filtered/quarantined.

The knowledge base MUST NOT become a hidden channel for escalating agent privileges.

## 288. Capability Freshness Lease

Capability availability changes over time.

Capability Registry snapshots used in advice SHOULD carry:

```text
registry_version
captured_at
valid_until
capability_health_epoch
```

Policy advice can be computed from a snapshot, but dispatch-time execution MUST verify a fresh lease/availability state.

If the capability registry is unavailable or stale beyond threshold:

```text
use safe cached baseline capability set
or
fail closed for capability-sensitive work
```

Do not assume a capability exists simply because historical policy evidence references it.

## 289. Observability Fail-Safe

Self-improvement requires trustworthy feedback.

If critical evidence collection is unavailable:

```text
telemetry_health = degraded/unknown
```

then the system MUST be able to:

- pause new candidate promotion;
- pause adaptive/online learning;
- continue baseline execution where safe;
- mark affected traces incomplete;
- avoid interpreting missing failures as success;
- surface an operator-visible condition.

For L6 adaptive modes, loss of required telemetry SHOULD automatically reduce maturity to a safer mode until observability recovers.

## 290. Policy Runtime Firewall

Compile-time validation is necessary but not sufficient.

Before executing each policy-directed action, a runtime firewall enforces authoritative constraints against current context.

Checks MAY include:

```text
authorization
tenant scope
budget/reservation
capability availability
provider/data policy
region
approval
branch/depth limits
runtime duration
current kill switches
policy activation epoch
```

The runtime firewall belongs at the policy-consumer/execution boundary.

A learned policy never gets a direct bypass path around current runtime constraints.

## 291. Experiment Checkpoint and Resume Contract

Long replay/shadow/canary experiments may span service restarts or deployments.

Persist:

```text
experiment_id
assignment scheme/version
dataset snapshot
policy versions
analysis plan
progress cursor
budget consumed
current status
```

On restart:

- assignment semantics remain stable;
- already-counted samples are not double-counted;
- changed policy/evaluator versions require a new experiment version or explicit compatibility decision;
- expired experiments do not silently resume;
- incomplete experiments are visibly marked.

## 292. Version-Skew Envelope During Rolling Deployment

During rolling deploys, producers/consumers may run different compatible versions.

Each API/event contract SHOULD declare a supported skew window such as:

```text
producer_schema: N or N-1
consumer_schema: N
policy_artifact: compatible range
SDK minimum version
```

Requirements:

- consumers reject semantically incompatible artifacts;
- tolerant readers accept declared additive fields;
- old producers do not accidentally omit newly mandatory promotion evidence without detection;
- certification captures actual versions used.

Mixed-version periods are observable.

## 293. Alert Governance and Operator Load

Spec 222 can generate many low-value warnings from drift, stale datasets, evaluator disagreement, or provider incidents.

Alert policy SHOULD define:

```text
severity
deduplication_key
aggregation_window
owner
notification_channel
auto_resolve_condition
runbook
```

Principles:

- page humans only for actionable urgent conditions;
- aggregate repeated downstream symptoms under a root incident where possible;
- analytics warnings belong in dashboards, not emergency paging;
- repeated ignored alerts trigger alert-quality review.

Operator overload is itself a reliability risk.

## 294. Minimum-Disclosure Evidence Export

Exports for support, audit, certification, or billing disputes MUST include only evidence required for the stated purpose.

Export controls:

- purpose;
- requester authorization;
- tenant scope;
- field allowlist;
- artifact inclusion rules;
- redaction version;
- expiry/retention;
- download/audit event;
- optional encryption.

Default export SHOULD favor IDs, hashes, metrics, and redacted structured evidence over full prompts/artifacts.

Cross-tenant export is prohibited unless an explicitly authorized platform-level purpose permits it.

## 295. Revision 9 Cross-Cutting Runtime Invariants

The following invariants now apply across all capabilities:

```text
NO VALID OBSERVABILITY
    → NO NEW LEARNING CLAIM

NO DECISION-TIME AVAILABILITY
    → FEATURE CANNOT JUSTIFY THE DECISION

NO STATEFUL REPLAY SUPPORT
    → NO CLAIM OF OBSERVED COUNTERFACTUAL

NO TREATMENT COMPLIANCE
    → NO CLEAN CANARY ATTRIBUTION

NO FRESH CAPABILITY/AUTH/BUDGET CHECK
    → NO POLICY-DIRECTED DISPATCH

NO COMPATIBLE RUNTIME VERSION
    → FALLBACK OR BLOCK

NO MINIMUM-DISCLOSURE EXPORT AUTHORIZATION
    → NO EXPORT
```

These are hard correctness rules, not optimization preferences.

## 296. Revision 9 Acceptance Additions

Where applicable, certification now requires:

- telemetry-coverage loss test;
- temporal-leakage test;
- stale-feature test;
- stateful-replay qualification test;
- canary treatment-compliance report;
- shadow-equivalence classification;
- hardware/runtime repeatability report;
- policy-churn/hysteresis test;
- backup/cache deletion propagation drill;
- hold/deletion state test;
- unit/currency compatibility test;
- producer identity/spoofing test;
- knowledge-base prompt-injection test;
- stale capability-registry test;
- observability-blackout downgrade test;
- runtime-firewall rejection test;
- experiment restart/resume test;
- rolling-deployment version-skew test;
- alert deduplication/runbook review;
- minimum-disclosure export test.

## 297. Revision 9 Implementation Guidance

The requirements added in Revision 9 SHOULD be integrated into the existing phases rather than creating a second implementation program.

Suggested placement:

```text
P222-A*
  telemetry coverage
  temporal feature barriers
  producer identity
  feature freshness

P222-B*
  stateful replay validity
  determinism profile
  semantic units
  deletion propagation

P222-C*
  policy churn guard
  knowledge-base safety
  capability freshness

P222-D*
  treatment compliance
  shadow equivalence
  runtime firewall
  experiment checkpointing

P222-E*
  observability fail-safe
  version-skew certification
  alert governance
  evidence export controls
```

P222-A0 remains the required first implementation step against the real codebase.

## 298. Revision 9 Completeness Conclusion

Passes 105–124 found twenty further gaps, but they are now predominantly **silent-evidence and runtime-correctness hazards**, not missing architectural pillars.

The most consequential additions are:

- never learning from incomplete telemetry as though it were complete;
- preventing future/outcome data from leaking into historical decision features;
- refusing to overclaim replay validity for stateful environments;
- separating canary assignment from actual treatment received;
- continuously enforcing authoritative constraints at runtime;
- downgrading adaptive behavior when observability is lost;
- preserving deletion, identity, unit, and version semantics across distributed systems.

The governing rule becomes:

> **Spec 222 may optimize only what it can observe, attribute, reproduce, and constrain correctly. When any of those foundations becomes uncertain, the system must degrade toward a simpler trusted baseline rather than becoming more autonomous.**

---

## 299. Seventh Completeness Audit (Passes 125–144)

A further 20-pass review was performed after Revision 9. This audit focuses on interactions that appear only when many learned policies, tenants, executors, and use cases operate simultaneously under shared infrastructure.

| Pass | Review lens | Gap found | Correction |
|---:|---|---|---|
| 125 | Causal interference | One policy can change resource conditions experienced by another | Shared-resource interference model |
| 126 | Queueing/general-equilibrium | A locally faster route can become slower when widely adopted | Load-sensitive capacity evaluation |
| 127 | Portfolio budget | Use cases could each be locally efficient but collectively overspend | Global learning-budget allocator |
| 128 | Tail risk | Mean success/cost can hide rare catastrophic outcomes | Tail-risk and catastrophic-loss guard |
| 129 | Goodhart/proxy gaming | Optimized metrics may diverge from true user value | Proxy-metric integrity tests |
| 130 | Simulator bias | Replay/simulation may systematically mispredict production | Simulator calibration and sim-to-real gap |
| 131 | Side effects | Canary/experiment actions may need business compensation | Compensation/Saga contract |
| 132 | Recursive amplification | Policies can indirectly trigger each other in loops | Cross-policy recursion breaker |
| 133 | Bundle promotion | Interdependent policies may need coordinated activation | Atomic policy-bundle activation |
| 134 | Bundle rollback | Rolling back one policy can invalidate its companions | Dependency-aware bundle rollback |
| 135 | Exposure spillover | Experiment units can influence each other | Spillover/isolation model |
| 136 | Baseline validity | The fallback baseline itself can become stale or broken | Baseline certification and drift |
| 137 | Fallback exhaustion | Every fallback can fail simultaneously | Terminal safe-failure contract |
| 138 | Adversarial search | Candidate optimizers can discover pathological loopholes | Policy red-team/adversarial evaluation |
| 139 | Aggregate confidentiality | Effectiveness matrices can leak tenant/provider-sensitive info | Privacy-preserving aggregate views |
| 140 | Rare incident learning | Ordinary sampling may discard the evidence most needed for safety | Rare-event evidence preservation |
| 141 | Portfolio ROI | Per-use-case ROI did not prioritize the overall roadmap | Portfolio value/prioritization model |
| 142 | Fan-out admission control | Learned parallelism can overload shared execution capacity | Policy-induced fan-out admission control |
| 143 | Cross-spec drift | Companion specs can change without Spec 222 noticing | Automated contract-drift detection |
| 144 | Emergency hotfix | Urgent policy repair needed a controlled nonstandard path | Emergency policy hotfix governance |

The following sections are normative additions.

## 300. Shared-Resource Causal Interference Model

The outcome of one execution may depend on what other executions are doing at the same time.

Examples:

- two policies consuming the same provider quota;
- many jobs competing for the same Runner/GPU pool;
- several agents modifying the same repository/workspace;
- concurrent media jobs saturating storage/network bandwidth;
- multiple policies increasing evaluator demand.

This violates the assumption that each treatment outcome is independent.

For affected use cases, record contextual resource-state evidence such as:

```text
provider_quota_pressure
runner_pool_utilization
queue_depth
shared_repo_lock/contention
network/storage pressure
concurrent_experiment_load
```

Promotion-grade analysis SHOULD distinguish:

```text
independent-task regime
shared-resource regime
high-contention regime
```

A policy MAY be strong in isolation but unacceptable under realistic shared load.

## 301. Load-Sensitive Capacity and Queueing Evaluation

Policy adoption can change the workload distribution itself.

Example:

```text
Policy chooses Provider A because it is currently fastest
        ↓
80% of traffic moves to A
        ↓
queue/rate-limit pressure increases
        ↓
A is no longer fastest
```

Therefore evaluation SHOULD support load-sensitive metrics:

```text
arrival_rate
service_rate
queue_wait
utilization
saturation threshold
rate-limit probability
capacity headroom
```

Scenario/What-if Lab SHOULD be able to test projected adoption levels rather than assuming current low-volume performance remains constant.

Broad promotion MUST consider expected steady-state load.

## 302. Global Learning-Budget Allocator

Each use case can be individually bounded yet collectively exceed platform learning spend.

Define a portfolio budget layer above per-use-case budgets:

```text
platform_monthly_learning_budget
tenant_learning_budget
evaluator_budget_pool
replay_compute_pool
experimental_subsidy_pool
```

Allocation SHOULD consider:

- expected net value;
- use-case maturity;
- uncertainty reduction;
- strategic priority;
- risk;
- required minimum monitoring spend.

A low-value use case MAY be throttled even if it has not exceeded its local budget.

The allocator does not replace the authoritative credit/accounting ledger.

## 303. Tail-Risk and Catastrophic-Loss Guard

Average metrics are insufficient for high-impact outcomes.

Where applicable, evaluate:

```text
p95/p99 cost
p95/p99 latency
worst observed failure
catastrophic_failure_count
high-severity incident rate
CVaR / expected shortfall style metrics
```

A challenger MUST NOT be promoted solely because mean performance improves if tail risk materially worsens beyond configured tolerance.

Examples:

- 20% lower average cost but rare 100× runaway branch explosion;
- slightly higher success but occasional unauthorized external write;
- faster median completion but severe p99 queue saturation.

Hard catastrophic events remain categorical failures regardless of average score.

## 304. Proxy-Metric Integrity and Goodhart Tests

Any metric used for optimization can become a target.

For each primary soft metric, document:

```text
metric_definition
why_it_represents_value
known_failure_modes
anti-gaming_checks
companion_guardrails
```

Examples:

- reducing branch count must not lower verified completion;
- reducing latency must not increase deferred rework;
- increasing user acceptance must not be achieved through manipulative defaults;
- lowering evaluator cost must not suppress necessary review.

Policy red-team tests SHOULD explicitly search for ways to improve the proxy while harming the real objective.

## 305. Simulator Calibration and Sim-to-Real Gap

Replay and scenario simulation are themselves models of reality.

Track simulator/replay prediction error against later live evidence:

```text
predicted_success vs observed_success
predicted_cost vs actual_cost
predicted_latency vs actual_latency
predicted_route_mix vs actual_route_mix
```

Maintain:

```text
simulator_version
calibration_window
error_distribution
known_unsupported_regions
```

If sim-to-real error exceeds threshold:

```text
reduce replay confidence
require more shadow/canary evidence
recalibrate simulator
restrict affected task classes
```

A simulator cannot certify itself solely using its own synthetic outcomes.

## 306. Compensation / Saga Contract for Side-Effecting Experiments

Some controlled canaries may cause legitimate external side effects.

Examples:

- file/repository changes;
- published content;
- workflow state mutations;
- external resource creation.

Where live experiments are permitted, the use case MUST define:

```text
side_effect_class
idempotency_contract
compensation_action
compensation_owner
irreversible_effects
approval_requirement
```

A failed experiment cannot assume database rollback reverses the external world.

Irreversible/high-impact effects SHOULD generally be excluded from exploratory canary treatment unless explicitly authorized.

## 307. Cross-Policy Recursion and Amplification Breaker

Policies may indirectly trigger other learned policies.

Example:

```text
routing policy
→ external agent
→ agent invokes SmartAIHub Skill
→ Skill invokes workflow
→ workflow requests another learned route
```

Record an execution-learning context containing:

```text
root_episode_id
policy_call_depth
visited_policy_use_cases
cumulative_branch_budget
cumulative_cost_budget
```

Enforce:

```text
max_policy_call_depth
max_nested_learned_decisions
max_cumulative_fanout
max_cumulative_budget
```

Detected cycles trigger fallback or fail-safe behavior.

A policy MUST NOT evade its local branch limit by recursively invoking another policy layer.

## 308. Atomic Policy-Bundle Activation

Some policies are valid only as a coordinated set.

Example:

```text
provider-routing policy v8
+
retry policy v3
+
evaluator policy v5
```

Support an optional `policy_bundle`:

```text
bundle_id
bundle_version
member_policy_versions
compatibility_constraints
activation_epoch
rollback_bundle
```

Activation semantics:

- validate all members first;
- activate atomically at the bundle authority;
- consumers see either old bundle or new bundle;
- partial activation is invalid.

Use bundles only where policy interaction evidence justifies them; do not bundle unrelated policies unnecessarily.

## 309. Dependency-Aware Bundle Rollback

Rollback of one member may invalidate the full bundle.

Bundle rollback rules MUST define:

```text
rollback_scope
compatible_partial_rollback
required_companion_versions
in_flight_behavior
```

If safe partial rollback is not proven, rollback the bundle to a known-good compatible set.

Emergency baseline fallback remains available independently of bundle complexity.

## 310. Experiment Spillover and Isolation Model

One experiment unit can affect another.

Examples:

- jobs sharing a repository;
- users collaborating on the same project;
- provider congestion created by canary traffic;
- shared cache effects;
- one agent publishing artifacts later consumed by controls.

Experiments SHOULD declare isolation unit:

```text
request
execution
user
project
tenant
runner_pool
time_window
```

When spillover is expected, assignment and analysis MUST account for it or the experiment is marked `interference_limited`.

Naive request-level randomization is insufficient when project/tenant-level spillover dominates.

## 311. Baseline Certification and Drift

Fallback is safe only if the baseline is itself healthy.

Every long-lived baseline SHOULD have:

```text
baseline_policy_version
last_certified_at
supported_capabilities
known_limitations
review_due_at
compatibility_range
```

Baseline monitoring includes:

- provider/tool availability;
- security compatibility;
- task-success floor;
- cost/latency sanity;
- schema compatibility.

If the baseline becomes invalid:

```text
select designated secondary baseline
or
enter safe terminal failure
```

Do not assume a years-old fallback remains safe forever.

## 312. Terminal Safe-Failure Contract

The fallback chain can be exhausted.

Each use case MUST define terminal behavior:

```text
fail_closed
ask_user
queue_for_operator
defer_and_retry_later
return_partial_result
cancel
```

Terminal behavior depends on task risk and product semantics.

The system MUST NOT invent an unapproved executor simply because every configured route failed.

Terminal failure is an explicit product state with structured reason and remediation guidance.

## 313. Policy Red-Team and Adversarial Evaluation

Before high-impact learned policies reach L5/L6, perform adversarial evaluation against:

- cost-explosion prompts/tasks;
- evaluator loopholes;
- contradictory constraints;
- malicious tool output;
- prompt injection through traces/KB;
- recursive invocation;
- extreme provider failure;
- malformed feature values;
- missing telemetry;
- unusually large artifacts/tasks;
- attempts to route around approval.

Red-team cases are versioned and become part of the relevant benchmark/security suite.

A discovered loophole MUST be fixed at the appropriate hard-control layer, not merely memorized as a policy exception when a general invariant exists.

## 314. Privacy-Preserving Aggregate Effectiveness Views

Capability Effectiveness Matrix and portfolio dashboards can expose commercially sensitive information even without raw content.

Controls MAY include:

- minimum sample thresholds;
- tenant-local views by default;
- suppress small cohorts;
- coarse aggregation;
- delayed reporting;
- role-based access;
- provider-sensitive field masking.

Cross-tenant aggregate views MUST NOT expose another tenant's strategy, spend, volume, or proprietary workload characteristics.

If future global learning is introduced, privacy guarantees require a separate reviewed design.

## 315. Rare-Event Evidence Preservation

High-severity failures may be rare but critical.

Sampling/compaction policies MUST preserve designated evidence such as:

```text
security incident
cross-tenant anomaly
unauthorized action attempt
catastrophic cost explosion
data-loss event
severe rollback
rare provider corruption
```

Such traces MAY be pinned according to incident/retention policy even if ordinary success traces are aggressively sampled or compacted.

Privacy/deletion obligations still take precedence where required.

## 316. Portfolio Value and Roadmap Prioritization

Beyond per-use-case ROI, maintain a portfolio view:

| Use case | Net value | Confidence | Risk | Maturity | Engineering cost | Strategic value |
|---|---:|---:|---:|---:|---:|---:|

Prioritization SHOULD consider:

```text
expected annual net value
time-to-value
shared infrastructure reuse
risk
uncertainty
engineering effort
strategic capability
opportunity cost
```

This prevents the platform from spending months optimizing a technically interesting but economically minor use case while high-value use cases remain unimplemented.

No single aggregate portfolio score is required; the purpose is explicit trade-off visibility.

## 317. Policy-Induced Fan-Out Admission Control

A learned policy may request parallel branches that are individually allowed but collectively overload the execution plane.

Before admitting fan-out, the authoritative scheduler/control plane MUST consider:

```text
current capacity
reserved capacity
tenant quotas
global concurrency
provider quota
estimated branch resources
priority
```

It MAY reduce branch count, serialize branches, defer low-priority exploration, or fall back.

Spec 222 supplies desired exploration shape; the execution plane retains final admission authority.

Recorded evidence distinguishes:

```text
policy_requested_fanout
admitted_fanout
executed_fanout
```

This prevents capacity throttling from being misattributed to policy intent.

## 318. Automated Cross-Spec Contract-Drift Detection

Specs 199/200/206/213/221 and accounting/auth/job systems will evolve.

CI/contract tests SHOULD detect changes to:

```text
event schemas
API schemas
enum/state values
authorization claims
capability identifiers
job/outcome semantics
accounting fields
approval contracts
```

On incompatible drift:

```text
mark integration incompatible
block affected certification
fall back from learned influence where required
open explicit compatibility amendment
```

Spec 222 MUST NOT silently adapt to changed semantics through best-effort field guessing in production.

## 319. Emergency Policy Hotfix Governance

Occasionally a policy defect may require faster repair than the normal replay→shadow→canary cycle.

Support a tightly controlled emergency path:

```text
incident declared
→ freeze affected policy
→ select known-good baseline or narrowly patched config
→ static validation/runtime-firewall checks
→ privileged emergency approval
→ limited activation
→ mandatory post-incident replay/certification
```

Requirements:

- no expansion of capability/authorization;
- blast radius must be narrower or equal to affected scope;
- mandatory reason/ticket/incident reference;
- explicit expiry/review deadline;
- full audit;
- post-incident normalization into the standard lifecycle.

Emergency hotfix is not a shortcut for routine deployment.

## 320. Revision 10 Cross-Cutting Portfolio Invariants

The following rules now apply when multiple learned policies/use cases coexist:

```text
LOCAL IMPROVEMENT
    !=
GLOBAL IMPROVEMENT

ISOLATED BENCHMARK CAPACITY
    !=
STEADY-STATE PRODUCTION CAPACITY

AVERAGE SUCCESS
    !=
ACCEPTABLE TAIL RISK

POLICY REQUESTED FAN-OUT
    !=
CAPACITY-AUTHORIZED FAN-OUT

FALLBACK CONFIGURED
    !=
FALLBACK CERTIFIED HEALTHY

REPLAY PREDICTION
    !=
LIVE REALITY UNTIL CALIBRATED

MULTIPLE VALID POLICIES
    !=
VALID POLICY COMPOSITION
```

These are core design assumptions for scale.

## 321. Revision 10 Acceptance Additions

Where applicable, certification now requires:

- shared-resource interference/load test;
- adoption-level queue/capacity scenario;
- global learning-budget enforcement;
- tail-risk report;
- Goodhart/proxy-gaming red-team;
- simulator calibration report;
- side-effect compensation test;
- recursive-policy depth/fan-out test;
- atomic bundle activation test;
- bundle rollback compatibility test;
- experiment spillover/isolation review;
- baseline recertification test;
- terminal fallback-exhaustion test;
- adversarial policy red-team suite;
- aggregate confidentiality test;
- rare-event preservation test;
- portfolio ROI review;
- execution-plane fan-out admission test;
- automated companion-contract drift test;
- emergency policy-hotfix drill.

## 322. Revision 10 Implementation Placement

These requirements SHOULD be folded into existing phases:

```text
P222-A*
  rare-event classification
  cross-spec contract tests
  aggregate privacy controls

P222-B*
  simulator calibration
  causal interference metadata
  tail-risk metrics

P222-C*
  policy bundles
  baseline certification
  global learning-budget allocation
  portfolio ROI

P222-D*
  spillover-aware experiment assignment
  capacity/fan-out admission integration
  recursive-policy breaker
  side-effect compensation rules

P222-E*
  bundle rollback
  terminal safe failure
  emergency hotfix governance
  red-team/chaos certification
```

No new execution plane is introduced.

## 323. Revision 10 Completeness Conclusion

Passes 125–144 found twenty additional gaps centered on **system-wide interaction**, not missing single-policy functionality.

Revision 10 now accounts for:

- one policy changing the resource conditions of another;
- adoption itself changing provider/queue performance;
- global learning spend;
- rare catastrophic outcomes;
- proxy metric gaming;
- replay/simulation prediction error;
- side-effect compensation;
- recursive policy amplification;
- coordinated policy bundles;
- experiment spillover;
- baseline drift;
- exhausted fallback chains;
- adversarial candidate behavior;
- aggregate-data confidentiality;
- rare-event preservation;
- portfolio-level economic prioritization;
- execution-capacity admission;
- cross-spec evolution;
- emergency repair.

The governing principle is:

> **Spec 222 must optimize the whole operating system of decisions, not merely individual policies in isolation. A locally better policy is unacceptable when it makes the shared platform, end-to-end workload, tail risk, or portfolio economics worse.**

---

## 324. Eighth Completeness Audit (Passes 145–164)

A further 20-pass review was performed after Revision 10. This audit focuses on evidence integrity across time, changing eligibility/action spaces, distributed causality, ownership/configuration lifecycle, and safe recovery after broad incidents.

| Pass | Review lens | Gap found | Correction |
|---:|---|---|---|
| 145 | Distributed causality | Wall-clock/event order can misstate which decision caused which outcome | Causal Event Ordering Contract |
| 146 | Delayed rewards | Long-lag outcomes can be credited to the wrong policy/decision | Delayed Reward Credit Assignment |
| 147 | Seasonality | A policy can appear superior because it ran in an easier time window | Seasonality/Temporal Stratification |
| 148 | Missing-not-at-random | Missing traces/outcomes may correlate with failures | Missingness Bias Contract |
| 149 | Action-space evolution | Policies/evaluations can compare different available route sets | Action-Space Versioning |
| 150 | Eligibility denominator | Success rates can be inflated by evaluating only easier eligible tasks | Common-Population Comparison |
| 151 | Treatment dosage | A canary may partially apply a policy rather than fully apply it | Exposure/Dosage Attribution |
| 152 | Negative controls | Causal/evaluator pipelines lacked placebo checks for hidden bias | Negative-Control / Placebo Tests |
| 153 | Ownership lifecycle | Policy/use-case owner can leave or lose responsibility | Ownership Transfer and Orphan Governance |
| 154 | Tenant namespace migration | Tenant/domain/project migration can break lineage and isolation | Tenant/Namespace Migration Contract |
| 155 | Secret/config references | Policy configuration could accidentally embed mutable secret values | Secret Reference Indirection |
| 156 | Candidate retention | Candidate/search history can grow without bound or disappear too early | Candidate/Evaluation Retention Policy |
| 157 | Fleet-wide incident control | Many policies may need coordinated freeze/disable | Global Freeze/Unfreeze Protocol |
| 158 | Recovery behavior | Adaptive modes could resume too aggressively after an outage | Post-Incident Warm-Up Gate |
| 159 | Cross-region evidence portability | Replicated evidence can lose residency/provenance semantics | Region-Preserving Evidence Replication |
| 160 | Quota reset boundaries | Daily/monthly resets can distort cost/quota policy evaluation | Accounting-Period Boundary Model |
| 161 | Context mutation | Project/user/task context can materially change mid-episode | Context Epoch Contract |
| 162 | Governance change | Consent/approval/provider-policy changes can invalidate an experiment mid-run | Governance Invalidation Events |
| 163 | Capability deprecation | Abrupt capability removal can invalidate many active policies at once | Deprecation Grace and Migration |
| 164 | Distributed randomness | Seeds/settings alone may not reproduce multi-executor stochastic behavior | Randomness Provenance Contract |

The following sections are normative additions.

## 325. Causal Event Ordering Contract

Distributed timestamps are insufficient to establish causality.

Relevant events SHOULD carry causal linkage where available:

```text
event_id
causal_parent_event_id
decision_id
attempt_id
source_sequence
producer_epoch
```

For fan-out/fan-in flows, record parent sets or equivalent relationship edges.

Rules:
- wall-clock order MUST NOT be treated as causal order when services/runners have independent clocks;
- graph reconstruction prefers explicit causal links and authoritative source sequence;
- late-arriving events may extend a trace without rewriting prior audit history;
- ambiguous causal order is marked `causality_uncertain`;
- promotion-grade attribution may exclude traces where the critical decision→outcome link cannot be established.

## 326. Delayed Reward Credit Assignment

For task classes with delayed outcomes, define which prior decisions may receive credit or blame.

Example:

```text
route decision
→ implementation
→ review
→ deploy
→ defect discovered 3 days later
```

A delayed-outcome contract SHOULD define `reward_horizon`, `eligible_decision_types`, `attribution_method`, `attribution_decay_if_used`, and `finalization_rule`.

The platform MUST NOT automatically attribute every late failure to the most recent learned decision. Where attribution is ambiguous, report episode-level outcome and uncertainty rather than fabricating decision-level causality.

## 327. Seasonality and Temporal Stratification

Policy performance can vary by provider peak/off-peak load, weekday/weekend, monthly quota cycles, release periods, tenant workload cycles, and model/provider rollout periods.

Evaluation SHOULD record relevant temporal strata and avoid comparing baseline/challenger across materially different windows without adjustment.

Canary planning SHOULD include representative operating periods when seasonality is material.

## 328. Missingness Bias Contract

Missing evidence may not be random.

Examples:
- failed jobs emit fewer terminal events;
- offline runners fail before uploading logs;
- expensive branches time out before cost reconciliation;
- users abandon poor results before rating them.

For critical fields/events, identify likely missingness mechanism where practical as `MCAR-like`, `MAR-like`, `MNAR-risk`, or `unknown`.

Promotion reports MUST disclose material missingness and SHOULD perform sensitivity analysis when missing data plausibly correlates with poor outcomes. Missing outcome MUST NOT default to success.

## 329. Action-Space Versioning

A policy is evaluated relative to actions actually available.

Record:

```text
action_space_id
action_space_version
eligible_actions
temporarily_unavailable_actions
policy_allowed_actions
```

If a provider/tool/route is added or removed, create a new action-space version.

Comparisons across action-space versions MUST explicitly state that the opportunity set changed.

A challenger MUST NOT receive credit for choosing an option the baseline was never allowed to access unless the analysis is intentionally evaluating that expanded capability and authorization permits it.

## 330. Common-Population and Eligibility-Denominator Comparison

Success-rate comparisons MUST use a clearly defined denominator.

Reports SHOULD distinguish:
- all requested tasks;
- eligible for baseline;
- eligible for challenger;
- common eligible population;
- actually attempted;
- completed with final outcome.

A challenger cannot claim higher success merely by declining difficult tasks unless task rejection is itself an explicitly allowed optimization objective.

Promotion-grade comparison SHOULD emphasize the common eligible population and separately report changes in eligibility/deferral.

## 331. Treatment Exposure and Dosage Attribution

Policy influence is not always binary.

Record effective treatment details such as `policy_decisions_requested`, `policy_decisions_applied`, `policy_decisions_overridden`, `branches_requested`, `branches_admitted`, `fallback_count`, and `user_override_count`.

A job that received only one of five intended learned decisions is not equivalent to fully compliant treatment.

Evaluation SHOULD report results by exposure class when partial application is common.

## 332. Negative-Control and Placebo Tests

For high-value causal/evaluation pipelines, use negative controls where practical.

Examples:
- a feature available only after the decision should have zero influence in a leakage-safe pipeline;
- shuffled policy assignment should not appear to produce a large systematic treatment effect;
- irrelevant metadata should not materially change evaluator outcome.

A failed negative-control test suggests leakage, confounding, evaluator bias, or implementation error and blocks promotion-grade causal claims until investigated.

## 333. Ownership Transfer and Orphan Governance

Every use case, policy family, evaluator, benchmark suite, and operational component MUST have a current owner.

Ownership states: `active_owner`, `transfer_pending`, `orphaned`, `retired`.

When an owner leaves or changes role:
- transfer responsibility explicitly;
- preserve historical creator/owner attribution;
- revalidate privileged approval rights;
- route alerts/runbooks to the new owner.

An orphaned production policy may continue only for a bounded grace period under designated platform ownership; promotion/expansion is blocked until ownership is restored.

## 334. Tenant and Namespace Migration Contract

Tenant/domain/project migration MUST preserve isolation and lineage without silently merging evidence.

Migration records SHOULD include `source_tenant_id`, `destination_tenant_id`, `migration_id`, `scope`, `effective_at`, `evidence_transfer_policy`, `policy_transfer_policy`, and `artifact_transfer_policy`.

Rules:
- source and destination permissions are revalidated;
- policy/evidence transfer is explicit, not inferred from domain/name similarity;
- transferred evidence retains original provenance;
- tenant-local policies do not automatically become cross-tenant/global policies;
- references are rewritten through controlled migration maps, not ad-hoc ID substitution.

## 335. Secret Reference Indirection

Policies/configuration MUST store secret references, not secret values.

Example:

```text
credential_ref: provider/openai/tenant-123
```

Runtime resolution occurs through the existing authorized secret-management path.

Requirements:
- policy export excludes resolved secret values;
- candidate generation sees only allowed references/metadata;
- rotation does not require policy-version mutation unless semantics change;
- secret reference validity is checked at dispatch;
- replay never resolves production credentials unless an explicitly safe test path requires it.

## 336. Candidate and Evaluation Retention Policy

Search can create thousands of rejected candidates and replay reports.

Define retention classes for promoted candidates, finalists, rejected candidates, invalid candidates, failed replay, and temporary optimizer state.

Preserve enough information to explain promotion/rejection decisions while avoiding unbounded storage.

Compaction MAY retain candidate hash, parent/generation, key metrics, rejection reason, and provenance instead of full bulky artifacts, subject to audit/reproducibility requirements.

## 337. Global Freeze / Unfreeze Protocol

Operators MUST be able to freeze learned influence across a large scope consistently.

Scopes MAY include platform, region, tenant, task family, provider, policy bundle, or maturity level.

Freeze semantics:
- stop new promotions/experiments immediately;
- optionally force baseline-only execution;
- preserve in-flight behavior according to risk/runbook;
- emit activation/freeze epoch;
- audit reason/operator.

Unfreeze is a separate privileged action. Before unfreeze, validate recovery criteria and baseline/policy compatibility.

## 338. Post-Incident Warm-Up Gate

After a major outage, telemetry blackout, provider incident, or rollback, adaptive behavior SHOULD resume gradually.

Suggested sequence:

```text
BASELINE_ONLY
→ observability healthy
→ shadow/replay catch-up
→ limited canary
→ normal active policy
→ optional adaptive mode
```

Warm-up criteria MAY include a minimum fresh telemetry window, reconciled backlog, provider/capability health, no unresolved critical incident, and successful smoke/certification checks.

L6 online adaptation MUST NOT resume solely because a service process restarted.

## 339. Region-Preserving Evidence Replication

When evidence is replicated across regions for DR/analytics:
- residency constraints travel with the data;
- provenance retains original region;
- replication target eligibility is checked;
- encryption/access policy remains appropriate;
- derived datasets inherit the strictest applicable regional restrictions.

A region failover MUST NOT silently make previously region-restricted evidence available to an ineligible evaluator/provider.

## 340. Accounting-Period and Quota-Reset Boundary Model

Daily/monthly quotas and budgets reset on defined boundaries.

Record `accounting_period_id`, `quota_period_id`, `period_start`, `period_end`, `timezone`, and `provider_reset_semantics`.

Evaluation MUST distinguish true policy efficiency from behavior caused by temporary reset/headroom effects.

Scenario tests SHOULD include stressed quota periods where material.

## 341. Context Epoch Contract

User/project/task context can change during long episodes.

Examples:
- user changes cost limit;
- project switches branch;
- tenant disables a provider;
- project permissions change;
- artifact set changes.

Record `context_epoch`, `effective_at`, `changed_fields`, and `source`.

A decision is evaluated against the context epoch active when it was made.

Material context change can invalidate pending advice, approvals, or experiment assignment and may require a new Decision Envelope.

## 342. Governance Invalidation Events

Changes in governance can invalidate ongoing or future learning use.

Examples:
- consent withdrawn;
- provider data policy changes;
- approval expires;
- region restriction changes;
- retention class changes;
- use-case risk tier increases.

Represent these as explicit invalidation events.

Affected operations may stop new data use, cancel external evaluation, freeze promotion, require reapproval, rebuild eligible datasets, or requalify active policy.

The system MUST NOT wait for the next scheduled review if an authoritative invalidation event is known.

## 343. Capability Deprecation Grace and Migration

Capability removal SHOULD support lifecycle states:

```text
active
deprecated
no_new_policy_use
shadow_only
disabled
removed
```

During deprecation:
- block new candidate dependency where configured;
- identify affected active policies;
- recommend compatible replacements;
- replay/shadow migration candidates;
- define final disable date.

Emergency removal can skip grace periods for security/reliability reasons.

Deprecation status is part of policy dependency compatibility.

## 344. Randomness Provenance Contract

Distributed stochastic workflows require more than one seed.

Where reproducibility matters, record when available:

```text
root_random_seed
subseed_derivation_scheme
executor_seed
evaluator_seed
provider_sampling_parameters
scheduler/random-assignment_seed
hardware/runtime_determinism_profile
```

Subseeds SHOULD be deterministically derived from stable identifiers where appropriate so retries do not accidentally alter experiment assignment.

If a provider ignores or does not support seeds, the evidence states this explicitly.

Reproducibility reports distinguish deterministic replay from statistically comparable reruns.

## 345. Revision 11 Acceptance Additions

Where applicable, certification now also requires:
- causal-order reconstruction test;
- delayed-reward attribution test;
- temporal/seasonality robustness report;
- missingness-bias report;
- action-space-version compatibility test;
- common-population denominator check;
- partial-treatment attribution test;
- negative-control/placebo test;
- ownership-transfer/orphan test;
- tenant/namespace migration test;
- secret-reference export/rotation test;
- candidate-retention/compaction test;
- global freeze/unfreeze drill;
- post-incident warm-up drill;
- region-preserving replication test;
- quota/accounting-period boundary test;
- context-epoch invalidation test;
- governance-invalidation event test;
- capability-deprecation migration test;
- distributed-randomness provenance test.

## 346. Revision 11 Completeness Conclusion

Passes 145–164 found twenty further gaps centered on time, evidence comparability, lifecycle transitions, and recovery semantics.

Revision 11 now prevents strong learning claims when:
- causal event order is ambiguous;
- delayed failures are attributed to the wrong decision;
- baseline and challenger ran in incomparable time windows;
- failures are disproportionately missing from telemetry;
- the available action set changed;
- reported success uses a biased denominator;
- canary treatment was only partially applied;
- negative controls reveal leakage/confounding;
- policy ownership is orphaned;
- tenant/context/governance boundaries changed;
- adaptive behavior is restarted too quickly after an incident.

The governing rule is:

> **Evidence is only comparable when its causal order, eligibility, action space, context epoch, treatment exposure, temporal regime, and governance state are known well enough to support the claim being made.**


---

# 347. Revision 12 Executive Amendment — Hybrid Semantic Development Intelligence

Revision 12 makes semantic retrieval a first-class part of Spec 222.

Spec 222 SHALL use a **Hybrid Development Intelligence Retrieval** architecture:

```text
                     SPEC 222 Learning Plane
                              │
             ┌────────────────┼─────────────────┐
             │                │                 │
             ▼                ▼                 ▼
       Structured Store   Discovery Graph   Vector Index
       SQL/PostgreSQL      relationships     semantic similarity
             │                │                 │
             └────────────────┼─────────────────┘
                              ↓
                    Hybrid Retrieval Engine
                              ↓
                 Development Intelligence
                              ↓
            Candidate Strategy / Evidence Bundle
                              ↓
           Spec 224 Development Strategy Resolver
```

The Vector DB is a **retrieval index**, not the source of truth.

Canonical structured facts such as:

```text
trace ownership
tenant
policy version
provider/runtime version
metrics
cost
latency
verification outcome
promotion state
provenance
authorization
replay dataset membership
```

remain in the canonical structured stores.

---

# 348. Why Vector Retrieval Is Required

Exact SQL/task-class lookup is insufficient for Software Factory learning because new projects rarely match historical executions by exact labels.

Examples:

```text
"online course SaaS with subscription + video + AI tutor"

may be semantically similar to:

"membership learning portal with billing + media library + RAG assistant"
```

even when:

```text
task_class
framework tags
user wording
feature names
```

are not identical.

Semantic retrieval SHALL therefore be used to discover:

- similar projects;
- similar requirements;
- analogous architecture decisions;
- similar failure patterns;
- similar successful repair patterns;
- relevant Skills/Workflows/capabilities;
- relevant executor/provider histories;
- relevant development methodologies;
- related evaluation strategies.

---

# 349. Vector DB Is Not a Replacement for Existing Stores

Required storage roles:

```text
PostgreSQL / canonical SQL
  → exact facts, ownership, policy, metrics, provenance, lifecycle

Object Storage / R2
  → large immutable artifacts, logs, evidence, replay payloads

Discovery Graph Store
  → explicit causal and relational topology

Vector DB
  → semantic similarity / candidate discovery

Skill/Capability Registry
  → authoritative capability contracts and permissions
```

A vector match MUST NOT itself authorize:

```text
Skill use
provider use
cross-tenant access
network access
secret access
deployment
production mutation
```

Authorization remains external and deterministic.

---

# 350. Reuse Existing SmartAIHub Embedding Infrastructure

SmartAIHub already embeds Skills/capabilities for semantic discovery.

Spec 222 SHOULD reuse the same governed embedding infrastructure where compatible:

```text
Embedding Service
EmbeddingModelRegistry
IndexVersion
EmbeddingVersion
DocumentNormalizer
Redaction Pipeline
Vector Index Router
```

Do not create an unrelated embedding stack solely for Spec 222.

However, Skill vectors and learning/evidence vectors SHOULD remain logically separable because they have different:

```text
retention
privacy
tenant scope
refresh cadence
metadata
ranking features
quality semantics
```

---

# 351. Recommended Logical Vector Collections

At minimum define logical collections:

```text
capability_skill_index
development_project_pattern_index
development_episode_index
failure_pattern_index
repair_pattern_index
methodology_pattern_index
evaluation_pattern_index
```

Physical deployment MAY combine collections when:

```text
same embedding model
same dimensions
same retention/security class
same scaling characteristics
```

provided logical isolation and filtering remain provable.

---

# 352. Development Project Pattern Document

A sanitized `DevelopmentProjectPatternDocument` SHOULD capture:

```yaml
project_pattern_id:
tenant_scope:
source_project_ref:
project_class:
artifact_class:
business_domain_tags:
requirement_summary:
architecture_summary:
frontend_stack:
backend_stack:
database_stack:
deployment_targets:
capability_requirements:
security_class:
complexity_bucket:
successful_strategy_refs:
failure_strategy_refs:
verification_profile:
outcome_summary:
freshness_epoch:
embedding_model:
embedding_version:
source_digest:
```

Do NOT embed raw private source trees by default.

Prefer normalized summaries and immutable references.

---

# 353. Development Episode Embedding

A `DevelopmentEpisodeDocument` SHOULD summarize one bounded development episode:

```text
goal/requirement class
initial strategy
executor/harness
placement
methodology
capabilities used
failure fingerprints
repairs attempted
final outcome
verification result
cost/latency
human intervention
```

The vector represents semantic development context.

Structured metrics remain outside the embedding and are joined after retrieval.

---

# 354. Failure and Repair Embeddings

Failure retrieval is a first-class use case.

Example:

```text
current failure:
OAuth redirect succeeds but callback session state mismatches

vector retrieval:
→ prior OAuth callback/state failures
→ successful repair patterns
→ executor histories
→ framework/version compatibility
```

Failure/repair documents SHOULD include:

```text
failure_family
normalized_error_summary
environment fingerprint
framework/runtime class
triggering operation
root-cause category if verified
repair summary
repair outcome
regression outcome
freshness
```

Raw secrets, tokens and sensitive logs SHALL NOT be embedded.

---

# 355. Skill and Capability Semantic Join

When Spec 224 asks:

```text
"What capabilities can help build this product?"
```

Spec 222/Capability Resolver MAY combine:

```text
project-pattern retrieval
+
Skill vector search
+
Workflow/capability search
```

to produce:

```text
CandidateCapabilitySet
```

Each candidate SHALL be resolved back to the authoritative Capability Registry before use.

Vector index results SHALL contain stable refs such as:

```text
capability_id
skill_id
workflow_id
version/ref
```

rather than becoming capability definitions themselves.

---

# 356. Hybrid Retrieval Pipeline

Recommended retrieval:

```text
1. Normalize current development request
2. Resolve hard constraints
3. Establish tenant/security scope
4. Build semantic query representation
5. Vector search for semantic candidates
6. Exact/structured filtering
7. Graph expansion over explicit relationships
8. Join live capability/provider/version status
9. Re-rank
10. Diversity/de-duplication
11. Build evidence-backed StrategyCandidateSet
```

Vector similarity SHALL NOT be the final ranking score.

---

# 357. Hard Filter Before Learned Ranking

Hard constraints include:

```text
tenant boundary
authorization
data residency
project/runtime compatibility
provider certification
revocation
required operating system
required hardware
budget ceiling
user-forced provider
deployment target
safety/security profile
freshness minimum where mandatory
```

Candidates failing hard constraints are removed before strategy selection.

---

# 358. Hybrid Ranking Model

An illustrative ranking model:

```text
CandidateScore =
    semantic_similarity
  × evidence_quality
  × context_similarity
  × freshness_weight
  × compatibility_weight
  × certification_weight
  × observed_success_weight
  × evaluator_confidence
```

with separate penalties for:

```text
cost
latency
human-intervention history
failure recurrence
provider instability
weak evidence coverage
```

This formula is conceptual; production weights SHALL be versioned and evaluated under Spec 222.

---

# 359. Similarity Is Advisory Evidence

A semantically similar historical project does not prove causal suitability.

Every retrieval result SHALL distinguish:

```text
SEMANTIC_ANALOGY
STRUCTURAL_MATCH
OBSERVED_SAME_CLASS
CAUSAL_EVIDENCE
EXPERIMENTAL_EVIDENCE
```

Vector proximity alone is:

```text
SEMANTIC_ANALOGY
```

until joined with stronger evidence.

---

# 360. Current-Project Retrieval vs Cross-Project Retrieval

Two retrieval scopes SHALL be distinguished:

```text
PROJECT_LOCAL
TENANT_CROSS_PROJECT
PLATFORM_SANITIZED_GLOBAL
```

`PROJECT_LOCAL`
- exact project history;
- highest permission continuity.

`TENANT_CROSS_PROJECT`
- reuse experience across projects owned by the same authorized tenant.

`PLATFORM_SANITIZED_GLOBAL`
- only explicitly eligible, sanitized, governance-approved aggregate patterns.

Cross-tenant private trace retrieval remains forbidden.

---

# 361. Vector Namespace / Partition Policy

Vector storage SHALL be logically partitioned by security scope.

Recommended abstract key:

```text
security_scope
tenant_scope
knowledge_class
embedding_version
```

Implementation MAY use:

```text
physical indexes
namespaces
metadata filters
```

or a combination.

No query may depend only on vector similarity to enforce tenant isolation.

---

# 362. Metadata Filtering Contract

Vector records SHOULD expose filterable metadata such as:

```text
tenant_id or scope_id
knowledge_class
project_class
artifact_class
framework_family
language_family
risk_class
outcome_status
provider_family
executor_family
placement_class
verification_status
freshness_epoch
embedding_version
```

The implementation SHALL design metadata indexes before large-scale ingestion where the selected vector backend requires pre-created filter fields.

---

# 363. Embedding Versioning and Re-Embedding

Every embedded document SHALL record:

```text
embedding_model
embedding_model_version
dimensions
normalization_version
redaction_version
embedding_created_at
source_digest
```

When the embedding model changes:

```text
old index remains readable
new index is built
shadow retrieval compares quality
migration is measured
cutover is explicit
old index is retired only after acceptance
```

Never silently mix incompatible vector dimensions/models.

---

# 364. Semantic Retrieval Evaluation

Retrieval quality SHALL be measured independently from downstream development success.

Minimum retrieval metrics:

```text
Recall@K
Precision@K
MRR/NDCG where appropriate
relevant-project retrieval rate
relevant-skill retrieval rate
failure-pattern hit rate
stale-result rate
unauthorized-result rate = 0
duplicate/diversity rate
latency
embedding/index cost
```

Downstream metrics:

```text
time to verified completion
failed iteration reduction
executor switch reduction
token savings
cost savings
human intervention reduction
Final Verify success
```

---

# 365. Query Construction

The semantic query SHOULD be created from a structured Development Situation rather than raw user text alone.

Example:

```yaml
goal_summary:
project_class:
artifact_class:
required_capabilities:
current_stack:
deployment_target:
constraints:
current_phase:
failure_summary:
attempt_history_summary:
```

This improves retrieval stability and reduces irrelevant nearest neighbors.

---

# 366. Multi-Vector Representation

A project MAY have separate embeddings for:

```text
requirements
architecture
UI/product description
failure history
execution strategy
verification/evaluation
```

rather than one oversized embedding.

The retrieval engine chooses the appropriate representation by query intent.

Example:

```text
architecture selection
→ requirement + architecture vectors

debugging
→ failure + environment vectors

capability discovery
→ requirement + capability vectors
```

---

# 367. Vector Search Is Especially Valuable Before First Run

For a brand-new SoftwareProject with no local history:

```text
new request
  ↓
semantic project-pattern retrieval
  ↓
historically similar development episodes
  ↓
Skill/capability retrieval
  ↓
candidate architectures/executors/methodologies
  ↓
Spec 222 evidence scoring
  ↓
Spec 224 Strategy Resolver
```

This allows prior platform experience to improve the first development attempt.

---

# 368. Retrieval During Recovery

When a DevelopmentRun fails, retrieval SHALL be repeatable using the new evidence:

```text
original requirement
+
current candidate state
+
new failure fingerprint
+
attempt history
```

The resulting strategy may differ from initial planning.

Example:

```text
Native Agent failed twice
→ retrieve similar failure episodes
→ evidence favors Codex for this failure class
→ Spec 224 may hand off to Codex
```

Spec 222 recommends; Spec 224 remains execution authority.

---

# 369. Retrieval During Architecture Selection

Spec 222 MAY advise:

```text
framework
database
deployment target
capability composition
provider/harness
verification profile
```

only when these dimensions are explicitly registered as learnable for the use case.

Hard architectural constraints remain non-learnable.

---

# 370. Retrieval During Skill Reuse

The Software Factory SHALL use:

```text
SEARCH
→ REUSE
→ COMPOSE
→ EXTEND
→ CREATE NEW
```

Spec 222 MAY improve SEARCH and ranking using historical development evidence.

It SHALL NOT automatically create a new Skill merely because retrieval confidence is low.

A new Skill request goes through Spec 221.

---

# 371. Vectorized Capability Experience

In addition to the Skill's own semantic embedding, Spec 222 SHOULD maintain a separate experience representation:

```text
Skill semantics
  ≠
Skill experience
```

Example:

```text
Skill semantic vector:
"Generate 9:16 product video from images"

Skill experience:
works well for food products
higher failure rate with long Thai dialogue
average cost
best provider route
known fallback
```

The first answers:

```text
"What can this Skill do?"
```

The second helps answer:

```text
"Is this Skill a good choice for this situation?"
```

---

# 372. Skill Embedding Join Contract

Recommended flow:

```text
Capability semantic retrieval
       ↓
candidate Skill IDs
       ↓
Spec 222 experience retrieval
       ↓
live Capability Registry
       ↓
ACL / tenant / health / version
       ↓
ranked eligible capabilities
```

Do not duplicate Skill authority into Spec 222.

---

# 373. Development Intelligence Retrieval API

Recommended advisory API:

```text
POST /internal/learning/development-intelligence/query
```

Input:

```json
{
  "tenantScope": "...",
  "projectRef": "...",
  "intent": "architecture|capability|executor|methodology|failure_recovery",
  "developmentSituationRef": "...",
  "topK": 20,
  "freshnessPolicyRef": "...",
  "securityScopeRef": "..."
}
```

Output:

```json
{
  "queryId": "...",
  "candidates": [
    {
      "candidateRef": "...",
      "knowledgeClass": "...",
      "semanticSimilarity": 0.0,
      "evidenceStrength": "...",
      "freshness": "...",
      "supportingTraceRefs": [],
      "applicabilityConstraints": [],
      "reasonCodes": []
    }
  ]
}
```

The API is advisory and returns no credentials.

---

# 374. Development Intelligence Bundle for Spec 224

Spec 222 SHALL be able to produce:

```text
DevelopmentIntelligenceBundle
```

containing:

```text
similar_project_patterns
recommended_capabilities
candidate_architectures
candidate_executor_strategies
candidate_methodologies
known_failure_patterns
known_repair_patterns
relevant_cost/latency evidence
freshness
uncertainty
OOD score
provenance refs
```

Spec 224 consumes this bundle during strategy planning.

---

# 375. OOD / Unknown-Task Protection

A vector database always returns nearest neighbors even when none are truly relevant.

Therefore Spec 222 SHALL detect:

```text
low similarity
low evidence support
high distribution shift
unseen required capabilities
unseen platform/runtime combination
```

and return:

```text
INSUFFICIENT_ANALOGOUS_EVIDENCE
```

rather than inventing confidence.

In this state Spec 224 may:

```text
use deterministic baseline
research/explore
run bounded multi-path experiment
ask user only if genuine business ambiguity exists
```

---

# 376. Freshness and Technology Drift

Historical semantic similarity MUST be combined with freshness.

Examples causing evidence decay:

```text
framework major release
provider model upgrade
harness version change
API deprecation
pricing change
Cloudflare/runtime behavior change
security incident/revocation
Skill major version
```

Freshness policy SHALL be dimension-specific.

Old evidence may remain useful as analogy while losing promotion-grade weight.

---

# 377. Privacy and Redaction for Embeddings

Embedding is data processing.

Before embedding:

```text
remove secrets
remove credentials
remove access tokens
remove private chain-of-thought
remove unnecessary personal information
normalize private identifiers
replace source/artifact bodies with refs when possible
```

Where source code is required for a specific approved use case, it SHALL have explicit data classification and retention policy.

Default cross-project learning uses sanitized summaries, not raw code.

---

# 378. Vector Poisoning and Retrieval Manipulation

Spec 222 SHALL defend against:

```text
malicious project text
prompt injection in logs
fake success summaries
forged evaluator output
duplicated spam traces
metric gaming
adversarial embedding content
```

Only eligible normalized evidence enters the trusted learning index.

Vector results inherit the trust classification of their source.

---

# 379. Provenance Backlink Requirement

Every vector record SHALL resolve to canonical provenance:

```text
vector_id
→ semantic_document_id
→ source trace/project/policy/capability refs
→ source digest/version
```

A vector without resolvable provenance cannot support production policy promotion.

---

# 380. Deletion and Re-Embedding Propagation

When source evidence is deleted, revoked or privacy-invalidated:

```text
canonical source invalidated
→ vector tombstone
→ index deletion
→ cache invalidation
→ candidate policies referencing it marked for requalification
```

Vector deletion lag SHALL be monitored.

---

# 381. Candidate Retrieval Cache

Semantic candidate search MAY be cached when:

```text
query digest
security scope
tenant
embedding version
metadata-filter version
knowledge epoch
```

match.

Cache MUST invalidate on:

```text
capability revocation
policy epoch change
tenant permission change
embedding migration
critical freshness trigger
```

---

# 382. Vector Backend Abstraction

Spec 222 SHALL define:

```ts
interface SemanticIndexBackend {
  upsert(records: SemanticRecord[]): Promise<MutationRef>;
  delete(ids: string[], scope: SemanticScope): Promise<void>;
  query(input: SemanticQuery): Promise<SemanticMatch[]>;
  health(): Promise<SemanticIndexHealth>;
}
```

Initial backend MAY be:

```text
Cloudflare Vectorize
```

Future options MAY include:

```text
pgvector
managed vector DB
other certified vector services
```

Spec 222 SHALL not bind its semantic contract permanently to one vendor.

---

# 383. Cloudflare Vectorize Initial Profile

Given SmartAIHub's Cloudflare architecture and existing Skill embedding direction, Cloudflare Vectorize is a suitable initial backend.

The adapter SHOULD use:

```text
namespace/partition filtering
metadata filtering
versioned vector IDs
immutable provenance refs
```

and SHALL model backend limits explicitly.

Vectorize remains an index; PostgreSQL/object storage remain canonical evidence stores.

---

# 384. Index Topology Recommendation

Recommended starting topology:

```text
Index A — capability-skills
  existing Skill/capability semantic index

Index B — development-intelligence
  project patterns
  development episodes
  methodology/evaluation patterns

Index C — failure-repair-intelligence
  failure fingerprints
  verified repair patterns
```

This is preferable to placing every knowledge class into one index on day one.

Indexes MAY later be consolidated only after empirical evaluation.

---

# 385. Tenant Isolation Strategy

Recommended:

```text
platform/public sanitized knowledge
→ separate shared index/partition

private tenant learning
→ tenant-scoped namespace/partition/index according to scale

project-local sensitive knowledge
→ project/tenant constrained scope
```

The query layer MUST supply tenant/security scope server-side.

The model/harness cannot choose another tenant namespace.

---

# 386. Graph + Vector Combined Retrieval

Some questions require explicit relationships, not similarity.

Example:

```text
Which repair followed this exact failure
and later passed regression?
```

Use:

```text
vector retrieval
→ find analogous failure nodes
→ graph expansion
→ repairs
→ verification outcomes
```

Conversely:

```text
Which projects are conceptually similar?
```

starts with vector retrieval.

The two stores are complementary.

---

# 387. SQL + Vector Combined Retrieval

SQL remains preferable for:

```text
provider = Codex
version = X
final_verify = PASS
cost < limit
date > cutoff
tenant = current
```

Vector is preferable for:

```text
similar task
similar product
similar failure
similar architecture problem
```

Hybrid queries SHALL combine both rather than forcing one storage technology to solve both problems.

---

# 388. Search Quality A/B Evaluation

Spec 222 SHALL compare:

```text
SQL/tag-only retrieval
vs
vector-only retrieval
vs
hybrid retrieval
```

using sealed relevance datasets.

The Vector DB is promoted as default for a retrieval intent only when it measurably improves relevant retrieval without violating cost/latency/security gates.

---

# 389. Vector Retrieval Cost Budget

Embedding/index/query cost SHALL be included in Spec 222 economics:

```text
embedding generation
re-embedding
vector storage
queries
metadata/index maintenance
retrieval re-ranking
```

The system SHOULD avoid embedding low-value ephemeral data that will never be reused.

---

# 390. Revision 12 Cross-Spec Contract with Spec 224

Spec 224 SHALL call Spec 222 for **development intelligence**, not raw vector search.

Forbidden:

```text
Development Agent
→ direct arbitrary Vectorize query
```

Required:

```text
Spec 224 Strategy Resolver
→ Development Intelligence API
→ Spec 222 Hybrid Retrieval
→ evidence-backed candidates
```

This preserves governance and hides backend-specific details.

---

# 391. Revision 12 Cross-Spec Contract with Spec 220

Spec 220 remains authoritative for:

```text
data access
asset access
Skill/capability access
API/MCP authorization
tenant isolation
```

Spec 222 retrieval cannot widen these rights.

Any retrieved capability is revalidated through Spec 220/Capability Gateway before use.

---

# 392. Revision 12 Cross-Spec Contract with Spec 221

Spec 222 may discover:

```text
existing Skill is suitable
existing Skill performs poorly for this class
no existing Skill covers requirement
```

But:

```text
new Skill
Skill modification
Skill publication
```

remains governed by Spec 221.

Spec 222 provides evidence/proposal only.

---

# 393. Revision 12 Software Factory Feedback Loop

Target loop:

```text
Existing Skills + Capabilities
        ↓
Semantic Capability Index
        │
        ├──────────────┐
        ↓              ↓
Software Factory    Spec 222 History
        ↓              ↓
DevelopmentRun → traces/outcomes
        │              ↓
        └──────→ Hybrid Development Intelligence
                       ↓
              better architecture
              better Skill reuse
              better executor choice
              better methodology
              better recovery
                       ↓
                future DevelopmentRun
```

The platform improves from repeated verified experience without requiring foundation-model fine-tuning.

---

# 394. Revision 12 Acceptance Additions

Production readiness now additionally requires:

- [ ] Vector DB is explicitly non-authoritative.
- [ ] Hybrid SQL + graph + vector retrieval contract exists.
- [ ] Existing Skill embedding infrastructure is reused where compatible.
- [ ] Skill semantic vectors and Skill experience data are distinguishable.
- [ ] Tenant/security scope is enforced outside model control.
- [ ] Project-pattern embeddings exist.
- [ ] Development episode embeddings exist.
- [ ] Failure/repair embeddings exist.
- [ ] Every vector has canonical provenance backlinks.
- [ ] Embedding version migration is supported.
- [ ] Vector deletion follows source deletion/revocation.
- [ ] OOD/low-support protection prevents false confidence.
- [ ] Freshness weighting handles technology/provider drift.
- [ ] Vector poisoning defenses exist.
- [ ] SQL-only vs vector-only vs hybrid retrieval is benchmarked.
- [ ] Development Intelligence API hides vector backend details from Spec 224.
- [ ] Retrieved Skills/capabilities are revalidated through authoritative registry/policy.
- [ ] Retrieval cost is included in use-case ROI.

---

# 395. Revision 12 Conclusion

Spec 222 SHALL use Vector DB as a first-class semantic retrieval mechanism because the value of accumulated development history depends on finding **analogous**, not merely identically tagged, prior experience.

The governing architecture is:

```text
Vector DB finds what looks similar.
SQL tells what is exactly true.
Discovery Graph tells how evidence is related.
Spec 222 evaluates whether the evidence is applicable.
Spec 224 decides what development strategy to execute.
Spec 220 decides what the caller is allowed to access.
```

This separation is mandatory.



---

# 396. Revision 13 Executive Amendment — Harness / Model / Provider Intelligence

Revision 13 separates the performance identity of:

```text
Harness
Model
Provider
Placement
Role
```

for learning and strategy optimization.

Spec 222 SHALL NOT store or learn only:

```text
"hermes succeeded"
```

when the real route was:

```text
Hermes
+ Qwen model
+ Alibaba provider
+ Cloud Container
+ IMPLEMENTER role
```

---

# 397. Canonical Model Experience Key

Recommended key:

```text
harness_family
harness_version
adapter_version
provider_family
provider_endpoint_class
model_id
model_revision
model_role
phase
project_class
placement_class
tool_profile
protocol_pack_version
```

Metrics and evidence SHALL attach to this identity at the most specific available level.

---

# 398. Hierarchical Aggregation

Spec 222 MAY aggregate evidence:

```text
model family
provider family
harness family
project family
phase family
```

but SHALL preserve raw lower-level dimensions.

This enables:

```text
Hermes overall
Hermes + Qwen
Hermes + Qwen + IMPLEMENT
Hermes + Qwen + IMPLEMENT + Next.js
```

without losing detail.

---

# 399. Confounding Protection

Strategy learning SHALL avoid attributing a failure to the wrong dimension.

Examples:

```text
provider outage
≠ model reasoning failure

Runner disconnect
≠ Hermes failure

bad Protocol Pack
≠ Qwen failure

insufficient tool permission
≠ model incapability
```

Each episode SHALL classify likely failure owner(s).

---

# 400. Failure Attribution Contract

Recommended:

```ts
interface DevelopmentFailureAttribution {
  failureId: string;
  primaryClass:
    | "HARNESS"
    | "MODEL"
    | "PROVIDER_TRANSPORT"
    | "PLACEMENT"
    | "TOOL"
    | "PROTOCOL"
    | "PROJECT"
    | "POLICY"
    | "UNKNOWN";
  contributingClasses: string[];
  confidence: number;
  evidenceRefs: string[];
}
```

Low-confidence attribution SHALL not strongly update model/harness ranking.

---

# 401. Model Role Experience

Spec 222 SHALL learn model suitability by role.

Examples:

```text
strong planner
strong implementer
strong debugger
strong reviewer
good vision model
cheap summarizer
reliable structured-output model
```

A model strong in one role MUST NOT be assumed strong in all roles.

---

# 402. Hermes Model Matrix

Spec 222 SHOULD maintain an evidence-driven Hermes model matrix.

Example dimensions:

```text
Provider / model
Tool-call reliability
Schema adherence
Coding success
Debug success
Review quality
Thai instruction following
Context stability
Cost
Latency
Failure rate
```

This matrix is derived from SmartAIHub evidence, not marketing claims.

---

# 403. Chinese / Open Model Qualification Dataset

Maintain evaluation sets covering:

```text
TypeScript/React
Python
backend/API
database/migration
Cloudflare
debugging
review
security
Thai-language requirements
mixed Thai/English requirements
tool-heavy tasks
long-context repositories
MCP/Skill use
```

Provider/model onboarding SHALL run the relevant subset before production eligibility.

---

# 404. New Model Fast-Track

A new model reachable through Hermes MAY enter:

```text
OBSERVATION
→ REPLAY
→ SANDBOX BENCHMARK
→ SHADOW
→ LIMITED CANARY
→ QUALIFIED
```

without requiring a new harness implementation.

It cannot skip policy/certification stages solely because the API is OpenAI-compatible.

---

# 405. Model Freshness Epoch

Create:

```text
model_freshness_epoch
```

which changes when:

```text
model revision changes
provider silently upgrades alias
provider serving behavior changes materially
tool-call behavior changes
endpoint routing changes
```

Evidence from earlier epochs is down-weighted or requalified.

---

# 406. Resolved Model Identity

When a provider alias resolves dynamically, traces SHOULD capture:

```text
requested_model
resolved_model
provider
endpoint
resolution_time
catalog/version info if available
```

Unknown resolved identity lowers evidence reproducibility.

---

# 407. Local Model Experience

For self-hosted/local inference, learning keys SHOULD include:

```text
model/weights revision
quantization
serving runtime
serving runtime version
GPU/hardware class
context configuration
```

A result from a 4-bit quantized local model SHALL not be blindly generalized to a different serving configuration.

---

# 408. Multi-Model Episode

One DevelopmentRun may use multiple models.

Spec 222 SHALL represent:

```text
Episode
  ├ PLANNER route
  ├ IMPLEMENTER route
  ├ DEBUGGER route
  ├ SUBAGENT routes
  └ REVIEWER route
```

Outcome attribution SHOULD be phase/role specific where possible.

---

# 409. Model Combination Intelligence

Spec 222 MAY learn that combinations outperform one-model strategies.

Examples:

```text
Claude planning + Qwen implementation
Codex implementation + Claude review
Native routing + Hermes cheap workers
Hermes GLM debug + independent reviewer
```

Combination learning MUST include incremental cost and integration overhead.

---

# 410. Subagent Cost Accounting

When Hermes or another harness uses child agents, cost attribution SHALL capture:

```text
parent model cost
child model cost
parallelism
task result
integration/rework cost
```

A cheap child model is not considered economical if it creates expensive parent rework.

---

# 411. Internal Harness Fallback Evidence

If Hermes changes provider/model internally, record the route sequence:

```text
Route A
→ failure reason
→ Route B
→ outcome
```

Spec 222 MAY learn fallback effectiveness only when transitions are observable.

Unobserved hidden fallback SHALL be excluded from high-confidence causal learning.

---

# 412. Harness Skill/Tool Profile Dimension

A model outcome also depends on which tools/Skills were exposed.

Therefore experience keys SHOULD include:

```text
ToolProfile
Protocol Pack
Methodology Skill set
MCP surface profile
```

where materially relevant.

---

# 413. Vector Index — Model/Harness Experience

Spec 222 Revision 12 vector architecture SHALL add logical knowledge class:

```text
model_harness_experience_index
```

Documents MAY represent:

```text
task context
phase
project stack
harness
provider/model
tool profile
observed strengths
failure modes
cost/latency
verification outcome
freshness
```

Vector similarity finds analogous situations; SQL retains exact metrics.

---

# 414. Model Experience Retrieval Intent

Add intent:

```text
MODEL_HARNESS_SELECTION
```

Development Intelligence may return:

```text
candidate harness/model/provider combinations
supporting episodes
role suitability
freshness
confidence
cost/latency ranges
known failure modes
```

Spec 224 remains final strategy authority.

---

# 415. Anti-Winner-Take-All Model Policy

Spec 222 SHOULD monitor concentration:

```text
one model used for nearly all work
one provider dominates despite weak evidence
```

For eligible low-risk exploration, bounded diversity MAY test new models.

This cannot override hard quality/security requirements.

---

# 416. Provider Availability vs Model Quality

Selection policy SHOULD separately model:

```text
ModelQualityScore
ProviderReliabilityScore
HarnessReliabilityScore
PlacementReliabilityScore
```

A strong model on an unreliable route may be inferior in end-to-end expected utility.

---

# 417. Economic Model for Multi-Model Harnesses

Cost SHALL include:

```text
model API
provider markup
harness overhead
subagent calls
fallback calls
context compression
review/rework
Runner/container compute
```

A provider that appears cheap per token can still be expensive per verified outcome.

---

# 418. Verification-Qualified Outcome

Model/harness ranking SHOULD prefer:

```text
Cost per Verified Outcome
```

over:

```text
Cost per Attempt
```

for development use cases.

This aligns learning with Spec 224 Final Verify.

---

# 419. No Cross-Tenant Secret Model Learning

Model/harness performance learning MAY aggregate sanitized metrics only under approved scope.

Do not embed or transfer:

```text
private source
private prompts
secrets
customer-specific architecture
```

across tenant boundaries without explicit governed eligibility.

---

# 420. Revision 13 Cross-Spec Contract with Spec 224

Spec 222 returns advisory evidence at:

```text
Harness × Model × Provider × Role × Phase × Project Class × Placement
```

Spec 224 then evaluates:

```text
live certification
current availability
policy
budget
data residency
user preference
```

before dispatch.

---

# 421. Revision 13 Acceptance Additions

- [ ] Harness/model/provider identities are separate.
- [ ] Failure attribution prevents provider outages from poisoning model scores.
- [ ] Model role experience is stored.
- [ ] Chinese/open/local model qualification corpus exists.
- [ ] New Hermes-reachable models can be sandbox-qualified without new harness code.
- [ ] Model freshness epoch exists.
- [ ] Dynamic alias resolution is logged.
- [ ] Local-model serving fingerprint is stored.
- [ ] Multi-model episodes are represented.
- [ ] Subagent cost/rework attribution exists.
- [ ] Internal fallback routes are observable.
- [ ] Tool/Skill profile is part of relevant experience keys.
- [ ] Model/harness vector experience index exists.
- [ ] `MODEL_HARNESS_SELECTION` retrieval intent exists.
- [ ] Cost per verified outcome is measured.

---

# 422. Revision 13 Conclusion

Hermes increases the value of Spec 222 because it creates a controlled way to evaluate many inference models through one broadly capable harness.

The Learning Plane SHALL exploit this diversity without confusing:

```text
harness quality
model quality
provider reliability
placement reliability
tool/protocol quality
```

The platform goal is not to crown one permanent best model.

The goal is to learn which verified combination works best for the current task, role, environment, policy and budget.



---

# 423. Revision 14 Executive Amendment — Persistent Cloud Agent Intelligence

Spec 222 SHALL treat persistent managed cloud agents as a distinct experience class.

Examples include:

```text
Grok Bot managed cloud computer
Hermes Bot/Profile on remote/cloud backend
future persistent cloud agents
```

Learning SHALL distinguish persistent-agent effects from model/harness effects.

---

# 424. Persistent Agent Experience Key

Recommended dimensions:

```text
agent_product
agent_profile_class
vendor
execution_location
cloud_computer_class
account/computer isolation class
profile age
project affinity
memory freshness
workspace freshness
skill set
routine set
role
task class
phase
verification outcome
```

---

# 425. Persistence Benefit Metrics

Track:

```text
setup time saved
authentication/setup reuse
project-context reuse
time to resume
successful unattended completion
human check-in frequency
handoff success
```

These quantify the benefit of an always-on persistent agent.

---

# 426. Persistence Risk Metrics

Track:

```text
stale-memory incidents
stale-workspace incidents
cross-project contamination
shared-credential incidents
incorrect assumption from old context
untracked mutation
correlated-review errors
```

Persistent context SHALL not be treated as universally beneficial.

---

# 427. Managed Cloud Continuity Metric

Define:

```text
offline_completion_rate
```

as the fraction of eligible tasks that continue and reach a valid terminal/reconcilable state while the user's local device is unavailable.

This is a distinct value metric for products such as Grok Bot.

---

# 428. Persistent vs Ephemeral Experiment

Spec 222 SHOULD run matched evaluations:

```text
persistent specialist
vs
fresh-session agent
```

with equivalent model/tool access where possible.

Measure:

```text
quality
time
cost
human intervention
context/setup overhead
regression
independence
```

---

# 429. Memory Provenance

Persistent agent memory used in strategy evidence SHALL include provenance class.

Unverified self-written memory cannot be promoted to platform truth merely because it persisted for a long time.

---

# 430. Vendor-Learned Skills and Routines

When Grok Bot or another persistent agent learns:

```text
Skill
Routine
workflow
```

Spec 222 MAY ingest a sanitized description and outcome evidence.

Promotion to SmartAIHub Skill/Methodology remains governed by Spec 221 and relevant protocol ownership.

---

# 431. Shared-Computer Confounder

For systems where several Bots share one persistent computer, learning SHALL record this because:

```text
success may depend on shared login/session/files
failure may arise from cross-Bot interference
```

A result SHALL not be generalized to an isolated executor without accounting for this environment difference.

---

# 432. Grok Bot Experience Retrieval

Add knowledge class:

```text
managed_persistent_agent_experience
```

Semantic documents MAY include:

```text
task class
role
persistent-state benefit
workspace age
browser/session requirements
offline execution
known contamination risks
verification outcome
```

---

# 433. Executor Selection Intent Extension

`MODEL_HARNESS_SELECTION` SHALL be complemented by:

```text
EXECUTION_ENVIRONMENT_SELECTION
```

which may compare:

```text
Local Runner
SmartAIHub Cloud Container
Grok Bot managed cloud computer
other persistent cloud agent
```

using evidence and policy.

---

# 434. Always-On Value Is Not Quality Evidence

The fact that an agent can continue while the user's device is offline is an execution-availability advantage.

It SHALL NOT be conflated with:

```text
coding quality
reasoning quality
security quality
review independence
```

Spec 222 learns these dimensions separately.

---

# 435. Revision 14 Acceptance Additions

- [ ] Managed persistent cloud agents are a distinct learning class.
- [ ] Offline completion rate is measured.
- [ ] Persistent-vs-fresh benchmark exists.
- [ ] Memory freshness and provenance are modeled.
- [ ] Workspace freshness is modeled.
- [ ] Shared-computer contamination is modeled.
- [ ] Vendor-local Skills/Routines remain non-authoritative.
- [ ] Execution environment selection is separated from model/harness selection.
- [ ] Always-on availability is not conflated with quality.

---

# 436. Revision 14 Conclusion

Persistent cloud agents add a new optimization dimension to SmartAIHub:

```text
Who reasons?
+
Where execution lives?
+
How much state persists?
+
Can work continue without the user's device?
```

Spec 222 SHALL learn the value and risks of these dimensions independently, then provide evidence to Spec 224 rather than treating persistence as inherently better.

---

## 196. Device/Surface Independence and Attention-Outcome Learning Amendment

**Implementation timing:** Spec 222 had not been implemented when Spec 225/226 were introduced; these constraints are part of the initial implementation.

Spec 222 MAY learn from cross-device execution evidence, but it MUST treat control surface and notification transport as context features rather than hidden causal truth.

Permitted context dimensions include:

```text
origin_surface
available_interaction_capabilities
execution_target_class
attention_type
notification_channel_class
human_response_latency_bucket
handoff_required
handoff_success/failure
```

The learning layer MUST NOT promote a policy that:

- routes sensitive content to a weaker notification channel merely to improve response time;
- bypasses approvals because a mobile user usually approves them;
- interprets notification non-open as user rejection;
- assumes phone availability from historical behavior;
- lowers Browser/Computer Use safeguards to reduce handoff latency;
- creates device-specific execution semantics where Spec 225/226 define a control-surface abstraction.

Attention/notification delivery metrics may optimize **when/how to contact the user**, subject to policy, but canonical job success remains determined by the underlying source system.

---

# Revision 16 — Canonical Numbering, Agentic Fabric Separation & Kimi Evidence Alignment

## 16.1 Canonical Numbering Decision

`Spec 222` SHALL canonically mean only the **Self-Improving Exploration Layer / Learning Plane**.

The earlier independent document titled `Spec 222 — SmartAIHub Agentic Development Fabric` is renumbered to **Spec 230**. This is a numbering correction, not a semantic merge.

```text
Spec 222 = learn/replay/evaluate/rank/advisory
Spec 230 = prepare harness/context/methodology/repository engineering profile
Spec 224 = execute durable development lifecycle and certify finality
```

Spec 222 MUST NOT own `RepositoryEngineeringProfile`, provider protocol materialization, project instruction generation or harness bootstrap.

## 16.2 Kimi Code Learning Dimensions

When Kimi Code participates in a verified development run, normalized outcome evidence SHOULD distinguish at least:

```text
harness_family = KIMI_CODE
kimi_code_version
surface = CLI | WEB | DESKTOP | SERVER_API
transport_contract_version / live API fingerprint where applicable
model/provider/thinking mode
permission mode
plan mode
swarm mode
goal mode
selected Skill/profile digest
MCP/plugin capability fingerprint
placement / Runner identity
phase / WorkPackage / AuditLens role
verified outcome and cost/latency where available
```

Kimi Code Desktop UI telemetry is not trusted as lifecycle truth. Spec 222 learns only from normalized SmartAIHub evidence and certified adapter observations.
---

# Revision 16C — Canonical Retrieval Dependency on Spec 229

The Self-Improving Exploration Layer owns replay, evaluation, discovery graphs, strategy evidence and safe learned-policy promotion. It **does not own the production vector/search data plane**.

All production semantic retrieval, nearest-neighbor lookup, document RAG and searchable historical-evidence discovery SHALL resolve through **Spec 229 Retrieval Broker V2** unless an explicitly certified local/offline test adapter is being used.

```text
Spec 222 learning query
        ↓
Retrieval intent / filters / evidence constraints
        ↓
Spec 229 Retrieval Broker
        ↓
AI Search / Vectorize V2 / exact lane
        ↓
normalized evidence
        ↓
Spec 222 replay / evaluation / ranking logic
```

Spec 222 MAY learn which retrieval strategy/profile historically performs better, but activation of a retrieval profile remains governed through Spec 229 configuration/certification and shared policy. Spec 222 SHALL NOT silently create its own embeddings, vector index, fusion ranker or ACL-bypassing search path.

Spec 230 may consume Spec 222 advisory evidence when preparing the current development harness; Spec 229 supplies retrieval evidence; the three roles are non-overlapping.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 17 — Production Retrieval Plane Separation and Learning Signals

This revision has normative precedence over historical Sections 353–389 and any earlier text that describes Spec 222 as owning a physical vector backend, embedding pipeline, Vectorize index, pgvector index, fusion ranker or production semantic-search provider.

Those historical sections remain useful as **logical knowledge classes, retrieval intents, feature ideas and evaluation requirements**. Their physical production retrieval implementation is superseded by Spec 229.

Canonical split:

```text
Spec 222 = what historical/experience evidence exists, how replay/evaluation learns from it,
           and what advisory strategy signal is produced
Spec 229 = how searchable projections are embedded/indexed/retrieved/reranked securely
Spec 220 = who may retrieve what
```

Spec 222 MAY publish authorized searchable experience projections into the Spec 229 ingestion contract and MAY request analogous prior episodes/failures/repairs through Retrieval Broker.

Spec 222 MAY provide **advisory historical-effectiveness signals** to a Skill/methodology selector, but those signals SHALL NOT bypass Spec 221 certification, Spec 220 authorization, current compatibility or Spec 224/230 phase requirements.

To avoid self-reinforcing popularity bias, retrieval/ranking evaluation SHOULD preserve exploration, hard-negative tests, recency/drift awareness and separate semantic relevance from historical success rate.

Any learned retrieval-profile recommendation must pass Spec 229 certification/shadow/canary gates before production activation.
