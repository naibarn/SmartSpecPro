# SmartSpecPro Workflow Editor: LangGraph Integration, RAG Support, and Expanded Node System

## Overview

Upgrade the SmartSpecPro workflow editor to integrate with LangGraph for stable, production-grade workflow execution, add comprehensive RAG (Retrieval-Augmented Generation) pipeline support, implement intelligent LLM call optimization (caching, short-circuit, policy gate, model routing), and expand the node system from 21 to 74 nodes covering real-world automation scenarios across multiple industries.

## Current State

- **Workflow Editor**: React-based visual editor using ReactFlow with 21 registry-driven nodes
- **Backend Orchestrator**: Python FastAPI with `WorkflowOrchestrator` class (custom execution engine)
- **Node Registry**: Backend-defined node types served via API, rendered dynamically in frontend
- **Categories**: ai, flow_control, human, skills, media, triggers, inputs, outputs, data
- **Execution**: Custom orchestrator with checkpoint/resume support
- **LLM Integration**: Multi-provider system with credit tracking

## Goals

### 1. LangGraph Integration
- Replace/augment the custom `WorkflowOrchestrator` with LangGraph for workflow execution
- Leverage LangGraph's state machine, conditional edges, and built-in checkpoint/resume
- Support human-in-the-loop patterns natively via LangGraph
- Enable streaming execution status back to the frontend via SSE
- Maintain backward compatibility with existing workflow definitions

### 2. RAG Pipeline Support
- Add dedicated RAG workflow nodes (document ingestion, chunking, embedding, retrieval, reranking)
- Support vector store integration (Pinecone, Weaviate, Qdrant, pgvector)
- Enable hybrid search (semantic + keyword) within workflows
- Support document parsing (PDF, DOCX, HTML, CSV) as workflow steps
- Allow RAG pipelines to be composed visually in the workflow editor

### 3. LLM Call Optimization
- **Caching**: Semantic cache for LLM responses (exact match + embedding similarity)
- **Short-circuit**: Skip LLM calls when deterministic logic suffices (rule-based routing)
- **Policy Gate**: Pre-flight checks before LLM calls (budget limits, content policy, rate limits)
- **Model Routing**: Dynamic model selection based on task complexity, cost, latency requirements

### 4. Expanded Node System (74 Nodes)

Expand from 21 to 74 nodes organized by category:

#### Triggers (7 nodes)
1. Manual Trigger - Start workflow manually for testing/on-demand
2. Schedule Trigger - Run on time/cron schedule
3. Webhook / HTTP Trigger - Expose endpoint to receive events/data from external systems
4. Event Subscription Trigger - Listen for platform/service events (push-based)
5. Message Queue Trigger - Pull from message queue (RabbitMQ/SQS/Kafka)
6. File Watch Trigger - Monitor file storage for new/changed files
7. Form/Input Trigger - Start from form submission or structured parameter input

#### Inputs / Data Sources (5 nodes)
8. HTTP Request - Call REST/GraphQL APIs with full auth/header/pagination support
9. Connector Action - Pre-built service connector (create/update/search records)
10. Database Query - Read/write data (SQL/NoSQL) with parameterized queries
11. Spreadsheet/Table Action - Read/write spreadsheet rows with column mapping
12. Storage Action - Upload/download files from storage (S3/Drive etc.)

#### Communication / Notifications (4 nodes)
13. Email/SMS/Chat Send - Send messages with template support
14. Push Notification - Send push to mobile/web (real-time user notifications)
15. Create/Update Ticket - Create/update tickets in ticketing/incident systems
16. Outbound Webhook / Callback - Fire callback/notification to external systems

#### Data Transformation (8 nodes)
17. Set / Edit Fields - Create/modify/select fields for downstream nodes
18. Map / Rename Fields - Remap field names to resolve schema mismatches
19. Filter - Pass only items matching conditions (per-item filter)
20. JSON/XML/CSV Transformer - Convert between data formats (parse/serialize)
21. Schema Validator - Validate data structure/content before proceeding
22. Text & Regex Utilities - Clean text, extract patterns, regex parsing
23. Number & Math Utilities - Calculate, round, compare, summarize numbers
24. Date & Time Utilities - Parse/format/compare dates, timezone conversion

#### Flow Control (12 nodes)
25. If (Conditional) - Branch into 2 paths (true/false)
26. Switch / Router - Branch into multiple paths by value/condition
27. Merge / Join - Combine data from multiple branches into one
28. Aggregator - Collect multiple items into a single output (array/summary)
29. Split / Iterator - Break array into individual items for per-item processing
30. Batch / Chunk Processor - Process in batches for throughput and rate limit control
31. Sort / Limit / Deduplicate - Order, cap count, remove duplicates
32. Loop Controller - Controlled loop with break/continue/max iterations
33. Wait / Delay - Pause for duration or until scheduled time
34. Concurrency Controller - Limit parallel execution to prevent overload
35. Reusable Subflow / Function - Call a reusable workflow as a function
36. Template / Snippet Library - Use pre-built flow patterns (pagination, retry, upsert)

#### Reliability / Error Handling (8 nodes)
37. Rate Limiter / Throttle - Limit requests per time window to prevent blocking
38. Retry with Backoff - Auto-retry on failure with exponential backoff
39. Timeout / Circuit Breaker - Cut off slow calls and stop cascading failures
40. Idempotency / De-dup Key - Prevent duplicate processing on retrigger/retry
41. Checkpoint / Resume - Save state for long-running workflows to resume later
42. Error Catch / Try-Catch Block - Catch errors in specific sections with fallback logic
43. On Error Trigger - When workflow fails, fire incident/alerting flow
44. Fallback Path - When primary path fails, use backup (e.g., switch provider)
45. Dead Letter Queue (DLQ) - Store failed items for later inspection/reprocessing

#### AI / LLM (1 + RAG nodes below)
46. AI / LLM Step - Generate/classify/extract via LLM with prompt and output schema control

#### RAG Pipeline (8 nodes) - NEW
47. Document Ingest - Load documents (PDF/DOCX/HTML/CSV) into processing pipeline
48. Text Chunker - Split documents into chunks with configurable strategy (fixed/semantic/recursive)
49. Embedding Generator - Generate vector embeddings using configurable model
50. Vector Store Write - Write embeddings to vector store (Pinecone/Weaviate/Qdrant/pgvector)
51. Vector Store Query - Search vector store with semantic/hybrid queries
52. Reranker - Re-rank retrieved results using cross-encoder or LLM-based reranking
53. Context Builder - Assemble retrieved chunks into optimized LLM context window
54. RAG Chain - End-to-end RAG: retrieve + rerank + generate (composite node)

#### LLM Optimization (4 nodes) - NEW
55. Semantic Cache - Cache and retrieve LLM responses by semantic similarity
56. Policy Gate - Pre-flight checks (budget, content policy, rate limits) before LLM calls
57. Model Router - Dynamic model selection based on complexity/cost/latency
58. Short-Circuit Evaluator - Skip LLM when deterministic rules can answer

#### Observability / Compliance (5 nodes)
59. Audit Log - Record what happened, when, who, data in/out for compliance
60. Structured Logging - Log with structured fields (requestId, step, latency)
61. Metrics & Alerting - Track KPIs and fire alerts on anomalies
62. Run History & Replay - View past runs and replay specific items/steps
63. Document Extract / Parse - Extract structured data from PDF/documents/emails

#### Security / Access (4 nodes)
64. Secrets / Credential Vault - Access keys/passwords securely (never hardcoded in workflow)
65. Permission & RBAC - Enforce role-based access (who can edit/run/see secrets)
66. PII Redaction - Mask sensitive data in logs/outputs automatically
67. Approval / Human-in-the-loop - Pause for human approval before risky steps

#### Industry Outputs (7 nodes)
68. Webhook Response - Return response to webhook caller (set status/body/headers)
69. CRM Object Output - Create/update lead/contact/deal in CRM systems
70. Marketing/Ads Event Output - Send conversion/lead events to ad platforms
71. Analytics / Data Warehouse Load - Send data to DWH/BI/analytics pipeline
72. Search/Index Output - Update search index for better discoverability
73. Cache / KV Store Output - Write to cache/key-value store for fast reads
74. Object Storage + Signed Link - Upload file and generate temporary/signed access links

#### Advanced Outputs (6 nodes)
75. Document/Report Generation - Generate PDF/document/invoice/report and deliver
76. Calendar/Task Output - Create calendar events/tasks in scheduling systems
77. Payment/Invoice Output - Create invoice/charge/refund (requires approval + audit)
78. E-sign / Approval Workflow - Send documents for signature/approval chain
79. IoT/Device Command - Send commands to IoT devices (on/off/set value)
80. CI/CD / Deployment - Trigger build/deploy or create PR/release
81. Feature Flag / Config - Toggle feature flags/config for rollout control
82. Enrichment / Lookup - Enrich data from external sources (geo, company, profile)
83. Publish to Message Queue - Send events to MQ/stream for decoupled processing

## Technical Constraints

- Must work with existing ReactFlow-based frontend
- Must maintain backward compatibility with current 21-node workflows
- Python backend (FastAPI + Celery) is the execution engine
- LangGraph runs in Python backend
- Frontend communicates via tRPC (Node.js) which proxies to Python backend
- PostgreSQL for persistence, Redis for caching/queues
- Must support multi-tenant isolation
- Credit-based billing for LLM usage must be maintained

## Design Requirements for Caching/Short-circuit/Policy Gate/Model Routing

### Caching Strategy
- Implement both exact-match (hash-based) and semantic similarity caching
- Cache should be configurable per-node (enable/disable, TTL, similarity threshold)
- Use Redis for fast cache lookups, pgvector for semantic similarity
- Cache key should include: prompt hash, model, temperature, relevant config
- Track cache hit/miss rates in metrics

### Short-Circuit Logic
- Define rule-based conditions that bypass LLM calls entirely
- Example: classification tasks with high-confidence keyword matching
- Example: template responses for known query patterns
- Should be configurable per AI/LLM node via the node config panel

### Policy Gate
- Check credit balance before making LLM call
- Enforce content policy (blocked topics, PII detection)
- Rate limit per user/tenant/workflow
- Maximum token budget per workflow execution
- Configurable policies per node and per workflow

### Model Routing
- Route to appropriate model based on task complexity assessment
- Consider: input length, required capability, cost constraints, latency requirements
- Support fallback chains (primary model -> fallback model -> cheaper model)
- User-configurable routing rules in workflow settings
- Track routing decisions in audit log

## Success Criteria

1. All 74+ node types registered and renderable in the workflow editor
2. LangGraph executing workflows with state management and checkpointing
3. RAG pipeline composable via visual workflow nodes
4. LLM caching reducing redundant API calls by 30%+
5. Policy gate preventing unauthorized/over-budget LLM usage
6. Model routing optimizing cost vs. quality tradeoffs
7. All existing workflows continue to function (backward compatibility)
8. Comprehensive test coverage for new nodes and execution paths

---

## Appendix: Design Patterns for Caching, Short-circuit, Policy Gate, Model Routing

### Architecture Overview

- **Workflow nodes** = deterministic + side-effects (DB writes, send email, call API, deploy)
- **LangGraph** = reasoning/intelligence tasks (summarize, classify, extract from text, plan, tool-calling)
- The system must integrate both seamlessly with 4 optimization layers:
  1. **Caching** to reduce redundant work
  2. **Short-circuit** to exit early when unnecessary
  3. **Policy gate** to control risk before side-effects
  4. **Model routing** to select the right model for cost/risk/quality

### 1. Caching Design (4 Layers)

#### Cache Types
1. **Tool/API cache** - Cache HTTP Request / DB Query / Search results called repeatedly
2. **LLM response cache** - Cache model responses when "input is essentially the same" (include prompt hash + model version in key)
3. **RAG / retrieval cache** - Cache "retrieved document lists" from similar queries to reduce retrieval calls
4. **State / memo cache** - Cache intermediate results like extracted entities, classification, routing decisions

#### Cache Key Formula
```
key = hash(
  task_type +
  normalized_input +
  relevant_context +
  model_id +
  prompt_version +
  policy_version
)
```
Normalization before hashing: trim/remove whitespace, lowercase, remove non-deterministic data (timestamps/random IDs), sort JSON fields consistently.

#### TTL by Data Type
- Fast-changing data (profile/order status): 5-30 minutes
- Policy/config: 1-24 hours
- Classification/extraction (stable prompt): 1-7 days
- Negative caching (404/not found): 1-5 minutes then retry

#### Stability Strategies
- **stale-while-revalidate**: Return cached answer immediately, refresh in background (good for enrichment)
- **cache stampede protection**: Lock per key (prevent multiple workers hitting same expensive call)

#### LangGraph Pattern
Before each node that is cacheable:
- `MakeCacheKey -> CacheGet`
- If hit: return/route out
- If miss: call tool/LLM then `CacheSet`

### 2. Short-Circuit Design (6 Exit Patterns)

Goal: Exit early when "no further work needed" to save time and cost.

**Execution order: cheap checks before expensive steps always**
Rule -> Cache -> Confidence -> Heavy reasoning -> Tools

#### Exit Patterns
1. **Cache-hit exit**: Answer exists in cache -> return immediately
2. **Rule-first exit**: Simple rules can decide -> no LLM needed (e.g., subject has specific keyword -> route to known team)
3. **Confidence exit**: If model confidence >= 0.90 -> execute action directly without further reasoning
4. **No-op exit**: Data hasn't changed -> no update needed (compare payload_hash with last_applied_hash)
5. **Budget/Deadline exit**: Over budget or time -> degrade gracefully or send notification
6. **Policy block exit**: Fails policy -> reject here, or send to approval queue

### 3. Policy Gate Design (3 Gate Positions)

#### Gate Positions
1. **Pre-LLM gate** - Before calling any LLM:
   - Redact PII/PCI/PHI per policy
   - Limit context sent out
   - Check tool allowlist + budget per run
2. **Pre-action gate** (most critical) - Before any side-effect (DB write, payment, email blast, deploy):
   - If `REQUIRE_APPROVAL` -> route to Human-in-the-loop node
3. **Post-action logging gate** (supplementary) - After action: record evidence, metrics, run ID, approver

#### Policy Types
- **Data policy**: Redaction rules + allowlist for data categories
- **Action policy**: Allowlist tools/actions + field-level permissions
- **Spend policy**: Token/cost limits per run/user/day
- **Safety policy**: Block destructive actions without approval
- **Compliance policy**: Enforce logging of input/output/approval/run history

#### Gate Results (3 states)
- `ALLOW` -> Proceed
- `DENY` -> Reject with reason
- `REQUIRE_APPROVAL` -> Route to Human-in-the-loop, wait for approval

#### Approval Triggers (Industry Examples)
- Transaction value > threshold
- Recipients > N count
- Action = delete / deploy / change production config
- Contains sensitive data not in allowlist

> Important: Policy gates should be deterministic (rule-based), never LLM-decided.

### 4. Model Routing Design (2-Stage)

#### Stage 1: Task Triage (lightweight/fast)
Assess:
- Task type: classify / extract / generate / plan / agent
- Complexity: complexity_score
- Risk: risk_score
- Needs retrieval/tools?
- Needs structured output schema?

#### Stage 2: Select Model + Strategy
- Simple task -> small model or deterministic template
- Medium task -> mid-tier model
- Hard/high-risk task -> strong model + verifier + (optional) approval

#### Practical Routing Signals
- Input length (tokens)
- Number of constraints/conditions
- Needs document retrieval (RAG)
- Needs structured output schema + validator
- Risk to business/data/production

#### Routing Selects "Strategy" Not Just Model
- **Extract mode**: structured output + schema validator
- **Classify mode**: label set + confidence threshold
- **Generate mode**: template + safety filter
- **Agent mode**: allowlist tools + loop limit + budget cap

#### Verifier for Critical Cases
- Verifier can be deterministic or a smaller/cheaper model
- Checks: schema valid? PII leaked? Forbidden actions? Consistent with retrieved data?

### 5. Combined Execution Blueprint (Execution Order)

1. **Normalize Input**
2. **Policy Gate (pre-LLM)**: redact + tool allowlist + budget check
3. **Cache Check**: tool/LLM/retrieval/state
4. **Short-circuit Router**: rule-first / confidence / no-op / budget exit
5. **Model Router**: select model + strategy + max loops
6. **Run Subgraph**:
   - Retrieval (optional + cached)
   - LLM call (cached)
   - Schema validate
7. **Policy Gate (pre-action)**:
   - If `REQUIRE_APPROVAL` -> Human-in-the-loop node
8. **Execute Actions**: DB/write/send/queue/storage
9. **Write Cache + Audit + Metrics**
10. **Return / Webhook Response**

### 6. Production Efficiency Checklist
- Set **confidence threshold** and **max loops** (prevent agent infinite loops)
- Build dashboard for **cache hit rate** (low hit rate = bad key/TTL/normalization)
- Always place **cheap gates before expensive calls**
- Every side-effect must pass through **policy + idempotency**
- Have **fallback strategy**: model/service down -> degrade gracefully or notify
- Set **cost budget per run**: over limit -> stop/downgrade model tier

### 7. Triage Scoring Examples
- **complexity_score**: input length + number of conditions + needs retrieval/tools
- **risk_score**: financial/sensitive data/production impact/recipient count
- Routing matrix:
  - Low complexity + low risk -> small model / template
  - Medium complexity + low risk -> mid model
  - High risk (any complexity) -> strong model + verifier + (optional) approval
