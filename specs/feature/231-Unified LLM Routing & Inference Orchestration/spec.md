# Spec 231 — Unified LLM Routing & Inference Orchestration

**Status:** R4 audit-complete design candidate; repository numbering reconciliation and production certification remain open  
**Working Spec ID:** 231 (LLM Routing; the earlier Redis/BullMQ migration draft used the same working number and is now represented by the separate proposed Spec 232 document; authoritative registry verification remains open)  
**Revision:** 4 — R3 retained in full; 15 more independent audit passes; normative Sections 69–88  
**Date:** 2026-09-23  
**Input baseline:** Spec 231 R2 (24 previous passes), Spec 229 R3 and cross-session Cloudflare migration Spec 231 R1  
**Precedence:** R4 Sections 69–88 supersede conflicting R3/R2 details; R3 Sections 50–68 and R2 Sections 28–49 remain normative where compatible.  
**Important:** A completed spec audit is **not** an implementation, an integration-test result, a production certification or proof that the spec number is reserved in Git.

> **Implementation stop condition:** The working-tree documents now distinguish LLM routing (`spec_id=231`, `spec_slug=llm-routing-inference`) from Redis/BullMQ migration (`spec_id=232`, `spec_slug=zero-downtime-redis-migration`). Do not treat that local distinction as a globally reserved registry number: verify the authoritative registry, main branch, open PRs and worktrees before merge. Unqualified historical references remain rejected; see Section 51.

---

## 0. Executive Decision

Spec 229 remains the canonical retrieval/search/vector/RAG data plane. It does **not** own model selection, provider routing, inference failover, load balancing, budgets or multi-model orchestration.

Canonical ownership:

```text
Spec 220 = authorization / privacy / locality / provider constraints
Spec 222 = replay / historical effectiveness / advisory learning
Spec 224 = durable development lifecycle / completion / verification
Spec 229 = retrieval / RAG / evidence / AI Search / Vectorize
Spec 230 = development context / methodology / harness preparation
Spec 231 = LLM routing + inference orchestration
```

Selected architecture: **Policy-first Hybrid Routing**. **Revision 2 Sections 28–49 are normative** where they clarify or supersede this baseline; gateway caching, budget and failover are not authoritative substitutes for SmartAIHub security, ledger or streaming policy.

```text
Request
  -> policy/privacy/locality/capability hard filters
  -> candidate model set
  -> deterministic/static rules
  -> semantic/classifier/difficulty signals
  -> Spec 222 historical effectiveness
  -> quality/cost/latency/reliability scorer
  -> optional learned router
  -> model + reasoning budget + provider/deployment
  -> inference
  -> evaluator/verifier when required
  -> cascade escalation/fallback if required
```

Cloudflare AI Gateway is the preferred *compatible, authorized cloud* inference gateway. Direct/native and local adapters remain first-class where required for feature fidelity, privacy, credential isolation or offline use. SmartAIHub retains canonical logical routing and policy authority.

---

## 1. Why routing is required in 2026

A single hard-coded model cannot optimize simultaneously for quality, cost, latency, privacy, modality, context size, tool support and availability. Model catalogs and provider behavior change too quickly for application code to reference provider-native model IDs throughout the system.

Optimization target:

```text
maximize expected utility
subject to hard policy/capability/security/budget constraints
```

Hard constraints are always evaluated before learned or semantic scoring.

---

## 2. Routing vs orchestration

**Routing** chooses the inference resource for one model call (not the external harness for a user-selected delegated job):

```text
logical model profile
provider/deployment
reasoning effort
max output
latency/timeout
fallback chain
evaluator policy
cache policy
```

**Orchestration** controls the larger workflow:

```text
retrieve -> model -> tool -> branch -> parallel work -> evaluate -> repair -> approval -> final
```

SmartAIHub mapping:

- LangGraph / Workflow Runtime: deterministic graph/state orchestration.
- OpenAI Agents SDK: cognitive agent/tool/handoff runtime where useful.
- Durable orchestration / Spec 224 / worker_jobs: long-running execution and finality.
- Spec 231: model/provider/reasoning selection for each inference step.
- Spec 229: evidence retrieval only.

---

## 3. Routing strategies

### 3.1 Static / rule-based

Use for hard constraints and obvious workload classes. Fast, deterministic and auditable.

### 3.2 Classifier-based

Small model or classifier predicts task family, difficulty, risk, modality or reasoning demand. Output is a calibrated signal, not authority.

### 3.3 Semantic routing

Embeddings map request intent to route examples/capability profiles. SmartAIHub may use Spec 229/Vectorize for persistent route embeddings but must keep a distinct logical routing index/profile.

### 3.4 Cascade routing

```text
cheap model -> independent evaluator -> pass OR escalate -> stronger model
```

Use only when outputs are evaluable and latency permits. FrugalGPT demonstrated large cost savings in its evaluated settings, but those figures are not universal guarantees.

### 3.5 Learned router

RouteLLM, Not Diamond and research routers predict which eligible model has better expected utility. These are optimization layers only. They never bypass policy, capability or authorization.

### 3.6 Difficulty routing

Estimate difficulty from multi-hop need, constraints, tool count, code complexity, retrieval depth and historical failures. Map to FAST/STANDARD/ADVANCED/FRONTIER pools.

### 3.7 Capability routing

Candidate models must support required text/vision/audio/video, structured output, tools/function calling, computer use, context size, language and code/reasoning requirements.

### 3.8 Privacy / residency routing

Spec 220 removes models/providers that violate locality, ZDR, data-retention, training or tenant policy.

### 3.9 Context-window routing

Use the post-retrieval context estimate plus output/tool reserve. Prefer compaction/retrieval optimization before automatically escalating to giant-context models.

### 3.10 Reasoning-effort routing

Route jointly over `model × reasoning_budget`; a harder task may use the same model at higher reasoning effort rather than changing provider.

### 3.11 Multimodal routing

Route according to actual modalities and media size/duration. Do not convert all inputs to text by default.

### 3.12 Edge/local/cloud routing

Local models are eligible when policy, device capability and certification permit. Cloud remains preferred for frontier capability or unsupported local workloads.

---

## 4. Policy-first Hybrid Router

### Stage 0 — Normalize into `InferenceIntent`

Required fields include purpose, task class, modalities, language, context estimate, required capabilities/tools, quality class, latency class, risk class, data classification, residency/ZDR requirements, budget and tenant/project identity.

### Stage 1 — Hard eligibility filter

Remove models for:

```text
policy denial
privacy/residency mismatch
missing modality/tool capability
insufficient context
uncertified status
provider/deployment outage
budget prohibition
```

### Stage 2 — Deterministic routing

Known fixed workloads such as embeddings, reranking, OCR verification and moderation use certified fixed profiles.

### Stage 3 — Soft routing signals

```text
task classifier
difficulty score
semantic route similarity
Spec 222 historical effectiveness
current model health
current price
TTFT/latency
user/tenant preference
```

### Stage 4 — Candidate scoring

Estimate quality, cost, latency, reliability and compatibility for every eligible candidate.

### Stage 5 — Optional learned router

Run only when ambiguity remains and SmartAIHub has sufficient evaluation data for that task family.

### Stage 6 — Execute via gateway

Produce immutable `InferencePlan`; Cloudflare AI Gateway performs compatible, authorized cloud inference, operational fallback within the *approved* candidate set, gateway quota/rate-limit enforcement and telemetry. Revision 2 defines direct/local alternatives and forbids invisible provider changes after stream commit.

### Stage 7 — Evaluate/escalate

Use independent deterministic or model-based validators where justified. Never use uncalibrated self-confidence as the escalation trigger.

---

## 5. Independent evaluator hierarchy

Preferred order:

```text
1 deterministic/schema validation
2 tests/executable verification
3 retrieval grounding/citation checks
4 specialized deterministic judge
5 independent LLM judge
6 human approval for high-risk work
```

Creative/open-ended outputs should not use automatic confidence cascades unless a meaningful evaluator exists.

---

## 6. Model Capability Registry

Application code references stable `model_profile_id`, never provider-native IDs directly.

Profile must include:

```text
provider/provider_model_id/version/status
modalities/context/max_output
tool/structured-output/reasoning capabilities
vision/audio/video/computer-use/code/languages
retention/ZDR/regions
versioned prices
p50/p95 latency and TTFT
error/rate-limit health
certification profiles and benchmark results
effective/deprecation timestamps
```

---

## 7. Separate model routing from deployment routing

Decision A: Which logical model?  
Decision B: Which provider/region/deployment for that model?

Provider/deployment routing may optimize uptime, RPM/TPM, latency, region, credential health and price without changing the logical model decision.

---

## 8. Failover taxonomy

```text
same deployment retry
same model / alternate deployment
same model / alternate provider
equivalent model fallback
stronger-model escalation
cheaper fallback due budget
queue/defer
fail
```

Fallback never bypasses modality, privacy, tool, context, user-lock or schema requirements.

Circuit breaker: `CLOSED -> OPEN -> HALF_OPEN -> CLOSED`.

---

## 9. Load balancing

For equivalent deployments use weighted, rate-limit-aware, least-busy, latency-aware, cost-aware, region-aware or session-affinity strategies. Low-level balancing belongs to the gateway; logical model selection remains SmartAIHub-owned.

---

## 10. Caching

Separate provider prompt caching, exact response caching and semantic caching.

Cloudflare AI Gateway offers identical-request caching, **not native semantic caching**. SmartAIHub semantic response caching is disabled by default pending separate certification. If later enabled, cache keys must include tenant/security scope, purpose, model/profile compatibility, policy version, retrieval/source revision, tool availability, response schema and locale. Never cross tenant/ACL boundaries; mutable/live requests bypass response caching.

---

## 11. Budgets

Budget scopes:

```text
platform tenant user project feature workflow/run agent workpackage request
```

Budget response may allow, warn, downgrade, reduce reasoning, disable ensemble, defer batch or block. SmartAIHub remains atomic billing/credit authority even when Cloudflare AI Gateway enforces estimated gateway spend limits. Revision 2 requires reservation, settlement, refunds and unknown-outcome reconciliation.

---

## 12. Observability and decision record

Every call records:

```text
trace/request/consumer/task class
candidate models and exclusions
selected model/provider/deployment
router policy/version and signals
reasoning effort/fallback chain
estimated and actual cost/latency/tokens
cache status
quality/evaluation result
failure category
```

Add `routing_regret = best replay utility - selected production utility` for offline learning.

---

## 13. Deployment lifecycle

Every routing/model policy change:

```text
offline replay -> shadow -> canary -> gradual rollout -> promotion
```

Every newly discovered model:

```text
DISCOVERED -> METADATA_VALIDATED -> SECURITY_REVIEWED -> CAPABILITY_TESTED
-> OFFLINE_EVALUATED -> SHADOW -> CANARY -> CERTIFIED -> ACTIVE
```

No learned router is promoted solely because it wins an external benchmark.

---

## 14. Curated model pools

Do not route every request across hundreds of models. Maintain small certified pools, e.g. FAST, GENERAL, REASONING, CODE, VISION and LOCAL, normally 2–5 active models each. This reduces routing error, evaluation cost and operational complexity.

---

## 15. Parallel/ensemble inference

Use only for high-value verification, independent research, difficult planning or safety review. Supported aggregation patterns include judge, deterministic merge, voting and synthesis. Routine traffic must not default to multi-model fan-out.

---

## 16. Orchestration patterns

Supported patterns:

```text
Sequential
Concurrent/Parallel
Handoff
Manager/Supervisor
Agent-as-tool
Group/debate/consensus
Map-Reduce
Planner-Executor-Verifier
Event-driven durable orchestration
```

Planner-Executor-Verifier is preferred for complex work; durable work uses persisted state/worker_jobs rather than a synchronous router loop.

---

## 17. Framework roles

### LangGraph
State graph, deterministic branching, checkpoints and workflow orchestration. Do not create a second durable state/approval owner within Spec 231.

### OpenAI Agents SDK
Cognitive agent loop, tools, handoffs, sessions, guardrails and tracing. Provider model surfaces must be feature-tested; enable strict feature validation where possible rather than silently dropping required Responses-only fields.

### Spec 224 / Durable Kernel
Long-running lifecycle, approvals, recovery, requirement closure and final verification.

### Cloudflare AI Gateway
Preferred provider-facing inference gateway: versioned Dynamic Routes, conditions, rollout percentages, budget/rate-limit controls, fallbacks and gateway telemetry.

---

## 18. Orchestra framework assessment

If “Orchestra” refers to the framework at `docs.orchestra.org`, its task-centric Agents plus `Conduct`/`Compose` dynamic delegation are relevant reference patterns. SmartAIHub already has LangGraph, OpenAI Agents SDK, Workflow Runtime, Durable Kernel, External Agent Gateway, Capability Resolver and worker_jobs; therefore Orchestra must **not** become another canonical orchestrator or state owner.

Permitted role: optional adapter/reference/benchmark if a future workload demonstrates a clear advantage.

---

## 19. Gateway/tool ecosystem position

- **Cloudflare AI Gateway:** primary fit for SmartAIHub's Cloudflare direction.
- **LiteLLM:** strong self-hosted/reference option for provider compatibility, deployment routing, fallback and traffic mirroring; avoid stacking it in-series unless needed.
- **OpenRouter:** optional broad provider/model source, not policy authority.
- **Portkey / Prisma AIRS AI Gateway:** enterprise security/governance candidate; Portkey was acquired by Palo Alto Networks in May 2026.
- **Vercel AI Gateway:** strong alternative/reference, but duplicates the Cloudflare infrastructure direction.
- **Not Diamond:** optional learned-router adapter/benchmark.
- **RouteLLM / Aurelio Semantic Router:** optional routing engines/benchmarks, not platform authority.
- **Ramp Router:** useful external reference for production cost-oriented routing, not a canonical dependency.

---

## 20. Corrections to supplied video summary

Well-supported:
- FrugalGPT reported up to 98% cost reduction in its evaluated settings.
- RouteLLM, Semantic Router and Not Diamond are real routing approaches/products.
- Ramp Router reports >2.75T tokens/month internally and roughly 30% LLM cost reduction.
- gateway fallback, budgets, routing and observability are mainstream capabilities in 2026.

Must be benchmarked rather than treated as constants:
- 5–20 ms semantic-routing overhead;
- 20–50 ms dynamic-routing overhead;
- fixed accuracy gains from commercial routers;
- 99.99% success claims.

Not sufficiently verified as stated:
- “VLMIC Router” as a normative production choice;
- “RAM Router” with the quoted Ramp statistics. Those statistics correspond to **Ramp Router** in current sources.

---

## 21. Spec 229 integration amendment

Spec 229 exports retrieval signals only:

```text
retrieval_trace_id
query_class
evidence_quality
evidence_count
context_token_estimate
languages
source_classes
freshness/conflict state
multimodal evidence flags
sensitivity class
```

Spec 231 consumes these signals. Retrieval similarity does not directly equal task difficulty and can never become authorization or truth.

```text
Spec 229 -> normalized retrieval signals -> Spec 231 -> Cloudflare AI Gateway -> provider/model
```

---

## 22. Shared contract `SAH-INFERENCE-1`

Request includes principal/tenant/project, consumer, purpose, task class, modalities, context estimate, required capabilities/tools, quality/latency/risk classes, data classification, provider/locality constraints, budget, retrieval signals and user model preference/lock.

Decision includes inference plan ID, logical model profile, provider/deployment policy, reasoning profile, fallback chain, evaluator policy, timeout/cache policy, cost estimate, decision reasons and routing policy version.

Outcome includes actual model/provider, tokens, cost, latency, fallback sequence, cache state, evaluation outcome and normalized failure type.

---

## 23. User model choice

Supported modes:

```text
AUTO
SMARTAIHUB_ONLY
USER_SELECTED_MODEL
USER_SELECTED_PROVIDER
EXTERNAL_AGENT_HARNESS
LOCAL_ONLY
```

AUTO invokes Spec 231. Explicit user choice remains subject to security/capability/availability policy but is not silently overridden for optimization unless the product contract explicitly permits fallback.

---

## 24. Rollout sequence

Phase 1: hard policy + capability registry + static rules + health + budget + provider fallback.  
Phase 2: semantic/classifier difficulty signals + replay.  
Phase 3: selected cascades + independent evaluators.  
Phase 4: learned/personalized routing using Spec 222 evidence.

Every later phase must beat the previous baseline on SmartAIHub-specific evaluation.

---

## 25. Routing certification

Measure by workload family:

```text
task success
quality
cost/success
latency/TTFT
fallback/error rate
routing regret
wrong-capability route = 0
policy/privacy violation = 0
budget violations
cascade escalation
router overhead
```

Maintain separate suites for Chat, RAG, code/development, research, workflow, structured extraction, vision/media, Thai/English/mixed and local-vs-cloud.

---

## 26. Canonical production architecture

```text
User / Workflow / Agent
        |
SmartAIHub Orchestrator (LangGraph / Workflow / Durable Kernel)
        |
        +--> Spec 229 Retrieval -> evidence/signals
        |
        +--> Capability/Tool plane
        |
        v
Spec 231 Policy-first Hybrid Model Router
        |
        +--> local certified model
        |
        +--> Cloudflare AI Gateway -> provider/deployment/fallback
        |
        +--> External harness when chosen by higher-level execution policy
        |
        v
Evaluator / verifier / cascade repair
        |
        v
Orchestrator durable state
```

---

## 27. Research references

- Cloudflare Dynamic Routing: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/
- Cloudflare fallbacks: https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/
- Cloudflare spend limits: https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- RouteLLM: https://www.lmsys.org/blog/2024-07-01-routellm/
- FrugalGPT: https://arxiv.org/abs/2305.05176
- LLMRouterBench: https://arxiv.org/abs/2601.07206
- LLMRouter/xRouteBench: https://arxiv.org/abs/2608.06867
- Semantic Router: https://github.com/aurelio-labs/semantic-router
- Not Diamond: https://docs.notdiamond.ai/docs/what-is-model-routing
- LiteLLM routing: https://docs.litellm.ai/docs/routing
- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- Semantic Kernel orchestration: https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/
- Orchestra: https://docs.orchestra.org/orchestra/orchestration
- Portkey acquisition: https://www.paloaltonetworks.com/company/press/2026/palo-alto-networks-completes-acquisition-portkey-secure-ai
- Vercel AI Gateway: https://vercel.com/ai-gateway
- Ramp Router background: https://ramp.com/blog/what-are-llm-gateways

---

# Revision 2 — Production-Grade Inference Routing Audit and Normative Implementation Contract

**Audit date:** 2026-09-23  
**Revision status:** Implementation-ready specification; production certification still required.  
**Precedence:** This revision is **normative** where it clarifies or supersedes earlier Sections 0–27. Earlier research and optional techniques remain informative unless explicitly retained here.  
**Validated baseline:** Spec 231 R1 in the Library and Spec 229 R3 canonical; current Cloudflare AI Gateway, OpenAI Agents SDK, LiteLLM and routing research documentation (see Section 49).

## 28. Audit record: 24 independent review passes

The review used 24 distinct failure-oriented lenses. `Fixed` means the specification has been amended, **not** that production code or live services have been certified.

| Round | Audit lens | Gap or ambiguity found | Normative correction / verification |
|---:|---|---|---|
| 01 | Cross-spec ownership | “Inference orchestration” could create a second workflow/job state machine. | Spec 231 only owns **per-inference selection, invocation, retry coordination and evaluator policy**; specs 215/224 and `worker_jobs` own durable workflow and side-effect lifecycle. |
| 02 | Existing gateway integration | Risk of replacing SmartAIHub's live gateway in one disruptive cutover. | Add an adapter to the existing gateway, preserve current route, shadow/replay, versioned feature flags and rollback. |
| 03 | Provider capability parity | Chat Completions and Responses are not interchangeable; silent field drops are dangerous. | Capability-probe native/Responses/Chat surfaces per deployment; strict fail-fast compatibility; no lossy adaptation for required features. |
| 04 | Model discovery/change | Provider aliases, model retirements, price, context and tool support can drift. | Model identity/version snapshots, signed/verified catalog input, periodic refresh and qualification lifecycle. |
| 05 | Decision security | Soft classifier/semantic routing might see private prompts before locality approval. | Resolve policy/data class and permitted **classifier locality** before any classifier, embedder or learned router sees content. |
| 06 | Authorization precedence | Rules from platform, tenant, user, run and provider could disagree. | Deterministic intersection of allowed sets; restrictive precedence; fail closed on unresolved conflicts. |
| 07 | Credential isolation | Shared BYOK for user-specific credentials risks wrong-account billing/egress. | Canonical credential owner/account binding; per-tenant/user isolation; native/direct path where BYOK isolation cannot be proved. |
| 08 | Budget consistency | Gateway spend limits are estimates, not transactional user-credit settlement. | Atomic reservation/capture/refund through existing credit ledger, including retries, parallelism and unknown outcomes. |
| 09 | Retry amplification | SDK + router + gateway retries can multiply provider calls. | Single logical retry owner per failure domain; fixed attempt/deadline/budget envelope; bounded gateway retry with SDK retry disabled. |
| 10 | Stream failures | A model can fail after emitting tokens/tool-call fragments. | Stream state machine; fallback only before output commit, or explicit new revision after retraction; never splice providers invisibly. |
| 11 | Tool side effects | Re-running an agent turn may repeat payment/filesystem/browser effects. | Effect receipts, idempotency and approval via existing tool/job authority; replan rather than blind replay. |
| 12 | Caching | Cloudflare exact cache was conflated with semantic caching; tenant ACL and freshness can be lost. | Exact-only gateway cache by default, separate certified semantic cache, canonical ACL/revision keys and default bypass for live data. |
| 13 | Gateway scale | Fixed gateway-per-tenant model would exceed account/metadata/spend-rule capacity. | Pool gateways by environment and trust boundary; canonical policy/ledger remain in PostgreSQL; bounded opaque gateway metadata. |
| 14 | Concurrency/fairness | Burst, 429 and offline Runner behavior unspecified. | Tenant/user/provider token buckets, concurrency leases, bulkheads, priority fairness, bounded queues and backpressure. |
| 15 | Local/edge security | Runner health alone does not prove current model/device trust. | Fresh capability attestation, device ownership and explicit consent; local-only requests fail closed if no compliant local candidate. |
| 16 | Multimodal portability | Payload, tool schema, audio/video/file semantics differ across providers. | Explicit modality capability matrix and non-lossy normalization; unsupported features exclude candidates. |
| 17 | Evaluator validity | Judge confidence/hallucination and judge leakage can trigger false cascade passes. | Prefer deterministic checks; independent versioned judges, calibrated error rates, adjudicated human set and no sole reliance on self-confidence. |
| 18 | Cascade economics | Cheapest-first cascade may cost more or increase p95 when failure is common. | Expected total-cost and deadline-aware escalation; never use cascade for unrepeatable effects. |
| 19 | Learning data quality | Counterfactual scores from biased logs may overstate learned-router quality. | Consent/governed replay; explicit missing-label handling, temporal splits, exploration caps, fairness slices and offline-to-canary gates. |
| 20 | Privacy/telemetry | Gateway can log raw prompt/response by default; trace labels may leak identity. | Metadata-only logs by default; content logging opt-in/redacted; separate mandatory audit from sampled traces. |
| 21 | Versioning/rollback | Routing policy/registry changes could alter in-flight work. | Immutable plan and model-profile versions per step, pinned runs, blue/green registry and reversible flags. |
| 22 | User agency/product UX | Explicit model choice or external harness selection could be silently overridden. | Strict model lock and visible fallback consent modes; surface eligibility, estimated cost, quality class and trace of what actually ran. |
| 23 | Fault/chaos readiness | Timeout, lost stream, duplicate callback and provider cost ambiguity need tests. | Fault-injection suite, unknown-outcome reconciliation and zero cross-tenant or duplicate-effect release gates. |
| 24 | Operational readiness | Architecture proposal lacked complete schema, API, admin operations, milestones and acceptance evidence. | Sections 30–48 add contracts, schema, UI, implementation path, benchmarks and production gates. |

## 29. Revised invariant architecture

```text
User / Chat / Agent / Workflow / SDK
          |
Existing SmartAIHub API + shared orchestration (Specs 196/215/224)
          |
Spec 220 Policy / Identity / Residency + shared Budget/Credits authority
          |
SAH-INFERENCE-2 admission + intent / capability requirements
          |
Spec 231 Model Registry / Policy-first Router
          |       +-- optional Spec 229 retrieval-derived task signals
          |       +-- optional Spec 222 evaluated historical effectiveness
          |
Immutable InferencePlan + budget reservation + policy snapshot
          |
    +-----+------------------+--------------------+
    |                        |                    |
Cloudflare AI Gateway    Direct Provider       Local Runner
(admitted cloud calls)   (unsupported feature, (Ollama/vLLM and
                         policy-permitted)      future local)
    |                        |                    |
    +------------------------+--------------------+
                             |
                Normalized model output / events
                             |
           Evaluator / controlled repair or cascade
                             |
                 Existing orchestrator state
                             |
                  Billing settle / audit / UI
```

**Ownership is exclusive:** Spec 231 does not recreate LangGraph, OpenAI Agents SDK, the durable kernel, `worker_jobs`, Capability Registry, Spec 229's retrieval index, Spec 220's permission engine or the existing credit ledger. Spec 231 contributes adapters, policy decisions, immutable plan/evidence and inference-specific control. Gateway operational routing is subordinate to the SmartAIHub authorization snapshot. External agents/harnesses are selected through existing capability/agent control (Specs 200/206/230); Spec 231 may select an LLM for an inference call made by an external harness only where the harness integration exposes such a governed call. It must not imply it can replace a user-chosen harness with a model API.

### 29.1 Authoritative policy evaluation

Policy resolution order is **most-restrictive intersection**, not an unqualified last-writer-wins override:

```text
emergency revocation / global containment
  AND platform legal/security/privacy policy (Spec 220)
  AND tenant/project provider + region allowlist
  AND user's credential/account ownership and explicit lock
  AND workflow/run/skill policy + data sensitivity
  AND provider/model capability and health
  AND cost reservation / remaining budget
```

Admin may tighten but not silently weaken mandatory higher-level restrictions. Unknown `policyVersion`, missing revocation freshness or unavailable credential authority → `POLICY_NOT_READY`, fail closed for external egress. Internal diagnostics may remain available. No learned router, fallback rule, gateway dynamic route, local device or cache may bypass this intersection.

### 29.2 Retrieval boundary with Spec 229 R3

`SAH-RETRIEVAL-2` yields permitted evidence, security/freshness and quality signals. The consumer calls `SAH-INFERENCE-2` with authorized summarized signals:

```text
retrieval_trace_id, query_class, evidence_quality,
context_token_estimate, modality/language,
freshness/conflict indicator, sensitivity classification,
source_revision_set_hash, partial/degraded
```

**Never** pass raw protected evidence to a third-party routing classifier before that classifier has passed the same locality/egress policy. `evidence_quality=weak` is a retrieval-repair input, not automatically a request for a more expensive model. Spec 229's indexed content remains untrusted and cannot override routing/tool policy.

## 30. Canonical contract `SAH-INFERENCE-2`

`SAH-INFERENCE-2` is a backward-compatible extension of the descriptive `SAH-INFERENCE-1` contract. The v1 adapter must preserve all existing fields and explicitly report unsupported v2 requirements; no silent default weakening.

```ts
type Risk = "low" | "medium" | "high" | "critical";
type Selection =
  | { mode: "AUTO" }
  | { mode: "MODEL_LOCK"; modelProfileId: string; fallback: "none" | "ask" | "preapproved_equivalent" }
  | { mode: "PROVIDER_LOCK"; providerId: string; fallback: "none" | "ask" }
  | { mode: "LOCAL_ONLY" }
  | { mode: "PLATFORM_ONLY" };

interface InferenceIntentV2 {
  contract: "SAH-INFERENCE-2";
  requestId: string;
  traceId: string;
  tenantId: string;
  principalId: string;                // trusted from authenticated context, never client-asserted
  projectId?: string;
  consumer: string;
  runId?: string;
  taskClass: string;
  purpose: string;
  inputModalities: Array<"text" | "image" | "audio" | "video" | "file">;
  outputModalities: string[];
  inputTokenEstimate: number;
  outputTokenReserve: number;
  schemaRef?: string;
  requiredFeatures: string[];         // e.g. native_audio, json_schema, parallel_tool_calls
  toolContractRefs?: string[];
  languageHints: string[];
  privacyClass: string;
  residencyAllowlist?: string[];
  zdrRequired: boolean;
  qualityClass: "economy" | "standard" | "high" | "critical";
  risk: Risk;
  latencyDeadlineMs: number;
  maxEstimatedCostMicros: number;  // USD micro-units; use pinned FX snapshot for other currencies
  selection: Selection;
  retrieval?: {
    traceId: string;
    quality: "sufficient" | "weak" | "conflicting" | "no_evidence";
    revisionSetHash: string;
    contextTokens: number;
    partial: boolean;
  };
  policyRevision: string;
  budgetScopeRef: string;
  idempotencyKey: string;
}

interface InferencePlanV2 {
  planId: string;
  intentHash: string;
  policyRevision: string;
  registryRevision: string;
  selectedModelProfile: string;
  selectedDeploymentProfile: string;
  endpointSurface: "native_responses" | "responses_compatible" | "chat_compatible" | "native_provider" | "local";
  reasoningProfileId?: string;
  attemptBudget: number;
  deadlineAt: string;
  fallbackCandidates: string[];
  fallbackPermission: "none" | "preapproved" | "ask";
  evaluatorPolicyId?: string;
  cachePolicyId: string;
  creditReservationId: string;
  estimatedCostMicros: number;  // USD micro-units, pinned pricing / FX revision
  routePolicyRevision: string;
  evidence?: { classifierVersion?: string; routerVersion?: string; expectedQualityBand?: string };
}

interface InferenceAttemptReceiptV2 {
  planId: string;
  attemptId: string;
  actualModel: string;
  provider: string;
  credentialOwnerRef: string;
  deployment: string;
  outcome: "completed" | "failed" | "cancelled" | "unknown";
  streamCommitted: boolean;
  normalizedFailure?: string;
  usage?: { input: number; cachedInput?: number; output: number; reasoning?: number };
  chargedCostMicros?: number;
  gatewayRequestId?: string;
  providerRequestId?: string;
  effectReceiptRefs?: string[];
}
```

Reject client-supplied `tenantId`, `principalId` or price when they conflict with authenticated/authoritative scope. Actual plan IDs, provider account and budget fields are server-resolved. Use fixed-point micro-units or decimal types for cost/credits; avoid floating-point balances. All external intent inputs are schema validated and size bounded.

## 31. Model Registry, deployment profiles and qualification

### 31.1 Versioned identities

Three distinct objects, never conflated:

- **Logical model profile:** stable SmartAIHub identifier, provider-native model ID, dated model revision/snapshot, tested reasoning, language, modality and output capabilities.
- **Deployment profile:** direct provider / AI Gateway route version / region / credential-owner binding / model surface / limits / health.
- **Routing profile:** curated candidate set + task constraints + quality/cost/latency weights + evaluation reference and promotion state.

Aliases are pointers to immutable reviewed revisions. A provider's `latest` alias MUST NOT silently change a certified production revision; a compatible update enters qualification. Discovery metadata is untrusted until adapter contract checks pass.

### 31.2 Required provider capability probe

For each logical model × deployment × SDK surface, test at minimum:

```text
chat vs native Responses, lossless message/tool-content transport,
streaming + cancellation, tool call IDs + multi-turn continuation,
function calling and parallel tool semantics, strict schema,
reasoning effort mapping and usage accounting, image/file/audio/video,
context + maximum output, prompt cache behavior,
latency p50/p95, rate limits, provider region/retention/ZDR,
endpoint authentication and credential ownership.
```

OpenAI Agents SDK adapters MUST use strict feature validation where available. Chat-Completions-compatible integrations that silently discard Responses-specific fields are ineligible if those fields are required by the task. Provider-native features that cannot be preserved by the chosen Gateway require an approved **direct-provider adapter**, not silently degraded prompts. The same logical model may have several differently certified surfaces.

### 31.3 Qualified candidate pools

Use small pool snapshots per workload (`FAST`, `GENERAL`, `REASONING`, `CODE`, `VISION`, `AUDIO`, `LOCAL`, and task-specific pools). Recommended starting range: 2–5 certified active choices per pool, **not** a platform cap. Models enter via `DISCOVERED → METADATA_VALIDATED → POLICY_REVIEWED → CAPABILITY_TESTED → EVALUATED → SHADOW → CANARY → CERTIFIED → ACTIVE`. `DEGRADED`, `QUARANTINED` and `RETIRED` are explicit states; an automatic catalog refresh never directly promotes a model.

### 31.4 Price and provider drift

Store price component/version/currency/effective date for uncached input, cache reads/writes, output, reasoning, tool surcharges and modality charges. Validate provider catalog pricing against observed invoices where available. Unknown price prohibits automatic paid routing beyond a configured low-risk bounded pilot; never assume zero. Registry drift and capability loss revoke eligibility before the next route decision.

## 32. Decision algorithm and calibrated signals

```text
0 Authenticated request → purpose/data classification + locality gate
1 Freeze policy snapshot and load certified, healthy deployment profiles
2 Enforce privacy, residency, credential ownership, capability,
  output format, context headroom, SLA deadline and budget reservation
3 Apply simple static routes for deterministic and single-candidate tasks
4 If unresolved, compute permitted task classifier/semantic signals
5 Combine calibrated task-specific quality, expected full-route cost,
  p95 latency and reliability for the remaining curated models
6 Invoke learned router only if certified for this workload and its
  expected incremental benefit exceeds latency/privacy/cost overhead
7 Materialize immutable plan and permitted provider fallback chain
8 Execute → validate → repair/cascade only if policy/evaluator permit
```

The scoring implementation MUST record excluded candidates and reasons, weights, calibration set and profile version. Do not equate lexical/vector similarity with probability of model success. A classifier is an **advisory signal**, never an authorization decision. If classifier or semantic-routing service fails, deterministic eligible selection remains available.

Optional expected utility is constrained optimization, not a global score with privacy penalties that could be outweighed:

```text
select argmax_m ExpectedTaskUtility(m)
subject to AllowedByPolicy(m) AND Capable(m) AND BudgetAdmitted(m)
             AND DeadlineFeasible(m) AND CredentialOwned(m)
```

Avoid expensive routing for requests with a single eligible profile, deterministic fixed workloads or an explicit valid user model lock. If the candidate set is empty, return typed `NO_ELIGIBLE_ROUTE` with safe reasons; never pick an unrestricted default.

## 33. Gateway execution policy — Cloudflare first, not exclusive

Cloudflare AI Gateway is the preferred **admitted cloud execution and operational observability layer**, not the policy source of truth. Use authenticated Cloudflare API/Worker binding as supported by the active adapter; gateway credentials and provider BYOK must be scoped. For user-supplied OpenAI-compatible URLs, local Ollama/vLLM or native provider-only features, dispatch through certified direct/local adapters when gateway compatibility or credential isolation cannot be established.

### 33.1 Current Cloudflare limits — design against them

The provider documentation checked for this revision states:

- Up to **five custom metadata entries per request**; larger metadata objects are ignored, not safely persisted.
- AI Gateway spend-limit rules have a documented **20-rule per-gateway** limit; they cannot represent all SmartAIHub per-user/per-tenant credit authorities.
- Cloudflare caching is for **identical** requests, not built-in semantic similarity.
- Cloudflare spend is a **best-effort cost estimate**, not authoritative billing capture.
- AI Gateway logging includes request/response bodies by default unless disabled or changed by request.

Design: use a **small environment/trust-domain gateway pool**, and pass only 3–5 opaque approved metadata fields such as `tenant_bucket`, `route_profile`, `trace_ref`, `traffic_class`, `policy_rev`. Keep the full `InferenceDecisionRecord` in SmartAIHub PostgreSQL, never cram it into Gateway metadata. Treat Gateway spend and rate limits as **defense in depth**, not canonical ledger or fairness scheduler. Review provider limits during deployment rather than assuming these numbers remain permanent.

### 33.2 Source-of-truth policy vs deployed Dynamic Routes

Spec 231 compiles a reviewed subset of provider routing/fallback/rate policies into a **versioned Dynamic Route**. Store `smartaihub_route_policy_revision ↔ deployed_gateway_route_version`. Route activation requires a diff, contract test and approved rollout. Gateway route fallback targets MUST be a subset of the SmartAIHub plan's preapproved candidates; never allow an operator to add a cross-policy provider in the Gateway dashboard without detecting route drift and pausing the affected plan. A missing route version or drift → safe direct preapproved path or fail closed.

### 33.3 BYOK and account ownership

Provider credentials are referenced through existing secrets architecture, never embedded in plan/logs. Shared platform keys, tenant keys and per-user external keys are distinct credential classes. Do not upload a user's personal key to a shared Cloudflare Gateway BYOK store unless there is an explicit ownership/isolation/consent contract and tested account selection; use isolated tenant gateway or direct-provider execution as appropriate. Revalidate the credential owner and authorization on each attempt, including failover. Changes to `cf-aig-byok-alias` or provider alias require regression tests; do not assume aliases have identical semantics on every gateway API surface.

### 33.4 Custom provider URLs, egress and SSRF protection

User-defined OpenAI-compatible URLs are untrusted destinations. Before connector activation and **again on every connection/re-resolution**, enforce canonical URL parsing, allowed schemes and ports, DNS-to-IP validation, redirect revalidation, block access to loopback/link-local/cloud-metadata/internal networks except for explicitly authorized local Runner routes, and verify TLS/server identity. Prevent DNS rebinding, redirects into prohibited address ranges and credential forwarding to a different origin. Private network/local URLs must execute on the properly paired Runner with scoped consent, not from a public multi-tenant Worker. Preserve provider URL/adapter revision in the immutable plan; no network fallback may escape the allowed egress zone.

## 34. Exactly one bounded inference-attempt policy

### 34.1 Retry and fallback envelope

An `InferencePlan` establishes **one** end-to-end deadline, an attempt budget and a total credit reservation ceiling. Assign retry ownership per failure domain:

- SDK retries disabled when the Gateway owns per-request retries;
- gateway retries disabled where the Spec 231 adapter owns cross-deployment attempts;
- `worker_jobs` may reschedule durable steps but MUST NOT reissue an already completed/unknown side-effectful attempt blindly;
- total candidate attempts and backoff time consume the same deadline and cost envelope.

Retry only typed transient failures (`429`, provider `5xx`, connection failure) under the approved compatibility/privacy list. `401/403` triggers credential/account repair; invalid schema, content-policy denial, insufficient credits and bad arguments do not become arbitrary cross-provider retries. Circuit breaker is per deployment × credential slot and distinguishes transport faults from user/policy failures. Use single-flight health probes and bounded jitter.

### 34.2 Streaming commit and partial failure

```text
PLANNED → STARTED → FIRST_TOKEN_BUFFERED → OUTPUT_COMMITTED
                                   ↘ TOOL_CALL_COMMITTED
            → COMPLETED | FAILED_PRECOMMIT | PARTIAL_FAILED | UNKNOWN_OUTCOME
```

A provider may succeed in starting a stream but fail later. **Never promise seamless failover once user-visible output or a tool-call effect is committed.** Prior to first committed output, an approved fallback can restart the attempt. After commit, emit a typed interrupted/restart-needed event, preserve already delivered output, and require a new answer revision or explicit user-visible retry. Tool-call fragments MUST be fully validated before commit; do not stitch fragments from different models/providers. Disconnection/cancellation must close upstream resources and settle usage where possible.

### 34.3 Side-effectful tools

Tools, browser actions, payments, email, filesystem and deployment effects belong to existing approval/execution authorities. Model output is a **proposal** to act. Preserve canonical tool-call ID → execution-intent/idempotency key → result/effect receipt. A model cascade cannot replay a completed tool call; recovered model turn must consume the existing receipt. Ambiguous provider/tool outcomes enter `RECONCILIATION_REQUIRED`, not a blind retry.

## 35. Budget, settlement and concurrency

### 35.1 Atomic credit admission

Before paid inference, reserve credits atomically using existing ledger authority and a unique `request_id/plan_id`. Include a worst-case bounded envelope for planned model attempt(s), reasoning output, evaluator, expected cache misses, and allowed cascade/parallel branches. If a full envelope is impractical, reserve each allowed stage **before** starting it while preserving a hard parent budget cap. Re-read the available balance under transactional locking/idempotent reservation; parallel calls must not race past the user's balance.

### 35.2 Settlement and unknown charges

**Currency and accounting:** All `*CostMicros` fields in `SAH-INFERENCE-2` use USD micro-units, never SmartAIHub credit units. Non-USD provider price quotes require a timestamped FX-rate snapshot and source before admission; credits convert only through the canonical ledger's versioned credit price/markup policy. Charge ledger amounts using its own fixed-point unit with explicit rounding rules, preserving original provider currency, FX revision and rate in the cost receipt. A missing/stale FX snapshot makes an automatic paid route ineligible unless an approved conservative reserve covers it.

Settle from verified usage/receipts and pricing version. Refund unused reservation. Provider timeouts after submission can have **unknown charge outcome**: hold/annotate provisional reservation until reconciled, without repeated capture. Gateway estimated spend does not directly mint/deduct user credits. Maintain separate fields for estimated provider cost, actual billed cost when known, platform markup, Skill fee and applicable share-of-revenue; do not place private commercial terms in provider metadata.

### 35.3 Load fairness and backpressure

Enforce global + tenant + user + deployment concurrency/RPM/TPM and reservation caps. Separate interactive and batch queues, with weighted fair scheduling and anti-starvation. Bound active streams, model loading and queued work; bulk tasks yield to latency-sensitive users within policy. A device/Runner going offline releases or expires leases through authoritative fencing; no stale device receives privileged work. Admission can `ACCEPT`, `DEGRADE_WITH_CONSENT`, `DEFER` or `REJECT` with machine-readable reasons.

## 36. Cache contract

| Cache | Allowed default | Invalidation/conditions |
|---|---|---|
| Provider prompt cache | Provider-specific approved stable prefixes | Verify retention/locality and content sensitivity; record read/write token pricing. |
| Cloudflare AI Gateway response cache | OFF for private or dynamic RAG; opt-in for tested deterministic identical requests | Include policy/tenant/security scope in custom key if enabled. |
| SmartAIHub exact cache | Optional for repeatable read-only requests | `tenant + ACL epoch + model/schema/profile + source revision + purpose + locale + tool version`. |
| Semantic response cache | **Disabled in first production release** | Separate governed service, consent, calibrated false-hit eval, ACL/freshness revisions, no cross-tenant sharing. |
| Agent tool result cache | Only for explicitly cacheable read-only tools | Respect tool-specific TTL, live operational state and revocation. |

Cache is checked only **after** caller eligibility and privacy constraints, not as a way around admission. No cached result may execute a tool or be counted as new independent evidence. Current prices, mutable files, sensitive user-specific RAG and operational status default to no response caching. Revocation/version-change invalidation must be observable and tested.

## 37. Independent evaluation and cascade policy

Evaluator priority: schema/business rules → executable tests → source-grounding checks → calibrated task-specific judge → independent strong model judge → human approval where required. Do not ask the generating model alone to assign a reliability score. Judge prompts, dataset splits and judge versions are pinned; retrieved prompt-injection text remains untrusted. Distinguish `VALID`, `INVALID`, `INDETERMINATE` and `EVALUATOR_UNAVAILABLE` instead of converting an outage to PASS.

Only use cascade when:

- the task is replay-safe or strictly read-only;
- quality is measurable with sufficient inter-rater agreement;
- evaluator latency/cost is accounted for;
- the remaining request deadline and credit reservation allow an additional call;
- escalation is compatible with residency, tool, modality, schema and user model lock.

Avoid naive cheap-first cascade when high failure rate makes `cheap + evaluator + strong` costlier/slower than `strong` alone. Compare **cost per successful task**, p95 latency and error severity, not only nominal token prices. Independent parallel model calls remain opt-in for certified high-value workloads and consume explicit total budget.

## 38. Local / edge / multimodal routing

Local runtime eligibility depends on fresh Runner pairing, capability snapshot, RAM/VRAM/model availability, sandbox trust, device ownership, explicit user consent and current policy. **LOCAL_ONLY** means no prompt, embedding, classification, judge, telemetry payload or fallback may leave the approved locality. A local device that goes offline returns `LOCAL_RUNTIME_UNAVAILABLE` or defers with consent; cloud fallback is forbidden unless the user changes the mode.

Multimodal requirements are explicit per endpoint: image tiles/resolution, audio direction/chunking, realtime duplex requirements, video duration/frame policies, file upload handling and structured tool schemas. Model catalog labels such as `vision=true` are not sufficient proof; run canonical fixture probes. A modality must not be silently transcribed/downsampled or routed through a text-only endpoint when native modality or fidelity is a required contract. Estimated token/byte cost includes media transformations.

## 39. Observability, privacy and retention

### 39.1 Typed traces

Use W3C `traceparent`/bounded `baggage` and canonical `InferenceDecisionRecord` with:

```text
request_id, plan_id, trace_id, consumer, tenant reference (DB only),
model/deployment/registry/policy revisions,
candidate set and safe exclusion reasons,
classification/route signals and version,
reservation ID, gateway/provider request IDs, attempt/fallback chain,
stream/commit state, usage and cost (estimated/actual/provisional),
evaluator outcome, quality labels, cache mode, latency/TTFT,
error/degradation code, test/shadow/canary cohort.
```

High-cardinality user IDs, raw prompt text and credential refs never become public telemetry labels. Do not send sensitive raw prompts/evidence to analytics or third-party router providers by default. Retain mandatory security/billing audit separately from sampled performance traces. Use content redaction and bounded debug windows; support tenant deletion, retention and legal-hold semantics without preserving active credentials or execution permissions.

### 39.2 Cloudflare privacy-default configuration

Cloudflare AI Gateway request/response payload logging is enabled by default unless configured otherwise. SmartAIHub's private tenant gateways MUST disable raw payload collection by default (gateway config and, where supported, `cf-aig-collect-log-payload: false`); metadata-only logging is allowed only under approved policy. If strict ZDR/local-only policy disallows even third-party metadata logging, select an approved direct/local route or fail closed. Redact authentication headers, provider key aliases, prompts, RAG snippets and tool arguments from gateway metadata and error reports.

### 39.3 Model-quality drift

Track latency p50/p95, TTFT, pass rate by task class/language, schema/tool compliance, fallback and cascade frequencies, circuit state, estimated-vs-billed cost and routing regret. Every material drift or provider-model alias update triggers fresh offline evaluations and controlled rollback. Quality dashboards must show slices (Thai/English/mixed, code/RAG/agent/multimodal, risk and tenant tier); never use one blended metric to hide serious regressions.

## 40. Routing evaluation and learned-router governance

### 40.1 Test corpus

Start with reviewed real-world-shaped fixtures without exporting private user content by default. Include Thai/English/mixed, long-context, exact identifiers, code, RAG evidence quality/conflicts, tool calling, JSON schema, local-only, user model locks, sensitive data, multi-modal, provider 429, stale pricing and empty eligible sets. Annotate task success, quality rubric, latency/deadline, total charged cost and policy compliance.

### 40.2 Compared policies

At minimum benchmark:

```text
A: current live gateway/static policy
B: policy-only curated baseline
C: B + classifier
D: B + semantic signal
E: C/D combination
F: E + certified cascade on suitable tasks
G: learned router on separately labeled suitable tasks
```

Use held-out temporal test data and separate tenant/language/task slices. Include shadow-run cost in the experiment budget. Model judge labels require human adjudication on a sampled hard-negative set. Counterfactual/off-policy evaluation must report missing propensities and uncertainty; do not assume unchosen-model quality is observed. Exploration/online bandit routing is **disabled by default** and cannot test uncertified models on private/high-risk traffic.

### 40.3 Pre-production gates

The following are explicit **project acceptance gates**, not universal benchmark guarantees:

```text
cross-tenant/privacy-policy leakage   = 0
wrong-credential / wrong-account usage = 0
wrong capability / unsupported surface = 0
unauthorized automatic model switch   = 0
duplicate paid capture/effect receipt  = 0
missing mandatory audit events        = 0
unknown outcome blind retry           = 0
all mandatory provider contract tests = PASS
all P0/P1 safety & fault-injection     = PASS
```

Performance/quality/cost thresholds shall be set from measured baseline by workload before canary. Suggested starting goals: no statistically meaningful regression in task success, p95 latency within each declared service tier, demonstrable reduction in **cost per successful task** for the intended optimized workload, and router overhead below a documented per-tier budget. If a metric lacks sufficient sample size, state `NOT CERTIFIED` instead of calling it PASS.

## 41. Model/route rollout and drift response

Every model, classifier, scorer, evaluator, gateway route and adapter change has an immutable revision and canary cohort. Promotion path:

```text
DISCOVER → VALIDATE → CONTRACT TEST → OFFLINE REPLAY
→ SHADOW (no side effects) → CANARY → PRODUCTION → MONITOR
```

Shadow traffic is opt-in or otherwise permitted, redacted and charged to a controlled experiment budget. Shadow runs must not send emails, mutate files, execute payments, call external side-effect tools or leak private data to a new provider. Canary should start with small non-consequential cohorts, then broaden only after slice metrics and safety gates pass. Auto-rollback triggers include privacy/account isolation incidents, duplicate settlement/effects, sustained quality regression and provider contract drift. In-flight plans keep the pinned route/registry revision; emergency revocations supersede only where safety requires cancellation.

## 42. Administrative and user UI/UX

**Admin → AI → Model Routing** includes:

- Registry: logical models, actual provider IDs, capability conformance by endpoint, retention/region policy, price version, rollout stage and quarantine.
- Routing Policies: rule builder and candidate pool editor, hard-policy exclusion reasons, score weights and route revision diff/rollback.
- Provider Accounts: owned accounts, key alias lifecycle (redacted), available region/deployment, health/429/circuit status and capacity.
- Live Operations: per-tenant/user/project usage aggregates; concurrent slots; queued tasks; retry/fallback; unknown outcomes and active cost reservations.
- Routing Inspector: simulate a request under a **real authorized scope**, display eligible/excluded models, reasoning decision, cost estimate, selected route and fallback without revealing another user's data.
- Quality Lab: replay/shadow/canary comparison, task slices, sampled evaluator disagreement, cache false positives and route regret.
- Alerts: provider errors, quality drift, balance exhaustion, credential revocation, gateway route drift and unexpected external egress.
- Incident Controls: disable a model/provider, revoke a route, drain a deployment, rollback a classifier, pause learned routing and revalidate plans.

**User / tenant-facing controls** show AUTO vs explicit model/provider vs LOCAL_ONLY; certified capability/quality class, estimated charge and available budget, whether fallback is allowed, and which model actually responded. Changing a locked model or moving private work to cloud requires explicit user action when not preauthorized. Hide complex scoring by default but offer an advanced explainability view.

## 43. Persistence / event and schema requirements

Reuse existing canonical tables whenever practical; do not duplicate user, tenant, credit or worker-job truth. Proposed logical entities (new table or extension to existing schema):

```text
model_profiles(id, provider_model_id, model_revision, capabilities_json,
               data_policy_json, status, profile_revision)
model_deployments(id, model_profile_id, gateway_route_ref, credential_owner_ref,
                  region, sdk_surface, provider_account_ref, health, revision)
router_policy_versions(id, json_rule_digest, candidate_pool_snapshot,
                       evaluator_policy_revision, activation_state)
inference_plans(id, request_id, intent_hash, tenant_id, policy_revision,
                registry_revision, selected_deployment, reservation_ref,
                deadline_at, state)
inference_attempts(id, plan_id, ordinal, provider_request_ref, gateway_request_ref,
                   state, token_usage_json, estimated_cost, actual_cost,
                   stream_commit_at, error_code)
inference_evaluations(id, plan_id, evaluator_revision, verdict, rubric_ref,
                      evidence_refs, timestamp)
model_certification_runs(id, model_profile_revision, deployment_revision,
                         task_suite_version, test_result_refs, status)
```

State mutations emit durable outbox events (`INFERENCE_PLANNED`, `BUDGET_RESERVED`, `ATTEMPT_STARTED`, `OUTPUT_COMMITTED`, `ATTEMPT_SETTLED`, `ROUTE_RECONCILIATION_REQUIRED`, `MODEL_QUARANTINED`). Use idempotency keys, unique request/attempt references, revision fencing and bounded retention. Avoid storing raw user content in plan rows.

## 44. Implementation phases (additive; existing traffic continues)

| Phase | Deliverable | Promotion check |
|---|---|---|
| P231.0 | Inventory existing gateway/model registry, provider adapters, credits, feature flags and active routes | All production inference entry points mapped; no new routing service deployed yet. |
| P231.1 | `SAH-INFERENCE-2` adapter, policy/capability checks and immutable profiles | Existing routes unchanged; unit/contract + tenant security tests pass. |
| P231.2 | Deployment/credential qualification, pricing, context and model surface probes | Can route one existing safe low-risk workload in staging. |
| P231.3 | Plan/attempt records + budget reserve/settle/reconcile | Parallel and timeout charge tests pass. |
| P231.4 | Cloudflare AI Gateway adapter with route drift detection, metadata/log caps and preapproved fallbacks | Contract/stream/retry tests pass; credentials verified. |
| P231.5 | Local and native direct-provider adapters under same plan/receipt contract | Local-only and feature-compatibility tests pass. |
| P231.6 | Deterministic curated pools, classifier opt-in, admission/fairness and routing inspector | Existing traffic baseline measured; low-risk canary ready. |
| P231.7 | Evaluator/cascade on one objectively gradable high-volume workload | Cost per successful task and p95 measured vs single strong model. |
| P231.8 | Golden routing evaluation, offline replay, consent-governed shadow and canary | Preproduction gates pass across important language/task slices. |
| P231.9 | Expand consumers (RAG/Chat/Workflow/Agents) through shared interface | No new bypass path; user model choice preserved. |
| P231.10 | Optional learned router and Spec 222 feedback ingestion | Only promote when verified better than deterministic baseline. |
| P231.11 | Admin operations/alerts, incident drills, deprecate legacy direct hardcoded paths | Rollback/fault/chaos proof; sign-off by platform owner. |

Do not turn on a global new routing mode while Spec 229 index or other unrelated migrations are unfinished. Each consumer can adopt the adapter independently; original production route stays available under a reviewed rollback window.

## 45. Required acceptance test catalog

A minimum conformance suite includes:

1. Private Thai prompt never reaches cloud classifier before locality policy.
2. A tenant-prohibited provider is absent from candidate set even if learned router scores it highest.
3. A user-selected model lock is preserved or asks explicit consent before incompatible fallback.
4. Native Responses-required payload cannot silently route through a lossy Chat Completions adapter.
5. A JSON-schema/tool/realtime-audio capability probe blocks an unsupported endpoint.
6. Provider model alias drift quarantines unqualified revision.
7. Two concurrent requests cannot overspend one user wallet through stale balance reads.
8. Timeout-after-submission cannot double-settle or release all provisional credit without reconciliation.
9. Gateway/SDK/router retry settings cannot generate unbounded nested retries.
10. One provider 429 fails over only to a preapproved compatible provider/account.
11. Wrong-credential and cross-tenant model dispatch are rejected.
12. First streamed token followed by failure produces interrupted state, not silently spliced model output.
13. Partial streamed tool-call JSON is never executed.
14. A repeated LLM turn reuses existing effect receipt instead of duplicating a browser/payment/file mutation.
15. Gateway raw payload logging is disabled for private data; metadata fields are bounded and scrubbed.
16. Similar prompts from two tenants never share an unauthorized semantic response cache entry.
17. Revoked ACL/source revisions invalidate relevant cached RAG answer candidates.
18. LOCAL_ONLY with offline Runner never falls back to cloud.
19. Evaluator timeout yields `INDETERMINATE` or error, never success.
20. Cascade rejects a path whose predicted total deadline/budget exceeds the request envelope.
21. Late cancellation/provider callback is correlated with pinned attempt version and reconciled.
22. Emergency policy revocation prevents queued/in-flight new provider submissions and invalidates unstarted plans.
23. Learned router fails safely to the certified deterministic baseline during feature-store failure.
24. Shadow deployment has no external side effects and obeys experiment consent/cost caps.
25. Unsupported model/tool/schema/region combinations always return typed `NO_ELIGIBLE_ROUTE`.
26. Model pool rollback leaves active pinned runs intact where safe and revalidates high-risk steps.
27. Query trace and usage accounting correlate to the authoritative plan without disclosing raw prompt to analytics.
28. Provider price drift updates future reservations while preserving historic invoice/audit snapshots.
29. Cloudflare gateway route drift is detected and blocks unapproved fallback targets.
30. Repeated quality failures trigger quarantine and a versioned incident alert.

## 46. Definition of Done / production evidence

Spec 231 R2 is **implemented**, not merely designed, only after:

- all in-scope inference consumers use the shared plan/attempt API (or have a documented legacy exception with expiry);
- all active cloud/local deployment profiles have passing surface-specific conformance evidence;
- policy/privacy/locality restrictions and explicit user model choice are enforced before classifier and model invocation;
- credit reservation/capture/refund/reconciliation are deterministic and survive crash/retry/parallel workloads;
- bounded retry, streamed output, tool-effect and cancellation safety tests pass;
- Gateway raw payload logging and provider egress are configured according to data-classification policy;
- online route/cost/quality/health evidence and admin incident controls work;
- compared baselines and uncertainty-aware language/task slices pass release thresholds;
- gradual rollout and rollback are successfully exercised in staging and at least one canary cohort;
- no duplicated workflow, execution, retrieval, policy or billing authority is introduced;
- documented deviations from provider docs are re-probed before production activation.

**Release blockers:** unknown authorization state; wrong account/tenant; private data escaping approved locality; duplicate paid settlement or tool effects; silent model-lock override; unapproved Gateway fallback; loss of required model features; undocumented paid model alias drift. These cannot be waived by an aggregate quality or cost metric.

## 47. Open, measured decisions (do not hard-code guesses)

- Which 2–5 models belong to each certified pool after the current corpus is run?
- Which task families have graders reliable enough for automatic cascades?
- What are the actual p95 latency and cost-per-success baselines by Thai/English/mixed workload?
- Which native provider features survive Gateway/SDK transport today?
- Which tenant data classes permit Gateway metadata-only tracing?
- How many provider attempts fit each product tier's reserved credit envelope?

These are deployment-time **measurement and policy** inputs, not excuses to postpone the first deterministic, compatible implementation. Until answered, use the existing safe certified model route for that workload.

## 48. Minimal companion amendment for Spec 229 R3

Spec 229 remains the owner of retrieval and evidence quality. Add a **non-invasive companion reference** instead of copying model-routing algorithms into RAG:

```text
SAH-RETRIEVAL-2 (Spec 229)
  -> authorized retrieval signals + provenance/revision + partial flag
  -> SAH-INFERENCE-2 (Spec 231)
  -> policy-approved model + reasoning profile
  -> Gateway/direct/local execution
```

Spec 229 itself still owns any retrieval retries, rehydration of media vectors, hybrid reranking and evidence gate. Spec 231 may choose a generation model based on authorized summary signals but must not claim authority over citations or source ACL. Model classifier embeddings MAY use distinct Spec 229 index/namespace only through the governed Retrieval Broker, without introducing a separate vector database.

## 49. Verified research and platform reference snapshot

This revision draws normative provider facts from first-party documentation available on **2026-09-23**; changes after that date require fresh adapter contract probes.

- Cloudflare AI Gateway Dynamic Routing (versioned routes, conditional, percentage and budget/rate nodes): https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/
- Cloudflare AI Gateway JSON routing configuration: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/json-configuration/
- Cloudflare AI Gateway limits (custom metadata): https://developers.cloudflare.com/ai-gateway/reference/limits/
- Cloudflare AI Gateway spend limits (best-effort estimates, rule ceiling): https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- Cloudflare AI Gateway cache (identical requests): https://developers.cloudflare.com/ai-gateway/features/caching/
- Cloudflare AI Gateway logging and payload controls: https://developers.cloudflare.com/ai-gateway/observability/logging/
- Cloudflare AI Gateway BYOK alias behavior: https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/
- Cloudflare authenticated gateway: https://developers.cloudflare.com/ai-gateway/configuration/authentication/
- OpenAI Agents SDK model surface and strict compatibility validation: https://openai.github.io/openai-agents-python/models/
- OpenAI Agents SDK guardrail lifecycle: https://openai.github.io/openai-agents-python/guardrails/
- LiteLLM router/retry owner precedent: https://docs.litellm.ai/docs/routing
- FrugalGPT: https://arxiv.org/abs/2305.05176
- RouteLLM: https://www.lmsys.org/blog/2024-07-01-routellm/
- LLMRouterBench: https://arxiv.org/abs/2601.07206
- Semantic Router: https://github.com/aurelio-labs/semantic-router

**Research caveat:** Published cost-saving and routing-latency figures are study/vendor-specific, not SmartAIHub performance guarantees. R2 intentionally keeps the first production route deterministic and promotes learned/cascade routing only after product-specific evidence.


---

# Revision 3 — Fourteen Additional Failure-Oriented Audit Passes (Normative)

**Design review date:** 2026-09-23. **Scope:** actual latest available R2 text, Spec 229 R3 integration contract, and concurrently authored migration spec. Cloudflare API specifics below were checked against current first-party documentation. R3 focuses on concrete omissions and previously underspecified fail-safe behavior, not another parallel infrastructure layer.

## 50. Audit record — 14 new rounds and changes

`AMENDED` means the written implementation contract was corrected; no claim of code deployment, observed production metric or passing live-provider test is made.

| Pass | Independent audit lens | Material gap / failure scenario | R3 amendment | State |
|---:|---|---|---|---|
| 25 | Cross-session spec registry | Historical drafts for the LLM Router and zero-downtime Redis migration both used Spec 231; a repository commit could overwrite the other | Section 51: the local migration draft is now represented as proposed Spec 232, but canonical-registry compare-and-swap plus full dependency/filename remap remain required before merge | AMENDED |
| 26 | Cloudflare endpoint compatibility | Dynamic Routes are called through the compatible Chat Completions route and cannot be assumed available on native Responses/REST | Section 52: explicit execution-surface routing and capability parity test matrix | AMENDED |
| 27 | Streaming guardrail enforcement | Cloudflare Guardrails streaming response handling differs by endpoint; presumed blocking could actually fail open or disable streaming | Section 53: per-surface safety-mode certification with explicit buffer-or-reject behavior | AMENDED |
| 28 | Raw-content logging & classification | Metadata-only gateway logs and Cloudflare log classification have different content-processing requirements | Section 54: independent opt-ins and zero-content default for private requests | AMENDED |
| 29 | Dynamic-route drift and provenance | Gateway operators could deploy a different fallback or rule while a plan remains pinned | Section 55: canonical signed manifest, hash/route version handshake and rejection of unauthorized route drift | AMENDED |
| 30 | Request identity and external egress | Client-asserted tenant metadata, redirect/DNS rebinding or shared BYOK alias can bypass tenant binding | Section 56: trusted-identity boundary, per-attempt egress/credential validation, origin pinning | AMENDED |
| 31 | Retry/stream atomicity | First token, gateway route success and full completion can be confused; detached streams may incur double billing | Section 57: single retry owner, precommit fallback only, cancellation and settlement state machine | AMENDED |
| 32 | Economic completeness | Eventual gateway spend limits and missing cached/reasoning/media usage can exceed reserved credits | Section 58: worst-case envelope, incremental admission, invoice reconciliation and FX snapshot | AMENDED |
| 33 | RAG-to-inference decision coupling | Weak/partial/stale retrieval could be misread as an invitation to buy a stronger model | Section 59: retrieval quality gate, fresh ACL epoch and separate retrieval-retry ownership | AMENDED |
| 34 | Cache isolation/consistency | Same-looking prompts could replay stale answers or leak a document after ACL/knowledge changes | Section 60: cache classifier, content-revision key and fail-closed reauthorization | AMENDED |
| 35 | Fairness, capacity & outages | Provider rate bursts, local Runner offline and reconciliation jobs compete with interactive traffic | Section 61: fairness/admission model, circuit transitions and explicit outage classes | AMENDED |
| 36 | Evaluation leakage & adaptive risk | Offline learned router could improve aggregate score but regress on Thai, low-data users or high-risk actions | Section 62: temporal/tenant-aware splits, calibrated uncertainty, noninferiority slices and promotion gates | AMENDED |
| 37 | Registry/model lifecycle | Gateway model aliases and model-feature drift could invalidate ongoing plans without a versioned transport certification | Section 63: frozen model × deployment × API-surface qualification and invalidation rules | AMENDED |
| 38 | Implementation and UI closure | Plan lacked a complete user-visible explanation, API error contract and R3-specific fault-test mapping | Sections 64–68: typed states, admin screens, event/schema amendments, rollout and 38 additional tests | AMENDED |

## 51. Spec number collision — mandatory registry resolution

**Observed collision:**

- `Spec_231_R2_Unified_LLM_Routing_Inference_Orchestration_CANONICAL.md` — routing/inference specification;
- `spec-231-zero-downtime-redis-bullmq-cloudflare-migration-r1.md` — independent infrastructure migration specification, with `spec_id: 231` and a suggested `specs/feature/231-...` path.

The current document retains the **working number 231 solely to preserve conversational references**. It does not claim an exclusive registered number. The other document is neither deleted nor silently renumbered in this deliverable.

Before repository integration, the implementation owner SHALL:

1. fetch the current authoritative spec registry and main-branch `specs/feature/*` paths, checking unmerged branches/PRs when accessible;
2. atomically reserve one unique ID for each topic (the next genuinely free ID may be used; **232 is not presumed free**);
3. maintain a `spec_aliases` migration map from both historical `231` references to unique canonical IDs **using title/UUID, not naked integers**;
4. update filenames, headers, links, companion contracts, test fixtures and implementation task identifiers in one reviewed change;
5. prevent accidental automatic migration of `P231.*` checkpoints from one topic into the other;
6. emit a collision resolution record with source digests, mapping, approver and canonical commit SHA;
7. refuse new `231-*` merges until uniqueness tests pass. Existing production paths remain untouched during this documentation correction.

Any `Spec 231` reference emitted before reconciliation must include `spec_slug = llm-routing-inference` or `spec_slug = zero-downtime-redis-migration`. The compiler and Spec 230 context resolver must reject ambiguous references rather than guessing by date or folder.

## 52. Endpoint and feature-fidelity routing

Cloudflare Dynamic Routing is documented as a versioned route invoked through `/compat/chat/completions` with route name as the model. **As of this revision it is not available on the REST API**, and the standard compatible endpoint has a deprecation note for *ordinary single-model chat* while remaining the documented Dynamic Route invocation surface. Therefore an `AI_GATEWAY_DYNAMIC_ROUTE` is **not** a universal substitute for native provider APIs.

Per-model/per-deployment capability certification SHALL record **endpoint-specific**, not merely model-level, support for:

| Required inference feature | Routing rule |
|---|---|
| Ordinary chat with lossless compatible request/response | Certified Dynamic Route allowed |
| Native Responses semantics, state/continuation, platform-hosted tools or native-only fields | Native/direct or explicitly certified compatible adapter; no automatic Dynamic Route |
| Strict JSON Schema/tool-call IDs, partial tool streams, parallel function calling | Use only a surface passing exact conformance fixtures |
| Realtime audio/video, duplex/WebSockets, native files or complex multimodal | Certified native/local route unless adapter proves parity |
| User model lock / provider lock | Dynamic Route may only contain the exact locked or explicitly consented equivalent candidates |

Add `executionSurface: AI_GATEWAY_DYNAMIC_CHAT | AI_GATEWAY_SINGLE_MODEL | PROVIDER_NATIVE | DIRECT_COMPAT | LOCAL` and `surfaceCertificationId` to the immutable plan. A `routeVersion` is mandatory for Dynamic Routes. Gateway routes must compile to no more than the *already admitted* candidate set. **Do not compile an entire SmartAIHub cognitive/agent graph into Cloudflare Dynamic Routing.**

Automated contract probes SHALL compare structured output, reasoning parameters, stream event order, cancellation, tool IDs, image/audio payload handling, usage accounting and exact model/deployment selected. Unsupported or dropped required features yield `INFERENCE_SURFACE_INCOMPATIBLE`, not a silently simplified request.

Source: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/

## 53. Guardrail and streaming enforcement matrix

Cloudflare Guardrails and SmartAIHub's mandatory security policy are **not interchangeable**. Cloudflare documents its streaming behavior as follows: for REST streaming, response checks may be logged **without response blocking**; for `gateway.ai.cloudflare.com/v1/*` streaming, the gateway may buffer the full output and return a single non-streamed response. Therefore:

| Policy class | Permitted behavior |
|---|---|
| High-risk request requires pre-call prompt blocking | Apply a certified blocking pre-guardrail before provider submission. Failure → reject/hold, not warn-and-continue. |
| High-risk response requires enforceable post-check | Buffer provider output in SmartAIHub or use a certified blocking non-stream path; release only after verification. `streamingGuaranteed=true` and mandatory post-blocking may be mutually incompatible. |
| Low-risk opt-in streaming with posthoc flagging | May stream if explicitly allowed by policy and UI; never label the response as post-guardrail enforced. |
| Local-only or restricted content | Guardrail model/locality must itself satisfy Spec 220; an external safety model is an external data recipient. |
| Cloudflare Guardrails evaluator unavailable | Critical/mandatory guardrails fail closed. Optional monitoring can emit `GUARDRAIL_UNAVAILABLE` and proceed only where policy permits. |

Request-level `guardrailMode` SHALL be `BLOCKING_PRE`, `BLOCKING_PRE_AND_POST_BUFFERED`, `MONITOR_ONLY`, or `LOCAL_CERTIFIED`. `guardrailAttestation` (provider, model revision, language tests, surface, checked stages, outcome) is part of the attempt outcome. Do not claim complete Thai-language or multimodal safety coverage without the actual fixture suite. A provider-side guardrail response is untrusted as a substitute for ACL/tool authorization. Guardrail costs and added latency enter admission estimates.

Sources: https://developers.cloudflare.com/ai-gateway/features/guardrails/usage-considerations/ and https://developers.cloudflare.com/ai-gateway/features/guardrails/

## 54. Privacy, request logging and opt-in classification

Cloudflare AI Gateway logs are on by default and may contain request and response bodies. The `cf-aig-collect-log-payload: false` header disables raw payload storage for that request while preserving permitted metrics; `cf-aig-collect-log: false` disables the gateway log entry. Separately, **Log Classification** requires stored logs and processes eligible stored prompt/response content; it must not be silently enabled to improve router telemetry.

Mandatory deployment profile fields:

```ts
interface GatewayTelemetryPolicy {
  gatewayCollectLogs: boolean;
  collectPayloads: boolean;
  enableCloudflareLogClassification: boolean;
  exportLogpush: boolean;
  retentionDays: number;
  allowedDataClasses: string[];
  approvalRevision: string;
}
```

Default for private tenant content: `collectPayloads=false`, `enableCloudflareLogClassification=false`, no content-bearing shadow copy. Sensitive content with metadata restrictions may use `collectLogs=false` or an allowed direct/local route. If tenant explicitly enables Cloudflare content classification, require a transparent consent/policy decision, privacy review and retention schedule before activation. **Do not turn on prompt/response payload logging just to obtain a better routing classifier.**

Any privacy-preserving classification or routing telemetry computed inside SmartAIHub must use data-minimized, authorized features only; individual-user, credential or project secrets never appear in custom metadata. Provider log completeness is an analytics property, not mandatory financial/security audit truth.

Sources: https://developers.cloudflare.com/ai-gateway/observability/logging/ and https://developers.cloudflare.com/ai-gateway/observability/log-classification/

## 55. Dynamic-route compilation, drift detection and gateway-side policy

The SmartAIHub routing profile is the **only editable canonical policy**. The Cloudflare route is a signed/hashed compiled artifact with:

```text
routePolicyRevision
routeManifestHash
cloudflareGatewayId + cloudflareRouteName + cloudflareRouteVersion
permitted model/provider/region/deployment list
credential-owner/trust-domain binding
approved fallback DAG + strict order
retry/timeout envelope
privacy + logging policy revision
promotion/rollback state
```

Before activation, compare the route artifact returned by Cloudflare with the approved compiled manifest. On dispatch, check immutable plan against active route hash (cache the check only inside a bounded freshness lease tied to a revocation epoch). Out-of-band dashboard edits or an unexpected version cause `UNAPPROVED_GATEWAY_ROUTE_DRIFT`; route automatically withdraws from eligible deployments. **Do not trust caller-supplied Cloudflare metadata as a security principal.** Backend derives opaque metadata from authenticated request context and authenticates the upstream Gateway request.

Dynamic-route `success` after stream startup is not evidence of **full model completion**. Gateway fallback/retry must be disabled or tightly bounded in surface-specific ways that preserve Spec 231's total attempts and post-commit stream rules. No fallback to a provider absent from the approved plan, even if Gateway route configuration advertises it.

Emergency revocation or provider key compromise invalidates route-admission leases before new submissions; in-flight submitted requests are cancelled when supported and reconciled rather than silently reissued.

## 56. Identity binding, BYOK and untrusted provider endpoints

Server verifies `principal, tenant, project, credential_owner, account, device/Runner` for **each** planned attempt. Identifiers in prompts, tool results, external SDK headers and gateway metadata are untrusted. Reject metadata collisions/reserved-key overrides before routing; Cloudflare custom metadata has a maximum of five entries per request under the verified reference limits, and only the allowed opaque subset may leave SmartAIHub.

Provider URL handling:

1. canonicalize origin including punycode, scheme, explicit port and credentials-in-URL rejection;
2. resolve DNS and check **every address** against allowed destination policy at initial configuration **and** connection time;
3. defend IPv4-mapped IPv6, link-local, private ranges, rebinding, redirects, proxy environment variables, alternate numeric IP forms and TLS downgrade;
4. refuse credential forwarding across origin/redirect/account changes;
5. local/private-LAN endpoints execute only on a trusted, user-consented Runner with explicit endpoint allowlist and a short-lived capability grant;
6. outbound cloud traffic uses a controlled egress path if per-connection remote-IP validation cannot otherwise be enforced;
7. provider credential rotation/expiry invalidates the deployment lease; do not replay an attempt against an unverified account.

BYOK keys belonging to one user may not be silently placed in an environment-shared Cloudflare credential pool. Share only under an explicit provider contract and verified isolation. Treat `OpenAICompatibleAdapter` as **untrusted user-configured network integration**, not a shortcut around Spec 220 authorization or residency.

## 57. Attempt ownership, timeouts, tool effects and streaming

Each `planId` has one canonical `retryCoordinator` and a bounded `maximumSubmittedPaidAttempts`, `deadlineAt`, `maxChargeReserve` and `sideEffectClass`. SDK, Gateway and SmartAIHub retries SHALL not multiply. The plan MUST record `gatewayRetryMode`, `sdkRetryMode` and `routerRetryMode`; incompatible combinations are rejected by config validation.

**Event transitions:**

```text
ADMITTED -> SUBMITTED -> STREAM_OPEN -> PRECOMMIT_BUFFER
                              |               |
                              |               +-> ABORTED_PRECOMMIT -> permitted fallback
                              +-> COMMITTED_OUTPUT -> COMPLETED
                                      |          -> INTERRUPTED_POSTCOMMIT
                                      +-> TOOL_PROPOSAL_COMPLETE -> effect-ledger admission
UNKNOWN_CHARGE -> RECONCILE -> SETTLED | DISPUTED
```

- Gateway/request timeout must be characterized as **time to first response**, not assumed a total generation deadline. Separately enforce first-byte, total-deadline, idle-stream and tool-turn timeouts in SmartAIHub.
- Fallback is permitted only before user-visible output commit and before any tool execution intent that would make replay unsafe; opaque model state and provider-side remote side effects also affect replay eligibility.
- Client disconnect or cancellation attempts provider cancellation and releases stream capacity but does not automatically prove zero billable usage. Issue a provisional receipt and reconcile later usage.
- Tool-call fragments remain inert until the exact schema and user/tenant effect grant are validated; a duplicate/tool-retry consumes the stored receipt instead of performing a second side effect.
- If a provider silently times out after receiving a request, classify `UNKNOWN_OUTCOME` and refuse blind replay of a non-idempotent turn. Preserve correlation IDs to resolve late completions.
- Re-prompting another provider after first visible output creates a **new answer revision** shown to the user, never stitches a response invisibly.

Source: https://developers.cloudflare.com/ai-gateway/configuration/request-handling/

## 58. Budget admission and end-to-end accounting

Gateway spend limits are **eventually consistent**; concurrent requests can temporarily exceed them and usage-based prices are estimates. Only SmartAIHub's authoritative credit ledger may admit/capture/refund. The parent request budget must account for:

```text
primary inference
+ allowed retries / fallbacks
+ evaluator or verification calls
+ optional cascades / parallel ensemble
+ reasoning/long-context token reserve
+ images/audio/video/tool/media transforms
+ provider prompt-cache read/write prices
+ shadow experiments if explicitly enabled
+ applicable platform/Skill charges
```

Implement worst-case reservation where bounded; otherwise stage-by-stage incremental reservation with a **hard parent cap** before the next paid stage. Provider rate/budget nodes are defense-in-depth only. For unknown charge outcomes, retain a uniquely referenced provisional liability, reconcile against provider/gateway receipts, enforce an aging/reconciliation SLA and alert before holding balances indefinitely. The ledger must ensure at-most-once capture for each reconciled economic event.

Use fixed-point currency/credits, pinned provider pricing and a dated FX snapshot with an identifiable source. Reserve with safe ceilings when price is uncertain; unknown price is not zero. Preserve distinct estimated, measured and invoiced amounts without turning a stale cost estimate into a user invoice. A user-visible fee estimate must name whether it covers potential retries/evaluator work. A fallback may not exceed user-approved spend or cross into an unapproved billable provider.

Source: https://developers.cloudflare.com/ai-gateway/features/spend-limits/

## 59. Retrieval→inference contract and evidence semantics

Spec 229 owns its search retry, hybrid ranking, vector/media rehydration and **evidence-quality certification**. Spec 231 receives only authorized signals from `SAH-RETRIEVAL-2`: `queryClass, evidenceQuality, sourceRevisionSetHash, ACL epoch, sensitivityClass, contextTokenEstimate, language, multimodal requirements, partial/degraded flag, provenance completeness`.

Decision rules:

```text
NO_EVIDENCE -> do not spend on a larger model to hide the missing retrieval.
               Ask Spec 229 for an allowed alternate retrieval or return insufficient evidence.
WEAK       -> repeat retrieval only if 229 permits, then choose an eligible generation model.
CONFLICT   -> prefer an eligible stronger reasoning/evaluator profile when appropriate;
              never promote an evidence claim or override source authority.
PARTIAL    -> do not declare complete evidence for high-risk/consequential decisions.
STALE ACL  -> block new inference until 229/220 reauthorize under the current epoch.
```

The router may use RAG evidence *volume* and language to select the model/reasoning profile. It MUST NOT treat a vector/reranker score as a calibrated answer-quality probability. Retrieved instructions remain untrusted content and never modify routing policy or tool permissions. Cross-spec correlation uses `retrievalTraceId` and `inferencePlanId` without leaking source text into Gateway metadata.

## 60. Cache correctness and revocation

Differentiate provider **prompt-prefix cache**, AI Gateway **identical-request response cache**, SmartAIHub deterministic **exact response cache** and **semantic response cache** (disabled in initial production). Gateway caching is not semantic caching by default. A cacheable request must be deterministic, read-only and stable for a known TTL. Never cache paid/tool-effecting turns as interchangeable completed actions.

The canonical cache key must include `tenant/security scope, ACL epoch, policy revision, exact model/deployment/profile, prompt/schema/tool revision, source-revision digest, locale, deterministic parameter set`. On cache hit, re-evaluate current user authorization and data-locality policy. Tenant/security policy change, source edit/delete, model revision, credential scope revocation or cache-schema change invalidate or bypass the entry. Sensitive cross-user caches require explicit policy and proof of safe sharing; default is private-per-user or bypass.

If the effective cache key cannot fit or be faithfully represented by the Gateway API surface, **disable gateway caching** for the request and use SmartAIHub's governed cache if eligible. Never derive cache authorization from untrusted client headers. Semantic cache promotion needs measured false-hit/ACL leakage gates before enablement.

## 61. Fair admission, health and incident degradation

Use token/byte-rate and stream-concurrency budgets per platform, tenant, user, deployment, provider account and Runner. A deployment may be `HEALTHY`, `DEGRADED`, `RATE_LIMITED`, `CIRCUIT_OPEN`, `AUTH_REQUIRED`, `QUARANTINED`, `DRAINING` or `OFFLINE`; typed errors, hysteresis and single-flight probes avoid oscillation. Weight fairness so interactive users are not starved by batch inference while scheduled/maintenance tasks receive minimum service within their entitlement.

Define deterministic behavior for no eligible route:

- temporary capacity shortage -> queue/defer only if deadline and consent allow;
- private `LOCAL_ONLY` Runner offline -> local defer or typed reject, **never cloud**;
- all allowed cloud providers offline -> typed `NO_CAPACITY`, not an unauthorized new provider;
- policy/revocation service stale -> `POLICY_NOT_READY`, fail closed on external dispatch;
- billing authority unavailable -> no new paid requests without an approved offline reservation mechanism;
- mandatory guardrail unavailable -> fail closed for that workload;
- high-risk partial/retrieval-degraded -> wait for evidence or return insufficient evidence.

Regional failover requires explicit residency revalidation. Emergency credential rotation invalidates new submissions on stale deployments. Versioned operations and incident UI shall show user-safe status, admin diagnostic reasons and expected recovery action without exposing secrets.

## 62. Adaptive router and evaluator evidence

Compare deterministic policy-only baseline, classifier, semantic, cascade and learned policies with *replay sets drawn from SmartAIHub workloads*. Separate by task, Thai/English/mixed, tool/structured-output, modality, data locality, consumer tier and cost. Keep temporal holdouts; avoid training/evaluator contamination and label leakage from using the same LLM to generate and judge evaluation fixtures. Report missing counterfactual labels, uncertainty, sample size and actual total cost **including route-classifier and judge overhead**.

A learned router cannot promote unless:

- it beats or is noninferior to the certified deterministic baseline on task success in every critical slice;
- it has positive cost-per-success benefit where optimization is claimed;
- upper confidence bound on policy/privacy violation remains within the zero-violation acceptance gate (no observed violation is required but not alone proof of future zero risk);
- it passes worst-case deadline/p95 gates, guardrail false negative tests and provider-surface compatibility;
- replay/shadow consent and token budget are explicit; high-risk/private traffic is excluded from unauthorized shadow experiments.

Evaluation decisions are versioned and signed. Spec 222 may advise on performance/learned strategies but does not activate an uncertified routing policy. Router failure returns the last certified deterministic policy and never a globally strongest, unvetted model.

## 63. Qualification, lifecycle and drift

Separate versioned identities for `logical_model`, `provider_deployment`, `credential_binding`, `API_surface`, `router_policy`, `evaluator`, `catalog_snapshot` and `pricing_snapshot`. Probe representative production-compatible fixtures for exact required features (Responses vs Chat, tool-turn continuation, strict schemas, streaming, reasoning controls, image/audio/video, large context and usage). A provider marketing claim such as “supports tools” is not a passed contract test.

Model discovery → review → capability tests → task-specific quality evaluation → shadow → canary → active. Unknown alias mutation or material loss of a required feature quarantines the affected *deployment × surface* without taking unrelated instances down. In-flight plans keep pinned compatible versions; new attempts must revalidate emergency revocations and credential ownership. Rollbacks restore an approved registry and route revision pair, not one without the other. When model is discontinued, pin old work only if still available/approved; otherwise require an explicit replanning/approval state.

## 64. Public/API & Admin UI completion

Every `SAH-INFERENCE-2` caller has server-authorized endpoints equivalent to:

```text
POST /api/inference/plan
POST /api/inference/execute
GET  /api/inference/plans/{planId}
POST /api/inference/plans/{planId}/cancel
GET  /api/inference/models/eligible?purpose=...
POST /api/admin/inference/router/policies/{id}/validate
POST /api/admin/inference/router/policies/{id}/publish
POST /api/admin/inference/router/evaluations
POST /api/admin/inference/router/incidents/{id}/quarantine
```

Paths may follow existing repo conventions. API MUST expose typed `POLICY_NOT_READY`, `NO_ELIGIBLE_ROUTE`, `INFERENCE_SURFACE_INCOMPATIBLE`, `BUDGET_NOT_RESERVED`, `GUARDRAIL_UNAVAILABLE`, `UNKNOWN_OUTCOME`, `STREAM_INTERRUPTED`, `UNAPPROVED_GATEWAY_ROUTE_DRIFT`, `CREDENTIAL_SCOPE_INVALID` and `MODEL_REVISION_UNCERTIFIED` errors with retryability/degradation metadata. Do not expose backend account identifiers to end users.

UI screens: end-user `Auto / choose model / provider lock / local only`, model eligibility and price/latency ranges, explicit fallback-consent modal; admin model registry, surface certification matrix, candidate exclusion inspector, route diff+publish+rollback, gateway config drift, budget reservation vs provider invoices, privacy/guardrails, local Runner readiness, performance/quality slices, cross-tenant fault and incident dashboard. Admin test-as-user must use server-issued scoped impersonation and must never show data that the simulated principal cannot access.

## 65. Schema, events and precise versioning amendments

Implement additions to the existing canonical tables rather than a new ledger or job engine:

```text
inference_plans:
  spec_slug, model_profile_rev, deployment_rev, surface_cert_ref,
  route_manifest_hash, route_version, policy_rev, acl_epoch,
  guardrail_mode, settlement_policy_rev, total_attempt_cap

inference_attempts:
  surface, route_version, upstream_credential_owner,
  committed_output_revision, provider_correlation_ref,
  cancellation_requested_at, cancellation_confirmed_at,
  unknown_charge_state, guardrail_attestation_ref

router_policy_versions:
  signed_manifest_hash, compiled_gateway_route_hash,
  authorized_fallback_deployments[], audit_approval_ref

model_certification_runs:
  input_fixture_hash, model_deployment_surface_hash,
  language_slices[], drift_baseline, test_evidence_ref
```

New typed events: `ROUTE_DRIFT_DETECTED`, `STREAM_INTERRUPTED_POSTCOMMIT`, `GUARDRAIL_ENFORCEMENT_UNAVAILABLE`, `MODEL_SURFACE_QUARANTINED`, `PAYMENT_RECONCILIATION_REQUIRED`, `SPEC_NUMBER_COLLISION_BLOCKED`.

`SAH-INFERENCE-2` gains *additive* `executionSurface`, `surfaceCertificationId`, `routeManifestHash`, `guardrailMode`, `aclEpoch`, `sourceRevisionSetHash`, `totalEstimatedChargeCeilingMicros` and `streamingPolicy`. Default migration is **fail-safe**: an older caller missing a newly mandatory high-risk field cannot silently opt into lower protection. APIs, DB schema changes and provider adapters must be covered by forward/backward compatibility tests during rolling deploy. Keep existing plan and job authority; do not create a second execution ledger.

## 66. Implementation sequence — zero unnecessary global cutover

| Slice | Main implementation | Concrete promotion evidence |
|---|---|---|
| R3.0 | Resolve numbered-spec registry collision and publish mapping | Registry uniqueness, title/slug refs, collision CI pass |
| R3.1 | Extend current gateway adapter with execution-surface capability matrix | Native/Chat/Dynamic Route conformance and lossless fixture results |
| R3.2 | Guardrail streaming matrix, request privacy and egress rules | Pre/post blocking and Thai/multimodal policy fixture proof |
| R3.3 | Plan routing hash, credential binding, signed/approved route compiler | Unauthorized dashboard route drift blocked |
| R3.4 | Retry owner, stream/unknown-outcome state and credit reconciliation | Fault-injection no double capture/effect and cancellation proof |
| R3.5 | Spec 229 R3 integration signals + governed cache invalidation | ACL epoch/current-source gate and RAG no-evidence tests |
| R3.6 | Fair admission, local-only/region incidents, admin observability | Saturation/region/network/Runner outage tests |
| R3.7 | Classifier/semantic/cascade only in a certified low-risk workload | Measured per-slice cost-per-success, quality and p95 gate |
| R3.8 | Optional learned router on held-out SmartAIHub data | No critical-slice regression, signed evidence and staged canary |

The **existing** production inference and Spec 229 retrieval continue serving independently. Each slice uses versioned flags, shadow tests without side effects, a bounded canary and an audited rollback decision. Never combine RAG reindex, job-control migration and model-router global rollout into one release barrier.

## 67. Additional R3 acceptance tests — 38 scenarios

The following tests augment (not replace) the 30 R2 cases:

1. Two documents both labeled `231` cause registry uniqueness CI failure; neither is overwritten.
2. Ambiguous unqualified `Spec 231` references are rejected until canonical mapping is approved.
3. Dynamic Route chosen for ordinary certified Chat-compatible task; exact route version recorded.
4. A task requiring native Responses features cannot go through an uncertified Dynamic Route.
5. A Chat adapter that loses strict schema or tool-call IDs fails contract certification.
6. A direct/native provider route can serve required nonportable multimodal semantics when authorized.
7. Mandatory streaming **response** blocking cannot be treated as enforced on an unbuffered REST stream.
8. Buffered mandatory post-guardrail response is withheld from user until passed; no streaming promise is made.
9. Gateway optional guardrail outage is distinguished from mandatory guardrail outage.
10. Private tenant prompt does not reach Cloudflare Log Classification unless independently approved.
11. `cf-aig-collect-log-payload: false` is verified in the actual Gateway log configuration/path.
12. Client-provided tenant/credential-owner metadata cannot override authenticated scope.
13. A deployed Cloudflare route hash mismatch removes that deployment from new eligible plans.
14. Dashboard-added fallback model not in the immutable plan is rejected before dispatch.
15. In-flight policy emergency revocation fences new paid attempts and revalidates continuation.
16. DNS rebind and HTTP redirect to metadata/private IP are blocked with no secret forwarding.
17. Local Runner explicit LAN route obeys scoped user consent and never exposes private LAN to shared Workers.
18. A timeout after stream first byte does not cause silent cross-provider response splice.
19. SDK + Gateway + Router retry caps cannot exceed the plan's submitted-attempt envelope.
20. Cancelled paid stream has provisional cost receipt and later reconciliation, not an automatic full refund.
21. Late provider usage callback cannot capture the same economic event twice.
22. Gateway 20-rule spend configuration cannot be the only authority for an unbounded tenant population.
23. Simultaneous cascade/parallel branches cannot exceed the parent credit cap.
24. Cost estimates include model reasoning, cached reads/writes, multimodal input and evaluator charges.
25. Empty Spec 229 evidence does not cause an automatic expensive model escalation in place of retrieval.
26. Stale ACL epoch or deleted source version blocks an otherwise reusable RAG answer cache hit.
27. Untrusted retrieved document cannot change model-routing restrictions.
28. A custom cache key missing ACL/source revision causes cache bypass, not reuse.
29. Fair admission preserves interactive p95 while guaranteeing bounded batch progress.
30. LOCAL_ONLY with required local judge never invokes cloud fallback or third-party cloud guardrails.
31. Learned router promotion is blocked if Thai or mixed-language critical slice regresses.
32. Insufficient counterfactual labels are reported as uncertainty, not fabricated quality wins.
33. Uncertified alias revision quarantine affects only the relevant deployment × surface.
34. An API client lacking R3 mandatory high-risk fields is rejected instead of defaulting to monitor-only.
35. Registry+gateway version rolling deploy never changes a pinned run's executable plan silently.
36. Admin user-simulation does not disclose another tenant's plans, prompts, costs or credential refs.
37. Route config rollback and model registry rollback move together under an approved snapshot.
38. A mandatory guardrail provider unavailable under regional outage yields a typed fail-closed status.

## 68. Final R3 audit conclusion and production acceptance

**Document-level assessment:** Earlier 24 passes are preserved and **14 additional distinct review passes** are recorded with normative corrections. The text now defines endpoint fidelity, privacy, guardrail semantics, registry collision handling, route drift, payment/cancellation reconciliation, retrieval interface, resilience, adaptive-evaluation governance and user/admin controls. Its verification is limited to document structure/consistency and externally documented provider behavior.

**Implementation gates:** Live deployment remains **NOT CERTIFIED** until unique registry ownership is resolved, exact adapter fixtures pass against the actual provider versions, all R2+R3 release-blocking security/financial/stream/ACL tests pass, model quality/cost/latency are evaluated by workload and language, gateway route hash/provenance is auditable, Spec 229 cross-plane contract is proven, and rollback/incident drills succeed. Do not call the spec itself a tested system.

**Release-blocking invariants (zero tolerated observed failure):** wrong account/tenant, prohibited provider or locality, privacy/logging violation, false safety enforcement, duplicated paid capture, duplicated tool side effect, unauthorized fallback, silent stream splice, wrong/uncertified model surface, stale authorization acceptance, missing mandatory audit and unresolved spec-ID collision before repository merge.

### Verified platform references for R3 (snapshot 2026-09-23)

- Cloudflare AI Gateway Dynamic Routing and endpoint limitation: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/
- Cloudflare AI Gateway JSON routing nodes/start-of-stream semantics: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/json-configuration/
- Cloudflare Guardrails streaming constraints: https://developers.cloudflare.com/ai-gateway/features/guardrails/usage-considerations/
- Cloudflare request retries/first-response timeout: https://developers.cloudflare.com/ai-gateway/configuration/request-handling/
- Cloudflare Gateway logging and content-payload controls: https://developers.cloudflare.com/ai-gateway/observability/logging/
- Cloudflare Log Classification content opt-in: https://developers.cloudflare.com/ai-gateway/observability/log-classification/
- Cloudflare spend-limit eventual consistency: https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- Cloudflare metadata/limits: https://developers.cloudflare.com/ai-gateway/reference/limits/
- Cloudflare exact-response cache: https://developers.cloudflare.com/ai-gateway/features/caching/

---

# Revision 4 — Fifteen Additional Cross-Plane, Continuity and Economic Audits (Normative)

**Review date:** 2026-09-23. **Baseline:** R3 in full (R2's 24 passes plus R3's 14 passes). **Additional passes:** 39–53. **Total recorded design-review lenses:** 53. **Status:** Document design revised; no claim of deployed tests or production certification. **Spec number:** `231` is the *historical working number*, not an available registry allocation. The independent Redis/BullMQ-to-Cloudflare migration also uses `231`; `spec_slug: llm-routing-inference` is mandatory until a title-qualified, repository-approved renumbering is complete. This revision neither renumbers nor overwrites that independent migration spec.

## 69. Fifteen-round R4 audit ledger

| Pass | Review lens | Residual gap in R3 | Normative R4 correction | Result |
|---:|---|---|---|---|
| 39 | Concurrent spec registry / migration | Both independent specs claim 231; implementation work could be dispatched to the wrong plan even though R3 prohibits overwrite | Section 70: immutable `spec_uid`, alias migration, artifact/branch binding, CI cross-document reference audit | AMENDED |
| 40 | Stateful tool/reasoning conversation | Per-call surface certification does not guarantee that a multistep conversation can resume on another provider | Section 71: session-affinity, opaque continuation ownership, lossless-or-approved context migration | AMENDED |
| 41 | Gateway executed-route attribution | A preapproved route can execute a different candidate through operational fallback, making planned cost/account/provider differ from reality | Section 72: executed model/provider attestation, correlation and settlement quarantine | AMENDED |
| 42 | Workers lifetime / async handoff | HTTP streaming, `waitUntil`, queues and durable jobs were insufficiently distinguished for background inference | Section 73: synchronous-vs-durable classifier, canonical `worker_jobs`, queue as delivery only | AMENDED |
| 43 | Distributed in-flight ownership | Duplicate queue delivery or regional failover could both dispatch the same paid attempt | Section 74: one authoritative claim, fencing epoch, heartbeat, unknown-outcome replay prohibition | AMENDED |
| 44 | End-to-end latency/deadline | Provider first-byte timeout can pass while total generation, tool or verification work runs beyond user deadline | Section 75: hierarchical deadline envelope and measurable cancellation budget | AMENDED |
| 45 | Dynamic-route deploy/pin | A plan may record route version yet an endpoint called by mutable route name may execute a later deployed revision | Section 76: immutable route identity or verified invocation-version pin; no version assumption | AMENDED |
| 46 | Eval-data lifecycle | Shadow/replay and learned-router training can retain deleted/opted-out private prompts after serving-data deletion | Section 77: consent-bound evaluation lineage and propagated deletion/retention | AMENDED |
| 47 | Untrusted routing signals | Adversarial clients or poisoned feedback can steer routing toward premium models or disallowed destinations | Section 78: trusted feature provenance, spend-abuse detection, advisory weight caps | AMENDED |
| 48 | Counterfactual evaluation | Router improvements cannot be inferred from unlabeled traffic with selection bias | Section 79: logged evaluation propensity, randomized consented low-risk cohorts and explicit uncertainty | AMENDED |
| 49 | Multi-turn tool execution | Model/provider handoff can recreate an earlier tool call despite a receipt or missing conversation-tool ID fidelity | Section 80: turn-state checkpoint, canonical tool-effect ledger references and explicit handoff gates | AMENDED |
| 50 | Gateway/provider/local cost | Estimated gateway usage is not the same as measured provider charges or local compute marginal cost | Section 81: charge hierarchy, actual deployment attribution and local resource costing | AMENDED |
| 51 | Local GPU and tenant fairness | Local-only requests can starve the owner device, overcommit VRAM or route private workloads through a shared Runner | Section 82: device-scoped admission, local data-boundary and emergency revocation | AMENDED |
| 52 | Multimodal transport / egress | File/audio/video URLs and media expansion can evade text-only cost/egress gates | Section 83: media manifest, signed-URL scope/TTL and modality-specific budgets | AMENDED |
| 53 | Recovery / release coherence | A model registry rollback alone is insufficient if routes, budgets, policy and running workflows refer to different revisions | Section 84: atomic release bundle, upgrade fence, drills and residual-risk acceptance | AMENDED |

## 70. Canonical identity and collision-proof integration

The R3 number-collision hold remains release-blocking. Extend it with **globally stable, title-bound identifiers**:

```text
spec_uid: urn:smartaihub:spec:llm-routing-inference
spec_slug: llm-routing-inference
provisional_number: 231
numbering_state: HOLD_COLLISION
other_claimant_slug: zero-downtime-redis-migration
```

Every new `InferencePlan`, development ticket, benchmark fixture, cross-spec reference and CI-generated artifact MUST carry `spec_uid` and `spec_revision`; unqualified `P231.*` and `Spec 231` references MUST be rejected when their source lineage is ambiguous. Registry resolution must inspect *main*, open branches/PRs and the authoritative spec registry, then reserve unique numbers with a single reviewed transaction. If live registry access is unavailable, retain HOLD, never guess that 232 is free. Migration of aliases, R3/R4 links, generated code identifiers and user-facing documentation must be atomic. Preserve both independent documents unchanged until approval. Keep the Redis migration deploy path and LLM routing rollout in separate release plans and independent rollback domains.

## 71. Stateful conversation portability and session affinity

R3's per-inference surface tests SHALL be supplemented with **multi-turn state** certification. A model can support `tools` in isolation yet reject a conversation whose previous turns contain nonportable provider-specific tool IDs, opaque reasoning data, signed continuation material or multimodal state. Define:

```ts
interface ConversationStateManifest {
  conversationId: string;
  tenantId: string;
  ownerPrincipalId: string;
  currentDeploymentProfileId: string;
  currentExecutionSurface: string;
  modelRevision: string;
  canonicalTranscriptDigest: string;
  providerOpaqueContinuationRef?: string; // encrypted, owner-bound
  toolCallIdMapRef?: string;              // protected mapping
  stateSchemaVersion: string;
  policyRevision: string;
  lastCommittedTurnSeq: number;
  migrationMode: "PINNED" | "PORTABLE_VERIFIED" | "COMPACTION_REQUIRED" | "RESTART_CONSENT_REQUIRED";
}
```

* `PINNED` is the default while a tool cycle, provider-managed state or opaque continuation remains active. Do not copy/forge hidden provider reasoning or signature material.
* Same-provider deployment failover requires a certified continuation fixture, not merely the same logical model name.
* Cross-provider failover after an active tool call is blocked until a canonical, redacted transcript with finalized tool receipts is materialized and certified for the target surface.
* If no lossless continuation is possible, pause at a checkpoint, compact safely under the current ACL/policy, present an explicit reset/context-loss warning if user-visible, and request the owning orchestrator to replan. Never silently splice state.
* Retention and deletion cover opaque state refs and tool maps. Opaque payloads MUST NOT appear in router telemetry or AI Gateway metadata.

## 72. Planned-versus-executed model and credential attribution

An authorized *routing plan* is not an executed-call receipt. For every Gateway Dynamic Route attempt, capture actual provider/model information, including available `cf-aig-model` and `cf-aig-provider` response headers, the Gateway request identifier, routed account/credential binding and provider usage receipt when obtainable. Compare this observed execution against the plan's preapproved set, **including fallback consent and jurisdiction**.

State transitions:

```text
PLANNED -> ADMITTED -> DISPATCHED -> EXECUTION_OBSERVED
                                    |-> EXECUTION_UNVERIFIED
                                    |-> EXECUTION_POLICY_MISMATCH
```

A missing/malformed header is **unverified**, not proof of unauthorized use; fetch correlated Gateway/provider audit data where permitted. An observed wrong provider, credential owner, model or region is a critical mismatch: stop follow-on tool/LLM calls, quarantine the affected route, preserve redacted evidence and begin provider/billing reconciliation. Final customer charges may be settled only using the existing economic authority and attributable metered usage. An estimate based on intended model is not a provider invoice. Avoid treating unsigned provider response headers as cryptographic proof without corroboration.

## 73. Cloudflare HTTP/streaming versus durable invocation

The execution mode is explicit:

```text
INLINE_INTERACTIVE
  - caller connected; Workers may proxy/stream within CPU/memory/subrequest limits
  - disconnection may abort the request; commit state and stop/cancel policy apply

DURABLE_INFERENCE
  - canonical job intent and budget reservation committed in PostgreSQL worker_jobs/outbox
  - Cloudflare Queue/Workflow is a dispatch/wakeup transport, NOT the execution authority
  - job state and attempt receipts are owned by the existing durable control plane
```

Cloudflare documents HTTP Worker duration as connection-dependent, `waitUntil()` as a bounded short extension (up to 30 seconds), and Queues as **at-least-once** delivery. Therefore a minutes-long or disconnected-background agent task MUST NOT be implemented as `waitUntil` alone or assumed to execute exactly once because it uses Queues. Use a durable job with admitted attempt, recovery cursor, heartbeat, bounded tool stages, cancellation and persistent results. Long-running provider continuation is polled/resumed through the existing job plane, not through a second inference scheduler. No global migration gate: old and new transport families may coexist while sharing canonical job identity.

## 74. Single execution owner, fencing and unknown outcome

Before external paid submission, atomically claim `logical_call_id` in the canonical control plane using `(tenant_id, run_id, node_id, logical_call_id)` plus an incrementing fencing epoch. The claim creates at most one **active** attempt-owner lease. Queue delivery is a hint; a duplicate message must return the existing in-flight receipt instead of dispatching a second provider call.

Required invariants:

```text
unique active owner per logical call
monotonic attempt sequence + fencing epoch
budget reservation and job admission precede egress
heartbeat renewal cannot revive an invalidated epoch
side-effect tool invocation references canonical effect-intent receipt
unknown provider outcome -> RECONCILE, never blind resend
```

If a provider supports an idempotency key, use the stable provider-scoped attempt identifier. If not, deduplication before submission cannot guarantee that the upstream was invoked exactly once during crash/timeout ambiguity; mark `UNKNOWN_OUTCOME`, reconcile and require policy-approved human intervention when a consequential duplicate is possible. No second control plane, no cross-region split brain, and no retry owner split between SDK/Cloudflare/Spec 231.

## 75. Hierarchical deadlines and latency conservation

Distinguish `admissionDeadline`, `timeToFirstTokenDeadline`, `interChunkIdleDeadline`, `overallGenerationDeadline`, `evaluatorDeadline`, `toolDeadline`, `parentRunDeadline` and `billingReconciliationDeadline`. Every nested call receives a remaining deadline budget; an outer deadline cannot be extended by a successful first token or a Gateway internal fallback. Cloudflare's request timeout concerns **first response**, not total streaming completion, so an application-level overall deadline is mandatory.

Default timeout values and p95 targets must be calibrated by workload and environment. Cancellation after committed output reports an interruption; never hide it by silently restarting on a new model. When late usage arrives, reconcile without reauthorizing new paid stages. Admission should consider expected queue wait plus p95 provider duration; do not admit a job that cannot plausibly meet an explicit customer deadline without presenting queue/defer alternatives.

## 76. Immutable route identity and deployed configuration coherence

Cloudflare Dynamic Routes are named/versioned and currently invoked by `dynamic/<route-name>` on the supported Chat-compatible endpoint. Merely storing a `routeVersion` in SmartAIHub does **not** prove that a request by mutable name executes that revision. Before production dispatch, the adapter SHALL prove one of:

1. a provider-supported request-time immutable route-version binding, certified on the active API surface; OR
2. an immutable, content-addressed route *name* per approved manifest/version, with explicit SmartAIHub mapping from the active logical route; OR
3. a certified deployment fence that prevents modification of the route during its admitted lifetime, with predispatch and postexecution version evidence.

If none is proven, use an explicitly selected single-model route or authorized native provider endpoint and report `ROUTE_PIN_UNAVAILABLE`. Drift detection based only on scheduled polling is not sufficient for high-risk traffic; the dispatch boundary must validate version/manifest or route through a controlled immutable alias. The actual executed model/provider remains separately checked under Section 72.

## 77. Offline evaluation / training data lifecycle

The evaluation corpus is a derived copy of potentially confidential traffic. Every replay, shadow, redaction, benchmark label and learned-router feature row requires a lineage record:

```text
source tenant/user/consent and lawful use scope
purpose: operational diagnostics | quality eval | router training
sensitivity class and allowed recipients
source content revision + ACL epoch
encryption and retention policy
raw-payload prohibition / redaction method
provider/judge/model recipients
expiry and deletion/tombstone state
```

A production conversation becoming deleted/revoked must invalidate or remove disallowed raw samples, evaluation derivatives, embeddings and external judge artifacts under their retention obligations. Do not assume permission to serve a prompt means permission to send it to a second model for evaluation or training. Shadow calls with private content are opt-in and policy-gated; use synthetic/redacted corpora where appropriate. Never put raw prompts, source text, user identifiers or protected embeddings in generic route metric labels. Mandatory security/audit evidence remains separate, minimized and retention-governed.

## 78. Feature provenance, premium-route abuse and feedback poisoning

Features may be **trusted canonical**, **certified derived**, or **untrusted hints**. Tenant identity, budget, risk, residency, credential ownership, data sensitivity and allowed providers are trusted only when resolved from server-side authorities. Client prompts and retrieved text cannot assert `qualityClass=critical`, `provider=frontier`, `risk=low`, or a higher budget without an authorized product/action policy. Rate-limit route planning itself and cap classifier/evaluator overhead to prevent cost amplification from adversarial long prompts.

Spec 222 historical success is advisory and must be versioned, stratified and confidence-weighted. Apply outlier/poisoning detection, suspicious tenant/user feedback-rate caps, data-quality gates and minimum effective sample sizes before a learned signal affects production. A semantic nearest-neighbor hit or positive review never overrides a Skill's trust state, a model's qualification, or a privacy restriction. Show the origin and confidence of each *soft* route signal in Admin Inspector without exposing private input content.

## 79. Counterfactual selection bias and experiment provenance

A production Router usually observes quality only for the selected model; other candidate outcomes are unknown. Offline evaluation MUST distinguish **observed selected-model outcomes**, **paired replay outcomes**, **judge-estimated outcomes** and **unknown counterfactuals**. Never compute an alleged `best-model routing regret` from missing labels.

For user-consented, low-risk workloads, controlled randomized experiments may collect candidate propensities and paired ground truth. Log experiment IDs, selection probabilities, stratification, environment/model snapshots and evaluator lineage. Use held-out temporal/tenant slices; prevent prompt duplicates and label contamination between train/validation/test. Track absolute task success, cost-per-success, quality by Thai/English/mixed, latency and confidence intervals. A/B experiments may not override model lock, data policy, budget or guardrail requirements. Small-sample results are reported as inconclusive, not promotions.

## 80. Canonical tool-effect boundary across inference handoffs

The model can **suggest** a tool call; it does not authorize or directly perform an economic/system side effect. The existing Capability/Approval/Execution authority validates tool args and commits `effect_intent_id` before a Runner/workflow executes. When changing models, a checkpoint records:

```text
last acknowledged model turn
normalized assistant/tool event sequence
logical tool call IDs and provider-specific mappings
committed effect intent IDs / effect receipts
pending human approvals
external state / continuation reference
authorized capability snapshot
```

A replayed completion that repeats a previously executed `effect_intent_id` receives the canonical receipt instead of re-executing. Missing tool-result ordering or a rejected signed provider continuation triggers checkpoint/replan, never invented successful tool output. This is a shared contract with Specs 199/200/206/220/224 and the existing `worker_jobs` authority, not a new tool engine in Spec 231.

## 81. Full inference economics and invoice provenance

Distinguish `estimated`, `reserved`, `metered`, `gateway_estimated`, `provider_invoiced`, `settled` and `disputed` amounts. Pricing snapshots contain source, effective time, currency, FX observation timestamp, regional surcharge and modality pricing; stale/unknown prices cannot be treated as zero. Include provider prompt-cache **write and read pricing**, reasoning output, image/audio/video input and generation, tokenizer/routing/evaluator cost, provider retry and partial/cancelled output. A local model consumes GPU time, energy, infrastructure capacity or a user-owned Runner resource even if no external token invoice exists; local charge/tariff policy must be explicit rather than assuming all local inference is free.

For a Dynamic Route, attribute billable work to **the executed provider/model/deployment**, not the planned primary. If actual provider/usage cannot yet be corroborated, retain provisional liability and do not settle as if a cheap fallback had run. Concurrent cascade branches consume one parent cap enforced by the canonical ledger; cancellation of unused reservations is idempotent; credits and external provider invoices reconcile through the existing economic authority. No billing capture is performed from unauthenticated client-reported token usage.

## 82. Local Runner capacity and data boundary

Local execution uses registered, authenticated, trusted Runner capability snapshots and an explicitly authorized inference principal. Do not route arbitrary tenants to a shared user's GPU by merely finding an available `localhost` endpoint. Every admission binds:

```text
device/runner owner
allowed tenants/users/projects
model and model-file provenance
available VRAM/RAM and concurrency
GPU/CPU utilization budget
local network/private egress constraints
session/lease revocation epoch
model cold-start and eviction policy
```

A `LOCAL_ONLY` request can defer or return `LOCAL_CAPACITY_UNAVAILABLE`; it never silently enters a cloud fallback, cloud evaluator or cloud guardrail. Preemptive eviction of a pinned model during an unfinished tool/streaming turn must be prohibited unless failure/replan is explicit. Device owner disconnect/consent withdrawal fences new work; if local work is in progress, follow its cancellation/privacy policy. When local capacity cannot meet latency or quality requirements, clearly present alternatives rather than overriding privacy or user selection.

## 83. Multimodal asset boundary and spend envelope

For text, file, image, audio and video input, pass a trusted `AssetManifest` or scoped `AssetRef` rather than arbitrary user URLs into provider fetch APIs. Authorize the asset in the Library/R2 owner plane, validate actual MIME and magic bytes, apply scanning/transcoding as appropriate, and issue short-lived scope- and recipient-bound signed URLs only where the provider requires them. Recheck redirects/SSRF, explicit third-party disclosure, tenant visibility and retention rules. Never forward long-lived R2 credentials or expose other tenant assets through a public link.

Measure media cost on actual dimensions, duration, frame/audio sampling, tokenization and provider-specific charging rules. Model capability certification must include modality-specific files and stream fixtures, limits, upload/error handling and transcript provenance. Background media inference is durable under Section 73. Media vector lifecycle/rehydration continues to belong to Spec 229; Spec 231 chooses an authorized model and prices inference only.

## 84. Release bundle, recovery and cross-spec drift

Treat the following as one signed, reviewable **inference rollout bundle**:

```text
router_policy_revision
logical_model_registry_revision
model_deployment + credential-binding revision
surface_certification_revision
gateway_route_manifest_hash(es)
current billing/pricing snapshot + FX policy
safety/guardrail policy revision
rollback bundle reference
cross-spec contract versions SAH-INFERENCE-2 / SAH-RETRIEVAL-2
```

Activation is gated by the canonical platform policy, a provider-capability recheck and live environment readiness. Blue/green rollout never silently mutates a plan pinned to the old bundle; emergency revocation can fence it. Recovery exercises SHALL include regional failover, loss of billing authority, stale policy, runtime Worker deployment, duplicate Queue deliveries, hung provider stream, route-name repoint and Redis migration overlap. The repository deployment pipeline blocks ambiguous spec IDs and incompatible cross-spec contract versions. Keep a known-good deterministic/static route profile capable of operating when learned-router evaluation/control components are down. Independent Redis/BullMQ migration and Spec 229 index cutover remain separate promotions and separate rollback barriers.

## 85. New R4 fields and compatibility

Extend `SAH-INFERENCE-2` *additively*; no new ledger or job authority:

```ts
interface InferencePlanR4Extension {
  specUid: string;
  specRevision: string;
  rolloutBundleHash: string;
  logicalCallId: string;
  attemptOwnershipEpoch: number;
  routeInvocationPinProof?: string;
  conversationStateManifestRef?: string;
  parentCostCeilingMicros: number;
  overallDeadlineAt: string;
  residencyPolicySnapshotRef: string;
  routerFeatureProvenanceRef: string;
  evalConsentRef?: string;
  selectedSourceRevisionSetHash?: string;
}
interface InferenceReceiptR4Extension {
  intendedModelProfileId: string;
  observedModelProfileId?: string;
  observedProviderId?: string;
  observedDeploymentId?: string;
  gatewayObservationRef?: string;
  observedRouteVersion?: string;
  providerChargeEvidenceRef?: string;
  streamLastCommittedSeq: number;
  executionStatus: "observed" | "unverified" | "policy_mismatch";
  provisionalChargeState?: "none" | "pending" | "reconciled" | "disputed";
}
```

Store the extensions alongside the existing `inference_plans`, `inference_attempts`, `router_policy_versions`, `model_certification_runs`, canonical `worker_jobs`/events and existing credit ledger as appropriate. Introduce a minimal `inference_conversation_state` table *only if* no existing canonical conversation-state table can hold the manifest securely. Outbox events: `INFERENCE_ATTEMPT_CLAIMED`, `INFERENCE_EXECUTION_UNVERIFIED`, `INFERENCE_PROVIDER_MISMATCH`, `INFERENCE_DEADLINE_EXHAUSTED`, `INFERENCE_CONTEXT_MIGRATION_REQUIRED`, `ROUTER_EVAL_DATA_TOMBSTONED`, `INFERENCE_ROUTE_PIN_UNAVAILABLE`, `INFERENCE_ROLLOUT_BUNDLE_ACTIVATED`. Security-relevant absence of R4 fields is never interpreted as permission to use legacy unrestricted behavior. Provide an explicit, tested version-negotiation shim for low-risk R2/R3 callers during rolling deploy.

## 86. Thirty-six new R4 acceptance tests

These tests are additional to R2's 30 and R3's 38 prescribed cases; the counts describe *specified* tests, not tests already run.

1. Both provisional 231 topics exist; unqualified reference fails while title-qualified `spec_uid` resolves deterministically.
2. Registry allocation cannot overwrite an existing spec, open-branch reservation or already published alias.
3. LLM-routing rollout cannot implicitly promote the unrelated Redis migration or RAG reindex.
4. Cross-provider replay with opaque reasoning continuation is blocked unless the target continuation fixture is certified.
5. A valid same-provider stateful continuation retains canonical tool-call IDs and owner binding.
6. A failed state migration produces `CONTEXT_MIGRATION_REQUIRED`, never a fabricated tool result.
7. Dynamic Route's observed model/provider is recorded and mapped to the admitted candidate set.
8. Actual fallback to a provider outside the plan causes quarantine and protected incident evidence.
9. Missing provider identification remains `UNVERIFIED`; it is not silently priced as the planned primary.
10. Client disconnect during a long inline Worker stream does not create an untracked background inference job.
11. `waitUntil` expiry cannot be the sole completion mechanism for a durable inference job.
12. Duplicate Cloudflare Queue delivery returns the original admitted logical call instead of creating a second paid provider submission.
13. Stale fencing epoch cannot dispatch or settle an attempt after takeover.
14. Ambiguous provider timeout without idempotency guarantee enters `UNKNOWN_OUTCOME`, not blind provider replay.
15. First token meets Gateway timeout but overall stream exceeds deadline; SmartAIHub cancels/reports `DEADLINE_EXHAUSTED`.
16. Route name repointed after plan creation is blocked unless the exact version pin is certified.
17. A version-pinned route yields the same approved execution set on predispatch and postexecution verification.
18. Tenant deletion invalidates previously consented raw shadow and derivative routing-training samples where retention rules require it.
19. A private RAG query without evaluation consent is excluded from cross-provider shadow replay.
20. User attempts to force premium route by injecting `risk=critical` or fake retrieval confidence into content; trusted policy prevails.
21. Adversarial long prompts cannot trigger unbounded classifier/judge/cascade spending.
22. Counterfactual metrics show unknown/unobserved candidates as missing, not inferred wins.
23. A randomized low-risk A/B cohort cannot override model lock, budget or locality.
24. Repeated model completion after a tool-effect commit returns the original effect receipt with no duplicate side effect.
25. Tool handoff with missing provider tool-call mapping triggers checkpoint/replan, not silent transcript mutation.
26. Gateway estimated spend and actual provider invoice mismatch remains traceable and does not cause duplicate capture.
27. Local-model cost policy includes device allocation while forbidding unexpected cloud charges.
28. Private local inference cannot be admitted to another user's shared GPU without delegated authorization.
29. Runner withdrawal/offline while `LOCAL_ONLY` work is queued yields a local-only typed outcome.
30. Audio/video assets too large for model/tenant budgets are rejected before provider egress.
31. Expired/revoked signed R2 asset URL cannot be refreshed without current canonical permission.
32. Media job crash requeues through canonical `worker_jobs` and preserves the original billing cap.
33. Approved rollout bundle activates registry, route and safety policy coherently; partial activation is fenced.
34. Rollback restores a tested compatible bundle and leaves in-flight approved plans pinned unless emergency revocation applies.
35. During concurrent Redis migration and router rollout, duplicate wakeups do not create duplicate provider submissions.
36. Emergency loss of billing authority rejects new paid attempts while read-only admin health remains accessible.

## 87. Release order, freeze conditions and implementation disposition

1. **R4.0:** Resolve the duplicate spec-number claim through the live authoritative registry, preserving both topics; commit stable `spec_uid` aliases and CI uniqueness tests. No automatic choice of 232.
2. **R4.1:** Implement session state manifests, API-surface/tool-turn transcript certification and exact route-invocation pin.
3. **R4.2:** Bind canonical job admission, fencing, budget reservation and single-owner retry across current/migrating transports.
4. **R4.3:** Deploy actual provider/deployment attribution, reconciliation and incident mismatch gates.
5. **R4.4:** Add deadline hierarchy, local Runner capacity admission and signed media asset boundary.
6. **R4.5:** Add consented evaluation data lifecycle, feature-provenance security and honest counterfactual experiments.
7. **R4.6:** Integrate versioned rollout bundles, Admin Inspector additions, chaos drills and incremental tenant canary.

**Release-blocking:** unresolved spec-ID collision; cross-tenant/credential/region violation; illegal or unconsented second-model evaluation; duplicate economic capture or unapproved duplicate tool effect; uncertified state handoff; unapproved gateway route drift/model; loss of mandatory audit; unbounded cost; failure of mandatory guardrails; unsound Worker background execution; security-sensitive rollback inconsistency. **Design completeness is not production certification.** Every provider/Workers semantic and all 36 new fault fixtures must be verified against active deployed API versions, alongside all previously prescribed R2/R3 acceptance tests.

## 88. R4 primary verification references

- Cloudflare Dynamic Routing invocation and returned provider/model metadata: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/usage/
- Cloudflare Dynamic Routing availability/endpoint and route versions: https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/
- Cloudflare Workers duration, CPU, memory and `waitUntil` limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Queues at-least-once delivery: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare AI Gateway request handling/first-byte timeout and retry ceilings: https://developers.cloudflare.com/ai-gateway/configuration/request-handling/
- Cloudflare logging metadata versus payload controls: https://developers.cloudflare.com/ai-gateway/observability/logging/
- Cloudflare spend estimation and rule limits: https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- Cloudflare custom providers/HTTPS configuration: https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/
- Companion: Spec 229 R3 `SAH-RETRIEVAL-2`, Spec 220 security authority, Spec 222 learning/replay, Spec 224 durable lifecycle, Spec 230 engineering context, and the *independent* zero-downtime Redis/BullMQ migration document provisionally also numbered 231.
