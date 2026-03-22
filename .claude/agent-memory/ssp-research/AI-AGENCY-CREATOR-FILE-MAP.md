---
name: AI Agency Creator File Map
description: Complete list of files, functions, and line numbers involved in the AI Agency Creator flow
type: reference
---

# AI Agency Creator — File Map & Line Numbers

## Frontend (React/TypeScript)

### Primary File: AutoCreateAgencyModal.tsx
**Path**: `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx`
**Size**: 448 lines
**Purpose**: User input form, polling logic, phase display, interview questions

| Component | Lines | Purpose |
|-----------|-------|---------|
| Constants | 43-55 | POLL_INTERVAL_MS (2.5s), MAX_POLL_WAIT_MS (5 min), PHASES array |
| Types | 57-63 | TaskStatus enum, Question interface |
| Props | 65-71 | AutoCreateAgencyModalProps interface |
| Component declaration | 73-90 | State variables (requirement, file, taskId, taskStatus, etc.) |
| Elapsed timer | 99-108 | useEffect that increments elapsedSeconds every 1s |
| Polling logic | 111-165 | useEffect for polling autoCreateStatus every 2.5s, timeout guard |
| File upload | 167-188 | handleFileSelect (validates size, type, converts to base64) |
| Submit handler | 190-221 | handleSubmit (calls autoCreate mutation) |
| Answer handler | 223-235 | handleSubmitAnswers (calls autoCreateAnswer mutation) |
| Close handler | 237-251 | handleClose (cleanup, reset state) |
| Format time | 253-257 | formatElapsed utility (m:ss format) |
| Render idle | 276-334 | Input form (requirement textarea, file picker, submit button) |
| Render processing | 337-381 | Phase bar + progress indicators + timer |
| Render interview | 384-413 | Question form with input fields for each question |
| Render error | 416-432 | Error alert with "Try again" button |
| Render done | 435-443 | Success message + guide preview |

**Key Functions**:
- `handleSubmit()` (line 190): Creates task via tRPC, starts polling
- `handleSubmitAnswers()` (line 223): Submits interview answers, resumes design
- Polling `useEffect` (line 111): Fetches status every 2.5s, stops on completion/failure

**State Variables**:
- `requirement`: User text input (max 10k chars)
- `attachedFile`: Optional file { name, base64 }
- `taskId`: "agcreate-{12-hex}"
- `taskStatus`: "idle" | "queued" | "processing" | "awaiting_answers" | "completed" | "failed"
- `currentPhase`: "discover" | "interview" | "design" | "validate" | "implement" | "verify" | "document" | ""
- `questions`: Array of { id, question, type }
- `answers`: Record<string, string>
- `elapsedSeconds`: Timer for display

---

### Canvas Hydration: AgencyBuilder.tsx
**Path**: `apps/web/client/src/pages/AgencyBuilder.tsx`
**Size**: 900+ lines
**Purpose**: Main canvas page, agency loading, ReactFlow integration

| Section | Lines | Purpose |
|---------|-------|---------|
| Constants | 38-48 | DEFAULT_AGENT_DATA |
| Auto-layout | 50-134 | autoLayout() function (tree layout for nodes) |
| Component setup | 136-150 | Route params, node/edge state, useReactFlow |
| Modal state | 206 | autoCreateOpen state |
| Agency fetch | 247-257 | trpc.agency.getById.useQuery with staleTime: Infinity |
| Hydration effect | 263-323 | useEffect that converts agents to nodes, flows to edges |
| Default model | 195-202 | defaultModel selection from llmModelsData |
| Model watch | 326-346 | useEffect for model availability check |
| Canvas init | 360-424 | onConnect handler, node/edge event handlers |
| Modal callback | 814-817 | onCreated((agencyId) => navigate to /agencies/{id}/edit) |

**Key Functions**:
- `autoLayout()` (line 50): Spreads nodes vertically if all same position
- `onConnect()` (line 360): Handles edge creation, auto-adds Router routes
- `useEffect` for hydration (line 263): Converts agencyData to nodes/edges

**Data Flow**:
1. User navigates to `/agencies/{agencyId}/edit`
2. Route param: `agencyId`
3. Condition: `enabled: !!agencyId && !isNew` (line 252)
4. On data arrival: Hydration effect (line 263) fires
5. Convert agents to nodes with positions
6. Convert flows to edges
7. Auto-layout if all positions same (line 283)
8. Set nodes + edges on ReactFlow

---

## Backend (Node.js / tRPC)

### Agency Router: agency.ts
**Path**: `apps/web/server/routers/agency.ts`
**Size**: 2500+ lines
**Purpose**: All agency CRUD + creation flow

| Procedure | Lines | Input | Output | Purpose |
|-----------|-------|-------|--------|---------|
| autoCreate | 2262-2299 | requirement, specFileBase64?, model?, skipInterview? | { taskId } | Start discover task |
| autoCreateStatus | 2304-2332 | taskId | status object | Poll task progress |
| autoCreateAnswer | 2337-2362 | taskId, answers | { ok: true } | Submit interview answers |

**Implementation Details**:

**autoCreate** (lines 2262-2299):
```typescript
.input(z.object({
  requirement: z.string().min(10).max(10000),
  specFileBase64: z.string().max(10_000_000).optional(),
  model: z.string().max(100).optional(),
  skipInterview: z.boolean().default(false),
}))
.mutation(async ({ ctx, input }) => {
  // Build Python URL from ENV.pythonBackendUrl
  // POST to {pythonBackendUrl}/api/v1/agency-creator/start
  // Headers: Authorization: Bearer {ctx.userToken}
  // Body: { requirement, spec_file_base64, model, skip_interview, user_id, tenant_id }
  // Return: { taskId: data.task_id }
})
```

**autoCreateStatus** (lines 2304-2332):
```typescript
.input(z.object({
  taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/)
}))
.query(async ({ ctx, input }) => {
  // GET to {pythonBackendUrl}/api/v1/agency-creator/status/{taskId}
  // Headers: Authorization: Bearer {ctx.userToken}
  // Return: status object as-is
})
```

**autoCreateAnswer** (lines 2337-2362):
```typescript
.input(z.object({
  taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/),
  answers: z.record(z.string(), z.string()),
}))
.mutation(async ({ ctx, input }) => {
  // POST to {pythonBackendUrl}/api/v1/agency-creator/answer
  // Headers: Authorization: Bearer {ctx.userToken}
  // Body: { task_id, answers }
  // Return: { ok: true }
})
```

**Rate Limiting** (lines 99-107):
```typescript
const agencyCreateProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-create", limit: 10, windowMs: 86_400_000 })
  // 10 creates per day, but modal uses different limit
);
// Actually in autoCreate: limit: 5, windowMs: 60_000 (5 per minute)
```

---

## Backend (Python / Celery)

### FastAPI Endpoints: agency_creator.py
**Path**: `python-backend/app/api/agency_creator.py`
**Size**: 164 lines
**Purpose**: HTTP gateway for agency creation

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| start_agency_creator | POST | 34-88 | Create task_id, enqueue Task 1 |
| get_agency_creator_status | GET | 91-108 | Fetch task status from Redis |
| submit_agency_creator_answers | POST | 111-163 | Store answers, enqueue Task 2 |

**Request/Response Models** (lines 20-31):
- `AgencyCreatorStartRequest`: requirement (10-10k), spec_file_base64?, model?, skip_interview?, user_id?, tenant_id?
- `AgencyCreatorAnswerRequest`: task_id (regex), answers: dict

**Endpoint Details**:

**/api/v1/agency-creator/start** (lines 34-88):
- Create task_id via `create_task_id()` ("agcreate-{12-hex}")
- Set initial status in Redis: { status: "queued", phase: "discover", _user_id }
- Call `create_agency_discover_task.delay(task_id, user_id, payload)`
- Fallback: Run synchronously in thread if Celery unavailable
- Return: { task_id }

**/api/v1/agency-creator/status/{task_id}** (lines 91-108):
- Validate task_id format (regex)
- Call `get_status(task_id, user_id=current_user.id)`
- Ownership check: _user_id must match current_user.id
- Strip internal fields: remove keys starting with "_"
- Return: public fields only

**/api/v1/agency-creator/answer** (lines 111-163):
- Get status from Redis, validate exists + is "awaiting_answers"
- Store answers: `store_answers(task_id, answers)` to Redis
- Get payload/intent/model from status
- Merge into design_payload: { payload, intent, answers, model }
- Call `create_agency_design_task.delay(...)`
- Fallback: Run synchronously in thread if Celery unavailable
- Return: { ok: true }

---

### Celery Tasks: agency_creator_task.py
**Path**: `python-backend/app/tasks/agency_creator_task.py`
**Size**: 661 lines
**Purpose**: Background task orchestration, LLM calls, validation, DB creation

#### Task 1: DISCOVER + INTERVIEW (lines 91-186)

| Function | Lines | Purpose |
|----------|-------|---------|
| create_agency_discover_task (Celery) | 91-130 | Entry point, wrap async call |
| _discover_async | 132-186 | Phases 1-2 logic, LLM calls |
| _llm_discover | 351-381 | Phase 1: LLM analysis (is_clear, domain, questions) |

**create_agency_discover_task** (lines 91-130):
```python
@celery_app.task(
    bind=True,
    name="app.tasks.agency_creator_task.create_agency_discover_task",
    soft_time_limit=300,       # 5 minutes
    time_limit=360,            # 6 minutes
    max_retries=0,
)
def create_agency_discover_task(self, task_id, user_id, payload, **kwargs):
    logger.info("agency_creator_discover_started", task_id=task_id)
    _set_status(task_id, {
        "status": "processing",
        "phase": "discover",
        "message": "Analysing your requirement...",
        "_user_id": user_id,
    })
    try:
        result = _run_async(_discover_async(task_id, user_id, payload))
        return result
    except Exception as exc:
        logger.error("agency_creator_discover_failed", ...)
        _set_status(task_id, { "status": "failed", "error": ... })
        return {"status": "failed"}
```

**_discover_async** (lines 132-186):
```python
async def _discover_async(task_id: str, user_id: int, payload: dict) -> dict:
    requirement = payload.get("requirement", "")
    skip_interview = payload.get("skipInterview", False)
    model = payload.get("model", "gpt-4o")

    # Phase 1: DISCOVER
    _set_status(task_id, {..., "phase": "discover", ...})
    intent = await _llm_discover(requirement, model, user_id)

    # Phase 2: INTERVIEW decision
    if skip_interview or intent.get("is_clear", True):
        # Immediately dispatch Task 2
        _set_status(task_id, {..., "phase": "design", ...})
        create_agency_design_task.delay(
            task_id=task_id,
            user_id=user_id,
            payload={..., "intent": intent, "answers": {}},
        )
        return {"status": "dispatched"}

    questions = intent.get("questions", [])
    if not questions:
        # No questions, proceed to design
        create_agency_design_task.delay(...)
        return {"status": "dispatched"}

    # Return questions to frontend
    _set_status(task_id, {
        "status": "awaiting_answers",
        "phase": "interview",
        "questions": questions,
        "_user_id": user_id,
        "_payload": payload,     # Stored for design task
        "_intent": intent,       # Stored for design task
        "_model": model,         # Stored for design task
    })
    return {"status": "awaiting_answers", "questions": questions}
```

**_llm_discover** (lines 351-381):
```python
async def _llm_discover(requirement: str, model: str, user_id: int) -> dict:
    system_prompt = """You are an AI agency architect. Analyse the user's requirement...
    Return JSON with: {
        "is_clear": true/false,
        "domain": "string",
        "estimated_agents": 2,
        "questions": [{id, question, type}],
        "notes": "..."
    }"""

    content = await _llm_call(
        system_prompt=system_prompt,
        user_message=f"Requirement: {requirement}",
        model=model,
        user_id=user_id,
        max_tokens=1000,
        timeout=60.0,
    )

    if content:
        return _safe_json_parse(content, {"is_clear": True, "questions": []})

    return {"is_clear": True, "domain": "general", "estimated_agents": 3, "questions": []}
```

#### Task 2: DESIGN → DOCUMENT (lines 189-305)

| Function | Lines | Purpose |
|----------|-------|---------|
| create_agency_design_task (Celery) | 189-226 | Entry point, wrap async call |
| _design_async | 229-305 | Phases 3-7 logic |
| _llm_design | 384-467 | Phase 3: LLM spec generation |
| _validate_spec | 470-528 | Phase 4: Self-review + fixes |
| _implement_agency | 531-609 | Phase 5: Call internal API |
| _llm_document | 612-625 | Phase 7: Usage guide generation |

**create_agency_design_task** (lines 189-226):
```python
@celery_app.task(
    bind=True,
    name="app.tasks.agency_creator_task.create_agency_design_task",
    soft_time_limit=540,       # 9 minutes
    time_limit=600,            # 10 minutes
    max_retries=0,
)
def create_agency_design_task(self, task_id, user_id, payload, **kwargs):
    logger.info("agency_creator_design_started", task_id=task_id)
    _set_status(task_id, {..., "phase": "design", ...})
    try:
        result = _run_async(_design_async(task_id, user_id, payload))
        return result
    except Exception as exc:
        logger.error("agency_creator_design_failed", ...)
        _set_status(task_id, { "status": "failed", ... })
        return {"status": "failed"}
```

**_design_async** (lines 229-305):
```python
async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
    requirement = payload.get("requirement", "")
    intent = payload.get("intent", {})
    answers = payload.get("answers", {})
    model = payload.get("model", "gpt-4o")
    tenant_id = payload.get("tenantId", "")

    # Phase 3: DESIGN
    _set_status(task_id, {..., "phase": "design", ...})
    spec = await _llm_design(requirement, intent, answers, model, user_id)

    # Phase 4: VALIDATE
    _set_status(task_id, {..., "phase": "validate", ...})
    spec = _validate_spec(spec)

    # Phase 5: IMPLEMENT
    _set_status(task_id, {..., "phase": "implement", "previewJson": spec, ...})
    agency_id = await _implement_agency(spec, user_id, tenant_id)

    if not agency_id:
        _set_status(task_id, {"status": "failed", "error": "Agency creation failed", ...})
        logger.error("agency_creator_implement_returned_none", ...)
        return {"status": "failed", "error": "Agency creation failed"}

    # Phase 6: VERIFY
    _set_status(task_id, {..., "phase": "verify", "agencyId": agency_id, ...})

    # Phase 7: DOCUMENT
    _set_status(task_id, {..., "phase": "document", ...})
    guide = await _llm_document(spec, model, user_id)

    # DONE
    _set_status(task_id, {
        "status": "completed",
        "phase": "done",
        "agencyId": agency_id,
        "previewJson": spec,
        "guide": guide,
        "_user_id": user_id,
    })
    logger.info("agency_creator_completed", task_id=task_id, agency_id=agency_id)
    return {"status": "completed", "agencyId": agency_id}
```

**_llm_design** (lines 384-467):
- Builds user message: requirement + intent + answers
- System prompt: "Design a multi-agent agency..."
- Expected JSON: name, description, nodes, edges, rationale
- Max tokens: 4000, timeout: 120s
- Returns: spec dict or fallback single-agent spec

**_validate_spec** (lines 470-528):
- Ensure exactly ONE entry point (agent/supervisor)
- Remove invalid node references
- Ensure router nodes have required config
- Validate tool IDs against whitelist
- Return: corrected spec

**_implement_agency** (lines 531-609):
- Build agent list from spec.nodes
- Build edge list from spec.edges
- Call `POST {internal_url}/api/internal/agency/create`
- Headers: X-Internal-Token, X-User-Id
- Return: agencyId or None

**_llm_document** (lines 612-625):
- System: "Write a concise usage guide (max 300 words)..."
- Max tokens: 500, timeout: 60s
- Return: guide text

#### Helper Functions (lines 307-661)

| Function | Lines | Purpose |
|----------|-------|---------|
| _llm_call | 311-348 | Unified LLM call via LLMGatewayClient |
| _safe_json_parse | 630-637 | Parse JSON from LLM (handles markdown) |
| _fallback_agency_spec | 640-660 | Minimal single-agent spec |
| _set_status | 49-54 | Store status in Redis |
| get_status | 57-70 | Fetch status from Redis with ownership check |
| store_answers | 73-76 | Store interview answers in Redis |
| get_answers | 79-82 | Fetch interview answers from Redis |
| create_task_id | 85-86 | Generate "agcreate-{12-hex}" |

**_llm_call** (lines 311-348):
```python
async def _llm_call(
    system_prompt: str,
    user_message: str,
    model: str,
    user_id: int,
    max_tokens: int = 4000,
    timeout: float = 120.0,
) -> str | None:
    from app.services.llm_gateway_client import LLMGatewayClient

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    gateway = LLMGatewayClient()
    try:
        data = await gateway.chat_completion(
            messages=messages,
            model=model,
            user_id=user_id,
            temperature=0.7,
            max_tokens=max_tokens,
            timeout=int(timeout),
        )
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
    except Exception as exc:
        logger.warning("agency_creator_llm_call_error", error=str(exc)[:200])
    finally:
        await gateway.aclose()

    return None
```

---

## Redis Data Storage

### Redis Keys

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `agency-creator:{task_id}` | JSON string | 2 hours | Task status + metadata |
| `agency-creator:{task_id}:ans` | JSON string | 2 hours | Interview answers |

### Functions (in agency_creator_task.py)

| Function | Lines | Purpose |
|----------|-------|---------|
| _get_redis | 36-37 | Get Redis connection from pool |
| _set_status | 49-54 | Store status object in Redis |
| get_status | 57-70 | Fetch status with user ownership check |
| store_answers | 73-76 | Store interview answers in Redis |
| get_answers | 79-82 | Fetch interview answers from Redis |

---

## Database Schema

### Agency Tables (apps/web/drizzle/schema.ts)

| Table | Related Fields | Purpose |
|-------|----------------|---------|
| agencies | id, name, description, createdBy, tenantId, status, defaultModel | Agency metadata |
| agencyAgents | id, agencyId, nodeType, name, description, instructions, model, isEntryPoint, position, nodeConfig | Agent/node definition |
| agencyAgentTools | agentId, toolId, toolConfig | Agent tool assignments |
| agencyCommunicationFlows | id, fromAgentId, toAgentId, flowType | Agent connections |

### Hydration Path (data → React nodes)
```
agencies
  ├─ agents (agencyAgents)
  │   ├─ nodeType: agent | supervisor | router | ...
  │   ├─ position: { x, y }
  │   ├─ nodeConfig: router-specific config
  │   └─ tools (agencyAgentTools)
  │       └─ toolId, toolConfig
  └─ flows (agencyCommunicationFlows)
      ├─ fromAgentId, toAgentId
      └─ flowType: delegation | handoff | parallel
```

---

## Summary Table: All Phases & Their Locations

| Phase | Task | File | Function | LLM? | Duration | State Change |
|-------|------|------|----------|------|----------|--------------|
| DISCOVER | 1 | agency_creator_task.py | _llm_discover | Yes | 5-10s | discover → interview |
| INTERVIEW | 1 | agency_creator_task.py | _discover_async | No | User-driven | interview → awaiting_answers |
| DESIGN | 2 | agency_creator_task.py | _llm_design | Yes | 15-30s | design |
| VALIDATE | 2 | agency_creator_task.py | _validate_spec | No | <1s | validate |
| IMPLEMENT | 2 | agency_creator_task.py | _implement_agency | No (API call) | 2-5s | implement |
| VERIFY | 2 | agency_creator_task.py | _design_async (implicit) | No | <1s | verify |
| DOCUMENT | 2 | agency_creator_task.py | _llm_document | Yes | 5-10s | document |

---

## Test Entry Points

| Test Scenario | Start Here | Poll Via |
|---------------|-----------|----------|
| Happy path (no interview) | AutoCreateAgencyModal → handleSubmit | autoCreateStatus (2.5s) |
| Interview path | AutoCreateAgencyModal → questions form → handleSubmitAnswers | autoCreateStatus (2.5s) |
| Error recovery | AutoCreateAgencyModal → error state → "Try again" | autoCreateStatus (2.5s) |
| Debug task state | Python FastAPI `/api/internal/agency-creator/debug/{taskId}` | Manual inspection |
| Canvas load | AgencyBuilder.tsx → trpc.agency.getById | Single query |
