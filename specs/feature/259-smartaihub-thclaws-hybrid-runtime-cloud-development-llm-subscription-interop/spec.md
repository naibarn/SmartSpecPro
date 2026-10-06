---
spec_id: 259
numbering_status: USER_ASSIGNED_PENDING_CANONICAL_REGISTRY_CONFIRMATION
title: SmartAIHub thClaws Hybrid Runtime, Cloud Development Workspace & User-Owned LLM Subscription Interoperability
revision: 1.2-second-ten-pass-audited-cumulative
status: PROPOSED_IMPLEMENTATION_SPECIFICATION_NOT_IMPLEMENTED_NOT_PRODUCTION_CERTIFIED
prepared: 2026-09-29
review_rounds: 20  # cumulative; R1.2 adds a second independent 10-pass audit
review_status: SECOND_TEN_PASS_CROSS_SPEC_AUDIT_COMPLETE_DESIGN_ONLY
primary_owner: thClaws Runtime Interoperability / Cloud Development Execution Fabric
risk_class: HIGH
implementation_boundary: additive only; Specs 1-213 immutable; Spec 224 active unchanged; existing worker_jobs/approval/billing/memory authorities retained
canonical_goal_authority: Feature 196 Universal Assistant / Chat + Task Control
canonical_job_authority: Feature 186 / Feature 195 worker_jobs + events + outbox + lease/fencing
canonical_development_lifecycle: Spec 224
canonical_workflow: Spec 215
canonical_authz_secrets: Spec 220
canonical_billing: Spec 207
canonical_model_routing: Spec 231
canonical_external_agent_gateway: Spec 200 historical contract + later additive adapters
canonical_external_personal_agent_interop: Spec 239
canonical_cloudflare_sandbox_runtime: Spec 242
canonical_managed_harness_layer: Spec 243
canonical_skill_distribution: Spec 248
canonical_safe_generated_ui: Spec 240
canonical_cross_product_handoff: Spec 253
canonical_skill_first_intent: Spec 256
canonical_cloudflare_migration: Spec 245
feature_flags:
  thclaws.enabled: false
  thclaws.cloud_sandbox.enabled: false
  thclaws.local_desktop.enabled: false
  thclaws.gateway_model_routing.enabled: false
  thclaws.user_subscription.enabled: false
  thclaws.zai_coding_plan.enabled: false
  thclaws.codex_local_subscription.enabled: false
  thclaws.miniapp_development.enabled: false
  thclaws.capability_discovery.enabled: false
  thclaws.skill_bridge.enabled: false
  thclaws.artifact_bridge.enabled: false
  thclaws.managed_policy.enabled: false
  thclaws.secure_preview_proxy.enabled: false
  thclaws.subscription_cloud_delegation.enabled: false
  thclaws.upstream_state_migration.enabled: false
  thclaws.cloud_credential_broker.enabled: false
  thclaws.cross_placement_handoff.enabled: false
  thclaws.region_constrained_runtime.enabled: false
  thclaws.atomic_checkpoint_v2.enabled: false
  thclaws.runtime_fairness_backpressure.enabled: false
related_specs: [186,195,196,197,199,200,206,207,208,209,214,215,219,220,224,225,226,229,231,239,240,242,243,245,248,250,253,256,258]
---

# Spec 259 — SmartAIHub thClaws Hybrid Runtime, Cloud Development Workspace & User-Owned LLM Subscription Interoperability

## 0. Executive decision

SmartAIHub SHALL support **thClaws as a first-class, provider-neutral agent/coding harness** that can execute under the existing SmartAIHub Control Plane in two primary placements:

1. **SmartAIHub Cloud placement** — thClaws runs inside an isolated Cloudflare Sandbox/Container lifecycle managed by Spec 242 and SmartAIHub `worker_jobs`.
2. **User-device placement** — thClaws runs on the user's Windows PC or macOS device, launched/managed through the existing SmartAIHub Desktop/Worker execution channel, with no requirement for an inbound public port.

The same logical development task MAY be placed in either environment according to user choice, policy, capability, privacy, toolchain, cost and availability.

SmartAIHub SHALL also separate four concerns that are often incorrectly coupled:

```text
HARNESS              MODEL                 CREDENTIAL SOURCE          EXECUTION LOCATION
thClaws              GLM-5.3-Flash         SmartAIHub Gateway         Cloudflare Sandbox
Codex                GPT/Codex             User API Key              User PC/Mac
Claude Code          Claude                User Subscription         Certified provider cloud
SmartAIHub Native    Gemini/Qwen/etc.      Platform Credits          Other certified runtime
```

A user SHALL be able to choose model and eligible credential source independently of the harness where the provider and runtime contract permits it. `AUTO` mode SHALL let SmartAIHub choose a certified combination.

Spec 259 SHALL make it possible for a user on a phone/tablet/browser, without a development computer available, to ask SmartAIHub to create or modify software or a Mini App. SmartAIHub may create a temporary Cloud Development Workspace, start thClaws, select an authorized model/credential source, edit code, run tests/builds, expose an approved preview, return artifacts to Chat/Task Control, and then sleep/destroy the runtime when work ends.

Spec 259 is **not** a new orchestration system, job ledger, approval system, billing ledger, memory service, model router, Mini App deployment authority or general cloud-VM product.

---

## 1. Why this spec exists

SmartAIHub already has most control-plane building blocks: durable jobs, development orchestration, model routing, Cloudflare Sandbox integration, hosted-harness normalization, Skill-first capability discovery, Mini App/UI generation and shared Chat/Task Control. What is missing is a complete contract that makes thClaws usable as a routine execution arm across cloud and user devices while allowing user-owned LLM access.

Without this specification, implementations are likely to make one or more architectural mistakes:

- treating thClaws as only another LLM provider instead of a harness/runtime;
- opening a permanent thClaws server for every user;
- duplicating `worker_jobs`, schedulers or approvals inside thClaws;
- coupling one model permanently to the harness;
- copying subscription credentials into cloud environments without provider-specific rules;
- assuming any consumer subscription can legally or technically be proxied through SmartAIHub;
- exposing a user's local thClaws daemon directly to the public Internet;
- losing cloud workspace/session state when a Sandbox sleeps;
- allowing a coding agent to publish production code without Spec 224/219 release gates;
- charging SmartAIHub LLM credits when the user is actually using their own subscription, or silently falling back to platform credits without consent.

Spec 259 closes those gaps.

---

## 2. Source baseline and volatile assumptions

Implementation MUST pin and re-probe exact versions. The following public surfaces were reviewed on 2026-09-29 and are evidence for design feasibility, not guarantees that future versions remain identical.

### 2.1 thClaws

Current public project/manual surfaces document:

- native binaries for macOS, Windows and Linux;
- CLI/headless and `--serve` modes;
- `POST /agent/run` for native orchestrator-driven execution;
- `GET /v1/agent/info` for capability/model/skill/MCP discovery;
- OpenAI-compatible `/v1/chat/completions` and Anthropic-compatible `/v1/messages`;
- Job Artifact endpoints and input upload;
- Skills, MCP, subagents/teams, shell/filesystem/browser-oriented agent execution;
- generic OpenAI-compatible gateway support (`oai/*`);
- Z.ai as a native provider using `ZAI_API_KEY` and optional `ZAI_BASE_URL`;
- a local ChatGPT/Codex subscription route that can reuse Codex CLI authentication on the user's machine.

References:
- https://github.com/thClaws/thClaws
- https://thclaws.ai/
- https://thclaws.ai/manual-th/ch06-providers-models-api-keys.html
- https://thclaws.ai/manual/ch22-paperclip-adapter.html
- https://thclaws.ai/manual-th/ch30-job-artifacts.html

### 2.2 Cloudflare Sandbox

Cloudflare Sandbox currently provides isolated Linux containers with lazy start, configurable `sleepAfter`, dynamic `keepAlive`, explicit `destroy()`, command/process/filesystem operations, and ephemeral local state after stop/replacement. The same sandbox ID does not imply filesystem/process persistence across container generations.

References:
- https://developers.cloudflare.com/sandbox/
- https://developers.cloudflare.com/sandbox/api/lifecycle/
- https://developers.cloudflare.com/sandbox/configuration/sandbox-options/
- https://developers.cloudflare.com/sandbox/1-0-preview/lifecycle/

### 2.3 Z.ai Coding Plan

Z.ai documentation currently distinguishes the Coding Plan endpoint from general API billing. A Coding Plan API key uses the coding-specific OpenAI-compatible endpoint:

`https://api.z.ai/api/coding/paas/v4`

The general resource-package/prepaid endpoint is distinct:

`https://api.z.ai/api/paas/v4`

Available models depend on account entitlement and current provider catalogue; current documentation includes GLM-5.3 and GLM-5.3-Flash.

Reference:
- https://zcode.z.ai/en/docs/configuration

### 2.4 Volatility rule

No provider/model/version string in this specification is permanent truth. Production admission MUST depend on a versioned provider/runtime capability profile and conformance evidence.

---

## 3. Authority boundaries

### 3.1 SmartAIHub owns

SmartAIHub remains authoritative for:

- authenticated principal, tenant, project/product and conversation scope;
- user intent and Assistant Profile;
- logical workflow/development run lifecycle;
- physical work admission through `worker_jobs`;
- lease, fencing, idempotency, retries and reconciliation;
- approval policy and consequential side-effect authorization;
- credits/budget/settlement and platform fees;
- model-routing policy and model registry;
- provider credential authorization policy;
- long-term SmartAIHub memory;
- canonical artifacts and provenance in R2/PG;
- release/publish authority for Mini Apps/products;
- final verification and completion semantics.

### 3.2 thClaws owns only delegated execution details

Inside one admitted attempt thClaws MAY:

- reason and plan locally;
- choose approved Skills/MCP tools exposed to that run;
- read/edit files within the assigned workspace;
- execute shell commands within policy;
- spawn approved subagents/agent teams;
- browse or call approved external resources;
- run tests/builds;
- produce artifacts;
- keep a thClaws session for continuation;
- report native events and local progress.

thClaws MUST NOT independently:

- mint cross-tenant jobs;
- authorize irreversible side effects;
- spend beyond SmartAIHub/user-approved policy;
- become the canonical scheduler for SmartAIHub recurring tasks;
- settle SmartAIHub credits;
- publish production Mini Apps directly;
- replace Spec 224 Final Verify;
- write privileged SmartAIHub database state directly;
- reuse one tenant's memory/credentials/workspace for another tenant.

### 3.3 One authority rule

A thClaws schedule, loop, workflow or background agent MAY be used internally within one delegated attempt only when its effects remain subordinate to the canonical `worker_job` and bounded by an execution lease. Persistent user scheduling remains with SmartAIHub.

---

## 4. Canonical architecture

```text
Phone / Tablet / Browser / Desktop
                 |
         SmartAIHub Chat + Task Control
                 |
          Feature 196 Intent/Goal
                 |
        Skill-first Capability Resolver
                 |
        Development / Workflow Kernel
                 |
            worker_jobs (SoT)
                 |
          Placement + Harness Resolver
          /                         \
         /                           \
SMARTAIHUB CLOUD                  USER DEVICE
Cloudflare Worker                SmartAIHub Desktop/Worker
      |                                  |
Cloudflare Sandbox                      outbound secure channel
      |                                  |
thClaws --serve / CLI                   thClaws --serve on loopback
      |                                  |
shared execution contract <-------------+
      |
Model/Credential Resolver
  |          |             |
SAH Gateway User API Key   User Subscription Connector
  |                        |
providers/models           Z.ai Coding Plan / certified subscription
      |
Skills / MCP / SmartAIHub /v1/mcp
      |
Artifacts -> R2 + provenance -> Task Control
```

---

## 5. Runtime modes

### 5.1 `THCLAWS_CLOUD_SANDBOX`

Use when the user has no suitable local machine, explicitly chooses cloud, or policy/capability prefers cloud.

Required properties:

- Linux Cloudflare Sandbox/Container placement;
- one isolated runtime scope per admitted execution security boundary;
- thClaws version pinned by digest/version and verified before use;
- daemon bound only to loopback/private internal path, never a public unauthenticated port;
- runtime-scoped bearer token for `/agent/run` when server mode is used;
- `sleepAfter` chosen by workload class;
- `keepAlive=true` only while a known long-running job requires it;
- explicit `destroy()` after final checkpoint for ephemeral workloads;
- local filesystem treated as ephemeral;
- workspace/artifact/checkpoint durability through R2/Git/canonical stores;
- no permanent provider secret baked into the image.

### 5.2 `THCLAWS_LOCAL_DAEMON`

Use Windows/macOS thClaws through SmartAIHub Desktop/Worker.

Required properties:

- SmartAIHub Desktop/Worker owns pairing, device identity and remote dispatch authorization;
- thClaws binds to `127.0.0.1` or equivalent local-only interface by default;
- cloud Control Plane does not dial a user's private network directly;
- Desktop/Worker keeps an outbound authenticated channel to SmartAIHub and invokes local thClaws;
- runtime token is generated locally and never reused across unrelated device registrations;
- user's local filesystem/repository access follows explicit project/workspace grants;
- local subscription credentials MAY remain exclusively on device;
- local thClaws process can be started on demand and stopped after inactivity;
- no automatic installation/update without explicit user consent and signed-package verification.

### 5.3 `THCLAWS_LOCAL_PROCESS`

For bounded one-shot tasks, SmartAIHub Desktop/Worker MAY spawn `thclaws -p`/CLI instead of maintaining a daemon. This mode is preferred when session continuation/native streaming is not required and isolation is simpler.

### 5.4 `AUTO`

Resolver chooses cloud or local only after evaluating:

- user preference;
- online/paired local device status;
- project locality;
- required OS/toolchain/GPU/browser capability;
- data classification/residency;
- model credential availability;
- estimated compute cost;
- queue/start latency;
- required duration/interruption tolerance;
- certified runtime version.

User SHALL be able to override eligible placement unless organization policy forbids it.

---

## 6. Runtime capability discovery

Spec 259 SHALL define a thClaws adapter that maps `GET /v1/agent/info` plus SmartAIHub-side probes into the existing Capability Registry.

Example normalized profile:

```ts
interface ThClawsRuntimeCapabilityV1 {
  runtimeId: string;
  adapterVersion: string;
  thclawsVersion: string;
  placement: 'CLOUD_SANDBOX'|'WINDOWS_LOCAL'|'MACOS_LOCAL'|'LINUX_LOCAL';
  os: string;
  arch: string;
  skills: Array<{id:string; version?:string; digest?:string}>;
  mcpServers: Array<{id:string; transport:string; scope:string}>;
  models: Array<{provider:string; modelId:string; source:string}>;
  tools: string[];
  browserAvailable: boolean;
  shellAvailable: boolean;
  gitAvailable: boolean;
  nodeVersions?: string[];
  pythonVersions?: string[];
  resourceClass?: string;
  observedAt: string;
  evidenceRef: string;
}
```

Discovery is not authorization. Every run re-evaluates current policy and credential availability.

---

## 7. Harness/Model/Credential/Placement decoupling

### 7.1 `HarnessExecutionPlanV1`

```ts
interface HarnessExecutionPlanV1 {
  schemaVersion: 'sah.harness-plan.v1';
  runId: string;
  jobId: string;
  attempt: number;
  tenantId: string;
  principalRef: string;
  projectRef?: string;
  harness: 'THCLAWS'|'CODEX'|'CLAUDE_CODE'|'SMARTAIHUB_NATIVE'|'OTHER_CERTIFIED';
  placement: 'AUTO'|'CLOUD_SANDBOX'|'USER_DEVICE';
  selectedRuntimeRef?: string;
  modelSelection: {
    mode: 'AUTO'|'USER_SELECTED'|'PROJECT_PINNED'|'POLICY_PINNED';
    logicalModelRef?: string;
    resolvedProvider?: string;
    resolvedModelId?: string;
    capabilityEvidenceRef?: string;
  };
  credentialSelection: {
    source: 'PLATFORM_GATEWAY'|'USER_API_KEY'|'USER_SUBSCRIPTION'|'LOCAL_ONLY_SUBSCRIPTION';
    bindingRef?: string;
    fallbackMode: 'DENY'|'ASK_USER'|'ALLOW_PREAPPROVED_PLATFORM_CREDITS';
  };
  budgetRef: string;
  approvalPolicyRef: string;
  capabilityGrantRef: string;
  workspaceRef: string;
  idempotencyKey: string;
}
```

### 7.2 No implicit spend switch

If a user-selected subscription becomes unavailable or quota-limited, SmartAIHub MUST NOT silently switch to a platform-billed model. The fallback policy MUST be explicit.

### 7.3 No false model equivalence

Model capability must be tested as `(provider, protocol, model, harness, placement, account/region)` rather than inferred from model name alone.

---

## 8. SmartAIHub Gateway mode

Gateway mode is the default for users who choose SmartAIHub credits/platform routing.

### 8.1 thClaws configuration

Use the generic OpenAI-compatible slot when compatible:

```text
OPENAI_COMPAT_BASE_URL=<SmartAIHub runtime-scoped gateway URL>
OPENAI_COMPAT_API_KEY=<short-lived runtime token>
model=oai/<logical-or-gateway-model-id>
```

SmartAIHub SHOULD expose `/v1/models` scoped to the current principal/runtime so thClaws can discover only eligible models.

### 8.2 Gateway responsibilities

The SmartAIHub gateway retains:

- provider/model alias resolution;
- tenant/provider eligibility;
- privacy/locality policy;
- rate/budget controls;
- model health and fallback within approved policy;
- usage metering;
- provider API credentials;
- audit correlation.

### 8.3 Gateway token

The token presented to thClaws SHALL be:

- short-lived;
- audience-bound;
- tenant/job/runtime bound;
- model/capability scoped where possible;
- revocable;
- unusable as a general SmartAIHub user session.

---

## 9. User-owned API keys and subscriptions

### 9.1 Credential source classes

SmartAIHub SHALL distinguish:

1. **Platform Gateway** — provider billing belongs to SmartAIHub/platform credit policy.
2. **User API Key (BYOK)** — user supplies a provider API credential designed for API access.
3. **User Subscription Connector** — provider-specific subscription entitlement with a documented/supported connection route usable in the chosen placement.
4. **Local-only Subscription** — credential/session remains on the user's PC/Mac and is never uploaded to SmartAIHub cloud.

### 9.2 `CredentialBindingV1`

```ts
interface CredentialBindingV1 {
  bindingId: string;
  ownerPrincipalRef: string;
  tenantScope: string;
  provider: string;
  credentialClass: 'API_KEY'|'SUBSCRIPTION_API_KEY'|'OAUTH'|'LOCAL_SESSION_FILE'|'LOCAL_PROVIDER_LOGIN';
  placementPolicy: 'CLOUD_ALLOWED'|'LOCAL_ONLY'|'PROVIDER_MANAGED_ONLY';
  allowedPurposes: string[];
  modelAllowlist?: string[];
  secretRef?: string;          // server-side secret broker only
  deviceCredentialRef?: string; // opaque local reference only
  entitlementObservedAt?: string;
  entitlementExpiresAt?: string;
  termsPolicyRevision: string;
  status: 'ACTIVE'|'EXPIRED'|'REVOKED'|'NEEDS_REAUTH'|'UNVERIFIED';
}
```

### 9.3 Provider-specific certification rule

The existence of a consumer subscription does NOT imply that SmartAIHub may use it from a cloud worker. Every subscription connector requires:

- a technically supported authentication method;
- provider terms/usage review for the intended placement and product use;
- credential-storage review;
- model entitlement probe;
- rate/quota semantics;
- reauthentication/revocation handling;
- multi-tenant isolation test;
- no credential sharing across users.

### 9.4 Cloud secret handling

When a provider-certified user credential is cloud-eligible:

- encrypted secret lives in the existing Secret Broker/approved settings store;
- prefer a trusted SmartAIHub/Worker-side inference or outbound broker so arbitrary sandbox shell/code never receives the reusable provider credential;
- the sandbox receives only a short-lived SmartAIHub route/capability token where the protocol supports brokering;
- direct process-environment injection of a reusable provider secret is NOT production-certified for shell-capable cloud thClaws unless a separate isolation proof satisfies R1.2 §70;
- redact credential material from logs, events, crash dumps and artifacts;
- revoke/rotate independently of thClaws session;
- destroy any bounded runtime credential/capability at job end.

### 9.5 Local-only handling

For local subscription credentials, SmartAIHub cloud stores only an opaque device capability statement such as `provider_login_available=true`. Raw token/session files stay on the device.

---

## 10. Z.ai Coding Plan first-class connector

### 10.1 Scope

Spec 259 SHALL implement Z.ai Coding Plan as the first **technically cloud-addressable subscription connector candidate** because current provider documentation exposes a coding-specific API-key route. This is not, by itself, production authorization for delegated SaaS/cloud use. `CLOUD_ALLOWED` status is granted only after the connector passes the independent technical, entitlement, terms/commercial, privacy/residency and security gates in §58.

### 10.2 Required endpoint distinction

For **local/direct certified** Z.ai Coding Plan use, the upstream provider route is:

```text
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_API_KEY=<user-owned coding-plan API key>
```

For **SmartAIHub cloud thClaws**, the default is instead:

```text
thClaws -> SmartAIHub short-lived gateway/broker token
SmartAIHub trusted broker -> https://api.z.ai/api/coding/paas/v4
trusted broker holds/resolves the user's Z.ai binding
```

The reusable `ZAI_API_KEY` MUST NOT be injected into arbitrary shell-capable Cloud Sandbox execution under the default R1.2 policy. Do not substitute the general prepaid/resource endpoint when the user selected Coding Plan quota.

### 10.3 Model catalogue

GLM-5.3 and GLM-5.3-Flash are current examples, not hard-coded permanent IDs. Discover account-eligible models from the certified provider path where possible and cache only with expiry.

### 10.4 Billing semantics

When using the user's Z.ai Coding Plan:

- SmartAIHub MUST NOT charge platform LLM token cost as if SmartAIHub paid Z.ai;
- SmartAIHub MAY charge separately disclosed cloud runtime, platform, Skill or marketplace fees according to Spec 207;
- show `LLM billing source: Your Z.ai Coding Plan` in execution details;
- quota/rate-limit exhaustion is not an authorization to switch to SmartAIHub credits unless fallback is pre-approved.

### 10.5 Purpose restriction

Coding Plan use MUST be limited to provider-permitted coding scenarios. Non-coding tasks route through an eligible general API/gateway or another provider.

---

## 11. Local Codex subscription connector

Current thClaws documentation describes a `chatgpt-codex/*` route that can reuse authentication from the official Codex CLI on the user's machine.

Initial SmartAIHub support SHALL therefore be **local-device first**:

```text
User PC/Mac
  Codex CLI login/auth
        |
  thClaws local
        |
SmartAIHub Desktop/Worker
        |
Control Plane
```

SmartAIHub cloud MUST NOT copy `~/.codex/auth.json` or equivalent consumer-login artifacts into a Cloudflare Sandbox unless OpenAI provides a supported remote-use contract and SmartAIHub separately certifies it.

This local connector demonstrates the generic `LOCAL_ONLY_SUBSCRIPTION` pattern for future providers.

---

## 12. Future subscription connectors

A provider adapter MAY later support Claude, Gemini, OpenCodeGo or other subscription-backed access only when a provider-specific connector passes the certification rule in §9.3. Marketing plan names are not integration contracts.

---

## 13. Cloudflare Sandbox lifecycle

### 13.1 Lazy start

`getSandbox()` or the equivalent current SDK object SHOULD be acquired without forcing a container start until actual execution is admitted.

### 13.2 Workload classes

Recommended policy classes, subject to benchmark:

```text
SHORT_TASK       sleepAfter 30s-2m, destroy immediately after result/checkpoint
INTERACTIVE_DEV  sleepAfter 5m-15m, preserve active preview while user is interacting
LONG_AGENT_JOB   keepAlive=true only during active admitted work, then disable/destroy
```

### 13.3 Ephemeral-state rule

The container filesystem, process IDs and terminals are not canonical durability. Before relying on later continuation, persist:

- Git commit/patch/worktree manifest;
- dependency lock/materialization metadata where useful;
- thClaws session export/checkpoint if supported and authorized;
- task state needed to safely restart;
- test/build evidence;
- produced artifacts and hashes;
- runtime/tool versions.

### 13.4 Runtime generation

Every start/replacement receives a runtime generation. Stale callback/process/artifact events from an older generation cannot commit results.

### 13.5 Crash recovery

Recovery order:

1. fence previous attempt;
2. reconcile unknown external effects;
3. restore workspace/checkpoint from canonical storage;
4. start a fresh thClaws generation;
5. resume only if the thClaws session/checkpoint and SmartAIHub development state are mutually valid;
6. otherwise replay from the last safe deterministic boundary.

---

## 14. Cloud Development Workspace

Spec 259 SHALL define a reusable workspace abstraction consumable by thClaws, Codex, Claude Code and SmartAIHub Native Development Agent.

```ts
interface CloudDevelopmentWorkspaceV1 {
  workspaceId: string;
  tenantId: string;
  projectId?: string;
  sourceRef: string;
  baseRevision: string;
  writableBranchRef: string;
  sandboxRef?: string;
  runtimeGeneration?: number;
  artifactNamespaceRef: string;
  previewPolicyRef?: string;
  checkpointRef?: string;
  createdByRunRef: string;
  expiresAt: string;
}
```

The workspace is harness-neutral. A run MAY hand off the same canonical source state between certified harnesses after checkpoint/fencing.

---

## 15. Mini App creation without a PC

### 15.1 Required user journey

A user on mobile/tablet/browser may ask:

> Create a Mini App for appointment booking with Thai/English UI, history and AI-generated reminders.

Expected flow:

```text
Chat intent
 -> Skill-first capability discovery (Spec 256)
 -> Mini App development goal
 -> Spec 224 Development Run
 -> create Cloud Development Workspace
 -> place thClaws in Cloudflare Sandbox
 -> choose model/credential policy
 -> scaffold/edit code
 -> lint/typecheck/test/build
 -> start bounded preview
 -> return preview + diff + test evidence to Task Control
 -> user asks changes
 -> resume from checkpoint/session
 -> Final Verify
 -> explicit Publish approval
 -> existing Mini App/Product release authority deploys
```

### 15.2 thClaws does not own publish

The harness may produce build artifacts and deployment proposals. Production publication remains behind existing SmartAIHub release/tenant/domain gates.

### 15.3 Generated UI

Preview/result UI SHALL use Spec 240 safe surface rules; agent output must not bypass host authorization or turn arbitrary model output into privileged browser code.

### 15.4 Cross-product commands

When a Mini App creation task crosses Chat, Builder, Library, Media Studio or other products, use Spec 253 normalized handoff instead of product-specific ad hoc payloads.

---

## 16. Local development on user PC/Mac

A user MAY choose `Use my computer` when a paired SmartAIHub Desktop/Worker is online.

### 16.1 Advantages

- access existing local repos and toolchains;
- use local-only subscription credentials;
- avoid cloud compute for long builds;
- use local GPU/MCP tools if registered;
- maintain private source locally under user policy.

### 16.2 Device execution contract

Control Plane sends only an admitted signed job envelope. Desktop/Worker validates:

- current pairing/device epoch;
- tenant/principal/project scope;
- workspace grant;
- permitted thClaws version;
- tool/egress policy;
- model/credential binding;
- budget/approval reference;
- lease/fencing token.

Local result returns normalized events/artifacts/receipts; it does not directly mutate canonical cloud job state.

### 16.3 Offline behavior

If the device loses connection, the local runtime MAY continue only within the pre-authorized offline capability/budget window. Any consequential effect requiring fresh approval MUST park. Reconnect reconciles events idempotently.

---

## 17. thClaws native execution adapter

Define an additive adapter under the existing external-agent/managed-harness seams.

```ts
interface ThClawsAdapter {
  discoverCapabilities(runtime: RuntimeRef): Promise<ThClawsRuntimeCapabilityV1>;
  startRun(req: ThClawsRunRequestV1): Promise<ThClawsRunRef>;
  resumeRun(req: ThClawsResumeRequestV1): Promise<ThClawsRunRef>;
  streamEvents(run: ThClawsRunRef): AsyncIterable<NormalizedHarnessEventV1>;
  cancelRun(run: ThClawsRunRef, reason: string): Promise<void>;
  uploadInputs(req: InputTransferV1): Promise<InputReceiptV1>;
  collectArtifacts(run: ThClawsRunRef): Promise<ArtifactManifestV1>;
  health(runtime: RuntimeRef): Promise<RuntimeHealthV1>;
}
```

### 17.1 Preferred HTTP surface

Use `/agent/run` for native harness semantics because it can preserve thClaws tool/skill events and session continuation. Use `/v1/chat/completions` only when an OpenAI-compatible client is the actual requirement.

### 17.2 Session continuation

Store `thclaws_session_id` only as a subordinate runtime correlation. A missing thClaws session does not create a new SmartAIHub logical run; the adapter must decide whether to reconstruct safely or fail/repair.

### 17.3 Async callbacks

If `x_callback` or equivalent async mode is used, callbacks SHALL carry/resolve a signed correlation bound to job/attempt/runtime generation and be rejected when stale.

---

## 18. Native event normalization

Normalize thClaws events into the existing Task Control/worker event vocabulary:

```ts
type HarnessEventKind =
  | 'SESSION_STARTED'
  | 'PLAN_UPDATED'
  | 'TEXT_DELTA'
  | 'SKILL_SELECTED'
  | 'MCP_TOOL_CALL'
  | 'SHELL_COMMAND'
  | 'FILE_CHANGED'
  | 'TEST_STARTED'
  | 'TEST_RESULT'
  | 'APPROVAL_REQUIRED'
  | 'ARTIFACT_DECLARED'
  | 'CHECKPOINTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
```

Provider-native events MAY be preserved as opaque diagnostic payloads after secret/PII filtering, but UI/business logic should consume normalized fields.

---

## 19. Job Artifacts bridge

thClaws Job Artifacts provide frozen file snapshots and SHA-256 manifests. Spec 259 SHALL map them into SmartAIHub canonical artifacts.

```text
thClaws artifact snapshot
 -> verify path/size/hash against manifest
 -> malware/content/policy scan where required
 -> register R2 object
 -> create canonical artifact metadata/provenance
 -> attach to worker_job/development run
 -> expose through Task Control/Library
```

The `.thclaws/state/artifacts` directory is not SmartAIHub durable storage.

---

## 20. Skill-first integration

thClaws supports Skills and MCP, but SmartAIHub's generic capability experience remains governed by Specs 248/256.

Execution order:

1. SmartAIHub resolves intent and eligible Skill/capability set.
2. Runtime adapter projects only approved Skills/MCP endpoints to thClaws.
3. thClaws may choose among that bounded set during execution.
4. Skill/version/digest selections are recorded in the run manifest.
5. A thClaws-local unregistered Skill cannot silently gain SmartAIHub marketplace trust.

Local users MAY have private thClaws Skills. They are advertised as device-private capabilities and require project/user consent before remote dispatch can rely on them.

---

## 21. SmartAIHub MCP bridge

thClaws MAY call SmartAIHub `/v1/mcp` with a job-scoped principal to use existing platform capabilities such as media generation, Library, search or specialized tools.

The MCP token SHALL NOT equal the user's normal web session token. Tool exposure is derived from the admitted job, not from thClaws asking for arbitrary tools.

Bidirectional use is permitted:

```text
SmartAIHub -> thClaws harness
thClaws -> SmartAIHub MCP capabilities
```

without creating circular authority: all paid/destructive effects still pass existing policy/approval/billing gates.

---

## 22. Browser/computer-use placement

thClaws browser capability is an execution offer under the existing computer-use architecture, not a second global browser authority. Resolver chooses among Cloud Browser, local browser, Playwright/DOM executors, thClaws browser or other certified backends according to Spec 208/213 compatibility and current placement policy.

---

## 23. Approval bridge

When thClaws reaches an action requiring approval:

1. execution emits `APPROVAL_REQUIRED` with normalized proposed effect;
2. SmartAIHub parks the job step;
3. Chat/Task Control presents existing approval UX;
4. canonical approval service issues a bounded grant;
5. adapter resumes thClaws with a one-time capability/continuation token or equivalent safe mechanism;
6. result is reconciled with idempotency/fencing.

`permissions=auto` inside thClaws MUST NOT override SmartAIHub high-risk action policy.

---

## 24. Security and tenant isolation

### 24.1 Cloud isolation

Default cloud mode is per execution/security scope, not one permanent shared thClaws daemon for every tenant. Pooling is allowed only after a separate isolation certification proving no session/filesystem/credential/Skill/KMS leakage.

### 24.2 Local isolation

Workspace allowlist and OS-user boundary are explicit. SmartAIHub cannot assume the entire user's home directory is authorized because thClaws runs under that OS account.

### 24.3 Egress

Cloud Sandboxes use a bounded egress policy where supported. Sensitive provider/API/MCP destinations should be allowlisted by capability plan. Local egress follows device policy and organization restrictions.

### 24.4 Prompt injection

Browser/document/tool content is untrusted. thClaws output never directly grants permission, changes tenant, expands tool allowlist or bypasses approval.

### 24.5 Secrets

No secret may appear in:

- thClaws prompt text;
- Git changes;
- artifacts;
- Task Control transcript;
- shell command logging unless redacted;
- R2 workspace snapshot;
- preview URL/query string.

---

## 25. Workspace persistence and portability

Canonical durable development state SHALL be representable without requiring a still-running thClaws process:

```ts
interface DevelopmentCheckpointV1 {
  checkpointId: string;
  runId: string;
  jobId: string;
  sourceRevision: string;
  patchArtifactRef?: string;
  workspaceSnapshotRef?: string;
  harness: string;
  harnessVersion: string;
  harnessSessionRef?: string;
  runtimeGeneration: number;
  modelRouteRef: string;
  credentialBindingClass: string;
  completedSteps: string[];
  pendingStep?: string;
  testEvidenceRefs: string[];
  artifactRefs: string[];
  createdAt: string;
}
```

Moving a task cloud <-> local requires a new placement decision, compatible source/checkpoint and explicit credential re-resolution. Raw cloud credentials never migrate to local or vice versa by implication.

---

## 26. Model selection UX

User-facing controls SHALL offer:

### Model
- `Auto — Recommended`
- eligible named models from SmartAIHub Model Registry

### Runtime
- `Auto`
- `SmartAIHub Cloud`
- `My Computer` when a capable paired device is online

### LLM billing/access source
- `SmartAIHub Credits`
- `My API Key`
- `My Subscription`

The UI displays only valid intersections. Example:

```text
GLM-5.3-Flash + My Z.ai Coding Plan + SmartAIHub Cloud   AVAILABLE
Codex subscription + My Computer                         AVAILABLE when local auth present
Codex local subscription + SmartAIHub Cloud              UNAVAILABLE until certified remote connector exists
```

Advanced users MAY pin a project default. Organization policy can restrict choices.

---

## 27. Automatic routing and escalation

`AUTO` mode MAY choose a low-cost model such as a certified Flash/coding model for routine work, then escalate after objective failure signals.

Escalation triggers SHOULD use:

- test failure after bounded repair attempts;
- unsupported capability;
- context/tool limit;
- deterministic verifier failure;
- provider outage/quota exhaustion subject to fallback policy;
- explicit user request.

Do not use an LLM's self-reported confidence as the sole trigger.

A model escalation may keep thClaws as the harness. A harness escalation may keep the same model if the provider/protocol permits. These decisions are independent.

---

## 28. Cost model

Spec 207 remains billing authority. Spec 259 adds usage dimensions:

```text
cloud_compute_seconds
sandbox_resource_class
artifact_storage_bytes
skill_fee
marketplace_fee
platform_service_fee
llm_platform_tokens
llm_user_owned=true|false
provider_subscription_ref (opaque)
```

### 28.1 User-owned subscription

User-owned model quota is not re-priced as platform model tokens. Any platform/runtime fee must be separately disclosed.

### 28.2 Cloud runtime

Container/Sandbox cost is metered only while provisioned/active according to current Cloudflare billing and internal accounting. Lifecycle policy should favor scale-to-zero.

### 28.3 Local runtime

SmartAIHub may charge product/marketplace/service fees according to plan, but must not represent the user's own electricity/compute or subscription quota as SmartAIHub provider cost.

---

## 29. Preview security for cloud-developed Mini Apps

Preview URLs are temporary review surfaces, not production deployments.

Requirements:

- unpredictable, time-bounded access token or authenticated proxy;
- tenant/run binding;
- no provider secrets in preview environment;
- outbound API calls go through scoped SmartAIHub dev credentials;
- preview cannot mutate production database unless explicitly using an approved dev/test API;
- CORS/CSP/cookie isolation;
- automatic teardown after expiry;
- screenshots/logs may be captured as verification artifacts after privacy filtering.

---

## 30. Release and Final Verify

A successful thClaws run is never equivalent to software completion.

For development work:

```text
thClaws completed
 -> source/artifact reconciliation
 -> required tests/build/security checks
 -> Spec 224 review/verify/recovery gates
 -> Final Verify
 -> explicit release/publish path
```

No harness may bypass final verification because its own tool reported success.

---

## 31. Thai-native extension

Spec 259 SHOULD expose thClaws Thai-oriented capabilities as discoverable runtime features where certified, including Thai LLM providers and Thai-specific Skills. Thai PII or language helpers must still follow SmartAIHub tenant-isolated privacy rules; process-global or cross-session mappings are prohibited.

This section does not make thClaws the canonical Thai intelligence owner; later Thai-specific platform services may provide shared normalized capability.

---

## 32. Local installation/update management

SmartAIHub Desktop MAY offer one-click installation of a supported thClaws build after explicit consent.

Required controls:

- obtain binary only from approved source/release channel;
- verify published digest/signature when available;
- record version/arch/source digest;
- support Windows x86_64/ARM64 and macOS arm64/x86_64 according to upstream availability;
- do not replace a user-managed installation without consent;
- allow `Managed by SmartAIHub` and `Use existing installation` modes;
- rollback to last certified version;
- block versions with known critical vulnerability/incompatibility.

---

## 33. Cloud runtime image/binary management

Cloud runtime SHALL use a reproducible thClaws package/image manifest:

```ts
interface ThClawsRuntimeImageManifestV1 {
  manifestId: string;
  thclawsVersion: string;
  upstreamSource: string;
  binaryOrImageDigest: string;
  baseRuntimeDigest: string;
  adapterVersion: string;
  sandboxSdkVersion: string;
  allowedArchitectures: string[];
  certificationRef: string;
  createdAt: string;
  revokedAt?: string;
}
```

A `latest` tag is never production admission evidence.

---

## 34. Observability

Every run emits common correlation fields:

```text
trace_id
run_id
worker_job_id
attempt
route_generation
runtime_generation
harness=thclaws
thclaws_version
placement
model_logical_ref
provider
credential_source_class
skill_refs
mcp_profile_ref
workspace_ref
checkpoint_ref
artifact_manifest_ref
```

Never log raw prompts/files by default for sensitive workloads. Use redacted structured events and explicit debug opt-in.

Key metrics:

- sandbox cold-start/wake latency;
- thClaws bootstrap latency;
- agent first-event latency;
- success/failure/cancel rate;
- session-resume success;
- artifact hash mismatch;
- stale-callback rejection;
- cloud active minutes per successful job;
- model/provider cost and user-owned share;
- local-device availability;
- Mini App preview-to-publish conversion;
- escalation/fallback rate;
- approval wait time.

---

## 35. Failure taxonomy

Use normalized codes at minimum:

```text
THCLAWS_VERSION_UNCERTIFIED
THCLAWS_BOOT_FAILED
THCLAWS_AGENT_ENDPOINT_UNAVAILABLE
THCLAWS_SESSION_NOT_FOUND
THCLAWS_CAPABILITY_MISMATCH
RUNTIME_START_TIMEOUT
RUNTIME_GENERATION_STALE
WORKSPACE_RESTORE_FAILED
WORKSPACE_CHECKPOINT_FAILED
ARTIFACT_HASH_MISMATCH
MODEL_NOT_ELIGIBLE
USER_CREDENTIAL_REAUTH_REQUIRED
SUBSCRIPTION_QUOTA_EXHAUSTED
SUBSCRIPTION_CLOUD_NOT_ALLOWED
GATEWAY_TOKEN_EXPIRED
LOCAL_DEVICE_OFFLINE
LOCAL_WORKSPACE_NOT_AUTHORIZED
APPROVAL_REQUIRED
PROVIDER_SIDE_EFFECT_UNKNOWN
FINAL_VERIFY_FAILED
```

Failures are visible in Task Control with user-actionable resolution when appropriate.

---

## 36. Cancellation

Cancellation is cooperative first, fenced second.

1. mark canonical cancellation requested;
2. deny new side effects using current job/lease generation;
3. ask thClaws/runtime to stop;
4. collect safe partial artifacts/checkpoint when policy allows;
5. settle/release resources;
6. destroy cloud runtime if not reused;
7. reconcile unknown provider effects.

A killed container is not proof that external API side effects did not occur.

---

## 37. Data retention and deletion

Runtime scratch state follows short TTL. Durable source/artifacts follow existing project/Library retention policy. thClaws local KMS/session data MUST NOT silently become SmartAIHub cloud memory. Importing it requires explicit scope/consent and the normal memory/document ingestion path.

On account/project revocation:

- stop admission;
- revoke runtime/gateway tokens;
- delete eligible Cloud workspaces/checkpoints according to policy;
- revoke provider bindings;
- instruct local device to remove managed runtime grants;
- preserve minimum required audit evidence without secrets/source content.

---

## 38. Multi-tenant isolation tests

Production cloud admission requires adversarial tests proving:

- Tenant B cannot address Tenant A sandbox/workspace/session/artifact;
- thClaws `/agent/run` cannot select an arbitrary `workspace_dir` outside its assigned root;
- stale runtime token cannot call SmartAIHub Gateway/MCP;
- uploaded input paths cannot traverse outside allowed prefixes;
- artifact collection cannot exfiltrate `.git`, secret files or another run;
- one user's subscription credential never appears in another runtime;
- one run's Skills/MCP config is not inherited by an unrelated run;
- preview URLs do not cross tenant scope.

---

## 39. Subscription connector conformance suite

Each connector must pass:

1. connect/reauth/revoke;
2. entitlement/model discovery;
3. allowed placement verification;
4. secret redaction;
5. quota exhaustion behavior;
6. no unapproved billing fallback;
7. account switch isolation;
8. provider endpoint/protocol correctness;
9. cancellation/retry behavior;
10. terms/purpose policy evidence;
11. device loss/revocation handling if local;
12. audit without credential leakage.

---

## 40. Cloud thClaws conformance suite

Minimum tests:

- bootstrap pinned thClaws in Sandbox;
- `/v1/agent/info` capability discovery;
- `/agent/run` sync/streaming;
- async callback stale-generation rejection;
- session continuation;
- input upload path restrictions;
- artifact manifest/hash registration;
- Sandbox idle stop + restore from checkpoint;
- `keepAlive` long job then guaranteed cleanup;
- crash during file write/test/tool call;
- Gateway model selection;
- Z.ai Coding Plan execution with test account;
- no secret in workspace/artifacts/logs;
- cross-tenant denial;
- Mini App scaffold/build/preview without local PC;
- Final Verify gate cannot be bypassed.

---

## 41. Windows/macOS local conformance suite

Run independently on:

- Windows x86_64;
- Windows ARM64 when available in supported beta hardware;
- macOS Apple Silicon;
- macOS Intel while upstream support remains certified.

Verify:

- install/discovery/version pin;
- loopback-only daemon;
- outbound Worker channel;
- local repo authorization;
- shell/tool execution;
- local-only credential does not leave device;
- local Codex subscription connector where configured;
- Gateway mode from local thClaws;
- SmartAIHub MCP call from local thClaws;
- offline bounded execution/reconcile;
- cancel/revoke/device unpair;
- artifact upload and hash;
- no public port requirement.

---

## 42. End-to-end Mini App acceptance scenario

A release candidate SHALL pass the following with the user controlling only a phone/tablet/browser:

1. user requests a new Mini App in Chat;
2. Skill-first resolver selects the approved Mini App development capability;
3. Development Run is created;
4. no local computer is paired;
5. Cloud Sandbox wakes and launches certified thClaws;
6. user chooses `GLM-5.3-Flash / My Z.ai Coding Plan` or an eligible Gateway model;
7. code is scaffolded and modified;
8. tests/build succeed;
9. secure preview opens on user's mobile device;
10. user requests a revision;
11. same logical development run resumes safely after a sleep/restart boundary;
12. artifacts/diff/test evidence appear in Task Control;
13. Spec 224 Final Verify passes;
14. user explicitly approves publish;
15. existing Mini App release system publishes;
16. Sandbox is destroyed and no provider secret remains.

---

## 43. Database/schema guidance

Prefer extending existing generic tables before creating thClaws-specific business tables.

Likely additive concepts:

- `execution_runtime_bindings` — runtime/harness instance correlation;
- `user_provider_credential_bindings` — encrypted/opaque credential metadata;
- `development_workspace_checkpoints` — durable checkpoint refs;
- provider/model entitlement observations;
- runtime certification registry.

Do NOT create:

- `thclaws_jobs` as a parallel job ledger;
- `thclaws_credits`;
- `thclaws_approvals`;
- a duplicate global Skill registry;
- a duplicate assistant memory table.

Exact migrations require repository/schema audit in P259.0.

---

## 44. Internal API contracts

Suggested internal routes/services, names adjustable to repository conventions:

```text
POST /internal/execution/harness/resolve
POST /internal/execution/thclaws/start
POST /internal/execution/thclaws/resume
POST /internal/execution/thclaws/cancel
GET  /internal/execution/thclaws/:runtimeId/capabilities
POST /internal/execution/thclaws/:runId/input
GET  /internal/execution/thclaws/:runId/artifacts
POST /internal/execution/thclaws/callback

GET  /v1/models                 # existing/gateway-compatible scoped catalogue
POST /v1/provider-bindings      # existing provider-account domain if available
POST /v1/provider-bindings/:id/verify
DELETE /v1/provider-bindings/:id
```

Public naming must reuse existing provider/settings APIs where they already exist.

---

## 45. UX requirements

### 45.1 Chat/Task Control execution card

Display:

- task/status;
- harness: thClaws;
- execution location: SmartAIHub Cloud / My PC / My Mac;
- model;
- billing/access source;
- active Skills/tools;
- budget estimate/actual where applicable;
- current stage;
- approvals requested;
- artifacts/preview;
- stop button;
- `Move future work to Cloud/My Computer` preference where eligible.

### 45.2 Settings

Add provider/model accounts without exposing raw secrets after save:

```text
Model Accounts
  SmartAIHub Credits
  Z.ai Coding Plan     Connected / Re-auth required
  API Keys             ...
  Local subscriptions  Available on <device name>
```

### 45.3 Developer advanced view

May show runtime IDs, versions, logs, checkpoint, model route and usage, subject to permission.

---

## 46. Feature flags and rollout

All new paths default OFF.

Recommended rollout:

### P259.0 — Repository and contract reconciliation
- verify spec numbering and current implementation state;
- inspect Spec 200/224 extension seams, Worker App protocol, model settings/schema, Cloudflare Sandbox versions;
- inventory existing BYOK/subscription credential handling;
- produce no production change.

### P259.1 — Adapter core
- implement thClaws capability discovery/native run/event normalization behind fake/local fixtures;
- no paid provider required.

### P259.2 — Local Windows/macOS pilot
- integrate Desktop/Worker loopback runtime;
- user-managed install first;
- Gateway model path;
- local-only credential class.

### P259.3 — Cloud Sandbox POC
- pinned thClaws bootstrap;
- scale-to-zero lifecycle;
- checkpoint/artifact bridge;
- no production users.

### P259.4 — Model/Credential Resolver
- explicit four-dimensional plan;
- SmartAIHub Gateway;
- BYOK and secret broker;
- no silent billing fallback.

### P259.5 — Z.ai Coding Plan pilot
- test-user credential;
- coding endpoint correctness;
- GLM entitlement discovery;
- quota handling.

### P259.6 — Cloud Mini App development
- Chat -> Development Run -> thClaws -> build/test/preview -> Final Verify;
- mobile/tablet validation.

### P259.7 — Closed beta
- allowlisted beta tenants/users;
- measured cost/cold-start/recovery/security;
- local and cloud side-by-side.

### P259.8 — Production admission
- only after all production gates below pass.

---

## 47. Production admission gates

### G259.1 Authority
No duplicate job/approval/billing/scheduler authority; ownership matrix reviewed.

### G259.2 Cloud isolation
Cross-tenant and runtime-generation adversarial tests pass.

### G259.3 Local security
No inbound public port required; device/workspace grants and revocation verified.

### G259.4 Credential security
Cloud/local secret handling, redaction, reauth and deletion verified.

### G259.5 Subscription policy
Each enabled subscription connector has provider-specific technical and terms evidence.

### G259.6 Model routing
User choice/Auto/pinned behavior and no-unapproved-spend fallback tested.

### G259.7 Durability
Sandbox sleep/replacement does not lose canonical development progress beyond declared checkpoint boundary.

### G259.8 Artifacts
Hash/provenance/tenant registration passes.

### G259.9 Development correctness
Spec 224 Final Verify remains mandatory and demonstrated.

### G259.10 Mini App cloud-only journey
Phone/tablet-only creation/revision/preview flow passes.

### G259.11 Cost
Cloud compute lifecycle and model-source metering are observable; no indefinite `keepAlive` leaks.

### G259.12 Rollback
Disable flags returns system to prior harness set without corrupting in-flight canonical jobs.

---

## 48. Benchmark requirements

Before default-enabling thClaws Cloud, measure at minimum:

- sandbox wake/cold start p50/p95;
- thClaws bootstrap p50/p95;
- baseline RAM/CPU by workload;
- idle/sleep timing;
- restore/checkpoint duration;
- one-turn and multi-turn `/agent/run` latency;
- tool-heavy coding run resource usage;
- 2/4/8 subagent concurrency where certified;
- dependency installation cache effectiveness;
- preview startup latency;
- artifact transfer throughput;
- Z.ai/Central Gateway token and wall-clock cost for representative Mini App tasks;
- quality benchmark vs current Codex/Claude harness baselines without declaring permanent winner.

Routing policy may use benchmark data, but it MUST NOT hard-code a permanent subjective ranking of providers; selection remains workload-, evidence- and policy-dependent.

---

## 49. Rollback strategy

Rollback levels:

1. **Model route rollback** — keep thClaws, change eligible model source for new calls.
2. **Credential-source rollback** — require user choice before switching from user-owned to platform billing.
3. **Harness rollback** — route new development steps to Codex/Claude/SmartAIHub Native; checkpoint and fence thClaws attempt first.
4. **Placement rollback** — cloud -> local or local -> cloud only at safe checkpoint.
5. **Feature rollback** — disable Spec 259 flags; existing canonical runs/jobs/artifacts remain understandable.

No rollback may revive an old fenced runtime generation.

---

## 50. Cross-spec ownership deltas

### Spec 231 — LLM Routing
Add credential-source-aware model eligibility and subscription-backed model routes. Spec 231 chooses model/provider/reasoning; it does not choose thClaws-specific filesystem/session details.

### Spec 239 — External Personal Agent Interoperability
Clarify thClaws is primarily a self-hostable/local/cloud harness runtime, not a provider-hosted personal-agent product. Personal-agent interop remains 239; thClaws execution belongs to 259/243/200 seams.

### Spec 240 — Agent-Generated UI
Add Cloud Development preview/result surfaces and Mini App creation progress cards; no executable agent UI authority.

### Spec 242 — Cloudflare Native Agent & Sandbox
Add thClaws as a certified Sandbox workload profile. Sandbox lifecycle/isolation remains 242; thClaws protocol/model/subscription semantics remain 259.

### Spec 243 — Managed Cloud Agent & Hosted Harness
Add `THCLAWS_SELF_HOSTED_CLOUD` and `THCLAWS_USER_DEVICE` as managed/self-hosted harness profiles. Spec 243 keeps generic hosted-harness normalization; Spec 259 owns thClaws-specific details.

### Spec 245 — Cloudflare Migration
Cloud thClaws becomes optional target compute, never a migration prerequisite. No Debian retirement gate may depend on thClaws unless the corresponding workload is explicitly migrated and certified.

### Spec 248 — MCP Skills Extension
thClaws may consume/project certified Skills; no assumption that native thClaws Skills equal SEP-2640 wire conformance.

### Spec 253 — Universal Product Command
Add normalized `DEVELOP_MINI_APP`/development handoff payload that may resolve to thClaws without exposing harness-specific fields to product callers.

### Spec 256 — Skill-First Intent
Add thClaws runtime/Skill projection as an execution option after Skill-first capability resolution. thClaws cannot bypass SmartAIHub Skill selection/explainability.

### Spec 224 — Development Orchestrator
No edits. Consume existing external execution/workspace seams; preserve Plan -> Implement -> Test -> Debug -> Review -> Verify -> Recovery -> Final Verify authority.

### Specs <=213
No retroactive edits. Record compatibility improvements only.

---

## 51. Implementation checklist

- [ ] Verify Spec 259 number in canonical repository.
- [ ] Pin supported thClaws version and digests.
- [ ] Implement `ThClawsAdapter` native run path.
- [ ] Normalize capability discovery.
- [ ] Implement runtime-scoped API token.
- [ ] Implement Cloud Sandbox lifecycle adapter/profile.
- [ ] Implement local Desktop/Worker loopback profile.
- [ ] Implement Workspace checkpoint/restore.
- [ ] Implement Job Artifact bridge.
- [ ] Implement SmartAIHub Gateway provider mode.
- [ ] Add scoped `/v1/models` catalogue path if not already present.
- [ ] Implement credential-source model.
- [ ] Implement BYOK binding via existing Secret Broker.
- [ ] Implement local-only subscription binding.
- [ ] Implement Z.ai Coding Plan connector and endpoint checks.
- [ ] Implement local Codex subscription profile without cloud token copying.
- [ ] Add UI selectors: Model / Runtime / Access Source.
- [ ] Add no-silent-billing-fallback policy.
- [ ] Add Skill/MCP projection.
- [ ] Add approval bridge.
- [ ] Add Mini App development Skill/profile.
- [ ] Add secure preview.
- [ ] Preserve Spec 224 Final Verify.
- [ ] Add telemetry/cost accounting.
- [ ] Add cross-tenant/security tests.
- [ ] Add Windows/macOS tests.
- [ ] Add Cloud scale-to-zero tests.
- [ ] Run closed beta before production.

---

## 52. Definition of Done

Spec 259 is complete only when all of the following are proven in a production-like environment:

1. SmartAIHub can dispatch an admitted task to thClaws in Cloudflare Sandbox and on a paired Windows/macOS device through one normalized contract.
2. User can select an eligible model or use Auto.
3. SmartAIHub Gateway works as the default centralized model path.
4. User-owned API key path works without secret leakage.
5. At least one cloud-eligible subscription connector is certified; initial target is Z.ai Coding Plan.
6. At least one local-only subscription connector is certified; initial target is local Codex subscription reuse where upstream behavior remains supported.
7. Subscription failure never silently incurs SmartAIHub LLM charges without the user's chosen fallback policy.
8. Cloud runtime scales to zero/sleeps/destroys without losing canonical checkpointed progress.
9. Local runtime requires no inbound public port and respects device/workspace grants.
10. thClaws session/artifact events reconcile to `worker_jobs` and canonical R2 artifacts with fencing/hash evidence.
11. User can create and revise a Mini App from phone/tablet/browser without a local computer.
12. thClaws success cannot bypass Spec 224 Final Verify or existing publish approval.
13. Tenant isolation, cancellation, revocation, crash recovery and rollback tests pass.
14. Cost and credential source are visible and auditable per run.
15. Disabling all Spec 259 flags restores the previous supported execution paths without orphaning canonical state.

---

## 53. Non-goals

This specification does not require:

- replacing Codex or Claude Code;
- proving thClaws is universally better than another harness;
- running thClaws 24/7 for every user;
- moving all development to Cloudflare;
- importing every thClaws Skill/plugin into SmartAIHub Marketplace;
- proxying every consumer AI subscription;
- sharing one personal subscription among SmartAIHub users;
- making local user files available to cloud jobs by default;
- allowing arbitrary custom Docker images or unreviewed plugins in production;
- turning preview environments into permanent hosting.

---

## 54. Strategic result

After implementation, SmartAIHub gains an **Elastic Agent Compute + Cloud Development Workspace** in which thClaws is a routine execution harness alongside Codex, Claude Code and SmartAIHub Native Agent. Users may work entirely from mobile/tablet/browser, use SmartAIHub-provided models or their own eligible API/subscription access, and choose between SmartAIHub Cloud and their own PC/Mac without changing the product-level workflow.

The durable competitive asset is not thClaws alone; it is the SmartAIHub control plane that can resolve intent -> Skill -> harness -> model -> credential source -> execution placement -> verification -> product artifact under one tenant-aware, billable, auditable contract.


---

# R1.1 Ten-Pass Cross-Spec Hardening Amendment — 2026-09-29

> **Precedence:** Sections 55–68 are the latest additive hardening requirements for Spec 259 and supersede any earlier wording that is less restrictive on managed-runtime persistence, cloud subscription eligibility, cloud image architecture, upstream upgrades, child-agent delegation, callback/preview networking, workspace concurrency, credential persistence or resource limits. This remains a design specification: no production certification is implied.

## 55. Ten-pass audit outcome and gap disposition

The R1.1 audit reviewed Spec 259 together with current Spec 231, 239, 240, 242, 243, 245, 248, 250, 253 and 256 design surfaces. The following ten independent review lenses were applied:

| Pass | Review lens | Gap found | R1.1 disposition |
|---|---|---|---|
| 1 | Authority / nested autonomy | thClaws persistent schedule, auto-learn, plugin/catalog, child agents could outlive or expand an admitted job | Managed Runtime Policy Profile + attenuated child grants |
| 2 | Cloud lifecycle / image | Missing explicit `linux/amd64`, readiness, orphan cleanup and backup-generation rules | Cloud image & lifecycle hardening |
| 3 | Windows/macOS local runtime | Missing path-canonicalization, symlink/junction escape, public-bind detection and power/restart recovery | Local Device Security Profile |
| 4 | User subscription / secrets | Technical API reachability could be mistaken for cloud-use permission; injected secrets could be persisted by harness settings | Independent eligibility axes + Credential Use Lease + persistence scan |
| 5 | Model/gateway fidelity | Generic OpenAI-compatible routing can lose provider-native features; model aliases can drift across retries | Protocol-fidelity evidence + immutable route snapshot |
| 6 | Coding correctness / concurrency | Multiple agents/harnesses could edit the same worktree; dependency install is a supply-chain boundary | Worktree writer lease + dependency execution policy |
| 7 | Skills/MCP/plugins | Native Skill/plugin installation could become global/unreviewed; MCP OAuth state can leak into snapshots | Per-run projection + package integrity + token isolation |
| 8 | Callback/preview/network | Agent-supplied callback or preview networking can create SSRF/token-exfiltration paths | Fixed callback ingress + SSRF/preview origin controls |
| 9 | Cost/runaway execution | Missing hard caps on child agents, runtime duration, egress/artifact volume and orphan `keepAlive` | Resource envelope + cost reservation + kill switch |
| 10 | Upstream evolution / DR | thClaws state/workspace formats can migrate across releases; downgrade/recovery semantics were incomplete | State-format migration gate + backup/rollback compatibility matrix |

A review pass may confirm existing controls while still identifying one narrower missing production invariant. Every gap above is incorporated into the normative sections below and corresponding cross-spec amendments.

## 56. Managed Runtime Policy Profile and bounded nested autonomy

SmartAIHub-managed thClaws instances SHALL start from a **deny-by-default managed profile** rather than from an unrestricted personal-desktop profile.

### 56.1 Persistent thClaws features

Unless explicitly enabled by a separately admitted capability, managed cloud runs MUST disable or block creation/use of:

- persistent thClaws schedules/cron/daemon jobs;
- auto-learning or background memory consolidation that survives the job scope;
- global/user-level Skill or plugin installation;
- publishing to a public thClaws catalogue/cloud service;
- Telegram/LINE/Messenger or other messaging bridges;
- public GUI Shell sharing or public `--serve` binding;
- arbitrary global MCP configuration inherited from a base image;
- cross-project KMS or agent workspace reuse.

Local personal mode MAY expose such features only under explicit device/user policy. Their presence never gives SmartAIHub job authority.

### 56.2 Child agents / teams

Every thClaws subagent, agent-team member or internal workflow inherits an **attenuated child capability grant** from the parent attempt. A child MUST NOT expand:

- tenant/project/workspace scope;
- tool/MCP/Skill allowlist;
- egress destinations;
- credential sources;
- approval level;
- compute/model budget;
- external side-effect authority.

The parent plan SHALL specify `maxChildAgents`, `maxParallelChildren`, `childBudgetCeiling`, `maxChildDepth` and aggregate wall-clock/token/tool-call ceilings. Child execution IDs are subordinate correlation IDs to the same canonical run/job family unless Spec 224 deliberately admits a separate physical job.

### 56.3 Native organization policy as defense in depth

Where the pinned thClaws build supports signed organization policy, SmartAIHub MAY compile a signed managed policy to force the approved model gateway, restrict plugins/MCP/tool permissions, disable remote surfaces and emit payload-minimized audit. This is a **second enforcement layer**, never the canonical SmartAIHub authorization source. Failure to load/verify a required managed policy is a fail-closed runtime-start error.

## 57. Cloud image, readiness, persistence and cleanup hardening

### 57.1 Cloudflare architecture and headless artifact

Current Cloudflare Containers require `linux/amd64`. A production image SHALL therefore:

- contain an amd64-compatible pinned thClaws release or reproducible build;
- prefer a headless/server-safe artifact/image and prove all runtime shared libraries are present;
- pin the full image digest, base image digest and thClaws digest; never admit `latest`/`edge` tags;
- run as a non-root user where the thClaws/runtime/toolchain combination permits it, or document and mitigate any required root boundary;
- record SBOM, licenses, vulnerability-scan evidence and build provenance.

### 57.2 Readiness barrier

`container started` is not `runtime ready`. Admission MUST wait for a bounded readiness sequence:

1. container generation established;
2. managed policy/config materialized;
3. runtime-scoped `THCLAWS_API_TOKEN` or equivalent endpoint auth active;
4. thClaws daemon bound only to internal/loopback interface;
5. `/v1/agent/info` and a non-mutating health probe pass;
6. reported version/capabilities match the certified manifest;
7. workspace root and credential class match the execution plan.

No prompt or input asset may be delivered before readiness passes.

### 57.3 Backup/restore generation

Cloudflare Sandbox directory backup/restore or R2-mounted persistence MAY accelerate recovery, but restored bytes are untrusted until their manifest, tenant scope, source revision, checkpoint digest and runtime generation are revalidated. Restoring the same Sandbox ID does not restore old process/terminal identity.

### 57.4 Orphan sweeper and capacity guard

A periodic reconciler SHALL find runtimes that are `RUNNING/keepAlive` without a live canonical lease, terminal jobs with remaining containers, and Sandboxes beyond their TTL. It SHALL fence work, snapshot only policy-allowed state, destroy the runtime and emit an incident/cost event. Account/tenant `max_instances` and concurrency ceilings must be enforced before Sandbox creation.

## 58. Credential Use Lease and independent subscription eligibility axes

### 58.1 Four independent gates

A subscription/API connector is cloud-eligible only when **all** applicable gates pass independently:

1. `TECHNICAL_SUPPORTED` — protocol/auth actually works;
2. `ENTITLEMENT_VALID` — the current account/plan/model permits use;
3. `TERMS_COMMERCIAL_ALLOWED` — intended delegated product/cloud/end-user use is allowed for that credential/plan;
4. `SECURITY_PRIVACY_ALLOWED` — credential storage, data treatment, residency and tenant policy pass.

A connector MUST NOT infer gate 3 from gate 1. Provider terms/policy evidence has an owner, review date, source and expiry/recheck date.

### 58.2 Z.ai Coding Plan status

The documented coding endpoint and API-key flow establish a strong **technical integration candidate**. Production `CLOUD_ALLOWED` status still requires recorded terms/commercial and privacy/security approval for the exact SmartAIHub use case and plan. The coding endpoint remains restricted to coding scenarios; general tasks MUST use an eligible general route.

### 58.3 `CredentialUseLeaseV1`

Long-lived provider credentials SHALL be transformed at dispatch into the narrowest possible runtime use lease/reference:

```ts
interface CredentialUseLeaseV1 {
  leaseId: string;
  bindingRef: string;
  tenantId: string;
  principalRef: string;
  jobId: string;
  attempt: number;
  runtimeGeneration: number;
  provider: string;
  allowedPurpose: string;
  allowedModels?: string[];
  placement: 'CLOUD_SANDBOX'|'USER_DEVICE';
  issuedAt: string;
  expiresAt: string;
  securityEpoch: number;
}
```

The raw secret is resolved only by the trusted broker boundary. For cloud shell-capable execution, that boundary remains outside the untrusted Sandbox whenever a brokered protocol path is available. The raw secret MUST NOT be serialized into the lease, run plan, callback URL, Task Control, checkpoint or artifact manifest.

### 58.4 Prevent harness-side secret persistence

Because thClaws can persist settings/session/MCP state, a managed cloud profile MUST use an isolated ephemeral config/home and MUST verify after execution that injected provider/MCP credentials were not written into project `.thclaws` data, KMS, session JSONL, Git changes, backup snapshot or artifacts. OAuth refresh tokens and browser/session cookies follow the same rule. A persistence scan failure blocks checkpoint promotion and triggers credential rotation/revocation where warranted.

## 59. Model protocol fidelity and immutable route snapshots

### 59.1 Gateway compatibility is capability-specific

A generic OpenAI-compatible gateway route is eligible only for features that its tested protocol path preserves. Tool calling, streaming, multimodal inputs, structured outputs, reasoning controls, prompt caching, context limits and provider-specific events MUST be represented in capability evidence. When generic routing would lose a required feature, the resolver must use a certified native/direct adapter or declare the capability unavailable.

### 59.2 `ResolvedInferenceRouteV1`

Before an admitted model call, persist a non-secret resolution snapshot containing at minimum:

```text
logical_model_ref
resolved_provider
resolved_model_id_or_version
protocol_profile
credential_source_class
credential_binding_ref (opaque)
account/region entitlement evidence
pricing/quota observation ref
capability evidence ref
fallback policy
route epoch
```

Retries/recovery MUST use this snapshot or create an explicit new route generation. A provider alias that later points to a different model is not silent replay equivalence.

### 59.3 Stream commit

After user-visible streaming or a consequential tool decision has begun, provider/model/credential source cannot silently change within the same attempt. Escalation requires a clearly bounded new attempt/generation with preserved provenance.

## 60. Git/worktree concurrency, source ownership and environment reproducibility

### 60.1 Single writer per worktree

Only one admitted writer lease may mutate a given worktree at a time. Parallel thClaws children or a handoff to Codex/Claude SHALL use separate worktrees/branches or read-only snapshots unless Spec 224 coordinates a controlled merge stage.

### 60.2 Base revision and dirty-state proof

Every development attempt binds:

- repository identity and trusted remote/ownership metadata;
- immutable base revision;
- pre-existing dirty/untracked state manifest;
- writable branch/worktree identity;
- path-policy digest.

The harness cannot treat pre-existing user changes as its own output. Handoff/promotion compares file preimages and rejects unexpected drift.

### 60.3 Symlinks, junctions and path escapes

Workspace authorization uses canonical resolved paths and must defend against symlink/junction/reparse-point changes after admission. File tools, input upload, artifact collection and Git operations must not escape the assigned root through path aliasing.

### 60.4 Dependency execution policy

Package installation/build is an execution boundary. The plan SHALL record package-manager/runtime versions and lockfile hashes. Network fetches, install/lifecycle scripts, native compilation and untrusted package binaries run under the assigned egress/secret/workspace policy. Caches are tenant/project scoped or content-addressed read-only; a writable cache from one tenant cannot become another tenant's executable trust source.

For release candidates, capture an environment/build manifest sufficient to explain dependency and toolchain versions used by Final Verify.

## 61. Skills, MCP, plugins and package supply-chain controls

Managed thClaws MUST NOT allow an agent to globally install/upgrade a Skill, plugin, MCP server or agent template merely because model reasoning requested it.

Every executable extension requires a source/digest/version/license/provenance record and one of:

- immutable platform-projected package;
- approved project-private package;
- approved device-private capability;
- explicit temporary installation grant.

Runtime-created package/config files live under the assigned workspace/config scope. Marketplace/catalog operations are disabled in managed cloud mode unless a dedicated publishing/install capability is admitted.

MCP OAuth tokens, plugin secrets and browser credentials are credential-class data, not ordinary workspace files. They must be excluded from R2 snapshots, artifact globbing, Git and cross-placement handoff.

## 62. Callback, preview, browser and network security

### 62.1 Async callback ingress

`x_callback` or equivalent async delivery MUST point only to a SmartAIHub-controlled callback endpoint selected by trusted server code. The agent, user prompt or project file cannot provide an arbitrary callback URL. The callback uses an opaque one-time correlation/nonce bound to `(job, attempt, runtime_generation, route_generation)`; stale/replayed callbacks are rejected.

### 62.2 SSRF and internal-service protection

Browser/fetch/MCP/preview workloads SHALL enforce current egress policy against loopback, link-local, private/internal control-plane destinations and DNS rebinding unless the specific internal destination is intentionally brokered. Redirects are revalidated at every hop.

### 62.3 Preview origin isolation

A development preview gets a dedicated origin or equivalent strict isolation. It MUST NOT receive SmartAIHub primary session cookies, provider keys, control-plane tokens or unrestricted parent-origin privileges. WebSocket/event channels require their own short-lived preview grant. Expiry/revoke tears down both URL access and backend process routing.

## 63. Local Windows/macOS Device Security Profile

Local thClaws availability does not imply equivalent OS sandbox strength on every platform. SmartAIHub SHALL maintain a per-OS/per-version security capability profile and fail closed for tasks requiring controls the platform cannot prove.

Required local protections include:

- canonical workspace path + symlink/junction/reparse-point escape tests;
- loopback bind verification and detection/refusal of unintended public/LAN `--serve` exposure;
- outbound-only SmartAIHub control connection;
- device epoch revocation and user switch/logoff handling;
- laptop sleep/hibernate/reboot recovery with lease expiry and reconciliation;
- explicit user consent before installing/upgrading a managed binary;
- no cloud upload of OS keychain/Credential Manager/provider session files;
- local firewall/process ownership checks where supported;
- local artifact filtering before cloud upload.

`Use my computer` must show which repo/folders, model access source and tools are being granted for the run.

## 64. Upstream version/state-format migration gate

thClaws is an independently evolving upstream. A release may change workspace layout, session/KMS/settings structure, agent-team layout or server protocol while keeping the same product name.

Before promoting a new thClaws version:

1. snapshot a representative old workspace/session using non-secret fixtures;
2. run upstream migration in an isolated candidate environment;
3. verify project Git/base revision and `.thclaws` state boundaries;
4. run adapter/API/Skill/MCP/artifact conformance;
5. prove old-version rollback from a pre-migration backup or declare downgrade unsupported;
6. certify cloud and each supported local OS/architecture separately;
7. update the compatibility matrix and revoke incompatible versions.

Production MUST NOT auto-upgrade a workspace in place before a recoverable pre-upgrade backup/checkpoint exists. A state format upgraded by one version cannot be reopened by an older binary unless that downgrade path was explicitly proven.

## 65. Resource envelope, cost reservation and runaway protection

Each execution plan SHALL contain hard ceilings appropriate to its risk class:

```text
max_wall_clock
max_idle_time
max_child_agents
max_parallel_children
max_shell_processes
max_cpu_or_resource_class
max_workspace_bytes
max_artifact_bytes
max_network_egress_bytes (where measurable/enforceable)
max_tool_calls
max_llm_spend_or_user_quota_policy
max_platform_compute_spend
```

SmartAIHub SHALL reserve/authorize estimated platform-billed compute/model cost before execution where Spec 207 requires it, continuously meter actual usage, and stop/park when a hard ceiling is reached. User-owned subscription quota and platform spend remain separate dimensions.

A tenant/user/global emergency kill switch MUST be able to prevent new thClaws admission and fence active attempts; it does not claim to undo already-completed external effects.

## 66. Reliability, cleanup and disaster-recovery additions

Recovery SHALL distinguish:

- canonical source/checkpoint available, harness session missing;
- harness session available, source revision changed;
- container restored from backup but provider credential revoked;
- callback arrives after cancellation or route migration;
- local device completed offline after canonical lease expired;
- artifact upload partially completed;
- thClaws state upgraded before crash.

For each case, default behavior is reconcile/fence/repair, not blind resume. Disaster-recovery evidence must prove that losing every active thClaws process does not lose canonical admitted job state, source revisions already checkpointed, approval/billing records or registered artifacts.

## 67. R1.1 conformance additions `C259-001`–`C259-032`

Production admission adds the following mandatory cases:

1. `C259-001` managed cloud runtime cannot create persistent schedule/daemon;
2. `C259-002` auto-learn/KMS persistence is disabled or explicitly scoped;
3. `C259-003` child agent cannot expand tool/credential/tenant scope;
4. `C259-004` aggregate child budget stops fan-out runaway;
5. `C259-005` Cloudflare amd64 image boots with exact pinned digest;
6. `C259-006` readiness fails closed on wrong thClaws version/capability;
7. `C259-007` orphan keepAlive runtime is detected and destroyed;
8. `C259-008` R2/Sandbox restore rejects wrong tenant/checkpoint digest;
9. `C259-009` Z.ai coding endpoint works technically but remains blocked if terms gate is not approved;
10. `C259-010` raw user credential is absent from checkpoint/artifact/session/config scans;
11. `C259-011` credential revocation during run blocks next provider call;
12. `C259-012` generic gateway route is rejected when required native feature is unsupported;
13. `C259-013` model alias drift creates a new route generation instead of silent replay;
14. `C259-014` two harnesses cannot write the same worktree concurrently;
15. `C259-015` child worktrees merge only through canonical development merge/review;
16. `C259-016` symlink/junction race cannot escape workspace;
17. `C259-017` dependency lifecycle script cannot access denied secret/egress scope;
18. `C259-018` writable dependency cache does not cross tenant boundary;
19. `C259-019` unapproved plugin/Skill/catalog install is denied;
20. `C259-020` MCP OAuth token is excluded from R2/Git/artifacts;
21. `C259-021` agent-supplied async callback URL is ignored/rejected;
22. `C259-022` redirect/DNS-rebinding SSRF attempt is blocked;
23. `C259-023` preview origin cannot read SmartAIHub primary auth cookie;
24. `C259-024` preview revocation terminates WebSocket/process access;
25. `C259-025` local daemon public/LAN bind is detected and rejected;
26. `C259-026` device sleep/reboot causes lease-safe resume/reconcile;
27. `C259-027` pre-upgrade backup survives thClaws state-layout migration failure;
28. `C259-028` unsupported downgrade is blocked rather than corrupting workspace;
29. `C259-029` resource ceiling stops runaway subagent/process loop;
30. `C259-030` subscription quota exhaustion and cloud compute budget are reported separately;
31. `C259-031` global emergency disable prevents new admission and fences active generations;
32. `C259-032` total loss of active thClaws runtimes recovers canonical run from external durability.

## 68. R1.1 production-gate and Definition-of-Done extensions

The following are added to §47 and §52 and are mandatory before production default:

- **G259.13 Managed Policy:** persistent/non-job thClaws services and child delegation are bounded and tested.
- **G259.14 Image/Readiness:** amd64/headless image, exact digest, readiness barrier, SBOM/vulnerability evidence and cleanup sweeper pass.
- **G259.15 Credential Persistence:** runtime secret persistence scan and `CredentialUseLease` lifecycle pass.
- **G259.16 Protocol Fidelity:** every default model route has protocol-feature evidence and immutable route snapshot.
- **G259.17 Source Concurrency:** writer lease/worktree/path-escape and dependency supply-chain tests pass.
- **G259.18 Network/Preview:** callback SSRF, preview-origin isolation and revocation tests pass.
- **G259.19 Upstream Migration:** one real thClaws version upgrade + rollback/restore drill passes on cloud and each supported local OS family.
- **G259.20 Resource/DR:** runaway caps, orphan cleanup, emergency disable and all-runtime-loss recovery pass.

R1.1 is Definition-of-Done complete only when `C259-001`–`C259-032` have executable evidence on the exact admitted versions and environments; a document audit alone is not implementation proof.


---

# R1.2 Second Ten-Pass Production Hardening Amendment — 2026-09-29

> **Precedence:** Sections 69–81 are the latest additive requirements. They supersede any earlier wording that permits long-lived provider secrets inside an untrusted Cloud Sandbox, assumes a thClaws session can move between cloud and desktop unchanged, treats an SDK command timeout as process termination, ignores actual Cloudflare placement, trusts a PATH-selected local binary without re-verification, or lets client connectivity act as a job heartbeat. R1.1 remains normative where compatible. This is still a design specification, not implementation evidence.

## 69. Second ten-pass audit outcome

R1.2 applies a second, distinct set of ten review lenses after the R1.1 hardening pass:

| Pass | Review lens | Additional gap | R1.2 disposition |
|---|---|---|---|
| 11 | Cloud credential isolation | A cloud thClaws process with shell/code access could read provider credentials injected into its environment | Brokered inference/outbound credentials; raw provider secret denied by default |
| 12 | Cloud ↔ local continuation | Placement was selectable, but current-run handoff semantics were not complete | Portable committed checkpoint + fence/rebind/resume contract |
| 13 | Process supervision | Cloudflare command timeout may return while the underlying process continues | Explicit process-tree supervision, kill, listener cleanup and post-cancel proof |
| 14 | Multi-agent/browser state | Newer thClaws workspaces can contain per-agent sessions/settings/browser logins | Versioned layout adapter + credential-class browser/profile state |
| 15 | Model-route containment | `/model`, child agents or direct egress could escape the admitted SmartAIHub model route | Forced route envelope + host egress containment + child route inheritance |
| 16 | Cloud placement/residency | `CLOUD_SANDBOX` alone did not bind an allowed geography/jurisdiction | Region/jurisdiction constraints + runtime placement attestation |
| 17 | Local binary trust | Upstream platform signing/notarization can vary; executable selected from PATH can be replaced | Exact-path+digest trust record; no automatic OS-warning bypass; managed signing policy |
| 18 | Security response | Version pinning without rapid advisory revocation can preserve a vulnerable runtime | Security-advisory intake, emergency denylist and forced re-certification |
| 19 | Checkpoint consistency | R2/Git/session uploads can succeed partially and form a non-atomic resume point | `WorkspaceCheckpointV2` prepare/commit protocol + garbage collection |
| 20 | Multi-tenant continuity | Per-run caps did not fully address account capacity, noisy neighbors or mobile disconnect | Fair admission/backpressure + client-disconnect-independent jobs/event replay |

These findings are incorporated below and mirrored into the cumulative related-spec amendments.

## 70. Cloud Credential & Inference Broker — raw provider secrets stay outside untrusted cloud execution

### 70.1 Default rule

For `THCLAWS_CLOUD_SANDBOX`, a long-lived provider/API/subscription credential MUST NOT be placed in the sandbox environment, filesystem, thClaws `.env`, project config, shell profile, process argv or browser storage when the same runtime can execute user/model-controlled shell or code.

The preferred cloud path is:

```text
thClaws / generated code
  -> unprivileged request using a runtime-scoped logical route
  -> SmartAIHub / Cloudflare trusted outbound or inference broker
  -> broker resolves the user/platform credential outside the Sandbox
  -> broker injects upstream authorization
  -> provider
```

Cloudflare outbound handlers or an equivalent trusted Worker-side proxy MAY implement this pattern. The sandbox receives only a short-lived SmartAIHub runtime credential scoped to approved host/service, job, route generation, purpose and expiry.

### 70.2 BYOK and user subscription routing

A `USER_API_KEY` or cloud-certified `USER_SUBSCRIPTION` MAY still fund the request without exposing the key to thClaws. The Secret Broker associates the opaque user binding with the trusted outbound/inference broker. Usage/entitlement attribution remains the user's binding; secret possession remains outside the untrusted container.

If a provider protocol cannot be brokered without exposing a raw credential to a shell-capable runtime, the production placement SHALL default to `LOCAL_ONLY`, `PROVIDER_MANAGED_ONLY`, or `NOT_CERTIFIED` until an isolation design proves that arbitrary project/shell code cannot read or reuse that credential. A successful technical test does not waive this rule.

### 70.3 Repository and MCP credentials

The same rule SHOULD be used for Git hosting tokens, package-registry tokens, object-storage credentials and MCP service credentials. Prefer host-specific outbound handlers, short-lived scoped tokens or capability URLs. Do not give `git`, `npm`, shell hooks or generated code a reusable tenant-wide credential merely because the parent agent is trusted.

### 70.4 Broker enforcement

The broker SHALL enforce at least:

- destination host/service and port profile;
- HTTP method/path family where practical;
- job/attempt/runtime/route generation;
- logical model/provider or service operation;
- tenant/principal binding;
- expiry and security epoch;
- rate/budget/quota policy;
- redirect revalidation and DNS-rebinding protection;
- payload size and response-size ceilings;
- audit correlation without logging secret material.

The broker MUST NOT become a generic open proxy.

## 71. Cross-placement handoff — Cloud ↔ Windows/macOS without pretending sessions are portable

SmartAIHub SHALL distinguish **placement preference for future steps** from **migration of an active execution**.

A running thClaws attempt may move between Cloud Sandbox and a user device only at a committed canonical checkpoint:

1. request/enter a safe handoff boundary;
2. stop new side effects and fence the old writer/runtime generation;
3. commit source/workspace checkpoint under §78;
4. record test/build/artifact evidence and unresolved effects;
5. terminate or demote the old writer;
6. resolve the target runtime, model and credential source again under current policy;
7. restore only portable state;
8. acquire a new writer lease/runtime generation;
9. verify base revision/workspace digest/environment compatibility;
10. resume the logical Spec 224 run from the checkpoint, not from an assumed live process.

### 71.1 `ExecutionHandoffCheckpointV1`

```ts
interface ExecutionHandoffCheckpointV1 {
  checkpointRef: string;
  runId: string;
  jobId: string;
  fromPlacement: 'CLOUD_SANDBOX'|'USER_DEVICE';
  sourceRuntimeGeneration: number;
  sourceRevisionRef: string;
  candidateRevisionRef?: string;
  patchDigest?: string;
  workspaceCheckpointRef: string;
  environmentManifestRef: string;
  testEvidenceRefs: string[];
  artifactRefs: string[];
  unresolvedEffectRefs: string[];
  portableThClawsStateRefs: string[];
  excludedCredentialClasses: string[];
  committedAt: string;
}
```

Provider login files, OS keychain entries, browser profiles/cookies, MCP OAuth refresh tokens, raw credentials, daemon tokens, process/terminal IDs and uncommitted R1/R2 checkpoint fragments are **never portable state**.

A thClaws native session may be reused after handoff only when the exact source/target version, state schema and security profile explicitly certify portability. Otherwise SmartAIHub reconstructs context from canonical conversation, source diff, checkpoint evidence and Skill/plan state.

If a run relied on a `LOCAL_ONLY_SUBSCRIPTION`, moving it to cloud MUST re-resolve an eligible cloud credential/model and may require user approval; it cannot copy the local subscription session into cloud.

## 72. Process supervision — timeout is not cancellation

Worker/Sandbox SDK request timeout, stream disconnect or command timeout MUST NOT be treated as proof that the spawned process stopped.

For each long-running thClaws daemon, dev server, build, test runner, browser helper, child agent or shell process, SmartAIHub SHALL maintain a launch/supervision record containing runtime generation, process identity/handle where available, command digest, cwd, owner job and expected ports/resources.

Cancellation, lease expiry and hard-budget termination SHALL:

1. fence new privileged actions;
2. request cooperative stop;
3. wait a bounded grace period;
4. terminate the tracked process/process group and known descendants using the certified Sandbox/OS mechanism;
5. remove/revoke preview/listener routing;
6. re-scan for forbidden surviving processes/listeners;
7. destroy the cloud sandbox when containment cannot otherwise be proven;
8. reconcile external effects separately.

Managed cloud mode MUST deny arbitrary detached daemons, service managers, `tmux`/background persistence or shell tricks whose lifetime escapes the canonical attempt unless a dedicated capability explicitly owns them.

## 73. thClaws workspace/bot/session/browser state classification

SmartAIHub SHALL NOT hard-code one historical `.thclaws` directory layout. thClaws versions may introduce per-agent/bot workspaces, sessions, settings, KMS and browser profiles. The adapter therefore owns a versioned `ThClawsStateLayoutProfile` discovered/certified for each admitted version.

State categories:

- **portable source state:** project files, Git refs/patches and explicitly approved generated files;
- **reconstructable execution state:** session transcript/plan fragments only when version/schema compatible and secret-free;
- **credential-class state:** browser profiles/logins/cookies, OAuth tokens, OS keychain references, provider login artifacts, daemon/API tokens;
- **non-portable process state:** PID/terminal/socket/dev-server identity;
- **SmartAIHub canonical state:** conversation, approvals, job lifecycle, billing, memory and artifact records outside thClaws.

Credential-class state MUST be excluded from R2 checkpoint, cross-placement handoff, general artifact collection and source commits unless an explicit credential export feature exists and is separately approved—which this spec does not create.

Each thClaws bot/agent ID is a provider/runtime correlation only. It cannot become a SmartAIHub principal or tenant boundary. Side-channel/background agents remain children of the admitted execution envelope.

## 74. Model-route containment and child-route inheritance

When a SmartAIHub route is admitted, thClaws MUST NOT silently bypass it through another configured provider, `thclaws.cloud`, OpenRouter, local model, inherited user config or a child-agent `/model`/`/provider` change.

Managed cloud policy SHALL combine:

- forced gateway/broker configuration where applicable;
- denied direct provider hosts except the exact approved direct route;
- sanitized user/project configuration that cannot override policy;
- child agents inheriting the parent's allowed logical model/provider set and billing source;
- interception of route-changing commands/events and return to Spec 231 for re-resolution;
- no invisible fallback from user-owned to platform-paid inference;
- route-generation change on any approved provider/model/credential-source switch.

Local personal mode may allow broader provider switching only within explicit user/device policy; SmartAIHub-owned jobs still require route/billing attribution for every governed model call.

## 75. Cloud placement and data-residency attestation

`CLOUD_SANDBOX` is not a geographic location. Where tenant/data policy constrains processing, Spec 242/259 SHALL use supported Cloudflare Container region/jurisdiction placement constraints and include the required placement profile in admission.

Before sensitive input is delivered, the runtime SHALL attest/record the observed container region/location metadata available from the platform and compare it with the admitted placement constraint. A mismatch fails closed for workloads with hard residency requirements.

The system MUST distinguish:

1. container compute placement;
2. Worker/TLS request processing location;
3. PostgreSQL/R2/checkpoint/log storage location;
4. external LLM/provider processing and retention location.

Constraining one layer does not prove the others comply. `APAC` or another regional label MUST NOT be presented as country-level residency. If no certified cloud tuple satisfies the requirement, placement falls back to an eligible local/device/provider path or reports unavailable.

## 76. Local binary trust, executable identity and distribution

`Use existing thClaws` SHALL resolve the actual executable path, owner and file digest before each admitted start (or against a short-lived attested cache) and reject PATH/shim substitution or an unexpected binary replacement.

For SmartAIHub-managed installation/update:

- retrieve only from an approved HTTPS source/release identity;
- verify an upstream signature when available;
- when no upstream platform signature is available, require at least a pinned expected digest plus a SmartAIHub-signed release manifest/provenance before automation;
- never automate bypass of Windows SmartScreen, macOS Gatekeeper/notarization warnings or equivalent OS trust controls;
- production one-click distribution of a repackaged/managed installer SHALL use SmartAIHub-controlled platform signing/notarization where applicable and after license/legal packaging review;
- preserve required MIT/Apache-2.0 license/notice material when redistributing or modifying upstream artifacts;
- quarantine/revoke a digest independently of a semantic version.

A manual user decision to run an unsigned upstream build is not sufficient evidence for unattended managed execution on that binary.

## 77. Upstream security-advisory intake and emergency runtime revocation

Version pinning prevents surprise upgrades but can also pin a vulnerable version. SmartAIHub SHALL maintain an operational thClaws security feed/review process covering upstream releases, security advisories, critical dependency findings and SmartAIHub's own adapter/container image vulnerabilities.

Each certified runtime digest has `securityStatus = CERTIFIED | REVIEW_REQUIRED | QUARANTINED | REVOKED` plus review timestamp and evidence. A critical advisory can:

- block new admissions immediately;
- revoke affected runtime/image digests;
- fence or safely terminate active high-risk runs according to incident policy;
- disable one feature/tool without disabling all thClaws when the vulnerability is scoped;
- require credential rotation if exposure is plausible;
- trigger a canary of the patched version before broad promotion.

Do not auto-upgrade all devices/workspaces in place merely to satisfy a version number. Security rollout still obeys the state-migration/backup gates in §64.

## 78. Atomic `WorkspaceCheckpointV2` commit protocol

A recoverable workspace checkpoint is an **immutable committed manifest**, not a directory whose files happened to upload.

```ts
interface WorkspaceCheckpointV2 {
  checkpointId: string;
  state: 'PREPARING'|'COMMITTED'|'ABORTED';
  tenantId: string;
  projectRef?: string;
  runId: string;
  jobId: string;
  runtimeGeneration: number;
  sourceBaseRef: string;
  candidateRevisionRef?: string;
  patchDigest?: string;
  fileManifestRef: string;
  environmentManifestRef: string;
  thclawsStateSchemaRef?: string;
  portableStateRefs: string[];
  excludedSecretClassDigest: string;
  testEvidenceRefs: string[];
  createdAt: string;
  committedAt?: string;
}
```

Checkpoint protocol:

1. fence or establish a consistent source snapshot boundary;
2. create `PREPARING` metadata;
3. upload/content-address files and manifests with checksums;
4. run secret/path/integrity validation;
5. verify all referenced bytes exist and belong to the expected tenant/project;
6. atomically mark the canonical metadata `COMMITTED` using existing PostgreSQL/job fencing;
7. only `COMMITTED` checkpoints may be resumed, handed off or used by Final Verify;
8. partial `PREPARING/ABORTED` objects are never resumable and are garbage-collected after a bounded forensic window.

R2/Sandbox backup completion alone is not the canonical commit. Restore always verifies the committed manifest and current authorization.

## 79. Multi-tenant admission fairness, capacity and backpressure

Per-job limits do not prevent one tenant from exhausting account-level Sandbox or model capacity. The runtime admission layer SHALL enforce independent ceilings for user, project, tenant and platform, with bounded queues and fair scheduling.

Required behavior includes:

- tenant/user concurrent-run and queued-run quotas;
- provider/model concurrency/rate-limit budgets;
- cloud instance-capacity guard before start;
- bounded exponential backoff/jitter for capacity/provider throttling;
- priority classes controlled by product policy, not prompt text;
- anti-starvation/fairness across tenants;
- queue deadline/expiry so obsolete builds do not execute hours later;
- reserved control capacity for cancellation/reconciliation/incident cleanup;
- user-visible `QUEUED_CAPACITY`/`WAITING_PROVIDER` states rather than fake `RUNNING`;
- no `keepAlive` container held merely while waiting for an approval or provider quota window when a safe checkpoint/sleep path exists.

## 80. Client-disconnect independence, mobile continuity and event replay

For cloud-capable workloads, the browser/phone/tablet connection is a **control surface**, not the execution lease owner.

Closing the app, changing networks, mobile OS suspension or WebSocket disconnect MUST NOT automatically cancel an admitted background job unless the user explicitly selected an interactive-only policy.

Progress SHALL be written to canonical job/events with resumable event cursors. On reconnect, Chat/Task Control reconstructs state from canonical events/checkpoints rather than requiring the original streaming socket. Approval waits park the logical job and, where safe, checkpoint/sleep compute rather than holding an idle container indefinitely.

Preview URLs, browser tabs and client heartbeats MUST NOT be used as the authority that keeps a job alive. Completion/approval notifications reuse the existing SmartAIHub notification/Task Control owner; Spec 259 does not create another notification service.

## 81. R1.2 conformance additions and production gates

### 81.1 Mandatory cases `C259-033`–`C259-064`

1. `C259-033` cloud thClaws cannot read the raw Z.ai/user provider secret from env/files/process argv;
2. `C259-034` outbound/inference broker injects the correct credential only for an approved host/route;
3. `C259-035` generated shell code cannot repurpose the broker as an arbitrary open proxy;
4. `C259-036` Git/package/MCP long-lived credential is not exposed to arbitrary sandbox shell;
5. `C259-037` cloud→local handoff fences the old writer before the local writer starts;
6. `C259-038` local-only subscription is not copied to cloud during handoff;
7. `C259-039` incompatible thClaws session schema falls back to reconstructed context, not corrupt resume;
8. `C259-040` handoff refuses an uncommitted/partial checkpoint;
9. `C259-041` SDK command timeout with a still-running process is detected and explicitly terminated;
10. `C259-042` cancellation proves preview/listener and tracked descendants are gone or destroys sandbox;
11. `C259-043` detached/background daemon creation is denied in managed cloud mode;
12. `C259-044` per-agent browser profile/cookie data is excluded from checkpoint/artifacts;
13. `C259-045` a changed upstream bot/workspace layout is blocked until the layout profile is certified;
14. `C259-046` child `/model` or `/provider` cannot escape the admitted route/billing source;
15. `C259-047` inherited project thClaws config cannot silently activate an unapproved direct provider;
16. `C259-048` direct internet provider host is blocked when forced broker/gateway mode is active;
17. `C259-049` hard residency workload starts only in an allowed Cloudflare region/jurisdiction;
18. `C259-050` observed placement mismatch blocks sensitive input before dispatch;
19. `C259-051` compute-region compliance does not falsely certify R2/log/provider residency;
20. `C259-052` PATH/shim replacement of local thClaws is detected by executable identity/digest;
21. `C259-053` managed installer never auto-bypasses OS trust warnings for unsigned/unnotarized artifacts;
22. `C259-054` revoked runtime digest cannot start even when version string is allowlisted;
23. `C259-055` critical security advisory blocks new admission and preserves recoverable job state;
24. `C259-056` partially uploaded checkpoint remains `PREPARING/ABORTED` and cannot resume;
25. `C259-057` committed checkpoint detects missing/tampered R2 object by digest;
26. `C259-058` stale runtime cannot commit a checkpoint after its fencing generation changed;
27. `C259-059` one tenant cannot consume all configured Sandbox concurrency;
28. `C259-060` queued run expires/cancels without creating a container;
29. `C259-061` approval wait checkpoints/sleeps eligible compute rather than burning keepAlive time;
30. `C259-062` phone/browser disconnect leaves an admitted cloud job progressing safely;
31. `C259-063` reconnect backfills ordered progress from canonical event cursor without duplicate terminal result;
32. `C259-064` client disconnect never acts as implicit approval, cancellation or lease renewal.

### 81.2 Production gates `G259.21`–`G259.30`

- **G259.21 Secret Mediation:** cloud user/provider credentials are brokered outside arbitrary shell/code execution; direct raw-secret exposure is explicitly uncertified by default.
- **G259.22 Placement Handoff:** cloud/local handoff uses committed checkpoint, writer fencing, credential re-resolution and schema-compatible resume.
- **G259.23 Process Containment:** timeout/cancel/lease expiry terminate or contain process trees and listeners; no orphan background services.
- **G259.24 State Classification:** per-agent/session/browser state is versioned and credential-class data never crosses ordinary checkpoint/handoff.
- **G259.25 Route Containment:** child agents/config/commands cannot silently escape model/provider/billing route.
- **G259.26 Residency:** compute placement constraints and observed region attestation integrate with independent storage/provider residency policy.
- **G259.27 Local Trust:** executable identity, installer trust, license packaging and OS trust controls pass on each supported desktop platform.
- **G259.28 Security Response:** advisory intake, digest quarantine/revocation and patched-version canary drill pass.
- **G259.29 Atomic Checkpoint:** only fully validated `COMMITTED` checkpoints resume/handoff; partial state is non-authoritative.
- **G259.30 Capacity/Mobile Continuity:** fair admission/backpressure and client-disconnect-independent Task Control replay pass under load.

R1.2 Definition of Done requires executable evidence for R1.1 `C259-001`–`032` **and** R1.2 `C259-033`–`064`, plus the original acceptance suites, on the exact admitted cloud image, desktop binaries, provider connector and Sandbox SDK family.
