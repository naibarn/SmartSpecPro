# Spec 226 — SmartAIHub Device-Independent Agent Platform Upgrade & Compatibility Bridge
## Additive Integration of Mobile, Cross-Device Control, External Development Control, Progress Observability and First-Party Agent Access into the Implemented Spec 195–213 Baseline

**Status:** Proposed / Incremental Upgrade Specification  
**Spec ID:** 226  
**Revision:** 9 — legacy retrieval/vector call migration bridge into Spec 229 Retrieval Broker V2
**Date:** 2026-09-22  
**Suggested repository path:** `specs/feature/226-SmartAIHub Device-Independent Agent Platform Upgrade & Compatibility Bridge/spec.md`  
**Implementation baseline:** SmartAIHub implementation has progressed through Spec 213  
**Target architecture:** Spec 225 Revision 7+ — Universal Agent Access, Mobile & Cross-Device Control Plane; Spec 224 Revision 19+ — Autonomous Development Orchestrator Runtime; Spec 228 Revision 7+ maintenance operational integration  
**Implemented systems extended, not rewritten:** Feature 195, Feature 196, Spec 200, Spec 206, Spec 208, Spec 213 and their existing shared infrastructure  

---

## 0.1 Codebase alignment snapshot — 2026-09-22

No Spec 226 compatibility bridge, origin/session projection, cross-device access adapter, Attention/Notification persistence bridge, mobile capture adapter or Spec 225 ingress façade was found. Existing Feature 195/196, connected-device, notification, approval and browser routes are historical/platform dependencies and not Spec 226 implementation proof.

Spec 226 remains an additive migration target. It may project canonical state, but cannot become a second Identity, Job, DevelopmentRun, Approval, Browser, Notification or Retrieval source of truth.

# 0. Executive Decision

SmartAIHub SHALL adopt the device-independent/mobile-first agent architecture from Spec 225 **without retroactively rewriting already-implemented specifications or rebuilding their working subsystems**.

The canonical rule is:

```text
IMPLEMENTED BASELINE (through Spec 213)
Feature 195 / Feature 196 / Spec 200 / Spec 206 / Spec 208 / Spec 213
                         │
                         │ preserve
                         ▼
              Existing production contracts
                         │
                         │ additive adapters/extensions
                         ▼
                     Spec 226
              Compatibility / Upgrade Bridge
                         │
                         ▼
                     Spec 225
       Mobile / Tablet / PWA / Cross-device Access
```

Spec 226 is an **implementation delta**, not a replacement architecture.

No team may satisfy this spec by copying the revised historical text of Specs 195/196/200/206/208/213 and pretending those revisions were the original implementation baseline.

---

# 1. Why This Must Be a Separate Upgrade Spec

The system already contains code, migrations, tests, operational evidence and production assumptions derived from Specs through 213. Rewriting old specs in place would create ambiguity about:

- what was actually implemented;
- which database migrations already ran;
- what test evidence refers to which contract;
- whether an old deployment is compliant;
- which changes are new and require migration;
- rollback boundaries;
- whether a regression is historical or introduced by the mobile/cross-device upgrade.

Therefore:

```text
historical spec/implementation baseline = immutable reference
new requirement                         = explicit upgrade delta
migration                               = versioned and reversible where practical
```

---

# 2. Scope

Spec 226 introduces only the minimum additive changes required to let Specs 224 and 225 use the implemented platform safely.

Revision 1 covers device-independent/mobile access. Revision 2 adds external development-control and provider-progress compatibility needed by Spec 224. Revision 3 hardens external-control authority/replay/progress behavior. Revision 4 hardens browser/PWA session security, offline actions and capture ingestion. Revision 5 upgrades the existing AI Chat/Task Control shell into a complete synchronized command, monitoring, alert and decision surface through additive adapters.

In scope:

1. cross-device request origin and client-session metadata;
2. first-party `SmartAIHub Agent` façade over existing Feature 196 entry points;
3. Attention Event projection and Needs Attention inbox;
4. Notification Gateway and delivery receipts;
5. deep-link/resume tokens that resolve to canonical server state;
6. multimodal mobile `CaptureBundle` / `IntentEnvelope` adapters;
7. approval delivery and action from mobile/tablet without creating a second Approval Service;
8. browser/computer human-handoff integration over existing Spec 208;
9. optional cloud-browser provider registration under existing Spec 208/Feature 195 contracts;
10. external-agent task visibility from mobile without altering Spec 200/206 provider semantics;
11. migration, feature flags, observability, rollback and compatibility testing;
12. external development commands entering through the existing MCP/agent baseline into Spec 224;
13. caller/actor/executor/delegation identity propagation;
14. project/repository/run/environment-scoped authorization mapping;
15. provider progress capability declaration and normalization;
16. cursor-based progress replay/reconnect for external control clients;
17. secret-safe credential-bound development actions and recursion protection.

Out of scope:

- replacing Feature 195;
- replacing Feature 196;
- creating a new planner or memory store;
- creating `mobile_jobs`, `agent_jobs_v2` or another canonical job table;
- creating a second Browser/Computer Use engine;
- rewriting Spec 213 Jev/System-One decision logic;
- making notification transport authoritative for job state;
- requiring every workload to run in Cloudflare;
- creating a second DevelopmentRun lifecycle engine;
- replacing Spec 224's Decision Engine or Final Verify;
- replacing Spec 199 MCP transport semantics or Spec 200 provider lifecycle semantics;
- granting an external agent authority merely because it can connect to MCP.

---

# 3. Ownership Matrix

| Concern | Existing canonical owner | Spec 226 role |
|---|---|---|
| General goal / intent ingress | Feature 196 | additive ingress façade + origin metadata |
| Development lifecycle / decision / finality | Spec 224 | compatibility bridge only; never own lifecycle |
| Durable job / events | Feature 195 | additive correlation/projection only |
| MCP gateway/transport | existing Spec 199 path | additive development-control tool registration/mapping only |
| External agents | Specs 200/206 | surface status/input/attention/progress metadata; do not alter provider runtime semantics |
| Browser/Computer Use | Spec 208 | expose governed handoff/live-view hooks; no second executor |
| Jev/System-One decision path | Spec 213 | unchanged; invoked through Spec 208 as before |
| Approval source of truth | existing shared Approval Service | deliver/action from new surfaces |
| Asset/Library | existing Library/Asset Gateway | mobile capture upload/materialization |
| Notification delivery | **Spec 225/226 new shared gateway** | owner of delivery, not business state |
| Needs Attention projection | **Spec 225/226** | derived user-attention index |
| Mobile/PWA UI | Spec 225 | consume existing canonical state |

---

# 4. Architectural Invariants

The upgrade MUST preserve these invariants:

```text
1 canonical Job truth
1 canonical Approval truth
1 canonical Capability Registry
1 canonical Library/Artifact identity
1 Browser/Computer Use engine
1 external-agent control model
1 orchestration entry family
many control surfaces
many delivery channels
many execution providers
```

A mobile client is never an execution source of truth.
A push notification is never a job transition source of truth.
A deep link is never an authorization grant by itself.
A live browser view is never permission to bypass Spec 208 policy.

---

# 5. Additive Data Contracts

## 5.1 Client Origin Envelope

Existing command/job creation paths SHOULD accept an optional compatible envelope:

```json
{
  "origin": {
    "surface": "web|pwa|ios|android|tablet|desktop|external_channel",
    "client_session_id": "cs_...",
    "device_installation_id": "optional",
    "conversation_id": "optional",
    "locale": "th-TH",
    "app_version": "optional",
    "capabilities": ["camera", "push", "share_sheet"]
  }
}
```

Older callers that omit `origin` remain valid.

## 5.2 CaptureBundle

Mobile-origin assets SHALL first enter canonical Library/Asset flows and be referenced, not embedded as uncontrolled opaque blobs in orchestration state.

```text
CaptureBundle
├── bundle_id
├── owner/tenant
├── asset_refs[]
├── capture_types[]
├── optional transcript/text
├── optional source_app/share_source
├── created_at
└── retention/policy metadata
```

## 5.3 IntentEnvelope Adapter

Spec 226 maps a `CaptureBundle` plus user text/voice into the existing Feature 196 command/context interface. Feature 196 need not be rebuilt to understand a mobile-specific planner.

## 5.4 AttentionProjection

Create a derived projection keyed to canonical objects:

```text
attention_id
user_id / tenant_id
source_domain
source_object_type
source_object_id
attention_type
severity
summary
available_actions
state: OPEN|ACKNOWLEDGED|RESOLVED|EXPIRED
source_version
created_at
resolved_at
```

Attention state does not replace source state. Reconciliation always re-reads the canonical object before a consequential action.

## 5.5 NotificationDelivery

```text
notification_delivery_id
attention_id
channel
endpoint_ref
attempt
provider_message_id
status
sent_at
delivered_at
opened_at
failure_class
```

Notification failure MUST NOT mutate the underlying job into `failed`.

---

# 6. Feature 195 Upgrade Adapter

Feature 195 remains untouched as historical baseline. Implement only additive compatibility:

- accept optional origin/correlation metadata where schema allows;
- emit normalized domain events into the Attention projector;
- expose query APIs needed by cross-device clients;
- preserve idempotency and canonical `worker_jobs` state;
- support a projection/adapter rather than renaming existing tables;
- use migrations only for fields that cannot be carried in existing metadata/event payloads.

New tables, if needed, MUST be child/projection tables such as:

```text
agent_attention_items
notification_deliveries
client_sessions
push_endpoints
```

They MUST NOT compete with `worker_jobs`.

---

# 7. Feature 196 Upgrade Adapter — SmartAIHub Agent Façade

`SmartAIHub Agent` is a product identity and ingress façade.

Implementation pattern:

```text
Web / Mobile / Tablet
        ↓
SmartAIHub Agent API façade
        ↓
existing Feature 196 command/context/goal interfaces
        ↓
existing orchestration
```

The façade MAY normalize:

- voice transcript;
- images/videos/documents references;
- share-sheet context;
- surface/device metadata;
- requested response modality;
- foreground/background interaction preference.

It MUST NOT introduce a second Goal store, planner, conversation truth or memory subsystem.

---

# 8. Spec 200 / 206 Upgrade Adapter

External agents remain execution providers behind their current contracts.

Spec 226 adds only user-surface normalization:

```text
external agent asks question
        ↓
canonical input-required state/event
        ↓
AttentionProjection
        ↓
mobile push / web push / in-app
        ↓
user answer
        ↓
existing Spec 200/206 response path
```

No provider receives unrestricted device authority merely because the request originated from mobile.

---

# 9. Spec 208 Upgrade Adapter — SmartAIHub Operator Surface

Spec 208 remains the sole Browser/Computer Use authority.

Spec 226 introduces user-facing aliases only:

```text
SmartAIHub Operator
├── Browser Operator  → existing Spec 208 browser paths
└── Computer Operator → existing Spec 208 computer paths
```

Required additive hooks:

- `HUMAN_HANDOFF_REQUIRED` attention event;
- live-view session descriptor/reference;
- short-lived takeover authorization;
- `RETURN_CONTROL_TO_AGENT` action;
- session version/fencing token;
- re-observation and independent verification after takeover;
- mobile-safe view-only mode when interactive control is unsupported.

All policy, semantic-effect, approval, economic and verification rules remain Spec 208 rules.

---

# 10. Optional Cloud Browser Provider

If Cloudflare Browser Run or another cloud-browser provider is enabled, add it as a normal Spec 208 execution provider/target rather than creating a parallel browser-agent product.

```text
Capability Resolver
   ↓
Spec 208 Browser route
   ↓
Cloud Browser Provider Adapter
   ↓
canonical worker_job / events / artifacts
```

Provider-specific session IDs, live-view URLs and credentials are implementation details and MUST be represented through short-lived references.

---

# 11. Spec 213 Compatibility

Spec 213 remains an incremental decision-layer upgrade over Spec 208 and is not rewritten.

Device-independent access changes only **where a task/request originates and how human attention is delivered**. It does not alter the canonical System-One decision chain.

Spec 213 MAY consume additional context such as execution-target type or takeover-return observations if useful, but these are optional additive inputs guarded by capability/version checks.

---

# 12. Notification Gateway

The Notification Gateway SHALL support adapters such as:

```text
IN_APP
WEB_PUSH
IOS_PUSH
ANDROID_PUSH
EMAIL
TELEGRAM
LINE
SLACK
future channel
```

Routing policy considers:

- user preferences;
- attention severity;
- urgency;
- quiet hours;
- channel health;
- privacy classification;
- required interaction capability;
- tenant policy.

Sensitive content SHOULD be minimized in lock-screen payloads. Deep links fetch authoritative content after authentication.

---

# 13. Deep Link and Resume Contract

A notification deep link SHALL contain or resolve through a short-lived opaque token, not embed privileged action parameters.

On open:

```text
authenticate user
→ authorize tenant/resource
→ resolve canonical object
→ compare current version/state
→ render current action options
```

A stale notification must display the current resolved state, e.g. `already approved`, `completed`, `cancelled`, or `superseded`.

---

# 14. Additive Migration Strategy

## Phase 0 — Freeze Historical Baseline

Tag the currently implemented contracts/migrations/tests through Spec 213. Do not rewrite history.

## Phase 1 — Read-only Projections

Build Attention projection and cross-device query APIs from existing events without changing execution behavior.

## Phase 2 — Web/PWA Delivery

Enable in-app + Web Push and deep links.

## Phase 3 — Mobile Ingress

Enable CaptureBundle and SmartAIHub Agent façade while routing into existing Feature 196.

## Phase 4 — Mobile Approval/Input

Enable low/medium-risk existing Approval actions from mobile with stale-state protection.

## Phase 5 — Browser Human Handoff

Expose Spec 208 live-view/takeover through short-lived governed sessions.

## Phase 6 — Native Push / Share Sheet

Add iOS/Android clients without changing backend execution semantics.

## Phase 7 — Cloud Browser Provider

Introduce provider behind Spec 208 in shadow/canary mode before production promotion.

---

# 15. Feature Flags

Minimum flags:

```text
agent_access_facade_v1
attention_projection_v1
web_push_v1
mobile_capture_v1
mobile_approval_v1
browser_handoff_mobile_v1
cloud_browser_provider_v1
native_push_v1
```

Flags MUST be independently rollbackable.

---

# 16. Backward Compatibility

Existing Web/desktop callers SHALL continue to function without providing new mobile metadata.

Old jobs remain readable and must not require backfilling synthetic mobile origin.

If an old job has no origin metadata:

```text
origin.surface = UNKNOWN_LEGACY
```

for projections only. Do not mutate historical rows solely to fill this field.

---

# 17. Security Requirements

- push endpoints are per installation/user and revocable;
- device installation identity is not equivalent to user authentication;
- biometric unlock may protect local app access but server-side authorization remains authoritative;
- notification payloads minimize sensitive data;
- takeover grants are short-lived, scoped and fenced;
- captured media follows existing tenant/privacy/retention policy;
- external agents never receive raw push tokens;
- deep links cannot bypass approval/economic policy;
- mobile clients cannot directly call provider secrets;
- cross-tenant attention leakage is release-blocking.

---

# 18. Observability

Metrics include:

```text
attention_open_total
attention_time_to_ack
attention_time_to_resolve
notification_send_success_rate
notification_open_rate
stale_action_rejection_total
capture_upload_success_rate
agent_facade_to_goal_latency
human_handoff_start_success_rate
human_handoff_resume_success_rate
cross_device_rehydrate_latency
```

Tracing propagates existing goal/job/run/approval IDs plus optional `client_session_id`.

---

# 19. Required Compatibility Tests

At minimum:

1. legacy Web caller creates/runs a job unchanged;
2. mobile caller maps to the same Feature 196 path;
3. duplicate push delivery cannot duplicate approval;
4. stale notification cannot approve a superseded action;
5. offline phone does not block cloud execution unless human input is actually required;
6. notification provider outage does not fail the job;
7. external agent input request resumes through existing Spec 200/206 path;
8. Spec 208 browser task can request human handoff and safely resume;
9. returned takeover cannot bypass independent verification;
10. Runner offline state is correctly surfaced to mobile without inventing cloud success;
11. cross-tenant device/attention access is denied;
12. old jobs with no new metadata still render;
13. feature-flag rollback returns to pre-upgrade behavior;
14. cloud-browser provider can be disabled without affecting local Spec 208 routes;
15. Spec 213 decision regression suite remains green.

---

# 20. Acceptance Criteria

Spec 226 is complete when:

- [ ] implemented Spec 195–213 baselines remain identifiable and unchanged as historical contracts;
- [ ] no second job, approval, capability, agent-runtime or Computer Use source of truth exists;
- [ ] SmartAIHub Agent façade routes into Feature 196 rather than replacing it;
- [ ] cross-device clients can rehydrate canonical jobs/results/approvals;
- [ ] Attention/Notification are projections/delivery, not execution truth;
- [ ] mobile capture uses canonical assets;
- [ ] mobile approval is idempotent and stale-safe;
- [ ] Spec 208 human handoff is available through governed references;
- [ ] external agents remain behind Spec 200/206;
- [ ] Spec 213 behavior remains compatible;
- [ ] migration can be staged and rolled back using feature flags;
- [ ] Web/desktop behavior remains compatible;
- [ ] security and tenant-isolation tests pass.

---

# 21. Final Architectural Rule

> **Do not rewrite a working past to make the future architecture look cleaner. Preserve the implemented SmartAIHub baseline, add a versioned compatibility bridge, and let new clients and new specs consume the same canonical execution truth.**

This rule is mandatory for future platform-wide upgrades as SmartAIHub adds mobile, tablet, wearables, voice-first surfaces or new execution providers.

---

# 22. Revision 2 Amendment — External Development Control & Provider Progress Bridge

**Amendment date:** 2026-09-22  
**Primary consumer:** Spec 224 Revision 11  
**Historical baseline rule:** Specs 199/200 and other implemented <=213 systems remain implementation history; this revision adds compatibility adapters/contracts and does not redefine their original semantics.

Revision 2 extends Spec 226 beyond mobile/cross-device compatibility to cover a second requirement created by the implemented baseline:

> External tools such as Codex, Claude, Antigravity, Hermes, ZCode and future agent clients must be able to initiate, continue and observe Spec 224 development runs through governed interfaces without retroactively rewriting the already-implemented MCP/External-Agent specifications.

Canonical paths:

```text
EXTERNAL CLIENT → SmartAIHub
Codex / Claude / Hermes / ZCode / other MCP-capable client
        ↓
existing Spec 199 MCP Gateway
        ↓ additive Spec 226 development-control adapter
canonical Identity / Policy / Approval / Audit
        ↓
Spec 224 DevelopmentCommandGateway
```

and:

```text
SmartAIHub → EXTERNAL EXECUTOR
Spec 224
   ↓
existing Spec 200 / Spec 206-compatible path
   ↓ additive progress/lineage normalization from Spec 226 where required
Codex / Claude / Antigravity / Hermes / ZCode / future executor
```

Spec 226 SHALL NOT create a second MCP gateway, second External Agent Gateway or second DevelopmentRun runtime.

---

# 23. Ownership Boundary for External Development Control

| Concern | Canonical owner | Spec 226 Revision 2 role |
|---|---|---|
| MCP transport/tool serving | implemented Spec 199 | additive development-tool registration/compatibility only |
| External agent invocation/session lifecycle | implemented Spec 200 / Spec 206 where eligible | additive projection/metadata compatibility only |
| Development lifecycle/state/decision/finality | Spec 224 | bridge external commands/events into it; do not own lifecycle |
| User/principal identity | existing Identity system | attach/validate caller/delegation context |
| Capability authorization | existing Capability/Policy system | map external development scopes/resources into existing enforcement |
| Human approvals | existing Approval Service | create/reference existing approval objects; no second approval store |
| Secrets | existing Secret Broker / Spec 220 controls | credential-bound execution; prevent raw secret disclosure |
| Durable execution | existing `worker_jobs` / events | correlation/projection only |
| Development progress projection | Spec 224 canonical DevelopmentEvent view | normalize provider/legacy events into the required projection |
| Mobile/first-party UX | Spec 225 | consume the same canonical run/progress/attention state |

Normative rule:

> Spec 226 adapts the implemented past to the new Spec 224/225 interfaces. It SHALL NOT become a parallel orchestration or permission authority.

---

# 24. External Development Caller Envelope

External development commands entering through the implemented baseline SHALL be enriched with a server-validated envelope equivalent to:

```text
principal_user_id
acting_for_user_id?
tenant_id
caller_client_id
caller_agent_identity?
provider_identity?
client_session_ref?
project_id
repository_ref?
branch_or_workspace_scope?
development_run_id?
requested_capability
requested_environment
requested_risk_class?
delegated_by?
delegation_depth
credential_binding_ref?
policy_snapshot_ref
authorization_expiry
idempotency_key
correlation_id
```

Client-supplied identity/scope fields are claims until verified by the server.

A provider name such as `codex` or `claude` SHALL NOT imply authorization.

---

# 25. Development Permission Scope Model

The additive bridge SHALL support fine-grained logical scopes such as:

```text
spec.read
development.run.create
development.run.read
development.run.continue
development.run.pause
development.run.cancel
development.run.events.read
development.plan.read
development.plan.replan.request
development.decision.read
development.decision.respond
development.evidence.submit
development.verify.request
development.final_verify.request
repo.read
repo.write.scoped
test.execute
runner.execute.scoped
agent.invoke.scoped
browser.execute.scoped
release.request
production.deploy.request
```

Exact scope naming MAY follow the existing permission registry, but semantics SHALL be equivalent and centrally enforced.

Authorization SHALL combine:

```text
principal
role
logical capability
resource (tenant/project/repo/run/path/branch)
environment
risk class
policy version
expiry
approval state where required
```

RBAC alone is insufficient for external development control.

---

# 26. Server-Side Enforcement and Tool Visibility

Every external development request SHALL be authorized on the SmartAIHub server even if the client/provider has its own sandbox or approval UI.

Required rule:

```text
Provider-side permission/approval
        ≠
SmartAIHub authorization
```

Both may apply; SmartAIHub remains authoritative for SmartAIHub resources and effects.

Where the MCP/tooling layer supports per-caller tool exposure, the bridge SHOULD advertise only tools/capabilities the caller may plausibly use.

Example:

```text
Developer client may see:
  spec.read
  development.run.* within project scope
  test.execute

but not see/expose by default:
  tenant.admin
  billing.admin
  credential.raw.read
  production.destructive
```

Tool hiding is defense-in-depth and token/tool-selection optimization; server authorization remains mandatory even for advertised tools.

---

# 27. Non-Delegable and High-Risk Operations

Revision 2 SHALL integrate with shared risk/approval policy and at minimum distinguish:

```text
R0_READ_ONLY
R1_SAFE_DEV_EXECUTION
R2_REVERSIBLE_SOURCE_WRITE
R3_EXTERNAL_SIDE_EFFECT
R4_SECURITY_SENSITIVE
R5_DESTRUCTIVE_OR_PRODUCTION
```

Examples that MUST NOT become automatically authorized merely because a coding agent requested them:

```text
production deployment
protected-branch override
credential rotation/ownership changes
raw secret retrieval
destructive database migration
cross-tenant data access
billing/admin policy changes
security-boundary weakening
```

Some actions MAY be human-approvable; others MAY remain denied/non-delegable according to policy.

---

# 28. Secret Isolation and Credential-Bound Actions

The bridge SHALL distinguish:

```text
permission to request an operation
vs
permission to read the credential used by that operation
```

An external development agent SHOULD normally receive a capability handle or result, not a raw long-lived secret.

Required path:

```text
external agent request
  ↓ authorized capability
SmartAIHub Secret Broker / trusted executor
  ↓ credential is injected only into bounded execution
external system
  ↓
redacted result/evidence
```

Long-lived secrets SHALL NOT be copied into provider prompts, MCP tool descriptions, DevelopmentEvent summaries or mobile notifications.

---

# 29. Provider Progress Compatibility Adapter

The implemented Spec 200 provider/session model may expose different event richness by provider/version.

Spec 226 SHALL add a compatibility adapter that maps available provider events into Spec 224's canonical progress projection without altering the original provider runtime authority.

Each provider adapter SHALL declare:

```text
provider_id
adapter_version
observability_level = L0 | L1 | L2 | L3
supported_event_types[]
supports_resume
supports_event_replay
supports_streaming
supports_structured_tool_events
supports_file_diff_events
supports_test_events
supports_nested_agent_lineage
supports_provider_route_events
```

Definitions are owned by Spec 224 Revision 11:

```text
L0 = terminal lifecycle only
L1 = phase/task transitions
L2 = structured tool/file/test/review/approval events where exposed
L3 = rich trace/replay/diff/evidence/lineage where exposed
```

The adapter SHALL never synthesize unsupported fine-grained events merely to make provider dashboards look uniform.

---

# 30. Canonical Event Correlation Across Existing Systems

The compatibility layer SHALL correlate, not duplicate, canonical identities:

```text
DevelopmentRun
  ↕
DevelopmentJob / worker_job
  ↕
Spec 200 provider session
  ↕
Runner execution attempt
  ↕
provider-native event cursor/sequence
  ↕
Spec 224 DevelopmentEvent projection
```

Minimum correlation fields where available:

```text
development_run_id
child_job_id
provider_session_ref
execution_attempt_id
provider_event_id
provider_event_sequence/cursor
correlation_id
causation_id
phase_generation
```

Historical jobs lacking these newer optional references remain valid and SHALL not require destructive backfill.

---

# 31. Progress Replay, Reconnect and Polling

An external client such as Codex/Claude/Hermes/ZCode MAY be used as a control surface even while another provider executes the task.

The bridge SHALL support at least cursor-based status/event reads:

```text
get run status
get events since cursor
```

Streaming/watch MAY be exposed when the transport and client support it.

After disconnect:

```text
client reconnects
→ authenticates again
→ supplies run_id + last accepted cursor
→ server authorizes current access
→ returns/replays canonical newer events
→ duplicate provider events remain deduplicated
```

A reconnect SHALL NOT revive an expired privilege grant or stale approval.

---

# 32. External Development MCP Bridge

Without rewriting Spec 199, Spec 226 SHALL register/map a bounded development-control tool family to Spec 224 logical operations.

Recommended logical surface:

```text
development.run.create
development.run.get
development.run.continue
development.run.pause
development.run.cancel
development.run.events
development.plan.get
development.plan.replan.request
development.decision.get
development.decision.respond
development.evidence.submit
development.verify.request
development.final_verify.request
```

Rules:

1. Each call is server-authorized independently.
2. Tool descriptions SHALL NOT contain secrets or implicit privilege escalation instructions.
3. Generic arbitrary shell/database/root tools are not substitutes for the semantic control contract.
4. Side effects ultimately dispatch through canonical SmartAIHub execution infrastructure.
5. `final_verify.request` requests verification; it does not let the caller self-certify.
6. MCP caller identity is not automatically the executor identity.
7. Existing non-development Spec 199 tools remain compatible.

---

# 33. Bidirectional Provider Role Model

A single provider product may appear in different roles:

```text
CONTROL_CLIENT
PLANNER
IMPLEMENTER
DEBUGGER
REVIEWER
VERIFIER_CANDIDATE
```

Example:

```text
User → Codex (CONTROL_CLIENT)
Codex → SmartAIHub MCP → Spec 224
Spec 224 → Claude (REVIEWER)
Spec 224 → Codex child session (IMPLEMENTER)
```

The bridge SHALL preserve separate caller/session/executor identities even when they share the same provider brand.

---

# 34. Recursion / Self-Delegation Guard

The bridge SHALL propagate:

```text
parent_run_id
parent_task_id
caller_session_ref
executor_session_ref
delegation_depth
idempotency_key
phase_generation
```

and SHALL reject/fence unsafe re-entrant loops such as an external agent repeatedly calling a DevelopmentRun that selects the same caller session as its child executor.

Default maximum delegation depth SHALL be policy-configurable; exceeding it SHALL produce a structured blocker rather than silent recursion.

---

# 35. External Client Read vs Control Permissions

Progress visibility SHALL be independently permissioned from mutation/control.

Example profiles:

```text
Observer
  development.run.read
  development.run.events.read

Developer
  Observer + run.create/continue + scoped source/test execution

Maintainer
  Developer + broader review/repair/replan rights

Release Approver
  explicitly scoped release/production approval rights
```

A client may therefore observe Claude/Hermes/ZCode progress from Codex without having permission to modify or cancel that run.

---

# 36. Provider Capability Reality Check

Provider adapters SHALL be capability-probed/versioned rather than assuming uniform features.

Current integration evidence supports designing for heterogeneous capability sets. For example, Hermes documents MCP client support with per-server tool filtering and can also run an MCP server; ZCode's plugin system documents skills, sub-agents, Hooks and MCP declarations, including permission-related Hook events. These are useful integration seams but remain provider-version-specific and SHALL be certified through adapters before production use.

Provider-specific functionality MAY improve observability or control, but Spec 226 SHALL preserve a lowest-common-denominator status/event path for clients that cannot stream rich events.

Reference evidence used for this revision:

- Hermes MCP feature/reference: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md`
- Hermes CLI MCP/ACP commands: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md`
- ZCode plugin/MCP/Hook development contract: `https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md`

These references are informative capability evidence. Runtime adapter probes/certification remain normative because provider features can change.

---

# 37. Revision 2 Feature Flags

Add independently rollbackable flags such as:

```text
external_dev_control_bridge_v1
development_mcp_tools_v1
development_caller_lineage_v1
development_scoped_permissions_v1
development_tool_visibility_filter_v1
development_secret_bound_actions_v1
provider_progress_normalization_v1
provider_progress_replay_v1
external_dev_progress_read_v1
external_dev_progress_stream_v1
external_dev_recursion_guard_v1
```

Disabling these flags SHALL return the affected path to the pre-Revision-2 baseline without corrupting canonical DevelopmentRuns/jobs.

---

# 38. Revision 2 Migration Strategy

The bridge SHALL be introduced additively:

```text
Phase A — contract/schema additions + no behavior change
Phase B — read-only progress projection from existing provider sessions
Phase C — external MCP run/status controls in OBSERVE/SHADOW
Phase D — scoped ASSISTED create/continue for development environments
Phase E — multi-provider progress + delegated execution
Phase F — high-risk approvals only after security/permission certification
```

No migration step may require rewriting historical Spec 200 provider sessions or old `worker_jobs` merely to make new fields non-null.

---

# 39. Revision 2 Required Compatibility & Security Tests

Add at minimum:

1. Existing Spec 199 non-development MCP tools behave unchanged with Revision 2 disabled.
2. Existing Spec 200 invocation/session lifecycle behaves unchanged when progress adapter is disabled.
3. Authenticated external client without `development.run.create` cannot start a run.
4. Client with run-read scope but no mutation scope can observe progress but cannot continue/cancel.
5. Project-A client cannot read Project-B run/events.
6. Repo/path/branch scope is enforced on requested source mutation.
7. Expired delegated grant is rejected after reconnect.
8. Provider-side approval does not bypass SmartAIHub server authorization.
9. SmartAIHub approval does not bypass a stricter provider-side sandbox when that provider requires one.
10. Raw credential is not returned to an agent that is allowed only to request a credential-bound operation.
11. Progress events containing secret-like output are redacted/quarantined according to security policy.
12. L0 provider does not produce fabricated L2/L3 events.
13. Replay from event cursor does not duplicate canonical progress.
14. Out-of-order provider events cannot regress DevelopmentRun phase generation.
15. Same provider used as caller and executor cannot create an infinite self-delegation loop.
16. Codex-like external client can request status of a run currently executed by another provider when authorized.
17. `final_verify.request` cannot directly mark the run complete.
18. External caller cannot grant itself new scopes/roles through tool input or repository content.
19. Feature-flag rollback disables external control while leaving existing DevelopmentRun/job state intact.
20. Historical jobs/sessions without new metadata continue to render and reconcile.

---

# 40. Revision 2 Acceptance Criteria

Spec 226 Revision 2 is complete when:

- [ ] Spec 199/200 historical implementation contracts remain identifiable and are not retroactively rewritten;
- [ ] external development clients can enter Spec 224 through a bounded compatibility bridge;
- [ ] all external development commands are server-authorized by principal, capability, resource, environment, risk and policy;
- [ ] progress-read permission is separable from mutation/control permission;
- [ ] caller/actor/executor/delegation lineage survives end-to-end;
- [ ] provider progress normalizes to Spec 224 L0–L3 observability without fabricated events;
- [ ] disconnect/reconnect uses replay cursors and does not restore expired authority;
- [ ] external clients can observe canonical progress for other eligible executors;
- [ ] raw long-lived secrets are not exposed merely because an agent can invoke a credentialed action;
- [ ] recursion/self-delegation loops are bounded/fenced;
- [ ] old jobs/provider sessions remain compatible without destructive backfill;
- [ ] all new behavior is independently feature-flagged and rollbackable;
- [ ] no second MCP Gateway, External Agent Gateway, Approval Service, job plane or DevelopmentRun authority is created.

---

# 41. Revision 2 Final Architectural Rule

> **Spec 226 is the additive compatibility bridge that lets new Spec 224/225 control and observability contracts safely traverse the already-implemented SmartAIHub baseline. External agents may request and observe development work, but they do not inherit SmartAIHub authority merely by connecting through MCP or an existing agent adapter.**


---

# 42. Revision 3 Amendment — Production-Grade Bridge Security, Replay, Interoperability & Standards Alignment

**Amendment date:** 2026-09-22  
**Revision purpose:** close the bridge-specific gaps found by a 24-dimension production audit of Revision 2 while preserving the central rule that Spec 226 is an additive compatibility bridge, not a second runtime.

Revision 3 is additive and normative.

---

# 43. Spec 224 / 225 / 226 Interface Lock

Spec 226 SHALL consume explicit versioned logical contracts rather than relying on undocumented implementation shape.

Introduce a logical `BridgeContractManifest` containing at least:

```text
bridge_version
spec224_command_contract_version
spec224_event_contract_version
spec224_decision_contract_version
spec225_attention_contract_version
feature195_job_projection_version
feature196_ingress_adapter_version
spec199_mcp_mapping_version
spec200_provider_adapter_version
spec208_handoff_contract_version
supported_min_client_versions
capability_flags
created_at
```

At startup/deploy/canary, incompatible required versions SHALL fail the affected bridge capability closed while leaving unrelated historical paths available.

Spec 226 SHALL NOT silently reinterpret a field because a newer Spec changed its semantics.

---

# 44. Deep-Link / Resume Token Security Contract

Revision 2 required short-lived opaque tokens. Revision 3 strengthens this into a testable anti-replay contract.

A deep-link/resume token SHALL be either:

```text
A. opaque random reference resolved server-side
or
B. cryptographically protected token validated by a trusted server component
```

It SHALL bind or resolve to at least:

```text
token_id / jti equivalent
intended user/principal
intended tenant
source object type/id
allowed interaction class
issued_at
expires_at
state/version or decision_epoch where relevant
single_use / max_uses policy
```

Rules:

1. the token is not an authorization grant by itself;
2. user authentication and current server authorization are always re-evaluated;
3. approval/decision actions SHALL compare current decision epoch/version;
4. replay of a single-use action token SHALL be rejected and audited;
5. token identifiers SHALL be revocable;
6. lock-screen/push payloads SHALL not carry raw privileged action parameters;
7. clock-skew tolerance SHALL be centrally defined and bounded;
8. expired/superseded tokens SHALL resolve to current state when safe, not to stale mutation rights.

---

# 45. External Authentication Security Profile

Where external/mobile control uses OAuth 2.0 or OAuth-derived flows, implementation SHALL follow the current approved OAuth security profile, with RFC 9700 / BCP 240 as the baseline reference for this revision.

At minimum where applicable:

```text
exact redirect URI matching
short-lived access grants
audience/resource restriction
state/nonce protections appropriate to the flow
PKCE for public-client authorization-code flows
refresh-token rotation/revocation according to platform policy
no bearer tokens in URLs or notification payloads
no open redirectors
```

Existing SmartAIHub authentication remains canonical; this section does not require replacing a different secure existing mechanism with OAuth.

---

# 46. External Development API Contract Versioning

Spec 226's external logical operations SHALL expose an explicit compatibility version independent of MCP/provider version.

Version at minimum:

```text
caller envelope
development command request/response
event/status projection
attention action envelope
human decision response
provider capability manifest
error envelope
```

Rules:

- compatible additive evolution MAY remain within a supported contract version;
- breaking semantic changes REQUIRE a new contract version;
- supported old clients receive a compatible projection or explicit unsupported-version response;
- feature flags SHALL not silently change response semantics under the same declared version;
- consumer/provider contract fixtures SHALL be retained for every supported version.

For HTTP APIs, error details SHOULD use RFC 9457 Problem Details or the platform's centrally standardized equivalent.

---

# 47. Idempotency Contract for Bridge Mutations

Network retry is expected on mobile and external-agent channels.

The following logical operations SHALL be idempotent by construction or require an idempotency key / unique action token:

```text
run.create
run.continue
run.pause
run.cancel
decision.respond
approval.respond
capture finalize
human-handoff accept/return
notification action acknowledgement
```

An idempotency key SHALL be scoped to principal + tenant + logical operation + target resource and SHALL have a bounded retention policy.

A replay with mismatched payload under the same key SHALL be rejected rather than treated as equivalent.

---

# 48. Progress Cursor Lifecycle and Resynchronization

Every cursor-based status/event API SHALL document:

```text
cursor scope
retention horizon
compaction behavior
maximum page/replay size
ordering guarantee
deduplication identifier
authorization re-check
```

If the supplied cursor is expired, compacted or invalid for the current scope, the bridge SHALL return a structured `RESYNC_REQUIRED` response with:

```text
authorized canonical run/status snapshot
snapshot/version timestamp
new cursor
minimum retained boundary
historical-detail-loss indicator
```

The bridge SHALL NOT infer missing state by fabricating provider events.

A cursor copied across user/tenant/project scope SHALL provide no authority and SHALL be rejected.

---

# 49. Event Interoperability Mapping

Canonical Spec 224 events remain authoritative. For cross-service/external streaming interoperability, Spec 226 SHOULD provide a CloudEvents 1.0.2-compatible mapping or documented equivalent.

Minimum transport mapping SHOULD preserve:

```text
event_id
source
type
subject
time
schema/version
correlation_id
causation_id
run_id
phase_generation
trace context
```

Large diffs, screenshots, logs, code or evidence SHALL be referenced via protected artifact/evidence handles, not copied into general event envelopes.

Transport formatting SHALL NOT alter authorization or lifecycle semantics.

---

# 50. Backpressure, Rate Limit and Connection Control

The bridge SHALL protect canonical runtimes from overloaded clients, reconnect storms and notification/provider outages.

Controls SHALL include as applicable:

```text
per-principal request limits
per-tenant concurrency limits
stream/watch connection limits
polling minimum interval + jitter
provider quota awareness
bounded notification retries
bounded replay page sizes
server-side admission/backpressure
```

Responses SHOULD expose retry guidance such as `Retry-After` where the transport supports it.

Rate limiting SHALL NOT convert a DevelopmentRun to FAILED. It SHALL produce an explicit capacity/rate-limited bridge state while canonical work continues when possible.

---

# 51. Bridge Circuit Breakers and Safe Degradation

Spec 226 SHALL support independently scoped circuit breakers for:

```text
external development mutation
external development read/watch
mobile approval actions
browser human-handoff entry
notification channel/provider
capture ingestion adapter
provider progress adapter
```

When a bridge path is unhealthy:

```text
stop or degrade the affected adapter
preserve canonical run/job state
retain read-only visibility when safe
avoid duplicate external side effects
surface operator telemetry
allow rollback to historical baseline path
```

The bridge SHALL never require a global SmartAIHub outage solely because one delivery/control adapter is unhealthy.

---

# 52. OpenTelemetry Bridge Observability Profile

Production implementation SHALL use a version-pinned OpenTelemetry profile for cross-device/external-control observability.

Trace correlation SHOULD cover:

```text
client request
→ authentication
→ authorization
→ bridge adapter
→ Spec 224/Feature 196 logical operation
→ worker_job/provider action when applicable
→ response/event delivery
```

Common attributes, subject to privacy policy:

```text
service.name
client surface class
bridge contract version
tenant-safe identifier or hash
run/job correlation
provider adapter version
observability level
authorization result class
rate-limit/backpressure class
error.type
```

Do not place raw secrets, authorization tokens, source code, private prompts or sensitive captured media in telemetry attributes.

---

# 53. Projection Rebuildability and Disaster Recovery

Attention and notification state are projections/delivery records and SHALL be recoverable without mutating canonical job/development truth.

For each projection table, document:

```text
canonical source(s)
rebuild algorithm
rebuild checkpoint/cursor
retention assumptions
idempotency keys
maximum acceptable lag
reconciliation procedure
```

Disaster-recovery tests SHALL demonstrate that loss/corruption of bridge projections can be repaired from canonical sources or backups without creating duplicate approvals/actions.

If historical source events have aged out, restore SHALL use the latest authoritative snapshot plus retained audit/evidence according to policy; missing history SHALL be explicit.

---

# 54. Device / Push Endpoint Lifecycle and Privacy

Push endpoints and device-installation identifiers are security/privacy-sensitive identifiers.

The bridge SHALL support:

```text
endpoint registration
endpoint rotation
logout revocation
account/device unlink
provider invalid-token cleanup
per-channel opt-out
quiet-hours/preferences
retention/deletion policy
tenant/user ownership verification
```

A device identifier SHALL NOT be treated as a stable human identity.

Uninstall or stale push-token cleanup SHALL NOT delete canonical attention/run records.

---

# 55. Client Capability Negotiation and Compatibility Matrix

`app_version` alone SHALL NOT decide feature eligibility.

Clients SHOULD negotiate declared capabilities such as:

```text
supports_event_stream
supports_cursor_replay
supports_attention_actions
supports_decision_epoch
supports_capture_bundle_version
supports_handoff_view
supports_rfc9457_errors
supported_contract_versions[]
```

The server SHALL select only mutually supported behavior and SHALL not send consequential action formats a client cannot safely interpret.

A maintained compatibility matrix SHALL cover at least the current production client and the explicitly supported previous client generation(s), according to product policy.

---

# 56. Standards & Best-Practice Alignment Profile

Spec 226 SHALL maintain a versioned crosswalk against applicable widely adopted references. Baseline references for this revision:

```text
RFC 9700 / BCP 240
  OAuth 2.0 security best current practice where OAuth is used

RFC 9457
  HTTP Problem Details for machine-readable API errors

RFC 9110
  HTTP semantics/idempotency considerations

CloudEvents 1.0.2
  event-envelope interoperability where external event transport is exposed

OpenTelemetry Semantic Conventions
  interoperable traces/metrics/logs; implemented version must be pinned

OWASP Top 10 for Agentic Applications 2026
  threat-model crosscheck for external agent control/delegation/tool exposure

NIST SP 800-218 SSDF 1.1
  secure implementation/change-management practices for bridge code and adapters

NIST AI RMF 1.0 + NIST AI 600-1 GAI Profile
  governance/risk crosscheck for AI-agent mediated control paths
```

Spec 226 SHALL inherit SLSA/source/build provenance requirements from the canonical software-development/release system rather than inventing a second provenance scheme.

Standards alignment does not itself constitute certification.

---

# 57. Revision 3 Required Tests

In addition to all Revision 1/2 tests, add at minimum:

1. BridgeContractManifest detects an incompatible Spec 224 event contract and disables only the affected adapter.
2. Single-use deep-link action token replay is rejected after the first successful action.
3. Stolen/copied deep-link token cannot act under another authenticated tenant/user.
4. Expired/superseded decision token opens current state but cannot execute the stale decision.
5. Clock-skew boundary tests do not turn an expired token into a long-lived grant.
6. OAuth redirect validation rejects non-exact/unapproved redirect targets where OAuth is used.
7. Retried `decision.respond` with same idempotency key does not duplicate the decision side effect.
8. Same idempotency key with a different payload is rejected.
9. Expired event cursor returns `RESYNC_REQUIRED` with snapshot and new cursor.
10. Cursor from Project A cannot read Project B events.
11. CloudEvents transport mapping round-trips canonical event identity/correlation without becoming source of truth.
12. Reconnect storm triggers rate/backpressure controls without failing canonical DevelopmentRuns.
13. Notification provider outage trips only notification circuit breaker and leaves run state intact.
14. External mutation circuit breaker disables mutation while read-only progress remains available when policy permits.
15. OpenTelemetry trace correlates ingress/authz/bridge/run/provider path without leaking tokens/secrets.
16. Attention projection database loss can be rebuilt/reconciled without duplicate approvals.
17. Revoked push endpoint receives no subsequent deliveries while underlying attention remains canonical.
18. Old supported client receives a safe compatible response projection after server upgrade.
19. Unsupported contract version receives explicit version error rather than silent field reinterpretation.
20. Agentic control threat tests cover prompt/tool-output injection, excessive scope request, delegation recursion and stale approval races.

---

# 58. Revision 3 Acceptance Criteria

Revision 3 is complete when:

- [ ] bridge interfaces are explicitly versioned and compatibility-locked;
- [ ] deep-link/resume actions have short-lived, scoped, replay-safe semantics;
- [ ] external auth follows the approved security profile for the mechanism actually used;
- [ ] mutating bridge actions are idempotent under retries;
- [ ] cursor expiry/compaction produces deterministic resynchronization;
- [ ] external event transport has a documented interoperable envelope mapping;
- [ ] bridge overload cannot overload or corrupt canonical runtimes;
- [ ] adapter-specific circuit breakers permit safe degradation;
- [ ] cross-device/external traces are correlated using an OpenTelemetry profile with redaction;
- [ ] projections can be rebuilt/reconciled after loss without duplicate consequential actions;
- [ ] push/device identifiers have revocation, cleanup and privacy lifecycle;
- [ ] client capability/version negotiation prevents unsafe interpretation;
- [ ] standards alignment is evidence-backed and does not create false certification claims;
- [ ] all Revision 1 and Revision 2 acceptance criteria remain satisfied.

---

# 59. Twenty-Four-Dimension Production Audit Record — Spec 226

| Round | Dimension | Result after Revision 3 |
|---:|---|---|
| 1 | Ownership / source of truth | PASS — bridge remains non-authoritative |
| 2 | Historical-baseline preservation | PASS — additive upgrade rule retained |
| 3 | Spec 224/225 contract drift | HARDENED — BridgeContractManifest added |
| 4 | Authentication | HARDENED — mechanism-specific security profile added |
| 5 | Authorization / scoped permissions | PASS — server-side capability/resource/risk checks retained |
| 6 | Delegation / recursion | PASS — caller/actor/executor lineage and depth fencing retained |
| 7 | Deep-link/token replay | HARDENED — jti/scope/expiry/single-use/current-state semantics added |
| 8 | Idempotent mobile/network retry | HARDENED — mutation idempotency contract added |
| 9 | Event correlation / ordering | PASS — canonical correlation remains explicit |
| 10 | Cursor replay / compaction | HARDENED — lifecycle + `RESYNC_REQUIRED` contract added |
| 11 | API/schema evolution | HARDENED — explicit version/deprecation/contract-test rules added |
| 12 | Event interoperability | HARDENED — CloudEvents 1.0.2 mapping profile added |
| 13 | Observability | HARDENED — OpenTelemetry trace/metric/log profile added |
| 14 | Rate limit / backpressure | HARDENED — reconnect/poll/stream controls added |
| 15 | Circuit breaking / safe degradation | HARDENED — adapter-scoped breakers added |
| 16 | Notification failure isolation | PASS — delivery never owns job finality; breaker added |
| 17 | Projection rebuild / DR | HARDENED — rebuild/reconciliation contract added |
| 18 | Privacy / push/device lifecycle | HARDENED — revocation/cleanup/retention contract added |
| 19 | Tenant isolation | PASS — cross-tenant leakage remains release-blocking |
| 20 | Secret isolation | PASS — credential-bound action model retained |
| 21 | Provider capability heterogeneity | PASS — L0–L3 capability declaration retained |
| 22 | Client compatibility negotiation | HARDENED — capability negotiation + compatibility matrix added |
| 23 | Security/agentic threat model | HARDENED — standards/control crosswalk required |
| 24 | Rollback / production release | PASS — independent feature flags and historical path retained |

---

# 60. Revision 3 Final Architectural Rule

> **Spec 226 is a narrow, versioned, replay-safe and observable compatibility bridge. It may adapt identities, commands, progress, attention and control across old and new surfaces, but it never becomes the lifecycle, authorization, job, approval, browser or provider source of truth. Every cross-device/external action must remain current-state authorized, idempotent under retry, safe under replay, degradable under partial outage, and compatible with the canonical runtime it bridges.**
---

# 61. Revision 4 Amendment — Second Independent 24-Round Production Audit

**Amendment date:** 2026-09-22  
**Revision purpose:** close residual cross-device/browser/mobile gaps discovered after Revision 3, especially first-party browser session security, offline consequential actions, risk-based reauthentication and secure multimodal capture ingestion.

Revision 4 is additive and normative. Spec 226 remains a compatibility bridge and SHALL NOT become a second Identity, Asset, Approval, Notification, Job, DevelopmentRun or Policy source of truth.

---

# 62. First-Party Browser / PWA Session and Request-Forgery Security

Revision 3 defined external OAuth security but cross-device control also includes browser/PWA surfaces using existing SmartAIHub sessions.

Where cookie-based browser authentication is used, implementation SHALL use the canonical Identity/session controls and enforce as applicable:

```text
Secure cookies
HttpOnly for session secrets
SameSite policy appropriate to the flow
CSRF protection for state-changing requests
session rotation after authentication/privilege change
bounded session lifetime and revocation
no state-changing GET semantics
exact/allowlisted redirect destinations
```

For WebSocket or equivalent bidirectional browser channels:

```text
validate authenticated session at connection establishment
validate expected Origin where browser Origin is available
re-authorize consequential operations server-side
bind subscriptions to authorized tenant/user/resource scope
do not treat connection possession as durable authorization
expire/revalidate long-lived connections according to policy
```

CORS, CSRF and Origin checks are transport defenses; none replace server-side authorization.

---

# 63. Risk-Based Reauthentication and Sensitive Action Confirmation

A valid existing session does not imply that every high-risk cross-device action should execute without renewed user assurance.

The canonical Identity/Approval/Policy systems MAY require step-up authentication or explicit reconfirmation for classes such as:

```text
production release/promotion
credential or secret ownership changes
high-cost budget expansion
destructive repository/data actions
security-boundary changes
account/device recovery
new privileged device enrollment
other centrally classified R4/high-risk actions
```

Spec 226 SHALL carry the resulting assurance/authentication context but SHALL NOT invent its own identity factor system.

A push tap, deep-link open, biometric local unlock or possession of a registered device SHALL NOT by itself satisfy a server-required step-up authentication level.

---

# 64. Offline and Stale Consequential Action Semantics

Cross-device clients may be offline or reconnect after long delays.

Consequential actions SHALL NOT be executed from an offline queue merely because the user previously tapped a stale UI control.

Rules:

1. clients MAY queue non-consequential drafts/navigation/read intentions locally;
2. approval, decision, cancel, deploy/release, budget expansion, takeover and other consequential mutations MUST re-read authoritative state after connectivity returns;
3. the server SHALL re-authenticate/re-authorize and compare decision epoch/source version/idempotency scope before mutation;
4. a stale offline action SHALL resolve to current state plus an explanatory result, not silently apply to a superseded object;
5. user-entered text or draft decision rationale MAY be preserved locally, but submission is a new online authorized operation;
6. background retry SHALL stop when the action is expired, superseded, revoked or no longer authorized.

This prevents convenient offline UX from becoming delayed privilege replay.

---

# 65. CaptureBundle Ingestion Security, Integrity and Privacy

Mobile/share-sheet/camera capture is an ingestion boundary, not a trusted internal artifact merely because it originated from a user's device.

Spec 226 SHALL route captured bytes through the canonical Library/Asset ingestion path and require that path to provide or integrate equivalent controls for:

```text
user/OS permission and intentional capture/share action
size/quota limits
content-length and streaming limits
MIME/type validation using content inspection, not filename alone
cryptographic content digest
upload completion/integrity verification
malware/active-content scanning where applicable
archive/decompression-bomb limits where applicable
quarantine until required ingestion checks complete
metadata classification
EXIF/GPS/location metadata handling according to privacy policy
retention/deletion policy
cross-tenant ownership checks
```

Raw capture metadata SHALL be minimized. Precise location metadata SHALL NOT be propagated into prompts, notifications, telemetry or external providers unless required by the user's task and authorized by privacy/data-egress policy.

A `CaptureBundle` SHALL reference accepted canonical assets; orchestration state SHALL NOT become an alternate unscanned blob store.

Resumable/chunked uploads SHALL verify the final assembled digest and authorization before canonicalization.

---

# 66. Notification Delivery Semantics and Action Separation

Notification delivery is inherently best-effort and may be duplicated, delayed or reordered.

The bridge SHALL model delivery separately from canonical attention/decision state.

Required semantics:

```text
delivery may be at-least-once
delivery order is not authoritative
notification acknowledgement != decision resolution
push provider receipt != user acknowledgement
opening notification != approving action
```

Notification actions SHALL carry/recover canonical object identifiers and current version/decision epoch, then execute only through the normal server-authorized action path.

Deduplication SHOULD use a stable logical notification/attention identity while permitting multiple physical provider delivery attempts.

---

# 67. Revision 4 Required Tests

Add at minimum:

1. cross-site request cannot perform a cookie-authenticated consequential mutation without the required CSRF protection.
2. browser WebSocket/SSE-style control channel with an unapproved Origin cannot obtain consequential control.
3. long-lived browser connection whose session/role is revoked cannot continue issuing authorized mutations.
4. session privilege elevation rotates/refreshes the applicable session security context.
5. high-risk action requiring step-up authentication is rejected when the client has only a normal session or local biometric unlock.
6. push/deep-link possession alone cannot satisfy server-side step-up requirement.
7. approval tapped offline and submitted after its decision epoch changes is rejected as stale and returns current state.
8. offline queued cancel does not cancel a different/new run generation after reconnect.
9. locally drafted rationale survives reconnect but is submitted only through a fresh authorized request.
10. uploaded file whose extension/MIME claim disagrees with inspected content is rejected or quarantined according to canonical Asset policy.
11. interrupted/chunked capture upload with wrong assembled digest does not become a canonical asset.
12. oversized/archive-bomb style capture is bounded before uncontrolled resource expansion.
13. cross-tenant CaptureBundle asset reference is rejected.
14. EXIF/GPS metadata does not leak to notification/telemetry/provider when the task does not require it.
15. duplicate/reordered push deliveries do not duplicate or reorder canonical decision state.
16. provider push delivery receipt cannot mark an attention item resolved.
17. all Revision 1–3 bridge paths remain operational when the new browser/capture hardening flags are disabled during rollback.

---

# 68. Revision 4 Acceptance Criteria

Revision 4 is complete when:

- [ ] first-party browser/PWA mutation paths have explicit session/CSRF/Origin security contracts;
- [ ] long-lived control channels re-evaluate authorization rather than relying on connection possession;
- [ ] centrally classified high-risk actions can require step-up authentication without Spec 226 owning identity factors;
- [ ] consequential offline actions always revalidate current canonical state before execution;
- [ ] CaptureBundle bytes enter through canonical validated/quarantined Asset ingestion;
- [ ] upload integrity and cross-tenant ownership are verified before canonicalization;
- [ ] sensitive capture metadata, including precise location where applicable, is minimized and policy-governed;
- [ ] notification delivery/acknowledgement remains separate from canonical decision resolution;
- [ ] duplicate/delayed/reordered notifications are safe;
- [ ] all Revision 1–3 acceptance criteria remain satisfied.

---

# 69. Second Independent Twenty-Four-Dimension Audit Record — Spec 226

| Round | Dimension | Result after Revision 4 |
|---:|---|---|
| 1 | Bridge ownership/non-authority | PASS |
| 2 | Historical baseline/additive migration | PASS |
| 3 | Contract/version drift | PASS — R3 interface lock retained |
| 4 | External OAuth authentication | PASS |
| 5 | First-party browser session/CSRF/Origin | **HARDENED — explicit browser/PWA contract added** |
| 6 | Authorization/resource/tenant scope | PASS |
| 7 | High-risk reauthentication | **HARDENED — step-up handoff contract added** |
| 8 | Deep-link/token replay | PASS |
| 9 | Offline/stale mutation safety | **HARDENED — fresh-state requirement added** |
| 10 | Mutation idempotency | PASS |
| 11 | Event/cursor replay/resync | PASS |
| 12 | Provider progress heterogeneity | PASS |
| 13 | Backpressure/reconnect storms | PASS |
| 14 | Circuit breakers/degraded mode | PASS |
| 15 | Notification delivery semantics | **HARDENED — delivery vs resolution separation added** |
| 16 | Capture ingestion integrity/security | **HARDENED — canonical validation/quarantine contract added** |
| 17 | Capture metadata/privacy | **HARDENED — EXIF/GPS minimization and egress rule added** |
| 18 | Device/push endpoint lifecycle | PASS |
| 19 | Projection rebuild/DR | PASS |
| 20 | Secret isolation | PASS |
| 21 | API/client compatibility negotiation | PASS |
| 22 | Observability/redaction | PASS |
| 23 | Agentic security/delegation recursion | PASS |
| 24 | Rollback/release/standards alignment | PASS |

---

# 70. Revision 4 Final Architectural Rule

> **Spec 226 SHALL make cross-device control convenient without turning device possession, push delivery, browser connection state, offline queues or captured files into authority. Every consequential action returns to current canonical server state, identity and policy; every captured asset returns to canonical validated ingestion; and every notification remains a transport hint rather than a lifecycle decision.**
---

# 71. Revision 5 Amendment — Existing AI Chat & Task Control Full-Control Upgrade Bridge

**Amendment date:** 2026-09-22  
**Revision purpose:** upgrade the already-present Web `AI Chat & Feedback` / `Task Control Center` experience into a complete command, monitoring, alert and decision surface while preserving the implemented Feature 195/196 baseline and adopting Specs 224/225 contracts additively.

Revision 5 is additive and normative. It SHALL NOT create another Chat runtime, job store, DevelopmentRun runtime, Approval service, Attention source-of-truth or Notification authority.

---

# 72. Current UI Baseline and Upgrade Intent

The current Web shell contains:

```text
AI Chat & Feedback
├── AI Chat
├── Task Control
└── Send Feedback
```

The current Task Control Center already provides a `Start a task in Chat` entry and readiness summaries such as:

```text
CHAT
JOBS
RUNNER
MCP
```

Revision 5 SHALL preserve this familiar shell while expanding Task Control from a readiness/start utility into a full operational control center.

The current UI is a migration starting point, not a second control architecture.

---

# 73. TaskControlProjection Bridge

Spec 226 SHALL build/reconcile a read projection suitable for Task Control from existing canonical domains.

Logical sources include:

```text
Feature 195 worker_jobs/events
Spec 224 DevelopmentRuns/events/decisions
Specs 200/206 external-agent sessions/tasks
Spec 208 browser/computer handoff state
shared Approval Service
existing media/workflow/publishing job state where registered
Spec 225 AttentionProjection
```

The projection MAY normalize presentation fields such as title, state family, health, progress summary and available actions, but it SHALL retain:

```text
source_domain
source_object_type
source_object_id
source_version/generation
```

and SHALL re-read the canonical source before any consequential action.

---

# 74. AI Chat Command Bridge

Natural-language control remains owned at the interaction/orchestration layer by Feature 196 and domain runtimes.

Revision 5 SHALL add an adapter path:

```text
AI Chat message
   ↓
Feature 196 intent/context resolution
   ↓
semantic task-control command
   ↓
source domain command API
   ├─ Spec 224 DevelopmentCommandGateway
   ├─ Feature 195 generic job control where supported
   ├─ Approval/Decision API
   ├─ Spec 208 handoff/control API
   └─ other registered domain action
```

The adapter SHALL NOT implement `pause`, `cancel`, `approve`, `replan` or similar operations by mutating database fields directly.

---

# 75. Task Control Command Bridge

Buttons/menus in Task Control SHALL invoke the same semantic domain commands that Chat resolves to.

Common UI labels MAY include:

```text
Pause
Continue / Resume
Cancel
Retry
Replan
Review / Verify
Provide Input
Respond to Decision
Approve / Deny
Take Over / Return Control
Open in Chat
```

The bridge SHALL request `available_actions[]` or equivalent from the canonical source adapter. Unsupported actions SHALL not be guessed from state labels.

---

# 76. Task Control Query API / Logical Surface

Recommended logical read/query surface:

```text
task_control.list
task_control.get
task_control.events
task_control.attention.list
task_control.readiness.get
```

Recommended semantic mutations route to source operations such as:

```text
development.run.pause/resume/cancel/replan/...   → Spec 224
worker_job.pause/cancel/retry where supported    → Feature 195/domain adapter
decision.respond                                 → canonical decision owner
approval.respond                                 → shared Approval Service
operator.takeover/return                         → Spec 208
```

The exact REST/RPC route shape MAY follow the repository's existing conventions; the ownership semantics are normative.

---

# 77. Task Control Center Information Architecture Upgrade

The Web Task Control tab SHALL include at minimum:

```text
A. Command / Start in Chat
B. Needs Attention
C. Active / Queued / Paused / Waiting tasks
D. Recent Completed / Failed / Cancelled
E. Task filters + search
F. Selected task detail
G. Progress / event timeline
H. Decisions / approvals / requested input
I. Rich Review Mode (diff/tests/security/browser evidence/cost/artifacts)
J. Artifacts / evidence / results
K. Controls
L. Compact Execution Readiness
```

The existing large readiness cards SHOULD be refactored into a compact health strip, collapsible section or secondary region so operational work remains the primary focus.

---

# 78. Readiness Adapter Semantics

The existing readiness categories SHALL be mapped to explicit health semantics.

Example:

```text
CHAT     Ready
JOBS     3 active · 2 queued
RUNNER   2/2 online
MCP      0/1 connected · degraded
```

Each category SHALL expose:

```text
state = READY | DEGRADED | UNAVAILABLE | UNKNOWN
last_checked_at
source of truth
impact summary
recovery/reconnect action when authorized
```

`MCP 0/1` SHALL NOT automatically imply all work is blocked. The UI SHALL identify capabilities/tasks actually affected.

---

# 79. Needs Attention Integration in the Existing Modal

The Task Control tab SHALL display an in-tab Needs Attention section and badge.

The AI Chat tab MAY display the same badge and render the highest-priority items inline.

Attention sources MAY include:

```text
Spec 224 HumanDecision
shared Approval
external-agent input request
browser/computer human handoff
budget decision
recoverable failure needing user choice
result/review request where configured
```

Actions SHALL always resolve through the canonical source object/version.

---

# 80. Decision Handling from AI Chat and Task Control

For a canonical decision, both surfaces SHALL render equivalent semantics:

```text
reason
impact/risk
choices
recommended/default-safe choice if policy allows
evidence summary
cost implication where relevant
expiry/supersession
```

Chat MAY present conversational prose plus buttons; Task Control MAY present structured cards/detail drawers.

Both SHALL submit the same `decision_id + decision_epoch + source_version + idempotency_key` contract. When compact Chat evidence is insufficient, `Review details` SHALL open Task Control Rich Review Mode in the first-party shell and return the decision through the same canonical contract; no CLI/manual backend action is required for normal human decisions.

If a decision is answered elsewhere, the current surface SHALL reconcile to `resolved/superseded` rather than present an executable stale choice.

---

# 81. Generic Task State Families for UI

For filtering/presentation, Spec 226 MAY map heterogeneous canonical states into non-authoritative families:

```text
QUEUED
RUNNING
PAUSED
WAITING_SYSTEM
WAITING_HUMAN
RECOVERING
COMPLETED
FAILED
CANCELLED
```

The original canonical state SHALL remain available for details and action computation.

Presentation-family mapping SHALL be versioned/tested; it SHALL NOT be used as a substitute for domain state machines.

---

# 82. Cross-Domain Control Behavior

Task Control SHALL support both generic jobs and rich domain runs.

Examples:

```text
Image generation worker_job
→ monitor / cancel / retry if domain supports it

Video generation
→ monitor / cancel / retry / view artifact

DevelopmentRun
→ pause / continue / cancel / retry / replan / decisions / verify

Browser Operator
→ monitor / human takeover / return control

External Agent task
→ monitor / input response / cancel where supported
```

The UI SHALL not expose development-specific controls such as `Replan` on a task whose source domain has no such semantic operation.

---

# 83. Monitor and Stall Detection Projection

Task Control SHALL display operational health derived from canonical watchdog/provider/Runner signals where available.

Recommended health projection:

```text
HEALTHY
WAITING
DEGRADED
STALLED
NEEDS_ATTENTION
UNKNOWN
```

For stalled/degraded tasks show:

```text
last canonical activity
current executor/provider/Runner
reason/failure class
recovery in progress?
automatic next strategy?
user action required?
```

Do not convert every provider silence period into a failure; use canonical watchdog/deadline policy.

---

# 84. Alert Delivery and In-App Reconciliation

Spec 226 SHALL project canonical attention into:

```text
Task Control badge/list
AI Chat badge/cards
in-app toast/banner where appropriate
Web Push / mobile push / other configured channels through Notification Gateway
```

Notification transport is best-effort. Opening, dismissing or acknowledging a notification SHALL NOT resolve the source decision/task.

The UI SHALL reconcile alerts after:

```text
foreground
reconnect
cross-device action
source version change
notification open
```

---

# 85. `Open in Chat` and `Open in Task Control`

Every supported Task Control item SHOULD offer `Open in Chat` when conversation-based assistance is useful.

The transferred context SHALL be a bounded reference envelope:

```text
source_domain
source_object_id
source_version
permitted summary refs
current attention/decision refs
artifact/evidence refs as authorized
```

AI Chat SHALL fetch current authorized state rather than trust stale display text embedded by the client.

Chat task/result cards SHOULD offer `Open in Task Control` to reach richer operational detail.

---

# 86. Pause / Continue / Cancel Safety Mapping

Spec 226 SHALL preserve domain-specific semantics and never implement control through UI-only state.

For Spec 224:

```text
Pause    → RUN_PAUSE
Continue → RUN_CONTINUE/RUN_RESUME according to current canonical state
Cancel   → RUN_CANCEL
Retry    → RUN_RETRY
Replan   → RUN_REPLAN
```

For legacy/non-development jobs, the bridge SHALL expose only actions supported by the canonical Feature 195/domain adapter.

If a job cannot be paused safely, Task Control SHALL not fake a pause. It MAY offer `Cancel` or `Let current step finish` if the source domain supports those meanings.

---

# 87. Cross-Device and Multi-Tab Concurrency

The same task may be open in multiple browser tabs/devices.

Requirements:

1. actions carry version/generation/idempotency fences;
2. successful mutation returns authoritative current state;
3. other sessions receive/reconcile the resulting event;
4. stale controls are disabled/rejected;
5. duplicate clicks/taps do not duplicate side effects;
6. one device losing connectivity does not freeze other control surfaces.

---

# 88. Role-Aware Task Control

Task Control SHALL separate:

```text
read visibility
control permission
decision/approval authority
admin/operator diagnostics
```

A normal user MAY see their own task and `Cancel` while an admin MAY see broader tenant monitoring. A read-only observer MAY monitor without mutation rights.

The bridge SHALL use canonical identity/capability policy and SHALL NOT invent a Task-Control-specific RBAC universe.

---

# 89. Alert / Task Privacy

Compact task/alert payloads SHALL minimize sensitive content.

Examples:

- do not show secret values in task titles/events;
- do not place sensitive diff/source text into push payloads;
- Chat/Task Control previews respect tenant/project ACL;
- deep links resolve current authorized state server-side;
- audit/logging follows existing redaction/retention policy.

---

# 90. Revision 5 Feature Flags

Add independently rollbackable flags such as:

```text
task_control_projection_v2
task_control_full_list_v1
task_control_run_detail_v1
task_control_actions_v1
task_control_attention_v1
chat_task_cards_v1
chat_natural_language_task_control_v1
cross_surface_task_sync_v1
readiness_compact_health_v1
```

Read-only projection SHOULD precede mutation controls in rollout.

---

# 91. Revision 5 Migration / Rollout

Recommended sequence:

```text
Phase 1  read-only TaskControlProjection + filters
Phase 2  Needs Attention + task/run detail
Phase 3  Chat task cards + cross-surface links
Phase 4  pause/resume/cancel/retry controls with strict fencing
Phase 5  HumanDecision/Approval actions
Phase 6  replan/verify/budget and advanced development controls
Phase 7  mobile/tablet parity through Spec 225
Phase 8  alert tuning, SLO and production hardening
```

Each phase SHALL be independently rollbackable without corrupting canonical task state.

---

# 92. Revision 5 Acceptance Tests

At minimum:

1. current AI Chat-created worker job appears in Task Control once;
2. current `Start a task in Chat` routes through Feature 196 rather than a Task-Control-only planner;
3. Task Control lists active/queued/paused/waiting/recent tasks from canonical sources;
4. DevelopmentRun control buttons invoke Spec 224 commands and not direct DB mutation;
5. generic media job shows only supported actions;
6. pause from Task Control updates Chat card in another tab;
7. `Continue` from Chat resumes the same eligible run rather than creating a duplicate;
8. cancel races a provider completion and stale completion cannot resurrect task state;
9. one HumanDecision can be resolved in AI Chat and immediately becomes resolved in Task Control;
10. one HumanDecision resolved in Task Control automatically continues the underlying Spec 224 run when applicable;
11. stale decision epoch from another device is rejected;
12. Task Control alert acknowledgement does not resolve decision/approval;
13. WebSocket loss falls back to replay/poll/resync without false task completion;
14. expired cursor yields current snapshot/new cursor;
15. read-only user cannot mutate even with forged UI request;
16. degraded MCP/Runner readiness shows impacted capabilities instead of globally blocking all tasks;
17. provider with L0/L1 observability displays coarse/unknown progress honestly;
18. `Open in Chat` fetches current canonical authorized state;
19. duplicate multi-tab Pause/Cancel taps are idempotent;
20. cross-device action through Spec 225 updates the same Task Control item;
21. alert/task previews contain no secret material;
22. feature-flag rollback removes new UI/control paths without changing existing canonical jobs;
23. audit events correlate Chat/Task Control source surface with command/result;
24. performance test proves task-list projection/query does not require N+1 scans of raw event history.

---

# 93. Revision 5 Definition of Done

Revision 5 is complete when the existing Web AI Chat/Task Control experience can:

- [ ] start tasks through canonical Chat/orchestration;
- [ ] list and filter authorized work;
- [ ] monitor state, health, phase, activity and execution target;
- [ ] expose task/run detail, events, artifacts and results;
- [ ] pause/resume/continue/cancel/retry/replan where the canonical domain supports them;
- [ ] surface and resolve human decisions/approvals/input through the canonical owner;
- [ ] show actionable alerts and Needs Attention;
- [ ] synchronize state across Chat, Task Control, tabs and devices;
- [ ] represent degraded readiness and provider observability honestly;
- [ ] enforce authorization, idempotency and stale-state fencing;
- [ ] remain a compatibility bridge rather than a new lifecycle authority.

---

# 94. Revision 5 Final Architectural Rule

> **The existing AI Chat and Task Control UI SHALL become two synchronized ways to command and observe the same SmartAIHub work: Chat optimizes for intent and conversation; Task Control optimizes for operational awareness and intervention. Neither may own separate task truth. Starting, monitoring, alerting, pausing, continuing, cancelling, retrying, re-planning and human decisions MUST always return to the current canonical source domain and its authorization/version fences.**

---

# 95. Revision 6 Amendment — Spec 228 Maintenance Projection & Control Bridge

**Amendment date:** 2026-09-22  
**Domain integrated:** Spec 228 — Autonomous Maintenance, Issue & Improvement Management System

Revision 6 extends the existing AI Chat/Task Control bridge so Spec 228 maintenance work participates in the same cross-domain task, attention, control and cross-device experience without moving maintenance lifecycle authority into Spec 226.

Spec 226 remains an additive compatibility/projection bridge.

---

# 96. Canonical Spec 228 Ownership Boundary

Spec 226 SHALL treat Spec 228 as authoritative for:

```text
MaintenanceItem state/version
classification / diagnosis status
severity / priority / rank
maintenance autonomy grant
maintenance pause/defer/cancel semantics
maintenance decisions
release candidate / deployment / observation state
maintenance alert acknowledgement state
issue resolution / closure / reopen
```

Spec 224 remains authoritative for linked DevelopmentRun lifecycle. Feature 195 remains authoritative for `worker_jobs`.

Spec 226 SHALL NOT derive canonical maintenance state from worker jobs, provider sessions or UI-local state.

---

# 97. MaintenanceTaskControlProjection Adapter

The bridge SHALL implement a projection adapter equivalent to:

```text
Spec 228 MaintenanceItem / Incident / Release / Deployment
             │
             ├─ linked Spec 224 DevelopmentRun projection
             ├─ linked worker_job summaries
             ├─ shared Approval / Decision summaries
             └─ shared Attention / Alert summaries
             │
             ▼
MaintenanceTaskControlProjection
             │
      AI Chat / Task Control / Mobile Working
```

Minimum projection fields SHOULD include:

```text
task_id = maintenance:<subject_id>
task_domain = MAINTENANCE
subject_type / subject_id / subject_version
title
classification/type
severity / priority
canonical_state
presentation_stage
health
owner/team
autonomy_level
SLA summary
current_next_action
attention_count
active_repair_run_ref?
repair_phase/health?
release/deployment summary?
last_activity_at
available_commands[]
canonical_deep_links[]
```

Projection refresh SHALL be incremental/event-driven where possible and reconstructible from canonical sources.

---

# 98. Maintenance Semantic Command Bridge

The existing Chat and Task Control surfaces SHALL map maintenance actions to bounded semantic operations owned by Spec 228.

Recommended logical command family:

```text
maintenance.item.get
maintenance.item.triage
maintenance.item.reclassify
maintenance.item.priority.set
maintenance.item.rank.set
maintenance.item.assign
maintenance.item.request_evidence
maintenance.item.reproduce
maintenance.item.diagnose
maintenance.item.investigate.start
maintenance.item.autonomy.grant
maintenance.item.repair.start
maintenance.item.automation.pause
maintenance.item.automation.continue
maintenance.item.repair_attempt.cancel
maintenance.item.defer
maintenance.item.duplicate.merge
maintenance.item.split
maintenance.item.reopen
maintenance.item.close
maintenance.decision.respond
maintenance.approval.respond
maintenance.release.promote
maintenance.deployment.rollback
maintenance.alert.acknowledge
maintenance.improvement.followup.create
```

Exact route names MAY match Spec 228 APIs, but semantic ownership and behavior MUST remain equivalent.

Every mutation SHALL carry current subject version/epoch, actor identity/delegation, idempotency key and authorization context.

---

# 99. Chat Natural-Language Maintenance Resolver

Feature 196/Chat requests that target maintenance SHALL be resolved through this bridge into explicit Spec 228 operations.

Examples:

```text
"หยุดแก้ MNT-1842 ก่อน"
→ maintenance.item.automation.pause

"ทำต่อ"
→ resolve focused maintenance subject
→ maintenance.item.automation.continue

"ยกเลิกเฉพาะ repair รอบนี้"
→ maintenance.item.repair_attempt.cancel

"เพิ่ม priority เป็น P1"
→ maintenance.item.priority.set

"อนุมัติ deploy candidate นี้"
→ current decision/approval epoch + candidate digest required

"rollback release นี้"
→ maintenance.deployment.rollback + step-up when policy requires
```

Ambiguous commands SHALL show the resolved target/action before consequential dispatch.

---

# 100. Maintenance Pause / Continue / Cancel Mapping

The bridge SHALL preserve these distinctions:

```text
PAUSE MAINTENANCE AUTOMATION
  ≠ pause browser tab
  ≠ pause only provider stream
  ≠ close issue

CONTINUE MAINTENANCE
  = revalidate Spec 228 state/version/dependencies
  = resume appropriate maintenance stage
  = resume or replace linked DevelopmentRun only under Spec 228/224 contract

CANCEL REPAIR ATTEMPT
  = cancel selected linked repair run/attempt
  != close/reject/defer MaintenanceItem

CLOSE ISSUE
  = Spec 228 domain transition subject to resolution/authorization rules
```

UI labels SHALL make destructive/terminal scope clear.

---

# 101. Maintenance Attention Adapter

Spec 228 Needs Attention and alerts SHALL project into shared attention without losing maintenance-specific semantics.

The bridge SHALL carry:

```text
attention_type
maintenance subject id/version
canonical decision/approval id + epoch where applicable
urgency/deadline
severity/priority
impact summary
allowed choices
required capability
step_up_required?
evidence refs
safe deep link
correlation/group key
```

Linked Spec 224 attention MAY be grouped under the same MaintenanceItem in UI while preserving separate canonical IDs/epochs.

---

# 102. Maintenance Rich Review Adapter

The existing Task Control Rich Review surface SHALL be able to retrieve permission-filtered Spec 228 evidence and linked Spec 224 development evidence by reference.

Supported review contexts include:

```text
triage / classification
request-more-evidence
repair plan
product-semantic improvement
source diff / PR
migration
merge
release/deploy
canary health
rollback
security review
budget expansion
```

Spec 226 SHALL NOT copy secret-rich evidence into notification payloads or generic task rows.

---

# 103. Maintenance Monitoring and Composite Health

Task Control SHALL distinguish parent maintenance lifecycle, child repair execution and release health.

Example:

```text
Maintenance Item: WAITING_APPROVAL
Maintenance Health: NEEDS_ATTENTION
Repair DevelopmentRun: COMPLETED / Final Verify PASS
Release: NOT_YET_APPROVED
```

or:

```text
Maintenance Item: REPAIR_IN_PROGRESS
Maintenance Health: DEGRADED
DevelopmentRun: RUNNING
Provider: unavailable, fallback in progress
```

A child failure SHALL NOT be projected as parent terminal failure unless Spec 228 actually transitions the parent accordingly.

---

# 104. Maintenance Alert Deduplication and Notification Correlation

Spec 226 SHALL honor Spec 228 incident/fingerprint grouping keys so high-frequency occurrences do not become one push notification per occurrence.

Notification state SHALL distinguish:

```text
DELIVERED
OPENED
DELIVERY_ACKED
MAINTENANCE_ALERT_ACKED
DECISION_RESOLVED
```

These are not interchangeable.

Escalation/reminder scheduling remains owned by the canonical Attention/Notification and Spec 228 policy contracts.

---

# 105. Cross-Device Maintenance Concurrency

Maintenance mutations from desktop Task Control, mobile Needs Attention, AI Chat and Maintenance Center SHALL use current version/epoch checks.

Required race behavior:

- priority changed elsewhere → stale priority edit rejected with current value;
- deploy approved on one device → duplicate decision on another becomes resolved/stale;
- candidate SHA changes after approval screen opened → approval rejected as stale;
- issue merged as duplicate while another tab attempts repair start → repair command revalidates current state;
- rollback target changes → stale rollback request requires refresh/review.

---

# 106. Maintenance Step-Up and High-Risk Actions

The bridge SHALL support canonical server-required step-up authentication for maintenance actions such as, according to policy:

```text
production deploy
rollback
high-impact containment
migration approval/execution
priority override on critical incident
security-sensitive disclosure/action
change of autonomy policy/grant
```

Spec 226 does not own authentication factors; it transports the challenge/resume contract and revalidates the action after successful step-up.

---

# 107. Maintenance Projection Privacy

Generic Task Control views SHALL reveal no more maintenance data than the user is authorized to see.

For sensitive/security items the adapter MUST support field-level redaction, opaque titles/status-only projections, or complete suppression according to Spec 228 policy.

Tenant-scoped projections SHALL NOT reveal cross-tenant occurrence counts, affected-user estimates or evidence references.

---

# 108. Maintenance Deep-Link and Open-in-Chat Contract

A maintenance task card SHALL support bounded navigation such as:

```text
Open in Chat
Open in Task Control
Open Maintenance Item
Open Development Repair
Open PR / candidate (authorized)
Open Release / Deployment
Open Rich Review
```

Deep links resolve to server-authorized current state; they SHALL NOT encode privileged mutable state or secrets.

`Open in Chat` SHALL pass subject references/context rather than dumping full maintenance logs into model context.

---

# 109. Revision 6 Feature Flags

Add independently rollbackable flags such as:

```text
maintenance_task_projection_v1
maintenance_chat_commands_v1
maintenance_task_control_actions_v1
maintenance_attention_bridge_v1
maintenance_rich_review_v1
maintenance_cross_device_controls_v1
maintenance_composite_health_v1
```

Disabling projection/UI flags SHALL NOT alter canonical Spec 228 records or active Spec 224 DevelopmentRuns.

---

# 110. Revision 6 Migration / Rollout

Recommended rollout:

```text
1. read-only maintenance projection in Task Control
2. Needs Attention + deep links
3. safe non-destructive commands
4. pause/continue/cancel-repair controls
5. approvals/decisions
6. deploy/rollback with step-up
7. Chat natural-language commands
8. mobile/cross-device controls
```

Shadow telemetry SHALL compare Task Control projection with canonical Spec 228 state before write controls are enabled.

---

# 111. Revision 6 Acceptance Tests

At minimum:

1. MaintenanceItem appears exactly once as a root Task Control item.
2. Linked DevelopmentRun appears as child context, not duplicate root maintenance truth.
3. Chat and Task Control issue the same semantic command for maintenance pause.
4. Pause does not close the issue.
5. Cancel-repair does not mark the MaintenanceItem cancelled/closed unless separately requested.
6. Continue revalidates current state/work-package before resuming child execution.
7. P0/P1 alerts deduplicate according to Spec 228 grouping.
8. Alert OPENED does not become MAINTENANCE_ALERT_ACKED or DECISION_RESOLVED.
9. Approve deploy from stale candidate epoch is rejected.
10. Deploy/rollback can require step-up and resumes the exact fenced command afterward.
11. Security-sensitive maintenance task is redacted/suppressed for unauthorized user.
12. Priority conflict across two tabs yields conflict/reload rather than last-write-wins.
13. Spec 224 Final Verify PASS updates projection but does not auto-resolve parent item.
14. Spec 224 failure appears as child repair problem while Spec 228 remains authoritative for parent next action.
15. `Open in Chat` retrieves current subject state by reference.
16. feature-flag rollback removes enhanced controls without modifying canonical maintenance data.

---

# 112. Revision 6 Definition of Done

Revision 6 is complete when the existing AI Chat/Task Control/mobile bridge can faithfully project, monitor and control the complete operational Spec 228 lifecycle, including linked Spec 224 repairs, attention, decisions, release/deployment and rollback, with version fencing, role-based redaction and no duplicate state authority.

---

# 113. Revision 6 Final Architectural Rule

> **Spec 226 makes maintenance work reachable everywhere; it does not own maintenance. A maintenance action from Chat, Task Control or mobile is only valid when the current Spec 228 subject/version, canonical authorization and any linked Spec 224/Approval epoch all agree.**

---

# 114. Revision 7 Amendment — Deterministic UI Contract & Device-Class Compatibility Bridge

Revision 7 is additive. It bridges Specs 224 Revision 17 and 225 Revision 5 into the already-implemented Feature 195/196 and Spec 195–213 baseline without retroactively rewriting those systems.

# 115. Bridge `UIActionManifest`

Spec 226 SHALL provide an additive adapter that can project legacy/current first-party actions into a canonical manifest shape such as:

```text
ui_action_id
subject/domain
canonical command/tool/API
surface(s)
route(s)
actors/capabilities
valid lifecycle states
visibility/enabled rules
device support levels
feature flag/version
```

The manifest is descriptive/control-binding metadata. It does not replace canonical backend authorization.

# 116. Route / Surface / Action Projection

For existing AI Chat, Task Control and related implemented pages, Spec 226 SHOULD expose enough metadata for Spec 224 UI closure to answer deterministically:

```text
Does the required route exist?
Is there a supported navigation/deep-link path?
Which UI surface exposes the action?
Which canonical command/API does it invoke?
Which state/role gates it?
Which device profiles expose/adapt/handoff it?
```

Legacy pages MAY be incrementally registered; absence of metadata remains visible rather than fabricated as PASS.

# 117. Existing Feature 196 / Task-Control Adapter Rule

Revision 7 SHALL adapt the current UI rather than create a parallel replacement UI merely for closure testing.

Where the legacy implementation lacks explicit action metadata, introduce bounded adapters/registries behind feature flags and migrate high-value actions first.

# 118. Device-Class Projection Bridge

Spec 226 SHALL allow existing surfaces to declare/derive:

```text
DESKTOP_FULL
TABLET_OPERATIONAL
MOBILE_FOCUSED
```

and per-capability support levels:

```text
FULL / ADAPTED / FOCUSED / VIEW_ONLY / HANDOFF / NOT_SUPPORTED_BY_DESIGN
```

The bridge SHALL NOT infer that a route is mobile-complete merely because CSS renders at a narrow width.

# 119. Optional WebMCP Adapter

WebMCP MAY be supported as an optional browser-agent adapter over canonical `UIActionManifest` actions.

Normative rules:

1. WebMCP is not required for normal human UI operation or deterministic UI closure.
2. Server authorization, decision epochs and idempotency remain authoritative.
3. Tool descriptions/registration cannot widen capability grants.
4. WebMCP availability/version SHALL be capability-probed and feature-gated.
5. WebMCP tool exposure SHOULD map to already-governed semantic actions rather than create hidden side-effect paths.

Informative status at revision time: Chrome documents WebMCP as an origin-trial / intent-to-experiment capability, so SmartAIHub SHALL avoid hard architectural dependency on its current API shape.

Informative references (checked 2026-09-22):

- `https://developer.chrome.com/docs/ai/webmcp/secure-tools`
- `https://developer.chrome.com/docs/ai/webmcp/build-tools`
- `https://developer.chrome.com/docs/ai/webmcp/imperative-api`

# 120. Jev / Computer-Use Compatibility Boundary

Existing Spec 208/213 browser/computer execution remains capability-gated and optional for UI closure.

Spec 226 SHALL NOT force a route/action/state verification into Jev, Vision or Computer Use when the same question can be answered from route/action contracts, source/static analysis or deterministic browser/DOM tests.

# 121. Incremental UI Contract Rollout

Recommended order:

```text
1. Task Control high-value actions
2. AI Chat task/action cards
3. Needs Attention / Human Decision
4. Spec 228 maintenance actions
5. remaining admin/product surfaces as relevant
```

Each migrated action should gain semantic ID, route/surface mapping, state/role rules and device profile without breaking existing user workflows.

# 122. Revision 7 Feature Flags

Suggested flags:

```text
ui_action_manifest_v1
route_surface_registry_v1
device_experience_projection_v1
webmcp_adapter_v1
ui_closure_telemetry_v1
```

Rollback SHALL remove the additive projection/adapter without mutating canonical task/maintenance/development state.

# 123. Revision 7 Required Tests

1. legacy Task Control pause button maps to canonical RUN_PAUSE manifest entry;
2. missing route mapping is reported unknown/incomplete rather than PASS;
3. state/role projection differs from actual backend authorization and conformance test fails;
4. tablet/mobile support levels can be declared without creating separate run state;
5. WebMCP adapter disabled leaves all normal UI controls functional;
6. WebMCP tool invocation still hits canonical authorization/idempotency path;
7. Spec 208/213 unavailable does not block route/action static closure;
8. action manifest feature-flag rollback preserves existing Feature 196 behavior;
9. maintenance action projects parent Spec 228 identity plus linked Spec 224 child identity correctly;
10. stale device action is rejected using current canonical version/epoch regardless of surface metadata.

# 124. Revision 7 Definition of Done

Revision 7 is complete when the implemented baseline can expose deterministic route/surface/action/device metadata to Specs 224/225 without replacing Feature 195/196 or earlier browser/computer systems, and optional WebMCP/Jev/Computer-Use paths remain adapters rather than correctness authorities.

# 125. Revision 7 Final Architectural Rule

> **Spec 226 SHALL make the existing product legible to the new closure/runtime contracts without creating a second UI control plane. Structured action/device metadata is the bridge; canonical state and authorization remain where they already belong.**

# End of Spec 226 Revision 7

---

# Revision 8 Kimi Code Bridge

Kimi Code SHALL integrate additively without rewriting already-implemented Spec 200 or Feature 195.

Two directions are supported when certified:

```text
A. SmartAIHub delegates development execution
SmartAIHub / Spec 224
  → existing Spec 200 external-agent path
  → Runner
  → Spec 230 Kimi harness profile
  → Kimi Code Agent core

B. User works inside Kimi Code and controls SmartAIHub
Kimi Code MCP client
  → Spec 199 MCP
  → Spec 226 compatibility bridge
  → Spec 224 DevelopmentCommandGateway
```

Kimi Code Desktop MAY be the user's local GUI for the Kimi session, but Spec 226 SHALL NOT automate its GUI or accept Desktop-local state as canonical SmartAIHub state.

Because Kimi's local REST/WebSocket server API is experimental, integration SHALL capability-probe the live authenticated OpenAPI/AsyncAPI schemas and pin/record a compatibility fingerprint. GUI-only behavior is not a substitute for a stable adapter contract.

Kimi built-in Browser/Computer Use capabilities remain optional harness tools. They SHALL NOT bypass the deterministic UI/UX closure ladder in Spec 224 or take over Spec 208/213 authority.


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

# Revision 9 — Retrieval V2 Compatibility Bridge

Because implementation already exists through Spec 213, legacy Help/RAG/vector/search call sites SHALL migrate additively through a compatibility adapter into Spec 229 Retrieval Broker V2 rather than being rewritten as parallel search systems.

Bridge responsibilities include:

```text
legacy retrieval request normalization
identity/tenant/project scope propagation
exact-ID preservation
old 768D/pgvector path shadow comparison during migration
normalized evidence/provenance response
feature-flagged rollback during cutover window
telemetry identifying remaining direct provider callers
```

The bridge MUST NOT allow legacy callers to bypass Spec 220 authorization or continue independent production ranking after the Spec 229 cutover gate.

Admin readiness SHOULD expose migration state such as remaining direct pgvector/Vectorize callers, projection lag, Retrieval Broker health and retrieval certification status.
