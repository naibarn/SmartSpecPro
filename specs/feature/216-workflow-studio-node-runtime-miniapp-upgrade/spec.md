# Spec 216 — SmartAIHub Workflow Studio Upgrade Program
## Node Contract Alignment, Runtime Separation, Flow-to-Mini-App Productization & Public Monetization

**Status:** Proposed / Implementation Upgrade Specification  
**Spec ID:** 216  
**Date:** 2026-09-20  
**Target repository path:** `specs/feature/216-workflow-studio-node-runtime-miniapp-upgrade/spec.md`  
**Implementation baseline:** Spec 209 — already implemented / partially implemented Workflow Studio  
**Canonical product validation:** Spec 212 Revision 20+  
**Canonical Node Type contract:** Spec 214 v5+  
**Canonical compiler/runtime contract:** Spec 215 v3+  
**Economic authority:** Spec 207  
**Durable physical job authority:** Feature 195 / `worker_jobs`  

**Repository baseline evidence (2026-09-20):** the implemented baseline is exposed by `apps/web/server/routers/workflowStudio.ts`, `apps/web/server/services/workflowStudioContracts.ts`, `apps/web/server/services/workflowStudioRuntime.ts` and `apps/web/server/services/workflowBuilderCompiler.ts`. Those modules still carry the pre-upgrade graph/compiler shapes (including `feature-209-v1` runtime steps), so Specs 214/215 remain an upgrade target until their conformance gates pass; this specification does not claim that cutover is already implemented.

---

# 0. Executive Decision

Spec 209 SHALL be treated as the **implemented baseline**, not rewritten retroactively as if the new architecture had existed from the beginning.

Spec 216 SHALL be the normative implementation-upgrade program that transforms the existing Workflow Studio into the architecture required by Specs 212/214/215 and the Flow-to-Mini-App monetization model.

The upgrade SHALL reuse useful Spec 209 code and UX, but MAY make breaking internal schema/refactor changes because there are currently **no persisted production workflows that require backward-compatible workflow data migration**.

The system MUST NOT create a second Workflow Studio, second workflow format, second Mini App runtime, second job queue, second Capability Registry, or second credit ledger.

Canonical direction:

```text
Existing Spec 209 implementation
        ↓
Spec 216 incremental refactor
        ↓
Spec 214 canonical semantic Node contracts
        ↓
Spec 215 canonical compiler/runtime
        ↓
Feature 195 physical durable jobs
        ↓
Spec 209 UX retained/evolved
        ↓
Flow → Mini App projection
        ↓
Private / Shared / Public
        ↓
Spec 207 quote / reserve / settle / revenue allocation
```

---

# 1. Why a Separate Upgrade Spec Is Required

Spec 209 has already produced real implementation. Replacing its text with a future-state design creates ambiguity between:

- what code already exists;
- what is intentionally retained;
- what must be removed;
- what is refactored;
- what is newly implemented;
- what is owned by Specs 214/215/207 instead of Workflow Studio.

Spec 216 SHALL therefore serve as the **delta and implementation plan**.

Spec 209 remains useful as historical product/UX baseline and source of reusable implementation.

---

# 2. Normative Ownership After Spec 216

| Concern | Canonical owner | Spec 216 responsibility |
|---|---|---|
| Workflow Studio / AI Builder UX | Spec 209 + 216 upgrade | Refactor existing UX to consume new contracts |
| Use Cases / Marketplace quality / certification | Spec 212 | Ensure upgraded product passes corpus |
| Node Type taxonomy / manifest / registry | Spec 214 | Replace legacy hard-coded node semantics |
| Workflow compiler / logical runtime | Spec 215 | Move runtime semantics out of Studio code |
| Durable physical async jobs | Feature 195 | Reuse `worker_jobs`; no new queue |
| Mini App builder / presentation projection | Spec 216 within Studio surface | Implement Flow → MiniAppDefinition UX |
| Credit/billing/economic settlement | Spec 207 | Integrate; never duplicate ledger |
| External Agents | Spec 200 | Bind through canonical agent contract |
| A2A | Spec 206 | Adapter/protocol path |
| Computer Use | Spec 208 | Runtime capability path |
| ACP/runtime fabric | Spec 211 | Adapter/runtime path |

---

# 3. Upgrade Principles

1. **No parallel architecture.** Existing Spec 209 code is refactored in place.
2. **No data-compatibility burden without data.** Legacy workflow/node identifiers MAY be removed from the canonical model because no production workflow instances need migration.
3. **Reuse implementation, not legacy semantics.** Components, forms, canvas, property panels, job views and API plumbing MAY be reused behind new contracts.
4. **Contract-first.** UI reads Node definitions from Spec 214 registry and runtime behavior from Spec 215 APIs.
5. **Mini App is a presentation/product layer, not a runtime.**
6. **Economics belongs to Spec 207.** Studio stores policy references and listing metadata, never authoritative balances.
7. **Spec 212 is the release oracle.** Critical upgrade slices must pass the canonical use-case corpus.

---

# 4. Existing 112 Node Types — Upgrade Rule

The previously implemented 112 `nodeType` names SHALL NOT be preserved merely because code exists.

They are implementation evidence only.

Spec 216 SHALL follow the clean-slate disposition defined by Spec 214:

- executable semantic nodes normalize to canonical Spec 214 types;
- workflow input/output become `WorkflowInterface`;
- context/config/secret become bindings;
- retry/checkpoint/budget become policies;
- error boundaries/transactions become scopes;
- trace/log/metric become instrumentation;
- capability discovery/status operations become control-plane APIs;
- browser and agent low-level steps become runtime primitives;
- presentation-only nodes become Studio/Mini App UI configuration.

No legacy node alias SHALL be exposed as a canonical authoring choice unless Spec 214 explicitly declares it as a supported preset/alias.

---

# 5. Target WorkflowDefinition Integration

Spec 216 SHALL make the existing Studio author and persist the Spec 215 canonical WorkflowDefinition shape.

At minimum it SHALL support:

```text
WorkflowInterface
nodes[]
edges[]
WorkflowBindings[]
ExecutionScopes[]
PolicyAttachments[]
InstrumentationAttachments[]
immutable run-scoped variables
metadata/versioning
```

The Studio MAY present simpler UX concepts, but persisted semantics MUST normalize to the canonical contracts.

---

# 6. AI Builder Upgrade

The AI Builder SHALL stop depending on a static prompt-time list of node types.

New flow:

```text
User intent
  ↓
Use-case/context interpretation
  ↓
Compact Spec 214 Registry search
  ↓
Candidate NodeTypeManifest retrieval
  ↓
Capability/descriptor discovery
  ↓
Workflow proposal
  ↓
Spec 215 static compile/validation
  ↓
Readable diff + explanation
  ↓
User accepts / asks for revision
```

AI Builder MUST NOT invent executable node classes.

A missing capability MUST be reported as a capability/runtime gap before proposing a new Node Type.

---

# 7. Canvas and Properties Panel Upgrade

Existing Canvas/Properties UI SHOULD be reused where practical.

The Properties Panel SHALL become registry/schema driven:

```text
NodeTypeManifest
+ bound descriptor
+ ConfigSchema
+ UISchema
+ policy/security metadata
→ generated editor
```

Type-specific custom UI MAY exist only as a registered extension and MUST NOT become the semantic source of truth.

---

# 8. Compiler Boundary Refactor

Spec 209 implementation SHALL no longer own canonical compiler semantics.

Studio actions such as:

```text
Validate
Test
Run
Publish
Create Mini App
```

SHALL call Spec 215 compiler/runtime contracts.

Spec 216 MAY retain frontend-side linting for immediate UX feedback, but server-side Spec 215 validation is authoritative.

---

# 9. No Mini-App-Only Runtime

All Mini App execution MUST enter the same run path as Studio/API/Assistant execution.

```text
Mini App submit
  ↓
workflow.run / canonical run entry
  ↓
Spec 215 WorkflowRun
  ↓
NodeRun / NodeAttempt
  ↓
Feature 195 / runtime adapters
```

Forbidden:

```text
MiniAppRunEngine
MiniAppQueue
MiniAppWorker
MiniAppLedger
```

unless the name is merely a thin façade over canonical services and owns no duplicate state.

---

# 10. Mini App Product Model

Spec 216 SHALL introduce a first-class `MiniAppDefinition`.

```ts
interface MiniAppDefinition {
  miniAppId: string;
  version: string;

  workflowRef: {
    workflowId: string;
    workflowVersionId: string;
    releaseChannel?: "pinned" | "stable" | "canary";
  };

  presentation: MiniAppPresentation;
  inputView: MiniAppInputView;
  interactionView: MiniAppInteractionView;
  resultView: MiniAppResultView;

  accessPolicy: MiniAppAccessPolicy;
  runtimeExposurePolicy: MiniAppRuntimeExposurePolicy;
  publicationPolicy: MiniAppPublicationPolicy;
  economicPolicyRef?: string;

  createdBy: string;
  createdAt: string;
}
```

Mini App definition SHALL NOT duplicate workflow business logic.

---

# 11. Flow → Mini App Interaction Projection

Generator SHALL derive user-visible interaction from workflow contracts, not from raw node count.

Projection sources:

```text
WorkflowInterface.inputs
WorkflowInterface.outputs
human.input
human.approval
flow.wait
stream/progress declarations
data.artifact outputs
recoverable error semantics
runtime choices explicitly exposed by publisher
```

Example:

```text
35 execution nodes
        ↓ interaction projection
Screen 1 — Input / Upload
Screen 2 — Running / Progress
Screen 3 — Approval / Human Review
Screen 4 — Result / Artifacts
```

Internal model/tool/router/transform nodes SHOULD normally remain invisible to Mini App consumers.

---

# 12. Deterministic Schema-to-UI Mapping

Before AI customization, the system SHALL provide deterministic rendering from typed schemas.

Examples:

| Contract | Default component |
|---|---|
| string | Text input |
| multiline string | Text area |
| enum | Select / radio |
| boolean | Checkbox / switch |
| number | Numeric field |
| date/time | Date/time picker |
| ArtifactRef image | Image/Library picker |
| ArtifactRef video | Video/Library picker |
| ArtifactRef file | File/Library picker |
| array | Repeatable/list field |
| object | Group/section |
| output ArtifactRef | Preview/download/save-to-Library |
| structured array output | Table/list |

Server-side schema validation remains authoritative even when conditional/dynamic UI hides fields.

---

# 13. AI Mini App Designer

AI MAY customize:

- layout;
- grouping;
- tabs/steps/wizard;
- labels/help text;
- visual hierarchy;
- result presentation;
- progress labels;
- empty/loading/error states;
- responsive layout.

AI MUST NOT:

- alter workflow execution semantics;
- bypass required inputs;
- weaken validation;
- expose hidden bindings/secrets;
- add privileges not declared by the workflow/listing;
- bypass approvals;
- change billing policy without authorized product action.

UI customization SHALL be stored as declarative schema/patches, not arbitrary trusted frontend code by default.

---

# 14. Mini App Visibility States

Supported lifecycle:

```text
DRAFT
PRIVATE
WORKSPACE
SHARED
PUBLIC_REVIEW
PUBLIC_APPROVED
PUBLIC
SUSPENDED
RETIRED
```

Publication state and workflow version are independent but linked through immutable publication snapshots.

---

# 15. Admin Direct Public Publish

Authorized Admin MAY publish a Mini App publicly after mandatory preflight.

```text
Admin creates/selects workflow
→ Generate/Customize Mini App
→ Preflight
→ Set pricing/economic policy
→ Publish snapshot
→ PUBLIC
```

Admin direct publication MUST still run automated security, dependency, entitlement, schema and economic validation.

Admin privilege does not bypass safety or accounting controls.

---

# 16. User Submit-for-Public Approval

A non-admin owner MAY create and use a Private/Workspace Mini App without public approval, subject to tenant policy.

To publish publicly:

```text
Owner
→ Submit for Public Approval
→ immutable candidate snapshot
→ automated checks
→ Admin review
   ├─ APPROVE
   ├─ REQUEST_CHANGES
   ├─ REJECT
   └─ SUSPEND later if already public
```

Review record MUST capture:

```text
candidate Mini App version
workflow version/hash
owner
reviewer
requested visibility
permissions/effects
runtime/dependency summary
pricing policy
revenue-share policy
security findings
review decision
reason
created/decided timestamps
```

---

# 17. Public Publication Preflight

Minimum checks:

- workflow compile success;
- all Node Types exist in pinned Spec 214 registry;
- capabilities/runtime dependencies resolve;
- required secrets are publisher-owned references, never values;
- consumer inputs cannot inject node configuration;
- permissions and side effects are declared;
- Computer Use complies with Spec 208;
- external-agent scope complies with Spec 200/206/211;
- output/artifact rights permit publication;
- dependency licensing/entitlement valid;
- cost quote path available;
- Mini App fee/economic policy valid;
- abuse controls/rate/concurrency limits configured;
- required localization/metadata complete;
- test run/certification meets publication policy.

---

# 18. Mini App Pricing Model

Every public paid Mini App invocation SHALL use Spec 207 for quote, reservation, authorization, capture and settlement.

Consumer-visible total is conceptually:

```text
Total Charge
  = Execution Usage
  + Mini App Usage Fee
  + Explicit external/pass-through charges if applicable
```

The components MUST remain separately attributable.

Mini App Usage Fee is a product fee, not a replacement for execution/provider/capability accounting.

---

# 19. Difficulty / Value Pricing Metadata

Mini Apps MAY expose a user-friendly tier:

```text
SIMPLE
STANDARD
ADVANCED
HEAVY
PREMIUM
```

The tier is NOT the authoritative billing calculation by itself.

Fee policy MAY consider:

- expected compute/runtime duration;
- model/media intensity;
- required external agents/tools;
- Runner/GPU requirement;
- number of human interaction stages;
- operational complexity;
- quality tier;
- product value/creator pricing policy;
- minimum/maximum fee boundaries.

The authoritative fee SHALL be produced by a versioned economic policy in Spec 207.

---

# 20. Pre-Run Quote and Reservation

Before material execution of a paid public Mini App:

```text
Consumer submits inputs
→ validate input contract
→ resolve publication snapshot
→ Spec 207 quote
→ show estimated execution usage + Mini App fee + total
→ user confirms if required by policy
→ reserve credits
→ create WorkflowRun
```

Quote SHALL identify at least:

```text
miniAppId/version
workflowId/version
listing/publication snapshot
estimated execution cost range
Mini App usage fee
estimated total
economic policy version
revenue allocation preview where policy allows
quote expiry
```

---

# 21. Revenue Sharing — User-Owned Public Mini Apps

For a Mini App owned by a user/creator and approved for public use, the **Mini App Usage Fee** SHALL default to a two-party split:

```text
Platform        50%
Mini App Owner  50%
```

The split SHALL be represented by a versioned Spec 207 allocation policy rather than hard-coded in WorkflowDefinition or MiniAppDefinition.

The 50/50 default MAY later be configured by platform policy without changing historical settlement records.

Underlying execution/capability/provider revenue allocations remain governed independently by their existing Spec 207 rules.

The Mini App fee MUST NOT be accidentally split again as if it were provider execution cost.

---

# 22. Platform-Owned Mini Apps

If the Platform/Admin is the economic owner of the Mini App:

```text
Mini App Usage Fee → Platform 100%
```

unless an explicit partner/creator allocation policy is configured.

The system SHALL NOT create a fake creator account merely to force the two-party allocation model.

---

# 23. Economic Identity and Snapshots

Every paid Mini App run MUST retain references to:

```text
miniAppId
miniAppVersion
workflowVersion
publication/listing snapshot
consumer account/tenant
owner account
quoteId
reservationId
economic policy version
Mini App fee amount
allocation recipients + percentages/amounts
execution usage charges
settlement/finality state
```

Historical records MUST NOT be rewritten when pricing or revenue share changes later.

---

# 24. Settlement and Failure Semantics

Spec 207 is authoritative for finality.

Default product policy SHOULD be:

- execution/provider usage incurred before failure is accounted according to provider/capability policy;
- Mini App creator fee is success-finality based unless listing policy explicitly and transparently says otherwise;
- cancelled-before-material-execution releases reservation;
- unknown external outcome remains pending/reconcile rather than falsely settling success;
- retry caused by platform fault MUST NOT automatically create duplicate Mini App creator fee;
- user-initiated new invocation is a distinct billable run.

Any non-success fee model MUST be disclosed before run.

---

# 25. MiniAppRunContext

Spec 216 SHALL pass product/economic context into Spec 215 without turning it into execution semantics.

```ts
interface MiniAppRunContext {
  miniAppId: string;
  miniAppVersion: string;
  publicationSnapshotId: string;
  listingId?: string;

  workflowId: string;
  workflowVersion: string;

  consumerPrincipalId: string;
  ownerPrincipalId: string;

  quoteId?: string;
  reservationId?: string;
  economicPolicyVersion?: string;
}
```

Spec 215 preserves the context for audit/correlation while Spec 207 remains authoritative for balances and settlement.

---

# 26. Public Mini App Security Boundary

Public consumers MUST NOT gain access to:

- workflow source graph unless explicitly allowed;
- creator secrets;
- creator private Library assets beyond published/materialized rights;
- internal runtime credentials;
- hidden bindings;
- privileged node configuration;
- unpublished workflow versions;
- reviewer/admin controls.

Mini App inputs MUST validate only against declared consumer-editable fields.

Attempts to submit hidden/config/privileged fields MUST fail closed.

---

# 27. Graph Visibility Policy

Graph visibility SHALL be independently configurable from app visibility.

Examples:

```text
Public Mini App + private workflow graph
Public Mini App + inspectable read-only graph
Workspace Mini App + editable graph for editors only
```

Public use MUST NOT imply source disclosure.

---

# 28. Dependency and Secret Ownership

Publisher-owned dependencies MAY be used only where policy explicitly allows sponsored/shared execution.

Consumer-provided dependencies MAY require per-user connection setup.

Mini App preflight SHALL classify dependencies as:

```text
PLATFORM_PROVIDED
OWNER_PROVIDED
CONSUMER_REQUIRED
TENANT_REQUIRED
OPTIONAL
```

Secret values are never stored in MiniAppDefinition.

---

# 29. Versioning and Release Channels

Mini App publication points to immutable workflow/app versions.

Supported release controls SHOULD include:

```text
pinned
stable
canary
staged cohort
rollback
```

Historical runs remain bound to the exact publication/workflow snapshot used at invocation.

---

# 30. Updating a Public Mini App

Publishing a new version MUST NOT silently mutate historical executions.

Upgrade flow:

```text
Draft new workflow/app version
→ compatibility/preflight
→ certification/test
→ optional canary
→ promote stable
→ new runs use new snapshot
→ old runs remain pinned historically
```

Breaking input/output changes require explicit compatibility policy and may require a new major Mini App version.

---

# 31. Suspension and Emergency Kill Switch

Authorized Admin SHALL be able to suspend new public runs immediately without deleting historical evidence.

Suspension reasons may include:

- security issue;
- abusive behavior;
- dependency compromise;
- billing/entitlement issue;
- policy violation;
- creator account issue;
- critical quality regression.

In-flight run handling follows Spec 215/207 safety/finality policy.

---

# 32. Mini App Analytics

Owner analytics SHOULD include privacy-safe aggregates:

```text
runs
successful runs
failure categories
average/p95 duration
consumer-visible fee
owner earnings
conversion/abandon before run
popular input modes without exposing raw sensitive input
version comparison
```

Raw consumer inputs SHALL NOT be exposed to the owner by default.

---

# 33. Admin UX Requirements

Admin Mini App console SHALL support:

- public-review queue;
- automated preflight findings;
- workflow/app preview;
- owner identity;
- pricing/revenue-share preview;
- dependency/permission/effect summary;
- certification state;
- approve/reject/request changes;
- publish/unpublish/suspend;
- canary/staged rollout;
- audit timeline;
- economic settlement drill-down references.

---

# 34. Creator UX Requirements

Creator SHALL be able to:

- generate Mini App from workflow;
- preview desktop/tablet/mobile layouts;
- ask AI to customize UI;
- edit declarative UI safely;
- configure allowed consumer inputs/options;
- set supported visibility;
- see estimated consumer cost;
- see Mini App fee and revenue-share policy;
- submit for public approval;
- receive change requests;
- publish new approved versions;
- inspect aggregate analytics/earnings.

---

# 35. Consumer UX Requirements

Before run, consumer SHOULD understand:

- what the Mini App does;
- required inputs;
- required connections/permissions;
- side effects;
- estimated cost;
- Mini App usage fee where appropriate;
- expected outputs;
- estimated duration/range where meaningful.

During/after run:

- progress survives page closure;
- waits/approval/input requests can resume;
- failures are understandable but sanitized;
- results/artifacts can be previewed/downloaded/saved according to policy.

---

# 36. API Surface

Illustrative canonical product APIs:

```text
POST   /workflow-definitions/{workflowId}/mini-apps:generate
POST   /mini-apps/{miniAppId}:preview
PATCH  /mini-apps/{miniAppId}/presentation
POST   /mini-apps/{miniAppId}:submit-public-review
POST   /admin/mini-app-publication-requests/{requestId}:approve
POST   /admin/mini-app-publication-requests/{requestId}:request-changes
POST   /admin/mini-app-publication-requests/{requestId}:reject
POST   /mini-apps/{miniAppId}:publish
POST   /mini-apps/{miniAppId}:quote-run
POST   /mini-apps/{miniAppId}:run
POST   /mini-apps/{miniAppId}:suspend
```

Exact endpoint naming MAY follow existing SmartAIHub API conventions, but all operations MUST resolve to canonical services and identities.

---

# 37. Suggested Persistence Model

Spec 216 MAY add product tables such as:

```text
mini_apps
mini_app_versions
mini_app_publication_snapshots
mini_app_publication_requests
mini_app_listings
mini_app_ui_revisions
mini_app_review_events
```

Economic ledger/balance/settlement tables SHALL remain owned by Spec 207.

Workflow runtime tables SHALL remain owned by Spec 215/Feature 195.

---

# 38. Feature Flags and Cutover

Recommended flags:

```text
workflow_contract_v2
node_registry_v4
spec215_compiler
spec215_runtime
miniapp_projection_v2
miniapp_public_review
miniapp_paid_public_runs
miniapp_revenue_share
```

Flags are rollout controls only; they MUST NOT create long-term duplicate sources of truth.

---

# 39. Implementation Phases

## Phase 0 — Baseline inventory
- identify Spec 209 code paths for node palette, graph model, compiler, run, Mini App and Marketplace;
- mark retain/refactor/remove ownership.

## Phase 1 — Registry-driven authoring
- wire Spec 214 registry;
- replace hard-coded semantic node lists;
- update Properties Panel.

## Phase 2 — Canonical WorkflowDefinition
- persist Spec 215 model;
- introduce WorkflowInterface/bindings/policies/scopes/instrumentation;
- remove legacy-only node semantics.

## Phase 3 — Compiler/runtime cutover
- server compile through Spec 215;
- route all runs through canonical WorkflowRun;
- reconcile Feature 195 `worker_jobs`.

## Phase 4 — Mini App projection
- implement MiniAppDefinition;
- deterministic schema UI;
- interaction projection;
- AI declarative UI customization.

## Phase 5 — Publication lifecycle
- private/workspace/shared/public-review/public;
- Admin console;
- immutable publication snapshots.

## Phase 6 — Economics
- Spec 207 quote/reservation;
- Mini App fee;
- 50/50 user-owner public allocation default;
- Platform-owned 100% policy;
- finality/reconciliation.

## Phase 7 — Marketplace hardening
- entitlement;
- abuse controls;
- analytics;
- canary/rollback/suspension.

## Phase 8 — Spec 212 certification
- run all affected Mini App slices;
- then broad regression corpus;
- block release on critical failures.

---

# 40. Clean-Slate Database Strategy

Because there are no production workflows requiring legacy workflow compatibility, implementation MAY:

- replace legacy node semantic identifiers;
- rewrite workflow JSON schema;
- drop transitional workflow columns/tables after code cutover;
- regenerate seed/demo workflows;
- remove unused adapters;
- simplify migration code.

Existing user/account/billing/library/job data outside workflow definitions MUST NOT be discarded.

---

# 41. Testing Strategy

Required suites:

1. Node Registry conformance.
2. AI Builder no-hallucinated-node tests.
3. WorkflowDefinition schema tests.
4. Compiler static-analysis tests.
5. Studio/API/Mini App same-run-path equivalence.
6. Flow → Mini App projection tests.
7. Human approval/input projection tests.
8. Hidden-binding/secret-leak tests.
9. Public publication review tests.
10. Admin direct publish tests.
11. Quote/reservation expiry tests.
12. 50/50 allocation tests.
13. Platform-owned fee allocation tests.
14. Failed/unknown-outcome settlement tests.
15. Retry duplicate-fee tests.
16. Version/canary/rollback tests.
17. Kill-switch/suspension tests.
18. Tenant isolation tests.
19. Mobile/tablet responsive tests.
20. Spec 212 UC-2811…UC-2830 regression tests plus affected historical Mini App cases.

---

# 42. Acceptance Criteria — Architecture

- [ ] Existing Spec 209 implementation is upgraded in place; no parallel Workflow Studio exists.
- [ ] Spec 214 is sole canonical Node Type authority.
- [ ] Spec 215 is sole canonical compiler/logical runtime authority.
- [ ] Feature 195 remains physical durable job authority.
- [ ] Spec 207 remains sole economic ledger/settlement authority.
- [ ] Legacy 112 node names are not preserved as canonical types without justification.
- [ ] There is no Mini-App-specific runtime or queue.

---

# 43. Acceptance Criteria — Mini App Generation

- [ ] Workflow can generate a Mini App without hand-building screens.
- [ ] Input UI derives from WorkflowInterface schema.
- [ ] Result UI derives from typed outputs.
- [ ] Human input/approval/wait states project to usable interaction surfaces.
- [ ] Internal execution nodes do not automatically become screens.
- [ ] AI customization cannot change execution semantics.
- [ ] Mini App can be previewed at desktop/tablet/mobile sizes.

---

# 44. Acceptance Criteria — Public Publication

- [ ] Admin can publish an eligible Mini App publicly.
- [ ] User owner can submit an app for public approval.
- [ ] Public approval uses immutable candidate snapshot.
- [ ] Automated preflight runs before public approval.
- [ ] Admin can approve/reject/request changes/suspend.
- [ ] Public visibility does not imply graph visibility.
- [ ] New public version does not rewrite historical runs.

---

# 45. Acceptance Criteria — Economics

- [ ] Every paid public Mini App invocation can obtain a Spec 207 quote.
- [ ] Quote separates execution usage from Mini App Usage Fee.
- [ ] Consumer sees estimated total before material execution according to policy.
- [ ] Credits are reserved/authorized through Spec 207.
- [ ] User-owned public Mini App fee defaults to Platform 50% / Owner 50%.
- [ ] Platform-owned Mini App fee can allocate 100% to Platform.
- [ ] Historical allocation remains pinned to economic policy version.
- [ ] Underlying provider/capability costs are not double-split as Mini App revenue.
- [ ] Platform retries do not create duplicate creator fee.
- [ ] Unknown-outcome execution does not falsely settle success.

---

# 46. Acceptance Criteria — Security

- [ ] Consumer cannot submit hidden node config through Mini App input.
- [ ] Consumer cannot access owner secrets.
- [ ] Consumer cannot escalate runtime/capability permission through UI fields.
- [ ] Public app publication validates dependency/license/entitlement state.
- [ ] Runtime approval/security policy is re-evaluated at execution time.
- [ ] Unsafe app can be suspended without erasing evidence.

---

# 47. Definition of Done

Spec 216 is complete when the already-implemented Workflow Studio can be evolved without a parallel rewrite and the following statement is true:

> A user or Admin can create a workflow through the existing SmartAIHub Studio, the workflow uses canonical Spec 214 node semantics, compiles/runs through Spec 215, can be projected into a usable Mini App without duplicating workflow logic, can be privately used or submitted/published publicly under Admin governance, and every paid public invocation is quoted, authorized and settled through Spec 207 with auditable Mini App revenue allocation.

---

# 48. Canonical Upgrade Principle

> **Spec 209 remains the implemented product baseline. Spec 216 owns the upgrade path. Specs 214 and 215 own the new semantic/runtime contracts. Spec 212 proves the product works. Spec 207 owns money. No layer is allowed to recreate another layer's source of truth.**
