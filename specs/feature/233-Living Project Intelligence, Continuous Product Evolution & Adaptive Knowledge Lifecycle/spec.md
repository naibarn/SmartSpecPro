---
spec_id: 233
title: SmartAIHub Living Project Intelligence, Continuous Product Evolution & Adaptive Knowledge Lifecycle
revision: 2.1
status: PROPOSED — implementation-ready architecture candidate; production certification pending
created: 2026-09-23
suggested_repository_path: specs/feature/233-living-project-intelligence-product-evolution/spec.md
primary_owners: Product Intelligence / Knowledge Platform / AI Orchestration / Library / Platform Engineering
implementation_baseline: Spec 212 design/corpus baseline and historical Specs 1–213 inputs; runtime implementation and certification require source/deployment verification; spec-224-in-progress-unchanged
risk_class: high
baseline_integrations: ["existing Chat/Library/Identity", "Feature 186/195 existing worker_jobs", "Feature 196 via Spec 226 bridge", "Spec 220 auth", "PostgreSQL/R2"]
phased_companions: ["Spec 229 retrieval", "Spec 230 harness context", "Spec 231 inference", "Spec 212 design/corpus baseline pending runtime verification"]
optional_downstream_integrations: ["Spec 234 use-case upgrade", "Spec 235 development handoff to unchanged Spec 224"]
---

# Spec 233 — SmartAIHub Living Project Intelligence, Continuous Product Evolution & Adaptive Knowledge Lifecycle

**Revision:** R2a — dependency/contract errata after ten-pass audits of 234/235; separate upgrades around the Spec 212 design/corpus baseline and in-progress Spec 224  
**Date:** 24 September 2026 (R2a errata)  
**Status:** Implementation-ready design candidate. This document defines contracts and acceptance gates; it is not evidence that the capability is implemented or production-certified.  
**Suggested repository destination:** `specs/feature/233-living-project-intelligence-product-evolution/spec.md`

---

# 0. Executive decision

SmartAIHub SHALL evolve from a chat-and-tools platform into a **Living Project and Product Intelligence platform** that can accumulate user knowledge over long periods, understand what SmartAIHub can and cannot currently do, combine that platform knowledge with private user knowledge and model knowledge, identify missing capabilities, and continuously turn validated needs into Skills, Workflows, Mini Apps, Products or platform capabilities.

The system SHALL support users who spend days, months or years discussing, researching, uploading material, changing direction, running experiments and gradually building systems without knowing the final destination at project start.

The canonical intelligence loop is:

```text
User conversation / uploads / research / feedback
        ↓
Project Memory + Private Knowledge
        ↓
Platform Capability / Use Case / Product Knowledge
        ↓
LLM reasoning
        ↓
Capability Resolution
  SUPPORTED | COMPOSABLE | PARTIAL | PLANNED | UNSUPPORTED | UNKNOWN
        ↓
Solution / Clarification / Experiment / Capability Gap
        ↓
Harness expansion when useful
        ↓
SmartAIHub capability verification
        ↓
Admin or project-owner approval where required
        ↓
Skill / Workflow / Mini App / Product / Core development
        ↓
Spec 224 development lifecycle when software development is required
        ↓
Verification / release / capability publication
        ↓
Knowledge + Use Case + Memory + Capability update
        ↺
```

The system SHALL NOT treat Vectorize, chat history, an LLM answer, a harness proposal or a generated workflow as durable truth by itself.

---

# 1. Non-negotiable architecture invariants

1. **PostgreSQL remains authoritative for relational state, ACLs, ownership, lifecycle state, manifests, indexes, capability status and current operational truth.**
2. **R2 / Library is the durable long-term substrate for user files, project knowledge artifacts, archived conversations, memory documents, experiment artifacts and reconstructable evidence.**
3. **Vectorize / AI Search is a reconstructable retrieval projection, not a permanent source of truth.**
4. **Spec 229 remains the only production Retrieval Broker / search / RAG authority. Spec 233 may request indexing, demotion, rehydration and retrieval but SHALL NOT create an independent RAG stack.**
5. **Spec 220 remains authorization/privacy/data-access authority. Private project knowledge must never become cross-user or cross-tenant knowledge merely because an LLM summarized it.**
6. **In-progress Spec 224 remains the canonical autonomous software-development lifecycle/finality owner; its current implementation scope and Final Verify are FROZEN. Spec 233 discovers and qualifies opportunities, while future Spec 235 provides an independently gated additive handoff.**
7. **Spec 230 remains the engineering/harness context-composition authority. Spec 233 produces product/project intelligence inputs consumed by Spec 230 when development is requested.**
8. **Spec 222 remains replay/evaluation/advisory learning. It may learn from approved redacted evidence but is not the private project memory authority.**
9. **The Spec 212 design/corpus baseline is the intended Use Case / Workflow Template / Capability Lab boundary, but its current runtime owner must be source/deployment-verified. Spec 234, NOT a retroactive Spec 212 revision, bridges Spec 233 eligible demand and approved candidates only to verified admission/publication interfaces.**
10. **Implemented specs through 213 SHALL NOT be retroactively rewritten. Feature 196 integration is additive through Spec 226.**
11. **No capability gap may be created until the system has attempted existing-capability, composability, workflow/use-case, planned-work and duplicate-gap resolution.**
12. **No private conversation, research result or user file may be promoted into platform-wide product knowledge or admin-visible demand intelligence without an explicit eligible policy path.**
13. **No vector shall be retained forever solely because its source remains retained. No important source shall be deleted solely because its vector is demoted.**
14. **A Living Project may exist before any Mini App, Workflow or code repository exists.**
15. **A generated artifact is not Verified; a Verified artifact is not automatically Public; a Public capability is not automatically available to every tenant/user.**

---

# 2. Why this spec exists

Existing SmartAIHub systems already cover chat, Help, Library/RAG, Skills, Workflows, use cases, external harnesses, autonomous development and self-improving exploration. The missing layer is the long-lived **product/project intelligence lifecycle** connecting them.

Without this layer:

- chat discussions disappear into long transcripts;
- user intentions are confused with confirmed plans;
- repeated questions create duplicate development ideas;
- private research cannot safely become reusable project context;
- LLMs can suggest solutions that SmartAIHub cannot actually execute;
- coding harnesses know how to build software but do not know SmartAIHub's current product capabilities;
- stale vectors accumulate indefinitely;
- cold knowledge becomes hard to rediscover after vectors are removed;
- Mini Apps are treated as one-shot outputs rather than evolving research/product systems;
- user demand cannot reliably feed product evolution without leaking private information.

Spec 233 provides the missing control plane while preserving the ownership boundaries of existing specs.

---

# 3. Core conceptual model

## 3.1 Tri-source intelligence

Every non-trivial solution MAY draw from three distinct knowledge sources:

```text
A. PLATFORM KNOWLEDGE
   SmartAIHub capabilities, Skills, Workflows, models, Use Cases,
   permissions, policies, runtime status and verified product behavior.

B. USER / PROJECT PRIVATE KNOWLEDGE
   chats, uploaded research, datasets, documents, findings, decisions,
   experiments and project-specific knowledge under explicit ACLs.

C. MODEL KNOWLEDGE
   general knowledge and reasoning available from the selected LLM/model.
```

The system MUST preserve source identity. Model knowledge cannot prove platform availability; platform metadata cannot prove a scientific claim; private user evidence cannot be generalized to other users without governance.

## 3.2 Living Project

A `LivingProject` is the durable container for a user's evolving objective. It MAY begin as a conversation and MAY later contain:

- Mini Apps;
- Web Apps;
- Workflows;
- Skills;
- datasets;
- research notes;
- experiments;
- decisions;
- private tools;
- product branches;
- development runs;
- capability gaps;
- open questions;
- external-harness proposals.

A Living Project has no mandatory final state.

## 3.3 Product Intelligence

Product Intelligence answers:

- what SmartAIHub supports now;
- what is composable from existing parts;
- what is partial or planned;
- what is unavailable;
- which workflows/use cases match a user goal;
- what constraints, permissions, cost or risk apply;
- what must be added to make a solution feasible.

It is product/system intelligence, not source-code search.

## 3.4 Product Evolution

Product Evolution converts qualified unmet needs into governed improvement work while minimizing duplicate capability creation.

---

# 4. Canonical entities

At minimum the implementation SHALL define versioned contracts for:

```ts
interface LivingProject {
  projectId: string;
  tenantId: string;
  ownerPrincipalId: string;
  title: string;
  status: 'EXPLORING'|'ACTIVE'|'PAUSED'|'ARCHIVED';
  privacyClass: ProjectPrivacyClass;
  createdAt: string;
  updatedAt: string;
  currentKnowledgePackRef?: string;
  retentionPolicyRef: string;
}

interface ProjectMemoryItem {
  memoryId: string;
  projectId: string;
  memoryType: 'GOAL'|'IDEA'|'USER_KNOWLEDGE'|'DECISION'|'FINDING'|'EXPERIMENT'|'OPEN_QUESTION'|'CONSTRAINT'|'POLICY'|'CAPABILITY_GAP_REF';
  epistemicState: 'OBSERVED'|'CANDIDATE'|'USER_CONFIRMED'|'VERIFIED'|'SUPERSEDED'|'REJECTED';
  sensitivity: string;
  summary: string;
  sourceRefs: EvidenceRef[];
  validFrom?: string;
  validTo?: string;
  supersedes?: string[];
  currentArtifactRef?: string;
  lastUsedAt?: string;
}

interface CapabilityGap {
  gapId: string;
  scope: 'PROJECT_PRIVATE'|'TENANT'|'PLATFORM_CANDIDATE';
  canonicalNeedId: string;
  status: 'DISCOVERED'|'QUALIFYING'|'PLANNED'|'APPROVED'|'IMPLEMENTING'|'VERIFIED'|'SHIPPED'|'REJECTED'|'DUPLICATE';
  resolutionClass: 'KNOWLEDGE'|'DISCOVERABILITY'|'COMPOSITION'|'SKILL'|'PRODUCT'|'PLATFORM';
  existingCapabilityRefs: string[];
  missingCapabilityRefs: string[];
  relatedUseCaseRefs: string[];
  workaroundRefs: string[];
  evidenceRefs: EvidenceRef[];
  demandSignalRef?: string;
  developmentRef?: string;
  duplicateOf?: string;
}

interface KnowledgeArtifactManifest {
  artifactId: string;
  projectId?: string;
  canonicalUri: string;
  contentDigest: string;
  contentClass: string;
  aclRef: string;
  retentionClass: string;
  indexState: 'HOT'|'WARM'|'COLD'|'SOURCE_ONLY'|'REHYDRATING'|'STALE';
  indexProfile?: string;
  lastIndexedAt?: string;
  lastRetrievedAt?: string;
  sourceRevision: string;
}
```

The exact physical schema MAY differ, but semantic fields and lifecycle behavior are mandatory.

---

# 5. Project Memory Engine

## 5.1 Purpose

The Project Memory Engine SHALL convert long-running conversation and project activity into durable, reviewable knowledge without treating the full transcript as active model context.

## 5.2 Memory classes

Minimum classes:

- Goals;
- Ideas / intentions;
- User knowledge;
- Decisions and rationale;
- Experiments and findings;
- Constraints and policies;
- Open questions;
- Capability gaps / opportunities.

## 5.3 Event-to-memory flow

```text
Chat / upload / experiment / action
   ↓
Project event append
   ↓
Significance detector
   ↓
Candidate memory extraction
   ↓
Dedup / contradiction / temporal comparison
   ↓
Memory consolidation
   ↓
SQL hot state + Library memory artifact update
   ↓
Spec 229 projection/index update when warranted
```

The system MUST NOT rewrite all memory on every message.

## 5.4 Significance rules

Events likely to create or update memory include:

- explicit user decisions;
- new project goals;
- new research findings;
- uploaded evidence;
- a changed constraint;
- a discovered contradiction;
- an experiment result;
- a capability request;
- a previously deferred idea becoming active;
- an explicit request to remember or forget project content.

Ephemeral operational facts such as a transient queue count or current provider response MUST NOT become long-term project memory unless independently relevant.

## 5.5 Temporal semantics

Memory SHALL preserve history without presenting old state as current state.

Example:

```text
2026-09: idea = explore user-recorded character voice
2026-10: status = paused
2027-02: status = resumed
```

The current view is `resumed`; the historical decisions remain traceable.

---

# 6. Memory as durable Library artifacts

## 6.1 Canonical project memory files

For appropriate projects, SmartAIHub SHALL compile durable human-readable knowledge artifacts in Library/R2. A default logical structure is:

```text
/projects/<project-id>/memory/
  PROJECT_OVERVIEW.md
  CURRENT_STATE.md
  GOALS.md
  DECISIONS.md
  IDEAS.md
  OPEN_QUESTIONS.md
  FINDINGS.md
  EXPERIMENTS.md
  CAPABILITY_GAPS.md
  PRODUCT_REQUESTS.md
  timeline/YYYY-MM.md
  research/...
  sessions/YYYY-MM-DD-summary.md
```

The physical file layout MAY be virtualized, but exported artifacts MUST remain deterministic and reconstructable.

## 6.2 Files are not raw transcript duplication

Memory artifacts are curated projections. Raw conversations MAY be retained or archived separately according to policy.

Each material assertion SHOULD preserve references back to its source messages, uploads, experiment records or other evidence.

## 6.3 Semantic patching

Consolidation SHOULD update the affected section rather than blindly append duplicate summaries. Human edits MUST be protected using versioning/managed sections or conflict-aware merge.

## 6.4 Knowledge pack

The Project Knowledge Compiler SHALL produce a compact `ProjectKnowledgePack` containing references, not copies of all content.

Minimum outputs:

```text
PROJECT_OVERVIEW.md
CURRENT_STATE.md
KNOWLEDGE_MAP.json
CAPABILITY_MAP.json
OPEN_QUESTIONS.md
NEXT_OPPORTUNITIES.md
```

---

# 7. Chat and SQL lifecycle

## 7.1 Principle

SQL is optimized for operational state and indexed lookup, not indefinite duplication of every large body of historical content.

## 7.2 Tiered conversation retention

A policy MAY define:

```text
HOT     -> message body + metadata in operational SQL
WARM    -> compact SQL metadata + archived message bundle in R2
COLD    -> thread/session manifest + R2 archive pointer
PURGED  -> removed only under explicit retention/deletion policy
```

Thresholds are configurable and must not be hard-coded by this spec.

## 7.3 Archive formats

Long-lived archives SHOULD use interoperable formats such as JSONL, Markdown bundles and/or Parquet where appropriate, with content digests and schema versions.

## 7.4 Reopening old chat

The UI must continue to show archived conversations. Opening an archived thread MAY stream content from R2 rather than restoring the entire transcript to SQL.

## 7.5 SQL compaction safety

Archival MUST preserve:

- thread identity;
- ordering;
- ownership and ACL;
- references from memory/evidence;
- deletion/tombstone semantics;
- legal/retention holds;
- source digest and archive verification.

---

# 8. Adaptive Knowledge Lifecycle

## 8.1 Core rule

Vector/search representations are derived and reconstructable.

```text
canonical source retained ≠ vector retained forever
vector removed ≠ canonical source deleted
```

## 8.2 Universal knowledge tiers

Spec 229 SHALL expose lifecycle semantics covering at least:

| Tier | Meaning | Vector behavior |
|---|---|---|
| HOT | actively used/current knowledge | full authorized semantic/hybrid projection |
| WARM | useful but lower activity | summary/selected projection or keyword-first |
| COLD | retained, rarely used | no detailed vector; catalog discoverability only |
| SOURCE_ONLY | canonical source retained, not semantically indexed | metadata/exact discovery; index on demand |
| KEEP_INDEXED | user/business/policy pin | no automatic demotion |

## 8.3 Lifecycle scoring

The controller SHALL consider more than age:

```text
last_used_at
last_semantic_hit_at
successful_answer_use_count
project_activity
project/status dependency
importance/pin/hold
future workflow reference
index freshness
reconstruction/re-embedding cost
storage/query cost
content size
privacy class
source revision stability
```

## 8.4 Knowledge catalog

Cold or source-only content SHALL remain discoverable through a compact authorized Knowledge Catalog containing enough metadata to locate and rehydrate the source without retaining detailed vectors.

## 8.5 Semantic rehydration

```text
query
 -> active retrieval
 -> catalog/metadata fallback when needed
 -> authorized canonical source fetch
 -> immediate direct use if sufficient
 -> selective re-index if repeated semantic access is expected
```

Re-indexing must not be required merely to open a known file by ID.

## 8.6 Anti-thrashing

Use hysteresis, minimum tier dwell time, bounded transitions and idempotent lifecycle jobs.

---

# 9. Product Capability Intelligence

## 9.1 Capability resolution states

Every product-intelligence answer involving feasibility SHALL distinguish:

```text
SUPPORTED
COMPOSABLE
PARTIAL
PLANNED
UNSUPPORTED
UNKNOWN
```

`UNKNOWN` is mandatory when evidence is insufficient.

## 9.2 Capability sources

Resolution MAY use:

- Capability Registry;
- Skill Registry;
- Workflow/Node registries;
- Spec 212 use cases / certified variants;
- model/provider capabilities;
- runtime/capability attestation;
- Help/product docs;
- release state;
- permissions and entitlement;
- deployment/environment availability.

Similarity alone cannot prove support.

## 9.3 Minimum reuse resolution before gap creation

Before creating a new gap, check in order:

```text
1 exact existing capability
2 composition of existing capabilities
3 existing workflow/use case/template
4 extension/configuration/adapter of existing capability
5 currently planned/in-progress capability
6 existing capability gap / product request
7 only then create a new gap
```

---

# 10. Demand Intelligence and need canonicalization

User wording varies; the underlying need often repeats.

The system MAY normalize phrases such as:

```text
"อยากอัดเสียงเองให้นางเอก"
"ใช้เสียงผมแทนตัวละครได้ไหม"
"ให้ user พูด dialogue เองได้หรือเปล่า"
```

into a semantic need such as `user-recorded-character-voice`, but MUST preserve source privacy.

## 10.1 Gap classification

A need SHALL be classified before development:

```text
KNOWLEDGE_GAP        system can do it; AI/product knowledge is incomplete
DISCOVERABILITY_GAP  system can do it; user cannot find the path
COMPOSITION_GAP      primitives exist; workflow/composition is missing
SKILL_GAP            small reusable capability is missing
PRODUCT_GAP          UI/product flow or Mini App capability is missing
PLATFORM_GAP         platform primitive/runtime/security/data capability is missing
```

## 10.2 Private demand boundary

Private project questions MUST NOT automatically become admin roadmap items.

Eligible product signals require policy-controlled consent/aggregation/anonymization or explicit user submission.

---

# 11. Solution reasoning and clarification

## 11.1 Ask the user for high-value missing information

When a solution depends on knowledge only the user is likely to possess, the system SHOULD ask targeted questions rather than fabricate assumptions.

Clarifications SHOULD be prioritized by expected decision impact.

## 11.2 Structured Solution Evidence Package

The reasoning engine SHALL be able to construct:

```text
User Intent
Authorized Project Knowledge refs
Verified Platform Capability Snapshot
Relevant Use Cases / Workflows
Known Constraints
Open Questions
Model-generated hypotheses
Evidence provenance
Expected output class
```

The package is versioned and ACL-scoped.

## 11.3 Epistemic labels

Outputs SHOULD distinguish:

- user-supplied evidence;
- verified platform fact;
- derived calculation;
- model knowledge;
- hypothesis;
- unverified proposal.

---

# 12. External Harness Expansion Loop

Codex, Claude Code, Antigravity, Hermes and future harnesses MAY be used to expand a preliminary solution, but SmartAIHub remains the product-capability authority.

Canonical loop:

```text
SmartAIHub preliminary solution
        ↓
Spec 230 bounded context / Solution Context Package
        ↓
Harness proposes detailed architecture / workflow / code plan
        ↓
SmartAIHub re-validates every required capability
        ↓
missing parts identified
        ↓
revise proposal or create governed gap
```

Harness proposals SHALL NOT mutate Capability Registry directly.

Private data forwarding follows Spec 220 policy and must use the minimum required projection. External provider permission is independent from project-file permission.

---

# 13. Minimal Capability Increment principle

When a gap is real, the system SHOULD prefer the smallest reusable primitive that unlocks the widest legitimate set of use cases.

Example:

```text
Avoid: DramaVoiceRecordingFeature only
Prefer, if architecture supports it:
  UserAudioCapture
  ReusableVoiceAsset
  CharacterVoiceBinding
```

This principle is advisory; domain/security requirements may require a dedicated capability.

---

# 14. Living Application evolution

Mini Apps, Web Apps and Workflows created inside a Living Project SHALL be evolvable artifacts, not one-shot outputs.

A project MAY maintain:

```text
stable branch/version
experiment branches
candidate workflows
private skills
new datasets
new UI modules
historical experiments
future backlog
```

Experimental branches MUST NOT silently mutate the stable application.

Promotion follows explicit review/verification gates appropriate to the artifact class.

---

# 15. Experiment and research support

Spec 233 defines an `ExperimentRecord` interoperability contract but does not mandate a single scientific toolchain.

Minimum provenance:

```text
experiment_id
hypothesis / objective
input dataset refs + revisions
method/tool/model versions
parameters
code/workflow revision
metrics/results
artifacts
operator/agent identity
started_at / completed_at
limitations
reproducibility status
```

Optional adapters MAY integrate MLflow, DVC or domain-specific research tools later.

Failed experiments SHOULD remain retrievable knowledge when policy permits.

---

# 16. Capability Gap to development lifecycle

## 16.1 Promotion states

```text
OBSERVED_NEED
CANONICAL_NEED
GAP_CANDIDATE
QUALIFIED_GAP
SOLUTION_CANDIDATE
APPROVED
IMPLEMENTING
VERIFIED
PUBLISHED_CAPABILITY
```

## 16.2 Approved development handoff via future Spec 235

Only after approval/policy eligibility MAY an approved development intent enter the Spec 235 independent bridge. Spec 235 SHALL submit the versioned package to the **actual existing Spec 224 ingress only after its separately verified integration-readiness gate**, without editing or restarting Spec 224. The package contains:

- problem/need;
- affected project/use cases;
- capability-resolution evidence;
- duplicate/reuse analysis;
- minimal capability proposal;
- required artifact class;
- acceptance criteria;
- privacy/security constraints;
- budget/risk class;
- approved scope.

Once Spec 235 has an authentic accepted handoff receipt, Spec 224 owns development continuation and Final Verify. Until then the intent remains queued/exportable without claiming development has started.

## 16.3 Post-release closure

A successfully released capability SHALL trigger:

- Capability Registry update;
- affected use-case readiness reevaluation;
- resolved-gap closure;
- Product Knowledge update;
- targeted Spec 229 reindex/projection update;
- optional notification to eligible requesting projects/users under policy.

---

# 17. UI/UX requirements

## 17.1 Project Memory

A Living Project MUST expose a user-accessible memory view with at least:

- Current goals;
- Ideas;
- Decisions;
- Research/findings;
- Experiments;
- Open questions;
- Capability gaps/opportunities;
- source/evidence links;
- status/history;
- pin / exclude / correct actions;
- privacy/share scope.

## 17.2 Knowledge state

Library/project details MAY show advanced index state (`HOT`, `WARM`, `COLD`, `SOURCE_ONLY`, `REHYDRATING`) without forcing ordinary users to manage vectors manually.

Users SHOULD be able to pin important knowledge to remain quickly searchable where policy/budget permits.

## 17.3 Product Intelligence answer UX

Answers SHOULD provide:

```text
What you can do now
Recommended path(s)
What SmartAIHub will use
What is partial / unavailable
What information is still needed
Estimated constraints/cost where known
Available next actions
```

Internal source-code details are optional and should not dominate ordinary product questions.

## 17.4 Admin Product Evolution Inbox

Admin/product owners SHALL have a queue for eligible product signals showing:

- canonical need;
- evidence-safe demand count;
- affected use cases;
- current capability coverage;
- existing/in-progress duplicate check;
- resolution class;
- reuse potential;
- estimated effort/risk;
- suggested action;
- approval/merge/defer/reject controls.

Private source content SHALL NOT be exposed merely to justify aggregate demand.

---

# 18. Security, privacy and tenant isolation

1. All retrieval is authorized through Spec 220 + Spec 229 boundaries.
2. Vector namespace/filtering is not sufficient authorization by itself.
3. Memory artifacts inherit source/project ACL and may require stricter derived-data labels.
4. Revocation must invalidate future retrieval and propagate to derived indexes/caches according to policy.
5. External harness forwarding must be explicitly policy-eligible; source files and derived summaries can have different forwarding permissions.
6. Uploaded/retrieved content is untrusted data and cannot grant tools, permissions or override system policy.
7. Cross-project memory retrieval is deny-by-default unless the principal has access and the request scope allows it.
8. Cross-tenant product learning is forbidden unless a separate governed privacy-preserving policy explicitly allows it.
9. Admin aggregate signals must satisfy minimum aggregation/privacy thresholds when configured.
10. Security/policy memories may be pinned to a minimum retrieval tier irrespective of ordinary recency scoring.

---

# 19. Storage ownership

## 19.1 PostgreSQL

Use for:

- current LivingProject state;
- ACL/ownership refs;
- current memory metadata/state;
- artifact manifests;
- relationship/catalog metadata;
- capability/gap lifecycle;
- index state;
- pointers to R2/Library artifacts;
- current experiment metadata;
- audit and governance references.

## 19.2 R2 / Library

Use for:

- durable project memory documents;
- raw/archived conversations under policy;
- user files/datasets;
- research and experiment artifacts;
- generated project knowledge packs;
- long-lived reports;
- reindexable source projections;
- archive bundles.

## 19.3 Vectorize / AI Search

Use for authorized semantic/keyword discovery projections under Spec 229 lifecycle policy.

## 19.4 `worker_jobs`

All durable background consolidation, archive, rehydration, indexing and development handoff work must execute through the canonical job/control plane. Spec 233 creates no new durable job authority.

---

# 20. Background jobs

Minimum logical jobs (names may map to the canonical job taxonomy):

```text
ProjectMemoryConsolidationJob
ProjectKnowledgeCompileJob
ConversationArchiveJob
KnowledgeLifecycleEvaluationJob
KnowledgeRehydrationJob
CapabilityResolutionRefreshJob
GapDeduplicationJob
UseCaseImpactReevaluationJob
ProductEvolutionSignalAggregationJob
```

All jobs require idempotency, fencing where relevant, tenant/project scope, bounded batches, retry classes and audit evidence.

---

# 21. Retrieval integration with Spec 229

Spec 233 SHALL request new logical source classes/profiles rather than direct provider access:

```text
PROJECT_MEMORY
PROJECT_KNOWLEDGE
PROJECT_RESEARCH
EXPERIMENT_EVIDENCE
PRODUCT_CAPABILITY
PRODUCT_USE_CASE
CAPABILITY_GAP
KNOWLEDGE_CATALOG
```

Spec 229 remains responsible for provider choice, indexing contracts, ACL-aware retrieval, ranking, lifecycle mutation and retrieval evidence.

---

# 22. Context integration with Spec 230

Spec 230 SHALL extend its Project Context Pack to reference, not duplicate:

```text
livingProjectRef
projectKnowledgePackRef
productCapabilitySnapshotRef
solutionEvidencePackageRef
approvedCapabilityGapRef
privateKnowledgeScopeRef
```

External harness adapters receive only the bounded context required by the development task.

---

# 23. LLM routing integration with Spec 231

Spec 233 may describe task requirements such as:

- long-context synthesis;
- high-reasoning planning;
- private/local-only inference;
- low-cost memory extraction;
- multimodal document analysis;
- verifier model requirement.

Spec 231 remains responsible for actual model/provider/reasoning-budget selection subject to Spec 220 constraints.

---

# 24. Relationship to Spec 222

Spec 222 MAY consume eligible redacted execution/outcome evidence to improve routing or exploration policy.

Spec 222 MUST NOT:

- treat private memory as a cross-user training corpus;
- become the canonical Project Memory Store;
- auto-promote learned product capabilities;
- bypass Spec 233 Product Evolution approval or Spec 224 Final Verify.

---

# 25. Relationship to Spec 212

The **independent Spec 234** SHALL bridge approved semantic needs to the *source-verified* Spec 212 admission/validation/publication interfaces, detect semantic duplicates and coordinate targeted Solution Variant re-evaluation when new capabilities ship. If that runtime interface is not present in the target deployment, the bridge remains disabled and reports a capability gap. Spec 212 baseline code/spec/corpus SHALL NOT be rewritten by this upgrade.

A raw chat request is not automatically a canonical use case.

---

# 26. Relationship to Spec 228

Product-improvement signals may originate from Feedback/Issue intake but must be classified:

```text
BUG / INCIDENT -> Spec 228 canonical maintenance flow
PRODUCT_NEED / CAPABILITY_GAP -> Spec 233 product-evolution flow
MIXED -> linked records with explicit ownership
```

No issue ticket should become a capability-development project merely because an LLM labels it an improvement.

---

# 27. Compatibility with implemented Feature 196

Feature 196 is part of the implemented <=213 baseline and SHALL NOT be retroactively rewritten.

Spec 226 SHALL add adapters/events so existing Chat can:

- associate a conversation with a Living Project;
- emit memory-significant project events;
- request Spec 233 Product Intelligence;
- display Project Memory / Living Project links;
- receive structured next actions;
- preserve old Help/Chat behavior during incremental rollout.

---

# 28. Migration strategy

Implementation SHALL use expand → shadow → validate → promote → compact.

## Phase P233.0 — contracts and observation only

- create schemas/contracts;
- no automatic archival/demotion;
- no user-visible behavioral change;
- instrument current chat/memory/library/index usage.

## Phase P233.1 — Living Project + Project Memory

- project association;
- memory candidate extraction;
- memory UI;
- Library artifacts;
- human correction.

## Phase P233.2 — Knowledge Compiler + adaptive lifecycle shadow scoring

- generate knowledge packs;
- lifecycle scorer produces recommendations only;
- compare retrieval quality/cost before enabling demotion.

## Phase P233.3 — controlled vector demotion/rehydration

- start with low-risk project knowledge;
- preserve Knowledge Catalog;
- certify cold retrieval and rehydration.

## Phase P233.4 — Product Intelligence

- capability resolution;
- verified answer synthesis;
- Use Case linkage;
- clarification loop.

## Phase P233.5 — Capability Gap / Product Evolution

- dedup;
- Admin inbox;
- approved intent queued for the future Spec 235 bridge (writable handoff disabled until actual 224 integration gate);
- post-release closure.

## Phase P233.6 — Living Application / experiment evolution

- branch/experiment lineage;
- compare/integrate/release;
- research provenance adapters.

---

# 29. Implementation ordering with current SmartAIHub baseline

The current implementation baseline has completed specs through 213 and has intentionally jumped to Spec 224 to establish the autonomous development runtime.

Therefore:

```text
1. Continue Spec 224 core implementation to a stable orchestration milestone.
   DO NOT restart or invalidate current 224 work.

2. Implement Spec 233 P0 contracts + Spec 226 bridge delta.

3. Implement Spec 220/229 deltas for private knowledge + adaptive lifecycle.

4. Implement Spec 233 Project Memory / Knowledge Compiler.

5. Implement Spec 230 context-package delta so 224/harnesses can consume it.

6. Add Product Intelligence + Capability Resolution.

7. Implement Spec 234 as a separate additive upgrade around the Spec 212 design/corpus baseline, after verifying its runtime owner; connect Spec 222/228 by their existing adapters.

8. Implement Spec 235 discovery/intent queue alongside ongoing Spec 224, but do not enable writable integration until the existing Spec 224 milestone is independently certified; then activate approved handoff.
```

Spec 233 / 234 / 235 SHALL NOT become prerequisites or retroactive amendments for finishing the already-started Spec 224 orchestration kernel. Spec 235 integration is an independent optional post-milestone bridge.

---

# 30. Observability and metrics

Track at least:

```text
memory_candidates_created
memory_items_confirmed/corrected/superseded
knowledge_artifacts_compiled
hot/warm/cold/source_only counts
vector demotion/promotions
rehydration latency and success
cold knowledge discovery success
retrieval miss after demotion
index/re-embedding cost
SQL archive bytes / R2 archive bytes
capability resolution outcomes
gaps created / deduplicated / resolved
reuse-before-build ratio
use cases unlocked per capability
private-to-platform promotion attempts blocked/approved
harness proposals rejected by capability verification
```

Metrics must preserve tenant/privacy boundaries.

---

# 31. Failure modes

Required fail-safe behavior:

- Vectorize unavailable → canonical files remain accessible; degrade retrieval honestly.
- rehydration delayed → direct known-source access may continue; do not claim index freshness.
- memory consolidation failure → retain source events; retry; do not fabricate memory.
- archive verification failure → do not purge hot SQL body.
- ACL uncertainty → fail closed.
- capability registry stale → return UNKNOWN/PARTIAL, not SUPPORTED.
- harness proposal references nonexistent component → fail verification and return gap/revision request.
- duplicate-gap detector uncertain → create candidate requiring review rather than silently merging unrelated work.
- knowledge-pack conflict with user edit → preserve both versions and require conflict resolution.

---

# 32. Acceptance test matrix

The implementation is not complete until at least the following scenarios pass.

## A. Memory / Living Project

A1. User discusses an idea for months without creating a Mini App; relevant memory resurfaces later.  
A2. User changes their mind; current state reflects the latest decision while history remains traceable.  
A3. User corrects an extracted memory; future answers use the corrected value.  
A4. Memory from Project A cannot appear in Project B without authorization.  
A5. Project memory survives replacement of the LLM/model and reindexing of Vectorize.

## B. Library / lifecycle

B1. Detailed vectors are removed while canonical R2/Library data remains visible.  
B2. Cold knowledge can be discovered through catalog/metadata.  
B3. A selected cold source can be used immediately without full reindex.  
B4. Repeated semantic use promotes/reindexes only the needed subset.  
B5. SQL archival verifies R2 archive integrity before hot body removal.  
B6. Legal/pin/critical policy prevents inappropriate demotion.

## C. Product Intelligence

C1. "Skill creators get revenue in which cases?" produces policy-grounded supported/unsupported/unknown distinctions.  
C2. "How can SmartAIHub instruct Codex and how safe is it?" combines product capability and security policy without inventing implementation.  
C3. "I have this product image; how do I make an unboxing review?" identifies feasible SmartAIHub capabilities and missing inputs.  
C4. "Can my series heroine hold this product?" returns a SmartAIHub-specific path or explicit gap, not generic LLM advice only.

## D. Research / private knowledge

D1. User uploads private research; retrieval is project-scoped.  
D2. Model asks only for high-impact missing information.  
D3. Analysis distinguishes user evidence from model hypothesis.  
D4. External harness receives only explicitly allowed project projections.  
D5. Revoked access prevents future retrieval and forwarding.

## E. Product Evolution

E1. Five paraphrased requests resolve to one canonical need without exposing private text.  
E2. Existing workflow composition prevents unnecessary new capability creation.  
E3. Existing in-progress gap prevents duplicate development.  
E4. Approved gap creates a bounded Spec 224 work package.  
E5. Shipped capability closes the gap and reevaluates relevant Use Cases.  
E6. A new capability changes future Product Intelligence answers from unsupported/partial to supported where evidence permits.

## F. Long-lived application

F1. Stable Mini App continues working while an experiment branch evolves independently.  
F2. New dataset revision can reproduce or invalidate prior experiment results without losing provenance.  
F3. Failed experiment remains retrievable but is not represented as verified current guidance.

---

# 33. Security acceptance gates

Must prove:

- tenant/project ACL enforcement before model exposure;
- no cross-project/cross-tenant vector leakage;
- deletion/revocation propagation;
- prompt-injection treatment for uploaded content;
- least-privilege external harness projection;
- admin Product Evolution queue does not expose private research text;
- archived SQL/R2 data respects retention and deletion requests;
- derived memory/index artifacts are covered by deletion semantics;
- capability verification cannot grant permission or deployment authority.

---

# 34. Cost and capacity gates

Before enabling automatic demotion/rehydration at scale, certify:

- vector storage/query reduction;
- embedding/reindex cost;
- rehydration frequency;
- cold retrieval latency;
- SQL footprint reduction;
- R2 archive growth;
- user-perceived retrieval quality;
- lifecycle thrashing rate.

The optimization objective is total cost plus retrieval quality, not minimum vector count.

---

# 35. Definition of Done

Spec 233 is complete only when SmartAIHub can demonstrate end-to-end that:

1. a user's long-running conversation becomes governed project knowledge;
2. durable memory can live in Library/R2 and be rediscovered without permanent detailed vectors;
3. Product Intelligence can answer what SmartAIHub can actually do with evidence-aware states;
4. private user knowledge can be combined with platform knowledge and model reasoning without violating ACLs;
5. the system can identify what is missing without creating duplicates;
6. a qualified/approved missing capability can be handed to Spec 224;
7. newly shipped capability updates future answers and Use Case readiness;
8. Living Projects and applications can continue evolving over time without losing provenance;
9. the system remains recoverable if Vectorize is rebuilt from canonical sources;
10. no duplicate retrieval, development or durable execution authority has been introduced.

---

# 36. Canonical architecture summary

```text
                           ┌─────────────────────────┐
                           │ User / Team / Research  │
                           └────────────┬────────────┘
                                        │
                                 Chat / Uploads
                                        │
                                        ▼
                              Living Project Events
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
             Project Memory Engine                  Private Library/R2
                     │                                     │
                     └──────────────┬──────────────────────┘
                                    ▼
                         Project Knowledge Compiler
                                    │
               ┌────────────────────┼────────────────────┐
               ▼                    ▼                    ▼
         PostgreSQL              Library/R2          Spec 229
      hot state/catalog       durable knowledge   adaptive retrieval
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    ▼
                          Product Intelligence
                    Platform + User + Model Knowledge
                                    │
                                    ▼
                          Capability Resolution
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
              existing solution              real capability gap
                     │                             │
                     ▼                             ▼
          Workflow/Mini App/Answer        Product Evolution Queue
                                                   │
                                          approval / governance
                                                   │
                                                   ▼
                                                Spec 224
                                                   │
                                     Codex/Claude/Antigravity/Hermes
                                                   │
                                                   ▼
                                           Verify / Publish
                                                   │
                                                   └───► Capability + Knowledge update
```

---

# 37. Numbering and repository safety

A Library scan performed while authoring this pack did not reveal an existing Spec 233 file. This is not proof that the live Git repository/branch/PR registry has not allocated 233.

Before repository commit:

1. check canonical spec registry on the target branch;
2. check open PRs/worktrees for `233-*` allocation;
3. if collision exists, STOP and renumber this pack without overwriting either spec;
4. preserve cross-spec amendment content and references during renumbering.

---

# 38. Final implementation rule

> SmartAIHub should not attempt to remember everything in active memory forever. It should know what exists, preserve authoritative sources, distill important project knowledge, retrieve the right subset at the right time, reconstruct semantic indexes when needed, and continuously convert real user needs into verified reusable capability without duplicating what already exists.


---

# Revision 2 — Implemented Baseline Protection and Standalone Upgrade Topology

**Date:** 2026-09-23. **Precedence:** This section and corrected R2 passages supersede any R1 wording that appeared to require changing Spec 212 or Spec 224 in-place. No old R21/R20 sidecar may be committed as an amendment to those frozen baselines.

## R2.1 Baseline-specific ownership

| Baseline | Actual user-provided state | Required behavior |
|---|---|---|
| Spec 212 | Design/corpus baseline; runtime owner unverified in this checkout | Preserve any verified catalog, IDs, APIs, DB, certified variants and corpus lineage. Implement new demand capabilities ONLY in independent Spec 234 after runtime discovery. |
| Spec 224 | Halfway through implementation | Continue original plan/milestones/Final Verify. Spec 235 is separately planned integration and cannot add acceptance requirements to current 224 run. |
| Specs <=213 / Feature 196 | Historical design boundary plus source-verified Feature 196 surfaces | Use existing Spec 226 compatibility adapter where verified; no retrospective edits. |
| Spec 229 / 230 | Future/parallel amended retrieval and engineering context | Preserve exclusive authority boundaries and introduce new functionality additively. |

## R2.2 Separate state machines

Spec 233 owns private/project Need/Gap/Proposal status and consent. Spec 234 owns eligibility-aware Use Case candidate translation but NOT the catalog's canonical IDs, published variants or benchmark grades. Spec 235 owns only approved, versioned intent queues, compatibility preflight and handoff receipts; it does NOT own DevelopmentRun, `worker_jobs`/leases, approvals, Final Verify or deployment. The current 224 implementation SHALL not see P235 as a prerequisite.

## R2.3 Readiness rules

P233.0–P233.4 and Spec 234's read-only matching MAY progress while 224 continues if resources permit. Spec 235 P235.0–P235.1 MAY inventory the actual ingress and queue scoped intents. Writable P235.2+ MUST remain blocked until a certified supported ingress/approval/idempotency profile actually exists in the deployed 224 implementation. An absent feature is `NOT_READY`, not implied integration success.

## R2.4 Completion/availability distinction

`Spec224 COMPLETED` is evidence only for its authorized development lifecycle. After a real 235 completion receipt, the domain release owner must verify deployment, trust/certification, entitlements and availability before 233 can claim the new capability is supported. Spec 234 may then reevaluate ONLY impacted Use Cases.

## R2.5 Superseded preliminary files

Do not commit `spec-212-r21-living-use-case-demand-alignment.md` or `spec-224-r20-product-evolution-handoff-alignment.md` from the preliminary pack. Their intent has been migrated and expanded in independent Specs **234** and **235**, respectively. They are excluded from this corrected pack to avoid ambiguous baselines.

## R2.6 Integration tests

- Spec 212 baseline and Spec 224 current code/spec files remain byte-for-byte unchanged by this pack.
- Disabled 234/235 adapters do not affect existing 212 search/marketplace or 224 in-flight development.
- 234 candidate promotion uses existing 212 publication authority.
- 235 cannot dispatch a development run without actual ingress certification and approved least-privilege context.
- All 233 promises about shipped capabilities require actual release/availability proof rather than LLM plans or mere Final Verify.

## R2.7 Numbering gate

Spec IDs 233, 234 and 235 are proposal reservations, not proof of allocation in Git. Verify live registry, default branch and open PR/worktrees before creating canonical repository paths; STOP on collision, renumber cross-references and never overwrite.

---

# Revision 2a — Dependency and Exchange-Contract Errata for Specs 234/235

**Date:** 2026-09-24. **Scope:** Narrow compatibility correction discovered in the independent ten-pass audits of Spec 234 R2 and Spec 235 R2. R2a does not change the Spec 212 design/corpus baseline, in-progress Spec 224, or the source-of-truth role of 220/229/230. Prior R2 sections remain applicable except where explicitly clarified here.

## R2a.1 Acyclic and independently deliverable contracts

The original R2 `canonical_dependencies` metadata listed Specs 234 and 235 while both depend on 233: this is an **incorrect build-time dependency cycle**. 234/235 are downstream *optional integrations*, not prerequisites for Spec 233 P0–P4 or for its private Project/Knowledge Memory. Feature 196 ingress uses existing Spec 226 bridge; authorization uses 220 or verified deployed equivalent; retrieval uses 229 when that slice is enabled; engineering context uses 230 when a permitted harness is selected. An unimplemented 234 blocks only eligible catalog bridge actions, and an unready 235 blocks only automated 224 handoff; 233 still permits project-private plans, answers and manual owner review. Existing Spec 224 implementation and Final Verify are unchanged.

## R2a.2 Stable `SAH-EVOLUTION-1` domain event boundary

Spec 233 publishes only eligible/declassified `NEED_ELIGIBLE` and `NEED_WITHDRAWN` projections for 234, and separately owner/admin-authorized `PROPOSAL_APPROVED` and `PROPOSAL_REVOKED` intents for 235. Each event carries `schemaVersion=1.0`, authenticated publisher, event ID, source aggregate/revision, tenant/project/scope, policy version, ACL epoch, eligibility proof when required, immutable payload digest, causal predecessor, idempotency key and retention class. Delivery uses the existing transactional outbox/`worker_jobs` with independent consumer inbox dedup, replay fencing and schema compatibility. An event carries only a limited reference where source is private. 234/235 NEVER receive blanket permission to mine raw chats or access user Library contents. Late/duplicate/reordered events SHALL not create duplicate catalog identities, developer jobs, public demand stats or capability claims.

## R2a.3 Canonical knowledge and indexing fences

PostgreSQL is the authoritative state/ACL/manifests store; R2/Library holds authorized durable knowledge; Spec 229 is the sole search projection authority. Archived or deliberately evicted objects SHALL be outside any connected AI Search R2 source include path or be covered by enforceable exclusion rules before declaring eviction successful. Connected AI Search runs scheduled source sync and can reindex retained R2 objects; provider-specific sync and delete verification are mandatory. For direct Vectorize, asynchronous upsert/delete mutation completion and new-snapshot lookup are separately verified; ACL/consent tombstones exclude stale results immediately at the Retrieval Broker. Rehydration after renewed user interest uses approved current source revision/ACL, cost budget and bounded asynchronous `worker_jobs`; direct source read remains available if no vector is needed.

## R2a.4 Promotion/release status and ownership

Spec 233 private gap state distinguishes discovered/planned/approved from `DEV_VERIFIED` and actual `AVAILABLE_FOR_PRINCIPAL`. Spec 235 may report 224 Final Verify only as a development fact; the proper release owner attests deployment, health, entitlement, certification and policy before registry availability. Only that attestation may cause Spec 234 impacted-Use-Case review and selective Spec 229 projection refresh. A rollback/revocation can reopen a gap. Spec 212 canonical admission remains solely inside 212; Spec 224 canonical DevelopmentRun stays solely inside 224. Product approval cannot silently grant core code, data-export or deployment permission.

## R2a.5 Adoption and verification

This erratum is a documentation-level repair, not proof that the actual repository, registry, migrations or deployed API are identical to these documents. Release gates require: acyclic build DAG; original Spec 212 and 224 baseline byte-for-byte unchanged by this pack; 234 disabled leaves 212 operational; 235 disabled leaves 224 in-flight work untouched; no raw private project data reaches Admin/Harness without a current scoped authorization; provider auto-sync does not recreate evicted indexes; late 224 acceptance is not duplicated; and no `SUPPORTED` claim follows merely from a proposed Skill, PR or passing development test. Confirm provisional IDs 233–235 with the live default branch, registry, active worktrees and PRs before integration.
