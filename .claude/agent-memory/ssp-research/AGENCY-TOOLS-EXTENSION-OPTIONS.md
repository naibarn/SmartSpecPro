---
name: Agency Tools Extension Options
description: Analysis of options to extend the tools system — custom tool UI, validation, composition, async support
type: project
---

# Agency Tools System — Extension Options

**Analysis Date:** 2026-03-22
**Scope:** How to evolve from current (metadata + HTTP wrappers) to full tool system

---

## Current State → Desired State

### Current (Baseline)
```
Agent → Pre-assigned tool list
     → Tool = HTTP wrapper (query string)
     → No input validation
     → No composition
     → Hardcoded 16 builtin + optional DB entries
     → Timeouts only (no async continuation)
```

### Desired (Full Tool System)
```
Agent → Dynamic registry lookup
     → Tool = Typed class with input schema + auto-docs
     → Input validation at Python layer
     → Tool composition (tool A → tool B)
     → Custom tool creation UI + versioning
     → Async job support with polling
```

---

## Option 1: Custom Tool Creation UI (RECOMMENDED SHORT-TERM)

### Scope
Enable users to create custom tools without DB access.

### Implementation (6-8 hours)

**Frontend:**
1. Add "Create Custom Tool" dialog in AgencyBuilder
2. Form fields:
   - Name (varchar 100)
   - Description (text)
   - Endpoint URL (validate HTTPS + allowed domains)
   - Risk level selector (low/medium/high)
   - Config schema (JSON editor or form builder)
3. Submit → Call `agency.createCustomTool` tRPC

**Backend:**
1. New tRPC procedure: `agency.createCustomTool`
   ```typescript
   input: z.object({
     name: z.string().min(1).max(100),
     description: z.string().max(500),
     endpoint: z.string().url(),
     riskLevel: z.enum(['low', 'medium', 'high']),
     config: z.record(z.unknown()).optional(),
     configSchema: z.record(z.unknown()).optional(),
   })
   ```

2. Validation:
   - URL must be HTTPS (no http://)
   - URL must not be in blocked list (localhost, 127.0.0.1, private IPs)
   - Name must be unique per tenant

3. Logic:
   ```typescript
   const toolId = crypto.randomUUID();
   await db.insert(agencyTools).values({
     id: toolId,
     tenantId,
     name,
     description,
     toolType: 'custom',
     config: { endpoint },
     riskLevel,
     requiresApproval: riskLevel === 'high',
   });
   return { toolId, message: 'Tool created' };
   ```

4. Python side: Already supports custom tools via `agency_tools` table

**Risks:**
- ⚠️ SSRF if URL validation insufficient → Fix: Add URL blocklist validation (private IPs, internal hosts)
- ⚠️ Unvalidated endpoint → Fix: Could add health check (optional POST to endpoint to verify it exists)

**Benefits:**
- Users can create tools without admin/DB access
- Enables custom tool marketplace (next step)
- Audit trail (created by, creation date already in schema)

### Validation Checklist
```
✅ URL is HTTPS
✅ URL hostname not in blocked list
✅ Name unique within tenant
✅ Description not empty
✅ Risk level one of [low, medium, high]
```

---

## Option 2: Input Validation Layer (RECOMMENDED SHORT-TERM)

### Scope
Add input schema validation before passing to tool endpoint.

### Current State
```python
# Tool endpoint receives unvalidated input
result = client.post(
    endpoint_url,
    json={"query": query, **config.config}  # Any config.config passes through
)
```

### Desired State
```python
# Validate input against schema before passing
schema = ToolInputSchema.from_json(tool.configSchema)
validated = schema.validate(request_input)  # Raises if invalid
result = client.post(endpoint_url, json=validated)
```

### Implementation (4-6 hours)

**Python layer:**
```python
from pydantic import BaseModel, ValidationError

class ToolInput(BaseModel):
    query: str
    **tool_config_schema.fields  # Dynamic fields from schema

def _execute_http(config: ToolConfig, query: str) -> str:
    try:
        # Validate input before executing
        input_schema = ToolInputSchema.parse_obj(config.config)
        validated = {
            "query": query,
            **input_schema.dict()
        }
    except ValidationError as e:
        return f"Tool input validation failed: {e.errors()}"

    try:
        resp = client.post(config.endpoint_url, json=validated)
        return resp.text
    except Exception as exc:
        return f"Tool execution failed: {exc}"
```

**Schema definition:**
```typescript
// In ToolPicker component
configSchema?: {
  type: "object",
  properties: {
    collectionId: { type: "string", description: "..." },
    topK: { type: "integer", minimum: 1, maximum: 20, default: 5 }
  },
  required: ["collectionId"]
}
```

**Benefits:**
- Prevents invalid inputs from reaching endpoints
- Clear error messages back to agent
- Enables better input documentation

**Risks:**
- ⚠️ Schema validation failure → agent sees error string (same as current)
- ⚠️ Complex schemas hard to specify in UI → Start simple (text, number, select)

---

## Option 3: Input Validation + Config Schema in UI (RECOMMENDED MID-TERM)

### Scope
Auto-generate input validation forms from tool config schemas.

### Design
```
User creates tool with config schema:
{
  "type": "object",
  "properties": {
    "apiKey": { "type": "string", "description": "API key for authentication" },
    "maxRetries": { "type": "integer", "minimum": 0, "maximum": 5, "default": 3 },
    "timeout": { "type": "integer", "minimum": 1000, "maximum": 30000, "default": 10000 }
  },
  "required": ["apiKey"]
}

Frontend renders form:
- Text input for apiKey (required)
- Number input for maxRetries (default 3, 0-5)
- Number input for timeout (default 10000, 1000-30000)

User fills form → Config is validated by frontend + backend
```

### Implementation (8-12 hours)

**Frontend:**
1. Enhance ToolConfigPanel to support JSON Schema
2. Use library like `@rjsf/core` (React JSON Schema Form) to auto-render
3. Validate on submit via Zod

**Backend:**
1. Validate config against schema in `createCustomTool` and `saveBuilder`
2. Return validation errors to frontend

**Benefits:**
- Rich UI for tool config (not just raw JSON)
- Type-safe before execution
- Better UX for end users

**Risks:**
- ⚠️ Dependency on form library → Pick well-maintained one (`@rjsf/core` is standard)

---

## Option 4: Tool Composition (RECOMMENDED ADVANCED)

### Scope
Enable tool A to call tool B without going through agent.

### Current Problem
```
Agent calls Tool A
  ↓ (gets result)
  ↓ (agent thinks, decides to use Tool B)
  ↓ Agent calls Tool B
  ↓ (gets result)

Problem: 2 round-trips, agent overhead, latency
```

### Desired
```
Tool A → directly calls Tool B via registry
  ↓ (result comes back to Agent in single step)

Benefit: 1 round-trip, low latency, cleaner composition
```

### Implementation (12-16 hours)

**Architecture:**
```python
# In Python backend, register tools in a class-based registry
class ToolRegistry:
    def __init__(self, db):
        self.db = db
        self.cache = {}

    async def get_tool(self, tool_id: str) -> Callable:
        """Return a callable for the tool."""
        if tool_id in self.cache:
            return self.cache[tool_id]

        # Load tool config + create wrapper
        tool = await resolve_tools_for_agent(...)
        self.cache[tool_id] = tool
        return tool

    async def call(self, tool_id: str, input: dict) -> str:
        """Execute a tool."""
        tool = await self.get_tool(tool_id)
        return tool.run(**input)

# In tool wrapper:
def _make_run_func(tool_config, registry):
    async def run_func(query):
        if should_delegate_to_another_tool(query):
            result = await registry.call("builtin-skill-executor", {"skillId": "..."})
            return result
        else:
            return _execute_http(tool_config, query)
    return run_func
```

**Challenges:**
- Registry lifecycle management (inject into tool wrappers)
- Async/await in tool closures (currently sync)
- Circular dependencies (tool A calls tool B calls tool A)

**Benefits:**
- Reduces agent round-trips
- Enables more complex tool chains
- Better latency

**Risks:**
- ⚠️ Circular dependency attacks → Add depth counter, max depth = 3
- ⚠️ Async refactoring needed → Complex in agent-swarm integration

---

## Option 5: Async Job Support (RECOMMENDED ADVANCED)

### Scope
Support long-running tools that return a job ID, not immediate result.

### Current Problem
```
Tool timeout: 30s (HTTP) / 60s (Sandbox)
Long-running job: Media generation (5+ minutes)
Result: Tool fails on timeout
```

### Desired
```
Tool execution:
1. Agent calls tool with params
2. Tool returns immediately: { "jobId": "job-123", "status": "queued" }
3. Agent polls status endpoint: /api/internal/tools/status?jobId=job-123
4. When complete: Agent gets result or error
```

### Implementation (16-20 hours)

**Backend:**
1. Add job tracking table:
   ```sql
   CREATE TABLE tool_jobs (
     id UUID PRIMARY KEY,
     agentId VARCHAR,
     toolId VARCHAR,
     status VARCHAR,  -- queued, running, completed, failed
     inputData JSON,
     outputData JSON,
     errorMessage TEXT,
     createdAt TIMESTAMP,
     completedAt TIMESTAMP
   )
   ```

2. Tools return job ID:
   ```python
   result = queue_job(tool_id, input_data)  # Returns immediately
   return { "jobId": result.id, "status": "queued" }
   ```

3. Poll endpoint:
   ```typescript
   // POST /api/internal/tools/job-status
   input: { jobId, toolId }
   response: { status, output?, error? }
   ```

**Agent integration:**
```python
# Tool wrapper returns job ID for async tools
if tool_config.async:
    result = queue_job(...)
    return f"Job queued: {result['jobId']}"
else:
    result = sync_execute(...)
    return result
```

**Benefits:**
- Support long-running operations (media generation, etc.)
- Agent can check status without blocking
- Tool can process asynchronously in background

**Risks:**
- ⚠️ State explosion (many pending jobs) → Add cleanup job (delete completed jobs > 1 day old)
- ⚠️ Agent must understand job-based responses → Document in tool description

---

## Option 6: Tool Versioning (RECOMMENDED MID-TERM)

### Scope
Track tool config changes, enable rollback.

### Current Problem
```
Tool endpoint URL changes
Agencies using that tool now break silently
No way to revert to old version
```

### Desired
```
Tool version history:
- v1: endpoint = "https://api-v1.example.com"
- v2: endpoint = "https://api-v2.example.com"

Agencies can pin to v1 or auto-upgrade to v2
```

### Implementation (4-6 hours)

**Schema changes:**
```sql
ALTER TABLE agency_tools ADD COLUMN version INT DEFAULT 1;
ALTER TABLE agency_tools ADD COLUMN deprecated_at TIMESTAMP;

CREATE TABLE agency_tool_versions (
  id UUID PRIMARY KEY,
  toolId UUID FK,
  version INT,
  config JSON,
  createdAt TIMESTAMP,
  createdBy UUID,
  changeNotes TEXT
)
```

**Logic:**
```typescript
// When updating tool config, create new version
const toolId = "tool-123";
const newVersion = (await db.query(`SELECT MAX(version) FROM agency_tool_versions WHERE toolId = ?`))[0].max + 1;

await db.insert(agencyToolVersions).values({
  id: uuid(),
  toolId,
  version: newVersion,
  config: newConfig,
  createdBy: userId,
  changeNotes: "Update endpoint to v2 API"
});

await db.update(agencyTools).set({ version: newVersion }).where(eq(agencyTools.id, toolId));
```

**Benefits:**
- Audit trail of changes
- Can revert to working version if update breaks
- Helps with compliance

**Risks:**
- ⚠️ Schema migration on existing deployments → Use Drizzle migration
- ⚠️ Agents must track which version they're using → Already done implicitly (tool resolved at load time)

---

## Recommended Implementation Order

### Phase 1 (CRITICAL, 2 weeks)
1. **Custom Tool Creation UI** (Option 1) — Unblock users
2. **Input Validation Layer** (Option 2) — Security

### Phase 2 (IMPORTANT, 4 weeks)
1. **Input Validation + Config Schema UI** (Option 3) — UX
2. **Tool Versioning** (Option 6) — Safety
3. Start planning Tool Composition (Option 4)

### Phase 3 (NICE-TO-HAVE, 6+ weeks)
1. **Tool Composition** (Option 4) — Performance
2. **Async Job Support** (Option 5) — Functionality
3. Tool Marketplace

---

## Success Criteria

### Phase 1
- [ ] Users can create custom tools without DB access
- [ ] All tool inputs validated before execution
- [ ] Zero SSRF vulnerabilities in custom tools

### Phase 2
- [ ] Config schema forms auto-generated from JSON Schema
- [ ] Tool version history visible in UI
- [ ] Can rollback to previous tool version
- [ ] Agency builder shows which tool version is assigned

### Phase 3
- [ ] Tools can compose (tool A calls tool B)
- [ ] Async tools supported (e.g., media generation)
- [ ] Tool execution time < 5s for most tools (was 30s+ due to round-trips)
- [ ] Tool Marketplace UI (list, search, install custom tools)

---

## Open Questions

1. **Tool approval workflow:** Should admins approve custom tools before they're used? Currently: No.
2. **Tool testing:** Should users be able to test a tool before assigning to agent?
3. **Tool cost tracking:** Should tool usage be cost-tracked separately from agency run? Currently: Bundled.
4. **Tool dependencies:** Can a tool declare that it requires another tool? (e.g., "File Parse requires Document Search")
5. **Tool metadata:** Should tools have tags, category, author fields? Currently: Just name + description.

