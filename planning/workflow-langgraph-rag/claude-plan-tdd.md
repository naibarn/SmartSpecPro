# TDD Test Plan: SmartSpecPro Workflow Engine Rebuild

## Testing Philosophy

Write tests BEFORE implementation for each section. Each section has:
1. **Red**: Write failing tests that define the expected behavior
2. **Green**: Implement the minimum code to pass tests
3. **Refactor**: Clean up while keeping tests green

## Shared Test Infrastructure

### Base Test Fixtures (`python-backend/tests/conftest.py` additions)

```python
# Fixtures needed across all sections:
@pytest.fixture
async def mock_execution_context() -> ExecutionContext
@pytest.fixture
async def mock_node_data() -> NodeExecutionData
@pytest.fixture
async def redis_client() -> AsyncRedis  # Test Redis instance
@pytest.fixture
async def pg_pool() -> AsyncConnectionPool  # Test PostgreSQL pool
@pytest.fixture
async def checkpointer() -> AsyncPostgresSaver  # Test checkpointer
```

### Executor Test Contract (`python-backend/tests/executor_test_base.py`)

```python
class ExecutorTestContract:
    """Every executor test class inherits this and gets 5 standard tests for free."""
    executor_class: type  # Set in subclass
    valid_config: dict    # Set in subclass
    valid_input: dict     # Set in subclass

    async def test_returns_dict(self): ...
    async def test_handles_missing_required_input(self): ...
    async def test_handles_invalid_input_type(self): ...
    async def test_respects_timeout(self): ...
    async def test_output_keys_match_output_spec(self): ...
```

---

## Section 1: LangGraph Runtime Core

### Test File: `tests/test_langgraph_runtime.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_compile_simple_linear_workflow` | unit | ReactFlow JSON with 3 sequential nodes compiles to valid StateGraph |
| `test_compile_branching_workflow` | unit | If/Switch nodes produce conditional edges |
| `test_compile_parallel_fork_join` | unit | Fork-join pattern creates parallel execution groups |
| `test_compile_rejects_cycle` | unit | Cyclic graph raises CompilationError |
| `test_compile_rejects_orphan_nodes` | unit | Disconnected nodes raise CompilationError |
| `test_compile_rejects_missing_trigger` | unit | No trigger node raises CompilationError |
| `test_compile_validates_port_types` | unit | Incompatible port types raise CompilationError |
| `test_compile_warns_unreachable_nodes` | unit | Unreachable nodes logged as warnings, not errors |
| `test_execute_simple_workflow` | integration | Compiled workflow runs to completion, returns outputs |
| `test_execute_creates_checkpoint` | integration | Execution creates checkpoint in PostgreSQL |
| `test_resume_from_checkpoint` | integration | Interrupted workflow resumes from last checkpoint |
| `test_thread_id_namespaced` | unit | Thread ID includes tenant_id prefix |
| `test_concurrent_workflow_limit` | integration | Semaphore blocks when max_parallel_workflows reached |
| `test_large_output_externalized` | integration | Node outputs > 1MB stored externally, reference in state |

### Test File: `tests/test_workflow_compiler.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_node_adapter_wraps_executor` | unit | `make_langgraph_node` wraps executor and returns state update |
| `test_node_adapter_injects_context_from_config` | unit | ExecutionContext built from config["configurable"] |
| `test_node_adapter_catches_exceptions` | unit | Exceptions stored in errors field, don't crash graph |
| `test_switch_routing_function_generated` | unit | Switch node generates correct routing function at compile time |
| `test_approval_expands_to_subgraph` | unit | Approval node expands to interrupt subgraph |

### Test File: `tests/test_expression_engine.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_simple_field_reference` | unit | `{{node1.field}}` resolves correctly |
| `test_nested_field_access` | unit | `{{node1.data.nested.value}}` works |
| `test_array_indexing` | unit | `{{node1.items[0]}}` works |
| `test_optional_chaining` | unit | `{{node1.data?.missing}}` returns None |
| `test_blocks_function_calls` | unit | `{{node1.field()}}` raises SecurityError |
| `test_blocks_eval_exec` | unit | Expressions with eval/exec/import rejected |
| `test_condition_operators` | unit | ==, !=, >, <, contains, matches all work |
| `test_boolean_combinators` | unit | AND, OR, NOT combine conditions correctly |

---

## Section 2: Streaming Integration

### Test File: `tests/test_streaming.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_astream_events_to_sse_node_start` | unit | `on_chain_start` maps to `node_start` SSE event |
| `test_astream_events_to_sse_node_complete` | unit | `on_chain_end` maps to `node_complete` with outputs |
| `test_astream_events_to_sse_node_error` | unit | `on_chain_error` maps to `node_error` with message |
| `test_astream_events_to_sse_workflow_complete` | unit | Custom event maps to `workflow_complete` |
| `test_token_streaming` | unit | `on_chat_model_stream` maps to `token` events |
| `test_internal_routing_nodes_filtered` | unit | Internal LangGraph routing events not sent to client |
| `test_ring_buffer_stores_events` | unit | Ring buffer stores last 100 events |
| `test_sse_reconnection_replays_from_last_event_id` | integration | Missed events replayed on reconnect |

---

## Section 3: Human-in-the-Loop (HITL)

### Test File: `tests/test_hitl.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_interrupt_pauses_graph` | integration | `interrupt()` pauses execution and checkpoints |
| `test_interrupt_sends_sse_event` | integration | Frontend receives `approval_required` SSE event |
| `test_resume_with_approval` | integration | `Command(resume={"approved": True})` continues graph |
| `test_resume_with_rejection` | integration | Rejection routes to error/reject path |
| `test_timeout_auto_rejects` | integration | Celery task auto-rejects after timeout |
| `test_interrupt_survives_restart` | integration | Interrupt data persists in checkpoint across restarts |

---

## Section 4: Trigger Nodes

### Test File: `tests/test_node_executors/test_triggers.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_manual_trigger_compatible` | unit | Manual trigger works with new runtime adapter |
| `test_webhook_trigger_parses_body` | unit | Request body, headers, query params extracted |
| `test_webhook_trigger_methods` | unit | POST/GET/PUT/PATCH/DELETE supported |
| `test_schedule_trigger_cron` | unit | Cron expression parsed and validated |
| `test_queue_trigger_consumes` | integration | Redis Streams message consumed and processed |
| `test_queue_trigger_acks` | integration | Message acknowledged after successful processing |
| `test_queue_trigger_batch` | integration | Batch of N messages consumed together |

---

## Section 5: Core I/O Nodes

### Test File: `tests/test_node_executors/test_io.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_http_request_get` | unit | GET request returns status, headers, body |
| `test_http_request_post_json` | unit | POST with JSON body works |
| `test_http_request_auth_bearer` | unit | Bearer token added to headers |
| `test_http_request_blocks_private_ip` | unit | **SSRF**: 10.0.0.0/8, 172.16.0.0/12, etc. blocked |
| `test_http_request_blocks_localhost` | unit | **SSRF**: localhost, 127.0.0.1 blocked |
| `test_http_request_blocks_metadata` | unit | **SSRF**: 169.254.169.254 blocked |
| `test_http_request_allows_tenant_allowlist` | unit | Allowed internal URLs pass for enterprise |
| `test_db_query_select` | unit | SELECT returns rows |
| `test_db_query_parameterized` | unit | Parameters properly bound |
| `test_db_query_blocks_drop` | unit | **SQL safety**: DROP rejected |
| `test_db_query_blocks_truncate` | unit | **SQL safety**: TRUNCATE rejected |
| `test_db_query_blocks_delete_default` | unit | **SQL safety**: DELETE rejected by default |
| `test_storage_upload` | unit | File uploaded, URL returned |
| `test_storage_download` | unit | File downloaded by key |
| `test_notification_email` | unit | Email sent via SMTP |
| `test_webhook_response` | unit | HTTP response with status, headers, body |

---

## Section 6: Data Shaping Nodes

### Test File: `tests/test_node_executors/test_data.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_set_fields_static` | unit | Static value set on output |
| `test_set_fields_expression` | unit | `{{node_id.field}}` resolved from state |
| `test_map_fields_rename` | unit | Fields renamed per mapping |
| `test_map_fields_drop_unmapped` | unit | Unmapped fields dropped when configured |
| `test_filter_matches` | unit | Matching items pass, rejected items on other port |
| `test_if_true_branch` | unit | True condition routes to true output |
| `test_if_false_branch` | unit | False condition routes to false output |
| `test_switch_routes_by_value` | unit | Cases routed to correct ports |
| `test_switch_default_port` | unit | Unmatched value goes to default |
| `test_merge_append` | unit | Arrays concatenated |
| `test_merge_key_join` | unit | Objects joined on key field |
| `test_split_items` | unit | Array split into individual items |
| `test_batch_chunks` | unit | Items grouped into batches of N |
| `test_json_to_csv` | unit | JSON converted to CSV |
| `test_csv_to_json` | unit | CSV parsed to JSON objects |
| `test_schema_validator_pass` | unit | Valid data passes through |
| `test_schema_validator_reject` | unit | Invalid data routed to invalid_items port |

---

## Section 7: Reliability Nodes

### Test File: `tests/test_node_executors/test_reliability.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_retry_succeeds_after_failure` | unit | Retries on error, succeeds on 2nd attempt |
| `test_retry_respects_max_retries` | unit | Stops after max_retries exceeded |
| `test_retry_exponential_backoff` | unit | Delay increases exponentially |
| `test_retry_jitter` | unit | Random jitter added to delay |
| `test_rate_limiter_allows_within_limit` | unit | Requests within rate pass through |
| `test_rate_limiter_blocks_over_limit` | unit | Excess requests await token |
| `test_circuit_breaker_closed` | unit | Normal operation passes through |
| `test_circuit_breaker_opens_on_failures` | unit | Trips after failure_threshold |
| `test_circuit_breaker_half_open_recovery` | unit | Allows one request after recovery_timeout |
| `test_idempotency_dedup` | unit | Duplicate input returns cached result |
| `test_idempotency_different_input` | unit | Different input executes normally |
| `test_dlq_stores_failed_item` | integration | Failed item stored in DLQ table |
| `test_dlq_reprocess` | integration | DLQ item reprocessed successfully |
| `test_checkpoint_creates_named` | integration | Named checkpoint created in PostgreSQL |

---

## Section 8: Security Nodes

### Test File: `tests/test_node_executors/test_security.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_secrets_vault_retrieves` | unit | Secret decrypted and returned |
| `test_secrets_vault_never_logged` | unit | Secret value not in audit_trail |
| `test_secrets_scrubbed_from_state` | unit | `__secret__` values removed from node_outputs |
| `test_rbac_allows_admin` | unit | Admin role passes permission check |
| `test_rbac_blocks_viewer` | unit | Viewer role blocked for edit permission |
| `test_audit_log_writes` | integration | Audit event written to table |
| `test_audit_log_redacts_sensitive` | unit | Sensitive fields redacted |
| `test_structured_logging_writes` | unit | Log entry written to JSONL file |
| `test_metrics_emits` | unit | Metric stored in metrics table |
| `test_metrics_alert_triggered` | unit | Alert fired when threshold exceeded |
| `test_run_history_queries` | integration | Execution history returned |

---

## Section 9: HITL & Code Nodes

### Test File: `tests/test_node_executors/test_code_sandbox.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_python_sandbox_returns_result` | unit | Simple Python code returns value |
| `test_python_sandbox_receives_inputs` | unit | `inputs` variable available in sandbox |
| `test_python_sandbox_timeout` | unit | Long-running code killed after timeout |
| `test_python_sandbox_memory_limit` | unit | Memory-hungry code killed |
| `test_python_sandbox_blocks_os_import` | unit | `import os` raises error |
| `test_python_sandbox_blocks_subprocess` | unit | `import subprocess` blocked |
| `test_python_sandbox_blocks_network` | unit | `import socket` blocked |
| `test_python_sandbox_no_config_access` | unit | Cannot access credentials |
| `test_js_sandbox_returns_result` | unit | Simple JS code returns value |
| `test_js_sandbox_timeout` | unit | Long-running JS killed |
| `test_js_sandbox_isolated` | unit | No access to Node.js globals |

---

## Section 10: Caching System

### Test File: `tests/test_cache.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_cache_miss_executes_node` | unit | Cache miss triggers normal execution |
| `test_cache_hit_returns_cached` | unit | Cache hit returns stored result |
| `test_cache_key_normalization` | unit | Whitespace, case, key ordering normalized |
| `test_cache_ttl_expires` | unit | Cached result expires after TTL |
| `test_cache_stampede_protection` | unit | Concurrent requests for same key lock correctly |
| `test_cache_opt_out` | unit | `cache_enabled: false` bypasses cache |
| `test_cache_metrics_tracked` | unit | hit_count, miss_count incremented |

---

## Section 13: Database Schema

### Test File: `tests/test_schema.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_workflow_executions_table_exists` | integration | Table created with all columns |
| `test_dlq_table_exists` | integration | DLQ table created |
| `test_audit_events_table_exists` | integration | Audit table created |
| `test_secrets_table_encrypted` | integration | Encrypted column stores ciphertext |
| `test_policy_rules_table_exists` | integration | Policy rules table created |

---

## Section 14: API Endpoints

### Test File: `tests/test_api_workflows.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_compile_endpoint_success` | integration | POST /compile returns compiled manifest |
| `test_compile_endpoint_validation_error` | integration | Invalid workflow returns 400 with errors |
| `test_execute_endpoint_starts` | integration | POST /execute starts workflow, returns execution_id |
| `test_stream_endpoint_sse` | integration | GET /execute/{id}/stream returns SSE events |
| `test_resume_endpoint` | integration | POST /execute/{id}/resume resumes HITL |
| `test_dlq_list` | integration | GET /dlq returns DLQ items |
| `test_dlq_reprocess` | integration | POST /dlq/{id}/reprocess triggers reprocessing |

---

## Section 16: Backward Compatibility

### Test File: `tests/test_backward_compat.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_existing_llm_call_works` | integration | LLM call node runs in new runtime |
| `test_existing_conditional_works` | integration | Conditional node branches correctly |
| `test_existing_loop_works` | integration | Loop node iterates with adapter |
| `test_existing_approval_works` | integration | Approval gate uses new interrupt |
| `test_existing_generate_image_works` | integration | Image generation node runs via adapter |
| `test_existing_workflow_json_format` | integration | Old ReactFlow JSON compiles without changes |
| `test_sse_event_format_unchanged` | integration | Frontend receives same event format |
| `test_budget_lifecycle_preserved` | integration | Reserve → finalize → rollback still works |

---

## Test Execution Order

Run tests in this order (matching implementation order):

1. `test_expression_engine.py` (no dependencies)
2. `test_langgraph_runtime.py` + `test_workflow_compiler.py` (Section 1)
3. `test_schema.py` (Section 13)
4. `test_api_workflows.py` (Section 14)
5. `test_streaming.py` (Section 2)
6. `test_hitl.py` (Section 3)
7. `test_backward_compat.py` (Section 16)
8. `test_cache.py` (Section 10)
9. `test_triggers.py` → `test_io.py` → `test_data.py` → `test_reliability.py` → `test_security.py` → `test_code_sandbox.py` (Sections 4-9)

## Coverage Requirements

- **80% minimum** across all new code (enforced by pytest-cov)
- **100% coverage** on security-critical code:
  - SSRF validation (`http_request_executor.py`)
  - SQL allowlist (`database_query_executor.py`)
  - Code sandbox (`code_executor.py`)
  - Secret scrubbing (`node_adapter.py`)
  - Expression engine security (`expression_engine.py`)
