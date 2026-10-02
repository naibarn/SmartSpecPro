# Spec 265 — SmartAIHub Decision Intelligence & Vertical Mini App Platform

**Short name:** Decision Intelligence Platform (DIP)  
**Revision:** R2.1 — Spec 266 Autonomous Research Enrichment Aligned / Shared-Foundation Refactor  
**Date:** 2026-10-01  
**Status:** Proposed — Design complete for planning; implementation is pending the dependency gates below; supersedes Spec 265 R1.1 where more specific  
**Scope:** Evidence-backed decision methodology, scenario analysis, decision workspaces, vertical Mini Apps, monitoring and commercial decision products  
**Canonical shared data dependency:** Spec 266 — SmartAIHub Unified Data, Evidence, Knowledge & Spatial Intelligence Fabric  
**Upstream contracts to preserve:** Spec 260 (implementation in progress); Spec 262 (existing MapLibre surface with additive R1.8 work still gated)  
**Related platform authorities:** Spec 261 SPAAS; SmartAIHub Chat; Task Control; Skills/Capability Registry; Retrieval Broker; canonical job/orchestration infrastructure; Marketplace; credits/billing; Memory; Library/R2  

---

## 0. Executive Decision

Spec 265 R2 preserves the original Decision Intelligence product thesis while removing duplicate ownership of shared data infrastructure.

The core product principle remains:

> **SmartAIHub must discover what must be known, obtain trustworthy evidence where permitted, calculate what can be calculated, expose what remains unknown, compare alternatives, and help the user make a better-informed decision without substituting confident LLM prose for missing evidence.**

Spec 265 R2 owns the **decision layer**.

Spec 266 owns the **shared data/evidence/knowledge layer**.

The separation is mandatory:

```text
Spec 266 answers:
“What data exists, what does it mean, where did it come from,
can it be used, how fresh/credible is it, and how can it be queried?”

Spec 265 answers:
“For this decision, what must be known, which evidence matters,
what should be calculated, what scenarios should be compared,
and what is still uncertain or missing?”
```

This prevents Spec 265 from creating a second Data Source Registry, rights registry, provenance engine, semantic registry, spatial data authority, vector index, or source-health subsystem.

### 0.1 Implementation and Dependency Status

This is a target design, not evidence of an implemented or deployed Decision Intelligence product. At the 2026-10-01 repository review, no dedicated DecisionProject/DecisionTemplate/AnalysisRun persistence, Evidence Planner, or `decision.*` runtime surface was located in the searched web/shared code paths. The existing emergency map and geospatial code are upstream integration surfaces, not implementation of Spec 265. A capability MUST be called implemented only when its owning code/schema, focused verification, and applicable environment evidence are linked from an implementation progress record.

Phase A is blocked on the versioned Spec 266 request/resolver contracts and the migration/authority gates in Spec 266 §44. Phase C is blocked on the applicable Spec 261 SPAAS package/release contracts. Spec 262-dependent features are blocked until the exact shared map capability is implemented and verified; the existence of MapLibre alone does not satisfy draw, temporal controls, typed commands, or map-to-chat integration requirements.

---

# 1. Purpose

Spec 265 defines a reusable evidence-to-decision capability for real-world questions such as:

- whether to sell, subdivide, improve or develop land;
- where to open a shop, warehouse, service location or charging point;
- which market/fair/event best fits a merchant;
- which area has unmet demand;
- how alternatives differ in cost, risk, timing and uncertainty;
- what information is missing before action is justified;
- what changed since a previous analysis;
- when a prior decision should be re-evaluated.

The platform SHALL support commercial and public-interest decision products without forcing each vertical to build its own data stack, map renderer, job system, chat, billing system or application runtime.

---

# 2. Canonical Ownership and Cross-Spec Boundaries

## 2.1 Spec 266 — Shared Data/Evidence Authority

Spec 265 SHALL consume, not duplicate, the following from Spec 266:

- `DataRequirement`;
- `DataSourceDefinition`;
- `DatasetDefinition`;
- `DataOffer`;
- Data Source Registry;
- Dataset/Semantic Catalog;
- Data Source Discovery;
- rights/licensing/attribution;
- source health/freshness;
- evidence classification;
- provenance/lineage;
- reproducibility receipts;
- semantic types and metric definitions;
- entity resolution;
- geographic/time semantics;
- spatial intelligence primitives;
- source conflict preservation;
- source/schema/methodology drift;
- Retrieval Broker integration;
- semantic/vector discovery projections;
- source materialization/caching policy;
- data credential/access policy;
- Source/Data/Metric Packs.

Spec 265 MUST NOT create parallel versions of these contracts.

## 2.2 Spec 260 — Emergency Domain Authority

Spec 260 remains the all-hazards emergency, response and coordination authority.

Spec 265 MAY use public/shared intelligence exposed by Spec 266 but MUST NOT:

- become incident truth;
- redefine emergency triage;
- redefine responder authority;
- convert commercial decision scoring into emergency prioritization;
- override emergency sponsored-credit policy;
- treat a commercial analysis as an official emergency warning.

## 2.3 Spec 262 — Shared Geospatial Visualization Surface

Spec 262 owns the MapLibre-based operational geospatial surface. The MapLibre renderer exists, but Spec 265 MUST treat each higher-level capability below as available only when its Spec 262 implementation and dependency gates are verified; a specification requirement alone is not proof that the capability is implemented.

Spec 265 SHALL reuse compatible shared map capabilities including:

- viewport context;
- draw/select geometry;
- markers/clusters;
- vector/raster layers;
- route/corridor visualization;
- temporal controls;
- map-to-chat context;
- typed map commands;
- mobile/tablet geospatial interaction;
- layer visibility/filter controls.

Spec 265 MUST NOT create a second map renderer.

## 2.4 Spec 261 — Portable Application Packaging

Decision-oriented Mini Apps SHALL use the canonical SPAAS packaging/release mechanism.

A Decision Template or Decision Pack is domain logic, not a new application runtime.

## 2.5 Chat and Task Control

SmartAIHub Chat remains the conversational authority.

Task Control remains the durable task execution/monitoring surface.

Spec 265 MUST NOT create separate vertical chat or task authorities.

## 2.6 Jobs, Billing, Memory, Files and Retrieval

Spec 265 SHALL reuse existing canonical authorities for:

- durable jobs/retries/idempotency;
- approval and side-effect policy;
- credits/budgets/settlement/revenue share;
- notification/scheduling;
- memory/project context;
- file/artifact storage;
- agent/provider routing;
- retrieval/RAG;
- tenant identity and ACL.

## 2.7 Cross-Spec Execution and Contract Gate

1. Spec 265 MUST use the canonical Spec 266 resolver and the current Spec 260/platform identity, authorization, billing, notification, and durable-job contracts. It MUST NOT create a second registry, scheduler, queue, worker, workflow engine, or chat/task authority.
2. A `ResearchNeed` is a decision-domain request description, not a provider call or executable job. A server-side adapter MUST translate it to the Spec 266 `ResearchRequest` contract; for `DECISION_ANALYSIS`, it MUST set `projectId` to the canonical DecisionProject reference and `consumerRef` to the stable `researchNeedId`. The browser MUST NOT choose the effective tenant, principal, provider credentials, execution placement, budget ceiling, or output-admission policy.
3. The adapter MUST derive `tenantId` and `requestedBy` from authenticated server context, carry the validated `DataRequirement` and allowed geography/time scope, map `preferredMode` to `ResearchRequest.mode`, and resolve `policyRef` to an authorized `outputPolicyRef`. For public research, the request MUST use an explicit public authorization scope; an omitted tenant MUST NOT imply public access.
4. The effective credit/external-cost, wall-time, source-count, privacy, rights, and provider restrictions MUST be the most restrictive combination of the DecisionProject/template policy, the ResearchRequest policy, and the caller's current platform limits. Missing policy or scope MUST fail closed as an explicit missing/blocked-evidence result.
5. Research admission MUST be created through the canonical durable-job API and transactional outbox when asynchronous work is needed. The request/job intent MUST be idempotent and tenant-scoped; queue or provider delivery MUST NOT create a second job identity. The ResearchRun/admission receipt MUST link back to the originating DecisionProject/AnalysisRun using canonical references.
6. Spec 265 MUST remain gated until Spec 266 publishes a versioned request/response contract and Spec 260/platform confirms the required job, authorization, secret, budget, and artifact-storage adapters. No direct provider or browser-execution fallback is permitted.

---

# 3. Core Architectural Invariants

The following distinctions are mandatory:

```text
LLM KNOWLEDGE ≠ CURRENT EVIDENCE
SOURCE ≠ CLAIM
EVIDENCE ≠ INTERPRETATION
OBSERVED ≠ DERIVED ≠ FORECAST ≠ USER-ASSERTED ≠ MODEL-ESTIMATED
LISTING PRICE ≠ TRANSACTION PRICE
REGISTERED POPULATION ≠ CURRENT FOOTFALL
REGISTERED WORKERS ≠ RESIDENT WORKERS
NO DATA ≠ ZERO
UNKNOWN COST ≠ ZERO COST
MISSING COMPETITOR DATA ≠ NO COMPETITION
CORRELATION ≠ CAUSATION
MAP PROXIMITY ≠ ACCESSIBILITY
RADIUS ≠ TRAVEL-TIME CATCHMENT
AI RECOMMENDATION ≠ GUARANTEED OUTCOME
DECISION SUPPORT ≠ PROFESSIONAL CERTIFICATION
```

These distinctions MUST survive through:

- intent interpretation;
- evidence planning;
- data requirement resolution;
- calculations;
- scenario generation;
- analysis runs;
- Chat answers;
- map/tables/charts;
- exports;
- monitoring;
- Mini App outputs;
- audit logs.

---

# 4. High-Level Architecture

```text
User / Team / Tenant / Mini App
            │
            ▼
SmartAIHub Chat / Decision Workspace
            │
            ▼
Decision Intent Interpreter
            │
            ▼
Decision Template Resolver
            │
      ┌─────┴──────────┐
      ▼                ▼
Evidence Planner   Scenario Planner
      │                │
      └──────┬─────────┘
             ▼
       DataRequirement[]
             │
             ▼
       ┌───────────────────┐
       │     SPEC 266      │
       │ Requirement       │
       │ → DataOffer       │
       │ → Evidence        │
       └────────┬──────────┘
                ▼
      Calculation / Analysis
                │
      ┌─────────┼──────────┐
      ▼         ▼          ▼
 Statistics  Scenario   Domain Calculators
      │         │          │
      └─────────┼──────────┘
                ▼
         Evidence-Backed Reasoning
                │
                ▼
      Claim / Comparison / Unknowns
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
     Map      Tables     Narrative
   Spec 262
                │
                ▼
       Save / Act / Monitor / Re-run
```

---

# 5. Decision Domain Objects

## 5.1 DecisionProject

```ts
interface DecisionProject {
  id: string;
  tenantId: string;
  ownerPrincipalId: string;
  title: string;
  domainRefs: string[];
  geographyRefs?: string[];
  geometryRefs?: string[];
  goal: string;
  status:
    | 'draft'
    | 'collecting_evidence'
    | 'analyzing'
    | 'waiting_user'
    | 'monitoring'
    | 'closed';
  createdAt: string;
  updatedAt: string;
}
```

A DecisionProject is the durable logical container for one real-world decision and its analysis history.

## 5.2 DecisionQuestion

A DecisionQuestion records:

- user intent;
- constraints;
- desired outcome;
- geography;
- time horizon;
- budget constraints;
- risk tolerance where explicitly provided;
- required output format;
- user-stated assumptions.

The platform MUST NOT infer sensitive attributes or protected-class preferences to improve decision ranking.

## 5.3 DecisionTemplate

```ts
interface DecisionTemplate {
  id: string;
  version: string;
  domain: string;
  supportedIntents: string[];
  factorRefs: string[];
  evidenceRequirementRefs: string[];
  calculatorRefs: string[];
  scenarioGeneratorRef?: string;
  confidencePolicyRef: string;
  missingEvidencePolicyRef: string;
  outputSchemaRef: string;
  monitorPolicyRefs?: string[];
  jurisdictionPolicyRef?: string;
}
```

Decision Templates encode reusable methodology.

## 5.4 FactorDefinition

A FactorDefinition describes a decision factor and MUST include:

- semantic meaning;
- why the factor matters;
- applicable geography/time meaning;
- preferred/fallback evidence requirements;
- unit and metric refs;
- decision role;
- limitations;
- materiality policy;
- optional jurisdiction constraints.

## 5.5 DecisionScenario

```ts
interface DecisionScenario {
  id: string;
  name: string;
  actionPlan: string[];
  assumptions: Assumption[];
  oneTimeCosts: MoneyItem[];
  recurringCosts: MoneyItem[];
  revenues: MoneyItem[];
  timing: TimelineItem[];
  dependencies: string[];
  risks: string[];
  unknowns: string[];
  evidenceRefs: string[];
}
```

## 5.6 AnalysisRun

An AnalysisRun MUST be immutable and pin:

- DecisionTemplate version;
- decision inputs/constraints;
- `DataRequirement` set;
- selected DataOffer/evidence bindings;
- source/evidence versions or receipts;
- queries and geometry;
- transformations;
- calculation/code versions;
- model/provider versions when material;
- assumptions;
- unresolved conflicts;
- missing evidence;
- output artifacts;
- cost attribution;
- policy/jurisdiction context;
- timestamps and analysis-as-of time.

## 5.7 Claim

A Claim is a user-facing statement produced by a DecisionRun.

Every material factual or quantitative claim MUST reference supporting evidence and/or reproducible calculations through Spec 266 lineage.

## 5.8 WatchDefinition

A WatchDefinition defines when a saved DecisionProject should be reconsidered.

Examples:

- new comparable transaction appears;
- competitor count changes materially;
- road/infrastructure project changes state;
- new source becomes available;
- required evidence freshness expires;
- scenario input crosses a threshold.

---

# 6. Imported Shared Contracts from Spec 266

Spec 265 R2 SHALL reference the canonical Spec 266 versions of:

```text
DataRequirement
DataOffer
EvidenceItem
EvidenceBundle
DataLineageReference
SemanticType
MetricDefinition
ResolvedEntityRef
GeoEvidenceFeature
TemporalEnvelope
SourceQualityProfile
DataRightsPolicy
```

Historical R1.1 fields MAY be supported through compatibility adapters but MUST NOT establish a second canonical definition.

---

# 7. Decision Intent Interpreter

The interpreter converts natural-language goals into one or more candidate Decision Templates.

It SHOULD identify:

- intent;
- domain;
- geography;
- relevant entities;
- constraints;
- user priorities;
- ambiguity;
- required decision depth;
- possible high-stakes/professional boundaries.

Material ambiguity SHOULD be surfaced before expensive or side-effecting work.

The interpreter MUST NOT invent missing facts.

---

# 8. Decision Template System

Starter templates MAY include:

```text
realestate.land.development_feasibility
realestate.property.purchase_analysis
realestate.subdivision_feasibility
business.site_selection
business.new_business_feasibility
market.vendor.market_selection
market.operator.market_feasibility
ev.charger.site_selection
logistics.warehouse.site_selection
agriculture.processing_point_selection
```

Templates MAY be authored by:

- SmartAIHub;
- verified domain partners;
- tenants;
- Mini App creators;
- users for private use.

Published templates MUST be versioned, tested and governed.

Template updates MUST NOT silently rewrite historical AnalysisRuns.

Complex decisions MAY compose multiple templates.

Example:

```text
Land Development Feasibility
  + Residential Market Demand
  + Utility Cost Analysis
  + Flood/Access Risk
```

---

# 9. Evidence Planner

Before deep analysis, Spec 265 SHOULD produce an Evidence Plan.

```ts
interface EvidencePlan {
  decisionTemplateVersion: string;
  required: EvidenceRequirement[];
  optional: EvidenceRequirement[];
  available: EvidenceBinding[];
  missing: MissingEvidence[];
  researchable?: ResearchNeed[];
  estimatedCreditCost?: number;
  estimatedExternalCost?: number | 'unknown';
  userActionsRequired: UserActionRequirement[];
}
```

The planner converts factors into semantic `DataRequirement` objects resolved by Spec 266.

The user SHOULD be able to select cheaper/faster or deeper analysis profiles when the template permits.

---

# 10. Missing-Evidence Planner

Missing evidence is a first-class result.

Each missing item SHOULD be classified as:

- retrievable automatically;
- retrievable with user credential;
- user upload required;
- field measurement required;
- quotation required;
- professional verification required;
- unavailable/unknown.

The platform MUST NOT silently fill required missing values with LLM guesses.

Task Control MAY receive evidence-acquisition tasks such as:

- request a utility quotation;
- photograph road frontage;
- upload title/contract documents;
- verify site measurements;
- obtain a professional appraisal.

---

## 10.1 Research Escalation to Spec 266

When a DataRequirement is missing, stale, contradictory or insufficiently evidenced, Spec 265 MAY request governed research from the Spec 266 Autonomous Research & Knowledge Enrichment Plane.

```ts
interface ResearchNeed {
  researchNeedId: string;
  decisionProjectRef: string;
  factorRef: string;
  dataRequirement: DataRequirement;
  reason:
    | 'NO_ELIGIBLE_DATA_OFFER'
    | 'STALE_EVIDENCE'
    | 'CONFLICTING_EVIDENCE'
    | 'LOW_COVERAGE'
    | 'SOURCE_DISCOVERY_REQUIRED'
    | 'CURRENT_RESEARCH_REQUIRED';
  materiality: 'low'|'medium'|'high'|'critical';
  preferredMode:
    | 'SOURCE_DISCOVERY'
    | 'EVIDENCE_ACQUISITION'
    | 'KNOWLEDGE_SYNTHESIS'
    | 'REVALIDATION';
  maxCostCredits?: number;
  maxExternalCost?: number | 'unknown';
  maxWallTimeSeconds?: number;
  maxSources?: number;
  policyRef: string;
}
```

`ResearchNeed` MUST NOT duplicate the Spec 266 `ResearchRequest` schema. The server-side adapter defined in §2.7 MUST set identity, tenant scope, budget, privacy/rights restrictions and output policy from canonical authorities, then persist a stable request reference before dispatch. A retry of the same admitted request MUST return or resume the same request/job identity; an intentional revalidation creates a distinct immutable ResearchRun under a new request reference.

| Decision-side input | Spec 266 request field | Required handling |
|---|---|---|
| Spec 266 integration | `contractVersion` | Require the supported `spec266-research-v1`; reject unknown versions and remain gated until an explicit additive version adapter exists. |
| `researchNeedId` | `consumerRef` | Stable reference; include in the request idempotency derivation. |
| `decisionProjectRef` | `projectId` | Canonical project reference; enforce same tenant as the authenticated caller. |
| decision context and `factorRef` | `goal` | Build a bounded research goal from approved template/factor text; never treat raw browser text as policy. |
| `preferredMode` | `mode` | Map one-to-one to a Spec 266 supported mode; reject unknown values. |
| `dataRequirement` | `dataRequirements` | Validate against the canonical Spec 266 schema and policy. |
| `policyRef` | `outputPolicyRef` | Resolve server-side to an active policy; never forward an arbitrary client policy string as authority. |
| `maxCostCredits` | `maxCostCredits` | Clamp to the minimum of request, template/project, tenant, and platform limits. |
| `maxExternalCost`, `maxWallTimeSeconds`, `maxSources` | same-named ResearchRequest fields | Clamp to the applicable tenant/platform ceilings; omission uses the active policy default, never an unbounded value. |
| authenticated request context | `tenantId`, `requestedBy`, `authorizationScope` | Derive server-side; public scope requires an explicit public policy decision. |

The adapter MUST set Spec 266 `consumerKind='DECISION_ANALYSIS'`. A ResearchRequest/Run MUST retain the `researchNeedId` reference so its evidence/admission receipts can be pinned to the eventual AnalysisRun without making Spec 266 the owner of that run.

Decision flow:

```text
DecisionTemplate
  → DataRequirement
  → Spec 266 resolver
  → missing/insufficient?
      → ResearchNeed
      → Spec 266 research.request
      → ResearchRun
      → admitted EvidenceCandidate/DataOffer
  → EvidenceBinding
  → AnalysisRun
```

Rules:

1. Spec 265 MUST NOT invoke Grok Bot, Muse, OpenAI Dot or another provider directly as a hard-coded dependency; it requests research capability from Spec 266.
2. The research provider resolver MAY choose SmartAIHub Native or one/more authorized external agents.
3. Research-agent output is not automatically evidence eligible for a DecisionRun.
4. A DecisionRun MAY use research-derived evidence only when Spec 266 marks it `ANALYSIS_ELIGIBLE` or stronger and the DecisionTemplate policy permits that class.
5. High-stakes templates MAY require stronger admission, independent corroboration or professional/official verification.
6. Historical AnalysisRuns MUST pin ResearchRun/admission receipts when research-derived evidence materially affected the output.
7. Research cost MUST count toward the EvidencePlan/DecisionRun budget and MUST NOT bypass user/tenant spending policy.
8. If research remains incomplete, the DecisionRun MUST preserve the missing-evidence state rather than fabricate closure.

## 10.2 Research Diversity and Corroboration

For material questions, Spec 265 MAY request research diversity, but it MUST NOT equate multiple agent responses with independent evidence.

If Grok-class, Muse-class and Dot-class agents all summarize the same government bulletin, the DecisionRun has one root source unless additional independent evidence exists.

Decision Readiness SHOULD use the Spec 266 corroboration/dependency result rather than raw document count or agent count.

## 10.3 Research-to-Monitoring Loop

A DecisionProject MAY create a governed Spec 266 research watch for previously missing or change-sensitive evidence, for example:

- new comparable transactions;
- new infrastructure project status;
- new competitor/store openings;
- newly available government dataset;
- amended regulation or zoning document;
- updated flood/road/access evidence;
- source methodology or rights changes.

A watch result creates new evidence/research receipts and MAY trigger a new AnalysisRun through existing scheduling/Task Control infrastructure. It MUST NOT rewrite prior decisions silently.

---

# 11. Skill-First Decision Execution

Preferred path:

```text
User Intent
  → Decision Skill
  → Decision Template
  → DataRequirements
  → Spec 266 Data/Capability Resolution
  → Calculators / Analysis Steps
  → Decision Output
```

The system MUST NOT load every connector or data source into every prompt.

Example Skills:

```text
skill.realestate.land-feasibility
skill.realestate.site-comparison
skill.market.vendor-selection
skill.business.trade-area-analysis
skill.decision.monitor-area
```

Data-source administration Skills such as `skill.data.add-source` are owned by Spec 266.

Decision Skills MUST advertise:

- required inputs;
- decision/output semantics;
- risk class;
- estimated cost class;
- required DataRequirements;
- required approvals/side effects.

---

# 12. LLM Reasoning Contract

The LLM SHOULD:

1. interpret the user's goal;
2. select or compose Decision Templates;
3. identify relevant factors;
4. create semantic DataRequirements;
5. explain evidence gaps;
6. interpret deterministic calculations;
7. compare scenarios;
8. preserve uncertainty;
9. generate readable explanations;
10. propose follow-up evidence/actions.

The LLM MUST NOT:

- fabricate required values;
- silently overwrite deterministic calculator outputs;
- present proxy data as direct measurement;
- present correlation as causation;
- present an informational estimate as certified professional output;
- hide evidence conflicts that materially affect the decision;
- treat another agent's narrative as original evidence without Spec 266 provenance/admission;
- treat repeated agent summaries as independent corroboration.

Estimated values MUST carry explicit estimation method and lineage.

---

# 13. Statistical and Proxy Governance

Decision Intelligence SHALL distinguish mathematical correctness from inferential validity.

Material proxy/estimate definitions SHOULD declare:

- target phenomenon/population;
- observed sample/population;
- coverage;
- collection/sampling method where known;
- denominator definition;
- selection/survivorship bias risk;
- minimum sample/coverage policy;
- missingness pattern;
- extrapolation policy.

Examples that MUST remain distinct:

```text
registered_factory_workers ≠ resident_worker_population
store_locator_branches ≠ all_retail_supply
listing_inventory ≠ completed_transactions
search_interest ≠ purchase demand
```

Rankings MUST disclose the eligible comparison set and material coverage limitations.

---

# 14. Demand, Supply and Opportunity Analysis

Demand proxies MAY include:

- residents;
- workers;
- students;
- visitors;
- households;
- vehicle flows;
- business registrations;
- historical sales;
- user request intent;
- buyer watchlists.

Supply proxies MAY include:

- existing stores;
- property inventory;
- service providers;
- market stalls;
- charging points;
- competitors;
- available units;
- user/creator inventory.

Outputs MUST disclose:

- which proxies were used;
- why they were used;
- missing dimensions;
- direct vs indirect evidence;
- sensitivity to assumptions.

No opaque LLM-generated opportunity score may be presented as authoritative.

---

# 15. Scenario and Financial Feasibility

Where appropriate, deterministic calculators MAY provide:

- total project cost;
- net usable/sellable area;
- unit cost;
- break-even price/volume;
- gross/net margin;
- ROI;
- payback period;
- cash-flow timing;
- financing/holding cost;
- tax estimate using verified current rule sets;
- downside/base/upside cases;
- sensitivity tables.

High-stakes calculations MUST expose assumptions, jurisdiction and source dates.

---

# 16. Multi-Criteria Decision Analysis

Scorecards and MCDA MAY be supported but value judgments MUST be explicit.

A reusable score MUST expose:

```text
criteria
metric source
normalization method
weight
direction
missing-value treatment
thresholds
version
```

Rules:

1. LLM-generated weights are suggestions unless a reviewed template defines them.
2. User priorities MAY override weights when policy permits and MUST be stored.
3. Raw metrics SHOULD appear beside aggregate scores.
4. Sensitivity SHOULD show whether reasonable weight changes alter ordering.
5. If alternatives are not materially distinguishable under uncertainty, the system SHOULD say so.

---

# 17. Uncertainty and Robustness

Material uncertainty MUST propagate into derived results where practical.

Outputs MAY use:

- intervals;
- ranges;
- sensitivity analysis;
- scenario bands;
- robustness labels;
- explicit unknowns.

A precise-looking point estimate MUST NOT hide highly uncertain inputs.

Quantitative probabilities/confidence MUST be calibrated/evaluated before production presentation.

---

# 18. Causal Inference Boundary

The platform MUST distinguish descriptive, predictive and causal analysis.

Association alone MUST NOT be narrated as causation.

Causal claims require an explicitly declared and reviewed causal design where applicable.

---

# 19. Decision Workspace UX

The shared Decision Workspace SHOULD support:

- Chat;
- Map;
- Data Layers;
- Filters;
- Evidence panel;
- Sources panel;
- Metric definitions;
- Scenario comparison;
- assumptions/unknowns;
- time slider;
- draw/select area;
- route/catchment tools;
- tables/charts;
- Decision Readiness;
- analysis history;
- saved Decision Projects;
- monitoring;
- export/share;
- Task Control handoff.

The workspace MUST remain usable on mobile/tablet.

Map is a decision surface, not the only interface.

---

# 20. Map / Geo Analysis Integration

Spec 265 sends analysis-ready geospatial outputs to Spec 262 using Spec 266 `GeoEvidenceFeature` contracts.

The map MAY render:

```text
POINT       businesses, factories, CCTV, sensors, comparable sales
LINE        roads, rivers, infrastructure corridors
ROUTE       candidate logistics/travel paths
POLYGON     zoning, catchment, flood history, service areas
RASTER      radar, imagery, modeled surfaces
HEATMAP     population/worker/competitor density
TIME LAYER  changing observations or market conditions
```

The map MUST preserve source/evidence metadata when users inspect a feature.

Selecting/drawing geometry MAY create or refine DataRequirements.

Example flow:

```text
User selects parcel
→ resolve canonical geometry through Spec 266
→ Decision Template requests evidence
→ Spec 266 resolves datasets/evidence
→ Spec 265 calculates scenarios
→ Spec 262 renders source + derived layers
```

---

# 21. Field Data Collection

Mobile users MAY capture:

- photos/video;
- GPS with explicit permission;
- road width/frontage;
- utility pole locations;
- site notes;
- quotations;
- scanned documents;
- observed foot traffic;
- market sales results.

Captured evidence SHALL be registered through Spec 266 evidence/provenance contracts.

Location MUST be purpose-scoped and permission-based.

---

# 22. Decision Memory and Re-analysis

A DecisionProject SHOULD retain:

- goal;
- constraints;
- evidence bindings;
- assumptions;
- scenarios;
- historical AnalysisRuns;
- decisions/notes;
- missing evidence;
- monitoring rules.

Historical outputs MUST remain reproducible according to the evidence capture class and MUST NOT silently change when source data changes.

---

# 23. Monitoring and Retention

Spec 265 owns the **decision condition** being watched and whether a change warrants a new AnalysisRun. It does not own a general source watch, geofence evaluator, scheduler, or notification dispatcher. A Decision Watch MAY subscribe to a Spec 266 Research Watch for missing/change-sensitive evidence or to a Spec 262 geospatial watch for map/hazard changes; each provider retains its own domain contract. Spec 265 receives versioned change events/references and requests re-analysis through canonical `worker_jobs`/outbox only after its materiality, budget, authorization, and deduplication checks pass. It MUST NOT poll providers or create a parallel watch schedule. A resulting AnalysisRun is new and immutable; prior runs remain unchanged.

Users MAY watch:

- geography;
- parcel/property;
- business category;
- competitor set;
- market/event;
- infrastructure project;
- metric threshold;
- source revision;
- assumption validity.

Monitoring MUST reuse canonical scheduling/job/notification infrastructure.

Required controls:

- materiality threshold;
- deduplication;
- cooldown/hysteresis;
- credit ceiling;
- premium source budget;
- maximum re-analysis rate;
- no notification when condition is not materially satisfied.

---

# 24. Mini App Integration

A Decision Mini App MAY package/reference:

- Decision Templates;
- FactorDefinitions;
- Decision Skills;
- DataRequirements;
- calculators;
- SPAAS-declared screens, forms, and bounded user interaction steps;
- canonical Skills and `worker_jobs` references for authorized actions;
- UI templates;
- monitoring policies;
- pricing/creator fee policy;
- reports;
- domain prompts/evals.

Provider independence is preferred.

Mini Apps MUST NOT package or invoke the retired custom workflow engine or define an independent execution runtime. Declarative screens and forms do not grant execution privileges; any asynchronous action MUST use the canonical job/outbox contract.

Preferred declaration:

```text
“I require property transaction evidence,
district-level coverage, freshness < 90 days.”
```

rather than:

```text
“Call Provider X endpoint Y.”
```

Spec 266 resolves eligible DataOffers using rights, ACL, geography, semantics, freshness, quality, availability, cost and policy.

Hard provider pinning is allowed only when materially necessary and must be explicit.

Mini Apps MUST use existing Workflow/Agent/Job authorities.

---

# 25. Decision Packs and Vertical Packs

Spec 265 owns:

## 25.1 Decision Pack

A versioned package of:

- Decision Templates;
- factor definitions;
- calculators;
- decision-specific evals;
- output schemas;
- UX bindings.

## 25.2 Vertical Pack

A Vertical Pack MAY compose:

```text
Spec 266 Data/Source/Metric Packs
+ Spec 265 Decision Pack
+ Skills
+ SPAAS Mini App/UI
```

Examples:

- Real Estate Intelligence;
- Local Business Site Selection;
- Market/Fair Intelligence;
- Logistics Site Selection;
- EV Charging Site Selection;
- Agriculture Processing Location.

Executable/package distribution MUST use SPAAS and existing marketplace governance.

---

# 26. Commercial Model

Decision Intelligence MAY charge for:

- deep analysis;
- scenario generation;
- deterministic financial modeling;
- Decision Pack creator fee;
- premium data acquisition through Spec 266;
- report generation;
- monitoring/re-analysis;
- external provider fees.

Billing MUST use canonical SmartAIHub credits/ledger/revenue-share infrastructure.

Execution receipts SHOULD distinguish:

```text
model cost
platform compute cost
data provider cost
creator decision fee
Mini App fee
external user-owned cost = known | estimated | unknown
```

The same cost MUST NOT be billed twice through nested execution.

Emergency/public-interest flows remain subject to Spec 260 policies and MUST NOT inherit commercial charging automatically.

---

# 27. BYOD and First-Party Outcome Data

BYOD connectivity, rights, storage and indexing are owned by Spec 266.

Spec 265 MAY use authorized user/tenant data in DecisionProjects.

Examples:

- sales history;
- inventory;
- CRM export;
- property leads;
- quotation history;
- private GIS;
- project cost history.

With appropriate permission, Decision Intelligence MAY collect structured outcomes such as:

- sold/not sold;
- actual sale range;
- time-to-sale;
- market stall sales;
- campaign lead count;
- business-location result;
- actual project cost;
- user-confirmed observations.

Outcome data MUST distinguish:

```text
reported
observed
verified
inferred
```

Cross-tenant learning is disabled unless explicitly authorized and privacy-governed.

---

# 28. Real Estate Starter Vertical

The land feasibility template SHOULD evaluate where available:

- legal/land identity;
- usable geometry/frontage;
- access roads;
- planning/zoning;
- flood/environmental constraints;
- utilities;
- site preparation/fill;
- comparable listings;
- transaction evidence;
- housing supply;
- absorption/time-on-market proxies;
- demographic/workforce/student catchment;
- POI/infrastructure;
- planned transport/infrastructure;
- subdivision losses/roads/drainage;
- construction cost;
- holding/finance/tax cost;
- buyer-demand evidence;
- scenario sensitivity.

Starter scenarios:

- sell as-is;
- subdivide and sell;
- improve utilities/land then subdivide;
- build one-storey product;
- build two-storey product;
- hold/lease where applicable.

The system MUST NOT claim a scenario will sell without evidence.

---

# 29. Local Business and Site Selection Starter Vertical

Potential evidence/factors include:

- residents;
- workers;
- students;
- traffic/access;
- public transport;
- POIs;
- competitor density;
- business registrations;
- rent/property cost;
- delivery/service coverage;
- local events;
- user sales;
- seasonality;
- parking/accessibility.

Promotion/media processes MAY be invoked after analysis but MUST remain separate from analytical truth.

---

# 30. Market/Fair Intelligence Starter Vertical

Potential inputs:

- market schedule;
- stall fee;
- vendor/category mix;
- competitor vendors;
- catchment;
- worker/student/resident concentration;
- access/parking;
- weather/season;
- events;
- travel cost;
- merchant historical sales;
- footfall evidence.

Merchant feedback MAY improve private/personal future recommendations when permitted.

---

# 31. Future Vertical Extensibility

Future Decision Packs MAY include:

- logistics;
- EV charging;
- agriculture;
- tourism;
- healthcare service coverage;
- urban planning;
- education location analysis;
- franchise expansion;
- warehouse selection;
- B2B industrial intelligence;
- energy/solar feasibility;
- environmental compliance support.

New verticals SHOULD add templates, factors, calculators and UI rather than fork the core platform.

---

# 32. API / MCP / Skill Surface

Spec 265 MAY request research through Spec 266 but MUST NOT expose a duplicate research-provider API. Logical decision-facing calls MAY include:

```text
decision.plan_research
decision.request_missing_evidence_research
decision.list_research_receipts
```

These resolve to canonical `research.*` capabilities owned by Spec 266.


Spec 265 owns logical capabilities such as:

```text
decision.project.create
decision.project.get
decision.template.resolve
decision.plan_evidence
decision.run_analysis
decision.compare_scenarios
decision.list_missing_evidence
decision.reanalyze
decision.explain_claim

decision.watch.create
decision.watch.evaluate
decision.watch.list_changes
```

The following are NOT owned by Spec 265 and SHALL resolve through Spec 266:

```text
data.source.*
data.dataset.*
data.requirement.resolve
data.lineage.*
evidence.*
semantic.*
geo.* shared spatial primitives
```

External callers MUST receive only authorized information/actions.

---

# 33. Decision Readiness

The UI MAY display Decision Readiness using explicit template rules.

Example:

```text
Decision Readiness: Partial
Required factors covered: 9/14
Critical missing:
- electricity quotation
- soil condition
- recent transactions
```

Readiness MUST NOT be an unexplained LLM confidence percentage.

Inputs MAY include:

- required factor coverage;
- evidence freshness;
- evidence quality;
- unresolved conflicts;
- critical field verification;
- uncertainty;
- jurisdiction validation.

---

# 34. Explainability

Users SHOULD be able to ask:

- Why is this factor included?
- Where did this number come from?
- What formula produced this metric?
- Why did Scenario B change?
- What changed since the previous run?
- Which missing fact would change the result most?

Answers SHOULD use stored AnalysisRun metadata and Spec 266 lineage, not reconstructed fictional explanations.

---

# 35. Professional / Regulated Boundary

For legal, engineering, valuation, tax, medical or regulated certification contexts, Decision Intelligence SHOULD identify required professional verification.

The system MUST distinguish:

```text
informational estimate
professional appraisal
binding quotation
official government value
certified engineering/legal determination
```

An AI estimate MUST NOT be labeled as an official or certified determination.

---

# 36. Protected-Class and Sensitive-Attribute Guardrails

Decision Templates, especially housing/site/location products, MUST NOT use protected or highly sensitive personal attributes for unlawful steering, discriminatory exclusion or proxy discrimination.

Relevant data access and analysis SHALL follow applicable law and platform policy.

Location-level analysis MUST not infer protected personal traits from neighborhood-level statistics without a legitimate, policy-compliant need.

---

# 37. External Side-Effect Boundary

A recommendation is not execution authority.

Actions such as:

- buying/selling;
- publishing;
- contacting leads;
- placing ads;
- sending messages;
- placing orders;
- modifying external systems;

must use canonical approval/action authorities.

Spec 265 MUST NOT bypass them.

---

# 38. Reports and Exports

A DecisionRun MAY generate:

- interactive report;
- PDF/document report;
- map snapshot;
- CSV/XLSX export where permitted;
- scenario comparison;
- evidence appendix;
- lineage/source appendix;
- tenant-branded report.

Export-time data rights checks MUST be delegated to Spec 266.

Exports MUST preserve material assumptions, provenance and limitations.

White-label branding MUST NOT remove required source attribution.

---

# 39. Collaboration and Sharing

Sharing a DecisionProject MUST NOT grant access to premium/private evidence the recipient is not entitled to access.

Possible behavior:

- re-authorize source access;
- show allowed derived result only;
- redact source details;
- require recipient entitlement;
- recompute using eligible sources.

Shared decisions MUST preserve AnalysisRun identity and provenance.

---

# 40. Jurisdiction and Rule Versioning

Jurisdiction-sensitive calculators/templates MUST pin:

- jurisdiction;
- rule/version;
- effective date;
- source references;
- applicable assumptions.

Rules from one jurisdiction MUST NOT silently be reused in another.

---

# 41. Cost-Aware Progressive Analysis

Decision analysis SHOULD prefer progressive evidence acquisition.

Conceptual order:

```text
free/low-cost evidence
→ evaluate sufficiency
→ targeted moderate-cost evidence
→ evaluate expected decision value
→ premium evidence only when materially useful/authorized
```

The system MAY stop once evidence is sufficient for the chosen depth.

Premium data MUST NOT be queried merely because it exists.

---

# 42. Observability

Decision-layer telemetry SHOULD include:

- template resolution;
- Evidence Plan creation;
- DataRequirement count;
- missing-evidence count;
- analysis duration/status;
- calculator failures;
- scenario count;
- uncertainty state;
- decision readiness;
- monitoring evaluations;
- credit settlement;
- Decision Mini App runs;
- conversion/repeat use;
- outcome capture.

Data-source health/freshness telemetry belongs to Spec 266.

Sensitive inputs MUST not be copied into logs unnecessarily.

---

# 43. Product Analytics

Per vertical, measure where permitted:

- unique/repeat users;
- DecisionProjects created;
- analysis completion;
- paid conversion;
- median credits/run;
- save-to-monitor conversion;
- monitor re-entry;
- evidence-gap completion;
- repeat Mini App use;
- creator revenue;
- time from question to usable decision output;
- user-confirmed outcomes.

Verticals with low real usage SHOULD be de-prioritized rather than defended by internal assumptions.

---

# 44. Evaluation Framework

Decision Templates SHOULD have evals covering:

1. intent/template resolution;
2. factor completeness;
3. DataRequirement correctness;
4. calculation correctness;
5. unit correctness;
6. geography/time semantics;
7. missing-data behavior;
8. conflict handling;
9. hallucination resistance;
10. lineage completeness;
11. uncertainty handling;
12. proxy validity;
13. scoring transparency;
14. causal-language safety;
15. billing correctness;
16. UI clarity;
17. mobile usability;
18. external-side-effect approval behavior.

---

# 45. Test Fixtures

Decision-layer fixtures SHOULD cover:

- complete evidence;
- missing critical evidence;
- stale evidence;
- conflicting evidence;
- sparse rural area;
- dense urban area;
- ambiguous entity match;
- wrong unit;
- boundary revision;
- premium source unavailable;
- uncertain input propagation;
- biased/non-representative sample;
- template version change;
- jurisdiction change;
- repeated Watch trigger;
- external action requiring approval.

Source/adapter security fixtures are owned by Spec 266.

---

# 46. Versioning

The following MUST be versioned independently:

- DecisionTemplate;
- FactorDefinition;
- calculator;
- scenario method;
- scoring/weight policy;
- confidence/readiness policy;
- Decision Pack;
- UI schema/template;
- analysis method.

Shared data/semantic source versions are pinned through Spec 266 references.

Historical AnalysisRuns MUST retain the exact versions used.

---

# 47. Creator Publication Pipeline

```text
DEFINE DOMAIN / INTENT
  → SELECT / CREATE DECISION TEMPLATE
  → DECLARE DATA REQUIREMENTS
  → OPTIONAL: SELECT SPEC 266 DATA/METRIC PACKS
  → DEFINE CALCULATORS / ANALYSIS STEPS
  → GENERATE / EDIT UI THROUGH EXISTING BUILDER
  → TEST WITH FIXTURES
  → RUN QUALITY / RIGHTS / SECURITY / BILLING CHECKS
  → PACKAGE VIA SPAAS
  → PUBLISH
  → MONITOR USAGE / OUTCOMES
  → RELEASE NEW VERSION
```

A creator MUST NOT be forced to build a custom frontend when shared components suffice.

---

# 48. Implementation Packages

Recommended logical packages/interfaces:

```text
@smartaihub/decision-core
@smartaihub/decision-templates
@smartaihub/decision-evidence-planner
@smartaihub/decision-scenarios
@smartaihub/decision-calculators
@smartaihub/decision-watch
@smartaihub/decision-ui
```

Spec 265 SHALL NOT own packages such as:

```text
@smartaihub/data-source-registry
@smartaihub/data-semantics
@smartaihub/evidence-lineage
@smartaihub/geo-core
```

Those belong to Spec 266.

---

# 49. Migration from Spec 265 R1.1

## 49.1 Ownership Transfer to Spec 266

The following R1.1 sections/concerns move to canonical Spec 266 ownership:

```text
DataSourceDefinition / DataOffer infrastructure
Extensible Data Source Registry
Data Rights / Licensing
Evidence Provenance shared contracts
Trust / Quality / Freshness shared model
Semantic Data Layer shared registry
Geographic Entity Resolution foundation
Shared Spatial Intelligence Engine
Temporal data semantics foundation
Data Resolution Policy
Source Conflict Handling
Caching / Materialization
Storage Strategy for shared data
source credentials / source tenant isolation
Source Contract / Schema / Methodology Drift
Evidence Capture / Reproducibility Classes
Untrusted Connector/Retrieval Security
Semantic Registry Evolution
General Entity Resolution
Data/Metric Pack supply-chain governance
source/rights/export controls
```

Decision-specific use of these capabilities remains in Spec 265.

## 49.2 Compatibility

Existing R1.1 code MAY temporarily expose prior types through aliases/adapters.

Example:

```ts
// compatibility only
export type LegacyDecisionDataSourceDefinition = Spec266DataSourceDefinition;
```

No new code SHOULD persist to a separate R1.1 data registry after Spec 266 activation.

## 49.3 No Destructive Migration by Default

If prototype tables already exist, migration SHALL:

1. inventory real usage;
2. map rows to Spec 266 canonical IDs;
3. dual-read/compatibility-test if necessary;
4. prevent new divergent writes;
5. migrate/reconcile;
6. remove old write authority only after verification.

---

# 50. Implementation Phases

## Phase A — Spec 266 Integration

- adopt canonical DataRequirement/DataOffer;
- use Spec 266 Evidence/Lineage;
- use Spec 266 semantic/geo/time contracts;
- remove duplicate source/rights ownership;
- compatibility tests with 260/262.

## Phase B — Decision Engine

- DecisionProject/Question/Template;
- Evidence Planner;
- Missing-Evidence Planner;
- scenario/calculator engine;
- AnalysisRun;
- Claim/explainability;
- Chat integration.

## Phase C — Workspace and Mini Apps

- Decision Workspace;
- Spec 262 map bindings;
- generated UI reuse;
- SPAAS packaging;
- marketplace Decision Pack support.

## Phase D — Commercial Pilots

Pilot at least:

1. Real Estate / Land Feasibility;
2. Local Business / Site Selection;
3. Market/Fair / Merchant Intelligence.

## Phase E — Monitoring / Retention

- WatchDefinitions;
- materiality/dedup;
- scheduled re-analysis;
- notification;
- outcome feedback.

## Phase F — Ecosystem

- partner/creator Decision Packs;
- vertical composition;
- creator economics;
- measured rollout and kill switches.

---

# 51. Acceptance Criteria

Implementation is incomplete unless applicable criteria pass.

## 51.1 Architecture

1. Spec 265 does not own a second Data Source Registry.
2. Spec 265 does not own a second rights/provenance/source-health system.
3. Spec 265 uses Spec 266 DataRequirement/DataOffer contracts.
4. Spec 262 remains the map renderer.
5. Chat and Task Control remain canonical.
6. Existing job/billing/permission authorities are reused.

## 51.2 Decision Planning

7. A vague user question resolves to candidate Decision Templates.
8. Evidence Plan is produced before materially expensive analysis where appropriate.
9. Required/optional evidence are distinguishable.
10. Missing critical evidence is surfaced.
11. Field/professional evidence requirements can create Task Control tasks.
12. LLM does not fabricate required missing values.

## 51.3 Data/Evidence Binding

13. Semantic DataRequirements resolve through Spec 266.
14. Provider-independent templates can switch eligible DataOffers without code modification.
15. Evidence bindings retain lineage.
16. Conflicting evidence remains visible when material.
17. Stale/low-quality evidence influences wording/readiness.
18. Historical runs pin evidence/source revisions/receipts.

## 51.3A Research Enrichment

19A. Missing evidence can produce a `ResearchNeed` without hard-coding a provider.
19B. Spec 265 delegates research execution/provider selection to Spec 266.
19C. Research-agent narrative cannot enter a DecisionRun as admitted evidence without a Spec 266 admission state.
19D. Multiple agent answers based on one root source do not increase independent corroboration.
19E. Material research-derived evidence pins ResearchRun and admission/corroboration receipts in AnalysisRun.
19F. High-stakes templates can require stricter admission/official/professional verification.
19G. Research spend is included in the DecisionRun budget.
19H. Incomplete research leaves an explicit evidence gap.
19I. Research watches create new evidence/runs and do not rewrite history.
19J. `ResearchNeed` maps through one server-side, versioned adapter to Spec 266 `ResearchRequest`; identity, tenant/public scope, provider restrictions, budget, privacy/rights policy, and output policy are server-derived or validated.
19K. Missing scope/policy, an unavailable Spec 266 contract, or an unapproved runtime blocks dispatch and leaves an explicit recoverable evidence gap.
19L. Asynchronous research uses canonical `worker_jobs`/outbox admission and returns canonical request/job/run references; retries do not duplicate requests or ResearchRuns.
19M. Decision Watches consume versioned Spec 266/262 change references but do not own their schedulers, geofence evaluators, or notification dispatchers.
19N. A Spec 266 `ResearchWatchChangeNotice` is reauthorized and deduplicated before it may schedule analysis; receipt of a notice alone does not notify the user or create side effects.

## 51.4 Calculation / Scenario

19. Derived metrics are reproducible.
20. Units/geography/time semantics are preserved.
21. Listing and transaction price remain distinct.
22. Proxy values are labeled.
23. Scenario assumptions are explicit.
24. Sensitivity analysis can vary material assumptions.
25. MCDA exposes criteria/weights/normalization.
26. Uncertain inputs propagate to results or sensitivity ranges.
27. Correlation is not presented as causal without reviewed methodology.

## 51.5 UX

28. Map can show source and derived GeoEvidenceFeatures.
28A. Map functionality is enabled only for Spec 262 capabilities that have passed their dependency and verification gates; a MapLibre renderer alone cannot satisfy the broader map interaction acceptance criteria.
29. User can inspect source/evidence from a material feature/claim.
30. Decision Workspace works on mobile/tablet.
31. Data/Decision Readiness is explainable.
32. History preserves previous AnalysisRuns.
33. Sharing does not leak private/premium evidence.

## 51.6 Mini Apps / Marketplace

34. A Decision Mini App declares DataRequirements rather than hard-coded providers where feasible.
34A. A Mini App can declare screens/forms/interaction steps and reference approved Skills/jobs without invoking a separate workflow engine or runtime.
35. Decision Packs are versioned and testable.
36. Data/Metric Packs resolve through Spec 266.
37. Creator fees use canonical billing.
38. Installation does not grant user-private data automatically.
39. Pack/template kill switches and rollback exist.

## 51.7 Monitoring / Outcomes

40. Watches use materiality/dedupe/budget controls.
41. Re-analysis creates a new AnalysisRun rather than rewriting history.
42. Outcome data preserves reported/observed/verified/inferred status.
43. Cross-tenant outcome learning is disabled unless authorized.

## 51.8 Professional / Safety

44. AI estimate is not labeled as certified appraisal/approval.
45. Protected-class discriminatory use is blocked/guarded.
46. External side effects require canonical authority/approval.
47. Jurisdiction-sensitive rules pin jurisdiction/version/effective date.

---

# 52. Hard Non-Goals

Spec 265 does NOT:

- own or directly control external research-agent provider connections;
- let research agents write canonical source/evidence truth;
- create a second research index/admission gate outside Spec 266;

- become a data warehouse;
- own every external dataset;
- own Vectorize/search indexes;
- create a second source registry;
- create a second rights/provenance engine;
- create a second map renderer;
- create a second workflow/job system;
- create a second payment ledger;
- create a second Chat/Task authority;
- become emergency incident authority;
- guarantee investment/business outcomes;
- replace certified professionals;
- build every vertical itself;
- force every Mini App onto one provider.

---

# 53. Production Definition of Done

The first production slice MUST NOT be promoted until:

1. Spec 266 canonical contracts are implemented or stable enough for the pilot;
2. no duplicate data/source authority remains in new Spec 265 code;
3. DecisionProject/Template/AnalysisRun persistence is implemented;
4. Evidence Planner + Missing-Evidence Planner work end-to-end;
5. one complete Decision Template resolves semantic DataRequirements through Spec 266;
6. calculator/lineage/explainability tests pass;
7. map rendering uses Spec 262;
8. Mini App packaging uses SPAAS;
9. tenant/privacy/billing rules pass;
10. Watch path has dedupe/materiality/budget ceilings;
11. one missing-evidence `ResearchNeed` delegates provider-neutrally to Spec 266 and returns a ResearchRun receipt;
12. one AnalysisRun pins material research/admission/corroboration receipts;
13. incomplete/unadmitted research remains an explicit evidence gap;
14. source/template/feature rollback exists;
15. a monitored pilot records real utility, repeat use, cost and outcome evidence.

---

# 54. Canonical Product Principle

> **SmartAIHub Decision Intelligence does not need every answer in advance. It needs a reusable method to define a decision, identify the required evidence, obtain that evidence through Spec 266, calculate reproducibly, expose uncertainty, compare alternatives, and let Skills, Mini Apps and domain experts extend the method into new markets.**

---

## 54A. Research-Enrichment Alignment Review — 8 Additional Passes

| Pass | Concern | Design outcome |
|---|---|---|
| DIR-01 | Decision layer calls providers directly | CLOSED — provider-neutral `ResearchNeed` delegates to Spec 266 |
| DIR-02 | Agent answer treated as evidence | CLOSED — Spec 266 admission required |
| DIR-03 | Multi-agent false corroboration | CLOSED — root-source/dependency receipt consumed |
| DIR-04 | Research cost bypasses budget | CLOSED — research spend belongs to EvidencePlan/AnalysisRun budget |
| DIR-05 | Research rewrites historical decision | CLOSED — new ResearchRun/new AnalysisRun only |
| DIR-06 | High-stakes weak evidence | CLOSED — template may require stronger admission/official/pro verification |
| DIR-07 | Decision-specific crawler duplication | CLOSED — monitoring delegates research/revalidation to Spec 266 |
| DIR-08 | Research provider lock-in | CLOSED — provider selection remains Spec 266 responsibility |

---

## Appendix A — Ownership Summary

| Capability | Canonical owner |
|---|---|
| External source registry/catalog | Spec 266 |
| Rights/provenance/freshness | Spec 266 |
| Semantic types/metric definitions | Spec 266 |
| Spatial/temporal data primitives | Spec 266 |
| Vector/search projection | Spec 266 / canonical Retrieval infrastructure |
| Decision Templates | Spec 265 |
| Evidence/Missing-Evidence planning | Spec 265 |
| Scenario comparison | Spec 265 |
| Decision calculators | Spec 265 |
| Decision monitoring | Spec 265 + canonical scheduler |
| Emergency response/incident truth | Spec 260 |
| MapLibre visualization | Spec 262 |
| Mini App package | Spec 261 SPAAS |
| Jobs/orchestration | existing canonical runtime |
| Chat | SmartAIHub Chat |
| Task execution UI | Task Control |

## Appendix B — Compatibility Rule

If any earlier Spec 265 R1.1 statement conflicts with this document about ownership of shared data/evidence infrastructure, **Spec 265 R2.1 + Spec 266 take precedence** while preserving historical AnalysisRun interpretation and upstream contracts. Implementation availability is governed by §0.1 and the applicable dependency gates.
