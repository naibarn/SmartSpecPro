Now I have all the context I need. Let me write the comprehensive Section 06 document.

# Section 06: Data Shaping & Control Nodes (10 nodes)

## Overview

This section implements 10 data shaping and control flow node executors plus the **Expression Engine** -- the shared evaluation layer that powers field references, conditions, and boolean logic across all data nodes. Together, these components transform the workflow engine from a simple sequential pipeline into a full data manipulation toolkit.

**What gets built:**

1. **Expression Engine** (`expression_engine.py`) -- safe, sandboxed expression evaluator supporting `{{node_id.field.nested}}` references, comparison operators, and boolean combinators. This is the **security-critical foundation** used by every data node.
2. **Set / Edit Fields Executor** -- set, rename, delete, or copy fields using static values or expression references.
3. **Map / Rename Fields Executor** -- bulk field renaming with configurable handling of unmapped fields.
4. **Filter Executor** -- evaluate conditions per-item and route to `matching_items` / `rejected_items` dual output ports.
5. **If (Conditional) Executor** -- replace the existing `ConditionalExecutor` with full expression-based branching.
6. **Switch / Router Executor** -- replace the existing `SwitchExecutor` with expression-aware case matching and dynamic output ports.
7. **Merge / Join Executor** -- extend the existing `MergeExecutor` with `append`, `zip`, `key_join` strategies.
8. **Split / Iterator Executor** -- split an array into individual items for downstream processing.
9. **Batch / Chunk Executor** -- group items into batches of N with optional inter-batch delay.
10. **JSON/XML/CSV Transformer Executor** -- convert between data formats using Python stdlib.
11. **Schema Validator Executor** -- validate data against JSON Schema with dual-output routing.

**Why this matters:**
- The existing data executors (`SetExecutor`, `MergeExecutor`, `ConditionalExecutor`, `SwitchExecutor`) are minimal stubs -- the `ConditionalExecutor` does nothing more than `bool(value)`, and the `SetExecutor` mutates `data.state` directly instead of returning structured output.
- Without the Expression Engine, node references like `{{node_id.field}}` are handled by a basic regex in `_resolve_inputs()` inside `node_adapter.py` (Section 1). The full engine adds array indexing, optional chaining, condition operators, and security validation.
- Filter, Split, Batch, Transformer, and Schema Validator are entirely new capabilities.

---

## Dependencies

| Dependency | Section | Nature |
|------------|---------|--------|
| `NodeExecutor` protocol, `ExecutionContext`, `NodeExecutionData` | Existing (`base.py`) | All executors implement this protocol |
| `NodeAdapter._resolve_inputs()` | Section 1 | The adapter's simplified resolver is **replaced** by calls to the Expression Engine for data nodes |
| `NodeRegistry` | Existing (`node_registry.py`) | All new node types must be registered |
| `WorkflowCompiler` conditional edges | Section 1 | If/Switch routing functions read `node_outputs[node_id]` for the routing key |
| `WorkflowState.node_outputs` | Section 1 | Expression Engine reads from `state["node_outputs"]` |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/expression_engine.py` | **CREATE** | Safe expression evaluator: field references, conditions, boolean combinators |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/set_fields_executor.py` | **CREATE** | Set / Edit Fields (replaces existing `set_executor.py`) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/map_fields_executor.py` | **CREATE** | Map / Rename Fields |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/filter_executor.py` | **CREATE** | Filter with dual-output ports |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/if_executor.py` | **CREATE** | If (Conditional) -- replaces `conditional_executor.py` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/switch_executor.py` | **CREATE** | Switch / Router -- replaces `flow_executors/switch_executor.py` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/merge_join_executor.py` | **CREATE** | Merge / Join -- replaces `merge_executor.py` with extended strategies |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/split_executor.py` | **CREATE** | Split / Iterator |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/batch_executor.py` | **CREATE** | Batch / Chunk Processor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/transformer_executor.py` | **CREATE** | JSON/XML/CSV format conversion |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/schema_validator_executor.py` | **CREATE** | JSON Schema validation with dual output |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/__init__.py` | **MODIFY** | Export all new executor classes |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register all 10 new node types |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_expression_engine.py` | **CREATE** | Expression Engine unit tests (security-critical, 100% coverage) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_data.py` | **CREATE** | Data node executor unit tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/__init__.py` | **CREATE** | Test package init |

---

## Tests (Write FIRST)

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_expression_engine.py`

This file has **100% coverage requirement** because the expression engine is security-critical.

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_simple_field_reference` | unit | `{{node1.field}}` resolves to `state["node_outputs"]["node1"]["field"]` |
| `test_nested_field_access` | unit | `{{node1.data.nested.value}}` navigates nested dicts correctly |
| `test_array_indexing` | unit | `{{node1.items[0]}}` returns first element of array |
| `test_array_indexing_out_of_bounds` | unit | `{{node1.items[99]}}` returns `None` without error |
| `test_optional_chaining` | unit | `{{node1.data?.missing}}` returns `None` instead of error |
| `test_optional_chaining_deep` | unit | `{{node1.a?.b?.c}}` returns `None` if any segment missing |
| `test_blocks_function_calls` | unit | `{{node1.field()}}` raises `ExpressionSecurityError` |
| `test_blocks_eval_exec` | unit | Expressions containing `eval`, `exec`, `import` are rejected |
| `test_blocks_dunder_access` | unit | `{{node1.__class__}}` is rejected |
| `test_blocks_globals_builtins` | unit | `{{__builtins__}}` and `{{__globals__}}` are rejected |
| `test_condition_eq` | unit | `{{node1.status}} == "active"` evaluates to `True`/`False` |
| `test_condition_neq` | unit | `!=` operator works |
| `test_condition_gt_lt` | unit | `>`, `<`, `>=`, `<=` operators work with numbers |
| `test_condition_contains` | unit | `contains` operator checks substring or list membership |
| `test_condition_starts_with` | unit | `startsWith` checks string prefix |
| `test_condition_ends_with` | unit | `endsWith` checks string suffix |
| `test_condition_matches` | unit | `matches` evaluates regex pattern |
| `test_condition_in` | unit | `in` checks membership in a list |
| `test_condition_not_in` | unit | `not_in` checks non-membership |
| `test_boolean_and` | unit | `AND` combinator requires all conditions true |
| `test_boolean_or` | unit | `OR` combinator requires at least one condition true |
| `test_boolean_not` | unit | `NOT` inverts condition result |
| `test_nested_boolean_combinators` | unit | `(A AND B) OR (NOT C)` evaluates correctly |
| `test_missing_node_reference` | unit | Reference to non-existent node returns `None` |
| `test_string_interpolation` | unit | `"Hello {{node1.name}}"` interpolates within string |
| `test_max_expression_length` | unit | Expressions > 10,000 chars rejected |
| `test_max_nesting_depth` | unit | Path depth > 20 levels rejected |

```python
"""Tests for the Expression Engine -- security-critical, 100% coverage required."""

import pytest

from app.orchestrator.expression_engine import (
    ExpressionEngine,
    ExpressionSecurityError,
    evaluate_condition,
    resolve_expression,
)


@pytest.fixture
def sample_state():
    """Sample node_outputs state for testing."""
    return {
        "node1": {
            "field": "hello",
            "status": "active",
            "count": 42,
            "data": {
                "nested": {"value": "deep_value"},
            },
            "items": ["first", "second", "third"],
            "name": "World",
            "tags": ["python", "workflow", "automation"],
        },
        "node2": {
            "result": "success",
            "score": 0.95,
        },
    }


@pytest.fixture
def engine(sample_state):
    """Expression engine instance with sample state."""
    return ExpressionEngine(node_outputs=sample_state)


class TestFieldReference:
    """Tests for {{node_id.field}} resolution."""

    def test_simple_field_reference(self, engine):
        result = engine.resolve("{{node1.field}}")
        assert result == "hello"

    def test_nested_field_access(self, engine):
        result = engine.resolve("{{node1.data.nested.value}}")
        assert result == "deep_value"

    def test_array_indexing(self, engine):
        result = engine.resolve("{{node1.items[0]}}")
        assert result == "first"

    def test_array_indexing_out_of_bounds(self, engine):
        result = engine.resolve("{{node1.items[99]}}")
        assert result is None

    def test_optional_chaining(self, engine):
        result = engine.resolve("{{node1.data?.missing}}")
        assert result is None

    def test_optional_chaining_deep(self, engine):
        result = engine.resolve("{{node1.a?.b?.c}}")
        assert result is None

    def test_missing_node_reference(self, engine):
        result = engine.resolve("{{nonexistent.field}}")
        assert result is None

    def test_string_interpolation(self, engine):
        result = engine.resolve("Hello {{node1.name}}")
        assert result == "Hello World"


class TestSecurity:
    """Security tests -- these MUST all pass. No exceptions."""

    def test_blocks_function_calls(self, engine):
        with pytest.raises(ExpressionSecurityError):
            engine.resolve("{{node1.field()}}")

    def test_blocks_eval_exec(self, engine):
        for dangerous in ["eval(", "exec(", "import ", "__import__("]:
            with pytest.raises(ExpressionSecurityError):
                engine.resolve(f"{{{{{dangerous}}}}}")

    def test_blocks_dunder_access(self, engine):
        with pytest.raises(ExpressionSecurityError):
            engine.resolve("{{node1.__class__}}")

    def test_blocks_globals_builtins(self, engine):
        for forbidden in ["__builtins__", "__globals__", "__subclasses__"]:
            with pytest.raises(ExpressionSecurityError):
                engine.resolve(f"{{{{{forbidden}}}}}")

    def test_max_expression_length(self, engine):
        long_expr = "{{node1." + "a" * 10_001 + "}}"
        with pytest.raises(ExpressionSecurityError):
            engine.resolve(long_expr)

    def test_max_nesting_depth(self, engine):
        deep_path = "{{node1." + ".a" * 25 + "}}"
        with pytest.raises(ExpressionSecurityError):
            engine.resolve(deep_path)


class TestConditionOperators:
    """Tests for condition evaluation."""

    def test_condition_eq(self, engine):
        result = engine.evaluate_condition(
            {"field": "{{node1.status}}", "operator": "==", "value": "active"}
        )
        assert result is True

    def test_condition_neq(self, engine):
        result = engine.evaluate_condition(
            {"field": "{{node1.status}}", "operator": "!=", "value": "inactive"}
        )
        assert result is True

    def test_condition_gt_lt(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.count}}", "operator": ">", "value": 10}
        )
        assert engine.evaluate_condition(
            {"field": "{{node1.count}}", "operator": "<", "value": 100}
        )
        assert engine.evaluate_condition(
            {"field": "{{node1.count}}", "operator": ">=", "value": 42}
        )
        assert engine.evaluate_condition(
            {"field": "{{node1.count}}", "operator": "<=", "value": 42}
        )

    def test_condition_contains(self, engine):
        # String contains
        assert engine.evaluate_condition(
            {"field": "{{node1.field}}", "operator": "contains", "value": "ell"}
        )
        # List contains
        assert engine.evaluate_condition(
            {"field": "{{node1.tags}}", "operator": "contains", "value": "python"}
        )

    def test_condition_starts_with(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.field}}", "operator": "startsWith", "value": "hel"}
        )

    def test_condition_ends_with(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.field}}", "operator": "endsWith", "value": "llo"}
        )

    def test_condition_matches(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.field}}", "operator": "matches", "value": r"^h\w+o$"}
        )

    def test_condition_in(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.status}}", "operator": "in", "value": ["active", "pending"]}
        )

    def test_condition_not_in(self, engine):
        assert engine.evaluate_condition(
            {"field": "{{node1.status}}", "operator": "not_in", "value": ["inactive", "deleted"]}
        )


class TestBooleanCombinators:
    """Tests for AND, OR, NOT compound conditions."""

    def test_boolean_and(self, engine):
        result = engine.evaluate_condition({
            "operator": "AND",
            "conditions": [
                {"field": "{{node1.status}}", "operator": "==", "value": "active"},
                {"field": "{{node1.count}}", "operator": ">", "value": 10},
            ],
        })
        assert result is True

    def test_boolean_or(self, engine):
        result = engine.evaluate_condition({
            "operator": "OR",
            "conditions": [
                {"field": "{{node1.status}}", "operator": "==", "value": "inactive"},
                {"field": "{{node1.count}}", "operator": ">", "value": 10},
            ],
        })
        assert result is True

    def test_boolean_not(self, engine):
        result = engine.evaluate_condition({
            "operator": "NOT",
            "condition": {"field": "{{node1.status}}", "operator": "==", "value": "inactive"},
        })
        assert result is True

    def test_nested_boolean_combinators(self, engine):
        result = engine.evaluate_condition({
            "operator": "OR",
            "conditions": [
                {
                    "operator": "AND",
                    "conditions": [
                        {"field": "{{node1.status}}", "operator": "==", "value": "active"},
                        {"field": "{{node1.count}}", "operator": ">", "value": 100},
                    ],
                },
                {
                    "operator": "NOT",
                    "condition": {"field": "{{node2.result}}", "operator": "==", "value": "failure"},
                },
            ],
        })
        # First AND is false (count=42 is not > 100)
        # Second NOT is true (result is "success", not "failure")
        # OR of [false, true] = true
        assert result is True
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_data.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_set_fields_static` | unit | Static value set on output |
| `test_set_fields_expression` | unit | `{{node_id.field}}` resolved from state |
| `test_set_fields_rename` | unit | Field rename operation works |
| `test_set_fields_delete` | unit | Field delete operation works |
| `test_set_fields_copy` | unit | Field copy operation works |
| `test_map_fields_rename` | unit | Fields renamed per mapping table |
| `test_map_fields_drop_unmapped` | unit | Unmapped fields dropped when `unmapped_handling="drop"` |
| `test_map_fields_keep_unmapped` | unit | Unmapped fields preserved when `unmapped_handling="keep"` |
| `test_filter_matches` | unit | Matching items pass to `matching_items`, rejected to `rejected_items` |
| `test_filter_empty_input` | unit | Empty array produces empty outputs |
| `test_filter_and_group` | unit | Multiple conditions with AND logic |
| `test_if_true_branch` | unit | True condition routes to `true` output port |
| `test_if_false_branch` | unit | False condition routes to `false` output port |
| `test_if_expression_condition` | unit | Complex expression evaluated as condition |
| `test_switch_routes_by_value` | unit | Cases routed to correct output ports |
| `test_switch_default_port` | unit | Unmatched value goes to `default` port |
| `test_switch_expression_cases` | unit | Case values can be expressions |
| `test_merge_append` | unit | Arrays concatenated in order |
| `test_merge_zip` | unit | Arrays zipped into pairs |
| `test_merge_deep_merge` | unit | Nested objects merged recursively |
| `test_merge_key_join` | unit | Objects joined on shared key field |
| `test_split_items` | unit | Array split into individual items |
| `test_split_preserves_metadata` | unit | Index and total count included per item |
| `test_batch_chunks` | unit | Items grouped into batches of N |
| `test_batch_remainder` | unit | Final batch has remaining items (< N) |
| `test_json_to_csv` | unit | JSON array-of-objects converted to CSV string |
| `test_csv_to_json` | unit | CSV string parsed to JSON array-of-objects |
| `test_json_to_xml` | unit | JSON converted to XML string |
| `test_xml_to_json` | unit | XML string parsed to JSON |
| `test_schema_validator_pass` | unit | Valid data passes through to `valid_items` |
| `test_schema_validator_reject` | unit | Invalid data routed to `invalid_items` with error details |
| `test_schema_validator_coerce` | unit | Coerce mode converts types before validation |

```python
"""Tests for Data Shaping & Control node executors."""

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


@pytest.fixture
def context():
    """Minimal execution context for testing."""
    return ExecutionContext(
        user_id=1,
        tenant_id="test-tenant",
        workflow_id="wf-1",
        execution_id="exec-1",
        credits_available=100,
    )


def _make_data(
    node_id: str,
    node_type: str,
    config: dict,
    inputs: dict,
    state: dict | None = None,
) -> NodeExecutionData:
    """Helper to build NodeExecutionData."""
    return NodeExecutionData(
        node_id=node_id,
        node_type=node_type,
        config=config,
        inputs=inputs,
        state=state or {},
    )


# ===== Set / Edit Fields =====

class TestSetFieldsExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.set_fields_executor import (
            SetFieldsExecutor,
        )
        return SetFieldsExecutor()

    @pytest.mark.asyncio
    async def test_set_fields_static(self, executor, context):
        """Static value set on output."""
        data = _make_data("n1", "set_fields", {}, {
            "operations": [
                {"operation": "set", "field": "greeting", "value": "hello"},
            ],
            "data": {},
        })
        result = await executor.execute(data, context)
        assert result["data"]["greeting"] == "hello"

    @pytest.mark.asyncio
    async def test_set_fields_expression(self, executor, context):
        """Expression value resolved from state."""
        data = _make_data("n1", "set_fields", {}, {
            "operations": [
                {"operation": "set", "field": "name", "value": "{{upstream.user_name}}"},
            ],
            "data": {},
        }, state={"upstream": {"user_name": "Alice"}})
        result = await executor.execute(data, context)
        assert result["data"]["name"] == "Alice"


# ===== Map / Rename Fields =====

class TestMapFieldsExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.map_fields_executor import (
            MapFieldsExecutor,
        )
        return MapFieldsExecutor()

    @pytest.mark.asyncio
    async def test_map_fields_rename(self, executor, context):
        """Fields renamed per mapping table."""
        data = _make_data("n1", "map_fields", {}, {
            "mapping": {"old_name": "new_name", "first": "given_name"},
            "data": {"old_name": "value1", "first": "Alice", "untouched": "keep"},
            "unmapped_handling": "keep",
        })
        result = await executor.execute(data, context)
        assert "new_name" in result["data"]
        assert "given_name" in result["data"]
        assert "untouched" in result["data"]
        assert "old_name" not in result["data"]

    @pytest.mark.asyncio
    async def test_map_fields_drop_unmapped(self, executor, context):
        """Unmapped fields dropped when configured."""
        data = _make_data("n1", "map_fields", {}, {
            "mapping": {"old_name": "new_name"},
            "data": {"old_name": "value1", "extra": "dropped"},
            "unmapped_handling": "drop",
        })
        result = await executor.execute(data, context)
        assert "new_name" in result["data"]
        assert "extra" not in result["data"]


# ===== Filter =====

class TestFilterExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.filter_executor import (
            FilterExecutor,
        )
        return FilterExecutor()

    @pytest.mark.asyncio
    async def test_filter_matches(self, executor, context):
        """Matching items pass, rejected items on other port."""
        data = _make_data("n1", "filter", {}, {
            "items": [
                {"name": "Alice", "age": 30},
                {"name": "Bob", "age": 17},
                {"name": "Charlie", "age": 25},
            ],
            "condition": {"field": "age", "operator": ">=", "value": 18},
        })
        result = await executor.execute(data, context)
        assert len(result["matching_items"]) == 2
        assert len(result["rejected_items"]) == 1
        assert result["rejected_items"][0]["name"] == "Bob"


# ===== If (Conditional) =====

class TestIfExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.if_executor import (
            IfExecutor,
        )
        return IfExecutor()

    @pytest.mark.asyncio
    async def test_if_true_branch(self, executor, context):
        """True condition routes to true output."""
        data = _make_data("n1", "if", {}, {
            "condition": {"field": "status", "operator": "==", "value": "active"},
            "data": {"status": "active", "payload": "data"},
        }, state={})
        result = await executor.execute(data, context)
        assert result["result"] is True
        assert result["true"] is not None
        assert result["false"] is None

    @pytest.mark.asyncio
    async def test_if_false_branch(self, executor, context):
        """False condition routes to false output."""
        data = _make_data("n1", "if", {}, {
            "condition": {"field": "status", "operator": "==", "value": "active"},
            "data": {"status": "inactive", "payload": "data"},
        }, state={})
        result = await executor.execute(data, context)
        assert result["result"] is False
        assert result["true"] is None
        assert result["false"] is not None


# ===== Switch / Router =====

class TestSwitchExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.switch_executor import (
            SwitchRouterExecutor,
        )
        return SwitchRouterExecutor()

    @pytest.mark.asyncio
    async def test_switch_routes_by_value(self, executor, context):
        """Cases routed to correct ports."""
        data = _make_data("n1", "switch", {}, {
            "value": "premium",
            "cases": [
                {"match": "free", "label": "free_tier"},
                {"match": "premium", "label": "premium_tier"},
            ],
            "defaultCase": "unknown_tier",
        })
        result = await executor.execute(data, context)
        assert result["route"] == "premium_tier"

    @pytest.mark.asyncio
    async def test_switch_default_port(self, executor, context):
        """Unmatched value goes to default."""
        data = _make_data("n1", "switch", {}, {
            "value": "enterprise",
            "cases": [
                {"match": "free", "label": "free_tier"},
                {"match": "premium", "label": "premium_tier"},
            ],
            "defaultCase": "unknown_tier",
        })
        result = await executor.execute(data, context)
        assert result["route"] == "unknown_tier"


# ===== Merge / Join =====

class TestMergeJoinExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.merge_join_executor import (
            MergeJoinExecutor,
        )
        return MergeJoinExecutor()

    @pytest.mark.asyncio
    async def test_merge_append(self, executor, context):
        """Arrays concatenated."""
        data = _make_data("n1", "merge", {}, {
            "sources": [[1, 2], [3, 4], [5]],
            "strategy": "append",
        })
        result = await executor.execute(data, context)
        assert result["merged"] == [1, 2, 3, 4, 5]

    @pytest.mark.asyncio
    async def test_merge_key_join(self, executor, context):
        """Objects joined on key field."""
        data = _make_data("n1", "merge", {}, {
            "sources": [
                [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}],
                [{"id": 1, "score": 95}, {"id": 2, "score": 87}],
            ],
            "strategy": "key_join",
            "join_key": "id",
        })
        result = await executor.execute(data, context)
        assert len(result["merged"]) == 2
        alice = next(r for r in result["merged"] if r["id"] == 1)
        assert alice["name"] == "Alice"
        assert alice["score"] == 95


# ===== Split / Iterator =====

class TestSplitExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.split_executor import (
            SplitExecutor,
        )
        return SplitExecutor()

    @pytest.mark.asyncio
    async def test_split_items(self, executor, context):
        """Array split into individual items."""
        data = _make_data("n1", "split", {}, {
            "items": ["a", "b", "c"],
        })
        result = await executor.execute(data, context)
        assert result["items"] == ["a", "b", "c"]
        assert result["count"] == 3


# ===== Batch / Chunk =====

class TestBatchExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.batch_executor import (
            BatchExecutor,
        )
        return BatchExecutor()

    @pytest.mark.asyncio
    async def test_batch_chunks(self, executor, context):
        """Items grouped into batches of N."""
        data = _make_data("n1", "batch", {}, {
            "items": [1, 2, 3, 4, 5, 6, 7],
            "batch_size": 3,
        })
        result = await executor.execute(data, context)
        assert result["batches"] == [[1, 2, 3], [4, 5, 6], [7]]
        assert result["batch_count"] == 3


# ===== JSON/XML/CSV Transformer =====

class TestTransformerExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.transformer_executor import (
            TransformerExecutor,
        )
        return TransformerExecutor()

    @pytest.mark.asyncio
    async def test_json_to_csv(self, executor, context):
        """JSON converted to CSV."""
        data = _make_data("n1", "transformer", {}, {
            "source_format": "json",
            "target_format": "csv",
            "data": [
                {"name": "Alice", "age": 30},
                {"name": "Bob", "age": 25},
            ],
        })
        result = await executor.execute(data, context)
        assert "name,age" in result["output"] or "age,name" in result["output"]
        assert "Alice" in result["output"]

    @pytest.mark.asyncio
    async def test_csv_to_json(self, executor, context):
        """CSV parsed to JSON objects."""
        data = _make_data("n1", "transformer", {}, {
            "source_format": "csv",
            "target_format": "json",
            "data": "name,age\nAlice,30\nBob,25",
        })
        result = await executor.execute(data, context)
        assert len(result["output"]) == 2
        assert result["output"][0]["name"] == "Alice"


# ===== Schema Validator =====

class TestSchemaValidatorExecutor:

    @pytest.fixture
    def executor(self):
        from app.orchestrator.node_executors.data_executors.schema_validator_executor import (
            SchemaValidatorExecutor,
        )
        return SchemaValidatorExecutor()

    @pytest.mark.asyncio
    async def test_schema_validator_pass(self, executor, context):
        """Valid data passes through."""
        data = _make_data("n1", "schema_validator", {}, {
            "items": [{"name": "Alice", "age": 30}],
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                },
                "required": ["name", "age"],
            },
            "validation_mode": "strict",
        })
        result = await executor.execute(data, context)
        assert len(result["valid_items"]) == 1
        assert len(result["invalid_items"]) == 0

    @pytest.mark.asyncio
    async def test_schema_validator_reject(self, executor, context):
        """Invalid data routed to invalid_items port."""
        data = _make_data("n1", "schema_validator", {}, {
            "items": [
                {"name": "Alice", "age": 30},
                {"name": "Bob"},  # missing required "age"
            ],
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                },
                "required": ["name", "age"],
            },
            "validation_mode": "strict",
        })
        result = await executor.execute(data, context)
        assert len(result["valid_items"]) == 1
        assert len(result["invalid_items"]) == 1
        assert "errors" in result["invalid_items"][0]
```

---

## Implementation Steps

### Step 1: Create Expression Engine

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/expression_engine.py`

This is the most important file in this section. It provides safe, sandboxed expression evaluation for all data nodes and replaces the simplified `_resolve_inputs()` regex from the `NodeAdapter` (Section 1).

**Security model:**
- No `eval()`, `exec()`, `compile()` usage anywhere
- No function calls allowed in expressions
- No access to dunder attributes (`__class__`, `__globals__`, etc.)
- No access to `builtins`, `globals`, `import`
- Maximum expression length: 10,000 characters
- Maximum path nesting depth: 20 levels
- Regex patterns (for `matches` operator) compiled with `re.IGNORECASE` and timeout protection

```python
"""Expression Engine -- safe, sandboxed expression evaluator for workflow data nodes.

Syntax:
  - Field reference: {{node_id.field.nested_field}}
  - Array indexing: {{node_id.items[0]}}
  - Optional chaining: {{node_id.data?.maybe_missing}}
  - String interpolation: "Hello {{node_id.name}}, you have {{node_id.count}} items"

Condition operators (used by Filter, If, Switch):
  - Comparison: ==, !=, >, <, >=, <=
  - String: contains, startsWith, endsWith, matches (regex)
  - Membership: in, not_in

Boolean combinators:
  - AND: all conditions must be true
  - OR: at least one condition must be true
  - NOT: inverts a single condition

Security:
  - NO function calls: {{node.field()}} is rejected
  - NO eval/exec/import: blocked at parse time
  - NO dunder access: __class__, __globals__, etc. blocked
  - NO code execution: purely data lookup + comparison
"""

import re
from typing import Any

import structlog

logger = structlog.get_logger()

# Security constants
MAX_EXPRESSION_LENGTH = 10_000
MAX_NESTING_DEPTH = 20

# Pattern for {{node_id.field.path}} references
_EXPR_PATTERN = re.compile(r"\{\{(.+?)\}\}")

# Dangerous patterns that must be rejected
_FORBIDDEN_PATTERNS = re.compile(
    r"(?:"
    r"__\w+__|"          # dunder access
    r"\beval\s*\(|"      # eval()
    r"\bexec\s*\(|"      # exec()
    r"\bimport\s|"       # import
    r"__import__\s*\(|"  # __import__()
    r"\bcompile\s*\(|"   # compile()
    r"\bgetattr\s*\(|"   # getattr()
    r"\bsetattr\s*\(|"   # setattr()
    r"\bdelattr\s*\(|"   # delattr()
    r"\bglobals\s*\(|"   # globals()
    r"\blocals\s*\("     # locals()
    r")",
    re.IGNORECASE,
)

# Pattern to detect function calls: identifier followed by (
_FUNCTION_CALL_PATTERN = re.compile(r"\w+\s*\(")

# Supported condition operators
CONDITION_OPERATORS = {
    "==", "!=", ">", "<", ">=", "<=",
    "contains", "startsWith", "endsWith", "matches",
    "in", "not_in",
}

# Boolean combinators
BOOLEAN_COMBINATORS = {"AND", "OR", "NOT"}


class ExpressionSecurityError(Exception):
    """Raised when an expression contains forbidden patterns."""
    pass


class ExpressionEngine:
    """Safe expression evaluator for workflow node data.

    Args:
        node_outputs: Dict of node_id -> output dict (from WorkflowState.node_outputs).
    """

    def __init__(self, node_outputs: dict[str, Any]):
        self._outputs = node_outputs

    def resolve(self, expression: str) -> Any:
        """Resolve an expression string to its value.

        If the expression is a pure reference (e.g., "{{node1.field}}"),
        returns the resolved value directly (preserving type).

        If the expression contains text around references (string interpolation),
        returns a string with references replaced by their string values.

        Args:
            expression: The expression string to resolve.

        Returns:
            The resolved value (any type for pure references, str for interpolation).

        Raises:
            ExpressionSecurityError: If the expression contains forbidden patterns.
        """
        if not isinstance(expression, str):
            return expression

        # Security checks
        self._security_check(expression)

        # Find all {{...}} references
        matches = list(_EXPR_PATTERN.finditer(expression))

        if not matches:
            return expression

        # Pure reference (entire string is one {{...}})
        if len(matches) == 1 and matches[0].group(0) == expression.strip():
            path = matches[0].group(1).strip()
            return self._resolve_path(path)

        # String interpolation -- multiple references or text around reference
        result = expression
        for match in matches:
            path = match.group(1).strip()
            value = self._resolve_path(path)
            result = result.replace(match.group(0), str(value) if value is not None else "")

        return result

    def evaluate_condition(self, condition: dict[str, Any]) -> bool:
        """Evaluate a condition expression.

        Supports:
        - Simple conditions: {"field": "{{node1.status}}", "operator": "==", "value": "active"}
        - Boolean combinators: {"operator": "AND", "conditions": [...]}
        - NOT: {"operator": "NOT", "condition": {...}}

        Args:
            condition: Condition definition dict.

        Returns:
            Boolean result of the condition evaluation.
        """
        operator = condition.get("operator", "")

        # Boolean combinators
        if operator in BOOLEAN_COMBINATORS:
            return self._evaluate_combinator(condition)

        # Simple condition
        field_expr = condition.get("field", "")
        value = condition.get("value")

        # Resolve field reference
        if isinstance(field_expr, str):
            resolved = self.resolve(field_expr) if "{{" in field_expr else field_expr
        else:
            resolved = field_expr

        return self._compare(resolved, operator, value)

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    def _security_check(self, expression: str) -> None:
        """Validate expression against security rules."""
        if len(expression) > MAX_EXPRESSION_LENGTH:
            raise ExpressionSecurityError(
                f"Expression exceeds maximum length of {MAX_EXPRESSION_LENGTH} characters"
            )

        # Check for forbidden patterns in each reference
        for match in _EXPR_PATTERN.finditer(expression):
            inner = match.group(1)

            if _FORBIDDEN_PATTERNS.search(inner):
                raise ExpressionSecurityError(
                    f"Expression contains forbidden pattern: {inner[:100]}"
                )

            if _FUNCTION_CALL_PATTERN.search(inner):
                raise ExpressionSecurityError(
                    f"Function calls are not allowed in expressions: {inner[:100]}"
                )

            # Check nesting depth
            parts = inner.replace("?.", ".").split(".")
            if len(parts) > MAX_NESTING_DEPTH:
                raise ExpressionSecurityError(
                    f"Expression path exceeds maximum nesting depth of {MAX_NESTING_DEPTH}"
                )

    def _resolve_path(self, path: str) -> Any:
        """Resolve a dotted path like 'node1.data.nested.value' or 'node1.items[0]'.

        Supports:
        - Dot notation: node1.field.nested
        - Array indexing: node1.items[0]
        - Optional chaining: node1.data?.missing (returns None if segment missing)
        """
        # Split on dots, handling optional chaining
        segments = []
        for part in path.split("."):
            optional = part.endswith("?") or "?." in path
            # Clean the segment name
            clean = part.rstrip("?")
            segments.append((clean, "?" in part))

        if not segments:
            return None

        # First segment is the node_id
        node_id = segments[0][0]
        current = self._outputs.get(node_id)

        if current is None:
            return None

        # Navigate remaining segments
        for segment_name, is_optional in segments[1:]:
            if current is None:
                return None

            # Check for array indexing: items[0]
            array_match = re.match(r"^(\w+)\[(\d+)\]$", segment_name)
            if array_match:
                field_name = array_match.group(1)
                index = int(array_match.group(2))

                if isinstance(current, dict):
                    current = current.get(field_name)
                else:
                    return None

                if isinstance(current, (list, tuple)):
                    if 0 <= index < len(current):
                        current = current[index]
                    else:
                        return None
                else:
                    return None
            else:
                # Regular field access
                if isinstance(current, dict):
                    if segment_name in current:
                        current = current[segment_name]
                    elif is_optional:
                        return None
                    else:
                        return None
                else:
                    return None

        return current

    def _evaluate_combinator(self, condition: dict[str, Any]) -> bool:
        """Evaluate AND/OR/NOT combinators."""
        operator = condition["operator"]

        if operator == "AND":
            conditions = condition.get("conditions", [])
            return all(self.evaluate_condition(c) for c in conditions)

        elif operator == "OR":
            conditions = condition.get("conditions", [])
            return any(self.evaluate_condition(c) for c in conditions)

        elif operator == "NOT":
            inner = condition.get("condition", {})
            return not self.evaluate_condition(inner)

        return False

    def _compare(self, resolved: Any, operator: str, value: Any) -> bool:
        """Execute a comparison operation."""
        try:
            if operator == "==":
                return resolved == value
            elif operator == "!=":
                return resolved != value
            elif operator == ">":
                return float(resolved) > float(value)
            elif operator == "<":
                return float(resolved) < float(value)
            elif operator == ">=":
                return float(resolved) >= float(value)
            elif operator == "<=":
                return float(resolved) <= float(value)
            elif operator == "contains":
                if isinstance(resolved, str):
                    return str(value) in resolved
                elif isinstance(resolved, (list, tuple)):
                    return value in resolved
                return False
            elif operator == "startsWith":
                return str(resolved).startswith(str(value))
            elif operator == "endsWith":
                return str(resolved).endswith(str(value))
            elif operator == "matches":
                return bool(re.search(str(value), str(resolved)))
            elif operator == "in":
                if isinstance(value, (list, tuple)):
                    return resolved in value
                return False
            elif operator == "not_in":
                if isinstance(value, (list, tuple)):
                    return resolved not in value
                return True
            else:
                logger.warning("Unknown operator", operator=operator)
                return False
        except (TypeError, ValueError):
            return False


# ------------------------------------------------------------------
# Module-level convenience functions
# ------------------------------------------------------------------

def resolve_expression(expression: str, node_outputs: dict[str, Any]) -> Any:
    """Resolve an expression against node outputs. Convenience wrapper."""
    engine = ExpressionEngine(node_outputs)
    return engine.resolve(expression)


def evaluate_condition(condition: dict[str, Any], node_outputs: dict[str, Any]) -> bool:
    """Evaluate a condition against node outputs. Convenience wrapper."""
    engine = ExpressionEngine(node_outputs)
    return engine.evaluate_condition(condition)
```

### Step 2: Create Set / Edit Fields Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/set_fields_executor.py`

Replaces the existing `SetExecutor` (which mutates `data.state` directly). The new executor uses the Expression Engine for value resolution and supports four operations: set, rename, delete, copy.

```python
"""Set / Edit Fields Executor -- modify, rename, delete, or copy fields on a data object.

Config:
  operations: list of {operation: "set"|"rename"|"delete"|"copy", field: str, value: Any}
  data: dict -- the input data object to modify

Output:
  data: dict -- the modified data object
"""

import copy
from typing import Any

from app.orchestrator.expression_engine import ExpressionEngine
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SetFieldsExecutor:
    """Executor for Set / Edit Fields nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute field operations on input data.

        Supported operations:
        - set: Set field to a value (static or expression)
        - rename: Rename a field (old_name -> new_name via 'value')
        - delete: Remove a field
        - copy: Copy value from one field to another (source via 'value')
        """
        operations = data.inputs.get("operations", [])
        input_data = copy.deepcopy(data.inputs.get("data", {}))
        engine = ExpressionEngine(data.state)

        for op in operations:
            operation = op.get("operation", "set")
            field = op.get("field", "")
            value = op.get("value")

            if operation == "set":
                # Resolve expression if value is a string with {{}}
                if isinstance(value, str) and "{{" in value:
                    value = engine.resolve(value)
                input_data[field] = value

            elif operation == "rename":
                new_name = value
                if field in input_data and new_name:
                    input_data[new_name] = input_data.pop(field)

            elif operation == "delete":
                input_data.pop(field, None)

            elif operation == "copy":
                source_field = value
                if isinstance(source_field, str) and "{{" in source_field:
                    input_data[field] = engine.resolve(source_field)
                elif source_field in input_data:
                    input_data[field] = copy.deepcopy(input_data[source_field])

        return {"data": input_data}
```

### Step 3: Create Map / Rename Fields Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/map_fields_executor.py`

```python
"""Map / Rename Fields Executor -- bulk field renaming with unmapped field handling.

Config:
  mapping: dict[str, str] -- old_name -> new_name
  data: dict -- input data object
  unmapped_handling: "keep" | "drop" -- what to do with fields not in the mapping

Output:
  data: dict -- remapped object
"""

from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class MapFieldsExecutor:
    """Executor for Map / Rename Fields nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Apply field mapping to input data."""
        mapping = data.inputs.get("mapping", {})
        input_data = data.inputs.get("data", {})
        unmapped_handling = data.inputs.get("unmapped_handling", "keep")

        if not isinstance(mapping, dict):
            raise ValueError("mapping must be a dictionary of old_name -> new_name")

        result = {}

        for key, value in input_data.items():
            if key in mapping:
                result[mapping[key]] = value
            elif unmapped_handling == "keep":
                result[key] = value
            # If "drop", unmapped fields are simply not included

        return {"data": result}
```

### Step 4: Create Filter Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/filter_executor.py`

Dual-output port executor: `matching_items` and `rejected_items`.

```python
"""Filter Executor -- evaluate conditions per-item and route to dual output ports.

Config:
  items: list[dict] -- input items to filter
  condition: dict -- condition expression (field, operator, value) or combinator
  condition_logic: "AND" | "OR" -- for multiple condition groups (default AND)

Output (dual ports):
  matching_items: list[dict] -- items that pass the condition
  rejected_items: list[dict] -- items that fail the condition
"""

from typing import Any

from app.orchestrator.expression_engine import ExpressionEngine
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class FilterExecutor:
    """Executor for Filter nodes with dual-output ports."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Filter items based on condition expression."""
        items = data.inputs.get("items", [])
        condition = data.inputs.get("condition", {})

        if not isinstance(items, list):
            raise ValueError("items must be a list")

        matching = []
        rejected = []

        for item in items:
            # Build per-item node_outputs so the expression engine
            # can resolve field references against the item itself
            item_outputs = dict(data.state)
            item_outputs["_item"] = item

            # For simple field references without node prefix,
            # resolve directly against the item
            engine = ExpressionEngine(item_outputs)
            item_condition = self._resolve_item_condition(condition, item)

            if engine.evaluate_condition(item_condition):
                matching.append(item)
            else:
                rejected.append(item)

        return {
            "matching_items": matching,
            "rejected_items": rejected,
        }

    def _resolve_item_condition(
        self, condition: dict[str, Any], item: dict[str, Any]
    ) -> dict[str, Any]:
        """Resolve condition field references against the current item.

        If the field reference is a plain field name (no {{}}), resolve
        it directly from the item dict.
        """
        resolved = dict(condition)
        field = resolved.get("field", "")

        if isinstance(field, str) and "{{" not in field:
            # Plain field name -- resolve from item
            resolved["field"] = item.get(field)
            # Replace with the actual value so the engine does a direct compare
            return {
                "field": "{{_item." + field + "}}",
                "operator": resolved.get("operator", "=="),
                "value": resolved.get("value"),
            }

        return resolved
```

### Step 5: Create If (Conditional) Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/if_executor.py`

Replaces the existing `ConditionalExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/conditional_executor.py` with full expression-based condition evaluation.

```python
"""If (Conditional) Executor -- expression-based binary branching.

Config:
  condition: dict -- condition expression (field, operator, value) or combinator
  data: Any -- data to pass through to the selected branch

Output (dual ports):
  result: bool -- the condition evaluation result (used by routing function)
  true: Any -- data passed to true branch (None if condition is false)
  false: Any -- data passed to false branch (None if condition is true)
"""

from typing import Any

from app.orchestrator.expression_engine import ExpressionEngine
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class IfExecutor:
    """Executor for If (Conditional) nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Evaluate condition and route data to true or false branch."""
        condition = data.inputs.get("condition", {})
        passthrough_data = data.inputs.get("data")

        # Build engine with current state + inline data for field references
        outputs = dict(data.state)
        if isinstance(passthrough_data, dict):
            outputs["_self"] = passthrough_data

        engine = ExpressionEngine(outputs)

        # If condition is a simple boolean-like value (backward compat)
        if not isinstance(condition, dict):
            result = bool(condition)
        else:
            # Resolve field references against inline data if no node prefix
            resolved_condition = self._resolve_inline_fields(condition, passthrough_data)
            result = engine.evaluate_condition(resolved_condition)

        return {
            "result": result,
            "true": passthrough_data if result else None,
            "false": passthrough_data if not result else None,
        }

    def _resolve_inline_fields(
        self, condition: dict[str, Any], inline_data: Any
    ) -> dict[str, Any]:
        """If field is a plain name (no {{}}), wrap it as {{_self.field}}."""
        resolved = dict(condition)
        field = resolved.get("field", "")

        if isinstance(field, str) and "{{" not in field and isinstance(inline_data, dict):
            resolved["field"] = "{{_self." + field + "}}"

        # Recurse into sub-conditions for combinators
        if "conditions" in resolved:
            resolved["conditions"] = [
                self._resolve_inline_fields(c, inline_data)
                for c in resolved["conditions"]
            ]
        if "condition" in resolved and isinstance(resolved["condition"], dict):
            resolved["condition"] = self._resolve_inline_fields(
                resolved["condition"], inline_data
            )

        return resolved
```

### Step 6: Create Switch / Router Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/switch_executor.py`

Replaces the existing `SwitchExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/flow_executors/switch_executor.py`. The key output change is the `route` field, which the `WorkflowCompiler`'s conditional edge routing function reads from `node_outputs[node_id]["route"]`.

```python
"""Switch / Router Executor -- multi-way branching based on value matching.

Config:
  value: Any -- value to match against cases (can be expression)
  cases: list[dict] -- [{match: value, label: port_name}, ...]
  defaultCase: str -- port name for unmatched values

Output:
  route: str -- the matched case label (used by compiler routing function)
  matched: str -- same as route (for backward compatibility)
  value: Any -- the original input value
"""

from typing import Any

from app.orchestrator.expression_engine import ExpressionEngine
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SwitchRouterExecutor:
    """Executor for Switch / Router nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Match value against cases and return the routing label."""
        value = data.inputs.get("value")
        cases = data.inputs.get("cases", [])
        default_case = data.inputs.get("defaultCase", "default")

        if not isinstance(cases, list):
            raise ValueError("cases must be a list")

        # Resolve value if it's an expression
        engine = ExpressionEngine(data.state)
        if isinstance(value, str) and "{{" in value:
            value = engine.resolve(value)

        # Try to match against cases
        matched_label = default_case
        for case in cases:
            if not isinstance(case, dict):
                continue
            case_match = case.get("match")
            case_label = case.get("label", default_case)

            # Resolve case match value if expression
            if isinstance(case_match, str) and "{{" in case_match:
                case_match = engine.resolve(case_match)

            if case_match == value:
                matched_label = case_label
                break

        return {
            "route": matched_label,
            "matched": matched_label,
            "value": value,
        }
```

### Step 7: Create Merge / Join Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/merge_join_executor.py`

Extends the existing `MergeExecutor` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/merge_executor.py` with `append`, `zip`, `deep_merge`, and `key_join` strategies.

```python
"""Merge / Join Executor -- combine multiple data sources with various strategies.

Config:
  sources: list -- list of data sources (arrays or dicts)
  strategy: "append" | "zip" | "deep_merge" | "key_join"
  join_key: str -- key field for key_join strategy

Output:
  merged: list | dict -- the merged result
"""

import copy
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class MergeJoinExecutor:
    """Executor for Merge / Join nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Merge data sources using the specified strategy."""
        sources = data.inputs.get("sources", [])
        strategy = data.inputs.get("strategy", "append")
        join_key = data.inputs.get("join_key", "id")

        if not isinstance(sources, list):
            raise ValueError("sources must be a list")

        valid_strategies = {"append", "zip", "deep_merge", "key_join", "overwrite", "keep_first"}
        if strategy not in valid_strategies:
            raise ValueError(f"Invalid merge strategy: {strategy}. Must be one of {valid_strategies}")

        if strategy == "append":
            return {"merged": self._append(sources)}
        elif strategy == "zip":
            return {"merged": self._zip(sources)}
        elif strategy == "deep_merge":
            return {"merged": self._deep_merge(sources)}
        elif strategy == "key_join":
            return {"merged": self._key_join(sources, join_key)}
        elif strategy == "overwrite":
            return {"merged": self._overwrite(sources)}
        elif strategy == "keep_first":
            return {"merged": self._keep_first(sources)}

        return {"merged": []}

    def _append(self, sources: list) -> list:
        """Concatenate arrays."""
        result = []
        for source in sources:
            if isinstance(source, list):
                result.extend(source)
            elif source is not None:
                result.append(source)
        return result

    def _zip(self, sources: list) -> list[list]:
        """Zip arrays into tuples/lists of paired elements."""
        arrays = [s for s in sources if isinstance(s, list)]
        if not arrays:
            return []
        return [list(group) for group in zip(*arrays)]

    def _deep_merge(self, sources: list) -> dict:
        """Recursively merge dictionaries."""
        result: dict = {}
        for source in sources:
            if not isinstance(source, dict):
                continue
            for key, value in source.items():
                if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                    result[key] = self._deep_merge([result[key], value])
                else:
                    result[key] = copy.deepcopy(value)
        return result

    def _key_join(self, sources: list, join_key: str) -> list[dict]:
        """Join arrays of objects on a shared key field."""
        if not sources:
            return []

        # Build index from first source
        index: dict[Any, dict] = {}

        for source in sources:
            if not isinstance(source, list):
                continue
            for item in source:
                if not isinstance(item, dict):
                    continue
                key_value = item.get(join_key)
                if key_value is not None:
                    if key_value in index:
                        index[key_value].update(item)
                    else:
                        index[key_value] = copy.deepcopy(item)

        return list(index.values())

    def _overwrite(self, sources: list) -> dict:
        """Last value wins for each key (backward compat with existing MergeExecutor)."""
        result = {}
        for source in sources:
            if isinstance(source, dict):
                result.update(source)
        return result

    def _keep_first(self, sources: list) -> dict:
        """First value wins for each key."""
        result = {}
        for source in sources:
            if isinstance(source, dict):
                for key, value in source.items():
                    if key not in result:
                        result[key] = value
        return result
```

### Step 8: Create Split / Iterator Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/split_executor.py`

```python
"""Split / Iterator Executor -- split an array into individual items.

Config:
  items: list -- array to split
  field: str (optional) -- field name within input data containing the array

Output:
  items: list -- the individual items (each will be processed by downstream nodes)
  count: int -- total number of items
  indices: list[int] -- item indices for tracking
"""

from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SplitExecutor:
    """Executor for Split / Iterator nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Split array into individual items."""
        items = data.inputs.get("items")
        field = data.inputs.get("field")

        # If a field is specified, extract from data
        if field and isinstance(items, dict):
            items = items.get(field, [])

        if not isinstance(items, list):
            raise ValueError("items must be a list (or specify 'field' to extract from dict)")

        return {
            "items": items,
            "count": len(items),
            "indices": list(range(len(items))),
        }
```

### Step 9: Create Batch / Chunk Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/batch_executor.py`

```python
"""Batch / Chunk Executor -- group items into batches of N.

Config:
  items: list -- input array
  batch_size: int -- number of items per batch
  delay_ms: int (optional) -- delay between batches in milliseconds (for rate limiting)

Output:
  batches: list[list] -- list of batches
  batch_count: int -- number of batches
"""

from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class BatchExecutor:
    """Executor for Batch / Chunk Processor nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Group items into batches of N."""
        items = data.inputs.get("items", [])
        batch_size = int(data.inputs.get("batch_size", 10))
        # delay_ms is stored in config for downstream rate-limiting use
        # but not applied here (applied by Batch middleware or iterator)

        if not isinstance(items, list):
            raise ValueError("items must be a list")

        if batch_size < 1:
            raise ValueError("batch_size must be at least 1")

        batches = [
            items[i : i + batch_size]
            for i in range(0, len(items), batch_size)
        ]

        return {
            "batches": batches,
            "batch_count": len(batches),
            "total_items": len(items),
        }
```

### Step 10: Create JSON/XML/CSV Transformer Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/transformer_executor.py`

Uses Python stdlib only: `json`, `csv`, `xml.etree.ElementTree`. No external dependencies.

```python
"""JSON/XML/CSV Transformer Executor -- convert between data formats.

Config:
  data: Any -- input data (string or structured)
  source_format: "json" | "csv" | "xml"
  target_format: "json" | "csv" | "xml"
  options: dict (optional) -- {delimiter, encoding, root_element}

Output:
  output: Any -- transformed data (string for csv/xml, list/dict for json)
  format: str -- the target format
"""

import csv
import io
import json
import xml.etree.ElementTree as ET
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class TransformerExecutor:
    """Executor for JSON/XML/CSV format transformation nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Transform data between formats."""
        input_data = data.inputs.get("data")
        source_format = data.inputs.get("source_format", "json")
        target_format = data.inputs.get("target_format", "json")
        options = data.inputs.get("options", {})

        supported = {"json", "csv", "xml"}
        if source_format not in supported:
            raise ValueError(f"Unsupported source format: {source_format}")
        if target_format not in supported:
            raise ValueError(f"Unsupported target format: {target_format}")

        # Step 1: Parse source to intermediate Python structure
        intermediate = self._parse(input_data, source_format, options)

        # Step 2: Serialize to target format
        output = self._serialize(intermediate, target_format, options)

        return {
            "output": output,
            "format": target_format,
        }

    def _parse(self, data: Any, fmt: str, options: dict) -> Any:
        """Parse input data from source format to Python objects."""
        if fmt == "json":
            if isinstance(data, str):
                return json.loads(data)
            return data  # Already Python object

        elif fmt == "csv":
            if not isinstance(data, str):
                raise ValueError("CSV input must be a string")
            delimiter = options.get("delimiter", ",")
            reader = csv.DictReader(io.StringIO(data), delimiter=delimiter)
            return [dict(row) for row in reader]

        elif fmt == "xml":
            if not isinstance(data, str):
                raise ValueError("XML input must be a string")
            root = ET.fromstring(data)
            return self._xml_to_dict(root)

        return data

    def _serialize(self, data: Any, fmt: str, options: dict) -> Any:
        """Serialize Python objects to target format."""
        if fmt == "json":
            return data  # Return as Python objects (serialized by the adapter)

        elif fmt == "csv":
            if not isinstance(data, list):
                raise ValueError("CSV output requires a list of dicts")
            if not data:
                return ""
            delimiter = options.get("delimiter", ",")
            output = io.StringIO()
            fieldnames = list(data[0].keys()) if data else []
            writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=delimiter)
            writer.writeheader()
            writer.writerows(data)
            return output.getvalue()

        elif fmt == "xml":
            root_element = options.get("root_element", "root")
            return self._dict_to_xml(data, root_element)

        return data

    def _xml_to_dict(self, element: ET.Element) -> dict | list:
        """Convert XML element to dict."""
        result: dict[str, Any] = {}

        # Attributes
        if element.attrib:
            result["@attributes"] = dict(element.attrib)

        # Children
        children: dict[str, list] = {}
        for child in element:
            tag = child.tag
            child_data = self._xml_to_dict(child)
            if tag in children:
                children[tag].append(child_data)
            else:
                children[tag] = [child_data]

        # Flatten single-item lists
        for tag, items in children.items():
            result[tag] = items if len(items) > 1 else items[0]

        # Text content
        if element.text and element.text.strip():
            if result:
                result["#text"] = element.text.strip()
            else:
                return element.text.strip()

        return result

    def _dict_to_xml(self, data: Any, tag: str = "root") -> str:
        """Convert dict to XML string."""
        root = self._build_xml_element(data, tag)
        return ET.tostring(root, encoding="unicode")

    def _build_xml_element(self, data: Any, tag: str) -> ET.Element:
        """Recursively build XML element from data."""
        element = ET.Element(tag)

        if isinstance(data, dict):
            for key, value in data.items():
                if key == "@attributes":
                    element.attrib.update(value)
                elif key == "#text":
                    element.text = str(value)
                elif isinstance(value, list):
                    for item in value:
                        child = self._build_xml_element(item, key)
                        element.append(child)
                else:
                    child = self._build_xml_element(value, key)
                    element.append(child)
        elif isinstance(data, list):
            for item in data:
                child = self._build_xml_element(item, "item")
                element.append(child)
        else:
            element.text = str(data) if data is not None else ""

        return element
```

### Step 11: Create Schema Validator Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/schema_validator_executor.py`

Uses `jsonschema` for JSON Schema validation (already available in the Python environment). Dual-output ports: `valid_items` and `invalid_items`.

```python
"""Schema Validator Executor -- validate data against JSON Schema.

Config:
  items: list[dict] -- items to validate
  schema: dict -- JSON Schema definition
  validation_mode: "strict" | "coerce" -- strict rejects, coerce attempts type conversion
  on_failure: "reject" | "annotate" -- reject routes to invalid_items, annotate adds errors inline

Output (dual ports):
  valid_items: list[dict] -- items that pass validation
  invalid_items: list[dict] -- items that fail, with 'errors' field added
"""

from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SchemaValidatorExecutor:
    """Executor for Schema Validator nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Validate items against JSON Schema."""
        items = data.inputs.get("items", [])
        schema = data.inputs.get("schema", {})
        validation_mode = data.inputs.get("validation_mode", "strict")
        on_failure = data.inputs.get("on_failure", "reject")

        if not isinstance(items, list):
            # Wrap single item in list
            items = [items] if items is not None else []

        try:
            import jsonschema
        except ImportError:
            raise RuntimeError(
                "jsonschema package is required for Schema Validator. "
                "Install with: pip install jsonschema"
            )

        valid_items = []
        invalid_items = []

        for item in items:
            # Optionally coerce types before validation
            check_item = item
            if validation_mode == "coerce":
                check_item = self._coerce_types(item, schema)

            errors = self._validate_item(check_item, schema)

            if not errors:
                valid_items.append(check_item)
            else:
                if on_failure == "annotate":
                    annotated = dict(check_item) if isinstance(check_item, dict) else {"_value": check_item}
                    annotated["_validation_errors"] = errors
                    valid_items.append(annotated)
                else:  # reject
                    invalid_entry = dict(item) if isinstance(item, dict) else {"_value": item}
                    invalid_entry["errors"] = errors
                    invalid_items.append(invalid_entry)

        return {
            "valid_items": valid_items,
            "invalid_items": invalid_items,
        }

    def _validate_item(self, item: Any, schema: dict) -> list[str]:
        """Validate a single item against JSON Schema. Returns list of error messages."""
        import jsonschema

        validator = jsonschema.Draft7Validator(schema)
        errors = list(validator.iter_errors(item))
        return [e.message for e in errors]

    def _coerce_types(self, item: Any, schema: dict) -> Any:
        """Attempt basic type coercion based on schema."""
        if not isinstance(item, dict) or not isinstance(schema, dict):
            return item

        properties = schema.get("properties", {})
        result = dict(item)

        for field, field_schema in properties.items():
            if field not in result:
                continue

            expected_type = field_schema.get("type")
            value = result[field]

            try:
                if expected_type == "integer" and not isinstance(value, int):
                    result[field] = int(value)
                elif expected_type == "number" and not isinstance(value, (int, float)):
                    result[field] = float(value)
                elif expected_type == "string" and not isinstance(value, str):
                    result[field] = str(value)
                elif expected_type == "boolean" and not isinstance(value, bool):
                    result[field] = bool(value)
            except (ValueError, TypeError):
                pass  # Leave as-is, validation will catch it

        return result
```

### Step 12: Update `__init__.py` and Node Registry

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/__init__.py`

```python
"""Data manipulation node executors."""

from app.orchestrator.node_executors.data_executors.batch_executor import BatchExecutor
from app.orchestrator.node_executors.data_executors.filter_executor import FilterExecutor
from app.orchestrator.node_executors.data_executors.if_executor import IfExecutor
from app.orchestrator.node_executors.data_executors.map_fields_executor import MapFieldsExecutor
from app.orchestrator.node_executors.data_executors.merge_join_executor import MergeJoinExecutor
from app.orchestrator.node_executors.data_executors.schema_validator_executor import SchemaValidatorExecutor
from app.orchestrator.node_executors.data_executors.set_fields_executor import SetFieldsExecutor
from app.orchestrator.node_executors.data_executors.split_executor import SplitExecutor
from app.orchestrator.node_executors.data_executors.switch_executor import SwitchRouterExecutor
from app.orchestrator.node_executors.data_executors.transformer_executor import TransformerExecutor

__all__ = [
    "BatchExecutor",
    "FilterExecutor",
    "IfExecutor",
    "MapFieldsExecutor",
    "MergeJoinExecutor",
    "SchemaValidatorExecutor",
    "SetFieldsExecutor",
    "SplitExecutor",
    "SwitchRouterExecutor",
    "TransformerExecutor",
]
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` -- Add the following registrations inside `_register_core_nodes()`, after the existing data nodes:

```python
# ===== SECTION 6: Data Shaping & Control Nodes =====

# 10. Set / Edit Fields (replaces set_variable)
self.register_node_type(
    NodeTypeSpec(
        type="set_fields",
        display_name="Set / Edit Fields",
        description="Set, rename, delete, or copy fields on a data object",
        icon="edit",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data object to modify...",
            ),
            InputSpec(
                name="operations",
                display_name="Field Operations",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default=[{"operation": "set", "field": "name", "value": ""}],
                placeholder='[{"operation":"set","field":"name","value":"{{node.field}}"}]',
            ),
        ],
        outputs=[
            OutputSpec(name="data", display_name="Modified Data", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.data_executors.set_fields_executor.SetFieldsExecutor",
    )
)

# 11. Map / Rename Fields
self.register_node_type(
    NodeTypeSpec(
        type="map_fields",
        display_name="Map / Rename Fields",
        description="Bulk rename fields with configurable unmapped handling",
        icon="arrow-right-left",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="mapping",
                display_name="Field Mapping",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default={"old_name": "new_name"},
                placeholder='{"old_field": "new_field"}',
            ),
            InputSpec(
                name="unmapped_handling",
                display_name="Unmapped Fields",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="keep",
                options=[
                    {"label": "Keep", "value": "keep"},
                    {"label": "Drop", "value": "drop"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="data", display_name="Remapped Data", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.data_executors.map_fields_executor.MapFieldsExecutor",
    )
)

# 12. Filter
self.register_node_type(
    NodeTypeSpec(
        type="filter",
        display_name="Filter",
        description="Filter items by condition with dual output (matching/rejected)",
        icon="filter",
        color="yellow",
        category="data",
        inputs=[
            InputSpec(
                name="items",
                display_name="Items",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="condition",
                display_name="Condition",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default={"field": "status", "operator": "==", "value": "active"},
            ),
        ],
        outputs=[
            OutputSpec(name="matching_items", display_name="Matching Items", data_type="array"),
            OutputSpec(name="rejected_items", display_name="Rejected Items", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.data_executors.filter_executor.FilterExecutor",
    )
)

# 13. If (Conditional) -- replaces existing 'conditional' type
self.register_node_type(
    NodeTypeSpec(
        type="if",
        display_name="If (Conditional)",
        description="Binary branching based on expression condition",
        icon="split",
        color="yellow",
        category="flow_control",
        inputs=[
            InputSpec(
                name="data",
                display_name="Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
            ),
            InputSpec(
                name="condition",
                display_name="Condition",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default={"field": "{{node.field}}", "operator": "==", "value": "expected"},
            ),
        ],
        outputs=[
            OutputSpec(name="true", display_name="True Branch", data_type="any"),
            OutputSpec(name="false", display_name="False Branch", data_type="any"),
        ],
        executor="app.orchestrator.node_executors.data_executors.if_executor.IfExecutor",
    )
)

# 14. Switch / Router -- replaces existing 'switch' type
self.register_node_type(
    NodeTypeSpec(
        type="switch_router",
        display_name="Switch / Router",
        description="Multi-way branching based on value matching",
        icon="git-branch",
        color="yellow",
        category="flow_control",
        inputs=[
            InputSpec(
                name="value",
                display_name="Value to Match",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="cases",
                display_name="Cases",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default=[
                    {"match": "value1", "label": "case_1"},
                    {"match": "value2", "label": "case_2"},
                ],
            ),
            InputSpec(
                name="defaultCase",
                display_name="Default Case",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default="default",
            ),
        ],
        outputs=[
            OutputSpec(name="route", display_name="Matched Route", data_type="text"),
            OutputSpec(name="value", display_name="Input Value", data_type="any"),
        ],
        executor="app.orchestrator.node_executors.data_executors.switch_executor.SwitchRouterExecutor",
    )
)

# 15. Merge / Join
self.register_node_type(
    NodeTypeSpec(
        type="merge_join",
        display_name="Merge / Join",
        description="Combine multiple data sources (append, zip, deep merge, key join)",
        icon="merge",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="sources",
                display_name="Data Sources",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="strategy",
                display_name="Merge Strategy",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="append",
                options=[
                    {"label": "Append (concatenate)", "value": "append"},
                    {"label": "Zip (pair elements)", "value": "zip"},
                    {"label": "Deep Merge (recursive)", "value": "deep_merge"},
                    {"label": "Key Join (SQL-like)", "value": "key_join"},
                    {"label": "Overwrite (last wins)", "value": "overwrite"},
                    {"label": "Keep First", "value": "keep_first"},
                ],
            ),
            InputSpec(
                name="join_key",
                display_name="Join Key",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default="id",
                placeholder="Field to join on (for key_join)",
            ),
        ],
        outputs=[
            OutputSpec(name="merged", display_name="Merged Data", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.data_executors.merge_join_executor.MergeJoinExecutor",
    )
)

# 16. Split / Iterator
self.register_node_type(
    NodeTypeSpec(
        type="split",
        display_name="Split / Iterator",
        description="Split an array into individual items for parallel processing",
        icon="split-square-horizontal",
        color="purple",
        category="data",
        inputs=[
            InputSpec(
                name="items",
                display_name="Array to Split",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="field",
                display_name="Field Name (optional)",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="Extract array from this field",
            ),
        ],
        outputs=[
            OutputSpec(name="items", display_name="Items", data_type="array"),
            OutputSpec(name="count", display_name="Item Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.split_executor.SplitExecutor",
    )
)

# 17. Batch / Chunk
self.register_node_type(
    NodeTypeSpec(
        type="batch",
        display_name="Batch / Chunk",
        description="Group items into batches of N for rate-limited processing",
        icon="layers",
        color="purple",
        category="data",
        inputs=[
            InputSpec(
                name="items",
                display_name="Items",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="batch_size",
                display_name="Batch Size",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 1000},
            ),
        ],
        outputs=[
            OutputSpec(name="batches", display_name="Batches", data_type="array"),
            OutputSpec(name="batch_count", display_name="Batch Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.batch_executor.BatchExecutor",
    )
)

# 18. JSON/XML/CSV Transformer
self.register_node_type(
    NodeTypeSpec(
        type="transformer",
        display_name="Format Transformer",
        description="Convert between JSON, XML, and CSV formats",
        icon="file-type",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="source_format",
                display_name="Source Format",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="json",
                options=[
                    {"label": "JSON", "value": "json"},
                    {"label": "CSV", "value": "csv"},
                    {"label": "XML", "value": "xml"},
                ],
            ),
            InputSpec(
                name="target_format",
                display_name="Target Format",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="csv",
                options=[
                    {"label": "JSON", "value": "json"},
                    {"label": "CSV", "value": "csv"},
                    {"label": "XML", "value": "xml"},
                ],
            ),
            InputSpec(
                name="options",
                display_name="Options",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                default={},
                placeholder='{"delimiter": ",", "root_element": "data"}',
            ),
        ],
        outputs=[
            OutputSpec(name="output", display_name="Transformed Data", data_type="any"),
            OutputSpec(name="format", display_name="Output Format", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.data_executors.transformer_executor.TransformerExecutor",
    )
)

# 19. Schema Validator
self.register_node_type(
    NodeTypeSpec(
        type="schema_validator",
        display_name="Schema Validator",
        description="Validate data against JSON Schema with dual output (valid/invalid)",
        icon="shield-check",
        color="green",
        category="data",
        inputs=[
            InputSpec(
                name="items",
                display_name="Items to Validate",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="schema",
                display_name="JSON Schema",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                placeholder='{"type":"object","properties":{...},"required":[...]}',
            ),
            InputSpec(
                name="validation_mode",
                display_name="Validation Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="strict",
                options=[
                    {"label": "Strict", "value": "strict"},
                    {"label": "Coerce Types", "value": "coerce"},
                ],
            ),
            InputSpec(
                name="on_failure",
                display_name="On Failure",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="reject",
                options=[
                    {"label": "Reject (route to invalid_items)", "value": "reject"},
                    {"label": "Annotate (add errors inline)", "value": "annotate"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="valid_items", display_name="Valid Items", data_type="array"),
            OutputSpec(name="invalid_items", display_name="Invalid Items", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.data_executors.schema_validator_executor.SchemaValidatorExecutor",
    )
)
```

**Important:** The `WorkflowCompiler` in Section 1 needs to recognize `"if"` and `"switch_router"` as conditional node types. Update the `CONDITIONAL_NODE_TYPES` set in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py`:

```python
CONDITIONAL_NODE_TYPES = {"conditional", "switch", "if", "switch_router"}
```

---

## Expression Engine Integration with NodeAdapter

The simplified `_resolve_inputs()` function in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` (Section 1) uses a basic regex. For data nodes, the Expression Engine supersedes it. The integration pattern is:

1. The `NodeAdapter._resolve_inputs()` continues to work for all existing nodes (backward compatibility).
2. Data node executors instantiate `ExpressionEngine(data.state)` internally when they need expression resolution.
3. A future refactor (Phase 2) may replace `_resolve_inputs()` entirely with the Expression Engine, but for Phase 1, both coexist.

This means the Expression Engine is a **library** used by executor implementations, not a replacement for the adapter's input resolution.

---

## Node Output Port Contracts

Nodes with dual-output ports require special handling in the `WorkflowCompiler`. Here is how each dual-output node integrates with the conditional edge routing:

| Node Type | Output Key for Routing | Routing Logic |
|-----------|----------------------|---------------|
| `if` | `result` (bool) | `"true"` if result is True, `"false"` otherwise |
| `switch_router` | `route` (str) | Value of `route` maps to case label -> target node |
| `filter` | N/A | Not conditional -- both outputs always populated |
| `schema_validator` | N/A | Not conditional -- both outputs always populated |

For `filter` and `schema_validator`, the dual outputs are both populated on every execution. Downstream nodes connect to either `matching_items` or `rejected_items` (or `valid_items` / `invalid_items`) and the `NodeAdapter` resolves the correct field from `node_outputs[node_id]`.

---

## Security Considerations

### Expression Engine (100% test coverage required)

The expression engine is the **primary attack surface** in this section. It processes user-provided expressions that reference workflow data. The security model is:

1. **Allowlist approach**: Only field references, array indexing, and optional chaining are permitted. Everything else is rejected.
2. **No code execution**: The engine never calls `eval()`, `exec()`, or `compile()` on user input. It uses string parsing and dictionary lookups only.
3. **Forbidden patterns**: Function calls (`()`), dunder access (`__`), import statements, and Python builtins are all rejected at parse time via regex.
4. **Bounded complexity**: Maximum expression length (10,000 chars) and nesting depth (20 levels) prevent resource exhaustion.
5. **Regex safety**: The `matches` operator compiles user-provided regex patterns. To prevent ReDoS, patterns are bounded by the expression length limit. A future improvement could add `re2` or timeout-bounded regex execution.

### Schema Validator

The `jsonschema` library is well-tested and does not execute arbitrary code. The schema itself is user-provided but only controls validation logic, not code execution.

### Transformer

XML parsing uses `xml.etree.ElementTree` from stdlib. This is safe against XXE (XML External Entity) attacks because `ElementTree` does not resolve external entities by default. However, if the project later switches to `lxml`, XXE protection must be explicitly configured.

---

## Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `jsonschema` | >=4.0 | JSON Schema validation for Schema Validator | Check `requirements.txt` -- may need to add |
| `structlog` | >=23.0 | Structured logging | Yes |

No other new packages are required. All data format handling (`json`, `csv`, `xml.etree.ElementTree`, `re`, `copy`) uses Python stdlib.

---

## Backward Compatibility

The existing executors being replaced are:

| Existing | New Replacement | Migration Strategy |
|----------|----------------|-------------------|
| `conditional_executor.ConditionalExecutor` | `data_executors.if_executor.IfExecutor` | Old `conditional` type kept in registry pointing to old executor; new `if` type uses new executor. Old type deprecated. |
| `flow_executors.switch_executor.SwitchExecutor` | `data_executors.switch_executor.SwitchRouterExecutor` | Old `switch` type kept pointing to old executor; new `switch_router` uses new executor. Old type deprecated. |
| `data_executors.set_executor.SetExecutor` | `data_executors.set_fields_executor.SetFieldsExecutor` | Old `set_variable` type kept; new `set_fields` type uses new executor. |
| `data_executors.merge_executor.MergeExecutor` | `data_executors.merge_join_executor.MergeJoinExecutor` | Old `merge_data` type kept; new `merge_join` type uses new executor. |

Existing workflows referencing old node types (`conditional`, `switch`, `set_variable`, `merge_data`) continue to work with their original executors. New workflows use the new types (`if`, `switch_router`, `set_fields`, `merge_join`). A migration utility in Section 16 (Backward Compatibility) can upgrade old workflow JSON to new types.