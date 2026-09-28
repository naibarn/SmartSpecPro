# Spec 200 — SmartAIHub Universal External Agent Control Plane, Knowledge, Asset & Skill Gateway

**Status:** Implementation-ready target specification  
**Spec ID:** 200  
**Revision:** 7 — adds the hierarchical Task Control monitoring projection, clarifies separate Runner/Worker authentication connections and aligns the Runner-hosted agent catalog with Hermes/OpenClaw while preserving the unified Spec 199/200 orchestration, capability, Runner, RAG, asset and approval contracts
**Suggested repository path:** `specs/feature/200-universal-coding-agent-control-plane/spec.md`  
**Related specs:** Feature 194 Vectorize/pgvector/Chroma retirement and cutover; Feature 195 Unified Async Job Control Plane; Feature 196 Goal Orchestration; Feature 197 Runner Adaptive Execution Fabric; Feature 198 Intelligent Chat, Universal Orchestration & Capability Evolution; Feature 199 External MCP Gateway & Upstream Management; **Feature 206 A2A-First Hybrid External Agent Interoperability**; Feature 204 Cloudflare Container Runtime Control Plane; Feature 205 SmartAIHub Runner Cross-Platform Runtime
**Companion specs:** Feature 199 — External MCP Gateway & Upstream Management; **Feature 206** — A2A-first route selection and normalization. Spec 206 selects between A2A and Spec 200 native adapters; it does not replace this control plane.
**Current codebase implementation status:** Partial; current Chat, Agent runtime, MCP, Worker and Job Control Plane building blocks exist, and the hierarchical Task Control monitoring slice is implemented, but the complete provider-independent Agent Task/Runner Control contract remains target work.
**Shared cross-spec contracts:** `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`; Feature 200 owns delegated External Agent runtime semantics.
**Primary systems:** SmartAIHub Web, Universal AI Assistant, SmartAIHub Backend, Context Broker, Skill Gateway, Asset Gateway, SmartAIHub Runner, SmartAIHub Worker App, Unified Job Control Plane  
**Primary execution targets:** Windows, macOS, Linux, remote/cloud agents  

## Retired execution boundaries

This specification MUST NOT add callers, routes, schemas, migrations, compatibility paths or dispatch adapters for Agency, `work/request`, `work/requests`, `workpacks/*`, the retired `/workflows` custom workflow engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. In this document, `Workflow`/`workflow` means only a governed Feature 196 Goal/Plan or approved LangGraph flow; it never means the retired `/workflows` engine. Isolated server execution uses approved Cloudflare Containers, and local execution uses the Feature 197 Runner boundary.

## Revision 4 Alignment Additions

This revision incorporates the architecture decisions made after the first Spec 200 draft:

- automatic device/runtime discovery and provider registration;
- per-device capability and project/workspace registry;
- direct persistent Runner Control Channel;
- explicit separation of `worker_jobs` from realtime transport;
- command ACK, event ACK, local durable event buffering, replay and reconciliation;
- desired-state vs observed-state execution semantics;
- resilience to WebSocket loss, backend restart, Runner restart and device sleep;
- provider-specific native result transport;
- independent workspace/result verification;
- integration with SmartAIHub `/chat`;
- integration with Universal AI Assistant Launcher / Side Panel;
- current-page/current-project context propagation;
- SmartAIHub Context / Knowledge Plane;
- scoped access to RAG, Help, Specs, Library and related SmartAIHub knowledge;
- Context Package + live retrieval model;
- job-scoped knowledge authorization and provenance.

## Revision 5 Alignment Additions — Hierarchical Task Control Monitoring

Revision 5 records the shared monitoring contract for multi-step work started
from Chat, the Universal Assistant or another approved product surface. This is
a monitoring projection over the existing Feature 195 durable Job state; it is
not a new execution engine, queue, ledger, workflow runtime or realtime
transport.

The normative requirements are:

- `worker_jobs` and `worker_job_events` remain the canonical durable source.
  The protected `workerJobs.taskGroups` query is a read projection and MUST
  enforce both the authenticated tenant and requesting-user scope.
- Open jobs, including `waiting_external`, MUST be grouped with this
  precedence: valid orchestration `planId`, then `workflowRunId`, then an
  isolated single-job group. Malformed orchestration metadata MUST be surfaced
  as degraded metadata and MUST NOT merge unrelated jobs.
- A group MUST expose deterministic aggregate status, bounded progress,
  completed/total steps, the active step, and the latest safe event. Failed,
  expired or canceled work MUST remain visible; a group is successful only when
  all known required steps are successful.
- Step dependencies MAY resolve completed predecessor jobs by the explicit
  `dependsOnJobIds` metadata only. Dependency lookup MUST use the same tenant
  and requesting-user predicates, bounded continuation and safe projection;
  completed predecessors MUST appear under the active group without creating a
  detached completed-only group.
- The source scan MUST be bounded to 500 open jobs and disclose truncation;
  group pagination MUST expose `hasMore`/`nextOffset`. The UI MUST disclose a
  source cap and provide the existing full Job view for exhaustive inspection.
- The shared Feedback/Chat launcher and `/chat` Universal Control Plane panel
  MUST expose the same task-group view inline, with expandable steps showing
  status, progress, worker/runtime, latest event, prerequisites and the
  existing cancel action. It MUST NOT navigate users to a separate Chat URL or
  create a second Task Control surface.
- The projection MUST redact raw input, credentials, provider payloads,
  arbitrary progress data and unverified URLs. Spec 199 owns MCP upstream
  transport and MUST NOT implement a parallel task monitor; Spec 200 consumes
  the shared Job projection for External Agent work.

The detailed implementation addendum is maintained at
`task-control-multistep-tracking/spec.md`; it MUST remain subordinate to this
Revision 5 contract and cannot introduce a conflicting source of truth.

**Initial providers:** Codex, Claude Code, Google Antigravity, DeepSeek Harness, Hermes Agents, OpenClaw-compatible runtimes
**Future providers:** ZCode, Gemini CLI, OpenCode, Aider, other coding-agent harnesses

The Runner-known catalog and registration contract MUST recognize all six
initial providers even when their execution adapters are delivered in phases.
An installed-but-unready or adapter-missing provider is registered as a
non-selectable capability state; it MUST NOT be reported as executable.

---

### Revision 3 Additions

Revision 3 consolidates the entire architecture discussed after the original draft and broadens Spec 200 from a coding-only integration into SmartAIHub's universal external-agent execution architecture.

This revision adds or formalizes:

- Universal External Agent Control Plane;
- coding as one `task_family`, not the only task type;
- media-edit and asset-aware agent tasks;
- Asset Gateway and asset-reference model;
- SmartAIHub Skill / Capability Plane;
- remote skill discovery and invocation;
- prohibition on requiring external agents to download/install SmartAIHub Skill packages;
- Skill Registry, semantic skill discovery, versioning, billing, permissions and execution routing;
- SmartAIHub Knowledge / Context Plane;
- RAG, Help, Specs, Library and project knowledge access;
- Context Package + live scoped retrieval;
- `/chat` and Universal AI Assistant Launcher / Side Panel as first-class control surfaces;
- page/project/entity context propagation;
- automatic device/runtime discovery and capability registration;
- per-device provider and workspace availability registry;
- direct persistent Runner Control Channel;
- explicit separation of `worker_jobs` from realtime transport;
- command ACK, event ACK, replay and reconciliation;
- desired-state / observed-state semantics;
- local durable Runner state;
- provider-native result transport;
- independent workspace and verification result;
- multi-provider/native-agent preservation;
- media analysis packages, timeline/project generation and professional video-edit workflows;
- provider-independent Agent Task Manifest;
- separation between Agent reasoning and SmartAIHub Skill execution;
- execution routing across server, Runner, GPU Runner and cloud;
- credit / revenue-share compatibility for Skill invocation;
- secure job/session-scoped access to knowledge, assets and capabilities.

---


## Canonical Cross-Spec Ownership Contract — Spec 199 ↔ Spec 200

This section is **normative**. Spec 199 and Spec 200 are companion specifications inside one SmartAIHub architecture. They MUST NOT create parallel orchestration, capability, Runner, job, approval, RAG, audit, or permission systems.

### A. Canonical Ownership

| Concern | Canonical owner | Spec 199 responsibility | Spec 200 responsibility |
|---|---|---|---|
| Universal Assistant `/chat` / Side Panel | Feature 198 UI/evolution + Feature 196 command semantics / shared platform | expose MCP capabilities to the shared orchestration path | expose External Agent tasks/results to the same orchestration path |
| System orchestration | LangGraph / shared platform | provide MCP capability nodes/adapters | provide delegated External Agent execution nodes/adapters |
| Default cognitive execution | OpenAI Agents SDK / shared platform | supply governed MCP capabilities when selected | coexist with it; external agents are delegated executors, not a replacement |
| Capability Registry / Resolver | shared platform | contribute normalized `mcp_tool`, resource/prompt/extension projections | contribute external-agent/runtime availability and SmartAIHub Skill/Asset-facing projections |
| Retrieval / RAG / Help | Retrieval Broker / shared platform | contribute MCP-derived content only with lineage/ACL | consume retrieval via scoped External Agent context projection |
| External MCP transport | **Spec 199** | owns remote/local upstream lifecycle, protocol, OAuth, schema, quarantine, MCP execution | MUST NOT reimplement upstream MCP transport |
| External Agent runtime | **Spec 200** | MAY expose capabilities used by external agents | owns Codex/Claude/Antigravity/DeepSeek/Hermes/OpenClaw adapter semantics, sessions, provider events/results; Feature 205 owns host scanning/process gateway |
| Runner Control Channel | shared execution-control infrastructure | use it for Runner MCP Runtime Manager commands/events | use it for External Agent Runtime commands/events |
| Runner capability advertisement | shared Execution Node Registry | contribute local MCP runtimes/capabilities | consume Feature 205's one redacted tool/capability snapshot, contributing agent-runtime projections without creating a second registry |
| Durable execution | `worker_jobs` / `worker_job_events` | use for long-running/local/retryable/artifact-producing MCP work | use for delegated external-agent tasks and long-running capability work |
| Task Control monitoring | Feature 200 projection over `worker_jobs` / `worker_job_events` | MUST NOT create a parallel task ledger or monitor | owns the protected hierarchical group/step read model and shared Chat/Assistant presentation |
| Approval | shared Approval Service | MCP/tool/risk/schema execution approval | provider action, shell/file, capability invocation approval |
| Audit / trace | shared platform | MCP gateway/upstream trace | agent session/turn/capability/result trace |
| Skills | SmartAIHub Skill/Capability platform | treats Skills as sibling capability type, not MCP | external agents discover/invoke Skills remotely; no local Skill install |
| Assets / Library | SmartAIHub Library/Media platform | MCP capabilities may consume/produce canonical AssetRefs | exposes job-scoped AssetRefs/analysis/materialization to agents |
| Billing / credit | shared Billing/Usage ledger | MCP/provider cost hooks where applicable | Skill invocation / agent execution usage hooks |
| Secrets | shared secret/credential architecture | upstream OAuth/JIT/connection credentials | provider credentials remain provider-native/local where possible |

### B. One Top-Level Request Flow

The canonical flow is:

```text
User / UI / API
      ↓
/chat or Universal AI Assistant Side Panel
      ↓
LangGraph — System Orchestrator
      ├── Retrieval Broker
      ├── Operational Broker
      └── Capability Resolver
              │
              ├── SmartAIHub Skill / Workflow / Internal capability
              │
              ├── External MCP capability ──→ Spec 199 External MCP Gateway
              │
              └── External Agent delegation ─→ Spec 200 External Agent Gateway
```

Spec 199 and Spec 200 MUST NOT bypass this shared orchestration contract for ordinary product flows.

For monitoring, the request continues through the same authenticated platform
boundary: the UI reads the protected Task Control projection, which resolves
only in-scope open Jobs plus explicitly referenced in-scope predecessors. The
projection does not claim provider execution success; provider-native events,
workspace verification and result verification remain the runtime gates defined
elsewhere in this specification.

### C. External Agent Tool/Capability Flow

When a Spec 200 external agent needs SmartAIHub capabilities, the agent MUST NOT connect directly to arbitrary upstream MCP servers or download SmartAIHub Skills.

Canonical flow:

```text
External Agent
   ↓ provider MCP/native-tool bridge
SmartAIHub Capability Gateway
   ↓ Capability Resolver / policy
   ├── Skill Runtime / Workflow / Internal Service
   └── Spec 199 External MCP Gateway
            ↓
       approved upstream MCP
```

This preserves:

```text
tenant ACL
user/agent scope
quarantine
schema/risk policy
billing
audit
credential isolation
capability versioning
```

### D. One Capability Discovery Model

The canonical agent-facing discovery abstraction SHALL be:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

with optional filters such as:

```text
capability_type:
  skill
  mcp_tool
  workflow
  agent
  internal
  runner
  external_agent_runtime
```

Convenience aliases such as `skill.search` MAY exist, but they MUST be projections over the same Capability Registry/Resolver and MUST NOT create a second Skill-only search index/policy path.

Spec 199's search-first/lazy MCP discovery and Spec 200's remote Skill discovery therefore share one model-facing exposure budget and one permission-filtered resolver.

### E. One Runner / Worker Connection

SmartAIHub Runner and SmartAIHub Worker App SHALL use **one shared outbound
authenticated Runner Control Channel contract**. “Shared” means the same
versioned transport, registry and message namespace; it does not mean a shared
socket, credential, configuration root or durable session. When both products
are installed, each remains a separately authenticated execution
node/connection.

The Feature 205 `SHARED_CONTAINER_RUNNER` profile is different: it is a
managed, ephemeral execution node and MUST NOT expose a direct user-device
control channel. Its Agent work is admitted, leased, fenced and observed through
the canonical `worker_jobs`/outbox path owned by Feature 195, while Feature 204
owns the Cloudflare lifecycle and Feature 205 owns the in-container execution
contract.

There MUST NOT be:

```text
one WebSocket for Spec 199
+
another incompatible WebSocket for Spec 200
```

The same connection supports namespaced commands:

```text
runner.mcp.*
runner.agent.*
runner.runtime.*
runner.asset.*
runner.skill_execution.*
runner.control.*
```

The Runner contains sibling modules:

```text
SmartAIHub Runner
├── Control Channel Client
├── Execution Node Capability Reporter
├── Local Durable State / Reconciliation
├── MCP Runtime Manager              ← Spec 199
├── Agent Runtime Core               ← Spec 200
├── Asset Cache / Materializer       ← shared
├── Skill Execution Bridge           ← shared
└── Process / Resource Supervisor    ← shared
```

### F. One Execution Node Registry

A Runner publishes a single capability snapshot/revision.

Example:

```json
{
  "runner_id": "runner_001",
  "revision": 42,
  "agent_runtimes": {
    "codex": {"status": "ready"},
    "claude_code": {"status": "ready"}
  },
  "mcp_runtimes": {
    "blender": {"status": "ready"},
    "local_ffmpeg_mcp": {"status": "ready"}
  },
  "execution_capabilities": {
    "ffmpeg": true,
    "remotion": true,
    "gpu": true
  },
  "project_bindings": ["project_123"]
}
```

Spec 199 and Spec 200 MUST extend this snapshot rather than create separate device registries.

### G. `worker_jobs` Is State, Not Transport

Both specs SHALL use the same rule:

```text
worker_jobs / worker_job_events
= durable global execution truth

Runner Control Channel
= realtime command/event transport
```

Runner MUST NOT poll `worker_jobs` as the primary interactive command mechanism.

Long-running execution can be durable while realtime control remains direct.

### H. Shared Desired / Observed State and Reconciliation

Both specs use the same execution semantics:

```text
desired_state
observed_state
lease_owner
lease_epoch / fencing token
last_acknowledged_event_sequence
execution_intent_id
```

Disconnect does not imply failure.

Backend restart, Runner restart, sleep/network loss, duplicate delivery and late results use one reconciliation model.

### I. Shared Context / Retrieval Contract

Spec 200 SHALL NOT build a second RAG system.

Its `Context Broker` is an **External Agent Context Adapter / façade over the existing Retrieval Broker**.

Canonical flow:

```text
External Agent Task
   ↓
External Agent Context Adapter (Spec 200)
   ↓
Retrieval Broker (shared / Feature 196 orchestration + Feature 198 Chat architecture)
   ├── Help RAG
   ├── Project RAG
   ├── Specs
   ├── Library
   └── MCP-derived indexed content with Spec 199 lineage
```

MCP-derived RAG content from Spec 199 MUST preserve source server/revision/resource lineage, ACL and revocation semantics before Spec 200 can retrieve it for an external agent.

### J. Shared Asset Contract

Asset identities are canonical SmartAIHub references:

```text
asset://...
artifact://...
library://...
```

Spec 200 owns agent-facing media/task usage but MUST reuse SmartAIHub Library/Media authorization and storage.

Spec 199 MCP tools that accept/return files SHOULD map them to the same canonical AssetRef/ArtifactRef model when possible.

### K. Shared Approval Contract

One approval service and UI surface shall cover:

```text
approval_domain = mcp_capability
approval_domain = provider_action
approval_domain = skill_side_effect
approval_domain = workspace_change
approval_domain = external_effect
```

Spec-specific metadata is preserved, but approval identity, expiry, actor, audit and replay protection are shared.

### L. Shared Trace / Correlation IDs

The following IDs SHALL propagate where applicable:

```text
trace_id
conversation_id
orchestration_run_id
agent_task_id
worker_job_id
capability_call_id
execution_intent_id
runner_id
provider_session_id
mcp_request_id / upstream_task_id
artifact_id
```

A single user request must be traceable across both specs.

### M. OpenAI Agents SDK vs External Agents

OpenAI Agents SDK remains the SmartAIHub default cognitive executor under the Feature 196 orchestration architecture and Feature 198 Chat/Assistant surfaces.

Spec 200 external agents are:

```text
delegated cognitive/execution runtimes
```

selected when:

- the user explicitly chooses Codex, Claude, Antigravity, DeepSeek, Hermes or
  OpenClaw;
- policy chooses an external agent;
- the task needs a local/provider-native harness capability.

Spec 200 MUST NOT silently replace the platform's default cognitive executor globally.

### N. Cross-Spec Invariants

The following are prohibited:

1. A second Capability Registry for Spec 200.
2. A second Retrieval/RAG implementation for external agents.
3. A second Runner WebSocket/control plane.
4. A second durable job system.
5. A separate approval database/service.
6. External agents connecting directly to upstream MCP and bypassing Spec 199.
7. Downloading/installing SmartAIHub Skills into external agent runtimes.
8. Separate Skill discovery that bypasses Capability Resolver ACL/health/risk filtering.
9. Duplicate Runner/device registration models.
10. Different artifact/asset identity formats for Spec 199 and Spec 200.
11. Independent retry owners for the same execution intent.
12. UI flows where `/chat` and Side Panel bypass LangGraph and invoke Runner directly.

### O. Cross-Spec Compatibility Version

Both specs SHALL declare a shared internal contract version:

```text
smartaihub_execution_contract = "SAH-EXEC-1"
smartaihub_capability_contract = "SAH-CAP-1"
smartaihub_runner_contract = "SAH-RUNNER-1"
smartaihub_context_contract = "SAH-CONTEXT-1"
smartaihub_asset_contract = "SAH-ASSET-1"
```

Breaking changes require coordinated versioning and compatibility tests across Spec 199 and Spec 200.

---

# 1. Executive Summary

Spec 200 defines a production-grade **Universal External Agent Control Plane** for SmartAIHub.

The architecture allows SmartAIHub to use external/local/cloud agent harnesses such as:

- Codex;
- Claude Code;
- Google Antigravity;
- DeepSeek Harness;
- future ZCode/Gemini CLI/OpenCode/Aider-compatible runtimes;
- future non-coding research/browser/desktop/media agents.

The external agent is not treated as an isolated chatbot or one-shot CLI wrapper.

SmartAIHub SHALL provide the agent with controlled access to:

```text
SmartAIHub knowledge
→ RAG / Help / Specs / Library / project context

SmartAIHub assets
→ video / image / audio / documents / project files

SmartAIHub skills
→ remotely discovered and invoked capabilities

SmartAIHub execution nodes
→ Runner / Worker App / Server / GPU Runner / Cloud

SmartAIHub job state
→ durable tracking / audit / recovery / approvals
```

This means the same Claude/Codex/Antigravity agent can act in different roles according to the task and capabilities supplied by SmartAIHub.

Examples:

```text
Claude + coding tools
→ Coding Agent

Claude + video-edit skills + media assets
→ AI Video Editor / Director

Codex + RAG + research skills
→ Research Agent

Antigravity + browser/automation skills
→ Automation Agent
```

The system MUST NOT require SmartAIHub Skill packages to be downloaded or installed into those external agents.

Instead:

> **SmartAIHub Skills remain centrally hosted, versioned, governed, billed and executed by SmartAIHub. External agents discover and invoke Skills remotely through SmartAIHub.**

The architecture SHALL explicitly separate six planes:

```text
1. STATE PLANE
   PostgreSQL / worker_jobs / worker_job_events / sessions / approvals

2. CONTROL PLANE
   persistent bidirectional Runner Control Channel
   SmartAIHub Backend ⇄ Runner / Worker App

3. DATA PLANE
   Git / worktrees / R2 / Library / large logs / rendered assets / artifacts

4. CONTEXT / KNOWLEDGE PLANE
   RAG / Help / Specs / Library / project knowledge / page context

5. TOOL PLANE
   provider-facing protocols such as MCP / native functions / RPC

6. CAPABILITY / SKILL PLANE
   Capability Registry / Skill execution / billing / policy
```

`worker_jobs` SHALL remain the durable global source of truth for jobs but SHALL NOT be used as the realtime transport to control a Runner.

Realtime commands such as:

```text
execute
cancel
approve
reject
resume
continue session
send next turn
```

SHALL travel through a persistent authenticated Runner Control Channel.

Runner/Worker SHALL automatically discover which external agent runtimes are actually installed on each user's device and publish a capability snapshot to SmartAIHub.

Temporary SmartAIHub ⇄ Runner disconnection MUST NOT automatically terminate active provider processes. Runner SHALL preserve local durable state, buffer events, reconnect, replay and reconcile.

External agents SHALL consume SmartAIHub knowledge and capabilities through job-scoped authorization. They SHALL NOT receive unrestricted access to all tenant data, all assets, or all Skills.

For media workflows, external agents SHALL reason over selected assets, metadata, transcripts, keyframes, analysis packages, RAG context and Skill capabilities. They SHALL normally create/edit a SmartAIHub Video Edit project/timeline and call SmartAIHub media Skills rather than manipulating large raw video files directly in the model context.

The core product outcome is:

> **SmartAIHub becomes the universal command, knowledge, asset, capability and execution layer above external AI agents, while each provider retains its native strengths.**

---

# 2. Business and Product Rationale

## 2.1 Problem

Users increasingly use multiple coding-agent products:

- Codex;
- Claude Code;
- Antigravity;
- DeepSeek Harness;
- future agent harnesses.

Each one has a different:

- installation model;
- authentication method;
- session model;
- transport;
- event format;
- approval flow;
- workspace behavior;
- agent/subagent mechanism;
- MCP integration;
- CLI/API/SDK interface.

Without a common control layer the user must repeatedly:

1. open a terminal or IDE;
2. navigate to the correct repository;
3. open the desired coding agent;
4. paste the task;
5. wait for execution;
6. manually inspect status;
7. answer approvals;
8. inspect `git diff`;
9. run tests;
10. copy results back into SmartAIHub;
11. repeat with another coding agent if a second review is required.

This defeats the purpose of SmartAIHub acting as an Agent Hub.

## 2.2 Product Goal

The intended UX is:

```text
SmartAIHub Web
      ↓
Select Project
      ↓
Enter Task
      ↓
Select Agent or Auto
      ↓
Select Execution Target or Auto
      ↓
Run
      ↓
SmartAIHub dispatches to available Runner / Worker / Cloud
      ↓
Agent works using its native harness
      ↓
Live progress appears in SmartAIHub
      ↓
Approval is requested only when required
      ↓
Agent finishes
      ↓
SmartAIHub independently verifies workspace + tests/build
      ↓
User reviews result / diff / artifacts
      ↓
Continue / Fix / Re-run / Merge / Reject
```

The user SHOULD NOT need to understand:

- JSON-RPC;
- stdio transports;
- stream-json;
- NDJSON;
- ACP;
- provider SDK details;
- provider process lifecycle;
- PATH configuration;
- Python virtual environments;
- Node dependency installation;
- MCP configuration syntax.

Those concerns SHALL be handled by SmartAIHub Runner / Worker and the Agent Runtime Core.


## 2.3 Universal Task Families

Spec 200 SHALL use a provider-independent Agent Task model.

Initial task families:

```text
coding
media_edit
research
browser
desktop
automation
document
general_agent
```

Future task families can be added without changing the Runner control architecture.

The external provider does not define the task family.

Example:

```text
provider = claude_code
task_family = coding
```

and:

```text
provider = claude_code
task_family = media_edit
```

are both valid if the required SmartAIHub tools/skills/assets are available.

## 2.4 Agent Role Is Composed From Context + Assets + Skills

SmartAIHub SHOULD think of external agents as reasoning engines.

Role composition:

```text
Agent Model/Harness
        +
Context
        +
Selected Assets
        +
Available Remote Skills
        +
Execution Policy
        =
Task-specific Agent Role
```

This prevents architecture from hard-coding one provider to one use case.

---

# 3. Scope

## 3.1 In Scope

Spec 200 includes:

- Agent Runtime Core;
- Provider Adapter interface;
- Runtime Discovery;
- Runtime Manager;
- provider health checks;
- capability discovery;
- local agent execution;
- optional cloud execution;
- session lifecycle;
- event normalization;
- native event retention;
- workspace isolation;
- Git worktree support;
- approval engine;
- command and network policy;
- job dispatch through `worker_jobs`;
- job progress through `worker_job_events`;
- Runner integration;
- Windows Worker App integration;
- SmartAIHub Web UI;
- live job monitoring;
- session continuation;
- result verification;
- test/build/lint execution;
- artifacts;
- logs;
- runtime installation/update/rollback for SmartAIHub-managed runtimes;
- support for existing user-managed installations;
- MCP Tool Plane integration;
- audit logging;
- security controls;
- observability;
- provider compatibility matrix;
- rollout and migration strategy;
- Runner Device Registration;
- Runtime Discovery and automatic provider registration;
- Runner Capability Registry;
- project/workspace availability registration;
- persistent authenticated Runner Control Channel;
- direct server-to-Runner command delivery;
- command ACK and event ACK;
- Runner local durable execution state;
- event replay after reconnect;
- desired-state / observed-state reconciliation;
- disconnect/reconnect handling;
- backend restart recovery;
- Runner restart reconciliation;
- provider-native result/event capture;
- independent workspace/result verification;
- Universal AI Assistant `/chat` integration;
- Universal AI Assistant Launcher / Side Panel integration;
- current-page/current-project context propagation;
- SmartAIHub Context / Knowledge Plane;
- scoped RAG retrieval for coding agents;
- Help/Specs/Library/project knowledge access;
- job-scoped MCP/RAG authorization;
- RAG provenance and context snapshot metadata.
- Agent Task Manifest;
- task-family routing;
- Asset Gateway;
- asset reference model;
- media analysis package;
- SmartAIHub Video Edit project/timeline integration;
- remote Skill Registry;
- semantic Skill discovery;
- Skill describe/invoke/status/result meta-tools;
- Skill execution routing;
- Skill credit/billing/revenue accounting integration;
- provider-independent skill permissions;
- asset-aware job authorization;

## 3.2 Initial Providers

Phase 1–3 SHALL support:

1. Codex
2. Claude Code
3. Google Antigravity
4. DeepSeek Harness

## 3.3 Future Providers

The architecture MUST permit adding without redesigning the core:

- ZCode;
- Gemini CLI;
- OpenCode;
- Aider;
- Goose;
- Cline-compatible runtimes;
- other ACP-compatible agents;
- future MCP-exposed agents;
- provider-specific agent app servers.

## 3.4 Out of Scope

Spec 200 SHALL NOT:

- build a new code editor;
- replace VS Code, Cursor, ZCode, Codex UI, or Claude Code UI;
- build a new foundational coding model;
- build a second queue system;
- rely on GUI automation, screen scraping, mouse automation, or keyboard simulation to control coding agents;
- make MCP the mandatory control protocol for every provider;
- require all agent capabilities to be flattened into the lowest common denominator;
- automatically merge code to protected branches without explicit policy;
- automatically bypass provider security permissions by default;
- require external agents to download/install SmartAIHub Skills locally;
- install every provider runtime inside the base Runner installer.

---

# 4. Architecture Principles

## P1 — One Durable Job State Plane, Separate Realtime Transport

All coding-agent work SHALL use the existing durable job system:

```text
worker_jobs
worker_job_events
lease
heartbeat
idempotency
retry
watchdog
```

Coding agents are a new executor/job family, not a separate scheduler.

However:

> `worker_jobs` is durable state, not the realtime command transport.

The backend SHALL dispatch an already-created/leased job to Runner/Worker through the Runner Control Channel.

Normal execution path:

```text
SmartAIHub Web / Chat / Side Panel
        ↓
SmartAIHub Backend
        ↓
create/update worker_job
        ↓
select eligible execution node
        ↓
lease/assign durable job
        ↓
Runner Control Gateway
        ↓ persistent connection
SmartAIHub Runner / Worker
        ↓
Provider Adapter
```

The Runner SHALL NOT be required to continuously poll PostgreSQL or `worker_jobs` for interactive coding-agent work.

## P2 — Native Protocol First

Use the best supported programmatic interface for each provider.

Do not force all providers through MCP.

Initial preference:

```text
Codex
→ Codex App Server
→ bidirectional JSON-RPC over stdio

Claude Code local
→ Claude Code CLI
→ stream-json / structured output
→ native session resume
→ optional Agent SDK adapter later

Antigravity local
→ Antigravity CLI
→ stream-json / NDJSON
→ persistent stdin stream where appropriate
→ conversation resume

Antigravity cloud
→ Gemini / Antigravity remote agent API

DeepSeek Harness
→ SDK JSON-RPC
→ ACP optional secondary transport
→ headless mode optional simple transport
```

## P3 — MCP Is Primarily the Tool Plane

SmartAIHub SHALL distinguish:

```text
CONTROL PLANE
SmartAIHub → Coding Agent

TOOL PLANE
Coding Agent → SmartAIHub MCP tools
```

The existing SmartAIHub MCP endpoint can be used by supported coding agents to access:

- Library;
- SmartAIHub project resources;
- job status;
- media;
- approved platform tools;
- future project-specific tools.

MCP MUST NOT be used as the only control protocol where a provider-native protocol exposes richer lifecycle data.

## P4 — Runner and Worker Share the Same Runtime Core

SmartAIHub Runner and SmartAIHub Worker App MUST NOT implement provider integrations independently.

Both SHALL embed/use the same reusable component:

```text
smartaihub-agent-runtime
```

Difference:

- **Runner:** headless execution node;
- **Worker App:** execution node + local UI/UX;
- provider adapters and runtime management: shared.

## P5 — Web Is the Main Control UI

Users SHOULD be able to perform normal coding-agent workflows from SmartAIHub Web.

Worker App local UI remains useful for:

- device diagnostics;
- runtime management;
- local approvals when configured;
- logs;
- troubleshooting;
- local workspace access.

It SHALL NOT become a second independent project-management UI.

## P6 — Preserve Native Capability

Normalized events SHALL coexist with raw/native provider events.

Example:

```json
{
  "type": "agent.tool.completed",
  "provider": "antigravity",
  "normalized": {
    "tool_name": "run_command",
    "status": "completed"
  },
  "native": {
    "event": "step_update",
    "step_type": "tool_result"
  }
}
```

Provider-specific information MUST NOT be discarded merely because another provider lacks the same feature.

## P7 — Direct Runner Control Channel

Runner and Worker SHALL maintain an outbound authenticated persistent connection to SmartAIHub.

Primary transport SHOULD be WebSocket or an equivalent bidirectional persistent transport.

The connection SHALL support:

```text
Backend → Runner
execute
cancel
interrupt
approve
reject
resume
session.turn
runtime.health_check
runtime.install request

Runner → Backend
register
capabilities.update
ack
heartbeat
progress/events
approval.required
result
runtime.status
reconcile
```

SmartAIHub SHALL NOT require inbound ports on the user's machine.

## P8 — Disconnect Is Expected

Connection loss SHALL be treated as a normal distributed-systems condition.

A WebSocket/control-channel disconnect MUST NOT by itself:

- terminate Codex, Claude, Antigravity, DeepSeek, Hermes or OpenClaw;
- fail a running job;
- re-dispatch the same write-capable coding job to another machine;
- lose events.

Runner SHALL maintain local durable state and replay unacknowledged events after reconnect.

## P9 — Each Runner Is a Capability-Advertising Execution Node

Every Runner/Worker can have a different set of installed tools.

SmartAIHub SHALL never assume that all devices have:

```text
Codex
Claude Code
Antigravity
DeepSeek Harness
```

Runner SHALL discover and register what is actually available.

Selection SHALL be based on:

```text
provider capability
runtime health
authentication state
project/workspace availability
device online state
execution policy
current capacity
```

## P10 — SmartAIHub Knowledge Must Be Available to the Agent

Coding agents SHALL be able to use the knowledge already held by SmartAIHub, subject to permissions.

Relevant sources include:

```text
SmartAIHub RAG / Vector knowledge
Help content
project specs
architecture documents
Library documents
current project context
current page/entity context
selected conversation context
selected prior job results
approved project metadata
```

The system SHALL NOT copy the entire RAG corpus into every prompt.

Instead it SHALL provide:

1. a bounded initial Context Package; and
2. scoped retrieval tools for additional context during execution.

## P11 — Universal Assistant Is a Control Surface, Not a Second Agent Runtime

`/chat` and the Universal AI Assistant Launcher / Side Panel SHALL create and control Spec 200 agent jobs through backend APIs.

They SHALL NOT directly spawn Runner processes or know provider-specific protocols.

All ordinary `/chat` and Side Panel requests SHALL enter the same **LangGraph System Orchestrator** defined by the Universal Assistant architecture. Spec 200's Agent Task Service is an execution/delegation service invoked by LangGraph; it is NOT a competing top-level orchestrator.

The same conversation can contain:

```text
normal LLM turns
Help/RAG answers
MCP/tool calls
coding-agent job cards
approvals
coding-agent results
continuation turns
```


## P12 — Skills Stay in SmartAIHub

SmartAIHub Skill packages SHALL remain centrally hosted and governed.

External agents SHALL NOT be required to:

```text
download Skill ZIP
install Skill locally
maintain a local Skill version
execute proprietary Skill code outside SmartAIHub governance
```

External agents SHALL use remote capability discovery and invocation.

## P13 — Skill Discovery Uses Meta-Tools

SmartAIHub MAY contain thousands of Skills.

Do not expose every Skill as a separate permanent MCP tool.

Expose a small stable capability surface:

```text
skill.search
skill.describe
skill.invoke
skill.status
skill.result
```

The Skill Gateway resolves the actual Skill behind those meta-tools.

## P14 — Assets Are References, Not Prompt Blobs

Large media/document assets SHALL normally be represented by secure SmartAIHub asset references.

Example:

```text
asset://video_001
asset://image_023
```

The model receives metadata/analysis/preview context appropriate to the provider and task.

The Asset Gateway resolves actual storage/execution access.

## P15 — Agent Reasoning and Skill Execution Are Separate

Agent responsibilities:

```text
reason
plan
decide
choose tools
evaluate results
iterate
```

SmartAIHub Skill responsibilities:

```text
bounded capability
validated input schema
execution
output contract
billing
permissions
versioning
audit
```

## P16 — Hard Constraints Are Machine-Enforced

Constraints such as:

```text
max duration
aspect ratio
resolution
required assets
required dialogue
subtitle language
output format
allowed actions
```

SHALL be represented structurally and validated by SmartAIHub.

Do not rely only on the external model remembering them.

---

# 5. High-Level System Architecture

## 5.0 Canonical Orchestration Position

```text
SmartAIHub Web / API
      ↓
/chat + Universal AI Assistant Side Panel
      ↓
LangGraph — System Orchestrator                     ← shared / Spec 196
      ├── Retrieval Broker                         ← shared
      ├── Operational Broker                       ← shared
      └── Capability Resolver / Gateway            ← shared
              ├── Skills / Workflows / Internal
              ├── External MCP capability
              │       ↓
              │   Spec 199 External MCP Gateway
              └── External Agent Runtime
                      ↓
                  Spec 200 External Agent Gateway
                      ↓
                  Runner / Worker / Cloud
```

If a Spec 200 external agent later invokes a SmartAIHub capability:

```text
External Agent
      ↓
SmartAIHub Capability Gateway
      ├── Skill / Workflow / Internal capability
      └── MCP capability → Spec 199 External MCP Gateway
```


```text
                     SmartAIHub Web
      ┌──────────────────┬───────────────────────┐
      │                  │                       │
    /chat        Universal AI Assistant      Project/Job/Media UI
                 Launcher / Side Panel
      │                  │                       │
      └──────────────────┴──────────┬────────────┘
                                    ▼
                         Universal Assistant Layer
                                    │
                   intent + project/page/asset context
                                    │
                              Agent Task API
                                    │
                                    ▼
                           SmartAIHub Backend
                                    │
     ┌───────────────┬──────────────┼──────────────┬──────────────┐
     ▼               ▼              ▼              ▼              ▼
 STATE PLANE    CONTROL PLANE  CONTEXT PLANE   ASSET GATEWAY  SKILL PLANE
 PostgreSQL     Runner Gateway Context Broker  Library/R2     Skill Registry
 worker_jobs    WebSocket       RAG/Help/Specs  Asset refs     Skill Gateway
 sessions       direct control  Library/context metadata       Billing/Policy
 approvals          │              │              │              │
     │              │              │              │              │
     │         ┌────┴─────┐        │              │              │
     │         ▼          ▼        │              │              │
     │      Runner    Worker App   │              │              │
     │         │          │        │              │              │
     │         └────┬─────┘        │              │              │
     │              ▼              │              │              │
     │      Agent Runtime Core ◄────┴──────────────┴──────────────┘
     │              │
     │    ┌─────────┼───────────┬──────────────┐
     │    ▼         ▼           ▼              ▼
     │  Codex    Claude     Antigravity    DeepSeek Harness
     │  Hermes Agents      OpenClaw-compatible
     │
     └────────────────────────────────────────────────────────────

TOOL PLANE
MCP / native functions / provider RPC / Agent Runtime adapters

DATA PLANE
Git / worktrees / R2 / Library / rendered video / logs / artifacts
```

## 5.1 Architectural Planes

### State Plane

Durable global truth:

```text
worker_jobs
worker_job_events
agent sessions
approvals
task manifests
asset references
skill invocation records
```

### Control Plane

Realtime SmartAIHub ⇄ Runner/Worker commands and events.

### Context / Knowledge Plane

Trusted task knowledge:

```text
RAG
Help
Specs
Library documents
project context
current page/entity
prior approved results
```

### Asset Plane

Secure references and metadata for:

```text
video
image
audio
documents
project files
generated assets
```

### Capability / Skill Plane

Centrally managed remote capabilities available to external agents.

### Tool Plane

Protocol layer through which providers access SmartAIHub functions.

### Data Plane

Authoritative large data and execution artifacts.

---

# 6. Core Components

## 6.1 Agent Runtime Core

Create a shared runtime package/service:

```text
smartaihub-agent-runtime
```

Responsibilities:

- discover provider runtimes;
- select executable/runtime;
- resolve runtime version;
- validate compatibility;
- start/stop provider process;
- maintain provider sessions;
- stream provider events;
- normalize events;
- preserve native event payload;
- map provider approval requests;
- provide cancellation;
- monitor subprocess liveness;
- manage stdout/stderr safely;
- collect provider result;
- report usage;
- report runtime diagnostics;
- integrate with workspace manager;
- integrate with approval engine;
- integrate with result verifier;
- integrate with local durable event buffer;
- expose reconciliation state;
- consume job-scoped context packages;
- connect provider-native MCP/tool configurations where supported;
- preserve RAG/document provenance in execution metadata;
- independently inspect actual workspace changes before reporting final success.

Suggested interface:

```ts
interface CodingAgentProvider {
  id(): ProviderId;

  discoverRuntime(ctx): Promise<RuntimeDiscoveryResult[]>;
  healthCheck(runtime, ctx): Promise<HealthCheckResult>;
  capabilities(runtime, ctx): Promise<ProviderCapabilities>;

  listAgents?(ctx): Promise<AgentDescriptor[]>;
  listModels?(ctx): Promise<ModelDescriptor[]>;

  startSession(request): Promise<AgentSessionHandle>;
  resumeSession(request): Promise<AgentSessionHandle>;
  forkSession?(request): Promise<AgentSessionHandle>;

  sendTurn(session, request): Promise<TurnHandle>;

  interrupt?(session, turn): Promise<void>;
  cancel(session): Promise<void>;

  approve?(request): Promise<void>;
  reject?(request): Promise<void>;

  subscribe(session, handler): UnsubscribeFn;

  getSessionState(session): Promise<ProviderSessionState>;
  getArtifacts?(session): Promise<ProviderArtifact[]>;

  closeSession(session): Promise<void>;
}
```

Providers MAY implement additional extension interfaces.

---


## 6A. Universal Agent Task Service

The Agent Task Service creates provider-independent task manifests.

It SHALL resolve:

```text
task family
user intent
project
current page/entity
selected assets
provider preference
execution target
context scope
skill scope
hard constraints
verification policy
```

## 6B. External Agent Context Adapter

This component is a façade over the existing SmartAIHub **Retrieval Broker** from the Universal Assistant architecture.

It MUST NOT create a second RAG/index/ACL system.

It supplies bounded initial Context Packages and live scoped retrieval to external agents while delegating authoritative search, Help/RAG/Library/spec access, ACL filtering, lineage and revocation to the shared Retrieval Broker.

## 6C. Asset Gateway

The Asset Gateway SHALL:

- resolve SmartAIHub asset IDs;
- enforce tenant/project/user permissions;
- provide metadata;
- provide bounded previews/keyframes/transcripts;
- issue short-lived access to execution nodes;
- avoid exposing permanent R2 credentials;
- support asset caching on Runner;
- track provenance of generated outputs.

Logical methods:

```text
asset.list_selected
asset.describe
asset.get_preview
asset.get_keyframes
asset.get_transcript
asset.materialize_for_job
asset.publish_result
```

## 6D. SmartAIHub Capability Gateway — Skill Execution Branch

SmartAIHub-hosted Skills remain centrally executed, but **discovery and invocation are exposed through the shared Capability Gateway/Resolver**, not through a competing Spec-200-only registry.

The Skill execution branch SHALL be the governed path used when the selected canonical capability has `capability_type = skill`.

Convenience `skill.*` meta-tools MAY exist as aliases/projections, but canonical identity, search filtering, authorization and tracing remain in the shared Capability Registry/Resolver.

Responsibilities:

```text
Skill discovery
Skill metadata/schema
permission checks
input validation
version resolution
credit deduction
revenue accounting
execution routing
job creation for long-running Skills
status/result
audit
```

## 6E. Execution Planner

The Execution Planner decides where a Skill or task step runs:

```text
SmartAIHub server
Runner
Windows Worker App
GPU Runner
Cloud provider
other approved executor
```

The external agent SHOULD NOT need to know execution topology.


# 7. Capability Discovery

Every adapter SHALL return a capability object.

Example:

```json
{
  "provider": "codex",
  "runtime_version": "x.y.z",
  "capabilities": {
    "sessions": true,
    "resume": true,
    "fork": true,
    "streaming": true,
    "approvals": true,
    "file_edit": true,
    "shell": true,
    "browser": false,
    "mcp": true,
    "skills": true,
    "hooks": false,
    "subagents": true,
    "parallel_agents": true,
    "diff_stream": true,
    "structured_output": true,
    "usage_reporting": true,
    "local_execution": true,
    "remote_execution": false
  }
}
```

The UI SHALL use capability discovery instead of hard-coding provider assumptions.

If a feature is unsupported, the UI MUST hide or disable it with an explicit reason.

---

# 8. Provider Integration Specifications

## 8.1 Codex Adapter

### 8.1.1 Primary Local Transport

Use **Codex App Server** as the preferred local integration.

Rationale:

- long-lived process;
- full Codex harness;
- threads;
- turns;
- UI-ready events;
- bidirectional JSON-RPC;
- server-initiated approval requests;
- detailed progress;
- better fit than one-shot shell execution.

Flow:

```text
Runner
  ↓ spawn
codex app-server
  ↓ stdio
bidirectional JSON-RPC
  ↓
Codex thread(s)
```

### 8.1.2 Codex Session Mapping

```text
Codex App Server process
→ runtime process

Codex thread
→ SmartAIHub agent_session

Codex turn
→ SmartAIHub agent_turn

Codex notifications
→ worker_job_events

Codex approval request
→ approval.required
```

### 8.1.3 Fallback

If App Server is unavailable but supported CLI execution exists:

```text
Codex Exec Adapter
```

MAY be used for:

- CI;
- one-shot tasks;
- compatibility fallback.

The system MUST mark reduced capability mode.

Example:

```text
Provider Mode:
Codex Exec Compatibility Mode

Unavailable:
- interactive approvals
- rich turn lifecycle
- full diff streaming
```

### 8.1.4 Runtime Detection

Runner SHALL detect:

- executable path;
- version;
- app-server capability;
- authentication status when safely detectable;
- health-check success.

It MUST NOT automatically replace a user-managed Codex installation.

---

## 8.2 Claude Code Adapter

### 8.2.1 Primary Local Transport

Initial implementation SHALL use the existing Claude Code CLI with structured streaming:

```text
claude -p
--output-format stream-json
```

and supported session continuation/resume mechanisms.

This minimizes onboarding because users who already use Claude Code can reuse their installed runtime and existing authentication.

### 8.2.2 Why CLI-First

Advantages:

- low installation friction;
- user can reuse existing Claude Code login;
- structured output;
- real-time events;
- session IDs;
- resume;
- allowed/disallowed tool controls;
- permission modes;
- MCP configuration.

### 8.2.3 Optional Advanced Adapter

A later adapter MAY use Claude Agent SDK where deeper in-process control is beneficial.

The SDK adapter MUST NOT be required for MVP.

### 8.2.4 Permission Integration

Claude permission requests MUST map to the SmartAIHub Approval Engine wherever possible.

If the provider supports an external permission-prompt tool or equivalent mechanism, SmartAIHub SHOULD use it rather than disabling permissions.

Never default to:

```text
--dangerously-skip-permissions
```

for normal user jobs.

### 8.2.5 Session Mapping

```text
Claude session_id
→ provider_session_id

Claude stream events
→ normalized worker_job_events

Claude final result
→ agent.result

Claude stderr
→ provider diagnostics / logs
```

---

## 8.3 Antigravity Local Adapter

### 8.3.1 Primary Local Transport

Use Antigravity CLI headless streaming mode.

Preferred:

```text
--output-format stream-json
```

Where continuous multi-turn operation is useful:

```text
--input-format stream-json
--output-format stream-json
```

Runner SHALL read NDJSON line-by-line.

### 8.3.2 Continuous Process Mode

If supported by the detected version, one persistent Antigravity process MAY handle multiple turns in a single conversation.

Benefits:

- lower startup overhead;
- warm context;
- native conversation continuity.

The runtime manager MUST maintain:

- process PID;
- stdin writer;
- stdout parser;
- stderr parser;
- conversation ID;
- last result sequence;
- liveness state.

### 8.3.3 Conversation Mapping

```text
Antigravity conversation_id
→ provider_session_id

init
→ agent.session.started

step_update
→ normalized progress/tool/message events

result
→ agent.turn.completed / agent.turn.failed
```

### 8.3.4 Agent Discovery

If Antigravity exposes custom agents:

```text
agy agents
```

or an equivalent supported discovery mechanism, SmartAIHub SHOULD list provider-native agents.

SmartAIHub SHALL NOT recreate provider-native custom agents unless necessary.

---

## 8.4 Antigravity Cloud Adapter

Remote/cloud execution SHALL be a separate execution target.

```text
provider = antigravity
execution_target = cloud
```

Use the supported remote agent API rather than routing through the local Runner.

Cloud jobs MAY use:

- remote sandbox;
- persistent environment;
- background execution;
- remote session state;
- provider-side cancellation.

The web UI MUST clearly show:

```text
Execution:
Cloud
```

versus:

```text
Execution:
My Computer — DESKTOP-ABC
```

Local and cloud execution SHALL share the same normalized result format.

---

## 8.5 DeepSeek Harness Adapter

### 8.5.1 Primary Transport

Use DeepSeek Harness **SDK JSON-RPC** as the preferred integration.

```text
Runner
  ↓
DeepSeek Harness SDK profile
  ↓
stdio JSON-RPC
```

### 8.5.2 Secondary Transports

Support later:

```text
ACP
headless
```

Usage:

- SDK JSON-RPC: maximum fidelity;
- ACP: portable cross-agent client integration;
- headless: one-shot / CI fallback.

### 8.5.3 Preview Stability

DeepSeek Harness is currently treated as a faster-moving integration.

Adapter MUST:

- pin tested versions;
- expose compatibility status;
- support rollback;
- preserve native events;
- isolate runtime dependencies;
- not require system-wide Python package modification.

---

# 9. Runtime Discovery and Runtime Manager

## 9.1 Two Runtime Types

Every provider runtime SHALL be classified as:

```text
USER_MANAGED
SMARTAIHUB_MANAGED
```

### USER_MANAGED

Examples:

```text
C:\...\codex.exe
C:\...\claude.exe
C:\...\agy.exe
/usr/local/bin/claude
```

Rules:

- detect;
- validate;
- use if compatible;
- never automatically replace;
- never uninstall;
- never silently upgrade.

### SMARTAIHUB_MANAGED

Stored under an isolated application runtime directory.

Example Windows:

```text
%LOCALAPPDATA%\SmartAIHub\runtimes\
  codex\
  claude\
  antigravity\
  deepseek-harness\
```

Example Linux/macOS:

```text
~/.local/share/smartaihub/runtimes/
```

Managed runtime supports:

- install;
- version pinning;
- update;
- rollback;
- delete;
- health check;
- integrity verification.

## 9.2 Runtime Resolution Policy

Default:

```text
AUTO
```

Algorithm:

1. find compatible user-managed runtime;
2. health check;
3. if valid, prefer it;
4. otherwise find compatible SmartAIHub-managed runtime;
5. otherwise offer managed installation;
6. custom path can override.

Per provider setting:

```text
Runtime:
● Auto
○ Existing installation
○ SmartAIHub managed
○ Custom path
```

## 9.3 On-Demand Installation

Do NOT bundle all coding-agent runtimes into the base Runner installer.

Instead:

```text
Runtime On Demand
```

Example UX:

```text
DeepSeek Harness
Not installed

Required runtime: xxx
Estimated download: xxx MB

[Install]
```

Runner handles all internal setup.

## 9.4 Runtime Compatibility Registry

Backend SHALL maintain a compatibility catalog:

```json
{
  "provider": "codex",
  "adapter_version": "1.2.0",
  "tested": [
    {
      "runtime_range": ">=x <y",
      "transport": "app-server",
      "status": "supported"
    }
  ]
}
```

Statuses:

```text
supported
experimental
deprecated
blocked
unknown
```

Unknown versions SHOULD NOT automatically be blocked if a capability handshake proves compatibility, but UI MUST warn when untested.

---

# 10. Device Registration, Runtime Discovery and Shared Execution Node Registry

## 10.1 Device Registration

This registry is shared with Spec 199.

A device registers once. The same capability revision can advertise:

```text
external agent runtimes
local MCP runtimes
media/GPU/runtime capabilities
project/workspace bindings
resource capacity
```

Spec 200 MUST NOT create a second Runner/device registry separate from Spec 199 local MCP runtime management.


Runner/Worker SHALL register itself as an execution node when connecting.

Required identity metadata:

```text
runner_id
device_id
tenant/user ownership
node_type
platform
architecture
runner_version
protocol_version
```

`node_type` examples:

```text
runner
worker_app
cloud_executor
```

Runner connection is outbound; SmartAIHub does not require an inbound port on the device.

## 10.2 Automatic Runtime Discovery

Runner SHALL automatically inspect the local device for supported runtimes.

Provider-specific discovery adapters SHALL be responsible for finding their own tools.

Discovery priority SHOULD include:

```text
1. explicit custom path
2. SmartAIHub-managed runtime
3. PATH
4. provider-known install paths
5. OS/package-manager known locations
```

Finding an executable does not mean it is usable.

Each detected runtime MUST be probed for:

```text
runtime version
supported transport
protocol compatibility
authentication readiness where safely detectable
provider-specific capabilities
basic health
```

## 10.3 Runtime Status

Normalize runtime state:

```text
not_detected
detected
checking
ready
auth_required
incompatible
broken
disabled
busy
```

Example:

```text
Claude Code
Detected: yes
Version: supported
Structured stream: yes
Authentication: ready
Status: READY
```

## 10.4 Capability Snapshot

Runner SHALL publish a capability snapshot after startup and whenever capabilities materially change.

Example:

```json
{
  "runner_id": "runner_win_001",
  "platform": "windows",
  "arch": "x64",
  "revision": 18,
  "coding_agents": [
    {
      "provider": "codex",
      "status": "ready",
      "version": "x.y.z",
      "runtime_source": "user_managed",
      "transport": "app_server",
      "capabilities": {
        "sessions": true,
        "resume": true,
        "approvals": true,
        "streaming": true,
        "diff_stream": true,
        "mcp": true
      }
    }
  ]
}
```

Sensitive local paths SHALL NOT be published to unauthorized Web clients.

## 10.5 Capability Revision

Do not send a full runtime catalog on every heartbeat.

Use:

```text
runner.capabilities.update
capability_revision = N
```

Heartbeat reports the current revision.

## 10.6 Project / Workspace Availability

Runtime availability alone is insufficient.

A Runner may have Claude Code but not the requested repository.

Maintain a logical project binding registry such as:

```text
runner_project_bindings
```

Example:

```json
{
  "runner_id": "runner_win_001",
  "project_id": "smart-spec-pro",
  "available": true,
  "git_repository": true,
  "worktree_supported": true
}
```

The server SHOULD avoid exposing raw local paths.

## 10.7 Runner Eligibility

A node is eligible only if all required constraints are satisfied:

```text
node online
provider ready
required capability available
project/workspace available or provisionable
workspace policy compatible
execution target allowed
capacity available
```

## 10.8 Discovery Frequency

Run discovery on:

```text
Runner startup
Runner update
runtime install/uninstall
runtime update
manual refresh
health-check failure
periodic background rescan
```

Support:

```text
fast scan
deep probe
```

to avoid expensive provider startup on every heartbeat.

---

# 11. Job Model

## 11.1 Job Type

Use existing `worker_jobs`.

Introduce/standardize:

```text
job_type = coding_agent
executor_type = coding_agent
```

Do NOT create an independent `coding_agent_jobs` queue as another source of truth.

This is the same `worker_jobs` durability model referenced by Spec 199. Spec 199 MCP Tasks/long-running calls and Spec 200 external-agent tasks share lease, heartbeat, fencing, idempotency, retry ownership and audit semantics. `worker_jobs` remains state, never the interactive Runner transport.

Additional metadata MAY live in dedicated detail tables.

## 11.2 Coding Agent Job Payload

Example:

```json
{
  "job_type": "coding_agent",
  "project_id": "project_123",
  "provider": "claude_code",
  "agent": "default",
  "model": "auto",
  "execution_target": "auto",
  "runner_id": null,

  "task": {
    "prompt": "Implement Spec 200 phase 1.",
    "attachments": [],
    "context_refs": []
  },

  "workspace": {
    "repository_id": "repo_123",
    "branch": "main",
    "mode": "isolated_worktree"
  },

  "session": {
    "mode": "new",
    "provider_session_id": null
  },

  "verification": {
    "run_tests": true,
    "run_lint": true,
    "run_build": true
  },

  "approval_policy": "standard",

  "context": {
    "context_package_id": "ctxpkg_123",
    "rag_scope_id": "ragscope_123",
    "allow_live_retrieval": true
  },

  "control": {
    "desired_state": "running"
  }
}
```

---


# 11A. Universal Agent Task Manifest

Every external-agent task SHALL be represented by a provider-independent manifest.

Example:

```json
{
  "task_id": "task_123",
  "task_family": "media_edit",
  "project_id": "project_123",

  "agent": {
    "provider": "claude_code",
    "provider_agent": "default",
    "model": "auto"
  },

  "execution": {
    "target": "auto",
    "runner_id": null
  },

  "instruction": "Create a professional edited video no longer than 3 minutes.",

  "assets": [
    "asset://video_001",
    "asset://video_002",
    "asset://video_003",
    "asset://image_001",
    "asset://image_002"
  ],

  "constraints": {
    "max_duration_seconds": 180,
    "aspect_ratio": "9:16",
    "subtitle_language": "th"
  },

  "context": {
    "context_package_id": "ctxpkg_123",
    "rag_scope_id": "ragscope_123"
  },

  "capabilities": {
    "skill_scope_id": "skillscope_123",
    "allow_skill_discovery": true
  }
}
```

The task manifest is not provider prompt syntax.

Each provider adapter can transform it into provider-native instructions/tools while preserving the same SmartAIHub policy.

## 11A.1 Task Family Examples

### coding

```text
spec/repository/workspace
provider-native coding tools
Git verification
tests/lint/build
```

### media_edit

```text
selected media assets
media analysis package
video-edit skills
timeline/project output
preview/review/render loop
```

### research

```text
RAG
Web/research Skills
Library
citations/artifacts
```

### automation

```text
approved tools
MCP/Skills
Runner/cloud execution
side-effect approvals
```


# 12. Agent Session Data Model

Recommended logical entities:

```text
coding_agent_sessions
coding_agent_turns
coding_agent_runtime_bindings
coding_agent_approvals
coding_agent_artifacts
```

These tables support agent-domain metadata but MUST NOT replace `worker_jobs` as the execution source of truth.

## 12.1 coding_agent_sessions

Suggested fields:

```text
id
tenant_id
user_id
project_id
provider
provider_session_id
provider_agent_id
model
execution_target
runner_id
workspace_id
status
runtime_version
adapter_version
capability_snapshot_json
native_session_metadata_json
created_at
updated_at
last_active_at
```

## 12.2 coding_agent_turns

```text
id
session_id
worker_job_id
provider_turn_id
prompt_summary
status
started_at
completed_at
usage_json
result_summary
native_turn_metadata_json
```

---

# 13. Normalized Event Protocol

All provider adapters SHALL emit a common envelope.

```json
{
  "event_id": "evt_x",
  "job_id": "job_x",
  "session_id": "session_x",
  "sequence": 102,
  "timestamp": "...",
  "provider": "codex",
  "type": "command.completed",
  "normalized": {},
  "native": {}
}
```

## 13.1 Required Event Families

### Lifecycle

```text
agent.session.started
agent.session.resumed
agent.turn.started
agent.turn.completed
agent.turn.failed
agent.interrupted
agent.cancelled
```

### Agent Output

```text
agent.message.delta
agent.message.completed
agent.progress
agent.thinking_summary
```

Do not store or expose private hidden model chain-of-thought.

Only provider-supported user-visible reasoning summaries may be forwarded.

### Tool

```text
tool.started
tool.progress
tool.completed
tool.failed
```

### Command

```text
command.started
command.output
command.completed
command.failed
```

### File

```text
file.read
file.created
file.modified
file.deleted
```

### Workspace

```text
workspace.created
workspace.changed
workspace.diff.updated
workspace.conflict
```

### Test/Verification

```text
verification.started
verification.test.completed
verification.lint.completed
verification.build.completed
verification.completed
verification.failed
```

### Approval

```text
approval.required
approval.approved
approval.rejected
approval.expired
```

### Subagent

```text
subagent.started
subagent.progress
subagent.completed
subagent.failed
```

### Artifact

```text
artifact.created
artifact.uploaded
```

### Runtime

```text
runtime.started
runtime.warning
runtime.crashed
runtime.restarted
runtime.stopped
```

---

# 14. Event Storage Strategy

Do not put unlimited raw logs into PostgreSQL.

## PostgreSQL

Store:

- lifecycle events;
- meaningful progress;
- status transitions;
- approval events;
- summary messages;
- metadata;
- usage;
- artifact references;
- recent compact log window.

## R2 / Object Storage / Library

Store:

- full provider stream;
- full stdout/stderr;
- large diffs;
- large test reports;
- generated reports;
- exported session transcripts where allowed;
- build outputs;
- screenshots or other artifacts.

## Git

Git remains the source of truth for source changes.

---

# 15. Workspace Manager

## 15.1 Default Isolation

Default coding job SHOULD run in an isolated Git worktree.

Example:

```text
repo/
.smartaihub/
  worktrees/
    job-001/
    job-002/
    job-003/
```

Different agents can then operate concurrently.

```text
Codex       → job-001
Claude Code → job-002
Antigravity → job-003
```

## 15.2 Workspace Modes

Support:

```text
isolated_worktree   // recommended
existing_workspace  // explicit opt-in
temporary_clone
remote_workspace
```

## 15.3 Existing Workspace Safety

If user explicitly chooses existing workspace:

- detect dirty working tree;
- show warning;
- record initial Git state;
- require policy approval if destructive;
- never silently reset user files.

## 15.4 Workspace Lease

Only one write-capable job SHOULD own a worktree at a time unless the provider explicitly supports coordinated parallel subagents inside the same harness.

---

# 16. Provider-Native Subagents

Provider-native subagents SHOULD remain controlled by the provider.

Example:

```text
Antigravity primary agent
  ├── subagent 1
  ├── subagent 2
  └── subagent 3
```

SmartAIHub SHOULD:

- display subagent existence;
- display status;
- display task summary;
- collect final outcome;
- record usage if available.

SmartAIHub MUST NOT unnecessarily replace provider-native subagent orchestration with external SmartAIHub jobs.

However, SmartAIHub MAY orchestrate independent top-level agents when provider boundaries are useful.

Example:

```text
Claude Code → architecture review
Codex       → implementation
Antigravity → independent verification
```

---

# 17. Approval Engine

## 17.1 Approval Categories

Normalize approvals into:

```text
filesystem.write
filesystem.delete
command.execute
package.install
network.access
git.commit
git.push
git.force
database.migration
credential.access
external.side_effect
provider.other
```

## 17.2 Decision Modes

```text
ask
allow_once
allow_for_job
allow_for_workspace
deny
deny_for_job
policy_auto_allow
policy_auto_deny
```

## 17.3 Default Policy

Safe read operations MAY be automatically allowed.

Potentially destructive/external operations SHOULD require explicit policy or user approval.

Examples normally requiring approval unless policy says otherwise:

- deleting large paths;
- changing files outside assigned workspace;
- installing global packages;
- opening arbitrary external network destinations;
- `git push`;
- force push;
- database migration;
- modifying production configuration;
- accessing sensitive credentials.

## 17.4 No Global Unsafe Bypass

The implementation MUST NOT default to provider flags equivalent to unrestricted permission bypass.

Unsafe bypass MAY exist only as an advanced explicitly enabled local policy with prominent warning and audit logging.

---

# 18. Security Architecture

This feature creates a remote-to-local execution channel and therefore MUST be treated as high-risk infrastructure.

## 18.1 Device Identity

Runner/Worker MUST have a persistent device identity.

Jobs SHALL only be delivered to authorized devices.

## 18.2 Signed / Authenticated Job Delivery

Every dispatched coding-agent job MUST be authenticated and bound to:

- tenant;
- user;
- project;
- runner;
- job ID;
- expiry;
- allowed workspace;
- requested provider;
- policy snapshot.

## 18.3 Workspace Allowlist

Runner SHALL only access configured/approved project roots.

Example:

```text
Allowed:
D:\Projects\SmartSpecPro
D:\Projects\SmartAIHub

Denied:
C:\
C:\Users\User\Documents
```

unless user explicitly authorizes broader access.

## 18.4 Secret Handling

SmartAIHub backend SHOULD NOT collect provider login passwords.

Prefer provider-native local authentication.

Sensitive provider tokens SHALL remain:

- OS keychain;
- provider credential store;
- secure environment;
- SmartAIHub encrypted secret store only when explicitly needed.

Raw credentials MUST NOT appear in:

- worker_job_events;
- stdout logs;
- R2 logs;
- browser UI.

## 18.5 Log Redaction

Implement redaction for:

- API keys;
- bearer tokens;
- cookies;
- private keys;
- connection strings;
- known secret patterns.

## 18.6 Command Controls

Runner SHALL record:

- executable;
- normalized command;
- working directory;
- exit code;
- duration.

The platform MUST permit policy-based blocking.

## 18.7 Network Policy

Support:

```text
deny
allow_provider_default
allowlist
unrestricted
```

Default SHOULD follow provider-safe behavior.


## 18.8 Skill Invocation Security

Each agent session receives only the Skill scope required for the job.

Every `skill.invoke` MUST re-check:

```text
tenant
user
project
job/session
skill permission
asset permission
billing/credit policy
side-effect policy
```

## 18.9 Asset Access Security

Asset references MUST NOT imply authorization.

Every resolution/materialization checks ACL again.

Short-lived execution URLs/tokens SHALL be scoped to:

```text
job
runner
asset
operation
expiry
```

---

# 19. Result Verification

Agent self-report MUST NOT be treated as sufficient proof of success.

After provider execution, SmartAIHub SHALL independently collect:

```text
git status
git diff
git diff --stat
```

and optionally run configured verification.

## 19.1 Verification Profiles

```text
none
quick
standard
strict
custom
```

### quick

- workspace changed?
- Git status;
- provider result.

### standard

- Git diff;
- targeted tests if configured;
- lint if configured;
- build if configured.

### strict

- full project test suite;
- lint;
- type check;
- build;
- security checks configured for project.

## 19.2 Verification Source

Project configuration MAY define:

```yaml
verification:
  test:
    - npm test
  lint:
    - npm run lint
  build:
    - npm run build
```

Commands MUST be approved under project policy.

## 19.3 Job Completion States

Separate agent completion from verified completion.

Example:

```text
agent_completed
verification_running
verified_completed

agent_completed
verification_failed
completed_with_failures
```

Do not mark a job fully successful merely because the agent says "done".

---

# 20. SmartAIHub Web UI

## 20.1 Project Agent Panel

Add a Coding Agent area within a project, not a separate disconnected system.

Suggested layout:

```text
Project: SmartSpecPro

[Task input...................................]

Agent:
[ Auto ▼ ]

Execution:
[ Auto ▼ ]

Workspace:
[ Isolated worktree ▼ ]

Verification:
[ Standard ▼ ]

[ Run ]
```

## 20.2 Agent Selector

Example:

```text
Auto
Codex
Claude Code
Antigravity
DeepSeek Harness
```

Show only available providers for the selected execution target.

Provider health:

```text
● Ready
● Busy
● Offline
● Runtime missing
● Login required
● Unsupported version
```

## 20.3 Execution Target

```text
Auto
My Computer — DESKTOP-ABC
Office Mac — MAC-01
Linux Runner — DEV-SERVER
Cloud
```

## 20.4 Runtime Status

Web SHALL display Runner-advertised status but SHOULD NOT expose local sensitive filesystem paths.

## 20.5 Live Job View

Tabs:

```text
Overview
Activity
Files Changed
Diff
Tests
Logs
Artifacts
Session
```

Overview example:

```text
Job #CA-20014
Agent: Codex
Runner: DESKTOP-ABC
Workspace: isolated
Status: Running
Elapsed: 12m

Current activity:
Running unit tests...
```

## 20.6 Approval UI

Example:

```text
Claude Code requests permission

Command:
npm install package-x

Workspace:
SmartSpecPro / job-20014

[Allow once]
[Allow for this job]
[Reject]
```

## 20.7 Final Result UI

```text
Completed

Agent:
Codex

Changed:
12 files
+534 / -126

Verification:
Tests: 143 passed
Lint: passed
Build: passed

Session:
Reusable

[Review Diff]
[Continue]
[Ask to Fix]
[Run Verification Again]
[Apply]
[Create Commit]
[Merge]
[Reject]
```

Merge/commit controls MUST obey repository policy.

## 20.8 `/chat` Integration

SmartAIHub Chat SHALL support coding-agent jobs as first-class conversation objects.

A chat turn can create a job:

```text
User:
"ให้ Codex ตรวจ Spec 200 และแก้ implementation"

Assistant:
creates coding-agent job
```

The conversation SHOULD render a live job card instead of blocking the chat request until execution completes.

The card can show:

```text
provider
runner
project
status
current activity
files changed
verification state
approval required
```

Actions MAY include:

```text
View Activity
Cancel
Review Diff
Continue
Ask to Fix
Verify
```

## 20.9 Universal AI Assistant Side Panel

The Side Panel SHALL use the same backend Agent Task API and the same conversations/session model as `/chat`.

It SHALL pass current-page semantic context.

Example:

```text
current route
project
entity type
entity id
selected item
selected text
```

This enables:

> "ให้ Claude ตรวจ spec นี้"

without forcing the user to repeat `spec_id`.

## 20.10 Conversation and Execution Are Separate

Do not block a conversation turn for the lifetime of a long coding job.

Model:

```text
assistant_conversation
├── user message
├── assistant acknowledgement
├── agent job card
├── job events/status
├── approval interactions
└── final agent result
```

A coding-agent session can continue across multiple `worker_jobs`.

## 20.11 Intent Routing

Universal Assistant SHALL distinguish:

```text
answer
help/rag
search/retrieval
lightweight tool action
coding-agent task
```

Examples:

```text
"Codex คืออะไร"
→ answer/help

"ให้ Codex แก้ error นี้"
→ coding-agent task
```

## 20.12 No Provider Protocol Logic in Chat UI

Neither `/chat` nor Side Panel may know how to invoke:

```text
codex app-server
claude stream-json
antigravity NDJSON
deepseek JSON-RPC
```

They send provider-independent Agent Task requests.


## 20.13 Selected Asset Context

When the user invokes the Side Panel from:

```text
Library
Media Studio
Video Editor
Project assets
```

the Assistant SHALL receive selected asset IDs as structured context.

Example:

```text
selected_assets:
- asset://video_001
- asset://video_002
- asset://image_003
```

The user can then say:

> "ตัดต่อ 3 วิดีโอนี้กับภาพเหล่านี้ให้ดูมืออาชีพ"

without re-uploading or manually naming every file.

## 20.14 Skill Invocation Visibility

Chat/Side Panel SHOULD be able to render meaningful Skill activity:

```text
Analyzing 3 videos
Creating transcript
Building rough cut
Rendering preview
Running video QC
```

Users SHOULD NOT need to see low-level Skill Gateway protocol messages unless opening advanced diagnostics.

---

# 21. SmartAIHub Runner / Worker UI

Runner/Worker local UI SHALL include:

## 21.1 Coding Agents

```text
Codex
✓ Installed
✓ Compatible
✓ Authenticated
[Check] [Settings]

Claude Code
✓ Installed
✓ Compatible
[Check] [Settings]

Antigravity
○ Not Installed
[Install]

DeepSeek Harness
○ Not Installed
[Install]
```

## 21.2 Runtime Detail

Display:

- source: user-managed / SmartAIHub-managed;
- version;
- compatibility;
- executable/runtime health;
- authentication state if safely detectable;
- last health check;
- current sessions;
- update availability.

## 21.3 Active Jobs

Worker App MAY show:

```text
Job
Provider
Project
Status
Started
```

but Web remains the primary control surface.

---

# 21A. Runner Control Gateway

## 21A.1 Purpose

The Runner Control Gateway is the realtime communication layer between SmartAIHub Backend and execution nodes.

It is distinct from `worker_jobs`.

## 21A.2 Primary Transport

Preferred:

```text
WebSocket over TLS
```

or a future equivalent bidirectional transport.

Example logical endpoint:

```text
wss://smartaihub.app/.../runner/control
```

Actual route naming SHALL follow existing API conventions.

## 21A.3 Outbound Connection

Runner/Worker initiates the connection to SmartAIHub.

Benefits:

- no inbound user-device port;
- works behind NAT;
- works behind most home/office routers;
- no requirement for fixed public IP;
- easier device authentication.

## 21A.4 Realtime Commands

Backend→Runner:

```text
coding_agent.execute
coding_agent.cancel
coding_agent.interrupt
coding_agent.approval.resolve
coding_agent.session.turn
coding_agent.session.resume
runtime.health_check
runtime.refresh
```

Runner→Backend:

```text
runner.register
runner.capabilities.update
runner.heartbeat
runner.reconcile
command.ack
coding_agent.event
coding_agent.approval.required
coding_agent.result
runtime.status
```

## 21A.5 Transport Security

Require:

- TLS;
- device-bound authentication;
- short-lived session token;
- replay protection for control commands;
- authorization check for every job;
- command ID;
- job ownership verification;
- protocol version negotiation.

---

# 22. Authentication Strategy

## 22.1 Local Providers

Prefer reusing provider-native authentication already present on the machine.

Examples:

- existing Codex login;
- existing Claude Code login;
- existing Antigravity cached credentials.

Do not copy provider passwords into SmartAIHub.

## 22.2 Cloud Providers

Use supported API credential/OAuth flows.

Credential ownership SHALL be explicit:

```text
user
tenant
platform
```

and governed by existing SmartAIHub secrets/security rules.

---

# 23. MCP Tool Plane

The existing SmartAIHub MCP server SHOULD expose approved tools usable by external agents.

External agents SHALL connect to **SmartAIHub-governed MCP/tool surfaces only** for platform capability access. If the selected capability originates from an external MCP upstream, SmartAIHub routes the invocation through **Spec 199 External MCP Gateway**. Provider runtimes MUST NOT be configured by Spec 200 to bypass Spec 199 and connect directly to arbitrary upstream MCP servers for SmartAIHub-managed capability execution.

Possible tool/meta-tool categories:

```text
context.search
context.fetch
context.related
project.get_context
project.get_spec
spec.search
spec.get
library.search
library.read
job.get
job.get_summary
job.create_subtask
artifact.upload
artifact.read_metadata
media.generate
smartaihub.help.search
skill.search
skill.describe
skill.invoke
skill.status
skill.result
asset.describe
asset.get_preview
```

Do not expose high-risk tools indiscriminately.

Provider MCP configuration SHALL be generated automatically by Runner where supported.

---


# 23A. SmartAIHub Capability / Skill Plane

SmartAIHub is a central Skill ecosystem.

External agents SHALL be able to benefit from those Skills without downloading or installing Skill packages into the provider runtime.

## 23A.1 Remote Capability Rule

Required rule:

> SmartAIHub-hosted Skills remain centrally hosted and centrally governed. External/local agents discover and invoke them remotely through SmartAIHub.

External agents MUST NOT require:

```text
Skill ZIP download
local Skill installation
local Skill upgrade
local revenue logic
local secret/API-key ownership
```

## 23A.2 Capability Discovery Meta-Tools

The canonical provider-facing surface is shared with Spec 199:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

The request MAY filter `capability_type = skill`.

Optional convenience aliases MAY be exposed:

```text
skill.search
skill.describe
skill.invoke
skill.status
skill.result
```

but they MUST resolve through the same Capability Registry/Resolver, ACL, health/risk filtering, version projection, audit and invocation path.

Optional:

```text
skill.cancel
skill.list_recent
skill.get_artifacts
```

Do not expose thousands of Skills permanently as thousands of MCP tools.

## 23A.3 Semantic Skill Search

`skill.search` SHOULD use semantic retrieval over the Skill Catalog.

Example query:

```text
"remove repeated/wrong speech and create professional rough cut"
```

can return Skills for:

```text
AI Rough Cut
Transcript Edit
Speech Error Detection
Semantic Scene Scoring
Professional Video Edit
```

## 23A.4 Skill Metadata Contract

Each Skill SHOULD expose:

```text
skill_id
version
name
description
semantic_description
tags
capabilities
input_schema
output_schema
accepted_asset_types
execution_class
estimated_duration
estimated_cost
requires_runner
requires_gpu
permission requirements
side-effect class
approval requirements
```

## 23A.5 Skill Invocation

Example:

```json
{
  "skill_id": "video.professional_edit",
  "version_policy": "compatible",
  "inputs": {
    "assets": [
      "asset://video_001",
      "asset://video_002",
      "asset://image_001"
    ],
    "max_duration_seconds": 180
  }
}
```

SmartAIHub resolves:

```text
permission
version
billing
execution location
assets
job
result
```

## 23A.6 Long-Running Skills

A Skill MAY return:

```text
execution = async_job
job_id = J123
```

Agent can use:

```text
skill.status
skill.result
```

or receive push events through the active Agent Control session.

## 23A.7 Skill Permission Scope

A job receives a scoped Skill capability token.

Example allowed domains for a media-edit task:

```text
media.*
video.*
audio.*
subtitle.*
library.read
context.read
```

Unrelated administrative capabilities remain unavailable.

## 23A.8 Billing and Revenue Sharing

Every external-agent Skill invocation still passes through SmartAIHub.

Therefore existing/future accounting can apply:

```text
credit deduction
platform share
tenant/partner share
skill owner share
```

External agents SHALL NOT bypass SmartAIHub billing by copying Skill implementation locally.

## 23A.9 Skill Versioning

The Skill Gateway resolves versions centrally.

An agent can request:

```text
latest compatible
pinned
project default
```

but does not install the version itself.

## 23A.10 Provider Protocol

MCP is a preferred generic access surface where supported, but Skill Plane is protocol-independent.

Possible transports:

```text
MCP meta-tools
provider-native functions/tools
Agent Runtime bridge
HTTP/RPC internal gateway
```

Skill semantics remain the same.

---

# 24. SmartAIHub Context / Knowledge Plane

Coding agents MUST be able to use the knowledge SmartAIHub already possesses.

The Context / Knowledge Plane is distinct from the Tool Plane.

```text
TOOL PLANE
Agent performs an action through SmartAIHub

CONTEXT / KNOWLEDGE PLANE
Agent retrieves trusted knowledge needed to reason and perform the task
```

## 24.1 Knowledge Sources

Subject to authorization, context can originate from:

```text
SmartAIHub RAG / Vector indexes
Help system
project specifications
architecture documents
developer documentation
Library files
project metadata
current Web page/entity context
current selected object
conversation context
selected previous agent job summaries
approved job artifacts
source-code metadata/indexes
user explicitly attached context
tenant knowledge bases
```

The Help system is especially important because an agent may not be authorized to read all SmartAIHub source code, while Help can still provide product usage and functional context.

## 24.2 Do Not Dump the Entire RAG Corpus

The system MUST NOT inject all available RAG data into the initial prompt.

Reasons:

- token waste;
- irrelevant context;
- context-window pressure;
- data-leak risk;
- stale information;
- poor retrieval precision.

Instead use two layers:

```text
Layer A — Initial Context Package
small, bounded, task-specific

Layer B — Live Context Retrieval
agent searches/fetches additional knowledge as needed
```

## 24.3 Context Package

Before execution the Universal Assistant / Agent Task service MAY produce a versioned Context Package.

Suggested content:

```text
task
project identity
current page/entity
selected spec
relevant Help excerpts
top RAG retrieval results
repository metadata
verification policy
explicit user attachments
relevant prior-job summaries
available SmartAIHub retrieval tools
```

The package MUST contain source/provenance identifiers rather than losing where information came from.

Example:

```json
{
  "context_package_id": "ctxpkg_123",
  "project_id": "project_123",
  "created_at": "...",
  "items": [
    {
      "source_type": "spec",
      "source_id": "spec_200",
      "version": "rev_2",
      "retrieval_reason": "current entity"
    },
    {
      "source_type": "rag",
      "source_id": "chunk_xyz",
      "score": 0.91,
      "retrieval_reason": "task similarity"
    }
  ]
}
```

## 24.4 Live Retrieval

During execution, supported agents SHOULD receive scoped retrieval tools.

Recommended logical tool surface:

```text
context.search
context.fetch
context.related
help.search
spec.search
spec.get
library.search
library.read
project.get_context
job.get_summary
artifact.read_metadata
```

These tools MAY be exposed through SmartAIHub MCP where the provider supports MCP.

For providers with a better native tool/function mechanism, an equivalent adapter can be used.

## 24.5 Job-Scoped Authorization

Never give a local coding agent unrestricted platform RAG access merely because it is running for a logged-in user.

Issue a short-lived job/session-scoped capability token.

The token SHALL bind:

```text
tenant_id
user_id
project_id
job_id
session_id
allowed knowledge collections
allowed tool names
expiry
read/write constraints
```

Every Context/MCP request MUST re-check authorization server-side.

## 24.6 Tenant and Project Isolation

Retrieval MUST enforce:

```text
tenant boundary
project boundary
user permissions
document ACL
Library ACL
knowledge-base ACL
job scope
```

A similarity score MUST never bypass authorization.

Authorization filtering occurs before or as part of retrieval, not after presenting results to the model.

## 24.7 Page Context from Universal Assistant

When a task originates from the Side Panel, pass semantic page context.

Example:

```text
route: /projects/SmartSpecPro/specs/200
project_id: SmartSpecPro
entity_type: spec
entity_id: 200
selected_text: optional
```

Therefore:

> "ให้ Claude ตรวจ spec นี้เทียบกับ code"

can resolve `spec นี้` without asking the user to repeat information.

## 24.8 Context Snapshot / Reproducibility

Record which initial context package and which retrieval results materially contributed to a job where feasible.

This supports:

- audit;
- debugging;
- reproduction;
- understanding stale-context problems.

Do not persist hidden model chain-of-thought.

## 24.9 Context Freshness

Retrieval results SHOULD include version/update metadata.

If a spec or Help article changes while a long-running agent is active:

- current turn may continue using its captured context;
- a later retrieval can return the new version;
- provenance must distinguish versions.

## 24.10 Offline Behavior

If Runner loses SmartAIHub connectivity:

```text
initial Context Package
→ remains locally available for the active job

live RAG retrieval
→ temporarily unavailable unless already cached
```

The agent MAY continue with already-authorized cached context.

It MUST NOT silently broaden access or fabricate missing SmartAIHub knowledge.

If the task critically depends on a new retrieval, execution SHOULD pause/degrade gracefully or clearly report that platform context was unavailable.

## 24.11 Local Context Cache

Runner MAY maintain a bounded encrypted job-local cache for Context Package items.

Requirements:

- job/session scoped;
- TTL;
- encrypted where supported;
- delete according to retention policy;
- no cross-tenant reuse;
- no global uncontrolled RAG mirror.

## 24.12 Context Provenance in Results

Final job metadata SHOULD be able to report:

```text
Spec 200 rev 2 used
Help article X used
3 RAG documents retrieved
Library file Y referenced
```

without exposing hidden reasoning.

## 24.13 Context Broker Service

Recommended backend component:

```text
SmartAIHub External Agent Context Adapter
```

Responsibilities:

- resolve project/page context;
- query RAG;
- search Help;
- search Library;
- enforce ACL;
- build Context Package;
- issue scoped access token;
- expose retrieval API/MCP tools;
- capture provenance;
- enforce retrieval limits.

The Agent Runtime Core does not implement RAG itself.

It consumes context supplied by the Context Broker.

---


# 24A. Asset-Aware Agent Tasks and Professional Media Editing

Spec 200 SHALL support tasks where the user selects existing SmartAIHub assets and asks an external agent to reason over and transform them.

Example user request:

> "ใช้วิดีโอ 3 ตัวนี้กับภาพประกอบเหล่านี้ ตัดต่อให้ออกมาเหมือนงานมืออาชีพ ความยาวไม่เกิน 3 นาที"

## 24A.1 Asset Selection

The UI passes explicit SmartAIHub asset references.

Example:

```text
asset://video_001
asset://video_002
asset://video_003
asset://image_001
asset://image_002
```

Do not embed full raw video binaries into normal LLM prompts.

## 24A.2 Media Analysis Package

Before or during agent planning, SmartAIHub can prepare:

```text
duration
resolution
fps
audio metadata
ASR transcript
speaker segments
scene boundaries
keyframes
semantic scene summaries
blur/shake/quality scores
silence
speech errors
duplicate/repeated speech
important moments
B-roll opportunities
existing subtitles
```

The external agent reasons over this compact structured representation.

Providers that support direct image inputs MAY also receive selected preview images/keyframes.

## 24A.3 Agent as Editor / Director

The external agent SHOULD primarily decide:

```text
story/editorial structure
clip selection
cut points
B-roll placement
image placement
subtitle strategy
music strategy
transitions
pace
reframe/crop
QC changes
```

The actual deterministic media processing SHOULD normally be performed through SmartAIHub Skills and Runner capabilities.

## 24A.4 Shared Video Edit Project Format

External agents SHALL use the same SmartAIHub Video Edit project/timeline model used by the Web Video Editor.

Recommended flow:

```text
Agent
→ create/update Video Edit project
→ preview
→ inspect result
→ revise timeline
→ final render
```

This ensures users can open the AI-created edit in the normal Web timeline and manually refine it.

## 24A.5 Example Media Skills

Possible Skill surface:

```text
media.inspect_assets
media.analyze_video
media.get_transcript
media.get_keyframes

video.create_project
video.add_clip
video.trim
video.reorder
video.add_overlay
video.add_broll
video.add_transition
video.add_subtitle
video.add_music
video.audio_duck
video.reframe
video.render_preview
video.inspect_render
video.render_final
video.qc
```

These are examples of capabilities; actual Skills are discovered through Skill Gateway.

## 24A.6 Professional Edit Loop

Recommended workflow:

```text
Selected Assets
      ↓
Media Analysis
      ↓
Context/RAG
      ↓
Agent Editorial Plan
      ↓
Skill Discovery
      ↓
Timeline Generation
      ↓
Runner Preview Render
      ↓
Agent Review/QC
      ↓
Timeline Revision
      ↓
Constraint Validation
      ↓
Final Render
      ↓
Library
```

## 24A.7 Machine-Enforced Media Constraints

Examples:

```text
max_duration_seconds = 180
aspect_ratio = 9:16
resolution = 1080x1920
subtitle_language = th
required_product_asset = true
required_dialogue_segments = [...]
```

Timeline/project validators SHALL reject invalid outputs and return structured violations to the agent.

## 24A.8 Asset Placement and Transfer

The external agent does not need permanent R2 URLs or credentials.

When a Skill/Runner requires the asset:

```text
Agent references asset ID
→ Asset Gateway authorizes
→ Execution Planner selects node
→ asset materialized/cached for job
→ Skill executes
```

## 24A.9 Output

Final media outputs SHALL be registered back into SmartAIHub Library with provenance:

```text
source assets
task/job
agent provider
skills used
timeline/project version
render settings
final artifact
```

---

# 25. Failure, Disconnect, Reconnect and Reconciliation

The system SHALL be designed under the assumption that SmartAIHub ⇄ Runner connectivity will occasionally fail.

## 25.1 Connection State Is Not Job State

Track connection independently from execution.

Example:

```text
job observed state:
running

connection state:
disconnected
```

A disconnected Runner does not prove that the local provider process stopped.

Recommended connection states:

```text
connected
reconnecting
degraded
disconnected
unknown
```

## 25.2 Connection Grace Period

Do not immediately label a node offline on a transient WebSocket drop.

Example state progression:

```text
CONNECTED
↓
RECONNECTING
↓
DEGRADED
↓
OFFLINE
```

Actual durations SHALL be configurable.

## 25.3 Runner Local Durable State

Runner MUST maintain a local durable store; SQLite is recommended.

Suggested logical tables:

```text
active_jobs
provider_sessions
runtime_processes
pending_events
event_ack_state
pending_approvals
workspace_bindings
control_commands
```

Critical execution state MUST NOT exist only in process memory.

## 25.4 Provider Process Independence

Provider processes SHALL be supervised independently from the network connection.

```text
Runner Service
├── Control Channel Client
└── Process Supervisor
    ├── Codex
    ├── Claude
    ├── Antigravity
    └── DeepSeek
```

Loss of Control Channel MUST NOT kill the provider by default.

## 25.5 Event Sequencing

Every Runner→Backend event SHALL include:

```text
job_id
session_id
event_id
sequence
timestamp
```

Sequences SHALL be monotonic within the defined stream scope.

## 25.6 Event ACK and Replay

Use at-least-once delivery with idempotent consumption.

Example:

```text
Runner sent through seq 220
Backend ACK through seq 218
connection breaks
Runner buffers 219...247
reconnect
Backend reports ACK 218
Runner replays 219...247
```

Backend SHALL deduplicate repeated event IDs/sequences.

## 25.7 Command ACK

Control commands require their own IDs and acknowledgement.

Example:

```text
Backend:
command_id = cmd_551
type = coding_agent.execute
job_id = CA-1001

Runner:
ACK cmd_551
```

Command ACK means Runner received the control message.

It is distinct from:

```text
job accepted
provider started
job running
```

## 25.8 Desired State vs Observed State

Use reconciliation semantics.

Backend owns desired state:

```text
running
paused
cancelled
```

Runner reports observed state:

```text
accepted
starting
running
waiting_approval
verifying
completed
failed
cancelled
unknown
```

Example during offline cancellation:

```text
desired_state = cancelled
observed_state = running
```

On reconnect Runner reconciles toward `cancelled`.

## 25.9 Runner Reconnect Handshake

On reconnect Runner SHALL send a reconciliation report.

Example:

```json
{
  "type": "runner.reconcile",
  "runner_id": "runner_01",
  "capability_revision": 18,
  "active_jobs": [
    {
      "job_id": "CA-1001",
      "provider": "claude_code",
      "observed_state": "running",
      "provider_session_id": "abc",
      "last_local_sequence": 247
    }
  ]
}
```

Backend responds per job with:

```text
continue
cancel
pause if supported
replay_after_sequence
recovery_required
```

## 25.10 Backend Restart

Backend may restart while local agents continue.

Live connection maps may be in memory, but durable assignment/state MUST be rebuildable from PostgreSQL.

Runner reconnects and reconciles after backend recovery.

## 25.11 Runner Restart

On Runner startup:

1. open local durable store;
2. find unfinished jobs;
3. inspect recorded provider processes;
4. determine whether process survived or session can resume;
5. inspect workspace;
6. reconnect;
7. reconcile with Backend;
8. resume, recover, or fail explicitly.

## 25.12 Provider Crash

Adapter SHALL:

1. capture exit code;
2. capture stderr;
3. persist last sequence;
4. inspect resumability;
5. collect workspace state;
6. classify retryability;
7. report deterministic provider failure.

## 25.13 Do Not Automatically Reassign Write-Capable Coding Jobs

If Runner becomes unreachable, Backend MUST NOT automatically run the same coding job on another device.

The original process may still be modifying its workspace.

Automatic reassignment is forbidden by default until ownership/state is conclusively resolved.

## 25.14 Runner Permanently Lost

Offer explicit recovery:

```text
Wait
Mark Failed
Recover on Another Runner
```

Recovery on another Runner requires:

- recoverable Git/patch/artifact state;
- new workspace ownership;
- a new or reconstructable provider session;
- explicit audit trail.

## 25.15 Approval During Disconnect

If an agent requests approval while SmartAIHub is unreachable:

- persist request locally;
- keep provider waiting where possible;
- do not auto-approve;
- replay approval request after reconnect;
- enforce configurable timeout policy.

Default timeout action SHOULD be deny or pause, never silent allow.

## 25.16 Ping / Heartbeat

Use transport ping/pong for connection health.

Use Runner heartbeat separately for execution-node health/capacity.

## 25.17 Reconnect Backoff

Use exponential backoff with jitter.

Example:

```text
immediate
1s
2s
4s
8s
16s
30s
30s...
```

---

# 26. Cancellation

Cancellation flow:

```text
User clicks Cancel
      ↓
Backend sets desired_state = cancelled
      ↓
Backend attempts realtime cancel over Runner Control Channel
      ↓
Runner receives cancellation
      ↓
Adapter uses provider-native interrupt/cancel
      ↓
graceful timeout
      ↓
terminate process if necessary
      ↓
collect workspace state
      ↓
job cancelled
```

Never delete workspace automatically after cancellation.

---

# 27. Session Resume / Continue

A completed job MAY leave a reusable provider session.

UI:

```text
[Continue Session]
```

New `worker_job` is created for the next turn but linked to the same `coding_agent_session`.

This preserves:

- job auditability;
- one job per execution unit;
- provider conversation continuity.

Example:

```text
Session S1
├── Job J1 / Turn 1
├── Job J2 / Turn 2
└── Job J3 / Turn 3
```

---

# 28. Multi-Agent Orchestration

Do NOT implement complex autonomous orchestration in Phase 1.

Architecture MUST nevertheless allow later workflow:

```text
Task
 ↓
Claude Code → architecture review
 ↓
Codex → implementation
 ↓
Antigravity → independent review
 ↓
Codex → corrections
 ↓
Verification
```

Each top-level agent action remains a normal `worker_job`.

A parent orchestration job MAY link child jobs later.

This avoids embedding orchestration logic inside provider adapters.

---

# 29. Auto Provider Selection

Future `Auto` mode MAY score providers using:

- runtime availability;
- platform;
- project policy;
- requested tools;
- local vs cloud requirement;
- provider capability;
- model availability;
- workload;
- user preference;
- cost policy.

MVP `Auto` SHOULD remain deterministic and simple.

Example priority:

```text
preferred provider configured?
  → use it if healthy

else local provider available?
  → use policy default

else supported cloud provider?
  → offer cloud
```

Do not implement opaque AI-based provider routing in initial release.

---

# 30. Observability

Metrics:

```text
coding_agent_jobs_started_total
coding_agent_jobs_completed_total
coding_agent_jobs_failed_total
coding_agent_jobs_cancelled_total

coding_agent_runtime_start_seconds
coding_agent_turn_seconds
coding_agent_verification_seconds

coding_agent_approval_wait_seconds

coding_agent_provider_crashes_total
coding_agent_runner_disconnects_total

coding_agent_event_lag_seconds
coding_agent_event_drop_total
```

Labels SHOULD include:

```text
provider
adapter_version
runtime_version
platform
execution_target
```

Avoid labels containing user IDs, repository paths, prompts, or secrets.

---

# 31. Audit Trail

Record:

- who started job;
- project;
- provider;
- runner;
- workspace;
- runtime/adapter version;
- permission policy;
- approvals;
- command summaries;
- file-change metadata;
- verification result;
- cancellation;
- merge/apply action.

Audit records SHALL be immutable according to existing platform policy.

---

# 32. Data Retention

Separate retention classes:

```text
job metadata
provider event stream
stdout/stderr
diff artifacts
session metadata
verification reports
```

Tenant policy SHOULD control long-term retention.

Secrets MUST be redacted before persistence.

---

# 33. API Surface

Suggested backend routes:

```text
GET    /api/coding-agents/providers
GET    /api/coding-agents/runners
GET    /api/coding-agents/runtimes
GET    /api/coding-agents/sessions

POST   /api/coding-agents/jobs
POST   /api/coding-agents/jobs/:id/cancel

POST   /api/coding-agents/jobs/:id/approve
POST   /api/coding-agents/jobs/:id/reject

POST   /api/coding-agents/sessions/:id/turns
POST   /api/coding-agents/sessions/:id/close

GET    /api/coding-agents/jobs/:id/diff
GET    /api/coding-agents/jobs/:id/artifacts
POST   /api/coding-agents/jobs/:id/verify
```

Actual API naming SHOULD follow existing SmartAIHub conventions.


Suggested logical Skill/Asset APIs or equivalent internal service methods:

```text
POST /api/agent-tasks

POST /api/skills/search
GET  /api/skills/:id
POST /api/skills/:id/invoke
GET  /api/skill-jobs/:id
POST /api/skill-jobs/:id/cancel

POST /api/assets/describe
POST /api/assets/materialize
POST /api/assets/publish-result

POST /api/context/search
POST /api/context/fetch
```

These endpoints may be internal or surfaced through MCP/native tool bridges depending on provider.

---

# 34. Runner Control Protocol / Message Types

These messages travel through the persistent Runner Control Channel.

They are not implemented by polling `worker_jobs`.

Suggested control messages:

```text
coding_agent.runtime.discover
coding_agent.runtime.install
coding_agent.runtime.health_check
runner.register
runner.capabilities.update
runner.reconcile
command.ack

coding_agent.session.start
coding_agent.session.resume
coding_agent.turn.send

coding_agent.approval.resolve

coding_agent.job.cancel

coding_agent.verification.run
```

Runner events:

```text
coding_agent.runtime.status
coding_agent.session.event
coding_agent.approval.required
coding_agent.artifact.created
coding_agent.verification.result
coding_agent.job.completed
coding_agent.job.failed
```

These messages SHALL be transported through the existing Runner/Worker control mechanism rather than introducing an unrelated connection protocol.

---

# 35. Provider Adapter Error Contract

Normalize provider failures:

```text
RUNTIME_NOT_FOUND
RUNTIME_UNSUPPORTED
AUTH_REQUIRED
AUTH_FAILED
SESSION_NOT_FOUND
SESSION_EXPIRED
PROVIDER_BUSY
PROVIDER_RATE_LIMITED
PERMISSION_DENIED
APPROVAL_TIMEOUT
PROCESS_CRASHED
PROTOCOL_ERROR
WORKSPACE_ERROR
VERIFICATION_FAILED
CANCELLED
UNKNOWN_PROVIDER_ERROR
```

Always retain provider-native diagnostic detail separately.

---

# 35A. Provider Result Transport and Result Trust Model

Every provider returns information differently.

The Provider Adapter SHALL convert native output into the common event protocol while preserving native payloads.

## 35A.1 Codex

Preferred result path:

```text
Codex App Server
→ bidirectional JSON-RPC
→ Codex Adapter
→ Agent Runtime Core
```

Capture where exposed:

```text
thread/session lifecycle
turn lifecycle
agent messages
tool activity
commands
approval requests
diff/file-change events
turn completion
errors
usage
```

## 35A.2 Claude Code

Preferred local result path:

```text
Claude Code
→ stdout stream-json
→ Claude Adapter
```

Also capture:

```text
stderr diagnostics
session ID
tool use/results
provider-supported subagent events
final result
```

## 35A.3 Antigravity Local

Preferred:

```text
Antigravity CLI
→ NDJSON stream
→ Antigravity Adapter
```

Capture:

```text
init
step_update
text deltas
tool_info
subagent_info
conversation_id
usage
result
```

## 35A.4 Antigravity Cloud

Use provider remote API result/event stream.

Map cloud interaction/environment identifiers to SmartAIHub session metadata.

## 35A.5 DeepSeek Harness

Preferred:

```text
DeepSeek Harness
→ SDK JSON-RPC / event-session stream
→ DeepSeek Adapter
```

Preserve provider event/session sequence where available.

## 35A.6 Four Result Layers

SmartAIHub SHALL distinguish:

```text
1. Provider Event Result
   what the agent/harness reports

2. Provider Final Result
   agent's own completion summary

3. Workspace Result
   what actually changed in Git/filesystem

4. Verification Result
   tests/lint/build/typecheck actually executed
```

Agent self-report is never sufficient proof of completion.

## 35A.7 Workspace Inspector

After execution collect independently:

```text
git status
git diff
git diff --stat
changed files
current branch/commit
```

according to project policy.

## 35A.8 Large Result Data

Do not send huge logs/diffs/build artifacts through single WebSocket messages.

Use:

```text
WebSocket
→ state / small events / approvals / metadata

R2 / Library / artifact storage
→ full logs / large diffs / reports / build outputs
```

Send artifact references over the Control Channel.

## 35A.9 Local Event Buffer

Native provider output SHALL first cross the Runner reliability boundary:

```text
Provider
→ Provider Adapter
→ normalized event
→ Runner durable buffer
→ WebSocket when connected
→ Backend
```

A provider MUST NOT depend on a direct connection to the SmartAIHub backend.

---

# 36. Installation UX

## 36.1 User With Existing Tools

Target experience:

```text
Install SmartAIHub Runner
      ↓
Runner detects:
✓ Codex
✓ Claude Code
✓ Antigravity
      ↓
Health check
      ↓
Ready
```

No manual JSON-RPC setup.

No manual MCP config for normal use.

No manual environment-variable work unless provider authentication requires it.

## 36.2 Missing Runtime

Example:

```text
Antigravity
Not installed

[Install]
```

Runner:

1. resolves compatible package;
2. downloads;
3. verifies checksum/signature where available;
4. installs in SmartAIHub-managed directory;
5. performs health check;
6. requests provider-native login if required.

## 36.3 DeepSeek Harness

DeepSeek dependencies SHALL be isolated in a managed environment.

Do not modify global Python packages.

---

# 37. Version Upgrade Policy

Each adapter release SHOULD define:

```text
minimum version
maximum tested version
recommended version
blocked versions
```

Runner SHALL report a version mismatch instead of silently changing user-managed runtimes.

For SmartAIHub-managed runtimes:

```text
update channel:
stable
preview
pinned
```

Support rollback to previous known-good runtime.

---

# 38. Compatibility Degradation

If a provider changes its protocol, SmartAIHub SHOULD degrade gracefully.

Example:

```text
Codex App Server unsupported

Available fallback:
Codex Exec

Capabilities reduced:
- approvals
- rich diff events
- persistent thread control

[Use Compatibility Mode]
```

Never pretend full support when only one-shot execution is available.

---

# 39. Testing Strategy

## 39.1 Unit Tests

For each adapter:

- parser;
- state mapping;
- error mapping;
- capability detection;
- cancellation;
- approval translation;
- event ordering;
- redaction.

## 39.2 Fake Provider Fixtures

Create deterministic fixture processes that simulate:

- normal stream;
- malformed JSON;
- delayed events;
- approval;
- provider crash;
- duplicate events;
- huge stdout;
- resume;
- cancellation.

CI MUST NOT require paid live provider accounts for most adapter tests.

## 39.3 Integration Tests

Against supported provider versions:

- start session;
- read file;
- modify fixture file;
- run harmless command;
- receive events;
- complete;
- resume;
- cancel;
- approval;
- verify diff.

## 39.4 Cross-Platform

Required:

```text
Windows 11
macOS supported Runner versions
Debian/Ubuntu Linux
```

Windows is highest priority due to SmartAIHub Worker/Runner usage.

## 39.5 Security Tests

Include:

- job spoof attempt;
- unauthorized workspace path;
- command policy bypass;
- symlink/path traversal;
- secret leakage;
- approval replay;
- stale job token;
- runner identity mismatch;
- malicious provider stdout;
- oversized output;
- shell injection;
- WebSocket/control channel drop during active tool execution;
- backend restart while provider remains running;
- Runner restart with unfinished local state;
- duplicate command delivery;
- duplicate event replay;
- stale command replay;
- offline cancellation;
- approval request while disconnected;
- unintended cross-tenant RAG retrieval;
- unauthorized Help/Library/spec access;
- context-token scope escalation;
- malicious RAG content attempting tool-policy bypass.

---

# 40. Acceptance Criteria

Spec 200 Phase 1 SHALL NOT be considered complete unless all of the following work end-to-end.

## AC-01

User can select a SmartAIHub project and start a coding-agent job from Web.

## AC-02

Backend creates a normal `worker_job`.

## AC-03

Authorized Runner claims the job using existing job-control semantics.

## AC-04

Runner detects the selected provider runtime.

## AC-05

Agent runs inside the assigned workspace/worktree.

## AC-06

Live progress appears on Web.

## AC-07

Provider output is normalized but native event data is retained.

## AC-08

User can cancel an active job.

## AC-09

A permission request can pause execution and be approved/rejected from Web.

## AC-10

SmartAIHub independently collects Git changes.

## AC-11

Configured tests/build/lint can be executed after agent completion.

## AC-12

Web shows:

- agent result;
- files changed;
- diff;
- verification;
- logs/artifacts;
- session state.

## AC-13

User can continue the same provider session with a new job/turn.

## AC-14

Runner disconnect/reconnect does not silently duplicate execution.

## AC-15

User-managed provider installations are never automatically overwritten.

## AC-16

Secrets are redacted from persisted logs.

## AC-17

A provider crash produces a deterministic failure state and recoverable diagnostics.

## AC-18

Runner and Windows Worker App use the same Agent Runtime Core implementation.

## AC-19

Runner automatically discovers installed supported providers and registers a capability snapshot.

## AC-20

Backend can select an eligible Runner based on provider + project/workspace + online state.

## AC-21

`worker_jobs` is used as durable state but job commands are delivered through the Runner Control Channel.

## AC-22

A temporary Control Channel disconnect does not automatically terminate an active provider process.

## AC-23

Runner persists unacknowledged events locally and replays them after reconnect.

## AC-24

Backend and Runner reconcile unfinished jobs after either side restarts.

## AC-25

A coding-agent job is not automatically reassigned to another Runner while execution ownership is uncertain.

## AC-26

A job originating in `/chat` can render a live coding-agent job card and receive the final result.

## AC-27

A job originating in Universal AI Assistant Side Panel receives current project/page/entity context.

## AC-28

A coding agent can retrieve authorized SmartAIHub RAG/Help/Spec/Library context during execution.

## AC-29

RAG/context retrieval is scoped by tenant/project/user/job and cannot cross an unauthorized boundary.

## AC-30

Final result distinguishes provider-reported completion, actual workspace changes, and independent verification.

## AC-31

If SmartAIHub connectivity is lost, an active local agent can continue using its initial authorized Context Package and locally cached context while new live RAG retrieval is unavailable.

## AC-32

Context provenance identifies the main SmartAIHub knowledge sources supplied/retrieved for the job without storing hidden chain-of-thought.


## AC-33

An external agent can discover SmartAIHub Skills through a small remote meta-tool surface without installing Skill packages locally.

## AC-34

`skill.invoke` performs permission, schema, version and billing checks inside SmartAIHub.

## AC-35

A long-running Skill can execute asynchronously and return status/result/artifacts to the active agent session.

## AC-36

A user can select existing Library/media assets and create an agent task without re-uploading those assets.

## AC-37

The external agent receives asset metadata/analysis/reference information without requiring full raw video to be embedded in the prompt.

## AC-38

A `media_edit` task can create/update a SmartAIHub Video Edit project/timeline.

## AC-39

Media constraints such as maximum duration are validated structurally and invalid timelines are returned to the agent for correction.

## AC-40

The final rendered media is published into SmartAIHub Library with source/task provenance.

## AC-41

Skill execution can be routed to Server, Runner, Worker/GPU Runner or Cloud without the external agent needing topology-specific logic.

## AC-42

Skill invocation remains compatible with SmartAIHub credit deduction and revenue-share accounting.

## AC-43

The same external provider can execute at least two different task families using different SmartAIHub context/assets/skills without provider-specific UI duplication.

---

# 41. Implementation Phases

## Phase 0 — Foundation

Implement:

- Agent Runtime Core package;
- provider adapter interface;
- normalized event envelope;
- runtime discovery;
- capability discovery;
- workspace manager;
- approval engine contract;
- result verifier contract;
- job payload extension;
- session schema;
- basic Web screens;
- Runner Control Gateway client/server contract;
- local durable Runner state;
- command ACK/event ACK;
- Runner reconciliation protocol;
- Device/Runtime Capability Registry;
- External Agent Context Adapter / Retrieval Broker contract;
- Context Package schema;
- `/chat` / Side Panel Agent Task contract.

No live provider required to complete core unit tests.

## Phase 1 — Codex + Claude Code

### Codex

Implement:

- App Server lifecycle;
- JSON-RPC;
- thread/turn mapping;
- event mapping;
- approval;
- cancel;
- resume;
- capability health check.

### Claude Code

Implement:

- CLI discovery;
- `stream-json` parser;
- session ID;
- resume;
- permission policy;
- cancellation;
- MCP config injection if needed.

Deliver complete end-to-end Web → Runner → Agent → Web.

## Phase 2 — Antigravity

Implement:

- CLI discovery;
- NDJSON parser;
- conversation ID;
- multi-turn stdin streaming;
- provider-native agents/subagents reporting;
- local runtime install;
- optional cloud adapter.

## Phase 3 — DeepSeek Harness

Implement:

- managed runtime environment;
- SDK JSON-RPC transport;
- capability discovery;
- session lifecycle;
- ACP optional transport;
- developer-preview compatibility safeguards.

## Phase 3A — Skill and Asset Gateway

Implement:

- Skill Registry integration;
- Skill semantic discovery;
- `skill.search/describe/invoke/status/result`;
- job-scoped Skill authorization;
- billing/credit hooks;
- Asset Gateway;
- selected asset context;
- Runner asset materialization;
- provenance.

## Phase 3B — Media Edit Agent Task

Implement:

- `task_family = media_edit`;
- Media Analysis Package;
- integration with existing Video Edit project/timeline;
- professional edit loop;
- preview render;
- external-agent QC/revision;
- machine-enforced duration/aspect/output constraints;
- final Library publication.

## Phase 4 — Advanced Orchestration

Implement:

- multi-provider workflows;
- independent review;
- parent/child jobs;
- automatic verification/fix loops with hard limits;
- team policies.

## Phase 5 — Additional Providers

Evaluate:

- ZCode programmatic interface;
- Gemini CLI;
- OpenCode;
- Aider;
- other harnesses.

Only add a provider when it has a stable non-GUI automation surface.

---

# 42. Recommended MVP Boundary

To prevent Spec 200 becoming too large, MVP SHOULD be:

```text
Agent Runtime Core
Runtime Discovery
Workspace Isolation
Approval Flow
Normalized Events
Result Verification

+
Codex App Server Adapter
+
Claude Code CLI Adapter

+
Web job control
```

Do NOT block MVP on:

- Antigravity cloud;
- DeepSeek Harness;
- multi-agent auto orchestration;
- ZCode;
- automatic provider selection intelligence.

---

# 43. Migration / Existing Worker Compatibility

Existing SmartAIHub Worker functionality SHALL continue during rollout.

Add new execution module rather than replacing existing Worker behaviors immediately.

```text
SmartAIHub Worker
├── existing modules
└── Agent Runtime Core
```

New SmartAIHub Runner:

```text
SmartAIHub Runner
└── Agent Runtime Core
```

Over time more headless execution SHOULD move to Runner, while Worker App remains available where local UI is useful.

No forced removal of old Worker functionality is part of Spec 200.

---

# 44. Operational Guardrails

Default limits SHOULD include:

- maximum job runtime;
- maximum idle approval time;
- maximum raw log size before offload;
- maximum retry count;
- maximum simultaneous write jobs per workspace;
- maximum concurrent coding-agent jobs per Runner;
- maximum session lifetime;
- maximum retained local managed runtime versions.

All values SHOULD be configurable by tenant/platform policy.

---

# 45. Cost and Usage

Where provider usage data is available record:

```text
input tokens
output tokens
thinking/reasoning tokens if provider exposes user-visible usage
cache usage
duration
provider-reported cost if available
```

Do not infer precise provider billing where it is not supplied.

For user-subscription-authenticated local tools, SmartAIHub MAY record usage telemetry but SHOULD NOT treat provider subscription consumption as SmartAIHub API cost.

SmartAIHub billing for orchestration, if introduced, SHALL be separate from provider billing.

---

# 46. Project Configuration

Allow optional file:

```text
.smartaihub/agent.yaml
```

Example:

```yaml
coding_agent:
  default_provider: auto
  workspace_mode: isolated_worktree

  allowed_providers:
    - codex
    - claude_code
    - antigravity

  verification:
    profile: standard
    commands:
      test:
        - npm test
      lint:
        - npm run lint
      build:
        - npm run build

  permissions:
    git_push: ask
    package_install: ask
    network_access: provider_default
```

Repository config MUST NOT override stronger platform security policy.

---

# 47. Definition of “Full Provider Support”

A provider SHALL only be marked **Full Support** when SmartAIHub can:

1. discover runtime;
2. health check runtime;
3. start task;
4. stream status;
5. receive final result;
6. cancel;
7. resume session where provider supports it;
8. handle approval where provider exposes it;
9. collect workspace changes;
10. perform verification;
11. report provider version;
12. survive basic disconnect/reconnect scenarios;
13. pass provider compatibility tests.

Otherwise label:

```text
Experimental
Compatibility Mode
One-shot Only
```

---

# 48. Key Design Decisions

## Decision 1

**Use existing `worker_jobs` rather than create a new coding-agent queue.**

## Decision 2

**Agent Runtime Core is shared by Runner and Worker App.**

## Decision 3

**Provider-native protocol is preferred over a universal forced protocol.**

## Decision 4

**MCP is primarily the SmartAIHub Tool Plane, not mandatory Agent Control Plane.**

## Decision 5

**Codex App Server is preferred over Codex MCP server / simple CLI wrapper for full local integration.**

## Decision 6

**Claude Code local MVP is CLI structured streaming first; Agent SDK remains optional advanced integration.**

## Decision 7

**Antigravity local uses structured NDJSON streaming and native conversation continuity.**

## Decision 8

**DeepSeek Harness uses SDK JSON-RPC as preferred transport.**

## Decision 9

**ZCode is not automated through GUI. Add direct adapter only when a stable programmatic interface is suitable.**

## Decision 10

**A coding agent saying “done” is not sufficient; independent workspace/result verification is required.**

## Decision 11

**User-managed runtimes are detected and reused but never silently modified.**

## Decision 12

**SmartAIHub-managed runtimes are installed on demand, version-pinned, isolated, updateable, and rollbackable.**

## Decision 13

**`worker_jobs` is durable state, not realtime transport. Runner commands use a persistent direct Control Channel.**

## Decision 14

**Runner/Worker automatically registers installed runtimes and capabilities; users do not manually register each coding tool.**

## Decision 15

**Temporary SmartAIHub ⇄ Runner disconnects do not terminate running agents. Local durable state + ACK/replay + reconciliation are mandatory.**

## Decision 16

**Provider result is not the same as verified result. Workspace inspection and verification remain independent.**

## Decision 17

**`/chat` and Universal AI Assistant Side Panel are first-class control surfaces for coding-agent jobs.**

## Decision 18

**SmartAIHub RAG/Help/Specs/Library/project knowledge are exposed through a scoped Context / Knowledge Plane.**

## Decision 19

**Agents receive minimum necessary context through Context Packages and live scoped retrieval, not a dump of the entire RAG corpus.**


## Decision 20

**LangGraph remains the top-level System Orchestrator. Spec 200 Agent Task Service is a delegated execution service, not a parallel orchestrator.**

## Decision 21

**Capability Registry/Resolver is shared with Spec 199. Skill, MCP, Workflow, Internal, Runner and External Agent capabilities do not have competing discovery systems.**

## Decision 22

**Spec 199 owns External MCP upstream transport/security/lifecycle. Spec 200 external agents invoke MCP-origin capabilities only through SmartAIHub/Spec 199.**

## Decision 23

**Spec 199 Runner MCP Runtime Manager and Spec 200 Agent Runtime Core are sibling modules on the same Runner and reuse one Control Channel, one device identity, one local durable store/reconciliation framework, one resource supervisor and one capability snapshot.**


---

# 49. Risks

## R1 — Provider Protocol Changes

Mitigation:

- adapter isolation;
- compatibility matrix;
- version pinning;
- health checks;
- fallback transport.

## R2 — Remote Code Execution Risk

Mitigation:

- device identity;
- job authorization;
- workspace allowlist;
- approval engine;
- command policy;
- audit trail;
- secret redaction.

## R3 — Workspace Corruption

Mitigation:

- isolated worktree default;
- leases;
- initial Git state snapshot;
- no silent reset.

## R4 — Provider Process Hangs

Mitigation:

- heartbeat;
- inactivity timeout;
- process watchdog;
- controlled termination.

## R5 — Excessive Log Volume

Mitigation:

- bounded event storage;
- object-store offload;
- log truncation with artifact pointer.

## R6 — Runtime Dependency Conflict

Mitigation:

- user-managed vs managed separation;
- isolated managed directories;
- managed Python/Node dependencies where needed.

## R7 — Feature Lowest-Common-Denominator

Mitigation:

- normalized + native dual payload;
- capability discovery;
- provider-specific extension panels.


## R8 — Skill Catalog Context Explosion

Mitigation:

- meta-tools;
- semantic discovery;
- lazy `skill.describe`;
- do not expose all Skill schemas at once.

## R9 — Skill Bypass / Local Copy Drift

Mitigation:

- remote invocation only for SmartAIHub-hosted Skills;
- central version resolution;
- no requirement to install Skill packages in providers.

## R10 — Asset Leakage

Mitigation:

- opaque asset references;
- job-scoped materialization token;
- ACL re-check;
- no permanent R2 credentials.

## R11 — Media Token / Bandwidth Explosion

Mitigation:

- analysis packages;
- transcripts/keyframes/previews;
- Runner-local execution near cached assets;
- raw video not placed in LLM context by default.

---

# 50. Non-Functional Requirements

## Reliability

- no duplicate job execution under normal lease recovery;
- ordered event replay;
- crash-safe session metadata;
- recoverable Runner reconnect.

## Performance

- live event latency target: normally < 2 seconds excluding provider/network delay;
- Runner should not buffer full provider output before streaming;
- parsing must be incremental.

## Scalability

Backend MUST support many Runner nodes and many concurrent sessions.

Provider processes remain on execution nodes, not central backend, for local execution.

## Maintainability

Provider code must remain isolated behind adapters.

Adding a new provider SHOULD NOT require changing:

- core job lifecycle;
- workspace manager;
- approval UI;
- main event model;
- verification subsystem.

---

# 51. Recommended Code Organization

Example:

```text
agent-runtime/
  core/
    provider.ts
    session.ts
    events.ts
    capabilities.ts
    runtime-manager.ts
    process-supervisor.ts

  workspace/
    manager.ts
    git-worktree.ts
    lease.ts

  approvals/
    engine.ts
    policy.ts

  verification/
    runner.ts
    git-result.ts

  providers/
    codex/
      adapter.ts
      app-server-client.ts
      protocol.ts
      parser.ts
      capability.ts

    claude-code/
      adapter.ts
      cli.ts
      parser.ts
      capability.ts

    antigravity/
      adapter.ts
      cli.ts
      parser.ts

    deepseek-harness/
      adapter.ts
      jsonrpc-client.ts

  security/
    redaction.ts
    path-policy.ts
    command-policy.ts

  testing/
    fake-provider.ts
```

Exact language/package boundaries MAY follow the existing SmartAIHub Runner implementation stack.

---

# 52. Reference Provider Facts Used for This Spec

The integration strategy above is based on official provider documentation available at the time of writing.

## OpenAI Codex

OpenAI describes Codex App Server as a long-lived, client-friendly, bidirectional JSON-RPC interface over the Codex harness, with threads and server-originated requests such as approval prompts.

Reference:

https://openai.com/index/unlocking-the-codex-harness/

## Anthropic Claude Code

Claude Code CLI supports non-interactive print mode, structured `json` / `stream-json` output, stream-json input, permission controls, and session continuation/resume.

Reference:

https://docs.anthropic.com/en/docs/claude-code/cli-usage

## Google Antigravity

Antigravity headless mode supports `json` and `stream-json`, emits NDJSON progress events, exposes a conversation ID, supports conversation continuation, and supports persistent stream-json input for multiple turns in one process.

Reference:

https://antigravity.google/docs/cli/headless/

## DeepSeek Harness

DeepSeek Harness exposes an SDK-oriented stdio/JSON-RPC server configuration and is currently positioned as a developer-preview modular harness.

References:

https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog

https://deepseek.com/harness/en/

---

# 53. Final Implementation Direction

Spec 200 SHALL be implemented as a **Universal External Agent Infrastructure capability**, not merely a Coding Agent feature.

Final target:

```text
                         SmartAIHub Web
        /chat / Assistant Side Panel / Project / Media UI
                              │
                              ▼
                    Universal Assistant Layer
                              │
                        Agent Task API
                              │
                              ▼
                     SmartAIHub Backend
                              │
     ┌────────────┬───────────┼───────────┬──────────────┐
     ▼            ▼           ▼           ▼              ▼
 State Plane  Control     Context      Asset          Skill
 PostgreSQL   Gateway     Broker       Gateway        Gateway
 worker_jobs  WebSocket   RAG/Help     Library/R2     Registry
     │            │           │           │              │
     │            ▼           │           │              │
     │      Runner / Worker ◄──┴───────────┴──────────────┘
     │            │
     │       Agent Runtime Core
     │            │
     │   ┌────────┼──────────────┬──────────────┐
     │   ▼        ▼              ▼              ▼
     │ Codex   Claude        Antigravity     DeepSeek
     │ Hermes Agents        OpenClaw-compatible
     │
     └────────────────────────────────────────────────────

Provider agent
    ↓ reasons
SmartAIHub context/assets/skills
    ↓ chooses capability
Skill Gateway
    ↓
Execution Planner
    ↓
Server / Runner / GPU / Cloud
    ↓
Result / Artifact
    ↓
Provider agent evaluates/iterates
    ↓
SmartAIHub final result
```

## 53.1 SmartAIHub Owns Governance

SmartAIHub remains responsible for:

```text
permissions
knowledge scope
asset scope
skill version
billing
revenue share
execution routing
job durability
audit
verification
artifact provenance
```

## 53.2 Provider Owns Native Intelligence

Provider harness retains:

```text
reasoning
native sessions
native subagents
native tool loop
native model strengths
provider-specific capabilities
```

## 53.3 No Provider Lock-In

The user can choose:

```text
Codex
Claude
Antigravity
DeepSeek
Auto
```

while still accessing the same SmartAIHub knowledge, assets and Skill ecosystem.

## 53.4 Example End-to-End Media Task

```text
User selects 3 videos + 4 images
        ↓
Side Panel:
"ให้ Claude ตัดเป็นวิดีโอมืออาชีพไม่เกิน 3 นาที"
        ↓
Agent Task Service
        ↓
Context Broker:
brand/product/project context
        ↓
Asset Gateway:
selected assets + media analysis
        ↓
Claude
        ↓
skill.search
        ↓
SmartAIHub Skill Gateway
        ↓
rough-cut / subtitle / B-roll / timeline / preview Skills
        ↓
Runner / media execution
        ↓
preview
        ↓
Claude reviews
        ↓
timeline revision
        ↓
constraint validator
        ↓
final render
        ↓
Library
        ↓
Chat/Side Panel result card
```

## 53.5 Example End-to-End Coding Task

```text
User:
"ให้ Codex ทำ Spec 200"
        ↓
Context Broker:
Spec 200 + relevant RAG/Help/architecture
        ↓
Capability Registry:
eligible Runner with Codex + repository
        ↓
Runner Control Channel
        ↓
Codex App Server
        ↓
workspace changes
        ↓
independent tests/build/diff
        ↓
result returned to Chat/Side Panel
```

The architecture is considered successful when external agents can use the full SmartAIHub ecosystem without SmartAIHub having to duplicate the agent itself and without exporting SmartAIHub's Skills as locally installed packages.

---

# 54. Implementation Checklist

Before marking Spec 200 complete, verify:

- [ ] shared Agent Runtime Core exists;
- [ ] Runner and Worker use the same provider implementation;
- [ ] no second coding-agent queue was created;
- [ ] Codex App Server adapter works;
- [ ] Claude Code stream-json adapter works;
- [ ] runtime discovery works;
- [ ] user-managed runtime is never silently replaced;
- [ ] SmartAIHub-managed runtime install path exists;
- [ ] capability discovery works;
- [ ] isolated Git worktree is default;
- [ ] normalized events are persisted;
- [ ] native provider payload can be retained/offloaded;
- [ ] approvals work from Web;
- [ ] cancel works;
- [ ] resume works;
- [ ] Runner reconnect is safe;
- [ ] Git diff is collected independently;
- [ ] verification is independent of agent self-report;
- [ ] secrets are redacted;
- [ ] audit trail exists;
- [ ] provider compatibility state is visible;
- [ ] Web live monitor exists;
- [ ] final result includes files/diff/tests/artifacts/session;
- [ ] Antigravity adapter can be added without modifying core lifecycle;
- [ ] DeepSeek adapter can be added without modifying core lifecycle;
- [ ] new providers can be added through an adapter without redesigning job control;
- [ ] Runner/Worker registers device identity through the Control Channel;
- [ ] Runtime Discovery automatically detects installed provider tools;
- [ ] Capability Registry tracks provider/version/status/capabilities per execution node;
- [ ] project/workspace availability participates in Runner selection;
- [ ] Backend sends execute/cancel/approve/resume directly through the persistent Runner Control Channel;
- [ ] `worker_jobs` is not used as a polling transport;
- [ ] command ACK is implemented;
- [ ] event ACK + replay is implemented;
- [ ] Runner durable local state exists;
- [ ] Runner/backend reconciliation exists;
- [ ] desired state and observed state are tracked separately;
- [ ] temporary disconnect does not kill the provider process;
- [ ] active coding jobs are not blindly reassigned after Runner loss;
- [ ] provider-native result capture exists for each supported provider;
- [ ] workspace result is independently inspected;
- [ ] large logs/diffs/artifacts are offloaded rather than sent as giant WebSocket messages;
- [ ] `/chat` can create and monitor a coding-agent job;
- [ ] Universal AI Assistant Side Panel can create and monitor the same job type;
- [ ] page/project/entity context is propagated from the Side Panel;
- [ ] Context Broker can build a bounded initial Context Package;
- [ ] agents can search/fetch authorized SmartAIHub RAG knowledge during execution;
- [ ] Help, Specs and Library can participate in authorized retrieval;
- [ ] RAG access uses job/session-scoped credentials;
- [ ] tenant/project/document ACL is enforced before retrieval results reach the agent;
- [ ] context provenance/version metadata is retained;
- [ ] offline Runner behavior for initial context vs live retrieval is defined and tested.
- [ ] Agent Task Manifest supports non-coding task families;
- [ ] selected asset IDs can flow from Library/Media UI into Agent Task;
- [ ] Asset Gateway performs ACL checks and job-scoped materialization;
- [ ] external agents can discover Skills through `skill.search`;
- [ ] Skill schemas are loaded lazily through `skill.describe`;
- [ ] SmartAIHub-hosted Skills are invoked remotely and do not require local provider installation;
- [ ] Skill Gateway validates input/output schema;
- [ ] Skill invocation applies permission and credit/billing checks;
- [ ] Skill execution can create asynchronous jobs;
- [ ] Execution Planner routes Skills without exposing topology to the external agent;
- [ ] `media_edit` task family is supported;
- [ ] Media Analysis Package can be generated from selected assets;
- [ ] external agent can create/update the shared Video Edit project/timeline;
- [ ] preview → agent review → revision → final render loop works;
- [ ] timeline constraints are machine-validated;
- [ ] final media output returns to Library with provenance;
- [ ] one provider can operate across multiple task families using different remote SmartAIHub Skills.


---

## Codebase Alignment Baseline — 2026-09-17

This is the target Spec 200 contract. The repository already has Chat, Agent,
MCP, Worker and canonical Job building blocks, but it does not yet prove the
complete provider-independent External Agent Gateway, persistent Runner
Control Channel and Agent Task lifecycle described here.

| Contract area | Current repository evidence | Alignment status |
|---|---|---|
| User control surface | `apps/web/client/src/App.tsx` has `/chat`; current Chat/runtime uses `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts` | Existing Chat foundation; Feature 198 owns the Universal Assistant UI and the full Agent Task control surface remains target work |
| MCP capability surface | `apps/web/server/_core/mcpRegistry.ts`, `mcpRoutes.ts`, `mcpPublicServer.ts`, `mcpOAuthServer.ts` | Existing hosted MCP surface; Feature 199 owns external upstream MCP lifecycle and Spec 200 MUST consume it through shared Capability Gateway |
| Current Agent runtime | `python-backend/app/api/internal_openai_agents_runtime.py`, `python-backend/app/services/openai_agents_contracts.py`, Web `agentRuntime/*` services | OpenAI Agents/LangGraph-related runtime building blocks exist; no complete provider-independent Spec 200 adapter/session/result contract is proven |
| Existing external-agent job path | Web `workerSchedulerService.ts`, `runEngine.ts` and tests use `external_agent_task` | Reusable Job admission foundation; it is not proof of the proposed `coding_agent` Agent Task Service or provider session lifecycle |
| Durable execution | `worker_jobs`, `worker_job_events`, `worker_job_attempts`, `worker_job_outbox`, `worker_job_dispatches` and provider reservations in `apps/web/drizzle/schema.ts` | Feature 195/186 canonical baseline; Spec 200 MUST reuse it and MUST NOT create `coding_agent_jobs` or another queue |
| Runner/Worker runtime | `apps/worker-app/src-tauri/src/control_plane.rs`, `worker_control_plane.rs`, `comfy_mcp_*`, plus Web Worker control services | Existing local runtime/control foundation; complete shared Feature 197 Runner identity, capability snapshot and Spec 199/200 sibling modules remain target work |
| Agent persistence | Existing `agentRuntimeTraces`, `agentRuntimeCheckpoints`, agent activity/registry tables | Partial reusable evidence; proposed `coding_agent_sessions`, turns, provider bindings, approvals and artifact linkage need explicit schema mapping/migration review |
| Context, assets and Skills | `contextRetrievalService.ts`, `libraryContextPacks`, asset APIs and Skill/Agent runtime services | Shared partial foundations; Spec 200 must use Feature 198/196 Retrieval/Context and Asset/Skill contracts rather than create copies |
| Proposed Agent APIs | No exact `/api/coding-agents/*`, `/api/agent-tasks`, `/api/context/search` or `/api/context/fetch` route family was found | Target API surface; actual implementation must follow existing SmartAIHub router/API conventions and avoid duplicate endpoints |
| Existing configuration UI | `Settings.tsx` MCP/connected-device panels, `/admin/mcp-servers`, `/workers/connect`, and `/chat` | Existing partial MCP/Worker UX; Project Agent Panel, live Agent Task card, approval, diff/result and verification views remain target work |
| Contract version evidence | `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1` are defined by the 199/200 target specs, not current runtime code | Compatibility identifiers only until adapters, mixed-version tests and rollback evidence are implemented |

### Cross-Spec 195–200 Ownership Contract

| Spec | Canonical responsibility | Boundary |
|---|---|---|
| Feature 195 | Durable Job execution, attempts, outbox/dispatch, leases/fencing, provider admission and settlement | No Goal/Plan, Chat UI, Runner device registry, MCP upstream or External Agent provider ownership |
| Feature 196 | Goal/Plan, capability resolution, solution selection and Universal Command Gateway | No durable Job state machine, provider-specific Agent runtime or upstream MCP transport |
| Feature 197 | Runner/device identity, local discovery, shared Control Channel, local execution and provenance | No duplicate Job/Capability/Approval system or direct user authorization |
| Feature 198 | Chat, Universal Assistant Launcher/Side Panel, page context and evolution/evaluation UX | No direct Runner/provider protocol calls or separate orchestration source of truth |
| Feature 199 | External MCP upstream lifecycle, protocol/OAuth, schema/risk/quarantine and governed MCP invocation | No External Agent runtime, second Runner channel, second Job/RAG/Approval/Asset/Billing system |
| Feature 200 | External Agent adapters, provider sessions/events/results and Agent Runtime Core | No arbitrary upstream MCP connection, second Skill/RAG/Runner/Job system or global OpenAI Agents replacement |

The only permitted ordinary product flow is:

```text
Feature 198 Chat / Assistant UI
  -> Feature 196 Goal/Plan + LangGraph
  -> shared Capability / Approval / Retrieval / Asset policy
  -> Feature 199 MCP Gateway or Feature 200 External Agent Gateway
  -> Feature 195 worker_jobs for durable execution
  -> Feature 197 Runner when local execution is selected
  -> result/provenance back to Feature 198
```

Existing repository adapters and compatibility paths must be treated as partial
evidence only. Retired Agency, work-request/workpacks, `/workflows`,
OpenSandbox, `sandbox_jobs` and Docker/OpenSandbox dispatch are prohibited and
require a separately authorized removal/migration audit if cleanup is requested.

## Problem

SmartAIHub has separate Chat, Agent, MCP, Worker and Job foundations, but it
does not yet provide one provider-independent Agent Task lifecycle that can
select a trusted runtime, preserve native provider behavior, use shared context
and assets, and return independently verified results through the same durable
execution model.

## Solution

Implement Spec 200 as the delegated External Agent Gateway and Agent Runtime
Core. Feature 198/196 receives the user intent, Feature 200 resolves and runs
the selected provider, Feature 199 governs MCP-origin capabilities, Feature 195
persists durable work, and Feature 197 controls local execution. All shared
policy, retrieval, asset, approval, audit and billing services remain singletons.

## Requirements

The implementation must support provider-independent Agent Tasks, runtime and
project discovery, persistent Runner control, native adapters, session/turn
events, approval/cancel/resume, bounded context and asset access, independent
workspace verification, artifact provenance, reconnect/replay/reconciliation,
tenant and secret isolation, billing, observability and cross-spec compatibility
tests.

## Architecture

Feature 200 is a delegated execution service invoked by Feature 196's
orchestration and presented through Feature 198 Chat/Assistant surfaces. It is
not a top-level orchestrator. It shares one Runner/device/control channel with
Feature 199, one `worker_jobs` truth with Feature 195, one capability boundary
with Feature 196/199, and one context/asset/approval model with the platform.

## Implementation

Current OpenAI Agents, LangGraph, Chat, MCP, Worker and `external_agent_task`
paths are reusable foundations. The complete Agent Task API, provider adapter
matrix, session persistence, unified Runner channel, project bindings and
verification/result UX remain target work. New schemas/routes require impact,
tenant/auth, migration, rollback and cross-spec review before implementation.

## Assumptions

External agents remain delegated principals, provider-native reasoning remains
provider-owned, SmartAIHub retains governance and durable execution authority,
Runner connectivity can be interrupted, and user intent may produce more than
one Job/turn without creating a parallel Job state machine.

## Constraints

No direct provider-to-upstream MCP bypass, no raw credentials in model context,
no client-supplied tenant authority, no unbounded logs/context/retries, no
silent runtime replacement, no duplicate Runner/Job/Capability/RAG/Approval/
Asset/Billing systems, and no retired execution path.

## Risks

Main risks are provider protocol drift, unsafe workspace or shell effects,
duplicate side effects after reconnect, stale Runner capability claims, context
or asset over-disclosure, incomplete verification, session leakage and accidental
overlap with Feature 199 or the default OpenAI Agents runtime.

## Alternatives

Directly embedding every provider in Chat, letting providers connect directly to
MCP, creating a coding-agent queue separate from `worker_jobs`, or using a
provider-specific Runner/control plane are rejected because they fragment
authority, retry/reconciliation, policy and audit.

## User Stories

As a user, I can select or authorize an Agent runtime from Chat or the Assistant
Side Panel, see progress and approvals, continue a session and inspect verified
diffs/artifacts. As an operator, I can distinguish provider, Runner, policy and
verification failures without exposing secrets or unrelated tenant data.

## Acceptance Criteria

Spec 200 is complete only when `/chat` and the Assistant Side Panel create the
same provider-independent Agent Task, durable work enters Feature 195,
Feature 199 governs MCP capabilities, local execution uses Feature 197's shared
Runner channel, results are independently verified, reconnect/replay is safe,
and the complete 195–200 integration, negative-bypass, tenant-isolation and
rollback evidence passes.

---

**End of Spec 200**
