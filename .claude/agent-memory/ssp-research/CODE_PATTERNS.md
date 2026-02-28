# Agency-Swarm Integration: Code Patterns & Examples

## 1. Node.js Router Pattern: sendMessage

**File**: `apps/web/server/routers/agency.ts` (line 410–453)

```typescript
sendMessage: agencyMessageProcedure
  .input(z.object({
    agencyId: z.string().uuid(),
    conversationId: z.string().uuid(),
    message: z.string().min(1).max(10000),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Check feature flag
    await assertAgencyEnabled();

    // 2. Extract context
    const userId = ctx.user!.id;
    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
    const userToken = ctx.userToken ?? "";

    // 3. Validate conversation ownership
    const [conv] = await db
      .select()
      .from(agencyConversations)
      .where(
        and(
          eq(agencyConversations.id, input.conversationId),
          eq(agencyConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    // 4. Delegate to Python backend via bridge
    const result = await agencyBridge.executeRun({
      agencyId: input.agencyId,
      conversationId: input.conversationId,
      message: input.message,
      userToken,
      tenantId,
      userId,
    });

    return result;  // {runId, status, response, creditsUsed, durationMs}
  }),
```

**Key Points**:
- Rate limit: 60 per minute (via `agencyMessageProcedure`)
- Feature flag check happens first
- Conversation ownership validated before delegating
- User token passed to Python for credit attribution
- Error handling: TRPCError (handled by middleware)

---

## 2. AgencyBridge Pattern: executeRun

**File**: `apps/web/server/services/agencyBridge.ts` (line 95–117)

```typescript
async executeRun(params: RunParams): Promise<RunResult> {
  const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${params.agencyId}/run`;

  const response = await fetch(url, {
    method: "POST",
    headers: makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
    body: JSON.stringify({
      conversation_id: params.conversationId,
      message: params.message,
    }),
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),  // 120 seconds
  });

  const data = await handleResponse<any>(response, "executeRun");

  return {
    runId: data.run_id,
    status: data.status,
    response: data.response,
    creditsUsed: data.credits_used ?? 0,
    durationMs: data.duration_ms ?? 0,
  };
}

// Helper: construct headers with tenant/user context
function makeHeadersWithMeta(
  userToken: string,
  tenantId: string,
  userId: number,
): Record<string, string> {
  return {
    ...makeHeaders(userToken),
    "X-Tenant-Id": tenantId,
    "X-User-Id": String(userId),
  };
}
```

**Key Points**:
- Snake_case response mapping (run_id → runId)
- Custom error handling: 402 → insufficient credits
- Timeout: 120 seconds (2 minutes for multi-agent runs)
- Headers: Authorization (Bearer), X-Tenant-Id, X-User-Id
- Uses AbortSignal for timeout (safer than Promise.race)

---

## 3. Drizzle Schema Pattern: Agency Table

**File**: `apps/web/drizzle/schema.ts` (line 3906–3926)

```typescript
export const agencies = pgTable("agencies", {
  id: varchar("id", { length: 36 }).primaryKey(),

  // Multi-tenancy
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  // Identification
  slug: varchar("slug", { length: 100 }).notNull(),  // human-readable
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Configuration
  systemPrompt: text("systemPrompt"),  // shared agent instructions
  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 })
    .default("1.00"),  // 1.00 = no markup, 1.5 = 50% markup
  maxAgents: integer("maxAgents").default(10),
  maxRunTimeSeconds: integer("maxRunTimeSeconds").default(600),

  // Status
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  isFallbackSafe: boolean("isFallbackSafe").default(false).notNull(),
  isPublished: boolean("isPublished").default(false).notNull(),

  // Audit
  createdBy: integer("createdBy")
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [
  // Indexes for common queries
  uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
  index("agencies_tenant_idx").on(t.tenantId),
  index("agencies_created_by_idx").on(t.createdBy),
]);

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = typeof agencies.$inferInsert;
```

**Key Points**:
- `creditMultiplier` as numeric (not integer) for precise percentages
- `status` as varchar (string union in TypeScript)
- Cascade delete on tenantId (safety measure)
- Slug unique per tenant (not globally unique)
- Soft delete via status (never hard delete)

---

## 4. Python Adapter Pattern: create_agent

**File**: `python-backend/app/services/agency_swarm_adapter.py` (line 103–137)

```python
def create_agent(self, config: AgentConfig, user_token: str) -> Agent:
    """Construct an Agent with SmartSpecPro's gateway-routed LLM model."""

    # 1. Create LLM model pointing to Node.js gateway
    model = self._create_model(config.model, user_token)

    # 2. Build agent kwargs
    agent_kwargs: dict[str, Any] = {
        "name": config.name,
        "instructions": config.instructions,
        "model": model,
        "tools": list(config.tools),
    }

    # 3. Add optional model settings
    if config.model_settings:
        agent_kwargs["model_settings"] = ModelSettings(
            **config.model_settings
        )

    # 4. Create agent
    agent = Agent(**agent_kwargs)

    # 5. Store entry-point metadata
    agent._is_entry_point = config.is_entry_point  # type: ignore

    logger.info(
        "agency_agent_created",
        agent_name=config.name,
        model=config.model,
        tool_count=len(config.tools),
        is_entry_point=config.is_entry_point,
    )

    return agent

def _create_model(
    self, model_name: str, user_token: str
) -> OpenAIChatCompletionsModel:
    """Create an OpenAIChatCompletionsModel pointing to Node.js gateway."""

    # Gateway URL from environment
    base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")

    # AsyncOpenAI client for gateway
    client = AsyncOpenAI(
        api_key=user_token,  # JWT token for credit attribution
        base_url=f"{base_url}/api/llm/v2",
    )

    # OpenAIChatCompletionsModel for agency-swarm compatibility
    return OpenAIChatCompletionsModel(model=model_name, openai_client=client)
```

**Key Points**:
- User token passed as api_key (credit attribution)
- Gateway URL from environment (NODEJS_INTERNAL_URL)
- ModelSettings optional (only if provided in config)
- Entry-point metadata stored as private attribute
- Structured logging for observability

---

## 5. Python Service Pattern: execute_run (11-step lifecycle)

**File**: `python-backend/app/services/agency_service.py` (line 169–315)

```python
async def execute_run(
    self,
    agency_id: str,
    message: str,
    context: RunContext,
) -> RunResult:
    """Full run lifecycle: load → construct → pre-check → execute → markup."""

    run_id = str(uuid.uuid4())
    start_time = time.monotonic()

    # Step 1: Load agency config
    agency_config = await self.load_agency(agency_id, context.tenant_id)
    agency_config.user_id = context.user_id
    agency_config.conversation_id = context.conversation_id

    # Step 2: Load agent definitions
    agents_data = await self._load_agents(agency_id)

    # Step 3: Pre-check credits
    estimate = self.credit_manager.estimate_run_cost(
        agent_count=max(len(agents_data), 1),
    )
    has_credits = await self.credit_manager.pre_check(
        user_id=context.user_id,
        estimated_cost=estimate,
    )
    if not has_credits:
        raise InsufficientCreditsError(
            f"Insufficient credits for estimated cost ${estimate:.4f}"
        )

    # Step 4: Resolve tools for each agent
    agent_tools: dict[str, list[type]] = {}
    for agent_data in agents_data:
        tools = await resolve_tools_for_agent(
            db=self.db,
            agent_id=agent_data["id"],
            agency_whitelist=set(),  # TODO: load from config
            adapter=self.adapter,
        )
        agent_tools[agent_data["id"]] = tools

    # Step 5: Create persistence hooks
    load_cb, save_cb = create_persistence_hooks(
        conversation_id=context.conversation_id,
        db_session_factory=AsyncSessionLocal,
    )

    # Step 6: Construct agents via adapter
    agents = []
    for agent_data in agents_data:
        agent = self.adapter.create_agent(
            config=AgentConfig(
                name=agent_data["name"],
                instructions=agent_data["instructions"],
                model=agent_data["model"],
                model_settings=agent_data["model_settings"],
                tools=agent_tools.get(agent_data["id"], []),
                is_entry_point=agent_data["is_entry_point"],
            ),
            user_token=context.user_token,
        )
        agents.append(agent)

    # Step 7: Construct agency via adapter
    agency = self.adapter.create_agency(
        config=agency_config,
        agents=agents,
        persistence_hooks=(load_cb, save_cb),
    )

    # Step 8: Create run record (status: running)
    await self.db.execute(
        text("""
            INSERT INTO agency_runs
                (id, conversation_id, user_id, agency_id, tenant_id,
                 status, started_at)
            VALUES
                (:id, :conv_id, :user_id, :agency_id, :tenant_id,
                 'running', :started_at)
        """),
        {
            "id": run_id,
            "conv_id": context.conversation_id,
            "user_id": context.user_id,
            "agency_id": agency_id,
            "tenant_id": context.tenant_id,
            "started_at": datetime.now(timezone.utc),
        },
    )
    await self.db.commit()

    try:
        # Step 9: Execute agency
        result = await self.adapter.run(
            agency=agency,
            message=message,
            timeout_seconds=agency_config.max_run_time_seconds,
            agency_id=agency_id,
            tenant_id=context.tenant_id,
        )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # Step 10: Apply multiplier markup
        await self.credit_manager.apply_multiplier_markup(
            user_id=context.user_id,
            agency_id=agency_id,
            total_gateway_cost=0.0,  # TODO: reconcile from provider_usage_log
            multiplier=agency_config.credit_multiplier,
        )

        # Step 11: Update run record (status: completed)
        await self.db.execute(
            text("""
                UPDATE agency_runs
                SET status = 'completed',
                    completed_at = :completed_at,
                    duration_ms = :duration_ms,
                    step_count = :step_count
                WHERE id = :id
            """),
            {
                "id": run_id,
                "completed_at": datetime.now(timezone.utc),
                "duration_ms": elapsed_ms,
                "step_count": result.step_count,
            },
        )
        await self.db.commit()

        logger.info(
            "agency_service_run_completed",
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=context.tenant_id,
            duration_ms=elapsed_ms,
        )

        return result

    except Exception as exc:
        # Error handling: update record (status: failed)
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        try:
            await self.db.execute(
                text("""
                    UPDATE agency_runs
                    SET status = 'failed',
                        completed_at = :completed_at,
                        duration_ms = :duration_ms,
                        error_type = :error_type,
                        error_message = :error_message
                    WHERE id = :id
                """),
                {
                    "id": run_id,
                    "completed_at": datetime.now(timezone.utc),
                    "duration_ms": elapsed_ms,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc)[:500],
                },
            )
            await self.db.commit()
        except Exception:
            logger.error("agency_run_record_update_failed", run_id=run_id)

        raise
```

**Key Points**:
- 11 distinct steps, each logged
- Database transaction for record creation + update
- Credit pre-check before expensive operations
- Error handling: catch, record error, re-raise
- UUID for run_id (not auto-increment for distributed safety)
- Elapsed time calculated with monotonic clock (immune to NTP)

---

## 6. Feature Flag Pattern: Node.js + Python

**Node.js** (`apps/web/server/routers/agency.ts`):
```typescript
async function assertAgencyEnabled(): Promise<void> {
  const enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED");
  if (!enabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
}

// Every endpoint calls this
sendMessage: agencyMessageProcedure.mutation(async ({ ctx, input }) => {
  await assertAgencyEnabled();  // Returns 404 if disabled
  // ...
}),
```

**Python** (`python-backend/app/api/agencies.py`):
```python
async def require_agency_feature(
    db: AsyncSession = Depends(get_db),
) -> None:
    """Dependency that raises 404 if AGENCY_SWARM_ENABLED is false."""

    # Fast path: check config (set via env var)
    if settings.AGENCY_SWARM_ENABLED:
        return

    # Fallback: check system_settings table
    try:
        result = await db.execute(
            text("""
                SELECT value FROM system_settings
                WHERE category = 'feature_flags'
                  AND key = 'AGENCY_SWARM_ENABLED'
                LIMIT 1
            """)
        )
        row = result.first()
        if row and str(row.value).lower() in ("true", "1", "yes"):
            return
    except Exception:
        pass  # DB error -- fall through to disabled

    raise HTTPException(status_code=404, detail="Agency feature is disabled")

# Every endpoint uses this dependency
@router.post("/{agency_id}/run")
async def run_agency(
    agency_id: str,
    request: AgencyRunRequest,
    _flag: None = Depends(require_agency_feature),
) -> AgencyRunResponse:
    # ...
```

**Key Points**:
- Returns 404 (hidden feature) not 403 (forbidden)
- Config + DB fallback for flexibility
- Dependency pattern (DI in FastAPI)
- No repeated flag checks in implementation

---

## 7. Error Classification Pattern

**File**: `python-backend/app/api/agencies.py` (line 89–121)

```python
class AgencyErrorType:
    """Error classification constants."""
    TRANSIENT = "transient"  # timeout, 429, 503 -- retry
    PERMANENT = "permanent"  # auth, validation, credit -- fail fast
    OPTIONAL_SKIP = "optional_skip"  # optional agent failed -- skip

def classify_error(error: Exception, agent_is_optional: bool = False) -> str:
    """Classify an error for retry/fail/skip decision."""

    if agent_is_optional:
        return AgencyErrorType.OPTIONAL_SKIP

    # Transient errors
    if isinstance(error, (asyncio.TimeoutError, ConnectionError)):
        return AgencyErrorType.TRANSIENT

    status_code = getattr(error, "status_code", None)
    if status_code in (429, 502, 503, 504):
        return AgencyErrorType.TRANSIENT

    # Permanent errors
    if isinstance(error, (InsufficientCreditsError, ValueError)):
        return AgencyErrorType.PERMANENT

    if status_code in (400, 401, 403):
        return AgencyErrorType.PERMANENT

    # Default: permanent (fail-safe)
    return AgencyErrorType.PERMANENT

# Usage in SSE streaming
async def sse_generator() -> AsyncIterator[str]:
    try:
        async for event in service.execute_run_stream(...):
            yield f"event: {event_type}\ndata: {json.dumps(event.data)}\n\n"
    except Exception as exc:
        err_type = classify_error(exc)
        error_data = {
            "error_type": err_type,
            "message": str(exc)[:500],
            "retryable": err_type == AgencyErrorType.TRANSIENT,
        }
        yield f"event: run_error\ndata: {json.dumps(error_data)}\n\n"
```

**Key Points**:
- Classification separates retry logic from business logic
- Optional agents degrade gracefully
- Client knows whether error is retryable (via SSE event)
- Default: fail-safe (don't retry unknown errors)

---

## 8. Tool Resolution Pattern

**File**: `python-backend/app/services/agency_tools.py` (line 164–226)

```python
async def resolve_tools_for_agent(
    db: AsyncSession,
    agent_id: str,
    agency_whitelist: set[str],
    adapter=None,
) -> list[type]:
    """Resolve and construct tool bridges for a specific agent."""

    # Query: join agent_tools → tools
    query = text("""
        SELECT
            t.id as tool_id,
            t.name,
            t.description,
            t."toolType" as tool_type,
            t."riskLevel" as risk_level,
            t."requiresApproval" as requires_approval,
            t.config
        FROM agency_agent_tools aat
        JOIN agency_tools t ON t.id = aat."toolId"
        WHERE aat."agentId" = :agent_id
    """)

    result = await db.execute(query, {"agent_id": agent_id})
    rows = result.all()

    tool_classes: list[type] = []
    for row in rows:
        # Extract endpoint_url from config JSON
        raw_config = row.config or {}
        endpoint_url = None
        if isinstance(raw_config, dict):
            endpoint_url = raw_config.pop("endpoint_url", None)

        # Create ToolConfig
        config = ToolConfig(
            tool_id=row.tool_id,
            tool_type=row.tool_type or "builtin",
            risk_level=row.risk_level or "low",
            requires_approval=bool(row.requires_approval),
            endpoint_url=endpoint_url,
            config=raw_config if isinstance(raw_config, dict) else {},
        )

        # Create tool bridge
        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter)
        tool_classes.append(tool_cls)

    logger.info(
        "agency_tools_resolved",
        agent_id=agent_id,
        tool_count=len(tool_classes),
    )

    return tool_classes  # Returns classes, not instances
```

**Key Points**:
- Returns tool **classes** (not instances) for agency-swarm
- Tool risk levels guide execution routing
- Whitelist enforcement at execution time (not query time)
- Config JSON extracted per tool
- Structured logging for debugging

---

## 9. Retry Pattern with Exponential Backoff

**File**: `python-backend/app/api/agencies.py` (line 124–156)

```python
MAX_RETRIES = 3
BACKOFF_BASE = 1.0  # seconds

async def with_retry(coro_factory, max_retries=MAX_RETRIES):
    """Execute an async operation with exponential backoff retry."""
    last_error = None
    for attempt in range(max_retries):
        try:
            return await coro_factory()
        except Exception as exc:
            error_type = classify_error(exc)
            if error_type != AgencyErrorType.TRANSIENT:
                raise  # Fail fast for permanent errors

            last_error = exc
            if attempt < max_retries - 1:
                delay = BACKOFF_BASE * (2**attempt)  # 1s, 2s, 4s
                logger.warning(
                    "agency_retry",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

    raise last_error

# Usage
@router.post("/{agency_id}/run")
async def run_agency(...) -> AgencyRunResponse:
    try:
        result = await with_retry(
            lambda: service.execute_run(agency_id, request.message, context)
        )
    except InsufficientCreditsError as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    # ...
```

**Key Points**:
- Coro factory pattern (coroutine can't be awaited twice)
- Exponential backoff: 1s → 2s → 4s
- Classifies error before deciding to retry
- Permanent errors fail immediately (no retry)
- Last error re-raised if all retries exhausted

---

## 10. Callback-Based Persistence (Sketch)

**File**: `python-backend/app/services/agency_persistence.py`

```python
def create_persistence_hooks(
    conversation_id: str,
    db_session_factory,
):
    """Create load/save callbacks for agency-swarm thread persistence."""

    async def load_threads():
        """Load all messages for this conversation."""
        async with db_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT role, content, tool_calls
                    FROM agency_messages
                    WHERE conversation_id = :conv_id
                    ORDER BY created_at ASC
                """),
                {"conv_id": conversation_id},
            )
            rows = result.all()
            # Convert to agency-swarm thread format
            return [
                {"role": row.role, "content": row.content, ...}
                for row in rows
            ]

    async def save_threads(threads):
        """Persist agent-to-agent communication."""
        async with db_session_factory() as session:
            for thread in threads:
                await session.execute(
                    text("""
                        INSERT INTO agency_messages
                            (conversation_id, role, content, agent_name, ...)
                        VALUES
                            (:conv_id, :role, :content, :agent_name, ...)
                    """),
                    {
                        "conv_id": conversation_id,
                        "role": thread["role"],
                        "content": thread["content"],
                        "agent_name": thread.get("agent_name"),
                    },
                )
            await session.commit()

    return load_threads, save_threads
```

**Key Points**:
- Callbacks are async functions (FastAPI compatible)
- Load: convert agency-swarm threads to database rows
- Save: persist new messages from agent execution
- Conversation scoped (all messages for one conv_id)
- Clean separation: agency-swarm internals ↔ DB persistence

---

## Summary: Design Principles

1. **Adapter Isolation**: Only adapter imports agency-swarm
2. **Per-Request Fresh State**: No shared Agency instances
3. **Callback Persistence**: Transparent message storage
4. **Error Classification**: Smart retry logic (transient vs. permanent)
5. **Feature Flag Gating**: Gradual rollout, hidden when disabled
6. **Multi-Tenancy**: Tenant_id in every query + header + context
7. **Structured Logging**: Observable execution for debugging
8. **Timeout Guards**: maxRunTimeSeconds + AbortSignal
9. **Credit Pre-Check**: Advisory balance check before run
10. **Tool Whitelist**: Risk-based authorization per agency
