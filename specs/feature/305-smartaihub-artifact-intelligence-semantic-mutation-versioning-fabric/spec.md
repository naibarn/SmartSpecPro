# SPEC-305 --- SmartAIHub Artifact Intelligence, Semantic Mutation & Versioning Fabric

**Revision:** R1.3\
**Status:** PROPOSED / IMPLEMENTATION-READY AFTER CANONICAL NUMBER
RESERVATION\
**Date:** 2026-10-07\
**Authority class:** SmartAIHub Shared/Core Infrastructure\
**Primary consumers:** SmartAIHub, Mini Apps, Presentation Studio,
Document/Report/Dashboard/UI builders, agents, MCP/A2A clients, external
harnesses

> **Numbering safety gate:** Before implementation, Codex/Work MUST
> verify the canonical spec registry, `origin/main`, active worktrees,
> pending handoffs, and unmerged branches. If `SPEC-305` is already
> reserved or used, renumber this file and all internal references
> atomically before implementation. Never overwrite or reinterpret
> another spec.

## 1. Executive intent

Create one shared artifact substrate for AI-assisted creation and
editing so that Presentation, Document, Dashboard, Report, Website, Mini
App UI, diagram and future artifact applications do not invent
incompatible agent-editing models.

The platform MUST treat an artifact as a structured, versioned semantic
object rather than an opaque text/blob. Agent changes MUST be scoped,
constrained, previewable, attributable, conflict-safe, reversible and
callable through the same machine-accessible command path as human UI
operations.

This spec deliberately does **not** build a presentation editor.
`MINIAPP-002 — AI Presentation Studio` is the first reference consumer.

## 2. Problem statement

Generative artifact systems often fail after first generation because
subsequent instructions are ambiguous: "make this more visual", "keep
the text but change the layout", "only update slide 6", or "use this
screenshot as the style". A naïve LLM may rewrite facts, overwrite
unrelated content, mutate stale versions, lose citations, or produce
changes that cannot be audited or rolled back.

SmartAIHub needs a reusable contract that provides:

-   semantic artifact hierarchy;
-   stable addressability of artifact nodes;
-   scoped mutations and explicit preservation rules;
-   lock/permission semantics;
-   proposed patches before canonical commit;
-   semantic, visual, evidence and data diffs;
-   optimistic concurrency and conflict handling;
-   revision graph, rollback and branching;
-   provenance and evidence lineage;
-   reference/style interpretation;
-   deterministic command schemas usable by UI, chat, MCP, A2A,
    harnesses and external agents;
-   portability for Mini Apps that detach from SmartAIHub.

## 3. Authority and non-duplication boundaries

### 3.1 Existing SmartAIHub authorities

This spec MUST integrate with, not replace:

-   **SPEC-269 Primary Assistant / multi-bot orchestration** --- intent
    understanding, clarification, planning, delegation and
    conversational coordination.
-   **SPEC-279 Universal Command Ingress & Agent Delegation Gateway**
    --- canonical command ingress, identity/auth context, policy routing
    and machine-callable operations.
-   **SPEC-287 Unified UI Governance, Rendering Conformance & Mini App
    Design Contract** --- UI/design-system conformance, host/Mini App
    presentation rules, accessibility and rendering governance.
-   **SPEC-266 Unified Data/Evidence/Knowledge & Spatial Fabric** ---
    evidence/data discovery and canonical knowledge fabric.
-   **SPEC-256 Skill-first capability discovery/routing** --- capability
    resolution.
-   **SPEC-277 Task Control Experience** --- long-running
    task/progress/evidence UX where applicable.
-   **Memory architecture** --- user/project/session/Mini-App/artifact
    context resolution remains external. This spec MUST NOT make legacy
    `personaId` or legacy memory schema a permanent architectural key.

If an existing implemented spec already owns a behavior, this spec adds
an adapter/contract only; it MUST NOT fork a competing implementation.

### 3.2 This spec owns

1.  Artifact semantic model and node identity.
2.  Artifact mutation contract.
3.  Preserve/lock constraints.
4.  Patch proposal, validation, preview and atomic commit.
5.  Artifact revision graph and conflict semantics.
6.  Artifact-level provenance and change receipts.
7.  Reference interpretation output contract.
8.  Shared Artifact SDK and adapter requirements.
9.  Cross-artifact validation hooks.
10. Portable serialization envelope.

### 3.3 This spec does not own

Presentation story planning, slide layout algorithms, freeform canvas,
PPTX fidelity, presenter mode, presentation templates, slide
transitions, or presentation-specific rendering. Those belong to
MINIAPP-002.

## 4. Core domain model

``` text
Artifact
├── artifactId
├── artifactType
├── schemaVersion
├── revisionId
├── projectBinding?
├── tenantBinding?
├── owner/authority
├── intentRef?
├── audienceRef?
├── designProfileRef?
├── evidenceRefs[]
├── rootNode
├── constraints[]
├── provenance
└── metadata

ArtifactNode
├── nodeId              # stable logical identity
├── nodeType
├── parentId?
├── orderKey
├── properties
├── children[]
├── evidenceRefs[]
├── locks[]
├── policyTags[]
└── metadata
```

Node IDs MUST remain stable across layout-only or style-only edits.
Importers MUST generate stable IDs and preserve them through round trips
when possible.

## 5. Canonical mutation contract

Every agent or programmatic edit MUST normalize to an
`ArtifactMutationRequest`.

``` yaml
mutationId: uuid
artifactId: artifact-id
baseRevisionId: rev-38
target:
  nodeIds: [slide-6]
  selector: null
operation: transform
intent: "make more visual"
allowedChanges:
  - layout
  - grouping
  - typography
  - visualization
preserve:
  - path: content.text
    mode: EXACT
  - path: data.numeric
    mode: NUMERIC
  - path: evidence.citations
    mode: SOURCE
deny:
  - rewrite_fact
  - delete_evidence
locksHonored: true
previewRequired: true
commitMode: PROPOSE_ONLY
idempotencyKey: ...
authorityContextRef: ...
```

### 5.1 Mutation operations

Minimum shared operations:

`ADD`, `REMOVE`, `REPLACE`, `TRANSFORM`, `REORDER`, `RESTYLE`,
`BIND_DATA`, `UNBIND_DATA`, `ANNOTATE`, `LOCK`, `UNLOCK`, `MERGE`,
`SPLIT`.

Domain adapters MAY add typed operations but MUST map them to shared
mutation semantics.

### 5.2 Preserve modes

Minimum:

-   `PRESERVE_EXACT`
-   `PRESERVE_SEMANTIC`
-   `PRESERVE_NUMERIC`
-   `PRESERVE_SOURCE`
-   `PRESERVE_VISUAL`
-   `PRESERVE_STRUCTURE`
-   `PRESERVE_ORDER`
-   `PRESERVE_IDENTITY`

A mutation validator MUST reject a proposed patch that violates a hard
preserve constraint.

### 5.3 Lock modes

Minimum:

-   `LOCK_CONTENT`
-   `LOCK_LAYOUT`
-   `LOCK_STYLE`
-   `LOCK_POSITION`
-   `LOCK_DATA`
-   `LOCK_CITATION`
-   `LOCK_BRAND`
-   `LOCK_COMPONENT`
-   `LOCK_SECTION`
-   `LOCK_ARTIFACT`

Locks are policy constraints, not UI decoration. All ingress paths MUST
honor the same effective locks.

## 6. Transactional edit lifecycle

``` text
Request
  ↓
Resolve artifact + base revision
  ↓
Resolve authority/policy/locks
  ↓
Normalize mutation
  ↓
Generate candidate patch
  ↓
Validate schema + constraints + evidence
  ↓
Render sandbox candidate (when renderable)
  ↓
Compute diffs
  ├─ semantic diff
  ├─ structural diff
  ├─ visual diff
  ├─ numeric/data diff
  └─ evidence/citation diff
  ↓
Proposal
  ↓
Accept / Reject / Partial Accept
  ↓
Revalidate against current revision
  ↓
Atomic commit
  ↓
New revision + evidence receipt + audit event
```

No AI agent may directly overwrite the canonical artifact when
`previewRequired=true`.

### 6.1 Partial acceptance

A proposal SHOULD be decomposable into independently valid patch units.
Users/agents may accept slide/component/section patches independently
when dependency analysis says the subset is safe.

### 6.2 Optimistic concurrency

Every write MUST carry `baseRevisionId` or equivalent ETag. If the
current revision differs:

-   do not silently overwrite;
-   calculate overlap/conflict;
-   auto-rebase only for provably non-overlapping safe mutations;
-   otherwise return `ARTIFACT_REVISION_CONFLICT` with affected node IDs
    and candidate resolution paths.

## 7. Revision graph

The system MUST support a DAG, not only a linear undo stack.

``` text
R1
├── R2-agent
└── R2-human
      └── R3
```

A revision records parent revision(s), actor, authority, mutation IDs,
timestamps, evidence refs, tool/model provenance, validation results and
content hashes.

Required operations: compare, restore-as-new-revision, branch, merge
proposal, inspect provenance, export revision.

## 8. Diff model

### Semantic diff

Meaning/fact claims added, removed or changed.

### Structural diff

Node addition/removal/reorder/reparent.

### Visual diff

Geometry, typography, visual hierarchy, density, styling and
rendered-pixel/region changes.

### Numeric/data diff

Any number, unit, formula, data binding or aggregation change.

### Evidence diff

Citation/source addition, removal, replacement, staleness or provenance
change.

For high-risk artifacts, numeric and evidence diffs MUST be
independently surfaced even if the visual change appears minor.

## 9. Reference Interpretation Contract

Inputs MAY include image/screenshot, PDF, PPTX, website capture,
existing artifact, brand guide or design-system source.

The interpreter returns a **DesignProfile**, not executable arbitrary
code:

``` yaml
designProfile:
  typography: ...
  palette: ...
  spacingScale: ...
  density: ...
  compositionPatterns: ...
  hierarchyRules: ...
  imageryStyle: ...
  iconography: ...
  chartLanguage: ...
  motionLanguage: ...
  accessibilityConstraints: ...
  confidence:
    typography: 0.96
    spacing: 0.78
provenance:
  references: [...]
```

Reference interpretation MUST distinguish observed facts from inferred
style. Low-confidence properties MUST remain overridable.

## 10. Evidence and provenance

Every factual/generated node MAY bind to evidence references. Mutations
MUST preserve evidence lineage unless explicitly authorized to replace
it.

A committed revision produces an `ArtifactChangeReceipt` containing:

-   artifact/revision IDs;
-   actor and execution authority;
-   requested intent;
-   changed nodes/properties;
-   preserved/locked fields checked;
-   evidence changed/preserved;
-   validation outcomes;
-   model/tool/capability identifiers where policy permits;
-   cost/credit attribution references;
-   timestamps and hashes.

## 11. Command surface

SPEC-279 remains the ingress authority. This spec defines capability
contracts such as:

``` text
artifact.get
artifact.inspect
artifact.propose_mutation
artifact.preview_mutation
artifact.validate_mutation
artifact.accept_patch
artifact.reject_patch
artifact.commit_patch
artifact.compare_revisions
artifact.restore_revision
artifact.branch
artifact.merge
artifact.lock
artifact.unlock
artifact.import
artifact.export
artifact.interpret_reference
```

UI actions and agent actions MUST converge on the same
commands/authorization checks. Direct database mutation from Mini App UI
is forbidden for canonical artifact edits.

## 12. Clarification and planning behavior

SPEC-269 owns conversational clarification. Artifact Fabric supplies
machine-readable missing-information and ambiguity signals, for example:

``` yaml
needsClarification: true
questions:
  - field: audience
    reason: "layout/content strategy materially depends on audience"
  - field: projectBinding
    choices: [...]
    reason: "multiple plausible projects"
```

If project identity is ambiguous, do not guess from legacy memory. Use
the platform project resolver/picker policy.

## 13. Portable Mini App contract

A detachable Mini App MUST be able to run with:

1.  SmartAIHub-hosted Artifact Fabric; or
2.  a compatible portable Artifact Runtime implementing the same
    versioned interface.

Portable envelopes MUST not require SmartAIHub-internal database IDs
beyond declared bindings. Export packages SHOULD include schema version,
artifact graph, asset manifest, provenance subset permitted for export,
and migration metadata.

## 14. Storage model

Logical model is implementation-neutral. Canonical state SHOULD
separate:

-   artifact metadata;
-   node graph/content;
-   revision/patch log;
-   binary assets;
-   rendered previews;
-   evidence/provenance refs.

Large assets belong in object storage rather than relational rows.
Search/vector indexes are derived indexes, not canonical artifact state.

## 15. Security and authorization

Mandatory:

-   tenant/project/artifact isolation;
-   object-level and node-level authorization hooks;
-   no trust in client-supplied actor/tenant/project IDs;
-   capability-scoped execution authority;
-   signed/verified asset access;
-   prompt/reference sanitization;
-   import bomb/archive bomb limits;
-   MIME/content validation;
-   SSRF-safe remote reference acquisition;
-   audit trail for privileged edits;
-   secret redaction from prompts, previews, receipts and exports;
-   policy enforcement identical across UI/MCP/A2A/harness paths.

## 16. Reliability and idempotency

Every mutating command MUST support idempotency. Retries may not
duplicate nodes or commits. Long-running render/import/export jobs
integrate with the shared job/control-plane authority rather than
creating an independent queue architecture.

Partial failure rules:

-   generation failure → no canonical mutation;
-   preview render failure → proposal may exist but cannot auto-commit
    when visual validation is required;
-   commit failure → atomic rollback;
-   audit/receipt persistence is part of successful settlement for
    governed mutations.

## 17. Observability

Required dimensions:

-   mutation latency by phase;
-   proposal acceptance/rejection rate;
-   constraint violation rate;
-   stale revision conflicts;
-   auto-rebase success;
-   render/validation failures;
-   rollback frequency;
-   token/model/tool cost attribution;
-   artifact type;
-   tenant/project with privacy-safe identifiers.

## 18. Performance targets

Initial targets, adjustable after baseline measurement:

-   metadata/node read P95 \< 300 ms excluding remote assets;
-   local validation P95 \< 200 ms for normal mutations;
-   commit P95 \< 500 ms excluding external rendering;
-   preview generation reports progressive status for operations \> 2 s;
-   large artifacts use lazy node/asset loading and incremental diffs.

No target may be "met" by skipping policy, evidence or conflict checks.

## 19. Reference implementation phases

### Phase A --- Contract/kernel

Schema, node identity, mutations, preserve/lock, revision IDs,
idempotency.

### Phase B --- Proposal/diff

Patch proposal, semantic/structural/numeric/evidence diff, partial
acceptance.

### Phase C --- Rendering adapters

Visual diff hooks and sandbox preview contract.

### Phase D --- Reference interpretation

DesignProfile extraction contract.

### Phase E --- Portable runtime

Versioned SDK, serialization, detached Mini App adapter.

### Phase F --- First production consumer

MINIAPP-002 AI Presentation Studio.

## 20. Required tests

At minimum:

1.  layout-only mutation cannot alter exact text;
2.  numeric preservation catches formatting-induced value changes;
3.  citation lock blocks source replacement;
4.  stale revision cannot overwrite newer edit;
5.  independent non-overlapping patches can rebase safely;
6.  conflicting patches require resolution;
7.  partial acceptance preserves dependency validity;
8.  lock enforcement identical via UI and MCP;
9.  unauthorized node mutation rejected;
10. retry with same idempotency key commits once;
11. rollback creates auditable revision, not history deletion;
12. imported node IDs remain stable through style-only edits;
13. evidence lineage survives reorder;
14. malicious reference URL cannot trigger SSRF;
15. export omits non-exportable secrets/private provenance;
16. detached runtime passes contract suite;
17. multi-tenant isolation test;
18. concurrent agent/human mutation race;
19. crash between proposal and commit;
20. crash during commit settlement/recovery.

## 21. Acceptance gates

Implementation is not complete until:

-   canonical number and dependencies verified against repo/worktrees;
-   schemas are versioned and migration-tested;
-   one UI path and one machine path prove command parity;
-   optimistic concurrency is demonstrated;
-   preserve/lock contract is enforced server-side;
-   proposal → preview → partial/full accept → commit → rollback works;
-   audit/change receipt exists for every governed commit;
-   MINIAPP-002 can consume the SDK without private DB coupling;
-   security, authorization, migration, data-integrity, deployment,
    secret-handling and policy tests pass;
-   recovery test proves no duplicate commit after worker/process
    restart.

## 22. Explicit anti-goals

Do not:

-   build another Primary Assistant;
-   create another MCP/A2A ingress gateway;
-   make Presentation-specific concepts canonical core primitives;
-   bind the new architecture permanently to legacy persona/memory
    schemas;
-   permit AI to bypass locks because it is "trusted";
-   use screenshot-only editing as canonical state;
-   treat rendered output as the sole source of truth;
-   silently resolve project/tenant ambiguity;
-   silently overwrite on revision conflict.

## 23. Relationship to MINIAPP-002

MINIAPP-002 is the first conformance consumer and MUST exercise:

-   hierarchical artifact nodes: deck → section → slide → component;
-   scoped mutation;
-   content/layout/data/citation locks;
-   before/after preview;
-   partial patch acceptance;
-   visual + semantic + numeric + evidence diff;
-   revision restore;
-   reference DesignProfile;
-   import/export adapter;
-   UI/agent command parity.

Presentation-specific improvements discovered during implementation
SHOULD extend this spec only when they generalize to at least one
additional artifact class.

## 24. Definition of Done

The Artifact Fabric is done when a human and an authorized agent can
concurrently edit a structured artifact through different ingress
surfaces, receive the same policy behavior, preview exactly scoped
changes, prove protected facts/data/evidence were not altered, accept
only desired patches, recover from conflicts/crashes, inspect
provenance, restore history, and run the same artifact contract in a
detachable Mini App runtime.

## 25. Ten-pass gap audit and hardening --- R1.1

This revision incorporates a structured ten-pass review. Findings are
normative where stated below.

### Pass 1 --- Authority, ownership and lifecycle

**Gap closed:** Artifact type schemas and adapters need explicit
ownership/version compatibility.

-   Introduce `ArtifactTypeManifest` with `typeId`, `schemaVersion`,
    `adapterVersion`, supported mutation operations, renderers,
    importers/exporters and compatibility range.
-   Core MUST reject an adapter whose compatibility range does not
    include the artifact schema/runtime protocol.
-   Artifact schema evolution requires forward/backward compatibility
    tests and an explicit migrator; never reinterpret old nodes
    silently.
-   Core authority covers generic contracts only; domain manifests own
    domain node semantics.

### Pass 2 --- Identity, tenancy, project binding and deletion

**Gap closed:** lifecycle semantics for ownership transfer, soft
deletion, retention and legal deletion were underspecified.

-   Artifact identity is immutable; tenant/project bindings are explicit
    versioned relationships.
-   Define lifecycle states: `ACTIVE`, `ARCHIVED`, `TRASHED`,
    `PURGE_PENDING`, `PURGED`.
-   Retention/legal-hold policy overrides normal purge.
-   Purge MUST cover canonical content, derived previews, caches,
    search/vector indexes and non-required asset copies, while retaining
    only audit material legally/policy-required.
-   Moving an artifact across tenant boundaries is not an ordinary
    mutation; it requires an authorized transfer/copy workflow with
    provenance handling.

### Pass 3 --- Patch algebra and dependency safety

**Gap closed:** partial acceptance needs machine-verifiable
dependencies.

Every proposed patch unit MUST carry: - `patchId`; - `dependsOn[]`; -
`conflictsWith[]`; - preconditions/postconditions; - affected
node/property set; - deterministic application order.

Partial acceptance MUST compute dependency closure. Reject orphaned
references, invalid ordering, broken data bindings or semantic
invariants. Patch application MUST be deterministic for the same base
revision and patch set.

### Pass 4 --- Concurrency, leases and offline reconciliation

**Gap closed:** optimistic concurrency alone is insufficient for long
edits/offline clients.

-   Optional advisory edit leases/presence MAY reduce collisions but
    never replace revision checks.
-   Offline clients maintain a local operation journal tied to the last
    acknowledged revision.
-   Reconnection performs rebase/conflict analysis before commit.
-   Server time/order is authoritative for settlement; client timestamps
    are informational.
-   Multi-agent batch edits must expose a transaction/group ID to
    correlate proposals and commits.

### Pass 5 --- Security, prompt injection and untrusted artifact content

**Gap closed:** artifact text/references themselves can contain
instructions attacking agents.

-   Treat imported/retrieved artifact content as **data**, not
    authority.
-   Tool/system instructions found inside documents, slides, notes, URLs
    or metadata MUST NOT elevate permissions.
-   Reference acquisition must enforce URL normalization, redirect
    limits, DNS/IP revalidation, private-network blocking and
    content-size/type limits.
-   Imported active content, macros, scripts, embedded executables and
    unsafe external relationships are quarantined/disabled.
-   Capability execution uses explicit allowlists and least privilege.
-   Provenance must record sanitized/quarantined transformations.

### Pass 6 --- Privacy, provenance and export boundaries

**Gap closed:** provenance can itself contain sensitive information.

Classify provenance/evidence metadata into: - public/exportable; -
collaborator-visible; - tenant-internal; - restricted/system-only.

Exporters MUST apply a destination policy and never blindly serialize
the full provenance graph. Change receipts must use privacy-safe actor
identifiers appropriate to the viewer.

### Pass 7 --- Assets, garbage collection and content-addressed integrity

**Gap closed:** binary asset lifecycle and deduplication were not
explicit.

-   Assets SHOULD use immutable/content-addressed hashes where
    practical.
-   Revisions reference asset manifests; mutation commit validates
    referenced assets.
-   Garbage collection occurs only when no live
    revision/retention/legal-hold reference requires the asset.
-   Remote assets required for deterministic rendering SHOULD be
    snapshotted where licensing/policy allows.
-   Asset replacement is a mutation with provenance, not an in-place
    byte overwrite.

### Pass 8 --- Deterministic rendering and reproducibility

**Gap closed:** visual diff is unreliable without render-environment
identity.

A render receipt MUST include: - renderer/version; - artifact
schema/revision; - fonts and substitutions; - viewport/page geometry; -
locale/timezone when relevant; - asset hashes; - render options.

Visual regression compares compatible render environments or clearly
labels environmental drift. Renderers MUST not fetch mutable external
resources silently during canonical validation.

### Pass 9 --- Operational recovery and backpressure

**Gap closed:** queue overload/cost runaway behavior needed explicit
semantics.

-   Every expensive operation carries budget, deadline and cancellation
    context.
-   Support backpressure and per-tenant/provider quotas through shared
    control-plane policy.
-   Cancellation is cooperative but settlement-safe.
-   Recovery distinguishes `REQUESTED`, `RUNNING`, `PROPOSAL_READY`,
    `COMMITTING`, `COMMITTED`, `FAILED`, `CANCELLED`,
    `UNKNOWN_REQUIRES_RECONCILIATION`.
-   "Unknown" after crash must reconcile using idempotency/receipt state
    before retry.

### Pass 10 --- Conformance, observability and rollout

**Gap closed:** implementation needs a reusable contract certification
suite.

Create an **Artifact Runtime Conformance Suite** covering: -
schema/version negotiation; - command parity; - lock/preserve
enforcement; - patch dependency/partial acceptance; - stale-write
conflict; - idempotent recovery; - provenance/privacy export; - tenant
isolation; - malicious import/reference fixtures; - deterministic render
receipt; - detached runtime compatibility.

Rollout MUST support feature flags/canary tenants, migration dry-run,
rollback, and metrics comparing legacy/new artifact paths before
retirement.

## 26. Additional canonical schemas

### 26.1 ArtifactTypeManifest

``` yaml
typeId: presentation.deck
schemaVersion: 1.0.0
adapterVersion: 1.0.0
runtimeProtocol: ">=1.0 <2.0"
nodeTypes: [...]
operations: [...]
renderers: [...]
importers: [...]
exporters: [...]
migrations: [...]
```

### 26.2 PatchUnit

``` yaml
patchId: p-17
baseRevisionId: r-42
dependsOn: []
conflictsWith: []
preconditions: [...]
operations: [...]
postconditions: [...]
affectedPaths: [...]
riskClass: MEDIUM
requiresPreview: true
```

### 26.3 RenderReceipt

``` yaml
artifactId: ...
revisionId: ...
renderer: ...
rendererVersion: ...
assetHashes: [...]
fontManifest: [...]
geometry: ...
locale: ...
optionsHash: ...
outputHash: ...
```

## 27. Updated Definition of Done --- R1.1

In addition to Section 24, completion requires:

-   artifact type manifest/version negotiation and migration tests;
-   lifecycle/archive/purge/retention semantics;
-   patch dependency closure for partial acceptance;
-   offline/stale-client reconciliation;
-   prompt-injection and malicious-content tests;
-   provenance visibility/export classification;
-   asset reference integrity and garbage-collection tests;
-   reproducible render receipts;
-   crash state reconciliation including UNKNOWN state;
-   reusable conformance suite passing against both hosted and detached
    runtimes;
-   canary/rollback evidence before broad production cutover.

## 28. Second ten-pass adversarial audit --- R1.2 / 20PASS cumulative

### Pass 11 --- Canonical registry, dependency pinning and authority drift

**Gap closed:** runtime behavior could drift if dependencies are
referenced only by spec number/name.

-   Implementation handoff MUST record the exact canonical spec
    file/revision/hash used for each authority dependency.
-   CI MUST detect duplicate active spec numbers, stale renamed
    references and references to superseded/provisional authorities.
-   `SPEC-305` remains provisional until the repository canonical-number
    gate confirms the number.
-   A dependency change that alters a contract requires compatibility
    review; "same spec number" is not sufficient evidence.

### Pass 12 --- API/protocol evolution and capability negotiation

**Gap closed:** schema versioning alone did not fully cover protocol
negotiation.

Every runtime exposes a capability document containing protocol version,
supported artifact types, mutation verbs, diff types, lock modes,
maximum payload/asset limits, streaming support and optional extensions.

Rules: - unknown required extension → fail closed with structured
incompatibility; - unknown optional extension → ignore safely; -
additive fields must preserve old-reader behavior; - breaking semantics
require major protocol version; - clients must not infer support from
server brand/version strings.

### Pass 13 --- Authorization delegation and confused-deputy protection

**Gap closed:** delegated agents need explicit authority ceilings.

Every mutation execution carries: - authenticated principal; -
delegating principal if any; - tenant/project/artifact scope; -
capability scope; - permission ceiling; - approval requirements; -
expiry/session binding.

A downstream agent/tool may receive **equal or narrower**, never
broader, authority. Artifact references are not proof of authorization.
Reauthorization occurs at commit, export, publish and sensitive evidence
access boundaries.

### Pass 14 --- Distributed consistency and commit settlement

**Gap closed:** DB commit, asset writes, index updates and receipts can
span systems.

Define canonical settlement: 1. durable intent/idempotency record; 2.
validate staged assets; 3. atomic canonical revision commit; 4. durable
change receipt; 5. enqueue derived-index/render work through
transactional outbox or equivalent; 6. acknowledge success.

Search/vector/render caches are eventually consistent derivatives and
MUST expose revision identity. Failure to update a derivative never
rolls canonical state backward; reconciliation repairs derivatives.

### Pass 15 --- Storage migrations and zero-data-loss cutover

**Gap closed:** storage evolution needs explicit rollout mechanics.

Required for schema/storage migration: - inventory + compatibility
matrix; - dry-run on production-shaped data; - backup/restore proof; -
expand → backfill → verify → switch reads → switch writes → contract; -
dual-read/write only when semantics are proven and time-bounded; -
row/object counts, hashes or semantic invariants for reconciliation; -
rollback point before destructive contract step; - no destructive
migration while older active workers cannot understand the new format.

### Pass 16 --- Artifact merge semantics

**Gap closed:** DAG merge was named but merge classes were
underspecified.

Merge engine classifies changes: - disjoint structural; - same-property
compatible; - same-property conflicting; - delete-vs-edit; -
move-vs-edit; - data/evidence conflict; - domain invariant conflict.

Automatic merge is allowed only for proven-safe classes. Domain adapters
provide invariant validators. Every merge creates a proposal with both
parent revisions and conflict resolution provenance.

### Pass 17 --- Data bindings, formulas and reproducibility

**Gap closed:** generic artifacts may contain live data whose value
changes independently.

A `DataBinding` records source identity, query/range/formula, transform
version, refresh policy, snapshot revision/time and credentials by
reference only.

Modes: - `LIVE`; - `SNAPSHOT`; - `FROZEN`.

Published/exported artifacts SHOULD resolve to a reproducible snapshot
unless explicitly marked live. Refresh is a governed mutation when
visible output changes.

### Pass 18 --- Abuse, quotas and resource exhaustion

**Gap closed:** generic artifact APIs can be abused through deeply
nested graphs or pathological patches.

Enforce configurable limits for: - node count/depth; - patch
operations; - asset count/size; - decompression ratio; - render
complexity/time; - reference fan-out; - concurrent proposals; - revision
churn.

Limit errors must be structured and must not leave partial canonical
state.

### Pass 19 --- Disaster recovery and regional portability

**Gap closed:** backup existed implicitly but RPO/RTO and restore
verification were absent.

Production deployment MUST define per-tier RPO/RTO for canonical
metadata, artifact content, revision log and assets. Backups without
periodic restore tests do not satisfy DR. Restore must reconcile
canonical revisions, assets, receipts and derivative indexes.
Region/provider migration must preserve artifact IDs and revision hashes
where feasible.

### Pass 20 --- Evidence-driven implementation certification

**Gap closed:** test pass claims need immutable evidence.

A release candidate produces a `ConformanceEvidenceBundle`: - git
commit/build identity; - schema/protocol versions; - migration
evidence; - test suite IDs/results; - security test results; -
recovery/DR exercise results; - performance baseline; - known exceptions
with owner/expiry; - artifact-runtime compatibility matrix.

"Implemented" or "PASS" may not be declared solely from source presence
or unit tests.

## 29. Normative distributed state model

Canonical mutation states:

``` text
RECEIVED
 → VALIDATING
 → PROPOSING
 → PROPOSAL_READY
 → APPROVED
 → COMMIT_INTENT_RECORDED
 → COMMITTED
 → DERIVATIVES_PENDING
 → SETTLED
```

Terminal/exception states:

``` text
REJECTED
CANCELLED
FAILED
CONFLICT
UNKNOWN_REQUIRES_RECONCILIATION
```

`COMMITTED` means canonical revision exists durably. `SETTLED` means
required receipt/outbox obligations are durable; derivative
rendering/indexing may carry their own readiness state.

## 30. Required failure-injection matrix

Certification MUST inject failures at least at:

1.  after idempotency record, before proposal;
2.  after asset staging;
3.  before canonical commit;
4.  immediately after canonical commit;
5.  before receipt/outbox settlement;
6.  after acknowledgement loss;
7.  during derivative indexing;
8.  during export rendering;
9.  during migration backfill;
10. during restore/reconciliation.

For each, prove no duplicate canonical revision, no unauthorized
widening, no orphaned committed reference and deterministic recovery
path.

## 31. Updated implementation gate --- R1.2

Before coding domain consumers against this runtime:

-   canonical spec-number and dependency-hash audit passes;
-   protocol capability negotiation exists;
-   permission-ceiling propagation is implemented/tested;
-   canonical settlement/outbox semantics are fixed;
-   migration and rollback plan exists;
-   merge conflict classes are defined for the domain;
-   data binding mode is explicit;
-   abuse/resource limits are configured;
-   DR tier and restore test are defined;
-   release evidence bundle format is available.

## 32. Third ten-pass production-hardening audit --- R1.3 / 30PASS cumulative

### Pass 21 --- Canonical serialization, revision hashing and integrity

**Gap closed:** revision hashes are not trustworthy unless serialization
is deterministic.

Define a canonical serialization profile for every artifact schema: -
stable property ordering; - normalized Unicode; - explicit numeric
encoding rules; - canonical null/default handling; - stable node
ordering rules where order is semantic; - exclusion rules for
ephemeral/runtime-only fields.

`contentHash` and `revisionHash` MUST state the algorithm/version used.
A revision hash MUST be reproducible from canonical state and declared
parent/provenance inputs. Hash algorithm migration requires dual-hash
transition metadata.

Export/publish packages SHOULD support a signed manifest when the
deployment provides a signing authority. Signature verification failure
is a hard integrity warning and must not be silently ignored.

### Pass 22 --- Privacy, PDPA, residency and data-subject lifecycle

**Gap closed:** purge/legal-hold semantics alone do not cover privacy
governance.

Artifacts, nodes, assets, evidence and provenance MUST support data
classification at minimum: - `PUBLIC`; - `INTERNAL`; - `CONFIDENTIAL`; -
`RESTRICTED`; - `PERSONAL_DATA`.

The runtime MUST expose policy hooks for: - purpose/consent where
applicable; - tenant/project data residency; - retention schedules; -
access/export requests; - correction/rectification workflows; -
deletion/anonymization workflows subject to legal hold; -
cross-border/export restrictions; - privacy-safe telemetry.

Derived indexes, previews, caches and detached copies must participate
in deletion/retention reconciliation. Sensitive classifications MUST NOT
be inferred from UI visibility alone.

### Pass 23 --- Extension/plugin/skill isolation

**Gap closed:** generic artifact hooks can become a privilege-escalation
surface.

Artifact-type adapters, validators, renderers, importers/exporters and
extension hooks MUST declare: - extension identity/version; - requested
capabilities; - network/file/secret access; - deterministic vs
non-deterministic behavior; - supported schema/protocol range; -
timeout/resource limits.

Execution uses sandboxing/isolation appropriate to the capability.
Extensions receive only scoped artifact slices and scoped credentials.
Extension output is untrusted until validated by the core schema/policy
layer.

An extension MUST NOT bypass canonical mutation, authorization, audit,
idempotency or settlement rules.

### Pass 24 --- Execution manifest and reproducible AI/tool actions

**Gap closed:** model/tool provenance was too loose for investigation
and replay.

Every material generated proposal SHOULD emit an `ExecutionManifest`
containing policy-permitted: - orchestrator/agent identity; -
model/provider identifier and version/family where available; -
tool/skill/extension versions; - artifact base revision; - input
reference hashes; - effective constraints/locks; - sampling/config
profile hash where applicable; - execution timestamp and region/runtime
identity; - output patch IDs/hashes.

Raw prompts, secrets and private context need not be stored. The
manifest may store hashes/redacted summaries to balance reproducibility
with privacy.

### Pass 25 --- Observability cardinality, tracing and redaction

**Gap closed:** observability requirements risk leaking content or
creating unbounded-cardinality metrics.

Use: - correlation/trace IDs across ingress → orchestration → mutation →
commit → derivative tasks; - bounded-cardinality metrics; - structured
logs with field-level redaction; - sampled traces for high-volume
operations; - no raw artifact body, secret, prompt, evidence content or
personal data in logs by default.

Diagnostic elevation requires explicit authorization/time-bound policy.
Trace propagation must not become an authorization credential.

### Pass 26 --- Supply-chain and build provenance

**Gap closed:** renderer/importer/runtime binaries can alter artifact
behavior without source-level visibility.

Production releases MUST maintain: - dependency lockfiles; - SBOM or
equivalent component inventory; - build identity/provenance; -
vulnerability scanning policy; - signed/verified release artifacts where
supported; - approved font/renderer/native-library provenance.

A renderer/importer change that affects output compatibility must
increment the relevant implementation version and re-run conformance
fixtures.

### Pass 27 --- Property-based, fuzz and metamorphic contract testing

**Gap closed:** example fixtures alone may miss patch algebra and parser
edge cases.

Add automated test families: - property-based artifact graph
generation; - randomized patch ordering within dependency constraints; -
merge associativity/commutativity checks only where semantics claim
them; - serialization/hash round-trip invariants; - malformed/hostile
import fuzzing; - deep nesting and decompression/resource attacks; -
Unicode/bidi/locale edge cases; - crash/retry metamorphic tests proving
idempotent settlement.

Any invariant that is intentionally non-commutative/non-associative must
be documented.

### Pass 28 --- Detached-runtime upgrade, downgrade and protocol skew

**Gap closed:** portability requires a lifecycle beyond initial
conformance.

A detached runtime MUST support: - pre-upgrade compatibility check; -
backup/export checkpoint; - schema migration dry-run; - rolling or
stop-the-world upgrade policy; - rollback only while data remains
readable by the prior version; - protocol-skew limits between
client/runtime/extensions; - explicit `READ_ONLY_COMPATIBILITY_MODE`
when writes are unsafe.

Newer clients must not mutate through an older runtime merely because
reads succeed.

### Pass 29 --- Cost reservation, attribution and exactly-once settlement

**Gap closed:** cost attribution existed but retries could create
accounting ambiguity.

Expensive operations SHOULD support: 1. estimate; 2. policy/quota check;
3. optional budget/credit reservation; 4. execution; 5. actual usage
settlement; 6. release of unused reservation.

Usage settlement is keyed to idempotent execution/receipt identity so
retries cannot double-charge. Cost metadata must distinguish platform,
tenant and provider/extension attribution when the commercial model
requires it.

### Pass 30 --- Definition of Ready, work-package boundaries and anti-drift controls

**Gap closed:** a strong DoD does not prevent teams from starting
against unresolved architectural inputs.

A feature/work package is **READY** only when: - authority owner/spec
revision is identified; - schema/API changes are enumerated; -
migration/storage impact is known; - authorization and permission
ceiling are defined; - failure/retry/idempotency behavior is defined; -
observability fields are defined; - acceptance tests have stable IDs; -
rollback/recovery strategy exists; - unresolved blockers are explicitly
listed; - mock/fake dependencies are clearly marked non-production.

Implementation PRs MUST link requirement/test IDs. Scope changes
discovered during implementation update the spec/handoff rather than
being hidden in code comments or local assumptions.

## 33. New normative records --- R1.3

### 33.1 CanonicalHashManifest

``` yaml
serializationProfile: artifact-canonical-json/1
hashAlgorithm: sha256
artifactId: ...
revisionId: ...
parentRevisionHashes: [...]
contentHash: ...
revisionHash: ...
schemaVersion: ...
```

### 33.2 ExtensionManifest

``` yaml
extensionId: ...
version: ...
kind: renderer|importer|exporter|validator|adapter
protocolRange: ">=1.0 <2.0"
schemaRanges: {...}
capabilitiesRequested: [...]
networkPolicy: NONE
secretRefsAllowed: []
resourceLimits: {...}
determinism: DETERMINISTIC|DECLARED_NONDETERMINISTIC
```

### 33.3 ExecutionManifest

``` yaml
executionId: ...
baseRevisionId: ...
agentOrchestrator: ...
modelProfile: ...
toolVersions: [...]
inputReferenceHashes: [...]
constraintHash: ...
runtimeIdentity: ...
resultPatchHashes: [...]
privacyRedactionProfile: ...
```

## 34. R1.3 compliance additions

A compliant implementation MUST additionally prove:

-   identical canonical state yields identical canonical content hash;
-   privacy deletion/retention reconciliation reaches derivatives;
-   untrusted extensions cannot widen authority or bypass mutation
    settlement;
-   AI/tool execution manifests are emitted without leaking restricted
    context;
-   logs/traces pass redaction tests;
-   supply-chain/build provenance exists for production artifacts;
-   property-based/fuzz suites exercise graph, parser and idempotency
    invariants;
-   detached runtime can safely refuse writes during incompatible
    version skew;
-   retried expensive operations cannot double-charge;
-   every implementation work package passes Definition of Ready before
    execution.

## 35. Updated Definition of Done --- R1.3

R1.3 supersedes prior DoD additions. Production readiness requires all
previous gates plus:

1.  canonical serialization/hash profile and hash-migration policy;
2.  privacy/PDPA classification, residency, retention and data-subject
    workflows;
3.  sandboxed/versioned extension contract;
4.  reproducible/redacted execution manifests;
5.  trace correlation with bounded-cardinality privacy-safe telemetry;
6.  dependency/SBOM/build provenance for runtime and render/import
    stack;
7.  property-based/fuzz/metamorphic tests;
8.  detached runtime upgrade/downgrade/skew tests;
9.  idempotent cost reservation/settlement tests when billing applies;
10. requirement → work package → PR → test → evidence traceability.
