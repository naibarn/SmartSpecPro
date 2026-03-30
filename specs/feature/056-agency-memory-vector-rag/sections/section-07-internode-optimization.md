# Section 07: Inter-Node Context Optimization

## Overview

This section reduces the inter-node context passing from 50,000 characters to 2,000 characters in `ctx.results[node_id]`. The full agent output is preserved by chunking it via `AgencyChunkService` (section-03) before truncation, so downstream nodes can retrieve detailed information through vector search (section-04/06) rather than passing the entire output through the execution context.

Before this reduction ships, the implementation should audit every direct `ctx.results[...]` consumer in the orchestrator path. Any consumer that truly needs deeper detail must switch to retriever-based access rather than relying on the old 50K prefix.

This is the critical change that eliminates the context bloat problem: in a 5-node chain, inter-node token passing drops from ~62,500 tokens to ~2,500 tokens.

**Depends on**: section-03-chunk-service (`chunk_and_store()` must be available), section-06-orchestrator-wiring (chunk service is already wired into the orchestrator post-execution flow)
**Blocks**: section-10-tests-verification

---

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/agency_orchestrator.py` | Reduce `ctx.results` truncation from 50K to 2K chars |

## Files to Read (Dependencies)

| File | What You Need From It |
|------|----------------------|
| `python-backend/app/services/agency_orchestrator.py` | Current `ctx.results[node_id]` assignment at line ~443 and the `get_context_text()` method at line ~158 |
| `python-backend/app/services/agency_chunk_service.py` | `chunk_and_store()` API (created by section-03, wired by section-06) |
| `python-backend/app/services/agency_memory_retriever.py` | `retrieve()` API -- downstream nodes use this for full detail retrieval (created by section-04, wired by section-06) |

---

## Tests (Write First)

**File**: `python-backend/tests/unit/test_internode_optimization.py` (new)

Follow existing test conventions: `@pytest.mark.asyncio`, `AsyncMock` / `MagicMock` for orchestrator internals.

### Test: `ctx.results[node_id]` is truncated to 2000 chars

```python
# Setup: Create an ExecutionContext, simulate node execution producing a 10K char result
# Assert: ctx.results[node_id] has length <= 2000
# Assert: ctx.results[node_id] == full_result[:2000]
```

### Test: full output is passed to `chunk_and_store` before truncation

```python
# Setup: Mock AgencyChunkService.chunk_and_store
# Execute: Run node that produces 10K char output
# Assert: chunk_and_store was called with the FULL 10K char output (not truncated)
# Assert: ctx.results[node_id] is 2K truncated AFTER chunk_and_store call
# This verifies ordering: chunk first, then truncate
```

### Test: `get_context_text()` still works correctly with 2000 char results

```python
# Setup: ExecutionContext with results dict containing 2000 char values
# Call: get_context_text()
# Assert: returns formatted string with "Previous Results" section
# Assert: each result in output is truncated to 200 chars (existing behavior in get_context_text)
# This confirms backward compatibility -- get_context_text already truncates to 200 chars
```

### Test: downstream nodes can retrieve full detail via retriever

```python
# Setup: Mock AgencyMemoryRetriever with stored chunks from a previous node
# Execute: Downstream node retrieves context for its task
# Assert: retriever.retrieve() returns full-detail chunks from the upstream node
# Assert: the 2K truncated ctx.results still provides quick summary context
```

### Test: short outputs (under 2000 chars) are stored unchanged

```python
# Setup: Node produces 500 char output
# Assert: ctx.results[node_id] == full 500 char result (no truncation)
```

### Test: aggregator nodes still receive correct inputs from ctx.results

```python
# Setup: Multiple upstream nodes with results in ctx.results
# Execute: _aggregate method collects upstream results
# Assert: aggregator receives the 2K truncated versions
# Assert: aggregation produces valid combined output
```

### Test: direct ctx.results consumers are covered by the audit

```python
# Setup: exercise branch, loop, guardrail, and aggregation paths that read ctx.results directly
# Assert: each path still behaves correctly with 2K results
# Assert: any path that needs more detail is routed to the retriever instead
```

---

## Implementation Details

### Change 1: Reduce truncation limit in `_execute_node()`

**File**: `python-backend/app/services/agency_orchestrator.py`
**Location**: Line ~443 (the general result assignment in `_execute_node`)

**Current code**:
```python
if result:
    # Cap result size and context growth
    ctx.results[node_id] = result[:50000] if len(result) > 50000 else result
```

**New code**:
```python
if result:
    # Cap result size -- full output is preserved in L2 vector chunks
    # (chunked by section-06 post-execution wiring before reaching this point)
    ctx.results[node_id] = result[:2000] if len(result) > 2000 else result
```

This single constant change (`50000` to `2000`) is the entire modification. The constant `2000` corresponds to approximately 500 tokens at the 4 chars/token estimation used throughout the system.

### Ordering Guarantee

The truncation in `_execute_node()` at line ~443 is the **general fallback** that runs after the node-type-specific handlers return. Section-06 wires `chunk_and_store()` calls into the ReAct executor path (line ~643) and the Autonomous executor path (line ~773), both of which execute BEFORE control returns to `_execute_node()`. This means:

1. ReAct/Autonomous executor completes, producing `result.final_answer`
2. Section-06's post-execution wiring calls `chunk_and_store(result.final_answer, ...)` with the FULL output
3. The node-specific handler sets `ctx.results[node["id"]] = result.final_answer` (full output)
4. Control returns to `_execute_node()`, which re-assigns `ctx.results[node_id] = result[:2000]`

Step 4 overwrites step 3 with the truncated version. The full output was already chunked in step 2.

**Important**: The node-specific assignments at lines ~643 and ~773 (`ctx.results[node["id"]] = result.final_answer`) do NOT need to be changed. The general handler at line ~443 runs after them and applies the truncation. However, if for clarity the implementer prefers to also truncate at lines ~643 and ~773, that is acceptable -- the line ~443 truncation is the safety net regardless.

### No changes to `get_context_text()`

The `get_context_text()` method at line ~158 already truncates each result to 200 characters:
```python
results_text = "\n".join(
    f"- {nid}: {v[:200]}" for nid, v in self.results.items()
)
```

Since `200 < 2000`, this method is completely unaffected by the change. It was already providing only brief summaries to downstream nodes that use `get_context_text()`.

### No changes to aggregator nodes

The `_aggregate()` method at line ~1582 collects raw `ctx.results[uid]` values from upstream nodes. After this change, it receives 2K char versions instead of 50K char versions. This is an improvement -- aggregators previously risked exceeding context limits when combining multiple large upstream outputs. The aggregator can use the retriever (wired by section-06) if it needs more detail.

### No changes to other `ctx.results` assignments

There are additional `ctx.results` assignments at lines ~506, ~510, ~988, and ~1579 for specific node types (handoff guardrail blocks, loop nodes, parallel fan-out). These are all caught by the general truncation at line ~443 since `_execute_node()` processes them. No individual changes needed.

---

## Backward Compatibility Analysis

| Consumer of `ctx.results` | Impact | Status |
|---------------------------|--------|--------|
| `get_context_text()` | None -- already truncates to 200 chars | Safe |
| `_aggregate()` | Receives 2K instead of 50K -- improvement | Safe |
| Trace collector | Already truncates to 500 chars at line ~454 | Safe |
| Skill call context | Uses `get_context_text()` which truncates to 200 | Safe |
| Autonomous executor | Uses `get_context_text()` for task input | Safe |
| ReAct executor | Receives `augmented_message` from orchestrator | Safe |
| Direct `ctx.results[node_id]` access | Gets 2K summary instead of 50K -- may lose detail | Mitigated by vector retrieval |

The only potential breakage is code that reads `ctx.results[node_id]` directly and expects the full output. After section-06 wiring, such code can use `AgencyMemoryRetriever.retrieve()` to get full-detail chunks from the vector store. The 2K prefix preserves the most important information (beginning of the response, which typically contains the answer/summary), but the audit above should confirm there are no hidden consumers left unaddressed.

---

## Key Design Decisions

1. **2000 chars (not 1000 or 4000)**: 2000 chars is approximately 500 tokens, matching the `CHUNK_SIZE` in `AgencyChunkService`. This provides a meaningful summary while keeping inter-node token passing at ~500 tokens per node instead of ~12,500.

2. **Truncation, not summarization**: Simple prefix truncation (`result[:2000]`) is used instead of LLM-based summarization. This is deterministic, zero-latency, and the full detail is available in L2 chunks. LLM summarization would add cost and latency for every node execution.

3. **Single-line change**: The implementation is deliberately minimal -- one constant change. The infrastructure for preserving full output (chunking) is handled by sections 03 and 06.

4. **No feature flag**: This optimization is tightly coupled with the chunking infrastructure from section-06. If chunking is active, truncation should also be active. Rolling back requires reverting both (see claude-plan.md section 13 rollback plan).

---

## Integration Notes

- **Section 03**: Provides `chunk_and_store()` which preserves full output before truncation occurs
- **Section 06**: Wires `chunk_and_store()` into the post-execution flow, ensuring it runs before the general `_execute_node()` truncation
- **Section 04**: Provides `AgencyMemoryRetriever.retrieve()` which downstream nodes use to access full-detail chunks when the 2K summary is insufficient
- **Section 10**: Integration tests should verify the full flow: agent produces output -> chunks stored -> `ctx.results` truncated -> downstream node retrieves detail via retriever
