"""Tests for agency escalation planner metadata propagation."""

import pytest

from app.api.agencies import TaskMetadata
from app.services.agency_orchestrator import ExecutionContext


class TestTaskMetadataModel:
    """TaskMetadata Pydantic model validation."""

    def test_full_metadata(self):
        meta = TaskMetadata(
            task_run_id=42,
            task_type="agency",
            execution_strategy="cheapest",
            capability_requirements={"supportsResponses": True},
            budget_class="standard",
            route_reason="agency task type",
            plan_version=1,
        )
        assert meta.task_run_id == 42
        assert meta.task_type == "agency"
        assert meta.execution_strategy == "cheapest"
        assert meta.budget_class == "standard"
        assert meta.plan_version == 1

    def test_minimal_metadata(self):
        meta = TaskMetadata()
        assert meta.task_run_id is None
        assert meta.task_type is None
        assert meta.execution_strategy is None

    def test_serialization(self):
        meta = TaskMetadata(
            task_run_id=1,
            task_type="skill",
            execution_strategy="best",
        )
        data = meta.model_dump(exclude_none=True)
        assert data == {
            "task_run_id": 1,
            "task_type": "skill",
            "execution_strategy": "best",
        }


class TestExecutionContextMetadata:
    """ExecutionContext carries task metadata and step attempts."""

    def test_default_empty_metadata(self):
        ctx = ExecutionContext("hello", "token", "tenant-1")
        assert ctx.task_metadata == {}
        assert ctx.step_attempts == []

    def test_with_task_metadata(self):
        meta = {
            "task_run_id": 99,
            "task_type": "agency",
            "execution_strategy": "fastest",
        }
        ctx = ExecutionContext("hello", "token", "tenant-1", task_metadata=meta)
        assert ctx.task_metadata["task_run_id"] == 99
        assert ctx.task_metadata["execution_strategy"] == "fastest"

    def test_step_attempts_accumulate(self):
        ctx = ExecutionContext("hello", "token", "tenant-1")
        ctx.step_attempts.append({
            "model_id": "gpt-4o",
            "provider": "openai",
            "input_tokens": 100,
            "output_tokens": 50,
            "credits_used": 3.0,
        })
        assert len(ctx.step_attempts) == 1
        assert ctx.step_attempts[0]["model_id"] == "gpt-4o"
