# Spec 261 — SmartAIHub Portable AI Application Standard (SPAAS)

**Status:** Proposed — Implementation-Ready / Review-Hardened  
**Version:** 1.6.0  
**Date:** 2026-10-04  
**Scope:** Platform-wide / Additive  
**Primary Owners:** SmartAIHub Core Platform, Development Orchestrator, Marketplace, Runtime Control Plane, Security & Privacy, Product Distribution  
**Normative Language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are to be interpreted as normative requirements.  
**Review:** v1.5 retains its 64 cumulative review passes. v1.6 adds a targeted MCP 2026 protocol/extension reconciliation against the official 2026-07-28 core specification plus the current Skills, Tasks and MCP Apps extension specifications; this targeted addendum does not inflate the prior generic pass count.  
**Provider Baseline Verification:** 2026-10-04. Provider-specific examples in this spec are informative and MUST be re-discovered through adapter capability negotiation at runtime.  
**MCP Baseline Verification:** 2026-10-04. MCP core revision `2026-07-28`, `server/discover`, generic extension negotiation, Skills over MCP, Tasks, and MCP Apps/UI were reconciled against official Model Context Protocol repositories. Core protocol version and extension version are separate compatibility dimensions.

---

## 0. Revision 1.6.0 — MCP 2026 Extension Negotiation & Portable Protocol Requirements

Revision 1.6.0 hardens SPAAS for the post-`2026-07-28` Model Context Protocol architecture without making MCP itself the application standard. SPAAS continues to define the portable product contract; the MCP Gateway/adapter layer owns MCP wire behavior; implemented Spec 256 remains the semantic capability-resolution authority; and Spec 277 projects protocol/runtime truth to Task Control.

The controlling invariants are:

> **A SPAAS application declares protocol requirements; it does not hard-code a peer's advertised capabilities as truth.**

> **MCP capability state is three-stage: `ADVERTISED` is not `NEGOTIATED`, and `NEGOTIATED` is not `QUALIFIED`. Runtime selection may rely on a hard requirement only after the applicable SmartAIHub qualification/policy gate succeeds.**

> **Core MCP revision and each MCP extension revision are independent version dimensions. A package MUST NOT assume that an extension version equals the base protocol revision.**

Revision 1.6.0 adds or strengthens:

- generic required/optional MCP extension declarations rather than hard-coded booleans for today's extensions;
- explicit base-protocol compatibility and `server/discover`-based discovery for MCP `2026-07-28` peers;
- separation of advertised, mutually negotiated, policy-qualified and currently usable extension state;
- portable fallback rules when an optional extension is absent;
- fail-closed behavior when a required or security-critical extension cannot be understood or qualified;
- Skills-over-MCP mapping to the existing Skill/Capability architecture without creating an MCP-specific Skill source of truth;
- MCP Tasks mapping to external execution handles without creating a second SmartAIHub task/job authority;
- MCP Apps/UI as an optional interaction surface, not a SmartAIHub Mini App identity;
- extension-aware portability, conformance, mixed-version and downgrade testing;
- preservation of unknown optional extension metadata only when omission is explicitly safe.

This revision is additive. Existing packages that do not declare MCP extensions remain valid.

---

## 0A. Revision 1.5.0 — Application Surface, Platform, Distribution, Commercialization & Privacy Consolidation

Revision 1.5.0 makes SPAAS the canonical **application/product contract** for SmartAIHub. It keeps the v1.4 materialization model intact while making explicit what an application is, where it runs, which technology stack it uses, how users interact with it, which agent/orchestration capabilities it contains, how it is distributed or sold, and how personal data is protected.

The primary design invariant is:

> **SPAAS defines the portable product contract. Application experience, platform target, technology stack, agent profile, orchestration runtime, harness, execution environment, distribution form, access policy, commercial offering, and privacy policy are separate dimensions and MUST NOT be collapsed into one provider-specific runtime type.**

Revision 1.5.0 adds or strengthens the following first-class concepts:

- **Application Experience** — traditional UI, chat-first agent app, dashboard/workspace, workflow/automation, headless service, or hybrid.
- **Platform Target** — Web, Windows, macOS, Android, iOS, messaging channel, server/CLI, or multi-platform combinations.
- **Technology Stack Contract** — language, framework, runtime, package/build system, native layer and platform-sharing strategy.
- **Agent Profile vs Harness** — an Agent Profile is persistent identity/configuration/policy; a Harness is an execution engine such as Codex-, Claude Code-, Hermes-, thClaws-, SmartAIHub-native or future compatible harnesses.
- **Orchestration Provider** — SmartAIHub Native, LangGraph, OpenAI Agents SDK, or another compatible provider, distinct from the harness itself.
- **Harness Extension Package** — a SPAAS distribution form that materializes skills, tools, MCP, instructions, workflows, hooks/configuration and optional UI into one or more harnesses without redefining the harness adapter.
- **Communication & Interaction Capabilities** — voice command/realtime voice, internal messenger-style conversations, email, LINE, Telegram, WhatsApp, telephony/SMS, push/notification and future channels through capability adapters.
- **MCP and A2A Roles** — an application may be MCP client, MCP server, A2A client, A2A server/agent, or combinations thereof.
- **Wallet/Payment Capability** — wallet visibility, authorization, payment/receive and sponsor/tenant/user payer policy with least-privilege approval boundaries.
- **Design/Reference Contract** — reference websites/apps/screenshots/videos and design intent are inputs to Spec 270; Spec 261 remains authoritative for product/platform/stack constraints.
- **Deployment Instance** — package/release identity is separated from concrete hosting, address/domain, access policy, billing, entitlement and runtime bindings.
- **Marketplace Offering** — one SPAAS package may be free, pay-per-use, subscription/rental, perpetual license, deployment license, source license or enterprise offering.
- **External/Self-hosted Delivery** — customer-managed, creator-managed, SmartAIHub-managed, private-cloud and offline/air-gapped delivery MAY be supported by one package without forking its canonical identity.
- **Privacy, Data Protection & Trust** — data categories, purpose, residency, retention, external processors/egress, creator/support access, training use, deletion/export/revocation and auditability are normative package/deployment contracts.

The canonical lifecycle remains:

```text
DISCOVER
  ↓
RESOLVE
  ↓
MATERIALIZE
  ├─ INSTALL
  ├─ PROVISION
  ├─ BIND
  └─ ATTACH
  ↓
CONFIGURE
  ↓
AUTHORIZE
  ↓
ACTIVATE
  ↓
RUN
  ↓
RECONCILE
  ↓
UPGRADE / MIGRATE / ROLLBACK / RETIRE
```

Revision 1.5.0 is additive. Existing v1.4 packages remain valid. New fields introduced by this revision MUST be optional unless the corresponding capability or conformance profile is declared.

---

## 0B. Revision 1.4.0 — Agent Materialization & Managed Bot Interoperability

Revision 1.4.0 extends SPAAS so one canonical SmartAIHub application can use or become portable across **installable agent harnesses, SmartAIHub-native runtimes, provisioned cloud/sandbox runtimes, existing user-owned runtimes, and managed persistent agents/bots** without making any package manager or vendor the application standard.

The central interoperability invariant is:

> **SPAAS defines application identity, required capabilities, policy, lifecycle and portable state contracts; adapters define how those requirements are realized on a specific provider/runtime.**

Therefore:

- `pip`, `uv`, `pipx`, `npm`, `pnpm`, native installers, signed binaries, OCI images and provider installers are **distribution mechanisms**, not SPAAS identity.
- Claude/Codex/Hermes-class local or remote harnesses are represented through **Runtime Adapters**.
- OpenAI Dots/Grok Bot/Meta Muse-class persistent managed agents are represented through **Managed Agent Adapters / Bindings** when a supported integration surface exists.
- Existing installations MAY be **ATTACHed** instead of being reinstalled.
- Cloud or sandbox environments MAY be **PROVISIONed** instead of locally installed.
- Managed provider agents MAY be **BINDed** without pretending that SmartAIHub installed or owns their runtime.
- A provider for which no supported programmatic integration exists MUST be reported as unsupported, handoff-only, or connector-only; the platform MUST NOT fabricate successful control.

The canonical lifecycle added by this revision is:

```text
DISCOVER
  ↓
RESOLVE
  ↓
MATERIALIZE
  ├─ INSTALL
  ├─ PROVISION
  ├─ BIND
  └─ ATTACH
  ↓
CONFIGURE
  ↓
AUTHORIZE
  ↓
ACTIVATE
  ↓
RUN
  ↓
RECONCILE
  ↓
UPGRADE / MIGRATE / ROLLBACK / RETIRE
```

This revision is additive. It does not replace Spec 224, Skills, MCP, A2A, External Agent Gateway, Assistant lifecycle, Task Control, Chat, Runtime Resolver, worker jobs, or provider-specific adapters. It defines the package/lifecycle contract those systems MUST share.

---

## 1. Purpose

SmartAIHub MUST define a first-class, portable, versioned, deployable AI application artifact that can be created by the Development Orchestrator, Visual Builder, external coding agents, Git import, marketplace cloning/forking, AFS/MUXI import, and future authoring channels, while preserving one consistent application contract.

The standard defined by this specification is named:

> **SmartAIHub Portable AI Application Standard (SPAAS)**

A SPAAS application is not merely source code, a frontend bundle, an agent definition, or a workflow. It is a complete logical AI product definition containing or declaring all runtime-relevant assets and dependencies required to validate, install, materialize, provision, bind, attach, deploy, run, observe, upgrade, migrate, export, import, clone, fork, sign, publish, white-label, and retire the application.

The core architectural rule is:

> **Build format MUST be independent from runtime placement.**

An application may run entirely in one runtime, or be split across Cloudflare Workers, Containers, Sandboxes, SmartAIHub Desktop/Runner, user machines, external agent harnesses, remote services, and managed providers, while remaining one logical application.

---

## 2. Why This Spec Exists

Before this specification, SmartAIHub has multiple powerful building blocks:

- Development Orchestrator (Spec 224)
- Workflow runtime
- Assistant/agent runtime
- Skills and Skill-first capability resolution
- MCP and A2A
- External agent gateways
- Cloud and local runners
- Generated UI
- Mini Apps / AI Products
- Marketplace
- Multi-tenant and white-label deployment
- BYOK and user-owned subscriptions
- Scheduled/triggered execution
- Memory and knowledge systems
- Billing/credits/revenue share
- Cloudflare Workers/Containers/Sandbox runtime paths

However, these capabilities need a common deployable product boundary.

Without a standardized application package, each subsystem risks inventing its own assumptions about:

- app identity
- versioning
- required models
- secret names
- storage requirements
- permissions
- tenant bindings
- migration rules
- runtime topology
- deployment state
- rollback
- publication
- ownership
- provenance
- observability
- compatibility

SPAAS becomes the platform contract that joins those systems together.

---

## 3. Relationship to Existing Specs

### 3.1 Additive boundary

This is a new additive specification. It MUST NOT require retroactive rewriting of frozen specifications.

- Specs 1–213 remain frozen.
- Spec 224 remains the active Development Orchestrator spec and MUST NOT be redefined by this document.
- Existing implemented components SHOULD be integrated through compatibility adapters and additive contracts.

### 3.2 Spec 224 relationship

Spec 224 is a **producer** of SPAAS-compliant applications.

Spec 224 owns the software factory flow:

`Plan → Implement → Test → Debug → Review → Verify → Package`

Spec 261 owns the output contract for the final package:

`Package → Validate → Sign → Release → Deploy → Operate → Upgrade/Rollback → Retire`

Spec 224 MUST NOT own the canonical definition of the application package. It MUST consume the package standard defined here.

### 3.3 Other integration points

SPAAS SHOULD integrate with, but not duplicate, the responsibilities of:

- Workflow Runtime / orchestration specs
- Capability Resolver / Skill-first execution
- MCP Gateway
- A2A interoperability
- External Agent Gateway
- Managed Cloud Agents
- Cloudflare runtime and migration specs
- Generated UI
- Marketplace / Mini App distribution
- Assistant Profile lifecycle
- Task Control / Chat continuation
- Tenant / custom-domain / white-label platform
- Memory / knowledge / RAG layers
- Billing, credit, quota, revenue-share systems
- Spec 270 Design Intelligence / provider-neutral UI generation; Spec 261 owns product/platform/stack/reference constraints while Spec 270 owns design generation/adaptation artifacts
- LangGraph, OpenAI Agents SDK, and future agent/workflow frameworks as orchestration providers, not SPAAS identity

### 3.4 Capability and MCP protocol ownership

SPAAS MUST preserve one owner per concern:

- **Spec 256 (implemented)** remains the canonical SmartAIHub Skill-first semantic capability discovery/resolution layer. Spec 261 declares application requirements and MUST NOT create another capability registry or semantic ranker.
- **MCP Gateway / Spec 199-class boundary** owns MCP transport, base-protocol compatibility, `server/discover`, request metadata, wire-level extension negotiation, and peer connection behavior.
- **Spec 248-class Skills transport contract** owns Skills-over-MCP wire semantics and compatibility. A SmartAIHub Skill release remains distinct from a remote MCP Skill advertisement.
- **Spec 186 / Feature 195 durable jobs** remain the canonical physical execution/job authority. An MCP Tasks handle is an external protocol handle, never a competing scheduler or completion authority.
- **Spec 277** projects runtime/protocol/extension compatibility, negotiated state, degradation and fallback to Task Control; it does not become the MCP gateway.
- **Spec 269** may choose/delegate among qualified implementations but consumes capability/protocol facts from their owners rather than re-negotiating MCP itself.

---

## 4. Design Principles

### 4.1 Portable by contract, not by infrastructure

Portable means the package describes what the application requires and how it may be deployed. It does not mean every application must run identically in every environment.

### 4.2 Capability-based dependencies

Applications SHOULD request capabilities rather than hard-code providers.

Preferred:

```yaml
requires:
  capabilities:
    - id: text-generation
      min_context_tokens: 128000
      tool_calling: true
```

Less preferred:

```yaml
model: gpt-some-specific-version
```

Provider pinning MAY be used when necessary, but MUST be explicit and explainable.

### 4.3 Secrets never travel as plain package content

Packages MUST declare secret requirements, but MUST NOT embed production credentials.

### 4.4 Deterministic validation

A package MUST be machine-validatable before deployment.

### 4.5 Runtime placement is resolved at deployment time

The package may declare placement constraints and preferences, but the SmartAIHub Runtime Resolver owns final placement subject to policy, capability, cost, user preference, availability, and security.

### 4.6 One logical application, many runtime components

A SPAAS application may be distributed across multiple execution locations while retaining one application identity, release identity, audit trail, billing context, and lifecycle.

### 4.7 Safe evolution

All mutable runtime behavior MUST be constrained by versioned policy and provenance. Self-tuning or adaptive behavior MUST NOT silently rewrite security, billing, tenancy, permissions, or production deployment policy.

### 4.8 Ecosystem interoperability

SPAAS SHOULD support import/export adapters for external standards such as Agent Formation Standard (AFS) without making those formats the internal canonical representation.

### 4.9 Package managers and providers are implementation details

SPAAS MUST NOT define `pip`, `uv`, `pipx`, `npm`, `pnpm`, a native installer, an OCI image, a cloud vendor, or a named agent provider as the canonical application format.

An application declares **what it requires**. A Distribution Adapter / Runtime Adapter declares **how a compatible runtime is acquired and controlled**.

A provider-specific requirement MAY be pinned only when the application genuinely depends on that provider's behavior or contractual integration. Such pinning MUST be explicit, auditable, and surfaced as reduced portability.

### 4.10 Capability truth over marketing equivalence

Two agents MUST NOT be considered interchangeable merely because both are described as assistants, bots, coding agents, or always-on agents. Runtime selection MUST use machine-readable capability negotiation and policy constraints.

Capabilities such as background execution, browser/computer use, shell access, repository mutation, MCP, A2A, Skills, scheduling, persistent identity, subagents, approval callbacks, artifact export, cancellation and resume MUST be represented individually.

### 4.11 Application-first, not agent-first

SPAAS is an application/product standard. An application MAY contain zero, one, or many agents. Agent categories such as software-development, personal, business, workflow, or Mini App agent are templates/presets and MUST NOT create separate execution-runtime classes by themselves.

### 4.12 Explicit platform and stack truth

Every deployable application MUST declare the platform target(s) and enough technology-stack metadata for build, test, deployment and maintenance tooling to avoid guessing material architectural choices. Provider-neutral portability does not mean stack ambiguity.

### 4.13 Agent, harness, orchestration, protocol and environment are distinct

The canonical taxonomy is:

```text
Agent Profile         = persistent WHO / identity, instructions, policy and context
Harness               = execution engine that performs agent work
Orchestration Runtime = HOW multi-step or multi-agent flow is coordinated
Runtime Protocol      = task-domain execution discipline such as Spec 224
Skill                 = reusable know-how/capability
Tool/MCP/App          = external action or access surface
Execution Environment = WHERE the workload physically/logically runs
SPAAS Package         = portable product contract combining the above
```

No implementation MAY collapse these concepts merely because one provider happens to bundle several of them.

### 4.14 Privacy and least privilege by default

A package MUST NOT gain access to personal data, connections, secrets, wallet actions, communication channels, microphone/camera, contacts, location, files, or external egress merely because a component declares an agent. Access MUST be separately declared, authorized, scoped, revocable and auditable.

### 4.15 Address, access, hosting and commercial terms are orthogonal

A custom domain does not imply public access. Public access does not imply free usage. Marketplace listing does not imply SmartAIHub hosting. Package ownership, deployment ownership, runtime payer and revenue recipient MAY be different principals and MUST be represented separately.

---

## 5. Core Domain Objects

The following objects are normative.

### 5.1 Application

Stable logical product identity.

Minimum fields:

```yaml
application:
  id: app_<uuid>
  slug: construction-ai
  name: Construction AI
  owner_type: user|team|tenant|platform
  owner_id: <principal-id>
```

### 5.2 Application Version

Immutable versioned application definition.

```yaml
version:
  semver: 1.4.2
  schema_version: spaas/v1
  created_at: <timestamp>
  source_revision: <optional source revision>
```

A released version MUST be immutable. Changes require a new application version.

### 5.3 Release

A signed/promotable build of an application version.

A release records:

- package digest
- build provenance
- validation result
- test result
- SBOM reference
- signer
- policy verdict
- release channel
- rollout eligibility

### 5.4 Deployment

A concrete SmartAIHub-controlled running topology for one release/materialization in an environment and tenant scope. Deployment is one possible runtime realization, not the universal representation of every external or managed agent integration.

```text
Application
  └─ Version
      └─ Release
          └─ Installation
              └─ Materialization
                  └─ Deployment(s)   # when SmartAIHub owns/controls deployed runtime state
```

### 5.5 Environment

Examples:

- development
- preview
- beta
- staging
- production
- tenant-specific production
- local desktop
- offline/air-gapped local runner

### 5.6 Component

Deployable or logical unit within an application.

Examples:

- UI
- API function
- assistant
- agent
- workflow
- skill bundle
- MCP connection
- A2A endpoint
- scheduled job
- media pipeline
- database migration
- knowledge index
- worker
- background service

### 5.7 Binding

Deployment-time mapping from a declared requirement to a real resource.

Examples:

- secret requirement → Vault entry
- model capability → selected provider/model
- storage capability → R2 bucket namespace
- SQL capability → PostgreSQL schema/database
- vector capability → Vectorize index
- runtime component → Worker/Container/Desktop Runner
- custom domain → Cloudflare route

### 5.8 Installation

A durable tenant/user-scoped **product installation record** exists independently from any one running deployment or provider runtime.

An Installation MUST bind at least:

- application ID
- selected immutable release or release channel
- owner/tenant scope
- entitlement/license state where applicable
- configuration overlay references
- secret/resource binding references
- update policy
- data-retention policy
- materialization policy
- one or more Materialization references

Creating an Installation does **not** imply that binaries were installed on a machine. `Installation` is the durable SmartAIHub product-level desired-state object.

### 5.9 Materialization

A Materialization is the durable record describing how one Installation, or one of its components, is realized in a concrete execution environment.

The canonical materialization operations are:

- `INSTALL` — acquire an executable/runtime into a controlled local or remote environment.
- `PROVISION` — create or allocate runtime infrastructure such as sandbox, container, VM, Worker, hosted agent environment, or equivalent resource.
- `BIND` — connect SmartAIHub to a managed provider-owned agent/service without claiming ownership of its runtime.
- `ATTACH` — register and use an already-existing runtime or harness without reinstalling or reprovisioning it.

A Materialization MUST record at least:

- `materialization_id`
- installation/release/component identity
- operation type
- adapter identity and adapter version
- provider/runtime identity
- desired state and observed state
- resolved capability snapshot
- authentication/binding references, never plaintext secrets
- placement/environment identity
- external runtime/agent identifier where applicable
- provenance of acquisition or binding
- last reconciliation result
- lifecycle ownership boundaries

### 5.10 Runtime / Provider Adapter

A Runtime / Provider Adapter is a versioned SmartAIHub integration implementing discovery, capability negotiation and lifecycle operations for a specific execution surface.

Adapters MUST NOT redefine SPAAS application semantics. They translate canonical requirements into provider-specific actions and translate provider outcomes back into canonical execution/lifecycle outcomes.

### 5.11 External Agent Binding

An External Agent Binding is a Materialization result for a provider-owned or externally owned agent identity. It MUST declare whether SmartAIHub has:

- full programmatic control
- limited API/protocol control
- connector/tool-level access only
- user-mediated handoff only
- read-only status visibility

The platform MUST NOT report capabilities stronger than the integration actually exposes.

The extended object model is:

```text
Application
  └─ Version
      └─ Release
          └─ Installation(s)
              └─ Materialization(s)
                  ├─ Deployment(s)
                  ├─ External Agent Binding(s)
                  └─ Runtime Attachment(s)
```

An application MAY be installed but not currently materialized. A materialization MAY exist without a SmartAIHub-owned Deployment, for example when bound to a managed persistent agent. Deployment MUST NOT be treated as the sole durable representation of runtime realization.

---

## 6. Canonical Package Structure

SPAAS v1 defines a recommended package layout:

```text
my-application/
├─ app.manifest.yaml
├─ app.lock.json
├─ README.md
├─ LICENSES/
├─ ui/
├─ functions/
├─ assistants/
├─ agents/
├─ skills/
├─ workflows/
├─ mcp/
├─ a2a/
├─ knowledge/
├─ data/
├─ schemas/
├─ migrations/
├─ schedules/
├─ triggers/
├─ policies/
├─ tests/
├─ observability/
├─ assets/
├─ adapters/
└─ provenance/
   ├─ sbom.json
   ├─ build.json
   └─ signatures/
```

Not every directory is required.

The canonical manifest MUST identify which sections exist and how they are resolved.

---

## 7. `app.manifest.yaml`

The manifest is the authoritative logical application contract.

Minimum skeleton:

```yaml
apiVersion: spaas.smartaihub.app/v1
kind: AIApplication

metadata:
  id: app_xxx
  name: Construction AI
  slug: construction-ai
  version: 1.5.0
  description: AI-assisted construction operations application
  labels: {}
  annotations: {}

ownership:
  ownerType: tenant
  ownerId: tenant_xxx
  authors: []

compatibility:
  minimumPlatformVersion: "2026.10"
  manifestSchema: "1.0"

application:
  kind: application|mini_app|agent_app|service|extension|bundle
  experience: traditional_ui|chat_first|dashboard|workspace|workflow|headless|hybrid
  primarySurface: chat|web|desktop|mobile|dashboard|map|editor|none

targets: []

stack:
  primaryLanguage: null
  shared: {}
  web: {}
  desktop: {}
  mobile: {}
  backend: {}
  build: {}

platformStrategy:
  mode: single_codebase|shared_core|web_plus_wrapper|platform_specific|service_only

design:
  provider: internal|spec270|external|none
  references: []
  requirements: {}

components: []

agents: []

orchestration:
  provider: smartaihub_native|langgraph|openai_agents_sdk|external|custom|auto
  ownership: {}

harnesses:
  bindings: []
  preferences: []

interaction:
  chat: {}
  voice: {}
  multimodal: {}

communications:
  internalMessaging: {}
  channels: []
  telephony: {}
  notifications: {}

interop:
  mcp:
    client: {}
    server: {}
  a2a:
    client: {}
    server: {}

wallet:
  enabled: false
  capabilities: []
  approvalPolicy: {}

requires:
  capabilities: []
  secrets: []
  storage: []
  network: []

security:
  permissions: []
  approvals: []
  isolation: {}
  dataEgress: {}

privacy:
  classification: []
  purposes: []
  collectedData: []
  residency: {}
  retention: {}
  externalProcessors: []
  creatorAccess: {}
  supportAccess: {}
  trainingUse: false
  userRights: {}

runtime:
  topology: []
  placementPolicy: {}

hosting:
  supported: []
  preferred: smartaihub|external|self_hosted

address:
  allowedModes: [platform_path, subdomain, custom_domain, internal]

access:
  visibility: private|shared|group|organization|tenant|unlisted|public
  authentication: {}
  principals: []

operations:
  healthChecks: []
  schedules: []
  triggers: []
  resources: {}
  delivery: {}
  reconciliation: {}

events:
  emits: []
  consumes: []

services:
  provides: []
  requires: []

dataPolicy:
  classification: []
  residency: {}
  retention: {}

lifecycle:
  install: {}
  upgrade: {}
  rollback: {}
  uninstall: {}

observability:
  logs: {}
  metrics: {}
  traces: {}

billing:
  metering: []
  payerPolicy: {}

commercialization:
  offerings: []
  entitlement: {}
  licensing: {}
  revenuePolicyRef: null

distribution:
  forms: []
  marketplace: {}
  selfHosted: {}
  externalDeployment: {}
  sourceDelivery: {}

publication:
  visibility: private
  marketplace: {}

provenance:
  source: {}
  build: {}
```

---

## 8. Component Model

Each component MUST have:

- stable component ID
- component type
- version/digest or source reference
- dependency edges
- declared capabilities
- declared side effects
- execution policy
- input/output schema when applicable
- health/verification behavior when applicable

Example:

```yaml
components:
  - id: boq-analyst
    type: assistant
    source: assistants/boq-analyst.yaml
    dependsOn:
      - skill:parse-boq
      - capability:text-generation
    sideEffects:
      - read:project-files
      - write:analysis-results
```

Circular dependencies MUST be rejected unless explicitly supported by a defined runtime cycle contract.

---

## 9. Supported Component Types

SPAAS v1 SHOULD support at least:

1. `ui`
2. `api-function`
3. `background-worker`
4. `assistant`
5. `agent`
6. `skill`
7. `workflow`
8. `mcp-client`
9. `mcp-server`
10. `a2a-agent`
11. `scheduler`
12. `trigger-handler`
13. `data-migration`
14. `knowledge-source`
15. `vector-index`
16. `media-pipeline`
17. `external-agent-adapter`
18. `webhook-endpoint`
19. `event-consumer`
20. `event-producer`
21. `chat-surface`
22. `voice-interface`
23. `communication-channel-adapter`
24. `telephony-adapter`
25. `wallet-capability`
26. `orchestration-runtime`
27. `harness-extension`
28. `notification-provider`
29. `reference-artifact`
30. `deployment-adapter`

The registry MUST be extensible. Package/distribution forms such as `application`, `harness_plugin`, `skill_pack`, `workflow_pack`, `mcp_server`, `a2a_agent`, `api_service`, or `bundle` are not required to map one-to-one to component types.

---

## 10. AI Runtime Section

SPAAS MUST be able to declare AI capabilities without tightly coupling to one vendor.

### 10.1 Models

Applications MAY declare:

- task category
- minimum context window
- structured output requirement
- tool calling requirement
- image/audio/video capability
- latency class
- quality tier
- cost ceiling
- locality requirement
- privacy requirement
- provider allowlist/denylist
- hard provider pin where unavoidable

Example:

```yaml
requires:
  capabilities:
    - id: llm.primary
      type: text-generation
      requirements:
        minContextTokens: 128000
        structuredOutput: true
        toolCalling: true
      preferences:
        latencyClass: interactive
        costClass: balanced
```

The final model MUST be selected through SmartAIHub LLM Routing / Capability Resolution unless pinned.

### 10.2 Assistants and agents

Assistant/agent declarations SHOULD be references to reusable platform objects where possible.

The package MAY bundle definitions when portability requires self-contained behavior.

Agent requirements SHOULD be expressed in provider-neutral capability terms. A package MAY express provider preferences or hard pins, but SHOULD NOT encode provider installation commands as application semantics.

Illustrative declaration:

```yaml
agents:
  - id: coding-worker
    requires:
      capabilities:
        - repo.read
        - repo.write
        - shell.execute
        - test.execute
        - artifact.diff
      execution:
        background: preferred
        resumable: required
      materialization:
        allowed: [ATTACH, INSTALL, PROVISION, BIND]
      providerPolicy:
        mode: dynamic
```

The Runtime Resolver MAY satisfy this declaration with SmartAIHub Native Agent, Codex-class harnesses, Claude-class harnesses, Hermes-class harnesses, thClaws-class harnesses, or future compatible runtimes, subject to actual discovered capabilities and policy.

Agent categories such as `software-development`, `personal`, `business`, `workflow`, `mini-app`, and `custom` SHOULD be implemented as profile templates. Selecting a template MUST NOT create a parallel runtime architecture. Changing a compatible harness MUST NOT require creating a new Agent Profile unless the user explicitly wants a distinct identity/context.

### 10.2A Orchestration providers

SPAAS MUST support orchestration-provider declarations independent from harness identity. At minimum the architecture MUST permit:

- `smartaihub_native`
- `langgraph`
- `openai_agents_sdk`
- `external`
- `custom`
- `auto` capability-based resolution

An orchestration provider MAY itself execute models/tools directly and therefore MAY operate without a Codex/Claude/Hermes-style harness. Hybrid topologies MAY delegate selected nodes/tasks to harnesses. Every run MUST still have one authoritative primary orchestration owner for cancellation, retry authority, budget enforcement, approval state and final outcome aggregation. Nested orchestrators MUST declare control ownership explicitly and MUST NOT create competing retry/cancellation loops.

### 10.3 Skills

Skills MUST be first-class components.

The package MUST support:

- bundled skills
- referenced marketplace skills
- referenced tenant skills
- Skill Extension / standards-compatible skills
- version pinning
- trust policy
- capability index metadata

### 10.4 MCP

MCP integrations MUST support both **client** and **server** roles where declared. A package MAY consume external MCP tools, expose its own capabilities as an MCP server, or do both.

MCP integrations MUST support:

- declared server requirements;
- base-protocol compatibility constraints;
- capability/version discovery;
- tool/resource/prompt discovery as applicable;
- generic extension requirements and negotiated extension settings;
- lazy/progressive disclosure;
- allow/deny policy;
- credential/authorization binding;
- tenant isolation;
- runtime endpoint binding;
- explicit fallback/degradation semantics;
- compatibility and qualification evidence.

For MCP revision `2026-07-28`, compatible adapters MUST understand the stateless core model and mandatory `server/discover` support. SPAAS MUST NOT require application code to recreate the retired protocol-level initialization/session semantics. Application-level durable state remains allowed and is separate from MCP transport sessions.

A package MUST NOT require loading every MCP tool schema or extension payload into model context. Discovery metadata SHOULD be bounded and loaded progressively.

MCP extension support MUST be modeled generically rather than by a fixed set of booleans so that new namespaced extensions can be preserved and evaluated without changing the SPAAS core schema.

### 10.5 A2A

A2A integrations MUST support client/delegator and server/agent roles where declared. A package MAY expose one or more agent capabilities to other systems without requiring its primary UI to be open.

A2A dependencies MUST declare:

- remote/local mode
- identity/trust expectations
- protocol version
- capability contract
- fallback behavior
- timeout/retry constraints

---

## 11. Workflows and Durable Execution

Workflow definitions MUST remain logically separate from the application package format.

SPAAS describes which workflows are included or required; the Workflow Runtime owns execution semantics.

Application packages MUST be able to reference:

- workflow ID/version
- entry point
- required capabilities
- durable state requirements
- approval gates
- side-effect classification
- retry policy
- idempotency policy
- compensation behavior

Long-running operations SHOULD integrate with `worker_jobs` / unified job control rather than invent per-app job tables unless explicitly justified.

---

## 12. Execution Outcome Contract

SPAAS introduces a platform-wide outcome vocabulary for application-level tasks.

Minimum states:

```text
SUCCEEDED
PARTIAL
WAITING_USER
WAITING_APPROVAL
WAITING_RESOURCE
WAITING_CREDENTIAL
WAITING_EXTERNAL
RETRYABLE
REPLANNING
BLOCKED
STUCK
IMPOSSIBLE
BUDGET_EXHAUSTED
POLICY_DENIED
CANCELLED
ABANDONED
FAILED
```

Every non-success terminal or waiting result SHOULD include:

```json
{
  "state": "BLOCKED",
  "reason_code": "MISSING_CREDENTIAL",
  "summary": "Accounting connector cannot authenticate",
  "attempts": [],
  "what_would_unblock": [
    "Bind an accounting-system credential to this deployment"
  ]
}
```

This contract SHOULD be consumable by Task Control Center and Chat continuation.

---

## 13. Runtime Topology and Placement

A SPAAS application MUST be able to express logical topology without fixing infrastructure unnecessarily.

Example:

```yaml
runtime:
  topology:
    - component: web-ui
      requires:
        - edge-http
      preferences:
        - cloudflare-worker

    - component: long-agent
      requires:
        - durable-process
        - outbound-network
      preferences:
        - cloudflare-container
        - smartaihub-runner

    - component: gpu-renderer
      requires:
        - gpu
      preferences:
        - user-runner
```

The Runtime Resolver MUST consider:

- capability availability
- tenant policy
- user preference
- data residency
- secret locality
- device availability
- cost
- latency
- reliability
- network policy
- billing policy
- provider quota
- runtime health
- execution trust level
- GPU requirement
- offline requirement

### 13.1 Placement authority

Applications MAY express constraints and preferences.

Applications MUST NOT unilaterally select privileged execution infrastructure outside platform policy.

### 13.2 Split execution

One deployment MAY span multiple runtimes.

All distributed components MUST preserve:

- application ID
- deployment ID
- trace correlation
- tenant/user scope
- billing attribution
- policy context
- release version

---

## 14. Cloud, Local, External, and Managed Agent Runtime Targets

SPAAS SHOULD support at least:

### Cloud

- Cloudflare Workers
- Cloudflare Containers
- Cloudflare Sandbox
- managed external agent runtime
- provider-hosted agent API
- HTTP/service integrations

### Local / user-owned

- SmartAIHub Desktop on Windows
- SmartAIHub Desktop on macOS
- SmartAIHub Runner
- registered remote Linux runner
- local model runtime
- locally installed external agent harness
- ComfyUI or similar user-owned execution endpoints through MCP/adapter

### External installable or attachable harnesses

Examples include:

- Codex-compatible agent harness
- Claude Code/Agent SDK-compatible harness
- Hermes Agent-compatible harness
- thClaw or other compatible agent runtime
- ZCode / DeepSeek / future harnesses
- AFS/MUXI runtime through adapter

These examples are informative. Runtime support MUST be determined by an installed/available adapter and live capability discovery.

### Managed persistent agents / bots

SPAAS MUST also be able to represent provider-owned persistent agents that are not installed by SmartAIHub, including Dots/Grok Bot/Muse-class products and future equivalents.

Such runtimes use `BIND` or provider-specific handoff/connector integration rather than fake local installation. Where no stable supported programmatic interface exists, the adapter MUST advertise the actual integration level and MAY require user handoff.

### Runtime class taxonomy

Every candidate SHOULD classify itself as one or more of:

- `smartaihub-native`
- `installable-harness`
- `attachable-existing-runtime`
- `provisioned-sandbox-or-container`
- `remote-agent-api`
- `managed-persistent-agent`
- `mcp-capability-provider`
- `a2a-agent-endpoint`
- `human-handoff-surface`

Runtime class is not a quality ranking. It determines lifecycle and control semantics.

---

## 15. Secret and Credential Requirements

Packages MUST declare secret requirements only by logical key.

Example:

```yaml
requires:
  secrets:
    - id: accounting.oauth
      type: oauth-token
      required: true
      scope: deployment

    - id: openai.api_key
      type: api-key
      required: false
      allowUserOwnedCredential: true
```

Secrets MUST be bound at deploy/run time through approved stores.

The resolver SHOULD support:

- platform-owned credential
- tenant-owned credential
- team-owned credential
- user-owned credential
- per-device credential
- external subscription/BYOK

Secret material MUST NOT be included in exported portable packages unless explicitly exported through a separate secure user-authorized secret-transfer process.

---

## 16. Identity, Principal, and Access Scope

SPAAS MUST distinguish application identity from user identity.

Applications SHOULD be able to execute under:

- user principal
- team principal
- tenant principal
- service principal
- delegated external principal

Bindings MUST preserve:

- principal ID
- tenant ID
- user ID if applicable
- device/runner identity if applicable
- session/delegation scope
- granted capabilities

Cross-tenant execution MUST default to denied.

---

## 17. Permissions and Side-Effect Policy

Every component that may cause external side effects MUST declare them.

Examples:

- send email
- create calendar event
- publish social content
- spend credits
- execute shell
- modify source code
- deploy production
- access local files
- write database
- call external API
- submit payment

The manifest MUST support:

```yaml
security:
  permissions:
    - capability: filesystem.write
      scope: workspace
      approval: never

    - capability: production.deploy
      scope: tenant
      approval: always
```

SmartAIHub policy remains authoritative.

An application MUST NOT lower platform-enforced permissions.

---

## 18. Approval Model

SPAAS MUST support declaring approval checkpoints.

Approval types SHOULD include:

- user confirmation
- tenant admin approval
- owner approval
- security approval
- financial approval
- production release approval
- external side-effect approval

Approval references MUST integrate with the platform Approval Service rather than implementing separate ad hoc UI logic.

---

## 19. Data, Storage, and Database Requirements

Applications MUST declare storage requirements rather than assume fixed infrastructure.

Supported classes SHOULD include:

- relational
- object
- vector
- key-value
- durable state
- cache
- queue
- event stream
- ephemeral workspace

Example:

```yaml
requires:
  storage:
    - id: app-db
      type: relational
      engine: postgres-compatible
      persistence: durable

    - id: assets
      type: object
      persistence: durable

    - id: semantic-index
      type: vector
      persistence: durable
```

Bindings MAY resolve to SmartAIHub standard infrastructure such as PostgreSQL, R2, Vectorize, KV, Durable Objects, Queues, Workflows, or user-owned resources according to platform policy.

---

## 20. Data Isolation and Namespacing

Every deployed application MUST have explicit data scope.

At minimum:

- application ID
- deployment ID
- tenant ID

User-level scope SHOULD be added where relevant.

Reusable platform storage MUST use namespacing or enforced row-level/application-level isolation.

Applications MUST NOT access another tenant's data through shared credentials or ambiguous namespace configuration.

---

## 21. Schema and Migration Contract

Applications that own persistent data MUST declare schema versioning.

A release MAY contain migrations.

Each migration MUST declare:

- migration ID
- from version
- to version
- target data store
- reversible: yes/no
- preconditions
- postconditions
- estimated impact
- rollback procedure if supported

Production migration MUST be validated before release promotion.

Rollback MUST NOT be declared supported if database/data migration makes rollback unsafe.

---

## 22. Installation, Materialization, Upgrade, Rollback, Migration, and Retirement Lifecycle

SPAAS defines a product-level Installation lifecycle and a runtime-level Materialization lifecycle. The two MUST NOT be conflated.

### 22.1 Product installation creation

1. parse package
2. verify manifest schema
3. verify integrity/signature
4. evaluate trust policy
5. create/update durable Installation desired state
6. resolve dependencies and entitlements
7. resolve capabilities
8. identify secret/credential requirements
9. validate permissions and policy
10. prepare lifecycle plan

This phase creates SmartAIHub product intent. It does not guarantee that a runtime has yet been acquired.

### 22.2 Materialization

For each component requiring execution, the Materialization Resolver MUST choose one supported operation:

```text
INSTALL   acquire a runtime/tool into a controlled environment
PROVISION create/allocate runtime infrastructure
BIND      connect to provider-owned managed agent/service
ATTACH    adopt an existing runtime without reinstalling it
```

The operation MUST be selected from capability, security, tenancy, availability, cost, locality, user preference, provider policy and ownership constraints.

After materialization the platform MUST:

1. configure only declared settings
2. bind credentials by reference
3. authorize required capabilities
4. perform readiness/health negotiation
5. activate the component
6. persist observed state and external identifiers

### 22.3 Canonical runtime lifecycle

```text
DISCOVER → RESOLVE → MATERIALIZE → CONFIGURE → AUTHORIZE → ACTIVATE → RUN → RECONCILE
```

Any lifecycle stage MAY enter a typed `WAITING_*`, `DEGRADED`, `QUARANTINED`, `FAILED`, or `REQUIRES_USER_ACTION` state.

### 22.4 Upgrade

Upgrade MUST support:

- application release compatibility analysis
- adapter/runtime compatibility analysis
- config diff
- permission diff
- secret requirement diff
- schema migration plan
- runtime topology/materialization diff
- provider capability diff
- cost estimate change
- staged rollout
- rollback eligibility

Adapter upgrades MUST NOT silently expand application permissions.

### 22.5 Migration

Migration MAY move a component between materialization modes or providers, for example:

- `ATTACH(local harness)` → `PROVISION(cloud sandbox)`
- `INSTALL(local harness)` → `BIND(managed agent)`
- provider A → provider B where capability equivalence is proven

Migration MUST preserve application/release/installation identity and MUST create a new auditable materialization generation. Mutable state transfer is governed separately by the authorized state portability contract.

### 22.6 Rollback

Rollback SHOULD support:

- previous application release selection
- previous adapter/runtime version where policy permits
- component rollback
- configuration restoration
- migration safety checks
- prior materialization reactivation where still valid
- rollback health verification

### 22.7 Retirement / uninstall

Retirement MUST distinguish:

- deactivation
- deployment/runtime teardown
- external managed-agent unbinding
- attached-runtime detachment without deleting user-owned software
- optional uninstall of SmartAIHub-managed local runtime artifacts
- secret unlinking/revocation
- data retention
- data deletion
- external resource cleanup
- marketplace entitlement

`ATTACH` MUST default to detach-only ownership semantics. `BIND` MUST default to unbind-only semantics unless the provider API and explicit user authorization permit destructive remote deletion.

Data deletion MUST require explicit policy and MUST NOT be implied merely by retiring runtime components.

---

## 23. Lifecycle State Machines

SPAAS MUST distinguish application/release lifecycle from runtime materialization lifecycle.

### 23.1 Application / release lifecycle

```text
DRAFT
  ↓
BUILDING
  ↓
VALIDATING
  ↓
TESTING
  ↓
PACKAGED
  ↓
SIGNED
  ↓
RELEASE_CANDIDATE
  ↓
RELEASED
  ↓
DEPRECATED
  ↓
RETIRED
```

### 23.2 Materialization lifecycle

```text
DISCOVERING
  ↓
RESOLVING
  ↓
PLANNED
  ↓
MATERIALIZING
  ↓
CONFIGURING
  ↓
AUTHORIZING
  ↓
ACTIVATING
  ↓
ACTIVE
  ↓
RECONCILING / UPGRADING / MIGRATING / ROLLING_BACK
  ↓
RETIRING
  ↓
RETIRED
```

Additional failure/wait states MUST be represented separately from primary lifecycle state and SHOULD include at least `WAITING_CREDENTIAL`, `WAITING_APPROVAL`, `WAITING_USER`, `REQUIRES_USER_ACTION`, `DEGRADED`, `QUARANTINED`, `FAILED`, and `EXTERNAL_STATE_UNKNOWN` where applicable.

---

## 24. Package Integrity and Supply-Chain Security

Every release MUST have a content digest.

Production publication SHOULD require:

- immutable package digest
- build provenance
- source revision reference
- dependency lock
- SBOM
- signature/attestation
- vulnerability/policy scan result
- license metadata

The package MUST detect modification after signing.

The signature design SHOULD support future Sigstore-compatible or equivalent attestations without coupling v1 to a single provider.

---

## 25. `app.lock.json`

The lock file SHOULD record exact resolved dependencies for reproducible release builds.

It SHOULD include:

- skills and versions/digests
- workflows and versions
- agent definitions
- external package dependencies
- runtime adapters
- imported AFS resources
- model pins if applicable
- schema version
- build tool version

The lock file MUST NOT contain secrets.

---

## 26. Dependency Resolution

Dependencies may be:

- bundled
- SmartAIHub registry references
- marketplace references
- tenant-local references
- external OCI/artifact references if supported
- AFS references
- Git/source references for development only

Production releases SHOULD resolve mutable references into immutable versions/digests.

`latest`, branch heads, and other mutable references SHOULD be rejected for production unless explicitly approved.

---

## 27. AFS / MUXI Compatibility

SPAAS MUST NOT make MUXI Server or Runtime a core dependency.

SPAAS SHOULD define an adapter layer:

```text
AFS / MUXI Formation
        ↓ import
SPAAS Canonical Application
        ↓ export
AFS-compatible package
```

### 27.1 Import

The importer SHOULD map:

- agents
- skills
- MCP
- A2A
- workflows/SOPs
- memory declarations
- knowledge
- triggers/schedules
- model requirements
- access policy where representable

Unsupported fields MUST be surfaced as compatibility warnings/errors rather than silently ignored.

### 27.2 Export

Export MUST explicitly report:

- fully mapped features
- approximated features
- unsupported SmartAIHub-only features

### 27.3 Canonical authority

After import, the SPAAS representation is canonical within SmartAIHub.

---

## 28. Marketplace and Distribution

SPAAS MUST be the preferred distributable artifact for SmartAIHub Mini Apps / AI Products.

Marketplace metadata SHOULD support:

- listing identity
- publisher
- icon/brand assets
- screenshots/demo
- categories
- pricing model
- per-run credit policy
- subscription entitlement if applicable
- revenue-share configuration references
- license
- supported tenants/plans
- required capabilities
- device requirements
- geographic restrictions if legally necessary
- content safety classification
- privacy policy reference
- support contact
- changelog

Marketplace installation MUST run the same validation and policy pipeline as private deployments.

---

## 29. White Label and Tenant Branding

SPAAS applications MUST support deployment with tenant-specific branding without forking core app logic where possible.

Theme/branding bindings SHOULD support:

- app display name
- tenant logo
- color tokens
- typography tokens
- domain mapping
- email sender identity where configured
- legal links
- support links

Brand configuration MUST be separated from immutable application code whenever possible.

Custom domain bindings belong to deployment configuration, not portable source identity.

---

## 30. UI Contract

SPAAS MUST support applications with:

- no dedicated UI
- generated UI
- static UI
- dynamic component UI
- mobile/tablet-first UI
- desktop-specific UI
- chat-only surface
- Task Control integration

UI components SHOULD declare routes, required capabilities, responsive behavior, auth requirements, and backend bindings.

Generated UI MUST still produce a versioned UI artifact or declarative UI representation included in the package/release.

---

## 31. Chat / Task Control Integration

An installed application SHOULD be callable from the universal Chat/Task Control surface.

The package MAY declare:

- natural-language intents
- commands
- discoverable capabilities
- action schemas
- suggested entry points
- resumable job types

Example:

```yaml
commands:
  - id: review-boq
    intents:
      - review uploaded BOQ
      - compare project material costs
    entrypoint: workflow:boq-review
```

The Capability Resolver MUST remain authoritative for discovery and execution selection.

---

## 32. Skill-First Integration

Every application SHOULD expose meaningful functions through skills when skill representation is appropriate.

The system SHOULD prefer:

`Intent → Skill → capability/tool/agent/workflow`

over direct tool flooding.

SPAAS MUST support semantic capability metadata to enable progressive disclosure and retrieval of only relevant skills/tools.

---

## 33. Scheduling and Triggers

Applications MAY declare schedules and event triggers.

Supported trigger categories SHOULD include:

- cron/time schedule
- webhook
- database/event change
- queue message
- file upload
- external service event
- manual command
- application lifecycle event

Schedules MUST use shared SmartAIHub scheduling infrastructure where practical.

Long-running scheduled executions MUST integrate with durable job control.

---

## 34. Events and Inter-Component Communication

SPAAS SHOULD define logical events separately from transport.

Example:

```yaml
events:
  emits:
    - boq.review.completed
  consumes:
    - project.document.uploaded
```

Deployment may bind these events to:

- internal event bus
- Cloudflare Queues
- Workflows
- webhooks
- local runner channel
- other approved transport

Event contracts SHOULD be schema-versioned.

---

## 35. Observability

Every production deployment MUST provide at least:

- deployment health
- component health
- logs
- error events
- execution/job status
- release version

Advanced deployments SHOULD support:

- distributed tracing
- cost tracing
- model-call tracing
- MCP/A2A tracing
- approval tracing
- runtime placement tracing
- latency metrics
- tenant/user attribution

Trace context MUST follow cross-runtime execution wherever technically possible.

---

## 36. Billing, Credits, and Metering

SPAAS MUST support declarative metering categories without embedding financial logic into individual application code.

Examples:

- LLM usage
- media generation
- external provider cost
- skill fee
- per-run application fee
- compute/runtime fee
- storage fee

Metering events MUST include application, deployment, tenant, user/principal where applicable, and release version.

Marketplace revenue sharing SHOULD resolve through existing platform economic systems.

An application MUST NOT be able to bypass platform billing by emitting fabricated metering outcomes.

---

## 37. Budget Policy

Applications MAY declare default budget expectations.

Deployment/user/tenant policy MAY override them.

Execution SHOULD be able to return `BUDGET_EXHAUSTED` as a first-class outcome.

Budget dimensions MAY include:

- credits per run
- LLM spend
- external API spend
- compute time
- GPU time
- retry count
- wall-clock duration

---

## 38. Adaptive and Self-Tuning Behavior

Applications MAY contain adaptive policies or self-tuning components.

However, adaptive systems MUST NOT silently modify:

- security policy
- permissions
- tenant boundaries
- billing policy
- production deployment policy
- secret scope
- legal/compliance settings

Recommended pipeline:

`Observe → Propose → Evaluate → Benchmark → Approval/Policy Gate → Promote`

Safe bounded learning MAY auto-apply only when an explicit policy grants that authority.

---

## 39. Provenance

Every application version SHOULD record source provenance.

Possible sources:

- Spec 224 generated
- user-authored
- Git import
- Visual Builder
- external agent
- marketplace fork
- AFS/MUXI import
- template clone

Provenance SHOULD include:

- source IDs
- commit/revision
- authoring agent/model if relevant
- build tool version
- timestamp
- transformation steps
- parent/fork application ID

---

## 40. Forking, Cloning, and Derivation

SPAAS SHOULD support:

- clone for deployment
- fork for development
- template instantiation
- tenant-specific configuration overlay

Forks MUST receive new application identity unless explicitly representing a new version owned by the same application authority.

Lineage SHOULD be retained.

---

## 41. Configuration Overlay Model

Portable application definition SHOULD remain immutable across deployments.

Environment-specific values SHOULD use overlays/bindings:

```text
Base App Package
   + Environment Overlay
   + Tenant Branding Overlay
   + Secret Bindings
   + Runtime Bindings
   = Deployment
```

Overlay precedence MUST be deterministic and auditable.

---

## 42. Offline / Local-First Operation

SPAAS MUST permit application subsets to run on user devices when dependencies permit.

The package SHOULD declare offline compatibility:

```yaml
runtime:
  offline:
    supported: partial
    requiredComponents:
      - local-ui
      - local-model
```

Cloud-only features MUST fail clearly rather than silently degrade into incorrect behavior.

---

## 43. Runtime Trust Levels

Deployment targets SHOULD be classified by trust level.

Example:

- platform-managed trusted
- tenant-managed trusted
- user-owned registered
- external managed provider
- untrusted sandbox

Sensitive capabilities MAY require minimum trust level.

Runtime trust is separate from application package trust.

---

## 44. Network Policy

Applications MUST declare external network requirements where practical.

Policy SHOULD support:

- allowed domains
- denied domains
- inbound routes
- outbound routes
- webhook destinations
- private network requirements

Production runtime policy MAY be stricter than package declarations.

---

## 45. Compliance and Data Classification

SPAAS SHOULD support metadata for:

- personal data handling
- sensitive data classes
- data retention
- region constraints
- audit requirements
- required user consent

The package does not itself grant compliance; it declares requirements consumed by platform policy.

---

## 46. Validation Pipeline

Every package MUST pass validation before release.

Validation stages:

### V1 — Schema validation

- manifest syntax
- required fields
- enum correctness
- schema compatibility

### V2 — Structural validation

- referenced files exist
- component IDs unique
- dependency graph valid
- no invalid cycles

### V3 — Dependency validation

- versions resolvable
- immutable production references
- compatibility constraints

### V4 — Security validation

- no embedded secrets
- permission declarations
- side-effect declarations
- network policy
- suspicious executable content policy

### V5 — Runtime validation

- runtime requirements satisfiable
- placement constraints feasible
- required capabilities available

### V6 — Data/migration validation

- migration chain valid
- rollback declaration consistent

### V7 — Test validation

- required tests pass
- package-level smoke test

### V8 — Marketplace validation, when applicable

- metadata complete
- entitlement/pricing valid
- publisher identity valid
- policy scan passed

---

## 47. Test Requirements

A production-capable SPAAS package SHOULD include:

- manifest validation tests
- unit tests where applicable
- integration tests
- permission-policy tests
- deployment smoke test
- upgrade test
- rollback test where rollback is claimed
- tenant isolation test
- secret-binding test
- runtime-placement test
- marketplace install test if publishable

Critical applications MAY require disaster recovery and failure-injection tests.

---

## 48. Development Orchestrator Output Requirements

When Spec 224 produces a Mini App / AI Application, Final Verify MUST include SPAAS compliance.

Spec 224 SHOULD output:

1. application source
2. `app.manifest.yaml`
3. lock file
4. tests
5. migration definitions
6. runtime requirement declarations
7. permission declarations
8. secret requirements
9. build provenance
10. package digest
11. validation report

A generated app MUST NOT be considered production-ready merely because code tests pass.

Final Verify SHOULD distinguish:

- source complete
- SPAAS package valid
- deployment-compatible
- production policy eligible

---

## 49. Visual Builder Output Requirements

Visual Builder MUST target the same canonical SPAAS representation.

A visual graph is an authoring representation, not a competing runtime package format.

Recommended model:

`Visual Builder Graph → SPAAS Canonical Model → Package → Runtime`

---

## 50. Git Import Requirements

Git import SHOULD detect supported application structure and generate a SPAAS manifest proposal.

The user/agent MUST be shown unresolved items such as:

- missing secret declarations
- undeclared external services
- runtime assumptions
- unsupported build system
- database requirements

Automatic inference MUST be marked inferred until validated.

---

## 51. External Agent Authoring and Execution Interoperability

External coding agents MAY create or modify application source, and external agent harnesses MAY execute SPAAS-declared work, but the resulting application and every privileged execution MUST still pass canonical SmartAIHub policy gates.

No external agent may bypass:

- package validation
- release signing policy
- production deployment approval
- permission checks
- tenant policy
- budget/entitlement controls
- durable execution authority
- audit attribution

Provider-specific sessions MUST be linked to canonical SmartAIHub execution handles rather than becoming a competing task source of truth. SmartAIHub MUST persist enough continuation metadata to resume, inspect, cancel or safely hand off work where the provider supports those semantics.

External provider memory MUST NOT automatically become SmartAIHub memory. Import, indexing or synchronization of provider-side memory/content requires explicit capability, privacy and ownership policy.

---

## 52. API Surface

The platform SHOULD expose an application management API roughly covering:

```text
POST   /v1/apps
GET    /v1/apps/:appId
POST   /v1/apps/:appId/versions
POST   /v1/apps/:appId/validate
POST   /v1/apps/:appId/package
POST   /v1/apps/:appId/releases
GET    /v1/apps/:appId/releases
POST   /v1/apps/:appId/installations
GET    /v1/installations/:installationId
POST   /v1/installations/:installationId/materializations/plan
POST   /v1/installations/:installationId/materializations
GET    /v1/materializations/:materializationId
POST   /v1/materializations/:materializationId/reconcile
POST   /v1/materializations/:materializationId/activate
POST   /v1/materializations/:materializationId/retire
GET    /v1/runtime-adapters
GET    /v1/runtime-adapters/:adapterId/capabilities
POST   /v1/apps/:appId/deployments
GET    /v1/deployments/:deploymentId
POST   /v1/deployments/:deploymentId/upgrade
POST   /v1/deployments/:deploymentId/rollback
POST   /v1/deployments/:deploymentId/stop
POST   /v1/deployments/:deploymentId/start
DELETE /v1/deployments/:deploymentId
POST   /v1/apps/import/afs
POST   /v1/apps/:appId/export/afs
```

Exact routing MAY differ, but lifecycle coverage is required.

---

## 53. Database Model

Suggested canonical entities:

```text
applications
application_versions
application_releases
application_packages
application_components
application_dependencies
application_permissions
application_capability_requirements
application_secret_requirements
application_migrations
application_installations
application_materializations
application_materialization_generations
application_external_agent_bindings
application_runtime_attachments
runtime_adapter_catalog
runtime_adapter_capability_snapshots
application_deployments
application_deployment_bindings
application_runtime_placements
application_release_attestations
application_lineage
application_marketplace_metadata
```

The exact schema MAY normalize or merge these entities, but the control plane MUST preserve distinct identities for Installation, Materialization, Deployment and external provider/runtime bindings.

Do not duplicate platform-wide objects such as users, tenants, approvals, worker_jobs, secrets, marketplace wallets, or audit events when references are sufficient.

---

## 54. Event Model

Important platform events SHOULD include:

```text
app.created
app.version.created
app.validation.started
app.validation.failed
app.validation.passed
app.release.created
app.release.signed
app.installation.created
app.materialization.planned
app.materialization.started
app.materialization.requires_user_action
app.materialization.capability_changed
app.materialization.active
app.materialization.degraded
app.materialization.reconciled
app.materialization.retired
app.deployment.requested
app.deployment.started
app.deployment.healthy
app.deployment.failed
app.upgrade.started
app.upgrade.completed
app.migration.started
app.migration.completed
app.rollback.started
app.rollback.completed
app.retired
```

Events SHOULD carry correlation IDs and actor/principal identity. Materialization events SHOULD additionally carry installation/materialization generation, adapter identity/version and external provider/run identifiers when applicable.

---

## 55. Audit Requirements

The system MUST audit:

- package creation
- validation verdict
- signature/release promotion
- deployment
- production upgrade
- rollback
- permission changes
- secret bindings (metadata only, not secret value)
- runtime binding changes
- domain changes
- publication changes
- uninstall/delete actions

---

## 56. Error Model

SPAAS APIs SHOULD use stable machine-readable reason codes.

Examples:

```text
MANIFEST_INVALID
DEPENDENCY_UNRESOLVED
CAPABILITY_UNAVAILABLE
SECRET_MISSING
PERMISSION_DENIED
POLICY_DENIED
RUNTIME_UNAVAILABLE
MIGRATION_UNSAFE
SIGNATURE_INVALID
PACKAGE_TAMPERED
TENANT_SCOPE_VIOLATION
ROLLBACK_UNSUPPORTED
MARKETPLACE_POLICY_FAILED
```

Errors SHOULD include `what_would_unblock` when actionable.

---

## 57. Compatibility Strategy

SPAAS versioning MUST distinguish:

- manifest schema version
- SmartAIHub minimum platform version
- component schema versions
- imported external standard versions

Unknown required fields MUST fail closed.

Unknown optional extension fields MAY be preserved and ignored with warnings when safe.

---

## 58. Extension Mechanism

SPAAS MUST allow namespaced extensions.

Example:

```yaml
extensions:
  smartaihub.app/media-studio:
    version: 1
    config: {}

  partner.example/custom-policy:
    version: 2
    config: {}
```

Extensions MUST NOT override core security semantics.

---

## 59. Package Format, Transport, and Distribution Boundary

The canonical SPAAS package may be transported as:

- directory
- compressed archive
- artifact-registry object
- content-addressed bundle

The transport format MUST preserve:

- file paths
- manifest
- digests
- signature metadata
- lock file

A file extension such as `.sahapp` MAY be introduced as a user-facing convention, but the internal format MUST remain documented and open to inspection.

Agent/runtime distribution is separate from SPAAS transport. Runtime adapters MAY use, where officially supported and policy-allowed:

- `uv tool` / isolated Python tool environments
- `pipx`
- `pip` only inside an explicitly isolated environment unless the target itself owns the environment
- `npm` / `pnpm` / `bun`
- signed native installers/binaries
- OCI/container images
- provider-managed installers
- remote APIs with no local acquisition

SPAAS MUST NOT require one package manager across providers. Distribution methods MUST be typed adapter operations, not arbitrary shell strings supplied by an application manifest.

Untrusted install hooks, lifecycle scripts, downloaded bootstrap scripts, or opaque setup commands MUST execute only under an explicit sandbox/trust policy and MUST NOT inherit production secrets by default.

---

## 60. Application Registry

SmartAIHub SHOULD provide a registry capable of storing:

- application versions
- package digests
- releases
- provenance
- signatures
- SBOM
- compatibility metadata

The marketplace may consume the registry but is not identical to it.

Private applications MUST be registry-capable without marketplace publication.

---

## 61. Application Discovery

Applications SHOULD expose machine-readable capabilities for discovery by:

- Chat
- Capability Resolver
- Task Control
- agents
- marketplace
- external compatible runtimes

Discovery metadata SHOULD avoid exposing privileged internal actions to unauthorized principals.

---

## 62. Runtime and Materialization Resolution Algorithm — Minimum Inputs

The Runtime Resolver / Materialization Resolver SHOULD evaluate at least:

1. component requirements
2. required capability set and hard quality floors
3. required trust level
4. platform policy
5. tenant policy
6. user preference
7. allowed materialization operations (`INSTALL|PROVISION|BIND|ATTACH`)
8. existing compatible runtime availability
9. local runner availability
10. cloud/sandbox runtime availability
11. managed-provider integration availability and integration level
12. cost constraints
13. latency constraints
14. data locality
15. secret locality
16. required network access
17. GPU/device requirements
18. runtime health
19. provider quota
20. version/protocol compatibility
21. billing/subscription eligibility
22. authentication method availability
23. background/resume/cancel/approval requirements
24. provider terms/policy constraints exposed to the adapter
25. ownership and teardown semantics

The resolution decision MUST be auditable and MUST identify rejected candidates and stable reason codes for hard incompatibilities.

Provider preference MUST NOT override a hard security, capability, locality, authorization or quality requirement.

---

## 63. Runtime Failover

Applications MAY allow fallback runtimes.

Example:

```yaml
runtime:
  placementPolicy:
    component: long-agent
    preferred:
      - user-runner
      - cloudflare-container
    failover: allowed
```

Failover MUST respect:

- secret availability
- data locality
- trust level
- billing consent
- tenant policy

A runtime failure MUST NOT cause secret material to be copied to a less trusted runtime without authorization.

---

## 64. Deployment Plan

Before applying a deployment, SmartAIHub SHOULD generate a plan showing:

- components
- placement
- required capabilities
- secret bindings
- storage provisioning
- migrations
- network changes
- permission changes
- cost-impact summary
- domain changes
- approval requirements

Production deployment SHOULD support plan-before-apply behavior.

---

## 65. Preview and Ephemeral Deployments

SPAAS SHOULD support preview deployments for:

- pull-request style review
- Development Orchestrator verification
- marketplace review
- tenant customization testing

Preview deployments SHOULD be isolated and automatically expirable.

---

## 66. Release Channels

Recommended channels:

- dev
- alpha
- beta
- stable
- private
- tenant-specific

Marketplace users SHOULD not be automatically upgraded across breaking major versions unless policy explicitly allows it.

---

## 67. Update Policy

Deployment policy MAY support:

- manual update
- notify-only
- patch auto-update
- minor auto-update
- pinned version

Security hotfix behavior SHOULD be separately configurable.

---

## 68. Backward Compatibility

Breaking changes MUST increment major application version or explicitly declare incompatible migration behavior.

Application version compatibility SHOULD include:

- API compatibility
- data compatibility
- workflow compatibility
- stored memory compatibility if relevant
- UI route compatibility where externally linked

---

## 69. Memory and Knowledge Portability

The package MUST distinguish definitions from user/tenant data.

The portable package MAY include:

- knowledge schema
- index configuration
- seed documents that are distributable
- memory policy

The portable package SHOULD NOT automatically include:

- user memory
- tenant private documents
- runtime conversation history
- production vector contents

Data export is a separate authorized process.

---

## 70. Application Backup and Disaster Recovery

The platform SHOULD define backup metadata per deployment:

- application release
- deployment configuration
- data bindings
- secret references
- runtime bindings
- persistent data backup references

Restoration MUST revalidate current policy before reactivation.

---

## 71. Marketplace Safety Boundary

Marketplace package installation MUST NOT implicitly grant:

- production deployment
- shell execution
- local filesystem access
- external account access
- payment authority
- unrestricted outbound network

These remain subject to user/tenant/platform policy.

---

## 72. Multi-Tenant Requirements

SPAAS is explicitly multi-tenant aware.

The same application release MAY serve multiple tenants through separate deployments or safe shared runtime where isolation is guaranteed.

Per-tenant deployment MUST support independent:

- branding
- domain
- secrets
- data
- billing
- policy
- runtime selection
- release channel

---

## 73. White-Label Productization

A SPAAS application MAY become a white-label product.

The application package remains the product logic artifact; white-label instances are deployment overlays.

This separation SHOULD allow:

```text
One App Release
  ├─ Tenant A / tenant-a.com
  ├─ Tenant B / tenant-b.com
  └─ Tenant C / custom domain
```

without copying source for every tenant.

---

## 74. Creator / Publisher Separation

Application creator, package publisher, tenant operator, and runtime provider MAY be different principals.

The data model MUST not assume they are the same user.

This supports SmartAIHub's three-party and future multi-party economic model.

---

## 75. Development Protocol Integration

Spec 224 and future software-factory agents SHOULD treat SPAAS as a mandatory target contract.

Development planning SHOULD include:

- app manifest design
- component decomposition
- capability declarations
- runtime constraints
- permission model
- deployment model
- migration strategy
- validation plan

before final implementation is considered complete.

---

## 76. Human-Readable Application Summary

Every package SHOULD generate a human-readable summary that explains:

- what the app does
- components
- required permissions
- data used
- external connections
- required secrets
- estimated runtime requirements
- deployment targets
- billing behaviors
- upgrade/rollback characteristics

This summary is useful for user review, marketplace review, tenant admin approval, and troubleshooting.

---

## 77. Machine-Readable Application Capability Card

Every package SHOULD expose a compact capability card for agents and platform discovery.

Example fields:

```yaml
capabilityCard:
  provides:
    - boq-analysis
    - cost-comparison
  accepts:
    - pdf
    - xlsx
    - natural-language-command
  produces:
    - report
    - structured-data
  sideEffects:
    - none-by-default
```

---

## 78. Import/Export Requirements

### Import

Supported import paths SHOULD include:

- SPAAS native package
- Git repository
- AFS package
- SmartAIHub marketplace package
- template

### Export

Export SHOULD support:

- native SPAAS package
- source bundle where licensing permits
- AFS-compatible export where representable
- deployment manifest without secrets

Exports MUST preserve provenance and license metadata.

---

## 79. Policy Evaluation

Policy evaluation SHOULD occur at:

1. package validation
2. release creation
3. deployment plan
4. deployment apply
5. runtime invocation for privileged actions
6. upgrade
7. rollback
8. marketplace publication

A prior policy pass MUST NOT be assumed permanently valid when context changes.

---

## 80. Non-Goals

SPAAS v1 does NOT attempt to:

- replace the Workflow Runtime
- replace Spec 224
- replace MCP
- replace A2A
- replace Skills
- replace Cloudflare deployment systems
- define a new container runtime
- embed every production dataset in a portable archive
- make all applications runnable in all environments
- make MUXI/AFS a mandatory dependency
- standardize every agent provider on `pip`, `uv`, npm, OCI images, or any single installer
- imply that every consumer-facing managed bot exposes a public control API
- take ownership of user/provider-owned runtimes merely because they are attached or bound

---

## 81. Implementation Phases

### Phase A — Canonical schema and validator

Deliver:

- manifest schema
- parser
- validator
- canonical in-memory model
- package digest
- dependency graph validation
- secret scanning

### Phase B — Core registry and lifecycle

Deliver:

- applications
- versions
- releases
- deployments
- package storage
- lifecycle APIs
- audit events

### Phase C — Spec 224 integration

Deliver:

- generated manifest
- validation during Final Verify
- package build
- release candidate output

### Phase D — Runtime Resolver integration

Deliver:

- placement contract
- Cloudflare targets
- Desktop/Runner targets
- runtime binding persistence
- Materialization Resolver (`INSTALL|PROVISION|BIND|ATTACH`)
- provider capability snapshots

### Phase D2 — External agent and managed-agent interoperability

Deliver:

- Distribution Adapter interface
- Runtime Adapter interface
- Managed Agent Adapter interface
- existing-runtime detection / `ATTACH` path
- provider-owned agent `BIND` path
- canonical execution handle mapping
- adapter conformance fixture suite
- capability negotiation and stable incompatibility reasons
- provider-auth/subscription binding without credential scraping

### Phase E — Marketplace / white-label

Deliver:

- publishing metadata
- install flow
- entitlement hooks
- branding overlays
- custom-domain deployment binding

### Phase F — Interop

Deliver:

- AFS importer
- AFS exporter
- compatibility report

### Phase G — Advanced supply-chain and enterprise policy

Deliver:

- signatures/attestations
- SBOM
- vulnerability policy
- advanced compliance constraints

---

## 82. Suggested Implementation Modules

Illustrative modules:

```text
packages/spaas-schema
packages/spaas-validator
packages/spaas-packager
packages/spaas-resolver
packages/spaas-materialization
packages/spaas-adapter-contracts
packages/spaas-adapter-conformance
packages/spaas-afs-adapter
packages/spaas-provenance
packages/spaas-client

apps/web/server/services/apps/
apps/web/server/services/deployments/
apps/web/server/routers/apps.ts

workers/app-runtime-resolver/
```

Actual repository layout MAY differ.

---

## 83. Minimum Viable v1

SPAAS v1 is considered minimally useful when it can:

1. define an application manifest
2. package source/components
3. declare secrets and capabilities
4. validate package structure
5. create immutable version/release
6. deploy to at least one cloud target
7. deploy to at least one SmartAIHub Runner target
8. track deployment lifecycle
9. install through a tenant scope
10. integrate with Spec 224 Final Verify
11. support upgrade and basic rollback
12. export without leaking secrets

---

## 84. Production-Ready v1 Acceptance Criteria

The spec is considered implementation-complete only when all of the following are demonstrated.

### Package and schema

- [ ] Valid SPAAS package accepted deterministically
- [ ] Invalid manifest rejected with stable reason codes
- [ ] Embedded secret detection blocks release
- [ ] Package digest changes when content changes
- [ ] Immutable release cannot be modified in place

### Runtime

- [ ] One application can deploy across at least two runtime types
- [ ] Split-runtime deployment preserves one deployment identity
- [ ] Runtime placement decision is auditable
- [ ] Runtime failure returns structured outcome

### Security

- [ ] Tenant isolation proven
- [ ] Permission escalation blocked
- [ ] Missing secret returns `WAITING_CREDENTIAL` or equivalent
- [ ] Untrusted runtime cannot receive disallowed secrets

### Lifecycle

- [ ] Install succeeds
- [ ] Upgrade succeeds
- [ ] Rollback succeeds for rollback-compatible release
- [ ] Unsafe rollback is refused
- [ ] Uninstall does not silently delete retained data

### Spec 224

- [ ] Spec 224 can generate a SPAAS-compliant application
- [ ] Final Verify distinguishes source pass from package/deployment eligibility

### Marketplace

- [ ] Private package can publish/install through marketplace pipeline
- [ ] Install still requires permission/secret/runtime resolution
- [ ] Branding overlay does not modify core package digest

### Interop

- [ ] AFS import produces compatibility report
- [ ] Unsupported AFS features are surfaced
- [ ] SPAAS export omits secrets

### Observability

- [ ] Cross-runtime execution has application/deployment/release trace identity
- [ ] Billing/metering events include app and tenant context

### v1.3 hardening

- [ ] Malicious or oversized archives are rejected before unsafe extraction or resource exhaustion
- [ ] Production build provenance identifies toolchain/environment inputs and classifies nondeterministic outputs
- [ ] Required extensions are namespace-resolved and unsupported mandatory extensions fail closed
- [ ] Mixed control-plane/runtime/CLI versions pass the declared skew/compatibility matrix during rolling upgrade
- [ ] Lease/TTL/schedule/replay-sensitive behavior is tested under bounded clock skew
- [ ] Privacy deletion propagates to declared derived data, indexes/caches, and retained copies according to policy
- [ ] AI fallback cannot silently violate declared capability or quality floors
- [ ] A compromised/revoked release can be quarantined or disabled without destroying audit evidence
- [ ] Cross-runtime traces use stable semantic identity with secret/PII redaction policy
- [ ] Long-running privileged work revalidates relevant authorization/entitlement before protected side effects
- [ ] External dependency failure does not create unbounded retry storms or cascading resource exhaustion
- [ ] Native SPAAS import/export round trip preserves canonical semantics and safe unknown optional extensions
- [ ] Stateful portability, when claimed, has an authorized versioned export/restore proof separate from the code package
- [ ] Preview/ephemeral deployment expiration removes or explicitly retains owned resources without orphaned spend

### v1.4 agent materialization and interoperability

- [ ] Product Installation can exist before any runtime is materialized
- [ ] Materialization plan selects only `INSTALL`, `PROVISION`, `BIND`, or `ATTACH` operations supported by the target adapter
- [ ] Existing compatible runtime can be `ATTACH`ed without taking over user-owned update/uninstall authority
- [ ] SmartAIHub-managed `INSTALL` records acquisition source, resolved version, integrity/provenance and cleanup ownership
- [ ] `PROVISION` records external resource ownership, expiry/cost and cleanup semantics
- [ ] Managed provider agent can be `BIND`ed without being falsely represented as locally installed or SmartAIHub-owned
- [ ] Provider without supported control API resolves to explicit limited/handoff/unavailable integration level
- [ ] Runtime selection rejects a provider missing any hard required capability
- [ ] Canonical execution handle maps provider session/run identity back to SmartAIHub Task/Run/tenant/principal identity
- [ ] Provider capability or entitlement drift triggers reconciliation and safe degraded/blocked behavior
- [ ] Adapter upgrade passes conformance fixtures and cannot silently expand permissions
- [ ] Retirement distinguishes uninstall, deprovision, unbind and detach and reports orphaned resources
- [ ] `SPAAS-AGENT-PORTABLE` conformance is demonstrated or a machine-readable portability limitation is emitted

---

## 85. Key Failure Scenarios That MUST Be Tested

1. package declares secret but no binding exists
2. package attempts to embed an API key
3. app requests GPU but no GPU runtime exists
4. user runner goes offline mid-execution
5. preferred runtime fails and fallback is less trusted
6. migration succeeds but new release health check fails
7. rollback requested after irreversible migration
8. tenant tries to bind another tenant's secret
9. marketplace update adds a new privileged permission
10. dependency version disappears or is revoked
11. package digest mismatch after signing
12. imported AFS app contains unsupported semantics
13. local/offline deployment attempts cloud-only capability
14. model provider quota is exhausted
15. application exceeds budget during retry/replan loop
16. production deployment is requested without required approval
17. split runtime loses trace correlation
18. app is forked and lineage is lost
19. uninstall is requested while data retention policy requires preservation
20. white-label domain points to the wrong tenant deployment
21. desired state and actual runtime state drift after partial deploy
22. two reconcilers race and attempt conflicting deployment writes
23. secret or OAuth credential rotates while long-running work is active
24. signing key or publisher credential is revoked after release publication
25. rollout is interrupted while traffic is split between old and new revisions
26. component exceeds CPU, memory, concurrency, wall-clock, or queue limits
27. queue consumer is slower than producer and backpressure/DLQ policy is missing
28. duplicate at-least-once event delivery causes a non-idempotent side effect
29. required app-to-app service contract becomes incompatible
30. readiness passes while a critical downstream dependency is unavailable
31. stateful component is terminated without drain/checkpoint semantics
32. deployment violates declared data residency or secret locality
33. backup exists but restore cannot recreate compatible app/data state
34. dependency digest is valid but publisher/signing trust is revoked
35. dependency confusion or namespace substitution resolves an unintended package
36. inbound webhook is replayed or forged without replay/authentication controls
37. outbound URL supplied by app/user attempts SSRF against protected infrastructure
38. platform version lacks a required manifest feature and incorrectly ignores it
39. offline/local copy reconnects with conflicting mutable state
40. uninstall leaves orphaned billable or externally owned resources without an explicit retention decision
41. active/active placement causes split ownership of a singleton component
42. regional failover activates a stale owner or violates secret/data-locality constraints
43. an in-flight durable workflow created by release N is resumed by release N+1 with incompatible state semantics
44. a production config/binding update becomes half-applied across components
45. a runtime advertises SPAAS capability support but violates event, permission, or lifecycle semantics
46. registry GC removes an artifact still required by a live execution, rollback, audit, or legal hold
47. app/publisher ownership transfer rewrites historical provenance or retains an unauthorized secret/domain binding
48. model failover sends classified data to a provider with weaker retention, training-use, locality, or trust guarantees
49. a public UI leaks a server secret or tenant alias weakens origin/CSP protections
50. one component uses another component's privilege through an unscoped shared service credential
51. a hard dependency cycle prevents safe startup, readiness, or shutdown
52. partial provisioning failure destroys an external resource that policy required to retain
53. marketplace publication includes an asset/model/dataset with unresolved redistribution rights
54. a production admission waiver expires but deployment remains authorized without re-evaluation
55. external SaaS/API changes contract or is sunset without compatibility detection or surfaced degradation
56. stale DNS/custom-domain route remains attached after tenant/deployment reassignment
57. a secret/config rebind requires restart but is hot-applied incorrectly
58. a runtime migration loses durable execution release/binding identity needed for safe resume
59. content-addressed dedup exposes a shared artifact to a tenant without authorization
60. webhook/callback endpoint is reassigned and delivers events to the wrong tenant/application
61. compressed package expands beyond allowed bytes/file-count/nesting limits or attempts hardlink/symlink escape
62. two nominally identical production builds differ because toolchain, locale, clock, network fetch, or generated randomness was not controlled or recorded
63. a package marks an extension as required but runtime silently ignores an unknown namespace/version
64. rolling platform upgrade creates an unsupported control-plane/runtime/schema version combination
65. clock skew expires a valid lease early, accepts an expired replay window, or runs a schedule twice incorrectly
66. deletion request removes primary rows but leaves disallowed embeddings, caches, indexes, logs, derived artifacts, or export copies reachable
67. model/provider fallback satisfies API shape but falls below a declared capability/quality floor and silently changes application behavior
68. a release is discovered malicious after deployment but the platform cannot quarantine/disable affected capability without deleting evidence
69. trace/log sampling or redaction exposes a secret/PII field or loses causal identity across MCP/A2A/external-agent boundaries
70. a durable job retains privileged authority after user entitlement, tenant membership, approval, or policy was revoked
71. failing dependency triggers synchronized retries across replicas and causes a retry storm/cascading outage
72. SPAAS export/import round trip drops an unknown-but-safe optional extension or changes canonical application semantics
73. application-state export mixes tenant data, lacks schema/version metadata, or restores into an incompatible release without detection
74. expired preview deployment leaves running containers, domains, queues, storage, credentials, or other billable resources orphaned
75. build cache or remote artifact cache supplies bytes that do not match the attested dependency/source identity
76. emergency kill switch disables the wrong tenant/application/release because scope identity is ambiguous
77. circuit breaker or dependency degradation path bypasses policy and fails over to a less trusted endpoint/provider
78. authorization revalidation during resume cannot distinguish already-committed side effects from still-authorized future steps
79. application manifest attempts to inject an arbitrary privileged shell install command through a distribution field
80. SmartAIHub reinstalls an already compatible user-owned harness and breaks the user's environment instead of safely attaching
81. `ATTACH` retirement accidentally uninstalls or upgrades software owned by the user
82. `BIND` retirement accidentally deletes a provider-owned persistent agent without explicit destructive authority
83. managed bot is advertised as supporting cancel/resume/webhook control although only user-mediated UI handoff exists
84. provider changes capabilities or subscription entitlement and SmartAIHub continues dispatching work under stale assumptions
85. adapter update changes authorization semantics or gains new scopes without policy re-evaluation
86. consumer-app cookie/session credential is scraped and reused instead of supported OAuth/API/subscription authorization
87. provider session ID becomes canonical task identity and breaks continuation/audit after provider migration
88. cross-provider fallback loses approval/budget/audit context while preserving only prompt text
89. runtime resolver chooses a lower-capability provider because it is cheaper despite an unmet hard requirement
90. detached/managed external resource remains billable or privileged after application retirement and is not surfaced as orphaned
91. provider-native memory is imported into SmartAIHub memory without consent, provenance, scope or deletion policy
92. adapter reports generic success after an unsupported provider operation rather than a typed capability error

---

## 86. Example Complete Manifest (Condensed)

```yaml
apiVersion: spaas.smartaihub.app/v1
kind: AIApplication

metadata:
  id: app_construction_ai
  name: Construction AI
  slug: construction-ai
  version: 1.4.2

ownership:
  ownerType: tenant
  ownerId: tenant_acme

compatibility:
  minimumPlatformVersion: "2026.9"
  manifestSchema: "1.0"

components:
  - id: web-ui
    type: ui
    source: ui/

  - id: boq-review
    type: workflow
    source: workflows/boq-review.yaml

  - id: boq-analyst
    type: assistant
    source: assistants/boq-analyst.yaml

  - id: parse-boq
    type: skill
    source: skills/parse-boq/

  - id: coding-helper
    type: agent
    source: agents/coding-helper.yaml

requires:
  capabilities:
    - id: llm.primary
      type: text-generation
      requirements:
        minContextTokens: 128000
        structuredOutput: true

  secrets:
    - id: accounting.oauth
      type: oauth-token
      required: false

  storage:
    - id: app-db
      type: relational
      engine: postgres-compatible
      persistence: durable

    - id: assets
      type: object
      persistence: durable

security:
  permissions:
    - capability: project.files.read
      scope: tenant
      approval: never

    - capability: accounting.write
      scope: tenant
      approval: always

runtime:
  topology:
    - component: web-ui
      requires: [edge-http]
      preferences: [cloudflare-worker]

    - component: boq-review
      requires: [durable-process]
      preferences: [cloudflare-container, smartaihub-runner]

    - component: coding-helper
      requires:
        - repo.read
        - repo.write
        - shell.execute
        - test.execute
        - task.resume
      materialization:
        allowed: [ATTACH, INSTALL, PROVISION, BIND]
      providerPolicy:
        mode: dynamic

  placementPolicy:
    allowFallback: true
    rejectFallbackWhenHardCapabilityMissing: true

operations:
  healthChecks:
    - component: web-ui
      type: http
      path: /health

lifecycle:
  upgrade:
    strategy: rolling
  rollback:
    supported: true

observability:
  traces:
    enabled: true
  metrics:
    enabled: true

billing:
  metering:
    - llm_usage
    - skill_fee
    - runtime_compute

publication:
  visibility: private
  marketplace:
    publishable: true

provenance:
  source:
    type: spec224
    runId: devrun_xxx
```

---

## 87. Architectural Result

When fully implemented, SmartAIHub should support the following invariant:

```text
Any Authoring Path
        │
        ├─ Spec 224 Development Orchestrator
        ├─ Visual Builder
        ├─ Git Import
        ├─ External Coding Agent
        ├─ Marketplace Fork
        └─ AFS/MUXI Import
        │
        ▼
SPAAS Canonical Application
        │
        ├─ Validate
        ├─ Test
        ├─ Package
        ├─ Sign
        ├─ Version
        │
        ▼
SmartAIHub Application Registry
        │
        ▼
Capability + Runtime + Materialization Resolver
        │
        ├─ INSTALL compatible local/runtime harness
        ├─ PROVISION cloud/sandbox/container runtime
        ├─ BIND supported managed persistent agent/service
        ├─ ATTACH existing user/tenant runtime
        │
        ▼
Canonical Task / Approval / Audit / Billing / Artifact Contracts
        │
        ├─ Operate Cloud
        ├─ Operate Desktop/Runner
        ├─ Operate White Label Tenant
        ├─ Use External Agent Harness
        ├─ Use Managed Agent Binding
        ├─ Publish Marketplace
        ├─ Export
        └─ Reconcile / Migrate / Rollback / Upgrade / Retire
```

The standard therefore transforms SmartAIHub from a system that can generate software into a platform that can **create, package, operate, distribute, and evolve portable AI software products under one consistent contract**.

---

## 88. Final Normative Decisions

1. **SPAAS is the canonical SmartAIHub application format.**
2. **Spec 224 MUST produce SPAAS-compliant output for Mini App / AI Application delivery.**
3. **SPAAS MUST remain independent of any one infrastructure runtime.**
4. **SPAAS MUST support split-runtime applications.**
5. **Secrets MUST be declared, never embedded.**
6. **Runtime placement MUST be resolved by platform policy and capability availability.**
7. **Released application versions MUST be immutable.**
8. **Production deployment MUST pass deterministic validation and policy gates.**
9. **Marketplace, white-label, tenant deployments, and local runners MUST consume the same canonical application model.**
10. **AFS/MUXI SHOULD be supported through adapters, not adopted as SmartAIHub's internal canonical schema.**
11. **Skill-first discovery and progressive capability disclosure MUST be preserved.**
12. **Application lifecycle MUST include install, upgrade, rollback, uninstall, observability, and audit.**
13. **Persistent data lifecycle MUST be separated from runtime uninstall.**
14. **Adaptive behavior MUST not silently change privileged policy domains.**
15. **All application executions MUST remain attributable to app, release, deployment/materialization, tenant, principal, and runtime placement where applicable.**
16. **No package manager is the SPAAS agent standard; `pip`, `uv`, `pipx`, npm-family tools, native installers and OCI are distribution adapters only.**
17. **Agent runtime realization MUST use the canonical Materialization operations: `INSTALL`, `PROVISION`, `BIND`, or `ATTACH`.**
18. **Provider-specific adapters MUST negotiate actual capabilities and MUST NOT claim undocumented or unavailable control over managed agents.**
19. **Managed persistent bots and installable coding harnesses MUST share canonical task, permission, approval, audit, billing and artifact contracts while retaining different lifecycle semantics.**
20. **User-owned provider subscriptions/credentials MAY be bound only through supported authorization mechanisms; SmartAIHub MUST NOT scrape or exfiltrate consumer-session credentials.**

---

## 89. Recommended Next Implementation Work

The first implementation task should create the **SPAAS v1 canonical schema + validator + package digest + minimal registry objects**, followed immediately by Spec 224 integration so that newly generated Mini Apps stop being treated as loose source-code outputs and become versioned SmartAIHub application artifacts.

The next milestone should then prove one generated application deployed to two materially different targets, for example:

- Cloudflare Worker/Container deployment
- SmartAIHub Desktop/Runner deployment

while preserving the same application/release identity and deployment contract.

That proof should be treated as the architectural acceptance test for portability.


---

## 90. Conformance Profiles

To prevent the standard from becoming all-or-nothing, SPAAS defines conformance profiles.

### 90.1 `SPAAS-CORE`

Required for every SmartAIHub application:

- valid manifest
- stable application/version identity
- component graph
- dependency declaration
- secret declaration
- permission declaration
- runtime requirements
- package digest
- validation report

### 90.2 `SPAAS-DEPLOYABLE`

Adds:

- at least one satisfiable runtime placement
- deployment bindings
- health verification
- install lifecycle
- production-safe secret resolution

### 90.3 `SPAAS-UPGRADABLE`

Adds:

- semantic versioning
- migration contract
- compatibility metadata
- upgrade plan
- rollback declaration

### 90.4 `SPAAS-MARKETPLACE`

Adds:

- publisher identity
- license and distribution metadata
- marketplace metadata
- install-time entitlement/policy metadata
- security review requirements

### 90.5 `SPAAS-PORTABLE`

Adds proof that the same immutable application release can be resolved to more than one materially different runtime topology without rewriting application source or canonical manifest semantics.

### 90.6 `SPAAS-AGENT-PORTABLE`

Adds proof that an agent-capable application:

- declares capability requirements independently of one provider;
- can resolve through at least two materially different agent runtime classes or produces an explicit machine-readable reason why portability is impossible;
- supports at least one of `ATTACH`, `INSTALL`, `PROVISION`, or `BIND`;
- preserves canonical execution identity, approval, audit, budget and artifact contracts across the tested adapters;
- does not rely on arbitrary manifest-provided installation shell commands;
- truthfully exposes unsupported provider capabilities instead of emulating success.

### 90.7 `SPAAS-CHAT-FIRST`

Adds:

- conversation as a primary application control surface;
- durable background task references without blocking ongoing chat;
- artifact/approval/progress/error/recovery representations in the conversation experience;
- voice/multimodal declarations when enabled;
- deterministic mapping between conversation identity, task identity and execution identity.

### 90.8 `SPAAS-MULTIPLATFORM`

Adds:

- two or more platform targets from Web, Windows, macOS, Android, iOS, messaging/server/CLI;
- explicit technology stack and platform-sharing strategy;
- platform capability compatibility checks;
- design adaptation rules rather than assuming one layout fits all targets.

### 90.9 `SPAAS-HARNESS-PLUGIN`

Adds:

- host harness capability requirements;
- one canonical extension definition with provider-specific materializers/overrides;
- install/update/uninstall/reconcile semantics;
- no confusion between the extension package and the SmartAIHub harness adapter itself.

### 90.10 `SPAAS-SELF-HOSTABLE`

Adds:

- external/self-host deployment artifact contract;
- secret-free export;
- infrastructure/runtime prerequisites;
- license/entitlement policy appropriate to the declared offline/online enforcement mode;
- backup/export/upgrade ownership boundaries.

### 90.11 `SPAAS-PRIVACY-DECLARED`

Adds:

- structured personal-data inventory and purposes;
- egress/external-processor declaration;
- retention/residency rules;
- user export/delete/revoke rights;
- creator/support access policy;
- auditable sensitive-data access and permission prompts.

The platform MUST record which profile(s) each release satisfies.

---

## 91. CLI / Developer Tooling Contract

SmartAIHub SHOULD provide local and CI tooling for deterministic package operations.

Illustrative commands:

```text
sah app init
sah app validate
sah app inspect
sah app graph
sah app lock
sah app test
sah app package
sah app sign
sah app plan --env staging
sah app deploy --env staging
sah app diff <release-a> <release-b>
sah app export --format afs
sah app import --format afs
```

The CLI MUST use the same canonical parser and validator as the control plane. Local validation and server validation MUST NOT intentionally implement divergent schema semantics.

Machine-readable output SHOULD be available for CI/CD and external agents.

---

## 92. Release Diff Contract

Before upgrade, the platform MUST be able to compute a semantic diff between releases.

The diff SHOULD classify changes into:

- source/component change
- dependency change
- new/removed capability
- new/removed secret requirement
- permission increase/decrease
- network access increase/decrease
- runtime topology change
- data schema/migration change
- billing/metering change
- schedule/trigger change
- marketplace entitlement change
- compatibility change

Permission, secret, billing, data-migration, and network-expansion changes SHOULD be highlighted as review-sensitive.

A package MUST NOT conceal materially expanded permissions behind a patch update without surfacing the semantic diff.

---

## 93. Configuration Schema Contract

Applications MAY expose user/tenant configurable settings.

Configurable values MUST have a schema containing, where applicable:

- key
- type
- default
- required
- validation constraint
- sensitive flag
- restart/redeploy requirement
- tenant-overridable flag
- user-overridable flag
- description

Sensitive configuration MUST resolve through secret storage rather than ordinary config persistence.

Configuration schema changes MUST participate in release compatibility checks.

---

## 94. Canonical Serialization and Digest Rules

The implementation MUST define a deterministic canonical representation for hashing and signatures.

At minimum:

- path normalization
- manifest canonicalization
- newline normalization rules
- deterministic file ordering
- explicit exclusion rules for local temporary/build cache files
- symlink handling
- executable metadata handling where relevant

The same immutable package bytes/semantics MUST yield the same release digest across supported build environments.

Generated timestamps that are not part of application semantics SHOULD NOT invalidate reproducibility unless intentionally included in signed provenance.

---

## 95. Production Admission Gate

A release MUST NOT be marked production-admissible unless the platform has evidence for all required gates.

Minimum gate categories:

1. package integrity
2. schema conformance
3. dependency integrity
4. tests
5. permission/policy validation
6. secret safety
7. tenant isolation
8. runtime satisfiability
9. migration safety
10. health verification plan
11. observability minimums
12. billing/metering compatibility where applicable
13. required approvals
14. resource/quota satisfiability
15. event-delivery/idempotency safety for side-effecting consumers
16. desired-state reconciliation and drift policy
17. secret/signing-key revocation status
18. data-residency/retention compatibility
19. service-contract compatibility for required app dependencies
20. rollout/drain safety for stateful or externally exposed components
21. offline synchronization/conflict policy when mutable disconnected operation is supported
22. HA/multi-region ownership/fencing safety when requested
23. in-flight durable execution/state compatibility across the proposed upgrade
24. binding/configuration generation consistency and activation safety
25. runtime-adapter conformance for every selected production target
26. registry artifact reachability/retention for rollback and live durable work
27. ownership/publisher/tenant transfer validity when identity changed
28. AI data-to-model/provider egress compatibility
29. client/UI security baseline for public browser deployments
30. workload identity and east-west service authorization
31. dependency-graph satisfiability and lifecycle ordering
32. license/attribution/redistribution-rights policy where distribution applies
33. admission-evidence bundle integrity and waiver validity
34. external integration, ingress, domain, TLS, and route-binding safety where applicable
35. package-ingestion resource safety, archive extraction limits, and path/link containment
36. hermetic/reproducible-build evidence and nondeterminism classification for production artifacts
37. extension namespace ownership, schema/version resolution, and mandatory-extension support
38. control-plane/runtime/CLI/schema version-skew compatibility for the proposed rollout
39. time/clock semantics and skew tolerance for leases, TTLs, schedules, signatures, and replay windows
40. privacy purpose/consent/deletion-propagation compatibility, including derived data where applicable
41. AI capability/quality-floor and fallback-evaluation compatibility for required AI behaviors
42. emergency quarantine/revocation/kill-switch readiness and blast-radius policy
43. observability semantic-convention, trace propagation, sampling/redaction, and SLO evidence where required
44. authorization/entitlement revalidation for long-running or resumable work
45. external-dependency resilience including retry budgets, circuit breaking, bulkheads, and storm prevention
46. import/export round-trip fidelity and preservation of unknown safe optional semantics
47. authorized application-state export/restore compatibility where portability of mutable state is claimed
48. preview/ephemeral resource expiry, ownership, cleanup, and cost-containment policy where used

The admission verdict MUST be stored with evidence references and MUST be invalidated/re-evaluated when a material dependency, revocation state, runtime capability, data-location constraint, or policy context changes.

---

## 96. Implementation Guardrails

During implementation, the following shortcuts are explicitly prohibited:

1. Treating a Git repository as equivalent to a SPAAS release.
2. Storing production secrets in `app.manifest.yaml`, `.env` files inside exported packages, lock files, or provenance bundles.
3. Encoding Cloudflare Worker/Container identifiers as the application identity.
4. Allowing marketplace install code to bypass the normal deployment validator.
5. Giving Spec 224 private deployment semantics that cannot be used by other authoring paths.
6. Creating a second job-control system inside SPAAS rather than integrating with the shared durable job plane.
7. Silently dropping unsupported fields during AFS/MUXI import/export.
8. Declaring rollback support without validating migration reversibility and data compatibility.
9. Copying user or tenant memory into a portable package by default.
10. Allowing runtime failover to weaken trust, data-residency, or secret-locality guarantees.
11. Auto-promoting self-tuned security, billing, tenancy, or privileged runtime policy.
12. Coupling application package portability to a single LLM provider, model, operating system, or cloud vendor unless the app explicitly requires it.
13. Creating separate software-development/personal/business/workflow/Mini-App runtime stacks when templates over the common Agent Profile + Harness model are sufficient.
14. Treating LangGraph or OpenAI Agents SDK as a harness adapter when it is being used as an orchestration runtime, or allowing nested orchestrators to own competing retry/cancellation loops.
15. Treating marketplace listing, price, license, entitlement or domain name as immutable package identity.
16. Assuming custom domain implies public access, public implies free execution, or Marketplace publication implies SmartAIHub hosting.
17. Granting Marketplace creators, harnesses, MCP servers, A2A peers, communication providers or support operators broad end-user data access without explicit scoped policy.
18. Bundling production credentials or user-owned personal data into self-hosted/export artifacts.
19. Letting Spec 270/design tooling silently change the authoritative platform target or technology stack declared by Spec 261.

---

## 97A. Review-Hardening Requirements

The following sections were added after a 14-pass gap review. They are normative and are part of SPAAS v1.1 conformance, not optional commentary.

### 97A.1 Installation vs Deployment Contract

The control plane MUST persist Installation independently from Deployment. Installation owns tenant/user configuration intent, entitlement, channel/update policy, binding references, and data-retention intent. Deployment owns resolved runtime state. Deleting or replacing a deployment MUST NOT silently destroy the installation record or its retained data policy.

### 97A.2 Desired State, Reconciliation, Drift, and Concurrency

SPAAS deployment MUST be declarative. The control plane MUST distinguish:

- desired state
- observed state
- last successfully applied release/config generation
- reconciliation status
- drift status

Reconcilers MUST be idempotent. Competing reconciliation attempts MUST use generation checks, leases/fencing tokens, or an equivalent mechanism that prevents stale writers from committing state.

Drift MUST be classified at least as:

- expected/runtime-managed
- user/tenant authorized
- repairable unmanaged drift
- security/policy drift
- irreconcilable drift

Production security/policy drift MUST fail closed or isolate affected capability according to platform policy. Reconciliation MUST NOT repeatedly mutate external systems without idempotency keys or equivalent side-effect protection.

### 97A.3 Progressive Delivery, Traffic Switching, and Safe Drain

Externally served or stateful applications SHOULD support deployment strategies such as rolling, canary, blue/green, or replace-in-place according to runtime capability.

A release strategy MUST declare, where relevant:

- maximum unavailable capacity
- maximum surge
- canary percentage or cohort
- health/verification gates
- promotion criteria
- abort criteria
- traffic-switch mechanism
- session affinity requirements
- drain timeout
- rollback trigger

Stateful components MUST declare whether concurrent old/new revisions are safe. The platform MUST NOT perform dual-running rollout when schema, singleton, lock, queue-consumer, or external-side-effect semantics make it unsafe.

### 97A.4 Secret, Credential, and Signing-Key Lifecycle

Secret bindings MUST support lifecycle metadata, not only initial resolution. The platform MUST be able to represent:

- rotation
- expiry
- refresh
- revocation
- reauthorization required
- scope reduction
- principal/tenant ownership changes

Applications MUST consume secret references or short-lived material where feasible rather than assuming immutable credentials. Long-running work MUST define behavior when a credential expires or is revoked mid-run.

Package/release trust MUST support signer and key revocation. A previously valid signature MUST NOT be treated as permanently trusted after signer, key, certificate, publisher, or policy revocation. Trust re-evaluation MUST be possible without rebuilding the package.

### 97A.5 Resource Governance and Runtime Admission

Every executable component MUST be able to declare or inherit operational resource policy. Supported dimensions SHOULD include:

- CPU class/limit
- memory limit
- GPU/accelerator requirement
- disk/workspace limit
- maximum concurrency
- queue depth
- request/rate limit
- wall-clock timeout
- retry budget
- token/model budget
- network/egress budget where applicable

Runtime resolution MUST consider whether the target can satisfy hard limits. Resource exhaustion MUST produce a typed execution/deployment outcome and MUST NOT silently bypass tenant budget, security, or placement constraints.

### 97A.6 Event Delivery, Idempotency, Backpressure, and DLQ

Every event contract that can cross process/runtime boundaries MUST declare or inherit:

- schema/version
- delivery expectation (`best-effort`, `at-most-once`, `at-least-once`)
- ordering scope if required
- partition/key semantics if relevant
- maximum age/TTL if relevant
- retry policy
- idempotency/deduplication key semantics for side effects
- backpressure behavior
- dead-letter/quarantine behavior

SPAAS MUST NOT claim generic exactly-once delivery unless a specific transport and side-effect model proves it. Side-effecting consumers receiving at-least-once delivery MUST implement idempotency or transactional deduplication.

### 97A.7 Application Composition and Service Contracts

SPAAS MUST support applications consuming logical services provided by another application without hard-coding concrete deployment addresses.

A service contract SHOULD declare:

- logical service ID
- interface/schema version
- protocol
- required/optional status
- compatibility range
- authentication class
- tenant/data scope
- locality constraints
- timeout/retry policy

Resolution MUST occur through approved service discovery/binding. Required incompatible service contracts MUST block deployment or upgrade. Circular application dependencies MUST be rejected unless an explicit bootstrap and failure contract exists.

### 97A.8 Health, Readiness, Liveness, Startup, and Graceful Termination

Health checks MUST distinguish semantics when relevant:

- startup: initialization complete enough to evaluate readiness/liveness
- readiness: safe to receive new work/traffic
- liveness: process/runtime is making acceptable progress
- dependency health: critical external requirement state

A readiness probe MUST NOT be treated as proof that all downstream systems are globally healthy unless the contract explicitly requires that check.

Stateful/background components SHOULD support drain/quiesce behavior. Termination MUST define how new work is stopped, in-flight work is completed/checkpointed/requeued, leases are released/fenced, and duplicate resumption is prevented.

### 97A.9 Data Governance, Residency, Retention, Backup, and Restore

Data policy MUST be enforceable at deployment/runtime, not merely descriptive metadata. Where applicable, an application MUST declare:

- data classification
- allowed/required processing regions
- allowed/required storage regions
- cross-region transfer policy
- secret locality
- retention duration or external retention policy reference
- deletion semantics
- legal/tenant hold semantics
- export/portability requirements
- backup class
- restore expectations

Backup metadata SHOULD define target RPO/RTO where meaningful. Production admission for stateful critical applications SHOULD require a restore test or equivalent evidence, not merely existence of backup files. Upgrade/rollback MUST evaluate backup/restore compatibility across schema versions.

### 97A.10 Reproducible Build and Dependency Trust

Production release creation SHOULD be reproducible to the practical extent supported by the build ecosystem. Provenance MUST distinguish source identity, builder identity, build parameters, dependency resolution, and resulting artifact digest.

Dependency resolution MUST defend against namespace/dependency confusion by binding registry/source identity in addition to name/version. Production dependencies SHOULD use immutable digests and publisher/trust metadata where available.

The supply-chain model SHOULD remain compatible with standard attestation ecosystems such as SLSA/in-toto/Sigstore concepts without making any single vendor mandatory. Optional transparency-log references MAY be recorded.

A dependency that becomes revoked, malicious, or policy-denied MAY invalidate production admission even if its bytes and digest remain unchanged.

### 97A.11 Schema/API Evolution and Feature Negotiation

`apiVersion` parsing MUST use explicit feature support rather than assuming that a newer platform understands all fields. A manifest MAY declare required and optional platform features.

Example:

```yaml
compatibility:
  minimumPlatformVersion: "2026.9"
  requiredFeatures:
    - spaas.events.delivery-semantics/v1
    - spaas.runtime.reconciliation/v1
  optionalFeatures:
    - spaas.delivery.canary/v1
```

If a required feature is unsupported, validation MUST fail closed. Optional unsupported features MAY degrade only when the package declares a safe fallback.

Public service/API contracts SHOULD define versioning and deprecation windows. Breaking changes MUST require an explicit compatibility boundary and MUST be surfaced in release diff/admission. Unknown security-relevant semantics MUST never be silently ignored.

### 97A.12 Security Threat and Abuse Model

SPAAS validation/runtime policy MUST explicitly account for at least:

- SSRF and access to cloud/container metadata endpoints
- webhook forgery and replay
- dependency/namespace confusion
- malicious or poisoned Skills/MCP/A2A endpoints
- prompt/tool-induced privilege escalation
- secret exfiltration through logs, traces, model prompts, exports, or error payloads
- cross-tenant confused-deputy behavior
- unbounded compute/retry/queue amplification
- unsafe archive extraction/path traversal/symlink behavior
- sandbox breakout assumptions
- untrusted generated code and install/build hooks
- domain/custom-route takeover or stale binding

Inbound externally triggered actions SHOULD support authentication, timestamp/nonce or equivalent replay defense, and rate limiting according to risk. Outbound network policy MUST be able to block loopback, link-local, metadata, private network ranges, and other protected destinations unless explicitly authorized.

### 97A.13 Offline/Disconnected State Synchronization and Conflict Resolution

An application that permits mutable local/offline operation MUST declare synchronization semantics. At minimum it MUST identify:

- authoritative state owner for each mutable data class
- whether offline mode is read-only, append-only, or fully mutable
- synchronization direction
- logical revision/version token
- conflict detection rule
- conflict resolution policy
- delete/tombstone handling
- retry/idempotency behavior
- encryption and local retention policy
- behavior when the remote schema/release changed while offline

Blind last-write-wins based only on device wall-clock time SHOULD NOT be the default for business-critical state. Human review MAY be required for non-mergeable conflicts. Reconnection MUST NOT silently overwrite newer tenant/cloud state when causal order is unknown.

### 97A.14 High Availability, Multi-Region, Singleton Ownership, and Failover Safety

Portability MUST NOT be confused with automatic high availability. Applications that request HA or multi-region execution MUST declare availability and state-ownership requirements.

The contract SHOULD include:

- allowed regions
- active/active, active/passive, or single-owner mode
- state replication dependency
- consistency assumptions
- singleton/leader requirements
- fencing or lease-generation semantics
- failover trigger and recovery criteria
- acceptable duplicate-work behavior
- locality/secret constraints during failover
- target RTO/RPO where applicable

Active/active placement MUST be rejected for components whose external side effects, singleton semantics, database consistency model, or queue ownership cannot safely tolerate multiple concurrent owners. A failover MUST NOT activate a stale owner capable of committing work after ownership has moved.


---

## 97B. Fourteen-Pass Gap Review Record

The 2026-09-30 hardening review applied fourteen independent review lenses. Findings were incorporated directly into this version:

| Pass | Review lens | Gap found | Remediation in v1.1 |
|---|---|---|---|
| 1 | Core domain model | Installation conflated with deployment lifecycle | Added first-class Installation object and durable install semantics |
| 2 | Control-plane convergence | No explicit desired/observed state, drift, stale-writer rule | Added reconciliation, drift, generation/fencing/idempotency contract |
| 3 | Deployment safety | Rollout existed but lacked traffic/drain semantics | Added progressive delivery, promotion/abort and safe dual-run rules |
| 4 | Credential lifecycle | Secret binding covered creation, not rotation/revocation | Added rotation, refresh, expiry, mid-run behavior and signer revocation |
| 5 | Capacity/economics | Budget existed but executable resource limits were underspecified | Added CPU/memory/GPU/concurrency/timeout/queue/resource admission |
| 6 | Messaging semantics | Event schema existed but delivery/idempotency/backpressure did not | Added delivery guarantees, dedup, ordering, TTL and DLQ contract |
| 7 | Product composition | No strong app-to-app logical service dependency model | Added service contracts, discovery/binding and compatibility gates |
| 8 | Runtime operations | Health was generic; drain/termination semantics missing | Added startup/readiness/liveness/dependency health and graceful termination |
| 9 | Data governance/DR | Residency metadata existed but enforcement/restore proof weak | Added enforceable residency/retention/delete/export + RPO/RTO/restore evidence |
| 10 | Supply chain | Digest/SBOM existed but dependency-source trust/revocation weak | Added source identity, dependency-confusion defense, attestation/revocation semantics |
| 11 | Evolution/interoperability | Unknown-field handling existed but feature negotiation was incomplete | Added required/optional feature negotiation and API deprecation rules |
| 12 | Adversarial security | Generic security gates lacked explicit abuse/threat cases | Added SSRF, replay, exfiltration, confused-deputy, hook/archive and amplification controls |
| 13 | Offline/local-first continuity | Offline support lacked authoritative-state/conflict semantics | Added revisioned sync, conflict/delete policy, schema-change handling and safe reconnect rules |
| 14 | HA/multi-region execution | Failover existed but ownership/split-brain semantics were underspecified | Added availability mode, singleton fencing, stale-owner rejection and locality-safe failover |

A future implementation review MUST verify these requirements with executable evidence; textual presence in the manifest alone is insufficient.

---

## 97C. Second Review-Hardening Requirements

The following requirements were added by a second independent 12-pass gap review. They are normative for SPAAS v1.2 and close gaps that become material once applications are long-lived, stateful, multi-runtime, marketplace-distributed, and operated across upgrades.

### 97C.1 In-Flight Durable Execution and Release Pinning

Every durable execution instance MUST record enough immutable identity to determine exactly which application semantics created and own its state. At minimum, where applicable, record:

- application ID
- release digest
- workflow/agent/operation definition digest
- durable-state schema version
- installation ID
- deployment/config generation
- binding generation or equivalent resolved dependency snapshot
- lease/fencing generation when ownership is exclusive

An upgrade MUST define the handling policy for in-flight work. Supported policies MAY include:

- continue on the pinned old release until completion
- drain old release before promotion
- checkpoint and migrate durable state to the new release
- cancel and restart when explicitly safe
- require human/operator intervention

A new release MUST NOT resume durable state produced by an incompatible old definition merely because names or IDs match. State migration MUST be explicit, versioned, tested, and auditable.

Release/registry retention MUST keep any artifact required to resume, inspect, compensate, or audit still-live executions. Garbage collection MUST NOT remove a release solely because it is no longer the currently deployed version.

### 97C.2 Binding and Configuration Transactionality

Bindings and configuration are mutable installation/deployment state and MUST NOT mutate the immutable release artifact.

The control plane MUST represent a version/revision for the effective binding and configuration set. A change SHOULD follow:

`propose → resolve → validate → policy check → stage → atomically activate → verify`

A multi-binding change MUST NOT expose an unintended half-applied state to production components unless the application explicitly declares partial activation safe.

Each configurable/bindable field SHOULD declare whether change is:

- hot-reloadable
- component-restart required
- redeploy required
- migration required
- prohibited after installation

Rollback MUST identify whether it restores only the application release, only configuration/bindings, or both. Secret rotation/rebinding MUST be possible without manufacturing a new application release when application semantics are unchanged.

### 97C.3 Runtime Adapter Conformance and Semantic Parity

A runtime target MUST NOT claim SPAAS support based only on accepting the manifest format. SmartAIHub MUST maintain a versioned SPAAS conformance test kit with canonical fixtures and expected outcomes.

Each production runtime adapter SHOULD be tested for at least:

- manifest/schema interpretation
- capability resolution
- permission enforcement
- secret/binding handling
- event semantics
- lifecycle hooks
- health/readiness behavior
- cancellation/drain behavior
- durable execution identity
- observability correlation
- resource-limit enforcement
- tenant isolation

The same normative test vector SHOULD produce semantically equivalent outcomes across Cloudflare Workers, Containers/Sandbox, SmartAIHub Desktop/Runner, and future compatible runtimes, except where the manifest explicitly allows a capability-dependent degradation.

Runtime capability advertisements MUST be versioned and SHOULD be attestable/auditable. A runtime MUST NOT advertise a capability that its adapter cannot enforce to the required conformance level.

### 97C.4 Registry Retention, Reachability, and Garbage Collection

The application registry SHOULD use content-addressed immutable artifact storage where practical and MUST maintain logical references separately from artifact bytes.

Artifact deletion/garbage collection MUST account for reachability from at least:

- released versions
- installations
- active or rollback-eligible deployments
- in-flight durable executions
- retained audit/provenance records
- legal/tenant holds
- marketplace entitlements where artifact access must remain valid
- backup/restore references

Garbage collection SHOULD use a quarantine/grace phase before permanent deletion. Concurrent publish/install/rollback operations MUST NOT race with GC and lose a required artifact.

Deletion MUST leave a durable tombstone/audit record where needed to distinguish an intentionally removed artifact from an unknown or corrupted reference. Deduplication MUST preserve per-tenant authorization even when bytes are physically shared.

### 97C.5 Application, Publisher, and Tenant Ownership Transfer

SPAAS MUST distinguish artifact authorship/signing history from current administrative ownership.

Ownership or publisher transfer MUST be an explicit audited operation with authorization from the required principals/policies. A transfer MUST NOT rewrite historical provenance or pretend that an old signed release was signed by the new owner.

Transfer planning MUST evaluate:

- installation entitlements
- marketplace publisher identity
- tenant membership and RBAC
- secret ownership/rebinding
- billing/revenue-share destination
- custom domains
- storage/database ownership
- data-residency implications
- signing keys for future releases

Moving an installation between tenants MUST fail closed when a binding, secret, data store, policy, or domain is not transferable. Forking remains a derivation operation and MUST NOT be used as an implicit ownership-transfer shortcut.

### 97C.6 AI Data-to-Model Egress Governance

Data policy MUST govern not only where data is stored, but also where data may be sent for AI inference, embeddings, reranking, speech, image/video generation, or external agent execution.

A model/provider binding SHOULD expose policy-relevant properties such as:

- provider and account owner
- processing region or locality guarantees where available
- retention/logging policy class
- training-use policy class
- supported data classifications
- modality
- tenant/BYOK ownership
- network/trust boundary

The Runtime/Model Resolver MUST reject a model or provider whose egress properties conflict with application, tenant, user, contractual, or data-classification policy.

Failover from one model/provider to another MUST NOT silently weaken data-retention, training-use, locality, confidentiality, or tenant-isolation constraints. Prompt, attachment, tool result, memory, trace, and generated intermediate data MUST all be covered by the applicable egress policy.

### 97C.7 UI/Client Portability, Accessibility, and Browser Security

A UI component intended for general SmartAIHub distribution SHOULD declare supported form factors and localization capabilities. SmartAIHub-generated Mini Apps SHOULD be usable on desktop, tablet, and mobile unless the manifest explicitly states a justified device constraint.

UI/client requirements SHOULD include, where applicable:

- responsive layout capability
- keyboard navigation and accessible semantics
- accessibility target (for example WCAG 2.2 AA or a tenant-required profile)
- locale, timezone, number/date/currency formatting behavior
- deep-link/route compatibility
- offline/cache behavior when used
- supported browser/runtime baseline

Client-side code MUST NOT receive server secrets merely because the package contains both UI and backend components.

Web deployment policy MUST be able to enforce origin/CORS rules, Content Security Policy or equivalent controls, secure cookie/storage policy, and integrity/trust rules for externally loaded executable assets. Tenant/custom-domain aliases MUST NOT weaken these controls.

### 97C.8 Workload Identity and East-West Service Authorization

Each deployed executable component SHOULD have a workload identity distinct from human/user identity and from the application package signer.

Service-to-service calls SHOULD use short-lived, audience-scoped credentials or equivalent workload authorization rather than shared long-lived static secrets where supported.

The authorization context MUST preserve relevant tenant/installation identity across component boundaries and MUST prevent confused-deputy use in which a privileged component exercises authority for an unauthorized caller.

Where supported by the environment, workload identity MAY be backed by mTLS, signed workload tokens, platform-issued identity, or equivalent mechanisms. The manifest/service contract MUST describe required authorization semantics without forcing one vendor implementation.

### 97C.9 Dependency Graph Ordering, Cycles, and Failure Domains

The platform MUST be able to construct a dependency graph covering hard runtime/service/storage dependencies needed for deployment and operation.

Hard dependency cycles that make ordering or recovery unsatisfiable MUST fail validation. Optional/soft dependency cycles MAY be allowed only when degraded behavior is explicit and safe.

Components/services SHOULD declare, where relevant:

- hard vs optional dependency
- startup ordering constraint
- readiness dependency
- shutdown/drain ordering constraint
- retry/backoff behavior
- failure isolation expectation

Provisioning and teardown MUST use dependency-aware ordering. A partial deployment failure MUST identify which resources are safe to retain, compensate, retry, or destroy rather than applying an unconditional global rollback.

### 97C.10 License, Attribution, and Content/Model Rights

Marketplace-capable and redistributable SPAAS packages MUST carry sufficient rights metadata for bundled and material transitive content.

The rights model SHOULD cover, where applicable:

- source-code/package licenses
- third-party library licenses
- Skills/workflows/templates
- fonts, images, audio, video, and other assets
- model/weight redistribution constraints
- dataset/knowledge-content rights
- required attribution/notices
- commercial-use or field-of-use restrictions
- derivative/redistribution restrictions

License scanning MUST distinguish an unknown/unverified result from an affirmative permission to redistribute. Marketplace publication SHOULD fail closed for material content with unresolved redistribution rights according to platform policy.

A generated artifact's provenance SHOULD record source/licensing constraints that remain relevant to downstream redistribution; generation by AI MUST NOT be treated as automatically clearing third-party rights obligations.

### 97C.11 Admission Evidence Bundle, Exceptions, and Waiver Expiry

A production-admission decision MUST be reproducible from an immutable or tamper-evident evidence bundle.

The bundle SHOULD contain or reference:

- release digest
- validator/conformance versions
- test reports
- security/vulnerability/license results
- SBOM/provenance attestations
- migration/rollback evidence
- runtime capability evidence
- policy bundle/version
- approver identities where required
- admission timestamp and expiry/revalidation triggers

An exception/waiver MUST have:

- explicit scope
- owner/approver
- reason
- compensating control where applicable
- creation time
- expiry or mandatory review date

An expired waiver MUST NOT continue to authorize production admission silently. Material changes to release, dependency trust, policy, runtime capability, data policy, or waiver validity MUST trigger admission re-evaluation.

### 97C.12 External Integration and Ingress/Domain Lifecycle

External APIs, webhooks, SaaS services, public ingress, and custom domains are mutable dependencies and MUST have lifecycle semantics separate from immutable application source.

External integration contracts SHOULD declare:

- endpoint/service identity
- API/contract version where available
- authentication method
- timeout/retry/idempotency expectations
- health/compatibility check
- deprecation/sunset metadata when known
- data classification/egress policy
- failure/degraded-mode behavior

The platform SHOULD detect or surface material external contract drift rather than discovering it only through end-user failures.

Public ingress and custom-domain bindings MUST support:

- ownership/control verification
- tenant/application/deployment binding identity
- route collision prevention
- TLS/certificate state
- activation and rollback sequencing
- safe teardown
- stale-DNS/stale-route detection where feasible

A domain, callback URL, or webhook endpoint MUST NOT remain bound to a retired/reassigned deployment in a way that permits cross-tenant takeover or misdelivery.

---

## 97D. Second Twelve-Pass Gap Review Record

The second 2026-09-30 hardening review used twelve additional independent lenses. These are in addition to the earlier fourteen passes, for **26 cumulative review passes**.

| Pass | Review lens | Gap found | Remediation in v1.2 |
|---|---|---|---|
| 15 | Durable execution across upgrades | No explicit release/state pinning for in-flight jobs and workflow state | Added execution identity, state-version compatibility, drain/migrate/restart policy and retention requirements |
| 16 | Binding/config mutation | Release immutability was clear but binding/config activation could become partially applied | Added revisioned transactional activation, hot-reload/redeploy classification and binding rollback semantics |
| 17 | Cross-runtime portability proof | Profiles existed but no normative runtime-adapter conformance kit | Added shared conformance fixtures, semantic parity tests and audited runtime capability advertisement |
| 18 | Registry lifecycle | Registry storage existed but reachability/GC/race rules were undefined | Added content-addressing guidance, reachability roots, quarantine GC, tombstones and authorization-safe dedupe |
| 19 | Ownership lifecycle | Forking existed but ownership/publisher/tenant transfer semantics were missing | Added explicit audited transfer, provenance preservation and transferability checks |
| 20 | AI privacy/egress | Residency covered storage but model/provider inference egress could weaken policy | Added model egress properties, resolver enforcement and failover non-regression rules |
| 21 | Client/UI portability | UI contract lacked mobile/tablet, accessibility/localization and browser-security baseline | Added form-factor, accessibility, locale, CSP/CORS/origin and client-secret restrictions |
| 22 | East-west authorization | Permissions existed but workload-to-workload identity was underspecified | Added workload identity, audience-scoped service auth and confused-deputy prevention |
| 23 | Dependency lifecycle graph | Dependencies lacked hard/soft ordering, cycle and partial-failure semantics | Added graph validation, startup/shutdown ordering and compensation-aware failure handling |
| 24 | Distribution rights | License metadata existed but transitive content/model/media redistribution rights were weak | Added rights inventory, attribution and fail-closed marketplace rules for unresolved material rights |
| 25 | Admission governance | Gate stored evidence refs but exception/waiver lifetime and reproducibility were incomplete | Added tamper-evident evidence bundle, waiver scope/owner/expiry and revalidation triggers |
| 26 | External integration/ingress lifecycle | External API/domain drift and reassignment safety were not fully specified | Added contract drift, deprecation, domain ownership, TLS, route collision and stale-binding teardown rules |

All findings were incorporated into the normative requirements above. Future reviews SHOULD extend this record rather than silently changing the design rationale.

---

## 97E. Third Review-Hardening Requirements

The following requirements were added after a third fourteen-pass gap review. They are normative and are part of SPAAS v1.3 conformance. They extend, rather than replace, the v1.1 and v1.2 hardening requirements.

### 97E.1 Package Ingestion, Archive Safety, and Resource Bounds

Package parsing/extraction MUST occur within explicit resource and path-containment limits before package content is trusted. The ingestion contract MUST be able to bound at least:

- compressed and expanded bytes
- file count
- directory depth
- per-file size
- filename/path length
- compression ratio or equivalent decompression-bomb defense
- nested archive handling
- parser CPU/time budget

Archive extraction MUST prevent absolute-path writes, `..` traversal, device/special-file abuse, unsafe symlink/hardlink escape, and overwrite of files outside the extraction root. Production admission MUST reject packages whose safe extraction cannot be established.

Package limits SHOULD be policy-configurable by trust level and environment. A package that exceeds a limit MUST fail with a typed reason rather than partially extracting or silently truncating content.

### 97E.2 Hermetic Build, Toolchain Identity, Cache Trust, and Nondeterminism

Reproducibility requirements in 97A.10 MUST be implemented through an explicit build-input model. Production provenance MUST identify or bind, where relevant:

- source revision/digest
- builder implementation and version
- toolchain/runtime image digest or equivalent environment identity
- dependency sources and immutable dependency digests
- declared build parameters/features
- architecture/OS target when output differs by target
- locale/timezone assumptions that affect output
- permitted network access during build
- generated-code/schema/compiler versions
- cache provenance when remote/shared caches are used

Build steps SHOULD be hermetic where practical. Uncontrolled current time, locale, unordered filesystem iteration, network-fetched mutable inputs, random values, host-specific paths, and environment leakage MUST either be eliminated from semantic artifacts or recorded/classified as intentional nondeterminism.

A remote build cache MUST NOT be trusted solely by cache key. Restored cache artifacts MUST remain bound to expected content/source identity and MUST NOT bypass release hashing, policy, or provenance checks.

### 97E.3 Extension Namespace Registry, Ownership, Criticality, and Evolution

The namespaced extension mechanism in Section 58 MUST have governance semantics. Every extension consumed by production MUST resolve to an extension identity containing, directly or by registry reference:

- namespace
- schema/version
- owning publisher/authority
- compatibility range
- whether the extension is required, optional, advisory, or security-critical
- canonical schema or validation contract where machine validation is expected

Namespace ownership changes MUST be auditable and MUST NOT allow a new publisher to silently redefine previously trusted security semantics. Conflicting extension definitions for the same namespace/version MUST fail resolution.

Unknown required or security-critical extensions MUST fail closed. Unknown optional extensions MAY be preserved without execution only when the core manifest declares that omission is safe. Round-trip tooling MUST preserve such fields byte-for-byte or canonically-equivalently as defined by the extension contract.

### 97E.4 Platform/Runtime/CLI Version Skew and Rolling Compatibility

SPAAS compatibility MUST cover the distributed implementation, not only manifest schema. SmartAIHub MUST maintain a compatibility matrix for relevant combinations of:

- control-plane/API version
- manifest/schema version
- runtime adapter version
- worker/runner version
- CLI/SDK version
- protocol/event/service-contract version

A rolling platform upgrade MUST NOT intentionally create an unsupported combination for an admitted production deployment. Runtime capability advertisements MUST include versioned semantics sufficient for placement and reconciliation to reject incompatible nodes.

Where N/N-1 or other skew windows are supported, the exact window and degraded features MUST be documented/tested. A new control plane MUST NOT issue instructions that an older runtime can parse syntactically but interpret with materially different security, lifecycle, event, or data semantics.

### 97E.5 Time Semantics, Clock Skew, Scheduling, TTLs, and Leases

SPAAS MUST define time values unambiguously. Persistent instants SHOULD use UTC with explicit offsets/standards-compatible timestamps. Human schedules MAY carry a named timezone and daylight-saving behavior. Durations MUST NOT be inferred from locale-dependent strings.

Distributed safety mechanisms involving leases, fencing expiry, credential expiry, signed-request windows, webhook replay windows, TTLs, and scheduled activation MUST declare or inherit an accepted clock-skew budget. Durations inside one process SHOULD use monotonic time where available rather than wall clock.

A lease/fencing token MUST remain authoritative over wall-clock ordering when ownership changes. Offline clients MUST NOT use local wall-clock timestamps as the sole authority for conflict resolution. Tests MUST cover forward/backward clock jumps and timezone/DST boundaries for applications that depend on scheduling or expiry semantics.

### 97E.6 Privacy Purpose, Consent, Minimization, and Deletion Propagation

Data classification MUST be accompanied by lifecycle semantics where personal/sensitive data is handled. The application/policy model SHOULD support:

- purpose/use category
- required consent or other authorization basis where applicable
- minimum necessary fields/data classes
- retention trigger and retention duration/policy reference
- export/access semantics
- deletion/anonymization semantics
- derived-data lineage relevant to deletion

A deletion action MUST NOT be considered complete merely because the primary database row disappeared. Policy MUST address relevant derived/replicated forms such as embeddings, vector indexes, caches, search indexes, generated summaries, logs/traces, backup retention, local/offline copies, and authorized exports.

When immediate deletion from immutable backup/audit media is infeasible, the retention/restore policy MUST prevent deleted data from being silently resurrected into active service after restore. SmartAIHub SHOULD maintain deletion tombstones or equivalent suppression metadata where necessary for compliant recovery.

### 97E.7 AI Capability, Quality Floor, Evaluation Evidence, and Fallback Semantics

The model capability contract in Section 10 MUST distinguish syntactic compatibility from behavioral suitability. Applications MAY declare testable minimum AI properties such as:

- required modality/tool/structured-output support
- context/capacity floor
- language/domain requirements
- latency ceiling or class
- safety/policy requirements
- deterministic/tool-call constraints where needed
- quality tier or application-specific evaluation threshold

A fallback model/provider/runtime MUST NOT be selected when it violates a hard declared capability, policy, or quality floor. Quality-sensitive applications SHOULD ship or reference versioned evaluation fixtures/metrics sufficient to validate materially different model substitutions.

Evaluation results MUST record model/provider/configuration identity and evaluation version. A successful result for one model configuration MUST NOT be generalized automatically to a materially different model, prompt contract, tool set, or routing policy.

### 97E.8 Emergency Quarantine, Revocation Propagation, and Kill Switch

SmartAIHub MUST support scoped emergency containment independent of normal uninstall/delete flows. Policy-authorized operators MUST be able to quarantine or disable, as appropriate:

- a release digest
- publisher/signing identity
- dependency digest
- extension namespace/version
- capability/component
- installation/deployment
- tenant-scoped exposure

Emergency containment MUST be fail-safe, auditable, and scoped to minimize unintended blast radius. It SHOULD preserve evidence needed for incident response and MUST NOT require deleting the artifact to stop execution.

Revocation information that materially affects trust MUST propagate to admission/reconciliation/runtime authorization within a defined policy window. Break-glass actions MUST have explicit actor identity, reason, scope, expiry/review, and post-action audit requirements.

### 97E.9 Observability Semantics, Trace Propagation, Redaction, Sampling, and SLOs

Cross-runtime observability MUST use stable semantic identity fields at minimum for application, release, installation, deployment, tenant, job/execution, component, and trace/correlation context where applicable. Protocol boundaries such as MCP, A2A, external agents, queues, workflows, and local runners SHOULD propagate standard trace context or an explicit mapping.

Logs/traces/metrics MUST follow field-level redaction policy before export to less-trusted sinks. Sampling MUST NOT remove mandatory security/audit records or make billing/accounting correctness depend on sampled telemetry.

Production applications SHOULD be able to declare service-level indicators/objectives or platform profiles for availability/latency/error rate when operational policy requires them. Rollout/admission MAY consume these SLOs as promotion/abort evidence. Clock/skew limitations MUST be considered when reconstructing causality across distributed traces.

### 97E.10 Long-Running Authorization, Entitlement, and Approval Revalidation

Authorization is not permanently valid merely because a durable job was authorized at creation time. Long-running/resumable executions MUST preserve the authorization context required to determine whether protected future side effects remain permitted.

The execution policy MUST define revalidation checkpoints for relevant changes such as:

- user/tenant membership removal
- role/permission reduction
- approval expiry/revocation
- marketplace entitlement loss
- budget exhaustion
- credential revocation
- policy or legal-hold changes
- ownership transfer

Already committed side effects MUST remain distinguishable from future planned side effects so revalidation does not cause unsafe replay or duplicate compensation. A resumed execution MUST NOT inherit broader authority merely because an older execution snapshot contained it.

### 97E.11 External Dependency Resilience, Retry Budgets, Circuit Breaking, and Bulkheads

Timeout/retry semantics MUST include protection against synchronized or unbounded retry amplification. External service and provider integrations SHOULD support, according to risk:

- bounded retry count/time budget
- exponential backoff with jitter or equivalent de-synchronization
- circuit breaking
- concurrency/bulkhead isolation
- per-tenant/application rate limits
- fallback/degraded-mode policy
- health recovery/probe behavior

Fallback MUST continue to obey trust, data-egress, secret-locality, capability, quality, and billing policy. Circuit-breaker state MUST NOT become a hidden cross-tenant side channel or allow one tenant's failures to starve unrelated tenants where isolation is expected.

A retryable error from a downstream provider MUST NOT automatically imply that the entire durable workflow is safe to retry; side-effect/idempotency semantics remain authoritative.

### 97E.12 Native Import/Export Round-Trip Fidelity

Native SPAAS import/export MUST have an explicit round-trip fidelity contract. For a package that uses only supported semantics:

`import(export(package))`

MUST preserve canonical application semantics, stable identity, provenance/rights metadata, dependency/extension declarations, and unknown safe optional fields/extensions that tooling is required to preserve. Secret material MUST remain excluded.

A lossy conversion MUST emit a machine-readable compatibility/loss report and MUST NOT be represented as a fully equivalent export. Canonical reserialization MAY change formatting when the canonical digest rules define semantic equivalence; tools MUST distinguish formatting-only change from semantic change.

### 97E.13 Stateful Portability and Authorized State Export Contract

Application package portability and mutable application-state portability are separate claims. When an installation supports state export/migration, SmartAIHub MUST treat the state export as an authorized, tenant-scoped artifact/process rather than embedding production state in the application release.

A state export SHOULD identify:

- source application/release/schema identity
- installation/tenant scope
- included data classes
- excluded/externally referenced data
- export format/schema version
- encryption/integrity metadata
- secret redaction/reference behavior
- retention/expiry
- restore compatibility requirements
- provenance/audit actor

Restore MUST verify destination tenant/authorization and application/schema compatibility before activation. Cross-tenant restore MUST fail closed unless an explicit authorized transfer workflow exists. Large data movement SHOULD support resumable/checksummed transfer without weakening data-residency policy.

### 97E.14 Preview/Ephemeral Resource Ownership, Expiry, and Cleanup

Preview/ephemeral deployments MUST have explicit ownership and lease/expiry semantics. Resources created for previews SHOULD be tagged or otherwise bound to application, preview/deployment identity, tenant/owner, creation time, and expiry policy.

Automatic cleanup MUST distinguish disposable resources from retained/shared/external resources. Expiry SHOULD revoke temporary credentials/routes and stop billable compute before or together with destructive cleanup, subject to dependency ordering.

Failed cleanup MUST surface as a typed operational issue and remain retryable/reconcilable. The platform SHOULD provide orphan detection for preview-created domains, containers, queues, databases/schemas, buckets, credentials, and other billable resources. Extending a preview lifetime MUST be explicit and auditable.

---

## 97F. Third Fourteen-Pass Gap Review Record

The 2026-10-01 review applied fourteen additional independent lenses after the earlier twenty-six passes, for **40 cumulative review passes**.

| Pass | Review lens | Gap found | Remediation in v1.3 |
|---|---|---|---|
| 27 | Package ingestion safety | Canonical archive rules did not bound decompression/file-count/parser resource abuse | Added extraction containment, archive limits and typed rejection requirements |
| 28 | Build determinism | Reproducible-build language lacked hermetic toolchain/cache/nondeterminism contract | Added build-input identity, hermetic guidance, cache trust and nondeterminism classification |
| 29 | Extension governance | Namespaced extensions existed without ownership/criticality/schema-resolution governance | Added extension identity, namespace ownership, conflict handling and fail-closed mandatory semantics |
| 30 | Distributed version skew | Manifest compatibility did not fully cover mixed control-plane/runtime/CLI rollout | Added explicit compatibility matrix, runtime capability versions and rolling-skew safety |
| 31 | Time semantics | Lease/TTL/replay/scheduling correctness under skew/DST was underspecified | Added UTC/timezone/monotonic-clock/skew requirements and tests |
| 32 | Privacy lifecycle | Classification/retention did not fully define purpose, minimization and deletion of derived copies | Added privacy purpose metadata and deletion propagation/restore suppression semantics |
| 33 | AI behavioral portability | Model fallback could satisfy API features while silently degrading required behavior | Added hard capability/quality floors and versioned evaluation evidence |
| 34 | Incident containment | Revocation existed but scoped emergency runtime quarantine/kill switch was incomplete | Added scoped quarantine, revocation propagation and break-glass audit contract |
| 35 | Observability semantics | Trace propagation existed but common identity/redaction/sampling/SLO semantics were weak | Added semantic fields, protocol propagation, redaction/sampling rules and SLO integration |
| 36 | Durable authorization | Long-running work could outlive membership/approval/entitlement authority | Added revalidation checkpoints and committed-vs-future side-effect distinction |
| 37 | Dependency resilience | Retry/timeout contracts lacked retry-storm, circuit-breaker and bulkhead requirements | Added bounded retry budgets, jitter, circuit breaking, isolation and policy-safe fallback |
| 38 | Round-trip portability | Export/import preserved provenance but lacked normative lossless native round-trip rules | Added fidelity contract and machine-readable lossy-conversion report |
| 39 | Stateful portability | Code/package portability was clearer than authorized mutable-state migration semantics | Added separate state-export artifact/process with tenant, schema, integrity and restore checks |
| 40 | Ephemeral lifecycle | Preview expiry existed without complete resource ownership/orphan/cost cleanup semantics | Added leases, resource tagging, cleanup ordering, orphan detection and auditability |

All findings were incorporated into normative requirements, production admission, acceptance criteria, failure scenarios, and the Definition of Done. Future reviews SHOULD append a new review record rather than overwriting prior rationale.

---

## 97G. Agent Runtime Materialization & Provider Interoperability Requirements — v1.4

The following requirements are normative for SPAAS v1.4 agent-capable applications and adapters.

### 97G.1 Three adapter planes

SmartAIHub MUST separate three integration concerns:

1. **Distribution Adapter** — how a runtime/tool is acquired, verified, isolated, upgraded and removed.
2. **Runtime Adapter** — how SmartAIHub invokes, resumes, cancels, observes and exchanges artifacts with an execution runtime/harness.
3. **Managed Agent Adapter** — how SmartAIHub binds to a provider-owned persistent agent whose runtime lifecycle is not owned by SmartAIHub.

One provider MAY implement more than one plane, but the contracts MUST remain logically separable.

The application package MUST NOT become dependent on distribution-specific commands when a capability declaration is sufficient.

### 97G.2 Materialization plan

Before applying any runtime-side changes, the resolver MUST create a machine-readable Materialization Plan containing at least:

```yaml
materializationPlan:
  id: matplan_<uuid>
  installationId: inst_<uuid>
  releaseDigest: sha256:...
  generation: 7
  components:
    - componentId: coding-worker
      operation: ATTACH|INSTALL|PROVISION|BIND
      adapter:
        id: codex|claude-code|hermes|smartaihub-native|provider-specific
        version: <adapter-version>
      target:
        class: installable-harness|managed-persistent-agent|remote-agent-api|sandbox|native
        environmentId: <optional>
      capabilities:
        required: [...]
        discovered: [...]
      auth:
        mode: oauth|api-key|subscription|workload-identity|none|user-handoff
        bindingRef: <secret-or-auth-binding-ref>
      ownership:
        runtime: smartaihub|user|tenant|provider
        data: <policy-ref>
      lifecycle:
        teardown: uninstall|deprovision|unbind|detach
```

The plan MUST be reviewable before privileged or destructive operations when policy requires approval.

### 97G.3 Adapter capability descriptor

Each adapter release MUST expose a signed/versioned descriptor or equivalent trusted metadata with at least:

- adapter ID and version
- runtime/provider identity
- supported operating systems / execution surfaces
- supported materialization operations
- supported auth modes
- supported invocation protocols
- supported capabilities
- lifecycle operations
- state/continuation semantics
- artifact exchange semantics
- approval semantics
- background execution semantics
- scheduling semantics
- cancellation semantics
- resume/reconnect semantics
- health/readiness semantics
- minimum/maximum compatible SPAAS/control-plane versions
- known unsupported semantics

Static descriptor claims SHOULD be verified by live discovery when possible.

### 97G.4 Capability negotiation

The platform MUST compute a capability match result rather than using provider name alone.

Minimum capability dimensions SHOULD include:

- `chat.interactive`
- `task.background`
- `task.long_running`
- `task.resume`
- `task.cancel`
- `task.schedule`
- `task.subagents`
- `approval.callback`
- `browser.use`
- `computer.use`
- `shell.execute`
- `filesystem.read`
- `filesystem.write`
- `repo.read`
- `repo.write`
- `git.diff`
- `test.execute`
- `mcp.client`
- `mcp.server`
- `a2a.client`
- `a2a.server`
- `skills.native`
- `skills.adapter`
- `artifact.read`
- `artifact.write`
- `artifact.patch`
- `memory.provider_persistent`
- `memory.smartaihub_persistent`
- `events.webhook`
- `events.stream`
- `notifications.provider`

A required capability absent at runtime MUST cause deterministic rejection or approved fallback; it MUST NOT be silently ignored.

### 97G.5 Integration level truthfulness

Managed Agent Adapters MUST declare one of the following or an equivalent explicit integration level:

```text
FULL_CONTROL_API
LIMITED_CONTROL_API
PROTOCOL_BINDING
CONNECTOR_OR_TOOL_ACCESS
STATUS_ONLY
USER_MEDIATED_HANDOFF
UNAVAILABLE
```

If the provider does not expose a stable supported API/protocol for an operation, SmartAIHub MUST NOT simulate success via UI scraping or undocumented private endpoints unless a separate Computer Use policy explicitly allows that behavior and the user has authorized it. Such computer-use automation MUST still be reported as computer-use automation, not as a native provider API integration.

### 97G.6 Canonical execution handle

Every external-agent execution MUST map to a canonical SmartAIHub execution handle:

```yaml
executionHandle:
  taskId: task_<uuid>
  runId: run_<uuid>
  appId: app_<uuid>
  releaseId: rel_<uuid>
  installationId: inst_<uuid>
  materializationId: mat_<uuid>
  tenantId: tenant_<uuid>
  principalId: user_or_service_<uuid>
  providerAdapterId: <adapter-id>
  externalAgentId: <optional-provider-id>
  externalRunId: <optional-provider-run-id>
  state: queued|running|waiting_approval|waiting_user|completed|failed|cancelled|unknown
  budgetRef: <policy-ref>
  approvalRef: <optional>
  traceRef: <trace-id>
```

Provider status MUST be translated into canonical typed states without discarding provider-specific detail. Unknown/disconnected state MUST remain explicit rather than being coerced into success or failure.

### 97G.7 Session and conversation continuation

Adapters SHOULD map provider conversation/session/thread identifiers to SmartAIHub continuation references where supported.

SmartAIHub MUST distinguish:

- canonical Chat conversation identity
- canonical Task/Run identity
- provider session/thread identity
- provider persistent agent identity

No provider identifier becomes the canonical SmartAIHub identity.

When a provider cannot resume a prior session, the adapter MUST declare that limitation and MAY reconstruct context only under explicit context-transfer policy.

### 97G.8 Provider memory boundary

Provider-owned memory is not automatically portable SmartAIHub memory.

The adapter MUST classify provider memory as one or more of:

- unavailable
- session-only
- provider-persistent
- exportable
- selectively exportable
- non-exportable

Copying provider memory into SmartAIHub Personal/Project/Team/Tenant memory requires explicit scope, consent/authorization, provenance, retention and deletion semantics.

### 97G.9 User-owned accounts, subscriptions and BYOK

SPAAS/SmartAIHub MAY support user-owned provider accounts, API keys, OAuth grants, workspace identities or subscription entitlements where the provider officially permits such use.

The platform MUST NOT:

- scrape browser cookies or consumer application session tokens for headless reuse;
- extract credentials from another provider application without supported authorization;
- represent a consumer subscription as API entitlement when the provider does not permit it;
- bypass provider rate, concurrency, geographic or account restrictions.

Credential bindings MUST be revocable, scope-limited and attributable to the owning principal/tenant.

### 97G.10 Distribution safety

Distribution Adapter operations MUST use typed parameters. Application manifests MUST NOT contain privileged opaque shell installation strings as the primary installation mechanism.

For Python CLI tools, isolated tool environments such as `uv tool` or `pipx` SHOULD be preferred when compatible with the provider's official packaging. Plain `pip` MAY be used inside a controlled virtual environment or provider-owned environment. Global system Python mutation SHOULD be prohibited on managed runners.

For Node tools, adapter-managed npm/pnpm/bun execution SHOULD use a dedicated prefix/store/environment where practical. Lifecycle scripts MUST follow trust policy.

For native binaries/installers, signature/publisher verification SHOULD be required when the platform can verify it.

For OCI artifacts, immutable digest pinning SHOULD be preferred for production.

### 97G.11 Existing runtime detection and ATTACH

Before installing a compatible local harness, an adapter SHOULD detect an existing usable installation when policy permits.

Detection MUST be non-destructive and SHOULD capture:

- executable path or endpoint
- version
- ownership
- installation source if known
- capability snapshot
- auth state category without exposing credentials
- update ownership

`ATTACH` MUST NOT silently take over update/uninstall ownership of user-installed software.

### 97G.12 INSTALL ownership

When SmartAIHub performs `INSTALL`, it MUST record:

- acquisition source
- requested and resolved version
- package/binary/image digest when available
- installer adapter version
- installation root/environment
- created files/resources where practical
- post-install capability snapshot
- uninstall/cleanup contract

Shared global host mutation SHOULD be avoided. Per-tool isolation, sandboxing, containerization or user-scoped install roots SHOULD be preferred.

### 97G.13 PROVISION ownership

`PROVISION` creates runtime infrastructure or provider resources owned or lifecycle-managed by SmartAIHub/tenant according to policy.

Provisioned resources MUST be tagged/bound to installation/materialization identity and include expiry/cost/cleanup semantics where applicable.

### 97G.14 BIND ownership

`BIND` connects to a provider-owned managed agent or service. Unless explicit destructive authority exists, SmartAIHub owns the **binding**, not the external agent runtime.

Uninstalling/retiring a SPAAS application MUST default to unbinding and revoking SmartAIHub authorization, not deleting the provider-owned agent.

### 97G.15 Provider drift and capability change

Provider capabilities can change without a SPAAS application release changing. Therefore Materialization reconciliation MUST re-evaluate at least when:

- adapter version changes
- provider API/protocol version changes
- authentication/entitlement changes
- provider capability discovery changes
- runtime version changes
- relevant platform/tenant policy changes

A capability loss affecting a hard requirement MUST place the materialization into a typed degraded/blocked state and prevent unsafe new work.

### 97G.16 Provider adapter updates

Adapter updates MUST be independently versioned from SPAAS application releases.

The platform MUST support:

- adapter pinning where required
- staged adapter rollout
- rollback to a known-compatible adapter when safe
- conformance testing before broad promotion
- capability diffing between adapter versions

An adapter update MUST NOT silently reinterpret an application's security-critical requirement.

### 97G.17 Provider-specific native features

SPAAS MAY expose provider-native features through namespaced optional extensions, for example:

```yaml
extensions:
  provider.example/subagents:
    optional: true
    config: {}
```

A provider-native extension MUST NOT be required for `SPAAS-PORTABLE` or `SPAAS-AGENT-PORTABLE` conformance unless an equivalent portable fallback exists or the loss of portability is explicitly declared.

### 97G.18 Skill-first and MCP/A2A layering

Skills SHOULD remain above provider-specific agent runtimes whenever possible.

Preferred layering:

```text
SPAAS Application
      ↓
Skill / Capability Requirement
      ↓
Capability Resolver
      ├─ Native SmartAIHub capability
      ├─ MCP
      ├─ A2A
      ├─ Runtime Adapter
      └─ Managed Agent Adapter
```

A SmartAIHub Skill MAY compile/project into a provider-native skill/plugin representation, but the provider-native representation MUST NOT become the sole source of truth unless the application explicitly opts into provider lock-in.

### 97G.19 Task Control and Chat authority

SmartAIHub Chat remains the universal conversational command surface and Task Control remains the durable work/status authority where those platform contracts apply.

External agent/provider UIs MAY remain usable, but SmartAIHub MUST avoid creating a second contradictory task state. Provider state is projected into the canonical task/execution model with source/provenance metadata.

### 97G.20 Selection policy

Runtime selection MUST be based on declared requirements and policy, including:

- capability fit
- authorization
- trust/security
- data locality
- secret locality
- cost/budget
- latency
- availability
- user/tenant preference
- existing runtime reuse
- provider entitlement/quota
- required background/resume semantics
- output/artifact compatibility

The platform SHOULD prefer reuse (`ATTACH`) over redundant installation when the existing runtime is trusted and compatible, but security or reproducibility policy MAY require a fresh isolated `INSTALL` or `PROVISION`.

### 97G.21 Multi-agent and bot teams

A SPAAS application MAY declare multiple logical agent roles without assuming they are separate physical machines or provider bots.

The Runtime Resolver MAY map roles to:

- one runtime using subagents/background workers;
- multiple local runtimes;
- multiple managed agents;
- mixed local/cloud/managed placements.

Logical role identity, task ownership and permissions MUST remain independent from physical/provider placement.

### 97G.22 Decommissioning and orphan prevention

Retirement MUST reconcile all Materializations and classify every external resource as one of:

- deleted/uninstalled
- deprovisioned
- unbound
- detached
- retained by explicit policy
- cleanup failed / orphan candidate

Cleanup failures MUST remain visible and retryable. A successful application retirement MUST NOT be reported while known billable or privileged SmartAIHub-owned resources remain orphaned without an explicit retained-resource policy.

---

## 97H. Adapter Interface — Minimum Normative Operations

An adapter MAY implement these operations through local process control, RPC, HTTP API, SDK, MCP/A2A, provider API, cloud control plane, desktop bridge, or another supported mechanism.

Minimum conceptual interface:

```text
DescribeAdapter()
Discover(targetContext)
Inspect(candidate)
PlanMaterialization(requirements, policy, candidate)
Materialize(plan)        // INSTALL | PROVISION | BIND | ATTACH
Configure(materialization, configRefs)
Authorize(materialization, authBindingRefs)
CheckHealth(materialization)
Invoke(executionRequest)
Observe(executionHandle)
StreamEvents(executionHandle)          // optional capability
RequestApproval(executionHandle)       // optional/provider mapped
Resume(executionHandle)                // optional capability
Cancel(executionHandle)                // optional capability
CollectArtifacts(executionHandle)
Reconcile(materialization)
Upgrade(materialization, target)
Rollback(materialization, target)      // when supported
Retire(materialization)
```

Unsupported operations MUST return typed capability errors, not generic success.

### 97H.1 Stable reason codes

At minimum the adapter/resolver SHOULD distinguish:

```text
ADAPTER_NOT_AVAILABLE
ADAPTER_VERSION_INCOMPATIBLE
RUNTIME_NOT_FOUND
RUNTIME_VERSION_INCOMPATIBLE
CAPABILITY_MISSING
QUALITY_FLOOR_UNMET
AUTH_REQUIRED
AUTH_EXPIRED
ENTITLEMENT_REQUIRED
PROVIDER_QUOTA_EXHAUSTED
PROVIDER_UNAVAILABLE
PROVIDER_OPERATION_UNSUPPORTED
USER_HANDOFF_REQUIRED
INSTALL_BLOCKED_BY_POLICY
INSTALL_INTEGRITY_FAILED
INSTALL_REQUIRES_APPROVAL
PROVISION_FAILED
BIND_NOT_SUPPORTED
ATTACH_NOT_ALLOWED
SECRET_LOCALITY_CONFLICT
DATA_LOCALITY_CONFLICT
BUDGET_EXCEEDED
PERMISSION_DENIED
EXTERNAL_STATE_UNKNOWN
EXTERNAL_RESOURCE_ORPHANED
```

### 97H.2 Provider-specific outcome preservation

Canonical reason codes MAY carry provider-specific diagnostic fields, but user-visible and machine-actionable behavior MUST not depend on parsing free-form vendor error strings.

---

## 97I. Informative Provider Baseline — Verified 2026-10-01

This section is informative and MUST NOT be used as a permanent capability claim. Live adapter discovery and current provider documentation remain authoritative.

As of 2026-10-01, representative ecosystem classes include:

- **OpenAI Codex / Agents API** — coding/agent harness and managed cloud-agent execution surfaces; suitable for Runtime Adapter and remote-agent API integration where officially supported.
- **Claude Code / Claude Agent SDK / Claude managed-agent surfaces** — installable/programmable agent surfaces; suitable for Runtime Adapter integration according to current supported interfaces.
- **Hermes Agent** — installable desktop/CLI/cloud-capable agent ecosystem; suitable for Runtime Adapter integration and provider/model plugins according to the available installation/runtime interfaces.
- **OpenAI Dots** — persistent always-on managed agents with provider-owned cloud computers; conceptually a Managed Agent Adapter target when supported programmatic integration exists.
- **Grok Bot** — provider-owned always-on bot/computer model; conceptually a Managed Agent Adapter target when supported programmatic integration exists.
- **Meta Muse** — persistent personal agent with a provider-managed secure VM/browser and connectors; conceptually a Managed Agent Adapter target when supported programmatic integration exists.

The presence of a public product does not imply the existence of a public automation API. SmartAIHub MUST separately discover whether each provider exposes supported API, protocol, connector, webhook, MCP/A2A, desktop bridge, or only user-mediated interaction.

Reference baseline used for this revision:

- OpenAI ChatGPT release notes / Dots: `https://help.openai.com/en/articles/6825453-chatgpt-release-notes`
- OpenAI Agents API: `https://openai.com/index/introducing-the-agents-api/`
- Anthropic Claude Platform documentation: `https://docs.anthropic.com/`
- Hermes Agent repository/documentation: `https://github.com/NousResearch/hermes-agent`
- xAI Grok Bot: `https://x.ai/news/introducing-grok-bot`
- Meta Muse: `https://ai.meta.com/muse/`

---

## 97J. Fourth Twelve-Pass Gap Review Record

The 2026-10-01 fourth review applied twelve additional independent lenses after the prior forty passes, for **52 cumulative review passes**.

| Pass | Review lens | Gap found | Remediation in v1.4 |
|---|---|---|---|
| 41 | Agent standard boundary | Package-manager mechanisms could be mistaken for the canonical agent standard | Made SPAAS capability/application contract canonical and package managers adapter-only |
| 42 | Materialization semantics | Install/deploy terminology did not correctly model provider-owned bots or existing runtimes | Added `INSTALL`, `PROVISION`, `BIND`, `ATTACH` and Materialization object |
| 43 | Distribution isolation | Global `pip`/npm-style installs could create dependency collisions and host mutation | Added isolated tool/runtime guidance, typed install adapters and integrity policy |
| 44 | Managed-agent truthfulness | A managed bot could be represented as controllable even without a supported API | Added integration levels, explicit handoff/status-only states and no fabricated control |
| 45 | Capability negotiation | Provider names could substitute for machine-readable feature compatibility | Added adapter descriptors, granular capability matrix and hard missing-capability rejection |
| 46 | User-owned subscriptions | BYOK/account/subscription use lacked explicit credential boundary | Added supported-auth-only rule, no cookie/session scraping, revocable principal-scoped bindings |
| 47 | Execution continuation | Provider sessions/threads could become an alternate task authority | Added canonical execution handles and separate SmartAIHub/provider identities |
| 48 | Runtime/provider drift | Provider capability changes could invalidate a materialization without app release changes | Added drift triggers, re-discovery and degraded/blocked reconciliation semantics |
| 49 | Adapter lifecycle | Adapter updates could silently change app meaning or permissions | Added independent adapter versioning, staged rollout, diffing, rollback and conformance gates |
| 50 | Skills/protocol layering | Provider-native plugins could fragment SmartAIHub Skill-first design | Made Skills/capabilities canonical with MCP/A2A/runtime adapters beneath them |
| 51 | Ownership/retirement | BIND/ATTACH teardown could accidentally delete provider/user-owned runtimes | Added ownership-aware unbind/detach defaults and orphan prevention |
| 52 | Cross-provider portability proof | Existing portability profile did not explicitly verify external agent semantics | Added `SPAAS-AGENT-PORTABLE` profile and adapter conformance requirements |

All findings are incorporated into normative object definitions, lifecycle semantics, runtime resolution, distribution safety, conformance profiles, implementation phases and the Definition of Done.

---

## 97K. Application Experience, Platform Target & Technology Stack Contract — v1.5

### 97K.1 Application experience is independent from platform target

SPAAS MUST model at least the following experience archetypes:

- `traditional_ui`
- `chat_first`
- `dashboard`
- `workspace`
- `workflow`
- `headless`
- `hybrid`

A package MAY expose multiple surfaces and MUST declare a `primarySurface` when more than one is user-facing.

A `chat_first` experience is not a synonym for a chatbot. It is an application shell in which conversation can start durable work, invoke capabilities, request approval, schedule future work, receive background progress, produce artifacts and continue while other tasks run.

A `hybrid` application MAY combine chat with maps, dashboards, timelines, editors, data grids, media workspaces or other specialized surfaces.

### 97K.2 Platform targets

SPAAS MUST support explicit target declarations for at least:

- `web`
- `windows-x64` / `windows-arm64` where supported
- `macos-arm64` / `macos-x64` where supported
- `android`
- `ios`
- `server`
- `cli`
- `messaging-channel`
- `multi-platform`

A platform target MUST NOT be inferred from an application label such as Mini App, Business App or Agent App.

### 97K.3 Technology stack contract

A deployable target MUST declare enough of the following to make implementation and verification deterministic:

- primary language(s)
- frontend framework/meta-framework where applicable
- backend/runtime language and runtime
- desktop framework/native language where applicable
- mobile framework/native language where applicable
- package manager/build system
- minimum/compatible runtime versions
- database/storage expectations when material
- native dependencies and OS constraints
- build/test entry points
- artifact/output type

SmartAIHub MAY provide default stack profiles, but SPAAS MUST remain capable of describing TypeScript/JavaScript, Python, Rust, Go, Java/Kotlin, Swift, Dart/Flutter, .NET and future stacks without redefining the standard.

### 97K.4 Multi-platform sharing strategy

Multi-platform packages MUST declare one of, or an extensible equivalent to:

- `single_codebase`
- `shared_core`
- `web_plus_wrapper`
- `platform_specific`
- `service_only`

The manifest SHOULD identify shared modules and platform-specific roots. Spec 224 MUST consume this contract before implementation and MUST NOT silently choose a materially different stack or sharing strategy.

### 97K.5 Platform capability compatibility

Before build/deploy, SmartAIHub MUST validate required capabilities against target-platform constraints such as filesystem access, background execution, local model access, camera/microphone, notifications, system tray, app-store packaging, offline support, local network access and secure storage.

Unsupported hard requirements MUST block deployment with a typed explanation. Degraded/alternative behavior MUST be explicit rather than silently omitted.

---

## 97L. Agent Profile, Harness, Orchestration & Harness Extension Contract — v1.5

### 97L.1 Agent Profile

An Agent Profile is a durable product/configuration object that MAY include:

- identity/name/avatar/description
- instructions/role/behavior constraints
- skills and capability references
- MCP/tool/app access
- memory/knowledge scope
- project/team/tenant context
- permissions and secrets references
- schedules/triggers/autonomy policy
- preferred/allowed harnesses
- execution and approval policy

Software-development, personal, business, workflow and Mini App agent categories SHOULD be templates that populate defaults into this model.

### 97L.2 Harness

A Harness is the execution engine used to perform agent work. Examples MAY include SmartAIHub Native, Codex-class, Claude Code-class, Hermes-class, thClaws-class and future compatible runtimes.

Harness selection priority SHOULD be deterministic and user-controlled:

1. explicit deployment/installation binding;
2. explicit user selection;
3. Agent Profile primary harness;
4. package preference;
5. capability-based resolver;
6. fail/ask for a compatible runtime when no safe match exists.

Changing a compatible harness MUST preserve the Agent Profile identity unless the user intentionally creates a distinct agent.

### 97L.3 Orchestration provider

LangGraph and OpenAI Agents SDK MUST be representable as orchestration providers, not as SPAAS identity or harness type. SmartAIHub Native orchestration MUST remain available so simple applications are not forced to depend on an external framework.

The package MUST be able to declare provider, language, entrypoint, durable-state requirements, HITL/approval needs, tracing requirements and control ownership.

Hybrid orchestration MAY delegate work to harnesses or other agents. One primary orchestration authority MUST own final cancellation/retry/budget/approval semantics for a run.

### 97L.4 Harness Extension Package

SPAAS MUST support an extension form that can be materialized onto one or more compatible harnesses. A harness extension MAY include:

- instructions/prompts
- one or more Skills
- MCP configuration/server/client declarations
- tools/connectors
- commands/hooks
- workflow definitions
- orchestration entrypoints
- configuration schema
- optional embedded UI/assets

The canonical extension MUST remain provider-neutral where practical. Harness-specific overlays MAY map the same package into provider-native files/directories/configuration.

A Harness Adapter is infrastructure that lets SmartAIHub control a harness. A Harness Extension is a product/capability installed into that harness. These MUST remain distinct.

### 97L.5 Distribution forms

SPAAS MUST support one package exposing one or more forms:

```text
application
  ├─ web
  ├─ desktop
  ├─ mobile
  ├─ chat_first
  └─ hybrid

extension
  ├─ harness_plugin
  ├─ skill_pack
  ├─ workflow_pack
  └─ ui_extension

service
  ├─ mcp_server
  ├─ a2a_agent
  ├─ api_service
  └─ background_worker

bundle
  └─ multiple forms sharing one product identity
```

A product MAY therefore be offered as a SmartAIHub app, a harness plugin and an MCP service from the same canonical release when their component graph supports it.

---

## 97M. Chat, Voice, Messaging, Communication, MCP/A2A & Wallet Capabilities — v1.5

### 97M.1 Chat-first application contract

A chat-first SPAAS application MUST be able to represent:

- ordinary conversation messages;
- durable task creation and background execution;
- multiple concurrent tasks within one conversation;
- progress/status cards or equivalent representations;
- artifact/file/report previews;
- approvals, permission requests and questions;
- error/recovery states;
- scheduled/recurring work;
- agent switching/mention/delegation when multi-agent is enabled;
- continuation without requiring an in-flight background task to block new user messages.

Conversation state MUST NOT become an alternate uncontrolled job database. Durable execution identity remains anchored to the shared job/task control plane.

### 97M.2 Voice and multimodal command

Voice MUST be a first-class interaction capability rather than merely a speech-to-text textbox. Declared modes MAY include:

- push-to-talk;
- hands-free/realtime conversation;
- voice command/action execution;
- text-to-speech output;
- interruption/barge-in;
- image/file/camera input paired with voice.

Audio recording, transcript storage and derived memory MUST have separate retention/privacy controls.

### 97M.3 Internal messenger-style conversation

SPAAS SHOULD support internal conversations with participant combinations including:

- human ↔ human;
- human ↔ agent;
- agent ↔ agent;
- human group + one or more agents;
- room/channel/group conversations.

Capabilities MAY include text, voice note, image, video, file, reaction, reply/thread, mention, typing indicator, read receipt and presence, subject to platform/provider capability.

### 97M.4 External communication channels

Email, LINE, Telegram, WhatsApp and future channels SHOULD be exposed through canonical communication capabilities rather than bespoke per-app logic. Common operations SHOULD normalize where provider semantics permit:

- receive/send message;
- receive/send file/media;
- reply/thread/reference;
- reaction;
- typing/read state;
- identity/contact mapping;
- webhook/event delivery.

Provider-specific limitations MUST remain visible and MUST NOT be fabricated into equivalence.

### 97M.5 Telephony and phone identity

SPAAS MUST be able to declare inbound/outbound call, SMS, voicemail and voice-agent capabilities through providers such as Twilio-class telephony services or future adapters. Phone number ownership, recording consent, transcript retention, caller identity, regional/legal constraints and emergency-use restrictions MUST be modeled explicitly.

### 97M.6 MCP client/server and A2A client/server

MCP and A2A roles are orthogonal. Applications MAY be any combination of:

- MCP client;
- MCP server;
- A2A client/delegator;
- A2A server/agent.

Tool/agent discovery MUST be capability- and policy-scoped. Data passed across MCP/A2A boundaries MUST be limited to the minimum necessary context and MUST pass normal authorization/data-egress policy.

MCP-facing applications additionally MUST declare extension requirements using the v1.6 protocol contract in §97R. A package claiming portable MCP support MUST NOT equate a remote peer's advertised extension with a qualified SmartAIHub implementation, and MUST NOT silently promote an optional extension into a required runtime dependency after release.

### 97M.7 Wallet capability

Wallet support MUST distinguish at least:

- read balance/entitlement;
- estimate fees/cost;
- authorize spend;
- initiate payment;
- approve payment;
- receive/refund/settle where supported.

A wallet-enabled agent MUST NOT gain payment authority merely because it can read wallet state. High-risk actions MUST support thresholds, approvals, payer policy, audit and revocation.

---

## 97N. SmartAIHub Hosting, Domain, Access, Marketplace & Commercialization Contract — v1.5

### 97N.1 Deployment Instance

A Deployment Instance binds one immutable release/installation to concrete runtime and product policy. It MUST be able to record independently:

- deployment owner and tenant;
- hosting provider/placement;
- runtime/materialization bindings;
- address/domain mode;
- access/visibility policy;
- authentication/identity policy;
- pricing/metering policy;
- payer policy;
- entitlement/license policy;
- revenue/settlement policy reference;
- quota/budget/rate limit;
- region/data policy;
- release/update policy.

Package identity MUST NOT be forked merely because two customers deploy the same release under different domains, access policies or commercial offerings.

### 97N.2 Address/domain modes

SmartAIHub-hosted deployments MUST be able to support, subject to tenant/platform policy:

- main-domain platform path, e.g. `smartaihub.app/...`;
- SmartAIHub subdomain;
- tenant subdomain;
- custom domain;
- internal/private address.

Domain choice MUST NOT imply access visibility or price.

### 97N.3 Access and visibility

The canonical access modes MUST include at least:

- `private` — owner only;
- `shared` — explicit principals;
- `group` — group/team membership;
- `organization` — organization membership;
- `tenant` — tenant-wide entitlement;
- `unlisted` — addressable but not discoverable;
- `public` — public discovery/access subject to authentication/execution rules.

`public` SHOULD separately support anonymous viewing and authenticated execution. Public AI execution MUST include abuse/cost controls such as quotas, rate limits, deployment budgets and appropriate risk checks.

### 97N.4 Marketplace product vs package vs offering

SPAAS MUST distinguish:

```text
Package/Release         = technical immutable artifact
Marketplace Listing     = discoverability/presentation/commercial metadata
Offering                = one purchasable/rentable usage or license option
Entitlement             = what a buyer/user is permitted to do
Deployment Instance     = concrete running/installed realization
```

Changing price or sales copy MUST NOT require a new application release unless technical package semantics change.

### 97N.5 Commercial models

An offering MAY use one or more of:

- free;
- included-in-plan;
- pay-per-use/per-run;
- usage-metered;
- subscription/rental;
- one-time/perpetual license;
- seat license;
- tenant/organization license;
- deployment license;
- source-code license;
- sponsored usage;
- enterprise/custom contract.

### 97N.6 Cost, price and revenue are distinct

The platform MUST distinguish underlying execution cost from customer price and from revenue allocation/settlement. A package or offering MUST NOT assume they are the same number.

The payer MAY be end user, deployment owner, tenant, sponsor pool or another authorized wallet. Payer fallback/priority policy MAY be configured when the billing system supports it.

Revenue split MUST be policy-driven and MAY include platform, tenant/partner/reseller, creator and payment/tax adjustments. Business terms SHOULD be referenced through mutable commercial policy rather than embedded permanently into immutable technical package content.

### 97N.7 External/self-hosted deployment and sale

A marketplace offering MAY permit customer-managed, creator-managed, SmartAIHub-managed external, private-cloud, on-premise or offline/air-gapped deployment.

The package MUST declare the allowed delivery artifact(s), for example:

- signed SPAAS bundle;
- source bundle;
- compiled binary/installer;
- OCI/container image;
- deployment manifests/scripts;
- desktop/mobile package where distribution policy allows.

Exports MUST NOT include SmartAIHub platform secrets or another tenant's/user's data.

### 97N.8 Licensing and entitlement dimensions

Licensing MAY constrain independently:

- users/seats;
- organizations/tenants;
- number of deployments;
- environment type (dev/test/prod);
- runs/credits/usage;
- white-label/custom-domain rights;
- source availability;
- modification rights;
- redistribution rights;
- commercial use;
- update/support period;
- offline use.

License expiry behavior MUST be declared. Where a commercial application holds user-owned data, expiration MUST NOT silently delete or corrupt that data; read-only/export grace behavior SHOULD be supported where appropriate.

### 97N.9 Data portability after commercial termination

Commercial entitlement and ownership of user-created data are separate concerns. Packages/offerings MUST declare export/delete policy on expiry and MUST honor platform privacy/data-retention policy even after billing entitlement ends.

---

## 97O. Privacy, Personal Data Protection & Trust Contract — v1.5

### 97O.1 Privacy is a mandatory cross-cutting contract

Every SPAAS package MUST declare enough privacy metadata for installation/deployment review, even when it declares that it collects no personal data. Privacy applies across chat, files, voice, camera, contacts, location, email, messaging, phone calls, wallet/payment metadata, memory, MCP/A2A, analytics, logs and external providers.

### 97O.2 Data inventory and purpose

The manifest MUST support machine-readable declarations for:

- collected/processed data categories;
- sensitivity/classification;
- processing purpose;
- source of data;
- storage location/residency;
- retention/deletion policy;
- external processor/provider destinations;
- data-egress rules;
- memory/personalization use;
- analytics use;
- model-training use;
- creator/support/operator access;
- user export/delete/revoke rights.

Model-training use of end-user content MUST NOT be enabled merely because a provider technically supports it. Training/reuse requires explicit policy and consent appropriate to the deployment context.

### 97O.3 Least-privilege agent and harness access

Agent identity does not confer blanket access. Data access MUST be scoped by capability, principal, purpose and deployment policy. A Developer Agent, for example, MUST NOT automatically inherit a Personal Agent's email, contacts or wallet access.

Before data leaves SmartAIHub to a harness, model provider, MCP server, A2A peer, telephony provider or communication channel, the egress MUST pass authorization and privacy policy for the concrete destination and data class.

### 97O.4 Marketplace creator isolation

Publishing an application to the Marketplace MUST NOT grant the creator access to end-user content. Creator analytics SHOULD default to aggregated/operational metrics. Content-level access requires an explicit, scoped and auditable user/tenant grant.

Support access SHOULD be time-limited, scope-limited, revocable and logged. Platform super-admin access MUST be constrained by documented break-glass/support policy rather than treated as ordinary creator access.

### 97O.5 Voice/telephony privacy

Audio recording, transcription, derived summary, phone number/call metadata and conversation memory MUST be independently configurable. Recording consent and jurisdiction/provider requirements MUST be surfaced where applicable.

### 97O.6 Memory boundaries

Conversation history and durable Memory are distinct. Promotion of conversation content into memory MUST obey purpose, scope and retention policy. Personal memory MUST NOT silently become team/tenant/public memory.

Memory scope MUST be representable at least at session, personal, project, team, tenant and application levels where supported.

### 97O.7 Encryption, secrets and customer-controlled deployment

SPAAS MUST distinguish application data from secrets. Production credentials, OAuth tokens, API keys and wallet/telephony secrets MUST remain in approved secret storage and MUST NOT be exported as ordinary application state.

Deployments SHOULD declare transport encryption, at-rest encryption and application-level/customer-managed-key requirements where relevant. Self-hosted/private/air-gapped offerings MUST be able to state whether external telemetry, external model calls or other network egress are required or can be disabled.

### 97O.8 User-facing privacy label

Marketplace/install surfaces SHOULD derive a concise privacy label from machine-readable policy, including:

- data categories used;
- sensitive permissions;
- external services/processors;
- retention summary;
- whether creator can access content;
- whether content may be used for training;
- available delete/export/revoke controls.

The label MUST be generated from enforceable package/deployment policy, not marketing text alone.

### 97O.9 Auditability

Sensitive reads and side effects SHOULD be attributable to human principal, agent identity, harness/orchestrator, tool/provider and deployment/tenant context. Audit policy MUST support answering materially important questions such as who accessed a file, which agent sent an email, which external provider received selected content and who approved a payment.

---

## 97P. Design Intelligence & Reference Contract with Spec 270 — v1.5

### 97P.1 Authority boundary

Spec 261 is authoritative for application kind, experience, platform targets, technology stack, required capabilities, deployment constraints and reference intent.

Spec 270 is an optional design capability/provider that consumes those constraints and produces design artifacts. Spec 270 MUST NOT silently redefine platform target or technology stack.

Spec 224 consumes the authoritative Spec 261 contract plus available Spec 270 design artifacts when implementing software.

Canonical dependency direction:

```text
Spec 261 — Product / Platform / Stack / Capability Contract
        ├──────────────► Spec 270 — Design Intelligence / UX Adaptation
        │                         │
        │                         ▼
        └────────────────► Spec 224 — Development / Implementation
```

### 97P.2 Reference artifacts

SPAAS MUST support references such as:

- website URL;
- iOS/Android/desktop app identity;
- screenshots/images;
- video/interaction recording;
- existing product UI/design system;
- imported design artifacts.

Each reference SHOULD declare intended use dimensions such as:

- visual language;
- information architecture;
- navigation;
- interaction pattern;
- conversation/messaging model;
- workflow behavior;
- feature inspiration.

A reference MUST NOT automatically mean pixel-copying, source copying or intellectual-property transfer. Spec 270/design tooling SHOULD synthesize an original implementation consistent with the declared constraints and applicable rights/policies.

### 97P.3 Platform-specific adaptation

For multi-platform applications, design tooling MUST be allowed to adapt interaction patterns by platform rather than shrinking one interface indiscriminately. Examples include keyboard/drag-drop/multi-window on desktop versus touch targets, bottom navigation, camera/share-sheet and push notifications on mobile.

Chat-first design artifacts SHOULD include states for background work, approvals, artifacts, permissions, agent switching/delegation, voice, external communication and recovery when those capabilities are enabled.

---

## 97Q. Fifth Twelve-Pass Gap Review Record

The 2026-10-04 review applied twelve additional independent lenses after the prior 52 passes, for **64 cumulative review passes**.

| Pass | Review lens | Gap found | Remediation in v1.5 |
|---|---|---|---|
| 53 | Application identity vs agent identity | Agent-centric framing could make app categories become runtime classes | Made SPAAS application-first and agent categories templates only |
| 54 | Platform/stack determinism | Web/desktop/mobile target and implementation stack could be left to harness guessing | Added explicit platform, stack and sharing-strategy contracts |
| 55 | Chat-first product model | Chat could be treated as a simple LLM message UI | Added chat-first/hybrid application experience and durable background-task semantics |
| 56 | Harness/orchestrator layering | Codex/Claude/Hermes and LangGraph/OpenAI Agents SDK could be conflated | Separated Agent Profile, Harness, Orchestration Provider, Runtime Protocol and Environment |
| 57 | Extension portability | Provider-native plugin packaging could fragment capabilities | Added canonical Harness Extension/Plugin form with provider-specific materializers |
| 58 | External capability surfaces | Voice, telephony, messenger channels, wallet and MCP/A2A roles lacked one product contract | Added normalized optional capability declarations and least-privilege rules |
| 59 | Design/runtime coupling | Design provider could accidentally choose platform or stack | Made Spec 261 authoritative and Spec 270 an optional constrained design provider |
| 60 | Hosting/address/access coupling | Domain choice could be confused with visibility or hosting | Added Deployment Instance with orthogonal hosting, address and access policies |
| 61 | Marketplace commercialization | Package, listing, price, entitlement and deployment were insufficiently separated | Added Offering/Entitlement/licensing/commercial models and cost-price-revenue separation |
| 62 | External/self-host sale | Marketplace assumed primarily hosted execution | Added deployable artifact, source/binary/container and offline/private-cloud delivery contracts |
| 63 | Personal-data trust | Creator/agent/provider data access could be implicit | Added mandatory privacy inventory, egress, retention, creator isolation and user rights |
| 64 | End-to-end conformance | Existing DoD did not prove new surfaces and commercial/privacy boundaries | Extended conformance profiles and DoD evidence for declared v1.5 capabilities |

All v1.5 additions preserve the v1.4 lifecycle and materialization model. Existing packages do not become invalid merely because they do not declare a new optional capability.

---

## 97R. MCP 2026 Protocol & Extension Portability Contract — v1.6

### 97R.1 Base protocol and extension versions are independent

A SPAAS MCP dependency MUST be able to declare the base MCP protocol range independently from every extension version/profile it requires or optionally uses.

Minimum conceptual contract:

```yaml
mcp:
  role: [client]
  protocol:
    preferred: "2026-07-28"
    minimum: "2026-07-28"
  extensions:
    required:
      io.modelcontextprotocol/skills:
        version: stable
        settings:
          directoryRead: false
    optional:
      io.modelcontextprotocol/tasks:
        version: "2026-07-28"
        fallback: SMARTAIHUB_DURABLE_WRAPPER
      io.modelcontextprotocol/ui:
        version: "2026-01-26"
        settings:
          mimeTypes: ["text/html;profile=mcp-app"]
        fallback: NATIVE_RESULT_SURFACE
  unknownExtensionPolicy:
    optional: PRESERVE_NO_EXECUTE
    required: FAIL_CLOSED
```

The exact package schema MAY differ after canonical schema-fit review, but the semantic separation above is normative.

### 97R.2 Discovery and negotiation

For base MCP revision `2026-07-28`, an MCP server MUST support `server/discover`; a SmartAIHub client MAY invoke it before other calls and SHOULD do so when deployment/admission depends on protocol or extension compatibility.

SPAAS validation/runtime admission MUST distinguish:

```text
DECLARED_BY_PACKAGE
        ↓
ADVERTISED_BY_PEER
        ↓
MUTUALLY_NEGOTIATED
        ↓
SMARTAIHUB_QUALIFIED
        ↓
CURRENTLY_ELIGIBLE
```

These states MUST NOT be collapsed.

- `ADVERTISED` means a peer claims support.
- `NEGOTIATED` means both sides can speak the extension/profile under the selected versions/settings.
- `QUALIFIED` means SmartAIHub's adapter/conformance/policy checks accept the implementation for the declared use.
- `ELIGIBLE` additionally incorporates current actor/tenant/project permission, health, placement, region, entitlement, egress and other runtime policy.

A cached `server/discover` result is capability metadata, not an authorization token.

### 97R.3 Generic extension descriptor

SPAAS SHOULD normalize extension requirements using a generic descriptor conceptually equivalent to:

```ts
interface McpExtensionRequirement {
  extensionId: string;
  requirement: 'REQUIRED' | 'OPTIONAL';
  extensionVersion?: string;
  requiredSettings?: Record<string, unknown>;
  fallback?:
    | 'CORE_PROTOCOL'
    | 'SMARTAIHUB_ADAPTER'
    | 'SMARTAIHUB_DURABLE_WRAPPER'
    | 'NATIVE_RESULT_SURFACE'
    | 'USER_MEDIATED'
    | 'NONE';
  omissionSafe: boolean;
}
```

Extension IDs MUST remain namespaced identifiers. The SPAAS core schema MUST NOT enumerate all possible extension IDs.

### 97R.4 Unknown extensions and downgrade safety

- Unknown **required** extensions MUST fail admission/activation closed.
- Unknown security-critical extension semantics MUST fail closed even if declared optional.
- Unknown optional extension metadata MAY be preserved without execution only when omission is explicitly safe.
- Export/import SHOULD preserve safe unknown optional extension fields canonically so a round trip does not destroy provider metadata.
- A runtime MUST NOT silently downgrade from an extension path to a fallback when that changes authorization, user-visible side effects, durability, billing, data-egress, verification strength, or output semantics beyond the package's declared fallback policy.
- A fallback that changes material semantics requires a new resolution/admission decision and, when required by policy, user approval.

### 97R.5 Skills over MCP

`io.modelcontextprotocol/skills` is a transport/discovery extension, not a new SmartAIHub Skill registry.

Rules:

- remote Skill bytes/metadata are untrusted until normal integrity/trust policy accepts them;
- extension advertisement does not grant Skill activation or capability invocation authority;
- SmartAIHub canonical Skill/release identity remains separate from remote MCP Skill identity;
- implemented Spec 256 consumes approved/normalized Skill-capability facts rather than parsing arbitrary remote Skill instructions as authority;
- clients lacking native Skills extension support MAY use an explicitly labeled compatibility adapter only when policy permits; compatibility mode MUST NOT be presented as native extension conformance.

### 97R.6 MCP Tasks

`io.modelcontextprotocol/tasks` enables deferred/long-running MCP operations. An MCP Task handle is an external protocol execution handle and MUST NOT become a second SmartAIHub task/job source of truth.

Canonical mapping:

```text
SmartAIHub logical task
        ↓
canonical run / worker_job / attempt
        ↓
MCP adapter invocation
        ↓
MCP task handle (when server chooses async task mode)
        ↓
status/result reconciliation
        ↓
SmartAIHub evidence + Completion Contract
```

A minimal binding SHOULD preserve peer/server identity, MCP task ID, canonical task/run/attempt identity, assignment/execution generation where applicable, selected protocol/extension version, last observed remote state, and reconciliation receipt reference.

Remote task state `completed` MUST NOT by itself satisfy SmartAIHub's final verification/completion contract.

### 97R.7 MCP Apps / UI

`io.modelcontextprotocol/ui` is an optional protocol-delivered interaction surface. It MUST NOT be conflated with SPAAS application identity or SmartAIHub Mini App identity.

A SPAAS application MAY declare support for an MCP UI surface, including accepted MIME/profile settings, but MUST define safe fallback where the UI extension is optional.

When rendered by SmartAIHub:

- remote UI is treated as untrusted active content;
- iframe/sandbox and host-bridge policy MUST follow the applicable MCP Apps security model and SmartAIHub web/security policy;
- UI-to-tool actions remain subject to normal capability authorization and action binding;
- unsupported UI MUST fall back to structured/text/native SmartAIHub result surfaces when the package declares that fallback;
- absence of MCP UI MUST NOT disable the underlying tool if UI is optional and a semantically adequate fallback exists.

### 97R.8 Authorization-related extensions

Authentication/authorization extensions or provider-specific auth profiles MUST map to SmartAIHub's canonical identity/secret/policy systems. Extension configuration MUST reference credential bindings or managed secret references, never embed raw long-lived credentials in portable package content.

A package MUST distinguish protocol capability from authorization eligibility: a peer may support an extension while the current principal is not entitled to use it.

### 97R.9 Qualification and capability resolver integration

Implemented Spec 256 MUST receive normalized implementation-offer/availability facts from MCP adapters; it MUST NOT become responsible for wire-level `server/discover` or extension negotiation.

A hard package requirement is satisfiable only when the relevant implementation is currently qualified/eligible according to SmartAIHub policy. `ADVERTISED` alone is insufficient for `READY`.

### 97R.10 Release locking and drift

A release lock SHOULD capture, where material to reproducibility:

- selected base MCP protocol compatibility range;
- required extension IDs and version/profile constraints;
- adapter/conformance profile version;
- fallback policy revision;
- qualification evidence/reference where the release requires a specific provider/runtime behavior.

Runtime re-discovery MAY observe newer capabilities without changing immutable package identity. A material loss or incompatible change in a required extension MUST trigger drift/re-admission and a truthful `DEGRADED`, `BLOCKED` or migration-required state.

### 97R.11 Conformance fixtures

At minimum, SPAAS MCP conformance MUST include fixtures for:

1. `server/discover` version/capability discovery;
2. required extension absent;
3. optional extension absent with declared safe fallback;
4. extension advertised but negotiation/settings incompatible;
5. negotiated extension failing qualification;
6. unknown optional extension preserved without execution;
7. unknown required extension failing closed;
8. mixed protocol/extension version skew;
9. MCP Tasks external handle mapping without duplicate job authority;
10. remote task `completed` but SmartAIHub verification still pending/failed;
11. MCP UI supported and sandbox-rendered;
12. MCP UI unavailable with native fallback;
13. extension/auth capability present but current principal not eligible;
14. stale cached discovery invalidated/rechecked before a hard-requirement dispatch when policy/freshness requires it.

### 97R.12 Normative upstream references

The implementation team MUST pin exact upstream schemas/specification snapshots used by conformance. Current references verified 2026-10-04 include:

- MCP core `2026-07-28` and `server/discover`: `https://github.com/modelcontextprotocol/modelcontextprotocol`
- Skills over MCP stable specification: `https://github.com/modelcontextprotocol/ext-skills`
- MCP Tasks released schema/specification: `https://github.com/modelcontextprotocol/ext-tasks`
- MCP Apps/UI specification and SDK: `https://github.com/modelcontextprotocol/ext-apps`

Upstream draft changes MUST NOT silently alter a released SPAAS application's semantics; adapter updates follow normal versioning/conformance rollout policy.

---

## 97S. v1.6 Targeted Architecture Reconciliation Record

The v1.6 review checked the prior v1.5 contract against eight MCP-specific failure classes without reopening unrelated SPAAS architecture:

| Check | Risk | v1.6 resolution |
|---|---|---|
| MCP core revision | legacy session/handshake assumptions leaking into portable apps | made base-protocol revision explicit and kept transport behavior in MCP adapter |
| Extension growth | hard-coded Skills/Tasks/UI booleans becoming obsolete | generic namespaced extension descriptor |
| Capability truth | remote advertisement treated as readiness | explicit advertised → negotiated → qualified → eligible states |
| Tasks authority | MCP Tasks becoming a second scheduler/job DB | external task binding only; SmartAIHub jobs remain canonical |
| UI identity | MCP App confused with SPAAS/Mini App product identity | modeled MCP UI as optional interaction surface |
| Unknown extensions | unsafe downgrade or metadata loss | fail closed for required/security-critical; preserve safe optional metadata |
| Portability | provider-native extension silently required everywhere | required/optional/fallback contract with explicit loss of portability |
| Mixed versions | base protocol and extension versions conflated | independent version constraints plus conformance fixtures |

---

## 97. Definition of Done for Spec 261

Spec 261 is DONE only when SmartAIHub can demonstrate an end-to-end proof with a real application:

```text
Natural-language request
        ↓
Spec 224 Development Orchestrator
        ↓
SPAAS application source + manifest
        ↓
Deterministic validation
        ↓
Immutable signed/attested release candidate
        ↓
Deployment plan
        ↓
Deployment A: SmartAIHub cloud runtime
        ↓
Health + functional verification
        ↓
Deployment B: materially different SmartAIHub Runner/Desktop runtime
        ↓
Health + functional verification
        ↓
Upgrade to a new release
        ↓
Rollback where supported
        ↓
Marketplace/private-registry install proof
        ↓
Export without secrets
```

Both deployments MUST reference the same immutable application release and MUST preserve application identity, release identity, installation/materialization context, tenant/principal policy context, traceability, and billing attribution.

For `SPAAS-AGENT-PORTABLE`, the end-to-end proof MUST additionally exercise at least two materially different agent runtime classes when available, such as an installable/attachable harness and a provisioned or managed provider runtime. Where a provider lacks a supported programmatic control surface, the test MUST prove truthful `USER_MEDIATED_HANDOFF`, `STATUS_ONLY`, or `UNAVAILABLE` behavior rather than fabricated integration.

The end-to-end proof MUST additionally demonstrate:

- desired-state reconciliation after at least one induced runtime drift
- credential rotation or revocation behavior without leaking secret material
- a resource-limit or backpressure case with typed handling
- an at-least-once event side effect protected by idempotency/deduplication
- one required service-contract compatibility check
- safe readiness/drain behavior during an upgrade or shutdown
- data-location/retention policy enforcement for at least one persistent binding
- re-evaluation of admission after a trust/policy/dependency context change
- safe reconnect/conflict handling for mutable offline state when the app declares offline writes
- stale-owner rejection or equivalent fencing for HA/multi-region singleton failover when the app declares HA
- one in-flight durable execution surviving or being safely migrated/drained across an application upgrade
- one atomic binding/config generation change with failed-stage rollback or equivalent proof that no half-applied production state is exposed
- the selected cloud and local/runtime adapters passing the same required SPAAS conformance fixtures
- registry retention proof showing that a rollback/in-flight-referenced release is protected from garbage collection
- one model/provider routing decision rejected because AI data-egress policy would be weakened
- one application proof with explicit experience, platform target and technology stack, with Spec 224 consuming rather than guessing those choices
- for `SPAAS-CHAT-FIRST`, one background task started from chat while the user continues the conversation, with durable progress/artifact/approval linkage
- for `SPAAS-HARNESS-PLUGIN`, one canonical extension materialized to at least one harness and cleanly uninstalled/reconciled; cross-harness proof is required when `SPAAS-PORTABLE` is also claimed
- for a package declaring LangGraph or OpenAI Agents SDK, one proof that orchestration control ownership, cancellation and retry semantics do not conflict with SmartAIHub durable job control
- for marketplace/commercialized offerings, proof that package release, listing, offering, entitlement, payer and revenue policy are distinct persisted concepts
- for `SPAAS-SELF-HOSTABLE`, a secret-free export/deploy proof on a customer-controlled target or a deterministic fixture equivalent
- for `SPAAS-PRIVACY-DECLARED`, proof of data inventory, external-egress policy, retention, creator isolation and at least one export/delete/revoke user-right path
- workload-to-workload authorization preserving tenant/installation context without a shared privileged static credential where the target runtime supports workload identity
- one dependency-graph failure/cycle case rejected before unsafe deployment
- admission evidence bundle creation and an expired/invalid waiver causing re-evaluation
- safe custom-domain or external callback teardown/rebinding without cross-tenant misdelivery where such ingress is used
- package-ingestion rejection proof for traversal/symlink/decompression/resource-exhaustion abuse
- one reproducible/hermetic build comparison or an explicit nondeterminism report tied to provenance
- required-extension failure proof plus preservation of a safe unknown optional extension through native export/import
- one supported mixed-version rolling-upgrade/skew proof for control plane and runtime adapters
- clock-skew/DST or equivalent time-boundary proof for an app using leases, schedules, TTLs, or replay windows
- privacy deletion propagation proof covering at least one derived representation such as vector/index/cache data when applicable
- AI fallback rejection when a candidate runtime/model violates a declared hard capability or quality floor
- scoped emergency quarantine/kill-switch proof that stops affected execution while preserving audit evidence
- long-running authorization revalidation proof after a permission/entitlement/approval change
- external-dependency failure proof showing bounded retries/circuit breaking without retry amplification
- native SPAAS export/import round-trip fidelity proof with no secret leakage
- authorized state export/restore proof where state portability is claimed, including tenant/schema compatibility checks
- preview/ephemeral expiration proof showing cleanup or explicitly retained ownership of billable/external resources
- one successful `ATTACH` of an existing compatible runtime without taking over uninstall/update ownership
- one typed `INSTALL` or `PROVISION` path with acquisition/integrity provenance and isolated lifecycle ownership
- one managed-agent `BIND` or explicit handoff-only proof showing that SmartAIHub does not claim runtime ownership it does not possess
- provider capability loss/drift causing deterministic re-evaluation and a safe blocked/degraded result
- canonical execution handle mapping preserving task/run/tenant/principal identity across an external adapter
- adapter upgrade/conformance proof showing no silent permission expansion
- retirement proof distinguishing uninstall/deprovision/unbind/detach and detecting orphaned external resources
- MCP `server/discover` proof for a `2026-07-28` peer showing selected base protocol and extension capability metadata
- one required MCP extension missing/incompatible case blocked before unsafe activation
- one optional MCP extension missing case using only its declared semantics-preserving fallback
- one advertised-but-not-qualified extension case that remains non-ready to Spec 256/runtime routing
- one MCP Tasks execution whose external handle maps to canonical SmartAIHub task/run/attempt identity without creating a second scheduler and whose remote `completed` state does not bypass final verification
- one MCP Apps/UI path rendered under sandbox/host policy plus one no-UI fallback path when UI is optional
- one mixed base-protocol/extension-version incompatibility fixture that fails safely

Passing code-level tests or manifest validation alone is not sufficient.
