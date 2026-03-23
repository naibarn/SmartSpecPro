"""Tests for AutonomousPlanner, AutonomousExecutor, and AutonomousReflector."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.autonomous_executor import (
    AutonomousExecutor,
    AutonomousPlanner,
    AutonomousReflector,
    AutonomousResult,
    PlanValidationError,
    ReflectionResult,
    SubTask,
    TaskPlan,
    run_autonomous,
)
from app.services.react_executor import ReActResult


def _make_plan_response(sub_tasks, strategy="sequential"):
    """Build a mock LLM response containing a TaskPlan JSON."""
    plan = {
        "plan_id": "test-plan",
        "sub_tasks": sub_tasks,
        "strategy": strategy,
    }
    msg = MagicMock()
    msg.content = json.dumps(plan)
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _make_reflection_response(quality_score=0.9, is_complete=True, replan_focus=None):
    """Build a mock LLM response containing a ReflectionResult JSON."""
    data = {
        "quality_score": quality_score,
        "is_complete": is_complete,
        "gaps": [],
        "suggestions": [],
        "replan_focus": replan_focus,
    }
    msg = MagicMock()
    msg.content = json.dumps(data)
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


@pytest.fixture
def mock_gateway():
    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock()
    return client


# ── Planner Tests ──


@pytest.mark.asyncio
async def test_plan_decomposition(mock_gateway):
    sub_tasks = [
        {"id": "s1", "description": "Research", "depends_on": []},
        {"id": "s2", "description": "Analyze", "depends_on": ["s1"]},
        {"id": "s3", "description": "Summarize", "depends_on": ["s2"]},
    ]
    mock_gateway.chat.completions.create.return_value = _make_plan_response(sub_tasks)

    planner = AutonomousPlanner(mock_gateway, "gpt-4o", {})
    plan = await planner.plan("Do research", "context")

    assert len(plan.sub_tasks) == 3
    assert plan.sub_tasks[1].depends_on == ["s1"]


@pytest.mark.asyncio
async def test_plan_validation_empty(mock_gateway):
    mock_gateway.chat.completions.create.return_value = _make_plan_response([])

    planner = AutonomousPlanner(mock_gateway, "gpt-4o", {})
    with pytest.raises(PlanValidationError, match="at least 1"):
        await planner.plan("Do something", "context")


@pytest.mark.asyncio
async def test_plan_validation_cycle(mock_gateway):
    sub_tasks = [
        {"id": "a", "description": "A", "depends_on": ["b"]},
        {"id": "b", "description": "B", "depends_on": ["a"]},
    ]
    mock_gateway.chat.completions.create.return_value = _make_plan_response(sub_tasks)

    planner = AutonomousPlanner(mock_gateway, "gpt-4o", {})
    with pytest.raises(PlanValidationError, match="cycle"):
        await planner.plan("Do something", "context")


@pytest.mark.asyncio
async def test_plan_validation_nonexistent_agent(mock_gateway):
    sub_tasks = [
        {"id": "s1", "description": "Delegate", "depends_on": [], "execution_mode": "delegate", "delegate_to": "agent-999"},
    ]
    mock_gateway.chat.completions.create.return_value = _make_plan_response(sub_tasks)

    planner = AutonomousPlanner(mock_gateway, "gpt-4o", {"agent-1": {}})
    plan = await planner.plan("Do something", "context")

    assert plan.sub_tasks[0].execution_mode == "self"
    assert plan.sub_tasks[0].delegate_to is None


# ── Executor Tests ──


@pytest.mark.asyncio
async def test_sequential_execution():
    call_order = []

    async def mock_execute(task, context=None):
        call_order.append(task)
        return ReActResult(status="complete", final_answer=f"result-{task[:5]}", iterations=1, total_tokens=100)

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(side_effect=mock_execute)

    plan = TaskPlan(sub_tasks=[
        SubTask(id="s1", description="First"),
        SubTask(id="s2", description="Second", depends_on=["s1"]),
        SubTask(id="s3", description="Third", depends_on=["s2"]),
    ])

    executor = AutonomousExecutor(
        react_executor_factory=lambda: mock_executor,
    )

    ctx = MagicMock()
    results = await executor.execute(plan, ctx)

    assert len(results) == 3
    assert call_order[0] == "First"
    assert call_order[1] == "Second"
    assert call_order[2] == "Third"


@pytest.mark.asyncio
async def test_parallel_execution():
    import time

    async def mock_execute(task, context=None):
        await asyncio.sleep(0.05)
        return ReActResult(status="complete", final_answer=f"done", iterations=1, total_tokens=100)

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(side_effect=mock_execute)

    plan = TaskPlan(sub_tasks=[
        SubTask(id="s1", description="First"),
        SubTask(id="s2", description="ParallelA", depends_on=["s1"]),
        SubTask(id="s3", description="ParallelB", depends_on=["s1"]),
    ])

    executor = AutonomousExecutor(react_executor_factory=lambda: mock_executor)

    start = time.monotonic()
    results = await executor.execute(plan, MagicMock())
    elapsed = time.monotonic() - start

    assert len(results) == 3
    # s2 and s3 run in parallel, so total ~0.1s not ~0.15s
    assert elapsed < 0.15

import asyncio


@pytest.mark.asyncio
async def test_reflection_triggers_replan(mock_gateway):
    sub_tasks = [{"id": "s1", "description": "Do it", "depends_on": []}]
    mock_gateway.chat.completions.create.side_effect = [
        _make_plan_response(sub_tasks),  # First plan
        _make_reflection_response(0.5, False, "Try harder"),  # First reflection
        _make_plan_response(sub_tasks),  # Re-plan
        _make_reflection_response(0.95, True),  # Second reflection
    ]

    mock_react = MagicMock()
    mock_react.execute = AsyncMock(
        return_value=ReActResult(status="complete", final_answer="done", iterations=1, total_tokens=100)
    )

    with patch("app.services.react_executor.ReActExecutor", return_value=mock_react):
        result = await run_autonomous(
            task="Complex task",
            ctx=MagicMock(get_context_text=lambda: "ctx"),
            node_config={"maxPlanDepth": 3},
            gateway_client=mock_gateway,
            model_name="gpt-4o",
            available_agents={},
            tools=[],
            tool_endpoints={},
        )

    assert result.plan_versions == 2
    assert result.status == "complete"


@pytest.mark.asyncio
async def test_reflection_accepts_result(mock_gateway):
    sub_tasks = [{"id": "s1", "description": "Do it", "depends_on": []}]
    mock_gateway.chat.completions.create.side_effect = [
        _make_plan_response(sub_tasks),
        _make_reflection_response(0.9, True),
    ]

    mock_react = MagicMock()
    mock_react.execute = AsyncMock(
        return_value=ReActResult(status="complete", final_answer="great", iterations=1, total_tokens=100)
    )

    with patch("app.services.react_executor.ReActExecutor", return_value=mock_react):
        result = await run_autonomous(
            task="Simple task",
            ctx=MagicMock(get_context_text=lambda: "ctx"),
            node_config={},
            gateway_client=mock_gateway,
            model_name="gpt-4o",
            available_agents={},
            tools=[],
            tool_endpoints={},
        )

    assert result.status == "complete"
    assert result.plan_versions == 1


@pytest.mark.asyncio
async def test_delegation_depth_enforcement():
    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(
        return_value=ReActResult(status="complete", final_answer="done", iterations=1, total_tokens=100)
    )

    executor = AutonomousExecutor(
        react_executor_factory=lambda: mock_executor,
        orchestrator=MagicMock(),
    )

    ctx = MagicMock()
    ctx.delegation_depth = 3  # At MAX_DELEGATION_DEPTH

    subtask = SubTask(id="s1", description="Delegate", execution_mode="delegate", delegate_to="agent-2")
    result = await executor._execute_subtask(subtask, ctx, {})

    assert "Delegation depth limit reached" in result


@pytest.mark.asyncio
async def test_max_plan_depth_limits_replanning(mock_gateway):
    sub_tasks = [{"id": "s1", "description": "Do", "depends_on": []}]
    responses = []
    for _ in range(5):
        responses.append(_make_plan_response(sub_tasks))
        responses.append(_make_reflection_response(0.3, False, "Improve"))

    mock_gateway.chat.completions.create.side_effect = responses

    mock_react = MagicMock()
    mock_react.execute = AsyncMock(
        return_value=ReActResult(status="complete", final_answer="meh", iterations=1, total_tokens=100)
    )

    with patch("app.services.react_executor.ReActExecutor", return_value=mock_react):
        result = await run_autonomous(
            task="Hard task",
            ctx=MagicMock(get_context_text=lambda: "ctx"),
            node_config={"maxPlanDepth": 2},
            gateway_client=mock_gateway,
            model_name="gpt-4o",
            available_agents={},
            tools=[],
            tool_endpoints={},
        )

    assert result.plan_versions == 2
    assert result.status == "max_plan_depth"


@pytest.mark.asyncio
async def test_subtask_failure_recorded_not_fatal():
    call_count = 0

    async def mock_execute(task, context=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("Boom")
        return ReActResult(status="complete", final_answer="ok", iterations=1, total_tokens=100)

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(side_effect=mock_execute)

    plan = TaskPlan(sub_tasks=[
        SubTask(id="s1", description="Fails"),
        SubTask(id="s2", description="Independent"),
    ])

    executor = AutonomousExecutor(react_executor_factory=lambda: mock_executor)
    results = await executor.execute(plan, MagicMock())

    assert "failed" in results["s1"].lower() or "error" in results["s1"].lower()
    assert results["s2"] == "ok"
