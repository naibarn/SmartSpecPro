# Spec 212 — SmartAIHub Workflow Template Marketplace, Capability Lab & Product-Grade Continuous Validation
## Black-Box Workflow Design, Compile, Resolve, Execute, Verify, Gap Discovery & Regression System

**Status:** Proposed / Implementation Specification  
**Spec ID:** 212  
**Revision:** 20  
**Date:** 2026-09-20  
**Suggested repository path:** `specs/feature/212-AI Workflow studio capability validation benchmark harness/spec.md`  
**Primary integrated system under test:** Spec 209 — Workflow Studio / AI Builder authoring UX + Spec 214 — Canonical Node Type Contract + Spec 215 — Workflow Compiler & Runtime Execution  
**Companion systems:** Feature 195, Feature 196, Feature 197, Specs 199, 200, 206, 207, 208, 209, 211, 214, 215, Capability Registry/Resolver, Retrieval Broker, Approval Service, Library/Asset, Runner  
**Current canonical corpus:** **2,930 language-independent Use Case identities with required Thai (`th`) and English (`en`) localizations, UC-0001…UC-2930. Revision 20 appends UC-2831…UC-2930 to validate Specs 217–222: white-label Tenant/Product composition, agentic Product development, managed runtime/deployment, governed tenant data/capability access, Skill↔Product capability-gap loops, and harness/context security.**  
**Primary objective:** Operate one unified Workflow Template Marketplace + Capability Lab in which each use case can reuse prepared certified Solution Variants or dynamically synthesize a new method from the user's actual capabilities and constraints, while preserving explicit dependencies, strategy identity, certification evidence, reviews, admin bulk generation and continuous validation.

---

# 0. Executive Decision

SmartAIHub SHALL implement Spec 212 as the **Workflow Template Marketplace, Capability Lab and Product-Grade Continuous Validation system** layered on Spec 209 authoring UX, Spec 214 canonical Node Type contracts and Spec 215 canonical compiler/runtime execution. Spec 212 remains the independent product/validation plane and SHALL NOT own a duplicate node registry, compiler, runtime, queue or Runner control plane.

The benchmark harness remains mandatory, but it is one plane of the broader Marketplace product. Spec 212 SHALL expose curated use cases as discoverable product assets while continuously proving that generated/published templates remain real, executable, portable, policy-compliant, recoverable and independently verifiable.

```text
Natural-Language Use Case
        ↓
Spec 212 Benchmark Harness / Marketplace Requirement
        ↓
Spec 209 AI Workflow Studio / AI Builder
        ↓
Spec 214 Node Registry + NodeTypeManifest resolution
        ↓
Proposed WorkflowDefinition
        ↓
Spec 215 Compiler + Static Validation
        ↓
Capability / Placement / Runtime / Protocol Resolution
        ↓
Policy / Security / Approval Validation
        ↓
Dry-run / Mock / Sandbox / E2E Execution
        ↓
Feature 195 worker_jobs / selected runtime adapters where required
        ↓
Independent Verification
        ↓
Spec 212 Multi-Layer Grading / Certification / Regression Gate
```

The harness MUST distinguish:

```text
"AI can describe a plausible workflow"
```

from:

```text
"SmartAIHub has the real nodes, tools, runtimes, protocols,
permissions, targets, failure handling and verifiers required
to execute the workflow successfully."
```

A plausible diagram containing non-existent capabilities is a failure.

## 0.1 Normative Precedence — Revision 20

Spec 212 contains historical revision sections because the architecture evolved iteratively. When any historical section conflicts with the current contract, **Revision 20 and the latest explicit normative section take precedence**. Historical statements assigning Node Type ownership, compiler/runtime ownership or `workflow.run` semantics wholly to Spec 209 are superseded by the Spec 209/214/215 split defined by Revision 18 and the Mini App product/economic alignment in Revision 19.

Current authoritative artifacts:

```text
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec.md
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-212-use-cases-2930-bilingual.json
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-212-marketplace-catalog-2930-bilingual.json
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-212-corpus-manifest-r20.json
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-212-current-contract-profile-r20.json
specs/feature/209-ai-workflow-studio-miniapp-marketplace/spec.md
specs/feature/214-node-type-contract-architecture/spec.md
specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec-214-spec212-coverage-manifest-r20.json
```

The old 112-node disposition filename is historical evidence only; it is not a current repository artifact or an executable dependency.

Current identity model:

```text
1 Use Case identity
  -> 2 required canonical localizations: th + en
  -> 0..N Solution Variants
  -> 1..N Template Versions per Variant
  -> environment/path-specific certification
```

Historical corpus filenames/counts and pre-split ownership statements in Revision 1–16 sections are retained for migration/audit context only and are **non-authoritative** for new implementation.


## 0.2 Current Contract Index — Revision 20

Implementation SHALL resolve current contracts from this index before consulting historical revision sections.

| Contract area | Current authoritative rule |
|---|---|
| Use Case identity | One language-independent `UC-xxxx` identity with required `th` + `en` localizations |
| Corpus | `spec-212-use-cases-2930-bilingual.json` |
| Marketplace seed | `spec-212-marketplace-catalog-2930-bilingual.json` |
| Corpus integrity | `spec-212-corpus-manifest-r20.json` |
| Workflow authoring UX / AI Builder | Spec 209 R6 canonical authoring façade, Canvas, conversational Builder, Mini App Builder/projection/publication UX, change preview and run controls |
| Canonical Node Type semantics | Spec 214 v5 `NodeTypeManifest`, 16-type taxonomy, bindings/presets and NodeInstance contract; no compatibility aliases for the 112 pre-canonical IDs |
| Workflow compiler / logical runtime | Spec 215 v3 `WorkflowDefinition`, WorkflowInterface, bindings, scopes, policies, instrumentation, compiler, immutable `ExecutionPlan`, `WorkflowRun` / `NodeRun` / `NodeAttempt` semantics |
| Durable jobs | Feature 195 / `worker_jobs` source of truth |
| External agents | Spec 200, with A2A/ACP companion paths from Specs 206/211 |
| Computer Use | Spec 208 |
| Economic authorization | Spec 207 / canonical billing plane; Mini App quote/reservation/charge/allocation/settlement |
| Solution choice | Prepared Variant → user readiness → preference/policy → Dynamic Variant synthesis when needed |
| Dependency evidence | Dependency Manifest + Workflow BOM + attestation + resolution path |
| Certification | Variant × Template Version × Environment Profile × Dependency Path |
| Reviews | Variant-specific, exact Template Version, Verified Use when applicable |
| Admin generation | Durable bulk factory / `AUTO_DISCOVER_VARIANTS` with reproducibility manifest |
| Localization | TH/EN canonical pair + language-aware capability/routing/verification |
| Release quality | Corpus integrity + semantic coverage + language parity + current Revision acceptance gates |

Rules:

1. Historical sections MAY explain migration rationale but SHALL NOT override this index.
2. Any future Revision SHALL update this index in the same change as its canonical artifacts.
3. CI SHOULD fail when front-matter, this index and the corpus manifest disagree.
4. Code generators/documentation extractors SHALL prefer explicitly marked current contracts over historical examples.

---

# 1. Why Spec 212 Exists

Spec 209 composes deterministic functions, LLM/model calls, OpenAI Agents SDK, PydanticAI, internal agents, external agents, MCP, A2A, ACP, Runner, Spec 208 Computer Use, Jev, Cua Driver / Visual CUA, Library/RAG, approvals, schedules, Mini Apps and Marketplace.

The product risk is therefore broader than ordinary code defects.

The key risk is:

> **AI Builder can produce a workflow that looks correct but cannot actually execute end-to-end.**

Typical failures:

```text
hallucinated node
hallucinated tool
wrong schema
invalid edge
missing runtime
unavailable agent
missing Runner capability
unsafe retry
missing approval
missing verifier
wrong execution target
local-only data routed to cloud
agent lacks repo/file access
workflow designs but does not compile
workflow compiles but cannot dispatch
workflow executes but cannot verify the outcome
```

Spec 212 exists to expose these gaps systematically.

---

# 2. Relationship to Specs 209, 214 and 215

Spec 212 validates the integrated workflow product, but ownership is deliberately split:

```text
Spec 209 = Workflow Studio / AI Builder authoring UX and API façade
Spec 214 = Canonical 16-type taxonomy, NodeTypeManifest, binding/preset discovery and NodeInstance contract
Spec 215 = WorkflowDefinition execution normalization, compiler, immutable ExecutionPlan and logical runtime
Feature 195 = durable physical worker_jobs source of truth
Spec 212 = Marketplace / Use Cases / Solution Variants / Capability Lab / certification / regression
```

Spec 212 SHALL NOT create another:

- Workflow Studio or AI Builder;
- Node Type Registry;
- Workflow Compiler or logical runtime state machine;
- Capability Registry/Resolver;
- durable job queue;
- Runner control plane;
- MCP/A2A/ACP gateway;
- Computer Use engine;
- billing ledger.

Revision 17 expands the black-box validation boundary from “Spec 209 alone” to the authoring-to-execution chain:

```text
Use Case / Template requirement (Spec 212)
  → Authoring / generation (Spec 209)
  → Node reality / contract resolution (Spec 214)
  → Compile / execute / resume / recover (Spec 215)
  → worker_jobs / runtime adapters where needed (Feature 195 and companion specs)
  → Verification / certification / regression (Spec 212)
```

**Canonical ownership rule:** historical text that says Spec 209 alone owns Workflow Definition, compiler, runtime or `workflow.run` SHALL be interpreted as pre-split architecture. After Revision 17, Spec 209 remains the user-facing authoring/run façade; Spec 214 owns node contracts; Spec 215 owns compiler/runtime semantics.

Spec 212 remains free to define Use Cases, expected invariants, Solution Variants and verification criteria, but MUST express executable graphs using real Spec 214 Node Types and MUST execute them through Spec 215. Revision 18 additionally requires workflow inputs/outputs, context/secrets, parallel fan-out, retry/checkpoint and observability to use the non-node constructs defined by Spec 215 rather than synthetic Node Types. It MUST NOT bypass those contracts by inventing test-only nodes or a benchmark-only execution engine.

---

# 3. Black-Box First

Primary input is the same kind of natural-language outcome a real user gives AI Workflow Studio.

Example:

```text
"แก้ issue นี้ใน repository แล้วรัน test เปิดหน้าเว็บตรวจ UI
และสร้าง PR ถ้าผ่านทั้งหมด"
```

Spec 212 calls canonical Spec 209 APIs and captures the workflow that AI Workflow Studio itself designed.

It MUST NOT bypass AI Builder by manually assembling the graph for the test.

---

# 4. Do Not Let the Designer Be the Sole Judge

The AI call that generated the workflow cannot be the only authority deciding whether it is valid.

Validation layers:

```text
1. Deterministic schema validation
2. Graph/control-flow validation
3. Data-binding/type validation
4. Capability Registry reality validation
5. Runtime/protocol/target feasibility validation
6. Policy/security/approval validation
7. Controlled execution evidence
8. Independent verification
9. Optional semantic AI judge
```

AI semantic judgment can complement but never override hard evidence.

---

# 5. Seed Corpus

Revision 1 SHALL ship with:

```text
400 broad end-user automation cases
150 canonical Spec 209 cases
250 SmartAIHub-native product/media cases
200 Revision-3 gap-closure cases
-----------------------------------------
1,000 cases
```

The broad set exercises realistic work across web, office, CRM, support, finance, HR, ecommerce, social, media, development, QA, legacy systems, procurement, research, marketing, SEO, IT, security, desktop and multi-agent automation.

The canonical set directly probes Spec 209 authoring, modification, graph logic, multi-agent behavior, runtime resolution, protocols, Spec 208 Computer Use, data/RAG, human-in-the-loop, durability, debugging, optimization, Mini Apps, Marketplace and security.

---

# 6. BenchmarkCase Contract

```json
{
  "case_id": "CAN-042",
  "corpus_version": "sah-wf-bench-1",
  "family": "spec209_canonical",
  "category": "MULTIAGENT",
  "user_prompt": "...",
  "context_profile": "...",
  "fixtures": [],
  "preconditions": [],
  "required_semantics": [],
  "forbidden_semantics": [],
  "expected_invariants": [],
  "risk_class": "R0|R1|R2|R3|R4",
  "minimum_test_level": "L0|L1|L2|L3|L4|L5",
  "execution_allowed": true,
  "owner_specs": []
}
```

**Current canonical benchmark artifacts are Revision 20: `spec-212-use-cases-2930-bilingual.json` and `spec-212-marketplace-catalog-2930-bilingual.json`.** Earlier corpus filenames appearing in historical revision sections are superseded artifacts and MUST NOT be used as the current source of truth. The repository-local source of truth is this `spec.md` plus the R20 companion manifests in the same feature directory; R19 artifacts remain historical evidence only.

---

# 7. Multiple Valid Graphs Are Allowed

One user request can have several correct workflow designs.

Therefore the default test is not:

```text
actual_graph == exact_golden_graph
```

Instead, evaluate semantic invariants.

Example:

```text
Goal:
Codex implement → tests → Claude review → repair if needed → PR
```

Possible graph shapes may vary, but the benchmark can require:

```text
repository context available
implementation capability real
tests before PR
review after implementation
repair/retry path exists
PR gated by verification
external agents use scoped repo access
side effects auditable
```

---

# 8. Required Design Report

For every case, capture:

```text
nodes
edges
branches
loops
subflows
inputs
outputs
data bindings
approvals
verification
retry
repair
fallback
replan
```

For each node record:

```text
node_id
logical node type
purpose
input/output schema
required capability
candidate/selected runtime
tool or agent dependency
protocol
execution target constraint
permission
side-effect class
approval
verification
failure policy
```

---

# 9. Node Reality Validation

Every generated node must map to a real canonical node family such as:

```text
Trigger
Input
Deterministic Transform
Model
Agent
Tool / Capability
Retrieval
Subflow
Condition
Router
Parallel / Fan-Out
Join / Merge
Loop / Iteration
Human Approval
Human Input
Wait / Timer
Computer Use
Artifact
Verifier / Evaluator
Output
Notification
```

Unknown executable node type → `HALLUCINATED_NODE`.

---

# 10. Capability Reality Validation

For every required capability validate against a pinned Capability Registry snapshot:

```text
exists
version compatible
schema compatible
tenant/user eligible
health known
connection modeled
secret reference modeled
execution target available
runtime available
residency compatible
budget eligible
```

Missing capability must be explicit, never invented.

---

# 11. Tool Reality Validation

Validate:

```text
tool registered
schema correct
inputs producible
outputs bindable
permission scope representable
side effect correctly classified
not quarantined/revoked
```

Families include SmartAIHub Skill, internal service, MCP, A2A, external agent, Runner capability, Computer Use, Library/Retrieval and model/media providers.

---

# 12. Runtime Feasibility

Validate supported runtime families:

```text
Native
Single Model Call
OpenAI Agents SDK
PydanticAI
A2A
External Agent
ACP
Spec 208 Computer Use
Runner
Cloud/Browser runtime
```

Check adapter existence, certification, modality, protocol support, tool access, locality, repo/file access, browser session, residency, budget and provider/account availability.

---

# 13. Runtime ≠ Protocol ≠ Execution Target

Example:

```text
Logical Agent = Codex
Protocol = ACP
Session Runtime = direct_runner
Execution Target = USER_RUNNER
```

Another:

```text
Logical Agent = Partner Research Agent
Protocol = A2A
Execution Target = REMOTE_AGENT
```

The benchmark validates each dimension independently.

---

# 14. Data-Binding Validation

Every edge is checked:

```text
source schema
→ binding / transform
→ destination schema
```

Validate nullability, cardinality, MIME/media type, artifact references, secrets, mutable snapshots, collection fan-out and safe transforms.

---

# 15. Control-Flow Validation

Validate:

```text
reachability
cycle policy
bounded loops
parallel reducer/merge
branch completeness
wait/timeout
approval resume
child lifecycle
cancellation
terminal states
bounded runtime expansion
```

---

# 16. Retry, Repair, Fallback, Replan

The harness enforces distinction:

```text
Retry    = same semantic action again
Repair   = fix invalid output/local state
Fallback = equivalent implementation
Replan   = higher-level strategy change
```

Non-idempotent unknown outcome must reconcile before retry.

---

# 17. Risk & Approval Validation

Suggested risk classes:

```text
R0 READ_ONLY
R1 LOW_WRITE
R2 EXTERNAL_WRITE
R3 PUBLISH_DELETE_DEPLOY
R4 ECONOMIC_OR_CRITICAL
```

Detect missing approval, self-approval, overly broad grants, approval after side effect, changed parameters after approval and fallback that bypasses approval.

---

# 18. Verification Is Mandatory for Material Outcomes

Provider success is not final success.

Examples:

```text
upload → destination contains expected artifact
PR → actual PR identity/state exists
publish → correct account/content/state exists
render → output exists and metadata passes
write → committed record exists
Computer Use → observable business/UI state changed
```

`DONE` from a model is not sufficient evidence.

---

# 19. Test Depth Levels

```text
L0 Goal Parse
L1 Workflow Design
L2 Compile + Resolve
L3 Deterministic Mock Execution
L4 Sandbox Integration
L5 Controlled Real E2E Certification
```

A case can pass L2 and fail L5. The dashboard must show this honestly.

---

# 20. Support Status Taxonomy

```text
FULLY_SUPPORTED
SUPPORTED_WITH_FALLBACK
SUPPORTED_REQUIRES_HUMAN
PARTIALLY_SUPPORTED
BLOCKED_MISSING_CAPABILITY
BLOCKED_MISSING_RUNTIME
BLOCKED_MISSING_INTEGRATION
BLOCKED_ENVIRONMENT
POLICY_BLOCKED_AS_DESIGNED
UNSUPPORTED
DESIGN_INVALID
HALLUCINATED_DEPENDENCY
EXECUTION_FAILED
VERIFICATION_FAILED
FLAKY
NOT_YET_EXECUTED
```

---

# 21. Gap Taxonomy

```text
GAP_WORKFLOW_AUTHORING
GAP_NODE_TYPE
GAP_COMPILER
GAP_SCHEMA_BINDING
GAP_CAPABILITY_REGISTRY
GAP_RUNTIME_RESOLVER
GAP_MODEL_PROVIDER
GAP_MCP
GAP_A2A
GAP_EXTERNAL_AGENT
GAP_ACP
GAP_RUNNER
GAP_COMPUTER_USE
GAP_JEV
GAP_CUA_DRIVER
GAP_VISUAL_CUA
GAP_RAG_CONTEXT
GAP_APPROVAL
GAP_SECURITY_POLICY
GAP_BILLING
GAP_ARTIFACT
GAP_DURABILITY
GAP_VERIFICATION
GAP_MINI_APP
GAP_MARKETPLACE
GAP_UX
```

---

# 22. Canonical Gap Owner

| Gap | Owner |
|---|---|
| Workflow authoring/schema/compiler | Spec 209 |
| Goal/replan/shared orchestration | Feature 196 |
| Durable jobs | Feature 195 |
| Runner/local execution | Feature 197 |
| MCP | Spec 199 |
| External Agent Gateway | Spec 200 |
| A2A | Spec 206 |
| Economics | Spec 207 |
| Browser/Desktop Computer Use | Spec 208 |
| Orca | Spec 210 |
| ACP/Gas City Runtime Fabric | Spec 211 |
| Capability Registry | Shared platform |
| Retrieval/RAG | Shared Retrieval Broker |
| Approval | Shared Approval Service |
| Artifacts | Library/Asset |

Spec 212 must not blame every failure on Spec 209.

---

# 23. Environment Profiles

Examples:

```text
minimal_cloud
full_cloud
server_runner_linux
windows_runner
mac_runner
local_existing_browser
managed_browser
cloud_browser
repo_with_codex
repo_with_claude
a2a_partner_available
mcp_full
mcp_partial
offline_runner
strict_local_only
marketplace_consumer
```

This separates product gaps from local installation/configuration gaps.

---

# 24. Fixtures

Fixtures can include:

```text
sample repository
sample CRM
sample invoices
sample spreadsheets
sample media
sample PDFs
test website
mock ecommerce store
fake support tickets
synthetic inbox
test browser profile
fake Runner
fake external agents
fake MCP server
fake A2A agent
fake Computer Use surface
```

---

# 25. Deterministic Execution Lab

Build fake implementations for:

```text
OpenAI Agents runtime
PydanticAI runtime
MCP
A2A
ACP coding agent
Runner
Browser
Computer Use
Jev
Visual CUA
Human approval
Library
Billing
```

Each fake can produce success, timeout, disconnect, invalid output, permission denial, approval wait, duplicate event, lost session, partial artifact and unknown outcome.

---

# 26. Spec 208 Routing Benchmark

For the broad corpus, validate preference for structured capability before lower-level UI automation when eligible.

Detect:

```text
UNNECESSARY_COMPUTER_USE
UNNECESSARY_VISUAL_CUA
MISSING_COMPUTER_USE_FALLBACK
COMPUTER_USE_POLICY_BYPASS
```

---

# 27. Jev / Cua / Visual CUA Checks

**Jev:** bounded candidate set, valid choice, calibration/abstention.

**Cua Driver / ComputerUseDriver:** target binding, fresh observation, action execution, platform capability, reconnect/rebind.

**Visual CUA:** only when needed/allowed, bounded action, current observation, policy validation, independent verification.

---

# 28. Multi-Agent Checks

Validate:

```text
role decomposition
context minimization
capability fit
parallel safety
handoff contracts
aggregation
verifier independence
bounded child creation
cancellation
cost envelope
provenance
```

More agents is not automatically better.

---

# 29. Complexity Metrics

Record:

```text
node_count
edge_count
branch_count
parallel_width
max_depth
loop_count
subflow_count
agent_count
external_agent_count
computer_use_count
approval_count
estimated_runtime
estimated_cost
```

---

# 30. Minimal-Sufficient Design

Priority:

```text
correctness
→ safety
→ capability reality
→ verification
→ simplicity
→ cost/latency optimization
```

The harness should identify needless orchestration complexity.

---

# 31. Independent Semantic Judge

Optional AI judge evaluates:

```text
Does the workflow satisfy the actual goal?
Are material steps missing?
Are constraints preserved?
Is the decomposition sensible?
Is the final output sufficient?
```

It receives normalized evidence, not private chain-of-thought.

---

# 32. Judge Reliability

High-value release gating should pin judge/rubric versions, use deterministic evidence, maintain human-reviewed goldens, measure false-pass/false-fail and never allow a score to override a hard safety failure.

---

# 33. Scoring Dimensions

Suggested 0–100 dimensions:

```text
Goal Coverage
Graph Correctness
Capability Reality
Binding Correctness
Runtime Feasibility
Safety / Policy
Durability
Verification Quality
Fallback / Recovery
User Experience
Cost / Efficiency
Observability
```

Hard blockers override numeric score.

---

# 34. Product-Grade Coverage

Track separately:

```text
Design Coverage
Compile Coverage
Resolvable Coverage
Mock Execution Coverage
Sandbox E2E Coverage
Verified E2E Coverage
```

Never collapse these into one misleading number.

---

# 35. Coverage Slices

Dashboard filters:

```text
domain
node type
capability kind
runtime
protocol
execution target
risk
approval
Computer Use
external agent
RAG
Mini App
Marketplace
resume
parallel
loop
subflow
side effect
```

---

# 36. Node Coverage

For each registered node type show number of cases, design pass, compile pass, execution pass, verification pass and top failure causes.

---

# 37. Capability Coverage

For each capability show:

```text
expected by cases
selected by AI Builder
resolved
executed
verified
fallback rate
failure rate
```

This detects capabilities that exist but are not selected correctly.

---

# 38. Negative Tests

Cases should include requests that must be rejected or constrained.

Correct result may be:

```text
POLICY_BLOCKED_AS_DESIGNED
```

That counts as a pass.

---

# 39. Ambiguity Tests

Test whether the Builder safely requests clarification or creates a configurable input for materially ambiguous goals, instead of guessing consequential targets.

---

# 40. Prompt Variation

Test semantic-equivalent prompts across Thai formal/casual, English, short commands, long descriptions, messy notes, business language and technical language.

---

# 41. Mutation Testing

Mutate passing cases by revoking permissions, removing runtimes, changing schemas, setting local-only, reducing budget, disconnecting Runner, changing price or removing browser login.

Expected behavior must adapt or fail safely.

---

# 42. Failure Injection

Inject deterministic failure:

```text
before node
during external call
after side effect before acknowledgement
during artifact upload
during checkpoint
during approval wait
after child spawn
during navigation
during Runner reconnect
```

---

# 43. Differential Testing

Run same case against baseline/candidate Builder, different model, compiler, Runtime Resolver or prompt revision and compare semantic/e2e behavior.

---

# 44. Regression Baseline

Detect:

```text
new unsupported case
new hallucinated capability
new approval omission
new unsafe fallback
more unnecessary Computer Use
worse success rate
higher cost/latency
new privacy/residency violation
```

---

# 45. Semantic Workflow Fingerprint

Diff normalized semantics rather than raw IDs/layout:

```text
node roles
capability requirements
control edges
data dependencies
side effects
approval boundaries
verification boundaries
runtime constraints
```

---

# 46. Reproducibility Snapshot

Every suite run stores corpus version, case version, Spec 209 build, AI Builder template/model, Capability Registry hash, runtime registry snapshot, policy revision, compiler/resolver version, Runner/adapter versions, fixtures and judge version.

---

# 47. API Family

Recommended internal APIs:

```text
POST /internal/workflow-bench/runs
GET  /internal/workflow-bench/runs/:id
GET  /internal/workflow-bench/runs/:id/cases
GET  /internal/workflow-bench/cases/:case_id
POST /internal/workflow-bench/cases/:case_id/run
POST /internal/workflow-bench/cases/:case_id/replay
POST /internal/workflow-bench/corpus/import
POST /internal/workflow-bench/corpus/generate-variants
GET  /internal/workflow-bench/coverage
GET  /internal/workflow-bench/gaps
```

---

# 48. WorkflowStudioTestAdapter

```text
create_from_prompt()
patch_from_prompt()
validate()
compile()
resolve()
dry_run()
execute()
inspect()
```

The adapter MUST call canonical Spec 209 services rather than duplicate them.

---

# 49. Run Model

```text
BenchmarkRun
  ├ corpus_version
  ├ environment_profile
  ├ system_snapshot
  └ case_runs[]

BenchmarkCaseRun
  ├ input
  ├ design
  ├ compile_result
  ├ resolution_result
  ├ execution_result
  ├ verification_result
  ├ grading
  ├ gaps[]
  └ evidence[]
```

---

# 50. Evidence Bundle

Every case produces:

```text
original prompt
workflow definition
semantic graph
compiler diagnostics
capability resolution
runtime resolution
policy decisions
execution events
artifacts
verification evidence
cost/usage
grader findings
gap ownership
```

---

# 51. Persistence

Suggested tables:

```text
workflow_benchmark_corpora
workflow_benchmark_cases
workflow_benchmark_runs
workflow_benchmark_case_runs
workflow_benchmark_assertions
workflow_benchmark_evidence
workflow_benchmark_gaps
workflow_benchmark_regressions
```

Reference canonical workflow/job/artifact IDs instead of copying their state.

---

# 52. Benchmark Runs Use Feature 195

A 1,000-case suite is itself long-running.

```text
Benchmark Suite
→ parent worker_job
→ sharded child jobs
→ case executions
```

Respect concurrency and provider limits.

---

# 53. Isolation

Default to:

```text
test tenant
sandbox accounts
ephemeral Library namespace
temporary repositories
managed browser profiles
mock providers
explicit E2E integrations
```

No uncontrolled production side effects.

---

# 54. Cost Controls

Support max credits/suite, max cost/case, max tokens, max external-agent turns, max Computer Use steps, concurrency, provider allowlists and mock-first mode.

---

# 55. CI Modes

```text
PR Smoke:
20 critical golden cases, L1-L3

Nightly:
150 canonical cases, L1-L4

Weekly Full:
1,000 seed cases, L1-L4 + selected L5

Release Candidate:
all critical + canonical + certified E2E matrix
```

---

# 56. 20 Critical Golden Families

1. Natural-language create  
2. Natural-language modify + diff  
3. Conditional  
4. Parallel + deterministic join  
5. Approval wait/resume  
6. Retry vs repair  
7. External agent  
8. A2A  
9. MCP  
10. ACP coding agent  
11. Runner long job  
12. Structured Computer Use  
13. Visual CUA fallback  
14. Human takeover  
15. Retrieval/Library  
16. Local-only routing  
17. Budget/cost revalidation  
18. Mini App  
19. Marketplace  
20. Unknown-outcome reconciliation

---

# 57. Promote Detailed Goldens

At least 40 cases should eventually include exact fixtures, invariants, risk, allowed/forbidden routes, failure injections, artifacts and verification rules.

---

# 58. Automatic Corpus Expansion

Candidate cases may be generated from new capabilities, failures, new protocols/runtimes, support tickets and privacy-safe real user intents.

Generated cases require review before becoming canonical.

---

# 59. Real-User Intent Promotion

```text
real intent
→ detect novel gap
→ privacy-safe abstraction
→ candidate benchmark
→ review
→ canonical corpus
```

Do not ingest raw customer data blindly.

---

# 60. Gap-to-Product Loop

```text
Gap
→ canonical owner
→ issue/spec amendment
→ implementation
→ replay same benchmark
→ resolved or remains
```

---

# 61. No Benchmark Gaming

Spec 212 may recommend a new node/capability/adapter/spec amendment but must not automatically alter production architecture simply to turn a red test green.

---

# 62. Product-Grade Release Blockers

Critical-case blockers:

```text
hallucinated executable capability
permission bypass
approval bypass
residency violation
secret leak
unbounded loop
unsafe blind retry
wrong-account side effect
unverified R4 outcome
duplicate external/economic side effect
loss of durable run
cross-tenant leakage
```

---

# 63. Warning-Level Regressions

Examples:

```text
higher node count
higher cost
higher latency
less optimal route
more human intervention
unnecessary but safe fallback
non-critical UX regression
```

---

# 64. Dashboard

Top-level example:

```text
AI Workflow Studio Capability Lab

Corpus: 1,000
Build: ...
Environment: ...

Design:      96%
Compile:     93%
Resolvable:  88%
Sandbox E2E: 79%
Verified E2E:42%

Critical blockers: 3
New regressions: 7
Capability gaps: 18
Runtime gaps: 6
```

---

# 65. Case Detail

Show:

```text
Original request
→ Generated graph
→ Node table
→ Capability/runtime resolution
→ Validation findings
→ Execution timeline
→ Verification
→ Status/score
→ Gaps + owner
```

---

# 66. Graph Comparison

Semantic diff should highlight changed logical nodes, capability, approvals, verifiers, runtime constraints, side effects and fallback; ignore cosmetic layout.

---

# 67. Gap Dashboard

Group by root cause and canonical owner so engineering sees whether incompleteness is in Spec 209, Spec 208, MCP, external agents, Runner, Registry or environment.

---

# 68. Demand Heatmap

Use benchmark demand frequency + support + failure rate + implementation cost + product value to inform roadmap prioritization.

---

# 69. Product Gap vs Environment Gap

Example:

```text
Product supports Codex ACP
but this test Runner is not logged in
→ BLOCKED_ENVIRONMENT
```

not `UNSUPPORTED`.

---

# 70. Explain Partial Support

A partial case must state which stages pass and the exact remaining blocker.

---

# 71. Versioned Corpus

Use immutable versions:

```text
sah-wf-bench-1
sah-wf-bench-2
...
```

---

# 72. Case Lifecycle

```text
DRAFT
REVIEWED
CANONICAL
GOLDEN
DEPRECATED
```

---

# 73. Test Selection

Allow ID, tag, spec owner, risk, runtime, protocol, domain, changed-code mapping, random sample and full suite.

---

# 74. Flakiness

Never silently retry until green. Record first result, retries, instability source and flake rate.

---

# 75. Provider / Runtime Drift

Track regressions caused by model/runtime/browser/protocol upgrades and require canary before broad promotion.

---

# 76. Harness Security

Admin/developer access, test tenant, secret references, egress policy, controlled profiles, L5 audit, dangerous-action allowlists and kill switch are mandatory.

---

# 77. Strategy Comparison

Selected cases may compare:

```text
Auto
SmartAIHub-only
External Agent
Hybrid
Pinned runtime
```

using technical metrics such as success, verification, cost, latency and human intervention.

---

# 78. Spec 209 Definition-of-Done Integration

Future Spec 209 revisions SHOULD reference Spec 212:

```text
AI Workflow Studio cannot claim Product-Grade status
until critical golden tests pass and canonical coverage
meets the current release policy.
```

---

# 79. Suggested Initial Release Gates

```text
20 Critical:
  100% L1-L3
  100% safety invariants
  >=95% L4 where applicable
  0 critical blockers

150 Canonical:
  >=95% design
  >=92% compile
  >=85% resolve
  >=75% applicable L4

400 Broad:
  initially track coverage/gaps;
  do not require 100% E2E.
```

Raise thresholds over time.

---

# 80. Architecture

```text
                  Spec 212
       Workflow Capability Benchmark
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
 Corpus Manager  Suite Runner  Dashboard/API
       │            │
       └──────┬─────┘
              ▼
    WorkflowStudioTestAdapter
              │
              ▼
            Spec 209
       Builder / Compiler
              │
              ▼
      Validation Pipeline
 Schema / Graph / Binding /
 Capability / Policy / Runtime
              │
              ▼
         Execution Lab
    Mock / Sandbox / Real E2E
              │
              ▼
            Evidence
              │
              ▼
     Grader / Gap Classifier
        │               │
        ▼               ▼
 Coverage           Regression
 Dashboard            Gate
```

---

# 81. Recommended Modules

```text
server/workflow-benchmark/
  corpus/
  runner/
  workflow-studio-adapter/
  validators/
  execution-lab/
  fixtures/
  failure-injection/
  graders/
  gap-classifier/
  evidence/
  regression/
  coverage/
  api/

web/features/workflow-benchmark/
  dashboard/
  cases/
  runs/
  gaps/
  coverage/
  compare/
```

---

# 82. Implementation Phases

**Phase 0:** contracts/status/gap/evidence models  
**Phase 1:** invoke Spec 209 + design/compile validators + 150 canonical  
**Phase 2:** deterministic mock execution/failure injection  
**Phase 3:** Spec 208 + Runner + browser/Computer Use lab  
**Phase 4:** full 1,000-case corpus + dashboards  
**Phase 5:** controlled E2E certification  
**Phase 6:** CI/nightly/release benchmark + real-user intent promotion

---

# 83. Acceptance Criteria — Core

- [ ] Load/version 1,000 seed prompts from the canonical prompt-only JSON corpus.
- [ ] Send natural-language prompts to Spec 209.
- [ ] Capture generated Workflow Definition.
- [ ] Enumerate nodes/edges/tools/runtime requirements.
- [ ] Validate nodes against real schemas/Registry.
- [ ] Validate bindings.
- [ ] Compile workflow.
- [ ] Resolve capabilities/runtime/target.
- [ ] Distinguish environment gap vs product gap.
- [ ] Produce complete feasibility report.

---

# 84. Acceptance Criteria — Execution

- [ ] L0–L5 supported.
- [ ] Mock runtimes deterministic.
- [ ] Sandbox isolated.
- [ ] Suite uses durable jobs.
- [ ] Failure injection reproducible.
- [ ] Approval/resume testable.
- [ ] Runner reconnect testable.
- [ ] Duplicate event testable.
- [ ] Unknown outcome testable.
- [ ] Artifacts collected as evidence.

---

# 85. Acceptance Criteria — Grading

- [ ] AI judge cannot override deterministic failure.
- [ ] Judge/rubric versioned.
- [ ] Unsupported/environment/policy statuses distinct.
- [ ] Safety blocker overrides score.
- [ ] Failure explanation is actionable.
- [ ] Gap maps to canonical owner.
- [ ] Regression uses semantic graph comparison.
- [ ] Flakiness visible.

---

# 86. Acceptance Criteria — Product Completeness

- [ ] Coverage by domain/node/runtime/protocol visible.
- [ ] Spec 208 coverage visible.
- [ ] External-agent coverage visible.
- [ ] Approval/risk coverage visible.
- [ ] Durability/resume coverage visible.
- [ ] Mini App/Marketplace coverage visible.
- [ ] High-demand missing capability can be identified.
- [ ] Product-grade claims tie to measurable gates.

---

# 87. Non-Goals

Spec 212 does not guarantee every imaginable workflow, replace component/unit tests, require one exact graph, automatically create missing capabilities, use production data to force passes, or use one model judge as truth.

---

# 88. Architectural Invariants

1. Test through Spec 209.  
2. Natural language is the primary test input.  
3. Design success != compile success.  
4. Compile success != resolvability.  
5. Resolvability != execution success.  
6. Execution success != verified outcome.  
7. Designer cannot be sole judge.  
8. Tools/runtimes must be real registered capabilities.  
9. Exact golden graph usually unnecessary.  
10. Safety invariants override score.  
11. Product gaps and environment gaps remain distinct.  
12. Failures map to correct companion owner.  
13. Real side effects are isolated and governed.  
14. Results are reproducible/versioned.  
15. Real-user gaps can promote into future canonical tests.

---

# 89. Definition of Done

For every use case the system must be able to answer:

```text
What workflow was designed?
What node types were used?
How are they connected?
What data moves between nodes?
What tool/capability does each node need?
Do those capabilities actually exist?
Which runtime/protocol/target executes each node?
Are permissions/approvals correct?
Does it compile?
Can it resolve here?
Can it execute in mock/sandbox/E2E?
How is success independently verified?
What happens on failure?
Are retry/resume/replan safe?
What is the final support status?
If unsupported, what exact gap exists?
Which spec/component owns it?
Did this release regress?
```

---

# 90. Final Principle

> **Do not measure SmartAIHub by how many nodes, agents or integrations it contains. Measure whether a real user's desired outcome can be converted by AI Workflow Studio into a valid, executable, policy-compliant, recoverable and independently verifiable workflow using capabilities that actually exist.**

Spec 212 turns that requirement into a continuously measurable engineering system.

---

# Appendix A — Seed Corpus Summary

```text
Broad end-user automation: 400
Spec 209 canonical:        150
SmartAIHub-native:         250
------------------------------
Total:                     1,000
```

Companion machine-readable file:

`spec-212-use-cases-1210.json`




---

#
# 91. Revision 2 — SmartAIHub-Native Product Coverage (retained in Revision 3)

Revision 2 historically expanded the benchmark from **550 → 800 cases** by adding **250 SmartAIHub-native product workflows**; Revision 3 retains those cases and adds 200 more.

The purpose is to test not only generic workflow orchestration but the real product surface that SmartAIHub already exposes or is actively developing.

The benchmark SHALL cover at least:

```text
Drama Series
Storyboard
Media Studio
Product Auto Review
Product Advertising
Video Generation
Image Generation
Audio / TTS / Music / SFX
Video Edit
AI Rough Cut
AI Editor / Director
Subtitle / ASR / Lip Sync
Library / R2 assets
Vector / semantic asset retrieval
Character reuse
Scene/background reuse
Model/provider routing
Runner-based media processing
Publish / social distribution
Analytics / optimization feedback
```

Spec 212 MUST therefore evaluate whether AI Workflow Studio can compose **existing SmartAIHub products and capabilities into real workflows**, not merely generic Agent/Tool nodes.

---

# 92. SmartAIHub Product Capability Inventory Snapshot

Every benchmark run SHALL snapshot a machine-readable inventory of available SmartAIHub product capabilities.

Conceptual inventory:

```text
Drama Series
  ├ story/episode planning
  ├ character extraction/locking
  ├ shot generation
  ├ continuity/QC
  └ episode artifacts

Storyboard
  ├ product presets
  ├ character references
  ├ product references
  ├ background references
  ├ dialogue/no-dialogue
  └ 9-shot output

Media Studio
  ├ image generation
  ├ image-to-image
  ├ video generation
  ├ image-to-video
  ├ audio/TTS/music
  └ provider/model policies

Product Auto Review
  ├ product understanding
  ├ script
  ├ storyboard
  ├ generation
  ├ edit
  └ publish

Video Editing
  ├ transcription
  ├ rough cut
  ├ EDL
  ├ semantic scene score
  ├ B-roll
  ├ reframing
  ├ subtitles
  ├ audio mix
  ├ render
  └ QC

Library / Asset
  ├ R2 object
  ├ metadata
  ├ vector embedding/index
  ├ provenance
  ├ project/character/scene/product relations
  └ materialization grants
```

The benchmark SHALL fail if AI Builder references a product feature that is not registered, unavailable or incompatible in the current build.

---

# 93. Product-Aware Workflow Nodes vs Logical Capabilities

Spec 212 SHALL not force Spec 209 to create a unique hard-coded node type for every product feature.

Preferred:

```text
logical capability
+ schema
+ product/runtime binding
```

Examples:

```text
media.image.generate
media.video.generate
storyboard.generate
drama.episode.plan
video.rough_cut
video.render
library.semantic_search
character.reference.resolve
product.review.generate
```

rather than creating hundreds of vendor/product-specific node classes.

The benchmark should accept different graph designs if they resolve to equivalent registered capabilities.

---

# 94. Vector DB + R2 Retrieval Benchmark

A major SmartAIHub capability class is semantic asset retrieval.

The benchmark SHALL test flows such as:

> "หาภาพเกี่ยวกับแมว แล้วตัดต่อเป็นวิดีโอแมวน่ารัก"

Expected logical route:

```text
User goal
  ↓
Asset Retrieval Node
  ↓
Vector search: "แมว / cute cat"
  +
metadata filters
  ↓
Library/R2 AssetRefs
  ↓
deduplicate / rank / quality filter
  ↓
Edit Planning
  ↓
Video Editing
  ↓
Music / Subtitle / Effects
  ↓
Render
  ↓
QC
  ↓
Library result
```

Required checks:

```text
semantic query correctness
metadata filter correctness
tenant/project access
R2 asset existence
vector hit → canonical AssetRef mapping
near-duplicate handling
quality/resolution eligibility
aspect-ratio eligibility
provenance
materialization grant
Runner access
final asset lineage
```

Vector DB result IDs SHALL NOT replace canonical Library/Asset identity.

---

# 95. Character / IP Asset Reuse Benchmark

Example:

> "เอาตัวละครจากเรื่อง คู่กัดลวงรัก มาทำเป็นวิดีโอรีวิวร้านกาแฟ"

The benchmark SHALL require AI Workflow Studio to reason approximately as:

```text
Resolve project/story
  ↓
Resolve named characters
  ↓
Retrieve character reference pack
  ↓
Retrieve character/personality/canon context
  ↓
Select café concept / location assets
  ↓
Create review script
  ↓
Storyboard
  ↓
Generate keyframes
  ↓
Generate video
  ↓
Identity / continuity QC
  ↓
Edit
  ↓
Final QC
  ↓
Publish or return artifact
```

The benchmark SHALL validate:

```text
correct character assets
correct project ownership/permission
face/age/identity lock requirements
character canon/personality context
no accidental character substitution
character provenance on generated artifacts
continuity checks before final output
```

This test class is critical because it verifies reuse of SmartAIHub's own accumulated creative assets instead of generating everything from zero.

---

# 96. Storyboard Benchmark

Storyboard use cases SHALL cover:

```text
1–4 people
1–5 product images
optional background
with dialogue
without dialogue
Thai dialogue
9 shots
vertical format
product-specific preset
reference numbering
start-frame generation
partial shot regeneration
```

Required validations:

```text
input reference mapping
shot completeness
shot duration/intent
dialogue allocation
product visibility
character continuity
start-frame compatibility
downstream video-provider compatibility
```

---

# 97. Drama Series Benchmark

Drama benchmarks SHALL test complete and partial lifecycle:

```text
Idea
→ Research
→ Concept
→ Script
→ Breakdown
→ Characters
→ Scene
→ Shot
→ Storyboard
→ Prompt Engineering
→ Image/Video Generation
→ Post
→ Drama QC
→ Publish
→ Analytics
→ Optimize
```

Cases SHALL test:

```text
episode continuation
story arc
subplot
hook
cliffhanger
character continuity
wardrobe continuity
scene continuity
dialogue
lip-sync
reference locks
product placement
partial regeneration
multi-episode lineage
```

---

# 98. Product Auto Review Benchmark

Product Auto Review SHALL be tested as an end-to-end product workflow, not merely script generation.

```text
Product assets
+ optional people
+ optional background
+ product facts
       ↓
Review strategy
       ↓
Script / dialogue
       ↓
Storyboard
       ↓
Image/video generation
       ↓
Edit
       ↓
QC
       ↓
Caption/thumbnail
       ↓
Approval
       ↓
Publish
```

Required checks include unsupported product claims, reference fidelity, product visibility, factual grounding and publish approval.

---

# 99. Media Studio Benchmark

The harness SHALL validate that AI Workflow Studio can select Media Studio capabilities based on feature requirements, not only provider name.

Examples:

```text
needs image-to-image
needs reference fidelity
needs first/last-frame video
needs native audio
needs lip sync
needs long duration
needs extend
needs high quality
needs local/private execution
```

The benchmark SHALL detect a route that chooses a model/provider lacking a required feature.

---

# 100. Model/Provider Routing Benchmark

For media cases, Runtime/Model Resolver validation SHALL include:

```text
supported modality
input count/format
reference support
i2i support
first/last frame
extend
native audio
lip sync
resolution
duration
quality tier
cost
latency
rate limit
provider health
residency/privacy
```

A cheaper provider is not an acceptable fallback if a required feature or material quality constraint is lost.

---

# 101. Video Editing Benchmark

Video Editing use cases SHALL cover:

```text
multiple source videos
images/B-roll
transcript
speech cleanup
semantic shortening
rough cut
EDL
subtitles
active-speaker reframing
9:16 conversion
music/SFX
ducking
render
Library upload
```

The benchmark SHALL verify that heavy work is routed to an eligible Runner/provider rather than pretending the web frontend itself performs the media processing.

---

# 102. AI Rough Cut Benchmark

Required scenario classes:

```text
wrong speech → remove
repeated speech → keep best/final take
long pauses → trim by policy
semantic summary → preserve key meaning
long video → shorter version
subtitle-driven cuts
B-roll masking jump cuts
checkpoint/resume
```

The verifier SHALL compare final transcript/semantic coverage against required key points.

---

# 103. AI Editor / Director Benchmark

Cases SHALL test:

```text
hold
zoom
pan
return-to-face
active speaker
dynamic 9:16 reframe
subject tracking
crop safety
B-roll placement
edit rhythm
```

Workflow design SHOULD separate:

```text
evidence
→ editorial plan
→ human review if configured
→ deterministic EDL
→ render
→ verification
```

---

# 104. Media Asset Provenance

Every generated/edited artifact SHOULD be traceable to:

```text
source AssetRefs
source project/story/character/product
workflow_run_id
node_run_id
model/provider
prompt/version
edit plan
Runner/job
QC result
final publication IDs
```

Benchmark failure codes SHOULD include:

```text
MISSING_MEDIA_PROVENANCE
BROKEN_ASSET_LINEAGE
UNRESOLVED_R2_OBJECT
INVALID_VECTOR_HIT_MAPPING
```

---

# 105. Asset Retrieval Quality Metrics

For retrieval-centric cases, track:

```text
Recall@K where labeled fixtures exist
Precision@K
duplicate rate
wrong-project rate
wrong-character rate
quality eligibility rate
usable asset rate
human correction rate
```

For subjective tasks, human/AI evaluation may supplement deterministic fixture labels.

---

# 106. Character Continuity Metrics

Track:

```text
identity consistency
age consistency
face consistency
wardrobe consistency
scene continuity
role/canon consistency
dialogue/personality consistency
cross-shot drift
cross-episode drift
```

These metrics are product-level quality signals, not merely provider metrics.

---

# 107. Storyboard-to-Video Traceability

The harness SHALL verify mappings such as:

```text
storyboard shot
→ start frame
→ video generation request
→ generated clip
→ selected clip
→ edit timeline segment
→ final rendered time range
```

This enables debugging when final output fails despite individual generation success.

---

# 108. Partial Regeneration Tests

Benchmark cases SHALL ensure:

```text
shot 6 fails QC
→ regenerate shot 6
→ preserve shots 1–5 and 7–9
→ reassemble
→ rerun impacted continuity/QC only
```

Do not unnecessarily regenerate the entire workflow.

---

# 109. Cross-Product Composition Tests

Spec 212 SHALL include cases combining SmartAIHub products:

```text
Drama Series + Storyboard + Media Studio + Video Edit
Product Auto Review + Media Studio + Publish
Vector/R2 Retrieval + Video Editor + Music + Publish
Library character + Storyboard + Video + QC
Universal Assistant + Workflow Studio + Runner
```

These are especially important because isolated feature tests cannot detect integration gaps.

---

# 110. SmartAIHub-Native Gap Taxonomy

Add:

```text
GAP_DRAMA_SERIES
GAP_STORYBOARD
GAP_MEDIA_STUDIO
GAP_PRODUCT_AUTO_REVIEW
GAP_VIDEO_EDIT
GAP_ROUGH_CUT
GAP_AI_EDITOR
GAP_VECTOR_RETRIEVAL
GAP_R2_ASSET
GAP_CHARACTER_REFERENCE
GAP_SCENE_REFERENCE
GAP_MEDIA_QC
GAP_SUBTITLE
GAP_LIPSYNC
GAP_MEDIA_MODEL_ROUTING
GAP_MEDIA_PROVENANCE
GAP_MEDIA_PUBLISH
GAP_MEDIA_ANALYTICS
```

A workflow failure SHALL be attributed to the owning capability rather than generically to AI Workflow Studio.

---

# 111. SmartAIHub-Native Dashboard

Add dashboard sections:

```text
Drama Series coverage
Storyboard coverage
Media Studio coverage
Product Auto Review coverage
Video Edit coverage
Vector/R2 retrieval coverage
Character reuse coverage
Media QC coverage
Runner media execution coverage
Publish coverage
```

Each shows:

```text
design
compile
resolve
sandbox
E2E
verified success
top gaps
```

---

# 112. Revision 2 Corpus Summary (historical baseline)

```text
400 broad end-user automation cases
150 canonical Spec 209 cases
250 SmartAIHub-native product/media cases
--------------------------------------------
800 total benchmark cases
```

The 250 SmartAIHub-native cases are intentionally product-specific and should remain separate from generic cases for coverage analysis.


---
---

# 113. Revision 3 — Ten-Pass Completeness Audit & Corpus Separation

Revision 3 was produced after a minimum ten-pass completeness audit of the Revision 2 specification and its 800-case corpus.

The audit found that the architecture was strong but the benchmark still had important product-grade gaps in:

```text
1. benchmark corpus separation / maintainability
2. blind holdout and benchmark contamination control
3. stochastic/repeated-run robustness
4. multi-turn workflow authoring/editing
5. trigger/webhook/event automation
6. provider quota/rate-limit/outage resilience
7. team/workspace collaboration and concurrent editing
8. asset rights/consent/watermark/data lifecycle
9. media format/codec/FPS/HDR edge cases
10. active workflow versioning/migration/security fuzzing
```

Revision 3 patches these gaps and expands the canonical corpus from 800 to **1,000 natural-language prompts**.

---

# 114. Canonical Corpus Is a Separate Prompt-Only JSON File

The use-case corpus SHALL NOT be embedded inside the main Spec 212 Markdown.

Canonical file:

```text
spec-212-use-cases-1210.json
```

Canonical JSON shape:

```json
[
  "โจทย์ use case ลำดับที่ 1",
  "โจทย์ use case ลำดับที่ 2",
  "โจทย์ use case ลำดับที่ 3"
]
```

Rules:

1. The root value MUST be a JSON array.
2. Every element MUST be a non-empty natural-language test prompt string.
3. The file MUST contain no IDs, no categories, no comments and no expected answer.
4. Ordering is canonical and stable inside a corpus version.
5. The harness derives the identifier from the 1-based position:

```text
index 1    → UC-0001
index 2    → UC-0002
...
index 1000 → UC-1000
```

6. Test metadata belongs in the benchmark database / case-manifest layer, not in the canonical user-prompt file.
7. The prompt-only file is the easiest input for repeated sequential benchmark loops.

This separation prevents the benchmark corpus from becoming coupled to implementation metadata.

---

# 115. Corpus Version / Ordering Contract

A corpus release SHALL have:

```text
corpus_id
corpus_version
prompt_count
content_hash
created_at
parent_version
change_summary
```

The prompt-only JSON remains immutable once used as a release baseline.

Adding/removing/reordering prompts creates a new corpus version.

Historical benchmark results MUST retain the exact corpus hash.

---

# 116. Blind Holdout / Anti-Overfitting

A product-grade benchmark MUST guard against accidental benchmark memorization or prompt-template overfitting.

The corpus system SHALL support:

```text
PUBLIC_DEVELOPMENT
CANONICAL_VISIBLE
HIDDEN_HOLDOUT
REAL_USER_HOLDOUT
```

Requirements:

- release decisions MUST include hidden holdout cases;
- hidden expected invariants SHALL not be sent to AI Workflow Studio;
- the builder receives only the user prompt + legitimate environment context;
- graders may receive the private test oracle after workflow generation;
- a model/prompt revision that improves visible cases but degrades holdout generalization is a regression;
- holdout prompts SHOULD contain novel combinations of known capabilities.

The canonical 1,000-prompt file is the repeatable main suite; hidden holdouts are maintained separately by the benchmark service.

---

# 117. Repeated-Run / Stochastic Robustness

One successful generation is not sufficient for nondeterministic AI authoring.

For selected cases, Spec 212 SHALL run the same prompt multiple times under the same pinned environment.

Track:

```text
design_pass_rate
compile_pass_rate
resolve_pass_rate
verified_success_rate
semantic_graph_variance
hallucinated_dependency_rate
approval_omission_rate
cost_variance
latency_variance
```

Recommended modes:

```text
smoke:        1 run/case
canonical:    3 runs for stochastic-sensitive cases
release:      5–10 runs for critical AI-authored cases
```

Report confidence intervals where sample size permits.

A case that passes once but fails frequently is `FLAKY`, not product-grade.

---

# 118. Multi-Turn AI Builder Benchmark

Real users do not always describe the final workflow perfectly in one message.

Revision 3 SHALL test authoring sessions such as:

```text
Turn 1: สร้าง workflow ...
Turn 2: เพิ่ม approval ก่อน publish
Turn 3: เปลี่ยนจาก Claude เป็น Auto
Turn 4: ข้อมูลนี้ห้ามออกจาก local
Turn 5: ทำ workflow ให้สั้นลงแต่ผลเหมือนเดิม
```

Required invariants:

- preserve unaffected graph semantics;
- produce a semantic diff per accepted edit;
- rejected patch causes no mutation;
- revalidate bindings after schema change;
- revalidate runtime/residency after policy change;
- support undo/rollback of authoring patches;
- maintain one workflow identity and explicit version history.

---

# 119. Trigger / Schedule / Event-Driven Benchmark

Spec 212 SHALL certify workflows triggered by more than manual run.

Trigger classes:

```text
manual
schedule
cron/calendar
webhook
email/event
Library asset created
job completed
provider callback
external MCP invocation
external A2A invocation
Runner online/offline
approval resolved
```

Validate:

```text
trigger deduplication
idempotency
event ordering
missed-event recovery
timezone/DST behavior
duplicate webhook behavior
late callback behavior
trigger authorization
```

A duplicate external event MUST NOT silently create duplicate consequential Workflow Runs.

---

# 120. Provider Quota / Rate-Limit / Outage Resilience

The benchmark SHALL inject:

```text
429 / rate limit
quota exhausted
provider maintenance
slow latency
partial response
artifact callback delayed
schema revision
provider account disabled
model removed
regional unavailability
```

Expected behavior depends on policy:

```text
wait
switch account
fallback equivalent provider
ask user
pause
fail explicitly
reconcile
```

The system MUST NOT silently downgrade required capability or quality merely to obtain a green test.

---

# 121. Team / Workspace / Collaboration Benchmark

Product-grade Workflow Studio SHALL be tested under collaborative ownership.

Cases include:

```text
viewer / runner / editor / reviewer / owner / admin
draft vs published
node-level review comments
semantic diff approval
concurrent editing conflict
workflow ownership transfer
partner tenant execution
run-only Mini App access
provider/secret configuration restricted by role
```

Benchmark invariants:

- authoring permission != execution permission;
- execution permission != secret visibility;
- publication permission may be stricter than edit permission;
- concurrent writes do not silently overwrite one another;
- tenant boundaries remain intact.

---

# 122. Active Version / In-Flight Run Compatibility

Workflow evolution SHALL be tested while old runs still exist.

Cases include:

```text
version 2 published while version 1 is running
paused version 1 resumes after version 2 publication
queued runs revalidate mutable runtime/provider state
pinned subflow remains pinned
output schema changes
scheduled workflow moves to a new stable version
canary publication
rollback
```

Rule:

> A running/paused Workflow Run retains its immutable workflow semantics unless an explicit governed migration operation exists.

---

# 123. Capability / Schema Drift Benchmark

The harness SHALL mutate capability definitions after workflow creation:

```text
tool removed
tool renamed
input field becomes required
output schema changed
runtime version incompatible
MCP tool revision changed
A2A skill changed
model feature removed
Runner capability no longer advertised
```

The compiler/resolver MUST surface the incompatibility rather than bind silently to a semantically different dependency.

---

# 124. Security Fuzzing & Untrusted-Content Benchmark

Revision 3 adds adversarial cases across:

```text
web page content
retrieved documents
MCP metadata/tool output
A2A messages
external agent output
uploaded file names/MIME
Mini App input
workflow imports
provider callbacks
approval tokens
```

Test classes include:

```text
prompt injection
confused deputy
secret exfiltration
capability escalation
forged completion
replayed approval
cross-tenant reference
malicious callback
MIME spoofing
policy-bypass fallback
```

Security-blocked outcomes count as successful benchmark behavior when blocking is the intended result.

---

# 125. Asset Rights / Consent / Watermark Benchmark

SmartAIHub-native creative workflows SHALL test not only technical access but legal/policy metadata that the product tracks.

The benchmark SHOULD support fixtures for:

```text
ownership
commercial-use eligibility
license expiry
consent
voice/person reference authorization
watermark policy
source provenance
publish restrictions
```

Required behaviors:

- retrieval does not make an asset eligible by itself;
- expired/restricted assets are excluded or blocked;
- derived assets preserve lineage;
- preview/final watermark policy is enforced;
- external-agent egress honors asset disclosure policy.

---

# 126. Privacy / Retention / Derived-Data Lifecycle

Benchmark cases SHALL validate:

```text
screenshot retention
trace retention
artifact retention
temporary Runner files
vector embeddings
derived assets
conversation/project memory
accounting/audit records
```

Deletion and retention are not identical across these classes.

---

# 127. Media Format / Codec / Frame-Rate Edge Benchmark

Product-grade media automation SHALL test:

```text
23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60 fps
variable frame rate
portrait rotation metadata
mixed resolutions
mixed aspect ratios
codec incompatibility
proxy generation
HDR → SDR
color-space mismatch
audio sample-rate mismatch
corrupt source media
```

A workflow is not fully supported merely because it works with one ideal MP4 fixture.

---

# 128. Local AI / ComfyUI / Worker Capability Benchmark

Revision 3 SHALL explicitly test user-owned/local runtimes:

```text
Ollama
vLLM
OpenAI-compatible local endpoint
LLM via Worker
ComfyUI workflow
local vision model
local TTS/media runtime
```

Validate discovery, schema inspection, health, installed model/checkpoint, local-only policy, Worker availability, progress, reconnect/reconcile and Library artifact upload.

No local-only task may silently fall back to cloud.

---

# 129. Billing / Credit / Economics Benchmark

Workflow feasibility includes economics where relevant.

Test:

```text
pre-run estimate
budget envelope
credit reservation
actual cost rollup
external user-owned cost = unknown where appropriate
fallback cost increase
duplicate provider callback
cancel before billable request
creator/revenue attribution
Marketplace entitlement
```

The benchmark MUST distinguish technical executability from economic eligibility.

---

# 130. Extended SmartAIHub-Native Coverage Added in Revision 3

Revision 3 adds 200 gap-closure prompts covering:

```text
automation triggers
Library/R2 lifecycle
casting/character management
story bible / canon RAG
rights/watermark
provider resilience
team collaboration
project migration
media format edge cases
economics
privacy/retention
ComfyUI/Worker
local AI
multi-account publishing
asset metadata enrichment
drama production
media recovery
multi-turn Builder editing
active versioning
security fuzzing
```

These are appended after the original 800 prompts and become `UC-0801` through `UC-1000`.

---

# 131. Risk-Weighted Coverage

Raw pass percentage alone is insufficient.

Spec 212 SHALL also report risk-weighted coverage.

Example configurable weights:

```text
R0 read-only                1
R1 low write                2
R2 external write           4
R3 publish/delete/deploy    8
R4 economic/critical       16
```

A regression in an R4 approval boundary can block release even if aggregate pass rate improves.

---

# 132. Demand-Weighted Coverage

The benchmark MAY maintain independent demand weight based on product telemetry, support requests, sales feedback, published workflow usage, Marketplace usage and manual product labeling.

Risk and demand are separate axes.

---

# 133. Oracle Quality & Human Calibration Set

The benchmark itself requires quality assurance.

Maintain a human-reviewed calibration set containing valid workflows, invalid workflows, subtle approval omissions, valid alternative graph designs, expected product gaps, environment-only gaps and unsafe fallbacks.

Measure grader precision, recall, false pass, false fail and owner-attribution accuracy.

---

# 134. Test Data Contamination Boundary

The harness SHALL keep these planes separate:

```text
Builder Input Plane
  user prompt
  allowed fixtures/context
  real capability discovery

Evaluator Plane
  hidden invariants
  forbidden behavior
  grading rubric
  failure-injection schedule
```

Hidden evaluator information MUST NOT leak into builder prompts/context.

---

# 135. Release Test Matrix — Revision 3

Recommended:

```text
PR Smoke
  20 critical golden families
  L1–L3
  deterministic safety checks

Nightly
  150 canonical Spec 209
  + rotating SmartAIHub-native cases
  L1–L4

Weekly
  full 1,000 prompt corpus
  L1–L3 for all
  L4 selected by capability/environment
  repeated runs for stochastic-sensitive cases

Release Candidate
  1,000 prompt design/compile/resolve sweep
  all critical L4
  certified L5 matrix
  hidden holdout
  no critical blocker
```

---

# 136. Ten-Pass Audit Record

| Pass | Focus | Gap found | Correction |
|---:|---|---|---|
| 1 | Spec structure | Corpus tables duplicated inside spec and made maintenance difficult | Removed embedded case tables; canonical prompt-only JSON is separate |
| 2 | Benchmark validity | Visible benchmark could be overfit | Added hidden holdout + contamination boundary |
| 3 | AI nondeterminism | Single successful run overstated reliability | Added repeated-run robustness and flakiness metrics |
| 4 | Real authoring UX | Single-turn prompts missed iterative workflow editing | Added multi-turn Builder benchmark |
| 5 | Automation completeness | Webhook/schedule/event semantics were underrepresented | Added trigger/event benchmark and cases |
| 6 | Operational resilience | Quota/rate-limit/outage/schema drift were too thin | Added provider resilience + capability-drift testing |
| 7 | Collaboration | Team roles/concurrent edits/ownership transfer were missing | Added workspace/collaboration benchmark |
| 8 | Media product realism | Codec/FPS/HDR/rights/asset lifecycle edge cases were thin | Added media-format, rights and lifecycle benchmarks |
| 9 | Long-lived product behavior | Active runs vs workflow/version migration were underdefined | Added in-flight compatibility and migration tests |
| 10 | Security / benchmark quality | Adversarial inputs and evaluator quality needed stronger gates | Added security fuzzing, oracle calibration and risk-weighted release logic |

All gaps above were patched into this revision.

---

# 137. Revision 3 Corpus Summary

```text
Original broad end-user automation           400
Canonical Spec 209                           150
SmartAIHub-native product/media              250
Revision-3 gap-closure                       200
------------------------------------------------
Canonical prompt-only corpus               1,000
```

Canonical prompt file:

```text
spec-212-use-cases-1210.json
```

The main specification SHALL remain independent of the prompt list so future corpus revisions do not require rewriting the architectural benchmark contract.

---



# 138. Revision 4 — From Capability Benchmark to Workflow Template Marketplace

Revision 4 turns the 1,000-case corpus into a **dual-purpose asset**:

```text
Purpose A — Product Benchmark
  natural-language prompt
  → AI Workflow Studio
  → design / compile / resolve / execute / verify

Purpose B — Workflow Template Marketplace
  searchable use case
  → existing certified template OR on-demand generation
  → save / fork / run / review
```

The same use case therefore creates a virtuous cycle:

```text
Use Case
  ↓
Benchmark generation
  ↓
Validated workflow candidate
  ↓
Template Promotion Gate
  ↓
Marketplace template
  ↓
Real usage
  ↓
Ratings / reviews / failures / telemetry
  ↓
Gap clustering
  ↓
Workflow or platform improvement
  ↓
Re-benchmark
  ↓
New certified template version
```

This converts benchmark investment directly into product value.

---

# 139. Marketplace Ownership Boundary

Spec 209 remains authoritative for:

```text
Workflow Definition
Workflow Version
Workflow Compiler
workflow.run
Mini App
Marketplace publication semantics
Entitlement hook
Immutable published version
Fork / saved workflow semantics
```

Spec 212 owns or coordinates:

```text
1,000 seeded use-case catalog
catalog taxonomy
search index
template generation request
benchmark/certification status
template promotion gate
review/rating signal
usage-quality analytics
feedback-to-benchmark loop
curated ranking metadata
```

There SHALL NOT be:

```text
Spec 209 Marketplace
+
separate Spec 212 Marketplace runtime
```

There is one Marketplace experience backed by Spec 209 workflow semantics and enriched by Spec 212 catalog/quality intelligence.

---

# 140. Preserve the Prompt-Only Benchmark Corpus

The existing canonical benchmark file remains unchanged:

```text
spec-212-use-cases-1210.json
```

It MUST remain a prompt-only ordered array for deterministic benchmark loops.

Marketplace metadata belongs in a separate catalog artifact:

```text
spec-212-marketplace-catalog-1210.json
```

Shape:

```json
[
  {
    "id": "UC-0001",
    "category": "เว็บ การค้นข้อมูล และ Web Automation",
    "prompt": "..."
  }
]
```

This preserves the clean benchmark input while giving Marketplace the ID/category/prompt fields required for search and display.

---

# 141. Seed Catalog Identity

Every seeded listing derives a stable ID from corpus order:

```text
UC-0001
...
UC-1000
```

The ID remains stable for the corpus version.

A future corpus version SHALL NOT silently reuse an old ID for a different semantic prompt.

Marketplace listing identity and generated workflow identity are separate:

```text
UseCaseListing
  id = UC-0637

Generated Workflow Template
  workflow_id = wf_...
  workflow_version_id = wfv_...
```

One use case may have multiple generated template versions over time.

---

# 142. Marketplace Information Architecture

The existing Marketplace screen SHOULD evolve into:

```text
Marketplace
├ Search
├ Category filters
├ Capability filters
├ Template status filters
├ Sort
├ Use Case / Template cards
└ Detail drawer/page
```

Recommended top-level tabs:

```text
แนะนำ
ทั้งหมด
พร้อมใช้
ยังไม่เคยสร้าง
กำลังตรวจสอบ
ยอดนิยม
คะแนนสูง
ล่าสุด
ของฉัน
```

Advanced/admin mode MAY expose:

```text
Benchmark status
Compile status
Sandbox certification
E2E certification
Gap owner
Runtime dependencies
```

Normal users SHOULD see simpler language.

---

# 143. Search UX

The Marketplace SHALL support:

1. keyword search;
2. Thai/English mixed search;
3. semantic search;
4. category filter;
5. capability/product filter;
6. generated-state filter;
7. certification-status filter;
8. rating filter;
9. execution/locality filter where useful;
10. sort by relevance, usage, rating, updated date or certification.

Examples:

```text
"แมว"
→ Vector/R2 cat asset montage
→ cute-cat video
→ image/video retrieval workflows

"รีวิวร้านกาแฟ"
→ Product Auto Review
→ character reuse
→ café storyboard
→ social publishing

"ตัดพูดผิด"
→ AI Rough Cut
→ subtitle-driven edit
→ video cleanup
```

Search results SHALL rank query relevance before popularity.

---

# 144. Hybrid Search

Recommended retrieval:

```text
Lexical / PostgreSQL FTS
       +
Semantic embedding search
       +
Structured filters
       ↓
Candidate set
       ↓
Re-rank
```

Ranking inputs MAY include:

```text
text relevance
semantic relevance
category match
capability match
certification status
usage signal
rating confidence
freshness
tenant eligibility
```

Popularity SHALL NOT override poor query relevance.

---

# 145. Category Taxonomy

The 1,000 seeded cases include user-facing and technical categories spanning:

```text
Web / Office / CRM / Support / Finance / HR
E-commerce / Social / Marketing / SEO
Research / IT / Security
Software Development / QA / Legacy RPA
Multi-Agent / Runtime / Protocol
Computer Use / Runner
Data / RAG / Library
Drama Series / Storyboard
Media Studio Image / Video / Audio
Product Auto Review / Ads
Video Edit / Rough Cut / AI Editor
Vector + R2 Retrieval
Character / Scene Reuse
Media QC / Subtitle / Lip Sync
Publishing / Analytics
Local AI / ComfyUI / Worker
Team Collaboration / Migration
Privacy / Rights / Economics
```

Marketplace MAY expose a simplified parent taxonomy while retaining fine-grained internal categories.

---

# 146. Marketplace Eligibility vs Benchmark Eligibility

Not every benchmark case is automatically a useful public template.

Examples:

```text
prompt-injection attack fixture
permission-bypass negative test
provider failure injection
security fuzz case
```

These remain valuable benchmark cases but MAY be:

```text
BENCHMARK_ONLY
ADMIN_VISIBLE
DEVELOPER_TEMPLATE
PUBLIC_TEMPLATE_CANDIDATE
PUBLIC_TEMPLATE
```

The 1,000-item catalog MAY be searchable in Capability Lab/admin mode, while normal Marketplace defaults to public/template-eligible entries.

This prevents adversarial test prompts from being presented to ordinary users as recommended automation templates.

---

# 147. Template Generation State Machine

Each use case SHALL expose a generation state:

```text
NOT_GENERATED
QUEUED
GENERATING
VALIDATING
CANDIDATE_READY
CERTIFIED
PARTIALLY_SUPPORTED
NEEDS_REGENERATION
GENERATION_FAILED
DEPRECATED
```

The Marketplace card/action changes according to state.

---

# 148. First-Time Generate Flow

For a use case with no reusable workflow:

```text
User clicks "Generate Workflow"
  ↓
Spec 212 creates generation request
  ↓
Spec 209 AI Builder creates Workflow Definition
  ↓
Compile
  ↓
Capability/runtime resolution
  ↓
Safety / approval validation
  ↓
Template Sanitization
  ↓
Benchmark / promotion validation
  ↓
Save candidate Workflow Version
  ↓
Show preview
```

Generation SHALL use the canonical prompt and current registered capabilities.

---

# 149. Existing Template Flow

If a certified/default generated version already exists:

```text
Open listing
  ↓
Show certified template
  ↓
[Use Template]
[Preview]
[Regenerate]
```

`Use Template` SHALL NOT regenerate unnecessarily.

It instantiates/forks the selected immutable template version into the user's workflow workspace according to Spec 209 semantics.

---

# 150. Regenerate Flow

`Regenerate` SHALL create a new candidate, never silently overwrite the stable version.

```text
Stable v3
  ↓
Regenerate request
  ↓
Candidate v4
  ↓
Compile / resolve / benchmark
  ↓
Semantic diff vs v3
  ↓
quality comparison
  ↓
Promote v4 OR retain v3
```

A failed candidate SHALL NOT destroy the existing working template.

---

# 151. User Customization

After `Use Template`, the user receives a user-owned/forked workflow.

The user can instruct:

```text
เพิ่ม approval ก่อน publish
ใช้ local model เท่านั้น
เปลี่ยนจาก Facebook เป็น YouTube
ตัดขั้นตอนนี้ออก
เพิ่มสินค้าอีก 3 ภาพ
```

These edits use the same Spec 209 natural-language patch/diff/versioning system.

User edits SHALL NOT mutate the global Marketplace template.

---

# 152. Template Sanitization & Portability Gate

A workflow generated during benchmark execution MAY contain test-specific state and MUST NOT be promoted directly.

Before Marketplace promotion remove/parameterize:

```text
fixture IDs
test tenant IDs
test account IDs
specific Runner ID
browser profile ID
temporary file paths
mock endpoint URLs
sandbox secrets
test repository ID
test project ID
temporary artifact IDs
hard-coded user identity
```

Replace with reusable inputs/requirements:

```text
required_connection
required_capability
required_asset_input
runtime_policy
execution_target_requirement
user-selectable project/account
```

Promotion SHALL fail if ephemeral test identity remains embedded.

---

# 153. Template Promotion Gate

A benchmark-generated workflow becomes a reusable Marketplace template only after:

```text
schema valid
compile pass
all capabilities real
portable bindings
no fixture leakage
security pass
approval boundaries correct
required inputs parameterized
runtime requirements declared
verification defined
minimum benchmark level satisfied
```

Suggested promotion tiers:

```text
DRAFT
VALIDATED
SANDBOX_CERTIFIED
E2E_CERTIFIED
CURATED
```

---

# 154. Template Quality Badge

Marketplace can display human-readable badges:

```text
พร้อมใช้
ผ่านการตรวจสอบ
ผ่าน Sandbox
ผ่าน E2E
ต้องตั้งค่าเพิ่มเติม
ต้องใช้ Runner
ต้องใช้ Browser Login
ต้องใช้ Local AI
ต้องอนุมัติก่อน Publish
```

Avoid showing raw protocol jargon by default.

---

# 155. Template Card

Recommended card fields:

```text
Use Case ID
Title / short derived title
Category
Prompt summary
Certification badge
Average rating
Review count
Unique users
Run/use count
Last certified date
Required setup indicators
```

Primary CTA:

```text
NOT_GENERATED      → Generate Workflow
READY/CERTIFIED    → Use Template
PARTIAL            → View Requirements
DEGRADED           → Regenerate / View Issue
```

Secondary actions:

```text
Preview
Regenerate
Reviews
Details
```

---

# 156. Listing Detail Page

Recommended sections:

```text
Overview
Original use-case prompt
Workflow preview graph
What it does
Required inputs
Required connections/tools
Runtime/device requirements
Expected outputs
Safety/approval points
Certification
Versions
Reviews
Usage
Known limitations
Changelog
```

Authors/admins additionally see benchmark/gap diagnostics.

---

# 157. Ratings

Users MAY rate a template:

```text
1–5 stars
```

Recommended constraints:

- one active rating per user per listing;
- rating can be edited;
- aggregate updates transactionally;
- deleted/disabled users handled according to privacy policy;
- abuse/spam detection;
- aggregate rating should use Bayesian/confidence-aware ranking for sorting.

A new template with one 5-star review SHOULD NOT automatically outrank a mature template with hundreds of strong reviews.

---

# 158. Text Reviews

Users MAY submit a written review.

Review fields SHOULD support:

```text
rating
review_text
template_version_used
used_successfully
created_at
updated_at
moderation_state
```

Optional structured feedback:

```text
ทำงานได้ตามที่คาด
ตั้งค่าง่าย
ผลลัพธ์ดี
ทำงานไม่ครบ
เครื่องมือหาย
ช้า
แพง
ต้องแก้ workflow เองมาก
```

---

# 159. Verified-Use Reviews

If the reviewer actually instantiated or ran the template, display:

```text
Verified Use
```

This signal is more useful than an unverified rating.

A verified review SHALL reference privacy-safe usage evidence, not expose the user's workflow data.

---

# 160. Review Moderation

Support:

```text
ACTIVE
PENDING
HIDDEN
REPORTED
REMOVED
```

Moderation SHALL handle spam, harassment, secrets accidentally pasted into reviews and attempts to inject instructions into internal evaluation pipelines.

Review text is untrusted user content.

---

# 161. Usage Counting

Do not store only one ambiguous "downloads" counter.

Track separately:

```text
view_count
generate_count
regenerate_count
instantiate_count
workflow_run_count
successful_run_count
unique_user_count
review_count
```

The user-facing card may show:

```text
ผู้ใช้ 1,284 คน
ใช้งาน 8,931 ครั้ง
```

`unique_user_count` SHOULD represent distinct eligible users who instantiated or executed the template, not page views.

---

# 162. Privacy-Preserving Usage Analytics

Marketplace aggregate analytics MUST NOT reveal:

```text
raw prompts
private workflow inputs
private Library assets
tenant-secret information
reviewer's hidden identity
```

Cross-tenant analytics are aggregate-only unless explicit policy permits more.

---

# 163. Real-Usage Quality Signals

For each template version track:

```text
instantiate → first successful run conversion
verified success rate
failure rate
human intervention rate
regeneration rate
fork/edit rate
average runtime
cost band
support/gap incidents
rating trend
```

These signals complement benchmark results.

They MUST NOT replace hard security/certification gates.

---

# 164. Review + Telemetry Feedback Loop

```text
Reviews
+ Ratings
+ Usage failures
+ Regeneration frequency
+ Support feedback
+ Benchmark regressions
        ↓
Feedback clustering
        ↓
Template issue candidate
        ↓
Human/admin triage or automated diagnostic
        ↓
Regenerate / fix dependency / amend workflow
        ↓
Spec 212 re-benchmark
        ↓
New template candidate
        ↓
Promotion gate
        ↓
New stable version
```

User feedback SHALL NOT directly rewrite the stable template without validation.

---

# 165. Review-Derived Benchmark Cases

Repeated feedback such as:

```text
"ใช้กับไฟล์ 4K ไม่ได้"
"เปลี่ยน account แล้วโพสต์ผิดเพจ"
"มีสินค้า 5 รูปแล้วเลือกผิด"
```

MAY create new benchmark candidates.

Flow:

```text
feedback cluster
→ privacy-safe generalized prompt
→ benchmark candidate
→ human review
→ canonical/holdout case
```

This converts real usage into long-term product quality.

---

# 166. Template Versioning

Marketplace listing points to:

```text
stable_version_id
latest_candidate_version_id
```

Historical user runs retain their exact template/workflow version.

Publishing a new template version SHALL NOT mutate:

```text
existing user forks
historical runs
paused runs
pinned Mini Apps
```

---

# 167. Dependency Drift

A once-certified template may degrade when:

```text
provider removed
MCP schema changed
model version retired
Runner capability changed
Skill removed
policy changed
browser compatibility changed
```

Spec 212 SHALL periodically revalidate templates and update status:

```text
CERTIFIED
→ DEGRADED
→ NEEDS_REGENERATION
```

Do not keep displaying a stale "Certified" badge.

---

# 168. Automatic Re-Certification

Trigger re-certification when material dependency revisions change.

Examples:

```text
Capability Registry revision
workflow compiler revision
runtime adapter version
MCP schema hash
model/provider capability
Spec 208 execution compatibility
```

Non-material changes MAY avoid full E2E based on dependency impact analysis.

---

# 169. Generate Cache

Generated templates SHOULD be reused.

Cache key should consider semantic inputs such as:

```text
use_case_id
catalog/corpus version
AI Builder revision
Workflow schema version
Capability Registry compatibility
policy profile class
```

Do not blindly reuse a template if its dependencies are no longer compatible.

---

# 170. System Seed vs Community Template

Marketplace SHOULD distinguish:

```text
SYSTEM_SEEDED
SYSTEM_CURATED
PARTNER_PUBLISHED
COMMUNITY_PUBLISHED
PRIVATE_WORKSPACE
```

The initial 1,000 listings are `SYSTEM_SEEDED`.

A generated and certified seed can become `SYSTEM_CURATED`.

---

# 171. Template Provenance

Each listing/template version SHOULD record:

```text
source_use_case_id
source_corpus_version
generation_attempt_id
builder/model revision
workflow_version_id
certification_run_id
promotion_actor
dependency snapshot/hash
created_at
promoted_at
```

This allows reproducibility and audit.

---

# 172. Suggested Persistence Model

Reuse existing Spec 209 workflow/version/listing tables where available.

Spec 212 may add catalog/quality extensions conceptually equivalent to:

```text
workflow_use_case_catalog
workflow_template_generation_attempts
workflow_template_certifications
workflow_marketplace_reviews
workflow_marketplace_usage_events
workflow_marketplace_quality_snapshots
workflow_marketplace_feedback_clusters
```

Do not duplicate:

```text
workflow definitions
workflow versions
workflow runs
worker jobs
artifacts
billing ledger
entitlements
```

---

# 173. Use-Case Catalog Record

Recommended logical record:

```text
use_case_id
corpus_version
canonical_prompt
category_id
tags
marketplace_eligibility
visibility
search_document
semantic_embedding_ref
default_listing_id
created_at
updated_at
```

The external JSON seed remains simpler; database enrichment is derived/imported.

---

# 174. Generation Attempt Record

```text
generation_attempt_id
use_case_id
requested_by
builder_revision
capability_snapshot
policy_profile
status
workflow_id
workflow_version_id
compile_result
certification_result
failure_code
created_at
completed_at
```

Repeated regeneration attempts remain auditable.

---

# 175. Review Record

```text
review_id
listing_id
user_id
rating
review_text
verified_use
template_version_id
moderation_state
created_at
updated_at
```

Enforce one active review per user/listing unless product requirements choose version-specific reviews.

---

# 176. Usage Event Record

```text
event_id
listing_id
template_version_id
user_id_or_privacy_token
event_type
workflow_run_id_optional
success_optional
occurred_at
```

Aggregate jobs derive user-facing counters.

---

# 177. Marketplace API Surface

Suggested APIs:

```text
GET  /workflow-marketplace
GET  /workflow-marketplace/categories
GET  /workflow-marketplace/:listing_id

POST /workflow-marketplace/:listing_id/generate
POST /workflow-marketplace/:listing_id/regenerate
POST /workflow-marketplace/:listing_id/use

GET  /workflow-marketplace/:listing_id/reviews
POST /workflow-marketplace/:listing_id/reviews
PATCH /workflow-marketplace/:listing_id/reviews/:review_id
DELETE /workflow-marketplace/:listing_id/reviews/:review_id

GET  /workflow-marketplace/:listing_id/versions
GET  /workflow-marketplace/:listing_id/certification
```

Actual routes MAY follow existing SmartAIHub conventions.

---

# 178. Generate Endpoint Idempotency

Double-clicks or network retries SHALL NOT create duplicate generation jobs.

Use:

```text
use_case_id
requested_generation_mode
builder_revision
idempotency_key
```

A second identical active request returns the existing generation attempt/job.

---

# 179. Long-Running Generation UX

Generation can take significant time.

Use Feature 195 `worker_jobs`.

UI states:

```text
กำลังออกแบบ Workflow
กำลังตรวจ Node และการเชื่อมต่อ
กำลังตรวจเครื่องมือ
กำลัง Compile
กำลังตรวจสอบความพร้อม
กำลังทดสอบ
พร้อมใช้งาน
```

Closing the Marketplace page SHALL NOT cancel the job.

---

# 180. Search Result Card States

Example:

```text
UC-0673
Vector DB + R2 Retrieval
"หาภาพเกี่ยวกับแมว ..."

ผ่านการตรวจสอบ
★ 4.7 (128 รีวิว)
ผู้ใช้ 2.4k

[ใช้ Template] [ดูรายละเอียด]
```

Never generated:

```text
UC-0412
...

ยังไม่มี Template สำเร็จรูป

[Generate Workflow]
```

Degraded:

```text
Dependency เปลี่ยน — ควรสร้างใหม่

[Regenerate] [ดูปัญหา]
```

---

# 181. "Use Template" Semantics

`Use Template` SHOULD normally:

```text
select stable template version
→ check entitlement
→ inspect required connections/capabilities
→ collect missing configuration
→ fork/instantiate into user's workspace
→ validate under user's environment
→ ready to edit/run
```

Marketplace template certification does not guarantee that every user has required credentials, Runner or external services.

---

# 182. Per-User Environment Validation

Before first run, validate:

```text
connections
permissions
Runner availability
browser login if required
local model availability
Library access
provider account
budget/credits
residency
```

Show actionable missing requirements.

Do not mark the global template itself broken just because one user's environment lacks a dependency.

---

# 183. Regenerate vs Fork vs Edit

Make UX distinction clear:

```text
Use Template
= instantiate stable shared template

Regenerate
= ask AI Builder to produce a new candidate from canonical use case

Customize/Edit
= modify the user's own instantiated copy

Fork
= create an independent reusable template lineage
```

These operations MUST NOT be conflated.

---

# 184. Marketplace Review Feedback Must Be Version-Aware

If a review relates to template v2 and stable is now v5, UI SHOULD disclose version where useful.

Quality analytics SHOULD support:

```text
all-time rating
current-version rating
recent rating trend
```

This prevents old defects from permanently hiding improvements and prevents new regressions from being diluted by historical ratings.

---

# 185. Ranking Integrity

Marketplace sort/recommendation SHALL resist manipulation.

Requirements:

```text
rate-limit artificial usage
detect review spam
exclude internal benchmark runs from public usage counts
exclude failed generation retries from user-use count
deduplicate user events
separate staff/system activity
```

Benchmark runs MUST NOT inflate Marketplace popularity.

---

# 186. Marketplace and Benchmark Isolation

Critical:

```text
Benchmark execution telemetry
!=
real user Marketplace usage telemetry
```

Both may reference the same use case/template, but counters and quality dimensions remain distinct.

A test harness running a template 1,000 times must not make it "popular".

---

# 187. Marketplace Feedback Is Not Test Oracle

Reviews are valuable but subjective.

A low rating MAY indicate:

```text
bad workflow
bad provider output
bad environment
missing connection
poor UX
wrong expectation
```

Spec 212 SHALL correlate review feedback with run evidence before assigning a technical gap.

---

# 188. Marketplace Template Health

Compute a health projection from:

```text
latest certification
dependency health
recent verified-run success
critical unresolved gaps
current-version reviews
```

Do not derive health solely from star rating.

Suggested states:

```text
HEALTHY
DEGRADED
AT_RISK
UNAVAILABLE
```

---

# 189. Curated Collections

Marketplace SHOULD support curated collections such as:

```text
สร้างวิดีโอและคอนเทนต์
Drama / Storyboard
Product Review / Ads
งานตัดต่อวิดีโอ
งานขาย / CRM
งาน Support
งาน Research
Coding / QA
งาน Local AI / Runner
ยอดนิยมสำหรับผู้เริ่มต้น
```

Collections are discovery aids, not separate template copies.

---

# 190. Related Templates

Listing detail MAY show related templates using:

```text
same category
semantic similarity
shared capabilities
users-also-used signal
```

Recommendation must respect tenant eligibility and template health.

---

# 191. Template Search From Universal Assistant

The catalog SHOULD be accessible from the Universal Assistant.

Example user:

> "มี workflow สำเร็จรูปสำหรับทำคลิปรีวิวสินค้าไหม"

Assistant can search Marketplace and present eligible templates rather than generating from zero immediately.

Preferred route:

```text
search existing certified template
→ offer reuse
→ generate new only if no suitable template or user explicitly requests
```

This reduces cost and improves reliability.

---

# 192. AI Builder Should Reuse Marketplace Templates

When AI Workflow Studio receives a new request, it MAY search certified templates/subflows for close semantic matches.

It SHOULD prefer reuse when:

```text
semantic fit high
input/output contracts compatible
dependencies eligible
template healthy
policy permits
```

It MAY compose multiple templates/subflows rather than regenerate identical logic.

This turns Marketplace into a reusable capability library.

---

# 193. Template Composition

Marketplace templates can become subflows inside a larger workflow.

Example:

```text
"ทำคลิปรีวิวสินค้าแล้วโพสต์"

Product Review Template
        +
Video QC Template
        +
Publish Template
        ↓
new composed workflow
```

Composition SHALL retain version/provenance for every reused template.

---

# 194. Benchmarking Published Templates

Once a template becomes widely used, promote it into stronger regression coverage.

Demand-based policy MAY classify:

```text
LOW_USAGE
NORMAL
HIGH_USAGE
CRITICAL_TEMPLATE
```

High-use templates get:

```text
more frequent certification
more failure-injection coverage
provider-drift canaries
stronger E2E gates
```

Real popularity therefore improves regression priority.

---

# 195. Feedback-Driven Product Development

Aggregate insights SHOULD answer:

```text
Which use cases are searched most?
Which searches return no useful template?
Which use cases are generated most?
Which generated workflows fail most?
Which templates require most manual editing?
Which categories have lowest verified success?
Which missing capability blocks many desired templates?
```

This gives SmartAIHub a data-driven product roadmap.

---

# 196. Zero-Result Search as Product Signal

If users repeatedly search:

```text
"ทำ X"
```

and no suitable use case/template exists:

```text
search zero-result
→ privacy-safe intent cluster
→ candidate use case
→ admin review
→ add to future corpus
→ benchmark
→ generate/certify
→ Marketplace listing
```

Marketplace discovery itself becomes a source of future benchmark coverage.

---

# 197. UI Alignment With Current Marketplace Page

The current screen already provides:

```text
left navigation
Marketplace title
search field
main content region
```

Revision 4 SHOULD preserve that shell and populate the content region with:

```text
top search + filter bar
category chips / sidebar filter
status tabs
responsive template cards
pagination or virtualized infinite list
detail drawer/page
generation progress
review panel
```

This minimizes navigation disruption.

---

# 198. Recommended Desktop Layout

```text
Marketplace
ค้นหา Workflow Template หรือ Use Case...

[ทั้งหมด] [พร้อมใช้] [ยังไม่สร้าง] [ยอดนิยม] [คะแนนสูง]

Filters:
หมวดหมู่ | ความสามารถ | สถานะ | Runner/Cloud | Rating

┌───────────────────────┐ ┌───────────────────────┐
│ UC-0637               │ │ UC-0673               │
│ Character Reuse       │ │ Vector + R2 Retrieval │
│ ...                   │ │ ...                   │
│ ผ่านการตรวจสอบ         │ │ ยังไม่เคย Generate     │
│ ★4.8 · 843 users      │ │                       │
│ [ใช้ Template]        │ │ [Generate Workflow]   │
└───────────────────────┘ └───────────────────────┘
```

---

# 199. Mobile / Tablet Marketplace

Support:

```text
single-column cards
sticky search/filter
bottom-sheet filters
detail page instead of wide drawer
generation status notifications
review composer
```

Generating a workflow remains a durable background job independent of the device.

---

# 200. Accessibility / Localization

Marketplace SHALL support:

```text
Thai / English UI
keyboard navigation
screen-reader labels
visible focus state
rating controls accessible without pointer
search/filter state represented semantically
```

Template prompt text may remain in its canonical source language while title/summary can be localized separately.

---

# 201. Admin / Capability Lab Mode

Admin/developer UI adds:

```text
all 1,000 benchmark cases
benchmark-only cases
hidden/non-public eligibility
latest test result
compile/resolve status
gap classification
dependency snapshot
generation attempts
promotion controls
review moderation
telemetry diagnostics
```

Normal users do not need this complexity.

---

# 202. Bulk Generation

Admin MAY generate candidate templates in batches:

```text
selected IDs
category
most-searched use cases
high-demand missing templates
entire catalog
```

Batch generation uses Feature 195 and budget/concurrency limits.

A batch failure SHALL not roll back successful independent candidates.

---

# 203. Generate-on-Demand Strategy

It is unnecessary to pre-generate all 1,000 workflows immediately.

Recommended strategy:

```text
pre-generate high-value/high-demand cases
+
generate on first user demand
+
background warm-cache by category
```

This controls model/runtime cost while eventually building broad coverage.

---

# 204. Template Freshness

Record:

```text
generated_at
last_certified_at
dependency_snapshot
builder_revision
```

Marketplace can request regeneration when a template becomes materially stale.

Time alone SHOULD NOT invalidate a template if dependencies remain compatible.

---

# 205. Template Comparison

When regenerating, allow comparison:

```text
Current stable
vs
New candidate
```

Show:

```text
nodes added/removed
capabilities changed
approval changes
runtime requirements
expected cost
known quality/certification differences
```

Promotion can be human or policy-controlled after validation.

---

# 206. Template Rollback

If a new stable version performs worse in real usage:

```text
detect regression
→ mark AT_RISK
→ roll stable pointer back to previous certified version
```

Historical artifacts and reviews remain version-aware.

---

# 207. Marketplace Safety

Marketplace SHALL not allow templates to bypass:

```text
tenant permissions
Capability Grants
Approval Service
Spec 207 economic authorization
Spec 208 effect-level denial
data residency
secrets policy
external-agent scopes
```

A popular template receives no extra privilege.

---

# 208. Reviews and Prompt Injection

Review text, template descriptions and community metadata are untrusted.

They SHALL NOT become authoritative system instructions for:

```text
AI Builder
Runtime Resolver
Capability Resolver
review summarizer
benchmark grader
```

Any AI analysis of reviews uses an explicitly isolated untrusted-content channel.

---

# 209. Entitlement and Pricing

If Marketplace later supports paid creator templates, reuse Spec 209/207 entitlement and economics.

Spec 212 quality signals MAY be displayed but SHALL NOT maintain a second payment/revenue ledger.

The 1,000 system-seeded templates may initially be free/platform-provided according to product policy.

---

# 210. Marketplace Acceptance Criteria — Discovery

- [ ] 1,000 seeded use cases import with stable IDs.
- [ ] Every seeded record has category and prompt.
- [ ] Keyword search works.
- [ ] Semantic search works.
- [ ] Category filtering works.
- [ ] Generated-state filtering works.
- [ ] Certification filtering works.
- [ ] Sort by relevance/usage/rating works.
- [ ] Zero-result searches are recorded privacy-safely.
- [ ] Benchmark-only cases can be hidden from ordinary users.

---

# 211. Marketplace Acceptance Criteria — Generate / Reuse

- [ ] Never-generated use case can invoke AI Workflow Studio.
- [ ] Generation runs as durable job.
- [ ] Double-click/retry is idempotent.
- [ ] Generated graph compiles before candidate is marked ready.
- [ ] Existing stable template loads without regeneration.
- [ ] User can explicitly regenerate.
- [ ] Regenerate creates a new candidate version.
- [ ] Existing stable version survives failed regeneration.
- [ ] User can instantiate/fork stable template.
- [ ] User edits do not mutate global template.

---

# 212. Marketplace Acceptance Criteria — Promotion

- [ ] Benchmark fixture references are removed/parameterized.
- [ ] No test secrets remain.
- [ ] No ephemeral Runner/browser IDs remain.
- [ ] Dependencies are declared.
- [ ] Required inputs are portable.
- [ ] Approval boundaries pass validation.
- [ ] Verifier exists for material outcomes.
- [ ] Certification tier is stored.
- [ ] Stable version points only to promoted candidate.
- [ ] Dependency drift can revoke/degrade certification.

---

# 213. Marketplace Acceptance Criteria — Review / Usage

- [ ] User can rate 1–5.
- [ ] User can write review.
- [ ] User can edit own review.
- [ ] Review moderation exists.
- [ ] Verified-use signal exists.
- [ ] Rating is version-aware.
- [ ] Unique users counted separately from runs.
- [ ] Benchmark runs do not inflate popularity.
- [ ] Usage aggregation preserves privacy.
- [ ] Spam/manipulation protections exist.

---

# 214. Marketplace Acceptance Criteria — Feedback Loop

- [ ] Review clusters can create improvement candidates.
- [ ] Real run failures correlate to template version.
- [ ] Low-rating signal alone cannot auto-rewrite stable workflow.
- [ ] Improved candidate must re-enter Spec 212 certification.
- [ ] Popular templates receive stronger regression coverage.
- [ ] Zero-result search can propose new future use cases.
- [ ] New generalized cases require review before canonical promotion.
- [ ] Stable historical benchmark identity remains reproducible.

---

# 215. Revision 4 Definition of Done

Spec 212 Revision 4 is complete when SmartAIHub can:

```text
1. Import the 1,000 use cases into Marketplace.
2. Search/filter them by ID/category/text/semantic intent.
3. Tell whether a reusable template already exists.
4. Generate a workflow through Spec 209 when none exists.
5. Validate/sanitize/certify the candidate.
6. Reuse the existing stable template without unnecessary regeneration.
7. Explicitly regenerate into a new candidate.
8. Instantiate/fork a template into the user's workspace.
9. Collect ratings and written reviews.
10. Count real unique users and real runs separately.
11. Correlate reviews/usage/failures with exact template versions.
12. Re-certify after dependency drift.
13. Turn repeated real feedback into future benchmark cases.
14. Preserve benchmark isolation, security and reproducibility.
15. Keep one canonical Spec 209 Marketplace/runtime architecture.
```

---

# 216. Revision 4 Product Principle

> **Every benchmarked use case should be a potential reusable product asset. Every reusable template should remain continuously testable. Every real usage signal should help SmartAIHub discover what to improve next — without letting popularity, reviews or generated AI output bypass validation, policy or versioning.**

This unifies product discovery, template reuse, benchmark coverage and real-user feedback into one continuous system.





---

# 217. Revision 5 — Twelve-Pass Product-Grade Audit

Revision 5 was created after a fresh twelve-pass audit of Revision 4. The audit found that workflow capability coverage was strong, but Marketplace lifecycle coverage was materially thinner. Revision 5 therefore adds 210 Marketplace-specific prompts and hardens discovery, creator publishing, trust, portability, licensing, ranking, tenant isolation and operational recovery.

# 218. Normative Precedence

When historical text conflicts, implementation SHALL follow: `Revision 5 > Revision 4 > Revision 3 > Revision 2 > Revision 1`. Historical sections remain only for design traceability.

# 219. Revision 5 Corpus Contract

```text
UC-0001 ... UC-1000  Workflow / Agent OS / SmartAIHub capability coverage
UC-1001 ... UC-1210  Marketplace lifecycle / trust / discovery / reliability / external-access coverage
```

Canonical files:

```text
spec-212-use-cases-1210.json
spec-212-marketplace-catalog-1210.json
```

The first remains prompt-only. The second contains only `id`, `category`, `prompt` for Marketplace import/search.

# 220. Marketplace Search Quality Certification

Search SHALL be benchmarked using `Recall@K`, `Precision@K`, `MRR`, `nDCG@K`, zero-result rate, query-reformulation rate and successful-template-use-after-search. Maintain human-labeled Thai, English, mixed-language, typo, synonym, keyword and long-intent queries. Ranking revisions require holdout evaluation before rollout.

# 221. Query Understanding

Search SHALL normalize Thai segmentation, spelling variants, synonyms and product aliases such as `ตัดต่อคลิป ≈ video editing`, `ตัดพูดผิด ≈ rough cut speech cleanup`, and `ทำรีวิวสินค้า ≈ Product Auto Review`, without changing side-effect intent.

# 222. Saved Discovery State

Support favorites, recently viewed, recently used, saved search/filter state and not-interested/hidden templates. These are user discovery preferences and MUST NOT change certification. Personalization can be disabled.

# 223. Template Visibility Model

Required classes: `PRIVATE_USER`, `WORKSPACE`, `TENANT`, `PARTNER_SCOPE`, `UNLISTED`, `PUBLIC`, `SYSTEM_ONLY`, `BENCHMARK_ONLY`. Visibility is enforced before retrieval/ranking so unauthorized listing metadata is never leaked.

# 224. Workspace / Tenant RBAC

Support Viewer, Editor, Publisher, Owner/Admin semantics. Marketplace authoring/publishing permissions remain separate from runtime Capability Grants.

# 225. Creator Publishing Pipeline

```text
Draft Workflow → Marketplace Candidate → Metadata Validation → Security Scan → Dependency Analysis → Sanitization → Compile/Resolve → Sandbox Certification → Moderation/Policy Gate → Publish
```

Direct community upload-to-public without validation is prohibited.

# 226. Creator Identity / Reputation

Creator profile MAY expose certified templates, verified users, verified successful runs and current-version ratings. Reputation NEVER bypasses certification, moderation, permissions or runtime policy. Benchmark/system activity is excluded from popularity.

# 227. Licensing / Attribution / Fork Lineage

Template lineage SHOULD preserve license/version, parent listing/version, required attribution, redistribution allowance and commercial-use policy. Fork/import/export MUST retain legally required attribution.

# 228. Asset / IP Publication Boundary

Template publication SHALL classify asset dependencies as redistributable, reference-only, tenant-scoped, user-provided or not-publishable. Private R2/Library assets MUST NOT become public accidentally.

# 229. Setup / Configuration Wizard

Before first use derive a checklist from dependency requirements: connect account, choose project/assets, enable Runner, bind browser profile, choose local model, grant folder, confirm budget. The wizard configures the user's instance only.

# 230. Compatibility Report

Expose required capabilities, contract versions, runtime families, targets, installed apps, connections, local/cloud constraints, residency and known incompatibilities. Validate under the user's environment before first run.

# 231. Portability Diagnostic

Optional states: `PORTABLE`, `PORTABLE_WITH_SETUP`, `ENVIRONMENT_SPECIFIC`, `DEVICE_SPECIFIC`, `TENANT_SPECIFIC`, `NON_PORTABLE`. This is diagnostic metadata, not a user rating.

# 232. Import / Export Package

Portable packages SHOULD contain workflow schema/version, template metadata, dependency manifest, IO contracts, runtime constraints, license/attribution and provenance. They MUST NOT include secret values, browser credentials, private tokens or temporary Runner paths.

# 233. Import Security

Imported packages are untrusted. Validate schema/signature when available, unknown fields, embedded payloads, dependency refs, callbacks, side effects, secret material and license metadata. Unknown security-relevant fields MUST NOT be silently dropped.

# 234. Review Trust Model

Reviews MAY be marked `UNVERIFIED`, `VERIFIED_INSTANTIATION`, `VERIFIED_RUN`, `VERIFIED_SUCCESS`. Verification gives context but does not expose private inputs or turn a subjective review into a benchmark oracle.

# 235. Reporting / Moderation

Users can report spam, unsafe behavior, misleading description, IP issues, secret exposure, broken templates and fraudulent rating/review. Support triage, temporary restriction, decision, appeal, remediation and re-certification. Moderation state and certification state remain separate.

# 236. Marketplace Threat Model

Audit malicious templates, prompt injection in descriptions/reviews, dependency substitution, secret exfiltration, callback forgery, review spam, fake usage, creator collusion, ranking manipulation, license laundering, private-template enumeration, cross-tenant search leakage, malicious import and unsafe regeneration.

# 237. Ranking Integrity

Ranking combines separate classes: relevance, quality, trust, health, popularity, freshness and eligibility. Relevance dominates matching. Health/trust can demote or hide unsafe entries. Popularity NEVER compensates for semantic irrelevance.

# 238. Confidence-Aware Rating

Use a versioned confidence-aware method such as Bayesian average/Wilson-style confidence rather than raw mean. Support current-version and all-time views, verified-use policy and anti-brigading controls.

# 239. Recommendation Evaluation

Evaluate semantic relevance, eligibility, health, successful adoption, successful first run, correction/edit rate and privacy compliance. CTR alone is insufficient.

# 240. Marketplace Availability / Degraded Mode

If semantic search fails, fallback to lexical search. If rating aggregation fails, show cached aggregate with freshness. If generation fails, stable certified templates remain usable. If benchmark lab is unavailable, no new promotion occurs. Security/certification decisions fail safe.

# 241. Search Index Consistency

Canonical catalog/listing storage is source of truth, not the search index. Use idempotent indexing, rebuild support, stale deletion, schema versioning, visibility propagation and index freshness monitoring. Visibility changes receive priority.

# 242. Atomic Stable Promotion

Promotion atomically establishes candidate certification, stable version pointer, listing health/version metadata, search refresh event and audit event. A crash cannot leave an uncertified candidate stable. Use optimistic locking/CAS where appropriate.

# 243. Generation Thundering-Herd Control

Compatible concurrent generate requests SHOULD coalesce using generation key + active attempt + idempotency + lease/lock. Explicit force-regenerate can create an independent attempt.

# 244. Fork / Upstream Sync

Forks are independent lineages. Optional upstream update assistance may show parent diffs and offer cherry-pick/migration, but MUST NOT overwrite customizations silently.

# 245. Template Composition Safety

Composed templates/subflows revalidate schema/version compatibility, runtime/policy constraints, residency, side-effect ordering, approvals, cycles, budget and cancellation. Safety of components alone does not imply safety of the composition.

# 246. Two Independent Quality Dimensions

Expose `Certification Confidence` and `Real-World Usage Confidence` separately. A template can be E2E-certified with low usage, or highly used with new regressions. Never collapse both into one opaque score.

# 247. Marketplace Hidden Holdout

Maintain hidden Marketplace tests for search relevance, RBAC/visibility, ranking manipulation, review abuse, import attacks, dependency drift, concurrent promotion and generation idempotency. Release gating includes both workflow and Marketplace holdouts.

# 248. Revision 5 Acceptance Criteria

- [ ] 1,210 prompt-only cases load in stable order.
- [ ] Marketplace catalog contains 1,210 unique `id/category/prompt` records.
- [ ] UC-1001–UC-1210 specifically exercise Marketplace lifecycle behavior.
- [ ] Search has human-labeled relevance benchmark and hidden holdout.
- [ ] Typo/synonym/multilingual search is tested.
- [ ] Visibility is enforced before ranking/retrieval.
- [ ] Private/workspace/tenant/public templates are isolated.
- [ ] Creator submission uses certification/promotion gate.
- [ ] Reviews support verified-use context and report/appeal lifecycle.
- [ ] Licensing/fork attribution survives import/export/versioning.
- [ ] Import never includes secrets and is security-scanned.
- [ ] Stable promotion is atomic/concurrency-safe.
- [ ] Generate/regenerate is idempotent/coalesced.
- [ ] Search index is not source of truth.
- [ ] Semantic-search outage has safe degraded mode.
- [ ] Composition revalidates safety/compatibility.
- [ ] Benchmark runs never inflate public popularity.
- [ ] Real usage cannot bypass hard certification/security gates.
- [ ] Marketplace hidden holdout participates in release gating.

# 249. Twelve-Pass Audit Record

| Pass | Focus | Gap | Revision 5 correction |
|---:|---|---|---|
| 1 | Document integrity | Revision blocks were numerically out of order | Normalized ordering; added precedence |
| 2 | Corpus balance | Workflow tests dominated Marketplace lifecycle tests | Added 210 Marketplace-specific prompts |
| 3 | Search/discovery | No formal IR quality gate / typo / multilingual benchmark | Added search certification/query understanding |
| 4 | Generate/reuse | Concurrent generate/regenerate underdefined | Added coalescing/idempotency/promotion rules |
| 5 | Team/tenant | Visibility/RBAC incomplete | Added visibility model and RBAC |
| 6 | Creator ecosystem | Community submission/reputation thin | Added creator pipeline and reputation boundaries |
| 7 | Trust/reviews | Verified-use/report/appeal lifecycle incomplete | Added trust/report/moderation model |
| 8 | License/IP | Fork attribution and asset rights incomplete | Added license/IP publication boundaries |
| 9 | Portability | Import/export/setup/compatibility incomplete | Added package + setup + compatibility contracts |
| 10 | Ranking/recommendation | Popularity/rating could distort relevance | Added relevance-first/confidence-aware evaluation |
| 11 | Reliability | Index outage/promotion split-brain/cache recovery underdefined | Added degraded mode/index SoT/atomic promotion |
| 12 | Quality modeling | Benchmark and real usage could collapse into one score | Added independent confidence dimensions + holdout |

# 250. Revision 5 Corpus Summary

```text
UC-0001 – UC-1000   Workflow / Agent OS / SmartAIHub capability coverage
UC-1001 – UC-1210   Marketplace lifecycle / trust / discovery / reliability / external-access coverage
Total                1,210 prompts
```

# 251. Revision 5 Definition of Done

Spec 212 is complete only when SmartAIHub can prove both: **(A) the use case can become a real executable workflow, and (B) that workflow can live safely and usefully as a reusable Marketplace product.** The system must answer whether users can find it, whether the right audience can see it, whether a certified version exists, whether generation/regeneration is safe, whether dependencies are compatible, whether the user's environment is ready, whether lineage/license/reviews are trustworthy, whether failures recover safely, and whether real usage feeds future improvement without corrupting benchmark integrity.

# 252. Revision 5 Product Principle

> **Workflow capability and Marketplace product quality are one continuous lifecycle: discover an intent, generate or reuse a real workflow, certify it, make it safely reusable, learn from verified usage, and continuously re-test it as dependencies and user expectations evolve.**


# Appendix B — Revision 3 Corpus Loading Example

```python
import json

with open("spec-212-use-cases-1210.json", "r", encoding="utf-8") as f:
    prompts = json.load(f)

for index, prompt in enumerate(prompts, start=1):
    case_id = f"UC-{index:04d}"
    run_case(case_id=case_id, prompt=prompt)
```

---

# Appendix C — Example Evaluation Summary

```yaml
case_id: UC-0834
prompt: "..."

design: PASS
compile: PASS
resolve: PASS
sandbox_execution: PASS
verification: PASS

status: FULLY_SUPPORTED
gaps: []
```

---

# Appendix D — Example Gap Summary

```yaml
case_id: UC-0917
status: BLOCKED_MISSING_CAPABILITY

design: PASS
compile: FAIL

finding:
  code: HALLUCINATED_DEPENDENCY
  dependency: "nonexistent.capability"

owner: Spec 209 / AI Builder
```


---

# Appendix E — Revision 4 Marketplace Seed Files

Canonical benchmark loop input:

```text
spec-212-use-cases-1210.json
```

Marketplace import catalog:

```text
spec-212-marketplace-catalog-1210.json
```

The first remains prompt-only. The second contains exactly:

```text
id
category
prompt
```

for the current 1,210 seeded Marketplace/use-case entries.


---

# 253. Revision 5 Final Reconciliation — 1,210 Stable Use Cases

The final Revision 5 audit identified **21** Marketplace/productization families, each with 10 prompts. None should be removed merely to preserve a round number.

```text
Existing stable corpus     UC-0001 ... UC-1000
Revision 5 additions       UC-1001 ... UC-1210
----------------------------------------------
Historical Revision-5 canonical corpus   1,210
```

Revision 5 additions cover:

```text
Template discovery / favorites / collections
Template prerequisites / setup
Private / workspace / organization catalog
Creator publishing
Rights / licensing / attribution
Template dependency graph
Version migration
Template composition / subflows
Template supply-chain security
Review / rating trust
Marketplace reporting / incident
Search / recommendation / cold start
Import / export / portability
Marketplace operations / recovery
Cache / index / event consistency
Canary / experiment / rollout
Deprecation / support lifecycle
Localization / accessibility
Enterprise marketplace governance
Template economics / entitlement
External Marketplace API / Assistant
```

UC-0001…UC-1000 remain byte-for-byte/order-stable in the prompt corpus. New prompts are appended only.

---

# 254. Authoritative Marketplace State and Transaction Boundary

The canonical source of truth SHALL remain relational/catalog state plus canonical Spec 209 workflow/version identities. Search indexes, recommendation indexes, caches and aggregates are derived projections.

Critical state transitions SHOULD follow:

```text
DB transaction
  ├ authoritative row mutation
  ├ stable_version pointer / certification record
  └ transactional outbox event
          ↓
     idempotent consumers
       ├ search index
       ├ cache invalidation
       ├ recommendation projection
       ├ analytics projection
       └ re-certification scheduler
```

A search/index outage MUST NOT corrupt canonical listing state. A duplicate event MUST NOT duplicate promotion, counters, billing or reviews.

---

# 255. Template Dependency Graph and Reverse Impact Index

Every promoted template version SHALL have a dependency manifest and transitive dependency graph covering at least:

```text
subflows / other templates
SmartAIHub Skills
MCP servers/tools
A2A agents
external-agent runtime requirements
models/providers
Runner capabilities/apps
Computer Use requirements
Library/asset requirements
policy/economic contracts
```

For every dependency store identity, version/range/pin, schema hash where applicable, required/optional status and entitlement/license constraints.

Maintain a reverse dependency index so a changed capability can answer:

> Which stable templates may now be degraded or unsafe?

Dependency changes SHALL trigger impact-based re-certification rather than blindly re-running all templates.

---

# 256. Organization / Private Marketplace Governance

Required visibility scopes:

```text
PRIVATE_USER
PRIVATE_WORKSPACE
PRIVATE_ORGANIZATION
TENANT_PUBLIC
PLATFORM_PUBLIC
BENCHMARK_ONLY
SYSTEM_ONLY
```

Organizations MAY define:

```text
approved / mandatory / blocked templates
trusted publishers
minimum certification tier
local-only requirements
data-residency rules
allowed capability classes
publish/delete/payment approval policy
budget ceilings
```

Authorization filtering occurs before search retrieval/ranking. Unauthorized metadata MUST NOT leak through semantic/vector search, cache, autocomplete or recommendation.

---

# 257. Creator Rights, Licensing, Attribution and Takedown

Public/partner templates SHALL declare a redistribution/license profile covering:

```text
use
fork
redistribute
commercial use
attribution
embedded asset redistribution
derived-template publication
```

Marketplace SHALL support IP/copyright reports, evidence references, temporary quarantine, creator response, adjudication, takedown and restoration.

Private assets that can be used at runtime are NOT automatically redistributable in a template. Promotion must parameterize or remove non-redistributable assets.

---

# 258. Template Supply-Chain Trust Manifest

Curated/promoted versions SHOULD produce a signed trust manifest containing:

```text
workflow version/hash
dependency manifest hash
certification result/hash
publisher identity
schema version
promotion timestamp
material external egress declarations
```

Publication/import SHALL scan for:

```text
hard-coded secrets/tokens/private keys
credential-bearing URLs
unknown callbacks/domains
executable payloads
quarantined dependencies
hidden side effects
prompt-injection payloads in metadata
```

Community executable payloads MAY require sandbox analysis before public admission.

---

# 259. Search, Favorites, Collections and Cold-Start

Marketplace SHALL support:

```text
favorites
personal/workspace collections
recently viewed
recently used
saved search/filter state
not-interested/hide preference
```

Search/recommendation quality SHALL be benchmarked separately from workflow execution quality.

New certified templates require controlled cold-start discovery based on relevance + certification + exploration budget. Popularity alone SHALL NOT determine exposure.

Recommendation personalization must respect tenant/workspace privacy and MAY expose concise non-sensitive reasons such as "รองรับ Local AI ที่คุณมี" or "องค์กรแนะนำ".

---

# 260. Installation Preflight and Setup Wizard

Before `Use Template`, compare the template dependency manifest with the user's actual environment.

Return one of:

```text
READY
READY_WITH_OPTIONAL_GAPS
SETUP_REQUIRED
POLICY_BLOCKED
UNAVAILABLE
```

The setup wizard SHOULD guide only missing requirements:

```text
connect account
select project/account
select Runner/browser profile
install/enable local capability
choose Library input
approve permission
set budget
```

Normal users should not need MCP/A2A/ACP terminology.

---

# 261. User-Fork Upgrade / Three-Way Semantic Merge

When an upstream template changes, never overwrite the user's customized fork.

Upgrade comparison:

```text
Base Template vN
User modifications
New Template vN+1
```

Classify:

```text
AUTO_MERGE_SAFE
MERGE_WITH_REVIEW
CONFLICT
NOT_APPLICABLE
```

Any upgrade that materially changes external destination, side effects, permission scope, residency, required connection or cost envelope requires fresh validation/approval.

---

# 262. Import / Export Portability and Security

Export packages SHALL exclude secret values and include workflow/template schema, dependency manifest, IO contracts, runtime constraints, license/attribution and provenance.

Imported packages are untrusted. Validate:

```text
schema/version
signature/provenance when available
unknown security-critical fields
embedded executable payloads
dependency identities
callback/egress declarations
side effects
secret material
license metadata
```

Unknown security-relevant fields MUST NOT be silently dropped.

---

# 263. Marketplace Recovery, Rebuild and Reconciliation

Production operations SHALL support:

```text
full search-index rebuild from source of truth
incremental event replay
stale/missing search document detection
rating/usage aggregate recomputation
orphan listing/version/certification detection
cache invalidation/rebuild
backup/restore of Marketplace metadata
stable-version pointer integrity check after restore
```

Private/public cache keys must be isolated by material scope dimensions. A private listing MUST never be served from a public cache entry.

---

# 264. Canary, Rollout, Rollback and Support Lifecycle

Candidate versions MAY be canaried to controlled cohorts before global promotion.

Critical regression triggers immediate abort/rollback:

```text
wrong-account side effect
approval bypass
secret leak
residency violation
duplicate consequential side effect
material verified-success collapse
```

Template lifecycle SHALL support:

```text
ACTIVE
AT_RISK
DEPRECATED
SUNSET_PENDING
SUNSET
QUARANTINED
REMOVED
```

Deprecation UI must show reason, effective date, recommended replacement and migration impact. Never silently redirect to materially different behavior.

---

# 265. External Marketplace Discovery and Use

The same governed Marketplace catalog SHOULD be available to:

```text
Universal Assistant
SmartAIHub API
MCP-facing clients
A2A agents
other workflows
```

Preferred behavior for a new user goal:

```text
search eligible certified templates
  ↓
reuse / compose when fit is high
  ↓
AI-generate new workflow only when needed or explicitly requested
```

External callers obey the same visibility, entitlement, policy, approval and audit contracts. Ordinary external callers SHALL NOT regenerate/promote a global template without authoring/admin authority.

---

# 266. Marketplace Economics / Multi-Owner Attribution

Spec 212 MAY display:

```text
template price
estimated run cost
creator attribution
usage/revenue analytics
```

but the canonical economic plane / Spec 207 remains authoritative for reservation, authorization, actual charge, adjustment/refund and settlement.

For composed commercial templates preserve provenance references for:

```text
template creator
sub-template owners
Skill owners
tenant/partner
platform
```

No second Marketplace billing ledger is permitted.

---

# 267. Revision 5 Final Acceptance Criteria

- [ ] 1,210 prompt-only use cases load in stable order.
- [ ] 1,210 Marketplace catalog records have unique `id/category/prompt`.
- [ ] UC-0001…UC-1000 remain stable; UC-1001…UC-1210 are append-only.
- [ ] Marketplace product role is explicit in header/Executive Decision.
- [ ] Stable promotion is atomic and downstream projections are event-driven/idempotent.
- [ ] Template transitive dependencies and reverse impact are queryable.
- [ ] Private/workspace/org/public search scopes cannot leak.
- [ ] Creator publishing has license/rights/takedown/provenance contracts.
- [ ] Public/imported templates pass secret/egress/supply-chain scanning.
- [ ] Search has IR-quality tests, cold-start handling and privacy-safe recommendations.
- [ ] Preflight/setup identifies missing user-environment requirements.
- [ ] User forks can upgrade through three-way semantic merge without silent overwrite.
- [ ] Import/export is portable and excludes secrets.
- [ ] Search index/caches/counters are rebuildable from authoritative state/events.
- [ ] Canary can auto-abort on critical regressions.
- [ ] Deprecation/sunset has explicit install/run/migration behavior.
- [ ] Assistant/API/MCP/A2A use the same governed Marketplace catalog.
- [ ] Marketplace economics reuse the canonical economic plane.
- [ ] Benchmark/test traffic never inflates real popularity/reviews/revenue.
- [ ] Real feedback can add future benchmark candidates only through review/promotion gates.

---

# 268. Revision 5 Final Corpus Contract

Canonical prompt-only benchmark:

```text
spec-212-use-cases-1210.json
```

Marketplace import catalog:

```text
spec-212-marketplace-catalog-1210.json
```

Marketplace catalog entries contain exactly:

```text
id
category
prompt
```

All richer metadata belongs in the Marketplace database/index, not the seed JSON.

---

# 269. Revision 5 Final Definition of Done

Spec 212 reaches product-grade only when SmartAIHub can prove both dimensions for a use case:

```text
A. Workflow Capability
   Can AI Workflow Studio design, compile, resolve, execute, recover and verify it?

B. Marketplace Product Quality
   Can an eligible user find, understand, configure, trust, reuse, upgrade, review and safely run the template over time?
```

A template is not product-grade merely because generation succeeded once. It must remain portable, dependency-aware, policy-safe, observable, recoverable, versioned and continuously re-certifiable as the ecosystem changes.

---

# 270. Revision 5 Final Product Principle

> **Every benchmark use case is a candidate reusable product asset, but only continuously certified and governed workflow behavior becomes a Marketplace template. Real search, usage, reviews and incidents improve what SmartAIHub builds next; they never replace capability reality, security, policy, provenance or verification.**


---

# 271. Revision 6 — Multi-Variant Templates, Dependency Transparency & Admin Factory

Revision 6 upgrades the Marketplace model from:

```text
1 Use Case
→ 1 Template
```

to:

```text
1 Use Case
→ N Solution Variants
→ N Template Version Histories
→ many User Forks / Workflow Instances
```

This is a necessary product-model change.

A single natural-language goal may be achievable through materially different methods.

Example:

```text
UC-0637
"สร้าง workflow รีวิวสินค้าแล้วเผยแพร่"

Solution Variant A
  SmartAIHub Skills only

Solution Variant B
  SmartAIHub Skills + Computer Use

Solution Variant C
  Codex + SmartAIHub Skills

Solution Variant D
  Claude + SmartAIHub Skills

Solution Variant E
  Local-only / Runner
```

The user SHALL be able to inspect the differences and choose the method suitable for their environment, privacy, tools, quality expectations, cost and preferences.

---

# 272. Critical Terminology — Variant Is Not Version

The implementation MUST distinguish these concepts.

```text
Use Case
= user intent / desired outcome

Solution Variant
= one materially distinct method of accomplishing that intent

Template Version
= historical revision of one Solution Variant

User Fork / Workflow Instance
= user's editable copy created from a Template Version
```

Canonical hierarchy:

```text
UseCase UC-0637
 ├ Variant SV-01 — SmartAIHub Native/Skills
 │   ├ Template v1
 │   ├ Template v2
 │   └ Template v3 ← stable
 │
 ├ Variant SV-02 — Computer Use
 │   ├ Template v1
 │   └ Template v2 ← stable
 │
 ├ Variant SV-03 — Codex Hybrid
 │   └ Template v1 ← stable
 │
 └ Variant SV-04 — Claude Hybrid
     ├ Template v1
     └ Template v2 ← stable
```

Do NOT use "Version A / Version B" to mean different strategies.

---

# 273. Solution Variant Identity

Recommended stable identity:

```text
UC-0637-SV01
UC-0637-SV02
UC-0637-SV03
...
```

A Solution Variant SHOULD have:

```text
variant_id
use_case_id
title
short_description
strategy_key
strategy_family
dependency_manifest_id
runtime_policy
execution_target_policy
privacy/locality_profile
expected_setup
stable_workflow_version_id
latest_candidate_version_id
health_status
certification_tier
created_at
updated_at
```

Variant IDs remain stable even when the stable template version changes.

---

# 274. Materially-Distinct Variant Rule

A new Solution Variant SHALL exist only if the execution method differs materially.

Material differences include:

```text
different required dependency class
different external agent/harness
Computer Use vs no Computer Use
local-only vs cloud-dependent
different protocol path with material user requirement
different required software / Runner capability
materially different approval / security model
materially different control-flow architecture
materially different cost/privacy/latency envelope
```

Normally NOT sufficient by itself:

```text
same workflow + newer model version
same graph + different temperature
same capability + equivalent provider endpoint
minor prompt wording
cosmetic node layout
```

Those belong in Template Version or runtime configuration.

---

# 275. Variant De-Duplication / Strategy Fingerprint

Before creating a new Variant, compute a normalized strategy fingerprint from:

```text
logical graph roles
required capability classes
dependency identities/classes
external-agent family
Computer Use requirement
execution locality
side-effect/approval boundaries
runtime strategy
```

If the candidate is semantically equivalent to an existing Variant, create a new Template Version under that Variant instead of creating another Variant.

This prevents uncontrolled Marketplace fragmentation.

---

# 276. Variant Strategy Families

Initial strategy families MAY include:

```text
AUTO_RESOLVED
SMARTAIHUB_NATIVE
SMARTAIHUB_SKILLS_ONLY
SMARTAIHUB_AGENT_SKILL
COMPUTER_USE
CODEX
CLAUDE
EXTERNAL_AGENT
A2A
LOCAL_ONLY
RUNNER_LOCAL
CLOUD_MANAGED
HYBRID
BUDGET_OPTIMIZED
QUALITY_OPTIMIZED
PRIVACY_OPTIMIZED
```

These are strategy profiles, not mandatory node types.

A use case does not need every strategy.

---

# 277. Variant Applicability

Every attempted strategy SHALL resolve to one of:

```text
APPLICABLE
APPLICABLE_WITH_SETUP
PARTIALLY_APPLICABLE
NOT_APPLICABLE
BLOCKED_MISSING_CAPABILITY
BLOCKED_POLICY
BLOCKED_ENVIRONMENT
```

Example:

```text
Use Case requires desktop application

SMARTAIHUB_SKILLS_ONLY
→ NOT_APPLICABLE

COMPUTER_USE
→ APPLICABLE

CODEX_ONLY
→ NOT_APPLICABLE

CODEX + Runner + Computer Use
→ APPLICABLE_WITH_SETUP
```

Admin batch generation SHALL retain the reason when a strategy is not applicable.

---

# 278. Dependency Manifest Is First-Class User Data

Every Solution Variant SHALL expose its dependency manifest.

Dependency classes include:

```text
SmartAIHub Skill
SmartAIHub Workflow/Subflow
Internal capability
Model / Provider
MCP server/tool/resource
A2A agent
External Agent / Harness
ACP coding agent
Computer Use
Browser / browser login
Runner
Local software
Local AI model
ComfyUI workflow/checkpoint
Library / R2 / Vector capability
Required connection/account
Required secret reference
Approval capability
Economic/budget requirement
```

Dependencies are not hidden implementation details.

---

# 279. Direct vs Transitive Dependencies

UI and API SHOULD distinguish:

```text
Direct dependency
= explicitly required by the Variant

Transitive dependency
= required through a Skill/Subflow/Agent/Template dependency
```

Normal user view MAY show important dependencies only.

Advanced/Admin view SHALL expose the complete graph.

---

# 280. Per-User Dependency Readiness

Marketplace MUST not only say what a Variant needs.

It SHALL determine whether the current user/environment has those requirements.

Per dependency:

```text
READY
OPTIONAL
SETUP_REQUIRED
MISSING
UNAVAILABLE
POLICY_BLOCKED
UNHEALTHY
UNKNOWN
```

Example user UI:

```text
วิธี: SmartAIHub + Computer Use

ต้องใช้:
✓ SmartAIHub Runner
✓ Chrome login
✓ Video Edit Skill
! DaVinci Resolve — ยังไม่พบ
✓ Library access

สถานะ: ต้องตั้งค่าเพิ่ม 1 รายการ
```

---

# 281. Variant Dependency Preflight

Before `Use This Method`:

```text
Variant Dependency Manifest
          +
User / Workspace Environment Inventory
          ↓
Preflight
```

Output:

```text
READY
READY_WITH_OPTIONAL_GAPS
SETUP_REQUIRED
POLICY_BLOCKED
TEMPORARILY_UNAVAILABLE
```

The user can see exactly why a method is or is not usable.

---

# 282. Variant Comparison UX

Use-case detail SHOULD show a comparison of available methods.

Example:

| Method | Main dependencies | Computer Use | External Agent | Local/Cloud | Setup | Certification |
|---|---|---:|---|---|---|---|
| SmartAIHub Skills | 4 Skills | No | No | Cloud/Hybrid | Ready | E2E |
| Computer Use | Runner + Browser | Yes | No | Local | Needs Runner | Sandbox |
| Codex Hybrid | Codex + Runner + Skills | Optional | Codex | Hybrid | Codex login | E2E |
| Claude Hybrid | Claude + Skills | No | Claude | Cloud | Claude access | E2E |

Additional columns MAY include:

```text
estimated cost band
estimated latency band
privacy/locality
verified success rate
user rating
usage count
known limitations
```

---

# 283. User Choice Is Preserved

Marketplace MAY mark:

```text
Default
Recommended for this environment
Lowest setup
Local-only
No Computer Use
```

but SHALL allow the user to choose another eligible Variant.

The platform SHOULD explain material differences rather than hiding the strategy choice.

---

# 284. Variant Generation Planner

For a never-generated use case, Spec 212 MAY ask AI Workflow Studio / Capability Resolver to enumerate materially different feasible strategies.

Conceptual:

```text
Use Case
  ↓
Capability discovery
  ↓
Strategy enumeration
  ↓
Candidate Variant plans
  ↓
De-duplicate by strategy fingerprint
  ↓
Generate selected Variants
```

Admin can configure maximum variants per use case.

Recommended default:

```text
3–5 materially distinct Variants
```

not every possible provider combination.

---

# 285. Existing Variant Reuse

If a matching healthy Variant already exists:

```text
same use case
+ equivalent strategy fingerprint
```

the system SHALL reuse the Variant and generate a new Template Version only when regeneration is requested or required.

---

# 286. Variant-Specific Certification

Certification attaches to:

```text
Solution Variant
+
exact Template Version
+
dependency snapshot
```

One Variant passing certification does NOT imply another Variant for the same use case is certified.

Example:

```text
UC-0637-SV01 Skills-only       → E2E_CERTIFIED
UC-0637-SV02 Computer Use      → SANDBOX_CERTIFIED
UC-0637-SV03 Codex Hybrid      → DEGRADED
```

---

# 287. Variant-Specific Usage Metrics

Usage MUST be countable at multiple levels:

```text
Use Case aggregate
Solution Variant
Template Version
User Fork
```

For Variant:

```text
unique_users
instantiate_count
run_count
successful_run_count
verified_success_rate
fork/edit_rate
regenerate_count
review_count
```

This enables comparing methods for the same user goal.

---

# 288. Variant-Specific Reviews

Reviews SHALL attach primarily to the Solution Variant, while recording the exact Template Version used.

Conceptual:

```text
use_case_id
variant_id
template_version_id
user_id
verified_use
usability_vote
quality_stars
review_text
```

This prevents reviews of the Computer Use strategy from being mixed indiscriminately with reviews of the Skills-only strategy.

---

# 289. Usability Vote

In addition to star rating, users SHALL be able to choose one usability vote:

```text
READY_AS_IS
label: "ใช้ได้เลย"

WORKS
label: "ใช้งานได้"

FAIR
label: "พอใช้"
```

Recommended semantics:

```text
ใช้ได้เลย
= ใช้งานได้ตามโจทย์แทบไม่ต้องแก้ workflow

ใช้งานได้
= ทำงานได้จริง แต่อาจต้องตั้งค่า/แก้เล็กน้อย

พอใช้
= ใช้ได้บางส่วนหรือต้องปรับ workflow พอสมควร
```

A separate **Report Problem / ใช้ไม่ได้** action SHOULD exist for failed/unsafe execution rather than overloading the three positive usability votes.

---

# 290. Quality Star Rating

Quality rating:

```text
1–5 stars
```

represents perceived result quality.

Therefore:

```text
Usability vote
!=
Quality stars
```

Example:

```text
ใช้ได้เลย
แต่ output quality = 3 stars
```

is valid.

A workflow may be operationally easy but produce mediocre creative output.

---

# 291. Optional Review Dimensions

Future UI MAY optionally collect:

```text
setup_ease
output_quality
reliability
speed
cost_value
```

Do not make all dimensions mandatory; keep review friction low.

---

# 292. Verified-Use Review Requirement

`Verified Use` SHALL be determined from actual Marketplace/template usage records.

User cannot self-assert the badge.

The badge may require:

```text
instantiated Variant
and/or
completed at least one workflow run
```

according to product policy.

---

# 293. Variant Rating Aggregation

Marketplace SHOULD show:

```text
current-version rating
Variant all-time rating
recent rating trend
verified-use vote distribution
```

Example:

```text
ใช้ได้เลย   71%
ใช้งานได้   23%
พอใช้        6%

★ 4.6 / 5
126 Verified reviews
```

---

# 294. Use-Case-Level Comparison Signals

At the parent Use Case level, aggregate each Variant separately.

Do NOT merge all ratings into one average that hides strategy differences.

Example:

```text
UC-0637

Skills-only         ★4.7   ใช้ได้เลย 81%
Computer Use        ★4.1   ใช้ได้เลย 58%
Codex Hybrid        ★4.8   ใช้ได้เลย 76%
Claude Hybrid       ★4.6   ใช้ได้เลย 73%
```

---

# 295. Admin Rights Model

Global Marketplace template editing is privileged.

Recommended roles:

```text
MARKETPLACE_ADMIN
TEMPLATE_CURATOR
TEMPLATE_REVIEWER
BENCHMARK_ADMIN
```

Permissions can be split by organization policy.

---

# 296. Admin Global Edit Semantics

Admin SHALL be able to improve any global/system/community Template for which policy grants curation rights.

However:

> **Published/Stable Template Versions are immutable.**

Admin edit flow:

```text
Stable Template v5
   ↓
Create Admin Draft v6
   ↓
Manual Canvas Edit
and/or
Natural-Language AI Edit
   ↓
Validate / Compile / Resolve
   ↓
Diff
   ↓
Certification
   ↓
Promote v6
```

Admin MUST NOT mutate v5 in place.

---

# 297. Admin Custom Editing Capabilities

Admin editor SHALL support:

```text
add/remove/reconnect nodes
edit node configuration
replace Skill/Agent/tool
change runtime policy
change dependency requirement
change approval boundary
change verifier
change retry/fallback/replan
edit input/output schema
edit setup/default values
edit descriptive metadata
```

Every change remains versioned and audited.

---

# 298. Admin Edit Safety

Before promoting an admin-edited Template:

```text
schema validation
graph validation
dependency validation
security scan
compile
resolve
benchmark
certification
```

remain mandatory.

Admin authority does not bypass certification.

---

# 299. Normal User Editing Boundary

Normal user SHALL NOT directly modify a global Marketplace Template or shared stable Variant.

Allowed:

```text
Preview
Use Template
Fork / Copy
Customize own workflow
Rate / Review
Report Problem
Suggest Improvement
```

Flow:

```text
Marketplace Variant
  ↓
Use / Copy
  ↓
User-owned Workflow
  ↓
User edits freely within normal permissions
```

Global template is unchanged.

---

# 300. User Fork Provenance

A user-owned workflow created from Marketplace SHALL retain:

```text
source_use_case_id
source_variant_id
source_template_version_id
forked_at
```

Subsequent user edits do not imply changes to the Marketplace source.

---

# 301. Suggest Improvement

Users MAY submit:

```text
review
problem report
improvement suggestion
```

without editing the global Template.

Admin/curator can convert high-value suggestions into candidate edits or benchmark cases.

---

# 302. Admin Bulk Workflow Factory

Spec 212 SHALL provide an Admin-only bulk generation system.

Primary input:

```text
Start Use Case ID
End Use Case ID
```

Example:

```text
UC-0001 → UC-0200
```

The system iterates sequentially or in controlled parallelism.

---

# 303. Admin Bulk Generation Modes

Admin SHALL be able to choose:

```text
GENERATE_MISSING
GENERATE_ALL
REGENERATE_DEGRADED
REGENERATE_SELECTED
CERTIFY_ONLY
RECERTIFY
GENERATE_VARIANTS
GENERATE_AND_CERTIFY
```

---

# 304. Bulk Variant Strategy Selection

For `GENERATE_VARIANTS`, Admin MAY select strategy profiles:

```text
AUTO_RESOLVED
SMARTAIHUB_SKILLS_ONLY
COMPUTER_USE
CODEX
CLAUDE
LOCAL_ONLY
HYBRID
QUALITY_OPTIMIZED
BUDGET_OPTIMIZED
```

Example:

```text
IDs: UC-0401 → UC-0550

Generate:
✓ SmartAIHub Skills
✓ Computer Use
✓ Codex
✓ Claude

Max variants/use case: 4
```

For non-applicable strategies, record the reason instead of forcing a bad workflow.

---

# 305. Bulk Job Configuration

Admin batch options SHOULD include:

```text
start_id
end_id
category_filter
strategy_profiles[]
max_variants_per_use_case
skip_existing_certified
regenerate_degraded_only
concurrency
cost_budget
token_budget
provider_allowlist
environment_profile
minimum_test_level
stop_on_critical_error
dry_run
```

---

# 306. Bulk Execution Uses Feature 195

Bulk generation is durable work.

```text
BulkGenerationRun
   ↓
parent worker_job
   ↓
UseCase child jobs
   ↓
Variant generation child jobs
   ↓
Compile / Resolve / Certify
```

Admin may leave the page; work continues.

---

# 307. Bulk Progress UI

Admin dashboard SHALL show:

```text
Range: UC-0001 → UC-0500

Total use cases       500
Processed             327
Remaining             173

Variants attempted    1,184
Certified               842
Partial                 116
Not applicable           91
Failed                   77
Waiting/Running           58
```

Also show progress by strategy/profile.

---

# 308. Per-Use-Case Bulk Result

For every Use Case:

```text
UC-0147

Skills-only
  CERTIFIED

Computer Use
  CERTIFIED

Codex
  FAILED
  GAP_ACP_RUNTIME

Claude
  BLOCKED_ENVIRONMENT
  Claude connection missing

Local-only
  NOT_APPLICABLE
```

---

# 309. Bulk Error Contract

Every failed/blocked Variant attempt SHALL record:

```text
use_case_id
variant_strategy
generation_attempt_id
phase
status
error_code
human_readable_message
technical_detail
retryable
gap_owner
workflow_id/version if created
worker_job_id
trace_id
evidence_refs
occurred_at
```

---

# 310. Error Phase Taxonomy

At minimum:

```text
PROMPT_PARSE
CAPABILITY_DISCOVERY
STRATEGY_PLANNING
WORKFLOW_GENERATION
SCHEMA_VALIDATION
GRAPH_VALIDATION
DEPENDENCY_RESOLUTION
COMPILE
RUNTIME_RESOLUTION
POLICY
SECURITY
MOCK_EXECUTION
SANDBOX_EXECUTION
E2E_EXECUTION
VERIFICATION
SANITIZATION
PROMOTION
```

This makes failures actionable.

---

# 311. Bulk Gap Dashboard

Aggregate errors by:

```text
error code
gap owner
Spec owner
node type
dependency
runtime
strategy profile
category
use case range
```

Example:

```text
GAP_COMPUTER_USE             31
GAP_CLAUDE_CONNECTION        18
GAP_VIDEO_EDIT               12
HALLUCINATED_CAPABILITY       8
SCHEMA_BINDING_ERROR          8
```

Admin can drill down to affected IDs.

---

# 312. Bulk Retry / Resume

Admin SHALL be able to:

```text
retry failed only
retry selected error code
retry selected IDs
resume interrupted batch
pause batch
cancel remaining
change concurrency for remaining
```

Completed successful variants MUST NOT be regenerated unless explicitly requested.

---

# 313. Bulk Checkpoint

Persist cursor/progress:

```text
last_scheduled_use_case
completed_attempts
pending_attempts
failed_attempts
configuration_snapshot
```

Server/worker restart must not restart the entire range.

---

# 314. Bulk Cost Guard

Admin bulk generation SHALL enforce:

```text
budget reservation/limit
per-strategy cost ceiling
max external-agent turns
max CUA steps
max media generation calls
max concurrency
```

On budget exhaustion:

```text
PAUSED_BUDGET
```

rather than silently spending beyond configured limits.

---

# 315. Bulk Critical Safety Stop

If any attempt detects critical platform failure such as:

```text
cross-tenant leakage
approval bypass
secret leakage
wrong-account execution
duplicate economic side effect
```

the batch SHALL support automatic:

```text
PAUSED_CRITICAL
```

and alert Admin.

---

# 316. Bulk Result Export

Admin SHALL be able to export results as machine-readable:

```text
JSON
CSV
```

and optionally human-readable report.

Fields include Use Case, Variant, status, dependencies, workflow version, certification, errors and gap owner.

---

# 317. Bulk Generation Is Not Marketplace Usage

Admin generation/testing MUST NOT increment:

```text
unique real users
real usage count
Verified Use reviews
popularity ranking
creator revenue
```

System/admin/test activity remains isolated from real-user analytics.

---

# 318. Variant Generation Feedback Loop

Bulk generation is a capability discovery engine.

Example:

```text
500 Use Cases
× 4 strategy profiles
        ↓
2,000 attempts
        ↓
417 fail for 9 recurring reasons
        ↓
gap clustering
        ↓
platform/spec improvement
        ↓
retry failed subset
```

This is a primary purpose of the Admin factory.

---

# 319. Variant Health Model

Each Solution Variant SHALL have:

```text
HEALTHY
SETUP_REQUIRED
DEGRADED
AT_RISK
UNAVAILABLE
DEPRECATED
QUARANTINED
```

Health combines:

```text
latest certification
dependency health
recent verified success
critical incidents
current stable version
```

User rating alone does not determine health.

---

# 320. Default Variant Selection

One use case MAY have a `default_variant_id`.

Selection SHOULD consider:

```text
current user eligibility
dependency readiness
certification
policy/privacy
platform preference
```

A default is not permanent; it may vary by user environment.

---

# 321. Variant Recommendation Per User

Example:

```text
User A has:
- Runner
- Codex
- local repo

Recommended:
Codex Hybrid

User B has:
- no Runner
- SmartAIHub Skills only

Recommended:
Skills-only
```

The user remains able to inspect other eligible methods.

---

# 322. Marketplace Card vs Use-Case Detail

Search result card SHOULD remain compact and represent the parent Use Case.

Example:

```text
UC-0637
รีวิวสินค้าและเผยแพร่

4 วิธีให้เลือก
3 พร้อมใช้ใน Environment ของคุณ

★ 4.6
ผู้ใช้ 2.8k

[ดูวิธีการ]
```

The detail page expands Variant cards.

---

# 323. Variant Card UX

Example:

```text
วิธีที่ 1 — SmartAIHub Skills Only

ไม่ใช้ Computer Use
ไม่ต้องมี Codex/Claude
Cloud/Hybrid

Dependencies
✓ Product Review Skill
✓ Storyboard Skill
✓ Media Studio
✓ Publish Skill

สถานะของคุณ
✓ พร้อมใช้

Certification
E2E Certified

ผู้ใช้ 1,421
ใช้ได้เลย 82%
★ 4.7

[ใช้วิธีนี้]
[ดู Workflow]
```

---

# 324. Variant With Missing Dependencies UX

```text
วิธีที่ 2 — Codex + SmartAIHub

Dependencies
✓ SmartAIHub Runner
! Codex — ยังไม่ได้เชื่อมต่อ
✓ Repository access
✓ Browser QA

สถานะ
ต้องตั้งค่าเพิ่ม

[ตั้งค่า Codex]
[ดูรายละเอียด]
```

---

# 325. Variant Preview Graph

Every Variant detail SHOULD permit graph preview before use.

Show:

```text
nodes
major edges
key dependencies
approval points
Computer Use points
external-agent nodes
outputs
```

Do not require the user to open the full Workflow Studio to understand the method.

---

# 326. Review Comparison UI

Use-case detail MAY expose:

```text
Compare user feedback by method
```

with:

```text
Usability vote distribution
Star rating
Verified Use count
Recent issues
```

This is especially valuable when multiple methods have different trade-offs.

---

# 327. Template Version Reviews

A review stores the exact version used.

If version v4 fixes a problem found in v3, UI SHOULD support:

```text
Current version reviews
All historical reviews
```

so outdated negative feedback does not obscure current quality.

---

# 328. Admin Variant Controls

Admin Variant detail SHALL support:

```text
Create new Variant
Generate candidate
Regenerate
Clone Variant
Edit draft
Compare versions
Promote candidate
Rollback stable
Deprecate Variant
Quarantine Variant
Change default eligibility
Run certification
Run benchmark subset
Inspect dependencies
```

All privileged actions are audited.

---

# 329. Admin Manual Variant Creation

Admin MAY manually define a new strategy even if AI strategy enumeration did not discover it.

Example:

```text
"สร้าง Variant ที่ใช้ SmartAIHub Skills เท่านั้น
ห้าม Computer Use และ external agents"
```

The result still passes normal generation/validation/certification.

---

# 330. Admin Dependency Override

Admin may edit dependency requirements on a candidate draft.

However an override cannot falsely mark a required runtime/tool as optional if graph/compile/runtime evidence proves it is required.

The certification validator is authoritative.

---

# 331. Variant API Model

Suggested endpoints:

```text
GET  /workflow-marketplace/:use_case_id/variants
POST /workflow-marketplace/:use_case_id/variants/generate
POST /workflow-marketplace/:use_case_id/variants

GET  /workflow-marketplace/variants/:variant_id
GET  /workflow-marketplace/variants/:variant_id/dependencies
POST /workflow-marketplace/variants/:variant_id/use
POST /workflow-marketplace/variants/:variant_id/regenerate

GET  /workflow-marketplace/variants/:variant_id/reviews
POST /workflow-marketplace/variants/:variant_id/reviews

POST /admin/workflow-marketplace/bulk-generation
GET  /admin/workflow-marketplace/bulk-generation/:batch_id
POST /admin/workflow-marketplace/bulk-generation/:batch_id/pause
POST /admin/workflow-marketplace/bulk-generation/:batch_id/resume
POST /admin/workflow-marketplace/bulk-generation/:batch_id/retry

POST /admin/workflow-marketplace/variants/:variant_id/draft
POST /admin/workflow-marketplace/variants/:variant_id/promote
```

Actual naming may follow repository conventions.

---

# 332. Suggested Persistence Additions

Conceptually:

```text
workflow_solution_variants
workflow_variant_dependency_manifests
workflow_variant_dependency_items
workflow_variant_generation_attempts
workflow_variant_reviews
workflow_variant_vote_aggregates
workflow_variant_usage_aggregates
workflow_bulk_generation_runs
workflow_bulk_generation_items
```

Continue to reuse Spec 209 canonical:

```text
workflows
workflow_versions
workflow_runs
```

Do not duplicate workflow version storage in Spec 212.

---

# 333. Solution Variant Record

Conceptual:

```text
variant_id
use_case_id
strategy_key
strategy_fingerprint
title
description
runtime_policy
locality_profile
stable_workflow_version_id
latest_candidate_version_id
certification_tier
health_status
visibility
created_by
created_at
updated_at
```

---

# 334. Variant Review Record

Conceptual:

```text
review_id
variant_id
template_version_id
user_id
verified_use
usability_vote
quality_stars
review_text
moderation_state
created_at
updated_at
```

Unique active review policy can be:

```text
one review / user / variant
```

with the current version stored on each edit/review submission.

---

# 335. Admin Bulk Run Record

Conceptual:

```text
batch_id
start_use_case_id
end_use_case_id
strategy_profiles
configuration_snapshot
status
total_cases
total_variant_attempts
completed
failed
blocked
not_applicable
started_by
started_at
completed_at
parent_worker_job_id
```

---

# 336. Admin Bulk Item Record

```text
batch_item_id
batch_id
use_case_id
strategy_profile
variant_id_optional
attempt_id
status
phase
error_code
gap_owner
worker_job_id
trace_id
created_at
completed_at
```

---

# 337. Variant-Level Search

Search MAY support filters such as:

```text
ไม่ใช้ Computer Use
ใช้ Codex
ใช้ Claude
SmartAIHub only
Local-only
ไม่ต้อง Runner
E2E Certified
พร้อมใช้กับ Environment ของฉัน
```

This filter operates on Variant attributes, not only parent Use Case metadata.

---

# 338. Search Ranking With Variants

Search result relevance remains based on parent use-case intent.

Variant eligibility can then boost/deprioritize cards.

Example:

```text
Use Case relevance: high
but 0 Variants usable by this user
→ still display if relevant
→ mark "ต้องตั้งค่าเพิ่ม"

Use Case relevance: high
and 2 READY Variants
→ stronger usable-result signal
```

Do not hide relevant use cases solely because current environment is missing a dependency unless policy requires it.

---

# 339. Variant Count Guardrails

Recommended policies:

```text
soft recommended variants/use case: 3–5
hard configurable ceiling: e.g. 10
```

Admin can exceed only with explicit reason.

Automatic generator SHOULD avoid provider-by-provider combinatorial explosion.

---

# 340. Variant Merge / Retirement

If two Variants converge and become semantically equivalent:

```text
choose canonical surviving Variant
mark duplicate Variant DEPRECATED/MERGED
preserve historical reviews/runs
redirect discovery to canonical Variant
```

Do not delete history.

---

# 341. Variant Promotion From User Fork

A user's improved fork MAY be submitted as a candidate improvement.

It does not directly replace a global Template.

Flow:

```text
User Fork
→ Submit Improvement
→ Admin/Curator Review
→ Sanitization
→ semantic diff
→ Candidate Template Version or new Variant
→ Certification
→ Promotion
```

This allows community improvement without granting global edit rights.

---

# 342. Variant-Specific Incident Handling

Incident may target:

```text
one Variant
one Template Version
one dependency
all Variants of a Use Case
```

Example:

```text
Codex outage
→ Codex Variants DEGRADED
→ Skills-only Variants remain HEALTHY
```

Do not take the entire parent Use Case offline unnecessarily.

---

# 343. Variant-Specific Dependency Drift

When one dependency changes, re-certify only affected Variants.

Example:

```text
Computer Use adapter changed
→ affected Computer Use Variants

Claude runtime changed
→ affected Claude Variants

SmartAIHub Skill schema changed
→ all dependent variants
```

This makes continuous certification scalable.

---

# 344. Variant-Specific Economics

For each Variant expose estimated:

```text
template price/entitlement if any
run-cost band
external BYO cost indication
Runner requirement
cost uncertainty
```

Different methods for the same use case may have materially different cost structures.

---

# 345. Variant-Specific Privacy / Locality

Expose:

```text
LOCAL_ONLY
LOCAL_PREFERRED
CLOUD_ALLOWED
CLOUD_REQUIRED
HYBRID
```

and material egress destinations.

A privacy-sensitive user may select a different Variant even if another is faster or more popular.

---

# 346. Variant-Specific Quality / Performance Evidence

Admin/advanced view MAY compare:

```text
benchmark verified success
real verified success
latency
cost
human intervention
failure classes
star quality
usability vote
```

These are metrics, not one opaque combined score.

---

# 347. Revision 6 Admin Workflow Factory — Definition of Success

Admin MUST be able to say:

```text
"สร้าง Workflow ตั้งแต่ UC-0200 ถึง UC-0500
ลอง Skills-only, Computer Use, Codex และ Claude
ข้ามตัวที่ Certified แล้ว
ถ้าล้มให้บันทึกสาเหตุ
รันพร้อมกันไม่เกิน 8 งาน
หยุดถ้าพบ critical security failure"
```

and receive a complete durable report without manually opening every use case.

---

# 348. Revision 6 Acceptance Criteria — Multi-Variant

- [ ] One Use Case supports zero-to-many Solution Variants.
- [ ] Variant and Template Version are separate concepts.
- [ ] Each Variant has a stable identity and strategy fingerprint.
- [ ] Materially equivalent strategies are de-duplicated.
- [ ] Each Variant has its own stable Template Version pointer.
- [ ] Each Variant has its own dependency manifest.
- [ ] Each Variant is independently certified and health-tracked.
- [ ] User can compare eligible methods before choosing.
- [ ] User environment readiness is shown per Variant.
- [ ] Variant-specific usage/reviews remain separate.

---

# 349. Revision 6 Acceptance Criteria — Dependency Transparency

- [ ] Direct and transitive dependencies are queryable.
- [ ] Normal UI shows important dependencies.
- [ ] Admin UI shows full dependency graph.
- [ ] Readiness is computed against user/workspace environment.
- [ ] Missing dependency gives actionable setup.
- [ ] Dependency health drift updates affected Variant health.
- [ ] Privacy/locality and external egress are visible.
- [ ] Estimated cost/requirements can differ by Variant.

---

# 350. Revision 6 Acceptance Criteria — Reviews

- [ ] Review is attached to Variant.
- [ ] Exact Template Version used is recorded.
- [ ] User can vote `ใช้ได้เลย / ใช้งานได้ / พอใช้`.
- [ ] User can rate quality 1–5 stars.
- [ ] Text review remains available.
- [ ] Verified Use is system-derived.
- [ ] Current-version and historical feedback can be separated.
- [ ] Review abuse controls remain applied.
- [ ] Use-case comparison does not hide Variant differences.

---

# 351. Revision 6 Acceptance Criteria — Admin Global Editing

- [ ] Admin can create/edit candidate draft for any permitted global Variant.
- [ ] Published stable versions remain immutable.
- [ ] Manual graph edits are supported.
- [ ] Natural-language AI edits are supported.
- [ ] Admin can modify dependencies/runtime/approval/verifier in draft.
- [ ] Every edit creates version/audit history.
- [ ] Admin edit cannot bypass compile/security/certification.
- [ ] Admin can compare/promote/rollback/deprecate/quarantine.
- [ ] Normal user cannot edit global stable Template.
- [ ] Normal user can fork/copy and edit only their own workflow.

---

# 352. Revision 6 Acceptance Criteria — Bulk Generation

- [ ] Admin can enter start ID and end ID.
- [ ] Admin can select strategy profiles.
- [ ] Admin can set max Variants/use case.
- [ ] Admin can skip existing certified Variants.
- [ ] Batch uses durable `worker_jobs`.
- [ ] Batch supports controlled concurrency and budget limits.
- [ ] Every failed attempt records phase/code/reason/gap owner.
- [ ] NOT_APPLICABLE is distinct from FAILED.
- [ ] Batch can pause/resume/cancel/retry failed subset.
- [ ] Critical safety issue can pause entire batch.
- [ ] Progress and per-ID/Variant status are visible live.
- [ ] Result can export JSON/CSV.
- [ ] Admin/test executions never inflate Marketplace real usage.

---

# 353. Revision 6 Definition of Done

Revision 6 is complete when a single Marketplace Use Case can behave like:

```text
UC-XXXX
  ├ Method A
  │   Dependencies...
  │   v1 → v2 → stable v3
  │   reviews / votes / usage
  │
  ├ Method B
  │   Dependencies...
  │   stable v2
  │   reviews / votes / usage
  │
  └ Method C
      Dependencies...
      stable v1
      reviews / votes / usage
```

and:

```text
User:
  can inspect/compare methods
  can see required tools
  can choose method
  can use/fork it
  can edit only own copy
  can vote/review the method used

Admin:
  can generate methods in bulk
  can inspect exact errors/gaps
  can globally improve candidate workflows
  can certify/promote/rollback
  can preserve immutable history
```

---

# 354. Revision 6 Product Principle

> **A use case defines WHAT the user wants. A Solution Variant defines one materially distinct HOW. A Template Version records the evolution of that HOW. The user chooses the HOW that fits their environment; the Admin and certification system continuously improve and validate every shared HOW without mutating users' own workflows or historical versions.**


---

# 355. Revision 7 — Multi-Variant Certification Matrix, Strategy Contract & Governance Hardening

Revision 7 was produced after another minimum ten-pass completeness audit of Revision 6.

The audit found ten product-grade gaps:

```text
1. Variant strategy identity could drift across Template Versions.
2. Dependency manifests needed AND / OR / ONE_OF semantics.
3. Certification needed to be environment/path-specific rather than a scalar badge.
4. Cross-Variant fallback and user consent were underdefined.
5. Reviews needed stronger version/environment/fraud integrity.
6. Admin global editing required separation-of-duties and creator-rights governance.
7. Bulk generation needed stronger reproducibility, locking and notification.
8. Fork/merge/community lineage needed a canonical graph.
9. Cost/privacy/egress changes required explicit consent boundaries.
10. Certification freshness/re-certification operations needed scalable policy.
```

Revision 7 patches all ten and appends **100 new canonical prompts** as `UC-1211…UC-1310`.

Current corpus:

```text
Revision 6 corpus        1,210
Revision 7 additions       100
-----------------------------
Current corpus           1,310
```

---

# 356. Revision 7 Ten-Pass Audit Record

| Pass | Focus | Gap | Correction |
|---:|---|---|---|
| 1 | Variant identity | A Template Version could materially change HOW while keeping the same Variant identity | Added immutable Variant Strategy Contract + material-drift classifier |
| 2 | Dependency semantics | Flat dependency list cannot represent alternatives/fallback paths | Added Dependency Expression Tree with ALL_OF / ANY_OF / ONE_OF / OPTIONAL |
| 3 | Certification | One certification badge overstates portability across OS/runtime/path | Added Certification Matrix by Environment Profile + Resolution Path |
| 4 | User choice / fallback | Selected Variant could silently switch to another method | Added Cross-Variant Fallback Consent Contract |
| 5 | Reviews | Rating lacked environment/version fidelity and stronger trust controls | Added review context, failure report, confidence and fraud integrity |
| 6 | Admin governance | Admin global editing could conflict with creator rights or critical-change controls | Added separation-of-duties, curated derivative and break-glass governance |
| 7 | Bulk factory | Generation results were hard to reproduce after environment/model drift | Added immutable Batch Reproducibility Manifest, locks, notifications and comparison |
| 8 | Lineage | Fork/merge/curation relationships were not modeled strongly enough | Added Template/Variant Lineage Graph and attribution rules |
| 9 | Economics/privacy | Cross-Variant method changes can materially change cost/egress | Added cost/egress consent and data-class compatibility |
| 10 | Operations | Certification can become stale and event storms can overload re-certification | Added TTL/risk freshness, event coalescing, prioritization and stale-state UX |

---

# 357. Variant Strategy Contract

Every Solution Variant SHALL have an explicit `VariantStrategyContract`.

Conceptual:

```yaml
variant_id: UC-0637-SV01
strategy_family: SMARTAIHUB_SKILLS_ONLY

allowed:
  computer_use: false
  external_agents: []
  locality: [CLOUD_ALLOWED, LOCAL_ALLOWED]

required_capability_classes:
  - product.review
  - storyboard
  - media.generate

material_side_effect_profile:
  - PUBLISH_OPTIONAL
```

The strategy contract defines the stable semantic identity of the Variant.

A Template Version may change implementation details only while remaining within this contract.

---

# 358. Material Strategy Drift Classifier

Before a candidate Template Version is attached/promoted under an existing Variant, Spec 212 SHALL classify the change:

```text
NON_MATERIAL
MATERIAL_WITHIN_CONTRACT
MATERIAL_OUTSIDE_CONTRACT
```

Examples:

```text
change prompt wording
→ NON_MATERIAL

replace one equivalent internal Skill implementation
→ MATERIAL_WITHIN_CONTRACT

add Computer Use to a Skills-only Variant
→ MATERIAL_OUTSIDE_CONTRACT

change Local-only to Cloud-required
→ MATERIAL_OUTSIDE_CONTRACT

replace Codex with Claude in a Codex-specific Variant
→ MATERIAL_OUTSIDE_CONTRACT
```

`MATERIAL_OUTSIDE_CONTRACT` SHALL create or map to another Solution Variant rather than overwrite the original Variant identity.

---

# 359. Strategy Contract Versioning

The contract itself may evolve only under explicit governance.

If a change alters the user-understood method materially, create a new Variant.

Minor contract metadata corrections may create:

```text
strategy_contract_revision
```

while preserving semantic identity.

All historical Template Versions retain the contract revision under which they were certified.

---

# 360. Dependency Expression Tree

A flat array is insufficient.

Dependencies SHALL support a normalized expression model:

```text
ALL_OF
ANY_OF
ONE_OF
OPTIONAL
```

Example:

```yaml
type: ALL_OF
items:
  - capability: video.edit
  - type: ONE_OF
    items:
      - capability: browser.webmcp
      - capability: spec208.computer_use
  - type: OPTIONAL
    item:
      capability: local.gpu
```

---

# 361. Dependency Resolution Path

A `DependencyResolutionPath` records which branch of the dependency expression was actually used.

Example:

```text
Path P1:
Video Edit Skill
+ WebMCP

Path P2:
Video Edit Skill
+ Computer Use
+ Runner
```

The same Solution Variant MAY support multiple equivalent dependency paths if they remain within its strategy contract.

---

# 362. Path Equivalence Rule

Alternative dependency paths may remain under one Variant only when:

```text
user-visible execution method remains materially equivalent
side-effect/approval semantics remain equivalent
privacy/locality contract remains compatible
quality/output contract remains equivalent
```

If an alternative path materially changes the user-understood method, it belongs to another Solution Variant.

---

# 363. Dependency Version Constraints

Each dependency requirement SHOULD support:

```text
exact version
compatible range
minimum version
schema hash/range
capability revision
```

Certification records the actual resolved versions.

A dependency update outside certified constraints invalidates or degrades affected certification cells.

---

# 364. Certification Is a Matrix

Certification SHALL NOT be represented only by:

```text
E2E_CERTIFIED = true
```

Canonical dimensions:

```text
Variant
× Template Version
× Environment Profile
× Dependency Resolution Path
× Policy Profile where material
```

Example:

| Variant | Environment | Path | Result |
|---|---|---|---|
| Skills-only | Cloud | MCP | E2E_CERTIFIED |
| Skills-only | Windows Runner | Native API | E2E_CERTIFIED |
| Computer Use | Windows 11 | Accessibility/Jev | E2E_CERTIFIED |
| Computer Use | macOS | AX | SANDBOX_CERTIFIED |
| Computer Use | Linux Wayland | AT-SPI | NOT_CERTIFIED |

---

# 365. Certification Cell

Conceptual:

```text
certification_cell_id
variant_id
template_version_id
environment_profile_id
dependency_path_id
policy_profile_id_optional
test_level
result
verified_success_rate
tested_at
expires_at
dependency_snapshot_hash
benchmark_build
evidence_refs
```

---

# 366. User-Facing Certification Projection

Normal users do not need to understand the full matrix.

For the current user/environment, compute:

```text
CERTIFIED_FOR_YOU
CERTIFIED_WITH_SETUP
PARTIALLY_CERTIFIED
NOT_YET_CERTIFIED
DEGRADED
```

UI MAY still offer an advanced matrix view.

---

# 367. Environment Profile Contract

Environment profiles SHOULD be versioned and include material execution characteristics:

```text
OS / OS version
Runner version
browser/runtime class
installed app/capability class
architecture where material
network/locality
GPU capability class where material
```

Avoid tying certification to one machine ID.

---

# 368. Certification Freshness / TTL

Certification freshness SHALL depend on risk and dependency volatility.

Examples:

```text
R0 stable deterministic Skill workflow
→ longer TTL

R3 Computer Use publish workflow
→ shorter TTL

browser automation after major browser upgrade
→ force/re-prioritize certification

provider schema changed
→ affected cells stale immediately
```

TTL values remain policy/configuration.

---

# 369. Stale Certification Semantics

States:

```text
FRESH
STALE_ALLOWED
STALE_WARNING
STALE_BLOCKED
RECERTIFYING
```

Policy determines whether a user can run with stale certification.

Never display stale certification as fresh.

---

# 370. Re-Certification Prioritization

Prioritize by:

```text
risk
real usage volume
critical organization pin
dependency change severity
current health
certification age
```

This prevents low-value cases from blocking high-impact recertification.

---

# 371. Re-Certification Event Coalescing

Multiple dependency events MAY affect the same Variant.

The scheduler SHALL coalesce compatible events into one re-certification plan.

Example:

```text
browser update
Runner adapter update
Computer Use driver update
within short window
→ one impacted certification sweep
```

Avoid event storms and duplicate provider cost.

---

# 372. Cross-Variant Fallback Contract

Fallback has two scopes:

```text
INTRA_VARIANT_FALLBACK
= alternate implementation/dependency path that stays inside strategy contract

CROSS_VARIANT_FALLBACK
= change to a materially different Solution Variant
```

These MUST be treated differently.

---

# 373. Intra-Variant Fallback

May occur automatically when:

```text
semantic outcome remains equivalent
privacy/locality stays within contract
approval requirements do not weaken
cost stays within configured envelope
user policy allows it
```

The actual dependency path is recorded.

---

# 374. Cross-Variant Fallback Consent

Cross-Variant fallback SHALL NOT be silent when it changes a material property such as:

```text
external agent
Computer Use
local vs cloud
data egress destination
cost band
required account
side-effect/approval profile
```

Possible policy:

```text
NEVER
ASK_USER
ALLOW_PREAPPROVED_VARIANTS
ALLOW_WITHIN_COST_AND_PRIVACY_ENVELOPE
```

---

# 375. Run-Time Variant Resolution

At run time:

```text
User-selected Variant
  ↓
current dependency readiness
  ↓
eligible path?
  ├ yes → execute
  └ no
      ↓
intra-Variant fallback?
      ├ yes → execute
      └ no
          ↓
cross-Variant fallback policy
```

The run records final Variant + path actually used.

---

# 376. Review Execution Context

Each verified review SHOULD retain privacy-safe context:

```text
variant_id
template_version_id
environment_profile_class
dependency_path_id
run outcome
created_at
```

This enables distinguishing:

```text
"Computer Use on Windows worked"
```

from:

```text
"same Variant on Linux was unreliable"
```

without publishing sensitive machine details.

---

# 377. Explicit Failure Feedback

In addition to:

```text
ใช้ได้เลย
ใช้งานได้
พอใช้
```

the UI SHALL provide:

```text
รายงานว่าใช้งานไม่ได้ / Report Problem
```

Failure reporting MAY ask for a structured reason:

```text
setup failed
dependency missing
workflow failed
wrong result
quality poor
too slow
too expensive
permission issue
other
```

This is not counted as a positive usability vote.

---

# 378. Rating Confidence

Ranking/display SHOULD account for sample size.

The UI MAY show:

```text
4.9 ★ — 3 reviews
```

but ranking SHOULD use a confidence-aware method rather than raw mean alone.

Verified-use feedback may carry more ranking signal than unverified feedback, while all legitimate reviews remain visible subject to moderation.

---

# 379. Review Anti-Abuse

Controls SHOULD include:

```text
rate limits
account-age/use-history signals where appropriate
duplicate-pattern detection
coordinated review-burst detection
creator self-promotion labeling/exclusion policy
verified-use weighting
moderation audit
```

Do not expose sensitive fraud heuristics publicly.

---

# 380. Review Migration / Variant Merge

When Variants merge/deprecate:

```text
historical review remains attached to original Variant
replacement relation is shown
```

Do not rewrite the original review as if the reviewer used the replacement Variant.

Aggregated comparison MAY show historical signals separately.

---

# 381. Admin Separation of Duties

For high-risk global changes, Marketplace policy MAY require:

```text
EDITOR
!=
APPROVER
```

especially for:

```text
R4 economic
deployment
delete
publish to external account
security-sensitive enterprise templates
```

The exact thresholds are configurable.

---

# 382. Community Template Admin Curation

Admin/platform curation SHALL respect creator ownership and license.

Preferred:

```text
Community Original
  ↓
Platform Curated Derivative
```

unless marketplace terms explicitly grant platform-maintained shared lineage.

The UI/provenance SHALL make the relationship clear.

---

# 383. Break-Glass Administration

Emergency actions MAY support a time-limited break-glass permission for:

```text
quarantine
rollback stable pointer
disable new installs
```

Requirements:

```text
reason required
short expiry
enhanced audit
notification
post-incident review
```

Break-glass does not permit bypassing immutable historical audit.

---

# 384. Global Template Change Notification

Material stable-version changes MAY notify:

```text
template maintainers
organization admins who pinned it
high-impact dependent template owners
```

Notification class depends on risk and dependency impact.

---

# 385. Bulk Reproducibility Manifest

Every bulk run SHALL pin or record:

```text
corpus version/hash
start/end IDs
strategy profiles
AI Builder version
builder prompt/template revision
model/provider selection policy
Capability Registry snapshot/hash
workflow schema/compiler revision
runtime registry snapshot
environment profile
policy revision
budget configuration
concurrency configuration
```

---

# 386. Per-Attempt Reproducibility

Every Variant generation attempt SHOULD store:

```text
input prompt hash
strategy profile
builder/model revision
environment/capability snapshot
generation parameters
result workflow hash
trace ID
```

If deterministic seed exists for the underlying model/tool, record it; otherwise explicitly mark `NON_DETERMINISTIC`.

---

# 387. Bulk Concurrency Lock

Prevent concurrent batch jobs from accidentally generating the same:

```text
use_case_id
+ strategy fingerprint
+ generation target
```

Use lease/fencing/idempotency based on canonical durable job infrastructure.

---

# 388. Bulk Completion Notification

Admin can configure notification on:

```text
completed
completed_with_failures
paused_budget
paused_critical
failed_systemically
```

Summary SHOULD include:

```text
cases processed
variants certified
failed/not applicable
top error codes
top gap owners
budget used
links to affected IDs
```

---

# 389. Bulk Differential Replay

After a platform fix:

```text
select previous failure cohort
→ replay with new build
→ compare status
```

Report:

```text
fixed
still failing same cause
failing new cause
regressed
```

This directly measures whether product gaps were actually closed.

---

# 390. Canonical Template / Variant Lineage Graph

Lineage edges MAY include:

```text
GENERATED_FROM_USE_CASE
VERSION_OF
FORKED_FROM
CURATED_FROM
IMPROVEMENT_FROM
COMPOSED_FROM
REPLACED_BY
MERGED_INTO
```

Cycles forbidden except explicitly modeled non-ancestry relations.

---

# 391. Lineage Attribution

When community/user work contributes to a curated Variant, provenance SHOULD retain:

```text
source creator
source Variant/version
contribution relationship
license/attribution obligation
```

Economic attribution, if applicable, is decided by the economic plane.

---

# 392. Variant Merge Semantics

Merging duplicate Variants SHALL:

```text
choose canonical Variant
preserve original identities/history
mark merged Variant as MERGED
retain reviews/runs on original
provide redirect/replacement link
```

Do not rewrite historical usage.

---

# 393. Variant Retirement Without Data Loss

A creator may unlist/deprecate a Variant while:

```text
historical runs remain
existing user forks remain
reviews remain for audit/history
```

new installs depend on lifecycle/policy state.

---

# 394. Pricing Snapshot

Cost estimate SHALL include:

```text
estimate amount/range
currency/credits
pricing data timestamp
provider/model version where material
uncertainty
```

A stale estimate must be revalidated before material economic commitment.

---

# 395. Cross-Variant Cost Consent

If fallback changes expected cost beyond configured threshold:

```text
re-estimate
→ user/admin budget policy
→ approval if required
```

No silent move from low-cost Skills-only to expensive external-agent/media Variant.

---

# 396. Data Classification Compatibility

Variant/input preflight SHOULD compare:

```text
data classification
privacy/locality profile
external egress
provider eligibility
```

Example:

```text
CONFIDENTIAL
+
CLOUD_REQUIRED Variant prohibited by organization
→ POLICY_BLOCKED
```

---

# 397. Egress Consent Snapshot

When policy requires user-level consent, record:

```text
Variant
destination class
data class
consent revision
timestamp
material parameters
```

Material destination changes invalidate old consent.

---

# 398. Certification/Readiness Service Degradation

If certification/readiness service is unavailable:

```text
Marketplace catalog may remain browseable
```

but UI MUST NOT falsely claim live readiness.

Use states such as:

```text
สถานะชั่วคราวไม่พร้อมตรวจสอบ
```

High-risk Use action may be blocked according to policy.

---

# 399. Operations Backlog Dashboard

Track independent queues:

```text
workflow generation
certification
re-certification
search indexing
review moderation
incident remediation
dependency reconciliation
bulk generation
```

A healthy search UI must not mask a growing certification backlog.

---

# 400. Current Canonical Corpus — Revision 7

Files:

```text
spec-212-use-cases-1310.json
spec-212-marketplace-catalog-1310.json
```

Integrity:

```text
1,310 prompt strings
1,310 unique prompts
1,310 catalog IDs
UC-0001…UC-1210 unchanged
UC-1211…UC-1310 appended
```

The prompt-only file remains the canonical loop-test input.

---

# 401. Revision 7 Acceptance Criteria — Strategy / Dependencies

- [ ] Every Variant has a Strategy Contract.
- [ ] Material drift is classified before promotion.
- [ ] Out-of-contract candidate becomes another Variant.
- [ ] Dependency expressions support ALL_OF / ANY_OF / ONE_OF / OPTIONAL.
- [ ] Actual Dependency Resolution Path is recorded.
- [ ] Alternative path cannot weaken privacy/approval semantics silently.
- [ ] Dependency version/schema constraints are represented.
- [ ] Strategy fingerprint and contract checks prevent Variant fragmentation.

---

# 402. Revision 7 Acceptance Criteria — Certification Matrix

- [ ] Certification is stored by Variant + Version + Environment + Path.
- [ ] User-facing badge projects only relevant certification cells.
- [ ] OS/Runner/browser profiles are versioned.
- [ ] Fresh/stale/recertifying state is visible.
- [ ] Dependency drift invalidates only affected cells.
- [ ] Risk/usage can prioritize re-certification.
- [ ] Event coalescing prevents duplicate re-certification storms.
- [ ] High-risk stale certification obeys explicit policy.

---

# 403. Revision 7 Acceptance Criteria — Choice / Reviews

- [ ] User-selected Variant is preserved.
- [ ] Intra-Variant vs Cross-Variant fallback are distinct.
- [ ] Material Cross-Variant fallback requires configured consent.
- [ ] Final executed Variant/path is recorded.
- [ ] Review stores Variant/version/environment class.
- [ ] `Report Problem` exists separately from positive usability votes.
- [ ] Rating ranking is confidence-aware.
- [ ] Review anti-abuse controls exist.
- [ ] Variant merge does not falsify review history.

---

# 404. Revision 7 Acceptance Criteria — Admin / Bulk / Lineage

- [ ] Critical global changes can require separation of duties.
- [ ] Community curation preserves ownership/license/provenance.
- [ ] Break-glass actions are time-limited/audited.
- [ ] Bulk run has immutable reproducibility manifest.
- [ ] Duplicate batch generation is fenced/idempotent.
- [ ] Admin receives terminal batch notifications.
- [ ] Previous failure cohorts can be replayed differentially.
- [ ] Lineage graph records generated/forked/curated/composed/replaced relations.
- [ ] Variant retirement preserves historical data.

---

# 405. Revision 7 Acceptance Criteria — Economics / Operations

- [ ] Cost estimates have pricing snapshot + uncertainty.
- [ ] Material cost-changing fallback triggers budget/consent policy.
- [ ] Data classification is checked against Variant locality/egress.
- [ ] Material egress change invalidates prior consent when required.
- [ ] Marketplace does not present stale readiness as current.
- [ ] Operations dashboard exposes generation/certification/index/moderation backlogs separately.
- [ ] Current corpus 1,310 passes integrity validation.

---

# 406. Revision 7 Definition of Done

Revision 7 is complete when:

```text
Use Case
  ↓
materially distinct Solution Variants
  ↓
immutable Strategy Contract per Variant
  ↓
Template Versions within that contract
  ↓
Dependency Expression + Resolution Path
  ↓
Certification Matrix by environment/path
  ↓
per-user readiness / explicit method choice
  ↓
governed fallback
  ↓
real run
  ↓
version/path-aware review and telemetry
```

and when Admin can mass-generate/replay these strategies reproducibly without compromising creator rights, security, economics or historical lineage.

---

# 407. Revision 7 Product Principle

> **The Marketplace must distinguish the user's goal, the chosen method, the revision of that method, the concrete dependency path used in the user's environment, and the evidence that this exact combination has been certified. A green badge without that context is not product-grade evidence.**


---

# 408. Revision 8 — Dynamic Variant Synthesis / Bring Your Own Capabilities (BYOC)

Revision 8 addresses a core Marketplace reality:

> Prepared Solution Variants can never cover every combination of agents, models, Skills, runtimes, devices and policies that real users possess.

Example:

```text
Prepared Variant A
  Codex + SmartAIHub Skills + Computer Use

Prepared Variant B
  Claude + SmartAIHub Skills + Computer Use
```

A user may ask:

```text
"ไม่ใช้ Codex หรือ Claude ได้ไหม?"
```

or:

```text
"ผมมี Antigravity + Gemini + SmartAIHub อยู่แล้ว ใช้ของที่ผมมีได้ไหม?"
```

Spec 212 SHALL answer this by capability reasoning rather than by requiring every provider combination to be pre-generated.

Revision 8 adds:

```text
User Capability Profile
Logical Requirement Manifest
Capability Substitution Graph
Constraint-Based Variant Builder
Dynamic Variant Synthesizer
Personal Dynamic Variants
Demand-Driven Promotion
AUTO_DISCOVER_VARIANTS
```

---

# 409. Core Revision 8 Architecture

```text
                         Use Case
                            │
               Logical Requirement Manifest
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
Known Certified Variants               User Constraints
        │                         "ไม่ใช้ Codex/Claude"
        │                         "ใช้ Local only"
        │                         "มี Antigravity"
        │                         "ไม่เอา Computer Use"
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
                  User Capability Profile
                            │
                            ▼
              Capability Substitution Resolver
                            │
                 Existing exact Variant?
                  ┌─────────┴─────────┐
                 YES                  NO
                  │                   │
                  ▼                   ▼
           Reuse Variant       Dynamic Variant Synthesizer
                                      │
                              Strategy de-duplication
                                      │
                                 Compile/Resolve
                                      │
                               Sandbox/Certification
                                      │
                           Personal Dynamic Variant
                                      │
                         Use / Save / Submit Improvement
```

---

# 410. Principle — Requirement First, Provider Second

Use Case and Workflow intent SHALL describe WHAT capability is required.

Bad requirement:

```yaml
required:
  codex: true
  claude: true
```

Preferred:

```yaml
required_capabilities:
  - code.repository.read
  - code.repository.write
  - shell.execute
  - browser.verify
  - smartaihub.skill.video_edit
```

Codex, Claude, Antigravity, SmartAIHub native agents or future agents are candidate implementations.

Provider identity becomes required only when the user explicitly asks for that provider or the intended behavior materially depends on it.

---

# 411. Logical Requirement Manifest

Every Use Case SHOULD be able to compile into a provider-neutral `RequirementManifest`.

Conceptual:

```yaml
use_case_id: UC-0427

capabilities:
  required:
    - code.repository.read
    - code.repository.write
    - code.test.execute
    - browser.verify
  optional:
    - code.review.external
  quality_enhancing:
    - multi_agent.review

constraints:
  locality: ANY
  privacy: STANDARD
  budget: null
  max_latency: null

effects:
  - CODE_CHANGE

verification:
  - tests_pass
  - ui_smoke_test
```

---

# 412. Requirement Manifest Validation

The manifest SHALL be validated against the original natural-language use case.

The validator checks:

```text
missing required outcome
invented material requirement
incorrect side-effect class
missing approval
missing verification
incorrect locality
unsupported assumption
```

A dynamic Variant cannot be trusted if its requirement abstraction is wrong.

---

# 413. Required vs Optional vs Quality-Enhancing Capabilities

Classify:

```text
REQUIRED
= no valid solution without it

OPTIONAL
= useful path but workflow can still satisfy outcome

QUALITY_ENHANCING
= improves quality/reliability but not logical feasibility
```

This is essential for answering:

> "ทำได้ไหมถ้าไม่มี Claude?"

The system can determine whether Claude supplied a REQUIRED logical capability or only one implementation of it.

---

# 414. User Capability Profile

Spec 212 SHALL maintain a privacy-safe inventory of capabilities currently available to the user/workspace.

Conceptual categories:

```text
SmartAIHub Skills
SmartAIHub Workflows/Subflows
Internal Agents
External Agents / Harnesses
Models
MCP Connections
A2A Agents
Runner capabilities
Browser capabilities
Local software
Local AI models
ComfyUI
Library / R2 / Vector
Cloud services
```

The profile stores capability availability, not plaintext secrets.

---

# 415. Capability Profile Sources

The profile MAY aggregate:

```text
Capability Registry
connected Plugins
Spec 199 MCP registry
Spec 200 External Agent Gateway
Spec 206 A2A
Spec 211 ACP/runtime registrations
Feature 197 Runner probes
Spec 208 browser/desktop probes
Media provider registry
Local AI / Worker registrations
user/workspace entitlement
policy engine
```

Spec 212 SHALL reuse canonical registries rather than create independent truth.

---

# 416. Capability Availability State

Per capability:

```text
AVAILABLE
AVAILABLE_WITH_SETUP
UNHEALTHY
OFFLINE
NOT_INSTALLED
NOT_CONNECTED
NOT_ENTITLED
POLICY_BLOCKED
UNKNOWN
```

Availability is timestamped and may expire.

---

# 417. CapabilityDescriptor

Every implementation candidate SHOULD expose a normalized descriptor.

Conceptual:

```yaml
capability_id: code.repository.modify

implementation_id: antigravity-agent
implementation_type: EXTERNAL_AGENT

supports:
  repository_read: true
  repository_write: true
  shell: true
  web_browse: true

execution:
  locality: REMOTE_SANDBOX

requires:
  connection: google_agent
  secrets: [provider_credential_ref]

limits:
  local_user_files: false
  existing_authenticated_browser: false
```

The exact fields are extensible/versioned.

---

# 418. Agent, Model, Runtime and Execution Target Are Separate Dimensions

Do NOT collapse:

```text
Agent/Harness
Model
Runtime
Protocol
Execution Target
```

Example conceptual decomposition:

```text
Agent/Harness: Antigravity
Model: Gemini family
Runtime: managed remote sandbox
Protocol/API: provider interaction API
Execution Target: provider-hosted Linux sandbox
```

Another:

```text
Agent/Harness: SmartAIHub Native Agent
Model: Gemini family
Runtime: SmartAIHub agent runtime
Execution Target: Server Runner
```

These may satisfy similar logical capabilities through different paths.

---

# 419. Model Alone Is Not Automatically an Agent

A model capability descriptor does not imply:

```text
filesystem
workspace
repository
session
tool loop
retry
streaming
resume
browser
shell
```

Those may be supplied by an agent/runtime/harness.

Dynamic Variant Synthesis SHALL compose the complete stack required by the Requirement Manifest.

---

# 420. Remote Sandbox vs User Local State

A remote agent that can browse the web does NOT automatically satisfy:

```text
existing authenticated user browser
local Windows desktop
local application
local project files
local GPU
private LAN service
```

These require explicit capabilities/execution targets such as Spec 208 + Runner.

This distinction prevents invalid substitution.

---

# 421. Capability Substitution Graph

Spec 212/Shared Capability Registry SHALL support logical substitution candidates.

Example:

```text
code.repository.modify
  ├ Codex
  ├ Claude coding harness
  ├ Antigravity
  ├ SmartAIHub Native Coding Agent
  ├ A2A coding agent
  └ future adapter
```

Another:

```text
browser.verify
  ├ provider-native browser
  ├ WebMCP
  ├ Playwright/CDP
  ├ Spec 208 Computer Use
  └ Human takeover
```

Edges indicate candidate compatibility, not automatic equivalence.

---

# 422. Substitution Compatibility Dimensions

Before accepting a substitute, compare:

```text
required logical capability
input/output schema
modalities
tool permissions
side-effect semantics
verification capability
locality
privacy/egress
latency constraints
cost envelope
quality requirement
availability/health
certification
```

Functional similarity alone is insufficient.

---

# 423. Equivalence Classes

The Registry MAY define:

```text
FULL_EQUIVALENT
CONDITIONALLY_EQUIVALENT
PARTIAL
NOT_EQUIVALENT
```

Example:

```text
remote web browse
vs
user existing authenticated browser
→ PARTIAL / NOT_EQUIVALENT for account-specific tasks
```

The Resolver SHALL explain material incompatibility.

---

# 424. User Constraint Language

The Marketplace SHALL accept natural-language constraints such as:

```text
ไม่เอา Codex
ไม่ใช้ Claude
ใช้ Antigravity ถ้าได้
ใช้ Gemini ที่ผมมี
SmartAIHub only
ห้าม Computer Use
Local only
ห้ามส่งข้อมูลออกจากเครื่อง
ไม่ต้อง Runner
เน้นราคาถูก
เน้นคุณภาพ
ใช้เฉพาะของที่ฉันเชื่อมต่อไว้แล้ว
```

AI converts them into structured `VariantConstraints`.

---

# 425. VariantConstraints

Conceptual:

```yaml
forbidden:
  implementations:
    - codex
    - claude

preferred:
  implementations:
    - antigravity

allowed:
  computer_use: true
  external_agents: true

locality:
  mode: LOCAL_PREFERRED

privacy:
  external_egress: ASK

optimization:
  objective:
    - FEASIBILITY
    - PRIVACY
    - COST
```

Hard constraints and soft preferences MUST be distinguishable.

---

# 426. Hard Constraint vs Preference

Hard constraint:

```text
"ห้ามส่งข้อมูลออก cloud"
```

cannot be violated to make a workflow succeed.

Preference:

```text
"ถ้าได้อยากใช้ local"
```

may fall back according to configured user policy.

UI SHOULD make the distinction understandable.

---

# 427. Custom Strategy Resolver

Input:

```text
Requirement Manifest
+
VariantConstraints
+
User Capability Profile
+
Policy
+
Budget
```

Output:

```text
feasible strategy candidates
rejected strategies with reasons
missing capabilities
setup requirements
```

This happens before graph generation when practical.

---

# 428. Feasibility Before Generation

Do not spend model tokens generating a complete workflow for an obviously impossible strategy.

Preferred:

```text
requirements
→ capability feasibility
→ candidate strategy
→ workflow generation
```

If impossible:

```text
NO_FEASIBLE_STRATEGY
```

with precise missing requirements.

---

# 429. Dynamic Variant Synthesizer

When no prepared Variant sufficiently matches:

```text
Custom Strategy Resolver
  ↓
candidate strategy
  ↓
AI Workflow Studio Spec 209
  ↓
Workflow Definition
  ↓
strategy fingerprint
  ↓
compile/resolve
  ↓
validation/certification
```

Result is a Dynamic Variant.

---

# 430. Existing Variant First

Before synthesizing:

```text
search prepared/public/private Variants
```

Reuse an existing eligible strategy when semantic/constraint fit is high.

Dynamic synthesis is not an excuse to regenerate identical logic unnecessarily.

---

# 431. Personal Dynamic Variant

Default visibility for a user-specific generated method:

```text
PERSONAL_DYNAMIC
```

Characteristics:

```text
owned by user
not public
may reference user's environment
may be environment-certified only
editable by user
does not affect global stable Variant
```

---

# 432. Workspace Dynamic Variant

User/admin MAY promote a Personal Dynamic Variant to:

```text
WORKSPACE_DYNAMIC
```

after sanitization/policy checks.

This remains scoped to the workspace unless separately submitted for platform publication.

---

# 433. Save My Method

Marketplace SHALL expose:

```text
บันทึกวิธีนี้ไว้ใช้ครั้งหน้า
```

which records:

```text
source use case
strategy contract
constraints
dependency resolution
workflow version
environment profile
```

without converting it into a public template.

---

# 434. Personal Variant Editing

The owner can edit their Personal Dynamic Variant/workflow.

If editing materially changes strategy:

```text
create new personal Variant lineage
```

rather than falsifying the original strategy history.

---

# 435. Dynamic Variant Environment Certification

A Personal Variant may initially certify only:

```text
this user's environment profile
+ this dependency path
```

It MUST NOT receive a broad Marketplace E2E badge based solely on one user's environment.

---

# 436. Private Feedback on Personal Variants

The owner MAY record:

```text
worked
quality
notes
```

for personal history.

These private signals do NOT become public Marketplace reviews unless the method is promoted and the user explicitly submits review/feedback under applicable policy.

---

# 437. Demand Signal Aggregation

Spec 212 MAY aggregate privacy-safe strategy fingerprints:

```text
many users independently request:
No Codex
No Claude
Antigravity + SmartAIHub
```

This can reveal demand for a new public Variant.

Do not aggregate raw secrets or private workflow inputs.

---

# 438. Promotion Candidate From Dynamic Demand

Flow:

```text
Personal Dynamic Variants
  ↓
privacy-safe strategy cluster
  ↓
demand threshold / Admin interest
  ↓
generic sanitized candidate
  ↓
benchmark
  ↓
multi-environment certification
  ↓
Admin review
  ↓
Public Solution Variant
```

---

# 439. No Automatic Public Promotion

High usage alone SHALL NOT publish a dynamic method.

Public promotion still requires:

```text
sanitization
license/rights
security
dependency portability
strategy contract
certification
Admin/curator governance
```

---

# 440. User Question — "Can I Do This Without X?"

Marketplace/detail/Assistant SHALL support direct queries:

```text
ทำโดยไม่ใช้ Codex ได้ไหม?
ไม่ใช้ Claude ได้ไหม?
ไม่ใช้ Computer Use ได้ไหม?
ไม่ใช้ Runner ได้ไหม?
ใช้ Local AI แทนได้ไหม?
```

Response SHALL be computed from requirements/capabilities, not from static FAQ text.

---

# 441. User Question — "Can I Use What I Have?"

Support:

```text
ผมมี Antigravity กับ Gemini อยู่แล้ว ทำได้ไหม?
ผมมีแค่ SmartAIHub Skills
ผมมี Windows Runner แต่ไม่มี cloud provider
ผมมี ComfyUI ในเครื่อง
```

The system SHALL:

```text
detect/confirm relevant capabilities
evaluate feasibility
show missing pieces
offer to synthesize a method
```

---

# 442. Missing Capability Explanation

If no feasible method exists, answer structurally:

```text
สิ่งที่โจทย์ต้องการ:
✓ research
✓ generate report
✕ repository write

เครื่องมือที่คุณมี:
✓ Antigravity research
✓ SmartAIHub report skill
✕ ไม่มี capability ที่แก้ repository ใน environment ที่ policy อนุญาต
```

Then present eligible setup alternatives if available.

Do not fabricate a workflow.

---

# 443. Minimal Setup Suggestion

When several feasible ways require setup, the system MAY show:

```text
วิธีที่ตั้งค่าน้อยที่สุด
```

or other explicit criteria.

It SHALL not silently choose a materially different privacy/cost method.

---

# 444. Dynamic Variant Comparison

Generated candidates MAY be shown alongside prepared Variants:

```text
Prepared: Codex Hybrid
Prepared: Claude Hybrid
Prepared: Skills-only
Personal: Antigravity + SmartAIHub
```

Comparison uses the same dependency/readiness/certification/review model.

---

# 445. Dynamic Variant Strategy Fingerprint

Fingerprint SHALL normalize away irrelevant implementation details.

It SHOULD include:

```text
logical capability graph
agent/harness class
Computer Use requirement
locality
external-egress class
major runtime class
approval/side-effect profile
```

It SHOULD NOT fragment solely on model patch version.

---

# 446. Model Version Change

If:

```text
same agent/harness
same logical capabilities
same strategy contract
```

but model revision changes, normally create:

```text
new certification/dependency snapshot
```

or Template Version/config revision, not a new Solution Variant.

---

# 447. Agent/Harness Change

Changing from:

```text
Codex-specific strategy
→ Antigravity-specific strategy
```

is normally a new Solution Variant because user dependency/setup/runtime differs materially.

Changing from one certified compatible model under the same harness may remain the same Variant if strategy contract permits it.

---

# 448. Generic External Agent Strategy

A Variant MAY intentionally use:

```text
EXTERNAL_AGENT_CAPABILITY_CLASS
```

rather than one provider.

Example:

```text
"Any certified coding agent with repo write + shell + structured output"
```

At runtime the Resolver chooses an eligible implementation.

This is distinct from:

```text
CODEX_SPECIFIC
CLAUDE_SPECIFIC
ANTIGRAVITY_SPECIFIC
```

Variants.

---

# 449. Generic Strategy Certification

Generic external-agent Variants require certification per implementation/path matrix.

A generic Variant is not certified for an agent merely because the agent claims matching capabilities.

---

# 450. User-Provided Model via SmartAIHub Runtime

If the user has a model but no agent harness, SmartAIHub MAY satisfy agent-loop requirements through:

```text
SmartAIHub Native Agent Runtime
+
user-selected model
+
governed tools/Skills
```

only if the model/runtime combination passes required capability and certification tests.

---

# 451. Runtime Adapter Registration

Adding a future external agent SHOULD require:

```text
runtime/agent adapter
CapabilityDescriptor
health probe
auth/connection model
stream/cancel/resume behavior
tool/Skill bridge
usage/cost reporting
certification tests
```

It SHOULD NOT require editing 1,410 use-case definitions.

---

# 452. Capability Discovery on Registration

When a new adapter is registered:

```text
Capability Registry changes
  ↓
affected Requirement Manifests queried
  ↓
new possible substitutions/strategies discovered
  ↓
Admin candidate opportunities
```

Do not automatically create thousands of Variants without demand/policy.

---

# 453. Dynamic Resolver and Spec 200/206/211

Routing ownership remains:

```text
Spec 212
  decides desired strategy/capability composition

Shared Runtime Resolver / Spec 209
  resolves logical runtime needs

Spec 200
  external agent gateway

Spec 206
  A2A path

Spec 211
  ACP/runtime fabric where applicable

Spec 208
  browser/desktop Computer Use

Feature 197
  Runner execution target
```

Spec 212 SHALL NOT implement a parallel external-agent runtime.

---

# 454. Dynamic Resolver and Spec 208

If a user says:

```text
"ไม่เอา Computer Use"
```

the Requirement/Strategy Resolver SHALL attempt:

```text
API
MCP
A2A
WebMCP
structured browser
```

but must fail clearly if the remaining gap genuinely requires interactive UI.

It SHALL NOT relabel an interactive action as a Skill merely to satisfy the constraint.

---

# 455. Authenticated Browser Constraint

Requirement vocabulary SHALL distinguish:

```text
WEB_ACCESS
PUBLIC_BROWSER
MANAGED_BROWSER
EXISTING_AUTHENTICATED_BROWSER
LOCAL_DESKTOP
```

This avoids invalid substitution from remote browsing to user-authenticated local state.

---

# 456. Local File / Repo Constraint

Similarly distinguish:

```text
REMOTE_SANDBOX_FILES
WORKSPACE_REPOSITORY
USER_LOCAL_FILES
SERVER_REPOSITORY
LIBRARY_ASSETS
```

Capability substitution cannot cross these scopes without an authorized data-transfer step.

---

# 457. Cost / Privacy-Aware Synthesis

Dynamic strategies SHALL consider:

```text
hard constraints first
feasibility second
safety/policy
user preferences
cost
latency
quality
setup burden
```

The system may present trade-offs but the user chooses among materially different eligible methods.

---

# 458. Dynamic Variant Plan Preview

Before generation/execution, show:

```text
Method
Dependencies
What will run locally
What will run remotely
External destinations
Computer Use requirement
Estimated setup
Estimated cost band
Approval points
Known certification
```

This makes BYOC understandable.

---

# 459. Dynamic Generation Confirmation

If dynamic synthesis introduces material setup/egress/cost not obvious from the user request, request confirmation before generating or before executing according to policy.

Generation of a harmless draft may need less confirmation than actual execution.

---

# 460. Dynamic Variant Idempotency

Repeated identical requests:

```text
same use_case
same constraints
same normalized user capability profile class
same strategy fingerprint
```

SHOULD reuse an existing personal candidate/version when safe instead of generating duplicates.

---

# 461. Dynamic Variant Cache Boundary

Never cache across users if the generated method contains:

```text
user-specific resource IDs
private account selection
private Library scopes
specific Runner IDs
secret references
```

Only sanitized generic strategy components may be shared.

---

# 462. AUTO_DISCOVER_VARIANTS

Admin Bulk Factory SHALL add mode:

```text
AUTO_DISCOVER_VARIANTS
```

Instead of hard-coding provider strategies, it asks the current Capability Registry to discover materially distinct feasible strategy families.

---

# 463. AUTO_DISCOVER_VARIANTS Input

Example:

```yaml
range:
  start: UC-0001
  end: UC-1310

mode: AUTO_DISCOVER_VARIANTS

max_variants_per_use_case: 5

diversity_objectives:
  - SMARTAIHUB_NATIVE
  - NO_COMPUTER_USE
  - LOCAL_ONLY
  - EXTERNAL_AGENT
  - LOW_SETUP
```

---

# 464. Strategy Diversity Objective

Admin can request diverse methods rather than every combination.

Examples:

```text
one SmartAIHub-native path
one external-agent path
one local/private path
one Computer Use path when necessary
one low-cost path
```

The generator may return fewer if strategies are not meaningfully distinct.

---

# 465. Dynamic Discovery Result

Per Use Case:

```text
Prepared Variants
New candidate strategies
Rejected duplicate strategies
Infeasible strategies
Missing capability classes
```

This makes bulk generation useful for roadmap discovery.

---

# 466. Discovery Anti-Explosion

Do NOT compute the Cartesian product of:

```text
agents × models × runtimes × browsers × providers
```

Strategy enumeration MUST prune by:

```text
Requirement Manifest
policy
strategy equivalence
dominance
capability fit
user/admin diversity objective
configured max variants
```

---

# 467. Dominated Strategy Pruning

A strategy MAY be pruned when another strategy provides:

```text
same required capabilities
same privacy/locality class
same side-effect semantics
same or better certification
lower/equal setup burden
```

unless Admin explicitly requests the alternative for comparison.

---

# 468. Dynamic Gap Discovery

A failed custom request becomes structured evidence.

Example:

```text
"No Codex/Claude"
→ no code.modify substitute available
→ GAP_CAPABILITY_SUBSTITUTION
```

Aggregate missing logical capabilities for roadmap planning.

---

# 469. New Gap Taxonomy

Add:

```text
GAP_REQUIREMENT_MANIFEST
GAP_USER_CAPABILITY_DISCOVERY
GAP_CAPABILITY_SUBSTITUTION
GAP_DYNAMIC_VARIANT_SYNTHESIS
GAP_PERSONAL_VARIANT
GAP_AGENT_MODEL_RUNTIME_MAPPING
GAP_CUSTOM_CONSTRAINT_RESOLUTION
GAP_DYNAMIC_CERTIFICATION
```

---

# 470. Dynamic Variant Security

User-owned external agents/models SHALL NOT receive ambient SmartAIHub privileges.

Access occurs through:

```text
Capability Grants
MCP gateway
A2A gateway
External Agent Gateway
scoped Library/asset references
approved tool calls
```

Dynamic synthesis cannot enlarge privilege beyond user/workspace policy.

---

# 471. Dynamic Variant Secret Handling

Capability Profile records:

```text
connection exists
scope/status
```

not:

```text
raw API key
password
cookie
```

The synthesizer receives opaque secret references only when execution needs them.

---

# 472. Dynamic Variant Review Boundary

Public Marketplace review belongs to public/workspace published Variants.

Personal methods may collect private feedback but SHALL NOT inflate public reviews/popularity before promotion.

---

# 473. Dynamic Variant Usage Accounting

Track separately:

```text
prepared public Variant usage
workspace Variant usage
personal dynamic usage
benchmark/admin usage
```

This prevents demand analytics from being polluted.

---

# 474. Dynamic Variant Lineage

Lineage MAY include:

```text
SYNTHESIZED_FROM_USE_CASE
DERIVED_FROM_VARIANT
SUBSTITUTED_FROM_STRATEGY
PROMOTED_FROM_PERSONAL
PROMOTED_FROM_WORKSPACE
```

The path from user question to eventual public Variant remains auditable.

---

# 475. "Can I Use My Tools?" UX

Every Use Case detail SHOULD provide:

```text
[ดูวิธีที่มี]
[สร้างวิธีจากเครื่องมือของฉัน]
```

Optional conversational entry:

```text
"ผมไม่มี Codex มี Antigravity ใช้แทนได้ไหม?"
```

The response can directly invoke the Custom Strategy Resolver.

---

# 476. Capability Profile UX

Show only useful capability groups:

```text
Agents
Models
Runner
Browser
Local AI
SmartAIHub Skills
Connections
Local Apps
```

Normal users do not need raw adapter IDs or schema hashes.

Advanced mode may expose them.

---

# 477. Dynamic Method Result UX

Example:

```text
พบวิธีที่ใช้ของที่คุณมี

Antigravity + SmartAIHub Skills + Browser Verification

✓ Agent capability
✓ SmartAIHub Skills
✓ Browser route
! Local Runner not required

Privacy:
Remote agent will receive scoped repository context

Certification:
Sandbox passed for this environment profile

[Generate & Test]
```

---

# 478. No Feasible Method UX

Example:

```text
ยังสร้างวิธีที่ทำงานครบตามโจทย์ไม่ได้

ขาด:
repository.write ใน environment ที่ policy อนุญาต

ตัวเลือก:
- เชื่อมต่อ coding agent ที่รองรับ
- เปิดใช้ SmartAIHub coding capability
- เปลี่ยน constraint หากคุณต้องการ
```

Do not create a misleading "partial working" Template unless explicitly labeled.

---

# 479. Prepared Variant vs Dynamic Variant Ranking

Prepared certified Variant generally has stronger portability evidence.

Dynamic Variant may be preferable because:

```text
matches user's installed tools
meets local-only requirement
requires less setup
```

Marketplace SHALL present material evidence; it should not automatically suppress dynamic options.

---

# 480. Revision 8 API Additions

Suggested:

```text
GET  /workflow-marketplace/use-cases/:id/requirements
GET  /workflow-marketplace/me/capabilities

POST /workflow-marketplace/use-cases/:id/resolve-custom-strategy
POST /workflow-marketplace/use-cases/:id/synthesize-variant

GET  /workflow-marketplace/personal-variants
GET  /workflow-marketplace/personal-variants/:id
PATCH /workflow-marketplace/personal-variants/:id
DELETE /workflow-marketplace/personal-variants/:id
POST /workflow-marketplace/personal-variants/:id/submit

POST /admin/workflow-marketplace/auto-discover-variants
```

Actual routes may follow repository conventions.

---

# 481. Requirement Resolver API

Conceptual request:

```json
{
  "use_case_id": "UC-0427",
  "constraints": {
    "forbidden_implementations": ["codex", "claude"],
    "preferred_implementations": ["antigravity"],
    "computer_use": "allowed",
    "locality": "local_preferred"
  }
}
```

Response:

```json
{
  "requirements": [],
  "existing_variants": [],
  "candidate_strategies": [],
  "missing_capabilities": [],
  "clarifications_required": []
}
```

---

# 482. Clarification Policy

Dynamic synthesis SHOULD avoid unnecessary questions.

Ask only when ambiguity materially changes:

```text
data destination
locality/privacy
side effect
required account
cost approval
quality/output contract
```

Otherwise prefer a safe configurable input/default and continue.

---

# 483. Suggested Persistence Additions

Conceptually:

```text
workflow_use_case_requirements
user_capability_profiles
capability_profile_snapshots
capability_substitution_edges
workflow_personal_variants
workflow_dynamic_variant_attempts
workflow_variant_constraints
workflow_dynamic_strategy_clusters
```

Canonical workflows/versions/runs remain in Spec 209 storage.

---

# 484. User Capability Profile Snapshot

Every synthesis attempt SHOULD reference an immutable snapshot:

```text
profile_snapshot_id
user/workspace scope
capability states
registry revision
runner inventory revision
connection inventory revision
policy revision
created_at
```

This allows replay/debugging.

---

# 485. Dynamic Synthesis Attempt

Record:

```text
attempt_id
use_case_id
requirement_manifest_revision
constraint_snapshot
capability_profile_snapshot
candidate strategy
strategy fingerprint
workflow version
validation result
certification cell
failure/gap
```

---

# 486. Dynamic Variant Benchmarking

Spec 212 benchmark SHALL include scenarios where:

```text
prepared providers are forbidden
one expected runtime is unavailable
new agent is introduced
local-only constraint added
Computer Use disabled
Runner unavailable
```

The test passes only when the Resolver either finds a valid alternative or explains impossibility correctly.

---

# 487. Dynamic Resolver Negative Test

Example:

```text
user forbids:
Cloud
Computer Use
External Agents

requirement:
existing authenticated SaaS UI with no API/WebMCP
```

Correct result:

```text
NO_FEASIBLE_STRATEGY
```

not an invented Skills-only workflow.

---

# 488. Dynamic Resolver Mutation Tests

Mutate capability profile:

```text
remove Codex
add Antigravity
disable Runner
add Local AI
revoke MCP
enable WebMCP
```

Expected strategy set should change predictably.

---

# 489. Dynamic Resolver Differential Testing

Compare:

```text
old Capability Registry
new Capability Registry
```

for same use-case/constraints.

The system SHOULD explain newly feasible/removed strategies.

---

# 490. Dynamic Variant Certification Matrix

Dynamic Variant certification follows Revision 7 matrix:

```text
Variant
× Template Version
× Environment Profile
× Dependency Resolution Path
```

Personal Variant usually has narrower coverage.

---

# 491. Dynamic Variant Cost Controls

Synthesis SHALL respect:

```text
generation budget
sandbox test budget
agent-call limits
Computer Use limits
media generation limits
```

If budget is insufficient, report:

```text
SYNTHESIS_BUDGET_BLOCKED
```

without partially promoting a candidate.

---

# 492. Admin Dynamic Strategy Dashboard

Admin SHOULD see:

```text
Most requested forbidden dependencies
Most requested alternative agents
Top missing logical capabilities
Top Personal Variant strategy fingerprints
Dynamic synthesis success rate
No-feasible-strategy rate
Promotion candidates
```

This informs roadmap priorities.

---

# 493. Provider-Specific Example Is Non-Normative

Names such as:

```text
Codex
Claude
Antigravity
Gemini
```

are examples of current implementations.

Normative architecture is based on:

```text
logical capabilities
CapabilityDescriptor
strategy contract
runtime/protocol/execution target
```

so future agents/models can participate without redesigning Spec 212.

---

# 494. Revision 8 New Use-Case Families

UC-1311…UC-1410 add 100 tests across:

```text
User Capability Profile
Logical Requirement Manifest
Capability Substitution
Custom Variant Constraints
Dynamic Variant Synthesis
Personal Variant Lifecycle
Demand-Driven Promotion
Agent / Model / Runtime Separation
Capability Registration / Adapter Discovery
Admin AUTO_DISCOVER_VARIANTS
```

---

# 495. Revision 8 Acceptance Criteria — Requirements / Capabilities

- [ ] Use Case can produce provider-neutral Requirement Manifest.
- [ ] Required/optional/quality-enhancing capabilities are separated.
- [ ] User Capability Profile is derived from canonical registries.
- [ ] Profile never exposes raw secrets to Marketplace.
- [ ] CapabilityDescriptor distinguishes remote/local/session/file/browser scope.
- [ ] Model is not treated as agent/runtime automatically.
- [ ] Authenticated browser and generic web access are distinct.
- [ ] Local files/repo/Library scopes are distinct.

---

# 496. Revision 8 Acceptance Criteria — Substitution / Constraints

- [ ] User can forbid Codex/Claude/Computer Use/etc.
- [ ] User can prefer available agents/models without hard-coding use case.
- [ ] Hard constraints cannot be silently violated.
- [ ] Preferences may fall back only under user/policy rules.
- [ ] Substitution preserves output/effect/privacy/approval semantics.
- [ ] Invalid substitute is explained.
- [ ] Impossible constraint combination returns NO_FEASIBLE_STRATEGY.
- [ ] Existing Variant is reused before generating duplicate strategy.

---

# 497. Revision 8 Acceptance Criteria — Dynamic / Personal Variants

- [ ] Dynamic Variant can be synthesized from user's capability profile.
- [ ] Dynamic Variant receives strategy fingerprint.
- [ ] Duplicate prepared strategy is de-duplicated.
- [ ] Personal Dynamic is private by default.
- [ ] Personal Variant can be saved/reused/edited.
- [ ] Personal certification is environment-specific.
- [ ] Personal usage does not inflate public Marketplace metrics.
- [ ] User can submit an improvement/promotion candidate.
- [ ] Public promotion requires sanitization/security/certification.
- [ ] Demand clustering is privacy-safe.

---

# 498. Revision 8 Acceptance Criteria — Agent / Runtime Extensibility

- [ ] New external agent can register through adapter + CapabilityDescriptor.
- [ ] New agent does not require editing every Use Case.
- [ ] Agent, model, runtime, protocol and target are separate fields.
- [ ] Generic external-agent Variant can resolve among certified implementations.
- [ ] Provider-specific Variant remains possible when user explicitly wants it.
- [ ] Local Runner requirement cannot be replaced by remote sandbox without authorized transfer/semantic compatibility.
- [ ] Spec 200/206/211/208 ownership boundaries remain intact.

---

# 499. Revision 8 Acceptance Criteria — Admin Auto-Discovery

- [ ] Admin can run AUTO_DISCOVER_VARIANTS for ID range/category.
- [ ] Discovery uses current Capability Registry.
- [ ] Admin can set max materially distinct strategies/use case.
- [ ] Diversity objectives are configurable.
- [ ] Duplicate/dominated strategies are pruned.
- [ ] Rejected strategies have reasons.
- [ ] New adapter registration can trigger targeted re-discovery.
- [ ] Auto-discovery results do not publish automatically.
- [ ] Gap clusters are visible/exportable.

---

# 500. Current Canonical Corpus — Revision 8

Files:

```text
spec-212-use-cases-1410.json
spec-212-marketplace-catalog-1410.json
```

Integrity:

```text
1,410 prompt strings
1,410 unique prompts
1,410 catalog IDs
UC-0001…UC-1310 unchanged
UC-1311…UC-1410 appended
```

---

# 501. Revision 8 Definition of Done

Revision 8 is complete when a user can open any Marketplace Use Case and ask:

```text
"ไม่ใช้ Codex/Claude ได้ไหม?"
"ผมมี Antigravity ใช้แทนได้ไหม?"
"ใช้ Gemini ที่ผมมีได้ไหม?"
"ทำแบบ SmartAIHub only ได้ไหม?"
"ห้าม Computer Use"
"Local only"
```

and the platform can:

```text
1. derive the actual required capabilities;
2. inspect what the user truly has;
3. identify valid substitutions;
4. distinguish impossible substitutions;
5. reuse an existing certified Variant when available;
6. synthesize a Personal Dynamic Variant otherwise;
7. compile/resolve/test/certify it for the actual environment;
8. show dependencies, privacy, cost and setup clearly;
9. preserve the user's explicit constraints;
10. optionally promote repeatedly demanded strategies through normal governance.
```

---

# 502. Revision 8 Product Principle

> **Prepared Variants are accelerators, not the boundary of what SmartAIHub can do. The true product contract is: describe the outcome, declare constraints, discover the capabilities available to this user, compose an eligible method, prove that method works in the relevant environment, and let the user choose.**


---

# 503. Revision 9 — Twenty-Pass Production Hardening & Corpus Governance Audit

Revision 9 was produced after a minimum **20-pass audit** of both:

```text
Spec 212 Revision 8
+
all 1,410 canonical use cases
```

The audit verified exact corpus uniqueness and stable ID continuity, then looked for architectural and coverage gaps rather than merely increasing prompt count.

It found 20 areas where additional normative requirements and test cases materially improve production readiness.

---

# 504. Revision 9 Twenty-Pass Audit Record

| Pass | Focus | Gap found | Revision 9 correction |
|---:|---|---|---|
| 1 | Capability trust | Capability Profile could trust self-reported Runner/Agent claims too much | Added capability attestation, trust levels, freshness and revocation |
| 2 | Use Case identity | Canonical prompt/category edits lacked material-identity rules | Added immutable semantic identity, prompt revision and taxonomy versioning |
| 3 | Corpus quality | Exact duplicates were prevented but semantic duplicate coverage inflation remained possible | Added semantic dedup/coverage-family governance |
| 4 | Strategy fingerprint | Fingerprint algorithm/collision/version migration were underdefined | Added fingerprint versioning, collision detection and semantic merge safeguards |
| 5 | Template testability | Certification had fixtures conceptually but no first-class Template contract-test package | Added versioned synthetic fixtures and contract tests |
| 6 | Runtime drift | Queued/paused runs could become invalid after preflight | Added start/resume revalidation and approval invalidation rules |
| 7 | Ownership lifecycle | Account/workspace closure could orphan templates/variants/dependencies | Added ownership transfer/archive/deletion semantics |
| 8 | Telemetry privacy | Trace/evidence/redaction rules were not sufficiently field-specific | Added evidence classification, PII/secret redaction and retention controls |
| 9 | Search security | Metadata/reviews could poison embeddings/rerankers | Added search poisoning defenses and field provenance |
| 10 | Ranking integrity | Popularity/recommendation manipulation required deeper controls | Added anti-fraud/fair-discovery rules |
| 11 | Batch resource fairness | Bulk factory could starve interactive users/providers/tenants | Added quota-aware priority/fair scheduling |
| 12 | Adapter trust | CapabilityDescriptor alone did not prove adapter contract compliance | Added standardized adapter conformance suites |
| 13 | Constraint UX | NO_FEASIBLE_STRATEGY lacked guided minimal-relaxation flow | Added constraint negotiation/explainability |
| 14 | Safe preview | Users/admins needed no-side-effect execution preview | Added dry-run/simulation contract |
| 15 | Schema evolution | Marketplace APIs/catalog imports needed stronger compatibility rules | Added schema/version/migration compatibility matrix |
| 16 | Regional compliance | Certification/locality needed explicit regional sovereignty behavior | Added region-specific availability/certification/DR |
| 17 | Offline deployments | Enterprise/secure air-gapped deployment was not covered | Added signed offline catalog/bundle lifecycle |
| 18 | Support operations | Real user failures needed a privacy-safe path into incidents/regressions | Added support escalation/repro packages |
| 19 | Resilience validation | DR architecture existed but scheduled chaos/recovery evidence was missing | Added chaos/DR drills and RPO/RTO validation |
| 20 | Benchmark governance | Oracle/corpus changes needed owners, calibration and anti-gaming governance | Added oracle versioning, human calibration and semantic coverage accounting |

All gaps above are patched below and covered by UC-1411…UC-1610.

---

# 505. Capability Attestation

A capability being present in a registry does not prove the underlying machine/runtime can currently deliver it.

Spec 212 SHALL support trust/evidence states such as:

```text
SELF_REPORTED
DISCOVERED
HEALTH_VERIFIED
CONFORMANCE_VERIFIED
ATTESTED
QUARANTINED
REVOKED
```

High-risk strategy/certification profiles MAY require stronger trust levels.

---

# 506. Attestation Evidence

Attestation MAY cover:

```text
Runner identity
runtime/plugin binary revision
OS/runtime class
installed software capability
GPU capability class
agent adapter revision
health/conformance result
timestamp / expiry
```

Do not include unnecessary hardware/user identifiers in public Marketplace metadata.

---

# 507. Capability Trust Policy

Capability Resolver SHALL combine:

```text
capability match
trust level
health
freshness
policy
certification
```

A functionally matching but revoked/quarantined implementation is ineligible.

---

# 508. Attestation Revocation

Material changes such as runtime/plugin replacement, revoked identity or failed conformance can invalidate attestation and trigger impacted Variant readiness/certification reevaluation.

---

# 509. Use Case Semantic Identity

`use_case_id` represents a semantic user intent, not merely one string.

A non-material editorial change MAY preserve ID.

A material change to:

```text
desired outcome
side effect
critical constraint
target domain/entity class
security/privacy semantics
```

SHALL create a new Use Case identity or explicit successor relation.

---

# 510. Use Case Revision

Store:

```text
use_case_id
prompt_revision
canonical_prompt
title/summary revision
taxonomy_revision
change_reason
changed_by
changed_at
```

Historical benchmark results retain the exact prompt revision used.

---

# 511. Taxonomy Versioning

Marketplace categories/tags SHALL have versioned identifiers independent of display names.

Renaming or reorganizing a category MUST NOT destroy historical analytics.

---

# 512. Semantic Duplicate Detection

New Use Cases SHOULD be checked against the canonical corpus using semantic similarity plus structural signals:

```text
outcome
required capabilities
side effects
constraints
domain
```

High similarity produces a merge/review candidate, not automatic deletion.

---

# 513. Coverage Quality Beyond Prompt Count

Dashboard SHALL report coverage by:

```text
semantic family
capability
control-flow pattern
risk class
side-effect class
runtime/protocol
environment
```

Adding paraphrases without new semantic/control coverage SHALL NOT inflate product coverage claims.

---

# 514. Strategy Fingerprint Version

Every fingerprint SHALL store:

```text
fingerprint_value
fingerprint_algorithm
fingerprint_version
canonical_representation_hash
```

Algorithm upgrades do not silently rewrite Variant identity.

---

# 515. Fingerprint Collision Handling

Fingerprint is an index/hint, not final semantic proof.

On collision or merge candidate:

```text
compare normalized strategy contracts
dependency semantics
locality/privacy/effects
```

before deduplication.

---

# 516. Template Contract Test Pack

Every public/curated Template SHOULD have a `TemplateTestPack`.

Conceptual:

```text
input fixtures
expected invariants
negative fixtures
approval fixtures
permission-denied fixtures
mock dependency responses
```

Fixtures MUST use synthetic/sanitized data unless explicit policy permits otherwise.

---

# 517. Contract Test vs Certification

```text
Contract Test
= fast deterministic/controlled Template behavior checks

Certification
= broader environment/path integration evidence

E2E
= real controlled path verification
```

Passing contract tests alone never grants E2E certification.

---

# 518. Fixture Versioning

Test packs/fixtures SHALL be independently versioned.

A test correction can change oracle/fixture revision without silently changing the Template Version.

Certification records the exact fixture/oracle revision used.

---

# 519. Pre-Execution Revalidation

Immediately before material execution, revalidate applicable:

```text
permissions/grants
dependency health
policy
pricing/budget
runtime availability
schema compatibility
certification freshness
quarantine/deprecation state
```

Preflight performed hours earlier is not sufficient for long queues.

---

# 520. Resume Revalidation

Paused/waiting runs SHALL revalidate material constraints before resuming side effects.

Changes may produce:

```text
RESUME_ALLOWED
REAPPROVAL_REQUIRED
SETUP_REQUIRED
POLICY_BLOCKED
DEPENDENCY_UNAVAILABLE
REPLAN_REQUIRED
```

---

# 521. Approval Invalidation

An approval SHALL be invalidated when material approved parameters change beyond the approval contract, including material destination, cost, permission scope or side-effect target.

---

# 522. Ownership Lifecycle

Marketplace SHALL define behavior for:

```text
user deletion
workspace deletion
organization transfer
creator departure
last maintainer removal
```

No globally important listing should become silently unmaintained without lifecycle state.

---

# 523. Orphaned Template Policy

Possible states:

```text
TRANSFER_REQUIRED
PLATFORM_MAINTAINED
ARCHIVED
UNLISTED
DEPRECATED
```

Policy depends on template type/license/organization ownership.

---

# 524. Secret Reference Cleanup

Deleting/closing an account/workspace SHALL revoke or detach secret references owned by that scope while preserving historical metadata necessary for audit.

---

# 525. Evidence Data Classification

Trace/evidence fields SHOULD be classified:

```text
PUBLIC_METADATA
OPERATIONAL
CONFIDENTIAL
SECRET_REFERENCE
PII
CONTENT_SENSITIVE
```

Retention/access/redaction vary by class.

---

# 526. Field-Level Redaction

Logging/tracing MUST support field-level redaction before:

```text
storage
AI judge
support package
CSV export
analytics
search/embedding
```

Raw secrets SHALL NOT be recoverable from ordinary traces.

---

# 527. Screenshot / Computer-Use Evidence Privacy

Screenshots may contain more sensitive information than structured logs.

Define:

```text
capture policy
mask/redaction
retention
access role
export policy
```

separately.

---

# 528. Search Field Provenance

Search documents SHOULD track which fields originate from:

```text
platform verified metadata
creator metadata
workflow-derived facts
reviews
usage aggregates
```

Untrusted fields receive stricter sanitization and less authority.

---

# 529. Search / Embedding Poisoning Defense

Before indexing untrusted text:

```text
sanitize
length/keyword limits
prompt-injection isolation
spam checks
moderation state
```

A review or creator description MUST NOT become system instruction for reranker/LLM search components.

---

# 530. Impersonation / Homoglyph Protection

System/curated publisher identity and names SHOULD have verified visual/identity treatment to reduce malicious lookalikes.

---

# 531. Ranking Integrity

Ranking SHALL distinguish:

```text
relevance
quality/certification
usage
rating confidence
freshness/exploration
policy/eligibility
```

No single manipulable counter should dominate.

---

# 532. Marketplace Activity Classification

Events SHALL classify:

```text
REAL_USER
ADMIN
BENCHMARK
SYSTEM
INTERNAL_TEST
PROMOTION_CAMPAIGN
```

Only eligible real-user activity contributes to public popularity as configured.

---

# 533. Resource Fairness

Admin/background jobs SHALL not exhaust shared capacity needed for interactive workflows.

Scheduling SHOULD support:

```text
priority classes
tenant quotas
provider-specific concurrency
Runner pools
rate-limit budgets
```

---

# 534. Bulk Backpressure

When provider/Runner queues approach configured capacity:

```text
slow/pause scheduling
preserve durable pending state
resume safely
```

rather than generating cascading retry failures.

---

# 535. Adapter Conformance Suite

Every adapter type SHOULD have standardized conformance tests.

Examples:

```text
External Agent:
  discover/run/stream/cancel/resume/status/artifacts/usage/trace

MCP:
  discovery/schema/error/cancel/security

A2A:
  task lifecycle/artifact mapping/cancel

Runner:
  lease/heartbeat/reconnect/artifacts

ComputerUseDriver:
  observe/act/verify/cancel/rebind
```

---

# 536. Conformance Gate

Adapters failing required conformance SHALL NOT be eligible for:

```text
public Variant certification
AUTO_DISCOVER_VARIANTS
high-risk execution
```

until restored or explicitly limited to compatible capability scopes.

---

# 537. Constraint Negotiation

When constraints make a solution impossible, the Resolver MAY compute minimal changes that would create feasibility.

Example:

```text
Current:
Local-only
No Runner
No Computer Use

Possible if:
1. install Runner
or
2. allow one cloud coding agent
```

It SHALL never change constraints without user/policy authorization.

---

# 538. Constraint Relaxation Diff

Before accepting a relaxation, display material changes:

```text
dependency
data egress
cost
privacy
certification
setup burden
```

Accepted changes create a new constraints revision.

---

# 539. Dry-Run / Simulation Mode

Template/Variant SHOULD support simulation where technically meaningful.

Simulation MUST guarantee:

```text
no declared external write
no payment
no publish
no delete
no deployment
```

unless explicitly using a sandbox/test environment designed for that effect.

---

# 540. Simulation Evidence

Simulation report MAY include:

```text
planned graph/path
resolved dependencies
approvals that would be required
estimated side effects
mock outputs
nodes not simulatable
estimated cost
```

It SHALL be clearly labeled as non-E2E evidence.

---

# 541. Catalog / API Schema Versioning

Every import/export/API contract SHALL declare schema version.

Readers SHALL define behavior for:

```text
compatible optional field
known migrated field
unknown non-critical field
unknown security-critical field
```

Unknown security-critical semantics default to reject, not ignore.

---

# 542. Backward Compatibility Matrix

Maintain compatibility across material versions of:

```text
Spec 212 service
Spec 209 Workflow schema
Marketplace catalog schema
client/API versions
adapter protocols
```

---

# 543. Regional Availability

Variant availability/certification MAY differ by region due to:

```text
provider support
data residency
regulation/policy
Runner placement
model availability
```

Do not project one region's certification globally.

---

# 544. Regional Execution Policy

The Resolver SHALL obey:

```text
allowed processing regions
allowed storage regions
allowed backup/DR regions
```

for classified data.

---

# 545. Offline / Air-Gapped Catalog

Enterprise/private deployments MAY use signed export/import bundles containing only eligible:

```text
catalog metadata
Template manifests
workflow versions
dependency locks
portable allowed assets
certification evidence
```

Secrets are excluded.

---

# 546. Offline Execution Guard

An `OFFLINE`/`AIR_GAPPED` Variant SHALL not contain undeclared external egress.

Runtime policy enforces the boundary even if a tool attempts outbound access.

---

# 547. Support Reproduction Package

For a failed user run, create a privacy-safe package containing:

```text
IDs/versions
strategy/path/environment class
redacted trace
error codes
dependency health
reproduction instructions/fixtures when possible
```

No raw secret or unrelated private content.

---

# 548. Incident Correlation

User reports, telemetry and benchmark regressions MAY correlate to one incident/root cause while maintaining tenant privacy boundaries.

---

# 549. Chaos / DR Validation

Operations SHALL periodically validate failure modes such as:

```text
database failover
queue/Redis loss
search outage
object storage outage
duplicate/out-of-order events
provider outage
region outage
```

using controlled environments.

---

# 550. RPO / RTO Evidence

Disaster recovery objectives are operations policy, but Spec 212 SHALL make recovery verifiable with:

```text
last successful backup
restore test
data-loss window
recovery duration
post-restore integrity checks
```

---

# 551. Benchmark Oracle Ownership

Every canonical semantic family SHOULD have:

```text
oracle owner
reviewer
oracle revision
change reason
last calibration
```

The prompt corpus remains separate from private evaluator/oracle data.

---

# 552. Oracle Change Governance

Changing expected invariants can make a previously failing system pass without code changes.

Therefore oracle modifications SHALL be audited and compared like product code changes.

---

# 553. Human Calibration / Anti-Gaming

Maintain a rotating human-reviewed set to estimate:

```text
false pass
false fail
owner-attribution error
judge drift
benchmark gaming
```

Critical automated success claims require acceptable calibration quality.

---

# 554. Semantic Coverage Score

In addition to raw use-case count, report:

```text
semantic families covered
required capability classes covered
control-flow constructs covered
risk/effect classes covered
runtime/protocol coverage
environment/certification matrix coverage
```

`1,610 prompts` is not itself proof of completeness.

---

# 555. Revision 9 Corpus Additions

UC-1411…UC-1610 add 20 families × 10 cases:

```text
Capability Attestation / Trust
Use Case Identity / Taxonomy
Semantic Dedup / Coverage
Strategy Fingerprint Governance
Template Contract Tests / Fixtures
Run-Time Revalidation / Drift
Ownership / Account Lifecycle
Telemetry Redaction / Privacy
Search / Embedding Poisoning
Ranking Abuse / Fairness
Batch Fairness / Quotas
Adapter Conformance
Constraint Negotiation
Dry-Run / Simulation
Schema Backward Compatibility
Regional Data Sovereignty
Offline / Air-Gapped Marketplace
Support / Incident Escalation
Chaos / Disaster Recovery
Corpus / Oracle Governance
```

---

# 556. Current Canonical Corpus — Revision 9

Files:

```text
spec-212-use-cases-1610.json
spec-212-marketplace-catalog-1610.json
```

Integrity:

```text
1,610 prompts
1,610 exact-unique prompt strings
1,610 sequential IDs
UC-0001…UC-1410 unchanged
UC-1411…UC-1610 appended
```

---

# 557. Revision 9 Acceptance Criteria — Trust / Identity

- [ ] Capability trust/attestation state is represented.
- [ ] High-risk execution can require stronger attestation.
- [ ] Material Use Case semantic change cannot silently reuse ID.
- [ ] Taxonomy/display changes preserve analytics identity.
- [ ] Semantic duplicate detection exists.
- [ ] Raw prompt count is separated from semantic coverage.

---

# 558. Revision 9 Acceptance Criteria — Runtime / Testing

- [ ] Strategy fingerprint algorithm is versioned.
- [ ] Fingerprint collision cannot auto-merge strategies.
- [ ] Public Templates have contract-test packs where required.
- [ ] Fixtures/oracles are independently versioned.
- [ ] Queued/resumed runs revalidate material policy/dependency state.
- [ ] Dry-run cannot perform prohibited real side effects.
- [ ] Simulation is clearly separated from E2E certification.
- [ ] Adapter conformance is a prerequisite for relevant public certification.

---

# 559. Revision 9 Acceptance Criteria — Marketplace Operations

- [ ] Account/workspace deletion has explicit ownership lifecycle.
- [ ] Evidence supports field-level redaction and retention.
- [ ] Untrusted search/review text cannot become system instruction.
- [ ] Search/ranking manipulation controls exist.
- [ ] Background/bulk workloads obey fairness/backpressure.
- [ ] Regional certification/availability is explicit.
- [ ] Air-gapped bundles exclude secrets and enforce no egress.
- [ ] Support incidents can produce privacy-safe reproduction packages.
- [ ] DR/chaos recovery is periodically testable.

---

# 560. Revision 9 Acceptance Criteria — Benchmark Governance

- [ ] Canonical corpus and private oracle remain separate.
- [ ] Oracle changes are versioned/audited.
- [ ] Human calibration estimates judge quality.
- [ ] Hidden holdout integrity remains intact.
- [ ] Corpus semantic dedup is reviewed.
- [ ] Coverage is reported across semantic/capability/control/risk dimensions.
- [ ] Current 1,610 corpus passes integrity validation.

---

# 561. Revision 9 Definition of Done

Revision 9 is complete when Spec 212 is not only capable of:

```text
discovering
generating
certifying
publishing
reviewing
improving
dynamic variant synthesis
```

but can also prove the trustworthiness and lifecycle correctness of the machinery around those actions:

```text
who/what claimed a capability
whether that claim is verified
whether the use case identity is stable
whether tests/oracles are trustworthy
whether queued execution is still authorized
whether evidence is privacy-safe
whether ranking is manipulation-resistant
whether background automation is fair
whether adapters conform
whether constraints can be explained
whether the platform can recover from failure
```

---

# 562. Revision 9 Product Principle

> **Product-grade Workflow Marketplace quality is not the number of templates or variants. It is the ability to prove that the intent, strategy, dependencies, environment, execution, evidence, user feedback and operational state all remain trustworthy as the system evolves.**


---

# 563. Revision 10 — Canonical Bilingual Thai + English Use Cases

Revision 10 changes the localization contract of Spec 212.

All system-seeded Use Cases SHALL be stored as **one language-independent Use Case identity with both Thai and English text**, not as separate Thai and English Use Cases.

Canonical rule:

```text
UC-0001
  ├ prompt.th
  └ prompt.en
```

NOT:

```text
UC-0001-TH
UC-0001-EN
```

Ratings, Solution Variants, Template Versions, dependencies, certification, usage, lineage and reviews remain attached to the single `UC-xxxx` identity.

---

# 564. Bilingual Benchmark Corpus Contract

The prompt-only benchmark file becomes:

```text
spec-212-use-cases-1610-bilingual.json
```

Canonical shape:

```json
[
  {
    "th": "ค้นหาโรงแรมหลายเว็บไซต์ตามงบ ทำเล และเงื่อนไข แล้วสรุปตัวเลือก",
    "en": "Search multiple hotel websites by budget, location, and conditions, then summarize the options."
  }
]
```

The array order remains authoritative for deriving:

```text
index 0 → UC-0001
index 1 → UC-0002
...
index 1609 → UC-1610
```

Both `th` and `en` are mandatory for the system-seeded canonical corpus.

---

# 565. Bilingual Marketplace Catalog Contract

The Marketplace seed file becomes:

```text
spec-212-marketplace-catalog-1610-bilingual.json
```

Canonical shape:

```json
[
  {
    "id": "UC-0001",
    "category": {
      "key": "WEB_SEARCH_AUTOMATION",
      "th": "เว็บ การค้นข้อมูล และ Web Automation",
      "en": "Web Search & Automation"
    },
    "prompt": {
      "th": "ค้นหาโรงแรมหลายเว็บไซต์ตามงบ ทำเล และเงื่อนไข แล้วสรุปตัวเลือก",
      "en": "Search multiple hotel websites by budget, location, and conditions, then summarize the options."
    }
  }
]
```

`category.key` is language-independent and SHALL be used for filtering, analytics and storage relationships.

Display text SHALL NOT be used as category identity.

---

# 566. Language Is Presentation, Not Identity

These fields are language-independent:

```text
use_case_id
category.key
Solution Variant ID
Template Version ID
Strategy Contract
Requirement Manifest
Dependency Manifest
Certification
Usage counters
Review linkage
Lineage
```

Localized text is presentation/input data.

Changing UI language MUST NOT create another Use Case, Variant, rating aggregate, usage counter or Template lineage.

---

# 567. Localized Text Model

Recommended reusable localized-field schema:

```json
{
  "th": "...",
  "en": "..."
}
```

Future languages MAY extend the object without changing semantic identity.

For Revision 10, `th` and `en` are mandatory for system-seeded Use Cases.

---

# 568. Canonical Semantic Source

Neither Thai nor English text SHALL be treated as a permanently superior semantic identity.

The canonical identity is:

```text
use_case_id
+
provider-neutral Requirement Manifest
+
expected semantic invariants
```

The Thai and English prompts are two localized expressions of the same intent.

---

# 569. Translation Semantic Parity

Every Thai/English pair SHALL satisfy semantic parity.

Parity checks SHOULD compare:

```text
desired outcome
required capability classes
material constraints
side effects
approval requirements
privacy/locality
expected outputs
verification requirements
```

A wording difference is acceptable. A material semantic difference is not.

---

# 570. Bilingual Pair Validation Pipeline

On corpus import/update:

```text
TH prompt
     \
      → semantic extraction / Requirement Manifest comparison
     /
EN prompt
```

Result:

```text
PARITY_PASS
PARITY_REVIEW_REQUIRED
PARITY_FAIL
```

`PARITY_FAIL` blocks promotion of the localization revision as canonical.

---

# 571. Translation Revision

Localized copy SHALL be independently revisioned.

Conceptual fields:

```text
use_case_id
locale
text_revision
prompt
title
summary
translation_status
source_revision
reviewed_at
reviewed_by
```

Fixing grammar or terminology SHALL NOT require a new Use Case ID when semantic meaning remains unchanged.

---

# 572. Material Translation Drift

If a translation changes required outcome, hard constraints, privacy/locality, side effects or approval requirements, flag:

```text
MATERIAL_TRANSLATION_DRIFT
```

and require semantic review.

---

# 573. Marketplace Locale Selection

Default display locale:

```text
user UI language
→ requested locale
→ configured fallback
```

For the current corpus:

```text
Thai UI    → th
English UI → en
```

The user MAY switch language without leaving the current Use Case/Variant page.

---

# 574. Locale Fallback

For future community content that may not yet have both languages:

```text
requested locale
→ approved/generated localization if available
→ source locale
```

System-seeded UC-0001…UC-1610 SHALL contain both Thai and English.

---

# 575. Bilingual Search Indexing

Marketplace search SHALL index:

```text
prompt.th
prompt.en
category.th
category.en
localized title/summary
language-independent capability metadata
```

One Use Case produces one search entity.

A query matching both language fields MUST NOT return duplicate listing cards.

---

# 576. Cross-Language Search

Required behavior includes:

```text
Thai query → Thai or English Use Case
English query → English or Thai Use Case
mixed Thai/English query → same canonical Use Case
```

Examples:

```text
"ตัดพูดผิด"
"remove repeated speech"
"video ตัดพูดซ้ำ"
```

may all resolve to the same or related canonical Use Cases.

---

# 577. Search Ranking Language Signals

Ranking MAY consider exact match in requested locale, cross-language semantic similarity, category match, capability match, certification and user-environment eligibility.

Locale preference may boost relevance but SHALL NOT create separate popularity histories.

---

# 578. Bilingual Benchmark Execution

Each semantic Use Case creates two primary language inputs:

```text
UC-xxxx / th
UC-xxxx / en
```

Therefore:

```text
1,610 semantic Use Cases
× 2 canonical language prompts
=
3,220 primary prompt executions
```

This does NOT mean the corpus contains 3,220 separate Use Cases.

---

# 579. Cross-Language Workflow Parity Benchmark

For every Use Case, compare Thai-generated and English-generated workflow semantics.

Do NOT require byte-identical graphs.

Compare normalized:

```text
Requirement Manifest
logical node roles
required capability classes
control-flow semantics
side-effect boundaries
approval boundaries
privacy/locality constraints
output contract
verification contract
```

---

# 580. Cross-Language Parity Status

Suggested:

```text
SEMANTICALLY_EQUIVALENT
EQUIVALENT_WITH_ALLOWED_VARIATION
LANGUAGE_BIASED
SEMANTIC_MISMATCH
NOT_TESTED
```

A systematic difference between Thai and English is a product-quality defect.

---

# 581. Language Bias Metrics

Dashboard SHALL expose at least:

```text
TH design pass rate
EN design pass rate
TH compile pass rate
EN compile pass rate
TH resolve pass rate
EN resolve pass rate
TH verified success rate
EN verified success rate
cross-language semantic parity rate
```

---

# 582. Solution Variants Are Shared Across Languages

Thai and English localized prompts operate on:

```text
same Solution Variants
same Template Versions
same dependencies
same certification matrix
same ratings
same usage
```

A language-specific Variant is created only when actual workflow behavior truly requires locale-specific behavior.

---

# 583. Language-Specific Runtime Requirements

If the Use Case itself requires Thai TTS, Thai subtitles, Thai dialogue, English output, or another language-specific artifact, that requirement remains semantic.

Translation of the catalog prompt SHALL NOT remove it.

Example:

```text
TH: "สร้าง voiceover ภาษาไทยจาก script"
EN: "Create Thai voiceover from a script."
```

---

# 584. Dynamic Variant Synthesis Across Languages

Custom Strategy Resolver SHALL operate on normalized requirements, not literal language strings.

Equivalent Thai/English constraints SHOULD resolve to equivalent candidate strategy sets.

---

# 585. Bilingual Requirement Extraction Test

For each pair:

```text
RequirementManifest(th)
vs
RequirementManifest(en)
```

must be semantically equivalent within parity policy.

Mismatch generates:

```text
GAP_LANGUAGE_REQUIREMENT_EXTRACTION
```

---

# 586. Bilingual Reviews

Users MAY write reviews in Thai or English.

Store:

```text
source_locale
```

with the original review.

The review remains attached to the same Variant/Version.

Do not create separate rating aggregates by language by default.

---

# 587. Review Translation

Marketplace MAY offer translated display of reviews.

The original user-submitted review remains authoritative.

Translated text is presentation-only.

---

# 588. Localized Review Summaries

AI-generated review summaries MAY have:

```text
summary.th
summary.en
```

and remain subject to the existing untrusted-content isolation rules.

---

# 589. Bilingual Template Metadata

System-curated listings SHOULD support:

```text
title.th / title.en
summary.th / summary.en
setup_help.th / setup_help.en
known_limitations.th / known_limitations.en
```

Workflow graph and dependency identity remain language-independent.

---

# 590. Generated Metadata Localization

When a Workflow candidate is promoted:

```text
generate source metadata
→ localize TH + EN
→ semantic consistency check
→ publish
```

Localization failure SHALL NOT mutate the Workflow Definition.

---

# 591. Bilingual Dependency Labels

Capability identity remains language-independent.

Example:

```text
capability_id: code.repository.write

label.th: แก้ไข Repository
label.en: Repository Write
```

Do not create separate capabilities per language.

---

# 592. Bilingual Error / Setup Guidance

User-facing dependency, setup, policy, certification and feasibility messages SHALL be localizable.

Error codes remain language-independent.

---

# 593. Bilingual Admin Bulk Factory

Admin can choose benchmark language mode:

```text
TH_ONLY
EN_ONLY
TH_AND_EN
PARITY_ONLY
```

`TH_AND_EN` runs both canonical prompts.

`PARITY_ONLY` MAY stop after semantic design/compile comparison without running every E2E path.

---

# 594. Paired Test Correlation

Thai/English executions SHALL share:

```text
use_case_id
language_pair_id
locale
benchmark_suite_id
```

to support deterministic parity reporting.

---

# 595. Bilingual Hidden Holdouts

Hidden holdouts SHOULD include:

```text
Thai paraphrases
English paraphrases
mixed-language prompts
code-switching
informal Thai
formal Thai
```

These are separate from the canonical bilingual pair.

---

# 596. Localization Quality Governance

Recommended localization states:

```text
DRAFT
MACHINE_TRANSLATED
REVIEW_REQUIRED
APPROVED
DEPRECATED
```

The system-seeded bilingual corpus SHOULD become canonical only after integrity and semantic review.

---

# 597. Localization Glossary

Maintain a glossary for terms such as:

```text
Workflow
Template
Solution Variant
Runner
Skill
Agent
Computer Use
Library
Marketplace
Storyboard
Drama Series
```

Product terminology may intentionally remain English in Thai text.

---

# 598. Proper Nouns and Product Names

Do NOT translate product identifiers such as:

```text
SmartAIHub
Codex
Claude
Antigravity
Gemini
ComfyUI
Ollama
vLLM
DaVinci Resolve
Cloudflare
```

unless the product owner explicitly defines a localized brand name.

---

# 599. Translation and Semantic Dedup

Thai and English localizations under the same `use_case_id` MUST be excluded from semantic-duplicate counting.

Dedup compares different Use Case identities, not localized copies of one identity.

---

# 600. Locale Analytics

Marketplace MAY report:

```text
search locale
UI locale
prompt locale
review locale
```

for product improvement.

Core usage remains aggregated by Use Case/Variant unless a locale-specific analysis is requested.

---

# 601. Language Performance Without Splitting Identity

If Thai performs worse than English, fix localization, Builder language behavior, or requirement extraction.

Do NOT automatically split the Use Case into separate identities.

---

# 602. Translation Change Regression

When localized prompt text changes materially enough to affect generation:

```text
rerun language-specific benchmark
rerun parity benchmark
compare prior localization revision
```

Grammar-only changes MAY use a lighter policy.

---

# 603. Bilingual Corpus Import Validation

Import SHALL reject system-seeded records for:

```text
missing th
missing en
empty localized value
ID count mismatch
prompt-pair count mismatch
invalid category key
missing category.th
missing category.en
```

---

# 604. Revision 10 Migration

Migration from Revision 9:

```text
old Thai prompt → prompt.th
new English localization → prompt.en
```

Existing UC IDs, Variants, Versions, Reviews, Usage, Certifications and Lineage remain unchanged.

No Marketplace popularity/history reset is required.

---

# 605. Backward Compatibility

Previous Thai-only files MAY remain available for migration/debugging but are deprecated as canonical source.

Canonical Revision 10 artifacts are:

```text
spec-212-use-cases-1610-bilingual.json
spec-212-marketplace-catalog-1610-bilingual.json
```

---

# 606. Revision 10 Acceptance Criteria — Storage

- [ ] All 1,610 Use Cases contain non-empty `th` and `en`.
- [ ] No new Use Case IDs are created solely for language.
- [ ] Every Marketplace category contains stable `key`, `th`, and `en`.
- [ ] Localized display text is never used as relational identity.
- [ ] Existing Variant/Review/Usage histories remain attached to original UC IDs.
- [ ] Import rejects incomplete system-seeded bilingual records.

---

# 607. Revision 10 Acceptance Criteria — Search / Marketplace

- [ ] Thai search retrieves relevant bilingual Use Cases.
- [ ] English search retrieves the same canonical Use Cases.
- [ ] Mixed-language queries work.
- [ ] The same Use Case is not returned twice because both translations matched.
- [ ] Changing UI locale changes display text without changing listing identity.
- [ ] Category filtering uses stable category keys.
- [ ] System-curated title/summary supports TH and EN.

---

# 608. Revision 10 Acceptance Criteria — Benchmark

- [ ] Every UC runs in Thai mode.
- [ ] Every UC runs in English mode.
- [ ] Thai/English executions pair by `use_case_id`.
- [ ] Requirement Manifest parity is checked.
- [ ] Workflow semantic parity is checked.
- [ ] Language-specific success/failure rates are visible.
- [ ] Semantic mismatch becomes a diagnosable language gap, not a second Use Case.
- [ ] 1,610 semantic Use Cases produce 3,220 canonical language executions in full bilingual mode.

---

# 609. Revision 10 Acceptance Criteria — Governance

- [ ] Localization revisions are audited.
- [ ] Material translation drift requires review.
- [ ] Product names and technical identifiers follow glossary rules.
- [ ] Original reviews remain preserved when translated for display.
- [ ] Search indexing separates authoritative localized metadata from untrusted reviews.
- [ ] Translation updates can be regression-tested independently from Workflow Version changes.

---

# 610. Revision 10 Definition of Done

Revision 10 is complete when a user can view, search and invoke the same Marketplace Use Case in Thai or English and SmartAIHub treats both as the same semantic product object:

```text
UC-xxxx
  ├ Thai prompt
  ├ English prompt
  ├ shared Requirement Manifest
  ├ shared Solution Variants
  ├ shared Template Versions
  ├ shared Dependencies
  ├ shared Certification
  ├ shared Usage
  └ shared Reviews
```

while the benchmark proves that the two language forms produce materially equivalent workflow intent and execution behavior.

---

# 611. Revision 10 Product Principle

> **Language is a localized expression of the Use Case, not the identity of the Use Case. SmartAIHub should understand, search, generate and validate the same workflow intent in Thai and English without splitting Marketplace history or silently changing semantics.**


---

# 612. Revision 11 — Twenty-Pass Bilingual Production Audit

Revision 11 was produced after another minimum **20-pass audit** of the full Revision-10 specification and all 1,610 bilingual Use Cases. The audit included exact-integrity checks, bilingual corpus inspection, near-duplicate analysis, stale-contract analysis and production i18n/search/governance review.

No exact duplicate Thai or English prompts were found. Several high-similarity pairs are intentionally distinct (for example dialogue/no-dialogue Storyboards, one-person/multi-person lip-sync, and MCP/A2A wrappers), therefore similarity alone SHALL NOT auto-merge Use Cases.

Revision 11 appends **200 new bilingual Use Cases** as `UC-1611…UC-1810` while preserving `UC-0001…UC-1610` unchanged.

---

# 613. Revision 11 Twenty-Pass Audit Record

| Pass | Focus | Gap found | Revision 11 correction |
|---:|---|---|---|
| 1 | Normative precedence | Historical revisions still referenced old corpus files/counts and could mislead implementers | Added explicit Revision-11 precedence/current-artifact contract |
| 2 | Locale negotiation | `th`/`en` existed but locale negotiation and BCP-47 mapping were underdefined | Added locale negotiation/fallback/source-locale rules |
| 3 | Unicode integrity | Search/dedup lacked canonical normalization/spoofing requirements | Added Unicode normalization, zero-width and homoglyph controls |
| 4 | Thai/English analyzers | Search indexing lacked normative Thai segmentation and English analyzer behavior | Added analyzer/version/tokenization contract |
| 5 | Search parity | Cross-language retrieval quality was not a release-gated metric | Added Recall/NDCG/MRR/zero-result parity benchmarks |
| 6 | Translation provenance | Reviewed vs machine-generated localization provenance was incomplete | Added source revision, translation state, reviewer and provider provenance |
| 7 | Terminology | Glossary existed conceptually but lacked governance/versioning | Added glossary/version/domain/tenant override rules |
| 8 | Metadata completeness | Prompt was bilingual but listing/setup/limitations metadata could remain single-language | Added localized metadata completeness contract |
| 9 | Proper nouns | Transliteration/alias/disambiguation was underdefined | Added alias types, provenance and search behavior |
| 10 | Code-switching | Mixed Thai-English real prompts lacked direct coverage | Added code-switching detection/resolution benchmarks |
| 11 | Output language | UI locale and requested artifact language could be conflated | Added separate input/output/UI locale dimensions |
| 12 | Community localization | Creator/community localization permissions/lifecycle were incomplete | Added translation-specific permissions and revision lifecycle |
| 13 | On-demand translation | Review/community fallback translation lacked provenance/cache/privacy rules | Added clearly labeled, policy-aware on-demand translation |
| 14 | Admin localization ops | Bulk translation/parity review workflows were under-specified | Added Admin localization factory and reports |
| 15 | Cache/index consistency | Locale-specific cache/search invalidation was underdefined | Added locale-aware cache keys and index reconciliation |
| 16 | Judge/oracle bias | Semantic judge could behave differently by language | Added bilingual judge calibration and disagreement handling |
| 17 | Locale formatting | Dates/numbers/currency/timezone were not separated from content locale | Added locale-formatting contract |
| 18 | Accessibility+i18n | Localization QA did not explicitly include accessibility | Added lang attributes, screen-reader and Thai mark regressions |
| 19 | Future languages | `th`/`en` schema risked becoming a hard-coded ceiling | Added extensible locale architecture and future RTL/pluralization readiness |
| 20 | Artifact integrity/migration | Bilingual corpus lacked a signed/versioned manifest and strong legacy-consumer migration guardrails | Added manifest/checksum/schema and superseded-contract migration rules |

---

# 614. Canonical Locale Identifiers

The canonical system-seeded content keys remain:

```text
th
en
```

External/API locale negotiation SHOULD accept BCP-47 tags such as `th-TH` or `en-US` and map them to canonical content according to configured locale policy.

Canonical content keys are not timezones, regions or output-language requirements.

---

# 615. Locale Resolution Contract

Recommended order:

```text
explicit request locale
-> user preference
-> workspace preference
-> platform default
-> source-locale fallback where permitted
```

Resolution SHALL return both:

```text
requested_locale
resolved_content_locale
fallback_used
localization_revision
localization_status
```

Changing locale SHALL NOT change entitlement, listing identity, Variant selection or security scope.

---

# 616. Unicode Normalization Contract

Store original localized text and a separate normalized/search representation.

Normalization pipeline SHOULD address:

```text
Unicode normalization
zero-width characters
homoglyph/confusable detection where security-sensitive
whitespace/punctuation canonicalization
case folding where appropriate
```

Thai combining marks and meaningful proper nouns MUST remain intact.

Normalization is not permission to rewrite user content.

---

# 617. Search Analyzer Contract

Thai and English SHALL use language-appropriate analyzers.

Thai search MUST NOT assume spaces delimit all words. English stemming/lemmatization MUST preserve technical identifiers and brand names.

Analyzer configuration/version is part of search-index provenance and must be regression-tested before promotion.

---

# 618. Search Language Parity

Maintain paired query sets and report:

```text
Recall@K by locale
NDCG@K by locale
MRR by locale
zero-result rate by locale
cross-language canonical-result agreement
```

A substantial unexplained TH/EN retrieval gap is a product defect even if overall search metrics look healthy.

---

# 619. Localization Provenance

Every authoritative localized field SHOULD record:

```text
locale
text_revision
source_revision
translation_status
translation_origin
reviewer/approval reference
provider/model revision when AI-assisted
```

Suggested `translation_origin`:

```text
PLATFORM_AUTHORED
HUMAN_TRANSLATED
AI_ASSISTED
MACHINE_TRANSLATED
CREATOR_AUTHORED
COMMUNITY_CONTRIBUTED
```

---

# 620. Translation State Machine

```text
DRAFT
MACHINE_TRANSLATED
REVIEW_REQUIRED
APPROVED
STALE
REJECTED
DEPRECATED
```

A material source-text revision can transition dependent translations to `STALE` or `REVIEW_REQUIRED`.

---

# 621. Localization Glossary Governance

Maintain versioned global and optional domain/tenant glossaries.

Glossary entries may specify:

```text
canonical term
approved translations
do-not-translate
domain
notes
revision
```

Product names and technical identifiers remain unchanged unless explicitly localized by product policy.

---

# 622. Localized Metadata Completeness

Public/system-curated listings SHOULD support at least:

```text
title
summary
prompt
setup_help
known_limitations
material prerequisites
```

in required public locales.

Workflow Definition, dependency identity and certification remain language-independent.

---

# 623. Alias / Transliteration Model

Search metadata MAY include aliases with:

```text
text
locale/script
alias_type: OFFICIAL_TITLE | TRANSLITERATION | ALTERNATE | WORKSPACE_ALIAS
provenance
scope
```

Aliases never replace canonical Use Case identity and MUST respect access scope.

---

# 624. Mixed-Language Inputs

Language detection SHALL tolerate:

```text
Thai-dominant code switching
English-dominant code switching
technical acronyms
provider/product names
code snippets
```

Requirement extraction uses semantics, not a requirement that the entire prompt belong to one language.

---

# 625. UI Locale vs Input/Output Language

Represent separately:

```text
ui_locale
input_locale/source_locale
requested_output_language(s)
artifact_language metadata
```

Example: English UI may run a Use Case that explicitly produces Thai subtitles. Translating the Marketplace description must never change that semantic requirement.

---

# 626. Community Localization

Localization permission SHALL be separable from workflow-edit permission.

Example roles/capabilities:

```text
TRANSLATE_METADATA
REVIEW_LOCALIZATION
EDIT_WORKFLOW
PUBLISH_TEMPLATE
```

Translation revisions and Workflow Versions have independent histories.

---

# 627. On-Demand Translation

User-generated/community text may be translated on demand. Such text SHALL be labeled as translated, preserve access to the original and never become authoritative canonical content automatically.

Translation execution obeys privacy/data-egress policy and may use local translation where required.

---

# 628. Admin Localization Factory

Admin operations SHOULD support:

```text
GENERATE_MISSING_LOCALIZATIONS
REVIEW_CHANGED_SOURCE
PARITY_AUDIT
GLOSSARY_AUDIT
RETRY_TRANSLATION_FAILURES
EXPORT_LOCALIZATION_QA
```

Admin may operate by UC range/category/status while preserving corpus identity.

---

# 629. Localization Cache / Index Consistency

Cache/search identity SHALL include relevant locale/revision dimensions.

A localization update SHALL emit durable idempotent events for:

```text
search reindex
cache invalidation
translation stale detection
parity retest
```

Private/localized content MUST NOT leak through public cache/index entries.

---

# 630. Bilingual Judge / Oracle Independence

Deterministic structural assertions run before semantic judging.

The benchmark SHALL distinguish:

```text
workflow correctness
translation correctness
judge-language bias
```

When equivalent TH/EN evidence yields materially conflicting AI-judge conclusions, route to review rather than silently selecting one verdict.

---

# 631. Locale-Aware Formatting

Locale governs presentation only unless the user input semantics explicitly require otherwise.

Separate:

```text
locale
timezone
currency code
number/date canonical values
```

Do not infer timezone, currency or data residency solely from UI language.

---

# 632. Accessibility and Localization

Localization QA SHALL include:

```text
correct language attributes
screen-reader labels
keyboard navigation
font scaling
Thai combining-mark rendering
text truncation
focus/high-contrast states
```

---

# 633. Future Language Extensibility

Database/service design SHOULD model localized values by locale key rather than fixed database columns that can never extend beyond `th`/`en`.

Revision 11 requires `th` and `en` for system seed content but future locales may be added without changing Use Case/Variant/Template identity.

UI infrastructure SHOULD avoid assumptions that all future languages are LTR or use English pluralization.

---

# 634. Canonical Corpus Manifest

Revision 11 adds:

```text
spec-212-corpus-manifest-r11.json
```

The manifest SHALL contain at least:

```text
schema_version
corpus_version
spec_revision
use_case_count
required_locales
canonical filenames
SHA-256 checksums
first_id
last_id
```

CI/release tooling SHALL validate the manifest before bulk benchmark execution.

---

# 635. Canonical Bilingual Corpus Schema

Prompt-only canonical file:

```json
[
  {
    "th": "...",
    "en": "..."
  }
]
```

Marketplace catalog:

```json
{
  "id": "UC-0001",
  "category": {
    "key": "...",
    "th": "...",
    "en": "..."
  },
  "prompt": {
    "th": "...",
    "en": "..."
  }
}
```

The seed catalog remains intentionally small. Richer localization provenance may be imported/derived into database tables rather than bloating the portable seed file.

---

# 636. Superseded Corpus Contracts

The following historical filename families are non-authoritative for new implementation:

```text
spec-212-use-cases-1000*
spec-212-use-cases-1210*
spec-212-use-cases-1310*
spec-212-use-cases-1410*
spec-212-use-cases-1610.json (Thai-only)
```

Revision 11 canonical files are the bilingual 1,810 artifacts named in section 0.1.

Legacy readers MAY use compatibility adapters during migration, but all writes target the current canonical schema.

---

# 637. Schema Migration / Legacy Consumer Policy

Legacy client expecting:

```json
{ "prompt": "..." }
```

may receive an adapter view selecting the requested/default locale. The adapter SHALL emit deprecation telemetry and MUST NOT become a second source of truth.

Unknown security-critical fields remain fail-closed.

---

# 638. Semantic Near-Duplicate Governance

Exact duplicate prevention is insufficient; similarity is also insufficient for merging.

Merge decisions SHALL compare:

```text
outcome
constraints
side effects
required capability classes
control-flow coverage
verification requirements
```

Near pairs that intentionally probe different requirements remain separate canonical tests.

---

# 639. Bilingual Coverage Metrics

Report:

```text
semantic Use Cases: 1,810
canonical language prompts: 3,620
TH/EN parity coverage
search relevance parity
requirement-extraction parity
workflow-design parity
compile/resolve/verified-success by locale
localization review coverage
```

Raw prompt execution count is not the semantic Use Case count.

---

# 640. Revision 11 New Use-Case Families

UC-1611…UC-1810 add 20 families × 10 bilingual cases:

```text
Locale / Language Negotiation
Unicode / Text Normalization / Spoofing
Thai / English Search Analyzers
Cross-Language Search / Ranking Parity
Translation Provenance / Review Status
Localization Glossary / Terminology Governance
Localized Template Metadata Completeness
Aliases / Transliteration / Proper Nouns
Mixed Language / Code-Switching
UI Locale vs Requested Output Language
Community Template Localization Lifecycle
On-Demand Translation / Fallback Transparency
Admin Localization Operations / Bulk Translation
Localization Cache / Search Index Consistency
Bilingual Judge / Oracle Parity
Locale Formatting / Date / Number / Currency
Accessibility + Localization
Future Language Extensibility / i18n Architecture
Corpus Artifact / Schema / Checksum Integrity
Spec Precedence / Superseded Contracts / Migration
```

---

# 641. Current Canonical Corpus — Revision 11

```text
1,810 semantic Use Cases
3,620 canonical TH+EN prompt executions
UC-0001…UC-1610 unchanged
UC-1611…UC-1810 appended
```

Canonical artifacts:

```text
spec-212-use-cases-1810-bilingual.json
spec-212-marketplace-catalog-1810-bilingual.json
spec-212-corpus-manifest-r11.json
```

---

# 642. Revision 11 Acceptance Criteria — Bilingual Data

- [ ] Every canonical Use Case has non-empty TH and EN prompts.
- [ ] Locale is not part of Use Case identity.
- [ ] BCP-47 requests map to canonical locale content safely.
- [ ] Unicode normalization preserves original text and Thai combining marks.
- [ ] Category identity uses stable keys rather than labels.
- [ ] Canonical artifacts pass checksum/schema/count validation.
- [ ] Legacy corpus readers cannot silently become write sources.

---

# 643. Revision 11 Acceptance Criteria — Search / Localization

- [ ] Thai segmentation and English analyzers are versioned/tested.
- [ ] TH/EN search quality metrics are compared.
- [ ] Mixed-language queries are supported.
- [ ] Search results deduplicate localized hits by Use Case ID.
- [ ] Aliases/transliterations remain scoped and provenance-aware.
- [ ] Localization source/revision/status are auditable.
- [ ] Glossary violations are detectable.
- [ ] Localization cache/index changes reconcile durably.

---

# 644. Revision 11 Acceptance Criteria — Benchmark / Judge

- [ ] Full bilingual suite can execute 3,620 canonical prompts.
- [ ] Requirement extraction is parity-tested.
- [ ] Workflow semantics are parity-tested.
- [ ] Judge bias is calibrated by locale.
- [ ] Translation quality is scored separately from workflow quality.
- [ ] Near-duplicate semantic cases are not auto-merged solely by similarity.
- [ ] Hidden holdouts include code-switching/paraphrases.

---

# 645. Revision 11 Acceptance Criteria — Product / Admin

- [ ] UI locale, input locale and output language are separate.
- [ ] Public listing metadata supports required TH/EN fields.
- [ ] Community localization permissions are distinct from workflow editing.
- [ ] On-demand translation is labeled and policy-aware.
- [ ] Admin can bulk generate/review/retry localizations by UC range/status.
- [ ] Accessibility regression is part of localization QA.
- [ ] Locale formatting does not change canonical numeric/date values.
- [ ] Future languages can be added without new Use Case IDs.

---

# 646. Revision 11 Definition of Done

Revision 11 is complete when SmartAIHub can treat 1,810 Use Cases as language-independent semantic identities while operating Thai and English as first-class, independently governed localizations across search, Marketplace, generation, benchmarking, review, admin operations and accessibility.

The product SHALL be able to prove not only that both languages exist, but that they retrieve the same intent, extract equivalent requirements and lead to materially equivalent workflow behavior.

---

# 647. Revision 11 Product Principle

> **Bilingual support is not two copies of a catalog. It is one semantic product model with two independently governed language surfaces, measurable parity, safe fallback and stable identity.**

---

# 648. Revision 12 — Twenty-Pass Language-Aware Production Audit

Revision 12 follows a minimum **20-pass audit** of Revision 11, the full 1,810-record bilingual corpus, Marketplace catalog and manifest. The audit treats bilingual support as an execution capability, not merely two translated strings.

It also corrects **17 legacy `prompt.th` localization defects** in place while preserving UC identity/history, then appends **200 new cases** as `UC-1811…UC-2010`.

# 649. Revision 12 Twenty-Pass Audit Record

| Pass | Focus | Gap | Correction |
|---:|---|---|---|
| 1 | Bilingual data completeness | 17 Thai fields were English-only | Script-aware completeness lint + corrected localizations |
| 2 | Language capability model | Language support not modeled by modality | LanguageCapabilityProfile for text/ASR/TTS/OCR/retrieval |
| 3 | Runtime routing | Resolver could ignore required language quality | Locale-aware runtime/provider eligibility |
| 4 | ASR/TTS/lip-sync | Text support could be mistaken for speech support | Independent speech-language certification |
| 5 | Thai rendering | Font/shaping/line-break coverage was thin | Thai rendering fixtures and font governance |
| 6 | Locale input parsing | Thai digits/B.E. dates/number formats were under-modeled | Locale-aware parsing with original-value preservation |
| 7 | Entity/transliteration | Aliases could duplicate or misresolve entities | Canonical entity + localized alias provenance |
| 8 | Translation operations | Glossary existed without full TM impact model | Translation Memory + glossary revision impact |
| 9 | Approval/consent | Localized approval text not strongly bound to canonical approval | Locale/text revision/hash in approval evidence |
| 10 | Workspace locale policy | UI/output/legal locales could be conflated | Layered effective locale policy |
| 11 | Notifications | Language-neutral events vs localized messages underdefined | Localized notification contract and parity |
| 12 | Artifact metadata | Assets needed multilingual metadata without object duplication | Localized asset metadata + canonical AssetRef |
| 13 | Cross-language RAG | Cross-language retrieval/citation fidelity under-tested | Cross-language retrieval metrics and source-language provenance |
| 14 | Output verification | Prompt parity did not guarantee output-language correctness | Language-aware artifact/output verification |
| 15 | Language bias | Needed finer diagnostic metrics | Bias metrics by requirement/runtime/approval/judge |
| 16 | Cost/tokenization | Analyzer/token differences could skew ranking/cost interpretation | Locale cost/latency and score calibration |
| 17 | Mixed-language data | Real code-switched documents/threads underrepresented | Mixed-language workflow/data tests |
| 18 | Import/community localization | Translation trust/permission boundaries incomplete | Localization provenance, roles and locale quarantine |
| 19 | Release governance | No unified bilingual release gate | Bilingual release-gate profile |
| 20 | Corpus integrity | Count/checksum insufficient to detect wrong-script data | Script-aware CI lint and localized-field completeness |

# 650. Language Support Is a Capability Dimension

Capability implementations SHALL express language support by modality. A multilingual text model SHALL NOT automatically imply multilingual ASR, TTS, OCR, embedding, translation, diarization or lip-sync support.

Recommended states:

```text
CERTIFIED
SUPPORTED
BEST_EFFORT
EXPERIMENTAL
UNSUPPORTED
UNKNOWN
```

# 651. LanguageCapabilityProfile

Conceptual capability metadata SHOULD cover:

```text
text_input locales
text_output locales
ASR locales
TTS locales
OCR scripts/locales
translation pairs
embedding/retrieval language support
speech/lip-sync locale support
quality/certification per locale
```

The dependency manifest and certification matrix SHALL reference the relevant language-capability evidence.

# 652. Language-Aware Runtime Resolution

Runtime/Variant resolution SHALL consider:

```text
Requirement Manifest
source language
requested output language
modality
minimum language quality
provider/runtime health
certification
privacy/locality
cost
```

A cheaper implementation is ineligible if it cannot satisfy the required language capability.

# 653. Locale Dimensions Are Separate

Do not conflate:

```text
ui_locale
input/source_language
requested_output_language
artifact_language
approval_display_locale
notification_locale
workspace legal locale
```

Changing the UI language SHALL NOT silently change artifact/output language.

# 654. Speech / ASR / TTS / Lip-Sync Certification

Speech paths SHALL have independent locale evidence. Relevant measures MAY include ASR WER/CER, diarization, proper-name accuracy, TTS intelligibility/pronunciation/prosody, subtitle alignment and lip-sync timing.

A provider that passes Thai text tests cannot receive a Thai speech badge solely from that evidence.

# 655. Thai Rendering Contract

Thai media/document rendering SHALL test:

```text
glyph coverage
vowel/tone-mark shaping
font fallback
line breaking
caption safe areas
subtitle burn-in
image/infographic text
PDF/HTML/image export
Windows/macOS/Linux/cloud renderers
```

Rendering failure is distinct from translation failure.

# 656. Font Dependencies

Where a Template materially depends on a font, record script coverage, fallback stack and redistribution/license constraints. Public templates SHALL NOT silently redistribute unlicensed fonts.

# 657. Locale-Aware Input Parsing

Input normalization MAY handle Thai digits, Buddhist Era/Gregorian dates, number separators, currency, units and relative time, while preserving the original value.

Opaque IDs, filenames and product codes SHALL NOT be normalized without an explicit typed contract.

# 658. Ambiguous Locale Parsing

High-impact ambiguous values SHALL resolve to:

```text
PARSED
PARSED_WITH_EXPLICIT_LOCALE
AMBIGUOUS_REQUIRES_INPUT
INVALID
```

rather than silent guessing.

# 659. Canonical Entity + Localized Aliases

Entity identity SHALL be language-independent. Names/transliterations/aliases SHOULD carry provenance and confidence and map back to one canonical project/character/product/location/entity ID.

# 660. Translation Memory and Glossary Governance

Translation Memory and glossary entries SHALL be versioned, contextual and independently auditable. Machine translation SHALL NOT silently override approved terminology. Glossary revisions SHOULD trigger impact analysis and targeted parity regression.

# 661. Localized Approval / Consent Evidence

Material approvals SHOULD retain:

```text
canonical approval contract
material parameters
display locale
localized text revision/hash
approver
timestamp
```

A translated approval must preserve the same canonical action/target/scope.

# 662. Effective Workspace / User Locale Policy

The effective locale may be influenced by platform, tenant, workspace and user preference, but semantic output requirements and regulated consent requirements take precedence over mere display preference.

# 663. Localized Notifications

Generate localized notifications from one language-neutral event payload. Error codes, run IDs and canonical action targets remain stable; title/message/CTA/explanation are localized.

Critical TH/EN notifications SHOULD be parity-tested for severity, required action, target and deadline.

# 664. Multilingual Asset Metadata

A single canonical Library/R2 asset MAY have multiple localized metadata records and embeddings without duplicating the underlying object.

Localized metadata SHALL retain source/provenance and follow canonical asset retention/deletion lifecycle.

# 665. Cross-Language RAG

Retrieval Broker SHALL benchmark:

```text
TH query -> TH corpus
TH query -> EN corpus
EN query -> EN corpus
EN query -> TH corpus
mixed query -> mixed corpus
```

Source locale, citation provenance and canonical document identity SHALL remain available.

# 666. Citation Translation Provenance

Translated presentation of a citation SHALL be distinguishable from verbatim source text. Never present translated text as the exact original quote.

# 667. Output-Language Verification

Verification SHOULD check requested artifact language, glossary adherence, numbers/entities, disclaimers/constraints, structured schema, subtitle/audio language and material semantic preservation where applicable.

High-risk localized output MAY require independent bilingual or human verification.

# 668. Language Bias Metrics

Dashboard SHALL support diagnostic metrics by locale, including:

```text
Requirement Extraction errors
hallucinated dependencies
approval omissions
unnecessary Computer Use
runtime-selection divergence
judge disagreement
verified-success delta
```

# 669. Language Parity Release Thresholds

Product policy SHOULD define acceptable TH/EN deltas for critical categories and goldens. A release MAY be blocked for language disparity even if aggregate success looks acceptable.

# 670. Tokenization / Search-Score Calibration

Raw token count across languages is not a semantic complexity metric. Track locale-specific token/cost/latency for capacity planning.

Thai segmentation and English tokenization may produce different score distributions; cross-analyzer ranking SHOULD be benchmarked/calibrated before deployment.

# 671. Mixed-Language Workflow Data

A workflow MAY process code-switched or bilingual inputs without forcing all content into one locale. Stable canonical enum/value fields SHALL drive control flow rather than localized display strings.

# 672. Localization Import / Export

Template packages SHOULD carry localization resources separately from workflow semantics, with locale, text revision, provenance/trust state, taxonomy key and glossary dependencies where material.

Imported translations SHALL NOT automatically become `APPROVED`.

# 673. Community Localization Roles

Translation permissions SHALL be separable from workflow-edit permissions:

```text
TRANSLATOR
LOCALIZATION_REVIEWER
TEMPLATE_EDITOR
```

A misleading localization may be quarantined for one locale without necessarily disabling the safe underlying Template for all locales.

# 674. Bilingual Release Gate

A production release of system-seeded content SHALL validate at minimum:

```text
required locales complete
script-aware locale lint
schema validity
manifest checksum
critical semantic parity
search parity
critical approval-copy parity
language-capability metadata completeness
open material translation drift
```

# 675. Bilingual E2E Sampling

Full E2E for every language pair may be expensive. Use layered testing:

```text
all 2,010 x 2 -> requirement/design parity
changed/risk-weighted subset -> compile/resolve/sandbox
critical golden + affected dependency matrix -> E2E
```

Sampling SHALL be risk/coverage-driven, not used to hide a weak locale.

# 676. Canonical Locale Completeness Lint

CI SHALL detect:

```text
empty locale
placeholder
wrong-script anomaly
unexpected duplicate
Unicode normalization anomaly
missing category localization
broken ID/order
```

Intentional proper nouns/code snippets in another script require an explicit/reviewable exception rather than weakening the lint globally.

# 677. Revision 12 Legacy Localization Corrections

Revision 12 corrects 17 existing Thai localization defects without changing the corresponding UC IDs, semantic intent, Variant histories, Template Versions, usage or reviews.

The manifest SHALL list the corrected IDs for migration/audit.

# 678. Revision 12 New Use-Case Families

`UC-1811…UC-2010` add 20 families:

```text
Bilingual Data Completeness
Language Capability Descriptor
Language-Aware Routing
ASR / TTS / Locale Quality
Thai Text Rendering
Locale-Aware Input Parsing
Entity / Transliteration Resolution
Translation Memory / Glossary
Localized Approval / Consent
Workspace Locale Policy
Localized Notifications
Multilingual Artifact Metadata
Cross-Language RAG
Bilingual Output Verification
Language Bias Evaluation
Language Cost / Tokenization
Mixed-Language Workflow Data
Localization Import / Export
Community Localization Governance
Bilingual Release Gates
```

# 679. Current Canonical Corpus — Revision 12

Authoritative artifacts:

```text
spec-212-r12-language-aware-bilingual-hardening.md
spec-212-use-cases-2010-bilingual.json
spec-212-marketplace-catalog-2010-bilingual.json
spec-212-corpus-manifest-r12.json
```

Target integrity:

```text
2,010 semantic Use Cases
2,010 Thai prompts
2,010 English prompts
4,020 canonical TH+EN prompt executions
UC-0001…UC-2010 sequential IDs
```

# 680. Revision 12 Acceptance Criteria

- [ ] All system-seeded `th` prompts contain valid Thai localization or an explicit reviewed exception.
- [ ] Language support is represented per modality in CapabilityDescriptor.
- [ ] Runtime Resolver rejects implementations missing required language capability.
- [ ] Thai text/speech/rendering paths have independent tests.
- [ ] Locale parsing preserves original values and does not silently guess high-impact ambiguity.
- [ ] Aliases/transliterations resolve to canonical entities.
- [ ] Cross-language RAG preserves source/citation provenance.
- [ ] Requested output language is independently verified.
- [ ] Localized approvals remain bound to one canonical approval contract.
- [ ] Community localization roles cannot mutate workflow semantics.
- [ ] TH/EN bias and search parity are release-visible.
- [ ] The 2,010-record manifest validates count, order and checksums.

# 681. Revision 12 Definition of Done

Revision 12 is complete when language is carried through the full execution contract:

```text
localized Use Case
→ Requirement Manifest
→ required language/modalities
→ language-aware CapabilityDescriptor
→ Variant/runtime resolution
→ execution
→ language-aware verification
→ localized approval/review/notification
```

without creating a second Use Case identity merely because the user changes language.

# 682. Revision 12 Product Principle

> **A bilingual Workflow Marketplace is not complete because every record has two strings. It is complete only when language requirements affect capability discovery, routing, execution, verification, retrieval, media rendering, approvals and release governance while preserving one canonical Use Case identity.**


---

# 683. Revision 13 — Twenty-Pass Marketplace Governance & Optimization Audit

Revision 13 follows another minimum **20-pass audit** of the full Revision-12 specification, all 2,010 bilingual Use Cases, Marketplace catalog and corpus manifest.

The audit found that the core Marketplace/Variant/BYOC/bilingual architecture is mature, but a large-scale production system still needed stronger contracts around:

```text
current-contract integrity
Requirement Manifest revisions
persistent user preferences
Variant trade-off presentation
structured why/why-not explanations
dependency BOM/provenance
resource schedulability
cancellation/compensation
cross-provider cost normalization
generation reproducibility
Template compatibility semantics
moderation appeals
legal hold/retention
notification fatigue/escalation
experiment statistical integrity
fixture/dataset lifecycle
user-fork update synchronization
recommendation preference learning
vector tenant isolation
degraded-mode behavior
```

Revision 13 patches all twenty areas and appends `UC-2011…UC-2210`.

---

# 684. Revision 13 Twenty-Pass Audit Record

| Pass | Focus | Gap found | Correction |
|---:|---|---|---|
| 1 | Normative contract integrity | Historical current references could still mislead implementation | Added Current Contract Index, CI consistency gate and stale-reference correction |
| 2 | Requirement lifecycle | Requirement Manifest lacked explicit independent revision/provenance lifecycle | Added revision, semantic diff, impact analysis and rollback |
| 3 | User preferences | Variant constraints existed per request but persistent soft preferences were underdefined | Added User/Workspace Preference Profile and precedence |
| 4 | Variant choice overload | Many valid Variants could overwhelm users | Added Pareto-frontier/dominance model with confidence-aware trade-offs |
| 5 | Explainability | Resolver decisions needed structured why/why-not evidence | Added resolver-grounded Solution Explanation contract |
| 6 | Supply-chain snapshot | Dependency Manifest lacked one exportable full bill-of-materials view | Added Workflow BOM bound to signed/certified versions |
| 7 | Schedulability | Feasible Variant did not imply current resource capacity | Added reservation/capacity/readiness distinction |
| 8 | Cancellation | Cancel propagation existed but committed side effects/compensation were underdefined | Added side-effect ledger and compensation state model |
| 9 | Cost comparison | Provider/BYO estimates were not fully comparable | Added rate-card/currency snapshots and uncertainty-aware normalization |
| 10 | Reproducibility | Non-deterministic generation required stronger attempt-level configuration evidence | Added generation/replay manifests and reproducibility confidence |
| 11 | Template compatibility | Version history lacked explicit compatibility classes | Added semantic compatibility/PATCH-MINOR-MAJOR rules |
| 12 | Moderation governance | Quarantine/reporting needed formal appeal/dispute workflow | Added moderation case and appeal state machine |
| 13 | Retention exceptions | Deletion/retention did not model legal holds | Added legal-hold-aware deletion and audit |
| 14 | Notification operations | Large batches/incidents could create notification fatigue | Added digest, dedupe, acknowledgment and escalation |
| 15 | Experiments | Canary existed without sufficient statistical-governance requirements | Added assignment/exposure/sample-ratio/confidence rules |
| 16 | Benchmark fixtures | Test packs existed but dataset lifecycle/provenance needed stronger governance | Added fixture datasets, licenses, contamination and retirement |
| 17 | User forks | Three-way merge existed but long-lived fork security/update synchronization was incomplete | Added rebase/pin/security patch tracking |
| 18 | Recommendation learning | Personalization lacked explicit-vs-inferred preference governance | Added editable/expiring preference learning and diversity guards |
| 19 | Vector tenancy | Search scope rules needed explicit ANN/vector isolation requirements | Added vector namespace/filter/deletion penetration tests |
| 20 | Degraded modes | Individual outage handling existed but system-wide fail-open/fail-closed rules were incomplete | Added dependency criticality and degraded-mode contracts |

---

# 685. Requirement Manifest Revision Contract

`RequirementManifest` SHALL be independently revisioned from:

```text
Use Case localization
Solution Variant
Template Version
```

A canonical record SHOULD include:

```text
requirement_manifest_id
use_case_id
revision
derived_from_prompt_revision
requirements
effects
verification requirements
provenance per requirement
created_by
created_at
```

---

# 686. Requirement Provenance

Each material requirement SHOULD identify its source:

```text
USER_INTENT
POLICY
SYSTEM_INFERENCE
FIXTURE
HUMAN_CORRECTION
MIGRATION
```

This allows the platform to explain whether a condition was explicitly requested or inferred for safe execution.

---

# 687. Requirement Revision Impact

Before a Requirement Manifest revision becomes current:

```text
semantic diff
→ affected Variants
→ affected certifications
→ affected public Templates
→ required revalidation/re-certification
```

A requirement change that weakens approval/security constraints requires explicit governance.

---

# 688. User Preference Profile

Persistent preferences MAY include:

```text
prefer SmartAIHub native
preferred external agents
avoid Computer Use
local-first / cloud-first
maximum setup burden
cost preference
minimum quality
latency preference
personalization enabled
```

These are preferences, not authorization.

---

# 689. Preference Precedence

Recommended precedence:

```text
hard platform/organization policy
→ explicit run constraints
→ explicit user preferences
→ workspace soft defaults
→ inferred preferences
→ product defaults
```

A lower level cannot override a higher-level hard constraint.

---

# 690. Inferred Preference Governance

Inferred preferences SHALL:

```text
be distinguishable from explicit preferences
be inspectable/resettable
decay/expire when stale
not infer sensitive traits
not suppress search results
```

---

# 691. Variant Trade-Off Model

Variant comparison SHOULD treat dimensions separately:

```text
feasibility
certification
privacy/locality
cost
latency
quality
setup burden
human intervention
capacity/queue delay
```

Avoid one opaque universal score.

---

# 692. Pareto Frontier

The Marketplace MAY compute a Pareto frontier among eligible Variants.

A Variant may be hidden from the default choice set when another Variant is equal or better across all material dimensions with adequate confidence.

Dominated Variants remain inspectable in advanced mode.

---

# 693. Metric Confidence

Trade-off metrics SHALL identify:

```text
ESTIMATED
OBSERVED
UNKNOWN
```

with sample size/confidence where meaningful.

Unknown or low-confidence values SHALL NOT be treated as precise numbers.

---

# 694. Structured Solution Explanation

Every automatic selection/rejection SHOULD be explainable from structured evidence:

```text
requirement
capability match
policy result
dependency readiness
certification
preference
cost/capacity
```

LLM-generated prose MAY summarize this evidence but SHALL NOT invent reasons.

---

# 695. Why / Why-Not API

Resolver output SHOULD support:

```text
selected because ...
not selected because ...
would become feasible if ...
material trade-off ...
```

without exposing secrets or protected security logic.

---

# 696. Workflow Bill of Materials (Workflow BOM)

Each promoted Template Version SHOULD have one immutable/exportable BOM snapshot covering direct and transitive:

```text
Templates/Subflows
Skills
Agents/Harnesses
Models
MCP/A2A/ACP dependencies
Runner/Computer Use capabilities
local software
provider endpoints/classes
licenses
publisher/trust
attestation
```

---

# 697. BOM Integrity

The BOM SHOULD have a content hash and MAY be included in the signed Template manifest.

Secrets and user-specific credentials are excluded.

Certification records the BOM hash it tested.

---

# 698. BOM Drift

At run time, if resolved dependencies materially differ from the certified BOM:

```text
compatible drift
→ record + policy handling

material drift
→ revalidation / re-certification / approval as required
```

---

# 699. Feasibility vs Schedulability

Distinct states:

```text
FEASIBLE_READY
FEASIBLE_WAITING_CAPACITY
FEASIBLE_NEEDS_RESERVATION
FEASIBLE_SETUP_REQUIRED
INFEASIBLE
```

A temporary lack of GPU/Runner/provider quota does not make the strategy logically infeasible.

---

# 700. Resource Reservation

Reservation MAY apply to scarce resources such as:

```text
GPU Runner
special local application Runner
provider concurrency slot
rate-limit budget
exclusive browser/session
```

Reservations need TTL/lease, ownership and safe release.

---

# 701. Queue Delay in Variant Choice

Estimated wait time SHOULD be separated from execution latency.

A deadline-aware user MAY prefer a slower-per-run Variant that can start immediately.

---

# 702. Cancellation State Model

Recommended run cancellation states:

```text
CANCEL_REQUESTED
CANCELING
CANCELED
PARTIALLY_CANCELED
COMPENSATION_REQUIRED
COMPENSATING
COMPENSATED
COMPENSATION_FAILED
```

---

# 703. Side-Effect Ledger

Durable execution SHOULD record material committed effects:

```text
effect_id
node_run_id
external target
idempotency key
commit status
compensation capability
evidence
```

This is required to know what cancellation can actually undo.

---

# 704. Compensation Contract

A node MAY declare:

```text
NONE
SAFE_AUTOMATIC
REQUIRES_APPROVAL
MANUAL_ONLY
IMPOSSIBLE
```

Compensation is not equivalent to retry.

---

# 705. Cost Normalization

Variant cost comparison SHOULD distinguish:

```text
Template entitlement/price
platform fee
provider execution cost
external-agent cost
BYO provider cost
Runner/local estimated cost when modeled
```

Unknown is not zero.

---

# 706. Rate-Card Snapshot

Every material estimate SHOULD reference:

```text
rate_card_revision
pricing timestamp
currency
FX snapshot if converted
usage assumptions
uncertainty/range
```

---

# 707. Estimated vs Actual Cost Calibration

After execution, compare:

```text
estimate
actual
variance
cause
```

and use eligible aggregate observations to improve estimators.

---

# 708. Generation Reproducibility Manifest

Every important AI-authored generation/synthesis attempt SHOULD capture:

```text
model/provider revision
model alias resolution if known
sampling parameters
system/builder prompt revision
Requirement Manifest revision
Capability Registry snapshot
resolver policy revision
tool fixtures
environment class
```

---

# 709. Reproducibility Confidence

Classify replay expectation:

```text
DETERMINISTIC
CONTROLLED_NONDETERMINISTIC
APPROXIMATE_LIVE_PROVIDER
NOT_REPRODUCIBLE
```

This prevents false claims that a live provider run can be exactly replayed.

---

# 710. Template Semantic Compatibility Classes

Template change classification SHOULD consider:

```text
input contract
output contract
required dependencies
permissions
egress
side effects
approval
runtime requirements
behavioral semantics
```

Suggested labels:

```text
PATCH_COMPATIBLE
MINOR_COMPATIBLE
MAJOR_BREAKING
SECURITY_SIGNIFICANT
```

---

# 711. Compatibility-Aware Upgrade

Automatic or assisted upgrades SHALL honor parent/subflow compatibility ranges.

A security-significant change may require renewed approval even if schema compatibility remains intact.

---

# 712. Moderation Case State Machine

Recommended:

```text
OPEN
UNDER_REVIEW
ACTION_TAKEN
APPEALED
APPEAL_REVIEW
RESOLVED
CLOSED
```

Cases retain policy revision, reason, evidence references and audit history.

---

# 713. Moderation Appeal

Appeal processing SHOULD avoid exposing reporter identity beyond policy.

For significant disputes, policy MAY require a reviewer different from the initial moderator.

Successful appeal MAY still require re-certification before relisting.

---

# 714. Legal Hold

Retention/deletion system SHALL support lawful legal holds without turning legal hold into a license to retain data the platform was never permitted to store.

Legal hold metadata is access-controlled and audited.

---

# 715. Retention Classes

Define separate retention classes for at least:

```text
reviews
usage analytics
workflow traces
Computer Use screenshots
certification evidence
billing/audit records
moderation evidence
```

---

# 716. Notification Aggregation

High-volume sources SHOULD support:

```text
deduplication
digest
rate limiting
acknowledgment
escalation
```

Critical security/safety events may bypass digest according to policy.

---

# 717. Notification Escalation

Incident escalation SHALL stop when acknowledged/resolved and SHALL avoid leaking unnecessary sensitive data through notification channels.

---

# 718. Experiment Assignment Integrity

Experiments SHALL store:

```text
experiment revision
assignment key/cohort
exposure event
eligible population
primary metrics
safety metrics
exclusion rules
```

Outcome without prior exposure is not counted as experiment evidence.

---

# 719. Experiment Statistical Guardrails

Check where applicable:

```text
sample-ratio mismatch
minimum evidence/confidence
safety regression
inconclusive result
cohort contamination
```

Do not force a winner from insufficient evidence.

---

# 720. Fixture Dataset Registry

Template/benchmark fixtures SHOULD belong to versioned datasets containing:

```text
dataset_id/revision
semantic family
difficulty/edge class
source/provenance
license
PII/secret scan state
generator revision for synthetic data
```

---

# 721. Fixture Contamination Boundary

Fixture data and hidden expected outcomes SHALL remain separated from Builder inputs.

Provider/model memorization or leaked oracle contamination can require fixture retirement.

---

# 722. User Fork Update Channel

User-owned forks SHOULD retain:

```text
source Variant
source Template Version
update preference
pin state
last compared source version
security-update status
```

---

# 723. Semantic Rebase

Updating a fork SHOULD compare:

```text
old source Template
user customizations
new source Template
```

at workflow-semantic level, including capability/approval/data-binding changes.

---

# 724. Fork Security Remediation

A critical source vulnerability MAY notify or require organization-level remediation, but updates that change permissions/egress still obey approval contracts.

---

# 725. Recommendation Feedback

Recommendation-specific feedback such as:

```text
not relevant
prefer another method
too much setup
avoid this provider
```

MAY refine recommendation preferences without affecting global Template ratings.

---

# 726. Recommendation Diversity

Recommendation systems SHOULD avoid feedback loops that permanently hide newly eligible or materially better alternatives.

Cold-start behavior uses relevance, certification and readiness rather than invented user preferences.

---

# 727. Vector Tenant Isolation

Private semantic search SHALL enforce tenant/workspace visibility in the retrieval architecture, not solely as a display-time filter.

Acceptable approaches may include:

```text
physical/namespace separation
filter-before-return guarantees
provider-specific secure partitioning
```

depending on vector technology.

---

# 728. Vector Deletion / Reconciliation

Deleting or moving a private listing SHALL reconcile:

```text
vector embedding
keyword/search document
related-template cache
recommendation candidate cache
```

according to retention/legal-hold policy.

---

# 729. Vector Isolation Security Tests

Security testing SHOULD include semantic probing for:

```text
cross-tenant nearest-neighbor leakage
cross-language leakage
stale deleted embeddings
debug endpoint exposure
cache contamination
```

---

# 730. Degraded-Mode Dependency Classes

Internal services SHOULD be classified:

```text
READ_DEGRADE_ALLOWED
WRITE_DEGRADE_ALLOWED_WITH_BUFFER
FAIL_CLOSED
OPTIONAL
```

Sensitive authorization/policy checks are normally `FAIL_CLOSED`.

---

# 731. Degraded Marketplace UX

When a subsystem is unavailable, UI SHALL state what is stale/unavailable.

Examples:

```text
Recommendations unavailable
Live readiness unavailable
Reviews temporarily unavailable
Search running in limited mode
```

Do not present cached readiness as live evidence.

---

# 732. Durable Buffering During Partial Outage

Non-critical telemetry/index/analytics events MAY be durably buffered while the user workflow proceeds when policy permits.

Recovery SHALL reconcile backlog idempotently.

---

# 733. Revision 13 New Use-Case Families

`UC-2011…UC-2210` add 20 families × 10:

```text
Normative Contract Integrity
Requirement Manifest Lifecycle
User Preference Profile
Variant Pareto / Trade-offs
Solution Explanation
Workflow BOM / Provenance
Resource Reservation / Capacity
Cancellation / Compensation
Cost Normalization / Rate Cards
Nondeterminism / Reproducibility
Template Semantic Compatibility
Moderation Appeals / Disputes
Legal Hold / Retention
Notification Digest / Escalation
Experiment Statistics / Governance
Fixture / Dataset Lifecycle
User Fork Update / Sync
Recommendation / Preference Learning
Vector / Tenant Isolation
Degraded Mode Operations
```

---

# 734. Current Canonical Corpus — Revision 13

Authoritative artifacts:

```text
spec-212-use-cases-2210-bilingual.json
spec-212-marketplace-catalog-2210-bilingual.json
spec-212-corpus-manifest-r13.json
```

Target integrity:

```text
2,210 semantic Use Cases
2,210 unique Thai prompts
2,210 unique English prompts
4,420 canonical TH+EN prompt executions
UC-0001…UC-2210 sequential identities
```

---

# 735. Revision 13 Acceptance Criteria — Contract / Choice

- [ ] Current Contract Index, front matter and manifest agree.
- [ ] Requirement Manifest revisions are versioned and attributable.
- [ ] Preference precedence distinguishes hard policy from soft preference.
- [ ] Variant trade-off presentation does not rely on one opaque score.
- [ ] Pareto/dominance pruning is confidence-aware.
- [ ] Resolver why/why-not explanation comes from structured evidence.

---

# 736. Revision 13 Acceptance Criteria — Runtime / Economics

- [ ] Promoted Template Versions expose a Workflow BOM snapshot.
- [ ] Certified BOM drift is detectable.
- [ ] Feasibility and schedulability are distinct.
- [ ] Scarce resource reservations have leases/TTL and release.
- [ ] Cancellation records committed side effects.
- [ ] Compensation semantics are explicit.
- [ ] Cost estimates use rate-card/currency snapshots.
- [ ] Unknown BYO cost is not treated as zero.
- [ ] Generation reproducibility manifests exist.

---

# 737. Revision 13 Acceptance Criteria — Lifecycle / Governance

- [ ] Template changes have explicit compatibility classes.
- [ ] Breaking/security-significant updates trigger appropriate migration/approval.
- [ ] Moderation appeal state exists.
- [ ] Legal hold integrates with retention/deletion without storing prohibited secrets.
- [ ] Notifications support digest/dedupe/escalation.
- [ ] Experiment assignments/exposures are auditable.
- [ ] Fixture datasets have provenance/license/privacy state.
- [ ] User forks can pin/rebase and receive security-update awareness.

---

# 738. Revision 13 Acceptance Criteria — Recommendation / Isolation / Resilience

- [ ] Explicit and inferred recommendation preferences are distinguishable.
- [ ] Users can reset/disable personalization.
- [ ] Recommendation diversity/cold-start rules exist.
- [ ] Vector retrieval enforces tenant isolation.
- [ ] Deleted private embeddings are reconciled.
- [ ] Cross-tenant semantic probing is tested.
- [ ] Degraded services have fail-open/fail-closed classifications.
- [ ] UI never represents stale readiness as live.
- [ ] Buffered events reconcile idempotently after recovery.
- [ ] 2,210-record corpus manifest validates.

---

# 739. Revision 13 Definition of Done

Revision 13 is complete when SmartAIHub can not only discover and execute many possible methods for a Use Case, but can govern the choice and lifecycle of those methods at scale:

```text
intent
→ versioned requirements
→ policy + preferences
→ eligible Variants
→ explainable trade-offs / Pareto set
→ dependency BOM + capacity
→ cost / certification
→ execution
→ cancellation/compensation when needed
→ long-lived fork/update lifecycle
→ moderated/reviewed Marketplace
→ privacy-isolated discovery
→ degraded-mode safe operation
```

---

# 740. Revision 13 Product Principle

> **As the number of Use Cases and Solution Variants grows, product quality depends less on generating more choices and more on making those choices explainable, comparable, reproducible, schedulable, governable and safe throughout their full lifecycle.**


---

# 741. Revision 14 — Twenty-Pass Distributed Policy & Consistency Hardening

Revision 14 follows another minimum **20-pass audit** of the complete Revision-13 specification and all 2,210 bilingual Use Cases.

The audit found that the product model is already broad, but distributed execution across Templates, agents, Runners, providers, tenants and policy layers still needed stronger contracts in twenty areas.

Revision 14 appends `UC-2211…UC-2410` and hardens the system around:

```text
policy composition
least-privilege grants
service-account delegation
cross-template contracts
Saga/transaction semantics
event delivery/replay
clock/time determinism
quota/budget reservation
billing reconciliation
observability scaling
audit evidence
schema registry
zero-downtime migrations
selective recovery
search/ranking drift
webhook security
concurrency/deadlocks
support delegation
secret rotation
cross-spec compatibility
```

---

# 742. Revision 14 Twenty-Pass Audit Record

| Pass | Focus | Gap found | Correction |
|---:|---|---|---|
| 1 | Policy composition | Policy sources existed but effective inheritance/conflict rules were not explicit enough | Added effective-policy composition, provenance and non-overridable rules |
| 2 | Capability grants | Dependency readiness did not fully define least-privilege secret/grant propagation | Added node-scoped grants, delegated secret refs and revocation behavior |
| 3 | Delegation | User/service-account/support principals needed separate authority chains | Added actor/principal/delegation contracts |
| 4 | Cross-template composition | Composition needed cycle, recursion and boundary-contract enforcement | Added Subflow composition contract and recursion/cycle controls |
| 5 | Distributed side effects | Compensation existed but full Saga/commit-point semantics were incomplete | Added Saga instance, commit/compensation ordering and partial-success rules |
| 6 | Event semantics | Outbox existed but ordering, replay and schema evolution needed stronger rules | Added idempotent delivery, revision fencing and replay-safe consumers |
| 7 | Time semantics | Schedules/leases/relative-time benchmarks needed deterministic clock rules | Added UTC/timezone/event-time/clock-skew contracts |
| 8 | Quota/budget | Cost limits existed but reservation/oversubscription were underdefined | Added credit/provider-quota reservations and ledger separation |
| 9 | Billing reconciliation | Charging/settlement needed late-callback/dispute/reconciliation handling | Added immutable adjustments and evidence-backed reconciliation |
| 10 | Observability scale | Trace detail could create cardinality/cost/privacy issues | Added label discipline, sampling classes and telemetry-budget controls |
| 11 | Audit export | Evidence existed but portable audit packages/chain-of-custody were incomplete | Added signed/hashable audit evidence exports |
| 12 | Schema evolution | Compatibility rules were fragmented across APIs/events/packages | Added central schema registry and compatibility modes |
| 13 | DB migration | Data-model evolution needed explicit zero-downtime procedure | Added expand-migrate-contract/backfill/reconciliation |
| 14 | Backup/restore | DR covered full restore but selective/PITR recovery remained weak | Added selective restore preview and post-restore reconciliation |
| 15 | Search drift | Search benchmarking existed but production drift monitoring needed stronger controls | Added shadow ranking, distribution drift and rollback criteria |
| 16 | Webhook security | Trigger coverage lacked signature/replay/rotation requirements | Added secure webhook ingestion contract |
| 17 | Concurrency | Optimistic locking existed but distributed deadlock/lock-order rules were incomplete | Added fencing, lock-order and structured conflict handling |
| 18 | Support delegation | Tenant support access needed JIT/expiry/impersonation controls | Added privileged support-session governance |
| 19 | Secret lifecycle | Secret references existed but rotation/expiry/queued-run behavior needed specification | Added secret version/rotation/expiry lifecycle |
| 20 | Cross-spec change | Ownership boundaries were clear but revision compatibility needed machine-checkable governance | Added cross-spec compatibility matrix and targeted impact events |

---

# 743. Effective Policy Composition

Execution SHALL resolve one `EffectivePolicySnapshot` from policy sources such as:

```text
platform
tenant
organization
workspace
project
Template/Variant
user
run-specific constraint
```

Each effective rule SHOULD retain:

```text
rule_id
source_scope
revision
precedence
overrideability
decision
reason
```

Hard non-overridable policy always dominates softer preference/configuration.

---

# 744. Policy Conflict Semantics

Policy resolution SHALL distinguish:

```text
ALLOW
DENY
REQUIRE_APPROVAL
LIMIT
PREFERENCE
NOT_APPLICABLE
```

Conflicts SHALL be deterministic and explainable.

A lower-precedence `ALLOW` cannot override a higher-precedence non-overridable `DENY`.

---

# 745. Policy Revalidation

Recompute effective policy when material context changes:

```text
resume after pause
organization policy revision
Variant upgrade
new dependency path
principal/delegation change
data classification change
```

Historical execution evidence retains the prior snapshot.

---

# 746. Least-Privilege Capability Grants

Capability Grants SHOULD be scoped to the minimum practical:

```text
node/subflow
action
resource
tenant/workspace
time window
execution target
```

A workflow-level grant is acceptable only when the underlying capability cannot practically be narrowed further and policy permits it.

---

# 747. Secret Reference Propagation

Secret values remain in the canonical secret store.

Execution receives opaque references/tokens scoped to:

```text
authorized runtime
authorized operation
expiry
resource/account
```

Subflows/external agents do not inherit parent secrets automatically.

---

# 748. Grant Revocation

When a grant/secret is revoked:

```text
not-yet-started node → blocked
active provider call → best-effort cancel according to adapter
future retry → cannot reuse revoked grant
resume → reauthorization required
```

---

# 749. Actor vs Execution Principal

Audit SHALL distinguish:

```text
actor
= human/system that requested the work

execution principal
= identity/service account actually performing external action

approver
= identity approving material side effect
```

These identities MAY differ.

---

# 750. Delegation Chain

Delegated execution SHOULD record:

```text
delegator
delegate/service account
authorized scopes
reason/policy
expiry
approval chain
```

Changing/removing a principal triggers revalidation of scheduled/pending runs.

---

# 751. Support / Admin Impersonation

Privileged support access SHALL use explicit delegated sessions rather than silently becoming the end user.

Suggested controls:

```text
just-in-time access
reason/ticket
expiry
field/action scope
enhanced audit
notification where policy requires
```

---

# 752. Cross-Template Composition Contract

Every Subflow/Template boundary SHALL validate:

```text
input schema
output schema
effect contract
approval contract
privacy/locality
error contract
compatibility range
```

AI-generated adapters remain subject to the same validation.

---

# 753. Template Cycle / Recursion Control

Composition graph SHALL detect accidental cycles.

Intentional recursion requires:

```text
explicit recursive contract
depth/budget bound
termination signal
resource limit
```

---

# 754. Composite Effect Ordering

When composed Templates create multiple external effects, the workflow definition SHALL make ordering/commit semantics explicit.

Do not rely on canvas position alone.

---

# 755. Saga Execution Contract

Distributed multi-system effects SHOULD use Saga-like semantics where atomic transaction is impossible.

Track:

```text
saga_instance_id
step
commit state
idempotency key
compensation contract
compensation state
```

---

# 756. Exactly-Once Claims

SmartAIHub SHALL NOT claim exactly-once external side effects unless the underlying end-to-end contract can actually guarantee it.

Normal distributed semantics are generally:

```text
at-least-once delivery
+
idempotent consumer/action
+
reconciliation
```

---

# 757. Partial Success

Workflow outcome MAY be:

```text
SUCCESS
PARTIAL_SUCCESS
FAILED
COMPENSATED
COMPENSATION_REQUIRED
```

A useful committed result does not always need to be rolled back merely because a later optional action failed.

---

# 758. Event Identity / Ordering

Marketplace/control-plane events SHOULD carry:

```text
event_id
aggregate_id
aggregate_revision or sequence
event_type
schema_version
occurred_at
correlation_id
causation_id
trace_id
```

Consumers reject stale revisions where applicable.

---

# 759. Event Replay Safety

Replay/rebuild mode SHALL prevent unintended:

```text
billing
notifications
creator payout
popularity increments
external effects
```

unless explicitly replaying those domains under controlled reconciliation.

---

# 760. Dead-Letter / Replay Operations

Failed events require:

```text
dead-letter state
failure reason
schema/provider context
safe replay control
audit
```

Replay remains idempotent.

---

# 761. Canonical Time Model

Use UTC for canonical timestamps while preserving timezone context for user-facing schedule semantics.

Distinguish:

```text
event_time
processing_time
scheduled_wall_time
observed_at
```

where material.

---

# 762. Clock Skew / Lease Safety

Client/Runner clocks SHALL NOT be the sole authority for:

```text
billing
lease fencing
distributed locks
security expiry
```

Use authoritative server/service clocks or bounded-skew protocols.

---

# 763. Deterministic Benchmark Clock

Benchmark cases containing relative time SHALL use a controlled clock fixture so:

```text
today
tomorrow
this week
```

do not change semantic expectations when replayed later.

---

# 764. Economic Reservation

Before expensive multi-step execution, economic plane MAY reserve a budget envelope.

Reservation is distinct from final charge.

Track:

```text
reserved
consumed
released
expired
```

---

# 765. Concurrent Budget Safety

Concurrent workflows MUST NOT over-reserve the same credit/budget pool.

Budget reservation requires transactional/fenced allocation in the authoritative economic plane.

---

# 766. Provider Quota Reservation

Where provider concurrency/rate limits are scarce and predictable, scheduler MAY reserve quota/capacity separately from user economic budget.

Status SHOULD distinguish:

```text
ECONOMIC_BUDGET_BLOCKED
PROVIDER_QUOTA_WAIT
RESOURCE_CAPACITY_WAIT
```

---

# 767. Billing Reconciliation

Reconciliation compares:

```text
run evidence
provider usage
provider invoice/callback
SmartAIHub charge
platform fee
creator/tenant attribution
adjustments
```

Missing/duplicate mismatches become explicit reconciliation cases.

---

# 768. Immutable Billing Adjustments

Do not rewrite settled historical transaction evidence.

Corrections SHOULD create:

```text
adjustment
credit
refund
reversal
settlement correction
```

linked to the original transaction.

---

# 769. Billing Dispute Evidence

A dispute package SHOULD identify:

```text
run_id
usage records
pricing snapshot
rate card
FX snapshot where relevant
charge lines
reconciliation result
```

without unnecessarily exposing private run content.

---

# 770. Observability Cardinality Policy

Aggregate metric labels SHALL use bounded-cardinality dimensions.

Identifiers such as:

```text
user_id
workflow_run_id
raw prompt
asset ID
```

belong in traces/logs/event stores, not uncontrolled metric labels.

---

# 771. Sampling Classes

Telemetry sampling SHOULD distinguish:

```text
normal success
rare failure
critical security/economic event
benchmark
bulk/admin
```

Critical audit events governed by retention policy are not dropped by sampling.

---

# 772. Telemetry Cost / Privacy Budget

Observability pipelines SHALL have cost and privacy controls.

Redaction occurs before sending sensitive spans to external observability vendors.

---

# 773. Audit Evidence Package

Audit export MAY include:

```text
manifest
Use Case / Variant / Template versions
Requirement Manifest revision
Workflow BOM
Effective Policy Snapshot
approval evidence
certification
run/side-effect evidence
redaction report
```

---

# 774. Audit Export Integrity

Audit packages SHOULD be content-hashed or signed and include schema/version metadata and chain-of-custody information where relevant.

---

# 775. Schema Registry

Canonical schemas SHOULD be registered/versioned for at least:

```text
Use Case catalog
Variant
Review
Marketplace event
dependency/BOM
execution manifest
audit export
```

---

# 776. Schema Compatibility Modes

Per schema, define intended compatibility:

```text
BACKWARD
FORWARD
FULL
NONE / MIGRATION_REQUIRED
```

Security-critical unknown semantics default to reject where safe interpretation is impossible.

---

# 777. Zero-Downtime Data Migration

Preferred pattern:

```text
EXPAND
→ deploy dual-compatible code
→ BACKFILL
→ validate/reconcile
→ switch reads/writes
→ CONTRACT
```

Backfills are resumable and idempotent.

---

# 778. Migration Consumer Inventory

Do not remove legacy fields/contracts until known consumers are migrated or explicitly expired.

Consumer inventory SHOULD include:

```text
web
Runner
Worker
SDK
API clients
background jobs
external integrations
```

---

# 779. Migration Reconciliation

After migration validate:

```text
record counts
checksums where practical
foreign references
stable pointers
tenant ownership
search/index parity
```

---

# 780. Point-in-Time / Selective Restore

Recovery SHOULD support more than global full restore.

Where architecture permits:

```text
PITR
workspace-scoped restore
metadata-only restore
review/event reconstruction
```

with preview and audit.

---

# 781. Restore Reconciliation

After restore:

```text
reapply retention/legal holds
revalidate cross-subsystem references
rebuild search/vector derived state
recompute derived aggregates
```

Avoid resurrecting data intentionally deleted before the target restore state unless policy/legal hold dictates otherwise.

---

# 782. Search / Ranking Drift Monitoring

Monitor production search quality using:

```text
zero-result rate
reformulation
click/use conversion
offline relevance set
shadow ranker comparison
embedding distribution
locale/category slices
```

---

# 783. Search Revision Rollback

Every significant:

```text
embedding model
index build
reranker
ranking policy
taxonomy migration
```

SHOULD have revision identity and rollback/rebuild plan.

---

# 784. Webhook Security Contract

Inbound webhooks SHALL support where applicable:

```text
signature verification
timestamp/replay window
event ID dedupe
per-integration secret
schema validation
rate limiting
source identity
```

High-risk execution is not exposed through unauthenticated public triggers.

---

# 785. Webhook Rotation / Durable Handoff

Support credential rotation with controlled overlap.

Webhook ingress should acknowledge quickly and hand durable work to canonical job infrastructure rather than executing long workflows inline.

---

# 786. Concurrency / Locking

Prefer:

```text
optimistic concurrency
revision checks
lease/fencing
idempotency
```

over long-held distributed locks.

Never keep a database transaction open across a slow external-provider call.

---

# 787. Lock Ordering / Conflict Errors

Operations needing multiple locks/resources SHALL use deterministic ordering where practical.

Concurrency conflicts become structured retryable/non-retryable results, not opaque server errors.

---

# 788. Secret Version Lifecycle

Secret metadata SHOULD include:

```text
secret_reference_id
version
scope
owner
created
expires
revoked
rotation state
```

Raw values never enter logs/spec artifacts.

---

# 789. Secret Rotation

Rotation MAY use controlled overlap:

```text
old active + new active
→ migrate consumers
→ revoke old
→ cleanup after retention
```

Pending/scheduled workflows revalidate before execution.

---

# 790. Cross-Spec Compatibility Matrix

Spec 212 SHALL track compatibility with shared contracts owned by:

```text
Spec 209
Feature 195
Spec 200
Spec 206
Spec 208
Spec 211
Spec 207 where economic interface changes matter
```

---

# 791. Cross-Spec Change Impact

A shared-contract revision MAY trigger:

```text
adapter conformance tests
affected Variant resolution
targeted certification
migration
deployment block
```

according to compatibility range.

Spec 212 SHALL NOT fork shared infrastructure merely to bypass incompatibility.

---

# 792. Revision 14 New Use-Case Families

`UC-2211…UC-2410` add 20 families × 10:

```text
Policy Composition / Inheritance
Capability Grants / Secret Scope
Delegation / Service Accounts
Cross-Template Composition Contracts
Distributed Saga / Transactions
Event Delivery / Ordering / Replay
Time / Clock Determinism
Quota / Budget Reservation
Billing Reconciliation / Disputes
Observability Cardinality / Sampling
Audit / Evidence Export
Schema Registry / Evolution
Zero-Downtime Migration
Backup / PITR / Selective Restore
Search / Ranking Drift Monitoring
Webhook / Trigger Security
Locking / Deadlock / Concurrency
Multi-Tenant Support Delegation
Secret Rotation / Key Lifecycle
Cross-Spec Compatibility / Change
```

---

# 793. Current Canonical Corpus — Revision 14

Authoritative artifacts:

```text
spec-212-use-cases-2410-bilingual.json
spec-212-marketplace-catalog-2410-bilingual.json
spec-212-corpus-manifest-r14.json
```

Target:

```text
2,410 semantic Use Cases
2,410 unique Thai prompts
2,410 unique English prompts
4,820 canonical TH+EN prompt executions
UC-0001…UC-2410
```

---

# 794. Revision 14 Acceptance Criteria — Policy / Authority

- [ ] Effective policy composition has deterministic precedence and provenance.
- [ ] Lower-scope configuration cannot weaken non-overridable higher policy.
- [ ] Capability Grants are least-privilege and revocable.
- [ ] Secret propagation is explicit and scoped.
- [ ] Actor, approver and execution principal are separately auditable.
- [ ] Support/service-account delegation has expiry/scope.

---

# 795. Revision 14 Acceptance Criteria — Distributed Execution

- [ ] Cross-Template contracts validate schema/effects/approval/privacy.
- [ ] Composition cycles are detected; intentional recursion is bounded.
- [ ] Saga/commit/compensation state is durable.
- [ ] External exactly-once claims are not overstated.
- [ ] Events are idempotent/replay-safe and revision-aware.
- [ ] Relative-time benchmark runs use deterministic clock context.
- [ ] Lease/security expiry does not trust arbitrary client clocks.

---

# 796. Revision 14 Acceptance Criteria — Economics / Operations

- [ ] Economic budget reservation is separate from final charge.
- [ ] Concurrent workflows cannot over-reserve one balance.
- [ ] Provider quota/resource waits have distinct states.
- [ ] Billing reconciliation detects missing/duplicate mismatches.
- [ ] Corrections use immutable adjustments.
- [ ] Metrics avoid unbounded-cardinality labels.
- [ ] Sampling preserves critical/audit evidence.
- [ ] Audit packages are integrity-protected.

---

# 797. Revision 14 Acceptance Criteria — Evolution / Recovery

- [ ] Schemas have registry identities and compatibility policies.
- [ ] Zero-downtime migrations use resumable/idempotent patterns.
- [ ] Legacy contract removal waits for consumer inventory.
- [ ] Selective/PITR restore is reconcilable and audited.
- [ ] Search/ranking revisions are drift-monitored and rollbackable.
- [ ] Webhook ingress is signed/replay-protected where applicable.
- [ ] Concurrency conflicts are structured and fencing-aware.
- [ ] Secret rotation has explicit version/overlap/revocation lifecycle.
- [ ] Cross-spec compatibility is machine-checkable.
- [ ] 2,410-record manifest validates.

---

# 798. Revision 14 Definition of Done

Revision 14 is complete when SmartAIHub can safely coordinate a Marketplace workflow across multiple policies, credentials, Templates, agents, providers and execution nodes while preserving:

```text
least privilege
deterministic authority
idempotent distributed effects
economic correctness
event replay safety
time correctness
migration compatibility
recoverability
tenant isolation
cross-spec ownership
```

---

# 799. Revision 14 Product Principle

> **At Marketplace scale, correctness depends not only on choosing the right workflow, but on composing authority, credentials, time, money, events and distributed side effects consistently across every system that participates in that workflow.**


---

# 800. Revision 15 — Twenty-Pass Lifecycle, Resilience & Operational Hardening

Revision 15 follows another minimum **20-pass audit** of the complete Revision-14 specification and all 2,410 bilingual Use Cases.

This audit focuses on long-term production lifecycle: current-contract usability, ownership succession, dependency retirement, approval expiry, recurring-run drift, agent/session recovery, human handoff, provider health, artifact identity, uninstall impact, entitlement portability, regional failover, emergency controls, configuration rollout, analytics correctness, package trust, model retirement, garbage collection, checkpoint compatibility and operational readiness.

Revision 15 appends `UC-2411…UC-2610`.

---

# 801. Revision 15 Twenty-Pass Audit Record

| Pass | Focus | Gap | Revision 15 correction |
|---:|---|---|---|
| 1 | Current spec usability | Append-only history can cause implementation ambiguity | Added Current Implementation Profile and component compatibility |
| 2 | Ownership | Creator departure/maintainer succession needed stronger lifecycle | Added owner/maintainer succession and maintenance health |
| 3 | Dependency EOL | Announced/effective/hard-stop migration lifecycle was incomplete | Added EOL stages and affected-object dashboard |
| 4 | Approval lifecycle | Expiry/standing/delegated approval rules were incomplete | Added approval TTL, parameter binding, revocation and delegation |
| 5 | Scheduled runs | Recurring jobs can drift from current dependency/policy state | Added per-run drift revalidation and version-follow policies |
| 6 | External agents | Provider-session rebind/orphan cleanup needed explicit contract | Added external-agent session recovery |
| 7 | Human handoff | Queue/SLA/takeover semantics were incomplete | Added durable human-intervention queue |
| 8 | Provider health | Circuit-breaker/brownout behavior was underdefined | Added capability-scoped health and half-open probes |
| 9 | Artifacts | Content-addressed reproducibility needed stronger identity | Added artifact hashes/manifests/immutable replay |
| 10 | Plugin/Skill removal | Uninstall impact was underdefined | Added graceful deprecation and impact analysis |
| 11 | Entitlements | Fork/workspace/export portability needed stronger rules | Added entitlement/license portability semantics |
| 12 | Regional failover | Residency-safe failover/failback needed explicit behavior | Added regional failover and duplicate reconciliation |
| 13 | Incidents | Emergency controls lacked granular scope/expiry | Added kill-switch/rollback/re-enable lifecycle |
| 14 | Feature/config rollout | General config drift/rollout needed stronger governance | Added versioned flags/config snapshots and rollback |
| 15 | Analytics correctness | Late-event/watermark/metric-version handling was incomplete | Added event-time correctness and recomputable aggregates |
| 16 | Package trust | Trust roots/revocation were incomplete | Added signatures, trust roots and revocation |
| 17 | Model/provider retirement | Model-specific replacement quality/cost behavior needed direct coverage | Added retirement migration and re-certification |
| 18 | Garbage collection | Dangling derived resources needed explicit lifecycle | Added tenant-aware GC/tombstones/orphan cleanup |
| 19 | Operational runbooks | Deployed-version runbooks/game days needed ownership | Added versioned runbooks and drills |
| 20 | Checkpoint compatibility | Paused long-running workflows may cross deploy/schema boundaries | Added checkpoint schema/version migration and safe-resume contract |

---

# 802. Current Implementation Profile

Because Spec 212 now contains extensive historical audit material, implementation SHALL consume a concise **Current Implementation Profile** derived from current normative rules.

The profile SHOULD identify:

```text
spec_revision
contract_profile_revision
corpus_version
schema revisions
mandatory contracts
optional/future-extension contracts
companion-spec ownership
minimum compatible revisions
current acceptance/release gates
```

Historical sections remain rationale/audit trail, not competing current contracts.

---

# 803. Contract Profile Compatibility

Critical components SHOULD expose:

```text
component version
supported Spec 212 contract-profile range
supported Workflow schema range
supported corpus schema range
companion-spec compatibility
```

Incompatible critical components fail fast.

---

# 804. Machine-Readable Ownership Matrix

The profile SHOULD encode:

```text
Marketplace / Use Case / Variant UX          → Spec 212
Workflow Definition / Version / workflow.run → Spec 209
durable worker_jobs                          → Feature 195
External Agent Gateway                       → Spec 200
A2A                                          → Spec 206
Computer Use                                 → Spec 208
ACP/runtime fabric                           → Spec 211
billing/economic authority                   → Spec 207
```

---

# 805. Ownership and Maintainer Succession

Current ownership/maintenance MAY change, while historical creator provenance remains immutable.

Store separately:

```text
original_creator
current_owner
maintainers
publisher
economic beneficiary according to policy
```

Critical shared Templates SHOULD have successor/backup maintenance policy.

---

# 806. Maintenance Health

Track separately:

```text
runtime health
certification health
dependency health
maintenance health
```

Suggested maintenance states:

```text
MAINTAINED
MAINTENANCE_REQUIRED
UNMAINTAINED
SUCCESSOR_PENDING
```

---

# 807. Dependency EOL Lifecycle

Model:

```text
announced_at
deprecation_effective_at
new-use cutoff
hard_stop_at
replacement candidates
migration status
```

Use BOM/dependency graphs to identify affected Variants, forks, schedules, certification cells and organizations.

---

# 808. Replacement Migration Guard

Replacement candidates require evaluation of:

```text
capability/schema
privacy/egress
cost
license
quality
permissions
certification
```

Material changes require applicable approval/governance.

---

# 809. Approval Validity Contract

Approval SHOULD include:

```text
scope
material parameter hash
issued_at
expires_at
reuse policy
revocation state
delegation state
```

Before committing a side effect, approval must still be valid and parameters must match.

---

# 810. Standing / Delegated Approval

Bounded standing approval MAY be allowed for a specific recurring workflow, target, amount ceiling, time window and Template/version range.

Delegated approval requires explicit scope and expiry. Timeout is never approval.

---

# 811. Scheduled Run Revalidation

Every scheduled execution SHALL revalidate applicable:

```text
Template/Variant lifecycle
policy/approval
entitlement
secret/session
dependency/capability
budget/rate card
certification
```

---

# 812. Schedule Version / Missed-Run Policy

Schedules SHOULD explicitly choose:

```text
PIN_EXACT_TEMPLATE_VERSION
FOLLOW_COMPATIBLE_UPDATES
FOLLOW_CURRENT_STABLE_WITH_APPROVAL_ON_MATERIAL_CHANGE
```

and a bounded missed-run policy:

```text
SKIP
CATCH_UP_ONCE
CATCH_UP_ALL_WITH_LIMIT
RESCHEDULE_NEXT_ONLY
```

---

# 813. External Agent Session Recovery

Separate:

```text
SmartAIHub agent_task_id
runtime_session_id
provider_session_id
worker_job_id
```

Recovery may use provider resume tokens, SmartAIHub checkpoints, artifact reconciliation, tool-result deduplication or replacement sessions.

Terminal parent executions should clean up orphan sessions where safe.

---

# 814. Human Intervention Queue

Human-required states enter a durable queue carrying:

```text
reason
risk/priority
required role/skill
locale
deadline/expiry
context/evidence refs
resume checkpoint
```

Human edits/takeover are recorded and the Agent re-observes/revalidates before resuming.

---

# 815. Provider Health / Circuit Breaker

Health is capability/path-specific and may consider:

```text
success/error rate
timeout
latency
rate limits
schema/protocol errors
conformance
incident state
```

Suggested circuit states:

```text
CLOSED
OPEN
HALF_OPEN
FORCED_OPEN
FORCED_CLOSED_WITH_EXPIRY
```

Use half-open probes before full routing recovery.

---

# 816. Brownout Behavior

A provider path may receive reduced traffic before full outage.

Pinned provider requests SHALL not silently change strategy; user/policy decides block, wait, ask, or approved fallback.

---

# 817. Artifact Content Identity

Important artifacts SHOULD carry:

```text
asset_ref
artifact_version
content_hash
size
media/file metadata
physical object/version
parent lineage
```

Exact replay/certification pins immutable artifact versions/hashes, not mutable aliases such as "latest".

---

# 818. Artifact Integrity / Reproducibility

Checksum verification MAY occur across upload/download/Runner transfer/object copy/export/import.

Reproducibility bundles can include hashes and metadata without necessarily exporting private bytes.

---

# 819. Plugin / Skill Removal Lifecycle

Separate:

```text
DISABLE
DEPRECATE
UNINSTALL
PURGE_DATA
```

Before removal, analyze affected Templates, Variants, forks, schedules, active runs and user-exportable data.

Historical descriptors needed to interpret old runs remain available.

---

# 820. Entitlement Portability

Entitlements MAY be:

```text
user-bound
workspace-bound
organization-bound
subscription-bound
perpetual
non-exportable
```

Define post-expiry behavior for forks/schedules explicitly and keep Template, dependency and asset licenses separate.

---

# 821. Regional Failover / Failback

Failover SHALL obey:

```text
residency
encryption/key availability
provider availability
dependency certification
artifact placement
network policy
```

Reconcile duplicate work when primary recovers and preserve pinned locality on failback.

---

# 822. Emergency Kill Switch

Distinguish:

```text
BLOCK_NEW_INSTALLS
BLOCK_NEW_RUNS
PAUSE_QUEUED
STOP_ROUTING_TO_DEPENDENCY
CANCEL_ACTIVE_WHERE_SAFE
QUARANTINE_LISTING
ROLLBACK_STABLE_POINTER
```

Every emergency command has scope, reason, actor, start, expiry/review and audit.

---

# 823. Re-Enable Gate

After critical incidents, normal routing/publication MAY require root-cause resolution, dependency health, conformance, targeted certification and policy review.

---

# 824. Feature / Configuration Revision

Material flags/configuration affecting resolver, ranking, fallback, approval or runtime selection SHOULD have revision identity and be captured in Execution Manifest.

Detect material config drift across web/backend/workers/Runner/regions.

Security/policy boundaries cannot be bypassed by ordinary feature flags.

---

# 825. Analytics Event-Time Correctness

Analytics SHALL handle:

```text
late events
duplicate events
corrected events
processing backlog
event-time windows
timezone/reporting windows
```

Dashboards SHOULD expose a freshness watermark.

Metric formulas such as success/popularity/conversion are versioned when changed.

---

# 826. Signed Package Trust

Portable executable Template packages SHOULD support:

```text
content hash
signature
signer/key ID
algorithm
trust root
revocation state
```

A valid signature proves integrity/origin, not safety, policy eligibility or certification.

---

# 827. Trust Root / Key Rotation

Support platform, organization and private-workspace trust roots, key rotation, revocation and historical verification metadata.

---

# 828. Model / Provider Retirement

Catalog state SHOULD include:

```text
deprecated
new-use blocked
migration required
retired
historical-only
```

Replacement evaluation considers capability/tools, schema, modality, quality, cost, latency, privacy and license.

Historical model identifiers remain readable in runs/certification/billing/incidents.

---

# 829. Garbage Collection Contract

GC MAY target:

```text
temporary artifacts
expired drafts
orphan versions
dangling search/vector docs
stale reservations/locks
orphan sessions
```

but SHALL honor run/lineage/certification/legal-hold/audit/shared-storage references.

Use tombstones/revisions where stale-event replay could resurrect deleted state.

---

# 830. Operational Runbook Contract

Critical subsystems SHOULD have versioned runbooks for major failure modes.

Runbook ownership belongs to a role/team, and runbooks SHOULD be exercised through game days rather than documentation alone.

Post-incident review feeds runbook changes, regression tests and monitoring improvements.

---

# 831. Checkpoint Schema Identity

Long-running logical checkpoints SHALL have explicit:

```text
checkpoint_schema_version
Workflow/Template Version
Requirement Manifest revision
runtime/control-plane revision where material
policy snapshot reference
created_at
```

---

# 832. Checkpoint Compatibility

Before resume after deployment/version changes:

```text
checkpoint
→ compatibility check
→ MIGRATE / RESUME / REPLAN_REQUIRED / BLOCKED
```

Never deserialize an incompatible checkpoint and continue silently.

---

# 833. Checkpoint Migration

A migration adapter MAY convert checkpoint state when semantics remain compatible.

Migration itself is versioned/audited and records:

```text
source schema
target schema
migration revision
result
warnings
```

---

# 834. Checkpoint Safe Resume

After checkpoint restore/migration, revalidate:

```text
approval
entitlement
secret/session
policy
dependency
artifact identity
side-effect ledger
```

before continuing material actions.

---

# 835. Checkpoint Retention / Privacy

Checkpoint retention/expiry follows workflow/organization policy.

Do not persist raw credentials/tokens simply to make resume easier.

Old runtime components may be temporarily pinned for non-migratable active work only under explicit support/security policy.

---

# 836. Revision 15 New Use-Case Families

`UC-2411…UC-2610` add 20 families × 10 covering the twenty audit areas above.

---

# 837. Current Canonical Corpus — Revision 15

Authoritative artifacts:

```text
spec-212-use-cases-2610-bilingual.json
spec-212-marketplace-catalog-2610-bilingual.json
spec-212-corpus-manifest-r15.json
```

Target:

```text
2,610 semantic Use Cases
2,610 unique Thai prompts
2,610 unique English prompts
5,220 canonical TH+EN prompt executions
UC-0001…UC-2610
```

---

# 838. Revision 15 Acceptance Criteria — Lifecycle

- [ ] Current Implementation Profile is machine-checkable.
- [ ] Ownership transfer preserves creator provenance.
- [ ] Critical Templates expose maintainer/succession state.
- [ ] Dependency EOL supports announced/effective/hard-stop stages.
- [ ] Approval expiry/revocation/delegation is explicit.
- [ ] Scheduled runs revalidate current dependencies/policy/entitlements.
- [ ] External-agent sessions have recovery/orphan cleanup semantics.
- [ ] Human handoff is durable and timeout is never approval.

---

# 839. Revision 15 Acceptance Criteria — Resilience / Artifacts

- [ ] Provider health supports capability-scoped circuit breakers.
- [ ] Half-open probes precede routing recovery.
- [ ] Critical artifacts have immutable version/hash identity.
- [ ] Replay can pin exact artifact versions.
- [ ] Plugin/Skill removal performs impact analysis.
- [ ] Entitlement portability and fork expiry behavior are explicit.
- [ ] Regional failover obeys residency/certification.
- [ ] Emergency kill switches are granular, auditable and expiring.
- [ ] Re-enable after critical incident can require certification.

---

# 840. Revision 15 Acceptance Criteria — Operations / Checkpoints

- [ ] Material feature/config revisions are traceable per run.
- [ ] Analytics handles late/duplicate/corrected events.
- [ ] Metric definitions are versioned.
- [ ] Package signatures/trust roots/revocation are supported.
- [ ] Signature is distinct from certification.
- [ ] Model/provider retirement has migration states.
- [ ] Garbage collection honors lineage/audit/legal references.
- [ ] Critical subsystems have versioned runbooks and drills.
- [ ] Checkpoints have schema/version identity and migration policy.
- [ ] Resume revalidates approval/policy/secrets/side effects.
- [ ] 2,610-record corpus manifest validates.

---

# 841. Revision 15 Definition of Done

Revision 15 is complete when a shared Workflow/Variant can survive long-term change:

```text
creator leaves
dependency sunsets
approval expires
schedule drifts
agent disconnects
human takes over
provider degrades
artifact moves
Skill is removed
license changes
region fails
incident disables routing
config rolls out
analytics arrives late
signing key rotates
model retires
temporary state accumulates
deployment changes checkpoint schema
```

without losing identity, authority, provenance, auditability or safe recovery.

---

# 842. Revision 15 Product Principle

> **A production Workflow Marketplace is successful not merely when a workflow works today, but when its ownership, dependencies, approvals, checkpoints, artifacts, entitlements and operational controls remain understandable and recoverable as the surrounding ecosystem changes.**


---

# 843. Revision 16 — Twenty-Pass Governance, Trust & Performance Hardening

Revision 16 follows another minimum **20-pass audit** of Revision 15 and all 2,610 bilingual Use Cases.

This audit found twenty remaining areas with direct production value, especially for enterprise governance and large-scale operations:

```text
approval quorum
data classification
tamper-evident audit
access recertification
tenant migration
soft-delete lifecycle
BYOK/key hierarchy
quota forecasting
queue fairness
cache stampede
policy simulation
API/SDK negotiation
dependency version ranges
model behavior drift
human reviewer calibration
release go/no-go
evidence confidence
data portability
purpose limitation
performance/SLO/load shedding
```

Revision 16 appends `UC-2611…UC-2810`.

---

# 844. Revision 16 Twenty-Pass Audit Record

| Pass | Focus | Gap found | Revision 16 correction |
|---:|---|---|---|
| 1 | Approval governance | Single-approval semantics did not cover quorum/four-eyes control | Added quorum, independence, revocation and race rules |
| 2 | Data classification | Privacy existed but classification-label propagation was incomplete | Added classification derivation/provenance/egress coupling |
| 3 | Audit integrity | Audit evidence existed but tamper-evident storage semantics were underdefined | Added append-only/hash-chain/WORM options |
| 4 | Access governance | Grants existed but periodic access recertification was missing | Added access campaigns and dormant privilege review |
| 5 | Tenant lifecycle | Workspace/tenant migration, split and merge were incomplete | Added staged migration and namespace reconciliation |
| 6 | Deletion lifecycle | Hard deletion/GC existed but soft-delete/undelete semantics were incomplete | Added undelete windows and tombstone lifecycle |
| 7 | Encryption | Secret/key rotation existed but BYOK/data-key hierarchy was incomplete | Added customer-managed encryption-key model |
| 8 | Quota planning | Runtime quota handling lacked forecast/adaptive throttling | Added quota forecasting and proactive throttle controls |
| 9 | Scheduler fairness | Fair scheduling existed but starvation/priority inversion needed explicit tests | Added aging, weighted fairness and inversion handling |
| 10 | Cache resilience | Cache consistency existed but stampede/cold-start behavior was underdefined | Added prewarm, single-flight, jitter and stale-read boundaries |
| 11 | Policy rollout | Policy composition existed but what-if/shadow evaluation was missing | Added simulation, shadow policy and impact reports |
| 12 | API/SDK lifecycle | Schema registry existed but client negotiation/sunset governance was incomplete | Added API/SDK capability negotiation and sunset inventory |
| 13 | Dependency resolution | Version compatibility existed but explicit pin/range/diamond conflict behavior was incomplete | Added pin/range lock and conflict semantics |
| 14 | Model drift | Retirement existed but behavior drift before retirement needed stronger detection | Added capability-level drift baselines and targeted quarantine |
| 15 | Human QA | Human review existed but reviewer calibration/disagreement governance was missing | Added calibration/adjudication metrics |
| 16 | Release governance | Release gates existed but formal go/no-go/waiver profile was incomplete | Added release scorecard, hard blockers and waivers |
| 17 | Provenance trust | Evidence existed but confidence/source authority was not first-class enough | Added evidence confidence, freshness and lineage |
| 18 | Portability | Template portability existed but full user/workspace export lifecycle was incomplete | Added account/workspace portable exports |
| 19 | Data minimization | Privacy controls existed but purpose-bound minimization was insufficiently explicit | Added purpose IDs and context-minimization contracts |
| 20 | Performance | Reliability existed but formal SLO/error-budget/load-shedding rules were incomplete | Added percentile SLOs, performance baselines and admission control |

---

# 845. Approval Quorum Contract

High-risk actions MAY require quorum policies such as:

```text
1-of-1
2-of-2
2-of-3
role-separated four-eyes
sequential approval chain
```

Quorum policy SHALL identify approver independence and role constraints where material.

---

# 846. Quorum Validity

Before effect commit:

```text
required quorum satisfied
each approval unexpired
none revoked
approver still authorized
material parameter hash unchanged
independence constraints satisfied
```

A revoked approval can invalidate an otherwise completed quorum before commit.

---

# 847. Data Classification

Recommended classification vocabulary MAY include:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

Organizations MAY extend the labels, but policy must map them to normalized handling rules.

---

# 848. Classification Propagation

Classification SHOULD propagate through:

```text
workflow input
node context
Subflow
derived artifact
trace/evidence
search/index
external-agent context
```

Output classification may be derived from inputs and transformation policy.

---

# 849. Classification / Capability Eligibility

Capability Grants and Runtime Resolver SHALL be able to restrict:

```text
which classifications may leave a boundary
which providers/runtimes may process them
which indexes may store derived metadata
```

---

# 850. Tamper-Evident Audit

Compliance-grade audit trail SHOULD be append-only.

Optional stronger profiles may use:

```text
hash chaining
signed anchors
WORM storage
external notarization
```

Corrections are appended as correction events rather than mutating history.

---

# 851. Audit Integrity Incident

Audit chain/signature failure creates a dedicated security/compliance incident.

Operational logs and immutable audit records remain separate retention classes.

---

# 852. Periodic Access Recertification

Organizations MAY run access-review campaigns by:

```text
role
workspace
capability
service account
privileged Template
```

Decisions are audited and can expire stale grants according to policy.

---

# 853. Tenant / Workspace Migration

Migration SHOULD have:

```text
preflight
object inventory
identity/reference mapping
secret/entitlement handling
vector/search namespace plan
cutover
reconciliation
rollback boundary
lineage
```

Canonical public object identity does not change merely because workspace ownership moves.

---

# 854. Split / Merge Conflict Handling

Workspace split/merge SHALL explicitly resolve:

```text
private listing ownership
collections/aliases
fork ownership
service accounts
scheduled workflows
entitlements
tenant-specific glossary/policy
```

---

# 855. Soft Delete Lifecycle

Distinct states MAY include:

```text
ACTIVE
SOFT_DELETED
PURGE_PENDING
HARD_DELETED
```

Soft delete can preserve recoverability and protected references while hiding ordinary use.

---

# 856. Undelete / Hard Purge

Undelete is valid only within policy/retention bounds.

Hard purge requires dependency/reference checks and tombstones or equivalent anti-resurrection controls where eventual consistency applies.

Revoked credentials are never restored by undelete.

---

# 857. Customer-Managed Encryption Keys

Enterprise profiles MAY support:

```text
platform-managed keys
tenant/customer-managed keys
workspace-scoped data keys
artifact encryption keys
```

Key IDs/versions are metadata; key material remains in approved key-management systems.

---

# 858. Key Hierarchy / Crypto-Shredding

Key hierarchy SHALL distinguish:

```text
encryption keys
signing keys
webhook secrets
OAuth/API credentials
```

Crypto-shredding may be used only when aligned with retention/legal-hold requirements.

---

# 859. Quota Forecasting

Scheduler SHOULD support forecast signals such as:

```text
current consumption
scheduled demand
bulk demand
window reset
provider published limits
observed effective limits
```

This enables proactive throttling before large retry storms.

---

# 860. Adaptive Throttling

Throttle decisions MAY reduce concurrency, defer background work or reserve quota for interactive workloads.

A provider fallback still obeys Variant strategy, privacy and cost policy.

---

# 861. Queue Starvation Prevention

Scheduling SHOULD consider:

```text
priority class
tenant fairness
wait age
resource dependency
retry status
deadline
```

Aging MAY raise long-waiting jobs while hard safety priority remains non-economic.

---

# 862. Priority Inversion

Detect cases where high-priority work waits for scarce resources held by lower-priority work.

Mitigations may include:

```text
priority inheritance
reservation
bounded preemption when safe
resource-class floors/ceilings
```

---

# 863. Cache Stampede Protection

For expensive read computations:

```text
single-flight/request coalescing
TTL jitter
bounded prewarm
stale-while-revalidate where safe
```

may be used.

Security/policy/live readiness decisions SHALL NOT rely on stale caches beyond explicit policy.

---

# 864. Cold-Start Readiness

Test behavior after:

```text
full cache loss
search/index rebuild
service restart
regional failover
```

Prewarming must not starve interactive traffic.

---

# 865. Policy Simulation

Admins SHOULD be able to evaluate candidate policy against:

```text
historical runs
scheduled workflows
Variant eligibility
data-egress paths
approval outcomes
```

without changing production behavior.

---

# 866. Shadow Policy

Shadow policy runs beside current policy and produces only diagnostic decisions.

It SHALL NOT authorize real effects.

A change report can support policy approval/canary rollout.

---

# 867. API / SDK Negotiation

Clients MAY advertise:

```text
API versions
schema versions
feature/capability set
```

Server returns a compatible contract or a structured unsupported-version response.

---

# 868. API Sunset Governance

Deprecation SHOULD include:

```text
announcement
sunset date
migration guide
client inventory
remaining traffic
critical-client block policy
```

API, corpus, model and provider versions remain distinct dimensions.

---

# 869. Dependency Version Constraints

Dependency references SHOULD support:

```text
exact pin
compatible range
certified range
lock/resolved version
```

Resolved concrete versions belong in the Execution Manifest/BOM.

---

# 870. Dependency Conflict Resolution

Detect incompatible constraints including diamond dependency conflicts.

Do not resolve to yanked/revoked versions even when version ranges match.

High-risk Templates may require exact pins.

---

# 871. Model Capability Drift

Continuous or scheduled probes MAY compare current model behavior against baselines for:

```text
structured output
tool calling
multilingual behavior
latency/cost
safety/refusal
media adherence
```

Drift can occur without a public model-name change.

---

# 872. Drift Attribution

Use controlled fixtures to distinguish:

```text
provider/model drift
SmartAIHub prompt/config regression
adapter change
policy change
environment change
```

Severe drift may quarantine only affected capability paths.

---

# 873. Human Reviewer Calibration

Human-evaluated systems SHOULD measure reviewer agreement and guideline drift.

For material disagreement:

```text
adjudicator
third reviewer
calibration review
```

may be required.

---

# 874. Reviewer Decision Provenance

Record:

```text
reviewer role
guideline revision
decision
confidence/notes where applicable
adjudication
```

while respecting workforce privacy and not exposing unnecessary reviewer scoring publicly.

---

# 875. Release Readiness Scorecard

Go/no-go SHALL use explicit gates rather than one opaque score.

Possible gates:

```text
security
migration compatibility
critical benchmark
TH/EN parity
search quality
provider/runtime health
performance/SLO
open critical incidents
```

---

# 876. Release Waiver

Non-critical gates MAY allow time-bounded waivers with:

```text
owner
reason
expiry
mitigation
```

Non-waivable security/policy blockers remain hard stops.

---

# 877. Release Candidate Provenance

Record:

```text
build
spec revision
contract profile
corpus/manifest
models/config
policy revision
test suites
gate results
```

Post-release verification can trigger rollback.

---

# 878. Evidence Confidence

Evidence SHALL distinguish authority/trust states, for example:

```text
DIRECT_VERIFIED
PLATFORM_OBSERVED
PROVIDER_CLAIM
USER_DECLARED
INFERRED
UNKNOWN
```

Confidence/trust is separate from content.

---

# 879. Evidence Freshness / Conflict

Evidence may expire or conflict.

High-risk eligibility SHALL not rely solely on stale or low-confidence evidence.

Conflicting evidence remains visible to resolver/verifier rather than being silently collapsed.

---

# 880. Data / Account Portability

Portable exports MAY include eligible:

```text
user workflows
Personal Variants
settings
reviews
workspace objects according to authorization
lineage/provenance
```

Secrets and non-portable licenses are excluded or represented only by safe references/requirements.

---

# 881. Export Manifest / Import Preview

Large exports use durable jobs and include:

```text
schema versions
checksums
object IDs
provenance
non-portable dependency report
```

Import SHOULD preview ID/conflict mapping before commit.

---

# 882. Purpose Limitation

Sensitive processing SHOULD identify purpose where material.

Data acquired for one purpose SHALL not automatically become eligible for:

```text
training
recommendation
analytics
public indexing
another external provider
```

without policy/consent basis.

---

# 883. Data Minimization

Each node/runtime SHOULD receive only the context reasonably needed for its role.

Examples:

```text
selected Library chunks instead of whole project
scoped AssetRefs instead of full Library
minimum user profile fields
minimum tool result fields
```

---

# 884. Data-Flow Inventory

Maintain a machine-readable view of:

```text
data class
source
destination
purpose
retention
provider/runtime
egress boundary
```

where required for policy/governance.

---

# 885. Performance SLI / SLO

Critical surfaces SHOULD define SLIs/SLOs separately, such as:

```text
Marketplace search latency
Variant resolution latency
workflow-generation latency
run-start latency
job completion reliability
```

Track appropriate percentiles such as p50/p95/p99 instead of average alone.

---

# 886. Error Budget / Rollout Control

Reliability error budgets MAY govern whether risky rollout continues.

An exhausted error budget can block or slow non-essential change until reliability recovers.

---

# 887. Load / Soak Testing

Capacity testing SHOULD include:

```text
load tests
stress tests
soak tests
mixed workload scheduler tests
bulk + interactive concurrency
regional/cold-start recovery
```

Keep release-to-release performance baselines.

---

# 888. Admission Control / Load Shedding

During overload:

```text
admit/queue based on capacity
return actionable backpressure
shed optional recommendation/analytics load
protect core policy/execution paths
```

Do not accept unlimited work merely to time out later.

---

# 889. Current Implementation Profile Artifact

Revision 16 adds a canonical machine-readable artifact:

```text
spec-212-current-contract-profile-r16.json
```

It summarizes current authoritative artifacts, ownership boundaries, mandatory release gates, major schema versions and companion-spec dependencies.

This profile is implementation guidance and MUST stay consistent with front matter and corpus manifest.

---

# 890. Revision 16 New Use-Case Families

`UC-2611…UC-2810` add 20 families × 10 covering the twenty audit areas above.

---

# 891. Current Canonical Corpus — Revision 16

Authoritative artifacts:

```text
spec-212-use-cases-2810-bilingual.json
spec-212-marketplace-catalog-2810-bilingual.json
spec-212-corpus-manifest-r16.json
spec-212-current-contract-profile-r16.json
```

Target integrity:

```text
2,810 semantic Use Cases
2,810 unique Thai prompts
2,810 unique English prompts
5,620 canonical TH+EN prompt executions
UC-0001…UC-2810
```

---

# 892. Revision 16 Acceptance Criteria — Governance / Trust

- [ ] Approval quorum/four-eyes rules are representable.
- [ ] Classification labels propagate through workflow/artifact boundaries.
- [ ] Audit trail can be tamper-evident.
- [ ] Periodic access recertification is supported.
- [ ] Tenant/workspace migration preserves identity/isolation.
- [ ] Soft-delete/undelete/hard-purge semantics are distinct.
- [ ] BYOK/key hierarchy is separable from signing and secret credentials.

---

# 893. Revision 16 Acceptance Criteria — Scheduling / Policy / Compatibility

- [ ] Quota forecasting supports proactive throttling.
- [ ] Scheduler mitigates starvation/priority inversion.
- [ ] Cache stampede controls do not weaken live policy/readiness correctness.
- [ ] Candidate policies can run in simulation/shadow mode.
- [ ] API/SDK versions can negotiate compatibility and sunset cleanly.
- [ ] Dependency pins/ranges resolve to concrete auditable versions.
- [ ] Model behavior drift can trigger targeted re-benchmark/quarantine.

---

# 894. Revision 16 Acceptance Criteria — Quality / Release / Privacy

- [ ] Human reviewer calibration/adjudication is measurable.
- [ ] Release readiness uses explicit go/no-go gates.
- [ ] Evidence trust/confidence/freshness is first-class.
- [ ] User/workspace export portability is manifest-driven.
- [ ] Purpose limitation and data minimization are enforceable.
- [ ] Critical surfaces have SLI/SLO/error-budget/load-shedding contracts.
- [ ] Current Contract Profile matches front matter and manifest.
- [ ] 2,810-record corpus manifest validates.

---

# 895. Revision 16 Definition of Done

Revision 16 is complete when SmartAIHub can govern not only workflow execution but also the organizational and operational context around it:

```text
multiple approvers
classified data
immutable audit
periodic access review
tenant movement
recoverable deletion
customer-managed encryption
forecast quotas
fair scheduling
cache loss
policy what-if analysis
old/new SDK coexistence
dependency version conflict
silent provider model drift
human-review disagreement
production release gates
uncertain evidence
user data portability
purpose-bound data handling
overload/performance failure
```

without losing determinism, least privilege, explainability, isolation or operational control.

---

# 896. Revision 16 Product Principle

> **Once a Workflow Marketplace becomes infrastructure, the remaining gaps are rarely about whether a workflow can run. They are about whether authority, evidence, data, compatibility, capacity and release decisions remain trustworthy under organizational scale and operational stress.**


---

# 897. Revision 17 — Canonical Node-Type / Runtime Ownership Alignment

Revision 17 merges the former cross-spec alignment addendum directly into Spec 212 so implementers need one canonical Spec 212 document rather than a base spec plus patch files.

Revision 17 does **not** add or renumber Use Cases. The canonical corpus remains:

```text
UC-0001…UC-2810
2,810 semantic Use Case identities
TH + EN required
5,620 canonical prompt executions
```

The purpose of Revision 17 is architectural normalization: every accepted workflow design MUST be authorable through Spec 209, resolvable to real Spec 214 Node Types/capabilities, compilable/executable through Spec 215 and independently verifiable by Spec 212.

---

# 898. Revision 17 Canonical Cross-Spec Ownership

| Concern | Canonical owner | Revision 17 rule |
|---|---|---|
| Workflow Studio / Canvas / conversational AI Builder / change preview | Spec 209 | User-facing authoring and run-control façade |
| Use Case catalog / Solution Variants / Marketplace / Capability Lab / certification | Spec 212 | Product and independent validation plane |
| Canonical Node Type taxonomy / manifest / registry / aliases / presets | Spec 214 | Sole semantic Node Type owner |
| WorkflowDefinition execution normalization / compiler / immutable ExecutionPlan | Spec 215 | Sole compiler owner |
| WorkflowRun / NodeRun / NodeAttempt logical runtime semantics | Spec 215 | Logical execution owner |
| Durable physical worker job lifecycle | Feature 195 | `worker_jobs` remains physical durable job source of truth |
| External Agent Gateway | Spec 200 | Bound through `ai.agent` |
| A2A interoperability | Spec 206 | Protocol adapter, not a core Node Type |
| Computer Use | Spec 208 | Bound through `automation.computer_use` |
| ACP/runtime fabric | Spec 211 | Runtime/protocol path, not a core Node Type |
| Billing/economic authority | Spec 207 | Live economic authorization and accounting |

No implementation MAY create a duplicate Node Registry, compiler, logical run store, durable job store or Runner control plane to satisfy Spec 212.

---

# 899. Revision 17 Canonical Validation Path

```text
Natural-language Use Case / selected Solution Variant
  ↓
Spec 209 AI Builder / Workflow Studio
  ↓
Spec 214 Node Registry / NodeTypeManifest discovery
  ↓
WorkflowDefinition containing real typeId + version references
  ↓
Spec 215 compiler / static validation
  ↓
Immutable ExecutionPlan
  ↓
Capability + placement + protocol + live-policy resolution
  ↓
Spec 215 logical runtime
  ↓
Feature 195 worker_jobs / Server / Browser / Runner / Cloud / External adapters
  ↓
Evidence + artifacts + side-effect receipts + verification
  ↓
Spec 212 grading / certification / regression / release gate
```

Failure at any stage MUST be attributed to the canonical owner rather than papered over with a test-only workaround.

---

# 900. Revision 17 — Spec 214 Node Reality Baseline

Spec 212 SHALL recognize the following 19 canonical executable semantic Node Types from Spec 214 v3 as the current baseline:

```text
core.trigger
core.input
data.transform
ai.model
ai.agent
core.capability
data.retrieval
flow.subflow
flow.router
flow.parallel
flow.join
flow.loop
human.approval
human.input
flow.wait
automation.computer_use
data.artifact
quality.verifier
core.output
```

This is a semantic taxonomy, not a product/provider catalog.

Examples that MUST normally be represented as capability/config/runtime bindings rather than new core Node Types include Gmail/Slack/CRM/Shopify, HTTP/MCP/Skills, specific model providers, external harness brands, A2A/ACP protocol choices and media engines such as FFmpeg/ComfyUI.

Spec 212 SHALL fail a graph containing an unknown executable semantic type as `HALLUCINATED_NODE` unless that type has passed the Spec 214 Node-Type Admission Test and is present in the pinned registry snapshot.

---

# 901. Revision 17 — Anti-Duplication and Gap Attribution Rule

A newly discovered Spec 212 coverage gap MUST NOT automatically create a new Node Type.

The resolver/design review MUST evaluate in this order:

```text
1. Can an existing registered capability satisfy the requirement?
2. Can an existing Node Type gain a mode/profile/config/schema extension without changing stable semantics?
3. Can existing Node Types be composed to satisfy the requirement?
4. Is the gap actually runtime/adapter/permission/policy/verifier/environment related?
5. Only then: propose a new canonical Node Type under Spec 214 admission rules.
```

Gap classification SHOULD use at least:

```text
MISSING_NODE_TYPE
MISSING_CAPABILITY
MISSING_RUNTIME_ADAPTER
MISSING_PERMISSION
MISSING_APPROVAL
MISSING_VERIFIER
SCHEMA_MISMATCH
UNSUPPORTED_EXECUTION_SEMANTICS
POLICY_BLOCKED
ENVIRONMENT_BLOCKED
```

---

# 902. Revision 17 — Use-Case Coverage Contract

The canonical coverage artifact is `spec-214-spec212-coverage-manifest-r16.json`. The `r16` suffix reflects the unchanged 2,810-case corpus identity; Revision 17 changes architecture ownership but does not mutate those Use Case identities.

Coverage SHALL be semantic, not exact-graph equality. Every canonical Use Case at its required test level MUST demonstrate that Spec 209 can author it, each executable node resolves to a real Spec 214 type/version, required capabilities and runtimes resolve or fail explicitly, Spec 215 compiles/runs without test-only semantics, live policy/permission/approval/entitlement/billing controls occur before material side effects, expected evidence can be produced, and unsupported paths are attributed to the correct canonical owner.

Multiple valid graphs remain allowed.

---

# 903. Revision 17 — Spec 214 / Spec 215 Handshake Contract

Spec 214 declares **what a Node Type is and what execution properties it requires**. Spec 215 declares **how those requirements are compiled and realized**.

The handshake MUST preserve at least:

```text
typeId + exact/resolved typeVersion
port contracts and schemas
config schema + normalized config
runtime/capability requirements
execution semantics declaration
security / permission / data-governance requirements
effect classification
version/migration metadata
AI Builder discovery metadata
```

Spec 215 MUST NOT invent semantic Node Types during compilation. Spec 214 MUST NOT own scheduler state, NodeRun/NodeAttempt state, leases, durable checkpoint persistence, DLQ or disaster recovery implementation.

---

# 904. Revision 17 — Workflow Studio / AI Builder Smoothness Requirements

To keep Spec 209 Workflow Studio / AI Builder usable across all Spec 212 Use Cases:

- AI Builder SHALL discover Node Types through the Spec 214 machine-readable registry rather than a hard-coded prompt list.
- Retrieval SHOULD use compact capability/type indexes and fetch full manifests only for candidate nodes.
- Presets MAY present product-friendly names while resolving to canonical semantic types.
- Alias resolution MUST be deterministic and migration-aware.
- The UI SHALL not require ordinary users to understand protocol/provider distinctions when capability resolution can handle them.
- Advanced users MAY inspect pinned type/version/capability/runtime details.
- Validation feedback from Spec 215 MUST map back to authoring concepts understandable by Spec 209.
- Spec 212 gap evidence SHOULD be consumable by AI Builder improvement tooling without becoming an alternate registry.

---

# 905. Revision 17 — Release Gates for 209 / 214 / 215 Alignment

A release that changes Spec 209, 214 or 215 MUST run affected Spec 212 regression slices and SHALL fail release when any critical condition below is true:

- AI Builder generates an executable semantic type absent from the pinned Spec 214 registry;
- a previously valid Node Type becomes uncompilable without a declared migration;
- Spec 215 silently coerces an incompatible port/config contract;
- a runtime adapter exists but cannot satisfy declared execution/security semantics;
- live policy/approval/entitlement checks are bypassed by replay/resume;
- a provider/product change is incorrectly modeled as a new core Node Type without passing admission rules;
- Feature 195 and Spec 215 disagree on physical job identity or terminal state reconciliation;
- TH/EN semantic parity regresses for a critical Use Case;
- coverage manifest and canonical Spec 212 corpus identity disagree;
- current contract profile points to superseded ownership.

---

# 906. Revision 17 Acceptance Criteria

- [ ] Spec 212 front matter and Current Contract Index identify Specs 209/214/215 with non-overlapping ownership.
- [ ] Historical pre-split ownership language is explicitly non-authoritative.
- [ ] Spec 214 v3 is the sole canonical Node Type contract owner.
- [ ] Spec 215 v1 is the sole canonical compiler/logical runtime owner.
- [ ] Feature 195 remains the durable physical `worker_jobs` owner.
- [ ] The 19 canonical Node Types are recognized as the current semantic baseline.
- [ ] New Node Types require the Spec 214 admission process; use-case gaps do not automatically create types.
- [ ] All 2,810 Use Cases remain identity-compatible with Revision 16 corpus artifacts.
- [ ] Coverage accepts multiple valid graphs while requiring node/capability/runtime reality.
- [ ] Gap attribution distinguishes node, capability, runtime, policy, permission, approval, verifier, schema and environment causes.
- [ ] Spec 209 AI Builder can discover and explain Spec 214 contracts without provider-specific hard coding.
- [ ] Spec 215 consumes Spec 214 contracts without inventing semantic types.
- [ ] Regression/release gates validate the complete 212 → 209 → 214 → 215 → runtime → 212 loop.

---

# 907. Revision 17 Definition of Done

Revision 17 is complete when implementation teams can work from this one canonical Spec 212 document and unambiguously answer:

```text
Where does the use case / template requirement live?          → Spec 212
Where does the user author or ask AI to build it?             → Spec 209
Which semantic Node Types are legal and what do they declare? → Spec 214
How is the graph compiled, run, retried and recovered?        → Spec 215
Where is durable physical async-job truth?                    → Feature 195
How is success/certification/regression proven?               → Spec 212
```

No separate alignment addendum is required after Revision 17 adoption.

---

# 908. Revision 17 Product Principle

> **Spec 212 defines what SmartAIHub must be able to solve and prove; Spec 209 defines how users and AI author the workflow; Spec 214 defines the stable semantic building blocks; Spec 215 defines how those building blocks become reliable execution. The system is complete only when all four layers agree end-to-end.**
---

# 909. Revision 18 — Clean-Slate Node / Runtime Alignment

Revision 18 supersedes Revision 17 only for the **Node Type baseline and workflow-construct boundary**. It does not add, delete or renumber Use Cases.

Canonical corpus remains:

```text
UC-0001 … UC-2810
2,810 semantic Use Cases
TH + EN required
5,620 canonical prompt executions
```

The implementation reality audit considered all 112 previously implemented `nodeType` names and found that many of them were not stable semantic nodes at all. They mixed:

```text
semantic nodes
presets
workflow I/O
context/secret bindings
runtime policies
instrumentation
control-plane APIs
browser/agent runtime primitives
platform billing internals
Studio-only UI
```

Revision 18 therefore adopts Spec 214 v4 / Spec 215 v2 as a clean-slate contract.

---

# 910. Revision 18 Canonical Node Baseline

Spec 212 SHALL recognize these **16 canonical semantic Node Types** as the current core baseline:

```text
core.trigger
data.transform
ai.model
ai.agent
core.capability
data.retrieval
flow.subflow
flow.router
flow.join
flow.loop
human.approval
human.input
flow.wait
automation.computer_use
data.artifact
quality.verifier
```

The following are no longer Node Types:

```text
Workflow input/output       -> WorkflowInterface
Context/config/secret       -> WorkflowBinding family
Static parallel fan-out     -> graph readiness + ConcurrencyScope
Retry/checkpoint/budget     -> PolicyAttachment
Error handler/transaction   -> ExecutionScope
Trace/log/metric/run-status -> InstrumentationAttachment
```

Spec 212 validation MUST accept these as real workflow constructs even though they are not Node Types.

---

# 911. Revision 18 — Node Reality Validation

A generated workflow is valid only when every authored executable node resolves to:

```text
one of the 16 core Spec 214 v4 types
OR
an extension type that passed the Spec 214 admission test
```

Spec 212 SHALL NOT require a Node Type merely because a historical implementation had one.

Examples:

```text
manual-input     -> WorkflowInterface, not node
parallel         -> ConcurrencyScope / graph fan-out, not node
retry            -> RetryPolicyAttachment, not node
secret-reference -> SecretBinding, not node
trace-event      -> InstrumentationAttachment, not node
browser_action   -> Computer Use runtime primitive, not node
```

Unknown new executable semantic type remains `HALLUCINATED_NODE`.

A missing non-node construct must be attributed separately, e.g. `MISSING_WORKFLOW_CONSTRUCT`, `MISSING_POLICY` or `MISSING_BINDING_KIND`.

---

# 912. Revision 18 — 112 Implemented-Type Disposition Evidence

Canonical evidence artifact:

```text
spec-214-112-nodeType-clean-slate-disposition.json
```

The artifact MUST account for all 112 previously implemented names.

It is **not** a migration map. There are no persisted workflows requiring these identifiers to survive.

Release validation SHALL fail if a new WorkflowDefinition uses any removed pre-canonical ID merely because old code still exists.

Reusable implementation code MAY remain behind new adapters.

---

# 913. Revision 18 — Workflow Interface / Binding Coverage

Spec 212 cases involving any of the following SHALL be considered supported through Spec 215 constructs rather than requiring dedicated Node Types:

```text
manual/form invocation inputs
file/Library/ArtifactRef inputs
tenant/user/project/workspace context
config values
secret references
previous-run values
typed final outputs
```

The Capability Lab MUST verify schema, authorization, freshness and replay behavior of these constructs.

---

# 914. Revision 18 — Parallelism / Policy / Instrumentation Coverage

Spec 212 cases involving:

```text
parallel/fan-out
retry
timeout
checkpoint
cache
budget/quota guard
fallback/circuit breaker
trace
log
metric
run-status
error boundary
transaction/saga
```

MUST validate the corresponding Spec 215 scope/policy/instrumentation contracts rather than demand synthetic nodes.

Business-semantic loops and human decisions remain explicit Spec 214 nodes.

---

# 915. Revision 18 — Updated Coverage Manifest

Canonical cross-spec coverage artifact:

```text
spec-214-spec212-coverage-manifest-r18.json
```

It SHALL declare:

```text
16 canonical Node Types
first-class non-node workflow constructs
all 261 Spec 212 categories
2,810 Use Cases
5,620 TH/EN canonical executions
clean-slate rejection of the 112 removed IDs
```

Multiple valid graphs remain allowed.

---

# 916. Revision 18 Acceptance Criteria

- [ ] Spec 214 v4 is the canonical Node Type owner.
- [ ] Spec 215 v2 is the canonical WorkflowDefinition/compiler/runtime owner.
- [ ] The canonical baseline contains 16 core semantic Node Types.
- [ ] Input/output/context/secret/policy/instrumentation concerns are not misclassified as nodes.
- [ ] Static parallel fan-out does not require a fork node.
- [ ] Every one of the 112 old IDs has an explicit clean-slate disposition.
- [ ] New workflows reject removed old IDs.
- [ ] The 2,810-case corpus can attribute missing node vs missing binding/policy/scope/runtime correctly.
- [ ] TH/EN workflow generation tests use the same semantic architecture.
- [ ] Feature 195 remains the physical durable job source of truth.

---

# 917. Revision 18 Definition of Done

Revision 18 is complete when Spec 212 can test the whole SmartAIHub workflow system without forcing runtime policies, bindings, interfaces or control-plane operations into the Node Type registry, while preserving full use-case coverage and independent execution verification.

---

# 918. Revision 18 Product Principle

> **A smaller semantic node vocabulary is more complete when the rest of the workflow model has first-class contracts for the things that are not actually nodes.**

# 919. Revision 19 — Flow-to-Mini-App Productization and Monetization

Revision 19 makes Mini App generation/publication/economics a current canonical Spec 212 product requirement rather than relying on historical Spec 209 sections alone.

It appends 20 semantic Use Cases:

```text
UC-2811 … UC-2830
category = MINI_APP_PRODUCTIZATION_MONETIZATION
```

Canonical corpus becomes **2,830 Use Cases / 5,660 TH+EN prompt executions**.

---

# 920. Mini App Product Boundary

A Mini App is a consumer-facing presentation/access/economic product around an immutable Workflow Version. It is not a second workflow engine.

```text
Workflow Version
  ↓
WorkflowInterface + interaction semantics
  ↓
Spec 209 Mini App projection / UI generation
  ↓
MiniAppDefinition / publication snapshot
  ↓
Spec 207 quote / authorization when paid
  ↓
Spec 215 canonical WorkflowRun
  ↓
Result / artifacts / settlement evidence
```

Spec 212 validates the product and Marketplace behavior; it SHALL NOT introduce a duplicate Mini App runtime or ledger.

---

# 921. Canonical Cross-Spec Mini App Ownership

| Concern | Owner | Rule |
|---|---|---|
| Flow/Workflow authoring + Mini App Builder/preview/publish UX | Spec 209 | UI/productization surface |
| Node semantic presentation/interaction hints | Spec 214 v5 | advisory typed metadata, no hidden runtime semantics |
| Workflow execution/progress/human-task/finality | Spec 215 v3 | same WorkflowRun used by all surfaces |
| Use Case/Marketplace/certification/public listing requirements | Spec 212 | product/validation plane |
| Quote/reserve/charge/revenue allocation/ledger/settlement | Spec 207 | sole economic authority |
| Durable physical async work | Feature 195 | `worker_jobs` |

---

# 922. Admin Public Mini App Authority

Authorized Admin roles SHALL be able to create an eligible Mini App from a Workflow Version and publish it for public user consumption after mandatory preflight.

Admin publication MAY create a platform-owned public Mini App. Admin MAY set approved listing metadata, difficulty/fee policy, rollout channel and abuse limits.

Admin status MUST NOT bypass dependency rights, security, economic authorization, tenancy or audit requirements.

---

# 923. User Submission for Public Approval

A non-admin user may create Private/Workspace/Shared Mini Apps according to permissions. Public Marketplace availability requires approval.

```text
User-owned Mini App
  ↓
submit for public approval
  ↓
automated validation/certification
  ↓
Admin review
  ├─ changes requested
  ├─ rejected
  └─ approved
       ↓
immutable public publication snapshot
```

The submitter SHALL NOT approve the same submission unless they independently hold an authorized Admin role and platform policy explicitly permits that combination. Audit SHALL record submitter, reviewer, decision and exact snapshot.

---

# 924. Mini App UI Generation Requirement

Spec 212 certification SHALL verify that Spec 209 can project a Workflow into consumer UI without one-screen-per-node behavior.

Required projection sources:

```text
WorkflowInterface.inputs -> initial input UI
human.approval           -> approval interaction
human.input              -> typed mid-run interaction
run state                 -> understandable progress stages
Workflow outputs/artifacts-> result renderers
recoverable states        -> safe retry/resume/refine actions
```

Execution-only graph internals SHOULD remain invisible to ordinary consumers.

---

# 925. Mini App Economic Model

For consumer-funded paid public Mini Apps, the quote SHALL distinguish:

```text
1. workflow execution usage
2. Mini App usage fee
3. known/unknown external pass-through charges where applicable
```

The Mini App usage fee is an additional product fee associated with the exact Mini App Version. It SHALL NOT be disguised as provider/model/Skill usage.

---

# 926. Difficulty-Based Mini App Fee

A public Mini App MAY be assigned a difficulty tier linked to a versioned fee schedule.

The tier SHOULD consider expected compute/resource envelope, long-running execution, media/artifact production, external capabilities, human interactions, expected duration and operational risk. Raw node count alone is insufficient.

The system MAY recommend a tier, but public billable pricing is governed by Admin/platform economic policy and Spec 207.

---

# 927. User-Owned Public Mini App Revenue Split

For a user-owned Mini App approved for public use, the **Mini App usage fee** SHALL be allocated between exactly:

```text
Platform
Mini App Owner
```

Default current SmartAIHub creator-program policy:

```text
Platform        50%
Mini App Owner  50%
```

The percentages MUST be represented as versioned economic policy rather than hard-coded into WorkflowDefinition. Platform policy MAY introduce a different approved split later.

The split applies only to the Mini App usage fee. Underlying capability/provider/Skill/runtime costs retain their own Spec 207 accounting and SHALL NOT be double-counted as Mini App owner revenue.

---

# 928. Platform-Owned Public Mini App Revenue

When Admin publishes a platform-owned Mini App without an external creator owner, its Mini App usage fee MAY allocate 100% to Platform.

The system SHALL NOT invent a fake creator recipient solely to force a two-party record.

---

# 929. Pre-Run Quote and Credit Authorization

Every paid run SHALL obtain the required Spec 207 quote/authorization before material execution.

Consumer UI SHOULD show:

```text
estimated workflow usage/range
Mini App fee
difficulty tier or pricing basis
known fixed charges
unknown external-cost warning where applicable
quote expiry
```

Revenue-share internals need not expose private commercial terms unless product policy requires them, but the user MUST understand the total expected credit impact.

---

# 930. Run Finality / Refund / Reconciliation

Spec 212 tests SHALL verify that reservation is not treated as final creator revenue.

At minimum:

```text
pre-execution rejection -> release reservation
platform failure before material execution -> release Mini App fee
success -> settle according to publication economic policy
user cancellation after incurred work -> actual usage according to policy
unknown external outcome -> hold/reconcile, never fake success
```

Historical settlement SHALL remain attributable to exact Mini App and Workflow versions.

---

# 931. Public Mini App Security / Privacy

Public run permission MUST remain independent from:

```text
workflow graph visibility
internal prompt visibility
creator credential visibility
secret visibility
debug trace visibility
private capability configuration
```

Mini App inputs SHALL be validated against published schemas and MUST NOT be able to inject hidden Node config, bindings, policies, runtime strategy or authorization.

---

# 932. Publication Certification Gate

Before a public Mini App version becomes invocable, validation SHALL cover at least:

```text
workflow/version identity
MiniAppDefinition validity
input/output/interaction projection
dependency availability and rights
required connections/permissions
side-effect disclosure
security/privacy scan
credit quote capability
Mini App fee policy
revenue allocation policy
rate/concurrency/abuse limits
run E2E verification
result/finality/settlement evidence
```

User-owned submissions MUST also validate owner eligibility and Admin approval evidence.

---

# 933. Versioning / Canary / Rollback / Suspension

Public Mini App publication SHALL be immutable by version and MAY expose channels such as stable/canary.

A rollout or rollback changes which version receives **new invocations**; it MUST NOT rewrite historical WorkflowRuns, quotes, fees, allocations or creator-revenue records.

Admin suspension SHALL block new public runs while retaining audit, billing and historical creator revenue evidence.

---

# 934. Mini App Product Analytics

Spec 212 Marketplace analytics SHOULD distinguish operational usage from creator economics, including run starts/success/failure, execution credits, Mini App fee, Platform share, Owner share, reservation releases/refunds, latency, repeat usage and review signals.

Publisher analytics SHALL respect consumer privacy and default to aggregate information unless the consumer data contract explicitly permits more.

---

# 935. Revision 19 New Canonical Use-Case Family

`UC-2811…UC-2830` form the `MINI_APP_PRODUCTIZATION_MONETIZATION` family and SHALL participate in the same Design → Compile → Resolve → Execute → Verify grading pipeline as all other Spec 212 cases.

A release SHALL fail when Mini App UI looks plausible but the app cannot resolve to a real Workflow Version, canonical Spec 214 contracts, Spec 215 execution path or Spec 207 economic authorization.

---

# 936. Revision 19 Acceptance Criteria

- [ ] Canonical corpus contains UC-0001…UC-2830 with TH/EN parity.
- [ ] Spec 209 R6 owns Flow→Mini App Builder/projection/publication UX.
- [ ] Spec 214 v5 provides typed presentation/interaction hints without adding Mini App-specific semantic nodes.
- [ ] Spec 215 v3 uses one WorkflowRun path for Mini App/Studio/API.
- [ ] Admin can publish platform-owned public Mini Apps after preflight.
- [ ] User owners submit public Mini Apps for Admin approval.
- [ ] Consumer quote separates execution usage from Mini App usage fee.
- [ ] Public Mini App difficulty/fee policy is versioned.
- [ ] User-owned public Mini App fee supports the Platform/Owner two-party split.
- [ ] Default creator-program split is 50/50 unless platform economic policy changes it.
- [ ] Platform-owned Mini App fee can allocate 100% to Platform.
- [ ] Underlying runtime/provider/Skill costs are not double-counted into creator revenue.
- [ ] Failed/unknown runs settle/release safely rather than generating false creator revenue.
- [ ] Public visibility does not expose graph/prompts/secrets/creator credentials.
- [ ] Staged rollout/rollback/suspension preserves historical execution and billing identity.
- [ ] Mini App monetization remains under Spec 207; no duplicate ledger exists.

---

# 937. Revision 19 Definition of Done

Revision 19 is complete when a Workflow can become a usable public Mini App through a deterministic/AI-customizable UI projection, Admin-controlled publication lifecycle and transparent per-run credit economics, while all execution continues through Spec 215 and all money continues through Spec 207.

---

# 938. Revision 19 Product Principle

> **A Workflow becomes a product when users can run it through a simple Mini App, understand the expected credit impact, trust its permissions and results, and—when a creator contributes the product—revenue can be attributed transparently without duplicating execution cost or platform accounting.**

# Revision 20 — Specs 217–222 AI Product Platform Validation Expansion

## 939. Revision 20 Decision

Revision 20 extends the canonical black-box corpus from 2,830 to **2,930** use cases.

New canonical range:

```text
UC-2831…UC-2850  TENANT_WHITE_LABEL_PRODUCT_PLATFORM
UC-2851…UC-2870  AGENTIC_PRODUCT_DEVELOPMENT
UC-2871…UC-2885  MANAGED_RUNTIME_DEPLOYMENT
UC-2886…UC-2900  TENANT_DATA_CAPABILITY_SECURITY
UC-2901…UC-2915  SKILL_PRODUCT_CAPABILITY_LOOP
UC-2916…UC-2930  AGENTIC_CONTEXT_HARNESS_SECURITY
```

Thai and English are localizations of the same semantic identity, not separate use cases.

Canonical executions for mandatory TH+EN parity:

```text
2,930 × 2 = 5,860
```

## 940. Companion Architecture Under Test

Revision 20 expands Spec 212 release validation to the following companion chain:

```text
Spec 216   Flow → Mini App base projection
Spec 217   Tenant / Brand / Product / White-label / Product Shell
Spec 218   DevelopmentJob / Runner / Git / build / preview
Spec 219   Runtime / deployment / domain / Cloudflare fabric
Spec 220   Data / Asset / Capability / security gateway
Spec 221   Runtime Skill engineering / eval / publication
Spec 222   Agentic development context / harness / Superpowers bridge
Spec 207   Economic authority
Spec 215   Workflow execution authority
Feature 195 durable physical jobs
```

Spec 212 remains the validation/certification plane and MUST NOT implement these systems itself.

## 941. No New Canonical Node Types

Revision 20 does **not** add a Workflow Node Type.

The new cases primarily exercise:

```text
Product/Tenant control plane
development control plane
release/deployment control plane
gateway/security
Skill lifecycle
engineering context/harness behavior
```

Where workflows are involved, they continue to use Spec 214 canonical node contracts and Spec 215 execution.

A failing Revision 20 case MUST NOT automatically cause creation of a new node type; gap attribution SHALL identify the actual owning subsystem.

## 942. Required Validation Dimensions

The new use-case families SHALL be evaluated across appropriate combinations of:

- Tenant Admin / Creator / Enterprise Admin / end-user roles;
- subdomain and custom-domain routes;
- Native vs Custom/Hybrid Mini Apps;
- local Runner vs managed development target;
- available/unavailable Claude/Codex/Antigravity/Hermes/future harness;
- Superpowers present/absent/version changed;
- healthy/deprecated/revoked Runtime Skill dependencies;
- managed vs BYOC runtime;
- staging vs production;
- Thai/English UI and instruction contexts;
- normal/failure/retry/cancel/rollback/offboarding paths.

Not every case requires every matrix dimension; the test planner SHALL select the relevant set and record it.

## 943. Release-Critical Assertions

A release SHALL fail when any critical test demonstrates that:

- Tenant/Product isolation can be bypassed;
- custom-domain routing is treated as authentication;
- coding agents can obtain direct Core SQL/R2/provider/deployment credentials;
- a Product can bypass release governance through Git/Runner/BYOC;
- Skill revocation can be bypassed by Product rollback/floating dependencies;
- one execution is double-charged across Skill/Mini App/Product economic layers;
- a Runtime Skill is conflated with a harness engineering skill;
- untrusted repository/web/MCP text can widen authorization;
- stale ProjectContext grants effective authority;
- Product code can create direct Core DDL or escape governed Data/Capability APIs;
- capability-gap engineering can recurse without bounds;
- production depends on a live development sandbox/harness session.

## 944. Revision 20 Artifact Contract

Canonical files (repository-relative companion names):

```text
specs/feature/212-AI Workflow studio capability validation benchmark harness/spec.md
spec-212-use-cases-2930-bilingual.json
spec-212-marketplace-catalog-2930-bilingual.json
spec-212-current-contract-profile-r20.json
spec-212-corpus-manifest-r20.json
```

The catalog remains import/search oriented and carries only:

```text
id
category
prompt.th
prompt.en
```

## 945. Revision 20 Acceptance Criteria

- [ ] Corpus IDs are contiguous UC-0001…UC-2930.
- [ ] Thai/English semantic parity exists for all 2,930 identities.
- [ ] New 100 cases cover Specs 217–222 integration.
- [ ] No new Spec 214 Node Type is introduced solely for product/development infrastructure.
- [ ] Product→Skill capability-gap flow is black-box tested.
- [ ] Local and managed harness paths normalize to the same development/release evidence expectations.
- [ ] White-label/custom-domain Product paths preserve canonical identity and authorization.
- [ ] Runtime deployment cannot bypass gateway/economic/dependency controls.
- [ ] Skill dependency revocation/upgrade/economics are covered.
- [ ] Context/harness prompt injection and stale-context behavior are covered.
- [ ] Critical security/economic failures block release.

## 946. Revision 20 Definition of Done

Revision 20 is complete when SmartAIHub can continuously prove that the new AI Product/white-label/agentic-development architecture is not merely design-complete but behaves correctly as an integrated system from:

```text
Tenant/Product intent
→ Product/Mini App design
→ capability reuse/gap
→ Skill engineering when needed
→ Runner/managed harness development
→ Git/build/test/preview
→ release/deployment
→ subdomain/custom domain
→ governed Data/Asset/Skill/Workflow invocation
→ billing/audit
→ rollback/offboarding
```

while preserving the existing canonical Workflow execution and economic authorities.
