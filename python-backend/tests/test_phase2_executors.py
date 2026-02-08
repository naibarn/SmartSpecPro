"""Tests for Phase 2 node executors."""
import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.data_executors.merge_executor import MergeExecutor
from app.orchestrator.node_executors.data_executors.set_executor import SetExecutor
from app.orchestrator.node_executors.input_executors.form_input_executor import FormInputExecutor
from app.orchestrator.node_executors.output_executors.response_executor import ResponseExecutor
from app.orchestrator.node_executors.trigger_executors.manual_trigger_executor import ManualTriggerExecutor


@pytest.mark.asyncio
class TestManualTriggerExecutor:
    """Test manual trigger executor."""

    async def test_execute_returns_user_context(self):
        """Test that manual trigger returns userId and timestamp."""
        executor = ManualTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="trigger_1",
            node_type="manual_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert "userId" in result
        assert result["userId"] == 123
        assert "timestamp" in result
        assert "params" in result
        assert result["params"] == {}

    async def test_execute_with_trigger_params(self):
        """Test that trigger params are passed through."""
        executor = ManualTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={"trigger_params": {"key": "value"}},
        )
        data = NodeExecutionData(
            node_id="trigger_1",
            node_type="manual_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["params"] == {"key": "value"}


@pytest.mark.asyncio
class TestFormInputExecutor:
    """Test form input executor."""

    async def test_execute_returns_form_values(self):
        """Test that form values are returned."""
        executor = FormInputExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={"form_values": {"field1": "hello", "field2": 42}},
        )
        data = NodeExecutionData(
            node_id="form_1",
            node_type="form_input",
            config={},
            inputs={"fields": [{"id": "field1", "type": "text"}, {"id": "field2", "type": "number"}]},
            state={},
        )

        result = await executor.execute(data, context)

        assert "values" in result
        assert result["values"] == {"field1": "hello", "field2": 42}

    async def test_validates_required_fields(self):
        """Test that required field validation works."""
        executor = FormInputExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={"form_values": {"field1": "hello"}},
        )
        data = NodeExecutionData(
            node_id="form_1",
            node_type="form_input",
            config={},
            inputs={
                "fields": [
                    {"id": "field1", "type": "text", "required": False},
                    {"id": "field2", "label": "Field 2", "type": "text", "required": True},
                ]
            },
            state={},
        )

        with pytest.raises(ValueError, match="Required form field 'field2'"):
            await executor.execute(data, context)


@pytest.mark.asyncio
class TestResponseExecutor:
    """Test workflow response executor."""

    async def test_stores_response_in_context(self):
        """Test that response is stored in context.extra_data."""
        executor = ResponseExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="response_1",
            node_type="workflow_response",
            config={},
            inputs={"data": {"result": "success"}, "status": "success"},
            state={},
        )

        result = await executor.execute(data, context)

        assert result == {}  # Terminal node returns no outputs
        assert "workflow_response" in context.extra_data
        assert context.extra_data["workflow_response"]["data"] == {"result": "success"}
        assert context.extra_data["workflow_response"]["status"] == "success"


@pytest.mark.asyncio
class TestSetExecutor:
    """Test set variable executor."""

    async def test_sets_variable(self):
        """Test that variable is set correctly."""
        executor = SetExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        state = {}
        data = NodeExecutionData(
            node_id="set_1",
            node_type="set_variable",
            config={},
            inputs={"variableName": "myVar", "value": "hello world"},
            state=state,
        )

        result = await executor.execute(data, context)

        assert result["value"] == "hello world"
        assert "variables" in state
        assert state["variables"]["myVar"] == "hello world"

    async def test_requires_variable_name(self):
        """Test that variable name is required."""
        executor = SetExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="set_1",
            node_type="set_variable",
            config={},
            inputs={"value": "hello"},
            state={},
        )

        with pytest.raises(ValueError, match="Variable name is required"):
            await executor.execute(data, context)


@pytest.mark.asyncio
class TestMergeExecutor:
    """Test merge data executor."""

    async def test_merge_overwrite_strategy(self):
        """Test overwrite merge strategy (last wins)."""
        executor = MergeExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="merge_1",
            node_type="merge_data",
            config={},
            inputs={
                "sources": [
                    {"a": 1, "b": 2},
                    {"b": 3, "c": 4},
                ],
                "strategy": "overwrite",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["merged"] == {"a": 1, "b": 3, "c": 4}

    async def test_merge_keep_first_strategy(self):
        """Test keep_first merge strategy (first wins)."""
        executor = MergeExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="merge_1",
            node_type="merge_data",
            config={},
            inputs={
                "sources": [
                    {"a": 1, "b": 2},
                    {"b": 3, "c": 4},
                ],
                "strategy": "keep_first",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["merged"] == {"a": 1, "b": 2, "c": 4}

    async def test_merge_deep_merge_strategy(self):
        """Test deep_merge strategy (recursive merge)."""
        executor = MergeExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="merge_1",
            node_type="merge_data",
            config={},
            inputs={
                "sources": [
                    {"a": {"x": 1, "y": 2}},
                    {"a": {"y": 3, "z": 4}},
                ],
                "strategy": "deep_merge",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["merged"] == {"a": {"x": 1, "y": 3, "z": 4}}

    async def test_merge_filters_none_values(self):
        """Test that None values are filtered out."""
        executor = MergeExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="merge_1",
            node_type="merge_data",
            config={},
            inputs={
                "sources": [
                    {"a": 1},
                    None,
                    {"b": 2},
                ],
                "strategy": "overwrite",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["merged"] == {"a": 1, "b": 2}
