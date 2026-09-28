---
working_spec_id: 244
numbering_status: "PROVISIONAL / NUMBERING HOLD — verify canonical registry, default branch, open PRs and all active worktrees. A separate earlier 3D candidate was also suggested as 244; never overwrite or merge on collision. Allocate next free ID if occupied."
title: "SmartAIHub Continuous Research & Adaptive Solution Orchestration"
subtitle: "Living Research, Goal Revision, Multi-Path Solution Branching and Chat/Mini Chat Feedback Loops"
revision: "DRAFT R13 — 156-pass cumulative design audit (R13 145–156 added to verified R12 baseline)"
date: 2026-09-25
status: "PROPOSED / ADDITIVE SPECIFICATION / NOT IMPLEMENTED / NOT PRODUCTION-CERTIFIED / R13 HARDENED"
risk: "HIGH — internet data, cross-project privacy, autonomous tools, paid side effects, consequential domain decisions"
implementation_boundary: "Specs 1–213 frozen; Spec 224 in progress unchanged; new functionality through additive versioned contracts."
primary_existing_owners:
  goal_and_chat: "Feature 196 via Spec 226"
  project_knowledge_goals_and_decisions: "Spec 233"
  project_memory_governance: "Spec 241, where active/verified"
  retrieval: "Spec 229; Cloudflare Vectorize as semantic index"
  privacy_authorization: "Spec 220"
  workflow_runtime: "Spec 215"
  physical_jobs: "Feature 186/195 worker_jobs"
  self_improving_replay: "Spec 222, advisory only"
  product_definition: "Spec 217"
  generated_ui_and_mini_chat: "Spec 240, subject to canonical registry/revision verification"
  autonomous_development: "Spec 224 via separately gated Spec 235"
  financial_truth: "Spec 207"
  asset_storage: "R2 / Library"
  relational_truth: "PostgreSQL"
---

# Spec 244 [PROVISIONAL] — Continuous Research & Adaptive Solution Orchestration

> **Purpose:** Make SmartAIHub a domain-agnostic, goal-driven collaborator that can research small questions at any point, merge new evidence with prior project knowledge, propose multiple feasible approaches, execute approved experiments with interchangeable Skills/Models/Harnesses, display artifacts through Chat/Mini Chat/Mini Apps, accept changing user intentions, and repeat until the user elects to accept, pause, or terminate a project. First results are provisional, not an irreversible plan.
>
> **Numbering caution:** 244 is the working number requested during this discussion, NOT a registered or guaranteed free ID. Earlier discussion also proposed 244 for AI 3D. Before repository admission, resolve conflict against the actual SmartSpecPro registry/main/PR/worktrees. A detected collision **stops registration**, not content drafting.
>
> **Evidence caution:** Referenced SmartAIHub spec snapshots are architecture/design materials; they do not establish live implementation readiness. No source repository, deployed schema, provider API or production feature was certified in this drafting session.

## 0. Executive design decisions

1. **Research is a callable capability, not a one-off opening stage.** A question, user revision, failed tool result, new asset, missing specification, changed price, unexpected test or stale evidence may start a scoped sub-research task at any point in the lifecycle.
2. **User intent can evolve.** Distinguish *stable goal*, *current preferences*, *hard constraints*, *provisional assumptions*, *new evidence*, and *approved decisions*. User dissatisfaction and changed requirements are expected events, not generic workflow errors.
3. **One project can own many parallel or sequential solution branches.** Branches preserve reusable work, show trade-offs and allow partial merging; no branch is quietly promoted to the user's approved path.
4. **Chat and Mini Chat are first-class project interaction surfaces.** Both can view authorized existing outcomes, refer to exact artifact/research/branch revisions, request additional research, provide feedback and request a new experimental branch; neither acquires broader project, tenant or external-harness permissions by embedding a chat widget.
5. **Provider-independent research and output strategies.** GPT Researcher, STORM/Co-STORM, GraphRAG, autoresearch, browsing, product sources, manuals, user uploads, external agents and future research engines are optional adapters behind common evidence and execution contracts. Same principle for image, video, procedural 3D, mesh, 2.5D, BIM, simulation, code and document deliverables.
6. **Structured evidence, not accumulated summaries, is the basis of decisions.** Every material claim traces to authorized source/revision/location, observation time, applicability and conflict status. A summary or model answer is not a new independent source.
7. **No parallel platform authority.** Existing Feature 196/Kernel/Spec 215/`worker_jobs`, Spec 220, Spec 207, Spec 229, Spec 233, Spec 241 and Spec 224 retain their respective owners. This spec owns only the additive research/alternative-planning contracts and scoped projections where no existing equivalent exists.
8. **No forced terminal result.** A user may approve a phase, defer a decision, reopen an accepted branch after new evidence, or change the original goal. Completion is explicit and scoped to an approved deliverable/revision, not an AI judgment that the user must be satisfied.
9. **Start with bounded, useful work.** Reuse existing APIs and models first; do not wait for a perfect 3D engine, an exhaustive web crawl, a complete industry knowledge graph or a cloud migration before shipping read-only research and artifact review slices.
10. **Requirements are discovered through interaction with results.** The system SHALL assume that users may be unable to state stable preferences, constraints or acceptance criteria before seeing concrete alternatives. Generated artifacts, comparisons, simulations and prototypes are legitimate requirement-elicitation instruments; feedback on them creates new typed evidence about user intent rather than being treated only as cosmetic edit instructions.
11. **Research and execution form a reversible hypothesis loop.** A selected solution is a current hypothesis under current evidence, not permanent truth. New evidence, failed experiments, changed user intent or a superior alternative MAY reopen research without destroying reusable prior work.
12. **Do not optimize for one final answer.** Optimize for traceable progress toward an accepted outcome: multiple viable routes, explicit unknowns, reversible decisions, bounded cost, and the ability to re-enter research from any artifact or decision.

## 1. The product problem and measurable outcome

### 1.1 The failure mode

A single research pass tends to optimize for a polished answer before the real task is understood. Users often do not know the relevant questions, solution options or preferences until seeing alternatives. Product information may be fragmented across a maker's technical manual, multiple merchants, logistics providers and user measurements. Technical problems may have several valid solutions; a chosen tool or product may later fail constraints or become unavailable. A 3D-first or image-first engine is equally inappropriate if selected before understanding the user's deliverable.

### 1.2 Core user promise

> "Tell SmartAIHub what you are trying to achieve. Explore options, inspect evidence and real artifacts, change your mind, ask for more research, switch approaches, and keep the useful work."

**Success measures (candidate design metrics, not promised performance):**
- % of user revisions successfully translated into a correctly scoped goal/constraint update;
- evidence-supported claim rate and contradiction detection on curated ground-truth sets;
- reuse of unaffected evidence, assets and approved decisions after revision;
- alternative breadth *with feasibility*, avoiding superficial near-duplicates;
- cost per accepted outcome, research cost per resolved question and time to first reviewable result;
- user ability to identify *why* a proposal was made and *what changes* when choosing another;
- zero unauthorized retrieval, external effect or cross-scope evidence leak; zero silently duplicated paid job on retry.

## 2. Scope and non-goals

**In scope:** project-bound continuous research; targeted child research; source and claim fusion; entity/variant/offer disambiguation; multi-perspective discovery; iterative hypothesis–experiment–evaluate cycles; goal, constraint, preference and decision revisions; alternative branch discovery/comparison/merge; impact-aware re-evaluation; staged outcomes; Chat/Mini Chat interactions; approved Workflow/Skill/Model/Harness selection; multimodal outputs; explainable costs/unknowns; safe handoff to product/development paths; audit/evaluation and bounded automatic follow-up.

**Out of scope:** building a second general-purpose RAG/vector store, replacing the current Agent/Workflow/kernel, introducing another physical job ledger, granting web scrapers blanket site access, guaranteeing information completeness or commercial availability, automatic financial purchase/physical construction approvals, automating regulated professional sign-off, promising exact spatial dimensions from a generated image, or rewriting frozen and active specs.

**Not tied to a vertical:** interior, retail, engineering, scientific research, software development, video and films are acceptance examples. Core API and storage MUST NOT contain mandatory interior/TV/3D fields.

## 3. Canonical ownership and non-duplication

| Responsibility | Existing canonical authority | Additive responsibility here |
|---|---|---|
| User intent, conversational Tool resolution | Feature 196, bridged via 226 | Research/branch/feedback intents as typed commands and read-only projections |
| Long-lived goal, project state, finding, decision | Spec 233; Spec 241 scope/memory rules | Typed goal revisions, research lineage and branch-specific decision dependencies *under* existing project state |
| Search, RAG, index security | Spec 229, Vectorize | Scoped research plans, source normalization, claim fusion; invoke broker, do not clone it |
| Files and media | Existing Library and R2 | Content-addressed research bundles and artifact lineage |
| ACL, grants, source access, egress | Spec 220 | Recheck policy at task admission, source read, provider/tool send, merge and artifact reveal |
| Logical workflow | Spec 215; shared Kernel | Research planning as nested logical activities through existing typed interfaces |
| Physical jobs, retry/fencing | Feature 186/195 `worker_jobs` | Idempotent research/tool job families, correlation to research and branch revisions |
| Budget, credits, reserves | Spec 207 | Research budget quotes, ceilings and usage attribution (not new billing ledger) |
| Skill/tool/harness engineering | Specs 199/200/206/221/230/231/242/243 as certified | Discover capability/version/scope; select tools; do not duplicate Agent registries |
| Mini App/Product and generated UI | Specs 216/217/218/219/240 (verified revisions) | Scoped review, compare, research and revision affordances; no Mini Chat shadow database |
| Offline replay and strategy optimization | Spec 222 | Emit redacted and consented evaluation evidence; advisory policy candidates only |
| Development of new software | Spec 224 via independently gated Spec 235 | Approved, versioned, provenance-carrying proposal; never bypass 224 admission/finality |
| Notifications, incident management | Existing Spec 228/238 | Normalized events with user attention and budget policy; not separate alert authority |

**Implementation preflight:** inspect actual repository registrations, schema/migrations, deployed Feature 196/226 and Spec 240 interfaces, open PRs/worktrees, approval boundaries, job family routes and available providers. All unverified contracts below are *proposals*, not declarations of deployed APIs.

## 4. Core object model

All entities carry `tenant_id`, `project_id`, `created_by`, policy revision/epoch and immutable version IDs where appropriate. Reject cross-tenant and out-of-scope references server-side. Keep dense canonical rows in PostgreSQL and larger source/execution/artifact bodies in R2; Vectorize is a rebuildable search projection only.

### 4.1 Types (illustrative TypeScript contract)

```ts
type RevisionId = string;
type ResearchStatus =
  | 'PROPOSED' | 'AUTHORIZED' | 'QUEUED' | 'RUNNING' | 'WAITING_INPUT'
  | 'WAITING_EXTERNAL' | 'EVIDENCE_REVIEW' | 'MERGED' | 'PARTIAL'
  | 'BLOCKED' | 'PAUSED' | 'PARTIAL_READY' | 'COMPLETED' | 'FAILED'
  | 'CANCEL_REQUESTED' | 'CANCELLED' | 'SUPERSEDED';
type BranchStatus =
  | 'DRAFT' | 'RESEARCHING' | 'READY_TO_TEST' | 'TESTING'
  | 'AWAITING_USER' | 'CONDITIONALLY_FEASIBLE' | 'FEASIBLE'
  | 'REJECTED' | 'PARKED' | 'SELECTED' | 'ARCHIVED' | 'SUPERSEDED';
type ClaimStatus =
  | 'UNVERIFIED' | 'CORROBORATED' | 'CONFLICTED' | 'EXPIRED'
  | 'RETRACTED' | 'DISPROVEN' | 'UNDETERMINED';

type Constraint = {
  id: string;
  class: 'HARD' | 'SOFT' | 'PREFERENCE' | 'ASSUMPTION';
  expression: unknown; // typed by domain adapter; no LLM prose as executable rule
  unit?: string;
  origin: 'USER' | 'MEASUREMENT' | 'SOURCE' | 'EXPERT' | 'INFERRED';
  verifiedAt?: string;
  evidenceRefs: string[];
  approvalReceiptRef?: string;
};

type GoalRevision = {
  goalId: string;
  revisionId: RevisionId;
  parentRevisionId?: RevisionId;
  projectId: string;
  desiredOutcome: string;
  userConfirmedRequirements: string[];
  unconfirmedInterpretations: string[];
  constraints: Constraint[];
  approvalScope: string[];
  changeReason: string;
  createdAt: string;
};

type ResearchTask = {
  taskId: string;
  projectId: string;
  goalRevisionId: RevisionId;
  branchId?: string;
  parentTaskId?: string;
  question: string;
  hypotheses: string[];
  expectedEvidence: string[];
  sourceScopeRef: string; // scoped grant, not arbitrary cross-project IDs
  strategyProfileRef: string;
  depthLimit: number;
  costCeilingRef: string;
  stopCriteria: string[]; // legacy readable descriptions; executable gates use versioned DecisionReadinessOracle refs
  readinessOracleRef?: string;
  status: ResearchStatus;
  outputBundleRef?: string;
};

type EvidenceClaim = {
  claimId: string;
  subjectId: string; // canonical entity (product, process, standard, provider, etc.)
  predicate: string;
  value: unknown;
  unit?: string;
  applicability: Record<string, string>; // locale, variant, revision, etc.
  sourceRefs: Array<{sourceId: string; version: string; locator: string}>;
  sourceIndependenceGroupIds: string[];
  observedAt: string;
  validFrom?: string;
  expiresAt?: string;
  status: ClaimStatus;
  conflictRefs: string[];
  extractionMethod: string;
  reviewerRef?: string;
};

type SolutionBranch = {
  branchId: string;
  goalRevisionId: RevisionId;
  parentBranchIds: string[];
  hypothesis: string;
  strategy: string;
  constraintsSnapshotRef: string;
  evidenceBundleRefs: string[];
  selectedCapabilityRefs: string[];
  experimentRefs: string[];
  artifactVersionRefs: string[];
  evaluationRefs: string[];
  status: BranchStatus;
  selectionReceiptRef?: string;
};

type FeedbackIntent = {
  messageRef: string;
  reviewedArtifactVersionRefs: string[];
  targetGoalRevisionId: RevisionId;
  targetBranchIds: string[];
  class: 'ASK'|'DEEPEN_RESEARCH'|'WHAT_IF'|'CORRECT_FACT'|'REJECT_RESULT'|
         'CHANGE_PREFERENCE'|'CHANGE_CONSTRAINT'|'CHANGE_GOAL'|
         'TRY_ALTERNATIVE'|'COMPARE'|'MERGE_BRANCHES'|'SELECT_BRANCH'|
         'ACCEPT_PHASE'|'PAUSE'|'RESUME'|'REOPEN'|'REQUEST_EFFECT';
  commandEnvelopeRef?: string; // validated discriminated payload and authorization
  interpretedChange: unknown;
  requiresConfirmation: boolean;
};
```

### 4.2 Product-specific example must not leak into core schema

A product entity may have many merchant **Offer** records, one or more manufacturer specs, shipping-service quotes, SKU/GTIN and variant identifiers. Match sources to exact revision/market/size/model; never conflate models with similar titles, merge a merchant offer into manufacturer specification, or infer availability from an old listing. External adapters may supply more detailed domain schemas, but the core research task only consumes typed claims, constraints and provenance.

### 4.3 Canonical data vs projections

- **Canonical project knowledge:** use Spec 233 Project IDs, Goal/Decision/Finding/Experiment authorities; extend via versioned additive tables or JSON schemas only when no existing fields meet requirements. No forked project-memory service.
- **Research lineage:** minimal additional `research_tasks`, `research_source_snapshots`, `evidence_claims`, `evidence_conflicts`, `branch_edges`, `evaluation_refs`, `artifact_dependencies`, `research_outbox` as **proposed logical entities**. The actual DDL MUST be reconciled with deployed migrations before adding tables. Prefer reuse/extension where canonical entities already exist.
- **Large documents:** original licensed/authorized content or admissible derived metadata in R2, with hashes, retention and takedown hooks; do not wholesale mirror protected content solely because it appeared in search results.
- **Graph:** small direct dependency edges in PostgreSQL; optional derived larger knowledge graph and graph/global summaries in R2 + Vectorize indexes when volume/evaluation justifies it. GraphRAG optional job, never a new ACL or business SoT.

## 5. Adaptive research lifecycle

A project can be in many stages simultaneously; a new research task MUST NOT reset completed unrelated work.

```text
USER_GOAL / EXISTING_ARTIFACT / TOOL_FAILURE / NEW_SOURCE / USER_FEEDBACK
            |
            v
   REVISE GOAL OR OPEN CHILD QUESTION
            |
            v
  RESEARCH PLAN -> SCOPED SOURCE ACQUISITION
            |
            v
 CLAIM EXTRACTION -> ENTITY RESOLUTION -> EVIDENCE RECONCILIATION
            |
            v
   SYNTHESIS + UNKNOWN / CONTRADICTION MAP
            |
            v
      MULTIPLE SOLUTION BRANCHES
            |
      +-----+----------+----------------------+
      v                v                      v
  IMAGE/VIDEO       3D/SCENE             TOOL/SKILL/CODE/
  ARTIFACT          ARTIFACT             ANALYSIS/DOCUMENT
      +----------------+----------------------+
                       |
                       v
                 EVALUATE/REVIEW
                       |
              USER FEEDBACK OR NEW FACT
                       |
      +----------------+-----------------------+
      |                |                       |
 TARGETED REPAIR  RESEARCH CHILD          NEW GOAL/BRANCH
      |                |                       |
      +-------------- REPLAN / MERGE ----------+
                       |
               USER-ACCEPTED PHASE
                       |
              KEEP PROJECT OPEN
```

### 5.1 Triggers (not all automatic)

1. User asks a follow-up about any previous finding, source, image, job, product, skill, workflow, branch or unresolved question.
2. User disputes an observed result, changes preference, hard constraint or goal, or asks for a new path.
3. A deterministic validator fails: schema/unit mismatch, geometry test, compile, stale offer, incompatibility, budget exceeded, artifact QA, inconsistent video frame, source conflict.
4. Approved source/inventory/price refresh materially affects an active decision.
5. New capability/provider/harness is available and user explicitly requests alternatives or authorizes proactive comparisons.
6. A reviewer requests expert evidence or risk verification.

Event watchers are **optional, user/policy-approved** via existing monitor/schedule owners. No unbounded unsolicited crawls or silent autonomous spending.

### 5.2 Research Frontier

Maintain a prioritized project-local graph of unresolved questions: `REQUIRED_FOR_CURRENT_DECISION`, `HIGH_IMPACT_UNCERTAINTY`, `OPTIONAL_EXPLORATION`, `STALE_CHECK`, `CONTRADICTION`, `EXPERT_REQUIRED`. Each has parent problem/branch, expected information value, bounded budget, authorized sources, acceptance oracle and stop conditions.

A question is *resolved* when evidence is sufficient for its scoped decision, not when every possible source in the world has been searched. Distinguish `NO_SOURCE_FOUND` from `CLAIM_FALSE` and `UNKNOWN` from `INFEASIBLE`. Prioritize questions blocking active decisions; defer minor unknowns. Avoid duplicate research tasks by normalized question/subject/region/branch/source revision digest.

### 5.3 Planning and provider adapters

`research.plan`, `research.execute`, `research.extract`, `research.reconcile`, `research.synthesize`, `research.evaluate` are **capability methods**, not new Workflow node types by default. Use existing typed Spec 215 definitions and Skill/tool resolution; create a new node type only after the Spec 214/212 conformance process demonstrates necessity.

Optional adapters (capability-probed and license-reviewed): web/browser search, manufacturer manuals, marketplace offers, shipping calculators, GPT Researcher, STORM/Co-STORM, autoresearch, GraphRAG, connectors, domain datasets. A provider adapter MUST return bounded source/evidence/artifact receipts. No private-document disclosure to an external provider without explicit Spec 220 authorization and egress allowlist.

### 5.4 Progressive depth and information value

- `QUICK`: scoped clarification using existing project evidence and exact authoritative lookup.
- `STANDARD`: several independent source classes, branch comparison, targeted gap/contradiction check.
- `DEEP`: broader domain mapping, multi-perspective discovery, alternative paths, source-independence checks, material cross-source synthesis, expert review as warranted.
- `CONTINUOUS`: research resumes on meaningful new user input, material failure or authorized refresh; does not mean unrestricted background crawling.

Depth is determined by expected decision impact, uncertainty and budget. Material claims require evidence even in Quick mode. If user explicitly requests further exploration, existing evidence is reused and the frontier is expanded rather than starting over.

### 5.5 Evidence synthesis

- Normalize canonical entity identity and exact variants; separate manufacturer specs, observed measurements, supplier claims, offers, logistics, reviews and hypothetical AI estimates.
- Treat same-origin syndication or copied reseller descriptions as one source-independence group for corroboration.
- Preserve contradictory source values, observed timestamps, locale and basis. Use an authoritative source where domain-appropriate (e.g., manufacturer technical dimensions) but do not assume one website is authoritative for another concern (e.g., merchant delivery fee).
- Build `DOMAIN_MAP`, `CLAIMS`, `OPEN_QUESTIONS`, `CONFLICTS`, `OPTION_MATRIX` and versioned `SYNTHESIS` for each consequential review. Every synthesis statement points back to underlying claim/source IDs; do not cite another model summary as if independent.
- A revised claim invalidates only dependent assessments/branches/artifacts, not every old project result. Revocation removes unauthorized derived projections and blocks new use.

### 5.6 Research exit / escalation

Return `EVIDENCE_SUFFICIENT`, `PARTIAL_WITH_UNKNOWNS`, `NEEDS_USER_FACT`, `NEEDS_EXPERT`, `BUDGET_EXHAUSTED`, `SOURCES_BLOCKED` or `NO_VERIFIABLE_SOURCE`. Describe precisely which claims support which option, not generic confidence percentages. Hard risk or legal/professional thresholds require domain-specific evidence and human review.

## 6. Goal, preference and decision revisions

### 6.1 User dissatisfaction is not always task failure

When user says "not this", "looks too crowded", "new budget", "someone recommended an alternative", "switch to a different provider" or "show another way", first resolve *which* previous result/branch/revision they saw and classify whether they seek:
- cosmetic/presentation edit;
- targeted factual correction;
- deeper research;
- plan or tool replacement;
- change in constraint/preference;
- change in target deliverable;
- new goal altogether.

Do not force user to formulate all requirements in advance. Ask the smallest decision-critical question where no reliable inference is possible, otherwise create a reviewable provisional interpretation and do not treat it as an approved hard constraint.

### 6.2 Revision and approval semantics

- User-confirmed preferences/constraints and provisional model interpretations are stored separately.
- Every materially changed goal or hard constraint creates a new immutable `GoalRevision`; prior revision remains auditable and can be restored as a new revision.
- `DecisionRecord` includes alternatives seen, basis/source refs, chosen option, user/approver, cost/risk summary, relevant revision and whether decision is reversible.
- A selected branch is still reopenable; new evidence or new goal creates a successor revision/branch, not rewriting accepted prior evidence.
- Automatic actions may refine *research plans* within authorized budget; any new purchase, publication, destructive change, high-risk physical work, uncontrolled external egress or material budget increase requires existing approvals.
- When feedback arrives during a running paid job, do a compare-and-set plan revision and show `cancel`, `drain`, `keep result for later` options depending on actual provider cancellation capability. Old jobs cannot commit output into a newer accepted branch without a valid matching revision/fencing decision.

## 7. Solution exploration and branching

### 7.1 Multi-path planning

For material uncertainty, propose distinct feasible approaches that differ in **mechanism**, not just prompt wording. Branch examples: change product; change supporting component; change installation method; rearrange room; choose image-first instead of 3D; switch harness/provider; redesign software architecture instead of patching; run targeted measurement or obtain expert evidence.

Each alternative MUST declare prerequisites, unknowns, evaluated constraints, expected outputs, rough cost/time *ranges where grounded*, implementation capability and whether it would invalidate existing work. Do not claim the option is feasible until relevant hard constraints have been checked.

### 7.2 Branch operations

`FORK` copies references to immutable allowed evidence/artifacts, never another user's secrets; `RESEARCH_CHILD` expands one unknown; `EVALUATE` uses domain or user-specific acceptance tests; `PARK` leaves branch retrievable; `COMPARE` makes evidence-backed matrix; `SELECT` requires authorized user/owner action; `MERGE` creates new branch with explicit conflict plan, not a silent overwrite; `ARCHIVE` preserves audit and reusable data within retention policy.

Branches can run concurrently only within project-specific quotas and existing `worker_jobs` admission. Shared work is content-addressed/ref-counted or deduplicated through canonical job ownership. Paid external retries must respect upstream idempotency capabilities and ambiguity handling.

### 7.3 Change-impact dependency graph

Record `depends_on` edges from input facts/measurements/approvals/claims to derived calculations, selected products, layout plan, image/video/3D artifacts, quotes, workflow releases and proposals. A revision triggers `impact.preview`:
1. affected objects and why;
2. unchanged/reusable evidence and artifacts;
3. tasks requiring re-validation, selective re-render or full rebuild;
4. unknown/new source questions and new estimated spend;
5. irreversible effects requiring human remediation (e.g., a placed order).

No bulk invalidation when only one branch or SKU is impacted. Unit/data version checks are deterministic. Impact propagation must bound fan-out and cycles, with a human-readable explanation.

## 8. Multimodal and tool-neutral execution

### 8.1 Strategy resolver inputs

Choose execution path by user-desired deliverable, fidelity, available references, confirmed dimensions, editability, budget, latency, exactness and allowed providers. Supported categories include:

| Lane | Fast useful output | Escalate / verify when |
|---|---|---|
| Text-to-Image / Image-to-Image / multi-reference | concepts, room proposal, product composition | exact SKU geometry/scale or repeatable camera needed |
| Image-to-Video / reference-to-video | short film scene, marketing walkthrough, pitch | identity/geometry temporal drift exceeds agreed tolerance |
| 2D/2.5D composite | fixed-camera product placement with true product pixels | depth/occlusion/multi-view becomes material |
| Procedural 3D | editable assets, repeatable multi-view scenes, animations | geometry and code need stronger tests or specialist adapter |
| Mesh / Blender / scene reconstruction | scan/asset import, precise scene editing where supported | rights, mesh geometry, license or hardware constraints fail |
| Measurement/analysis/BIM | quantity, fit, deterministic feasibility | authoritative measurements and domain review unavailable |
| Code/agent harness/simulation | product software or technical workflows | compile/test, secret, sandbox, cost or production change gate |

**3D stays first-class.** Provide versioned `spatial.generate`, `spatial.edit`, `spatial.render`, `spatial.evaluate`, `spatial.export` contracts and optional adapters for img2threejs/media2threejs and future engines, subject to independent integration certification. Do not force 3D as a prerequisite for realistic image drafts, and do not claim generated images provide engineering-verified dimensions.

### 8.2 Shared artifact contract

Each result is an immutable `ArtifactVersion` with `project`, `branch`, `goal_revision`, `prompt_or_instruction_digest`, source evidence refs, model/engine/Skill/provider exact versions, input asset refs, permitted use/rights, observed cost, generated time, domain verification level and dependency edges. An image might be `CONCEPT`, `DIMENSION_GUIDED_CONCEPT`, or `MEASURED_VERIFIED`; a render is not automatically measured. A quote has price/supplier/ship-to/TTL; a generated design has no implied right to represent an exact product without fidelity checks.

### 8.3 Evaluation and repair

Use distinct gates: visual quality, factual fidelity, spatial/dimensional checks, temporal consistency, software tests, calculation reproducibility, physical safety and user acceptance as relevant. When output fails, root-cause whether insufficient research, mistaken fact, misunderstood goal, unsuitable tool/LLM, execution failure or aesthetic mismatch. Targeted repair first; strategy switch and new research on repeated failure; no unbounded regeneration loop.

## 9. Chat and Mini Chat contracts

### 9.1 Common features

Feature 196 Chat and Spec 240 Mini Chat use a common versioned `ResearchInteraction` adapter through authorized project context. For each reply the user can:
- refer to a prior result/asset/branch by UI selection or natural language;
- ask "why?", "source?", "compare?", "what if?", "check this again?", "try another tool?";
- pin/correct/exclude a finding or user preference;
- request scoped source deepening or fresh source lookup;
- fork/compare/merge/select branches and inspect cost/impact;
- view old/new artifacts side by side, annotate a region, object, frame, table row or code diff where host supports it;
- approve or reject a *specific revision* and scope.

An ambiguous reference like "this model" should resolve via authenticated active selection/recent visible artifact with an explicit referent preview, not blindly update a different project. Support Thai/English and mobile/tablet-friendly simplified views.

### 9.2 Mini Chat is bounded by the Mini App

Mini Chat sees only the published app's allowed Product/Project sources, eligible artifact revisions, workflow result data and authorized actions for that end user. A user may ask broadly *about the current app's task* (e.g., other materials or price options), but agent retrieval outside the allowed app source/egress policy requires a separately authorized research capability; never inherit publisher/admin access. A publisher cannot grant its own private evidence to consumers by accidentally embedding Mini Chat.

Per-message server-side binding includes authenticated `principal_id`, `tenant_id`, `product_id`, `mini_app_id/version`, active `project_id` if allowed, `branch_id`, selected `artifact_version_ids`, `source_set_digest`, purpose, policy epoch and action budget. Source/authorization revalidated upon every tool retrieval/side effect. Published app version cannot be silently rewritten by a dynamic chat UI change; product scope expansion needs the normal release process.

### 9.3 Conversational context and project detection

Use Spec 233/241 authorized project candidates and source metadata to suggest project association from chat text **without forcing manual Project ID entry**, but require explicit disambiguation when multiple eligible projects are plausible. No semantic result overrides project ownership or user policy. Outside-project chat remains scoped to a new draft or user-authorized target until association is confirmed.

### 9.4 Progressive UI, not transcript-only

Chat should show persistent Project Goal, currently selected Branch/Revision, Research Frontier (open/blocked/answered), Evidence Inspector, side-by-side Alternative Matrix, media/document previews, change-impact summary, quoted research spend and activity progress. Mini Chat may embed a smaller read-only/authorized-edit subset appropriate to its published capability manifest. Support pause/resume and re-open months later via R2-backed project memory.

## 10. APIs and events (proposed additive surface)

All mutating requests require bearer/session auth + Spec 220 permission and CSRF where applicable; `Idempotency-Key` or command UUID; version/CAS tokens; scoped budget and purpose. Existing API naming can differ—adapter must map to canonical discovered ingress, not fork it.

```text
POST /v1/projects/{project}/research/tasks
GET  /v1/projects/{project}/research/tasks?branchId=...
GET  /v1/projects/{project}/research/evidence/{claimId}
POST /v1/projects/{project}/research/tasks/{taskId}/deepen
POST /v1/projects/{project}/goals/revise
POST /v1/projects/{project}/branches/fork
POST /v1/projects/{project}/branches/compare
POST /v1/projects/{project}/branches/merge-preview
POST /v1/projects/{project}/branches/select
POST /v1/projects/{project}/feedback/interpret
POST /v1/projects/{project}/impact/preview
POST /v1/projects/{project}/experiments/propose
POST /v1/projects/{project}/experiments/execute-approved
GET  /v1/projects/{project}/workbench/stream  # existing authorized event channel where present
```

Core event envelope:

```json
{
  "event_id": "uuid",
  "event_type": "research.evidence_added",
  "tenant_id": "...",
  "project_id": "...",
  "goal_revision_id": "...",
  "branch_id": "...",
  "research_task_id": "...",
  "worker_job_ref": "...",
  "aggregate_revision": 18,
  "correlation_id": "...",
  "causation_id": "...",
  "policy_epoch": 11,
  "schema_version": 1,
  "created_at": "...",
  "artifact_or_evidence_ref": "..."
}
```

Publish canonical mutation + outbox atomically in PostgreSQL; consumers deduplicate by event ID and expected aggregate revision. WebSocket/stream events are projections, not write authority. Events include `research.opened|progress|evidence_added|conflict|blocked|merged`, `goal.revised`, `branch.forked|evaluated|selected|parked|merged`, `artifact.created|invalidated`, `decision.needs_review`, `review.accepted|rejected`, `budget.threshold`, `approval.required`. Never stream other-tenant source content; reconnect reads only currently authorized projections.

## 11. Durable execution, concurrency and recovery

- Compile logical plans through existing Spec 215/Kernel; admit physical work through current Feature 186/195 `worker_jobs`. `research_task_id` and provider IDs are correlations, **not** a second job authority.
- Existing lease/fence/attempt/route generation and outbox govern retries, cancel, late callbacks, owner handoff, crash recovery and external-effects ambiguity. A cancelled/obsolete branch cannot be resurrected by late paid-provider response.
- CAS and approval rechecks guard feedback races: if user switches goal while research is running, persist safe reusable results but do not silently merge into newer current decisions. Return `NEEDS_REBASE` or `PARKED_OBSOLETE_CONTEXT` with impact summary.
- Coalesce identical authorized research across same project/scope under dedup keys, but do not deduplicate across tenants/private source sets without explicit approved public cache rules.
- Distinguish provider cancellation requested vs provider charged/still running. Unknown external effects park/reconcile; no exactly-once claims for third parties.
- Persist checkpoints and bounded partial source receipts to R2 before resuming on a new runner/Sandbox. A Sandbox filesystem/process is not durable state (Spec 242 integration when certified).
- Enforce fan-out, depth, model context, retry, crawling, project concurrency and branch-count limits. Pause on exhausted research budget with incomplete evidence and actionable options; no automatic payment escalation.

## 12. Security, privacy, source rights and consequential claims

1. Deny-by-default project/tenant/product retrieval; prove scope before model context assembly and again at tool use/artifact share. ACL and deletion/revocation propagate to derived claims and graph/vector projections.
2. Web pages, manuals, files, reviews, tool output, competitor claims and generated code are untrusted **data**. Strip/neutralize prompt injection; never treat embedded instructions as system commands or consent. Signed source and artifact provenance does not imply truth.
3. Respect applicable site terms, robots/technical restrictions and authorized APIs; no login/anti-bot bypass, secrets from crawled text, blanket third-party page mirroring or forbidden copyrighted reproduction.
4. Provider/model routing respects data-residency, external egress scope, confidential source agreements, licensing and per-run cost caps. Disable uncontrolled cross-provider fallback for restricted data.
5. Material safety/legal/engineering/medical/financial decisions require applicable domain-specific guardrails and professional confirmation as needed. A visual mockup or LLM interpretation alone cannot certify load-bearing wall changes, structural load capacity, building-code compliance or official BOQ measurement.
6. Paid purchases, refunds, posting, real deployment and physical-world changes remain explicit authorized side effects with idempotency/receipts/reconciliation. No agent may infer permission from an enthusiastic chat message that is ambiguous about cost/scope.
7. Allow source correction, de-index, retention expiry, subject-data deletion and export subject to legal/retention policies. Platform learning across private tenant data requires explicit eligible consent/declassification; default no pooling.

## 13. Cost model and research quality

At admission show best-effort budget quote with sources searched, expected breadth, model tiers, optional image/video/3D compute and potential external costs; enforce server-side spend ceiling through Spec 207. Prefer quick first useful artifact, then targeted deepening, not mandatory exhaustive up-front research.

Measure separately:
- **Coverage:** critical workflow/constraint domains represented with traceable sources.
- **Independence:** primary vs copied/reposted sources grouped correctly.
- **Verification:** primary evidence vs seller opinion vs model conjecture vs user observation distinguished.
- **Alternative diversity:** genuinely distinct mechanisms and feasibility prerequisites.
- **Precision:** correct entity/variant/unit/source-date joins, deterministic numerical checks.
- **Freshness:** market price/stock/shipping/standards checked at decision-relevant time.
- **Practicality:** change impact, reuse, accepted outcome cost/latency/user correction burden.

Do not set a universal '30 research rounds', arbitrary confidence score, source-count threshold or conversion rate as a product-quality guarantee. Use domain-calibrated acceptance sets and independent human-marked benchmarks. Stop/ask user when marginal information value is lower than budget or when domain sign-off is required.

## 13A. Research adequacy, convergence and stopping policy

A research task MUST NOT equate `more pages searched` with `better answer`. The planner maintains a versioned **Decision Evidence Coverage** record for the current question/branch. Minimum dimensions are: decision-critical facts, unresolved hard constraints, source-class diversity, contradiction state, freshness, entity/variant certainty, geographic/applicability fit, and user/expert facts that cannot be discovered from public sources.

Each research cycle computes one of the following next-step dispositions using explicit evidence, not hidden model intuition:

```text
CONTINUE_TARGETED       material missing fact has a plausible acquisition path
EXPAND_SOURCE_CLASSES   current sources are correlated/insufficient
OPEN_ALTERNATIVE        current route appears weak; research a different mechanism
ASK_USER                only the user can supply a decision-critical fact/preference
ASK_EXPERT              qualified domain judgment/inspection is required
RUN_EXPERIMENT          uncertainty is better reduced by test/simulation/prototype
PAUSE_BUDGET            further information value does not justify current spend
SUFFICIENT_FOR_DECISION enough evidence for the scoped decision; preserve residual unknowns
BLOCKED_NO_EVIDENCE     no authorized/verifiable acquisition path remains
```

The stop policy MUST be scoped to the *current decision*, never claim that the domain is fully researched. Residual questions remain in the Research Frontier and can be reopened by later artifacts, user feedback or stale-data events. A provider's own `done`/`complete` signal cannot mark research sufficient without SmartAIHub evaluation.

### 13A.1 Marginal information value

Prioritize the next research action by expected ability to change a decision, remove a hard blocker, reduce material uncertainty, reveal a new solution class or avoid expensive/reversible work. Cheap duplicate facts rank below missing decision-critical facts. The implementation MAY use a heuristic score but MUST persist the factors and MUST NOT expose an invented probability of correctness as calibrated confidence unless benchmarked.

### 13A.2 Blind-spot challenge

Before `SUFFICIENT_FOR_DECISION` on material work, run a bounded challenge pass asking at least: `What assumption, stakeholder, failure mode, source class, alternative mechanism or local condition could invalidate this recommendation?` The challenge pass may resolve with `no material new gap found`; it is not an obligation to search indefinitely.

## 13B. Branch portfolio control and alternative quality

Multi-path reasoning MUST be bounded. Maintain a **Branch Portfolio** with `active`, `parked`, `dominated`, `blocked`, `selected` and `archived` states. Do not create near-duplicate alternatives merely to increase count.

A materially distinct branch changes at least one of: mechanism, architecture, product class, sourcing route, installation method, output modality, risk model, cost structure, provider/harness strategy, or user workflow. Prompt paraphrases are not distinct branches.

Before opening another expensive branch:
1. check whether an existing branch can absorb the new idea as a parameter/revision;
2. estimate new information gained and incremental spend;
3. check hard constraints and known dominated conditions;
4. preserve at least one credible fallback when economically reasonable;
5. require user/owner approval when configured concurrency or spend threshold is exceeded.

Pruning never deletes evidence. A dominated/parked branch remains explainable and can be revived if constraints change.

## 13C. Artifact-driven requirement discovery and preference learning

SmartAIHub SHALL support **progressive requirement discovery** because the user may only learn what they want after seeing output. Feedback on a visible artifact MUST be classified into structured deltas where possible:

```text
AESTHETIC_PREFERENCE
FUNCTIONAL_REQUIREMENT
HARD_CONSTRAINT
SOFT_CONSTRAINT
BUDGET_CHANGE
REFERENCE_PREFERENCE
REJECTED_ASSUMPTION
NEW_GOAL
NEW_ALTERNATIVE_REQUEST
EXTERNAL_ADVICE_TO_VERIFY
UNSPECIFIED_DISSATISFACTION
```

For `UNSPECIFIED_DISSATISFACTION`, do not blindly regenerate repeatedly. Compare recent rejected artifacts/branches and infer candidate dimensions of disagreement; present a small set of reviewable alternatives or ask one minimal discriminating question. Model-inferred preferences remain provisional until confirmed by repeated behavior or explicit user approval under Spec 241/233 policy.

The system MUST support `preference drift`: a later explicit preference supersedes an earlier preference for future planning but does not rewrite historical decisions. If a user says another person suggested a change, record it as external advice pending verification, not immediately as fact.

## 13D. Research snapshot, reproducibility and temporal truth

Every consequential synthesis/decision MUST pin a **Research Snapshot Manifest** containing:
- research task/plan revision and question digest;
- exact source URLs/connector IDs/document revisions and locators where permitted;
- retrieval/query strategy version and provider/model/tool versions;
- source observation timestamps, locale/market and independence grouping;
- extracted claim IDs and conflict state;
- user-provided facts/measurements and their revision;
- policy/source-set digest, budget, and artifact hashes;
- synthesis algorithm/prompt or Skill version digest sufficient for operational replay without storing private chain-of-thought.

Dynamic facts (price, stock, shipping, schedules, availability, model/provider capability) MUST carry TTL/freshness class. Reopening a decision after TTL expiration triggers targeted refresh of only dependent dynamic claims. Static manuals do not need needless refresh unless revision/change evidence appears.

If a web page changes or disappears, the system MAY retain authorized factual extraction/snapshot metadata consistent with source rights and retention policy, while clearly distinguishing historical observation from current fact.

## 13E. Research-to-experiment-to-research feedback contract

Experiments, generated artifacts and real tool runs are evidence producers. An evaluation failure MUST be translated into one or more typed hypotheses before new broad research:

```text
SOURCE_FACT_WRONG
SOURCE_FACT_MISSING
USER_GOAL_MISREAD
PREFERENCE_MISREAD
CONSTRAINT_VIOLATION
TOOL_OR_MODEL_LIMITATION
PROMPT_OR_CONFIGURATION_LIMITATION
DATA_QUALITY_LIMITATION
DOMAIN_RULE_MISSING
IMPLEMENTATION_BUG
AESTHETIC_MISMATCH
UNKNOWN_ROOT_CAUSE
```

The planner chooses targeted repair, targeted research, alternative branch, new tool/provider or user clarification according to the hypothesis. Repeated identical failures without new evidence MUST trip a loop breaker and require strategy change or user review.

## 13F. Domain knowledge compounding without premature generalization

Project-local research may become reusable **Domain Knowledge Candidate** only through explicit promotion policy. Candidate knowledge must remove private facts, preserve source/license/provenance, define applicable market/time/context and pass duplicate/conflict review. Private successful solutions do not silently become global best practices.

Where repeated projects reveal stable domain patterns, SmartAIHub MAY package them as governed Skills, templates, evaluation rubrics, source strategies or Product Blueprint modules through existing publication owners. This is the mechanism by which continuous project research can improve future product creation without creating an uncontrolled cross-tenant memory pool.

## 13G. Human decision quality and option presentation

The system SHALL avoid presenting an AI-selected path as the sole natural choice when material alternatives remain. For consequential comparisons, show at least: what differs, why it matters, hard constraints passed/failed, unresolved facts, expected reversible/irreversible effects, cost range where grounded, freshness, and what additional evidence would change the recommendation.

Do not force numeric ranking when evidence is not commensurable. User selection records the user's current trade-off, not proof that other branches are objectively inferior.

## 13H. Recursive research containment

Child research may recursively open further questions, but recursion MUST have explicit depth, fan-out, budget and wall-clock bounds. Each child must justify its parent dependency and expected evidence. Cyclic question graphs are deduplicated by normalized subject/predicate/context digest. A child question that no longer affects any active decision is automatically eligible for `PARKED` rather than consuming additional resources.

## 13I. Semantic branch merge safety

A branch merge is a **new synthesis revision**, never a textual concatenation of prior conclusions. Before merge, the system MUST compare each source branch's goal revision, constraint snapshot, evidence applicability, units, locale/market, time window, policy scope and unresolved conflicts.

The merge planner MUST classify every inherited item as `COMPATIBLE`, `CONDITIONALLY_COMPATIBLE`, `CONFLICTING`, `STALE`, `OUT_OF_SCOPE` or `REQUIRES_REVALIDATION`. Conflicting hard constraints or mutually exclusive assumptions block automatic merge. The user receives a merge preview describing what survives, what is discarded, what needs fresh research and which artifacts become obsolete.

A merged branch MUST retain parent lineage and may not imply that conclusions valid under one branch remain valid under another without an applicability check.

## 13J. Evidence reuse and applicability rebasing

Evidence is reusable only when its applicability predicate still matches the new decision context. Reuse MUST check at least entity/variant identity, market/locale, time/freshness, unit/system, user/project scope, constraint revision and source authorization.

Research reused across branches or goal revisions receives one of:

```text
REUSE_AS_IS
REUSE_WITH_REFRESH
REUSE_AS_BACKGROUND_ONLY
REVALIDATE_BEFORE_DECISION
DO_NOT_REUSE
```

The system MUST NOT treat a previously accepted claim as universally valid merely because it came from the same Project.

## 13K. Multi-agent agreement is not truth

Multiple agents/models repeating the same conclusion does not constitute independent corroboration when they consume the same sources, copied sources or the same upstream model-generated claim. Corroboration is evidence-source based, not model-vote based.

For material decisions, evaluators SHOULD separate:
- source independence;
- extraction agreement;
- reasoning agreement;
- deterministic constraint checks;
- expert/user confirmation.

Consensus may increase review priority but MUST NOT upgrade `UNVERIFIED` evidence to `CORROBORATED` without qualifying source evidence.

## 13L. Independent evaluation and self-grading controls

A generator MUST NOT be the sole authority that declares its own consequential output acceptable. Where practical, use deterministic validators and an independent evaluator profile with a different prompt/context boundary; high-risk domain checks require the applicable specialist gate.

Evaluation rubrics, golden fixtures and acceptance thresholds are versioned. The system MUST detect evaluator drift and benchmark contamination; artifacts used to tune a strategy SHOULD be separated from holdout certification fixtures. A high model score without supporting evidence cannot override failed deterministic constraints.

## 13M. Source manipulation, ranking bias and poisoned-web resistance

Research planning MUST assume search rankings, affiliate pages, seller descriptions, SEO farms, reviews and AI-generated web pages may be strategically biased or duplicated. Source selection SHOULD seek primary documentation, regulatory/standards sources, independent measurements and materially distinct seller offers when relevant.

The ingestion pipeline MUST preserve source class and commercial relationship where detectable, group syndication/copies, flag suspicious contradiction bursts and avoid allowing page frequency to masquerade as independent evidence. Prompt injection controls from Section 12 apply before extraction and synthesis.

## 13N. Partial-result trust and failure isolation

A provider timeout, parser failure, inaccessible page or incomplete child research MUST NOT silently disappear from the synthesis. Each research bundle records attempted sources/actions, successful evidence, failed acquisitions, unresolved questions and whether the failure could bias the available alternatives.

Partial results may support a provisional decision only when missing evidence is non-critical or explicitly accepted by the user/policy. A branch with missing hard-constraint evidence remains `CONDITIONALLY_FEASIBLE`, `BLOCKED` or `UNKNOWN`, never promoted merely because the remaining evidence looks favorable.

## 13O. Cancellation, sunk-cost salvage and late-result policy

When the user changes direction or cancels a branch, SmartAIHub MUST distinguish:
- reversible pending work that should be cancelled;
- already-paid or externally running work that may be allowed to drain under budget;
- reusable completed evidence/artifacts that should be preserved;
- side effects that already occurred and need reconciliation rather than pretend rollback.

Late provider results are stored only as lineage-bound evidence/artifacts and cannot reactivate an obsolete goal or selected branch. The UI SHOULD explain sunk cost, reusable outputs and additional cost before proposing a replacement path.

## 13P. Long-lived project compaction and context reconstruction

A project may accumulate years of research, branches and artifacts. The active model context MUST be reconstructed from versioned Project Knowledge Packs, current goal/constraint/decision state, relevant evidence and exact artifact anchors rather than replaying the full transcript.

Compaction MUST preserve provenance, corrections, supersession links, unresolved contradictions and user-authored decisions. Summaries are replaceable projections; authoritative revisions/evidence remain reconstructable under Spec 233/R2/PG ownership. Context-size pressure MUST NOT silently drop a hard constraint or accepted user decision.

## 13Q. Domain adapter contracts and calibration

Domain-specific adapters/Skills that translate facts into constraints, calculations or recommendations MUST declare supported jurisdiction/market, units, assumptions, version, required inputs, deterministic validators, risk class and calibration fixtures.

An adapter may return `OUTSIDE_CERTIFIED_SCOPE` rather than extrapolate. A domain adapter update that changes interpretation of stored evidence triggers targeted reevaluation of dependent active decisions, not wholesale project recomputation.

## 13R. Irreversible effects and decision-change boundaries

User goals may change freely at the planning/research level, but changing intent cannot undo an irreversible external effect. Purchases, deployments, publications, physical installation, destructive edits or legally consequential submissions require a fresh effect-specific approval bound to exact branch, revision, amount/scope and expiry.

After such an effect, later dissatisfaction opens remediation/compensation/alternative planning; the system MUST NOT describe it as simple branch revert. Before irreversible execution, surface the last safe cancellation point and material downstream consequences.

## 13S. Tombstones, revocation and derived-knowledge invalidation

When a source, user measurement, permission or private artifact is corrected/revoked/deleted, derived claims and decisions MUST be traced through dependency links. Policy determines whether historical audit metadata may remain, but active retrieval/projections and future synthesis MUST stop using revoked content immediately.

Invalidation is transitive only where dependency is material: do not invalidate unrelated project knowledge. The system records `invalidated_by`, affected branch/decision refs, remediation status and whether a replacement source restores the claim.

## 13T. Cognitive-load control for many alternatives

Flexibility MUST NOT become an interface that overwhelms users with dozens of branches. The UI SHOULD expose a small active comparison set while preserving additional parked alternatives behind expandable views. Alternatives may be clustered by mechanism or trade-off, but clustering MUST NOT erase materially distinct risks or fabricate a single winner.

When the user is uncertain, ask one decision-discriminating question or show representative artifacts that maximize preference learning. Expert/advanced users MAY inspect the full frontier, branch graph and source matrix.


## 13U. Concurrent project mutation and optimistic concurrency

A long-lived Project may be edited by the user, collaborators, Chat, Mini Chat, scheduled research and background evaluators concurrently. Every mutation to current goal, constraints, selected branch, accepted evidence or decision state MUST carry an expected revision/ETag (or equivalent compare-and-set token). Stale writers MUST fail with an explicit conflict outcome rather than silently overwrite newer user intent.

Conflicting writes SHALL be classified as `AUTO_REBASE_SAFE`, `USER_REVIEW_REQUIRED` or `REJECT_STALE_WRITE`. Automatic rebase is permitted only for commutative metadata updates that cannot change meaning. Goal text, hard constraints, approvals, selected alternatives and accepted conclusions require semantic conflict review. Background agents may append new evidence, but cannot move current selection or acceptance pointers without current authorization.

## 13V. Quantified uncertainty and deterministic propagation

When research yields numeric or bounded facts (dimensions, prices, weight, capacity, delivery time, tolerance, quantity, probability-like estimates), the system MUST preserve unit, precision, source date, interval/range when available, and whether the value is measured, manufacturer-declared, seller-declared, calculated, estimated or model-inferred.

Derived calculations MUST propagate uncertainty and missing inputs instead of collapsing them into a precise-looking scalar. If an exact compatibility or budget decision depends on unresolved bounds, the result remains `CONDITIONAL` or `UNKNOWN`. LLM prose MUST NOT narrow an uncertainty interval without qualifying evidence or deterministic calculation.

## 13W. Unit, locale, jurisdiction and calendar normalization

Research evidence SHALL retain original units/currency/tax basis/locale/jurisdiction and an explicit normalized representation when conversion is needed. Currency conversion, VAT/sales tax, shipping zones, measurement systems, model variants and date/time cutoffs MUST be versioned and time-stamped.

A normalized value MUST never erase the original source value. Domain decisions that depend on local regulation or commercial terms require matching jurisdiction/market applicability; cross-market evidence may be background-only unless explicitly validated for the target context.

## 13X. Cache, deduplication and semantic-collision safety

Research caching may reduce cost, but cache keys MUST include the dimensions that materially affect meaning: tenant/project authorization scope, source revision, entity/variant identity, locale/market, time/freshness class, goal/constraint digest and relevant provider/tool version where applicable.

Semantic similarity alone MUST NOT justify reusing a cached answer as fact. Cached synthesis is a projection; authoritative evidence refs are re-authorized at use time. Cross-tenant cache reuse is limited to public/declassified evidence and must never carry private source existence, query history or inferred preferences across tenants.

## 13Y. Source rights, crawl policy and permitted acquisition

A technically reachable source is not automatically permitted for automated acquisition, retention, transformation or redistribution. Every source adapter MUST declare acquisition method, applicable terms/robots/API restrictions where relevant, retention rights, quotation/snapshot limits and whether derived facts may be stored or published.

When rights are unclear, SmartAIHub SHOULD store minimal metadata and a reference rather than a full durable copy, subject to policy. Research completeness MUST NOT be achieved by bypassing access controls, anti-bot measures, paywalls or contractual restrictions. Provider-specific licenses are revalidated before production enablement.

## 13Z. Delegated authority and approval provenance

Project owners MAY delegate bounded research, review or spend authority to collaborators/agents, but delegation MUST be explicit, revocable, scoped by project/action/risk/budget/time and auditable. A model/tool/harness identity is never itself evidence of human authority.

Approval receipts SHALL record principal, delegated-from principal when applicable, exact branch/revision/effect, policy version, amount/scope ceiling and expiration. Revocation prevents future use and must race safely with dispatch using existing authorization/fencing semantics.

## 13AA. Decision rationale durability across model/provider changes

Accepted decisions MUST preserve a structured, model-independent rationale bundle: objective, hard constraints, considered alternatives, material evidence refs, unresolved risks, deterministic checks, user/expert approvals and why the selected path was accepted at that time.

The system MUST be able to reconstruct this bundle without relying on hidden chain-of-thought or the continued availability of the original model/provider. A future model may critique or resynthesize the decision, but cannot silently rewrite the historical rationale or acceptance record.

## 13AB. Observability, SLOs and research health signals

Production slices MUST expose measurable health for research orchestration: task latency, source-acquisition failure rate, evidence freshness debt, unresolved contradiction count, branch count/age, retry rate, stale-write conflicts, budget burn, cancellation latency, late-result rate, provider dependency and user-reopen/reject frequency.

SLOs SHALL distinguish product latency from long-running research completion. A fast answer with low evidence coverage is not equivalent to a healthy deep-research run. Alerts SHOULD route through existing incident/alert ownership rather than creating a second monitoring truth.

## 13AC. Research quality regression and benchmark drift

Changes to model, prompt, search provider, parser, reranker, extraction schema, synthesis policy or domain Skill may materially change research quality. Production changes MUST run versioned benchmark fixtures covering exact facts, multi-source fusion, contradictions, no-answer, source independence, stale evidence, branch diversity and cost/latency trade-offs.

A candidate that is cheaper/faster but materially degrades evidence quality or increases unsafe false-feasibility MUST NOT auto-promote. Benchmark datasets require contamination/version tracking and periodic refresh so success is not merely memorization of fixed fixtures.

## 13AD. Human override, correction and protected facts

Users and authorized experts MUST be able to correct extracted facts, reject a synthesis, pin a verified measurement, mark an option invalid, or require a specific source to be consulted. Such corrections create versioned evidence/decision events; they do not destructively rewrite the historical extraction.

Machine research may challenge a human-provided fact when contradictory evidence appears, but MUST surface the conflict rather than overwrite a protected/accepted fact. Safety-critical expert overrides require the applicable authorization and remain visible to downstream evaluators.

## 13AE. Research debt and unresolved-risk carry-forward

A project may intentionally proceed with unresolved questions. The system MUST track `ResearchDebt` items with severity, affected branch/decision, trigger for recheck, owner, expiry and whether the debt blocks production, purchase, publication or only future optimization.

Accepted provisional decisions therefore carry explicit residual risk. When a triggering condition occurs (time expiry, source update, new artifact, user goal change, domain adapter revision), only affected debt items are reopened. Unresolved risk MUST NOT disappear merely because a branch was accepted.

## 13AF. Portability, export and graceful degradation

Critical Project research state MUST be exportable in documented interoperable forms containing goal/constraint revisions, evidence manifests, source references, decisions, branch lineage, artifacts and unresolved research debt. Export MUST respect privacy, licensing and source-copy restrictions.

If a preferred research provider, model, graph service, 3D adapter or harness becomes unavailable, the Project remains inspectable and resumable through other certified adapters where possible. Provider outage may reduce capability, but MUST NOT make accepted project knowledge unreadable or strand canonical state inside a vendor-only format.

## 13AG. Hypothesis promotion and epistemic typing

**Gap closed:** An inferred claim may masquerade as verified project truth.

Every finding MUST retain epistemic class `OBSERVATION | EXTRACTED_CLAIM | INFERENCE | HYPOTHESIS | USER_ASSERTION | EXPERT_VERIFIED | DETERMINISTICALLY_VERIFIED`. A hypothesis may influence experiment proposals but MUST NOT silently become a factual hard constraint, verified measurement or commercial product claim through repeated summarization. Promotion MUST reference source versions, an admissible independent validation method, reviewer/certification where required and an explicit signed revision; disagreements stay as linked competing claims. A model stating the same assumption three times provides zero independent verification.

## 13AH. Source drift, replacement and historic snapshots

**Gap closed:** A changed website can silently rewrite the basis of an old decision.

Source acquisition MUST persist a permitted content fingerprint, retrieval timestamp, URL/canonical identity, parser version, visible source locator and content-retention permission. When a source is revised or disappears, bind the new observation as a new source revision and diff relevant claim predicates; never rewrite historic claim provenance to point to current content. If licensed content cannot be retained, preserve permitted metadata/hash and retrieval receipt while marking historical full-text replay unavailable. A recheck creates `UNCHANGED | CHANGED | DISAPPEARED | ACCESS_REVOKED | INCOMPARABLE` and selectively invalidates dependent decisions.

## 13AI. Dependency cycles and incremental invalidation

**Gap closed:** Mutual claim/decision references may cause infinite invalidation cascades.

Maintain typed dependency edges (`DERIVED_FROM`, `CONSTRAINS`, `SELECTED_USING`, `INVALIDATES`, `OBSERVED_AT`) with epoch and provenance. A dependency mutation MUST detect cycles/SCCs before recursive propagation; cycles without a designated stable fixed-point solver are parked for review with a bounded iteration ceiling. Use idempotent event IDs and an invalidation generation, not recursive triggers without limits. Invalidation recomputes only transitive dependents and may yield `UNKNOWN` rather than inventing a resolution.

## 13AJ. Nondeterministic media and model reproducibility

**Gap closed:** A project may claim exact replay of nondeterministic model outputs.

For each generative artifact, persist prompt and reference digests, model/provider/version when disclosed, decoding parameters and seed only when supported, tool/adapter versions, policy context, result hash, evaluator revision, cost receipt and source/asset authorization. `HISTORIC_ARTIFACT_REPLAY` means the exact stored output can be retrieved subject to ACL/retention; `REGENERATE_BEST_EFFORT` is a new experiment and MUST NOT claim byte-identical reproduction. If upstream model revision is unknown, mark reproducibility `LIMITED` and preserve the accepted historical artifact.

## 13AK. Superseded-goal resurrection and ABA protection

**Gap closed:** A reopened branch may silently inherit obsolete permissions or approval.

Assign monotonic `goal_epoch`, `branch_generation` and `approval_policy_epoch` independently of human-readable branch labels. An archived, selected or cancelled branch reopened under a later goal MUST fork a new revision and pass full context/evidence/cost/approval preflight. An old callback or copied branch ID cannot reactivate prior spend approval, resurrect retired hard constraints or overwrite latest preference order, even if the goal text returns to the same words (ABA).

## 13AL. Composite-decision invalidation

**Gap closed:** Valid individual product choices may be incompatible when combined.

`CompositeDecision` MUST pin constituent exact decision/claim/asset revisions, shared constraints, join assumptions and deterministic compatibility result. A changed constituent triggers recomputation of aggregate fit/cost/risk and invalidates only the affected composite view; it MUST NOT leave a green feasibility badge because each individual component was separately accepted. Cross-branch synthesis MUST distinguish verified compatibility from visual plausibility.

## 13AM. Stakeholder preference authority and conflict

**Gap closed:** A collaborator or AI inference may override the paying owner’s explicit choice.

Represent preferences by principal, stakeholder role, stated-vs-inferred class, scope, revision, priority and expiry. An explicit current preference by an authorized decision-maker prevails over speculative model inference; disagreeing authorized stakeholders create a recorded `PREFERENCE_CONFLICT`, not a silent AI tie-breaker. Owner-approved requirement changes update only their authorized scope; expert safety constraints remain separate from aesthetic preferences. The UI presents affected alternatives and requests the minimum clarifying decision without assuming the highest-spend proposal is best.

## 13AN. Purpose limitation and privacy-safe reuse

**Gap closed:** Authorized access for one research purpose may be reused to train/share another product.

Research access grants SHALL bind tenant, project, source set, principal, purpose, provider-egress class, retention and sharing intent, not only ACL row visibility. Cross-purpose, cross-tenant, marketplace and team-knowledge promotion require current eligible policy and explicit declassification where applicable. Derivatives, embedding projections, branch exports and evaluator fixtures inherit source restrictions; revoke or narrow permission with dependency-aware takedown. Never infer platform-wide consent from successful local retrieval or an old publication receipt.

## 13AO. Tool and adapter contract evolution

**Gap closed:** A changed provider schema can corrupt resumed long-running projects.

Every external adapter invocation MUST pin signed/certified capability descriptor, semantic action ID, input/output schema version, cancellation semantics, data retention/egress class and cost class. On resume or provider upgrade, negotiate backward compatibility; incompatible schema/semantic changes require an explicit migration plus fixture tests or safe park/fallback. Do not reinterpret unknown enum values, units or side-effect semantics as a valid legacy response. All providers are optional; canonical project data must outlive them.

## 13AP. Cross-store backup, restore and index repair

**Gap closed:** PostgreSQL, R2 and Vectorize can restore to different logical points.

Define a monotonic project journal watermark and checkpoint manifest containing PostgreSQL transaction/backup identity, R2 artifact manifest hashes/version availability, outbox offset and reconstructable Vectorize projection generation. A recovery MUST reconcile canonical PG rows against accessible R2 before admitting further paid/irreversible work, quarantine missing/corrupt artifacts and rebuild Vectorize from authorized canonical sources. Restore must replay outbox idempotently and fence pre-restore callbacks/schedulers; DR drills cover partial backups, region/provider outage and ACL/tombstone preservation. Never declare a backup healthy from successful SQL restore alone.

## 13AQ. Late evidence and decision reopen protocol

**Gap closed:** New evidence after user approval may auto-change accepted selections.

Late source results MUST enter a versioned evidence inbox tied to original task/goal/source eligibility. They may flag affected accepted decisions as `REVIEW_SUGGESTED` or `SAFETY_REVIEW_REQUIRED`, but cannot silently replace an approved selected branch or trigger fresh payment. Where source expiry/safety policy mandates blocking a pending external effect, enforce pre-effect recheck; otherwise present a concise impact preview and request scoped human action. Unrelated late evidence remains historical and must not produce notification storms.

## 13AR. Hierarchical budget reserve, capture and fairness

**Gap closed:** Child research fan-out can overspend or monopolize shared quotas.

Before paid subtask admission, atomically reserve from the existing Spec 207 project/goal/branch allocation, including estimate uncertainty, concurrency slots and provider quota. Child budgets MUST be subsets of authorized parent allocation; capture actual cost once using provider receipt/idempotency identity, release unused reservations after reconciled terminal status and expose cancellation sunk cost separately. Use queue fairness/backpressure per tenant and project; retries cannot issue another paid call while prior effect is ambiguous. A user may cap a research phase without cancelling unrelated approved project work.

## 13AS. Research-frontier DAG and causal question closure

**Gap closed:** Closing a parent question may hide unresolved necessary subquestions.

Each frontier question MUST declare decision dependency, expected evidence type, answerability criteria, child dependencies and provenance. Parent status `RESOLVED` requires explicit closure of blocking children or accepted typed ResearchDebt for non-blocking unknowns. Decomposition cannot emit infinite duplicate child tasks: normalize intent, detect ancestor cycles and enforce global budget/depth/fan-out. Nonblocking learning branches MAY remain open without delaying a scoped user-approved artifact.

## 13AT. Counterfactual and baseline-aware alternative comparison

**Gap closed:** Proposals may appear beneficial only because baseline costs and unknowns are omitted.

Comparison SHALL include current baseline/`DO_NOTHING` when relevant, option-specific incremental cost/time/rework, irreversible consequences, unmeasured effects and feasibility confidence; do not silently assign zero cost to unknown delivery or expert work. Explain why an option was ruled out and when it could become viable. AI may offer a small diverse comparison set but MUST NOT discard eligible options solely because its own earlier answer preferred another strategy.

## 13AU. Dynamic quote validity and real landed cost

**Gap closed:** Mixing seller price, shipping quote and availability from different dates yields false certainty.

Offers and logistics quotes MUST preserve exact seller/variant, ship-to region abstraction, quantity, fee/tax/incoterm assumptions, currency, fetched-at, expiry and confirmation class. `LANDED_COST_CONFIRMED` requires a same-context compatible recent offer and quote; otherwise present an estimated interval and mark shipping/stock unknown. A checkout or binding quotation requires live authorized revalidation and cannot be inferred from cached product search snippets. Retain historic costs separately for decision rationale.

## 13AV. Multimodal feedback anchoring and ambiguity

**Gap closed:** A user pointing to a visual region may change the wrong object/version.

Chat/Mini Chat feedback that references an image crop, video timestamp, 3D object, table cell or document quote MUST carry immutable artifact version, coordinate space or stable semantic anchor, and current permission snapshot. An anchor resolves against the exact historical artifact; if a new render moved or deleted the object, return `ANCHOR_STALE/AMBIGUOUS` and ask the smallest clarifying question. The model cannot mutate assets or constraints on a guessed region. Preview exact intended scope before paid regeneration or destructive change.

## 13AW. Expert and high-stakes escalation ownership

**Gap closed:** LLM-generated structural, legal or medical guidance may be mistaken for certification.

Domain Skill manifests SHALL classify consequential decisions, minimum evidence and jurisdiction, named professional role/qualification requirement where applicable, certified tool scope and escalation deadline. A visually convincing artifact or model consensus MUST NOT provide professional sign-off. Record reviewer identity/credential verification and exact signed finding when relevant; block only the risky downstream action while preserving benign ideation and alternative research. Re-review if critical measured assumptions or applicable regulations change.

## 13AX. Approval drift and pre-effect freshness

**Gap closed:** An approval can outlive an evidence or policy change before irreversible execution.

Critical-effect preflight MUST atomically re-check subject/resource versions, material claims, goal/branch epoch, authorization, budget reservation and policy epoch immediately before dispatch; changed material facts revoke effect readiness and request renewed approval. Preserve append-only original receipt but never treat it as open-ended authorization. For external effects without atomic provider commit, use intent/receipt fencing and reconciliation; `UNKNOWN_EFFECT` blocks blind retry. The approval UI must show delta since the approval was signed.

## 13AY. Experiment independence and adversarial evaluation

**Gap closed:** Generator/evaluator collusion can produce inflated research quality scores.

For material outcomes, evaluation MUST use independent deterministic checks where possible and a logically separate evaluator profile/model or qualified human reviewer when needed. Maintain blinded holdout fixtures, independent source collection on disputed claims, evaluator conflict disclosures and source-independence accounting. Record failed counterexamples and treat disagreement as a new focused research question; model majority vote alone never converts a weak claim into fact.

## 13AZ. Source diversity and commercial manipulation

**Gap closed:** Affiliate/sponsored rankings and duplicate stores may bias product recommendations.

Source policy MUST record source type, commercial incentive when known, jurisdiction and independent-source group. Research strategies SHOULD probe manufacturer, independent documentation, retailer, user-provided and specialist references as appropriate rather than maximizing URL count. Conflicted commercial claims get targeted corroboration; sponsored prominence is not evidence of product suitability. Ranking/selection explanations include coverage limitations and user-supplied preferences, not undisclosed platform monetization.

## 13BA. Progressive disclosure and truthful research UX

**Gap closed:** A polished answer can disguise partial coverage, stale facts or speculative options.

Every Chat/Mini Chat and Mini App outcome MUST expose concise current goal revision, selected artifact/branch, confirmed vs assumed facts, relevant unknowns, source-age indicators, comparison alternatives and actionable follow-up. Expandable inspector exposes attempted-but-failed searches, independent source count and exact evidence anchors; no “verified” visual badge without a versioned verifier receipt. Streaming partial results MUST distinguish suggestion from approved decision, and accessibility must support keyboard/screen reader exploration of branches and image-region alternatives.

## 13BB. Collaborative project permissions and revocation races

**Gap closed:** Mixed user/team/private research may leak via merged branches and notifications.

All branch sharing, annotations, research assignments and comparisons carry creator/project/team/tenant scopes and content-specific source grants. Merging private and shared evidence creates only policy-permitted derived projections, never implicit widening of access. Recheck grants at materialization, model egress, notification, artifact export and late callback; revoked collaborators cannot retrieve old snapshots through stale links or event replay. Where content is redacted, mark dependent conclusions partially supported rather than replacing citations with misleading blanks.

## 13BC. Scoped acceptance, stopping and safe reactivation

**Gap closed:** An accepted phase may erroneously terminate or automatically restart unrelated work.

Acceptance MUST bind exact outcome/goal/branch/artifact revision, known ResearchDebt, user role, allowed next actions and review triggers. `ACCEPTED_FOR_PHASE` is distinct from `PROJECT_CLOSED`, `ARCHIVED` and `DEPLOYED`; reopen creates a new revision with reason and preserves acceptance history. Automatic TTL/safety triggers MAY request review but MUST NOT silently purchase, deploy, publish or regenerate paid outputs. Closure must drain/cancel outstanding research according to user-approved budget and preserve portable evidence.

## 13BD. Migration, canary and rollback authority

**Gap closed:** Concurrent old/new controllers may both admit jobs during rollout.

Deployment MUST ship read-only/shadow projection first; after fixture certification, activate one feature-flagged tenant/project/job-family owner using existing Spec 232 route generation and canonical `worker_jobs`. Shadow research cannot execute paid effects or mutate accepted project truth. On rollback, disable new admission, fence late callbacks, drain/reconcile in-flight provider receipts, retain schema-forward durable R2/PG artifacts and rebuild projections if needed. Gate full rollout on per-tenant authorization, budgets, provider failover, DR restoration and end-to-end Mini Chat/current-goal acceptance traces.

## 13BE. Decision-to-artifact traceability and coverage gate (Audit 73)

**Gap found:** A Product Blueprint or multimodal output could look complete even though a decision-critical requirement was not carried into a generation prompt, deterministic validator or final artifact. Earlier claim-level provenance did not guarantee end-to-end requirement-to-deliverable coverage.

Each consequential proposal SHALL include a versioned `DecisionTraceSet` linking `goal_revision -> requirement/constraint -> supporting/refuting evidence -> selected branch -> tool execution/configuration -> artifact revision -> evaluator/test -> user acceptance`. Every required acceptance condition is tagged `VERIFIED | CONDITIONAL | UNSATISFIED | NOT_APPLICABLE` with evidence, responsible owner and an explicit reason for nonapplicability. Critical unmatched requirements block a `READY_FOR_APPROVAL` verdict. A generated image showing a product is NOT evidence that its exact catalog dimensions, safety rating or SKU survived generation; that is a distinct verification step.

The trace set is a derived projection of canonical Spec 233 goals/decisions, Spec 229 evidence and existing job/artifact receipts, not a second truth ledger. When a requirement, citation, policy or artifact revision changes, refresh ONLY affected trace edges and invalidate affected evaluation receipts. A passing test against a superseded requirement revision SHALL NOT be inherited. An authorized user may explicitly waive only waivable, non-safety criteria with a scoped receipt and preserved residual ResearchDebt. All unverified critical claims remain visible on Chat, Mini Chat and the Product Blueprint.

## 13BF. Automatic replan oscillation and progress preservation (Audit 74)

**Gap found:** An unconstrained adaptive agent may alternate repeatedly between two plausible approaches when evaluator noise, slightly changing scores or incomplete user feedback makes each appear briefly preferable, spending Credits without meaningful progress.

Automatic replanning SHALL maintain `strategy_attempt_key`, reason-for-change, progress delta, last distinct experiment/evidence, backtrack count, per-branch cooldown and user-approved remaining exploration envelope. A same-goal switch to a previously failed configuration without new discriminating evidence is a repeated-failure event, not a new branch. Use a bounded hysteresis/change threshold for autonomous switching; **an explicit, currently authorized user preference overrides the automatic hysteresis** without retroactively altering previous decisions. A hard safety constraint failure may immediately stop a path regardless of cooldown.

After N bounded no-progress transitions (configurable by verified domain profile, never a hidden infinite default), park the competing branches, present their real trade-offs and ask a single discriminating question, propose a materially different mechanism, or end the paid exploration with `PARTIAL_WITH_UNKNOWNS`. Count cost and effects already incurred. Record a fixture where two evaluators alternate preferences while the user goal is unchanged; no repeated paid regeneration is permitted without a new justified trial.

## 13BG. Synthetic evidence recirculation and citation laundering (Audit 75)

**Gap found:** AI-generated summaries, mockups, competitor matrices, prior project answers and automatically published content can be indexed or retrieved later as if they were independent primary sources; a model can unknowingly cite its own unsupported conclusion repeatedly.

Every source/evidence link MUST carry `origin_kind` (`PRIMARY_EXTERNAL`, `SECONDARY_EXTERNAL`, `USER_PROVIDED`, `MEASUREMENT`, `MODEL_DERIVED`, `GENERATED_ARTIFACT`, `AGENT_SUMMARY`), transformation lineage, origin independence group, content fingerprint and source/grant revision. Ingestion, synthesis, graph summaries and export MUST preserve original evidence anchors. Generated text, simulated results and previous AI conclusions may inform **new questions or hypotheses**, but SHALL NOT independently corroborate their own origin claims. Search ranking and confidence accounting MUST de-duplicate circular citation chains and treat unknown lineage as uncorroborated.

A poisoned/generated source discovered after an accepted decision triggers targeted re-evaluation of dependent claims and branch fitness. The benchmark MUST include an AI-created webpage quoting an old SmartAIHub answer alongside six syndicated copies; this counts as zero new independent primary confirmations. Do not retain or republish source bodies where rights or privacy disallow it.

## 13BH. Consistent read snapshot across long asynchronous decisions (Audit 76)

**Gap found:** Per-write CAS alone does not prevent a research plan from reading Goal v7, product constraints v8, branch selection v6 and approval v7 at different times, then presenting a composite recommendation that was never valid under any one coherent project state.

At decision admission create an authorization-scoped, versioned `ResearchContextSnapshot` referencing the canonical Spec 233 goal/constraint/decision aggregate revision, branch epoch, policy/security epoch, permitted source-set digest, material evidence versions/TTL, relevant capability contract versions, financial ceiling and artifact anchor versions. This is a reconstructable *read contract*, not a physical transaction spanning PostgreSQL, R2 and providers. An asynchronous agent MAY gather evidence under its snapshot; before merging recommendations, accepting a branch, dispatching paid work or emitting external effects, it MUST compare material dependencies against current canonical revisions and classify `STILL_APPLICABLE | NEEDS_TARGETED_REBASE | STALE_REJECT | PERMISSION_REVOKED`.

If critical inputs changed, halt the stale decision/effect while preserving independently useful research as scoped evidence. Compare-and-set commits use the existing PostgreSQL/project authority and `worker_jobs` lease/fence; do not imply a distributed transaction across stores. Simulate user constraint edits and collaborator revocation during concurrent vendor searches and an in-flight render.

## 13BI. Domain ontology and semantic schema migration (Audit 77)

**Gap found:** A multi-year project can combine evidence extracted under evolving domain vocabularies or provider extraction schemas. A field newly called “cabinet load capacity” might once mean distributed load, but later represent point load or packaged shipping weight; ordinary unit conversion cannot correct semantic mismatch.

Domain adapters SHALL version entity types, attribute definitions, measurement basis, tax/price basis, applicability rules, terminology mappings and constraint/evaluator schema (`ontology_id`, `schema_version`, `semantic_definition_digest`). Evidence retains original property and source language. Migration maps require reviewed equivalence rules and confidence/ambiguity labels; never silently coerce two similarly named but non-equivalent concepts or infer specialist engineering equivalence. For a material ontology change, pin old decisions to the old schema, run a deterministic migration/revalidation candidate and open targeted research for ambiguous edges.

Spec 233 remains canonical for project knowledge; Spec 229 only rebuilds its semantic retrieval projection, Spec 221 governs domain-Skill version/testing, and domain professional review remains separate where required. A fixture mixing gross/net item weight, distributed/point load and revised material codes MUST not yield falsely verified fit or BOQ quantities.

## 13BJ. Source-to-generated-artifact rights and identity lineage (Audit 78)

**Gap found:** Permission to *inspect* a product image, user-uploaded photo, actor reference, brand asset or website text does not necessarily authorize an AI-generated derivative, commercial video, published Mini App, marketplace template or training/reuse. The earlier crawl-rights gate alone is insufficient once source material is transformed and distributed.

Each media/code/document artifact SHALL carry a `DerivativeRightsManifest`: input asset/version/source IDs; rights/consent and permitted purpose; provider output terms/version; transformative operations; attribution obligations where applicable; watermark/likeness restrictions; export/publication audience; expiry/revocation behavior; and a reviewable unresolved-rights state. Passing visual QA or private generation does NOT grant commercialization rights. User-owned and third-party content obey different permissions; imported metadata does not imply image rights. At publication, paid distribution, external-provider egress and cross-tenant template promotion, re-check the manifest and any required human approvals.

If a source image or consent is revoked, block further eligible use and re-evaluate derivative obligations according to law/license and retention policy; do not promise physical recall of copies already legitimately delivered. A 3D-generated object from restricted reference images and the same object in an image-to-video commercial clip MUST both be checked, without making 3D mandatory for unrelated work.

## 13BK. Capability-equivalent fallback and strategy contract preservation (Audit 79)

**Gap found:** A preferred LLM, research provider, harness, renderer or 3D engine can fail during execution. “Fallback available” is unsafe when the substitute lacks required evidence provenance, exact variant handling, region edits, camera consistency, metric fidelity, data locality or approval hooks.

The resolver SHALL store an explicit `RequiredCapabilityProfile` for each active research/production step: input/output schema, verified accuracy class, permitted data egress, domain calibration, modality features, revisioned artifacts, cancellation/idempotency semantics, cost ceiling and required evaluator. A fallback candidate MUST be capability-probed and classified `EQUIVALENT`, `DEGRADED_WITH_USER_APPROVAL` or `UNSUPPORTED`. Never silently substitute speculative image concepts for verified dimensional calculations, swap certified jurisdiction models or export private sources to an unapproved external harness. A safe downgrade produces an explicit scope/quality delta, re-plans dependent evaluations and obtains needed approval before execution.

When no safe route exists, checkpoint reusable research, return `BLOCKED_CAPABILITY` and leave alternatives available. Failover MUST not create duplicate paid jobs or a new job owner; existing Spec 231/199/200/242/243 routing and Feature 195 remain authoritative. Test image vs 3D vs manual-layout fallback with a dimension-critical user requirement.

## 13BL. Decision sensitivity and break-even exploration (Audit 80)

**Gap found:** A portfolio comparison can give a stable-looking selected option even when a small shift in an uncertain price, user preference, shipping fee or material property would reverse feasibility. Numeric ranges alone do not explain which missing fact is actually worth researching next.

For material quantitative or multi-constraint alternatives, evaluator adapters SHOULD produce a versioned `SensitivityEnvelope`: explicitly scoped parameter ranges, verified vs hypothetical values, boundary at which option feasibility changes, break-even comparisons against the user’s current baseline and evidence that drives each threshold. The research planner SHALL prioritize **decision-flipping unknowns** for targeted acquisition/measurement when the expected value of information justifies the budget. Present robust options alongside fragile/conditional ones without pretending all preferences can be reduced to a universal numeric score.

When domain checks are safety-critical, deterministic specialist constraints override aesthetic, price and model-preference optimization. An option that only appears best under assumed free freight or an unverified load capacity remains conditional. A fixture must flip the selected alternative when fresh shipping evidence crosses a documented threshold, while leaving unrelated material/design decisions unchanged.

## 13BM. Delayed and offline Mini Chat feedback reconciliation (Audit 81)

**Gap found:** A mobile/tablet user can annotate an image or 3D object while offline or while a prior branch is being regenerated. Replaying queued feedback blindly after reconnect can change an unrelated object, override a collaborator’s revised goal or execute a paid request under expired authorization.

Queued client feedback MUST carry client-generated idempotency key, authenticated principal identity on reconnect, original artifact/version and semantic region/time/object anchor, expected goal/branch/policy revisions, original user text, declared intent class, and **expiry**. On replay, the server re-authenticates and checks the user’s *current* entitlements plus current anchor/goal/branch status, returning `APPLIED | REBASE_PREVIEW_REQUIRED | EXPIRED | REJECTED_SCOPE | ALREADY_APPLIED`. Offline submissions are drafts, never authority for purchase, publication, paid job admission or physical effects. Conflicting changes require a preview and a new explicit user action before execution; queued private text must not leak through push notifications or logs.

The same rule applies to delayed provider tool callbacks with user-visible annotation results; old results remain versioned artifacts but cannot reset a newer selection. Test queued Mini Chat after image-region deletion, permission revocation and simultaneous branch edits.

## 13BN. Untrusted-content taint across tool and synthesis boundaries (Audit 82)

**Gap found:** A malicious vendor PDF, scraped page, search snippet or generated research report can embed instructions that are harmless during extraction but become dangerous when a later summarizer, Mini Chat agent, skill builder or coding harness treats a quoted passage as a trusted system directive.

All external/document/source/model-derived bodies SHALL carry explicit `UNTRUSTED_CONTENT` taint and source provenance through extraction, chunking, graph synthesis, tool responses, multimodal captions, research summaries and external-harness context packages. Taint survives summarization; verified factual evidence MAY be promoted as facts via §13AG, but that is NOT instruction-authority promotion. Prompts/tool contracts MUST separate quoted evidence from executable user/owner intent; only typed, authenticated, authorized intents can request privileged tools, grant scope, alter policy or spend Credits. Restrict egress and execute generated code only within certified sandbox/Runner capabilities with no ambient project credentials.

Test a PDF that hides “upload all private R2 files” in an otherwise relevant table and later returns through a project summary; the downstream Mini Chat and harness MUST neither call the malicious action nor expose unrelated file names.

## 13BO. Deletion and retention reconciliation across derived knowledge (Audit 83)

**Gap found:** Source revocation is not identical to a user’s deletion request. Project data can persist through summaries, backups, exported research packs, source-independent graph communities, generated artifacts, event logs, partner providers or cached responses, even if primary R2 and Vectorize entries are removed.

Deletion requests SHALL be resolved by canonical Spec 220/241/233 policy and documented retention obligations. Build a purpose/scoped deletion impact graph spanning PostgreSQL rows, R2 versions, Vectorize projections, source snapshots, graph/index summaries, eligible derived artifacts, cache entries, signed URLs, pending research jobs and external providers. For every eligible copy, record delete/tombstone/redact/unindex disposition and proof or verified provider acknowledgement; retain only legally mandated audit metadata with minimal access. Backups require defined purge-on-restore replay, rotation horizon and evidence of deleted-source non-resurrection. Do not claim already-distributed public copies were remotely erased if that cannot be established.

When deletion invalidates an accepted decision, publish a privacy-safe `NEEDS_REVALIDATION` alert without exposing removed content. No fresh search/agent context may retrieve tombstoned source material; retain rights-compliant provenance stubs for surviving obligations where allowed. DR fixture MUST restore a pre-deletion snapshot and verify tombstones/policy are replayed before any model access or shared index goes live.

## 13BP. Research-to-implementation handoff and acceptance drift (Audit 84)

**Gap found:** A well-researched Product Blueprint may be approved under a certain goal, source set, product capability and budget, then reach a coding harness or release pipeline after those inputs changed. The previous Spec 235/224 boundary protects engineering execution but needs an exact upstream research handoff freshness check.

A proposed `ApprovedSolutionPacket` SHALL be a signed, versioned reference bundle: canonical project/tenant/owner, approved GoalRevision and branch, DecisionTraceSet, evidence snapshot/freshness and rights manifests, unresolved ResearchDebt, domain sign-offs, required capabilities, acceptance tests, permitted sources for external harness, product/release scope, authorized budget ceiling and expiry. The packet is *immutable*; changed requirements/evidence/policy cause `STALE_PACKET` and a new packet/reapproval rather than silent in-place edits. Before Spec 235 submission (if and only if its independently certified Spec 224 ingress is available), compare packet facts against canonical Spec 233/220/207 current revisions and redact external context through Spec 230. Existing Spec 224 retains all build/test/Final Verify and release boundaries; a verified development run is not automatic evidence of a user-accepted product.

Prototype previews and partial deliverables MAY continue as separately scoped experiments without pretending to be a release. Test a user budget change, deleted source image and provider contract upgrade occurring between Blueprint approval and handoff; no stale acceptance may trigger an uncontrolled implementation, publication or paid vendor call.

## 13BQ. Search-coverage ledger and bounded negative conclusions (Audit 85)

**Gap:** A research agent can inspect many results and still falsely announce the lowest market price, exhaustive product availability, or the absence of a safer alternative because search ranking and access restrictions hide relevant sources. Existing evidence quality and source-diversity rules do not quantify the searched *opportunity space*.

For material comparative claims, persist a versioned `SearchCoverageLedger` containing decision question, region/locale, date window, source classes and acquisition permissions, query revisions, channels/providers, pagination or stopping limits, inaccessible or rate-limited classes, entity/variant filters, deduped candidate counts, and explicit unexplored segments. Each `no viable match`, `lowest found price`, or `no contrary guidance found` assertion MUST be scoped to the **observed authorized search frame and timestamp**; no global exhaustive claim follows from an arbitrary number of hits. Where a missing segment could change a hard constraint, search another authorized class, ask the user, or return `UNKNOWN / INCOMPLETE_COVERAGE` with next actions.

Research stop criteria use decision sufficiency and estimated marginal value, not a mandatory global web crawl. Existing Spec 229 owns acquisition/retrieval; the ledger is a Spec 244 research-plan projection in Spec 233/R2 with no new search authority. **A97:** ten ranked stores omit a local competitor; the report must say "lowest among checked eligible offers" and show unexplored sources rather than "market's lowest price".

## 13BR. Entity/variant join proof across heterogeneous sources (Audit 86)

**Gap:** A maker manual, multiple merchants and a shipping broker may describe closely named but incompatible product variants, bundles, regional versions, replacement models or dimensions with/without accessories. A generic exact-ID rule does not define the evidence required to join them into a composite decision.

Each cross-source material join SHALL create a reviewable `EntityJoinProof`: canonical subject + revision/variant/market IDs, source-local IDs, issuer and attribute origin, normalized **semantic basis** (for example with stand/without stand; cabinet usable shelf width vs external width; net/gross mass), alias evidence, confidence class and unresolved conflicting joins. Exact manufacturer model code, authorized authoritative GTIN where present, jurisdiction suffix and variant identity take precedence over title similarity; an LLM-proposed alias alone remains a candidate. Separate **product identity** from **merchant Offer**, bundled installation, shipping package and actual measured user object. Price, dimensions and delivery may be combined only when their variant and destination/application scopes have validated overlap.

A disputed join MUST fork or park the affected options rather than silently picking the most convenient attribute. Domain plugins MAY add identifiers without changing the core schema. **A98:** two visually identical regional TV revisions have different stand footprints; one merchant lists a bundle. No combined verified fit or landed price until the join ambiguity is resolved.

## 13BS. Material counterevidence and synthesis omission accounting (Audit 87)

**Gap:** Research sources can be correctly ingested, yet a limited-context synthesis discards an inconvenient failure, contradictory expert observation or user correction and returns a polished recommendation. Requirement-to-artifact links do not prove *the important adverse evidence was considered*.

For each consequential synthesis, persist a `MaterialEvidenceDisposition` referencing all decision-critical claims surfaced by the frontier, including support, refutation, stale/ambiguous observations, failed acquisitions and protected human corrections. Every material item has `INCLUDED | DISCOUNTED_WITH_REASON | NEEDS_REVIEW | DEFERRED_AS_RESEARCH_DEBT` plus scope, evaluator and evidence links; never omit a material conflict merely due to model context truncation, summarization or topic clustering. Use bounded hierarchical summaries with source anchors and a deterministic completeness check against frontier blockers and protected facts. If full review exceeds the budget or context, deliver a partial synthesis with visible blockers, not a falsely comprehensive one.

The synthesis is a derived Spec 233 projection; material source bodies stay in authorized R2 and are retrieved only via Spec 229/220. **A99:** nine favorable product reports and a verified installation incompatibility are ingested; the incompatibility remains prominent or blocks feasibility despite the favorable majority.

## 13BT. Event projection sequence, gap replay and multi-surface read coherence (Audit 88)

**Gap:** Chat, Mini Chat and a mobile project view may receive out-of-order research, invalidation or selected-branch stream events after reconnect. Canonical CAS protects writes but a stale UI could still show superseded evidence as current, invite an invalid click or give a false impression that a paid run finished.

Use canonical PostgreSQL/outbox aggregate revisions and existing transport to expose `snapshot_revision`, `last_contiguous_event_revision`, `policy_epoch` and **monotonic scoped projection watermarks**. Consumers MUST detect revision gaps, duplicated/out-of-order events, authorization epoch changes and unknown event schema, then suspend affected actions and fetch a newly authorized snapshot before resuming. A stream progress message is provisional evidence, not a committed goal, accepted decision, available credit or job state. Historical accepted artifacts remain viewable with explicit historical labeling; do not live-mutate their contents. Reconnect must not replay withdrawn private payloads from an old cache.

The event envelope extends current §10 without a second event log; readers are projections of Spec 233/Feature 195 truths. **A100:** delayed `branch.selected(v5)` arrives after `branch.superseded(v6)` on Mini Chat while permissions were revoked; the UI cannot show v5 as active or authorize its actions.

## 13BU. Explicit watch/continuous research subscription and renewal boundaries (Audit 89)

**Gap:** A user's instruction to "keep looking" may outlive the original budget, source permission, project membership or intended time horizon. Without a bounded subscription contract, continuous research becomes hidden crawling, spam or unlimited spend.

A recurring or condition-driven `ResearchSubscription` MUST be an authorized projection of the existing Spec 238 monitor/schedule owner (if deployed) or an explicitly scheduled existing Workflow path. Pin goal/branch, covered questions, eligible sources, cadence/trigger, owner, recipient scope, per-occurrence and cumulative ceiling, termination date, notification threshold and approval receipt/expiry. At **every run**, revalidate current goal, Spec 220 grants, source-rights, freshness requirements, available credits, current route and cancellation status. Paused/accepted/archived branches MUST NOT trigger costly exploration without a currently valid subscription. Distinguish "check ran" from "meaningful evidence changed"; deliver alerts only as approved, and never automatically buy, publish or change user-selected options.

If an owner/tenant revokes or budget expires, stop new occurrences and safely drain/reconcile already admitted `worker_jobs` under current fences. **A101:** user authorizes a one-week price watch then changes project scope and revokes a retailer connector; future runs stop or narrow scope, with no off-policy fetching or renewed charges.

## 13BV. Delivered-output correction and external-consumer impact notices (Audit 90)

**Gap:** A corrected source or retracted technical assumption may invalidate a report, product proposal, video claim or published Mini App output that has already been exported. Internal invalidation alone cannot inform downstream recipients or safely retract prior external publication.

Where technically and legally permitted, retain a rights- and privacy-scoped `DeliveryImpactRef`: immutable exported artifact/revision, external destination category, release receipt, dependency digest, correction eligibility and contact/notification capability. On material retraction, compute an authorized impact set, mark future internal use stale, offer corrected artifacts, and route appropriate notifications/review through the existing approval/alert/publication owners. External correction, refund or recall is **best effort and role-authorized**; no claims of guaranteed remote deletion or retroactive rollback. Do not reveal a private source to a public recipient while explaining the correction: use a permitted correction statement or independent public evidence.

Published products follow existing Spec 217/219 review and release control; human owners authorize consequential outward communications. **A102:** a supplier withdraws a load rating after three proposals were exported; future proposals are blocked, project owners see affected delivery receipts, and no unauthorized external notifications or fictional recalls occur.

## 13BW. Evidence-based answers without covert source disclosure (Audit 91)

**Gap:** A user may be authorized to see a public project conclusion but not the colleague's private document or the confidential supplier quote from which it was derived. Suppressing citations alone is insufficient: a summary, table, comparison or LLM response can leak identifiable restricted source facts by inference.

At **claim assembly and output rendering**, apply existing Spec 220/241 per-source *and permitted-purpose* policies to derived claims, comparison cells, source locators, multimodal annotations, exported packs and downstream agent context. Define `DISCLOSE_WITH_CITATION | DISCLOSE_REDACTED | AGGREGATE_APPROVED | WITHHOLD | REQUEST_CONSENT` per claim/audience. Redaction must be tested for residual inference (unique prices, supplier identity, personal measurements); do not synthesize public confirmation from restricted evidence. If essential support cannot be disclosed to the requested audience, report the bounded conclusion as unverifiable for that audience, seek authorized declassification or find independent permissible sources; no fake public citation.

Canonical ACL, grants and retention remain owned by Spec 220/241, not this policy projection. **A103:** an external collaborator asks why a shared design is cheaper while the calculation depends on a confidential supplier quote; the answer cannot reveal the quote or reverse-identifiable details without approval.

## 13BX. Comparable, uncertainty-aware cross-engine evaluation (Audit 92)

**Gap:** Comparing two research agents, renderers or 3D/video providers using different questions, references, quality checks, attempt counts or budget ceilings creates illusory performance improvements and biases automatic strategy selection. The prior independent-evaluator rule does not itself guarantee experiment comparability.

An engine-comparison `EvaluationProtocol` SHALL pin task/asset/evidence snapshots, acceptable output contract, model/provider/skill versions, permitted data scope, evaluator rubric and version, attempt limits, cancellation handling, latency, real landed cost and human-blinded review when practicable. Pair/stratify comparable inputs and disclose different capability coverage rather than silently excluding failed or unsupported cases. Record sample size, uncertainty and inconclusive results; thresholds for automated promotion MUST be predeclared and reviewed through Spec 221/222. Cross-modal comparison evaluates **user outcomes and applicable invariants** rather than comparing raw image pixels to a 3D scene as if equivalent.

When an upstream provider is nondeterministic, retain generated outputs/configuration receipts but never assert byte-identical regeneration. **A104:** image-first wins speed on easy rooms but fails precise multi-angle cases; no universal "best engine" claim or uncontrolled auto-promotion follows an imbalanced sample.

## 13BY. Ambiguous dissatisfaction as a controlled exploration experiment (Audit 93)

**Gap:** In long-lived adaptive work, repeated "try again" or vague rejection may train the agent to change unrelated hard constraints, destroy a branch that was partly liked, or exhaust paid attempts without identifying what the user disliked. Existing feedback classification needs an explicit safe exploration protocol for ambiguous dissatisfaction.

An ambiguous `FeedbackIntent` MUST retain original user wording, reviewed artifact/region and goal revision; form *provisional*, separable hypotheses (layout, style, facts, cost, modality, performance) without upgrading them to user-confirmed requirements. Prefer a discriminating comparison of materially different changes or one compact question; show expected changes, what remains unchanged, cost and rollback options. Any speculative low-cost trial must fit the current explicit experimentation budget and policy. Do not silently modify approved hard constraints, discard liked sub-artifacts, switch to higher-risk egress or make a new paid purchase. Record observable reaction against the exact trial and prevent repeated no-progress cycles using §13BF.

**A105:** user says "still not right" three times without details while one part is liked; the agent retains the liked component, proposes contrastive alternatives and does not repeatedly pay for cosmetic paraphrases or invent a new hard constraint.

## 13BZ. Research acquisition SSRF, redirect and decompression boundary (Audit 94)

**Gap:** An approved crawler may fetch a seemingly permitted URL that redirects to local metadata endpoints, internal APIs or huge hostile archives/PDFs. Existing source-rights and prompt-injection rules do not fully specify network/file acquisition controls.

All external URL fetches MUST pass server-side destination checks, redirect-by-redirect DNS/IP and domain policy, egress proxy enforcement, per-source credential isolation, scheme/port restrictions, size and decompression-ratio caps, MIME/content sniffing, timeout, rate limits and hostile-file scanning or safe parsing according to the existing security/Sandbox owners. Block loopback, link-local, cloud metadata, private network and unauthorized intranet access in public-source lanes; separately authorized enterprise connectors use their own verified internal access policy. Never let LLM-generated citations or a third-party research plugin expand network authority. Persist sanitized failure receipts, not fetched secrets.

Spec 220 and certified Spec 242/243 placements own actual enforcement; 244 requires conformance for its adapters. **A106:** public page redirects to internal metadata and an oversized compressed document; both are rejected without data exfiltration or cross-tenant resource exhaustion.

## 13CA. Recursive cancellation, orphan recovery and speculative artifact retention (Audit 95)

**Gap:** Canceling a parent branch can leave paid grandchildren, provider sessions, private temporary assets or cost reservations behind. Existing job fencing and cancellation rules protect authoritative state but do not require complete *research-tree* cleanup and safe shared-asset preservation.

Maintain a bounded `ResearchWorkTreeManifest` linking every child task, admitted `worker_job`, provider execution ID, checkpoint, temporary artifact and existing Spec 207 reservation to the owning goal/branch and exact use count/authorization. On cancel, expiry, tenant revocation or goal supersession, stop new descendant admission, issue best-effort cancels under canonical `worker_jobs`, reconcile ambiguous provider effects and release only confirmed unused reservations. Shared evidence/artifacts referenced by other authorized live branches MUST NOT be deleted; unreferenced temporary data follows rights/retention/deletion policy. An orphan sweeper is a reconciler using existing job/financial/Library truths, **not** a second scheduler or billing ledger.

A parent can be `DRAINED` only after known descendants settle or move into explicit monitored unresolved state with receipts and operator action. **A107:** root research is canceled after three paid child launches and one shared image; late callbacks cannot reattach to the old branch, charges reconcile once and shared authorized assets survive.

## 13CB. Output-strategy invariant checks across image/video/3D/technical paths (Audit 96)

**Gap:** The same user goal may be routed from image-first to video or 3D after several iterations. A new path may look visually superior while dropping actual product identity, budget constraints, rights, required spatial properties, approved edits or measurement disclaimers; per-adapter tests cannot prove end-to-end equivalence.

Each selected deliverable declares a versioned `OutcomeContract`: acceptance audience, immutable user-confirmed constraints, visual-vs-verified spatial class, exact product/character/scene identity requirements, source/derivative rights, cost/latency ceiling and domain-specific evaluators. Before switching modality or synthesizing a hybrid result, run a cross-path `InvariantDiff` against the current goal, selected branch and actual output artifact: `PRESERVED | CHANGED_WITH_APPROVAL | UNVERIFIED | VIOLATED | NOT_APPLICABLE`, with evidence and owner per material requirement. `UNVERIFIED` is not promoted to `PRESERVED` from a dimension-guided image or realistic animation; hard or safety violations block delivery to a technical claim. A certified 3D scene may be image-enhanced for realism without pretending enhanced pixels remain verified geometry.

Reuse existing Media Studio/Spec 221 evaluator contracts and future optional img2threejs/media2threejs or alternative spatial adapters. No new output engine is mandated. **A108:** image-approved room becomes video then optional 3D; a sofa variant changes and a wall clearance is lost. The result must flag both changes, preserve the concept artifacts and request targeted correction or authorized downgrade.

## 13CC. Scoped rejection evidence and reversible negative preferences (Audit 97)

**Gap:** Current feedback handling retains changed preferences but does not explicitly prevent a rejected artifact from becoming a permanent, context-free prohibition, or the opposite failure: offering the same rejected option repeatedly under a new label. Neither behavior respects evolving user intent.

On an explicit reject, Feature 196/Spec 240 SHALL produce a versioned `RejectionRecord` under Spec 233 with `actor`, `artifact_or_option_revision`, `observed_reason_or_unknown`, `goal_revision`, `constraint_context_digest`, `scope` (`PRESENTATION_ONLY | CURRENT_BRANCH | CURRENT_GOAL | PROJECT_WIDE_BY_EXPLICIT_USER_CHOICE`), `observed_at`, `revisit_condition` and supersession history. Rejections are user-reported preference evidence, **not** independently verified domain facts. Inferred negative preferences MUST remain provisional and reversible; the user can inspect, correct, remove or reactivate them. Strategy selection SHALL avoid repeated materially equivalent proposals under an unchanged context unless new evidence or an explicit revisit explains the change. A changed budget, audience, objective or explicit user request MAY reopen a rejected mechanism without rewriting historic dissatisfaction.

`RejectionRecord` is a typed extension/projection of canonical Spec 233 feedback, not an independent user profile or Spec 241 memory authority. **A109:** user rejects a dark-room image due to insufficient daylight, later requests a cinema room; old rejection suppresses duplicate living-room drafts but does not prohibit dark cinema concepts or silently override explicit new intent.

## 13CD. Hypothetical exploration vs committed plan mutation (Audit 98)

**Gap:** A question such as “what if we replaced the cabinet?” could be mistaken for a binding goal change or approval to run paid tools. R8 distinguishes feedback intent and approval, but does not define a no-commit contract for speculative questions across Chat, Mini Chat and agent handoffs.

Every alternative proposal originating from hypothetical language SHALL use a `WhatIfSession` with a pinned baseline goal/branch/constraints snapshot, provisional diffs, predicted dependency impact, evidence links and `execution_class` (`READ_ONLY_SIMULATION | QUOTED_EXPERIMENT | APPROVED_EXECUTION`). `READ_ONLY_SIMULATION` MUST NOT change selected branch, accepted decision, catalog order, deployment or financial truth. It MAY use authorized cached evidence and bounded read-only lookups; a paid provider call, sensitive-data egress, media generation or irreversible effect requires a separate current authorization and cost quote even if discussed in hypothetical prose. Promotion from preview to an actual branch is an explicit user command with revision-CAS and fresh policy/constraint check. Hypothetical scenarios inherit **no** side-effect grants from their parent.

User-visible previews SHALL distinguish calculated, estimated and unverified consequences. **A110:** user asks in Mini Chat “what if we buy a larger TV and change to a wall mount?”; the system compares provisional outcomes but leaves the chosen TV, paid work and installation plan untouched until the user explicitly adopts a feasible branch.

## 13CE. Cross-language evidence and technical translation fidelity (Audit 99)

**Gap:** Domain research may combine Thai, English and manufacturer-language documents. Simple translation can conflate product variants, invert safety qualifiers or turn a technical measurement into an approximate marketing description, even where per-claim provenance exists.

Each decision-critical translated claim SHALL preserve `original_text_locator`, `source_language`, `translation_language`, `translator_model_or_method_version`, `normalized_terms`, `technical_symbol_and_unit_map`, `ambiguity_flags` and the original source observation digest. Localization is a **derived view**, not independent corroboration. Entity matching SHALL NOT join products, engineering classifications or statutory terms solely on transliterated labels; exact model/variant codes and verified terminology take precedence. For safety/engineering/legal/high-value material ambiguity, return `TRANSLATION_REVIEW_REQUIRED` and seek a qualified bilingual or source-language review rather than quietly selecting one interpretation. The answer UI can show accessible translated summaries while an authorized inspector can trace back to the original excerpt without exposing restricted source text to unauthorized audiences.

**A111:** Thai seller translation describes a TV mounting weight differently from the English manufacturer manual; the system records the wording conflict and cannot silently certify a load-rating claim or count translations as two sources.

## 13CF. Field-observation oracle and measurement reliability (Audit 100)

**Gap:** Research may depend on real room measurements, photo-derived dimensions, customer interviews or a field test. Existing uncertainty rules do not explicitly characterize the measurement method or require physical observations to challenge attractive simulated artifacts.

A `FieldObservationReceipt` SHALL contain observer/role and scope, acquisition method (`USER_REPORTED | DOCUMENTED_MEASUREMENT | SENSOR | VISION_ESTIMATE | PROFESSIONAL_INSPECTION | CONTROLLED_EXPERIMENT`), device/instrument where relevant, calibration or scale reference, unit, precision/tolerance, environment/date, original artifact, permission/consent and applicable domain profile. A photorealistic image or reconstructed 3D scene MUST remain `GENERATED_ARTIFACT` unless supported by independent measurements; visual alignment alone cannot promote simulated geometry to measured truth. For decisions that require physical fit, expert inspection or real-world performance, a `FIELD_VALIDATION_REQUIRED` gate SHALL specify exactly what observation would resolve the uncertainty. Material disagreement between new field data and old manufacturer/catalog data triggers a targeted applicability/identity review, not silent overwrite of either record.

**A112:** an image model depicts a cabinet/TV as fitting, but a phone-based length estimate conflicts with a tape-measured site dimension; the deterministic fit check uses the validated measurement tolerance and withholds technical acceptance until the discrepancy is resolved.

## 13CG. Non-random search omissions and inaccessible-market bias (Audit 101)

**Gap:** SearchCoverageLedger discloses which sources were queried, but systematically inaccessible populations (login-only pricing, location-gated stock, trade suppliers, offline stores) can still distort a decision despite large URL counts.

The bounded research plan SHALL classify **coverage exclusions** by cause (`AUTHORIZATION_NOT_GRANTED | SOURCE_BLOCKED | GEO_UNAVAILABLE | API_QUOTA | PAYWALL | OFFLINE_CHANNEL | TIME_OR_BUDGET_CAP | UNSUPPORTED_LOCALE`) and indicate whether missingness plausibly changes the current decision. This is an extension of R8 `SearchCoverageLedger`, not a separate crawler authority. `NOT_OBSERVED` MUST NOT be converted to `NOT_AVAILABLE`, especially for local delivery, technical standards, safety evidence or market-price comparisons. A search result restricted to certain marketplaces SHALL label its search frame, permit the user to add a known supplier or licensed source, and may request a narrowly scoped authorized connector; it MUST NOT defeat a paywall or use an unrelated tenant's privileged access.

**A113:** all public-web offers are above budget, but regional shops require login; the UI reports “no matching observed public offer” and retains an unresolved local-channel opportunity rather than claiming no affordable seller exists.

## 13CH. Ask–research–experiment decision routing and user effort (Audit 102)

**Gap:** A smart Research Frontier can still spend excessive Credits or send users dozens of questions when a single user measurement, existing local document or cheap safe experiment would resolve a blocker faster than broad web research.

For each material unresolved question the 244 planner SHALL consider authorized routes `ASK_USER | REUSE_PROJECT_EVIDENCE | TARGETED_LOOKUP | MULTI_SOURCE_RESEARCH | SAFE_EXPERIMENT | EXPERT_ESCALATION`, with an explicit comparison of expected decision relevance, monetary cost, elapsed-time class, privacy/egress impact, user burden, evidence quality and residual uncertainty. The planner MUST reject impossible evidence routes and cannot treat model-generated data as a cheap substitute for required physical facts. User questioning SHOULD be batched only when genuinely independent and not turn project interaction into a mandatory exhaustive form; a high-impact single discriminating question takes precedence when appropriate. If none is sufficiently informative under limits, return an honest partial state with options to widen budget or change goal; no fabricated certainty.

This is an advisory planner over Spec 229/233 and existing approval/job authorities, not a second autonomous scheduler. **A114:** the only missing fit fact is a user's actual shelf depth; the planner asks one clear measurement question before launching 30 store searches or paying for new media generations.

## 13CI. Option exposure, preference anchoring and exploration diversity (Audit 103)

**Gap:** Repeatedly showing only variants of the first plausible design can create a feedback loop: the user reacts to a narrow option set, and the agent mistakes that reaction for a durable preference against alternatives the user never saw.

A provisional `OptionExposureRecord` SHALL distinguish `SHOWN`, `INSPECTED`, `EXPLICITLY_SELECTED`, `EXPLICITLY_REJECTED` and `NOT_PRESENTED`; non-exposure is **not** negative preference evidence. Before inferring persistent preferences or narrowing to one strategy family, the agent SHOULD use a bounded diversity probe across materially different mechanisms where feasible (not just cosmetic variations), unless the user explicitly constrains exploration. Explain when choices are narrowed by budget, safety, access or earlier user intent; let the user reset inferred preferences and request “show different approaches.” Evaluation MUST measure diversity relative to feasible constraints rather than maximizing irrelevant variety. Exposure telemetry SHALL obey existing consent, retention and privacy rules.

**A115:** five image-first render variants are rejected as too similar; the system does not infer the user dislikes all room designs, but offers a genuinely different layout/strategy (including optional 3D) under the same approved budget.

## 13CJ. Historical event-schema evolution and deterministic replay (Audit 104)

**Gap:** R8 protects event ordering and provider contract versions, yet a multiyear project's stored events can outlive the application schema. A replay service may misinterpret an old `ACCEPT` or `REVOKE` payload after a deployment without corrupting any individual event.

Event producers SHALL stamp durable project/research/approval events with `event_type`, `event_schema_version`, source-system revision, immutable event ID, causation/correlation identifiers and policy/goal epoch. Consumers SHALL use a reviewed version-compatibility matrix and **pure, idempotent, independently tested upcasters** or fail closed with a visible `REPLAY_SCHEMA_UNSUPPORTED` status. Old approvals, cancellations and tombstones must retain original effect/authority semantics; migration MUST NOT convert an informational research acceptance into product publication approval. Test replay from real permitted historical fixtures using a read-only clone before advancing production cursor; retain original event bytes/hash or an authorized minimal digest under retention policy. Maintain separate side-effect idempotency/fencing via Feature 186/195.

**A116:** restore a two-year-old project containing an obsolete accept-event schema and newer deletion tombstones; replay reconstructs the original scoped acceptance and respects the deletion without resurrecting retired permissions.

## 13CK. Coherent multi-artifact deliverable publication (Audit 105)

**Gap:** A proposal often consists of an image/video/3D view, shopping or bill-of-materials table and a narrative summary. Individually valid artifacts can still form an internally inconsistent published package when one component is regenerated or a quote expires during assembly.

A `DeliverableBundleManifest` SHALL pin `goal_revision`, `selected_branch_revision`, artifact content hashes/versions, `OutcomeContract` revision, decision evidence digest, audience/purpose rights, required component list, dynamic-input TTLs and an acceptance checklist. Package readiness uses an authorized **consistent cut** of Spec 233/Library/Spec 207/229 references: all required cross-component identity, units, price scope and rights invariants MUST pass before a single release/approval pointer is advanced via the existing Product/Library owner. This does not create a multi-store distributed transaction or replace Spec 217 publication; prepare immutable staged artifacts, revalidate policy/current versions before atomic pointer publication, then reconcile any partial external deliveries through the existing outbox. On any failed gate, keep the last approved bundle readable and expose the draft as `PARTIAL_NOT_PUBLISHED`.

**A117:** an approved room image depicts one sofa revision while its price sheet references a newly substituted size and the shipping quote expires; publication is blocked until the bundle matches, but the previously published proposal remains intact.

## 13CL. Per-child least privilege and credential brokerage (Audit 106)

**Gap:** A research parent may be authorized for several tools, but a delegated child crawler, OCR parser or hosted harness should not inherit every parent connector token or project file just because it belongs to the same goal.

Each child dispatch SHALL obtain a just-in-time task capability bound to `tenant/user/project`, specific permitted source/tool/action, least-necessary document-set, destination/egress profile, budget ceiling, risk class, expiration and current grant/policy epochs through Spec 220 and existing credential owners. Never serialize raw parent credentials into prompts, project memory, R2 deliverables or child completion payloads; provider sessions use short-lived appropriately scoped credentials where supported and isolated brokered calls otherwise. Any cross-scope access or tool escalation requires a new approval. Recheck and revoke child authority on branch cancellation, project permission change, tool switch and resume. Credential availability MUST NOT be inferred from cache hits or historical access receipts. Keep audit logs metadata-only and non-secret.

**A118:** public-source research child is compromised and requests an unrelated private Drive folder or paid merchant API using its parent's broad session; task-level authorization rejects both, with no token leakage and without stopping authorized sibling research.

## 13CM. Reproducible calculation and formula lineage (Audit 107)

**Gap:** A derived cost, capacity, fit or time calculation can be numerically plausible while using a stale formula, mixed rounding basis or evidence from different revisions. Existing numeric-uncertainty checks lack a self-contained calculation proof that can be recalculated without the original LLM.

Every decision-material numeric derivation SHALL emit a `DerivedCalculationReceipt` containing exact input claim IDs/revisions and applicability, calculator/domain Skill version, formula/algorithm digest, units, dimensional-analysis result, rounding and tax/currency conversion policies, uncertainty method, executable deterministic fixture and output bounds/status. Derivations that depend on unsuitable or missing inputs return `INPUT_INCOMPLETE`/`OUTSIDE_CERTIFIED_SCOPE` instead of a plausible scalar. Material formula or source changes invalidate only affected downstream calculations and associated decisions; approved versions remain historically reconstructable through existing artifact/evidence lineage. A deterministic engine, not LLM prose alone, verifies quantities, unit compatibility and arithmetic.

**A119:** a material quantity calculation originally used a supplier's nominal dimension, but field measurements reveal a tolerance and a new formula version changes wastage; system reconstructs old estimate, recalculates the active branch and flags budget impact without altering unrelated visual assets.

## 13CN. Outbound research-query minimization and inference privacy (Audit 108)

**Gap:** Even when retrieved documents remain tenant-scoped, the search **query itself** can disclose private product strategy, health/financial context, customer names or undisclosed requirements to search providers, websites or URLs. A permission check on downloaded content is not sufficient.

Before external `search`, `browse`, federated lookup or provider-assisted question expansion, run a `QueryDisclosurePreflight` under Spec 220: classify purpose and data sensitivity; remove or pseudonymize identifiers and unnecessary proprietary context; choose an authorized provider/local retrieval route; enforce scoped egress, retention/logging rules and user-approved disclosure ceiling; and record a redacted outbound query digest and authorization receipt. Browsing MUST strip private user context from URL query strings, referrers and telemetry unless explicitly needed and permitted. Do not place secret-bearing search strings in model traces, provider debug logs, citations, shareable artifact metadata or cost dashboards. If private context is essential to a third party and no grant exists, seek narrowly scoped approval or answer with local evidence and explicit unknowns.

**A120:** a Mini Chat asks about pricing for a confidential unreleased product using a customer name; public search receives generic non-identifying terms, the private project facts stay local, and an unauthorized provider cannot recover the sensitive query via stored logs or citations.

## 13CO. Deterministic competing-trigger arbitration and liveness (Audit 109)

**Gap:** Priority between an explicit user correction, safety stop, revoked grant, automatic stale-source refresh and an asynchronous provider completion was undefined. A replan cooldown alone does not stop old work from starving an urgent new goal.

At ingress, produce a versioned `TriggerArbitrationReceipt` containing event identity, effective user/goal/branch revisions, authorizing principal, trigger class, causation, priority, affected dependency set, active job refs and intended disposition. Apply precedence: **security revocation, hard safety stop and explicit cancellation first; then currently authorized user goal/constraint corrections; then required approval/expert intervention; then material evidence invalidation; then scheduled refresh; then optional exploration**. An authorized user request cannot bypass a safety or permission block. Deduplicate equivalent causes, debounce low-value refresh storms, preserve completed useful results and reject obsolete re-admission. Eligible noncritical work MUST have bounded fairness, deadline/aging and a visible deferred reason; an automatic child SHALL NOT repeatedly revive itself after its parent has been superseded. Admission and cancellation resolve through existing Spec 215/Feature 186/195 authority, not a parallel scheduler. **A121:** user changes goal while five provider callbacks and an old price watcher fire; safety/revocation and the latest approved edit win, old optional jobs do not reopen, and one valid pending research request is eventually served.

## 13CP. Cross-branch external-effect conflict fencing (Audit 110)

**Gap:** Per-job idempotency does not prevent two independently valid branches from simultaneously purchasing the same item, editing one production deployment or booking a shared external resource.

Before a noncommutative external effect, compute a policy-scoped `ExternalEffectConflictKey` from external account, resource, operation class, tenant/project entitlement and target revision. Obtain an exclusive, expiry-bound claim **through an existing canonical worker_jobs/transactional resource owner**, coupled to the existing job lease/fence and current approval; do not create another physical job ledger or global cross-tenant reservation without a real shared-account authorization basis. A competing branch receives `CONFLICT_REVIEW`, safe simulation or serialized continuation; it SHALL NOT perform duplicate paid effects. Crash, cancellation, uncertain upstream effect and late ACK retain the conflict claim until canonical financial/provider reconciliation or explicit authorized expiry. Source data retrieval and independent speculative branches remain parallel. **A122:** two branches target one checkout/deployment simultaneously; one authorized effect may proceed, the other is blocked or revised, and a lost provider ACK does not permit a duplicate effect after takeover.

## 13CQ. Acquisition-context provenance for dynamic sources (Audit 111)

**Gap:** A source URL plus digest cannot explain differences among JS-rendered, geo-dependent, login-specific, variant-selected or A/B tested pages; a current price may be unavailable to another authorized user under different acquisition conditions.

A permitted `AcquisitionContextReceipt` SHALL retain sanitized final URL/redirect origin, observed source/version digest, render/acquisition method, source market/locale, offered variant selector, pricing-tax basis, coarse authorized delivery geography where relevant, anonymous-vs-authenticated access class, consent/source-rights revision, retrieval time and source expiry. Preserve only necessary context; NEVER store cookies, credentials, exact personal addresses or restricted source bodies in a reusable cache receipt. Compare or deduplicate merchant offers only when their acquisition contexts and identities are compatible; otherwise show distinct context-bound observations and request targeted re-check. Respect current source access, robots/terms and user-authorized provider use. **A123:** one seller shows two prices to two markets with a JS-selected SKU; source receipts prevent false price conflict resolution, cross-user cache leakage and claims of a universally available offer.

## 13CR. Temporal joins across decision-critical evidence (Audit 112)

**Gap:** Dimensions, warranty, live inventory, freight and installation constraints can each have a valid observation but may never have been valid **at the same decision time**; claim TTL and coherent file bundles do not alone prove temporal compatibility.

A `DecisionTemporalJoin` SHALL pin the intended decision/effect time, effective source-product revision, each critical claim's observation/validity interval (or UNKNOWN), offer quote deadline, shipping destination applicability and the intersection result `COHERENT | CONDITIONAL | DISJOINT | UNKNOWN`. A hard or paid decision relying on disjoint/unknown intervals MUST refresh the affected volatile components or expose conditional ranges with a new approval, not present a stitched estimate as a current firm quote. Stable manufacturer dimensions may be reused only if exact product/variant revision is unchanged; historical reports remain historical. No LLM-generated timestamp substitutes for provider/source observation receipts. **A124:** a fresh offer is combined with expired freight and an old model variant; the checkout estimate is blocked or marked conditional until targeted refresh and matching time/variant proof.

## 13CS. Grounded source-span entailment and extraction verification (Audit 113)

**Gap:** An extractor can cite the correct manual while dropping "without stand," reversing "not compatible," converting the wrong unit or omitting a qualifier; a valid link and translation lineage are necessary but insufficient to support the asserted claim.

For decision-critical claims, record `SourceSpanEntailment` with exact permitted locator/digest, source-language wording or rights-safe semantic excerpt, normalized proposition, explicit subject/variant, polarity/negation, conditions, measurement basis, unit, extraction tool version, checker method and `SUPPORTED | CONTRADICTED | INSUFFICIENT | SOURCE_UNAVAILABLE`. A second LLM agreement from the same source is not independent corroboration. Prefer deterministic tables/unit/schema checks and controlled source-to-claim fixtures; require qualified human review where risk or domain ambiguity demands it. Extraction failure retains the claim as UNVERIFIED, cannot enter a verified hard constraint or an authoritative quote and records the relevant research frontier gap. **A125:** a manufacturer manual gives TV depth with and without a stand and excludes one mount type; the extractor's swapped values and lost negation must be caught despite a valid citation.

## 13CT. Robust feasibility under uncertainty and safety margins (Audit 114)

**Gap:** A fit or capacity test that compares only central estimates can approve a plan whose uncertainty bounds cross a hard safety or spatial constraint.

Each applicable domain validator SHALL issue a `ConstraintMarginProof` listing authoritative inputs and revisions, original precision, bounded/unknown uncertainties, conservative combination rule, required reserve margin, domain rule/evaluator revision and `VERIFIED_MARGIN | CONDITIONAL | FAIL | NEEDS_FIELD_CHECK`. Never upgrade model-estimated geometry or unknown material strength to measured certainty. If lower/upper bounds straddle a hard threshold, present the option as conditional and ask for a better field measurement, a larger reserve or a specialist review; do not invent a confidence percentage or quietly shrink tolerance. A margin certificate is only as authoritative as its permitted domain profile and does not replace qualified professional approval for structural or other regulated decisions. **A126:** nominal dimensions fit exactly but measurement tolerance violates the required clearance; the option cannot become technically verified until margin is established or verified alternatives are selected.

## 13CU. Expert-attestation input binding, authority and expiry (Audit 115)

**Gap:** An expert sign-off can be carried forward after measurements, local rules, materials or design assumptions change without any binding to the exact configuration reviewed.

A governed `ExpertAttestationBinding` SHALL reference the credential/role verification method and verified-at time, professional scope/jurisdiction where relevant, immutable input/evidence/geometry/calculation digests, constraints and caveats, permitted conclusion, signer receipt, expiry/review triggers and recontact/override process. Spec 220 and existing domain approval owners remain authoritative. A material input revision, expert credential suspension or expiry reopens only dependent assertions and prevents automatic reuse of the prior sign-off; no model or Agent can forge, renew or expand it. Keep confidential personal reviewer details access-controlled. **A127:** a professional approved the original wall-mount plan; after substrate and TV weight change, existing sign-off stays in historical audit but current installation approval becomes invalid until an eligible reassessment.

## 13CV. Cross-modal object identity across iterative edits (Audit 116)

**Gap:** Valid artifact-level anchors do not guarantee that a chair, machine part or character is the **same object** when moved between image edits, generated video, procedural 3D, hybrid composites and subsequent versions.

A `CrossModalObjectMap` SHALL reference the approved canonical project object/variant, owner and rights context, source asset revisions, each modality-specific region/track/frame/3D node anchor, identity confidence **as a qualitative verification state**, reviewer-confirmed mappings and a dependency/ambiguity graph. Vision-based guesses remain provisional. When a user says "replace this one" in Chat or Mini Chat, server-side authorization and exact selected artifact resolve the target; uncertain one-to-many/many-to-one mapping requires a visual disambiguation rather than mutating other objects. Conversion/re-render produces a fresh mapping diff and runs the existing OutcomeContract/InvariantDiff; it must never claim exact product or character continuity solely from visual similarity. **A128:** a sofa and similar loveseat appear in a photograph, video and 3D preview; selecting the loveseat in Mini Chat updates only its confirmed cross-modal instances, or asks which one when ambiguous.

## 13CW. Discriminating causal repair experiments (Audit 117)

**Gap:** Failure classification exists, but switching providers and broad new research can spend heavily while leaving unresolved whether the root cause was bad source evidence, incorrect preferences, insufficient references, unsuitable model or validator defects.

Before repeated expensive regeneration or strategy switching, create a bounded `DiagnosticExperimentPlan`: competing causal hypotheses; smallest authorized test expected to discriminate them; inputs deliberately held constant; one controlled intervention; independent observation oracle; expected outcomes, cost/time ceiling and stop/replan condition. Prefer existing artifacts, deterministic checks or a single user clarification over paid tests where they suffice. A non-controlled A/B output may suggest hypotheses but SHALL NOT establish causation; repeated inconclusive trials produce explicit unknowns/research debt, not arbitrary success scores. An approved hard-safety stop preempts experimentation. **A129:** repeated video shape drift may be due to an ambiguous reference or engine limitation; a controlled reference-strength test distinguishes the hypotheses within the approved budget and avoids switching three paid providers blindly.

## 13CX. Authorization-filtered multi-year project resumption brief (Audit 118)

**Gap:** Context reconstruction can restore old knowledge without telling a returning user which decisions, teammate edits, stale facts and unapproved alternatives have changed **since their own last acknowledged view**.

Feature 196/Spec 240 SHALL offer a versioned `ResumptionBrief` generated from Spec 233 canonical state, user-specific last acknowledged event watermark, current access rights and exact source/artifact revisions. Include last accepted goal/branch/deliverable, material changes by authorized actor class, new/expired evidence, unresolved research debt, currently blocked/external effects and a bounded shortlist of next actions. Never infer acceptance from a page view, raw chat playback, background completion or elapsed time; require explicit approval for renewed spend or selected branch change. Redact revoked project/team materials before context composition; ensure the brief can reconstruct under model/provider retirement and R2 archive rehydration. **A130:** user returns after six months and teammate modified constraints, quotes expired and old generation finished late; brief distinguishes historic accepted work, current proposal and unauthorized hidden team details without silently resuming spend.

## 13CY. Command-level replay collision and authorization (Audit 119)

**Gap:** Idempotency keys without a defined *payload and privilege identity* can accidentally conflate two different offline Mini Chat commands or allow an old authorized request to be replayed after revocation.

A `CommandReplayContract` SHALL bind caller/tenant/project/action to the normalized immutable payload digest, goal/branch/artifact revisions, policy epoch, approval/budget receipt and a finite retry window. Replaying the same key and digest returns only a currently authorized projection of the canonical prior receipt; the same key with a different digest returns `IDEMPOTENCY_CONFLICT`, not a second execution or the first command's unrelated success. Recheck current read permission on receipt access and current approval before new side effects; use existing Feature 196 command ingress, PostgreSQL outbox and worker_jobs idempotency/fencing. Ambiguous upstream effects remain in provider reconciliation, never assumed not to have happened. **A131:** offline client sends two distinct "replace cabinet" requests with a reused key while grants change; one command is admitted, the other conflicts, and the revoked client receives no private prior receipt.

## 13CZ. Downstream correction and consumer acknowledgement (Audit 120)

**Gap:** Issuing an internal correction notice does not establish that a published proposal, partner integration or previously downloaded bundle has stopped circulating with retracted evidence or revoked rights.

A `DownstreamCorrectionReceipt` SHALL identify the exact affected exported artifact/bundle revision, permitted destination/channel, original delivery receipt when available, detected change, replacement/correction reference, user/owner approval, notification attempts, acceptance/acknowledgement state and unresolved remote distribution risk. Reuse existing Library/Product release, Spec 228/238 notification and Spec 220 permission authorities; do not introduce a second publication or alert service. For unsupported recipients, mark `NOT_RECALLABLE` and give owners a manual remediation path; never promise universal recall or disclose confidential source details in notice payloads. Rights and privacy revocation block *new* unauthorized distributions independently of whether external consumers acknowledge old copies. **A132:** a source retracts a safety claim after two external proposals and a shared Mini App export; the system records which recipients acknowledged corrections, prevents new unsafe release and keeps unconfirmed remote copies as explicit residual risk.

## 13DA. Minimal conflicting constraints and constructive relaxation (Audit 121)

**Gap:** A collection of individually reasonable hard and soft requirements can be jointly impossible. Current feasibility checks reject an option but do not expose a compact explanation of WHICH constraints conflict or generate controlled relaxations.

A `ConstraintConflictExplanation` SHALL derive the smallest practically useful conflicting subset, or return `UNSAT_CORE_UNAVAILABLE` with a transparent limitation when the domain solver cannot compute one. Each constraint retains its owner, current revision, `HARD_SAFETY | HARD_USER | SOFT | ASSUMPTION`, unit, evidence and waivability. The resolver SHALL generate distinct candidate repairs (change an input, substitute a component, change topology/layout, relax an explicitly waivable preference, or request better measurement) and estimate which extra evidence each requires. It MUST NOT silently weaken professional/safety constraints or promote AI assumptions into user-approved hard limits. The interface presents the conflicting set, minimal user decision and side effects; simulation-only repairs never mutate the active goal without a new revision. When no feasible route is established, preserve `INFEASIBLE_UNDER_CURRENT_VERIFIED_CONSTRAINTS` rather than claim globally impossible.

**A133:** Cabinet, TV, room clearance and spending cap cannot all hold; show the blocking subset and at least two authorized repairs without relaxing safety or auto-changing the goal.

## 13DB. End-to-end multicomponent interface compatibility (Audit 122)

**Gap:** A TV, bracket, anchor, wall and installer can each look suitable individually, while the assembled configuration fails; the same issue occurs with software dependency chains and mixed media pipelines. Entity joins and pairwise fit checks alone do not prove system-level compatibility.

A `CompositionCompatibilityProof` SHALL enumerate participating components and versions, typed interface ports, operating environment, n-ary constraints, authoritative compatibility evidence, adapter/verifier revision, allowed substitutions and unresolved interfaces. For technical or physical outputs, test the assembled configuration (or issue `UNVERIFIED_COMPOSITION`) rather than infer transitive compatibility from separate component claims. Include dependencies such as accessories, power, clearance, installation method, license/runtime API and data locality as applicable. A changed component invalidates affected interface proofs and downstream conclusions without erasing unrelated valid evidence. Safety-relevant composition MUST use an approved specialist/domain rule and qualified review where applicable; an LLM-generated compatibility sentence cannot authorize installation, deployment or purchase.

**A134:** TV and wall bracket both appear compatible by VESA size but bolt depth or wall substrate invalidates the assembled installation; alternative bracket and cabinet paths remain open.

## 13DC. Condition-triggered contingency branches without auto-commit (Audit 123)

**Gap:** The existing Branch Portfolio can propose alternatives, but lacks a single durable conditional plan that explains when to switch, which facts require revalidation and when a contingency is too stale to execute. A user can be shown an attractive fallback without understanding its trigger or cost.

A versioned `ContingentSolutionPlan` MAY connect alternative branches through explicit `IF observed_condition THEN propose_branch` edges. It SHALL pin the current goal/permission/assumption snapshot, measurable trigger and authoritative observation source, execution readiness, decision deadline, option dependencies, estimated incremental and sunk cost, revalidation set and authorization requirement for each edge. Trigger detection may generate a recommendation or bounded pre-approved read-only research; it MUST NOT automatically buy, deploy, publish, physically act or change an accepted goal unless an independent exact-scope approval/policy expressly authorizes that effect at execution time. Triggered fallbacks re-run current availability, source-rights, expert and temporal-join checks before admission. Loops, unreachable triggers, overlapping contradictory transitions and stale branch resurrection are rejected by existing planner/fencing guards.

**A135:** Supplier stock disappears after concept approval; conditional Plan B proposes a certified substitute and refreshed shipping quote while preserving the previously accepted aesthetic goal and requiring approval for extra spend.

## 13DD. Coordinate reference frames and dimension provenance across outputs (Audit 124)

**Gap:** Source measurements, AI image drafts, video crops, 2D floor plans and optional 3D scenes can share object identities but use incompatible coordinate origins, camera projection or dimension basis; a visual annotation may be misread as metric truth.

A `SpatialReferenceFrameReceipt` SHALL label each applicable artifact with `PIXEL_UNCALIBRATED | SCALE_REFERENCED_2D | MEASURED_2D | SCENE_3D_APPROXIMATE | MEASURED_3D | ENGINEERING_VERIFIED` as supported by real evidence. Store source units, coordinate handedness/origin/axes, scale/calibration method, camera/crop/projective transform when known, geometric basis (external size versus usable clearance; with/without accessories), transform revision and uncertainty/unknown fields. Any metric computation across frames requires a validated transform or a fresh field measurement; uncalibrated Image-to-Image dimensions are advisory, regardless of prompt detail or photorealism. Video/reference edits and 3D conversions keep object lineage but MUST NOT imply measured geometry from a generative projection. This is a conditional spatial profile: projects with no spatial data are unaffected, and measured 2D can support validated calculations without mandatory 3D.

**A136:** A resized phone photo makes a cabinet appear wider than measured plan; pixel-to-metre conversion is unavailable, so neither image nor derived video falsely certifies a TV fit; optional 3D stays available.

## 13DE. Negative-result evidence expiry and reopening (Audit 125)

**Gap:** No-match, unavailable or no-alternative findings may be cached and silently treated as durable facts even after sellers add stock, a provider launches a feature or search-access conditions change. Existing claim TTL does not explicitly cover negative-result cache scopes.

A `NegativeFindingReceipt` SHALL record the exact question and canonical entity/variant, authorized SearchCoverageLedger snapshot, excluded source classes, acquisition context, observed search window, normalized query/filter digest, reason for no result, and separate `negative_cache_expiry` or explicit `NO_CACHE`. Its truth is `NOT_FOUND_IN_CHECKED_SCOPE`, NEVER absolute nonexistence. Material new sources, catalog/connector changes, known stock arrivals, removed access restrictions, revised user constraints or expiry reopen dependent questions without indiscriminate refetch. Critical negative findings used to reject all branches REQUIRE an independently scoped second strategy or user-visible conditional status before durable closure. Revoked/forbidden source bodies remain inaccessible even if old receipts are retained under lawful audit policy.

**A137:** Previously absent product becomes available through a newly authorized supplier; an expired no-match receipt no longer suppresses search and a formerly rejected branch can be re-evaluated without being auto-selected.

## 13DF. Authorized human-source clarification with verified response lineage (Audit 126)

**Gap:** Some decision-critical specs, delivery terms or installation rules exist only with a manufacturer, supplier or named specialist and cannot be confirmed by crawling more webpages. An agent might fabricate contact, assert that someone confirmed a fact, or send project secrets to an unapproved recipient.

When authorized connectors are available, a `ClarificationRequest` SHALL carry the unresolved exact question, minimum necessary context, approved contact identity/channel, consent/authority, sensitive-data redaction plan, scope-limited budget and deadline; communication is a separately approved external effect governed by existing connectors, Spec 220 and worker_jobs/Spec 207 where applicable. A draft message, queued send and verified delivery/response are DISTINCT statuses. Inbound responses SHALL bind to a verifiable channel/thread/sender or remain `UNVERIFIED_EXTERNAL_ASSERTION`; attachments pass the same rights, taint and source-span checks as other research sources. No simulated response, inferred reply or unconfigured communication adapter may close the question. On no reply, show alternate available research and a truthful unresolved status; never loop indefinite follow-ups.

**A138:** Manual omits mounting load; supplier contact is authorized but does not reply. Agent must preserve PENDING/UNKNOWN, cannot claim confirmation or send private measurements without approved disclosure.

## 13DG. Human attention budget and conflict-safe approval batching (Audit 127)

**Gap:** Adaptive workflows can overwhelm users with many small clarification, source-access and spending prompts, or bury one consequential decision inside a bulk approval that also contains harmless research tasks. Approval latency becomes an unmeasured project bottleneck.

An `AttentionBudgetPlan` SHOULD group related, reversible low-risk questions into a coherent review card and propose defaults only as NONCOMMITTED suggestions. Batch receipts SHALL bind each independently authorized item to exact goal/branch/evidence/policy/cost revisions, allow partial accept/reject and support stale-item removal before commit. Safety-critical, high-cost, irreversible, delegated-permission and confidential-egress decisions MUST remain individually conspicuous with clear effect-specific confirmation under canonical Spec 220/207/Feature 196 approval owners. Notification rate limits may defer optional prompts but never suppress a required safety stop or misinterpret silence as consent. UI includes mobile/Mini Chat accessible summary, source drilldown, and resume-without-pressure semantics; no new notification/approval authority is created.

**A139:** Thirty research subagents request twelve minor choices and one purchase; a bounded accessible review batches optional questions but isolates the purchase and keeps unanswered items open without consent.

## 13DH. Observed post-delivery outcome vs subjective acceptance (Audit 128)

**Gap:** An approved picture, blueprint or prototype may later fail when installed, used, shipped or operated. Current acceptance evidence is tied to the reviewed deliverable but not to the real-world outcome, encouraging false “solution achieved” claims and hiding new research triggers.

A consented `ObservedOutcomeReceipt` SHALL distinguish `ARTIFACT_ACCEPTED`, `IMPLEMENTED`, `FIELD_OBSERVED`, `OUTCOME_CONFIRMED`, `OUTCOME_FAILED` and `OUTCOME_NOT_OBSERVABLE`. Capture exact accepted artifact and plan revision, where permissible the actual implementation configuration, observation method, observer/authority, relevant environment/date, goal-specific metric or qualitative feedback and uncertainty. Never infer field success from user satisfaction with a concept image or a provider's task-completed status. On a documented outcome mismatch, preserve the approved historical artifact and open a scoped diagnostic Research Frontier question with impacted dependencies; no uncontrolled automatic purchasing or redeployment. Cross-project strategy learning remains opt-in/redacted under Spec 222/220; project owner may contest external outcome data.

**A140:** Client approves a realistic layout image, but purchased cabinet arrives with unusable internal width; real-world outcome is recorded as failed, not as falsification of the historic approval; targeted alternative research reopens.

## 13DI. Time-window and lead-time feasibility across solution components (Audit 129)

**Gap:** A technically viable branch may be impossible by the user’s deadline due to supplier lead time, installation bookings, permit waits, render queue, harness execution or dependent approvals. A price comparison alone cannot establish deliverability.

A conditional `TemporalFeasibilityPlan` SHALL model precedence edges, optimistic/realistic/worst-case or supported intervals, business-day/calendar basis, target timezone, shipping/stock observation validity, approval/expert windows, dependency slack and the time-critical unresolved question. Explain feasibility as `ON_TIME_VERIFIED | CONDITIONAL | LATE | UNKNOWN`, grounded in source/provider receipts and explicit assumptions. Do not invent supplier dispatch guarantees or infer current booking availability from generic published lead times. When lead-time uncertainty can change the chosen branch, schedule permitted targeted verification or offer distinct feasible alternatives, including reusing existing assets or rescoping deliverables. Existing Spec 215/worker_jobs and approved scheduling/alerts own physical timing; this is a research/planning projection, not a scheduler.

**A141:** Cheapest supplier cannot deliver before the event date while a dearer local vendor may; system compares price against time risk and refreshes unverified local availability before promising on-time delivery.

## 13DJ. Evaluation holdout integrity and adaptive benchmark leakage (Audit 130)

**Gap:** Iterative agent/model/skill tuning can memorize prior benchmark answers or optimize to one LLM judge. Even a nominally independent evaluator and paired budget-controlled trials cannot detect data leakage if prompts, ground truth and challenge cases are reused during development.

A `ResearchEvaluationIntegrityProfile` SHALL separate editable development fixtures, frozen validation fixtures and access-restricted rotating challenge sets with distinct provenance, exposure records, task/tenant/locale strata, source snapshots and evaluator versions. Neither generator nor strategy-search policy may tune on hidden challenge answers or self-mark exposure-free cases; suspected contamination requires quarantine and replacement of the affected set. Predeclare admissible success metrics, cost/quality tradeoffs and confidence rules before comparing variants; report sample counts, invalid cases and domain limitations. Test evaluator disagreement using deterministic/manual or independent specialist oracles where feasible, and require human-reviewed promotion for consequential or tenant-wide defaults under Spec 221/222/231. Shadow/canary regression tracks real-world outcomes separately from offline scores.

**A142:** A research policy appears to improve after repeated exposure to a static benchmark but fails fresh unseen regional/manual variants; leakage flags block autonomous promotion despite headline score improvement.

## 13DK. Third-party feedback provenance without delegated decision authority (Audit 131)

**Gap:** A screenshot, forwarded chat, supplier message, consultant suggestion or client comment may contain useful counterevidence but can be mistaken for an authenticated owner instruction or expert approval. Existing stakeholder preference rules cover known actors but not provenance when advice is imported as content.

An `ExternalFeedbackReceipt` SHALL record ingress channel, claimed and independently authenticated origin (or `UNKNOWN_ORIGIN`), authorized importing principal, original context/permissions, quoted-versus-instruction classification, linked artifact/branch and asserted scope. Imported suggestions MAY open read-only hypothesis research, conflict review or draft alternatives but SHALL NOT revise an owner’s hard goal, grant external access, override a professional stop, approve spend or trigger deployment until a currently authorized principal confirms an exact intent at the canonical command boundary. If quoted feedback contains a factual claim, promote it only via ordinary independent source/entailment review, not because it appears in a message from a respected person. Tainted content remains non-authoritative instructions through Chat, Mini Chat and external harness prompts.

**A143:** Project owner forwards “the contractor said to remove the wall” screenshot; agent researches the claim but neither treats it as verified engineering approval nor changes the approved build plan without owner and expert validation.

## 13DL. Boolean evidence dependency logic and minimal repair (Audit 132)

**Gap:** Simple invalidation DAGs can over-retract a conclusion after losing one of several truly independent supporting sources, or under-retract it when one mandatory premise fails. Existing dependence tracking does not specify AND-versus-OR support or source-correlation semantics.

A versioned `EvidenceSupportExpression` SHALL represent decision-critical derived findings with explicit `ALL_OF` mandatory premises, `ANY_OF` independently sufficient alternatives, exception/negation qualifiers and each source-origin independence group; never count syndicated duplicates as alternate proof. On retraction, expiry, rights revocation or a conflicting correction, a deterministic evaluator SHALL recompute impacted support expressions under the current goal/subject/time/purpose scope and return `SUPPORTED | CONDITIONAL | CONFLICTED | UNSUPPORTED | UNDISCLOSABLE`, with an exact minimal missing-premise/research-repair set when feasible. Separate truth-state from disclosure permission: a private-source revocation may make an answer unshareable even if the original authorized user still has separate lawful public evidence. Preserve human corrections and exact historical decision manifests; do not unconditionally revoke unaffected branches supported by independent authorized paths. Unknown dependency operators fail closed for high-risk uses.

**A144:** One of two genuinely independent manuals is withdrawn, while a mandatory installation tolerance also expires; alternative support can preserve general product facts but installation feasibility becomes conditional pending new tolerance evidence.

## 13DM. Source identity spoofing and counterpart authenticity (Audit 133)

**Gap:** A copied manufacturer site and an unknown marketplace seller both claim to be the official brand; separate content agreement from operator identity and purchase eligibility.

A `SupplierIdentityReceipt` SHALL record the claimed manufacturer/merchant identity, observed domain/organization identifiers, independently checked official or authorized-channel evidence where available, permitted account/payment destination, jurisdiction, observation timestamp and explicit `VERIFIED_CHANNEL | UNVERIFIED_SELLER | CONFLICTED | UNKNOWN` status. A search rank, TLS certificate, copied manual, logo, review count or matching SKU is not sufficient proof of authorized seller identity. Catalog matching (§13BR) and content entailment (§13CS) are separate from source/operator authenticity. Where channel identity is unresolved, the system MAY present a research-only price as unverified but MUST NOT assert manufacturer authorization, warranty eligibility, guaranteed stock or safe payment. Before an irreversible purchase, independently verify applicable counterpart, offer and channel using permitted provider/merchant mechanisms and existing approval policies; any unavailable mechanism yields an explicit unresolved condition, not invented verification.

**A145:** Fake manufacturer clone copies a correct manual and posts the lowest price; Agent keeps the technical manual claim independent from unverified merchant legitimacy and blocks any authoritative purchase/warranty assertion.

## 13DN. Complex-document table, footnote and unit binding (Audit 134)

**Gap:** A PDF manual table has similar variants in adjacent columns; naive span citation pairs dimensions with the wrong variant or omits a safety footnote.

For a claim derived from a table, form, diagram, specification sheet or OCR-processed scan, a `StructuredExtractionProof` SHALL bind document revision, page and bounding locator or structural path, row/column headers, variant key, unit scope, footnote/exclusion links, parser/OCR version and extraction confidence. Critical values MUST NOT be marked CORROBORATED merely because a text span contains the same number; the applicable header, negation, footnotes and original unit require independent deterministic or qualified human validation. Unreadable scans, merged cells and conflicting document revisions remain `UNVERIFIED` with a bounded request for better evidence, without fabricating table structure. Raw acquisition rights and source retention continue to be enforced by Specs 220/229 and §13Y; this receipt is an additive claim-verification projection, not a second document parser authority.

**A146:** A scanned manual places 30 kg and 15 kg under adjacent mounting modes, with a footnote excluding masonry anchors; extraction must preserve the correct column, mode and exclusion or refuse technical certification.

## 13DO. Search representativeness versus apparent coverage (Audit 135)

**Gap:** Top-ranked online offers can dominate research despite region-specific offline channels and sponsor-biased crawler access; visited URL counts alone do not establish market coverage.

When research purports to compare a market, provider ecosystem or technical solution space, a `SearchSamplingDisclosure` SHALL define eligible source strata (e.g., producer, authorized retailer, marketplace, local/offline, standards and independent user evidence), sampled and unsampled strata, discovery method, access restrictions, rank/sponsor bias, language and region, deduplication method, and remaining decision-critical coverage gaps. Sampling or adaptive expansion SHALL be budget-bounded and based on new evidence yield; non-random search failures and inaccessible channels are not evidence of absence. Estimates of completeness, lowest price, leading vendor or universality are forbidden unless an appropriate independently verified enumeration supports them. This is an extension of §13BQ `SearchCoverageLedger`, not a competing crawl ledger; report a bounded comparison and target further research at the strata that could change the decision.

**A147:** Ten shopping results all come from one marketplace while regional dealers are unsearched; result identifies the missing channel and requests bounded follow-up instead of claiming the lowest nationwide price.

## 13DP. Interval-aware multi-objective option presentation (Audit 136)

**Gap:** A recommendation can dominate on midpoint price while losing under shipping, uncertainty, deadline and user-important qualitative preferences.

A `RobustOptionFrontier` SHALL use only verified/conditional candidate branches, compatible goal revisions, normalized units and scoped landed-cost/time/quality/safety criteria. Display each trade-off, assumption and uncertainty interval separately; use interval or scenario-based dominance only where the domain has defensible comparability. An uncertain or infeasible candidate MUST NOT be called globally optimal, and a soft-preference weighting proposed by the Agent requires explicit user confirmation before it can drive a committed selection. Retain materially different non-dominated alternatives and existing baseline, mark `INCOMPARABLE` or `INSUFFICIENT_EVIDENCE` where appropriate, and direct further research to the missing facts most likely to change the frontier. Existing §13BL sensitivity and §13G decision UX remain owners of their respective mechanics; this is their comparison output contract.

**A148:** A fast local supplier is more expensive but reliable, while a cheaper remote supplier has uncertain delivery; system exposes the trade-off and does not auto-select by mean price.

## 13DQ. Goal pivot changes domain and risk class (Audit 137)

**Gap:** An image concept is approved for inspiration and later reused as a purchase or engineering plan without rerunning stricter validation after the goal changes.

Every material goal pivot SHALL emit `IntentRiskTransitionReceipt` recording the old/new intended use and audience, policy/risk profiles, previously verified claims and their allowed use, newly mandatory validation/expert/rights gates, consent epoch and pending side effects. A change from illustration to purchasing, physical installation, regulated advice, external publication or deployed code MUST invalidate any inferred permission to reuse earlier concept-level approvals for the new risk class. Existing Spec 220/207/221 and exact existing effect authorities retain policy and approval ownership; §13AW/§13AX expert/pre-effect gates are re-run on the new goal/branch revision. Lower-risk new usage MAY reuse source research with explicit applicability checks, but neither a photorealistic image nor prior user satisfaction creates technical approval.

**A149:** User turns a previously approved decorative mockup into a wall-mounted installation plan; current branch becomes conditional until site measurement, specialist checks and new effect-scoped approvals complete.

## 13DR. Shared sub-research across competing solution branches (Audit 138)

**Gap:** Two branches request the same expensive manual lookup; duplicate paid calls waste budget, but canceling one branch can incorrectly delete the other branch’s authorized evidence.

Identical authorized sub-research MAY share an immutable result through `SharedResearchDependencyLease` only after verifying subject/variant, question, goal-relevant assumptions, source scope, tenant and permission epoch, rights, TTL, policy and budget attribution. A shared task has distinct consumer references and independent branch/goal applicability checks. Canceling, superseding or revoking one consumer MUST detach its grants and derivative views without canceling an active authorized consumer or retaining access after revocation. The existing `worker_jobs` job identity, existing source cache and Spec 207 financial receipts remain canonical; this contract coordinates references and quoteable reuse, not a second scheduler, billing ledger or cross-tenant shared-memory store. If source rights or grants differ, fork the acquisition or return `SHARING_NOT_PERMITTED`.

**A150:** Two branches share one authorized manual parse; user cancels branch A while branch B still needs the result. B proceeds once, A loses its derivative access, and cost is attributed by actual authorized receipts.

## 13DS. Tool and provider identity at execution time (Audit 139)

**Gap:** A research provider/tool advertises a new capability or schema after registration, and a silently substituted adapter could gain wider access or return incompatible results.

Before a tool, Skill, managed harness or media/3D adapter is admitted, a `CapabilitySupplyChainReceipt` SHALL pin approved provider identity, installation/source provenance, contract/schema digest, effective version, declared permissions/egress, runtime locality, policy snapshot, capability-test outcome and approved update path. Distinguish trusted operator-approved manifests from model-generated tool descriptions or untrusted remote schema changes. On drift or failed attestation, park affected jobs, prohibit widened grants/secret forwarding and permit only an independently authorized capability-equivalent fallback under §13BK; unaffected project branches remain available. Do not auto-install new tools/providers or infer safety from a vendor’s self-asserted availability. Existing registry, Spec 199/200/221/242/243 and Spec 220 are authoritative; this is a preflight attestation/revalidation artifact.

**A151:** An external harness changes its declared file-system scope after an update; execution is blocked and the old allowed read-only research path remains available without granting the new scope.

## 13DT. Post-cancel provider billing and unknown effect settlement (Audit 140)

**Gap:** A paid provider charges after a task is canceled or reports an ambiguous callback, while the UI prematurely shows all reserved credits refunded or retries the external effect.

An `ExternalCostReconciliationReceipt` SHALL correlate existing Spec 207 reserve/capture/release ledger entries and `worker_jobs` idempotency/attempt receipts with provider invoice/event identifiers, usage window, currency and conversion policy, estimated versus metered charges, cancellations, disputes and unresolved upstream effects. `CANCELLED` for the user-facing task does not imply `REFUNDED` or `UPSTREAM_ABORT_CONFIRMED`. Unknown upstream outcome MUST block unsafe duplicate effect retries and show a provisional cost or `SETTLEMENT_PENDING` until authorized provider reconciliation/manual review completes. A later bill adjusts only through canonical financial owner with auditable explanation; no new wallet, off-ledger debit or fabricated guaranteed refund is permitted. Fee disputes and SLA windows remain provider- and policy-specific.

**A152:** Video provider completes charge after cancellation but callback is lost; user sees canceled task and pending charge separately, retry cannot double-purchase, and final ledger reconciles the later invoice.

## 13DU. Targeted partial-edit preservation for visual and nonvisual artifacts (Audit 141)

**Gap:** A user asks to change one chair in an accepted generated image, but whole-scene regeneration alters floor color, room shape, 3D geometry or other accepted components.

An `ArtifactPatchPreservationContract` SHALL pin the accepted baseline and intended edit targets using authorized object/region/frame/3D-node or structured-document locators, permitted change scope, protected invariants, acceptable collateral-difference tolerance per modality, input references and human review status. The planner chooses local edit/compositing when feasible and MUST produce a before/after `PatchImpactDiff` using §13CV cross-modal object identities and §13CB OutcomeContract. If a generative provider cannot preserve protected regions or exact product identity reliably, return `PREVIEW_WITH_REGRESSION` or propose alternate patch strategies (layered 2D, image regeneration with disclosure, optional 3D/object editing); never overwrite an accepted artifact in place. New versions and rejected previews are stored with rights and budget controls, and only explicitly approved patches advance an accepted deliverable.

**A153:** Only the chair should change in a selected image; returned edit recolors the approved floor and moves the door, so system flags the regression and retains the accepted version while offering local compositing or optional 3D.

## 13DV. Must-include evidence assembly before consequential decisions (Audit 142)

**Gap:** A long-lived project has material contradictory findings stored correctly, but retrieval/context compression omits one at decision time and the LLM issues overconfident advice.

A `DecisionContextCompletenessProof` SHALL identify the required claim/constraint set for the current decision from existing Spec 233 dependency graph and §13BS material evidence dispositions, record retrieved exact authorized evidence IDs/versions and counterevidence, policy-limited exclusions, context-budget truncations and effective snapshot watermark. Retrieval relevance scores alone MUST NOT silently evict mandatory safety/financial/rights premises, protected user corrections or unresolved critical conflicts. If the full critical set cannot fit or be legally accessed, stage a bounded multi-step verification using exact references, request clarification, or return `DECISION_CONTEXT_INCOMPLETE` and block consequential action; never fill gaps from a model’s memory. Spec 229 owns retrieval and ACL; this is the read-only decision assembly/gate for feature 196/Spec 233 outputs.

**A154:** A prior expert warning about a load limit is old and ranks below recent marketing pages; proposed installation cannot become verified until the required warning is retrieved or explicitly reported inaccessible.

## 13DW. Disputed user/expert corrections without silent truth promotion (Audit 143)

**Gap:** A protected human correction conflicts with instrumented observation or a later qualified reviewer; always trusting latest human edit can cement an incorrect physical or technical fact.

A `CorrectionAdjudicationRecord` SHALL retain conflicting human/expert assertions as distinct attributed, immutable revisions with actor authority, consent, input scope, evidence/measurement method, timestamp, rationale summary (not private chain-of-thought) and current applicability. Existing §13AD protects human edits from silent model overwrite, but does not declare each edit objective truth. When a material conflict appears, mark the affected decision `DISPUTED` or `REQUIRES_FIELD_VERIFICATION`, route to authorized independent measurement/expert review as risk demands, and suspend unsafe commits. No collaborator’s advice or model majority automatically overrides the authorized owner’s goals; no owner preference overrides verified safety constraints. Resolve via explicit signed correction/decision receipt and selective dependency re-evaluation, preserving the dispute trail and privacy scope.

**A155:** User manually corrects a beam dimension, while a later survey report disagrees; system preserves both sources and requests reconciled measurement rather than overwriting either or approving the build.

## 13DX. Provider-wide quality/security incident blast-radius containment (Audit 144)

**Gap:** A provider update introduces systematic corrupt dimensions or rights problems across many projects; per-project stale-source checks are too slow and can leak affected outputs into new deliveries.

An authorized operator incident event MAY generate `ProviderIncidentImpactManifest` from provider/model/adapter version, schema/prompt/tool revision, source/asset lineage, time window and tenant-scoped affected dependency sets. The system SHALL quarantine new consequential publication/effect admissions for affected output classes, mark existing deliverables `REVIEW_REQUIRED` without retroactively falsifying historic acceptance, and enqueue bounded per-project revalidation and scoped downstream notices when warranted. All fan-out preserves Spec 220 boundaries; operator dashboards see only policy-eligible impact counts and tenant owners see only their own affected artifacts. Integrate existing Spec 228/238 incident-alert/release policy, Spec 229 source invalidation, Spec 233 project records and `worker_jobs` repair tasks; never create a new cross-tenant private-data aggregator or treat an unverified rumor as a proven incident. Recovery requires verified fixed provider/adapter profile or certified substitute plus relevant regression fixtures before canary re-admission.

**A156:** A media provider silently changes a model and begins altering product labels in approved ads; affected versions are identified, new unsafe releases paused, each tenant sees only its impacted assets and validated re-generation can resume by canary.

## 13DY. Typed command parity across Chat, Mini Chat and runtime (Audit 145)

**Gap:** Typed FeedbackIntent omits What-if, Resume, Reopen, Select Branch and certain explicit effect intents despite required UI and lifecycle behavior.

The additive `ResearchCommandEnvelope` SHALL use a versioned discriminated intent (`ASK`, `DEEPEN_RESEARCH`, `WHAT_IF`, `CORRECT_FACT`, `REJECT_RESULT`, `CHANGE_PREFERENCE`, `CHANGE_CONSTRAINT`, `CHANGE_GOAL`, `TRY_ALTERNATIVE`, `COMPARE`, `MERGE_BRANCHES`, `SELECT_BRANCH`, `ACCEPT_PHASE`, `PAUSE`, `RESUME`, `REOPEN`, `REQUEST_EFFECT`) with intent-specific, schema-validated payloads. Map legacy `ACCEPT` to `ACCEPT_PHASE` only when review scope is explicit; unknown/ambiguous variants yield a clarification draft, never the closest mutating command. Pin principal, project, active goal/branch/artifact revisions, policy epoch, idempotency key, origin surface and proposed cost class. `WHAT_IF` and `ASK` cannot acquire grants for mutations or paid generation. Feature 196/226 keeps command authority; this type is a proposed 244 extension, not a second chatbot API.

**A157:** A Chat message suggesting a hypothetical new layout must not mutate the selected branch, while Resume must be accepted as a distinct authorized action.

## 13DZ. Explicit research/branch transition invariants (Audit 146)

**Gap:** ResearchStatus and BranchStatus examples lack explicit pause/completion semantics and normative illegal-transition behavior; different adapters may revive terminated work.

Define one versioned transition table for `ResearchTask` and `SolutionBranch` under the existing workflow/job owners. Research status SHALL distinguish `PAUSED`, `PARTIAL_READY`, `COMPLETED`, `FAILED` and `CANCELLED` from `MERGED` (knowledge publication), and SHALL record immutable terminal outcome separately from each provider attempt. Every state-changing command requires an expected aggregate revision, actor authorization, current goal/policy epoch, idempotency key and permitted edge; invalid, duplicate and late transitions return a typed rejection without running effects. `PAUSE` stops admitting new child work, preserves approved outstanding leases per user policy and is not equivalent to cancel; `RESUME` requires fresh scope/budget/freshness checks. If original storage uses different canonical status names, provide tested upcasters instead of creating parallel authority.

**A158:** Two simultaneous Pause/Resume callbacks and a late completed provider result attempt to advance a superseded research task.

## 13EA. Ambiguous free-form Chat project resolution (Audit 147)

**Gap:** An ordinary Chat may infer the wrong project from ambiguous context and silently search another project, while Mini Chat is explicitly scoped.

General Chat SHALL issue a `ProjectBindingDecision` with candidate project IDs resolved only from projects visible to the authenticated principal; no retrieval of candidate private content is allowed before a single authorized project is selected. When intent remains ambiguous, show a minimal permitted project picker or ask a compact clarification, never auto-select based on semantic similarity or recent private files. Mini Chat SHALL bind to the host-approved immutable tenant/product/project/view context and MUST NOT accept a client-supplied project override. Switching context invalidates pending feedback drafts, citations, cached result anchors and expenditure grants unless explicitly rebased and reauthorized. Project identity remains owned by Feature 196/226 and Spec 233; 244 owns only the binding receipt.

**A159:** User asks “redo the earlier proposal” in general Chat while two similarly named tenant projects exist.

## 13EB. Machine-checkable research readiness and exit gates (Audit 148)

**Gap:** ResearchTask.stopCriteria is modeled as free-form strings although the system needs enforceable readiness, safe stop and independent quality checks.

A versioned `DecisionReadinessOracle` SHALL compile scoped stop criteria into typed predicate references over current goal/branch revisions, mandatory evidence support expressions, freshness, unresolved conflicts, risk profile, budget/deadline and designated human/expert checks. Textual criteria can explain the gate but MUST NOT satisfy it. Return `READY_FOR_SPECIFIC_DECISION | PARTIAL_WITH_DEBT | WAITING_EVIDENCE | BLOCKED_POLICY | BLOCKED_RISK | STOPPED_BUDGET` plus failed predicate IDs, remedy suggestions and a snapshot watermark; never equate a provider's `complete` flag with decision readiness. Expired predicates automatically remove only affected readiness claims, not the entire Living Project. The oracle is a projection on Spec 233/229/220/207 evidence; it never approves an external effect on its own.

**A160:** An Agent reports that the research is complete after finding a glossy source but lacks a required load specification.

## 13EC. Source acquisition completeness versus partial fetch (Audit 149)

**Gap:** A search tool timeout, truncated HTML, missing PDF pages or broken API pagination can appear to be a complete negative search or verified extraction.

Every evidence acquisition SHALL return `AcquisitionCompletenessReceipt` including expected/observed page, byte or result-window boundaries where obtainable; pagination cursor state; relevant HTTP or provider truncation signals; parser warnings; source/rights availability; and `COMPLETE | PARTIAL | INDETERMINATE | FAILED` status. A partial result may contribute verified local claims with correct page anchors, but cannot support a global absence claim or close questions requiring unobserved sections. On retry, use canonical immutable source revision, idempotent page/result checkpoint and bounded limits; missing pages remain visible Research Debt. Existing Spec 229 acquisition/Library parser and worker_jobs own fetch/retry; no shadow crawler authority is introduced.

**A161:** A manufacturer manual returns only page 1 of 4 due to an upstream timeout; the required weight rating is on page 3.

## 13ED. Provisional streamed answers and citation-state changes (Audit 150)

**Gap:** Even when UI event order is correct, a streamed response can present tentative claims as verified before delayed contradictory research or citation verification arrives.

Each substantive streamed research claim SHALL have stable `claim_ref`, response revision, source-support state and display class `PROVISIONAL | EVIDENCE_BACKED | DISPUTED | WITHHELD | WITHDRAWN`. Only source-anchored, currently authorized claims may be badged evidence-backed; token streaming or multi-agent agreement is not verification. If a late contradiction, rights change or extraction failure arrives, push a sequenced correction and display the original response as superseded without silently erasing the user's observed history. Export/approval consumes only a final committed, snapshot-pinned response packet. Spec 240 supplies presentation and Spec 229/233 supplies truth/provenance; no second source status store.

**A162:** Mini Chat streams a definite size claim that later fails a manufacturer-variant match while the user is viewing it.

## 13EE. Visual assertion fidelity versus catalog truth (Audit 151)

**Gap:** Asset identity and protected partial-edit tests do not expressly classify what a photorealistic generated pixel actually proves about the catalog item or physical fit.

For product- or measurement-linked generated image/video/3D outputs, emit a `VisualAssertionMap` between artifact regions/object refs and the asserted source SKU, source photograph, approved product revision, size basis and visual fidelity tests performed. Classify each assertion `ILLUSTRATIVE | REFERENCE_GUIDED | VISUALLY_CHECKED | MEASURED_VERIFIED`; visual plausibility, image dimensions and a shared asset ID MUST NOT upgrade geometric fit, actual product identity or structural safety. On AI shape substitution, temporal drift or missing fidelity evidence, keep the visual concept available but flag affected shopping/measurement assertions conditional and offer selective repair or a different Image/Video/3D path. This is an extension of existing ArtifactVersion/OutcomeContract and object lineage, not a requirement to use 3D.

**A163:** A multi-reference scene looks like the selected cabinet but AI changed its drawer count and made the television appear smaller.

## 13EF. Accessible and low-bandwidth anchored review (Audit 152)

**Gap:** The UI mentions accessibility and mobile cards but lacks a concrete equivalent for selecting a visual region, video frame or 3D object without a powerful viewer or pointer input.

Every reviewable image, video, 3D and mixed artifact SHOULD have an authorized, semantic `AccessibleReviewAnchor` list (object label, optional hierarchy, ordinal, time span, text alternative and stable artifact-version/object ID). Core ask, correct, compare, fork and request-additional-research actions MUST be operable with keyboard/screen reader and a text-only or low-bandwidth fallback; visual pointer selection MAY enhance but MUST NOT be the sole binding mechanism. Generated object labels are provisional until checked against source refs and user selection. If a modality cannot expose a reliable anchor, the UI offers explicit text disambiguation, not guessed destructive edits. Test dynamic Mini Chat focus and revision rebase on mobile.

**A164:** A screen-reader user on a low-memory phone wants to replace the chair identified in a 3D presentation.

## 13EG. Portable project import with identity and rights reconciliation (Audit 153)

**Gap:** Portability is specified for export and old chats, but moving an authorized project to a new workspace/provider needs explicit import collision and consent semantics.

Import SHALL parse the versioned export manifest as untrusted data, verify permissible hashes and schema/upcaster versions, create new tenant/project-scoped identities, preserve old IDs only as non-authoritative lineage, and rebuild citations/dependency refs through a checked mapping. A `PortableProjectImportReceipt` records accepted, redacted, unavailable and quarantined sources and reasons; rights, sharing and allowed-purpose grants do not transfer across tenants or users by implication. External effect receipts remain historical and non-executable; old job IDs, tokens, approvals, watch subscriptions and cached embeddings MUST NOT activate after import. Re-index permitted sources via Spec 229 after Spec 220 checks; repair unknown references in a review queue without inventing evidence.

**A165:** A project export is imported into a new tenant where its project ID collides and several source licenses prohibit redistribution.

## 13EH. Untrusted generated artifact quarantine and active content (Audit 154)

**Gap:** Web fetch guards and prompt-injection taint do not fully specify the release boundary for untrusted generated ZIP/PDF/HTML/code/media files returned by external Harnesses.

Tool-generated or retrieved artifacts with executable/active content SHALL enter a policy-governed quarantine before being opened, previewed by privileged services, indexed into an agent context or shared as a trusted deliverable. An `ArtifactSafetyReleaseReceipt` records claimed and sniffed MIME, hash, size, archive depth/path validation, active content/macros/scripts/external references, rights classification, scan status, provider identity, sanitizer/preview revision and release scope. Unknown, oversize, malformed or unscannable files MUST be withheld from privileged pipelines and offered as restricted evidence only when permitted; do not equate virus scanning with safe prompt content. Reuse existing R2/Library, security and Runner sandbox owners rather than creating an independent artifact repository.

**A166:** A research provider returns a PDF with embedded remote links and a ZIP that contains an executable named like a sample image.

## 13EI. Search projection freshness under asynchronous write and purge (Audit 155)

**Gap:** Current goal/source event watermarks protect UI writes, but a lagging Vectorize projection can still return a source removed from PostgreSQL or omit a just-approved correction.

At each consequential retrieval and answer-assembly step, validate returned source IDs, revocation/tombstone status, scope, source revision and materialized index generation against authoritative Spec 233/220/229 watermarks. A `ProjectionFreshnessReceipt` distinguishes `CURRENT | LAGGING_RECHECKED | PARTIAL | INVALIDATED`; never trust a Vectorize hit to resurrect deleted or revoked content, and never claim exhaustive retrieval while reindex/purge is pending. For recent critical corrections prefer an authorized canonical delta overlay or explicitly defer the answer, with bounded fallback and no duplicate search authority. Track projection-lag debt and repair status under existing Spec 229 and R2/PG reconciliation.

**A167:** After a confidential quote is revoked and corrected, an older embedding appears in the next project answer during re-indexing.

## 13EJ. Continuous research event-storm coalescing and watch fencing (Audit 156)

**Gap:** Approved watches, manual re-research and multiple notifications can race to open the same child question repeatedly after one fast-changing source update.

Use the existing Spec 238 scheduling/alert owner and worker_jobs to implement bounded `ResearchWakeCoalescingReceipt` keyed by tenant/project/question/source revision/goal epoch/policy epoch/watch subscription. Debounce compatible updates within a declared bounded window, preserve the highest material source revision, and admit a single policy-authorized task per deduplication generation; never collapse an explicit new user goal into an old watch. Recompute estimated information value before executing a wake, cancel or park obsolete children, inherit current budget/expiry/egress grants and expose skipped/coalesced events in authorized project history. A policy revocation disables future wakes even if stale queue events arrive, and no background subscription is silently created by ordinary chat.

**A168:** A seller changes price three times while a manual refresh and two enabled watches trigger the same research question.

## 14. Domain-specific example journeys (non-normative)

### A. Fragmented product sources: TV and cabinet

1. User: "Can TV model X fit my existing cabinet or wall, delivered within budget?"
2. Entity resolver joins maker manual for exact TV variant dimensions/stand width/net weight/VESA, user cabinet measurements and manufacturer load rating, multiple distinct vendor price/stock offers and destination-dependent shipping/install quotes.
3. If not proven to fit, open **parallel branches**: change TV; change cabinet; wall mount after structural expert/site verification; rearrange room. Keep unknown support/installation claim as UNKNOWN rather than asserting compatibility.
4. Compare *total landed costs* with timestamps and uncertain fees; user picks conditional branch. Refresh supplier price/stock before purchase. If preference changes, preserve evidence for alternate branches.

### B. Interior image-first, then selective 3D

1. Start with room photo, user-reported dimensions, style preferences and real catalog image references.
2. Research material compatibility, multiple sourcing options and budget; produce an image-first concept and shortlist.
3. User rejects the placement; open targeted fit/material research, revise layout, regenerate only relevant image regions and compare.
4. If multi-camera consistency/geometry/animation becomes important, fork selective img2threejs/media2threejs or other certified 3D branch; preserve prior image/user/asset evidence. Never assume procedural 3D equals engineering-measured BIM.
5. For quantity takeoff, require verified measurements and approved deterministic rules; loop back on missing material prices or quantity conflicts.

### C. Short film

Read approved script/location/character references, investigate visual style and asset rights, draft image storyboards, test image-to-video, review subject drift, reopen research for alternate rendering/staging; selectively use procedural 3D for shots needing consistent camera motion; hand accepted media revisions to existing Video Editor. User may replace creative direction without losing previously approved reusable assets.

### D. Product software generation

User describes an unfamiliar profession or industry. Multi-perspective research maps jobs-to-be-done, actors, sources, workflows, competing product patterns and compliance unknowns; synthesizes evidence-backed feature map and Product Blueprint (Mini App/Skill/Workflow/full branded Product) through 217/233. A rejected prototype reopens targeted domain research; selected approved revisions go through 235/224 only when verified available. Never automatically make unapproved product scope or tenant publication changes.

### E. Specialized physical engineering

User supplies confirmed measurements/material grade and load requirements; research alternatives and obtain certified manufacturer tables/standards; deterministic engineering code under expert oversight evaluates conditions. Claims of structural suitability remain BLOCKED/EXPERT_REQUIRED if inspection, actual dimensions, load path or relevant design approvals are missing.

## 15. Product/UI journeys and accessibility

**Project Research Workbench** (Desktop/Mobile/Tablet):
- persistent `Goal vN` header, `Current selected branch`, current approvals and spend;
- collapsible research frontier: questions, source coverage, contradictions, blocker, requested user input;
- source inspector with per-claim provenance, freshness, alternative interpretations and open original where authorized;
- branch comparison with trade-offs, readiness/unknowns, artifacts, cost and proposed next experiment;
- previews: text/table/chart/image/video/3D viewer/diff/analysis; choose viewer by artifact MIME/capability, not by one domain;
- click/annotate artifact region/step/claim, ask Mini Chat to explain/check/change specifically;
- controls: Research more, Challenge result, Try different approach, Fork, Compare, Select, Approve, Pause, Resume, Revert-as-new-revision;
- long-running job progress with a plain-language state, cost spent/remaining and provenance of tool choice;
- review-friendly mobile layout: card-based alternatives + contextual Mini Chat rather than forcing a dense graph view.

**UI event contract:** host supplies selection anchors (`artifact_version`, `frame_time`, `region`, `table_cell`, `scene_object_id`, `diff_hunk` as appropriate). Chat feedback and new research task pin to immutable anchors. No text-only model guessing about which stale screenshot or result the user means.

**Explainability:** every proposed change displays "what changed", "why", "new evidence", "what remains unknown", "what it costs" and "what can be reused". Preserve undone choices as reviewable branches, not silent history deletion.

## 16. External adapters and evaluation profiles

Research-source capability descriptor:

```ts
type ResearchProviderDescriptor = {
  providerId: string;
  version: string;
  inputTypes: string[];
  outputEvidenceSchemaVersion: string;
  supports: ('WEB'|'PDF'|'MULTI_SOURCE'|'GLOBAL_SYNTHESIS'|'MULTI_PERSPECTIVE'|'MARKET_DATA'|'GRAPH'|'CUSTOM_DOMAIN')[];
  sourceProvenanceQuality: 'EXACT'|'PARTIAL'|'UNVERIFIED';
  locality: string[];
  dataEgressClass: string;
  estimatedCostProfileRef: string;
  allowedScopes: string[];
  status: 'AVAILABLE'|'PARTIAL'|'DISABLED'|'UNKNOWN';
};
```

- Reference methods: STORM-like multi-perspective domain discovery; GPT-Researcher-like distributed source gathering; GraphRAG-like optional global synthesis; autoresearch-like gap probing, scenario stress tests and evidence-bounded experiments. Implement as Skills/adapters in existing catalog, not as a new mandatory all-in-one upstream runtime.
- Fallback source acquisition may be direct authorized search + document extraction; source quality and citations are independent of provider choice.
- Output adapters include image/video/3D/workspace and future tools; the resolver must expose which are **actually certified and currently available**, never treat spec existence as deployment proof.
- Feature flags by tenant/product/project/provider/route with easy rollback and shadow comparison. An untrusted provider crash should block only its dependent tasks, not unrelated project work.

## 17. Development phases and explicit admission gates

| Phase | Deliverable | Exit evidence | Rollback |
|---|---|---|---|
| P244.0 | Repo/schema/interface/numbering inventory; ownership map; risk and source rights; one end-to-end fixture | verified spec number, deployed API snapshot, authority/cost/security boundaries, no historical edits | No writes enabled |
| P244.1 | Project-scoped typed research and Evidence Ledger on Spec 233/229; Chat read-only inspection | source provenance, ACL and source-revocation tests, bounded cost | Disable new task admission; retained approved artifacts |
| P244.2 | Goal revisions, FeedbackIntent, Research Frontier, alternatives and targeted re-research | user intent/correction, CAS races, unknown handling, research dedup and branch non-interference tests | Read-only review of old revisions |
| P244.3 | Chat + scoped Mini Chat result/claim/branch review, side-by-side visual outputs | authenticated scope test, UI version pin, annotation and no cross-project leak | Hide new Mini Chat actions |
| P244.4 | Multi-tool/harness experiments, image/video & first optional 3D capability adapters | independent capability flags, artifact lineage, job fencing and paid side-effect tests | Disable individual adapter and preserve artifacts |
| P244.5 | Impact-aware selective rebuild, branch merge and user approval | conflict resolution, evidence invalidation, deterministic impact propagation, budget receipts | Park branch merges; recover revision |
| P244.6 | Extended research sources, graph/global synthesis (only if benchmarked), 3D/technical specialization, full product handoff | measurable improvement over P244.2, specialist QA and separately verified 235→224 gate | disable expensive adapter paths |
| P244.7 | Controlled canary and production certification | tenant isolation, load, recovery, external failure and economic audit, documented approvals | feature-off + bounded drain |

Phases may be developed in parallel only when no duplicate mutable authority is introduced. A successful design audit does not waive real tests, repo preflight or production acceptance. **P244.4 3D may progress separately** without blocking image-first releases, and 3D remains available through the same future-compatible capability contract.

### 17.1 R8 cross-cutting admission gates

These do not create a mandatory new global development phase: production gating follows the impacted existing P244 slice. **Research-only** can ship with scoped coverage/variant/contradiction/disclosure/source-acquisition tests; no universal market-coverage claims. **Interactive** Chat/Mini Chat requires read-watermark, ambiguous-feedback and reauthorization tests. **Continuous** research requires verified existing schedule/monitor integration and explicit renewable grants. **Multimodal/commercial** outputs require comparable evaluation, OutcomeContract verification and authorized external-delivery correction behavior. **Cancellation** requires child-tree settlement and credit reconciliation. No optional 3D dependency blocks certified image-first delivery or vice versa.

### 17.2 R9 cross-cutting admission gates

W13 is gated by W0 registry/authority reconciliation and previously applicable W1–W12 security/runtime gates. Read-only rejection memory/what-if/exposure must pass scope and version tests before any Mini Chat rollout; actual paid hypothetical experiments require a separate Spec 207 and current approval receipt. External multilingual, field and commerce findings may be used for consequential claims only after source/translation/measurement applicability and authorized acquisition are verified. Schema upcasters, packaged publication and child credentials require independent failure-injection before canary. No pre-existing Spec 224 source or frozen Specs 1–213 may be rewritten as part of R9.

### 17.3 R10 cross-cutting admission gates

W14 is an additive contract-hardening workstream, not an independent runtime. Gate triggers/command replay and cross-branch effects (A121/A122/A131) before enabling concurrent paid automation or offline Mini Chat writes. Capture/source-span/temporal checks (A123–A125) precede any decision-critical cross-source quote or technical claim; margin and expert binding (A126/A127) precede physical/regulated acceptance. Cross-modal object mapping (A128) applies only where multi-artifact object-level editing is enabled and does **not** make 3D mandatory. Discriminating experiments (A129) and resumption brief (A130) may roll out in read-only mode first. External correction acknowledgement (A132) precedes claims that delivered material is updated. All pre-existing A01–A120 gates remain regression requirements for applicable slices; live code/provider certification remains open.

### 17.4 R11 cross-cutting admission gates

W15 is optional additive planning/research hardening, NOT a new Agent/Workflow/job/approval runtime. A133/A134 must gate any claim of compositional feasibility; impossible hard constraints cannot be silently relaxed. A135/A139/A143 gate conditional plan promotion, user attention batching and untrusted third-party advice before mutable Chat/Mini Chat automation. A136 gates metric claims across image/video/2D/3D frame transforms while leaving nonspatial and image-first concept work deployable independently. A137/A138 gate material negative search findings and any authorized outbound source clarification. A140/A141 gate real-world outcome reporting and deadline promises. A142 gates automatic cross-tenant strategy promotion; A144 gates selective evidence retraction/permission effects. Every applicable prior A01–A132 fixture remains a regression gate; none of the new contracts is implied to exist in deployed code.

### 17.5 R13 cross-cutting admission gates

W17 SHALL first reconcile R12 illustrative schemas with actual deployed Feature 196/226 and Spec 233/215 schemas. Release typed command, task transition and machine-verifiable readiness in read-only/mock modes before enabling any mutating callback; project binding and answer/source watermarks are hard privacy and correctness gates. Artifact safety and cross-tenant import MUST have independent security certification before exposure. Disabled optional Image/Video/3D or watch adapters never block unrelated certified nonvisual research; they also never bypass their own per-modality QA.

## 18. Mandatory acceptance scenarios (fixture-driven)

Acceptance tests MUST use authorized fixtures first; at least one staging external provider and one scoped end-user Mini Chat run are required before each relevant production slice. Domain-specific BOQ and structural claims require separate specialist evidence/certification, not just the generic acceptance scenarios below.

| ID | Given / action | Required evidence |
|---|---|---|
| A01 | User asks follow-up about a specific old artifact after weeks | Correct, permission-checked artifact/version and project-context retrieval; no hallucinated fresh execution |
| A02 | User selects a Mini App image region and says "try a different style" | Scope-checked region anchor, feedback interpretation and new branch; published app definition unchanged |
| A03 | New image reveals wrong product dimensions | Claim/variant reconciliation, stale finding invalidation, targeted research and branch comparison |
| A04 | Manufacturer states dimensions, three sellers state prices, freight depends on region | One canonical product variant; distinct offers; landed-cost evidence with freshness and unresolved shipping |
| A05 | Alternative X is infeasible but alternatives Y/Z remain | X fails with grounded reason; scoped child research continues for Y/Z independently |
| A06 | User changes budget while two paid jobs run | New immutable GoalRevision, cost/cancel/drain choices and fencing against obsolete auto-merge |
| A07 | User requests opposite aesthetic after accepting previous phase | Fork/revision; old accepted artifact retained, no retroactive rewrite of completed work |
| A08 | Research engine finds copied reseller text across ten URLs | One independence group; no false 10-source corroboration |
| A09 | Evidence conflicts on a hard safety constraint | No unverified feasible label; research/expert escalation; no physical action |
| A10 | One source is deleted or project sharing revoked | Derived index and source projection revoked; no future Chat/Mini Chat leakage |
| A11 | Provider succeeds but callback/ACK lost and retry fires | Existing idempotent job/receipt reconcile; no double-pay/double-effect |
| A12 | Third-party worker returns late after user selected another branch | Obsolete job cannot overwrite current branch; old result may be retained only under authorized scope |
| A13 | Goal change leaves 85% of evidence still relevant | Only impacted dependency edges re-evaluated; authorized unaffected artifacts reused |
| A14 | User starts image-first, then requests multi-view repeatability | Optional 3D strategy branch; preserve existing reference/product facts; actual adapter capability checked |
| A15 | Generated room picture appears realistic but measured size is not verified | Proper concept label; no BOQ/structural sign-off from image alone |
| A16 | External research tool returns prompt-injection text | No tool privileges/secret egress/escalation; hostile text preserved as quoted data only if permitted |
| A17 | Research budget expires mid-question | Honest PARTIAL status, checkpoint, source receipts and user-approved resume or smaller scope |
| A18 | Two users in one tenant use different Mini Apps and project source grants | Per-end-user data/branch isolation; no publisher/admin private data inherited by embedded Chat |
| A19 | User asks AI to create unfamiliar business product | Multi-perspective domain evidence, reuse-first capability matching, evidence-backed Product Blueprint and approved handoff |
| A20 | Expert finding contradicts earlier selected material | Affected facts/branches flagged; user impact preview; professional conclusion preserved and authorized revisions enforced |
| A21 | Restart research after crash during PG commit/outbox/provider call | Resume from durable checkpoints and canonical job reconciliation; no zombie owner |
| A22 | User compares two harnesses, switches mid-way and asks to retry | Versioned tool strategy, captured partial artifacts, approvals/egress constraints, independent branch evaluation |
| A23 | No matching accessible sources found | `NO_VERIFIABLE_SOURCE`, no invented claim or deceptive 'research complete' |
| A24 | User requests external release after a prototype | Separate Product/Skill/Spec 224 release and governance gates, no Research acceptance bypass |
| A25 | User repeatedly says "not right" without precise requirement | System compares rejected artifacts, infers provisional preference dimensions, asks minimal discriminating question or generates materially distinct alternatives; no blind infinite regeneration |
| A26 | Deep research finds 40 retailer pages copying one distributor feed | Source-independence groups prevent false corroboration; manufacturer/manual/independent source classes prioritized |
| A27 | Current answer is adequate, but an unimportant open question remains | Mark scoped decision sufficient; preserve residual frontier instead of claiming domain completion |
| A28 | Three branches become near-duplicates | Consolidate as revisions/parameters; branch portfolio avoids paid duplicate execution and preserves lineage |
| A29 | Product price/stock expires after selected design | Refresh only dynamic dependent claims; show budget/availability impact without invalidating stable dimensions/style evidence |
| A30 | User rejects a 3D route and asks for faster photorealistic concept | Fork image-first branch, reuse measurements/references/material research; 3D artifacts remain reusable and unselected |
| A31 | Image-first concept later needs repeatable camera and quantity checks | Promote selected facts to spatial/3D/measurement branch; distinguish visual concept from measured truth |
| A32 | Experiment fails for same reason three times | Loop breaker requires root-cause reclassification/strategy change or user review; no unbounded retry spend |
| A33 | User receives outside advice and changes direction | Record advice as new input, research/verify material claim, impact-preview current selected branch, preserve old branch |
| A34 | Research synthesis must be revisited months later | Research Snapshot Manifest reconstructs sources/versions/tools and identifies which dynamic facts need refresh |
| A35 | Private project insight looks reusable globally | Keep project-local until governed declassification/promotion; no cross-tenant leakage |
| A36 | Recursive research opens many children | Depth/fan-out/budget caps, dedup cycles and park non-decision-critical children |
| A37 | Merge two attractive branches with incompatible assumptions | Block automatic merge; show conflict preview and create a new synthesis revision only after resolution |
| A38 | Reuse an old product/standard fact under a different market or goal revision | Run applicability rebase; refresh/revalidate or reject reuse instead of inheriting blindly |
| A39 | Three agents agree using the same copied source | Do not mark corroborated; source-independence grouping exposes false consensus |
| A40 | Generator scores its own output highly but deterministic fit rule fails | Deterministic/specialist gate wins; output remains failed/conditional |
| A41 | Search results are dominated by affiliate/SEO duplicates | Group syndication, seek primary/independent sources and avoid frequency-as-evidence |
| A42 | Half the provider calls time out but remaining sources support one option | Persist failures; disclose coverage bias; keep hard-constraint status unknown/conditional as applicable |
| A43 | User abandons a paid branch while remote render/research is already running | Cancel safe work, bounded drain/reconcile external work, salvage reusable results, never resurrect obsolete branch |
| A44 | Project has years of chat/research beyond model context | Reconstruct from knowledge pack/current revisions/evidence anchors without dropping hard constraints |
| A45 | Domain Skill receives an unsupported jurisdiction/unit combination | Return `OUTSIDE_CERTIFIED_SCOPE`; open research/adapter path rather than extrapolate |
| A46 | User changes mind after a purchase/deployment/publication | Preserve new goal but treat prior effect as irreversible; open remediation/compensation path with fresh approval |
| A47 | A source or user measurement is revoked after several decisions depend on it | Targeted transitive invalidation and impact review; unaffected knowledge stays valid |
| A48 | Research produces 30 materially different options | Cluster/park safely, expose a small representative comparison set and retain full advanced view |
| A49 | User changes a hard constraint while background agent writes older branch state | CAS rejects stale semantic write; background evidence may append but cannot overwrite current goal/selection |
| A50 | Two sources report TV width as 123.4 cm and 48.6 in, one rounded | Preserve originals, normalize units with precision and avoid false contradiction from rounding |
| A51 | Price is known but shipping/tax is a range | Derived landed cost remains a range/conditional result; no fake exact total |
| A52 | Cached research from another market/tenant looks semantically identical | Reauthorize evidence and reject unsafe cache reuse when locale/scope/variant differs |
| A53 | Search result is behind access control or forbids automated extraction | Respect source policy; use permitted metadata/reference or alternate source; no bypass |
| A54 | Collaborator approves research spend under delegated authority | Receipt proves bounded delegation, exact ceiling/expiry and safe revocation race |
| A55 | Original model/provider used for an accepted decision is retired | Reconstruct structured rationale/evidence without provider dependency or hidden chain-of-thought |
| A56 | New parser/model version produces faster but lower-quality research | Benchmark blocks promotion when evidence quality/false-feasibility regresses |
| A57 | Expert corrects a load rating previously extracted by AI | Preserve old extraction as history, protect corrected fact, invalidate affected decisions and surface conflicts |
| A58 | Project proceeds with one known non-blocking unknown | Create ResearchDebt with owner/trigger/expiry; acceptance does not erase residual risk |
| A59 | Preferred research/3D provider becomes unavailable for weeks | Project remains inspectable/exportable and resumes through alternate certified path without canonical-state loss |
| A60 | Research orchestration becomes slow or source failures spike | Health metrics distinguish coverage/latency/provider failure and trigger existing incident/alert path |
| A61 | Repeated summaries call a speculative dimension a measured fact | Evidence status remains HYPOTHESIS; quantity/physical safety path blocks until independent measurement or qualified certification |
| A62 | Seller changes the technical dimensions on the same URL after a proposal was accepted | Historical proposal retains old observation; newly fetched facts trigger versioned discrepancy and affected-decision review |
| A63 | Two derived planning assumptions reference each other and one source is retracted | Cycle detector parks unresolved SCC, prevents infinite job fan-out, preserves unaffected branch revisions |
| A64 | Image provider changes model weights while user revisits a six-month-old accepted concept | Historical image remains linked and viewable; regeneration is marked best-effort with a new revision and separate cost |
| A65 | User returns to an earlier-looking goal while old paid-provider callback arrives | New goal epoch and fresh scope gate; old callback archived as historical evidence, not committed as current selection |
| A66 | A selected TV and cabinet each pass standalone checks but combined footprint exceeds the room limit | Composite feasibility becomes CONDITIONAL/REJECTED with explicit failed joint constraint and alternative branches |
| A67 | Client asks for dark tones while consultant and supplier suggest bright colors | Distinct preference sources retained; only authorized current owner decision selects final palette |
| A68 | Private supplier quotes were used for one project and a new tenant asks for generic pricing | Quotes and derived summaries cannot cross purpose/tenant; only independently licensed public facts may be recomputed |
| A69 | An image or research adapter changes parameters and response schema during a parked project | Contract mismatch blocks unsafe execution and prompts certified migration/fallback without corrupting saved branch |
| A70 | PG restore succeeds but referenced R2 artifact version is missing and Vectorize still has newer indexes | Project parks affected branch; reports missing artifact and reconstructs authorized index without reviving deleted private knowledge |
| A71 | Fresh manufacturer bulletin contradicts an accepted mounting option while a quote is pending | Dependent technical action pauses, owner receives precise impact and alternative research; unrelated project state remains stable |
| A72 | Three nested research agents race to spend the last project credits while one upstream response is unknown | At most authorized aggregate spend reserved; extra tasks park; ambiguous charge reconciled without duplicate capture |
| A73 | Agent marks mounting feasibility answered despite unresolved structural substrate question | Parent remains conditional/blocked; missing prerequisite remains visible and no unsafe installation approval occurs |
| A74 | AI compares buy-new options while reusing existing furniture is feasible | Baseline/reuse path appears with evidence and explicit unknown costs, not hidden by generated recommendations |
| A75 | Lowest-priced retailer has stale stock and destination-dependent freight | Result remains provisional until current offer/shipping is verified; alternative vendors compared on documented landed-cost basis |
| A76 | User says “replace this chair” while Mini Chat displays an outdated image revision | System identifies stale region anchor and refuses to replace an unrelated chair in current scene |
| A77 | User changes wall-mounted load path after an engineer approved earlier configuration | Prior sign-off becomes nonapplicable; physical work pauses until qualified reviewer approves new exact conditions |
| A78 | User approved purchase but stock, product variant and project permissions changed before checkout | Dispatch stops; new cost/scope/authorization presented; no silent purchase under stale approval |
| A79 | Three agents reproduce a vendor’s unverified spec and self-grade their own answer as correct | Independent primary evidence or specialist validation required; unsupported claim remains uncertain |
| A80 | Search yields 40 affiliates that recommend an incompatible item and one primary manual says otherwise | Affiliate repetition does not override manual dimensions; contradiction remains visible and incompatible product is not certified |
| A81 | User sees an attractive room draft despite missing dimensions and stale supplier price | UI shows CONCEPT / ESTIMATE labels and visible outstanding measurements/quote refresh, not a technical fit approval |
| A82 | Collaborator loses project access while a delegated research report is streaming | Stream, signed URLs, report export and future index retrieval enforce current scope; others retain authorized work |
| A83 | Owner accepts a concept sketch while supplier-price research remains open | Phase closes without falsely closing project; research stays bounded and can be resumed/parked with explicit scope |
| A84 | Old Celery/Runner and new Cloudflare research adapters start during a canary failure | Only route-generation owner admits physical jobs; other backend is read-only/shadow, safe rollback preserves evidence/credits |
| A85 | A Product Blueprint looks complete but one hard goal requirement has no verified artifact test | DecisionTraceSet exposes uncovered condition; final acceptance/readiness blocked pending verified evidence or permissible explicit waiver |
| A86 | Two agents oscillate between image-first and 3D strategy after noisy evaluator scores | Hysteresis, repeated-strategy dedup and bounded spending stop automatic thrash; explicit user strategy change still works |
| A87 | AI-generated past report is syndicated and retrieved as seven independent confirmations | Origin lineage/tags mark derived content; no independent corroboration upgrade and dependent conclusions are rechecked |
| A88 | User changes room constraints during async research while merchant sources and prices arrive | Old ResearchContextSnapshot cannot merge mismatched current state or authorize paid/physical action; safe evidence salvaged |
| A89 | Historic “load capacity” evidence is reindexed under a changed adapter ontology | Semantic schema digest mismatch triggers migration/revalidation; no point-load/distributed-load conflation |
| A90 | User reference furniture image is allowed for private review but prohibited for published commercial video | DerivativeRightsManifest blocks distribution pending actual rights; private research continues within grants; image/video/3D paths consistent |
| A91 | Image provider fails and resolver suggests a cheaper image route without required exact product fidelity | Capability downgrade is explicit/approved or task parks; no unapproved tool/data egress or fake measured geometry |
| A92 | Two options have overlapping landed costs, but shipping-price change could flip selection | SensitivityEnvelope shows threshold; targeted shipping research chosen; options update only after documented evidence |
| A93 | Offline Mini Chat requests replacement of an image object that is removed while offline | Replay checks current ACL/version/anchor; queues rebase preview or rejects; no stale replacement/duplicate charge |
| A94 | Malicious PDF instruction survives an AI summary and enters Mini Chat or coding harness | Taint/provenance retained; content never gains tool authority; no unapproved egress or private project data access |
| A95 | Pre-deletion database backup is restored after private source and project export were deleted | Restore replays tombstones before index/model serving; eligible copies purged and remaining legal holds explicitly isolated |
| A96 | User-approved Product Blueprint becomes stale before Spec 235 handoff | Signed ApprovedSolutionPacket fails freshness/policy/budget preflight, requests scoped reapproval and never bypasses unchanged Spec 224 gate |
| A97 | Search covers ten ranked offers but an authorized local store is excluded by a search filter | Scoped SearchCoverageLedger exposes the omitted class; no exhaustive-market or global-lowest-price assertion |
| A98 | Maker manual and reseller bundle use similar model names with different stand dimensions | EntityJoinProof isolates variants, accessory basis and offer; fit and total price remain conditional until reconciled |
| A99 | A lengthy synthesis contains nine favorable sources but one verified installation incompatibility | MaterialEvidenceDisposition retains the adverse fact; summary cannot assert unconditional feasibility |
| A100 | Out-of-order branch-selected event reaches Mini Chat after a newer goal and ACL revocation | Projection watermark detects gap/policy drift; reauthorized snapshot replaces stale UI and blocks old action |
| A101 | Authorized price watch outlives its one-week grant and source connector is revoked | No future unauthorized occurrence, provider fetch, charge or unsolicited alert; in-flight jobs reconcile safely |
| A102 | Source retraction affects three previously exported proposals and one published derivative | Authorized impact records and correction review; internal use invalidated; no fake remote deletion or private-source leak |
| A103 | External collaborator requests an explanation derived from a confidential supplier quote | Claim-level disclosure policy withholds or safely aggregates; no inference leak, invented citation or cross-purpose sharing |
| A104 | Image, video and 3D engines are benchmarked on imbalanced difficulty and differing attempt budgets | Paired scoped EvaluationProtocol and uncertainty expose inconclusive/mixed results; no unsupported universal promotion |
| A105 | User repeatedly rejects a result vaguely while retaining one liked element | Contrastive authorized trials or one discriminating question; preserve liked artifact and hard constraints; bounded spend |
| A106 | Crawler encounters redirect to link-local metadata and decompression-bomb PDF | Egress destination and file caps block both; no host secret disclosure or uncontrolled compute |
| A107 | Parent research canceled with active grandchildren, charges and one shared artifact | New admission stops, existing job/financial truth reconciles, orphan clean-up safe, shared artifact preserved |
| A108 | Accepted image concept is converted to video and optional 3D with changed SKU and invalid clearance | OutcomeContract and InvariantDiff flag material regression; no verified spatial claim or silent constraint loss |
| A109 | User rejects a style for one task, then explicitly requests that style for a different room/use | Scope-aware RejectionRecord prevents duplicate recommendations without imposing a permanent cross-goal ban |
| A110 | User asks a what-if purchase/layout question in Mini Chat without asking to commit | Read-only WhatIfSession; no selection or paid/external side effect before explicit versioned adoption |
| A111 | Thai retailer translation and foreign-language manufacturer manual conflict on safety-critical unit/model | Original-language anchors retained; disambiguation and bilingual review required; translations do not double corroboration |
| A112 | Generated room image and user phone measurement conflict with independently tape-measured cabinet depth | FieldObservationReceipt preserves method/tolerance; fit stays unverified until validated independent physical evidence |
| A113 | Public marketplace search finds no affordable seller but offline/local supplier channels were unobserved | Coverage exclusions and missing-not-at-random impact shown; no global no-affordable-product assertion |
| A114 | Only missing critical fact is a simple user-observed measurement, while broad search is costly | Planner selects one bounded ASK_USER route over unnecessary paid searches; residual uncertainty explicit |
| A115 | Five similar suggestions rejected; user has not been exposed to materially different strategies | Exposure record prevents false inferred universal dislike; diverse feasible probes offered without violating hard constraints |
| A116 | Historical accept events use obsolete schema and restore also contains newer private-data deletion | Read-only tested upcaster preserves scoped authority; unsupported replay fails closed and deletion tombstones win |
| A117 | Proposal image, SKU-price sheet and delivery quote use inconsistent product versions | Single DeliverableBundleManifest blocks publication, preserves last accepted bundle and reports exact mismatches |
| A118 | Delegated child source crawler requests broad parent Drive access and other paid API | Least-privilege task grants deny access and credentials; siblings continue authorized work |
| A119 | Field measurement and formula version change an already estimated material quantity | DerivedCalculationReceipt replays prior formula, recalculates affected active values and exposes cost/uncertainty delta |
| A120 | Research query about an unreleased client product would expose sensitive names to public search | QueryDisclosurePreflight redacts/minimizes outbound terms; no private term leakage through URL/referrer/logs |
| A121 | User revises goal during concurrent revocation, paid callback and automatic source watcher triggers | Priority receipt orders safety and current authorized intent; obsolete refresh does not re-admit; eligible task gets bounded service |
| A122 | Two separate branches simultaneously submit one external booking/purchase/deploy against one account | Canonical conflict claim/worker fence permits at most one eligible effect; missing upstream ACK remains reconciliation-blocked |
| A123 | One JS-rendered seller lists differing variant and prices by market and access class | Context receipts keep offers separate, disallow private cache sharing and limit availability claims to observed acquisition context |
| A124 | Current SKU price is combined with expired shipping quote and an older manufacturer variant | DecisionTemporalJoin flags DISJOINT/CONDITIONAL; targeted refresh prevents a false final landed cost |
| A125 | Extractor cites correct manual but reverses a mounting exclusion and swaps stand/no-stand depth | SourceSpanEntailment fails grounded qualifier/unit check; no verified compatibility claim or copied-summary corroboration |
| A126 | Nominal cabinet and TV dimensions fit but conservative uncertainty violates required clearance | ConstraintMarginProof fails technical feasibility or asks for field check; alternative design remains available |
| A127 | Expert approved a specific wall mounting arrangement, then load and substrate revision change | Attestation input digest invalidated for current plan; historical signature retained, no auto-renewal or unsafe installation |
| A128 | User selects one of two visually similar objects across image, video and optional 3D iterations | Confirmed CrossModalObjectMap targets only correct instances; ambiguous track/node link requests disambiguation |
| A129 | Generated video repeatedly distorts product geometry with two plausible root causes | Bounded DiagnosticExperimentPlan holds controls and discriminates reference quality vs engine behavior before broad paid retries |
| A130 | Project owner returns months later after teammate edits and expired offers | Scope-filtered ResumptionBrief shows changes since acknowledged view and asks approval before resumed spend or branch changes |
| A131 | Offline Mini Chat retries an old command key with a different instruction after permissions change | CommandReplayContract emits IDEMPOTENCY_CONFLICT, prevents new effect and does not disclose inaccessible old receipt |
| A132 | Approved document and Mini App export become stale after source withdrawal | Corrected release policy blocks new unsafe use; authorized external correction receipts track acknowledgements and residual unrecalled copies |
| A133 | Cabinet, TV, room clearance and spending cap cannot all hold | show the blocking subset and at least two authorized repairs without relaxing safety or auto-changing the goal. |
| A134 | TV and wall bracket both appear compatible by VESA size but bolt depth or wall substrate invalidates the assembled installation | alternative bracket and cabinet paths remain open. |
| A135 | Supplier stock disappears after concept approval | conditional Plan B proposes a certified substitute and refreshed shipping quote while preserving the previously accepted aesthetic goal and requiring approval for extra spend. |
| A136 | A resized phone photo makes a cabinet appear wider than measured plan | pixel-to-metre conversion is unavailable, so neither image nor derived video falsely certifies a TV fit; optional 3D stays available. |
| A137 | Previously absent product becomes available through a newly authorized supplier | an expired no-match receipt no longer suppresses search and a formerly rejected branch can be re-evaluated without being auto-selected. |
| A138 | Manual omits mounting load | supplier contact is authorized but does not reply. Agent must preserve PENDING/UNKNOWN, cannot claim confirmation or send private measurements without approved disclosure. |
| A139 | Thirty research subagents request twelve minor choices and one purchase | a bounded accessible review batches optional questions but isolates the purchase and keeps unanswered items open without consent. |
| A140 | Client approves a realistic layout image, but purchased cabinet arrives with unusable internal width | real-world outcome is recorded as failed, not as falsification of the historic approval; targeted alternative research reopens. |
| A141 | Cheapest supplier cannot deliver before the event date while a dearer local vendor may | system compares price against time risk and refreshes unverified local availability before promising on-time delivery. |
| A142 | A research policy appears to improve after repeated exposure to a static benchmark but fails fresh unseen regional/manual variants | leakage flags block autonomous promotion despite headline score improvement. |
| A143 | Project owner forwards “the contractor said to remove the wall” screenshot | agent researches the claim but neither treats it as verified engineering approval nor changes the approved build plan without owner and expert validation. |
| A144 | One of two genuinely independent manuals is withdrawn, while a mandatory installation tolerance also expires | alternative support can preserve general product facts but installation feasibility becomes conditional pending new tolerance evidence. |
| A145 | Fake manufacturer clone copies a correct manual and posts the lowest price | SupplierIdentityReceipt checks and fail-closed outcome per §13DM; preserve revisions, scope and existing owner. |
| A146 | A scanned manual places 30 kg and 15 kg under adjacent mounting modes, with a footnote excluding masonry anchors | StructuredExtractionProof checks and fail-closed outcome per §13DN; preserve revisions, scope and existing owner. |
| A147 | Ten shopping results all come from one marketplace while regional dealers are unsearched | SearchSamplingDisclosure checks and fail-closed outcome per §13DO; preserve revisions, scope and existing owner. |
| A148 | A fast local supplier is more expensive but reliable, while a cheaper remote supplier has uncertain delivery | RobustOptionFrontier checks and fail-closed outcome per §13DP; preserve revisions, scope and existing owner. |
| A149 | User turns a previously approved decorative mockup into a wall-mounted installation plan | IntentRiskTransitionReceipt checks and fail-closed outcome per §13DQ; preserve revisions, scope and existing owner. |
| A150 | Two branches share one authorized manual parse | SharedResearchDependencyLease checks and fail-closed outcome per §13DR; preserve revisions, scope and existing owner. |
| A151 | An external harness changes its declared file-system scope after an update | CapabilitySupplyChainReceipt checks and fail-closed outcome per §13DS; preserve revisions, scope and existing owner. |
| A152 | Video provider completes charge after cancellation but callback is lost | ExternalCostReconciliationReceipt checks and fail-closed outcome per §13DT; preserve revisions, scope and existing owner. |
| A153 | Only the chair should change in a selected image | ArtifactPatchPreservationContract checks and fail-closed outcome per §13DU; preserve revisions, scope and existing owner. |
| A154 | A prior expert warning about a load limit is old and ranks below recent marketing pages | DecisionContextCompletenessProof checks and fail-closed outcome per §13DV; preserve revisions, scope and existing owner. |
| A155 | User manually corrects a beam dimension, while a later survey report disagrees | CorrectionAdjudicationRecord checks and fail-closed outcome per §13DW; preserve revisions, scope and existing owner. |
| A156 | A media provider silently changes a model and begins altering product labels in approved ads | ProviderIncidentImpactManifest checks and fail-closed outcome per §13DX; preserve revisions, scope and existing owner. |
| A157 | A Chat message suggesting a hypothetical new layout must not mutate the selected branch, while Resume must be accepted as a distinct authorized action. | §13DY `ResearchCommandEnvelope` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A158 | Two simultaneous Pause/Resume callbacks and a late completed provider result attempt to advance a superseded research task. | §13DZ `LifecycleTransitionProof` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A159 | User asks “redo the earlier proposal” in general Chat while two similarly named tenant projects exist. | §13EA `ProjectBindingDecision` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A160 | An Agent reports that the research is complete after finding a glossy source but lacks a required load specification. | §13EB `DecisionReadinessOracle` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A161 | A manufacturer manual returns only page 1 of 4 due to an upstream timeout; the required weight rating is on page 3. | §13EC `AcquisitionCompletenessReceipt` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A162 | Mini Chat streams a definite size claim that later fails a manufacturer-variant match while the user is viewing it. | §13ED `AnswerClaimStateEnvelope` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A163 | A multi-reference scene looks like the selected cabinet but AI changed its drawer count and made the television appear smaller. | §13EE `VisualAssertionMap` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A164 | A screen-reader user on a low-memory phone wants to replace the chair identified in a 3D presentation. | §13EF `AccessibleReviewAnchor` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A165 | A project export is imported into a new tenant where its project ID collides and several source licenses prohibit redistribution. | §13EG `PortableProjectImportReceipt` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A166 | A research provider returns a PDF with embedded remote links and a ZIP that contains an executable named like a sample image. | §13EH `ArtifactSafetyReleaseReceipt` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A167 | After a confidential quote is revoked and corrected, an older embedding appears in the next project answer during re-indexing. | §13EI `ProjectionFreshnessReceipt` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |
| A168 | A seller changes price three times while a manual refresh and two enabled watches trigger the same research question. | §13EJ `ResearchWakeCoalescingReceipt` verifies authorized state, a negative counterexample, injected failure and the preserved canonical owner. |

## 18.1 R7 mandatory regression and phase admission mapping

R7 gates A85–A96 are mandatory for the features they govern. P244.1 research-only requires A87/A88/A94/A95 where relevant; P244.2 adaptive replanning requires A85/A86/A92; P244.3 scoped Mini Chat requires A93/A94; P244.4 media/3D/harness adapters require A89/A90/A91; P244.5 branch/impact review requires A85/A88/A92; P244.6 approved product handoff requires A96. A feature MAY remain disabled while dependent certification is incomplete; no optional adapter is a reason to block unrelated certified paths. Test the complete permission/effect boundary before allowing external side effects.

## 18.2 R8 mandatory regression and phase admission mapping

R8 gates **A97–A108** are feature-scoped additions, not proof of executable certification. P244.1 research admission requires A97/A98/A99/A103/A106 where the corresponding acquisition/source mode is enabled; P244.2 decision/continuous research requires A97/A99/A101/A105; P244.3 Chat/Mini Chat requires A100/A103/A105; P244.4 multi-engine production requires A104/A106/A108; P244.5 impact/accepted-product review requires A99/A102/A107/A108. Each continuous watch, external delivery or cross-path media action remains OFF until its own test/owner preflight is certified. Read-only verified paths remain independently shippable when optional media/3D/provider capabilities are absent.

## 18.3 R9 mandatory regression and phase admission mapping

A109–A120 are additive mandatory **draft** fixtures (120 total) and shall be converted into deterministic/staging tests before R9 feature admission. Before any paid speculative execution certify A110; before multilingual consequential synthesis certify A111; before physical-fit claims certify A112/A119; before provider egress certify A118/A120; before expanding autonomous preference learning certify A109/A114/A115; before event replay or packaged publication certify A116/A117. Source coverage A113 must be visible for rank-limited local market research. Previous A01–A108 remain regression requirements.

## 18.4 R10 mandatory regression and phase admission mapping

R10 adds **A121–A132** while preserving A01–A120. Event/financial correctness: A121/A122/A131 with cancellation, callback loss and revocation tests from older fixtures. Critical research fusion: A123/A124/A125 and existing provenance/source-coverage tests. Spatial, 3D and specialist outcomes: A126/A127/A128 alongside OutcomeContract and rights checks, without imposing 3D on other paths. Adaptive reasoning and long-lived Chat: A129/A130 plus prior branch and Mini Chat tests. Published/exported outputs: A132 alongside A102/A117. Each claim of actual feature readiness requires executable regression and scoped canary evidence, not design-review completion.

## 18.5 R11 acceptance and feature admission map

A133–A144 MUST each receive at least one deterministic positive/negative fixture plus adversarial replay at the relevant capability boundary. Implement A133/A134/A135/A137/A139/A143/A144 as provider-independent mocks first. A136 requires calibrated/un-calibrated 2D/image/video and optional 3D samples, without requiring 3D for all users. A138 requires authorized source-clarification connector staging only when the connector is enabled; absent connectivity MUST produce an honest unresolved result. A140/A141 require observation/lead-time evidence rather than simulated assertions. A142 requires held-out evaluation exposure checks and independent review. Regression-test the actual relevant earlier A01–A132 slices before enabling each new W15 feature; unspecified features remain explicitly unavailable.

## 18.6 R12 mandatory regression and phase admission mapping

A145–A156 each REQUIRE a positive path, counterexample and injected failure/revocation path using exact contract-version, goal/branch/policy/source watermarks. Read-only research admission requires A145/A146/A147/A154; decision comparison and dynamic pivot require A148/A149/A155; shared paid research and mutable provider capabilities require A150/A151/A152; accepted-artifact edits and provider-wide failure require A153/A156. Use existing A01–A144 relevant regression fixtures; do not enable an unrelated optional module merely to satisfy a new test. Images, video and 3D MAY be independently enabled only with their own rights, identity and OutcomeContract evidence; engineering uses separate specialist validation. External paid/irreversible actions remain disabled until canonical grants, effect and financial receipt reconciliation tests pass.

## 18.7 R13 typed-contract and recoverability admission map

A157–A168 MUST be converted into executable fixtures before the corresponding feature is enabled. A157/A158/A160 gate mutable Chat/Mini Chat commands and state closure; A159 gates automatic project identification; A161/A162 gate research completeness and streamed conclusion claims; A163/A164 gate validated visual editing and accessibility; A165/A166 gate import and untrusted artifact exposure; A167/A168 gate current retrieval and optional research-watch admission. Each fixture needs positive, negative, stale-epoch and retry/restart variants where applicable. Preserve all relevant historic A01–A156 regression gates. No image-to-3D promotion, live watch or third-party execution is required for read-only scoped research admission.

## 19. Observability and admin controls

Per-project and admin-authorized dashboards report research tasks, open questions, branch lineage, model/harness routes, source freshness, ACL-safe claim-quality metrics, user revision/research/accept loops, failed dependencies, context drift, spend and approvals. Admin sees only policy-eligible aggregate metrics and explicitly shared evidence, not full private research by default. Integrate incident signals through existing alert/issue owner; repeated provider failures create bounded adapter-level circuit-breakers and review tickets.

Protect logs: redacted source snippets, no raw secrets or uncontrolled private uploads, retention classes and user-deletion propagation. Audit who changed goal, approved spend, selected/merged branch, added/remediated evidence, and published output. Project export includes a portable revision/evidence manifest and linked artifacts authorized for export.

## 19.1 R7 operational evidence additions

Metrics SHALL also include requirement-to-artifact verified coverage, strategy thrash/no-progress events, derived-source recirculation rate, stale snapshot rebase rate, ontology-migration ambiguity, unresolved rights, degraded-fallback approval rate, sensitivity-driven research yield, offline feedback replay conflicts, prompt-injection taint-escape attempts, deletion/tombstone replay backlog and stale ApprovedSolutionPacket rejections. Do not turn these into a universal “quality score” or log private source bodies to make a dashboard.

## 19.2 R8 operational evidence additions

Record scoped search coverage and unexplored source classes; entity-join ambiguity and blocked cross-source comparisons; synthesis material-evidence omission; read-model revision gaps/replay time; continuous-subscription renewals/expired grants; outward-correction delivery status (authorized metadata only); claim-level disclosure denials; balanced-engine evaluation sample sizes/inconclusive outcomes; repeated ambiguous-feedback spend; rejected unsafe fetch/hostile-file attempts; orphan descendants and unreconciled provider charges; and cross-path OutcomeContract regressions. Route security and high-stakes correctness incidents through existing Spec 228/238 owners; keep admin telemetry aggregate/redacted and preserve tenant/project boundaries.

## 19.3 R9 operational evidence additions

Record rejection-context/revisit counts and mistakenly revived or over-broad exclusions; what-if sessions attempted/committed and denied accidental effects; translation ambiguity escalations by domain/language without source-body logging; field validation discrepancies and measurement class; systematic source-class exclusions; ask-vs-research-vs-test decision cost and human-question burden; alternative-family exposure coverage with consent; unsupported event-schema replay; deliverable bundle consistency failures; least-privilege child-credential denials; calculation formula/claim-revision invalidation; and blocked/leaked outbound-query sensitive fields. Metrics remain privacy-safe project/tenant projections under existing observability owners. New counters do not become execution or billing authority.

## 19.4 R10 operational evidence additions

Track trigger arbitration/pending-age/obsolete-reentry, conflicting external-effect claims and unresolved provider effects, dynamic-source context mismatch, temporal-join failure and targeted-refresh success, extraction qualifier/negation/unit errors, margin-check inconclusive rates, expert-attestation invalidation lag, cross-modal object-map ambiguity/corrected edits, diagnostic experiment information gain vs spend, authorized resumption-brief acknowledgement, command-payload collision and protected receipt denial, external correction delivery/acknowledgement and residual distribution risk. Aggregate/redact under existing security/observability owners; avoid logging raw restricted documents, secret query parameters or sensitive recipient identities.

## 19.5 R11 operational visibility

Expose only permission-filtered operational metrics: unresolved constraint cores by project/risk class; broken composition proofs; contingency trigger/revalidation failures; unsupported coordinate transforms; negative-result expiry and reopening; source-clarification delivery versus verified response; approval prompt backlog (without private content); accepted-artifact versus observed-outcome divergence; time-critical unknowns; benchmark challenge exposure/quarantine; untrusted third-party authority attempts; and evidence-support recomputation latency/false retraction. Attach current goal and policy revisions to trace IDs, not private URLs or raw user queries. Existing Spec 228/238 alerting and worker_jobs/Spec 207 telemetry remain authoritative.

## 19.6 R12 operational visibility

Existing admin and tenant-safe project dashboards SHALL expose by permission: seller/channel identity uncertainty; structure-extraction verification debt; sampling strata gaps; non-dominated option evidence gaps; risk-profile reclassifications; shared research consumer/grant count without cross-tenant identities; adapter attestation drift; external cost settlement pending; protected artifact patch regressions; critical decision-context omission; unresolved correction disputes; and provider incident impact/revalidation backlog. These are actionable operational signals, not new stores or a universal hidden quality score. Integrate incident notifications through existing Spec 228/238 channels, budget through Spec 207 and canonical job status through worker_jobs.

## 19.7 R13 operational visibility

Track rejected unknown intent variants, illegal transition/fencing attempts, ambiguous project-picker resolutions, oracle unmet predicate classes, truncated acquisitions, provisional-claim correction latency, visual assertion fidelity failures, inaccessible annotation attempts, refused portable-import records, quarantined artifacts, index-projection lag under revocation and deduplicated versus obsolete watch wakes. All metrics remain tenant-authorized and privacy-minimized under existing Spec 228/238/220 observability and policy owners; do not expose secret query bodies or full source text.

## 20. Cross-spec compatibility and follow-up backlog

**No retroactive edits** to Specs 1–213 inclusive. No edit to currently implementing Spec 224. Implement optional compatibility requirements via new code/contracts and future enhancement backlog under their owners:

| Existing scope | Additive compatibility / impact |
|---|---|
| Feature 196 + Spec 226 | Typed `ResearchInteraction` intent, result/anchor correlation, event/status display; no new chat brain |
| Spec 229 | Scoped multi-hop research retrieval, claim/evidence provenance, freshness/ACL projection and targeted invalidation; reuse Vectorize |
| Spec 233 | Project research lineage, goal/decision revision refs, Research Frontier, persisted synthesis and dependency map; no second project memory |
| Spec 241 | Personal/Project/Team/Tenant memory permissions, explicit user correction/revocation and safe recall into scoped projects |
| Spec 240 | Mini Chat result anchors, authorized research actions, branch comparison/annotation and published app version immutability |
| Spec 215 | Nested research/experiment plan representation, bounded branch orchestration and human-review waits through existing runtime |
| Spec 221 | Publish domain research methods, QA and specialist guidance as governed Skills after independent evaluation |
| Spec 222 | Read-only redacted strategy replay and shadow comparison; never autonomous promotion |
| Spec 231 | Policy-first model/tool selection, spend/quality routing; ID collision in historical 231 snapshots to be reconciled |
| Specs 217/218/219 | Reuse ProductDefinition/Development/Deployment; no auto publication from a Research Blueprint |
| Spec 235 -> Spec 224 | Only owner-approved bounded work package after actual, separately certified 224 ingress readiness |
| Specs 236/237 | Live commerce/realtime camera may open project-scoped child research and request new visuals, not independent ledgers |
| Specs 242/243 | Optional certified Sandbox/Managed Harness execution placement; no assumption of current production readiness |
| 3D candidate (number TBD) | `spatial.*` optional adapter family, including img2threejs/media2threejs, shared artifact/evidence/goal contracts; do not collide with provisional 244 |

## 20.1 R5–R6 cross-spec authority addendum

- **Spec 233** owns canonical Project goals/decisions and source-backed Project Knowledge; R5–R6 adds typed research/branch-dependent projections, not a parallel Project SoT.
- **Spec 229** is the only retrieval/index authority. Source drift and snapshot rights are represented in authorized metadata/artifacts; derived graph indexes are rebuildable and must not create new ACL truth.
- **Feature 196/Spec 226 and Spec 240** expose goal/branch/artifact-version-bound Chat and Mini Chat actions only after real endpoint/host contract discovery; stale region anchors must fail safely.
- **Spec 207 + Feature 186/195** own spend receipts and physical execution; research parent allocations and router ownership are projections/guards, not another ledger or job scheduler.
- **Spec 220** is the identity, privacy, purpose-sharing and approval authority. Spec 232 owns Cloudflare cutover; Spec 242/243 are optional execution placements, never canonical execution owners.
- **Spec 222** consumes permitted redacted evaluation traces and only advises challengers; Spec 221 controls specialist skill certification. **Spec 235** is the sole proposed approved bridge to the unchanged in-progress Spec 224.
- **Media and 3D** are peer optional output strategies. Image/video/2.5D/procedural-3D/mesh/engineering tools must honor exact artifact/goal/evidence linkage; generative images are never certified measurements merely because they accept dimension prompts.

## 20.2 R7 additive contract mapping

- **Feature 196 / Spec 226 / Spec 240:** preserve Chat/Mini Chat anchor, offline feedback idempotency and explicit user preference; do not grant publisher/private data authority to widgets.
- **Spec 233 / Spec 241:** canonical goal/decision versions, protected user corrections, ResearchContextSnapshot lineage and deletion impact; new trace/branch projections must not form another memory ledger.
- **Spec 229 / R2 / Vectorize:** evidence acquisition, provenance, derived-source lineage, taint, rights and re-index/restore. Graph summaries remain derived and retractable.
- **Specs 220/207/215 and Feature 186/195:** current authorization/purpose, billing reservation, logical run and physical job fencing; fallback and offline replay cannot bypass any authority.
- **Specs 221/231 and optional 199/200/242/243:** ontology/profile revisions, certified capability fallback, sandbox and provider egress contracts. A provider outage does not alter user-approved hard constraints.
- **Specs 217/230/235/224:** product packet freshness, external-context redaction and unchanged certified ingress/Final Verify. No extra writable ingress while 224 remains active.
- **Media Studio and optional spatial/3D capability:** source-to-derivative rights, visual and measured fidelity separation, common image/video/3D artifact lineage.

## 20.3 R8 additive contract mapping

- **Spec 229 + Spec 233 + R2:** `SearchCoverageLedger`, exact `EntityJoinProof`, `MaterialEvidenceDisposition` and permission-filtered claim display are bounded research projections over existing authoritative source/Project state, not another search system or autonomous memory store.
- **Feature 196/Spec 226 + Spec 240:** event watermarks, fresh Mini Chat/Chat read snapshots, contrastive ambiguous feedback, immutable artifact anchors; server still owns all admissions and authorizations.
- **Spec 238 + Feature 195/Spec 207:** recurring research subscriptions inherit current monitor/schedule/worker/financial authority. Recursive cancel and orphan recovery use real job and credit receipts, not speculative local counters.
- **Specs 220/241 and existing product delivery/release owners:** per-claim audience/purpose checks, external-delivery impact, revocation-safe correction notices and authorized derivative/export boundaries.
- **Spec 221/222/231, Media Studio and optional spatial adapters:** fair cross-engine EvaluationProtocol; OutcomeContract/InvariantDiff makes Image, Video, 3D, Hybrid and nonvisual calculations interchangeable *only when their requirement coverage is demonstrated*.
- **Spec 242/243 where certified:** sandbox/network destination checks and decompression/file admission remain security owners; no 244-run arbitrary crawler may bypass them. **Spec 224 remains unchanged**; any later Product Blueprint handoff still uses verified Spec 235.

## 20.4 R9 additive contract mapping

- **Feature 196/Spec 226, Spec 240 and Spec 233:** `RejectionRecord`, `WhatIfSession`, provisional `OptionExposureRecord` and explicit promotion receipts are versioned views/commands over existing project intent. No shadow user-profile service or Mini Chat privilege escalation.
- **Spec 229/R2/Spec 233 and authorized domain Skills (221):** original-language claim anchors, source exclusion labels, `FieldObservationReceipt`, `DerivedCalculationReceipt` and source applicability; Vectorize remains a reconstructable index, PostgreSQL/R2 the existing canonical stores.
- **Spec 220/241 plus credential owners:** per-child least-privilege capability and `QueryDisclosurePreflight` apply before provider egress or execution. No new authentication service or private-term-rich public telemetry.
- **Spec 215/Feature 186/195 and Spec 207:** speculative execution classes, event upcasters, current authorization and idempotent grants preserve existing logical-run, job and financial authorities.
- **Spec 217/Library/Media Studio and optional 3D adapters:** `DeliverableBundleManifest` pins coherent image/video/3D/data outputs and current rights before existing publication pointer advances. Spec 235 remains the only authorized handoff to unchanged in-progress Spec 224 after its independent readiness gate.

## 20.5 R10 additive contract mapping

- **Feature 196/Spec 226 and Spec 240:** typed trigger arbitration, exact user-intent precedence, CrossModalObjectMap selection, authorization-filtered ResumptionBrief and collision-safe idempotent feedback ingress; published Mini Chat never inherits publisher credentials.
- **Spec 233/Spec 241:** immutable goal/branch/decision refs, current user-specific last acknowledged view, cross-modal object identities and scoped project memory; expert receipt and correction records attach to canonical evidence rather than creating competing project stores.
- **Spec 229/R2 and governed source adapters:** AcquisitionContextReceipt, DecisionTemporalJoin and SourceSpanEntailment enrich scoped claim/evidence provenance; Vectorize remains reconstructable and may not grant source access.
- **Spec 220/Spec 207/Feature 186–195/Spec 215:** revocation/safety/approval precedence, per-resource cross-branch external-effect admission and command replay receipts use existing security, finance and canonical job authorities; no second scheduler or transaction ledger.
- **Spec 221 and approved specialist reviewers:** ConstraintMarginProof and ExpertAttestationBinding use calibrated domain schemas, valid inputs and separately authenticated sign-off, not model-created authority.
- **Library/Spec 217, Spec 228/238 and Media Studio/optional 3D:** exported revision correction/acknowledgement, rights, modality anchors and downstream distribution impact use existing release/notification/asset owners; image/video/3D remain independent optional output strategies.
- **Spec 235 → unchanged active Spec 224:** research context, evidence, expert proof and user-approved blueprint must be freshly revalidated at the independently certified handoff; do not expand Spec 224 in progress.

## 20.6 R11 additive contract mapping

- **Spec 233 / Spec 241:** constraint-conflict explanations, contingent branches, outcome receipts and third-party feedback are revisioned Project records/projections under canonical memory and decision ownership, never an independent personal-preference or goal store.
- **Spec 229 / R2 / source adapters:** scoped negative findings, clarification-response evidence and boolean source-support expressions reuse the only retrieval authority, existing source rights and lifecycle; any optional external outreach needs independently verified connector capability and consent.
- **Feature 196 / Spec 226 / Spec 240:** conditional-branch visualization, attention budget/partial batch decisions and imported-feedback review are typed currently authorized Chat/Mini Chat commands; no publication owner privilege is inherited.
- **Specs 220 / 207 / 215 / Feature 186–195:** third-party instruction isolation, consented contact, revalidation on contingency admission, bounded user interruptions and effects route through existing security/financial/approval/runtime authorities.
- **Spec 221 / 222 / 231:** specialist composition/temporal/measurement validators and leakage-resistant held-out evaluation prevent unverified cross-provider strategy promotion. Post-delivery learning remains optional and privacy-scoped.
- **Media Studio / Library / optional 3D:** SpatialReferenceFrameReceipt joins exact authorized 2D/image/video/3D object/asset versions only when metric transforms are actually validated; neither image-first nor optional 3D is mandatory universally.
- **Spec 217 / 235 → unchanged in-progress 224:** only human-approved, current evidence/compatibility/deadline/rights qualified product packets reach the separately certified 235 bridge. No edit to Specs 1–213 or active Spec 224.

## 20.7 R12 additive contract mapping

- **Spec 229 + Spec 233 / R2:** SupplierIdentityReceipt, StructuredExtractionProof, SearchSamplingDisclosure, DecisionContextCompletenessProof and CorrectionAdjudicationRecord attach to authorized evidence/goal versions; Spec 229 remains the retrieval authority and 233 the project knowledge owner.
- **Feature 196 / Spec 226 / Spec 240 + Spec 220:** RobustOptionFrontier, IntentRiskTransitionReceipt and ArtifactPatchPreservationContract are review surfaces and typed scoped user interactions; published Mini Chat end users never inherit publisher authority or private asset rights.
- **Spec 215 / worker_jobs / Spec 207:** SharedResearchDependencyLease and ExternalCostReconciliationReceipt reuse canonical physical execution, grants and financial truth; a shared result never authorizes shared cross-tenant source access.
- **Specs 199/200/221/230/231/242/243 and approved provider adapters:** CapabilitySupplyChainReceipt checks versioned runtime capability/egress before sensitive tool use; no new agent/Skill registry.
- **Media Studio / Library / optional spatial engine:** ArtifactPatchPreservationContract binds exact source-artifact and object/frame/3D locator revisions, preserving Image-first and nonvisual execution without compulsory 3D.
- **Existing Spec 228/238 incident paths:** ProviderIncidentImpactManifest is a rights-filtered consumer/revalidation projection, not a new global alert or tenant data authority.
- **Specs 235 → unchanged active Spec 224:** All new evidence, tool-attestation, context and risk-transition gates are additive to the existing independently certified handoff. No retroactive changes to Specs 1–213 or in-progress 224.

## 20.8 R13 additive contract mapping

R13 refines existing owners rather than creating another platform: §13DY/§13EA/§13ED -> Feature 196/226 and Spec 240 Chat surfaces; §13DZ/§13EB/§13EJ -> Spec 215, Spec 233 and canonical worker_jobs (plus Spec 238 watch scheduling); §13EC/§13EI -> Spec 229 acquisition/retrieval with R2/PG source truth; §13EE/§13EF -> Spec 217/240 Media Studio and optional certified 3D adapters; §13EG/§13EH -> Spec 220/241, Library/R2 and security owners. W17 SHALL verify live deployed contract shape before proposing migrations; no R13 capability is assumed to be implemented.

## 21. Deferred decisions requiring repository evidence

1. **Official ID / repository path:** 244 may collide with an earlier 3D concept; inspect authoritative registry and active development branches before registration. This file is portable under another unused ID without semantic change.
2. **Actual schema extension:** map to real Spec 233, job control and existing artifact tables before producing DDL.
3. **Actual Mini Chat interface:** pin deployed Spec 240 revision and authorization contract; prototype via existing Chat when Mini Chat is not yet live.
4. **Research provider licenses/capabilities:** reverify exact third-party version, source-rights, tool security and price before adoption; no compulsory dependency.
5. **Domain certification:** exact physical/financial/engineering gates are defined by separately reviewed, localized domain Skills and qualified reviewers.
6. **Research provider selection:** run a comparative fixture benchmark (direct authorized search vs multi-agent vs graph synthesis) before committing recurring infra cost.
7. **Spec 224 integration:** do not activate writable handoff until Spec 235's real stable-ingress milestone is independently proven.

## 22. Design gap-review: one hundred fifty-six cumulative distinct passes and incorporated corrections

These are **document-level architecture review passes**, not software test runs or source-code certification. Each pass names the ambiguity it checked and the explicit requirement incorporated above.

| Pass | Review focus | Incorporated correction / hard gate |
|---|---|---|
| 01 | Architectural duplication | Existing 196/215/186/195/207/220/229/233/224 remain canonical; adapters only |
| 02 | User intent drift | GoalRevision, hard/soft constraint split, approval receipt, no forced terminal answer |
| 03 | Research depth vs cost | Progressive depth, Research Frontier, bounded fan-out/budget and partial exit |
| 04 | Fragmented evidence | Per-claim provenance, exact product-variant resolution, separate offer records and source independence |
| 05 | Contradictions / stale sources | CONFLICTED/EXPIRED status, applicability, unknown fallback and targeted invalidation |
| 06 | Alternative diversity and merge | Mechanism-distinct branches, parent edge lineage and conflict-safe merge preview |
| 07 | User changes while jobs running | CAS goal revision, fencing, obsolete callbacks, paid cancellation/drain choices |
| 08 | Mini Chat privacy | end-user scope, selected artifact anchors, source-set digest and no publisher-granted cross-data |
| 09 | Multimodal neutrality / 3D retention | Image/video/2.5D/3D/analysis as output strategies; certified 3D remains first-class |
| 10 | Provider / external safety | untrusted-source prompt injection guard, egress policy, license, secrets and approval gates |
| 11 | Crash recovery / economic correctness | worker_jobs authority, PG outbox, idempotency/receipt reconcile and budget enforcement |
| 12 | Real-world user/workspace continuity | durable long-lived project knowledge, impact graph, partial acceptance, scoped reopen, portable artifacts |
| 13 | Research convergence | Decision-scoped coverage, explicit next-step dispositions, marginal information value and no fake domain completeness |
| 14 | Research blind spots | Bounded challenge pass for missing stakeholder/failure/source/alternative/local-condition dimensions |
| 15 | Branch explosion | Branch Portfolio, distinct-mechanism test, dominated/parked states and paid-concurrency gate |
| 16 | Artifact-driven requirement discovery | Structured feedback deltas, minimal discriminating question and no blind regeneration loops |
| 17 | Preference drift | Provisional inference vs explicit preference, historical preservation and external-advice verification |
| 18 | Temporal/reproducible research | Research Snapshot Manifest, dynamic fact TTL and targeted refresh |
| 19 | Research ↔ experiment feedback | Root-cause hypothesis taxonomy, targeted next action and repeated-failure loop breaker |
| 20 | Domain knowledge compounding | Governed project-to-domain promotion without cross-tenant/private leakage |
| 21 | Decision presentation quality | Non-coercive option comparison, no forced numeric ranking and explicit reversible/irreversible trade-offs |
| 22 | Recursive child research | Depth/fan-out/budget/time bounds, dependency justification, cycle dedup and parking |
| 23 | Modality escalation | Image-first ↔ 3D/spatial promotion preserves evidence and never conflates visual realism with measured truth |
| 24 | Staleness after acceptance | Dynamic dependent refresh and impact preview without invalidating stable unaffected project knowledge |
| 25 | Branch merge semantic safety | Merge as a new synthesis revision; compare assumptions/constraints/applicability and block incompatible automatic merge |
| 26 | Evidence reuse across contexts | Applicability rebasing with explicit reuse/refresh/revalidate/do-not-reuse dispositions |
| 27 | Multi-agent false consensus | Corroboration based on independent evidence sources, not model votes or repeated copied claims |
| 28 | Self-evaluation bias | Independent evaluator/deterministic validators, versioned rubrics and holdout fixtures for material outputs |
| 29 | Web/source manipulation | Source-class diversity, syndication grouping, commercial-bias awareness and poisoned-web resistance |
| 30 | Partial provider/research failure | Persist attempted/failed acquisitions and prevent incomplete evidence from silently appearing complete |
| 31 | Cancellation and sunk-cost salvage | Separate cancellation, draining, reusable artifacts and irreversible side-effect reconciliation; late results cannot resurrect goals |
| 32 | Long-lived context growth | Reconstruct active context from versioned knowledge packs without losing hard constraints, provenance or corrections |
| 33 | Domain adapter calibration | Certified applicability/units/assumptions/fixtures and `OUTSIDE_CERTIFIED_SCOPE` rather than unsafe extrapolation |
| 34 | Irreversible effect after goal drift | Fresh exact approval, last safe cancellation point and remediation semantics instead of fake rollback |
| 35 | Revocation/tombstone propagation | Dependency-aware targeted invalidation of derived claims/decisions/projections |
| 36 | User cognitive overload | Small active option set, representative alternatives and discriminating questions while preserving full branch history |
| 37 | Concurrent project mutation | Revision/ETag CAS, semantic conflict classes and no stale overwrite of user intent |
| 38 | Numeric uncertainty collapse | Preserve precision/ranges/provenance and propagate uncertainty through derived calculations |
| 39 | Unit/locale/jurisdiction mismatch | Original + normalized values, market applicability, tax/currency/date semantics and no silent cross-market reuse |
| 40 | Cache/dedup semantic collision | Scope/variant/time/goal-aware cache keys, reauthorization and no private cross-tenant leakage |
| 41 | Source acquisition rights | Adapter-level crawl/API/retention/redistribution policy and no bypass of access controls |
| 42 | Delegated approval ambiguity | Explicit bounded revocable delegation and exact approval provenance |
| 43 | Historical rationale survivability | Model-independent rationale bundle, no hidden-CoT dependency and immutable acceptance history |
| 44 | Research observability | Coverage-aware SLOs, contradiction/freshness/budget/late-result signals and existing alert integration |
| 45 | Quality regression after provider/model change | Versioned benchmark gates, contamination tracking and no promotion on unsafe degradation |
| 46 | Human correction vs machine evidence | Protected versioned correction, conflict surfacing and targeted downstream invalidation |
| 47 | Accepted unresolved risk | ResearchDebt lifecycle with triggers/owners/expiry and explicit residual-risk carry-forward |
| 48 | Provider lock-in / outage | Interoperable export, graceful degradation and canonical project state independent of any single provider |
| 49 | Hypothesis promotion and epistemic typing | An inferred claim may masquerade as verified project truth; added section 13AG, new A61 |
| 50 | Source drift, replacement and historic snapshots | A changed website can silently rewrite the basis of an old decision; added section 13AH, new A62 |
| 51 | Dependency cycles and incremental invalidation | Mutual claim/decision references may cause infinite invalidation cascades; added section 13AI, new A63 |
| 52 | Nondeterministic media and model reproducibility | A project may claim exact replay of nondeterministic model outputs; added section 13AJ, new A64 |
| 53 | Superseded-goal resurrection and ABA protection | A reopened branch may silently inherit obsolete permissions or approval; added section 13AK, new A65 |
| 54 | Composite-decision invalidation | Valid individual product choices may be incompatible when combined; added section 13AL, new A66 |
| 55 | Stakeholder preference authority and conflict | A collaborator or AI inference may override the paying owner’s explicit choice; added section 13AM, new A67 |
| 56 | Purpose limitation and privacy-safe reuse | Authorized access for one research purpose may be reused to train/share another product; added section 13AN, new A68 |
| 57 | Tool and adapter contract evolution | A changed provider schema can corrupt resumed long-running projects; added section 13AO, new A69 |
| 58 | Cross-store backup, restore and index repair | PostgreSQL, R2 and Vectorize can restore to different logical points; added section 13AP, new A70 |
| 59 | Late evidence and decision reopen protocol | New evidence after user approval may auto-change accepted selections; added section 13AQ, new A71 |
| 60 | Hierarchical budget reserve, capture and fairness | Child research fan-out can overspend or monopolize shared quotas; added section 13AR, new A72 |
| 61 | Research-frontier DAG and causal question closure | Closing a parent question may hide unresolved necessary subquestions; added section 13AS, new A73 |
| 62 | Counterfactual and baseline-aware alternative comparison | Proposals may appear beneficial only because baseline costs and unknowns are omitted; added section 13AT, new A74 |
| 63 | Dynamic quote validity and real landed cost | Mixing seller price, shipping quote and availability from different dates yields false certainty; added section 13AU, new A75 |
| 64 | Multimodal feedback anchoring and ambiguity | A user pointing to a visual region may change the wrong object/version; added section 13AV, new A76 |
| 65 | Expert and high-stakes escalation ownership | LLM-generated structural, legal or medical guidance may be mistaken for certification; added section 13AW, new A77 |
| 66 | Approval drift and pre-effect freshness | An approval can outlive an evidence or policy change before irreversible execution; added section 13AX, new A78 |
| 67 | Experiment independence and adversarial evaluation | Generator/evaluator collusion can produce inflated research quality scores; added section 13AY, new A79 |
| 68 | Source diversity and commercial manipulation | Affiliate/sponsored rankings and duplicate stores may bias product recommendations; added section 13AZ, new A80 |
| 69 | Progressive disclosure and truthful research UX | A polished answer can disguise partial coverage, stale facts or speculative options; added section 13BA, new A81 |
| 70 | Collaborative project permissions and revocation races | Mixed user/team/private research may leak via merged branches and notifications; added section 13BB, new A82 |
| 71 | Scoped acceptance, stopping and safe reactivation | An accepted phase may erroneously terminate or automatically restart unrelated work; added section 13BC, new A83 |
| 72 | Migration, canary and rollback authority | Concurrent old/new controllers may both admit jobs during rollout; added section 13BD, new A84 |
| 73 | Goal-to-artifact traceability | Decision-critical constraints could disappear between research, prompt, generation and release; added §13BE and A85 |
| 74 | Automatic strategy oscillation | No-progress score noise can cause repeated paid replan thrash; added §13BF and A86 |
| 75 | AI-generated evidence recirculation | Derived AI content/citation loops could masquerade as independent primary evidence; added §13BG and A87 |
| 76 | Asynchronous read consistency | Per-write CAS alone allows decisions synthesized from mutually inconsistent project revisions; added §13BH and A88 |
| 77 | Semantic ontology drift | Same-named domain fields can silently change meaning across adapter revisions; added §13BI and A89 |
| 78 | Derivative rights and consent | Source crawl/access rights do not automatically grant commercial distribution of generated image/video/3D derivatives; added §13BJ and A90 |
| 79 | Capability-safe fallback | A substitute model/harness may lose exact requirements or violate egress policy while claiming graceful failover; added §13BK and A91 |
| 80 | Sensitivity and value of missing evidence | Alternative selection can hinge on one uncertain shipping/price/material threshold not exposed to user; added §13BL and A92 |
| 81 | Offline/delayed Mini Chat feedback | Queued interaction can replay after artifact edits, ACL revocation and goal changes; added §13BM and A93 |
| 82 | Persistent untrusted-content taint | Prompt injection in a source may later reappear as apparently trusted summary/tool instruction; added §13BN and A94 |
| 83 | Privacy deletion across derived copies | Revoked/deleted sources may reappear from derived graph, export or restored backups; added §13BO and A95 |
| 84 | Research-to-development acceptance drift | Approved research packet may be stale when delivered to Spec 235/224; added §13BP and A96 |
| 85 | Unbounded search-completeness claims | Research result could say globally cheapest/no alternative after a rank-limited search; added §13BQ scoped SearchCoverageLedger, unknown exploration gaps and bounded negative assertions, new A97 |
| 86 | Variant-safe cross-source identity | Manual, offer and shipping inputs could be joined under lookalike model labels; added §13BR EntityJoinProof with accessory/market semantics and blocked ambiguous joins, new A98 |
| 87 | Adverse-evidence survival | Long-context synthesis could drop a critical refutation without trace; added §13BS MaterialEvidenceDisposition and fail-partial on unresolved material omission, new A99 |
| 88 | Multi-client event coherence | Out-of-order projections could show revoked or superseded decisions as current; added §13BT monotonic read watermark and safe snapshot replay after gap/ACL change, new A100 |
| 89 | Continuous watch authorization | Keep-looking request could silently renew background crawling/spend after consent expiry; added §13BU bounded subscriptions with every-occurrence authorization and expiry, new A101 |
| 90 | Exported output retraction | Corrected evidence might never reach owners of already delivered derivatives; added §13BV authorized delivery impact records and honest external correction semantics, new A102 |
| 91 | Privacy-preserving reasoning | Derived conclusions could disclose protected source information by inference; added §13BW per-claim disclosure decision and purpose-aware declassification, new A103 |
| 92 | Fair engine benchmarks | Unpaired tasks and different attempt limits could claim an unjustified best strategy; added §13BX paired EvaluationProtocol and uncertainty/inconclusive reporting, new A104 |
| 93 | Ambiguous-feedback exploration | Vague repeated rejection could silently mutate approved constraints and waste budget; added §13BY provisional feedback hypotheses and contrastive bounded trials, new A105 |
| 94 | Research network/file boundary | Redirect/SSRF and compressed hostile sources lacked explicit acquisition controls; added §13BZ redirect-aware egress and hostile-file limits at adapter boundary, new A106 |
| 95 | Cancel tree completion | Parent cancellation could strand paid grandchildren, quotas and private temp artifacts; added §13CA ResearchWorkTreeManifest and orphan reconciler with shared-asset safety, new A107 |
| 96 | Multimodal goal invariant | Image→video→3D conversion could silently lose SKU/rights/budget/spatial constraints; added §13CB OutcomeContract and cross-modality InvariantDiff with hard gates, new A108 |

| 97 | Scoped negative preferences | Gap: A user rejection can be over-generalized permanently or forgotten after renaming an equivalent option; Correction: §13CC scoped reversible RejectionRecord linked to goal/context; new A109 |
| 98 | Speculative versus committed user intent | Gap: A hypothetical Chat question may mutate selected goal or trigger paid work; Correction: §13CD no-commit WhatIfSession with distinct execution authorization; new A110 |
| 99 | Multilingual technical source fidelity | Gap: Translated text may lose units/model qualifiers or falsely appear as independent evidence; Correction: §13CE original-language translation trace and high-stakes bilingual review; new A111 |
| 100 | Empirical field-observation reliability | Gap: Visual estimates and user measurements may be trusted beyond their collection method/tolerance; Correction: §13CF FieldObservationReceipt and field-validation gating; new A112 |
| 101 | Systematically inaccessible market channels | Gap: Public-web coverage ledger can hide missing-not-at-random seller/product populations; Correction: §13CG classified coverage exclusions and bounded claims; new A113 |
| 102 | Research-versus-asking user effort | Gap: Planner can over-search when one user fact or small test would cheaply decide; Correction: §13CH bounded ask/reuse/search/test/expert routing; new A114 |
| 103 | Preference anchoring from narrow options | Gap: Agent may infer global disinterest from rejection of near-identical options; Correction: §13CI exposure record and feasible diversity probes; new A115 |
| 104 | Archived event-schema evolution | Gap: Old acceptance/revocation events can be misread after multi-year schema changes; Correction: §13CJ versioned replay upcasters, fail-closed gates; new A116 |
| 105 | Multi-artifact publication consistency | Gap: Individually valid picture, quote and bill-of-materials can be mutually inconsistent; Correction: §13CK coherent DeliverableBundleManifest and atomic pointer admission; new A117 |
| 106 | Child agent credential blast radius | Gap: Source child can inherit broad parent connector credentials or private project context; Correction: §13CL just-in-time per-child scoped capability brokering; new A118 |
| 107 | Derived calculation reproducibility | Gap: Uncertainty labels do not prove formula/input-version lineage for estimates; Correction: §13CM DerivedCalculationReceipt, deterministic fixture and incremental recalculation; new A119 |
| 108 | Outbound-query privacy | Gap: A public search string/referrer can expose private intent despite scoped document retrieval; Correction: §13CN QueryDisclosurePreflight and sanitized metadata; new A120 |
| 109 | Competing triggers and forward progress | §13CO `TriggerArbitrationReceipt`: precedence safety/revocation/cancel → current explicit authorized user intent → required expert/approval → decision-critical evidence invalidation → periodic refresh → exploratory work; event IDs and revisions, fairness deadline for eligible pending work, no automatic revival of obsolete tasks. |
| 110 | Cross-branch conflict on one external resource | §13CP `ExternalEffectConflictKey`: canonical transactional claim through existing worker_jobs/approval owner for resource+operation+external account+scope; reconcile provider unknowns, lease/fence and consent before effect. No new job/lock authority. |
| 111 | Dynamically personalized source capture | §13CQ `AcquisitionContextReceipt` captures permitted final URL/source version, region/locale, login class (not secrets), render method, variant selector, delivery destination granularity, rights, timestamp and sanitized response digest; comparisons refuse mismatched contexts. |
| 112 | Temporal coherence of composite decisions | §13CR `DecisionTemporalJoin`: per-component observation and validity intervals, effective dates, decision time and overlap result; stale or disjoint components require selective refresh or a conditional estimate rather than a present-tense firm claim. |
| 113 | Claim extraction entailment beyond citations | §13CS `SourceSpanEntailment`: normalized claim, exact authorized locator, original expression, unit/basis/negation/conditions and independent deterministic/manual verifier verdict; critical unsupported claims stay UNVERIFIED or CONFLICTED. |
| 114 | Robust hard-constraint feasibility margins | §13CT `ConstraintMarginProof`: input uncertainty bound, conservative test rule, reserve margin, validation profile and result VERIFIED_MARGIN / CONDITIONAL / FAIL / NEEDS_FIELD_CHECK; high-stakes physical conclusions still require certified professional review. |
| 115 | Scope and expiry of professional attestation | §13CU `ExpertAttestationBinding`: signer identity/role/credential verification method, authorized jurisdiction and scope, immutable input snapshot, limitations, expiry and invalidation conditions; reapproval on material revision, never fabricated expert sign-off. |
| 116 | Identity-preserving cross-modal edits | §13CV `CrossModalObjectMap`: approved canonical object/variant, per-modality anchors, observation confidence, mapping provenance and explicit disambiguation when object tracking is uncertain; require map diff and invariant checks across regeneration. |
| 117 | Causal diagnosis before expensive strategy switching | §13CW `DiagnosticExperimentPlan`: competing hypotheses, held-constant inputs, discriminating observation, cheapest authorized test, success/failure evidence and stop cost; do not report causal certainty from an uncontrolled generation comparison. |
| 118 | Faithful return after months of project inactivity | §13CX `ResumptionBrief`: last-seen authorized watermark, current goal and accepted deliverable revision, changes since last view, new conflicts/expired claims, open frontier, branch options and next consent decision; no passive-view acceptance or private-team leakage. |
| 119 | Idempotency-key reuse with different command payloads | §13CY `CommandReplayContract`: key scoped by actor/tenant/project/operation, canonical payload digest, auth epoch, expiry and exact prior outcome; mismatching payload returns deterministic conflict, retries reauthorize read access and never reissue external effects. |
| 120 | External consumer acknowledgement of corrected deliverables | §13CZ `DownstreamCorrectionReceipt`: affected exported revisions, authorized consumer/channel, notice attempt and acknowledgement status, safe replacement reference, unsupported recall and explicit outstanding external-risk escalation; respect consumer privacy and existing release/alert authorities. |
| 121 | Minimal conflicting constraints and constructive relaxation | Gap: A collection of individually reasonable hard and soft requirements can be jointly impossible. Current feasibility checks reject an option but do not expose a compact explanation of WHICH constraints conflict or generate controlled relaxations. Correction: 13DA `13DA` contract; fixture A133. |
| 122 | End-to-end multicomponent interface compatibility | Gap: A TV, bracket, anchor, wall and installer can each look suitable individually, while the assembled configuration fails; the same issue occurs with software dependency chains and mixed media pipelines. Entity joins and pairwise fit checks alone do not prove system-level compatibility. Correction: 13DB `13DB` contract; fixture A134. |
| 123 | Condition-triggered contingency branches without auto-commit | Gap: The existing Branch Portfolio can propose alternatives, but lacks a single durable conditional plan that explains when to switch, which facts require revalidation and when a contingency is too stale to execute. A user can be shown an attractive fallback without understanding its trigger or cost. Correction: 13DC `13DC` contract; fixture A135. |
| 124 | Coordinate reference frames and dimension provenance across outputs | Gap: Source measurements, AI image drafts, video crops, 2D floor plans and optional 3D scenes can share object identities but use incompatible coordinate origins, camera projection or dimension basis; a visual annotation may be misread as metric truth. Correction: 13DD `13DD` contract; fixture A136. |
| 125 | Negative-result evidence expiry and reopening | Gap: No-match, unavailable or no-alternative findings may be cached and silently treated as durable facts even after sellers add stock, a provider launches a feature or search-access conditions change. Existing claim TTL does not explicitly cover negative-result cache scopes. Correction: 13DE `13DE` contract; fixture A137. |
| 126 | Authorized human-source clarification with verified response lineage | Gap: Some decision-critical specs, delivery terms or installation rules exist only with a manufacturer, supplier or named specialist and cannot be confirmed by crawling more webpages. An agent might fabricate contact, assert that someone confirmed a fact, or send project secrets to an unapproved recipient. Correction: 13DF `13DF` contract; fixture A138. |
| 127 | Human attention budget and conflict-safe approval batching | Gap: Adaptive workflows can overwhelm users with many small clarification, source-access and spending prompts, or bury one consequential decision inside a bulk approval that also contains harmless research tasks. Approval latency becomes an unmeasured project bottleneck. Correction: 13DG `13DG` contract; fixture A139. |
| 128 | Observed post-delivery outcome vs subjective acceptance | Gap: An approved picture, blueprint or prototype may later fail when installed, used, shipped or operated. Current acceptance evidence is tied to the reviewed deliverable but not to the real-world outcome, encouraging false “solution achieved” claims and hiding new research triggers. Correction: 13DH `13DH` contract; fixture A140. |
| 129 | Time-window and lead-time feasibility across solution components | Gap: A technically viable branch may be impossible by the user’s deadline due to supplier lead time, installation bookings, permit waits, render queue, harness execution or dependent approvals. A price comparison alone cannot establish deliverability. Correction: 13DI `13DI` contract; fixture A141. |
| 130 | Evaluation holdout integrity and adaptive benchmark leakage | Gap: Iterative agent/model/skill tuning can memorize prior benchmark answers or optimize to one LLM judge. Even a nominally independent evaluator and paired budget-controlled trials cannot detect data leakage if prompts, ground truth and challenge cases are reused during development. Correction: 13DJ `13DJ` contract; fixture A142. |
| 131 | Third-party feedback provenance without delegated decision authority | Gap: A screenshot, forwarded chat, supplier message, consultant suggestion or client comment may contain useful counterevidence but can be mistaken for an authenticated owner instruction or expert approval. Existing stakeholder preference rules cover known actors but not provenance when advice is imported as content. Correction: 13DK `13DK` contract; fixture A143. |
| 132 | Boolean evidence dependency logic and minimal repair | Gap: Simple invalidation DAGs can over-retract a conclusion after losing one of several truly independent supporting sources, or under-retract it when one mandatory premise fails. Existing dependence tracking does not specify AND-versus-OR support or source-correlation semantics. Correction: 13DL `13DL` contract; fixture A144. |
| 133 | Source identity spoofing and counterpart authenticity | §13DM `SupplierIdentityReceipt` closes the observed gap; fixture A145 requires positive, negative and regression evidence. |
| 134 | Complex-document table, footnote and unit binding | §13DN `StructuredExtractionProof` closes the observed gap; fixture A146 requires positive, negative and regression evidence. |
| 135 | Search representativeness versus apparent coverage | §13DO `SearchSamplingDisclosure` closes the observed gap; fixture A147 requires positive, negative and regression evidence. |
| 136 | Interval-aware multi-objective option presentation | §13DP `RobustOptionFrontier` closes the observed gap; fixture A148 requires positive, negative and regression evidence. |
| 137 | Goal pivot changes domain and risk class | §13DQ `IntentRiskTransitionReceipt` closes the observed gap; fixture A149 requires positive, negative and regression evidence. |
| 138 | Shared sub-research across competing solution branches | §13DR `SharedResearchDependencyLease` closes the observed gap; fixture A150 requires positive, negative and regression evidence. |
| 139 | Tool and provider identity at execution time | §13DS `CapabilitySupplyChainReceipt` closes the observed gap; fixture A151 requires positive, negative and regression evidence. |
| 140 | Post-cancel provider billing and unknown effect settlement | §13DT `ExternalCostReconciliationReceipt` closes the observed gap; fixture A152 requires positive, negative and regression evidence. |
| 141 | Targeted partial-edit preservation for visual and nonvisual artifacts | §13DU `ArtifactPatchPreservationContract` closes the observed gap; fixture A153 requires positive, negative and regression evidence. |
| 142 | Must-include evidence assembly before consequential decisions | §13DV `DecisionContextCompletenessProof` closes the observed gap; fixture A154 requires positive, negative and regression evidence. |
| 143 | Disputed user/expert corrections without silent truth promotion | §13DW `CorrectionAdjudicationRecord` closes the observed gap; fixture A155 requires positive, negative and regression evidence. |
| 144 | Provider-wide quality/security incident blast-radius containment | §13DX `ProviderIncidentImpactManifest` closes the observed gap; fixture A156 requires positive, negative and regression evidence. |

| 145 | Typed command parity across Chat, Mini Chat and runtime | §13DY `ResearchCommandEnvelope` adds an executable typed boundary; fixture A157 includes positive, negative and failure/recovery evidence. |
| 146 | Explicit research/branch transition invariants | §13DZ `LifecycleTransitionProof` adds an executable typed boundary; fixture A158 includes positive, negative and failure/recovery evidence. |
| 147 | Ambiguous free-form Chat project resolution | §13EA `ProjectBindingDecision` adds an executable typed boundary; fixture A159 includes positive, negative and failure/recovery evidence. |
| 148 | Machine-checkable research readiness and exit gates | §13EB `DecisionReadinessOracle` adds an executable typed boundary; fixture A160 includes positive, negative and failure/recovery evidence. |
| 149 | Source acquisition completeness versus partial fetch | §13EC `AcquisitionCompletenessReceipt` adds an executable typed boundary; fixture A161 includes positive, negative and failure/recovery evidence. |
| 150 | Provisional streamed answers and citation-state changes | §13ED `AnswerClaimStateEnvelope` adds an executable typed boundary; fixture A162 includes positive, negative and failure/recovery evidence. |
| 151 | Visual assertion fidelity versus catalog truth | §13EE `VisualAssertionMap` adds an executable typed boundary; fixture A163 includes positive, negative and failure/recovery evidence. |
| 152 | Accessible and low-bandwidth anchored review | §13EF `AccessibleReviewAnchor` adds an executable typed boundary; fixture A164 includes positive, negative and failure/recovery evidence. |
| 153 | Portable project import with identity and rights reconciliation | §13EG `PortableProjectImportReceipt` adds an executable typed boundary; fixture A165 includes positive, negative and failure/recovery evidence. |
| 154 | Untrusted generated artifact quarantine and active content | §13EH `ArtifactSafetyReleaseReceipt` adds an executable typed boundary; fixture A166 includes positive, negative and failure/recovery evidence. |
| 155 | Search projection freshness under asynchronous write and purge | §13EI `ProjectionFreshnessReceipt` adds an executable typed boundary; fixture A167 includes positive, negative and failure/recovery evidence. |
| 156 | Continuous research event-storm coalescing and watch fencing | §13EJ `ResearchWakeCoalescingReceipt` adds an executable typed boundary; fixture A168 includes positive, negative and failure/recovery evidence. |

### 22.1 Independent reviewer / implementer checklist

R12 introduced the following reviewer check (retained in R13): validate search-source authenticity separately from claim entailment, verify arbitrary document tables/footnotes before consequential use, run cross-goal risk transitions and shared-research cancellation races, reconcile delayed billing through the canonical financial owner, and confirm patch/regression preservation plus a provider-cohort kill-switch. If no provider/connector is authorized, the corresponding feature remains unavailable instead of simulating successful external evidence.


- [ ] Numbering registry/main/PR/worktree collision resolved (including 3D candidate).
- [ ] Deployed APIs, permission models and canonical schema inventoried; no new duplicate authority.
- [ ] 168 acceptance scenarios mapped to runnable deterministic tests with failure injections.
- [ ] Source provenance rights, stale-data and cross-tenant privacy threat model independently signed off.
- [ ] Exact external provider versions/licensing verified; shadow comparison against baseline.
- [ ] Cost/retry/cancel/late-completion and R2 checkpoint recovery proven.
- [ ] Mini Chat end-user scope verified using malicious publisher fixtures.
- [ ] All published claims label measured vs estimated vs AI-generated.
- [ ] Existing Spec 224 implementation remains unchanged; handoff disabled until verified.
- [ ] Canary release metrics, rollback owner and on-call alert routing accepted.

**Definition of Done (for actual implementation, not this draft):** A user can start with an ambiguous domain-agnostic goal, research a focused sub-question, inspect sources, view at least two materially distinct solutions, try one via an authorized execution adapter, reject it from Chat or Mini Chat, preserve reusable evidence/artifacts, revise goals, open targeted fresh research, obtain another result and explicitly accept a revision—with crash, security, source revocation, spending and obsolete-callback controls demonstrated under realistic tests. The same project can later reopen the accepted decision, refresh stale facts, branch to another mechanism, and reproduce the evidence basis of the earlier choice without starting over. Both image-first and optional 3D paths remain available without imposing either as a universal prerequisite.
