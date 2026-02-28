# Agency-Swarm Integration — TDD Plan

> Companion to `claude-plan.md`. Defines tests to write BEFORE implementing each section.

---

## Testing Context

**Existing codebase patterns (from research):**
- **Python:** pytest with pytest-asyncio, 80% coverage minimum, markers: unit, integration, e2e, llm, credits, sandbox
- **Node.js:** Vitest with React Testing Library
- **DB for tests:** SQLite in-memory with StaticPool (Python), mock DB (Node.js)
- **Config:** `python-backend/pytest.ini`, `python-backend/tests/conftest.py`
- **Fixtures:** conftest.py provides DB session, test client, auth fixtures
- **New marker needed:** `@pytest.mark.agency`

---

## 2. Pre-Validation Phase (Phase 0)

### 2.1 Python 3.12 Upgrade

```python
# Test: existing pytest suite passes on Python 3.12 (run full suite, verify 80% coverage)
# Test: asyncio changes — verify existing async endpoints still work
# Test: typing module — verify type hints compile without errors
```

### 2.2 Full Dependency Resolution

```python
# Test: openai v2 — verify OpenAIError replaced with APIError across all files
# Test: openai v2 — verify chat.completions.create() still works with existing params
# Test: openai v2 — verify tool call .output handling works for string type
# Test: pydantic 2.11 — verify no DeprecationWarning for model_fields access
# Test: pydantic 2.11 — verify existing Pydantic models validate correctly
# Test: langchain-openai — verify LangGraph workflow execution still works
```

### 2.5 Contract Tests

```python
# Test: LLM proxy — send request to /api/llm/v2/chat, verify response shape unchanged
# Test: credit deduction — verify deductCreditsForModel returns same shape
# Test: workflow orchestrator — run a simple 2-node workflow, verify completion
# Test: sandbox dispatch — verify dispatch still works with existing featureTypes
```

---

## 3. Database Schema (Phase 1)

### 3.2 Drizzle Tables

```typescript
// Test: agencies table — create agency with all required fields, verify persisted
// Test: agencies table — unique constraint on (tenantId, slug) enforced
// Test: agencies table — cascade delete removes agents, tools, flows, conversations
// Test: agency_agents — create agent with entry point, verify only one per agency
// Test: agency_agent_tools — junction table correctly links agents to tools
// Test: agency_communication_flows — unique constraint on (agencyId, from, to)
// Test: agency_conversations — UUID primary key format
// Test: tenant isolation — query agencies filtered by tenantId, verify no cross-tenant leak
```

### 3.3 SQLAlchemy Tables

```python
# Test: agency_messages — create message without FK constraint to conversation table
# Test: agency_messages — pii_redacted flag defaults to false
# Test: agency_runs — create run with all status values (queued, running, completed, failed, cancelled)
# Test: agency_runs — total_credits_used = gateway_cost + multiplier_markup
# Test: migration ordering — Drizzle tables exist before Alembic runs
```

---

## 4. Python Service Layer (Phase 1-2)

### 4.1 AgencySwarmAdapter

```python
# Test: create_agent — returns Agent with OpenAIChatCompletionsModel pointing to gateway
# Test: create_agent — model base_url matches NODEJS_INTERNAL_URL/api/llm/v2
# Test: create_agency — creates Agency with correct communication_flows
# Test: create_agency — persistence hooks are configured
# Test: create_agency — user_context includes tenant_id
# Test: run — executes agency and returns RunResult
# Test: run — handles transient error with retry (mock agency to raise timeout)
# Test: run — handles permanent error with immediate fail (mock auth error)
# Test: run_stream — returns synchronously (NOT awaited)
# Test: run_stream — yields correct SSE event types
# Test: thread safety — 10 concurrent create_agency calls produce isolated instances
```

### 4.2 Agency Service

```python
# Test: load_agency — reads agency config directly from DB (no HTTP call)
# Test: load_agency — raises NotFoundError for non-existent agency
# Test: load_agency — raises PermissionError for wrong tenant
# Test: execute_run — full lifecycle: load → construct → pre-check → execute → markup
# Test: execute_run — creates agency_runs record with correct status transitions
# Test: execute_run — per-request Agency instantiation (no shared state between runs)
# Test: execute_run_stream — yields SSE events in correct order (run_started → tokens → run_finished)
# Test: execute_run_stream — sends heartbeat every 15 seconds
```

### 4.3 Agency Persistence Hooks

```python
# Test: save callback — writes messages to agency_messages table
# Test: save callback — applies PII redaction to agent-to-agent messages
# Test: save callback — does NOT redact user-facing final responses
# Test: load callback — loads messages ordered by created_at
# Test: load callback — returns empty list for new conversation
# Test: round-trip — save then load preserves message content (non-PII)
```

### 4.4 Agency Credits

```python
# Test: pre_check — returns true when user has enough credits
# Test: pre_check — returns false when user has insufficient credits
# Test: apply_multiplier_markup — calculates correct markup (e.g., 1.5x multiplier on $10 gateway cost = $5 markup)
# Test: apply_multiplier_markup — multiplier of 1.0 results in zero markup
# Test: estimate_run_cost — conservative estimate based on agent count and model
# Test: credit flow — failed run charges only completed steps (no refund needed)
```

### 4.5 Agency Tool Bridge

```python
# Test: SSPToolBridge — low risk tool routes to direct HTTP
# Test: SSPToolBridge — high risk tool routes to OpenSandbox
# Test: SSPToolBridge — tool not in agency whitelist is blocked
# Test: SSPToolBridge — tool in whitelist is allowed
# Test: SSPToolBridge — ToolConfig model validates correctly
# Test: tool resolution — resolve tool by ID from DB
```

### 4.6 PII Redaction

```python
# Test: redact_pii — redacts email addresses (user@example.com → [EMAIL])
# Test: redact_pii — redacts phone numbers (+1-555-123-4567 → [PHONE])
# Test: redact_pii — redacts SSN patterns (123-45-6789 → [SSN])
# Test: redact_pii — does NOT corrupt JSON objects
# Test: redact_pii — does NOT corrupt URLs
# Test: redact_pii — does NOT corrupt version numbers (v3.12.0)
# Test: redact_pii — does NOT corrupt UUID strings
# Test: redact_pii — returns (content, was_redacted=True) when PII found
# Test: redact_pii — returns (content, was_redacted=False) when no PII
```

### 4.7 FastAPI Router

```python
# Test: POST /run — requires auth headers (401 without)
# Test: POST /run — returns run result with agency_run ID
# Test: POST /stream — returns SSE response with correct content-type
# Test: GET /runs — lists runs for agency, filtered by tenant
# Test: POST /cancel — cancels running agency run
# Test: feature flag — all endpoints return 404 when AGENCY_SWARM_ENABLED=false
```

---

## 5. Node.js Integration Layer (Phase 1-2)

### 5.1 tRPC Router

```typescript
// Test: list — returns agencies filtered by tenant
// Test: create — creates agency with valid input, returns ID
// Test: create — rejects when rate limit exceeded (10/day)
// Test: update — updates agency, rejects if not owner
// Test: delete — soft-deletes agency (sets status=archived)
// Test: sendMessage — dispatches to Python bridge, returns result
// Test: sendMessage — rejects when rate limit exceeded (60/min)
// Test: listTemplates — returns available templates
// Test: createFromTemplate — clones template into new agency
// Test: adminToggleTenant — requires admin role
// Test: adminKillRun — sends cancel to Python bridge
```

### 5.3 SSE Stream Proxy

```typescript
// Test: sets correct SSE headers (Content-Type, Cache-Control, X-Accel-Buffering)
// Test: proxies SSE events from Python to client
// Test: checks feature flag before proxying
// Test: checks credits before proxying
// Test: handles Python connection drop gracefully
```

### 5.5 CreditSourceType

```typescript
// Test: "agency" is valid CreditSourceType
// Test: deductCredits with sourceType="agency" records correctly
```

### 5.6 Multiplier Markup Endpoint

```typescript
// Test: POST /api/internal/credits/agency-markup — requires internal auth
// Test: correctly calculates and deducts markup
// Test: rejects external requests (no user JWT accepted)
```

---

## 6. Frontend Architecture (Phase 2-3)

### 6.1 AgencyChat

```typescript
// Test: renders main conversation thread with user and agent messages
// Test: renders agent name badge on each response
// Test: activity panel toggles open/closed
// Test: activity panel shows agent-to-agent messages
// Test: SSE events update UI in real-time (token → text display)
// Test: agent_switch event updates current agent indicator
// Test: run_finished event shows credit usage
// Test: run_error event shows error message
```

### 6.2 AgencyBuilder

```typescript
// Test: renders React Flow canvas with initial empty state
// Test: adding agent node creates AgentNode component
// Test: connecting two nodes creates CommunicationEdge
// Test: selecting node opens AgentPropertyPanel
// Test: property panel updates agent name, model, instructions
// Test: save action persists agency config via tRPC mutation
// Test: publish action changes agency status to published
```

### 6.3 AgencyTemplates

```typescript
// Test: renders 4 starter templates
// Test: "Use Template" creates new agency from template definition
// Test: template gallery shows agent count and description
```

### 6.5 SSE Hook (useAgencyStream)

```typescript
// Test: connects to stream endpoint with correct headers
// Test: parses SSE events correctly (event type + JSON data)
// Test: handles keepalive comments without state change
// Test: handles connection drop with error state
// Test: accumulates token deltas into full message
// Test: tracks active agent via agent_switch events
```

---

## 7. Error Handling (Phase 2)

```python
# Test: transient error (timeout) → retries 2 times, succeeds on 3rd
# Test: transient error (429) → retries with exponential backoff
# Test: permanent error (auth failure) → fails immediately, no retry
# Test: permanent error (credit exhaustion) → fails immediately
# Test: optional agent failure → skips agent, continues run
# Test: required agent failure → stops run
# Test: fallback-safe agency + service down → falls back to single-agent
# Test: non-fallback-safe agency + service down → fails closed
# Test: credit charges on partial completion — only completed steps charged
```

---

## 8. Admin Controls (Phase 4)

### 8.2 Tool Whitelists

```typescript
// Test: admin can set tool whitelist per agency
// Test: tool not in whitelist returns error to agent (not run failure)
// Test: high-risk tool requires explicit opt-in in agency config
// Test: credit spend limit terminates run when exceeded
```

---

## 9. Observability (Phase 4)

```python
# Test: agency_run_started audit event logged with correct fields
# Test: agency_run_completed audit event includes duration and credit totals
# Test: agency_run_failed audit event includes error type and message
# Test: agency_tool_called audit event includes tool name and agent name
# Test: credit reconciliation — gateway total matches run total_credits_used
```

---

## 10. Integration Points (Phase 3)

### 10.1 Workflow Node

```python
# Test: AgencyExecutor registered in NodeRegistry
# Test: AgencyExecutor receives workflow input and returns agency output
# Test: AgencyExecutor respects workflow timeout settings
# Test: AgencyExecutor handles agency failure gracefully (returns error output)
```

### 10.2 Skill Auto-Trigger

```typescript
// Test: skill detector recognizes agency trigger patterns
// Test: agency trigger offered alongside skill suggestions
// Test: agency trigger dispatches to agency run endpoint
```
