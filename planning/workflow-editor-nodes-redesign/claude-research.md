# Research Findings: Workflow Editor Node System Redesign

## Part 1: Codebase Research

### 1. Workflow Editor Frontend

**WorkflowEditor.tsx** (1066 lines): ReactFlow-based visual builder with 5 hardcoded node types:
- LLM Call, Approval Gate, Conditional, Loop, Generate Image
- Custom nodes use `Handle` components (type="target" left, type="source" right)
- `NodeConfigPanel` provides basic config UI per node type
- Example workflows hardcoded as static array (lines 114-260)
- `loadExample()` replaces canvas with template data
- `compileMutation = trpc.workflow.compile.useMutation()` exists but NO compile button in UI
- Only "Save" and "Run" buttons in header

**Workflows.tsx** (309 lines): Execution listing page with:
- Status filters (draft, running, completed, failed, cancelled)
- Search by workflow name
- Example templates shown when no workflows exist (hardcoded cards)
- Links to editor with `?template=` query param

### 2. tRPC Workflow Router (`apps/web/server/routers/workflow.ts`)

5 procedures proxying to Python backend:
- `compile` — POST `/api/v1/workflow/compile` (sends ReactFlow JSON)
- `list` — GET `/api/v1/workflow/list`
- `execute` — POST `/api/v1/workflow/execute`
- `getStatus` — GET `/api/v1/workflow/status/{id}`
- `cancel` — POST `/api/v1/workflow/cancel/{id}`

Uses `fetchPythonBackend()` helper with JWT auth forwarding.

### 3. Python Backend Orchestrator

**FlowCompiler** (`app/orchestrator/flow_compiler.py`, 143 lines):
- Converts ReactFlow JSON → LangGraph-compatible manifest
- 14 node types mapped: llm, approval, conditional, loop, image, video, email, telegram, webhook, api_call, data_transform, delay, rag_query, custom
- Enforces loop limits (max 100 iterations)
- Validates edge references
- Returns compiled manifest dict

**WorkflowOrchestrator** (`app/orchestrator/orchestrator.py`, 150+ lines):
- LangGraph-based execution engine
- PostgreSQL checkpointing for state persistence
- Step-by-step execution with state tracking

**Models** (`app/orchestrator/models.py`):
- ExecutionState, WorkflowStep, WorkflowReport, CheckpointData

### 4. Approval Gates System

**In-memory service** (`orchestrator/approval_gates/approval_service.py`): Rule-based with callbacks
**Database-backed** (`services/approval_db_service.py`): Persistent storage via SQLAlchemy
- Tables: approval_requests, approval_responses
- Status: pending, approved, rejected, expired, cancelled
- Stub rule methods (create_rule, list_rules, etc.)
- `can_user_approve()` currently returns True for all users

### 5. RAG System (Already Exists!)

**Hybrid RAG engine** (`orchestrator/rag/hybrid_rag.py`): Combines BM25 + vector + reranking
**Vector store** (`pgvector_store.py`): PostgreSQL-backed with multi-tenancy support
**Embedding service** (`embedding_service.py`): OpenAI, Cohere, and local model support with caching
**Retrievers**: Vector, BM25, and reranker components

### 6. LLM Gateway & Proxy

Multi-provider support: OpenAI, Anthropic, Google, Groq, OpenRouter
- Request/Response models with typed Pydantic schemas
- Gateway V1, V2, and unified implementation
- Media generation: Image, video, audio with Kie.ai provider

### 7. Database Schema (Drizzle ORM)

Core tables: users, creditTransactions, galleryItems, creditPackages
Enums: role, plan, transactionType, packageType, billingPeriod, contentType, aspectRatio, messageRole, entityType, apiStyle

### 8. 30+ Backend Services

AssetService, StorageService, RefundService, MarketplaceService, R2StorageService, ModerationService, SkillPromptService, MediaTaskService, PromptTemplateService, NotificationService, ProviderConfigService, EmailService, HealthService, MemoryService, EpisodicMemoryService, LLMMonitoringService, PaymentService, OAuthService, AnalyticsService, ExportService, AuthService, TicketService, StreamingService, EmbeddingService, AuditService, DashboardService, RateLimitService, ApprovalDBService

### 9. Current Implementation Status

- **Phase 1**: ✅ Flow compilation only (ReactFlow → manifest)
- **Phase 2**: ❌ Execution, templates, advanced nodes (not implemented)
- **Phase 3**: ❌ RAG integration, multi-tenancy, RBAC (planned)

### 10. Testing Structure

- Integration tests: `tests/integration/test_workflow_integration.py`
- Unit tests: `tests/test_workflows_api.py` (148 lines)
- 80% minimum coverage enforced
- 8 test markers: unit, integration, e2e, slow, auth, credits, llm, payment

---

## Part 2: Web Research — n8n Node Architecture

### Node Type System

n8n organizes nodes into four categories:
1. **Trigger Nodes** — Initiate workflows via webhooks, schedules, manual triggers
2. **Action/Regular Nodes** — Perform tasks: API calls, DB queries, data transforms
3. **Core Nodes** — Built-in: Code, Filter, Merge, Wait, Stop and Error
4. **Cluster Nodes (AI)** — AI Agent, LLM Chain, Vector Stores, embeddings, tools

### INodeType Interface

Every n8n node implements `INodeType` with:
- **Description Object** — Metadata, display name, icon, input/output config, credentials, properties array
- **Execute Method** — `async execute(this: IExecuteFunctions)` with `getInputData()`, `getNodeParameter()`, `returnJsonArray()`
- **Optional Handlers** — Credential test, webhook, poll methods

Two development styles:
- **Declarative** — JSON config mapping API endpoints to operations
- **Programmatic** — Full TypeScript for complex logic

### Data Flow Between Nodes

Data flows as array of **items** conforming to `INodeExecutionData`:
```typescript
interface INodeExecutionData {
  json: IDataObject;           // Required: JSON payload
  binary?: IBinaryKeyData;     // Optional: binary attachments
  pairedItem?: IPairedItemData; // Item linking metadata
}
```
- All data wrapped in `{ json: { ... } }` format
- Arrays enable batch processing (N items in → M items out)
- Binary data for files/images with Buffer, MIME type, filename
- Multiple outputs enable branching (IF node → true/false paths)

### Credential Management

Centralized, encrypted system:
- AES-256-CBC encryption using `N8N_ENCRYPTION_KEY`
- Supported: HttpBasicAuth, OAuth2Api, ApiKeyAuth, JwtAuth, custom
- Nodes declare credential requirements in `credentials` property
- Decrypted values injected at runtime via `IExecuteFunctions`
- Frontend redacts sensitive fields with sentinel values

### Error Handling

Multi-level:
1. **Continue On Fail** — Per-node, workflow continues despite failure
2. **Error Output Branch** — Split into success/error paths
3. **Error Trigger Workflow** — Separate workflow fires on failure
4. **Stop And Error Node** — Deliberately halts with custom message
5. **NodeOperationError/NodeApiError** — Custom error classes with remediation hints

---

## Part 3: Web Research — ReactFlow Advanced Patterns

### Custom Nodes with Typed Handles

```tsx
import { Handle, Position } from '@xyflow/react';

export function LLMNode({ data }: NodeProps<LLMNodeType>) {
  return (
    <div className="llm-node">
      <Handle type="target" position={Position.Left} id="prompt-in" />
      <div>{data.modelName}</div>
      <Handle type="source" position={Position.Right} id="response-out" />
    </div>
  );
}
```

Critical: `nodeTypes` must be defined outside component or memoized.

### TypeScript Type Safety

```typescript
type LLMNode = Node<{ model: string; temperature: number }, 'llm'>;
type PromptNode = Node<{ template: string; variables: string[] }, 'prompt'>;
type AppNode = LLMNode | PromptNode;
```

### Handle Validation

- `isValidConnection` callback for type checking
- Handles receive CSS classes: `connecting` and `valid` for visual feedback
- Use `visibility: hidden` not `display: none` for hidden handles

### Data Flow Computation

Two-step pattern:
1. **Store**: `updateNodeData` writes values to node's data object
2. **Retrieve**: `useNodeConnections` + `useNodesData` reads upstream data

### Performance

- Built-in virtualization (only visible nodes rendered)
- Wrap custom nodes in `React.memo`
- Avoid full node array selection from store
- Use `hidden` property for collapsed subtrees
- Separate interaction state from nodes array (Zustand/Redux)

---

## Part 4: Web Research — LLM Workflow Builder Patterns

### LangFlow Architecture

Python-based (FastAPI + SQLAlchemy):
1. User builds flow on ReactFlow canvas
2. Constructs DAG from nodes/edges
3. Topologically sorts for execution order
4. Each component's `def_build` validates and prepares
5. Sequential execution in dependency order

**Component structure:**
```python
class MyLLMComponent(Component):
    display_name = "My LLM Node"
    inputs = [
        MessageTextInput(name="prompt", display_name="Prompt"),
        DropdownInput(name="model", options=["gpt-4", "claude-3"]),
    ]
    outputs = [
        Output(name="response", method="generate_response")
    ]
    def generate_response(self) -> Message:
        return Message(text=result)
```

**Input types**: StrInput, MultilineInput, IntInput, BoolInput, DropdownInput, FileInput, CodeInput, ModelInput, HandleInput
**Data types**: Message, Data, DataFrame, Embeddings, LanguageModel, Memory, Tool

### Flowise Architecture

Node.js-based (Express + ReactFlow):
- All components implement `INode` interface
- `baseClasses` array for type compatibility
- Workflows stored as `IChatFlow` with `flowData` JSON
- Breadth-first traversal execution
- `{{variable}}` syntax for template resolution

### Prompt Templates with Variable Binding

- LangFlow: `{variable}` placeholders, input ports auto-generated per variable
- Flowise: `{{variable}}` syntax resolved during graph execution

### Streaming

- LangFlow: SSE with `token` and `end` events
- Flowise: SSE with `start`, `token`, `error`, `end`, `metadata`, `sourceDocuments`
- LangGraph modes: Values, Updates, Messages, Custom, Debug

---

## Part 5: Web Research — Template Marketplace Patterns

### n8n Template System (7,800+ templates)

Template JSON structure:
```json
{
  "name": "Template name",
  "categories": ["Category1"],
  "version": "1.0",
  "nodes": [...],
  "connections": {...},
  "settings": {...}
}
```

Required API endpoints for self-hosted:
- `GET /templates/categories` — Category taxonomy
- `GET /templates/collections` — Curated collections
- `GET /templates/search` — Searchable with metadata
- `GET /templates/workflows/{id}` — Single template

### Database Schema for Templates

Recommended:
- **templates** — id, name, description, workflow_json, author_id, version, download_count, rating
- **template_categories** — id, name, slug, parent_id (hierarchical)
- **template_category_map** — template_id, category_id (many-to-many)
- **template_collections** — id, name, description, curated_by

### Search & Filter

- Full-text search across name, description, node types
- Hierarchical category filtering
- Tag-based filtering
- Sort by popularity, rating, recency, relevance
- Node-based search (find templates using specific integrations)

### Best Practices

- Max 15 nodes per template
- Meaningful node names
- Built-in error handling
- Environment variables for credentials
- Modular architecture

---

## Part 6: Web Research — RAG Integration in Workflows

### RAG Node Architecture

Two distinct sub-flows:

**Ingestion Flow (offline):**
1. Document Loader → 2. Text Splitter → 3. Embedding Model → 4. Vector Store

**Query Flow (online):**
1. Chat Input → 2. Embed Query → 3. Vector Search → 4. Parse Chunks → 5. Prompt Template → 6. LLM → 7. Output

### SmartSpecPro Already Has RAG!

Existing components that can be leveraged:
- `orchestrator/rag/hybrid_rag.py` — HybridRAG engine
- `pgvector_store.py` — PostgreSQL vector store
- `embedding_service.py` — Multi-provider embeddings
- BM25 + vector + reranker retrievers

### Retriever Configuration

Key parameters for a RAG node:
- **top_k** — Number of chunks (3-5 for Q&A)
- **score_threshold** — Minimum similarity
- **hybrid_search** — Combine vector + BM25
- **re-ranking** — Cross-encoder re-scoring
- **metadata_filtering** — Filter by source, date, category

### Chunking Strategies

| Strategy | Best For | Recall |
|----------|----------|--------|
| RecursiveCharacterTextSplitter (400-512 tokens) | General purpose | 85-90% |
| Page-Level | PDFs | Highest accuracy |
| Semantic | High precision | +9% over recursive |

### Advanced Retrieval (2025)

- Multi-Query RAG — Multiple query variations, merge results
- Graph RAG — Document relationship graphs
- Contextual Compression — Only query-relevant portions
- Parent Document Retrieval — Small chunks for matching, full doc for context

---

## Key Takeaways for Implementation

### Architecture Decision: n8n-Inspired Node System

1. **Each node type needs**: Typed inputs, typed outputs, credential references, execute method, error handling
2. **Data flows as items**: `{ json: {...}, binary?: {...} }` between nodes
3. **Node config panels**: Must show real options from backend (models, users, collections)
4. **Variable references**: Use `{{nodeId.outputField}}` syntax with autocomplete
5. **Templates in database**: Not hardcoded, with search/filter/categories
6. **RAG node**: Leverage existing HybridRAG + pgvector infrastructure
7. **Compile step**: Validate + transform to executable manifest
8. **Streaming execution**: SSE for real-time progress updates

### Integration Map

| Node Type | Backend Service | Config Needed |
|-----------|----------------|---------------|
| LLM Call | LLMGateway/LLMProxy | Model selection from providers, prompt template, params |
| Approval Gate | ApprovalDBService | User/role picker from DB, timeout, escalation |
| Conditional | FlowCompiler | Expression builder with variable refs |
| Loop | FlowCompiler | Iterator source, break condition, max iterations |
| Generate Image | MediaTaskService + Celery | Provider, size, quality, style |
| RAG Query | HybridRAG + EmbeddingService | Collection, top_k, search mode, filters |
| Data Transform | New service | JSONPath/JMESPath expressions |
| HTTP Request | New service | URL, method, headers, body template |
| Email | EmailService | Recipients, subject, body template |
| Telegram | NotificationService | Chat ID, message template |

### Sources

- [n8n Node Documentation](https://docs.n8n.io/integrations/creating-nodes/overview/)
- [n8n Data Structure](https://docs.n8n.io/data/data-structure/)
- [n8n Credential System](https://deepwiki.com/n8n-io/n8n/4.5-credential-system)
- [n8n Error Handling](https://docs.n8n.io/flow-logic/error-handling/)
- [ReactFlow Custom Nodes](https://reactflow.dev/learn/customization/custom-nodes)
- [ReactFlow Computing Flows](https://reactflow.dev/learn/advanced-use/computing-flows)
- [ReactFlow TypeScript](https://reactflow.dev/learn/advanced-use/typescript)
- [LangFlow Components](https://docs.langflow.org/concepts-components)
- [LangFlow Custom Components](https://docs.langflow.org/components-custom-components)
- [Flowise Architecture](https://deepwiki.com/FlowiseAI/Flowise)
- [n8n Templates](https://docs.n8n.io/workflows/templates/)
- [n8n Database Structure](https://docs.n8n.io/hosting/architecture/database-structure/)
- [LangFlow RAG](https://docs.langflow.org/vector-store-rag)
- [Best Chunking Strategies 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
