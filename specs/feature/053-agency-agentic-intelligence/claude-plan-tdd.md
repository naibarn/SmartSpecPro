# TDD Plan: Agency Agentic Intelligence Layer (053)

## Testing Framework

- **Python:** pytest with asyncio auto mode, markers (unit/integration), 80% coverage enforced
- **TypeScript:** Vitest
- **Conventions:** `python-backend/tests/unit/` for unit, `tests/integration/` for integration
- **Mocking:** `unittest.mock` + `httpx` mock for gateway calls, `fakeredis` for Redis

---

## Level 1 — Agentic Mode Tests

### Section 01: Foundation (agentic_limits, agentic_sanitizer, agentic_strategies)

#### `test_agentic_limits.py`
```python
def test_all_limits_have_defaults():
    """Every MAX_* constant has a positive integer default."""

def test_limits_read_from_env(monkeypatch):
    """MAX_REFLECTION_CYCLES reads from SSP_MAX_REFLECTION_CYCLES env var."""

def test_clamp_user_value_to_max():
    """min(user_value=999, MAX_REFLECTION_CYCLES=10) returns 10."""
```

#### `test_agentic_sanitizer.py`
```python
def test_strips_system_injection_markers():
    """Input containing '[SYSTEM]' and 'Ignore previous' has markers replaced with [FILTERED]."""

def test_strips_openai_special_tokens():
    """Input with '<|im_start|>' is cleaned."""

def test_preserves_normal_text():
    """Regular text without injection markers passes through unchanged."""

def test_truncates_long_input():
    """Input > max_length is truncated."""

def test_strips_non_printable_chars():
    """Control characters (except newline/tab) are removed."""

def test_empty_input_returns_empty():
    """Empty string input returns empty string."""
```

#### `test_agentic_strategies.py`
```python
def test_basic_strategy_template_exists():
    """get_planning_prompt('basic', 3) returns non-empty string."""

def test_cot_strategy_template_exists():
    """get_planning_prompt('cot', 3) returns non-empty string."""

def test_react_strategy_template_exists():
    """get_planning_prompt('react', 3) returns non-empty string."""

def test_unknown_strategy_raises():
    """get_planning_prompt('unknown', 3) raises ValueError."""

def test_cycle_count_injected():
    """Template contains the max_cycles value."""

def test_all_templates_contain_completion_instruction():
    """Every template mentions structured JSON completion signal."""
```

### Section 02: Orchestrator Modification

#### `test_completion_detection.py`
```python
def test_parse_completion_valid_json_block():
    """Response ending with ```json\n{"complete": true, "answer": "done"}\n``` returns CompletionSignal."""

def test_parse_completion_raw_json_at_end():
    """Response ending with {"complete": true, "answer": "done"} returns CompletionSignal."""

def test_parse_completion_no_json():
    """Response with no JSON returns None (continue loop)."""

def test_parse_completion_malformed_json():
    """Response with invalid JSON returns None."""

def test_parse_completion_complete_false():
    """Response with {"complete": false} returns CompletionSignal with complete=False."""

def test_parse_completion_marker_in_tool_output():
    """'[COMPLETE]' appearing in text body does NOT trigger completion (no bare markers)."""

def test_parse_completion_user_injected_marker():
    """User saying '[FINAL ANSWER]' in their message does NOT trigger completion."""

def test_max_cycles_zero_returns_immediately():
    """maxReflectionCycles=0 returns without calling LLM."""
```

#### `test_agentic_orchestrator.py`
```python
@pytest.mark.asyncio
async def test_agentic_mode_calls_planning_prompt():
    """When executionMode='agentic', agent instructions include planning template."""

@pytest.mark.asyncio
async def test_agentic_mode_reflection_loop():
    """Agent called multiple times until CompletionSignal received."""

@pytest.mark.asyncio
async def test_agentic_mode_max_cycles_respected():
    """Loop stops after max cycles even without CompletionSignal."""

@pytest.mark.asyncio
async def test_single_shot_mode_unchanged():
    """executionMode='single_shot' follows existing code path."""

@pytest.mark.asyncio
async def test_ctx_results_overwritten_not_accumulated():
    """ctx.results[node_id] is overwritten each cycle, not accumulated."""
```

### Section 03: Frontend + Validation

#### `AgenticConfig.test.tsx`
```typescript
test('renders execution mode dropdown for agent nodes')
test('shows agentic sub-options when agentic mode selected')
test('hides agentic sub-options when standard mode selected')
test('slider range is 1-10 for max reflection cycles')
test('shows cost warning banner when agentic enabled')
```

#### Zod validation tests (in agency router tests)
```typescript
test('saveBuilder accepts valid agentic nodeConfig')
test('saveBuilder rejects maxReflectionCycles > 10')
test('saveBuilder rejects unknown planningStrategy')
test('saveBuilder accepts missing executionMode (defaults to single_shot)')
```

---

## Level 2 — ReAct Executor Tests

### Section 05: ReAct Executor Core

#### `test_react_executor.py`
```python
@pytest.mark.asyncio
async def test_react_loop_completes_on_no_tool_calls():
    """When LLM returns text without tool_calls, loop exits with final answer."""

@pytest.mark.asyncio
async def test_react_loop_executes_tool_and_continues():
    """LLM returns tool_call → tool executed → observation fed back → LLM called again."""

@pytest.mark.asyncio
async def test_react_loop_budget_exceeded():
    """Loop stops when cumulative tokens exceed max_tokens_budget."""

@pytest.mark.asyncio
async def test_react_loop_max_iterations():
    """Loop stops after max_iterations even with ongoing tool calls."""

@pytest.mark.asyncio
async def test_react_parallel_tool_calls():
    """Multiple tool_calls in one response are executed concurrently."""

@pytest.mark.asyncio
async def test_react_tool_not_found():
    """Tool call referencing non-existent tool returns error observation."""

@pytest.mark.asyncio
async def test_react_tool_ssrf_blocked():
    """Tool with blocked URL raises SSRF error in observation."""

@pytest.mark.asyncio
async def test_react_circuit_breaker():
    """3 consecutive tool failures stop the loop."""

@pytest.mark.asyncio
async def test_react_message_compression():
    """After 5 iterations, older messages are compressed into summary."""

@pytest.mark.asyncio
async def test_react_gateway_client_required():
    """Constructor raises if gateway_client is None."""

@pytest.mark.asyncio
async def test_react_sanitizes_task_input():
    """Task input is passed through sanitize_llm_input() before LLM call."""
```

#### `test_tool_definition_conversion.py`
```python
def test_tool_config_to_function_basic():
    """ToolConfig converts to valid OpenAI function definition."""

def test_tool_config_with_input_schema():
    """Input schema is included in function parameters."""

def test_tool_config_without_schema():
    """Missing input_schema produces empty parameters object."""
```

### Section 06: Working Memory

#### `test_working_memory.py`
```python
def test_add_observation():
    """Observation stored with tool, result, useful flag, timestamp."""

def test_add_observation_sanitizes_content():
    """Injection markers in tool results are stripped before storing."""

def test_add_constraint_deduplication():
    """Same constraint added twice is stored only once."""

def test_get_summary_includes_constraints():
    """Summary text contains 'Known constraints' section."""

def test_get_summary_includes_failed_approaches():
    """Summary text contains 'Failed approaches' section."""

def test_get_summary_truncates_to_max_tokens():
    """Summary output respects max_tokens limit."""

def test_eviction_removes_useless_first():
    """When max_entries exceeded, useful=False entries evicted first."""

def test_eviction_then_oldest():
    """After useless entries gone, oldest entries evicted."""

def test_duplicate_tool_call_adds_constraint():
    """Same tool+params called twice auto-adds constraint."""

@pytest.mark.asyncio
async def test_redis_persistence():
    """Memory round-trips through Redis serialize/deserialize."""

@pytest.mark.asyncio
async def test_redis_key_includes_tenant():
    """Key pattern is agency:run:{tenant_id}:{run_id}:memory:{agent_id}."""

@pytest.mark.asyncio
async def test_redis_ttl_set():
    """Key has 1-hour TTL."""
```

### Section 07: Cost Controls

#### `test_cost_controls.py`
```python
def test_token_budget_tracker_under_budget():
    """Track 1000 tokens against 50000 budget → not exceeded."""

def test_token_budget_tracker_exceeded():
    """Track 51000 tokens against 50000 budget → exceeded."""

def test_token_budget_warning_at_80_percent():
    """At 40000/50000 tokens, budget_warning flag is True."""

@pytest.mark.asyncio
async def test_concurrent_run_limiter_acquire():
    """First acquire succeeds when under limit."""

@pytest.mark.asyncio
async def test_concurrent_run_limiter_blocked():
    """Acquire fails when limit reached, returns 429-style error."""

@pytest.mark.asyncio
async def test_concurrent_run_limiter_release():
    """Release decrements counter, next acquire succeeds."""

@pytest.mark.asyncio
async def test_concurrent_run_limiter_ttl_fallback():
    """Stuck counter auto-expires after TTL."""

@pytest.mark.asyncio
async def test_per_user_limit_enforced():
    """User with 2 active ReAct runs cannot start a 3rd."""
```

---

## Level 3 — Autonomous Agent Tests

### Section 09: Database Migration

#### `test_agency_agent_memories_schema.py`
```python
def test_table_exists():
    """agency_agent_memories table exists after migration."""

def test_tenant_id_is_varchar36():
    """tenant_id column type matches tenants.id (VARCHAR(36))."""

def test_agency_id_is_varchar36():
    """agency_id column type matches agencies.id (VARCHAR(36))."""

def test_user_id_fk_exists():
    """user_id has FK constraint to users(id)."""

def test_content_hash_unique_index():
    """Unique index on (tenant_id, agency_id, agent_node_id, user_id, content_hash) WHERE is_active."""
```

### Section 10: Autonomous Executor

#### `test_autonomous_executor.py`
```python
@pytest.mark.asyncio
async def test_plan_decomposition():
    """Planner decomposes task into sub-tasks with dependencies."""

@pytest.mark.asyncio
async def test_plan_validation_empty():
    """Empty plan (0 sub-tasks) raises PlanValidationError."""

@pytest.mark.asyncio
async def test_plan_validation_cycle():
    """Dependency cycle detected raises PlanValidationError."""

@pytest.mark.asyncio
async def test_plan_validation_nonexistent_agent():
    """Sub-task delegating to non-existent agent falls back to self-execution."""

@pytest.mark.asyncio
async def test_sequential_execution():
    """Sub-tasks with dependencies execute in dependency order."""

@pytest.mark.asyncio
async def test_parallel_execution():
    """Independent sub-tasks execute concurrently via asyncio.gather."""

@pytest.mark.asyncio
async def test_reflection_triggers_replan():
    """Quality score < threshold triggers re-planning."""

@pytest.mark.asyncio
async def test_reflection_accepts_result():
    """Quality score >= threshold marks run complete."""

@pytest.mark.asyncio
async def test_delegation_depth_enforcement():
    """Delegation at depth >= MAX_DELEGATION_DEPTH returns error, not recurse."""

@pytest.mark.asyncio
async def test_delegation_context_isolation():
    """Delegated agent writes to own namespace, not parent's ctx.results."""
```

### Section 11: Execution Memory Store

#### `test_execution_memory_store.py`
```python
@pytest.mark.asyncio
async def test_save_and_load_plan():
    """Plan survives Redis round-trip."""

@pytest.mark.asyncio
async def test_checkpoint_written_to_postgres():
    """After sub-task completion, checkpoint appears in agency_run_traces."""

@pytest.mark.asyncio
async def test_crash_recovery_from_postgres():
    """After clearing Redis, state recoverable from Postgres checkpoint."""

@pytest.mark.asyncio
async def test_redis_key_tenant_namespaced():
    """Key includes tenant_id in pattern."""

@pytest.mark.asyncio
async def test_tenant_validation_on_read():
    """Reading state with wrong tenant_id returns None/error."""
```

### Section 12: Long-Term Memory

#### `test_long_term_memory.py`
```python
@pytest.mark.asyncio
async def test_memory_creation():
    """Memory saved with content, type, source_run_id, content_hash."""

@pytest.mark.asyncio
async def test_memory_scoped_by_user():
    """User A's memories not returned when querying for User B."""

@pytest.mark.asyncio
async def test_memory_content_sanitized():
    """Injection markers stripped from memory content before storage."""

@pytest.mark.asyncio
async def test_memory_content_length_capped():
    """Content > 500 chars is truncated before storage."""

@pytest.mark.asyncio
async def test_memory_safety_filter():
    """Content containing instructions/commands rejected by safety filter."""

@pytest.mark.asyncio
async def test_memory_injection_as_user_role():
    """Memories injected in user-role message with <past_learnings> framing."""

@pytest.mark.asyncio
async def test_confidence_decay():
    """After N days without use, confidence drops by 0.95^N."""

@pytest.mark.asyncio
async def test_low_confidence_soft_deleted():
    """Memory with confidence < 0.1 set to is_active=false by decay job."""

@pytest.mark.asyncio
async def test_max_memories_per_agent():
    """Cannot exceed MAX_MEMORIES_PER_AGENT active memories."""

@pytest.mark.asyncio
async def test_duplicate_content_hash_rejected():
    """Second memory with same content_hash is not inserted (unique index)."""

@pytest.mark.asyncio
async def test_audit_trail_on_write():
    """log_agency_event called with memory creation details."""

@pytest.mark.asyncio
async def test_audit_trail_on_delete():
    """log_agency_event called with deletion actor and memory ID."""
```

### Section 13: Frontend Components

#### `AutonomousConfigPanel.test.tsx`
```typescript
test('renders all autonomous config fields')
test('maxPlanDepth slider range is 1-5')
test('maxTotalIterations slider range is 1-50')
test('delegation mode dropdown has 3 options')
test('quality threshold slider range is 0-1')
test('shows cost estimate label')
```

#### `MemoryViewer.test.tsx`
```typescript
test('renders memory list with type badges')
test('filters by memory type')
test('delete button calls deleteAgentMemory mutation')
test('reset button calls resetAgentMemories mutation')
test('shows confirmation dialog before reset')
test('empty state shows "No memories" message')
```

---

## Integration Tests

### `test_agentic_integration.py`
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_level1_end_to_end():
    """Full agentic mode flow: agent with planning prompt → reflection loop → completion."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_level2_react_end_to_end():
    """Full ReAct flow: tool calls → observations → final answer."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_level2_budget_integration():
    """ReAct with low budget → stops at budget, returns partial result."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_level3_plan_execute_reflect():
    """Full autonomous flow: plan → execute sub-tasks → reflect → complete."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_cross_agency_delegation():
    """Autonomous agent delegates to another agency via builtin-agency-call."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_memory_tenant_isolation():
    """Memories from tenant A not accessible by tenant B."""

@pytest.mark.integration
@pytest.mark.asyncio
async def test_feature_flag_gates_agentic():
    """Disabled feature flag falls back to single_shot mode."""
```
