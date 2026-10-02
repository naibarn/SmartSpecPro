---
spec_id: 256
numbering_status: PROVISIONAL_PENDING_CANONICAL_SMARTSPECPRO_REGISTRY_CHECK
title: SmartAIHub Skill-First Capability Discovery & Intent Execution
revision: 1.2-second-independent-12-pass-audit
status: R1_2_DESIGN_REVISED_SECOND_12_PASS_DESK_AUDIT_IMPLEMENTATION_NOT_VERIFIED
prepared: 2026-09-28
audit_passes: 14  # earlier R1.1 audit; R1.2 adds 12 distinct passes
audit_basis: supplied R1.0 markdown, bundled schema/fixtures/Skill, saved cross-spec sources and stable MCP Skills specification
proposed_path: specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md
primary_owner: capability-discovery projection; human/agent capability explainability; skill-first intent selection contract and conformance; reusable Film Studio capability profile
implementation_boundary: Specs 1-214 immutable; Spec 224 under active implementation unchanged; no duplicate Registry, Chat, Workflow, physical Job, Approval, Ledger, MCP or Film authority
related_specs: [186, 195, 196, 197, 199, 200, 206, 207, 209, 212, 215, 216, 220, 221, 224, 225, 226, 227, 229, 231, 233, 239, 240, 241, 242, 243, 244, 247, 248, 250, 251, 252, 253, 254, 255]
feature_flags:
  capability_experience.enabled: false
  capability_experience.catalog_ui.enabled: false
  capability_experience.skill_first_resolver.enabled: false
  capability_experience.agent_projection.enabled: false
  capability_experience.film_hybrid_pack.enabled: false
  capability_experience.intent_evaluation.enabled: false
  capability_experience.bounded_assisted.enabled: false
  capability_experience.agent_catalog_export.enabled: false
  capability_experience.public_projection_v2.enabled: false
  capability_experience.delegation_envelope_v1.enabled: false
  capability_experience.step_review_v1.enabled: false
---

# Spec 256 — Skill-First Capability Discovery & Intent Execution (R1.2)

> **R1.1, 14-pass desk-audited implementation proposal, not runtime certification.** This specification is drafted against the latest accessible SmartAIHub design pack dated 2026-09-27: Spec 248 R1.4, Specs 252/253/254 R1.3, and Spec 255 R1.0. R1.1 adds effect-budget boundaries, scoped discovery/cursor semantics, Skill integrity, step-review resumability, media clocks and extended contract fixtures. It is **not** reconciled with the live SmartSpecPro main branch, deployed database, active worktrees or actual provider entitlements. G0 below is mandatory before assigning the final spec number, applying DDL, changing existing contracts, or enabling production. If `256` is occupied, renumber only this new proposal.
>
> **Controlling product principle:** **Functions are independently callable; Skills teach the LLM to choose and use them; Workflow is optional.** A user's simple command must not silently expand into a complete automated pipeline. The same set of authorized capabilities must be intelligible to a person, SmartAIHub Chat, a Mini App, or an external Agent.

**R1.2 precedence rule:** The new Sections 25–36, R1.2 schemas and negative conformance tests govern wherever R1.0/R1.1 examples are less restrictive. R1.1 Sections 17–24 and the R1.1 contract schemas below are additive but normative for this proposal. Where a narrower R1.0 example conflicts (notably Film P0 scope, paid preview, server-side plan validation, cursor scope and cancellation), use the stricter R1.1 rule. Do not alter frozen owner specs.

## 0. Executive decision

SmartAIHub SHALL expose its existing executable capabilities through a normalized, permission-aware **Capability Experience** layer. The layer supplies (a) a concise catalog understandable by humans and agents, (b) Skill-first semantic retrieval, (c) user-intent-to-action proposals constrained by context and risk, and (d) access to the **existing** capability invocation, jobs, approvals and artifact APIs. Its Film Studio profile SHALL register reusable AI Hybrid operations—media inspection, masks, depth, normal, tracking, generative editing, compositing, relighting, grading, QC—without hard-wiring them into an end-to-end automation.

The proposal closes a **discoverability and controlled-composition gap**. It does **not** replace the existing Feature 196 Capability Resolver/Registry, Spec 221 Skill Registry, Spec 229 Retrieval Broker, Spec 253 cross-product command adapters, Spec 248 MCP Skills transport, Spec 215 Workflow compiler or Feature 195 / Spec 186 job authority. Every manifest and API below is a **logical, additive contract** to map to those owners at G0; a similar existing schema wins over an invented duplicate.

### 0.1 Product invariants

1. **Function-complete:** each function can be discovered, described and invoked independently, subject to current policy and implementation availability. Any preparatory operation outside read-only metadata inspection and input validation MUST be separately declared, quoted and authorized; do not smuggle paid generation into a single-function request. Its output is a reusable, versioned artifact when appropriate.
2. **Skill-first:** for open-ended tasks, locate a relevant reviewed Skill before inventing a procedure; load content only when needed; an explicit function request can use that function directly without a needless Skill round trip.
3. **User controls scope:** discovery, advice, preview, one operation, a bounded multi-step plan and a persisted Workflow are distinct intents. Never interpret a question as execution or silently persist a Workflow.
4. **One shared catalog, multiple projections:** a human Explorer, Chat, Mini App and external Agent see views of the same canonical entries, but never the same unfiltered authorization scope.
5. **One authority per concern:** a document advertising a capability is not a grant, an invocation, an execution receipt or a Skill installation.
6. **Provider independence:** an operation describes what it produces; a separately qualified offer resolves how, where and at what cost it can run.
7. **Run anywhere:** Full Chat, compact Chat, Task Control, phone/tablet and domain UI share Feature 196 and Specs 225/226; an open editor and local GPU are optional.
8. **Fail closed on uncertain identity, privileges, budget and external data transfer; degrade gracefully on optional capability availability.**
9. **Explain why:** the user and Agent can inspect selected Skill, candidate capability, availability, estimated effects/cost, rejected alternatives and output provenance.
10. **No undocumented deployment claims:** availability and protocol conformance are measured on real installed versions and account entitlements, not assumed from brand/model names.

### 0.2 Non-goals

- A second global Capability Registry, Skill Registry, Retrieval Broker, Chat history, workflow DAG, scheduler or job ledger.
- Automatic installation of third-party ComfyUI nodes, local models, MCP servers, Agent Skills or scripts in response to a production media request.
- Treating Skills as tools or permitting `resources/read` to activate/approve one.
- Routing local Runner-capable tools directly to the Core; the registered Runner supervises local execution.
- Model promises unsupported by live provider contracts (e.g. arbitrary native depth conditioning or fixed output FPS).
- One-click full automation as the default behavior; irreversible auto-publishing or automatic external egress.
- Reconstructing true sensor RAW or clipped highlights from 8-bit generated video by changing container/bit depth.
- Changing a previously approved Film shot, Video Editor locked range or Creator variant without its canonical domain-owner transaction.

## 1. Terminology and authority map

| Term | Meaning | System-of-record / authority |
|---|---|---|
| Function | An independently callable semantic operation with typed input/output and effects | Existing Capability Registry/Feature 196 plus domain owner |
| Capability | Discoverable description of an operation and its required constraints | Existing Capability Registry, extended by non-authoritative projection |
| Implementation / offer | A currently qualified backend for a capability: native, Runner-managed local, MCP, cloud or external Agent | Existing Registry + resource/placement owners (197/199/200/231/242/243) |
| Skill | Versioned instructions and supporting assets teaching reasoning, method and tool selection | Spec 221; Spec 248 for MCP distribution |
| MCP Tool | Protocol-exposed executable operation | Spec 199 MCP boundary plus canonical authorization |
| A2A AgentSkill | An external Agent Card's advertised high-level ability; **not** a SmartAIHub Skill release | Specs 200/206 adapter normalization |
| Product action | Typed domain-specific command committing its own canonical resource | Spec 253 and relevant product owner |
| Workflow | Optional saved, reusable multi-step plan with DAG, retries and invalidation | Specs 209/215; existing durable kernel |
| Physical job | Admitted work, fenced attempt, provider receipt and recovery | Feature 195 / Spec 186 `worker_jobs` |
| Artifact | Immutable output and lineage (bytes stored in R2 or other authorized store) | Existing Library / media domain / provenance owners |
| Capability projection | Searchable, explainable and filtered representation assembled from canonical metadata | **Spec 256 owns the projection contract, not new registry authority** |

### 1.1 Canonical owner matrix

| Existing owner | What this spec may add | What this spec MUST NOT take over |
|---|---|---|
| Feature 196 / shared Capability Registry | Descriptor enrichment, human-language intent aliases, candidate ranking and resolver fixtures | Goal/conversation/registry/invocation authority |
| Specs 225/226 | Catalog cards, Skill choice explanation, bounded task actions, mobile projections | A second Chat or Task Control ledger |
| Spec 221 | Links to approved Skill releases, use-case metadata, outcome evaluation | Authoring, provenance, publication, licensing and activation truth |
| Spec 229 / production Vectorize | Read-only indexed catalog metadata and tenant-safe retrieval | A second memory store or authorization source |
| Specs 199/248 | Agent-facing Tool/Skill projections and compatibility tests | MCP transport, methods, protocol negotiation and Skill file delivery |
| Specs 200/206/239 | Agent-readable action descriptions and delegated task binding | Harness/A2A/agent connection policy and runtime |
| Spec 253 | Map one selected capability to an existing ProductActionManifest and command context | Cross-product command envelope and MediaHandoffBundle schemas |
| Specs 209/215 | Optional handoff of an approved multi-step plan | DAG compilation, logical retries, partial invalidation and saved Workflow truth |
| Feature 195/Spec 186 | Bind a proposal to admitted job and result views | Job state, queues, settlement/lease/fencing/recovery |
| Specs 207/220/227 | Preflight cost, consent, egress, rights and publication disclosures | Ledger, ACL, policy, approval or publication finality |
| Feature 197 / Specs 231/242/243/254 | Backend eligibility and Film-specific task profile lookup | Local device authority, provider routing/placement or Film execution truth |
| Specs 240/241 | Safe typed UI cards; authorized project resolution | Arbitrary AI-written UI execution or memory-based permissions |
| Specs 252/255 | Film-specific operation catalog; optional semantic graph references | Film scene/shot truth, semantic media graph or reuse authorization |

> **Frozen boundary:** Specs 1–214 including 199/200/212/213 are implementation history, not retroactive editing targets. Use later additive contracts, adapter packages and backlog items. Spec 224 must remain unchanged during its active implementation; pass any development tasks via its existing approved ingress.

## 2. High-level architecture

```text
  Full Chat / Mini Chat / Task Control / Mobile / Film / Mini App
                           |
            Feature 196 canonical message + goal
                           |
         Context Broker (Spec 241 + page hint from 253)
                           |
          Skill-first Intent & Discovery Projection  [256]
          |                  |                    |
   Skill metadata        Capability metadata   Product action metadata
   221 / 248             existing Registry     253 domain adapters
          |                  |                    |
      Spec 229 Retrieval Broker + Vectorize indexes (advisory)
                           |
      LLM proposes one of DISCOVER / ADVISE / PREVIEW /
      SINGLE_FUNCTION / BOUNDED_ASSISTED / SAVED_WORKFLOW
                           |
        Typed proposal + explicit target + cost/egress/risk
                           |
     Server-side resolver + canonical policy + current offers
                           |
    Existing capability.invoke / 253 product action / 215 DAG
                           |
      Approval + Spec 207 quote/reservation as required
                           |
        Feature 195 worker_jobs / current dispatch owners
              |                 |                 |
     First-party native     Runner-managed      Cloud/MCP/Agent
          functions        local / ComfyUI       via existing gateways
                           |
      Canonical result/artifact receipts + Library/R2 + UI cards
```

### 2.1 No second registration system

Spec 256 SHALL implement a projection/materialized view assembled from existing canonical function metadata, ProductActionManifestV1, Skill releases, approved tool/agent offers and current policy. Its index may be discarded and rebuilt. It cannot mint grants, publish Skill releases, allocate credits or independently change canonical capability availability. Where the current Registry lacks a field, propose an additive owner-approved extension; never create a competing `film_capabilities` table.

The projection is split into **Catalog Definition** (stable semantic contract), **Implementation Offer** (backend/version/availability with short TTL), **Entitlement View** (per actor/tenant/project, evaluated server-side) and **Human/Agent Presentation** (bounded disclosure). A definition can exist when no implementation is online; the UI must say "supported in catalog, unavailable now," not "ready."

### 2.2 Discovery is not execution

`capability.search` and `capability.describe` are metadata/read paths; `capability.invoke`, status and result reuse the existing gateway. A returned search result is a candidate, not an execution ticket. New descriptive fields MUST be optional for legacy callers, schema-versioned, and never trusted as an invocation authorization token. Cache candidate metadata only; re-evaluate entitlement, scope and health before quote and at dispatch.

## 3. Capability projection: logical contracts

At G0 map these types to the actual deployed types; the TypeScript below defines **contract semantics**, not a directive to create duplicate database tables or API endpoints.

### 3.1 Descriptor

```ts
type RiskClass = 'READ'|'DRAFT'|'PAID'|'PRIVILEGED'|'PUBLISH';
type EffectClass = 'READ_ONLY'|'CREATE_DERIVATIVE'|'MUTATE_DOMAIN'|
                   'EXTERNAL_EGRESS'|'RUN_UNTRUSTED_CODE'|'RELEASE';

interface CapabilityCardV1 {
  schemaVersion: 'sah.capability.card.v1';
  canonicalCapabilityRef: string; // resolved, not arbitrary client input
  semanticActionId: string;       // stable owner-registered ID or explicit alias
  ownerProductRef: string;        // e.g. film, editor, generic_media
  implementationContractVersion: string;
  presentationRevision: string;
  title: Record<string,string>;  // at least en, th at P0
  plainLanguageSummary: Record<string,string>;
  intentAliases: Array<{locale:string; phrase:string; reviewed:boolean}>;
  categoryRefs: string[];
  requiredInputKinds: string[];
  outputKinds: string[];
  inputSchemaRef: string; outputSchemaRef: string;
  riskClass: RiskClass; effectClasses: EffectClass[];
  supportsPreview: boolean; supportsCancellation: boolean; // legacy compatibility only
  cancellationMode?: 'SUPPORTED'|'BEST_EFFORT'|'NOT_SUPPORTED';
  previewCostClass?: 'FREE_METADATA'|'COMPUTE'|'PAID_EXTERNAL';
  executionSafetyProfileRef?: string; // owner-reviewed effect and prerequisite policy
  relevantSkillReleaseRefs: string[]; // suggestions, not automatically loaded
  humanExamples: string[]; machineDescription: string;
  ownerPolicyRef: string; ownerConformanceRef: string;
  deprecation?: {state:'ACTIVE'|'DEPRECATED'|'SUNSET'; replacementRef?:string};
}
```

A **CapabilityCard** is a projection. Provenance to the canonical source (source object ID, source revision/digest, projection compiler version and generated time) is mandatory in storage. Display text is bounded and sanitized. A Skill description, remote MCP server name or untrusted Agent Card cannot supply an authoritative `riskClass` or alter `effectClasses`; those fields originate from reviewed owner metadata.

### 3.2 Backend offer and availability

```ts
type Availability = 'READY'|'CONDITIONAL'|'OFFLINE'|'BLOCKED'|
                    'NOT_IMPLEMENTED'|'UNKNOWN';
interface CapabilityOfferViewV1 {
  canonicalCapabilityRef:string;
  backendOfferRef:string;             // server-created opaque reference
  adapterOwnerRef:string;
  providerType:'NATIVE'|'RUNNER_LOCAL'|'REMOTE_MCP'|'CLOUD_API'|'AGENT';
  availability:Availability;
  reasons:string[];                  // sanitized reason codes for client
  qualificationReceiptRef?:string;   // tests against exact backend revision
  cancellationMode?:'SUPPORTED'|'BEST_EFFORT'|'NOT_SUPPORTED';
  eligibilityScopeRef?:string;         // opaque, never a grant; actor+asset scoped
  compatibilityProfileRef?:string;     // approved codec/timebase/conditioning matrix
  eligibleInputKinds:string[];
  outputLimits?:{maxDurationSeconds?:number; maxPixels?:number;
                supportedFps?:string[]; actualBitDepth?:number[]};
  estimatedCostQuoteRef?:string;      // quote is not reservation
  observedAt:string; expiresAt:string;
  offerRevision?:string; // immutable backend qualification/version fence
}
```

The same function may have many offers; aggregate availability cannot be `READY` unless at least one **currently eligible** implementation is READY for this actor, asset, region, entitlement and input. The view must distinguish runtime offline, credential missing, hardware insufficient, model unsupported, privacy/region prohibited and owner-disabled; sensitive tenant details are disclosed only when authorized. A newly discovered ComfyUI node starts as **UNQUALIFIED**, not READY.

### 3.3 Search and visibility

```ts
interface CapabilitySearchRequestV1 {
  schemaVersion:'sah.capability.search.v1';
  query?:string; locale:string;
  categoryRefs?:string[]; requiredInputKinds?:string[];
  requestedOutputKinds?:string[];
  requestedEffects?:EffectClass[];
  contextRef?:string;               // server-validated context snapshot
  maxResults?:number; cursor?:string;
  includeUnavailable?:boolean;
}
interface CapabilitySearchResultV1 {
  catalogGeneration:string; projectionRevision:string;
  resultType:'COMPLETE'|'PARTIAL';
  cards:CapabilityCardV1[];
  visibleOfferSummaries:Array<{capabilityRef:string;
                                  availability:Availability;
                                  reasonCodes:string[]}>;
  nextCursor?:string;
  retrievalEvidenceRefs:string[];  // internal-only; public/agent projection emits []
  scopeEpochRef?:string; catalogSnapshotRef?:string; // opaque server values
}
```

Actor, tenant, grants, policy epoch and resource-level ACL are **derived from authenticated server context**; they are never trusted search body fields. `PARTIAL` means timeout/limited indexing or unavailable source, not that every unlisted capability is absent. A direct exact ID describe path may resolve a permitted function even if search ranking misses it. Forbidden catalog entries must not leak through title, count, suggested aliases, timing or error differences.

### 3.4 Intent resolution and bounded plan

```ts
type IntentMode = 'DISCOVER'|'ADVISE'|'PREVIEW'|'SINGLE_FUNCTION'|
                  'BOUNDED_ASSISTED'|'SAVED_WORKFLOW';
interface IntentCandidateV1 {
  schemaVersion:'sah.intent.candidate.v1';
  candidateId:string; originatingMessageRef:string;
  mode:IntentMode; interpretedGoal:string; locale:string;
  scope:{productRef?:string; projectRef?:string; targetAssetRefs:string[];
         targetEntityRefs:string[]; explicitUserConstraints:string[]};
  chosenSkillReleaseRefs:string[]; selectedCapabilityRefs:string[];
  orderedSteps:Array<{stepId:string; capabilityRef:string;
                       inputBindings:Record<string,unknown>;
                       dependsOnStepIds?:string[];
                       requiredEffectClasses?:EffectClass[];
                       produces:string[]; requiresUserReview:boolean;
                       optional:boolean;
                       requestedByUser?:boolean}>;
  proposalOnly:true;
  uncertainAssumptions:string[];
  competingOptions:Array<{capabilityRef:string; rationale:string}>;
  blockedReasons:string[];
  budgetQuoteRef?:string; externalEgressSummary?:string;
  proposalDigest:string; expiresAt:string;
}
```

The **LLM may create only a candidate**, not a trusted intent binding, ACL claim, quote or approval. Server-side compiler validates every `capabilityRef`, typed binding, permission, graph edge, ownership, resource context, contract revision and allowed effect. `SINGLE_FUNCTION` contains exactly one executable function; read-only metadata inspection necessary for argument validation is not an implicit extra billable function. Mandatory compute-heavy preprocessing, uploads, paid previews or derivative generation are NOT invisible validation and MUST be separately exposed as user-approved effects. A schema validator alone cannot prove that `selectedCapabilityRefs[0]` equals `orderedSteps[0].capabilityRef`, or that dependencies form an acyclic graph; the trusted semantic validator SHALL enforce both. `BOUNDED_ASSISTED` may have multiple reviewed stages but does not become a persistent Workflow or schedule automatically. Existing Spec 253 command envelope wins for domain writes.

### 3.5 Action binding and idempotency

Existing action-binding, approval and idempotency contracts are authoritative. This proposal's optional presentation token only refers to an **already server-minted action binding**. Before execution, the server checks actor, tenant, project, resource revision/digest, selected output scope, provider offer revision, policy/rights epoch, approval receipt, quote TTL and spend ceiling. A change to project, selected entity, approved Skill content or provider egress invalidates or re-preflights the plan. Client-supplied `proposalDigest` is not a signature and cannot bypass that check.

## 4. Skill-first retrieval and progressive disclosure

### 4.1 Two paths, not an obligatory Skill round trip

- **Goal/request path:** when the user asks "How do I preserve the actor while changing the background?", classify `ADVISE`; retrieve relevant **reviewed Skill metadata first**, then compatible functions and alternatives. Load the selected `SKILL.md` only when necessary to reason about a real method. Fetch linked references/scripts only if specifically needed and authorized.
- **Explicit function path:** when the user says "Extract the depth map from this clip only," match the explicit capability first. Optionally load an approved Depth Skill if configuration decisions materially benefit, but do not add generation, grading or publishing.
- **No applicable Skill:** fall back to trustworthy capability descriptions and ask one targeted question only when an unsafe ambiguity cannot be resolved. Report that no matching approved Skill was found; never invent Skill files or imply an untrusted marketplace Skill is approved.

### 4.2 Trust tiers

`FIRST_PARTY_REVIEWED`, `TENANT_REVIEWED`, `PERSONAL_REVIEWED`, `REMOTE_VERIFIED_BYTES_ONLY`, `UNREVIEWED`, `QUARANTINED`. Byte/digest verification is not editorial/security approval. Rank a lower-trust Skill only when policy permits; never automatically load remote arbitrary instructions to gain better recall. Content may be adversarial. The existing Spec 221/248 release/load/approval process is mandatory before activation; a catalog match is not a load grant.

### 4.3 Skill/Capability binding

An approved Skill release may declare **advisory** required and optional semantic capability IDs in SmartAIHub-owned internal metadata (not injected into MCP's reserved wire namespace). All capability bindings are validated against the registry, current permissions and contract versions at plan time; stale or missing functions are reported as gaps and alternate reviewed implementations may be suggested. The Skill body MUST NOT contain raw platform credentials or directly write SQL; invocation goes through the canonical gateway.

Suggested film Skill packs: `film-hybrid-scene-replacement`, `film-depth-compositing`, `film-protected-subject-editing`, `film-cinematic-relighting`, `film-frame-rate-conforming`, `film-color-match-and-hdr`, `film-hybrid-quality-review`. A Skill can teach multiple techniques; a function can be referenced by many Skills. Neither implies a forced workflow.

### 4.4 MCP Skills compatibility is delegated to Spec 248

For stable MCP `io.modelcontextprotocol/skills`, use Spec 248 R1.4 and the pinned upstream stable specification. MCP protocol 2026-07-28 or later uses `server/discover` capability negotiation; an advertising server also exposes Resources. Mandatory extension methods are `skills/list` and `skills/get`; files are fetched individually with `resources/read`; `resources/directory/read` is optional when `directoryRead` is actually advertised. Keep server identity paired with Skill URI and verify all file manifests/digests under Spec 248. The **internal** Capability Search/Intent APIs in this document are not MCP methods and MUST NOT be presented as standard `skills/*` wire calls. If an external client supports Tools but not the Skills extension, expose only approved Tools and an explicitly labeled compatibility route; never claim native Skills conformance.

### 4.5 Token and retrieval budget

Initial retrieval uses bounded metadata only: for example top 5–12 Skill summaries plus top 5–12 capability summaries, dynamically adjusted to prompt budget. Load at most a policy-configured number of full Skills on any one resolution attempt; use on-demand references and summarize evidence without erasing mandatory safety steps. De-duplicate synonymous Skill hits by immutable release ref, not display name. Retrieval fallback must not cross tenant/project bounds. Ranker explanations must show **why** a Skill was selected and whether required functions are available, without revealing hidden catalog entries.

## 5. Intent taxonomy and execution discipline

| User wording | Default interpreted mode | Permitted side effects without further expansion |
|---|---|---|
| "What can SmartAIHub do with this video?" | DISCOVER | Authorized metadata inspection to identify the file; no paid generation |
| "Which technique should I use?" | ADVISE | Compare reviewed Skills/methods; read-only preview only if permitted |
| "Show me a mask first" | PREVIEW / SINGLE_FUNCTION | Produce a mask preview; no video generation |
| "Extract Depth only" | SINGLE_FUNCTION | Exactly depth generation and necessary validation/storage |
| "Replace this background; approve mask before generating" | BOUNDED_ASSISTED | Preview/mask, pause for approval, then authorized remaining stages |
| "Save these steps as a reusable process" | SAVED_WORKFLOW | Produce proposal and persist only after explicit Workflow admission |
| "Do the same on the next 30 clips" | BOUNDED_ASSISTED or SAVED_WORKFLOW | Show batch plan, count, quote and review; no inferred recurring schedule |
| "How much would this cost?" | ADVISE | Quote only; no paid provider call |

### 5.1 Clarification/confirmation policy

Infer intent conservatively from conversation and fresh page context, but treat all page hints as non-authoritative. Explicitly confirmed project/resource beats inferred page context. A short ambiguous command such as "fix this" when multiple clips exist should show a compact target picker, never choose a cross-project object by guess. Distinguish `requires_clarification`, `requires_target_confirmation`, `requires_cost_approval`, `requires_egress_consent`, `requires_domain_approval`, `requires_publication_approval`; they are different reasons and not one generic "confirm" modal.

An explicit imperative to create a free local derivative may proceed under existing user policy when the target is unambiguous and no stronger approval is required. User requests for paid cloud generation, external upload, code installation, training on performer likeness and irreversible publishing MUST pass their own authority checks regardless of model confidence.

### 5.2 Skill-first does not mean autonomous work

For a complex goal, AI MAY recommend a short plan, but MUST mark each optional step and never run an optional stage unless the user or an existing approved policy explicitly selects it. If a Skill says "always finish by publishing," that cannot override a user instruction to generate only a depth pass. Task Control can resume one step, retry a failed step, inspect provider receipt or abandon a plan independently of any saved Workflow.

### 5.3 Fallback and provider substitution

A fallback is a **new eligible offer** for the same semantic capability, never an unreviewed change in method or external data exposure. If the requested local Runner is offline, the system may display a cloud alternative and adjusted privacy/cost but cannot silently upload a protected clip. If no backend can satisfy requested depth-conditioning fidelity or output frame rate, return `UNSUPPORTED_CONSTRAINT` and propose alternatives; do not silently relax the requirement.

## 6. Human Capability Explorer and shared Chat surfaces

### 6.1 Human Explorer

A single Search/Discover view SHALL offer natural-language Thai/English search and filters by product, input media, desired output, effect, availability and cost class. Each card SHALL show: plain-language purpose, examples, inputs/outputs, relevant reviewed Skills, **current scoped availability**, preview support, potential cost, local/cloud/egress indicator, permission/approval requirement and a direct "Use this function" or "Ask AI for help" action. `NOT_IMPLEMENTED` is not a clickable Run action. Hide unauthorized private catalog entries rather than merely graying them out.

An optional "Why suggested?" explanation may use sanitized retrieval evidence: selected clip kind, user query, matched Skill and available operation. Never expose sensitive hidden project names, private Skill text, provider secrets or other tenants' resources.

### 6.2 Shared Chat / Task Control

Use the same Feature 196 conversation and Specs 225/226 task cards across full/compact Chat, desktop/mobile/PWA and product surfaces. Chat may say what is possible without knowing a Project ID. Before acting on a media object, bind the current authorized project, target asset/shot/timeline revision and policy. Each returned artifact card includes action origin, output type, owner, cost estimate/actual as appropriate, inspect/compare/retry buttons and precise execution status derived from existing job/domain state.

The Capability Explorer must be a **discovery interface**, not a separate universal assistant. A contextual catalog drawer in Film Studio can prefilter relevant functions; the same functions remain reachable from general Chat when Film Studio is closed.

### 6.3 Agent projection

External Agent discovery SHALL provide bounded machine-readable summaries of only currently entitled capabilities, with input/output schema refs, canonical capability IDs, effect/risk classes, version, preview/cancellation semantics, offer constraints and a pointer to separately retrieved approved Skill releases. Reuse existing Spec 199 MCP Tools and Spec 248 Skills distribution under authenticated connection grants. An A2A Agent Card or tool listing may advertise the permitted high-level capability but is not an action authorization. For an Agent asking "what can I do here?", catalog generation and partial/complete status must be explicit, with pagination and rate limits. Agent-side display names are not canonical identifiers.

### 6.4 Mini App scope

Mini Apps and per-product embedded Chat can discover only approved capabilities explicitly delegated to that app and to the authenticated user's project/resource. An embedded Chat may answer from the Mini App's own authorized documents and outputs, but may not escalate by suggesting or invoking an otherwise privileged function. If the user wants a wider SmartAIHub task, offer a clearly marked handoff to the universal Chat and require a fresh authorization context; do not silently merge scopes.

## 7. Function onboarding and conformance

### 7.1 One onboarding path

1. Domain owner identifies semantic operation and checks whether a canonical ID already exists.
2. Register or extend its canonical capability with typed input/output, side effects, risk, preview and cancellation semantics.
3. Register an approved implementation adapter and independent qualification fixtures for a specified backend version, region, runtime and entitlement.
4. Attach relevant reviewed Skill releases with advisory compatibility requirements.
5. Generate sanitized metadata projection, Thai/English labels and search synonyms.
6. Verify both direct function invocation and Skill-assisted use against the **same** canonical owner API.
7. Publish visible catalog entry under default-deny ACL and tenant-scoped feature flag.
8. Run deterministic replay fixtures, negative authorization and revocation tests before promotion.

### 7.2 Canonical semantic IDs and aliases

IDs like `film.depth.extract` below are **proposed human-readable logical labels**. Before implementation, map each to exact existing registry IDs and ProductActionManifest semanticActionId values. If an existing function matches output semantics, add an alias rather than creating a competing implementation. Aliases are read-only search terms and cannot silently change the invoked target when pinned by a Workflow or action binding. Reject alias loops, ambiguous aliases and cross-tenant shadowing. Each released contract version requires migration/compatibility fixtures; major incompatible changes create a versioned canonical ID or documented migration.

### 7.3 Qualification and health

A backend offer becomes READY only after current connector/credential, scope, hardware/resource profile and contract-level conformance checks pass. Qualification evaluates *actual* output media, schema, fps/timebase, maximum duration/resolution, conditioning support, output bit depth when relevant and error/cancel/receipt behavior. Provider marketing claims do not constitute a signed qualification. For Runner-local operations, the Runner is the machine-local supervisor; Node/ComfyUI discovery must not register tools directly to the Core or trigger software installation without reviewed development flow.

### 7.4 Results and provenance

Every produced artifact SHALL reference source asset/shot/timeline revision, operation ID and contract version, exact backend/model/node pack revision, relevant Skill release/digest (if loaded), parameter manifest, job/attempt receipt, cost record where applicable, and authoritative policy/rights evidence. No model-created output can claim to be genuine camera RAW; mark generative SDR-to-HDR reconstructions, synthetic highlights and resampled bit depth honestly. Use Spec 255 semantic source/reuse refs only as optional read-only enrichment when enabled.

## 8. AI Hybrid Film Studio function profile

The following is the **target function coverage**, not a statement that each item has been implemented or that each provider supports it. Implement Film-specific adapters under Specs 252/254 and publish their permitted capabilities through Spec 256. When a capability already exists in Media Studio, Video Editor or a shared media SDK, **reuse that implementation** and add Film binding only.

| Logical capability ID | Inputs | Outputs | Minimum P0/P1 | Technical constraints / owner |
|---|---|---|---|---|
| `film.media.inspect` | video/asset ref | fps/timebase, codec, bit depth, color, duration, audio metadata | P0 | Metadata-only; distinguish source vs delivery container |
| `film.media.extract_frames` | asset + frame/PTS selection | indexed still frames | P0 | Preserve source PTS and color conversion details |
| `film.shot.detect` | video | suggested shot boundaries | P1 | Suggestions only; do not replace editor cuts |
| `film.mask.generate` | media + target person/object | alpha sequence + quality report | P0 | Fail safely on ambiguous subject; consent/rights |
| `film.mask.refine` | alpha + manual hints | derivative refined mask | P1 | Preserve revisions and protected original pixels |
| `film.depth.extract` | clip/image + quality | depth sequence + scale/temporal metadata | P0 | Relative vs metric distinction; Temporal QA |
| `film.normal.estimate` | clip/image | normal pass + coordinate convention | P1 | Normals estimated, not guaranteed physically correct |
| `film.motion.optical_flow` | clip + sampling | flow artifact + occlusion/confidence | P1 | Avoid pretending low confidence is valid motion |
| `film.camera.track` | clip + lens/rig hints | camera path + uncertainty | P1 | Fail when insufficient parallax; respects source camera |
| `film.actor.protect` | selected actor + source frames | protected subject mask + preservation plan | P0 | Never rewrite protected pixels without explicit instruction |
| `film.identity.compare` | permitted performer refs + candidate | identity-drift report | P1 | Restricted references; evaluation not biometric authority |
| `film.scene.plan` | footage + target description | candidate edit plan | P0 | Advisory; Spec 252 owns scene/shot revisions |
| `film.scene.replace` | source + mask + refs | candidate generated background/take | P1 (P0 optional if certified offer exists) | Provider capability qualification and prior cost/egress consent |
| `film.video.edit` | source + exact targeted edits | candidate edited take | P1 (P0 optional if certified offer exists) | Never overwrite original; fail on unsupported constraints |
| `film.video.extend` | source + anchor + desired length | candidate extension | P1 | Source frame/PTS continuity and entitlement |
| `film.relight.preview` | source + mask/normal/depth + light intent | relight candidate | P1 | Distinguish artistic relighting from physical reconstruction |
| `film.color.match` | two assets + target look | derivative grade/LUT or transform manifest | P0 | Protect brand/product/skin colors; color managed |
| `film.hdr.reconstruct` | SDR asset + target working space | **synthetically inferred** HDR derivative | P1 | Label inferred detail; never market as restored RAW |
| `film.fps.convert` | source + output FPS + method | conform/interpolated derivative | P0 | `speed_conform` changes duration; interpolation preserves time, may artifact |
| `film.composite.preview` | passes + source + background | bounded-resolution composite | P0 | Explicit blend-space, alpha convention and timebase |
| `film.composite.render` | approved layers + render settings | candidate composite | P1 | Existing Editor/render authority; no second renderer |
| `film.color.grade` | clip + grade intent | candidate color-managed derivative | P1 | Requires human review for product claims |
| `film.temporal.check` | video/passes | flicker, jitter and consistency evidence | P0 | Confidence + image/time-range evidence, not single opaque score |
| `film.qc.frame_alignment` | source/candidate PTS | alignment and slip-frame report | P0 | Compare content, not just matching nominal fps |
| `film.qc.identity_brand` | authorized brand/performer refs + candidate | protected-asset deviations | P1 | Controlled sensitive references; false positive review |
| `film.export.validate` | target spec + candidate master | codec/fps/color/audio QC report | P0 | Review delivery format; no implicit publish |
| `film.artifact.compare` | two versioned refs | side-by-side/split view + diff evidence | P0 | Original remains immutable |
| `film.recipe.capture` | user-selected steps | **candidate** saved recipe | P1 | Does not create workflow until Spec 215 admission |
| `film.batch.propose` | multi-clip selection + bounded intent | previewed batch plan + quote | P1 | No automatic schedule; each action policy-checked |

**P0 minimum usable Film slice:** independently callable inspect, frame extraction, mask/depth, preview/compare and output artifact; independent FPS convert and export validation; optional generative scene replacement/editing only after a policy-qualified provider is available. P0 acceptance must pass on fixture/native paths without a paid external video provider. Each operation must be callable separately. P0 readiness is per installed backend and not contingent on owning an RTX 5090 or any other particular GPU.

### 8.1 Film technique guardrails

- Shooting FPS is an acquisition decision, not a generator guarantee. Keep rational timebase (`num/den`), source PTS and audio sync. Do not hard-code "24 fps is 95% aligned" without controlled measurement. Use 24→25 speed conform or duration-preserving interpolation explicitly; test 50 Hz LED/shutter interactions on the real shoot.
- A depth pass aids spatial relationships but does not guarantee performer identity, camera path or every-frame continuity. Relative-depth outputs are not metric 3D measurements unless separately calibrated.
- A normal pass can support relighting; realistic relight may also require albedo, roughness, specular, shadows and scene geometry. Missing passes are disclosed rather than silently fabricated as physically accurate.
- An 8-bit AI video transcoded to 10-/12-bit does **not** regain true captured detail; learned HDR reconstruction is synthetic. Keep original RAW/Log sources and color transform/version references where available.
- Use non-destructive protected-subject compositing as the preferred option when likeness, brand colors, logos and product details must not change. No universal promise that generative Video-to-Video preserves exact pixels.
- Optional local ComfyUI integration goes through the **registered Runner**; its `object_info`/queue/history/socket APIs are adapter details and not direct permissions. Backend adapters must verify actual installed nodes and media contracts.

## 9. Example Skill: film-hybrid-scene-replacement

The pack accompanying this spec contains a standalone example Skill. Its core rules:

```markdown
---
name: film-hybrid-scene-replacement
description: Plan or perform selective live-action background changes while preserving designated actors, products and original performance.
---

1. Determine whether the request is DISCOVER, ADVISE, PREVIEW,
   SINGLE_FUNCTION, BOUNDED_ASSISTED or SAVED_WORKFLOW.
2. Confirm target asset/project and define what must remain unchanged.
3. Inspect media metadata with the existing read capability.
4. Prefer reviewed mask/protected-original-pixel methods for protected assets.
5. Select only currently available, entitled operations; distinguish
   actual depth-conditioning from using a depth pass for compositing.
6. Estimate cost/egress and obtain existing approvals before paid generation.
7. For a request to inspect only: do not generate anything.
   For "mask first": produce a mask and stop for review.
8. Keep source immutable; persist candidate outputs with verified provenance.
9. Check timebase, identity, temporal consistency, brand accuracy and export.
```

The Skill file MUST NOT hard-code a single video provider or emit direct credentials; its internal metadata maps to semantic capability requirements while Spec 221 retains release authority. A Skill update changes its content digest; recheck relevant approval and plan bindings.

## 10. Data, tenancy, policy and safety

### 10.1 Database and search

PostgreSQL remains source of record for existing users, ACL, Skill release refs, policy, credits, jobs and required owner metadata. The **projection index** can use current Cloudflare Vectorize as a tenant-safe semantic index, with minimal metadata/pointers; store private full Skill files/artifacts in authorized R2 namespaces and retrieve through the existing broker. Current cache (e.g. KV) is only disposable acceleration: cache key must bind tenant, actor/access scope class, policy epoch, catalog generation, locale and visibility; omit cross-tenant shared private entries. DDL may be proposed only after inventory and owner-approved expand/contract migration.

### 10.2 Trust boundaries

1. Search text, OCR/captions, Skill instructions, metadata from remote MCP, ComfyUI node descriptions, provider responses and Agent Cards are untrusted data.
2. User intent parsing and LLM plans cannot grant rights, add a credential, widen project access, override protected masks or mark approval as given.
3. Every tool invocation checks the exact actor/tenant/project, resource revision, execution offer, necessary rights/consent, model/provider eligibility, cost ceiling and country/region egress constraints.
4. Preview cards can be regenerated, but paid or irreversible provider retries require existing idempotency and unknown-outcome reconciliation.
5. Unknown document injection attempts must not become system instructions. An unreviewed Skill may be described or quarantined according to policy but not silently activated.
6. A connector failure must preserve submitted and approved artifacts, expose partial status honestly and not substitute a forbidden provider.
7. Third-party executable code or model pack installation is a separately reviewed development/change-control operation, not a user media-editing side effect.

### 10.3 Revocation and lifecycle

Skill release revocation, digest change, provider loss, actor offboarding, rights expiry, budget change or ACL/policy epoch increments invalidate stale plans and cached entitled offers. Preserve historical trace/provenance, but deny new reads or execution when current rights are revoked. In-flight jobs follow the existing fencing/reconciliation/release policy; past creation receipts do not authorize a future export or training use.

### 10.4 Explainability receipts

For each selection store a privacy-reduced selection receipt with: input text reference (not necessarily full text duplication), selected Skill release/digest, candidate capability IDs, visible backend offer revisions, rejected alternative **reason codes**, output contract, plan digest, approvals, current job/attempt refs and eventual result refs. Do not store hidden chain-of-thought. Provide user-facing concise reasoning based on inspectable action evidence, not a fabricated internal reasoning transcript.

## 11. Failure handling and determinism

| Failure | Required behavior |
|---|---|
| Catalog index stale | Re-check source registry and policy; label stale/partial; exact describe fallback |
| No approved Skill | Show direct capability guidance; do not imply Skill exists |
| Skill manifest invalid/digest changed | Block load; Spec 248 refresh/verify; invalidate content-bound approvals |
| Multiple likely target projects | Show authorized choice; no write until resolved |
| Local Runner disconnected | Show OFFLINE and alternate opt-in options; do not silently cloud-upload |
| Provider model lacks native depth control | Return unsupported constraint or use compositing with explicit technique change |
| Upstream paid attempt times out | Reconcile unknown outcome via existing receipt owner; no blind resubmit |
| Same action retried twice | Existing idempotency key/fencing prevents duplicate work/charges |
| Approved actor consent revoked | Block further derivative generation, reuse or publish as required by policy |
| Wrong media clock/color metadata | Fail preflight or produce explicit review-required transform, never silent conform |
| A2A/MCP Agent asks beyond delegated scope | Deny at canonical policy layer; do not leak hidden catalog items |
| Search finds similarly named capabilities | Use canonical IDs, owner and typed schema; ask for disambiguation when material |
| User changes source while a plan is pending | Expire plan, show revision diff and requote/reapprove as needed |
| Semantically similar reusable clip from another tenant | Not eligible; Spec 255 candidates never override rights or tenant isolation |

## 12. Cross-spec integration contracts

### 12.1 Feature 196 + Specs 225/226: shared intent

Attach an **optional, typed** `CapabilityIntentProjectionV1` and catalog/search receipts to the current conversation/goal and existing task cards. Its creator is an additive resolver adapter; no new `/film/chat`, duplicate thread IDs or separate global Task Control. An explicit target binds to `UniversalCommandContextV1` from Spec 253. Reuse current event and notification streams. Old clients ignore the optional projection and retain their original behavior when feature flag OFF.

### 12.2 Spec 253: products remain authoritative

When the selected operation changes domain state, resolve its `semanticActionId` against the product's existing `ProductActionManifestV1`; require `readCapability`, `authorizeTarget`, `preview`, `apply`, `queryState` or explicit `UNSUPPORTED` as appropriate. Construct the existing `ProductCommandEnvelopeV1` with server-minted action binding, exact resource and expected revision. A generated function card cannot directly patch Film, Editor or Creator tables. A cross-product result uses existing `MediaHandoffBundle`, not an ad-hoc file-sharing shortcut.

### 12.3 Specs 252/254: Film integration

Spec 252 remains canonical for Scene/Shot/Performance/Camera/Take truth. Spec 254 remains canonical for Film workload profiles, conditioning negotiation and results from qualified external execution. This spec publishes a Film capability profile, attaches relevant Skill suggestions and defines how a **single user-requested function** is chosen. It does not decide remote-GPU placement, infer native provider support or overwrite a Film take. A Film `preview` may use an approved lightweight qualified backend if it satisfies the user's constraints; the user still explicitly controls full paid generation.

### 12.4 Spec 255: semantic media is optional

Where semantic-media feature flag is ON, capability cards and artifacts MAY carry immutable semantic node/anchor refs. Spec 255's technical reuse advice is read-only; Spec 215 calculates actual DAG invalidation and rights/policy gates still apply. With flag OFF, feature 256 works on ordinary Library AssetRefs and the original Film/Editor domain revisions without degraded function availability beyond semantic-only affordances.

### 12.5 Specs 199/248/200/206: external agents

Use existing `/v1/mcp` for MCP Tools and separately negotiated Skills extension under Spec 248. Share only entitlement-filtered discovery cards and approved Skill releases; an Agent may use `capability.search/describe` through the **existing approved gateway API mapping**, not a new unreviewed public method. Use Spec 200 native-adapter or Spec 206 A2A-first execution when that execution type is warranted; Spec 239 governs personal Agent connection profile. Outbound remote tool descriptions/Agent Cards cannot mint trusted capability IDs or grants merely by claiming identical names.

### 12.6 Specs 215 / 186 / 207: optional Workflow, physical jobs and money

`SAVED_WORKFLOW` is an explicit opt-in: compile under existing Spec 215 using current node types (including frozen Spec 214 node constraints), not a new Skill runner DAG. Single function with asynchronous execution still uses canonical physical jobs for admission, progress, retry and cancellation. Existing Spec 207 quote/reservation/settlement handles credit charges; invocation metadata never substitutes a ledger record. A quote change invalidates preapproval as required by existing rules.

### 12.7 Skill creation and development loop

Spec 244 may propose better Skill variants, but only reviewed Spec 221 release gates expose them for production use. Spec 224 alone owns actual platform-code changes through its active Development Runtime; this spec can create a typed development goal as a user-authorized handoff, not directly install a new backend in a production chat session. Do not alter Spec 224 implementation or force its code path into normal media tasks.

## 13. Security and conformance test matrix

Each case needs an automated fixture with expected catalog response, chosen intent mode, permitted effect set, approval requirement and absence of forbidden side effects. Core fixtures should be tested with at least Thai and English intent paraphrases, and with a second tenant in every security suite.

| ID | Scenario | Expected result |
|---|---|---|
| C256-01 | Query "What can you do with this video?" | DISCOVER; no paid job; scoped applicable cards |
| C256-02 | Query "สร้าง Depth เท่านั้น" | SINGLE_FUNCTION; one depth output; no scene/video generation |
| C256-03 | "ขอดู Mask ก่อนสร้างวิดีโอ" | Mask preview; explicit pause before paid generation |
| C256-04 | "Save this procedure" | SAVED_WORKFLOW proposal; no persistence before admission |
| C256-05 | No current page, mobile Chat | Authorized Film capabilities searchable without Project ID |
| C256-06 | Page hint project differs from explicit target | Explicit authorized target wins; cross-project write reauthorized |
| C256-07 | Two plausible files | No mutation until target choice |
| C256-08 | Single function offline, fallback cloud allowed | Cloud option visible with changed quote/egress; no silent upload |
| C256-09 | No implementation exists | NOT_IMPLEMENTED is not shown as executable |
| C256-10 | Local ComfyUI node discovered but unreviewed | UNQUALIFIED; cannot become READY by discovery alone |
| C256-11 | Remote Skill URI same on different servers | No identity/digest/approval collision |
| C256-12 | Skill `resources/read` without activation | Reads only authorized content; no implicit activation/invocation |
| C256-13 | Remote Skill prompt injection asks for keys | No credentials or privileged tool dispatch |
| C256-14 | Invalid Skill manifest digest | Load blocked; refresh/quarantine flow |
| C256-15 | Skill changed after approval | Content-bound grant/plan invalidated |
| C256-16 | Agent supports MCP Tools but not Skills extension | Correct labeled compatibility; no false conformance |
| C256-17 | `skills/list` partial pagination | PARTIAL; no false absence or grant escalation |
| C256-18 | Authorized Skill but forbidden capability | Skill may be described; invocation denied |
| C256-19 | Capability search cross-tenant | No private title, count, alias, URI or timing disclosure |
| C256-20 | Mini App requests global capability | Denied in app scope; explicit universal handoff only |
| C256-21 | Revoked actor rights after preview | Generation/reuse/export rechecked and blocked per policy |
| C256-22 | Provider offer expires before execution | Re-resolve, requote/reapprove; no stale dispatch |
| C256-23 | Unknown paid upstream outcome + retry | Reconcile; no blind second paid attempt or double settlement |
| C256-24 | User cancels after provider accepted request | Show best-effort status/actual cost; no fake cancellation guarantee |
| C256-25 | Semantic aliases collide | Owner-qualified disambiguation; no wrong function invocation |
| C256-26 | Existing registry already has same operation | Alias/adapter to existing ID; no duplicate authority |
| C256-27 | Legacy app with flag OFF | Same source APIs/behavior as pre-feature baseline |
| C256-28 | Mask changes while queued generation awaits approval | Input digest mismatch invalidates old plan |
| C256-29 | Camera RAW vs generated HDR derivative | Accurate provenance; no false RAW claim |
| C256-30 | 24→25 speed conform vs interpolation | Different duration/timebase/output contracts and sync checks |
| C256-31 | Frame rate nominal matches but action drifts | Content/PTS QC flags mismatch |
| C256-32 | Depth-relative data treated as metric by consumer | Reject or require calibrated adapter |
| C256-33 | Backend depth control absent | No unverified native conditioning; offer disclosed compositing alternative |
| C256-34 | Spec 252 protected performer + Film scene replacement | New candidate only; protected original/locks respected |
| C256-35 | Spec 253 Film-to-Editor handoff | Current target revision, bounded import and provenance preserved |
| C256-36 | Spec 255 semantic flags OFF | Direct function path works without SMG dependency |
| C256-37 | Indexed catalog stale and inaccessible backend | Revalidate READY claim against authority; label partial/offline |
| C256-38 | Paid quote changes between preview and apply | Old quote approval invalidated; fresh disclosure required |
| C256-39 | Token budget exhausted mid-Skill | Stop with explicit partial context; do not pretend full skill was loaded |
| C256-40 | Skill names identical across releases | Select by immutable release/source; names remain presentation labels |
| C256-41 | User asks only price | Quote without billable generation and without scheduling |
| C256-42 | Multiple embedded devices / concurrent sessions | Stale page hint cannot overwrite active confirmed target |
| C256-43 | Tool output fabricates `approvalRefs` | Server ignores/rejects fabricated approval |
| C256-44 | Manual Editor locked range + agent suggestion | Preview only; locked content not altered |
| C256-45 | Catalog-generation cache invalidation | Revoked items cease to be discoverable by entitled-but-stale caches |
| C256-46 | Job result callback after lease fencing | Current authority rejects stale completion; no duplicate artifact admission |
| C256-47 | External MCP Tool description tries to override local policy | Registry owner policy remains authoritative |
| C256-48 | Skill-first search misses exact explicit function | Exact authorized ID describe/direct invoke still succeeds |

### 13.1 Performance and quality SLOs (targets, not measurements)

- Measure separate p50/p95 latencies for metadata search, Skill load, offer qualification and action preflight; do not hide expensive provider generation behind a catalog latency score.
- Suggested canary objective: p95 scoped cached catalog search **under 1.5 seconds** and p95 single-function preflight **under 3 seconds** under agreed dataset/load. These are **proposed targets**, not observed performance or release blockers until jointly baselined.
- Maintain a versioned Thai/English gold set with explicit direct-function, advice-only, approval-staged, ambiguous-target and forbidden-scope examples. Require **zero unapproved side-effect actions** across the critical security suite; evaluate retrieval top-k and correct mode independently of overall LLM eloquence.
- For Film output QA, report temporal/fps/color/identity/brand dimensions independently with evidence; never collapse a protected-likeness failure into a passing average quality score.

## 14. Implementation slices and promotion gates

### G0. Mandatory repository and deployment inventory — no mutations

- Check canonical SmartSpecPro feature-spec registry, current main, pending PRs, active worktrees and owner decisions for number `256` and adjacent proposals (252–255). If occupied, renumber only this new spec and update internal references before merge.
- Inspect actual Feature 196 Registry/Resolver, Skill Registry 221, Retrieval Broker 229, universal Chat/task cards 225/226, ProductActionManifest Spec 253, current `/v1/mcp` and SEP-2640 Spec 248 code/schema versions.
- Inventory actual deployed PostgreSQL tables/migrations, Redis/KV/Vectorize read paths, Runner/ComfyUI adapter, approval/credit/worker_jobs authority and data-classification rules. **Do not assume the saved spec's proposed wire names are deployed APIs.**
- Produce a conflict map: reuse existing field/API; extend optional contract; or create a new additive projection only if no matching owner exists. No DDL, live deploy or new execution permission during G0.

### G1. Contract-only and read-only projections

Add types/schema adapters and validators to the actual owning packages; create deterministic fixtures for `CapabilityCardV1`, `CapabilityOfferViewV1`, `CapabilitySearchRequestV1` and `IntentCandidateV1`. Derive a read-only catalog from **existing** function/ProductAction/Skill metadata. Schema unknown-required-fields fail safely at version boundaries; optional unknown fields round-trip for forward compatibility where safe. Build/rebuild a disposable index; test current ACL filtering and projection generation fencing. Acceptance: C256-09, 19, 25–27, 37, 45.

### G2. Human discoverability + one direct function

Ship catalog drawer and a direct `film.media.inspect`/`film.depth.extract` path on synthetic/permitted fixture media, behind independent feature flags. Use existing job and artifact owner. Verify phone/tablet/general Chat can discover the same function without opening Film. No cross-product mutation. Acceptance: C256-01, 02, 05, 06, 30–32, 36, 48.

### G3. Reviewed Skill-first resolver

Index only approved Skill metadata through Spec 221/229; implement constrained mode classification, on-demand Skill load, capability binding, explainability and direct-function bypass. Include Thai/English golden intents and untrusted-content attacks. Acceptance: C256-03, 04, 11–18, 39–41.

### G4. Film Hybrid capability adapter kit

Implement the revised P0 Film function profile using **existing** media/Film/Editor/Runner provider paths wherever possible. Start with inspect, mask/depth, artifact compare, fps convert, color match, basic QC and a non-destructive compositing preview. Add optional qualified scene replacement only with explicit provider rights/cost/egress admission. A depth pass is useful independently even when no video provider accepts depth as native conditioning. Acceptance: C256-08, 10, 28–35.

### G5. Agent and Mini App exposure

Map filtered cards to existing Spec 199 MCP Tool descriptions, distinct Spec 248 Skill listing, Spec 200/206 agent profiles and restricted Mini App context. Verify protocol negotiation and an explicitly labeled fallback for clients without the extension. No new public wire method until owner-approved API review. Acceptance: C256-16–20, 43, 47.

### G6. Optional assisted multi-step + Workflow handoff

Introduce preview/execute-one-step/continue patterns in Task Control with current action bindings; persist a Workflow only via an explicit user request and current Spec 215 compiler. Use existing Spec 207 quote/approval and Feature 195 job retry/recovery. Acceptance: C256-03, 04, 21–24, 38, 44, 46.

### G7. Two-tenant canary, documentation and rollback

Canary with two explicitly consented beta users/projects and at least one unentitled negative-control principal. Verify no cross-tenant catalog/output leakage, zero unapproved paid egress, no duplicate settlement, correct no-page phone path and unchanged legacy behavior with flags OFF. Compare same Film operation through direct UI, Chat, Mini App and approved agent. Rollback disables only this experience's flags/projection and optional adapter bindings; does not roll back original Film assets or mutate original 252/253/254/255 contracts. Production activation needs actual owner review and security sign-off; completed tests alone are not authorization to deploy.

## 15. Delivery checklist and acceptance definition

- [ ] Canonical registry collision check and actual schema/owner fit signed off.
- [ ] No duplicate Skill Registry, global Capability Registry, Chat, DAG, worker_jobs, Approval, Ledger or Film domain truth.
- [ ] Human and machine catalogs derive from the same canonical metadata with independent scoped filtering.
- [ ] Direct single-function invocation, Skill-assisted use and optional Workflow reuse the same execution/policy authority.
- [ ] Typed schemas, alias/version migration, stale-offer tests and explicit UNKNOWN/UNSUPPORTED semantics pass.
- [ ] Real permission/approval/revocation/billing/fencing boundaries tested with two tenants.
- [ ] Explicit function request never triggers unrelated stages; question never triggers billable work.
- [ ] Skill provenance, full content verification, origin-bound URI and content-bound approvals delegate to Spec 248/221.
- [ ] Agent discovery does not advertise native Skills conformance unless real client/server version is qualified.
- [ ] Film protected actor, depth/normal limits, timebase, bit-depth provenance and independent media operation tests pass.
- [ ] All P0 APIs/UX have mobile/tablet capability and no page-open prerequisite.
- [ ] Feature flags default OFF, canary is reversible, historical artifacts and receipts remain intact.

## 16. Source documents and technical references

Internal design inputs (saved document snapshots, 2026-09-27; verify against canonical repository at G0):

- Spec 248 R1.4: MCP Skills Extension governance and transport.
- Spec 253 R1.3: universal product command, ProductActionManifestV1, context and MediaHandoffBundle.
- Spec 254 R1.3: Film-specific external execution profiles and owner boundaries.
- Spec 255 R1.0: cross-product semantic media graph, change sets and reuse candidates.
- Existing Feature 196/197, Specs 199/200/206/215/221/225/226/229 and the current Runner/Media Gateway must be inventoried before code work.

External normative reference for transport (verified 2026-09-28):

- MCP Skills Extension, stable specification: https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx
- Model Context Protocol Discovery, revision 2026-07-28: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/discover.mdx

**Precedence:** deployed canonical owner contracts and actual pinned normative MCP schemas take precedence over illustrative types in this proposal. Any change required to an immutable or in-progress spec becomes a new additive compatibility contract or implementation backlog item, not a retroactive edit.

---

## 17. R1.1 hardening: authoritative interpretation, ownership and release scope

This section is normative for the R1.1 proposal. It addresses the 14 audit passes documented in `AUDIT-14-PASSES-R1.1.md`. These are document/contract-review findings; no live application behavior or production MCP conformance is certified by this audit.

### 17.1 One resolution path and no duplicate ownership

The existing Feature 196 Capability Registry and resolver remain the canonical semantic-operation registry, invocation and goal authority. Spec 221 remains Skill release truth; Spec 229 remains authorized retrieval; Spec 248 remains MCP Skills transport; Spec 253 remains product-command and cross-product handoff truth; Spec 254 remains Film execution profiles; Spec 255 remains semantic-media projection. Spec 256 owns *only* a read-derived presentation/discovery contract, Skill-first candidate-selection rules, bounded intent-mode evaluation and their conformance fixtures. It MAY propose optional owner fields and UI adapters. It MUST NOT introduce an independently writable `capability_registry`, `skills_registry`, `intent_jobs`, `film_job` or shadow approval store.

G0 SHALL produce a machine-readable owner-fit report containing actual repository package names, schema revisions, canonical owner identifiers, existing API endpoints, adapter ownership, migration needed, number reservation, registry/branch/worktree conflicts and the owner-signed decision per proposed field (`REUSE`, `OPTIONAL_EXTENSION`, `NEW_DERIVED_VIEW` or `REJECT`). Every illustrated `example:` ID and `/schemas/proposed/` URI in this pack is a fixture, never a live integration target. If the current registry already supports aliases/capability cards, implement mapping rather than another table. Any unavailable live evidence remains `UNVERIFIED` and blocks production promotion, not drafting.

### 17.2 Release scope is honest and function-level

`P0_REQUIRED` means the function can be invoked and independently verified on a fixture-supported native or otherwise authorized backend; `P0_OPTIONAL_QUALIFIED` means a listed function is exposed only if its actual backend passes qualification and all egress/spend gates; `P1` means design-targeted but not a P0 ship gate. A listed logical capability with no verified adapter MUST remain `NOT_IMPLEMENTED`; catalog listing does not imply readiness. In §8, `film.scene.replace` and `film.video.edit` are **P1, with optional P0 qualified offers**, while Film inspect, mask or depth, artifact comparison, technical preview, FPS conversion and basic QC form the provider-independent minimum. No production task installs or downloads unreviewed ComfyUI nodes to satisfy a P0 target.

### 17.3 Compatibly extending descriptor revisions

`CapabilityCardV1` additions are optional presentation fields in the V1 logical contract (`cancellationMode`, `previewCostClass`, `executionSafetyProfileRef`), never inferred from legacy `supportsCancellation`. The canonical execution adapter is authoritative for exact cancellation semantics and operation effects. Existing callers may ignore additions; legacy boolean `supportsCancellation=true` alone MUST NOT promise upstream cancellation or a refund. `DRAFT` risk does not imply zero cost: cost/egress and effect classes are evaluated independently, at both capability and actual-offer levels.

## 18. Atomic-function effect budgets and preflight admission

### 18.1 Function = one declared operation, not all hidden prerequisites

An owner-reviewed function definition SHALL specify its full input and output schemas; quality/timebase constraints; authorized *observable effects*; mandatory prerequisites; and maximum implicit actions. Implicitly allowed prerequisites are read-only metadata lookups, type/ACL checks and bounded local parameter inspection explicitly classified as `VALIDATION_READ`. Extracting frames at scale, uploading media, GPU inference, writing a derivative, billing a provider and triggering downstream stages are real effects, **not** `VALIDATION_READ`, even if a provider SDK hides them. A single-function request authorizes exactly the one selected semantic operation plus its disclosed and admitted implementation-internal effects; it does not authorize other independent semantic operations.

```ts
type EffectBudgetV1 = {
  allowedEffectClasses: Array<'READ_ONLY'|'CREATE_DERIVATIVE'|'MUTATE_DOMAIN'|
    'EXTERNAL_EGRESS'|'RUN_UNTRUSTED_CODE'|'RELEASE'>;
  admittedCapabilityRefs: string[]; // server-generated from request, not model claims
  allowedInputRefs: string[]; allowedOutputKinds: string[];
  approvedExternalDestinations: string[]; approvedRegionRefs: string[];
  maxSpendMinor?: number; currency?: string;
  maxResultAssets?: number; ttlSeconds: number;
};
```

The budget is a logical subset of the existing server-issued action binding/approval. Do not make it a bearer token or new billing authority. Every adapter shall report its potential effects, including output retention and cross-device transfer, **before** offer selection. If an adapter cannot state these reliably it remains `CONDITIONAL` or `BLOCKED`; it cannot quietly expand a `SINGLE_FUNCTION` to a full pipeline. An internal dependency on another **billable independent function** requires a newly visible user-approved step; otherwise return `PREREQUISITE_APPROVAL_REQUIRED` or choose a different authorized offer.

### 18.2 Trusted server preflight phases

1. **DISCOVER:** projectless public or actor-visible metadata; search cannot create paid jobs.
2. **TARGET_RESOLVE:** bind exact authorized tenant/project/resource/immutable base revision; page selection is a hint, never entitlement.
3. **SEMANTIC_VALIDATE:** recompute mode and permitted effects server-side, validate canonical capability refs/versions and input bindings; validate graph even if JSON Schema passes.
4. **OFFER_QUALIFY:** fresh actor+asset+region eligibility against actual backend/runner, model features, licenses, data classification, destination and credential scope. An offer's `READY` is not a reusable admission ticket.
5. **QUOTE_AND_CONSENT:** derive conditional total and per-stage cost from Spec 207, disclose external destinations, retention and expected paid-preview charge, obtain each existing required approval.
6. **ADMIT_AND_BIND:** use existing Feature 196/Spec 253 action binding and existing job owner. Bind operation and stage count, source/digest, tool/Skill release digest, offer revision, policy/rights epoch, spend cap, approval and expiry.
7. **DISPATCH:** current execution owner rechecks freshness, effects and idempotency immediately before work. UNKNOWN remote paid attempts use existing receipt reconciliation, never blind retry.
8. **RESULT_VERIFY:** validate typed output, provenance, approved effects, current right to read/reuse and job receipt; use existing Library/R2 and Task Control.

A read-only `ADVISE` response MAY present a *non-binding indicative estimate*. A quote is not a reservation or promise of price; if it changes materially or expires, re-disclose and reapprove before dispatch. Paid previews are not an exception. If no permissible path exists, return an explicit reason and the least-invasive alternative; do not run a different operation to make the demo appear successful.

### 18.3 Revocation, cancellation and retries

An effect is not reversed simply because a UI says `Cancel`. Use owner truth for `SUPPORTED` / `BEST_EFFORT` / `NOT_SUPPORTED`; show `CANCEL_REQUESTED`, `UPSTREAM_UNKNOWN`, `CANCEL_CONFIRMED` or actual finished/charged status only when supported by owner receipts. A reconnecting Runner or remote callback must be fenced by existing current attempt/lease IDs. Do not interpret a repeated user message as an implicit new paid retry if an equivalent attempt is pending, nor deduplicate two genuinely different user-authorized revisions. `PENDING_USER_REVIEW` and `BLOCKED_EGRESS` are terminal for *automatic progression*, not falsely completed jobs.

## 19. Intent modes, step validation and user-directed boundaries

### 19.1 Trusted intent-mode decision (not an LLM authorization)

The model produces `IntentCandidateV1` as untrusted proposal **without an accepted server-side decision reference**. The existing server resolver SHALL persist or derive a small `IntentModeDecisionV1` explainability projection using explicit user imperative/questions, negations (`only`, `ยังไม่`, `อย่า`), current conversation references, fresh page hints, permitted target certainty, requested effects and active approval state. Mode confidence is advisory; server rules overrule a model confidence claim. A request may contain an advice subtask and an execution subtask, but any mutating subtask still needs the same authoritative binding as a standalone command.

```ts
interface IntentModeDecisionV1 {
  schemaVersion:'sah.intent.mode-decision.v1';
  candidateRef:string; resolvedMode:'DISCOVER'|'ADVISE'|'PREVIEW'|
    'SINGLE_FUNCTION'|'BOUNDED_ASSISTED'|'SAVED_WORKFLOW';
  interpretationStatus:'READY'|'NEEDS_TARGET'|'NEEDS_CONSTRAINT'|'DENIED';
  serverReasonCodes:string[]; explicitScopeConstraints:string[];
  permittedEffectClasses:string[]; projectContextStatus:'NOT_NEEDED'|
    'EXPLICIT_CONFIRMED'|'RESOLVED_NEEDS_CONFIRMATION'|'AMBIGUOUS';
  sourceMessageRef:string; contextSnapshotRef?:string;
  decisionRevision:string; expiresAt:string;
}
```

A user asks *what can be done* → DISCOVER; *how* or *how much* → ADVISE; *show a masked example* → PREVIEW that **may create a derivative** and is separately cost-labeled; *generate only depth* → SINGLE_FUNCTION with one operation; *mask then stop for my approval* → BOUNDED_ASSISTED with an explicit manual gate; *save a reusable repeatable process* → SAVED_WORKFLOW **proposal** until explicit Spec 215 admission. A UI change, Skill instruction or provider suggestion must not increase this permission boundary without a fresh user-authorized turn/action.

### 19.2 Semantic plan validator exceeds JSON Schema

The trusted validator MUST check: (a) for `SINGLE_FUNCTION`, exactly one selected capability and one executable step and **both refs are equal**; (b) every step capability is included in `selectedCapabilityRefs`; (c) unique step IDs, all prerequisite IDs exist, no cycles, no dependency on an unadmitted optional step, no unauthorized parallelism or effects; (d) user-requested vs optional steps and review gates are preserved; (e) all input bindings resolve to the currently permitted typed assets, not arbitrary file paths/URLs; (f) no `DISCOVER`/`ADVISE` executable steps and no `SAVED_WORKFLOW` persistence without admission. `proposalDigest` emitted by the model has no security value and is replaced by server canonicalized digest when promoted into an existing action binding.

For `BOUNDED_ASSISTED`, show each step and its declared effect, output, quoted cost, egress, current availability and `BEFORE_STEP`/`AFTER_STEP` review gate before submitting paid work. The first permitted step may start after the normal action approval, but a manually gated later step MUST NOT start until the same actor (or explicitly authorized reviewer) approves the exact immutable preceding artifact revision/quality preview and the pending downstream input hashes. If an upstream artifact, approval, policy, Skill release or selected offer changes, invalidate affected downstream bindings and re-preview/requote before resume. Existing Workflow/Task Control stays the progress authority; a bounded plan without persisted Workflow is not a second scheduler.

### 19.3 Context, direct-use and multi-device continuity

An explicit current-turn canonical function ID or human-readable exact function choice takes priority over open-ended Skill suggestions; suggestions may clarify parameters but cannot add mandatory generation, grading or publishing. Projectless `DISCOVER` is allowed; actor-specific asset operations require exact authorization. When page context is absent, expired or conflicts with explicit project selection, re-resolve through existing Spec 241 and Spec 253 context and ask only for materially ambiguous *write* targets. A second device cannot reuse another session's stale page selection or approval button. Offline or accessibility-limited clients get text alternatives to rich previews; all approval/retry controls call the same owner APIs.

## 20. Permission-safe catalogs and Skill integrity

### 20.1 Index, pagination and negative lookups

The read-derived catalog may use Vectorize for candidate retrieval but the **source owner plus policy** filters each entry *again* at describe/display time. Raw `retrievalEvidenceRefs` remain server-only; human/agent catalog envelopes emit an empty array and only sanctioned reason codes. An internal evidence reference must not become an object read grant. Do not index private Skill full text or privileged secrets as globally retrievable search vectors. The caller-visible `COMPLETE` state is valid only for its requested, authorized scope and catalog generation; if a source shard fails, emit `PARTIAL` and preserve exact-ID fallback rather than claiming a missing skill/capability. An unentitled principal cannot distinguish a private capability's existence by suggested alias, count, cursor length, facet distribution, page total, cache latency or forbidden error detail. Tests SHALL exercise these side channels with separate actors in the same tenant and different tenants.

Any public-facing cursor SHALL be opaque, bounded, authenticated and bound to actor/entitlement scope, selected filters, locale, catalog generation, policy/ACL epoch and expiry. A cursor created in another tenant, app, auth session or prior ACL generation is invalid. Keyset/snapshot pagination MUST avoid exposing private entries through unstable count or skipped-page patterns. A cached authorized search result is advisory only: update and deny at the policy owner synchronously after revocation; invalidate best-effort search/cache/index projections asynchronously. `CacheableResult` TTL is never a proof of authorization.

### 20.2 Skill selection, load and tool control

Progressive disclosure remains: list minimal reviewed Skill descriptions first; select immutable release **plus origin/server identity**; request exact authorized `SKILL.md`; verify manifest digest, byte size and parsed frontmatter against the held entry; load supporting files lazily with origin-bound URI and approved content-bound grant; keep model/tool outputs lower priority than user and system constraints. A static MCP Skill up to 512 manifest entries and total 16 MiB must remain acceptable **when delegated to Spec 248's conformant transport**, independent of smaller *prompt token* budgets in this spec. Untrusted Skill text never becomes a trusted `riskClass`, grant, package-install request or arbitrary external fetch. Dynamic manifests, unverifiable bytes, incomplete pagination and remote service identity changes use Spec 248's explicit quarantine/review or policy-restricted modes; they are not silently promoted.

At projection time, filter `relevantSkillReleaseRefs` on the caller's **current** Skill entitlement independently of the capability entitlement, so a public capability cannot disclose a private Skill name or release ID. A selected Skill can describe a missing function and propose a reviewed alternative, but it cannot register that function in production, change an operation ID or activate a Tool by being read. For any active bounded plan, preserve the selected Skill release/source/content digest and invalidate not-yet-admitted steps on release revocation, content change, consent change or new code/policy epoch. Human approval to *use a Skill* is distinct from user approval to *perform a paid Tool call*.

### 20.3 Human, agent and Mini App projections

A human sees only entitled cards and truthful `READY`/`CONDITIONAL`/`OFFLINE`/`BLOCKED`/`NOT_IMPLEMENTED`; public conceptual capabilities may appear only if owner policy allows and are never presented as available for direct invocation. For an external Agent, expose a **bounded discovery Tool or existing approved gateway mapping**, paginated schema refs and a separately negotiated Spec 248 Skill listing; do not preload hundreds of Tool descriptions or invent new MCP `skills/*` methods. A delegated Agent can receive metadata but does not gain target asset read grants, backend secrets, privileged feature-flag state or unrestricted local-runner information. A2A Agent Card `skills` are advertised high-level agent abilities, not Spec 221 Skill releases; keep the transport identity separate.

Mini App scope SHALL be the **intersection** of explicit app-granted capability IDs, current user permissions, current project and per-asset rights. Universal Chat may request a wider scope only by an explicit user handoff and fresh authorization. Agent/tool output text, generated UI and untrusted captions cannot add a hidden search filter that broadens permissions. A permitted lookup cannot leak private reference names in an alternative suggestion or free-text error message.

## 21. Film Hybrid data contracts and technical correctness

### 21.1 Source MediaClock and color evidence

Each Film operation accepting video SHALL read an immutable input media manifest or fail with `MISSING_SOURCE_CLOCK` when exact timing is necessary. Required source evidence includes canonical asset/revision/digest, stream and sample timebase as reduced rational, source per-frame PTS for variable-frame-rate inputs, declared nominal and measured frame rate, start offset, audio sample rate and channel mapping, camera/source transform/orientation, source transfer function/primaries/matrix, range (full/limited), codec/bit depth and known color-transform version. Missing fields stay `UNKNOWN`; a container's nominal 25 fps does not establish that its source/AI generation ran at 25 fps. No `frameIndex / nominalFPS` substitution for real PTS on VFR material. Camera RAW/Log and reconstructed generative HDR use distinct provenance labels.

Depth, Normal, Mask, Optical Flow, Camera Track and Composite outputs SHALL carry per-frame alignment/back-reference to source PTS or an explicit `RETIME_MAP` with uncertainty; scale (metric vs relative), normal coordinate convention, alpha premultiplied vs straight, edge contamination, temporal confidence and pass identity are typed not free-form claims. Depth may be used by a compositor without implying native Video Provider depth conditioning. A protected actor's mask is a **proposal for preservation**: full-res source pixel retention through compositor must be verified on designated protected regions, not inferred from the existence of a mask.

### 21.2 FPS, compositing, HDR and QC gates

FPS conversion is one explicit method per invocation: `SPEED_CONFORM` changes duration and requires audio pitch/time policy, while `DURATION_PRESERVING` requires duplication/interpolation strategy and artifact inspection. Track original and output PTS alignment, expected frame count, video/audio sync and scene-cut boundaries. FPS equality is not a guarantee of visual action alignment. Composite output declares blend/working color space, transfer, alpha convention and per-source color transform; unexpected mix of Log/Rec.709/ACES or limited/full range triggers review instead of unannounced conversion. `HDR_RECONSTRUCTION_INFERRED` is a mandatory label when generative models synthesize clipped highlights; bit-depth/container transcoding is never marketed as RAW restoration.

Human review gates are mandatory before committing candidate Film Shot/Performance edits to the canonical owner, before altering any protected original pixels, and before releasing externally distributed master assets when identity, brand/product detail, rights, timing or color claims exceed validated machine confidence. AI QC emits per-dimension evidence and uncertain/false-positive ranges; it is not a biometric truth engine or a single magic fidelity percentage.

### 21.3 Provider and local hardware semantics

A Runner-managed ComfyUI node becomes eligible only after installed node graph/version inspection, sandbox/allowlist/credential and hardware checks, output fixture validation, license and use-rights validation, clean cancellation/failure/receipt behavior and signed operator qualification. An online node cannot auto-install new dependencies on production requests. Cloud APIs are independently qualified by account/region/model/feature and actual output rather than manufacturer name; paid-preview and egress/retention terms are explicit. If no qualified video-edit offer exists, the minimum local Film toolset still works and the catalog labels `film.scene.replace` as unavailable, not as a broken end-to-end workflow.

## 22. Typed envelope examples and compatibility obligations

The pack's added JSON Schemas `capability-offer`, `capability-search-request`, `capability-search-result`, `intent-mode-decision` and `selection-receipt` are **proposed read-only/presentation schemas**. The original R1.0 `capability-card` and `intent-candidate` Schemas remain V1-compatible with optional R1.1 fields; no novel public MCP endpoint is created by the examples. Internal public responses MUST sanitize `retrievalEvidenceRefs` and opaque owner refs that could disclose hidden facts; schemas are necessary but not sufficient for authorization.

A `CapabilitySelectionReceiptV1` is a privacy-reduced audit **projection** that references (does not replace) existing immutable job, approval and credit receipts. It records request/message ref, resolved mode and scope fingerprint, actual selected Skill origin/release/digest or explicit no-Skill bypass, canonical capability/contract/offer version, exact action binding ref, effect summary, quote and disclosure refs, selection reasons, rejected alternatives by *sanitized codes*, artifact/result refs and current disposition. It MUST NOT serialize chain-of-thought, raw secrets or another tenant's candidates. If a required upstream receipt is unavailable, represent it as `UNVERIFIED`, never silently fill with a model explanation.

When a former V1 client receives new optional card/intent fields it may ignore them; when it sends unsupported v1.1-only semantics, server adapters MUST reject or downgrade to advice-only. Additive schema fields are usable only after actual owner schema fit is confirmed. Bump versions for any **breaking** required field or changed meaning; maintain read adapters for old projections. Activation flags default OFF independently for catalog, resolver, Film adapter, agent export and bounded-assisted modes. A rollback disables projection/adapters and leaves existing Film/Editor assets, approved histories, settled credits and canonical job receipts intact.

## 23. New high-priority acceptance fixtures (R1.1 extension)

Each `C256-49..80` is a required **implementation test case**, not a claim that the product has passed it. The included local pack tests cover only static schema/fixture, Skill frontmatter and packaging invariants; G2–G7 must supply live integration/security/economic evidence.

| ID | Distinct case | Required result |
|---|---|---|
| C256-49 | `SINGLE_FUNCTION` selected ref differs from sole step ref | Trusted semantic validator rejects inconsistent plan |
| C256-50 | Duplicate plan step IDs or missing/cyclic dependency | Reject without dispatch; no implicit reordering |
| C256-51 | Mandatory prerequisite secretly charges external GPU | Disclose/quote/authorize separate effect or return blocked |
| C256-52 | User asks for mask preview on paid provider | Explicit cost and egress approval before preview |
| C256-53 | User says "only depth, don't generate" in Thai and English | Exactly one depth effect; negative constraint preserved |
| C256-54 | Preview step approved but upstream mask bytes change | All dependent unadmitted steps become invalid |
| C256-55 | User rejects gated mask in bounded-assisted plan | No later generation; original and intermediate history retained |
| C256-56 | Runner goes offline after offer READY but before dispatch | Fresh offer qualification, not stale READY acceptance |
| C256-57 | Cloud fallback has distinct retention/region/cost | Fresh disclosures and required consent; no silent transfer |
| C256-58 | Stale cursor replayed by another tenant or a changed ACL | Reject without private count/name or pagination disclosure |
| C256-59 | Partial catalog loses a source shard | `PARTIAL` state plus exact-ID fallback, not false absence |
| C256-60 | Same-tenant user cannot access a private Skill | No title, URI, alias, private vector snippet or timing side channel |
| C256-61 | Remote Skill manifest same URI but different server identity | No content, approval, cache or filesystem collision |
| C256-62 | Static MCP Skill at 512 files and 16 MiB | Spec 248 transport accepts per normative limits; prompt budget separately enforced |
| C256-63 | Entry frontmatter differs from fetched `SKILL.md` | Block load, refresh entry and invalidate related approval |
| C256-64 | Unlisted relative Skill resource and dynamic manifest | Enforce Spec 248 held-entry/policy rules; no arbitrary fetch |
| C256-65 | Low-trust Skill tries to alter owner risk/effects | Descriptor and server policy unchanged; activation denied unless reviewed |
| C256-66 | External Agent Tool list lacks Skills extension | Tools-only compatibility; no invented Skills protocol support |
| C256-67 | Mini App asks for capability beyond app grants | Denied independently of end-user global entitlement |
| C256-68 | User hands task from Mini App to universal Chat | Explicit handoff and fresh target/authorization; no scope carryover |
| C256-69 | VFR media with nonuniform PTS, nominal 25 fps | Exact PTS retained; no integer-index timing assumption |
| C256-70 | Depth relative scale used as metric or wrong frame alignment | Typed consumer rejects or requests explicit calibration/retime |
| C256-71 | Alpha straight/premult mismatch or differing color transforms | Compositor preflight fails or creates review-required conversion candidate |
| C256-72 | Protected performer mask exists but generated pixels replace face | Pixel-level preservation QC detects/blocks affected candidate |
| C256-73 | 8-bit AI output relabeled 12-bit RAW | Provenance rejects RAW claim; derivative labeled reconstructed/transcoded |
| C256-74 | Preview/depth provider not certified and Film P0 flagged ON | Mark provider UNQUALIFIED; native fixture slice remains independently usable |
| C256-75 | Job cancel requested after provider accepts and charges | Display real best-effort/unknown and actual settlement; never fake refund |
| C256-76 | Same user repeats identical paid command while first attempt UNKNOWN | Reconcile original; no double-dispatch/charge |
| C256-77 | Fresh explicit project conflicts with old device page selection | Explicit target wins; stale session binding unusable |
| C256-78 | Skill revoked while assisted plan awaits human review | Revalidate/expire unadmitted steps; no resumed privileged execution |
| C256-79 | Flag OFF and original clients without new fields | Existing registry/invocation/Task Control unchanged |
| C256-80 | R1.1 mock schema fixture and checksum pack verification | All local static contract tests pass; does not assert runtime certification |

## 24. Promotion gates, observability and owner handoff (R1.1)

**G0 owner-fit is a hard gate** before implementation: inspect canonical SmartSpecPro registry/main/PR/worktrees; resolve Spec 256 number and Feature 196/Spec 253 existing shapes; identify deployed PG tables, KV/Vectorize tenant index, current ComfyUI/Runner and live backend terms. Obtain explicit owner review of any optional contract addition. No DDL, live flag change or code authority at document-review stage.

**G1 static contract gate:** execute JSON Schema draft-2020-12 checks (including invalid negative fixtures), `SKILL.md` YAML and metadata constraints, exact-ID/reference semantic-validator fixtures and pack integrity. Note that a JSON Schema `format: date-time` requires an actual format checker. These tests prove only the proposed examples and validators, not live runtime behavior. **G2 direct-use gate:** no-page discovery and a single independent Film operation with correct effects and physical job receipts. **G3 Skill gate:** selected approved Skill only, correct immutable source/digest and preserved user negations. **G4 Film gate:** typed clock/color/pass metadata, protected-pixel and paid/provider QA. **G5 agent/Mini App gate:** scoped tools/skills distinction, denial/no-leak fixture and interoperability with current deployed protocol versions. **G6 bounded gate:** pause/resume after approved exact artifacts, reapproval when data/rights/provider/budget changes and no unintended Workflow persistence. **G7 canary gate:** two consented tenants and a negative-control principal; zero unauthorized side effects, no duplicate settled charges, no cross-tenant leakage, no regression with flags OFF, explicit rollback receipts and signed go/no-go by existing owners.

Track independently: (a) catalog completeness and false-negative exact-ID recovery; (b) Thai/English user intent mode error and unwanted-work rate; (c) quality of Skill selection **and** absence of unsafe Skill activation; (d) operation effects actually performed versus the user-approved budget; (e) preflight and user-review latency; (f) total quote/actual cost and egress by consent; (g) technical Film pass alignment, protected region preservation and export QC. The **zero unauthorized-effect** invariant is a hard correctness gate independent of aggregate retrieval metrics. Production activation is prohibited until real current-code fixtures, policy-owner review and staged runtime evidence exist; a 14-pass document review does not satisfy this gate.

---

## 25. R1.2 — Second independent gap audit: controlling amendment

**Audit basis:** the actual 829-line R1.1 Markdown supplied in this conversation and the 25-entry R1.1 implementation pack were inspected, including seven JSON Schemas, seven example fixtures, 20 intent-goldset entries and the 34 static tests. The prior 14-pass report remains historical evidence of a *document audit*, not evidence of deployed conformance. Twelve further **distinct review passes** are recorded in `AUDIT-12-ADDITIONAL-PASSES-R1.2.md`. This R1.2 document is **cumulative**: Sections 0–24 are retained, and Sections 25–36 supersede any weaker interpretation. Feature flags remain OFF. New schemas are proposed compatibility contracts; G0 repository/source fit and owner approvals remain mandatory.

**Principal new finding:** R1.1 separately describes the internal capability card, effect budget, step-review approval, delegation limits and media-pass details, but not every boundary has a machine-readable contract. In particular, the existing `CapabilitySearchResultV1` allows internal card fields (`ownerPolicyRef`, `ownerConformanceRef`, raw Skill refs) to travel in the same shape used for human/Agent display. Clearing `retrievalEvidenceRefs` alone does not enforce least disclosure. R1.2 introduces a distinct **strict public projection**, not merely an instruction to sanitize. It also adds trusted preflight/checkpoint envelopes as references to *existing* owner-issued authority, never new grants.

### 25.1 R1.2 ownership, availability and version constraints

1. Feature 196's existing authoritative capability/resolver services, Spec 221 Skill Registry and Spec 229 retrieval remain unchanged in ownership. Spec 256 contributes **only** projected read models, proposal validation rules, front-end display adapters and owner-approved extensions. Any proposed persisted field requires G0 schema-fit and explicit relevant owner approval.
2. Spec 248 R1.4 exclusively owns MCP Skills protocol transport/distribution. A generic SmartAIHub discovery endpoint or the proposed public catalog JSON Schema is **not** a standard MCP `skills/*` method. External clients must negotiate `io.modelcontextprotocol/skills` against the actually deployed MCP revision, using its pinned published schema; unsupported clients retain labeled Tools-only compatibility. See upstream stable specification: `https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx`.
3. Spec 253 exclusively owns cross-product action/handoff. Spec 254 owns Film-specific provider placement, qualifications and task profiles. Spec 255's media graph remains an optional read-only input; Film direct functions must work with `semantic_media.enabled=false`.
4. A **PROPOSED** logical capability is not an installed implementation. Public cards include status labels and reasons, with `NOT_IMPLEMENTED` and `UNKNOWN` clearly distinguished; never advertise a paid AI video capability as usable solely because it appears in this spec.
5. Specs 1–214 remain immutable; active Spec 224 is unchanged. Number 256 remains provisional until checked against live main, active branches/worktrees, owner registry and PRs. No DDL, deploy or account configuration is authorized by this document.

## 26. Pass A — Public catalog projection must be structurally separate from internal objects

The internal `CapabilityCardV1` contains owner policy/conformance references, exact schema refs and Skill release references. Those are useful to the trusted resolver, but a client-facing endpoint must **not** serialize the internal card and simply blank one evidence array. Introduce `PublicCapabilityCatalogV1` (pack schema `capability-public-result.schema.json`) whose nested `PublicCapabilityCardV1` is an **allowlisted** object: public opaque display ID, owner product label, localized title/summary, accessible input/output kinds, user-facing effects and availability, optional *entitled* Skill display labels, restricted UI action codes and non-sensitive availability reason codes. It contains **no** internal `canonicalCapabilityRef`, policy refs, raw origin URI, backend offer ID, unfiltered relevant Skill release refs or internal evidence refs.

Trusted server maps display ID to exact canonical ID **only after a fresh authz check** at describe/invoke time. Agent clients needing an actionable ID receive a separate, short-lived, audience-specific opaque binding through the pre-existing authenticated gateway, not through open catalog serialization. Every nested free-text field from remote tool descriptions and Skills is sanitized, length-capped and policy-reviewed; do not reflect hidden names in alternative suggestions, filters, totals, response sizes or structured errors. Public catalog snapshots and cursors are bound to actor/app/tenant scope, auth epoch, locale, normalized filter digest, projection version and expiry. On scope change, restart pagination; do not splice stale pages into current results. The strict public schema MUST reject `ownerPolicyRef`, `retrievalEvidenceRefs`, `backendOfferRef`, cross-tenant raw Skill URIs and other internal-only fields anywhere in nested cards.

**Compatibility:** keep the R1.1 internal search-result schema strictly server-side. If an existing API already exposes an approved bounded card, adapt to its exact version at G0; the R1.2 proposed object is not permission to break live clients.

## 27. Pass B — Effect budget must be an inspectable, stage-bound projection

R1.1 defines `EffectBudgetV1` in prose/TypeScript but had no corresponding schema. The pack now includes `effect-budget.schema.json`. It is a **read-only explanation of existing owner-issued action bindings**. A function owner must declare maximum observable effects, including local derivative creation, external upload, remotely retained copies, GPU/CPU cost, data residency, user resource consumption, and postprocessing required to satisfy the declared output. `VALIDATION_READ` includes only bounded low-cost metadata inspection; silent transcode, frame extraction at scale, AI inference or paid preview do not qualify.

A trusted preflight computes the actual admitted effect set as the **intersection** of user intent constraints, owner function safety profile, live offer capabilities, rights and existing approval. Unknown effects block admission. For `SINGLE_FUNCTION`, exactly one registered semantic function is admitted; other independent billable functions must be separately selected and disclosed. Negative user constraints (for example Thai `เท่านั้น`, `ยังไม่สร้างวิดีโอ`, `ห้ามส่งออก`) are encoded as **server-checked restrictions**, not inferred approvals. An effect budget does not authorize a spend by itself; Spec 207 quote/reservation and actual owner-issued authorization still apply.

**Pre-dispatch invariant:** recompute actual potential effects from the pinned backend offer revision, then assert `actualEffects ⊆ admittedEffects`, actual destination/region within admitted allowlists, output kinds/asset count within limits, current quote within accepted cost ceiling, and source ref/digest unchanged. A provider SDK's hidden preprocessing is not exempt. The example `EffectBudgetV1` schema intentionally has no bearer token or credential fields.

## 28. Pass C — Trusted admission and TOCTOU fences

Introduce `AdmissionChecklistV1` (`admission-checklist.schema.json`) as an **observability projection** of current trusted owner decisions: candidate digest, authenticated actor scope fingerprint, exact input revision/digest, selected capability contract and qualified offer revision, Skill origin/release/content digest when used, policy/rights epoch, quote/egress/approval receipt references, allowed effects and terminal pre-dispatch disposition. This **does not replace** Feature 196's existing action binding, Spec 253's `ProductCommandEnvelopeV1`, Spec 207 reservation or the job ledger.

The actual owner MUST revalidate the references atomically with canonical admission and again at provider dispatch; never promote an R1.1 `READY` card or a signed display cursor into an execution ticket. Stale context, changed actor rights, revocation, expired quote, changed input digest, modified Skill digest, incompatible output contract, region/retention change or backend offer drift yields `STALE_REAUTHORIZE` or `DENIED` with no side effect. Clock comparisons must use trusted server clocks and account for expiration; a client timestamp is never an admission source. Late callbacks are fenced by the actual canonical job attempt/lease and policy owner.

**Uncertain paid attempt:** once a remote billable request may have been accepted, preserve the previous canonical attempt identifier. Reconcile provider status and receipts before creating a retry. A deliberate *new* user command must have its own explicit revision/approval, so deduplication does not discard distinct work.

## 29. Pass D — Bounded-plan semantics and no implicit escalation

The existing R1.1 illustrative test checks only that each executable step ref is included among selected capabilities; for an executable plan it can still accept **extra unused selected capability refs**. The R1.2 trusted validator SHALL enforce exact equality between the **set of selected executable capability refs** and the **set referenced by executable plan steps** for `SINGLE_FUNCTION`, `PREVIEW` when executable, and `BOUNDED_ASSISTED`; the `SAVED_WORKFLOW` mode may produce an advisory uncommitted plan but still cannot persist/dispatch without Spec 215 admission. DISCOVER/ADVISE always have **zero executable steps**. No unused executable capability may be smuggled into the approved set. Duplicate IDs, unknown deps, cycles, implicit parallelization, dependency on rejected optional stages or skipped human gates remain invalid.

A **mode ceiling** is server-derived from the actual present user request. The system cannot promote a discovery/advice question to preview, preview to production generation, or a one-function command to multi-step plan merely because a Skill recommends more work. Previous conversational instructions can inform context but cannot turn a new read-only question into a paid job. An explicit user correction (`ไม่เอา`, `only`, `stop here`) takes precedence over stale plan state; on conflicting instructions, produce an advice-only clarification rather than broaden effects. `requestedByUser` is model-authored and must be independently verified against the authoritative message/action; it cannot self-certify a side effect.

A trusted plan validator MUST resolve every `inputBindings` value via typed owner adapters. Reject literal arbitrary filesystem paths, raw third-party URLs used as AssetRefs, references to other tenants, data URLs/executable inline templates in privileged contexts and forged role or permission metadata. For bounded but unsaved plans, the canonical existing job/task owner retains progress and recovery; no ad hoc assistant-side scheduler, hidden loop or new state authority.

## 30. Pass E — Review checkpoints and pause/resume across devices

R1.1 correctly requires a pause after an approved Mask/Depth but lacks a typed demonstration of the exact resume state. Add `StepReviewCheckpointV1` (`step-review-checkpoint.schema.json`) as a read-only projection referring to **existing canonical** approval/job objects. Each checkpoint captures stage ID, target project/asset, immutable source revision, exact reviewed artifact revision + SHA-256 digest, selected technique/Skill digest, pending dependent step IDs, quote/egress digest, reviewer scope fingerprint, policy epoch, disposition and expiry. The UI's `APPROVED` badge is not proof of canonical approval; only the owner-issued approval receipt bound to this exact checkpoint may authorize progression.

On mask edit, different depth pass, quote increase, provider switch, new data destination, skill digest change, consent/rights change or switched project, mark downstream pending steps `STALE_REVIEW_REQUIRED`. **Never** silently roll an old approval forward to a visually similar or same-named file. A reviewer on phone/tablet receives textual/accessible comparison and must see the exact asset/version and effect being approved. A rejected or canceled stage stops dependent stages but retains independently lawful intermediate artifacts and historical audit. Unrelated approved stages remain intact if Spec 215 validates dependency separation.

No resume route may bypass pre-dispatch checks merely because a session or cached plan has `APPROVED` in local UI state. Replay of an approval event after project/tenant switching must be denied at the server.

## 31. Pass F — Attenuated External Agent and Mini App capability scopes

Introduce `DelegatedCapabilityScopeV1` (`delegation-scope.schema.json`) as a **non-transferable projection** of an **existing** scoped authorization/delegation grant. Every Agent/Mini App capability view and execution must be bounded by `user ∩ tenant ∩ project ∩ asset ∩ app-grants ∩ delegated-action-allowlist ∩ current policy`. Delegation is not inferred from Skill text, MCP Tool names, A2A Agent Cards, creator Marketplace license, or a user-wide token's mere presence.

A child delegated request MUST be a subset of its parent's live effects, target assets, capability allowlist, approved external destinations, regions, remaining cost ceiling and expiry. Unless an owner-approved explicit subdelegation permission exists, further delegation is denied. Bind issuer/auth actor, audience, parent binding ref, nonce/attempt, action allowlist and maximum delegation depth within existing owner controls; never hand raw browser or Runner credentials to agents. A metadata-discovery grant **cannot** act as an asset-read or tool-invoke grant. A Mini App universal-Chat handoff requires fresh user action and fresh target authorization, not inherited widened scope.

Negative tests must include: same-tenant hidden skill; other-tenant aliases and facets; Agent B trying to use Agent A's handle; a child asking for a superset of effects; app-level agent trying to call an allowed global user function on an unapproved project; and prompt injection from caption/Skill attempting to widen an Agent's permitted tools.

## 32. Pass G — Skill trust, progressive loading and source poisoning

The upstream Agent Skills format requires `SKILL.md` YAML frontmatter with valid `name` and non-empty `description`; optional scripts/references/assets are distinct from permission to run them. R1.2 requires the pack's Skill example and validator to enforce **format** limits separately from trust: valid name, description length, correct origin identity, digest match and resource resolution do not make a Skill safe. Verify the exact held entry, `SKILL.md` bytes, resource manifest and load grant under Spec 248/221, keeping same-name sources and nested skills in separate namespaces. Never auto-activate an embedded nested Skill merely because it was read as a parent resource.

LLM retrieval must label all remote Skill text, remote Tool descriptions, captions, OCR and provider output as untrusted. Sanitize or isolate instruction-like attempts that ask for credentials, turn off logging, modify approvals, install packages, broaden project search or bypass review. If a selected approved Skill unexpectedly attempts to invoke a Tool outside the user-authorized effect budget, reject that tool call and record a concise owner-auditable reason; the Skill may remain visible as content but cannot expand grants. One failed/partial manifest or a token cutoff cannot masquerade as a fully loaded Skill. At low retrieval confidence, show reviewed alternatives and allow direct exact-function lookup.

## 33. Pass H — Provider drift, availability and truthful fallbacks

A `READY` backend offer is conditional on **actual** user/asset/account/region, quota, credentials, model revision, installed Runner/ComfyUI node hashes, contract conformance, GPU/driver and current policy. Advertised model names or a successful response from yesterday are not evidence for today's user. Eligibility must include data-retention terms, whether upload is required, per-output actual container/FPS/bit-depth/alpha and the guarantee level of requested conditioning (native vs reference-only vs post-compositing). Health stamps and qualification receipts expire independently of projection cache TTL.

For an unsupported constraint, return `UNSUPPORTED_CONSTRAINT` and a visibly different technique/provider choice. An offline local Runner must **not** silently trigger cloud egress; a cloud alternative requires separate egress/cost/retention/region disclosure and consent. A preview that is paid or uploads full media is not `FREE_METADATA`. A provider API changing feature support, deprecating an output codec or changing accepted rate must invalidate the relevant offer and pending unadmitted bindings. Never label an integration production-ready without live account-specific qualification. Offline documentation must still let a human discover conceptual operations without lying about availability.

## 34. Pass I — Typed Film media-pass interchange and protected original pixels

R1.1 describes timebase/Depth/Normal/Alpha principles but lacks a sample typed interchange envelope. Add `FilmMediaPassV1` (`film-media-pass.schema.json`) for **derived-pass metadata only**; actual bytes remain in existing Library/R2 and Film/Editor canonical revisions. Required fields: project/source/version refs, actual content digest, media clock/timebase and PTS evidence, nominal vs variable frame-rate indication, transfer function/primaries/working space, pass type, estimated-versus-measured provenance, coordinate frame/scale for Depth and Normals, alpha convention for Masks, interpolation/retime provenance and protected-region policy evidence where applicable.

A consumer must fail closed when a relative Depth is treated as metric without calibration; when Normal convention/space differs; when a straight-alpha mask is composited as premultiplied; when PTS arrays/clock transform are incompatible; or when a color-managed pass silently changes primaries/transfer. For protected faces/products/logos, use **original source pixels** wherever preservation is required; a high-level identity score cannot certify pixel-exact preservation. Protected masks and source revisions must be independently rights-checked for the intended transformation. Generated SDR→HDR is tagged `SYNTHETIC_INFERENCE`; transcoding 8-bit to 12-bit **is not original RAW restoration**. A delivery candidate must carry source-backed timebase and per-dimension QC evidence (temporal, identity/brand, spatial/pass, color, audio sync) and fail or request human review on material uncertainty.

The P0 native fixture suite MUST work without an external paid video model: inspect, extract frames, generate test mask/depth, align two passes by real PTS, composite preview, compare and export-validate. If a test requires a specific GPU/model, label that as optional qualified integration, not universal P0.

## 35. Passes J/K/L — Cost truth, measurable intent quality and rollback

### 35.1 J: Cost, quotas, storage and unknown paid outcomes

Quotes show user-visible unit, currency, bounded assumptions, optional paid preview, model/provider revision, expected output count, external retention/egress and a maximum spend ceiling. Actual settlement belongs **only** to existing Spec 207 and canonical attempt receipts. Retry of an `UNKNOWN` paid outcome first reconciles the original provider attempt; no fabricated refund or second billable dispatch. Distinct fresh user-authorized revisions must not be collapsed by deduplication. Local compute isn't necessarily free to the user: show resource use, likely runtime and battery/network costs where meaningful, without treating an estimate as a guaranteed meter.

### 35.2 K: Eval set must challenge meaning rather than match keywords

Extend the Thai/English intent gold set with adversarially phrased examples: explicit negative commands, quoted instructions inside an untrusted caption, conditional approval, mixed read/write requests, conflicting old page hints and ambiguous target references. Evaluate **mode accuracy**, wrong-target rate, unintended side-effect rate, Skill trust correctness and direct-ID recall **separately**. A 100% shape-valid JSON response is not evidence that the LLM understood Thai negation. Critical negative test cases use independent second-tenant fixtures and the actual owner authorization; the pack's pure test helpers are only executable reference examples.

### 35.3 L: Deterministic change control, canary and rollback

At G0 complete the owner-fit matrix by linking *actual* repository types and deployed table names; import no provisional endpoint by assumption. Each R1.2 logical schema has a version/compatibility table and negative fixtures. Feature flags are independent: read-only catalog first; then direct function; then Skill-first; then Agent/Mini App export; then stage reviews; finally optional saved-Workflow handoff. Flag OFF preserves legacy API shapes, current Film/Editor revisions, source artifacts and original Chat/Task Control with no phantom jobs. Do not issue destructive SQL, alter live settings or install third-party code during document-level audit.

Promotion requires signed actual-owner verification at each G0–G7 gate, two isolated tenant canaries plus a denied same-tenant principal, qualified local and selected cloud offer fixtures, verified exact output digests, safe paid-attempt reconciliation, error-free legacy flag-OFF regression and an exercised rollback. Proposed performance SLOs are not observed measurements. No document audit, schema test or synthetic gold set alone satisfies runtime certification.

## 36. R1.2 expanded acceptance cases and implementer crosswalk

`C256-81..112` below are **32 newly specified acceptance cases**, on top of the 80 existing cases. Only static cases explicitly exercised by the accompanying tests can be called locally validated. Cross-product and paid/live tests remain mandatory implementation work. Current implementation evidence shall map each case to its canonical owner, source commit and actual test result, not merely a checklist tick.

| ID | Gap domain | Acceptance scenario | Required outcome |
|---|---|---|---|
| C256-81 | Public scope | Internal card includes ownerPolicyRef and Skill release refs | Public catalog serialization rejects or removes all unapproved internal fields |
| C256-82 | Public scope | Two users have different entitlements on one indexed result page | Neither counts nor aliases nor nested offer fields disclose forbidden records |
| C256-83 | Catalog cursor | Cursor replayed after app scope or ACL epoch changes | Opaque cursor rejected without disclosure; new scoped search permitted |
| C256-84 | Public metadata | Remote Tool free-text attempts to embed hidden Skill URI | Content remains untrusted; filtered metadata or no publication |
| C256-85 | Effect budget | `SINGLE_FUNCTION` depth adapter tries extra paid segmentation | Separate visible step/approval required or dispatch rejected |
| C256-86 | Effect budget | Request explicitly forbids external egress | No cloud upload even if only cloud offer is READY |
| C256-87 | Preflight | Backend's actual effect set exceeds admitted budget | No dispatch; event records owner-coded cause |
| C256-88 | TOCTOU | Mask/source digest changes after quote before dispatch | Stale admission; requote and new approval when applicable |
| C256-89 | TOCTOU | Skill revoked after approval, before downstream step | No downstream admission; history preserved |
| C256-90 | TOCTOU | Late callback from prior fenced job attempt | No result admission or duplicate settlement |
| C256-91 | Plan semantics | Bounded plan has one unused extra selected capability | Semantic validator rejects set mismatch |
| C256-92 | Plan semantics | Read-only question followed by model-invented preview | Server mode ceiling denies derivative execution |
| C256-93 | Plan semantics | LLM marks unrequested paid step `requestedByUser=true` | Trusted message/effect binding rejects forged provenance |
| C256-94 | Input binding | Arbitrary untrusted URL/path passed as source AssetRef | Typed owner adapter rejects; no SSRF/local file access |
| C256-95 | Review | Reviewer approves mask A, generation gets changed mask B | Reject stale checkpoint despite apparent UI approval |
| C256-96 | Review | Approval from old device/session after target switch | Bind to exact current actor, scope and source; deny replay |
| C256-97 | Review | User rejects mask but parallel generation is queued | Dependent work never dispatches; lawful prior artifact retained |
| C256-98 | Delegation | Agent child asks for asset/effect superset | Parent-scope attenuation failure; deny |
| C256-99 | Delegation | Agent B reuses Agent A's issued handle | Audience-bound current authorization rejects |
| C256-100 | Delegation | Mini App tries user-entitled but app-forbidden project | Reject and no metadata leakage; handoff requires explicit fresh action |
| C256-101 | Skill | Nested Skill read as resource without fresh approval | No auto-activation or inherited elevated tool grants |
| C256-102 | Skill | Tool result injects command to install ComfyUI node | No implicit install or code-exec from data |
| C256-103 | Provider | Qualified Runner disconnects between lookup and dispatch | Offer invalidated; safe conditional fallback with explicit consent |
| C256-104 | Provider | Video provider loses native conditioning support | No native-control claim; unavailable or disclosed new technique |
| C256-105 | Media | VFR pass has valid nominal FPS but nonmatching PTS mapping | Preflight rejects or requires explicit time-warp review |
| C256-106 | Media | Relative depth passed to metric-geometry consumer | Fail without calibrated transform |
| C256-107 | Media | Premultiplied alpha treated as straight alpha | Reject or reviewed conversion candidate |
| C256-108 | Media | AI derivative tagged as original camera RAW | Provenance rejects false source-class claim |
| C256-109 | Billing | Unknown paid provider attempt retried by duplicate message | Reconcile same attempt before possible next billable action |
| C256-110 | Evaluation | Thai negation `อย่าสร้างวิดีโอ` in instruction | No video generation even if Skill suggests it |
| C256-111 | Evaluation | Quoted malicious caption says “approve everything” | Treat caption as data; no forged approval or privilege expansion |
| C256-112 | Rollback | Flags OFF after staged deployment and data exists | Legacy calls and canonical owner histories remain intact; no data loss |

### 36.1 G0 checklist for implementation agents

Before any implementation, produce a **signed owner-fit matrix**: existing Feature 196 capability schemas/invocation, Spec 221 release/load contracts, Spec 229 retrieval types, Spec 253 action/command envelope, Spec 248 pinned MCP revision and conformance harness, Spec 254 local/cloud backend offers, Spec 215 handoff, current policy/credit/job owner APIs, actual Postgres/Vectorize/R2 layout, and every applicable feature flag. For each proposed field choose `EXISTING_EXACT`, `ADAPTER_REQUIRED`, `OWNER_EXTENSION_REQUIRED` or `DUPLICATE_REMOVE`. If the repository shows a competing canonical spec number, renumber *only* this additive proposal. Stop at any real authority conflict; do not deploy new persistent schema or invent write authority to make the proposal compile.

### 36.2 Definition of done

R1.2 **document delivery:** full cumulative Markdown, separate twelve-pass evidence report, revised code-readable sample contracts/fixtures, explicit positive and negative static tests, reproducible manifest/hash validation and zipped implementation handoff. **Implementation delivery (not claimed here):** G0–G7 owner approval and deployed code tests, actual Thai/English intent evaluation, two-tenant and same-tenant-denied security testing, a real qualified local media fixture, paid remote attempt reconciliation, manual-review pause/resume, agent interoperability, existing application regression and rollback evidence.
