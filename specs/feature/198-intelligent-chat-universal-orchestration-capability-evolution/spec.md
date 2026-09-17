# Feature 198 — SmartAIHub Intelligent Chat, Universal Orchestration & Capability Evolution

**Spec ID:** 198  
**Proposed path:** `specs/feature/198-intelligent-chat-universal-orchestration-capability-evolution/spec.md`  
**Status:** Ready for implementation planning  
**Revision:** v5 — Fifth gap-review hardening: contract compatibility, event semantics, resource lifecycle, evaluation hygiene, deprecation, mixed-version rollout, i18n/a11y, governance, telemetry, retrieval quality and large-result handling  
**Primary surfaces:** Existing SmartAIHub Chat + Universal AI Assistant Launcher/Side Panel + retained Help Center  
**Primary backend:** SmartAIHub Web/Python Backend  
**Key runtimes:** LangGraph, OpenAI Agents SDK (Python), existing `worker_jobs`, MCP Host/Client, SmartAIHub Retrieval/RAG stack  
**Related specs:** Feature 195 Unified Async Job Control Plane; Feature 196 Goal Orchestration; Feature 197 Runner Adaptive Execution Fabric; Feature 194 Vectorize/pgvector/Chroma retirement and cutover  
**Last updated:** 2026-09-17

**Current codebase implementation status:** Partial; this specification defines the target Chat/evolution contract and does not imply that all target persistence, broker or Runner integrations already exist.

---

## 1. Executive Summary

Feature 198 upgrades the existing SmartAIHub Chat from a mostly LLM-driven conversation surface into a **Universal Intelligent Control Surface** for the whole SmartAIHub platform.

The system must be able to:

1. Understand simple and complex user requests without relying on a single intent classifier.
2. Query authoritative SmartAIHub operational state such as `worker_jobs`, active runners, processes, generations, and project state.
3. Search Library, Knowledge Base, conversation memory, media semantics, Context Packs, and other RAG sources through a unified retrieval contract.
4. Discover and use existing Skills, Agents, Flows, MCP servers/tools, internal APIs, Runner capabilities, and learned routes without loading all schemas into the model context.
5. Escalate ambiguous or complex tasks to a cognitive reasoning layer using OpenAI Agents SDK.
6. Allow the cognitive layer to return structured requests back to LangGraph when it needs evidence, capabilities, user input, approval, long-running execution, or external research.
7. Compose existing capabilities into temporary workflows when no single capability is sufficient.
8. Create **ephemeral helpers**, temporary subgraphs, evaluators, adapters, or specialist agents when required to complete a task, while keeping them sandboxed and governed.
9. Record every important execution route as an auditable trajectory.
10. Evaluate one or more candidate routes, compare results, ask the user to choose when evidence is insufficient, and record that choice as feedback.
11. Convert repeated successful trajectories into learned routes, saved LangGraph flows, reusable helpers, or versioned Skills.
12. Improve existing Skills/Flows instead of creating duplicates when historical evidence suggests an upgrade.
13. Provide complete UI/UX for Connections, Capabilities, Flows, Traces, Evaluations, Learning, Skill/Flow improvement, historical replay, and canary rollout.
14. Provide a **Universal AI Assistant Launcher** available from every SmartAIHub surface, replacing the fragmented Help/Feedback entry experience while reusing the same intelligent runtime as full Chat.
15. Understand the current page through a permission-filtered **Page Context Envelope** so short references such as “ตรงนี้”, “งานตัวบน”, or “ปุ่มนี้” can be resolved without sending the entire DOM or source code to the model.
16. Ingest the existing EN/TH Help corpus into the unified Retrieval Broker as an authoritative `HELP` source for product usage, UI guidance, onboarding, and expected behavior.
17. Unify Help assistance, troubleshooting, and Feedback/Ticket creation at the interaction layer while preserving the existing Help Center and Support Ticket backends as distinct sources/workflows.
18. Keep `worker_jobs` as the source of truth for durable execution under the Feature 195 contract, and Feature 194 provider abstractions as the source of truth for vector backend migration.

The core design principle is:

> **Known logic is controlled by code/LangGraph. Unknown or ambiguous reasoning is delegated to the cognitive layer. Facts are retrieved from authoritative sources. Long-running work is executed by `worker_jobs`. Every route is traceable, evaluable, and capable of evolving into a more reusable capability.**

---

## 2. Problem Statement

The current SmartAIHub Chat is not sufficiently aware of the platform itself. It can answer general LLM questions and some explicitly wired functions, but it cannot reliably answer or execute basic platform-level requests such as:

- “มีงานค้างใน worker_job อีกกี่งาน?”
- “มี process อะไรยังทำอยู่บ้าง?”
- “ขอรายละเอียดวิดีโอที่เพิ่ง generate ไปย้อนหลัง 10 รายการ”
- “ค้นหาวิดีโอที่เป็นฉากร้านกาแฟ”
- “มี Skill ทำ Storyboard ไหม?”
- “เอาคลิปร้านกาแฟเมื่อคืนมาทำเป็นโฆษณา 30 วิ”
- “ถ้าไม่มีเครื่องมือทำตรงนี้ ให้หาวิธีสร้างตัวช่วยระหว่างทาง”
- “ทำไมงานครั้งก่อนผิด?”
- “ลอง 2 วิธีแล้วเปรียบเทียบว่าทางไหนดีกว่า”
- “ถ้างานนี้เกิดบ่อย ให้สร้าง Skill หรือ Flow ไว้ใช้ครั้งต่อไป”

The root causes are not only “missing intent routing”. They include:

- fragmented RAG/search paths,
- incomplete capability indexing,
- lack of a single capability registry,
- insufficient source-of-truth routing,
- no universal orchestration state,
- no structured return path from cognitive agents to deterministic orchestration,
- no first-class MCP connection/catalog UX,
- no end-to-end trajectory/evaluation store,
- no capability evolution lifecycle,
- Help documentation is a separate Markdown/contextual-help subsystem instead of a first-class Retrieval Broker source,
- contextual page knowledge is not standardized as a compact permission-filtered contract for Chat,
- Help, AI assistance, and Feedback currently present separate entry experiences even though user questions often cross all three,
- no UI to inspect, compare, debug, improve, or promote routes/skills/flows.

---

## 3. Existing-System Baseline

Feature 198 MUST reuse and integrate the current systems rather than replacing them blindly.

### 3.1 Existing RAG/Knowledge Systems

Current repository state includes multiple RAG paths:

| Area | Current capability | Status |
|---|---|---|
| Library / Knowledge Base | upload, Markdown edit, metadata, versioning, permissions, folders, soft delete | High |
| Ingestion | text extraction, chunking, embeddings, OCR/vision/transcription, async index jobs, retry/backoff | High in code |
| Library Search | keyword + vector search, tenant/ACL/filtering, score combination | Usable |
| Classic RAG Engine | BM25 + vector + RRF + reranker + query strategy + citation/guardrail | Framework/test complete |
| Chat Memory RAG | `message_chunks` + scoped memories on PostgreSQL vector 1536D | Separate but usable |
| Media RAG | text-to-image/media search, image description, partial video metadata/segment support | Partial |
| Context Pack / Knowledge Vault | saved views, context packs, notes/relations, review, telemetry, snapshot | Substantial |
| Provider abstraction | ChromaDB, pgvector, Cloudflare Vectorize + resolver/contract | Exists |
| Production cutover | registry/backfill/readiness/rollback design | Incomplete |

### 3.2 Vector Provider Baseline

- Active default: `pgvector`.
- Cloudflare Vectorize: prepared target with adapter/indexing/search contract.
- Chroma/legacy vector stores remain for compatibility/migration.
- Feature 194 governs migration/cutover.
- `rag_query` still has a scalability gap because it may load up to 10,000 chunks and compute embedding/vector operations in request memory rather than using persistent vector retrieval directly.

### 3.3 Existing Job Control Baseline

The current implementation baseline (Feature 186 code paths) defines/extends:

- `worker_jobs`
- `worker_job_events`
- lease
- heartbeat
- retry/idempotency
- outbox
- watchdog
- progress
- adapters for BullMQ/Celery/Celery Beat
- migration path toward Cloudflare Queues/Workflows/Containers

Feature 198 MUST NOT create another durable job state machine that conflicts with `worker_jobs`. Feature 195 is the target authoritative execution contract; Feature 186 is the current implementation baseline during migration.

### 3.4 Existing Help / Contextual Documentation Baseline

The existing Help subsystem MUST be reused and upgraded rather than replaced by a second documentation stack. Repository findings supplied for this feature establish the following baseline:

- Help Markdown sources:
  - `apps/web/docs/help/en` — currently 84 English topics,
  - `apps/web/docs/help/th` — currently 84 Thai topics,
  - `apps/web/docs/help/_manifest.json`.
- Markdown frontmatter includes fields such as `title`, `description`, `icon`, `section`, `pages`, and `tags`.
- `helpContentService.ts` parses/renders Help content and currently applies a short cache (reported as 5 minutes).
- Full Help Center surfaces exist at `/help` and `/help/:slug`, with EN/TH support, topic relations, and knowledge-graph style navigation.
- `HelpButton` / `HelpPanel` provide contextual side-panel Help on feature pages, including search, current-page topic suggestions, article opening, width controls, and related-topic graph behavior.
- Existing Chat Help injection uses `helpContextInjector.ts`, which identifies product-usage style questions, selects up to several relevant Help articles, and injects Help content into model context. This MUST evolve into a Retrieval Broker adapter rather than remain a separate retrieval silo.
- Existing Help tRPC surface includes `help.getManifest`, `help.getTopic`, `help.getSearchIndex`, `help.getContextualTopics`, and `help.captureScreenshot` with different procedure permissions. Exact current authorization MUST be re-audited before implementation.
- Admin screenshot support exists in code conceptually, but the current repository audit verified that the Python `help_screenshot.py` router is not included in `python-backend/app/main.py`; runtime behavior MUST therefore remain **unverified/disabled** until it is explicitly wired and an end-to-end audit passes.
- Help is currently separate from the Feedback/Support Ticket system. Feature 198 unifies their **user entry and diagnostic continuity**, not their canonical storage or lifecycle ownership.

Help documentation is considered **authoritative product knowledge**, not a substitute for live operational state. It is especially authoritative for:

- feature explanations,
- usage instructions,
- UI guidance,
- onboarding,
- expected documented behavior.

AI access to application source code is **not** required for end-user Help and MUST NOT be implicitly granted by this feature.

---

## 4. Goals

### G1 — Universal Intelligent Chat

The existing Chat page becomes the natural-language control surface for SmartAIHub.

### G2 — Source-Aware Intelligence

The system must distinguish between:

- general model knowledge,
- SmartAIHub operational data,
- Library/Knowledge content,
- user/project context,
- capabilities,
- connected MCP data,
- current external information requiring Web Search.

### G3 — Low-Context Capability Discovery

The platform may have hundreds or thousands of Skills/MCP tools/Flows, but the model must only hydrate the small subset needed for the current task.

### G4 — Controlled Cognitive Escalation

Do not use expensive LLM reasoning at every routing step. Use LangGraph/code for known deterministic decisions and Agents SDK when interpretation, composition, ambiguity resolution, multi-tool reasoning, or synthesis is genuinely needed.

### G5 — Dynamic Capability Expansion

The system should not stop because no exact Skill exists. It may compose capabilities, create temporary helpers/subgraphs/evaluators/adapters, and later promote successful patterns into reusable capabilities.

### G6 — Full Traceability

Every important route, decision artifact, evidence source, capability version, job, result, evaluation, and user selection must be inspectable.

### G7 — Capability Evolution

Successful and failed outcomes must drive:

- learned routes,
- Flow improvements,
- Skill improvements,
- new Skill/Flow recommendations,
- deprecation recommendations,
- evaluation suites and replay benchmarks.

### G8 — UI/UX Completeness

No backend-only feature is considered complete. Users and administrators need UI for connection, discovery, execution, status, trace inspection, comparison, improvement, replay, and rollout.

### G9 — Universal Contextual Assistant

Provide one lightweight Assistant launcher from every major SmartAIHub page. The launcher uses the same orchestration runtime as full Chat and can answer product Help questions, operational questions, content/RAG questions, execute actions, and transition a conversation into troubleshooting/Feedback without requiring the user to restate context.

### G10 — Help as Unified RAG Source

Index and retrieve the existing Help corpus through the unified Retrieval Broker with page/locale/topic metadata, hybrid search, citations/provenance, incremental re-indexing, and documentation-drift detection.

### G11 — Context Without Source-Code Exposure

Resolve current-page references using structured Page Context and explicit Page Capabilities. Do not rely on source-code access or raw full-page DOM ingestion for normal product assistance.

---

## 5. Non-Goals

Feature 198 does NOT:

1. Replace `worker_jobs` with LangGraph.
2. Replace Feature 194 vector provider migration.
3. Replace all existing RAG pipelines with a new monolithic RAG engine.
4. Force every dynamic trajectory to become a Skill.
5. Allow AI-generated code to execute unsandboxed on SmartAIHub backend hosts.
6. Allow AI to silently change production Skills, Flows, permissions, database schema, or Core source code.
7. Expose hidden model chain-of-thought to users or operators.
8. Require a custom UI for every MCP or Skill.
9. Require all tasks to use OpenAI; OpenAI Agents SDK is the default cognitive adapter, but platform contracts must remain provider-independent where practical.
10. Grant end-user Assistant access to SmartAIHub source code merely to answer product-usage questions.
11. Remove `/help` or `/help/:slug`; the full Help Center remains a first-class documentation surface and canonical human-readable source.
12. Make WebMCP a launch-blocking dependency. WebMCP support is a future adapter/progressive enhancement over SmartAIHub-owned Page Context and Page Capability contracts.
13. Send the entire raw DOM, hidden page state, or screenshots to the LLM on every turn.
14. Merge Support Ticket/Feedback persistence into Help documents; the interaction entry point may unify, but source/workflow ownership remains separate.

---

## 6. Design Principles

1. **Search before asking.**
2. **Evidence before claim.**
3. **Source of truth before model memory.**
4. **Known logic before LLM reasoning.**
5. **Discover broadly, hydrate narrowly.**
6. **Structured control messages, not prose between orchestration layers.**
7. **`worker_jobs` owns durable execution.**
8. **LangGraph state is working orchestration state, not platform truth.**
9. **Memory stores preferences/context, not ephemeral system state.**
10. **Every action must be traceable.**
11. **Every learned capability must be versioned and evaluable.**
12. **Dynamic self-extension is allowed; uncontrolled self-modification is not.**
13. **Progressive disclosure in UX.**
14. **Normal users see outcomes; developers/admins can inspect internals.**
15. **Production changes require evidence, replay/canary, and approval.**
16. **One assistant entry point, multiple authoritative sources.**
17. **Page context before screenshot; structured context before DOM scraping.**
18. **Help defines documented/expected product behavior; live brokers define actual current state.**
19. **The Assistant must never imply source-code visibility it does not have.**
20. **Feedback should inherit relevant context/trace automatically instead of making the user explain the same problem twice.**

---

## 7. Target Architecture

```text
                    SmartAIHub Interaction Surfaces
        ┌──────────────────┬───────────────────────┐
        ▼                  ▼                       ▼
    Full Chat      Universal AI Assistant      Help Center
        │                  │                       │
        └──────────┬───────┘                       │
                   ▼                               │
        Page Context / Interaction Gateway         │
                   │                               │
                   ▼                               │
         LangGraph Orchestration                   │
            / Decision Plane                       │
                   │                               │
      ┌────────────┼────────────────┐              │
      ▼            ▼                ▼              │
 Retrieval      Operational      Capability        │
  Broker          Broker           Broker          │
      │            │                │              │
 HELP ◄────────────┼────────────────┼──────────────┘
 Library/KB       worker_jobs      Skills/Flows
 Memory/Media     events/runners   MCP/Agents
 Context Packs    generations      Helpers/Page Tools
      │            │                │
      └────────────┼────────────────┘
                   ▼
          Need cognitive reasoning?
             /                \
           no                  yes
           │                    │
           │                    ▼
           │           OpenAI Agents SDK
           │            Cognitive Plane
           │                    │
           │           ReturnToOrchestrator
           └───────────┬────────┘
                       ▼
                Execution Plan
                       │
                Permission Gate
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       Immediate work       Durable work
                                 │
                            worker_jobs
                      ┌──────────┼──────────┐
                      ▼          ▼          ▼
                   Runner    Worker App   MCP Task
                      └──────────┬──────────┘
                                 ▼
                               Result
                                 │
                  ┌──────────────┼────────────────┐
                  ▼              ▼                ▼
             User/Assistant  Feedback/Ticket  Evaluation/Learning
```

---

## 8. System Planes and Ownership

### 8.1 Interaction Plane

Primary user-facing surfaces:

- existing full SmartAIHub Chat page,
- **Universal AI Assistant Launcher** available globally,
- Assistant Side Panel / responsive mobile-sheet/full-screen surface,
- retained `/help` and `/help/:slug` Help Center,
- Help article viewer rendered inside Assistant when appropriate,
- contextual Page Context providers,
- Feedback/Troubleshooting transition inside the same Assistant conversation,
- approval/clarification forms,
- MCP Apps or generated schema-driven forms where supported.

The full Chat page and the Universal Assistant MUST use the same orchestration, retrieval, capability, permission, tracing, and conversation contracts. The launcher MUST NOT create a second “lite AI backend”.

The Assistant panel is the preferred contextual entry point on product pages; the full Chat remains the richer workspace for long conversations and complex work.

### 8.2 Orchestration / Decision Plane — LangGraph

Owns:

- per-request working state,
- nodes/edges,
- conditional routing,
- deterministic source resolution,
- escalation rules,
- evidence orchestration,
- multi-branch orchestration,
- pause/resume at orchestration boundaries,
- approval routing,
- coordination of async job references.

Does NOT own authoritative job state or user memory.

### 8.3 Cognitive Plane — OpenAI Agents SDK

Owns:

- ambiguous intent interpretation,
- hypothesis generation,
- complex decomposition,
- capability composition,
- short-lived tool loops,
- specialist agents,
- MCP reasoning/tool calls,
- dynamic helper specifications,
- final synthesis.

### 8.4 Evidence & Capability Plane

Owns:

- Retrieval Broker
- Operational Broker
- Capability Registry
- MCP capability normalization
- source provenance
- ACL/tenant filtering
- freshness metadata

### 8.5 Execution Plane

Owns:

- `worker_jobs`
- runners/worker apps
- external MCP tasks
- retries/leases/heartbeats/progress/cancel
- long-running execution

### 8.6 Evaluation & Learning Plane

Owns:

- trajectory storage,
- quality evaluation,
- route comparison,
- explicit/implicit feedback,
- repeated-pattern mining,
- failure analysis,
- Skill/Flow/Route/Helper evolution,
- replay/canary data.

---

## 9. Request Lifecycle

### 9.1 Default Lifecycle

```text
START
  ↓
normalize_request
  ↓
capture_page_context_if_available
  ↓
load_minimal_context
  ↓
resolve_contextual_references
  ↓
fast_request_analysis
  ↓
resolve_primary_source
  ↓
known/simple?
  ├─ yes → deterministic route
  └─ no  → cognitive_orchestrator
                  ↓
          ReturnToOrchestrator
                  ↓
          gather requested evidence
                  ↓
          cognitive_orchestrator
                  ↓
            build execution plan
                  ↓
            permission policy
                  ↓
              execute / queue
                  ↓
               evaluate
                  ↓
          final synthesis / result
                  ↓
                 END
```

### 9.2 Escalation Ladder

Use the lowest-cost reliable level:

1. deterministic rules/SQL/source map,
2. lightweight structured classification,
3. capability/retrieval lookup,
4. cognitive reasoning via Agents SDK,
5. multi-route exploration,
6. user clarification/selection.

Web Search is NOT a generic fallback level. It is a source chosen when the requested information is external/current/public.

---

## 10. LangGraph State Contract

The graph state MUST contain compact references, not full platform datasets.

Suggested logical state:

```python
class ChatOrchestrationState(TypedDict, total=False):
    trace_id: str
    request_id: str
    conversation_id: str
    user_id: str
    tenant_id: str
    project_id: str | None

    # Surface/context binding
    assistant_surface_session_id: str | None
    page_context_snapshot_ref: str | None
    page_context_version: str | None
    page_instance_id: str | None
    context_captured_at: str | None
    context_fingerprint: str | None

    # Reproducibility/version bundle
    graph_version: str
    policy_version: str
    prompt_bundle_version: str | None
    cognitive_adapter_version: str | None
    model_ref: str | None

    user_message: str
    normalized_query: str

    request_class: str
    intent_candidates: list[dict]
    intent_confidence: float
    ambiguity_score: float

    temporal_scope: dict | None
    entity_refs: list[dict]

    selected_source_types: list[str]
    evidence_requirements: list[dict]
    evidence_refs: list[str]

    capability_candidates: list[dict]
    selected_capabilities: list[dict]

    cognitive_round: int
    cognitive_status: str | None

    execution_plan_ref: str | None
    approval_required: bool

    job_refs: list[str]
    waiting_for_jobs: bool

    evaluation_ref: str | None
    final_result_ref: str | None
    response_text: str | None

    warnings: list[dict]
    errors: list[dict]
```

### 10.1 State Constraints

- Do not store all tool schemas.
- Do not store full RAG documents when a reference is sufficient.
- Do not store `worker_jobs.status` as authoritative truth.
- Do not store secrets/tokens.
- Do not store long-term memory in graph state.
- Use compact evidence summaries plus references.
- Page Context MUST be bound to a page/session snapshot and MUST NOT be reused after route/page-instance/entity changes without freshness validation.
- Store version references needed for audit/replay (graph, policy, prompt bundle, cognitive adapter/model, selected capability versions), not mutable live definitions.

---

## 11. Core LangGraph Nodes

Minimum top-level nodes:

1. `normalize_request`
2. `load_minimal_context`
3. `fast_request_analysis`
4. `resolve_information_source`
5. `query_operational_data`
6. `retrieve_evidence`
7. `search_capabilities`
8. `cognitive_orchestrator`
9. `resolve_capability_gap`
10. `build_execution_plan`
11. `permission_gate`
12. `execute_sync`
13. `submit_worker_jobs`
14. `wait_or_resume_jobs`
15. `evaluate_result`
16. `compare_candidate_routes`
17. `request_user_input`
18. `final_synthesis`
19. `persist_trajectory`
20. `learning_signal`

Nodes MAY be split further during implementation, but responsibility must remain clear.

---

## 12. Fast Request Analysis

The fast layer should produce structured values such as:

```json
{
  "request_class": "SYSTEM_QUERY",
  "intent_candidates": [
    {"name": "worker_job_summary", "score": 0.96}
  ],
  "ambiguity_score": 0.08,
  "temporal_scope": null,
  "requires_fresh_data": true,
  "recommended_source": "operational"
}
```

Supported high-level request classes:

- `CHAT_ONLY`
- `SYSTEM_QUERY`
- `RETRIEVAL`
- `CAPABILITY_SEARCH`
- `EXECUTE_ACTION`
- `WEB_REQUIRED`
- `MULTI_STEP`
- `AMBIGUOUS_COMPLEX`
- `PRODUCT_HELP`
- `TROUBLESHOOT`

The classifier is advisory. Low confidence/ambiguity must route to the cognitive layer, not silently guess.

---

## 13. Source Resolver

The Source Resolver MUST encode source policy.

| Information need | Primary source |
|---|---|
| worker/job/process/runner status | Operational Broker |
| installed/available SmartAIHub capabilities | Capability Registry |
| Library files/assets | Retrieval Broker / Library DB |
| project state | Project APIs/DB |
| user/project historical context | Conversation/Memory/Knowledge sources |
| SmartAIHub product usage / UI guidance | Help Retrieval (`HELP`) + Page Context |
| expected documented product behavior | Help Retrieval (`HELP`) |
| current page reference such as “ตรงนี้/งานตัวบน” | Page Context → authoritative broker lookup |
| connected private service | MCP |
| current external news/docs/facts | Web Search |
| general stable knowledge | LLM, unless verification is required |

Rules:

- Internal query failure MUST NOT automatically fall back to Web Search.
- Stale RAG copies MUST NOT override authoritative live data.
- Current external claims should prefer fresh verified sources.
- Source selection must be recorded in trajectory data.
- Product Help SHOULD prefer official Help evidence over model prior knowledge.
- Current operational questions MUST re-read live/authoritative state rather than trust Help text or stale page snapshots.
- Source resolution MUST happen before Web Search fallback.

For SmartAIHub product-use questions, source preference SHOULD be contextual and generally follow:

```text
Authoritative live operational state
    > current permission-filtered Page Context
    > official SmartAIHub Help documentation
    > capability metadata / current product configuration
    > other internal knowledge
    > current external Web sources when genuinely required
    > unverified model prior knowledge
```

`HELP` is authoritative for documented usage/expected behavior, but MUST NOT override live state when answering “what is happening now?”.

---

## 14. Retrieval Broker

### 14.1 Purpose

Provide one unified retrieval contract while retaining existing specialized RAG implementations.

Example interface:

```python
retrieve(
    query: str,
    scopes: list[str],
    tenant_id: str,
    user_id: str,
    project_id: str | None,
    filters: dict,
    modalities: list[str],
    top_k: int,
    freshness: dict | None
) -> RetrievalResult
```

### 14.2 Supported Scopes

- `library`
- `help`
- `knowledge_base`
- `conversation`
- `memory`
- `media`
- `context_pack`
- `knowledge_vault`
- `classic_rag`

### 14.3 Broker Responsibilities

- tenant/ACL enforcement,
- source selection,
- hybrid keyword/vector retrieval,
- reranking where applicable,
- citation/provenance,
- canonical DB resolution,
- deduplication,
- freshness metadata,
- result compaction.

### 14.4 Migration Rule

Feature 198 MUST call the provider abstraction, not hard-code pgvector or Vectorize.

### 14.5 `rag_query` Modernization

Preserve useful logic:

- BM25
- vector scoring
- RRF
- reranker
- citation
- guardrail

But replace “load up to 10,000 chunks into request memory” with persistent candidate retrieval before fusion/reranking.

This modernization can be delivered incrementally and MUST NOT block the first Intelligent Chat MVP.

---

## 15. Media Retrieval Requirements

For video semantic search, target enrichment pipeline:

```text
video
 → technical metadata
 → keyframes
 → scene segmentation
 → vision descriptions
 → ASR transcript
 → OCR
 → objects/environment/actions
 → segment embeddings
 → canonical asset/segment index
```

Required query support:

- “หาวิดีโอฉากร้านกาแฟ”
- “หาช่วงที่เห็นสินค้าชัดที่สุด”
- “คลิปที่มีผู้หญิงพูดหน้ากล้อง”
- “วิดีโอที่สร้างเมื่อคืนด้วย Seedance”
- exact asset + timestamp/segment results where available.

---

## 16. Operational Broker

### 16.1 Purpose

Expose safe, stable, schema-governed access to current system state.

Initial tools:

- `system.status`
- `system.jobs.summary`
- `system.jobs.search`
- `system.jobs.get`
- `system.runners.list`
- `system.runners.status`
- `system.processes.list`
- `system.processes.get`
- `media.generations.recent`
- `media.generations.search`
- `media.generations.get`
- `projects.search`
- `projects.get`

### 16.2 Safety

The LLM MUST NOT receive unrestricted SQL access by default.

Operational tools should:

- accept bounded typed filters,
- enforce tenant scope,
- enforce user permissions,
- limit row counts,
- return compact structured data,
- record freshness timestamp.

---

## 17. Capability Registry

### 17.1 Purpose

Create a single normalized registry for discoverable platform abilities.

Supported capability types:

- Skill
- Agent
- Saved LangGraph Flow
- Learned Route
- Helper
- MCP Server/Tool
- Internal Tool
- Runner Capability
- Workflow
- API Adapter

### 17.2 Minimum Fields

```text
id
tenant_id / visibility
type
provider_id
name
semantic_description
category
tags
keywords
input_types
output_types
requirements
side_effects
execution_target
risk_class
approval_policy
cost_class
latency_class
health
version
origin
trust_level
enabled
success_rate
quality_score
usage_count
created_at
updated_at
```

### 17.3 Origin

- `BUILT_IN`
- `MARKETPLACE`
- `MCP`
- `USER_CREATED`
- `AI_GENERATED`
- `AI_COMPOSED`
- `LEARNED_ROUTE`
- `EPHEMERAL`

### 17.4 Trust Level

- `VERIFIED`
- `TRUSTED`
- `EXPERIMENTAL`
- `UNTRUSTED`

---

## 18. Capability Indexer

Trigger on:

- Skill install/update/enable/disable,
- Flow create/update,
- Agent create/update,
- MCP connect/disconnect/tools changed,
- Runner capability changed,
- Helper promoted,
- Learned Route promoted/deprecated.

Pipeline:

```text
CapabilityChanged
 → normalize metadata
 → build compact semantic projection
 → embedding
 → vector/index provider
 → update registry search projection
```

The registry database remains canonical; vector index is a projection.

---

## 19. Capability Search and Ranking

Capability discovery must be hybrid, not name-only.

Candidate score should consider:

- semantic relevance,
- keyword/BM25 relevance,
- input/output compatibility,
- enabled state,
- tenant availability,
- user permission,
- provider health,
- trust level,
- historical success,
- quality score,
- cost,
- latency,
- recency/version stability.

The cognitive agent should normally receive only the top 3–10 candidates.

---

## 20. Lazy Tool Hydration

Capability metadata states:

```text
COLD
 → INDEXED
 → WARM
 → HOT
```

- **COLD:** known only as registry record.
- **INDEXED:** searchable compact metadata.
- **WARM:** short description and tool names loaded.
- **HOT:** full schema loaded for actual execution.

Full schemas MUST NOT be carried across the whole conversation after they are no longer relevant.

---

## 21. OpenAI Agents SDK Cognitive Layer

### 21.1 Use Cases

Use Agents SDK for:

- ambiguous request interpretation,
- complex decomposition,
- hypothesis generation,
- capability composition,
- short-lived multi-tool execution,
- MCP usage,
- specialist agents,
- gap analysis,
- dynamic helper specification,
- result synthesis.

### 21.2 Default Cognitive Agent

`SmartAIHub Cognitive Orchestrator`

It sees a small set of meta-capabilities, not the entire tool universe.

Example meta-tools:

- `search_capabilities`
- `describe_capability`
- `retrieve_evidence`
- `query_operational_data`
- `search_connected_mcp`
- `request_web_research`
- `request_orchestrator`
- `submit_execution_plan`

---

## 22. Return-To-Orchestrator Protocol

The cognitive layer MUST be able to stop and return control to LangGraph.

### 22.1 Status Enum

- `CONTINUE`
- `NEED_EVIDENCE`
- `NEED_SYSTEM_DATA`
- `NEED_CAPABILITY`
- `NEED_EXTERNAL_RESEARCH`
- `NEED_DYNAMIC_WORKFLOW`
- `NEED_HELPER`
- `NEED_USER_INPUT`
- `NEED_APPROVAL`
- `READY_TO_EXECUTE`
- `WAIT_FOR_JOBS`
- `READY_TO_SYNTHESIZE`
- `FAILED`

### 22.2 Structured Result

```python
class CognitiveResult(BaseModel):
    status: CognitiveStatus
    interpreted_goal: str
    confidence: float
    unresolved: list[str]
    requirements: list[Requirement]
    capability_requests: list[CapabilityRequest]
    execution_plan: ExecutionPlan | None
    warnings: list[str]
    resumable_context: dict
```

### 22.3 Rule

Do not pass free-form “please ask LangGraph to...” text and then ask another model to interpret it.

LangGraph must route directly from structured status/data.

---

## 23. Search-Before-Clarify Policy

When ambiguity may be resolved safely from available data:

1. search authoritative sources first,
2. resolve likely entity,
3. continue if confidence is sufficient,
4. otherwise show candidates and ask the user.

Example:

“เอาวิดีโอร้านกาแฟอันล่าสุดมาแก้”

The system should search recent cafe videos before asking “หมายถึงไฟล์ไหน?”

---

## 24. Capability Gap Resolver

When no exact capability exists:

```text
Exact capability?
  ├─ yes → use
  └─ no
       ↓
Composable from existing capabilities?
  ├─ yes → dynamic composition
  └─ no
       ↓
Can a safe temporary helper close the gap?
  ├─ yes → helper builder
  └─ no
       ↓
Can external MCP/API solve it?
  ├─ yes → discover/connect/request approval
  └─ no
       ↓
Need new external knowledge?
  ├─ yes → web research
  └─ no
       ↓
Ask user / explain limitation
```

---

## 25. Dynamic Capability Composition

The cognitive layer may produce a temporary execution graph using existing capabilities.

Example:

```text
search cafe videos
 → scene detection
 → extract keyframes
 → product detection
 → prominence scoring
 → segment selection
 → ffmpeg cut
```

The resulting composition must have:

- graph definition,
- input/output contract,
- capability versions,
- policy requirements,
- trace ID,
- evaluation hooks.

---

## 26. Ephemeral Helper Builder

### 26.1 Supported Helper Types

- Python
- JavaScript/TypeScript
- SQL template
- FFmpeg expression/plan
- JSON/JQ transform
- regex
- mapping/normalizer
- prompt-based classifier
- scoring function
- HTTP adapter
- evaluator

### 26.2 Mandatory Manifest

```yaml
helper_id: eph_xxx
purpose: ...
inputs: [...]
outputs: [...]
runtime: python
permissions:
  network: false
  filesystem: temp_only
  database: false
resource_limits:
  cpu_seconds: 20
  memory_mb: 512
lifetime: task
origin_trace_id: trace_xxx
trust_level: experimental
```

### 26.3 Safety

AI-generated helpers MUST execute in sandboxed runtime with:

- CPU/memory/time limits,
- network deny by default,
- no raw host filesystem,
- no production DB credentials,
- no shell escape,
- static validation,
- test fixtures where possible,
- complete trace.

Never execute generated code via unrestricted backend `exec()`.

### 26.4 Reproducible Helper Artifact

Every executed generated helper MUST record enough immutable build/runtime provenance to diagnose or replay it safely:

- source/content hash,
- runtime/container image or sandbox runtime version,
- dependency lock or exact dependency set,
- toolchain/interpreter version,
- declared network egress domains when enabled,
- input/output schema versions,
- test/fixture references where available,
- expiry/cleanup policy.

Runtime package installation from arbitrary public registries is denied by default. Promotion from ephemeral helper to reusable Helper/Skill requires a reproducible governed build and security scan rather than reusing an unpinned temporary environment.

---

## 27. Dynamic Specialist Agents

The system MAY create an ephemeral specialist agent configuration when a unique role is useful, e.g. “continuity inspector”.

An ephemeral agent must define:

- role/purpose,
- available tools,
- input/output type,
- maximum rounds,
- allowed data,
- trace linkage,
- lifetime.

It is not automatically promoted to a permanent Agent.

---

## 28. MCP Host / Universal Connections

### 28.1 Supported Connection Sources

- SmartAIHub curated catalog
- official MCP Registry/upstream source
- private tenant catalog
- custom MCP server URL

### 28.2 Connect Lifecycle

```text
discover
 → authentication
 → capability negotiation
 → tools/resources/prompts/apps discovery
 → risk classification
 → metadata normalization
 → capability indexing
 → connection test
 → permission review
 → enable
```

### 28.3 Connection Health

Store:

- connected/disconnected,
- auth expiry,
- last discovery,
- last successful call,
- error state,
- supported protocol/features,
- tool list version/hash.

### 28.4 Context Rule

Register/index MCP metadata, but do not keep every MCP tool schema loaded in model context.

---

## 29. MCP Permission Model

Normalize actions into platform risk classes:

- `READ`
- `WRITE`
- `DESTRUCTIVE`
- `FINANCIAL`
- `EXTERNAL_COMMUNICATION`
- `PHYSICAL_WORLD`
- `SECURITY_SENSITIVE`

User/admin policies:

- auto allow,
- ask first time,
- ask every time,
- deny.

MCP annotations may inform classification but are not authoritative by themselves.

---

## 30. MCP Apps / Generated UI

When an MCP supports rich UI, SmartAIHub should provide a safe renderer surface for supported MCP App content.

Fallback order:

1. Custom SmartAIHub UI if implemented.
2. MCP App UI if supported/trusted.
3. Auto-generated form from schema.
4. Universal Chat-only interaction.

This avoids requiring a custom UI for every integration.

---

## 31. worker_jobs Integration

### 31.1 Ownership

`worker_jobs` remains authoritative for durable execution.

LangGraph stores only job references.

### 31.2 Long Task Flow

```text
LangGraph execution_plan
 → submit worker_jobs
 → store job IDs in graph state
 → return/stream task card
 → worker executes
 → worker_job_events update progress
 → completion event/resume/poll
 → fetch authoritative result
 → evaluation
```

### 31.3 External MCP Tasks

Where an MCP exposes long-running task handles, map them through an adapter into the unified job view so Chat can display them alongside internal jobs.

---

## 32. Trajectory Store

### 32.1 Purpose

Store how the system actually solved a request.

Not equivalent to:

- Chat history,
- memory,
- logs,
- worker job table.

### 32.2 Event Fields

At minimum:

```text
trace_id
run_id
event_id
parent_event_id
node_name
event_type
timestamp
input_ref
output_ref
decision_artifact_ref
source_refs
capability_id
capability_version
model/provider
model_ref/version
graph_version
policy_version
prompt_bundle_version
cognitive_adapter_version
retrieval_policy_version
evaluator_version
capability_manifest_hash
latency
token_usage
cost
confidence
job_ref
error_ref
evaluation_ref
```

### 32.3 Event Types

- request_received
- route_selected
- evidence_requested
- evidence_received
- capability_search
- capability_selected
- cognitive_run
- helper_generated
- flow_generated
- plan_created
- permission_requested
- job_submitted
- job_progress
- job_completed
- result_evaluated
- user_feedback
- final_response

---

## 33. Decision Artifacts

Do NOT depend on hidden chain-of-thought.

Record explicit structured decision artifacts:

```json
{
  "decision": "select AI Rough Cut v3",
  "candidates": [
    {"id": "skill_a", "score": 0.94},
    {"id": "flow_b", "score": 0.85}
  ],
  "factors": {
    "goal_match": 0.96,
    "input_compatibility": 1.0,
    "historical_success": 0.94,
    "cost": 0.81
  },
  "selected": "skill_a"
}
```

---

## 34. Multi-Route Exploration

For uncertain/high-value tasks, the system MAY generate multiple candidate routes.

Examples:

- transcript-driven cut,
- visual-scene-driven cut,
- multimodal cut.

Controls:

- maximum route candidates,
- route generation budget,
- execution budget,
- early elimination criteria,
- parallel execution limits,
- branch-specific idempotency keys,
- explicit side-effect classification per branch.

Multi-route evaluation MUST NOT duplicate irreversible/external side effects. Write/destructive/financial/external-communication/physical-world routes MUST first use plan-only, simulation, read-only, sandbox, or artifact-generation modes where possible. Only the selected/approved branch may commit the external side effect unless the user explicitly requested multiple real executions.

Not every request should use multiple routes.

---

## 35. Evaluation Framework

### 35.1 Dimensions

Potential dimensions:

- goal alignment,
- factual accuracy,
- evidence quality,
- technical validity,
- output quality,
- domain QC,
- latency,
- cost,
- safety/risk,
- user preference,
- execution success.

### 35.2 Evaluation Inputs

Combine:

- deterministic metrics,
- domain-specific QC,
- artifact validation,
- LLM-as-judge where appropriate,
- user feedback,
- historical outcome signals.

Do not rely on a single LLM judge score for critical selection.

### 35.3 Candidate Selection

If one route clearly dominates under current policy, select it.

If routes are close or reflect different legitimate goals, present a comparison to the user.

### 35.4 Evaluator Governance and Calibration

Evaluation rubrics, judge prompts/models, deterministic metric versions, and aggregation weights MUST be versioned. Critical auto-selection/promotion requires:

- calibration against representative labeled/accepted examples where practical,
- uncertainty/disagreement thresholds,
- explicit handling when deterministic metrics and LLM judge disagree,
- periodic evaluator-drift checks,
- replay or re-scoring when evaluator versions materially change.

A user's route choice is a valuable preference/outcome signal but MUST NOT automatically be treated as universal ground truth.

---

## 36. User Feedback Signals

### 36.1 Explicit

- thumbs up/down,
- score,
- route selection,
- “ผิด/ไม่ตรง”,
- reason tags,
- comments.

### 36.2 Implicit

- download,
- publish,
- accept without edit,
- regenerate,
- retry,
- major manual edit,
- discard/delete.

Implicit signals must be interpreted conservatively and never treated as guaranteed user preference.

---

## 37. Failure Taxonomy

Use normalized categories:

- `UNDERSTANDING_ERROR`
- `SOURCE_SELECTION_ERROR`
- `RETRIEVAL_ERROR`
- `CAPABILITY_SELECTION_ERROR`
- `PLANNING_ERROR`
- `PARAMETER_ERROR`
- `PERMISSION_ERROR`
- `EXECUTION_ERROR`
- `PROVIDER_ERROR`
- `QUALITY_FAILURE`
- `USER_INTENT_MISMATCH`
- `MISSING_CAPABILITY`
- `PAGE_CONTEXT_RESOLUTION_ERROR`
- `HELP_RETRIEVAL_ERROR`
- `HELP_DOCUMENTATION_DRIFT`
- `FEEDBACK_CONTEXT_CAPTURE_ERROR`

Failures may have multiple contributing causes.

---

## 38. Failure Analysis

The Failure Analyzer may inspect:

- original request,
- trajectory,
- evidence sources,
- capability/version,
- errors,
- job events,
- provider responses,
- output artifacts,
- QC,
- user feedback.

Output:

- ranked root-cause hypotheses,
- confidence,
- supporting evidence references,
- recommended remediation,
- candidate Skill/Flow/Helper improvement.

---

## 39. Capability Evolution Manager

### 39.1 Inputs

- successful trajectories,
- failed trajectories,
- repeated dynamic compositions,
- generated helpers,
- user feedback,
- evaluation results,
- cost/latency data.

### 39.2 Actions

- `KEEP_AS_TRAJECTORY`
- `SAVE_AS_ROUTE`
- `SAVE_AS_FLOW`
- `CREATE_HELPER`
- `CREATE_SKILL`
- `IMPROVE_SKILL`
- `IMPROVE_FLOW`
- `MERGE_CAPABILITIES`
- `DEPRECATE_CAPABILITY`
- `NO_ACTION`

### 39.3 Promotion Guidance

| Pattern | Preferred artifact |
|---|---|
| one small deterministic transform | Helper/Internal Tool |
| stable input → output | Skill |
| branching/stateful workflow | Saved LangGraph Flow |
| repeated but still variable pattern | Learned Route |
| one-off path | Trajectory only |
| external integration | MCP/API adapter |

### 39.4 Ownership, Scope, and Update Conflicts

Evolution artifacts MUST declare scope (`personal`, `project/workspace`, `tenant`, or `global`) and owner/maintainer. The Evolution Manager MUST:

- search for equivalent capabilities before creating a new artifact,
- avoid mutating third-party/marketplace capabilities in place unless the current tenant is the authorized maintainer,
- create a fork/overlay/new candidate when direct modification is not permitted,
- use optimistic version checks so simultaneous improvement proposals cannot overwrite each other,
- preserve backward-compatible contracts or declare migration requirements for breaking input/output changes,
- record supersedes/derived-from lineage and rollback target.

---

## 40. Learned Routes

A Learned Route is a reusable planning pattern lighter than a full Flow.

Suggested fields:

```yaml
route_id: route_xxx
intent_family: repurpose_long_video
conditions:
  input_type: video
steps:
  - video.transcribe
  - video.rough_cut
  - subtitle.generate
success_rate: 0.94
sample_count: 1287
quality_score: 8.8
cost_profile: medium
status: proven
```

Capability search should consider proven routes before dynamic exploration where appropriate.

---

## 41. Saved LangGraph Flows

Flows are versioned reusable graph definitions.

Use when:

- branching matters,
- state matters,
- pause/resume matters,
- multiple sources/capabilities are coordinated,
- workflow structure is worth preserving.

A Skill MAY use a LangGraph Flow as implementation:

```yaml
skill:
  id: ai-short-video
implementation:
  type: langgraph
  flow_id: video-short-form-v4
```

This separates **productized capability** from **orchestration implementation**.

---

## 42. Skill Versioning and Improvement

AI MUST NOT mutate a production Skill in place.

Lifecycle:

```text
Production Skill
 → improvement proposal
 → candidate version
 → generated tests
 → historical replay
 → evaluation
 → canary
 → promote or rollback
```

Existing related Skills must be searched before creating a new Skill to avoid duplicate capability proliferation.

---

## 43. Flow Versioning and Improvement

Same principles as Skills.

Example:

```text
flow.video-social-ad
  v4 production
  v5 candidate
```

Changes must record:

- changed nodes/edges,
- rationale,
- evidence traces,
- expected effect,
- replay results,
- canary results.

---

## 44. Historical Replay

Candidate Skill/Flow/Route versions should be testable against historical trajectories.

Metrics:

- success rate,
- output QC,
- factual correctness where measurable,
- cost,
- latency,
- retries,
- user-acceptance proxies.

Historical replay does not replace live canary testing.

---

### 44.1 Replay Modes and Reproducibility

Historical replay MUST distinguish:

1. **Faithful replay** — reuse/pin historical graph/policy/prompt/capability/evaluator versions where still safely available,
2. **Current-stack replay** — run the historical request/evidence fixture through current implementations to compare improvement.

Because LLM/provider outputs can be stochastic or unavailable later, the UI/report MUST label replay mode and reproducibility limitations. Store immutable request/evidence fixture references where policy permits; never claim byte-for-byte reproducibility unless the underlying execution is deterministic and pinned.

## 45. Canary Rollout

Support:

- production/candidate traffic percentage,
- tenant-scoped rollout,
- user cohort rollout,
- auto-stop thresholds,
- rollback.

Example:

```text
Production v3.4 = 90%
Candidate v3.5 = 10%
```

Promotion must be a governed operation.

---

# PART II — UI / UX SPECIFICATION

## 46. UX Principles

1. Keep the existing full Chat as the primary deep-work surface while making the Universal AI Assistant the contextual entry point available across SmartAIHub.
2. Hide infrastructure details from normal users.
3. Expose activity, sources, plans, progress, and results progressively.
4. Never require users to understand MCP, LangGraph, RAG, or Agents SDK to complete normal tasks.
5. Admin/developer mode may reveal trace IDs, nodes, models, capability versions, and raw structured data.
6. Long-running jobs must remain discoverable after leaving the Chat.
7. Failures must offer recovery actions, not just error text.
8. User choices between results must feed evaluation.
9. Universal Assistant uses a single conversation surface for AI, Help, troubleshooting, and transition-to-Feedback; users should not have to classify their own question first.
10. Current-page context is visible and controllable (for example “ใช้บริบทของหน้านี้ ✓”) and must respect permissions.
11. Normal mode shows user-meaningful activity; Developer/Admin mode may reveal infrastructure details.
12. Existing Help Center remains available for structured reading, sharing, bookmarking, and onboarding.

---

## 47. Existing Chat Page — Required Enhancements

Do not replace the existing Chat page.

Add:

- shared session/continuation support with the Universal AI Assistant Launcher,
- page-context and context-source indicators,
- activity/intelligence strip,
- source/capability chips,
- plan card,
- approval card,
- live task card,
- rich search results,
- compare-results card,
- clarification form,
- retry/replan controls,
- trace link for permitted users.

---

## 48. Activity / Intelligence Strip

Normal mode example:

```text
✓ เข้าใจคำขอ
✓ ค้นพบวิดีโอที่เกี่ยวข้อง 4 รายการ
✓ พบเครื่องมือที่เหมาะสม 3 รายการ
● กำลังจัดแผนงาน...
```

Collapsed by default after completion.

Expanded developer mode may show:

- LangGraph node,
- cognitive round,
- retrieval scope,
- capability ID/version,
- job/trace IDs.

---

## 49. Sources & Capabilities Chips

Example:

```text
Used:
[Library Search] [Worker Jobs] [AI Rough Cut v3] [Google Home MCP]
```

Click opens side panel with:

- source/capability type,
- version,
- freshness,
- input/result references,
- execution target,
- status,
- provenance.

---

## 50. Plan Card

Show before significant write/destructive/expensive actions or when the plan itself helps the user understand the task.

Example:

```text
Plan
1. Find cafe videos from last night
2. Analyze quality
3. Select best source
4. Create 30s cut
5. Reframe 9:16
6. Add subtitle
7. Render

Estimated cost: 18 credits

[Run] [Edit Plan] [Cancel]
```

Low-risk read-only tasks may skip explicit confirmation.

---

## 51. Approval Card

Example:

```text
Approval required

Action:
Control smart-home devices

Provider:
Google Home

Affected:
3 lights

[Allow once] [Always allow this action type] [Cancel]
```

Permission decisions must be stored according to tenant/user policy.

---

## 52. Live Task Card

Example:

```text
Video Ad Generation
Running · 68%

✓ Search assets
✓ Select source
✓ Rough cut
● Rendering
○ Upload Library

Runner: SmartAIHub Runner
Job: J-19382

[View details] [Cancel]
```

Progress MUST come from authoritative execution state.

---

## 53. Rich Retrieval Results

For media:

```text
Found 8 videos

[thumbnail] Cafe Review 021
00:04–00:18 matches
"หญิงนั่งอยู่ในร้านกาแฟ..."

[Open] [Use this]

[thumbnail] Coffee Product Ad
00:18–00:31 matches
...
```

For documents:

- title,
- matching excerpt,
- path/folder,
- source,
- timestamp/version,
- open/use actions.

---

## 54. Clarification UX

Follow search-before-clarify.

Example:

```text
พบวิดีโอร้านกาแฟล่าสุด 3 รายการ และยังแยกไม่ได้ว่าคุณหมายถึงอันไหน

[thumbnail A]
[thumbnail B]
[thumbnail C]

[เลือก A] [เลือก B] [เลือก C]
```

Avoid generic questions when concrete candidates are available.

---

## 55. Compare Results Card

Example:

```text
ได้ผลลัพธ์ที่ใกล้เคียงกัน 2 แบบ

A — เน้นเล่าเรื่อง
QC 8.7
Cost 3.2

B — เน้นสินค้า
QC 8.6
Cost 5.0

[Preview A] [Preview B]
[Choose A] [Choose B]
```

The selection becomes feedback.

---

## 56. New Navigation — Connections

Sidebar entry:

`Connections`

Sections:

- Connected
- Recommended
- Needs Attention
- MCP Catalog
- Custom MCP

---

## 57. Connections Page

```text
Connections

[Search integrations...]                    [+ Add MCP]

Recommended
Google Home                 [Connect]
GitHub                      [Connect]
Cloudflare                  [Connect]

Connected
● Home Assistant            Healthy
● GitHub                    Healthy

Needs Attention
⚠ Custom MCP                Auth expired
```

---

## 58. MCP Catalog Page

Filters:

- All
- Smart Home
- Developer
- Productivity
- Data
- Media
- Business
- Custom

Card:

```text
Google Home

Control and inspect compatible devices.

Capabilities: 4
Authentication: OAuth

[Connect]
```

Do not show raw tool schemas by default.

---

## 59. Add Custom MCP Wizard

Step 1 — Server:

- Name
- Server URL
- transport
- auth type
- optional headers/timeout

Step 2 — Test:

- connectivity,
- protocol compatibility,
- authentication.

Step 3 — Discovery:

- tools count,
- resources,
- prompts,
- MCP Apps,
- long-task support.

Step 4 — Permissions:

- read,
- write,
- destructive,
- external communication,
- physical/security-sensitive.

Step 5 — Save/Enable.

---

## 60. MCP Connection Detail

Tabs:

- Overview
- Capabilities
- Permissions
- Health
- Activity
- Advanced

Show:

- auth status,
- last successful call,
- last discovery,
- discovered capabilities,
- errors,
- connection version/hash,
- disconnect/reconnect actions.

---

## 61. New Navigation — Capabilities

Unified capability UI:

```text
Capabilities

All | Skills | Flows | MCP | Agents | Routes | Helpers | Internal
```

Search examples:

- “สร้าง storyboard”
- “ตัดช่วงพูดผิด”
- “ควบคุมไฟในบ้าน”

---

## 62. Capability Detail Page

Example:

```text
AI Rough Cut

Type: Skill
Status: Production
Version: v3.4.1
Trust: Verified

Purpose
...

Input
Video

Output
Edited Video / EDL

Used: 1,827
Success: 94.2%
Average QC: 8.7
Average Cost: 4.1 credits

Implementation:
LangGraph Flow video-ai-rough-cut-v6

[Run]
[View Flow]
[Evaluation]
[Versions]
[Activity]
```

---

## 63. New Navigation — Flows

List:

- name,
- version,
- production/candidate,
- usage,
- success,
- last updated.

Flow detail must visualize graph topology.

---

## 64. Flow Inspector

Example:

```text
[Search Library]
       ↓
[Analyze Video]
       ↓
[Product Visibility]
       ↓
    ◇ Score > .7
     /         \
   yes         no
    ↓           ↓
[Rough Cut] [Agent Review]
     \         /
        [QC]
         ↓
      [Render]
```

Node drawer:

- input/output schema,
- capability,
- version,
- timeout,
- retry,
- error policy,
- permissions,
- recent performance.

---

## 65. Live Flow Run Inspector

Show node states:

- pending,
- running,
- completed,
- failed,
- waiting for approval,
- waiting for user,
- waiting for job.

Tabs:

- Graph
- Timeline
- State
- Inputs/Outputs
- Errors
- Jobs
- Evidence

---

## 66. New Navigation — Traces

Trace list filters:

- date,
- user/tenant,
- request type,
- success/failure,
- capability,
- provider,
- job,
- quality score,
- cost range.

---

## 67. Trace Detail

Views:

1. Summary
2. Timeline
3. Execution Graph
4. Decisions
5. Evidence
6. Capabilities
7. Jobs
8. Costs/Tokens
9. Errors
10. Evaluation
11. Feedback

Must support:

- “Why this route?”
- “Analyze failure”
- “Replay”
- “Create improvement candidate”

---

## 68. “Why?” Decision UI

Show explicit decision artifacts:

```text
Selected: AI Rough Cut v3

Alternatives
Video Edit Flow v2     0.84
Generic FFmpeg Flow    0.68

Factors
Goal match             0.96
Input compatibility    1.00
Historical success     0.94
Cost                   0.81
```

Do not expose hidden chain-of-thought.

---

## 69. Analyze Failure UI

Action: `[Analyze Failure]`

Result:

```text
Likely causes

1. Wrong source video selected       78%
2. Scene threshold too low            17%
3. Provider instability                5%

Recommended actions

[Improve Flow]
[Improve Skill]
[Create Validation Helper]
[Create Regression Test]
[Dismiss]
```

---

## 70. New Navigation — Evaluations

Evaluation page supports:

- route comparison,
- artifact comparison,
- scores by dimension,
- evaluator provenance,
- user selection,
- notes.

---

## 71. Compare Outputs

For video:

- synchronized previews,
- timeline,
- QC dimensions,
- cost,
- latency,
- selection.

For image:

- side-by-side or gallery.

For text:

- diff/side-by-side.

For structured data:

- field comparison.

---

## 72. New Navigation — Learning Center

Dashboard cards:

- repeated workflows detected,
- recurring failure patterns,
- potential new Skills,
- Flow improvement candidates,
- declining capability quality,
- high-cost routes,
- frequently generated helpers.

---

## 73. New Skill Recommendation UI

Example:

```text
Recommended Skill
Social Video from Long Video

Detected from: 147 trajectories

Repeated route:
Transcribe → Semantic Cut → Reframe → Subtitle → QC

Expected:
LLM calls      -64%
Tokens         -71%
Latency        -28%
Cost           -44%

[Review Candidate] [Dismiss]
```

---

## 74. Skill Builder / Candidate UI

Fields:

- name,
- purpose,
- tags,
- inputs,
- outputs,
- risk,
- implementation type,
- base Flow/Route,
- validators,
- tests,
- version.

Implementation types:

- LangGraph Flow
- Composite Capabilities
- Python
- TypeScript
- Prompt
- Agent
- MCP
- Runner

---

## 75. Improve Existing Skill UI

Show:

- current version,
- observed failure clusters,
- suggested changes,
- supporting traces,
- projected metrics,
- generate candidate action.

Never overwrite production directly.

---

## 76. Flow Improvement UI

Show:

- current graph,
- proposed graph diff,
- nodes/edges added/removed/changed,
- supporting evidence,
- projected improvement,
- create candidate version.

---

## 77. Generated Helper Inspector

Display:

- purpose,
- origin trace,
- source/generated spec,
- sandbox permissions,
- test results,
- executions,
- evaluation,
- actions: test/save candidate/discard.

Normal users see only “temporary processing step”; developers/admins can inspect helper details.

---

## 78. Historical Replay UI

Inputs:

- candidate capability/version,
- historical dataset,
- success/failure sample composition,
- evaluation profile.

Output comparison:

```text
                Production    Candidate
Success            91.8%        95.1%
QC                 8.4          8.9
Cost               4.8          4.6
Latency            38s          39s
```

Actions:

- promote to canary,
- revise,
- discard.

---

## 79. Canary / Rollout UI

Show:

- production version,
- candidate version,
- traffic split,
- success/QC/cost/latency,
- error delta,
- stop thresholds.

Actions:

- increase exposure,
- pause,
- promote,
- rollback.

---

## 80. Global Command Palette

Shortcut such as `Ctrl/Cmd + K`.

Examples:

- “มี render job อะไรค้าง?”
- “หา skill storyboard”
- “เปิดวิดีโอล่าสุด”
- “เชื่อมต่อ GitHub MCP”

Uses the same orchestration runtime as Chat.

---

# PART III — DATA / API / SECURITY

## 81. Logical Data Model

Implementation MUST audit existing tables before creating new ones.

Potential entities:

- `capabilities`
- `capability_versions`
- `capability_projections`
- `flows`
- `flow_versions`
- `learned_routes`
- `generated_helpers`
- `mcp_connections`
- `mcp_capabilities`
- `orchestration_runs`
- `trajectory_events`
- `decision_artifacts`
- `evaluation_runs`
- `evaluation_scores`
- `capability_feedback`
- `improvement_candidates`
- `benchmark_runs`
- `rollout_configs`
- `help_document_projections` or equivalent projection metadata (reuse existing vector projection registry where possible)
- `page_context_registry` / page-context configuration (prefer code/config registry if persistence is unnecessary)
- `page_capability_mappings`
- `assistant_surface_sessions` or equivalent cross-surface conversation linkage if not already modeled
- `feedback_context_packages` or equivalent structured attachment to existing Feedback/Ticket records
- `help_drift_candidates` / documentation-improvement candidates where existing improvement models cannot be reused

Reuse/extend existing models when semantically equivalent.

---

## 82. API Surface

Suggested service contracts:

### Orchestration

- `POST /api/chat/orchestrate`
- `GET /api/orchestration/runs/:id`
- `POST /api/orchestration/runs/:id/resume`
- `POST /api/orchestration/runs/:id/cancel`

### Capabilities

- `GET /api/capabilities`
- `GET /api/capabilities/:id`
- `POST /api/capabilities/search`
- `GET /api/capabilities/:id/versions`

### MCP

- `GET /api/connections`
- `POST /api/connections/mcp/test`
- `POST /api/connections/mcp`
- `POST /api/connections/:id/refresh`
- `PATCH /api/connections/:id/permissions`
- `DELETE /api/connections/:id`

### Assistant / Page Context / Help

Suggested contracts (adapt to existing tRPC conventions; do not duplicate current Help router unnecessarily):

- `GET/QUERY assistant.pageContext`
- `POST/MUTATION assistant.ask` or existing Chat orchestration entry point
- `GET/QUERY assistant.contextualSuggestions`
- `POST/MUTATION assistant.reportProblem`
- `GET/QUERY help.search` via Retrieval Broker-backed adapter
- existing `help.getManifest`, `help.getTopic`, `help.getContextualTopics` remain compatible during migration
- `POST/MUTATION help.reindex` — admin/system only if an explicit endpoint is required
- `GET/QUERY help.indexStatus` — admin/developer observability
- `POST/MUTATION pageCapabilities.invoke` for explicitly exposed page actions where not routed through an existing internal capability endpoint

### Traces/Evaluations

- `GET /api/traces`
- `GET /api/traces/:id`
- `POST /api/traces/:id/analyze-failure`
- `GET /api/evaluations`
- `POST /api/evaluations/:id/select`

### Evolution

- `GET /api/learning/opportunities`
- `POST /api/improvements/:id/create-candidate`
- `POST /api/benchmarks`
- `POST /api/rollouts`
- `POST /api/rollouts/:id/promote`
- `POST /api/rollouts/:id/rollback`

Exact endpoint names may adapt to existing conventions.

---

## 83. Streaming / Realtime Events

Chat and inspector UIs require structured events such as:

- orchestration.started
- orchestration.node.started
- orchestration.node.completed
- evidence.search.started
- evidence.search.completed
- capability.selected
- cognitive.started
- cognitive.returned
- approval.required
- job.submitted
- job.progress
- job.completed
- evaluation.completed
- orchestration.completed
- orchestration.failed
- assistant.context.updated
- help.retrieval.completed
- feedback.context_captured
- feedback.created
- help.drift.detected

Prefer existing event transport if available; do not create a duplicate realtime channel without audit.

---

## 84. Authentication / Authorization

Every request must enforce:

- tenant isolation,
- user permissions,
- project/workspace permissions,
- Library ACL,
- connection ownership/sharing policy,
- capability enablement,
- risk/action permission.

No retrieval or MCP discovery should leak capability/data from another tenant.

Additional contextual-assistant requirements:

- client-provided entity/page references are hints and MUST be re-authorized/revalidated server-side before sensitive data access or action,
- Page Context MUST contain only fields/refs permitted for the current user,
- public Help visibility should preserve current product policy unless explicitly changed,
- opening the Assistant on an authenticated page does not elevate permissions,
- Feedback diagnostic attachment is filtered through the same authorization/redaction policy.

---

## 85. Secrets

MCP/API credentials must:

- use the existing secrets mechanism if present,
- never enter LLM context,
- never be stored in trace payloads,
- never be embedded,
- be redacted from errors.

---

## 86. Sandbox Security

Generated helper execution:

- isolated sandbox,
- deny network by default,
- deny host filesystem,
- no environment secrets,
- bounded resources,
- bounded execution time,
- explicit egress allowlist if needed,
- artifact export through governed channel.

---

## 87. Memory Policy

Do not store ephemeral facts such as:

- current job count,
- runner status,
- temporary capability schema,
- current MCP response

as long-term user memory.

Memory candidates may include stable user preferences where policy allows.

Capability metadata belongs to Capability Registry, not Memory.

---

## 88. Context Budget Manager

Maintain explicit budgets for:

- system instructions,
- recent conversation,
- compact Page Context Envelope,
- user/project context,
- Help/other evidence,
- tool schemas,
- tool results,
- optional visual context when escalated.

Page Context Tier A SHOULD be compact and routinely affordable. Tier B data is fetched on demand. Tier C screenshot/vision is exceptional rather than default.

Large tool results should be persisted externally and represented in context as compact summaries + references.

---

## 89. Cognitive Loop Limits

Default configurable limits:

- max cognitive rounds: 3
- max evidence rounds: 2
- max capability discovery rounds: 2
- max user clarification rounds: 1
- max candidate routes: 3
- max parallel expensive route executions: policy-controlled

Add no-progress detection using normalized request/result hashes.

---

## 90. Cost Governance

Track:

- LLM input/output tokens,
- model cost,
- Skill fee,
- MCP/API cost where known,
- Worker/Runner cost,
- evaluation cost.

Planning may reject or ask approval for routes exceeding tenant/user thresholds.

Integrate with existing SmartAIHub credit/revenue infrastructure rather than building a parallel billing system.

---

# PART IV — ERROR HANDLING / RECOVERY

## 91. Error Classes

- retrieval unavailable,
- source unavailable,
- capability unhealthy,
- MCP auth expired,
- permission denied,
- user input required,
- provider rate limit,
- helper validation failed,
- worker unavailable,
- job timeout,
- evaluation inconclusive,
- page context unavailable/stale,
- Help retrieval unavailable/stale,
- Feedback/Ticket creation failed,
- screenshot/visual context unavailable,
- no safe solution.

---

## 92. Recovery Policy

Prefer:

1. retry if idempotent/transient,
2. alternative provider/capability if policy permits,
3. alternative route,
4. ask user,
5. fail with actionable explanation.

All retries/route changes must be traced.

---

## 93. Partial Success

Support responses such as:

```text
3 of 4 steps completed.
Rendering failed because no compatible Runner is online.

Completed:
✓ source selection
✓ rough cut
✓ subtitle

Pending:
○ render

[Retry render] [Choose another Runner] [Download project]
```

---

## 94. Resume Semantics

Graph resume must re-read authoritative external state before continuing.

Example:

- job was `running` when graph paused,
- on resume query `worker_jobs`,
- do not trust stale graph copy.

---

# PART V — IMPLEMENTATION PHASES

## 95. Phase 0 — Audit and Contracts

Deliverables:

- current Chat runtime map,
- current Skill/Agent registry map,
- current RAG/search path map,
- current job/process APIs,
- current permissions/secrets mechanisms,
- current Help architecture (`helpContentService`, Help Center, Help Panel, `helpContextInjector`, tRPC Help routes),
- current Feedback/Ticket entry points and persistence,
- verification of `help_screenshot.py` runtime registration before reuse,
- current global Help/Feedback button placement and reusable panel primitives,
- table/API reuse matrix,
- canonical contracts for Retrieval Broker, Operational Broker, Capability Registry.

Exit criteria:

- no major duplicate subsystem planned without justification.

---

## 96. Phase 1 — Capability Registry & Indexer

Build:

- normalized registry,
- capability projection/index,
- automatic indexing triggers,
- capability search API,
- Capabilities UI.

Exit criteria:

- all active Skills and selected internal tools discoverable,
- search works semantically,
- tenant/permission filters verified.

---

## 97. Phase 2 — Retrieval & Operational Brokers

Build:

- unified Retrieval Broker façade,
- `HELP` source adapter using the existing Help Markdown corpus,
- incremental Help indexing with locale/page/topic metadata,
- migration path from `helpContextInjector` keyword-only selection to broker-backed hybrid retrieval,
- Operational Broker,
- current worker/generation/project queries,
- rich Chat results.

Exit criteria:

Chat can answer:

- worker jobs summary,
- running processes,
- recent videos,
- Library semantic queries.

---

## 98. Phase 3 — LangGraph Orchestration Core

Build:

- state contract,
- top-level graph,
- deterministic routing,
- source resolver including `PRODUCT_HELP`,
- Page Context Envelope ingestion and context-sufficiency rules,
- shared orchestration entry contract for full Chat and Universal Assistant,
- streaming events,
- persistence/resume contract.

Exit criteria:

simple requests avoid cognitive escalation where not needed.

---

## 99. Phase 4 — Agents SDK Cognitive Layer

Build:

- Cognitive Orchestrator,
- structured outputs,
- ReturnToOrchestrator,
- specialist agents as needed,
- loop budgets,
- final synthesis.

Exit criteria:

ambiguous/multi-step requests can request evidence and resume.

---

## 100. Phase 5 — Execution Integration

Build:

- execution plans,
- permission gate,
- `worker_jobs` submission/refs,
- Live Task Card,
- resume after completion.

Exit criteria:

long-running tasks survive Chat navigation/reload.

---

## 101. Phase 6 — MCP Connections

Build:

- catalog,
- custom MCP wizard,
- auth,
- discovery,
- permission classification,
- capability indexing,
- health,
- MCP Apps/form fallback,
- Page Capability Adapter boundary prepared for future WebMCP exposure without making WebMCP a release dependency.

Exit criteria:

connected MCP capabilities are discoverable without globally loading schemas.

---

## 102. Phase 7 — Trace / Trajectory

Build:

- trace IDs,
- trajectory events,
- decision artifacts,
- Trace Explorer,
- Why UI,
- failure analysis.

Exit criteria:

an operator can reconstruct an execution path end-to-end.

---

## 103. Phase 8 — Evaluation / Multi-Route

Build:

- evaluation profiles,
- candidate route execution,
- comparison UI,
- user selection feedback.

Exit criteria:

system can compare at least two routes on supported task types.

---

## 104. Phase 9 — Dynamic Composition / Helpers

Build:

- capability gap resolver,
- temporary subgraphs,
- sandbox helper builder,
- helper inspector,
- evaluator helpers.

Exit criteria:

a missing exact Skill does not necessarily block a solvable task.

---

## 105. Phase 10 — Capability Evolution

Build:

- Learned Routes,
- Learning Center,
- repeated-pattern mining,
- Skill/Flow improvement proposals,
- candidate generation.

Exit criteria:

repeated successful trajectories can be promoted into reusable artifacts.

---

## 106. Phase 11 — Replay / Canary

Build:

- historical replay,
- benchmark datasets,
- candidate comparison,
- rollout/canary,
- rollback.

Exit criteria:

no AI-generated production capability change is promoted without controlled evaluation.

---

## 107. Phase 12 — Media RAG Expansion

Build:

- segment-level video semantics,
- timestamp results,
- richer image/video retrieval,
- media evaluation fixtures.

Exit criteria:

queries such as “ฉากร้านกาแฟ” return meaningful asset/segment results with provenance.

---

# PART VI — TESTING

## 108. Unit Tests

Cover:

- source resolver,
- status routing,
- capability ranking,
- permission classification,
- ReturnToOrchestrator parsing,
- helper manifest validation,
- failure taxonomy,
- route promotion rules.

---

## 109. Integration Tests

Must cover:

- LangGraph ↔ Retrieval Broker,
- LangGraph ↔ Operational Broker,
- LangGraph ↔ Agents SDK,
- LangGraph ↔ worker_jobs,
- MCP discovery/indexing,
- trace correlation,
- evaluation persistence,
- skill/flow candidate creation.

---

## 110. Security Tests

- cross-tenant retrieval denial,
- secret redaction,
- malicious MCP metadata/tool descriptions,
- prompt injection in Library documents,
- generated helper sandbox escape attempts,
- destructive action permission bypass,
- stale approval replay,
- unauthorized trace access.

---

## 111. Reliability Tests

- agent returns malformed structure,
- provider timeout,
- MCP disconnect,
- runner disappears,
- job retry,
- duplicated event,
- graph resume after process restart,
- source stale/missing,
- partial completion.

---

## 112. Evaluation Regression Suite

Maintain fixtures for:

- system queries,
- capability search,
- ambiguous references,
- asset search,
- complex multi-step tasks,
- route comparison,
- skill gap resolution,
- failure analysis.

---

## 113. MVP Acceptance Scenarios

The MVP MUST pass these without hard-coding exact user sentences:

### Scenario 1
“มี Skill ทำ Storyboard ไหม?”

Expected:
- Capability Registry search,
- relevant capabilities shown,
- no fabricated Skill list.

### Scenario 2
“worker_job ค้างกี่งาน?”

Expected:
- authoritative Operational Broker query,
- fresh structured count.

### Scenario 3
“มี process อะไรยังทำอยู่?”

Expected:
- current execution/process summary.

### Scenario 4
“ขอวิดีโอที่ generate ล่าสุด 10 รายการ”

Expected:
- rich media cards with current canonical data.

### Scenario 5
“หาวิดีโอฉากร้านกาแฟ”

Expected:
- semantic/hybrid retrieval,
- ACL respected,
- media results.

### Scenario 6
“เอาคลิปร้านกาแฟล่าสุดมาตัด”

Expected:
- search-before-clarify,
- capability selection,
- plan,
- permission if required,
- worker job when needed.

### Scenario 7
No exact Skill exists but multiple capabilities can solve the task.

Expected:
- dynamic composition,
- traced temporary route.

### Scenario 8
Missing small deterministic transformation.

Expected:
- sandboxed ephemeral helper or safe failure.

### Scenario 9
Ambiguous complex request.

Expected:
- Agents SDK cognitive escalation,
- structured return to LangGraph,
- evidence/user clarification only when needed.

### Scenario 10
Two candidate routes produce close results.

Expected:
- evaluate both,
- comparison UI,
- user choice if inconclusive,
- feedback recorded.

### Scenario 11
Repeated route succeeds many times.

Expected:
- Learning Center recommends Learned Route/Flow/Skill promotion.

### Scenario 12
Existing Skill repeatedly underperforms.

Expected:
- improve existing Skill candidate rather than blindly create duplicate.

---

## 114. Production Definition of Done

Feature 198 is NOT complete until all applicable items pass:

- backend contracts complete,
- UI complete,
- UX complete,
- tenant/ACL complete,
- permission policy complete,
- trace/provenance complete,
- error/retry/recovery complete,
- observability complete,
- tests complete,
- migration/backward compatibility assessed,
- feature flags available,
- rollback documented,
- generated helper sandbox validated,
- capability evolution gated,
- production changes require review/canary,
- no duplicate durable execution state introduced.

Additionally:

> Any capability callable by end users must have a discoverable UI path, status visibility, result visibility, error/recovery UX, and traceability appropriate to user role.

---

Additional required items:
- Universal Assistant and full Chat share one runtime contract rather than divergent behavior.
- Help corpus is indexed and retrievable with page/locale metadata.
- Help Center remains functional and links resolve.
- current-page context obeys tenant/user/field allowlists.
- Feedback created from Assistant contains only authorized diagnostic context.

# PART VII — REVIEW FINDINGS AND GAP-CLOSURE REQUIREMENTS

## 115. Mandatory Guardrails for Implementation

1. Do not build a second job-control truth in LangGraph.
2. Do not build a second long-term memory system in LangGraph/Agents SDK.
3. Do not create a new monolithic RAG stack just for Chat.
4. Do not globally preload all MCP/Skill schemas.
5. Do not allow Web Search to substitute for missing internal authoritative data.
6. Do not execute generated code on backend hosts without sandboxing.
7. Do not expose secrets in model context or traces.
8. Do not promote AI-generated capabilities straight to production.
9. Do not create new Skills before checking for an existing improvable capability.
10. Do not show infrastructure complexity by default to normal users.
11. Do not expose hidden chain-of-thought; store structured decision artifacts instead.
12. Do not let stale LangGraph state override current operational truth.
13. Do not send complete raw DOM/hidden UI state to models as the normal contextual-assistance mechanism.
14. Do not grant source-code access to ordinary users merely to answer Help questions.
15. Do not build a second Help authoring store; the existing Markdown corpus remains canonical.
16. Do not create a second conversational backend for the Assistant drawer; reuse the full Chat orchestration runtime.
17. Do not make WebMCP mandatory for core contextual assistance.

---

## 116. Suggested Feature Flags

- `intelligent_chat_v2`
- `langgraph_orchestration`
- `agents_sdk_cognitive`
- `capability_registry_v2`
- `mcp_connections`
- `dynamic_helper_generation`
- `multi_route_evaluation`
- `capability_learning`
- `skill_auto_candidate`
- `flow_auto_candidate`
- `universal_assistant_launcher`
- `page_context_v1`
- `help_retrieval_broker`
- `assistant_feedback_integration`
- `help_drift_detection`
- `webmcp_adapter` (off by default / later phase)

Roll out progressively by tenant/admin cohort. Help/Feedback launcher migration MUST have an independent rollback path.

---

## 117. Observability Dashboard Requirements

Admin dashboard should expose:

- orchestration success rate,
- requests by route type,
- cognitive escalation rate,
- average cognitive rounds,
- average tool schemas hydrated,
- retrieval latency,
- capability search latency,
- worker job completion rate,
- MCP error/auth-expiry rate,
- generated helper success rate,
- route comparison frequency,
- user clarification frequency,
- token/cost per request class,
- top recurring failure taxonomy,
- top capability gaps,
- top improvement opportunities,
- Universal Assistant open/use rate,
- Help retrieval hit/no-hit and latency,
- contextual-reference resolution rate,
- troubleshooting → Feedback conversion,
- Help indexing lag/failures,
- Help documentation drift signals,
- Page Context Tier usage and average context size.

---

## 118. Data Retention / Privacy

Trajectory and evaluation data may contain sensitive user/project content.

Implementation must define:

- retention period,
- redaction policy,
- user/tenant deletion propagation,
- trace access permissions,
- model-training/analytics usage policy,
- artifact retention,
- secret/PII filtering,
- Page Context snapshot retention (prefer ephemeral/minimal retention unless needed for a trace),
- Feedback Context Package retention aligned with existing support policy,
- screenshot retention/consent policy,
- Help evidence/provenance retention independent of user content.

Deleting a source Library item or user content must propagate according to the existing deletion/governance model and Feature 194 indexing/deletion rules.

Deletion propagation MUST cover derived/projection copies where applicable: vector projections, cached evidence, context snapshots, trace payload attachments, evaluation samples, generated-helper fixtures, and Feedback diagnostic attachments. Where a record must remain for audit/legal reasons, replace removed content with a tombstone/minimal non-content lineage reference according to policy rather than retaining the deleted payload silently. A reconciliation job/report MUST detect orphaned derived copies after deletion.

---

## 119. Compatibility / Migration Strategy

1. Existing Chat remains available behind same UI.
2. Route only enabled tenants/users to new orchestration runtime.
3. Existing hard-coded Chat tools may initially be exposed as internal capabilities.
4. Existing RAG systems remain operational through Retrieval Broker adapters.
5. Existing Skills are indexed incrementally.
6. Existing `worker_jobs` integration is reused.
7. MCP is additive.
8. Feature 194 vector cutover remains independently governed.
9. Legacy routes are removed only after telemetry proves replacement stability.
10. Existing Help Markdown remains canonical and is indexed through a new Retrieval Broker adapter.
11. Existing `HelpButton` / `HelpPanel` UI primitives should be reused where practical, then migrated behind feature flags to the Universal Assistant.
12. Existing Feedback/Ticket backend remains authoritative; only the entry/diagnostic flow is unified.
13. Full `/help` and `/help/:slug` routes remain supported.
14. WebMCP, if added later, wraps the internal Page Capability Adapter and does not replace it.

---

## 120. Open Implementation Decisions

These decisions require repository audit during Phase 0, not architectural reinvention:

- exact storage tables to reuse vs add,
- LangGraph persistence backend location,
- existing event transport for Chat streaming,
- exact sandbox runtime implementation,
- current Skill manifest fields reusable for capability indexing,
- current secrets storage integration,
- current UI component library and routing conventions,
- exact media segment indexing schema,
- exact evaluation model/provider choices,
- which MCP Registry/catalog sources are enabled by default,
- whether Help projection metadata reuses `vectorProjectionRegistry` directly or requires a Help-specific projection mapping,
- exact cross-surface session linkage between full Chat and Assistant drawer,
- exact migration path from `HelpButton` / `HelpPanel` and current Feedback launcher into the Universal Assistant Launcher,
- whether page-context registry is code-configured, DB-configured, or hybrid,
- which current pages can expose safe page actions in the first release,
- WebMCP adapter timing after internal Page Capability contracts stabilize.

---

# Appendix A — Canonical Example

User:

> “เอาของร้านกาแฟที่ทำเมื่อคืนมาทำคลิป 30 วิสำหรับ TikTok ถ้าของเดิมไม่ดีลองหาอีกวิธี”

Expected:

```text
1. Fast analysis:
   complex + temporal + media + execution

2. Cognitive Agent:
   needs evidence to resolve "ของร้านกาแฟ"

3. ReturnToOrchestrator:
   NEED_EVIDENCE

4. LangGraph:
   Retrieval Broker → cafe assets from last night
   Operational/Generation metadata → generation details

5. Cognitive Agent:
   selects candidate source(s)
   searches capabilities

6. Capability Broker:
   rough cut
   reframe
   subtitle
   ad QC

7. Cognitive Agent:
   creates Route A
   optionally Route B if source quality is uncertain

8. LangGraph:
   permission/cost gate

9. worker_jobs:
   execute long video processing

10. Evaluation:
    compare routes/output QC

11. If clear winner:
    select
    else:
    ask user via Compare Results Card

12. Final synthesis:
    explain result + artifact cards

13. Trajectory:
    store execution/evaluation/feedback

14. Learning:
    if pattern repeats, recommend Learned Route/Flow/Skill.
```

---

# Appendix B — Capability Evolution Lifecycle

```text
ONE-OFF TRAJECTORY
       │
       ▼
REPEATED PATTERN?
   │          │
  no         yes
   │          ▼
 keep      LEARNED ROUTE
              │
          stable structure?
           │          │
          no         yes
           │          ▼
        continue   SAVED FLOW
                       │
                 stable product contract?
                    │          │
                   no         yes
                    │          ▼
                 keep flow    SKILL
                                │
                         historical evidence
                                │
                          candidate version
                                │
                              replay
                                │
                              canary
                                │
                         production / rollback
```

---

# Appendix C — Review Checklist

Before implementation PR approval, verify:

- [ ] state ownership is unambiguous
- [ ] no duplicate source of truth
- [ ] retrieval source is appropriate
- [ ] tenant/ACL enforced
- [ ] context budget bounded
- [ ] cognitive loop bounded
- [ ] tool hydration bounded
- [ ] generated code sandboxed
- [ ] permissions enforced
- [ ] traces do not leak secrets
- [ ] UI has normal + developer detail levels
- [ ] errors have recovery UX
- [ ] long jobs use worker_jobs
- [ ] MCP disconnect/auth expiry handled
- [ ] evaluation is multi-dimensional
- [ ] inconclusive comparisons can defer to user
- [ ] feedback is recorded safely
- [ ] existing Skill checked before creating new Skill
- [ ] Skill/Flow changes are versioned
- [ ] replay/canary required before promotion
- [ ] feature flags and rollback exist
- [ ] Feature 194 remains independently governed
- [ ] Feature 186 job-control guarantees are preserved

---


## 121. Capability Dependency Graph

Capability Registry MUST support relationships, not only flat semantic search.

Required relationship types include:

- `requires`
- `produces`
- `consumes`
- `can_follow`
- `can_precede`
- `alternative_to`
- `implemented_by`
- `supersedes`
- `belongs_to_pack`

This graph enables composition based on input/output compatibility instead of relying only on similarity scores.

Example:

```text
Video
 ├─transcribe→ Transcript
 │                └─subtitle.generate→ Subtitle
 ├─scene.detect→ SceneSegments
 └─rough_cut→ EditedVideo
```

Suggested logical entity: `capability_edges` or equivalent reuse of an existing relation model.

---

## 122. Capability Packs / Presets

Feature 198 MUST support curated **Capability Packs** so users can connect/install a useful bundle without loading all included schemas into Chat.

Examples:

### Smart Home Pack
- Google Home MCP
- Home Assistant MCP
- device-state presets
- night-mode preset
- camera-summary preset

### Developer Pack
- GitHub
- Cloudflare
- database tools
- Sentry/log tools
- deploy/review presets

### Content Creator Pack
- SmartAIHub Image
- SmartAIHub Video
- Library
- social/publishing integrations
- short-video presets

A Pack contains metadata, recommended connections, default policies, example commands, and optional Saved Flows. It does NOT imply that every member capability is hydrated into model context.

### 122.1 Packs UI

Add a `Packs` tab under Connections/Capabilities:

```text
Capability Packs

[Smart Home] [Developer] [Content Creator] [Business]

Developer Pack
4 recommended connections
6 reusable flows

[Review] [Set up]
```

Setup wizard MUST show which connections/actions will be added and their permission requirements.

---

## 123. Orchestration Consistency, Idempotency, and Concurrency

Every orchestration run MUST have:

- `orchestration_run_id`
- `trace_id`
- request idempotency key
- current graph/version identifier
- optimistic concurrency/version field or equivalent
- last durable checkpoint reference

Requirements:

1. A retried Chat HTTP request MUST NOT submit duplicate destructive jobs.
2. Duplicate `worker_job_events` MUST be safe to consume.
3. Graph resume MUST be idempotent.
4. Concurrent user actions on the same approval/task MUST resolve deterministically.
5. A stale browser tab MUST NOT overwrite newer orchestration state.
6. Job submission and orchestration state transition SHOULD use existing outbox/idempotency patterns where applicable.

The implementation must document transaction boundaries between:

- orchestration run persistence,
- `worker_jobs` creation,
- trajectory event creation,
- user-visible acknowledgement.

---

## 124. Event-Driven Resume and Cancellation Propagation

Long-running orchestration SHOULD prefer event-driven wake/resume over tight polling.

Supported mechanisms may include existing event bus/outbox/websocket/SSE infrastructure discovered during Phase 0.

Cancellation flow:

```text
User Cancel
 → LangGraph orchestration cancellation request
 → permission/state validation
 → worker_jobs.cancel
 → Runner/Worker/MCP adapter cancellation
 → terminal/partial state
 → trajectory event
 → UI update
```

Requirements:

- cancellation is best-effort but explicit,
- unsupported external cancellation must be reported,
- orphaned external tasks must be surfaced,
- cancellation must not silently mark an active external task as cancelled if the provider did not confirm it.

---

## 125. MCP / Tool Supply-Chain Security

Custom and catalog MCP integrations are untrusted inputs until approved.

Required protections:

1. Prevent SSRF/private-network access according to deployment policy.
2. Enforce outbound network allow/deny policy.
3. Sanitize and bound MCP tool descriptions/resources before inserting them into model context.
4. Treat tool descriptions and retrieved resources as untrusted content for prompt-injection purposes.
5. Do not allow MCP metadata to override platform system instructions, permission policy, or tool trust classification.
6. Store OAuth/token scopes and display them in Connection Detail.
7. Require re-approval when effective permission scope materially increases.
8. Pin/record server identity, URL, discovery hash, and capability changes.
9. Alert on unexpected large tool-list changes or risk-class changes.
10. Redact credentials and sensitive headers from trace/error data.

A changed MCP capability set must trigger re-indexing and may trigger permission review.

Connection lifecycle MUST additionally cover:

- OAuth/token refresh and refresh failure,
- explicit disconnect/revoke,
- shared-vs-personal connection ownership,
- scope reduction/increase detection,
- quarantine on repeated identity/capability-integrity failures,
- capability cache invalidation after reconnect/re-auth,
- user-visible `Needs attention` state for expired/revoked credentials.

Disconnect/revoke MUST immediately prevent new tool execution and invalidate cached authorization-sensitive capability metadata.

---

## 126. Cognitive Boundary Enforcement

The Agents SDK cognitive layer MUST NOT autonomously:

- write arbitrary production database records,
- bypass Permission Engine,
- start high-cost durable jobs without an approved execution plan,
- alter production routing,
- publish generated Skills/Flows directly,
- treat its own prior output as authoritative system state.

Every CognitiveResult must indicate the requested action class.

LangGraph/Core validates the request before performing it.

Provider abstraction rule:

- `CognitiveOrchestratorAdapter` is the platform contract.
- OpenAI Agents SDK Python is the initial/default adapter.
- Platform state, Capability Registry, Evidence Brokers, and execution control MUST NOT depend on OpenAI-specific persistence formats.

---

## 127. Generated Skill Packaging Requirements

When Capability Evolution produces a Skill candidate, it MUST conform to the current SmartAIHub Skill packaging standard discovered during Phase 0.

At minimum, where applicable, candidate packaging should include:

```text
skill manifest
schemas/input.schema.json
schemas/ui.schema.json
schemas/output.schema.json
implementation reference
tests
evaluation profile
version/provenance
permission/risk metadata
```

If the current repository standard differs, reuse the repository standard rather than introduce a second Skill format.

Generated Skill candidates MUST:

- search for an existing equivalent/improvable Skill first,
- record lineage to source trajectories/Flow/Route,
- pass schema validation,
- pass replay tests,
- remain non-production until governed promotion.

---

## 128. Learning Safety and Feedback-Poisoning Controls

The learning system MUST avoid turning noisy or manipulated feedback into production behavior.

Requirements:

1. Do not promote a route from a single successful trace.
2. Use configurable minimum sample counts.
3. Separate explicit user feedback from inferred implicit signals.
4. Weight implicit signals conservatively.
5. Track evaluator/model/version used for each historical score.
6. Avoid comparing scores generated by materially different evaluator versions without normalization or re-evaluation.
7. Require diversity of samples where relevant; do not optimize only for one user/project unless the artifact is intentionally scoped.
8. Detect sudden anomalous feedback bursts.
9. Allow tenant-specific learned routes without polluting global defaults.
10. Require human/admin approval for global production promotion unless an explicitly governed policy allows otherwise.
11. Preserve rollback lineage.
12. Periodically re-evaluate “proven” routes when providers/models/capabilities change.

Quality must not be optimized solely for popularity, lowest token count, or cheapest route.

---

## 129. UI Responsiveness, Accessibility, and Empty/Error States

All new UI MUST support desktop and tablet layouts.

Requirements:

- responsive two-column/side-panel layouts collapse cleanly on tablet,
- keyboard navigation for Chat, Compare, Connections, Trace filters,
- visible focus states,
- semantic labels for buttons/forms,
- accessible progress/status representation not dependent only on color,
- loading skeletons for long lists,
- empty-state guidance,
- recoverable error states,
- pagination/virtualization for large Trace/Capability lists.

Examples of empty states:

```text
No MCP connections yet.
[Browse Catalog] [Add Custom MCP]
```

```text
No matching capability found.
[Search Catalog] [Ask SmartAIHub to build a temporary solution]
```

Role-based UI:

- Normal User
- Power User
- Developer
- Admin

Infrastructure/debug details are hidden unless role/mode permits.

---

## 130. Notifications and Cross-Surface Task Continuity

Long-running tasks must not depend on keeping the Chat tab open.

When a task changes materially:

- Chat task card updates in real time when open.
- Task remains visible in the existing job/task surfaces.
- Optional in-product notification is created on completion/failure/approval-needed.
- Opening the notification restores the relevant Chat/orchestration/trace context.

Do not create a separate job truth for notifications.

---

## 131. Performance and Cost SLOs

Phase 0/implementation must establish baseline measurements, then define release SLOs.

Minimum metrics:

- fast-route decision latency,
- Operational Broker p95 latency,
- Retrieval Broker p95 latency,
- capability search p95 latency,
- time to first streamed Chat activity,
- cognitive escalation rate,
- average cognitive rounds,
- average hydrated tool count,
- orchestration success rate,
- durable job submission latency,
- trace write overhead,
- cost per request class,
- Help retrieval p95,
- Page Context envelope generation p95,
- Universal Assistant time-to-first-activity,
- contextual-reference resolution success rate.

Target principle:

> Simple deterministic SmartAIHub queries should not pay the latency/token cost of full cognitive orchestration.

Load tests must include high-cardinality capability registries and large Trace histories.

---

## 132. Dependency and Protocol Version Governance

Record and pin supported versions for:

- LangGraph,
- OpenAI Agents SDK,
- MCP protocol/extensions used,
- vector-provider contracts,
- worker/job event contracts.

Upgrades must run compatibility/regression tests for:

- graph checkpoint/state migration,
- CognitiveResult schema,
- MCP discovery/tool changes,
- tracing adapters,
- generated helper sandbox.

Avoid persisting framework-private objects as long-term platform contracts when a stable SmartAIHub-owned schema can be stored instead.

---

## 133. Initial Ten-Pass Gap Review — Completed Before Contextual Assistant / Help Integration

The initial spec was reviewed in at least ten independent passes. Gaps found were incorporated into the normative sections above rather than left as future notes.

### Pass 1 — Architecture / State Ownership
Checked LangGraph, Agents SDK, `worker_jobs`, memory, and DB ownership.

**Gap fixed:** added orchestration idempotency, concurrency, checkpoint and transaction-boundary requirements; reaffirmed `worker_jobs` as authoritative execution state.

### Pass 2 — RAG / Retrieval / Feature 194 Compatibility
Checked fragmented RAG reuse, provider abstraction, `rag_query`, vector migration and media retrieval.

**Gap fixed:** retained provider-independent Retrieval Broker, prohibited Vectorize migration from blocking Chat, and preserved existing hybrid/RRF/reranker value.

### Pass 3 — Capability Discovery / Scalability
Checked Skill/MCP/Flow indexing and context growth.

**Gap fixed:** added Capability Dependency Graph and Capability Packs; retained lazy hydration and hybrid ranking.

### Pass 4 — MCP Lifecycle / Security
Checked catalog, custom MCP, permissions, auth, metadata changes, external risk.

**Gap fixed:** added explicit MCP supply-chain, SSRF, prompt-injection, scope-change, discovery-hash and re-approval requirements.

### Pass 5 — Cognitive Orchestration Boundary
Checked whether Agents SDK could accidentally become a second control plane.

**Gap fixed:** added `CognitiveOrchestratorAdapter`, prohibited direct production mutation/bypass, and made structured ReturnToOrchestrator mandatory.

### Pass 6 — Dynamic Self-Extension
Checked helpers, temporary Flows, agents, evaluators and generated Skills.

**Gap fixed:** reinforced sandboxing and added generated Skill packaging/schema/provenance requirements.

### Pass 7 — Evaluation / Learning Integrity
Checked multi-route comparison, feedback, route learning and Skill/Flow evolution.

**Gap fixed:** added minimum-sample, evaluator-version, anomaly, tenant-scope, re-evaluation and anti-feedback-poisoning controls.

### Pass 8 — UI / UX Completeness
Checked whether backend features are actually usable from product UI.

**Gap fixed:** added Capability Packs UI, responsive/tablet behavior, accessibility, role-based detail levels, empty/error states and cross-surface task continuity.

### Pass 9 — Durable Execution / Recovery
Checked job event duplication, cancellation, resume, orphan external tasks and stale state.

**Gap fixed:** added event-driven resume preference, cancellation propagation and explicit orphan/unsupported-cancel behavior.

### Pass 10 — Production Readiness / Operations
Checked observability, rollout, dependency upgrades, performance and cost.

**Gap fixed:** added SLO/baseline requirements, high-cardinality load tests and framework/protocol version governance.

No remaining gap discovered in these ten passes requires changing the core architecture before implementation planning. Repository audit in Phase 0 remains mandatory for reuse decisions and exact table/API names.

---


# PART VIII — UNIVERSAL CONTEXTUAL ASSISTANT, HELP RAG & FEEDBACK INTEGRATION

## 134. Universal AI Assistant Launcher

### 134.1 Purpose

SmartAIHub MUST provide a globally available **Universal AI Assistant Launcher** on major authenticated product surfaces. It replaces the fragmented *entry experience* of contextual Help and Feedback while preserving the canonical Help documentation and Feedback/Ticket backends.

The launcher is not a second chatbot. It is a compact interaction surface for the same orchestration runtime used by full SmartAIHub Chat.

Supported intents include:

- “หน้านี้ทำอะไร?” — product Help,
- “ปุ่มนี้คืออะไร?” — contextual UI Help,
- “งานตัวบนทำไมยัง Running?” — operational diagnostics,
- “มี Skill ทำแบบนี้ไหม?” — capability discovery,
- “หาวิดีโอร้านกาแฟ” — Library/Media retrieval,
- “ทำคลิปนี้ให้สั้นลง” — execution,
- “ปุ่มนี้กดแล้วไม่เกิดอะไร” — troubleshooting → optional Feedback,
- general questions when no platform-specific source is required.

### 134.2 Desktop UX

Recommended default:

```text
┌────────────────────────────────────────────┐
│ ✨ SmartAIHub Assistant               [×] │
│ 📍 Dashboard                               │
│ ใช้บริบทของหน้านี้ ✓        [เปลี่ยน]      │
├────────────────────────────────────────────┤
│                                            │
│ สวัสดี มีอะไรให้ช่วยเกี่ยวกับหน้านี้ไหม?  │
│                                            │
│ [งานที่กำลังทำอยู่มีอะไรบ้าง?]             │
│ [135 Skill ที่ควรปรับคืออะไร?]             │
│ [หน้านี้ใช้งานอย่างไร?]                    │
│                                            │
│ ...conversation...                         │
│                                            │
├────────────────────────────────────────────┤
│ Ask anything...                       [➤] │
│ 📖 Help   ⚠ Report problem   ⤢ Open in Chat │
└────────────────────────────────────────────┘
```

Recommended drawer width: approximately 420–480 px where viewport allows. Existing resizable Help Panel behavior MAY be reused.

Context transparency controls MUST remain compact but available:

- show whether current-page context is active,
- allow the user to disable current-page context for a turn/conversation,
- provide `What can AI see?` / context-summary UI listing categories rather than secrets/raw payloads,
- clearly indicate when screenshot/visual context is requested,
- invalidate the displayed page-context indicator after navigation until a fresh snapshot is captured.

### 134.3 Tablet / Mobile UX

- tablet: wider side sheet or adaptive modal,
- narrow viewport/mobile: bottom sheet expanding to full-screen conversation,
- no essential action hidden behind hover,
- preserve current page state when Assistant closes,
- task progress remains recoverable after navigation.

### 134.4 Launcher Placement

The current Feedback launcher location is a strong migration target. Avoid adding independent floating Help + Feedback + AI buttons.

Migration SHOULD converge to one launcher, for example:

```text
[ ✨ AI Assistant ]
```

The existing header Help action MAY remain, but it SHOULD open the same Assistant runtime with `entry_mode=help` / contextual Help suggestions rather than a second conversational backend.

---

## 135. Single Conversation Surface for AI, Help, Troubleshooting, and Feedback

Users MUST NOT be forced to decide whether their question is “AI”, “Help”, or “Feedback” before asking.

A single Assistant conversation determines the appropriate route:

```text
User message
   ↓
Page Context + Request Understanding
   ↓
LangGraph Source Resolver
   ├─ PRODUCT_HELP → Help Retrieval
   ├─ OPERATIONAL → Operational Broker
   ├─ CONTENT/RAG → Retrieval Broker
   ├─ CAPABILITY → Capability Broker
   ├─ ACTION → Plan / Permission / Execute
   ├─ TROUBLESHOOT → Help(expected) + Trace/System(actual)
   └─ GENERAL / EXTERNAL → model knowledge / Web as policy allows
```

“Report problem” transitions the existing conversation into a diagnostic/Feedback flow without requiring the user to repeat the issue.

---

## 136. Page Context Envelope

### 136.1 Purpose

Short user references are often under-specified in text but obvious from the current UI. The browser client MUST be able to supply a compact structured context envelope.

Canonical logical shape:

```json
{
  "surface": "dashboard",
  "route": "/dashboard",
  "page_id": "main_dashboard",
  "locale": "th",
  "workspace_id": "optional-ref",
  "project_ref": "optional-ref",
  "visible_sections": ["recent_jobs", "usage_summary", "recommended_actions"],
  "focused_component": "optional-component-id",
  "selected_entity_refs": ["worker_job:1234"],
  "active_filters": {},
  "visible_entity_refs": ["worker_job:1234", "skill_improvement_summary"],
  "page_capability_refs": ["system.jobs.summary", "skills.improvement.list"],
  "context_version": 1,
  "captured_at": "ISO-8601",
  "page_instance_id": "ephemeral-client-instance",
  "context_fingerprint": "hash-of-authorized-semantic-context",
  "expires_at": "ISO-8601-or-null"
}
```

Freshness rules:

- the client MUST create a new `page_instance_id` when navigation creates a logically new page instance;
- selected/focused entity changes MUST update `context_fingerprint` even when route is unchanged;
- the server MUST reject or refresh stale context before using entity references for sensitive reads/actions;
- Page Context is a navigation hint, never authoritative business state; Tier B broker/API reads remain authoritative;
- cross-tab context MUST remain isolated unless the user explicitly continues the same Assistant surface/session and authorization is revalidated.

### 136.2 Context Tiers

Use the least expensive/sensitive tier sufficient for the task:

**Tier A — Page Context**
- route/page ID,
- locale,
- selected/focused references,
- visible semantic sections,
- filters,
- page capability references.

**Tier B — Page Data**
Fetched on demand from authoritative APIs/Brokers, e.g. selected job details or project metadata.

**Tier C — Visual Context**
Screenshot/vision only when A+B are insufficient and policy permits.

Raw screenshot must NOT be the default method of “understanding the page”.

### 136.3 Prohibited Context

Do not automatically transmit:

- complete raw DOM,
- hidden DOM values,
- server-only data,
- secrets/tokens,
- fields user cannot access,
- application source code,
- other-tenant references,
- off-screen sensitive state merely because it exists in client memory.

---

## 137. Page Context Registry

Each major page SHOULD register structured contextual metadata rather than hard-code prompt text.

Example:

```yaml
page_id: dashboard
routes:
  - /dashboard
help_topics:
  - dashboard-overview
  - worker-job-status
  - skill-improvements
context_providers:
  - dashboard.visible_state
  - dashboard.selected_entity
page_capabilities:
  - system.jobs.summary
  - skills.improvement.list
  - usage.summary
suggested_questions:
  - งานอะไรยังทำอยู่?
  - มีงานไหนผิดพลาด?
  - Skill ที่ควรปรับมีอะไรบ้าง?
```

Example Video Editor registry:

```yaml
page_id: video_editor
help_topics:
  - video-editor
context_providers:
  - video_editor.project
  - video_editor.timeline_selection
  - video_editor.selected_clip
page_capabilities:
  - video.inspect
  - subtitle.generate
  - video.rough_cut
  - render.status
```

The registry may be implemented as code/config/DB hybrid after Phase 0 audit. The contract MUST remain SmartAIHub-owned and versioned.

---

## 138. Page Capability Adapter

SmartAIHub MUST define a safe adapter between page semantics and executable capabilities.

```text
Current Page
    ↓
Page Context Registry
    ↓
Page Capability Adapter
    ├─ internal read/query capability
    ├─ existing SmartAIHub Skill/Flow
    ├─ safe UI navigation action
    └─ future WebMCP exposure
```

Requirements:

1. Page capabilities are explicit allowlisted actions, not arbitrary DOM manipulation.
2. Existing Core permission checks still apply.
3. Destructive/write actions use normal approval policy.
4. Assistant must not infer a write action solely from visual labels when a structured capability exists.
5. Page capability invocation is traced like every other capability.

---

## 139. Help Corpus as an Authoritative Retrieval Source

### 139.1 Source Family

Retrieval Broker MUST add canonical source family:

```text
HELP
```

Current inputs:

```text
apps/web/docs/help/en/*.md
apps/web/docs/help/th/*.md
apps/web/docs/help/_manifest.json
```

Do NOT create a duplicate Help authoring repository for Feature 198.

### 139.2 Index Pipeline

```text
Help Markdown
    ↓
frontmatter parser + content safety normalization
    ↓
normalize topic identity / locale
    ↓
chunk
    ↓
embedding + keyword projection
    ↓
Vector provider resolver / persistent search
    ↓
Retrieval Broker (scope=help)
```

Feature 194 remains responsible for provider cutover governance.

Help content is authoritative **product documentation evidence**, but retrieved Markdown/HTML text MUST still be treated as data rather than executable agent instruction. Indexing/retrieval MUST strip or neutralize executable HTML/script payloads, preserve source hashes, and prevent retrieved Help text from overriding platform system/policy instructions.

### 139.3 Help Chunk Metadata

Minimum logical metadata:

```yaml
source_type: help
topic_id: video-editor
slug: video-editor
locale: th
title: คู่มือ Video Editor
description: ...
section: features
pages:
  - /video-studio
  - /video-editor
tags:
  - video
  - editor
  - timeline
source_path: apps/web/docs/help/th/video-editor.md
content_hash: ...
source_commit: optional
indexed_at: ...
document_version: ...
visibility: public-or-current-policy
```

### 139.4 Topic Pairing

TH/EN variants SHOULD share a stable `topic_id` so retrieval can:

1. prefer user locale,
2. fall back to alternate locale when evidence is insufficient,
3. synthesize in the user language,
4. preserve provenance showing which locale source was used.

---

## 140. Help Retrieval Ranking

Help search SHOULD use hybrid ranking, not keyword-only selection.

Candidate ranking may combine:

```text
semantic similarity
+ keyword/BM25
+ current-page boost
+ locale boost
+ section/tag relevance
+ topic relation expansion
+ freshness/version confidence
```

Current-page boost is important for under-specified questions such as:

- “ตรงนี้คืออะไร?”
- “ช่องนี้กรอกอะไร?”
- “ปุ่มนี้อยู่ไหน?”

Existing Help knowledge-graph/topic-relation data SHOULD be reusable as an expansion/reranking signal where practical.

---

## 141. Migration of Existing `helpContextInjector`

The current Help Assistant logic MUST NOT remain a parallel long-term RAG path.

Target migration:

```text
helpContextInjector / keyword rules
        ↓
Help Retrieval Adapter
        ↓
Retrieval Broker(scope=help)
```

During migration, existing behavior may be retained behind compatibility flags, but final source retrieval SHOULD be broker-backed with shared ACL/provenance/telemetry contracts.

The old keyword detection logic may remain useful as a cheap routing hint, but not as the authoritative Help retrieval mechanism.

Before retiring the legacy injector, run a shadow/parity period on representative Help queries and compare:

- relevant-topic hit rate,
- locale correctness,
- no-result rate,
- latency/cost,
- citation/provenance completeness,
- user correction/escalation rate.

Cutover thresholds and rollback conditions MUST be defined from Phase 0 baselines; do not remove the legacy path solely because the new index is technically available.

---

## 142. Help Center Retention and Upgrade

The full Help Center MUST remain available:

- `/help`
- `/help/:slug`

Reasons:

- structured reading,
- onboarding,
- bookmarks/deep links,
- sharing,
- documentation QA,
- manual discovery when users prefer browsing,
- canonical source links from Assistant answers.

The Help Center search SHOULD migrate to the same Retrieval Broker `HELP` index so a query such as “ทำไมเงินลด” may semantically find “ระบบเครดิต” even when exact terms differ.

Universal Assistant therefore **replaces fragmented Help entry behavior, not the Help documentation product itself**.

---

## 143. Help as Expected-Behavior Knowledge for Troubleshooting

Help has a second role beyond answering “how to use” questions: it documents expected product behavior.

Troubleshooting MAY compare:

```text
Expected behavior
    ← Help RAG / product documentation

Actual behavior
    ← Page Context + Trace + Operational Broker + worker_job events

Difference
    ↓
Potential bug / configuration issue / misunderstanding
```

Example:

```text
Help: Render action should create a worker job.
Actual trace: no worker job was created.
→ likely application/runtime issue, suitable for Feedback escalation.
```

Help is not infallible; documentation drift MUST be considered.

---

## 144. Help Documentation Drift Detection

The Evaluation/Learning plane SHOULD detect probable Help drift using signals such as:

- repeated user inability to find a documented control,
- Help-described location/action conflicting with registered current Page Context metadata,
- repeated Feedback linked to the same Help topic,
- feature/version changes without matching Help source hash changes,
- answers repeatedly requiring correction despite high Help retrieval confidence.

Create a typed failure/improvement signal:

```text
HELP_DOCUMENTATION_DRIFT
```

Learning Center may show:

```text
Help article potentially outdated
Topic: Video Editor
Evidence: 27 related user failures/questions
[Review Help]
```

AI MAY generate a Help update candidate/diff, but MUST NOT publish documentation automatically unless a governed documentation policy explicitly permits it.

---

## 145. Help Indexing Lifecycle

Help indexing MUST be incremental.

Use `content_hash` or equivalent:

```text
unchanged → skip re-embedding
changed   → re-parse / re-chunk / re-embed
new       → index
removed   → tombstone/delete projection according to Feature 194 governance
```

Triggers may include:

- repository deploy/build event,
- explicit admin reindex,
- content update pipeline,
- migration/backfill campaign.

Observability MUST show indexed topic count by locale, last index time, failures, stale projections, and vector provider readiness.

---

## 146. Contextual Suggested Questions

Each major page MAY provide 2–5 dynamically selected example questions. These are suggestions, not hard-coded limits.

Examples:

**Dashboard**
- งานอะไรยังทำอยู่?
- มีงานไหนผิดพลาด?
- Skill ที่ควรปรับมีอะไรบ้าง?

**Library**
- หาวิดีโอร้านกาแฟ
- ไฟล์ล่าสุดมีอะไรบ้าง?
- สรุปเอกสารที่เลือก

**Video Editor**
- ตัดช่วงพูดผิด
- ทำ subtitle ให้ช่วงนี้
- ทำไม render ล่าสุดไม่ผ่าน?

**Skill Editor**
- Skill นี้ทำอะไร?
- ตรวจ schema ให้หน่อย
- ทดสอบ Skill นี้

Suggestions SHOULD be generated from Page Context Registry, current state, Help metadata, and permissions; avoid suggestions for actions the user cannot perform.

---

## 147. Feedback / Support Integration

### 147.1 Interaction Unification, Backend Separation

The Assistant becomes the preferred user entry point for “I have a problem”, but existing Feedback/Ticket workflow remains the system of record for support cases.

```text
Assistant conversation
    ↓
troubleshooting
    ↓
resolved? ─ yes → finish
    │
    no
    ↓
[Report problem]
    ↓
Feedback Context Package
    ↓
Existing Feedback / Ticket backend
```

### 147.2 Feedback Context Package

Capture only permission-allowed diagnostic context:

```text
user description
assistant conversation summary relevant to issue
current page ID / route
focused component ID if available
selected entity refs
graph/orchestration trace ID
related worker_job IDs
recent relevant errors
capability/version refs
relevant Help topic/evidence refs used for expected behavior
browser/app version metadata allowed by policy
optional screenshot with explicit policy/consent
```

Before final submission, the user SHOULD receive a compact preview of diagnostic context categories being attached (for example page, trace, job IDs, screenshot) and be able to remove optional attachments where policy permits. Screenshot capture is opt-in unless a separately governed enterprise/admin policy explicitly defines otherwise.

Do not attach arbitrary conversation history, secrets, hidden DOM, raw credentials, or unrelated user content.

### 147.3 AI Triage

AI may classify/summarize:

- probable issue category,
- affected component,
- related traces,
- similar incidents,
- expected vs actual behavior,
- suspected regression/version,
- reproduction steps based on evidence.

AI triage is diagnostic metadata, not a final factual root-cause claim unless verified.

---

## 148. Troubleshooting UX

Example:

```text
User: ปุ่มนี้กดแล้วไม่เกิดอะไร

Assistant:
ตรวจจากคู่มือ ปุ่มนี้ควรเริ่มงาน Render และสร้าง worker job
แต่จากสถานะปัจจุบันยังไม่พบ job ใหม่หลังการกดครั้งล่าสุด

[ตรวจ Trace] [ลองใหม่] [ส่งเป็น Feedback]
```

If the issue is likely user guidance rather than product failure, Assistant should answer from Help and offer the relevant article/action.

If the issue requires developer diagnosis, create Feedback with the context package rather than asking the user to retype everything.

---

## 149. Existing Help Panel Migration

Migration SHOULD reuse existing UI infrastructure where practical:

```text
HelpButton / HelpPanel primitives
        ↓
UniversalAssistantLauncher / UniversalAssistantPanel
```

Reusable behaviors may include:

- side-panel shell,
- resizing,
- open/close/minimize,
- language switch,
- topic rendering,
- related-topic graph,
- contextual current-page logic.

Do not delete old Help components until the new Assistant meets behavioral parity and migration telemetry proves stability.

Recommended staged rollout:

1. Assistant coexists behind feature flag.
2. Help button routes into Assistant `entry_mode=help` for pilot users.
3. Feedback launcher routes into Assistant `entry_mode=feedback` or opens Report Problem action.
4. legacy contextual Help panel entry is retired after parity verification.
5. full `/help` pages remain.

---

## 150. Source-Code Access Boundary

Universal Assistant MUST be useful without broad source-code access.

For end-user product questions:

- use Help RAG,
- current Page Context,
- Capability metadata,
- Operational Broker,
- authorized user/project data.

Source-code tools, repository connectors, logs, or developer diagnostics may exist for authorized Developer/Admin workflows, but MUST be separate capabilities with explicit permissions and must not be silently invoked for normal users.

The Assistant must never claim it “checked the source code” unless an authorized source-code capability was actually invoked and traced.

---

## 151. WebMCP Readiness and Future Adapter

WebMCP MUST be treated as an optional future interoperability layer, not the foundation of Feature 198.

Current internal architecture:

```text
Universal Assistant
    ↓
Page Context Registry
    ↓
Page Capability Adapter
    ↓
SmartAIHub internal page tools / capabilities
```

Future:

```text
Page Capability Adapter
    ├─ SmartAIHub Assistant
    └─ WebMCP Adapter
```

Requirements:

1. SmartAIHub-owned page capability contracts stabilize before WebMCP exposure.
2. WebMCP metadata must not override platform permission/system policy.
3. Third-party or page-provided text is untrusted for prompt-injection purposes.
4. Avoid blind DOM automation where structured page capabilities exist.
5. WebMCP protocol/version is governed under Section 132.
6. No MVP acceptance criterion may require browser support for WebMCP.

---

## 152. Universal Assistant Security and Privacy

Context access is capability access.

Mandatory controls:

- tenant isolation,
- current-user ACL,
- role-based field allowlists,
- no hidden state leakage,
- no source-code access by default,
- no cross-tab privileged context inheritance without authorization,
- context snapshot size limits,
- context freshness/versioning,
- secret/PII redaction in traces,
- screenshot capture disabled by default unless explicitly required by policy/workflow,
- page action permissions mapped to existing Permission Engine.

When current page and backend permission disagree, backend authorization wins.

---

## 153. Additional Data / API Contracts for Contextual Assistant

### 153.1 `PageContextEnvelope`

Versioned SmartAIHub-owned schema. Never persist arbitrary framework objects as the contract.

### 153.2 `HelpEvidence`

Should include:

- `topic_id`,
- locale,
- title/slug,
- chunk/reference,
- score components when available,
- source version/hash,
- page relevance,
- citation/provenance handle.

### 153.3 `FeedbackContextPackage`

Structured, redacted diagnostic attachment linked to existing Feedback/Ticket entity.

### 153.4 `AssistantSurfaceSession`

If required to link full Chat and drawer sessions, include:

- conversation/orchestration refs,
- originating surface/page,
- current context snapshot ref,
- no duplicate message history store if the existing Chat conversation model can be reused.

---

## 154. Contextual Assistant / Help Observability

Add metrics:

- Assistant launcher open rate,
- Help-question resolution rate,
- Help retrieval hit/no-hit rate,
- Help retrieval p95,
- current-page context utilization rate,
- clarification rate for contextual questions,
- route from Help → action,
- route from troubleshooting → Feedback,
- Feedback auto-context completeness,
- Help drift signals by topic,
- Help indexing lag/failure count,
- source-code capability invocation count by role (should be zero for ordinary Help flows),
- screenshot usage rate,
- token/context size by context tier.

Trace events SHOULD indicate which context tier and Help sources were used.

---

## 155. Updated Implementation Sequence

The following work is normative in addition to Phases 0–12:

### 155.1 Phase 0 additions
- audit current Help Center, Help Panel, Chat Help injector, Feedback launcher/tickets,
- verify screenshot runtime wiring,
- map current page identifiers and reusable UI panel primitives.

### 155.2 Phase 2 additions — Help Retrieval
- add `HELP` scope,
- index 84 EN + 84 TH current topics (or actual audited counts at implementation time),
- pair locales by `topic_id`,
- migrate Help search/injection toward Retrieval Broker,
- expose indexing health.

### 155.3 Phase 3 additions — Page Context
- define `PageContextEnvelope v1`,
- implement registry for first priority surfaces,
- send context to both full Chat and Assistant,
- implement context allowlist/security tests.

### 155.4 New Interaction milestone — Universal Assistant
Implement after shared orchestration contracts are stable enough to avoid a separate backend:

- global launcher,
- side panel / mobile responsive view,
- contextual suggestion chips,
- page-context indicator,
- inline Help article rendering,
- shared conversation/orchestration runtime,
- Report Problem transition.

### 155.5 Feedback milestone
- diagnostic context package,
- expected-vs-actual troubleshooting,
- trace/job linking,
- AI triage,
- existing Ticket persistence integration.

### 155.6 Later WebMCP milestone
Only after Page Capability Adapter is proven:
- expose safe page capabilities through WebMCP adapter where supported,
- add protocol-security tests,
- do not replace internal contracts.

---

## 156. Additional Test Requirements

### 156.1 Help Retrieval Tests

- TH question finds correct TH topic.
- EN question finds correct EN topic.
- TH falls back to EN evidence when TH content lacks sufficient evidence, while answer remains Thai.
- page boost improves current-page Help topic rank without forcing irrelevant result.
- ACL/visibility respected.
- deleted/changed Help projection updates correctly.

### 156.2 Page Context Tests

- “ตรงนี้คืออะไร?” resolves from focused component on supported page.
- “งานตัวบนทำไมยังไม่เสร็จ?” resolves visible job ref then re-reads authoritative `worker_jobs` state.
- hidden DOM/user-inaccessible data is not placed in envelope.
- stale context version causes safe refresh/revalidation.
- Assistant works when page context is unavailable by falling back to ordinary clarification/retrieval.

### 156.3 Feedback Tests

- unresolved troubleshooting can create ticket with trace/job/page refs.
- ticket excludes secrets and unrelated conversation content.
- user need not re-enter already known problem description.
- AI triage is marked as analysis, not verified root cause.

### 156.4 Cross-Surface Tests

- open Assistant on Dashboard, continue same conversation in full Chat when user chooses “Open in Chat”.
- long job started from Assistant continues after panel closes.
- returning to page restores task card/trace reference without duplicating job.

### 156.5 Help Drift Tests

- changed page registry vs stale Help description can generate drift candidate.
- drift signal never edits Help automatically without governed approval.

---

## 157. Additional Acceptance Scenarios

### Scenario 13 — Contextual Help Without Source Code

User is on Video Editor and asks “ตรงนี้ทำอะไร?”.

Expected:
- Page Context identifies the focused/selected component,
- Help RAG retrieves official relevant topic,
- answer cites/links Help evidence,
- no source-code capability is invoked.

### Scenario 14 — Under-Specified Current-Page Operational Question

User on Dashboard asks “งานตัวบนทำไมยัง Running?”.

Expected:
- current visible job reference is resolved,
- current job state/events come from Operational Broker,
- Help may explain expected lifecycle if useful,
- answer distinguishes actual state from documented behavior.

### Scenario 15 — Help → Troubleshooting → Feedback

User says “กด Render แล้วไม่เกิดอะไร”.

Expected:
- Help supplies expected Render behavior,
- trace/Operational Broker checks actual job creation,
- if unresolved, Assistant offers `Report problem`,
- created Feedback carries authorized page/trace/job/context automatically.

### Scenario 16 — Full Help Center Preservation

User opens `/help` and searches semantically.

Expected:
- Help Center remains available,
- search uses or is compatible with unified Help retrieval,
- deep links/bookmarks continue to work.

### Scenario 17 — Page Context Privacy

Normal user opens a page containing admin-only data not visible to them.

Expected:
- Page Context contains no admin-only fields/refs,
- Assistant cannot retrieve them through context,
- backend authorization blocks direct capability attempts.

### Scenario 18 — Future WebMCP Independence

WebMCP/browser support is unavailable.

Expected:
- Universal Assistant, Page Context, Help RAG, Page Capability Adapter, and core actions continue to function normally.

---

## 158. Updated Production Definition of Done — Contextual Assistant / Help

Feature 198 is not production-complete until all applicable items pass:

- [ ] one shared orchestration runtime serves full Chat and Universal Assistant,
- [ ] global launcher works on designated priority pages,
- [ ] existing Help corpus is indexed through Retrieval Broker,
- [ ] Help provenance/citations can be inspected,
- [ ] Help Center `/help` and `/help/:slug` remain functional,
- [ ] Page Context Envelope is versioned and permission-filtered,
- [ ] no raw DOM/source-code dependency for ordinary Help,
- [ ] contextual references can be resolved on priority surfaces,
- [ ] troubleshooting can compare documented expected behavior with actual system state,
- [ ] Feedback flow can reuse authorized conversational/page/trace context,
- [ ] existing Feedback/Ticket backend remains authoritative for support cases,
- [ ] Help indexing is incremental and observable,
- [ ] documentation drift can be detected without auto-publishing changes,
- [ ] current Help Panel/Feedback migration has feature flags and rollback,
- [ ] screenshot capture is either verified end-to-end or clearly disabled/unavailable,
- [ ] Assistant works without WebMCP,
- [ ] WebMCP adapter, if enabled, is policy-gated and version-governed,
- [ ] accessibility/responsive tests pass for drawer/mobile surfaces,
- [ ] context/traces redact secrets and unauthorized fields,
- [ ] page-context freshness/navigation invalidation tests pass,
- [ ] users can inspect/disable contextual page sharing without breaking ordinary Chat,
- [ ] Help content-safety/prompt-injection tests pass,
- [ ] Feedback diagnostic preview/optional-attachment consent is implemented,
- [ ] multi-route side-effect isolation prevents duplicate real-world actions,
- [ ] evaluator versions/calibration/disagreement policies are recorded,
- [ ] trajectory/replay version bundle is sufficient for faithful/current-stack comparison,
- [ ] generated helper runtime/dependencies are pinned for promotion,
- [ ] MCP revoke/expiry immediately blocks new executions,
- [ ] deletion reconciliation verifies removal/tombstoning of derived copies.

---

## 159. Second Ten-Pass Gap Review — Contextual Assistant / Help Integration

A second ten-pass review was performed after adding the Universal Assistant + Help integration requirements. Gaps found were incorporated directly above.

### Pass 1 — Product Surface Unification
**Checked:** Chat vs Help vs Feedback duplication.  
**Gap fixed:** one Assistant entry surface with shared runtime; Help Center/Ticket backends remain separate sources of truth.

### Pass 2 — Help Data Reuse
**Checked:** risk of building a second Help database.  
**Gap fixed:** existing Markdown corpus remains canonical; only retrieval projections/indexes are added.

### Pass 3 — RAG Architecture Consistency
**Checked:** risk of another isolated Help RAG pipeline.  
**Gap fixed:** `HELP` added as Retrieval Broker source; `helpContextInjector` migrates into an adapter.

### Pass 4 — Context Quality / Token Cost
**Checked:** raw DOM/screenshots causing context bloat.  
**Gap fixed:** Page Context tiers and structured envelope; screenshots only when needed.

### Pass 5 — Permission / Privacy
**Checked:** page context exposing hidden/admin/other-tenant data.  
**Gap fixed:** explicit field/ref allowlists, backend authorization supremacy, no hidden DOM/source-code default.

### Pass 6 — Troubleshooting / Feedback Continuity
**Checked:** user having to explain an issue twice.  
**Gap fixed:** Feedback Context Package + Help expected behavior + Trace/System actual behavior.

### Pass 7 — Documentation Freshness
**Checked:** authoritative Help becoming stale.  
**Gap fixed:** Help provenance/version metadata, incremental indexing, drift detection and governed update candidates.

### Pass 8 — Existing UI Migration
**Checked:** discarding functional Help Panel implementation.  
**Gap fixed:** staged reuse/migration of HelpButton/HelpPanel primitives; full Help Center retained.

### Pass 9 — WebMCP Coupling
**Checked:** experimental/future browser capability becoming architectural dependency.  
**Gap fixed:** Page Capability Adapter is internal contract; WebMCP is optional future adapter.

### Pass 10 — Production Verification
**Checked:** backend-only completion and screenshot uncertainty.  
**Gap fixed:** explicit UI DoD, contextual acceptance scenarios, runtime audit requirement for screenshot support, cross-surface tests.

No contextual-assistant/Help integration gap found in these ten passes requires changing the core three-plane ownership model (LangGraph decision plane, Agents SDK cognitive plane, `worker_jobs` durable execution plane) before implementation.

---


## 160. Page Context Freshness, Binding, and User Control

Page Context is ephemeral evidence, not durable truth. Every contextual request MUST bind to an authorized snapshot identified by `page_instance_id`, `captured_at`, and `context_fingerprint` (or equivalent).

Required behavior:

1. navigation, selected-entity changes, workspace/project changes, or permission changes invalidate affected context;
2. server-side tools re-authorize entity refs and fetch live Tier B state before sensitive reads/actions;
3. a stale context snapshot may guide clarification but MUST NOT authorize execution;
4. full Chat and drawer may share conversation identity while keeping each surface's current page snapshot explicit;
5. the user can disable page context and inspect a safe summary of context categories being used.

---

## 161. Execution Provenance and Replay Version Bundle

Every orchestration run SHOULD produce a compact immutable `execution_version_bundle` containing, where applicable:

- LangGraph graph/version/hash,
- routing/source-policy version,
- prompt/instruction bundle version,
- Cognitive Orchestrator adapter version,
- model/provider identifier and parameters relevant to reproducibility,
- selected Skill/Flow/Helper/MCP capability versions or manifest hashes,
- retrieval/reranking policy version and embedding/index generation,
- evaluator/rubric version,
- sandbox/runtime image version for generated code.

This bundle is metadata; secrets and prohibited user payloads are excluded. It supports failure diagnosis, historical replay, regression comparison, and rollback analysis.

---

## 162. Help Content Integrity and Retrieval Safety

Although Help is authoritative product documentation, retrieved Help text MUST be processed as evidence/data, not control instructions.

Controls:

- sanitize/normalize Markdown and embedded HTML,
- do not execute scripts/active content,
- prevent documentation text from overriding system/policy/tool instructions,
- retain source path/hash/commit/version provenance,
- flag unexpected bulk content/hash changes for review,
- test prompt-injection strings embedded in Help articles,
- expose canonical Help links/citations so users and operators can inspect the source.

---

## 163. Multi-Route Branch Isolation and Commit Protocol

Multi-route exploration separates **evaluation** from **commit**.

- Read-only/computational/artifact branches may run in parallel within budget.
- Branches with `WRITE`, `DESTRUCTIVE`, `FINANCIAL`, `EXTERNAL_COMMUNICATION`, `PHYSICAL_WORLD`, or `SECURITY_SENSITIVE` side effects MUST remain plan-only/simulated/sandboxed until selected and approved.
- Each branch receives its own idempotency namespace.
- The commit step records the selected route and revalidates permissions/freshness immediately before execution.
- If real multi-execution is the user's explicit goal, treat each execution as separately approved/traceable rather than as evaluator exploration.

---

## 164. Evaluator Quality, Uncertainty, and Ground-Truth Governance

Evaluation is itself a versioned capability and can be wrong. The platform MUST:

- version rubrics, prompts/models, weights, deterministic metric code, and thresholds,
- preserve per-dimension scores before aggregation,
- record judge disagreement/uncertainty,
- maintain calibration/benchmark fixtures for important domains,
- prohibit silent auto-selection/promotion when uncertainty exceeds policy threshold,
- distinguish user preference from factual correctness,
- support re-evaluation after evaluator upgrades.

Learning Center SHOULD surface evaluator drift and disagreement trends.

---

## 165. Capability Evolution Ownership and Conflict Governance

Every learned/generated/improved artifact declares scope and ownership.

Rules:

- do not modify marketplace/third-party capabilities in place without maintainer authority; create a tenant fork/overlay/candidate instead,
- use optimistic locking/version checks for concurrent improvement proposals,
- detect near-duplicate Skill/Flow/Route candidates before creation,
- breaking schema/contract changes require migration/version semantics,
- global promotion has stronger approval/evidence requirements than personal/tenant promotion,
- all promotions retain rollback and lineage metadata.

---

## 166. Generated Helper Build Integrity and Lifecycle

Ephemeral generated code must not become a permanent capability merely because one execution succeeded. Promotion requires:

1. immutable source hash,
2. pinned runtime/dependency set,
3. security/static scan appropriate to language/runtime,
4. deterministic schema validation,
5. representative tests/replay,
6. explicit permission/egress manifest,
7. reproducible governed build artifact,
8. owner/scope/version assignment.

Expired ephemeral artifacts and sandboxes MUST be garbage-collected according to retention policy while preserving permitted lineage metadata.

---

## 167. MCP Credential, Identity, and Capability-Drift Lifecycle

Connection state must distinguish at least:

- healthy,
- degraded,
- auth-expired,
- revoked/disconnected,
- capability-changed/review-required,
- quarantined.

OAuth/token refresh, revocation, scope changes, server identity changes, and tool-list/risk-class drift MUST invalidate relevant caches and may require re-approval. Disconnect/revoke immediately blocks new tool execution. The Connections UI MUST show required remediation rather than reporting such connections merely as generic failures.

---

## 168. Feedback Diagnostic Consent and Data Minimization

The Assistant SHOULD resolve issues without creating a Ticket when possible. When escalating:

- show a concise preview of diagnostic categories to be attached,
- let users remove optional screenshot/attachments where policy permits,
- capture only issue-relevant conversation summary rather than full history,
- redact secrets/PII according to role/tenant policy,
- record consent/policy basis for optional visual capture,
- separate AI triage hypotheses from verified facts.

---

## 169. Deletion and Derived-Data Reconciliation

Deletion/retention implementation MUST maintain a derivation map or otherwise discover affected projections so source deletion can propagate to:

- vector/index projections,
- cached evidence/context snapshots,
- trace payload attachments,
- evaluation/replay fixtures containing deleted content,
- generated-helper fixtures,
- Feedback diagnostic attachments.

Where deletion is legally/policy-exempt, retain only what is explicitly required and mark the lineage state. Periodic reconciliation MUST report orphaned derived content and failed deletion propagation.

---

## 170. Help Retrieval Cutover and Parity Gate

Migration from `helpContextInjector` to broker-backed Help retrieval requires a measurable parity gate. During shadow rollout, compare legacy vs new retrieval on representative EN/TH/contextual queries. Required dimensions include relevant-topic hit rate, locale correctness, no-result rate, p95 latency, token/context size, provenance completeness, and user correction/escalation rate.

Legacy retirement requires:

- thresholds defined from Phase 0 baseline,
- sustained passing telemetry for a configured window,
- rollback flag proven in staging/canary,
- no unresolved permission/locale regression.

---

## 171. Additional Tests Introduced by Third Gap Review

Add automated/integration tests for:

- page navigation invalidating stale context snapshots,
- selected entity change on same route changing context fingerprint,
- `What can AI see?` summary and disable-current-page-context control,
- Help prompt-injection strings not changing orchestration policy,
- destructive multi-route candidates not executing before final selection,
- evaluator disagreement forcing user/human/policy resolution,
- concurrent Skill/Flow improvement proposals preserving both candidates safely,
- generated helper promotion failing when runtime/dependencies are unpinned,
- MCP token revoke immediately blocking subsequent calls,
- source deletion propagating to retrieval/evaluation/feedback derivatives,
- faithful replay vs current-stack replay being labeled distinctly,
- Help legacy-vs-new shadow parity metrics and rollback.

---

## 172. Third Twelve-Pass Gap Review — Production Hardening

A new review was performed after the contextual-assistant/Help integration. All gaps below were incorporated into normative requirements above.

### Pass 1 — Page Context Freshness
**Gap:** contextual refs could remain valid in graph state after navigation/entity change.  
**Fixed:** snapshot binding, page instance/fingerprint, expiry/revalidation, server-side authoritative re-read.

### Pass 2 — Replay / Diagnosis Reproducibility
**Gap:** trace records lacked a complete version bundle to explain changed behavior after upgrades.  
**Fixed:** graph/policy/prompt/model/capability/retrieval/evaluator/runtime version provenance and two replay modes.

### Pass 3 — Help Corpus Trust Boundary
**Gap:** `HELP` was authoritative but content-safety semantics were not explicit.  
**Fixed:** Help is evidence/data, sanitized and unable to override platform instructions; source integrity is recorded.

### Pass 4 — Multi-Route Side Effects
**Gap:** parallel candidate routes could accidentally duplicate irreversible/external actions.  
**Fixed:** branch isolation, plan/simulation before commit, branch idempotency, single selected commit path.

### Pass 5 — Evaluator Reliability
**Gap:** evaluation dimensions existed but evaluator calibration/version drift was underspecified.  
**Fixed:** versioned evaluators, calibration fixtures, disagreement/uncertainty handling, re-evaluation policy.

### Pass 6 — Capability Evolution Ownership
**Gap:** automatic improvement could conflict with third-party ownership or concurrent candidate updates.  
**Fixed:** scope/owner, fork/overlay rules, optimistic locking, duplicate detection, contract migration and rollback.

### Pass 7 — Generated Helper Reproducibility
**Gap:** sandbox safety existed but promoted helpers could still depend on unpinned temporary environments.  
**Fixed:** immutable source hash, runtime/dependency locks, governed reproducible build and lifecycle cleanup.

### Pass 8 — MCP Credential / Drift Lifecycle
**Gap:** connection health existed but revocation, scope drift and immediate cache invalidation were incomplete.  
**Fixed:** explicit lifecycle states, refresh/revoke/quarantine, scope/identity/tool drift handling and UI remediation.

### Pass 9 — Feedback Privacy / Consent
**Gap:** diagnostic context capture lacked a clear user preview/removal flow for optional sensitive attachments.  
**Fixed:** attachment-category preview, opt-in screenshot, minimization and redaction requirements.

### Pass 10 — Deletion Propagation
**Gap:** source deletion rules did not explicitly cover all derived trace/evaluation/helper/feedback copies.  
**Fixed:** derived-data reconciliation and tombstone/minimal-lineage semantics.

### Pass 11 — Assistant Context Transparency UX
**Gap:** users could not clearly inspect or disable current-page context.  
**Fixed:** page-context indicator, `What can AI see?`, per-turn/conversation context disable, navigation invalidation.

### Pass 12 — Help Retrieval Cutover Safety
**Gap:** migration path did not require measurable parity against the existing Help injector before retirement.  
**Fixed:** shadow comparison, release thresholds, sustained telemetry and proven rollback gate.

No remaining gap found in this review requires changing the established ownership model: LangGraph remains orchestration/decision state, OpenAI Agents SDK remains the cognitive/agentic layer, authoritative evidence remains in Brokers/source systems, and `worker_jobs` remains durable execution truth.


---

## 173. Cross-Tenant Isolation for Derived State, Cache, and Learning Artifacts

Tenant isolation MUST apply not only to primary SQL rows and Library ACLs, but also to every derived or cached artifact created by Feature 198.

The isolation boundary MUST cover at least:

- Retrieval Broker caches and vector projections,
- Page Context snapshots,
- hydrated tool/capability caches,
- orchestration checkpoints,
- trajectory events and trace payloads,
- evaluation fixtures and benchmark datasets,
- learned routes and route statistics,
- generated helper fixtures/build artifacts,
- MCP connection metadata and discovery caches,
- feedback diagnostic packages,
- Help personalization/context boosts where user/tenant state is involved.

Requirements:

1. Every cache key that can vary by tenant/ACL MUST include the effective tenant/security scope or use a cache physically isolated by scope.
2. A global/shared learned route MUST contain no tenant-private examples, prompt fragments, asset identifiers, or secrets.
3. Promotion from personal/tenant scope to global scope MUST run a de-identification and provenance audit.
4. Evaluation datasets derived from tenant data MUST remain tenant-scoped unless explicit governed permission allows wider use.
5. Trace Explorer, Learning Center, Evaluation UI, and Capabilities UI MUST apply server-side authorization rather than relying on client filters.
6. Background indexers/reconciliation jobs MUST carry tenant scope explicitly and reject unscoped writes for tenant-owned projections.
7. Cross-tenant negative tests are release-blocking.

A capability or route may be globally reusable while its historical examples remain private. The platform SHOULD separate reusable logic/metadata from private evidence/fixtures.

---

## 174. Multi-Step Side Effects, Compensation, and Saga Semantics

Idempotency prevents duplicate execution, but it does not undo a valid side effect that later becomes undesirable because a downstream step fails. Multi-step workflows with external writes therefore MUST define compensation behavior where possible.

Example:

```text
Create remote draft
  → upload asset
  → publish post
  → update SmartAIHub record
```

If `publish post` fails after the remote draft and upload succeeded, the orchestration state must not simply report a generic failure.

Each side-effecting step MUST declare where applicable:

- `commit_class`: read-only / reversible-write / irreversible-write,
- idempotency semantics,
- compensation capability/reference,
- compensation deadline/limitations,
- externally-created resource IDs,
- whether manual intervention is required.

The orchestration layer MUST support states such as:

```text
COMPLETED
PARTIALLY_COMPLETED
COMPENSATING
COMPENSATED
COMPENSATION_FAILED
MANUAL_RECOVERY_REQUIRED
```

Rules:

1. LangGraph coordinates compensation decisions/state; authoritative external status is re-read before compensating.
2. `worker_jobs` remains the execution truth for durable compensation jobs.
3. Irreversible actions cannot be described as rolled back when only internal state was reverted.
4. Compensation itself is traced, permission-checked, idempotent where possible, and visible in the UI.
5. Cancel after commit MUST clearly distinguish `cancel future steps` from `undo completed effects`.
6. For providers without compensation APIs, the UI MUST show the residual external state and a manual recovery action/instruction.

The Plan Card SHOULD identify irreversible or only-partially-reversible steps before approval.

---

## 175. Backpressure, Rate Limits, Circuit Breakers, and Degraded-Mode Routing

Feature 198 MUST remain predictable when providers, MCP servers, vector backends, model providers, Runners, or internal brokers become slow or overloaded.

Every high-volume external/provider adapter SHOULD expose normalized health signals:

- healthy,
- rate-limited,
- degraded,
- circuit-open,
- unavailable,
- recovering.

Required controls:

1. Per-tenant and platform-wide concurrency limits for expensive cognitive/evaluation executions.
2. Bounded queues for non-durable in-process work; overflow MUST fail or defer explicitly rather than consume unbounded memory.
3. Respect provider `Retry-After`/rate-limit semantics where available.
4. Exponential backoff with jitter for retryable provider failures.
5. Circuit breakers for repeatedly failing providers/MCP endpoints.
6. Bulkhead isolation so one unhealthy integration cannot exhaust the entire Chat/Assistant runtime.
7. Admission control/load shedding for low-priority background evaluation/replay work before interactive Chat is degraded.
8. Graceful degradation rules, for example:
   - vector unavailable → allowed keyword fallback if policy permits,
   - preferred model unavailable → governed cognitive fallback,
   - evaluator unavailable → return result without unsafe automatic promotion,
   - MCP unavailable → explain connection state rather than fabricate data.
9. Provider health and active circuit state MUST be observable in Admin/Developer surfaces.
10. Retry storms MUST be prevented across LangGraph, broker adapters, `worker_jobs`, and provider SDKs; only one layer should own a given retry policy unless explicitly coordinated.

Fallback must preserve source/provenance labels and MUST NOT silently change the semantic risk class of an action.

---

## 176. SmartAIHub-Owned Schema Evolution for Graph State, Events, and Checkpoints

Long-lived workflows may survive application deployments. Therefore orchestration state, trajectory events, CognitiveResult payloads, Page Context envelopes, and durable checkpoint formats MUST be explicitly versioned.

Required fields/contracts SHOULD include a stable SmartAIHub-owned schema version such as:

```text
orchestration_state_schema_version
trajectory_event_schema_version
cognitive_result_schema_version
page_context_schema_version
execution_plan_schema_version
```

Rules:

1. Do not persist framework-private LangGraph/Agents SDK objects as the only durable representation.
2. Graph code/version and state-schema version are separate concepts and both MUST be recorded.
3. Deployments that change durable state shape require forward migration, compatible reader logic, or an explicit draining strategy.
4. Resume MUST detect incompatible checkpoints before executing any new side effect.
5. Unsupported old checkpoints move to `MIGRATION_REQUIRED`/manual recovery, not silent failure.
6. Event consumers MUST tolerate additive fields and reject/route incompatible breaking versions deterministically.
7. State migrations themselves MUST be idempotent and auditable.
8. Feature flags/rollback plans MUST consider whether a newer deployment has already written state unreadable by the old version.

A staging test MUST exercise pause on version N → deploy N+1 → migrate/resume, plus rollback compatibility where claimed.

---

## 177. Time Semantics, Relative Dates, and Clock Consistency

Natural-language requests frequently contain relative temporal references such as `เมื่อวาน`, `เมื่อคืน`, `ล่าสุด`, `30 นาทีที่ผ่านมา`, or `ก่อนประชุม`. Incorrect time interpretation can select the wrong asset/job even when retrieval itself is correct.

The Request Understanding / Evidence Planner MUST normalize temporal constraints into an explicit time object containing at least:

- original phrase,
- resolved start/end timestamps,
- timezone,
- resolution timestamp (`resolved_at`),
- confidence/ambiguity where relevant,
- calendar semantics used for phrases such as `last night`.

Requirements:

1. Resolve user-facing relative time in the effective user/workspace timezone, not server UTC by default.
2. Persist normalized absolute timestamps in the trajectory so replay does not reinterpret `yesterday` relative to the replay date.
3. Operational comparisons use authoritative server/database timestamps.
4. Services SHOULD use synchronized clocks; clock-skew monitoring is required where lease/heartbeat/job age decisions depend on time.
5. UI shows absolute time on hover/detail where relative labels such as `35 minutes ago` could become ambiguous.
6. Ambiguous time ranges that materially affect destructive/high-cost actions require search-before-clarify or user clarification.
7. Locale/date parsing must not silently interchange day/month order.

---

## 178. Encryption, Credential Rotation, and Secret Lifecycle

Section 85 secret redaction remains mandatory and is extended with lifecycle controls.

Requirements:

- credentials/tokens MUST be encrypted at rest using the platform-approved secret store/KMS or equivalent,
- transport of credentials and authorization-sensitive tool calls MUST use TLS or an equivalently secure internal channel,
- secret access SHOULD be least-privilege and auditable,
- rotation/revocation MUST invalidate relevant connection/session caches,
- old credential versions MUST not remain in trajectory/debug payloads,
- temporary sandbox credentials, when explicitly permitted, MUST be short-lived/scoped and injected through the governed secret channel rather than model-visible text,
- connection sharing MUST distinguish personal vs tenant/service credentials,
- backup/restore procedures MUST preserve encryption/key-management guarantees and document key-loss behavior.

The platform MUST define who can view connection metadata, rotate credentials, reconnect integrations, and transfer connection ownership.

---

## 179. Prompt / Model Registry and Governed Cognitive Fallback

Execution provenance records prompt/model versions, but production operation also requires a registry that defines what versions are allowed and how fallback occurs.

The platform SHOULD maintain a governed registry for:

- cognitive orchestrator instruction/prompt version,
- synthesis prompt version,
- specialist-agent prompt/profile versions,
- evaluation/judge prompt versions,
- supported model/provider configuration,
- tool-search/deferred-loading settings,
- safety/permission policy bundle version.

Rules:

1. Prompt changes are versioned and can be canaried/replayed like other cognitive changes.
2. A fallback model/provider MUST satisfy the required features for the current node (structured output, tool calling, MCP/tool search, context size, etc.).
3. Fallback MUST NOT silently downgrade a high-risk structured step to unconstrained free text.
4. Model/provider change is recorded in the trajectory and visible in Developer Trace.
5. Provider fallback chains are bounded; recursive fallback loops are prohibited.
6. If no safe compatible model is available, return/defer explicitly rather than improvising with an incompatible model.
7. Evaluation comparing model/prompt candidates MUST label version differences and avoid mixing incomparable judges without normalization/re-evaluation.

---

## 180. Budget, Quota, and Admission-Control Enforcement

Cost governance MUST be enforceable before and during execution, not only observable afterward.

Define configurable budgets by request/user/tenant/workspace where appropriate for:

- LLM tokens/cost,
- cognitive rounds,
- candidate-route count,
- external API/MCP cost,
- generated media cost,
- Worker/Runner compute,
- evaluation/replay spend,
- wall-clock duration.

Required behavior:

1. Planner estimates expected cost/risk class before high-cost execution where feasible.
2. LangGraph enforces hard/soft budgets and records the budget policy version.
3. On soft threshold: choose cheaper route, request approval, or reduce optional exploration according to policy.
4. On hard threshold: stop scheduling new costly steps while preserving already-committed external work/state.
5. Budget exhaustion becomes a first-class partial-result reason, not a generic provider error.
6. Background replay/learning uses separate quotas and lower priority than interactive user work.
7. Tenant administrators can inspect top cost drivers by route/capability/model without exposing another tenant's data.
8. Revenue/credit accounting remains integrated with the existing SmartAIHub credit system.

---

## 181. Evidence Freshness, Snapshot Consistency, and Claim Provenance

Evidence can be individually correct yet collectively inconsistent when sources are read at materially different times. Evidence planning MUST therefore record freshness and snapshot semantics.

Every evidence item SHOULD carry where applicable:

```text
source_type
source_ref
observed_at / source_updated_at
retrieved_at
freshness_policy
version/etag/revision
ACL/tenant scope
```

Rules:

1. Operational/live claims use a short freshness policy and may require re-read immediately before a consequential action.
2. If a plan combines related records that require consistency, prefer a single DB transaction/snapshot or record the read versions/timestamps.
3. Cached evidence beyond its TTL cannot be silently represented as current.
4. Final synthesis distinguishes current state, historical state, inferred/semantic evidence, and external web/research evidence.
5. Citations/source chips SHOULD point to canonical inspectable sources where permissions allow.
6. A claim that materially conflicts across authoritative sources triggers reconciliation/uncertainty rather than arbitrary selection.
7. Page Context is supporting context, not authoritative operational state.
8. Dynamic helpers/agents may consume evidence references but MUST NOT strip provenance from resulting decision artifacts.

---

## 182. Audit Integrity, Manual Override, and Emergency Kill Switches

Traceability is only useful if important audit events cannot be silently rewritten.

Security/audit-relevant events SHOULD be append-only or protected by tamper-evident controls appropriate to the existing platform, including at least:

- permission approvals/denials,
- production capability promotions/rollbacks,
- MCP connection/credential lifecycle changes,
- destructive/external commits,
- manual overrides,
- kill-switch operations,
- deletion/legal-retention exceptions,
- evaluator/route promotion decisions.

The platform MUST support governed emergency controls at appropriate scopes, for example:

- disable cognitive orchestration,
- disable generated helpers,
- disable one capability/version,
- disable one MCP connection/provider,
- stop candidate rollout,
- disable automatic learning promotions,
- pause a tenant's external-action execution while preserving read-only Help/Chat where possible.

Requirements:

1. Kill switches are independent of model reasoning and take effect server-side.
2. Emergency disable invalidates relevant caches/hydrated tools.
3. Manual override requires actor/reason/time/scope and appears in Trace/Learning/rollout audit where relevant.
4. Recovery from an emergency disable is also audited.
5. UI must distinguish `disabled by policy/admin` from ordinary provider failure.

---

## 183. Disaster Recovery, Backup, and Restore Semantics

Feature 198 adds durable orchestration/checkpoint, capability, trajectory, evaluation, and connection metadata that require explicit recovery planning.

Phase 0 MUST inventory existing backup/HA policy and define RPO/RTO targets for at least:

- orchestration runs/checkpoints,
- Capability Registry/versions,
- MCP connection metadata (credentials handled by secret-store policy),
- trajectory/evaluation metadata,
- learned routes/flows/Skill candidates,
- Help index projections (rebuildable),
- vector/search projections (rebuildable from canonical sources where designed),
- `worker_jobs` integration state according to Feature 195, implemented today through the Feature 186 control-plane code paths.

Restore rules:

1. Canonical data vs rebuildable projection MUST be documented.
2. After restore, orchestration MUST reconcile `worker_jobs` and external task state before resuming.
3. A restored checkpoint cannot re-submit a destructive step merely because post-checkpoint acknowledgement was lost; use idempotency/external reconciliation.
4. Capability indexes and Help/vector projections should be rebuildable and parity-checked rather than treated as unrecoverable truth.
5. Restore drills MUST include at least one in-flight durable workflow and one MCP/external task.
6. Lost/unrecoverable credential material moves connections to `Needs attention`; do not substitute empty/unknown credentials silently.

---

## 184. WebMCP / Browser-Origin Security and Page-Tool Trust Boundary

WebMCP remains a future adapter, but the internal Page Capability Adapter MUST already enforce browser-origin security assumptions so later exposure does not create a second security model.

Requirements for page-exposed capabilities:

- bind tools to an expected SmartAIHub origin/page identity,
- do not trust arbitrary iframe/embedded third-party content as SmartAIHub page context,
- apply CSP/frame/origin policy according to the web application's security baseline,
- classify page-tool inputs as untrusted user/page data,
- validate all action arguments server-side,
- require normal permission/approval for consequential actions even if invoked from page-local tools,
- avoid exposing hidden/admin controls merely because their DOM/components exist,
- prevent a webpage/tool description from redefining system instructions,
- record page origin/page instance in the action trace,
- revalidate entity/route freshness immediately before side effects.

If WebMCP/browser support is disabled or unavailable, the internal Universal Assistant MUST remain fully functional through the Page Context / Page Capability APIs.

---

## 185. Realtime Disconnect, Offline UX, and Cross-Tab Conflict Handling

Streaming UI and long-running tasks must tolerate browser suspension, websocket/SSE reconnects, and multiple SmartAIHub tabs.

Requirements:

1. Realtime events carry monotonic sequence/version information or equivalent so the client can detect gaps/out-of-order events.
2. On reconnect, the UI rehydrates authoritative run/job state rather than assuming the last streamed event is current.
3. Duplicate events are safe to apply.
4. Approval prompts include current version/state and reject stale approvals.
5. Concurrent tabs acting on the same plan/job/approval use optimistic concurrency and display a resolved state such as `already approved`, `cancelled elsewhere`, or `plan superseded`.
6. Assistant drafts may be local, but durable execution state never depends on browser local storage.
7. The panel clearly distinguishes `connection lost` from `backend task failed`.
8. Completed jobs/results remain available after browser restart according to normal retention/access policy.

---

## 186. Experiment Statistics and Canary Decision Governance

Canary UI MUST not promote a candidate merely because a small sample shows a numerically higher score.

For automated or operator-assisted promotion, define per-domain evaluation policy containing:

- minimum sample size,
- observation duration,
- guardrail/error metrics,
- quality dimensions,
- cost/latency constraints,
- segmentation requirements (tenant/user/project/model/provider where relevant),
- stop/rollback thresholds,
- handling of inconclusive results.

Requirements:

1. Show sample counts and confidence/uncertainty, not only averages.
2. Avoid Simpson's-paradox-style aggregation by preserving important cohorts when material.
3. Never trade severe safety/permission/regression guardrails for a higher aggregate quality score.
4. An inconclusive experiment remains inconclusive; it does not auto-promote.
5. Sequential monitoring/early stop rules must be predefined to avoid arbitrary cherry-picking.
6. Evaluation/judge version changes during an experiment either freeze the judge version or split/re-evaluate the experiment.
7. User preference experiments are not automatically evidence of factual correctness.

---

## 187. Additional Tests and Release Gates Introduced by Fourth Gap Review

Add automated/integration/chaos tests for:

- cross-tenant cache key leakage and learned-route/evaluation isolation,
- personal/tenant route promotion to global scope stripping private evidence,
- partially completed external workflow entering compensation/manual-recovery states correctly,
- cancel-after-commit behavior distinguishing future cancellation from compensation,
- provider circuit breaker opening/recovering without retry storm,
- overload shedding background replay before interactive Chat,
- LangGraph checkpoint pause on schema N → deploy N+1 → migration/resume,
- rollback with newer checkpoint schema being rejected safely where incompatible,
- `เมื่อคืน`/`เมื่อวาน` resolution being pinned to the effective timezone and original execution time,
- credential revoke/rotation invalidating connection and authorization caches,
- sandbox secrets never appearing in prompt/trace,
- cognitive provider fallback preserving structured-output/tool requirements,
- hard cost/token budget halting optional exploration without corrupting committed state,
- stale operational evidence being re-read before destructive action,
- conflicting authoritative evidence producing uncertainty/reconciliation rather than fabricated certainty,
- emergency kill switch blocking a hydrated/cached capability immediately,
- restore of an in-flight workflow reconciling existing `worker_jobs` instead of duplicating execution,
- WebMCP/page-tool call from an unexpected origin being rejected,
- disconnect/reconnect recovering missed task events and rejecting stale approvals from another tab,
- canary with too-small/inconclusive sample refusing automatic promotion.

Release is blocked if any test demonstrates cross-tenant data exposure, duplicate irreversible execution after restore/resume, permission bypass, or inability to stop a disabled high-risk capability.

---

## 188. Additional Production Definition of Done — Fourth Gap Review

In addition to Sections 114 and 158, production readiness requires:

- [ ] derived caches/checkpoints/evaluations/learned artifacts are demonstrably tenant-isolated,
- [ ] side-effecting multi-step flows document compensation/manual recovery semantics,
- [ ] provider adapters have bounded retry/backpressure/circuit-breaker policy,
- [ ] durable graph/event/state schemas are versioned and migration-tested,
- [ ] relative time is normalized with timezone and persisted as absolute execution semantics,
- [ ] credential encryption/rotation/revocation lifecycle is tested,
- [ ] prompt/model configuration is governed/versioned and fallback-compatible,
- [ ] request/tenant cost and concurrency budgets are enforced, not merely reported,
- [ ] evidence freshness/provenance is available to final synthesis and trace inspection,
- [ ] kill switches/manual override controls operate independently of AI reasoning,
- [ ] backup/restore reconciliation has been drilled for in-flight work,
- [ ] page/WebMCP capability boundary enforces origin/server-side authorization,
- [ ] realtime reconnect/cross-tab conflicts are deterministic,
- [ ] canary promotion uses minimum evidence/guardrail policy rather than raw average score.

---

## 189. Fourth Thirteen-Pass Gap Review — Resilience, Governance, Recovery, and Egress

A further twelve-pass review was performed after Spec v3. Every gap below is incorporated into normative requirements above.

### Pass 1 — Cross-Tenant Derived State
**Gap:** primary authorization was defined, but derived caches, evaluation fixtures, learned routes, and checkpoint scope could still become leakage channels.  
**Fixed:** tenant-aware cache/state keys, private-evidence separation, governed scope promotion, release-blocking cross-tenant tests.

### Pass 2 — Multi-Step Side-Effect Recovery
**Gap:** idempotency/cancel semantics existed but there was no compensation/Saga contract for valid earlier side effects when later steps fail.  
**Fixed:** commit classes, compensation metadata/states, manual-recovery semantics, compensation trace and permission policy.

### Pass 3 — Overload and Provider Failure Containment
**Gap:** provider rate-limit error existed but system-level backpressure, bulkheads, circuit breakers, and load shedding were underspecified.  
**Fixed:** normalized provider health, bounded concurrency/queues, coordinated retry, degraded-mode routing and interactive-work priority.

### Pass 4 — Durable State Schema Evolution
**Gap:** dependency versions were governed, but old LangGraph/checkpoint/event payloads lacked a complete migration contract.  
**Fixed:** SmartAIHub-owned schema versions, checkpoint migration/drain rules, incompatible-state handling and deployment/rollback tests.

### Pass 5 — Temporal Interpretation
**Gap:** requests such as `เมื่อคืน` and `เมื่อวาน` could be semantically reinterpreted on a different timezone/replay date.  
**Fixed:** explicit normalized temporal constraints, timezone/resolution timestamp, absolute trajectory semantics and clock-skew requirements.

### Pass 6 — Secret Lifecycle Beyond Redaction
**Gap:** credentials were prohibited from context/trace but encryption, rotation, ownership transfer and sandbox secret injection were incomplete.  
**Fixed:** encryption/secret-store requirements, rotation/revoke cache invalidation, least-privilege access and short-lived sandbox secret rules.

### Pass 7 — Cognitive Prompt/Model Operational Governance
**Gap:** provenance recorded prompt/model versions but did not define allowed versions or safe model fallback.  
**Fixed:** prompt/model registry, canaryable prompt versions, feature-compatible bounded fallback and trace visibility.

### Pass 8 — Enforced Budgets and Admission Control
**Gap:** cost tracking/approval existed but did not fully prevent token, candidate-route, evaluation, or concurrency runaway.  
**Fixed:** enforceable soft/hard budgets, background quotas, budget-exhaustion partial results and admission control.

### Pass 9 — Evidence Freshness and Snapshot Consistency
**Gap:** source resolution/provenance existed but multi-source evidence could be individually valid yet temporally inconsistent or stale.  
**Fixed:** evidence freshness/version metadata, revalidation before action, consistent snapshot guidance and conflict handling.

### Pass 10 — Audit Integrity and Emergency Control
**Gap:** tracing existed but no explicit tamper-resistant audit category or platform kill-switch/manual-override model was specified.  
**Fixed:** protected audit events, scoped server-side kill switches, cache invalidation, actor/reason logging and clear UI state.

### Pass 11 — Disaster Recovery / Client Continuity
**Gap:** resume handled process continuity but backup/restore reconciliation and browser disconnect/cross-tab conflicts were not complete.  
**Fixed:** RPO/RTO inventory, restore reconciliation, no duplicate destructive resubmit, sequence-aware reconnect and stale approval rejection.

### Pass 12 — WebMCP and Canary Governance
**Gap:** WebMCP readiness lacked an explicit browser-origin trust boundary, while canary promotion lacked minimum-evidence/statistical governance.  
**Fixed:** page-origin/server-side authorization rules plus minimum sample/observation/guardrail/inconclusive experiment policy.

### Pass 13 — External Data Egress Boundary
**Gap:** authorization to read tenant data did not explicitly distinguish permission to transmit that data to an external LLM/MCP/provider.  
**Fixed:** data classification, tenant/provider egress policy, redaction/minimization, destination provenance, generated-helper egress constraints, and release-blocking exfiltration tests.

No gap found in this review changes the core ownership model. LangGraph remains orchestration/decision state, OpenAI Agents SDK remains the cognitive layer, Brokers/source systems remain authoritative evidence, and `worker_jobs` remains durable execution truth.


---

## 190. Data Classification and External Egress Policy

Authorization to read data inside SmartAIHub does **not** automatically authorize sending that data to an external LLM, MCP server, web service, evaluator, or third-party API.

Feature 198 MUST introduce or reuse a platform data-classification/egress policy covering at least:

- public/product documentation,
- ordinary tenant content,
- confidential/private tenant content,
- credentials/secrets,
- regulated/specially restricted data where applicable,
- admin/security telemetry,
- source code or implementation-private content,
- user-selected attachments/media.

Every external-capable execution step SHOULD declare:

```text
data_classes_accepted
external_destination/provider
purpose
retention/training posture if known/configured
region/residency metadata where relevant
redaction/minimization capability
```

Rules:

1. Retrieval permission and egress permission are separate checks.
2. Secret/credential classes are never sent to model/MCP context except through a dedicated non-model-visible credential channel expressly designed for the tool.
3. Before external LLM/MCP/tool calls, the platform MUST apply tenant policy for allowed providers/destinations and required redaction/minimization.
4. A generated helper/agent cannot broaden data egress beyond its declared manifest and current user's policy.
5. Multi-route exploration cannot duplicate sensitive content across additional providers merely to obtain more candidate answers unless policy/budget permits.
6. Trace records store destination/provider and data-classification decision, but not redacted sensitive payloads.
7. If a required task cannot be completed without prohibited egress, the system should select an allowed local/internal alternative, request an explicit governed approval where policy permits, or explain the limitation.
8. Page Context Tier C screenshots and Feedback attachments are subject to the same egress policy before any external vision/model call.
9. Provider-policy changes invalidate affected routing caches and may make a previously proven route ineligible.
10. Admin UI SHOULD expose which external providers are allowed for each relevant tenant/data class without revealing secrets.

This policy is evaluated before cognitive/model/provider selection so the planner does not propose routes that are impossible under current data-handling rules.

---

## 191. Additional Security Tests for External Data Egress

Add release-blocking tests for:

- a user allowed to view a private file but forbidden to send it to an external MCP/model,
- secret-like values being stripped/blocked from cognitive and MCP payloads,
- tenant provider allowlist/denylist enforcement during fallback,
- multi-route exploration not multiplying sensitive egress destinations unexpectedly,
- generated helper attempting undeclared network egress,
- Page Context screenshot/visual analysis following the same external-provider policy,
- route learned under an old provider policy becoming ineligible after policy change.

Any unauthorized external disclosure is a critical release-blocking failure.

---

## 192. Cross-Plane Contract Registry and Compatibility Tests

Feature 198 spans Web UI, tRPC/HTTP APIs, LangGraph state, Agents SDK structured outputs, Retrieval/Operational/Capability Brokers, `worker_jobs`, MCP adapters, Runner/Worker clients, and realtime events. A change in one plane MUST NOT silently break another plane.

SmartAIHub MUST establish a SmartAIHub-owned **Contract Registry** (code/schema registry, not necessarily a new service) for externally consumed platform contracts including:

- `PageContextEnvelope`,
- `CognitiveResult` / Return-To-Orchestrator payloads,
- capability manifests and version metadata,
- orchestration/realtime event envelopes,
- worker-job command/progress/result envelopes used by this feature,
- Feedback Context Package,
- evaluation/result schemas,
- MCP-normalized capability metadata,
- generated-helper manifests.

Requirements:

1. Every persisted or cross-process contract has an explicit schema/version owned by SmartAIHub rather than by a framework-private object.
2. Backward-compatible additions and breaking changes are classified separately.
3. Producers and consumers declare the minimum/maximum compatible contract version where mixed-version deployment is possible.
4. Frontend and backend SHOULD share generated types or schema-derived clients where practical; duplicated hand-maintained interfaces are release risks.
5. CI runs producer/consumer contract tests, including old-consumer/new-producer and new-consumer/old-producer fixtures for supported rolling-upgrade windows.
6. Unknown optional fields are ignored safely; unknown required semantic versions fail explicitly rather than being guessed.
7. Contract fixtures are versioned and kept long enough to test rollback paths.
8. Contract compatibility failures block rollout before tenant traffic is exposed.

A framework upgrade does not justify changing a SmartAIHub contract unless the product contract itself needs to change.

---

## 193. Event Delivery Semantics, Ordering, Deduplication, and Reconciliation

Structured realtime and durable events are used for Chat activity, orchestration, jobs, approvals, evaluation, tracing, and cross-surface continuity. The spec previously listed events but did not fully define delivery semantics.

Requirements:

1. Every event envelope MUST include at least `event_id`, `trace_id`, relevant run/job/entity id, tenant scope, event type, schema version, producer timestamp, and a producer-monotonic sequence or equivalent ordering token when ordering matters.
2. Consumers MUST be idempotent by `event_id` or a stable idempotency key. The platform MUST assume **at-least-once delivery** unless a transport can prove stronger semantics.
3. No feature may rely on exactly-once delivery from the network or broker.
4. Durable state transitions that must produce events SHOULD use an existing transactional outbox pattern or equivalent atomic state+event publication mechanism rather than “commit DB, then best-effort publish”.
5. Critical consumers that trigger side effects SHOULD use an inbox/deduplication record or equivalent idempotency protection.
6. Realtime clients detect sequence gaps and resynchronize from canonical state instead of trusting a partial stream.
7. Out-of-order progress events cannot regress canonical job/run state.
8. Event retention/replay windows and cursor semantics are documented for reconnecting clients.
9. A reconciliation job/report MUST detect canonical state that lacks expected terminal events and events that reference missing/deleted canonical entities.
10. Trace rendering distinguishes event-observation time from authoritative state time.

This contract applies across web sockets/SSE, queue adapters, MCP-task adapters, and internal event buses.

---

## 194. Temporary Resource Lifecycle, Garbage Collection, and Orphan Reconciliation

Dynamic orchestration creates temporary helpers, sandboxes, intermediate media, cached evidence, uploaded artifacts, MCP sessions, browser/page sessions, checkpoints, evaluation branches, and other resources. Successful execution alone does not guarantee these resources are cleaned up.

Every temporary resource class MUST declare:

- owner (`tenant_id`, run/job/trace where applicable),
- creation time,
- TTL or retention policy,
- lease/heartbeat where needed,
- cleanup action,
- whether cleanup is safe to retry,
- whether failed cleanup requires operator attention,
- lineage to any promoted/persisted artifact.

Requirements:

1. Terminal success, failure, cancellation, timeout, rollback, and abandoned-browser-session paths all invoke cleanup semantics.
2. Cleanup workers are idempotent and safe to retry.
3. A scheduled orphan reconciler detects expired resources whose owner run/job is missing or terminal.
4. Promotion of an ephemeral helper/flow transfers required artifacts to governed durable storage before temporary copies are deleted.
5. Intermediate media/R2 objects use explicit lifecycle tags/prefixes where supported rather than relying only on database deletion.
6. MCP/browser sessions and temporary credentials are revoked/closed on terminal state or TTL expiry.
7. Cleanup failure is observable and cannot silently accumulate unbounded storage/cost.
8. Admin UI exposes orphan/cleanup backlog and allows governed retry, not direct unsafe deletion of live resources.
9. Disaster recovery reconciliation (Section 183) MUST include orphan detection after restore.

---

## 195. Evaluation Dataset Hygiene, Holdouts, and Self-Improvement Leakage Prevention

Historical replay and self-improvement can produce misleading results if the same trajectories used to create a Skill/Flow/route are also used to claim that candidate is better.

Evaluation governance MUST distinguish:

- training/discovery trajectories used to propose a candidate,
- development/tuning fixtures,
- regression fixtures,
- protected holdout/acceptance sets,
- live canary observations.

Requirements:

1. A candidate cannot be promoted based only on trajectories from which it was synthesized or tuned.
2. Replay/benchmark records include dataset version, membership hash/reference, scope, evaluator versions, and whether each sample was seen during candidate construction.
3. Protected holdout sets are access-controlled against automatic candidate-generation logic where practical.
4. User/project-specific data cannot be copied into global evaluation sets without tenant policy and de-identification/permission rules.
5. Near-duplicate examples SHOULD be detected to reduce train/test leakage.
6. Benchmark sets are periodically refreshed so optimization does not overfit a frozen suite.
7. Changes to evaluator/rubric or ground-truth labels create a new evaluation-dataset/evaluator version rather than silently rewriting historical meaning.
8. Learning Center distinguishes “historical replay improvement” from “holdout improvement” and “live canary improvement”.
9. A candidate with excellent replay but materially worse holdout/canary evidence remains inconclusive or is rejected.
10. Evaluation data retention/deletion follows the source-data and derived-data policy in Sections 118 and 169.

---

---

## 196. Capability Deprecation, Compatibility, and Learned-Route Invalidation

Capabilities, Flows, Skills, helpers, MCP tools, models, and providers evolve. A previously proven route can become invalid even when its intent match remains high.

Every reusable capability/version SHOULD expose lifecycle state such as:

```text
EXPERIMENTAL
CANARY
ACTIVE
DEPRECATED
DISABLED
REVOKED
```

Requirements:

1. Deprecation is version-specific and records replacement guidance when one exists.
2. Capability metadata declares input/output contract versions and relevant compatibility constraints.
3. Learned Routes and Saved Flows store the exact or compatible version ranges of capabilities they depend on.
4. Capability-version change, permission change, provider removal, MCP tool drift, model-feature drift, or failed health checks can mark dependent routes as `STALE` / `REVALIDATION_REQUIRED`.
5. Stale routes MUST NOT be treated as proven merely because their historical score was high.
6. The Capability Dependency Graph is used to compute blast radius before disabling/deprecating a capability.
7. Admin UI shows dependent Skills/Flows/Routes before destructive lifecycle changes.
8. Removal requires a migration/deprecation window unless emergency security revocation applies.
9. Old versions needed to replay an audit trace may remain represented as immutable metadata even when executable binaries/providers are no longer available.
10. Search/ranking penalizes deprecated capabilities and excludes disabled/revoked capabilities unless a privileged historical-inspection mode explicitly requests them.
11. User-facing execution surfaces must explain when a saved Flow/Skill can no longer run and suggest a validated replacement/replan path.

---

## 197. Mixed-Version Deployment and Runtime Compatibility Matrix

SmartAIHub Web, Python backend, Runner, Worker App, MCP adapters, and optional desktop clients will not always upgrade atomically. Feature 198 MUST be safe during rolling deployments and partially outdated clients.

Maintain a runtime compatibility matrix covering at least:

- Web/frontend build,
- Node/server API contract,
- Python orchestration service,
- LangGraph state/contract version,
- Agents SDK adapter version,
- Runner/Worker App protocol/capability version,
- MCP protocol/extensions required by a connection,
- generated-helper runtime image version.

Requirements:

1. Job/capability dispatch checks required runtime features/version before leasing work to Runner/Worker.
2. A worker that lacks a required capability/version is not assigned the job and is not allowed to “best effort” an incompatible payload.
3. Rolling deployments define supported N/N-1 compatibility windows or explicitly drain incompatible nodes before rollout.
4. UI feature availability is driven by server-negotiated capabilities/contracts, not only by frontend feature flags.
5. Old browser tabs detecting an incompatible server contract receive a refresh/reload-safe notice rather than continuing destructive actions with stale schemas.
6. Rollback procedures account for durable state/checkpoints created by the newer version.
7. Deployment ordering is documented for migrations where server/schema/worker changes have dependencies.
8. Canary rollout includes at least one mixed-version scenario representative of production fleet skew.
9. Version negotiation and incompatibility are visible in Trace/Run Inspector and operator diagnostics.
10. CI/release gates test supported mixed-version pairs.

---

## 198. Localization, Locale Semantics, and Multilingual Retrieval Governance

Feature 198 operates in Thai and English and will often receive mixed-language queries, capability names, Help content, prompts, and generated results. Locale behavior MUST be an explicit contract rather than incidental LLM behavior.

Requirements:

1. `PageContextEnvelope`, assistant surface, retrieval requests, and Help retrieval carry user/UI locale separately from source-document language.
2. Thai/English Help variants share a stable logical topic identity where they describe the same feature.
3. Retrieval may fall back across languages when same-locale evidence is insufficient, but provenance MUST identify the actual source language used.
4. The assistant answers in the user's active/preferred language unless the user requests otherwise or an artifact contract requires a specific language.
5. Capability search supports Thai synonyms/transliterations and English canonical capability identifiers without requiring duplicate capability registrations.
6. Generated Skill/Flow descriptions intended for Catalog discovery SHOULD have locale-aware searchable metadata or a governed multilingual projection strategy.
7. Locale change while an Assistant panel is open does not reinterpret already approved parameters; display text may change, semantic values do not.
8. Dates, numbers, currencies, units, and relative-time rendering follow locale/timezone rules while stored orchestration constraints remain canonical.
9. Error/permission/approval messages have translatable stable message codes; business logic must not branch on rendered localized strings.
10. Help drift and evaluation datasets track locale so a high-quality English answer cannot mask systematically poor Thai retrieval.
11. UI truncation/layout tests include Thai text expansion and mixed Thai/Latin content.

---

## 199. Accessibility Requirements for Streaming, Dynamic, and Agentic UI

Section 129 defines baseline accessibility. Agentic/streaming UI needs additional behavior because content changes while the user is reading or interacting.

Requirements:

1. Assistant Launcher and Side Panel have deterministic keyboard open/close behavior, focus entry, focus trap where appropriate, and focus restoration to the invoking control.
2. Streaming tokens are NOT announced character-by-character to assistive technology. Announcements are throttled/grouped into meaningful status or completed-message updates.
3. Activity Strip, Live Task Card, approval state, errors, and completion events expose semantic status text and appropriate live-region behavior without excessive interruption.
4. Dynamic insertion of Plan/Approval/Compare cards does not steal focus automatically unless immediate safety approval is required and accessibility policy explicitly permits it.
5. Compare Results/Outputs support non-visual comparison summaries; visual/video comparison is not the only way to choose.
6. Flow/Trace graph views provide an equivalent navigable list/tree/timeline representation for users who cannot operate a visual graph canvas.
7. Every generated MCP App/auto-generated form rendered inside SmartAIHub must satisfy the host's accessibility wrapper requirements; inaccessible external UI has a structured/fallback form when possible.
8. Keyboard users can cancel, retry, approve, reject, expand details, inspect sources, and report a problem without pointer-only interaction.
9. Reduced-motion preferences apply to streaming indicators, graph animations, progress transitions, and panel motion.
10. Accessibility regressions are included in CI/manual release gates for the Universal Assistant, Connections, Plan/Approval, Compare, Trace, and Learning Center surfaces.

---

---

## 200. Administrative Governance, Separation of Duties, and Break-Glass Operations

Feature 198 can create/modify capabilities, connect external systems, change rollout percentages, approve consequential actions, and inspect sensitive traces. These powers MUST NOT collapse into one undifferentiated “admin” permission.

Define distinct privileged actions/roles or policy capabilities for at least:

- connection/credential administration,
- capability/Skill/Flow publishing,
- rollout/canary promotion,
- security/policy administration,
- trace/evaluation access,
- support/feedback diagnostics,
- emergency operations.

Requirements:

1. High-impact global changes SHOULD support separation of duties and, where configured, two-person/four-eyes approval.
2. The same actor SHOULD NOT silently author, approve, and globally promote an AI-generated capability when tenant/org policy requires independent review.
3. Break-glass actions require strong authentication, explicit reason, bounded scope/duration, immutable audit event, and post-event review.
4. Security revocation/kill switches remain available during change freezes and do not require a normal release window.
5. Tenant-level administrators cannot modify platform-global routes/capabilities unless explicitly granted platform scope.
6. Support users can access only the diagnostic fields required for their role; support access is not equivalent to developer/source access.
7. Promotion, rollback, credential rotation, provider-policy change, global Help update, and destructive cleanup actions record actor, approver(s), reason, before/after reference, and trace/change id.
8. Admin UI clearly distinguishes tenant-scoped from global actions and requires an explicit scope confirmation for global impact.
9. Privileged automation/service accounts use the same policy engine and cannot bypass human-approval requirements merely because they are non-human actors.
10. Governance policy changes themselves are versioned, auditable, and covered by rollback/emergency-access procedures.

---

## 201. Telemetry Sampling, Cardinality, and Observability-Cost Governance

Full tracing is essential for auditability, but unrestricted high-cardinality telemetry can become a reliability/cost problem or leak content into observability systems.

Requirements:

1. Define separate classes for audit events, operational metrics, debug traces, and content-bearing diagnostic payloads.
2. Security/audit events required for governance are never dropped by ordinary trace sampling; debug spans may be sampled under policy.
3. Metric labels MUST NOT contain unbounded values such as raw `user_id`, prompt text, file names, URLs with arbitrary query strings, capability descriptions, or trace payloads.
4. High-cardinality identifiers belong in trace/log fields or governed exemplars rather than metric dimensions unless explicitly approved.
5. Sampling rules may depend on outcome: failures/security violations/canary anomalies can receive higher retention than routine successes.
6. Sampling decisions and telemetry redaction happen before egress to third-party observability providers.
7. Per-tenant telemetry visibility respects tenant isolation and admin role policy.
8. Set budgets/alerts for trace volume, log volume, metric-series cardinality, evaluation telemetry, and retained diagnostic attachments.
9. When observability backends are degraded, product execution continues according to policy; nonessential debug telemetry is shed before authoritative job/audit state.
10. Trace Explorer indicates when a trace is partially sampled and distinguishes “not captured” from “event did not happen”.
11. Telemetry retention and deletion align with Sections 118/169 and external-egress policy.

---

## 202. Retrieval Quality Governance and Search Regression Gates

The Retrieval Broker is a core dependency for Help, Library, media, memory, capability discovery, and troubleshooting. Availability/latency alone are insufficient; relevance quality MUST be measured over time.

Maintain versioned evaluation query sets for relevant source families, including at minimum:

- Help/product-usage queries in Thai and English,
- capability discovery and synonym queries,
- Library/document semantic queries,
- media-scene queries where supported,
- ambiguous/contextual-reference queries using Page Context,
- negative/no-answer cases that should not retrieve unrelated authoritative evidence.

Requirements:

1. Retrieval evaluations record provider/index/embedding/ranker/query-strategy versions.
2. Measure appropriate ranking metrics such as Recall@K, Precision@K, MRR/NDCG or task-specific success measures; exact thresholds are established from current baselines rather than invented in this spec.
3. Evaluate ACL/tenant-filter correctness separately from relevance and treat leakage as release-blocking regardless of relevance score.
4. Help retrieval cutover (Section 170), embedding migrations, reranker changes, chunking changes, and provider cutovers require regression comparison against the current accepted baseline.
5. Query sets contain Thai, English, mixed-language, typo/colloquial, and short contextual-reference cases representative of production use.
6. No-answer/low-evidence cases are measured so ranking improvements do not merely increase irrelevant retrieval volume.
7. Production telemetry can propose new evaluation queries, but protected benchmark/holdout governance from Section 195 applies.
8. Retrieval quality regressions beyond agreed gates block rollout or trigger rollback even if latency/cost improved.
9. Learning Center/observability surfaces distinguish retrieval failure from downstream cognitive/planning failure.
10. Index freshness/reindex lag is part of retrieval quality: a semantically perfect but stale index is not considered healthy.

---

## 203. Large Results, Payload Limits, Pagination, and Artifactization

Operational queries, Trace histories, capability catalogs, media search, MCP responses, and tool outputs can exceed browser/model/API limits. The system MUST bound payloads rather than silently stuffing large results into context.

Requirements:

1. Every list/search API defines stable pagination/cursor semantics and a maximum page size.
2. Ordering used for pagination is deterministic enough to avoid obvious duplicates/skips during one query session; if the underlying set changes materially, return a new snapshot/cursor generation or explain inconsistency.
3. Tool/MCP/provider responses have size/time/item limits. Oversized results are stored as governed artifacts or canonical records and represented to the model by compact summaries + references.
4. The Context Broker never injects an entire large query result merely because the upstream tool returned it.
5. Truncation is explicit (`truncated=true`, counts/continuation reference where possible); the model/user must not be led to believe the shown subset is complete.
6. Large media/document outputs use Library/R2/artifact references rather than embedding raw bytes/base64 in orchestration state or trace events.
7. Rich UI supports incremental loading/virtualization without changing the authoritative query semantics.
8. Export/download operations for large Trace/Evaluation datasets are separate governed jobs with permission/audit controls, not synchronous browser responses.
9. Model-facing summarization of large results preserves source/item references so the assistant can fetch more detail on demand.
10. Payload limits apply before external LLM/MCP egress as part of data minimization and cost control.
11. Reliability tests cover oversized MCP/tool responses, huge trace histories, and pagination across concurrently changing result sets.

---

## 204. Additional Release Tests Introduced by Fifth Gap Review

Add release-blocking or policy-gated tests for:

### Contract / Events
- frontend/API/graph contract compatibility across supported schema versions,
- old/new producer-consumer fixture matrix,
- duplicate and out-of-order realtime/job events,
- sequence-gap resynchronization,
- state commit followed by simulated event-publish failure and outbox recovery.

### Resource Lifecycle
- cancellation/failure leaves no unbounded sandbox/session/intermediate-artifact leak,
- orphan reconciler cleans expired resources without deleting live leased resources,
- promoted helper survives temporary-resource cleanup with valid lineage.

### Evaluation Hygiene
- candidate synthesized from dataset A cannot claim holdout success using A as the protected holdout,
- near-duplicate benchmark leakage detection,
- tenant-private samples rejected from global evaluation without policy.

### Compatibility / Deprecation
- deprecated capability is penalized/excluded from new routing,
- dependent learned route becomes revalidation-required after incompatible capability upgrade,
- mixed Web/Python/Runner versions negotiate/decline unsupported jobs safely,
- rollback after a newer checkpoint/contract version follows declared compatibility policy.

### Locale / Accessibility
- Thai/English Help fallback preserves actual source-language provenance,
- mixed Thai/English capability discovery,
- relative-time semantics remain canonical after locale change,
- keyboard/focus/screen-reader behavior for Assistant, Approval, Compare, Trace and dynamic status,
- non-visual alternative for Flow/Trace graph inspection.

### Governance / Telemetry
- tenant admin cannot perform a platform-global promotion,
- configured two-person approval cannot be self-approved by one actor/service account,
- break-glass produces bounded, auditable access,
- telemetry sampling never drops mandatory audit events,
- high-cardinality/content values are rejected/redacted from metric labels.

### Retrieval / Large Payload
- Help/capability retrieval regression suite meets accepted baseline gates,
- no-answer cases do not fabricate evidence,
- oversized MCP/tool result is artifactized/truncated explicitly,
- pagination/cursor behavior does not silently claim completeness after truncation.

---

## 205. Additional Production Definition of Done — Fifth Gap Review

Feature 198 v5 is not production-complete until, for applicable deployed surfaces:

- cross-plane contract schemas are versioned and CI contract tests pass,
- event delivery/dedup/order/reconciliation semantics are implemented for critical event paths,
- temporary-resource cleanup and orphan reconciliation are observable and tested,
- replay/evaluation separates synthesis data from protected holdout/canary evidence,
- capability deprecation/invalidation propagates to dependent learned routes/flows,
- mixed-version deployment rules exist for Web/Python/Runner/Worker and are release-tested,
- Thai/English locale behavior and retrieval fallback are specified/tested,
- dynamic Assistant/agentic surfaces pass accessibility checks beyond static-page accessibility,
- privileged governance separates tenant/global scope and supports configured independent approval/break-glass policy,
- telemetry sampling/cardinality budgets protect audit integrity, privacy, and observability cost,
- Retrieval Broker has quality regression gates in addition to latency/availability SLOs,
- large results have bounded payload, explicit truncation, pagination and artifact-reference behavior,
- all new contracts have operator-visible diagnostics sufficient to distinguish contract mismatch, stale route, retrieval failure, provider failure, and cleanup failure.

---

## 206. Fifth Twelve-Pass Gap Review — Contract, Lifecycle, Quality, and Operability

A further twelve independent review passes were performed on Spec 196 v4. All gaps below were incorporated immediately into normative Sections 192–205.

### Pass 1 — Cross-Plane Contract Drift
**Gap:** many contracts were described but there was no complete producer/consumer registry or rolling-version contract-test requirement.  
**Fixed:** Section 192 adds SmartAIHub-owned versioned contracts, generated/shared types where practical, compatibility declarations and CI matrices.

### Pass 2 — Event Ordering and Delivery Semantics
**Gap:** events existed without a complete at-least-once/dedup/order/gap-recovery contract.  
**Fixed:** Section 193 defines event identity, ordering tokens, outbox/inbox/idempotency and canonical-state resynchronization.

### Pass 3 — Temporary Resource Leakage
**Gap:** helpers/sandboxes/sessions/intermediate artifacts could outlive failed/cancelled runs.  
**Fixed:** Section 194 defines TTL/lease/cleanup/orphan reconciliation and operator visibility.

### Pass 4 — Evaluation Data Leakage / Overfitting
**Gap:** historical replay could evaluate a candidate on the same trajectories used to synthesize it.  
**Fixed:** Section 195 separates discovery/tuning/regression/holdout/canary datasets and adds leakage/duplicate governance.

### Pass 5 — Capability Deprecation and Dependency Invalidation
**Gap:** proven routes could continue using deprecated/incompatible capability versions.  
**Fixed:** Section 196 adds lifecycle states, dependency blast-radius analysis and route revalidation.

### Pass 6 — Mixed-Version Production Fleet
**Gap:** rollout assumed components would remain sufficiently compatible without an explicit Web/Python/Runner/Worker matrix.  
**Fixed:** Section 197 adds feature/version negotiation, deployment ordering and mixed-version tests.

### Pass 7 — Localization Semantics
**Gap:** Help had locale metadata but system-wide multilingual retrieval/output/date/error semantics were incomplete.  
**Fixed:** Section 198 defines locale/source-language separation, cross-language fallback, canonical semantic values and locale regression metrics.

### Pass 8 — Accessibility of Dynamic Agentic UI
**Gap:** baseline keyboard/accessibility rules did not fully cover streaming, live status, dynamic cards, graphs and generated MCP UI.  
**Fixed:** Section 199 adds focus/live-region/reduced-motion/non-visual graph and generated-form requirements.

### Pass 9 — Administrative Separation of Duties
**Gap:** privileged actions were governed but role separation, independent approval and break-glass semantics were underspecified.  
**Fixed:** Section 200 adds tenant/global scope, four-eyes-capable governance, break-glass and policy-change auditability.

### Pass 10 — Observability Cost and Cardinality
**Gap:** trace/metric requirements could create high-cardinality cost/privacy problems and did not distinguish audit from sampled debug telemetry.  
**Fixed:** Section 201 defines telemetry classes, sampling, label restrictions, budgets and degraded observability behavior.

### Pass 11 — Retrieval Relevance Regression
**Gap:** retrieval had architecture/SLOs but not a complete relevance-quality gate across Help/Capability/Library/Media changes.  
**Fixed:** Section 202 adds versioned query sets, ranking metrics, no-answer cases and cutover regression gates.

### Pass 12 — Oversized Results and Context/Payload Bounds
**Gap:** pagination existed in some UI guidance but oversized tool/MCP/results lacked one end-to-end truncation/artifactization contract.  
**Fixed:** Section 203 adds stable pagination, explicit truncation, artifact references, large-export jobs and model-context minimization.

No finding changes the ownership model: LangGraph owns orchestration/decision state, Agents SDK owns bounded cognitive work, authoritative Brokers/source systems own facts, and `worker_jobs` owns durable execution state.

---

## 207. Codebase Alignment Audit — 2026-09-17

This audit records the repository-alignment result for Features 195–198. “Partial” means a usable implementation exists but does not satisfy the full target contract; “target” means the specification correctly describes work that remains to be implemented. Retired systems are never counted as implementation evidence.

| Surface | Verified repository evidence | Result |
|---|---|---|
| Chat | `apps/web/server/routers/chat.ts` and `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts` | Existing Chat/runtime surface; universal command behavior is partial |
| Cognitive runtime | Python OpenAI Agents internal router/contracts plus Web runtime client | Runtime contract exists; Feature 198 Goal/trajectory lifecycle is target work |
| Deterministic orchestration | Python LangGraph runtime and Web `runEngine.ts` | Governed runtimes exist; no second legacy workflow engine is permitted |
| Durable execution | `worker_jobs`, events, attempts, outbox, dispatches and provider reservations in Drizzle schema | Feature 186 implementation baseline; Feature 195 is target authority |
| Transport rollout | PostgreSQL-pull runtime plus Cloudflare Queue/Container adapters | Cloudflare adapters are prepared; active production cutover requires separate deployment proof |
| Capability discovery | `capabilityRegistry.ts` and `orchestratorCapabilityCatalogService.ts` | Partial catalog/metadata; not a complete universal Goal/Plan/Offer graph |
| RAG/vector | Library/Chat Memory/Context Pack paths and Feature 194 provider abstraction | Existing multiple paths; unified Retrieval Broker and cutover remain gated work |
| Help | 84 EN + 84 TH Markdown topics, Help tRPC routes, Help Panel and context injector | Existing corpus/UI; Broker integration is target work |
| Help screenshot | `python-backend/app/api/help_screenshot.py` exists but is not included by the current `python-backend/app/main.py` router list | Must remain explicitly unverified until wired and end-to-end tested |
| Runner/local execution | Worker App/Tauri runtime and local executors | Foundation only; Feature 197 Runner identity/session/offer/control contracts remain target work |
| Feature 198 persistence | No dedicated non-retired Goal/trajectory/evaluation/learned-route persistence was found in the current schema audit | Target work; retired tables are not substitutes |
| Retired-code residue | Existing repository code still contains legacy identifiers/routes or compatibility adapters, including public docs/social-tool surfaces and Python Docker/Kilo services | Not valid Feature 198 implementation evidence; no new callers or compatibility paths may be added. Removal requires a separate authorized migration audit |

Feature 198 MUST preserve these boundaries: no Agency, work requests/workpacks, retired `/workflows` custom workflow engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. “Flow” means a governed LangGraph flow or a Feature 196 Goal/Plan concept. Durable execution MUST enter the Feature 195/`worker_jobs` control plane, and local execution MUST use the Feature 197 Runner boundary.

### 20-pass review record

The following twenty independent passes were completed against the four specs and the current repository snapshot. Fixes were applied in-place where the issue was documentary; implementation gaps are labeled as target work above.

1. File identity and metadata path — corrected 195, 196 and 198 paths.
2. Feature ownership — aligned 198 self-references and related-spec declarations.
3. Cross-spec dependency direction — 195 execution, 196 planning, 197 Runner, 198 Chat/evolution.
4. Canonical Job schema — matched `worker_jobs` and attempt/event fields.
5. Outbox identity — matched `worker_job_outbox`; removed duplicate-table implication.
6. Dispatch dedupe — matched `worker_job_dispatches` and idempotency evidence.
7. Lease/fencing — matched `worker_job_attempts` and control-plane semantics.
8. Node control API — checked gateway, routes, claim and terminal transitions.
9. Python bridge — checked internal publish/claim/status adapter and no second Job truth.
10. Queue/runtime readiness — separated PostgreSQL-pull baseline from Cloudflare target rollout.
11. Provider admission — checked reservations, late binding and settlement boundaries.
12. OpenAI Agents contracts — checked Python contracts, adapter and Web client compatibility.
13. LangGraph boundary — checked existing runtime and prohibited legacy-engine ambiguity.
14. Chat surface — checked current router/runtime against Universal Command Gateway claims.
15. Capability registry/catalog — checked current model/static-surface/Skill/media/context-pack coverage.
16. MCP and Runner roles — checked caller/runtime distinction and local execution boundary.
17. RAG/vector migration — checked Feature 194 relationship and provider abstraction.
18. Help/UI/context — checked corpus counts, routes, injector and screenshot-router inclusion.
19. Persistence/security/operations — checked tenant, egress, billing, telemetry, rollback and missing Feature 198 stores.
20. Retired systems, acceptance and final convergence — classified residual legacy code, fixed documentary boundaries and verified no new retired dispatch path or in-scope identity gap.

The final status is therefore: the four specs are internally aligned and codebase-honest after these edits; the remaining “target work” rows are product implementation gaps, while residual legacy code cleanup remains separate authorized migration work and is not treated as Feature 195–198 evidence.

## Problem

SmartAIHub Chat currently has useful but fragmented Chat, Skill, RAG, Help, capability and runtime paths. It cannot yet serve as a reliable universal control surface that understands platform state, composes governed capabilities, executes durable work and learns from auditable outcomes.

## Solution

Use LangGraph for deterministic orchestration, OpenAI Agents SDK for bounded cognitive work, authoritative Brokers for facts, Feature 196 for Goal/Plan semantics, Feature 195 `worker_jobs` for durable execution, Feature 197 Runner for local execution, and a shared trajectory/evaluation/evolution contract for the Chat experience.

## Requirements

Functional requirements include universal Chat entry, permission-filtered page context, unified retrieval, capability discovery, Goal/Plan execution, Help/Feedback continuity, MCP integration, long-running Job monitoring, trajectory evaluation and safe capability evolution. Non-functional requirements include tenant/auth/egress safety, contract versioning, event idempotency, bounded payloads, localization, accessibility, privacy, observability budgets and rollback.

## Architecture

Feature 198 is the product and intelligent interaction plane. It composes, but does not replace, Feature 195 execution truth, Feature 196 Goal/Plan orchestration, Feature 197 Runner execution and Feature 194 vector-provider migration. Current Chat/runtime/catalog/help components are partial building blocks; no retired system is an implementation dependency.

## Implementation

The repository already contains Chat and Skill routes, OpenAI Agents and LangGraph runtimes, the Feature 186/195-aligned Job Control Plane, capability catalog/model metadata, RAG/Help subsystems and Worker App foundations. Retrieval Broker integration, universal command behavior, Goal/trajectory/evaluation persistence, Help screenshot wiring and complete Runner contracts remain explicitly gated target work.

## Assumptions

User and tenant authority is server-derived, source systems remain authoritative for facts, Chat may ask for clarification or approval, durable work is asynchronous by default, and learned routes are versioned candidates rather than automatic policy overrides.

## Constraints

No duplicate durable Job truth, no raw DOM/source-code disclosure by default, no unbounded retrieval/context payload, no client-supplied authorization, no silent provider/vector cutover, and no Agency, work requests/workpacks, retired `/workflows`, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch.

## Risks

Key risks are hallucinated operational facts, retrieval leakage, tool overexposure, cross-tenant derived artifacts, trajectory/evaluation leakage, stale capability routes, mixed-version contract breaks, Help/runtime drift and accidental promotion of unproven learned behavior.

## Alternatives

Single-model Chat, separate Help/Feedback assistants, channel-specific planners and independent execution state machines are rejected because they duplicate logic and lose durable, policy-aware, auditable cross-surface continuity.

## User Stories

As a user, I can ask in Thai or English from any page, receive grounded Help or operational answers, approve a Plan, monitor the resulting Job and inspect the outcome. As an operator, I can trace, evaluate, quarantine and roll back a route without treating partial code paths as production-complete.

## Acceptance Criteria

The feature is accepted only when all applicable cross-plane contracts pass focused tests for tenant/auth safety, retrieval quality, event/idempotency semantics, durable Job handoff, Runner control, Help/UI accessibility, mixed versions, evaluation hygiene, observability and rollback; the verified missing surfaces in Section 207 must be implemented or explicitly out of scope for the release.

# End of Spec
