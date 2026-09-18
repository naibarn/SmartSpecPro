# Spec 206 — SmartAIHub A2A-First Hybrid External Agent Interoperability Layer

**Status:** Proposed / Ready for implementation planning
**Spec ID:** 206
**Revision:** 9 — provider A2A support research, capability inventory and deterministic route-selection repair
**Date:** 2026-09-18
**Audit status:** Revisions 2–6 are retained historical protocol audits. Revision 7 recorded the first repository/codebase convergence audit; Revision 8 recorded a fresh fourteen-round re-audit. Revision 9 adds an evidence-backed provider inventory, separates A2A discovery from MCP/native support, and makes activation/fallback rules explicit.
**Suggested repository path:** `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
**Primary systems:** SmartAIHub Web, Universal AI Assistant, LangGraph Orchestrator, Capability Registry / Resolver, Spec 199 External MCP Gateway, Spec 200 Universal External Agent Control Plane, SmartAIHub Runner, SmartAIHub Worker App, Unified Job Control Plane, Retrieval Broker, Asset / Library Gateway, Approval Service, Audit / Observability
**External interoperability target:** Agent2Agent (A2A) Protocol v1.0.0 semantics, negotiated as wire version `1.0`
**Compatibility target:** A2A 1.0 preferred; A2A 0.3 compatibility optional; Spec 200 provider-native adapters remain the required fallback path

**Repository baseline at this revision:** Spec 206 is planning-only in the current
worktree. A2A adapter/router/schema implementation was not found. The repository
does contain the Feature 200 provider-neutral manifest and the Feature 186 job
control-plane contracts that this spec MUST extend rather than replace.

---

# 0. Executive Decision

SmartAIHub SHALL become **A2A-first, not A2A-only** for external-agent interoperability.

The core routing rule is:

```text
If the selected external agent exposes a usable A2A 1.0 interface
AND that A2A interface satisfies the requirements of the current task
AND authentication/security/policy checks pass
    → use A2A

Else
    → use the existing Spec 200 provider-native adapter path

In both cases
    → normalize into the same SmartAIHub Agent Task, worker_job,
      event, approval, artifact, audit, billing and result contracts
```

A2A SHALL be treated as the preferred **agent-to-agent interoperability protocol**.

Spec 200 SHALL remain the canonical fallback for agents that:

- do not implement A2A;
- expose A2A incompletely;
- expose an incompatible A2A version;
- cannot satisfy the required task modality;
- cannot support required authentication or policy;
- expose A2A but the interface is unhealthy;
- expose A2A but a provider-native adapter offers a required capability that A2A cannot currently represent or deliver safely;
- are local CLI / SDK / JSON-RPC harnesses without an A2A server.

The user SHALL receive equivalent SmartAIHub behavior as far as technically possible regardless of which external transport was used.

---

# 1. Why Spec 206 Exists

Spec 200 established a Universal External Agent Control Plane with provider adapters for Codex, Claude Code, Antigravity, DeepSeek Harness and future agent runtimes.

That architecture is still valid.

However, a growing number of external agents can now expose a common A2A interface. If SmartAIHub continues to build only provider-specific adapters, every new agent requires additional integration code for:

```text
discovery
authentication
session/task lifecycle
streaming
cancellation
resume/reconnect
input requests
artifact delivery
capability description
modalities
long-running work
provider-specific errors
```

A2A standardizes much of this.

Spec 206 adds an interoperability intelligence layer that decides:

```text
Can this agent speak A2A?
What A2A version?
Which protocol binding?
Which modalities?
Which task features?
Which extensions?
Which security requirements?
Is its Agent Card trusted?
Can it satisfy this task?
Should SmartAIHub use A2A or the Spec 200 native adapter?
How should results map back into the canonical SmartAIHub contracts?
```

Spec 206 SHALL therefore reduce the number of bespoke integrations while preserving full compatibility with existing Spec 200 providers.

---

# 2. Companion-Spec Ownership

This section is normative.

## 2.1 Canonical ownership

| Concern | Canonical owner |
|---|---|
| Universal Assistant `/chat` / Side Panel | Spec 196 / shared platform |
| Unified job reliability | Spec 186 / `worker_jobs` + `worker_job_events` |
| External MCP servers/tools/resources | **Spec 199** |
| Provider-native External Agent runtime integration | **Spec 200** |
| A2A discovery, negotiation, routing and normalization | **Spec 206** |
| LangGraph orchestration | shared platform |
| Capability Registry / Resolver | shared platform |
| Retrieval / RAG / Help | shared Retrieval Broker |
| Runner Control Channel | shared execution infrastructure |
| Approval | shared Approval Service |
| Audit / trace / provenance | shared platform |
| Asset / Library | shared platform |
| Billing / credits / revenue share | shared platform |
| Secrets / credentials | shared platform |

## 2.2 Spec 206 does not replace Spec 200

Spec 206 SHALL wrap and extend the external-agent execution architecture.

```text
                      External Agent Task
                              │
                              ▼
                    Spec 206 Interop Router
                         /             \
                        /               \
                  A2A Path           Native Path
                     │                   │
            A2A Client/Server        Spec 200
                     │            Provider Adapter
                     └──────────┬────────┘
                                ▼
                    Canonical Agent Runtime
                                │
                  worker_jobs / worker_job_events
```

Spec 200 remains mandatory.

An implementation that deletes Spec 200 provider adapters after adding A2A is non-conformant with this specification.

## 2.3 Spec 199 remains MCP owner

A2A MUST NOT become a second MCP gateway.

```text
External Agent
      │
      ├── Agent collaboration → A2A / Spec 206
      │
      └── SmartAIHub tool/capability access
                ↓
       SmartAIHub Capability Gateway
                ↓
       Capability Registry / policy
          ├── Skill / Workflow / Internal
          └── MCP Tool
                 ↓
              Spec 199
```

If an external agent itself supports MCP, SmartAIHub may configure a governed SmartAIHub MCP surface for it, but the agent MUST NOT receive arbitrary upstream MCP credentials or bypass Spec 199.

## 2.4 Current repository baseline and integration prerequisites

The following facts are normative integration constraints for the first
implementation wave:

1. `apps/web/server/services/agentControlPlaneContracts.ts` is the current
   Feature 200 contract boundary. `AgentTaskManifest` is validated before a
   canonical job definition is built; A2A MUST be an adapter/route layer around
   this boundary, not a second manifest or task queue.
2. The current job handoff uses `jobType = external_agent_task`,
   `executionClass = external`, and `contractVersion = feature-186-v1`. The
   `coding_agent` label used in some Spec 200 examples is a domain label, not a
   reason to introduce a second durable job type. A rename requires a separate
   coordinated migration; Spec 206 MUST preserve `external_agent_task` initially.
   The A2A logical `external_agent_id` is independent from the current closed
   `AgentProvider` union and MUST NOT be forced into a provider enum merely to
   make an Agent Card fit the native adapter contract.
3. `createControlPlaneJob` is the producer-facing Feature 186 admission
   boundary. A2A dispatch MUST provide an authenticated server context and MUST
   not accept tenant, actor, queue, runner, or adapter identity from a remote
   A2A payload.
4. The current baseline does not register `external_agent_task` in the default
   `JobExecutorRegistry`. Before production A2A dispatch, Spec 200/Feature 186
   MUST register and test the executor/transport projection for this job type;
   an A2A route MUST fail closed with `JOB_EXECUTOR_UNREGISTERED` rather than
   creating an orphan job or silently executing locally.
5. The current `AgentAdapter` interface exposes provider session start/cancel/
   collect only. It is not an A2A implementation. The A2A adapter MUST bridge
   into the shared interop contract and normalize remote task/event state; it
   MUST NOT pretend that `providerSessionId` is an A2A task or context ID.
   The current `AgentEvent.kind` union is also closed; A2A `INPUT_REQUIRED` and
   `AUTH_REQUIRED` MUST NOT be cast into that union or silently added to the
   existing contract. They MUST first be persisted as versioned normalized
   interop/`worker_job_events` records, then projected into the shared UI and
   approval/input flows. Expanding `AgentEvent` requires an explicit compatible
   Feature 200 contract version and parity tests.
6. No A2A dependency, A2A route, Agent Card table, or A2A feature flag exists
   in the current code baseline. Phase 0 therefore includes the dependency
   compatibility manifest, contract registration, migrations, and disabled-by-
   default rollout gates before any remote provider is enabled.

## 2.5 Canonical identifier mapping

Spec 206 MUST use the existing control-plane identities with the following
explicit mapping:

| Spec 206 concept | Canonical repository identity |
|---|---|
| `execution_intent_id` | `AgentTaskManifest.taskId` (stable logical task identity) |
| `worker_job_id` | `worker_jobs.id` |
| `execution_attempt_id` | `worker_job_attempts.id` for the active leased attempt |
| `provider_task_id` | A2A `Task.id`; never a SmartAIHub job ID |
| `provider_context_id` | A2A `Task.contextId`/message context, scoped to the binding |
| normalized lifecycle | `worker_job_events` with canonical event idempotency/sequence |
| remote artifact | canonical `ArtifactRef`/worker-artifact storage reference |

The route decision is created after the canonical job exists and before the
first side-effecting remote send, in the same durable admission flow where
possible. A remote task binding is an index/projection and MUST NOT become a
second execution authority.

---

# 3. Architectural Invariants

Spec 206 MUST NOT create:

1. a second durable job system;
2. an `a2a_jobs` table that competes with `worker_jobs`;
3. a second Capability Registry;
4. a second Retrieval/RAG subsystem;
5. a second Approval Service;
6. a second Library/Asset identity model;
7. a second Runner device registry;
8. a second Runner control WebSocket;
9. a second billing ledger;
10. a parallel audit system;
11. a protocol-specific UI workflow;
12. a separate orchestration graph that bypasses LangGraph;
13. direct external-agent access to private SmartAIHub Skill packages;
14. direct external-agent access to arbitrary upstream MCP servers;
15. protocol-dependent user-visible task semantics.

A2A is an interoperability boundary, not a new SmartAIHub execution platform.

---

# 4. Target A2A Baseline

## 4.1 Protocol

Required target:

```text
A2A protocol release: 1.0.0
Wire compatibility value: 1.0 (Major.Minor)
Normative source: versioned A2A v1.0.0 specification and `a2a.proto`
```

Optional compatibility:

```text
A2A 0.3
```

A2A 0.1 / 0.2 SHOULD NOT receive new SmartAIHub integration work.

## 4.2 Core protocol bindings

The long-term binding target is A2A 1.0 over the standard bindings relevant to
the deployed runtime:

```text
HTTP+JSON
JSON-RPC
gRPC
```

Phase 1 targets HTTP+JSON. JSON-RPC and gRPC are enabled only when their Phase 4
implementation, dependency, network, and conformance gates pass. The feature
matrix MUST report an unsupported binding and continue to the next eligible
interface/native route; it MUST NOT advertise or silently emulate an unbuilt
binding. The implementation MUST honor the ordering of `supportedInterfaces`
from the Agent Card and select the first interface that SmartAIHub actually
supports and policy allows.

SmartAIHub MUST NOT reorder a remote Agent Card merely because it internally prefers another transport.

## 4.3 SDK policy

A2A SDK version SHALL be implementation-language specific.

Do not hard-code an SDK "stable 1.x" claim in the architecture. The selected
JS/Python SDK version MUST be recorded in the compatibility manifest and pinned
in the lockfile for the implementation package. Do not couple the architecture
to one SDK.

Wrap SDK use behind:

```text
A2AProtocolAdapter
```

so that SDK upgrades do not change SmartAIHub Agent Task semantics.

---

## 4.4 Protocol-Version Semantics and Normative Source

A2A protocol compatibility SHALL use the protocol's `Major.Minor` value, not the specification patch release or SDK package version.

For this specification:

```text
A2A-Version sent on the wire = 1.0
Protocol semantic baseline     = A2A 1.0
  Specification release         = A2A v1.0.0
SDK package version            = independently pinned/tested
```

Rules:

- SmartAIHub MUST send `A2A-Version: 1.0` on A2A 1.0 requests where the binding uses the service parameter/header.
- Patch numbers MUST NOT be sent as the negotiated protocol version and MUST NOT be treated as a distinct wire compatibility level.
- The canonical A2A Protocol Buffer definition (`a2a.proto`) is the normative data-model/request-response source. Generated language models or JSON schema are derived artifacts and MUST NOT be manually redefined in SmartAIHub.
- SDK version numbers MUST NOT be confused with protocol versions. For example, a Python SDK `1.1.x` can still implement A2A protocol `1.0`.
- A compatibility manifest SHALL record `protocol_version`, `sdk_name`, `sdk_version`, binding, and passed conformance suite version independently.

A protocol-major/minor change requires explicit compatibility review rather than an automatic SDK upgrade.

# 5. Top-Level Architecture

```text
User / API / Automation
          │
          ▼
Universal AI Assistant / Product UI
          │
          ▼
LangGraph System Orchestrator
          │
          ▼
Capability Resolver
          │
          ├── Skill
          ├── Workflow
          ├── Internal capability
          ├── MCP Tool ───────────────→ Spec 199
          │
          └── External Agent
                    │
                    ▼
          Spec 206 Agent Interop Router
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
    A2A Route             Native Route
          │                   │
  A2A Client Adapter      Spec 200 Adapter
          │                   │
 Remote A2A Agent      Codex / Claude /
                      Antigravity / DeepSeek /
                      Future Provider
          │                   │
          └─────────┬─────────┘
                    ▼
          Canonical Agent Task Runtime
                    │
          worker_jobs / worker_job_events
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   Approval       Library      Audit
   Service        / Asset       / Trace
                    │
                    ▼
                Final Result
```

---

# 6. Main Design Principle — Protocol Intelligence

The system SHALL NOT use this simplistic rule:

```text
if agent_card_exists:
    use_a2a()
```

It SHALL use:

```text
discover
→ validate
→ authenticate
→ negotiate version/interface/extensions
→ build feature matrix
→ compare with task requirements
→ evaluate security/policy/health
→ select protocol
→ pin route for the execution attempt
```

A2A availability and A2A suitability are different concepts.

---

# 6A. Provider A2A Support Inventory and Activation Rules

## 6A.1 Scope boundary: agent interoperability is not tool interoperability

A2A is the protocol for SmartAIHub to communicate with an external **agent**.
MCP is the protocol for an agent to access external **tools, resources or
prompts**. A provider having MCP support, an SDK, a CLI, a local JSON-RPC
server, or a multi-agent/subagent feature MUST NOT be recorded as A2A support.

The UI and registry SHALL therefore use separate fields:

```text
agent_interop = a2a | spec200_native | unavailable
tool_interop  = mcp | provider_native | none
```

“Tool supports A2A” is not a valid capability label. Tool-level capabilities
belong in the Spec 199 MCP gateway and in the A2A `AgentSkill`/capability
projection when an A2A agent advertises them.

## 6A.2 Evidence-backed research baseline

The following is the initial provider research snapshot, checked on
2026-09-18. `not_publicly_documented` means that the reviewed official
documentation/release material does not document an A2A Agent Card/server or
client contract. It is deliberately **not** equivalent to cryptographic proof
that a private or unreleased implementation cannot support A2A.

| provider_key | Product/version evidence observed | Officially documented A2A support | Other documented integration surface | Initial route policy | Evidence |
|---|---|---|---|---|---|
| `claude_code` | Claude Code `v2.1.274` release observed on 2026-09-18 | `not_publicly_documented` | CLI, SDK/print and MCP configuration | `spec200_native` until a live A2A capability snapshot is verified | Anthropic CLI/MCP docs and [release](https://github.com/anthropics/claude-code/releases) |
| `openai_codex` | Codex CLI `0.155.0` release observed on 2026-09-18 | `not_publicly_documented` | Codex CLI/app-server surfaces and MCP | `spec200_native` until a live A2A capability snapshot is verified | [Codex release](https://github.com/openai/codex/releases/latest), [Codex CLI docs](https://developers.openai.com/codex/cli/) |
| `google_antigravity` | Antigravity 2.0 changelog `2.14.0`; download page also exposed `2.12.2`, and CLI `1.2.0` during gradual rollout | `not_publicly_documented` | Antigravity 2.0/CLI/SDK, MCP, and managed REST/gRPC surfaces | `spec200_native` until a live A2A capability snapshot is verified | [official changelog](https://www.antigravity.google/changelog), [download](https://antigravity.google/download), [SDK overview](https://www.antigravity.google/docs/sdk/overview) |
| `deepseek_harness` | DeepSeek Harness `dsh-v0.1.6-alpha.1` pre-release observed on 2026-09-18 | `not_publicly_documented` | Local harness, plugin model, SDK client/server over stdio JSON-RPC, and MCP | `spec200_native` until a live A2A capability snapshot is verified | [official repository](https://github.com/deepseek-ai/deepseek-harness), [latest release](https://github.com/deepseek-ai/deepseek-harness/releases) |

The product/version column is inventory metadata only. It MUST NOT activate an
A2A route. The official product pages currently describe MCP, CLI, SDK,
JSON-RPC, REST or gRPC surfaces, while the A2A capability status remains
unverified until the runtime presents a valid Agent Card and passes the
binding/conformance checks below.

## 6A.3 Capability state and route eligibility

Every discovered candidate SHALL persist both a capability state and a route
eligibility state; one boolean `supports_a2a` is insufficient:

```text
capability_state:
  unknown | discovered | verified | degraded | unsupported | stale

route_eligibility:
  a2a_eligible | native_only | blocked | needs_review
```

The minimum persisted inventory projection is:

```text
provider_key
external_agent_id
display_name
product_version_observed
a2a_capability_state
a2a_protocol_versions
a2a_supported_interfaces
a2a_skills
a2a_auth_requirements
native_adapter_available
tool_interop_mcp_state
source_kind                 # live_agent_card | configured_metadata | official_research
source_ref
last_checked_at
card_expires_at
health_state
conformance_state
route_eligibility
selected_route
selection_reason
```

`official_research` is advisory metadata. Only a validated live Agent Card,
the selected binding's health/conformance result, tenant policy, credential
availability and task requirements can produce `a2a_eligible`.

## 6A.4 Discovery and activation state machine

The implementation SHALL execute this flow for every A2A-capable candidate:

```text
registered candidate
  → fetch explicit/curated Agent Card
  → validate URL, tenant, redirect and SSRF policy
  → verify signature/trust and card freshness
  → parse supportedInterfaces and AgentSkill requirements
  → intersect with SmartAIHub-supported A2A 1.0 bindings
  → perform bounded health/conformance probe
  → persist capability snapshot and evidence
  → mark a2a_eligible only if all gates pass
```

The default provider matrix above remains `native_only` operationally until
the live flow reaches `a2a_eligible`. A discovery failure, stale card,
unsupported binding, failed health probe, missing credential, or missing task
skill MUST NOT be reported as “A2A supported”.

## 6A.5 Deterministic route decision

```text
native_required
  → Spec 200 native

a2a_required
  → use verified eligible A2A
  → if none: fail closed with A2A_CAPABILITY_UNVERIFIED

a2a_preferred
  → use verified eligible A2A
  → if none: use healthy Spec 200 native adapter

unknown/not_publicly_documented/unsupported/stale/health_failed
  → never claim A2A; use Spec 200 native only when policy allows
```

After an A2A request may have reached the remote agent, an A2A-to-native
fallback MUST NOT create a second task. The existing A2A task/context MUST be
reconciled or the attempt MUST become an explicit ambiguous-dispatch state.
Native fallback is allowed automatically only for bounded pre-dispatch failures
where remote task creation is impossible to establish.

The route decision SHALL record:

```text
selected_route                  # a2a | spec200_native
selected_interface              # binding + protocol version, if A2A
capability_snapshot_id
research_snapshot_id            # advisory, never authoritative
fallback_reason
policy_mode                     # a2a_required | a2a_preferred | native_required
dispatch_ambiguity_state
```

## 6A.6 UI, diagnostics and operator behavior

The registry/admin/task detail surfaces SHALL show, separately:

```text
A2A: Verified / Discovered / Stale / Unsupported / Unknown
Binding: HTTP+JSON | JSON-RPC | gRPC | none
Protocol: 1.0 | other | unknown
Skills: matched / missing / unknown
Health and trust: pass / degraded / failed / not checked
Native adapter: available / unavailable
Selected route: A2A / Spec 200 native
Reason: stable machine-readable reason code
Last checked: timestamp and source reference
```

The UI MUST NOT display “A2A active” from provider name, model name, MCP
availability, CLI availability or version alone. It SHALL display “Native
fallback” when the current matrix state is not A2A-eligible.

## 6A.7 Required contract tests

Before any provider is marked A2A-active, tests SHALL cover:

1. valid Agent Card + supported binding + matching skill → A2A;
2. product has MCP/CLI/SDK but no Agent Card → native;
3. Agent Card exists but is stale, unsigned/untrusted or unsupported → native;
4. `a2a_required` with no verified capability → fail closed;
5. ordered interfaces choose the first healthy supported binding;
6. pre-dispatch A2A failure may use native without duplicate creation;
7. post-dispatch timeout reconciles the same A2A task and never creates native duplicate;
8. research/version metadata changes do not change route without a live capability snapshot;
9. tenant/auth/credential/SSRF policy failure is visible in the reason code;
10. the UI distinguishes A2A agent interoperability from MCP tool interoperability.

---

# 7. External Agent Registration Model

An external agent may be registered by:

```text
1. A2A Agent Card URL
2. A2A service domain
3. Curated SmartAIHub Agent Registry
4. Tenant administrator configuration
5. Marketplace installation
6. Spec 200 runtime discovery on a Runner
7. Existing provider adapter configuration
```

Logical agent identity:

```text
external_agent_id
```

An external agent may have multiple interfaces:

```text
A2A HTTP+JSON
A2A JSON-RPC
A2A gRPC
Spec 200 Codex App Server
Spec 200 CLI
Spec 200 SDK JSON-RPC
provider cloud API
```

These interfaces SHALL be children of one logical agent identity where identity can be established safely.

Do not create duplicate marketplace agents merely because they expose more than one protocol.

---

# 8. A2A Agent Discovery

## 8.1 Discovery order

For a configured domain:

```text
1. explicit configured Agent Card URL, if present
2. curated registry metadata, if authoritative
3. https://{domain}/.well-known/agent-card.json
4. authenticated Extended Agent Card, if supported and authorized
```

For a local Runner provider:

```text
1. Spec 200 runtime discovery
2. provider-advertised local A2A endpoint, if available
3. localhost A2A Agent Card retrieval from Runner
4. otherwise native Spec 200 adapter
```

## 8.2 No arbitrary Internet crawling

SmartAIHub SHALL NOT crawl random domains attempting to discover agents.

Discovery requires:

```text
explicit registration
curated registry membership
marketplace installation
known provider metadata
or a deliberate user/admin connection action
```

This avoids SSRF, credential leakage and unbounded discovery.

## 8.3 Agent Card cache

Store:

```text
agent_card_hash
etag
last_modified
fetched_at
expires_at
signature_status
trust_state
source_url
raw_agent_card_artifact_ref
normalized_profile_json
```

Honor cache headers where safe.

Security policy MAY impose a shorter maximum TTL.

---

# 9. Agent Card Trust and Verification

A2A Agent Cards MAY carry JWS signatures.

Spec 206 SHALL implement signature verification.

## 9.1 Verification

Verification includes:

```text
RFC 8785 JSON Canonicalization
JWS verification
approved algorithms
kid resolution
JWKS retrieval policy
HTTPS certificate validation
signature freshness/trust policy
```

Algorithm allowlist SHOULD default to modern asymmetric algorithms approved by the SmartAIHub security policy.

Never accept `alg=none`.

## 9.2 Trust states

Use factual trust states, not vague labels:

```text
signature_verified
transport_verified_only
registry_verified
admin_pinned
unverified
verification_failed
```

A valid JWS proves integrity relative to the verified signing key.

It does not automatically prove that the provider itself is trustworthy.

Provider trust policy remains separate.

## 9.3 JWKS / JKU safety

Remote `jku` retrieval SHALL enforce:

```text
HTTPS
SSRF protection
private-network blocking unless explicitly allowed
DNS rebinding protection
redirect limits
response-size limits
content-type validation
key-cache bounds
algorithm allowlist
```

---

## 9A. Exact Agent Card Canonicalization Rules

Agent Card JWS verification SHALL follow the A2A 1.0 canonicalization rules rather than signing/verifying a generic JSON serialization.

Before verification/signing:

1. reconstruct field presence according to the normative Protocol Buffer presence/default rules;
2. omit fields that the protocol says are absent/default unless REQUIRED or explicitly present as specified;
3. exclude the `signatures` field from the signed payload;
4. canonicalize the resulting JSON using RFC 8785 (JCS);
5. verify the JWS signing input using the protected header and canonical payload.

The protected JWS header SHALL be validated for at least:

```text
alg
kid
typ (expected JOSE when present/as required)
jku when used
```

Rules:

- `alg=none` is forbidden;
- algorithm/key-type compatibility MUST be validated;
- `kid` resolution MUST NOT select an arbitrary key when multiple keys exist;
- remote `jku` is untrusted network input and MUST pass the SSRF/network-boundary policy;
- SmartAIHub SHOULD require at least one verified signature when policy says a signed card is mandatory;
- multiple signatures MAY exist; retain per-signature verification status rather than collapsing them into one opaque boolean;
- a card with a failed required signature verification MUST NOT be silently treated as `transport_verified_only`.

When SmartAIHub signs its own Agent Cards it SHALL use the same canonicalization routine used for verification, covered by deterministic test vectors.

# 10. Public and Extended Agent Cards

If:

```text
capabilities.extendedAgentCard = true
```

SmartAIHub SHOULD retrieve an authenticated Extended Agent Card after establishing credentials.

Public Agent Card:

```text
minimal public discovery
```

Extended Agent Card:

```text
tenant/user-authorized capabilities
private skills
rate/quota metadata
organization-specific behavior
additional interfaces
```

The Extended Agent Card SHALL be cached separately by:

```text
agent
credential owner
tenant
scope set
```

Never allow one tenant's Extended Agent Card to populate another tenant's capability view.

---

# 11. AgentSkill Is Not SmartAIHub Skill

A2A `AgentSkill` SHALL be modeled as an external-agent advertised capability.

It MUST NOT be inserted directly into the SmartAIHub executable Skill Registry.

Use:

```text
external_agent_capability
source_type = a2a_agent_skill
```

Example:

```text
AgentSkill:
  id: professional-video-editor
  name: Professional Video Editor

SmartAIHub Skill:
  id: video.semantic_scene_score
  executable: true
```

The first describes what an agent claims it can do.

The second is a governed executable SmartAIHub capability.

The Capability Resolver may search both, but execution semantics are different.

---

# 12. A2A Capability Profile

Normalize every Agent Card into:

```json
{
  "external_agent_id": "agent_123",
  "protocol": "a2a",
  "protocol_version": "1.0",
  "interfaces": [],
  "streaming": true,
  "push_notifications": true,
  "extended_agent_card": true,
  "extensions": [],
  "input_modes": [],
  "output_modes": [],
  "agent_skills": [],
  "security_requirements": [],
  "signature_status": "signature_verified",
  "last_verified_at": "...",
  "health": "healthy"
}
```

This profile joins the existing shared Capability Registry.

It SHALL NOT become another search index.

---

## 12A. Agent Card Defaults, Skill Overrides and Effective Capability Calculation

The Capability Registry projection SHALL compute an **effective per-AgentSkill profile** instead of indexing only top-level Agent Card defaults.

For each A2A `AgentSkill`:

```text
effective_input_modes =
  AgentSkill.inputModes if explicitly present
  else AgentCard.defaultInputModes

effective_output_modes =
  AgentSkill.outputModes if explicitly present
  else AgentCard.defaultOutputModes

effective_security_requirements =
  AgentSkill.securityRequirements if explicitly present
  else AgentCard.securityRequirements
```

Skill-level input/output/security declarations are overrides and MUST participate in route suitability.

Consequences:

- an agent may be generally text-capable while one skill accepts video;
- an agent may advertise one default auth requirement while a sensitive skill requires stronger/different scopes;
- route selection MUST evaluate the specific candidate AgentSkill(s) relevant to the task, not only the Agent Card global profile;
- `acceptedOutputModes` sent with the request SHALL be intersected with the selected skill's effective output modes and the caller's actual consumption capability;
- empty intersections are a hard incompatibility and MUST result in alternate skill/agent/route selection rather than a best-effort unsupported content request.

The normalized capability snapshot SHALL retain both raw declarations and the computed effective profile for audit/debugging.

# 13. Per-Task Requirements Profile

Before route selection, SmartAIHub SHALL derive an `AgentInteropRequirements` object from the Universal Agent Task Manifest.

Example:

```json
{
  "task_family": "media_edit",
  "required_input_modes": [
    "text/plain",
    "video/*",
    "image/*"
  ],
  "required_output_modes": [
    "video/mp4",
    "application/json"
  ],
  "requires_streaming": true,
  "requires_cancel": true,
  "requires_long_running_task": true,
  "requires_input_required": true,
  "requires_auth_required": true,
  "requires_artifacts": true,
  "requires_resume_or_reconcile": true,
  "requires_smartaihub_capabilities": true,
  "max_runtime_seconds": 3600,
  "side_effect_class": "workspace_write"
}
```

The profile is generated by SmartAIHub policy and task semantics.

The LLM MUST NOT be the sole authority deciding security-sensitive requirements.

---

# 14. Agent Interoperability Feature Matrix

Every candidate route SHALL expose a machine-readable feature matrix.

Example:

```json
{
  "route": "a2a",
  "features": {
    "message": true,
    "task": true,
    "stream": true,
    "poll": true,
    "push_notification": true,
    "cancel": true,
    "resubscribe": true,
    "list_tasks": true,
    "input_required": true,
    "auth_required": true,
    "artifact": true,
    "file_url": true,
    "structured_data": true,
    "extended_card": true,
    "card_signature": true,
    "extensions": [
      "..."
    ]
  }
}
```

Native Spec 200 adapters SHALL produce the same matrix even if their internal mechanisms differ.

Example:

```text
Claude Code stream-json
→ stream = true

Claude session resume
→ resume = true

Provider approval event
→ approval = true

No A2A Agent Card
→ a2a = false
```

This creates comparable routing behavior.

---

# 15. Protocol Selection Algorithm

## 15.1 Mandatory precedence

For each execution attempt:

```text
Candidate routes
   ↓
A2A usable?
   ├── no  → Spec 200 route
   └── yes
        ↓
A2A satisfies task requirements?
   ├── no  → Spec 200 route
   └── yes
        ↓
A2A security/policy passes?
   ├── no  → Spec 200 route if allowed
   └── yes
        ↓
A2A health/circuit state OK?
   ├── no  → Spec 200 route if healthy
   └── yes
        ↓
USE A2A
```

A2A is preferred when it satisfies the task.

## 15.2 RouteDecision

Persist a route decision:

```json
{
  "route_decision_id": "route_123",
  "external_agent_id": "agent_123",
  "worker_job_id": "job_123",
  "execution_intent_id": "intent_123",
  "selected_route": "a2a",
  "selected_interface": {
    "binding": "HTTP+JSON",
    "protocol_version": "1.0"
  },
  "fallback_route": "spec200_native",
  "required_features": [],
  "supported_features": [],
  "degradation": [],
  "decided_at": "..."
}
```

## 15.3 Deterministic routing

Route selection MUST be reproducible from:

```text
task requirement snapshot
agent capability snapshot
policy snapshot
health snapshot
credential availability
```

Do not make protocol selection an opaque LLM-only decision.

---

# 16. Interface Selection

A2A Agent Card `supportedInterfaces` is ordered.

Spec 206 SHALL:

1. iterate in Agent Card order;
2. reject versions/bindings unsupported by SmartAIHub;
3. enforce tenant/interface routing values;
4. select the first usable interface.

Example:

```text
Agent Card:
1. gRPC 1.0
2. HTTP+JSON 1.0
3. JSONRPC 1.0

SmartAIHub deployment:
gRPC blocked by edge policy
HTTP+JSON supported

Selected:
HTTP+JSON 1.0
```

SmartAIHub MUST NOT claim to honor the Agent Card while silently changing preference order.

---

## 16A. Binding Equivalence and Custom-Binding Policy

A2A 1.0 requires an agent that advertises multiple protocol bindings to expose semantically equivalent functionality across those advertised interfaces.

SmartAIHub SHALL therefore treat inconsistent multi-binding behavior as a conformance/health signal.

Examples of inconsistency:

```text
Agent Card says HTTP+JSON and gRPC
HTTP+JSON supports CancelTask
same agent's gRPC binding rejects it as nonexistent
```

or:

```text
one binding applies weaker authentication than the Agent Card declares
```

Such inconsistencies SHALL be recorded as `binding_conformance_degraded` and MAY quarantine the affected interface.

Custom bindings are allowed only when:

- `protocolBinding` uses a stable globally unique identifier/URI for non-core bindings;
- the binding defines operation mapping, streaming/termination semantics, authentication integration and error mapping;
- breaking custom-binding changes use a new binding URI/version identity;
- SmartAIHub has an explicitly installed/tested adapter for that binding.

An unknown custom binding MUST NOT be guessed from its URL scheme or provider name.

## 16B. A2A Binding Failover Before Native Fallback

A logical A2A route may contain multiple Agent Card interfaces. SmartAIHub SHALL exhaust **eligible A2A interfaces in declared preference order** before falling back to the Spec 200 native route when the failure occurs safely before remote task creation.

Example:

```text
supportedInterfaces:
1. HTTP+JSON 1.0
2. JSONRPC 1.0
3. GRPC 1.0

HTTP+JSON fails pre-dispatch health/connectivity check
→ evaluate JSONRPC
→ if usable, remain on A2A
→ only after eligible A2A interfaces are exhausted consider Spec 200 native fallback
```

Rules:

1. Never reorder interfaces relative to Agent Card preference.
2. Skip only interfaces that SmartAIHub does not support or that policy/security/task requirements reject.
3. Pre-dispatch connection/TLS/health failures MAY advance to the next eligible A2A interface.
4. After a request may have reached a remote agent, changing A2A binding is subject to the same ambiguous-dispatch reconciliation rules as A2A→native fallback.
5. A successfully created task is pinned to its selected interface/binding for that execution attempt unless the protocol/provider explicitly supports safe cross-binding resubscription/retrieval for the same task and SmartAIHub has tested that behavior.
6. Route diagnostics SHALL distinguish:

```text
A2A interface failover
from
A2A → Spec 200 native fallback
```

This preserves A2A-first behavior while respecting the Agent Card's ordered interface contract.

# 17. Version Negotiation

The route SHALL record:

```text
requested_protocol_version
selected_protocol_version
remote_protocol_version
sdk_version
compatibility_mode
```

A2A 1.0 is preferred.

Optional A2A 0.3 compatibility SHALL be isolated behind:

```text
A2ALegacyCompatibilityAdapter
```

No v0.3 shape SHALL leak into the canonical SmartAIHub Agent Task model.

---

# 18. Extension Negotiation

A2A supports extensions identified by URI.

Spec 206 SHALL implement:

```text
discover remote extensions
→ compare against local supported extensions
→ validate required extensions
→ activate optional extensions explicitly
→ send A2A-Extensions declaration as required by binding
```

If a remote Agent Card declares a required extension that SmartAIHub does not support:

```text
A2A route = incompatible for that task/agent
```

The system MAY fall back to Spec 200 if a native route exists and policy allows it.

Unknown optional extensions MUST be ignored safely while retaining metadata for diagnostics.

---

# 19. SmartAIHub A2A Extensions

SmartAIHub MAY define optional extensions when core A2A cannot express platform-specific semantics.

Proposed namespace:

```text
https://smartaihub.app/a2a/extensions/
```

Initial candidates:

```text
asset-ref/v1
capability-context/v1
billing-budget/v1
provenance/v1
```

These extensions MUST:

- be optional by default;
- never be required for basic A2A interoperability;
- use URI-versioned semantics;
- be schema validated;
- not bypass authentication/authorization;
- not modify core A2A enum definitions;
- use metadata/extension-defined fields as intended by A2A.

## 19.1 asset-ref/v1

Allows an A2A-aware peer to understand canonical SmartAIHub:

```text
asset://
artifact://
library://
```

without embedding large media.

If unsupported, SmartAIHub SHALL translate references into short-lived signed HTTPS URLs or standard A2A File/URL Parts.

## 19.2 capability-context/v1

May provide machine-readable metadata describing the authorized SmartAIHub capability surface available to the delegated agent.

It SHALL NOT expose private Skill implementation packages.

## 19.3 billing-budget/v1

May communicate execution budget envelopes where both sides explicitly support it.

It SHALL NOT be trusted as the billing source of truth.

SmartAIHub's billing ledger remains authoritative.

## 19.4 provenance/v1

May preserve cross-agent provenance identifiers such as:

```text
trace_id
execution_intent_id
orchestration_run_id
asset lineage
```

If unsupported, these values remain SmartAIHub-local.

---

# 20. Universal Agent Task Manifest Remains Canonical

Spec 200's Universal Agent Task Manifest remains the provider-independent request model.

Spec 206 SHALL extend it only where necessary, and MUST distinguish the logical
interop intent from the currently validated repository contract. The example
below is a product-level envelope used before the current
`validateAgentTaskManifest` boundary; it is not permission to add
`provider: "auto"`, client-controlled tenant/actor fields, or a second durable manifest
type to the current TypeScript contract.

At the current repository boundary, the server MUST first derive and validate
the existing `AgentTaskManifest` (`taskId`, server-derived `tenantId` and
`actorId`, `goalId`, `planId`, `planRevision`, one of the current provider
values, runtime, workspace and capability/grant IDs). The A2A-specific fields
below MUST be carried as a server-owned interop-intent sidecar or an explicitly
versioned additive contract extension, keyed to that canonical task identity.
They MUST NOT be copied into `inputJson` as an unvalidated routing authority.
The sidecar is not a second durable task manifest: before admission it may exist
only as a server-owned request object; after canonical job admission its durable
projection is `agent_interop_route_decisions.requirements_snapshot_json`,
`policy_snapshot_ref` and the related route/binding rows. A standalone
`agent_interop_intents` queue or source-of-truth table is out of scope unless a
future coordinated migration explicitly defines its ownership and idempotency.

Example:

```json
{
  "task_id": "task_123",
  "task_family": "media_edit",
  "agent": {
    "external_agent_id": "agent_123"
  },
  "interop": {
    "protocol_policy": "a2a_preferred",
    "allow_native_fallback": true,
    "required_features": []
  },
  "instruction": "Create a professional edited video no longer than 3 minutes.",
  "assets": [
    "asset://video_001",
    "asset://video_002",
    "asset://image_001"
  ],
  "constraints": {
    "max_duration_seconds": 180
  },
  "context": {
    "context_package_id": "ctxpkg_123"
  },
  "capabilities": {
    "skill_scope_id": "skillscope_123"
  }
}
```

Allowed protocol policies:

```text
a2a_preferred       // default
a2a_required        // explicit enterprise/integration requirement
native_preferred    // diagnostic/compatibility use
native_required     // diagnostic/provider requirement
```

Normal users SHOULD use `a2a_preferred`.

---

# 21. A2A Message Mapping

A2A `Message` maps into the canonical SmartAIHub turn/message model.

Mapping:

```text
A2A messageId
→ provider_message_id

A2A contextId
→ provider_context_id

A2A taskId
→ provider_task_id

A2A role
→ agent/user role

A2A text Part
→ message text

A2A data Part
→ structured payload

A2A URL/raw Part
→ Asset Gateway ingestion/materialization policy
```

Raw binary data SHOULD only be used for small payloads.

Large media MUST use canonical asset references or short-lived signed URLs.

---

# 22. A2A Task Mapping

No `a2a_jobs` table.

Mapping:

```text
A2A Task
       │
       ▼
a2a_task_binding
       │
       ▼
worker_jobs
```

Suggested binding:

```text
worker_job_id
external_agent_id
provider_task_id
provider_context_id
route_decision_id
selected_interface_id
protocol_version
last_remote_state
last_remote_timestamp
last_reconciled_at
```

---

## 22A. Task Immutability, Refinement and Cross-Task References

A2A terminal tasks are immutable units of work.

When a task reaches:

```text
TASK_STATE_COMPLETED
TASK_STATE_FAILED
TASK_STATE_CANCELED
TASK_STATE_REJECTED
```

SmartAIHub MUST NOT send another message attempting to restart that same A2A task.

A refinement/follow-up SHALL create a **new remote task** while preserving conversational relationship through:

```text
same contextId (when appropriate)
referenceTaskIds = [prior_task_id, ...]
```

Canonical mapping:

```text
new SmartAIHub worker_job / execution_attempt
→ new A2A Task
→ same conversation/orchestration lineage
→ reference prior A2A Task(s)
```

`Message.referenceTaskIds` SHALL be preserved in the canonical message model and audit/provenance layer where supplied.

Interrupted states (`INPUT_REQUIRED`, `AUTH_REQUIRED`) are not terminal. The continuation message MAY target the same task/context according to A2A semantics after the required input/authorization has been resolved.

The UI action **Continue / Refine / Fix** MUST therefore distinguish:

```text
interrupted task continuation
vs
terminal-task refinement creating a new task
```

This rule prevents illegal task resurrection and keeps artifacts/provenance tied to a stable unit of work.

# 23. A2A Task State Mapping

A2A 1.0 states:

```text
TASK_STATE_SUBMITTED
TASK_STATE_WORKING
TASK_STATE_COMPLETED
TASK_STATE_FAILED
TASK_STATE_CANCELED
TASK_STATE_REJECTED
TASK_STATE_INPUT_REQUIRED
TASK_STATE_AUTH_REQUIRED
```

Canonical mapping (using the current `CanonicalJobStatus` set; the names below
are event/reason labels, not new durable job statuses):

| A2A | SmartAIHub |
|---|---|
| `TASK_STATE_SUBMITTED` | `queued` plus the canonical submission/dispatch event; after remote acceptance, `wait_for_external` moves the job to `waiting_external` |
| `TASK_STATE_WORKING` | running |
| `TASK_STATE_COMPLETED` | `waiting_external` plus an `A2A_TASK_COMPLETED` event; normally verification uses `resumeExternal` to reach `running`, then the canonical completion projection reaches `succeeded` or `failed`. A provider-poller implementation MAY use the existing guarded `completeExternal` settlement path only with its durable operation key, poller lease/ownership check, result reference and idempotent `COMPLETED` event. |
| `TASK_STATE_FAILED` | failed |
| `TASK_STATE_CANCELED` | `cancelled` after the canonical cancel/reconcile command is committed |
| `TASK_STATE_REJECTED` | failed with a normalized rejection reason/event |
| `TASK_STATE_INPUT_REQUIRED` | `waiting_external` plus an input-required event and shared UI/continuation reference |
| `TASK_STATE_AUTH_REQUIRED` | `waiting_external` plus an auth-required event and shared Credential/Approval reference |

The current repository has no `waiting_user_input`, `waiting_auth`,
`provider_completed`, `canceled`, or `rejected` values in
`CanonicalJobStatus`. Implementations MUST preserve those distinctions in
canonical event types, reason codes and payloads while using the existing job
transition table. A remote terminal state MUST NOT reopen a terminal
`worker_jobs` row; late or contradictory events are reconciled/quarantined
under the existing lease, fencing and idempotency rules.

The generic canonical transition table does not expose an unguarded
`waiting_external → succeeded` transition. A remote terminal result is not
permission for a raw status update. Implementations MUST use either the normal
`waiting_external → running → succeeded|failed` verification path or the
existing guarded `completeExternal` provider-settlement path, which requires
the durable external operation key, provider-poller ownership check, bounded
result reference and idempotent `COMPLETED` event. A2A remote completion alone
does not satisfy the independent SmartAIHub verification layer.

`TASK_STATE_COMPLETED` means the remote agent reports completion.

It does **not** automatically mean SmartAIHub verification passed.

Spec 200's independent result trust model remains required.

---

# 24. Four-Layer Result Trust Model

Both A2A and native routes SHALL preserve:

```text
1. Provider Event Result
2. Provider Final Result
3. Workspace / Artifact Reality
4. Independent Verification Result
```

For A2A:

```text
Task COMPLETED
≠ SmartAIHub verified completion
```

Example:

```text
Remote task completed
→ download/resolve artifacts
→ validate checksum/MIME/size
→ inspect workspace if applicable
→ run tests/build/QC where applicable
→ publish canonical final result
```

---

# 25. A2A Streaming

If Agent Card declares streaming support and the task benefits from live progress:

```text
SendStreamingMessage
```

SHOULD be preferred.

A2A stream events SHALL map into Spec 200's normalized event envelope.

Example:

```json
{
  "event_id": "evt_x",
  "job_id": "job_x",
  "session_id": "session_x",
  "sequence": 102,
  "timestamp": "...",
  "provider": "external_agent",
  "protocol": "a2a",
  "type": "agent.progress",
  "normalized": {},
  "native": {
    "a2a_event": {}
  }
}
```

Raw A2A events MUST remain available for diagnostics subject to retention/privacy policy.

---

## 25A. Normative Streaming and Incremental-Artifact Semantics

Spec 206 SHALL validate A2A 1.0 streaming behavior rather than treating any SSE/gRPC stream as conformant.

For `SendStreamingMessage`:

```text
Message-only stream:
  first/only StreamResponse = Message
  then stream closes

Task lifecycle stream:
  first StreamResponse = Task
  then zero or more:
    TaskStatusUpdateEvent
    TaskArtifactUpdateEvent
  stream closes when Task reaches a terminal state
```

Each `StreamResponse` MUST contain exactly one of:

```text
task
message
statusUpdate
artifactUpdate
```

A2A 1.0 does **not** use the legacy v0.x `kind` discriminator or `final` field for `TaskStatusUpdateEvent`. SmartAIHub MUST use the v1.0 one-of shape and task state / binding stream closure semantics.

### Event ordering

Remote A2A events MUST be consumed in generation order. If multiple concurrent streams/subscriptions monitor the same task, SmartAIHub SHALL expect semantically the same ordered events on each stream and SHALL deduplicate them before durable persistence.

The normalized SmartAIHub `sequence` remains locally generated after the event crosses the reliability boundary; it MUST NOT assume the remote server exposes a global numeric sequence.

### Incremental artifact assembly

`TaskArtifactUpdateEvent` supports:

```text
artifact.artifactId
append
lastChunk
```

SmartAIHub SHALL maintain an artifact assembly state keyed at minimum by:

```text
external_agent_id
provider_task_id
artifact_id
```

Rules:

1. `append = false` or omitted starts/replaces the current logical artifact content according to A2A semantics.
2. `append = true` appends the received parts to the previously observed artifact with the same artifact ID.
3. `lastChunk = true` marks the final streamed chunk for that artifact.
4. Appending to an unknown artifact ID MUST be treated as an invalid/unsafe artifact update unless the SDK/spec compatibility layer explicitly defines recovery.
5. Only fully assembled and validated artifacts may be marked `artifact.completed` or published as final Library outputs.
6. Duplicate streamed/pushed chunks MUST NOT be appended twice.
7. Large partially assembled artifacts SHOULD be spooled to bounded temporary/object storage rather than accumulated unbounded in process memory.
8. Partial artifacts SHALL be garbage-collected after terminal failure/cancellation according to retention policy.

This assembly logic SHALL be common to live streaming, resubscription, push notifications and reconciliation reads.

# 26. Resubscription and Reconnection

A2A `SubscribeToTask` SHALL be used when supported to recover streaming after connection interruption.

Canonical recovery:

```text
stream disconnect
   ↓
do not mark task failed
   ↓
GetTask
   ↓
if non-terminal
   ↓
SubscribeToTask
   ↓
continue normalized event stream
```

This aligns with Spec 200's rule that transport disconnect is not execution failure.

---

# 27. Push Notifications

For long-running or disconnected scenarios, A2A push notifications SHOULD be supported when the Agent Card declares support.

Use cases:

```text
video render
large research job
long code build
batch processing
cloud automation
mobile/serverless initiators
```

## 27.1 Webhook security

Push callback endpoint SHALL implement:

```text
unguessable callback identifier
token validation where configured
remote authentication if supported
HTTPS only
request size limit
rate limit
replay defense
idempotent event handling
tenant/task ownership verification
SSRF-safe callback generation
```

A push notification is a trigger to reconcile.

It is not automatically trusted as final truth.

After significant/terminal notification SmartAIHub MAY call:

```text
GetTask
```

before finalizing durable state.

---

## 27A. Push Delivery Semantics and Acknowledgement

A2A push notifications SHALL be treated as **at-least-once event delivery**, not exactly-once delivery.

Protocol behavior to support:

```text
remote agent
→ HTTP POST callback
→ Content-Type: application/a2a+json
→ StreamResponse payload containing exactly one of:
   task | message | statusUpdate | artifactUpdate
```

Receiver rules:

1. Validate callback route, authentication/token and expected task binding before processing the body as authoritative input.
2. Validate that the received task ID/context correlation matches an expected task visible to that tenant/connection.
3. Process idempotently because duplicate deliveries may occur.
4. Return HTTP 2xx only after the notification has crossed the SmartAIHub durable/idempotent acceptance boundary; do not acknowledge before the event can be safely recovered.
5. Non-2xx responses may cause remote retries, so handlers MUST be duplicate-safe.
6. Push events and live-stream events for the same task may overlap and SHALL converge on one canonical event history.
7. Terminal push events SHOULD trigger `GetTask` reconciliation when feasible before final durable completion.
8. Callback authentication credentials belong in the Credential Broker/secret store, not plaintext database fields or logs.

When SmartAIHub is the A2A Server/webhook caller, it SHALL attempt configured delivery at least once and SHOULD use bounded exponential-backoff retry/timeouts consistent with A2A security guidance.

# 28. Polling Fallback

If streaming and push notifications are unavailable:

```text
SendMessage
→ Task
→ adaptive GetTask polling
```

Polling SHALL use:

```text
bounded exponential backoff
server hints if available
jitter
maximum interval
task runtime deadline
```

Do not poll at a fixed high frequency.

---

# 29. ListTasks as Recovery Primitive

A2A 1.0 `ListTasks` SHOULD be used for reconciliation where supported.

Examples:

```text
backend restart
credential/session restoration
lost local binding state
admin recovery
cross-check stale jobs
```

Use filters such as:

```text
contextId
status
pagination cursor
```

SmartAIHub MUST still enforce its own tenant/user/job mapping.

Never import arbitrary remote tasks into a tenant merely because `ListTasks` returns them.

---

## 29A. History, Pagination and Task-Listing Semantics

Spec 206 SHALL implement A2A 1.0 history and `ListTasks` semantics explicitly because they are important for restart reconciliation and avoiding oversized payloads.

### `historyLength`

```text
unset → client imposes no explicit limit; server policy decides
0     → request no task history
> 0   → at most N most recent messages
```

SmartAIHub SHOULD use bounded values by default. It MUST NOT rely on an unset `historyLength` for large production task histories.

### `ListTasks`

Where supported, the adapter SHALL support:

```text
contextId
status
pageSize
pageToken
historyLength
statusTimestampAfter
includeArtifacts
```

Operational rules:

- use cursor/page-token pagination, never offset emulation;
- `pageSize` must respect the protocol bounds (1–100; default server behavior may return at most 50 when omitted);
- handle `nextPageToken = ""` as the final page;
- expect tasks sorted by status-update timestamp descending;
- default `includeArtifacts = false` for reconciliation scans unless artifact data is actually needed;
- when `includeArtifacts = false`, clients MUST tolerate the `artifacts` field being omitted entirely;
- never fetch all pages or all histories into memory without a configured upper bound;
- every returned task must still pass SmartAIHub identity/tenant/resource authorization correlation before it can affect `worker_jobs`.

### Reconciliation watermarks

For large fleets, SmartAIHub SHOULD persist a per-agent reconciliation watermark using `statusTimestampAfter` plus cursor state when supported, while still handling timestamp ties/idempotent reprocessing safely.

# 30. Human Input

When remote state becomes:

```text
TASK_STATE_INPUT_REQUIRED
```

SmartAIHub SHALL map it to the shared input/approval surface.

Flow:

```text
A2A remote agent
→ INPUT_REQUIRED
→ normalized worker_job_event
→ Shared Approval/Input Service
→ Web / Assistant UI
→ user response
→ A2A Message on same task/context
→ remote agent resumes
```

Input requests SHOULD retain provider-native message/metadata.

---

# 31. Authentication Required

When remote state becomes:

```text
TASK_STATE_AUTH_REQUIRED
```

SmartAIHub SHALL:

1. identify the declared security requirement;
2. route credential acquisition through the shared Credential Broker;
3. present user/admin interaction when necessary;
4. resume the existing task when protocol/provider semantics allow;
5. avoid restarting side-effecting work unnecessarily.

No provider credential SHALL be embedded in Agent Task prompts.

---

# 32. Cancellation

User cancellation:

```text
SmartAIHub desired_state = canceled
   ↓
selected route
   ├── A2A → CancelTask
   └── native → Spec 200 provider cancellation
```

Cancellation acknowledgement does not mean remote side effects were rolled back.

Record:

```text
cancel_requested_at
cancel_acknowledged_at
remote_state
verification_after_cancel
```

---

# 33. A2A Artifacts

A2A `Artifact` is the preferred representation of task output.

Map:

```text
A2A Artifact
→ Artifact Ingestion
→ security validation
→ Asset/Library Gateway
→ artifact://...
→ worker_job result
```

Possible outputs:

```text
video
image
audio
document
code patch
report
structured JSON
timeline
subtitle
logs
```

## 33.1 Artifact validation

Before trusted Library publication:

```text
MIME sniff
declared MIME comparison
size limit
checksum
malware/security scan where applicable
archive safety
media metadata probe
tenant quota
content policy hooks where required
```

## 33.2 Partial/incremental artifacts

If the A2A SDK/binding exposes incremental artifact updates, SmartAIHub SHALL map them into:

```text
artifact.progress
artifact.updated
artifact.completed
```

Only completed/validated artifacts become final Library outputs.

---

# 34. Media and Large Assets

For a task such as:

> Edit these three videos and accompanying images into a professional video no longer than three minutes.

Canonical path:

```text
Library Asset IDs
      ↓
Asset Gateway
      ↓
job-scoped access
      ↓
A2A Message:
  Text Part
  Data Part for constraints
  URL/File Parts for authorized media
      ↓
Remote Agent
      ↓
Artifact result
      ↓
Library ingestion
```

Do not place entire video binaries into the A2A message unless there is a specific bounded reason.

Use:

```text
short-lived signed URLs
restricted range access
job-scoped access tokens
content-type / size constraints
```

URLs MUST expire.

---

# 35. SmartAIHub Skills With an A2A Agent

The existence of A2A does not change the SmartAIHub Skill ownership rule.

SmartAIHub Skills remain:

```text
centrally hosted
centrally versioned
centrally permissioned
centrally billed
centrally audited
executed through SmartAIHub
```

An A2A agent MUST NOT receive Skill ZIP files by default.

## 35.1 Tool-capable remote agents

If the remote agent supports an approved tool integration mechanism:

```text
SmartAIHub governed MCP surface
provider-native tool bridge
approved callback capability
```

Spec 200 / Spec 199 rules continue to govern the tool surface.

## 35.2 A2A-to-A2A capability delegation

SmartAIHub MAY additionally expose higher-level SmartAIHub Agents via A2A.

Example:

```text
External A2A Agent
      ↓ A2A
SmartAIHub Video Production Agent
      ↓ internally
Skills / Workflows / MCP / Runner
```

This is agent delegation, not direct Skill download.

---

# 36. SmartAIHub as A2A Client

Primary initial role:

```text
SmartAIHub = A2A Client
External Agent = A2A Server
```

Responsibilities:

```text
Agent Card discovery
signature verification
auth
interface negotiation
SendMessage / SendStreamingMessage
GetTask
ListTasks
CancelTask
SubscribeToTask
push notification configuration
Extended Agent Card
extension negotiation
artifact ingestion
```

---

# 37. SmartAIHub as A2A Server

Spec 206 defines the outbound-facing SmartAIHub A2A Server as the Phase 5
inbound-server release gate. It is not required to enable the initial Phase 1–3
A2A client/hybrid rollout.

External systems may invoke SmartAIHub agents.

```text
External Agent
      ↓ A2A
SmartAIHub A2A Gateway
      ↓
A2A Server Adapter
      ↓
LangGraph / Capability Resolver
      ↓
SmartAIHub Agent
      ↓
Skills / Workflows / Spec 199 MCP / Runner
```

This SHALL not bypass normal SmartAIHub policy.

---

# 38. SmartAIHub Agent Cards

Each externally exposed SmartAIHub agent SHOULD have its own Agent Card.

Example agents:

```text
SmartAIHub Video Production Agent
SmartAIHub Research Agent
SmartAIHub Presentation Agent
SmartAIHub Coding Orchestrator Agent
SmartAIHub Drama Production Agent
```

Do not publish one enormous Agent Card containing every platform capability.

Use focused cards and/or authenticated Extended Agent Cards.

---

# 39. Agent Card Publication

Public discovery path:

```text
/.well-known/agent-card.json
```

For multiple agents, use documented agent-specific discovery/registry routing and distinct Agent Cards.

Cards SHOULD be signed.

A SmartAIHub Agent Card SHALL NOT expose:

```text
internal prompts
private source code
raw provider credentials
Skill implementation files
private MCP credentials
internal-only endpoints
tenant-private capability names without authorization
```

---

# 40. Multi-Tenancy

A2A 1.0 supports tenant-aware interface routing.

SmartAIHub SHALL preserve the `tenant` value declared in the selected `AgentInterface`.

Inbound A2A traffic SHALL additionally map authenticated identity to:

```text
SmartAIHub tenant
user/service account
agent connection
policy
quota/budget
```

The remote A2A `tenant` value is a routing input.

It is not by itself proof of authorization.

Never trust an opaque tenant string without authenticated authorization.

---

# 41. Security Schemes

Support according to Agent Card declarations and platform policy:

```text
API key
HTTP auth
OAuth 2.0
OpenID Connect
mTLS
```

For OAuth 2.0 prefer current secure flows such as:

```text
Authorization Code + PKCE
Device Code when appropriate
client credentials for service-to-service where policy allows
```

Do not use deprecated implicit/password flows.

---

## 41A. Security-Requirement Resolution and In-Task Authorization Semantics

A2A authentication is established at the transport/protocol layer; identity is not trusted from task/message payload text.

The Credential Broker SHALL resolve Agent Card / AgentSkill security requirements using the OpenAPI-style security requirement semantics implemented by the A2A SDK/spec model, including required OAuth scopes.

For OAuth/OIDC discovery metadata such as:

```text
oauth2MetadataUrl
openIdConnectUrl
```

SmartAIHub SHALL apply the same HTTPS, SSRF, redirect, size and issuer-validation controls used for other externally discovered security metadata.

If an Authorization Code flow declares `pkceRequired = true`, PKCE is mandatory. SmartAIHub SHOULD use PKCE for public clients even when not marked required.

### `TASK_STATE_AUTH_REQUIRED` is not authorization

The state transition itself SHALL NEVER be interpreted as permission to perform any operation.

When `AUTH_REQUIRED` is received:

```text
remote request for authorization
→ identify operation/scope through provider-defined contract or negotiated extension
→ obtain credential/authorization out of band
→ bind credential to intended agent/operation/scope
→ resume task using the defined mechanism
```

A credential acquired for one authorization interruption MUST NOT automatically authorize later turns, child tasks, or unrelated operations unless the issuer/provider contract explicitly grants that scope.

SmartAIHub SHOULD prefer out-of-band credential exchange over placing credentials in A2A messages. If a future extension explicitly permits in-band credentials, they MUST be audience-bound, least-privilege, encrypted where appropriate, non-loggable and policy-approved.

# 42. Credential Broker

Credentials SHALL be owned by:

```text
user
tenant
service connection
platform
```

Never by the LLM prompt.

The A2A adapter receives only:

```text
credential_handle
```

The Credential Broker resolves it at execution time.

Audit records MAY include credential identity metadata but MUST NOT include secret material.

---

# 43. SSRF and Network Boundary

A2A discovery and callback URLs create SSRF risk.

All externally supplied URLs SHALL pass:

```text
scheme allowlist
DNS resolution checks
private/loopback/link-local policy
port policy
redirect policy
DNS rebinding defense
timeout
response size limit
TLS validation
hostname allow/deny policy
```

Local Runner-discovered A2A endpoints are a separate trust domain and MUST be bound to the Runner identity.

---

# 44. Prompt Injection and External Agent Trust

Remote Agent Cards, messages, artifacts and metadata are untrusted external inputs.

They SHALL NOT be allowed to:

```text
change system policy
expand tenant scope
grant new capabilities
grant new credentials
disable approvals
change billing authority
bypass Spec 199
override verification rules
```

Capability and permission changes require platform-controlled policy, not agent text.

---

# 45. Route Pinning

Once an execution attempt starts, the selected protocol route SHALL normally be pinned.

Do not switch from A2A to native mid-execution simply because the stream dropped.

First attempt:

```text
GetTask
SubscribeToTask
push/poll reconciliation
```

A route change creates a new execution attempt under the same high-level goal.

---

# 46. Safe Fallback

Fallback is not equivalent to blind retry.

Before A2A → native fallback, classify the failure.

## Safe before remote task creation

Examples:

```text
Agent Card fetch failed
unsupported extension
version mismatch
auth setup unavailable
A2A health probe failed
```

Native fallback can proceed.

## Ambiguous after request transmission

Examples:

```text
timeout after SendMessage
connection dropped after task submission
HTTP 502 after body may have reached server
```

SmartAIHub MUST reconcile before fallback to avoid duplicate side effects.

Use:

```text
execution_intent_id
idempotency metadata where supported
GetTask/ListTasks reconciliation
provider context/task correlation
```

If execution ownership is uncertain:

```text
DO NOT start duplicate native execution automatically
```

---

# 47. Fallback Parity Contract

When A2A is unavailable and Spec 200 native integration is selected, SmartAIHub SHALL preserve as much equivalent behavior as the provider exposes.

Canonical parity dimensions:

```text
start task
multi-turn context
progress
streaming
cancel
resume/reconcile
human input
auth request
approval
tool/capability access
asset input
artifact output
structured data
usage
errors
audit
trace
verification
Library publication
```

Each adapter SHALL publish its capability support explicitly.

The UI MUST NOT pretend a missing feature exists.

---

# 48. Feature Degradation

Example:

```text
Agent: Provider X
A2A route: unavailable
Native route: available

Native limitations:
- no push notification
- no remote task listing
- limited session resume
```

The canonical job still works.

The UI may display technical details in an expandable diagnostics panel.

Normal users should not be forced to understand protocol differences.

---

# 49. Canonical Event Mapping

A2A SHALL map into existing Spec 200 event families.

Examples:

```text
Task created
→ agent.session.started / agent.turn.started

Task status WORKING
→ agent.progress

Message text
→ agent.message.delta / agent.message.completed

Artifact update
→ artifact.updated

Artifact complete
→ artifact.created / artifact.uploaded

INPUT_REQUIRED
→ approval.required or input.required

AUTH_REQUIRED
→ auth.required

COMPLETED
→ agent.turn.completed

FAILED
→ agent.turn.failed

CANCELED
→ agent.cancelled
```

Additions required by Spec 206:

```text
interop.route.selected
interop.route.degraded
interop.route.fallback_requested
interop.route.fallback_blocked_ambiguous
a2a.agent_card.discovered
a2a.agent_card.updated
a2a.agent_card.verification_failed
a2a.task.bound
a2a.task.reconciled
a2a.subscription.resumed
a2a.push.received
```

---

# 50. Canonical Error Model

Extend Spec 200 error taxonomy with:

```text
A2A_AGENT_CARD_NOT_FOUND
A2A_AGENT_CARD_INVALID
A2A_AGENT_CARD_SIGNATURE_FAILED
A2A_VERSION_UNSUPPORTED
A2A_BINDING_UNSUPPORTED
A2A_REQUIRED_EXTENSION_UNSUPPORTED
A2A_AUTH_SCHEME_UNSUPPORTED
A2A_AUTH_FAILED
A2A_TASK_NOT_FOUND
A2A_TASK_REJECTED
A2A_TASK_INPUT_REQUIRED
A2A_TASK_AUTH_REQUIRED
A2A_STREAM_INTERRUPTED
A2A_SUBSCRIBE_UNSUPPORTED
A2A_PUSH_CONFIGURATION_FAILED
A2A_PROTOCOL_ERROR
A2A_ARTIFACT_INVALID
A2A_REMOTE_RATE_LIMITED
A2A_REMOTE_BUSY
INTEROP_FALLBACK_BLOCKED_AMBIGUOUS_EXECUTION
```

Retain raw provider/A2A diagnostic details separately.

---

## 50A. A2A Standard Error Preservation and Binding Validation

The A2A adapter SHALL preserve the standard A2A semantic error type in addition to Spec 200's normalized error taxonomy.

At minimum recognize:

```text
TaskNotFoundError
TaskNotCancelableError
PushNotificationNotSupportedError
UnsupportedOperationError
ContentTypeNotSupportedError
InvalidAgentResponseError
ExtendedAgentCardNotConfiguredError
ExtensionSupportRequiredError
VersionNotSupportedError
```

For the standard 1.0 bindings, the adapter SHALL validate/marshal these consistently with the selected binding rather than matching only human-readable strings.

Canonical JSON-RPC A2A-specific codes include:

```text
-32001 TaskNotFoundError
-32002 TaskNotCancelableError
-32003 PushNotificationNotSupportedError
-32004 UnsupportedOperationError
-32005 ContentTypeNotSupportedError
-32006 InvalidAgentResponseError
-32007 ExtendedAgentCardNotConfiguredError
-32008 ExtensionSupportRequiredError
-32009 VersionNotSupportedError
```

Binding-native error details SHALL be retained in the native diagnostic payload, including typed error details where the SDK exposes them.

### Wire-shape validation

For A2A 1.0 JSON representations:

- field names SHALL use the A2A/ProtoJSON camelCase names;
- enum values SHALL use the ProtoJSON string form such as `TASK_STATE_WORKING` / `ROLE_USER`;
- timestamps SHALL be ISO-8601 UTC representations as defined by the protocol;
- unrecognized forward-compatible fields SHOULD be ignored/preserved according to SDK behavior rather than causing brittle manual-deserializer failures;
- a structurally invalid agent response SHALL become `InvalidAgentResponseError` / `A2A_PROTOCOL_ERROR`, not a silent partial success.

Do not implement protocol behavior by scraping error message text.

# 51. Data Model

These are logical schema additions. Exact naming may follow repository conventions.
They are not permission boundaries by themselves. Every row that is tenant- or
user-visible MUST carry `tenant_id` (or an enforced foreign-key path to a
tenant-scoped parent), and every read/write MUST apply server-derived tenant and
actor scope. New route/binding rows MUST reference the canonical
`worker_jobs`/`worker_job_attempts` rows with restrictive foreign keys where the
repository schema supports them. Agent Card cache refresh, route decision and
binding creation MUST be idempotent and transactionally durable; a remote send
must never be the only record of an execution attempt.

## 51.1 external_agent_interfaces

```text
id
tenant_id                  // required unless external_agent_id is globally immutable and FK-scoped
external_agent_id
interface_type             // a2a | spec200_native | provider_api
protocol_binding
protocol_version
endpoint_url_encrypted_or_ref
tenant_routing_value
priority_order
enabled
discovery_source
health_state
last_health_at
created_at
updated_at
```

## 51.2 external_agent_a2a_cards

```text
id
tenant_id
external_agent_id
card_scope                 // public | extended
credential_owner_scope
raw_card_artifact_ref
card_hash
version
etag
last_modified
signature_status
trust_state
fetched_at
expires_at
normalized_json
```

## 51.3 external_agent_capabilities

```text
id
tenant_id
external_agent_id
source_type                // a2a_agent_skill | native_provider | registry
source_capability_id
name
description
tags_json
input_modes_json
output_modes_json
security_requirements_json
capability_metadata_json
snapshot_hash
active
```

## 51.4 external_agent_extensions

```text
id
tenant_id
external_agent_id
extension_uri
description
required
params_json
supported_locally
enabled_by_policy
```

## 51.5 agent_interop_route_decisions

```text
id
tenant_id
worker_job_id
worker_job_attempt_id
execution_intent_id
external_agent_id
selected_route
selected_interface_id
fallback_route
requirements_snapshot_json
capability_snapshot_json
policy_snapshot_ref
health_snapshot_json
degradation_json
decision_reason_code
idempotency_key
created_at
```

`worker_job_id`, `worker_job_attempt_id`, `tenant_id`, and the external-agent
binding MUST be checked together. A client-supplied job ID or route decision ID
MUST never widen the authenticated scope.

## 51.6 a2a_task_bindings

```text
id
tenant_id
worker_job_id
worker_job_attempt_id
external_agent_id
route_decision_id
provider_task_id
provider_context_id
protocol_version
selected_interface_id
last_remote_state
last_remote_timestamp
last_reconciled_at
binding_state
last_event_sequence
created_at
updated_at
```

This table is a binding/index only.

It is NOT durable job truth.

## 51.7 a2a_push_configs

```text
id
tenant_id
a2a_task_binding_id
remote_config_id
callback_handle
token_secret_handle
auth_secret_handle
status
created_at
updated_at
```

No secret values in plaintext columns.

The implementation MUST define tenant-scoped uniqueness for logical identity
and replay protection, at minimum for `(tenant_id, external_agent_id,
card_hash)`, `(tenant_id, worker_job_id, execution_intent_id)`, and the remote
binding/provider-task identity. Exact index names may follow Drizzle
conventions. Cache rows MUST be treated as untrusted input until validated;
the normalized projection MUST NOT become an authorization source.

---

# 52. Capability Registry Integration

The shared Capability Registry SHALL expose:

```text
capability_type = external_agent
```

Normalized searchable fields may include:

```text
agent name
provider
AgentSkill names
descriptions
tags
input modes
output modes
A2A availability
native availability
execution location
tenant availability
health
cost metadata if known
policy tags
```

The Resolver SHOULD avoid placing the complete Agent Card catalog into the LLM context.

Use semantic discovery + lazy detail retrieval.

The projection MUST use the shared Capability Registry/Resolver contract from
Specs 199/200. A2A Agent Card claims are descriptive until the server-side
policy, tenant scope, health, trust and current Runner snapshot admit them.
They MUST NOT directly authorize a tool, Skill, MCP upstream, billing rate or
private asset.

---

# 53. SmartAIHub Agent-Facing Discovery APIs

Internal canonical APIs remain:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

Spec 206 may add internal management APIs:

```text
agent_interop.resolve
agent_interop.inspect_route
agent_interop.refresh_agent_card
agent_interop.health
```

These do not replace the shared capability APIs.

---

# 54. Backend APIs

Example management APIs:

```text
POST /v1/external-agents
GET  /v1/external-agents/{id}
POST /v1/external-agents/{id}/refresh
GET  /v1/external-agents/{id}/interop
POST /v1/external-agents/{id}/health-check
```

Execution should continue through the existing canonical Agent Task API defined by Spec 200.

Every management API MUST require server-derived tenant/actor authorization,
tenant-scoped idempotency for mutations, SSRF/credential-broker checks for
refresh and health operations, and opaque-ID/resource correlation before
returning whether an external agent exists. These APIs manage the Spec 206
interop projection; they MUST NOT create a second Spec 200 agent registry or
accept remote payload fields as tenant, actor, queue, runner or adapter
authority.

Do not create separate:

```text
POST /v1/a2a-jobs
```

for normal product execution.

---

# 55. Runner Architecture

Remote cloud A2A agents can normally be contacted by the SmartAIHub backend or approved edge service.

Local A2A agents may only be reachable from a user's machine.

For local A2A:

```text
SmartAIHub Backend
      ↓ shared Runner Control Channel
SmartAIHub Runner
      ↓
A2A Client Adapter
      ↓ localhost/private local endpoint
Local A2A Agent
```

No inbound Internet port on the user's device is required.

Runner reports:

```text
a2a_endpoint_discovered
a2a_agent_card_hash
a2a_bindings
a2a_protocol_version
a2a_health
```

within the same Runner capability snapshot.

This is an extension of Feature 205's existing `RunnerCapabilitySnapshot` and
the authenticated Runner Control Channel. It MUST NOT add an A2A device
registry, a second WebSocket, or a backend-to-user-device inbound port. A local
A2A command is admissible only when the enrolled Runner identity, tenant/user
binding, capability snapshot revision, freshness and policy all match the
server-side route decision. The Runner MUST revalidate the local endpoint and
Agent Card hash after restart; a reused localhost port does not inherit trust.

---

# 56. Runner Local Security

Local A2A endpoint access SHALL enforce:

```text
loopback/private endpoint ownership
process identity where possible
port collision protection
endpoint re-verification after restart
Agent Card hash change detection
local TLS where supported
provider/runtime binding
```

A process appearing later on the same port MUST NOT automatically inherit trust from the previous process.

---

# 57. SmartAIHub Worker App

Windows Worker App and headless Runner SHALL share the same Spec 206 interoperability library where possible.

```text
shared:
  A2A discovery
  card validation
  version negotiation
  route feature model
  task/event normalization
  error mapping
```

The Worker App may provide richer local diagnostics UI.

It MUST NOT implement a divergent protocol model.

---

# 58. UI / UX — External Agent Connection

External Agent detail page:

```text
Agent
Provider
Connection status

Interoperability
  Preferred route: A2A
  A2A version: 1.0
  Binding: HTTP+JSON
  Agent Card: Verified / ...
  Native fallback: Available

Capabilities
  Streaming
  Long-running tasks
  Cancel
  Resume/reconcile
  Push notifications
  Input required
  Auth required
  File input
  Artifact output

Security
  Authentication method
  Credential owner
  Last verification
```

Normal users do not need protocol configuration.

Advanced users/admins may expand diagnostics.

---

# 59. UI / UX — Job View

Job card SHALL remain protocol-independent.

Example:

```text
Professional Video Edit
Running — 62%

Agent: External Video Editor
Execution: Cloud
Protocol: A2A   [details]

✓ Assets prepared
✓ Analysis complete
● Building edit
○ Rendering
○ Publishing

[Pause if supported] [Cancel]
```

If native fallback is used:

```text
Protocol: Native compatibility
```

only in details/diagnostics unless relevant.

---

# 60. UI / UX — Input/Auth Required

Use the shared Assistant interaction model.

Examples:

```text
Agent needs input
"Choose cinematic or corporate music style"

[ Cinematic ] [ Corporate ] [Custom...]
```

or:

```text
Authorization required
Connect Provider X to continue

[Connect]
```

The user should not need to understand `TASK_STATE_INPUT_REQUIRED` or `TASK_STATE_AUTH_REQUIRED`.

---

# 61. Protocol Health

Maintain health dimensions:

```text
Agent Card fetch
signature verification
DNS/TLS
authentication
selected interface
SendMessage probe where safe
stream capability
push callback capability
native fallback health
```

Avoid destructive health checks.

Health checks MUST NOT create billable/side-effecting tasks unless explicitly designed as test tasks.

---

# 62. Circuit Breakers

Track failures per:

```text
external_agent
interface
tenant credential
region/execution node
```

Possible circuit states:

```text
closed
open
half_open
```

A2A circuit failure MAY cause new tasks to use Spec 200 fallback.

It SHALL NOT move active tasks unless their execution ownership is safely resolved.

---

# 63. Rate Limits and Backpressure

Normalize remote rate-limit/busy responses into Spec 200 job control.

Support:

```text
Retry-After
provider-specific retry hints
tenant budgets
global connection limits
per-agent concurrency
stream connection limits
push callback rate limits
```

Retries remain owned by one failure domain.

Do not let:

```text
A2A SDK retry
+
Spec 206 retry
+
worker_jobs retry
```

all retry the same side-effecting operation independently.

---

# 64. Idempotency

Every high-level execution has:

```text
execution_intent_id
```

Every transport attempt has:

```text
execution_attempt_id
```

Every remote task binding has:

```text
provider_task_id
```

The transport adapter SHOULD attach correlation/idempotency metadata where safely supported.

Even when the remote protocol does not guarantee idempotency, SmartAIHub uses these identifiers to prevent local duplicate dispatch.

---

# 65. Observability

Required metrics:

```text
a2a_agent_card_fetch_total
a2a_agent_card_fetch_failed_total
a2a_signature_verify_failed_total
a2a_route_selected_total
native_route_selected_total
a2a_fallback_total
a2a_fallback_blocked_ambiguous_total
a2a_task_created_total
a2a_task_reconcile_total
a2a_stream_disconnect_total
a2a_resubscribe_total
a2a_push_received_total
a2a_artifact_ingest_failed_total
a2a_latency_seconds
agent_interop_route_decision_seconds
```

Dimensions must be cardinality-safe.

Do not put raw task IDs into metric labels.

---

# 66. Distributed Tracing

Propagate where possible:

```text
trace_id
conversation_id
orchestration_run_id
agent_task_id
worker_job_id
capability_call_id
execution_intent_id
execution_attempt_id
runner_id
provider_session_id
provider_task_id
provider_context_id
artifact_id
```

If remote A2A extension/metadata supports trace correlation, use it.

Do not expose internal sensitive IDs unnecessarily.

---

# 67. Audit

Audit:

```text
agent registered
Agent Card discovered
Agent Card changed
signature status changed
credential selected
route selected
fallback considered
fallback executed
fallback blocked
task submitted
task reconciled
input/auth requested
user approval/input
artifact received
artifact validated
task canceled
verification performed
final result published
```

Audit records SHALL distinguish:

```text
user action
system policy action
remote agent claim
verified platform fact
```

---

# 68. Billing and Cost

A2A does not become the billing authority.

Record:

```text
remote usage if supplied
provider cost if supplied and trustworthy as metadata
SmartAIHub Skill usage
SmartAIHub orchestration usage
Runner usage
storage/artifact usage
```

Skill billing and revenue sharing still execute through SmartAIHub.

External-agent usage MAY have its own provider/subscription billing model.

Do not infer exact provider costs if not supplied.

---

# 69. Context / RAG

A2A agents receive context through the same Spec 200 Context Package and Retrieval Broker policy.

A2A SHALL NOT receive unrestricted RAG corpus access.

Initial message MAY contain:

```text
bounded Context Package
```

Live retrieval requires a governed capability mechanism supported by the selected agent route.

All retrieval retains:

```text
tenant ACL
project ACL
document ACL
lineage
revocation
provenance
```

---

# 70. A2A Inbound Server Authorization

When SmartAIHub acts as A2A Server:

```text
authenticate
→ identify connection
→ resolve tenant/user/service account
→ evaluate requested agent
→ evaluate task policy
→ budget/quota
→ create normal SmartAIHub worker_job
```

Inbound A2A calls MUST NOT create a special non-audited execution path.

---

# 71. A2A Inbound Task Mapping

Inbound request:

```text
SendMessage / SendStreamingMessage
```

maps into:

```text
Agent Task Manifest
→ worker_job
→ LangGraph / selected SmartAIHub Agent
```

Remote A2A task ID and context ID are provider-facing bindings only.

SmartAIHub keeps its own canonical IDs.

---

# 72. Inbound Artifacts

For SmartAIHub A2A Server responses:

```text
internal SmartAIHub result
→ canonical ArtifactRef
→ A2A Artifact
```

Large SmartAIHub Library assets SHOULD be returned as:

```text
short-lived authorized URL
```

rather than raw bytes.

---

# 73. Inbound Streaming

When SmartAIHub is an A2A Server and declares streaming:

```text
worker_job_events
→ A2A streaming adapter
→ remote client
```

The server SHALL obey backpressure and stream cancellation.

A disconnected client does not automatically cancel the underlying worker job.

---

# 74. Inbound Push Notifications

When a remote client registers push notifications:

- validate callback URL;
- apply SSRF policy;
- store secrets in Credential Broker;
- enforce tenant/task binding;
- retry with bounded policy;
- do not leak task existence across tenants.

---

# 75. Multi-Agent Delegation

A2A unlocks cross-vendor multi-agent delegation.

Example:

```text
SmartAIHub Orchestrator
   │
   ├── A2A Research Agent
   │       ↓
   │     Artifact: research brief
   │
   ├── A2A Script Agent
   │       ↓
   │     Artifact: script
   │
   └── A2A Video Agent
           ↓
         Artifact: video
```

LangGraph remains the orchestrator.

A2A agents do not become independent owners of the overall SmartAIHub workflow state.

---

# 76. Agent Handoff

A handoff SHALL be modeled explicitly:

```text
parent worker_job
child worker_job
handoff reason
input artifact/context refs
output artifact refs
trace continuity
```

Do not represent multi-agent delegation as hidden recursive calls with no job visibility.

---

# 77. Agent Collaboration and Opaque Internals

A2A's value is that agents can remain opaque.

SmartAIHub SHOULD depend on:

```text
declared capabilities
messages
tasks
artifacts
security contract
```

and SHOULD NOT require:

```text
remote internal prompt
remote memory internals
remote tool implementation
remote orchestration source code
```

This reduces vendor coupling.

---

# 78. Provider-Native Capability Preservation

A2A normalization MUST NOT erase useful provider-native capabilities.

Store:

```text
normalized payload
+
native protocol/provider payload
```

If a native Spec 200 adapter exposes features unavailable in A2A, those capabilities remain available when the native route is selected.

The goal is standardization without lowest-common-denominator loss.

---

# 79. Route-Specific Extensions in UI

Advanced diagnostics MAY expose route-specific data:

A2A:

```text
Agent Card
binding
protocol version
remote task ID
context ID
extensions
push notification state
signature status
```

Native:

```text
provider runtime
provider session ID
adapter version
CLI/SDK transport
native capability snapshot
```

The main job UI remains common.

---

# 80. Compatibility Testing

Every external agent integration SHALL run a common parity test suite against every available route.

Example scenario:

```text
same agent
same task family
A2A route
vs
native Spec 200 route
```

Verify canonical behavior:

```text
job lifecycle
progress
cancel
input
auth
artifact
result
verification
audit
billing hooks
```

The raw event sequence may differ.

The canonical contract must remain compatible.

---

# 81. A2A Conformance Testing

Use official A2A ecosystem validation tooling where practical:

```text
A2A Inspector
A2A Technology Compatibility Kit (TCK)
official SDK tests
```

SmartAIHub A2A Server SHALL pass applicable protocol conformance tests before production enablement.

---

# 82. Required Test Matrix

## Protocol

```text
A2A 1.0 HTTP+JSON
A2A 1.0 JSON-RPC
A2A 1.0 gRPC
optional A2A 0.3 compatibility
```

## Lifecycle

```text
immediate response
long-running task
streaming task
polling task
push-notified task
input required
auth required
cancel
failed
rejected
```

## Failure

```text
Agent Card unavailable
invalid Agent Card
signature failure
TLS failure
unsupported binding
unsupported required extension
auth failure
rate limit
stream disconnect
backend restart
Runner restart
duplicate push
duplicate event
artifact download failure
ambiguous timeout after submission
```

## Security

```text
SSRF URL
private IP redirect
DNS rebinding
malicious Agent Card metadata
malicious artifact MIME
cross-tenant task ID
cross-tenant Extended Agent Card
credential leakage attempt
extension schema attack
replay
```

---

# 83. Contract Test — A2A Happy Path

Release gate:

```text
1. User requests an external-agent task.
2. Capability Resolver selects external agent.
3. Spec 206 obtains Agent Card.
4. Signature is verified or trust policy is satisfied.
5. A2A 1.0 interface is selected.
6. Required modalities/features are satisfied.
7. Route is persisted as A2A.
8. Normal worker_job is created/used.
9. SendStreamingMessage starts remote work.
10. A2A task is bound to worker_job.
11. Progress maps to worker_job_events.
12. Agent requests user input.
13. Shared UI collects input.
14. Message continues same task/context.
15. Remote agent produces Artifact.
16. Artifact is validated and ingested to Library.
17. Remote task reports COMPLETED.
18. SmartAIHub performs independent verification.
19. Final canonical job result is published.
20. Audit trace contains one end-to-end execution intent.
```

---

# 84. Contract Test — Automatic Native Fallback

```text
1. Agent has A2A Agent Card.
2. Current task requires a capability not available on the A2A route.
3. Spec 206 detects incompatibility before remote dispatch.
4. Native Spec 200 adapter is healthy.
5. Route decision selects native fallback.
6. Same Agent Task Manifest is used.
7. Same worker_job/event/UI contracts are used.
8. Final output appears exactly in the normal SmartAIHub result surface.
9. Route diagnostics explain the fallback reason.
```

No user intervention is required unless policy demands it.

---

# 85. Contract Test — Ambiguous Dispatch

```text
1. SmartAIHub sends A2A SendMessage.
2. Connection times out after transmission.
3. Remote task creation is uncertain.
4. Spec 206 does NOT immediately start native fallback.
5. Reconciliation attempts GetTask/ListTasks/correlation.
6. If ownership is proven:
      continue/reconcile A2A.
7. If safe non-execution is proven:
      native fallback may start.
8. If ambiguity remains:
      job enters recoverable ambiguous state.
9. No duplicate side-effecting execution occurs automatically.
```

---

# 86. Contract Test — Local Agent via Runner

```text
1. Runner detects provider runtime.
2. Runner also discovers local A2A Agent Card.
3. Capability snapshot advertises A2A + native routes.
4. Spec 206 chooses A2A.
5. Backend sends command over existing Runner Control Channel.
6. Runner talks to local A2A endpoint.
7. Local A2A stream maps to normalized events.
8. Runner disconnects from backend temporarily.
9. Local agent continues.
10. Runner buffers events.
11. Runner reconnects and replays.
12. worker_jobs remains durable truth.
```

---

# 87. Contract Test — A2A Server Mode

```text
1. External client fetches SmartAIHub Agent Card.
2. Client validates SmartAIHub signature.
3. Client authenticates.
4. Client sends A2A task.
5. SmartAIHub maps connection to tenant/service account.
6. SmartAIHub creates canonical Agent Task + worker_job.
7. Internal agent uses Skills and Spec 199 MCP capabilities.
8. Progress streams through A2A.
9. Artifact is produced from Library.
10. Remote client receives terminal task state.
11. Full SmartAIHub audit/provenance exists.
```

---

# 88. Acceptance Criteria

Spec 206 SHALL NOT be considered complete until:

The checklist is phase-gated. The Phase 0–3 client/hybrid release is the initial
production target. Phase 4 binding expansion and Phase 5 inbound SmartAIHub A2A
server mode are separate release gates; their unchecked items MUST NOT be
silently treated as Phase 1/2 implementation requirements.

- [ ] A2A Agent Card discovery works using the v1.0 well-known path.
- [ ] Agent Card validation rejects malformed cards.
- [ ] JWS Agent Card signature verification is implemented.
- [ ] Extended Agent Card retrieval is supported.
- [ ] `supportedInterfaces` ordering is honored.
- [ ] eligible A2A interfaces fail over in declared order before Spec 200 native fallback.
- [ ] A2A 1.0 HTTP+JSON is supported.
- [ ] A2A 1.0 JSON-RPC is supported where required.
- [ ] **Phase 4:** A2A 1.0 gRPC is supported where deployment/runtime requires it.
- [ ] Agent Card `tenant` routing is preserved.
- [ ] required/optional extensions are negotiated.
- [ ] AgentSkill is stored separately from SmartAIHub executable Skills.
- [ ] A2A capability profile feeds the shared Capability Registry.
- [ ] per-task interoperability requirements are generated.
- [ ] routing is deterministic and auditable.
- [ ] A2A is preferred when it fully satisfies the task.
- [ ] native Spec 200 fallback occurs automatically when A2A is unavailable/inadequate.
- [ ] route fallback does not duplicate side-effecting work.
- [ ] route selection is pinned per execution attempt.
- [ ] A2A Task binds to normal `worker_jobs`.
- [ ] no `a2a_jobs` queue/source-of-truth exists.
- [ ] all A2A task states map correctly.
- [ ] `TASK_STATE_INPUT_REQUIRED` reaches shared UI.
- [ ] `TASK_STATE_AUTH_REQUIRED` reaches shared Credential/Approval flow.
- [ ] cancellation works.
- [ ] streaming works.
- [ ] resubscription/reconnection works.
- [ ] polling fallback works.
- [ ] push notification works when supported.
- [ ] duplicate push/event delivery is idempotent.
- [ ] `ListTasks` can participate in recovery/reconciliation.
- [ ] A2A artifacts ingest into canonical Library/ArtifactRefs.
- [ ] large media uses safe signed URLs rather than unbounded inline payloads.
- [ ] independent verification remains separate from remote COMPLETED state.
- [ ] normalized events retain native A2A payloads where policy allows.
- [ ] Spec 200 provider-native payloads remain preserved.
- [ ] SmartAIHub Skills remain centrally executed.
- [ ] no Skill ZIP download is required.
- [ ] external MCP calls remain governed by Spec 199.
- [ ] A2A discovery is SSRF protected.
- [ ] push callbacks are SSRF/replay protected.
- [ ] credentials are never exposed to prompts.
- [ ] cross-tenant Agent Card/task leakage tests pass.
- [ ] Runner supports local A2A endpoints without inbound public ports.
- [ ] Worker App and Runner share the same interop implementation/contracts.
- [ ] Web job UI remains protocol-independent.
- [ ] advanced UI can display route diagnostics.
- [ ] observability metrics are implemented.
- [ ] trace IDs correlate A2A/native execution.
- [ ] billing hooks remain shared.
- [ ] SmartAIHub can operate as an A2A client.
- [ ] **Phase 5:** SmartAIHub can operate as an A2A server for selected published agents.
- [ ] **Phase 5:** SmartAIHub Agent Cards can be signed.
- [ ] **Phase 5:** inbound A2A tasks use normal tenant policy and worker_jobs.
- [ ] **Phase 4/5:** A2A Inspector/TCK-compatible validation is part of CI or release validation.
- [ ] parity tests compare A2A and Spec 200 native routes.
- [ ] all Spec 199/200 shared architecture invariants remain intact.

---

# 89. Implementation Phases

## Phase 0 — Shared interoperability contracts

Implement:

```text
AgentInteropRequirements
AgentInteropFeatureMatrix
AgentInteropRouteDecision
A2AProtocolAdapter interface
A2A/native parity contract
new normalized interop events
schema migrations
feature flags
Feature 186 executor registration/admission for `external_agent_task`
exact mapping to the existing AgentTaskManifest and worker-job attempt/lease model
tenant-scoped uniqueness/FK policy for route and binding records
disabled-by-default dependency compatibility manifest
```

No live A2A provider required for core unit tests.

## Phase 1 — A2A Client Foundation

Implement:

```text
Agent Card fetch/cache
Agent Card validation
JWS verification
A2A interface negotiation
A2A 1.0 HTTP+JSON
SendMessage
SendStreamingMessage
GetTask
CancelTask
SubscribeToTask
task binding
event normalization
artifact ingestion
```

## Phase 2 — Intelligent Hybrid Routing

Implement:

```text
feature matrix
task requirement derivation
A2A-first router
Spec 200 fallback
safe fallback rules
circuit breaker
health
route audit
route diagnostics
```

## Phase 3 — Long-Running Reliability

Implement:

```text
push notifications
ListTasks reconciliation
adaptive polling
backend restart reconciliation
ambiguous dispatch protection
idempotency/correlation
```

## Phase 4 — Full Binding Coverage

Implement/test:

```text
JSON-RPC
gRPC
optional v0.3 compatibility
```

Do not block Phase 1 on every binding if current target agents use HTTP+JSON.
Phase 4 is a release gate only for deployments that advertise JSON-RPC/gRPC;
the feature matrix MUST report an unsupported binding rather than emulate it.

## Phase 5 — SmartAIHub A2A Server

Implement:

```text
published Agent Cards
signed cards
Extended Agent Card
inbound auth
inbound SendMessage/streaming
inbound task mapping
inbound push handling
multi-tenant routing
artifact export
```

## Phase 6 — SmartAIHub Extensions

Add only when real use cases require:

```text
asset-ref/v1
capability-context/v1
billing-budget/v1
provenance/v1
```

## Phase 7 — Multi-Agent A2A Workflows

Implement:

```text
cross-vendor delegation
parent/child jobs
artifact handoff
independent review
bounded retry/fix loops
team/tenant policies
```

---

## 89A. SDK Compatibility and Supply-Chain Policy

A2A SDK packages evolve independently of the protocol specification. SmartAIHub SHALL maintain a tested compatibility manifest instead of using unconstrained dependency upgrades.

Per implementation language/runtime record:

```text
sdk package
sdk version
protocol versions implemented
enabled bindings
runtime/language minimum version
known blocked versions
TCK/Inspector result
security advisory status
last tested date
```

Rules:

- production builds SHALL use lockfiles / reproducible dependency resolution;
- SDK major/minor updates require parity + integration tests before rollout;
- a newer SDK MUST NOT automatically enable a new A2A protocol major version;
- Runner and backend may use different SDK languages/versions only if canonical parity tests pass;
- security hotfixes MAY be fast-tracked but still require protocol smoke tests;
- dependency signatures/checksums/provenance SHOULD be verified where the package ecosystem supports it;
- transitive HTTP/gRPC/SSE parsers SHALL have bounded message/event sizes to mitigate memory-exhaustion attacks;
- rollback to a last-known-good SDK build SHALL be operationally supported.

The compatibility manifest is operational metadata and MUST NOT be hard-coded into LLM prompts.

# 90. Feature Flags

Recommended:

```text
A2A_INTEROP_ENABLED
A2A_DISCOVERY_ENABLED
A2A_CARD_SIGNATURE_VERIFY
A2A_EXTENDED_CARD_ENABLED
A2A_AUTO_FALLBACK_ENABLED
A2A_PUSH_ENABLED
A2A_GRPC_ENABLED
A2A_JSONRPC_ENABLED
A2A_V03_COMPAT_ENABLED
A2A_SERVER_ENABLED
A2A_SMARTAIHUB_EXTENSIONS_ENABLED
```

Feature flags MUST NOT bypass security policy. In this repository they must be
represented by the existing governed feature/settings mechanism (with
server-side tenant/ops evaluation), not by a client-provided flag or an
unregistered environment variable. Defaults are OFF. Enabling discovery without
enabling execution is supported; enabling execution requires the Phase 0
executor/admission and credential/SSRF gates to pass.

---

# 91. Recommended Code Organization

Example:

```text
agent-interop/
  core/
    requirements.ts
    feature-matrix.ts
    route-decision.ts
    route-policy.ts
    parity.ts
    errors.ts

  a2a/
    protocol-adapter.ts
    client/
      discovery.ts
      card-cache.ts
      card-signature.ts
      extended-card.ts
      interface-selector.ts
      extension-negotiation.ts
      message-mapper.ts
      task-mapper.ts
      artifact-mapper.ts
      streaming.ts
      push.ts
      reconciliation.ts

    server/
      agent-card-publisher.ts
      card-signer.ts
      auth.ts
      request-mapper.ts
      task-service.ts
      streaming.ts
      push.ts

    bindings/
      http-json/
      jsonrpc/
      grpc/

    compat/
      v0_3/

  native/
    spec200-bridge.ts

  routing/
    router.ts
    health.ts
    circuit-breaker.ts
    fallback.ts
    ambiguity-guard.ts

  security/
    ssrf.ts
    credential-broker.ts
    trust.ts
    redaction.ts

  observability/
    metrics.ts
    tracing.ts
    audit.ts

  testing/
    fake-a2a-agent.ts
    fake-native-agent.ts
    parity-fixtures.ts
```

Exact paths may follow existing SmartAIHub repository conventions.

---

# 92. Suggested Type Interfaces

`UniversalAgentTaskManifest` is a logical name only; it is not a repository
type. The implementation MUST use the validated Feature 200
`AgentTaskManifest` together with a server-owned `AgentInteropIntent`/policy
object. The latter may carry candidate external-agent identity, protocol policy
and required features, but it MUST remain outside the provider manifest unless
an explicitly versioned Feature 200 contract extension is approved.

```ts
interface AgentInteropAdapter {
  inspect(agent: ExternalAgentRef): Promise<AgentInteropFeatureMatrix>;
  start(task: AgentTaskManifest, intent: AgentInteropIntent): Promise<InteropExecutionBinding>;
  sendMessage(binding: InteropExecutionBinding, message: CanonicalAgentMessage): Promise<void>;
  cancel(binding: InteropExecutionBinding): Promise<void>;
  reconcile(binding: InteropExecutionBinding): Promise<CanonicalAgentState>;
  subscribe?(binding: InteropExecutionBinding): AsyncIterable<CanonicalAgentEvent>;
}

interface AgentInteropRouter {
  resolve(
    task: AgentTaskManifest,
    intent: AgentInteropIntent,
    candidates: AgentInteropCandidate[],
    policy: InteropPolicy
  ): Promise<AgentInteropRouteDecision>;
}
```

A2A and Spec 200 native adapters implement the same canonical interface.

---

# 93. Route Decision Pseudocode

```python
def choose_route(task, external_agent, policy):
    requirements = derive_requirements(task, policy)

    a2a = inspect_a2a(external_agent)
    native = inspect_spec200_native(external_agent)

    if policy.protocol_policy == "native_required":
        return require_native(native, requirements)

    if policy.protocol_policy == "a2a_required":
        return require_a2a(a2a, requirements)

    if policy.protocol_policy == "native_preferred":
        if native.satisfies(requirements):
            return native
        if a2a.satisfies(requirements):
            return a2a
        raise NoCompatibleRoute()

    # default: a2a_preferred
    # inspect_a2a returns eligible interfaces in Agent Card preference order.
    for a2a_interface in a2a.eligible_interfaces(requirements):
        if a2a_interface.security_ok and a2a_interface.health_ok:
            return a2a_interface

    # Native fallback is considered only after eligible A2A interfaces are exhausted.
    if native.satisfies(requirements) and native.security_ok and native.health_ok:
        return native.with_degradation(a2a.failure_reasons)

    raise NoCompatibleRoute()
```

The actual implementation SHALL also include policy snapshots, health/circuit state and ambiguity safeguards.

---

# 94. Migration From Existing Spec 200

Migration is additive.

Existing:

```text
External Agent
→ Spec 200 provider adapter
```

Step 1:

```text
External Agent
→ Spec 206 Router
→ Spec 200 provider adapter
```

No behavior change yet.

Step 2:

```text
External Agent
→ Spec 206 Router
   ├── A2A
   └── Spec 200 native
```

Step 3:

A2A becomes preferred after parity/reliability gates pass.

No existing provider adapter should be deleted during the initial rollout.

---

# 95. Required Cross-Spec Update

Spec 199 and Spec 200 MUST receive a short companion-reference amendment before
Phase 1 is enabled. Feature 204 and Feature 205 also carry the ownership
relationship needed by the Runner/Container paths. This audit does not rewrite
those specifications from zero; the required boundaries below keep the
companion documents from drifting.

## Spec 199

Add:

```text
Companion Spec 206 handles A2A agent interoperability.
A2A does not change Spec 199 ownership of external MCP lifecycle,
credentials, schema, quarantine and execution.
```

## Spec 200

Add:

```text
Companion Spec 206 selects between A2A and Spec 200 native provider adapters.
Spec 200 remains the native/fallback External Agent runtime integration layer.
Both routes normalize into Spec 200 canonical Agent Task/event/result contracts.

For the current repository, that statement means the existing
`AgentTaskManifest`/`AgentEvent` boundary and `external_agent_task` job type;
it does not authorize a new `coding_agent` queue. Any future Spec 200 contract
version or provider expansion must be added to the compatibility matrix before
Spec 206 accepts it.
```

Do not rewrite Spec 199 or Spec 200 from zero.

## Feature 204 and Feature 205

Feature 204 remains the canonical owner of Cloudflare Container provisioning,
pooling, image rollout, autoscaling, cost ceilings and rollback. Feature 205
remains the canonical owner of enrolled Runner identity, capability snapshots,
local/container process envelopes and the authenticated Runner Control Channel.
Spec 206 may consume those contracts for remote or local A2A transport, but it
MUST NOT create an A2A-specific Container scheduler, Runner/device registry,
WebSocket, release/update path or local task ledger. A2A execution is eligible
only after the existing Feature 204/205 runtime, snapshot freshness, tenant
binding and policy gates pass.

---

# 96. Non-Goals

Spec 206 does not:

- replace LangGraph;
- replace OpenAI Agents SDK as SmartAIHub's default internal cognitive executor;
- replace Spec 199;
- replace Spec 200;
- replace `worker_jobs`;
- expose SmartAIHub source code to external agents by default;
- distribute private Skill code;
- make A2A the transport for every tool call;
- require every SmartAIHub Skill to become an A2A Agent;
- trust remote AgentSkill claims without policy;
- eliminate provider-native features;
- guarantee that every A2A agent can use SmartAIHub tools;
- make remote Agent Card metadata authoritative for billing/security.

---

# 97. Key Decisions

## Decision 1

**A2A-first, Spec 200 fallback.**

## Decision 2

**Protocol choice is capability-driven per task, not provider-name driven.**

## Decision 3

**A2A discovery is insufficient by itself; the selected interface must satisfy task, security and health requirements.**

## Decision 4

**One Universal Agent Task Manifest for both routes.**

## Decision 5

**One normalized event/result contract for both routes.**

## Decision 6

**Preserve native/raw payloads to avoid lowest-common-denominator loss.**

## Decision 7

**A2A Task binds to `worker_jobs`; it does not replace it.**

## Decision 8

**Use A2A streaming/resubscription/push/ListTasks fully for long-running reliability.**

## Decision 9

**Use Agent Card signatures, Extended Agent Cards, interface/version/extension negotiation and multi-tenancy rather than implementing A2A as a thin HTTP wrapper.**

## Decision 10

**SmartAIHub becomes both an A2A Client and an A2A Server.**

## Decision 11

**External agent capabilities (`AgentSkill`) and executable SmartAIHub Skills remain distinct.**

## Decision 12

**A2A agent collaboration and MCP tool access remain separate responsibilities.**

---

# 98. Why This Extracts the Full Value of A2A

Spec 206 uses A2A for more than basic message exchange.

It deliberately uses:

```text
Agent Card discovery
ordered supportedInterfaces
protocol version negotiation
Agent Card JWS signatures
Extended Agent Cards
security scheme discovery
AgentSkill capability descriptions
input/output modalities
Tasks
Messages
Parts
Artifacts
structured data
file references
streaming
resubscription
push notifications
polling fallback
ListTasks reconciliation
CancelTask
INPUT_REQUIRED
AUTH_REQUIRED
extensions
multi-tenancy
multi-binding support
A2A client mode
A2A server mode
```

This gives SmartAIHub a standards-based horizontal agent interoperability layer while retaining its own stronger platform capabilities:

```text
LangGraph orchestration
Unified Job Control Plane
Runner reliability
Capability governance
MCP governance
Skill marketplace
RAG
Library
billing
approval
audit
verification
```

---


# 98A. Canonical A2A ↔ Spec 200 Parity Matrix

The implementation SHALL maintain this equivalence map.

| Canonical SmartAIHub behavior | A2A route | Spec 200 native route |
|---|---|---|
| Agent discovery | Agent Card / registry | Runner runtime/provider discovery |
| Capability description | AgentSkill + Agent Card capabilities | provider/native capability snapshot |
| Session/context | `contextId` + task history | provider session/thread/conversation ID |
| Start work | `SendMessage` / `SendStreamingMessage` | provider start/turn RPC/CLI/SDK |
| Live progress | streaming `StreamResponse` | provider stream-json/NDJSON/JSON-RPC events |
| Async status | `GetTask` | provider status + Runner state |
| Reconnect | `SubscribeToTask` + `GetTask` | Spec 200 resume/reconcile |
| Fleet recovery | `ListTasks` where supported | Runner reconciliation/provider session inventory |
| Long-running disconnected update | push notification | Runner Control Channel + durable replay / provider callback |
| User input | `TASK_STATE_INPUT_REQUIRED` | provider input/approval adapter |
| Authentication interruption | `TASK_STATE_AUTH_REQUIRED` | provider-native auth-required flow |
| Cancellation | `CancelTask` | provider-native cancel |
| Text/structured/file input | A2A `Part` | provider-native prompt/tool/file bridge |
| Output | A2A `Artifact` / direct `Message` | provider final result/artifact |
| Modality negotiation | input/output modes + `acceptedOutputModes` | native feature matrix |
| Extension negotiation | A2A extensions | provider adapter extensions |
| Security discovery | Agent Card security schemes | provider/runtime configuration |
| Multi-tenancy | authenticated identity + interface `tenant` | SmartAIHub tenant/job scope |
| Verification | SmartAIHub independent verification | SmartAIHub independent verification |
| Billing/audit | shared SmartAIHub platform | shared SmartAIHub platform |

The parity goal is **canonical behavioral equivalence**, not byte-for-byte event equality.

A2A-first means:

```text
if A2A satisfies all hard task requirements:
    select A2A
```

SmartAIHub SHALL NOT select the native route merely because it is marginally faster, cheaper, or exposes richer diagnostics when the A2A route already satisfies the task, unless an explicit platform/tenant policy requires that exception.

---

# 98B. A2A Send Configuration Strategy

Spec 206 SHALL use A2A 1.0 `SendMessageConfiguration` deliberately rather than relying on defaults.

## `acceptedOutputModes`

Populate from:

```text
AgentInteropRequirements.required_output_modes
+
SmartAIHub outputs that the caller can safely consume
```

This lets the remote agent tailor artifacts/messages to supported media types.

## `returnImmediately`

For long-running jobs:

```text
returnImmediately = true
```

then use:

```text
SubscribeToTask
push notifications
or GetTask polling
```

For small synchronous interactions, blocking behavior MAY be used when policy and timeout bounds allow it.

Do not hold web/backend request workers open for unbounded agent execution.

## `historyLength`

Use a bounded value based on task/session policy.

Do not request unlimited history by default.

Task history is useful for:

```text
resume
reconciliation
user-visible transcript
input-required continuation
```

but must obey privacy and retention policy.

## Direct Message response

A2A `SendMessage` may return either:

```text
Task
or
Message
```

Spec 206 MUST support both.

A direct `Message` response maps to a completed canonical turn unless the content itself establishes another required platform action.

Do not create a fake remote Task ID when the server returned only a Message.

---

# 98C. Wire-Level A2A 1.0 Requirements

The protocol adapter SHALL correctly implement binding-specific A2A 1.0 service parameters.

Where applicable:

```text
A2A-Version
A2A-Extensions
tenant
```

For HTTP+JSON, implementation SHALL follow the versioned A2A v1.0.0 content negotiation rules, preferring:

```text
application/a2a+json
```

for A2A HTTP binding payloads where required by the specification/SDK.

A2A 1.0 HTTP routes MUST NOT be hard-coded with the removed legacy `/v1/` path prefix.

Use the selected AgentInterface base URL plus the current binding mapping.

---

# 98D. Event Ordering and Deduplication

SmartAIHub SHALL NOT assume that every remote A2A implementation provides a globally monotonic event sequence suitable for the Spec 200 normalized envelope.

The adapter SHALL create a **local normalized sequence** after events cross the SmartAIHub reliability boundary.

Store when available:

```text
remote event identifier
remote timestamp
remote task state
remote artifact identifier
payload fingerprint
```

Deduplicate using stable remote identifiers when available and defensive fingerprints otherwise.

Push notifications, stream events and reconciliation reads may report overlapping state.

They MUST converge on one durable `worker_job` history rather than creating duplicate logical events.

---

# 98E. Agent Card Change Detection and Quarantine

Every refreshed Agent Card SHALL be diffed against the last trusted snapshot.

Changes are classified.

## Low-risk descriptive change

Examples:

```text
description
examples
tags
icon
```

May update automatically.

## Capability change

Examples:

```text
AgentSkill added/removed
input/output modes changed
streaming/push capability changed
```

Refresh capability projections and invalidate affected route caches.

## Security-sensitive change

Examples:

```text
endpoint URL changed
provider identity changed
security scheme changed
required extension changed
protocol major version changed
tenant routing changed
signing key/signature trust changed
```

New task dispatch SHOULD enter revalidation/quarantine until policy checks succeed.

Existing active tasks remain bound to the snapshot/interface they started with unless a security incident requires termination.

Never silently trust a completely different endpoint because an Agent Card changed.

---

# 98F. Data Egress and DLP Policy

A2A usually means data crosses an agent boundary.

Before SmartAIHub sends:

```text
RAG excerpts
Help content
specifications
source-code context
Library assets
project metadata
conversation history
credentials-derived information
```

the Data Egress Policy SHALL evaluate:

```text
tenant policy
user authorization
agent/provider trust
data classification
task necessity
allowed region/provider if configured
retention policy
asset sensitivity
```

Send the minimum required data.

A successful Agent Card signature does not authorize data egress.

Data egress authorization remains a SmartAIHub policy decision.

For large assets, signed URLs SHALL be:

```text
short-lived
job-scoped
least-privilege
revocable where infrastructure permits
```

---

# 98G. A2A Server Resource Scoping

When SmartAIHub acts as an A2A Server, authorization checks for:

```text
GetTask
ListTasks
CancelTask
SubscribeToTask
push notification configuration
Extended Agent Card
```

MUST occur before data access that could disclose whether another tenant's resource exists.

`ListTasks` MUST return only resources visible to the authenticated caller.

`GetTask` and related operations MUST treat an inaccessible task as non-disclosable according to the platform's error policy.

A2A task IDs are never sufficient authorization.

---

# 98H. Route Cache Invalidation

A route decision cache MUST be invalidated when any relevant input changes:

```text
Agent Card hash
Extended Agent Card hash
credential availability
security/trust state
required extension support
AgentSkill/capability snapshot
task requirement profile
tenant policy
health/circuit state
native adapter version/health
Runner availability
```

A cached A2A route SHALL NOT survive a security-sensitive Agent Card change without revalidation.



# 98I. Push Notification Configuration Lifecycle

To use A2A asynchronous operation completely, Spec 206 SHALL support the A2A task push-notification configuration lifecycle where exposed:

```text
CreateTaskPushNotificationConfig
GetTaskPushNotificationConfig
ListTaskPushNotificationConfigs
DeleteTaskPushNotificationConfig
```

SmartAIHub SHALL remove obsolete callback registrations after:

```text
task completion
task cancellation
connection revocation
credential revocation
tenant deletion
configured retention expiry
```

Push configuration cleanup failures SHALL be observable and retried safely, but SHALL NOT rewrite terminal job truth.

---

# 98J. External Agent Identity Binding

SmartAIHub MUST NOT merge two interfaces into one logical external agent solely because:

```text
name matches
description matches
provider string matches
host name looks similar
```

A2A and Spec 200 native routes may be treated as routes to the same logical agent only when identity binding is established through one or more trusted mechanisms such as:

```text
curated provider metadata
administrator binding
provider-issued stable identifier
verified Agent Card/provider identity
signed registry relationship
SmartAIHub-managed installation metadata
```

Persist the evidence used for the binding.

If identity cannot be established, represent them as separate external agents rather than risk dispatching a task to the wrong system.

---

# 98K. Fallback Failure Classification

Automatic compatibility fallback SHALL occur primarily for **route viability failures**, not ordinary agent reasoning/task failures.

Safe fallback reasons include:

```text
A2A_NOT_DISCOVERED
A2A_VERSION_UNSUPPORTED
A2A_BINDING_UNSUPPORTED
A2A_REQUIRED_EXTENSION_UNSUPPORTED
A2A_REQUIRED_FEATURE_MISSING
A2A_AUTH_MECHANISM_UNAVAILABLE
A2A_SECURITY_POLICY_BLOCKED
A2A_INTERFACE_UNHEALTHY
A2A_PRE_DISPATCH_TRANSPORT_FAILURE
```

After a remote A2A task is known to have started:

```text
TASK_STATE_FAILED
TASK_STATE_REJECTED
verification failure
agent produced poor result
```

are not automatically treated as protocol-fallback reasons.

They are task/orchestration outcomes.

LangGraph / job policy may explicitly create a new native execution attempt for retry/replan/handoff, but that action MUST be recorded as a new attempt under the same high-level execution intent and must obey side-effect/idempotency policy.

This distinction prevents Spec 206 from hiding real agent failures by silently running the same work again through another route.

---

# 98L. Twelve-Pass Architecture Audit Gate

Before implementation is declared architecture-ready, the spec/repository design SHALL be reviewed against these independent audit passes:

1. **Ownership audit** — no duplicate Spec 186/199/200/shared infrastructure ownership.
2. **Protocol audit** — A2A 1.0 operations, bindings, headers, task states and Agent Card semantics.
3. **Parity audit** — A2A/native canonical behavior equivalence.
4. **Fallback audit** — no duplicate execution after ambiguous dispatch.
5. **Reliability audit** — reconnect, subscribe, push, polling and restart reconciliation.
6. **Security audit** — auth, JWS, SSRF, credential isolation, prompt/external-input trust.
7. **Tenant audit** — resource scoping, Extended Card isolation, task visibility.
8. **Data audit** — AssetRef, Artifact, media egress, Library ingestion and DLP.
9. **Capability audit** — AgentSkill vs SmartAIHub Skill vs MCP ownership.
10. **Runner audit** — local A2A/native execution uses the same Runner identity/control plane.
11. **UX/observability audit** — one protocol-independent user flow with diagnostic transparency.
12. **Migration/test audit** — existing Spec 200 providers continue working and parity/TCK tests gate rollout.

Any implementation gap found in these audits SHALL be resolved in the owning spec/code rather than worked around by creating another parallel subsystem.


# 98M. Remote Task Lifecycle, Orphan Recovery and Retention

A2A creates durable remote task identities that may outlive a SmartAIHub process/session. Spec 206 SHALL explicitly manage orphan and retention cases.

## Remote-orphan detection

A binding may become orphaned when:

```text
SmartAIHub job exists but remote task no longer exists
remote task exists but local binding/job was lost before commit
credential revoked while remote task continues
agent removed/endpoint migrated during active work
tenant/user loses authorization during long-running execution
```

Recovery order:

```text
local binding / audit / dispatch receipt
→ GetTask when provider_task_id is known
→ scoped ListTasks/correlation when safe and supported
→ provider/native diagnostics if this was a fallback-capable logical agent
→ manual/admin recovery state when ownership remains ambiguous
```

Never attach an uncorrelated remote task merely because its text/creation time resembles the user's request.

## Authorization revocation during execution

If tenant/user/connection authorization is revoked:

- block new messages, artifact retrieval and new capability calls immediately;
- attempt cancellation when policy requires and the caller is still authorized to request it;
- continue receiving only the minimum events needed for safe cleanup/audit if platform policy permits;
- do not expose newly received content to the revoked caller;
- expire job-scoped signed asset URLs/tokens where possible.

## Retention

Retention policies SHALL separately cover:

```text
Agent Card snapshots
Extended Agent Card snapshots
raw native/A2A event streams
normalized events
remote task bindings
partial artifacts
push configs
signed URL metadata
credential handles
final artifacts/provenance
```

Remote A2A task deletion is not assumed to exist as a core protocol operation. SmartAIHub data-deletion/privacy workflows SHALL delete local retained data and invoke provider-specific deletion mechanisms only when the remote provider actually exposes them.

## Cleanup release gate

CI/integration tests SHALL verify cleanup after:

```text
completed
failed
canceled
rejected
input/auth timeout
credential revocation
agent uninstall
push config removal
partial artifact failure
```

This prevents long-running A2A support from accumulating stale secrets, callbacks and temporary media.


# 98N. Effective Extended Agent Card View and Session Pinning

A2A 1.0 states that, after an authenticated Extended Agent Card is retrieved, clients SHOULD use it in place of the public Agent Card for the duration of the authenticated session or until the card version changes.

Spec 206 SHALL therefore maintain two concepts:

```text
immutable/public discovery snapshot
+
effective authenticated Agent Card view
```

Rules:

1. The public card remains retained for provenance and re-discovery.
2. After successful `GetExtendedAgentCard`, routing/capability decisions for that authenticated connection SHALL use the Extended Agent Card as the effective card.
3. The effective card is scoped to the credential owner, tenant, scopes and authenticated session/security context that produced it.
4. The effective card MUST NOT leak into unauthenticated or differently scoped sessions.
5. A public-card or extended-card version/hash change invalidates the effective route cache and requires capability/security re-evaluation for new execution attempts.
6. Active execution attempts remain pinned to the trusted snapshots they started with unless a security revocation requires interruption.
7. `ExtendedAgentCardNotConfiguredError` and `UnsupportedOperationError` SHALL be distinguished from ordinary authentication failure.

This closes the gap between storing public/extended cards separately and actually applying the A2A replacement semantics during execution.

---

# 98O. Task-State Robustness and Unknown-State Handling

The canonical A2A state model includes `TASK_STATE_UNSPECIFIED` in addition to the normal submitted/working/interrupted/terminal states.

SmartAIHub SHALL map:

```text
TASK_STATE_UNSPECIFIED
→ remote_state_unknown
→ reconcile_required
```

Rules:

- `TASK_STATE_UNSPECIFIED` MUST NOT be interpreted as completed, failed, queued or safe-to-retry.
- An unknown future enum value SHALL be retained in the native payload and normalized to `remote_state_unknown` rather than crashing a deserializer or inventing a semantic mapping.
- Terminal states remain immutable for the same remote task ID.
- Interrupted states (`INPUT_REQUIRED`, `AUTH_REQUIRED`) are non-terminal and MUST retain execution ownership.
- Apparent state regression, such as `WORKING → SUBMITTED`, SHALL be treated as a reconciliation anomaly unless the provider's documented semantics prove otherwise.
- Timestamp comparison alone SHALL NOT override a later authoritative `GetTask` result when clocks may differ.

A state anomaly MUST NOT trigger automatic native fallback while execution ownership is uncertain.

---

# 98P. Message, Status-Message and History Reliability Contract

A2A Messages are communication; Artifacts are task outputs. A2A also explicitly does not guarantee that every Message is persisted in Task history or recoverable after a streaming disconnect.

Therefore SmartAIHub SHALL NOT use status/history Messages as the sole durable source for critical facts.

Critical facts include:

```text
task terminal state
approval/input requirement
billing commitment
side-effect completion
artifact completion
security decision
verification result
```

Rules:

1. `TaskStatus.message` MAY be shown as user-visible progress/context, but the state field remains the state authority.
2. Critical outputs SHOULD be represented by A2A Artifacts and canonical SmartAIHub result records, not only by ephemeral Messages.
3. After stream reconnect, SmartAIHub MUST assume some informational/status messages may have been missed.
4. `GetTask.history` is bounded, provider-selected persistence and MUST NOT be treated as a full audit log.
5. SmartAIHub's own normalized event/audit stream remains the platform audit source of truth.
6. Before showing an interrupted state to the user, preserve the latest available status message, but tolerate it being absent.

---

# 98Q. Part Validation and Content-Safety Contract

Every A2A `Part` MUST contain exactly one content member:

```text
text
raw
url
data
```

Spec 206 SHALL validate this one-of invariant before any content reaches prompts, tools, Library ingestion or remote dispatch.

## Raw parts

For JSON bindings, `raw` is base64-encoded bytes.

SmartAIHub SHALL enforce:

```text
base64 validity
encoded-size limit
decoded-size limit
MIME validation
memory/spool threshold
malware/content inspection where applicable
```

Large media SHOULD NOT use `raw`.

## URL parts

Every URL Part is untrusted input.

Fetching SHALL use the same network egress/SSRF controls as Agent Card discovery, plus:

```text
allowlisted schemes
redirect revalidation at every hop
DNS rebinding defense
private/link-local policy
maximum response bytes
maximum decompressed bytes
content-type sniffing
request timeout
credential isolation
```

Remote URLs MUST NOT inherit the A2A server's Authorization header unless an explicit authorized asset-access contract requires it.

## Data parts

Structured `data` SHALL have configured limits for:

```text
maximum nesting depth
maximum keys/elements
maximum serialized size
schema validation when a schema is known
```

## Filename/mediaType

`filename` is display metadata, not a filesystem path. Path traversal components MUST be stripped/rejected before local materialization.

Declared `mediaType` MUST be checked against actual content when content is ingested.

---

# 98R. Protocol-Version Downgrade Guard

A2A 1.0 requires protocol versions to be negotiated by Major.Minor and warns clients that need newer capabilities against silent fallback to older versions.

Spec 206 SHALL NOT silently downgrade an execution from A2A 1.0 to A2A 0.3 merely because a legacy-compatible endpoint is available.

Before any protocol downgrade:

```text
rebuild feature matrix
re-evaluate AgentInteropRequirements
re-evaluate extension availability
re-evaluate task/list/push/stream semantics
re-evaluate security/auth behavior
```

Rules:

- `a2a_required` with required 1.0 features fails closed if only 0.3 can satisfy transport connectivity.
- `a2a_preferred` MAY use 0.3 only when the explicit compatibility policy is enabled and all hard task requirements still pass.
- The downgrade is persisted in `RouteDecision.degradation` and visible in diagnostics.
- A version downgrade after an ambiguous dispatch is prohibited until execution ownership is reconciled.
- Patch releases do not change wire compatibility and MUST NOT become a patch-level protocol negotiation value.

---

# 98S. A2A Service-Parameter Enforcement

For A2A 1.0 requests, SmartAIHub SHALL transmit the selected protocol version on every applicable request using the binding's service-parameter mechanism.

Canonical values:

```text
A2A-Version: 1.0
A2A-Extensions: <only explicitly activated extension URIs>
```

Requirements:

1. The adapter MUST NOT depend on an omitted version header being interpreted as 1.0; the specification defines empty/absent compatibility behavior around legacy 0.3.
2. HTTP bindings use the registered A2A service parameters according to the selected binding.
3. gRPC carries service parameters as metadata and MUST account for lowercase metadata-key normalization.
4. Custom bindings MUST explicitly define how service parameters are transmitted before SmartAIHub enables them.
5. `A2A-Extensions` SHALL contain only extensions that were actually negotiated/activated for that request.
6. A required extension advertised by the server but not declared by the client SHALL surface as `ExtensionSupportRequiredError`, not a generic provider failure.

---

# 98T. Cancellation and Terminal-Race Reconciliation

Cancellation is a request to the remote agent, not proof that all side effects stopped or rolled back.

When `CancelTask` returns `TaskNotCancelableError`, SmartAIHub SHALL distinguish at least:

```text
task already terminal
provider refuses cancellation
resource inaccessible/not found
protocol/transport failure
```

Recommended handling:

```text
CancelTask
  ├─ updated Task returned → persist/reconcile state
  ├─ TaskNotCancelableError → GetTask immediately when authorized
  ├─ TaskNotFoundError → resource-scope/orphan reconciliation
  └─ ambiguous transport failure → ownership remains uncertain
```

Rules:

- Never start a fallback execution solely because cancellation was not acknowledged.
- If completion races with cancellation, terminal remote state plus independent verification determines the final SmartAIHub presentation.
- A canceled SmartAIHub desired state SHALL block new downstream side effects even if late remote events arrive.
- Late artifacts after cancellation may be retained for audit/quarantine according to policy but SHALL NOT automatically become accepted final output.

---

# 98U. Long-Running Credential Refresh and Authentication Failure Semantics

Long-running A2A tasks can outlive OAuth access tokens, session cookies or mTLS rotations.

Spec 206 SHALL distinguish:

```text
transport authentication failure (e.g. HTTP 401/403)
vs
A2A TASK_STATE_AUTH_REQUIRED
```

They are not equivalent.

For transport authentication failure:

1. Credential Broker may refresh/rotate credentials if policy permits.
2. A read-only operation such as `GetTask` or `SubscribeToTask` may be retried after credential refresh.
3. A side-effecting `SendMessage` MUST NOT be blindly resent after an ambiguous authentication/transport failure; reconcile first.
4. Refresh failure moves the local job to an authentication-blocked/recoverable state without losing the remote task binding.
5. Credential refresh tokens and private keys never enter provider prompts or persisted native logs.

For `TASK_STATE_AUTH_REQUIRED`, follow the task's requested authorization flow and preserve the same task/context when the protocol/provider allows continuation.

Push-notification callback credentials SHOULD be task-specific and independently revocable rather than reusing broad provider credentials.

---

# 98V. Stream/Client Lifecycle and Graceful Shutdown

Spec 206 SHALL explicitly manage client and stream lifecycle to prevent leaked SSE/gRPC connections, lost buffered events or accidental cancellation during deploy/restart.

On SmartAIHub service shutdown:

```text
stop accepting new dispatches
→ persist dispatch/binding state
→ stop opening new subscriptions
→ drain normalized event buffer for bounded time
→ checkpoint active stream/subscription state
→ close A2A SDK clients/transports
→ leave remote tasks running unless policy explicitly requests cancellation
→ reconcile active bindings after restart
```

Requirements:

- Every SSE/gRPC subscription SHALL have an explicit close/cancel path.
- Consumer backpressure SHALL be bounded; unbounded event queues are prohibited.
- Maximum individual stream-event size and cumulative buffered size SHALL be configured.
- Slow UI consumers MUST NOT block the protocol reader indefinitely; events cross into the durable/replay boundary first.
- Application shutdown MUST NOT infer remote task failure simply because the local stream closed.
- Duplicate events observed after restart/resubscription remain idempotent.

---

# 98W. Binding-Exact Error Representation

Normalized errors do not remove the obligation to speak each A2A binding correctly.

For HTTP+JSON, A2A-specific errors SHALL preserve the standard `google.rpc.Status` JSON shape and the `google.rpc.ErrorInfo` detail used to identify the semantic A2A error when multiple errors share an HTTP status.

For JSON-RPC, preserve the standard A2A error code and typed details in `error.data` according to the A2A 1.0 schema/SDK.

For gRPC, preserve the canonical status mapping and typed details where available.

SmartAIHub SHALL test at minimum:

```text
TaskNotFoundError
TaskNotCancelableError
PushNotificationNotSupportedError
UnsupportedOperationError
ContentTypeNotSupportedError
InvalidAgentResponseError
ExtendedAgentCardNotConfiguredError
ExtensionSupportRequiredError
VersionNotSupportedError
```

Error parsing MUST be structural. Human-readable error strings are diagnostics only.

---

# 98X. Active-Execution Snapshot Pinning and Capability Drift

Each execution attempt SHALL pin the exact interoperability evidence used for dispatch:

```text
public Agent Card hash/version
Extended Agent Card hash/version, if used
effective AgentSkill snapshot
selected AgentInterface
protocol version
activated extensions
security requirement/scopes
route policy snapshot
credential-handle identity/version
native fallback capability snapshot
```

If discovery later shows that capabilities or endpoints changed:

- new tasks use the refreshed snapshot after validation;
- active tasks continue against their pinned route when safe;
- security revocation, signing-key compromise, endpoint takeover or admin disable may force interruption/quarantine;
- an active task MUST NOT silently gain newly advertised capabilities or broader scopes;
- continuation Messages on an existing task SHALL use the pinned protocol/interface unless re-negotiation is explicitly safe and documented.

This prevents TOCTOU behavior where route authorization was evaluated against one card but execution later uses another.

---

# 98Y. Inbound A2A Resource and Abuse Budgets

When SmartAIHub acts as an A2A Server, protocol correctness alone is insufficient; each authenticated caller SHALL be subject to explicit resource budgets.

Configurable limits SHALL include:

```text
request body bytes
raw Part decoded bytes
Data Part depth/elements
Message Parts per message
Artifact Parts/chunks
metadata bytes/depth
historyLength maximum actually served
ListTasks page size (protocol max 100)
concurrent tasks per caller/tenant
concurrent streams/subscriptions
push configs per task/caller
push retry budget
requests per operation/time window
artifact output bytes
total task runtime
idle INPUT_REQUIRED/AUTH_REQUIRED duration
```

Rules:

- Reject/limit before expensive model/Runner execution when possible.
- HTTP/gRPC/JSON-RPC errors SHALL map to the appropriate binding-level resource/validation semantics without exposing another tenant's existence.
- Rate limits SHOULD be operation-sensitive; `ListTasks`, streaming and task creation need not share identical quotas.
- Admin/service accounts may have different limits, but authorization and audit still apply.
- Limit changes are policy configuration, not Agent Card metadata controlled by the remote caller.

---


# 98Z. In-Task Authorization Wire Contract

`TASK_STATE_AUTH_REQUIRED` has additional A2A semantics beyond a generic "waiting for login" state.

When SmartAIHub is the A2A client and receives `TASK_STATE_AUTH_REQUIRED`:

1. The TaskStatus SHOULD contain a Message explaining the required authorization; if it is absent, SmartAIHub SHALL tolerate absence only when the authorization details were negotiated out-of-band or by an activated extension.
2. Credentials SHALL normally be fulfilled out-of-band through Credential Broker / OAuth / provider-native authorization, not pasted into a normal A2A Message.
3. In-band credential transfer is prohibited unless a specific negotiated extension or out-of-band agreement defines a safe mechanism.
4. If the remote agent keeps an active stream open while authorization is pending, SmartAIHub SHOULD keep consuming it subject to timeout/resource policy.
5. SmartAIHub SHOULD permit user/client Messages directed at the same Task while it remains `AUTH_REQUIRED` for negotiation, correction or rejection of the authorization request when the remote agent supports it.
6. After out-of-band authorization succeeds, the remote agent may resume processing without requiring a follow-up Message; SmartAIHub MUST therefore continue reconciliation rather than assuming a new turn is always necessary.
7. If SmartAIHub itself is serving an A2A task and delegates an authorization requirement upstream, the same rules apply recursively while preserving parent/child task lineage.

The task remains owned and non-terminal throughout this interrupted state.

---

# 98AA. `returnImmediately` Exact Execution Semantics

Spec 206 SHALL implement A2A 1.0 `SendMessageConfiguration.returnImmediately` exactly rather than treating it as a generic timeout hint.

```text
returnImmediately = false or unset
→ blocking SendMessage waits until the Task reaches:
   terminal: COMPLETED / FAILED / CANCELED / REJECTED
   OR interrupted: INPUT_REQUIRED / AUTH_REQUIRED

returnImmediately = true
→ return after Task creation with the current in-progress/interrupted state
→ caller is responsible for GetTask / SubscribeToTask / push reconciliation
```

Additional rules:

- `returnImmediately` has no effect when the server returns a direct `Message` instead of a Task.
- It has no effect on streaming operations; streaming already delivers updates in real time.
- It does not disable or alter configured push-notification behavior.
- SmartAIHub SHOULD set `true` for long-running product jobs to avoid tying up backend request workers.
- When SmartAIHub chooses blocking mode for bounded interactions, the HTTP/RPC execution timeout MUST be long enough to cover terminal **or interrupted** return semantics, while still having an infrastructure safety ceiling.
- Infrastructure timeout of a blocking request creates an ambiguous-dispatch/reconciliation situation; it MUST NOT automatically trigger duplicate fallback execution.

---


# 98AB. Terminal Subscription Semantics

`SubscribeToTask` is valid only for a task that is not in a terminal state.

If the remote task is already:

```text
TASK_STATE_COMPLETED
TASK_STATE_FAILED
TASK_STATE_CANCELED
TASK_STATE_REJECTED
```

and the server returns `UnsupportedOperationError`, SmartAIHub SHALL treat that response as a protocol-consistent terminal-subscription outcome, not as a transport outage.

Recovery behavior:

```text
SubscribeToTask
  ↓ UnsupportedOperationError
GetTask
  ↓
reconcile canonical state/artifacts
  ↓
close subscription recovery loop
```

Rules:

- do not repeatedly retry `SubscribeToTask` against a known terminal task;
- do not trigger Spec 200 native fallback merely because terminal resubscription is unsupported;
- if terminal status is not yet locally known, `GetTask` SHALL be used to establish the final authoritative remote state;
- concurrent subscription teardown MUST be idempotent.

---

# 98AC. `ListTasks` Unspecified-State and Inclusive-Watermark Semantics

For `ListTasks`, `TASK_STATE_UNSPECIFIED` / enum value `0` is the absence of a status filter. It SHALL NOT be interpreted as a request to return only tasks whose current state is unknown.

Canonical behavior:

```text
status omitted or TASK_STATE_UNSPECIFIED
→ return tasks across all authorized states

status = TASK_STATE_WORKING
→ filter to WORKING only
```

`statusTimestampAfter` is inclusive (`>=`), therefore reconciliation watermarks SHALL deliberately tolerate receiving tasks from the boundary timestamp again.

SmartAIHub SHALL deduplicate boundary results using stable task identity plus state/artifact fingerprints rather than incrementing the timestamp by an arbitrary epsilon that could skip concurrent updates.

---

# 98AD. Push-Notification Configuration Pagination and Identity

`ListTaskPushNotificationConfigs` SHALL implement protocol pagination rather than assuming one callback per task.

Required fields/behavior:

```text
taskId
pageSize
pageToken
nextPageToken
config.id
```

Rules:

- page tokens are opaque and MUST NOT be decoded or synthesized by SmartAIHub;
- cleanup/revocation workflows MUST enumerate all authorized pages within configured bounds;
- `GetTaskPushNotificationConfig` and `DeleteTaskPushNotificationConfig` SHALL address the exact configuration ID, not "the current callback" conceptually;
- duplicate configuration IDs within the same task are a protocol/data-integrity anomaly;
- list responses MUST remain resource-scoped to the authenticated principal and tenant;
- SmartAIHub SHALL clone/copy configuration data before local mutation so SDK-owned/shared response objects are not accidentally mutated in-place.

---

# 98AE. Embedded Push Configuration During `SendMessage`

When `SendMessageConfiguration.taskPushNotificationConfig` is supplied while creating a new remote task, the embedded `TaskPushNotificationConfig.taskId` SHALL be empty as required by A2A 1.0.

SmartAIHub SHALL:

1. generate a unique local callback/config correlation ID;
2. submit the configuration without a task ID during initial `SendMessage`;
3. bind the returned server-created task ID after the response arrives;
4. persist the resulting exact remote configuration identity when exposed;
5. never guess the server task ID before creation.

A non-empty task ID in the embedded initial configuration SHALL fail local validation before network dispatch unless a future negotiated protocol version explicitly changes this rule.

---

# 98AF. Message Context/Task Referential Integrity

A2A `Message` identifiers SHALL obey the protocol relationship between `taskId` and `contextId`.

Rules:

- if both `taskId` and `contextId` are provided, the context MUST match the context of that task;
- if only `taskId` is supplied, an A2A server may infer the task's `contextId`;
- a client MUST NOT deliberately attach a known task ID to a different context;
- server-originated Messages MUST carry `contextId`, and carry `taskId` when associated with a created task;
- cross-tenant/cross-context task references SHALL be rejected before context or task existence is disclosed;
- `referenceTaskIds` provide additional context lineage and do not override the primary `taskId/contextId` relationship.

SmartAIHub SHALL validate this relationship at both ingress and egress boundaries and SHALL persist protocol violations for diagnostics without allowing them to corrupt canonical conversation/job lineage.



# 98AG. Message Role Validation

A2A defines:

```text
ROLE_UNSPECIFIED
ROLE_USER
ROLE_AGENT
```

SmartAIHub SHALL NOT silently reinterpret `ROLE_UNSPECIFIED` as either user or agent.

Rules:

- outbound client-originated request Messages SHALL use `ROLE_USER`;
- server/agent-originated response/status Messages SHALL use `ROLE_AGENT` where the protocol object requires a Message role;
- `ROLE_UNSPECIFIED` on ingress is a protocol anomaly and SHALL be preserved diagnostically while the content is prevented from entering privileged reasoning/action paths until policy resolves or rejects it;
- unknown future role enum values SHALL be preserved in the native payload and normalized to `role_unknown`, not coerced to `ROLE_AGENT`;
- role metadata never replaces authenticated caller identity or authorization.

---

# 98AH. Object-Level Extension Integrity

A2A 1.0 allows `Message` and `Artifact` objects to declare extension URIs that are present or contributed to those objects.

Spec 206 SHALL distinguish:

```text
Agent Card extension support/requirement
request-level activated extensions (A2A-Extensions / binding equivalent)
Message.extensions
Artifact.extensions
```

Rules:

1. Object-level extension URIs MUST be syntactically valid and size/count bounded.
2. A required extension must have passed route-time support/policy negotiation before SmartAIHub relies on its semantics.
3. Presence of an extension URI inside a Message/Artifact does not by itself authorize or activate that extension.
4. Unknown optional object-level extensions MAY be retained opaquely but MUST NOT alter authorization, billing, routing or executable tool policy.
5. Extension payload/metadata SHALL be schema-validated when SmartAIHub advertises support for that extension.
6. Extension URI conflicts or semantic version mismatches SHALL produce a deterministic compatibility/degradation result rather than silent reinterpretation.

---

# 98AI. Security Requirement Boolean Semantics

A2A Security Requirements align with the OpenAPI Security Requirement model. SmartAIHub SHALL preserve their boolean structure rather than flattening all schemes/scopes into one set.

For a list of `SecurityRequirement` objects:

```text
requirement A
OR
requirement B
OR
requirement C
```

Within one `SecurityRequirement` object containing multiple schemes:

```text
scheme X
AND
scheme Y
AND
all scopes/roles required by that requirement
```

Therefore the Credential Broker / route evaluator SHALL:

1. evaluate each alternative requirement independently;
2. select one complete satisfiable alternative allowed by platform policy;
3. satisfy every scheme and required scope within the selected alternative;
4. never combine a partial subset from several alternatives to fabricate a satisfiable requirement;
5. apply AgentSkill-level `securityRequirements` as the effective override when the skill explicitly declares them;
6. validate that every referenced scheme name exists in the effective Agent Card `securitySchemes` map;
7. treat an explicitly anonymous/empty alternative only as permitted when platform policy also allows anonymous access.

This calculation SHALL be included in the immutable execution-attempt interoperability snapshot.

---

# 98AJ. Distributed Trace Propagation and Baggage Safety

For remote HTTP-based A2A calls, SmartAIHub SHOULD propagate W3C Trace Context using:

```text
traceparent
tracestate
```

and equivalent transport metadata/interceptors for gRPC.

Rules:

- remote trace/span IDs SHALL be correlated to, not substituted for, SmartAIHub canonical `trace_id` / execution identifiers;
- inbound trace headers are untrusted and SHALL be syntax/size validated;
- SmartAIHub MUST start a safe local trace when inbound trace context is malformed or disallowed;
- `baggage` SHALL NOT carry credentials, raw user prompts, document contents, asset URLs, tenant secrets or other sensitive/high-cardinality data;
- cross-tenant trace linkage MUST NOT reveal one tenant's identifiers to another;
- sampling decisions must not disable mandatory audit events;
- trace headers SHALL NOT be copied automatically to signed asset URLs or third-party URLs unrelated to the selected A2A interface.



# 98AK. Authorization on Every A2A Operation

When SmartAIHub acts as an A2A Server, authorization SHALL be enforced independently on **every** protocol operation, including at minimum:

```text
SendMessage
SendStreamingMessage
GetTask
ListTasks
CancelTask
SubscribeToTask
CreateTaskPushNotificationConfig
GetTaskPushNotificationConfig
ListTaskPushNotificationConfigs
DeleteTaskPushNotificationConfig
GetExtendedAgentCard
```

Rules:

- successful authentication on one request does not authorize later requests automatically beyond the authenticated session/credential semantics;
- task ownership and tenant/resource scope SHALL be checked before returning task existence, history, artifacts, push configuration or subscription data;
- `SendMessage` targeting an existing task MUST validate caller access to both the task and its context before accepting the new turn;
- push-config operations MUST validate access to the parent task and exact config identity;
- `GetExtendedAgentCard` SHALL expose only the capabilities authorized for the authenticated principal/scope;
- authorization failures SHALL use the binding-appropriate error/status without revealing forbidden resource metadata;
- authorization checks are mandatory even if a trusted reverse proxy has already authenticated the caller.

---

# 98AL. AgentInterface Binding-Specific Endpoint Validation

Each `AgentInterface` SHALL be validated according to its declared `protocolBinding` before it can become an eligible route.

## HTTP-based bindings (`HTTP+JSON`, `JSONRPC` over HTTP)

Production endpoints SHALL:

```text
use an absolute HTTPS URL
have a valid host
use an allowed port/policy
pass SSRF/DNS-rebinding validation
```

SmartAIHub SHOULD reject or quarantine endpoints containing:

```text
userinfo credentials in the URL
fragments
unsupported schemes
unexpected private/link-local addresses outside an explicitly authorized local/Runner trust domain
```

Redirects SHALL be revalidated hop-by-hop and MUST NOT silently downgrade HTTPS to HTTP.

## gRPC binding

The address SHALL match the supported gRPC endpoint form (for example `hostname:port`) and SHALL use TLS in production unless an explicitly isolated local Runner policy permits otherwise.

## Cross-binding consistency

- the selected interface's `tenant` routing value SHALL be propagated exactly where required;
- interface URL/address, binding, protocol version and tenant value SHALL be part of the pinned execution-attempt snapshot;
- DNS/address changes that cross trust zones SHALL trigger revalidation;
- an interface whose binding/address shape is inconsistent SHALL not be "repaired" heuristically into another binding.

---

# 98AM. Official SDK Regression and Lifecycle Gate

Official A2A SDKs are preferred implementation aids, but SmartAIHub SHALL NOT delegate protocol correctness entirely to an SDK version.

The compatibility suite SHALL contain regression tests for known classes of SDK/protocol implementation defects, including:

```text
ListTasks with TASK_STATE_UNSPECIFIED must not incorrectly filter all-state queries
ListTasks request/response pagination serialization
push-notification configuration objects must not be mutated through shared references
append=true for an unknown artifactId must fail safely
non-terminal stream/subscription teardown must release local references/resources
SSE event size must remain bounded
SSE/gRPC teardown must not leak active connections
request metadata must survive transport conversion without type corruption
JSON-RPC error.data / binding-specific error details must retain valid shape
```

SDK upgrade policy:

1. pin exact SDK versions in reproducible builds/lockfiles;
2. run protocol conformance, parity and the regression suite before promotion;
3. test at least the minimum supported and candidate-upgrade SDK/runtime versions;
4. retain rollback to a known-good SDK version;
5. do not change A2A wire protocol policy merely because an SDK uses a higher package version (for example SDK `1.1.x` implementing protocol `1.0`);
6. monitor official A2A SDK/release changelogs for correctness/security changes affecting routing, tasks, streams, push, errors or signatures;
7. treat SDK resource leaks or lifecycle regressions as route-health defects eligible for circuit breaking, not as `worker_job` semantic failures.

---

# 98AN. Push Credential Materialization Boundary

`TaskPushNotificationConfig` may contain a token and `AuthenticationInfo.credentials` required by the remote A2A server when delivering callbacks.

SmartAIHub SHALL keep durable secret material in the shared Credential/Secret Broker and SHALL materialize wire credentials only at the network serialization boundary.

Rules:

- database/audit/event records store secret handles or redacted fingerprints, never raw callback credentials;
- raw callback credentials MUST NOT appear in LangGraph prompts, normalized job events, metrics or ordinary diagnostics;
- callback secrets SHALL be scoped to the minimum task/config lifetime and rotated/revoked when practical;
- deleting/replacing a push config SHALL revoke the associated secret handle when no longer referenced;
- callback verification MUST bind the received token/authentication to the exact tenant/task/config, not merely accept any valid platform token;
- secret material SHALL be zeroized/released from long-lived in-memory caches according to the implementation runtime's capabilities.



# 98AO. Context and Task Identifier Authority

A2A identifier ownership SHALL be enforced exactly at the protocol boundary.

## Task IDs

For a new A2A task:

```text
taskId = server-generated
```

Rules:

- SmartAIHub acting as an A2A client MUST NOT invent or preallocate the remote `taskId` for a new task.
- A client-supplied `taskId` is only valid when referring to an existing remote task.
- If a message references a nonexistent `taskId`, the binding-appropriate `TaskNotFoundError` semantics apply.
- SmartAIHub internal `worker_job_id`, `agent_task_id` or `execution_intent_id` MUST NOT be copied into the remote `taskId` field merely for convenience.
- Correlation SHALL use SmartAIHub metadata/extensions only where negotiated and safe, while the remote `taskId` remains an opaque provider identifier.

## Context IDs

When a client message omits `contextId`, the remote agent MAY generate one. If it does, the returned Task or Message SHALL carry that `contextId` and SmartAIHub SHALL persist it in the A2A binding.

If SmartAIHub deliberately supplies a `contextId`:

- the value MUST come from a previously established remote A2A context or an explicit provider contract;
- SmartAIHub MUST NOT assume its own conversation/project ID is a valid remote A2A context ID;
- if the remote agent cannot accept the supplied `contextId`, the request MUST fail rather than silently switching to a newly generated context;
- a returned different `contextId` for a request that explicitly required reuse SHALL be treated as a protocol/correlation anomaly and reconciled before continuing side-effecting work.

Remote `contextId` values are opaque. SmartAIHub SHALL NOT derive tenant, user, project, authorization or billing identity from their syntax.

## Context expiry

Remote agents MAY expire contexts according to provider policy.

If an established context is no longer accepted:

```text
old remote context
→ mark expired/unavailable
→ preserve provenance
→ create a new task/context only through explicit orchestration policy
```

SmartAIHub MUST NOT silently claim conversational continuity when the remote provider has lost the prior context. Any resumed work SHALL receive an explicit bounded Context Package / prior-result references as needed.

---

# 98AP. Message Identity, Duplicate Delivery and Replay Semantics

`Message.messageId` is created by the message sender and SHALL be treated as sender-scoped protocol identity, not as a globally unique SmartAIHub primary key.

For outbound SmartAIHub messages:

- SmartAIHub SHALL generate a fresh cryptographically strong `messageId` per logical outbound message;
- automatic transport retries for the same logical message SHOULD reuse the same outbound `messageId` only when the selected binding/provider behavior has been validated for that retry pattern;
- a new orchestration turn or materially changed payload MUST receive a new `messageId`.

For inbound messages, deduplication identity SHALL include at minimum:

```text
authenticated caller / connection identity
external agent identity
messageId
```

and, when applicable:

```text
taskId
contextId
payload fingerprint
```

A repeated `messageId` with the same authenticated sender and equivalent payload MAY be treated as replay/retransmission for deduplication.

A repeated `messageId` with materially different content SHALL be rejected or quarantined as a collision/protocol anomaly; it MUST NOT overwrite the first accepted message.

A2A `messageId` alone SHALL NOT be interpreted as an exactly-once execution guarantee. `execution_intent_id`, attempt ownership and side-effect reconciliation remain SmartAIHub's duplicate-execution controls.

---

# 98AQ. `referenceTaskIds` Authorization and Context-Lineage Safety

`Message.referenceTaskIds` are contextual hints. They do not grant access to the referenced tasks and do not merge security contexts.

Before SmartAIHub sends or consumes a reference:

1. every referenced task SHALL be resolved only within the authenticated remote/local connection scope;
2. SmartAIHub authorization policy SHALL confirm that the current tenant/principal may use the referenced task as context;
3. reference count and serialized size SHALL be bounded;
4. duplicate reference IDs SHOULD be normalized without changing semantic order where order is meaningful to the provider;
5. inaccessible references SHALL not disclose whether the underlying task exists;
6. a reference SHALL NOT implicitly merge another task's artifacts/history into the active prompt or RAG context;
7. any content imported from a referenced task still passes normal DLP, asset, provenance and retention policy.

Cross-context references MAY be preserved if the remote protocol/provider accepts them, but SmartAIHub SHALL record the lineage explicitly and SHALL NOT reinterpret them as changing the primary `taskId/contextId` association.

---

# 98AR. TaskStatus Timestamp, Freshness and State-Regression Rules

A2A 1.0 `TaskStatus.timestamp`, when present, uses an ISO 8601 UTC timestamp with millisecond precision:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

SmartAIHub SHALL validate the wire value accordingly while preserving the native value for diagnostics.

Remote timestamps are not trusted ordering authorities because of clock skew, delayed push delivery and reconnect replay.

The normalized event model SHALL retain separately:

```text
remote_status_timestamp
received_at
local_normalized_sequence
remote_state
```

Rules:

- ordering of SmartAIHub durable events SHALL use the local reliability boundary and reconciliation logic, not only the remote clock;
- an older remote timestamp MAY still carry information that was delayed in transit, so it may be retained diagnostically without regressing canonical job state;
- a terminal task state SHALL NOT regress to `WORKING`/`SUBMITTED` because of a late stream or push event;
- competing terminal observations SHALL trigger `GetTask`/provider reconciliation and anomaly logging rather than last-write-wins by timestamp;
- clock-skew metrics MAY be recorded but SHALL NOT become authorization or billing truth.

---

# 98AS. Media-Type Negotiation and `acceptedOutputModes`

A2A Agent Card modes and `acceptedOutputModes` are media types, not arbitrary labels.

SmartAIHub SHALL parse and normalize media types according to standard MIME/media-type rules rather than naïve case-sensitive string comparison.

The effective output negotiation is:

```text
remote effective output modes
∩ caller/client consumable modes
∩ task-required/allowed modes
∩ SmartAIHub security/policy modes
= accepted output set
```

Where `remote effective output modes` means:

```text
AgentSkill.outputModes when explicitly present
else AgentCard.defaultOutputModes
```

Similarly, task input suitability SHALL use the selected skill's effective input modes.

Rules:

- parameters such as charset SHALL be normalized/compared according to the relevant media-type semantics;
- SmartAIHub internal requirements MAY use controlled wildcard expressions such as `image/*`, but the wire request SHOULD prefer concrete or explicitly advertised compatible media types;
- vendor media types such as `application/vnd.*` SHALL not be collapsed to a generic type unless an explicit transcoder/adapter exists;
- a declared mode does not bypass MIME sniffing/content validation for received files/artifacts;
- if the accepted output intersection required by the task is empty, that A2A route is unsuitable and routing SHALL evaluate the next eligible A2A interface or Spec 200 native route according to policy;
- the remote agent returning a materially unsupported output type SHALL create a validation/degradation event, not silent coercion.

---

# 98AT. Multi-Owner / Multi-Configuration Push Delivery

A single A2A task may have multiple push notification configurations, potentially registered by different authorized owners/clients.

SmartAIHub server-side storage SHALL distinguish two access paths:

```text
user-facing config read/list/delete
→ only configs visible to authenticated owner

internal dispatch path
→ all active authorized configs for the task
```

The internal dispatch loop MUST deliver an eligible task update to every active configuration registered for that task; it MUST NOT accidentally filter to the current caller/empty owner partition.

Delivery isolation:

- failure of callback A MUST NOT prevent callback B from being attempted;
- retry/backoff/dead-letter state is maintained per configuration;
- one owner's callback credentials MUST NOT be exposed through another owner's config APIs;
- deleting one config MUST NOT delete another owner's config unless an authorized administrative operation explicitly requests it;
- terminal-task cleanup SHOULD allow a bounded grace period so the final queued notification can be delivered/retried before secrets/configs are destroyed;
- dispatch fan-out SHALL be rate/budget bounded to prevent one task with excessive callbacks becoming an amplification vector.

A regression test SHALL specifically verify delivery across multiple owners/configurations because this behavior has required correctness fixes in official SDK implementations.

---

# 98AU. Identifier Uniqueness and Collision Validation

The following identifier scopes SHALL be validated before they enter canonical SmartAIHub state:

## AgentSkill ID

`AgentSkill.id` SHALL be unique within the effective Agent Card. Duplicate skill IDs with conflicting definitions make capability selection ambiguous and SHALL make the affected card/skill projection unusable until resolved.

## Artifact ID

`Artifact.artifactId` SHALL be unique within a task.

If an artifact update reuses an existing ID:

```text
valid incremental update of same logical artifact
→ process using append/lastChunk rules

incompatible replacement/collision
→ reject/quarantine + reconcile
```

An artifact collision MUST NOT overwrite a previously validated Library object silently.

## Push configuration ID

Push configuration IDs SHALL be unique within their protocol-defined task/config scope and SHALL be bound to owner/task authorization state.

## Interface identity

Exact duplicate AgentInterface entries MAY be normalized for internal diagnostics, but SmartAIHub SHALL preserve the remote declared preference ordering and SHALL NOT merge conflicting interfaces merely because URLs look similar.

---

# 98AV. Security-Scheme Referential Integrity

Every security scheme name referenced by an effective `SecurityRequirement` SHALL resolve to a declared scheme in the effective Agent Card's `securitySchemes` map.

Validation occurs after Extended Agent Card and AgentSkill overrides are applied.

Rules:

- unknown/misspelled scheme references make that requirement alternative unsatisfied;
- SmartAIHub MUST NOT guess a scheme based on a familiar name such as `oauth`, `bearer` or `apiKey`;
- if all OR alternatives become unsatisfiable because of missing/invalid scheme references, the A2A route is security-incompatible;
- OAuth/OIDC scopes SHALL be evaluated only against the referenced scheme definition and current credential grant;
- an AgentSkill-level requirement MAY use schemes defined at the card level but cannot implicitly invent undeclared scheme definitions;
- Extended Agent Card replacement SHALL trigger revalidation of all effective security references before new dispatch.

This validation is part of Agent Card quarantine/trust evaluation, not LLM reasoning.

---

# 98AW. Direct Message Response vs Remote Task Separation

`SendMessage` can return a `Message` directly without creating a remote A2A Task.

When that occurs:

- the server-originated Message SHALL contain `contextId`;
- `taskId` SHALL only be present if a real remote task exists;
- SmartAIHub MUST NOT fabricate a remote `taskId` merely to fit the `worker_jobs` model;
- SmartAIHub MAY still create/use an internal short-lived `worker_job` for audit, orchestration, billing or consistent UI, but the A2A binding SHALL record `provider_task_id = null`;
- follow-up protocol interaction uses the returned `contextId` unless the provider creates a subsequent task;
- a direct Message is mapped to a completed canonical provider turn, subject to artifact/content validation and any independent SmartAIHub verification relevant to the task family.

Conversely, when SmartAIHub acts as an A2A server, it MAY use internal jobs for every request while still returning a direct Message when A2A semantics and execution duration permit. Internal job existence MUST NOT leak as a fake protocol Task.

---

# 98AX. Agent Card Auxiliary URL and Display-Content Safety

Agent Cards can contain URLs and human-readable descriptive content that are not execution endpoints, such as:

```text
iconUrl
documentationUrl
provider.url
skill descriptions/examples
```

SmartAIHub SHALL treat these as untrusted presentation/discovery data.

Rules:

- the backend MUST NOT automatically fetch auxiliary URLs merely because they occur in a verified/signed Agent Card;
- if an icon/documentation proxy or preview fetch is implemented, it uses the same HTTPS/SSRF/redirect/size/content-type controls as other external fetchers and sends no A2A/provider credentials unless explicitly required by a separate authorized flow;
- UI rendering SHALL sanitize rich text/CommonMark/URLs and prevent script/HTML injection, credential exfiltration and unsafe URI schemes;
- provider/documentation URLs do not become trusted OAuth/JWKS endpoints simply because they share a domain;
- signature verification proves card integrity relative to the signing key, not safety of arbitrary linked content.

---

# 98AY. Remote Context/Task Retention, Privacy and Local Binding Cleanup

A2A context/task identifiers may outlive one SmartAIHub process, but they SHALL not force indefinite retention of conversation content.

SmartAIHub SHALL define configurable retention separately for:

```text
A2A binding identifiers
normalized lifecycle events
remote status/history snapshots
raw protocol payloads
artifacts
push configs/secrets
full user/agent message content
```

When a SmartAIHub conversation/project/user/tenant is deleted or loses authorization:

- local context/task bindings become inaccessible immediately according to policy;
- push credentials/configs are revoked/deleted when owned by SmartAIHub and safe to do so;
- signed asset URLs are expired/revoked where infrastructure permits;
- retained audit identifiers MAY remain pseudonymized when legally/operationally required, without preserving unnecessary prompt/content payloads;
- SmartAIHub MUST NOT claim that remote provider copies were deleted unless the provider exposes a verified deletion mechanism and it succeeded.

A stale remote `contextId` MAY remain in audit/provenance while being blocked from further execution.

---

# 98AZ. Extension Header Aggregation and Middleware Safety

A2A extension negotiation may involve more than one extension URI.

SmartAIHub middleware/interceptors SHALL treat the active extension set as a bounded set/list that is **merged intentionally**, not overwritten accidentally by the last component.

For every request:

```text
negotiated extensions
∩ extensions required/used by this operation/object
= declared active A2A-Extensions set
```

Rules:

- middleware adding one extension MUST preserve already-approved active extension declarations;
- duplicates SHALL be normalized;
- unsupported/unnegotiated URIs SHALL not be added merely because an inbound Message/Artifact contains them;
- extension count and header/metadata byte size SHALL be bounded;
- ordering SHALL be deterministic for reproducible tests/signatures where ordering is observable;
- v0.3 compatibility translation SHALL not silently drop a required v1 extension and then continue with degraded semantics.

The regression suite SHALL include a multi-extension request because official SDK implementations have previously fixed append-vs-overwrite behavior in extension helpers.

---

# 98BA. Cross-SDK / Cross-Binding Differential Conformance

Spec 206 already requires TCK/Inspector and SDK regression testing. Revision 5 strengthens this with differential interoperability tests.

For the A2A bindings/languages SmartAIHub actually deploys, CI/release validation SHOULD run the same canonical fixture corpus across at least two independent implementations or bindings where practical.

Fixture families include:

```text
SendMessage → direct Message
SendMessage → Task
stream lifecycle
artifact chunks
ListTasks pagination/filtering
multi-owner push configs
auth-required/input-required
errors
Agent Card signatures
extensions
UTF-8/non-ASCII content
metadata conversion
```

Compare:

```text
canonical task/message/artifact semantics
error category
state transitions
security/resource scoping
normalized SmartAIHub result
```

Wire representations may legitimately differ between HTTP+JSON, JSON-RPC and gRPC.

A result that only passes against the same SDK used by SmartAIHub is insufficient evidence of interoperability. Where available, official A2A ITK/TCK and a second official SDK/client SHALL be included in release qualification.

---

# 98BB. Agent Version vs A2A Protocol Version

`AgentCard.version` is the remote agent/application version. It is NOT the negotiated A2A protocol version.

The negotiated protocol version comes from the selected `AgentInterface.protocolVersion` / binding service parameters.

SmartAIHub SHALL therefore store separately:

```text
agent_application_version
selected_a2a_protocol_version
sdk_version
adapter_version
agent_card_hash/version snapshot
```

Rules:

- `AgentCard.version = "2.4.1"` does not imply A2A protocol 2.4.1;
- route compatibility MUST NOT compare `AgentCard.version` against `A2A-Version`;
- provider application upgrades MAY trigger health/capability revalidation even when A2A protocol version remains 1.0;
- application versions are provider-defined strings and SHALL not be assumed to obey SemVer unless that provider contract explicitly says so.

---

# 98BC. Revision-5 Regression Additions

The automated regression suite SHALL include explicit tests for the Revision 5 audit gaps:

```text
new task cannot use a client-preallocated remote taskId
server-generated contextId is persisted and reused opaquely
explicit unsupported client contextId is rejected without silent replacement
messageId replay with same payload dedupes safely
messageId collision with different payload is rejected/quarantined
referenceTaskIds cannot disclose unauthorized task existence
TaskStatus timestamp requires UTC-millisecond form and cannot regress terminal state
acceptedOutputModes intersection rejects an empty required output set
media-type normalization does not collapse vendor formats unsafely
multiple push configs across multiple owners all receive eligible notifications
one failing push callback does not suppress another callback
AgentSkill duplicate IDs invalidate ambiguous capability projection
Artifact ID collision cannot overwrite validated Library output
unknown SecurityRequirement scheme reference makes the alternative unsatisfied
direct Message response does not create a fake remote task binding
auxiliary Agent Card URLs are not auto-fetched with credentials
context deletion/revocation blocks stale execution while preserving bounded provenance
multiple negotiated extension declarations are preserved rather than overwritten
AgentCard.version is never used as A2A wire protocol version
cross-SDK/cross-binding fixture produces equivalent canonical semantics
```



# 98BD. `ListTasks` Exact Projection, Pagination and Ordering Contract

Revision 6 tightens the A2A 1.0 `ListTasks` projection because subtle representation differences can break cross-SDK compatibility.

## 98BD.1 Artifact omission is structural

When:

```text
includeArtifacts = false
```

or the field is omitted and therefore defaults to false, each returned `Task` MUST omit the `artifacts` field entirely.

The following are non-conformant substitutes:

```json
{"artifacts": []}
{"artifacts": null}
```

This distinction SHALL be covered by wire-level regression tests because client/server SDKs have previously required fixes in this area.

## 98BD.2 Pagination limits

SmartAIHub A2A Server SHALL enforce:

```text
1 <= pageSize <= 100
unspecified pageSize → server-selected value no greater than 50
```

Invalid values SHALL produce the binding-appropriate invalid-argument response.

## 98BD.3 Response invariants

`ListTasksResponse` SHALL preserve:

```text
tasks
nextPageToken
pageSize
totalSize
```

`nextPageToken` MUST be present on every successful response.

Final page:

```text
nextPageToken = ""
```

not `null`, omitted or an invented sentinel.

`totalSize` SHALL be computed only after authentication/authorization scoping so it cannot disclose tasks hidden from the caller.

## 98BD.4 Ordering

Tasks SHALL be ordered by last status/update time descending as required by the protocol.

Cursor implementation MUST maintain stable continuation semantics under concurrent task updates. SmartAIHub MAY use a snapshot/cursor watermark internally but MUST NOT expose database offsets as stable protocol cursors.

## 98BD.5 `historyLength`

For both `GetTask` and task projections that support history:

```text
unset  → client imposes no limit; server MAY enforce a lower server policy
0      → return no history messages
N > 0  → return at most N most recent messages
```

The server SHALL apply privacy/retention limits even when the client requests unlimited history.

---

# 98BE. Authenticated Resource Owner, Task and Context Scoping

A2A tenant routing and SmartAIHub tenant authorization are necessary but not sufficient for per-resource authorization.

## 98BE.1 Owner binding

Every remotely addressable task SHALL bind, where applicable, to:

```text
tenant_id
connection_id
authenticated_principal_id
credential_owner_scope
external_agent_id
remote_task_id
remote_context_id
```

Owner binding MUST survive backend restart and transport reconnect.

## 98BE.2 Owner-scoped operations

At minimum the following operations SHALL enforce the same owner/principal scoping used when the task was created or explicitly delegated:

```text
GetTask
ListTasks
CancelTask
SubscribeToTask
Create/Get/List/Delete push configs
continuation SendMessage
```

A task being in the same tenant does not automatically make it accessible to every principal in that tenant.

Administrative/service-account access requires an explicit higher-level policy grant.

## 98BE.3 `contextId` is not an authorization boundary

`contextId` groups related tasks/messages.

It MUST NOT be used as proof that a caller may access every task in that context.

Each referenced task and artifact still requires resource authorization.

## 98BE.4 Concurrent tasks in one context

Multiple principals or automation identities MAY participate in one conversation context only when SmartAIHub policy explicitly allows it.

Context reuse MUST NOT silently transfer ownership of:

```text
remote tasks
push configs
artifacts
credentials
approval rights
```

## 98BE.5 Store concurrency

Task/push stores SHALL use transactional or concurrency-safe owner binding.

A concurrent first write from one owner MUST NOT be lost because another owner initializes the same logical backing collection.

Regression tests SHALL include simultaneous first-owner writes.

---

# 98BF. Streaming Producer, Subscriber Queue and Background-Task Reliability

## 98BF.1 Slow subscriber isolation

One slow SSE/gRPC/webhook consumer MUST NOT wedge task event production for other consumers.

Every subscriber SHALL have a bounded queue/buffer policy.

When the subscriber queue is full, implementation SHALL follow an explicit strategy such as:

```text
disconnect/evict slow subscriber
mark subscription degraded
force later GetTask/Subscribe reconciliation
```

It MUST NOT block the global producer indefinitely.

## 98BF.2 Producer exceptions are durable outcomes

If the agent event producer fails:

```text
before first event
during active stream
after an intermediate event
while no client is connected
```

SmartAIHub MUST surface the failure into durable task/job state and diagnostics.

Producer exceptions MUST NOT disappear because an event queue or subscriber already closed.

## 98BF.3 Early producer failure

If execution fails before the first streamed `Task`/event is emitted, preserve:

```text
originating Message correlation
execution_intent_id
failure diagnostics
FAILED/rejected canonical outcome as appropriate
```

The absence of a first stream event is not evidence that execution never started.

## 98BF.4 Background lifecycle close

A2A client/server runtime components SHALL expose or implement an explicit lifecycle equivalent to:

```text
drain
close/aclose
cancel owned background tasks
release references
flush durable events
```

Process shutdown SHALL wait for bounded cleanup rather than abandoning pending task infrastructure.

## 98BF.5 Stream termination

The agent executor/producer owns semantic task completion.

Transport adapters MUST NOT invent terminal state simply because:

```text
SSE connection closed
gRPC stream ended
HTTP connection reset
subscriber detached
```

Transport loss triggers reconciliation.

---

# 98BG. Serialization Fidelity Across JSON, ProtoJSON and Provider Adapters

## 98BG.1 Preserve legitimate falsy values

Normalization/conversion code MUST NOT remove values merely because they are falsy.

Preserve semantically valid:

```text
false
0
0.0
""
empty arrays/objects when schema allows them
explicit null where the binding/schema distinguishes it
```

Only schema-defined absence/default rules may remove values.

## 98BG.2 Non-ASCII and Unicode

Streaming/non-streaming payloads SHALL preserve Unicode characters without lossy ASCII escaping/re-encoding behavior.

Tests SHALL include:

```text
Thai
CJK
emoji
combining characters
right-to-left text
```

UTF-8 is the canonical HTTP/SSE text encoding path.

## 98BG.3 ProtoJSON null/Struct fidelity

For gRPC ↔ ProtoJSON ↔ internal JSON conversion:

- protobuf `Struct` / `Value` null values MUST remain null;
- numeric values MUST not be stringified accidentally;
- repeated fields MUST retain ordering;
- typed Any/error details MUST retain `@type` information;
- field-presence semantics MUST be tested across SDK/runtime upgrades.

## 98BG.4 Metadata conversion

Provider/SDK metadata objects SHALL be converted to ordinary serializable maps without silently dropping nested maps, falsy values or non-text Parts.

---

# 98BH. Exact Error Envelope Across Standard Bindings

## 98BH.1 HTTP+JSON

A2A HTTP binding errors SHALL use the `google.rpc.Status` JSON representation defined by A2A 1.0.

Do NOT substitute:

```text
RFC 9457 problem+json
custom {error: string}
framework default HTML errors
```

for A2A protocol endpoints.

A2A-specific errors SHALL include `google.rpc.ErrorInfo` with:

```text
reason = A2A error type in UPPER_SNAKE_CASE without Error suffix
domain = "a2a-protocol.org"
metadata = optional safe context
```

## 98BH.2 JSON-RPC

`error.data`, when used for structured A2A detail, SHALL be an array of typed ProtoJSON detail objects carrying `@type`.

Do not flatten typed details into a provider-private object.

## 98BH.3 gRPC

A2A-specific gRPC errors SHALL carry `google.rpc.ErrorInfo` in `status.details` and maintain semantic parity with HTTP/JSON-RPC mappings.

The normalized SmartAIHub error is additive; it MUST NOT destroy the binding-native error representation.

---

# 98BI. Agent Card HTTP Cache, Freshness and Stale-Replay Policy

Agent Card retrieval already supports ETag/Last-Modified in this spec. Revision 6 defines complete HTTP cache behavior.

## 98BI.1 Conditional fetch

Where supported, send:

```text
If-None-Match
If-Modified-Since
```

and handle `304 Not Modified` without replacing the verified normalized snapshot.

## 98BI.2 `Cache-Control`

Honor safe cache directives while applying SmartAIHub maximum freshness policy.

A remote `max-age` longer than platform policy SHALL be capped locally.

`no-store` SHALL prevent persistent raw-card caching where feasible, while minimum security/audit fingerprints MAY still be retained according to legal/security policy.

## 98BI.3 Stale card use

A stale cached Agent Card MAY be used only under explicit stale-if-error policy for low-risk continuation/discovery cases.

Do not use a stale card to authorize a new high-risk execution when:

```text
security scheme may have changed
endpoint changed
required extension status is unknown
signing trust is expired/revoked
```

## 98BI.4 Signature freshness

JWS signature validity proves integrity relative to the signing key; it does not automatically provide expiry/freshness unless such claims/trust metadata are actually present and validated.

Do not invent an expiration time from signature presence alone.

---

# 98BJ. Credential Rotation, Redirect and Long-Running Authentication Safety

## 98BJ.1 Rotation without execution duplication

Long-running tasks MAY outlive:

```text
OAuth access tokens
API keys
mTLS certificates
short-lived service credentials
```

Credential Broker SHALL support rotation/refresh without creating a new execution attempt unless the remote protocol requires it.

## 98BJ.2 mTLS

Certificate renewal SHALL update future connections while existing streams are handled by policy:

```text
drain naturally
reconnect safely
or terminate if certificate compromise/revocation requires it
```

## 98BJ.3 Redirect credentials

Operational A2A requests containing authorization MUST NOT forward `Authorization`, cookies, client certificates or signed credential material to a different origin through redirects.

Authenticated task endpoints SHOULD disable redirects by default.

If a redirect is supported, destination MUST be revalidated and credential forwarding must require an explicit same-origin/security policy.

## 98BJ.4 Revocation during execution

Credential/connection revocation SHALL immediately prevent new privileged operations.

For already-running remote work, policy SHALL choose one of:

```text
allow isolated execution to finish but block further data/tool access
attempt CancelTask
quarantine final artifacts pending review
terminate local transport/runtime where safe
```

The selected action must be audited.

---

# 98BK. Metadata Namespace, Size and Trust Boundaries

A2A provides flexible metadata fields. They MUST NOT become an uncontrolled policy channel.

## 98BK.1 Size/depth budget

Apply limits to:

```text
request metadata
Message.metadata
Task.metadata
stream-event metadata
Artifact.metadata
error detail metadata
```

Limit:

```text
serialized bytes
nesting depth
key count
individual key/value length
```

## 98BK.2 Reserved SmartAIHub namespace

Reserve internal metadata prefixes, for example:

```text
sah.internal.*
sah.security.*
sah.billing.*
```

Remote callers/agents MUST NOT be able to inject values into trusted internal namespaces.

Externally transported SmartAIHub correlation metadata SHALL use a separately documented, schema-validated namespace.

## 98BK.3 No metadata authority escalation

Remote metadata cannot:

```text
increase scopes
change owner
change tenant
disable approval
raise budget
mark content verified
change billing truth
```

unless the platform itself created and authenticated that metadata.

---

# 98BL. Binding-Specific Connection Management

## 98BL.1 gRPC

Configure bounded:

```text
request/stream deadlines
max inbound/outbound message size
keepalive policy
concurrent stream limits
idle timeout
cancellation propagation
```

A client-side deadline expiration is an ambiguous transport failure until remote task ownership is reconciled.

## 98BL.2 SSE

A2A recovery SHALL NOT depend on generic SSE `Last-Event-ID` semantics because A2A task resubscription is defined through `SubscribeToTask`/task state, not a universal event replay ID contract.

If an implementation also supports `Last-Event-ID`, treat it as transport-specific optimization only.

## 98BL.3 Custom protocol bindings

Custom bindings SHALL be accepted only when:

```text
protocolBinding is an explicit registered URI
adapter is installed/allowed
A2A version is supported
error mapping is defined
stream ordering/reconnect semantics are defined
service-parameter transport is defined
```

SmartAIHub MUST NOT infer a custom binding merely from URL scheme/port.

Custom bindings are distinct from A2A extensions.

---

# 98BM. Push Notification Dispatch Hardening

## 98BM.1 URL validation twice

Push callback URL SHALL be validated:

```text
when config is created/updated
AND immediately before each dispatch attempt
```

The second validation SHALL re-resolve DNS so a domain cannot pass configuration-time checks and later rebind to:

```text
localhost
link-local
private management network
cloud metadata endpoint
```

## 98BM.2 AuthenticationInfo v1 semantics

A2A 1.0 `AuthenticationInfo` has one HTTP authentication `scheme` string plus optional `credentials`.

Scheme matching follows HTTP/IANA semantics and is case-insensitive.

Do not deserialize v0.x multi-scheme arrays into the v1 structure without an explicit compatibility adapter.

## 98BM.3 Secret reflection

Get/List push-config responses and SmartAIHub UI/logging SHOULD mask/omit secret credential material.

A stored secret handle is not serialized back as if it were a credential.

## 98BM.4 Callback token

Where a token is used:

```text
unique per config/session when feasible
high entropy
constant-time validation
rotation/revocation support
not embedded in predictable URL paths
```

## 98BM.5 Fan-out isolation

Failure, timeout or queue pressure for one push config/owner MUST NOT prevent delivery attempts to other active configs/owners.

---

# 98BN. Agent Disable, Deregistration and Active-Task Policy

An external agent can become unavailable administratively while tasks remain active.

## 98BN.1 New dispatch

Once disabled/quarantined/deregistered:

```text
no new tasks
no new capability resolution result
no new credential issuance
```

## 98BN.2 Existing tasks

Active tasks SHALL retain their pinned execution binding for reconciliation but apply an explicit policy:

```text
drain
cancel
quarantine result
read-only reconcile only
```

Do not delete task bindings before terminal/recovery handling completes.

## 98BN.3 Credential and push cleanup

After active-task policy resolves:

```text
revoke connection-scoped credentials
remove push configs where possible
expire signed asset URLs
invalidate route cache
remove registry exposure
```

Remote cleanup failure must remain visible as residual-risk state.

---

# 98BO. External URL Fetch and Artifact Provenance Isolation

## 98BO.1 No ambient credential forwarding

When SmartAIHub downloads an A2A URL/File Part or Artifact URL:

- do not forward the agent connection's Authorization header by default;
- do not forward user browser cookies;
- do not forward SmartAIHub session cookies;
- do not forward credentials across redirects/origins;
- use only an explicit credential binding for that asset when one exists.

## 98BO.2 URL revalidation

Every fetch/redirect hop passes the same SSRF/DNS/TLS policy as discovery.

## 98BO.3 Artifact metadata is untrusted

Remote Artifact metadata MAY describe provenance but cannot overwrite canonical SmartAIHub fields such as:

```text
source tenant
verified producer
billing owner
execution_intent_id
malware/QC state
Library ownership
content hash
```

Store remote claims separately from verified platform provenance.

## 98BO.4 Content-addressed deduplication

SmartAIHub MAY deduplicate identical artifacts by cryptographic content hash, but authorization and lineage records remain distinct per task/tenant where required.

A shared blob does not imply shared access.

---

# 98BP. Audit Integrity and Security-Relevant Evidence

Audit already records route/task/security events. Revision 6 adds integrity requirements.

Security-relevant audit events SHOULD be written to append-only/tamper-evident storage or an equivalent protected audit sink.

At minimum protect evidence for:

```text
Agent Card trust changes
credential selection/revocation
route decision/fallback
approval/input actions
owner/delegation changes
artifact verification
administrative agent disable/quarantine
ambiguous-dispatch decisions
```

Where hash chaining/signing is implemented, it is an integrity aid and MUST NOT replace normal database backup/authorization.

Audit export SHALL redact secrets while preserving stable correlation identifiers.

---

# 98BQ. Version-Specific Capability Matrix and Legacy Compatibility Guard

## 98BQ.1 Capability matrix is protocol-version specific

Never assume an operation available in A2A 1.0 is available through a v0.3 compatibility route.

Example:

```text
ListTasks
```

must be marked unsupported on compatibility transports that do not implement it rather than synthesized incorrectly.

## 98BQ.2 Legacy adapter boundary

All v0.3 translation remains behind `A2ALegacyCompatibilityAdapter`.

The adapter SHALL maintain a version-specific matrix for:

```text
operations
fields
stream event shapes
push config model
error representations
Agent Card normalization
```

## 98BQ.3 No silent feature emulation

If SmartAIHub emulates a missing legacy feature locally, diagnostics MUST distinguish:

```text
remote protocol capability
SmartAIHub local convenience
```

The emulation must not be advertised to another peer as native A2A support unless it actually satisfies the protocol contract.

---

# 98BR. Historical Official SDK Regression Gate — Revision 6

The Revision 6 SDK observations are historical evidence only. Every implementation SHALL test the exact pinned SDK version rather than assume protocol compliance from package provenance alone.

Observed official SDK lines include:

```text
Python SDK 1.1.4 line
JavaScript SDK 1.1.0 line
A2A protocol release v1.0.0 / wire version 1.0
```

The regression suite SHALL explicitly cover issues represented by recent official fixes:

```text
ListTasks omits artifacts when includeArtifacts=false
owner-scoped CancelTask / SubscribeToTask
terminal state written on cancel
first-owner concurrent store writes are not lost
slow/full subscriber queue does not wedge dispatch
producer errors surface after task failure
early producer failure persists FAILED state
push URL validation at config creation
push URL validation again before dispatch
background ActiveTask/client lifecycle closes cleanly
ListTasks serialization / unspecified status
push config objects are cloned rather than shared mutable references
non-terminal stream exit releases references
append=true for unknown artifact ID fails
non-ASCII streaming JSON survives unchanged
ProtoJSON Struct null survives conversion
metadata remains ordinary structured map
JSON-RPC error typed-details shape is preserved
```

A package upgrade SHALL fail CI if any of these regressions reappear.

---

# 98BS. Revision-6 Consolidated Regression Additions

Add automated tests for all new Revision-6 normative rules, including:

1. omitted `artifacts` field vs empty/null when `includeArtifacts=false`;
2. `pageSize` 0/1/50/100/101 behavior;
3. `nextPageToken=""` on final page;
4. scoped `totalSize` does not reveal other owners/tenants;
5. last-update descending ordering across pages;
6. historyLength unset/0/N semantics;
7. owner-scoped Get/List/Cancel/Subscribe/push config operations;
8. context ID cannot grant task access;
9. simultaneous first-owner writes;
10. slow subscriber eviction without global dispatch stall;
11. producer failure before first event;
12. producer failure after subscribers detach;
13. bounded graceful close/drain;
14. false/0/empty-string metadata retention;
15. non-ASCII streaming payloads;
16. ProtoJSON null and Any type retention;
17. exact HTTP `google.rpc.Status` response;
18. JSON-RPC typed detail arrays;
19. gRPC ErrorInfo mapping parity;
20. Agent Card ETag/304 and Cache-Control handling;
21. stale Agent Card blocked for high-risk new execution;
22. OAuth/API-key/mTLS rotation without duplicate task dispatch;
23. no auth forwarding to cross-origin redirect;
24. metadata depth/size/internal namespace rejection;
25. gRPC deadline treated as ambiguous until reconcile;
26. `Last-Event-ID` not required for A2A recovery;
27. unknown custom binding rejected unless registered;
28. push URL DNS revalidation catches rebinding;
29. IANA/case-insensitive AuthenticationInfo scheme handling;
30. push secret masked on Get/List/UI/audit;
31. push token constant-time validation;
32. agent disable blocks new work but preserves active binding for recovery;
33. connection revocation blocks new privileged operations;
34. artifact URL fetch strips ambient credentials;
35. remote artifact provenance cannot overwrite verified SmartAIHub provenance;
36. content-hash blob dedup does not merge ACL/lineage;
37. tamper-evident audit sink behavior where enabled;
38. v0.3 capability matrix does not expose unsupported ListTasks;
39. official Python/JS SDK differential regression fixtures;
40. full A2A/native parity scenario after all Revision-6 hardening.


# 99. Final Architecture

```text
                           SMARTAIHUB

User / App / API
      │
      ▼
Universal AI Assistant
      │
      ▼
LangGraph
      │
      ▼
Capability Resolver
      │
      ├──────────── Skill / Workflow / Internal
      │
      ├──────────── MCP Tool
      │                 │
      │                 ▼
      │              Spec 199
      │
      └──────────── External Agent
                        │
                        ▼
                    Spec 206
              A2A-First Interop Router
                   /          \
                  /            \
                 ▼              ▼
              A2A 1.x       Spec 200
                 │          Native Adapter
                 │              │
                 ▼              ▼
          Remote/Local       Codex
           A2A Agent         Claude
                             Antigravity
                             DeepSeek
                             Future Agent
                  \            /
                   \          /
                    ▼        ▼
               Canonical Agent Runtime
                        │
             worker_jobs / worker_job_events
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Approval       Library       Audit
      / Input        / Assets       Trace
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                 Verified Result
```

---

# 99A. Revision 2 — Completed Multi-Pass Gap Audit Record

The following focused loops were executed against Revision 1 and the current A2A 1.0.x specification behavior. Each identified gap was incorporated immediately into Revision 2.

| Pass | Audit dimension | Gap found | Resolution in Revision 2 |
|---:|---|---|---|
| 1 | Protocol/version | Patch/spec/SDK version semantics could be confused | Added Major.Minor wire-version rules, normative proto source, compatibility manifest |
| 2 | Streaming | Missing exact first-event/one-of/order and chunk assembly semantics | Added v1 stream rules plus `append`/`lastChunk` assembly and dedupe |
| 3 | Recovery listing | `ListTasks` filters/pagination/history semantics incomplete | Added bounded history, cursor pagination, watermark and `includeArtifacts` rules |
| 4 | Task lifecycle | Terminal task refinement/resurrection rule incomplete | Added immutable terminal-task rule, new task + same `contextId` + `referenceTaskIds` |
| 5 | Capability resolution | AgentSkill overrides were not fully effective in route suitability | Added default/skill modality and security inheritance calculation |
| 6 | Authentication | `AUTH_REQUIRED` could be misread as authorization | Added scope-specific out-of-band authorization and OAuth/OIDC metadata controls |
| 7 | Error/wire model | Missing canonical A2A errors and JSON/ProtoJSON validation | Added standard error mapping and wire-shape requirements |
| 8 | Push reliability | Callback semantics lacked explicit at-least-once durable acknowledgement | Added StreamResponse, 2xx boundary, duplicate-safe and overlap reconciliation rules |
| 9 | Agent Card signing | JWS canonicalization was underspecified | Added presence/default rules, signatures exclusion, JCS and protected-header validation |
| 10 | Multiple bindings | No explicit detection of inconsistent advertised A2A bindings | Added functional-equivalence validation and custom-binding policy |
| 11 | SDK operations | SDK upgrade/supply-chain policy missing | Added pinned compatibility manifest, bounded parsers, rollback and test gates |
| 12 | Long-lived lifecycle | Orphan task, revocation and retained callback/temp data cleanup incomplete | Added orphan recovery, revocation behavior and retention/cleanup gate |
| 13 | A2A-first routing recheck | First A2A binding failure could fall to native before trying later declared A2A interfaces | Added ordered intra-A2A binding failover before native fallback |

This audit record is informational; the normative requirements are the corresponding sections in the specification.


# 99B. Revision 3 — Additional 14-Pass Gap Audit Record

This revision performed a second independent audit on top of Revision 2. Each pass targeted a different failure domain and all discovered gaps were incorporated into normative sections above.

| Pass | Audit dimension | Gap found | Revision 3 correction |
|---:|---|---|---|
| 1 | Extended Agent Card | Separate storage existed, but effective-card replacement semantics were incomplete | Added authenticated effective-card view, scoping and session pinning |
| 2 | Task state machine | `TASK_STATE_UNSPECIFIED` / unknown future state behavior was not explicit | Added unknown-state mapping, reconciliation and regression safeguards |
| 3 | Message/history reliability | Status/history messages could be over-trusted after disconnect | Declared them non-authoritative for critical facts; artifacts/platform audit remain durable truth |
| 4 | Part wire/content safety | Exact one-of, raw base64, URL and structured-data bounds were incomplete | Added comprehensive Part validation and safe materialization/fetch rules |
| 5 | Version compatibility | Optional v0.3 compatibility lacked a hard silent-downgrade guard | Added full requirement re-evaluation before any 1.0→0.3 downgrade |
| 6 | Service parameters | Per-request version/extension service-parameter behavior was under-specified | Added mandatory `A2A-Version: 1.0`, extension activation and binding handling |
| 7 | Cancellation races | `TaskNotCancelableError` and completion-vs-cancel race needed deterministic handling | Added immediate reconciliation and late-artifact/side-effect policy |
| 8 | Long-running authentication | Access-token expiry vs `AUTH_REQUIRED` was conflated/underspecified | Added credential refresh, retry classification and ambiguous-send protection |
| 9 | Connection lifecycle | No explicit graceful shutdown/client close/drain contract | Added SSE/gRPC close, bounded buffering, checkpoint and restart reconciliation |
| 10 | Binding error fidelity | Semantic error list existed but exact HTTP/JSON-RPC/gRPC preservation needed strengthening | Added binding-exact structural error requirement |
| 11 | Capability drift / TOCTOU | Active execution did not pin the full discovery/security snapshot | Added immutable per-attempt interoperability snapshot and drift rules |
| 12 | Inbound abuse control | Generic security limits existed but A2A operation-specific budgets were incomplete | Added inbound task/stream/ListTasks/Part/artifact/push budgets |
| 13 | In-task authorization | `AUTH_REQUIRED` handling lacked the protocol-specific status-message/out-of-band credential/resume contract | Added exact in-task authorization behavior and recursive delegation rule |
| 14 | Blocking execution | `returnImmediately` behavior was described but terminal-vs-interrupted blocking semantics were not normative enough | Added exact blocking/non-blocking semantics and ambiguity handling |

Revision 3 SHALL be considered part of the implementation baseline together with all previous normative sections.

---


# 99C. Revision 4 — Additional 13-Pass Gap Audit Record

Revision 4 performed a third independent review on top of Revisions 2 and 3, using the current A2A 1.0 definition and current official SDK release behavior as cross-checks. Every identified gap was incorporated into normative sections before this audit record.

| Pass | Audit dimension | Gap found | Revision 4 correction |
|---:|---|---|---|
| 1 | Terminal resubscription | Terminal tasks could enter repeated `SubscribeToTask` retries | Added `UnsupportedOperationError → GetTask → close recovery loop` semantics |
| 2 | `ListTasks` state filtering | `TASK_STATE_UNSPECIFIED` could be confused with unknown-state-only filtering | Defined it as no status filter in `ListTasks` and added inclusive watermark dedupe |
| 3 | Push config inventory | Push config list pagination/config identity was incomplete | Added bounded pagination, opaque page tokens and exact config-ID rules |
| 4 | Initial push config | Embedded initial push config did not require empty task ID | Added pre-dispatch validation and post-create task binding |
| 5 | Message lineage | `taskId/contextId` referential integrity and inference rules were missing | Added ingress/egress validation and cross-context protection |
| 6 | Message role | `ROLE_UNSPECIFIED` / future role handling was undefined | Added strict role normalization without identity/authorization inference |
| 7 | Object extensions | Message/Artifact extension URIs were not tied to negotiated extension state | Added object-level extension integrity and schema/policy requirements |
| 8 | Security requirements | Alternative-vs-combined auth requirement semantics could be flattened incorrectly | Added OR-between-requirements / AND-within-requirement evaluation |
| 9 | Distributed tracing | Trace propagation lacked standard headers and baggage controls | Added W3C Trace Context guidance and sensitive-baggage prohibition |
| 10 | Server authorization | Resource scoping covered key reads but not every A2A operation explicitly | Added per-operation authorization gate across the complete service surface |
| 11 | Interface endpoints | Binding-specific endpoint/address validation was not normative enough | Added HTTPS/gRPC shape, redirect, userinfo, SSRF and trust-zone rules |
| 12 | SDK correctness | Architecture could over-trust official SDK behavior | Added pinned SDK regression/conformance/lifecycle test gate |
| 13 | Push secrets | Push token/auth credentials lacked an explicit wire-materialization boundary | Added Secret Broker-only persistence and exact task/config callback binding |

Revision 4 SHALL be treated as part of the implementation baseline together with all earlier normative sections.

---


# 99D. Revision 5 — Additional 14-Pass Gap Audit Record

The protocol-version wording in this historical record is superseded by the
v1.0.0 normative source in Section 4.

Revision 5 performed a fourth independent audit on top of Revisions 2–4, with the current A2A 1.0 specification, protocol release v1.0.1, current SDK behavior and SmartAIHub cross-spec invariants used as cross-checks. Every identified gap was incorporated into normative sections before this record.

| Pass | Audit dimension | Gap found | Revision 5 correction |
|---:|---|---|---|
| 1 | Identifier authority | Remote task/context identifier ownership was not explicit enough | Added server-generated task ID rule, opaque context authority and no silent context replacement |
| 2 | Replay/idempotency | `messageId` uniqueness could be confused with exactly-once execution | Added sender-scoped identity, replay/collision fingerprinting and execution-intent separation |
| 3 | Referenced task lineage | `referenceTaskIds` preservation existed but per-reference authorization/bounds were incomplete | Added resource authorization, bounded references, DLP and no implicit context merge |
| 4 | Task status freshness | Exact v1 UTC-millisecond timestamp and late-event regression rules were missing | Added strict timestamp parsing plus local ordering/reconciliation rules |
| 5 | Modality negotiation | Media modes risked naïve string matching and incomplete accepted-output intersection | Added MIME-aware effective mode/intersection and unsupported-output handling |
| 6 | Push fan-out | User-scoped config reads did not explicitly distinguish all-owner internal dispatch | Added multi-owner/config fan-out, failure isolation and terminal-delivery grace |
| 7 | Identifier collisions | Skill/artifact/config identifier uniqueness scopes were implicit | Added collision validation and artifact overwrite protection |
| 8 | Security references | Security requirements could reference undeclared schemes without a normative invalidation path | Added effective-card referential-integrity validation |
| 9 | Direct responses | Internal `worker_job` consistency could tempt implementations to invent a remote Task for direct Message responses | Added explicit protocol-vs-internal-job separation |
| 10 | Agent Card presentation | Auxiliary URLs/descriptive content had weaker fetch/render safety requirements than execution endpoints | Added no-auto-fetch, SSRF proxy and UI sanitization rules |
| 11 | Retention/privacy | Context/task binding retention and deletion/revocation behavior was incomplete | Added separate retention classes and stale-binding execution block |
| 12 | Extension middleware | Negotiated extension declarations could be overwritten by middleware layers | Added merge/preserve/bounded multi-extension rules and regression coverage |
| 13 | Differential conformance | SDK/TCK testing could still be self-referential to one implementation | Added cross-SDK/cross-binding canonical fixture comparison |
| 14 | Version identity | `AgentCard.version` could be confused with A2A protocol/SDK version | Added separate application/protocol/SDK/adapter version model |

Revision 5 SHALL be treated as part of the implementation baseline together with all earlier normative sections.

---


# 99E. Revision 6 — Additional 40-Pass Gap Audit Record

The protocol-version wording in this historical record is superseded by the
v1.0.0 normative source in Section 4.

Revision 6 performed forty additional independent review loops after Revision 5. Each pass used the current A2A 1.0 specification, v1.0.1 specification corrections, current official SDK changelogs and the existing SmartAIHub Spec 186/199/200 invariants as cross-checks.

| Pass | Audit dimension | Gap found | Revision 6 correction |
|---:|---|---|---|
| 1 | ListTasks artifact projection | `includeArtifacts=false` did not explicitly require field omission | Added 98BD.1 |
| 2 | ListTasks page-size validation | Bounds/default were not normative | Added 98BD.2 |
| 3 | ListTasks response pagination | `nextPageToken/pageSize/totalSize` invariants incomplete | Added 98BD.3 |
| 4 | ListTasks ordering/cursor stability | Descending last-update order and stable cursor behavior not explicit | Added 98BD.4 |
| 5 | Get/List history limits | unset/zero/server-lower-limit semantics incomplete | Added 98BD.5 |
| 6 | Task resource ownership | Tenant scoping alone was insufficient | Added 98BE.1–2 |
| 7 | Context authorization | `contextId` could be misread as an auth boundary | Added 98BE.3 |
| 8 | Concurrent context participants | Ownership transfer rules were incomplete | Added 98BE.4 |
| 9 | Multi-owner store races | First-owner concurrent initialization not covered | Added 98BE.5 |
| 10 | Slow stream subscribers | Queue-full behavior could wedge dispatch | Added 98BF.1 |
| 11 | Producer exception propagation | Producer errors could be lost after queue/stream closure | Added 98BF.2 |
| 12 | Failure before first event | No explicit durable early-producer-failure rule | Added 98BF.3 |
| 13 | Runtime background lifecycle | Drain/close/release semantics insufficiently explicit | Added 98BF.4–5 |
| 14 | Falsy serialization | Generic cleaners could drop false/0/empty values | Added 98BG.1 |
| 15 | Unicode streaming | Existing coverage confirmed; strengthened test matrix | Added 98BG.2 regression requirement |
| 16 | ProtoJSON fidelity | Null/Struct/Any conversion contract incomplete | Added 98BG.3 |
| 17 | Metadata conversion | SDK/provider metadata fidelity incomplete | Added 98BG.4 |
| 18 | HTTP error envelope | `google.rpc.Status` vs framework/problem+json not explicit | Added 98BH.1 |
| 19 | JSON-RPC/gRPC errors | Typed detail parity needed stronger wire rule | Added 98BH.2–3 |
| 20 | Agent Card HTTP caching | ETag existed, Cache-Control/304 policy incomplete | Added 98BI.1–2 |
| 21 | Stale-card replay | High-risk use of stale cards not prohibited | Added 98BI.3–4 |
| 22 | Credential rotation | OAuth/API key/mTLS lifecycle not unified | Added 98BJ.1–2 |
| 23 | Redirect credential leakage | Existing redirect safety needed explicit operational rule | Added 98BJ.3 |
| 24 | Revocation during work | Active-task action after credential revocation incomplete | Added 98BJ.4 |
| 25 | Metadata abuse | No reserved namespace/complete metadata budget | Added 98BK |
| 26 | gRPC connection semantics | Deadline/keepalive/message bounds incomplete | Added 98BL.1 |
| 27 | SSE recovery | Risk of relying on `Last-Event-ID` outside A2A contract | Added 98BL.2 |
| 28 | Custom bindings | URI registration/error/reconnect requirements incomplete | Added 98BL.3 |
| 29 | Push DNS rebinding | Validation existed but not explicitly repeated per dispatch | Added 98BM.1 |
| 30 | Push auth v1 shape | AuthenticationInfo single-scheme/IANA semantics missing | Added 98BM.2 |
| 31 | Push secret reflection | Get/List/UI masking needed explicit rule | Added 98BM.3–4 |
| 32 | Push fan-out isolation | Existing multi-owner rule strengthened for per-config failure | Added 98BM.5 |
| 33 | Agent disable/deregister | Active-task handling after administrative removal incomplete | Added 98BN |
| 34 | External file credentials | Asset downloader ambient credential leakage not explicit | Added 98BO.1–2 |
| 35 | Artifact provenance | Remote metadata could be mistaken for verified lineage | Added 98BO.3–4 |
| 36 | Audit evidence integrity | Audit existed but tamper-evidence expectation absent | Added 98BP |
| 37 | v0.3 operation matrix | Legacy route could appear to support v1-only operations | Added 98BQ.1–2 |
| 38 | Legacy feature emulation | Native-vs-emulated capability distinction incomplete | Added 98BQ.3 |
| 39 | Latest SDK regressions | Revision 5 matrix predated Python 1.1.4/current fixes | Added 98BR |
| 40 | End-to-end regression gate | Needed one consolidated gate for all forty findings | Added 98BS |

All forty passes are complete. Identified gaps were incorporated into normative sections before this audit record.


# 100. Reference Material

A2A Protocol:

- https://a2a-protocol.org/v1.0.0/specification/
- https://github.com/a2aproject/A2A/blob/v1.0.0/specification/a2a.proto
- https://a2a-protocol.org/latest/topics/key-concepts/
- https://a2a-protocol.org/latest/topics/agent-discovery/
- https://a2a-protocol.org/latest/topics/streaming-and-async/
- https://a2a-protocol.org/latest/topics/extensions/
- https://a2a-protocol.org/latest/topics/multi-tenancy/
- https://a2a-protocol.org/latest/topics/enterprise-ready/
- https://a2a-protocol.org/latest/whats-new-v1/
- https://github.com/a2aproject/A2A/releases
- https://github.com/a2aproject/a2a-python/blob/main/CHANGELOG.md
- https://github.com/a2aproject/a2a-js/blob/main/CHANGELOG.md
- https://spec.openapis.org/oas/v3.2.0.html (Security Requirement semantics referenced by A2A security objects)

SmartAIHub companion architecture:

- Spec 186 — Unified Job Control Plane
- Spec 196 — Universal AI Assistant / Help / Orchestration integration
- Spec 199 — External MCP Gateway
- Spec 200 — Universal External Agent Control Plane
- Spec 206 — A2A-First Hybrid External Agent Interoperability Layer

Provider research evidence (informative and time-sensitive; checked 2026-09-18):

- Claude Code [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage) and [official releases](https://github.com/anthropics/claude-code/releases)
- OpenAI Codex [CLI documentation](https://developers.openai.com/codex/cli/) and [official releases](https://github.com/openai/codex/releases/latest)
- Google Antigravity [changelog](https://www.antigravity.google/changelog), [download/version page](https://antigravity.google/download), and [SDK overview](https://www.antigravity.google/docs/sdk/overview)
- DeepSeek Harness [official repository](https://github.com/deepseek-ai/deepseek-harness) and [official releases](https://github.com/deepseek-ai/deepseek-harness/releases)

These provider sources are not A2A conformance evidence. A provider can be
promoted from `not_publicly_documented`/`native_only` only after the live
Agent Card and route gates in Section 6A pass.

The versioned v1.0.0 URLs above are the normative protocol references for this
specification. `/latest` topic pages and SDK repositories are informative
discovery material only; an implementation MUST pin the protocol release,
`a2a.proto` source, SDK versions and conformance evidence in the compatibility
manifest rather than silently following a moving `latest` document.

---

# 101. Definition of Done

Spec 206 is complete only when SmartAIHub can demonstrate all three cases with the same product UX:

The initial researched provider inventory is not itself a demonstration of Case
A. Until a provider passes live A2A discovery and conformance, the expected
behavior for Claude Code, OpenAI Codex, Google Antigravity and DeepSeek Harness
is Case B: use the Spec 200 native adapter when available. If policy is
`a2a_required`, the system MUST fail closed instead of silently taking that
native path.

```text
CASE A
External Agent supports complete usable A2A
→ SmartAIHub automatically uses A2A

CASE B
External Agent does not support A2A
→ SmartAIHub automatically uses Spec 200 native adapter

CASE C
External Agent exposes A2A but that route cannot safely satisfy the current task
→ SmartAIHub automatically chooses Spec 200 fallback
  without duplicating execution
```

And all three cases still share:

```text
Universal Agent Task Manifest
Capability Resolver
worker_jobs
worker_job_events
Runner control
Approval
RAG
Library
Billing
Audit
Verification
Web UI
```

That parity contract is the central success criterion of Spec 206.
