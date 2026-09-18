# Spec 199 — External MCP Gateway & Upstream Management

**Status:** Implementation-ready target specification  
**Project:** SmartAIHub / SmartSpecPro  
**Spec ID:** 199  
**Recommended path:** `specs/feature/199-external-mcp-gateway-upstream-management/spec.md`  
**Related specs:** Feature 195 Unified Async Job Control Plane; Feature 196 Goal Orchestration; Feature 197 Runner Adaptive Execution Fabric; Feature 198 Intelligent Chat, Universal Orchestration & Capability Evolution; **Feature 200 Revision 7 Universal External Agent Control Plane**
**Companion spec:** **Spec 200** — External Agent Gateway / delegated external-agent runtime integration  
**Shared cross-spec contracts:** `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`; Feature 199 owns External MCP upstream lifecycle and governed MCP invocation.  
**Primary objective:** Add a first-class External MCP management layer without replacing the existing Universal MCP / Capability architecture, and align it normatively with Spec 200 so MCP and External Agent execution share one SmartAIHub orchestration/control plane.  
**Revision:** v18 — Spec 199↔200 cross-spec alignment over full v17 baseline + sixteenth 10-pass alignment gap audit
**Revision date:** 2026-09-17
**Current codebase implementation status:** Partial; the repository has an inbound/hosted SmartAIHub MCP surface and connection management, but not the full multi-upstream External MCP Gateway contract defined here.

## Retired execution boundaries

This specification MUST NOT add callers, routes, schemas, migrations, compatibility paths or dispatch adapters for Agency, `work/request`, `work/requests`, `workpacks/*`, the retired `/workflows` custom workflow engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. In this document, `Workflow`/`workflow` means only a governed Feature 196 Goal/Plan or approved LangGraph flow; it never means the retired `/workflows` engine. Isolated server execution uses approved Cloudflare Containers, and local execution uses the Feature 197 Runner boundary.

---

## 1. Executive Summary

SmartAIHub already has a broader orchestration architecture in which:

- **LangGraph** owns system-level orchestration, deterministic routing, state transitions, pause/resume, and escalation.
- **OpenAI Agents SDK** is the default cognitive executor for reasoning-heavy tasks, specialist-agent composition, skill/tool/MCP usage, and synthesis.
- **Retrieval / Operational / Capability brokers** own SQL/RAG/Help/operational lookup, provenance, ACL/tenant filtering, and capability discovery.
- **`worker_jobs` / `worker_job_events`** remain the source of truth for durable execution.
- **SmartAIHub Runner / Worker** execute local or heavy workloads.
- **Universal AI Assistant Launcher** and full Chat share the same orchestration/runtime contracts.
- **Spec 200 External Agent Gateway** is a companion execution surface for delegated runtimes such as Codex/Claude/Antigravity/DeepSeek/Hermes/OpenClaw; it does not own MCP upstream transport.
- **Capability Registry/Resolver, Retrieval Broker, Runner Control Channel, `worker_jobs`, Approval, Audit/Trace, retry/lease/fencing, assets and billing** are shared infrastructure and MUST NOT be duplicated by Spec 199 or Spec 200.

This spec extends that architecture with an **External MCP Gateway & Upstream Management Layer** inspired by proven patterns from `smart-mcp-proxy/mcpproxy-go`, while keeping SmartAIHub’s own contracts and abstractions as the canonical public interfaces.

The new layer MUST:
1. Manage external MCP servers centrally.
2. Support remote and local/Runner-hosted MCP servers.
3. Discover tools lazily instead of exposing all tools to agents.
4. Enforce tenant/user/role/agent-level permissions before discovery and execution.
5. Quarantine and review newly added or materially changed tools.
6. Support OAuth, per-user credentials, health checks, schema/version tracking, and audit trails.
7. Integrate with the existing Capability Registry so MCP tools are one capability type among Skills, Agents, Workflows, and internal services.
8. Allow OpenAI Agents SDK to see only selected/authorized capabilities.
9. Preserve the ability to replace `mcpproxy-go` or any sidecar implementation later without changing SmartAIHub’s higher-level API.
10. Separate Platform Admin, Tenant Admin, End User, Agent, and Runner-owner responsibilities so one MCP Center is not incorrectly exposed to every actor.
11. Provide production-ready UI/UX contracts for MCP catalog, installation, connection, authorization, permissions, review, health, activity, Runner management, and in-chat approval.
12. Keep the end-user experience simple: ordinary users SHOULD primarily see “Connected Apps / AI Connections” rather than raw MCP transport/protocol details.
13. Treat **Spec 200 as the companion External Agent Gateway** and preserve a single LangGraph/Capability/Runner/Job/Retrieval/Approval/Audit architecture across both specs.
14. Ensure External Agents can use MCP capabilities only through the SmartAIHub Capability Gateway and this Spec 199 External MCP Gateway; direct External Agent → arbitrary upstream MCP connections are prohibited.
15. Use one shared Runner identity/control channel/capability snapshot, with MCP Runtime Manager (Spec 199) and Agent Runtime Core (Spec 200) as sibling modules rather than separate device/control planes.

---

## 2. Non-Goals

This spec does NOT:
- Replace LangGraph as the system orchestrator.
- Replace OpenAI Agents SDK as the default cognitive executor.
- Replace `worker_jobs` as durable execution truth.
- Replace the existing Universal MCP Layer with a third-party proxy product.
- Make MCP the only capability type in SmartAIHub.
- Allow external agents to bypass SmartAIHub ACL, tenant isolation, or audit.
- Expose upstream credentials or OAuth tokens to LLMs or tool callers.
- Force every MCP call through an LLM when deterministic routing already knows the target.
- Create a second job system, second audit system, or second permission system.
- Create a second Capability Registry, Retrieval/RAG broker, Runner device registry, Runner realtime channel, approval service, billing ledger, asset identity model, retry owner, lease/fencing model, or execution-control plane for Spec 200.
- Let a Spec 200 External Agent connect directly to arbitrary External MCP upstreams, receive upstream MCP credentials, or bypass Spec 199 quarantine/schema/risk/approval enforcement.
- Treat Spec 200 external agents as a silent global replacement for the platform default OpenAI Agents SDK cognitive executor.

---

## 3. Terminology

### 3.1 Universal MCP Layer
The SmartAIHub-owned platform layer containing:
- SmartAIHub MCP server endpoints
- Internal MCP tools
- External MCP Gateway
- MCP registry/discovery
- MCP security/policy
- MCP credentials
- Runner bridge
- audit/trace integration

### 3.2 External MCP Gateway
The SmartAIHub-owned gateway responsible for:
- upstream MCP registration
- connection lifecycle
- discovery
- tool normalization
- credential resolution
- permission enforcement
- execution proxying
- health monitoring
- audit and security gates

### 3.3 Upstream MCP Server
Any MCP server that SmartAIHub connects to, including:
- remote Streamable HTTP / HTTP MCP
- SSE-compatible legacy MCP where supported
- local stdio MCP
- localhost MCP
- private-LAN MCP
- MCP started by SmartAIHub Runner

### 3.4 Capability
A normalized executable or informational unit in SmartAIHub:
- internal SQL/operation
- Skill
- Agent
- Workflow
- MCP Tool
- Runner capability
- External Agent Runtime

### 3.5 Spec 200 External Agent Gateway
The companion gateway/runtime control surface defined by Spec 200. It owns provider-specific delegated-agent adapters, sessions, provider events/results and Agent Runtime Core behavior. It does **not** own arbitrary upstream MCP transport, MCP OAuth/schema/quarantine, or a second capability/retrieval/job/control plane.

### 3.6 Shared Infrastructure
Infrastructure canonically shared by Spec 199 and Spec 200:
- LangGraph System Orchestrator
- Capability Registry / Resolver / Capability Gateway
- Retrieval Broker and RAG/Help/Specs/Library access policy
- Runner Control Channel and Execution Node Registry
- `worker_jobs` / `worker_job_events`
- desired/observed execution state, lease epochs and fencing
- Approval Service and Assistant approval UI
- Audit / trace / correlation IDs
- AssetRef / ArtifactRef / Library authorization
- Billing / usage ledger and secret architecture

A spec may extend these shared contracts with domain-specific metadata but MUST NOT create a parallel source of truth.

### 3.7 Cross-Spec Internal Contract Versions

```text
smartaihub_execution_contract = "SAH-EXEC-1"
smartaihub_capability_contract = "SAH-CAP-1"
smartaihub_runner_contract = "SAH-RUNNER-1"
smartaihub_context_contract = "SAH-CONTEXT-1"
smartaihub_asset_contract = "SAH-ASSET-1"
```

Breaking changes require coordinated compatibility tests and version negotiation across Spec 199 and Spec 200.

---

## 4. Architectural Position

```text
User / UI / API
      |
      v
Universal AI Assistant / Chat Gateway
      |
      v
LangGraph — System Orchestrator
      |
      +--> Retrieval Broker (SQL / Help / RAG / Specs / Library / governed MCP-derived knowledge)
      |
      +--> Operational Broker
      |
      +--> Capability Resolver
                 |
                 +--> Internal Service
                 +--> Skill
                 +--> Workflow
                 +--> Agent
                 |
                 +--> MCP Tool
                 |        |
                 |        v
                 |   Spec 199 External MCP Gateway
                 |        |
                 |   +----+------------------+
                 |   |                       |
                 |   v                       v
                 | Remote MCP         Runner MCP Runtime Manager
                 | Servers                   |
                 |                           v
                 |                    SmartAIHub Runner
                 |
                 +--> External Agent Runtime
                          |
                          v
                    Spec 200 External Agent Gateway
                          |
                          v
                    Agent Runtime Core
```

OpenAI Agents SDK remains the platform default cognitive executor and is invoked when LangGraph determines that model reasoning/decomposition/tool selection/synthesis is beneficial. Spec 200 external agents are **delegated cognitive/execution runtimes**, selected explicitly by user/policy/task requirements; they are not a silent global replacement for the default cognitive executor.

### 4.1 Canonical Cross-Spec Ownership — Normative

Spec 199 and Spec 200 are companion specifications inside one SmartAIHub architecture. They MUST NOT create parallel orchestration, capability, Runner, durable-job, approval, retrieval/RAG, audit, permission, asset, billing or secret systems.

| Concern | Canonical owner | Spec 199 responsibility | Spec 200 responsibility |
|---|---|---|---|
| Universal Assistant `/chat` / Side Panel | Feature 198 UI/evolution + Feature 196 command semantics / shared platform | expose governed MCP capabilities to shared orchestration | expose delegated External Agent tasks/results to the same orchestration |
| System orchestration | LangGraph / shared platform | MCP capability nodes/adapters | External Agent delegation nodes/adapters |
| Default cognitive execution | OpenAI Agents SDK / shared platform | supply governed MCP capabilities | coexist as delegated runtime, not platform-wide replacement |
| Capability Registry / Resolver | shared platform | contribute normalized MCP projections | contribute external-agent/runtime availability; never create second registry |
| Retrieval / RAG / Help / Specs / Library | Retrieval Broker / shared platform | contribute MCP-derived knowledge with lineage/ACL/revocation | consume via scoped External Agent Context Adapter |
| External MCP upstream lifecycle | **Spec 199** | owns protocol/transport/OAuth/schema/quarantine/upstream execution | MUST NOT reimplement or bypass it |
| External Agent runtime | **Spec 200** | may expose capabilities used by external agents | owns provider adapters/sessions/provider events/results |
| Runner Control Channel | shared execution-control infrastructure | `runner.mcp.*` commands/events | `runner.agent.*` commands/events |
| Execution Node Registry | shared platform | advertise MCP runtimes/capabilities | advertise agent runtimes/project bindings/provider health |
| Durable execution | `worker_jobs` / `worker_job_events` | long-running/local/retryable MCP execution | delegated external-agent tasks/long-running capability work |
| Approval | shared Approval Service | MCP/tool/risk/schema approvals | provider/shell/file/capability approvals |
| Audit / trace | shared platform | MCP gateway/upstream trace | agent session/turn/capability/result trace |
| Assets / Library | shared Library/Media platform | MCP consumes/produces canonical refs | agent uses same canonical refs/materialization |
| Billing / usage | shared ledger | MCP/provider usage hooks | agent/skill usage hooks |
| Secrets / credentials | shared secret architecture | MCP upstream/JIT/OAuth credentials | provider-native/local credentials where appropriate |

If older wording in either spec appears to create a duplicate shared system, this cross-spec ownership table takes precedence until that wording is amended.

### 4.2 External Agent → MCP Routing Is Always Governed by Spec 199

A Spec 200 external agent MUST NOT connect directly to arbitrary upstream MCP servers, receive raw upstream MCP credentials, or use a private parallel MCP registry.

Canonical route:

```text
Claude / Codex / Antigravity / DeepSeek / Hermes / OpenClaw
      ↓
Spec 200 External Agent Gateway / Agent Runtime Core
      ↓
SmartAIHub Capability Gateway
      ↓
Capability Resolver + ACL / health / risk / approval / budget policy
      ↓
MCP capability (`capability_type = mcp_tool`)
      ↓
Spec 199 External MCP Gateway
      ↓
approved External MCP Server
```

The same rule applies when a provider exposes MCP or native-tool bridge primitives. Provider-native connectivity is an adapter mechanism; it cannot bypass SmartAIHub capability authorization, quarantine, credential isolation, schema/version binding, approval, billing or audit.

### 4.3 Shared Capability Discovery Contract

The canonical model/agent-facing capability contract across Spec 199 and Spec 200 is:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

Canonical `capability_type` values include:

```text
skill
mcp_tool
workflow
agent
internal
runner
external_agent_runtime
```

Convenience aliases such as `skill.search` or MCP-specific search endpoints MAY exist for UX/compatibility, but are projections over the same Capability Registry/Resolver, ACL, health, risk, version and exposure-budget path. They MUST NOT introduce a second Skill registry/index or a second MCP policy truth.

### 4.4 One Runner / Worker Architecture

Spec 199 and Spec 200 use the same authenticated outbound Runner Control Channel, Runner/device identity, capability snapshot, desired/observed state, local durable state and process/resource supervisor.

```text
SmartAIHub Runner
├── Control Channel Client                         ← shared
├── Capability Reporter / Execution Node Snapshot ← shared
├── Local Durable State / Reconciliation          ← shared
├── Process / Resource Supervisor                 ← shared
├── MCP Runtime Manager                           ← Spec 199
└── Agent Runtime Core                            ← Spec 200
```

Shared optional modules such as Asset Cache/Materializer or Skill Execution Bridge attach to this same Runner identity and control channel; they do not create another device registry.

The channel uses namespaced commands/events, for example:

```text
runner.mcp.*
runner.agent.*
runner.runtime.*
runner.asset.*
runner.skill_execution.*
runner.control.*
```

There MUST NOT be a Spec-199-only Runner WebSocket plus another incompatible Spec-200 Runner WebSocket.

### 4.5 `worker_jobs` Is Durable State; Runner Control Channel Is Realtime Transport

Both companion specs use this invariant:

```text
worker_jobs / worker_job_events
= durable global execution state / history

Runner Control Channel
= realtime command / ACK / progress / event transport
```

Rules:
- Runner does not poll `worker_jobs` as the primary interactive command mechanism;
- disconnect is not equivalent to execution failure;
- realtime events may be buffered/replayed/reconciled while durable job state remains authoritative;
- retries have one owner per failure domain and reuse the same execution intent semantics;
- both specs share `desired_state`, `observed_state`, `lease_owner`, `lease_epoch`/fencing token, `last_acknowledged_event_sequence`, and `execution_intent_id` semantics;
- backend restart, Runner restart, sleep/network loss, duplicate delivery and late result handling use the same reconciliation model.

### 4.6 Shared Retrieval Broker / External Agent Context

Spec 200 SHALL NOT build a second RAG system. Its Context Broker is an **External Agent Context Adapter / façade** over the existing shared Retrieval Broker.

```text
Spec 200 External Agent Task
       ↓
External Agent Context Adapter
       ↓
Retrieval Broker
       ├── Help
       ├── RAG / project knowledge
       ├── Specs
       ├── Library
       └── MCP-derived knowledge (Spec 199 lineage)
```

MCP-derived knowledge remains owned/governed by Spec 199 source lineage, ACL, trust classification, freshness and revocation rules. Spec 200 cannot copy such data into a separate ungoverned RAG index or continue retrieving it after Spec 199 revocation makes it ineligible.

### 4.7 Shared Approval, Audit, Trace, Retry, Lease and Fencing

There is one shared Approval Service/UI and one execution trace model. Spec-specific metadata extends, rather than replaces, the common contract.

Shared approval domains include:

```text
mcp_capability
provider_action
skill_side_effect
workspace_change
external_effect
```

Shared trace/correlation identifiers propagate where applicable:

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

Approval expiry/replay protection, retry ownership, leases, lease epochs/fencing, `UNKNOWN_OUTCOME`, cancellation and effect reconciliation MUST preserve the same semantics whether the originating caller is OpenAI Agents SDK, a deterministic LangGraph node, or a Spec 200 delegated external agent.

### 4.8 Shared Asset / Artifact Contract

Canonical SmartAIHub references are reused across both specs:

```text
asset://...
artifact://...
library://...
```

MCP capabilities SHOULD map file inputs/outputs to canonical AssetRef/ArtifactRef objects whenever possible. External agents obtain job-scoped authorized projections/materializations of those same references rather than inventing provider-specific durable asset identity.

### 4.9 Cross-Spec Prohibitions

The following are explicitly prohibited:
1. a second Capability Registry/Resolver for Spec 200;
2. a second Retrieval/RAG implementation for External Agents;
3. a second Runner WebSocket/control plane or duplicate Runner/device registry;
4. a second durable job system;
5. a separate approval database/service;
6. External Agent → arbitrary upstream MCP bypassing Spec 199;
7. installing/downloading SmartAIHub Skills into external-agent runtimes as a parallel Skill distribution system;
8. Skill/MCP discovery that bypasses shared ACL/health/risk/version filtering;
9. different asset/artifact identities between specs;
10. independent retry owners for the same `execution_intent_id`;
11. `/chat` or Side Panel flows that bypass LangGraph and command Runner directly;
12. exposing upstream MCP credentials to Spec 200 provider/model context.

### 4.10 Cross-Spec Compatibility Contract

Both specs SHALL advertise compatible internal contract versions (`SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`). Breaking changes require coordinated rollout, mixed-version compatibility tests, rollback rules and an explicit migration plan. MCP protocol revision and these SmartAIHub internal contract versions remain separate axes.

---

## 5. Design Principles

1. **SmartAIHub owns the contract.**
2. **External MCP is a capability source, not the platform core.**
3. **Search first, expose later.**
4. **Permission filtering occurs before discovery results are returned.**
5. **Tool schema changes are security events.**
6. **Credentials are never visible to the LLM.**
7. **Deterministic actions bypass unnecessary LLM calls.**
8. **All executions are traceable end-to-end.**
9. **Runner-hosted MCP uses the existing execution/control plane.**
10. **Third-party implementation components must remain replaceable.**
11. **Role-appropriate UX.** Platform infrastructure controls MUST not be exposed as ordinary end-user controls.
12. **Maximum permission only flows downward.** A child scope may restrict inherited access but MUST NOT elevate beyond Platform/Tenant policy.
13. **Simple by default, advanced on demand.** Protocol details are hidden from ordinary users and available only to permitted advanced/admin roles.
14. **Approval is execution-bound.** A user approval MUST authorize one exact normalized action/parameter set (or an explicitly bounded reusable scope), not merely a tool name.
15. **Runtime revisions are immutable.** Discovery, approval, automation pinning, and rollback MUST refer to an immutable server/runtime revision so parallel versions cannot corrupt one shared catalog.
16. **Spec 199 and Spec 200 are one architecture, not two stacks.** Shared orchestration/control-plane infrastructure has one canonical owner and source of truth.
17. **External Agents use capabilities, not upstream credentials.** A delegated agent reaches MCP only through the Capability Gateway and Spec 199.
18. **Realtime transport is not durable state.** Runner Control Channel carries commands/events; `worker_jobs`/events remain durable execution truth.

---

## 6. Functional Requirements

### 6.1 MCP Server Registration

Users/admins with permission SHALL be able to add MCP servers from:
- manual configuration
- official/public MCP registries
- approved custom registries
- plugin installation
- admin-provisioned catalog entries
- Runner/local definitions

Required metadata:
- server ID
- name
- description
- source type
- transport
- endpoint / startup command
- execution location
- auth type
- tenant ownership
- user ownership where applicable
- enabled status
- quarantine status
- health status
- last discovery timestamp
- created/updated timestamps

### 6.2 Supported Execution Locations

#### Server-executed
For SaaS/cloud-accessible upstreams:
- Streamable HTTP
- HTTP
- OAuth-protected MCP
- compatible remote MCP transports

#### Runner-executed
For local/private resources:
- stdio MCP
- localhost HTTP MCP
- private LAN MCP
- desktop software integrations
- filesystem-local MCP
- FFmpeg / Blender / ComfyUI / private tools


### 6.3 Ownership and Scope Model

Every MCP server, connection, policy, credential, and tool exposure SHALL resolve to an explicit scope.

Supported scopes:

```text
PLATFORM
TENANT
USER
AGENT
RUNNER
```

Rules:

- `PLATFORM`: catalog templates, global allow/deny policy, shared platform integrations, security baseline.
- `TENANT`: workspace-installed MCP servers, team policies, shared tenant credentials, agent assignments.
- `USER`: personal OAuth/account connections, personal MCP servers when policy permits, personal restrictions.
- `AGENT`: the maximum subset of capabilities a specific agent may discover/execute.
- `RUNNER`: device/local execution availability; never grants user permission by itself.

A connection and a server definition are distinct concepts. Example:

```text
Platform defines GitHub MCP server/template
        -> Tenant enables GitHub MCP
             -> User connects personal GitHub OAuth account
                  -> Developer Agent receives approved subset of tools
```

### 6.4 Actor Responsibilities

#### Platform Admin
May manage:
- registry sources
- platform MCP templates/catalog
- global security policy
- global quarantine policy
- transport allowlist/denylist
- global DLP baseline
- platform health/operations
- cross-tenant aggregate observability subject to privacy controls

#### Tenant Admin / Partner Admin
May manage within own tenant:
- install/enable approved MCP servers
- team and role permissions
- tenant shared credentials
- agent-to-MCP/tool assignments
- tenant-level risk/confirmation policy within platform maximums
- tenant activity and health

#### End User
May manage only permitted personal scope:
- connect/reconnect/revoke own OAuth/account
- enable permitted personal integration
- optionally add personal MCP when tenant/platform policy allows
- tighten own permissions / confirmation preferences
- view own activity
- manage own Runner/device integrations where allowed

End Users MUST NOT gain access to:
- platform registry administration
- tenant-wide credential material
- raw secret/token values
- cross-user activity
- transport/security internals unless explicitly granted an advanced/admin role

#### Agent
An Agent is not an administrative actor. It receives an effective capability set calculated from Platform + Tenant + User + Agent policies.

#### Runner Owner
May control local MCP processes on Runners owned/assigned to them, but only within Platform/Tenant allowed categories and user authorization.

### 6.5 Effective Permission Calculation

Effective permission SHALL be the most restrictive result of all applicable scopes:

```text
Platform Policy
   ∩ Tenant Policy
   ∩ Role Policy
   ∩ User Policy
   ∩ Agent Policy
   ∩ Tool Risk Policy
   ∩ Connection/Auth Readiness
   ∩ Runner Availability (if local)
```

Canonical decisions:

```text
ALLOW
ASK
BLOCK
```

Ordering:

```text
BLOCK > ASK > ALLOW
```

A lower scope MAY tighten access but MUST NOT elevate beyond a parent scope.

### 6.6 Personal MCP Policy

Each tenant SHALL support one of the following modes:

```text
DISABLED
APPROVED_CATALOG_ONLY
REMOTE_MCP_ALLOWED
REMOTE_AND_RUNNER_MCP_ALLOWED
```

Platform policy MAY further restrict available modes.


---


### 6.7 Protocol Baseline, Version Negotiation, and Compatibility

SmartAIHub SHALL treat MCP protocol support as a versioned compatibility contract rather than assuming one wire behavior forever.

**Primary target baseline:** MCP `2026-07-28` or later compatible revisions supported by the selected SDK/runtime.

For the `2026-07-28` generation, the gateway SHALL support the stateless request/response core and SHALL NOT require `initialize` / `initialized` or `Mcp-Session-Id` for compatible upstreams. Each HTTP request SHALL carry the negotiated protocol version and the required routing metadata for the selected revision.

For `2026-07-28` Streamable HTTP requests, validate consistency between:

```text
MCP-Protocol-Version
Mcp-Method
Mcp-Name (when the method addresses a named primitive)
JSON-RPC body method/name
```

A mismatch MUST be rejected and audited as a protocol/security error.

For a `2026-07-28` modern upstream, `server/discover` is a server requirement and SmartAIHub SHOULD use it as the preferred negotiation/probe path. Normal business requests still MUST be independently valid and MUST NOT depend on connection-local initialization state. For compatibility probing, the client MAY fall back to the legacy `initialize` path only through `MCPLegacySessionAdapter`.

Every modern request generated by the gateway MUST construct the revision-required `_meta` envelope from trusted gateway state, including:

```text
io.modelcontextprotocol/protocolVersion
io.modelcontextprotocol/clientCapabilities
io.modelcontextprotocol/clientInfo       # sent when available/recommended; informational only
```

Every modern result MAY contain `io.modelcontextprotocol/serverInfo`; it is display/diagnostic metadata only and MUST NOT drive authorization or trust decisions.

For Streamable HTTP, standard headers and body metadata MUST be generated/validated as one canonical request object rather than independently. When a tool input schema designates parameters for HTTP header mirroring (for example via `x-mcp-header` in the negotiated revision/SDK), the adapter SHALL validate the corresponding `Mcp-Param-*` headers against the body and reject missing/malformed/mismatched values before forwarding. Header-derived values MUST NOT bypass normal argument-schema validation, DLP, or authorization.

Modern Streamable HTTP requests SHALL advertise both `application/json` and `text/event-stream` in `Accept` as required by the transport. The adapter must support either a single JSON response or a request-scoped SSE response for a normal request.

For protocol revision `2026-07-28`, every normal result is interpreted through the `resultType` discriminator:

```text
complete        # ordinary final result
input_required  # MRTR interim result
task            # Tasks extension when negotiated
```

A modern server result that is expected to carry `resultType` but is malformed is a protocol error. Legacy results that predate the discriminator are normalized as `complete` by the legacy adapter. Unknown future discriminator values MUST be preserved/blocked according to negotiated extension support rather than coerced into a known type.

The adapter SHALL map MCP-reserved protocol errors (including header mismatch, missing required client capability, and unsupported protocol version) into stable SmartAIHub error categories while retaining the original safe MCP code for diagnostics. Internal SmartAIHub implementation-defined error codes MUST NOT collide with the MCP reserved range.

Backward compatibility MAY support older MCP revisions through a dedicated compatibility adapter. Older revisions that use initialization/session behavior MUST be isolated from the `2026-07-28` stateless path.

Compatibility rules:
- protocol version is stored per upstream/runtime observation;
- protocol-specific behavior is selected by adapter, not scattered throughout business logic;
- legacy HTTP+SSE is **compatibility-only** and MUST NOT be selected for new installations when Streamable HTTP is available;
- deprecated protocol features MUST NOT be used as new SmartAIHub architectural dependencies;
- unsupported protocol revisions return a normalized `MCP_PROTOCOL_UNSUPPORTED` error with upgrade guidance;
- server/client identity metadata is informational and MUST NOT be trusted for authorization decisions.

Recommended adapter boundary:

```text
MCPProtocolAdapter
  ├── MCP2026StatelessAdapter
  └── MCPLegacySessionAdapter
```


### 6.8 MCP Primitive Coverage and Extension Framework

The External MCP Gateway SHALL manage more than tools. The normalized primitive set SHALL include:

```text
TOOL
RESOURCE
RESOURCE_TEMPLATE
PROMPT
COMPLETION / ARGUMENT_SUGGESTION (when advertised)
EXTENSION_CAPABILITY
```

Control semantics:
- **Tools** are model/automation executable and pass through execution risk policy.
- **Resources** are application-controlled context/data and pass through read/data-access/DLP policy.
- **Prompts** are user-controlled templates/workflows and SHOULD be explicitly selected or invoked by product UX rather than silently injected.
- **Extensions** are opt-in capabilities negotiated per upstream and MUST be allowlisted by SmartAIHub policy before use.

#### Resources

The gateway SHALL support discovery/read of authorized MCP resources and resource templates without automatically copying every upstream resource into RAG.

A resource may be:
- read on demand;
- selected as Chat context;
- optionally indexed into RAG only under an explicit indexing policy that defines tenant scope, freshness, retention, provenance, and deletion behavior.

Resource indexing MUST preserve:
- upstream server ID;
- resource URI;
- tenant/user visibility;
- content hash/version;
- cache/freshness metadata;
- provenance in generated answers.

Binary resources MUST enforce MIME/size policies before ingestion or model exposure.

#### Prompts

Upstream prompts SHALL be cataloged separately from tools. Prompt text SHALL be treated as untrusted external content and MUST NOT override SmartAIHub system/developer policy. Prompt changes SHALL be versioned and may require review when a prompt is exposed to ordinary users or agents.

#### Extensions

The gateway SHALL maintain an extension registry with states:

```text
UNSUPPORTED
DISCOVERED
POLICY_REVIEW
ENABLED
DISABLED
BLOCKED
```

Initial extension policy:
- `io.modelcontextprotocol/tasks`: supported according to Section 6.10.
- MCP Apps/server-rendered UI: disabled by default until sandbox, origin, CSP, capability bridge, and data-sharing policy are satisfied.
- Enterprise-Managed Authorization: supported when enabled by Platform/Tenant policy.
- unknown/experimental extensions: blocked by default unless explicitly allowlisted.

Deprecated features such as Roots, Sampling, and protocol Logging MAY be supported during their compatibility/deprecation window through the protocol path that negotiated them (including modern MRTR forms where defined), but SmartAIHub MUST NOT introduce new architectural dependencies on them. New SmartAIHub design SHALL prefer explicit tool/resource parameters for directory context, direct model-provider integration for model calls, and OpenTelemetry/stderr for observability.


### 6.9 Multi Round-Trip Requests (MRTR) and Input-Required Flow

The gateway SHALL support stateless multi-round-trip interactions where an upstream operation returns an input-required result instead of a final result.

Supported SmartAIHub handling:

```text
MCP request
  -> input_required
  -> normalize requested inputs
  -> policy check
  -> pause orchestration / worker job if durable
  -> render consent/input UI
  -> collect accepted/cancelled response
  -> retry original MCP request with inputResponses + opaque requestState
  -> continue until final result or configured round limit
```

Rules:
- `requestState` is opaque, untrusted upstream data; never parse it for authorization and never log it in full when it may contain sensitive state.
- input schema MUST be validated and bounded before rendering.
- an upstream MAY NOT create an unsolicited user prompt outside an active user/agent initiated request.
- user cancellation MUST terminate the pending round cleanly and be visible in trace/audit.
- default maximum MRTR rounds: 10, configurable with a lower tenant/platform cap.
- repeated identical input requests MAY trigger loop detection and abort.
- destructive confirmations use SmartAIHub's confirmation policy even when the upstream also requests confirmation.
- sampling-style requests from legacy/upstream compatibility MUST route through SmartAIHub Cognitive Executor policy and MUST NOT silently select a model or spend credits without authorization.

Durable MRTR states for long-running flows:

```text
RUNNING
WAITING_FOR_INPUT
RESUMING
COMPLETED
CANCELLED
FAILED
```

For durable executions, the pause/resume token belongs to SmartAIHub's orchestration/job layer; upstream `requestState` remains only an MCP protocol payload.


### 6.9.1 URL / Out-of-Band Elicitation Safety

When a negotiated MCP/MRTR flow asks the user to complete an interaction at an external URL (for example authorization, credential enrollment, payment, or provider-hosted confirmation), SmartAIHub SHALL treat that URL as an untrusted external destination.

Requirements:
- only `https` destinations are allowed by default; localhost exceptions require an explicit local-development policy;
- the UI MUST display the destination origin/provider before navigation and MUST NOT auto-open an untrusted URL;
- the external interaction MUST be bound to the originating tenant, user, connection, orchestration run, upstream server revision, and expiry;
- completion MUST be correlated through an opaque single-use transaction identifier or provider callback, never by trusting browser-returned free-form state;
- SmartAIHub MUST NOT ask the user to paste OAuth authorization codes, passwords, API keys, or other provider credentials into Chat when an out-of-band flow exists;
- URL parameters and callback payloads are redacted from ordinary logs when they may contain secrets or one-time codes;
- redirects are revalidated under the network/redirect policy and cannot change to an unapproved scheme/origin without a new user-visible confirmation;
- abandoned/expired elicitation state is cleaned up and cannot later resume a different execution;
- successful completion re-enters the normal authorization, approval, DLP, and dispatch-time validation path before any side effect is executed.

This UX is an interaction mechanism only; it MUST NOT become a bypass around SmartAIHub connection ownership or execution-bound approval.

### 6.10 MCP Tasks Extension and Long-Running Upstream Work

The gateway SHALL support the `io.modelcontextprotocol/tasks` extension when advertised and permitted.

An upstream may return a task handle instead of the final tool result. SmartAIHub SHALL map this into its existing durable execution model without making the MCP task table a second source of truth.

Canonical mapping:

```text
MCP tools/call
  -> upstream resultType=task
  -> create/update worker_job linkage
  -> persist upstream task handle
  -> poll tasks/get or process supported subscription updates
  -> tasks/update when protocol/extension semantics require client input/state
  -> tasks/cancel on SmartAIHub cancellation when supported
  -> finalize worker_job + capability_call + audit
```

Requirements:
- `worker_jobs` remains SmartAIHub durable execution truth.
- upstream task ID is an external correlation identifier only.
- task polling MUST use backoff/jitter and a maximum lifetime.
- cancellation is best-effort upstream but definitive in SmartAIHub user-facing state; late upstream results MUST NOT resurrect a cancelled SmartAIHub job.
- retry logic MUST avoid unintentionally creating duplicate upstream tasks.
- when an upstream operation supports an idempotency key, propagate a SmartAIHub-generated key.
- otherwise classify the call as retry-safe or retry-unsafe before automatic retry.
- task result artifacts SHALL be uploaded/registered through the existing Library/artifact path rather than embedded indefinitely in MCP activity logs.

### 6.11 Cost, Quota, and Billing Ownership

MCP connectivity does not imply that SmartAIHub pays the upstream service cost. Every installation/connection SHALL declare who owns upstream billing and which quota applies.

Supported billing ownership:

```text
USER_EXTERNAL_ACCOUNT
TENANT_EXTERNAL_ACCOUNT
PLATFORM_FUNDED
NO_DIRECT_UPSTREAM_CHARGE
UNKNOWN_EXTERNAL_COST
```

Rules:
- personal OAuth normally means upstream cost/quota belongs to the user's external account unless explicitly documented otherwise;
- tenant shared credentials normally use tenant-owned external quota;
- platform-funded upstreams MUST pass through the existing SmartAIHub metering/credit policy before use;
- the LLM/agent MUST NOT decide billing ownership;
- a tool with unknown or potentially material external cost MAY require confirmation or policy approval;
- rate-limit/quota exhaustion SHALL be normalized separately from SmartAIHub credit exhaustion;
- UI SHALL clearly distinguish `Uses your connected account`, `Uses workspace account`, and `Uses SmartAIHub credits` where applicable.

Per-call metering SHOULD capture provider-reported usage/cost when available, but absence of cost telemetry MUST NOT be interpreted as zero cost.

Optional cost guardrails SHALL support:
- per-call estimated-cost threshold where estimation is possible;
- per-user / per-tenant daily or monthly external-cost budget for platform-funded/shared accounts;
- soft warning threshold and hard stop threshold;
- separate counters for SmartAIHub credits vs external-provider quota/cost;
- reservation/commit semantics for platform-funded expensive calls when the existing credit system supports reservation;
- reconciliation of estimated vs provider-reported actual cost without double charging.

Unknown-cost tools cannot be represented as `free`; UI/policy uses `Cost unavailable` / `Uses external account` as appropriate.

### 6.12 Change Notifications and `subscriptions/listen`

For modern MCP revisions that advertise change notifications, SmartAIHub SHALL support `subscriptions/listen` for the notification classes it actually consumes. This replaces assumptions that catalog/resource changes will arrive unsolicited.

Supported listener intents include:

```text
toolsListChanged
promptsListChanged
resourcesListChanged
resourceSubscriptions[]
```

Requirements:
- open listeners only for advertised capabilities and approved resource URIs;
- after `notifications/subscriptions/acknowledged`, persist/use only the filter subset the server actually honored; do not assume every requested notification class was accepted;
- notifications delivered on the listener MUST be correlated using `io.modelcontextprotocol/subscriptionId`;
- `notifications/tools/list_changed` invalidates the relevant tool discovery snapshot and schedules bounded refresh;
- prompt/resource list changes invalidate only the affected primitive cache generation;
- `notifications/resources/updated` invalidates/on-demand refreshes the exact authorized resource, and managed-RAG reindex follows the configured indexing policy;
- request-scoped `notifications/progress` / `notifications/message` stay attached to their originating request stream and MUST NOT be confused with catalog subscriptions;
- a closed/broken listener is re-established with backoff/jitter when still desired;
- modern SSE subscription recovery MUST NOT assume resumability via `Last-Event-ID`; after reconnect the gateway re-lists authoritative catalogs/resources as needed before trusting cached state;
- in a horizontally scaled gateway, one instance receiving a notification MUST publish cache-generation invalidation through shared infrastructure so other instances do not continue serving stale capability metadata.

Listener state is optimization/freshness state, not authorization truth. Execution-time policy checks remain mandatory.

### 6.13 Bounded Discovery Pagination

Catalog enumeration (`tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`) SHALL treat cursors and page counts as untrusted upstream input.

Requirements:
- support protocol pagination without assuming cursor format;
- configurable maximum pages/items/bytes per discovery run;
- detect repeated cursor values and abort cursor loops;
- an empty-string cursor is treated according to the negotiated SDK/spec semantics, not automatically as end-of-list unless the protocol implementation defines it so;
- partial enumeration is marked `TRUNCATED`/`INCOMPLETE` and MUST NOT silently replace a previously complete catalog unless policy explicitly accepts it;
- catalog refresh is transactional by generation: publish a new discovery generation only after the bounded enumeration completes successfully;
- cancellation/deadline applies to the entire enumeration, not independently reset forever on each page;
- pagination telemetry records page/item/byte counts to detect abusive servers.

### 6.14 Multi-Step Side Effects and Partial Completion

MCP provides no cross-tool distributed transaction. When an orchestration performs multiple side-effecting calls, SmartAIHub SHALL model each capability call independently and MUST NOT imply all-or-nothing semantics unless the upstream explicitly provides them.

Normalized aggregate outcomes:

```text
COMPLETED
PARTIAL_SUCCESS
FAILED_BEFORE_SIDE_EFFECT
FAILED_AFTER_SIDE_EFFECT
UNKNOWN_OUTCOME
COMPENSATED
COMPENSATION_FAILED
```

Rules:
- persist successful side effects before attempting subsequent steps;
- final UX must identify which actions definitely succeeded, failed, or are unknown;
- automatic compensation is allowed only when an explicitly registered compensation operation is available, policy permits it, and the compensation itself passes permission/risk checks;
- never fabricate rollback by simply retrying an inverse-looking tool;
- destructive or externally billed compensation MAY require separate confirmation;
- LangGraph owns the multi-step plan/compensation decision; the MCP Gateway exposes reliable per-call facts and does not become a second workflow engine.



### 6.15 Canonical Capability Identity, Namespaces, and Confusable Protection

Human-readable MCP server/tool/resource/prompt names are **labels**, not security identities. SmartAIHub SHALL assign stable internal IDs and canonical capability addresses so two upstreams, installations, revisions, or Unicode-confusable names cannot collide.

Canonical identity SHALL bind at minimum:

```text
capability_id
primitive_type
mcp_server_id
installation_id
server_revision_id
upstream_primitive_name
```

Recommended canonical address for logs/debugging (not required as a public URL):

```text
mcp-capability://{installation_id}/{server_revision_id}/{primitive_type}/{percent-encoded-upstream-name}
```

Rules:
- authorization, approval, idempotency, audit, cache keys, and execution routing MUST use stable IDs, never display names alone;
- `normalized_name` is search metadata only and MUST NOT become a unique security key;
- upstream names SHALL be length-bounded, Unicode-normalized, and inspected for control characters, bidi controls, invisible separators, and common confusable/homograph patterns before display/indexing;
- UI SHALL render publisher/server identity next to ambiguous or high-risk primitive names;
- duplicate display names are allowed only when disambiguated by server/installation; duplicate stable identities are not;
- a rename creates a catalog change on the same upstream primitive only when the adapter can prove continuity; otherwise treat it as remove + add and require normal review;
- aliases created for backward compatibility MUST resolve to exactly one canonical ID and MUST NOT bypass quarantine or approval state.

### 6.16 End-to-End Deadline and Cancellation Budget

Every interactive or queued MCP execution SHALL carry one end-to-end deadline/cancellation budget from ingress through LangGraph, Capability Gateway, MCP Gateway, Runner, and upstream request. Individual retry/queue/poll timeouts MUST consume the remaining budget rather than resetting an unlimited timeout at every layer.

Required fields in execution context:

```text
deadline_at
request_started_at
queue_budget_ms
upstream_budget_ms
cancellation_token / cancellation_state
```

Rules:
- expired work MUST NOT be dispatched;
- task polling and MRTR waiting may transition to durable state, but each active network attempt remains bounded;
- user cancellation propagates best-effort to upstream/Runner while preserving `UNKNOWN_OUTCOME` semantics when side effects may already have occurred;
- retry policy considers remaining deadline before scheduling another attempt;
- UI shows timeout/deadline failure differently from policy denial or upstream rejection.


### 6.17 Protocol Version Floor and Downgrade Protection

Automatic compatibility fallback MUST NOT become a protocol downgrade attack. Each installation SHALL have an explicit protocol policy derived from Platform/Tenant policy and the pinned runtime revision.

Logical policy fields:

```text
preferred_protocol_version
minimum_protocol_version
allowed_protocol_versions[]
legacy_fallback_allowed
last_successful_protocol_version
last_successful_adapter
downgrade_review_required
```

Rules:
- protocol versions are compared against an explicit supported-version ordering table, never arbitrary string comparison;
- a newly installed upstream MAY probe/fallback only within the allowed version set;
- an installation that previously succeeded on `2026-07-28` or later MUST NOT silently fall back to a legacy/session adapter after a later probe failure when WRITE/DESTRUCTIVE/PRIVILEGED capability may be exposed;
- a material downgrade creates `MCP_PROTOCOL_DOWNGRADE_REVIEW`, removes high-risk capabilities from execution eligibility, and requires an administrator-approved compatibility exception when policy allows legacy use;
- protocol downgrade/fallback events are audited with old/new version, adapter, server revision, reason, and actor;
- SDK defaults that automatically fall back to older revisions MUST be wrapped by this policy rather than allowed to choose compatibility behavior invisibly;
- a later protocol upgrade follows normal revision/conformance/canary rules and does not inherit approval when executable semantics materially change.

### 6.18 Completion / Argument-Suggestion Governance

When an upstream advertises MCP completion support (for example `completion/complete` for a prompt or resource-template reference), SmartAIHub SHALL treat completion as a bounded convenience/read operation, not as an executable capability or authorization oracle.

Requirements:
- the referenced prompt/resource/template MUST already be visible to the caller under current tenant/user policy;
- completion requests are bound to installation, connection/principal, server revision, protocol version, referenced object, and argument context;
- completion output is untrusted suggestion data and MUST NOT automatically trigger tool execution, account selection, permission elevation, or secret insertion;
- values/count/bytes/latency are bounded and excessive suggestions are truncated/rejected safely;
- completion caches, if used, follow the same principal/cache-scope isolation as the referenced primitive;
- sensitive arguments and secret-like completion values are redacted from telemetry and are not persisted unless explicitly required by product UX;
- completion may be surfaced to a user input control, but SHOULD NOT be exposed to the LLM as a general-purpose tool unless a product-specific design requires it;
- completion failures never make the underlying prompt/resource inaccessible if that primitive otherwise remains valid.

### 6.19 Progress and Cancellation Normalization

The Gateway SHALL normalize request-scoped progress and cancellation semantics across MCP protocol adapters, Tasks, `worker_jobs`, Runner execution, and UI.

Progress rules:
- `progressToken` is opaque/request-scoped and MUST NOT be used as authorization, idempotency, tenant, or capability identity;
- progress events are rate-limited/coalesced and bounded to prevent telemetry/UI amplification;
- progress is advisory and MAY be non-monotonic unless the upstream contract explicitly guarantees monotonic units;
- late progress after terminal state is ignored/audited, not allowed to reopen a completed/cancelled job;
- progress payload text is untrusted external data and follows sanitization/redaction rules.

Cancellation rules:
- cancelling a not-yet-dispatched queued operation removes it atomically where possible;
- cancelling an in-flight modern MCP request stops SmartAIHub waiting and the modern adapter MUST ignore/discard a late response when the protocol requires no further response after cancellation;
- cancellation does not imply that an upstream side effect was rolled back; a WRITE/DESTRUCTIVE request that may already have crossed the dispatch boundary becomes `UNKNOWN_OUTCOME` unless the upstream/task contract proves cancellation before side effect;
- `tasks/cancel`, Runner cancellation, and `worker_jobs` cancellation are mapped to one SmartAIHub state model without claiming stronger guarantees than the underlying execution system provides;
- a cancellation race with terminal success/failure is resolved through one atomic terminal-state transition and preserved in audit.

### 6.20 Forward Compatibility and Unknown-Field / Extension Handling

SmartAIHub SHALL distinguish **unknown-but-preservable** protocol data from **unknown-and-security-relevant** behavior so future MCP revisions/extensions do not cause silent data loss or accidental privilege expansion.

Rules:
- unknown JSON object fields in otherwise valid MCP structures SHOULD be preserved in raw protocol evidence and MAY be round-tripped when the selected SDK/adapter supports it;
- unknown optional `_meta` keys MAY be preserved but MUST NOT be promoted into authorization, routing, billing, or trust decisions until explicitly understood;
- unknown extension identifiers are `UNSUPPORTED_EXTENSION` unless an allowlisted generic pass-through policy exists for that extension namespace;
- an unknown enum/value that changes execution semantics, risk, auth scope, transport, cache scope, or result type MUST fail closed rather than be coerced to a known value;
- unknown non-security enum/value used only for display MAY be rendered as `Unknown (<raw>)` without breaking the record;
- adapters MUST NOT strip unknown fields before immutable protocol/audit capture if those fields may be needed for future forensic analysis;
- version adapters/upcasters MUST be deterministic and covered by corpus tests so replay of historical events yields the same normalized representation;
- a later protocol revision is not automatically considered backward-compatible merely because parsing succeeds.

The UI SHALL surface `Unsupported protocol feature` / `Review required` rather than silently disabling or misinterpreting a capability.


### 6.21 Canonical Security Serialization and Hash-Version Contract

Any digest that influences authorization, approval, idempotency, replay detection, cache identity, effect reconciliation, or audit evidence SHALL be computed from a versioned canonical serialization, not from incidental JSON/library formatting.

Required properties:
- object-key ordering, number representation, Unicode handling, null/absent-field semantics, and byte encoding are deterministic across Python/Go/TypeScript/Rust implementations;
- SmartAIHub SHOULD use RFC 8785 JSON Canonicalization Scheme (JCS) for JSON-compatible structures unless a domain-specific canonical format is explicitly versioned and tested;
- security-relevant strings are preserved exactly after the documented Unicode-normalization policy; display normalization is not allowed to mutate the value being authorized;
- floating-point values that cannot be represented safely under the selected canonical scheme MUST be rejected or normalized through a documented typed representation before hashing;
- hashes SHALL include a `canonicalization_version` / `binding_version` so future canonicalization changes do not reinterpret existing approval receipts or execution intents;
- adapters in different languages MUST pass the same golden canonicalization vectors;
- a hash mismatch between UI preview, Gateway, Runner, or reconciliation service is a security failure and MUST NOT fall back to raw/non-canonical comparison;
- canonical serialization used for approvals MUST distinguish omitted fields from explicit values whenever the upstream schema gives them different semantics.

Recommended binding prefix:

```text
smartaihub:mcp-binding:v1:<sha256(canonical_bytes)>
```

Historical receipts retain the canonicalization version that created them.

### 6.22 Resource-Template and Prompt-Argument Expansion Safety

Resource templates, prompt arguments, completion suggestions, and URI-template expansion SHALL be treated as untrusted parameterized operations rather than harmless string substitution.

Rules:
- template arguments are schema/length/type validated before expansion;
- percent-encoding and URI normalization occur exactly once according to the selected template/URI rules; double-decode/double-encode ambiguity is rejected;
- expanded URIs re-enter endpoint/resource URI scheme, SSRF, tenant, DLP, and authorization policy checks after expansion;
- a template approved for one URI host/path pattern does not authorize arbitrary hosts or path traversal introduced through arguments;
- secrets MUST NOT be inserted into a URI/query/path merely because an upstream completion suggestion proposed them;
- prompt arguments remain data; expansion cannot create system/developer instructions or elevate trust;
- UI completion/autofill clearly marks upstream-suggested values and does not auto-submit high-risk values;
- template expansion failures produce typed validation/policy errors and are not retried with weaker escaping.

### 6.23 Upstream Fleet Consistency and Catalog-Flapping Detection

A single remote MCP endpoint may front multiple server instances. SmartAIHub SHALL detect materially inconsistent server/catalog behavior rather than silently merging whichever instance answered last.

For the same approved installation + immutable runtime revision, the gateway SHOULD compare sampled observations of:
- `serverInfo` / declared protocol and extensions;
- primitive names and schema/content hashes;
- auth/resource identity;
- material risk annotations;
- result/cache metadata relevant to execution semantics.

If observations oscillate across incompatible generations without an approved rollout:
- mark the installation/revision `INCONSISTENT_UPSTREAM` or equivalent degraded state;
- stop automatic approval inheritance for changed primitives;
- suspend WRITE/DESTRUCTIVE/PRIVILEGED execution when the inconsistency could alter side-effect semantics;
- retain the last complete trusted generation rather than merging partial catalogs from different instances;
- surface instance/fingerprint evidence to operators without leaking secrets;
- allow a declared staged rollout only when the rollout policy defines compatible generations and bounded convergence time.

Catalog-flapping telemetry MUST be rate-bounded so a malicious upstream cannot create unbounded snapshots/audit volume.
### 6.24 Discovery Cardinality, Catalog Budget, and Incomplete-Catalog Semantics

Bounded pagination is necessary but insufficient when an upstream legitimately or maliciously exposes an enormous number of tools/resources/prompts. SmartAIHub SHALL enforce a total discovery budget per server revision and primitive type.

The budget SHALL be configurable by Platform policy and MAY differ for trusted registries versus untrusted/custom servers. At minimum it SHALL bound:
- maximum primitive entries discovered per revision;
- maximum cumulative schema/description bytes;
- maximum pages/cursors followed;
- maximum discovery wall-clock/deadline budget;
- maximum index/vectorization work admitted from one discovery generation.

If the budget is exhausted before discovery completes:
- mark the primitive catalog `INCOMPLETE_BUDGET_LIMIT` rather than pretending it is complete;
- persist the last cursor/continuation metadata only as diagnostic data, never as an authorization bypass;
- do not delete previously known primitives merely because an incomplete refresh did not reach them;
- WRITE/DESTRUCTIVE/PRIVILEGED capabilities newly observed only in an incomplete generation remain non-executable until their revision is reviewed/approved under normal policy;
- capability search SHALL expose catalog completeness/freshness to ranking and operator diagnostics;
- an Admin may raise the budget only through governed policy, with impact preview and audit.

A malicious upstream MUST NOT be able to force unbounded DB rows, embeddings, snapshots, audit events, or Runner work by returning an effectively infinite catalog.



### 6.25 JSON-RPC / MCP Request-ID and Correlation Isolation

External protocol identifiers are untrusted correlation values, not authorization or idempotency identities. SmartAIHub SHALL separate:

```text
external_jsonrpc_id        # opaque upstream/downstream protocol value
mcp_request_id             # SmartAIHub request-scoped internal identifier
execution_intent_id        # durable side-effect / replay identity
trace_id                   # observability correlation
attempt_id                 # retry-lineage identity
```

Rules:
- client/upstream JSON-RPC IDs MUST NOT be used directly as database primary keys, trace IDs, approval IDs, cache keys, idempotency keys, or `execution_intent_id`;
- adapters MUST maintain a bounded request-local mapping between SmartAIHub IDs and external JSON-RPC IDs and reject ambiguous/colliding mappings within one active request domain;
- reused JSON-RPC IDs across independent stateless requests are permitted by compatibility logic only when the mapping domain makes them unambiguous;
- externally supplied correlation/trace headers are sanitized and, when retained, stored only as untrusted peer metadata; they cannot replace the SmartAIHub-generated trace identity;
- error/log output MUST distinguish the safe external protocol ID from internal trace/execution identifiers without exposing hidden tenant/user correlation data;
- parser/fuzz tests cover integer/string/null-like IDs, very large IDs, Unicode strings, repeated IDs, and malicious values intended to collide with internal identifiers.


### 6.26 Strict JSON Parsing, Duplicate-Key Rejection, and Numeric Interoperability

Canonical hashing is only safe if every implementation parses the same input into the same logical value. SmartAIHub SHALL define a strict JSON profile for security-relevant MCP payloads, schemas, approval bindings, execution intents, cached descriptors, and control-plane events.

Requirements:
- duplicate object member names are rejected before canonicalization; `last key wins` / `first key wins` parser differences are forbidden;
- invalid UTF-8, unpaired surrogate code points, control-character ambiguity, and malformed escape sequences fail closed;
- non-JSON numeric values such as `NaN` and `Infinity` are rejected;
- integer values whose exact meaning cannot be preserved across active Python/Go/TypeScript/Rust implementations MUST use a documented exact representation (for example bounded integer range or decimal-string typed field) instead of relying on lossy IEEE-754 conversion;
- negative zero, exponent forms, and alternate lexical encodings normalize according to the pinned canonicalization profile and MUST have golden vectors;
- parser depth/object-member/string/number-length limits apply before canonicalization to prevent parser/canonicalizer resource exhaustion;
- schema parsers MUST NOT silently coerce a string to number/boolean or otherwise change the value being approved/executed unless the specific adapter contract explicitly defines that coercion and the canonical effective value is shown to the approval layer;
- canonicalization/version migration cannot reinterpret an already-issued approval/effect/idempotency receipt.

Golden conformance vectors SHALL include duplicate keys, large integers, exponent notation, `-0`, escaped Unicode, combining characters, malformed UTF-8, deep nesting, and mixed-language parser round-trips.


### 6.27 Upstream Task-Handle Confidentiality, Binding, and Non-Enumeration

Upstream MCP task identifiers MAY behave as bearer references to stored execution state. SmartAIHub SHALL therefore treat task handles as protected correlation material rather than harmless display IDs.

Requirements:
- upstream task IDs MUST be scoped to the exact server revision, installation, connection/account, tenant, and originating capability call that created them;
- task IDs MUST NOT be exposed in ordinary Chat/UI, analytics, URLs, or client-side storage unless a protocol/debug surface explicitly requires it;
- if an upstream task ID is guessable or enumerable, SmartAIHub MUST NOT rely on obscurity for authorization; every `tasks/get`, `tasks/update`, and `tasks/cancel` call reuses the bound connection and SmartAIHub authorization context;
- SmartAIHub MUST NOT implement `tasks/list`-style enumeration unless a future negotiated protocol explicitly defines a safe scoped primitive;
- persisted task handles are encrypted or otherwise protected at rest when the upstream treats them as bearer-like state references;
- task-handle reuse against a different tenant/account/revision/capability call is rejected before network dispatch;
- task expiry/retention is explicit; an expired handle is never silently recreated by repeating the original side-effecting call;
- logs show an internal task reference or redacted fingerprint, not the raw upstream handle;
- task notifications received through subscriptions are accepted only when they bind to an already-authorized tracked task.

### 6.28 Subscription Stream Lease, Acknowledgement, Deduplication, and Reconciliation

`subscriptions/listen` is a long-lived request and therefore needs an explicit lifecycle independent of ordinary request timeout handling.

Requirements:
- a listener is not considered ACTIVE until the first `notifications/subscriptions/acknowledged` message is received and validated against the requested/advertised filter;
- acknowledgement has a bounded timeout; failure to acknowledge causes reconnect/backoff and does not leave a phantom active subscription row;
- stream lifetime is bounded/configurable so load balancers, runtimes, certificate rotation, and deploys can recycle listeners predictably;
- reconnect uses a new listener identity and does not assume delivery replay unless the negotiated protocol explicitly guarantees it;
- notification processing is idempotent: duplicate `list_changed`, resource-update, or task-status notifications cannot cause unbounded refresh/reindex work;
- each accepted notification records source revision/connection/subscription identity plus a local receive sequence/fingerprint sufficient for duplicate suppression and incident analysis;
- when duplicate listeners briefly overlap during rolling reconnect, shared invalidation/coalescing ensures one logical refresh wave per affected generation;
- a listener that exceeds notification-rate/cardinality budgets is throttled/closed and followed by authoritative bounded re-list/reconciliation rather than trusting an event flood;
- listener shutdown during drain is graceful and observable; a replacement listener becomes authoritative only after acknowledgement.

### 6.29 Runtime Result Conformance, Output-Schema Drift, and Result-Type Validation

Discovery-time schema approval is not sufficient. Every runtime response SHALL be validated against the negotiated MCP result shape and, when declared, the approved output schema for the exact revision.

Requirements:
- protocol-level `resultType`, content blocks, task/MRTR discriminators, and reserved error/result shapes are validated before downstream use;
- if an MCP tool declares an output schema, SmartAIHub validates the runtime result against the approved schema version before treating it as structured trusted output;
- additional/unknown fields follow the negotiated forward-compatibility policy but never silently become authorization/routing metadata;
- material runtime schema mismatch increments a drift signal and MAY move the tool/revision to `DEGRADED` or `REVIEW_REQUIRED` according to policy;
- repeated output-contract mismatch cannot be hidden by model-side coercion or automatic JSON repair;
- raw upstream evidence MAY be retained in protected diagnostics, while the user/model receives only validated/sanitized projections;
- schema validation has depth/size/reference budgets and cannot become a resource-exhaustion vector;
- high-risk WRITE/DESTRUCTIVE operations that return malformed/ambiguous success data are finalized as `UNKNOWN_OUTCOME` unless independent effect verification proves the side effect;
- output drift is tracked separately from input-schema drift so operators can identify servers that accept stable inputs but change returned semantics.

### 6.30 External Usage Ledger and Post-Hoc Cost Reconciliation

For upstreams that report usage/cost asynchronously or bill after execution, SmartAIHub SHALL separate admission-time budget reservation from post-hoc provider usage reconciliation.

Requirements:
- reservation/settlement records link to `execution_intent_id`, tenant/user/account/credential, upstream provider, capability, and billing owner;
- provider-reported usage received after execution can adjust estimated cost without changing authorization history or replaying the capability;
- duplicate provider usage events/invoices are deduplicated by provider usage identity where available;
- credits/refunds/reversals are represented explicitly instead of mutating historical usage rows invisibly;
- unknown or delayed provider cost remains `PENDING/UNRECONCILED`, not zero;
- platform-funded charge reconciliation integrates with the existing SmartAIHub credit/accounting source of truth rather than creating a second balance ledger;
- external-user/tenant-account charges can be shown for observability without SmartAIHub falsely claiming to be the provider invoice of record;
- reconciliation failures surface to operators and do not retroactively re-authorize a call that would have failed current budget policy.


### 6.31 Actual Wire-Revision Attestation and SDK Opt-In Verification

Configured SDK/package version is not sufficient evidence that the adapter is actually speaking the intended MCP revision. SmartAIHub SHALL verify the **observed wire behavior** of every production protocol adapter.

Requirements:
- each adapter declares `expected_protocol_revision`, SDK/runtime name/version, transport mode, and expected modern/legacy wire era;
- CI and startup/readiness conformance probes SHALL capture or inspect a safe golden request/response path and verify the actual `MCP-Protocol-Version`, required `Mcp-Method`/`Mcp-Name` behavior, `_meta` envelope shape, and result discrimination expected by the configured profile;
- a runtime configured for `2026-07-28` that actually emits handshake-era/session-era traffic is `NOT_READY` rather than silently accepted;
- SDK upgrades, adapter changes, sidecar upgrades, and protocol-profile changes invalidate the previous wire attestation and require re-verification;
- production readiness SHALL expose configured revision versus last verified wire revision and attestation timestamp/digest;
- wire attestation is protocol conformance evidence only; it does not authorize an upstream server or capability.

This specifically prevents a modern-looking SDK dependency from masking an older default wire mode.

### 6.32 Tool Task-Support Declaration and Tasks-Extension Compatibility

Task-augmented execution SHALL honor both the negotiated Tasks extension and the tool's declared execution support.

For each tool revision, normalize `execution.taskSupport` where available:

```text
FORBIDDEN   # tool must complete synchronously/MRTR; task result is a contract violation
OPTIONAL    # server may return resultType=task when Tasks extension was negotiated
REQUIRED    # tool is unavailable unless the caller/runtime can support the pinned Tasks extension
UNKNOWN     # legacy/unsupported metadata; policy chooses conservative compatibility behavior
```

Rules:
- receiving `resultType=task` from a tool declared `FORBIDDEN` is a runtime contract violation and drift signal;
- a `REQUIRED` task tool MUST NOT be exposed as executable to a caller that cannot support the pinned Tasks extension/profile;
- `OPTIONAL` MUST NOT be interpreted as permission to force asynchronous execution client-side; task creation remains server-directed;
- SmartAIHub SHALL NOT invent `tasks/list` enumeration; only tracked, authorized task handles may be retrieved/updated/cancelled;
- Tasks extension compatibility/maturity is pinned independently from the core MCP revision;
- task notifications, polling, MRTR and `worker_jobs` mapping retain the existing authorization, fencing and `UNKNOWN_OUTCOME` rules.

### 6.33 Subscription Notifications Are Level-Triggered Invalidation Signals

Modern `subscriptions/listen` notifications SHALL be treated as **change/invalidation signals**, not as a lossless ordered event log.

Requirements:
- the first accepted stream message must acknowledge the honored notification subset before that listener becomes authoritative;
- notification frames are correlated to the active subscription identity but are not used as an exactly-once business ledger;
- `toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, resource updates and task notifications trigger bounded authoritative re-fetch/reconciliation of the relevant state;
- missed, duplicated, reordered, coalesced or overlapping notifications MUST converge through re-list/re-read logic rather than event replay assumptions;
- internal audit/control events continue to use SmartAIHub's own durable sequencing; MCP notifications never substitute for `mcp_control_events`/audit truth;
- reconnect begins from current authoritative upstream state unless a future negotiated extension explicitly guarantees replay semantics.

### 6.34 MRTR Sensitive-Input Classification and Secure Input Channel

`input_required` does not imply that every requested field is safe to collect through Chat or expose to the model. SmartAIHub SHALL classify MRTR input requests before rendering or returning `inputResponses`.

Input classes:

```text
NORMAL_USER_INPUT       # ordinary text/choice/form data
SENSITIVE_PERSONAL      # protected/private data requiring purpose disclosure and bounded retention
AUTH_SECRET             # password, API key, refresh token, recovery secret, private key material
ONE_TIME_SECRET         # OTP, MFA code, short-lived verification code
PAYMENT_OR_FINANCIAL    # payment/account data requiring a separately approved flow
UNSUPPORTED_SENSITIVE   # cannot be safely collected by the available client surface
```

Rules:
- `AUTH_SECRET` and equivalent credential material SHOULD use OAuth, Secret Manager, provider-hosted secure enrollment, or a dedicated protected form; they MUST NOT be placed into model context or ordinary chat history;
- generic upstream labels/descriptions cannot override SmartAIHub sensitive-field detection/policy;
- one-time secrets are masked, short-lived, excluded from RAG/audit payloads, and destroyed after the bounded transaction where policy permits;
- if a request cannot be rendered without exposing prohibited secret material to the model/browser surface, return `MCP_SECURE_INPUT_REQUIRED` or block it rather than degrading to plain chat input;
- `inputResponses` are bound to the exact execution/request-state generation and are revalidated on resume.

### 6.35 Per-Request Capability Advertisement Integrity and Least Capability

For stateless MCP, client capabilities are request-scoped protocol claims. SmartAIHub SHALL construct them from the **actual runtime support needed for that request**, not from a platform-wide superset.

Requirements:
- advertised core/extension capabilities are derived from the selected adapter/runtime feature profile, current policy, execution mode, and request needs;
- a request SHALL NOT advertise Tasks, Apps, EMA, MRTR-related support, subscription behavior, or another extension simply because some other SmartAIHub runtime supports it;
- capability advertisement does not grant user permission and MUST remain independent from tool authorization decisions;
- callers cannot inject arbitrary capability claims through tool arguments, custom headers, or page/chat context;
- capability changes between retries/resume are generation-bound; material changes require compatibility/revalidation rather than silent continuation;
- capability payloads disclose no more tenant/user implementation detail than the protocol requires.

### 6.36 Extension Lifecycle, Version, and Maturity Governance

Core protocol version and extension version/maturity are separate compatibility axes. SmartAIHub SHALL maintain an allowlisted extension profile for every extension it uses.

Extension profile fields include:
- namespace/identifier;
- pinned specification/schema version or immutable source revision where the extension has no final version tag;
- lifecycle status: `STABLE | DRAFT | EXPERIMENTAL | DEPRECATED | REMOVED`;
- supported adapters/runtimes;
- required policy/security review;
- rollout feature flag and tenant eligibility;
- migration/deprecation deadline where applicable.

Production defaults:
- `STABLE` extensions may be enabled according to normal policy;
- `DRAFT`/`EXPERIMENTAL` extensions require explicit Platform enablement, pinned test vectors, rollback plan and tenant-visible status where material;
- core MCP `2026-07-28` support MUST NOT be interpreted as automatic support for every extension published alongside it;
- extension upgrade changes invalidate relevant conformance attestations, tool projections and cached compatibility decisions.

### 6.37 Wire-Metadata Preservation Across SDK Abstraction Layers

Official SDKs may consume or hide wire-only protocol members from ordinary typed application objects. SmartAIHub adapters SHALL preserve the wire metadata required for gateway correctness even when the high-level SDK API omits it.

At minimum, adapter conformance SHALL verify access to or correct handling of:
- `MCP-Protocol-Version` and modern routing headers;
- request `_meta` protocol/capability envelope;
- response `io.modelcontextprotocol/serverInfo` for display/diagnostics only;
- `resultType` discrimination before application-level result delivery;
- `server/discover` cache hints such as `ttlMs` / `cacheScope`;
- subscription identity/acknowledgement metadata;
- MRTR retry fields required for exact protocol continuation.

Rules:
- if an SDK intentionally strips a member after internally handling it, SmartAIHub MAY consume the SDK's normalized behavior instead of raw frames, but conformance tests MUST prove equivalent semantics;
- absent/malformed cache hints SHALL fall back to conservative no-cache/private semantics, never a broader cache scope;
- SDK abstraction behavior is version-pinned and re-tested on upgrade.

### 6.38 Runtime/Adapter Feature Attestation Matrix

SmartAIHub SHALL maintain a machine-readable feature matrix for every MCP implementation path (server gateway, Python service, Go sidecar/Runner, other SDK/runtime).

Each row records whether the deployed runtime has been verified for:
- core protocol revision/era;
- tools/resources/prompts primitives;
- `server/discover`;
- MRTR/input-required;
- `subscriptions/listen` and notification subsets;
- Tasks extension operations actually used;
- OAuth/CIMD/EMA behavior where applicable;
- MCP Apps or other enabled extensions;
- schema dialect/validation behavior;
- cancellation/progress semantics.

An installation/capability requiring a feature not attested on the selected execution path is `UNAVAILABLE/INCOMPATIBLE`, not best-effort. Feature attestation MUST be derived from conformance tests and runtime evidence, not package version strings alone.

### 6.39 General Opaque State-Handle Protection

The stateless protocol allows applications to carry explicit state handles between calls. Such handles may be bearer-like even when they are not formal Tasks handles. SmartAIHub SHALL treat opaque continuation/state handles conservatively.

Requirements:
- state handles returned by a trusted/approved capability may be classified as `OPAQUE_STATE_HANDLE` when they are intended for later calls and their secrecy semantics are unknown;
- raw handles are bound to upstream server/revision, installation, connection/account, tenant/user scope, execution lineage and expiry where known;
- prefer an internal surrogate/reference in model/UI/audit surfaces and substitute the raw handle only at the execution boundary when the model does not need its literal value;
- raw handles are excluded from RAG, analytics/session replay, ordinary logs and unrelated downstream capabilities;
- cross-account/tenant/revision reuse is rejected;
- handle loss/expiry yields an explicit stale-state error; SmartAIHub does not recreate state by blindly replaying a prior side effect.

This general rule complements the stricter Tasks-handle and MRTR `requestState` contracts.

### 6.40 Protocol Feature Deprecation Inventory and Compatibility Calendar

SmartAIHub SHALL operationalize MCP's feature lifecycle/deprecation policy instead of relying on release-note memory.

Maintain an inventory of protocol features/transports used by each server/installation/adapter with:
- protocol era/revision;
- feature/transport name;
- lifecycle status (`ACTIVE | DEPRECATED | REMOVAL_SCHEDULED | REMOVED`);
- upstream deprecation source/date;
- earliest supported removal date where published;
- SmartAIHub migration target/deadline;
- dependent installations/workflows/Agents/Runners;
- compatibility owner and rollout status.

Rules:
- new SmartAIHub features SHALL NOT introduce fresh dependencies on protocol features already deprecated by the pinned baseline unless an explicit legacy exception exists;
- legacy HTTP+SSE, Roots, Sampling, and protocol Logging remain compatibility-only under the `2026-07-28` deprecation policy and are visible in migration inventory;
- CI/release gates warn before internal support deadlines and fail once a configured dependency is no longer supported by the approved protocol profile;
- protocol deprecation is distinct from SmartAIHub capability retirement but dependency impact is linked through the existing capability graph.


## 7. Data Model

### Data Model Identity Semantics

The data model distinguishes three identities:

```text
mcp_server        = reusable integration/server definition and provenance
mcp_installation  = activation/configuration of that definition in a TENANT or USER scope
mcp_connection    = concrete authenticated/runtime connection used by a principal for that installation
```

Examples:
- a Platform GitHub MCP catalog definition may have many tenant installations;
- a tenant-owned custom MCP definition normally has a tenant installation;
- a user-owned custom MCP definition normally has a user installation;
- one installation may have multiple personal account connections when policy allows.

Policies, billing owner, effective configuration, and selected revision are installation-context facts. Authentication/account identity is a connection-context fact. Tool/resource/prompt schemas are server-revision facts. Implementations MUST NOT infer installation or tenant solely from `mcp_server_id`.

### 7.1 `mcp_servers`

```text
id
scope_type                 # PLATFORM | TENANT | USER
scope_id nullable           # null only for platform-wide definition
tenant_id nullable
owner_user_id nullable
name
slug
description
source_type
transport
execution_location
endpoint nullable                    # original safe endpoint value
canonical_endpoint nullable          # normalized security/routing form
startup_command nullable
startup_args_json nullable
working_directory nullable
auth_type
visibility                  # private | tenant | platform_catalog
enabled
quarantine_status
health_status
risk_tier
registry_source nullable
registry_package_id nullable
created_by
last_health_check_at
last_tool_discovery_at
created_at
updated_at
```

Constraints:
- `USER` scoped servers require `owner_user_id`.
- `TENANT` scoped servers require `tenant_id`.
- `PLATFORM` catalog templates MAY have no direct runtime connection.
- secret values MUST NOT be stored in endpoint/startup metadata.

### 7.2 `mcp_connections`

```text
id
mcp_server_id
mcp_installation_id
tenant_id nullable
principal_type
principal_id
credential_profile_id nullable
runner_id nullable
external_account_subject_hash nullable
external_account_display_label nullable
is_default_for_scope
connection_status
last_connected_at
last_error_code nullable
last_error_message nullable
metadata_json
created_at
updated_at
```

Connection constraints:
- `mcp_installation_id` is required for executable tenant/user installations;
- tenant/user scope MUST be consistent with the referenced installation;
- at most one `is_default_for_scope=true` connection is allowed for the same installation + principal + resolution scope;
- a connection cannot reference a credential profile owned by another tenant/user scope;
- disabling an installation makes all of its connections ineligible without deleting historical activity.

### 7.3 `mcp_tools`

```text
id
mcp_server_id
server_revision_id
tool_name
normalized_name                      # search-only normalization
canonical_capability_address
identity_hash
description
input_schema_json
output_schema_json nullable
task_support_declared        # forbidden | optional | required | unknown
task_extension_profile_id nullable
schema_hash
description_hash
tool_version nullable
risk_level
declared_read_only nullable              # untrusted upstream hint only
declared_destructive nullable            # untrusted upstream hint only
declared_idempotent nullable             # untrusted upstream hint only
declared_open_world nullable             # untrusted upstream hint only
trusted_risk_source                     # SMARTAIHUB_POLICY | REVIEW | VERIFIED_PROVIDER
enabled
approval_status
quarantine_reason nullable
last_discovered_at
last_changed_at nullable
capability_id
created_at
updated_at
```

### 7.4 `mcp_tool_approvals`

```text
id
mcp_tool_id
schema_hash
decision
approved_by
approved_at
reason
scope
expires_at nullable
```

### 7.5 `mcp_credentials`

```text
id
tenant_id
principal_type
principal_id
mcp_server_id
mcp_installation_id nullable
auth_type
encrypted_secret_ref
secret_generation nullable
residency_region nullable
oauth_provider nullable
scopes_json
expires_at nullable
refreshable
sender_constraint_type nullable         # NONE | MTLS | DPOP | PROVIDER_BOUND_KEY | OTHER
sender_constraint_key_ref nullable      # Secret/KMS ref only; never raw key material
sender_constraint_generation nullable
created_at
updated_at
```

No plaintext secret SHALL be stored in ordinary application tables.

### 7.6 `mcp_activity_logs`

```text
id
trace_id
chat_run_id nullable
orchestration_run_id nullable
agent_run_id nullable
capability_call_id nullable
worker_job_id nullable
mcp_server_id
mcp_installation_id nullable
mcp_connection_id nullable
mcp_tool_id
principal_id
tenant_id
risk_level
request_summary_json
response_summary_json
status
duration_ms
previous_event_hash nullable
event_hash nullable
created_at
```

Secrets and protected fields MUST be redacted. Integrity/hash fields are optional for deployments using an external immutable audit store, but the deployment MUST document which mechanism provides tamper evidence.


### 7.7 `mcp_policy_rules`

```text
id
scope_type                  # PLATFORM | TENANT | ROLE | USER | AGENT
scope_id
mcp_installation_id nullable
mcp_server_id nullable
mcp_tool_id nullable
risk_level nullable
decision                    # ALLOW | ASK | BLOCK
conditions_json nullable
created_by
created_at
updated_at
```

### 7.8 `mcp_agent_bindings`

```text
id
tenant_id
agent_id
mcp_installation_id nullable
mcp_server_id
mcp_tool_id nullable
decision                    # ALLOW | ASK | BLOCK
created_by
created_at
updated_at
```

### 7.9 `mcp_user_preferences`

```text
id
user_id
tenant_id
mcp_installation_id nullable
mcp_server_id
mcp_tool_id nullable
decision                    # ALLOW | ASK | BLOCK
notification_preferences_json nullable
created_at
updated_at
```

A user preference may only make effective policy more restrictive.

### 7.10 `mcp_runner_services`

```text
id
runner_id
mcp_server_id
mcp_installation_id nullable
owner_user_id nullable
process_state
transport
local_endpoint nullable
process_id nullable
version nullable
tool_count
health_status
last_heartbeat_at
last_log_cursor nullable
created_at
updated_at
```

### 7.11 `mcp_registry_sources`

```text
id
name
source_type
base_url nullable
enabled
trust_level
sync_policy_json
last_sync_at nullable
created_by
created_at
updated_at
```

### 7.12 `mcp_installations`

Separates a reusable/catalog server definition from a tenant/user installation.

```text
id
mcp_server_id
pinned_server_revision_id nullable
scope_type                  # TENANT | USER
scope_id
tenant_id
installed_by
status                      # pending | active | disabled | blocked
configuration_json
billing_owner                # user_external | tenant_external | platform_funded | no_direct_charge | unknown
residency_region nullable
instance_key nullable
quota_policy_json nullable
preferred_protocol_version nullable
minimum_protocol_version nullable
allowed_protocol_versions_json nullable
legacy_fallback_allowed
downgrade_review_required
created_at
updated_at
```

Installation rules:
- effective configuration is validated against the revision/config schema before activation;
- `configuration_json` MUST contain secret references rather than plaintext secrets;
- multiple installations of the same server in one scope require an explicit `instance_key`/product reason; otherwise enforce one active installation per `(mcp_server_id, scope_type, scope_id)`;
- installation disable/block immediately removes its capabilities/connections from eligibility while preserving audit/history.

### 7.13 Data Isolation Requirements

- Every tenant-bound query MUST enforce tenant isolation in SQL/data-access policy, not only UI filtering.
- User-scoped credentials/connections MUST be inaccessible to other users unless an explicitly shared tenant credential is used.
- `mcp_activity_logs` visibility SHALL follow actor scope and audit role.
- Cross-tenant platform views SHOULD use aggregate/redacted telemetry by default.

---


### 7.14 `mcp_protocol_profiles`

```text
id
mcp_server_id
server_revision_id
observed_protocol_version
adapter_type                  # 2026_stateless | legacy_session
server_capabilities_json
server_info_json nullable     # informational only
extensions_json
last_discovered_at
last_compatible_at
compatibility_status
created_at
updated_at
```

### 7.15 `mcp_resources`

```text
id
mcp_server_id
server_revision_id
resource_uri
canonical_resource_uri
name nullable
description nullable
mime_type nullable
resource_kind                # resource | template
metadata_json
content_hash nullable
cache_scope nullable
ttl_ms nullable
indexing_policy              # none | on_demand | managed_rag
approval_status
tenant_id nullable
owner_user_id nullable
last_discovered_at
last_read_at nullable
created_at
updated_at
```

### 7.16 `mcp_prompts`

```text
id
mcp_server_id
server_revision_id
prompt_name
description nullable
arguments_schema_json nullable
content_hash nullable
approval_status
visible_to_users
last_discovered_at
last_changed_at nullable
created_at
updated_at
```

### 7.17 `mcp_remote_tasks`

```text
id
mcp_server_id
mcp_installation_id
mcp_connection_id nullable
mcp_tool_id nullable
upstream_task_id
worker_job_id
capability_call_id
status
poll_after_at nullable
expires_at nullable
last_upstream_state_json nullable
created_at
updated_at
```

Unique constraint SHOULD prevent duplicate active rows for the same `(mcp_server_id, upstream_task_id)`.

### 7.18 `mcp_pending_inputs`

```text
id
trace_id
worker_job_id nullable
mcp_server_id
mcp_installation_id nullable
mcp_connection_id nullable
operation_type
operation_name
request_state_ref            # encrypted/opaque storage reference where needed
input_requests_json
status                       # waiting | answered | cancelled | expired
round_number
expires_at
created_at
updated_at
```

### 7.19 `mcp_server_revisions`

Catalog/server identity and executable runtime version SHALL be separated. A revision is immutable once referenced by an approval, installation, execution, or automation.

```text
id
mcp_server_id
version_label nullable
artifact_digest nullable
package_or_image_ref nullable
endpoint_fingerprint nullable
protocol_adapter_type
protocol_version nullable
configuration_schema_hash nullable
source_provenance_json
status                       # discovered | review | approved | active | superseded | blocked
created_at
approved_at nullable
approved_by nullable
```

Requirements:
- tools/resources/prompts/protocol profiles/discovery snapshots SHALL be associated with a concrete revision;
- an installation MAY pin a revision or follow an approved release channel;
- Runner instances advertising different digests/versions MUST NOT merge tool schemas into one shared catalog row set;
- revision promotion supports staged/canary rollout and rollback without mutating historical execution evidence;
- changing endpoint identity, executable digest, package/image version, or material config schema creates a new revision rather than rewriting an approved revision in place.

### 7.20 `mcp_execution_approvals`

Execution consent is distinct from tool/schema approval. For an `ASK` decision, store a short-lived authorization receipt bound to the exact intended action.

```text
id
tenant_id
user_id
agent_id nullable
mcp_server_id
mcp_installation_id
mcp_connection_id nullable
server_revision_id
mcp_tool_id
schema_hash
normalized_arguments_hash
target_summary_hash nullable
risk_level
billing_owner nullable
approval_scope              # once | workflow | bounded_time
workflow_run_id nullable
expires_at
single_use
consumed_at nullable
created_at
```

The receipt MUST be signed/authenticated or stored server-side behind an opaque ID. Any change to actor, tenant, tool, revision, schema, normalized parameters, material target, risk, or required billing notice invalidates the receipt.

### 7.21 `mcp_subscription_states`

```text
id
mcp_server_id
server_revision_id
connection_id nullable
subscription_kind
filter_json
subscription_id nullable
status                       # desired | listening | reconnecting | stopped | failed
last_notification_at nullable
last_refresh_generation nullable
next_retry_at nullable
created_at
updated_at
```

This is operational state only; catalog/database rows remain canonical after refresh.

### 7.22 Cache and Index Invalidation

The gateway SHALL use upstream-provided cache hints such as `ttlMs` and `cacheScope` where supported, while never weakening SmartAIHub authorization boundaries.

Rules:
- cache partition key MUST include every dimension that can materially change visibility or semantics. At minimum evaluate tenant/scope, user/principal when private, installation, selected connection/account where relevant, immutable server revision, protocol adapter/version, primitive identity, cacheScope, authorization/policy generation, revocation epoch, credential generation where credential-specific visibility exists, locale/content-negotiation fields that affect representation, and request capability/extension set when it affects output;
- dimensions that do not affect a particular cache MAY be intentionally omitted only when documented/tested, never by accident;
- `private/user` data MUST never enter a shared tenant/platform cache;
- cache keys use canonical stable IDs/hashes, not display names or untrusted raw URI variants;
- negative caches (not-found/denied/unavailable) are short-lived, scope-bound, and MUST NOT turn transient authorization/provider failures into durable absence;
- permission/credential/quarantine/schema/revision/protocol/revocation changes invalidate or make affected executable cache entries ineligible immediately;
- cached discovery/content may improve read performance but MUST NOT be authoritative proof that a side effect remains permitted;
- deterministic list ordering SHOULD be preserved to maximize stable cache keys;
- stale-while-revalidate MAY be used for read-only catalog metadata but MUST NOT make an unavailable/blocked tool executable;
- tool/resource/prompt/completion list/content caches SHALL have separate TTL policy;
- cache serialization includes an internal schema version so old/new gateway builds cannot misinterpret a cached security-relevant object.

### 7.23 Execution Idempotency

Every capability execution SHALL have a SmartAIHub `execution_id` / idempotency key.

The gateway SHALL classify operations:

```text
IDEMPOTENT_READ
IDEMPOTENT_WRITE
NON_IDEMPOTENT_WRITE
DESTRUCTIVE
UNKNOWN
```

Automatic retries are allowed only when policy says the operation is retry-safe or the upstream provides idempotency semantics. Network timeout after dispatch for a non-idempotent operation MUST produce an `UNKNOWN_OUTCOME` state rather than blind retry.

### 7.24 `mcp_discovery_snapshots`

Stores cache/version metadata for server primitive catalogs without duplicating canonical capability authorization.

```text
id
mcp_server_id
server_revision_id
primitive_type              # tools | resources | prompts | extensions
protocol_version
catalog_hash
cache_scope nullable
ttl_ms nullable
expires_at nullable
item_count
discovered_at
created_at
```

Snapshots are metadata/cache aids only. Current authorization, approval, credential, and health checks are still evaluated at execution time.


### 7.25 `mcp_control_events` / Transactional Control-Plane Outbox

Database state, capability index state, cache invalidation, subscription listeners, audit projections, and Runner desired state MUST NOT be updated through unrelated best-effort side effects after a control-plane mutation.

Use the existing platform transactional outbox pattern (preferred) or an MCP-specific projection of it. If an MCP table is used, logical fields are:

```text
id
aggregate_type
aggregate_id
event_type
generation
payload_json
tenant_id nullable
created_at
published_at nullable
attempt_count
last_error nullable
```

Examples:

```text
MCP_INSTALLATION_ENABLED
MCP_INSTALLATION_DISABLED
MCP_TOOL_APPROVED
MCP_TOOL_QUARANTINED
MCP_SCHEMA_CHANGED
MCP_CREDENTIAL_REVOKED
MCP_REVISION_PROMOTED
MCP_POLICY_CHANGED
MCP_CONNECTION_CHANGED
```

Requirements:
- canonical DB mutation and outbox event are committed atomically;
- consumers are idempotent and generation-aware;
- publish failure cannot roll back the already committed canonical state, but MUST retry and expose projection lag;
- capability search MUST reject stale generations when a stronger authoritative check is required for WRITE/DESTRUCTIVE execution;
- poison events move to an operator-visible dead-letter/error state after bounded retries without being silently dropped;
- recovery can rebuild capability/search/cache projections from canonical DB plus event generation/snapshot state;
- this mechanism reuses the Unified Job/Outbox infrastructure where possible and MUST NOT create an unrelated message bus ownership model.

### 7.26 Decommissioning, Tombstones, and Offboarding

Removal is a lifecycle operation, not only a row delete. The canonical control plane SHALL support deterministic teardown for a server definition, installation, connection, credential, Runner service, user, or tenant.

Required semantics:
- `DISABLING` prevents new dispatch before destructive cleanup begins;
- in-flight READ operations MAY finish when policy permits; new WRITE/DESTRUCTIVE dispatch is blocked immediately;
- durable jobs/tasks are cancelled, allowed to finish, or moved to operator review according to explicit policy;
- personal/shared credentials are revoked or detached before secret references are destroyed;
- capability/search projections are invalidated before the integration is presented as removed;
- subscription listeners are closed and remote task/pending-input links are reconciled;
- user/tenant offboarding removes future access even if an upstream token remains technically valid until provider revocation completes;
- audit evidence required by retention policy is retained as a non-executable tombstone while secrets and user content follow deletion policy;
- reinstalling the same upstream creates a new installation/connection identity and MUST NOT silently reactivate old approvals or credential bindings.

Recommended lifecycle:

```text
ACTIVE
  -> DISABLING
  -> REVOKING_ACCESS
  -> DRAINING
  -> DECOMMISSIONED
  -> TOMBSTONED / PURGED according to retention policy
```

Physical deletion MUST NOT be used where it would make an already-recorded privileged action impossible to attribute or investigate.


### 7.27 `mcp_consent_receipts` / Purpose-Bound Authorization History

Where a user explicitly approves data sharing, connection scopes, recurring automation, or risky execution, SmartAIHub SHOULD persist a human-readable consent/approval receipt separate from raw MCP protocol payloads.

Logical fields:

```text
id
tenant_id
user_id
installation_id
connection_id nullable
capability_id nullable
purpose_code
scope_summary_json
data_categories_json
risk_level
policy_generation
server_revision_id nullable
approval_id nullable
granted_at
expires_at nullable
revoked_at nullable
source_surface
receipt_version
```

Rules:
- receipts store the minimum information needed to explain what was authorized; never store tokens or secret-bearing request state;
- the user can review active/recent receipts for their own connections/actions;
- revocation invalidates reusable authorization according to its bounded scope but cannot erase immutable security audit evidence;
- retention of consent receipts and security audit records may differ and MUST be defined explicitly;
- purpose changes or materially broader data categories require a new decision rather than silently reusing an old receipt.


### 7.28 `mcp_quota_reservations`

Platform-funded or tenant-budgeted executions that can incur variable external cost SHALL use reservation/settlement rather than a read-then-spend budget check under concurrency.

Logical fields:

```text
id
reservation_key
tenant_id
user_id nullable
installation_id
connection_id nullable
execution_intent_id nullable
budget_scope
currency_or_unit
reserved_amount
settled_amount nullable
status                    # RESERVED | SETTLED | RELEASED | EXPIRED | RECONCILE_REQUIRED
expires_at
created_at
settled_at nullable
```

Reservations MUST be atomic against the authoritative budget ledger. Unused reservation is released; actual provider cost is settled when known; ambiguous provider billing moves to reconciliation rather than silently charging zero or double.

### 7.29 Runtime Lease / Fencing Metadata

SmartAIHub SHALL reuse the existing `worker_jobs` lease/heartbeat model where durable execution is used. Runner/local MCP dispatch that can outlive one dispatcher additionally carries a monotonically increasing fencing token/lease epoch derived from authoritative execution ownership.

Logical fields may live on existing job/lease records rather than a new MCP table:

```text
lease_owner
lease_epoch / fencing_token
lease_expires_at
last_heartbeat_at
execution_intent_id
```

A stale lease owner MUST NOT be allowed to submit a new authoritative result or initiate a SmartAIHub-controlled local side effect after a newer fencing epoch has been issued.

### 7.30 Internal Contract / Projection Schema Versioning

Control events, capability descriptors, Runner advertisements, and projection payloads SHALL carry an internal schema/version identifier independent of MCP protocol version. Immutable historical events are not rewritten in place.

Rules:
- readers tolerate unknown optional fields and reject unknown incompatible required semantics explicitly;
- writers introduce new required semantics only after all active consumers advertise compatibility;
- outbox consumers record supported min/max contract versions;
- capability/index rebuild can replay historical event versions through versioned upcasters/adapters;
- rollback of application binaries MUST remain able to read canonical data written during the allowed mixed-version deployment window.


### 7.31 `mcp_reconciliation_items`

Durable operator-visible work items for orphan/leak/ambiguous lifecycle cleanup:

```text
id
item_type                  # remote_task | subscription | pending_input | oauth_txn | quota_reservation | runner_process | temp_artifact | execution_lease | decommission | unknown_outcome
tenant_id nullable
scope_type
scope_id nullable
object_type
object_id
status                     # PENDING | RETRYING | MANUAL_REVIEW | RESOLVED | IGNORED
cleanup_policy
fencing_epoch nullable
attempt_count
next_attempt_at nullable
last_error_code nullable
last_error_summary nullable
created_at
updated_at
resolved_at nullable
```

The row contains references/metadata only; secret payloads and large temporary content remain in their governed storage systems. Creation/update is idempotent for the same unresolved object/generation.


### 7.32 Delegated Execution Principal and Credential-Grant Metadata

SmartAIHub MUST distinguish **who requested an action**, **which Agent/workflow reasoned about it**, **which principal authorizes the action**, and **which external account/credential actually performs it**. These identities may be different and MUST NOT be collapsed into one `user_id`.

Every side-effecting MCP execution SHALL persist a normalized principal chain such as:

```text
requesting_user_id
initiating_tenant_id
agent_id nullable
workflow_run_id nullable
execution_principal_type      # USER | TENANT_SERVICE | PLATFORM_SERVICE | RUNNER_SERVICE
execution_principal_id
credential_owner_type        # USER | TENANT | PLATFORM
credential_owner_id
connection_id
on_behalf_of_chain_json       # bounded, ordered, signed/trace-linked references only
```

Rules:
- delegation never expands privilege: effective permission is the intersection of requester, Agent/workflow, service principal, connection/account, and Platform/Tenant policy;
- a tenant-shared/service credential does not imply every tenant user may use every tool exposed by that credential;
- service principals require explicit capability/tool scopes and cannot inherit human-admin management-plane permission implicitly;
- the chain is recorded by stable IDs, not display names, and is included in approval binding/audit evidence;
- credential owner, data subject/requester, billing owner, and execution principal are independent dimensions;
- UI wording MUST make clear when an action will run “using Workspace account …” instead of the user’s personal account.

### 7.33 `mcp_effect_receipts` / External Side-Effect Evidence

For WRITE/DESTRUCTIVE operations, SmartAIHub SHOULD persist a durable effect receipt whenever the upstream provides a stable resource/result identity or verification signal.

```text
id
execution_intent_id
mcp_call_id
installation_id
connection_id
capability_id
server_revision_id
upstream_idempotency_key nullable
external_resource_type nullable
external_resource_id nullable
external_resource_uri nullable
provider_operation_id nullable
request_fingerprint
response_fingerprint nullable
postcondition_state       # CONFIRMED | PARTIAL | UNKNOWN | NOT_VERIFIABLE
verified_at nullable
verification_method nullable
created_at
updated_at
```

Requirements:
- receipts never claim exactly-once guarantees that the upstream does not provide;
- an upstream-created object ID, provider operation ID, ETag/version, or equivalent SHOULD be captured when safe;
- timeout after dispatch may use a provider-specific status/postcondition check to move `UNKNOWN_OUTCOME` to `CONFIRMED` or `PARTIAL` without replaying the write;
- compensation references the original effect receipt and produces its own execution intent/receipt;
- user-visible success for high-impact operations MAY require postcondition verification according to policy;
- secrets or sensitive response bodies are not stored merely to create a receipt.

### 7.34 `mcp_artifact_lineage` / Quarantine-to-Library Provenance

Files/blobs/documents produced or downloaded through MCP MUST retain lineage before they become trusted Library/RAG inputs.

```text
id
artifact_id
source_mcp_call_id
source_capability_id
server_revision_id
runner_id nullable
content_sha256
media_type nullable
size_bytes
scan_state                 # PENDING | CLEAN | BLOCKED | REVIEW_REQUIRED | ERROR
quarantine_state
provenance_status
source_uri_redacted nullable
library_asset_id nullable
indexed_for_rag_at nullable
created_at
updated_at
```

Rules:
- content received from an external MCP or Runner is untrusted even when the call itself was authorized;
- executable/archive/active-content types follow stricter scanner/sandbox policy;
- blocked or pending artifacts MUST NOT be indexed into Help/RAG or rendered through unsafe active-content viewers;
- artifact deduplication by hash MUST preserve per-tenant authorization/provenance and never make a private artifact globally visible;
- provenance follows derived/transformed artifacts through parent lineage references where practical.

### 7.35 Retention Holds, Deletion Precedence, and Non-Executable History

If compliance/legal retention is supported, retention policy SHALL distinguish **content retention** from **authorization/execution validity**.

A hold may preserve minimal evidence/content required by policy, but MUST NOT preserve or resurrect:
- active OAuth sessions;
- refresh/access tokens beyond credential policy;
- executable approvals;
- connection defaults;
- capability grants;
- queued side effects.

Recommended retained metadata includes a hold/policy reference, scope, reason category, start/end state, and deletion eligibility timestamp. Access to held evidence is separately authorized and excluded from ordinary user search/RAG unless the governing policy explicitly permits it.

### 7.36 Canonical Lifecycle State Machines and Transition Guards

The platform SHALL define one canonical lifecycle/state-machine contract for every security- or execution-relevant MCP entity. Services, UI, workers, and projections MUST NOT invent independent transition semantics.

At minimum define guarded transition tables for:
- server definition;
- immutable server revision;
- installation;
- authenticated connection/credential binding;
- discovered primitive/capability;
- approval/review state;
- remote task / pending MRTR input;
- execution/effect receipt;
- decommission/tombstone/reconciliation item.

Transition requirements:
- every mutation validates `from_state -> to_state` against the canonical transition table in the authoritative database transaction;
- terminal states are explicit and cannot be reopened except through a documented restore/recreate transition that yields a new generation/revision;
- illegal or stale transitions return a typed conflict error and do not emit a success event;
- transition guards include current policy generation, revocation epoch, actor scope, and optimistic version where relevant;
- each successful transition emits exactly one canonical control event/outbox record with old state, new state, reason, actor, and generation;
- projections/UI derive state from canonical records and MUST NOT become transition authorities;
- timeout/retry paths cannot skip intermediate security states such as `QUARANTINED`, `REVIEW_REQUIRED`, `AUTH_REQUIRED`, `UNKNOWN_OUTCOME`, or `RECONCILE_REQUIRED`.

### 7.37 Referential Integrity, Tombstones, and Non-Destructive Cascades

Schema design SHALL prevent administrative deletion from erasing evidence or silently orphaning security relationships.

Rules:
- mutable business objects use explicit lifecycle/decommission states instead of broad SQL `ON DELETE CASCADE` for audit-, credential-, approval-, job-, effect-, or provenance-bearing relationships;
- hard deletion is limited to data classes whose retention/deletion policy permits it and occurs only after dependency inspection;
- server/revision/tool identifiers referenced by historical activity/effect/audit rows remain resolvable through immutable snapshot/tombstone metadata even after retirement;
- deleting an installation does not delete a shared server definition, and deleting one user connection does not revoke another user's connection;
- database constraints enforce tenant/scope ownership on relationships where cross-tenant references are invalid;
- orphan cleanup is performed through the reconciliation lifecycle, never by unbounded cascade cleanup jobs;
- migrations MUST include integrity checks for dangling foreign keys, cross-tenant references, and duplicate canonical identities.
### 7.38 Capability Dependency Graph, Compatibility Constraints, and Cycle Detection

SmartAIHub SHALL maintain a governed dependency graph for any Agent, Workflow, Plugin, Automation, or composite capability that depends on one or more MCP capabilities/revisions.

Dependency edges SHALL record at minimum:
```text
consumer_type
consumer_id
required_capability_id
revision_constraint / schema_constraint nullable
required_protocol_extension nullable
required_risk_ceiling nullable
required_auth_scope_set nullable
required_execution_location nullable
required = true|false
created_by / source_manifest
```

Rules:
- dependency creation/update performs cycle detection for composite capabilities/workflows; cycles that would cause recursive execution or unsatisfiable startup are rejected;
- `required` versus `optional` dependencies are distinct and affect readiness differently;
- compatibility is not inferred from tool name alone; schema, semantic contract, risk, auth scope, protocol/extension, billing owner, and execution-location constraints MAY all participate;
- dependency resolution uses immutable capability/revision identity, not mutable display names;
- uninstall, quarantine, retirement, revision rollout, or tenant-disable MUST compute affected dependents before enforcement;
- a consumer pinned to a revision never silently floats to a different revision unless its migration policy explicitly permits and compatibility verification passes;
- dependency graph projections are derived from canonical control-plane state and can be rebuilt from source manifests/bindings;
- cross-tenant dependency edges are forbidden unless an explicit platform-shared capability contract exists.

This graph is the authoritative input for retirement impact analysis, scheduled-work preflight, rollout safety, and UI dependency visualization.

### 7.39 `mcp_capability_dependencies`

Canonical dependency-edge storage SHOULD include:
```text
id
tenant_id
consumer_type
consumer_id
required_capability_id
required_server_revision_id nullable
revision_constraint_json nullable
schema_constraint_json nullable
required_protocol_extension nullable
required_risk_ceiling nullable
required_auth_scopes_json nullable
required_execution_location nullable
is_required
source_manifest_type
source_manifest_id nullable
source_generation
created_at
updated_at
```

Unique/foreign-key constraints MUST prevent duplicate edges and cross-tenant references. Deleting a consumer may remove its outgoing edges only after normal audit/tombstone requirements; deleting a capability/revision MUST NOT cascade-delete evidence of impacted dependents before retirement/decommission reconciliation completes.

### 7.40 `mcp_critical_change_proposals`

For deployments using dual-control:
```text
id
scope_type
scope_id
change_type
canonical_change_hash
proposal_payload_json
base_generation
proposer_principal_id
proposed_at
expires_at
status
approver_principal_id nullable
approved_at nullable
rejected_at nullable
reason
break_glass
executed_control_event_id nullable
```

`proposer_principal_id != approver_principal_id` is enforced when dual-control applies. Approval of a stale base generation or changed payload fails atomically.

### 7.41 `mcp_security_advisories` and `mcp_security_advisory_matches`

Advisory record:
```text
id
source_type
source_identity
external_advisory_id nullable
title
severity
confidence
issued_at
updated_at
affected_selector_json
remediation_json nullable
signature_or_digest_metadata_json nullable
status
raw_reference_ref nullable
created_at
```

Match record:
```text
id
advisory_id
server_revision_id
installation_id nullable
tenant_id nullable
match_reason
match_generation
enforcement_state
override_id nullable
first_matched_at
last_verified_at
```

Advisory ingestion is deduplicated by trusted source identity + external advisory identity/version where available. Match recomputation is deterministic and audit-linked.

### 7.42 `mcp_rag_lineage`

For MCP-derived RAG material:
```text
id
tenant_id
source_type              # resource | artifact
source_resource_id nullable
source_artifact_lineage_id nullable
installation_id
server_revision_id
connection_scope_hash nullable
source_uri_hash nullable
source_content_hash
source_content_type nullable
source_trust_class                    # TRUSTED_INTERNAL | APPROVED_EXTERNAL | UNTRUSTED_EXTERNAL
instruction_isolation_mode            # DATA_ONLY | QUOTED_CONTEXT | BLOCKED_FROM_MODEL
acl_generation
policy_generation
retention_generation
index_backend
index_document_id
index_generation
freshness_state
last_verified_at
purge_required_at nullable
purged_at nullable
created_at
updated_at
```

Raw secret-bearing URI/query parameters MUST NOT be stored when a stable redacted/hash form is sufficient. Query authorization relies on current ACL/generation, not solely on the index row's historical ACL.

### 7.43 `mcp_external_erasure_obligations`

When data may have left SmartAIHub:
```text
id
tenant_id
user_id nullable
connection_id nullable
external_destination_id
purpose_code
data_categories_json
disclosure_event_id
erasure_request_id nullable
provider_erasure_capability nullable
status                 # NOT_REQUESTED | REQUESTED | VERIFIED | UNVERIFIED | FAILED | NOT_SUPPORTED
provider_effect_receipt_id nullable
last_attempt_at nullable
last_error_code nullable
created_at
updated_at
```

This table records obligation/evidence state only; it MUST NOT be used to claim provider-side deletion without verified evidence.



### 7.44 `mcp_credential_leases` / Ephemeral Credential Grants

When an upstream/cloud platform can issue short-lived credentials or delegated tokens, SmartAIHub SHOULD prefer an ephemeral grant over exposing a reusable long-lived secret to the execution runtime.

Logical fields:

```text
id
tenant_id
connection_id
execution_intent_id nullable
principal_id
issuer
resource_audience
scope_hash
credential_generation
lease_status              # ISSUING | ACTIVE | EXPIRED | REVOKED | FAILED
issued_at
expires_at
revoked_at nullable
secret_reference nullable # only when a broker requires temporary secret material; never plaintext
trace_id
```

Rules:
- the table stores lease metadata/evidence, not plaintext bearer material;
- short-lived credential material is delivered through the approved secret broker/runtime channel and omitted from Chat, Agent context, normal logs, browser state, and `worker_jobs` payloads;
- issuance is bound to current principal, connection/account, audience, scope, policy generation, revocation epoch, and execution intent where applicable;
- expired/revoked lease material cannot be refreshed by the Runner directly unless the authorization architecture explicitly grants that right;
- fallback from ephemeral/JIT credentials to a broad long-lived credential requires explicit policy and must be observable.


### 7.45 `mcp_runtime_resource_claims`

Runner/local MCP execution that consumes finite machine resources SHALL represent capacity independently from monetary quota.

```text
id
runner_id
worker_job_id nullable
execution_intent_id
mcp_server_revision_id
resource_class             # CPU | MEMORY | GPU | VRAM | PROCESS | PORT | CUSTOM
resource_key nullable       # e.g. gpu:0 / tcp:3000 / model-slot:A
requested_amount
reserved_amount
status                     # RESERVED | ACTIVE | RELEASED | EXPIRED | RECONCILE_REQUIRED
fencing_epoch
expires_at
created_at
released_at nullable
```

Claims are atomic/fenced against the authoritative Runner capacity view. They prevent two jobs from both believing the same exclusive GPU/port/process slot is available. Stale claims are reclaimed only by the reconciliation/fencing rules, never by local timeout guesswork alone.


### 7.46 `mcp_automation_execution_guards`

Scheduled/event-driven automation may receive overlapping triggers. SmartAIHub SHALL persist the overlap/deduplication decision when an MCP-backed automation can create side effects.

```text
id
automation_id
tenant_id
trigger_fingerprint
window_key nullable
policy                     # ALLOW_CONCURRENT | SKIP_IF_RUNNING | QUEUE_ONE | COALESCE | SERIALIZE
active_run_id nullable
pending_run_id nullable
generation
status
created_at
updated_at
```

A guard does not replace `worker_jobs`; it controls admission of automation runs before durable execution. Trigger fingerprints MUST NOT contain secrets or raw sensitive event payloads.


### 7.47 Database-Enforced Tenant / Scope Referential Integrity

Application authorization is necessary but insufficient protection against programming mistakes, unsafe joins, maintenance scripts, or compromised internal services. Tenant/scope ownership SHALL also be enforced at the persistence boundary for control-plane entities wherever technically feasible.

Requirements:
- tenant-bound rows carry an explicit `tenant_id` / scope owner; ownership MUST NOT be inferred only through a distant join chain;
- foreign-key relationships that must remain within one tenant SHOULD use composite ownership constraints such as `(tenant_id, referenced_id)` or an equivalent database-enforced invariant;
- platform/global rows use an explicit platform scope rather than a magic or reused tenant identifier;
- PostgreSQL deployments SHOULD use Row Level Security as defense in depth for appropriate tenant-bound control-plane tables, while still keeping application-layer authorization and explicit service roles;
- privileged migration/reconciliation/analytics roles that bypass ordinary RLS are narrowly scoped, audited, and MUST NOT be reused by interactive application traffic;
- cross-tenant references in capability dependencies, connections, credentials, approvals, RAG lineage, automation guards, resource claims, and external-erasure obligations are rejected by constraints or transaction guards before commit;
- CDC/outbox/search projection payloads preserve tenant/scope identity so downstream projections cannot lose isolation context;
- backup/restore, data export, and reconciliation tests include intentional cross-tenant reference injection attempts;
- soft delete/tombstone state cannot make a foreign object from another tenant eligible through a fallback query.

### 7.48 `mcp_transport_profiles` / Secret-Bearing Transport Configuration

Remote MCP deployments sometimes require custom headers, enterprise proxies, private CAs, mTLS client certificates, or provider-specific transport metadata. These SHALL be modeled separately from ordinary endpoint/display configuration so secret-bearing transport state is not copied into MCP metadata, Chat context, or Runner job payloads.

Logical fields:

```text
id
tenant_id nullable
scope_type                 # PLATFORM | TENANT | USER where allowed
scope_id nullable
installation_id nullable
connection_id nullable
profile_generation
allowed_header_names_json
secret_header_refs_json
non_secret_headers_json
proxy_profile_ref nullable
client_certificate_ref nullable
client_key_ref nullable
ca_bundle_ref nullable
sni_override nullable             # privileged policy only
created_by
created_at
updated_at
revoked_at nullable
```

Rules:
- raw secret header values/private keys/passwords are held in the approved secret manager and referenced by opaque secret refs;
- `Host`, `Content-Length`, `Transfer-Encoding`, connection/hop-by-hop headers, `Forwarded` / `X-Forwarded-*`, gateway-controlled `Mcp-*`, and other reserved routing/security headers cannot be overridden by ordinary custom-header configuration;
- `Authorization` is normally produced by the credential resolver; arbitrary static bearer values require an explicitly permitted credential/header mode and secret-manager reference;
- profile generation participates in HTTP connection-pool isolation and cache/execution readiness where transport identity can affect semantics;
- changing a secret-bearing transport profile invalidates affected pooled connections and triggers policy/health revalidation;
- cross-tenant sharing of private CA/client-certificate/proxy credentials is prohibited unless a Platform-owned shared profile explicitly authorizes it.


### 7.49 `mcp_result_contract_observations`

Optional durable observations for detecting runtime output drift without storing unrestricted raw payloads:

```text
id
tenant_id
mcp_server_id
mcp_server_revision_id
mcp_installation_id
mcp_connection_id nullable
mcp_tool_id nullable
capability_call_id
approved_output_schema_hash nullable
observed_shape_hash nullable
validation_status          # valid | invalid | unknown | truncated
error_summary_json nullable
created_at
```

Raw output SHOULD remain in the existing protected execution/artifact evidence path when retention is justified; this table is for bounded contract observations, not a duplicate result store.

### 7.50 `mcp_subscription_leases`

```text
id
tenant_id
mcp_server_revision_id
mcp_installation_id
mcp_connection_id
subscription_id_fingerprint
requested_filter_json
acknowledged_filter_json nullable
state                      # opening | active | draining | closed | failed
owner_instance_id
lease_epoch
opened_at
acknowledged_at nullable
expires_at
last_notification_at nullable
last_receive_sequence nullable
updated_at
```

One logical desired subscription may have a short overlap during handoff, but lease/fencing plus shared notification deduplication determines which listener may publish authoritative freshness updates.

### 7.51 `mcp_external_usage_reconciliation`

```text
id
tenant_id
execution_intent_id
capability_call_id nullable
mcp_installation_id
mcp_connection_id nullable
billing_owner
provider_usage_id nullable
reservation_id nullable
estimated_amount nullable
provider_amount nullable
currency nullable
usage_json nullable
status                      # pending | reconciled | disputed | credited | failed
observed_at nullable
reconciled_at nullable
created_at
updated_at
```

This table does not replace SmartAIHub credits/accounting. It is a reconciliation/provenance layer feeding the existing accounting contract where SmartAIHub is financially responsible.


### 7.52 `mcp_supply_chain_evidence`

Normalized supply-chain evidence for Runner/local MCP packages, sidecars, images, and redistributed components:

```text
id
tenant_id nullable
mcp_server_id
mcp_server_revision_id
artifact_digest
evidence_type                 # SBOM | VEX | SIGNATURE | ATTESTATION | PROVENANCE | LICENSE_NOTICE
format                        # SPDX | CYCLONEDX | CSAF | IN_TOTO | SIGSTORE | OTHER
issuer_identity nullable
subject_identity nullable
document_digest
verified_status               # VERIFIED | UNVERIFIED | INVALID | EXPIRED | REVOKED
verification_policy_version
storage_ref                   # protected object/document store reference
issued_at nullable
expires_at nullable
created_at
updated_at
```

Rules:
- evidence rows are immutable by `(artifact_digest, evidence_type, document_digest)`; a newer document is a new row, not an overwrite of historical evidence;
- SBOM/VEX/provenance evidence is advisory input, not authorization by itself;
- evidence verification MUST bind to the exact immutable artifact/revision digest and publisher continuity identity where available;
- transitive dependency findings MAY map to multiple revisions, but one revision's approval MUST NOT silently clear another revision's finding;
- raw evidence documents MAY live outside PostgreSQL, but their digest, verification result, retention class, and protected storage reference remain queryable for audit;
- expired/revoked evidence cannot be presented as current verified provenance.



### 7.53 `mcp_extension_profiles`

```text
id
extension_namespace
pinned_version_or_revision
lifecycle_status             # STABLE | DRAFT | EXPERIMENTAL | DEPRECATED | REMOVED
schema_digest nullable
source_uri nullable
feature_flag_key nullable
platform_enabled
security_review_status
minimum_protocol_revision nullable
migration_deadline nullable
created_at
updated_at
```

The extension profile is platform-governed compatibility metadata; tenant policy can further restrict enablement but cannot upgrade a Draft/Removed extension into trusted Stable status.

### 7.54 `mcp_runtime_feature_attestations`

```text
id
runtime_kind                 # gateway_python | runner_go | sidecar | other
runtime_version
sdk_name
sdk_version
adapter_version
expected_protocol_revision
verified_wire_revision nullable
feature_id                   # server_discover | mrtr | subscriptions | tasks_get | ...
feature_status               # VERIFIED | UNSUPPORTED | FAILED | STALE
attestation_digest
verified_at
expires_at nullable
evidence_ref nullable
created_at
updated_at
```

Attestations become stale when SDK/adapter/runtime/protocol/extension configuration changes materially.

### 7.55 `mcp_protocol_feature_inventory`

```text
id
feature_or_transport
protocol_revision_or_era
lifecycle_status             # ACTIVE | DEPRECATED | REMOVAL_SCHEDULED | REMOVED
source_reference nullable
upstream_announced_at nullable
earliest_removal_at nullable
internal_migration_deadline nullable
owner_team nullable
replacement_feature nullable
status                       # inventoried | migrating | blocked | completed
created_at
updated_at
```

Dependencies to installations/capabilities/workflows/Agents/Runners SHOULD reuse the existing capability/dependency graph rather than creating a parallel graph.

### 7.56 `mcp_opaque_state_handles`

```text
id
tenant_id
user_id nullable
mcp_server_id
mcp_server_revision_id
mcp_installation_id
mcp_connection_id nullable
execution_intent_id nullable
handle_type                  # generic_state | continuation | cursor_state | provider_context | other
protected_handle_ref         # encrypted/secret-backed raw value or protected object reference
surrogate_id                 # safe internal token exposed where literal value is unnecessary
status                       # active | expired | revoked | consumed | unknown
expires_at nullable
last_used_at nullable
created_at
updated_at
```

Raw handle values are not ordinary searchable/application text and follow secret-like redaction and retention rules when their confidentiality semantics are unknown.


## 8. Capability Registry Integration

Every approved MCP tool MUST normalize into the existing Capability Registry.

Recommended capability fields:
- `capability_type = mcp_tool`
- tenant scope
- user scope
- source server
- description
- searchable text
- tags
- embedding reference
- risk level
- execution target
- requires_llm
- permission requirements
- health status
- availability
- version/schema hash

The Capability Resolver SHALL search across:
- Skills
- Agents
- Workflows
- Internal operations
- MCP Tools
- Runner capabilities
- External Agent Runtime availability (Spec 200)

MCP MUST NOT have a separate discovery experience inside the cognitive layer, and Spec 200 MUST NOT create a parallel Skill/Agent capability registry.

### 8.1 Canonical Capability API Across Spec 199 / 200

The canonical logical operations are:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

MCP, Skill, Workflow, Internal, Runner and External Agent Runtime are differentiated by `capability_type`, not by separate governance databases. Provider/tool-specific convenience aliases are compatibility projections only.

A caller from Spec 200 receives only the capabilities that the same resolver would expose under the caller's tenant/user/agent/job context. External-agent provider capabilities do not receive elevated access merely because the runtime is local or provider-native.

### 8.2 Shared Retrieval Broker and MCP-Derived Knowledge

Spec 199 may contribute MCP-derived Resources/results to the shared Retrieval Broker only after the existing lineage, ACL, source-trust, instruction-isolation, freshness and revocation controls have been applied.

Spec 200 consumes knowledge through its External Agent Context Adapter over the same Retrieval Broker. It SHALL NOT maintain an independent copy/index that can outlive Spec 199 revocation state.

Minimum MCP-derived retrieval lineage remains:

```text
source_mcp_server_id
source_revision_id
resource/capability identity
source ACL / tenant scope
trust classification
retrieval/index generation
revocation epoch
content/artifact lineage
```

### 8.3 Cross-Spec Capability Exposure Budget

Spec 199 lazy MCP discovery and Spec 200 external-agent capability discovery share one governed model-facing exposure budget. Candidate ranking MAY differ by caller/model capability, but the authoritative eligibility set comes from the same Capability Resolver and policy generation.

---

## 9. Lazy Discovery / Search-First Tool Exposure

The system SHALL NOT expose every available MCP tool schema to OpenAI Agents SDK or another model.

Preferred flow:

```text
User request
   |
   v
LangGraph
   |
   v
Capability Resolver
   |
   +--> SQL metadata search
   +--> lexical/BM25 search
   +--> vector semantic search
   +--> ACL/tenant/user filtering
   +--> health filtering
   +--> quarantine filtering
   |
   v
Top candidate capabilities
   |
   v
OpenAI Agents SDK (only if needed)
```

Target:
- default candidate set: 3–10 tools/capabilities
- hard configurable maximum
- no unapproved/unhealthy/unauthorized tool in results

---


### 9.1 Discovery Ranking Integrity and Search-Poisoning Defense

Capability ranking is a convenience signal, never an authorization or trust signal. A malicious upstream MUST NOT gain priority merely by stuffing tool descriptions/tags with popular terms.

The resolver SHALL:
- cap indexed metadata length and repeated-token contribution;
- normalize boilerplate and obvious keyword stuffing;
- keep server/publisher trust, installation scope, health, approval, exact-name match, user intent, and semantic relevance as separate features;
- never let description text lower runtime risk or expand permission;
- permit policy to pin/boost tenant-approved capabilities without changing their security classification;
- record explainable ranking factors for admin diagnostics;
- diversify results so one server cannot monopolize all top-K candidates solely through near-duplicate tools;
- treat upstream instructions/descriptions as untrusted content before embedding/indexing.

Search quality/security evaluation SHOULD include adversarial ranking cases and Unicode-confusable tool names.


### 9.2 Model-Facing Capability Alias and Exposure Budget

Capability search returning only a few candidates does not guarantee a safe or efficient cognitive context: a single MCP tool may have a huge schema/description, a name that conflicts with a SmartAIHub gateway tool, or syntax unsupported by the selected model provider.

Before exposing any MCP capability to OpenAI Agents SDK or another cognitive executor, SmartAIHub SHALL create a **model-facing projection** that is separate from the canonical capability identity.

Requirements:
- canonical authorization/execution always uses the immutable capability ID/address; a model-facing alias is never an authorization identity;
- aliases are generated by SmartAIHub, satisfy the selected model/provider naming/length rules, and cannot be chosen by an upstream to shadow reserved tools such as `execute_capability`, `search_capabilities`, or internal policy/admin tools;
- alias collisions are deterministically disambiguated and the alias→canonical mapping is scoped to the orchestration/model run;
- descriptions/schemas have configurable byte/token budgets per capability and per model turn;
- the resolver may defer full schema loading, prefer `describe_capability()` / `execute_capability()`, or summarize non-normative descriptions when the budget is exceeded, but MUST NOT weaken server-side validation or risk policy;
- security/risk metadata is supplied from trusted SmartAIHub projections, not from untrusted text summarized by the LLM;
- model-tool exposure records the selected alias, canonical capability ID, source revision, schema hash, projection/translation version, and estimated schema token cost for trace/debug purposes;
- oversized/malformed schemas cannot evict all other critical tools from model context or cause unbounded prompt/token cost.

## 10. MCP Discovery Lifecycle

```text
DISCOVERED
   |
   v
QUARANTINED
   |
   v
INSPECTED
   |
   v
APPROVED
   |
   v
ACTIVE
```

When a tool changes materially:

```text
ACTIVE
   |
   v
SCHEMA_CHANGED
   |
   v
REVIEW_REQUIRED
   |
   +--> APPROVED -> ACTIVE
   +--> REJECTED -> BLOCKED
```

Material changes include:
- input schema changed
- output schema changed if execution semantics are affected
- tool description changes materially
- read-only flag changed
- destructive flag changed
- required auth scope changed
- transport/security characteristics changed

Use a stable hash over normalized schema + material metadata.

---

## 11. Risk Classification

Every MCP tool SHALL be classified as one or more of:

- `READ`
- `WRITE`
- `DESTRUCTIVE`
- `PRIVILEGED`
- `EXTERNAL_DATA_TRANSFER`

Examples:
- read a GitHub issue -> READ
- create document -> WRITE
- delete file -> DESTRUCTIVE
- change infrastructure setting -> PRIVILEGED
- upload user file to external provider -> EXTERNAL_DATA_TRANSFER

Risk level affects:
- approval
- user confirmation
- policy checks
- logging
- DLP rules
- whether autonomous execution is allowed

### 11.1 Argument-Sensitive Runtime Risk

Static tool risk is only the baseline. Before execution, SmartAIHub SHALL re-evaluate risk from normalized arguments and context because a single MCP tool may multiplex materially different actions.

Runtime risk signals may include:
- `action`/operation parameter (read vs update vs delete);
- target ownership/scope (own item vs shared workspace vs organization-wide);
- number of affected objects / bulk operation;
- destination domain/account for data transfer;
- file/content sensitivity;
- requested OAuth scope escalation;
- estimated monetary/quota impact;
- command/path/network target for Runner-local tools.

Runtime classification may only keep or increase the baseline risk unless a trusted SmartAIHub policy explicitly defines a safe sub-operation. Any increase invalidates a previously rendered approval receipt and requires policy/confirmation to be evaluated again.

---


### 11.2 MCP Tool Annotation Trust Contract

MCP `ToolAnnotations` such as `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` are **hints from the upstream**, not authoritative security declarations. SmartAIHub SHALL preserve them for diagnostics and risk signals but SHALL NOT allow them to weaken trusted policy by themselves.

Normative rules:
- absent/untrusted hints use conservative defaults for admission decisions: not proven read-only, potentially destructive, non-idempotent, and open-world;
- `readOnlyHint=true` does not bypass SmartAIHub WRITE/DESTRUCTIVE classification unless a trusted Platform/Tenant review or verified provider policy independently establishes equivalent semantics;
- `idempotentHint=true` alone never authorizes automatic retry after an ambiguous side-effect boundary;
- `openWorldHint=false` does not disable DLP, untrusted-result handling, network policy, or external-data-transfer classification;
- contradictory hints, runtime observations, argument-sensitive behavior, or scanner findings can only maintain/increase effective risk until reviewed;
- annotation changes are material discovery drift and invalidate any policy optimization that depended on the previous annotation set;
- the UI MAY display upstream-declared hints, but MUST label them as publisher/upstream claims when they are not SmartAIHub-verified.


## 12. Permission Model

Permission checks SHALL occur before tool discovery and again immediately before execution.

### 12.1 Scope Hierarchy

```text
Platform
  -> Tenant
     -> Role
        -> User
           -> Agent
              -> Server
                 -> Tool
```

`Runner` is an execution-availability scope, not an authorization shortcut.

### 12.2 Effective Permission

The effective permission is the most restrictive applicable result:

```text
BLOCK > ASK > ALLOW
```

Examples:

```text
Platform = ALLOW
Tenant   = ALLOW
User     = ASK
Agent    = ALLOW
Result   = ASK
```

```text
Platform = ALLOW
Tenant   = BLOCK
User     = ALLOW
Agent    = ALLOW
Result   = BLOCK
```

### 12.3 Discovery-Time Enforcement

A caller without permission MUST NOT:
- receive the tool in search results
- receive tool description/schema
- infer hidden tool existence from result counts or diagnostics

### 12.4 Execution-Time Enforcement

Before execution, re-check:
- platform policy
- tenant policy
- user/role policy
- agent policy
- approval/quarantine status
- risk policy
- current credential scopes
- health state
- Runner ownership/availability when applicable

### 12.5 Policy Presets

UI SHALL provide presets:

```text
READ_ONLY
STANDARD
FULL_WITH_CONFIRMATION
CUSTOM
```

Presets are convenience templates only; effective permissions are still calculated per tool/risk.

### 12.6 Agent Access

Tenant Admins may assign MCP servers/tools to agents. User authorization to a service DOES NOT automatically grant every agent access to it.

### 12.7 User Self-Restriction

Users may choose a stricter personal policy (for example `ASK` or `BLOCK`) than tenant policy. Users MUST NOT elevate `BLOCK` to `ALLOW` or `ASK` to `ALLOW` when the parent scope is stricter.

---


### 12.8 Deterministic Connection / Account Resolution

Authorization to a tool does not identify which external account/credential should execute it. The Gateway SHALL resolve a concrete `mcp_connection_id` separately from capability authorization.

Resolution order SHOULD be policy-driven, for example:
1. workflow/automation pinned connection;
2. explicit user-selected connection in the current action;
3. installation-scoped default connection for that user/tenant where allowed;
4. sole eligible connection;
5. otherwise `CONNECTION_SELECTION_REQUIRED`.

Rules:
- OpenAI Agents SDK/tool arguments MUST NOT be allowed to inject an arbitrary credential/connection ID outside an explicitly safe selector contract;
- tenant-shared and personal connections are visually and logically distinct;
- switching the resolved connection/account after an approval invalidates that approval;
- a user belonging to multiple tenants may hold separate connections to the same platform MCP server without collision;
- offboarding one tenant connection MUST NOT revoke the user's independent connection in another tenant;
- external account subject identifiers SHOULD be stored hashed/pseudonymized when a display label is sufficient.

### 12.9 Required-Capability Preflight

Automations, scheduled agents, and unattended workflows SHOULD run a zero-side-effect preflight before model/tool execution when required capabilities are known.

Preflight checks:
- capability exists;
- permission is not BLOCK;
- server/tool is approved and not quarantined;
- schema version matches workflow expectation when pinned;
- credentials are ready and required scopes are present;
- Runner is online when required;
- concurrency/rate policy permits likely execution;
- required extension/protocol version is supported.

Preflight returns machine-readable categories:

```text
READY
TRANSIENT_UNAVAILABLE
OPERATOR_ACTION_REQUIRED
CONFIGURATION_ERROR
```

This preflight MUST NOT call the upstream business tool itself and MUST NOT incur external side effects.

### 12.10 Execution-Bound Approval / TOCTOU Prevention

When effective policy returns `ASK`, the confirmation shown to the user and the execution performed after confirmation MUST be cryptographically/logically bound to the same normalized operation.

Approval binding inputs include at minimum:

```text
tenant_id
user_id
agent_id / workflow_run_id when applicable
mcp_server_id + installation_id + server_revision_id
mcp_connection_id when resolved
mcp_tool_id
schema_hash
normalized arguments
material target/resource identity
risk classification
billing/quota owner notice where material
expiry
```

Execution SHALL recompute the binding immediately before forwarding. If any bound value changed, return `APPROVAL_STALE` and re-render the confirmation with the new facts.

`Allow once` receipts are single-use and atomic: only one executor may consume them. A replay, duplicate browser submission, or concurrent worker MUST fail closed after the first successful consume.

Reusable consent (`workflow` or bounded time) is permitted only for policy-approved risk classes and MUST encode a strict scope predicate; it is never a blanket approval for a tool name.



### 12.11 Management-Plane Actor Separation and Mutation Idempotency

An Agent, model-issued token, MCP upstream, or Runner is not an MCP administrator. Server/install/registry/quarantine/approval/policy/credential-management mutations require an authenticated human/admin or explicitly authorized service principal with management-plane scope.

Denied to ordinary Agent identities regardless of tool availability:
- add/remove/enable/disable MCP server or installation;
- change registry sources;
- approve/reject quarantine or schema changes;
- change global/tenant security policy;
- create/reveal/rotate shared credentials except through a dedicated approved credential workflow;
- change Runner desired revision;
- weaken scanner/DLP/sandbox requirements.

All externally retriable management mutations SHALL support an idempotency key or equivalent request token, scoped to actor + tenant + operation, so browser retries/network replay cannot create duplicate installations, approvals, connections, or registry entries.

Mutating APIs also require optimistic concurrency/version tokens for updates to existing records. A conflicting stale write returns a conflict response and MUST NOT silently overwrite newer policy/state.

### 12.12 Policy Decision Snapshot and Reproducibility

Every execution decision that can produce an external side effect SHALL be reproducible from durable metadata even after Platform/Tenant/User/Agent policy changes later.

At authorization/dispatch time record a compact decision snapshot containing at minimum:

```text
policy_generation
policy_evaluator_version
platform_policy_version
tenant_policy_version nullable
user_policy_version nullable
agent_policy_version nullable
risk_classifier_version
effective_decision
required_confirmation
credential/connection selector result
server_revision_id
schema_hash
```

Requirements:
- the snapshot is evidence of the decision made then; it does not freeze permission for future dispatches;
- queued/durable work MUST revalidate against current authoritative policy immediately before side effects;
- if current policy is stricter than the stored snapshot, current policy wins and execution pauses/fails closed;
- if current policy is more permissive, an expired/consumed approval is not resurrected;
- policy-version changes invalidate relevant capability/approval caches;
- audit UI SHOULD be able to show “allowed because …” / “blocked because …” from structured policy sources rather than reconstructing from today’s policy state.


### 12.13 Delegation, Service Principals, and “On-Behalf-Of” Authorization

When an Agent/workflow invokes MCP using a tenant/platform shared credential, SmartAIHub SHALL evaluate authorization against the complete principal chain rather than treating credential possession as authority.

Effective execution authority is bounded by:

```text
Platform Policy
∩ Tenant Policy
∩ Requesting User / Trigger Principal
∩ Agent / Workflow Binding
∩ Execution Service Principal
∩ Connection / External Account Scope
∩ Current Risk / Containment Policy
```

For scheduled/event-driven automation with no interactive user, the trigger MUST identify an explicit service principal and owning tenant/user context. “System” or a missing user MUST NOT become an implicit superuser.

Approval cards and audit records SHALL disclose material delegated-account use, for example:

```text
Run by: Automation Agent
On behalf of: Workspace Finance Bot
External account: ACME Shared GitHub
Requested by: Scheduled workflow owned by Team A
```

### 12.14 Resume-Time Revalidation for MRTR, Tasks, Paused Jobs, and Deferred Approvals

Any operation that pauses across user input, external task wait, queue delay, maintenance drain, or long-running Runner work MUST treat the resume point as a new authorization boundary.

Before resuming a side effect, revalidate at minimum:
- revocation/containment epoch;
- current Platform/Tenant/User/Agent/service-principal policy;
- approval receipt validity and exact bound arguments/target;
- connection/account existence, scopes, credential generation and auth status;
- server revision/schema/risk classification;
- Runner trust/fencing state where applicable;
- region/residency and budget reservation validity;
- capability retirement/deprecation state.

A resume token/requestState proves correlation, **not continuing authorization**. If a material value changed, move to an explicit stale/review state and request new authorization/connection/input instead of resuming silently.

### 12.15 Unified Policy Precedence and Conflict Resolution

`BLOCK > ASK > ALLOW` is the permission lattice, but SmartAIHub also has orthogonal policies for DLP, residency, budget, transport, risk, trust, deprecation, and emergency containment. The platform SHALL use one deterministic policy-composition contract across all services.

Precedence/order of authority:

```text
Emergency containment / revocation epoch
    > Platform security/compliance maximums
    > Tenant security/compliance maximums
    > Role/User restrictions
    > Agent restrictions
    > Capability/Tool risk policy
    > Runtime readiness / auth / trust / budget constraints
    > User one-time approval within the remaining allowed envelope
```

Rules:
- a lower layer may only narrow access, never weaken an upper-layer denial/requirement;
- `ASK` cannot override an upper-layer `BLOCK`;
- a one-time approval cannot waive DLP, residency, credential audience, revocation, unsupported-protocol, or Runner-trust requirements;
- conflicting non-boolean policies resolve to the safest valid intersection (for example region intersection, minimum budget ceiling, strictest retention/egress rule where legally valid);
- if no valid intersection exists, decision is `BLOCK` with a typed reason;
- every execution policy snapshot records the contributing policy IDs/generations and the final composed decision;
- preview/dry-run and actual dispatch MUST use the same policy compiler/evaluator implementation, with dispatch re-evaluating current generations.

Policy composition SHALL have property-based tests proving monotonicity: adding a restriction cannot produce a more permissive effective decision.
### 12.16 Scheduled / Event-Driven Automation Per-Run Revalidation

A successful setup-time preflight does not authorize future unattended executions indefinitely. Every scheduled/event-driven run that may access MCP SHALL revalidate the effective execution envelope before the first external side effect.

Per-run revalidation includes:
- owning tenant/user/service-principal still active;
- automation/workflow still enabled and not suspended;
- dependency graph still satisfiable;
- installation/revision/tool still approved and executable;
- current policy/revocation epoch/risk classification;
- reusable consent still valid for the same purpose, destination, data categories, account, and schema/risk generation;
- selected connection/account still belongs to the expected principal and has required scopes;
- Runner/runtime trust and region/residency readiness where applicable;
- budget/quota reservation and current upstream rate/admission state.

If material drift requires new human consent, broader OAuth scopes, a different external account, or a higher risk class, the unattended run MUST transition to `OPERATOR_ACTION_REQUIRED` / paused state rather than silently accepting the change.

Queued future occurrences SHALL NOT inherit an earlier run's one-time approval or execution-bound receipt. The automation UI MUST distinguish `Configured`, `Ready now`, `Paused by drift`, and `Action required`.

### 12.17 Privileged Session Freshness and Permission-Drift Revalidation

A browser/admin session that loaded an MCP management page earlier MUST NOT retain stale authority merely because its UI still renders an enabled button.

For high-impact control-plane mutations (approval/quarantine override, credential binding, protocol downgrade, policy relaxation, region failover, break-glass, kill-switch clear, publisher trust change, destructive bulk operation):
- API authorization is always re-evaluated at mutation time against current role/policy/revocation state;
- configured deployments SHOULD require recent authentication/step-up for the highest-risk operations;
- stale optimistic versions/generations return a typed conflict and refreshed impact preview rather than overwriting newer state;
- role removal, tenant suspension, or emergency revocation takes effect independently of browser session lifetime;
- UI re-fetches effective permission before displaying a final confirmation for privileged changes;
- an Agent/model execution identity can never satisfy human step-up requirements.

The UI is advisory; the authoritative API guard decides whether the action is still allowed.



### 12.18 Automation Overlap, Trigger Deduplication, and Coalescing

Per-run authorization revalidation is necessary but insufficient when two timers/webhooks/events arrive at nearly the same time. Every side-effecting automation SHALL declare one overlap policy:

- `ALLOW_CONCURRENT` — only for operations proven safe under concurrent execution;
- `SKIP_IF_RUNNING` — discard a new trigger while one run is active, with visible skipped-run evidence;
- `QUEUE_ONE` — retain at most one pending run;
- `COALESCE` — merge compatible trigger facts into one bounded pending run using a deterministic coalescer;
- `SERIALIZE` — enqueue all accepted runs under one ordered concurrency key.

Requirements:
- admission is atomic across gateway/region instances;
- overlap policy is independent from provider idempotency and does not create an exactly-once claim;
- each admitted run still receives a unique `execution_intent_id`, policy/credential revalidation, deadline, and budget reservation;
- trigger deduplication uses a bounded, versioned fingerprint contract and retention window;
- changing overlap policy increments automation generation and cannot silently alter an already-admitted run;
- UI exposes running/pending/skipped/coalesced state and the reason a trigger did not start a new run.


### 12.19 Human Approval Fidelity and Concurrent Decision Resolution

The action the user sees MUST be the action that the approval binds. A model-generated prose summary alone is not sufficient security evidence.

Approval UI SHALL be rendered from the same normalized/canonical argument snapshot used to calculate `normalized_arguments_hash`, with safe human labels layered on top. Requirements:
- material targets, account/connection, destructive scope, external-data categories, cost owner, and irreversible effects cannot be hidden by truncation/collapse;
- if an argument cannot be represented safely/faithfully, UI requires `Review raw structured details` or blocks approval according to risk policy;
- LLM-generated explanation/“why needed” text is visually separated from authoritative target/argument facts;
- server-side execution recomputes both the canonical binding hash and the display snapshot hash/version where used;
- approval actions from multiple tabs/devices use compare-and-swap semantics: the first valid terminal decision for the current approval generation wins; later approve/reject/cancel attempts receive `MCP_APPROVAL_ALREADY_RESOLVED` and refresh to authoritative state;
- rejection/cancellation never races into execution after an approval has been revoked but before dispatch; dispatch consumes the approval atomically with current policy/revocation validation.


### 12.20 Automation Owner / Service-Principal Lifecycle and Orphan Handling

Per-run revalidation is not enough if the human who created an automation leaves the tenant, loses the relevant role, is disabled, or transfers responsibility. Every scheduled/event-driven MCP automation SHALL have an explicit accountable owner and execution principal lifecycle.

Requirements:
- personal automations are bound to the creator/owner identity and MUST pause when that owner is disabled, deleted, suspended, or leaves the tenant unless policy explicitly transferred ownership beforehand;
- shared automations SHOULD execute under a dedicated service principal rather than silently inheriting the current credentials of the last human editor;
- a service principal has one or more current human custodians/administrators for accountability, but the automation execution identity remains distinct;
- ownership transfer is an audited control-plane mutation, requires current authorization, and re-evaluates connection/account, consent, purpose, data scope, budget owner, and high-risk approval predicates;
- transfer MUST NOT silently switch from a personal external account to a tenant-shared credential or vice versa;
- automations with no valid owner/custodian become `ORPHANED_OWNER` / paused rather than continuing indefinitely;
- tenant offboarding/deletion workflow enumerates affected automations and requires transfer, disable, or explicit retention disposition;
- UI clearly distinguishes `Created by`, `Current owner`, `Execution principal`, and `External account`.

### 12.21 Schema Defaults, Omitted Fields, and Effective-Argument Approval Semantics

JSON Schema `default` is commonly descriptive rather than a guarantee that the client or server applies that value. SmartAIHub MUST NOT let ambiguous default semantics make the user approve one action while the upstream executes another.

Rules:
- adapters do not auto-materialize upstream schema defaults unless the adapter/profile explicitly defines that behavior;
- canonical execution/approval binding includes the exact transmitted argument object plus a deterministic omitted-field set when omission is semantically meaningful;
- SmartAIHub-generated defaults, presets, inferred values, or UI autofill are resolved **before** high-risk approval and appear in the canonical approval snapshot;
- an upstream-declared default that may be applied only server-side is labeled as `server-applied/unknown effective value` when material to risk; SmartAIHub MUST NOT pretend it knows the value;
- model-generated arguments are validated server-side against the canonical schema/projection before dispatch even when the model provider already validated a translated schema;
- a schema/default change that can alter WRITE/DESTRUCTIVE/PRIVILEGED behavior counts as a material semantic change for review even if required-property structure did not change;
- approval UI renders the final SmartAIHub-transmitted values and explicitly marks omitted/server-defaulted fields that materially affect the action;
- retries/reconciliation reuse the same canonical effective-argument binding rather than recomputing defaults from a newer schema.


### 12.22 Policy Shadow Evaluation and Historical-Impact Replay

High-impact policy changes SHOULD support a non-enforcing evaluation mode before promotion.

Shadow evaluation requirements:
- evaluate the candidate policy against a bounded, redacted sample of historical execution metadata or synthetic fixtures without replaying external side effects;
- compare current vs candidate outcomes such as `ALLOW -> ASK`, `ALLOW -> BLOCK`, changed connection choice, changed residency route, or changed data-egress classification;
- never send historical arguments/results back to an upstream merely to simulate policy;
- historical samples remain tenant-scoped and honor current retention/deletion/legal-hold rules;
- simulation records the candidate policy generation/hash and fixture/snapshot generation so results are reproducible;
- operator UX clearly distinguishes `SIMULATION` from enforcement and cannot accidentally “apply” through a report-view action;
- promotion uses normal dual-control/generation-bound mutation rules where configured;
- a candidate that introduces unexplained broad privilege expansion SHOULD require explicit review even when syntactically valid.

## 13. OAuth & Credentials

The gateway SHALL support:
- platform credentials
- tenant credentials
- per-user credentials
- OAuth 2.1 / PKCE where upstream supports it
- refresh tokens
- scoped credentials
- revocation
- reconnect flow

Credential resolution order MUST be explicit and configurable.

The LLM SHALL receive only:
- logical tool name
- input schema
- safe metadata

It SHALL NOT receive:
- access token
- refresh token
- API secret
- private key
- raw credential object

---


### 13.1 MCP Authorization Hardening

For modern remote MCP authorization, the gateway SHALL implement the current MCP authorization profile supported by the selected SDK and SHALL include the following controls:

- OAuth 2.1 / PKCE for human-user authorization where applicable.
- Protected Resource Metadata / `WWW-Authenticate` discovery where supported.
- OAuth Resource Indicators (`resource`) bound to the canonical MCP resource URI.
- authorization issuer validation, including RFC 9207 `iss` validation where applicable.
- client credentials MUST be bound to the authorization-server issuer that created them and MUST NOT be reused across issuers.
- Client ID Metadata Documents (CIMD) SHOULD be the preferred modern client registration path when supported.
- Dynamic Client Registration (DCR) is legacy compatibility only and SHALL be isolated behind the auth adapter because it is deprecated in the `2026-07-28` MCP generation.
- incremental/step-up scope consent SHALL request additional scopes only when required by an operation.
- refresh tokens SHALL be proactively refreshed before expiry with bounded exponential backoff.
- refresh failure SHALL surface as `DEGRADED` before expiry and `AUTH_REQUIRED` when re-authorization is genuinely required.
- tokens MUST be audience/resource-bound where the provider supports it.
- OAuth callback state/PKCE verifier MUST be single-use, time-bounded, cryptographically random, and bound to tenant/user/connection.
- redirect URIs MUST be allowlisted exactly; open redirects are prohibited.

### 13.1.1 OAuth Transaction Integrity, Audience Separation, and Token Passthrough Prohibition

In addition to PKCE/issuer/resource validation, SmartAIHub SHALL enforce transaction-level OAuth integrity:

- authorization `state` values are cryptographically random, single-use, short-lived, and bound to tenant + user + installation + intended redirect URI;
- authorization codes are redeemed once and never logged or reused;
- bearer tokens are sent only in the `Authorization` header and never in query strings;
- access tokens obtained for one MCP resource/audience MUST NOT be reused for a different MCP server or downstream API;
- SmartAIHub MUST NOT forward an MCP access token unchanged to a downstream SaaS/API on behalf of an upstream server (token passthrough/confused-deputy prevention);
- if SmartAIHub itself calls a downstream API, it uses a separately issued credential/token for that downstream audience;
- authorization-server metadata, issuer, token endpoint, and resource identity are pinned/correlated for the transaction so mix-up across issuers fails closed;
- callback handling verifies the stored transaction, redirect target, issuer binding, PKCE verifier, and expiration before token exchange;
- reauthorization after scope elevation creates a new transaction and MUST NOT mutate an already-consumed approval receipt in place.

These controls follow MCP authorization guidance that resource tokens are audience-bound and token passthrough is prohibited.

### 13.2 Enterprise-Managed Authorization

SmartAIHub MAY support the stable MCP Enterprise-Managed Authorization extension for enterprise tenants.

When enabled:
- Platform/Tenant policy determines managed identity provider and eligible MCP servers;
- user access MUST still be tenant- and role-scoped;
- the UI SHALL distinguish `Managed by organization` from personal OAuth;
- managed authorization MUST NOT expose tenant-wide secret material to end users;
- revocation/offboarding MUST propagate promptly and invalidate capability caches.

### 13.3 Credential Lifecycle and Key Management

Credentials SHALL support explicit lifecycle states:

```text
VALID
REFRESHING
DEGRADED
EXPIRED
REVOKED
AUTH_REQUIRED
```

Production secrets SHOULD be stored through the platform's secret manager/KMS abstraction with envelope encryption and key rotation. Database rows should store references and non-secret metadata only.

Audit SHALL record authorization events without storing authorization codes, access tokens, refresh tokens, PKCE verifiers, or secret-bearing callback URLs.

Refresh/rotation concurrency rules:
- credential refresh SHALL use a per-credential single-flight/lease so concurrent calls do not rotate the same refresh token in parallel;
- token version/generation MUST advance atomically when credentials rotate;
- a caller that loses the refresh race reloads the current credential generation rather than overwriting it;
- revoked/offboarded credentials invalidate active connection/cache readiness promptly;
- credential aliases/references MAY remain stable while secret-manager versions rotate underneath, but audit must record non-secret generation identifiers.


### 13.4 Time Source, Clock Skew, and Expiry Semantics

Security decisions that depend on time SHALL use server-side trusted UTC time. Client/browser/Runner timestamps are informational unless verified by an authenticated protocol and SHALL NOT directly determine token/approval validity.

Apply explicit clock-skew tolerance to:
- OAuth token `exp`/`nbf`/issuer validation where applicable;
- PKCE/state expiration;
- execution approval expiry;
- Runner signed heartbeat/message freshness;
- temporary policy grants;
- rate/quota windows;
- MRTR pending-input expiry.

Requirements:
- gateway/worker hosts synchronize time through platform infrastructure monitoring;
- excessive local clock drift marks the instance/Runner degraded for time-sensitive operations;
- expiry comparisons use a documented skew allowance rather than ad hoc per-call values;
- monotonic clocks SHOULD be used for local elapsed-time/deadline measurement where available.

### 13.5 Credential Restore, Rotation, and Environment Binding

Backup/restore or environment cloning MUST NOT accidentally reactivate credentials in a different security environment.

Rules:
- backups store secret-manager references/metadata according to platform backup policy, not plaintext OAuth/API secrets;
- restoring to a different environment/region/account requires explicit secret rebind or reauthorization unless the secret manager guarantees the same authorized identity boundary;
- credential generation/version is recorded so caches and in-flight callers cannot continue using a retired secret indefinitely;
- rotation emits a control-plane event and invalidates dependent connection/auth caches;
- deleting/revoking a shared credential identifies all affected installations/connections before confirmation;
- secret values are never returned through generic configuration export APIs.

### 13.6 Cryptographic Key Versioning, Rewrap, and Secret-Erasure Semantics

Credential references and encrypted metadata SHALL remain safe across long-lived operation, KMS rotation, backup/restore, and tenant offboarding.

Requirements:
- secret-manager/KMS key identifiers and non-secret key-version/generation metadata are recorded with credential metadata;
- envelope-encrypted records support rewrap/re-encryption without exposing plaintext to application logs or normal operators;
- key rotation distinguishes `new writes use new key` from background rewrap of existing ciphertext and exposes progress/failures operationally;
- decrypt failures caused by retired/missing keys produce `AUTH_REQUIRED`/reconciliation state, never fallback to another tenant/environment key;
- key revocation/cryptographic erasure follows retention/legal-hold rules and produces deletion evidence without retaining plaintext;
- restored backups cannot cause ciphertext from environment A to be decrypted under an unintended environment/tenant binding;
- access to secret retrieval/decrypt operations is separately audited from ordinary MCP tool invocation;
- application code never caches plaintext credentials beyond the bounded request/refresh lifetime required for use.
### 13.7 Authorization-Scope Drift, Account Rebinding, and Mid-Run Credential Revalidation

OAuth/token possession does not prove that the external account still has the same upstream permissions or organizational membership it had when connected.

SmartAIHub SHALL handle scope/account drift as follows:
- before a high-risk call, validate locally known token expiry, granted scopes, selected external subject/account, credential generation, and connection state;
- when the provider exposes safe introspection/account metadata, adapters MAY refresh authorization metadata under a bounded policy without invoking business side effects;
- a `401`, invalid-token, audience, issuer, or revoked-credential response transitions the connection toward re-authentication and MUST NOT trigger blind credential fallback to another account;
- a `403`/insufficient-scope response is distinguished from transient upstream failure and may trigger step-up authorization only for the exact required scope;
- account subject/tenant/org identity change invalidates approvals or reusable consent whose destination/account binding no longer matches;
- long-running Tasks/MRTR/paused jobs revalidate credential generation and required scopes on resume boundaries;
- refresh-token rotation uses the existing single-flight/key-generation rules and cannot resurrect a connection explicitly revoked by user/admin.

The system MUST NOT silently substitute a tenant-shared credential for a revoked personal connection, or vice versa, merely to make the operation succeed.



### 13.8 Secretless / Just-in-Time Credential Execution

Where supported by the external provider or enterprise identity platform, production deployments SHOULD prefer short-lived, audience-scoped credentials minted at execution time over distributing reusable API keys/tokens to Gateway/Runner processes.

Preferred patterns include workload identity federation, OAuth token exchange/delegation, provider STS, managed identity, or an equivalent brokered mechanism.

Normative requirements:
- mint only after authorization, connection/account resolution, risk check, and dispatch readiness;
- scope/audience/TTL are minimum necessary for the intended execution;
- credential material is injected directly into the transport/runtime secret channel and is not serialized into LangGraph state, Agent prompts, browser payloads, general event buses, or ordinary job JSON;
- Runner receives a short-lived grant or broker handle when possible, not the long-lived source credential;
- revocation epoch / tenant offboarding / kill switch prevents new leases immediately even if an older source credential remains valid externally;
- fallback to stored reusable credentials is explicit per installation/policy and shown to Admins as a weaker credential posture;
- lease issuance/failure/expiry is audited without storing bearer values.


### 13.9 Transport Headers, Proxy Credentials, and Client-TLS Secret Resolution

Secret-bearing transport configuration SHALL be resolved at dispatch from `mcp_transport_profiles` and the secret manager, not copied into installation metadata or Agent context.

Dispatch requirements:
- resolve the exact profile generation authorized for the selected installation/connection;
- inject only approved custom headers and secrets for the intended origin/proxy hop;
- strip sensitive origin credentials when a redirect changes origin unless the explicit reviewed profile permits the new origin;
- proxy authentication credentials are scoped to the proxy and never forwarded to the MCP origin;
- mTLS private key operations SHOULD use non-exportable key handles/HSM/KMS-backed signing where available; raw private keys MUST NOT transit Chat/Agent/job payloads;
- profile changes, secret rotation, client-certificate rotation, proxy change, or CA change close/evict incompatible pooled connections before reuse;
- diagnostics show safe header names/profile generation/trust mode, never raw secret values;
- Runner-hosted remote MCP uses the same logical transport-profile contract even if the platform-specific secret injection mechanism differs.


### 13.10 Sender-Constrained / Proof-of-Possession Credential Mode

Bearer credentials remain supported where required by the upstream, but for high-risk remote MCP connections SmartAIHub SHOULD prefer sender-constrained credentials when the authorization/resource server supports them (for example mTLS-bound access tokens, DPoP-style proof, provider-bound workload identity, or an equivalent proof-of-possession mechanism).

Requirements:
- support is capability/provider-specific and MUST NOT be falsely advertised as part of core MCP interoperability;
- proof/key material is stored in KMS/Secret Manager or a hardware/OS-backed key facility where available, never in Chat, Agent context, ordinary DB JSON, or Runner logs;
- key generation/rotation is bound to the credential/connection generation and included in dispatch-time credential validation;
- a token/key pair cannot be reused across issuer, resource/audience, tenant, connection/account, or environment boundaries;
- proof timestamps/nonces have bounded skew/replay windows and use trusted server time;
- failover to plain bearer mode requires explicit policy and cannot happen silently because proof generation failed;
- revoking/rotating the sender-constrained key immediately makes new high-risk dispatch ineligible even if the token's nominal expiry has not passed.


## 14. Security Gates

Before MCP execution:

```text
Capability permission
  -> Tool approval state
  -> Health/availability
  -> Risk policy
  -> User confirmation if required
  -> Outbound DLP scan
  -> Credential resolution
  -> Execute
  -> Response DLP/redaction
  -> Audit
```

### 14.1 Outbound DLP

Detect and protect:
- passwords
- API keys
- private keys
- cloud credentials
- database credentials
- platform secrets
- tenant secrets
- sensitive configuration values

Policies:
- ALLOW
- MASK
- REQUIRE_CONFIRMATION
- BLOCK

---


### 14.2 Network Egress / SSRF / Redirect Defense

Remote MCP endpoints are untrusted network destinations. Server-side connection logic SHALL defend against SSRF and DNS-rebinding attacks.

Minimum controls:
- default-deny private/link-local/loopback IP ranges from the cloud/server gateway unless explicitly allowed by platform policy;
- local/private destinations belong on Runner where possible;
- resolve DNS and validate the resulting address before connection;
- re-validate destination after redirects and disallow protocol downgrade;
- bound redirect count;
- require TLS certificate validation for HTTPS;
- optionally enforce egress proxy / domain allowlist for enterprise tenants;
- block cloud instance metadata endpoints and known link-local metadata addresses;
- validate port/protocol policy;
- apply connection/read/overall timeouts and response-size limits;
- reject credentials embedded in endpoint URLs.

### 14.3 Local Process and Runner Isolation

For stdio/local MCP:
- execute an explicit executable + argv array; avoid invoking through a shell by default;
- environment inheritance MUST be allowlist-based;
- secrets are injected only for the child process that needs them;
- working directory MUST be constrained to an approved path;
- filesystem access SHOULD be sandboxed according to tool need;
- CPU, memory, process-count, execution-time, and output-size limits SHOULD be enforceable;
- unsigned/unpinned packages MAY require quarantine or admin approval;
- platform policy MAY require Docker/container isolation for high-risk MCP servers;
- Runner MUST prevent an MCP child process from controlling Runner management APIs merely because it runs on the same host.

### 14.4 Supply-Chain Trust and Security Scanning

Registry/catalog installation SHALL preserve supply-chain provenance:

```text
registry source
publisher/package identity
version
resolved artifact URL
checksum/digest
signature/attestation when available
install command
scanner findings
approval decision
```

The platform SHALL support pluggable security scanners for quarantined MCP packages/images/source metadata. Scanner output SHOULD normalize to SARIF or an equivalent internal finding schema.

Possible scanner classes include:
- dependency/vulnerability scanner;
- container/image scanner;
- secret scanner;
- static analysis;
- malware/reputation scanner.
- license/provenance compliance scanner or metadata check where SmartAIHub redistributes/packages the component.

Scanner findings do not automatically equal trust. Approval policy combines scanner results, registry trust, publisher provenance, requested permissions, transport, and risk tier.

Package/version upgrades SHALL be treated as a reviewable supply-chain change when they alter executable content, requested privileges, tool schemas, or security posture.
Where SmartAIHub redistributes or bundles a third-party MCP package/sidecar, the release process SHALL record its declared license/notices and block distribution when platform legal/compliance policy marks the license or provenance incompatible. This does not prevent a user from connecting to an independently hosted service where redistribution is not occurring.

### 14.5 Prompt/Tool Poisoning and Untrusted Metadata

All upstream descriptions, prompt templates, resource contents, tool annotations, icons, and extension metadata are untrusted.

They MUST NOT:
- override SmartAIHub system/developer policies;
- grant permissions;
- suppress confirmation requirements;
- trigger hidden tool calls;
- cause cross-tenant data exposure;
- be rendered as unsanitized HTML/script.

Capability ranking MAY use descriptions as retrieval text, but execution authorization derives only from trusted SmartAIHub policy and normalized metadata.

### 14.6 Untrusted Results, Files, and Indirect Instruction Defense

Tool results are untrusted external data just like prompts/resources. Successful execution does not make returned content trusted instructions.

Requirements:
- tag result provenance (`server`, `revision`, `tool`, `call`, `content type`) before passing it to RAG, UI, or a cognitive executor;
- external text that says to ignore policy, reveal secrets, or invoke another capability is data, not authority;
- model context assembly SHALL preserve trust boundaries so upstream output cannot become system/developer instructions;
- HTML/SVG/Markdown with active content MUST be sanitized before rendering; script/event handlers/unsafe URLs are blocked;
- downloaded/generated files pass MIME/extension/size policy and configured malware/content scanning before preview, indexing, or automatic downstream execution;
- archives are bounded against decompression bombs/path traversal;
- tool output MUST NOT automatically cause a second side-effecting call solely because the output instructed the model to do so; normal LangGraph/capability policy is re-entered for every follow-on call;
- inbound sensitive-data classification/redaction is applied before storing logs, vector indexes, or reusable memory.

### 14.7 MCP Apps Extension Security Contract

If the MCP Apps extension is enabled in the future, it SHALL remain opt-in per Platform/Tenant policy and MUST NOT bypass SmartAIHub UI/security boundaries.

Minimum enablement controls:
- isolated origin/sandbox for server-rendered UI;
- restrictive CSP and no ambient access to SmartAIHub cookies/local storage;
- explicit, versioned capability bridge rather than arbitrary parent-page scripting;
- `postMessage`/bridge messages validate origin, message type, schema, actor, and current app instance;
- OAuth/access tokens never enter app DOM/JavaScript unless an extension specification explicitly requires a safe delegated mechanism approved by security review;
- tool execution from an app re-enters normal Capability Gateway authorization/confirmation/DLP;
- file picker, clipboard, camera/microphone, navigation, popup, and download permissions are deny-by-default and separately grantable;
- app UI identity clearly displays the integration/publisher and cannot visually impersonate SmartAIHub security prompts;
- disabling/uninstalling the app immediately revokes its bridge/session handles.


### 14.8 Protocol Parser and Resource-Exhaustion Limits

MCP inputs and metadata are untrusted even when the transport is authenticated. The gateway SHALL enforce configurable bounds before expensive parsing/indexing/rendering.

At minimum bound:
- HTTP/stdio message bytes;
- JSON nesting depth / object and array cardinality;
- tool/resource/prompt schema bytes and definition count;
- tool argument bytes and string lengths;
- URI/header length/count;
- SSE event bytes and total request-stream bytes;
- catalog page count/item count/total bytes;
- resource/file/archive size;
- regex/pattern complexity where schemas are compiled into validators;
- JSON Schema 2020-12 `$ref` resolution depth/count, cycles, remote-reference policy, and composition keyword expansion (`allOf`/`anyOf`/`oneOf`/`not` etc.);
- MRTR input field count and rounds.

Validation failure returns a normalized size/complexity error and MUST NOT be retried automatically.
Remote JSON-Schema references are disabled by default; if enabled, they are fetched only through the same SSRF/egress policy and cached/bounded independently from business requests.

`Mcp-Param-*`, authorization headers, cookies, OAuth query fragments, and other potentially secret-bearing transport metadata MUST be redacted from application/WAF/access logs by explicit configuration. Header-based routing observability should log safe names/methods, not raw mirrored parameter values.



### 14.9 Endpoint, URI, and Filesystem Canonicalization

Security allow/deny decisions MUST operate on canonical targets, not raw user strings.

For remote endpoints/resource URIs:
- normalize scheme/host/port according to protocol semantics before policy comparison;
- apply IDNA/punycode handling and reject malformed/confusable host representations;
- resolve dot segments and reject credential-bearing URL userinfo unless explicitly supported by a reviewed credential flow;
- validate every redirect hop independently;
- apply DNS/IP policy to all resolved addresses and re-check at connect time as defined by the SSRF defense;
- do not treat percent-encoded or alternate numeric IP forms as different security targets.

For Runner/local paths:
- resolve canonical path after symlink/junction handling;
- enforce allowed roots/mounts **after** canonicalization;
- prevent `..`, symlink, junction, UNC/device-path, case-folding, and archive-extraction tricks from escaping the granted root;
- treat filesystem roots as authorization policy, not merely UI hints.

### 14.10 Privileged Operator / Break-Glass Controls

Emergency platform operations that bypass normal tenant workflow SHALL use an explicit break-glass path, not hidden super-admin behavior.

Break-glass requirements:
- strong re-authentication/MFA where supported;
- reason/ticket reference;
- narrow operation/scope and short expiry;
- prominent audit entry and security notification;
- no secret reveal unless the dedicated secret-management policy explicitly allows it;
- post-event review capability;
- break-glass cannot disable immutable audit recording.

Routine support/debugging SHOULD use scoped read-only impersonation/diagnostic views rather than assuming the user's credential identity.

### 14.11 Payload, Stream, Decompression, and Archive Budgets

Parser depth limits alone are insufficient. Every transport and primitive SHALL enforce bounded bytes/time/resource budgets before content reaches the model, indexer, scanner, or UI.

At minimum configure limits for:
- request body bytes;
- response body bytes;
- SSE/subscription message bytes and messages per minute;
- cumulative bytes per request/task/MRTR interaction;
- resource/file download bytes;
- compressed-to-expanded ratio and maximum expanded bytes;
- archive entry count, nesting depth, total extracted bytes, path traversal, and symlink handling;
- image/document dimensions/page counts when relevant to downstream processors;
- JSON object members/array length/string length in addition to schema depth/ref bounds.

Behavior:
- known `Content-Length` above policy is rejected before full read;
- streamed responses stop when the cumulative budget is exceeded;
- decompression and archive extraction occur in bounded isolated processing and reject compression bombs;
- partial oversized content MUST NOT be silently interpreted as a complete MCP result;
- platform/tenant limits may be stricter than global defaults but not weaker than mandatory security minimums;
- diagnostics expose which budget was exceeded without logging the rejected sensitive body.


### 14.12 Emergency Containment and Kill Switches

SmartAIHub SHALL provide a fast fail-closed containment path for compromised providers, packages, credentials, tools, revisions, tenants, or Runner fleets.

Containment targets MUST include at least:

```text
GLOBAL_MCP_EXECUTION
REGISTRY_SOURCE
SERVER_DEFINITION
SERVER_REVISION
INSTALLATION
CONNECTION / CREDENTIAL
CAPABILITY / TOOL
TENANT
RUNNER / RUNNER_REVISION
```

Requirements:
- emergency deny state is checked from an authoritative low-latency source at dispatch time and does not depend solely on eventual search-index/cache invalidation;
- a kill switch immediately rejects new WRITE/DESTRUCTIVE work and may reject READ according to incident policy;
- queued jobs are revalidated before dispatch and can be bulk-cancelled/quarantined;
- active subscriptions/listeners and Runner desired state receive high-priority invalidation;
- only designated Platform/Tenant incident roles can activate or clear containment within their scope;
- clearing a kill switch requires explicit review/reason and does not automatically restore revoked credentials or stale approvals;
- every activation/clear action creates tamper-evident privileged audit evidence;
- UI surfaces incident banner/status so operators understand why an otherwise healthy integration is blocked.


### 14.13 Privacy, Purpose Limitation, and Data Deletion

External MCP can move user/workspace data outside SmartAIHub. The gateway SHALL therefore distinguish authorization to execute from authorization to disclose data.

Requirements:
- outbound data sharing follows the stated purpose and minimum data categories needed for the selected capability;
- sensitive data categories MAY require an additional confirmation even when the tool itself is otherwise allowed;
- tool/resource results retained for RAG, logs, traces, or task recovery obey explicit retention and tenant scope;
- user/tenant deletion/offboarding triggers cleanup of indexed resource copies, pending-input content, temporary files, connection metadata, and revocable credentials according to policy;
- security/audit records retained for legitimate security/compliance reasons are minimized, redacted, access-controlled, and logically separated from ordinary user content;
- privacy deletion jobs are idempotent, auditable, and retryable, with a report of unresolved external-provider revocation/deletion obligations;
- legal/retention exceptions, if supported, MUST be explicit policy rather than an implicit reason to retain everything.


### 14.14 TLS, Server Authenticity, and Egress Identity Policy

SSRF-safe routing is necessary but does not by itself prove the intended upstream identity. Remote MCP connections SHALL enforce transport authenticity appropriate to deployment policy.

Requirements:
- HTTPS uses normal certificate/hostname validation; insecure TLS verification is disabled by default and cannot be enabled by ordinary end users;
- redirects from HTTPS to cleartext HTTP are blocked unless an explicitly approved development/local policy allows them;
- enterprise deployments MAY require private CA trust, mTLS, or certificate/public-key pinning for selected upstreams;
- custom trust anchors are tenant/platform-managed security configuration and are never supplied through untrusted tool metadata;
- proxy configuration, CONNECT tunneling, and corporate egress gateways remain subject to credential-redaction and destination policy;
- resolved upstream identity (canonical host, port, protocol, trust mode, and certificate/peer metadata when appropriate) is included in safe diagnostic/audit evidence;
- certificate rotation/pinning changes have a review/rollout path that avoids permanent lockout while never silently disabling verification.

### 14.15 Artifact Intake, Quarantine, Rendering, and RAG Admission

Any MCP response that materializes a file/document/blob into SmartAIHub SHALL pass a dedicated artifact-intake pipeline before Library/RAG admission.

Pipeline:

```text
Receive bounded bytes / provider reference
 -> canonical media/type detection
 -> content hash
 -> provenance binding
 -> malware/content/archive checks as required
 -> quarantine decision
 -> safe preview/transcode where applicable
 -> Library publish
 -> optional RAG indexing under ACL/provenance
```

Rules:
- filename extension and upstream MIME type are hints, not security truth;
- active HTML/SVG, office macros, scripts, executables, nested archives and polyglot files receive stricter handling;
- preview generation occurs in bounded sandboxed processing;
- artifacts that fail/timeout scanning remain non-executable and non-indexable until policy resolves them;
- derived previews/transcodes reference the original lineage and do not erase the original risk state;
- user deletion/offboarding and retention policy propagate to derived/indexed representations.

### 14.16 Security-Anomaly Escalation Without Attacker-Controlled Auto-Lockout

Repeated denied execution, OAuth-state failures, malformed protocol traffic, scanner detections, schema churn, credential failures, or suspicious discovery behavior MAY raise a scoped anomaly state.

Escalation policy MUST:
- aggregate by stable governed identities/destinations rather than attacker-controlled display names;
- distinguish likely provider outage/user error from credential attack or malicious package behavior;
- apply graduated controls: observe -> throttle -> require re-auth/review -> quarantine/contain;
- avoid permanent tenant/user lockout based solely on unauthenticated attacker traffic;
- require human review for broad/high-impact containment unless an emergency rule is explicitly approved;
- record the evidence/rule that triggered escalation and decay/reset conditions;
- integrate with existing kill-switch and abuse controls rather than creating a second policy plane.


### 14.17 Registry/Publisher Continuity and Namespace-Takeover Defense

Registry/package identity can change ownership even when a package name or URL remains the same. SmartAIHub SHALL distinguish a stable catalog label from verified publisher continuity.

Controls:
- preserve registry source, publisher subject/account, verified domain where available, package/artifact digest, signing identity, and ownership-transfer evidence;
- a publisher/account/domain/signing-key change is a reviewable trust event even when the package name/version sequence looks valid;
- automatic upgrade MUST NOT cross a publisher-identity discontinuity unless Platform policy explicitly approves the new provenance chain;
- abandoned/reclaimed package names or domains are treated as potential namespace takeover, not as continuity by name alone;
- registry redirects/mirrors require an approved trust mapping and cannot silently redefine publisher identity;
- UI SHALL show `publisher asserted`, `publisher verified`, `publisher changed`, and `unknown continuity` as distinct states;
- pinned internal allowlists should prefer immutable publisher/signing identifiers over display names.

### 14.18 Reverse-Proxy, Header-Trust, and HTTP Request-Smuggling Boundary

Because modern MCP uses HTTP headers for routing/metadata, SmartAIHub SHALL define a strict reverse-proxy trust boundary.

Requirements:
- internet/client-supplied `Mcp-*`, `Forwarded`, `X-Forwarded-*`, internal auth, tenant, actor, routing, or trace-privilege headers are stripped or overwritten at the first trusted ingress unless explicitly allowed by protocol contract;
- the gateway reconstructs authoritative `Mcp-Method`, `Mcp-Name`, mirrored parameter, tenant/principal, and internal routing headers from validated request state rather than trusting duplicate inbound values;
- conflicting duplicate headers, ambiguous casing/normalization, invalid control characters, or multiple incompatible `Content-Length`/transfer encodings fail closed;
- reverse proxies/load balancers use one documented HTTP parsing policy to reduce request-smuggling/desync differences between hops;
- hop-by-hop headers are removed correctly and sensitive routing headers are never reflected to an untrusted upstream unless required by MCP;
- public access logs/WAF logs redact sensitive `Mcp-Param-*` values and internal principal/routing metadata;
- proxy configuration is included in security regression tests, not treated as out-of-scope infrastructure.

### 14.19 Purpose-Bound Data-Egress Manifest and Minimum-Necessary Disclosure

DLP that detects secrets is not sufficient for ordinary personal, tenant-confidential, or regulated data. Before sending user/project data to an external MCP, SmartAIHub SHALL know **what categories of data, for what purpose, to which destination/account** are being disclosed.

For external calls that transmit user/project/library content, execution context SHOULD carry an egress manifest containing:

```text
destination_provider / server / account
purpose
source_object_ids
sensitivity_categories
selected_fields / content classes
retention expectation when known
billing owner
user-visible disclosure requirement
```

Rules:
- only fields/content necessary for the selected capability are sent by default;
- Agent reasoning MUST NOT broaden the disclosure scope merely because more context is available in memory/RAG;
- tenant residency/DLP/purpose policy evaluates the manifest before dispatch;
- high-risk or first-time disclosures MAY require user confirmation showing destination and data category in plain language;
- manifest/audit stores references/classifications rather than duplicating sensitive payloads;
- reusable workflow consent is valid only for its declared purpose/destination/data-category predicate;
- a later tool/schema change that expands expected data classes invalidates reusable consent when policy requires review.

### 14.20 Secure Default Deployment Profile

Spec 199 contains many configurable controls; an implementation MUST ship with a safe baseline so omission of configuration does not create a permissive deployment.

Default production profile:
- unknown/unverified MCP server: `QUARANTINED`;
- unknown security semantics/extension: fail closed for side effects;
- personal custom MCP: disabled unless Platform/Tenant policy enables it;
- WRITE: at least policy evaluation and audit; `ASK` when no narrower approved policy exists;
- DESTRUCTIVE/PRIVILEGED: explicit confirmation or pre-approved tightly scoped automation policy;
- remote schema references: disabled;
- insecure TLS / certificate verification bypass: disabled;
- legacy/deprecated protocol fallback: disabled unless explicitly enabled per installation;
- cross-tenant/shared cache: denied unless cache-key proof shows no principal-sensitive semantics;
- Runner local filesystem/shell/process privilege: deny-by-default and allowlisted;
- auto-upgrade across provenance/publisher discontinuity: disabled;
- audit/security evidence: enabled independently of optional telemetry sampling.

Development profiles MAY relax selected controls only with an obvious environment banner and MUST NOT silently become production defaults.
### 14.21 Dual-Control / Four-Eyes Policy for Critical Control-Plane Changes

Deployments MAY require two-person approval for a configurable set of high-impact MCP control-plane actions. When enabled, the same principal cannot both propose and approve the change.

Candidate actions include:
- trusting a new publisher/signing identity after continuity failure;
- disabling a platform-wide kill switch or quarantine imposed by security policy;
- enabling insecure/legacy transport exceptions in production;
- changing residency/failover authority for protected tenants;
- binding or rotating a platform/tenant shared credential with broad privilege;
- relaxing DESTRUCTIVE/PRIVILEGED policy at platform scope;
- crossing an irreversible migration barrier;
- approving a compromised-package override.

Dual-control records SHALL bind the exact proposed mutation, generation/version, scope, reason, proposer, approver, expiry, and canonical hash. Any material edit invalidates the pending approval. Emergency break-glass MAY bypass dual control only when policy explicitly permits, with stronger audit, expiry, and post-incident review.

### 14.22 External Data Erasure Boundary and Upstream Privacy Obligations

SmartAIHub can delete or cryptographically erase data it controls, but an External MCP may already have received or persisted data outside SmartAIHub. Product/UI/privacy language MUST NOT imply that deleting SmartAIHub data automatically deletes copies held by an external provider.

Requirements:
- egress manifests identify the external destination/account and data categories disclosed;
- deletion/offboarding produces a machine-readable list of internal deletion completed versus external-provider obligations/unverified copies;
- where an upstream exposes a safe deletion/revocation capability, it MAY be invoked only under normal authorization/risk/confirmation policy and its outcome is recorded as external evidence;
- lack of an upstream erasure API is surfaced as `EXTERNAL_ERASURE_UNVERIFIED`, not silently marked complete;
- privacy requests MUST NOT replay destructive external deletion calls blindly after ambiguous outcomes;
- external-provider retention/legal terms remain provider responsibility and are linked/described where product policy requires;
- retained SmartAIHub audit evidence records that disclosure occurred without unnecessarily retaining the disclosed content itself.

### 14.23 Supply-Chain Advisory, Vulnerability, and Trust-Revocation Propagation

Initial provenance scanning is not sufficient for long-lived installations. SmartAIHub SHALL support ongoing impact evaluation when a registry/publisher/package/runtime later becomes known-bad.

The control plane MAY ingest trusted advisories, revoked signing keys/certificates, package digest revocations, registry security notices, or administrator findings. Each advisory SHALL preserve source, issued/updated time, affected identity/range/digest, severity, confidence, and remediation guidance.

When an advisory matches installed revisions:
- compute affected tenants/Runners/Agents/Workflows before taking action where time permits;
- emergency policy may quarantine/disable affected revision(s) immediately;
- trust revocation increments the appropriate revocation epoch and invalidates stale execution eligibility;
- replacement/upgrades never inherit approval solely because package name is unchanged;
- unresolved advisory status appears in health/capability ranking and operator UI;
- false-positive/override decisions are scoped, expiring where appropriate, and audited.

Security-advisory ingestion MUST itself be authenticated, deduplicated, bounded, and resistant to untrusted feeds causing platform-wide denial of service.



### 14.24 HTTP Client Pool, Connection Reuse, and Socket Isolation

Persistent HTTP/2/HTTP/3/keep-alive pools improve efficiency but can cause credential/context bleed if client instances or middleware carry mutable per-request state. SmartAIHub SHALL treat transport pooling as a security boundary.

Pool partition/equality MUST consider at least:
- canonical origin and resolved egress policy;
- TLS trust policy / mTLS identity;
- outbound proxy identity;
- protocol adapter/version where semantics differ;
- credential transport mode when connection-level authentication exists;
- tenant/installation isolation where middleware/client objects retain mutable state.

Rules:
- `Authorization`, cookies, MCP routing headers, request IDs and tenant metadata are set per request from immutable execution context, never inherited from a previous pooled request;
- cookie jars are disabled by default unless an upstream explicitly requires cookies and the jar is partitioned by the correct connection/account scope;
- connection pools, sockets/file descriptors, streams, pending DNS lookups, and concurrent handshakes have global + tenant + upstream quotas and bounded idle lifetime;
- pool eviction/reconnect does not bypass DNS/SSRF/TLS revalidation;
- tests intentionally interleave two tenants/two external accounts over the same upstream origin and prove no header/body/context leakage.


### 14.25 Browser-Side Sensitive Data and Client Cache Policy

MCP management UI and Chat approval surfaces may display sensitive arguments, resource names, account identifiers, incident evidence, or provider output even when no secret token is exposed.

Requirements:
- secret/token fields are never sent to the browser merely for display masking;
- sensitive management/approval responses use appropriate `Cache-Control: no-store` (or stricter equivalent) and are excluded from service-worker/offline caches;
- do not persist sensitive MCP payloads, approval arguments, OAuth state, `requestState`, provider errors, or evidence bundles in `localStorage`/IndexedDB unless a separately approved encrypted offline feature exists;
- frontend analytics/session replay/error telemetry MUST redact or omit arguments, external resource URIs, account identifiers, prompt/resource bodies, authorization callback data, and evidence content;
- copy/download controls for high-risk fields are explicit and audited where required by policy;
- browser back/forward restore and stale tabs must revalidate privileged/session/approval state before enabling a mutation.


### 14.26 Explicit Threat Model and Trust-Boundary Register

Implementation SHALL maintain a versioned threat-model artifact linked from this spec. At minimum it covers these actors/boundaries:

```text
untrusted end user / compromised browser
malicious or compromised upstream MCP server
compromised registry/publisher/package
malicious tool/resource/prompt metadata
compromised Runner or local MCP process
cross-tenant attacker
stolen external credential
malicious/over-permissioned Agent or prompt injection
compromised reverse proxy / misconfigured forwarding headers
region/network partition and stale executor
privileged administrator / break-glass misuse
supply-chain and dependency compromise
```

For every boundary, document protected assets, attacker capabilities, required controls, residual risk, and verification test. Threat-model changes are required when enabling a new transport, extension, privilege class, credential mode, MCP App bridge, or cross-region execution path. “Trusted because internal” is not an acceptable security assumption without an explicit administrative trust boundary.


### 14.27 Audience-Specific Result Projection and Least-Disclosure

A validated MCP result is not automatically safe or necessary for every downstream audience. SmartAIHub SHALL project results by audience before disclosure.

Supported audiences include at minimum:
- orchestration/control logic;
- Cognitive Executor / model context;
- end-user UI;
- audit/telemetry;
- RAG/indexing;
- downstream Skill/Agent/MCP capability.

Rules:
- the canonical protected result/evidence remains separate from audience projections;
- model-facing projection includes only fields required for reasoning/tool chaining and excludes credentials, opaque internal IDs, unnecessary PII, raw binary data, and unrelated metadata;
- user-facing projection may expose human-relevant fields that are intentionally withheld from the model;
- audit/metrics receive redacted summaries, not unrestricted payloads;
- RAG/indexing occurs only under the explicit artifact/resource admission and ACL lineage rules;
- downstream capability projection is governed by the purpose-bound egress manifest and minimum-necessary disclosure policy;
- projection transforms are deterministic/versioned for high-risk flows so approval/evidence can explain what was disclosed to whom;
- failure to construct a required safe projection fails closed for that audience rather than falling back to raw result delivery.

### 14.28 Expiring References, Signed URLs, and Deferred Resource Fetch Safety

MCP results/resources MAY contain external URLs or short-lived signed references whose security state changes between discovery/approval and dereference.

Requirements:
- an external/signed URL is data, not authorization to fetch;
- every fetch re-enters SSRF/redirect/TLS/residency/DLP/size/content-type policy at fetch time;
- approval of a tool call does not permanently approve arbitrary future URLs returned by that call;
- expiry, audience, host, object key/path, and expected content type/size are recorded when observable and revalidated before use;
- redirects from signed/reference URLs do not carry authorization headers/credentials across origin boundaries unless explicitly permitted;
- expired references produce a normalized recoverable state when safe refresh semantics are known; they MUST NOT cause blind re-execution of a prior WRITE/DESTRUCTIVE tool merely to obtain a fresh URL;
- fetched artifacts retain both originating capability provenance and dereference/final-origin provenance;
- model/UI rendering uses the quarantined/sanitized artifact path rather than embedding remote active content directly.


### 14.29 Browser-Origin, CSRF, CORS, and Cookie Boundary

Management-plane and OAuth callback endpoints are browser-exposed security boundaries. Authentication alone is insufficient protection against cross-site mutation.

Requirements:
- state-changing browser requests require anti-CSRF protection appropriate to the authentication mode (for example same-site cookies plus CSRF token/origin verification); bearer-only API clients are handled separately and cannot inherit browser ambient credentials;
- privileged session cookies use `Secure`, `HttpOnly`, and an explicitly chosen `SameSite` policy; cookie scope/domain/path are minimized;
- CORS is deny-by-default and allowlists exact trusted SmartAIHub origins; wildcard origin with credentials is forbidden;
- validate `Origin`/`Sec-Fetch-*` or equivalent browser context signals for high-risk mutations where technically reliable, without treating them as the sole authorization mechanism;
- OAuth redirect/callback pages do not accept privileged state changes from arbitrary embedding origins and do not leak code/state/token values through referrer, analytics, third-party scripts, or browser history;
- management pages use frame-ancestors/clickjacking protection unless an explicitly reviewed embedding scenario exists;
- CSRF defenses are covered by browser integration tests for Platform Admin, Tenant Admin, user account connect/disconnect, approval, break-glass, and kill-switch operations.

### 14.30 SBOM, VEX, Transitive Dependency, and Build-Provenance Contract

Package/image/source scanning in Section 14.4 SHALL be supplemented with machine-readable software supply-chain evidence when available.

SmartAIHub SHOULD ingest and verify:
- SPDX or CycloneDX SBOMs;
- VEX/CSAF or equivalent exploitability statements;
- signatures / transparency evidence;
- in-toto/SLSA-style provenance or equivalent build attestations;
- license/notice manifests for redistributed components.

Rules:
- SBOM/VEX claims are evidence, not automatic trust; unsigned/unverifiable evidence is labeled accordingly;
- transitive dependencies are associated with the immutable runtime/package digest so later dependency advisories can impact-map installed revisions;
- VEX statements that mark a vulnerability not affected MUST preserve issuer, scope, justification, expiry/update time and MAY be overridden by Platform security policy;
- provenance discontinuity, builder/signing-key change, missing expected SBOM, or digest mismatch is a review signal and MAY quarantine high-risk revisions;
- Runner-local installation promotion SHOULD record the final installed artifact/image/environment digest after lifecycle scripts, not only the registry package version string;
- security evidence retention must support historical incident reconstruction without retaining secret package-manager credentials.

### 14.31 Content-Type, MIME Sniffing, and Active-Content Integrity

An upstream-declared MIME/content type is untrusted metadata. Before preview, RAG indexing, browser rendering, or downstream capability use, SmartAIHub SHALL reconcile declared type with bounded content inspection where feasible.

Requirements:
- material type mismatch is recorded and may quarantine/block active content;
- `text/html`, SVG, scriptable documents, office macro formats, archives, executables and polyglot files follow stricter render/index/download policies;
- browsers receive `X-Content-Type-Options: nosniff` or equivalent on protected artifact delivery where applicable;
- filename extension never overrides security classification derived from content inspection;
- content sniffing itself is bounded by bytes/time/decompression policy and MUST NOT fully parse hostile oversized files merely to identify type;
- model/RAG text extraction occurs in an isolated converter/parser where applicable and preserves originating content-type/provenance;
- a file that cannot be classified safely is downloadable only according to policy and is not automatically rendered/indexed/executed.

### 14.32 MCP Resource / RAG Instruction Isolation and Trust Labels

MCP-derived resources admitted to RAG SHALL remain **data**, not instruction authority, even if their text resembles system prompts, tool directives, security policy, or administrator messages.

Requirements:
- each indexed MCP-derived document carries `source_trust_class` and `instruction_isolation_mode` from authoritative lineage;
- model context assembly wraps/labels untrusted external RAG excerpts as quoted/retrieved data and never concatenates them into system/developer instruction channels;
- resource text cannot grant capability access, request credential disclosure, change approval mode, suppress citations, or silently trigger follow-on tools;
- high-risk resource sources MAY be searchable for the user while being `BLOCKED_FROM_MODEL` for autonomous reasoning;
- retrieval rank does not upgrade trust; a top-ranked external resource remains untrusted external content;
- RAG answer generation SHOULD preserve citations/provenance sufficient to identify the originating MCP server/revision/resource without leaking inaccessible metadata;
- trust-label or instruction-isolation policy changes invalidate/rebuild affected projections and take effect at query time before eventual vector purge/reindex completes.


## 15. Health Monitoring

Supported states:
- `CONNECTED`
- `DEGRADED`
- `OFFLINE`
- `AUTH_REQUIRED`
- `QUARANTINED`
- `TOOL_CHANGED`
- `DISABLED`
- `RATE_LIMITED`

Health loop:
- protocol-safe readiness probe appropriate to the negotiated adapter;
- `server/discover`/lightweight compatibility check where supported by the modern protocol path;
- primitive catalog refresh (`tools/list`, `resources/list`, `prompts/list`) according to advertised capability and cache TTL;
- schema/content hash comparison;
- auth validity / proactive refresh state;
- latency/error-rate update;
- Runner process/container health for local services.

Legacy `ping` or session-specific health behavior MAY be used only by the legacy compatibility adapter. Health polling SHALL be configurable per server type, honor upstream cache hints where applicable, and use backoff/jitter for failing servers.

---

### 15.1 Maintenance, Graceful Drain, and Rolling Restart

Health is not binary during deploy/maintenance. Gateway/Runner/sidecar instances SHALL support a drain state so rolling upgrades do not create ambiguous side effects.

Recommended lifecycle:

```text
READY -> DRAINING -> STOPPING -> STOPPED
```

Rules:
- `DRAINING` instances stop accepting new executions but may finish bounded in-flight requests;
- new long-running tasks/MRTR flows are routed elsewhere or queued before drain begins;
- subscriptions/listeners are closed/re-established deliberately and trigger freshness reconciliation;
- non-idempotent requests that cross shutdown boundaries follow UNKNOWN_OUTCOME rules, never blind replay;
- Runner process upgrades wait for safe drain or require an operator-approved forced interruption path;
- deploy readiness/liveness probes distinguish `not accepting new work` from `crashed`;
- shutdown has a finite deadline, after which remaining operations are marked/cancelled according to their durability contract;
- version rollout telemetry shows in-flight work by runtime revision before an old revision is retired.


### 15.2 Side-Effect-Free Health and Synthetic Probe Contract

Health/readiness checks MUST NOT call arbitrary business tools merely to prove an MCP server is alive.

Rules:
- prefer transport reachability, protocol-safe discovery/readiness, cache-aware list operations, or provider-specific read-only status endpoints;
- a tool call may be used as a synthetic probe only when it is explicitly registered as side-effect-free, uses a dedicated test account/sandbox, and its cost/privacy implications are accepted by policy;
- WRITE/DESTRUCTIVE/PRIVILEGED tools are never used for automatic health probes;
- health probes do not consume reusable user approvals or impersonate an end user's external account unless the user explicitly owns that monitored connection;
- probe traffic has separate rate/concurrency/budget accounting and cannot starve production calls;
- probe failure affects health confidence but does not prove a user-specific credential is invalid unless that credential was actually tested under an authorized check;
- health UI distinguishes `service reachable`, `catalog fresh`, `shared credential ready`, and `specific user connection ready` rather than collapsing them into one green dot.

## 16. Concurrency, Backpressure, and Queueing

Limits SHALL exist at:
- global gateway
- tenant
- user
- upstream server
- tool
- Runner

Examples:
- GitHub MCP: 10 concurrent calls
- local Blender MCP: 1
- expensive private MCP: configurable
- rate-limited external SaaS: token bucket / concurrency cap

Long-running calls SHOULD integrate with `worker_jobs`.

Short synchronous calls MAY stay inline if within the configured latency threshold.

---

### 16.1 Circuit Breakers and Upstream Fairness

Each upstream/server revision SHOULD have a circuit breaker separate from health labels:

```text
CLOSED -> OPEN -> HALF_OPEN -> CLOSED
```

Open the circuit on configured transport/protocol/error-rate thresholds; do not count policy denials or user cancellations as upstream failures. HALF_OPEN probes are tightly bounded.

Backpressure rules:
- honor valid upstream `Retry-After` / rate-limit signals where available;
- per-tenant/user queues SHALL prevent one noisy tenant from consuming all upstream concurrency;
- use weighted/fair scheduling for shared platform-funded upstreams;
- interactive calls SHOULD have bounded queue TTL and fail visibly rather than execute stale side effects minutes later;
- queued WRITE/DESTRUCTIVE calls MUST revalidate approval freshness, credentials, schema revision, and policy when dequeued;
- retries use jitter and must respect the operation idempotency class.

### 16.2 Admission Control and Queue Cancellation

Before enqueue/dispatch, estimate whether the request can complete within configured deadline/quota. Admission control MAY reject early with a normalized transient/quota error rather than accepting work that cannot reasonably run.

Cancellation must remove a not-yet-dispatched item atomically. If dispatch may already have occurred, transition to the same `UNKNOWN_OUTCOME`/reconciliation semantics used for ambiguous writes instead of claiming it was cancelled safely.



### 16.3 Hierarchical Quota Reservation and Settlement

Budget enforcement SHALL be race-safe across gateway instances/regions. For calls that consume platform/tenant-managed external quota or money:

1. compute a conservative estimate or declared maximum;
2. atomically reserve budget at all applicable scopes (platform/tenant/user/integration/provider);
3. dispatch only after reservation succeeds;
4. settle actual usage/cost when provider evidence is available;
5. release unused reservation;
6. move ambiguous billing to `RECONCILE_REQUIRED` rather than guessing.

Rules:
- reservations have TTL and idempotency key bound to the execution intent;
- concurrent calls cannot each observe the same remaining budget and overspend it;
- fair-share/concurrency limits remain separate from monetary quota;
- a user-funded external account MAY bypass SmartAIHub monetary reservation, but still obeys safety/rate/tenant policies and any provider quota signals;
- admin UI shows `reserved`, `settled`, and `pending reconciliation` separately.

### 16.4 Retry Ownership, Attempt Lineage, and Amplification Budget

Retries SHALL have one clear owner per failure domain. SDK, Gateway, queue/worker, Runner, and upstream adapter MUST NOT independently retry the same operation without coordination.

Canonical retry ownership:
- connection establishment / safe transport handshake: MCP transport adapter;
- short idempotent READ transient failure: Gateway adapter within a bounded retry budget;
- queued/durable execution: `worker_jobs` retry policy owns execution retries;
- OAuth refresh: credential single-flight logic owns refresh retry;
- subscription reconnect: subscription manager owns reconnect/backoff;
- non-idempotent WRITE/DESTRUCTIVE after possible dispatch: no automatic retry; use effect verification / `UNKNOWN_OUTCOME` reconciliation;
- task polling: task adapter owns polling schedule, not the generic retry layer.

Every attempt SHALL carry:
```text
execution_intent_id
attempt_id
parent_attempt_id nullable
retry_owner
retry_reason
retry_budget_remaining
deadline_remaining
```

Rules:
- retry count/time budget is end-to-end bounded and inherited, not reset at each service hop;
- exponential backoff includes jitter and honors valid upstream Retry-After limits;
- nested retry middleware MUST detect an existing retry owner/budget and avoid multiplicative amplification;
- circuit-breaker probes do not consume normal user retry loops in a way that creates duplicate writes;
- UI/audit shows `attempts` separately from logical `executions` so operators do not confuse retries with user actions.
### 16.5 Rate-Limit Signal Normalization, Jitter, and Herd Control

Adapters SHALL normalize upstream throttling signals without trusting arbitrary values blindly.

Requirements:
- parse valid `Retry-After` and provider-specific reset/quota headers only from the authenticated intended upstream response;
- clamp retry/reset delays to configured minimum/maximum bounds and reject malformed/overflow values;
- convert normalized rate-limit state into shared per-upstream/per-credential admission metadata where appropriate so every gateway instance does not rediscover the same throttle independently;
- add randomized jitter to reconnect/retry/poll schedules to avoid synchronized thundering herds;
- HALF_OPEN circuit probes are leader/budget controlled rather than every tenant firing a probe simultaneously;
- interactive callers receive a bounded retry-after hint when safe, while scheduled work may defer according to its deadline/queue TTL;
- rate-limit state never authorizes replay of non-idempotent operations;
- provider quota headers are operational hints, not authoritative SmartAIHub billing records.

A malicious server cannot force effectively infinite queue retention by returning an extreme retry delay.



### 16.6 Runtime Resource Fairness and Noisy-Neighbor Isolation

Request concurrency and monetary budget do not fully protect finite runtime resources. Gateway and Runner admission SHALL account for bounded resources such as CPU, memory, sockets, subprocess slots, GPU/VRAM, model slots, local ports, and disk/temp space where applicable.

Requirements:
- define per-runtime resource classes and capacity source of truth;
- reserve scarce/exclusive claims atomically before dispatch when overcommit would make execution unsafe or predictably fail;
- support tenant/user/automation fairness so one MCP integration cannot starve unrelated workloads;
- `worker_jobs`/Runner owns durable execution scheduling; MCP resource claims integrate with that ownership rather than create a second scheduler;
- release is fenced/idempotent and crash recovery uses reconciliation;
- oversubscription MAY be permitted only for explicitly shareable resource classes with documented policy;
- resource pressure affects readiness/routing and produces `MCP_RESOURCE_CAPACITY_UNAVAILABLE`, not a generic MCP failure.


### 16.7 Rate-Limit / Circuit-Breaker Scope Isolation, Bulkheads, and Starvation Bounds

A single circuit breaker or rate-limit bucket for an entire SaaS origin can create a cross-tenant denial of service when the provider actually limits by external account, OAuth client, tenant, API key, or tool class. SmartAIHub SHALL model admission state at the narrowest authoritative provider scope that is known.

Requirements:
- adapters declare normalized throttle/breaker dimensions such as `origin`, `provider_tenant`, `connection/account`, `credential_generation`, `tool family`, or `global` when evidence supports them;
- authentication/permission failures for one account do not open a server-wide transport circuit;
- origin-wide transport/protocol failures may open a broad circuit when appropriate;
- shared global provider limits are represented explicitly rather than guessed from one tenant's response;
- queues use bulkheads so a rate-limited tenant/account/tool class cannot consume all slots for healthy tenants/accounts;
- interactive/readiness traffic and background/batch traffic have bounded priority classes with aging/starvation prevention; priority cannot bypass permission/budget/risk controls;
- kill-switch/revocation/control-plane invalidations may use a protected high-priority lane that is itself bounded against abuse;
- provider throttle headers are attributed only to the verified scope/account that produced them; one connection cannot poison another account's rate-limit state;
- dashboards expose the breaker/throttle key scope so operators can distinguish provider outage from one-account exhaustion.


### 16.8 In-Flight Revocation, Termination, and Late-Result Semantics

Revocation/kill-switch checks before dispatch are necessary but do not guarantee that already in-flight work stops before causing an external effect.

Rules:
- when a relevant kill switch, revocation epoch, account revocation, Runner trust loss, or tenant disable occurs, the control plane marks affected in-flight executions `REVOCATION_PENDING` and attempts protocol/Runner cancellation when safe and supported;
- cancellation has a bounded termination grace period; after the grace period, SmartAIHub fences local executors and stops consuming additional downstream side effects/results even if the upstream continues working;
- a WRITE/DESTRUCTIVE call that crossed the external dispatch boundary and cannot prove pre-effect cancellation becomes `UNKNOWN_OUTCOME` and enters effect reconciliation;
- late success/progress from a revoked execution is retained only as protected evidence and MUST NOT re-enable dependent workflow steps, user-visible success automation, RAG ingestion, or new capability calls until current policy explicitly permits reconciliation handling;
- READ results arriving after access revocation are discarded from user/model projection unless current authorization independently allows the same data at projection time;
- revocation does not forge a false upstream rollback; UI clearly differentiates `revoked locally`, `cancel requested`, `upstream cancellation confirmed`, and `external effect unknown`;
- in-flight termination is generation/fencing aware so an older region/Runner cannot publish a terminal result over the current revocation epoch.


## 17. Integration with `worker_jobs`

Use `worker_jobs` when:
- MCP runs on Runner
- startup/teardown is nontrivial
- execution may exceed synchronous timeout
- retry/recovery is needed
- artifacts are produced
- resource capacity must be reserved

Canonical trace:

```text
chat_run
  -> orchestration_run
     -> agent_run (optional)
        -> capability_call
           -> mcp_call
              -> worker_job (optional)
```

`worker_jobs` remains execution truth; MCP tables do not duplicate job lifecycle ownership.

---


### 17.1 Lease Fencing and Zombie-Executor Prevention

Lease expiry/heartbeat alone is insufficient because a paused or partitioned old Runner/worker may resume after another executor has acquired the job. SmartAIHub SHALL use monotonic fencing for SmartAIHub-controlled durable/Runner execution.

Requirements:
- every ownership acquisition increments/assigns a fencing token;
- Runner/job mutation endpoints require the current token; stale tokens are rejected;
- local MCP runtime manager checks the current execution lease before beginning a SmartAIHub-controlled side effect and before publishing authoritative completion/artifact state;
- a late result from a stale executor may be retained as diagnostic evidence but cannot overwrite the newer execution state;
- lease takeover is audited and surfaces the previous/new owner and epoch;
- fencing cannot guarantee at-most-once behavior inside an arbitrary remote third-party MCP server. For remote upstreams, SmartAIHub relies on `execution_intent_id`, provider idempotency when available, and `UNKNOWN_OUTCOME` instead of pretending an external side effect can be fenced.

### 17.2 Shared Durable-State / Realtime-Transport Contract with Spec 200

Spec 199 and Spec 200 SHALL use the same execution-control semantics:

```text
worker_jobs / worker_job_events
= durable execution state, lifecycle and history

Runner Control Channel
= realtime transport for command / ACK / progress / event / reconciliation traffic
```

Requirements:
- Spec 199 SHALL NOT create a separate MCP-only Runner job table that competes with `worker_jobs` for lifecycle ownership;
- Spec 200 SHALL NOT create a separate External-Agent durable job system for the same execution intent;
- the same job/attempt may carry both agent-runtime and MCP capability sub-events while retaining one end-to-end `execution_intent_id`/trace lineage;
- one retry owner applies per failure domain; MCP retry and Agent Runtime retry cannot both independently recreate the same external side effect;
- `lease_epoch`/fencing, cancellation, `UNKNOWN_OUTCOME`, partial success, effect verification and compensation rules are shared;
- realtime channel reconnect/replay is reconciled against durable state; it does not redefine durable state from a stale local event buffer.

## 18. Runner MCP Bridge

SmartAIHub Runner SHALL support an MCP Runtime Manager responsible for:
- start/stop local MCP process
- stdio lifecycle
- process supervision
- stdout/stderr capture
- restart/backoff
- health report
- tool discovery forwarding
- credential injection without exposing secrets to UI/LLM
- version reporting
- capability advertisement to server

A third-party sidecar such as `mcpproxy-go` MAY be used initially.

However, the Runner API MUST expose only SmartAIHub-owned contracts, so implementation can later change without affecting upstream services.

---


### 18.1 Runner Installation and Runtime Lifecycle

Runner-hosted MCP SHALL have a reproducible installation/runtime contract:
- exact package/image/binary version recorded;
- install source recorded;
- checksum/digest recorded where available;
- dependency/runtime requirements validated before activation;
- startup command generated from structured config, not arbitrary shell text for ordinary users;
- updates staged and health-checked before replacing a working version where feasible;
- rollback path retained for failed upgrades;
- local logs use bounded rotation;
- orphan child processes are reaped on Runner restart;
- port collisions and duplicate service names are detected before launch.

### 18.2 Runner-to-Server Trust

The server SHALL authenticate Runner identity before accepting MCP capability advertisements or execution results.

A Runner MAY advertise availability but MUST NOT self-grant tenant/user/tool permission.

Runner messages SHALL include:
- runner identity;
- service/version identity;
- capability/schema digest;
- heartbeat timestamp;
- trace/job correlation;
- signed/authenticated transport according to existing Runner security architecture.

### 18.3 Optional `mcpproxy-go` Sidecar Contract

When `mcpproxy-go` is used as a local sidecar:
- pin an approved sidecar version range;
- record sidecar version in Runner telemetry;
- map sidecar health/tool states into SmartAIHub normalized states;
- keep sidecar config generated from SmartAIHub-owned data;
- never let sidecar local policy override stricter SmartAIHub policy;
- disable or restrict sidecar management surfaces that would create an ungoverned parallel configuration path;
- sidecar upgrades require compatibility tests against supported MCP protocol versions and Runner platforms.

The sidecar is replaceable implementation detail, not a user-visible platform dependency.


### 18.4 Desired-State Reconciliation and Revision Rollout

Server-side desired state SHALL identify the approved `server_revision_id` for each Runner service. Runner heartbeats report observed revision/digest separately.

States include:

```text
IN_SYNC
UPDATE_AVAILABLE
UPDATING
ROLLBACK_REQUIRED
DRIFTED
BLOCKED_REVISION
```

A Runner MUST NOT silently substitute a different package version because a package manager resolved a newer tag. Mutable tags such as `latest` must resolve to and persist an immutable digest before approval/execution. Platform/Tenant admins may stage a revision to a subset of Runners, validate health/tool catalog, then promote or roll back.


### 18.5 Runner Trust Model and Local Integrity Boundary

Authentication proves which Runner is connected; it does **not** prove that a user-controlled machine, local MCP process, or returned file/result is trustworthy.

Therefore:
- Runner-reported schemas/results remain untrusted inputs and pass normal validation/scanning;
- server compares advertised service revision/digest against approved desired state before making capabilities executable;
- a compromised/local-modified Runner cannot self-approve a new revision or expand filesystem/network permission;
- high-assurance tenants MAY require device posture/attestation or managed-device enrollment before privileged local capabilities are allowed;
- local artifacts uploaded to Library retain Runner/service/revision provenance and configured malware/content scanning;
- sensitive enterprise policies may disallow local MCP entirely even when the user owns a Runner.


### 18.6 Runner Trust Freshness and Posture Decay

Runner trust/attestation is time-bounded state, not a permanent property of a device.

The server SHALL track relevant freshness such as:
- last authenticated heartbeat;
- Runner binary/version/digest;
- device posture/attestation timestamp when used;
- OS/runtime security state when provided by an approved attestation mechanism;
- active server-revision digest;
- credential/key generation.

Privileged local capabilities MAY require `TRUSTED_FRESH` posture. If attestation expires, Runner binary changes unexpectedly, device enrollment is revoked, or integrity evidence becomes stale:
- READ/low-risk operations follow tenant policy;
- WRITE/DESTRUCTIVE/privileged local operations fail closed or require explicit review;
- existing queued work is revalidated before dispatch;
- prior approvals do not elevate a newly changed/untrusted Runner;
- UI distinguishes `ONLINE` from `TRUSTED_FOR_PRIVILEGED_EXECUTION`.


### 18.7 Runner Resource Claims and Local Port / Process Ownership

For local MCP servers, Runner SHALL reconcile runtime resource claims with actual process/container state.

Examples:
- exclusive GPU or VRAM reservation;
- TCP port reservation before launching localhost MCP;
- bounded subprocess/process-group slot;
- temp-disk reservation for artifact-producing tools;
- model/runtime singleton where two copies are unsafe.

Runner reports capacity and claim occupancy to the control plane, but cannot unilaterally grant a claim beyond tenant/platform policy. Launch uses the current fencing epoch and verifies that a reserved port/resource is still owned immediately before bind/start. If the process dies, the claim is not considered safely reusable until process/resource reconciliation proves the old owner cannot continue producing authoritative output.


### 18.8 Staged Installer Sandbox and Package Lifecycle-Script Policy

Installing a local MCP package is itself code execution and SHALL NOT be treated as harmless setup.

Runner installation requirements:
- resolve/download into a staging area separate from active runtime and user project directories;
- ordinary installs do not receive user OAuth tokens, MCP execution credentials, tenant secrets, browser cookies, SSH keys, or unrelated Runner environment variables;
- package-manager lifecycle hooks (`preinstall`, `postinstall`, build hooks, arbitrary setup scripts, equivalent mechanisms) are disabled by default where the ecosystem permits, or executed only inside the declared installer sandbox with explicit network/filesystem/process policy;
- installer network access is default-deny or restricted to approved registries/artifact origins for hardened deployments;
- dependencies are pinned/resolved reproducibly where feasible and the resulting lock/digest/provenance is persisted before activation;
- package resolution/install does not occur lazily inside a user tool call; runtime execution uses a previously admitted revision;
- executable files produced by install are re-scanned/hashed before promotion to active revision;
- failed install/update never destroys the last known-good runtime; activation is atomic/staged with rollback where feasible;
- installer stdout/stderr is bounded and secret-redacted;
- a package requesting broader installer privileges than the approved profile returns to security review.

### 18.9 Localhost MCP Endpoint Authentication and Process-Binding

`127.0.0.1` / `localhost` is a network location, not an identity. Another local process may bind or race a port and impersonate an intended MCP server.

For Runner-managed localhost MCP:
- prefer stdio, Unix-domain socket, named pipe, or another OS-authenticated local channel where practical;
- if TCP loopback is used, Runner reserves/binds the port under the current resource/fencing claim and verifies ownership immediately before handoff/start;
- use a per-launch unguessable local endpoint credential/nonce or equivalent mutually authenticated handshake when the upstream supports/wraps it;
- endpoint credentials rotate when the managed process restarts and are never exposed to browser pages, ordinary logs, or unrelated local processes;
- Runner verifies the expected process/revision identity and capability digest before marking the local endpoint ready;
- a successful TCP connect to the expected port alone never changes trust state to `TRUSTED_FOR_PRIVILEGED_EXECUTION`;
- local browser origins and arbitrary desktop processes cannot invoke the managed MCP endpoint merely because they can reach loopback;
- reconnect after process death/port reuse requires fresh process/claim/credential verification.


### 18.10 stdio Protocol Framing, stdout/stderr Separation, and I/O Budgets

For stdio MCP, stdout is a protocol channel and MUST NOT be treated as an ordinary application log stream.

Runner requirements:
- protocol stdout and diagnostic stderr are captured separately;
- unexpected non-protocol stdout bytes/lines are treated as framing/protocol violations and cannot be silently mixed into JSON-RPC parsing;
- stderr is bounded, rotated/redacted, and cannot backpressure the process indefinitely;
- stdin/stdout frame size, queue depth, line/message count, and idle/read deadlines are bounded;
- parser failure records a bounded diagnostic sample without persisting secrets or unlimited attacker-controlled output;
- health/log collection never writes SmartAIHub diagnostics back into the child process stdout protocol stream;
- sidecars/wrappers that redirect logs MUST preserve exact protocol framing guarantees;
- process termination on framing abuse follows drain/UNKNOWN_OUTCOME rules for any in-flight non-idempotent request.

### 18.11 Child-Process Environment, Handle/FD Inheritance, and Process-Tree Containment

A local MCP child process SHALL receive a deliberately constructed execution environment rather than inheriting the Runner process environment by default.

Requirements:
- pass an allowlisted environment plus explicit scoped credential injection; do not inherit unrelated cloud keys, proxy passwords, database URLs, SSH agent sockets, browser/session state, or parent secrets;
- close/deny inherited file descriptors, handles, named pipes, sockets, and IPC endpoints not required by the managed service;
- launch in an OS process group/job object/cgroup/container boundary where supported so stop/upgrade/revoke can terminate the whole child tree, not only the parent PID;
- child process spawning follows declared sandbox policy and cannot escape resource/process limits by daemonizing untracked descendants;
- working directory, home/temp paths, PATH/runtime lookup, and executable resolution are deterministic and revision-bound;
- crash/restart reconciliation verifies no descendant from the prior fencing epoch can continue serving a trusted endpoint;
- changes to required environment/handle privileges are revision metadata and return the revision to security review when material.

### 18.12 Unified Runner Architecture with Spec 200

Runner MCP support is a sibling module of the Spec 200 Agent Runtime Core, not a separate Runner product/control plane.

```text
SmartAIHub Runner
├── Control Channel Client                         # shared
├── Capability Reporter / Execution Node Snapshot # shared
├── Local Durable State / Reconciliation          # shared
├── Process / Resource Supervisor                 # shared
├── MCP Runtime Manager                           # Spec 199
└── Agent Runtime Core                            # Spec 200
```

Normative rules:
- one Runner/device identity and one authenticated outbound Control Channel;
- one Execution Node Registry snapshot/revision advertises both `mcp_runtimes` and `agent_runtimes` plus execution capabilities/project bindings;
- `mcp_connections` represents upstream MCP connectivity and MUST NOT become a second Runner/device registry;
- MCP Runtime Manager and Agent Runtime Core share resource claims/fencing and cannot independently allocate the same exclusive port/GPU/process slot;
- Spec 200 may request a governed MCP capability, but execution still enters the Spec 199 MCP Runtime Manager / External MCP Gateway path;
- Runner registration/revocation/trust posture/heartbeat semantics are shared; neither module can keep operating as trusted after the shared Runner identity is revoked.

## 19. OpenAI Agents SDK Integration

OpenAI Agents SDK SHALL NOT receive the full MCP universe.

Preferred patterns:

### Pattern A — Selected tools injected directly
LangGraph resolves candidates and constructs a reduced tool set.

### Pattern B — Gateway tools
Expose only:
```text
search_capabilities()
describe_capability()
execute_capability()
```

Optional split:
```text
search_mcp_tools()
describe_mcp_tool()
call_mcp_tool()
```

The preferred mode may differ by task complexity and model/tool limits.

---


### 19.1 Model-Facing Alias / Reserved-Tool Namespace Mapping

When MCP tools are injected directly into a model provider, the provider-facing function/tool name is an ephemeral projection, not the canonical MCP name.

Requirements:
- SmartAIHub owns the reserved namespace for gateway/control tools and never allows an upstream capability to shadow it;
- alias generation accounts for provider character/length constraints and deterministic collision disambiguation;
- one orchestration run maintains an immutable alias→canonical capability mapping for each model turn/tool loop;
- a tool-call response is resolved through that mapping before policy or execution; a raw model-provided canonical ID is not trusted when direct-tool mode did not expose that ID;
- changing model/provider or rebuilding the candidate set may create different aliases but cannot alter authorization identity or approval binding;
- aliases and display labels are escaped/sanitized for UI/logging and cannot contain bidi/control sequences that create operator confusion.

### 19.2 Model Tool-Schema Translation and No-Silent-Weakening Rule

MCP JSON Schemas may use constructs that a selected model/tool API does not support. Translation for OpenAI Agents SDK or another provider MUST NOT silently discard a constraint in a way that changes security or side-effect semantics.

Rules:
- maintain a versioned schema-projection adapter per model/provider capability set;
- classify translation as `LOSSLESS`, `SERVER_VALIDATED_LOSSY`, or `UNSUPPORTED`;
- `SERVER_VALIDATED_LOSSY` is allowed only when SmartAIHub performs authoritative canonical validation after the model emits arguments and before dispatch; unsupported security-critical semantics fail closed or use generic `execute_capability()` instead of direct tool injection;
- model provider validation is convenience, not the authoritative MCP/input-policy validator;
- model-facing description/schema summarization cannot change enum/required/range/pattern/oneOf/conditional/default semantics used by execution;
- projection byte/token cost is included in the exposure budget from Section 9.2;
- projection version/hash is traced so an invalid model call can be reproduced against the exact schema the model saw;
- conformance tests cover schemas with refs, unions, nested arrays/objects, patterns, conditional constraints, large enums, nullable/omitted distinctions, and unsupported keywords.


### 19.3 Cognitive Executor / Model-Provider Failover and Tool-Contract Recompilation

Changing the cognitive model/provider during a run can change supported tool-name syntax, JSON-Schema subset, context/token budget, parallel-tool behavior, and tool-call serialization. SmartAIHub SHALL NOT treat provider failover as a transparent transport retry when tools/capabilities are in scope.

Requirements:
- failover creates a new cognitive attempt linked to the same orchestration run but with a new `model_projection_generation`;
- capability shortlist remains authorization-bound, but model-facing aliases/tool schemas are regenerated and revalidated for the target provider;
- provider-specific lossy schema translation cannot silently weaken server-side validation or approval binding;
- any pending model-originated tool call from the failed provider is either completed under its original bound attempt or discarded; it is not blindly replayed as a fresh tool call against another provider;
- already-rendered human approvals remain bound to canonical SmartAIHub operation snapshots, not provider-specific tool JSON, so a provider switch cannot mutate approved arguments;
- model failover cannot increase capability scope, bypass token/context exposure budgets, or expose tools hidden from the original orchestration policy;
- observability records old/new provider/model, projection generation, reason for failover, and whether any planned-but-not-dispatched tool call was abandoned;
- for high-risk side effects, failover after ambiguous model/tool dispatch pauses for deterministic reconciliation rather than reconstructing intent from model prose.

### 19.4 Spec 200 Delegated External Agents and MCP Capability Use

OpenAI Agents SDK remains the default SmartAIHub cognitive executor. A Spec 200 External Agent (Codex/Claude/Antigravity/DeepSeek/Hermes/OpenClaw or future runtime) is a delegated executor selected explicitly by user/policy/task requirements.

When an External Agent needs MCP functionality:

```text
External Agent Runtime
  -> capability.search / capability.describe
  -> capability.invoke(mcp_tool)
  -> SmartAIHub Capability Gateway
  -> Spec 199 External MCP Gateway
  -> approved upstream MCP
```

It MUST NOT:
- open arbitrary upstream MCP connections outside Spec 199 governance;
- receive raw upstream OAuth/JIT credentials or connection secrets;
- install a SmartAIHub Skill ZIP locally as a substitute for `capability.invoke`;
- create provider-specific approval/retry/audit semantics for the same SmartAIHub execution intent;
- treat local Runner presence as authorization to bypass tenant/user/agent policy.

The capability response returned to an External Agent is an audience-specific projection under the same result/redaction policy used for model/downstream callers.


## 20. Deterministic Execution Rule

If the UI/action already identifies the capability, do not invoke cognitive routing unnecessarily.

Examples:
- user clicks “Delete selected file” -> policy + direct capability execution
- user clicks “Generate Image” -> direct Skill
- user asks open-ended “help me decide how to automate this” -> cognitive executor

Route classes:
- DIRECT
- SQL
- RAG
- SKILL_DIRECT
- MCP_DIRECT
- COGNITIVE
- EXTERNAL_AGENT
- CLARIFY
- WEB

---

## 21. LangGraph Nodes

Recommended nodes:

```text
normalize_request
load_page_context
load_user_context
retrieve_internal_evidence
resolve_capabilities
evaluate_evidence
select_execution_mode
request_confirmation
execute_direct_capability
execute_cognitive
delegate_external_agent
validate_result
persist_trace
format_response
```

MCP-specific nodes:
```text
mcp_policy_check
mcp_resolve_connection
mcp_execute
mcp_validate_response
```

LangGraph owns orchestration; MCP Gateway owns MCP execution mechanics.

---

## 22. UI / UX — Production Implementation Specification

### 22.1 UX Principle: One Backend, Different Experiences

The MCP Gateway MUST NOT expose one universal management screen to every actor.

The same backend capability set SHALL render through four role-appropriate experiences:

```text
Platform Admin -> Infrastructure / governance UX
Tenant Admin   -> Workspace integration / policy UX
End User       -> Connected Apps / personal connection UX
Runner Owner   -> Device/local runtime UX
```

Ordinary users SHOULD NOT need to understand `stdio`, schema hashes, OAuth PKCE, quarantine internals, transport negotiation, or process lifecycle.

### 22.2 Global Information Architecture

#### Platform Admin

Recommended route:

```text
/admin/ai-infrastructure/mcp
```

Navigation:

```text
MCP Gateway
├── Overview
├── Catalog & Registries
├── Servers
├── Quarantine & Reviews
├── Global Policies
├── Security / DLP
├── Runners
├── Health & Projection Lag
├── Regions & Residency
├── Privileged Operations
└── Audit
```

#### Tenant Admin / Partner Admin

Recommended route:

```text
/workspace/settings/integrations/mcp
```

Navigation:

```text
MCP Integrations
├── Overview
├── Installed
├── Discover
├── Connections
├── Tools & Permissions
├── Agents
├── Shared Credentials
├── Activity
└── Workspace Policy
```

#### End User

Recommended route:

```text
/settings/connections
```

User-facing label SHOULD be:

```text
Connected Apps
```

or:

```text
AI Connections
```

Do not use “MCP Gateway” as the primary ordinary-user label.

Navigation:

```text
Connected Apps
├── My Connections
├── Available Apps
├── My Devices
└── My Activity
```

#### Runner Owner

Recommended route:

```text
/settings/devices/{runner_id}
```

Tabs:

```text
Overview
Local Integrations
MCP Services
Jobs
Logs
Settings
```

### 22.3 Platform Admin — Overview

Purpose: operational and security health across the platform.

Required widgets:
- total registered server definitions
- active installations
- total discovered tools
- healthy/degraded/offline counts
- auth-required count
- quarantine/review-required count
- schema changes pending
- DLP blocks
- call success/error rate
- Runner availability

Example layout:

```text
MCP Gateway
────────────────────────────────────────────────────────────
Servers     Tools       Active Connections      Needs Attention
  28         612               184                     7

Healthy     Degraded    Offline     Auth Required    Quarantined
  23           2           1             1               1

Needs Attention
────────────────────────────────────────────────────────────
GitHub MCP          OAuth broker error          [Inspect]
Unknown MCP         Awaiting security review    [Review]
Blender MCP         3 Runners offline           [Runners]
Notion MCP          2 tool schemas changed      [Review]
```

The dashboard MUST support drill-down and saved filters.

### 22.4 Platform Admin — Catalog & Registries

Capabilities:
- enable/disable registry source
- manually add trusted registry
- sync registry
- inspect publisher/source metadata
- approve a server/template into platform catalog
- blacklist server/package/version
- compare versions

Catalog cards SHALL show:
- name
- publisher/source
- trust badge
- description
- transports
- auth type
- number of tools
- risk summary
- latest version/sync date
- install/approve state

### 22.5 Platform Admin — Server Detail

Tabs:

```text
Overview
Tools
Installations
Connections
Security
Health
Activity
Logs
Advanced
```

Overview SHALL display:
- server identity/source
- transport
- execution location options
- auth methods
- current platform approval
- installation count
- connection count
- health summary
- tool summary
- recent schema changes

Advanced SHALL be visible only to authorized platform operators.

### 22.6 Platform Admin — Quarantine & Review Queue

Queue filters:
- New Server
- New Tool
- Schema Changed
- Risk Changed
- Auth Scope Changed
- Publisher/Version Changed

Each review item SHALL include:
- source/publisher
- affected tenants/installations count
- previous vs current metadata
- schema diff
- risk diff
- requested OAuth scope diff
- evidence/reason for quarantine
- approve, approve-with-policy, reject, disable actions

Bulk approval MAY be supported only for low-risk changes and MUST require explicit permission.

### 22.7 Platform Admin — Global Policies

Policy groups:

```text
Allowed Transports
Registry Trust
Personal MCP
Runner MCP
Risk / Confirmation
OAuth / Credentials
DLP
Concurrency / Rate Limits
Logging / Retention
```

Example controls:

```text
Remote HTTP MCP                  Allow
Unknown registry MCP             Block
Unsigned local stdio             Require review
Destructive tools                Always ask
External data transfer           Ask when sensitive
User-added personal MCP          Tenant controlled
```

### 22.8 Tenant Admin — Overview

Purpose: manage integrations available to one tenant/workspace.

Required summary:
- installed integrations
- connected users
- tools enabled
- agents using MCP
- auth-required users/connections
- review-required items
- Runner/local integration availability
- activity/error summary

The tenant view MUST NOT show other tenant identities, credentials, or raw cross-tenant logs.

### 22.9 Tenant Admin — Discover / Install

Discover SHALL behave like a curated marketplace, not an infrastructure registry browser.

Search/filter:
- category
- provider
- auth mode
- remote/local
- approved/trusted
- team use case

Card example:

```text
GitHub
Development
Official / Approved
42 tools
OAuth • Remote

Read: 19  Write: 18  Destructive: 5

[View Details] [Install]
```

Install flow:

```text
Select integration
   -> Review capabilities/risks
   -> Choose scope (workspace or permitted user scope)
   -> Choose auth model
   -> Set default permission preset
   -> Assign teams/agents
   -> Test / discover
   -> Activate
```

Wizard MUST allow “Save and finish later”. Advanced users may open Advanced Configuration without being forced through every explanatory step.

### 22.10 Tenant Admin — Add Custom MCP

Only visible when Platform policy permits.

Entry choices:

```text
Remote MCP URL
Approved Catalog Package
Runner / Local MCP
Import Configuration
```

Remote form fields:
- display name
- endpoint
- transport auto-detect where possible
- auth method
- optional headers via secret reference only
- timeout
- advanced connection options

Actions:

```text
[Test Connection]
[Discover Tools]
[Save in Quarantine]
```

Raw secret values SHALL never be redisplayed after save.

### 22.11 Tenant Admin — Installed Integrations

Filters:

```text
All
Healthy
Needs Attention
Auth Required
Review Required
Remote
Runner
Disabled
```

Row/card fields:
- integration name
- health
- execution location
- auth model
- tool count
- connected user count
- agents assigned
- last sync
- issue badge

Actions:

```text
Open
Refresh Tools
Reconnect/Test
Disable
Duplicate Policy
Remove
```

Destructive/remove actions require confirmation and dependency warning.

### 22.12 Tenant Admin — Integration Detail

Tabs:

```text
Overview
Tools
Connections
People & Teams
Agents
Authentication
Activity
Settings
```

Overview:
- connection health
- latency/success rate
- enabled tools
- users connected
- agents assigned
- recent activity
- pending issues

### 22.13 Tenant Admin — Tools & Permission Matrix

Required filters:
- search
- READ / WRITE / DESTRUCTIVE / PRIVILEGED / EXTERNAL_DATA_TRANSFER
- active / review / blocked
- category/tag

Tool row:

```text
create_issue
WRITE
Active
Default: Allow
Agents: 2
Users: inherited
```

Detail drawer:
- description
- input/output schema (human-readable default, JSON advanced)
- risk
- approval state
- schema version/hash
- history
- effective tenant policy
- agents with access

Permission matrix example:

| Tool / Risk Group | General Assistant | Developer Agent | Automation Agent |
|---|---|---|---|
| Read repository | Allow | Allow | Allow |
| Create issue | Ask | Allow | Allow |
| Merge PR | Block | Ask | Ask |
| Delete repository | Block | Block | Block |

Presets:

```text
Read Only
Standard
Full with Confirmation
Custom
```

Bulk changes SHALL show affected tool count before save.

### 22.14 Tenant Admin — People & Team Access

Tenant Admin can assign availability to:
- all users
- selected roles
- selected teams/groups
- selected users

This sets a maximum tenant-level exposure. Per-user connection/auth may still be required.

### 22.15 Tenant Admin — Agent Access

Agent assignment page SHALL list agents and effective access.

Example:

```text
Developer Agent
GitHub
  Read repository      Allow
  Create issue         Allow
  Create PR            Allow
  Merge PR             Ask
  Delete repository    Block

Marketing Agent
GitHub                  No access
```

Changing agent policy MUST invalidate cached capability exposure for that agent.

### 22.16 Tenant Admin — Shared Credentials

This page is only for auth modes that support tenant-shared credentials.

Display:
- credential label
- provider
- scope summary
- created by
- last used
- expires/requires renewal
- status

Actions:
- connect
- rotate/reconnect
- revoke
- test

Never show raw token/private key.

### 22.17 End User — Connected Apps Home

The user sees a simplified surface.

Example:

```text
Connected Apps
────────────────────────────────────
GitHub             Connected as @user
                   [Manage]

Google Drive       Not connected
                   [Connect]

Notion             Available for this workspace
                   [Connect]
```

User-facing status vocabulary:

```text
Connected
Not connected
Needs attention
Unavailable in this workspace
Device offline
Permission required
```

Avoid protocol words unless user opens Advanced information and has permission.

### 22.18 End User — Connect Account Flow

Flow:

```text
Select App
 -> Explain requested access in plain language
 -> OAuth / authorization
 -> Return callback
 -> Connection test
 -> Success
```

Before OAuth, show human-readable requested scopes and why they are needed.

After connection:

```text
GitHub connected
Account: @user
Available to: You
Agent access: Controlled by workspace policy
[Done] [Manage]
```

### 22.19 End User — Manage Personal Connection

Allow:
- reconnect
- revoke
- view scope summary
- choose stricter confirmation preference
- view personal activity
- select permitted default account if multiple accounts are supported

Do NOT allow user to broaden tenant/agent policy.

### 22.20 End User — Personal MCP

Visible only when allowed by effective Platform/Tenant policy.

Modes:
- Approved catalog only
- Add remote MCP
- Add local MCP via owned Runner

Personal MCP setup SHALL still pass quarantine/security checks.

A user-owned MCP server MUST default to private visibility unless explicitly shareable under tenant policy.

### 22.21 End User — My Devices

Example:

```text
My Devices
────────────────────────────────────
Office PC
Online • Windows • Runner 1.8.x
4 local integrations
[Manage]

Laptop
Offline
[Manage]
```

User can only see devices they own or are explicitly permitted to manage.

### 22.22 Runner Owner — Device Detail

Tabs:

```text
Overview
Local Integrations
MCP Services
Jobs
Logs
Settings
```

MCP service row:

```text
FFmpeg MCP
Running
stdio
18 tools
Last health: now
[Restart] [Stop] [Logs]
```

Advanced details:
- process ID
- version
- launch command with secrets redacted
- working directory
- CPU/memory summary when available
- restart count
- stderr/stdout tail

Process actions MUST respect tenant/platform local-runtime policy.

### 22.23 In-Chat MCP UX

Chat is a consumer of the same policy/gateway, not a separate MCP implementation.

#### Missing connection

```text
GitHub connection required
To create an issue, connect your GitHub account.
[Connect GitHub]
```

#### WRITE confirmation

```text
GitHub wants to create an issue
Repository: SmartAIHub
Title: Fix worker timeout
[Cancel] [Review Details] [Allow]
```

#### DESTRUCTIVE confirmation

```text
Delete repository?
abc/project
This action may not be reversible.
[Cancel] [Allow Once]
```

Do not offer “Always allow” for actions prohibited from persistent authorization by policy.

#### BLOCKED by tenant

```text
This action is not available in this workspace.
```

Do not expose internal ACL diagnostics to ordinary users.

#### Runner offline

```text
This action needs Office PC, but the device is offline.
[View Device]
```

### 22.24 Capability Approval Card Component

Reusable component fields:
- integration icon/name
- action/tool plain-language title
- target resource
- risk badge
- concise parameter preview
- external-data-transfer notice when applicable
- why this action is needed
- cancel / review / allow controls
- optional grant duration only when policy permits (`Allow once`, `Allow for this workflow`, or bounded time); destructive actions default to one-time consent
- external-cost/billing-owner notice when the call can consume user/tenant/platform paid quota

Persistent consent MUST be keyed to the exact tenant/user/agent/server/tool/risk/schema version and invalidated on material schema/risk/auth-scope changes.

The component MUST be usable in:
- full Chat
- Universal AI Assistant Launcher
- workflow approval inbox

### 22.25 Schema Change Review UI

For admins/reviewers only.

Show side-by-side or inline diff:
- description
- input schema
- output schema
- risk annotations
- OAuth scopes
- transport/security metadata

Example:

```text
create_issue
Previous                      New
repo                          repo
title                         title
body                          body
                              attachments   + added

Risk change:
WRITE -> WRITE + EXTERNAL_DATA_TRANSFER
```

Actions:

```text
[Reject]
[Keep Blocked]
[Approve Change]
[Approve with Restrictions]
```

### 22.26 Activity & Trace UI

Tenant/user/admin activity views share the same trace data but visibility differs by scope.

List columns:
- timestamp
- actor
- conversation/workflow
- agent
- integration
- action/tool
- risk
- result
- duration

Trace detail:

```text
User request
  -> LangGraph route
     -> Capability Resolver
        -> OpenAI Agent (optional)
           -> MCP Gateway
              -> Tool
                 -> worker_job (optional)
                    -> Result
```

Each node should show duration, status, and correlation IDs to authorized operators.

### 22.27 Health UI

Health page supports:
- status filter
- server filter
- tenant filter for Platform Admin only
- Runner filter
- error type
- time range

Charts/tables SHOULD include:
- availability
- latency
- error rate
- auth failures
- rate limits
- schema refresh failures
- Runner disconnects

### 22.28 Empty, Loading, Error, and Partial States

Every major view MUST define:

#### Loading
Use skeletons for list/dashboard data; do not show false “0” counts during load.

#### Empty
Examples:
- No integrations installed -> show Discover CTA
- No personal connections -> show Available Apps
- No review items -> “No items need review”

#### Error
Show:
- plain-language summary
- retry action
- trace/reference ID when useful
- advanced detail only for permitted roles

#### Partial/degraded
A server with some failing tools SHOULD show `Degraded`, not `Offline`.

### 22.29 Notifications

Notification events:
- OAuth expires/reconnect needed
- server offline
- Runner offline (if user-owned and relevant)
- tool/schema review required
- destructive approval waiting
- DLP/security block
- repeated execution failure

Recipients are determined by role/scope; avoid notifying unrelated users.

### 22.30 Search and Filtering

Lists with more than 20 items MUST support search/filter.

Large tool lists SHOULD support:
- fuzzy text search
- risk filter
- status filter
- agent access filter
- changed-only filter

Server/catalog search SHOULD be debounce-based and URL-stateful so views can be shared/bookmarked where permitted.

### 22.31 Responsive Behavior

Desktop is primary for admin-heavy screens, but end-user Connected Apps and approval cards MUST work on tablet/mobile.

Rules:
- permission matrices may switch to per-tool detail cards on narrow screens
- schema diffs become stacked diffs
- destructive action buttons remain visible and separated from cancel
- side panels become full-screen sheets on mobile

### 22.32 Accessibility

Minimum requirements:
- keyboard navigable
- visible focus states
- semantic form labels
- status not conveyed by color alone
- ARIA live region for connection/test status
- dialogs trap focus correctly
- tables have accessible headers
- confirmation dialogs identify target/action/risk explicitly

### 22.33 Localization

UI text SHALL be localization-ready.

At minimum:
- status labels
- risk descriptions
- connection/auth copy
- confirmation copy
- errors
- policy explanations

Internal enum values remain language-independent.

### 22.34 UI Authorization Rules

Hiding a UI control is NOT sufficient authorization.

Every UI action MUST map to server-side authorization checks.

The frontend SHALL receive capability flags such as:

```json
{
  "can_install": true,
  "can_manage_policy": false,
  "can_manage_shared_credentials": false,
  "can_add_personal_mcp": true,
  "can_manage_runner": true
}
```

The backend remains authoritative.

### 22.35 UX Acceptance Matrix

| Actor | Primary surface | Can install server | Can connect own account | Can manage tenant policy | Can review global quarantine | Can manage own Runner |
|---|---|---:|---:|---:|---:|---:|
| Platform Admin | Admin MCP Gateway | Yes | Optional | Yes | Yes | If assigned |
| Tenant Admin | Workspace MCP | Within platform policy | Yes | Yes | No | If assigned |
| End User | Connected Apps | Only if personal policy permits | Yes | No | No | Yes, owned/assigned only |
| Agent | No admin UI | No | No | No | No | No |

---


### 22.36 Protocol & Compatibility UX

Admin Integration Detail SHALL include an **Advanced > Protocol** panel showing:
- negotiated/observed MCP protocol version;
- adapter (`2026 stateless` / `legacy compatibility`);
- server capabilities;
- enabled extensions;
- deprecated transport/feature warnings;
- last successful compatibility check;
- upgrade recommendation when legacy behavior is in use.

End Users MUST NOT see protocol headers/session details unless they hold an advanced/admin role.

### 22.37 Resources & Prompts UX

Tenant/Admin Integration Detail SHALL include separate tabs when supported:

```text
Tools
Resources
Prompts
Extensions
```

**Resources** UI:
- search/filter by name/type/MIME;
- preview safe text resources;
- choose `Use on demand` vs `Index into workspace knowledge` where policy allows;
- show source URI, owner/scope, freshness and last sync;
- show deletion/unindex action.

**Prompts** UI:
- prompt name/description;
- arguments;
- preview;
- source server;
- approval/change status;
- visibility to users/agents.

Ordinary users SHOULD see approved prompts as friendly actions/templates, not protocol objects.

### 22.38 Input-Required / MRTR UX

When an MCP operation needs more information, Chat SHALL render a resumable card within the originating conversation.

Card must show:
- integration/server display name;
- reason/message from upstream after sanitization;
- requested fields;
- affected action/resource;
- risk/confirmation notice when applicable;
- `Continue` and `Cancel` actions.

For external URL elicitation, the UI MUST show the destination origin before opening it and MUST never auto-navigate.

Pending input SHALL appear in Activity/Job detail as `Waiting for input`. The user may resume from Chat or the related activity/job view.

### 22.39 Long-Running Task UX

For upstream MCP tasks:
- show status/progress when available;
- show `Cancel` when supported;
- show last update time and upstream/server identity;
- do not expose opaque task IDs by default;
- reconnecting/reloading the page SHALL preserve progress through `worker_jobs` linkage;
- completed artifacts link to Library.

### 22.40 Security Scanner and Supply-Chain Review UX

Quarantine Review SHALL include:
- registry/publisher/source;
- requested transport and execution location;
- exact package/image/version/digest when known;
- scanner findings summarized by severity;
- raw SARIF/details for permitted admins;
- tool/schema changes;
- requested auth scopes;
- network/filesystem/runtime privileges;
- approve once / approve version / reject options according to policy.

A scanner `clean` result MUST NOT be labeled `Safe`; use wording such as `No findings detected by configured scanners`.

### 22.41 Managed Authorization UX

Connections UI SHALL distinguish:

```text
Personal connection
Workspace shared connection
Managed by organization
```

For managed authorization:
- ordinary users see status and account identity where allowed;
- tenant admin sees policy/provider association but not secret material;
- reconnect controls are hidden when organization policy owns lifecycle.

### 22.42 Conflict, Concurrent Edit, and Stale State UX

Configuration forms SHALL use optimistic concurrency/version tokens.

If another admin changed the same server/policy while the form was open:
- do not silently overwrite;
- show a conflict summary;
- allow reload/review;
- require a deliberate re-apply after seeing latest state.

Approvals MUST verify the schema/digest under review is still the current version at commit time.

### 22.43 Multi-Account / Connection Selection UX

If more than one eligible external account exists for an action, SmartAIHub MUST NOT silently choose based on creation order or last-used global state.

Chat/Connected Apps may show:

```text
Use GitHub account
○ pruksachart-work   (Workspace)
○ pruksachart        (Personal)
[Remember for this workspace/workflow if permitted]
```

Requirements:
- show friendly account identity without exposing token/client internals;
- distinguish Personal vs Workspace Shared vs Organization Managed;
- default-account changes require server-side authorization and affect only the defined tenant/user scope;
- if a workflow pins a connection, its editor/preflight shows that binding and reports `AUTH_REQUIRED` if that connection is later revoked;
- switching account on an `ASK` action regenerates the approval card/receipt.

### 22.44 Execution-Bound Approval Receipt UX

The confirmation card SHALL preview the same normalized target/arguments that will be hashed into the approval receipt. Sensitive fields may be redacted visually, but the server-side binding still includes their canonical value/hash.

After approval:
- show `Approved once` / bounded scope and expiry where relevant;
- disable duplicate submit while consuming the approval;
- if arguments/schema/target changed before dispatch, show `Action changed — review again` rather than silently executing;
- Activity detail records who approved, when, scope, schema/revision, and the non-secret approval receipt ID.

### 22.45 Revision, Rollout, and Drift UX

Admin Integration Detail SHALL expose a **Versions / Rollout** surface when multiple runtime revisions exist.

Show:
- active revision/digest;
- candidate revision;
- schema/tool delta;
- scanner/provenance delta;
- Runner/tenant rollout percentage;
- health comparison;
- pinned automations/installations;
- `Promote`, `Pause rollout`, `Roll back`, `Block revision`.

Runner detail shows desired vs observed revision and a clear `Drifted` state. Ordinary end users do not manage revisions.

### 22.46 Subscription/Freshness UX

Admin diagnostics MAY show whether catalog/resource freshness uses polling, cache TTL, or `subscriptions/listen`, plus last notification/refresh and reconnect state.

End-user surfaces show only meaningful freshness such as `Updated just now` or `May be stale`; protocol subscription IDs are hidden.

### 22.47 Partial Success / Compensation UX

When a multi-step request partially succeeds, Chat/Activity MUST avoid a generic `Failed` message that hides completed side effects.

Example:

```text
2 of 3 actions completed
✓ Created GitHub issue #128
✓ Uploaded attachment
✕ Failed to add project label

[Retry failed step] [View activity]
```

Retry UI is shown only when the failed step is independently retry-safe. If compensation is available, explain exactly what will be reversed and require normal policy/confirmation.

### 22.48 Circuit/Rate-Limit UX

Health/Activity distinguishes:
- upstream unavailable;
- circuit open due to repeated failures;
- upstream rate limited with retry time when known;
- SmartAIHub queue/admission limit;
- user/tenant external quota exhausted.

Do not collapse these into one `Offline` status because remediation differs.


### 22.49 Cost / Quota Guardrail UX

For tools with material external/platform-funded cost, permitted admins may configure warning/hard-stop budgets. End-user approval cards show only actionable information:
- `Uses your connected account`;
- `Uses workspace account`;
- `Estimated cost ...` when reliable;
- `Cost unavailable` when not measurable;
- `Uses SmartAIHub credits` when applicable.

Budget exhaustion MUST distinguish external-provider budget from SmartAIHub credit exhaustion and identify who can remediate it.

### 22.50 Discovery Completeness UX

Admin diagnostics show catalog status:

```text
Complete
Refreshing
Stale
Truncated
Failed refresh (previous catalog retained)
```

A truncated/failed discovery MUST NOT misleadingly show a smaller count as if tools were intentionally removed. Show previous complete generation and the current refresh error where authorized.



### 22.51 Platform Admin — Control-Plane Health & Projection Lag

Purpose: make distributed consistency observable rather than hiding stale-index/cache conditions.

Required views:
- canonical DB generation vs capability-index generation;
- outbox/control-event backlog, oldest age, retry count, DLQ/error count;
- per-consumer health;
- last successful rebuild/reconciliation;
- subscription listener freshness;
- warning when WRITE/DESTRUCTIVE execution is forced into authoritative revalidation because a projection is stale.

Actions:
- retry failed event;
- inspect safe event metadata;
- trigger projection rebuild/reconcile;
- acknowledge incident (does not delete audit evidence).

The UI MUST NOT offer “mark successful” or other controls that fabricate delivery state without an actual consumer/reconciliation result.

### 22.52 Platform/Tenant Admin — Regions & Data Residency

Where multi-region deployment is enabled, authorized admins SHALL see:
- configured tenant home/data region;
- credential storage region;
- current gateway execution region;
- Runner region/device location classification where policy uses it;
- upstream destination region/country when known and policy-relevant;
- cross-region/cross-border egress policy outcome;
- failover eligibility.

Tenant Admin may choose only from Platform-approved residency options. End Users see a simple blocked/unavailable message when residency policy prevents a connection/call; they do not receive infrastructure topology details.

### 22.53 Platform Admin — Privileged / Break-Glass Operations

Break-glass actions SHALL use a dedicated confirmation surface distinct from ordinary settings.

Required UX:
- operation and exact scope;
- why ordinary workflow cannot be used;
- required reason/ticket;
- re-authentication/MFA step where available;
- explicit expiry;
- preview of affected tenants/installations/capabilities;
- immutable audit/notification notice;
- post-action review link.

A break-glass control MUST never be presented inside Agent Chat as a normal tool approval card.

### 22.54 Identity and Name-Collision UX

When two capabilities share a display name or a name contains confusable/invisible characters, UI SHALL disambiguate using trusted server/publisher/installation context and MAY show a security warning.

For destructive/high-risk approval cards, display at minimum:
- human-friendly tool/action name;
- integration/server identity;
- account/connection label;
- target object;
- risk level;

Do not ask users to approve based only on an upstream-supplied primitive name.

### 22.55 Platform/Tenant Admin — Bulk Operations and Change Impact Preview

Large tenants may manage hundreds or thousands of tools. Bulk policy or lifecycle changes MUST be safe and explainable rather than a blind multi-select save.

Bulk-capable operations MAY include:
- enable/disable selected installations/tools;
- apply permission preset;
- assign/remove agent/team exposure;
- quarantine/unquarantine low-risk reviewed items;
- rotate/reconnect eligible shared connections;
- initiate drain/decommission;
- activate emergency containment within authorized scope.

Before commit, the UI SHALL provide a dry-run/impact preview showing:
- affected installations/tools/users/agents/workflows;
- newly ALLOW/ASK/BLOCK decisions;
- running/queued automations that will be interrupted;
- credentials/connections affected;
- external cost/budget implications where known;
- whether the action requires elevated approval or cannot be bulk-applied.

Bulk destructive/high-risk changes require typed confirmation or equivalent strong confirmation and a downloadable/auditable change summary. Partial failures MUST be shown per item and support safe retry of only failed items.


### 22.56 End User — Authorization & Data-Sharing History

Users SHOULD be able to understand what external integrations are acting on their behalf without exposing protocol internals.

For each personal connection show:
- connected account/provider identity;
- granted scope summary;
- recurring automations/agents allowed to use it;
- recent approvals/data-sharing receipts;
- expiry/reconnect requirement;
- `Revoke connection` / `Remove recurring permission` actions.

The view MUST distinguish:
- revoking a SmartAIHub reusable approval;
- disconnecting/revoking the external account connection;
- deleting local retained/indexed content;
- requesting provider-side deletion where SmartAIHub can initiate it.

Security audit records that cannot be user-deleted under platform policy should be described separately rather than silently retained as ordinary activity data.


### 22.57 Incident Containment / Restore-Safety UX

Platform operators SHALL have one dedicated incident surface for MCP containment and recovery rather than relying on scattered toggles.

The UI SHALL show:
- active kill-switch scopes and activation reason;
- current global/tenant/server/revision/tool/connection/Runner revocation epoch;
- projection/event lag and regions that have acknowledged the epoch;
- whether the environment is in `RESTORE_SAFETY_MODE`;
- blocked side-effecting dispatch count;
- unresolved UNKNOWN_OUTCOME executions;
- credential/index/policy reconciliation progress;
- explicit `Resume side effects` action guarded by elevated permission and a readiness checklist.

The UI MUST NOT allow ordinary users or Agent identities to clear containment or exit restore safety mode.

### 22.58 Capability Deprecation / Dependency Impact UX

When a tool/revision is deprecated, removed, quarantined, or scheduled for retirement, Platform/Tenant Admin SHALL be able to see affected consumers before enforcement.

Impact view SHALL include:
- Agents referencing the capability;
- workflows/automations with a pinned capability/revision;
- plugin manifests depending on it;
- users/teams with active bindings;
- queued/scheduled jobs that would become unrunnable;
- recommended replacement capability/revision when one is explicitly configured.

Actions:
```text
Mark Deprecated
Set Retirement Date
Pin Replacement
Run Compatibility Check
Migrate Selected Consumers
Block New Bindings
Retire
```

Automatic replacement is forbidden unless input/output/risk/permission compatibility has been verified and the migration policy explicitly allows it.

### 22.59 Abuse / Anomaly Operations UX

Platform Admin SHALL have an abuse/security-rate view distinct from ordinary upstream rate-limit health.

Surface at least:
- discovery/list flooding;
- repeated OAuth/state failures;
- approval/confirmation spam;
- repeated denied tool execution;
- malformed/protocol parser abuse;
- excessive schema/catalog churn;
- repeated expensive preflight/search requests;
- suspected credential-stuffing or enumeration patterns.

Controls SHALL support scoped throttle, temporary block, investigation link, and false-positive dismissal without weakening normal tenant isolation.


### 22.60 Protocol Compatibility / Downgrade Review UX

Admin Server Detail SHALL show preferred/current/minimum protocol version, active adapter, last successful version, fallback history, and whether legacy fallback is allowed. A downgrade requiring review displays a blocking warning with affected high-risk capabilities and `[Keep Blocked] [Approve Legacy Exception]`. Ordinary users only see an actionable compatibility/unavailable message.

### 22.61 Runtime Ownership / Fencing UX

Runner/job diagnostics SHALL show lease owner, lease age, fencing epoch, takeover count, and stale-result rejection events without exposing internal secrets. Operator action may request safe takeover/reconcile but MUST NOT manually decrement/reuse an epoch.

### 22.62 Quota Reservation / Settlement UX

Tenant/Platform billing views SHALL distinguish:
- available budget;
- currently reserved amount;
- settled usage;
- expired/released reservations;
- reconciliation-required usage.

A blocked execution should explain which governed budget scope prevented dispatch without leaking another tenant/user's budget.

### 22.63 Reconciliation / Orphan Cleanup UX

Operations UI SHALL expose bounded reconciliation queues for orphan remote tasks, stale subscriptions, expired pending input, temp artifacts, abandoned OAuth transactions, quota reservations, and stale Runner processes. Each item shows owner/scope, age, cleanup policy, last attempt, and safe operator actions. Bulk destructive cleanup requires dry-run/impact preview.

### 22.64 Startup / Dependency Readiness UX

During cold start or dependency degradation, management/read-only diagnostics may remain available while side-effect dispatch is gated. Admin UI SHALL distinguish failures such as `Policy store unavailable`, `Revocation epoch unavailable`, `Secret manager unavailable`, `Execution ledger unavailable`, and `Projection stale`; end users receive a concise retry/service-unavailable state rather than a misleading MCP-tool error.


### 22.65 Delegated Account / Service Principal UX

When a tenant-shared or service credential is selected, confirmation and execution-detail UI MUST show the effective external account and delegation context in user language.

Users SHOULD see:
- who/what requested the action;
- which Agent/workflow will execute it;
- whether the external account is personal or workspace-shared;
- billing/quota owner when material;
- tool/risk/target summary.

Tenant Admins receive a service-principal binding view listing allowed Agents/workflows/tools and last-used activity. Ordinary users never receive raw client secrets/tokens.

### 22.66 Paused Execution Revalidation UX

If MRTR/task/job resume becomes stale because permission, account, revision, Runner trust, budget, or risk changed, Chat/Task UI SHALL not show a generic failure.

States include:

```text
Ready to resume
Needs new approval
Reconnect account
Choose account again
Runner trust expired
Capability changed
Budget approval required
Blocked by policy
```

The original user input SHOULD be preserved where safe so the user can re-authorize without re-entering unrelated data.

### 22.67 Effect Receipt / Postcondition UX

WRITE/DESTRUCTIVE execution detail SHOULD surface provider evidence when available:
- created/updated external resource identity;
- provider operation ID;
- verification status (`Confirmed`, `Could not verify`, `Partial`, `Unknown outcome`);
- links/actions that are safe and permitted;
- compensation/repair status for partial workflows.

UI MUST NOT label an ambiguous timeout as “Failed, nothing changed.”

### 22.68 Artifact Quarantine / Provenance UX

Library/Chat surfaces for MCP-produced files SHALL show:
- scan/quarantine state;
- originating integration/tool;
- source account/workspace where appropriate;
- content hash/provenance details for admins;
- whether RAG indexing is allowed/completed.

Blocked artifacts cannot be opened through unsafe active rendering. Users receive a clear reason and safe remediation/review path where policy allows.

### 22.69 Retention / Legal-Hold UX

Where retention holds are enabled, deletion flows MUST distinguish:
- account disconnect / credential revocation;
- future execution permission removal;
- ordinary content deletion;
- evidence/content retained under an explicit hold.

The UI MUST NOT imply that a retained audit/evidence record remains executable authorization. Access to hold details is role-restricted.

### 22.70 Approval-to-Discovery Convergence / Read-Your-Writes UX

After an Admin approves, rejects, disables, or changes a capability, the UI SHALL represent projection state explicitly until search/index/runtime views converge.

Allowed states:

```text
APPLIED
PROPAGATING
DEGRADED_PROJECTION
FAILED_RECONCILIATION
```

Requirements:
- the mutation response returns canonical generation/version immediately;
- the same Admin session gets read-your-writes from canonical state even while projections catch up;
- approved capability MUST NOT require an unrelated upstream rediscovery merely to become eligible for indexing;
- execution still uses authoritative dispatch-time validation, so a lagging projection cannot bypass deny/quarantine;
- operator UI exposes retry/rebuild when propagation exceeds SLO.

### 22.71 Lifecycle / Retry / Regional Authority / Evidence UX

Admin/Operations UI SHALL expose the v10 cross-cutting controls without forcing raw database/log access.

**Lifecycle inspector**
- show canonical state, generation/version, allowed next transitions, transition guard failure reason, actor and last control-event ID;
- stale browser actions return a clear conflict with `Reload current state`; never visually pretend the transition succeeded;
- retired/tombstoned entities remain inspectable according to retention permissions but are visibly non-executable.

**Retry / attempt lineage**
- show one logical execution with expandable transport/worker attempts;
- display retry owner, reason, remaining budget, elapsed deadline and whether a retry is safe;
- never offer `Retry` for `UNKNOWN_OUTCOME` writes until verification/reconciliation allows it.

**Regional authority**
- show current authoritative write region/epoch, failover/drain status and replication/reconciliation readiness;
- during split-brain uncertainty, mutation buttons and high-risk dispatch controls are disabled with an explicit safety reason.

**Incident evidence export**
- privileged users can choose incident scope/time range/trace IDs and preview categories included;
- export UI states purpose, redaction policy, retention impact, missing-evidence warnings and resulting manifest hash;
- download/access to generated evidence follows role/tenant authorization and is itself audited.

**Policy conflict explanation**
- show the final decision and the restrictive contributing rule(s) without leaking policies outside the viewer's scope;
- dry-run/preview uses the same compiled policy path as execution and labels any generation drift before apply.
### 22.72 Catalog Budget / Dependency Graph UX

Platform/Tenant Admin SHALL be able to see catalog completeness and dependency impact without interpreting raw discovery logs.

UI states include:
- `Complete`, `Incomplete — budget limit`, `Refresh in progress`, `Stale`, `Inconsistent upstream`;
- discovered/count budget, schema-byte budget, pages consumed, and whether search results may be incomplete;
- dependency graph/list for Agents, Workflows, Plugins, Automations and queued work;
- cycle/compatibility error explanation before saving a new dependency;
- side-effect-free `Impact preview` before uninstall/retire/quarantine/policy changes.

### 22.73 Scheduled Automation Drift UX

Automation details SHALL show MCP readiness separately from schedule configuration:
```text
Configured
Ready now
Paused — authorization changed
Paused — capability changed
Paused — connection/account changed
Action required — new consent/scope
```

The UI SHALL show the specific dependency/account/capability requiring action and MUST NOT offer “continue anyway” when authoritative policy says BLOCK.

### 22.74 Critical Change / Dual-Control UX

For deployments with four-eyes policy:
- proposer sees `Pending second approval` with immutable change summary/hash/generation;
- eligible approvers see exact before/after diff and blast-radius preview;
- proposer cannot approve their own change;
- edit/cancel/expiry creates a new proposal identity;
- break-glass is visually distinct and requires explicit incident reason plus post-review status.

### 22.75 Privacy, Advisory, and RAG-Lineage UX

Admin/user surfaces SHALL distinguish:
- SmartAIHub data deleted versus external-provider erasure unverified/pending;
- supply-chain advisory/quarantine/override status;
- MCP Resource content that has been indexed into RAG and its visibility/freshness state;
- source revoked/deleted with derived-index purge pending versus query access already blocked.

Ordinary users receive concise actionable wording; protocol/security details remain in Admin diagnostics.



### 22.76 Credential Posture / JIT Execution UX

Platform/Tenant Admin integration detail SHOULD show credential posture without exposing secret values:

```text
Credential posture
  JIT / workload identity        Preferred
  Per-user OAuth                 Good
  Tenant reusable token          Review
  Static API key on Runner       High maintenance risk
```

UI shows issuer/audience/scope summary, lease TTL, last mint failure, and whether fallback to a reusable credential is enabled. End users see only account connection state unless they own/administer the credential policy.


### 22.77 Approval Fidelity / Multi-Device Resolution UX

Approval cards SHALL distinguish authoritative facts from generated explanation:

```text
Authoritative action
  Account: Workspace GitHub / org-x
  Action: Delete repository
  Target: org-x/project-a
  Effect: irreversible

Why the assistant requested this
  <generated explanation>
```

Material values are not hidden behind ellipsis. When another tab/device already resolved the request, controls disable and show the authoritative decision/time/actor permitted by privacy policy.


### 22.78 Runtime Capacity / Resource-Claim UX

Runner and Platform/Tenant operational views SHOULD expose bounded resource state relevant to MCP execution:
- active claims and owning job/run;
- CPU/memory/process/socket pressure summary;
- GPU/VRAM/model-slot occupancy where configured;
- blocked queue count and dominant resource reason;
- stale/reconciliation-required claims;
- safe `Reconcile` / `Release after verification` operator actions, never a blind force-release for high-risk active claims.


### 22.79 Automation Overlap UX

Automation setup includes an explicit “When another run is already active” setting mapped to the canonical overlap policies. Run history visibly differentiates `STARTED`, `SKIPPED_OVERLAP`, `COALESCED`, `QUEUED`, and `SERIALIZED_WAITING`. Changing policy includes an impact preview for current pending/running work.


### 22.80 Browser Sensitive-State UX Rules

Sensitive administration/approval pages SHALL not advertise offline availability. On privileged-session expiry or stale back/forward restore, action controls become read-only until state is refreshed. Frontend copy/debug/export actions show a warning when they may include sensitive provider data and follow server-authorized export policy.


### 22.81 Model Tool Exposure / Alias / Schema-Projection Diagnostics

Platform/Tenant diagnostics for cognitive execution SHALL expose, per orchestration run where permitted:
- canonical capability ID and model-facing alias;
- selected model/provider and schema-projection adapter/version;
- `LOSSLESS`, `SERVER_VALIDATED_LOSSY`, or `UNSUPPORTED` translation state;
- model-facing schema/description token or byte estimate;
- whether direct injection or generic `execute_capability()` fallback was used;
- any constraint that could not be represented by the model provider but remained enforced server-side.

Ordinary users SHOULD NOT be shown provider-schema jargon unless it explains why a capability cannot be used. Admin UI MUST NOT offer a “drop unsupported constraints and continue” shortcut for a security-critical schema.

### 22.82 Transport Profile / Custom Header / Proxy / mTLS UX

Connection configuration SHALL separate ordinary endpoint settings from security-sensitive transport profiles.

Admin UX rules:
- show custom header **names** and whether each value is secret-managed; never reveal existing secret values after save;
- reserved headers are visibly non-editable and rejected with a precise reason;
- proxy, private CA, mTLS certificate, and client-key configuration are separate controls with scope/owner labels;
- connection test reports safe trust diagnostics (origin, proxy path, trust mode, certificate subject/fingerprint where policy permits) without dumping tokens/keys;
- changing transport profile shows affected connections/pools and whether reconnect/re-review is required;
- certificate/proxy/header secret rotation supports staged test before promotion where feasible.

### 22.83 Runner Installer and Local Endpoint Trust UX

Runner MCP management SHALL distinguish:
- `Downloaded/Staged`;
- `Scanning`;
- `Install review required`;
- `Installed inactive`;
- `Starting / Handshake`;
- `Running verified`;
- `Running but identity unverified`;
- `Rollback available`.

Before allowing installer network/filesystem/lifecycle-script privileges beyond the baseline, UI shows the exact privilege delta. Localhost MCP detail shows the managed process/revision, channel type (`stdio`, socket/pipe, loopback TCP), endpoint-auth state, resource claim, and last verified handshake. `Listening on localhost` MUST NOT be rendered as equivalent to `Trusted`.

### 22.84 Automation Ownership / Orphaned Principal UX

Automation detail SHALL show four distinct identities when applicable:
- Created by;
- Current owner/custodian;
- Execution principal;
- External account/connection.

If the owner leaves/is disabled, state becomes `Paused — owner action required` or `Paused — orphaned owner`. Tenant Admin receives impact/transfer UI that previews connection, consent, purpose, budget, Agent/tool, and external-account changes before transfer. Transfer cannot silently activate a different credential/account.

### 22.85 Effective Arguments / Defaults Approval UX

High-risk approval UI SHALL render the same canonical effective-argument snapshot that will be sent to the executor.

It SHALL distinguish:
- explicit user/model values;
- SmartAIHub-applied preset/default values;
- omitted fields;
- upstream/server-side defaults whose effective value is unknown;
- hidden/non-user-editable system fields where policy allows disclosure of their meaning but not secret value.

If a material effective value cannot be known before dispatch, the approval text explains that uncertainty and policy decides whether execution is allowed. Generated assistant prose is never the authoritative parameter display.

### 22.86 Rate-Limit / Circuit-Breaker Scope and Fairness UX

Operational UI SHALL explain whether throttling/outage state is scoped to:
- whole provider/origin;
- provider tenant/org;
- external account/connection;
- credential generation;
- tool family;
- SmartAIHub tenant/user queue.

This prevents operators from treating one account's exhausted quota as a provider-wide outage. Queue diagnostics show interactive/background class, wait age, starvation/aging state, and protected control-plane invalidations without exposing another tenant's identifiers.


### 22.87 Runtime Result Contract / Drift UX

Admin/Tenant integration detail SHOULD expose:
- approved output-schema hash/version;
- recent runtime validation success/error rate;
- first/last observed mismatch;
- affected revision/tool/account scope;
- `Review drift`, `Disable`, and bounded diagnostic-evidence actions;
- clear separation between input-schema change and runtime-output drift.

End users receive a concise degraded/error message and are not shown raw validation payloads.

### 22.88 Subscription Lease / Freshness UX

Operational UI SHOULD show desired vs acknowledged notification filters, active listener owner/age, last notification, reconnect/backoff state, and authoritative re-list status. Operators may request a safe listener recycle or authoritative refresh without manually deleting rows.

### 22.89 Audience Projection / External Reference UX

For sensitive result flows, trace/evidence UI SHOULD indicate which audience received which projection class (`USER`, `MODEL`, `RAG`, `DOWNSTREAM`) without exposing redacted content. External URL/artifact panels show original/final origin, expiry when known, quarantine/scan state, and whether a refresh would require re-execution.

### 22.90 Policy Simulation UX

Policy editor SHOULD offer `Preview impact` / `Shadow evaluate` for high-impact changes. The report shows sampled historical/synthetic cases, current vs candidate decision, affected actors/capabilities, incompleteness warnings, policy generation/hash, and a separate explicit promotion workflow.

### 22.91 Portable Configuration Export / Import UX

Admins MAY export MCP configuration as a secret-free portable manifest containing server/install/policy/binding references and immutable revision identifiers where appropriate.

UX requirements:
- secrets, OAuth tokens, credential material, raw task handles, and protected result payloads are excluded;
- export states whether identifiers are environment-specific and which values require remapping;
- import runs validation/dry-run first, including tenant scope, registry/publisher trust, revision availability, dependency graph, protocol policy, and secret/credential placeholders;
- imported risky/custom MCP remains subject to normal quarantine/review and never inherits trust merely because a manifest was exported elsewhere;
- optional manifest signatures/hashes provide provenance/integrity, not automatic authorization.


### 22.92 Security-Critical Localization and Approval Fidelity UX

Security-critical approval, OAuth/account selection, destructive warning, external-data-transfer notice, break-glass, and kill-switch copy MUST preserve canonical facts across locales.

UI rules:
- target identity, external account, action, effective arguments, risk, destination, cost estimate and irreversibility indicators come from structured canonical fields, never from free-form translated model prose;
- translations may rephrase explanatory copy but cannot omit or weaken canonical risk facts;
- if a locale lacks a reviewed translation for a high-risk warning, fall back to the reviewed default language while preserving structured labels rather than machine-translating away security meaning;
- the audit receipt stores locale + message/template version + canonical operation hash, not only rendered human text;
- right-to-left/bidi and Unicode-confusable rendering is tested for capability/account/target identifiers;
- accessibility labels announce risk and target consistently with visible content.

### 22.93 Supply-Chain Evidence / SBOM UX

Platform/Tenant Admin security views SHALL show, as role permits:
- immutable runtime/package digest;
- SBOM availability/format/verification state;
- VEX/advisory matches and issuer;
- signature/provenance continuity;
- transitive dependency findings;
- last scan/evidence refresh and quarantine effect.

Raw SBOM documents remain protected downloads/views; end users normally see only a concise trust/availability state.

### 22.94 RAG Source Trust and Instruction-Isolation UX

Admin/operator RAG diagnostics SHALL show MCP-derived source trust class, current ACL/freshness, instruction-isolation mode, index generation, and whether the document is blocked from autonomous model context. End-user answers expose citations appropriate to current permission but not internal trust-policy details that reveal inaccessible resources.

### 22.95 In-Flight Revocation and Model-Failover UX

Activity/trace UI SHALL distinguish:
- `Revocation pending`;
- `Cancel requested`;
- `Cancelled before effect`;
- `External outcome unknown`;
- `Late result discarded`;
- `Model provider failed over / tool projection rebuilt`.

Operators can navigate to effect reconciliation and projection-generation evidence; ordinary users receive concise actionable status without internal credential/tool schema details.



### 22.96 Protocol Wire Attestation / Runtime Feature UX

Platform Admin -> MCP Gateway -> Protocol Compatibility SHALL expose, per adapter/runtime:
- configured protocol profile;
- expected wire revision versus last verified wire revision;
- SDK/adapter/runtime versions;
- attestation status/timestamp/digest;
- verified feature matrix with `VERIFIED | UNSUPPORTED | FAILED | STALE` states;
- explicit remediation when a configured feature is unavailable on the selected runtime.

A stale/failed attestation is visually distinct from upstream health. Operators MUST be able to re-run a safe conformance probe without invoking a business WRITE tool.

### 22.97 Extension Lifecycle / Tasks Compatibility UX

Platform/Tenant detail SHALL distinguish **core MCP compatibility** from **extension compatibility**.

For Tasks and other extensions, show:
- namespace and pinned version/revision;
- lifecycle maturity (`STABLE/DRAFT/EXPERIMENTAL/DEPRECATED/REMOVED`);
- allowed tenants/runtimes;
- feature flag and security-review status;
- affected tools, including normalized `taskSupport` (`FORBIDDEN/OPTIONAL/REQUIRED/UNKNOWN`);
- incompatibility reason when a tool requires an extension the current runtime cannot support.

Draft/experimental enablement requires an explicit warning, rollback path, and Platform-authorized change; ordinary users do not see protocol jargon unless it explains why an integration is unavailable.

### 22.98 Secure MRTR Input UX

MRTR forms SHALL render according to SmartAIHub's sensitive-input classification rather than blindly reproducing upstream form semantics.

UX rules:
- normal inputs may appear inline in Chat/Assistant;
- sensitive personal fields show purpose and retention notice where required;
- passwords/API keys/recovery secrets/private keys never use ordinary message composition or model-visible form state;
- one-time codes are masked and auto-expire;
- unsupported high-risk fields show **Secure input required** with the approved OAuth/provider-hosted/protected-form route;
- stale MRTR forms become read-only and explain that the request must be refreshed rather than submitting against old `requestState`.

### 22.99 Subscription Level-Trigger / Freshness UX

Operator freshness views SHALL make clear that MCP subscription notifications are invalidation signals, not a durable event ledger.

Show:
- active listener/lease and honored notification subset;
- acknowledgement status;
- last signal received;
- last authoritative re-list/re-read success;
- current catalog/resource generation;
- coalesced/duplicate signal counts;
- stale/reconciliation-required state.

Do not present MCP notification sequence as proof that every intermediate upstream change was observed.

### 22.100 Opaque State Handle / Deprecation Inventory UX

Protected state handles SHALL not display raw values in ordinary UI. Operator views show only surrogate ID, bound server/revision/account/scope, expiry/status and last use.

Platform Admin -> Protocol Compatibility SHALL also expose a **Deprecation & Migration** view containing:
- deprecated/removed protocol features/transports;
- dependent servers/installations/workflows/Agents/Runners;
- upstream and internal migration deadlines;
- replacement path;
- owner/blocker state;
- release-gate status.



### 22.101 Cross-Spec UI / Operator Alignment with Spec 200

Spec 199 UI remains responsible for MCP infrastructure, connections, tools/resources/prompts/extensions, health, approvals and upstream execution evidence. Spec 200 owns provider-agent/session-specific management. Shared concerns are surfaced once.

UI rules:
- **one Assistant approval surface** handles MCP capability approval and External Agent/provider actions using shared approval identity/replay protection;
- **one Runner/device page** shows sibling MCP Runtime Manager and Agent Runtime Core state under the same Runner identity rather than duplicate devices;
- MCP tool detail MAY show `Available to External Agents via Capability Gateway` and effective agent/tenant policy, but never exposes upstream credentials to agent configuration;
- External Agent session/activity links MAY deep-link into Spec 199 MCP call trace for a capability invocation using shared trace IDs;
- MCP-derived RAG entries display lineage/revocation/trust status consistently whether retrieval was initiated by OpenAI Agents SDK or Spec 200;
- UI must not offer a "connect this agent directly to upstream MCP" path that bypasses Spec 199;
- `/chat` and Universal AI Assistant Side Panel always enter LangGraph; they do not command Runner directly for ordinary product flows.


## 23. API Contracts

The API SHALL remain SmartAIHub-owned and role/scope aware.

Management-plane mutation requirements:
- retriable create/action mutations accept `Idempotency-Key` (or equivalent typed request token);
- updates to existing mutable records require `If-Match`/version token or an equivalent optimistic-concurrency field;
- every mutation is authorized server-side against management-plane actor scope; Agent/execution-plane identities are denied unless an explicit service-principal management role is configured;
- mutation responses return the new canonical record version/generation so UI can update without waiting for an eventually-consistent index;
- trace/correlation ID is returned on success and normalized error responses.

### 23.1 Platform / Core MCP APIs

```text
GET    /api/mcp/servers
POST   /api/mcp/servers
GET    /api/mcp/servers/{id}
PATCH  /api/mcp/servers/{id}
DELETE /api/mcp/servers/{id}
POST   /api/mcp/servers/{id}/test
POST   /api/mcp/servers/{id}/discover
GET    /api/mcp/servers/{id}/health
GET    /api/mcp/servers/{id}/tools
```

### 23.2 Registry / Catalog

```text
GET    /api/mcp/registry-sources
POST   /api/mcp/registry-sources
PATCH  /api/mcp/registry-sources/{id}
POST   /api/mcp/registry-sources/{id}/sync
GET    /api/mcp/catalog
GET    /api/mcp/catalog/{package_id}
POST   /api/mcp/catalog/{package_id}/approve
POST   /api/mcp/catalog/{package_id}/block
```

### 23.3 Installations

```text
GET    /api/mcp/installations
POST   /api/mcp/installations
GET    /api/mcp/installations/{id}
PATCH  /api/mcp/installations/{id}
DELETE /api/mcp/installations/{id}
POST   /api/mcp/installations/{id}/enable
POST   /api/mcp/installations/{id}/disable
```

### 23.4 Tools / Reviews

```text
GET    /api/mcp/tools/{id}
PATCH  /api/mcp/tools/{id}
GET    /api/mcp/reviews
GET    /api/mcp/reviews/{id}
POST   /api/mcp/tools/{id}/approve
POST   /api/mcp/tools/{id}/reject
POST   /api/mcp/tools/{id}/approve-with-restrictions
```

### 23.5 Connections / OAuth

```text
GET    /api/mcp/connections
POST   /api/mcp/connections
GET    /api/mcp/connections/{id}
POST   /api/mcp/connections/{id}/test
POST   /api/mcp/connections/{id}/reconnect
DELETE /api/mcp/connections/{id}

POST   /api/mcp/oauth/{server_id}/start
GET    /api/mcp/oauth/{server_id}/callback
POST   /api/mcp/oauth/{server_id}/revoke
```

OAuth callback routes may differ by provider but MUST resolve to the same connection contract.

### 23.6 Policy APIs

```text
GET    /api/mcp/policies/effective
GET    /api/mcp/policies
POST   /api/mcp/policies
PATCH  /api/mcp/policies/{id}
DELETE /api/mcp/policies/{id}
POST   /api/mcp/policies/preview
```

`/preview` SHALL return effective outcomes before committing a bulk policy change.

### 23.7 Agent Bindings

```text
GET    /api/mcp/agents/{agent_id}/access
PUT    /api/mcp/agents/{agent_id}/access
GET    /api/mcp/agents/{agent_id}/effective-tools
```

### 23.8 User-Facing Connection APIs

```text
GET    /api/me/integrations
GET    /api/me/integrations/available
GET    /api/me/integrations/{id}
POST   /api/me/integrations/{id}/connect
POST   /api/me/integrations/{id}/reconnect
DELETE /api/me/integrations/{id}/connection
PATCH  /api/me/integrations/{id}/preferences
GET    /api/me/integrations/activity
```

User endpoints MUST never expose admin-only protocol/configuration fields.

### 23.9 Capability APIs

```text
POST   /api/capabilities/search              # capability.search
GET    /api/capabilities/{id}                # capability.describe
POST   /api/capabilities/{id}/execute        # capability.invoke
GET    /api/capabilities/{id}/status         # capability.status
GET    /api/capability-calls/{call_id}/result # capability.result
POST   /api/capabilities/{id}/authorize
```

Execution must re-evaluate effective permission even if search already authorized discovery.

### 23.10 Activity / Audit

```text
GET    /api/mcp/activity
GET    /api/mcp/activity/{trace_id}
GET    /api/me/integrations/activity
```

Visibility MUST be scope-filtered server-side.

### 23.11 Runner APIs

```text
POST   /api/runner/mcp/register
POST   /api/runner/mcp/heartbeat
POST   /api/runner/mcp/discover
POST   /api/runner/mcp/execute
POST   /api/runner/mcp/start
POST   /api/runner/mcp/stop
POST   /api/runner/mcp/restart
GET    /api/runner/mcp/logs
```

### 23.12 UI Bootstrap Contract

Each MCP management surface SHOULD receive a bootstrap payload containing:

```json
{
  "actor_scope": "TENANT_ADMIN",
  "tenant_id": "...",
  "feature_flags": {},
  "permissions": {
    "can_install": true,
    "can_add_custom_mcp": false,
    "can_manage_policy": true,
    "can_manage_shared_credentials": true,
    "can_manage_runner": false
  },
  "policy_summary": {},
  "counts": {}
}
```

This reduces client-side permission guessing while backend endpoints remain authoritative.

---


### 23.13 Protocol / Primitive APIs

```text
GET  /api/mcp/servers/{id}/protocol
POST /api/mcp/servers/{id}/compatibility-check
GET  /api/mcp/servers/{id}/resources
POST /api/mcp/servers/{id}/resources/refresh
GET  /api/mcp/resources/{id}
POST /api/mcp/resources/{id}/index
DELETE /api/mcp/resources/{id}/index
GET  /api/mcp/servers/{id}/prompts
GET  /api/mcp/prompts/{id}
GET  /api/mcp/servers/{id}/extensions
```

### 23.14 MRTR / Pending Input APIs

```text
GET  /api/mcp/pending-inputs
GET  /api/mcp/pending-inputs/{id}
POST /api/mcp/pending-inputs/{id}/respond
POST /api/mcp/pending-inputs/{id}/cancel
```

Responses MUST be bound to the current user/tenant/trace and protected against replay.

### 23.15 Remote Task APIs

```text
GET  /api/mcp/tasks/{id}
POST /api/mcp/tasks/{id}/cancel
```

UI-facing task APIs return SmartAIHub normalized task state, not raw upstream protocol payloads.

### 23.16 Preflight API

```text
POST /api/capabilities/preflight
```

Input: required capability IDs/version constraints. Output: per-capability readiness + normalized overall status.

### 23.17 Security Scan / Provenance APIs

```text
GET  /api/mcp/servers/{id}/provenance
GET  /api/mcp/servers/{id}/scan-findings
POST /api/mcp/servers/{id}/rescan
```

Scanner and provenance endpoints are admin-scoped.

### 23.18 Connection Selection APIs

```text
GET  /api/mcp/installations/{id}/connections/eligible
PUT  /api/mcp/installations/{id}/connections/default
POST /api/mcp/executions/{executionId}/select-connection
```

Responses expose safe display identity and scope, never credential material. Execution selection is validated against the current tenant/user/agent context.

### 23.19 Subscription / Freshness APIs

```text
GET  /api/mcp/servers/{id}/subscriptions
POST /api/mcp/servers/{id}/subscriptions/reconnect
GET  /api/mcp/servers/{id}/freshness
```

These endpoints are diagnostic/admin surfaces; ordinary execution does not depend on the UI calling them.

### 23.20 Revision / Rollout APIs

```text
GET  /api/mcp/servers/{id}/revisions
GET  /api/mcp/revisions/{revisionId}
POST /api/mcp/revisions/{revisionId}/approve
POST /api/mcp/revisions/{revisionId}/block
POST /api/mcp/installations/{id}/pin-revision
POST /api/mcp/rollouts
PATCH /api/mcp/rollouts/{id}
POST /api/mcp/rollouts/{id}/rollback
```

All mutating calls require optimistic concurrency/version tokens and audit actor/reason.

### 23.21 Execution Approval APIs

```text
POST /api/mcp/execution-approvals
GET  /api/mcp/execution-approvals/{id}
POST /api/mcp/execution-approvals/{id}/consume
POST /api/mcp/execution-approvals/{id}/revoke
```

`consume` is server-internal or protected to the execution plane and MUST be atomic/single-use where configured. Clients never submit an arbitrary tool payload under an unrelated approval ID.


### 23.22 Discovery Generation / Budget APIs

```text
GET  /api/mcp/servers/{id}/discovery-generations
GET  /api/mcp/servers/{id}/discovery-generations/{generationId}
GET  /api/mcp/budgets
PUT  /api/mcp/budgets/{scopeType}/{scopeId}
GET  /api/mcp/usage/external-cost
```

Budget mutation is admin/policy scoped. Usage responses MUST distinguish estimated, provider-reported actual, and unknown cost.



### 23.23 Control-Plane Event / Projection APIs

Admin/diagnostic APIs:

```text
GET  /api/mcp/control-plane/health
GET  /api/mcp/control-plane/projections
GET  /api/mcp/control-plane/events/{id}
GET  /api/mcp/control-plane/dlq
POST /api/mcp/control-plane/events/{id}/retry
POST /api/mcp/control-plane/projections/{name}/reconcile
```

These APIs expose safe metadata only. Reconcile/retry endpoints require elevated admin scope, idempotency protection, and audit reason.

### 23.24 Residency / Placement APIs

Where enabled:

```text
GET  /api/mcp/residency/options
GET  /api/mcp/residency/effective
PUT  /api/mcp/residency/tenant/{tenantId}
POST /api/mcp/residency/preview
```

`preview` returns policy outcome for proposed placement/failover without performing data movement.

### 23.25 Privileged Operation APIs

Break-glass is a dedicated control-plane surface, not a normal capability:

```text
POST /api/mcp/privileged-operations/prepare
POST /api/mcp/privileged-operations/{id}/authorize
POST /api/mcp/privileged-operations/{id}/execute
GET  /api/mcp/privileged-operations/{id}
```

Prepare/authorize/execute MAY require different factors/actors depending on deployment policy. Every state transition is append-audited and time-limited.

### 23.26 Lifecycle / Decommission APIs

```text
POST /api/mcp/installations/{id}/decommission/preview
POST /api/mcp/installations/{id}/decommission
GET  /api/mcp/installations/{id}/decommission-status
POST /api/mcp/connections/{id}/revoke
```

Preview returns dependency/queued-work/credential impact before mutation.

### 23.27 Consent / Authorization History APIs

```text
GET    /api/me/mcp/consent-receipts
DELETE /api/me/mcp/consent-receipts/{id}/reusable-grant
GET    /api/me/mcp/data-retention-summary
POST   /api/me/mcp/data-deletion-preview
POST   /api/me/mcp/data-deletion
```

These APIs never return token material.

### 23.28 Bulk / Dry-Run / Emergency APIs

```text
POST /api/mcp/bulk/preview
POST /api/mcp/bulk/apply
POST /api/mcp/emergency/containment
POST /api/mcp/emergency/containment/{id}/clear
GET  /api/mcp/emergency/containment
```

Apply requires the preview generation/version (or equivalent mutation precondition) so the committed target set cannot silently differ from what the operator reviewed.


### 23.29 Revocation / Restore / Provenance APIs

Recommended internal/admin contracts:

```text
POST /api/mcp/revocation/epochs
GET  /api/mcp/revocation/epochs/{scope}
GET  /api/mcp/restore/readiness
POST /api/mcp/restore/enter-safety-mode
POST /api/mcp/restore/exit-safety-mode
GET  /api/mcp/provenance/{capability_id}
POST /api/mcp/provenance/{revision_id}/verify
```

Mutations require management-plane identity, idempotency keys, optimistic concurrency where applicable, and immutable audit evidence.

### 23.30 Capability Lifecycle / Dependency APIs

```text
GET  /api/mcp/capabilities/{id}/dependents
POST /api/mcp/capabilities/{id}/deprecate
POST /api/mcp/capabilities/{id}/retire
POST /api/mcp/capabilities/{id}/migration-preview
POST /api/mcp/capabilities/{id}/migrate-consumers
```

Migration preview MUST be side-effect free and return the exact control-plane generation used for impact calculation.


### 23.31 Protocol Policy / Compatibility APIs

```text
GET   /api/mcp/installations/{id}/protocol-policy
PATCH /api/mcp/installations/{id}/protocol-policy
POST  /api/mcp/installations/{id}/protocol-probe
POST  /api/mcp/installations/{id}/protocol-downgrade-review
```

Mutations use management idempotency/optimistic-concurrency rules.

### 23.32 Runtime Reconciliation / Fencing APIs

```text
GET  /api/mcp/runtime/reconciliation
POST /api/mcp/runtime/reconciliation/{id}/retry
POST /api/mcp/runtime/reconciliation/{id}/resolve
GET  /api/mcp/runtime/leases/{execution_id}
POST /api/mcp/runtime/leases/{execution_id}/takeover
```

Takeover/resolve operations require privileged policy and return the new authoritative generation/fencing epoch.

### 23.33 Quota Reservation / Readiness APIs

```text
GET /api/mcp/budgets/{scope}/reservations
GET /api/mcp/budgets/{scope}/summary
GET /api/mcp/runtime/readiness
```

Internal execution APIs MAY expose reserve/settle/release operations but they MUST NOT be callable by Agent identity as management functions.


### 23.34 Delegation / Service-Principal APIs

```text
GET    /api/mcp/service-principals
POST   /api/mcp/service-principals
GET    /api/mcp/service-principals/{id}/bindings
PUT    /api/mcp/service-principals/{id}/bindings
GET    /api/mcp/executions/{id}/principal-chain
```

Management mutations remain human/admin/service-management scoped and use normal idempotency/concurrency controls.

### 23.35 Resume Revalidation APIs

```text
POST   /api/mcp/pending-inputs/{id}/revalidate
POST   /api/mcp/tasks/{id}/resume
GET    /api/mcp/tasks/{id}/resume-readiness
```

Resume endpoints SHALL return structured stale reasons rather than bypassing policy.

### 23.36 Effect Receipt / Verification APIs

```text
GET    /api/mcp/executions/{id}/effect-receipt
POST   /api/mcp/executions/{id}/verify-postcondition
POST   /api/mcp/executions/{id}/reconcile-outcome
```

Verification/reconciliation MUST be idempotent and cannot replay the original write unless retry safety is independently proven.

### 23.37 Artifact Intake / Provenance APIs

```text
GET    /api/mcp/artifacts/{id}/provenance
GET    /api/mcp/artifacts/{id}/scan-status
POST   /api/mcp/artifacts/{id}/rescan
POST   /api/mcp/artifacts/{id}/review
```

### 23.38 Projection Convergence APIs

```text
GET    /api/mcp/control-plane/generations/{generation}
GET    /api/mcp/capabilities/{id}/projection-status
POST   /api/mcp/capabilities/{id}/reconcile-projection
```

These APIs expose canonical-vs-projection state without making the projection authoritative for side-effect permission.

### 23.39 Lifecycle / Retry / Policy / Evidence APIs

Recommended endpoints/contracts:

```text
GET  /api/mcp/entities/{type}/{id}/lifecycle
POST /api/mcp/entities/{type}/{id}/transition
GET  /api/mcp/executions/{id}/attempts
POST /api/mcp/executions/{id}/verify-effect
GET  /api/mcp/policy/effective
POST /api/mcp/policy/preview
GET  /api/mcp/regions/authority
POST /api/mcp/regions/failover-preview
POST /api/mcp/evidence/exports
GET  /api/mcp/evidence/exports/{id}
```

Requirements:
- transition mutations require expected generation/version and idempotency key;
- lifecycle response returns allowed next transitions as advisory UI metadata, but server-side guard remains authoritative;
- attempt endpoint exposes safe lineage/status metadata, never raw secret-bearing payloads;
- policy preview returns contributing rule IDs/generations only when caller can view them;
- failover preview is non-mutating and reports reconciliation/UNKNOWN_OUTCOME/quota/deletion/revocation blockers;
- evidence export is asynchronous/durable when large and uses `worker_jobs` rather than an unbounded synchronous request;
- all privileged endpoints use management-plane identity, audit reason/purpose, and rate limiting.
### 23.40 Catalog Budget / Dependency / Automation APIs

```text
GET  /api/mcp/installations/{id}/discovery-budget
PATCH /api/mcp/installations/{id}/discovery-budget
GET  /api/mcp/installations/{id}/catalog-completeness
GET  /api/mcp/capabilities/{id}/dependency-graph
POST /api/mcp/dependencies/validate
GET  /api/mcp/automations/{id}/mcp-readiness
POST /api/mcp/automations/{id}/mcp-preflight
```

Budget mutation requires governed Admin policy and impact preview; dependency validation is side-effect free.

### 23.41 Critical Approval / Privacy / Advisory APIs

```text
POST /api/mcp/critical-changes/proposals
POST /api/mcp/critical-changes/{id}/approve
POST /api/mcp/critical-changes/{id}/reject
GET  /api/mcp/privacy/erasure/{request_id}/status
POST /api/mcp/privacy/erasure/{request_id}/reconcile
GET  /api/mcp/security/advisories
POST /api/mcp/security/advisories/ingest
POST /api/mcp/security/advisories/{id}/impact-preview
GET  /api/mcp/resources/{id}/rag-lineage
POST /api/mcp/resources/{id}/rag-reconcile
```

Critical-change approval SHALL enforce proposer/approver separation and current generation. Advisory ingestion is Platform/security scoped; tenant admins may view only advisories relevant to their installations.



### 23.42 Ephemeral Credential / Lease APIs

```text
GET  /api/mcp/connections/{id}/credential-posture
POST /api/mcp/connections/{id}/credential-leases/preview
POST /api/mcp/connections/{id}/credential-leases/mint      # execution-plane/internal or privileged service API
POST /api/mcp/credential-leases/{id}/revoke
```

Bearer material is never returned from ordinary management GET endpoints. Mint responses use a protected execution-plane secret-delivery contract, not a browser JSON response.


### 23.43 Automation Guard / Runtime Resource APIs

```text
GET  /api/mcp/automations/{id}/execution-guard
PATCH /api/mcp/automations/{id}/execution-guard
GET  /api/mcp/runners/{id}/resource-claims
POST /api/mcp/runners/{id}/resource-claims/reconcile
GET  /api/mcp/runtime/capacity
```

Bulk/admin mutations follow existing optimistic concurrency, idempotency, dual-control and audit rules.


### 23.44 Approval Resolution / Display Snapshot APIs

```text
GET  /api/mcp/execution-approvals/{id}
POST /api/mcp/execution-approvals/{id}/approve
POST /api/mcp/execution-approvals/{id}/reject
POST /api/mcp/execution-approvals/{id}/cancel
```

Responses include canonical `record_version`, current terminal state, safe authoritative display snapshot, and whether the requesting browser must refresh. Mutations require expected version/generation and fail with `MCP_APPROVAL_ALREADY_RESOLVED` on terminal-state races.


### 23.45 Model Tool-Projection / Exposure Diagnostic APIs

Recommended internal/admin contracts:

```text
GET  /api/mcp/executions/{id}/model-tools
GET  /api/mcp/capabilities/{id}/model-projection-preview?provider=...
POST /api/mcp/capabilities/{id}/model-projection-validate
```

Responses expose canonical IDs, aliases, projection version/hash, token/byte estimate and translation classification, but never secret arguments or raw private schemas the caller is not authorized to view.

### 23.46 Transport Profile APIs

```text
GET    /api/mcp/transport-profiles
POST   /api/mcp/transport-profiles
GET    /api/mcp/transport-profiles/{id}
PATCH  /api/mcp/transport-profiles/{id}
POST   /api/mcp/transport-profiles/{id}/test
POST   /api/mcp/transport-profiles/{id}/rotate
POST   /api/mcp/transport-profiles/{id}/revoke
```

Secret writes are write-only references/values forwarded to the approved secret manager. Reads return secret-presence/version metadata, not the secret. Reserved-header validation and scope/tenant authorization occur server-side.

### 23.47 Automation Ownership / Custodian APIs

```text
GET  /api/mcp/automations/{id}/ownership
POST /api/mcp/automations/{id}/ownership/transfer-preview
POST /api/mcp/automations/{id}/ownership/transfer
POST /api/mcp/automations/{id}/pause-orphaned
```

Transfer uses optimistic concurrency and, when configured, dual control. Preview includes external-account/consent/purpose/budget/capability impacts.

### 23.48 Runner Installer / Local Endpoint Trust APIs

Runner/control-plane contracts SHOULD support:

```text
POST /api/runner/mcp/installations/{id}/stage
POST /api/runner/mcp/installations/{id}/scan
POST /api/runner/mcp/installations/{id}/activate
POST /api/runner/mcp/installations/{id}/rollback
GET  /api/runner/mcp/installations/{id}/runtime-identity
POST /api/runner/mcp/installations/{id}/verify-local-endpoint
```

Activation/verification requires current fencing/resource claim/revision identity. Local endpoint credentials are never returned to browser/user APIs.


### 23.49 Runtime Result / Drift APIs

```text
GET  /api/mcp/tools/{id}/result-contract
GET  /api/mcp/tools/{id}/result-drift
POST /api/mcp/tools/{id}/result-drift/review
```

### 23.50 Subscription Lease / Refresh APIs

```text
GET  /api/mcp/subscriptions
GET  /api/mcp/subscriptions/{id}
POST /api/mcp/subscriptions/{id}/recycle
POST /api/mcp/installations/{id}/authoritative-refresh
```

All mutations use authorization, idempotency, lifecycle guards, and fencing/generation checks.

### 23.51 Policy Simulation APIs

```text
POST /api/mcp/policy/simulations
GET  /api/mcp/policy/simulations/{id}
POST /api/mcp/policy/simulations/{id}/promote-preview
```

Simulation APIs never invoke external business capabilities.

### 23.52 Portable Configuration APIs

```text
POST /api/mcp/config/exports
GET  /api/mcp/config/exports/{id}
POST /api/mcp/config/imports/validate
POST /api/mcp/config/imports
```

Export/import payloads exclude secret material and remain scope/generation bound.

### 23.53 External Usage Reconciliation APIs

```text
GET  /api/mcp/usage/reconciliation
GET  /api/mcp/usage/reconciliation/{id}
POST /api/mcp/usage/reconciliation/{id}/retry
POST /api/mcp/usage/reconciliation/{id}/mark-disputed
```

These APIs feed existing accounting/credit contracts where applicable; they do not expose an independent mutable SmartAIHub balance ledger.


### 23.54 Tool Annotation / Effective Risk APIs

```text
GET  /api/mcp/tools/{id}/risk
GET  /api/mcp/tools/{id}/annotations
POST /api/mcp/tools/{id}/risk-review
```

Responses MUST distinguish upstream-declared hints from SmartAIHub-verified/effective risk.

### 23.55 Supply-Chain Evidence APIs

```text
GET  /api/mcp/revisions/{id}/supply-chain
POST /api/mcp/revisions/{id}/supply-chain/refresh
GET  /api/mcp/revisions/{id}/sbom
GET  /api/mcp/revisions/{id}/provenance
```

Downloads require current permission and never include package-manager secrets.

### 23.56 RAG Trust / Instruction-Isolation APIs

```text
GET  /api/mcp/rag/lineage/{id}
POST /api/mcp/rag/lineage/{id}/revalidate
POST /api/mcp/rag/rebuild-preview
```

Mutations are generation-bound and cannot make an inaccessible source searchable before authoritative ACL policy permits it.

### 23.57 In-Flight Revocation / Containment APIs

```text
POST /api/mcp/executions/{id}/revoke
POST /api/mcp/executions/{id}/cancel
GET  /api/mcp/executions/{id}/effect-status
GET  /api/mcp/executions/{id}/revocation-status
```

These APIs report local containment separately from confirmed upstream effect/cancellation.

### 23.58 Cognitive Projection / Failover APIs

```text
GET  /api/mcp/orchestration/{run_id}/model-projections
POST /api/mcp/orchestration/{run_id}/failover-preview
```

Provider/model failover itself remains owned by the orchestration/cognitive layer; MCP APIs expose only governed capability projection evidence and compatibility diagnostics.



### 23.59 Wire Attestation / Runtime Feature APIs

```text
GET  /api/mcp/protocol/attestations
GET  /api/mcp/protocol/attestations/{runtime}
POST /api/mcp/protocol/attestations/{runtime}/verify
GET  /api/mcp/runtime-features
GET  /api/mcp/runtime-features/{runtime}
```

Verification endpoints execute only safe protocol conformance probes and never business side effects.

### 23.60 Extension / Task-Support APIs

```text
GET  /api/mcp/extensions
GET  /api/mcp/extensions/{namespace}
POST /api/mcp/extensions/{namespace}/preview-enable
PUT  /api/mcp/extensions/{namespace}/policy
GET  /api/mcp/tools/{id}/execution-compatibility
```

Responses include pinned extension revision/maturity, runtime attestation, normalized tool task-support and effective availability.

### 23.61 Secure MRTR Input APIs

```text
GET  /api/mcp/pending-inputs/{id}/presentation
POST /api/mcp/pending-inputs/{id}/submit
POST /api/mcp/pending-inputs/{id}/secure-session
POST /api/mcp/pending-inputs/{id}/cancel
```

The presentation endpoint returns only the safe classified rendering model. Secret fields use protected submission channels and SHALL not echo secret values in API responses, logs, analytics or model context.

### 23.62 Opaque State Handle APIs

```text
GET  /api/mcp/state-handles/{surrogate_id}
POST /api/mcp/state-handles/{surrogate_id}/revoke
GET  /api/mcp/state-handles?execution_intent_id=...
```

These APIs expose metadata/surrogates only. Raw upstream handle material is resolved internally at the execution boundary.

### 23.63 Protocol Feature Lifecycle / Deprecation APIs

```text
GET  /api/mcp/protocol-features
GET  /api/mcp/protocol-features/{feature}
POST /api/mcp/protocol-features/{feature}/impact-preview
PUT  /api/mcp/protocol-features/{feature}/migration-status
```

Impact preview reuses the existing dependency graph and never mutates runtime state.


## 24. Observability

Metrics:
- server availability
- tool discovery duration
- schema change rate
- call count
- success/failure
- latency p50/p95/p99
- auth failures
- policy denials
- confirmation rate
- DLP blocks
- queue wait
- Runner dispatch latency
- protocol/compatibility failures
- MRTR rounds / waiting-for-input duration
- upstream task age / poll failures
- resource/prompt discovery/read volume
- OAuth refresh success/failure
- scanner findings by severity
- preflight result class
- UNKNOWN_OUTCOME count
- external quota/rate-limit failures
- subscription listener reconnects / catalog invalidation lag
- circuit-breaker opens / half-open probe outcomes
- approval stale/replay rejections
- revision drift / rollout rollback count
- partial-success / compensation outcomes
- discovery pages/items/bytes and truncated/failed generation count
- external-cost budget warnings/blocks and estimate-vs-actual variance
- protocol parser/size-limit rejections

Trace attributes:
- tenant_id
- user_id
- agent_id
- capability_id
- mcp_server_id
- mcp_tool_id
- schema_hash
- risk_level
- execution_location
- worker_job_id

---


### 24.0 Regional Write Authority and Split-Brain Prevention

Multi-region availability SHALL NOT permit two isolated regions to accept conflicting authoritative MCP control-plane mutations or duplicate non-idempotent effects.

Requirements:
- each tenant/control-plane object has a defined write-authority strategy (for example authoritative primary/home region or strongly consistent global datastore);
- region failover requires fencing/epoch advancement so the old writer cannot resume authoritative mutations after partition recovery;
- emergency revocation epoch and execution-intent ledger remain authoritative across failover;
- if write authority cannot be established, management mutations and high-risk side effects fail closed while read-only diagnostics may remain available;
- cross-region queue consumers verify current authority/fencing before dispatch;
- failback is an explicit operation with reconciliation of control events, UNKNOWN_OUTCOME effects, quota reservations, and deletion/revocation state;
- region routing for residency must not override write-authority safety.

Chaos tests SHALL include network partition, delayed replication, failover, old-region recovery, and simultaneous mutation attempts.

### 24.1 Distributed Tracing Propagation

Where supported, propagate W3C Trace Context (`traceparent`, `tracestate`, controlled `baggage`) through MCP request metadata without placing secrets or high-cardinality sensitive values in baggage.

A trace SHOULD correlate:

```text
HTTP request
 -> LangGraph run
 -> cognitive run (optional)
 -> capability call
 -> MCP gateway call
 -> upstream MCP/tool/task
 -> Runner/worker_job (optional)
```

### 24.2 High Availability and Stateless Scaling

For modern stateless MCP upstreams, the SmartAIHub gateway SHALL avoid sticky-session assumptions and SHOULD be horizontally scalable behind normal load balancing.

SmartAIHub-owned state that must survive process failure belongs in PostgreSQL/job storage/cache infrastructure, not process memory alone:
- pending approvals;
- pending input state;
- credential metadata;
- remote task linkage;
- activity/trace correlation;
- capability index generation/version.

### 24.3 Backup, Restore, and Disaster Recovery

Backup policy SHALL cover configuration and audit state necessary to reconstruct MCP installations while respecting secret-manager boundaries.

At minimum:
- DB backup includes server definitions, installations, policies, approvals, non-secret credential metadata, task/job linkage, and audit retention data;
- secret material is backed up/replicated according to the secret manager/KMS product policy, not exported into DB backup;
- restore procedure invalidates unsafe ephemeral OAuth/MRTR state where replay cannot be guaranteed safe;
- capability indexes are rebuildable from canonical DB/upstream discovery;
- Runner-local process state is reconstructable from server-managed desired state.

### 24.4 Retention and Privacy

Define configurable retention for:
- activity logs;
- scanner findings;
- resource content/indexes;
- MRTR pending-input payloads;
- upstream error payloads.

Sensitive request/response bodies SHOULD use minimal retention and redaction. Deleting a user/tenant connection MUST trigger cleanup of associated personal tokens, caches, pending inputs, and user-scoped indexed resources according to retention/legal policy.


### 24.5 Audit Integrity and Evidence Quality

Security/audit records for MCP management and execution SHALL be append-oriented and protected against silent modification.

Minimum controls:
- separate permission to view vs administer audit retention/export;
- canonical event IDs and actor/tenant/trace linkage;
- immutable/WORM storage or cryptographic hash-chain/signature mechanism where required by deployment/compliance tier;
- corrections are appended as new events rather than rewriting history;
- audit export excludes secret values while preserving evidentiary metadata;
- backup/restore preserves ordering/integrity metadata;
- alert on unexplained audit gaps or consumer lag above configured threshold.

### 24.6 Multi-Region / Data Residency and Egress Placement

If SmartAIHub runs the MCP Gateway in multiple regions, placement SHALL be policy-aware rather than arbitrary.

The deployment model SHALL define:
- tenant/credential/audit residency region;
- permitted cross-region control/data egress;
- region affinity for OAuth callbacks and secret-manager access where required;
- Runner's home tenant/region mapping;
- whether an upstream call may leave the tenant's configured data region;
- failover behavior when the preferred region is unavailable.

A failover MUST NOT silently violate data-residency or credential-location policy. If compliant failover is unavailable, fail closed with an actionable availability message.

### 24.7 SLI/SLO and Projection-Freshness Budgets

Production deployments SHALL define measurable service objectives for at least:
- MCP gateway availability;
- capability search latency;
- gateway-added execution overhead (excluding upstream runtime);
- control-plane event/projection lag;
- health/freshness propagation time;
- OAuth reconnect success/failure rate;
- Runner dispatch latency;
- audit/control-event loss = zero for committed canonical events.

Exact numeric targets are deployment/configuration values, but the implementation MUST emit metrics sufficient to evaluate them and alert when control-plane projection lag could make discovery materially stale.

### 24.8 Distributed Consistency Contract

Canonical authorization/policy/approval state lives in the database. Caches/indexes are projections and MAY be eventually consistent for read-only discovery, but side-effecting dispatch MUST perform an authoritative final validation or verify a current generation token.

Read-after-write expectations:
- after approving/blocking/revoking from UI, that actor receives authoritative state immediately from the mutation response;
- search projections converge asynchronously through control events;
- WRITE/DESTRUCTIVE execution fails closed if required policy generation cannot be proven current;
- connection revocation/quarantine/block events have priority invalidation and MUST NOT wait only for TTL expiry.

### 24.9 Policy Decision, Consent, and Lifecycle Observability

Metrics/events SHOULD cover:
- policy-generation mismatch / dispatch revalidation denial;
- reusable approval grant/revoke/expiry;
- connection revocation propagation latency;
- integration decommission duration and unresolved cleanup items;
- emergency containment activation-to-enforcement latency;
- payload/decompression budget violations;
- privacy deletion backlog/failures without exposing deleted content;
- drain duration and forced-shutdown count.

Traces for side-effecting calls SHALL carry policy-generation identifiers and approval/consent receipt IDs where applicable, but MUST NOT carry secret values or user-entered sensitive content.


### 24.10 Revocation Epoch and Cross-Region Replay Protection

Emergency deny, credential revocation, tool quarantine, approval revocation, tenant/user offboarding, and security-critical policy tightening SHALL advance an authoritative revocation generation/epoch for the affected scope.

Requirements:
- every side-effecting dispatch validates that its authorization/approval snapshot is not older than the applicable authoritative epoch;
- queued work and Runner dispatch revalidate the epoch immediately before side effects;
- region-local caches MUST NOT downgrade a newer epoch to an older value;
- propagation acknowledgements are observable per region/gateway/Runner;
- inability to prove a current epoch for WRITE/DESTRUCTIVE/PRIVILEGED execution fails closed;
- clearing containment does not decrement/reuse an old epoch.

For cross-region or retryable side-effecting execution, SmartAIHub SHALL issue a globally unique `execution_intent_id` bound to tenant, actor, capability, revision, normalized arguments hash, connection, and approval receipt. The durable execution ledger MUST reject replay of a consumed intent even if a request is retried in another region.

### 24.11 End-to-End Provenance and Attestation Chain

Capability trust SHALL be explainable from source to execution. Where provenance data is available, SmartAIHub SHALL maintain an immutable/verifiable chain:

```text
registry/catalog record
  -> package/artifact identity + digest/signature
  -> server definition
  -> immutable runtime revision
  -> discovery snapshot
  -> normalized capability/schema hash
  -> approval/policy generation
  -> execution trace
```

Rules:
- missing provenance is represented as `UNKNOWN`, never silently upgraded to `TRUSTED`;
- signatures/digests are verified against pinned trust policy where configured;
- provenance changes invalidate approvals when they alter executable identity;
- execution/audit records retain the non-secret provenance identifiers used at dispatch;
- UI distinguishes publisher assertion, cryptographic verification, registry metadata, and SmartAIHub review status.

### 24.12 Restore Safety Mode and Disaster Reconciliation

A restored database or regional failover SHALL NOT immediately resume side-effecting MCP execution merely because services are reachable.

`RESTORE_SAFETY_MODE` SHALL:
- permit management/read-only diagnostics;
- block WRITE/DESTRUCTIVE/PRIVILEGED dispatch by default;
- invalidate/reconcile ephemeral OAuth state, pending approvals, stale queue leases, subscription cursors, and connection readiness;
- verify revocation epochs and control-event projections;
- rebuild/validate capability index generations from canonical state;
- verify secret-manager/KMS bindings for the restored environment/region;
- identify UNKNOWN_OUTCOME executions before reopening dispatch;
- require auditable operator readiness approval before exit.

Read-only capability execution MAY be enabled selectively only when current tenant/policy/credential state can be proven safe.

### 24.13 Abuse Resistance and Adaptive Throttling

MCP Gateway SHALL protect both control plane and execution plane from abusive or accidental amplification, independently of upstream provider quotas.

At minimum detect/rate-limit:
- server/catalog discovery floods;
- OAuth callback/state failures and connection enumeration;
- approval/elicitation spam;
- repeated policy-denied calls;
- malformed JSON-RPC/schema/cursor payloads;
- high-churn registration/revision attempts;
- resource/prompt/tool listing amplification;
- expensive search/preflight calls with no subsequent execution.

Controls SHALL support principal/tenant/IP/device/Runner/server scopes as appropriate, exponential backoff, temporary containment, and security alerting. Rate limiting MUST NOT disclose whether a protected resource/account exists to an unauthorized caller.

### 24.14 Privacy Erasure, Backup Expiry, and Deletion Evidence

Privacy deletion SHALL account for replicated caches, vector/search indexes, temporary files, MRTR payloads, Runner-local copies, backups, and third-party/upstream data obligations.

SmartAIHub SHALL maintain a deletion ledger containing non-content evidence such as request ID, scope, requested time, systems targeted, completion state, retention/legal exception, and expected backup-expiry date.

Requirements:
- deleted authorization cannot be resurrected by backup restore;
- active systems remove or cryptographically render inaccessible deleted secrets/data within policy targets;
- immutable security audit may retain minimal non-secret evidence where legally/policy required;
- backup deletion may be deferred until rotation/expiry, but restore procedures MUST replay tombstones/deletion ledger before reopening normal dispatch;
- external-provider deletion obligations are tracked separately and not falsely reported as completed when SmartAIHub cannot verify them.


### 24.15 Telemetry Cardinality and Privacy Budget

Operational metrics MUST remain aggregatable and safe at scale.

Rules:
- metric label sets use bounded dimensions such as status/risk/transport/region/provider class; do not place raw user IDs, tenant IDs, connection IDs, capability names with unbounded cardinality, arguments, resource URIs, or external account identifiers into metric labels;
- high-cardinality identifiers belong in sampled traces/audit records with role-based access and retention controls;
- trace/log sampling MUST NOT sample away mandatory security/audit evidence; audit and observability are separate contracts;
- W3C `baggage` has an allowlist and byte/cardinality budget;
- user content, prompt/tool output, OAuth parameters, `Mcp-Param-*`, completion values, and progress text are redacted/hashed/omitted according to data class;
- dashboards MUST remain useful without requiring sensitive identifiers as metric dimensions.

### 24.16 Cold-Start and Dependency Readiness Barrier

Normal process restart/cold start (not only disaster restore) SHALL have an explicit readiness barrier for side-effect dispatch. Before WRITE/DESTRUCTIVE/PRIVILEGED execution, the gateway MUST be able to reach or prove a sufficiently fresh authoritative source for:
- canonical DB/control state;
- current revocation epoch / emergency containment;
- policy/approval generation;
- execution-intent/idempotency ledger;
- required secret manager/KMS material;
- compliant region/Runner availability where applicable.

A stale search/vector projection does not necessarily block read-only discovery, but it cannot substitute for authoritative execution validation. During partial readiness, management diagnostics/read-only health may remain online while side effects fail closed with `MCP_DEPENDENCY_NOT_READY`.


### 24.17 Delegation, Resume, and Effect-Evidence Observability

Structured trace/audit fields SHOULD include, subject to privacy/cardinality policy:
- execution principal type/ID (audit, not high-cardinality metric labels);
- credential owner scope;
- Agent/workflow/run IDs;
- resume revalidation result and stale reason;
- effect receipt/postcondition state;
- external resource/provider operation identifier in redacted/hashed form where necessary.

Dashboards SHOULD track rates of stale resumes, UNKNOWN_OUTCOME reconciliation, postcondition-verification success, and delegated-service-principal usage without exposing secret/user data in metric labels.

### 24.18 Artifact Intake and Quarantine Observability

Track:
- artifact scan/quarantine latency;
- blocked/review/error counts by safe category;
- RAG-admission delay;
- sandbox/preview failures;
- provenance-missing rate;
- cleanup/deletion backlog for derived representations.

Security evidence retains source lineage while ordinary metrics remain bounded-cardinality.

### 24.19 Retention-Hold and Deletion-Conflict Evidence

When a deletion request intersects an approved retention hold, record:
- deletion request time/scope;
- non-executable revocation completion;
- hold/policy reference;
- retained category and expiry/review date;
- final deletion evidence when eligible.

This evidence MUST NOT expose held content to roles that could not otherwise access it.

### 24.20 Control-Plane Read-Your-Writes and Projection Convergence SLO

Control-plane mutations SHALL expose:
- canonical committed generation;
- each required projection generation;
- propagation latency;
- retry/DLQ/rebuild state.

The platform defines an SLO for approval/deny/disable changes to become visible in capability search/UI projections. Security-sensitive deny/revoke remains enforced authoritatively before that SLO through dispatch-time validation.

### 24.21 Incident Evidence Bundle and Chain-of-Custody Export

Operations SHALL be able to export a bounded incident evidence bundle for security/support investigations without requiring raw database access.

A bundle MAY include:
- trace/run/execution IDs;
- immutable policy-decision snapshot IDs/generations;
- server/revision/tool canonical IDs and hashes;
- approval/consent receipt references;
- effect receipts and reconciliation state;
- control-event/outbox/projection checkpoints;
- health/circuit/Runner posture events;
- redacted protocol envelopes and errors;
- provenance/artifact lineage references;
- audit-integrity verification result.

Requirements:
- export is privileged, purpose-bound, audited, rate-limited, and tenant-scoped;
- secrets/tokens/raw private keys are excluded; sensitive content follows redaction and legal/privacy policy;
- bundle includes generation timestamps, export actor, scope, hash/manifest, and verification instructions;
- repeated export of the same immutable evidence can be cryptographically compared;
- evidence export does not create a hidden bypass around retention/deletion/hold policy;
- UI clearly distinguishes `Evidence available` from `Evidence complete`; missing telemetry is listed explicitly rather than silently omitted.


### 24.22 Causal Audit Ordering and Distributed Event Sequencing

Wall-clock timestamps alone SHALL NOT be used to infer authoritative ordering across regions, gateway instances, Runner devices, retries, or provider callbacks.

Audit/control events SHOULD carry enough causal/order metadata to reconstruct security-relevant sequences, for example:

```text
trace_id / execution_intent_id
entity_generation
revocation_epoch
control_event_sequence or stream offset
attempt_id / parent_attempt_id
region_id / writer_epoch
occurred_at
recorded_at
```

Rules:
- authoritative entity generation/sequence outranks timestamp when resolving state order;
- late-arriving events preserve original occurrence time but cannot overwrite a newer authoritative generation;
- operator timelines visually mark late/derived/replayed events when ordering differs from wall-clock display;
- evidence exports include ordering metadata needed to reproduce the sequence without relying on synchronized clocks;
- provider events without trusted sequence information are labeled observational evidence, not authoritative state transitions;
- clock skew may affect display/SLO calculations but never permits rollback of revocation/policy/entity generations.
### 24.23 MCP Resource-to-RAG ACL, Freshness, and Deletion Propagation

When an authorized MCP Resource or MCP-produced artifact is indexed into SmartAIHub RAG, the index is a derived projection, not a new independent copy with broader rights.

Each indexed chunk/document SHALL retain lineage to:
```text
source installation/server revision
resource URI or artifact lineage id
source connection/account scope where material
source content/version hash
source ACL / tenant / principal visibility class
ingestion policy generation
retention/deletion generation
last verified freshness
```

Rules:
- indexing occurs only after source authorization/provenance/safety checks;
- source ACL changes, connection removal, tenant/user offboarding, resource deletion, quarantine, or retention expiry enqueue deterministic purge/restrict events for derived indexes;
- `resources/list_changed` / `resources/updated` may trigger refresh, but notification loss does not remove the need for bounded periodic/reconciliation freshness checks when configured;
- stale indexed data MUST NOT remain queryable after authoritative access is revoked merely because vector deletion is delayed; query-time ACL/generation gates fail closed;
- reindexing never changes tenant/account ownership silently;
- RAG citations/provenance can resolve the originating resource/revision without exposing credentials or inaccessible resource metadata;
- deletion reconciliation verifies primary index, replicas, caches, and derived summaries according to the deletion ledger.

### 24.24 Privileged Session / Dual-Control / Advisory Observability

Security/operations telemetry SHALL expose, with strict role gating:
- pending/expired dual-control proposals and approval latency;
- privileged-session step-up failures without exposing credential material;
- permission/role drift conflicts that rejected stale admin mutations;
- supply-chain advisory matches, affected revision count, quarantine/override state, and revocation generation;
- external-erasure obligations and unresolved provider-side deletion outcomes;
- scheduled automations paused by policy/consent/account/schema drift.

These are operational/security events, not high-cardinality metric labels. Detailed actor/target identifiers belong in scoped audit/trace stores.



### 24.25 High-Volume Operational Data, Partitioning, and Query Safety

Tables such as activity/audit events, control events, attempt lineage, discovery snapshots, task/progress events, security findings, and reconciliation history can grow far faster than control-plane configuration.

The production data design SHALL define, per high-volume dataset:
- authoritative retention duration and legal-hold behavior;
- partition/shard key and archival strategy where database technology requires it;
- bounded indexed columns and query patterns;
- maximum interactive query window/result size;
- cursor-based pagination for operator UI/API;
- asynchronous export path for large investigations instead of unbounded synchronous queries;
- deletion/tombstone semantics that preserve required audit evidence without keeping executable authorization.

Maintenance operations (partition rollover, archival, vacuum/compaction, index rebuild) MUST NOT block security-critical revocation/dispatch transactions for an unbounded period.


### 24.26 Credential-Lease, Transport-Pool, Automation-Guard, and Capacity Observability

Operational telemetry SHOULD include bounded metrics/events for:
- credential lease mint success/failure/expiry and reusable-secret fallback;
- pool/socket saturation and isolation failures;
- automation trigger overlap outcomes;
- runtime resource claim wait/expiry/reconciliation;
- approval concurrent-resolution/stale-display rejections;
- request-ID collision/parser rejection count.

These dimensions follow the existing telemetry-cardinality/privacy budget; raw principal IDs, URLs, arguments, tokens, and resource names are not metric labels.


### 24.27 Model Projection, Transport Profile, Automation Ownership, and Local Runtime Observability

Add bounded telemetry/evidence for:
- model-facing capability count and total schema/description token/byte budget;
- schema translation class (`LOSSLESS`, `SERVER_VALIDATED_LOSSY`, `UNSUPPORTED`) and generic-gateway fallback count;
- alias collision/disambiguation count without emitting untrusted raw names as metric labels;
- transport-profile generation, connection-pool eviction after profile rotation, trust/proxy/mTLS mode, and safe connection-test outcome;
- Runner staged-install failure class, lifecycle-script privilege escalation request, local endpoint handshake failure, and port/process identity mismatch;
- automation owner/orphan/transfer/pause events and execution-principal changes;
- circuit/throttle scope dimension and starvation/queue-age SLI;
- approval snapshots containing unknown server-applied material defaults as a review signal.

Metrics use bounded enums/hashed references rather than raw header names, external account labels, arguments, schemas, or provider error payloads.


### 24.28 Result-Contract / Subscription / Projection / Usage Observability

Metrics/traces SHALL cover, with bounded cardinality:
- runtime output-schema validation success/failure by revision/tool class;
- output-drift review state;
- subscription open/ack latency, active lifetime, reconnect count, duplicate-notification suppression, notification-rate budget violations, and authoritative re-list duration;
- audience-projection allow/redact/block counts by projection class and policy reason;
- signed/external reference fetch origin changes, expiry failures, quarantine/scan outcome, and bytes downloaded;
- policy simulation duration/sample completeness and current-vs-candidate decision deltas;
- provider usage reconciliation lag, unresolved estimated-vs-actual cost, duplicate usage events, credits/refunds, and reconciliation failures.

Raw task IDs, URLs containing credentials/signatures, user content, raw arguments/results, and secret-bearing transport values MUST NOT become metric labels.


### 24.29 Annotation Trust, Sender-Constraint, Revocation, RAG-Trust, and Model-Projection Observability

Trace/audit fields SHOULD include where applicable:
- upstream annotation set hash and effective SmartAIHub risk source;
- sender-constraint type/generation (never private key/proof secret);
- in-flight revocation requested/observed epoch, cancellation outcome, and late-result disposition;
- RAG source trust class + instruction-isolation mode + lineage ID;
- cognitive model/provider projection generation and failover lineage;
- supply-chain evidence verification generation / SBOM digest.

Metrics remain bounded-cardinality: raw tool names, user IDs, resource URIs, task handles, SBOM component names, approval arguments, and URLs MUST NOT become unbounded metric labels.



### 24.30 Wire / Extension / Secure-Input / Deprecation Observability

Metrics and audit dimensions SHALL cover:
- configured vs verified wire revision by runtime/adapter;
- stale/failed conformance attestations;
- runtime feature-attestation failures;
- extension lifecycle/maturity and incompatible-tool counts;
- task-support contract violations;
- subscription signals received vs authoritative refresh success/failure/coalescing;
- secure-MRTR classification counts without field values;
- opaque-state-handle expiry/revocation/use failures without raw handles;
- deprecated protocol feature dependency count and migration deadline breaches.

Do not place raw state handles, MRTR answers, tool arguments, account identifiers or high-cardinality capability names directly into unbounded metric labels.



### 24.31 Cross-Spec Trace / Correlation Contract

The following identifiers SHALL propagate across Spec 199 and Spec 200 when applicable:

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
mcp_request_id
upstream_task_id
artifact_id
```

One user request must be reconstructable from LangGraph → delegated/default cognitive executor → Capability Gateway → Spec 199 MCP Gateway → Runner/upstream → artifact/result. Audit storage may use domain-specific child events, but there is one correlation model and one authoritative execution intent lineage.


## 25. Failure Handling


### 25.1 Normalized Error Taxonomy

All surfaces (REST/UI/Chat/Runner bridge) SHALL normalize MCP failures to stable SmartAIHub error categories while retaining safe upstream details under trace/audit.

Minimum categories include:

```text
MCP_UNAVAILABLE
MCP_AUTH_REQUIRED
MCP_PERMISSION_DENIED
MCP_MANAGEMENT_FORBIDDEN
MCP_TOOL_QUARANTINED
MCP_TOOL_CHANGED
MCP_CONNECTION_SELECTION_REQUIRED
MCP_RATE_LIMITED
MCP_BUDGET_EXCEEDED
MCP_DEADLINE_EXCEEDED
MCP_PROTOCOL_ERROR
MCP_PROTOCOL_UNSUPPORTED
MCP_PROTOCOL_DOWNGRADE_REVIEW
MCP_RUNNER_OFFLINE
MCP_FENCING_STALE
MCP_REVISION_DRIFT
MCP_CONTROL_PLANE_STALE
MCP_DEPENDENCY_NOT_READY
MCP_RECONCILIATION_REQUIRED
MCP_REGION_POLICY_BLOCKED
MCP_AUDIT_INTEGRITY_ERROR
MCP_UNKNOWN_OUTCOME
MCP_EXECUTION_FAILED
MCP_INVALID_STATE_TRANSITION
MCP_RETRY_BUDGET_EXHAUSTED
MCP_POLICY_CONFLICT
MCP_UNKNOWN_SECURITY_SEMANTICS
MCP_WRITE_AUTHORITY_UNAVAILABLE
MCP_MIGRATION_BARRIER_BLOCKED
MCP_EVIDENCE_EXPORT_INCOMPLETE
MCP_CREDENTIAL_LEASE_EXPIRED
MCP_AUTOMATION_OVERLAP
MCP_RESOURCE_CAPACITY_UNAVAILABLE
MCP_APPROVAL_ALREADY_RESOLVED
MCP_REQUEST_ID_COLLISION
```

Rules:
- HTTP status, retryability, user-safe message, admin diagnostic hint, and whether re-auth/confirmation is possible SHALL be defined per category;
- raw upstream error strings are diagnostic data, not user-facing truth, and are sanitized/redacted before storage/display;
- retries are driven by typed retryability/idempotency policy, not string matching;
- Chat and UI use the same normalized category to avoid contradictory states.

### 25.2 Orphan and Leak Reconciliation

A periodic reconciliation service SHALL detect lifecycle objects that survive crashes, disconnects, partial deployments, or lost callbacks. Candidates include:
- remote MCP Tasks with no active owner/job correlation;
- stale `subscriptions/listen` records/listeners;
- expired MRTR/pending-input state;
- abandoned OAuth transactions/refresh leases;
- expired quota reservations;
- Runner MCP child processes whose desired state is stopped/removed;
- temporary downloaded/scanned artifacts;
- stale execution leases;
- decommission cleanup items and unresolved UNKNOWN_OUTCOME records.

Rules:
- reconciliation itself uses a lease/fencing/idempotency contract so two sweepers cannot perform conflicting cleanup;
- cleanup is scope/tenant aware and never infers ownership from display name;
- uncertain side-effect state moves to manual reconciliation rather than destructive guessing;
- every cleanup class has TTL, maximum retry/backoff, and audit evidence;
- repeated cleanup failure creates an operator-visible reconciliation item/alert instead of leaking indefinitely.

### Upstream offline
- mark DEGRADED/OFFLINE
- remove from candidate resolution unless explicitly requested
- show actionable status

### Auth expired
- mark AUTH_REQUIRED
- prevent execution
- provide reconnect path

### Tool schema changed
- block changed tool if policy requires
- mark REVIEW_REQUIRED

### Runner offline
- no local MCP execution
- preserve queued durable jobs where applicable
- avoid routing new interactive calls to unavailable Runner

### Partial response / protocol error
- normalize to SmartAIHub error contract
- include trace ID
- do not leak upstream secret/error payloads

---


### Protocol/header mismatch
- reject request before forwarding;
- record expected vs observed protocol metadata without sensitive body logging;
- return `MCP_PROTOCOL_ERROR`.

### Unknown outcome after write timeout
- do not blindly retry non-idempotent writes;
- mark call `UNKNOWN_OUTCOME`;
- offer status/reconciliation check when the upstream exposes one;
- surface a clear warning to user/operator.

### MRTR input expiry / loop
- expire pending input after configured TTL;
- cancel or fail associated execution cleanly;
- abort after maximum rounds/loop detection;
- preserve audit reason.

### Upstream task orphaned
- mark SmartAIHub job DEGRADED/UNKNOWN according to last known state;
- retry status polling with backoff within lifetime;
- do not create a duplicate upstream task without retry-safety proof.

### Registry/package compromise
- Platform Admin can emergency-disable publisher/package/server across affected tenants;
- invalidate capability caches immediately;
- optionally stop Runner processes using affected package;
- preserve forensic audit metadata.

### Stale/replayed execution approval
- reject before forwarding;
- return `APPROVAL_STALE` or `APPROVAL_ALREADY_CONSUMED`;
- show a fresh review card if the action is still requested.

### Subscription listener lost
- mark listener reconnecting without marking the whole MCP server offline;
- re-establish with backoff;
- refresh authoritative lists/resources after reconnect where missed events could matter.

### Circuit breaker open / rate limited
- do not continue filling a doomed upstream queue;
- return retry metadata when known;
- keep unrelated upstreams/tools routable.

### Runtime revision drift
- prevent newly drifted/unapproved revision from inheriting approvals for another digest/schema;
- mark Runner/service `DRIFTED` or `BLOCKED_REVISION`;
- reconcile to desired revision or require review.

### Partial multi-step side effects
- preserve completed step facts;
- return `PARTIAL_SUCCESS`/`FAILED_AFTER_SIDE_EFFECT` as applicable;
- never claim rollback unless an explicit compensation completed.


### Multiple eligible connections / account revoked
- if no deterministic connection can be selected, return `CONNECTION_SELECTION_REQUIRED` before tool dispatch;
- if a pinned/default connection is revoked or loses scope, return `AUTH_REQUIRED`/`CONNECTION_UNAVAILABLE` rather than silently switching to another account;
- re-selection invalidates any execution approval bound to the old connection.

### Catalog pagination loop / oversized discovery
- abort the refresh at configured bounds;
- mark new generation incomplete/truncated;
- retain the previous complete catalog for discovery while health/diagnostics shows stale/incomplete state;
- never delete capabilities merely because an abusive/incomplete refresh returned fewer pages.

### External cost/budget exhausted
- reject before paid dispatch when hard budget is known exhausted;
- return a billing-owner-specific normalized error;
- do not translate external budget exhaustion into SmartAIHub credit exhaustion.



### Control-plane projection lag / poison event
- canonical database remains authoritative;
- affected side-effecting dispatch performs authoritative validation or pauses if current generation cannot be proven;
- consumer retries with backoff; poison event becomes operator-visible after bounded attempts;
- do not delete/skip the event merely to make backlog metrics green;
- projection rebuild/reconcile is available from canonical state.

### Excessive clock drift
- mark affected gateway/Runner degraded for time-sensitive authorization/approval operations;
- do not “fix” token expiry by widening skew indefinitely;
- surface operator guidance to restore time synchronization.

### Residency-compliant region unavailable
- do not silently fail over to a prohibited region;
- queue only when deadline/job semantics permit and policy allows;
- otherwise fail closed with normalized region-policy availability error.

### Audit integrity verification failure
- stop privileged/security-sensitive mutation paths according to deployment policy;
- preserve raw evidence for investigation;
- alert operators; never rewrite the chain/history to hide the break.

### Emergency containment active
- return `MCP_EMERGENCY_BLOCKED` (or mapped typed category);
- do not retry until containment generation changes;
- queued side effects remain blocked and visible to operators.

### Decommission/revocation partially complete
- integration remains non-dispatchable;
- expose unresolved provider revocation/task cleanup explicitly;
- retries are idempotent and never reactivate the integration as a side effect.

### Payload/decompression budget exceeded
- abort bounded processing;
- classify as policy/security/resource-limit failure, not a successful truncated result;
- preserve only safe metadata needed for diagnostics.

### Drain interrupted / forced shutdown
- durable state remains recoverable;
- ambiguous non-idempotent execution becomes `UNKNOWN_OUTCOME` and requires reconciliation before retry.


### 25.3 Resume Stale / Delegation / Artifact Failure Handling

Additional normalized failure behavior:

```text
MCP_DELEGATION_INVALID
MCP_SERVICE_PRINCIPAL_SCOPE_DENIED
MCP_RESUME_REVALIDATION_REQUIRED
MCP_RUNNER_TRUST_STALE
MCP_ARTIFACT_QUARANTINED
MCP_ARTIFACT_SCAN_FAILED
MCP_POSTCONDITION_UNVERIFIED
MCP_PROJECTION_PROPAGATING
MCP_RETENTION_HOLD_ACTIVE
MCP_TLS_IDENTITY_ERROR
```

Rules:
- stale resume never maps to generic success/failure when user action can repair it;
- delegation failures do not silently fall back to a more privileged shared credential;
- TLS/server-authentication failure is not retried by disabling validation;
- quarantined artifact remains non-indexable/non-active-renderable;
- projection propagation state is distinguishable from canonical mutation failure;
- retention hold never leaves execution permission active.

### 25.4 Side-Effect Postcondition Reconciliation

For high-impact/ambiguous writes where the provider supports status/resource lookup:
1. preserve the original `execution_intent_id` and request fingerprint;
2. query provider status/postcondition without replaying the write;
3. bind discovered external resource/operation identity to `mcp_effect_receipts`;
4. classify `CONFIRMED`, `PARTIAL`, `UNKNOWN`, or `NOT_VERIFIABLE`;
5. only expose retry/compensation options allowed by idempotency and policy.

A verification read that fails does not prove the original write failed.
### 25.5 Additional Mature-System Failure States

Normalize at least:
```text
MCP_CATALOG_BUDGET_EXCEEDED
MCP_DEPENDENCY_UNSATISFIED
MCP_DEPENDENCY_CYCLE
MCP_AUTOMATION_DRIFT_REVIEW_REQUIRED
MCP_AUTH_SCOPE_DRIFT
MCP_PRIVILEGED_SESSION_STALE
MCP_SECOND_APPROVAL_REQUIRED
MCP_EXTERNAL_ERASURE_UNVERIFIED
MCP_SUPPLY_CHAIN_ADVISORY_BLOCKED
MCP_RAG_LINEAGE_STALE
MCP_MODEL_SCHEMA_UNSUPPORTED
MCP_MODEL_SCHEMA_TRANSLATION_UNSAFE
MCP_TRANSPORT_PROFILE_INVALID
MCP_LOCAL_ENDPOINT_IDENTITY_MISMATCH
MCP_AUTOMATION_OWNER_ORPHANED
MCP_EFFECTIVE_ARGUMENTS_UNCERTAIN
MCP_THROTTLE_SCOPE_UNAVAILABLE
```

These errors SHALL carry safe machine-readable remediation metadata where possible. UI must not translate a policy/security failure into a generic transient retry loop.



### 25.6 Additional v16 Security / Boundary Failure States

Normalize at least:

```text
MCP_TOOL_ANNOTATION_UNTRUSTED
MCP_SENDER_CONSTRAINT_REQUIRED
MCP_SENDER_CONSTRAINT_FAILED
MCP_BROWSER_ORIGIN_REJECTED
MCP_SUPPLY_CHAIN_EVIDENCE_INVALID
MCP_CONTENT_TYPE_MISMATCH
MCP_RAG_TRUST_POLICY_BLOCKED
MCP_INFLIGHT_REVOKED
MCP_LATE_RESULT_DISCARDED
MCP_MODEL_PROJECTION_INCOMPATIBLE
MCP_SECURITY_COPY_FALLBACK
```

Retry semantics:
- browser-origin, RAG-trust, supply-chain, annotation/risk, and sender-constraint policy failures are not automatically retried with weaker settings;
- `MCP_INFLIGHT_REVOKED` remains terminal for orchestration side effects, while effect reconciliation may continue internally;
- model projection incompatibility may trigger governed cognitive failover but MUST NOT redispatch an already ambiguous MCP side effect.



### 25.7 Additional v17 Protocol / Extension / Input Failure States

Add normalized categories:

```text
MCP_WIRE_REVISION_MISMATCH
MCP_RUNTIME_FEATURE_UNVERIFIED
MCP_EXTENSION_NOT_APPROVED
MCP_EXTENSION_INCOMPATIBLE
MCP_TASK_SUPPORT_MISMATCH
MCP_SUBSCRIPTION_NOT_ACKNOWLEDGED
MCP_SECURE_INPUT_REQUIRED
MCP_CAPABILITY_ADVERTISEMENT_INVALID
MCP_STATE_HANDLE_STALE
MCP_STATE_HANDLE_SCOPE_MISMATCH
MCP_PROTOCOL_FEATURE_DEPRECATED
MCP_PROTOCOL_FEATURE_REMOVED
```

Retry/user-action semantics:
- wire revision/runtime feature failures are non-retryable until adapter/configuration changes or attestation succeeds;
- extension/task-support incompatibility is non-retryable for the current runtime profile;
- subscription acknowledgement failure closes the listener and falls back to bounded authoritative refresh/reconnect policy;
- secure input required is user-actionable only through an approved protected flow;
- stale/scope-mismatched state handles never trigger automatic side-effect replay;
- removed protocol features are blocked, while deprecated features follow the explicit compatibility exception/migration policy.


## 26. Migration Strategy

### Phase 1 — Data & abstraction
- add MCP server/connection/tool models
- add immutable server revision/runtime identity and installation pinning
- add Capability Registry mapping
- add gateway interfaces
- no behavioral replacement yet

### Phase 2 — Protocol compatibility, discovery & health
- implement explicit MCP protocol adapters with `2026-07-28` stateless path as primary target
- support remote MCP discovery and capability/extension negotiation
- add modern request `_meta` envelope/header validation and `subscriptions/listen` freshness path
- normalize Tools, Resources, Prompts, and approved Extensions
- health checks and cache-aware catalog refresh
- schema/content hashing

### Phase 3 — Security & authorization
- quarantine
- approvals
- risk classification
- OAuth/CIMD/issuer/resource hardening
- add execution-bound approval receipts and refresh single-flight/token generations
- SSRF/egress controls
- provenance/security scanner integration
- audit

### Phase 4 — Capability Resolver integration
- lazy tool/capability search
- permission-aware discovery
- reduced tool exposure to Agents SDK
- preflight readiness contract
- resource/prompt governance integration

### Phase 5 — Durable interaction & Runner MCP
- MRTR/input-required pause/resume
- Tasks extension -> worker_jobs mapping
- local stdio/localhost management
- sidecar option
- reproducible install/update/rollback

### Phase 6 — UI/UX
- role-separated MCP Center / Connected Apps
- resources/prompts/extensions views
- approvals/scanner findings
- MRTR and long-running task cards
- health/activity/Runner view
- managed authorization and billing-owner labels

### Phase 7 — Hardening & recovery
- DLP
- concurrency/rate/quota controls
- idempotency and UNKNOWN_OUTCOME reconciliation
- chaos testing
- schema drift tests
- failover/backoff/circuit-breaker/fairness
- backup/restore drill
- retention/privacy validation

---


### 26.1 Zero-Downtime Schema/API Migration and Version Skew

Production rollout SHALL use expand/migrate/contract discipline for database/API changes that are consumed by multiple gateway/worker/Runner versions.

Requirements:
- additive schema first; old and new binaries can coexist during the documented rollout window;
- backfills are restartable, bounded, observable, and do not hold long blocking locks on hot tables;
- destructive column/contract removal occurs only after compatibility telemetry proves old readers/writers are gone;
- gateway, worker, Runner, sidecar, and protocol-adapter version compatibility matrix is documented;
- rollback does not require interpreting data already written in a format the old version cannot safely understand;
- feature flags/canary deployment gate new protocol/extension behavior separately from schema deployment;
- migrations include tenant-isolation and index/constraint verification.


### 26.2 Capability Deprecation, Consumer Pinning, and Retirement

MCP capability/revision lifecycle SHALL support:

```text
ACTIVE -> DEPRECATED -> RETIRING -> RETIRED
```

Rules:
- deprecated capability remains executable only according to policy but cannot receive new bindings by default;
- workflows/agents MAY pin an immutable approved revision for reproducibility within an allowed support window;
- retirement performs dependency impact analysis before enforcement;
- replacement mapping is advisory unless compatibility is verified;
- automatic migration MUST compare schemas, risk classification, auth scopes, execution location, billing owner, and semantic contract tests;
- scheduled/queued work that references a retired revision fails with a typed actionable error rather than silently moving to a newer revision;
- historical executions continue to resolve the original revision/provenance metadata for audit.

### 26.3 Compensation Idempotency and Forward-Recovery Contract

Compensation is itself a side effect and SHALL NOT be treated as an implicit rollback.

For every registered compensating action:
- define an idempotency strategy and execution-intent identity;
- declare what original outcome states are eligible for compensation;
- revalidate current authorization/risk/connection before compensating;
- record whether compensation fully reversed, partially mitigated, or failed;
- do not retry ambiguous compensation blindly;
- prefer forward recovery when an upstream operation is irreversible or compensation is unsafe.

The UI/audit trail MUST distinguish `original side effect`, `compensation attempt`, and `final business state`.


### 26.4 Internal Schema/Event Evolution Contract

MCP protocol evolution and SmartAIHub internal contract evolution are separate axes. Gateway API payloads, control events, Runner advertisements, audit snapshots, and capability descriptors SHALL use explicit internal schema versions.

Deployment rules:
- use additive/optional fields first during expand phase;
- do not require a newly added field until all active readers understand the contract generation;
- consumers reject semantic versions they cannot safely interpret instead of silently dropping required security fields;
- event upcasters/adapters are deterministic and tested against historical fixtures;
- old binaries within the documented rollback window can still read canonical rows/events emitted by the new release;
- destructive contract cleanup occurs only after telemetry proves old producers/consumers are gone;
- a rollback never rewrites historical event meaning.


### 26.5 Projection-Convergence and Approval Rollout Contract

Approval/rejection/disable actions SHALL commit canonical state and the corresponding control event in one transaction. Search/index availability is a projection of that decision.

Rollout rules:
- approval success returns the canonical generation immediately;
- index consumers process the approval event directly; they MUST NOT require an unrelated new `tools/list` discovery to make the approved snapshot searchable;
- reject/disable/revoke becomes non-executable immediately through authoritative dispatch validation even when projection removal lags;
- Admin read-after-write views may merge canonical state with projection status so the operator sees the committed decision truthfully;
- rollback/replay of projection consumers is generation/idempotency safe.

### 26.6 Trust/Retention Schema Evolution

Migrations adding delegated-principal, artifact-lineage, retention-hold, Runner-trust, or effect-receipt metadata MUST follow expand/migrate/contract rules. Old binaries within the supported rollback window must not misinterpret missing new security fields as permissive defaults.

### 26.7 Rollback Guarantees and Irreversible-Migration Barrier

Every rollout phase SHALL classify migrations/config changes as `ROLLBACK_SAFE`, `FORWARD_ONLY`, or `REQUIRES_DUAL_WRITE_WINDOW` before deployment.

Rules:
- rollback-safe migrations maintain backward-readable data for the declared mixed-version window;
- forward-only migrations require a tested forward-recovery plan and an explicit operator gate before crossing the irreversible barrier;
- destructive schema cleanup occurs only after telemetry proves old binaries/consumers are gone and backup/restore compatibility is verified;
- policy/schema/event versions needed by rollback candidates remain available through the rollback window;
- Runner/sidecar downgrade is blocked if the currently pinned server revision or internal contract cannot be understood safely;
- canary abort criteria are defined before rollout and include security, projection lag, auth failure, effect ambiguity, and error-rate signals;
- rollback itself is audited as a privileged lifecycle action and cannot silently reactivate revoked/retired capability versions.
### 26.8 Migration / Backfill for Dependency, RAG-Lineage, and Advisory State

When introducing v12 structures into an existing deployment:
- backfill capability dependency edges from Plugin/Agent/Workflow/Automation manifests without inventing dependencies that cannot be proven;
- unresolved legacy references are marked `NEEDS_REVIEW`, not silently bound by display-name similarity;
- existing MCP-derived RAG documents are either lineage-backfilled from trustworthy provenance or quarantined from broad retrieval until reconciled;
- current installed revisions receive an initial advisory/provenance scan generation;
- discovery budgets default to the secure Platform profile and rollout reports installations whose current catalogs exceed the new limit;
- scheduled automations run preflight before their first post-migration occurrence;
- enabling dual-control is staged so already-authorized emergency recovery is not deadlocked accidentally.

Backfills are restartable/idempotent and produce an operator report of unresolved records.



### 26.9 Portable Configuration, Environment Remapping, and Restore Boundary

Portable MCP configuration is configuration evidence, not a credential backup and not an authorization grant.

Migration/import requirements:
- export format is versioned and includes source environment/spec revision plus canonical manifest hash;
- environment-specific IDs/endpoints/Runner bindings/credential references are explicit placeholders requiring remap or validation;
- secret material is never embedded in ordinary portable manifests;
- import is `validate -> preview -> apply`, using the same lifecycle/policy/dual-control gates as native configuration;
- import cannot bypass current registry/publisher trust, security advisories, protocol floor, residency, or quarantine;
- unknown fields follow forward-compatibility policy and security-relevant unknown semantics fail closed;
- import writes normal control-plane events/outbox records so indexes/Runners/projections converge through the standard path;
- rollback/removal of a partially imported configuration uses normal tombstone/decommission semantics rather than deleting audit history.


### 26.10 Cross-Spec Alignment Migration / No-Parallel-Stack Gate

Before enabling Spec 200 External Agent → SmartAIHub capabilities in production:
1. backfill/verify shared Capability Registry types and remove any prototype Skill-only/Agent-only registry path;
2. verify Runner uses one device identity/control channel and one Execution Node Registry snapshot for MCP + agent runtimes;
3. map any prototype agent task durability into `worker_jobs`/`worker_job_events` rather than preserving a second job truth;
4. route Spec 200 retrieval through the shared Retrieval Broker and preserve Spec 199 lineage for MCP-derived content;
5. route External Agent MCP invocation through `SAH-CAP-1` → Spec 199, never direct upstream;
6. converge approvals/audit/trace/retry/lease/fencing onto shared contracts;
7. run mixed-version compatibility tests for `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, `SAH-ASSET-1`;
8. remove or disable prototype parallel control paths before general availability.


## 27. Testing Requirements

### Unit
- schema hashing
- permission evaluation
- risk classification
- credential resolution
- DLP rules
- capability filtering

### Integration
- remote MCP HTTP
- OAuth MCP
- local stdio MCP
- Runner MCP
- schema change quarantine
- unavailable upstream
- expired credential

### Security
- tenant isolation
- cross-user credential denial
- unauthorized discovery
- unauthorized execution
- destructive confirmation
- secret leakage prevention

### Orchestration
- direct SQL without LLM
- direct MCP without LLM
- cognitive MCP selection
- Skill + MCP mixed plan
- Runner MCP long-running job

### Regression
- Universal AI Assistant Launcher still uses same orchestration runtime
- Help RAG remains unchanged
- existing Skills/Agents continue to resolve
- worker_jobs ownership unchanged

### Role / Scope
- Platform Admin can manage global catalog/policy
- Tenant Admin cannot access other tenant data
- End User cannot access tenant/platform infrastructure controls
- User can restrict but cannot elevate own permissions
- Agent receives only effective allowed tools
- Runner availability does not bypass authorization
- personal MCP obeys tenant/platform mode

### UI / UX
- all defined routes render role-appropriate navigation
- no ordinary-user page exposes raw secrets
- empty/loading/error/degraded states are implemented
- permission matrix preview matches backend effective-policy result
- schema diff review supports approve/reject/restricted approval
- chat approval card correctly handles ALLOW/ASK/BLOCK
- reconnect flow returns to originating chat/settings context
- mobile/tablet layouts support user connection and approval flows
- keyboard navigation/accessibility checks pass for dialogs and forms

---


### Protocol Compatibility
- MCP `2026-07-28` stateless request works without initialize/session state.
- legacy session adapter remains isolated and functions only for approved legacy server.
- `Mcp-Method` / `Mcp-Name` mismatch is rejected.
- protocol downgrade/unsupported version produces normalized error.
- cache `ttlMs` / scope does not cross permission boundaries.

### Primitives / Extensions
- resource discovery/read respects ACL and MIME/size limits.
- managed RAG indexing preserves provenance and deletion behavior.
- upstream prompt is treated as untrusted and cannot override system policy.
- unknown extension is blocked by default.
- Tasks extension maps to worker_jobs without duplicate truth.

### MRTR
- input-required card resumes the original operation.
- cancellation does not resume the operation.
- requestState replay from another tenant/user is rejected.
- max-round loop protection works.
- page reload preserves durable WAITING_FOR_INPUT state.

### OAuth Hardening
- issuer mismatch is rejected.
- callback state and PKCE verifier are single-use.
- resource indicator is bound to intended MCP resource.
- step-up scope challenge requests only required additional scope.
- refresh failure appears as degraded health before expiry.
- credential for issuer A cannot be reused for issuer B.

### Network / Supply Chain
- server gateway blocks loopback/private/link-local endpoints by default.
- redirect to blocked destination is rejected.
- DNS rebinding simulation is rejected.
- stdio launch does not invoke untrusted shell expansion.
- environment allowlist prevents unrelated secrets reaching child MCP.
- package upgrade with changed digest/tool schema returns to review.
- scanner result ingestion normalizes findings and never auto-labels package safe.

### Reliability / Idempotency
- safe read retries after transient failure.
- non-idempotent timeout becomes UNKNOWN_OUTCOME and is not automatically duplicated.
- upstream task cancellation cannot later resurrect cancelled worker_job.
- preflight catches auth/quarantine/Runner issues without business side effects.
- gateway restart during long-running task reconstructs state from DB/worker_jobs.

### Approval Binding / TOCTOU
- changing a WRITE argument after approval forces a new approval.
- approval for revision/schema A cannot execute revision/schema B.
- two concurrent consume attempts for one-time approval yield exactly one winner.
- expired/revoked approval fails before upstream dispatch.

### Subscriptions / Freshness
- modern `subscriptions/listen` invalidates tool/prompt/resource cache generations correctly.
- listener reconnect does not assume `Last-Event-ID` replay and performs required authoritative refresh.
- notification on gateway instance A invalidates cache seen by gateway instance B.
- request-scoped progress is not mistaken for subscription notification.

### Runtime Revisions / Rollout
- two Runner versions of the same MCP package retain distinct revision catalogs.
- canary revision can be rolled back without rewriting historical executions.
- mutable package tag resolves to immutable digest before approval.
- drifted Runner cannot inherit approval from the expected revision.

### Output / MCP Apps Security
- malicious tool output cannot promote itself to system/developer instruction.
- unsafe HTML/SVG is sanitized.
- archive traversal/decompression-bomb limits work.
- enabled MCP App cannot access parent cookies/tokens or invoke tools outside its granted bridge/policy.

### Circuit Breaker / Fairness / Partial Success
- repeated upstream transport failures open only that upstream revision's circuit.
- half-open probe recovery closes the circuit.
- one tenant cannot starve configured fair-share capacity for another tenant.
- queued side-effecting call revalidates approval/schema/policy before dispatch.
- multi-step partial success reports completed side effects accurately.
- compensation executes only through explicitly registered/policy-approved capability.


### Multi-Account / Installation Isolation
- same user can connect different accounts to the same platform MCP definition in two tenants without collision.
- tenant A default connection is never selected in tenant B.
- two eligible accounts without a scoped default produce `CONNECTION_SELECTION_REQUIRED`.
- revoking pinned account does not silently fall back to another account.
- changing connection after approval invalidates the approval receipt.
- connection/activity/audit rows retain explicit installation and tenant context.

### Protocol Result / Schema Complexity
- modern ordinary result without valid expected `resultType` is handled according to protocol adapter policy and never mistaken for an MRTR/task result.
- legacy result without `resultType` normalizes to `complete`.
- unknown future result discriminator does not silently execute unsupported extension behavior.
- recursive/explosive JSON Schema `$ref`/composition inputs terminate within configured resolution limits.
- remote schema `$ref` is blocked by default and follows SSRF controls if explicitly enabled.

### Pagination / Parser / Cost Guardrails
- repeating `nextCursor` terminates bounded discovery and retains previous complete generation.
- excessive catalog pages/items/bytes are rejected without gateway memory exhaustion.
- modern acknowledged subscription filter narrower than requested is honored correctly.
- oversized/deep JSON, schema, SSE event and archive payloads hit configured limits.
- `Mcp-Param-*` values are absent/redacted in access/application logs.
- argument-sensitive risk upgrade invalidates stale low-risk approval.
- external hard budget blocks dispatch before cost is incurred when budget state is authoritative.
- unknown cost is never displayed or metered as zero cost.



### Identity / Canonicalization / Discovery Integrity
- two servers with identical tool display names remain distinct canonical capabilities.
- Unicode-confusable/bidi names are flagged/disambiguated and cannot alias an approved capability.
- encoded/alternate IP and URI forms cannot bypass endpoint policy.
- Runner symlink/junction path escape attempts are rejected after canonicalization.
- keyword-stuffed malicious tool descriptions do not dominate top-K solely through repeated terms.

### Control Plane / Audit / Management Safety
- DB mutation + control event commit atomically; projection consumer retry is idempotent.
- a deliberately failed projection consumer produces visible lag/DLQ state and can rebuild from canonical state.
- Agent identity receives 403/denial for MCP management mutations even if it can execute ordinary capabilities.
- duplicate HTTP retry with same management idempotency key creates one logical installation/approval.
- stale optimistic-concurrency write returns conflict and does not overwrite newer policy.
- break-glass action requires elevated workflow and creates immutable audit evidence.

### Time / Region / Upgrade Safety
- OAuth/approval expiry behaves correctly within configured clock skew and fails safely outside it.
- restored deployment cannot silently activate environment-bound credentials from another environment.
- credential rotation invalidates dependent caches/in-flight generation according to policy.
- data-residency policy blocks noncompliant regional failover/egress.
- mixed old/new gateway/worker/Runner versions pass the documented rollout compatibility matrix.
- DB backfill/migration can resume after interruption without duplicate/corrupt state.

### Deadline / Consistency
- queue/retry/upstream attempts consume one end-to-end deadline rather than resetting indefinite timeouts.
- normalized error category is consistent across REST, Chat, and Runner surfaces.
- revocation/block immediately prevents WRITE/DESTRUCTIVE dispatch even if search index is stale.
- committed control events are never silently lost; observable projection lag stays within configured SLO or alerts.

### OAuth / Confused-Deputy / Transaction Integrity
- OAuth callback with wrong/replayed `state` is rejected.
- authorization code replay is rejected and not logged.
- token for MCP resource A cannot be used against MCP resource B.
- token passthrough to a downstream API is blocked by design/test fixture.
- issuer/resource mismatch fails before business tool execution.

### Lifecycle / Offboarding / Privacy
- installation decommission blocks new dispatch before cleanup completes.
- user offboarding immediately removes future access even when provider revocation is temporarily unavailable.
- reinstall does not reuse old approvals/credentials accidentally.
- privacy deletion removes indexed/temp/pending-input content under policy and reports unresolved external obligations.
- audit retention remains minimal/redacted and does not resurrect executable authorization.

### Payload / Streaming Resource Budgets
- oversized known body is rejected before full buffering.
- chunked/SSE cumulative byte limit terminates safely.
- decompression/archive bomb fixtures are rejected within CPU/memory/time budgets.
- truncated oversized result is never marked successful complete.

### Emergency / Drain / Policy Snapshot
- emergency deny propagates to authoritative dispatch before eventual projections catch up.
- clearing containment does not restore revoked credential/approval automatically.
- rolling drain does not accept new side effects and preserves/marks in-flight outcomes correctly.
- audit can reproduce the historical policy decision using policy-generation/evaluator metadata.
- queued job allowed by old policy is blocked when current policy becomes stricter before dispatch.

### UI Bulk / Dry Run / Consent History
- bulk preview and apply operate on the same generation/target set or return conflict.
- partial bulk failures identify failed items and safe retry subset.
- end user can distinguish reusable approval revocation from external-account disconnect.
- ordinary-user history does not expose tokens, protocol requestState, or secret callback data.

### Protocol Conformance / Golden Vectors
- maintain pinned golden request/response vectors for supported MCP `2026-07-28` methods, `resultType` values, subscriptions, MRTR, and Tasks behavior.
- run contract tests against every supported Tier-1 SDK/runtime combination used in production.
- malformed header/body/meta vectors fail consistently across adapters.
- differential/fuzz tests cover parser limits, JSON Schema references, pagination cursors, and extension negotiation.
- every MCP SDK/protocol upgrade re-runs the conformance corpus before canary promotion.


### Revocation / Replay / Provenance
- stale approval/policy snapshot older than revocation epoch cannot dispatch a side effect in any region.
- the same `execution_intent_id` retried concurrently in two regions yields at most one upstream side-effect dispatch.
- provenance digest/signature mismatch quarantines or blocks according to policy and cannot inherit prior approval silently.
- provenance status `UNKNOWN` is never rendered or evaluated as cryptographically verified.

### Restore / Disaster-Recovery Safety
- restored environment starts in restore safety mode when required and blocks side effects until reconciliation gates pass.
- restore replays revocation/tombstone state before reopening WRITE/DESTRUCTIVE dispatch.
- stale queue leases, pending approvals, and OAuth transaction state from backup cannot execute after restore.
- UNKNOWN_OUTCOME operations are surfaced for operator reconciliation instead of automatic replay.

### Abuse / Exhaustion / Enumeration
- discovery, OAuth failure, approval spam, malformed protocol, and repeated-denial fixtures trigger configured adaptive controls.
- throttle/error responses do not reveal existence of unauthorized tenant/server/account resources.
- abuse control cannot be bypassed by alternating gateway instances/regions for the same governed identity.

### Lifecycle / Retirement / Compensation
- retiring a capability reports every pinned Agent/workflow/job dependency before enforcement.
- queued work pinned to retired revision does not silently upgrade.
- compatible replacement migration requires explicit verified contract and generation-bound preview.
- compensation retry is idempotent where declared and ambiguous compensation becomes UNKNOWN_OUTCOME rather than duplicated.

### Fault Injection / Invariant Testing
- inject DB commit success + projection consumer outage and prove authoritative dispatch remains safe.
- inject region partition during revocation and prove stale region fails closed for high-risk dispatch.
- inject secret-manager outage, Runner disconnect, and subscription loss independently and in combination.
- property-based tests assert `BLOCK > ASK > ALLOW`, no child privilege elevation, no revoked execution, and at-most-once consumption of one-time approvals/execution intents.


### Lease Fencing / Zombie Execution
- stale Runner fencing token cannot update authoritative job/artifact/result state after takeover.
- partitioned old Runner resuming after lease takeover is rejected and cannot overwrite newer completion.
- remote third-party write with ambiguous timeout follows execution-intent/UNKNOWN_OUTCOME semantics rather than false fencing guarantees.

### Protocol Downgrade / Completion / Cancellation
- SDK automatic fallback cannot bypass configured `minimum_protocol_version`.
- server previously observed on modern protocol cannot silently fall back to legacy high-risk execution.
- `completion/complete` cannot reveal a prompt/resource/template hidden from the caller and suggestion output cannot trigger execution.
- cancellation of a modern in-flight request stops waiting and discards prohibited/late response behavior; possible side effect becomes UNKNOWN_OUTCOME when required.
- late progress cannot reopen terminal execution state.

### Cache Partition / Isolation
- cache identity includes every principal/install/revision/protocol/generation dimension that materially affects visibility or semantics.
- user-private resource/completion content never appears through tenant/platform shared cache.
- credential/policy/revocation generation change makes stale executable cache entries ineligible immediately.

### Quota Reservation / Settlement
- N concurrent platform-funded calls cannot overspend one authoritative budget by read-then-write race.
- released/expired reservations return unused capacity exactly once.
- ambiguous provider billing remains reconcilable and is never automatically treated as zero.

### Orphan Reconciliation
- duplicate reconciliation workers cannot both destructively clean the same item.
- stale task/subscription/MRTR/OAuth/quota/Runner temp-state fixtures converge or enter visible manual-reconcile state.
- sweeper failure does not delete uncertain external side effects.

### Telemetry Cardinality / Privacy
- metrics reject/unset prohibited high-cardinality/sensitive labels.
- mandatory audit evidence remains available when trace sampling is enabled.
- user/tool arguments, completion values, progress text and secret headers do not leak into metrics/baggage.

### Cold-Start Readiness
- gateway with unavailable revocation/policy/execution-ledger dependency serves allowed diagnostics but rejects high-risk dispatch.
- restored dependency readiness reopens dispatch only after current generation checks succeed.

### Internal Contract Evolution
- old/new event consumers pass mixed-version fixtures across the declared rollout window.
- unknown optional field is tolerated; unknown mandatory security semantics fail closed.
- rollback binary can read rows/events produced by canary release within supported rollback window.


### Delegated Identity / Service Principal
- tenant-shared credential execution records requester, Agent/workflow, execution principal, credential owner, and connection distinctly.
- service principal cannot use tools outside both its binding and requesting trigger/user policy.
- missing interactive user in scheduled work never maps to implicit admin/system superuser.
- approval for personal connection cannot be replayed through tenant-shared connection.

### Resume-Time Revalidation
- MRTR/task/job paused before a policy revoke cannot resume a side effect afterward.
- connection scope loss, revision drift, Runner-trust expiry, budget expiry, and capability retirement each produce a structured stale-resume outcome.
- requestState/resume token from a valid old state does not bypass current authorization.

### Effect Receipt / Postcondition
- successful provider-created resource stores stable external identity when available without retaining unnecessary secret body data.
- ambiguous write can reconcile by status/read without replaying the original non-idempotent operation.
- compensation references original effect and has its own execution intent/receipt.

### TLS / Server Authenticity
- invalid hostname/certificate is rejected for HTTPS upstream.
- HTTPS-to-HTTP redirect is blocked outside explicit approved local/development policy.
- custom trust/mTLS policy cannot be supplied or weakened by untrusted MCP metadata.

### Runner Trust Freshness
- Runner remains online but loses privileged-execution eligibility after configured attestation/posture expiry.
- changed Runner binary/digest invalidates privileged trust until revalidated.
- queued privileged local write rechecks trust before dispatch.

### Artifact Intake / RAG Admission
- malicious/polyglot/archive artifact remains quarantined and is not RAG-indexed.
- scanner timeout/error does not silently mark artifact clean.
- derived preview retains lineage and deletion/ACL propagation.
- private artifact hash dedupe never causes cross-tenant visibility.

### Retention Hold / Deletion Precedence
- account/approval/dispatch access is revoked immediately even if content/evidence must be retained under an approved hold.
- restore cannot reactivate authorization from retained evidence.
- UI distinguishes held evidence from executable permission and final deletion state.

### Projection Read-Your-Writes
- approving a quarantined tool makes the approved snapshot eligible for indexing from the committed control event without requiring another upstream discovery pass.
- rejecting/disabling tool blocks dispatch immediately even if search projection is stale.
- Admin sees canonical mutation generation plus propagation state; delayed projection eventually converges or surfaces reconciliation error.

### Security-Anomaly Escalation
- repeated unauthenticated attacker failures cannot permanently lock out a victim account through attacker-controlled identifiers alone.
- scoped anomaly escalation can throttle/quarantine a genuinely abusive connection/revision while leaving unrelated tenant integrations available.
- auto-containment evidence/rule and decay/manual-clear path are auditable.

### Lifecycle State-Machine / Referential Integrity
- illegal/stale entity transitions fail atomically and emit no success projection;
- terminal/quarantine/reconcile states cannot be skipped by retry paths;
- deletion/decommission preserves required audit/effect/provenance tombstones without cross-tenant cascades;
- integrity checker detects dangling/cross-tenant references.

### Retry Ownership / Amplification
- layered transient failures do not multiply retries across SDK/Gateway/worker/Runner;
- end-to-end retry/deadline budget monotonically decreases across hops;
- possible-dispatch WRITE/DESTRUCTIVE failures enter verification/reconciliation rather than automatic replay;
- attempt lineage is reconstructable from trace/audit.

### Policy Composition / Forward Compatibility
- policy monotonicity property tests prove child restrictions cannot elevate authority;
- emergency/platform blocks cannot be bypassed by user approval;
- unknown security-relevant enum/extension semantics fail closed while safe unknown metadata is preserved for evidence;
- protocol upcasters/adapters reproduce canonical historical fixtures deterministically.

### Secret / Regional Authority / Rollback
- KMS key rotation and rewrap can occur without plaintext logging or cross-environment decrypt fallback;
- split-brain/failover tests prove only current regional writer/fencing epoch can mutate control state or dispatch high-risk effects;
- irreversible migration barrier blocks unsafe rollback and tested forward recovery is available;
- incident evidence export is tenant-scoped, secret-redacted, integrity-verifiable, and fully audited.



### v17 Wire / Extension / MRTR / State-Handle Gap Tests

- actual-wire tests prove a runtime configured for `2026-07-28` emits/accepts the expected modern envelope and fails readiness when the SDK remains in an older default wire mode;
- SDK upgrade fixtures invalidate prior wire/feature attestation until conformance reruns;
- tool `taskSupport=forbidden` returning `resultType=task` is rejected as drift; `required` tools are hidden/unavailable when Tasks extension support is not attested;
- no `tasks/list` enumeration path exists and arbitrary task IDs cannot be used to discover another caller's state;
- subscription tests inject dropped, duplicated, reordered and overlapping notifications and prove final catalog/resource state converges by authoritative re-fetch without exactly-once assumptions;
- MRTR secret-field fixtures prove password/API-key/OTP data does not enter model context, ordinary chat history, RAG, logs or analytics;
- per-request capability tests prove unsupported/unneeded extensions are not advertised as a global superset and caller-controlled input cannot add capability claims;
- draft/experimental extension activation requires the pinned extension profile, explicit Platform policy, test evidence and rollback state;
- SDK abstraction tests prove `resultType`, discover cache hints, subscription acknowledgement and required `_meta` semantics remain correct even when the high-level SDK hides wire-only members;
- runtime feature-matrix tests prove unsupported features make an installation/capability unavailable rather than best-effort;
- opaque-state-handle tests prove surrogate substitution, scope binding, expiry/revocation and cross-tenant/account rejection without raw-handle disclosure;
- deprecation inventory tests identify dependencies on legacy HTTP+SSE/Roots/Sampling/protocol Logging and release gates react to internal migration deadlines.


### 27.1 Requirement-to-Test Traceability and Spec-Lint Gate

Because Spec 199 is large and cross-cutting, implementation SHALL maintain a machine-readable or generated traceability map from normative requirement to implementation owner and verification evidence.

Minimum traceability fields:

```text
requirement_id
spec_section
owner_component
api_or_event_contract nullable
data_entity nullable
ui_surface nullable
test_ids[]
security_review_required
release_gate
```

Rules:
- every Acceptance Criterion has at least one automated test or an explicitly documented manual/operational verification step;
- security-critical MUST/MUST NOT statements are assigned stable requirement IDs during implementation planning;
- CI checks for orphan acceptance criteria, duplicate IDs, tests referring to removed requirements, and unsupported protocol-version claims;
- protocol/SDK upgrades regenerate or review affected traceability entries before canary promotion;
- a requirement marked `NOT_IMPLEMENTED` cannot be hidden by a passing unrelated test; release gating reports it explicitly;
- UI/API/data-model changes for the same requirement reference the same requirement ID to reduce drift;
- the generated compliance/implementation report MUST NOT expose secrets or tenant data.

Recommended release artifacts:
- `spec199-requirements.yaml` (or equivalent);
- generated requirement coverage report;
- protocol conformance report;
- security/fault-injection report for critical invariants.

### v11 Additional Security / Consistency Tests

- canonical approval/execution hashes are byte-identical across Python/Go/TypeScript implementations for golden vectors;
- alternate JSON formatting/key order/Unicode display normalization cannot change or bypass one approval binding;
- resource-template arguments cannot escape approved host/path/scheme or inject a secret from completion suggestions;
- two healthy upstream instances serving materially different schemas trigger inconsistency handling instead of silent catalog merge;
- health checks cannot create business objects, delete data, or spend a user's quota unexpectedly;
- publisher ownership/signing-identity transfer blocks automatic upgrade until review policy is satisfied;
- spoofed/duplicate `Mcp-*` and forwarded headers from an untrusted client cannot override Gateway routing/identity;
- data egress manifest blocks a call whose destination/purpose/data category violates tenant policy even when DLP finds no secret;
- default production configuration keeps unknown/risky MCP capabilities quarantined or confirmation-gated without extra admin setup;
- distributed audit timelines preserve generation/epoch order under deliberate clock skew and late event delivery;
- requirement traceability CI fails when an Acceptance Criterion is removed from coverage or a security-critical requirement lacks verification.
### v12 Mature-System Gap Tests

- catalog discovery that exceeds total entry/schema-byte/page budgets terminates deterministically, reports incomplete state, and never deletes previously known entries solely because the refresh was truncated;
- dependency graph rejects execution cycles and incompatible pinned dependencies, and retirement impact enumerates scheduled/queued consumers;
- scheduled automation configured successfully yesterday pauses today if consent, account, policy, schema/risk, dependency, or Runner trust materially drifted;
- revoked/insufficient OAuth scope cannot cause fallback to a different external account credential;
- dual-control rejects self-approval, stale-generation approval, or mutation after proposal hash changes;
- SmartAIHub deletion reports external-provider erasure as unverified until provider evidence exists;
- distributed gateways honor normalized rate limits with jitter/shared admission and do not create a retry herd;
- RAG retrieval blocks source-revoked MCP content immediately via authoritative ACL/generation even if physical vector deletion is delayed;
- a trusted package/revision affected by a later security advisory is impact-mapped and can be quarantined without inheriting stale approval;
- stale privileged UI session/role cannot complete a high-risk mutation after permission/revocation changes.



### v13 Final-Hardening Gap Tests

- secretless/JIT credential tests prove short-lived audience/scope-bound grants never appear in Agent context, job JSON, browser payloads or ordinary logs and revocation blocks new minting;
- transport-pool isolation tests interleave multiple tenants/accounts over one origin and verify no Authorization/cookie/MCP-header/request-context bleed;
- request-ID fuzz tests prove external JSON-RPC IDs cannot collide with trace/execution/idempotency identities or escape their request mapping domain;
- automation overlap tests race triggers across multiple gateway/region instances and prove each configured policy (`ALLOW_CONCURRENT`, `SKIP_IF_RUNNING`, `QUEUE_ONE`, `COALESCE`, `SERIALIZE`);
- approval race tests submit approve/reject/cancel from multiple devices and prove one terminal CAS winner, stale UI refresh, and exact canonical-display/execution binding;
- Runner capacity tests prove exclusive GPU/port/process claims cannot be double-booked and stale claim release is fenced/reconciled;
- browser-security tests verify `no-store`, service-worker exclusion, privileged stale-tab revalidation, and analytics/session-replay redaction;
- high-volume operational-store tests verify cursor pagination, bounded query windows, archival/retention, and that maintenance cannot indefinitely block revocation/dispatch;
- threat-model gate tests/lint require a reviewed boundary/control/test mapping when new transport/extension/credential mode is enabled;
- property/fault tests combine credential expiry, Runner takeover, automation overlap, approval resolution, region failover and retry to prove no stale credential/approval/resource owner gains a new side effect.


### v14 Parser / Isolation / Model-Projection / Runtime-Safety Gap Tests

- strict JSON parser tests reject duplicate keys, malformed Unicode, non-finite numbers, parser-depth bombs and unsafe large-number round trips before canonical security hashing;
- golden vectors prove Python/Go/TypeScript/Rust canonical bindings remain identical for exponent forms, negative zero, escaped Unicode, omitted fields and exact-number representations;
- database tests attempt cross-tenant foreign-reference injection for connections, credentials, approvals, dependencies, RAG lineage, automation guards and resource claims and prove persistence-level rejection/defense in depth;
- model-facing tool tests create upstream names colliding with SmartAIHub reserved tools/provider naming limits and prove deterministic aliasing cannot alter canonical authorization identity;
- schema-projection tests prove unsupported model-provider schema features cannot silently remove security-critical constraints; server validation rejects model arguments that pass a weakened provider projection;
- model exposure budget tests prove one huge tool schema cannot cause unbounded prompt cost or evict mandatory policy/gateway tools without explicit fallback behavior;
- transport-profile tests verify reserved headers cannot be overridden, proxy credentials never reach origin, origin credentials are stripped on cross-origin redirect, and mTLS/custom-secret values never enter browser/Agent/job logs;
- Runner installer tests exercise malicious lifecycle hooks/network/download attempts and prove staging/sandbox/promotion keeps the last known-good runtime intact;
- localhost impersonation tests race an untrusted local process for the expected port and prove loopback reachability alone cannot satisfy managed runtime identity/handshake;
- automation-owner tests disable/remove the owner during scheduled execution and prove new runs pause/orphan without credential fallback; transfer revalidates account/consent/purpose/budget;
- rate-limit/circuit tests inject one-account 401/429 failures and prove healthy accounts/tenants retain capacity while true origin-wide failure trips the broad circuit;
- schema-default tests race a changed default/omitted-field behavior and prove approval binds the exact transmitted/effective argument snapshot rather than a newly recomputed default.


### v15 Task / Subscription / Result / Runtime / Policy-Simulation Gap Tests

- task handle confidentiality, cross-tenant/account/revision replay rejection, expired task, guessed task, and no-enumeration tests;
- `subscriptions/listen` acknowledgement timeout, acknowledged-subset narrowing, bounded lifetime, rolling overlap, duplicate notification, event flood, reconnect and authoritative re-list tests;
- runtime result/output-schema valid, invalid, oversized, ambiguous-success, repeated-drift, and forward-compatible-extra-field tests;
- audience-specific result projection tests proving model/user/audit/RAG/downstream views cannot fall back to raw protected result;
- expiring/signed URL tests for expiry, cross-origin redirect, auth stripping, refresh-without-write-replay, quarantine and provenance;
- stdio tests for log-on-stdout corruption, oversized frame, stderr flood/backpressure, parser failure and non-idempotent in-flight termination;
- child process tests for leaked env vars, inherited FD/socket, daemonized descendant, process-tree kill, working-directory/PATH drift and stale fencing epoch;
- policy shadow simulation tests proving zero external side effects and reproducible current-vs-candidate outcomes;
- portable config export/import tests for secret exclusion, environment remapping, trust/quarantine enforcement, signature/hash verification and partial-import rollback;
- provider usage reconciliation tests for delayed usage, duplicate event, refund/credit, unknown cost, invoice mismatch and integration with the existing credit/accounting source of truth.


### v16 Boundary / Supply-Chain / Revocation / Cognitive-Failover Gap Tests

- tool annotations asserting `readOnlyHint=true` / `idempotentHint=true` cannot weaken a stricter SmartAIHub risk/retry policy;
- annotation default/contradiction tests use pessimistic behavior for untrusted servers;
- cross-origin browser tests prove CSRF/CORS/SameSite/origin protections for approval, connect/disconnect, policy, break-glass and kill-switch mutations;
- sender-constrained credential tests cover proof/key rotation, nonce/replay, issuer/resource/account mismatch and no silent bearer fallback;
- SBOM/VEX/signature/provenance tests bind evidence to the exact runtime digest and propagate transitive advisory impact;
- MIME/polyglot/active-content tests prove mismatched HTML/SVG/archive/executable content cannot be auto-rendered/indexed/executed;
- RAG injection tests place fake system/admin/tool instructions inside MCP Resources and prove they remain data-only under current trust policy;
- in-flight revocation fault tests cover pre-dispatch, post-dispatch/pre-effect where detectable, ambiguous external effect, late success and stale Runner/region publication;
- model-provider failover tests rebuild aliases/schemas/context budgets and prove pending tool calls are not blindly replayed across providers;
- localization tests verify canonical approval facts survive locale change, missing translation fallback, RTL/bidi rendering and page reload;
- requirement-to-test mapping is extended for Acceptance Criteria 164–173 and release CI fails if those mappings or evidence are missing.



### 27.2 Required Spec 199 ↔ 200 End-to-End Alignment Release Gate

This scenario MUST pass before declaring Spec 199 and Spec 200 integrated:

```text
1. User opens SmartAIHub Side Panel on a project page.
2. LangGraph resolves the task to Claude (or another Spec 200 external agent).
3. Spec 200 selects an eligible Runner from the shared Execution Node Registry.
4. Agent Runtime Core starts through the existing shared Runner Control Channel.
5. External Agent requests `capability.search`.
6. Shared Capability Resolver returns:
   - one SmartAIHub Skill
   - one approved Spec 199 MCP tool
7. External Agent invokes the Skill remotely; no Skill ZIP is installed into the provider runtime.
8. External Agent invokes the MCP capability via `capability.invoke`.
9. Capability Gateway routes the call through Spec 199 External MCP Gateway.
10. If the upstream MCP is local, Spec 199 uses the same Runner identity/control channel and MCP Runtime Manager sibling to Agent Runtime Core.
11. Any required approval is surfaced in the shared Assistant approval UI with execution-bound identity.
12. Network is interrupted.
13. Runner continues or fences safely, buffers bounded events, reconnects and reconciles/replays allowed events.
14. `worker_jobs` / `worker_job_events` retain durable execution truth throughout.
15. Retry/lease/fencing semantics do not duplicate the external effect.
16. MCP-derived RAG context, if used, retains Spec 199 lineage/ACL/revocation controls through the External Agent Context Adapter.
17. Final artifact/result uses canonical AssetRef/ArtifactRef and one end-to-end trace.
18. Result returns to the same conversation/Side Panel.
```

Additional negative tests MUST prove:
- a Spec 200 external agent cannot bypass Spec 199 to arbitrary upstream MCP;
- a second Runner connection/device registration path is rejected;
- a second Skill/Capability index cannot authorize capabilities independently;
- revoking MCP capability access immediately blocks subsequent External Agent invocation despite stale agent/provider context;
- stale Runner/lease epochs cannot publish authoritative completion after takeover;
- external-agent retry and MCP retry cannot independently recreate the same side effect.


## 28. Acceptance Criteria

Implementation is complete when:

1. External MCP servers can be registered and managed centrally.
2. Remote and Runner-hosted MCP tools use one SmartAIHub capability contract.
3. Unauthorized tools never appear in capability search.
4. Newly discovered tools can be quarantined.
5. Material schema changes trigger review.
6. OAuth/per-user credentials work without exposing secrets to LLMs.
7. Health state affects routing.
8. LangGraph can execute deterministic MCP calls without OpenAI Agents SDK.
9. OpenAI Agents SDK receives only selected MCP tools/capabilities.
10. End-to-end trace can connect chat -> orchestration -> agent -> capability -> MCP -> worker job.
11. Runner-local MCP can be started and supervised.
12. Third-party proxy/sidecar can be removed later without changing SmartAIHub public contracts.
13. Existing Spec 196 behavior remains compatible.
14. `worker_jobs` remains durable execution truth.
15. Platform Admin, Tenant Admin, End User, and Runner Owner receive distinct UI/navigation and server-authorized capabilities.
16. End Users can connect/revoke their own supported accounts without seeing MCP protocol internals or secret values.
17. Tenant Admin can configure team/role/agent access using presets and per-tool overrides.
18. Effective permissions follow `BLOCK > ASK > ALLOW` and child scopes cannot elevate parent policy.
19. Platform/Tenant/User scoped MCP ownership is represented explicitly in the data model.
20. Custom/personal MCP availability follows effective Platform/Tenant policy.
21. In-chat MCP actions support missing-connection, confirmation, blocked, Runner-offline, and success/error UX states.
22. MCP management UI includes loading, empty, partial, error, filtering, responsive, accessibility, and localization requirements.

---


23. MCP `2026-07-28` stateless protocol behavior is supported through an explicit protocol adapter and legacy behavior is isolated.
24. Tools, Resources, Prompts, and approved Extensions have distinct normalized governance rules.
25. MRTR/input-required flows can pause, obtain user input/consent, resume, cancel, and survive page reload for durable executions.
26. MCP Tasks extension integrates with `worker_jobs` without creating a second execution source of truth.
27. OAuth enforces modern issuer/resource/client-registration hardening and supports managed enterprise authorization where configured.
28. Remote MCP connectivity includes SSRF/DNS-rebinding/redirect protections and local MCP includes process/environment isolation controls.
29. Package provenance and scanner findings are reviewable before risky MCP activation/upgrades.
30. Cache hints improve performance without weakening tenant/user authorization boundaries.
31. Non-idempotent calls never receive blind automatic retries after ambiguous dispatch failures.
32. Admin UI exposes protocol/resources/prompts/extensions/scanner/task state while end-user UI remains simplified.
33. Preflight can validate unattended workflow readiness without invoking business tools.
34. Gateway can horizontally scale/restart without losing canonical durable state.
35. Billing/quota ownership is explicit so external account charges and SmartAIHub credit charges cannot be silently conflated.
36. Every modern `2026-07-28` request carries the required trusted `_meta` version/capability envelope and Streamable HTTP header/body consistency is validated.
37. `subscriptions/listen` keeps catalogs/resources fresh with cross-instance invalidation and safe reconnect semantics.
38. MCP tools/resources/prompts are associated with immutable server/runtime revisions so parallel versions cannot overwrite one shared catalog.
39. WRITE/DESTRUCTIVE `ASK` approvals are bound to exact actor/revision/schema/arguments/target and one-time approvals are atomically single-use.
40. Credential refresh is concurrency-safe and token rotation cannot be overwritten by a stale refresher.
41. Tool outputs/files remain untrusted data, are sanitized/scanned where applicable, and cannot bypass orchestration policy through indirect instructions.
42. MCP Apps, if enabled, run in an isolated bridge/sandbox and re-enter normal SmartAIHub authorization for every capability call.
43. Per-upstream circuit breakers, fair admission/queue limits, and `Retry-After` handling prevent cascading/noisy-neighbor failure.
44. Multi-step operations represent partial side effects explicitly and never promise transaction/rollback semantics the upstream does not provide.
45. Runtime revision rollout/drift/canary/rollback is observable and cannot reuse approvals across unapproved revisions.
46. Catalog pagination/discovery is bounded, generation-safe, and cannot silently erase capabilities after an incomplete refresh.
47. Argument-sensitive risk, parser/resource limits, and transport-header redaction prevent multiplexed-action bypass and resource/log leakage.
48. External cost/quota budgets are policy-enforceable and remain distinct from SmartAIHub credit accounting.
49. Server definition, installation, runtime revision, and authenticated connection identities are distinct so multi-tenant/multi-account configurations cannot collide.
50. When multiple eligible accounts exist, connection selection is deterministic or explicitly requested from the user; the system never silently switches credentials after approval/revocation.
51. Modern `resultType` semantics, transport response modes, MCP-reserved errors, and JSON-Schema 2020-12 resolution bounds are handled explicitly by the protocol adapter.

52. Capability identity is stable and collision-safe across servers/installations/revisions; display-name or Unicode-confusable collisions cannot affect authorization or approval.
53. Endpoint/resource/path canonicalization prevents alternate-encoding, redirect, symlink, junction, or path-normalization bypass of network/filesystem policy.
54. Canonical MCP control-plane mutations emit transactional, generation-aware events so capability indexes/caches/Runner desired state can recover without silent divergence.
55. Agent identities cannot mutate MCP management/security state, and retried management mutations are idempotent with optimistic-concurrency conflict protection.
56. Security audit evidence is protected against silent rewrite, and privileged break-glass operations require explicit elevated workflow and audit.
57. Time-sensitive security decisions use trusted server time with documented skew handling; credential restore/rotation cannot silently resurrect invalid environment-bound secrets.
58. Runner authentication is not treated as code/device trust; local schemas/results/files remain untrusted and privileged local capability may require managed-device policy.
59. Discovery ranking resists metadata/keyword poisoning and remains explainable without allowing ranking to change authorization/risk.
60. Multi-region deployment honors tenant data-residency/credential egress policy and fails closed when compliant failover is unavailable.
61. Database/API/runtime upgrades use a documented expand/migrate/contract and version-skew strategy that supports canary and rollback.
62. End-to-end deadlines, authoritative dispatch-time validation, projection-lag observability, and SLO metrics prevent stale or indefinitely queued side effects.

63. MCP failures use one typed normalized error taxonomy across REST/UI/Chat/Runner so retry, reconnect, policy, residency, stale-control-plane, and unknown-outcome behavior are consistent.

64. OAuth transactions enforce single-use state/code handling, issuer/resource binding, and explicit token-passthrough/confused-deputy prevention.
65. Integration/user/tenant decommissioning immediately stops new dispatch, cleans dependent runtime state safely, and never silently reuses old approvals or credentials on reinstall.
66. Side-effecting executions persist policy-generation/evaluator snapshots and still revalidate current policy before dispatch.
67. Request/response/stream/decompression/archive budgets prevent oversized or compressed-bomb payloads from reaching downstream model/index/UI processing.
68. Emergency containment can block a compromised server/revision/tool/connection/Runner/tenant from an authoritative dispatch-time path before eventual caches/indexes converge.
69. Gateway/Runner/sidecar rolling maintenance supports graceful drain and preserves UNKNOWN_OUTCOME semantics for interrupted non-idempotent operations.
70. Purpose-bound consent/data-sharing history and privacy deletion distinguish reusable permission, account disconnect, local retained data, and mandatory security audit retention.
71. Admin bulk changes provide dry-run/impact preview with generation-bound apply and per-item partial-failure handling.
72. Supported MCP protocol behavior is backed by pinned golden vectors, SDK/runtime contract tests, and upgrade-time conformance regression before promotion.
73. URL/out-of-band elicitation is origin-visible, single-use/expiry-bound, secret-safe, and cannot bypass SmartAIHub authorization/approval on return.


74. Security-critical revocation advances an authoritative scope epoch and stale approvals/queues/regions cannot perform high-risk dispatch.
75. Cross-region retry/replay of one side-effecting execution intent cannot create duplicate upstream side effects through SmartAIHub dispatch.
76. Capability executions retain verifiable provenance identifiers from source/package/revision/discovery/schema through approval and trace, with unknown provenance never mislabeled as trusted.
77. Disaster restore/failover can enter a restore safety mode that reconciles secrets, revocations, queues, projections, indexes, and UNKNOWN_OUTCOME work before normal side effects resume.
78. Gateway/control-plane abuse controls cover discovery, OAuth, approval, malformed-protocol, denied-call, and catalog-churn amplification without leaking protected resource existence.
79. Capability deprecation/retirement reports pinned dependents, blocks unsafe silent upgrades, and preserves historical revision identity for audit/reproducibility.
80. Compensation actions have explicit idempotency/eligibility/authorization semantics and never masquerade as guaranteed rollback.
81. Privacy erasure tracks active replicas/indexes/temp/Runner/backup obligations and restore cannot resurrect deleted executable authorization or personal data outside policy.
82. Operator UI exposes containment/revocation epoch, restore-safety readiness, dependency impact, abuse controls, and provenance state with role-appropriate access.
83. Fault-injection/property tests prove revocation, replay, projection-outage, regional-partition, privilege lattice, and one-time-consumption invariants under failure.

84. Runner/durable execution uses monotonic lease fencing so a stale executor cannot overwrite or initiate a SmartAIHub-controlled local side effect after ownership takeover.
85. Protocol negotiation enforces installation minimum/allowed versions and does not permit silent SDK fallback to weaken security/compatibility policy.
86. MCP completion/argument suggestions are permission-bound, bounded, untrusted convenience data and cannot become a hidden executable/authorization channel.
87. Progress/cancellation are normalized across modern MCP, Tasks, Runner, and `worker_jobs`; late progress/responses cannot resurrect terminal state and ambiguous writes retain UNKNOWN_OUTCOME semantics.
88. Cache/index entries are partitioned by all visibility/semantic generations that matter, preventing cross-user/tenant/revision/protocol bleed or stale executable authorization.
89. Platform/tenant-funded external usage uses atomic quota reservation/settlement so concurrent dispatch cannot overspend one authoritative budget.
90. A fenced reconciliation service detects and safely resolves orphan tasks/subscriptions/MRTR/OAuth/quota/temp/Runner state without destructive guessing.
91. Telemetry has bounded-cardinality/privacy rules separating metrics/traces from mandatory security audit evidence.
92. Cold-start/dependency readiness fails closed for high-risk dispatch until revocation, policy, execution ledger, secret and residency dependencies are authoritative enough to execute safely.
93. Internal event/API/capability schema evolution has explicit version compatibility/upcast/rollback rules independent of MCP wire protocol version.


94. Delegated execution preserves an explicit requester/Agent-or-workflow/execution-principal/credential-owner/account chain and never converts shared-credential possession into implicit authorization.
95. MRTR, Tasks, paused jobs, and deferred actions revalidate current policy, revocation, credential, revision, Runner trust, budget, and approval state before resuming side effects.
96. Side-effecting operations persist provider/effect evidence when available and can reconcile ambiguous outcomes without blindly replaying non-idempotent writes.
97. Remote MCP transport authenticates the intended TLS/server identity; insecure verification or cleartext downgrade cannot be enabled implicitly by end-user/tool metadata.
98. Runner privilege trust is freshness-bound; an online but stale/changed Runner cannot continue privileged local execution solely because it once attested successfully.
99. MCP-produced artifacts pass bounded provenance/scanning/quarantine gates before active rendering, Library publication where required, or RAG indexing.
100. Retention/legal-hold policy can preserve minimal evidence/content without retaining or resurrecting executable approval, credential, connection, queue, or capability permission.
101. Approval/reject/disable mutations provide canonical read-your-writes/projection status, and approved snapshots can enter search from committed control events without an unrelated rediscovery pass.
102. Security anomaly escalation is scoped, evidence-based, reversible, and resistant to attacker-triggered denial-of-service against victim users/tenants.
103. Delegation, stale-resume, effect-receipt, artifact, TLS, retention, and projection-convergence behavior is covered by integration/fault/security tests and operator-visible normalized error states.

104. Canonical MCP entity state machines and guarded transition tables are enforced by authoritative transactions; projections/UI cannot invent transitions.
105. Referential-integrity/decommission rules prevent broad cascades from deleting audit/effect/provenance evidence or affecting unrelated tenants/users.
106. Unknown future fields/extensions/enums follow explicit preserve/ignore/review/fail-closed rules; security-relevant unknown semantics cannot silently downgrade behavior.
107. Policy composition has deterministic precedence across emergency/platform/tenant/user/agent/risk/DLP/residency/budget/runtime layers and is monotonic toward restriction.
108. Credential/KMS key-version rotation, rewrap, environment binding, decrypt failure, and cryptographic-erasure behavior are implemented and auditable.
109. Retry ownership is singular per failure domain, carries end-to-end attempt lineage/budget, and prevents nested retry amplification or replay of ambiguous writes.
110. Multi-region control-plane writes and high-risk side effects are protected against split brain through authoritative write ownership plus fencing/epoch validation.
111. Incident evidence bundles can be exported with tenant scope, redaction, manifest/hash, audit trail, and explicit completeness indicators.
112. Rollout tooling classifies migrations as rollback-safe/forward-only/dual-write and blocks crossing irreversible migration barriers without tested recovery.
113. UI/API/Data-model contracts for all v10 lifecycle, retry, policy, secret, region-authority, evidence, and rollback features are covered by integration/E2E tests.


114. Security-sensitive hashes/receipts use a versioned canonical serialization with cross-language golden vectors; semantically identical formatting cannot create different authorization identities and display normalization cannot alter the authorized value.
115. Resource/prompt template expansion re-enters validation, URI/SSRF/authorization/DLP policy after expansion and cannot escape an approved host/path/scheme or inject secrets via completion suggestions.
116. A remote endpoint whose backend instances expose materially inconsistent server/catalog generations is detected as upstream inconsistency; high-risk execution does not silently proceed against whichever instance answered last.
117. Automatic health/readiness monitoring is side-effect-free by default, separately budgeted, and distinguishes service/catalog/shared-credential/user-connection readiness.
118. Registry/package publisher continuity is verified independently of display/package name so ownership/domain/signing-key takeover cannot inherit trusted upgrade approval silently.
119. Reverse-proxy/header trust rules prevent untrusted `Mcp-*`/forwarded/internal headers, duplicate-header ambiguity, or HTTP parsing differences from overriding SmartAIHub identity/routing/security decisions.
120. External calls carrying user/project data produce a purpose-bound minimum-necessary egress decision; destination/data-category policy can block disclosure even when no secret is detected.
121. A documented secure production baseline fails closed for unknown/risky MCP, insecure TLS, remote schema refs, legacy fallback, privileged Runner access, and provenance discontinuity unless explicitly enabled by policy.
122. Audit/control timelines use causal generation/epoch/sequence metadata rather than wall-clock ordering alone, so late/cross-region events cannot roll authoritative state backward.
123. Every Acceptance Criterion and security-critical normative requirement is traceable to an implementation owner and verification evidence, with CI/release gates detecting orphan or unimplemented requirements.


124. Discovery enforces total per-revision catalog entry/byte/page/work budgets and exposes incomplete-catalog state without treating a truncated refresh as authoritative deletion.
125. Capability consumers use an authoritative dependency graph with cycle detection, immutable identity, compatibility constraints, and dependency-aware retirement/uninstall impact analysis.
126. Scheduled/event-driven automations perform current per-run MCP revalidation; material consent/account/schema/risk/policy/dependency drift pauses unattended side effects for operator action.
127. External authorization scope/account drift is detected and never causes silent credential/account substitution; resumed long-running work revalidates credential generation and required scopes.
128. Configurable critical control-plane actions support execution-bound two-person approval with proposer/approver separation, stale-generation rejection, audited break-glass, and immutable change preview.
129. Privacy deletion clearly separates SmartAIHub-controlled erasure from external-provider erasure obligations and never falsely marks unverified external copies as deleted.
130. Upstream throttling is normalized into bounded shared admission/retry state with jitter and stampede prevention, without converting provider hints into billing truth or replay authorization.
131. MCP Resource/artifact content admitted to RAG retains authoritative ACL/provenance/freshness/deletion lineage; access revocation blocks retrieval before eventual physical index purge completes.
132. Post-install supply-chain advisories/signing-key or package trust revocations propagate to affected revisions through impact analysis, revocation/quarantine policy, and operator-visible evidence.
133. Privileged management mutations re-evaluate current authorization/session freshness at submit time so stale tabs/sessions cannot retain removed roles or bypass current policy.


134. When supported, JIT/secretless credential execution mints minimum-scope/audience/TTL grants after authorization and keeps bearer material out of Agent/Chat/browser/general job/event state.
135. Persistent HTTP client/connection pooling is partitioned and resource-bounded so concurrent tenants/accounts cannot leak headers, cookies, credentials, MCP routing context, sockets or mutable middleware state across executions.
136. External JSON-RPC/request IDs are opaque peer correlation only and cannot become SmartAIHub trace, approval, cache, idempotency or execution identities; collision/fuzz behavior is tested.
137. Side-effecting scheduled/event-driven automations have an explicit atomic overlap/coalescing policy and produce auditable started/skipped/coalesced/queued outcomes across concurrent gateway instances.
138. Human approval UI derives authoritative facts from the same canonical operation snapshot used for execution binding; multi-device terminal decisions are compare-and-swap safe and stale controls cannot trigger execution.
139. Runner/local MCP finite resources support fenced capacity/resource claims so exclusive GPU/VRAM/port/process/model-slot resources are not double-booked and crash cleanup is reconciled safely.
140. Sensitive MCP browser surfaces are non-cacheable/offline-disabled as appropriate, avoid client-side persistence of protected payloads, redact frontend telemetry, and revalidate stale privileged tabs before mutation.
141. High-volume audit/activity/control/progress/reconciliation datasets have bounded retention/query/pagination/archival strategies and maintenance cannot indefinitely block security-critical transactions.
142. A versioned threat-model/trust-boundary register covers browser, upstream, registry/package, Agent/prompt injection, Runner, proxy, region and privileged-operator threats and is linked to concrete controls/tests.
143. v13 credential, transport-pool, request-ID, automation-overlap, approval-race, runtime-capacity, browser-state, high-volume-data and threat-model behaviors are represented in UI/API/data contracts and covered by integration/security/fault tests.


144. Security-relevant JSON parsing rejects duplicate keys/parser ambiguity and preserves cross-language numeric/Unicode canonicalization invariants before approval/idempotency/effect hashing.
145. Tenant/scope ownership is enforced at persistence boundaries for cross-entity references, with tested database-level defense against cross-tenant relationship injection.
146. Model-facing tool aliases are SmartAIHub-generated, collision-safe, reserved-namespace-safe, and never replace canonical capability identity for authorization/audit.
147. Model-tool schema projection cannot silently weaken execution constraints; unsupported/lossy provider schemas fall back to authoritative server validation or generic capability execution, with bounded schema/token exposure.
148. Secret-bearing custom headers, proxy credentials, private CA/mTLS material and transport settings use scoped transport profiles/secret refs; reserved routing/security headers cannot be overridden by ordinary users.
149. Runner MCP installation is staged/sandboxed with controlled lifecycle scripts/network/secret exposure, immutable revision evidence and last-known-good rollback protection.
150. Runner-managed localhost MCP proves current process/revision/endpoint ownership with a protected local handshake or equivalent; loopback reachability/port number alone is never treated as identity.
151. Scheduled/event-driven automation has an explicit owner/custodian and execution principal; disabled/departed owners cause pause/orphan or reviewed transfer rather than silent continued privilege/credential substitution.
152. Circuit breakers/rate-limit state and queue bulkheads use the narrowest authoritative provider/account/tenant scope available, prevent one account from poisoning healthy accounts, and include bounded starvation prevention.
153. High-risk approval binds and displays canonical effective transmitted arguments, SmartAIHub-applied defaults, omitted fields, and material server-default uncertainty; retries do not recompute those semantics from a newer schema.


154. Upstream MCP task handles are treated as protected, scope-bound references; cross-tenant/account/revision reuse and task enumeration are rejected and raw handles are not exposed through ordinary UI/logging.
155. `subscriptions/listen` requires bounded acknowledgement/lifetime/reconnect semantics, duplicate suppression and authoritative re-list reconciliation; overlapping listeners cannot create duplicate authoritative refresh work.
156. Runtime MCP results are validated against negotiated protocol result semantics and approved output schemas where declared; repeated material output drift is observable/reviewable and malformed high-risk success can become `UNKNOWN_OUTCOME`.
157. MCP results use least-disclosure audience-specific projections for model, user, audit, RAG and downstream capabilities; failure to build a safe projection never falls back to raw protected output.
158. External/signed/expiring references are revalidated at dereference time for network/auth/residency/size/content safety and cannot trigger blind replay of a prior side-effecting call merely to refresh a URL.
159. Runner stdio MCP preserves strict protocol framing and stdout/stderr separation with bounded I/O; framing abuse or log corruption cannot be silently parsed as valid MCP traffic.
160. Runner child processes receive allowlisted environment/FD/handle state and process-tree containment so unrelated secrets/IPC and stale descendants cannot survive across fencing epochs or service restart.
161. High-impact MCP policy changes can be shadow-evaluated against bounded redacted historical/synthetic fixtures without external side effects, and promotion remains a separate generation-bound authorized mutation.
162. MCP configuration can be exported/imported through a versioned secret-free portable manifest with environment remapping, validation/dry-run and normal quarantine/trust/policy enforcement.
163. Delayed provider usage/cost can be reconciled, deduplicated and adjusted through explicit usage records without treating unknown cost as zero or creating a second SmartAIHub credit/balance source of truth.


164. Upstream MCP tool annotations are preserved as untrusted hints only; they cannot lower SmartAIHub risk, confirmation, retry, DLP, or authorization requirements without an independently trusted policy/review source.
165. High-risk remote MCP connections can require sender-constrained/proof-of-possession credentials when the provider supports them, with key/proof generation scoped to the current issuer/resource/account/connection/environment and no silent bearer fallback.
166. Browser-exposed MCP management and account-connection mutations enforce explicit CSRF/origin/CORS/cookie boundaries so ambient browser credentials cannot be abused cross-site.
167. Runner/local/redistributed MCP revisions can retain verifiable SBOM/VEX/signature/build-provenance evidence linked to immutable artifacts, and transitive supply-chain findings propagate to affected installed revisions without implying automatic trust.
168. Declared MIME/content type and filename cannot bypass bounded content identification/sanitization policy; active/polyglot/mismatched content is not automatically rendered, indexed, or executed.
169. MCP-derived RAG content carries authoritative source trust and instruction-isolation state; retrieved external text cannot become system/developer authority or silently grant/trigger capabilities.
170. Revocation occurring while execution is in flight has explicit cancellation/fencing/late-result semantics; ambiguous side effects become `UNKNOWN_OUTCOME` rather than false rollback/success.
171. Cognitive model/provider failover regenerates model-facing tool aliases/schema projections/context exposure under the same authorization boundary and never blindly replays a pending or ambiguous MCP side effect.
172. Security-critical approval and management UI preserves canonical target/account/action/effective-argument/risk facts across locales, fallback language, bidi/Unicode rendering, and accessibility representations.
173. v16 annotation-trust, sender-constraint, browser-origin, supply-chain, content-type, RAG-instruction, in-flight-revocation, model-failover, and localization behaviors are represented in data/API/UI/error/observability contracts and covered by integration/security/fault tests.



174. Every production MCP adapter has an observed-wire conformance attestation; configured protocol revision/package version alone cannot satisfy readiness, and a `2026-07-28` profile emitting older handshake/session-era wire is blocked.
175. Tool task-augmented execution respects normalized `taskSupport` plus a separately pinned/attested Tasks extension; `FORBIDDEN` task results are drift, `REQUIRED` tools are unavailable without support, and no unsafe task enumeration is introduced.
176. `subscriptions/listen` notifications are treated as level-triggered invalidation signals with acknowledged scope and bounded authoritative re-fetch; SmartAIHub never uses them as its durable exactly-once audit/control ledger.
177. MRTR requested fields are security-classified before rendering; credentials/one-time secrets/protected financial inputs use approved protected channels and are excluded from model context, RAG, ordinary history/logging and unsafe browser persistence.
178. Modern per-request client capability advertisement reflects the actual selected runtime/request needs and cannot be broadened by user/tool input or a platform-wide capability superset.
179. MCP extensions have independent version/maturity/approval profiles; Draft/Experimental extensions are explicitly pinned, feature-flagged, tested and rollbackable, while core-protocol support does not imply extension support.
180. Protocol adapters preserve or equivalently process wire-only metadata required for correctness—including result discrimination, cache hints, subscription acknowledgement/identity and MRTR continuation—even when SDK typed APIs hide those fields.
181. A machine-readable runtime feature-attestation matrix determines execution eligibility across Gateway/Runner/sidecar implementations; package version strings alone do not claim feature support.
182. General opaque upstream continuation/state handles are protected and scope-bound like bearer-like state when secrecy is unknown; raw handles are excluded from unrelated model/RAG/log/UI surfaces and are never recreated through blind side-effect replay.
183. Protocol feature/transport deprecations are inventoried with dependency impact, migration owner/deadline and release gates; deprecated legacy features are compatibility-only and removed features cannot remain silently executable.


184. Spec 200 is explicitly declared as Spec 199's companion External Agent Gateway; ownership of External MCP transport/upstream lifecycle remains exclusively in Spec 199 while shared platform infrastructure is not duplicated.
185. Capability Resolver branches include Skill, Workflow, Internal, MCP Tool→Spec 199 and External Agent Runtime→Spec 200 under one LangGraph orchestration path.
186. Spec 200 External Agents cannot connect directly to arbitrary upstream MCP or obtain upstream MCP credentials; MCP invocation is routed through `SAH-CAP-1` and Spec 199.
187. SmartAIHub Runner exposes one device identity, one authenticated Control Channel and one Execution Node Registry snapshot containing sibling MCP Runtime Manager (Spec 199) and Agent Runtime Core (Spec 200) capabilities.
188. `worker_jobs`/`worker_job_events` remain durable global execution truth while the Runner Control Channel remains realtime transport; neither spec creates a second competing durable/realtime control plane.
189. `capability.search`, `capability.describe`, `capability.invoke`, `capability.status`, and `capability.result` are canonical cross-spec capability operations; Skill/MCP aliases remain projections over the same policy-filtered registry.
190. Spec 200 External Agent Context Adapter retrieves Help/RAG/Specs/Library/MCP-derived knowledge through the shared Retrieval Broker, and MCP-derived knowledge retains Spec 199 lineage/ACL/trust/freshness/revocation semantics.
191. Approval identity/expiry/replay protection, Audit/Trace IDs, retry ownership, lease epochs/fencing, cancellation and `UNKNOWN_OUTCOME` semantics remain common across default cognitive, deterministic and delegated External Agent callers.
192. Canonical AssetRef/ArtifactRef/Library references are preserved across Spec 199 MCP calls and Spec 200 External Agent tasks without a second durable asset identity scheme.
193. Both specs advertise compatible `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1`, and `SAH-ASSET-1` internal contract versions and pass mixed-version compatibility/rollback tests before breaking changes.
194. `/chat` and Universal AI Assistant Side Panel always enter the shared LangGraph path for ordinary product flows and cannot invoke Runner directly to bypass Capability/Approval policy.
195. The required Spec 199↔200 end-to-end integration scenario and negative bypass/duplicate-system tests in Section 27.2 pass as a release gate.


## 29. Implementation Decision on `mcpproxy-go`

Allowed initial uses:
- reference architecture
- source-pattern reference
- local sidecar in Runner
- upstream MCP process/proxy implementation where license and deployment policy permit

Not allowed:
- making its API the canonical SmartAIHub API
- allowing UI/backend modules to depend directly on its internal data model
- making it the owner of permissions, tenants, credits, jobs, or audit truth
- bypassing SmartAIHub Capability Gateway
- enabling an independent sidecar Web UI/management plane that can mutate governed configuration outside SmartAIHub
- enabling sidecar code-execution/orchestration surfaces by default; any such surface requires an explicit SmartAIHub sandbox/policy design and separate security review

When used as a sidecar, SmartAIHub SHOULD configure the narrowest feature surface necessary (proxy/discovery/execution only), with management and code-execution features disabled unless specifically required.

SmartAIHub MUST retain the adapter boundary:

```text
MCPGatewayAdapter
  -> NativeSmartAIHubAdapter
  -> MCPProxySidecarAdapter (optional)
```

---

## 30. Definition of Done

### Backend / Data
- database migrations complete
- scope model (`PLATFORM`, `TENANT`, `USER`, `AGENT`, `RUNNER`) complete
- server/installation/connection separation implemented
- policy tables and effective permission calculation implemented
- credentials are secret-reference based
- protocol/resource/prompt/task/pending-input entities complete
- billing/quota ownership represented explicitly
- canonical capability identity/namespace and control-event outbox implemented
- capability dependency graph + cycle/compatibility validation implemented
- MCP-derived RAG lineage and external-erasure obligation tracking implemented
- management mutation idempotency + optimistic concurrency implemented
- ephemeral credential lease metadata, automation execution guards, and Runner runtime resource claims implemented where applicable

### Gateway / Runtime
- server APIs implemented
- remote MCP discovery/execution implemented
- Runner integration implemented
- optional sidecar adapter isolated behind SmartAIHub interface
- health/discovery/schema drift handling complete
- concurrency/backpressure complete
- transport-client pool isolation/socket quotas and runtime resource fairness complete
- secretless/JIT credential path implemented for supported providers with explicit fallback policy
- protocol adapter/version compatibility complete
- MRTR and Tasks integration complete

### Orchestration
- Capability Registry integration complete
- LangGraph MCP nodes complete
- deterministic `MCP_DIRECT` complete
- Agents SDK reduced-tool integration complete
- cache invalidation on permission/schema/health changes complete

### Security
- OAuth/credential lifecycle complete
- quarantine/schema review complete
- risk classification complete
- effective permission enforcement at discovery and execution complete
- DLP/redaction complete
- audit/trace complete
- dual-control critical-change workflow implemented where enabled
- post-install security advisory matching/revocation propagation implemented
- SSRF/egress/process isolation and supply-chain scan gates complete

### UI / UX — Platform Admin
- MCP Gateway Overview
- Catalog & Registries
- Server Detail
- Quarantine / Schema Review
- Global Policy
- Security / DLP
- Health
- Runners
- Audit
- Control-Plane Health / Projection Lag
- Regions & Residency (when enabled)
- Privileged Operations / Break-Glass

### UI / UX — Tenant Admin
- Workspace MCP Overview
- Discover / Install
- Add Custom MCP where permitted
- Installed Integrations
- Integration Detail
- Tools & Permission Matrix
- People/Team Access
- Agent Access
- Shared Credentials
- Activity
- Workspace Policy

### UI / UX — End User
- Connected Apps home
- Available Apps
- OAuth connect/reconnect/revoke
- personal confirmation preferences
- personal activity
- Personal MCP where permitted
- My Devices

### UI / UX — Runner
- Device Overview
- Local Integrations
- MCP Services
- process actions
- jobs
- logs
- offline/degraded state

### UI / UX — Chat / Universal Assistant
- missing connection card
- WRITE approval card
- DESTRUCTIVE approval card
- blocked-policy state
- Runner-offline state
- connection return/deep-link flow
- activity/trace link where permitted

### UX Quality
- loading states complete
- empty states complete
- error/degraded states complete
- responsive rules implemented
- accessibility requirements implemented
- localization-ready strings implemented
- no unauthorized control relies only on frontend hiding

### Revision / Protocol Safety
- immutable server revision model implemented
- installation pin/follow-channel behavior implemented
- modern `_meta`/headers/Mcp-Param validation implemented
- subscriptions/listen freshness/reconnect implemented
- execution approval receipt + atomic consume implemented
- credential refresh single-flight implemented
- circuit breaker/fair scheduling implemented
- end-to-end deadline propagation implemented
- normalized MCP error taxonomy implemented across API/UI/Chat/Runner
- authoritative dispatch-time generation validation implemented
- partial-success normalization implemented
- MCP Apps remain disabled unless sandbox/bridge controls are implemented and approved

### Lifecycle / Consent / Emergency Safety
- decommission/offboarding/tombstone lifecycle implemented
- consent/authorization history implemented where required by product policy
- policy-generation snapshot and dispatch revalidation implemented
- payload/stream/archive budgets implemented and configurable within security floors
- emergency containment/kill switch implemented with authoritative dispatch check
- graceful drain/rolling restart behavior implemented for Gateway and Runner
- privacy deletion/revocation workflows implemented with unresolved-obligation reporting
- bulk dry-run/impact preview implemented for supported admin operations
- scheduled/event-driven automation per-run MCP readiness/drift revalidation implemented
- privileged session freshness/step-up guards implemented for configured critical mutations

### Lifecycle / Consistency / Forensics
- canonical transition guards implemented for security/execution entities
- referential integrity/tombstone checks implemented without destructive cross-scope cascades
- unified policy compiler/evaluator used by preview and dispatch
- retry ownership/attempt lineage implemented end-to-end
- KMS/key-version rewrap and environment-binding procedures implemented
- regional write-authority/fencing behavior implemented for configured multi-region mode
- incident evidence export implemented with redaction, manifest/hash and audit
- rollout tooling enforces rollback-safe/forward-only migration classification


### v15 Additional Completion Gates

- task-handle storage/redaction/scope binding and subscription lease lifecycle implemented;
- runtime output-schema/result validation plus output-drift review path implemented;
- audience-specific result projection and external-reference fetch safety implemented;
- Runner stdio framing and child-process env/FD/process-tree containment implemented on supported desktop/server platforms;
- policy shadow simulation and portable secret-free configuration import/export implemented with audit/generation controls;
- external provider usage reconciliation integrates with the existing credit/accounting contract when SmartAIHub is financially responsible;
- v15 tests and Acceptance Criteria 154–163 are mapped in the requirement-to-test traceability gate.

### v17 Additional Completion Gates
- wire revision attestation is implemented for every deployed MCP adapter/runtime and is part of readiness/CI;
- extension profiles and runtime feature attestations are persisted and enforced at capability eligibility time;
- normalized tool `taskSupport` behavior and Tasks extension compatibility are implemented/tested without `tasks/list` enumeration;
- subscription processing is level-trigger/convergent and never substitutes for internal durable control/audit events;
- MRTR secure-input classification/protected submission paths are implemented and secret values are excluded from model/RAG/log/history surfaces;
- per-request client capability advertisement is generated from actual runtime support/policy and is not caller-injectable;
- SDK wire-metadata behavior is pinned/tested for the deployed SDK versions;
- opaque state handles have protected storage/surrogates/scope binding/expiry cleanup;
- protocol feature deprecation inventory and migration/release gates are operational;
- Platform UI exposes wire attestation, extension maturity, runtime feature matrix and protocol migration blockers.

### Verification
- unit tests pass
- integration tests pass
- security/tenant isolation tests pass
- role/scope tests pass
- UI E2E tests pass
- multi-device approval race, stale-tab/browser-cache, automation-overlap and Runner-capacity UI E2E tests pass
- catalog-budget/dependency/automation-drift/advisory/RAG-lineage/dual-control tests pass
- v12 requirement-to-test traceability includes Acceptance Criteria 124–133

- MCP 2026-07-28 conformance/compatibility tests pass for supported primitive set
- legacy transport/feature warnings verified in UI
- MRTR resume/cancel/replay protection verified
- Tasks extension + worker_jobs recovery verified across gateway restart
- SSRF/DNS rebinding/redirect security tests pass
- OAuth issuer/resource/PKCE/step-up/refresh tests pass
- resource/prompt governance and RAG provenance tests pass
- supply-chain scanner/provenance review flow verified
- idempotency/UNKNOWN_OUTCOME behavior verified
- backup/restore drill for MCP config + job/task linkage documented and exercised
- control-event projection rebuild/DLQ recovery drill documented and exercised
- lease/fencing takeover and zombie-executor drill documented and exercised
- protocol downgrade policy and compatibility exception flow verified
- quota reservation/settlement reconciliation verified under concurrency
- orphan reconciliation sweeper and manual-reconcile UX verified
- cold-start readiness dependency gates verified fail-closed for high-risk execution
- internal event/schema compatibility corpus passes mixed-version rollout and rollback tests
- break-glass/audit-integrity and data-residency tests pass where enabled
- mixed-version migration/canary/rollback matrix verified
- regression tests pass
- model-tool projection/alias/schema-budget compatibility complete
- transport-profile/secret-header/proxy/mTLS boundary complete
- Runner staged installer/local endpoint identity verification complete
- automation owner/orphan lifecycle and scoped breaker/bulkhead behavior complete
- documentation complete
- companion Spec 196 amendment remains compatible with this revision

---

### Cross-Spec Alignment / Spec 200
- Spec 200 Revision 4 declared and linked as companion spec
- ownership table implemented with no duplicate Capability Registry, Retrieval Broker, Runner registry/channel, `worker_jobs`, Approval, Audit/Trace, billing or asset truth
- canonical `SAH-CAP-1` operations implemented/available to Spec 200 External Agent adapters
- External Agent → MCP path is Capability Gateway → Spec 199 only; direct upstream MCP bypass tests pass
- unified Runner snapshot includes MCP Runtime Manager + Agent Runtime Core sibling capabilities under one Runner identity/control channel
- `worker_jobs` durable state vs Runner realtime transport contract verified under disconnect/reconnect/backend restart/Runner restart
- External Agent Context Adapter uses shared Retrieval Broker; MCP-derived lineage/revocation stays authoritative
- shared approval/trace/retry/lease/fencing/UNKNOWN_OUTCOME contracts verified end-to-end
- canonical asset/artifact references preserved across External Agent + MCP calls
- `SAH-EXEC-1` / `SAH-CAP-1` / `SAH-RUNNER-1` / `SAH-CONTEXT-1` / `SAH-ASSET-1` compatibility tests pass
- Section 27.2 integration release gate passes


## Appendix A — Ten-Pass Gap Audit (v3)

This revision was produced using ten separate review passes. Each pass used a different failure/architecture lens; findings were fixed in this spec rather than left as TODOs.

| Pass | Review focus | Main gaps found | Resolution in v3 |
|---|---|---|---|
| 1 | MCP protocol baseline | No explicit current protocol adapter/version behavior; legacy session assumptions could leak into modern path | Added 2026-07-28 stateless baseline, header validation, compatibility adapter, legacy SSE policy |
| 2 | MCP primitive completeness | Spec was tool-centric; Resources/Prompts/Extensions were not governed | Added primitive model, resource/RAG rules, prompt trust rules, extension policy |
| 3 | Human interaction | No stateless input-required/MRTR lifecycle | Added MRTR pause/resume/cancel/round-limit and UI/API contracts |
| 4 | Long-running MCP | No formal upstream Tasks mapping | Added Tasks extension -> worker_jobs correlation, polling/cancel/idempotency rules |
| 5 | Authorization | OAuth lacked modern issuer/resource/client-registration and enterprise authorization requirements | Added issuer validation, CIMD preference, DCR legacy isolation, Resource Indicators, step-up scopes, EMA, refresh lifecycle |
| 6 | Security boundary | Missing SSRF/DNS rebinding/redirect defense and local process/supply-chain isolation | Added network egress controls, stdio sandbox/env rules, provenance, scanner pipeline, prompt/tool poisoning controls |
| 7 | Data consistency/performance | Missing protocol/resource/prompt/task records, cache scope, execution idempotency, unattended preflight | Added data entities, cache partition/invalidation, idempotency classes, preflight |
| 8 | Runner lifecycle | Runner MCP process install/upgrade/trust contract incomplete | Added reproducible install/update/rollback, Runner trust, sidecar pinning and management-boundary rules |
| 9 | UI/UX completeness | UI lacked protocol/resources/prompts/MRTR/task/scanner/managed-auth/conflict screens | Added production UI flows and API contracts for all of those cases |
| 10 | Operations/recovery/testing | HA, tracing propagation, DR/retention, ambiguous-write failures, conformance coverage were incomplete | Added HA/OTel/backup-retention, UNKNOWN_OUTCOME, failure cases, expanded test and acceptance gates |

### Audit conclusion

After these ten passes, no known architecture-level gap remains that requires changing the core ownership model of Spec 199. Future gaps should primarily be implementation discoveries, changes in later MCP protocol revisions/extensions, or repository-specific constraints uncovered while mapping this spec to the existing codebase.

The implementation team MUST still perform a repository-to-spec gap analysis before coding and SHOULD pin the exact MCP SDK/protocol versions selected for the release branch.

---

## Appendix B — Second Ten-Pass Gap Audit (v4)

This v4 revision performs a second independent ten-pass review after the v3 audit. Each pass looked for a different class of production failure and the findings were incorporated directly into the normative spec.

| Pass | Review focus | Gap found | Resolution in v4 |
|---|---|---|---|
| 1 | Current MCP wire contract | Modern request `_meta` keys, `server/discover` negotiation behavior, and `Mcp-Param-*`/header mirroring were underspecified | Added exact modern envelope, trusted header/body construction and mismatch validation |
| 2 | Freshness/event semantics | Catalog/resource change notifications relied mostly on polling/cache TTL; no `subscriptions/listen` lifecycle | Added listener filters, subscription correlation, reconnect, authoritative refresh, and cross-instance invalidation |
| 3 | Versioned runtime identity | One `mcp_server_id` could collapse catalogs from multiple Runner/package versions | Added immutable `mcp_server_revisions`, revision-bound catalogs, installation pinning, rollout/rollback/drift |
| 4 | Approval TOCTOU/replay | Confirmation was persistent-policy scoped but not bound tightly enough to exact execution arguments/target | Added execution approval receipts, normalized-argument binding, expiry, atomic single-use consume, stale-review UX |
| 5 | OAuth/token concurrency | Refresh lifecycle lacked single-flight/generation semantics under concurrent callers | Added per-credential refresh lease, atomic token generation, loser reload, prompt revocation propagation |
| 6 | Returned-content security | Metadata poisoning was covered, but tool outputs/files could still become indirect instructions or unsafe previews | Added untrusted result provenance, instruction-boundary rules, sanitization, archive/file scanning, inbound data classification |
| 7 | Resilience/noisy-neighbor isolation | Concurrency limits existed without explicit circuit breaker, fair scheduling, queue TTL, or dequeue revalidation | Added per-upstream circuit breaker, Retry-After, fair admission, stale queue expiry and dispatch-time revalidation |
| 8 | Multi-step side effects | No explicit partial-success/compensation semantics for agent plans spanning multiple MCP calls | Added partial outcome taxonomy, no-fake-transaction rule, explicit compensation contract and UX |
| 9 | MCP Apps extension | Apps were merely disabled by default; secure future enablement boundary was not specified | Added sandbox/origin/CSP/bridge/permission/token rules and tests |
| 10 | UI/API/test closure | Revision rollout, subscription freshness, approval receipt, circuit state and partial-success UX/APIs/tests were missing | Added UI 22.43–22.47, APIs 23.18–23.20, failures, migration steps, tests and acceptance criteria 36–45 |

**Post-pass verification findings fixed before closing v4:** bounded catalog pagination/cursor-loop defense, subscription acknowledged-filter handling, argument-sensitive runtime risk, protocol parser/resource-exhaustion limits, secret-bearing `Mcp-Param-*` log redaction, external cost/budget guardrails, third-party redistribution license/provenance checks, and explicit server-definition vs installation vs authenticated-connection semantics for multi-tenant/multi-account routing. These are reflected in Sections 6.13, 11.1, 14.8, 22.48–22.49, 23.21, tests, and acceptance criteria 46–48.

### v4 audit conclusion

After this second ten-pass review, no new gap was found that requires changing the primary ownership model: LangGraph remains the system orchestrator, OpenAI Agents SDK remains the default cognitive executor, SmartAIHub Capability Registry/Gateway remains the governed discovery/execution boundary, and `worker_jobs` remains durable execution truth.

The remaining expected discovery area is repository-specific implementation mapping and future MCP revisions/extensions. The release branch MUST pin the MCP SDK/protocol versions actually deployed and re-run protocol-conformance/security regression tests before upgrading them.

---


## Appendix C — Normative / Implementation References

The implementation team SHOULD verify behavior against the exact pinned SDK and the authoritative protocol/extension documents at build time. References used for this revision include:

- MCP Specification `2026-07-28`: https://modelcontextprotocol.io/specification/2026-07-28
- MCP `2026-07-28` Key Changes / Changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Streamable HTTP transport: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- Authorization: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- MCP Tasks extension (`io.modelcontextprotocol/tasks`): https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks
- MCP Apps extension documentation: https://apps.extensions.modelcontextprotocol.io/
- MCP TypeScript SDK v2 — supporting protocol revision `2026-07-28`: https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28
- MCP TypeScript SDK v2 — upgrade/conformance notes: https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2

If a later stable MCP revision conflicts with this spec, SmartAIHub MUST introduce a new/updated `MCPProtocolAdapter` and compatibility test matrix rather than silently changing behavior inside an existing adapter.
## Appendix D — Third Ten-Pass Gap Audit (v5)

This v5 revision performs a third independent ten-pass review focused on distributed control-plane correctness, identity, operator security, and production lifecycle. Findings were incorporated into normative sections instead of left as TODOs.

| Pass | Review focus | Gap found | Resolution in v5 |
|---|---|---|---|
| 1 | Capability identity | Display/normalized names could collide across servers/revisions and Unicode confusables could mislead approvals | Added canonical stable capability identity, namespace binding, Unicode/bidi/confusable controls |
| 2 | Endpoint/resource/path identity | Raw URI/path variants could bypass allowlists or create duplicate security identities | Added remote URI + local filesystem canonicalization after resolution/symlink handling |
| 3 | Distributed control-plane consistency | DB updates, search indexes, caches, subscription refresh and Runner desired state lacked an atomic delivery contract | Added transactional `mcp_control_events`/outbox, generation-aware idempotent consumers, DLQ/rebuild semantics |
| 4 | Management-plane privilege | Role UX existed but Agent/service execution identity was not explicitly prohibited from mutating MCP administration; retries could duplicate mutations | Added management-plane actor separation, idempotency keys and optimistic concurrency |
| 5 | Audit/operator security | Audit was observable but tamper evidence and emergency privileged access were underspecified | Added append-oriented/tamper-evident audit requirements and break-glass workflow |
| 6 | Time/credential lifecycle | OAuth expiry, approvals, Runner freshness and restored credentials lacked shared clock/environment semantics | Added trusted time/skew model plus credential restore/rotation/environment binding |
| 7 | Runner trust | Runner authentication could be misread as device/process integrity | Added untrusted Runner execution boundary, revision verification, optional device posture/attestation |
| 8 | Discovery integrity | Search metadata could be keyword-stuffed to manipulate tool ranking | Added anti-stuffing, diversification, explainable ranking and security-signal separation |
| 9 | Upgrade/version skew | Migration phases existed without expand/contract DB rollout and mixed gateway/worker/Runner compatibility rules | Added zero-downtime schema/API migration, version-skew matrix, canary and rollback rules |
| 10 | Deadlines/region/SLO consistency | Per-layer timeouts, multi-region residency and projection freshness lacked explicit end-to-end operational contracts | Added deadline propagation, regional residency/egress rules, SLI/SLO and authoritative dispatch-time generation validation |

### v5 audit conclusion

The third ten-pass review did not require changing the ownership architecture. It hardened the boundaries that make the architecture operable at scale: stable identity, atomic control-plane propagation, management privilege separation, trustworthy audit, time/region semantics, Runner trust assumptions, upgrade safety, and measurable freshness/deadline behavior.

Future implementation work MUST still run repository-to-spec mapping and threat-model review against the exact deployment topology, secret manager, database, queue/outbox implementation, Runner sandbox technology, and pinned MCP SDK versions.

## Appendix E — Fourth Ten-Pass Gap Audit (v6)

This v6 revision performs a fourth independent ten-pass review focused on lifecycle closure, authorization transaction integrity, policy reproducibility, resource budgets, emergency response, privacy/consent, operations UX, and protocol testability. Findings were incorporated into normative sections and acceptance tests.

| Pass | Review focus | Gap found | Resolution in v6 |
|---|---|---|---|
| 1 | OAuth transaction integrity | PKCE/issuer/resource existed, but token passthrough/confused-deputy and single-use transaction semantics were not explicit enough | Added state/code single-use binding, audience separation, token-passthrough prohibition, issuer/resource correlation |
| 2 | Removal/offboarding lifecycle | “Remove” UI existed without a full teardown/tombstone contract | Added DISABLING→REVOKING→DRAINING→DECOMMISSIONED lifecycle, credential/task/subscription cleanup and non-reactivation rules |
| 3 | Policy reproducibility | Dispatch revalidation existed but historical decisions could not be reconstructed after policy changes | Added policy-generation/evaluator decision snapshots plus current-policy revalidation |
| 4 | Payload/resource exhaustion | Parser/schema bounds existed but transport bytes, stream totals, decompression and archive-bomb budgets were incomplete | Added request/response/SSE/download/decompression/archive/object-size budgets |
| 5 | Incident containment | Break-glass existed but no authoritative emergency deny path/kill switch | Added scoped emergency containment checked at dispatch with queue/subscription/Runner invalidation |
| 6 | Rolling operations | HA/version rollout existed without graceful drain semantics | Added READY→DRAINING→STOPPING lifecycle and UNKNOWN_OUTCOME-safe shutdown behavior |
| 7 | Privacy/consent | DLP/retention existed but purpose-bound authorization history and deletion/offboarding semantics were incomplete | Added consent receipts, purpose limitation, privacy deletion and user authorization-history UX |
| 8 | Admin operations at scale | Permission matrix existed but bulk changes lacked dry-run/impact and generation-bound apply | Added bulk preview/apply, dependency impact, partial-failure retry and strong confirmation |
| 9 | Protocol test oracle | Broad tests existed without pinned golden wire vectors / runtime differential contract | Added golden vectors, SDK/runtime matrix, malformed-vector, differential/fuzz and upgrade conformance gates |
| 10 | Out-of-band elicitation | UI showed external origin but lifecycle/correlation/secret handling was under-specified | Added URL/out-of-band elicitation binding, expiry, redirect revalidation, secret-safe logs and return-path authorization |

### v6 audit conclusion

The fourth ten-pass audit still does not require changing the top-level architecture. The remaining improvements close lifecycle and operational safety gaps that become important only after the primary MCP architecture is already mature: secure teardown, reproducible authorization decisions, bounded content handling, emergency containment, rolling-drain semantics, privacy/consent explainability, scalable admin mutation UX, and protocol test oracles.

Before production release, implementation MUST still map these contracts to the exact repository code, database migrations, secret manager, Runner sandbox, queue/outbox, observability stack, supported MCP SDK versions, and tenant policy model actually deployed.

## Appendix F — Fifth Ten-Pass Gap Audit (v7)

This v7 revision performs a fifth independent ten-pass review focused on revocation convergence, replay resistance, provenance, disaster recovery, abuse resistance, lifecycle retirement, operator correctness, privacy erasure, compensation semantics, and failure-invariant testing.

| Pass | Review focus | Gap found | Resolution in v7 |
|---|---|---|---|
| 1 | Revocation convergence | Kill-switch/policy generation existed, but no single monotonic revocation epoch invalidated stale approval/cache/queue state across regions | Added authoritative scoped revocation epoch, region acknowledgement and fail-closed dispatch validation |
| 2 | Cross-region replay | Idempotency/UNKNOWN_OUTCOME existed, but the same approved side effect could be retried through another region without one globally bound execution intent | Added durable `execution_intent_id` bound to actor/capability/revision/args/connection/approval and global replay rejection |
| 3 | Provenance chain | Package scanning/provenance existed as review metadata but was not carried end-to-end into normalized capability and execution evidence | Added source→artifact→revision→discovery→schema→approval→execution provenance/attestation chain |
| 4 | Disaster restore correctness | Backups/index rebuild were specified, but restored services could resume side effects before revocation/secret/projection reconciliation | Added `RESTORE_SAFETY_MODE`, readiness gates, tombstone/revocation replay and UNKNOWN_OUTCOME reconciliation |
| 5 | Abuse resistance | Upstream rate limits/fairness existed without control-plane abuse detection for discovery/OAuth/approval/protocol churn | Added adaptive abuse throttling, enumeration-safe responses, scoped containment and operator UX |
| 6 | Capability retirement | Runtime revision rollout existed, but consumer pinning/deprecation/retirement dependency semantics were incomplete | Added ACTIVE→DEPRECATED→RETIRING→RETIRED lifecycle, impact analysis and no-silent-upgrade rule |
| 7 | Operator UX | Security controls were distributed across pages; incident/restore readiness and dependency impact lacked a unified operational surface | Added containment/restore-safety, dependency-impact and abuse operations UX |
| 8 | Privacy deletion / backups | Deletion/offboarding existed without explicit deletion evidence and backup/tombstone replay semantics | Added deletion ledger, backup-expiry evidence and restore-before-dispatch deletion replay |
| 9 | Compensation safety | Partial success/compensation existed, but compensation idempotency and forward-recovery semantics were incomplete | Added compensation execution-intent/idempotency, eligibility, authorization and UNKNOWN_OUTCOME rules |
| 10 | Test oracle under failure | Golden vectors existed, but distributed security invariants were not forced through fault injection/property tests | Added region partition, projection outage, secret-manager outage, replay, privilege lattice and one-time-consumption invariant tests |

### v7 audit conclusion

The fifth ten-pass audit again preserves the top-level architecture. The new changes close failure-mode gaps that appear only at higher operational maturity: security-critical revocation convergence, cross-region duplicate prevention, verifiable provenance, safe disaster restoration, control-plane abuse protection, explicit capability retirement, and invariant-oriented testing.

As before, repository-to-spec mapping remains necessary before implementation because exact SQL transaction boundaries, cache/index technology, region topology, secret manager, Runner transport, and deployed MCP SDK versions determine the concrete mechanisms used to satisfy these contracts.

## Appendix G — Sixth Ten-Pass Gap Audit (v8)

This v8 revision performs a sixth independent review cycle focused on execution ownership, cache isolation, compatibility downgrade, utility-method completeness, cancellation semantics, concurrent budget correctness, orphan cleanup, telemetry scalability/privacy, dependency readiness, and internal contract evolution. Findings were incorporated directly into normative sections.

| Pass | Review focus | Gap found | Resolution in v8 |
|---|---|---|---|
| 1 | Durable execution ownership | Lease/heartbeat existed without monotonic fencing against zombie Runner/worker after takeover | Added runtime fencing metadata and Section 17.1 lease-fencing requirements/tests |
| 2 | Cache isolation/integrity | Cache scope existed but key/generation invariants were not explicit enough for principal/revision/protocol changes | Hardened cache partition expectations, tests, and acceptance criterion 88 |
| 3 | Protocol negotiation | SDK compatibility fallback could silently weaken a pinned modern installation | Added Section 6.17 minimum-version/fallback policy and downgrade review UX/API |
| 4 | MCP utility completeness | Completion was named as a primitive but had no explicit authorization/trust/bounds contract | Added Section 6.18 completion/argument-suggestion governance |
| 5 | Cancellation/progress | Cancellation existed across several layers without one normalized modern-MCP/Task/job state contract | Added Section 6.19 progress/cancellation normalization and race semantics |
| 6 | Concurrent budget correctness | Budget limits existed without atomic reservation/settlement, allowing read-then-spend oversubscription | Added `mcp_quota_reservations` and Section 16.3 hierarchical reservation/settlement |
| 7 | Crash/leak recovery | Decommission/DR handled planned lifecycle but no general sweeper covered orphan tasks/subscriptions/MRTR/OAuth/temp/Runner state | Added Section 25.2 fenced orphan reconciliation and operator UX |
| 8 | Telemetry scalability/privacy | Tracing existed without a strict bounded-cardinality/sensitive-label contract | Added Section 24.15 telemetry cardinality/privacy budget |
| 9 | Normal cold-start safety | Restore safety covered DR, but ordinary restart could accept side effects before authoritative dependencies were ready | Added Section 24.16 cold-start/dependency readiness barrier |
| 10 | Internal contract evolution | DB migration/version skew existed without explicit versioned event/capability/Runner payload evolution rules | Added Section 7.30 / 26.4 internal schema-event compatibility contract |

**Post-pass consistency fix:** revision metadata in the document header had drifted behind the actual appendix/audit revision. The header is now explicitly v8 so operational documentation, packaged artifact, and audit history identify the same revision.

### v8 audit conclusion

The sixth review again preserves the architecture ownership model. The new changes address race conditions and lifecycle gaps that are easy to miss in a feature-complete design: stale executors, automatic protocol downgrade, cache-boundary correctness, concurrent budget reservation, orphan cleanup, observability-cardinality safety, and normal-start dependency gating.

Before production rollout, repository-to-spec mapping MUST identify the concrete existing `worker_jobs` lease fields, budget/credit ledger transaction boundaries, cache technology/key structure, SDK fallback behavior, reconciliation scheduler, metrics backend, and event-schema compatibility mechanism used to satisfy these contracts.



## Appendix H — Seventh Ten-Pass Gap Audit (v9)

This v9 revision performs a seventh independent ten-pass review focused on delegated identity, pause/resume authorization, side-effect evidence, Runner trust freshness, artifact admission, transport authenticity, retention conflicts, approval/index convergence, anomaly escalation, and test/UX completeness. Findings were incorporated directly into normative sections.

| Pass | Review focus | Gap found | Resolution in v9 |
|---|---|---|---|
| 1 | Delegated identity | Shared/service credentials could blur requester, Agent, execution principal, credential owner and external account | Added principal-chain metadata and delegation/service-principal authorization intersection |
| 2 | Long-lived pause/resume | MRTR/Tasks/jobs correlated resume state but did not explicitly require full current authorization/trust/budget revalidation at every resume boundary | Added Section 12.14 resume-time revalidation and stale-resume UX/errors/tests |
| 3 | Side-effect evidence | Idempotency/UNKNOWN_OUTCOME existed without a durable provider effect/postcondition receipt | Added `mcp_effect_receipts`, verification/reconciliation API/UX and compensation linkage |
| 4 | Runner trust decay | Runner authentication/optional attestation existed without explicit expiry/freshness semantics for privileged execution | Added Section 18.6 trust freshness/posture decay and dispatch revalidation |
| 5 | Artifact lifecycle | Untrusted results/scanning existed, but MCP-produced files lacked one quarantine→Library→RAG admission contract and lineage model | Added `mcp_artifact_lineage`, intake pipeline, quarantine/provenance UX/API/tests |
| 6 | Transport authenticity | SSRF/URI controls covered destination safety but TLS peer/server authenticity and enterprise mTLS/trust-anchor policy were incomplete | Added Section 14.14 TLS/server-authenticity contract |
| 7 | Retention conflict | Privacy deletion acknowledged retention exceptions but did not explicitly separate held evidence from executable authorization | Added retention-hold precedence/non-executable history contract and UX/evidence requirements |
| 8 | Approval-to-search convergence | Outbox/projection safety existed, but approval success did not explicitly guarantee approved snapshot indexing without a new discovery pass | Added read-your-writes/projection convergence contract, UX/API/SLO and tests |
| 9 | Anomaly escalation | Abuse throttling existed without a graduated escalation contract resistant to attacker-triggered victim lockout | Added scoped anomaly escalation/decay/human-review rules |
| 10 | Test and operator completeness | New delegation/resume/effect/artifact/TLS/retention behaviors lacked explicit end-to-end acceptance coverage | Added dedicated test groups, normalized failure states, API/UI surfaces and Acceptance Criteria 94–103 |

### v9 audit conclusion

The seventh review does not change the top-level ownership model: LangGraph remains System Orchestrator, OpenAI Agents SDK remains Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.

The principal improvements close subtle production gaps between **authorization and identity**, **pause and resume**, **dispatch and externally observable effect**, and **approved data versus safe data**. They also make the control plane friendlier to operators by providing explicit propagation/read-your-writes state rather than forcing rediscovery or guessing whether an approval “took.”


## Appendix I — Eighth Ten-Pass Gap Audit (v10)

This v10 revision performs an eighth independent ten-pass review focused on internal consistency and mature-system failure modes after the previous hardening cycles.

| Pass | Review focus | Gap found | Resolution in v10 |
|---|---|---|---|
| 1 | Entity lifecycle correctness | Lifecycle snippets existed across sections but there was no single canonical transition-guard contract | Added Section 7.36 canonical lifecycle state machines and authoritative transition guards |
| 2 | Referential integrity | Decommission/tombstones existed but broad cascades and dangling/cross-tenant relationships were not explicitly prohibited | Added Section 7.37 referential integrity/tombstone/non-destructive cascade requirements |
| 3 | Retry ownership | Backoff/idempotency existed without one owner per failure domain, allowing nested retry amplification | Added Section 16.4 retry ownership, attempt lineage and inherited retry budget |
| 4 | Policy conflict resolution | Permission intersection was explicit, but DLP/residency/budget/emergency/runtime policy precedence was not globally defined | Added Section 12.15 unified policy precedence/composition and monotonicity tests |
| 5 | Protocol forward compatibility | New/unknown fields/extensions/enums lacked a preserve/ignore/fail-closed strategy | Added Section 6.20 forward-compatibility and unknown-semantics rules |
| 6 | Secret cryptographic lifecycle | KMS/envelope encryption existed without explicit key-version/rewrap/cryptographic-erasure behavior | Added Section 13.6 key versioning, rewrap, environment binding and decrypt-failure semantics |
| 7 | Multi-region split brain | Residency/failover existed without explicit authoritative write ownership during partition/failover | Added Section 24.0 regional write authority and split-brain prevention |
| 8 | Forensic/operator evidence | Audit integrity existed but operators lacked a bounded, verifiable incident-evidence export contract | Added Section 24.21 evidence bundle/chain-of-custody export |
| 9 | Rollback safety | Expand/migrate/contract existed without an explicit irreversible-migration barrier and rollout classification | Added Section 26.7 rollback guarantees and irreversible-migration barrier |
| 10 | Test/acceptance closure | New lifecycle/retry/policy/secret/region/evidence guarantees lacked dedicated test or acceptance coverage | Added v10 test groups and Acceptance Criteria 104–113 |

### v10 audit conclusion

The eighth review still does not require changing the top-level ownership model. The meaningful remaining gaps were cross-cutting **consistency contracts**: who owns a retry, which state transition is authoritative, how heterogeneous policies compose, how a future protocol value is handled, how region failover avoids split brain, and what exactly makes rollback or forensic evidence trustworthy.

Before implementation, repository-to-spec mapping MUST identify the concrete authoritative database/transaction boundaries, existing retry middleware, policy evaluator, KMS/secret manager, region topology, schema migration framework, audit store, and SDK adapter behavior used to satisfy these v10 contracts.

## Appendix J — Ninth Ten-Pass Gap Audit (v11)

This v11 revision performs a ninth independent ten-pass review focused on security-canonicalization correctness, parameterized primitive safety, upstream-fleet consistency, probe safety, supply-chain identity continuity, HTTP proxy trust, data-minimization, secure defaults, distributed event ordering, and implementation traceability.

| Pass | Review focus | Gap found | Resolution in v11 |
|---|---|---|---|
| 1 | Security binding determinism | Approval/idempotency/provenance hashes referred to normalized values but did not define one cross-language canonical byte representation | Added Section 6.21 canonical security serialization/hash-version contract |
| 2 | Parameterized MCP primitives | Resources/templates/prompts/completion existed without one post-expansion SSRF/authorization/secret-insertion contract | Added Section 6.22 resource-template and prompt-argument expansion safety |
| 3 | Load-balanced upstream correctness | One remote URL could front incompatible MCP instances/catalogs and the spec lacked explicit fleet-consistency/flapping behavior | Added Section 6.23 upstream fleet consistency/catalog-flapping detection |
| 4 | Health-check side effects | Health loop was protocol-safe but did not normatively prohibit using arbitrary business tools as synthetic probes | Added Section 15.2 side-effect-free health/synthetic probe contract |
| 5 | Publisher continuity | Supply-chain provenance existed but package/domain/account ownership transfer or namespace takeover could still appear continuous by name | Added Section 14.17 registry/publisher continuity and takeover defense |
| 6 | Reverse-proxy trust | Modern MCP header routing existed without a full ingress header-stripping/request-smuggling trust contract | Added Section 14.18 reverse-proxy/header-trust and HTTP desync defenses |
| 7 | Non-secret sensitive egress | DLP focused on secrets/sensitive scanning but did not require minimum-necessary, purpose/destination-aware disclosure manifests | Added Section 14.19 purpose-bound data-egress manifest |
| 8 | Safe initial deployment | Many controls were configurable but omission could leave an ambiguous deployment posture | Added Section 14.20 secure default production profile |
| 9 | Distributed audit ordering | Trusted time/clock skew existed but wall-clock timestamps alone were still insufficient for causal ordering across regions/retries | Added Section 24.22 causal audit ordering/event sequencing |
| 10 | Spec-to-code verification | Acceptance coverage was extensive but the large spec lacked a normative requirement→owner→test traceability gate | Added Section 27.1 traceability/spec-lint requirements and Acceptance Criteria 114–123 |

### v11 audit conclusion

The ninth review again does not change the ownership architecture: LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.

The principal new hardening areas are **deterministic security bindings**, **post-expansion revalidation**, **trust continuity across a load-balanced/supply-chain environment**, **safe operations that cannot create hidden side effects**, **data minimization beyond secret scanning**, and **traceability so a 6k+ line specification remains verifiably implementable rather than merely comprehensive**.

## Appendix K — Tenth Ten-Pass Gap Audit (v12)

This v12 revision performs a tenth independent ten-pass review focused on bounded discovery at scale, dependency correctness, unattended automation drift, credential-scope drift, critical-change governance, external privacy boundaries, distributed rate-limit behavior, MCP-to-RAG derived-data correctness, post-install supply-chain revocation, and privileged-session freshness. Findings were incorporated directly into normative sections.

| Pass | Review focus | Gap found | Resolution in v12 |
|---|---|---|---|
| 1 | Catalog scale | Pagination was bounded, but a server could still expose an effectively unbounded total catalog/index workload | Added Section 6.24 total discovery cardinality/byte/page/work budgets and incomplete-catalog semantics |
| 2 | Capability dependencies | Retirement impact existed without one authoritative typed dependency graph/cycle/compatibility contract | Added Section 7.38 dependency graph, immutable bindings, cycle detection, required/optional constraints |
| 3 | Scheduled automation | Setup preflight/service-principal rules existed but future unattended runs could outlive consent/schema/account/policy state | Added Section 12.16 per-run automation revalidation and drift pause semantics |
| 4 | Credential scope drift | OAuth lifecycle existed without a dedicated contract for upstream role/scope/account drift and no-fallback behavior | Added Section 13.7 authorization-scope drift/account rebinding/mid-run revalidation |
| 5 | Critical admin changes | Break-glass was audited, but high-impact normal changes lacked optional proposer/approver separation | Added Section 14.21 dual-control/four-eyes governance |
| 6 | External privacy boundary | Internal deletion was strong but could be misunderstood as erasing data already persisted by external providers | Added Section 14.22 external-erasure boundary and unresolved-obligation evidence |
| 7 | Distributed rate limits | Retry-After/jitter existed but shared normalization/clamping/herd prevention across gateway instances was incomplete | Added Section 16.5 normalized shared rate-limit state and stampede controls |
| 8 | MCP-to-RAG lifecycle | Resource/artifact indexing had provenance but no full authoritative ACL/freshness/deletion projection contract | Added Section 24.23 RAG ACL/lineage/query-time revocation/purge reconciliation |
| 9 | Post-install supply chain | Initial scanner/provenance existed without ongoing advisory/key/package revocation impact propagation | Added Section 14.23 supply-chain advisory ingestion, impact mapping and quarantine/revocation behavior |
| 10 | Privileged session drift | API auth existed, but stale management sessions/tabs needed explicit mutation-time freshness/step-up rules | Added Section 12.17 privileged session freshness, UI/API conflict behavior, tests and AC 124–133 |

### v12 audit conclusion

The tenth review still preserves the core ownership model: LangGraph is the System Orchestrator, OpenAI Agents SDK is the Cognitive Executor, SmartAIHub Capability Registry/Gateway is the governed capability boundary, and `worker_jobs` remains durable execution truth.

The remaining gaps were primarily **long-lived state drift** problems: catalogs can grow after installation, dependencies can become unsatisfied, automations can outlive their consent, OAuth/account roles can change upstream, trusted packages can become vulnerable later, RAG copies can outlive source access, and administrator browser sessions can outlive their authorization. v12 makes those time-dependent transitions explicit instead of treating configuration-time checks as permanently valid.

## Appendix L — Eleventh Ten-Pass Gap Audit (v13)

This v13 revision performs an eleventh independent ten-pass review focused on execution-secret minimization, transport-state isolation, protocol correlation identity, unattended-run overlap, human-approval fidelity, local runtime capacity, browser-side data handling, operational data scale, explicit threat boundaries, and final cross-layer verification. Findings were incorporated directly into normative sections rather than left as TODOs.

| Pass | Review focus | Gap found | Resolution in v13 |
|---|---|---|---|
| 1 | Credential exposure | Credential storage/encryption was mature, but execution still lacked a preferred secretless/JIT path when providers can mint short-lived grants | Added Sections 7.44 and 13.8 for ephemeral credential leases, workload identity/token exchange patterns and no-bearer-state rules |
| 2 | HTTP transport reuse | Pooling/keep-alive had no explicit isolation key or socket/FD quotas, risking mutable middleware/header/account bleed | Added Section 14.24 transport-pool partitioning, per-request immutable headers, cookie policy and resource quotas |
| 3 | Protocol correlation identity | External JSON-RPC IDs could be mistaken for internal trace/idempotency/execution identities | Added Section 6.25 opaque request-ID mapping/collision contract and fuzz coverage |
| 4 | Scheduled automation concurrency | Per-run authorization existed but overlapping triggers had no canonical skip/queue/coalesce/serialize semantics | Added `mcp_automation_execution_guards` and Section 12.18 overlap policy/admission contract |
| 5 | Human approval correctness | Hash binding existed but authoritative UI rendering and multi-device approve/reject races were under-specified | Added Section 12.19 canonical display fidelity, LLM-summary separation and terminal CAS semantics |
| 6 | Runner finite capacity | Runner concurrency existed without durable/fenced claims for GPU/VRAM/port/process/model-slot resources | Added `mcp_runtime_resource_claims`, Sections 16.6/18.7 and resource-capacity UX/API |
| 7 | Browser-sensitive state | Backend secrets were protected, but privileged UI payload/cache/session-replay/local-storage handling was not normative | Added Section 14.25 and UI 22.80 browser cache/storage/telemetry/stale-tab requirements |
| 8 | Operational data scale | High-volume audit/event/progress/history tables had retention concepts but no explicit partition/query/archival safety contract | Added Section 24.25 bounded operational-store lifecycle and query safety |
| 9 | Threat-model completeness | Numerous controls existed without one explicit attacker/trust-boundary register linked to verification | Added Section 14.26 versioned threat model and boundary/control/test mapping gate |
| 10 | Cross-layer closure | New v13 behaviors needed concrete UI/API/observability/error/test/acceptance closure | Added UI 22.76–22.80, API 23.42–23.44, observability 24.26, error codes, v13 tests and Acceptance Criteria 134–143 |

### v13 audit conclusion

The eleventh review still preserves the ownership architecture: LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.

The remaining meaningful gaps were no longer basic MCP features; they were **cross-layer leakage/race/scale boundaries**: reusable credential exposure when JIT identity is possible, stateful HTTP-client reuse, protocol-ID confusion, overlapping unattended triggers, approval-display races, finite local capacity, browser caching/telemetry, high-volume operational storage, and the absence of one explicit threat-model register. v13 closes those gaps without introducing a second scheduler, permission system, secret store, or job source of truth.

## Appendix M — Twelfth Ten-Pass Gap Audit (v14)

This v14 revision performs a twelfth independent ten-pass review focused on parser determinism, persistence-level tenant isolation, model-facing tool projection, model-provider schema limits, secret-bearing transport configuration, local package installation safety, localhost endpoint identity, automation owner lifecycle, rate-limit/breaker isolation, and effective-argument/default semantics. Findings were incorporated into normative sections and verification gates.

| Pass | Review focus | Gap found | Resolution in v14 |
|---|---|---|---|
| 1 | Parser determinism | JCS/hash versioning existed, but duplicate JSON keys, malformed Unicode and exact large-number interoperability still depended too much on parser behavior | Added Section 6.26 strict JSON profile, duplicate-key rejection, numeric/Unicode limits and golden vectors |
| 2 | Persistence tenant isolation | Application/policy ownership existed, but cross-tenant relationship integrity needed stronger database-enforced invariants | Added Section 7.47 composite scope constraints/RLS defense-in-depth and cross-tenant migration/restore tests |
| 3 | Model-facing tool identity | Canonical capability identity existed, but direct model tool names could collide with reserved SmartAIHub tools/provider naming limits | Added Sections 9.2 and 19.1 model-facing aliases with run-scoped canonical mapping |
| 4 | Model schema/context limits | Top-K candidate limiting did not bound schema token cost or prevent provider schema translation from weakening constraints | Added Sections 9.2/19.2 exposure budget, translation classification and server-authoritative validation |
| 5 | Secret-bearing transport config | OAuth credentials were governed, but custom headers/proxies/private CA/mTLS settings lacked one scoped secret/profile contract | Added `mcp_transport_profiles`, Section 13.9 and transport-profile UI/API/rotation rules |
| 6 | Local package installation | Runtime sandbox existed, but installation/package-manager lifecycle hooks themselves were not treated as privileged code execution | Added Section 18.8 staged installer sandbox, network/hook/secret restrictions and atomic promotion/rollback |
| 7 | Localhost endpoint identity | Port/resource claims existed, but a reachable loopback port could still be impersonated by another local process | Added Section 18.9 process-bound local endpoint handshake/credential and loopback trust rules |
| 8 | Automation owner lifecycle | Per-run automation revalidation existed without explicit owner departure/orphan/transfer semantics | Added Section 12.20 owner/custodian/execution-principal lifecycle and transfer revalidation |
| 9 | Breaker/throttle isolation | Fair queues existed, but a broad server circuit/rate state could over-block healthy accounts when the provider limits narrowly | Added Section 16.7 scoped breaker/throttle dimensions, bulkheads and starvation bounds |
| 10 | Effective argument/default semantics | Approval distinguished omitted fields but did not fully define client/server default materialization and UI binding | Added Section 12.21 effective-argument/default contract, UI 22.85, tests and Acceptance Criteria 144–153 |

### v14 audit conclusion

The twelfth review does not change the primary architecture: LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.

The remaining gaps were concentrated at **translation and boundary seams**: raw JSON into canonical security state, tenant IDs into relational joins, canonical MCP capabilities into model-provider tool APIs, secret configuration into transport clients, install artifacts into trusted local runtimes, loopback ports into process identity, human ownership into unattended automation, and provider rate-limit semantics into shared queues. v14 makes those seams explicit so implementations cannot rely on parser defaults, model-provider behavior, localhost assumptions, or application-only tenant checks.



## Appendix N — Thirteenth Ten-Pass Gap Audit (v15)

This v15 revision performs a thirteenth independent ten-pass review focused on bearer-like task state, long-lived subscription correctness, runtime output-contract drift, audience-specific data disclosure, stdio/process containment, deferred external-reference safety, policy rollout simulation, portable configuration, post-hoc cost reconciliation, and final cross-layer verification.

| Pass | Review focus | Gap found | Resolution in v15 |
|---|---|---|---|
| 1 | Upstream task security | Task IDs were treated mainly as correlation values even though extension task handles may expose stored state if leaked or replayed | Added Section 6.27 task-handle confidentiality, scope binding, no-enumeration and protected logging/storage rules |
| 2 | Subscription lifecycle | Listener reconnect existed but acknowledgement timeout, bounded lifetime, overlap/dedup and notification-flood reconciliation were under-specified | Added Section 6.28 plus `mcp_subscription_leases`, UI/API/metrics and failure tests |
| 3 | Runtime result contract | Discovery/schema drift was strong, but actual returned output was not normatively checked against the exact approved output contract on every execution | Added Section 6.29 and `mcp_result_contract_observations` with drift/degraded/UNKNOWN_OUTCOME behavior |
| 4 | Result least disclosure | DLP/sanitization existed without one explicit per-audience projection boundary for model vs user vs audit vs RAG vs downstream capability | Added Section 14.27 audience-specific result projection |
| 5 | stdio framing | Local process supervision existed, but stdout protocol framing vs stderr diagnostics and I/O backpressure were not explicit invariants | Added Section 18.10 stdio framing/log separation and bounded I/O rules |
| 6 | Child-process inheritance | Installer/runtime sandboxing existed without one explicit allowlisted environment/FD/IPC inheritance and process-tree containment contract | Added Section 18.11 child-process environment/handle/process-tree containment |
| 7 | Deferred external references | URL/SSRF/artifact controls existed, but short-lived signed URLs returned by tools/resources could expire or redirect after approval | Added Section 14.28 dereference-time revalidation, no blind side-effect replay and provenance rules |
| 8 | Policy rollout safety | Dry-run existed for bulk mutations, but policy changes lacked historical/synthetic shadow evaluation with zero external side effects | Added Section 12.22 policy shadow evaluation and UI/API/tests |
| 9 | Configuration portability | Backup/migration existed, but there was no explicit secret-free environment-remappable export/import contract for tenant/operator workflows | Added Section 26.9 and UI/API portable manifest rules |
| 10 | External cost settlement | Admission budgets/reservations existed, but delayed provider-reported usage/refunds/duplicates needed a durable post-hoc reconciliation contract | Added Section 6.30, `mcp_external_usage_reconciliation`, APIs/metrics/tests and AC 163 |

### v15 audit conclusion

The thirteenth review still does not change the ownership architecture: LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.

The remaining gaps were concentrated in **long-lived and deferred boundaries**: task handles that outlive the original request, subscription streams that outlive one gateway process, runtime outputs that can drift after catalog approval, results disclosed to multiple audiences, local child processes that inherit more state than intended, signed references dereferenced after approval, policies promoted after simulation, portable configuration crossing environments, and provider usage arriving after the capability call completed. v15 makes those boundaries explicit without introducing a second scheduler, job store, secret store, or accounting ledger.

## Appendix O — Fourteenth Ten-Pass Gap Audit (v16)

This v16 revision performs a fourteenth independent ten-pass review focused on upstream hint trust, sender-constrained authorization, browser-origin mutation protection, software supply-chain evidence, active-content integrity, MCP-to-RAG instruction isolation, in-flight revocation, cognitive provider failover, security-critical localization, and final cross-layer closure.

| Pass | Review focus | Finding | Resolution in v16 |
|---|---|---|---|
| 1 | MCP annotation semantics | Risk classification stored read/destructive claims but did not explicitly prevent untrusted `ToolAnnotations` from weakening risk/retry policy | Added Section 11.2, annotation fields/source semantics, API/UI/tests and AC 164 |
| 2 | High-risk credential replay | JIT credentials/mTLS existed, but no generic sender-constrained credential contract prevented silent fallback to replayable bearer mode where upstream supports proof-of-possession | Added Section 13.10, credential metadata, rotation/replay rules and AC 165 |
| 3 | Browser mutation boundary | Sensitive UI caching was covered, but CSRF/CORS/SameSite/clickjacking/origin behavior for management/OAuth mutations was not one normative boundary | Added Section 14.29, browser integration tests and AC 166 |
| 4 | Supply-chain evidence depth | Scanners/advisories/provenance existed without a normalized SBOM/VEX/transitive build-evidence record linked to immutable runtime digest | Added `mcp_supply_chain_evidence`, Section 14.30, UI/API/test coverage and AC 167 |
| 5 | Active-content identity | File scanning/sanitization existed, but declared MIME/extension mismatch and polyglot/active-content handling were not explicit | Added Section 14.31 and AC 168 |
| 6 | RAG instruction boundary | Resource contents were generally untrusted, but MCP-to-RAG lineage lacked explicit source-trust/instruction-isolation controls at model context assembly | Extended `mcp_rag_lineage`, added Section 14.32/UI/API/tests and AC 169 |
| 7 | Mid-flight revocation | Dispatch-time revocation was strong, but a side effect already in flight needed explicit cancellation, late-result and UNKNOWN_OUTCOME semantics | Added Section 16.8, APIs/UI/fault tests and AC 170 |
| 8 | Cognitive provider failover | Tool schema translation existed, but model/provider failover could change alias/schema/context constraints without a formal projection generation boundary | Added Section 19.3, diagnostics/tests and AC 171 |
| 9 | Security localization | UI was localization-ready, but translated high-risk copy lacked an explicit canonical-facts/fallback/bidi fidelity contract | Added Section 22.92 and AC 172 |
| 10 | Cross-layer closure | New v16 contracts required normalized errors, observability, APIs, DoD and traceable test evidence | Added Sections 23.54–23.58, 24.29, 25.6, v16 tests, DoD items and AC 173 |

### v16 audit conclusion

The fourteenth review does not alter the primary ownership architecture: **LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the default Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.**

The new findings are boundary hardening rather than a redesign: upstream-declared safety hints must not become trusted policy, browser ambient authority must not mutate the MCP control plane cross-site, build evidence must follow the exact runtime artifact, external resources must remain data when admitted to RAG, revocation must have meaningful behavior after dispatch, and cognitive provider failover must not reconstruct or replay side effects from model prose.

## Appendix P — Fifteenth Ten-Pass Gap Audit (v17)

This v17 revision performs a fifteenth independent ten-pass review focused on actual wire behavior versus SDK configuration, task-extension compatibility, subscription delivery semantics, sensitive MRTR input, stateless per-request capability advertisement, extension lifecycle governance, SDK abstraction loss, runtime feature attestation, general explicit state handles, and protocol deprecation operations.

| Pass | Review focus | Gap found | Resolution in v17 |
|---|---|---|---|
| 1 | SDK vs actual wire revision | Installed/current SDK version could appear modern while its default adapter still emitted an older wire era | Added Section 6.31, persisted wire attestation fields, readiness/CI probes, UI/API/tests and AC 174 |
| 2 | Tasks execution compatibility | Tasks lifecycle existed without normalizing per-tool `execution.taskSupport` against the separately negotiated extension | Added Section 6.32, tool fields, extension/runtime compatibility checks, tests and AC 175 |
| 3 | Subscription event semantics | Listener lifecycle was hardened but notifications could still be misread as a complete ordered event ledger | Added Section 6.33 level-trigger/invalidation semantics, freshness UX/metrics/tests and AC 176 |
| 4 | MRTR sensitive input | `input_required` forms lacked one normative field-classification boundary preventing secrets from ordinary Chat/model context | Added Section 6.34, secure MRTR UX/API/error/tests and AC 177 |
| 5 | Per-request capabilities | Stateless request capabilities were described but not constrained to least/actual runtime support instead of a global superset | Added Section 6.35, capability-advertisement integrity tests and AC 178 |
| 6 | Extension maturity/version | Core revision and extension maturity/version were not modeled as independent compatibility axes | Added Section 6.36 plus `mcp_extension_profiles`, UI/API/tests and AC 179 |
| 7 | SDK abstraction loss | High-level SDKs can consume/hide result/cache/meta wire members required by a gateway, but adapter equivalence was not explicit | Added Section 6.37, wire-metadata conformance requirements and AC 180 |
| 8 | Runtime feature evidence | Version skew existed without one machine-readable, tested feature matrix across Gateway/Runner/sidecar paths | Added Section 6.38 plus `mcp_runtime_feature_attestations`, UI/API/tests and AC 181 |
| 9 | General explicit state handles | Tasks/requestState were protected, but arbitrary tool-produced continuation handles could still act as bearer state | Added Section 6.39 plus `mcp_opaque_state_handles`, APIs/tests and AC 182 |
| 10 | Protocol feature deprecation | Capability retirement existed, but MCP protocol-feature/transport deprecations lacked an operational inventory/calendar/release gate | Added Section 6.40 plus `mcp_protocol_feature_inventory`, migration UI/API/tests and AC 183 |

### v17 audit conclusion

The fifteenth review again preserves the ownership architecture: **LangGraph remains the System Orchestrator, OpenAI Agents SDK remains the default Cognitive Executor, SmartAIHub Capability Registry/Gateway remains the governed capability boundary, and `worker_jobs` remains durable execution truth.**

The new findings close **protocol-realization gaps** rather than adding another subsystem. A production gateway must prove the wire it actually emits, distinguish core MCP support from extension support, treat notifications as convergence hints rather than an event ledger, keep secret MRTR fields out of model context, advertise only capabilities the current request/runtime can fulfill, survive SDK abstraction differences, protect general explicit state handles, and actively manage protocol deprecations instead of discovering them during an outage or SDK upgrade.

## Appendix Q — Sixteenth Ten-Pass Gap Audit (v18 Cross-Spec Alignment)

This v18 revision starts from the full Spec 199 v17 baseline and merges the normative Spec 199↔200 Cross-Spec Alignment Contract plus Spec 200 Revision 4. It does **not** replace v17 with the older alignment-reference copy and does not remove any v17 MCP protocol/security/runtime hardening.

| Pass | Review focus | Gap found | Resolution in v18 |
|---|---|---|---|
| 1 | Spec ownership / companion relationship | Spec 200 was not declared in the live v17 metadata/ownership model, creating ambiguity over External Agent vs External MCP responsibilities | Added companion-spec metadata, canonical ownership table, shared-infrastructure terminology and contract versions |
| 2 | Top-level orchestration branching | v17 architecture showed MCP path but not the sibling External Agent Runtime branch | Updated Section 4 diagram to branch Capability Resolver into Spec 199 MCP and Spec 200 External Agent Gateway under one LangGraph path |
| 3 | External Agent → MCP governance | Existing v17 said external agents cannot bypass ACL but did not encode the full Spec 200 route as a normative cross-spec flow | Added Section 4.2 and 19.4: External Agent → Capability Gateway → Spec 199 → approved upstream; direct upstream/credential bypass prohibited |
| 4 | Runner duplication risk | v17 MCP Runner model was strong but did not state that Agent Runtime Core shares the same device identity/control connection/snapshot | Added Section 4.4 and 18.12 unified Runner sibling-module architecture and explicit no-second-registry/channel rule |
| 5 | Durable state vs realtime transport | v17 preserved `worker_jobs` truth but did not explicitly align Spec 200's realtime channel semantics | Added Sections 4.5 and 17.2 separating durable `worker_jobs` from shared Runner realtime transport and aligning retry/reconciliation/fencing |
| 6 | Capability discovery duplication | v17 normalized MCP into Capability Registry but lacked the Spec 200 canonical operation names and no-second-Skill-registry invariant | Added Sections 4.3/8.1 and API mappings for `capability.search/describe/invoke/status/result`, plus shared exposure budget |
| 7 | Retrieval/RAG duplication | MCP RAG lineage existed but Spec 200 consumption path was not normative in live v17 | Added Sections 4.6/8.2: External Agent Context Adapter is a façade over shared Retrieval Broker; MCP lineage/revocation remains Spec 199-governed |
| 8 | Approval/audit/trace/asset contract split | v17 had mature per-MCP contracts but no single Spec 199↔200 common-domain declaration | Added Sections 4.7/4.8/24.31 with shared approval domains, trace IDs, retry/lease/fencing semantics and canonical AssetRef/ArtifactRef |
| 9 | API/UI/migration consistency | Architecture alignment alone would leave developer-facing API names, UI ownership and prototype migration ambiguous | Added Section 22.101, API contract mappings, Section 26.10 migration gate and cross-spec DoD requirements |
| 10 | Release/test completeness | No live-v17 release gate proved that an external agent could invoke both Skill and MCP through one Runner/control/job/retrieval/approval architecture | Added Section 27.2 full integration + negative-bypass tests and Acceptance Criteria 184–195 |

### v18 alignment conclusion

The merge keeps all Spec 199 v17 MCP hardening intact while making Spec 199 and Spec 200 Revision 4 one architecture:

```text
LangGraph / Retrieval Broker / Capability Registry / Approval / Audit / Runner Control / worker_jobs
                               = shared infrastructure

Spec 199 = External MCP Gateway
Spec 200 = External Agent Gateway
```

No new parallel source of truth is introduced. Future changes to one spec that touch shared contracts require cross-spec compatibility review against the five `SAH-*` internal contract versions.

## Codebase Alignment Baseline — 2026-09-17

This is the target Spec 199 contract. The repository contains a meaningful MCP
foundation, but it does not yet prove that the full External MCP Gateway and
upstream-management surface is implemented. Existing evidence is classified
below so implementation planning cannot mistake a related adapter for the full
target.

| Contract area | Current repository evidence | Alignment status |
|---|---|---|
| Hosted SmartAIHub MCP protocol | `apps/web/server/_core/mcpRegistry.ts`, `mcpRoutes.ts`, `mcpPublicServer.ts`, `mcpOAuthServer.ts` | Existing inbound/hosted MCP surface; not proof of the full outbound multi-upstream Gateway |
| MCP provider/connection persistence | `mcpProviderTemplates`, `userMcpConnections`, `mcpConnectionGroupShares`, `mcpToolSchemaCache`, `mcpConnectionUsageEvents`, `mcpMediaTasks` in `apps/web/drizzle/schema.ts` | Reusable partial foundation; Spec 199 MUST map/extend these records and MUST NOT create duplicate server/connection truth |
| Tenant MCP server registry | `mcpServers` and `mcpServerAssignments` in `apps/web/drizzle/schema.ts`, `mcpServers` router | Existing tenant registry/assignment surface; its physical tables are canonical candidates for any Spec 199 server-definition extension |
| MCP UI | `Settings.tsx`, `McpConnectPanel.tsx`, `McpServersSettingsPanel.tsx`, `McpServerManager.tsx`, `ConnectedDevicesPanel.tsx`; routes include `/admin/mcp-servers`, `/mcp/pairing/approve`, `/workers/connect` | Existing partial user/admin/device UX; the proposed role-specific MCP Center, quarantine/review, policy and activity surfaces remain target work |
| MCP execution adapters | Python `mcp_client.py`, `mcp_executor.py`, Web MCP registry/routes and media adapters | Existing narrow/internal and hosted integrations; no complete Spec 199 upstream lifecycle, schema quarantine, capability projection and revocation system was found |
| Durable execution | Feature 186 `worker_jobs`, events, attempts, outbox, dispatches and provider reservations plus Feature 195 contracts | Shared canonical execution truth; Spec 199 MUST use it for long-running/retryable MCP work |
| Runner/local MCP | Worker App/Tauri control/MCP runtime foundations and Feature 197 Runner target | Shared Feature 197 boundary; Spec 199 owns an MCP Runtime Manager module only, not another device registry or control channel |
| External Agent integration | `internal_openai_agents_runtime.py`, Web Agent Runtime services and `external_agent_task` scheduling paths | Existing agent building blocks; Spec 200 remains the owner of external-agent adapters and Spec 199 supplies governed MCP capabilities |
| Shared `SAH-*` contracts | The five identifiers are introduced by the 199/200 target contract; no matching runtime contract-version implementation was found in the current code audit | Compatibility identifiers only until 195–200 adapters, mixed-version tests and rollback evidence are implemented |
| Spec 199 target persistence/API | Many target `mcp_*` tables and `/api/mcp/*` routes in this document have no exact current physical/service equivalent | Target work; every new table/route requires equivalence, tenant/auth, migration, rollback and cross-spec impact review |

### Cross-Spec 195–200 Ownership and Non-Overlap

The six specifications form one dependency direction. They are not six
independent platforms:

| Spec | Single canonical responsibility | MUST NOT own or duplicate |
|---|---|---|
| Feature 195 | Durable `worker_jobs` execution state, attempts, outbox/dispatch, leases/fencing, provider admission and settlement evidence | Goal/Plan semantics, Chat UI, Runner device registry, MCP upstream registry, External Agent provider sessions |
| Feature 196 | Goal/Intent/Plan, capability resolution, solution selection and Universal Command Gateway semantics | Durable Job state machine, Chat product UI, MCP transport, provider-specific External Agent runtime |
| Feature 197 | Runner/device identity, local capability discovery, Runner Control Channel, local execution and provenance | New Job truth, MCP upstream governance, External Agent provider adapters, direct user authorization |
| Feature 198 | SmartAIHub Chat, Universal Assistant Launcher/Side Panel, page context and evolution/evaluation product behavior | Backend orchestration source of truth, direct Runner commands, separate MCP/Agent control plane |
| Feature 199 | External MCP upstream registration, lifecycle, protocol/OAuth, schema/risk/quarantine, governed MCP invocation and MCP lineage | Goal orchestration, external-agent runtime, separate Runner/device registry, separate Job/RAG/approval/asset/billing systems |
| Feature 200 | Delegated External Agent adapters, provider sessions/events/results and Agent Runtime Core | Arbitrary upstream MCP transport, separate Skill/RAG/Runner/Job/approval systems, global replacement of OpenAI Agents SDK |

Canonical flow:

```text
Feature 198 Chat / Assistant UI
        -> Feature 196 Goal/Plan + LangGraph orchestration
        -> shared Capability Resolver / Approval / Retrieval / Asset policy
        -> Feature 199 MCP Gateway OR Feature 200 External Agent Gateway
        -> Feature 195 worker_jobs for durable work
        -> Feature 197 Runner when local execution is selected
        -> result/provenance back to Feature 198
```

The `SAH-EXEC-1`, `SAH-CAP-1`, `SAH-RUNNER-1`, `SAH-CONTEXT-1` and
`SAH-ASSET-1` contracts are compatibility identifiers, not permission to create
parallel implementations. Existing legacy identifiers or compatibility code in
the repository are not implementation evidence for these features and require
a separately authorized removal/migration audit.

## Problem

SmartAIHub has hosted MCP, provider connections, MCP registry and local runtime
building blocks, but lacks one governed outbound upstream-management layer with
schema quarantine, capability projection, approval, revocation and durable
long-running execution aligned to the rest of the platform.

## Solution

Implement Spec 199 as the single External MCP Gateway behind Feature 196's
Capability Resolver. Reuse Feature 195 execution truth, Feature 197 Runner
identity/control, Feature 198 Chat/Assistant approval surfaces, and shared
Retrieval/Asset/Audit/Billing services. Keep external-agent delegation in
Feature 200 and route its MCP requests back through this gateway.

## Requirements

The implementation must provide upstream registration, connection lifecycle,
lazy discovery, protocol/version negotiation, tenant and principal-aware ACL,
schema/risk/quarantine review, secret isolation, bounded retries, result and
asset provenance, long-running task reconciliation, revocation, telemetry,
role-appropriate UI and cross-spec compatibility tests.

## Architecture

Feature 199 owns only the MCP upstream boundary. LangGraph/Feature 196 decides
the plan, the shared Capability Gateway authorizes the capability, Feature 199
executes MCP protocol work, Feature 195 persists durable execution, and Feature
197 handles local MCP runtime processes. Feature 200 may consume the capability
but cannot bypass Feature 199.

## Implementation

Current MCP registry, OAuth, provider-connection, schema-cache, media-task and
UI components are partial foundations. The full Gateway, target persistence,
role-specific management surfaces and upstream lifecycle remain implementation
work. Existing physical tables must be inspected before any migration is added.

## Assumptions

MCP upstreams are untrusted integrations, protocol delivery is at-least-once,
credentials are resolved through approved secret flows, and user-visible
orchestration enters through Feature 198/196 while internal capability calls may
use the same shared gateway.

## Constraints

No duplicate Job, Runner, Capability, Retrieval, Approval, Asset, Billing or
secret system; no client-supplied tenant authority; no raw credentials in model
context; no unbounded discovery/retry; and no retired execution system.

## Risks

Key risks are malicious or drifting upstream schemas, confused-deputy access,
credential leakage, duplicate side effects, oversized discovery, stale
permissions, orphaned remote tasks and accidental divergence from Feature 200.

## Alternatives

A direct External Agent-to-MCP connection, a third-party proxy as the source of
truth, or per-provider MCP registries are rejected because they bypass shared
policy, provenance, lifecycle and cross-spec controls.

## User Stories

As an admin, I can register and quarantine an upstream MCP server safely. As a
user, I can connect an approved app and approve an exact action from Chat. As an
external agent, I can use authorized MCP capabilities without receiving upstream
credentials or bypassing SmartAIHub policy.

## Acceptance Criteria

Spec 199 is complete only when the current reusable MCP foundation is mapped
without duplicate tables, the full upstream lifecycle and security gates work,
long-running calls enter `worker_jobs`, local calls use the shared Runner
Control Channel, Feature 200 calls route through Feature 199, and the complete
195–200 integration/negative-bypass/rollback evidence passes.
