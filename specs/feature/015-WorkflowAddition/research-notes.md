# Research Notes: Workflow Addition Feature

## Codebase Reconnaissance

### 1. Architecture Overview

The workflow system consists of three main layers:
- **Frontend (React/TypeScript)**: Workflow editor UI, node registry hook, dynamic config
- **Backend (TypeScript/Node)**: tRPC router, workflow persistence, skill registry
- **Python Backend (FastAPI)**: Node executors, workflow compilation, execution engine

### 2. Frontend Components

#### 2.1 Node Registry Hook (`apps/web/client/src/lib/workflow/useNodeRegistry.ts`)
- Fetches node types from `/api/v1/workflows/node-types`
- Caches with TanStack Query (5 min fresh, 10 min cache)
- Supports 12 categories: ai, flow_control, human, skills, media, triggers, inputs, outputs, data, integrations, observability, security
- Current DataType union: `text | json | array | image | number | boolean | any`

#### 2.2 Dynamic Node Config (`apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`)
- Renders form controls based on `ui_type`
- Supports: text, textarea, number, slider, select, toggle, json_editor, tags, code_editor, form_builder
- Recently added: SkillSelector component for skill nodes
- Missing: Template engine, XML parser, CSV parser components

### 3. Backend Node Registry (`python-backend/app/orchestrator/node_registry.py`)

#### 3.1 Current Node Types (18 types)
```
AI: llm_call, rag_query
Flow Control: conditional, loop
Human: approval_gate
Media: generate_image
Skills: skill (field: skill_id)
Triggers: manual_trigger
Inputs: form_input
Outputs: workflow_response
Data: set_variable, merge_data, code_runner, map_array, database_query, filter, split, batch
```

#### 3.2 InputSpec Structure
```python
@dataclass
class InputSpec:
    name: str                    # Field identifier
    display_name: str            # UI label
    data_type: str              # text, json, array, image, number, boolean, any
    ui_type: str                # text, textarea, number, slider, select, toggle, json_editor
    required: bool
    accepts_connection: bool     # Can receive from upstream node
    default: Any = None
    options: list[dict] | None = None        # Static options
    options_endpoint: str | None = None      # Dynamic options API
    validation: dict | None = None           # {min, max, pattern, ...}
    placeholder: str | None = None
```

### 4. Executor Architecture (`python-backend/app/orchestrator/node_executors/`)

#### 4.1 Base Protocol
```python
class NodeExecutor(Protocol):
    async def execute(
        self,
        data: NodeExecutionData,      # node_id, node_type, config, inputs, state
        context: ExecutionContext,    # user_id, tenant_id, workflow_id, execution_id, credits
    ) -> dict[str, Any]:              # Returns output mapping
```

#### 4.2 Existing Executors
- **Base Executors**: approval_executor, conditional_executor, image_executor, llm_executor, loop_executor, rag_executor, skill_executor
- **Data Executors**: batch_executor, code_executor, database_query_executor, filter_executor, map_executor, merge_executor, set_executor, split_executor, transformer_executor, validator_executor
- **Integration Executors**: (directory exists but may be empty)
- **Flow Executors**: (directory exists)
- **Trigger Executors**: (directory exists)

#### 4.3 Risk Assessment
- `database_query_executor.py`: Contains SQL execution logic - NEEDS SECURITY AUDIT
- `code_executor.py`: Python code execution - NEEDS SANDBOXING
- `approval_executor.py`: May lack notification system integration

### 5. Skill Registry (`apps/web/server/services/skillRegistry.ts`)

#### 5.1 Skill Definition
```typescript
interface SkillDefinition {
  id: string;                    # slug
  dbId: number;
  name: string;
  description: string;
  icon: string;
  type: SkillType;              # image-generation, video-generation, etc.
  triggers: PatternRule[];      # Auto-trigger patterns
  requiresExplicit: boolean;    # If not auto-trigger
  creditMultiplier: number;
  enabledByDefault: boolean;
  priority: number;
  models?: string[];
  defaultModel?: string;
  systemPrompt?: string;
  skillContent?: string;        # Skill.md content
  executionMode: "llm-only" | "endpoint" | "chain";
  chainTo?: string;
}
```

#### 5.2 Workflow-to-Skill Conversion Path
- Skills are stored in database with `skills` table
- Private skills can be created with `visibility: private` and `owner_user_id`
- Skill executor exists and can invoke other skills
- No existing workflow-to-skill conversion logic found

### 6. Options Endpoints Status

| Endpoint | Used By | Status | Risk |
|----------|---------|--------|------|
| `/api/v1/workflows/node-types` | useNodeRegistry | ✅ Working | Low |
| `/api/v1/workflows/skills` | skill node | ✅ Working | Low |
| `/api/v1/workflow/available-models` | llm_call | ⚠️ NEEDS VERIFY | Medium |
| `/api/v1/workflow/rag-collections` | rag_query | ⚠️ NEEDS VERIFY | Medium |
| `/api/v1/workflow/available-approvers` | approval_gate | ⚠️ NEEDS VERIFY | Medium |
| `/api/v1/workflow/image-providers` | generate_image | ⚠️ NEEDS VERIFY | Medium |

### 7. Database Schema (Workflow-related)

#### 7.1 Workflows Table
```sql
- id: serial primary key
- userId: integer (foreign key)
- tenantId: varchar(255) nullable
- name: varchar(255)
- description: text nullable
- workflowJson: jsonb
- status: varchar(50) - draft, compiled, running, completed, failed
- defaultModel: varchar(255) nullable
- schemaVersion: varchar(50)
- createdAt, updatedAt: timestamp
```

#### 7.2 Skills Table
```sql
- id: serial primary key
- slug: varchar(255) unique
- name: varchar(255)
- category: varchar(100)
- isEnabled: boolean
- enabledByDefault: boolean
- isAutoTrigger: boolean
- triggerPatterns: jsonb
- skillContent: text
- systemPrompt: text
- folderPath: varchar(500)
- executionMode: varchar(50)
- chainTo: varchar(255) nullable
- contentHash: varchar(64) - for sync detection
```

### 8. Security Considerations

#### 8.1 High Risk
- **Code Executor**: Runs user-provided Python code - requires sandbox/restricted environment
- **Database Query Executor**: Direct SQL execution - requires query validation and tenant isolation
- **File Operations**: Read/Write files - requires path validation and access control

#### 8.2 Medium Risk
- **HTTP Request**: External API calls - requires allowlist/blocklist, timeout controls
- **S3 Storage**: Cloud storage access - requires credential management

#### 8.3 Existing Security
- Tenant isolation via `tenant_id` in ExecutionContext
- Credit-based rate limiting
- Workflow ownership checks
- ProtectedProcedure for sensitive operations

### 9. Missing Integration Points

#### 9.1 Email Service
- No email service found in services directory
- Would need integration with SMTP or email provider (SendGrid, AWS SES)

#### 9.2 Webhook System
- No webhook registration/management system found
- Would need webhook URL generation and callback handling

#### 9.3 Scheduler
- No cron/scheduler service found
- Would need job queue (Bull, node-cron) or external scheduler

### 10. Category Expansion

Current categories support extensions:
- `integrations` - For HTTP, WebSocket, GraphQL, Email, Slack
- `triggers` - For Schedule, Webhook (already partially exists)
- `data` - For File, CSV, JSON, XML, Template (already has 8 nodes)
- `ai` - For Prompt Template, Output Parser, Model Router

All categories already defined in TypeScript union type.

---

## Web Research Findings

### Topic 1: n8n/Workflow Node Architecture

**Key Findings:**
- n8n uses a modular node architecture with clear separation between trigger, action, and logic nodes
- Each node has a standardized interface: `execute()` method returning `INodeExecutionData[][]`
- Node categories: Trigger (orange), Regular (blue), Logic (yellow)
- Custom nodes require: node descriptor (JSON), executor class, icon
- Best practice: Nodes should be atomic (single responsibility)

**Relevance to Our System:**
- Our executor protocol (`NodeExecutor`) aligns with n8n's approach
- Should maintain atomic node design (already doing this)
- Color-coding by category is good UX pattern (already implemented)

**Source:** 
- https://blog.n8n.io/ai-agentic-workflows/
- https://www.itechcloudsolution.com/blogs/how-to-use-custom-nodes-in-n8n-for-advanced-workflows/

### Topic 2: Python Code Sandbox Security

**Key Findings:**
- **RestrictedPython**: Zope foundation library for restricting Python execution
  - Removes dangerous builtins (__import__, open, file)
  - Allows defining custom globals/locals
  - CVE-2023-XXXX showed it's not foolproof - needs careful configuration
- **Docker**: Common but "not designed as security boundary"
- **WebAssembly (WASM/Pyodide)**: Emerging best practice for browser/edge code execution
  - LangChain Sandbox uses Pyodide for secure execution
  - Slower startup but strong isolation
- **Firecracker**: AWS's microVM - secure but complex

**Recommendation for Our System:**
- **Phase 1**: RestrictedPython with strict globals whitelist
- **Phase 2**: Docker containers with resource limits
- **Phase 3**: Consider WASM for edge deployment

**Source:**
- https://stackoverflow.com/questions/33252226/how-can-i-safely-run-untrusted-python-code
- https://github.com/advisories/GHSA-wqc8-x2pr-7jqh (CVE for RestrictedPython)
- https://medium.com/the-ai-forum/build-a-code-generator-and-executor-agent-using-langgraph-langchain-sandbox-and-groq-kimi-k2-291a88e66e6f

### Topic 3: Workflow Error Handling Patterns

**Key Findings:**
- **Retry Pattern**: Exponential backoff, jitter, max attempts
- **Circuit Breaker**: Three states (Closed, Open, Half-Open)
  - Prevents cascade failures
  - Configurable failure threshold and timeout
- **Dead Letter Queue (DLQ)**: For non-retryable failures
  - Schema mismatches, malformed payloads
  - Manual or automated recovery
- **Saga Pattern**: Distributed transaction compensation

**Implementation Guidance:**
- Circuit breaker should track failures per external service
- DLQ items should include: original message, error context, timestamp, retry count
- Provide monitoring/alerting for DLQ depth

**Source:**
- https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
- https://temporal.io/blog/error-handling-in-distributed-systems
- https://www.superstream.ai/blog/kafka-dead-letter-queue

### Topic 4: GraphQL vs REST for Workflow Integrations

**Key Findings:**
- **GraphQL Advantages**:
  - Single endpoint, precise data fetching
  - Strong typing via schema
  - Better for complex relationships
- **REST Advantages**:
  - Simpler caching
  - Better tooling ecosystem
  - Easier debugging
- **Workflow Use Case**: 
  - REST for simple CRUD operations
  - GraphQL for complex data aggregation workflows

**Decision for Our System:**
- Implement both HTTP Request (REST) and GraphQL Request nodes
- HTTP Request as higher priority (more universal)
- GraphQL Request for specific use cases

**Source:**
- https://blog.postman.com/graphql-vs-rest/
- https://upsun.com/blog/graphql-vs-rest/

### Topic 5: WebSocket Real-time Streaming Patterns

**Key Findings:**
- **Connection Management**: Heartbeat/ping-pong, auto-reconnect with backoff
- **Scalability**: Use Redis Pub/Sub or message queue for multi-server setups
- **Error Handling**: Distinguish between connection errors vs message errors
- **Message Patterns**: Request/Response, Pub/Sub, Streaming
- **Security**: Authentication during handshake, origin validation

**Implementation Guidance:**
- WebSocket client node should support:
  - Connection state management (connecting, open, closing, closed)
  - Automatic reconnection with exponential backoff
  - Message queuing while disconnected
  - Authentication token refresh

**Source:**
- https://ably.com/topic/websocket-architecture-best-practices
- https://www.geeksforgeeks.org/system-design/websockets-for-real-time-distributed-systems/
- https://render.com/articles/building-real-time-applications-with-websockets

---

## Risk Summary

| Risk | Level | Mitigation |
|------|-------|------------|
| Code execution security | HIGH | Implement sandbox (RestrictedPython, Docker) |
| Database query injection | HIGH | Use ORM, parameterized queries, tenant validation |
| External API abuse | MEDIUM | Add rate limiting, timeouts, allowlists |
| File system access | MEDIUM | Path validation, chroot, permission checks |
| Missing executors | MEDIUM | Implement stub executors with "not implemented" error |
| Options endpoints | LOW | Create mock/fallback data for missing endpoints |

---

## Compatibility Assessment

### Workflow-to-Skill Conversion
- **Compatible**: LLM Call, RAG Query, Conditional, Data Transformations
- **Needs Adapter**: Form Input → Conversational, Approval Gate → Chat-based
- **Not Compatible**: Webhook Trigger, Schedule Trigger, Parallel (chat limitation)

### Node Type Additions
- Adding new node types is backward compatible
- Existing workflows continue to work
- New nodes appear in palette automatically after registry update
- Frontend dynamically renders new ui_types
