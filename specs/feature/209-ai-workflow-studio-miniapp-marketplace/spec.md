# Spec 209 — SmartAIHub AI Workflow Studio
## AI-First Workflow Authoring, Reusable Runtime, Nested Flows, Schema-Driven Mini Apps & Marketplace

**Status:** Architecture Freeze Candidate / Ready for implementation planning  
**Spec ID:** 209  
**Revision:** 10 — Revision 9 baseline retained; pre-build execution-option discovery, user selection and Runner readiness comparison added before Workflow Definition creation
**Date:** 2026-09-19  
**Suggested repository path:** `specs/feature/209-ai-workflow-studio-miniapp-marketplace/spec.md`  
**Primary owner:** SmartAIHub Web / Core Orchestration Experience  
**Execution owner:** Feature 195 + Feature 196, not this feature  
**Economic owner:** Spec 207, not this feature  
**External CLI-agent runtime owner:** Spec 210 under Spec 200, routed by Spec 206, not this feature  
**Implementation status:** Target product architecture; current repository contains partial runtime, schema and Skill building blocks, not a production-complete Workflow Studio/Marketplace.  
**Primary UX rule:** **Natural-language AI Builder is the primary authoring interface. Visual node editing is secondary and exists mainly for understanding, inspection, debugging, and small manual corrections.**  
**Primary execution-choice rule:** **The AI Builder recommends compatible execution options after checking the user's available Runner/tool connections; it MUST not force a framework, provider, agent brand or tool when multiple compatible choices exist.**  
**Primary graph orientation:** **Top → Bottom**  
**Product horizon:** Q4 2026 foundation, extensible through 2027+ without binding SmartAIHub to one model provider, one agent protocol, one automation vendor, or one UI framework.

---

# 0. Executive Decision

SmartAIHub SHALL implement **AI Workflow Studio** as a first-class platform subsystem.

The subsystem SHALL turn the existing SmartAIHub capabilities—Skills, Agents, MCP tools, external agents, A2A agents, models, Runner capabilities, Computer Use, Library assets, approvals, Jobs, billing and audit—into reusable, inspectable, publishable workflows.

The user experience SHALL NOT make manual node placement and edge wiring the normal way to create a workflow.

The primary creation loop is:

```text
User describes desired automation in natural language
        ↓
AI Builder discovers logical capabilities and the user's available Runner/tool connections
        ↓
AI Builder generates and compares candidate execution plans
        ↓
User sees ready-now / setup-required / unavailable options and chooses or accepts a recommendation
        ↓
AI Builder proposes workflow + I/O + UI + policies for the selected plan
        ↓
Static + policy + schema + cost validation
        ↓
Visual diff / change preview
        ↓
User accepts or refines
        ↓
Versioned workflow draft
        ↓
Test / Debug / Run
        ↓
Publish
        ↓
Reusable Mini App / Shared App / Public Marketplace App
```

The visual canvas SHALL remain important, but its primary responsibilities are:

```text
Understand
Inspect
Debug
Trace
Fine-tune
Compare
Explain
```

not:

```text
Force every user to manually drag and connect every node.
```

---

# 1. Goals

Spec 209 SHALL deliver all of the following as one coherent system:

1. AI-first workflow generation from natural language.
2. AI-first modification of existing workflows.
3. Top-down visual workflow canvas.
4. Nested workflows / subflows with explicit contracts.
5. Typed data binding between nodes.
6. Schema-driven input forms.
7. Schema-driven result rendering.
8. Reusable workflows that can run without reopening the builder.
9. Full run, partial run, run-until, run-from, single-node and subflow execution.
10. Durable checkpoints and resume.
11. Node-level LLM/model selection.
12. Node-level media model selection.
13. Reusable model policies and provider fallback rules.
14. Runtime debugging, trace, logs, artifacts, cost and timing.
15. Workflow versioning, diff and rollback.
16. Human approval and runtime user-input waits.
17. Publish-as-Mini-App.
18. Private, workspace, specific-user, shared-link and public Marketplace access.
19. Creator pricing and revenue participation using the existing SmartAIHub credit/economic plane.
20. Marketplace-safe immutable published versions.
21. Full multi-tenant authorization, audit and billing attribution.
22. Migration from existing Skills/Flows without creating a second orchestration or Job system.

---

# 2. Non-Goals

Spec 209 SHALL NOT:

- create another durable Job table or queue architecture;
- replace Feature 195 as execution truth;
- replace Feature 196 as goal/plan/orchestration semantics;
- replace Feature 197 as local Runner execution fabric;
- implement MCP transport already owned by Spec 199;
- replace Spec 200 external-agent native adapters;
- replace Spec 206 A2A interoperability;
- replace Spec 207 wallet/ledger/settlement/economic authorization;
- replace Spec 208 interactive browser/desktop execution semantics;
- duplicate the Library/Asset Gateway;
- let arbitrary marketplace workflows execute unreviewed client-side JavaScript;
- expose secrets inside workflow JSON;
- make the visual canvas the canonical runtime representation;
- assume one LLM vendor, one image model vendor, one video model vendor or one workflow engine will dominate in 2027.

---

# 3. Cross-Spec Authority Matrix

The following authority boundaries are normative.

| Concern | Canonical owner |
|---|---|
| User goal interpretation / plan semantics / route requirements | Feature 196 |
| Chat / Universal Assistant ingress, conversation continuity and assistant evolution semantics | Feature 198; Spec 209 owns only the workflow-specific authoring, preview and run surfaces exposed through that ingress |
| Durable Job / attempts / lease / retry / canonical execution state / actual SmartAIHub cost | Feature 195 |
| Local Windows/macOS/Linux execution / Runner control / local capability reality | Feature 197 |
| MCP upstream lifecycle, auth, transport, tool normalization | Spec 199 |
| Provider-native external agent execution | Spec 200 |
| A2A-first interoperability and native-agent fallback | Spec 206 |
| Credit/economic authorization, wallet, ledger, revenue allocation, settlement | Spec 207 |
| Browser/desktop interactive execution and last-mile UI fallback | Spec 208 |
| Orca / terminal-based external-agent runtime adapter | Spec 210 under Spec 200, selected by Spec 206; this feature may declare the node requirement but does not own the adapter |
| Workflow authoring schema, workflow UX, workflow versioning, app publishing, marketplace workflow productization | **Spec 209** |

**No implementation may resolve overlap by creating a duplicate source of truth.**

Spec 186 remains legacy/lineage context for existing `worker_jobs` / `worker_job_events`; where Feature 195 is deployed, Feature 195 is authoritative.

## 3.1 Repository Alignment and Retired-System Boundary — 2026-09-19

The repository currently exposes partial building blocks, not a completed Spec
209 product:

| Workflow Studio concern | Current repository evidence | Spec 209 interpretation |
|---|---|---|
| Durable execution | `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobDispatches`, `workerJobOutbox`, `workerJobSettlements` and the internal Job Control Plane route | Every saved workflow run must enter the canonical Feature 195 Job contract; no workflow-owned queue, lease, event, settlement or finality table may be introduced. |
| Agent execution | Python `/api/internal/openai-agents-runtime/*` plus Node `apps/web/server/services/agentRuntime/client.ts` | OpenAI Agents API is the approved native agent runtime boundary. The Node/Python bridge and versioned request/trace/checkpoint contracts remain authoritative for that runtime. |
| Governed graph execution | `python-backend/app/orchestrator/langgraph_runtime.py` | LangGraph is an approved governed graph adapter where the selected runtime contract requires it; it is not the retired custom `/workflows` engine. |
| Current Job compatibility baseline | `apps/web/server/services/jobControlPlaneTypes.ts`, `jobControlPlane.ts` and `agentControlPlaneContracts.ts` still emit the compatibility contract `feature-186-v1`; `feature195To200ContractMatrix.test.ts` covers only the 195–200 contract set | Feature 195 is the target execution owner, but Spec 209 implementation planning MUST define the compatible contract/version migration before claiming a Feature 195-native workflow runtime. A `feature-186-v1` row is not proof of a second Job plane or of Spec 209 execution. |
| Chat/Assistant ingress | `apps/web/server/services/chatOrchestrationContracts.ts` normalizes tenant/conversation/idempotency scope and projects canonical Job status into Chat task state | Spec 209's Chat/Assistant entry points are integrations owned by Feature 198; they MUST preserve the Chat projection and MUST NOT create a workflow-specific conversation or status authority. |
| External-agent/A2A route | `agentControlPlaneContracts.ts`, `external_agent_task`, Hermes/OpenClaw scheduler paths and native OpenAI Agents bridges exist; no current A2A route/adapter implementation was found in the inspected source paths | A2A-first and external-agent nodes remain target integrations owned by Specs 206/200. Spec 209 MUST not claim A2A or external-agent Marketplace execution from the presence of current job types alone. |
| Computer Use / browser-session route | `apps/web/shared/workflowBrowserSessionNodeTypes.ts` defines browser-session node types, but the `workflowBrowserSessionNodes` flag is false by default and current Runner/browser routes are separate control surfaces | Workflow Computer Use nodes remain gated integrations owned by Spec 208. A node type or UI contract is not proof of safe browser/desktop execution, approval, profile isolation or production enablement. |
| Economic compatibility rail | Current code has Credits/`creditTransactions`, provider reservations and Job settlements, while Spec 207 explicitly describes its multi-wallet/ledger architecture as target/partial | Spec 209 may emit attributable usage/pricing facts only; it MUST not claim creator payout, wallet, ledger, tax, dispute or settlement finality until Spec 207 provides the authoritative contract and evidence. |
| Existing workflow/marketplace residue | `workflows`, `workflowVersions`, `workflowTemplates`, `workflowExecutions` and related legacy tables exist in `apps/web/drizzle/schema.ts`; `apps/web/server/routers/__tests__/workflowTemplates.test.ts` imports a `workflow.ts` router that is not present in the current tree; `apps/web/server/routers/adminOps.ts` still reads template-review rows | These are migration inputs and stale/partial product residue only. Their presence MUST NOT be treated as the new canonical Spec 209 schema, router, Mini App, or Marketplace runtime. Any reuse requires an authorized migration audit and explicit ownership mapping. |
| Retired workflow surface | `apps/web/client/src/lib/retiredRouteGuard.ts` retires `/workflows`; stale route/docs/SEO references remain in client/public artifacts and the Python Kilo `/workflows` listing is a separate local file-listing surface | Spec 209 MUST NOT add callers to the retired route/engine. The residue is a migration and release-cleanup blocker, not evidence that the target Workflow Studio already exists. |
| Orca runtime integration | Spec 210 records the current Runner protocol and explicitly reports no `orca.v1` adapter in the inspected Runner/Web/Python paths | A Workflow external-agent node may select Orca only through the certified Spec 210 → Spec 200/206 route after capability probing, authenticated Runner control, shared Job admission, and rollback gates. Direct CLI invocation is out of scope. |
| Skills and UI schemas | Existing Skill directories under `apps/web/skills/*` contain input/output/UI schema artifacts | Reuse is allowed through a versioned Skill capability adapter; do not copy Skill execution or create a second registry. |
| Existing Marketplace and Skill discovery surfaces | `apps/web/client/src/pages/Marketplace.tsx` uses `marketplace.list` with lexical search/category filters; `apps/web/client/src/pages/SkillBrowser.tsx` uses authenticated search, category filters and pagination; neither is a Mini App user library | Spec 209 MUST provide one authenticated Mini App Hub that reuses these proven search/card/filter patterns while adding registered, selected, bookmarked, pinned/frequent, dependency and readiness states. The current pages are pattern references, not proof that the Mini App Hub exists. |
| Vector search provider | `apps/web/server/services/vectorProvider.ts` and `vectorize-search.ts` provide provider-neutral search with tenant namespaces, metadata filters and Cloudflare Vectorize/pgvector/Chroma adapters; current indexes are knowledge/media/agent-memory oriented | Mini App and Skill discovery MUST use this shared Vector Provider contract and ACL filtering. Spec 209 MUST add a catalog projection/index contract and coverage/reconciliation proof; it MUST NOT create a second vector database or claim catalog indexing from the existing Library/Media indexes alone. |
| External tool readiness | `apps/web/server/routers/runnerNodes.ts` exposes safe Runner inventory/readiness projections; `apps/runner-app/src/discovery.rs` tracks install/configuration/auth/health/availability dimensions and reason codes; `apps/runner-app/src/adapters.rs` probes approved Claude/Codex/Antigravity-style adapters | Marketplace registration/selection/run MUST consume server-authoritative dependency and Runner readiness snapshots. Missing tools or skills MUST be visible and actionable before run; client-side labels or raw CLI presence MUST NOT authorize execution. |
| External Skill bundle distribution | `apps/web/server/services/skillRegistry.ts` and `apps/web/server/routers/skillRepositories.ts` provide canonical Skill discovery/repository sync; no Spec 209 Marketplace bundle lock/install flow was found | A Mini App that needs an external-tool Skill MUST publish an immutable bundle reference or an explicit publisher-managed setup requirement. Spec 209 MUST NOT claim that a discovered Skill is automatically installed inside Claude/Codex/Antigravity. |
| Local execution | Feature 197 Runner contracts and Spec 208 target boundaries | Local/browser/desktop nodes request capabilities and execute through those owners; they do not open a second local-control path. |

The following systems are retired and MUST NOT be reintroduced by Spec 209:
Agency, `work/request`, `work/requests`, `workpacks/*`, the legacy `/workflows`
custom workflow engine, OpenSandbox, `sandbox_jobs`, and Docker/OpenSandbox
dispatch. Existing repository residue, stale tests, historical tables or
compatibility adapters are not authorization to add new callers. Any removal or
data migration requires a separate read-only dependency/runtime audit, retention
plan and rollback decision.

Spec 209 is therefore a target authoring/product layer over the approved
OpenAI Agents API, governed graph/runtime adapters, Feature 195/196 execution,
Feature 197 Runner, Specs 199/200/206/208 and Spec 207 economics. It is not a
claim that those target contracts are already implemented or production-ready.

---

# 4. Product Model

SmartAIHub SHALL treat a workflow as three separable but related artifacts:

```text
Workflow Definition
    = executable semantic graph

Workflow View
    = canvas positions, collapsed state, zoom, annotations

Workflow App Experience
    = input UI, result UI, branding, publish/access/pricing metadata
```

A change to node position MUST NOT alter execution semantics.

A change to Mini App layout MUST NOT silently alter the Workflow Definition.

A published Marketplace app MUST point to an immutable Workflow Version.

---

# 5. UX References — Normative

The approved mockups in this spec package are normative references for interaction hierarchy and overall product direction:

```text
mockups/01-main-builder-top-down.png
mockups/02-subflow-data-binding.png
mockups/03-run-debug-mini-app.png
```

Implementation SHALL preserve the following qualities demonstrated by the mockups:

- clean modern SaaS visual hierarchy;
- top-down primary flow;
- compact readable nodes;
- substantial whitespace;
- right-side inspector;
- bottom debug/output drawer;
- nested subflow drill-down;
- visible typed data bindings;
- separate Run experience for normal users;
- minimal visual noise;
- graph view optimized for understanding rather than manual wiring.

The mockups are **not pixel-perfect contracts**. Responsive dimensions, exact spacing and component primitives may evolve, but the information architecture and interaction model SHALL remain aligned.

---

# 6. Primary UX Principle — AI First

## 6.1 Default authoring

Opening a new Workflow SHALL prioritize an AI prompt:

```text
What do you want this workflow to do?

[ Describe the desired workflow... ]

                     [ Build Workflow ]
```

The default path SHALL NOT require users to:

- add the first Trigger manually;
- browse dozens of low-level nodes before describing the outcome;
- manually connect every edge;
- manually map every compatible field;
- manually decide implementation details that SmartAIHub can infer safely.

Before creating a semantic Workflow Definition, the Builder SHALL perform a
pre-build execution-option discovery step whenever the request can be fulfilled
through more than one materially different runtime, provider, protocol or
execution target. This step SHALL:

```text
1. infer logical capabilities and hard constraints from the request;
2. generate bounded candidate execution plans;
3. inspect the user's authorized Runner, tools, Skills and connections;
4. evaluate readiness, setup requirements, policy and compatibility;
5. show the user the trade-offs and actionable choices;
6. create the Workflow Definition only after the user selects or accepts a plan.
```

If only one compatible plan exists, the Builder SHALL still show why it is the
only option and require confirmation before creating a flow when the plan has
material setup, privacy, cost, locality or side-effect implications. `AUTO` is
an explicit user choice to accept the recommended plan; it is not permission to
silently choose or replace a tool.

The pre-build option set is an ephemeral planning artifact. The selected plan
may become a preference and constraint snapshot on the Draft Workflow Version,
but transient Runner/session/process identities MUST NOT become workflow
semantics.

## 6.2 Example creation request

```text
รับวิดีโอหลายไฟล์ วิเคราะห์เนื้อหา
สร้างแผนตัดต่อ ให้ AI ตัดต่อไม่เกิน 3 นาที
ทำ QC ถ้าต่ำกว่า 8 ให้แก้ได้ไม่เกิน 2 รอบ
แล้วให้ฉัน approve ก่อนส่งผลลัพธ์
```

The AI Builder SHOULD produce:

```text
Project Input
    ↓
Analyze Footage
    ↓
Create Edit Plan
    ↓
AI Video Edit
    ↓
QC
  ↙   ↘
fail   pass
 ↓      ↓
repair Human Approval
 ↖      ↓
     Result
```

plus schemas, bindings, policies and UI.

## 6.3 AI modifications

Existing workflows SHALL support natural-language modification, e.g.:

```text
“หลัง QC ถ้าคะแนนต่ำกว่า 8 ให้กลับไป Video Editor
ได้ไม่เกิน 2 รอบ”

“เปลี่ยน Generate Video เป็น Seedance 2.5
ถ้าใช้ไม่ได้ fallback ไป Kling”

“แยก Research ทั้งหมดเป็น subflow”

“เพิ่มให้ user เลือกภาษาไทย/อังกฤษก่อนเริ่ม”
```

AI SHALL generate a structured change plan and preview before semantic changes are committed.

---

# 7. AI Change Safety Contract

AI-generated workflow edits SHALL NOT directly mutate production workflow state.

Required path:

```text
Prompt
  ↓
Proposed Patch
  ↓
Schema validation
  ↓
Graph validation
  ↓
Capability validation
  ↓
Policy / permission validation
  ↓
Cost-impact analysis
  ↓
Breaking-change analysis
  ↓
Human-readable diff
  ↓
Apply to Draft Version
```

The user SHALL see at minimum:

```text
+ nodes
- nodes
~ changed nodes
changed bindings
changed models/providers
changed side effects
changed approvals
estimated cost impact
breaking I/O contract changes
```

For high-risk changes, user confirmation SHALL be mandatory.

---

# 8. AI Workflow Patch Format

The AI Builder SHOULD emit constrained patch operations rather than replacing the whole workflow JSON.

Minimum operations:

```text
add_node
remove_node
update_node
connect
disconnect
set_binding
unset_binding
create_subflow
inline_subflow
set_input_schema
set_output_schema
set_ui_schema
set_result_renderer
set_model_policy
set_retry_policy
set_timeout
set_condition
set_approval_policy
set_error_handler
rename
annotate
```

Each patch operation SHALL have:

```text
operation_id
target_version_id
precondition
operation_type
payload
semantic_risk
cost_impact_estimate
requires_confirmation
```

Patch application SHALL be transactional.

---

# 9. Capability Discovery During AI Build

The AI Builder SHALL use the shared Capability Registry/Resolver.

It SHALL discover and compare:

- Skills;
- internal services;
- existing Flows;
- reusable subflows;
- MCP capabilities through Spec 199;
- external agents through Spec 200;
- A2A-capable agents through Spec 206;
- Runner/local capabilities through Feature 197;
- Computer Use capabilities through Spec 208;
- LLM/media models;
- Library / Asset capabilities.

The Builder SHALL prefer reuse over duplication.

If an existing Skill or Flow can satisfy a requirement, AI SHOULD reference it instead of generating a semantically duplicate implementation.

Capability discovery during build SHALL distinguish three different questions:

```text
Capability Resolver
    What logical outcome and capability contract are required?

Readiness Resolver
    Which user-authorized Runner, connection, Skill or adapter is usable now,
    what requires setup, and what is unavailable or unknown?

Plan Selector
    Which compatible plan should be recommended or selected by the user?
```

The Builder MUST query the server-authoritative readiness projection for the
user's accessible Runner/device/connection scope. Client labels, installed CLI
names, or stale browser state MUST NOT be treated as proof of readiness.

For every candidate plan, the Builder SHOULD expose:

```text
route and runtime family
execution target / Runner
required capabilities and compatible alternatives
ready-now status
missing installation, Skill, connection or permission
privacy / locality implications
estimated cost and latency class
quality / reliability trade-offs
fallback and re-planning behavior
```

---

# 10. Workflow Canonical Definition

A Workflow Version SHALL contain a canonical semantic definition independent of visual layout.

Suggested shape:

```yaml
workflow:
  id: wf_...
  version: 12
  name: Professional Video Editor

  inputs: ...
  outputs: ...

  nodes:
    - id: input
      type: form
      ...
    - id: analyze
      type: capability
      ...
    - id: production
      type: subflow
      ...

  edges:
    - from: input
      to: analyze
      kind: control

  policies:
    model_policy: balanced
    budget: ...
    approval: ...

  error_policy: ...
```

The database MAY normalize parts of this structure, but one deterministic export/import format SHALL exist.

---

# 11. Workflow View Definition

Visual state SHALL be stored separately:

```json
{
  "workflow_version_id": "wfv_12",
  "orientation": "DOWN",
  "nodes": {
    "node_a": {"x": 120, "y": 300, "collapsed": false}
  },
  "viewport": {"x": 0, "y": 0, "zoom": 1.0},
  "groups": [],
  "annotations": []
}
```

Manual layout changes SHALL NOT create a new semantic Workflow Version unless semantic configuration changed.

---

# 12. Top-Down Canvas

The primary automatic layout SHALL be:

```text
direction = DOWN
```

Branching MAY expand horizontally.

Example:

```text
          Analyze
             │
             ▼
         Condition
         /       \
        /         \
   Claude         Codex
        \         /
         \       /
           Merge
             │
             ▼
             QC
```

The system SHOULD use an automatic hierarchical layout engine capable of:

- compound/nested graph layout;
- multiple ports;
- reduced edge crossings;
- orthogonal routing;
- incremental re-layout;
- node dimension awareness.

React Flow / XYFlow + ELK.js is the recommended initial implementation stack, but it is an implementation choice, not a platform contract.

---

# 13. Canvas Is Secondary Authoring

Manual operations MAY be supported for expert/fine editing:

- move node;
- multi-select;
- add simple node;
- reconnect;
- edit constant;
- change condition;
- group;
- create subflow;
- rename;
- disable;
- duplicate;
- annotate.

The UI SHALL continually expose an AI command affordance so users can choose to describe changes instead.

---

# 14. Nested Flow / Subflow Model

A Subflow SHALL behave as a reusable callable workflow with a stable contract.

Parent flow sees:

```text
inputs
outputs
version
execution policy
```

not every internal node.

Example:

```text
script ──────┐
assets ──────┼──► [ Video Production ] ──► video
aspect_ratio ┘                          ├──► qc_score
                                       └──► report
```

Internally:

```text
Storyboard
    ↓
Generate Images
    ↓
Voice
    ↓
Generate Video
    ↓
AI Editor
    ↓
QC
```

---

# 15. Subflow Contract

Minimum contract:

```yaml
subflow:
  id: video_production
  version: 12

  inputs:
    script:
      type: Script
      required: true
    assets:
      type: MediaAsset[]
    aspect_ratio:
      type: enum
      values: ["16:9", "9:16"]

  outputs:
    video:
      type: VideoAsset
    edit_report:
      type: EditReport
    qc_score:
      type: number
```

A parent workflow SHALL bind to this contract, not to internal implementation details.

---

# 16. Subflow Versioning

Subflow references SHALL support:

```text
PINNED_VERSION
COMPATIBLE_RANGE
FOLLOW_CURRENT_STABLE
```

Marketplace published workflows SHOULD default to pinned immutable subflow versions unless dependency update policy explicitly permits compatible upgrades.

Breaking subflow contract changes SHALL require a new major/contract version or explicit binding migration.

---

# 17. Recursion and Loop Safety

The compiler SHALL reject unbounded accidental recursion.

Rules:

- workflow → itself: denied by default;
- subflow recursive call requires explicit recursive declaration;
- maximum recursion depth required;
- explicit Loop node required for cycles;
- maximum iterations required unless a governed human wait/long-running semantic explicitly applies;
- cost/budget guard required for unbounded external/model calls.

---

# 18. Node Taxonomy

Minimum node categories:

## Interaction
- Form Input
- Ask User
- Human Approval
- Result View

## Intelligence
- Agent
- LLM
- Evaluator
- Router / Classifier

## Media
- Image Generation
- Video Generation
- Audio / TTS
- Music
- Media Analysis

## Capability
- Skill
- Internal capability
- MCP Tool
- External Agent
- A2A Agent
- Computer Use
- Runner capability

## Logic
- Condition
- Switch
- Parallel
- Join
- Loop
- Retry
- Delay
- Wait
- Error Handler
- Compensation

## Data
- Transform
- Mapper
- Merge
- Split
- Variable
- Library Asset
- Structured Data

## Composition
- Subflow
- Workflow Call

## Trigger
- Manual
- API
- Schedule
- Event
- Webhook
- Chat / Assistant
- Workflow
- Agent / A2A

---

# 19. Typed Data Binding

Node data binding SHALL be schema-aware.

Every input port/field SHOULD declare:

```text
type
required
nullable
cardinality
format
semantic_type
```

Example:

```text
Generate Video

prompt            String
character_images  Image[]
background        Image | String
duration          Number
aspect_ratio      Enum
model             ModelRef
```

---

# 20. Binding Sources

Each field SHALL support one or more sources:

```text
Fixed Value
Workflow Input
Previous Node Output
Variable
Expression
Secret Reference
Library Asset
Runtime User Input
Preset
Environment / Context
```

The default UI SHALL use a Data Source Picker rather than forcing expression syntax.

---

# 21. Data Source Picker

Example hierarchy:

```text
Workflow Input
  ├─ project_name       String
  ├─ background         Image
  └─ duration           Number

Analyze Assets
  ├─ characters[]       Character[]
  │   ├─ name           String
  │   ├─ image          Image
  │   └─ description    String
  └─ scenes[]           Scene[]

Script Agent
  ├─ script             Script
  └─ video_prompt       String
```

Selecting `Script Agent → video_prompt` SHALL produce a typed binding object, not only a display string.

---

# 22. Type Compatibility

The compiler SHALL detect incompatible connections.

Example:

```text
Expected: Image[]
Received: String
```

The UI MAY offer safe transforms such as:

```text
Image → Image[]
VideoAsset → URL
String → Enum (only if valid)
Object → selected property
```

Automatic transforms SHALL be explicit nodes or explicit binding transforms so that provenance remains visible.

---

# 23. Control Flow vs Data Flow

The canvas SHALL distinguish semantic control flow from data binding.

Default view:

```text
Control Flow = visible
Data Flow = hidden unless selected / requested
```

View menu SHOULD support:

```text
☑ Control Flow
□ Data Flow
□ Error Flow
□ Tool / Agent Calls
```

This avoids spaghetti graphs on workflows with many input mappings.

---

# 24. Schema-Driven Input UI

Skills and workflow input nodes SHALL use schema-driven UI.

Preferred compatibility:

```text
input.schema.json
ui.schema.json
output.schema.json
```

If `ui.schema.json` does not exist, SmartAIHub SHALL be able to generate a usable default UI from the input schema.

Recommended initial implementation: JSON Forms-compatible JSON Schema + UI Schema model, extended with SmartAIHub widgets.

---

# 25. SmartAIHub UI Schema Extensions

Examples of supported widgets:

```text
text
textarea
number
slider
select
radio
checkbox
date
datetime
file-upload
asset-picker
image-picker
video-picker
audio-picker
model-selector
agent-selector
capability-selector
library-selector
code-editor
prompt-editor
json-editor
table
repeater
timeline
```

Example:

```json
{
  "field": "reference_images",
  "widget": "asset-picker",
  "sources": ["upload", "library"],
  "accept": ["image/*"],
  "multiple": true,
  "maxItems": 5,
  "preview": "thumbnail-grid"
}
```

---

# 26. Custom UI Security

Marketplace content SHALL NOT inject arbitrary JavaScript into Mini App pages.

Custom presentation SHALL use:

1. built-in vetted renderer;
2. declarative UI schema;
3. approved signed plugin renderer with explicit platform permission.

Untrusted workflow JSON MUST NOT become executable browser code.

---

# 27. Result Rendering

Workflow output SHALL support typed renderers.

Minimum renderers:

```text
text
markdown
json
table
image
image-gallery
video
audio
file
file-list
code
report
timeline
comparison
metric
custom-approved-renderer
```

Output schema SHOULD define renderer hints separately from business data.

---

# 28. Workflow → Mini App

A saved Workflow MAY be published as a Mini App.

Mini App is a presentation and access wrapper around an immutable workflow version.

```text
Workflow Version
   ↓
Input Schema
   ↓
UI Schema
   ↓
Run Contract
   ↓
Result Schema
   ↓
Result Renderer
   ↓
Mini App
```

The Mini App user SHALL NOT need to understand the internal graph.

---

# 29. Run Experience vs Builder Experience

SmartAIHub SHALL separate:

```text
Builder UX
```

from:

```text
Consumer Run UX
```

Normal users launching a published/reusable workflow SHOULD see a clean form and live progress, not the full canvas.

---

# 30. Supported Run Modes

The runtime UI/API SHALL support:

```text
RUN_ALL
RUN_UNTIL_NODE
RUN_FROM_NODE
RUN_SINGLE_NODE
RUN_SUBFLOW
RUN_UNTIL_SUBFLOW
RESUME_RUN
RETRY_NODE
RETRY_FROM_NODE
DEBUG_RUN
DRY_RUN
VALIDATE_ONLY
```

---

# 31. Run Until Node

`RUN_UNTIL_NODE` SHALL:

1. execute all required upstream dependencies;
2. complete the target node;
3. persist outputs/checkpoints;
4. transition the Workflow Run to an intentional partial-stop state;
5. allow resume later.

Example:

```text
Research       ✓
Script         ✓
Storyboard     ✓
Images         ✓ ← stop intentionally
Video          -
QC             -
```

UI:

```text
Partial Run Complete

Stopped after:
Generate Images

[Continue Run]
[Inspect Output]
[Open Debug]
```

---

# 32. Run From Node

`RUN_FROM_NODE` SHALL require valid upstream data.

Valid sources include:

- checkpoint from same workflow version;
- selected previous run;
- pinned test data;
- manually supplied compatible input;
- valid reusable artifact.

The runtime SHALL NOT pretend missing upstream state exists.

---

# 33. Retry Semantics

Retry SHALL integrate with Feature 195 failure classification.

UI MAY expose:

```text
Retry Node
Retry From Here
Use Different Provider
Use Different Model
Replan
```

but canonical retry/attempt state remains Feature 195-owned.

Side-effecting nodes SHALL obey idempotency, fencing and unknown-outcome rules before retry.

---

# 34. Checkpoints

Node/subflow outputs required for resume SHOULD be persisted as checkpoint references.

Checkpoint data SHALL be stored efficiently:

- structured small state → database/object reference as appropriate;
- large media/artifacts → Library/R2/Asset Gateway reference;
- secrets → never copied into checkpoint payload.

A checkpoint SHALL carry:

```text
workflow_version_id
run_id
node_id
node_revision
input_hash
output_schema_version
artifact_refs
created_at
validity
provenance
```

---

# 35. Checkpoint Invalidation

Changing an upstream node SHALL invalidate incompatible downstream test/checkpoint data.

The system SHOULD compute downstream invalidation based on:

- graph dependency;
- binding dependency;
- schema change;
- model/policy change when output contract may change;
- side-effect semantics;
- user override.

Manual "keep pinned data" MAY be allowed for testing with a visible stale-data warning.

---

# 36. Pin Test Data

Users SHALL be able to pin node output as test input.

Use case:

```text
Expensive Image Generation
        ↓
pin images
        ↓
test Video Generation 20 times
without regenerating images 20 times
```

Pinned data SHALL be clearly labeled as test-only unless explicitly promoted.

---

# 37. Human Approval Node

Approval SHALL support:

```text
Approve
Reject
Request Changes
Edit Input and Continue
Choose Route
Choose Model
Choose Artifact
```

Approval SHALL suspend durable execution rather than keep a web request open.

---

# 38. Ask User Node

Workflow MAY pause for runtime user input.

The request SHALL contain:

```text
prompt
input_schema
ui_schema
deadline
default/timeout policy
authorized responders
```

Responses SHALL be versioned/audited.

---

# 39. Parallel / Join

Parallel branches SHALL support:

```text
ALL
ANY
N_OF_M
FIRST_SUCCESS
FIRST_VALID
RANK_AND_SELECT
```

The Join node SHALL define merge behavior explicitly.

Cost/budget enforcement SHALL account for parallel calls before launching them.

---

# 40. Conditions

Conditions MAY be:

- deterministic expression;
- schema validation;
- policy rule;
- model evaluator;
- human decision.

A condition that can be deterministic SHOULD NOT require an expensive LLM.

---

# 41. Error Handling

Workflow-level and node-level policies SHALL support:

```text
FAIL
RETRY
FALLBACK
SKIP
CONTINUE_WITH_DEFAULT
CALL_REPAIR_SUBFLOW
REPLAN
ASK_USER
REQUIRE_APPROVAL
COMPENSATE
```

Policy denial SHALL NOT be treated as a generic transient provider failure.

---

# 42. Side Effects and Compensation

Nodes SHALL declare side-effect class, e.g.:

```text
NONE
REVERSIBLE
IDEMPOTENT_EXTERNAL
NON_IDEMPOTENT_EXTERNAL
ECONOMIC
SECURITY_SENSITIVE
PUBLICATION
DELETION
```

Economic side effects SHALL defer authorization/finality to Spec 207.

Browser/desktop side effects SHALL defer interactive execution semantics to Spec 208.

---

# 43. Model Configuration — General

Every model-capable node SHALL support:

```text
AUTO
FIXED
POLICY
USER_SELECTABLE
```

Configuration SHALL be provider-neutral.

---

# 44. Model Selection Precedence

Recommended precedence:

```text
1. Explicit run override (if allowed)
2. Node override
3. Workflow model policy
4. Project/workspace policy
5. Tenant policy
6. Platform default
```

All levels remain subordinate to:

```text
capability requirements
permissions
privacy/residency
budget
availability
marketplace owner restrictions
```

---

# 45. LLM Model Requirements

A node MAY declare:

```text
reasoning
vision
tool_calling
structured_output
context_min
audio_input
audio_output
code_execution
latency_class
quality_class
privacy_class
```

The Model Resolver SHALL only select compatible models.

---

# 46. Media Model Requirements

Image/video/audio/music nodes MAY declare capability requirements such as:

```text
text_to_image
image_to_image
reference_image
first_frame
last_frame
video_extension
lip_sync
native_audio
aspect_ratio
resolution
duration
multi_shot
seed
quality_tier
```

Provider-specific settings MAY be surfaced only when the selected provider/model supports them.

---

# 47. Reusable Model Policies

Minimum built-in policies SHOULD include:

```text
Balanced
Best Quality
Lowest Cost
Fastest
Local First
Privacy First
```

Users/workspaces MAY define custom policies.

Example:

```text
Workflow default = Balanced
Image Draft node = Lowest Cost
Final Video node = Best Quality
Private Document node = Local First
```

---

# 48. Model Fallback

Fallback SHALL distinguish:

```text
equivalent model fallback
provider fallback
quality downgrade
modality downgrade
semantic strategy change
```

Only pre-authorized equivalent fallback may happen automatically.

A material quality/cost/privacy change SHALL require policy permission or replanning/user approval.

---

# 49. Marketplace Model Controls

Workflow publishers MAY choose:

```text
LOCKED_MODELS
ALLOW_EQUIVALENT_FALLBACK
ALLOW_USER_MODEL_OVERRIDE
ALLOW_POLICY_OVERRIDE
```

Marketplace run UI SHALL clearly indicate where consumer overrides can change cost or output behavior.

---

# 50. Cost Estimation

Before execution, SmartAIHub SHOULD estimate:

```text
known SmartAIHub credit cost
estimated model/media cost
creator workflow fee
possible fallback range
unknown external user-owned cost
```

Unknown cost SHALL remain `unknown`, never silently represented as zero.

---

# 51. Budget Envelope

Run request MAY set:

```text
max_credits
max_external_estimated_cost
max_duration
max_model_calls
max_media_generations
```

Exceeding a hard budget SHALL stop/replan/ask user according to policy.

---

# 52. Workflow Runtime Compilation

Spec 209 SHALL compile a saved Workflow Version into the existing orchestration/runtime model.

Recommended target:

```text
Workflow Definition
    ↓
Spec 209 Compiler
    ↓
Feature 196 orchestration plan / LangGraph-compatible graph
    ↓
Feature 195 durable execution
```

Spec 209 MUST NOT create a second durable workflow runtime beside Feature 195/196.

Runtime selection SHALL be capability-first and user-visible. OpenAI Agents API,
PydanticAI, SmartAIHub Native, MCP, A2A, External Agent Gateway, ACP-compatible
agents and Runner execution are governed adapter choices, not mandatory Workflow
Definition identities. The compiler MUST NOT assume OpenAI Agents API merely
because a node is agentic.

The compiler SHALL record the logical requirements, selected/recommended plan,
runtime contract/version, protocol route, readiness snapshot reference and
execution constraints in the run manifest. It MUST preserve the user's selected
compatible option. If that option becomes unavailable, the run MUST pause for
reselection or follow an explicitly authorized equivalent fallback; it MUST NOT
silently switch to another tool, provider or agent brand.

A terminal-based external-agent node may select Spec 210 only through the Spec
206 A2A-first decision and Spec 200 native execution plane; the Workflow compiler
MUST NOT invoke Orca directly. The compiler MUST reject unsupported or retired
runtime identifiers and MUST NOT route through the retired `/workflows` engine,
OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch.

---

# 53. Agent Node Runtime

Agent nodes MAY use the cognitive execution layer defined by Feature 196.

For OpenAI Agents SDK-based nodes, SmartAIHub MAY use SDK capabilities such as:

- tools;
- handoffs;
- guardrails;
- sessions;
- tracing.

However, durable workflow lifecycle remains under SmartAIHub control.

---

# 54. External Agent Nodes

External Agent execution SHALL route through:

```text
A2A when eligible → Spec 206
otherwise         → Spec 200
```

Both routes SHALL normalize into the same workflow/run contracts as far as technically possible.

Internal reasoning of opaque external harnesses MUST NOT be fabricated in traces.

---

# 55. MCP Nodes

MCP nodes SHALL use Spec 199.

Spec 209 SHALL NOT duplicate:

- MCP auth;
- MCP upstream registry;
- transport;
- OAuth lifecycle;
- quarantine;
- capability normalization.

---

# 56. Computer Use Nodes

UI interaction SHALL route through Spec 208.

A workflow SHALL express outcome/requirements, not raw uncontrolled mouse/keyboard access.

Example:

```text
requires_existing_user_session = true
requires_local_files = false
cloud_execution_allowed = false
```

---

# 57. Runner Nodes

Local capabilities SHALL use Feature 197.

The workflow may request capabilities; Runner owns actual local capability
presence, installation, configuration, authentication, health, availability and
trust/policy state. During pre-build option discovery, Spec 209 SHALL consume
the user's authorized Runner readiness projection from Feature 197 and SHALL
show the result as `READY_NOW`, `SETUP_REQUIRED`, `RUNNER_OFFLINE_OR_STALE`,
`POLICY_BLOCKED`, `UNSUPPORTED` or `UNKNOWN`.

Runner readiness is an input to plan comparison, not a reason to force one tool.
If several adapters satisfy the logical contract, the user may choose any
compatible option. If a selected option needs setup, the Builder SHALL show the
exact action and may create a setup-pending Draft, but SHALL NOT install or
switch tools without explicit user action.

---

# 58. Trigger Model

A Workflow Version MAY be invoked through:

```text
Manual UI
Mini App
Universal Assistant / Chat
API
Schedule
Webhook
Internal event
Another workflow
External Agent
A2A
MCP-exposed SmartAIHub capability
```

All entry points SHALL converge on the same canonical run contract.

---


# 58A. Natural-Language Run Control

The same AI-first principle SHALL apply to execution commands.

Users SHOULD be able to type commands such as:

```text
“รัน workflow นี้ทั้งหมด”
“รันถึง Generate Images แล้วหยุด”
“เริ่มต่อจาก Video Generation ของ run ล่าสุด”
“ทดสอบเฉพาะ Video Production subflow”
“retry ตั้งแต่ QC โดยใช้ checkpoint เดิม”
```

The Assistant/Builder SHALL translate these requests into explicit run modes and show the resolved action before any material side effect when ambiguity exists.

Example resolution:

```text
Requested:
“รันถึง Generate Images แล้วหยุด”

Resolved:
mode = RUN_UNTIL_NODE
target_node = generate_images
workflow_version = v12
checkpoint_policy = SAVE_AND_PAUSE
```

Natural-language run control MUST use the same execution APIs as buttons/menus. It SHALL NOT create a second conversational execution path.

---

# 58B. Workflow as a Registered Capability

A published or explicitly enabled Workflow Version SHOULD be registerable in the shared Capability Registry.

This allows:

```text
Universal Assistant
Internal Agent
External Agent
A2A Agent
Another Workflow
MCP-facing SmartAIHub surface
```

to discover and invoke it through the normal capability gateway.

Capability registration SHALL expose only the public contract:

```text
name
description
input schema
output schema
required permissions
cost/usage characteristics
execution modality
version
```

Private internal graph structure SHALL remain hidden when `graph_visibility` requires it.

Workflow Capability registration MUST NOT bypass Mini App entitlement, tenant policy, budget policy, Spec 207 economics, or normal Feature 195/196 execution.

---

# 58C. Runtime Form Exposure Rules

Not every node input field belongs in the end-user Mini App form.

Each workflow input/binding SHALL support exposure semantics:

```text
USER_REQUIRED
USER_OPTIONAL
HIDDEN_BOUND
HIDDEN_CONSTANT
ADVANCED_OPTIONAL
PUBLISHER_LOCKED
RUNTIME_DERIVED
```

Example:

```text
Generate Video.prompt
    ← Script Agent.video_prompt
    exposure = HIDDEN_BOUND

Generate Video.model
    ← Workflow model policy
    exposure = PUBLISHER_LOCKED

Project Input.goal
    exposure = USER_REQUIRED
```

A bound field SHALL NOT appear as an unnecessary duplicate input in the Mini App unless the author intentionally exposes an override.

---

# 58D. Dynamic and Large Input Forms

For Skills/workflows with many inputs, UI Schema SHALL support:

```text
sections
tabs
accordion groups
wizard/stepper pages
conditional visibility
conditional requiredness
repeatable groups
dynamic enum/options
computed read-only fields
advanced sections
inline preview
validation summary
```

The AI Builder SHOULD automatically group large forms into a usable hierarchy and MAY generate contextual help text from authoritative capability schemas/documentation.

Conditional UI rules MUST NOT replace server-side validation.

---

# 58E. AI Editing of Mini App UI

The creator SHALL be able to modify Mini App input/result UI through natural language, e.g.:

```text
“เอาตัวเลือกขั้นสูงไปซ่อนไว้ใน Advanced”
“ให้เลือกภาพจาก Library หรือ upload ได้”
“ถ้าเลือก 9:16 ให้ซ่อนตัวเลือก landscape preset”
“หน้า result ให้แสดง video ก่อน แล้วค่อย report”
```

AI SHALL generate declarative UI schema patches and preview them before applying.

AI MUST NOT generate unrestricted executable browser code for Marketplace apps.

---

# 58F. Model Registry Contract

Model selection SHALL use a shared Model Registry / model-capability catalog rather than hard-coded dropdown lists inside Workflow Studio.

Registry entries SHOULD include, where available:

```text
provider_id
model_id
model_version/revision
modalities
capabilities
input/output limits
context window
supported media constraints
pricing metadata
provider health
rate-limit metadata
region/residency
latency/quality class
availability state
deprecation state
adapter schema version
```

Workflow nodes SHOULD store either:

```text
fixed model reference
```

or:

```text
capability/policy constraints
```

rather than copying provider implementation details.

Provider-specific parameter mapping SHALL live in provider/model adapters.

---

# 58G. Marketplace Execution Funding Mode

Marketplace execution SHALL declare who funds runtime usage.

Initial supported policy SHOULD include:

```text
CONSUMER_CREDITS
CONSUMER_CONNECTED_PROVIDER
CREATOR_SPONSORED_BUDGET
TENANT_SPONSORED_BUDGET
```

Default public Marketplace behavior SHOULD be:

```text
CONSUMER_CREDITS
```

unless the publisher/tenant explicitly configures another allowed mode.

Creator fees, provider/model usage, platform/tenant shares and capability-owner allocations remain Spec 207 economic concerns.

The UI SHALL make funding mode and any material unknown external cost visible before execution.

---

# 58H. Quote / Reservation Before Paid Run

For Marketplace or materially expensive workflows, the run flow SHOULD be:

```text
Validate input
    ↓
Resolve dependencies/models
    ↓
Estimate/quote
    ↓
Spec 207 authorization/reservation as required
    ↓
Canonical run creation
```

A quote SHOULD identify:

```text
estimated platform/model/Skill usage
creator fee
known fixed charges
estimated range
unknown external cost
quote expiration
```

A quote is not a settlement record.

---

# 58I. Marketplace Abuse and Quota Controls

Public workflows SHALL be subject to platform controls such as:

```text
per-user rate limit
per-tenant rate limit
concurrent run limit
daily credit ceiling
publisher-defined usage ceiling
anti-automation abuse checks
input/file size limits
high-cost generation limits
suspension/circuit breaker
```

Rate limiting SHALL distinguish a normal consumer retry from abusive duplicate invocation where practical.

---

# 58J. Creator and Consumer Credential Boundary

Marketplace consumers SHALL never receive creator secrets.

Creator credentials SHALL not automatically subsidize public consumer execution.

If a workflow depends on a user-owned connection/API subscription, the listing SHALL declare that connection requirement and the runtime SHALL resolve the consumer's authorized connection unless an explicit sponsored policy says otherwise.

Connection substitution MUST preserve provider/model compatibility and policy constraints.

---


# 59. Run Contract

Suggested normalized request:

```json
{
  "workflow_version_id": "wfv_12",
  "entry_mode": "RUN_ALL",
  "input": {},
  "run_overrides": {},
  "budget": {},
  "actor": {},
  "idempotency_key": "...",
  "correlation_id": "..."
}
```

Result SHOULD return:

```text
run_id
job_id
status
progress_ref
artifact_refs
billing_ref
trace_ref
```

---

# 60. Execution States

Spec 209 UI SHALL map canonical Feature 195 state into workflow-friendly presentation such as:

```text
Draft
Queued
Running
Waiting for User
Waiting for Approval
Paused
Partial Complete
Validating
Retrying
Failed
Cancelled
Completed
Unknown Outcome
Reconcile Required
```

Do not invent completion if canonical Job state is unresolved.

---

# 61. Node Status Presentation

Visual node states:

```text
✓ Completed
● Running
○ Waiting
! Warning
× Failed
⏸ Paused
↻ Retrying
👤 Waiting for User
```

Status SHALL use icon/label in addition to color.

---

# 62. Builder Layout

Desktop Builder SHALL use the following primary structure:

```text
Header
├─ Workflow name/version
├─ Build / Test / Runs / Analytics / Versions
└─ Run / Publish

Main
├─ Left: lightweight navigation / capability search
├─ Center: top-down canvas
└─ Right: Inspector

Bottom
└─ collapsible Debug Drawer
```

---

# 63. Right Inspector

Inspector SHALL adapt to selected node type.

Common sections:

```text
Overview
Executor
Inputs
Outputs
Bindings
Model
Policy
Retry
Timeout
Approval
Error handling
Permissions
Notes
Advanced
```

---

# 64. Debug Drawer

Required tabs:

```text
Output
Data
Trace
Logs
Artifacts
Cost
Errors
```

Selecting an event SHOULD focus the corresponding canvas node.

---

# 65. Trace Model

Trace SHALL correlate:

```text
workflow_run_id
job_id
attempt_id
node_id
subflow path
agent task id
A2A task id if applicable
MCP invocation id if applicable
Runner/session id
model call
artifact
billing event
approval
```

---

# 66. Workflow Run History

Runs page SHALL support:

- status filters;
- date filters;
- actor filters;
- version filters;
- failure node filter;
- cost filter;
- model/provider filter;
- duration;
- artifact presence;
- search.

A run SHALL remain associated with the exact Workflow Version used.

---

# 67. Versioning

Workflow authoring SHALL use:

```text
Draft versions
Published immutable versions
Version history
Diff
Rollback/fork
```

Example:

```text
v16 Published Marketplace
v17 Draft
v18 Draft Current
```

Editing v18 SHALL NOT mutate v16.

---

# 68. Version Diff

Diff SHALL include:

```text
nodes added/removed/changed
edges changed
input/output contract changed
binding changed
model policy changed
side-effect changed
approval changed
pricing/publish metadata changed
UI schema changed
```

Visual graph diff SHOULD be supported.

---

# 69. Breaking Change Detection

Breaking changes include at least:

- required input added without default;
- input type narrowed incompatibly;
- output removed;
- output type changed incompatibly;
- subflow contract incompatible;
- access requirement increased;
- newly introduced economic/publication side effect;
- model capability no longer available to entitled users.

Marketplace publication SHALL block unacknowledged breaking updates.

---

# 70. Workflow Library

Primary categories:

```text
All
Mine
Team
Shared With Me
Templates
Favorites
Scheduled
Needs Attention
Published
Marketplace
Archived
```

Each workflow card SHOULD surface:

```text
name
owner
latest version
published version
run count
recent success rate
last run
triggers
access
pricing indicator
```

---

# 71. Search and Command Palette

The Builder SHOULD provide a command palette, e.g. `Ctrl/Cmd + K`.

Examples:

```text
Ask AI to modify workflow
Add node
Open failed node
Run workflow
Run until selected
Auto layout
Find node
Open run
Compare version
Publish
```

---

# 72. AI Builder Side Panel

AI Builder SHALL understand:

```text
current workflow definition
current draft version
selected node
available capabilities
schemas
current errors
recent run evidence
permissions
model availability
cost policy
```

It SHALL NOT need raw source code unless explicitly authorized and required.

The Builder SHALL include a pre-build **Execution Options** surface before the
first semantic Workflow Definition is created. The surface SHALL compare
candidate plans using server-authoritative capability and Runner readiness data.

Minimum option-card fields:

```text
option name and purpose
logical capabilities satisfied
runtime / protocol / execution target
Runner or connection used
READY_NOW / SETUP_REQUIRED / RUNNER_OFFLINE_OR_STALE / POLICY_BLOCKED / UNSUPPORTED / UNKNOWN status
exact blockers and setup actions
estimated cost and latency class
privacy, locality and data-access implications
quality / reliability trade-offs
fallback behavior
```

User actions SHALL include:

```text
Choose this plan
Accept recommendation
Choose Auto
Compare details
Set up requirements
Refresh Runner readiness
Use a custom compatible connection
```

The Builder MUST not create a committed Workflow Definition from a material
multi-option request before the user chooses a plan or explicitly accepts the
recommendation. A setup-pending choice may create a Draft only when it is
clearly marked as not ready to run and includes its dependency plan.

---

# 73. AI Optimization

The user MAY ask:

```text
“workflow นี้แพงเกินไป ช่วยวิเคราะห์”
“หาจุดที่ช้า”
“หาจุด failure บ่อย”
“เสนอ fallback”
```

AI MAY propose changes based on run analytics.

It SHALL distinguish recommendation from applied change.

---

# 74. Analytics

Workflow analytics SHOULD include:

```text
runs
success rate
partial-run rate
avg/p50/p95 duration
credits/run
cost by node
slowest nodes
failure by node
retry rate
provider/model distribution
approval wait time
runner/device distribution
marketplace revenue
creator fee revenue
consumer count
```

Sensitive tenant/user data SHALL be access-controlled.

---

# 75. Publish Modes

Workflow MAY be published as:

```text
PRIVATE
WORKSPACE
SPECIFIC_USERS
SHARED_LINK
PUBLIC_MARKETPLACE
```

Access policy SHALL be independent from graph visibility.

---

# 76. Graph Visibility

Publisher SHALL be able to choose, subject to platform policy:

```text
PRIVATE_IMPLEMENTATION
METADATA_ONLY
INSPECTABLE
CLONEABLE
```

A Marketplace Mini App can therefore be public to use while keeping internal workflow implementation private.

---

# 77. Publish Wizard

Minimum publish fields:

```text
Name
Description
Icon/Cover
Category
Tags
Input experience
Result experience
Access
Graph visibility
Version
Dependency policy
Pricing
Consumer model override policy
Terms/license
Support/contact channel
```

Before final publication the system SHALL run a pre-publish audit.

---

# 78. Pre-Publish AI Audit

Required checks SHOULD include:

```text
schema validity
unconnected required inputs
unreachable nodes
loop bounds
recursive cycles
missing secrets declarations
permission escalation
side-effect declaration
economic action authorization path
model availability
fallback availability
provider lock-in warning
cost estimate
dependency availability
unsafe custom UI
data residency conflicts
public exposure of private data
artifact retention
broken subflow references
missing result renderer
```

AI MAY offer "Fix automatically", but fixes still pass normal patch/diff validation.

---

# 79. Marketplace Listing

Marketplace listing SHOULD show:

```text
name
publisher
description
category
capabilities
estimated usage cost/range
creator fee
required integrations
required local Runner/browser if any
supported input types
supported output types
published version
last update
usage statistics
ratings/reviews when enabled
```

Do not hide material cost requirements.

---

# 80. Marketplace Run

A Marketplace consumer SHALL:

1. open Mini App;
2. satisfy required integrations/permissions;
3. provide input;
4. see estimated credit charge/range;
5. run;
6. monitor progress;
7. receive result;
8. receive transparent billing record.

The consumer SHALL NOT need Builder access.

---

# 81. Pricing Models

Spec 209 MAY expose creator pricing configuration such as:

```text
FREE
FIXED_CREDITS_PER_RUN
FIXED_CREDITS_PER_SUCCESS
PERCENTAGE_MARKUP
PER_OUTPUT
ENTITLEMENT_INCLUDED
PRIVATE_CONTRACT
```

Canonical economic authorization, ledger, revenue allocation, settlement and reconciliation SHALL be implemented by Spec 207.

---

# 82. Revenue Participants

Do NOT hard-code a fixed number of revenue recipients.

A single run may involve:

```text
Platform/Core
Tenant/Partner
Workflow Creator
Skill/Plugin Owner
Agent Owner
Other future capability owner
```

Spec 209 SHALL submit usage/revenue facts to Spec 207 using generic recipient/allocation semantics.

---

# 83. Creator Fee Default

Recommended default:

```text
creator_fee_charge_point = SUCCESSFUL_CANONICAL_COMPLETION
```

If provider/model cost was already incurred before failure, those underlying usage costs MAY still be charged according to platform policy.

Creator fee behavior SHALL be disclosed before run.

---

# 84. Marketplace Settlement

Spec 209 SHALL NOT create a marketplace balance ledger.

It SHALL emit attributable economic events to Spec 207, including:

```text
workflow_version
listing
consumer
creator
tenant
component capabilities used
creator pricing rule
run finality
credits consumed
```

Spec 207 owns final accounting.

---

# 85. Marketplace Entitlements

Entitlement MAY come from:

```text
public availability
workspace membership
specific share
purchase/subscription
promotion
partner agreement
admin grant
```

Runtime SHALL re-check entitlement at invocation.

---

# 86. Dependency Rights

A publisher MUST NOT be able to expose a dependency beyond the rights granted by that dependency.

Example:

```text
Workflow is public
but embedded Skill license = workspace-only
→ publication blocked or Skill must be replaced.
```

---

# 87. Marketplace Dependency Health

Published workflows SHALL surface dependency degradation:

```text
Healthy
Degraded
Unavailable
Requires publisher update
```

The platform SHOULD preflight required capabilities before accepting paid runs.

---

# 88. Mini App UI Generation

Mini App input UI SHALL be generated from Workflow input schema by default.

Publisher MAY customize declarative UI.

Example:

```text
Professional Video Editor

Videos
[ Drop files / Library ]

Reference Images
[ Add images ]

Goal
[........................]

Maximum Duration
[ 3 minutes ]

Aspect Ratio
[ 9:16 ]

Editing Style
[ Cinematic ] [ Modern ] [...]

             [ Run Workflow ]
```

---

# 89. Mini App Progress UI

Runtime progress SHOULD show high-level stages, not every internal tool call:

```text
Analyze Footage      ✓
Create Edit Plan     ✓
Edit Video           ●
Quality Check        ○
Human Review         ○
Result               ○
```

A user with debug permission MAY drill down.

---

# 90. Mini App Result UI

Result view MAY show:

- video/image/audio preview;
- files;
- report;
- structured summary;
- cost;
- run trace link;
- Save to Library;
- Continue in another workflow;
- Retry/Refine.

---

# 91. Sharing

Share rules SHALL support:

```text
viewer
runner
editor
publisher
admin/owner
```

Roles MUST be scoped to tenant/workspace and object.

"Can run" SHALL NOT automatically mean "can inspect implementation".

---

# 92. Tenant Isolation

All objects SHALL be tenant-aware:

```text
workflow
workflow version
run
share
publication
listing
pricing
analytics
pinned data
test fixture
```

Cross-tenant access requires explicit share/marketplace entitlement.

---

# 93. Secrets

Workflow definitions SHALL store only secret references.

Example:

```json
{
  "secret_ref": "secret://tenant/.../openrouter-key"
}
```

Never:

```json
{
  "api_key": "sk-..."
}
```

AI Builder SHALL never reveal secret values in its context or generated diff.

---

# 94. Permission Inheritance

A workflow cannot grant more permission than its creator/publisher is permitted to delegate.

Runtime permissions SHALL be computed from:

```text
consumer identity
tenant policy
workflow policy
node capability policy
dependency policy
device/session availability
economic mandate
```

---

# 95. Marketplace Security Review

Public Marketplace publication SHOULD perform stronger checks than private publication, including:

- hidden side effects;
- exfiltration paths;
- suspicious webhooks;
- prompt injection exposure;
- arbitrary code execution;
- unrestricted Computer Use;
- credential misuse;
- public publication actions;
- deletion actions;
- economic side effects;
- unsafe external endpoints;
- policy bypass through fallback.

---

# 96. Prompt Injection / Untrusted Data

AI Builder and runtime agents SHALL treat:

```text
uploaded documents
web pages
external agent output
MCP output
marketplace metadata
workflow descriptions
```

as potentially untrusted content.

Untrusted data SHALL NOT gain authoring authority or bypass policy.

---

# 97. Immutable Published Snapshot

A published version SHALL be content-addressable or otherwise tamper-evident.

Recommended metadata:

```text
workflow_version_hash
dependency_manifest_hash
ui_schema_hash
pricing_revision
published_at
publisher_id
```

Run records SHALL preserve the exact snapshot identity.

---

# 98. API Surface — Authoring

Suggested endpoints/commands:

```text
workflow.create
workflow.get
workflow.list
workflow.create_draft
workflow.ai.propose
workflow.ai.refine
workflow.patch.preview
workflow.patch.apply
workflow.validate
workflow.compile
workflow.build_intent
workflow.list_execution_options
workflow.refresh_execution_option_readiness
workflow.select_execution_option
workflow.create_draft_from_selected_option
workflow.diff
workflow.version.publish
workflow.version.rollback
```

Exact transport naming may follow existing SmartAIHub API conventions.

---

# 99. API Surface — Execution

Suggested commands:

```text
workflow.run
workflow.run_until
workflow.run_from
workflow.run_node
workflow.run_subflow
workflow.resume
workflow.cancel
workflow.pause
workflow.retry
workflow.status
workflow.events
workflow.result
workflow.artifacts
```

These SHALL map to canonical Feature 195/196 behavior.

---

# 100. API Surface — Marketplace

Suggested commands:

```text
workflow.app.publish
workflow.app.unpublish
workflow.app.share
marketplace.list
marketplace.get
marketplace.invoke
marketplace.estimate_cost
marketplace.entitlement
marketplace.creator_pricing.update
marketplace.dependency_check
miniapp.hub.list
miniapp.hub.register
miniapp.hub.unregister
miniapp.hub.bookmark
miniapp.hub.unbookmark
miniapp.hub.pin
miniapp.hub.unpin
miniapp.hub.remove
miniapp.hub.select
miniapp.hub.search
miniapp.dependencies.get
miniapp.dependencies.download
miniapp.dependencies.verify
miniapp.dependencies.install
miniapp.dependencies.install_status
miniapp.readiness.check
catalog.search
catalog.index_status
```

Economic writes SHALL call Spec 207 services rather than implementing a new ledger.

`miniapp.hub.*` is the user-facing central manager contract. `catalog.search` MAY
be shared by Builder, Mini App Hub, Marketplace and Assistant surfaces, but every
caller MUST receive the same ACL-filtered result contract. `catalog.index_status`
is an operator/owner surface and MUST NOT expose private catalog metadata to an
unauthorized user.

---

# 101. Data Model — Core

Suggested tables/entities:

```text
workflow_definitions
workflow_versions
workflow_views
workflow_nodes
workflow_edges
workflow_io_contracts
workflow_bindings
workflow_subflow_refs
workflow_ui_schemas
workflow_result_schemas
workflow_model_policies
workflow_test_fixtures
workflow_pinned_data
workflow_shares
workflow_publications
workflow_apps
marketplace_listings
workflow_creator_pricing
mini_app_user_library
mini_app_dependency_manifests
mini_app_skill_bundle_artifacts
mini_app_dependency_installations
mini_app_readiness_snapshots
capability_catalog_index_records
```

Execution status SHALL NOT be duplicated as a new canonical Job state table.
Dependency installation, readiness probing and catalog indexing SHALL use the
canonical Feature 195 Job/outbox control plane or the owning Runner/Skill
package protocol; the entities above are projections, relationships and
immutable package metadata, not a second queue or runtime state authority.

---

# 102. Data Model — Workflow Definition

Suggested fields:

```text
id
tenant_id
owner_user_id
name
description
current_draft_version_id
latest_published_version_id
created_at
updated_at
archived_at
```

---

# 103. Data Model — Workflow Version

Suggested fields:

```text
id
workflow_id
version_number
status
definition_json
input_schema_json
output_schema_json
default_ui_schema_json
result_renderer_json
model_policy_id
dependency_manifest_json
execution_preference_json
execution_constraints_json
selected_readiness_snapshot_ref
content_hash
created_by
created_at
published_at
```

Published records SHALL be immutable.

---

# 104. Data Model — Bindings

Suggested binding:

```json
{
  "target_node_id": "generate_video",
  "target_field": "prompt",
  "source": {
    "kind": "NODE_OUTPUT",
    "node_id": "script_agent",
    "path": "$.video_prompt"
  },
  "transform": null,
  "expected_type": "String"
}
```

---

# 105. Data Model — Publication

Suggested:

```text
workflow_version_id
app_slug
access_mode
graph_visibility
publisher_id
tenant_id
input_ui_schema
result_ui_schema
pricing_rule_id
dependency_policy
status
published_at
```

---

# 106. Execution Projection

Spec 209 MAY maintain a read-optimized projection for fast Workflow Run UI.

It SHALL be reconstructible from canonical events and SHALL NOT become a competing execution source of truth.

---

# 107. Events

Recommended domain events:

```text
workflow.created
workflow.draft.created
workflow.patch.proposed
workflow.patch.applied
workflow.validated
workflow.version.published
workflow.run.requested
workflow.run.partial_completed
workflow.run.waiting_user
workflow.run.waiting_approval
workflow.run.completed
workflow.run.failed
workflow.app.published
workflow.marketplace.invoked
workflow.creator_fee.attributed
```

Event names may adapt to existing event conventions.

---

# 108. Real-Time Transport

Builder/run UI SHOULD receive progress by the existing platform real-time mechanism.

Requirements:

- reconnect;
- sequence/cursor;
- duplicate event tolerance;
- missed-event recovery;
- background continuation after tab closes;
- no requirement for one long HTTP request.

---

# 109. Large Artifacts

Large files SHALL move through Library/Asset references.

Workflow state MUST NOT embed base64 video/image payloads in graph JSON or database event rows.

---

# 110. Performance Targets

Initial design targets:

```text
Typical graph: 5–100 nodes
Large graph:   100–500 nodes
Subflows:      lazy-loaded
Canvas:        interactive at typical graph size
Run progress:  event-driven
Logs:          paginated/streamed
Artifacts:     reference-based
```

Nodes inside collapsed subflows SHOULD NOT all render in the parent canvas.

---

# 111. Layout Performance

Automatic layout SHOULD run off the main interaction path for large graphs, e.g. Web Worker where practical.

Re-layout SHALL preserve user annotations and SHOULD minimize unnecessary movement.

---

# 112. Accessibility

Builder and Mini App SHALL support:

- keyboard navigation;
- focus visibility;
- non-color status indicators;
- accessible form labels;
- readable zoom;
- screen reader labels for node status and connections;
- reduced-motion preference.

Mini App/run experience SHALL be responsive for tablets.

Full visual authoring MAY remain desktop-first.

---

# 113. Internationalization

UI strings SHALL support i18n.

Workflow metadata MAY provide localized:

```text
name
description
input labels
help text
result labels
marketplace listing text
```

Workflow IDs/schemas remain language-neutral.

---

# 114. Import / Export

Workflow SHALL support deterministic export/import.

Export SHALL NOT include secret values.

Import SHALL validate:

- schema version;
- dependencies;
- permissions;
- unknown node types;
- UI renderer availability;
- model policy;
- marketplace-only restrictions.

---

# 115. Template Model

A Workflow Template is distinct from a Workflow Version.

Template MAY provide:

```text
starter graph
parameter placeholders
recommended model policy
sample input
sample UI
documentation
```

Creating from template produces a user-owned draft.

---

# 116. Fork / Clone

Publisher MAY permit or deny cloning subject to platform policy.

Fork lineage SHOULD record:

```text
source_workflow
source_version
forked_at
license
```

Marketplace run entitlement does not imply clone rights.

---

# 117. Test Fixtures

Workflow author SHALL be able to save versioned test fixtures:

```text
fixture name
workflow input
mock/pinned outputs
expected status
expected outputs
cost ceiling
duration ceiling
```

Fixtures SHALL never contain raw secrets.

---

# 118. Automated Validation

Compiler SHOULD run:

```text
schema validation
graph reachability
required binding validation
type validation
loop/recursion validation
side-effect declaration
approval requirement
permission validation
dependency validation
model capability validation
budget validation
publishability validation
```

---

# 119. Workflow Unit Tests

Node/subflow testing SHALL support:

- deterministic transforms;
- condition logic;
- schema mapping;
- model mock;
- capability mock;
- failure injection;
- timeout;
- malformed output;
- provider unavailable;
- permission denied.

---

# 120. End-to-End Test Matrix

Required E2E scenarios include:

1. AI creates a valid workflow from Thai natural language.
2. A multi-option build request shows candidate plans before creating a semantic workflow.
3. Builder readiness reflects the user's installed Runner/tool/Skill/connection state.
4. Ready-now, setup-required, stale/offline, policy-blocked, unsupported and unknown states render distinctly.
5. User selects a compatible alternative without duplicating the workflow.
6. Auto is recorded only after explicit user acceptance.
7. Setup-required selection creates a clearly marked non-runnable Draft.
8. Builder never silently installs, signs in, grants access or switches tools.
9. AI modifies an existing workflow and produces correct diff.
10. User rejects proposed AI patch; no semantic change occurs.
11. Top-down auto-layout remains readable after branching.
12. Parent workflow calls nested subflow.
13. Subflow version pinned and reproducible.
14. Data Source Picker binds compatible output.
15. Incompatible binding is rejected.
16. Default form generated from input schema.
17. Custom declarative UI renders.
18. Full run completes.
19. Run-until stops at requested node.
20. Resume continues without rerunning valid upstream nodes.
21. Run-from requires upstream checkpoint/input.
22. Single node test uses pinned data.
23. LLM fixed model executes.
24. Auto model policy selects compatible model.
25. Media model fallback works only within allowed policy.
26. External A2A agent uses Spec 206 route.
27. Non-A2A external agent uses Spec 200 fallback.
28. MCP node uses Spec 199.
29. Computer Use routes through Spec 208.
30. Local capability routes through Runner/Feature 197.
31. Human approval pauses and resumes.
32. Ask User pauses and resumes.
33. Browser tab closes; durable run continues.
34. Retry honors idempotency/side-effect policy.
35. Published version remains immutable after new draft edits.
36. Private Mini App access denied to unauthorized user.
37. Shared user can run but cannot inspect hidden graph.
38. Marketplace consumer receives cost estimate.
39. Credits deducted and creator revenue attribution reaches Spec 207.
40. Failed run does not incorrectly create success-only creator fee.
41. Tenant isolation holds.
42. Secret references never leak into exported workflow.
43. Marketplace security audit blocks unsafe workflow.
44. Dependency becomes unavailable and listing/run reflects degradation.
45. Old run remains traceable to exact published snapshot.

---

# 121. AI Builder Evaluation Suite

AI Builder SHALL be evaluated on:

```text
valid graph rate
binding correctness
schema correctness
capability reuse rate
execution-option completeness
readiness-state truthfulness
recommendation acceptance and override rate
compatible-alternative preservation rate
silent-tool-switch rate (must be zero)
duplicate-capability creation rate
unbounded loop rate
permission violation rate
estimated vs actual cost
repair success
user correction rate
workflow completion rate
```

No single LLM score SHALL be treated as sufficient proof of correctness.

---

# 122. AI Builder Fallback

If AI cannot confidently determine a safe design, it SHALL ask the user a focused question or present alternatives.

It SHALL NOT invent unavailable capabilities.

It SHALL distinguish:

```text
known capability
inferred requirement
unavailable dependency
future placeholder
```

---

# 123. AI Builder Provider Independence

The AI Builder interface SHALL NOT be hard-coded to one LLM vendor.

The Builder MAY initially use a preferred model, but its contract SHALL use SmartAIHub's model/cognitive abstraction.

---

# 124. Model Availability Drift

A saved workflow SHALL not become structurally invalid merely because one external model disappears.

Possible resolution:

```text
use allowed equivalent fallback
ask owner to replace
temporarily degrade listing
block run if capability contract cannot be met
```

The original immutable published version identity remains preserved.

---

# 125. Dependency Manifest

Every version SHOULD resolve a dependency manifest:

```text
skills
subflows
MCP capabilities
external agents
A2A capabilities
model capability constraints
approved UI renderers
Runner requirements
Computer Use requirements
```

Manifest is used for publish audit and run preflight.

---

# 126. Run Preflight

Before paid/high-cost execution, preflight SHOULD validate:

```text
input schema
access entitlement
credits/budget
model availability
required integrations
required Runner/device
dependency health
approval requirements
secret refs
tenant policy
```

Preflight MUST NOT reserve or charge money outside Spec 207 rules.

Run preflight is distinct from the Builder's pre-build option discovery. The
Builder may use a read-only readiness snapshot to compare plans before a flow
exists; the final run preflight MUST refresh server-authoritative readiness,
entitlement, policy, budget and dependency state immediately before execution.
The two checks MUST NOT be collapsed into a client-side readiness badge.

---

# 127. Dry Run

Dry Run SHOULD:

- validate graph;
- resolve dependencies;
- estimate cost;
- identify approvals;
- identify required devices/integrations;
- not invoke expensive/side-effecting execution unless explicitly configured.

---

# 128. Debug Run

Debug Run SHOULD enable richer event/trace capture and optional breakpoints.

Debug SHALL NOT silently change production policy.

Sensitive payloads remain redacted.

---

# 129. Breakpoints

A node MAY have an authoring/debug breakpoint:

```text
before node
after node
on failure
on condition
```

Breakpoint is a debug policy, not a business-logic approval.

---

# 130. Run Replay

The system SHOULD support replay using captured/pinned inputs where policy allows.

Replay SHALL clearly distinguish:

```text
historical evidence
new execution
simulated execution
```

Side-effecting nodes MUST NOT replay blindly.

---

# 131. Analytics-Based Optimization

AI MAY use aggregated authorized run history to suggest:

- cheaper model;
- faster provider;
- better retry;
- split subflow;
- cache/pin reusable output;
- stronger validation;
- missing fallback.

Applying optimization follows normal patch/diff rules.

---

# 132. Collaboration

Workflow draft SHOULD support:

- comments/notes;
- presence;
- last editor;
- change history;
- optimistic conflict handling;
- version-based merge/refresh.

Semantic edits MUST not silently overwrite newer changes.

---

# 133. Approval for Publishing

Tenant policy MAY require:

```text
owner approval
admin approval
security review
marketplace review
economic/pricing review
```

before public publication.

---

# 134. Marketplace Moderation

Public Marketplace SHOULD support:

```text
draft
submitted
under_review
approved
rejected
suspended
deprecated
unpublished
```

Suspension SHALL not erase historical run/accounting evidence.

---

# 135. Deprecation

Publisher MAY deprecate a version/listing.

Existing immutable run history remains.

Platform MAY define grace period for pinned consumers.

---

# 136. Version Update Policy for Consumers

Consumer/workspace MAY choose:

```text
PIN_VERSION
AUTO_COMPATIBLE
ASK_BEFORE_UPDATE
FOLLOW_STABLE
```

Public Mini Apps opened directly MAY default to current published stable version.

---

# 137. Failure Transparency

Mini App SHALL surface understandable failure information without leaking internal secrets.

Example:

```text
Video generation provider is currently unavailable.
No allowed fallback can meet this workflow's quality policy.

[Retry]
[Notify Me]
```

Debug-enabled authors MAY inspect deeper trace.

---

# 138. Provenance

Workflow output SHOULD preserve provenance:

```text
workflow version
node path
model/provider where disclosable
source artifacts
generated artifacts
external agent route
Runner/device class
approval records
```

Use existing platform provenance contracts when available.

---

# 139. Data Retention

Workflow configs, run metadata, trace payloads and artifacts MAY have different retention.

Tenant/policy controls SHALL be respected.

Deletion SHALL account for:

- published immutable history;
- accounting records;
- legal/audit retention;
- derived artifacts;
- marketplace obligations.

---

# 140. Privacy / Residency

Workflow compiler and Model Resolver SHALL respect:

```text
data residency
local-only requirements
tenant privacy policy
model/provider eligibility
artifact location
```

A cheaper/faster model that violates residency is not eligible.

---

# 141. External User-Owned Subscription Cost

If an external agent/model/tool uses a user-owned subscription or key and SmartAIHub cannot know exact cost:

```text
external_user_owned_cost = unknown
```

not:

```text
0
```

---

# 142. Observability Dashboards

Operations SHOULD monitor:

```text
workflow compile errors
AI patch failures
invalid bindings
run dispatch
node failure rate
checkpoint reuse
provider fallback
model drift
marketplace invocation
creator attribution
billing mismatch
dependency outage
```

---

# 143. Alerts

Suggested alerts:

- high workflow failure rate;
- published dependency missing;
- creator attribution mismatch;
- workflow version hash mismatch;
- runaway loop prevented;
- budget exhaustion spike;
- model fallback spike;
- schema incompatibility after dependency update.

---

# 144. Feature Flags

Rollout SHOULD support flags for:

```text
AI authoring
manual canvas edit
nested subflows
partial run
model policy
mini app publish
shared link
marketplace publish
creator fee
public marketplace
```

---

# 145. Migration Strategy

## Phase 0 — Foundation
- canonical Workflow Definition schema;
- version tables;
- compiler;
- Feature 195/196 integration;
- schemas/bindings.

## Phase 1 — AI-First Builder
- natural-language create;
- patch/diff;
- top-down canvas;
- inspector;
- validation.

## Phase 2 — Debug / Subflows
- nested flows;
- checkpoints;
- partial run;
- pinned test data;
- run history;
- trace.

## Phase 3 — Mini Apps
- schema-driven input;
- result renderer;
- private/workspace sharing;
- run-only UX.

## Phase 4 — Marketplace
- publish review;
- immutable versions;
- entitlement;
- pricing;
- Spec 207 attribution.

## Phase 5 — Optimization
- analytics;
- AI optimization;
- advanced marketplace;
- template/fork ecosystem.

---

# 146. Existing Skill Migration

Existing Skill SHALL be exposable as a typed node via its schema.

Do not rewrite Skill logic merely to fit Workflow Studio.

If Skill already has:

```text
input.schema.json
ui.schema.json
output.schema.json
```

those artifacts SHOULD be reused.

---

# 147. Existing Flow Migration

Approved, non-retired SmartAIHub flow definitions and saved LangGraph routes
MAY be imported into the Workflow Definition model where semantics can be
represented. The legacy `/workflows` custom engine, Agency/work request or
workpack data, OpenSandbox jobs and Docker/OpenSandbox dispatch are explicitly
out of scope and MUST NOT be imported or revived. Unsupported constructs SHALL
be flagged for remediation rather than silently translated.

Unsupported constructs SHALL be flagged explicitly rather than silently lost.

---

# 148. Existing Chat / Universal Assistant Integration

Universal Assistant SHALL be able to request the following through the Feature
198 Chat/Assistant ingress and the canonical Feature 196 → Feature 195 path:

```text
create workflow
modify workflow
run workflow
run until node
inspect run
open builder
publish workflow (subject to permission)
```

The Assistant and Workflow Studio SHALL share the same workflow APIs.

No separate "chat-only workflow format".

---

# 149. No Parallel Architecture Rule

The implementation MUST NOT create:

- a new execution queue independent of Feature 195;
- a second Capability Registry;
- a second Runner channel;
- a separate MCP manager;
- a separate agent gateway;
- a separate credit ledger;
- a marketplace-only billing engine;
- a duplicate Library artifact store;
- a mini-app-only runtime.

---

# 150. Recommended Frontend Components

Initial recommendation:

```text
Graph:          React Flow / XYFlow
Auto layout:    ELK.js layered/compound layout
Forms:          JSON Forms-compatible schema/UI schema
State:          existing SmartAIHub frontend conventions
Real-time:      existing platform event transport
```

These are replaceable implementation details. The canonical platform contracts are the schemas and APIs.

---

# 151. External Reference Notes

Non-normative technical references used when shaping this design:

- React Flow / XYFlow supports custom nodes, parent-child relationships, groups and subflows.
- ELK layered layout supports hierarchical graph layout suitable for top-down DAG visualization.
- JSON Forms separates JSON data schema from UI schema and can generate a default UI schema.
- OpenAI Agents SDK provides agents, tools, handoffs, guardrails, sessions and tracing; SmartAIHub still owns durable cross-system orchestration.

References:
- https://reactflow.dev/learn/layouting/sub-flows
- https://reactflow.dev/examples
- https://eclipse.dev/elk/
- https://jsonforms.io/docs/
- https://jsonforms.io/docs/uischema/
- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/tracing/

---

# 152. Suggested Repository Layout

```text
specs/feature/209-ai-workflow-studio-miniapp-marketplace/
├── spec.md
├── mockups/
│   ├── 01-main-builder-top-down.png
│   ├── 02-subflow-data-binding.png
│   └── 03-run-debug-mini-app.png
├── examples/
│   ├── workflow-definition.example.json
│   ├── mini-app-ui-schema.example.json
│   └── marketplace-listing.example.json
└── README.md
```

---

# 153. Acceptance Criteria — Authoring

- [ ] New workflow opens with AI-first authoring.
- [ ] User can create workflow from natural-language Thai or English.
- [ ] AI uses shared Capability Registry.
- [ ] AI produces structured patch operations.
- [ ] Patch validates before apply.
- [ ] User can review semantic diff.
- [ ] Rejected patch produces no semantic mutation.
- [ ] Canvas defaults top-down.
- [ ] Manual drag/wiring is optional.
- [ ] Visual View state is separated from semantic Definition.
- [ ] Existing workflow can be modified through natural language.
- [ ] AI can explain why a node/capability was selected.
- [ ] AI can identify unavailable dependencies rather than invent them.

---

# 154. Acceptance Criteria — Composition / Data

- [ ] Subflows have explicit typed contracts.
- [ ] Parent flow does not bind to private subflow internals.
- [ ] Nested drill-down works.
- [ ] Versioned subflow reference works.
- [ ] Binding picker shows compatible previous outputs.
- [ ] Type mismatch is blocked.
- [ ] Safe transform can be inserted explicitly.
- [ ] Data edges can be hidden independently from control edges.
- [ ] Input schema generates usable default UI.
- [ ] Custom UI schema can refine form layout.
- [ ] Result schema selects correct renderer.
- [ ] No arbitrary marketplace JavaScript injection.

---

# 155. Acceptance Criteria — Runtime

- [ ] Full run works.
- [ ] Run-until works.
- [ ] Run-from works with validated upstream state.
- [ ] Single-node test works.
- [ ] Subflow-only test works.
- [ ] Partial run persists checkpoint.
- [ ] Resume does not rerun valid upstream nodes by default.
- [ ] Retry respects Feature 195 semantics.
- [ ] Side-effect retry is safe/idempotent or blocked.
- [ ] Human approval pauses durably.
- [ ] Runtime user input pauses durably.
- [ ] Browser tab may close without losing long-running run.
- [ ] Run records exact workflow version.
- [ ] Artifacts are Library/Asset references.
- [ ] Trace correlates child agent/tool/model jobs.

---

# 156. Acceptance Criteria — Models

- [ ] Every AI/media node supports model policy configuration.
- [ ] Fixed model works.
- [ ] Auto compatible selection works.
- [ ] Workflow-level policy works.
- [ ] Node override works.
- [ ] Tenant policy overrides ineligible node choices.
- [ ] Model fallback obeys equivalence policy.
- [ ] Material cost/quality/privacy downgrade does not occur silently.
- [ ] User-selectable models can be exposed in Mini App when allowed.
- [ ] Cost estimate reflects model selection.
- [ ] Unknown user-owned cost is not reported as zero.

---

# 157. Acceptance Criteria — Debug / Observability

- [ ] Bottom debug drawer exists.
- [ ] Output/Data/Trace/Logs/Artifacts/Cost views exist.
- [ ] Clicking trace event focuses node.
- [ ] Pinned test data works.
- [ ] Run history filters work.
- [ ] Node timing and cost visible.
- [ ] Failed node visible on canvas.
- [ ] Retry actions available according to policy.
- [ ] Version diff includes semantic and model changes.
- [ ] Sensitive trace payload is redacted.

---

# 158. Acceptance Criteria — Mini App

- [ ] Workflow publishes to reusable Mini App.
- [ ] Mini App uses schema-driven input UI.
- [ ] Mini App can render typed result.
- [ ] Normal consumer need not open Builder.
- [ ] Run progress shows high-level stages.
- [ ] Mini App responsive on tablet.
- [ ] Workflow can be Private.
- [ ] Workflow can be Workspace-scoped.
- [ ] Workflow can share to specific users.
- [ ] Workflow can use shared link subject to policy.
- [ ] Graph visibility is independently configurable.

---

# 159. Acceptance Criteria — Marketplace / Economics

- [ ] Public Marketplace publish exists.
- [ ] Published version immutable.
- [ ] Publish preflight/audit exists.
- [ ] Dependency rights validated.
- [ ] Dependency health preflight exists.
- [ ] Creator pricing rule configurable.
- [ ] Consumer sees estimated usage cost.
- [ ] Consumer sees creator fee.
- [ ] Run usage attributed to exact workflow/version/listing.
- [ ] Economic events route to Spec 207.
- [ ] No duplicate marketplace ledger exists.
- [ ] Generic multi-recipient allocation supported by economic plane.
- [ ] Success-only creator fee behaves correctly by default.
- [ ] Failed/unknown-outcome execution does not produce false successful settlement.
- [ ] Marketplace entitlement rechecked at run time.
- [ ] Public use does not imply graph/source visibility.
- [ ] Publisher can release a new version without mutating previous consumers' historical runs.

---

# 160. Acceptance Criteria — Security / Multi-Tenant

- [ ] Workflow secret values never stored in definition.
- [ ] Secret values never exposed to AI Builder.
- [ ] Tenant isolation enforced.
- [ ] Consumer cannot escalate creator permissions.
- [ ] Public workflow side effects are declared.
- [ ] Computer Use cannot bypass Spec 208 policy.
- [ ] Economic actions cannot bypass Spec 207 mandate.
- [ ] MCP denial cannot be bypassed by fallback route.
- [ ] Unsafe marketplace workflow can be suspended.
- [ ] Workflow export contains no raw secrets.
- [ ] Published snapshot is tamper-evident.
- [ ] Run records exact snapshot hash/version.

---


# 160A. Acceptance Criteria — AI Execution / Capability / Dynamic UI

- [ ] A multi-option build request shows candidate execution plans before creating a semantic Workflow Definition.
- [ ] Candidate plans include Runner/tool/connection readiness, setup actions and cost/privacy/locality trade-offs.
- [ ] User can select a compatible plan or explicitly accept the recommendation/Auto choice before flow creation.
- [ ] A preferred runtime/provider/tool is advisory unless a versioned hard capability contract proves otherwise.
- [ ] Setup-required plans create only an explicitly marked Draft and never claim run readiness.
- [ ] User can ask AI to run the full workflow.
- [ ] User can ask AI to run until a named node and stop.
- [ ] User can ask AI to resume from a checkpoint/run.
- [ ] Natural-language execution maps to the same canonical run APIs as UI controls.
- [ ] Published workflow can register as a shared Capability when enabled.
- [ ] Capability discovery exposes contract without leaking private graph internals.
- [ ] Hidden bound fields do not appear redundantly in Mini App input UI.
- [ ] Large forms support section/tab/wizard organization.
- [ ] Conditional UI remains backed by server-side validation.
- [ ] Creator can modify Mini App UI through AI-generated declarative schema patches.
- [ ] Model dropdown/resolution is backed by shared model registry/capability metadata.
- [ ] Public Marketplace defaults to consumer-credit funding unless explicitly configured otherwise.
- [ ] Consumer never receives creator secrets.
- [ ] Paid Marketplace run can produce a pre-run quote/reservation flow through Spec 207.
- [ ] Public workflows are protected by rate/concurrency/cost abuse controls.

---


# 160B. Revision 2 Cross-Spec Workflow Ownership — Ephemeral vs Persisted

Feature 196 may compose temporary execution plans, temporary LangGraph routes or ephemeral helpers while solving a user goal.

Spec 209 SHALL become authoritative when such a route is intentionally converted into a **saved reusable workflow product**.

Normative ownership:

```text
Feature 196
    owns:
    - goal interpretation
    - temporary plan/DAG
    - route alternatives
    - replanning
    - ephemeral helper composition

Spec 209
    owns:
    - persisted Workflow Definition
    - reusable Workflow Version
    - authoring UX
    - typed workflow contract
    - workflow UI schema
    - publishing / Mini App
    - marketplace lifecycle
```

Promotion path:

```text
successful temporary trajectory
        ↓
candidate reusable route
        ↓
Spec 209 import/normalize
        ↓
schema + dependency + security validation
        ↓
creator review
        ↓
saved Draft Workflow Version
```

Feature 196 MUST NOT create a second long-lived saved-flow format that competes with Spec 209.

Spec 209 MUST NOT replace Feature 196's dynamic per-run replanning.

---

# 160C. Trigger Reliability, Webhook Security, Schedule Time Zone and Delivery Semantics

Workflow triggers SHALL have explicit delivery semantics.

## Schedule triggers

A schedule MUST persist:

```text
timezone
calendar expression / recurrence
DST policy
missed-run policy
maximum catch-up count
overlap policy
enabled state
last scheduled fire
next scheduled fire
```

DST policy MUST define behavior for:

```text
nonexistent local time
duplicated local time
timezone rule changes
```

Missed-run policy SHALL support at least:

```text
SKIP
RUN_ONCE
CATCH_UP_LIMITED
```

A scheduler restart MUST NOT silently create unlimited historical catch-up executions.

## Webhooks

Webhook triggers SHALL support:

```text
secret/signature verification
timestamp/replay window
request-size limits
content-type validation
idempotency key / event id
source allow policy where applicable
rate limiting
payload schema validation
```

Webhook secrets are Secret References, never workflow JSON values.

## Event delivery

Internal event triggers SHALL assume practical distributed delivery semantics such as **at-least-once** unless a stronger upstream guarantee is explicitly available.

Therefore trigger handling MUST be duplicate-tolerant.

Exactly-once business effects MUST be achieved through idempotency/finality controls, not by claiming the transport itself is magically exactly-once.

---

# 160D. Run Concurrency, Re-Entrancy and Duplicate Invocation Policy

Every Workflow/Trigger MAY define a concurrency policy.

Minimum policies:

```text
ALLOW_PARALLEL
QUEUE
SKIP_IF_RUNNING
CANCEL_PREVIOUS
REPLACE_PENDING
SINGLETON
KEYED_SINGLETON
```

`KEYED_SINGLETON` SHALL derive a stable key from declared input fields, for example:

```text
tenant_id + project_id
```

The runtime SHALL distinguish:

```text
duplicate invocation
legitimate repeated run
retry
resume
scheduled overlap
webhook redelivery
```

Run creation APIs SHALL accept an idempotency key.

A duplicate request using the same valid idempotency scope MUST NOT create a second paid execution.

Concurrency limits MAY exist at:

```text
workflow
workflow version
tenant
user
trigger
node category
provider/model
marketplace listing
```

Canonical dispatch/enforcement remains Feature 195-owned.

---

# 160E. Collection Processing — For Each, Map, Batch, Reduce and Fan-Out Safety

Real workflows frequently process arrays of files, scenes, records or assets.

Spec 209 SHALL include collection primitives:

```text
FOR_EACH
MAP
BATCH
FILTER
REDUCE
COLLECT
```

A collection node SHALL declare:

```text
input collection type
item type
output item type
max item count
batch size
max parallelism
failure policy
ordering requirement
budget policy
```

Failure policy SHALL support:

```text
FAIL_FAST
CONTINUE_AND_REPORT
RETRY_FAILED_ITEMS
REQUIRE_ALL
ALLOW_PARTIAL
```

Fan-out MUST be bounded.

The compiler/runtime MUST prevent accidental creation of thousands of paid model/media calls from an unbounded array without an allowed budget/concurrency policy.

Collection iteration outputs SHALL preserve item correlation/provenance.

---

# 160F. Production Cache / Memoization Contract

Pinned test data is not a production cache.

Spec 209 MAY support production cache/memoization for nodes that declare cache-safe semantics.

Cache policy:

```text
DISABLED
RUN_LOCAL
WORKFLOW
TENANT
GLOBAL_ALLOWED
```

A cache key SHALL include relevant semantic inputs such as:

```text
node revision
normalized input hash
dependency version
model/model-policy revision where output can change
prompt/config revision
tenant/privacy scope
```

Cache MUST NOT cross tenant/privacy boundaries unless a capability is explicitly designed and authorized for such reuse.

Side-effecting nodes SHALL NOT be memoized as if execution occurred.

Cache hit/miss and source SHALL be observable.

---

# 160G. Pause, Cancel, Cleanup, Finalizer and Compensation Semantics

`Pause` and `Cancel` SHALL be defined beyond UI buttons.

## Pause

Pause SHALL distinguish:

```text
PAUSE_BEFORE_NEXT_NODE
PAUSE_COOPERATIVE_CURRENT_NODE
PAUSE_NOT_SUPPORTED_BY_PROVIDER
```

The UI MUST not claim a running external generation is paused if the provider cannot actually pause it.

## Cancel

Cancellation SHALL propagate to active child work where technically supported:

```text
Feature 195 child Jobs
A2A tasks
Spec 200 external-agent tasks
MCP invocation where cancellable
Runner sessions
media provider jobs
Computer Use sessions
```

If cancellation finality is unknown, canonical status SHALL reflect that uncertainty.

## Finalizer

Workflow MAY define an always-run finalizer for:

```text
temporary-file cleanup
session release
lock release
temporary browser/profile cleanup
notification
diagnostic capture
```

Finalizer failure SHALL be observable and MUST NOT rewrite a successful business result into a false success/failure without policy.

## Compensation

For reversible side effects, a node MAY declare a compensation action.

Compensation SHALL be explicit and auditable.

Economic compensation/refund finality remains Spec 207-owned.

---

# 160H. Workflow Version Pinning, Resume Compatibility and Failed-Run Repair

Every run SHALL pin the exact Workflow Version and dependency snapshot used at run creation.

A Draft edit SHALL NOT mutate an in-flight run.

## Resume

Default resume:

```text
same workflow version
same compatible dependency snapshot
validated checkpoint
```

## Fix-and-resume

A failed run MAY be repaired using a newer Draft/Version only through an explicit compatibility flow:

```text
Failed Run v12
    ↓
Fork / Open as Repair Draft
    ↓
edit to v13
    ↓
checkpoint compatibility analysis
    ↓
re-bind / migrate compatible checkpoint data
    ↓
new Run on v13
```

The platform SHALL NOT silently continue a v12 run on v13 code.

A repair run SHALL retain lineage to the failed source run.

---

# 160I. Environments and Promotion — Dev / Test / Production

Workflow authoring SHALL support environment-aware deployment without copying raw secrets into definitions.

Minimum logical environments:

```text
DEV
TEST/STAGING
PRODUCTION
```

Environment-specific values MAY include:

```text
Secret References
connections
webhook endpoints
model/provider policy
Runner pool
data residency
test dataset
rate/budget limits
external account
```

The semantic workflow graph SHOULD remain portable across environments.

Promotion SHOULD follow:

```text
Draft
  ↓
Validate/Test
  ↓
Promote configuration references
  ↓
Production readiness checks
  ↓
Publish/Activate
```

Production promotion SHALL NOT automatically reuse developer credentials.

Marketplace publication is distinct from internal production promotion.

---

# 160J. Workflow Definition Schema Versioning and Migration

The platform-level Workflow Definition format SHALL itself be versioned independently from each user's workflow version.

Example:

```text
schema_version = sah.workflow.v1
```

When the platform evolves:

```text
sah.workflow.v1 → sah.workflow.v2
```

SmartAIHub SHALL provide deterministic migrators.

Requirements:

- preserve semantic meaning or explicitly report an unsupported migration;
- retain original snapshot/hash;
- permit dry-run migration;
- validate round-trip/export behavior where feasible;
- never silently drop unknown nodes/fields;
- maintain backward-reading support for an announced compatibility window;
- record the migrator version used.

Marketplace immutable historical versions SHALL remain interpretable even after current authoring schema evolves.

---

# 160K. Runtime Output Validation, Structured Repair and Contract Failure

Typed schemas MUST be enforced at runtime, not only while authoring.

For each node result:

```text
raw provider result
    ↓
adapter normalization
    ↓
output schema validation
    ↓
valid output
```

If invalid:

```text
OUTPUT_INVALID
```

then allowed policy MAY perform:

```text
deterministic normalization
structured-output repair
same-provider retry
allowed equivalent fallback
Feature 196 replan
human intervention
```

Repair SHALL have a bounded retry/cost budget.

The system MUST NOT silently coerce materially incompatible model/agent output and mark it valid.

Original invalid output SHOULD remain available to authorized debug users when retention/security policy allows.

---

# 160L. Agent Session and Memory Isolation

Agent/LLM nodes SHALL explicitly declare session/memory scope.

Minimum scopes:

```text
STATELESS
NODE_RUN
WORKFLOW_RUN
CONVERSATION
PROJECT
PERSISTENT_NAMED_MEMORY
```

Default for Marketplace workflows SHOULD be:

```text
WORKFLOW_RUN
```

unless the app clearly requires another scope.

A public workflow creator MUST NOT accidentally share memory between different consumers.

Persistent memory requires:

```text
explicit storage owner
tenant boundary
authorized subjects
retention policy
deletion behavior
```

External-agent sessions SHALL be correlated to the Workflow Run without implying SmartAIHub can inspect opaque internal memory.

---

# 160M. Retrieval / Knowledge Node and Evidence Contract

Workflow Studio SHALL support retrieval as a first-class capability or normalized node category rather than forcing authors to hide all retrieval inside arbitrary prompts.

Retrieval MAY target authorized sources such as:

```text
Library
Knowledge Base
Help
Project context
approved external retrieval capability
```

A Retrieval node SHOULD declare:

```text
query source
retrieval source(s)
top-k / retrieval policy
filters
permission scope
output evidence schema
```

Outputs SHOULD preserve:

```text
source identity
locator/citation
retrieval timestamp
retrieval configuration/version
```

Spec 209 does not create another RAG system; retrieval SHALL use the shared Retrieval Broker/Feature 196 architecture.

Consumer permissions are checked at run time.

---

# 160N. Marketplace Consumer Data Privacy and Publisher Visibility

Publishing a Workflow as a Mini App MUST NOT automatically grant the workflow creator access to consumer inputs, files, prompts, outputs, secrets or raw traces.

Default publisher analytics SHALL be aggregated/operational, for example:

```text
run count
success/failure rate
latency
credit/revenue totals
failure categories
model/provider aggregate
```

Raw consumer content SHALL require an explicit authorized basis such as:

```text
consumer shares diagnostic data for support
workspace owner has applicable policy/role
consumer explicitly submits feedback with selected attachments
```

The UI SHALL clearly disclose any publisher-visible data before execution when such visibility is enabled.

Marketplace logs/traces SHALL redact consumer secrets and sensitive data.

A creator MUST NOT be able to turn analytics into a covert data-exfiltration channel.

---

# 160O. Asset Ingress, Malware Scanning and Network Egress Boundary

File/media input SHALL use the canonical Library/Asset ingestion security path.

Where supported by platform infrastructure, ingress SHOULD perform:

```text
file type validation
size limits
content signature/MIME validation
malware scanning
archive limits
media parsing safety checks
quarantine on suspicious content
```

Workflow definitions MUST NOT bypass canonical asset validation by embedding uncontrolled raw files in graph state.

For URL/HTTP/network-capable Skills or nodes, capability policy SHALL mitigate SSRF and unsafe egress, including protection of:

```text
localhost
link-local
cloud metadata endpoints
private networks
tenant-internal endpoints
restricted domains
```

Network credentials remain Secret References.

Marketplace workflows SHALL not gain arbitrary network egress simply because they are public.

---

# 160P. Marketplace Refund, Dispute and Run-Finality Handoff

Spec 209 does not own the economic ledger, but Marketplace workflows SHALL emit enough immutable facts for Spec 207 to resolve refunds, disputes and settlement holds.

Facts SHOULD include:

```text
listing/version
consumer
publisher
run_id / job_id
quoted charges
actual attributable usage
creator fee rule
canonical run finality
failure classification
unknown-outcome state
provider evidence refs where available
```

Creator revenue SHOULD NOT be treated as irrevocably final while the canonical economic event is in a state that Spec 207 considers pending/reconciling/disputed.

Support tooling SHOULD permit the consumer to share a **sanitized diagnostic bundle** without automatically exposing all workflow inputs.

---

# 160Q. Cross-Workflow Trigger Cycle and Causal-Chain Protection

Subflow recursion controls alone are insufficient because workflows may trigger other workflows indirectly through events/webhooks.

Every triggered run SHOULD preserve causal metadata such as:

```text
root_run_id
parent_run_id
trigger_event_id
causal_chain
workflow/version path
depth
```

The platform SHALL detect obvious trigger cycles, for example:

```text
Workflow A emits Event X
Event X triggers Workflow B
Workflow B emits Event Y
Event Y triggers Workflow A
```

Policies SHALL include:

```text
maximum causal depth
duplicate event suppression
cycle detection
per-root-run execution budget
```

A cycle protection event SHALL be visible in logs/trace.

---

# 160R. Collaboration, Autosave, Draft Recovery and Edit Conflict

Builder SHALL protect authoring work from tab/browser failure.

Minimum behavior:

```text
autosave draft
local unsaved indicator
server revision / ETag
optimistic concurrency check
recover recent draft
```

AI patches SHALL reference the exact base Draft revision.

If another author changes the Draft first:

```text
patch precondition fails
    ↓
refresh/rebase/merge required
```

The system MUST NOT blindly apply an old AI patch on top of a newer semantic graph.

Advanced collaboration MAY support:

```text
branch draft
fork draft
compare
merge
```

but merge conflicts involving semantics SHALL require explicit resolution.

---

# 160S. Streaming Output and Incremental Artifact Semantics

Some nodes produce incremental output:

```text
LLM token stream
agent progress
partial research items
image/video generation progress
intermediate render
partial artifact
```

Workflow runtime/UI SHALL distinguish:

```text
progress event
preview
partial artifact
canonical node output
canonical workflow result
```

A partial artifact MUST NOT automatically satisfy a downstream typed dependency unless the node contract explicitly supports streaming consumption.

Streaming consumers SHALL support backpressure/disconnect recovery through the platform event model.

Closing the UI SHALL not cancel a durable run unless the user explicitly requests cancellation.

---

# 160T. Non-Deterministic Testing, Golden Contracts and Evaluation Tolerance

AI/media workflows are non-deterministic; exact byte equality is often the wrong test.

Test fixtures SHALL support assertions such as:

```text
schema valid
required fields present
numeric range
semantic evaluator threshold
artifact type/size/duration
deterministic invariant
cost ceiling
latency ceiling
safety/policy invariant
```

Where AI evaluators are used, the test record SHOULD capture:

```text
evaluator identity/version
rubric version
model policy/model if relevant
threshold
evaluation timestamp
```

Golden media outputs MAY be used as references but SHOULD NOT require exact reproduction unless the underlying operation is deterministic.

---

# 160U. Prompt, Tool Configuration and Runtime Snapshot Reproducibility

Workflow reproducibility requires more than a graph version.

A run SHOULD snapshot or reference immutable revisions for materially relevant configuration:

```text
prompt/template revision
node configuration revision
input/output schema revision
model policy revision
resolved model/provider
tool/capability revision
subflow version
UI-independent runtime parameters
dependency manifest
```

Mutable "latest" configuration MUST be resolved to a concrete revision at run start where reproducibility matters.

If a provider does not expose a stable model revision, the trace SHALL record the best available provider/model identity rather than inventing precision.

---

# 160V. Revision 2 Acceptance Criteria — Production Hardening

- [ ] Feature 196 ephemeral plans promote into Spec 209 rather than creating a second saved-flow format.
- [ ] Schedule trigger stores timezone, DST and missed-run policy.
- [ ] Webhook trigger supports authentication, replay protection and idempotency.
- [ ] Internal event triggers are duplicate-tolerant.
- [ ] Run API accepts idempotency key.
- [ ] Workflow supports concurrency/overlap policy.
- [ ] Collection fan-out supports bounded parallelism and failure policy.
- [ ] Production cache is explicitly separated from test pinned data.
- [ ] Side-effecting nodes cannot be falsely memoized.
- [ ] Pause/cancel semantics accurately reflect provider capability.
- [ ] Cancellation attempts propagate to child execution planes.
- [ ] Finalizer/cleanup behavior is explicit.
- [ ] Compensation actions are auditable.
- [ ] In-flight runs remain pinned to exact workflow version.
- [ ] Fix-and-resume creates explicit new-version lineage rather than mutating old run semantics.
- [ ] Dev/Test/Production environment references are supported without copying raw secrets.
- [ ] Workflow Definition schema has platform-level version/migration support.
- [ ] Runtime node output is validated against output schema.
- [ ] Invalid structured output follows bounded repair/replan policy.
- [ ] Agent memory defaults prevent cross-consumer leakage.
- [ ] Retrieval uses shared Retrieval Broker and preserves evidence/provenance.
- [ ] Marketplace publisher cannot see raw consumer content by default.
- [ ] Diagnostic content sharing is explicit and sanitized.
- [ ] Asset ingress follows canonical validation/security path.
- [ ] Network-capable dependencies cannot trivially SSRF protected networks.
- [ ] Marketplace run emits sufficient facts for Spec 207 refund/dispute/reconciliation.
- [ ] Cross-workflow event cycles have causal-chain/depth protection.
- [ ] Builder autosaves drafts and rejects stale AI patches.
- [ ] Streaming progress/preview is distinct from canonical output.
- [ ] Non-deterministic tests support semantic/invariant assertions.
- [ ] Runs snapshot materially relevant prompt/model/tool/dependency revisions.

---


# 160W. Expression Language, Variable Scope and Deterministic Evaluation

Workflow expressions SHALL use a constrained, versioned expression language rather than arbitrary browser/server code.

Required variable scopes:

```text
WORKFLOW_INPUT
RUN
NODE
SUBFLOW
ITERATION
ENVIRONMENT_REFERENCE
SECRET_REFERENCE
SYSTEM_READONLY
```

Rules:

- scope resolution SHALL be explicit and deterministic;
- shadowing rules SHALL be documented;
- expressions SHALL NOT access arbitrary process environment variables, filesystem, network or system APIs;
- secret values MAY participate in authorized runtime bindings but SHALL NOT be rendered into authoring previews/logs;
- expression evaluation SHALL have CPU/time/size limits;
- non-deterministic functions such as current time/randomness SHALL be explicit and traceable;
- expression-language version SHALL be pinned in the Workflow Version/runtime snapshot;
- expression errors SHALL produce a typed validation/runtime error rather than silently return null.

The authoring UI SHOULD offer a visual expression editor and field picker before raw expression syntax.

---

# 160X. Hierarchical Deadlines, Delays, Long Waits and Wake-Up Semantics

A workflow MAY live for seconds, hours, days or longer.

Spec 209 SHALL distinguish:

```text
run deadline
node timeout
provider timeout
human-task deadline
delay/wait-until
schedule trigger
approval/input expiration
```

Long waits MUST be durable and MUST NOT rely on an open browser tab, WebSocket or in-memory timer.

A `Delay` / `Wait Until` node SHALL persist:

```text
wake_at
timezone if user-defined local time is relevant
wait reason
resume token/reference
expiration policy
```

Hierarchical deadline rules:

```text
child deadline <= parent remaining deadline
```

unless an explicit policy permits a detached child lifecycle.

Timeout SHALL not automatically imply provider cancellation succeeded.

When a deadline expires, allowed policies include:

```text
FAIL
SKIP
DEFAULT
ESCALATE
ASK_OWNER
COMPENSATE
REPLAN
```

Feature 195 remains authoritative for durable timer/job state where implemented.

---

# 160Y. Connection, Credential, Secret Rotation and Revocation Lifecycle

Connections and secrets are live dependencies, not static configuration.

Workflow nodes SHALL reference connection/secret identities, never raw credentials.

Runtime preflight SHALL detect:

```text
missing connection
expired credential
revoked grant
insufficient scope
tenant mismatch
environment mismatch
```

If a credential is revoked or rotated mid-run:

- new calls MUST use the current authorized credential revision;
- an already in-flight external operation MAY finish only according to provider/finality semantics;
- SmartAIHub MUST NOT silently restore a revoked credential from cached state;
- resume/retry SHALL re-authorize the connection;
- authorization failure is not a transient provider error unless evidence supports that classification.

Published Marketplace apps SHALL declare consumer-required connections separately from publisher-owned/sponsored connections.

Credential revision identifiers MAY be recorded in privileged audit metadata, but secret values SHALL never be stored in run traces.

---

# 160Z. Provider Quotas, Rate Limits, Backpressure and Circuit Breakers

Model/media/API providers have quotas and changing health.

The shared capability/model runtime SHALL expose enough normalized signals for Workflow Studio to reason about:

```text
rate_limit
quota_remaining when known
retry_after
concurrency availability
provider health
regional availability
circuit-breaker state
```

Workflow execution SHALL prefer queue/backpressure over uncontrolled retry storms.

Rules:

- provider `Retry-After` SHOULD be honored where safe;
- retries SHALL use bounded exponential/backoff policy with jitter where appropriate;
- a circuit-open provider SHOULD not receive repeated identical traffic;
- parallel/fan-out nodes SHALL respect provider and tenant concurrency budgets;
- fallback to another provider/model SHALL still obey semantic/cost/privacy eligibility;
- rate-limit waiting SHALL be visible as a distinct state from active model execution.

Spec 209 SHALL NOT implement a second provider health system if one exists in the shared model/capability layer.

---

# 160AA. Dependency Lockfile, Transitive Dependency Graph and Supply-Chain Integrity

A reproducible Workflow Version requires a resolved dependency graph.

In addition to the human-readable dependency manifest, publication SHOULD produce a machine-resolved **dependency lock snapshot** containing concrete identities/revisions where applicable:

```text
Skill version
Subflow version
MCP capability/server revision
External Agent adapter/protocol revision
A2A capability/card revision where material
approved renderer revision
model-policy revision
expression-language version
provider adapter schema revision
```

Transitive dependencies SHALL be included.

The compiler/publisher SHALL detect:

```text
missing dependency
version conflict
incompatible transitive dependency
revoked dependency
untrusted/unsigned package where signing is required
dependency changed after audit
```

Where SmartAIHub supports signed packages/plugins/skills, signature/trust status SHOULD be part of publish/run preflight.

A mutable external endpoint that cannot be pinned MUST be marked as such; the system SHALL not claim perfect reproducibility.

---

# 160AB. Release Channels, Canary Rollout, Traffic Split and Rollback

Publishing a new workflow version SHOULD support controlled rollout.

Logical channels MAY include:

```text
DRAFT
DEV
STAGING
CANARY
STABLE
DEPRECATED
```

A publisher/workspace MAY route eligible traffic by:

```text
percentage
specific users
workspace/team
test cohort
explicit version
```

Requirements:

- each run records the resolved version/channel;
- a traffic split MUST be deterministic enough to avoid user flapping where sticky assignment is required;
- creator pricing and dependency snapshot are version-specific;
- canary analytics SHALL be separable from stable analytics;
- rollback changes future routing only and SHALL NOT rewrite historical runs;
- rollback SHALL be fast and shall not require deleting the bad version;
- public Marketplace updates MAY require review before a canary/stable transition.

The UI SHOULD support comparing canary vs stable failure/cost/latency metrics without declaring quality superiority solely from noisy small samples.

---

# 160AC. Human Task Governance — Assignment, Delegation, Expiry and Separation of Duties

`Human Approval` and `Ask User` are durable human tasks and require governance beyond a generic pause state.

A human task SHALL define:

```text
eligible assignee(s) / role
tenant/workspace boundary
required response type
deadline
reminder policy
delegation policy
escalation policy
timeout action
```

Optional governance SHOULD support **separation of duties**, for example:

```text
workflow author cannot self-approve production publication
requester cannot approve own high-risk economic action
```

Rules:

- delegated approval SHALL record original assignee, delegate and reason;
- expired approval tokens/links MUST NOT remain usable;
- one approval SHALL be consumed atomically;
- duplicate clicks/messages MUST NOT create duplicate continuation;
- approval decision SHALL be tied to the exact workflow/run state being approved;
- materially changed inputs after approval SHALL invalidate that approval where policy requires.

---

# 160AD. Notification Delivery Contract

Notification is a common workflow need but SHALL not be conflated with durable business completion.

Notification capability MAY support:

```text
in-app
email
Slack/Teams/other connected messaging capability
webhook callback
future channels
```

A notification node SHALL define:

```text
recipient
channel
template/message input
delivery policy
deduplication key
retry policy
failure severity
```

States SHOULD distinguish:

```text
QUEUED
SENT_TO_PROVIDER
DELIVERED when provider evidence exists
FAILED
UNKNOWN
```

A workflow MUST NOT claim a human received/read a notification merely because an API accepted the request.

Notification retries SHALL be duplicate-safe where the provider/capability permits.

Sensitive workflow data SHALL be minimized/redacted before entering notification channels.

---

# 160AE. Data Classification, Taint Propagation and Redaction Across Bindings

Typed data alone is insufficient; fields/artifacts MAY carry classification metadata.

Minimum classification tags SHOULD support platform policy such as:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
SECRET
PERSONAL_DATA
CREDENTIAL
PAYMENT_SENSITIVE
```

Classification MAY be attached to:

```text
workflow input field
node output field
artifact
variable
retrieval result
secret-derived value
```

Bindings SHALL propagate the strongest relevant classification unless an explicit trusted sanitizer/declassifier capability is applied.

Examples:

```text
SECRET input
    → string transform
    → remains SECRET

PERSONAL_DATA document
    → summary by approved local model
    → resulting summary remains governed personal-derived data unless policy says otherwise
```

Logs, traces, analytics, AI Builder context, notifications and Marketplace publisher analytics SHALL use classification-aware redaction.

Model/provider eligibility SHALL consider data classification and residency policy.

---

# 160AF. Custom Code / Script Node — Sandboxed Execution Only

Some workflows need small deterministic transformations that are impractical with declarative mapping.

If SmartAIHub provides a `Code` / `Script` node, it SHALL execute only in an approved sandbox/runtime.

The node SHALL NOT imply arbitrary server code execution.

Minimum controls:

```text
runtime/language allowlist
CPU limit
memory limit
wall-clock limit
filesystem boundary
network policy
dependency policy
output-size limit
secret injection allowlist
tenant isolation
artifact boundary
```

Network access SHOULD be disabled by default unless explicitly required and policy-approved.

Package installation at runtime SHOULD be restricted/pinned.

Marketplace publication of Code nodes SHOULD receive enhanced security review.

Deterministic data transforms SHOULD prefer built-in Transform/Expression nodes over custom code.

---

# 160AG. Workflow Ownership Transfer, User Offboarding, Deletion and Orphaned Dependencies

Workflow ownership can change over time.

The lifecycle SHALL define behavior for:

```text
owner leaves organization
workspace/tenant deleted
workflow transferred
publisher account suspended
dependent subflow deleted
listing unpublished
creator dies/inactive account according to platform policy
```

A workflow with active Marketplace consumers MUST NOT silently lose an executable dependency because one author deleted a private draft.

Ownership transfer SHALL require authorized action and SHALL preserve:

```text
version history
audit history
published listing identity where policy allows
economic attribution/settlement history
dependency ownership references
```

Deletion SHOULD distinguish:

```text
archive
unpublish
soft delete
hard delete when legally/operationally allowed
```

Historical run/accounting/audit records follow their canonical retention policies.

---

# 160AH. Licensing, Attribution and Clone/Fork Rights

Marketplace productization requires explicit rights metadata.

A publishable workflow SHOULD declare:

```text
usage license / marketplace terms
clone permitted?
fork permitted?
commercial use permitted?
redistribution permitted?
required attribution
included dependency licenses
```

The publisher SHALL NOT grant clone/fork rights broader than allowed by dependencies.

Fork lineage SHOULD preserve required attribution metadata.

Private implementation visibility does not by itself create an intellectual-property enforcement mechanism; the system SHALL represent rights/permissions without promising technical impossibility of reverse engineering.

Marketplace moderation MAY block publication when declared rights conflict with dependency/license metadata.

---

# 160AI. Hierarchical Resource, Cost and Concurrency Envelopes for Nested Workflows

Nested workflows need inherited resource policy.

A parent run MAY define an envelope:

```text
credit budget
deadline
max model calls
max media generations
max parallelism
storage/artifact limit
external-call limit
```

A child subflow/agent/job SHALL receive a bounded sub-envelope.

Rules:

```text
child allocation <= parent remaining envelope
```

unless policy explicitly authorizes a separately funded detached action.

Sibling branches MUST NOT each assume they own the full remaining budget.

The orchestrator SHOULD reserve/allocate enough budget/concurrency before launching large parallel branches.

Nested child usage SHALL roll up without double-counting.

Feature 195 owns canonical execution accounting and Spec 207 owns canonical economic accounting; Spec 209 owns the workflow-level envelope declaration/presentation.

---

# 160AJ. Audit Integrity and Privileged Change Evidence

Workflow Studio SHALL record security-relevant authoring and publishing actions in the shared audit system.

Examples:

```text
workflow created
AI patch proposed/applied
manual semantic edit
secret/connection reference changed
permission/share changed
publisher/pricing changed
public listing submitted/approved/suspended
version promoted/rolled back
approval delegated/decided
ownership transferred
```

Audit evidence SHOULD capture:

```text
actor
tenant
timestamp
object/version
action
before/after reference or diff hash
request/correlation id
authorization context
```

Audit records SHOULD be append-only/tamper-evident according to the shared platform audit architecture.

Application users SHALL NOT be able to erase security/audit evidence merely by deleting a workflow.

Sensitive values remain redacted.

---

# 160AK. Backup, Restore and Disaster-Recovery Semantics

Workflow definitions and publication metadata are business-critical control-plane data.

Backup/restore planning SHALL cover at minimum:

```text
workflow definitions
workflow versions
UI schemas
dependency lock snapshots
shares/access metadata
publication/listing metadata
creator pricing references
test fixtures/pinned data according to retention
audit/economic references according to canonical owners
```

Large generated artifacts continue to follow Library/Asset backup/retention policy.

Restore SHALL preserve immutable identifiers/version hashes where possible.

Disaster recovery MUST NOT accidentally:

```text
republish an unpublished workflow
reactivate revoked shares
restore stale secrets
duplicate scheduled triggers
re-run historical webhooks
double-charge consumers
```

After restore, trigger schedulers SHALL reconcile next-fire state and idempotency history before resuming execution.

Recovery tests SHOULD include restoring a published Marketplace workflow and verifying that access, version identity, dependency references and economic attribution remain correct.

---

# 160AL. Revision 3 Acceptance Criteria — Additional Hardening

- [ ] Expression evaluation uses a constrained versioned language, not arbitrary code.
- [ ] Variable scopes/shadowing are deterministic and documented.
- [ ] Long delays/waits survive UI/backend process restart through durable state.
- [ ] Hierarchical deadlines distinguish workflow/node/provider/human-task timeouts.
- [ ] Secret/connection revocation is rechecked on retry/resume.
- [ ] Rotated credentials do not resurrect revoked cached values.
- [ ] Provider rate limits/backpressure do not create retry storms.
- [ ] Fan-out respects provider/tenant concurrency limits.
- [ ] Published version has a resolved transitive dependency lock snapshot where possible.
- [ ] Dependency signature/trust state is validated where supported.
- [ ] Canary/stable routing records the concrete workflow version for every run.
- [ ] Rollback affects future routing without rewriting historical executions.
- [ ] Human approval supports assignment, delegation, expiry and atomic consumption.
- [ ] Separation-of-duties policy can be enforced for configured high-risk approvals.
- [ ] Notification API acceptance is not mislabeled as human delivery/read.
- [ ] Notification retries are deduplicated where supported.
- [ ] Data classification propagates through normal bindings.
- [ ] Logs/AI context/notifications redact classified secret/credential data.
- [ ] Custom Code node, if enabled, runs only in an approved resource/network sandbox.
- [ ] Marketplace Code-node publication receives stronger security review.
- [ ] Ownership transfer/offboarding preserves required run/audit/economic history.
- [ ] Deleting an owner account does not silently orphan active published dependencies.
- [ ] Clone/fork rights cannot exceed dependency-license rights.
- [ ] Nested subflows inherit bounded deadline/cost/concurrency envelopes.
- [ ] Parallel children cannot each consume the full parent budget.
- [ ] Security-relevant authoring/publishing actions are written to shared audit evidence.
- [ ] Workflow deletion cannot erase required audit records.
- [ ] Backup/restore does not duplicate schedules/webhooks/charges or reactivate revoked shares.
- [ ] Restored published workflow preserves exact version/dependency identity.

---


# 160AM. Parallel State Determinism, Reducers and Write-Conflict Semantics

Parallel branches SHALL NOT mutate shared workflow state through implicit last-writer-wins behavior.

Workflow state SHOULD prefer immutable values plus explicit merge/reducer semantics.

For any state written by multiple branches, the definition SHALL declare one of:

```text
APPEND
SET_UNION
MERGE_OBJECT_WITH_SCHEMA
REDUCE
FIRST_SUCCESS
LAST_BY_EVENT_SEQUENCE
ERROR_ON_CONFLICT
CUSTOM_APPROVED_REDUCER
```

Rules:

- branch-local variables remain isolated until Join/Merge;
- concurrent writes to a scalar without an explicit reducer SHALL be rejected at compile time where detectable;
- merge order MUST NOT depend on browser rendering order;
- reducer version/configuration SHALL be part of the runtime snapshot;
- non-commutative reducers SHALL define deterministic ordering;
- Join node SHALL expose partial/failed branch semantics before state is merged;
- manual retry of one branch MUST NOT duplicate already-committed aggregate entries.

Example:

```text
Parallel
├─ Analyze Image 1 → findings[]
├─ Analyze Image 2 → findings[]
└─ Analyze Image 3 → findings[]
        ↓
Join reducer = APPEND ordered by source item index
```

The compiler SHOULD warn when a parallel graph would create ambiguous shared-state writes.

---

# 160AN. Atomic Node Commit, Output Publication and Crash-Recovery Boundary

A node MAY finish work externally but fail before SmartAIHub persists the canonical output, or persist an artifact before the canonical attempt is committed.

Spec 209 SHALL define a node commit boundary compatible with Feature 195.

Conceptual lifecycle:

```text
STARTED
  ↓
EXTERNAL_EFFECT / COMPUTATION
  ↓
OUTPUT_STAGED
  ↓
OUTPUT_VALIDATED
  ↓
CANONICAL_NODE_COMMIT
  ↓
DOWNSTREAM_VISIBLE
```

Requirements:

- downstream nodes MUST consume only canonical committed output unless the contract explicitly supports streaming/preview consumption;
- staged artifacts SHALL not automatically count as successful node output;
- crash between external completion and canonical commit SHALL enter recover/reconcile logic rather than blindly repeat a non-idempotent effect;
- side-effecting nodes SHALL persist provider/external operation identifiers where available;
- artifact upload and node result commit SHOULD use an outbox/finalization pattern or equivalent durable reconciliation;
- retry MUST consult prior attempt/finality evidence before repeating the external action;
- duplicate canonical completion events SHALL be idempotent.

Feature 195 remains authoritative for attempts/fencing/finality; Spec 209 defines how workflow semantics consume only committed results.

---

# 160AO. Checkpoint, Pinned-Test-Data and Artifact Retention / Garbage Collection

Resumability and debugging create storage obligations.

Every persisted workflow-owned object SHOULD have a lifecycle classification:

```text
RUN_CHECKPOINT
PINNED_TEST_DATA
DEBUG_TRACE_ARTIFACT
TEMPORARY_STAGED_ARTIFACT
PUBLISHED_APP_ASSET
CANONICAL_RESULT
```

Policies MAY define:

```text
retention duration
retain-until-run-final
retain-until-workflow-version-deleted
retain-until-unpinned
legal/audit hold
user/tenant storage quota
```

Rules:

- a checkpoint required by an active paused run MUST NOT be garbage-collected;
- a published immutable version MUST NOT depend on an expiring temporary artifact;
- pinned test data MUST display storage/retention state;
- deletion/expiry of a checkpoint SHALL make resume unavailable with an explicit reason;
- garbage collection MUST be idempotent and reference-aware;
- artifact deletion SHALL reconcile Library/object-store/database references;
- shared artifacts SHALL not be deleted while still referenced by authorized retained objects;
- quota pressure MAY require creator action but MUST NOT silently corrupt published workflows.

Retention implementation SHALL reuse the canonical Library/Asset lifecycle rather than creating an isolated workflow blob store.

---

# 160AP. Model Context, Payload Size and Input-Shaping Budget

Typed compatibility does not guarantee that a model/provider can accept the payload.

A model-capable node SHALL validate operational limits such as:

```text
context/token window
max images
max image bytes/resolution
max video/audio duration where applicable
max tool/schema size
max structured-output size
provider request-body limit
```

The compiler/runtime MAY apply an explicit input-shaping strategy:

```text
TRUNCATE_SAFE_FIELD
SUMMARIZE
CHUNK
RETRIEVE_TOP_K
DOWNSAMPLE_MEDIA
SELECT_RELEVANT_ASSETS
FAIL_AND_ASK_USER
```

Rules:

- shaping that can materially change meaning SHALL be visible/traceable;
- secrets/classified data rules still apply during summarization/chunking;
- author MAY lock `NO_AUTOMATIC_TRUNCATION`;
- context compaction SHALL not silently remove required legal/approval/economic instructions;
- cost estimate SHOULD account for the shaped payload actually sent where measurable;
- resolved input size and shaping revision SHOULD be included in trace/debug evidence.

Feature 196 may own higher-level context planning; Spec 209 SHALL expose the node/workflow contract and user-visible behavior.

---

# 160AQ. Least-Privilege Delegation to Subflows, Agents, Skills and External Capabilities

A child node/subflow/agent SHALL NOT automatically inherit every connection, secret, permission or Library scope available to the parent author/runtime.

Each invocation SHALL derive an explicit **Capability Grant** / execution scope.

Grant MAY include:

```text
allowed capability ids
allowed connection refs
allowed secret refs
allowed Library/project scopes
allowed side-effect classes
allowed domains/endpoints
budget envelope
expiration
run/node binding
```

Rules:

- default is least privilege;
- child workflows receive only declared/bound resources;
- External Agents receive capability-mediated access, not the creator's unrestricted account;
- A2A/MCP/Runner/Computer Use calls remain subject to their canonical gateways;
- a grant SHALL expire/revoke with the run/session policy;
- delegated access MUST NOT outlive the parent authority unless an explicit detached authorization exists;
- traces SHALL record grant identity/scope without exposing secret values.

This prevents a reusable Marketplace workflow from becoming an ambient-authority escalation path.

---

# 160AR. External Input Snapshotting, Mutable URL/Library Revision and Reproducibility

Workflow inputs may point to mutable external content.

Input contracts SHALL distinguish:

```text
IMMUTABLE_VALUE
LIBRARY_VERSION_REF
MUTABLE_LIBRARY_ALIAS
EXTERNAL_URL
LIVE_QUERY
STREAM
```

For reproducible or paid/published execution, policy SHOULD define whether SmartAIHub:

```text
SNAPSHOT_AT_RUN_START
PIN_EXISTING_VERSION
USE_LIVE_VALUE
REJECT_MUTABLE_INPUT
```

Requirements:

- Library inputs SHOULD resolve to a concrete file/version identity for the run where supported;
- external URL content MAY require secure materialization/snapshotting before execution;
- URL fetch follows SSRF/egress policy;
- mutable input changes after run start MUST NOT silently rewrite historical provenance;
- live-query semantics SHALL be explicit and record retrieval timestamp/query revision;
- snapshot hashes/refs SHOULD be recorded where practical;
- large snapshot retention follows canonical Asset lifecycle and policy.

The Mini App UI SHOULD explain when a consumer is running against live versus snapshotted data if that distinction matters.

---

# 160AS. Priority, Fair Scheduling and Noisy-Neighbor Protection

Spec 209 MAY declare scheduling intent but SHALL reuse Feature 195 for canonical dispatch.

Workflow/run scheduling metadata MAY include:

```text
priority_class
deadline
interactive vs batch
tenant/workspace
marketplace/public
resource class
```

Supported logical priority classes MAY include:

```text
INTERACTIVE
NORMAL
BATCH
BACKGROUND
SYSTEM
```

Rules:

- priority SHALL NOT bypass authorization, budget or tenant limits;
- public Marketplace traffic MUST NOT starve tenant-critical internal work;
- one tenant/workflow SHALL not monopolize a shared Runner/provider pool;
- scheduler SHOULD support weighted/fair-share behavior where Feature 195 permits;
- creator-controlled priority SHALL be bounded by platform/tenant policy;
- retries SHOULD not continuously jump ahead of new eligible work without policy;
- queue wait time SHOULD be observable separately from execution time.

Spec 209 SHALL not implement a parallel queue; it only declares workflow-level intent and presentation.

---

# 160AT. Secure Outbound Callback / Completion Webhook Contract

A workflow MAY notify an external system when a run changes state or completes.

Outbound callbacks SHALL be distinct from arbitrary ungoverned HTTP code.

Callback configuration SHOULD support:

```text
target endpoint / approved connection
event types
payload schema
signing secret reference
delivery id
timestamp
retry policy
dead-letter / terminal failure policy
```

Security requirements:

- egress/SSRF policy applies;
- payload SHALL minimize/redact classified data;
- callbacks SHOULD be signed (for example HMAC or provider-native signing) where supported;
- delivery SHALL include an idempotent event/delivery identifier;
- retries MUST reuse the same semantic delivery identity;
- callback success means endpoint acceptance, not downstream business completion;
- consumer/publisher MUST be able to inspect delivery failures without secret leakage;
- changing callback endpoint/secret is a security-relevant audited change.

Marketplace apps SHALL not silently exfiltrate consumer output through publisher callbacks unless that data flow is explicitly disclosed and authorized.

---

# 160AU. Dependency Upgrade Conformance and Contract-Test Gate

A dependency can remain present but change behavior incompatibly.

For dependencies that support contract testing, Workflow Studio SHOULD maintain conformance checks against the workflow's expectations.

Examples:

```text
Skill input/output schema
Subflow contract
MCP tool schema
Agent capability contract
model structured-output capability
renderer contract
provider adapter parameter mapping
```

Before promoting an updated dependency under an auto-compatible policy:

```text
resolve candidate dependency
  ↓
schema/contract compatibility
  ↓
saved test fixtures
  ↓
optional canary validation
  ↓
eligible for rollout
```

Rules:

- semantic incompatibility SHALL block automatic upgrade;
- schema-compatible does not automatically mean behavior-compatible;
- high-risk dependencies MAY require explicit owner approval;
- contract-test result/revision SHALL be traceable;
- unavailable tests SHALL be represented as unknown, not pass;
- rollback SHALL restore the previous resolved dependency route for future runs where still available.

This complements dependency locking rather than replacing it.

---

# 160AV. Emergency Disable / Kill-Switch and Incident Containment

SmartAIHub SHALL support rapid containment of a dangerous/broken Workflow, version, listing or dependency.

Governed kill-switch targets MAY include:

```text
workflow
workflow version
marketplace listing
trigger
node/capability dependency
model/provider route
```

Actions MAY include:

```text
BLOCK_NEW_RUNS
DISABLE_TRIGGER
PAUSE_QUEUED_RUNS
REQUEST_CANCEL_ACTIVE_RUNS
FORCE_REVIEW
REMOVE_FROM_MARKETPLACE_DISCOVERY
```

Rules:

- emergency disable SHALL be authorization/audit protected;
- historical records remain intact;
- disabling future runs SHALL not falsely mark active external side effects as cancelled;
- consumers/publishers SHOULD receive a clear operational state;
- re-enable SHALL require an explicit action and may require re-audit;
- dependency-wide incident containment SHOULD identify affected published workflows;
- platform kill-switch SHALL take precedence over creator publish settings.

---

# 160AW. Workflow Storage Quotas, Artifact Ownership and Deletion Reconciliation

Workflow Studio SHALL expose storage consumption sufficiently for creators/tenants to manage long-lived automation assets.

Storage accounting SHOULD distinguish:

```text
definition/version metadata
test fixtures
pinned test data
checkpoint artifacts
debug artifacts
published app assets
canonical generated results
```

Ownership/reference rules SHALL define who may delete each class.

Deletion reconciliation SHALL handle:

```text
workflow archived
version deleted where allowed
run deleted where allowed
consumer deletes input/result
publisher unpublishes app
tenant offboarding
retention expiration
```

Requirements:

- deleting workflow metadata MUST NOT blindly delete consumer-owned Library files;
- deleting a consumer Library asset MAY invalidate future rerun/resume and SHALL be surfaced;
- shared/referenced objects require reference-aware cleanup;
- storage quota exceeded SHALL block or degrade new storage-producing operations predictably;
- quota/billing presentation SHOULD separate persistent workflow assets from transient execution scratch space where possible.

---

# 160AX. Migration Cutover, Compatibility Shim and Rollback Without Dual Source of Truth

Migration from approved SmartAIHub Flows/LangGraph routes SHALL avoid a
permanent dual-write architecture. "Legacy automation" excludes the retired
systems listed in Section 3.1; those systems have no compatibility path in this
feature.

Recommended cutover pattern:

```text
1. Inventory legacy flow formats and execution entry points.
2. Build read/import adapters into Spec 209 canonical Workflow Definition.
3. Validate imported semantic equivalence.
4. Route new authoring to Spec 209.
5. Use compatibility shim for legacy invocation.
6. Move execution to shared Feature 195/196 runtime contract.
7. Observe parity and rollback metrics.
8. Freeze legacy authoring.
9. Retire legacy persistence/execution paths.
```

The compatibility shim may read/translate an approved predecessor contract only
after an authorized migration audit. It MUST NOT add a new caller to a retired
system or make a retired persistence table a second source of truth.

Rules:

- only one system is canonical for a migrated workflow at a time;
- dual-write, if temporarily unavoidable, requires explicit reconciliation and a defined removal date;
- migration SHALL preserve original legacy identity/reference for traceability;
- rollback SHALL restore routing, not duplicate executions;
- trigger migration MUST preserve idempotency history and next-fire state;
- imported secret values MUST become Secret References;
- unsupported legacy constructs SHALL be reported and require remediation rather than silently dropped;
- migration completion SHALL be measured by zero production calls through retired execution paths, not merely by UI removal.

---

# 160AY. Revision 4 Acceptance Criteria — Final Completeness Hardening

- [ ] Parallel branches cannot create implicit nondeterministic shared-state writes.
- [ ] Join/Merge uses explicit reducer semantics.
- [ ] Node output is not downstream-visible until canonical commit.
- [ ] Crash after external side effect enters reconcile/idempotency logic rather than blind replay.
- [ ] Active checkpoint required for resume cannot be garbage-collected.
- [ ] Published version does not depend on temporary expiring artifact.
- [ ] Model/media payload limits are validated before provider call.
- [ ] Automatic context/media shaping is traceable and policy-controlled.
- [ ] Child subflow/agent receives least-privilege grants, not ambient parent authority.
- [ ] External/Library mutable inputs are snapshotted or explicitly marked live according to policy.
- [ ] Scheduling priority cannot bypass tenant/platform fair-share policy.
- [ ] Public Marketplace traffic cannot monopolize shared execution pools.
- [ ] Outbound callbacks are signed/idempotent where supported and obey egress policy.
- [ ] Marketplace callback cannot silently exfiltrate consumer data.
- [ ] Auto-upgraded dependency must pass available contract/conformance gates.
- [ ] Missing dependency tests are represented as unknown rather than pass.
- [ ] Platform can emergency-disable workflow/version/listing/dependency for new runs.
- [ ] Kill-switch actions preserve historical/audit evidence.
- [ ] Storage quotas/ref ownership do not allow workflow deletion to destroy unrelated consumer assets.
- [ ] Deletion reconciliation makes broken resume/rerun state explicit.
- [ ] Legacy flow migration has one canonical owner at each cutover phase.
- [ ] Temporary compatibility shim has a retirement path and does not become a second permanent runtime.

---


# 160AZ. Cross-Spec Contract Versions and Mixed-Version Compatibility

Spec 209 depends on shared contracts owned by companion control planes. It SHALL NOT assume that every service, Runner, Agent Gateway, MCP Gateway or UI is upgraded atomically.

The implementation SHALL declare a compatibility matrix for shared contracts such as the current SmartAIHub execution/capability/runner/context/asset families, including where applicable:

```text
SAH-EXEC-*
SAH-CAP-*
SAH-RUNNER-*
SAH-CONTEXT-*
SAH-ASSET-*
```

The exact current versions are owned by the canonical companion specifications; Spec 209 SHALL consume them rather than fork them.

Every cross-plane request SHOULD carry enough version identity to support:

```text
producer contract version
consumer supported range
workflow schema version
runtime/compiler version
capability contract version
```

Rules:

- unsupported major versions SHALL fail closed with an actionable compatibility error;
- compatible minor-version differences MAY negotiate down/up according to the canonical contract rules;
- a Workflow Version MAY remain valid while one execution target is temporarily ineligible due to contract mismatch;
- Capability Resolver SHALL exclude incompatible offers instead of invoking and hoping;
- Runner/Agent/MCP mixed-version rollout SHALL be testable in staging/canary;
- old clients SHALL not silently reinterpret new semantic fields;
- compatibility shims MUST have explicit ownership, metrics and retirement criteria;
- workflow export/import SHALL preserve contract-version references needed for faithful diagnostics.

Spec 209 SHALL maintain a cross-spec compatibility test suite rather than duplicating the companion contract definitions.

---

# 160BA. Canonical Event Sequence, Causality, Replay and Projection Rebuild

Real-time UI delivery can be duplicated, delayed or out of order.

Every canonical Workflow Run event stream SHALL expose stable ordering metadata sufficient for deterministic replay.

Recommended fields:

```text
run_id
event_id
event_sequence
event_type
occurred_at
recorded_at
causation_id
correlation_id
node_id / subflow_path where applicable
attempt_id where applicable
```

Rules:

- `event_sequence` SHALL be monotonic within its canonical sequencing scope;
- UI projections MUST tolerate duplicate and out-of-order delivery;
- consumers SHALL deduplicate by stable event identity/sequence, not wall-clock timestamps;
- late arrival SHALL not regress canonical state;
- causal links SHOULD distinguish "caused by" from simple correlation;
- real-time transport is not itself the source of truth;
- rebuilding Workflow Run projection from canonical state/events SHALL be supported for recovery/testing;
- replay SHALL distinguish historical event replay from a new business execution;
- event schema evolution SHALL be versioned;
- unknown future event types MUST NOT crash older read-only clients.

Where Feature 195 is the canonical Job-event owner, Spec 209 SHALL map/projection-build from that truth instead of inventing an independent event ledger.

---

# 160BB. Bounded Runtime Graph Expansion and Self-Modification Guardrails

AI-first authoring does not imply that a running workflow may freely rewrite its own executable graph.

Default rule:

```text
Workflow Version graph = immutable for the life of a Run
```

Dynamic work SHALL normally use explicit constructs:

```text
FOR_EACH / MAP
SUBFLOW
ROUTER
AGENT TASK
FEATURE 196 REPLAN
```

If runtime dynamic expansion is supported, it SHALL be represented as a governed **Execution Expansion Plan**, not an untracked mutation of the saved Workflow Version.

Expansion plan SHALL declare:

```text
parent node
generated task/subgraph template
maximum generated nodes/tasks
allowed capability set
budget envelope
deadline
approval requirement if material
expansion provenance
```

Rules:

- generated work cannot escape the parent run's permission/resource envelope;
- maximum expansion depth/count is mandatory;
- generated nodes/tasks SHALL be visible in trace as runtime children;
- saved Workflow Definition remains unchanged unless the user later promotes a learned route through the normal Spec 209 authoring/diff process;
- runtime agent output MUST NOT directly patch production workflow definition;
- dynamic expansion involving new side-effect classes or materially different cost/privacy semantics requires replan/approval;
- replay/debug SHALL retain the concrete expansion plan used.

---

# 160BC. Loop and Collection Iteration Checkpoint / Resume Semantics

Loop/collection nodes need finer recovery than "rerun the whole node."

Each iteration/item SHOULD have a stable correlation identity:

```text
loop_node_id
iteration_index or item_key
item_input_hash
attempt
status
output_ref
```

For resumable collection processing:

```text
completed items → reusable
failed items    → retry according to policy
pending items   → continue
```

Rules:

- item identity SHALL remain stable across safe resume;
- changing collection membership/order SHALL trigger compatibility analysis;
- `RETRY_FAILED_ITEMS` MUST NOT duplicate committed successful item side effects;
- reducer/collector SHALL deduplicate by item identity;
- loop iteration checkpoints inherit parent retention and budget policy;
- iteration retry budget MAY be separate from whole-node retry budget;
- max-iteration and max-item protections remain enforced after resume;
- an author MAY choose `RECOMPUTE_ALL` when outputs are not safely reusable;
- partial collection result SHALL identify missing/failed items explicitly.

This is especially important for media workflows where 20 generated shots SHOULD NOT all be regenerated because shot 17 failed.

---

# 160BD. Parent / Child Workflow Lifecycle and Detached Execution Semantics

A Workflow may invoke another Workflow as a child. Parent-child lifecycle SHALL be explicit.

Child modes:

```text
ATTACHED
DETACHED_AUTHORIZED
FIRE_AND_TRACK
```

Default:

```text
ATTACHED
```

For attached children:

- parent cancellation SHOULD request cancellation of active child work;
- parent deadline/resource envelope bounds the child;
- parent final status waits for the child according to Join/error policy;
- child provenance/cost rolls up to parent without double-counting.

Detached execution requires explicit authorization and SHALL define:

```text
new owner/principal
independent budget
independent deadline
result destination
notification/correlation back to parent
cancellation relationship
```

A child MUST NOT accidentally become detached merely because a web session closed or a parent timed out.

If parent fails after launching a detached authorized child, the child remains independently traceable.

---

# 160BE. Governed Workflow Exposure via Capability Gateway, API, MCP and A2A

A saved/published Workflow can itself become a reusable capability, but protocol exposure SHALL use existing SmartAIHub gateways.

Canonical public contract:

```text
workflow capability
  ├─ input schema
  ├─ output schema
  ├─ permissions
  ├─ cost/funding semantics
  ├─ execution modality
  └─ version
```

Possible invocation surfaces:

```text
SmartAIHub UI / Mini App
SmartAIHub API
Universal Assistant
Another Workflow
External Agent through Capability Gateway
MCP-facing SmartAIHub exposure
A2A-facing SmartAIHub agent/capability exposure
```

Rules:

- Spec 209 SHALL NOT implement a second MCP server stack; MCP exposure uses the canonical MCP architecture;
- Spec 209 SHALL NOT implement a second A2A server/client policy plane; A2A exposure uses Spec 206/canonical gateway rules;
- protocol-specific wrappers SHALL normalize into the same `workflow.run` contract;
- entitlement, tenant isolation, economic authorization and creator pricing apply regardless of invocation protocol;
- graph visibility remains independent from invocability;
- remote caller SHALL receive only allowed status/result fields;
- long-running invocation SHALL use asynchronous task/job semantics rather than hold a synchronous HTTP/MCP/A2A call indefinitely;
- one external invocation identity SHALL map idempotently to one canonical Workflow Run unless the caller intentionally requests another run.

---

# 160BF. Queued/Paused Run Revalidation — Price, Model, Policy and Capability Drift

A run may be quoted now but execute minutes/hours later.

Before material execution begins—or resumes after a sufficiently long pause—the runtime SHALL revalidate material dependencies.

Potential drift:

```text
model/provider unavailable
provider price changed
creator pricing revision changed
tenant policy changed
connection revoked
data residency rule changed
capability version revoked
budget remaining changed
quote expired
```

Rules:

- already accepted creator fee/pricing revision for a created run SHALL be snapshotted according to Spec 207 policy;
- provider/model variable usage pricing MAY require a refreshed estimate/reservation;
- material cost increase beyond the user's authorized envelope SHALL pause/ask rather than silently overspend;
- a cheaper eligible change MAY proceed only if semantic/policy requirements remain satisfied;
- resumed run SHALL not inherit permissions that have since been revoked;
- model/capability replacement follows normal fallback equivalence rules;
- queued run SHALL expose states such as `REVALIDATING` / `REQUIRES_REAUTHORIZATION` / `REQUIRES_BUDGET_CONFIRMATION` where appropriate;
- revalidation itself SHALL be idempotent and auditable.

Spec 207 remains authoritative for monetary reservation/finality.

---

# 160BG. Data Residency, Execution Placement and Cross-Region Transfer

Privacy/residency policy SHALL be enforceable as an execution-placement constraint, not only metadata.

Workflow/node requirements MAY declare:

```text
allowed_regions
prohibited_regions
local_only
tenant_region
artifact_residency
model_provider_residency
runner_location requirement where known/allowed
```

Resolver SHALL evaluate:

```text
data classification
input artifact residency
provider/model region
Runner/runtime location
output destination
cross-region transfer policy
```

Rules:

- an ineligible cheaper/faster provider SHALL not be selected;
- moving an artifact across region is a governed data movement, not an invisible optimization;
- cross-region transfer MAY require approval/policy and MUST preserve provenance;
- unknown provider processing region SHALL be represented as unknown and may be ineligible under strict policy;
- cache/checkpoint reuse SHALL respect residency scope;
- Marketplace listing SHOULD disclose material regional limitations;
- failover to another region SHALL not override tenant residency rules;
- residency constraints SHALL propagate into child subflows/agents through execution grants.

---

# 160BH. Public API / SDK Versioning and Backward Compatibility

Workflow Studio SHALL expose stable APIs suitable for Mini Apps, external clients and future SDKs.

Public API contracts SHALL be versioned independently from internal implementation.

Requirements:

```text
explicit API version
stable error codes
request id / correlation id
idempotency semantics
pagination/cursor contract
async job/run contract
event-stream version
deprecation policy
```

Rules:

- clients MUST NOT need to parse human-readable error text to determine behavior;
- adding optional fields SHOULD remain backward compatible within a compatible API version;
- removing/renaming required semantic fields requires a new incompatible version or governed migration;
- SDKs SHALL declare supported API/Workflow-schema ranges;
- server SHALL reject unsupported incompatible client versions clearly;
- deprecated endpoints SHALL expose telemetry and a retirement window;
- one SDK upgrade SHALL not silently change workflow execution semantics;
- generated API clients, if used, SHOULD pin schema revision.

---

# 160BI. Telemetry Cardinality, Sampling, Cost and Sensitive-Data Budget

Workflow/Agent systems can generate enormous traces.

Observability SHALL define a telemetry budget.

High-cardinality values such as:

```text
raw prompt
full URL
file name
user-entered labels
arbitrary model output
item-level fan-out ids
```

SHALL NOT automatically become metric labels/tags.

Telemetry policy SHOULD distinguish:

```text
metrics
structured logs
traces
debug payloads
audit evidence
business analytics
```

Rules:

- metrics use bounded cardinality;
- detailed traces MAY be sampled according to policy except mandatory audit/security events;
- failed/high-risk runs MAY use higher sampling;
- sampled-out telemetry SHALL not remove canonical Job/financial/audit truth;
- classified data redaction applies before export to observability vendors;
- log/trace volume SHOULD have tenant/platform quotas and retention;
- debug mode MAY increase telemetry but SHALL disclose/limit sensitive capture;
- telemetry cost SHOULD be monitored so a large fan-out workflow cannot create disproportionate observability spend;
- correlation identifiers remain usable without exposing business payloads.

---

# 160BJ. Marketplace Terms, Consent Revision and Material-Change Acknowledgement

A Marketplace invocation is tied not only to Workflow Version but also to the applicable commercial/access terms.

Run evidence SHOULD snapshot/reference:

```text
listing revision
workflow version
creator pricing revision
terms/license revision
privacy disclosure revision where applicable
required connection disclosures
consumer acceptance timestamp when required
```

Material changes that MAY require renewed acknowledgement include:

```text
creator fee increase
new publisher-visible consumer data
new external connection requirement
new high-risk side effect
material license/usage restriction
material privacy change
```

Rules:

- minor descriptive text edits need not force re-consent;
- a run SHALL use the terms/pricing revision accepted/authorized for that run;
- public listing update SHALL clearly surface material changes;
- consent UI MUST NOT bundle undisclosed optional data sharing as mandatory workflow execution;
- withdrawal of future consent does not erase valid historical accounting/audit records;
- legal/compliance details are delegated to applicable platform policy, but the product architecture SHALL retain revision evidence.

---

# 160BK. Evaluator / QC Revision Pinning, Calibration and Drift

Workflow decisions may depend on AI evaluators/QC thresholds.

A QC/Evaluator node SHALL snapshot:

```text
evaluator type
rubric version
threshold
model policy / resolved model where relevant
prompt/template revision
deterministic validators
calibration revision if used
```

Rules:

- changing rubric/threshold creates a semantic configuration change;
- a historical run SHALL be explainable using the evaluator revision it actually used;
- marketplace canary/stable comparison SHOULD not mix incompatible evaluator revisions without labeling;
- evaluator model drift MAY trigger recalibration/revalidation;
- an evaluator SHALL not silently approve its own consequential action where human/independent approval is required;
- repeated evaluator disagreement SHOULD be observable;
- quality score is evidence, not automatically billing finality;
- deterministic checks SHOULD remain separate from subjective AI evaluation.

Feature 196 may own higher-level Quality Contracts; Spec 209 owns the saved workflow's evaluator configuration/version presentation.

---

# 160BL. Revision 5 Acceptance Criteria — Distributed and Cross-Spec Hardening

- [ ] Spec 209 declares compatible shared contract versions/ranges rather than copying companion definitions.
- [ ] Mixed-version Runner/MCP/Agent deployments fail safely when contracts are incompatible.
- [ ] Workflow Run events have stable sequence/idempotent replay semantics.
- [ ] Out-of-order real-time events cannot regress UI canonical state.
- [ ] Running workflow cannot silently rewrite its saved Workflow Definition.
- [ ] Dynamic runtime expansion is bounded, traced and remains inside parent permissions/budget.
- [ ] Collection resume can retry failed items without repeating committed successful items.
- [ ] Iteration reducer deduplicates by stable item identity.
- [ ] Attached child Workflow inherits parent lifecycle/resource bounds.
- [ ] Detached child execution requires explicit authorization and independent ownership/budget.
- [ ] Workflow exposed over API/MCP/A2A normalizes to the same canonical run contract.
- [ ] Protocol exposure cannot bypass entitlement/billing/tenant policy.
- [ ] Queued/paused run revalidates revoked permissions and material cost/model drift before continuing.
- [ ] Expired quote/material over-budget change can require new user authorization.
- [ ] Residency policy constrains provider/Runner/artifact placement.
- [ ] Strict residency policy treats unknown processing region as unknown/ineligible as configured.
- [ ] Public API and SDK compatibility ranges are versioned and testable.
- [ ] Stable machine-readable error codes exist for workflow API failures.
- [ ] Metrics avoid uncontrolled high-cardinality labels.
- [ ] Trace sampling never removes canonical audit/economic/execution truth.
- [ ] Marketplace run records applicable terms/pricing/privacy-disclosure revisions.
- [ ] Material Marketplace changes can require renewed acknowledgement.
- [ ] QC/evaluator rubric, threshold and model/template revision are pinned for historical explainability.
- [ ] Evaluator drift/calibration change is visible and does not silently rewrite old results.

---

# 160BM. Revision 6 — Mini App Hub, Vector Catalog and External Skill Bundle Contract

Revision 9 closes the user-facing Mini App management and external-dependency
gaps found by the focused requirements audit. This section is normative and
does not claim that the current repository already implements these surfaces.

## 160BM.1 Central Mini App Hub

Spec 209 SHALL provide one authenticated, tenant-scoped **Mini App Hub** as the
central place to discover, register, select, bookmark, pin and remove Mini Apps.
Creating or publishing a Mini App SHALL return the creator to the Hub with the
new app visible in the appropriate "Created by me" and "Registered" views; it
MUST NOT leave the user with an untracked app that can only be found by repeating
Marketplace search.

The Hub SHALL expose these simple user-facing views:

```text
My Mini Apps
  - Pinned / Frequent
  - Registered
  - Created by me
  - Recently used
  - Needs setup
Bookmarks
Marketplace
Search results
```

The Hub MAY be a new authenticated route such as `/mini-apps`, or a route-level
workspace surface with the same contract. It MUST be a single coherent manager,
not separate disconnected lists owned by Builder, Marketplace and Assistant.

### Relationship semantics

The UI and API MUST distinguish these actions; one action MUST NOT silently
perform another action:

| Action | Meaning | Entitlement/install effect | Removal behavior |
|---|---|---|---|
| `REGISTER` | Add the Mini App to the user's/tenant's managed Mini App collection | Creates a user-library relation and records the applicable entitlement/version policy; may leave the app in `NEEDS_SETUP` | Unregister removes the managed relation, not the publisher's app or historical runs |
| `SELECT` | Choose the Mini App for the current Builder, Assistant or Run context | Requires the listing's select/use policy; does not imply bookmark or pin | Selection expires with the context unless recorded as recent use |
| `BOOKMARK` | Save the listing for later discovery | Does not grant execution, download or install rights | Unbookmark removes only the personal bookmark |
| `PIN` | Put a registered/usable Mini App in the quick-access/frequent area | Requires a valid registered relation and allowed use; does not change pricing or permissions | Unpin keeps the app registered and usable |
| `REMOVE` | Stop showing the app as a registered/pinned quick-access item | Revokes only the user's local registration/use relation; entitlements and publisher data follow their owning policy | User may retain a bookmark or re-register later if still eligible |

Each Marketplace listing SHALL declare an action policy:

```text
allowed_actions: [REGISTER, SELECT, BOOKMARK, PIN]
registration_mode: NONE | OPTIONAL | REQUIRED
selection_mode: DIRECT | REGISTERED_ONLY | ENTITLED_ONLY
bookmark_mode: PUBLIC | ENTITLED_ONLY | DISABLED
pin_mode: REGISTERED_ONLY | SELECTABLE | DISABLED
remove_mode: UNREGISTER | UNBOOKMARK | OWNER_ONLY
```

The server SHALL enforce this policy from the authenticated user, tenant,
workspace, listing, version, license and dependency rights. A disabled button
MUST include a short reason and the next permitted action. Client state MUST NOT
grant access by changing an action label or URL.

### Central Hub interaction contract

The Hub SHALL support, without a complex flow:

1. search by natural-language intent and structured filters;
2. open a detail view showing capabilities, version, cost, access, required
   tools/skills and readiness;
3. register, select, bookmark, pin or remove according to the listing policy;
4. use a registered or selected Mini App directly from its card;
5. open a concise setup checklist when a dependency is missing;
6. remove/unpin/unbookmark with one clear action and preserve history;
7. return to the same filtered view after an action, without forcing another
   full Marketplace search.

The default card MUST show at least:

```text
name, publisher, version, status, access, action state,
required external tools, required Skill bundles, readiness summary,
estimated usage cost/range, last used, pinned/bookmarked/registered state
```

The Hub MUST show explicit states for `REGISTERED`, `BOOKMARKED`, `PINNED`,
`NEEDS_SETUP`, `READY`, `DEGRADED`, `UNAVAILABLE`, `REMOVED` and `REVOKED`.
Unregistering MUST NOT delete a consumer's generated Library assets, runs,
audit evidence or billing history.

## 160BM.2 UI/UX Contract

### Target User / JTBD

- Role: authenticated creator, consumer or tenant/workspace operator.
- Goal: find a Mini App or Skill once, understand what it needs, make it ready,
  and use it again without repeating discovery.
- Entry point: `/mini-apps`, a Builder "Use Mini App" action, Assistant capability
  picker or Marketplace detail page.
- Success outcome: the user can identify whether the app is registered,
  bookmarked, pinned and ready, then run it with no hidden setup.

### Existing Pattern Reference

- Searched with targeted `rg` because SocratiCode MCP was unavailable:
  `apps/web/client/src/pages/Marketplace.tsx`,
  `apps/web/client/src/pages/SkillBrowser.tsx`,
  `apps/web/server/routers/marketplace.ts`,
  `apps/web/server/routers/skills.ts`, and
  `apps/web/server/routers/runnerNodes.ts`.
- Found: Marketplace search/category/grid/detail interaction; Skill Browser
  search/category/pagination/visibility interaction; Runner inventory and
  readiness projection.
- Decision: **reuse** those interaction patterns and semantic state vocabulary.
- Divergence: add one unified Mini App Hub because no existing Mini App manager
  or user registration/bookmark/pin surface was found.

### Surface inventory

| Surface | Target route/component | Responsibility |
|---|---|---|
| Mini App Hub | authenticated `/mini-apps` | registered, pinned, recent, bookmarked and setup-needed lists |
| Marketplace tab | Hub Marketplace tab plus existing Marketplace detail pattern | semantic/hybrid discovery and policy-aware actions |
| Mini App detail | Hub detail drawer/page | version, capability, price, dependency, rights and readiness explanation |
| Dependency panel | `DependencyReadinessPanel` | install/connect/probe status and remediation |
| Bundle installer | `SkillBundleInstallDialog` | rights consent, hash/signature verification, atomic install state |
| Run gate | pre-run confirmation/readiness panel | server-authoritative final check before invocation |

### Component map

| Component/service | Target ownership | Consumes |
|---|---|---|
| `MiniAppHubPage` | Spec 209 UI | Hub list/search/action APIs |
| `MiniAppCard` | Spec 209 UI | listing, user relation, entitlement and readiness projection |
| `MiniAppMarketplaceSearch` | Spec 209 UI | `catalog.search` with `mini_app`/`skill` filters |
| `DependencyReadinessPanel` | Spec 209 presentation; owning runtime supplies truth | dependency manifest, Runner snapshot, install status |
| `SkillBundleInstallDialog` | Spec 209 presentation; package protocol performs install | rights, artifact hash/signature, target tool/profile |
| Catalog indexer | shared Vector Provider/RAG ownership | canonical Skill/Mini App metadata and revision events |
| External tool probe/install | Spec 197 / Spec 200 / Spec 210 owner boundary | authenticated Runner capabilities and approved adapter protocol |

### State matrix

| State | Expected UI | Required behavior |
|---|---|---|
| `loading` | skeleton cards and disabled actions | no optimistic permission or readiness claim |
| `empty` | clear message plus Marketplace/search action | user can discover or create an app without dead end |
| `error` | retry plus error code/message | preserve filters and do not silently show an incomplete list as complete |
| `partial` | visible "indexing/setup incomplete" badge and affected count | provide retry/status path; never imply all results are indexed |
| `registered` | Registered badge and Use/Pin/Remove actions | retain app in My Mini Apps across sessions |
| `bookmarked` | Bookmark toggle and no false Ready badge | bookmark alone does not authorize execution |
| `pinned` | Pinned/Frequent section and Unpin action | unpin does not unregister |
| `needs_setup` | missing dependency list and Setup action | Run is disabled until required readiness gates pass |
| `installing` | progress, cancel/rollback-safe status | no run or duplicate install while installation is unsettled |
| `ready` | primary Use/Run action | run performs a fresh server-side preflight |
| `degraded/unavailable` | reason code, last probe and remediation | no silent fallback unless the immutable policy allows it |
| `revoked` | access revoked message and Remove/Contact publisher | historical runs remain readable according to policy |

### Responsive and accessibility acceptance

- `mobile 390x844`: Hub uses a single-column card/list flow; actions remain
  reachable without horizontal scrolling; detail/readiness opens as a full-screen
  sheet.
- `tablet 768x1024`: two-column discovery/list layout; detail panel remains
  readable; filters collapse without hiding action state.
- `desktop 1440x900`: persistent Hub navigation with list/detail split view;
  search and readiness summary remain visible while inspecting an app.
- `small-mobile 360x800`: no clipped action labels or dependency rows.
- `laptop 1024x768`: avoid a three-pane layout; collapse detail when needed.
- Keyboard users can reach Search → filters → card → primary action → detail
  dependency controls in a deterministic order; selected/pinned/bookmarked state
  has text and non-color indicators; focus is visible; dialogs trap focus and
  support Escape; reduced motion is honored.

### Copy contract and browser evidence

- Primary languages: Thai and English through the existing i18n system.
- Required action labels: `ลงทะเบียน / Register`, `เลือกใช้ / Select`,
  `บันทึก / Bookmark`, `ปักหมุด / Pin`, `ถอดออก / Remove`,
  `ติดตั้งสิ่งที่จำเป็น / Set up requirements`, `ตรวจสอบความพร้อม / Check readiness`.
- Missing dependency copy MUST name the exact tool/Skill, version/range and
  action required; it MUST NOT say only "Something went wrong".
- Browser evidence SHALL cover mobile 390x844, tablet 768x1024 and desktop
  1440x900, including empty, registered, bookmarked/pinned, needs-setup,
  installing, ready and error states. Missing browser tooling is a documented
  skip with manual inspection notes, not a pass.

## 160BM.3 Vector Catalog Contract for Skills and Mini Apps

All **discoverable** Skill and Mini App records SHALL be represented in the
shared semantic catalog. "All" means every active/public or otherwise
ACL-eligible revision; private, revoked and unlisted records MUST remain
filtered and MUST NOT leak through embeddings, counts or snippets.

Spec 209 SHALL reuse the provider-neutral `Vector Provider` and its configured
Cloudflare Vectorize/pgvector/Chroma adapter. It MUST NOT add a second vector
database, bypass tenant namespaces, or query a provider directly from the UI.

Each catalog record SHALL include a deterministic identity and revision:

```text
catalog_type: MINI_APP | SKILL
entity_id
published_or_registry_revision
content_hash
tenant_scope / workspace_scope / visibility
name, description, localized text, tags, category
capabilities, input types, output types
required capabilities, preferred tools, required Skill bundles, platform/runtime constraints
cost/risk/permission characteristics
version, publisher/owner, status
```

The embedding document SHALL combine natural-language description with the
structured facets above. Search SHALL support:

```text
semantic intent and synonyms
exact name/slug/tag matching
capability and input/output facets
required external tool or Skill filtering
language, platform, tenant/workspace and visibility filtering
readiness/availability filtering
cost/risk/permission constraints
```

Results SHOULD use hybrid ranking (semantic vector + lexical/exact signals) and
MUST apply ACL/tenant filters before returning metadata. The result SHALL state
why an item matched and whether it is `READY`, `NEEDS_SETUP`, `DEGRADED` or
`UNAVAILABLE`; a semantic match is never an authorization grant.

### Index lifecycle and completeness

1. Skill registry sync, Mini App create/publish/update/revoke and dependency
   revision events enqueue a canonical indexing Job through Feature 195/outbox.
2. The indexer produces/upserts one record per entity revision using a stable
   provider/index/namespace identity and verifies the mutation where supported.
3. `capability_catalog_index_records` records `PENDING`, `INDEXED`, `FAILED`,
   `REVOKED` or `UNKNOWN`, last attempt, content hash, provider/index revision,
   failure reason and reconciliation timestamp.
4. A scheduled reconciliation compares the canonical Skill/Mini App source set
   with index records and repairs missing, stale, duplicate or unauthorized
   vectors. It MUST be idempotent and bounded.
5. Publish/enable flows MUST NOT report `search_ready` until the revision is
   indexed or an explicit, visible `INDEXING` state is returned. Failed records
   MUST remain discoverable to operators and MUST page/alert according to the
   catalog SLO; they MUST NOT disappear silently.
6. Search MAY use lexical fallback while vector indexing is pending, but the UI
   MUST disclose degraded semantic coverage and the reconciler MUST continue until
   coverage is restored.

The catalog completeness target is 100% of eligible active revisions indexed,
with separate coverage metrics for Mini Apps and Skills, by tenant/visibility
scope and provider. Coverage proof MUST include total eligible, indexed, pending,
failed, revoked and stale counts; a successful query alone is not proof of
complete indexing.

## 160BM.4 External Tool and Skill Bundle Manifest

Every Mini App that depends on an external tool or Skill SHALL publish a
machine-readable dependency manifest and a human-readable requirements panel.
At minimum, each dependency declares:

```text
dependency_id
kind: EXTERNAL_TOOL | SKILL_BUNDLE | MCP | RUNNER_CAPABILITY | CONNECTION
selection_role: HARD_CAPABILITY | PREFERRED_TOOL | OPTIONAL_TOOL
provider/tool_id and adapter/protocol id
compatible provider/tool/adapter alternatives, if any
version/range and resolved version when locked
supported OS/architecture/runtime profile
required Runner/device/browser profile
required scopes/permissions and user-owned connection type
install_mode: BUNDLED | MARKETPLACE_DOWNLOAD | PUBLISHER_SETUP | PREINSTALLED
artifact_ref, content_hash, signature/trust status where applicable
license/terms and rights: discover, download, install, execute, redistribute, source_visible
readiness probes and remediation instructions
fallback policy, if any
```

The listing SHALL show before Register, Select or Run:

```text
Required capability / compatible choices
  - logical capability and compatible external tools/adapters
  - preferred tool, if any, clearly marked as a recommendation
  - Skill bundle name/version/hash and compatible target profiles
  - install/connect/sign-in/grant-permission action
  - supported OS/device/Runner requirement
  - user-owned cost or external subscription requirement
  - whether the publisher grants download/install rights
  - current readiness and the exact blocking reason
```

### External Skill bundle packaging

When a Workflow uses a Skill that must exist inside an external tool runtime,
publication SHALL resolve that Skill and its transitive Skill dependencies into
an immutable Marketplace bundle or explicitly mark the app as requiring
publisher-managed setup. For each supported Claude, Codex, Antigravity or
another approved external-tool profile, the bundle SHALL declare:

```text
target external tool and adapter contract
Skill id/version/source revision
all required nested Skill files and schemas
install layout/profile name
content hash and signature/trust evidence
license and consumer rights
compatibility range and readiness probe
```

The bundle MUST NOT contain API keys, OAuth tokens, cookies, raw secret values,
publisher-private credentials or an unapproved arbitrary executable payload.
Skill source visibility and redistribution MUST follow the declared rights. If
the publisher does not grant download/install rights, the Marketplace MUST show
that fact and require the permitted publisher/tenant setup path; it MUST NOT
pretend that the Mini App is self-contained.

Spec 209 owns dependency declaration, listing disclosure, rights-aware Hub UX
and the immutable bundle reference. The canonical Skill Registry owns Skill
identity/content. Feature 197 and Specs 200/206/210 own external-tool adapter,
Runner installation/probe and execution. No Mini App may bypass those owners by
downloading a CLI or invoking a shell directly from the browser or Workflow
Studio server.

## 160BM.5 Install, Rights and Readiness Gate

Registering or selecting a Mini App SHALL evaluate the listing's rights and
dependency policy. A user MAY bookmark a listing without installing it, but
`REGISTER` and `RUN` require the relevant entitlement/rights. Installation MUST:

1. display the bundle/dependency list, license/terms and requested permissions;
2. verify publisher/platform trust, content hash and signature where required;
3. install atomically into the owning package/Runner scope, never partially;
4. report progress and durable failure reason;
5. support rollback/cleanup of a failed or superseded installation;
6. record the installed revision and source without recording secrets;
7. re-check rights and version compatibility before execution.

Readiness is server-authoritative and SHALL combine the dependency manifest with
the current Runner/connection snapshot. The normalized state MUST expose the
current repository dimensions:

```text
install_state
configuration_state
auth_state
health_state
availability_state
trust/policy state
reason_codes
checked_at / snapshot_revision
```

The run gate SHALL block when a hard capability dependency is not ready, the
snapshot is expired, the Runner is revoked/untrusted, the connection is missing,
or the selected Skill/tool revision is incompatible. It MUST show the exact next
action. A missing preferred tool MUST NOT block execution when an approved
compatible adapter satisfies the logical contract and the user selects or
accepts that alternative. The system MUST NOT silently switch from Claude to
Codex/Antigravity, or from one Skill revision to another; any compatible
alternative or fallback must be visible and permitted by the user-facing policy.

Readiness MAY be rechecked on Register, Select, Install completion, app open and
immediately before Run. The final Run check MUST use server-derived tenant,
entitlement, Runner and dependency state; browser/local labels are advisory only.

## 160BM.6 User Library and Catalog Data Contract

`mini_app_user_library` SHALL preserve user intent without duplicating the
publisher's listing or the canonical workflow version. It SHOULD contain:

```text
tenant_id, workspace_id, user_id
mini_app_id / listing_id / selected_version_policy
registered_at, bookmarked_at, pinned_at, last_selected_at, last_used_at
removed_at, relationship source, entitlement snapshot reference
last readiness snapshot reference
```

`mini_app_dependency_installations` SHALL be scoped to the user/tenant and
Runner/device where installation occurs and SHALL contain state, version/hash,
probe revision, reason codes and timestamps, but no secret values or raw
credentials. `mini_app_readiness_snapshots` SHALL be immutable evidence of the
server-side check used for a decision.

`mini_app_skill_bundle_artifacts` SHALL reference immutable object/package
storage and include manifest hash, bundle hash, signature/trust result, license
and rights. It MUST NOT become a second Skill Registry.

`capability_catalog_index_records` SHALL be a coverage/reconciliation projection;
the vector values remain in the configured Vector Provider. Catalog indexing
execution uses canonical `workerJobs`/outbox and MUST NOT introduce a
catalog-owned queue, lease or settlement system.

## 160BM.7 Acceptance Criteria — Hub, Catalog and External Dependencies

- [ ] Creating/publishing a Mini App opens or refreshes the central Mini App Hub and the app is visible in Created by me and Registered when policy permits.
- [ ] Hub has Registered, Created by me, Pinned/Frequent, Recently used, Bookmarks, Marketplace and Needs setup views.
- [ ] Register, Select, Bookmark, Pin and Remove have distinct persisted semantics and policy-aware actions.
- [ ] A user can use a registered/pinned Mini App without repeating Marketplace search.
- [ ] Unregister/unpin/unbookmark are simple, reversible where policy permits, and do not delete runs, billing history or consumer Library assets.
- [ ] Marketplace listing and Hub detail show access, version, cost, required capabilities, compatible/preferred tools, required Skills, rights and readiness before Run.
- [ ] Search supports semantic intent, exact name/tag, capability, input/output, tool/Skill, language, platform, readiness, cost and permission dimensions.
- [ ] Eligible active Mini Apps and Skills have catalog index coverage with deterministic revision identity and ACL-safe metadata.
- [ ] Catalog indexing uses the shared Vector Provider and tenant/visibility namespaces; no second vector database or unfiltered global query exists.
- [ ] Reconciliation proves eligible/indexed/pending/failed/stale/revoked coverage and repairs missing records idempotently.
- [ ] Pending/failed vector coverage is visible as degraded/indexing and never silently presented as a complete catalog.
- [ ] Every external dependency has a machine-readable manifest and human-readable Marketplace requirements panel.
- [ ] External tool requirements identify Claude/Codex/Antigravity or other tool, version, OS/device/Runner, account/connection, install action and user-owned cost.
- [ ] External tool requirements distinguish hard capabilities from preferred and optional tools; a compatible alternative can satisfy a preference without duplicating the workflow.
- [ ] A required external Skill is packed as an immutable, hash/signature-checked bundle with all transitive Skill files/schemas or is explicitly marked publisher-managed setup.
- [ ] Bundle rights separately control discover, download, install, execute, redistribute and source visibility.
- [ ] Bundles contain no API keys, OAuth tokens, cookies or raw secrets.
- [ ] Install is atomic, reports progress/failure, supports rollback and records the installed revision without secrets.
- [ ] Server-authoritative readiness checks cover install, configuration, auth, health, availability, trust/policy and reason codes.
- [ ] Run is blocked with an actionable message when a required dependency/Skill/Runner is missing, incompatible, revoked or unhealthy.
- [ ] A missing preferred tool does not block a compatible selected alternative, while hard capability/permission/residency failures remain blocking.
- [ ] No silent tool/Skill fallback occurs; every alternative or fallback is declared, visible and permitted by the user-facing policy.
- [ ] Vector/catalog, Skill Registry, Runner and external adapter ownership remains delegated to their existing owners.


# 160BN. Revision 10 — Pre-Build Execution Option Discovery and User Selection

Revision 10 makes execution-choice discovery a first-class part of the AI
Workflow Builder. The Builder SHALL help the user choose the most suitable
compatible execution plan **before** creating the semantic Workflow Definition.
This is a planning and decision surface, not a second runtime or job system.

## 160BN.1 Product contract

The Builder SHALL treat a natural-language request as two separate artifacts:

```text
Workflow Intent Draft
    = ephemeral interpretation of the user's requested outcome

Execution Option Set
    = bounded candidate plans, readiness evidence and trade-offs
```

Only after the user selects an option or explicitly accepts the recommended
option may the Builder create a Draft Workflow Definition. If the user asks the
system to choose automatically, `AUTO` is recorded as an explicit user choice;
it MUST NOT be an implicit permission to hide material alternatives or silently
change tools later.

The Builder MUST show multiple options when there are materially different
compatible combinations of runtime, provider, protocol, Runner, locality,
privacy, cost, quality or setup effort. When only one compatible option exists,
the Builder MUST explain why and request confirmation if the option has material
cost, setup, privacy, residency, permission or side-effect implications.

## 160BN.2 Pre-build decision flow

The canonical flow is:

```text
User request
    ↓
Intent and logical capability extraction
    ↓
Hard-constraint and preference separation
    ↓
Candidate execution-plan generation
    ↓
Capability and dependency resolution
    ↓
User-scoped Runner / connection readiness snapshot
    ↓
Compatibility, policy, privacy, cost and locality evaluation
    ↓
Execution Options UI
    ↓
User selects / compares / accepts recommendation / chooses Auto
    ↓
Workflow Definition + selected preference/constraint snapshot
    ↓
Schema, graph, policy and cost validation
    ↓
Draft Workflow Version
```

The option-generation step SHOULD be bounded by configured limits for candidate
count, resolver latency and external readiness probes. It MUST NOT execute
side-effecting workflow nodes, consume paid model/media generation or create a
durable Workflow Run merely to display options. A user may explicitly request a
small test or probe, but that is a separate action with its own confirmation and
cost/permission gate.

## 160BN.3 Hard constraints versus preferences

The Builder and compiler MUST distinguish constraints that protect correctness
from preferences that guide recommendation:

```text
Hard constraints
  required capability and input/output contract
  permission and least-privilege grant
  data residency / privacy restriction
  supported protocol or execution target when technically necessary
  side-effect and approval requirements
  budget and policy ceiling
  tenant, marketplace and entitlement restrictions

Preferences
  preferred runtime/provider/agent/tool
  local versus cloud preference
  quality / latency / cost preference
  preferred Runner/device
  preferred connection
  user-selected fallback order
```

A framework, provider or tool brand MUST be treated as a preference unless a
versioned capability contract proves that the brand-specific behavior is itself
required. A publisher or platform default MUST NOT convert a preferred brand
into a hidden hard constraint. If a proprietary integration is genuinely
required, the option card MUST state the exact contract, reason and consequence
before the user commits.

## 160BN.4 Execution option contract

The conceptual option contract is:

```yaml
WorkflowBuildOption:
  option_id: string
  intent_revision: string
  logical_plan:
    capabilities: []
    input_contract: {}
    output_contract: {}
  route:
    runtime_family: native | openai_agents | pydantic_ai | external_agent | a2a
    protocol: native | mcp | a2a | acp | runner | other_governed
    execution_target: local_runner | cloud | remote_agent | existing_session
  preference:
    preferred_tools: []
    selected_tool: null
    selection_source: RECOMMENDED | USER | AUTO
  requirements:
    hard_constraints: []
    required_capabilities: []
    required_connections: []
    required_tools_or_skills: []
  readiness:
    status: READY_NOW | SETUP_REQUIRED | RUNNER_OFFLINE_OR_STALE |
      POLICY_BLOCKED | UNSUPPORTED | UNKNOWN
    runner_id: null
    snapshot_revision: null
    checked_at: null
    blockers: []
    setup_actions: []
  tradeoffs:
    estimated_cost: unknown
    latency_class: unknown
    privacy_class: unknown
    locality: unknown
    quality_class: unknown
    reliability_class: unknown
  fallback:
    mode: ASK_USER | EXPLICIT_EQUIVALENT_ONLY | NONE
```

`WorkflowBuildOption` is a planning contract. It MUST NOT become a second
Capability Registry, Runtime Registry or durable execution record. The canonical
Capability Registry, Feature 197 Runner projection, Specs 199/200/206/208/210/
211 and Feature 195/196 remain authoritative for their respective facts.

## 160BN.5 Runner and connection readiness

For every option that depends on a local or user-owned execution target, the
Builder SHALL consume the server-authoritative readiness projection for the
authenticated user, tenant and permitted workspace/device scope. The projection
MUST include, where applicable:

```text
Runner identity and device scope
OS / architecture / runtime profile
adapter and tool installation state
configuration state
authentication / connection state
health state
availability / online freshness
trust and policy state
installed Skill/bundle revision and hash
required permissions and scopes
last probe time and snapshot revision
reason codes and remediation actions
```

The Builder MUST NOT infer readiness from a client-side tool label, an old
snapshot, a raw CLI name, a browser extension flag or a successful discovery
search. A stale or offline Runner produces `RUNNER_OFFLINE_OR_STALE` or
`UNKNOWN`, not `READY_NOW`.

Readiness status semantics:

```text
READY_NOW
  All hard requirements and current policy checks pass.

SETUP_REQUIRED
  The plan is compatible, but installation, configuration, authentication,
  Skill/bundle setup or user permission is still required.

RUNNER_OFFLINE_OR_STALE
  The target may be compatible, but current readiness cannot be trusted.

POLICY_BLOCKED
  A tenant, privacy, residency, entitlement, permission or budget policy denies it.

UNSUPPORTED
  No approved adapter or execution target satisfies the logical contract.

UNKNOWN
  Required discovery or readiness evidence is unavailable.
```

## 160BN.6 User choice and setup behavior

The Execution Options UI SHALL provide, at minimum:

```text
Choose this plan
Accept recommendation
Choose Auto
Compare details
Refresh readiness
Set up requirements
Choose another compatible connection
```

The UI MUST label recommendations separately from requirements. It MUST show the
exact tool, Skill, connection, Runner, permission, OS/device or subscription
requirement for `SETUP_REQUIRED`. It MUST show the blocking reason and next
action for `POLICY_BLOCKED`, `UNSUPPORTED`, `RUNNER_OFFLINE_OR_STALE` and
`UNKNOWN`.

Selecting a setup-required plan MAY create a Draft Workflow Version with
`readiness_state = SETUP_REQUIRED` and a dependency/setup plan. It MUST NOT
create a runnable claim, start an external process, install a tool, grant a
secret or silently substitute another tool. Installation, sign-in, connection,
permission grant and Runner selection remain explicit user actions through the
owning platform surface.

If the user selects a compatible alternative to the recommended tool, the Builder
MUST preserve that selection without requiring a duplicated workflow. If the
user-selected option later becomes unavailable, the run MUST pause for a new
choice unless an explicit equivalent fallback policy permits automatic use of a
compatible alternative. The UI MUST disclose that fallback before execution.

## 160BN.7 Persistence and reproducibility

The saved Draft/Published Workflow Definition SHALL contain:

```text
logical capability requirements
hard constraints
user/workspace preference policy
selected strategy or explicit Auto choice
allowed compatible adapter families
fallback and re-planning policy
dependency and connection references
```

The selected option MAY include a versioned readiness snapshot reference and
decision evidence for reproducibility. It MUST NOT persist transient:

```text
Runner process IDs
PTY/pane IDs
ACP session IDs
Gas City bead/session IDs
browser tab generations
provider request IDs
temporary access tokens
```

At run time, the compiler creates the immutable-per-run
`AgentOSExecutionManifest` using the saved logical contract plus fresh
availability, policy, entitlement, budget and readiness evidence. A build-time
readiness snapshot is never proof that a later run is ready.

## 160BN.8 APIs and ownership

Spec 209 MAY expose workflow-builder APIs such as:

```text
workflow.build_intent
workflow.list_execution_options
workflow.refresh_execution_option_readiness
workflow.select_execution_option
workflow.create_draft_from_selected_option
```

These APIs SHALL remain composition/product APIs. They MUST delegate to:

```text
Capability Registry / Resolver
  logical capabilities and approved adapters

Feature 197 Runner readiness
  local device/tool/adapter reality

Specs 199/200/206/208/210/211
  protocol, external-agent, A2A, Computer Use and runtime-fabric contracts

Feature 195/196
  durable Job admission and shared orchestration after a workflow is selected
```

No Builder option API may create a workflow-owned queue, readiness database,
MCP manager, external-agent gateway, Runner control plane, credit ledger or
second persistent session model.

## 160BN.9 Security and policy invariants

- Readiness is advisory for selection but server-authoritative for execution.
- A user choice cannot bypass tenant, permission, residency, budget, entitlement,
  secret, approval or side-effect policy.
- A recommendation cannot grant access merely because it appears in the option list.
- A missing exact tool is not a hard failure when an approved compatible adapter
  satisfies the logical contract.
- A tool brand is not silently treated as equivalent when schemas, privacy,
  side-effect or quality guarantees differ.
- The Builder cannot install arbitrary executables or invoke raw shell commands
  from the browser or Workflow Studio server.
- Option comparison and readiness evidence must respect tenant/user/device ACLs.
- Setup actions must be explicit, auditable and reversible where the owning
  installation contract supports rollback.

## 160BN.10 Acceptance criteria

- [ ] A natural-language build request produces a bounded Execution Option Set before a semantic Workflow Definition is created when multiple material options exist.
- [ ] Each option identifies its logical capabilities, runtime/protocol route, execution target and trade-offs.
- [ ] The Builder checks the authenticated user's authorized Runner and connection readiness through the canonical Feature 197 projection.
- [ ] The UI distinguishes `READY_NOW`, `SETUP_REQUIRED`, `RUNNER_OFFLINE_OR_STALE`, `POLICY_BLOCKED`, `UNSUPPORTED` and `UNKNOWN`.
- [ ] The user can choose a compatible option, accept a recommendation or explicitly choose Auto before flow creation.
- [ ] A preferred tool is visibly marked as a recommendation and cannot silently become a hard requirement.
- [ ] A setup-required choice shows exact missing tools, Skills, connections, permissions, Runner and setup actions.
- [ ] Selecting a compatible alternative does not require duplicating the Workflow Definition.
- [ ] Setup-required selection creates only a clearly marked Draft and never claims that the workflow is ready to run.
- [ ] The Builder never silently installs, signs in, grants access or switches tools.
- [ ] A later run refreshes readiness and can pause for reselection when the selected option is unavailable.
- [ ] Workflow Definition stores logical requirements and preferences, not transient Runner/session/process identifiers.
- [ ] Build-time option discovery does not create a durable Workflow Run or invoke side-effecting/paid execution by default.
- [ ] All option, readiness and selection APIs preserve existing tenant, entitlement, secret, economic and retired-system boundaries.


# 161. Definition of Done

Spec 209 is production-complete only when the following end-to-end scenario works:

```text
1. Creator opens SmartAIHub Workflow Studio.

2. Creator types:
   “รับวิดีโอหลายไฟล์ วิเคราะห์ ตัดต่อไม่เกิน 3 นาที
    QC แล้วให้ฉัน approve”

3. AI Builder:
   - discovers capabilities;
   - generates multiple materially different execution options when available;
   - checks the creator's authorized Runner, tools, Skills and connections;
   - labels each option ready-now, setup-required, unavailable or unknown;
   - shows cost, privacy, locality, quality and setup trade-offs;
   - records the creator's selected option or explicit Auto choice;
   - creates workflow;
   - creates typed input/output contracts;
   - creates bindings;
   - creates default Mini App UI;
   - chooses allowed model policies;
   - validates;
   - shows diff.

4. Creator accepts.

5. Creator runs only until Generate Images.

6. SmartAIHub:
   - executes through Feature 195/196;
   - persists checkpoints/artifacts;
   - stops intentionally.

7. Creator inspects output and resumes.

8. Video node uses configured media model/fallback policy.

9. QC fails once and follows allowed repair path.

10. Human Approval waits durably.

11. Creator approves.

12. Result is stored in Library.

13. Creator publishes the same immutable workflow version as a Mini App.

13a. The central Mini App Hub shows the created app under Created by me and
     Registered, with Select, Bookmark, Pin/Frequent and Remove actions governed
     by the listing policy.

13b. The published listing shows every required external tool, Runner/device,
     connection and Skill bundle, including download/install rights and the
     current readiness state.

13c. If the app uses Claude, Codex, Antigravity or another external tool, the
     exact versioned Skill bundle is either downloaded/installed atomically with
     verified hash/trust evidence or the listing clearly requires publisher /
     tenant-managed setup.

13d. The central catalog indexes the eligible Mini App and Skill revisions and
     exposes coverage/indexing status without leaking private records.

14. Creator sets access = Public Marketplace
    and a creator fee.

15a. The consumer can register, select, bookmark or pin the app according to its
     action policy and can use it later from the Hub without repeating search.

15b. Before Run, the server performs a fresh entitlement, dependency, Skill,
     Runner, connection and readiness preflight; missing requirements block the
     run with an actionable message.

16. Another user opens the Mini App,
    sees required inputs and estimated credits,
    and runs it without viewing the graph.

17. SmartAIHub executes the same canonical workflow runtime.

18. Usage, model/Skill costs and creator fee
    are attributed to Spec 207.

19. Consumer receives the output.

20. Workflow creator receives economic attribution
    according to the configured revenue rules.

21. Both creator and consumer can inspect the run information
    permitted by their respective roles.

22. Creator later modifies the workflow by typing:
    “เปลี่ยน Video model และเพิ่ม fallback”
    creating a new draft version.

23. The old published Marketplace version remains unchanged
    until a new version passes audit and is published.
```


Additional production-hardening proof SHALL also demonstrate:

```text
23. A schedule-triggered workflow crosses a DST/timezone boundary
    without duplicate/unbounded catch-up runs.

24. A duplicate webhook delivery with the same event/idempotency identity
    produces only one billable business execution.

25. A 100-item collection fan-out obeys max parallelism and budget.

26. User cancels a run while child Agent/media work is active;
    cancellation propagates where supported and unknown finality remains explicit.

27. A failed v12 run is fixed in v13 and resumed only through
    explicit checkpoint compatibility/rebase lineage.

28. A public Mini App is executed by Consumer B;
    Publisher A sees aggregate analytics but cannot read B's raw files/prompts/results.

29. A node returns structurally invalid AI output;
    runtime validation catches it and applies only the bounded repair policy.

30. Two editors change the same Draft;
    a stale AI patch is rejected/rebased rather than silently overwriting newer work.

31. Workflow A and Workflow B form an event-trigger cycle;
    causal-chain protection halts the loop and records evidence.

32. Historical run evidence identifies the concrete prompt/model policy/tool/subflow
    revisions used sufficiently for supported replay/debug.
```



Revision 3 production-hardening SHALL additionally demonstrate:

```text
33. A workflow containing a 7-day Wait Until survives service restart
    and wakes once at the correct durable deadline.

34. A consumer revokes a connection while a workflow is paused;
    resume fails authorization cleanly rather than reusing cached credentials.

35. A provider returns rate limits during a 50-branch fan-out;
    concurrency/backpressure prevents a retry storm.

36. A published workflow has a transitive dependency changed/revoked;
    preflight detects the lock/trust mismatch before paid execution.

37. Publisher deploys v14 to a 10% canary cohort and later rolls back;
    all historical runs retain their actually resolved versions.

38. A production approval requires a different authorized approver
    from the workflow requester; self-approval is blocked.

39. An email notification provider accepts but does not confirm delivery;
    the workflow reports the correct delivery state rather than “read”.

40. A SECRET-derived field passes through a transform;
    logs and AI Builder context remain redacted.

41. A custom script attempts unrestricted network/filesystem access;
    sandbox policy blocks the attempt.

42. A workflow owner is removed from the tenant;
    ownership transfer/archive policy preserves published consumers and history.

43. A fork request is denied because a dependency does not permit redistribution.

44. Parent budget = 100 credits and two subflows run in parallel;
    child allocation cannot spend 100 credits each.

45. A malicious/accidental actor tries to delete a workflow after changing pricing;
    audit evidence of the pricing change remains.

46. Disaster-recovery restore reconciles schedules/idempotency before enabling triggers,
    producing no duplicate scheduled/webhook billing.

47. Expression-language behavior remains reproducible because its version
    and non-deterministic inputs are captured in runtime evidence.
```



Revision 4 SHALL additionally demonstrate:

```text
48. Two parallel branches attempt to update the same scalar state;
    compile/runtime rejects ambiguity unless an explicit reducer is configured.

49. An external provider completes a non-idempotent action,
    then SmartAIHub crashes before canonical node commit;
    recovery reconciles provider operation id instead of blindly repeating it.

50. A paused run depends on a checkpoint under retention;
    garbage collection preserves it until the run is resumed/cancelled/expired.

51. A model node receives input larger than its context/payload limit;
    configured shaping/chunking/fail policy executes visibly and deterministically.

52. A Marketplace subflow requests an unrelated creator connection;
    least-privilege grant blocks access.

53. A mutable Library alias changes after run start;
    historical run still references the concrete input version/snapshot it used.

54. Heavy public Marketplace traffic and tenant-internal interactive work compete;
    fair scheduling prevents starvation according to platform policy.

55. A completion callback is retried after timeout;
    the same semantic delivery id is used and duplicate downstream processing is avoidable.

56. A supposedly compatible Skill version changes output behavior;
    contract/test gate prevents automatic rollout when validation fails.

57. Security incident triggers a workflow/listing kill-switch;
    new runs stop immediately while historical evidence remains intact.

58. Publisher deletes a workflow while consumers still own generated Library files;
    consumer assets are not blindly deleted.

59. A legacy saved flow is migrated;
    invocation routes through one canonical Spec 209/Feature 195–196 path,
    and rollback does not create duplicate runs.
```



Revision 5 SHALL additionally demonstrate:

```text
60. Core/API is on a newer compatible shared contract while one Runner remains older;
    Capability Resolver excludes only incompatible execution routes rather than corrupting the run.

61. Real-time events arrive 104, 102, 103, 104-duplicate;
    projection converges to canonical sequence 104 without regressing state.

62. An Agent proposes 500 runtime tasks from one node;
    expansion guard caps/rejects work beyond configured depth/count/budget.

63. A 30-shot MAP completed 29 shots before failure;
    resume executes only the failed/pending item when policy permits.

64. Parent workflow is cancelled while an attached child is active;
    child cancellation is requested and lifecycle remains correlated.

65. The same public workflow is invoked through Mini App and A2A/API;
    both paths enforce identical entitlement, billing and version identity.

66. A paid run waits in queue while provider price rises above authorized budget;
    run pauses for refreshed economic authorization rather than silently overspending.

67. A tenant configured EU-only processing is offered a non-EU model fallback;
    Resolver rejects that fallback.

68. An older SDK calls a newer incompatible workflow API;
    server returns a stable compatibility error rather than misinterpreting payload.

69. A 5,000-item fan-out does not create 5,000 arbitrary metric label values;
    detailed evidence remains available according to trace/debug policy.

70. Marketplace creator increases fee and enables publisher-visible diagnostics;
    existing/returning consumer receives material-change acknowledgement before the new terms apply.

71. Historical QC decision can be reconstructed from the exact rubric/threshold/model-policy revision used.
```


If this full loop works with no duplicate Job system, no duplicate economic ledger, correct tenant/security boundaries, reusable subflows, typed data bindings, AI-first authoring, partial execution and Mini App/Marketplace publishing, the core intent of Spec 209 has been achieved.

---

# 162. Cumulative Ninety-Four-Pass Gap Audit

Revision 1 completed 17 focused passes. Revision 2 performed 18 additional completeness passes. Revision 3 performed 15 further implementation-hardening passes. Revision 4 performed 12 additional production-completeness passes. Revision 5 performed **12 additional distributed-runtime and cross-spec passes**. Revision 6 performed **20 focused Mini App Hub, catalog-index and external-dependency passes**. Revision 7 and Revision 8 each performed **20 repository/cross-spec convergence passes**. Revision 9 performed **20 Mini App/catalog/external-dependency passes**. Revision 10 performed **18 pre-build option/readiness/user-choice passes**, immediately patching each material gap found, for **172 cumulative focused passes**.

The Revision 1 review was structured around: The following gaps are explicitly closed in the normative sections above.

| Pass | Focus | Gap closed |
|---:|---|---|
| 1 | Product UX | Manual drag-and-wire was incorrectly positioned as primary authoring; AI-first is now normative. |
| 2 | Large workflow readability | Top-down orientation, collapsed subflows and separate data-edge visibility added. |
| 3 | Data plumbing | Typed binding, source picker and compatibility rules added. |
| 4 | Runtime development | Run-until, run-from, checkpoints, pinned data and partial completion added. |
| 5 | Model flexibility | LLM/media model policies, overrides, fallback and drift handling added. |
| 6 | Durable architecture | Explicit Feature 195/196/197 ownership and no-parallel-runtime rule added. |
| 7 | External execution | Spec 199/200/206/208 boundaries made explicit. |
| 8 | Productization | Workflow → schema UI → Mini App pipeline added. |
| 9 | Marketplace | Access, immutable versions, dependency health and entitlements added. |
| 10 | Economics | Creator pricing routes through Spec 207; no fixed-party or duplicate ledger design. |
| 11 | Security | Secrets, multi-tenant, marketplace scanning, permissions and untrusted input rules added. |
| 12 | Lifecycle | Version diff, breaking-change detection, migration, deprecation and end-to-end DoD added. |
| 13 | AI execution UX | Natural-language run-all/run-until/resume commands mapped to canonical runtime. |
| 14 | Mini App form scale | Exposure rules plus sections/wizard/conditional UI prevent large Skill forms becoming unusable. |
| 15 | Model lifecycle | Shared Model Registry contract prevents hard-coded model/provider lists from aging badly. |
| 16 | Marketplace funding | Consumer/creator/tenant funding modes, quote/reservation and credential boundaries added. |
| 17 | Platform abuse | Marketplace rate, concurrency and high-cost controls added. |

Further implementation audits SHOULD be performed against the actual repository before coding each phase.

---


## Revision 2 — Additional 18-Pass Audit

| Pass | Audit focus | Gap found | Immediate normative correction |
|---:|---|---|---|
| 18 | Cross-spec persistence ownership | Feature 196 can create ephemeral plans; persisted saved-flow ownership was ambiguous | Added 160B promotion boundary: Feature 196 ephemeral, Spec 209 persisted/published |
| 19 | Trigger reliability | Timezone/DST/missed-run, webhook replay and event delivery semantics were incomplete | Added 160C |
| 20 | Duplicate/concurrent runs | No complete overlap/idempotency/re-entrancy contract | Added 160D |
| 21 | Arrays/batch workloads | No first-class bounded For-Each/Map/Batch/Reduce semantics | Added 160E |
| 22 | Reuse/cost optimization | Pinned test data existed but production cache semantics did not | Added 160F |
| 23 | Cancellation/cleanup | UI mentioned pause/cancel but child propagation/finalizer/compensation was incomplete | Added 160G |
| 24 | Fix failed run after edit | Resume was version-pinned but safe v12→v13 repair/rebase was missing | Added 160H |
| 25 | Deployment environments | No complete Dev/Test/Production promotion/config-reference contract | Added 160I |
| 26 | Platform schema evolution | User workflow versions existed but Workflow Definition schema migration did not | Added 160J |
| 27 | Runtime type enforcement | Compile-time typed binding existed but invalid AI output runtime handling was incomplete | Added 160K |
| 28 | Agent memory isolation | Session/memory scope could leak between runs/consumers | Added 160L |
| 29 | Retrieval/RAG | Retrieval was only indirectly reachable through capabilities; evidence contract was not explicit | Added 160M |
| 30 | Marketplace consumer privacy | Publisher visibility into raw consumer inputs/outputs was not explicitly denied by default | Added 160N |
| 31 | Asset/network security | File-ingress and SSRF/egress boundaries were under-specified | Added 160O |
| 32 | Refund/dispute finality | Marketplace emitted billing facts but support/refund/dispute handoff was incomplete | Added 160P |
| 33 | Cross-workflow cycles | Subflow recursion was guarded but event-trigger loops across workflows were not | Added 160Q |
| 34 | Collaborative edit safety | Collaboration existed but autosave/stale AI patch conflict semantics were incomplete | Added 160R |
| 35 | Streaming + reproducibility/testing | Partial streams, nondeterministic assertions and concrete runtime config snapshot were incomplete | Added 160S–160U |

**Revision 2 audit result:** all 18 newly identified material gaps were patched into normative sections before this audit record was finalized.

---


## Revision 3 — Additional 15-Pass Audit

| Pass | Audit focus | Gap found | Immediate normative correction |
|---:|---|---|---|
| 36 | Expression/state semantics | Bindings mentioned expressions but no constrained language, scoping or deterministic rules existed | Added 160W |
| 37 | Long waits/deadlines | Ask User had a deadline but no complete durable delay/wakeup/hierarchical-timeout model | Added 160X |
| 38 | Credential lifecycle | Secret refs existed but rotation/revocation/expiry during pause/retry/resume was incomplete | Added 160Y |
| 39 | Provider backpressure | Marketplace rate limiting existed but provider quota/retry-storm/circuit/backpressure semantics were incomplete | Added 160Z |
| 40 | Dependency supply chain | Manifest existed but no transitive lock/trust/signature snapshot | Added 160AA |
| 41 | Safe release | Version publishing existed but no canary/traffic split/stable rollback contract | Added 160AB |
| 42 | Human-task governance | Approval existed but assignment/delegation/expiry/separation-of-duties was incomplete | Added 160AC |
| 43 | Notifications | Notification appeared only as a generic/finalizer concept; delivery semantics and duplicate handling were missing | Added 160AD |
| 44 | Data classification | Security/redaction existed but classified-data propagation across bindings was not normative | Added 160AE |
| 45 | Custom code | No explicit safe contract existed for user-authored transformation code | Added 160AF |
| 46 | Ownership lifecycle | Offboarding/transfer/orphaned published dependencies were under-specified | Added 160AG |
| 47 | Marketplace rights | Terms/license existed but clone/fork/dependency-right enforcement was incomplete | Added 160AH |
| 48 | Nested resource governance | Parent budget existed but subflow deadline/cost/concurrency inheritance was incomplete | Added 160AI |
| 49 | Audit integrity | Audit was referenced but privileged authoring/publishing event evidence was under-specified | Added 160AJ |
| 50 | Disaster recovery | Retention existed but backup/restore trigger/idempotency/economic safety was missing | Added 160AK |

**Revision 3 result:** 15 additional material gaps were identified and incorporated normatively before this audit record was finalized.

---


## Revision 4 — Additional 12-Pass Audit

| Pass | Audit focus | Gap found | Immediate normative correction |
|---:|---|---|---|
| 51 | Parallel state | Parallel branches had Join modes but shared-state write conflicts/reducers were not fully deterministic | Added 160AM |
| 52 | Node commit/finality | External completion vs artifact/output canonical commit crash boundary was under-specified | Added 160AN |
| 53 | Checkpoint retention | Resume/pinned/debug artifacts existed without a complete retention/GC/reference policy | Added 160AO |
| 54 | Model payload limits | Model capability policy existed but context window/media/request-size shaping was incomplete | Added 160AP |
| 55 | Least privilege | Secret refs existed but child subflow/agent ambient-authority inheritance was not explicitly prohibited | Added 160AQ |
| 56 | Mutable inputs | Run snapshot covered configs but mutable URL/Library/live-query input identity was incomplete | Added 160AR |
| 57 | Scheduling fairness | Concurrency existed but priority/fair-share/noisy-neighbor semantics were incomplete | Added 160AS |
| 58 | Outbound callbacks | Generic notifications/webhooks existed but completion callback signing/idempotency/exfiltration rules were incomplete | Added 160AT |
| 59 | Dependency behavioral drift | Lockfile/versioning existed but auto-compatible upgrades lacked contract-test/conformance gate | Added 160AU |
| 60 | Incident response | Marketplace suspension existed but fast runtime kill-switch/containment semantics were incomplete | Added 160AV |
| 61 | Storage ownership | General retention existed but workflow-vs-consumer artifact ownership/quota deletion reconciliation was incomplete | Added 160AW |
| 62 | Legacy cutover | Migration phases existed but canonical cutover/dual-write/rollback/idempotency preservation needed stronger rules | Added 160AX |

**Revision 4 result:** all 12 newly identified gaps were incorporated normatively before this audit record was finalized.

---


## Revision 5 — Additional 12-Pass Audit

| Pass | Audit focus | Gap found | Immediate normative correction |
|---:|---|---|---|
| 63 | Cross-spec versions | Spec 209 referenced companion owners but did not pin/negotiably consume shared contract families in mixed-version rollout | Added 160AZ |
| 64 | Event ordering/replay | Duplicate tolerance existed but no canonical sequence/causality/projection rebuild contract | Added 160BA |
| 65 | Runtime graph mutation | AI Builder was safe at authoring time, but runtime self-expansion/self-modification boundary was not explicit | Added 160BB |
| 66 | Iteration recovery | Collection fan-out existed but per-item checkpoint/resume/deduplication semantics were incomplete | Added 160BC |
| 67 | Child lifecycle | Subflows existed but attached vs detached child cancellation/budget ownership was incomplete | Added 160BD |
| 68 | Protocol exposure | Workflow-as-capability existed but API/MCP/A2A exposure normalization and no-duplicate-gateway rule were incomplete | Added 160BE |
| 69 | Queued-run drift | Quote/reservation existed but delayed execution revalidation for price/model/policy drift was incomplete | Added 160BF |
| 70 | Residency placement | Privacy/residency existed but explicit execution/artifact/provider placement and cross-region transfer rules were incomplete | Added 160BG |
| 71 | API/SDK compatibility | Internal workflow schema was versioned but public API/SDK compatibility/deprecation contract was incomplete | Added 160BH |
| 72 | Telemetry scale | Observability existed but metric cardinality/sampling/telemetry-cost budgets were incomplete | Added 160BI |
| 73 | Marketplace consent | Pricing/license metadata existed but terms/privacy/pricing revision evidence and material-change re-consent were incomplete | Added 160BJ |
| 74 | QC reproducibility | QC existed but evaluator rubric/threshold/model calibration revision pinning was incomplete | Added 160BK |

**Revision 5 result:** all 12 newly identified material gaps were incorporated normatively before this audit record was finalized.

---

## Revision 6 — Additional 20-Pass Mini App / Catalog / External-Dependency Audit

| Pass | Audit focus | Gap found | Immediate normative correction |
|---:|---|---|---|
| 75 | Central Mini App ownership | Builder, Marketplace and Assistant had no single user-facing Mini App manager | Added 160BM.1 central Mini App Hub and ownership boundary |
| 76 | Create-to-use continuity | A newly created app could be lost outside a repeated Marketplace search | Added Created by me/Registered promotion and Hub return contract |
| 77 | Register semantics | Register/install/admit behavior was not distinct from selecting a listing | Added explicit REGISTER semantics and server policy enforcement |
| 78 | Select semantics | Selecting an app could be confused with bookmark or installation | Added context-only SELECT semantics and selection policy |
| 79 | Bookmark semantics | Saved discovery state could be mistaken for execution entitlement | Added BOOKMARK semantics with no implicit access/install |
| 80 | Frequent use | No explicit path let users use a registered app without searching again | Added PIN/Frequent and Recently used views plus unambiguous removal |
| 81 | Remove behavior | Removal could accidentally imply deleting publisher data or user artifacts | Added unregister/unpin/unbookmark separation and history preservation |
| 82 | Existing UI pattern | New UI could diverge from existing Marketplace/Skill Browser patterns | Recorded reuse decision and the justified unified-Hub divergence |
| 83 | UI states | Setup, indexing, installing, revoked and degraded states were absent | Added complete Hub state matrix and actionable copy contract |
| 84 | Responsive/a11y | A dense manager could fail on mobile, keyboard or focus paths | Added viewport, keyboard, focus, semantics and reduced-motion acceptance |
| 85 | Vector ownership | Requirement could lead to a second Mini App vector database | Bound catalog discovery to the existing provider-neutral Vector Provider |
| 86 | Catalog entity coverage | Skill and Mini App records had no common indexed identity/revision | Added deterministic catalog type/entity/revision/hash metadata |
| 87 | Search dimensions | Semantic search dimensions and dependency/readiness filters were unspecified | Added hybrid semantic/exact search facets and match explanation |
| 88 | ACL safety | Vector results could leak private or revoked records | Required tenant/visibility/ACL filtering before metadata return |
| 89 | Index completeness | A successful query did not prove every eligible record was indexed | Added index projection states, coverage metrics and reconciliation |
| 90 | Index failure visibility | Pending/failed vectors could disappear silently | Added visible degraded/indexing state, operator status and bounded repair |
| 91 | External requirements disclosure | Marketplace did not require a full install/setup disclosure | Added machine-readable manifest and human-readable Required to run panel |
| 92 | External Skill packaging | A Mini App could depend on Claude/Codex/Antigravity Skills that were not shipped | Added immutable transitive Skill bundle or explicit publisher-managed setup |
| 93 | Rights and secrets | Download/install rights and secret exclusion were incomplete | Added per-action rights, hash/signature/trust checks and no-secret bundle rules |
| 94 | Run readiness gate | Missing tool/Skill/auth/Runner state could reach execution or silently fallback | Added server-authoritative readiness preflight, actionable block and explicit fallback policy |

**Revision 6 result:** all 20 newly identified user-goal and completeness gaps were
patched into normative sections 160BM, API/Data Model sections 100–101 and the
Definition of Done. The implementation remains target architecture until the
corresponding Hub, catalog projection, bundle installer and readiness paths exist
in the repository.

---

## Revision 7–9 — Repository and Mini App Convergence Audits

The Revision 7 and Revision 8 audits preserved the Feature 195/196/197,
MCP, external-agent, A2A, Computer Use, economics, tenant and retired-system
ownership boundaries against current repository evidence. Revision 9 added the
Central Mini App Hub, catalog coverage, external dependency disclosure, Skill
bundle rights and server-authoritative readiness contract. Their detailed
evidence remains in `audit-revision-7.md`, `audit-revision-8.md` and
`audit-revision-9.md`.

---

## Revision 10 — Additional 18-Pass Pre-Build Option / Readiness Audit

The Revision 10 audit found and closed the gap that Builder creation could move
directly from natural-language intent to a Workflow Definition without first
showing user-specific runtime/tool choices. Section `160BN` now requires:

```text
intent → candidate plans → Runner/tool/connection readiness
       → trade-off comparison → user selection/Auto confirmation
       → Workflow Definition
```

The amendment separates hard capability constraints from preferred tools,
prevents silent provider/tool switching, supports setup-pending Drafts, keeps
transient Runner/session identities out of workflow semantics and preserves all
shared registry, Runner, Job, gateway, economic and retired-system boundaries.
The detailed 18-point evidence and implementation gates are recorded in
`audit-revision-10.md`.

# 163. Final Architecture Summary

```text
                    USER / CREATOR
                          │
                   Natural Language
                          ▼
                 ┌─────────────────┐
                 │ AI WORKFLOW     │
                 │ BUILDER         │
                 └────────┬────────┘
                          │
                    Proposed Patch
                          │
               Validate / Diff / Apply
                          │
                          ▼
                 WORKFLOW DEFINITION
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
      Visual View     UI Schemas      Model Policies
    Top-down Canvas    Input/Result       / Fallback
          │               │                │
          └───────────────┼────────────────┘
                          │
                          ▼
                    Workflow Compiler
                          │
                          ▼
             Feature 196 Orchestration
                          │
                          ▼
             Feature 195 Durable Jobs
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                     │
     Skills/MCP       Agents/A2A          Runner/Computer
      Spec 199        200 / 206           197 / Spec 208
        │                 │                     │
        └─────────────────┼─────────────────────┘
                          │
                          ▼
                    Artifacts / Library
                          │
                          ▼
                    MINI APP EXPERIENCE
                          │
          ┌───────────────┼────────────────┐
          │               │                │
        Private        Shared         Marketplace
                                           │
                                           ▼
                                      Credit Charge
                                           │
                                           ▼
                                   Spec 207 Economic Plane
                                           │
                   ┌───────────────────────┼──────────────┐
                   ▼                       ▼              ▼
                Platform                Tenant         Creator /
                                                    Capability Owners
```

**Spec 209 therefore completes the product loop:**

```text
Describe → Build → Inspect → Test → Debug → Reuse → Publish
→ Discover → Run → Charge → Attribute Revenue → Improve
```
