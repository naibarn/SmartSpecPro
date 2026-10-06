---
spec_id: 291
previous_draft_ids:
  - 275
renumber_reason: SPEC_ID_COLLISION
numbering_status: RENUMBERED_FROM_275_AFTER_CANONICAL_AUTHORITY_REVIEW
canonical_title: SmartAIHub Local Agentic Model Runtime, Capability Resolution & Model--Harness Separation
revision: R1.0
recovery_note: Spec 275 remains Autonomous Execution Learning, Reliability & Continuous Improvement; this Local Agentic Runtime document was renumbered without changing functional scope.
---

# SmartAIHub Spec 291 --- Local Agentic Model Runtime, Capability Resolution & Model--Harness Separation

**Revision:** 1.0\
**Date:** 2026-10-03\
**Status:** Proposed / Additive / Implementation-Ready\
**Compatibility policy:** No retroactive contract change to implemented
Specs 224 or 256. No Muse-specific subsystem.

------------------------------------------------------------------------

## 1. Purpose

Spec 291 makes **Local Agentic Models** a first-class intelligence
option inside SmartAIHub without introducing a parallel orchestration
stack.

The canonical rule is:

> **Model ≠ Harness ≠ Execution Runtime ≠ Skill ≠ Tool.**

Muse Glimmer is the first reference profile, not a privileged
architecture.

SmartAIHub MUST be able to register and resolve Muse Glimmer, GLM, Qwen,
Gemma, DeepSeek, or future compatible models through the same
provider-neutral contracts.

------------------------------------------------------------------------

## 2. Non-goals

Spec 291 MUST NOT:

1.  create `MuseGlimmerService`, `MuseAgent`, `MuseMemory`, or a
    Muse-specific database;
2.  duplicate Spec 224 orchestration, lifecycle, retry, approval,
    settlement, or Final Verify authority;
3.  duplicate Spec 256 Skill-first discovery or capability execution
    authority;
4.  turn Spec 259/thClaws into a model-specific runtime;
5.  duplicate Spec 271 UAT acceptance authority;
6.  store model weights in Cloudflare Workers;
7.  silently fall back from local/private execution to a cloud provider;
8.  assume that every PC, Mac, tablet, phone, or Cloudflare runtime can
    host a large local model.

------------------------------------------------------------------------

## 3. Architectural position

``` text
User / Chat / Task Control
          |
          v
Skill / Intent Resolution                 [Spec 256]
          |
          v
Task / Development Orchestration          [Spec 224]
          |
          v
Capability + Model + Runtime Resolution   [Spec 291]
          |
    +-----+--------------------+
    |                          |
    v                          v
Cloud Intelligence       Local Intelligence
                               |
                 +-------------+-------------+
                 |             |             |
              Glimmer         GLM           Qwen ...
                 |
          Local Model Runtime
      Ollama / llama.cpp / vLLM /
       SGLang / compatible host
                 |
                 v
      SmartAIHub Worker / Runner
                 |
       Skills / MCP / Tools / UAT
```

Spec 291 selects intelligence and placement. It does not own the
workflow lifecycle.

------------------------------------------------------------------------

## 4. Four independent dimensions

### 4.1 Model

Examples:

-   `META_GLIMMER_LOCAL`
-   `GLM_LOCAL`
-   `QWEN_LOCAL`
-   cloud GPT / Claude / Gemini profiles
-   future models

A model supplies intelligence capabilities.

### 4.2 Harness

Examples:

-   SmartAIHub Native Agent
-   thClaws
-   Codex
-   Claude Code
-   other approved external harnesses

A harness owns an agent loop or specialized execution behavior. A
harness MUST NOT be conflated with the model it happens to use.

### 4.3 Execution runtime

Examples:

-   user PC/Mac Worker
-   authorized local server
-   Cloudflare Container/Sandbox where technically suitable
-   cloud model endpoint
-   future approved runtime

### 4.4 Capability

Examples:

-   reasoning
-   vision
-   coding
-   tool calling
-   MCP
-   long-horizon execution
-   recovery
-   structured output

The Resolver binds these dimensions only for a specific execution plan.

------------------------------------------------------------------------

## 5. Canonical model capability contract

Every model profile MUST expose a machine-readable capability record.

``` yaml
model_profile:
  profile_id: META_GLIMMER_LOCAL
  provider_family: meta
  deployment_class: local_open_weight
  model_identity: muse-glimmer
  model_version: "<resolved-version>"
  runtime_adapters:
    - ollama
    - llama_cpp
    - vllm
    - sglang
  capabilities:
    reasoning: true
    vision_input: true
    tool_calling: true
    structured_output: true
    long_horizon: true
    coding: true
    mcp_compatible: true
    recovery_reasoning: true
  limits:
    context_window: "<runtime-verified>"
    image_input: "<runtime-verified>"
  resource_requirements:
    min_ram_bytes: "<profile-specific>"
    recommended_ram_bytes: "<profile-specific>"
    min_vram_bytes: "<quantization-specific>"
    recommended_vram_bytes: "<quantization-specific>"
  locality:
    local_execution: true
    offline_capable: "<runtime-verified>"
    cloud_egress_required: false
  trust:
    provenance: "<verified source>"
    weight_digest: "<sha256-or-equivalent>"
    runtime_digest: "<digest>"
```

Values that depend on quantization/runtime MUST be measured or
explicitly marked unknown. Marketing claims MUST NOT be promoted to
runtime truth.

------------------------------------------------------------------------

## 6. Runtime discovery

SmartAIHub Worker MUST be able to discover:

-   installed compatible model runtimes;
-   runtime version;
-   registered models;
-   model/quantization identity;
-   available RAM/VRAM;
-   accelerator type;
-   supported modalities;
-   tool/structured-output support;
-   health;
-   benchmark/readiness state.

Discovery MUST NOT grant execution authority by itself.

A discovered profile transitions through:

``` text
DISCOVERED
  -> PROBED
  -> COMPATIBILITY_TESTED
  -> BENCHMARKED
  -> ELIGIBLE
```

Failure at any gate leaves the profile unavailable for automatic
selection.

------------------------------------------------------------------------

## 7. Resource admission

Before loading a local model, the runtime MUST evaluate:

``` text
available RAM
available VRAM
quantization
context target
KV-cache estimate
vision/perception overhead
concurrent jobs
thermal/power policy where observable
runtime overhead
```

The Resolver MUST reject or downgrade a placement that cannot satisfy
its admission envelope.

CPU/GPU offload MAY be used where supported, but MUST be represented as
a distinct measured runtime profile.

A successful model installation is not proof that the model is
production-eligible.

------------------------------------------------------------------------

## 8. Dynamic execution placement

Placement MUST evaluate hard constraints before optimization.

### 8.1 Hard constraints

1.  user/tenant locality policy;
2.  `LOCAL_ONLY` / `NO_EXTERNAL_EGRESS`;
3.  permission and approval state;
4.  required capability;
5.  runtime availability;
6.  resource admission;
7.  model/harness compatibility;
8.  data classification;
9.  provider trust;
10. required artifact/tool access.

### 8.2 Optimization dimensions

Only after hard constraints pass:

-   latency;
-   monetary cost;
-   expected quality;
-   energy/resource pressure;
-   queue depth;
-   context capacity;
-   historical task-specific reliability.

### 8.3 No silent fallback

If a task is constrained to local execution and no eligible local
profile exists:

``` text
LOCAL_EXECUTION_CAPABILITY_UNAVAILABLE
```

SmartAIHub MUST NOT silently send the task or its data to a cloud model.

------------------------------------------------------------------------

## 9. Resolver output

Resolution MUST produce an auditable binding:

``` yaml
execution_binding:
  task_id: "<id>"
  model_profile_id: "META_GLIMMER_LOCAL"
  harness_profile_id: "<native|thclaws|other>"
  runtime_profile_id: "<worker-runtime-id>"
  skill_plan_digest: "<digest>"
  capability_requirements_digest: "<digest>"
  policy_snapshot_digest: "<digest>"
  locality: "LOCAL"
  fallback_policy: "FAIL_CLOSED"
  resolution_reason_codes:
    - CAPABILITY_MATCH
    - LOCALITY_REQUIRED
    - RESOURCE_ADMISSION_PASS
  expires_at: "<timestamp>"
```

A binding MUST be revalidated when material runtime conditions change.

------------------------------------------------------------------------

## 10. Muse Glimmer reference profile

Muse Glimmer SHALL be implemented as an optional reference model
profile:

``` text
META_GLIMMER_LOCAL
```

It MUST use existing generic local-model adapters where possible.

Preferred integration shape:

``` text
SmartAIHub
   |
OpenAI-compatible / local model abstraction
   |
Worker / authorized runtime
   |
Ollama | llama.cpp | vLLM | SGLang | compatible runtime
   |
Muse Glimmer
```

No Muse-specific memory, scheduler, job queue, MCP gateway, approval
system, or orchestration state is permitted.

------------------------------------------------------------------------

## 11. Skill-first integration

Spec 256 remains authoritative for Skill-first discovery.

Canonical path:

``` text
User intent
   -> Skill discovery
   -> capability requirements
   -> Spec 291 resolution
   -> approved harness/runtime/model binding
   -> capability execution
   -> evidence
```

The model MUST NOT bypass registered Skills merely because it can call
tools directly.

Direct function/tool execution is permitted only through existing
capability and permission contracts.

------------------------------------------------------------------------

## 12. MCP and tool use

A model advertising MCP/tool capability MUST pass conformance tests for:

-   schema adherence;
-   tool selection;
-   argument validity;
-   sequential calls;
-   tool error handling;
-   bounded retry;
-   cancellation;
-   timeout;
-   approval boundary preservation;
-   artifact identity;
-   no privilege expansion.

MCP compatibility is a capability declaration, not blanket
authorization.

------------------------------------------------------------------------

## 13. Long-running agent behavior

Local agentic models MAY participate in long-horizon tasks, but durable
authority remains outside the model.

The model MUST NOT become the system of record for:

-   workflow state;
-   leases;
-   idempotency;
-   approval;
-   spending;
-   settlement;
-   checkpoint authority;
-   Final Verify.

These remain under existing SmartAIHub durable orchestration contracts.

------------------------------------------------------------------------

## 14. Recovery

Model-level reasoning may propose:

-   retry;
-   alternative tool;
-   corrected arguments;
-   replanning;
-   escalation.

The orchestration layer decides whether the proposal is permitted.

Retry MUST obey:

-   bounded retry budgets;
-   idempotency;
-   side-effect classification;
-   approval requirements;
-   spending limits;
-   lease/fencing rules.

------------------------------------------------------------------------

## 15. Spec 259 / harness interoperability

Spec 259 and Spec 291 MUST preserve a many-to-many relationship:

``` text
Harness
  SmartAIHub Native
  thClaws
  future harness
       X
Model
  Muse Glimmer
  GLM
  Qwen
  cloud models
       X
Placement
  PC/Mac
  authorized server
  cloud container
  cloud endpoint
```

A harness MUST declare a compatibility predicate rather than hard-code a
model.

------------------------------------------------------------------------

## 16. Spec 271 UAT integration

Spec 271 remains the acceptance authority.

Spec 291 adds candidate intelligence placements for UAT, including:

``` text
Deterministic evidence
  DOM / Accessibility / Playwright / API assertions
             |
             +--> Local multimodal judge
             |       e.g. eligible Glimmer profile
             |
             +--> Cloud multimodal judge
```

AI judgment MUST NOT replace deterministic evidence where deterministic
evidence exists.

A local multimodal model MAY perform:

-   screenshot inspection;
-   visual regression reasoning;
-   layout anomaly detection;
-   error-state interpretation;
-   multimodal acceptance assistance.

Its output is evidence, not self-certification.

------------------------------------------------------------------------

## 17. Benchmark and qualification

SmartAIHub MUST maintain its own task-oriented qualification suite.

Minimum suites:

1.  tool-call schema;
2.  multi-step tool sequence;
3.  MCP;
4.  coding;
5.  visual UI understanding;
6.  document/image understanding;
7.  error recovery;
8.  context stress;
9.  cancellation;
10. approval-boundary compliance;
11. prompt-injection resistance;
12. resource pressure;
13. concurrent-job behavior;
14. local-only data-egress verification.

External benchmark scores MAY inform discovery but MUST NOT alone grant
production eligibility.

------------------------------------------------------------------------

## 18. Adaptive reliability

The Resolver MAY maintain model/runtime statistics by task class:

``` text
success rate
retry rate
tool-call validity
acceptance pass rate
median latency
p95 latency
resource consumption
cost
failure class
```

Historical data MUST be scoped appropriately by tenant/privacy policy.

Automatic routing MUST NOT learn around a hard policy boundary.

------------------------------------------------------------------------

## 19. Security

### 19.1 Model supply chain

For downloaded weights/runtime packages, record:

-   source;
-   version;
-   digest;
-   license metadata;
-   acquisition timestamp;
-   scanner/provenance evidence where available.

### 19.2 Secrets

Models MUST receive only scoped secret references/capabilities required
for an approved action.

Raw provider secrets MUST NOT be injected into model context unless an
existing explicit security contract requires it.

### 19.3 Prompt injection

Tool-bearing local models MUST be treated as untrusted decision
components.

External content MUST NOT be allowed to expand:

-   permissions;
-   tool scope;
-   budget;
-   filesystem scope;
-   network scope;
-   approval authority.

------------------------------------------------------------------------

## 20. Privacy and locality

Every task MUST carry a data/locality policy projection sufficient for
resolution.

Supported semantics include:

``` text
LOCAL_ONLY
NO_EXTERNAL_EGRESS
TENANT_APPROVED_CLOUD
PROVIDER_ALLOWLIST
```

Local execution does not automatically imply privacy. Network-enabled
local runtimes and tools MUST still obey egress policy.

------------------------------------------------------------------------

## 21. Cloudflare boundary

Cloudflare Workers MUST NOT host large model weights.

Workers MAY participate in:

-   control plane;
-   policy evaluation;
-   routing;
-   identity;
-   capability discovery metadata;
-   job dispatch;
-   audit;
-   lightweight inference where separately supported.

Large local/open-weight inference belongs on an eligible Worker App
machine, authorized server, or appropriate container/GPU runtime.

------------------------------------------------------------------------

## 22. Tablet and mobile behavior

Tablet/phone support MUST be capability-driven.

The platform MUST NOT assume Muse Glimmer-class models run directly on
ordinary mobile hardware.

A mobile client may resolve execution to:

-   an eligible on-device model;
-   the user's authorized PC/Mac;
-   an authorized remote runtime;
-   an approved cloud model.

The user experience remains Chat/Task Control regardless of placement.

------------------------------------------------------------------------

## 23. Failure codes

Canonical additions:

``` text
LOCAL_MODEL_NOT_FOUND
LOCAL_RUNTIME_UNHEALTHY
LOCAL_RESOURCE_ADMISSION_FAILED
LOCAL_EXECUTION_CAPABILITY_UNAVAILABLE
MODEL_CAPABILITY_MISMATCH
MODEL_HARNESS_INCOMPATIBLE
MODEL_RUNTIME_INCOMPATIBLE
MODEL_PROFILE_NOT_QUALIFIED
MODEL_PROVENANCE_UNVERIFIED
LOCALITY_POLICY_BLOCKED
MODEL_TOOL_CONFORMANCE_FAILED
MODEL_UAT_QUALIFICATION_FAILED
```

Failures MUST be machine-readable and auditable.

------------------------------------------------------------------------

## 24. Feature flags

Initial rollout MUST be disabled by default.

Suggested flags:

``` text
LOCAL_AGENTIC_MODEL_REGISTRY
LOCAL_AGENTIC_MODEL_AUTO_RESOLUTION
META_GLIMMER_LOCAL
LOCAL_MULTIMODAL_UAT_JUDGE
ADAPTIVE_MODEL_RELIABILITY_ROUTING
```

No flag may bypass security/approval/locality gates.

------------------------------------------------------------------------

## 25. Rollout phases

### Phase G0 --- Reconciliation

-   inspect canonical repository registry;
-   confirm Spec 291 number is free before merge;
-   map existing model/provider/runtime abstractions;
-   identify duplicate contracts;
-   produce no production behavior change.

### Phase G1 --- Generic schema

-   implement provider-neutral model capability schema;
-   runtime profile schema;
-   compatibility predicate;
-   resource admission contract.

### Phase G2 --- Worker discovery

-   discover local runtimes/models/resources;
-   health probe;
-   profile lifecycle;
-   no automatic task routing yet.

### Phase G3 --- Muse Glimmer reference profile

-   register `META_GLIMMER_LOCAL`;
-   reuse generic adapter;
-   verify multimodal/tool/MCP behavior;
-   run qualification suite.

### Phase G4 --- Resolver

-   hard-constraint filtering;
-   compatibility binding;
-   optimization;
-   fail-closed locality;
-   auditable reason codes.

### Phase G5 --- Spec 256/224 consumption

-   Skill-first capability requirements feed Resolver;
-   orchestration consumes binding;
-   no modification of implemented canonical contracts required.

### Phase G6 --- Spec 271 UAT

-   local multimodal judge candidate;
-   deterministic evidence precedence;
-   independent acceptance.

### Phase G7 --- Adaptive routing

Enable only after sufficient evidence and rollback readiness.

------------------------------------------------------------------------

## 26. Migration policy

This spec is additive.

Existing jobs, models, providers, harnesses, Skills, and workflows MUST
continue to operate without migration.

Legacy provider selection remains valid until explicitly projected into
the new generic profile format.

No production cutover is permitted solely because Spec 291 is merged.

------------------------------------------------------------------------

## 27. Acceptance criteria

Implementation is acceptable only when all are true:

-   [ ] Spec number reconciled against canonical registry.
-   [ ] No Muse-specific subsystem exists.
-   [ ] Model/harness/runtime identities are independent.
-   [ ] Generic capability schema supports at least two non-Muse model
    families in tests.
-   [ ] Existing cloud-provider routing still passes regression.
-   [ ] Local discovery does not grant authority.
-   [ ] Resource admission is fail-closed.
-   [ ] `LOCAL_ONLY` cannot silently cloud-fallback.
-   [ ] Harness compatibility is explicit.
-   [ ] Tool/MCP conformance is tested.
-   [ ] Approval boundaries survive model retry/replanning.
-   [ ] Durable workflow state is not delegated to the model.
-   [ ] Muse Glimmer is represented only as a model/runtime profile.
-   [ ] Spec 256 Skill-first authority is preserved.
-   [ ] Spec 224 lifecycle/Final Verify authority is preserved.
-   [ ] Spec 259 harness authority is preserved.
-   [ ] Spec 271 independently accepts UAT evidence.
-   [ ] AI visual judgment cannot override deterministic failure.
-   [ ] Weight/runtime provenance is recorded.
-   [ ] Secrets remain scoped.
-   [ ] Egress policy is enforced for local runtimes.
-   [ ] Cloudflare Workers do not carry large model weights.
-   [ ] Mobile/tablet behavior does not assume local large-model
    capacity.
-   [ ] Feature flags default off.
-   [ ] Rollback leaves legacy routing intact.
-   [ ] Audit explains why each model/harness/runtime binding was
    chosen.

------------------------------------------------------------------------

## 28. Required test matrix

At minimum test:

``` text
Models:
  Muse Glimmer
  one additional local family
  one cloud family

Harnesses:
  SmartAIHub Native
  thClaws or equivalent registered harness

Placements:
  local Worker
  approved remote/cloud path

Policies:
  LOCAL_ONLY
  NO_EXTERNAL_EGRESS
  approved cloud
  provider allowlist

Tasks:
  text reasoning
  coding
  vision
  tool sequence
  MCP
  recovery
  UAT visual evidence
```

Tests MUST prove cross-product compatibility rather than only a Muse
happy path.

------------------------------------------------------------------------

## 29. Implementation guardrails

Code review MUST reject:

-   provider-specific branching in orchestration when capability
    resolution suffices;
-   Muse-specific durable tables;
-   direct model access to unrestricted secrets;
-   model-owned approvals;
-   model-owned workflow state;
-   silent cloud fallback;
-   unqualified model auto-selection;
-   benchmark claims treated as runtime guarantees;
-   hard-coded GPU assumptions;
-   duplicated Skill/MCP registries.

------------------------------------------------------------------------

## 30. Definition of Done

Spec 291 is done when SmartAIHub can receive a capability requirement
from existing Skill/Task flows, discover eligible intelligence options,
bind a model + harness + runtime under explicit policy, execute through
existing infrastructure, produce auditable evidence, and independently
accept the result---while Muse Glimmer remains only one interchangeable
local agentic model profile.

The architectural success criterion is:

> Adding the next local agentic model requires a
> profile/adapter/conformance implementation, **not a new SmartAIHub
> subsystem**.
